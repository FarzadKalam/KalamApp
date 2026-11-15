// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { assertProcessOperationPermissions, processOperationReceipt } from './ai-process-operations';
const page = { moduleId: 'projects',recordId: 'project-reference' };
describe('central process operation policy', () => {
  it('requires edit for editing and does not substitute create permission', () => {
    expect(() => assertProcessOperationPermissions({ type: 'update_stage_task' },page,{ can: (_m,a) => a !== 'edit' })).toThrow();
    expect(() => assertProcessOperationPermissions({ type: 'update_stage_task' },page,{ can: (_m,a) => a !== 'create' })).not.toThrow();
  });
  it('rejects hidden fields, forbidden plans/modules, and alternate card targets', () => {
    expect(() => assertProcessOperationPermissions({ type: 'update_stage_task',custom_values: { hidden: 1 } },page,{ can: (_m,_a,f) => f !== 'hidden' })).toThrow();
    expect(() => assertProcessOperationPermissions({ type: 'materialize_template_to_tasks' },page,{ can: m => m !== 'process_runs' })).toThrow();
    expect(() => assertProcessOperationPermissions({ type: 'cancel_stage_task',record_id: 'other' },page,{ can: () => true })).toThrow();
  });
  it('builds the existing result-card contract for mixed created and updated records', () => {
    expect(processOperationReceipt([{ type: 'create_raw_process_with_tasks',process_run_id: 'run',title: 'فرآیند',created_tasks: [{ id: 'task',title: 'فعالیت' }] },
      { type: 'update_stage_task',updated_task_id: 'other-task',title: 'ویرایش فعالیت' }])).toEqual({
      created_records: [{ module_id: 'process_runs',id: 'run',title: 'فرآیند' },{ module_id: 'tasks',id: 'task',title: 'فعالیت' }],
      updated_records: [{ module_id: 'tasks',id: 'other-task',title: 'ویرایش فعالیت' }],
    });
  });
});
