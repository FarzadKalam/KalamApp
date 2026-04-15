import { describe, expect, it, vi } from 'vitest';
import {
  buildNoteConversations,
  buildSmsThreads,
  buildVoipThreads,
  getSmsThreadKey,
  normalizePhoneThreadValue,
} from './notificationViewModels';

const unread = () => false;

describe('notification view models', () => {
  it('normalizes Iranian phone values into stable thread keys', () => {
    expect(normalizePhoneThreadValue('+98 912 345 6789')).toBe('9123456789');
    expect(normalizePhoneThreadValue('0098-912-345-6789')).toBe('9123456789');
    expect(getSmsThreadKey({ id: 'sms-1', direction: 'inbound', sender: '+98 912 345 6789' })).toBe('sms:9123456789');
  });

  it('groups sms messages by counterparty and keeps Persian record labels', () => {
    const threads = buildSmsThreads({
      messages: [
        {
          id: 'sms-1',
          direction: 'inbound',
          sender: '+98 912 345 6789',
          message_text: 'سلام',
          module_id: 'customers',
          record_id: 'customer-1',
          message_at: '2026-04-15T08:00:00Z',
        },
        {
          id: 'sms-2',
          direction: 'outbound',
          recipient: '09123456789',
          message_text: 'پیگیری شد',
          module_id: 'customers',
          record_id: 'customer-1',
          message_at: '2026-04-15T09:00:00Z',
        },
      ],
      recordTitleMap: { 'customers:customer-1': 'مشتری تست' },
      isNotificationRead: unread,
    });

    expect(threads).toHaveLength(1);
    expect(threads[0].title).toBe('مشتری تست');
    expect(threads[0].preview).toBe('پیگیری شد');
    expect(threads[0].unreadCount).toBe(1);
    expect(threads[0].messages.map((item) => item.id)).toEqual(['sms-1', 'sms-2']);
  });

  it('groups voip calls and sorts newest thread first', () => {
    const threads = buildVoipThreads({
      calls: [
        { id: 'call-1', direction: 'incoming', source_number: '021111111', started_at: '2026-04-15T07:00:00Z' },
        { id: 'call-2', direction: 'incoming', source_number: '021222222', started_at: '2026-04-15T10:00:00Z' },
        { id: 'call-3', direction: 'outgoing', destination_number: '021111111', started_at: '2026-04-15T08:00:00Z' },
      ],
      isNotificationRead: unread,
    });

    expect(threads.map((thread) => thread.phone)).toEqual(['021222222', '021111111']);
    expect(threads[1].calls.map((call) => call.id)).toEqual(['call-3', 'call-1']);
  });

  it('builds note conversations in one pass for large notification datasets', () => {
    const users = Array.from({ length: 300 }, (_, index) => ({
      id: `user-${index}`,
      display_name: `کاربر ${index}`,
      role_id: index % 2 === 0 ? 'sales' : null,
    }));
    const groups = Array.from({ length: 25 }, (_, index) => ({
      id: `group-${index}`,
      name: `گروه ${index}`,
    }));
    const notes = Array.from({ length: 3000 }, (_, index) => {
      const isGroup = index % 5 === 0;
      const otherUserId = `user-${index % users.length}`;
      return {
        id: `note-${index}`,
        author_id: index % 3 === 0 ? otherUserId : 'current-user',
        mention_user_ids: index % 3 === 0 ? ['current-user'] : [otherUserId],
        metadata: isGroup ? { chat_group_id: `group-${index % groups.length}` } : null,
        created_at: new Date(Date.UTC(2026, 3, 15, 8, index % 60, index % 60)).toISOString(),
      };
    });
    const noteLookup = new Map(notes.map((note) => [note.id, note]));
    const isNotificationRead = vi.fn(unread);

    const startedAt = performance.now();
    const conversations = buildNoteConversations({
      availableDirectUsers: users,
      chatGroups: groups,
      notes,
      noteLookup,
      currentUserId: 'current-user',
      roleLookup: { sales: 'فروش' },
      isNotificationRead,
    });
    const elapsed = performance.now() - startedAt;

    expect(conversations.length).toBeGreaterThan(users.length);
    expect(conversations.some((item) => item.kind === 'group' && item.displayName.startsWith('گروه'))).toBe(true);
    expect(isNotificationRead.mock.calls.length).toBeLessThan(notes.length + groups.length + users.length);
    expect(elapsed).toBeLessThan(750);
  });
});
