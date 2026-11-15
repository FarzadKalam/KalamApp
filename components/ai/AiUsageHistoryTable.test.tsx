import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AiUsageHistoryTable from './AiUsageHistoryTable';

const invoke = vi.hoisted(() => vi.fn());
const showError = vi.hoisted(() => vi.fn());
const message = vi.hoisted(() => ({ error: showError }));
vi.mock('../../supabaseClient', () => ({ supabase: { functions: { invoke } } }));
vi.mock('antd', () => ({
  App: { useApp: () => ({ message }) },
  Empty: () => null,
  Table: ({ dataSource, pagination }: any) => <div>
    <span>{dataSource.map((row: any) => row.id).join(',')}</span>
    <span>{pagination.total}</span>
    <button onClick={() => pagination.onChange(2, pagination.pageSize)}>بعدی</button>
  </div>,
}));

describe('AiUsageHistoryTable', () => {
  beforeEach(() => {
    invoke.mockReset();
    showError.mockReset();
    invoke.mockImplementation(async (_name, { body }) => ({
      data: { success: true, rows: [{ id: `page-${body.page}` }], total: 750 }, error: null,
    }));
  });
  afterEach(cleanup);

  it.each([false, true])('loads subsequent server pages for central=%s', async (central) => {
    render(<AiUsageHistoryTable central={central} columns={[]} />);
    await screen.findByText('page-1');
    expect(screen.getByText('750')).toBeTruthy();
    fireEvent.click(screen.getByText('بعدی'));
    await screen.findByText('page-2');
    expect(invoke).toHaveBeenLastCalledWith('ai-assistant', {
      body: central
        ? { action: 'saas_ai', sub: 'usage_page', page: 2, pageSize: 20 }
        : { action: 'get_ai_usage_page', page: 2, pageSize: 20 },
    });
  });

  it('reports an unsuccessful request instead of presenting a successful empty page', async () => {
    invoke.mockResolvedValue({ data: { success: false, message: 'خطای دریافت' }, error: null });
    render(<AiUsageHistoryTable columns={[]} />);
    await waitFor(() => expect(showError).toHaveBeenCalledOnce());
  });
});
