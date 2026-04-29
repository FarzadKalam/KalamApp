import { describe, expect, it } from 'vitest';
import { buildCommissionPreviewRows } from './commissionRuntime';

describe('commissionRuntime', () => {
  it('calculates approved invoice commission from product and employee defaults', () => {
    const rows = buildCommissionPreviewRows({
      invoices: [{
        id: 'inv-1',
        name: 'فاکتور ۱',
        status: 'confirmed',
        total_invoice_amount: 1000000,
        assignee_id: 'profile-1',
        invoiceItems: [
          { line_total: 400000, commission_percentage: 5 },
          { line_total: 600000 },
        ],
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      employeeDefaultCommissionByEmployeeId: { 'employee-1': 10 },
      basis: 'approved_invoices',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.commission_amount).toBe(80000);
  });

  it('excludes partially paid invoices from settled invoice basis', () => {
    const rows = buildCommissionPreviewRows({
      invoices: [{
        id: 'inv-1',
        status: 'final',
        total_invoice_amount: 1000000,
        assignee_id: 'profile-1',
        payments: [{ amount: 250000, status: 'settled', payment_type: 'cash' }],
        invoiceItems: [{ line_total: 1000000, commission_percentage: 10 }],
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      employeeDefaultCommissionByEmployeeId: { 'employee-1': 0 },
      basis: 'settled_invoices',
      includeNotCalculated: true,
    });

    expect(rows[0]?.commission_amount).toBe(0);
    expect(rows[0]?.eligible_ratio).toBe(0);
    expect(rows[0]?.invoice_received_amount).toBe(250000);
  });

  it('uses paid ratio for prepaid and settled invoice basis', () => {
    const rows = buildCommissionPreviewRows({
      invoices: [{
        id: 'inv-1',
        status: 'final',
        total_invoice_amount: 1000000,
        assignee_id: 'profile-1',
        payments: [{ amount: 250000, status: 'settled', payment_type: 'cash' }],
        invoiceItems: [{ line_total: 1000000, commission_percentage: 10 }],
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      employeeDefaultCommissionByEmployeeId: { 'employee-1': 0 },
      basis: 'prepaid_and_settled_invoices',
    });

    expect(rows[0]?.commission_amount).toBe(25000);
    expect(rows[0]?.eligible_ratio).toBe(0.25);
    expect(rows[0]?.invoice_received_amount).toBe(250000);
  });

  it('calculates fully settled invoices at full ratio', () => {
    const rows = buildCommissionPreviewRows({
      invoices: [{
        id: 'inv-1',
        status: 'final',
        total_invoice_amount: 1000000,
        total_received_amount: 1000000,
        remaining_balance: 0,
        assignee_id: 'profile-1',
        invoiceItems: [{ line_total: 1000000, commission_percentage: 10 }],
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      employeeDefaultCommissionByEmployeeId: { 'employee-1': 0 },
      basis: 'settled_invoices',
    });

    expect(rows[0]?.commission_amount).toBe(100000);
    expect(rows[0]?.eligible_ratio).toBe(1);
  });

  it('excludes uncollected cheques from collected-cheque basis', () => {
    const rows = buildCommissionPreviewRows({
      invoices: [{
        id: 'inv-1',
        status: 'settled',
        total_invoice_amount: 1000000,
        assignee_id: 'profile-1',
        payments: [
          { amount: 500000, status: 'settled', payment_type: 'cash' },
          { amount: 500000, status: 'settled', payment_type: 'cheque', cheque_status: 'new' },
        ],
        invoiceItems: [{ line_total: 1000000, commission_percentage: 10 }],
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      employeeDefaultCommissionByEmployeeId: { 'employee-1': 0 },
      basis: 'settled_and_collected_cheques',
    });

    expect(rows[0]?.commission_amount).toBe(50000);
    expect(rows[0]?.eligible_ratio).toBe(0.5);
  });
});
