import React from 'react';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldType } from '../../types';
import { invoicesConfig } from '../../modules/invoicesConfig';
import { buildDefaultTemplatesForModule, materializeSystemTemplateForCopy } from './store';

const mocks = vi.hoisted(() => ({
  loadPrintTemplatesStore: vi.fn(),
  fetchSessionBootstrap: vi.fn(),
  loadScopedCompanySettings: vi.fn(),
  fetchAssigneeDirectory: vi.fn(),
  detectRecordFilesTable: vi.fn(),
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
});
