import { describe, expect, it } from 'vitest';
import { buildAiCalendarDraft, isCalendarPlanningRequest, isCalendarProcessTemplate, normalizeCalendarSchedule } from './ai-content-calendar';

const schedule = {
  name: 'استوری معرفی محصول',
  content_type: 'story',
  start_date: '2026-11-28T09:00',
  due_date: '2026-11-28T17:00',
};

describe('AI content calendar', () => {
  it('recognizes a request to plan a calendar from an attachment', () => {
    expect(isCalendarPlanningRequest('طبق این فایل، تقویم محتوایی بچین')).toBe(true);
    expect(isCalendarPlanningRequest('این فایل چه اطلاعاتی دارد؟')).toBe(false);
  });

  it('accepts active templates that the calendar can use', () => {
    expect(isCalendarProcessTemplate({ module_ids: ['tasks'], is_active: true })).toBe(true);
    expect(isCalendarProcessTemplate({ module_id: 'content_calendars', is_active: false })).toBe(false);
    expect(isCalendarProcessTemplate({ module_id: 'invoices', is_active: true })).toBe(false);
  });

  it('checks calendar dates and preserves the selected template stage data', () => {
    expect(() => normalizeCalendarSchedule({ ...schedule, start_date: '2026-11-31T09:00', due_date: '2026-12-02T17:00' })).toThrow();
    expect(() => normalizeCalendarSchedule({ ...schedule, due_date: schedule.start_date })).toThrow();
    const draft = buildAiCalendarDraft({ ...schedule, template_stage_id: 'stage' }, 'calendar', 'draft', {
      id: 'template', name: 'تولید استوری',
      stages: [{ id: 'stage', metadata: { custom_fields: [{ key: 'brief' }] } }],
    });
    expect(draft).toMatchObject({ ...schedule, id: 'draft', is_draft: true, template_stage_id: 'stage',
      process_link_map: { content_calendars: 'calendar' }, custom_fields: [{ key: 'brief' }] });
  });
});
