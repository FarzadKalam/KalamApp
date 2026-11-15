export type IntakeAttachment = { name: string; url: string; mimeType: string; assetId: string | null; entryId: string | null; moduleId: string | null; recordId: string | null; fileType: string };
/** Persist references only; never persist base64 or temporary blob URLs. */
export const normalizeIntakeAttachments = (values: any[]): IntakeAttachment[] => {
  const unique = new Map<string, IntakeAttachment>();
  for (const item of values || []) {
    const file = item?.file || item?.audio || item;
    const url = String(file?.url || file?.file_url || '').trim();
    if (!/^https:\/\//i.test(url)) continue;
    const assetId = String(file.assetId || file.asset_id || '').trim() || null;
    const entryId = String(file.entryId || file.entry_id || '').trim() || null;
    const mimeType = String(file.mimeType || file.mime_type || 'application/octet-stream');
    const attachment = { name: String(file.filename || file.fileName || file.name || file.label || 'فایل پیوست'), url,
      mimeType, assetId, entryId, moduleId: file.moduleId || file.module_id || null, recordId: file.recordId || file.record_id || null,
      fileType: mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('audio/') ? 'audio' : mimeType.startsWith('video/') ? 'video' : 'file' };
    unique.set(assetId || entryId || url, attachment);
  }
  return [...unique.values()];
};
