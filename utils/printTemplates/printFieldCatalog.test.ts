import { describe, expect, it } from 'vitest';
import {
  buildModulePrintFieldCatalog,
  expandLegacyTableSelection,
  getSelectedPrintTableColumns,
} from './printFieldCatalog';

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
});
