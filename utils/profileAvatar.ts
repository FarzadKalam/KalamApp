import { normalizePublicAssetUrl } from './assetUrl';
import { getImagePreviewCandidates, type ImagePreviewPreset } from './imagePreview';

const preloadedAvatarCache = new Set<string>();

const pickFirstMeaningfulToken = (value: string): string => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  const token = normalized.split(/\s+/).find(Boolean) || '';
  return token.trim();
};

export const getAvatarFallbackText = (name?: unknown, fallback = '?'): string => {
  const token = pickFirstMeaningfulToken(String(name || ''));
  if (!token) return fallback;
  const firstCharacter = Array.from(token)[0] || fallback;
  return /[a-z]/i.test(firstCharacter) ? firstCharacter.toUpperCase() : firstCharacter;
};

export const resolveAvatarUrl = (value?: unknown): string => {
  return normalizePublicAssetUrl(value);
};

export const getAvatarImageCandidates = (
  rawUrl?: string | null,
  preset: ImagePreviewPreset = 'avatar',
): string[] => {
  return getImagePreviewCandidates(resolveAvatarUrl(rawUrl), preset);
};

export const preloadAvatarUrls = (
  urls: Array<string | null | undefined>,
  preset: ImagePreviewPreset = 'avatar',
) => {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return;

  urls.forEach((url) => {
    getAvatarImageCandidates(url, preset).forEach((candidate) => {
      const cacheKey = `${preset}:${candidate}`;
      if (!candidate || preloadedAvatarCache.has(cacheKey)) return;
      preloadedAvatarCache.add(cacheKey);
      const image = new Image();
      image.decoding = 'async';
      image.src = candidate;
    });
  });
};

export const resetAvatarPreloadCacheForTest = () => {
  preloadedAvatarCache.clear();
};
