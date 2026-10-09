import { describe, expect, it } from 'vitest';
import { FieldType } from '../types';
import { applySafeReportConditionPrefilters } from './reportQueryPrefilters';

const makeQuery = () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const query: any = {};
  ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'not', 'or'].forEach((method) => {
    query[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return query;
    };
  });
  return { query, calls };
};

const taskModule = {
  id: 'tasks',
  fields: [
    { key: 'task_type', type: FieldType.SELECT },
    { key: 'start_date', type: FieldType.DATETIME },
    { key: 'completed_at', type: FieldType.DATETIME },
    { key: 'due_date', type: FieldType.DATE },
    { key: 'labels', type: FieldType.MULTI_SELECT },
    { key: 'customer_id', type: FieldType.RELATION },
  ],
};

describe('applySafeReportConditionPrefilters', () => {
  it('pushes direct task filters and every translatable any-date condition before the row limit', () => {
    const { query, calls } = makeQuery();
    applySafeReportConditionPrefilters(query, taskModule, {
      conditionsAll: [{ field: 'task_type', operator: 'in', value: ['جلسه', 'پیگیری'] }],
      conditionsAny: [
        { field: 'start_date', operator: 'is_today' },
        { field: 'completed_at', operator: 'is_today' },
      ],
    });

    expect(calls[0]).toEqual({ method: 'in', args: ['task_type', ['جلسه', 'پیگیری']] });
    expect(calls[1]?.method).toBe('or');
    expect(String(calls[1]?.args[0])).toContain('start_date.gte.');
    expect(String(calls[1]?.args[0])).toContain('completed_at.gte.');
  });

  it('keeps collection and relation-runtime conditions on the existing evaluator', () => {
    const { query, calls } = makeQuery();
    applySafeReportConditionPrefilters(query, taskModule, {
      conditionsAll: [{ field: 'labels', operator: 'in', value: ['فوری'] }],
      conditionsAny: [{ field: 'customer_id', operator: 'eq', value: 'record-id' }],
    });

    expect(calls).toEqual([]);
  });

  it('honors excluded dynamic fields while retaining safe scalar filters', () => {
    const { query, calls } = makeQuery();
    applySafeReportConditionPrefilters(query, {
      fields: [
        { key: 'status', type: FieldType.STATUS },
        { key: 'priority', type: FieldType.NUMBER },
      ],
    }, {
      conditionsAll: [
        { field: 'status', operator: 'eq', value: 'done' },
        { field: 'priority', operator: 'eq', value: 3 },
      ],
      excludedFieldKeys: ['status'],
    });

    expect(calls).toEqual([{ method: 'eq', args: ['priority', 3] }]);
  });

  it('pushes a scalar not-in condition to PostgREST without changing runtime-only filters', () => {
    const { query, calls } = makeQuery();
    applySafeReportConditionPrefilters(query, taskModule, {
      conditionsAll: [{ field: 'task_type', operator: 'not_in', value: ['تماس خروجی', 'جلسه داخلی'] }],
    });

    expect(calls).toEqual([{
      method: 'not',
      args: ['task_type', 'in', '("تماس خروجی","جلسه داخلی")'],
    }]);
  });

  it('translates a task assignee workflow condition before applying the row limit', () => {
    const { query, calls } = makeQuery();
    applySafeReportConditionPrefilters(query, taskModule, {
      conditionsAll: [{ field: '__workflow_assignee', operator: 'eq', value: 'user:29fcb9d2-2059-4c89-a17e-58abc0dbbeb4' }],
    });

    expect(calls).toEqual([{
      method: 'eq',
      args: ['assignee_id', '29fcb9d2-2059-4c89-a17e-58abc0dbbeb4'],
    }]);
  });

  it('compares DATE fields by Tehran calendar date instead of a UTC timestamp', () => {
    const { query, calls } = makeQuery();
    applySafeReportConditionPrefilters(query, taskModule, {
      conditionsAll: [{ field: 'due_date', operator: 'is_today' }],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('eq');
    expect(calls[0]?.args[0]).toBe('due_date');
    expect(calls[0]?.args[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
