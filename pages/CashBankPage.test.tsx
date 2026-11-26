import React from 'react';
import { App } from 'antd';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CashBankPage from './CashBankPage';

const mock = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), context: vi.fn(), table: null as any, print: null as any }));
vi.mock('../supabaseClient', () => ({ supabase: { rpc: mock.rpc, from: mock.from } }));
vi.mock('../utils/permissions', () => ({ ACCOUNTING_PERMISSION_KEY: '__accounting', fetchCurrentUserRoleContext: mock.context }));
vi.mock('../utils/currency', () => ({ useCurrencyConfig: () => ({ label: 'تومان' }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../components/AdaptiveSelectField', () => ({ default: ({ value, onChange, options = [], pickerTitle }: any) => (
  <select aria-label={pickerTitle} value={value} onChange={(event) => onChange(event.target.value)}>
    {options.map((option: any) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
  </select>
) }));
vi.mock('../components/RelatedRecordPopover', () => ({ default: () => null }));
vi.mock('../components/table/ManagedDataTable', () => ({ default: (props: any) => { mock.table = props; return <div data-testid="ledger" />; } }));
vi.mock('../components/moduleList/ListPrintRuntime', () => ({ default: (props: any) => { mock.print = props; return <div data-testid="print" />; } }));

beforeEach(() => {
  mock.context.mockResolvedValue({ orgId: 'org-a', userId: 'user-a', permissions: {} });
  mock.table = null; mock.print = null;
  const list = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: [], error: null }) };
  mock.from.mockReturnValue(list);
  mock.rpc.mockImplementation(async (name: string) => ({ data: name === 'get_cash_bank_dashboard_stats' ? {} : name === 'get_cash_bank_unified_ledger_totals'
    ? { receiptTotal: '3000', paymentTotal: '2000' } : { rows: [{ row_key: 'row-a', row_type: 'receipt', amount: 100 }], total: 201 }, error: null }));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const ready = async () => { render(<App><CashBankPage /></App>); await screen.findByTestId('ledger'); await waitFor(() => expect(mock.table.dataSource).toHaveLength(1)); };
const filter = async () => { await act(async () => mock.table.onChange({}, { amount: [JSON.stringify({ from: 0, to: 5000 })], status: [JSON.stringify(['received'])] }, {}, { action: 'filter' })); };

describe('cash and bank report', () => {
  it('saves a personal view and restores the same ledger filters', async () => {
    const list = mock.from();
    const insert = vi.fn().mockImplementation((payload) => ({
      select: () => ({ single: async () => ({ data: { id: 'saved-view', name: payload.name, config: payload.config }, error: null }) }),
    }));
    list.insert = insert;
    await ready();
    await filter();
    expect(list.eq.mock.calls).toEqual(expect.arrayContaining([['org_id', 'org-a'], ['created_by', 'user-a'], ['module_id', 'cash_bank_ledger']]));
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره به‌عنوان نما' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'نام نما' }), { target: { value: 'دریافت‌های ثبت‌شده' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره', exact: true }));
    await screen.findByRole('option', { name: 'دریافت‌های ثبت‌شده' });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ org_id: 'org-a', created_by: 'user-a', module_id: 'cash_bank_ledger' }));
    const picker = screen.getByRole('combobox', { name: 'نمای نقد و بانک' });
    fireEvent.change(picker, { target: { value: 'default' } });
    fireEvent.change(picker, { target: { value: 'saved-view' } });
    await waitFor(() => {
      const pageCall = mock.rpc.mock.calls.filter(([name]) => name === 'get_cash_bank_unified_ledger_page').at(-1);
      expect(pageCall?.[1].p_filters).toMatchObject({ amount_from: 0, amount_to: 5000, statuses: ['received'] });
    });
  });

  it('shows a recoverable ledger error instead of silently presenting an empty report', async () => {
    let failed = true;
    mock.rpc.mockImplementation(async (name: string) => name === 'get_cash_bank_unified_ledger_page' && failed
      ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }
      : { data: name === 'get_cash_bank_dashboard_stats' ? {} : { rows: [{ row_key: 'recovered', amount: 100 }], total: 1 }, error: null });
    await act(async () => { render(<App><CashBankPage /></App>); });
    await screen.findByRole('button', { name: 'تلاش دوباره' });
    expect(mock.table.dataSource).toHaveLength(0);
    failed = false;
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }));
    await waitFor(() => expect(mock.table.dataSource).toHaveLength(1));
    expect(screen.queryByRole('button', { name: 'تلاش دوباره' })).toBeNull();
  });

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
