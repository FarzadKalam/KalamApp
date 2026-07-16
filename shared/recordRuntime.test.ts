import { describe, expect, it } from 'vitest';
import {
  evaluateCoreConditionOperator,
  renderTemplateAsync,
  renderTypedTemplateValue,
  sanitizeOutboundDisplay,
} from './recordRuntime';

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
  });
});
