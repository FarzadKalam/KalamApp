import { normalizeIntakeAttachments } from './ai-intake-attachments.ts';

/** Reuse file assets; user RLS and source-record access must both still permit the link. */
export const linkAiRecordFiles = async (options: {
  attachments: any[]; records: any[]; orgId: string;
  read: (table: string, query: Record<string, any>) => Promise<any[]>;
  insert: (table: string, row: any) => Promise<any[]>;
  canReadSource: (moduleId: string, recordId: string) => Promise<boolean>;
}) => {
  const results: any[] = [];
  for (const record of options.records) for (const file of normalizeIntakeAttachments(options.attachments)) {
    try {
      if (!file.assetId && !file.entryId) throw new Error('این پیوست هنوز در فایل‌های داخلی ثبت نشده است.');
      const entries = await options.read('file_entries', { org_id: `eq.${options.orgId}`, is_deleted: 'eq.false',
        ...(file.entryId ? { id: `eq.${file.entryId}` } : { asset_id: `eq.${file.assetId}`, entry_type: 'eq.origin' }),
        select: 'id,asset_id,module_id,record_id', limit: 1 });
      const source = entries[0];
      if (!source || (file.assetId && file.assetId !== source.asset_id)) throw new Error('دسترسی به فایل مبدا تأیید نشد.');
      if (source.module_id && source.record_id && !await options.canReadSource(source.module_id, source.record_id)) throw new Error('دسترسی به رکورد مبدا فایل تغییر کرده است.');
      const assets = await options.read('file_assets', { org_id: `eq.${options.orgId}`, id: `eq.${source.asset_id}`,
        select: 'id,target_url,display_name,mime_type,file_type', limit: 1 });
      const asset = assets[0];
      if (!asset?.target_url) throw new Error('فایل قابل دسترسی نیست.');
      const existing = await options.read('file_entries', { org_id: `eq.${options.orgId}`, asset_id: `eq.${asset.id}`,
        module_id: `eq.${record.module_id}`, record_id: `eq.${record.id}`, is_deleted: 'eq.false', select: 'id', limit: 1 });
      const entry = existing[0] || (await options.insert('file_entries', { org_id: options.orgId, asset_id: asset.id,
        module_id: record.module_id, record_id: record.id, entry_type: 'shortcut', entry_name: asset.display_name,
        source_entry_id: source.id, source_module_id: source.module_id, source_record_id: source.record_id }))[0];
      if (!entry?.id) throw new Error('اتصال فایل ذخیره نشد.');
      const recordFiles = await options.read('record_files', { org_id: `eq.${options.orgId}`, file_entry_id: `eq.${entry.id}`, select: 'id', limit: 1 });
      if (!recordFiles.length) await options.insert('record_files', { org_id: options.orgId, module_id: record.module_id,
        record_id: record.id, asset_id: asset.id, file_entry_id: entry.id, file_url: asset.target_url,
        file_name: asset.display_name, file_type: asset.file_type, mime_type: asset.mime_type,
        entry_type: 'shortcut', is_shortcut: true, source_module_id: source.module_id, source_record_id: source.record_id });
      results.push({ record_id: record.id, name: asset.display_name || file.name, success: true });
    } catch (error) {
      results.push({ record_id: record.id, name: file.name, success: false,
        message: error instanceof Error && /[\u0600-\u06ff]/.test(error.message) ? error.message : 'اتصال فایل انجام نشد؛ رکورد ذخیره شده است.' });
    }
  }
  return results;
};
