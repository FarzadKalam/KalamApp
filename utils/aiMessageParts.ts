import type { NoteAttachment } from './noteContent';
import { dedupeAttachments } from './messageAttachments';
import { resolveNoteAttachmentFileType } from './noteContent';

const normalizeText = (value: unknown) => String(value ?? '').trim();

const isObject = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const extractTextParts = (value: unknown, parts: string[]) => {
  if (value == null) return;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = normalizeText(value);
    if (text) parts.push(text);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => extractTextParts(item, parts));
    return;
  }
  if (!isObject(value)) return;
  const type = normalizeText(value.type).toLowerCase();
  if (type === 'text' || type === 'output_text' || type === 'input_text' || type === 'message') {
    const direct = normalizeText(value.text || value.content || value.value);
    if (direct) parts.push(direct);
  }
  if (Array.isArray(value.content)) {
    value.content.forEach((item: any) => extractTextParts(item, parts));
  }
  if (Array.isArray(value.text?.content)) {
    value.text.content.forEach((item: any) => extractTextParts(item, parts));
  }
};

export const normalizeAiMessageText = (value: unknown) => {
  if (typeof value === 'string') return value;
  const parts: string[] = [];
  extractTextParts(value, parts);
  return parts.join('\n').trim();
};

const toAttachment = (value: any): NoteAttachment | null => {
  if (!value) return null;
  const url = normalizeText(
    value.url
    || value.file_url
    || value.download_url
    || value.media_url
    || value.link_url
    || value.preview_url
    || value.publicUrl
    || value.public_url
    || value.data
    || value.image_url?.url
    || value.image_url
    || value.file?.url
    || value.file?.data
    || value.file?.publicUrl
    || value.file?.public_url
  );
  if (!url) return null;
  const fallbackName = normalizeText(url.split('?')[0].split('#')[0].split('/').pop()) || 'فایل';
  const mimeType = normalizeText(value.mimeType || value.mime_type || value.file?.mimeType || value.file?.mime_type) || null;
  return {
    name: normalizeText(
      value.name
      || value.file_name
      || value.fileName
      || value.filename
      || value.original_name
      || value.title
      || value.file?.name
      || value.file?.file_name
      || value.file?.fileName
    ) || fallbackName,
    url,
    mimeType,
    fileType: resolveNoteAttachmentFileType({
      ...value,
      url,
      mimeType,
      fileType: value.fileType || value.file_type || value.media_type || value.kind || value.type,
    }),
    assetId: normalizeText(value.assetId || value.asset_id || value.file?.assetId || value.file?.asset_id) || null,
    entryId: normalizeText(value.entryId || value.entry_id || value.file?.entryId || value.file?.entry_id) || null,
    moduleId: normalizeText(value.moduleId || value.module_id || value.file?.moduleId || value.file?.module_id) || null,
    recordId: normalizeText(value.recordId || value.record_id || value.file?.recordId || value.file?.record_id) || null,
  };
};

const collectAttachments = (value: unknown, results: Array<NoteAttachment | null>) => {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectAttachments(item, results));
    return;
  }
  if (!isObject(value)) return;

  const direct = toAttachment(value);
  if (direct) results.push(direct);

  [value.image, value.file, value.attachment, value.payload].forEach((item) => {
    if (item) collectAttachments(item, results);
  });

  [value.attachments, value.files, value.images, value.bundle_inputs, value.content].forEach((list) => {
    if (Array.isArray(list)) list.forEach((item) => collectAttachments(item, results));
  });
};

export const extractAiMessageAttachments = (input: {
  content?: unknown;
  metadata?: Record<string, any> | null;
} | null | undefined): NoteAttachment[] => {
  const results: Array<NoteAttachment | null> = [];
  collectAttachments(input?.metadata, results);
  collectAttachments(input?.content, results);
  return dedupeAttachments(results);
};
