import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appFeedback, clearFeedback, feedbackShown, getFeedbackSnapshot, pauseFeedback, publishFeedback, setFeedbackScope } from './appFeedback';
import { feedbackMessage, installFeedbackBridge } from './antdFeedbackBridge';
import type { MessageInstance } from 'antd/es/message/interface';
import type { NotificationInstance } from 'antd/es/notification/interface';

beforeEach(() => { clearFeedback(); setFeedbackScope('test-feedback'); vi.useFakeTimers(); });
afterEach(() => { clearFeedback(); vi.useRealTimers(); });
describe('central feedback lifecycle', () => {
  it('keeps concurrent messages distinct and bounds rendering to three items', () => {
    const a = appFeedback.success('ثبت شد'); const b = appFeedback.error('ارسال ناموفق بود');
    expect(a.id).not.toBe(b.id);
    appFeedback.info('پیام سوم'); appFeedback.warning('پیام چهارم');
    expect(getFeedbackSnapshot()).toHaveLength(3);
    expect(getFeedbackSnapshot().some(item => item.id === a.id)).toBe(false);
  });
  it('starts expiry only after the lazy renderer has actually shown the message', async () => {
    const handle = feedbackMessage.success('ذخیره شد', 2);
    vi.advanceTimersByTime(20000);
    expect(getFeedbackSnapshot()).toHaveLength(1);
    feedbackShown(getFeedbackSnapshot()[0].id);
    vi.advanceTimersByTime(2000);
    expect(getFeedbackSnapshot()).toHaveLength(0);
    await expect(Promise.resolve(handle)).resolves.toBe(true);
  });
  it('updates loading by key without an old timer deleting its success replacement', () => {
    const first = feedbackMessage.loading({ key: 'save', content: 'در حال ذخیره', duration: 0 });
    const id = getFeedbackSnapshot()[0].id;
    feedbackShown(id);
    vi.advanceTimersByTime(60000);
    expect(getFeedbackSnapshot()).toHaveLength(1);
    feedbackMessage.success({ key: 'save', content: 'ذخیره شد', duration: 4 });
    expect(getFeedbackSnapshot()[0].id).toBe(id);
    vi.advanceTimersByTime(3999);
    expect(getFeedbackSnapshot()[0].kind).toBe('success');
    first();
    feedbackMessage.success('پیام تازه');
    vi.advanceTimersByTime(1000);
    expect(getFeedbackSnapshot()[0].title).toBe('پیام تازه');
  });
  it('pauses expiry while the user is reading or using actions', () => {
    const handle = publishFeedback({ title: 'رکورد ثبت شد', durationMs: 4000 });
    feedbackShown(handle.id); vi.advanceTimersByTime(1000);
    pauseFeedback(handle.id, true); vi.advanceTimersByTime(15000);
    expect(getFeedbackSnapshot()).toHaveLength(1);
    pauseFeedback(handle.id, false); vi.advanceTimersByTime(3000);
    expect(getFeedbackSnapshot()).toHaveLength(0);
  });
  it('clears organization messages and ignores completion of a previous organization promise', async () => {
    let resolve!: (value: string) => void;
    const job = new Promise<string>(done => { resolve = done; });
    const returned = appFeedback.promise(job, { loading: { title: 'در حال پردازش' }, success: value => ({ title: value }), error: () => ({ title: 'ناموفق بود' }) });
    expect(returned).toBe(job);
    setFeedbackScope('another-org'); resolve('نتیجهٔ سازمان قبلی'); await job;
    expect(getFeedbackSnapshot()).toEqual([]);
  });
  it('retains the public Ant Design calling convention, callbacks and rich notification fallback', async () => {
    const originalSuccess = vi.fn();
    const message = { ...feedbackMessage, success: originalSuccess, destroy: vi.fn() } as unknown as MessageInstance;
    const open = vi.fn();
    const notification = { open, success: open, error: open, info: open, warning: open, destroy: vi.fn() } as NotificationInstance;
    const restore = installFeedbackBridge(message, notification);
    const closed = vi.fn();
    const handle = message.success('ذخیره شد', closed);
    expect(originalSuccess).not.toHaveBeenCalled();
    notification.open({ message: 'تأیید لازم است', role: 'alert' });
    expect(open).toHaveBeenCalledOnce();
    handle(); await handle;
    expect(closed).toHaveBeenCalledOnce();
    restore(); expect(message.success).toBe(originalSuccess);
  });
});
