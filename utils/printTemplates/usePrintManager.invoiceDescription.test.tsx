import React from 'react';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldType } from '../../types';
import { invoicesConfig } from '../../modules/invoicesConfig';
import { productBundlesConfig } from '../../modules/productBundlesConfig';
import { buildDefaultTemplatesForModule, materializeSystemTemplateForCopy } from './store';

const mocks = vi.hoisted(() => ({
  loadPrintTemplatesStore: vi.fn(),
  fetchSessionBootstrap: vi.fn(),
  loadScopedCompanySettings: vi.fn(),
  fetchAssigneeDirectory: vi.fn(),
  detectRecordFilesTable: vi.fn(),
  printInIframe: vi.fn(),
  printAsPdf: vi.fn(),
}));

vi.mock('./store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./store')>()),
  loadPrintTemplatesStore: mocks.loadPrintTemplatesStore,
}));
vi.mock('../sessionCache', () => ({ fetchSessionBootstrap: mocks.fetchSessionBootstrap }));
vi.mock('../companySettings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../companySettings')>()),
  loadScopedCompanySettings: mocks.loadScopedCompanySettings,
}));
vi.mock('../referenceData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../referenceData')>()),
  fetchAssigneeDirectory: mocks.fetchAssigneeDirectory,
}));
vi.mock('../recordFilesAvailability', () => ({ detectRecordFilesTable: mocks.detectRecordFilesTable }));
vi.mock('./printInIframe', () => ({ printInIframe: mocks.printInIframe }));
vi.mock('./printAsPdf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./printAsPdf')>()),
  printAsPdf: mocks.printAsPdf,
  shouldUseGeneratedPdfPrint: () => false,
}));

import { usePrintManager } from './usePrintManager';

const invoiceRecord = {
  id: 'invoice-test-1',
  name: 'فاکتور آزمایشی',
  system_code: 'FA-1',
  invoice_date: '2026-07-28',
  description: 'توضیحات خط اول فاکتور\nتوضیحات خط دوم فاکتور',
  invoiceItems: [{ product_name: 'کالای آزمایشی', quantity: 1, total_price: 1000 }],
  payments: [],
};

const invoiceRecordWithPayment = {
  ...invoiceRecord,
  payments: [{ date: '2026-07-28', payment_type: 'transfer', amount: 500 }],
};

const productBundleRecord = {
  id: 'bundle-test-1',
  name: 'پکیج آزمایشی',
  products: [{
    product_id: 'product-test-1',
    product_name: 'خدمت آزمایشی',
    quantity: 2,
    main_unit: 'عدد',
    unit_price: 150000,
    discount: 0,
    discount_type: 'amount',
    total_price: 300000,
  }],
};

describe('official and unofficial sales invoice descriptions', () => {
  beforeEach(() => {
    if (!Range.prototype.getClientRects) {
      Object.defineProperty(Range.prototype, 'getClientRects', {
        configurable: true,
        value: () => [],
      });
    }
    window.localStorage.clear();
    mocks.loadPrintTemplatesStore.mockResolvedValue({
      rowId: null,
      provider: 'tiptap',
      templatesByModule: {},
      storage: 'local',
    });
    mocks.fetchSessionBootstrap.mockResolvedValue({
      user: { id: 'user-test' },
      orgId: 'org-test',
      profile: null,
      permissions: {},
    });
    mocks.loadScopedCompanySettings.mockResolvedValue({ data: null, error: null });
    mocks.fetchAssigneeDirectory.mockResolvedValue({ users: [], roles: [] });
    mocks.detectRecordFilesTable.mockResolvedValue(false);
    mocks.printInIframe.mockResolvedValue(undefined);
    mocks.printAsPdf.mockResolvedValue(undefined);
  });

  it.each(['default_invoice_official', 'default_invoice_unofficial'])(
    'renders populated root description in %s after the complete print-manager pipeline',
    async (templateId) => {
      const { result } = renderHook(() => usePrintManager({
        moduleId: 'invoices',
        data: invoiceRecord,
        moduleConfig: invoicesConfig,
        printableFields: [{
          key: 'description',
          type: FieldType.SUPER_LONG_TEXT,
          labels: { fa: 'توضیحات فاکتور' },
          value: invoiceRecord.description,
          hasValue: true,
        }],
        formatPrintValue: (_field, value) => String(value ?? ''),
        canViewField: () => true,
      }));

      act(() => result.current.openPrintModal());
      await waitFor(() => expect(result.current.printTemplates.length).toBeGreaterThan(0));
      act(() => result.current.setSelectedTemplateId(`custom:${templateId}`));
      await waitFor(() => expect(result.current.selectedTemplateId).toBe(`custom:${templateId}`));
      const descriptionOption = result.current.printableFieldsForTemplate
        .find((field: any) => field?.key === 'record.description');
      expect(descriptionOption).toMatchObject({ hasValue: true });
      expect(descriptionOption?.defaultSelected).not.toBe(false);
      expect(result.current.selectedPrintFields[`custom:${templateId}`]).toBeUndefined();
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 25));
      });
      expect(result.current.selectedPrintFields[`custom:${templateId}`]).toBeUndefined();

      const view = render(<>{result.current.renderPrintCard()}</>);
      await waitFor(() => {
        expect(view.container.textContent).toContain('توضیحات خط اول فاکتور');
        expect(view.container.textContent).toContain('توضیحات خط دوم فاکتور');
      });
      view.unmount();
    }
  , 15_000);

  it('does not let a stale browser selection hide a manually authored print-date variable', async () => {
    const manualTemplate = {
      id: 'manual-date-variable',
      moduleId: 'invoices',
      scope: 'record' as const,
      title: 'قالب متغیر تاریخ',
      contentHtml: '<p>تاریخ چاپ: {{system.today_date}}</p><p>کد: {{record.system_code}}</p>',
      headerHtml: '',
      footerHtml: '',
      isSystem: false,
      isActive: true,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };
    // This is the old per-browser value that contained only the code field.
    // A missing server preference must fall back to the current catalog, not
    // silently blank a variable added later through the template editor.
    window.localStorage.setItem(
      'kalamapp.print_field_preferences.v2',
      JSON.stringify({
        'org-test::user-test::invoices::manual-date-variable::record': [
          'record.system_code',
        ],
      }),
    );
    mocks.loadPrintTemplatesStore.mockResolvedValue({
      rowId: null,
      provider: 'tiptap',
      templatesByModule: { invoices: [manualTemplate] },
      storage: 'remote',
    });

    const { result } = renderHook(() => usePrintManager({
      moduleId: 'invoices',
      data: invoiceRecord,
      moduleConfig: invoicesConfig,
      printableFields: [],
      formatPrintValue: (_field, value) => String(value ?? ''),
      canViewField: () => true,
    }));

    act(() => result.current.openPrintModal());
    await waitFor(() => expect(result.current.printTemplates.some(
      (template) => template.id === 'custom:manual-date-variable',
    )).toBe(true));
    act(() => result.current.setSelectedTemplateId('custom:manual-date-variable'));

    const view = render(<>{result.current.renderPrintCard()}</>);
    await waitFor(() => {
      expect(view.container.textContent).toMatch(/تاریخ چاپ:\s*۱۴۰[۰-۹]\/[۰-۹]{2}\/[۰-۹]{2}/);
      expect(view.container.textContent).toContain('FA-۱');
    });
    view.unmount();
  }, 15_000);

  it('keeps dynamic invoice item and payment tables after copying a system template for manual editing', async () => {
    const source = buildDefaultTemplatesForModule('invoices')
      .find((template) => template.id === 'default_invoice_unofficial');
    const copied = {
      ...materializeSystemTemplateForCopy('invoices', source!),
      id: 'custom-invoice-copy',
      title: 'فاکتور فروش غیررسمی (کپی)',
      isSystem: false,
      // Simulates templates already saved by the older normalizer.
      selectedFieldKeys: [],
    };
    mocks.loadPrintTemplatesStore.mockResolvedValue({
      rowId: null,
      provider: 'tiptap',
      templatesByModule: { invoices: [copied] },
      storage: 'local',
    });

    const { result } = renderHook(() => usePrintManager({
      moduleId: 'invoices',
      data: invoiceRecordWithPayment,
      moduleConfig: invoicesConfig,
      printableFields: [],
      formatPrintValue: (_field, value) => String(value ?? ''),
      canViewField: () => true,
    }));

    act(() => result.current.openPrintModal());
    await waitFor(() => expect(result.current.printTemplates.some(
      (template) => template.id === 'custom:custom-invoice-copy'
    )).toBe(true));
    act(() => result.current.setSelectedTemplateId('custom:custom-invoice-copy'));
    await waitFor(() => expect(result.current.selectedTemplateId).toBe('custom:custom-invoice-copy'));
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 25));
    });
    expect(result.current.selectedPrintFields['custom:custom-invoice-copy']).toBeUndefined();

    const view = render(<>{result.current.renderPrintCard()}</>);
    await waitFor(() => {
      expect(view.container.textContent).toContain('ردیف');
      expect(view.container.textContent).toContain('دریافت‌ها');
      expect(view.container.textContent).toContain('۵۰۰');
    });
    view.unmount();
  }, 15_000);

  it('keeps populated package items in the compact system template after the complete renderer pipeline', async () => {
    const { result } = renderHook(() => usePrintManager({
      moduleId: 'product_bundles',
      data: productBundleRecord,
      moduleConfig: productBundlesConfig,
      printableFields: [],
      formatPrintValue: (_field, value) => String(value ?? ''),
      canViewField: () => true,
    }));

    act(() => result.current.openPrintModal());
    await waitFor(() => expect(result.current.printTemplates.length).toBeGreaterThan(0));
    act(() => result.current.setSelectedTemplateId('custom:default_product_bundles_compact_a4'));
    await waitFor(() => expect(result.current.selectedTemplateId).toBe('custom:default_product_bundles_compact_a4'));

    const view = render(<>{result.current.renderPrintCard()}</>);
    await waitFor(() => {
      expect(view.container.querySelector('table[data-print-block="products"]')).not.toBeNull();
      expect(view.container.textContent).toContain('خدمت آزمایشی');
      expect(view.container.textContent).toContain('۳۰۰٬۰۰۰');
    });
    view.unmount();
  }, 15_000);

  it('waits for tenant company details before serializing an official invoice for print', async () => {
    mocks.loadScopedCompanySettings.mockResolvedValue({
      data: {
        company_full_name: 'شرکت نمونهٔ فروش',
        logo_url: 'https://cdn.example.com/company-logo.png',
        address: 'تهران، خیابان نمونه',
      },
      error: null,
    });
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);

    const { result } = renderHook(() => usePrintManager({
      moduleId: 'invoices',
      data: invoiceRecord,
      moduleConfig: invoicesConfig,
      printableFields: [],
      formatPrintValue: (_field, value) => String(value ?? ''),
      canViewField: () => true,
    }));

    act(() => result.current.openPrintModal());
    await waitFor(() => expect(result.current.printTemplates.length).toBeGreaterThan(0));
    act(() => result.current.setSelectedTemplateId('custom:default_invoice_official'));
    await waitFor(() => expect(result.current.selectedTemplateId).toBe('custom:default_invoice_official'));

    await act(async () => {
      await result.current.handlePrint();
    });

    // قالب فاکتور رسمی اکنون در مسیر PDF نهایی اجرا می‌شود؛ باید همان HTML
    // آماده‌شده با مشخصات سازمان را به آن مسیر بدهد.
    await waitFor(() => expect(mocks.printAsPdf).toHaveBeenCalledTimes(1));
    expect(mocks.printAsPdf.mock.calls[0][0].sourceHtml).toContain('شرکت نمونهٔ فروش');
    expect(mocks.printAsPdf.mock.calls[0][0].sourceHtml).toContain('company-logo.png');
    vi.unstubAllGlobals();
  }, 15_000);
});
