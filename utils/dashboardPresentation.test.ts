import { describe, expect, it } from 'vitest';
import { FieldType } from '../types';
import { getPersianMonthRange } from './calendarPresentation';
import { getSingleOptionLabel } from './optionHelpers';
import { formatRecordDisplayValue } from './recordDisplayFormatter';
import { getTaskStatusLabel } from './processTaskStatusOptions';

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

describe('dashboard Persian calendar and stored choices', () => {
  it.each([
    ['2026-11-09T12:00:00', '2026-10-23', '2026-11-21'],
    ['2025-03-20T12:00:00', '2025-02-19', '2025-03-20'],
    ['2025-03-21T12:00:00', '2025-03-21', '2025-04-20'],
  ])('uses Jalali month boundaries for %s', (anchor, from, to) => {
    const range = getPersianMonthRange(new Date(anchor));
    expect(dateKey(range.from)).toBe(from);
    expect(dateKey(range.to)).toBe(to);
  });

  it('resolves numeric and string dynamic values through their labels', () => {
    const field = { key: 'category', type: FieldType.SELECT, dynamicOptionsCategory: 'category' };
    expect(getSingleOptionLabel(field, '7', { category: [{ value: 7, label: 'تولید' }] })).toBe('تولید');
  });

  it('does not expose unknown stored keys or UUIDs', () => {
    const field = { key: 'category', type: FieldType.SELECT };
    expect(getSingleOptionLabel(field, 'raw_internal_key')).toBe('گزینهٔ ثبت‌شده');
    expect(formatRecordDisplayValue('raw_internal_key', field)).toBe('گزینهٔ ثبت‌شده');
    expect(getSingleOptionLabel(field, '11111111-1111-4111-8111-111111111111')).toBe('گزینهٔ ثبت‌شده');
    expect(getTaskStatusLabel('custom_review', null, [{ value: 'custom_review', label: 'تأیید مشتری' }])).toBe('تأیید مشتری');
    expect(getTaskStatusLabel('missing_custom_status', null, [])).toBe('وضعیت اختصاصی');
  });
});
