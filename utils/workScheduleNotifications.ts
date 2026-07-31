export type WorkScheduleNotificationIntervalUnit = 'hour' | 'day';
export type WorkScheduleNotificationChannel = 'note' | 'email' | 'sms' | 'bot_group';

export interface WorkScheduleNotificationConfig {
  enabled: boolean;
  interval_value: number;
  interval_unit: WorkScheduleNotificationIntervalUnit;
  interval_at: string;
  /** ISO timestamp in UTC for the first automatic delivery. */
  first_run_at: string | null;
  recipient_user_ids: string[];
  bot_group_ids: string[];
  delivery_channels: WorkScheduleNotificationChannel[];
}

export const createDefaultWorkScheduleNotificationConfig = (): WorkScheduleNotificationConfig => ({
  enabled: false,
  interval_value: 1,
  interval_unit: 'day',
  interval_at: '',
  first_run_at: null,
  recipient_user_ids: [],
  bot_group_ids: [],
  delivery_channels: ['note'],
});

export const normalizeWorkScheduleNotificationConfig = (value: unknown): WorkScheduleNotificationConfig => {
  const defaults = createDefaultWorkScheduleNotificationConfig();
  const raw = value && typeof value === 'object' ? value as Record<string, any> : {};
  const intervalValue = Number.parseInt(String(raw.interval_value || defaults.interval_value), 10);
  const rawIntervalAt = String(raw.interval_at || '').trim();
  const intervalAt = /^([01]\d|2[0-3]):[0-5]\d$/.test(rawIntervalAt) ? rawIntervalAt : defaults.interval_at;
  const rawFirstRunAt = String(raw.first_run_at || '').trim();
  const firstRunDate = rawFirstRunAt ? new Date(rawFirstRunAt) : null;
  const channels = Array.isArray(raw.delivery_channels)
    ? raw.delivery_channels
      .map((item: unknown) => String(item || '').trim().toLowerCase())
      .filter((item: string): item is WorkScheduleNotificationChannel => ['note', 'email', 'sms', 'bot_group'].includes(item))
    : defaults.delivery_channels;

  return {
    enabled: raw.enabled === true,
    interval_value: Number.isFinite(intervalValue) ? Math.max(1, intervalValue) : defaults.interval_value,
    interval_unit: String(raw.interval_unit || '').trim().toLowerCase() === 'hour' ? 'hour' : 'day',
    interval_at: intervalAt,
    first_run_at: firstRunDate && !Number.isNaN(firstRunDate.getTime()) ? firstRunDate.toISOString() : null,
    recipient_user_ids: Array.isArray(raw.recipient_user_ids)
      ? raw.recipient_user_ids.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : [],
    bot_group_ids: Array.isArray(raw.bot_group_ids)
      ? raw.bot_group_ids.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : [],
    delivery_channels: channels.length > 0 ? channels : defaults.delivery_channels,
  };
};
