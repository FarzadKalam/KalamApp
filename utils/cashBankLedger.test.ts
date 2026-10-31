import { describe, expect, it, vi } from 'vitest';
import { buildCashBankLedgerFilters, fetchCashBankLedgerPrintRows, formatCashBankLedgerTotal } from './cashBankLedger';

describe('cash bank ledger request contracts', () => {
  it('uses identical categorical, date, numeric and text filter values for all report operations', () => {
    expect(buildCashBankLedgerFilters({
      rowType: ['["receipt","payment"]'], paymentType: ['["cash"]'], status: ['["received"]'],
      amount: ['{"from":0,"to":1000}'], date: ['{"from":"2026-10-01","to":"2026-10-31"}'],
      personLabel: [' مشتری '], sourceLabel: ['فاکتور'],
    })).toMatchObject({ row_types: ['receipt','payment'], payment_types: ['cash'], statuses: ['received'], amount_from: 0, amount_to: 1000,
      date_from: '2026-10-01', date_to: '2026-10-31', person_query: 'مشتری', source_query: 'فاکتور' });
    expect(buildCashBankLedgerFilters({ amount: ['invalid'], status: ['invalid'] })).toMatchObject({ amount_from: '', statuses: [] });
  });

  it('prints all filtered pages using bounded requests and never fetches an arbitrary large limit', async () => {
    const filters = { rowType: ['["receipt"]'] };
    const rpc = vi.fn().mockResolvedValueOnce({ data: { rows: Array.from({ length: 200 }, (_, i) => ({ row_key: `r-${i}` })), total: 201 }, error: null })
      .mockResolvedValueOnce({ data: { rows: [{ row_key: 'last' }], total: 201 }, error: null });
    const rows = await fetchCashBankLedgerPrintRows({ rpc }, { filters, sortField: 'date', sortOrder: 'desc', isCurrent: () => true });
    expect(rows).toHaveLength(201);
    expect(rpc).toHaveBeenNthCalledWith(2, 'get_cash_bank_unified_ledger_page', expect.objectContaining({ p_page: 2, p_page_size: 200, p_filters: expect.objectContaining({ row_types: ['receipt'] }) }));
  });

  it('does not show a partial print after a failed or stale request', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: new Error('offline') }));
    await expect(fetchCashBankLedgerPrintRows({ rpc }, { filters: {}, sortField: 'date', sortOrder: 'desc', isCurrent: () => true })).rejects.toThrow('offline');
    const staleRpc = vi.fn(async () => ({ data: { rows: [{ row_key: 'stale' }], total: 1 }, error: null }));
    let current = true;
    const pending = fetchCashBankLedgerPrintRows({ rpc: staleRpc }, { filters: {}, sortField: 'date', sortOrder: 'desc', isCurrent: () => current });
    current = false;
    expect(await pending).toBeNull();
  });

  it('formats exact aggregate numeric text without rounding large monetary amounts', () => {
    expect(formatCashBankLedgerTotal('9007199254740993.17')).toBe('۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳٫۱۷');
    expect(formatCashBankLedgerTotal('0.000')).toBe('۰');
    expect(formatCashBankLedgerTotal('-1234.500')).toBe('-۱٬۲۳۴٫۵');
  });
});
