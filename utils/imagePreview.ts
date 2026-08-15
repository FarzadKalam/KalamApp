import { normalizePublicAssetUrl } from './assetUrl';

export type ImagePreviewPreset = 'avatar' | 'thumb' | 'card' | 'hero' | 'gallery' | 'printLogo' | 'printMap' | 'printHero';

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
  printLogo: { width: 240, quality: 72, resize: 'contain' },
  printMap: { width: 720, quality: 64, resize: 'cover' },
  printHero: { width: 1400, quality: 68, resize: 'cover' },
};

const IMAGE_TRANSFORM_PREVIEW_ENABLED = String(import.meta.env.VITE_ENABLE_IMAGE_TRANSFORM_PREVIEW || '').trim() === 'true';
const PRINT_IMAGE_TRANSFORM_ENABLED = String(import.meta.env.VITE_ENABLE_PRINT_IMAGE_TRANSFORM || '').trim() === 'true';
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
const unavailableTransformOrigins = new Set<string>();

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

export const isImageTransformPreviewEnabled = () => IMAGE_TRANSFORM_PREVIEW_ENABLED;
export const isPrintImageTransformEnabled = () => PRINT_IMAGE_TRANSFORM_ENABLED;

export const toImageTransformUrl = (rawUrl: string | null | undefined, preset: ImagePreviewPreset = 'card'): string => {
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

export const buildImagePreviewUrl = (
  rawUrl: string | null | undefined,
  preset: ImagePreviewPreset = 'card',
  options?: { forceTransform?: boolean },
): string => {
  const normalized = normalizePublicAssetUrl(rawUrl);
  if (!normalized) return '';
  if (normalized.startsWith('data:') || normalized.startsWith('blob:')) return normalized;
  if (!(options?.forceTransform || IMAGE_TRANSFORM_PREVIEW_ENABLED)) return normalized;
  return toImageTransformUrl(normalized, preset);
};

export const buildPrintImageUrl = (
  rawUrl: string | null | undefined,
  preset: Extract<ImagePreviewPreset, 'printLogo' | 'printMap' | 'printHero'> = 'printHero',
): string => {
  const normalized = normalizePublicAssetUrl(rawUrl);
  if (!normalized || normalized.startsWith('data:') || normalized.startsWith('blob:')) return normalized;

  // The PDF renderer runs on a separate server. Supabase's transformed-image
  // endpoint is reachable from the browser but is not consistently available
  // from that renderer, which turns an otherwise valid logo into its alt text.
  // Use the original public object for every printed asset instead.
  const parsed = resolveUrl(normalized);
  if (parsed?.pathname.includes('/storage/v1/render/image/public/')) {
    parsed.pathname = parsed.pathname.replace('/storage/v1/render/image/public/', '/storage/v1/object/public/');
    ['width', 'height', 'quality', 'resize', 'format'].forEach((key) => parsed.searchParams.delete(key));
    return parsed.toString();
  }

  // Print images deliberately bypass browser-only transformations. Their
  // displayed size is controlled by the template, so a raw public asset is
  // both reliable for the PDF renderer and layout-safe.
  void preset;
  void PRINT_IMAGE_TRANSFORM_ENABLED;
  return normalized;
};

export const buildImageBackgroundStyle = (
  rawUrl: string | null | undefined,
  preset: ImagePreviewPreset = 'hero',
): { backgroundImage: string; backgroundSize: 'cover'; backgroundPosition: 'center' } | {} => {
  const resolvedUrl = buildImagePreviewUrl(rawUrl, preset);
  if (!resolvedUrl) return {};
  const safeUrl = resolvedUrl.replace(/"/g, '%22');
  return {
    backgroundImage: `url("${safeUrl}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
};

export const getImagePreviewCandidates = (
  rawUrl: string | null | undefined,
  preset: ImagePreviewPreset = 'card',
  options?: { forceTransform?: boolean },
): string[] => {
  const normalized = normalizePublicAssetUrl(rawUrl);
  if (!normalized) return [];
  const normalizedUrl = resolveUrl(normalized);
  if (normalizedUrl && unavailableTransformOrigins.has(normalizedUrl.origin)) {
    return [normalized];
  }
  const previewUrl = buildImagePreviewUrl(normalized, preset, { forceTransform: options?.forceTransform });
  if (!previewUrl || previewUrl === normalized) {
    return [normalized];
  }
  return [previewUrl, normalized];
};

export const reportImageTransformFailure = (url: string | null | undefined) => {
  const parsed = resolveUrl(String(url || '').trim());
  if (!parsed || !parsed.pathname.includes('/storage/v1/render/image/')) return;
  unavailableTransformOrigins.add(parsed.origin);
};

export const resetImageTransformFailureCacheForTest = () => {
  unavailableTransformOrigins.clear();
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
