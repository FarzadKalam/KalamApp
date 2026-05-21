import { describe, expect, it } from 'vitest';
import {
  buildDefaultTemplatesForModule,
  buildSystemTemplateFieldOptionsForModule,
  getPrintTemplateVariables,
  getSystemTemplateFieldOptions,
  isPrintTemplateAvailableForModule,
} from './store';
import { BlockType, FieldLocation, FieldType } from '../../types';

describe('print template store grouping', () => {
  it('groups billboard record fields by general and module sections', () => {
    const variableOptions = getPrintTemplateVariables('billboards');
    const systemFieldOptions = getSystemTemplateFieldOptions('billboards');

    expect(variableOptions.find((item) => item.value === 'record.name')?.group).toBe('فیلدهای عمومی');
    expect(variableOptions.find((item) => item.value === 'record.width')?.group).toBe('بخش: اطلاعات پایه');
    expect(variableOptions.find((item) => item.value === 'record.address')?.group).toBe('بخش: اطلاعات پایه');

    expect(systemFieldOptions.find((item) => item.key === 'record.name')?.group).toBe('فیلدهای عمومی');
    expect(systemFieldOptions.find((item) => item.key === 'record.width')?.group).toBe('بخش: اطلاعات پایه');
    expect(systemFieldOptions.find((item) => item.key === 'record.related_customer')?.group).toBe('بخش: جزئیات اکران');
  });

  it('builds system print fields from a runtime module config', () => {
    const runtimeModule = {
      id: 'runtime_test',
      fields: [
        { key: 'name', labels: { fa: 'عنوان' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1 },
        { key: 'full_address', labels: { fa: 'آدرس کامل' }, type: FieldType.LONG_TEXT, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 2 },
      ],
      blocks: [
        { id: 'baseInfo', titles: { fa: 'اطلاعات پایه' }, type: BlockType.FIELD_GROUP, order: 1 },
      ],
    };

    const runtimeFields = buildSystemTemplateFieldOptionsForModule(runtimeModule);

    expect(runtimeFields.find((item) => item.key === 'record.name')?.group).toBe('فیلدهای عمومی');
    expect(runtimeFields.find((item) => item.key === 'record.full_address')?.group).toBe('بخش: اطلاعات پایه');
  });

  it('exposes list and operational summary variables for operational financial overview templates', () => {
    const variableOptions = getPrintTemplateVariables('operational_financial_overview_customer');

    expect(variableOptions.find((item) => item.value === 'system.list_summary_table')?.scopes).toContain('list');
    expect(variableOptions.find((item) => item.value === 'summary.totalDebit')?.group).toBe('جمع‌بندی وضعیت مالی');
    expect(variableOptions.find((item) => item.value === 'summary.finalBalanceSide')?.scopes).toContain('list');
  });

  it('keeps full-page catalog defaults only for products and billboards', () => {
    const productDefaults = buildDefaultTemplatesForModule('products');
    const billboardDefaults = buildDefaultTemplatesForModule('billboards');
    const customerDefaults = buildDefaultTemplatesForModule('customers');

    expect(productDefaults.some((item) => item.id === 'default_products_catalog_fullpage_landscape')).toBe(true);
    expect(productDefaults.some((item) => item.id === 'default_products_catalog_fullpage_list_landscape')).toBe(true);
    expect(billboardDefaults.some((item) => item.id === 'default_billboards_catalog_fullpage_landscape')).toBe(true);
    expect(customerDefaults.some((item) => item.id.includes('_catalog_fullpage_'))).toBe(false);
    expect(
      isPrintTemplateAvailableForModule('customers', {
        id: 'default_customers_catalog_fullpage_list_landscape',
        contentHtml: '{{system.list_catalog_fullpage}}',
      })
    ).toBe(false);
  });
});
