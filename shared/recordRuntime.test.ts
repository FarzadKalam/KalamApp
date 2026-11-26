import { describe, expect, it } from 'vitest';
import {
  evaluateCoreConditionOperator,
  getCoreCalendarConditionBounds,
  renderTemplateAsync,
  renderTypedTemplateValue,
  sanitizeOutboundDisplay,
} from './recordRuntime';
import {
  evaluateWorkflowConditionCollectionWithResolver,
  evaluateWorkflowConditionWithResolver,
} from './workflowConditionRuntime';

describe('conditions on table rows', () => {
  const conditions = [
    { field: 'payment_type', operator: 'eq', value: 'online' },
    { field: 'status', operator: 'eq', value: 'received' },
  ];
  const pending = { payment_type: 'online', status: 'pending' };
  const cash = { payment_type: 'cash', status: 'received' };
  const online = { payment_type: 'online', status: 'received' };
  const evaluate = (operator: string, currentValue: unknown, value = conditions) =>
    evaluateWorkflowConditionWithResolver({
      condition: { field: 'payments', operator, value },
      resolveValues: async () => ({ currentValue }),
      evaluateAsyncOperator: async () => false,
    });

  it('checks all predicates on a single row before matching any row', async () => {
    expect(await evaluate('table_any', [pending, cash])).toBe(false);
    expect(await evaluate('table_any', [pending, cash, online])).toBe(true);
  });

  it('does not pass a negative or empty check when a related row field is unavailable', async () => {
    const field = '__workflow_related__product_id::products::category';
    const evaluateRelation = (operator: string, currentValue: unknown) => evaluateWorkflowConditionWithResolver({
      condition: { field: 'invoiceItems', operator: 'table_any', value: [{ field, operator, value: 'accepted' }] },
      resolveValues: async () => ({ currentValue: [{ product_id: 'item' }] }),
      resolveTableRowValue: async () => currentValue,
      evaluateAsyncOperator: async () => false,
    });
    expect(await evaluateRelation('neq', undefined)).toBe(false);
    expect(await evaluateRelation('is_null', undefined)).toBe(false);
    expect(await evaluateRelation('is_null', null)).toBe(true);
    expect(await evaluateRelation('eq', 'accepted')).toBe(true);
  });

  it('requires at least one active row and excludes deleted rows', async () => {
    expect(await evaluate('table_all', [])).toBe(false);
    expect(await evaluate('table_all', [online, { ...pending, _destroy: true }])).toBe(true);
    expect(await evaluate('table_all', [online, pending])).toBe(false);
    expect(await evaluate('table_any', [{ ...online, is_deleted: true }])).toBe(false);
    expect(await evaluate('table_any', [online], [])).toBe(false);
    expect(await evaluate('table_any', '[]')).toBe(false);
  });
});

describe('calendar query bounds', () => {
  it('uses the Tehran day across a UTC day boundary', () => {
    const now = new Date('2026-11-21T21:00:00Z');
    expect(getCoreCalendarConditionBounds('is_today', undefined, now)).toEqual({
      startDate: '2026-11-22', endDate: '2026-11-23',
      startInstant: '2026-11-21T20:30:00.000Z', endInstant: '2026-11-22T20:30:00.000Z',
    });
  });
});

describe('record runtime shared contract', () => {
  it('blanks unresolved tokens and redacts raw UUID values', async () => {
    const rendered = await renderTemplateAsync(
      'مشتری: {{customer}} / {{missing}}',
      async (key) => key === 'customer' ? '33333333-3333-4333-8333-333333333333' : null,
      async (value) => String(value),
    );

    expect(rendered).toBe('مشتری: [رکورد مرتبط] / ');
  });

  it('keeps public links intact while protecting raw identifiers', () => {
    expect(sanitizeOutboundDisplay('/i/public-token')).toBe('/i/public-token');
    expect(sanitizeOutboundDisplay('33333333-3333-4333-8333-333333333333')).toBe('[رکورد مرتبط]');
  });

  it('preserves exact-token types for task custom fields', () => {
    const rendered = renderTypedTemplateValue(
      { amount: '{{amount}}', title: 'مبلغ {{amount}}' },
      () => 1250,
    );
    expect(rendered).toEqual({ amount: 1250, title: 'مبلغ 1250' });
  });

  it('uses list-aware condition semantics for every runtime', () => {
    expect(evaluateCoreConditionOperator({
      operator: 'contains',
      currentValue: ['فروش', 'ویژه'],
      expectedValue: 'ویژ',
    })).toBe(true);
    expect(evaluateCoreConditionOperator({
      operator: 'not_in',
      currentValue: ['فعال'],
      expectedValue: ['لغوشده'],
    })).toBe(true);
    expect(evaluateCoreConditionOperator({
      operator: 'multi_count_gt',
      currentValue: ['فروش', 'ویژه', 'اولویت‌دار'],
      expectedValue: 2,
    })).toBe(true);
    expect(evaluateCoreConditionOperator({
      operator: 'multi_count_lt',
      currentValue: ['فروش'],
      expectedValue: 2,
    })).toBe(true);
  });

  it('covers change and date operators with deterministic values', () => {
    const now = new Date('2026-07-18T12:00:00.000Z');
    const date = '2026-07-18T08:30:00.000Z';

    expect(evaluateCoreConditionOperator({ operator: 'changed', currentValue: 'b', previousValue: 'a', now })).toBe(true);
    expect(evaluateCoreConditionOperator({ operator: 'changed_from', currentValue: 'b', previousValue: 'a', expectedValue: 'a', now })).toBe(true);
    expect(evaluateCoreConditionOperator({ operator: 'changed_to', currentValue: 'b', previousValue: 'a', expectedValue: 'b', now })).toBe(true);
    expect(evaluateCoreConditionOperator({ operator: 'is_today', currentValue: date, now })).toBe(true);
    expect(evaluateCoreConditionOperator({ operator: 'day_of_month_eq', currentValue: date, expectedValue: 18, now })).toBe(true);
    expect(evaluateCoreConditionOperator({ operator: 'is_this_month', currentValue: date, now })).toBe(true);
    expect(evaluateCoreConditionOperator({ operator: 'after_date', currentValue: '2026-07-19T00:00:00.000Z', expectedValue: '2026-07-18', now })).toBe(true);
    expect(evaluateCoreConditionOperator({ operator: 'before_date', currentValue: '2026-07-17T12:00:00.000Z', expectedValue: '2026-07-18', now })).toBe(true);
    expect(evaluateCoreConditionOperator({ operator: 'after_date', currentValue: '2026-07-18T12:00:00.000Z', expectedValue: '2026-07-18', now })).toBe(false);
    expect(evaluateCoreConditionOperator({ operator: 'gt', currentValue: '2026-07-19T00:00:00.000Z', expectedValue: '2026-07-18', now })).toBe(true);
    expect(evaluateCoreConditionOperator({ operator: 'gte', currentValue: '2026-07-18T12:00:00.000Z', expectedValue: '2026-07-18', now })).toBe(true);
    expect(evaluateCoreConditionOperator({ operator: 'lt', currentValue: '2026-07-17T12:00:00.000Z', expectedValue: '2026-07-18', now })).toBe(true);
    expect(evaluateCoreConditionOperator({ operator: 'lte', currentValue: '2026-07-18T12:00:00.000Z', expectedValue: '2026-07-18', now })).toBe(true);
    expect(evaluateCoreConditionOperator({ operator: 'gt', currentValue: 3, expectedValue: 2, now })).toBe(true);
    expect(evaluateCoreConditionOperator({ operator: 'contains', currentValue: ['فروش', 'ویژه'], expectedValue: 'ویژ', now })).toBe(true);
    expect(evaluateCoreConditionOperator({ operator: 'not_contains', currentValue: ['فروش'], expectedValue: 'لغوشده', now })).toBe(true);
    expect(evaluateCoreConditionOperator({ operator: 'unsupported_operator', currentValue: 'x', now })).toBe(false);
  });

  it('evaluates calendar operators in Tehran rather than the host timezone', () => {
    const now = new Date('2026-09-24T20:45:00.000Z');
    // این مقدار در UTC روز قبل است، اما در تهران ابتدای روز ۲۵ شهریور/سپتامبر است.
    const justAfterMidnightTehran = '2026-09-24T20:35:00.000Z';
    const previousTehranDay = '2026-09-24T19:59:59.000Z';

    expect(evaluateCoreConditionOperator({ operator: 'is_today', currentValue: justAfterMidnightTehran, now })).toBe(true);
    expect(evaluateCoreConditionOperator({ operator: 'is_yesterday', currentValue: previousTehranDay, now })).toBe(true);
    expect(evaluateCoreConditionOperator({
      operator: 'date_between',
      currentValue: justAfterMidnightTehran,
      expectedValue: { from: '2026-09-25', to: '2026-09-25' },
      now,
    })).toBe(true);
  });

  it('uses the shared workflow condition contract for resolved server fields', async () => {
    const values = { tags: ['فروش', 'ویژه'], score: 3 };
    const evaluate = (condition: { field?: unknown; operator?: unknown; value?: unknown }) =>
      evaluateWorkflowConditionWithResolver({
        condition,
        resolveValues: async () => ({ currentValue: values[String(condition.field || '') as keyof typeof values] }),
        evaluateAsyncOperator: async () => false,
      });

    await expect(evaluateWorkflowConditionCollectionWithResolver({
      conditionsAll: [{ field: 'tags', operator: 'multi_count_gt', value: 1 }],
      conditionsAny: [{ field: 'score', operator: 'gte', value: 3 }],
      evaluate,
    })).resolves.toBe(true);
  });
});
