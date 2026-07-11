import { describe, expect, it } from 'vitest';
import { BlockType, FieldType } from '../types';
import {
  buildReportBaseSelectColumns,
  buildReportTableFieldKey,
  buildReportTableRelationFieldKey,
} from './reporting';
import { createWorkflowRelatedFieldKey } from './workflowTypes';

describe('buildReportBaseSelectColumns', () => {
  const moduleConfig = {
    fields: [
      { key: 'name', type: FieldType.TEXT, labels: { fa: 'نام' } },
      { key: 'customer_id', type: FieldType.RELATION, labels: { fa: 'مشتری' } },
      { key: 'total_invoice_amount', type: FieldType.PRICE, labels: { fa: 'مبلغ کل' } },
    ],
  };

  it('selects direct fields, relation source fields, and selected table JSON columns', () => {
    const columns = buildReportBaseSelectColumns(
      moduleConfig,
      [
        'name',
        'total_invoice_amount',
        createWorkflowRelatedFieldKey('customer_id', 'customers', 'business_name'),
        buildReportTableFieldKey('payments', 'amount'),
        buildReportTableRelationFieldKey('invoiceItems', 'product_id', 'products', 'name'),
      ],
      [
        { id: 'payments', type: BlockType.TABLE, titles: { fa: 'دریافت‌ها' } },
        { id: 'invoiceItems', type: BlockType.TABLE, titles: { fa: 'اقلام' } },
      ]
    );

    expect(columns).toEqual(expect.arrayContaining([
      'id',
      'org_id',
      'assignee_id',
      'name',
      'total_invoice_amount',
      'customer_id',
      'payments',
      'invoiceItems',
    ]));
  });
});
