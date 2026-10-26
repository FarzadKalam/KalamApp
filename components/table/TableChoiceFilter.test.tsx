import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TableChoiceFilter } from './TableChoiceFilter';
import { fetchRelationOptionsForField } from '../../utils/relationOptions';

vi.mock('../../supabaseClient', () => ({ supabase: {} }));
vi.mock('../../utils/relationOptions', () => ({ fetchRelationOptionsForField: vi.fn() }));
vi.mock('../AdaptiveSelectField', () => ({ default: (props: any) => <div><input aria-label="جستجوی فیلتر" onChange={(event) => props.onSearch?.(event.target.value)} />{props.options.map((option: any) => <button key={option.value} onClick={() => props.onChange([option.value])}>{option.label}</button>)}</div> }));

describe('remote header relation filter', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('searches the relation source rather than only the recent options', async () => {
    vi.mocked(fetchRelationOptionsForField).mockImplementation(async (_client, _field, args) => args?.search ? [{ value: 'older-customer', label: 'مشتری قدیمی' }] : [{ value: 'recent', label: 'مشتری اخیر' }]);
    const setSelectedKeys = vi.fn();
    render(<TableChoiceFilter field={{ key: 'customer_id', type: 'relation', relationConfig: { targetModule: 'customers' }, labels: { fa: 'مشتری' } }} moduleId="invoices" options={[]} selectedKeys={[]} setSelectedKeys={setSelectedKeys} confirm={vi.fn()} close={vi.fn()} />);
    await screen.findByText('مشتری اخیر');
    fireEvent.change(screen.getByLabelText('جستجوی فیلتر'), { target: { value: 'قدیمی' } });
    await waitFor(() => expect(fetchRelationOptionsForField).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ key: 'customer_id' }), expect.objectContaining({ search: 'قدیمی', limit: 50 })));
    fireEvent.click(await screen.findByText('مشتری قدیمی'));
    expect(setSelectedKeys).toHaveBeenCalledWith(['older-customer']);
  });
});
