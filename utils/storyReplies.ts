import { insertNotesWithFallback } from './noteDispatch';
import { serializeNoteContent } from './noteContent';

export type StoryReplyInput = {
  orgId: string;
  storyId: string;
  slideId: string;
  creatorId: string;
  currentUserId: string;
  currentUserName?: string | null;
  text: string;
};

export const buildStoryReplyPayload = ({
  orgId,
  storyId,
  slideId,
  creatorId,
  currentUserId,
  currentUserName,
  text,
}: StoryReplyInput) => {
  const replyText = String(text || '').trim();
  const normalizedOrgId = String(orgId || '').trim();
  const normalizedStoryId = String(storyId || '').trim();
  const normalizedSlideId = String(slideId || '').trim();
  const normalizedCreatorId = String(creatorId || '').trim();
  const normalizedCurrentUserId = String(currentUserId || '').trim();

  if (
    !replyText
    || !normalizedOrgId
    || !normalizedStoryId
    || !normalizedSlideId
    || !normalizedCreatorId
    || !normalizedCurrentUserId
    || normalizedCreatorId === normalizedCurrentUserId
  ) {
    return null;
  }

  return {
    org_id: normalizedOrgId,
    module_id: '',
    record_id: '',
    content: serializeNoteContent(replyText),
    reply_to: null,
    mention_user_ids: [normalizedCreatorId],
    mention_role_ids: [],
    author_id: normalizedCurrentUserId,
    author_name: String(currentUserName || '').trim() || null,
    metadata: {
      source_type: 'story_reply',
      story_id: normalizedStoryId,
      story_slide_id: normalizedSlideId,
    },
  };
};

export const sendStoryReply = async (input: StoryReplyInput) => {
  const payload = buildStoryReplyPayload(input);
  if (!payload) throw new Error('متن پاسخ یا اطلاعات استوری کامل نیست.');
  return insertNotesWithFallback([payload]);
};
