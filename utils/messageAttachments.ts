import { resolveNoteAttachmentFileType, type NoteAttachment } from './noteContent';

type BotMessageLike = {
  file_url?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  payload?: Record<string, any> | null;
};

const normalizeText = (value: unknown) => String(value || '').trim();

const normalizeAttachment = (value: any): NoteAttachment | null => {
  const url = normalizeText(value?.url || value?.file_url);
  if (!url) return null;
  const fallbackName = normalizeText(url.split('?')[0].split('#')[0].split('/').pop()) || 'فایل';
  return {
    name: normalizeText(value?.name || value?.file_name) || fallbackName,
    url,
    mimeType: normalizeText(value?.mimeType || value?.mime_type) || null,
    fileType: resolveNoteAttachmentFileType(value),
    assetId: normalizeText(value?.assetId || value?.asset_id) || null,
    entryId: normalizeText(value?.entryId || value?.entry_id) || null,
    moduleId: normalizeText(value?.moduleId || value?.module_id) || null,
    recordId: normalizeText(value?.recordId || value?.record_id) || null,
  };
};

const collectNestedAttachmentLikes = (root: unknown) => {
  const results: any[] = [];
  const seen = new Set<any>();
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) {
      current.forEach((item) => stack.push(item));
      continue;
    }
    const item = current as Record<string, any>;
    const url = normalizeText(item.url || item.file_url || item.media_url || item.download_url || item.link_url);
    const hasFileMeta = Boolean(
      normalizeText(item.file_id || item.fileId)
      || normalizeText(item.mime_type || item.mimeType)
      || normalizeText(item.file_name || item.fileName || item.name)
    );
    if (url && hasFileMeta) {
      results.push({
        url,
        name: item.name || item.file_name || item.fileName,
        mimeType: item.mimeType || item.mime_type,
        fileType: item.fileType || item.file_type,
        assetId: item.assetId || item.asset_id,
        entryId: item.entryId || item.entry_id,
        moduleId: item.moduleId || item.module_id,
        recordId: item.recordId || item.record_id,
      });
    }
    Object.values(item).forEach((value) => {
      if (value && typeof value === 'object') stack.push(value);
    });
  }

  return results;
};

export const dedupeAttachments = (items: Array<NoteAttachment | null | undefined>): NoteAttachment[] => {
  const byUrl = new Map<string, NoteAttachment>();
  (items || []).forEach((item) => {
    const normalized = normalizeAttachment(item);
    if (!normalized) return;
    if (!byUrl.has(normalized.url)) {
      byUrl.set(normalized.url, normalized);
      return;
    }
    const existing = byUrl.get(normalized.url)!;
    byUrl.set(normalized.url, {
      ...existing,
      ...normalized,
      name: normalized.name || existing.name,
      mimeType: normalized.mimeType || existing.mimeType || null,
      fileType: normalized.fileType || existing.fileType || null,
      assetId: normalized.assetId || existing.assetId || null,
      entryId: normalized.entryId || existing.entryId || null,
      moduleId: normalized.moduleId || existing.moduleId || null,
      recordId: normalized.recordId || existing.recordId || null,
    });
  });
  return Array.from(byUrl.values());
};

export const extractBotMessageAttachments = (row: BotMessageLike | null | undefined): NoteAttachment[] => {
  const list: Array<NoteAttachment | null> = [];
  list.push(normalizeAttachment({
    url: row?.file_url,
    name: row?.file_name,
    mimeType: row?.mime_type,
    fileType: (row as any)?.message_type,
  }));

  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  list.push(normalizeAttachment({
    url: (payload as any)?.media_url || (payload as any)?.file_url,
    name: (payload as any)?.file_name || row?.file_name,
    mimeType: (payload as any)?.mime_type || row?.mime_type,
    fileType: (payload as any)?.file_type || (row as any)?.message_type,
  }));

  const payloadAttachments = Array.isArray((payload as any)?.attachments) ? (payload as any).attachments : [];
  payloadAttachments.forEach((item: any) => {
    list.push(normalizeAttachment(item));
  });
  collectNestedAttachmentLikes(payload).forEach((item) => {
    list.push(normalizeAttachment(item));
  });

  return dedupeAttachments(list);
};
