import { describe, expect, it } from 'vitest';
import {
  buildWorkflowStoryPublisherOptions,
  buildWorkflowStoryPublisherUserToken,
  normalizeWorkflowStoryPublisherToken,
  parseWorkflowStoryPublisherToken,
  resolveSystemWorkflowStoryPublisher,
  resolveUserWorkflowStoryPublisher,
  SYSTEM_STORY_PUBLISHER_TOKEN,
} from './workflowStoryPublisher';

describe('workflowStoryPublisher', () => {
  it('normalizes invalid publisher tokens back to system', () => {
    expect(normalizeWorkflowStoryPublisherToken(null)).toBe(SYSTEM_STORY_PUBLISHER_TOKEN);
    expect(normalizeWorkflowStoryPublisherToken('')).toBe(SYSTEM_STORY_PUBLISHER_TOKEN);
    expect(normalizeWorkflowStoryPublisherToken('invalid')).toBe(SYSTEM_STORY_PUBLISHER_TOKEN);
    expect(normalizeWorkflowStoryPublisherToken('user:user-1')).toBe('user:user-1');
  });

  it('builds system-first publisher options and keeps user tokens stable', () => {
    const options = buildWorkflowStoryPublisherOptions([
      { id: 'user-2', full_name: 'کاربر دوم' },
      { id: 'user-1', full_name: 'کاربر اول' },
    ]);

    expect(options[0]).toEqual({
      label: 'سیستم',
      value: SYSTEM_STORY_PUBLISHER_TOKEN,
    });
    expect(options.map((item) => item.value)).toContain(buildWorkflowStoryPublisherUserToken('user-1'));
    expect(options.map((item) => item.value)).toContain(buildWorkflowStoryPublisherUserToken('user-2'));
  });

  it('parses and resolves user and system publishers correctly', () => {
    expect(parseWorkflowStoryPublisherToken('user:user-9')).toEqual({
      kind: 'user',
      userId: 'user-9',
    });
    expect(parseWorkflowStoryPublisherToken('system')).toEqual({
      kind: 'system',
      userId: null,
    });

    expect(resolveSystemWorkflowStoryPublisher('https://example.com/logo.png')).toEqual({
      kind: 'system',
      creatorId: null,
      creatorName: 'سیستم',
      creatorAvatar: 'https://example.com/logo.png',
    });

    expect(resolveUserWorkflowStoryPublisher({
      id: 'user-3',
      full_name: 'کاربر تست',
      avatar_url: 'https://example.com/avatar.png',
    })).toEqual({
      kind: 'user',
      creatorId: 'user-3',
      creatorName: 'کاربر تست',
      creatorAvatar: 'https://example.com/avatar.png',
    });
  });
});
