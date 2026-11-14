import { describe, expect, it, vi } from 'vitest';
import { compileAgentDataQuery, readAgentDataPage, countAgentData, aggregateAgentData, type AgentDataAccess } from './ai-agent-data';
const orgId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const access = (scope: 'all' | 'own' | 'team' | 'subtree' = 'all'): AgentDataAccess => ({ orgId, userId,
  roleId: '00000000-0000-4000-8000-000000000003', allowedUserIds: [], allowedRoleIds: [],
  modules: [{ id: 'marketing_leads', table: 'marketing_leads', label: 'سرنخ‌ها', recordScope: scope,
    fields: [{ key: 'name', label: 'نام', type: 'text' }, { key: 'status', label: 'وضعیت', type: 'select' }] }] });

describe('central agent data gateway', () => {
  it('counts beyond every page while preserving organization and owner filters', async () => {
    const count = vi.fn(async (_table, params) => { expect(params.org_id).toBe(`eq.${orgId}`); expect(params.and).toContain(userId); return 45001; });
    expect(await countAgentData(access('own'), { moduleId: 'marketing_leads' }, count)).toMatchObject({ count: 45001, coverage: 'complete' });
  });
  it('aggregates decimal values exactly and casts at the database before JSON parsing', async () => {
    const scope = access(); scope.modules[0].fields.push({ key: 'amount', label: 'مبلغ', type: 'number' });
    const read = vi.fn(async (_table, params) => { expect(params.select).toBe('id,amount::text'); return [
      { id: userId, amount: '9007199254740993.1' }, { id: orgId, amount: '0.2' }, { id: scope.roleId, amount: null },
    ]; });
    const result = await aggregateAgentData(scope, { moduleId: 'marketing_leads', field: 'amount' }, read);
    expect(result).toMatchObject({ count: 3, nonNullCount: 2, sum: '9007199254740993.3', min: '0.2', coverage: 'complete' });
  });
  it('marks an exhausted aggregation budget as partial with a continuation', async () => {
    const scope = access(); scope.modules[0].fields.push({ key: 'amount', label: 'مبلغ', type: 'number' });
    const rows = Array.from({ length: 201 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i + 10).padStart(12,'0')}`, amount: '0.01' }));
    const result = await aggregateAgentData(scope, { moduleId: 'marketing_leads', field: 'amount' }, async () => rows, { maxPages: 1 });
    expect(result).toMatchObject({ sum: '2.00', count: 200, hasMore: true, coverage: 'partial', nextAfterId: rows[199].id });
  });
  it('always filters by organization, uses explicit columns and exposes pagination', async () => {
    const read = vi.fn(async () => Array.from({ length: 16 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index + 10).padStart(12,'0')}`, name: `نام ${index}`, secret: 'private' })));
    const result = await readAgentDataPage(access(), { moduleId: 'marketing_leads', pageSize: 15 }, read);
    expect(result.records).toHaveLength(15); expect(result.hasMore).toBe(true);
    expect(read.mock.calls[0][1].org_id).toBe(`eq.${orgId}`);
    expect(read.mock.calls[0][1].select).toBe('id,name,status');
    expect(JSON.stringify(result)).not.toContain('private');
    const continued = compileAgentDataQuery(access(), { moduleId: 'marketing_leads', afterId: result.nextAfterId });
    expect(continued.params.and).toContain(result.nextAfterId);
  });
  it('does not impose the old ten-record business limit', async () => {
    const result = await readAgentDataPage(access(), { moduleId: 'marketing_leads' }, async () => Array.from({ length: 75 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index+10).padStart(12,'0')}`, name: 'سرنخ' })));
    expect(result.records).toHaveLength(75); expect(result.hasMore).toBe(false); expect(result.coverage).toBe('complete');
  });
  it('bounds response bytes without losing the cursor for omitted records', async () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index+10).padStart(12,'0')}`, name: 'ن'.repeat(2000) }));
    const result = await readAgentDataPage(access(), { moduleId: 'marketing_leads' }, async () => rows);
    expect(JSON.stringify(result).length).toBeLessThan(64000);
    expect(result.hasMore).toBe(true);
    expect(result.nextAfterId).toBe(result.records.at(-1)?.reference);
    expect(result.records[0].truncatedFields).toContain('name');
  });
  it.each(['own','team','subtree'] as const)('applies %s record scope before querying', scope => {
    const result = compileAgentDataQuery(access(scope), { moduleId: 'marketing_leads' });
    expect(result.params.and).toContain('assignee_type.eq.');
    expect(String(result.params.and)).toContain(scope === 'team' ? access().roleId : userId);
  });
  it('fails closed without an organization, module or permitted field', () => {
    expect(() => compileAgentDataQuery({ ...access(), orgId: '' }, { moduleId: 'marketing_leads' })).toThrow();
    expect(() => compileAgentDataQuery(access(), { moduleId: 'integration_settings' })).toThrow();
    expect(() => compileAgentDataQuery(access(), { moduleId: 'marketing_leads', fields: ['password'] })).toThrow();
    expect(() => compileAgentDataQuery(access(), { moduleId: 'marketing_leads', filters: [{ field: 'secret', operator: 'eq', value: 'x' }] })).toThrow();
  });
  it('quotes filter values rather than allowing them to inject query conditions', () => {
    const query = compileAgentDataQuery(access(), { moduleId: 'marketing_leads', filters: [{ field: 'name', operator: 'eq', value: 'x",org_id.neq.other' }] });
    expect(query.params.org_id).toBe(`eq.${orgId}`);
    expect(query.params.and).toBe('(name.eq."x\\",org_id.neq.other")');
  });
});
