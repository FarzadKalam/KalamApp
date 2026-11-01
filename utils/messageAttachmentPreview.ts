import { toImageTransformUrl } from './imagePreview';
import type { NoteAttachment } from './noteContent';

export const canPreviewLocalMessageImage = (file: Blob, name: string) =>
  file.size <= 512 * 1024 && /\.(jpe?g|png|webp|gif)$/i.test(name);

/** Never silently download an unbounded original while rendering a message. */
export const getMessageAttachmentPreviewUrl = (attachment: NoteAttachment, expanded = false): string | null => {
  if (attachment.thumbnailUrl && attachment.thumbnailUrl !== attachment.url) return attachment.thumbnailUrl;
  if (/\.(tiff?|heic|heif|bmp|svg)(?:$|[?#])/i.test(attachment.name || attachment.url)
    || /image\/(tiff|heic|heif|bmp|svg)/i.test(attachment.mimeType || '')
    || Number(attachment.sizeBytes || 0) > 5 * 1024 * 1024) return null;
  const transformed = toImageTransformUrl(attachment.url, expanded ? 'gallery' : 'thumb');
  if (transformed && /\/storage\/v1\/render\/image\/public\//.test(transformed)) {
    const url = new URL(transformed);
    url.searchParams.set('width', expanded ? '760' : '260');
    url.searchParams.set('height', expanded ? '760' : '260');
    url.searchParams.set('quality', expanded ? '74' : '68');
    url.searchParams.set('resize', 'contain');
    return url.toString();
  }
  return Number(attachment.sizeBytes) > 0 && Number(attachment.sizeBytes) <= 512 * 1024
    && /\.(jpe?g|png|webp|gif)(?:$|[?#])/i.test(attachment.name || attachment.url)
    ? attachment.url : null;
};
