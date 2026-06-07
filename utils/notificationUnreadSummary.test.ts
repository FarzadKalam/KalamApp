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
});
