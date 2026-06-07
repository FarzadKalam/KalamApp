import { normalizePublicAssetUrl } from './assetUrl';
import {
  getImagePreviewCandidates,
  reportImageTransformFailure,
  type ImagePreviewPreset,
} from './imagePreview';

const preloadedAvatarCache = new Set<string>();
const organizationAvatarPreloadCache = new Map<string, Promise<void>>();
const avatarPreloadQueue: Array<{
  sourceKey: string;
  candidates: string[];
}> = [];
let activeAvatarPreloads = 0;
const MAX_CONCURRENT_AVATAR_PRELOADS = 4;
const AVATAR_DIRECTORY_PAGE_SIZE = 250;

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

const pumpAvatarPreloadQueue = () => {
  if (typeof Image === 'undefined') return;
  while (
    activeAvatarPreloads < MAX_CONCURRENT_AVATAR_PRELOADS
    && avatarPreloadQueue.length > 0
  ) {
    const job = avatarPreloadQueue.shift();
    if (!job) break;
    activeAvatarPreloads += 1;

    const finish = (succeeded: boolean) => {
      activeAvatarPreloads = Math.max(0, activeAvatarPreloads - 1);
      if (!succeeded) preloadedAvatarCache.delete(job.sourceKey);
      pumpAvatarPreloadQueue();
    };

    const preloadCandidate = (candidateIndex: number) => {
      const candidate = job.candidates[candidateIndex];
      if (!candidate) {
        finish(false);
        return;
      }
      const image = new Image();
      image.decoding = 'async';
      (image as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'low';
      image.onload = () => finish(true);
      image.onerror = () => {
        reportImageTransformFailure(candidate);
        preloadCandidate(candidateIndex + 1);
      };
      image.src = candidate;
    };

    preloadCandidate(0);
  }
};

export const preloadAvatarUrls = (
  urls: Array<string | null | undefined>,
  preset: ImagePreviewPreset = 'avatar',
) => {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return;

  urls.forEach((url) => {
    const candidates = getAvatarImageCandidates(url, preset);
    const sourceKey = `${preset}:${resolveAvatarUrl(url)}`;
    if (candidates.length === 0 || preloadedAvatarCache.has(sourceKey)) return;
    preloadedAvatarCache.add(sourceKey);
    avatarPreloadQueue.push({ sourceKey, candidates });
  });
  pumpAvatarPreloadQueue();
};

export const preloadOrganizationAvatarDirectory = async (
  supabaseClient: any,
  orgId: string,
) => {
  const normalizedOrgId = String(orgId || '').trim();
  if (!normalizedOrgId) return;
  const cached = organizationAvatarPreloadCache.get(normalizedOrgId);
  if (cached) return cached;

  const request = (async () => {
    const urls: string[] = [];
    for (let from = 0; ; from += AVATAR_DIRECTORY_PAGE_SIZE) {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('avatar_url')
        .eq('org_id', normalizedOrgId)
        .eq('is_active', true)
        .not('avatar_url', 'is', null)
        .range(from, from + AVATAR_DIRECTORY_PAGE_SIZE - 1);
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      rows.forEach((row: any) => {
        const url = resolveAvatarUrl(row?.avatar_url);
        if (url) urls.push(url);
      });
      if (rows.length < AVATAR_DIRECTORY_PAGE_SIZE) break;
    }
    preloadAvatarUrls(Array.from(new Set(urls)), 'avatar');
  })().catch((error) => {
    organizationAvatarPreloadCache.delete(normalizedOrgId);
    throw error;
  });

  organizationAvatarPreloadCache.set(normalizedOrgId, request);
  return request;
};

export const resetAvatarPreloadCacheForTest = () => {
  preloadedAvatarCache.clear();
  organizationAvatarPreloadCache.clear();
  avatarPreloadQueue.splice(0, avatarPreloadQueue.length);
  activeAvatarPreloads = 0;
};
