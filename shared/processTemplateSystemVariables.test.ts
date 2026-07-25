import { describe, expect, it } from 'vitest';
import {
  assignProcessTemplateSystemVariableValues,
  getProcessTemplateSystemVariableValues,
} from './processTemplateSystemVariables';

describe('process template system date variables', () => {
  it('uses the Jalali calendar, Tehran time, and Persian digits for every rendered value', () => {
    const values = getProcessTemplateSystemVariableValues(new Date('2026-07-27T11:00:00.000Z'));

    expect(values).toEqual({
      current_date_numeric: '۱۴۰۵/۰۵/۰۵',
      current_date_words: 'پنجم مرداد ۱۴۰۵',
      current_datetime: '۱۴۰۵/۰۵/۰۵ ۱۴:۳۰',
      current_month: 'مرداد ۱۴۰۵',
      current_week: 'هفته اول مرداد ۱۴۰۵',
      current_season: 'تابستان ۱۴۰۵',
      current_year: 'سال ۱۴۰۵',
    });
  });

  it('also resolves the readable Persian labels without adding duplicate picker entries', () => {
    const target = assignProcessTemplateSystemVariableValues({}, new Date('2026-07-27T11:00:00.000Z'));

    expect(target['تاریخ امروز (عددی)']).toBe('۱۴۰۵/۰۵/۰۵');
    expect(target['هفته جاری']).toBe('هفته اول مرداد ۱۴۰۵');
  });
});
