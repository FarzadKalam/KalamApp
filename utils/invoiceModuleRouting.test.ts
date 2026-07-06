import { describe, expect, it } from 'vitest';
import {
  getTaxpayerInvoicePatternForModule,
  getTaxpayerInvoiceSubjectForModule,
  isReturnInvoiceModuleId,
  normalizeTaxpayerInvoicePattern,
  normalizeTaxpayerInvoiceSubject,
  resolveInvoiceModuleIdForRecord,
} from './invoiceModuleRouting';

describe('invoiceModuleRouting', () => {
  it('normalizes taxpayer invoice patterns with sensible defaults', () => {
    expect(normalizeTaxpayerInvoicePattern(null)).toBe('1');
    expect(normalizeTaxpayerInvoicePattern('2')).toBe('2');
  });

  it('normalizes taxpayer invoice subjects with sensible defaults', () => {
    expect(normalizeTaxpayerInvoiceSubject(null)).toBe('1');
    expect(normalizeTaxpayerInvoiceSubject('4')).toBe('4');
  });

  it('detects return invoice modules', () => {
    expect(isReturnInvoiceModuleId('sales_return_invoices')).toBe(true);
    expect(isReturnInvoiceModuleId('purchase_return_invoices')).toBe(true);
    expect(isReturnInvoiceModuleId('invoices')).toBe(false);
  });

  it('derives taxpayer pattern from module identity', () => {
    expect(getTaxpayerInvoicePatternForModule('invoices')).toBe('1');
    expect(getTaxpayerInvoicePatternForModule('sales_return_invoices')).toBe('1');
  });

  it('derives taxpayer subject from module identity', () => {
    expect(getTaxpayerInvoiceSubjectForModule('invoices')).toBe('1');
    expect(getTaxpayerInvoiceSubjectForModule('sales_return_invoices')).toBe('4');
  });

  it('resolves shared invoice tables back to the correct module by taxpayer subject', () => {
    expect(resolveInvoiceModuleIdForRecord('invoices', { taxpayer_invoice_pattern: '1', taxpayer_invoice_subject: '1' })).toBe('invoices');
    expect(resolveInvoiceModuleIdForRecord('invoices', { taxpayer_invoice_pattern: '1', taxpayer_invoice_subject: '4' })).toBe('sales_return_invoices');
    expect(resolveInvoiceModuleIdForRecord('purchase_invoices', { taxpayer_invoice_pattern: '1', taxpayer_invoice_subject: '4' })).toBe('purchase_return_invoices');
  });

  it('keeps legacy return records discoverable during migration', () => {
    expect(resolveInvoiceModuleIdForRecord('invoices', { taxpayer_invoice_pattern: '2', source_invoice_id: 'legacy-source' })).toBe('sales_return_invoices');
    expect(resolveInvoiceModuleIdForRecord('invoices', { taxpayer_invoice_pattern: '2' })).toBe('invoices');
  });

  it('preserves explicit return module ids', () => {
    expect(resolveInvoiceModuleIdForRecord('sales_return_invoices', { taxpayer_invoice_pattern: '1' })).toBe('sales_return_invoices');
  });
});
