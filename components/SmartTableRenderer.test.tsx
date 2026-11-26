import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SmartTableRenderer, { buildSmartTablePagination } from './SmartTableRenderer';
import { FieldType, ModuleNature, ViewMode, type ModuleDefinition } from '../types';
import { QUICK_EDIT_HOLD_MS } from './moduleList/QuickEditCell';
import { canQuickEditModuleField } from '../utils/moduleListQuickEdit';

vi.mock('./ProductionStagesField', () => ({ default: () => null }));
vi.mock('./RelatedRecordPopover', () => ({ default: ({ children }: any) => <>{children}</> }));
vi.mock('./PhoneActionsPopover', () => ({ default: ({ value }: any) => <span>{value}</span> }));
vi.mock('./PersianDatePicker', () => ({ default: () => null }));
vi.mock('../utils/currency', () => ({ useCurrencyConfig: () => ({ label: 'ریال' }) }));
vi.mock('../supabaseClient', () => ({
  supabase: {}, supabasePublic: {}, supabaseSignUpClient: {},
  SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'test-anon-key', SUPABASE_AUTH_STORAGE_KEY: 'sb-test-auth-token',
}));

const testModule: ModuleDefinition = {
  id: 'test_module',
  table: 'test_module',
  titles: { fa: 'تست', faSingular: 'تست', en: 'Test' },
  nature: ModuleNature.CRM,
  supportedViewModes: [ViewMode.LIST],
  defaultViewMode: ViewMode.LIST,
  fields: [
    {
      key: 'name',
      labels: { fa: 'نام', en: 'Name' },
      type: FieldType.TEXT,
      isTableColumn: true,
      isKey: true,
      order: 1,
    },
  ],
  blocks: [],
};

const rows = Array.from({ length: 12 }, (_, index) => ({
  id: String(index + 1),
  name: `Row ${index + 1}`,
}));

const normalizeDigits = (value: string) =>
  value.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));

const StatefulTable = () => {
  const [pagination, setPagination] = React.useState({ current: 1, pageSize: 5, total: rows.length });
  const [selectedRowKeys, setSelectedRowKeys] = React.useState<React.Key[]>([]);

  return (
    <SmartTableRenderer
      moduleConfig={testModule}
      data={rows}
      loading={false}
      pagination={pagination}
      onChange={(nextPagination) => {
        setPagination((prev) => ({
          ...prev,
          current: nextPagination?.current ?? prev.current,
          pageSize: nextPagination?.pageSize ?? prev.pageSize,
        }));
      }}
      rowSelection={{
        selectedRowKeys,
        onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
      }}
    />
  );
};

describe('SmartTableRenderer', () => {
  it('edits an unselected cell by mouse or keyboard and leaves disallowed rows unchanged', () => {
    const open = vi.fn();
    const navigate = vi.fn();
    const { container } = render(<SmartTableRenderer moduleConfig={testModule} data={rows.slice(0, 3)} loading={false}
      pagination={false} rowSelection={{ selectedRowKeys: ['1'] }} onRow={() => ({ onClick: navigate })}
      quickEdit={{ active: true, canEdit: (_field, row) => row.id !== '3', open }} />);
    const second = container.querySelector('[data-row-key="2"] .module-quick-edit-cell-active')!;
    fireEvent.click(second);
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ key: 'name' }), rows[1], second.closest('td'));
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.keyDown(second.closest('td')!, { key: 'Enter' });
    expect(open).toHaveBeenCalledTimes(2);
    fireEvent.click(container.querySelector('[data-row-key="3"] td:not(.ant-table-selection-column)')!);
    expect(open).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it.each(['touch', 'mouse', 'pen'])('opens on %s hold and preserves the short click or drag', pointerType => {
    const open = vi.fn();
    const navigate = vi.fn();
    const { container, unmount } = render(<SmartTableRenderer moduleConfig={testModule} data={rows.slice(0, 1)} loading={false}
      pagination={false} onRow={() => ({ onClick: navigate })} quickEdit={{ active: false, canEdit: () => true, open }} />);
    const cell = container.querySelector('[data-row-key="1"] .module-quick-edit-cell')!;
    const pointer = (type: string, x: number, button = 0) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 20, button });
      Object.defineProperties(event, { isPrimary: { value: true }, pointerId: { value: 1 }, pointerType: { value: pointerType } });
      fireEvent(cell, event);
    };
    vi.useFakeTimers();
    try {
      pointer('pointerdown', 50);
      pointer('pointerup', 50);
      fireEvent.click(cell);
      expect(navigate).toHaveBeenCalledTimes(1);
      pointer('pointerdown', 50, 2);
      act(() => vi.advanceTimersByTime(QUICK_EDIT_HOLD_MS));
      expect(open).not.toHaveBeenCalled();
      pointer('pointerdown', 50);
      pointer('pointermove', 80);
      act(() => vi.advanceTimersByTime(QUICK_EDIT_HOLD_MS));
      expect(open).not.toHaveBeenCalled();
      pointer('pointerdown', 50);
      act(() => vi.advanceTimersByTime(QUICK_EDIT_HOLD_MS));
      expect(open).toHaveBeenCalledTimes(1);
      fireEvent.click(cell);
      expect(navigate).toHaveBeenCalledTimes(1);
      unmount();
    } finally { vi.useRealTimers(); }
  });

  it('uses field edit rights and leaves computed, identifier and lookup fields read-only', () => {
    const field = testModule.fields[0];
    expect(canQuickEditModuleField(testModule, field, { create: false })).toBe(true);
    expect(canQuickEditModuleField(testModule, field, { edit: false })).toBe(false);
    expect(canQuickEditModuleField(testModule, field, { field_actions: { name: { edit: false } } })).toBe(false);
    expect(canQuickEditModuleField(testModule, { ...field, isCalculated: true }, {})).toBe(false);
    expect(canQuickEditModuleField(testModule, { ...field, key: 'org_id' }, {})).toBe(false);
    expect(canQuickEditModuleField(testModule, { ...field, type: FieldType.READONLY_LOOKUP }, {})).toBe(false);
  });

  it('keeps image column names accessible without rendering a visible media heading', () => {
    render(<SmartTableRenderer moduleConfig={{ ...testModule, fields: [...testModule.fields,
      { key: 'image_url', labels: { fa: 'تصویر / فایل' }, type: FieldType.IMAGE, isTableColumn: true },
    ] }} data={[]} loading={false} pagination={false} />);
    screen.getAllByText('تصویر / فایل').forEach((label) => expect(label).toHaveClass('sr-only'));
  });
  it('preserves the provided page size in table pagination config', () => {
    const pagination = buildSmartTablePagination({ current: 1, pageSize: 20, total: 200 }) as any;

    expect(pagination.pageSize).toBe(20);
    expect(pagination.showSizeChanger).toBe(true);
    expect(pagination.pageSizeOptions).toEqual([10, 20, 50, 100]);
  });

  it('renders only the configured page size and supports page navigation', async () => {
    const user = userEvent.setup();
    const { container } = render(<StatefulTable />);

    const getBodyRows = () => Array.from(container.querySelectorAll('.ant-table-tbody > tr.ant-table-row'));

    expect(getBodyRows()).toHaveLength(5);
    expect(normalizeDigits(getBodyRows()[0]?.textContent || '')).toContain('Row 1');
    expect(normalizeDigits(getBodyRows()[4]?.textContent || '')).toContain('Row 5');

    const pagination = container.querySelector('.ant-pagination') as HTMLElement | null;
    expect(pagination).not.toBeNull();

    const pageTwoItem =
      pagination?.querySelector('.ant-pagination-item-2') ||
      within(pagination as HTMLElement).getByTitle('2');
    await user.click(pageTwoItem as HTMLElement);

    await waitFor(() => {
      expect((pagination as HTMLElement).querySelector('.ant-pagination-item-2.ant-pagination-item-active')).not.toBeNull();
    });
    expect(getBodyRows()).toHaveLength(5);
    expect(normalizeDigits(getBodyRows()[0]?.textContent || '')).toContain('Row 6');
  });

  it('keeps row selection working with the rendered page rows', async () => {
    render(<StatefulTable />);

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThan(1);

    fireEvent.click(checkboxes[1]);

    await waitFor(() => {
      expect(checkboxes[1]).toBeChecked();
    });
  });

  it('renders record cells as real links for browser open-in-new-tab actions', async () => {
    const user = userEvent.setup();
    const onRowLinkClick = vi.fn();

    const { container } = render(
      <SmartTableRenderer
        moduleConfig={testModule}
        data={[rows[0]]}
        loading={false}
        pagination={false}
        getRowHref={(record) => `/test_module/${record.id}`}
        onRowLinkClick={onRowLinkClick}
      />
    );

    const recordLink = container.querySelector('.smarttable-row-link') as HTMLAnchorElement | null;
    expect(recordLink).not.toBeNull();
    expect(normalizeDigits(recordLink?.textContent || '')).toContain('Row 1');
    expect(recordLink).toHaveAttribute('href', '/test_module/1');

    await user.click(recordLink as HTMLAnchorElement);

    expect(onRowLinkClick).toHaveBeenCalledWith(rows[0], expect.anything());
  });

  it('enables the single scroll container mode without breaking pagination', () => {
    const { container } = render(
      <SmartTableRenderer
        moduleConfig={testModule}
        data={rows}
        loading={false}
        pagination={{ current: 1, pageSize: 5, total: rows.length }}
        singleScrollContainer
      />
    );

    expect(container.querySelector('.smarttable-single-scroll')).not.toBeNull();
    expect(container.querySelector('.ant-pagination')).not.toBeNull();
    expect(container.querySelector('.ant-table-header')).toBeNull();
    expect(container.querySelector('thead')?.closest('table')).toBe(container.querySelector('tbody')?.closest('table'));
  });

  it('supports column menu reordering and keyboard width changes on mobile', async () => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390, writable: true });
    localStorage.removeItem('mobile-table-layout');
    const user = userEvent.setup();
    try {
      const { container } = render(<SmartTableRenderer moduleConfig={testModule} data={rows.slice(0, 2)} loading={false} pagination={false} singleScrollContainer columnPreferencesKey="mobile-table-layout" />);
      expect(container.querySelector('.ant-table-header')).toBeNull();
      expect(container.querySelector('.ant-table-measure-row')).toBeNull();
      const resize = screen.getByRole('separator', { name: 'تغییر عرض ستون نام' });
      const previous = Number(resize.getAttribute('aria-valuenow'));
      fireEvent.keyDown(resize, { key: 'ArrowLeft' });
      expect(JSON.parse(localStorage.getItem('mobile-table-layout') || '{}').widths.name).toBe(previous + 16);
      await user.click(screen.getByRole('button', { name: 'جابه‌جایی ستون نام' }));
      await user.click(await screen.findByText('انتقال ستون به چپ'));
      await waitFor(() => expect(container.querySelector('th[data-column-key]')?.getAttribute('data-column-key')).toBe('assignee_id'));
      expect(container.querySelectorAll('tbody > tr.ant-table-row')).toHaveLength(2);
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: previousWidth, writable: true });
      localStorage.removeItem('mobile-table-layout');
    }
  });

  it('renders tags under any name or title text column using tagsMap data', () => {
    const titleLikeModule: ModuleDefinition = {
      ...testModule,
      fields: [
        {
          key: 'stage_name',
          labels: { fa: 'عنوان مرحله', en: 'Stage Title' },
          type: FieldType.TEXT,
          isTableColumn: true,
          order: 1,
        },
        {
          key: 'tags',
          labels: { fa: 'برچسب‌ها', en: 'Tags' },
          type: FieldType.TAGS,
          isTableColumn: true,
          order: 2,
        },
      ],
    };

    render(
      <SmartTableRenderer
        moduleConfig={titleLikeModule}
        data={[{ id: 'row-1', stage_name: 'برش اولیه', tags: [] }]}
        tagsMap={{ 'row-1': [{ id: 'tag-1', title: 'فوری', color: 'red' }] }}
        loading={false}
        pagination={false}
      />
    );

    expect(screen.getByText('برش اولیه')).toBeInTheDocument();
    expect(screen.getByText('فوری')).toBeInTheDocument();
  });

  it('keeps record tags under the first title column when tags are not in visible columns', () => {
    const moduleWithHiddenTags: ModuleDefinition = {
      ...testModule,
      fields: [
        {
          key: 'name',
          labels: { fa: 'نام', en: 'Name' },
          type: FieldType.TEXT,
          isTableColumn: true,
          order: 1,
        },
        {
          key: 'status',
          labels: { fa: 'وضعیت', en: 'Status' },
          type: FieldType.STATUS,
          isTableColumn: true,
          order: 2,
          options: [{ label: 'فعال', value: 'active', color: 'green' }],
        },
        {
          key: 'tags',
          labels: { fa: 'برچسب‌ها', en: 'Tags' },
          type: FieldType.TAGS,
          isTableColumn: true,
          order: 3,
        },
      ],
    };

    render(
      <SmartTableRenderer
        moduleConfig={moduleWithHiddenTags}
        data={[{ id: 'row-1', name: 'پرونده فروش', status: 'active', tags: [] }]}
        visibleColumns={['name', 'status']}
        tagsMap={{ 'row-1': [{ id: 'tag-1', title: 'پیگیری', color: 'orange' }] }}
        loading={false}
        pagination={false}
      />
    );

    expect(screen.getByText('پرونده فروش')).toBeInTheDocument();
    expect(screen.getByText('پیگیری')).toBeInTheDocument();
  });
});
