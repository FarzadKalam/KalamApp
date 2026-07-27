import { resolveNoteAttachmentFileType, type NoteAttachment } from './noteContent';
import { normalizePublicAssetUrl } from './assetUrl';

type BotMessageLike = {
  file_url?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  payload?: Record<string, any> | null;
};

export type BotMediaFileRef = {
  fileId: string;
  fileName: string | null;
  fileType: string | null;
  url: string | null;
};

const normalizeText = (value: unknown) => String(value || '').trim();

const normalizeRenderableUrl = (value: unknown) => {
  const url = normalizeText(value);
  if (!url) return '';
  return normalizePublicAssetUrl(url)
    || url.replace(/^http:\/\/api\.tazesystem\.ir\//i, 'https://api.tazesystem.ir/');
};

const normalizeAttachment = (value: any): NoteAttachment | null => {
  const url = normalizeRenderableUrl(value?.url || value?.file_url || value?.media_url || value?.download_url || value?.link_url);
  if (!url) return null;
  const fallbackName = normalizeText(url.split('?')[0].split('#')[0].split('/').pop()) || 'فایل';
  return {
    name: normalizeText(value?.name || value?.file_name || value?.fileName || value?.filename || value?.original_name || value?.title) || fallbackName,
    url,
    mimeType: normalizeText(value?.mimeType || value?.mime_type) || null,
    fileType: resolveNoteAttachmentFileType({
      ...value,
      fileType: value?.fileType || value?.file_type || value?.media_type || value?.kind || value?.type,
    }),
    assetId: normalizeText(value?.assetId || value?.asset_id) || null,
    entryId: normalizeText(value?.entryId || value?.entry_id) || null,
    moduleId: normalizeText(value?.moduleId || value?.module_id) || null,
    recordId: normalizeText(value?.recordId || value?.record_id) || null,
  };
};

const collectNestedAttachmentLikes = (root: unknown) => {
  const results: any[] = [];
  const seen = new Set<any>();
  const stack: Array<{ node: unknown; hint?: string | null }> = [{ node: root, hint: null }];

  while (stack.length > 0) {
    const currentEntry = stack.pop();
    const current = currentEntry?.node;
    const hint = currentEntry?.hint || null;
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) {
      current.forEach((item) => stack.push({ node: item, hint }));
      continue;
    }
    const item = current as Record<string, any>;
    const url = normalizeRenderableUrl(item.url || item.file_url || item.media_url || item.download_url || item.link_url);
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
        fileType: item.fileType || item.file_type || hint,
        assetId: item.assetId || item.asset_id,
        entryId: item.entryId || item.entry_id,
        moduleId: item.moduleId || item.module_id,
        recordId: item.recordId || item.record_id,
      });
    }
    Object.entries(item).forEach(([key, value]) => {
      if (!value || typeof value !== 'object') return;
      const normalizedKey = String(key || '').trim().toLowerCase();
      const nextHint = normalizedKey === 'voice' || normalizedKey === 'voices'
        ? 'voice'
        : normalizedKey === 'audio' || normalizedKey === 'audios'
          ? 'audio'
          : normalizedKey === 'photo' || normalizedKey === 'photos' || normalizedKey === 'image' || normalizedKey === 'images'
            ? 'image'
            : normalizedKey === 'video' || normalizedKey === 'videos'
              ? 'video'
              : hint;
      stack.push({ node: value, hint: nextHint });
    });
  }

  return results;
};

const normalizeBotMediaFileRef = (value: any, fallback?: Partial<BotMediaFileRef>): BotMediaFileRef | null => {
  const fileId = normalizeText(value?.media_file_id || value?.file_id || value?.fileId || fallback?.fileId);
  const rawUrl = normalizeText(value?.url || value?.file_url || value?.media_url || value?.download_url || value?.link_url || fallback?.url);
  const url = (normalizePublicAssetUrl(rawUrl) || rawUrl) || null;
  if (!fileId) return null;
  return {
    fileId,
    fileName: normalizeText(
      value?.name
      || value?.file_name
      || value?.fileName
      || value?.filename
      || value?.original_name
      || value?.title
      || fallback?.fileName
    ) || null,
    fileType: normalizeText(
      value?.file_type
      || value?.fileType
      || value?.media_type
      || value?.kind
      || value?.type
      || value?.button_type
      || value?.input_type
      || fallback?.fileType
    ) || null,
    url,
  };
};

const collectNestedBotMediaFileRefs = (root: unknown, fallback?: Partial<BotMediaFileRef>) => {
  const results: BotMediaFileRef[] = [];
  const seen = new Set<any>();
  const stack: Array<{ node: unknown; hint?: string | null }> = [{ node: root, hint: null }];

  while (stack.length > 0) {
    const currentEntry = stack.pop();
    const current = currentEntry?.node;
    const hint = currentEntry?.hint || null;
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) {
      current.forEach((item) => stack.push({ node: item, hint }));
      continue;
    }

    const item = current as Record<string, any>;
    const ref = normalizeBotMediaFileRef(item, hint ? { ...(fallback || {}), fileType: hint } : fallback);
    if (ref) results.push(ref);
    Object.entries(item).forEach(([key, value]) => {
      if (!value || typeof value !== 'object') return;
      const normalizedKey = String(key || '').trim().toLowerCase();
      const nextHint = normalizedKey === 'voice' || normalizedKey === 'voices'
        ? 'voice'
        : normalizedKey === 'audio' || normalizedKey === 'audios'
          ? 'audio'
          : normalizedKey === 'photo' || normalizedKey === 'photos' || normalizedKey === 'image' || normalizedKey === 'images'
            ? 'image'
            : normalizedKey === 'video' || normalizedKey === 'videos'
              ? 'video'
              : hint;
      stack.push({ node: value, hint: nextHint });
    });
  }

  return results;
};

export const collectBotMessageMediaFileRefs = (row: BotMessageLike | null | undefined): BotMediaFileRef[] => {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const fallback = {
    fileName: normalizeText(row?.file_name) || null,
    fileType: normalizeText((row as any)?.message_type) || null,
    url: normalizeText(row?.file_url) || null,
  };
  const refs: Array<BotMediaFileRef | null> = [
    normalizeBotMediaFileRef({
      media_file_id: (payload as any)?.media_file_id || (payload as any)?.file_id || (payload as any)?.fileId,
      name: (payload as any)?.file_name || (payload as any)?.fileName || row?.file_name,
      file_type: (payload as any)?.file_type || (payload as any)?.media_type || (row as any)?.message_type,
      url: (payload as any)?.media_url || (payload as any)?.file_url || (payload as any)?.download_url || row?.file_url,
    }, fallback),
  ];

  const payloadAttachments = Array.isArray((payload as any)?.attachments) ? (payload as any).attachments : [];
  payloadAttachments.forEach((item: any) => refs.push(normalizeBotMediaFileRef(item, fallback)));
  collectNestedBotMediaFileRefs(payload, fallback).forEach((item) => refs.push(item));

  const byKey = new Map<string, BotMediaFileRef>();
  refs.forEach((item) => {
    if (!item?.fileId) return;
    const existing = byKey.get(item.fileId);
    byKey.set(item.fileId, {
      fileId: item.fileId,
      fileName: item.fileName || existing?.fileName || fallback.fileName || null,
      fileType: item.fileType || existing?.fileType || fallback.fileType || null,
      url: item.url || existing?.url || fallback.url || null,
    });
  });
  return Array.from(byKey.values());
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
    url: (payload as any)?.media_url || (payload as any)?.file_url || (payload as any)?.download_url || (payload as any)?.link_url,
    name: (payload as any)?.file_name || (payload as any)?.fileName || (payload as any)?.filename || (payload as any)?.original_name || row?.file_name,
    mimeType: (payload as any)?.mime_type || row?.mime_type,
    fileType: (payload as any)?.file_type || (payload as any)?.media_type || (payload as any)?.kind || (payload as any)?.type || (row as any)?.message_type,
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
