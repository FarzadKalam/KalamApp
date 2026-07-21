import { describe, expect, it } from 'vitest';
import { FieldType, ModuleNature } from '../types';
import { buildModuleRecordProjection } from './moduleRecordProjection';

describe('module record projection', () => {
  it('keeps normal record fields in the first show response and defers only process drafts', () => {
    const projection = buildModuleRecordProjection({
      id: 'projects',
      table: 'projects',
      fields: [
        { key: 'name', type: FieldType.TEXT },
        { key: 'customer_id', type: FieldType.RELATION },
        { key: 'execution_process_draft', type: FieldType.JSON },
      ],
    } as any);

    expect(projection.initialColumns).toEqual(expect.arrayContaining(['id', 'name', 'customer_id']));
    expect(projection.initialColumns).not.toContain('execution_process_draft');
    expect(projection.deferredProcessDraftColumns).toEqual(['execution_process_draft']);
  });

  it('always reads a complete financial document so invoice lines cannot be omitted', () => {
    const projection = buildModuleRecordProjection({
      id: 'invoices',
      table: 'invoices',
      nature: ModuleNature.INVOICE,
      fields: [
        { key: 'invoiceItems', type: FieldType.JSON },
        { key: 'total_invoice_amount', type: FieldType.PRICE },
      ],
    } as any);

    expect(projection).toEqual({ initialColumns: ['*'], deferredProcessDraftColumns: [] });
  });

  it('includes stored table blocks even when they have no matching field definition', () => {
    const projection = buildModuleRecordProjection({
      id: 'price_lists',
      table: 'price_lists',
      fields: [{ key: 'name', type: FieldType.TEXT }],
      blocks: [
        { id: 'items', type: 'table' },
        { id: 'warehouse_shelves', type: 'table', externalDataConfig: { targetModule: 'shelves' } },
      ],
    } as any);

    expect(projection.initialColumns).toContain('items');
    expect(projection.initialColumns).not.toContain('warehouse_shelves');
  });
});
