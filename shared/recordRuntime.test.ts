import { describe, expect, it } from 'vitest';
import {
  evaluateCoreConditionOperator,
  renderTemplateAsync,
  renderTypedTemplateValue,
  sanitizeOutboundDisplay,
} from './recordRuntime';
import {
  evaluateWorkflowConditionCollectionWithResolver,
  evaluateWorkflowConditionWithResolver,
} from './workflowConditionRuntime';

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
    expect(evaluateCoreConditionOperator({ operator: 'contains', currentValue: ['فروش', 'ویژه'], expectedValue: 'ویژ', now })).toBe(true);
    expect(evaluateCoreConditionOperator({ operator: 'not_contains', currentValue: ['فروش'], expectedValue: 'لغوشده', now })).toBe(true);
    expect(evaluateCoreConditionOperator({ operator: 'unsupported_operator', currentValue: 'x', now })).toBe(false);
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
