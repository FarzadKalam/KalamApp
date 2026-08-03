import { describe, expect, it } from 'vitest';
import { runWriteWithCompatiblePayload } from './writeCompat';

describe('runWriteWithCompatiblePayload', () => {
  it('retries a write without a column missing from the schema cache', async () => {
    const payloads: Array<Record<string, unknown>> = [];
    const result = await runWriteWithCompatiblePayload<{ id: string }>({
      cacheKey: 'write-compat-test:purchase-invoices',
      payload: { name: 'فاکتور خرید', source_account: 'account-1' },
      execute: async (payload) => {
        payloads.push(payload);
        if ('source_account' in payload) {
          return {
            data: null,
            error: {
              code: 'PGRST204',
              message: "Could not find the 'source_account' column of 'purchase_invoices' in the schema cache",
            },
          };
        }
        return { data: { id: 'invoice-1' }, error: null };
      },
    });

    expect(result).toMatchObject({ data: { id: 'invoice-1' }, error: null });
    expect(payloads).toEqual([
      { name: 'فاکتور خرید', source_account: 'account-1' },
      { name: 'فاکتور خرید' },
    ]);
  });
});
