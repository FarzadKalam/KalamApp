import { describe, expect, it } from 'vitest';
import { buildStoryReplyPayload } from './storyReplies';

describe('buildStoryReplyPayload', () => {
  it('creates an org-scoped direct note for the story creator', () => {
    expect(buildStoryReplyPayload({
      orgId: 'org-1',
      storyId: 'story-1',
      slideId: 'slide-1',
      creatorId: 'creator-1',
      currentUserId: 'viewer-1',
      currentUserName: 'کاربر بیننده',
      text: '  پاسخ من  ',
    })).toEqual({
      org_id: 'org-1',
      module_id: '',
      record_id: '',
      content: 'پاسخ من',
      reply_to: null,
      mention_user_ids: ['creator-1'],
      mention_role_ids: [],
      author_id: 'viewer-1',
      author_name: 'کاربر بیننده',
      metadata: {
        source_type: 'story_reply',
        story_id: 'story-1',
        story_slide_id: 'slide-1',
      },
    });
  });

  it('rejects empty replies and replies to the current users own story', () => {
    const baseInput = {
      orgId: 'org-1',
      storyId: 'story-1',
      slideId: 'slide-1',
      creatorId: 'user-1',
      currentUserId: 'user-2',
      text: 'پاسخ',
    };

    expect(buildStoryReplyPayload({ ...baseInput, text: '   ' })).toBeNull();
    expect(buildStoryReplyPayload({
      ...baseInput,
      currentUserId: 'user-1',
    })).toBeNull();
  });
});
