import { describe, expect, it } from 'vitest';
import {
  getTaxpayerInvoicePatternForModule,
  isReturnInvoiceModuleId,
  normalizeTaxpayerInvoicePattern,
  resolveInvoiceModuleIdForRecord,
} from './invoiceModuleRouting';

describe('invoiceModuleRouting', () => {
  it('normalizes taxpayer invoice patterns with sensible defaults', () => {
    expect(normalizeTaxpayerInvoicePattern(null)).toBe('1');
    expect(normalizeTaxpayerInvoicePattern('2')).toBe('2');
  });

  it('detects return invoice modules', () => {
    expect(isReturnInvoiceModuleId('sales_return_invoices')).toBe(true);
    expect(isReturnInvoiceModuleId('purchase_return_invoices')).toBe(true);
    expect(isReturnInvoiceModuleId('invoices')).toBe(false);
  });

  it('derives taxpayer pattern from module identity', () => {
    expect(getTaxpayerInvoicePatternForModule('invoices')).toBe('1');
    expect(getTaxpayerInvoicePatternForModule('sales_return_invoices')).toBe('2');
  });

  it('resolves shared invoice tables back to the correct module by taxpayer pattern', () => {
    expect(resolveInvoiceModuleIdForRecord('invoices', { taxpayer_invoice_pattern: '1' })).toBe('invoices');
    expect(resolveInvoiceModuleIdForRecord('invoices', { taxpayer_invoice_pattern: '2' })).toBe('sales_return_invoices');
    expect(resolveInvoiceModuleIdForRecord('purchase_invoices', { taxpayer_invoice_pattern: '2' })).toBe('purchase_return_invoices');
  });

  it('preserves explicit return module ids', () => {
    expect(resolveInvoiceModuleIdForRecord('sales_return_invoices', { taxpayer_invoice_pattern: '1' })).toBe('sales_return_invoices');
  });
});
