import { describe, expect, it } from 'vitest';
import {
  areNotificationUnreadSummariesEqual,
  normalizeNotificationUnreadSummary,
} from './notificationUnreadSummary';

describe('notificationUnreadSummary', () => {
  it('compares normalized summaries by section counts', () => {
    const left = normalizeNotificationUnreadSummary([
      { section: 'notes', unread_count: 2 },
      { section: 'tasks', unread_count: 1 },
    ]);
    const right = { ...left };

    expect(areNotificationUnreadSummariesEqual(left, right)).toBe(true);
    expect(areNotificationUnreadSummariesEqual(left, { ...right, notes: 3 })).toBe(false);
  });

  it('keeps bot group and direct unread counts distinct from the aggregate badge', () => {
    const summary = normalizeNotificationUnreadSummary([
      { section: 'bot_messages', unread_count: 7 },
      { section: 'bot_group', unread_count: 4 },
      { section: 'bot_direct', unread_count: 3 },
    ]);

    expect(summary.bot_messages).toBe(7);
    expect(summary.bot_group_messages).toBe(4);
    expect(summary.bot_direct_messages).toBe(3);
  });

  it('normalizes v2 summary object fields for bot group and direct counts', () => {
    const summary = normalizeNotificationUnreadSummary({
      bot_unread: 12,
      bot_group_unread: 9,
      bot_direct_unread: 3,
    });

    expect(summary.bot_messages).toBe(12);
    expect(summary.bot_group_messages).toBe(9);
    expect(summary.bot_direct_messages).toBe(3);
  });
});
