import { describe, expect, it, vi } from 'vitest';
import {
  createSchemaCompatibleDataProvider,
  runSelectWithCompatibleColumns,
} from './selectCompat';

describe('runSelectWithCompatibleColumns', () => {
  it('drops known incompatible purchase invoice columns before executing lightweight selects', async () => {
    const attempted: string[] = [];
    const result = await runSelectWithCompatibleColumns({
      cacheKey: 'record-reference:purchase_invoices',
      columns: ['id', 'name', 'total_invoice_amount', 'system_code', 'description'],
      execute: async (selectExpr) => {
        attempted.push(selectExpr);
        return { data: [{ id: '1', system_code: 'P-1' }], error: null };
      },
    });

    expect(result.error).toBeNull();
    expect(attempted).toEqual(['id,name,total_invoice_amount,system_code']);
  });

  it('removes a reported missing column and remembers only that incompatibility', async () => {
    const cacheKey = `module-show:invoices:${Date.now()}`;
    const firstAttempts: string[] = [];
    const firstResult = await runSelectWithCompatibleColumns({
      cacheKey,
      columns: ['id', 'name', 'subtotal_before_tax', 'total_invoice_amount'],
      execute: async (selectExpr) => {
        firstAttempts.push(selectExpr);
        if (selectExpr.includes('subtotal_before_tax')) {
          return {
            data: null,
            error: {
              code: '42703',
              message: 'column invoices.subtotal_before_tax does not exist',
            },
          };
        }
        return {
          data: { id: '1', name: 'فاکتور', total_invoice_amount: 100 },
          error: null,
        };
      },
    });

    expect(firstResult.error).toBeNull();
    expect(firstAttempts).toEqual([
      'id,name,subtotal_before_tax,total_invoice_amount',
      'id,name,total_invoice_amount',
    ]);

    const secondAttempts: string[] = [];
    await runSelectWithCompatibleColumns({
      cacheKey,
      columns: ['id', 'name', 'subtotal_before_tax', 'total_invoice_amount'],
      execute: async (selectExpr) => {
        secondAttempts.push(selectExpr);
        return { data: { id: '2', name: 'فاکتور دوم' }, error: null };
      },
    });

    expect(secondAttempts).toEqual(['id,name,total_invoice_amount']);
  });

  it('does not cache a sparse fallback when the missing column cannot be identified', async () => {
    const cacheKey = `module-show:unknown-error:${Date.now()}`;
    const columns = ['id', 'name', 'amount', 'description'];
    let firstCallCount = 0;

    await runSelectWithCompatibleColumns({
      cacheKey,
      columns,
      execute: async (selectExpr) => {
        firstCallCount += 1;
        if (firstCallCount === 1) {
          return {
            data: null,
            error: { code: '42703', message: 'database column is unavailable' },
          };
        }
        return { data: { id: '1', name: 'رکورد' }, error: null };
      },
    });

    const secondAttempts: string[] = [];
    await runSelectWithCompatibleColumns({
      cacheKey,
      columns,
      execute: async (selectExpr) => {
        secondAttempts.push(selectExpr);
        return { data: { id: '2', name: 'رکورد کامل' }, error: null };
      },
    });

    expect(secondAttempts).toEqual(['id,name,amount,description']);
  });

  it('uses the actual record schema only when a show-query does not name its unavailable field', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST204', message: 'schema cache is stale' },
      })
      .mockResolvedValueOnce({ data: { id: 'invoice-1', name: 'فاکتور فروش' }, error: null });

    const result = await runSelectWithCompatibleColumns({
      cacheKey: 'select-compat-test:show-fallback',
      columns: ['id', 'name', 'total_invoice_amount'],
      fallbackToWildcard: true,
      execute,
    });

    expect(result.data).toEqual({ id: 'invoice-1', name: 'فاکتور فروش' });
    expect(execute.mock.calls.map(([select]) => select)).toEqual([
      'id,name,total_invoice_amount',
      '*',
    ]);
  });
});

describe('createSchemaCompatibleDataProvider', () => {
  it('removes only the unavailable field before retrying a generic module list', async () => {
    const getList = vi.fn()
      .mockRejectedValueOnce({
        code: 'PGRST204',
        message: "Could not find the 'optional_legacy_field' column of 'projects' in the schema cache",
      })
      .mockResolvedValueOnce({ data: [{ id: 'project-1', name: 'پروژه' }], total: 1 });
    const provider = createSchemaCompatibleDataProvider({ getList });

    const result = await provider.getList({
      resource: 'projects',
      meta: { select: 'id,name,optional_legacy_field' },
    });

    expect(result.data).toHaveLength(1);
    expect(getList).toHaveBeenCalledTimes(2);
    expect(getList.mock.calls[1][0].meta.select).toBe('id,name');
  });

  it('never reduces financial documents to a sparse schema fallback', async () => {
    const getList = vi.fn().mockResolvedValue({
      data: [{ id: 'invoice-1', invoiceItems: [{ quantity: 1 }], total_invoice_amount: 100 }],
      total: 1,
    });
    const provider = createSchemaCompatibleDataProvider({ getList });

    const result = await provider.getList({
      resource: 'invoices',
      meta: { select: 'id,invoiceItems,total_invoice_amount' },
    });

    expect(result.data[0].invoiceItems).toEqual([{ quantity: 1 }]);
    expect(getList).toHaveBeenCalledTimes(1);
    expect(getList.mock.calls[0][0].meta.select).toBe('id,invoiceItems,total_invoice_amount');
  });

  it('serializes excluded view values in the PostgREST not.in format', async () => {
    const getList = vi.fn().mockResolvedValue({ data: [], total: 0 });
    const provider = createSchemaCompatibleDataProvider({ getList });

    await provider.getList({
      resource: 'tasks',
      filters: [
        { field: 'status', operator: 'nin', value: ['canceled', 'completed', 'on_hold'] },
        {
          operator: 'or',
          value: [{ field: 'priority', operator: 'nin', value: ['low', 'medium'] }],
        },
      ],
    });

    expect(getList).toHaveBeenCalledWith(expect.objectContaining({
      filters: [
        { field: 'status', operator: 'not.in', value: '("canceled","completed","on_hold")' },
        {
          operator: 'or',
          value: [{ field: 'priority', operator: 'not.in', value: '("low","medium")' }],
        },
      ],
    }));
  });
});
