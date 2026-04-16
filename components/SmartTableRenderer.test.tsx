import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SmartTableRenderer, { buildSmartTablePagination } from './SmartTableRenderer';
import { FieldType, ModuleNature, ViewMode, type ModuleDefinition } from '../types';

vi.mock('./ProductionStagesField', () => ({ default: () => null }));
vi.mock('./RelatedRecordPopover', () => ({ default: ({ children }: any) => <>{children}</> }));
vi.mock('./PhoneActionsPopover', () => ({ default: ({ value }: any) => <span>{value}</span> }));
vi.mock('./PersianDatePicker', () => ({ default: () => null }));
vi.mock('../utils/currency', () => ({ useCurrencyConfig: () => ({ label: 'ریال' }) }));

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
});
