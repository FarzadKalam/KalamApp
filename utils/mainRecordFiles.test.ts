// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { persistStagedMainRecordFiles, stageMainRecordFiles, trackMainFileUpload, waitForMainFileUploads } from './mainRecordFiles';
const { session } = vi.hoisted(() => ({ session: { orgId: 'org-a', user: { id: 'user-a' } } }));
vi.mock('./sessionCache', () => ({ fetchSessionBootstrap: async () => session }));
const file = (url: string) => ({ file_url: url, file_name: 'سند.pdf', mime_type: 'application/pdf', file_type: 'file' as const });
beforeEach(() => { sessionStorage.clear(); session.orgId = 'org-a'; });

describe('main record files', () => {
  it('preserves repeated selections and attaches all missing files once', async () => {
    await stageMainRecordFiles({}, 'delivery_forms', '', 'first', [file('first'), file('second')]);
    await stageMainRecordFiles({}, 'delivery_forms', 'first', 'third', [file('third'), file('second')]);
    expect(sessionStorage.length).toBe(1);
    const insert = vi.fn().mockResolvedValue({ error: null });
    const query: any = { select: vi.fn(() => query), eq: vi.fn(() => query), in: vi.fn().mockResolvedValue({ data: [{ file_url: 'second' }] }) };
    const client = { from: vi.fn(() => ({ ...query, insert })) };
    await persistStagedMainRecordFiles(client, 'delivery_forms', 'delivery_forms', 'third', 'saved-record');
    expect(insert.mock.calls[0][0].map((row: any) => row.file_url)).toEqual(['first', 'third']);
    expect(insert.mock.calls[0][0].every((row: any) => row.org_id === 'org-a' && row.record_id === 'saved-record')).toBe(true);
    await persistStagedMainRecordFiles(client, 'delivery_forms', 'delivery_forms', 'third', 'saved-record');
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('does not attach another organization’s draft', async () => {
    await stageMainRecordFiles({}, 'delivery_forms', '', 'first', [file('first')]);
    session.orgId = 'org-b';
    const client = { from: vi.fn() };
    await persistStagedMainRecordFiles(client, 'delivery_forms', 'delivery_forms', 'first', 'record');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('retains files when attachment registration fails', async () => {
    await stageMainRecordFiles({}, 'delivery_forms', '', 'first', [file('first')]);
    const query: any = { select: vi.fn(() => query), eq: vi.fn(() => query), in: vi.fn().mockResolvedValue({ error: new Error('network') }) };
    await expect(persistStagedMainRecordFiles({ from: () => query }, 'delivery_forms', 'delivery_forms', 'first', 'record')).rejects.toThrow('network');
    expect(sessionStorage.length).toBeGreaterThan(0);
  });

  it('waits for batch uploads before saving', async () => {
    let finish!: () => void;
    trackMainFileUpload({}, 'delivery_forms', new Promise<void>((resolve) => { finish = resolve; }));
    let saved = false;
    const waiting = waitForMainFileUploads({}, 'delivery_forms').then(() => { saved = true; });
    await Promise.resolve();
    expect(saved).toBe(false);
    finish();
    await waiting;
    expect(saved).toBe(true);
  });
});
