import { describe, expect, it } from 'vitest';
import {
  SYSTEM_MESSAGES_USER_ID,
  buildDirectConversationKey,
  resolveConversationSelection,
} from './notificationConversationKeys';

describe('notification conversation keys', () => {
  it('builds one canonical key for both participant orders', () => {
    expect(buildDirectConversationKey('user-b', 'user-a')).toBe('direct:user-a:user-b');
    expect(buildDirectConversationKey('user-a', 'user-b')).toBe('direct:user-a:user-b');
  });

  it('resolves only conversations that contain the current user', () => {
    expect(resolveConversationSelection('direct:user-a:user-b', 'user-a')).toBe('user-b');
    expect(resolveConversationSelection('direct:user-a:user-b', 'user-c')).toBeUndefined();
  });

  it('keeps saved, system and group selections distinct', () => {
    expect(resolveConversationSelection('mine', 'user-a')).toBeNull();
    expect(resolveConversationSelection('system', 'user-a')).toBe(SYSTEM_MESSAGES_USER_ID);
    expect(resolveConversationSelection('group:team-a', 'user-a')).toBe('group:team-a');
  });
});
