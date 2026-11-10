import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrgStory, OrgStoryReaction, OrgStoryView, OrgStoryWithMeta } from '../components/stories/storyTypes';
import { SAAS_STORY_AVATAR_URL, SAAS_STORY_CREATOR_NAME } from '../components/stories/storyTypes';
import { normalizePublicAssetUrl } from './assetUrl';
import { getAppRuntimeCached, clearAppRuntimeCache } from './appRuntimeCache';
import { cleanupExpiredOwnOrgStoryMedia } from './storyMediaCleanup';

export const invalidateOrgStoriesCache = (orgId?: string | null) => {
  const normalizedOrgId = String(orgId || '').trim();
  clearAppRuntimeCache(normalizedOrgId ? `org-stories:${normalizedOrgId}:` : 'org-stories:');
};

export const ORG_STORY_LEGACY_SELECT =
  'id, org_id, creator_id, creator_name, creator_avatar, slides, is_org_wide, is_saas_wide, is_saas_admins_only, viewer_user_ids, viewer_role_ids, mention_user_ids, mention_role_ids, published_at, expires_at, is_pinned, is_active, view_count, created_at, updated_at';

export const ORG_STORY_SELECT =
  `${ORG_STORY_LEGACY_SELECT}, delete_media_on_expire, media_cleaned_at, settings`;

export const ORG_STORY_VIEW_SELECT = 'id, org_id, story_id, user_id, viewed_at';
export const ORG_STORY_REACTION_SELECT = 'id, org_id, story_id, user_id, user_name, emoji, created_at';

export const resolveStoryCreatorIdentity = (
  story: Pick<OrgStory, 'is_saas_wide' | 'creator_name' | 'creator_avatar'>,
) => {
  if (story.is_saas_wide) {
    return {
      creatorName: SAAS_STORY_CREATOR_NAME,
      creatorAvatar: SAAS_STORY_AVATAR_URL,
    };
  }
  return {
    creatorName: String(story.creator_name || '').trim() || 'ناشناس',
    creatorAvatar: normalizePublicAssetUrl(story.creator_avatar) || null,
  };
};

export const normalizeOrgStoryAssets = (story: OrgStory): OrgStory => {
  const { creatorName, creatorAvatar } = resolveStoryCreatorIdentity(story);
  return {
    ...story,
    creator_name: creatorName,
    creator_avatar: story.is_saas_wide ? creatorAvatar : (normalizePublicAssetUrl(story.creator_avatar) || null),
    slides: (story.slides || []).map((slide) => ({
      ...slide,
      ...(slide.image_url
        ? { image_url: normalizePublicAssetUrl(slide.image_url) || undefined }
        : {}),
      ...(slide.video_url
        ? { video_url: normalizePublicAssetUrl(slide.video_url) || undefined }
        : {}),
      ...(Array.isArray(slide.stickers)
        ? {
            stickers: slide.stickers.map((sticker) => (
              sticker?.type === 'audio' && sticker.audio_url
                ? { ...sticker, audio_url: normalizePublicAssetUrl(sticker.audio_url) || sticker.audio_url }
                : sticker
            )),
          }
        : {}),
    })),
  };
};

export const buildOrgStoriesWithMeta = (
  rawStories: OrgStory[],
  views: OrgStoryView[],
  reactions: OrgStoryReaction[],
  currentUserId: string | null
): OrgStoryWithMeta[] => {
  const viewedIds = new Set(
    (views || [])
      .filter((row) => row.user_id === currentUserId)
      .map((row) => row.story_id)
  );

  const viewsByStoryId = new Map<string, number>();
  const reactionsByStoryId = new Map<string, OrgStoryReaction[]>();

  (views || []).forEach((row) => {
    const storyId = String(row?.story_id || '').trim();
    if (!storyId) return;
    viewsByStoryId.set(storyId, (viewsByStoryId.get(storyId) || 0) + 1);
  });

  (reactions || []).forEach((row) => {
    const storyId = String(row?.story_id || '').trim();
    if (!storyId) return;
    const bucket = reactionsByStoryId.get(storyId) || [];
    bucket.push(row);
    reactionsByStoryId.set(storyId, bucket);
  });

  return (rawStories || [])
    .map((story) => {
      const normalizedStory = normalizeOrgStoryAssets(story);
      const storyReactions = reactionsByStoryId.get(String(story.id)) || [];
      const myReaction = storyReactions.find((row) => row.user_id === currentUserId) ?? null;

      return {
        ...normalizedStory,
        isViewedByMe: viewedIds.has(String(story.id)),
        myReaction,
        reactions: storyReactions,
        viewerCount: viewsByStoryId.get(String(story.id)) || 0,
      };
    })
    .sort((left, right) => {
      if (left.is_pinned !== right.is_pinned) return left.is_pinned ? -1 : 1;
      if (left.isViewedByMe !== right.isViewedByMe) return left.isViewedByMe ? 1 : -1;
      return new Date(right.published_at).getTime() - new Date(left.published_at).getTime();
    });
};

const isMissingStorySchemaColumnError = (error: any) => {
  const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();
  return code === '42703' || code === 'PGRST204' || text.includes('delete_media_on_expire') || text.includes('media_cleaned_at') || text.includes('settings');
};

export const fetchActiveOrgStoriesWithMeta = async ({
  supabaseClient,
  orgId,
  currentUserId,
  force = false,
}: {
  supabaseClient: SupabaseClient<any, 'public', any>;
  orgId: string;
  currentUserId: string | null;
  force?: boolean;
}): Promise<OrgStoryWithMeta[]> => {
  const normalizedOrgId = String(orgId || '').trim();
  if (!normalizedOrgId) return [];

  void cleanupExpiredOwnOrgStoryMedia(normalizedOrgId);

  return getAppRuntimeCached({
    key: `org-stories:${normalizedOrgId}:${String(currentUserId || 'guest').trim() || 'guest'}`,
    ttlMs: 60_000,
    force,
    loader: async () => {
      const now = new Date().toISOString();

      const queryStories = async (selectCols: string) => Promise.all([
        supabaseClient
          .from('org_stories')
          .select(selectCols)
          .eq('org_id', normalizedOrgId)
          .eq('is_active', true)
          .eq('is_saas_wide', false)
          .lte('published_at', now)
          .or(`expires_at.is.null,expires_at.gt.${now}`)
          .order('is_pinned', { ascending: false })
          .order('published_at', { ascending: false }),
        supabaseClient
          .from('org_stories')
          .select(selectCols)
          .eq('is_saas_wide', true)
          .eq('is_active', true)
          .lte('published_at', now)
          .or(`expires_at.is.null,expires_at.gt.${now}`)
          .order('published_at', { ascending: false }),
      ]);

      let [orgResult, saasResult] = await queryStories(ORG_STORY_SELECT);
      if (
        (orgResult.error && isMissingStorySchemaColumnError(orgResult.error))
        || (saasResult.error && isMissingStorySchemaColumnError(saasResult.error))
      ) {
        [orgResult, saasResult] = await queryStories(ORG_STORY_LEGACY_SELECT);
      }

      const seenIds = new Set<string>();
      const rawStories: OrgStory[] = [];
      for (const row of [...(orgResult.data || []), ...(saasResult.data || [])]) {
        const id = String((row as any)?.id || '').trim();
        if (id && !seenIds.has(id)) {
          seenIds.add(id);
          rawStories.push(row as unknown as OrgStory);
        }
      }

      if (rawStories.length === 0) return [];

      const storyIds = rawStories.map((row) => String(row?.id || '').trim()).filter(Boolean);
      const [{ data: views }, { data: reactions }] = await Promise.all([
        supabaseClient
          .from('org_story_views')
          .select(ORG_STORY_VIEW_SELECT)
          .in('story_id', storyIds),
        supabaseClient
          .from('org_story_reactions')
          .select(ORG_STORY_REACTION_SELECT)
          .in('story_id', storyIds),
      ]);

      return buildOrgStoriesWithMeta(
        rawStories,
        (views || []) as OrgStoryView[],
        (reactions || []) as OrgStoryReaction[],
        currentUserId
      );
    },
  });
};
