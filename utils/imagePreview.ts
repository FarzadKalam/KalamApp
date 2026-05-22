import { normalizePublicAssetUrl } from './assetUrl';

export type ImagePreviewPreset = 'avatar' | 'thumb' | 'card' | 'hero' | 'gallery';

type PreviewPresetConfig = {
  width: number;
  quality: number;
  resize: 'cover' | 'contain';
};

const PRESET_CONFIG: Record<ImagePreviewPreset, PreviewPresetConfig> = {
  avatar: { width: 120, quality: 65, resize: 'cover' },
  thumb: { width: 260, quality: 68, resize: 'cover' },
  card: { width: 520, quality: 72, resize: 'cover' },
  hero: { width: 920, quality: 76, resize: 'cover' },
  gallery: { width: 760, quality: 74, resize: 'contain' },
};

const SKIP_TRANSFORM_EXTENSIONS = new Set(['svg', 'gif']);
const IMAGE_FILE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'svg',
  'bmp',
  'avif',
  'heic',
  'heif',
  'tif',
  'tiff',
  'ico',
]);

const getPathExtension = (path: string): string => {
  const clean = String(path || '').split('?')[0].split('#')[0];
  const segment = clean.split('/').pop() || '';
  if (!segment.includes('.')) return '';
  return String(segment.split('.').pop() || '').trim().toLowerCase();
};

const getValueExtension = (value: string): string => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  try {
    return getPathExtension(new URL(normalized).pathname);
  } catch {
    return getPathExtension(normalized);
  }
};

const resolveUrl = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    try {
      if (typeof window === 'undefined') return null;
      return new URL(value, window.location.origin);
    } catch {
      return null;
    }
  }
};

const toRenderPath = (pathname: string): string | null => {
  if (pathname.includes('/storage/v1/render/image/public/')) return pathname;
  if (pathname.includes('/storage/v1/object/public/')) {
    return pathname.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
  }
  return null;
};

export const buildImagePreviewUrl = (rawUrl: string | null | undefined, preset: ImagePreviewPreset = 'card'): string => {
  const normalized = normalizePublicAssetUrl(rawUrl);
  if (!normalized) return '';
  if (normalized.startsWith('data:') || normalized.startsWith('blob:')) return normalized;
  const parsed = resolveUrl(normalized);
  if (!parsed) return normalized;

  const extension = getPathExtension(parsed.pathname);
  if (SKIP_TRANSFORM_EXTENSIONS.has(extension)) return normalized;

  const renderPath = toRenderPath(parsed.pathname);
  if (!renderPath) return normalized;

  parsed.pathname = renderPath;
  const config = PRESET_CONFIG[preset];

  if (!parsed.searchParams.has('width')) {
    parsed.searchParams.set('width', String(config.width));
  }
  if (!parsed.searchParams.has('quality')) {
    parsed.searchParams.set('quality', String(config.quality));
  }
  if (!parsed.searchParams.has('resize')) {
    parsed.searchParams.set('resize', config.resize);
  }

  return parsed.toString();
};

export const getImagePreviewCandidates = (
  rawUrl: string | null | undefined,
  preset: ImagePreviewPreset = 'card',
): string[] => {
  const normalized = normalizePublicAssetUrl(rawUrl);
  if (!normalized) return [];
  const previewUrl = buildImagePreviewUrl(normalized, preset);
  if (!previewUrl || previewUrl === normalized) {
    return [normalized];
  }
  return [previewUrl, normalized];
};

export const isImageFileLike = (
  url?: string | null,
  fileName?: string | null,
  mimeType?: string | null,
): boolean => {
  const normalizedMime = String(mimeType || '').trim().toLowerCase();
  if (normalizedMime.startsWith('image/')) return true;

  const normalizedUrl = normalizePublicAssetUrl(url);
  if (normalizedUrl.startsWith('data:image/')) return true;

  const extension = getValueExtension(String(fileName || '').trim()) || getValueExtension(normalizedUrl);
  return IMAGE_FILE_EXTENSIONS.has(extension);
};
