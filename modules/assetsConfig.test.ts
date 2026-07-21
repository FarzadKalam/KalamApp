import { describe, expect, it } from 'vitest';
import { MODULES } from '../moduleRegistry';
import { supportsGlobalAssignee } from '../utils/assigneeSupport';
import { supportsSystemCode } from '../utils/systemCode';
import { assetsConfig } from './assetsConfig';
import { deliveryFormsConfig } from './deliveryFormsConfig';
import { expenseDocumentsConfig } from './expenseDocumentsConfig';

describe('ماژول اموال', () => {
  it('در رجیستری و امکانات عمومی ثبت شده است', () => {
    expect(MODULES.assets).toBeDefined();
    expect(supportsSystemCode('assets')).toBe(true);
    expect(supportsGlobalAssignee('assets')).toBe(true);
  });

  it('فیلدهای عملیاتی ضروری را دارد', () => {
    const fieldKeys = assetsConfig.fields.map((field) => field.key);
    expect(fieldKeys).toEqual(expect.arrayContaining([
      'name',
      'system_code',
      'asset_tag_code',
      'status',
      'storage_location',
      'source_expense_document_id',
    ]));
    expect(assetsConfig.relationDisplay?.searchFields).toEqual(expect.arrayContaining(['system_code', 'asset_tag_code']));
  });

  it('هزینه و تحویل، ارتباط مال را نگه می‌دارند', () => {
    const expenseItems = expenseDocumentsConfig.blocks.find((block) => block.id === 'items');
    const deliveryItems = deliveryFormsConfig.blocks.find((block) => block.id === 'items');
    expect(expenseItems?.tableColumns?.some((column) => column.key === 'is_asset')).toBe(true);
    expect(deliveryItems?.tableColumns?.some((column) => column.key === 'asset_id')).toBe(true);
    expect(deliveryFormsConfig.fields.find((field) => field.key === 'storage_location')?.dynamicOptionsCategory).toBe('asset_storage_location');
  });
});
