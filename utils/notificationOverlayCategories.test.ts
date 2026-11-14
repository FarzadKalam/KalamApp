import { describe, expect, it } from 'vitest';
import { countNotificationOverlayTabs, resolveNotificationOverlayTab } from './notificationOverlayCategories';
import type { UiNotificationOverlayItem } from './uiNotificationOverlayStore';

describe('notification popup categories', () => {
  it.each([
    ['note', 'internal', 'internal'], ['note', 'system', 'system'], ['assistant', 'internal', 'system'],
    ['agent', 'system', 'agent'], ['task', 'system', 'activities'], ['responsibility', 'system', 'responsibilities'],
    ['bot', 'bot', 'bot'], ['sms', 'sms', 'sms'], ['voip_call', 'voip', 'voip'], ['email', 'email', 'email'],
  ] as const)('maps real source %s/%s to %s', (kind, channel, expected) => {
    expect(resolveNotificationOverlayTab({ kind, channel })).toBe(expected);
  });
  it('counts separately published email and agent rows once, independently of global unread counters', () => {
    const items = [
      { kind: 'email', channel: 'email' }, { kind: 'note', channel: 'system' },
      { kind: 'agent', channel: 'agent' }, { kind: 'task', channel: 'system' },
    ] as UiNotificationOverlayItem[];
    const counts = countNotificationOverlayTabs(items, 2);
    expect(counts).toMatchObject({ all: 6, email: 1, agent: 1, system: 1, activities: 1, bot: 0, uploads: 2 });
    expect(Object.entries(counts).filter(([key]) => key !== 'all').reduce((sum, [, count]) => sum + count, 0)).toBe(counts.all);
  });
});
