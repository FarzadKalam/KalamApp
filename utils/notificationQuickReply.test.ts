import { describe, expect, it } from 'vitest';
import {
  canQuickReplyNotification,
  resolveDirectQuickReplyRecipient,
} from './notificationQuickReply';

describe('notification quick reply', () => {
  it('allows internal direct/group and bot messages', () => {
    expect(canQuickReplyNotification({
      section: 'notes',
      conversationKey: 'direct:user-a:user-b',
    })).toBe(true);
    expect(canQuickReplyNotification({
      section: 'notes',
      conversationKey: 'group:group-a',
    })).toBe(true);
    expect(canQuickReplyNotification({ section: 'bot_messages' })).toBe(true);
  });

  it('blocks system and assistant messages', () => {
    expect(canQuickReplyNotification({
      section: 'notes',
      category: 'system',
      conversationKey: 'direct:user-a:user-b',
    })).toBe(false);
    expect(canQuickReplyNotification({
      section: 'notes',
      category: 'assistant',
      conversationKey: 'group:group-a',
    })).toBe(false);
  });

  it('resolves only the other participant of a canonical direct conversation', () => {
    expect(resolveDirectQuickReplyRecipient('direct:user-a:user-b', 'user-a')).toBe('user-b');
    expect(resolveDirectQuickReplyRecipient('direct:user-a:user-b', 'user-c')).toBeNull();
  });
});
