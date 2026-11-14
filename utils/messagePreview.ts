import { parseNoteContent, resolveNoteAttachmentFileType, type NoteAttachment } from './noteContent';
import { toPersianNumber } from './persianNumberFormatter';

type PreviewAttachment = Pick<NoteAttachment, 'name' | 'mimeType' | 'fileType'>;

const attachmentLabel = (attachment: PreviewAttachment) => {
  switch (resolveNoteAttachmentFileType(attachment)) {
    case 'image': return '📷 تصویر';
    case 'video': return '🎥 ویدیو';
    case 'voice': return '🎵 پیام صوتی';
    case 'audio': return '🎵 فایل صوتی';
    default: return '📎 فایل';
  }
};

export const getAttachmentsPreviewLabel = (attachments: PreviewAttachment[]) => {
  const usable = attachments.filter(Boolean);
  if (usable.length === 0) return '';
  if (usable.length > 1) {
    const allImages = usable.every((item) => resolveNoteAttachmentFileType(item) === 'image');
    if (allImages) return `📷 ${toPersianNumber(usable.length)} تصویر`;
    return `📎 ${toPersianNumber(usable.length)} پیوست`;
  }

  const attachment = usable[0];
  const label = attachmentLabel(attachment);
  const name = String(attachment.name || '').trim();
  return label === '📎 فایل' && name && name !== 'فایل' && name !== 'file' ? `📎 ${name}` : label;
};

export const getMessageListPreview = (
  rawContent: unknown,
  options?: { attachments?: PreviewAttachment[] | null; fallback?: string },
) => {
  const parsed = parseNoteContent(rawContent);
  const rawText = String(parsed.text || '').replace(/\s+/g, ' ').trim();
  const isJsonText = /^\s*(\{|\[).*("attachments"|"file_url"|"url"|"mime_type"|"name":)/i.test(rawText);
  const text = isJsonText ? '' : rawText;
  const attachments = options?.attachments?.length ? options.attachments : parsed.attachments;
  const attachmentLabel = getAttachmentsPreviewLabel(attachments || []);

  if (text && attachmentLabel) return `${text} · ${attachmentLabel}`;
  if (text) return text;
  return attachmentLabel || String(options?.fallback || '').trim();
};
