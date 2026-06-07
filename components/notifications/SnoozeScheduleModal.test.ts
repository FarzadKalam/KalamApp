import { describe, expect, it } from 'vitest';
import { buildSnoozePresetOptions } from './SnoozeScheduleModal';

describe('snooze schedule presets', () => {
  it('includes the four expected quick choices', () => {
    const options = buildSnoozePresetOptions(new Date('2026-06-06T10:00:00.000Z'));
    expect(options.map((option) => option.label)).toEqual([
      'یک ساعت دیگر',
      'چهار ساعت دیگر',
      'فردا',
      'پس‌فردا',
    ]);
    expect(new Date(options[0].value).getTime()).toBe(new Date('2026-06-06T11:00:00.000Z').getTime());
    expect(new Date(options[1].value).getTime()).toBe(new Date('2026-06-06T14:00:00.000Z').getTime());
  });
});
