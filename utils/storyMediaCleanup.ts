import { supabase } from '../supabaseClient';
import { FILE_STORAGE_BUCKET, fileStorageClient } from './storageClient';
import type { OrgStory, StorySlide } from '../components/stories/storyTypes';

const CLEANUP_THROTTLE_MS = 3 * 60_000;
const lastCleanupRunByOrg = new Map<string, number>();

const extractPathname = (rawUrl: string): string => {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  try {
    if (/^https?:\/\//i.test(value)) {
      return new URL(value).pathname;
    }
  } catch {
    // ignore malformed URL and parse as path
  }
  return value;
};

/**
 * فقط مسیرهای اختصاصی استوری (`stories/{orgId}/...`) را برمی‌گرداند.
 * فایل‌های انتخاب‌شده از فایل‌منیجر نرم‌افزار (`file_id` یا مسیرهای خارج از stories/) هرگز برگردانده نمی‌شوند.
 */
export const extractDedicatedStoryStoragePath = (
  rawUrl: unknown,
  orgId: string,
  bucket = FILE_STORAGE_BUCKET,
): string | null => {
  const normalizedUrl = String(rawUrl || '').trim();
  const normalizedOrgId = String(orgId || '').trim();
  if (!normalizedUrl || !normalizedOrgId) return null;

  const cleanPathname = extractPathname(normalizedUrl).split('?')[0].split('#')[0];
  const escapedBucket = bucket.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = cleanPathname.match(new RegExp(`/storage/v1/object/(?:public|sign)/${escapedBucket}/(.+)$`));
  let relativePath = match?.[1] || cleanPathname;
  try {
    relativePath = decodeURIComponent(relativePath);
  } catch {
    // keep raw path if not URI encoded
  }
  relativePath = relativePath.replace(/^\/+/, '');
  if (!relativePath.startsWith(`stories/${normalizedOrgId}/`)) {
    return null;
  }
  return relativePath;
};

export interface ExtractedStoryCleanupResult {
  dedicatedPaths: string[];
  cleanedSlides: StorySlide[];
}

export const collectDedicatedMediaPathsForStoryCleanup = (
  slides: StorySlide[] | null | undefined,
  orgId: string,
  bucket = FILE_STORAGE_BUCKET,
): ExtractedStoryCleanupResult => {
  const dedicatedPaths = new Set<string>();
  const normalizedOrgId = String(orgId || '').trim();

  const cleanedSlides = (Array.isArray(slides) ? slides : []).map((slide) => {
    const nextSlide: StorySlide = { ...slide };
    const hasSharedFile = Boolean(String(slide?.file_id || '').trim());

    if (!hasSharedFile) {
      const imagePath = extractDedicatedStoryStoragePath(slide?.image_url, normalizedOrgId, bucket);
      if (imagePath) {
        dedicatedPaths.add(imagePath);
        delete nextSlide.image_url;
        nextSlide.media_cleaned = true;
      }

      const videoPath = extractDedicatedStoryStoragePath(slide?.video_url, normalizedOrgId, bucket);
      if (videoPath) {
        dedicatedPaths.add(videoPath);
        delete nextSlide.video_url;
        nextSlide.media_cleaned = true;
      }
    }

    if (Array.isArray(slide?.stickers)) {
      nextSlide.stickers = slide.stickers.map((sticker) => {
        const hasSharedStickerFile = Boolean(String(sticker?.file_id || '').trim());
        if (!hasSharedStickerFile && sticker?.type === 'audio' && sticker?.audio_url) {
          const audioPath = extractDedicatedStoryStoragePath(sticker.audio_url, normalizedOrgId, bucket);
          if (audioPath) {
            dedicatedPaths.add(audioPath);
            return {
              ...sticker,
              audio_url: '',
              media_cleaned: true,
            };
          }
        }
        return sticker;
      });
    }

    return nextSlide;
  });

  return {
    dedicatedPaths: Array.from(dedicatedPaths),
    cleanedSlides,
  };
};

export const cleanupExpiredOwnOrgStoryMedia = async (orgId: string | null | undefined): Promise<void> => {
  const normalizedOrgId = String(orgId || '').trim();
  if (!normalizedOrgId) return;

  const nowTs = Date.now();
  const lastRun = lastCleanupRunByOrg.get(normalizedOrgId) || 0;
  if (nowTs - lastRun < CLEANUP_THROTTLE_MS) return;
  lastCleanupRunByOrg.set(normalizedOrgId, nowTs);

  try {
    const { data, error } = await supabase.rpc('get_own_expired_org_stories_for_media_cleanup', {
      p_limit: 20,
    });
    if (error || !Array.isArray(data) || data.length === 0) return;

    for (const row of data as Array<Pick<OrgStory, 'id' | 'org_id' | 'slides'>>) {
      const storyId = String(row?.id || '').trim();
      const rowOrgId = String(row?.org_id || '').trim();
      if (!storyId || rowOrgId !== normalizedOrgId) continue;

      const { dedicatedPaths, cleanedSlides } = collectDedicatedMediaPathsForStoryCleanup(
        row.slides || [],
        normalizedOrgId,
      );

      if (dedicatedPaths.length > 0) {
        await fileStorageClient.storage
          .from(FILE_STORAGE_BUCKET)
          .remove(dedicatedPaths)
          .catch(() => undefined);
      }

      await supabase.rpc('mark_own_org_story_media_cleaned', {
        p_story_id: storyId,
        p_cleaned_slides: cleanedSlides,
      });
    }
  } catch {
    // Silent fallback: cron/edge function handles cleanup if RPC is not deployed yet
  }
};
