import React from 'react';
import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelImportWizard from './ExcelImportWizard';
import { MODULES } from '../../moduleRegistry';
import type { ModuleDefinition } from '../../types';

type DbRow = Record<string, any>;
type MockDb = Record<string, DbRow[]>;

const mockSyncCustomerLevelsByInvoiceCustomers = vi.fn();

vi.mock('../../utils/customerLeveling', () => ({
  syncCustomerLevelsByInvoiceCustomers: (...args: any[]) => mockSyncCustomerLevelsByInvoiceCustomers(...args),
}));

vi.mock('../../utils/systemCode', () => ({
  buildClientFallbackSystemCode: vi.fn(async () => 'SYS-TEST'),
  supportsSystemCode: vi.fn(() => false),
}));

vi.mock('../../utils/referenceData', () => ({
  fetchAssigneeDirectory: vi.fn(async () => []),
  fetchDynamicOptionsByCategory: vi.fn(async () => []),
}));

vi.mock('../../utils/relationOptions', () => ({
  fetchRelationOptionsForField: vi.fn(async () => []),
}));

vi.mock('../DynamicSelectField', () => ({
  default: ({ value, onChange }: any) => (
    <input
      data-testid="dynamic-select-field"
      value={Array.isArray(value) ? value.join(',') : String(value ?? '')}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

vi.mock('../PersianDatePicker', () => ({
  default: ({ value, onChange }: any) => (
    <input
      data-testid="persian-date-picker"
      value={String(value ?? '')}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

let currentDb: MockDb = {};

const normalizeScalar = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase();

const matchesEq = (left: unknown, right: unknown) => normalizeScalar(left) === normalizeScalar(right);

class MockQuery<T = any> implements PromiseLike<T> {
  private filters: Array<{ type: 'eq' | 'in'; key: string; value: any }> = [];
  private selectedExpr: string | null = null;
  private limitCount: number | null = null;
  private singleMode = false;
  private maybeSingleMode = false;

  constructor(
    private db: MockDb,
    private table: string,
    private action: 'select' | 'insert' | 'update',
    private payload?: any
  ) {}

  select(expr: string) {
    this.selectedExpr = expr;
    return this;
  }

  insert(payload: any) {
    this.payload = payload;
    return this;
  }

  update(payload: any) {
    this.payload = payload;
    return this;
  }

  eq(key: string, value: any) {
    this.filters.push({ type: 'eq', key, value });
    return this;
  }

  in(key: string, value: any[]) {
    this.filters.push({ type: 'in', key, value });
    return this;
  }

  limit(value: number) {
    this.limitCount = value;
    return this;
  }

  single() {
    this.singleMode = true;
    return this;
  }

  maybeSingle() {
    this.maybeSingleMode = true;
    return this;
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled as any, onrejected as any);
  }

  private async execute(): Promise<any> {
    const tableRows = this.db[this.table] || (this.db[this.table] = []);
    if (this.action === 'insert') {
      const insertedRows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row: DbRow, index: number) => {
        const nextRow = { ...row };
        if (!nextRow.id) {
          nextRow.id = `${this.table}-${tableRows.length + index + 1}`;
        }
        tableRows.push(nextRow);
        return { ...nextRow };
      });

      if (this.singleMode || this.maybeSingleMode) {
        return { data: insertedRows[0] ?? null, error: null };
      }
      return { data: insertedRows, error: null };
    }

    if (this.action === 'update') {
      const matches = this.applyFilters(tableRows);
      matches.forEach((row) => Object.assign(row, this.payload || {}));
      return { data: matches.map((row) => ({ ...row })), error: null };
    }

    const matches = this.applyFilters(tableRows).map((row) => this.projectRow(row));
    const limited = this.limitCount == null ? matches : matches.slice(0, this.limitCount);

    if (this.singleMode) {
      return { data: limited[0] ?? null, error: null };
    }
    if (this.maybeSingleMode) {
      return { data: limited[0] ?? null, error: null };
    }
    return { data: limited, error: null };
  }

  private applyFilters(rows: DbRow[]) {
    return rows.filter((row) =>
      this.filters.every((filter) => {
        if (filter.type === 'eq') {
          return matchesEq(row[filter.key], filter.value);
        }
        return (filter.value || []).some((item: any) => matchesEq(row[filter.key], item));
      })
    );
  }

  private projectRow(row: DbRow) {
    if (!this.selectedExpr || this.selectedExpr === '*') {
      return { ...row };
    }
    const keys = this.selectedExpr
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.split('(')[0]?.trim() || item);
    if (!keys.includes('id')) keys.unshift('id');
    const next: DbRow = {};
    keys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(row, key)) {
        next[key] = row[key];
      }
    });
    return next;
  }
}

const createMockSupabase = (db: MockDb) => ({
  from(table: string) {
    return {
      select: (expr: string) => new MockQuery(db, table, 'select').select(expr),
      insert: (payload: any) => new MockQuery(db, table, 'insert', payload),
      update: (payload: any) => new MockQuery(db, table, 'update', payload),
    };
  },
});

vi.mock('../../supabaseClient', () => ({
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  supabase: {
    from(table: string) {
      return createMockSupabase(currentDb).from(table);
    },
  },
}));

const renderWizard = (moduleId: string, moduleConfig: ModuleDefinition) =>
  render(
    <App>
      <ExcelImportWizard
        open
        moduleId={moduleId}
        moduleConfig={moduleConfig}
        onClose={vi.fn()}
        onImported={vi.fn()}
      />
    </App>
  );

const uploadCsv = async (csvText: string) => {
  const input = document.body.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([csvText], 'import.csv', { type: 'text/csv;charset=utf-8' });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText('import.csv');
};

const findCardByLabel = (label: string) => {
  const labelNode = screen.getByText(label);
  const card = labelNode.closest('.rounded-xl');
  if (!card) {
    throw new Error(`Card not found for label: ${label}`);
  }
  return card as HTMLElement;
};

const openSelectInCard = (label: string) => {
  const card = findCardByLabel(label);
  const selector = card.querySelector('.ant-select-selector');
  if (!selector) {
    throw new Error(`Select not found for label: ${label}`);
  }
  fireEvent.mouseDown(selector);
};

const chooseOption = async (label: string) => {
  await waitFor(() => {
    const options = Array.from(document.body.querySelectorAll('.ant-select-item-option'));
    const matched = options.find((node) => node.textContent?.trim() === label);
    expect(matched).toBeTruthy();
    fireEvent.click(matched as Element);
  });
};

const goToMappingStep = async (duplicateOption = 'ادغام کن') => {
  await waitFor(() => expect(screen.getByText('بعدی')).toBeInTheDocument());
  fireEvent.click(screen.getByText('بعدی'));
  await screen.findByText('نحوه رسیدگی به اطلاعات تکراری');
  fireEvent.mouseDown(findCardByLabel('نحوه رسیدگی به اطلاعات تکراری').querySelector('.ant-select-selector') as Element);
  await chooseOption(duplicateOption);
  fireEvent.click(screen.getByText('بعدی'));
  await waitFor(() => {
    expect(screen.getAllByText('ذخیره به عنوان معادل یابی سفارشی').length).toBeGreaterThan(0);
  });
};

const runImport = async () => {
  fireEvent.click(screen.getByText('وارد کردن اطلاعات'));
  await waitFor(() => {
    const content = document.body.textContent || '';
    expect(content.includes('واردسازی انجام شد')).toBe(true);
    expect(content.includes('خطا: 0')).toBe(true);
  });
};

const runImportExpectFailures = async () => {
  fireEvent.click(screen.getByText('وارد کردن اطلاعات'));
  await waitFor(() => {
    const content = document.body.textContent || '';
    expect(content.includes('خطا: 1')).toBe(true);
  });
};

const buildGroupedInvoiceCsv = (itemRows: string[]) =>
  [
    'شماره فاکتور,موضوع,تاريخ فاکتور,نام مخاطب,نام آیتم,مقدار / تعداد,لیست قیمت',
    ...itemRows,
  ].join('\n');

describe('ExcelImportWizard import scenarios', () => {
  beforeEach(() => {
    currentDb = {
      invoices: [],
      customers: [{ id: 'customer-1', full_name: 'مشتری تست' }],
      products: [{ id: 'product-1', name: 'محصول تست' }],
      profiles: [],
      org_roles: [],
      dynamic_options: [],
    };
    mockSyncCustomerLevelsByInvoiceCustomers.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('imports a grouped invoice and resolves small relation datasets correctly', async () => {
    renderWizard('invoices', MODULES.invoices);
    await uploadCsv(
      buildGroupedInvoiceCsv(['INV-1,فاکتور تست,2026-04-16,مشتری تست,محصول تست,2,150000'])
    );
    await goToMappingStep();
    await runImport();

    expect(currentDb.invoices).toHaveLength(1);
    expect(currentDb.invoices[0].customer_id).toBe('customer-1');
    expect(currentDb.invoices[0].invoiceItems).toHaveLength(1);
    expect(currentDb.invoices[0].invoiceItems[0].product_id).toBe('product-1');
  }, 15000);

  it('duplicates invoice items during merge when the same product row has partial updates', async () => {
    currentDb.invoices = [
      {
        id: 'invoice-1',
        legacy_invoice_number: 'INV-2',
        name: 'فاکتور ادغام',
        invoice_date: '2026-04-16',
        status: 'created',
        customer_id: 'customer-1',
        invoiceItems: [
          {
            product_id: 'product-1',
            quantity: 1,
            unit_price: 100000,
          },
        ],
      },
    ];

    renderWizard('invoices', MODULES.invoices);
    await uploadCsv(
      buildGroupedInvoiceCsv(['INV-2,فاکتور ادغام,2026-04-16,مشتری تست,محصول تست,3,'])
    );
    await goToMappingStep();
    await runImport();

    expect(currentDb.invoices).toHaveLength(1);
    expect(currentDb.invoices[0].invoiceItems).toHaveLength(1);
    expect(currentDb.invoices[0].invoiceItems[0].quantity).toBe(3);
  }, 15000);

  it('fails to resolve product relations beyond the 5000-row preload window', async () => {
    currentDb.products = Array.from({ length: 5001 }, (_, index) => ({
      id: `product-${index + 1}`,
      name: index === 5000 ? 'محصول مرزی' : `محصول ${index + 1}`,
    }));

    renderWizard('invoices', MODULES.invoices);
    await uploadCsv(
      buildGroupedInvoiceCsv(['INV-3,فاکتور بزرگ,2026-04-16,مشتری تست,محصول مرزی,1,250000'])
    );
    await goToMappingStep();
    await runImport();

    expect(currentDb.invoices).toHaveLength(1);
    expect(currentDb.invoices[0].invoiceItems).toHaveLength(1);
    expect(currentDb.invoices[0].invoiceItems[0].product_id).toBe('product-5001');
  }, 15000);

  it('overwrites an existing grouped invoice instead of merging old line items', async () => {
    currentDb.invoices = [
      {
        id: 'invoice-4',
        legacy_invoice_number: 'INV-4',
        name: 'فاکتور بازنویسی',
        invoice_date: '2026-04-15',
        status: 'created',
        customer_id: 'customer-1',
        invoiceItems: [
          { product_id: 'product-1', quantity: 1, unit_price: 100000 },
          { product_id: 'product-legacy', quantity: 2, unit_price: 50000 },
        ],
      },
    ];
    currentDb.products.push({ id: 'product-legacy', name: 'محصول قدیمی' });

    renderWizard('invoices', MODULES.invoices);
    await uploadCsv(
      buildGroupedInvoiceCsv(['INV-4,فاکتور بازنویسی جدید,2026-04-16,مشتری تست,محصول تست,5,175000'])
    );
    await goToMappingStep('بازنویسی کن');
    await runImport();

    expect(currentDb.invoices).toHaveLength(1);
    expect(currentDb.invoices[0].name).toBe('فاکتور بازنویسی جدید');
    expect(currentDb.invoices[0].invoiceItems).toHaveLength(1);
    expect(currentDb.invoices[0].invoiceItems[0]).toMatchObject({
      product_id: 'product-1',
      quantity: 5,
      unit_price: 175000,
    });
  }, 15000);

  it('converts common field types correctly during simple import', async () => {
    renderWizard('customers', MODULES.customers);
    await uploadCsv(
      [
        'نام کامل مشتری,موبایل اصلی,این مشتری تامین‌کننده هم هست,تاریخ تولد,منبع سرنخ,علاقمندی‌های مشتری,سطح مشتری',
        'مشتری تبدیل,09121234567,بله,1405/01/27,اینستاگرام,چاپ، بسته بندی,طلایی',
      ].join('\n')
    );
    await goToMappingStep('ثبت نکن');
    await runImport();

    expect(currentDb.customers).toHaveLength(2);
    expect(currentDb.dynamic_options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'lead_source', value: 'اینستاگرام' }),
        expect.objectContaining({ category: 'customer_interests', value: 'چاپ' }),
        expect.objectContaining({ category: 'customer_interests', value: 'بسته بندی' }),
      ])
    );
    expect(currentDb.customers[1]).toMatchObject({
      full_name: 'مشتری تبدیل',
      mobile_1: '+989121234567',
      is_supplier: true,
      rank: 'gold',
      lead_source: 'اینستاگرام',
      customer_interests: ['چاپ', 'بسته بندی'],
    });
    expect(currentDb.customers[1].birth_date).toBe('2026-04-16');
  }, 15000);

  it('overwrites simple imported customer records by stable duplicate fields', async () => {
    currentDb.customers = [
      {
        id: 'customer-existing',
        full_name: 'نام قبلی',
        mobile_1: '+989121111111',
        rank: 'normal',
      },
    ];

    renderWizard('customers', MODULES.customers);
    await uploadCsv(
      [
        'نام کامل مشتری,موبایل اصلی,سطح مشتری',
        'نام جدید,09121111111,VIP',
      ].join('\n')
    );
    await goToMappingStep('بازنویسی کن');
    await runImport();

    expect(currentDb.customers).toHaveLength(1);
    expect(currentDb.customers[0]).toMatchObject({
      id: 'customer-existing',
      full_name: 'نام جدید',
      mobile_1: '+989121111111',
      rank: 'vip',
    });
  }, 15000);

  it('does not autocreate invoice customers during grouped import', async () => {
    renderWizard('invoices', MODULES.invoices);
    await uploadCsv(
      buildGroupedInvoiceCsv(['INV-5,فاکتور مشتری جدید,2026-04-16,مشتری تازه,محصول تست,1,99000'])
    );
    await goToMappingStep();
    await runImportExpectFailures();

    expect(currentDb.customers).toHaveLength(1);
    expect(currentDb.invoices).toHaveLength(0);
  }, 15000);

  it('normalizes legacy marketing lead values before saving', async () => {
    renderWizard('marketing_leads', MODULES.marketing_leads);
    await uploadCsv(
      [
        'عنوان لید,وضعیت,نوع لید,شماره موبایل,درصد موفقیت',
        'لید تست,پیگیری در آینده,مشتری قبلی,09123334444,۴۵',
      ].join('\n')
    );
    await goToMappingStep('ثبت نکن');
    await runImport();

    expect(currentDb.marketing_leads).toHaveLength(1);
    expect(currentDb.marketing_leads[0]).toMatchObject({
      name: 'لید تست',
      status: 'future_follow_up',
      lead_type: 'existing_customer',
      mobile: '+989123334444',
      success_percentage: 45,
    });
  }, 15000);

  it('does not save virtual bot fields when importing employees', async () => {
    renderWizard('employees', MODULES.employees);
    await uploadCsv(
      [
        'نام کامل,پلتفرم اصلی بات',
        'کارمند تست,روبیکا',
      ].join('\n')
    );
    await goToMappingStep('ثبت نکن');
    await runImport();

    expect(currentDb.employees).toHaveLength(1);
    expect(currentDb.employees[0]).toMatchObject({ full_name: 'کارمند تست' });
    expect(currentDb.employees[0]).not.toHaveProperty('bot_default_channel');
  }, 15000);
});
