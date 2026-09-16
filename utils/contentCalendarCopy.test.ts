import { describe, expect, it } from 'vitest';
import { buildContentCalendarTaskCopyDraft } from './contentCalendarCopy';

describe('content calendar task copy', () => {
  it('keeps custom-field labels, values, and custom statuses in the new draft', () => {
    const draft = buildContentCalendarTaskCopyDraft({
      calendarId: 'calendar-1', groupId: 'group-1', name: 'نسخهٔ کپی‌شده',
      sourceTask: {
        id: 'task-1', process_run_id: 'old-run', process_run_stage_id: 'old-stage',
        recurrence_info: {
          process_task_custom_fields: [{ key: 'campaign_goal', type: 'text', labels: { fa: 'هدف کمپین' } }],
          process_task_custom_field_values: { campaign_goal: 'معرفی محصول' },
          process_task_status_options: [{ value: 'review', label: 'آمادهٔ بازبینی' }],
        },
      },
    });
    expect(draft.recurrence_info.process_task_custom_fields[0].labels.fa).toBe('هدف کمپین');
    expect(draft.recurrence_info.process_task_custom_field_values).toEqual({ campaign_goal: 'معرفی محصول' });
    expect(draft.process_task_status_options[0].label).toBe('آمادهٔ بازبینی');
    expect(draft.process_run_id).toBeUndefined();
  });
});
