export type NoteAttachment = {
  name: string;
  url: string;
  mimeType?: string | null;
  assetId?: string | null;
  entryId?: string | null;
  moduleId?: string | null;
  recordId?: string | null;
  fileType?: 'image' | 'video' | 'file' | string | null;
};

export type ParsedNoteContent = {
  text: string;
  attachments: NoteAttachment[];
};

const isObject = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeAttachment = (value: any): NoteAttachment | null => {
  const url = String(value?.url || value?.file_url || '').trim();
  if (!url) return null;

  const fallbackName = String(url.split('?')[0].split('/').pop() || 'file').trim() || 'file';
  const name = String(value?.name || value?.file_name || fallbackName).trim() || fallbackName;
  const mimeType = String(value?.mimeType || value?.mime_type || '').trim() || null;

  return { name, url, mimeType };
};

const extractStructuredContent = (value: unknown): ParsedNoteContent | null => {
  if (!isObject(value)) return null;

  const text = String(value.text ?? value.content ?? '').trim();
  const attachments = Array.isArray(value.attachments)
    ? value.attachments.map(normalizeAttachment).filter(Boolean) as NoteAttachment[]
    : [];

  return { text, attachments };
};

export const parseNoteContent = (rawValue: unknown): ParsedNoteContent => {
  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        const structured = extractStructuredContent(parsed);
        if (structured) return structured;
      } catch {
        // fall back to plain text
      }
    }
    return { text: rawValue, attachments: [] };
  }

  const structured = extractStructuredContent(rawValue);
  if (structured) return structured;

  if (rawValue === null || rawValue === undefined) {
    return { text: '', attachments: [] };
  }

  return { text: String(rawValue), attachments: [] };
};

export const serializeNoteContent = (textValue: string, attachmentsValue?: NoteAttachment[]): string => {
  const text = String(textValue || '').trim();
  const attachments = (attachmentsValue || [])
    .map(normalizeAttachment)
    .filter(Boolean) as NoteAttachment[];

  if (attachments.length === 0) return text;

  return JSON.stringify({
    text,
    attachments,
  });
};
