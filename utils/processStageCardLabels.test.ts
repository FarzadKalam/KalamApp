import { describe, expect, it } from 'vitest';
import { FieldType } from '../types';
import {
  formatProcessStageDueLabel,
  getProcessTaskCustomFieldLabelFa,
} from './processStageCardLabels';

describe('processStageCardLabels', () => {
  it('formats near due dates with Persian relative labels and time', () => {
    const now = new Date('2026-07-09T10:00:00+03:30');

    expect(formatProcessStageDueLabel('2026-07-09T15:30:00+03:30', now)).toBe('امروز ساعت ۱۵:۳۰');
    expect(formatProcessStageDueLabel('2026-07-08T09:15:00+03:30', now)).toBe('دیروز ساعت ۰۹:۱۵');
    expect(formatProcessStageDueLabel('2026-07-11T12:00:00+03:30', now)).toBe('پس‌فردا ساعت ۱۲:۰۰');
    expect(formatProcessStageDueLabel('2026-06-29T08:00:00+03:30', now)).toBe('ده روز پیش ساعت ۰۸:۰۰');
  });

  it('does not expose English custom field keys as Persian labels', () => {
    expect(getProcessTaskCustomFieldLabelFa({
      key: 'approval_code',
      type: FieldType.TEXT,
      labels: { fa: 'approval_code', en: 'Approval code' },
    }, 0)).toBe('فیلد اختصاصی ۱');

    expect(getProcessTaskCustomFieldLabelFa({
      key: 'approval_code',
      type: FieldType.TEXT,
      labels: { fa: 'کد تایید', en: 'Approval code' },
    }, 0)).toBe('کد تایید');
  });
});
