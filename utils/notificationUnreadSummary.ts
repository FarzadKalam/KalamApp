export type NotificationUnreadSection =
  | 'notes'
  | 'bot_messages'
  | 'sms_messages'
  | 'voip_calls'
  | 'tasks'
  | 'responsibilities';

export type NotificationUnreadSummaryMap = Record<NotificationUnreadSection, number>;

export const EMPTY_NOTIFICATION_UNREAD_SUMMARY: NotificationUnreadSummaryMap = {
  notes: 0,
  bot_messages: 0,
  sms_messages: 0,
  voip_calls: 0,
  tasks: 0,
  responsibilities: 0,
};

const SECTION_ALIASES: Record<string, NotificationUnreadSection> = {
  notes: 'notes',
  internal: 'notes',
  bot: 'bot_messages',
  bot_messages: 'bot_messages',
  sms: 'sms_messages',
  sms_messages: 'sms_messages',
  voip: 'voip_calls',
  voip_calls: 'voip_calls',
  tasks: 'tasks',
  responsibilities: 'responsibilities',
};

const toSafeCount = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

export const normalizeNotificationUnreadSummary = (value: unknown): NotificationUnreadSummaryMap => {
  const next: NotificationUnreadSummaryMap = { ...EMPTY_NOTIFICATION_UNREAD_SUMMARY };
  const rows = Array.isArray(value) ? value : (value && typeof value === 'object' ? [value] : []);

  rows.forEach((row: any) => {
    const section = SECTION_ALIASES[String(row?.section || '').trim()];
    if (section) {
      next[section] = toSafeCount(row?.unread_count ?? row?.count ?? row?.value);
      return;
    }

    if ('internal_unread' in row) next.notes = toSafeCount(row.internal_unread);
    if ('bot_unread' in row) next.bot_messages = toSafeCount(row.bot_unread);
    if ('sms_unread' in row) next.sms_messages = toSafeCount(row.sms_unread);
    if ('voip_unread' in row) next.voip_calls = toSafeCount(row.voip_unread);
    if ('tasks_unread' in row) next.tasks = toSafeCount(row.tasks_unread);
    if ('responsibilities_unread' in row) next.responsibilities = toSafeCount(row.responsibilities_unread);
  });

  return next;
};

export const sumNotificationUnread = (
  summary: NotificationUnreadSummaryMap,
  sections: readonly NotificationUnreadSection[],
) => sections.reduce((sum, section) => sum + toSafeCount(summary[section]), 0);

export const areNotificationUnreadSummariesEqual = (
  left: NotificationUnreadSummaryMap,
  right: NotificationUnreadSummaryMap,
) => (
  left.notes === right.notes
  && left.bot_messages === right.bot_messages
  && left.sms_messages === right.sms_messages
  && left.voip_calls === right.voip_calls
  && left.tasks === right.tasks
  && left.responsibilities === right.responsibilities
);
