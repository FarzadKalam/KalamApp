import type { UiNotificationOverlayItem } from './uiNotificationOverlayStore';

export type NotificationOverlayTab = 'all' | 'agent' | 'internal' | 'activities' | 'responsibilities' | 'system' | 'bot' | 'sms' | 'voip' | 'uploads' | 'email';

/** Categorize the published item, including independent sources such as email. */
export const resolveNotificationOverlayTab = (item: Pick<UiNotificationOverlayItem, 'kind' | 'channel'>): Exclude<NotificationOverlayTab, 'all' | 'uploads'> => {
  if (item.kind === 'agent' || item.channel === 'agent') return 'agent';
  if (item.kind === 'task') return 'activities';
  if (item.kind === 'responsibility') return 'responsibilities';
  if (item.kind === 'email' || item.channel === 'email') return 'email';
  if (item.kind === 'bot' || item.channel === 'bot') return 'bot';
  if (item.kind === 'sms' || item.channel === 'sms') return 'sms';
  if (item.kind === 'voip_call' || item.channel === 'voip') return 'voip';
  if (item.kind === 'assistant' || item.channel === 'system') return 'system';
  return 'internal';
};

export const countNotificationOverlayTabs = (items: UiNotificationOverlayItem[], uploadCount: number): Record<NotificationOverlayTab, number> => {
  const counts = { all: items.length + uploadCount, uploads: uploadCount, agent: 0, internal: 0, activities: 0, responsibilities: 0, system: 0, bot: 0, sms: 0, voip: 0, email: 0 };
  for (const item of items) counts[resolveNotificationOverlayTab(item)] += 1;
  return counts;
};
