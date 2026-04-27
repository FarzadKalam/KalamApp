import { describe, expect, it } from 'vitest';
import {
  canViewPrintTemplateFieldPath,
  filterPrintTemplateVariableOptions,
  sanitizeSelectedPrintFieldKeys,
} from './fieldAccess';

describe('print template field access', () => {
  const canViewField = (fieldKey: string) => {
    const denied = new Set(['buy_price', 'profit', 'items.profit', 'secret_block', 'assignee_id']);
    return !denied.has(String(fieldKey || '').trim());
  };

  it('denies hidden record fields', () => {
    expect(canViewPrintTemplateFieldPath('record.buy_price', canViewField)).toBe(false);
    expect(canViewPrintTemplateFieldPath('record.sell_price', canViewField)).toBe(true);
  });

  it('denies hidden block columns and blocks', () => {
    expect(canViewPrintTemplateFieldPath('block.items.profit', canViewField)).toBe(false);
    expect(canViewPrintTemplateFieldPath('block.items.price', canViewField)).toBe(true);
    expect(canViewPrintTemplateFieldPath('block.secret_block', canViewField)).toBe(false);
  });

  it('treats responsible.name like assignee permission', () => {
    expect(canViewPrintTemplateFieldPath('responsible.name', canViewField)).toBe(false);
  });

  it('filters variable options and sanitizes stored selections', () => {
    const visibleOptions = filterPrintTemplateVariableOptions(
      [
        { label: 'قیمت خرید', value: 'record.buy_price', kind: 'field', group: 'فیلدهای رکورد' },
        { label: 'قیمت فروش', value: 'record.sell_price', kind: 'field', group: 'فیلدهای رکورد' },
        { label: 'جدول اقلام', value: 'block.items', kind: 'block', group: 'بلاک‌ها' },
      ],
      canViewField,
    );

    expect(visibleOptions.map((item) => item.value)).toEqual(['record.sell_price', 'block.items']);
    expect(
      sanitizeSelectedPrintFieldKeys(
        ['record.buy_price', 'record.sell_price', 'record.sell_price', 'block.items.profit'],
        visibleOptions.map((item) => item.value),
      ),
    ).toEqual(['record.sell_price']);
  });
});
