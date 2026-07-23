import { describe, expect, it } from 'vitest';
import {
  buildCommissionDraftRows,
  getCommissionLineReviewBucket,
  recomputeCommissionDraftRow,
  type CommissionPersistedDraft,
} from './commissionRuntime';

describe('commissionRuntime', () => {
  it('builds approved-invoice draft rows for the current period', () => {
    const rows = buildCommissionDraftRows({
      invoices: [{
        id: 'inv-1',
        name: 'فاکتور ۱',
        status: 'confirmed',
        invoice_date: '2026-05-10',
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
      percentMode: 'product_default',
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
      includeNotCalculated: true,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.selected_amount).toBe(80000);
    expect(rows[0]?.lines).toHaveLength(2);
  });

  it('keeps settled_invoices at zero until full settlement happens in the period', () => {
    const rows = buildCommissionDraftRows({
      invoices: [{
        id: 'inv-1',
        status: 'final',
        invoice_date: '2026-05-10',
        total_invoice_amount: 1000000,
        assignee_id: 'profile-1',
        payments: [{ amount: 250000, status: 'settled', payment_type: 'cash', date: '2026-05-12' }],
        invoiceItems: [{ line_total: 1000000, commission_percentage: 10 }],
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      employeeDefaultCommissionByEmployeeId: { 'employee-1': 0 },
      basis: 'settled_invoices',
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
      includeNotCalculated: true,
    });

    expect(rows[0]?.selected_amount).toBe(0);
    expect(rows[0]?.exclusion_reason).toContain('تسویه کامل');
  });

  it('uses every valid real receipt in the period for prepaid_and_settled_invoices', () => {
    const rows = buildCommissionDraftRows({
      invoices: [{
        id: 'inv-1',
        status: 'final',
        invoice_date: '2026-05-10',
        total_invoice_amount: 1000000,
        assignee_id: 'profile-1',
        payments: [{ amount: 250000, status: 'settled', payment_type: 'cash', date: '2026-05-12' }],
        invoiceItems: [{ line_total: 1000000, commission_percentage: 10 }],
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      employeeDefaultCommissionByEmployeeId: { 'employee-1': 0 },
      basis: 'prepaid_and_settled_invoices',
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
    });

    expect(rows[0]?.event_pool_amount).toBe(250000);
    expect(rows[0]?.selected_amount).toBe(25000);
  });

  it('calculates from invoice lines when older invoices do not have stored total columns', () => {
    const [row] = buildCommissionDraftRows({
      invoices: [{
        id: 'inv-schema-compatible',
        status: 'final',
        invoice_date: '2026-05-10',
        assignee_id: 'profile-1',
        payments: [{ amount: 250000, status: 'settled', payment_type: 'cash', date: '2026-05-12' }],
        invoiceItems: [{ line_total: 500000, commission_percentage: 10 }],
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      employeeDefaultCommissionByEmployeeId: { 'employee-1': 0 },
      basis: 'prepaid_and_settled_invoices',
      percentMode: 'product_default',
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
    });

    expect(row.invoice_total_amount).toBe(500000);
    expect(row.event_pool_amount).toBe(250000);
    expect(row.selected_amount).toBe(25000);
  });

  it('recognizes full settlement in the month the final real receipt was recorded', () => {
    const rows = buildCommissionDraftRows({
      invoices: [{
        id: 'inv-1',
        status: 'settled',
        invoice_date: '2026-04-10',
        total_invoice_amount: 1000000,
        assignee_id: 'profile-1',
        payments: [{ amount: 1000000, status: 'settled', payment_type: 'cash', date: '2026-05-03' }],
        invoiceItems: [{ line_total: 1000000, commission_percentage: 10 }],
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      employeeDefaultCommissionByEmployeeId: { 'employee-1': 0 },
      basis: 'settled_invoices',
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
      includeNotCalculated: true,
    });

    expect(rows[0]?.selected_amount).toBe(100000);
    expect(getCommissionLineReviewBucket(rows[0], rows[0].lines[0])).toBe('current_period');
  });

  it('counts only the second real receipt when an earlier invoice becomes settled this month', () => {
    const invoice = {
      id: 'inv-1',
      status: 'final',
      invoice_date: '2026-04-10',
      total_invoice_amount: 1000000,
      assignee_id: 'profile-1',
      payments: [
        { amount: 500000, status: 'received', payment_type: 'online', date: '2026-04-20' },
        { amount: 500000, status: 'settled', payment_type: 'credit', date: '2026-05-15' },
      ],
      invoiceItems: [{ line_total: 1000000, commission_percentage: 10 }],
    };
    const baseArgs = {
      invoices: [invoice],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      employeeDefaultCommissionByEmployeeId: { 'employee-1': 0 },
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
    };

    expect(buildCommissionDraftRows({ ...baseArgs, basis: 'prepaid_and_settled_invoices', percentMode: 'product_default' })[0]?.event_pool_amount).toBe(500000);
    expect(buildCommissionDraftRows({ ...baseArgs, basis: 'settled_invoices', percentMode: 'product_default' })[0]?.event_pool_amount).toBe(1000000);
  });

  it('accepts a received cheque only after it is cleared or spent', () => {
    const args = {
      invoices: [{
        id: 'inv-cheque',
        status: 'final',
        invoice_date: '2026-05-10',
        total_invoice_amount: 700000,
        assignee_id: 'profile-1',
        payments: [
          { amount: 300000, status: 'received', payment_type: 'cheque', cheque_status: 'in_bank', date: '2026-05-12' },
          { amount: 400000, status: 'received', payment_type: 'cheque', cheque_status: 'paid', date: '2026-05-18' },
        ],
        invoiceItems: [{ line_total: 700000, commission_percentage: 10 }],
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      employeeDefaultCommissionByEmployeeId: { 'employee-1': 0 },
      basis: 'prepaid_and_settled_invoices' as const,
      percentMode: 'product_default' as const,
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
    };

    expect(buildCommissionDraftRows(args)[0]?.event_pool_amount).toBe(400000);
  });

  it('uses recorded received total for legacy invoices without payment rows', () => {
    const [row] = buildCommissionDraftRows({
      invoices: [{
        id: 'inv-legacy',
        invoice_date: '2026-04-10',
        updated_at: '2026-05-25T14:00:00.000Z',
        total_invoice_amount: 1000000,
        total_received_amount: 1000000,
        remaining_balance: 0,
        assignee_id: 'profile-1',
        invoiceItems: [{ line_total: 1000000, commission_percentage: 10 }],
        payments: [],
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      employeeDefaultCommissionByEmployeeId: { 'employee-1': 0 },
      basis: 'prepaid_and_settled_invoices',
      percentMode: 'product_default',
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
    });

    expect(row.event_pool_amount).toBe(1000000);
    expect(row.selected_amount).toBe(100000);
  });

  it('allows manual include to restore a zero-pool excluded invoice row', () => {
    const [row] = buildCommissionDraftRows({
      invoices: [{
        id: 'inv-1',
        status: 'final',
        invoice_date: '2026-04-10',
        total_invoice_amount: 1000000,
        assignee_id: 'profile-1',
        payments: [{ amount: 250000, status: 'settled', payment_type: 'cash', date: '2026-04-12' }],
        invoiceItems: [
          { line_total: 500000, commission_percentage: 10, id: 'a' },
          { line_total: 500000, commission_percentage: 10, id: 'b' },
        ],
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      employeeDefaultCommissionByEmployeeId: { 'employee-1': 0 },
      basis: 'settled_invoices',
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      includeNotCalculated: true,
    });

    expect(row.selected_amount).toBe(0);

    const includedRow = recomputeCommissionDraftRow({
      ...row,
      lines: row.lines.map((line, index) => ({ ...line, decision_status: index === 0 ? 'include' : 'auto' })),
    });

    expect(includedRow.selected_amount).toBe(50000);
    expect(includedRow.lines[1]?.selected_amount).toBe(0);
    expect(getCommissionLineReviewBucket(includedRow, includedRow.lines[0])).toBe('current_period');
  });

  it('counts cash/prepayment receipts and only collected cheques for prepaid_and_collected_cheques', () => {
    const rows = buildCommissionDraftRows({
      invoices: [{
        id: 'inv-1',
        status: 'final',
        invoice_date: '2026-05-10',
        total_invoice_amount: 1000000,
        assignee_id: 'profile-1',
        payments: [
          { amount: 300000, status: 'settled', payment_type: 'cash', date: '2026-05-12' },
          { amount: 500000, status: 'settled', payment_type: 'cheque', cheque_status: 'pending', date: '2026-05-14' },
          { amount: 200000, status: 'settled', payment_type: 'cheque', cheque_status: 'cleared', date: '2026-05-20' },
        ],
        invoiceItems: [{ line_total: 1000000, commission_percentage: 10 }],
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      employeeDefaultCommissionByEmployeeId: { 'employee-1': 0 },
      basis: 'prepaid_and_collected_cheques',
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
    });

    expect(rows[0]?.event_pool_amount).toBe(500000);
    expect(rows[0]?.selected_amount).toBe(50000);
  });

  it('treats deferred drafts from previous periods as fixed backlog rows', () => {
    const existingDrafts: CommissionPersistedDraft[] = [{
      source_key: 'commission_draft:employee-1:prepaid_and_settled_invoices:product_default:inv-1:inv-1:0:item:2026-04-01:2026-04-31',
      employee_id: 'employee-1',
      assignee_id: 'profile-1',
      period_start: '2026-04-01',
      period_end: '2026-04-30',
      source_basis: 'prepaid_and_settled_invoices',
      percent_mode: 'product_default',
      invoice_id: 'inv-1',
      invoice_item_key: 'inv-1:0:item',
      entitled_amount: 50000,
      posted_amount: 0,
      remaining_amount: 50000,
      decision_status: 'defer_to_next_period',
      details: {
        invoice_name: 'فاکتور ۱',
        product_label: 'سرویس A',
        commission_percent: 10,
        net_amount: 500000,
      },
    }];

    const rows = buildCommissionDraftRows({
      invoices: [],
      employeeIdByAssigneeId: {},
      employeeDefaultCommissionByEmployeeId: {},
      basis: 'prepaid_and_settled_invoices',
      percentMode: 'product_default',
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
      existingDrafts,
      includeNotCalculated: true,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.mode).toBe('fixed');
    expect(rows[0]?.is_from_previous_period).toBe(true);
    expect(rows[0]?.selected_amount).toBe(0);
  });

  it('moves an included deferred line into the calculable bucket', () => {
    const existingDrafts: CommissionPersistedDraft[] = [{
      source_key: 'commission_draft:employee-1:prepaid_and_settled_invoices:product_default:inv-1:item-1:2026-04-01:2026-04-30',
      employee_id: 'employee-1',
      assignee_id: 'profile-1',
      period_start: '2026-04-01',
      period_end: '2026-04-30',
      source_basis: 'prepaid_and_settled_invoices',
      percent_mode: 'product_default',
      invoice_id: 'inv-1',
      invoice_item_key: 'item-1',
      entitled_amount: 50000,
      posted_amount: 0,
      remaining_amount: 50000,
      decision_status: 'defer_to_next_period',
      details: {
        invoice_name: 'فاکتور ۱',
        product_label: 'سرویس A',
        commission_percent: 10,
        net_amount: 500000,
      },
    }];
    const [row] = buildCommissionDraftRows({
      invoices: [],
      employeeIdByAssigneeId: {},
      employeeDefaultCommissionByEmployeeId: {},
      basis: 'prepaid_and_settled_invoices',
      percentMode: 'product_default',
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
      existingDrafts,
      includeNotCalculated: true,
    });

    const includedRow = recomputeCommissionDraftRow({
      ...row,
      lines: row.lines.map((line) => ({ ...line, decision_status: 'include' })),
    });

    expect(includedRow.selected_amount).toBe(50000);
    expect(getCommissionLineReviewBucket(includedRow, includedRow.lines[0])).toBe('current_period');
  });

  it('reallocates current-period pool amounts after excluding a line', () => {
    const [row] = buildCommissionDraftRows({
      invoices: [{
        id: 'inv-1',
        status: 'final',
        invoice_date: '2026-05-10',
        total_invoice_amount: 1000000,
        assignee_id: 'profile-1',
        payments: [{ amount: 500000, status: 'settled', payment_type: 'cash', date: '2026-05-12' }],
        invoiceItems: [
          { line_total: 500000, commission_percentage: 10, id: 'a' },
          { line_total: 500000, commission_percentage: 10, id: 'b' },
        ],
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      employeeDefaultCommissionByEmployeeId: { 'employee-1': 0 },
      basis: 'prepaid_and_settled_invoices',
      percentMode: 'product_default',
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
    });

    const updated = recomputeCommissionDraftRow({
      ...row,
      lines: row.lines.map((line, index) => ({
        ...line,
        decision_status: index === 0 ? 'exclude' : 'include',
      })),
    });

    expect(updated.lines[0]?.selected_amount).toBe(0);
    expect(updated.lines[1]?.selected_amount).toBe(50000);
  });
});
