import { describe, expect, it } from 'vitest';
import {
  buildCommissionDraftRows,
  getCommissionLineReviewBucket,
  mergeCommissionInvoicePayments,
  recomputeCommissionDraftRow,
  type CommissionPersistedDraft,
} from './commissionRuntime';

describe('commissionRuntime', () => {
  it('uses invoice receipt rows instead of adding their mirrored cash operations again', () => {
    const payments = mergeCommissionInvoicePayments(
      [
        { amount: 15000000, status: 'received', payment_type: 'cash' },
        { amount: 30000000, status: 'received', payment_type: 'cash' },
      ],
      [{ amount: 30000000, status: 'received', payment_type: 'cash', _cash_bank_operation_id: 'operation-1' }],
    );

    expect(payments).toHaveLength(2);
    expect(payments.reduce((sum, payment) => sum + Number(payment.amount), 0)).toBe(45000000);
  });

  it('uses cash operations as a legacy fallback only when the invoice has no receipt rows', () => {
    expect(mergeCommissionInvoicePayments([], [{ amount: 45000000 }])).toEqual([{ amount: 45000000 }]);
  });

  it('hydrates a linked invoice cheque from the cash operation without adding it twice', () => {
    const payments = mergeCommissionInvoicePayments(
      [{ amount: 45000000, status: 'received', payment_type: 'cheque', _cash_bank_operation_id: 'operation-1' }],
      [{ amount: 45000000, status: 'received', payment_type: 'cheque', _cash_bank_operation_id: 'operation-1', cheque_status: 'cleared', cheque_cleared_at: '2026-06-12' }],
    );

    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ cheque_status: 'cleared', cheque_cleared_at: '2026-06-12' });
  });

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

  it('includes prepayment invoices in the approved-and-higher calculation', () => {
    const rows = buildCommissionDraftRows({
      invoices: [{
        id: 'inv-prepayment',
        status: 'prepayment',
        invoice_date: '2026-05-10',
        updated_at: '2026-05-12T09:00:00.000Z',
        total_invoice_amount: 1000000,
        assignee_id: 'profile-1',
        invoiceItems: [{ line_total: 1000000, commission_percentage: 10 }],
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      employeeDefaultCommissionByEmployeeId: { 'employee-1': 0 },
      basis: 'approved_invoices',
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
    });

    expect(rows[0]?.selected_amount).toBe(100000);
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

  it('only pays the new portion of cumulative receipts after a previous commission', () => {
    const rows = buildCommissionDraftRows({
      invoices: [{
        id: 'inv-partial',
        status: 'final',
        invoice_date: '2026-04-10',
        total_invoice_amount: 1000000,
        assignee_id: 'profile-1',
        payments: [
          { amount: 300000, status: 'settled', payment_type: 'cash', date: '2026-04-15' },
          { amount: 200000, status: 'settled', payment_type: 'cash', date: '2026-05-15' },
        ],
        invoiceItems: [{ line_total: 1000000, commission_percentage: 10 }],
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      employeeDefaultCommissionByEmployeeId: { 'employee-1': 0 },
      basis: 'prepaid_and_settled_invoices',
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
      postedAllocations: [{
        basis: 'approved_invoices',
        percent_mode: 'product_default',
        invoice_id: 'inv-partial',
        invoice_item_key: 'inv-partial:0:item',
        posted_amount: 30000,
      }],
    });

    expect(rows[0]?.entitled_amount).toBe(50000);
    expect(rows[0]?.selected_amount).toBe(20000);
  });

  it('does not show an already paid item again when the calculation basis changes', () => {
    const rows = buildCommissionDraftRows({
      invoices: [{
        id: 'inv-paid',
        status: 'settled',
        invoice_date: '2026-05-10',
        total_invoice_amount: 1000000,
        assignee_id: 'profile-1',
        payments: [{ amount: 1000000, status: 'settled', payment_type: 'cash', date: '2026-05-12' }],
        invoiceItems: [{ line_total: 1000000, commission_percentage: 10 }],
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      employeeDefaultCommissionByEmployeeId: { 'employee-1': 0 },
      basis: 'settled_invoices',
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
      postedAllocations: [{
        basis: 'approved_invoices',
        percent_mode: 'product_default',
        invoice_id: 'inv-paid',
        invoice_item_key: 'inv-paid:0:item',
        posted_amount: 100000,
      }],
    });

    expect(rows).toHaveLength(0);
  });

  it('requires full settlement and uses only cheques collected in this period', () => {
    const [row] = buildCommissionDraftRows({
      invoices: [{
        id: 'inv-cheque-only',
        status: 'settled',
        invoice_date: '2026-04-10',
        total_invoice_amount: 1000000,
        assignee_id: 'profile-1',
        payments: [
          { amount: 500000, status: 'settled', payment_type: 'cash', date: '2026-04-15' },
          { amount: 500000, status: 'settled', payment_type: 'cheque', cheque_status: 'cleared', date: '2026-04-20', cheque_cleared_at: '2026-05-12' },
        ],
        invoiceItems: [{ line_total: 1000000, commission_percentage: 10 }],
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      employeeDefaultCommissionByEmployeeId: { 'employee-1': 0 },
      basis: 'settled_and_collected_cheques',
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
    });

    expect(row.event_pool_amount).toBe(500000);
    expect(row.selected_amount).toBe(50000);
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

    expect(buildCommissionDraftRows({ ...baseArgs, basis: 'prepaid_and_settled_invoices', percentMode: 'product_default' })[0]?.event_pool_amount).toBe(1000000);
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

  it('counts a cheque in the period it was collected, not the period it was issued', () => {
    const [row] = buildCommissionDraftRows({
      invoices: [{
        id: 'inv-cheque-collection-date',
        status: 'final',
        invoice_date: '2026-04-10',
        total_invoice_amount: 1000000,
        assignee_id: 'profile-1',
        payments: [
          { amount: 500000, status: 'settled', payment_type: 'cheque', cheque_status: 'cleared', date: '2026-04-15', cheque_cleared_at: '2026-05-12' },
        ],
        invoiceItems: [{ line_total: 1000000, commission_percentage: 10 }],
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      employeeDefaultCommissionByEmployeeId: { 'employee-1': 0 },
      basis: 'prepaid_and_collected_cheques',
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
    });

    expect(row.event_pool_amount).toBe(500000);
    expect(row.selected_amount).toBe(50000);
  });

  it('pays the remaining portion of a collected cheque commission in a later month', () => {
    const invoice = {
      id: 'inv-staged-collected-cheque',
      status: 'final',
      invoice_date: '2026-04-10',
      total_invoice_amount: 1000000,
      assignee_id: 'profile-1',
      payments: [
        { amount: 450000, status: 'settled', payment_type: 'cash', date: '2026-05-12' },
        { amount: 550000, status: 'settled', payment_type: 'cheque', cheque_status: 'cleared', date: '2026-05-20', cheque_cleared_at: '2026-06-12' },
      ],
      invoiceItems: [{ line_total: 1000000, commission_percentage: 10 }],
    };
    const baseArgs = {
      invoices: [invoice],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      employeeDefaultCommissionByEmployeeId: { 'employee-1': 0 },
      basis: 'prepaid_and_collected_cheques' as const,
      percentMode: 'product_default' as const,
    };

    const mayRows = buildCommissionDraftRows({
      ...baseArgs,
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
    });
    const juneRows = buildCommissionDraftRows({
      ...baseArgs,
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      postedAllocations: [{
        basis: 'prepaid_and_collected_cheques',
        percent_mode: 'product_default',
        invoice_id: invoice.id,
        invoice_item_key: `${invoice.id}:0:item`,
        posted_amount: 45000,
      }],
    });

    expect(mayRows[0]?.selected_amount).toBe(45000);
    expect(juneRows[0]?.event_pool_amount).toBe(1000000);
    expect(juneRows[0]?.selected_amount).toBe(55000);
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

  it('groups deferred items from one invoice under a single backlog row', () => {
    const existingDrafts: CommissionPersistedDraft[] = [
      {
        source_key: 'commission_draft:employee-1:prepaid_and_settled_invoices:product_default:inv-group:item-1:2026-04-01:2026-04-30',
        employee_id: 'employee-1',
        assignee_id: 'profile-1',
        period_start: '2026-04-01',
        period_end: '2026-04-30',
        source_basis: 'prepaid_and_settled_invoices',
        percent_mode: 'product_default',
        invoice_id: 'inv-group',
        invoice_item_key: 'item-1',
        entitled_amount: 20000,
        posted_amount: 0,
        remaining_amount: 20000,
        decision_status: 'defer_to_next_period',
        details: { invoice_name: 'فاکتور گروهی', product_label: 'قلم اول', net_amount: 200000, commission_percent: 10 },
      },
      {
        source_key: 'commission_draft:employee-1:prepaid_and_settled_invoices:product_default:inv-group:item-2:2026-04-01:2026-04-30',
        employee_id: 'employee-1',
        assignee_id: 'profile-1',
        period_start: '2026-04-01',
        period_end: '2026-04-30',
        source_basis: 'prepaid_and_settled_invoices',
        percent_mode: 'product_default',
        invoice_id: 'inv-group',
        invoice_item_key: 'item-2',
        entitled_amount: 30000,
        posted_amount: 0,
        remaining_amount: 30000,
        decision_status: 'defer_to_next_period',
        details: { invoice_name: 'فاکتور گروهی', product_label: 'قلم دوم', net_amount: 300000, commission_percent: 10 },
      },
    ];

    const rows = buildCommissionDraftRows({
      invoices: [],
      employeeIdByAssigneeId: {},
      employeeDefaultCommissionByEmployeeId: {},
      basis: 'prepaid_and_settled_invoices',
      percentMode: 'product_default',
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
      existingDrafts,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.invoice_name).toBe('فاکتور گروهی');
    expect(rows[0]?.lines).toHaveLength(2);
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
