// @vitest-environment node
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { canAddAiDynamicOption, getAiRecordRequiredQuestions, prepareAiRecordOptions } from '../_shared/ai-record-contract';
import { linkAiRecordFiles } from '../_shared/ai-record-files';
import { finalizeApprovedInvoiceRow, isInvoiceApprovalTable, mergeInvoiceApprovalRows } from '../_shared/ai-approval-table';

// Execute the actual handler with an in-memory REST boundary; never contact a
// tenant or AI provider. Extracting the declaration avoids starting Deno.serve.
const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const declaration = source.slice(source.indexOf('const executeProposedActionLog ='), source.indexOf('const handleConfirmAction ='));
const executable = ts.transpileModule(`${declaration}\nreturn executeProposedActionLog;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const schema = { moduleId: 'marketing_leads', moduleLabel: 'لید', fields: [{ key: 'name', type: 'text', label: 'عنوان', required: true }, { key: 'source', type: 'select', label: 'منبع', dynamicOptionsCategory: 'lead_source', options: [] }], tables: [] };
const orgId = '11111111-1111-4111-8111-111111111111';

const harness = (mode: 'create' | 'update' = 'create', permission: any = { view: true, edit: true, create: true }) => {
  let status = 'proposed';
  const writes: any[] = [];
  const currentRows = [{ id: 'record-a', org_id: orgId, name: 'قبلی' }, { id: 'record-b', org_id: orgId, name: 'دوم' }];
  const action = { id: 'action-a', action_type: `${mode}_record_from_prompt`, proposed_payload: {
    target_module_id: 'marketing_leads', record_creation_schema: schema,
    records: [{ record_id: mode === 'update' ? 'record-a' : null, fields: { name: 'مهدخت', source: 'دایرکت' } }, { record_id: mode === 'update' ? 'record-b' : null, fields: { name: 'دوم' } }],
    option_proposals: [{ category: 'lead_source', label: 'دایرکت', value: 'دایرکت' }],
  } };
  const dependencies: Record<string, any> = {
    normalizeId: (value: any) => String(value || ''), getCentralProviderConfig: () => ({ provider: 'test' }), isUuid: () => true,
    isRegisteredAiModule: () => true, getModulePermission: () => permission, canCreateModule: () => (permission.create ?? permission.edit) !== false && permission.view !== false,
    loadAiMutationSchema: async () => structuredClone(schema), resolveProviderConfig: async () => ({ orgAiSettings: {} }), assertAiCapabilityEnabled: async () => {},
    loadTenantAiPlanContext: async () => ({}), loadCentralAiGrounding: async () => ({}), normalizeSelectedAgents: () => [], resolveRunnableAgentsForActor: () => ({ blockedAgents: [] }),
    getModuleTable: () => 'marketing_leads', getRecordScope: () => 'all', canAccessAssignedRecord: (row: any, auth: any) => row.org_id === auth.orgId,
    canAddAiDynamicOption, getAiRecordRequiredQuestions, prepareAiRecordOptions, linkAiRecordFiles,
    isInvoiceApprovalTable, mergeInvoiceApprovalRows, finalizeApprovedInvoiceRow,
    sanitizeAiRecordPayload: (record: any, currentSchema: any) => Object.fromEntries(Object.entries(record.fields || {}).filter(([key]) => currentSchema.fields.some((field: any) => field.key === key))),
    sanitizeAiRecordTables: () => ({}), resolveAiMutationRelations: async (_url: any, _key: any, _org: any, drafts: any) => drafts,
    buildAiRecordTitle: (record: any) => record.name,
    restSelect: vi.fn(async (_url: any, _key: any, table: string, params: any) => {
      expect(params.org_id).toBe(`eq.${orgId}`);
      if (table === 'marketing_leads') return currentRows;
      return [];
    }),
    restPatch: vi.fn(async (_url: any, _key: any, table: string, params: any, payload: any) => {
      if (table === 'ai_action_logs' && params.status) {
        expect(params.org_id).toBe(`eq.${orgId}`);
        if (status !== 'proposed') return [];
        status = payload.status; return [{ id: action.id }];
      }
      if (table === 'marketing_leads') {
        expect(params.org_id).toBe(`eq.${orgId}`);
        writes.push({ table, payload }); return [{ id: params.id.slice(3), ...payload }];
      }
      status = payload.status; return [{ id: action.id }];
    }),
    restInsert: vi.fn(async (_url: any, _key: any, table: string, rows: any[]) => {
      rows.forEach((payload) => { expect(payload.org_id).toBe(orgId); writes.push({ table, payload }); });
      return rows.map((row, index) => ({ id: `created-${index}`, ...row }));
    }),
    restUpsert: vi.fn(async (_url: any, _key: any, table: string, rows: any[]) => { writes.push(...rows.map((payload) => ({ table, payload }))); return rows; }),
  };
  const run = new Function(...Object.keys(dependencies), executable)(...Object.values(dependencies));
  return { action, writes, dependencies, run: (body: any = {}) => run('https://test.invalid', 'fake-test-key', { orgId, userId: 'user-a', permissions: {} }, action, body) };
};

describe('actual record approval execution', () => {
  it.each(['create', 'update'] as const)('executes selected %s drafts and approved options once, with tenant scope', async (mode) => {
    const fixture = harness(mode);
    const result = await fixture.run({ proposedRecords: [fixture.action.proposed_payload.records[0]] });
    expect(result.payload.executed).toBe(true);
    expect(fixture.writes.filter((write) => write.table === 'marketing_leads')).toHaveLength(1);
    expect(fixture.writes.filter((write) => write.table === 'dynamic_options')).toEqual([{ table: 'dynamic_options', payload: { org_id: orgId, category: 'lead_source', label: 'دایرکت', value: 'دایرکت', is_active: true } }]);
    await expect(fixture.run()).rejects.toThrow('قبلاً');
    expect(fixture.writes.filter((write) => write.table === 'marketing_leads')).toHaveLength(1);
  });
  it('rejects empty selections instead of falling back to all stored drafts', async () => {
    const fixture = harness();
    expect((await fixture.run({ proposedRecords: [] })).status).toBe(400);
    expect(fixture.writes).toEqual([]);
  });
  it('allows creation without editing and rechecks field actions before service writes', async () => {
    const creator = harness('create', { view: true, create: true, edit: false });
    creator.action.proposed_payload.option_proposals = [];
    creator.action.proposed_payload.records = [{ record_id: null, fields: { name: 'ثبت جدید' } }];
    expect((await creator.run()).payload.executed).toBe(true);
    const denied = harness('update', { view: true, edit: true, field_actions: { name: { edit: false } } });
    expect((await denied.run()).status).toBe(403);
    expect(denied.writes).toEqual([]);
    const clearing = harness('update', { view: true, edit: true, field_actions: { name: { delete: false } } });
    expect((await clearing.run({ proposedRecords: [{ record_id: 'record-a', fields: { name: null } }] })).status).toBeGreaterThanOrEqual(400);
    expect(clearing.writes).toEqual([]);
  });
  it('rechecks module rights and blocks option changes that were never shown for approval', async () => {
    const denied = harness('create', { view: true, edit: false, create: false });
    expect((await denied.run()).status).toBe(403);
    expect(denied.writes).toEqual([]);
    const changed = harness();
    expect((await changed.run({ proposedRecords: [{ fields: { name: 'نام', source: 'گزینهٔ تأییدنشده' } }] })).status).toBe(409);
    expect(changed.writes).toEqual([]);
  });
});
