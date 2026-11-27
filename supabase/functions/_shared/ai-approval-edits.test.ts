// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { validateProcessApprovalEdits } from './ai-process-approval';
import { APPROVAL_ROW, finalizeApprovedInvoiceRow, mergeInvoiceApprovalRows, prepareInvoiceApprovalRows } from './ai-approval-table';

const calendar = { type: 'schedule_calendar_content', draft_id: 'stored-id', name: 'پست',
  content_type: 'post', start_date: '2026-11-28T09:00', due_date: '2026-11-28T17:00' };
const can = () => true;

describe('process card edits', () => {
  it('keeps the original destination and validates edited dates and content types', () => {
    expect(validateProcessApprovalEdits(calendar, { content_type: 'story' }, can))
      .toMatchObject({ draft_id: 'stored-id', content_type: 'story' });
    expect(() => validateProcessApprovalEdits(calendar, { draft_id: 'new-id' }, can)).toThrow();
    expect(() => validateProcessApprovalEdits(calendar, { due_date: '2026-11-27T08:00' }, can)).toThrow();
    expect(() => validateProcessApprovalEdits(calendar, { content_type: 'story' }, () => false)).toThrow();
    expect(() => validateProcessApprovalEdits(calendar, { template_id: '11111111-1111-1111-1111-111111111111' }, can)).toThrow();
  });

  it('edits only existing stage fields and retains stored automation', () => {
    const operation = { type: 'create_raw_process_with_tasks', stages: [{ name: 'متن', automation_rules: ['stored'] }] };
    expect(validateProcessApprovalEdits(operation, { 'stages.0.name': 'بازبینی' }, can).stages)
      .toEqual([{ name: 'بازبینی', automation_rules: ['stored'] }]);
    expect(() => validateProcessApprovalEdits(operation, { 'stages.1.name': 'مرحلهٔ تازه' }, can)).toThrow();
  });
});

describe('invoice rows in approval cards', () => {
  const stored = [{ quantity: 1, row_key: 'item-a', internal: 'retained' }, { quantity: 2, row_key: 'item-b' }];
  it('overlays a single proposed change without losing other rows or their identities', () => {
    const { rows } = prepareInvoiceApprovalRows(stored, [{ _existing_row_number: 2, quantity: 4 }], row => ({ quantity: row.quantity }));
    expect(mergeInvoiceApprovalRows(stored, rows, true))
      .toEqual([stored[0], { ...stored[1], quantity: 4 }]);
  });
  it('supports intentional removal and rejects duplicate row references', () => {
    expect(mergeInvoiceApprovalRows(stored, [], true)).toEqual([]);
    expect(() => mergeInvoiceApprovalRows(stored, [], false)).toThrow();
    expect(() => mergeInvoiceApprovalRows(stored, [{ [APPROVAL_ROW]: 1 }, { [APPROVAL_ROW]: 1 }], true)).toThrow();
  });
  it('recalculates an edited item using the invoice form rules before database totals are calculated', () => {
    const original = { row_key: 'existing', quantity: 1, unit_price: 200, discount: 10, discount_type: 'percent', vat: 10, vat_type: 'percent', total_price: 198 };
    const rows = mergeInvoiceApprovalRows([original], [{ [APPROVAL_ROW]: 1, quantity: 3 }], true, undefined,
      (row, prior) => finalizeApprovedInvoiceRow('invoiceItems', row, prior));
    expect(rows).toEqual([{ ...original, quantity: 3, total_price: 594 }]);
  });
});
