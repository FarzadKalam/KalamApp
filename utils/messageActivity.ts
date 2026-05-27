import type { NoteAttachment } from './noteContent';

const normalizeText = (value: unknown) => String(value || '').trim();

export type MessageActivityDraftInput = {
  actorName?: string | null;
  createdAtLabel?: string | null;
  content?: string | null;
  attachments?: NoteAttachment[];
  sourceLabel?: string | null;
};

export const buildMessageActivityDescription = ({
  actorName,
  createdAtLabel,
  content,
  attachments = [],
  sourceLabel,
}: MessageActivityDraftInput) => {
  const actor = normalizeText(actorName) || normalizeText(sourceLabel) || 'کاربر';
  const dateText = normalizeText(createdAtLabel);
  const body = normalizeText(content)
    || (attachments.length > 0 ? 'فایل یا تصویر پیوست' : 'بدون متن');

  return `فعالیت ایجاد شده بر اساس پیام ${actor}${dateText ? ` در ${dateText}` : ''} با محتوای: ${body}`;
};

export const buildMessageActivityTitle = ({
  actorName,
  sourceLabel,
}: Pick<MessageActivityDraftInput, 'actorName' | 'sourceLabel'>) => {
  const actor = normalizeText(actorName) || normalizeText(sourceLabel);
  return actor ? `پیگیری پیام ${actor}` : 'پیگیری پیام';
};

export const filterUsableMessageAttachments = (attachments?: NoteAttachment[] | null) => (
  (attachments || []).filter((attachment) => normalizeText(attachment?.url))
);
