import { describe, expect, it } from 'vitest';
import {
  loadProcessTaskModalContext,
  mergeProcessTaskModalContext,
  processTaskModalContextNeedsStage,
} from './processTaskModalContext';

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

  it('loads task, runtime-stage and template-stage context lazily for a lightweight process card', async () => {
    const supabaseClient = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (table === 'tasks') {
                return {
                  data: {
                    id: 'task-1',
                    name: 'فعالیت نمونه',
                    recurrence_info: { process_task_custom_field_values: { accepted: true } },
                    process_run_stage_id: 'stage-1',
                  },
                  error: null,
                };
              }
              if (table === 'process_run_stages') {
                return {
                  data: {
                    id: 'stage-1',
                    template_stage_id: 'template-stage-1',
                    metadata: {
                      process_task_custom_fields: [{ key: 'accepted', type: 'checkbox' }],
                      process_task_status_options: [{ value: 'review', label: 'بازبینی اختصاصی' }],
                    },
                  },
                  error: null,
                };
              }
              return {
                data: { id: 'template-stage-1', metadata: {} },
                error: null,
              };
            },
          }),
        }),
      }),
    };

    const hydrated = await loadProcessTaskModalContext(supabaseClient, {
      id: 'stage-1',
      task_id: 'task-1',
    }, {
      taskId: 'task-1',
      processRunStageId: 'stage-1',
    });

    expect(hydrated.name).toBe('فعالیت نمونه');
    expect(hydrated.recurrence_info.process_task_custom_fields[0].key).toBe('accepted');
    expect(hydrated.recurrence_info.process_task_status_options[0].label).toBe('بازبینی اختصاصی');
    expect(hydrated.recurrence_info.process_task_custom_field_values).toEqual({ accepted: true });
  });
});
