import { describe, expect, it } from 'vitest';
import { mergeProcessTaskModalContext, processTaskModalContextNeedsStage } from './processTaskModalContext';

describe('process task modal context', () => {
  it('hydrates custom fields and statuses from the runtime stage for legacy list rows', () => {
    const task = {
      id: 'task-1',
      status: 'review',
      recurrence_info: { process_task_custom_field_values: { approved: true } },
    };
    const hydrated = mergeProcessTaskModalContext(task, {
      id: 'stage-1',
      metadata: {
        process_task_custom_fields: [{ key: 'approved', type: 'checkbox', labels: { fa: 'تأیید شد' } }],
        process_task_status_options: [{ value: 'review', label: 'بازبینی اختصاصی' }],
      },
    });

    expect(hydrated.recurrence_info.process_task_custom_fields[0].key).toBe('approved');
    expect(hydrated.recurrence_info.process_task_status_options[0].label).toBe('بازبینی اختصاصی');
    expect(hydrated.recurrence_info.process_task_custom_field_values).toEqual({ approved: true });
    expect(processTaskModalContextNeedsStage(hydrated)).toBe(false);
  });

  it('keeps task-level definitions authoritative over template fallbacks', () => {
    const hydrated = mergeProcessTaskModalContext({
      recurrence_info: {
        process_task_custom_fields: [{ key: 'task_field', type: 'text' }],
        process_task_status_options: [{ value: 'task_status', label: 'وضعیت فعالیت' }],
      },
    }, null, {
      metadata: {
        process_task_custom_fields: [{ key: 'template_field', type: 'text' }],
        process_task_status_options: [{ value: 'template_status', label: 'وضعیت الگو' }],
      },
    });

    expect(hydrated.recurrence_info.process_task_custom_fields[0].key).toBe('task_field');
    expect(hydrated.recurrence_info.process_task_status_options[0].value).toBe('task_status');
  });
});
