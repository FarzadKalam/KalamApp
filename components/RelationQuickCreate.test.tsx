import React from 'react';
import { App, ConfigProvider } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RelationQuickCreateHost } from './SmartFieldRenderer';

vi.mock('../moduleRegistry', () => ({ MODULES: { quick_test: {
  id: 'quick_test', table: 'quick_test', titles: { fa: 'نمونه' }, fields: [
    { key: 'name', labels: { fa: 'عنوان' }, type: 'text', location: 'header', isKey: true },
    { key: 'status', labels: { fa: 'وضعیت' }, type: 'status', location: 'header', defaultValue: 'todo', options: [
      { value: 'todo', label: 'انجام نشده' }, { value: 'in_progress', label: 'در حال انجام' },
    ] },
  ], blocks: [],
} } }));
const db = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn() }));
vi.mock('../supabaseClient', () => ({ supabase: db, SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'test' }));
vi.mock('../utils/permissions', () => ({
  fetchCurrentUserRolePermissions: vi.fn(async () => ({})),
  resolveReadyTextPermissions: () => ({ canView: false, canAdd: false, canEdit: false, canDelete: false }),
}));
vi.mock('../utils/sessionCache', () => ({ fetchSessionBootstrap: vi.fn(async () => ({ user: null })) }));
vi.mock('../utils/currency', () => ({ useCurrencyConfig: () => ({ label: 'تومان' }) }));
vi.mock('./RichTextEditor', () => ({ default: () => null }));
vi.mock('./ai/VoiceToTextButton', () => ({ default: () => null }));
vi.mock('./files/FileManagerPickerModal', () => ({ default: () => null }));
vi.mock('./RelatedRecordPopover', () => ({ default: ({ children }: any) => children }));

afterEach(cleanup);
beforeEach(() => {
  const query: any = {};
  query.insert = db.insert.mockReturnValue(query);
  query.select = vi.fn(() => query);
  query.single = vi.fn(async () => ({ data: { id: 'created-record' }, error: null }));
  db.from.mockReturnValue(query);
});

describe('quick create form values', () => {
  it('keeps the selected status and entered title when the parent rerenders with equivalent defaults', async () => {
    const cancel = vi.fn();
    const Page = ({ tick }: { tick: number }) => <ConfigProvider theme={{ token: { motion: false } }}><App>
      <span>{tick}</span>
      <RelationQuickCreateHost open targetModuleId="quick_test" initialValues={{ name: 'فعالیت اولیه' }} onCancel={cancel} />
    </App></ConfigProvider>;
    const view = render(<Page tick={0} />);
    await waitFor(() => expect(screen.getByDisplayValue('فعالیت اولیه')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('فعالیت اولیه'), { target: { value: 'فعالیت ویرایش شده' } });
    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByText('در حال انجام', { selector: '.ant-select-item-option-content' }));
    await waitFor(() => expect(screen.getByText('در حال انجام', { selector: '.ant-select-selection-item' })).toBeInTheDocument());
    view.rerender(<Page tick={1} />);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await waitFor(() => expect(screen.getByDisplayValue('فعالیت ویرایش شده')).toBeInTheDocument());
    expect(screen.getByText('در حال انجام', { selector: '.ant-select-selection-item' })).toBeInTheDocument();
  });

  it('persists the selected status rather than the original default', async () => {
    const onCreated = vi.fn();
    render(<ConfigProvider theme={{ token: { motion: false } }}><App>
      <RelationQuickCreateHost open targetModuleId="quick_test" initialValues={{ name: 'پیگیری' }} onCancel={vi.fn()} onCreated={onCreated} />
    </App></ConfigProvider>);
    await screen.findByDisplayValue('پیگیری');
    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByText('در حال انجام', { selector: '.ant-select-item-option-content' }));
    fireEvent.click(screen.getByRole('button', { name: 'افزودن' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ values: expect.objectContaining({ status: 'in_progress', name: 'پیگیری' }) })));
    expect(db.insert).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'in_progress' }));
  });
});
