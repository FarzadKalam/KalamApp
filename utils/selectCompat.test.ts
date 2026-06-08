import { describe, expect, it } from 'vitest';
import { runSelectWithCompatibleColumns } from './selectCompat';

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
});
