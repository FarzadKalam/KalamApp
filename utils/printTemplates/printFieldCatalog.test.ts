import { describe, expect, it } from 'vitest';
import {
  buildModulePrintFieldCatalog,
  expandLegacyTableSelection,
  getSelectedPrintTableColumns,
} from './printFieldCatalog';
import { isPathAllowedByModulePrintSettings } from './printableFields';

describe('print field catalog', () => {
  const moduleConfig = {
    id: 'product_bundles',
    fields: [
      { key: 'name', labels: { fa: 'نام جدید' }, order: 2 },
      { key: 'secret', labels: { fa: 'محرمانه' }, order: 3 },
    ],
    blocks: [{
      id: 'products',
      type: 'table',
      titles: { fa: 'اقلام پکیج' },
      tableColumns: [
        { key: 'product_id', title: 'محصول' },
        { key: 'quantity', title: 'تعداد' },
        { key: 'total_price', title: 'مبلغ' },
      ],
    }],
  };

  it('uses effective labels, printable blocks, and field permissions', () => {
    const catalog = buildModulePrintFieldCatalog({
      moduleConfig,
      record: { name: 'پکیج', products: [{ product_id: '1', quantity: 2 }] },
      canViewField: (key) => key !== 'secret' && key !== 'quantity',
    });

    expect(catalog.map((item) => item.key)).toEqual([
      'record.name',
      'block.products',
      'block.products.product_id',
      'block.products.total_price',
    ]);
    expect(catalog.find((item) => item.key === 'record.name')?.label).toBe('نام جدید');
  });

  it('migrates a legacy parent selection to all table columns', () => {
    const catalog = buildModulePrintFieldCatalog({ moduleConfig });
    expect(expandLegacyTableSelection(['block.products'], catalog)).toEqual([
      'block.products',
      'block.products.product_id',
      'block.products.quantity',
      'block.products.total_price',
    ]);
  });

  it('keeps an explicit empty table selection empty', () => {
    const block = moduleConfig.blocks[0];
    expect(getSelectedPrintTableColumns({
      block,
      blockId: 'products',
      selectedFieldKeys: [],
      hasExplicitSelection: true,
    })).toEqual([]);
    expect(getSelectedPrintTableColumns({
      block,
      blockId: 'products',
      selectedFieldKeys: ['block.products.product_id'],
      hasExplicitSelection: true,
    }).map((column) => column.key)).toEqual(['product_id']);
  });

  it('excludes json, progress_stages, readonly_lookup, inactive, and unprintable fields and enforces higher-level module switches', () => {
    const customConfig = {
      id: 'employees',
      fields: [
        { key: 'full_name', labels: { fa: 'نام و نام خانوادگی' }, type: 'text', order: 1 },
        { key: 'job_title', labels: { fa: 'سمت' }, blockId: 'work_info', type: 'text', order: 2 },
        { key: 'raw_payload', labels: { fa: 'داده خام' }, type: 'json', order: 3 },
        { key: 'stages', labels: { fa: 'مراحل' }, type: 'progress_stages', order: 4 },
        { key: 'secret_salary', labels: { fa: 'محرمانه' }, type: 'price', printable: false, order: 5 },
      ],
      blocks: [
        { id: 'work_info', type: 'field_group', titles: { fa: 'اطلاعات شغلی' } },
        {
          id: 'history',
          type: 'table',
          titles: { fa: 'سوابق' },
          tableColumns: [
            { key: 'title', title: 'عنوان', printable: true },
            { key: 'internal_note', title: 'یادداشت داخلی', printable: false },
          ],
        },
      ],
    };

    const catalog = buildModulePrintFieldCatalog({ moduleConfig: customConfig });
    expect(catalog.map((item) => item.key)).toEqual([
      'record.full_name',
      'record.job_title',
      'block.history',
      'block.history.title',
    ]);
    expect(catalog.find((item) => item.key === 'record.job_title')?.group).toBe('بخش: اطلاعات شغلی');
    expect(isPathAllowedByModulePrintSettings({ moduleConfig: customConfig, fieldPath: 'record.secret_salary' })).toBe(false);
    expect(isPathAllowedByModulePrintSettings({ moduleConfig: customConfig, fieldPath: 'block.history.internal_note' })).toBe(false);
    expect(isPathAllowedByModulePrintSettings({ moduleConfig: customConfig, fieldPath: 'record.full_name' })).toBe(true);
  });
});
