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
});
