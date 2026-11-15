// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { linkAiRecordFiles } from './ai-record-files';
import { normalizeIntakeAttachments, collectAiIntakeAttachments } from './ai-intake-attachments';

describe('intake file lifecycle', () => {
  const file = { url: 'https://files.test/photo.jpg', assetId: 'asset-a', entryId: 'source-a', name: 'تصویر مشتری', mimeType: 'image/jpeg' };
  it('retains an earlier screenshot through clarification, but isolates completed requests', () => {
    const messages = [{ role: 'user', metadata: { attachments: [file] } }, { role: 'assistant', content: 'چه اقدامی انجام دهم؟' }, { role: 'user', content: 'لید ثبت کن' }];
    expect(collectAiIntakeAttachments([], [], messages)).toEqual(normalizeIntakeAttachments([file]));
    expect(collectAiIntakeAttachments([], [], [...messages, { role: 'assistant', metadata: { created_records: [{ id: 'saved' }] } }])).toEqual([]);
  });
  it('preserves durable references across JSON round trips and deduplicates all file types', () => {
    const files = normalizeIntakeAttachments([file, { file }, { audio: { ...file, assetId: 'voice-a', mimeType: 'audio/webm' } },
      { url: 'blob:temporary' }, { url: 'data:image/jpeg;base64,secret' }]);
    expect(JSON.parse(JSON.stringify(files))).toEqual(files);
    expect(files.map(item => item.fileType)).toEqual(['image', 'audio']);
    expect(JSON.stringify(files)).not.toContain('base64');
  });
  const setup = (permitted = true, failSecond = false) => {
    const inserted: any[] = [];
    const read = vi.fn(async (table: string, query: any) => {
      expect(query.org_id).toBe('eq.current-org');
      if (table === 'file_assets') return [{ id: 'asset-a', target_url: file.url, display_name: file.name, mime_type: 'image/jpeg', file_type: 'image' }];
      if (query.id === 'eq.source-a') return [{ id: 'source-a', asset_id: 'asset-a', module_id: 'customers', record_id: 'customer-a' }];
      return [];
    });
    const insert = vi.fn(async (table: string, row: any) => {
      if (failSecond && row.record_id === 'lead-b') throw new Error('اتصال فایل ناموفق بود.');
      inserted.push({ table, ...row }); return [{ id: `linked-${row.record_id}` }];
    });
    return { attachments: [file], orgId: 'current-org', records: [{ module_id: 'leads', id: 'lead-a' }, { module_id: 'leads', id: 'lead-b' }],
      read, insert, inserted, canReadSource: vi.fn(async () => permitted) };
  };
  it('links existing assets to multiple records without uploading or copying bytes', async () => {
    const fixture = setup();
    const results = await linkAiRecordFiles(fixture);
    expect(results.every(item => item.success)).toBe(true);
    expect(fixture.inserted.filter(row => row.table === 'file_entries')).toHaveLength(2);
    expect(fixture.inserted.filter(row => row.table === 'record_files')).toHaveLength(2);
    expect(fixture.inserted.every(row => row.asset_id === 'asset-a')).toBe(true);
  });
  it('fails closed on source access and reports partial file failures per saved record', async () => {
    const denied = setup(false);
    expect((await linkAiRecordFiles(denied)).every(item => !item.success)).toBe(true);
    expect(denied.insert).not.toHaveBeenCalled();
    const partial = await linkAiRecordFiles(setup(true, true));
    expect(partial.map(item => item.success)).toEqual([true, false]);
  });
});
