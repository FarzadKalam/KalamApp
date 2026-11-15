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

/** Continue the most recent file turn, without borrowing files from completed work. */
export const collectAiIntakeAttachments = (current: any[], pending: any[], messages: any[]) => {
  const supplied = normalizeIntakeAttachments([...pending, ...current]);
  if (supplied.length) return supplied;
  for (const message of [...messages].reverse()) {
    if (message.metadata?.created_records?.length || message.metadata?.updated_records?.length) break;
    if (message.role !== 'user' || message.metadata?.internal_agent_step) continue;
    const files = normalizeIntakeAttachments([...(message.metadata?.attachments || []), ...(message.metadata?.files || []), message.metadata?.file].filter(Boolean));
    if (files.length) return files;
  }
  return [];
};
