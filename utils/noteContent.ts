export type NoteAttachment = {
  name: string;
  url: string;
  thumbnailUrl?: string | null;
  sizeBytes?: number | null;
  mimeType?: string | null;
  assetId?: string | null;
  entryId?: string | null;
  moduleId?: string | null;
  recordId?: string | null;
  fileType?: 'image' | 'video' | 'audio' | 'voice' | 'file' | string | null;
};

export type ParsedNoteContent = {
  text: string;
  attachments: NoteAttachment[];
};

const isObject = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif|tiff?)$/i;
const VIDEO_EXTENSIONS = /\.(mp4|mkv|mov|avi|webm|3gp|m4v)$/i;
const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|oga|aac|m4a|flac|opus|weba|webm)$/i;

const normalizeAttachmentToken = (value: unknown) => String(value || '').trim().toLowerCase();

const normalizeKnownMediaType = (value: unknown): NoteAttachment['fileType'] | null => {
  const token = normalizeAttachmentToken(value).replace(/[\s_-]+/g, '');
  if (!token) return null;
  if (['voice', 'voicemessage', 'recordaudio', 'recordedaudio'].includes(token)) return 'voice';
  if (['audio', 'music', 'sound'].includes(token)) return 'audio';
  if (['image', 'photo', 'picture', 'cameraimage', 'galleryimage'].includes(token)) return 'image';
  if (['video', 'movie', 'cameravideo', 'galleryvideo', 'gif'].includes(token)) return 'video';
  if (['file', 'document', 'attachment'].includes(token)) return 'file';
  return null;
};

const getAttachmentNameCandidates = (value: any) => [
  String(value?.name || '').trim(),
  String(value?.file_name || '').trim(),
  String(value?.fileName || '').trim(),
  String(value?.url || '').trim().split('?')[0].split('#')[0].split('/').pop() || '',
  String(value?.file_url || '').trim().split('?')[0].split('#')[0].split('/').pop() || '',
].filter(Boolean);

export const resolveNoteAttachmentFileType = (value: any): NoteAttachment['fileType'] => {
  const rawType = normalizeKnownMediaType(value?.fileType || value?.file_type || value?.media_type || value?.kind || value?.type);
  const mimeType = normalizeAttachmentToken(value?.mimeType || value?.mime_type);
  const names = getAttachmentNameCandidates(value);
  const joinedNames = names.join(' ').toLowerCase();

  if (rawType && rawType !== 'file') return rawType;

  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) {
    return rawType === 'voice' ? 'voice' : 'audio';
  }

  if (IMAGE_EXTENSIONS.test(joinedNames)) return 'image';
  if (VIDEO_EXTENSIONS.test(joinedNames)) return 'video';
  if (AUDIO_EXTENSIONS.test(joinedNames)) {
    return rawType === 'voice' ? 'voice' : 'audio';
  }

  return 'file';
};

export const isAudioNoteAttachment = (value: any) => {
  const type = resolveNoteAttachmentFileType(value);
  return type === 'audio' || type === 'voice';
};

export const isImageNoteAttachment = (value: any) => resolveNoteAttachmentFileType(value) === 'image';

const normalizeAttachment = (value: any): NoteAttachment | null => {
  const rawUrl = String(value?.url || value?.file_url || '').trim();
  if (!rawUrl) return null;
  const url = normalizePublicAssetUrl(rawUrl) || rawUrl;

  const fallbackName = String(url.split('?')[0].split('/').pop() || 'file').trim() || 'file';
  const name = String(value?.name || value?.file_name || fallbackName).trim() || fallbackName;
  const mimeType = String(value?.mimeType || value?.mime_type || '').trim() || null;

  return {
    name,
    url,
    mimeType,
    thumbnailUrl: String(value?.thumbnailUrl || value?.thumbnail_url || '').trim() || null,
    sizeBytes: Number(value?.sizeBytes || value?.file_size_bytes || value?.size) || null,
    assetId: String(value?.assetId || value?.asset_id || '').trim() || null,
    entryId: String(value?.entryId || value?.entry_id || '').trim() || null,
    moduleId: String(value?.moduleId || value?.module_id || '').trim() || null,
    recordId: String(value?.recordId || value?.record_id || '').trim() || null,
    fileType: resolveNoteAttachmentFileType(value),
  };
};

const ATTACHMENT_JSON_PATTERN = /("attachments"|"file_url"|"download_url"|"url"|"mime_type"|"mimeType"|"fileType"|"fileName"|"file_name")/i;

const isLikelyAttachmentJson = (value: string) => {
  const trimmed = value.trim();
  return (trimmed.startsWith('{') || trimmed.startsWith('[')) && ATTACHMENT_JSON_PATTERN.test(trimmed);
};

const recoverTruncatedAttachmentsJson = (trimmed: string): ParsedNoteContent | null => {
  if (!isLikelyAttachmentJson(trimmed)) return null;

  let text = '';
  const textMatch = trimmed.match(/"text"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (textMatch) {
    try {
      text = JSON.parse(`"${textMatch[1]}"`);
    } catch {
      text = textMatch[1];
    }
  }

  const names: string[] = [];
  const nameRegex = /"(?:name|file_name|fileName)"\s*:\s*"((?:\\.|[^"\\])*)"/gi;
  let match: RegExpExecArray | null;
  while ((match = nameRegex.exec(trimmed)) !== null) {
    try { names.push(JSON.parse(`"${match[1]}"`)); } catch { names.push(match[1]); }
  }

  const urls: string[] = [];
  const urlRegex = /"(?:url|file_url|download_url|path)"\s*:\s*"((?:\\.|[^"\\])*)"/gi;
  while ((match = urlRegex.exec(trimmed)) !== null) {
    try { urls.push(JSON.parse(`"${match[1]}"`)); } catch { urls.push(match[1]); }
  }

  const attachments: NoteAttachment[] = [];
  const maxItems = Math.max(names.length, urls.length, 1);
  for (let i = 0; i < maxItems; i++) {
    const name = names[i] || urls[i]?.split('?')[0].split('/').pop() || '';
    const url = urls[i] || '';
    if (name || url) {
      attachments.push({
        name: name || 'فایل',
        url: url || '',
        fileType: resolveNoteAttachmentFileType({ name, url }),
      });
    }
  }

  if (attachments.length > 0) {
    return { text, attachments };
  }

  const isImage = /image|\.png|\.jpe?g|\.webp|\.gif|\.svg/i.test(trimmed);
  const isAudio = /voice|audio|\.mp3|\.ogg|\.opus|\.wav|\.m4a/i.test(trimmed);
  const isVideo = /video|\.mp4|\.mkv|\.mov|\.webm/i.test(trimmed);
  const fileType = isImage ? 'image' : isAudio ? 'voice' : isVideo ? 'video' : 'file';

  return {
    text,
    attachments: [{
      name: 'فایل',
      url: '',
      fileType,
    }],
  };
};

const extractStructuredContent = (value: unknown): ParsedNoteContent | null => {
  if (Array.isArray(value)) {
    const attachments = value.map(normalizeAttachment).filter(Boolean) as NoteAttachment[];
    if (attachments.length > 0) {
      return { text: '', attachments };
    }
  }

  if (!isObject(value)) return null;

  const text = String(value.text ?? value.content ?? '').trim();
  const attachments = Array.isArray(value.attachments)
    ? value.attachments.map(normalizeAttachment).filter(Boolean) as NoteAttachment[]
    : [];

  if (attachments.length > 0 || text) {
    return { text, attachments };
  }

  const single = normalizeAttachment(value);
  if (single && (single.url || (single.name && single.name !== 'file'))) {
    return { text: '', attachments: [single] };
  }

  return null;
};

export const parseNoteContent = (rawValue: unknown): ParsedNoteContent => {
  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        const structured = extractStructuredContent(parsed);
        if (structured) return structured;
      } catch {
        const recovered = recoverTruncatedAttachmentsJson(trimmed);
        if (recovered) return recovered;
      }
    }
    if (isLikelyAttachmentJson(trimmed)) {
      const recovered = recoverTruncatedAttachmentsJson(trimmed);
      if (recovered) return recovered;
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
import { normalizePublicAssetUrl } from './assetUrl';
