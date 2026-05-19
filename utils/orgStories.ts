import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrgStory, OrgStoryReaction, OrgStoryView, OrgStoryWithMeta } from '../components/stories/storyTypes';

export const ORG_STORY_SELECT =
  'id, org_id, creator_id, creator_name, creator_avatar, slides, is_org_wide, viewer_user_ids, viewer_role_ids, mention_user_ids, mention_role_ids, published_at, expires_at, is_pinned, is_active, view_count, created_at, updated_at';

export const ORG_STORY_VIEW_SELECT = 'id, org_id, story_id, user_id, viewed_at';
export const ORG_STORY_REACTION_SELECT = 'id, org_id, story_id, user_id, user_name, emoji, created_at';

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
      const storyReactions = reactionsByStoryId.get(String(story.id)) || [];
      const myReaction = storyReactions.find((row) => row.user_id === currentUserId) ?? null;

      return {
        ...story,
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

export const fetchActiveOrgStoriesWithMeta = async ({
  supabaseClient,
  orgId,
  currentUserId,
}: {
  supabaseClient: SupabaseClient<any, 'public', any>;
  orgId: string;
  currentUserId: string | null;
}): Promise<OrgStoryWithMeta[]> => {
  const normalizedOrgId = String(orgId || '').trim();
  if (!normalizedOrgId) return [];

  const now = new Date().toISOString();
  const { data: rawStories, error: storiesError } = await supabaseClient
    .from('org_stories')
    .select(ORG_STORY_SELECT)
    .eq('org_id', normalizedOrgId)
    .eq('is_active', true)
    .lte('published_at', now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('is_pinned', { ascending: false })
    .order('published_at', { ascending: false });

  if (storiesError || !Array.isArray(rawStories) || rawStories.length === 0) {
    return [];
  }

  const storyIds = rawStories.map((row: any) => String(row?.id || '').trim()).filter(Boolean);
  if (storyIds.length === 0) return [];

  const [{ data: views }, { data: reactions }] = await Promise.all([
    supabaseClient
      .from('org_story_views')
      .select(ORG_STORY_VIEW_SELECT)
      .eq('org_id', normalizedOrgId)
      .in('story_id', storyIds),
    supabaseClient
      .from('org_story_reactions')
      .select(ORG_STORY_REACTION_SELECT)
      .eq('org_id', normalizedOrgId)
      .in('story_id', storyIds),
  ]);

  return buildOrgStoriesWithMeta(
    rawStories as OrgStory[],
    (views || []) as OrgStoryView[],
    (reactions || []) as OrgStoryReaction[],
    currentUserId
  );
};
