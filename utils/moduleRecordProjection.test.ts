import { describe, expect, it } from 'vitest';
import { FieldType, ModuleNature } from '../types';
import { buildModuleRecordProjection, preserveDeferredProcessDraftColumns } from './moduleRecordProjection';

describe('module record projection', () => {
  it('keeps normal record fields in the first show response and defers only process drafts', () => {
    const projection = buildModuleRecordProjection({
      id: 'projects',
      table: 'projects',
      fields: [
        { key: 'name', type: FieldType.TEXT },
        { key: 'customer_id', type: FieldType.RELATION },
        { key: 'execution_process_draft', type: FieldType.JSON },
      ],
    } as any);

    expect(projection.initialColumns).toEqual(expect.arrayContaining(['id', 'name', 'customer_id']));
    expect(projection.initialColumns).not.toContain('execution_process_draft');
    expect(projection.deferredProcessDraftColumns).toEqual(['execution_process_draft']);
  });

  it('does not require a status column unless the module defines one', () => {
    const projection = buildModuleRecordProjection({
      id: 'customers',
      table: 'customers',
      fields: [
        { key: 'full_name', type: FieldType.TEXT },
        { key: 'rank', type: FieldType.STATUS },
      ],
    } as any);

    expect(projection.initialColumns).toEqual(expect.arrayContaining(['id', 'full_name', 'rank']));
    expect(projection.initialColumns).not.toContain('status');
  });

  it('requests assignee columns for SaaS system views', () => {
    const projection = buildModuleRecordProjection({
      id: 'saas_orgs',
      table: 'saas_admin_org_candidates_view',
      fields: [{ key: 'org_name', type: FieldType.TEXT }],
    } as any);

    expect(projection.initialColumns).toEqual(expect.arrayContaining(['id', 'org_name']));
    expect(projection.initialColumns).toEqual(expect.arrayContaining([
      'assignee_type',
      'assignee_id',
      'assignee_role_id',
    ]));
  });

  it('keeps assignee columns for modules that support assignment', () => {
    const projection = buildModuleRecordProjection({
      id: 'projects',
      table: 'projects',
      fields: [{ key: 'name', type: FieldType.TEXT }],
    } as any);

    expect(projection.initialColumns).toEqual(expect.arrayContaining([
      'assignee_type',
      'assignee_id',
      'assignee_role_id',
    ]));
  });

  it('does not request legacy record assignee columns for V2 process templates', () => {
    const projection = buildModuleRecordProjection({
      id: 'process_templates',
      table: 'process_templates',
      fields: [{ key: 'name', type: FieldType.TEXT }],
    } as any);

    expect(projection.initialColumns).toEqual(expect.arrayContaining(['id', 'name']));
    expect(projection.initialColumns).not.toEqual(expect.arrayContaining([
      'assignee_type',
      'assignee_id',
      'assignee_role_id',
    ]));
    expect(projection.initialColumns).not.toContain('system_code');
  });

  it('keeps assignee columns for SaaS-managed CMS records', () => {
    const projection = buildModuleRecordProjection({
      id: 'cms_pages',
      table: 'cms_pages',
      fields: [{ key: 'title', type: FieldType.TEXT }],
    } as any);

    expect(projection.initialColumns).toEqual(expect.arrayContaining([
      'assignee_type',
      'assignee_id',
      'assignee_role_id',
    ]));
  });

  it('does not request virtual bot settings from the employee table', () => {
    const projection = buildModuleRecordProjection({
      id: 'employees',
      table: 'employees',
      fields: [
        { key: 'full_name', type: FieldType.TEXT },
        { key: 'telegram_chat_id', type: FieldType.TEXT, botSettingsOnly: true },
        { key: 'bot_default_channel', type: FieldType.SELECT, virtualBotField: true },
      ],
    } as any);

    expect(projection.initialColumns).toEqual(expect.arrayContaining(['id', 'full_name', 'telegram_chat_id']));
    expect(projection.initialColumns).not.toContain('bot_default_channel');
  });

  it('does not request virtual bot group titles when persisted field metadata is stale', () => {
    const projection = buildModuleRecordProjection({
      id: 'customers',
      table: 'customers',
      fields: [
        { key: 'full_name', type: FieldType.TEXT },
        { key: 'telegram_group_title', type: FieldType.TEXT },
        { key: 'bale_group_title', type: FieldType.TEXT },
        { key: 'rubika_group_title', type: FieldType.TEXT },
      ],
    } as any);

    expect(projection.initialColumns).toEqual(expect.arrayContaining(['id', 'full_name']));
    expect(projection.initialColumns).not.toEqual(expect.arrayContaining([
      'telegram_group_title',
      'bale_group_title',
      'rubika_group_title',
    ]));
  });

  it('always reads a complete financial document so invoice lines cannot be omitted', () => {
    const projection = buildModuleRecordProjection({
      id: 'invoices',
      table: 'invoices',
      nature: ModuleNature.INVOICE,
      fields: [
        { key: 'invoiceItems', type: FieldType.JSON },
        { key: 'total_invoice_amount', type: FieldType.PRICE },
      ],
    } as any);

    expect(projection).toEqual({ initialColumns: ['*'], deferredProcessDraftColumns: [] });
  });

  it('includes stored table blocks even when they have no matching field definition', () => {
    const projection = buildModuleRecordProjection({
      id: 'price_lists',
      table: 'price_lists',
      fields: [{ key: 'name', type: FieldType.TEXT }],
      blocks: [
        { id: 'items', type: 'table' },
        { id: 'warehouse_shelves', type: 'table', externalDataConfig: { targetModule: 'shelves' } },
      ],
    } as any);

    expect(projection.initialColumns).toContain('items');
    expect(projection.initialColumns).not.toContain('warehouse_shelves');
  });

  it('does not select presentation-only table blocks as record columns', () => {
    const projection = buildModuleRecordProjection({
      id: 'tasks',
      table: 'tasks',
      fields: [{ key: 'name', type: FieldType.TEXT }],
      blocks: [
        { id: 'task_shelf_stock_movements', type: 'table', storedInRecord: false },
      ],
    } as any);

    expect(projection.initialColumns).not.toContain('task_shelf_stock_movements');
  });

  it('keeps a loaded process draft while a newer lightweight record response is pending its deferred fields', () => {
    const draft = [{ id: 'draft-1', process_group_id: 'group-1' }];
    expect(preserveDeferredProcessDraftColumns(
      { id: 'record-1', name: 'متقاضی' },
      { id: 'record-1', name: 'متقاضی', execution_process_draft: draft },
      ['execution_process_draft'],
    )).toEqual({ id: 'record-1', name: 'متقاضی', execution_process_draft: draft });
  });

  it('does not preserve a deferred process draft when the response explicitly includes its current value', () => {
    expect(preserveDeferredProcessDraftColumns(
      { id: 'record-1', execution_process_draft: [] },
      { id: 'record-1', execution_process_draft: [{ id: 'draft-1' }] },
      ['execution_process_draft'],
    )).toEqual({ id: 'record-1', execution_process_draft: [] });
  });
});
