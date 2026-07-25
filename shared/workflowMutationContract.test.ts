import { describe, expect, it } from 'vitest';
import {
  getCompatibleWorkflowSourceFields,
  getWorkflowDateCriteria,
  isWorkflowFieldValueCompatible,
  resolveWorkflowDateCriterion,
} from './workflowMutationContract';

describe('workflow mutation contract', () => {
  const date = { key: 'start_date', type: 'date' };
  const datetime = { key: 'started_at', type: 'datetime' };

  it('only exposes compatible source fields', () => {
    expect(getCompatibleWorkflowSourceFields(date, [date, datetime, { key: 'name', type: 'text' }]).map((field) => field.key))
      .toEqual(['start_date']);
    expect(isWorkflowFieldValueCompatible({ key: 'project_id', type: 'relation', relationConfig: { targetModule: 'projects' } }, {
      key: 'other_project', type: 'relation', relationConfig: { targetModule: 'projects' },
    })).toBe(true);
    expect(isWorkflowFieldValueCompatible({ key: 'project_id', type: 'relation', relationConfig: { targetModule: 'projects' } }, {
      key: 'customer_id', type: 'relation', relationConfig: { targetModule: 'customers' },
    })).toBe(false);
  });

  it('uses PersianDatePicker storage formats for date criteria', () => {
    const now = new Date('2026-07-25T10:30:00.000Z');
    expect(getWorkflowDateCriteria(date).map((item) => item.value)).toEqual(['manual', 'today', 'yesterday']);
    expect(getWorkflowDateCriteria(datetime).map((item) => item.value)).toEqual(['manual', 'now', 'yesterday']);
    expect(resolveWorkflowDateCriterion(date, 'today', now)).toMatch(/^2026-07-25$/);
    expect(resolveWorkflowDateCriterion(datetime, 'now', now)).toBe(now.toISOString());
    expect(resolveWorkflowDateCriterion(date, 'manual', now)).toBeUndefined();
  });
});
