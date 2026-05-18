import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import type {
  OrgStory,
  OrgStoryReaction,
  OrgStoryView,
  OrgStoryWithMeta,
} from './storyTypes';

interface UseOrgStoriesOptions {
  orgId: string | null;
  currentUserId: string | null;
  enabled?: boolean;
  initialStories?: OrgStoryWithMeta[];
}

interface UseOrgStoriesResult {
  stories: OrgStoryWithMeta[];
  loading: boolean;
  refresh: () => Promise<void>;
  markViewed: (storyId: string) => Promise<void>;
  toggleReaction: (storyId: string, emoji: string) => Promise<void>;
  deleteStory: (storyId: string) => Promise<void>;
  togglePin: (storyId: string, isPinned: boolean) => Promise<void>;
}

export const useOrgStories = ({
  orgId,
  currentUserId,
  enabled = true,
  initialStories,
}: UseOrgStoriesOptions): UseOrgStoriesResult => {
  const [stories, setStories] = useState<OrgStoryWithMeta[]>(initialStories ?? []);
  // اگر داده اولیه ارائه شده، از همان ابتدا loading نیست
  const [loading, setLoading] = useState(!initialStories?.length);
  const hasInitialDataRef = useRef(Boolean(initialStories?.length));
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isMountedRef = useRef(true);

  const buildWithMeta = useCallback(
    (
      rawStories: OrgStory[],
      views: OrgStoryView[],
      reactions: OrgStoryReaction[]
    ): OrgStoryWithMeta[] => {
      const viewedIds = new Set(
        views.filter((v) => v.user_id === currentUserId).map((v) => v.story_id)
      );

      return rawStories
        .map((story) => {
          const storyReactions = reactions.filter((r) => r.story_id === story.id);
          const myReaction = storyReactions.find((r) => r.user_id === currentUserId) ?? null;
          const viewerCount = views.filter((v) => v.story_id === story.id).length;

          return {
            ...story,
            isViewedByMe: viewedIds.has(story.id),
            myReaction,
            reactions: storyReactions,
            viewerCount,
          };
        })
        .sort((a, b) => {
          // پین‌شده‌ها اول
          if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
          // دیده‌نشده‌ها قبل از دیده‌شده‌ها
          if (a.isViewedByMe !== b.isViewedByMe) return a.isViewedByMe ? 1 : -1;
          // جدیدترین اول
          return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
        });
    },
    [currentUserId]
  );

  const fetchData = useCallback(async () => {
    if (!orgId || !enabled) return;
    // فقط loading نشان می‌دهیم اگر داده اولیه نداریم
    if (!hasInitialDataRef.current) setLoading(true);
    try {
      const now = new Date().toISOString();

      // استوری‌های فعال و منتشرشده
      const { data: rawStories, error: storiesError } = await supabase
        .from('org_stories')
        .select('*')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .lte('published_at', now)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order('is_pinned', { ascending: false })
        .order('published_at', { ascending: false });

      if (storiesError || !rawStories?.length) {
        if (isMountedRef.current) setStories([]);
        return;
      }

      const storyIds = rawStories.map((s: OrgStory) => s.id);

      // بازدیدها و واکنش‌ها را موازی fetch می‌کنیم
      const [{ data: views }, { data: reactions }] = await Promise.all([
        supabase.from('org_story_views').select('*').in('story_id', storyIds),
        supabase.from('org_story_reactions').select('*').in('story_id', storyIds),
      ]);

      if (isMountedRef.current) {
        setStories(
          buildWithMeta(rawStories as OrgStory[], (views ?? []) as OrgStoryView[], (reactions ?? []) as OrgStoryReaction[])
        );
        hasInitialDataRef.current = true;
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [orgId, enabled, buildWithMeta]);

  // Realtime subscription
  useEffect(() => {
    if (!orgId || !enabled) return;

    fetchData();

    const channel = supabase
      .channel(`org-stories-${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'org_stories', filter: `org_id=eq.${orgId}` },
        () => { fetchData(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'org_story_reactions' },
        () => { fetchData(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'org_story_views' },
        () => { fetchData(); }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      isMountedRef.current = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [orgId, enabled, fetchData]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const markViewed = useCallback(
    async (storyId: string) => {
      if (!currentUserId) return;
      // از تابع RPC استفاده می‌کنیم تا شمارنده هم به‌روز شود
      await supabase.rpc('record_story_view', {
        p_story_id: storyId,
        p_user_id: currentUserId,
      });
      // به‌روزرسانی local state
      setStories((prev) =>
        prev.map((s) =>
          s.id === storyId ? { ...s, isViewedByMe: true } : s
        )
      );
    },
    [currentUserId]
  );

  const toggleReaction = useCallback(
    async (storyId: string, emoji: string) => {
      if (!currentUserId) return;

      const story = stories.find((s) => s.id === storyId);
      if (!story) return;

      if (story.myReaction) {
        // حذف واکنش موجود
        await supabase
          .from('org_story_reactions')
          .delete()
          .eq('story_id', storyId)
          .eq('user_id', currentUserId);
      } else {
        // افزودن واکنش جدید
        await supabase.from('org_story_reactions').upsert({
          story_id: storyId,
          user_id: currentUserId,
          emoji,
        });
      }
    },
    [currentUserId, stories]
  );

  const deleteStory = useCallback(async (storyId: string) => {
    await supabase.from('org_stories').delete().eq('id', storyId);
  }, []);

  const togglePin = useCallback(async (storyId: string, isPinned: boolean) => {
    await supabase
      .from('org_stories')
      .update({ is_pinned: !isPinned, updated_at: new Date().toISOString() })
      .eq('id', storyId);
  }, []);

  return {
    stories,
    loading,
    refresh: fetchData,
    markViewed,
    toggleReaction,
    deleteStory,
    togglePin,
  };
};
