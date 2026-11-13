import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageInstance } from 'antd/es/message/interface';
import type { NotificationInstance } from 'antd/es/notification/interface';
import { appFeedback, clearFeedback, getFeedbackSnapshot, publishNativeFeedback, runFeedbackAction, setFeedbackScope } from './appFeedback';
import { feedbackMessage, installFeedbackBridge } from './antdFeedbackBridge';
import { refineFeedbackProvider } from './refineFeedbackProvider';
import { FEEDBACK_POLICY } from './feedbackPolicy';

beforeEach(() => { clearFeedback(); setFeedbackScope('routing-org'); });
afterEach(() => clearFeedback());

describe('central delivery policy', () => {
  it('cleans up advanced native notices on scope change without double callbacks', async () => {
    const nativeMessageOpen = vi.fn();
    const nativeNotificationOpen = vi.fn();
    const nativeDestroy = vi.fn();
    const message = { ...feedbackMessage, open: nativeMessageOpen, destroy: nativeDestroy } as unknown as MessageInstance;
    const notification = { open: nativeNotificationOpen, info: nativeNotificationOpen, success: nativeNotificationOpen, error: nativeNotificationOpen, warning: nativeNotificationOpen, destroy: nativeDestroy } as NotificationInstance;
    const restore = installFeedbackBridge(message, notification);
    const onClose = vi.fn();
    const handle = message.success({ key: 'styled-message', content: 'ذخیره شد', className: 'existing-class', onClose });
    notification.open({ key: 'alert', message: 'هشدار', role: 'alert' });
    expect(nativeMessageOpen).toHaveBeenCalledOnce();
    expect(nativeNotificationOpen).toHaveBeenCalledOnce();
    expect(getFeedbackSnapshot()).toEqual([]);
    setFeedbackScope('next-org');
    expect(nativeDestroy).toHaveBeenCalledTimes(2);
    nativeMessageOpen.mock.calls[0][0].onClose();
    expect(onClose).toHaveBeenCalledOnce();
    await expect(Promise.resolve(handle)).resolves.toBe(true);
    restore();
  });
  it('shares capacity and keyed clearing between native and Sileo presentations', () => {
    const close = vi.fn();
    publishNativeFeedback({ key: 17, title: 'نمای پیشرفته' }, { show: vi.fn(), close });
    for (let index = 0; index < FEEDBACK_POLICY.maxVisible; index++) appFeedback.info(`پیام ${index}`);
    expect(close).toHaveBeenCalledOnce();
    const handle = appFeedback.info({ title: 'کلید عددی', key: 18 });
    appFeedback.clear(18);
    expect(getFeedbackSnapshot().some(item => item.id === handle.id)).toBe(false);
  });
  it('ignores a previous native revision closing after a keyed update', () => {
    const callbacks: (() => void)[] = [];
    const close = vi.fn();
    const transport = { show: (_: string, done: () => void) => callbacks.push(done), close };
    publishNativeFeedback({ key: 'same', title: 'در انتظار' }, transport);
    publishNativeFeedback({ key: 'same', title: 'آماده شد' }, transport);
    callbacks[0]();
    expect(close).not.toHaveBeenCalled();
    callbacks[1]();
    expect(close).toHaveBeenCalledOnce();
  });
  it('routes Refine undo to a Persian action without executing the mutation', async () => {
    const cancel = vi.fn();
    refineFeedbackProvider.open({ key: 'undo', type: 'progress', message: 'Undoable operation', undoableTimeout: 5, cancelMutation: cancel });
    const item = getFeedbackSnapshot()[0];
    expect(item.kind).toBe('info');
    expect(item.title).toBe(FEEDBACK_POLICY.labels.pending);
    expect(item.actions?.[0].label).toBe('انصراف');
    expect(cancel).not.toHaveBeenCalled();
    await runFeedbackAction(item.id, 'cancel-mutation');
    expect(cancel).toHaveBeenCalledOnce();
    expect(getFeedbackSnapshot()).toHaveLength(0);
  });
  it('updates Refine progress by key, removes expired undo and clears on close', () => {
    const cancel = vi.fn();
    refineFeedbackProvider.open({ key: 'undo', type: 'progress', message: 'در انتظار', undoableTimeout: 2, cancelMutation: cancel });
    const id = getFeedbackSnapshot()[0].id;
    const visualRevision = getFeedbackSnapshot()[0].visualRevision;
    refineFeedbackProvider.open({ key: 'undo', type: 'progress', message: 'در انتظار', undoableTimeout: 1, cancelMutation: cancel });
    expect(getFeedbackSnapshot()[0].visualRevision).toBe(visualRevision);
    refineFeedbackProvider.open({ key: 'undo', type: 'progress', message: 'در انتظار', undoableTimeout: 0, cancelMutation: cancel });
    expect(getFeedbackSnapshot()[0].id).toBe(id);
    expect(getFeedbackSnapshot()[0].actions).toBeUndefined();
    expect(getFeedbackSnapshot()[0].visualRevision).toBeGreaterThan(visualRevision);
    refineFeedbackProvider.close('undo');
    expect(getFeedbackSnapshot()).toHaveLength(0);
  });
  it('blocks a double action click and suppresses a late failure after switching org', async () => {
    let reject!: (error: Error) => void;
    const job = new Promise<void>((_, fail) => { reject = fail; });
    const action = vi.fn(() => job);
    const handle = appFeedback.info({ title: 'گزارش آماده است', actions: [{ key: 'open', label: 'بازکردن', onClick: action }] });
    const running = runFeedbackAction(handle.id, 'open');
    await runFeedbackAction(handle.id, 'open');
    expect(action).toHaveBeenCalledOnce();
    setFeedbackScope('another-org');
    reject(new Error('Network error'));
    await running;
    expect(getFeedbackSnapshot()).toHaveLength(0);
  });
  it('shows a Persian error when an action fails and does not erase a keyed result', async () => {
    const failed = appFeedback.info({ title: 'کار', actions: [{ key: 'fail', label: 'تلاش', onClick: () => { throw new Error('Network error'); } }] });
    await runFeedbackAction(failed.id, 'fail');
    const error = getFeedbackSnapshot().find(item => item.kind === 'error');
    expect(error?.title).toMatch(/[\u0600-\u06ff]/);
    const next = appFeedback.info({ title: 'قبلی', key: 'result', actions: [{ key: 'replace', label: 'ادامه', onClick: () => { appFeedback.success({ title: 'نتیجه', key: 'result' }); } }] });
    await runFeedbackAction(next.id, 'replace');
    expect(getFeedbackSnapshot().find(item => item.key === 'result')?.title).toBe('نتیجه');
  });
  it('does not mistake a returned notification close handle for a pending job', async () => {
    const first = appFeedback.info({ title: 'اول', actions: [{ key: 'next', label: 'ادامه', onClick: () => appFeedback.info({ title: 'بعدی', durationMs: null }) }] });
    await runFeedbackAction(first.id, 'next');
    expect(getFeedbackSnapshot().map(item => item.title)).toEqual(['بعدی']);
  });
});
