import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import type { OrgStoryWithMeta } from './storyTypes';
import { fetchActiveOrgStoriesWithMeta } from '../../utils/orgStories';

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

  const fetchData = useCallback(async () => {
    if (!orgId || !enabled) return;
    if (!hasInitialDataRef.current) setLoading(true);
    try {
      const nextStories = await fetchActiveOrgStoriesWithMeta({
        supabaseClient: supabase,
        orgId,
        currentUserId,
      });

      if (isMountedRef.current) {
        setStories(nextStories);
        hasInitialDataRef.current = true;
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [currentUserId, enabled, orgId]);

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
        { event: '*', schema: 'public', table: 'org_story_reactions', filter: `org_id=eq.${orgId}` },
        () => { fetchData(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'org_story_views', filter: `org_id=eq.${orgId}` },
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
      await supabase.rpc('record_story_view', {
        p_story_id: storyId,
      });
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
        await supabase
          .from('org_story_reactions')
          .delete()
          .eq('story_id', storyId)
          .eq('user_id', currentUserId);
      } else {
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
