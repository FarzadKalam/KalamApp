import { insertNotesWithFallback } from './noteDispatch';
import { serializeNoteContent } from './noteContent';
import type { StorySlide } from '../components/stories/storyTypes';
import { SAAS_STORY_CREATOR_NAME } from '../components/stories/storyTypes';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const extractMentionUserIdsFromSlides = (slides: StorySlide[] | null | undefined): string[] => {
  const ids = new Set<string>();
  (Array.isArray(slides) ? slides : []).forEach((slide) => {
    (Array.isArray(slide?.stickers) ? slide.stickers : []).forEach((sticker) => {
      if (sticker?.type === 'mention') {
        const userId = String(sticker.user_id || '').trim();
        if (UUID_PATTERN.test(userId)) {
          ids.add(userId);
        }
      }
    });
  });
  return Array.from(ids);
};

export interface BuildStoryMentionSystemNoteInput {
  orgId: string;
  storyId: string;
  creatorId: string;
  creatorName?: string | null;
  isSaasWide?: boolean;
  mentionUserIds: string[];
  previousMentionUserIds?: string[];
  appOrigin?: string | null;
}

export const buildStoryMentionSystemNotePayload = ({
  orgId,
  storyId,
  creatorId,
  creatorName,
  isSaasWide = false,
  mentionUserIds,
  previousMentionUserIds = [],
  appOrigin,
}: BuildStoryMentionSystemNoteInput) => {
  const normalizedOrgId = String(orgId || '').trim();
  const normalizedStoryId = String(storyId || '').trim();
  const normalizedCreatorId = String(creatorId || '').trim();
  if (!normalizedOrgId || !normalizedStoryId) return null;

  const previousSet = new Set(
    (previousMentionUserIds || []).map((id) => String(id || '').trim()).filter(Boolean),
  );

  const recipients = Array.from(
    new Set(
      (mentionUserIds || [])
        .map((id) => String(id || '').trim())
        .filter((id) => UUID_PATTERN.test(id) && id !== normalizedCreatorId && !previousSet.has(id)),
    ),
  );

  if (recipients.length === 0) return null;

  const displayCreator = isSaasWide
    ? SAAS_STORY_CREATOR_NAME
    : (String(creatorName || '').trim() || 'همکار شما');

  const cleanOrigin = String(appOrigin || '').trim().replace(/\/+$/, '');
  const relativeStoryUrl = `/dashboard?storyId=${encodeURIComponent(normalizedStoryId)}`;
  const storyLink = cleanOrigin ? `${cleanOrigin}${relativeStoryUrl}` : relativeStoryUrl;

  const text = [
    `📢 **${displayCreator}** شما را در یک استوری منشن کرد.`,
    `برای مشاهده این استوری به صفحه داشبورد مراجعه کنید:`,
    storyLink,
  ].join('\n');

  return {
    org_id: normalizedOrgId,
    module_id: '',
    record_id: '',
    content: serializeNoteContent(text),
    reply_to: null,
    mention_user_ids: recipients,
    mention_role_ids: [] as string[],
    author_id: null,
    author_name: displayCreator,
    source_type: 'system',
    metadata: {
      source_type: 'system',
      notification_surface: 'system_feed',
      requires_action: false,
      conversation_key: 'system',
      story_id: normalizedStoryId,
      story_creator_id: normalizedCreatorId || null,
      story_creator_name: displayCreator,
      action_url: relativeStoryUrl,
    },
  };
};

export const sendStoryMentionSystemNotifications = async (
  input: Omit<BuildStoryMentionSystemNoteInput, 'appOrigin'>,
) => {
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const payload = buildStoryMentionSystemNotePayload({
    ...input,
    appOrigin,
  });
  if (!payload) return [];
  return insertNotesWithFallback([payload], { returning: 'minimal' });
};
