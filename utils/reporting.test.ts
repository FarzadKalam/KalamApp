import { describe, expect, it } from 'vitest';
import { BlockType, FieldType } from '../types';
import {
  buildReportBaseSelectColumns,
  buildReportTableFieldKey,
  buildReportTableRelationFieldKey,
  getMainReportableFields,
  isDeletedReportRecord,
  normalizeReportConfig,
} from './reporting';
import { createWorkflowRelatedFieldKey } from './workflowTypes';
import { buildReportTaskProcessFieldKey } from './reportTaskProcessFields';
import { createProcessLinkedFieldKey } from './processTargets';

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

  it('selects task runtime metadata for custom statuses and process fields', () => {
    const fields = buildReportBaseSelectColumns({
      id: 'tasks',
      table: 'tasks',
      fields: [{ key: 'status', type: FieldType.STATUS, labels: { fa: 'وضعیت' } }],
    }, [
      'status',
      buildReportTaskProcessFieldKey('template-a', 'finance_review', 'approved_amount'),
    ], []);

    expect(fields).toEqual(expect.arrayContaining([
      'status',
      'recurrence_info',
      'source_template_id',
      'process_node_key',
    ]));
  });

  it('selects process runtime metadata for fields of process-linked records', () => {
    const fields = buildReportBaseSelectColumns({
      id: 'tasks',
      table: 'tasks',
      fields: [{ key: 'name', type: FieldType.TEXT, labels: { fa: 'عنوان' } }],
    }, [createProcessLinkedFieldKey('invoices', 'total_received_amount')], []);

    expect(fields).toEqual(expect.arrayContaining(['recurrence_info', 'process_run_id']));
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

describe('normalizeReportConfig', () => {
  it('keeps composite sources, explicit viewers, and quarterly date grouping', () => {
    const config = normalizeReportConfig({
      calculation_mode: 'difference',
      show_in_members_dashboard: true,
      viewer_user_ids: ['user-a', '', 'user-a'],
      viewer_role_ids: ['role-a'],
      reference_report_ids: ['report-a', 'report-b', 'report-a'],
      increase_metrics: [{ report_id: 'report-a', metric_key: '__count' }],
      decrease_metrics: [{ report_id: 'report-b', metric_key: 'amount' }],
      group_bys: [{
        field: '__report_date__',
        direction: 'asc',
        date_granularity: 'quarterly',
        source_fields: { 'report-a': 'created_at', 'report-b': 'issued_at' },
      }],
    });

    expect(config.calculation_mode).toBe('difference');
    expect(config.show_in_members_dashboard).toBe(true);
    expect(config.viewer_user_ids).toEqual(['user-a']);
    expect(config.reference_report_ids).toEqual(['report-a', 'report-b']);
    expect(config.group_bys[0]).toMatchObject({
      date_granularity: 'quarterly',
      source_fields: { 'report-a': 'created_at', 'report-b': 'issued_at' },
    });
  });

  it('converts the removed legacy difference metric to a safe normal report', () => {
    const config = normalizeReportConfig({
      metric_type: 'difference',
      metric_fields: ['income'],
      metric_subtract_fields: ['expense'],
    });

    expect(config.calculation_mode).toBe('normal');
    expect(config.metric_type).toBe('count');
  });
});
