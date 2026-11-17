import { describe, expect, it } from 'vitest';
import {
  buildCommissionDraftRows,
  buildCommissionDraftSourceKey,
  buildCommissionInvoiceItemKey,
  getCommissionLineReviewBucket,
  hydrateCommissionReceiptCheques,
  reconcileCommissionHistory,
  mergeCommissionInvoicePayments,
  recomputeCommissionDraftRow,
  summarizeCommissionPeriod,
  getCommissionInvoiceFinancials,
  getCommissionLineBaseAmount,
  updateCommissionLineRate,
  type CommissionPersistedDraft,
} from './commissionRuntime';

describe('commissionRuntime', () => {
  it('allows rating an old previously unrated receipt without requiring a new payment', () => {
    const args = collectedAuditArgs({ payments: [{ amount: 400000, status: 'received', payment_type: 'cash', date: '2026-04-10' }],
      invoiceItems: [{ id: 'item-1', line_total: 1000000, commission_percentage: 0 }] });
    const [row] = buildCommissionDraftRows(args);
    expect(row.mode).toBe('fixed');
    expect(row.lines[0].commission_rate_missing).toBe(true);
    const edited = updateCommissionLineRate(row, row.lines[0].key, 5);
    expect(edited.selected_amount).toBe(20000);
    expect(edited.lines[0].commission_base_amount).toBe(400000);
  });

  it('reallocates a partial receipt across all rated items after resolving a missing rate', () => {
    const args = collectedAuditArgs({ payments: [{ amount: 500000, status: 'received', payment_type: 'cash', date: '2026-05-10' }],
      invoiceItems: [{ id: 'item-1', line_total: 500000, commission_percentage: 10 }, { id: 'item-2', line_total: 500000, commission_percentage: 0 }] });
    const [row] = buildCommissionDraftRows(args);
    expect(row.selected_amount).toBe(50000);
    const edited = updateCommissionLineRate(row, row.lines[1].key, 5);
    expect(edited.selected_amount).toBe(37500);
    expect(edited.lines.map(line => line.commission_base_amount)).toEqual([250000, 250000]);
  });

  it('keeps a receipt invoice with no rate visible and recalculates it after an explicit rate', () => {
    const args = collectedAuditArgs({ payments: [{ amount: 400000, status: 'received', payment_type: 'cash', date: '2026-05-10' }],
      invoiceItems: [{ id: 'item-1', line_total: 1000000, commission_percentage: 0 }] });
    const [row] = buildCommissionDraftRows(args);
    expect(row.lines[0].commission_rate_missing).toBe(true);
    expect(row.selected_amount).toBe(0);
    const edited = updateCommissionLineRate(row, row.lines[0].key, 5);
    expect(edited.selected_amount).toBe(20000);
    expect(edited.lines[0].commission_base_amount).toBe(400000);
    expect(edited.lines[0].commission_rate_missing).toBe(false);
    expect(() => updateCommissionLineRate(row, row.lines[0].key, 101)).toThrow();
  });

  it('preserves an explicitly saved zero rate without warning or employee fallback', () => {
    const args = collectedAuditArgs({ payments: [{ amount: 400000, status: 'received', payment_type: 'cash', date: '2026-05-10' }] });
    const [row] = buildCommissionDraftRows(args);
    const line = row.lines[0];
    const [restored] = buildCommissionDraftRows({ ...args, includeNotCalculated: true, existingDrafts: [{
      source_key: line.source_key, employee_id: line.employee_id, invoice_id: line.invoice_id, invoice_item_key: line.invoice_item_key,
      source_basis: row.basis, percent_mode: row.percent_mode, period_start: args.periodStart, period_end: args.periodEnd,
      entitled_amount: 0, posted_amount: 0, remaining_amount: 0, decision_status: 'auto', draft_status: 'draft',
      details: { commission_percent: 0, commission_rate_overridden: true },
    }] });
    expect(restored.lines[0].commission_percent).toBe(0);
    expect(restored.lines[0].commission_rate_missing).toBe(false);
  });

  it('shows only the newly unposted base for partial collections and historical rows', () => {
    const args = collectedAuditArgs({ payments: [{ amount: 600000, status: 'received', payment_type: 'cash', date: '2026-05-10' }] });
    const [initial] = buildCommissionDraftRows(args);
    const [row] = buildCommissionDraftRows({ ...args, postedAllocations: [{ invoice_id: 'audit-invoice',
      invoice_item_key: initial.lines[0].invoice_item_key, posted_amount: 40000,
      basis: 'prepaid_and_settled_invoices', percent_mode: 'product_default' }] });
    expect(row.selected_amount).toBe(20000);
    expect(row.lines[0].commission_base_amount).toBe(200000);
    expect(getCommissionLineBaseAmount({ entitled_amount: 60000, posted_amount: 40000, commission_percent: 10 })).toBe(200000);
  });

  it('leaves an uncollected cheque in future base even when cached totals say settled', () => {
    const args = collectedAuditArgs({ total_received_amount: 1000000, payments: [
      { amount: 400000, status: 'received', payment_type: 'cash', date: '2026-05-10' },
      { amount: 600000, status: 'received', payment_type: 'cheque', cheque_status: 'new', date: '2026-05-10' },
    ] });
    expect(getCommissionInvoiceFinancials(args.invoices[0], '2026-05-31')).toEqual({
      invoice_total_amount: 1000000, invoice_received_amount: 400000, invoice_verified_received_amount: 400000, invoice_future_base_amount: 600000,
    });
  });
  const collectedAuditArgs = (invoice: Record<string, any>, extra: Record<string, any> = {}) => ({
    invoices: [{ id: 'audit-invoice', name: 'فاکتور آزمون', invoice_date: '2026-04-10', status: 'final', assignee_id: 'audit-profile',
      total_invoice_amount: 1000000, invoiceItems: [{ id: 'item-1', line_total: 1000000, commission_percentage: 10 }], ...invoice }],
    employeeIdByAssigneeId: { 'audit-profile': 'audit-employee' }, employeeDefaultCommissionByEmployeeId: { 'audit-employee': 0 },
    basis: 'prepaid_and_settled_invoices' as const, percentMode: 'product_default' as const,
    periodStart: '2026-05-01', periodEnd: '2026-05-31', ...extra,
  });

  it('summarizes sales by invoice date, actual receipts by collection date and pending cheques by due date', () => {
    const args=collectedAuditArgs({invoice_date:'2026-05-10',payments:[
      {id:'cash',amount:100000,payment_type:'cash',status:'received',date:'2026-05-11'},
      {id:'pending',cheque_id:'pending',amount:200000,payment_type:'cheque',status:'received',cheque_status:'new',date:'2026-04-12',due_date:'2026-05-25'},
      {id:'bounced',cheque_id:'bounced',amount:300000,payment_type:'cheque',status:'received',cheque_status:'bounced',date:'2026-04-12',due_date:'2026-05-25'},
      {id:'returned',cheque_id:'returned',amount:900000,payment_type:'cheque',status:'received',cheque_status:'returned',due_date:'2026-05-25'},
      {id:'not-due',cheque_id:'not-due',amount:900000,payment_type:'cheque',status:'received',cheque_status:'new',due_date:'2026-06-01'},
    ],invoiceItems:[{line_total:600000,commission_percentage:10,quantity:2},{line_total:400000,commission_percentage:0,quantity:4}]});
    args.invoices.push({...args.invoices[0],id:'old',invoice_date:'2026-04-01',payments:[
      {id:'collected',cheque_id:'collected',amount:500000,payment_type:'cheque',status:'received',cheque_status:'cleared',date:'2026-04-10',cheque_cleared_at:'2026-05-12'}]});
    args.invoices.push({...args.invoices[0],id:'future',invoice_date:'2026-06-01',payments:[
      {id:'future-pending',cheque_id:'future-pending',amount:100000,payment_type:'cheque',status:'received',cheque_status:'new',due_date:'2026-05-20'}]});
    expect(summarizeCommissionPeriod(args)).toEqual({sales:1000000,received:600000,outstandingCheques:600000,nonCommissionSales:400000,nonCommissionQuantity:4});
  });

  it('does not double-count repeated invoices or receipt mirrors and caps unique cheque allocations to face value', () => {
    const args=collectedAuditArgs({invoice_date:'2026-05-10',payments:[
      {id:'cash',amount:100000,payment_type:'cash',status:'received',date:'2026-05-11'},
      {id:'cash',amount:100000,payment_type:'cash',status:'received',date:'2026-05-11'},
      ...['p1','p2'].map(id=>({id,cheque_id:'same-cheque',amount:400000,cheque_amount:600000,payment_type:'cheque',status:'received',cheque_status:'new',due_date:'2026-05-25'})),
      ...['c1','c2'].map(id=>({id,cheque_id:'cleared-cheque',amount:400000,cheque_amount:600000,payment_type:'cheque',status:'received',cheque_status:'cleared',cheque_cleared_at:'2026-05-25'})),
    ]});
    args.invoices.push(args.invoices[0]);
    const summary=summarizeCommissionPeriod(args);
    expect(summary.sales).toBe(1000000);expect(summary.received).toBe(700000);expect(summary.outstandingCheques).toBe(600000);
  });

  it('uses effective selected rate for noncommission quantity and ignores cache-only or invalid receipts', () => {
    const args=collectedAuditArgs({invoice_date:'2026-05-10',total_received_amount:1000000,remaining_balance:0,
      invoiceItems:[{line_total:1000000,quantity:3,commission_percentage:10}],payments:[
        {id:'failed',amount:1000000,payment_type:'cash',status:'canceled',date:'2026-05-12'},
        {id:'undated',amount:1000000,payment_type:'cash',status:'received'},
      ]});
    expect(summarizeCommissionPeriod({...args,percentMode:'employee_default'})).toEqual({sales:1000000,received:0,outstandingCheques:0,nonCommissionSales:1000000,nonCommissionQuantity:3});
    expect(summarizeCommissionPeriod(args).nonCommissionSales).toBe(0);
  });

  it('uses authoritative cheque collection and reversal status over stale invoice snapshots', () => {
    const payment={amount:1000000,payment_type:'cheque',status:'received',cheque_id:'cheque-1',date:'2026-04-12',cheque_status:'new'};
    const cleared=hydrateCommissionReceiptCheques([payment],[],[{id:'cheque-1',status:'cleared',cleared_at:'2026-05-12'}]);
    expect(cleared.issues).toEqual([]);
    expect(buildCommissionDraftRows(collectedAuditArgs({payments:cleared.payments}))[0].selected_amount).toBe(100000);
    const bounced=hydrateCommissionReceiptCheques([{...payment,cheque_status:'cleared',cheque_cleared_at:'2026-05-12'}],[],[{id:'cheque-1',status:'bounced'}]);
    for(const basis of ['prepaid_and_settled_invoices','full_settlement_only'] as const)
      expect(buildCommissionDraftRows(collectedAuditArgs({payments:bounced.payments,total_received_amount:1000000,remaining_balance:0},{basis}))).toEqual([]);
  });

  it('keeps stable row keys when invoice items are reordered, preserving direct id priority', () => {
    const item={row_key:'stable-row',product_id:'product-a'};
    expect(buildCommissionInvoiceItemKey('invoice',item,0)).toBe('invoice:stable-row');
    expect(buildCommissionInvoiceItemKey('invoice',item,5)).toBe('invoice:stable-row');
    expect(buildCommissionInvoiceItemKey('invoice',{...item,id:'direct-id'},5)).toBe('invoice:direct-id');
  });

  it('consumes a legacy allocation exactly once after row-key introduction and reorder', () => {
    const args=collectedAuditArgs({payments:[{amount:1000000,payment_type:'cash',status:'received',date:'2026-05-12'}],
      invoiceItems:[{row_key:'b',product_id:'product-b',line_total:400000,commission_percentage:10},
        {row_key:'a',product_id:'product-a',line_total:600000,commission_percentage:10}]});
    const allocations:any=[{basis:args.basis,percent_mode:args.percentMode,invoice_id:'audit-invoice',
      invoice_item_key:'audit-invoice:0:product-a',posted_amount:60000,details:{product_id:'product-a',net_amount:600000}}];
    const history=reconcileCommissionHistory({invoices:args.invoices,postedAllocations:allocations});
    expect(history.issues).toEqual([]);expect(history.postedAllocations[0].invoice_item_key).toBe('audit-invoice:a');
    expect(buildCommissionDraftRows({...args,postedAllocations:allocations})[0].selected_amount).toBe(40000);
  });

  it('disambiguates repeated products only through a unique unchanged snapshot', () => {
    const invoices:any=[{id:'invoice',invoiceItems:[{row_key:'small',product_id:'same',line_total:300000,quantity:1},
      {row_key:'large',product_id:'same',line_total:700000,quantity:2}]}];
    const history=reconcileCommissionHistory({invoices,postedAllocations:[{basis:'prepaid_and_settled_invoices',percent_mode:'product_default',
      invoice_id:'invoice',invoice_item_key:'invoice:0:same',posted_amount:70000,details:{product_id:'same',net_amount:700000,quantity:2}}]});
    expect(history.issues).toEqual([]);expect(history.postedAllocations[0].invoice_item_key).toBe('invoice:large');
  });

  it('blocks ambiguous or unmatched legacy history and exposes Persian review issues', () => {
    const args=collectedAuditArgs({payments:[{amount:1000000,payment_type:'cash',status:'received',date:'2026-05-12'}],
      invoiceItems:[{row_key:'a',product_id:'same',line_total:500000,commission_percentage:10},
        {row_key:'b',product_id:'same',line_total:500000,commission_percentage:10}]});
    for(const product of ['same','deleted-product']) {
      let issues:any[]=[];
      const rows=buildCommissionDraftRows({...args,postedAllocations:[{basis:args.basis,percent_mode:args.percentMode,
        invoice_id:'audit-invoice',invoice_item_key:`audit-invoice:0:${product}`,posted_amount:50000}],onHistoryIssues:value=>{issues=value;}});
      expect(rows).toEqual([]);expect(issues).toHaveLength(1);expect(issues[0].messageFa).toContain('پیش از ثبت');
    }
  });

  it('blocks duplicate stable invoice row identities even before any commission history exists', () => {
    const history=reconcileCommissionHistory({invoices:[{id:'invoice',invoiceItems:[{row_key:'duplicate'},{row_key:'duplicate'}]}]});
    expect(history.blockedInvoiceIds).toEqual(['invoice']);expect(history.issues[0].code).toBe('ambiguous_item_identity');
  });

  it('aliases an existing current draft while preserving its persisted source key and saved rate', () => {
    const args=collectedAuditArgs({payments:[{amount:1000000,payment_type:'cash',status:'received',date:'2026-05-12'}],
      invoiceItems:[{row_key:'new-stable',product_id:'product-a',line_total:1000000,commission_percentage:50}]});
    const draft:any={source_key:'original-persisted-source',employee_id:'audit-employee',period_start:'2026-05-01',period_end:'2026-05-31',
      source_basis:args.basis,percent_mode:args.percentMode,invoice_id:'audit-invoice',invoice_item_key:'audit-invoice:0:product-a',
      entitled_amount:100000,posted_amount:0,remaining_amount:100000,decision_status:'auto',draft_status:'draft',
      details:{product_id:'product-a',net_amount:1000000,commission_percent:10}};
    const [row]=buildCommissionDraftRows({...args,existingDrafts:[draft]});
    expect(row.selected_amount).toBe(100000);expect(row.lines[0].source_key).toBe('original-persisted-source');
    expect(row.lines[0].invoice_item_key).toBe('audit-invoice:new-stable');
  });

  it('keeps deferred legacy history once after reordering and blocks its backlog when identity is ambiguous', () => {
    const args=collectedAuditArgs({payments:[{amount:1000000,payment_type:'cash',status:'received',date:'2026-04-12'}],
      invoiceItems:[{row_key:'stable-a',product_id:'product-a',line_total:1000000,commission_percentage:10}]});
    const draft:any={source_key:'deferred-original',employee_id:'audit-employee',period_start:'2026-04-01',period_end:'2026-04-30',
      source_basis:args.basis,percent_mode:args.percentMode,invoice_id:'audit-invoice',invoice_item_key:'audit-invoice:7:product-a',
      entitled_amount:100000,posted_amount:0,remaining_amount:100000,decision_status:'defer_to_next_period',draft_status:'draft',
      details:{product_id:'product-a',net_amount:1000000,commission_percent:10}};
    const rows=buildCommissionDraftRows({...args,existingDrafts:[draft]});
    expect(rows).toHaveLength(1);expect(rows[0].remaining_amount).toBe(100000);
    expect(rows[0].lines[0].source_key).toBe('deferred-original');
    expect(rows[0].lines[0].invoice_item_key).toBe('audit-invoice:stable-a');
    const ambiguous={...args,invoices:args.invoices.map(invoice=>({...invoice,invoiceItems:[...invoice.invoiceItems,
      {...invoice.invoiceItems[0],row_key:'stable-b'}]}))};
    expect(buildCommissionDraftRows({...ambiguous,existingDrafts:[draft]})).toEqual([]);
  });

  it('hydrates legacy operation cheque ids and leaves cash payments untouched', () => {
    const cash={amount:200000,payment_type:'cash',status:'received',date:'2026-05-10'};
    const result=hydrateCommissionReceiptCheques([], [cash,{amount:800000,payment_type:'cheque',status:'received',spent_cheque_id:'spent-1',date:'2026-04-10'}],
      [{id:'spent-1',status:'paid',spent_date:'2026-05-12'}]);
    expect(result.payments[0]).toBe(cash);expect(result.issues).toEqual([]);
    expect(buildCommissionDraftRows(collectedAuditArgs({payments:result.payments}))[0].selected_amount).toBe(100000);
  });

  it('reports missing authoritative cheque data and dates rather than manufacturing collection at issue time', () => {
    const payment={amount:1000000,payment_type:'cheque',status:'received',cheque_id:'cheque-1',date:'2026-05-12',cheque_status:'cleared'};
    for(const cheques of [[],[{id:'cheque-1',status:'cleared'}]]) {
      const result=hydrateCommissionReceiptCheques([payment],[],cheques);
      expect(result.issues).toHaveLength(1);
      for(const basis of ['prepaid_and_settled_invoices','full_settlement_only'] as const)
        expect(buildCommissionDraftRows(collectedAuditArgs({payments:result.payments,total_received_amount:1000000,remaining_balance:0},{basis}))).toEqual([]);
    }
  });

  it('never turns pending or bounced cheques into real receipts through invoice cached totals', () => {
    for (const basis of ['prepaid_and_settled_invoices', 'full_settlement_only'] as const) {
      for (const cheque_status of ['new', 'in_bank', 'bounced', 'returned', 'canceled']) {
        const rows = buildCommissionDraftRows(collectedAuditArgs({ total_received_amount: 1000000, remaining_balance: 0, updated_at: '2026-05-12',
          payments: [{ amount: 1000000, payment_type: 'cheque', status: 'received', cheque_status, date: '2026-05-12' }] }, { basis }));
        expect(rows.reduce((sum,row)=>sum+row.selected_amount,0)).toBe(0);
      }
    }
  });

  it('fails closed for undated or failed receipt rows instead of substituting cached settlement', () => {
    for (const payment of [{ amount: 1000000, payment_type: 'cash', status: 'received' },
      { amount: 1000000, payment_type: 'cash', status: 'canceled', date: '2026-05-12' }]) {
      expect(buildCommissionDraftRows(collectedAuditArgs({ total_received_amount: 1000000, remaining_balance: 0, updated_at: '2026-05-12', payments: [payment] }))).toEqual([]);
    }
  });

  it('includes both period boundaries and excludes future receipts from the cumulative entitlement', () => {
    const args=collectedAuditArgs({payments:[{amount:200000,payment_type:'cash',status:'received',date:'2026-05-01T00:00:00'},
      {amount:300000,payment_type:'cash',status:'received',date:'2026-05-31T23:59:59.999'},
      {amount:500000,payment_type:'cash',status:'received',date:'2026-06-01T00:00:00'}]});
    expect(buildCommissionDraftRows(args)[0].selected_amount).toBe(50000);
  });

  it('shows an uncalculated earlier real receipt as backlog with its original collection date', () => {
    const [row] = buildCommissionDraftRows(collectedAuditArgs({ payments: [{ amount: 1000000, payment_type: 'cash', status: 'received', date: '2026-04-12' }] }));
    expect(row.selected_amount).toBe(100000);
    expect(row.is_from_previous_period).toBe(true);
    expect(row.eligibility_event_at).toContain('2026-04-12');
    expect(getCommissionLineReviewBucket(row,row.lines[0])).toBe('backlog');
  });

  it('subtracts previous posting from old receipts and does not resurrect fully consumed commission', () => {
    const args = collectedAuditArgs({ payments: [{ amount: 1000000, payment_type: 'cash', status: 'received', date: '2026-04-12' }] });
    const allocation = { basis: 'prepaid_and_settled_invoices' as const, percent_mode: 'product_default' as const,
      invoice_id: 'audit-invoice', invoice_item_key: 'audit-invoice:item-1', posted_amount: 60000 };
    expect(buildCommissionDraftRows({ ...args, postedAllocations: [allocation] })[0].selected_amount).toBe(40000);
    expect(buildCommissionDraftRows({ ...args, postedAllocations: [{ ...allocation, posted_amount: 100000 }] })).toEqual([]);
  });

  it('includes missed old and current receipt portions cumulatively without double-paying earlier posting', () => {
    const args = collectedAuditArgs({ payments: [{ amount: 400000, payment_type: 'cash', status: 'received', date: '2026-04-12' },
      { amount: 300000, payment_type: 'cash', status: 'received', date: '2026-05-12' }] });
    expect(buildCommissionDraftRows(args)[0].selected_amount).toBe(70000);
    expect(buildCommissionDraftRows({ ...args, postedAllocations: [{ basis: 'prepaid_and_settled_invoices', percent_mode: 'product_default',
      invoice_id: 'audit-invoice', invoice_item_key: 'audit-invoice:item-1', posted_amount: 40000 }] })[0].selected_amount).toBe(30000);
  });

  it('recognizes full real collection only when the final cheque clears, preserving partial receipt treatment', () => {
    const args=collectedAuditArgs({ payments: [{ amount: 200000, payment_type: 'cash', status: 'received', date: '2026-04-12' },
      { amount: 800000, payment_type: 'cheque', status: 'received', cheque_status: 'cleared', date: '2026-04-13', cheque_cleared_at: '2026-05-12' }] });
    const [row]=buildCommissionDraftRows({ ...args, basis:'full_settlement_only' });
    expect(row.selected_amount).toBe(100000); expect(row.eligibility_event_at).toContain('2026-05-12');
    expect(buildCommissionDraftRows({ ...args, periodStart:'2026-04-01',periodEnd:'2026-04-30',basis:'full_settlement_only' })).toEqual([]);
  });

  it('keeps previous manual exclusion and avoids duplicating a saved deferred backlog line', () => {
    const args=collectedAuditArgs({ payments:[{ amount:1000000,payment_type:'cash',status:'received',date:'2026-04-12' }] });
    const draft:any={source_key:'saved-april',employee_id:'audit-employee',assignee_id:'audit-profile',period_start:'2026-04-01',period_end:'2026-04-30',
      source_basis:'prepaid_and_settled_invoices',percent_mode:'product_default',invoice_id:'audit-invoice',invoice_item_key:'audit-invoice:item-1',
      entitled_amount:100000,posted_amount:0,remaining_amount:100000,decision_status:'exclude',draft_status:'draft',details:{net_amount:1000000,commission_percent:10}};
    const excluded=buildCommissionDraftRows({...args,existingDrafts:[draft]});
    expect(excluded.reduce((sum,row)=>sum+row.selected_amount,0)).toBe(0);
    expect(excluded[0].lines[0].decision_status).toBe('exclude');
    const otherEmployee=buildCommissionDraftRows({...args,existingDrafts:[{...draft,employee_id:'previous-employee'}]});
    expect(otherEmployee.reduce((sum,row)=>sum+row.selected_amount,0)).toBe(100000);
    const deferred=buildCommissionDraftRows({...args,existingDrafts:[{...draft,decision_status:'defer_to_next_period'}]});
    expect(deferred).toHaveLength(1);expect(deferred[0].lines).toHaveLength(1);expect(deferred[0].remaining_amount).toBe(100000);
  });
  it('reserves a deferred old portion once while keeping the newly received portion available', () => {
    const args=collectedAuditArgs({payments:[{amount:400000,payment_type:'cash',status:'received',date:'2026-04-12'},
      {amount:300000,payment_type:'cash',status:'received',date:'2026-05-12'}]});
    const deferred:any={source_key:'deferred-april',employee_id:'audit-employee',assignee_id:'audit-profile',period_start:'2026-04-01',period_end:'2026-04-30',
      source_basis:'prepaid_and_settled_invoices',percent_mode:'product_default',invoice_id:'audit-invoice',invoice_item_key:'audit-invoice:item-1',
      entitled_amount:40000,posted_amount:0,remaining_amount:40000,decision_status:'defer_to_next_period',draft_status:'draft',details:{net_amount:1000000,commission_percent:10}};
    const rows=buildCommissionDraftRows({...args,existingDrafts:[deferred]});
    expect(rows).toHaveLength(2);
    expect(rows.reduce((sum,row)=>sum+row.remaining_amount,0)).toBe(70000);
    expect(rows.reduce((sum,row)=>sum+row.selected_amount,0)).toBe(30000);
    const backlog=rows.find(row=>row.key.startsWith('commission_backlog:'))!;
    expect(backlog.remaining_amount).toBe(40000);expect(backlog.selected_amount).toBe(0);
  });
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

  it('keeps the commission rate saved with the draft when the product rate later changes', () => {
    const itemKey = 'inv-snapshot:0:product-1';
    const sourceKey = buildCommissionDraftSourceKey({
      employeeId: 'employee-1',
      basis: 'approved_invoices',
      percentMode: 'product_default',
      invoiceId: 'inv-snapshot',
      itemKey,
      sourcePeriodStart: '2026-05-01',
      sourcePeriodEnd: '2026-05-31',
    });
    const rows = buildCommissionDraftRows({
      invoices: [{
        id: 'inv-snapshot',
        name: 'فاکتور ثبت‌شده',
        status: 'confirmed',
        invoice_date: '2026-05-10',
        total_invoice_amount: 1000000,
        assignee_id: 'profile-1',
        invoiceItems: [{ product_id: 'product-1', line_total: 1000000, commission_percentage: 3 }],
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      employeeDefaultCommissionByEmployeeId: { 'employee-1': 3 },
      basis: 'approved_invoices',
      percentMode: 'product_default',
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
      existingDrafts: [{
        source_key: sourceKey,
        employee_id: 'employee-1',
        assignee_id: 'profile-1',
        period_start: '2026-05-01',
        period_end: '2026-05-31',
        source_basis: 'approved_invoices',
        percent_mode: 'product_default',
        invoice_id: 'inv-snapshot',
        invoice_item_key: itemKey,
        entitled_amount: 90000,
        posted_amount: 0,
        remaining_amount: 90000,
        decision_status: 'auto',
        details: { commission_percent: 9 },
      }],
      includeNotCalculated: true,
    });

    expect(rows[0]?.lines[0]?.commission_percent).toBe(9);
    expect(rows[0]?.selected_amount).toBe(90000);
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

  it('splits one invoice commission across separate receipts and a later cleared cheque', () => {
    const invoice = {
      id: 'inv-three-parts',
      status: 'final',
      invoice_date: '2026-04-10',
      total_invoice_amount: 1000000,
      assignee_id: 'profile-1',
      payments: [
        { amount: 500000, status: 'settled', payment_type: 'cash', date: '2026-04-15' },
        { amount: 250000, status: 'settled', payment_type: 'cash', date: '2026-06-12' },
        { amount: 250000, status: 'received', payment_type: 'cheque', cheque_status: 'cleared', date: '2026-06-15', cheque_cleared_at: '2026-07-08' },
      ],
      invoiceItems: [{ line_total: 1000000, commission_percentage: 10 }],
    };
    const baseArgs = {
      invoices: [invoice],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      employeeDefaultCommissionByEmployeeId: { 'employee-1': 0 },
      basis: 'prepaid_and_settled_invoices' as const,
      percentMode: 'product_default' as const,
    };

    const aprilRows = buildCommissionDraftRows({
      ...baseArgs,
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
    });
    expect(aprilRows[0]?.selected_amount).toBe(50000);

    const juneRows = buildCommissionDraftRows({
      ...baseArgs,
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      postedAllocations: [{
        basis: 'prepaid_and_settled_invoices',
        percent_mode: 'product_default',
        invoice_id: 'inv-three-parts',
        invoice_item_key: 'inv-three-parts:0:item',
        posted_amount: 50000,
      }],
    });
    expect(juneRows[0]?.selected_amount).toBe(25000);

    const julyRows = buildCommissionDraftRows({
      ...baseArgs,
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
      postedAllocations: [{
        basis: 'prepaid_and_settled_invoices',
        percent_mode: 'product_default',
        invoice_id: 'inv-three-parts',
        invoice_item_key: 'inv-three-parts:0:item',
        posted_amount: 75000,
      }],
    });
    expect(julyRows[0]?.selected_amount).toBe(25000);
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
