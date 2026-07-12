import { describe, expect, it } from 'vitest';
import { buildProcessActivatorRecordContext } from '../supabase/functions/_shared/process-activator-context';

describe('process activator record context', () => {
  it('exposes current target-module fields with the same linked keys saved by the UI', () => {
    const record = buildProcessActivatorRecordContext('employees', {
      id: 'employee-1',
      full_name: 'مجتبی جعفری',
      related_profile_id: 'profile-1',
      assignee_id: 'user-1',
    });

    expect(record.__linked__employees__related_profile_id).toBe('profile-1');
    expect(record.__linked__employees__full_name).toBe('مجتبی جعفری');
    expect(record.__linked__employees____workflow_assignee).toBe('user_user-1');
  });

  it('registers the matching record as a process link automatically', () => {
    const record = buildProcessActivatorRecordContext('employees', { id: 'employee-1' });
    expect(record.process_links).toEqual({ employees: 'employee-1' });
    expect(record.process_target_module_ids).toEqual(['employees']);
  });

  it('keeps no-condition activation scoped to each target record', () => {
    const first = buildProcessActivatorRecordContext('employees', { id: 'employee-1' });
    const second = buildProcessActivatorRecordContext('job_descriptions', { id: 'job-1' });
    expect(first.process_links).toEqual({ employees: 'employee-1' });
    expect(second.process_links).toEqual({ job_descriptions: 'job-1' });
  });
});
