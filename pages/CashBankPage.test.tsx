import React from 'react';
import { App } from 'antd';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CashBankPage from './CashBankPage';

const mock = vi.hoisted(() => ({ rpc: vi.fn(), context: vi.fn(), table: null as any, print: null as any }));
vi.mock('../supabaseClient', () => ({ supabase: { rpc: mock.rpc } }));
vi.mock('../utils/permissions', () => ({ ACCOUNTING_PERMISSION_KEY: '__accounting', fetchCurrentUserRoleContext: mock.context }));
vi.mock('../utils/currency', () => ({ useCurrencyConfig: () => ({ label: 'تومان' }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../components/RelatedRecordPopover', () => ({ default: () => null }));
vi.mock('../components/table/ManagedDataTable', () => ({ default: (props: any) => { mock.table = props; return <div data-testid="ledger" />; } }));
vi.mock('../components/moduleList/ListPrintRuntime', () => ({ default: (props: any) => { mock.print = props; return <div data-testid="print" />; } }));

beforeEach(() => {
  mock.context.mockResolvedValue({ orgId: 'org-a', userId: 'user-a', permissions: {} });
  mock.table = null; mock.print = null;
  mock.rpc.mockImplementation(async (name: string) => ({ data: name === 'get_cash_bank_dashboard_stats' ? {} : name === 'get_cash_bank_unified_ledger_totals'
    ? { receiptTotal: '3000', paymentTotal: '2000' } : { rows: [{ row_key: 'row-a', row_type: 'receipt', amount: 100 }], total: 201 }, error: null }));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const ready = async () => { render(<App><CashBankPage /></App>); await screen.findByTestId('ledger'); await waitFor(() => expect(mock.table.dataSource).toHaveLength(1)); };
const filter = async () => { await act(async () => mock.table.onChange({}, { amount: [JSON.stringify({ from: 0, to: 5000 })], status: [JSON.stringify(['received'])] }, {}, { action: 'filter' })); };

describe('cash and bank report', () => {
  it('uses server-side filters and all matching rows for totals with tenant-scoped column preferences', async () => {
    await ready(); await filter();
    expect(mock.table.scopeKey).toContain(':org-a:user-a:');
    expect(mock.table.columns.every((column: any) => !column.onFilter)).toBe(true);
    expect(screen.queryByText('مانده تهاترهای باز')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'محاسبه جمع' }));
    await screen.findByRole('status', { name: 'جمع نتایج فیلترشده' });
    const pageCall = mock.rpc.mock.calls.filter(([name]) => name === 'get_cash_bank_unified_ledger_page').at(-1)!;
    const sumCall = mock.rpc.mock.calls.find(([name]) => name === 'get_cash_bank_unified_ledger_totals')!;
    expect(sumCall[1].p_filters).toEqual(pageCall[1].p_filters);
    expect(sumCall[1].p_filters).toMatchObject({ amount_from: 0, amount_to: 5000, statuses: ['received'] });
    expect(sumCall[1]).not.toHaveProperty('p_page');
  });

  it('discards a total calculated for filters the user has already changed', async () => {
    await ready();
    let finish!: (value: any) => void;
    mock.rpc.mockImplementation((name: string) => name === 'get_cash_bank_unified_ledger_totals'
      ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve({ data: { rows: [], total: 0 }, error: null }));
    fireEvent.click(screen.getByRole('button', { name: 'محاسبه جمع' }));
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    await filter();
    await act(async () => finish({ data: { receiptTotal: '999', paymentTotal: '888' }, error: null }));
    expect(screen.queryByRole('status', { name: 'جمع نتایج فیلترشده' })).toBeNull();
  });

  it('opens the central print surface with the current report fields and Persian labels', async () => {
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'چاپ نقد و بانک' }));
    fireEvent.click(await screen.findByText('چاپ صفحهٔ فعلی'));
    await screen.findByTestId('print');
    expect(mock.print.moduleId).toBe('cash_bank_ledger');
    expect(mock.print.rows[0].rowType).toBe('دریافت');
    expect(mock.print.visibleColumns).toContain('amount');
    expect(mock.print.summary).toBeNull();
  });

  it('prints the calculated filter totals and clears both print and totals after filters change', async () => {
    await ready(); await filter();
    fireEvent.click(screen.getByRole('button', { name: 'محاسبه جمع' }));
    await screen.findByRole('status', { name: 'جمع نتایج فیلترشده' });
    fireEvent.click(screen.getByRole('button', { name: 'چاپ نقد و بانک' }));
    fireEvent.click(await screen.findByText('چاپ صفحهٔ فعلی'));
    await screen.findByTestId('print');
    expect(mock.print.summary.values).toEqual({ receiptTotal: '۳٬۰۰۰', paymentTotal: '۲٬۰۰۰' });
    expect(mock.print.summary.title).toContain('همهٔ صفحات');
    await filter();
    expect(screen.queryByTestId('print')).toBeNull();
    expect(screen.queryByRole('status', { name: 'جمع نتایج فیلترشده' })).toBeNull();
  });
});
