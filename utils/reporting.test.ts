import { describe, expect, it } from 'vitest';
import { BlockType, FieldType } from '../types';
import {
  buildReportBaseSelectColumns,
  buildReportTableFieldKey,
  buildReportTableRelationFieldKey,
  getMainReportableFields,
  isDeletedReportRecord,
} from './reporting';
import { createWorkflowRelatedFieldKey } from './workflowTypes';

describe('buildReportBaseSelectColumns', () => {
  const moduleConfig = {
    id: 'invoices',
    table: 'invoices',
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
    expect(columns).not.toEqual(expect.arrayContaining(['is_deleted', 'deleted', '_deleted', 'deleted_at']));
  });

  it('does not request unsupported assignee or soft-delete columns', () => {
    const columns = buildReportBaseSelectColumns(
      {
        id: 'reports',
        table: 'reports',
        fields: [{ key: 'name', type: FieldType.TEXT, labels: { fa: 'نام' } }],
      },
      ['name'],
      [],
    );

    expect(columns).toEqual(['id', 'org_id', 'created_at', 'updated_at', 'name']);
  });

  it('always selects a declared soft-delete marker so deleted rows can be excluded', () => {
    const columns = buildReportBaseSelectColumns(
      {
        id: 'custom_soft_delete_module',
        table: 'custom_soft_delete_records',
        fields: [
          { key: 'name', type: FieldType.TEXT, labels: { fa: 'نام' } },
          { key: 'is_deleted', type: FieldType.CHECKBOX, labels: { fa: 'حذف شده' } },
        ],
      },
      ['name'],
      [],
    );

    expect(columns).toEqual(expect.arrayContaining(['name', 'is_deleted']));
  });
});

describe('isDeletedReportRecord', () => {
  it.each([
    { is_deleted: true },
    { deleted: true },
    { _deleted: true },
    { deleted_at: '2026-07-14T00:00:00Z' },
  ])('excludes deleted report records for every supported marker', (row) => {
    expect(isDeletedReportRecord(row)).toBe(true);
  });

  it('keeps active records in report calculations', () => {
    expect(isDeletedReportRecord({ is_deleted: false, deleted_at: null })).toBe(false);
  });
});

describe('getMainReportableFields', () => {
  it('keeps the resolved assignee field only once for task reports', () => {
    const fields = getMainReportableFields('tasks');
    expect(fields.map((field) => field.key)).toContain('__workflow_assignee');
    expect(fields.map((field) => field.key)).not.toContain('assignee_id');
  });
});
