// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createProcessDataRuntime, PROCESS_DATA_GUIDANCE } from './ai-process-data';
import type { AgentDataAccess } from './ai-agent-data';

const org = '10000000-0000-4000-8000-000000000001';
const user = '20000000-0000-4000-8000-000000000001';
const parent = '30000000-0000-4000-8000-000000000001';
const id = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const module = (key: string, fields: string[]) => ({ id: key,table: key,label: key,recordScope: 'all' as const,fields: fields.map(key => ({ key,label: key,type: 'text' })) });
const access: AgentDataAccess = { orgId: org,userId: user,roleId: null,allowedUserIds: [],allowedRoleIds: [],modules: [
  module('process_templates',['name']),module('process_runs',['process_name']),module('projects',['name','execution_process_draft']),
  module('tasks',['name','status','recurrence_info','process_run_id','source_module_id','source_record_id','assignee_id','start_date','completed_at']),
  module('workflows',['name','scope_type','process_template_id','actions','conditions_all']),
] };
const setup = (read: any, fieldAllowed = (_m: string,_f: string) => true, scope = access) => createProcessDataRuntime({ access: scope,read,fieldAllowed });

describe('central process reader', () => {
  it('loads no records at initialization, deduplicates within a request and paginates beyond old limits', async () => {
    const stages = Array.from({ length: 73 },(_,i) => ({ id: id(i+1),stage_name: `مرحله ${i+1}`,metadata: { marker: i } }));
    const read = vi.fn(async (table,params) => table === 'process_templates' ? [{ id: parent,name: 'الگو' }]
      : stages.filter(row => !params.id || row.id > params.id.slice(3)).slice(0,params.limit));
    const runtime = setup(read);
    expect(read).not.toHaveBeenCalled();
    const request = { moduleId: 'process_templates',recordId: parent,section: 'stages',pageSize: 20 };
    const first = await runtime.execute(request);
    await runtime.execute(request);
    expect(read).toHaveBeenCalledTimes(2);
    const records = [...first.records]; let cursor = first.nextAfterId;
    while (cursor) { const next = await runtime.execute({ ...request,afterId: cursor }); records.push(...next.records); cursor = next.nextAfterId; }
    expect(records).toHaveLength(73);
    expect(records[72].stage_name).toBe('مرحله 73');
  });

  it('compiles organization and record scope before reading children', async () => {
    const read = vi.fn(async () => []);
    const own: AgentDataAccess = { ...access,modules: access.modules.map(m => m.id === 'process_templates' ? { ...m,recordScope: 'own' } : m) };
    await expect(setup(read,undefined,own).execute({ moduleId: 'process_templates',recordId: parent,section: 'stages' })).rejects.toThrow();
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0][1].org_id).toBe(`eq.${org}`);
    expect(read.mock.calls[0][1].and).toContain(`assignee_id.eq.${user}`);
  });

  it('rejects unavailable modules before transport and blocks metadata permissions', async () => {
    const read = vi.fn(async () => [{ id: parent,name: 'الگو' }]);
    await expect(setup(read).execute({ moduleId: 'private',recordId: parent,section: 'record' })).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
    await expect(setup(read,(_m,f) => f !== 'metadata').execute({ moduleId: 'process_templates',recordId: parent,section: 'field',childId: id(1),field: 'metadata' })).rejects.toThrow();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('reads task snapshot fields with nested field permissions and removes credentials', async () => {
    const read = vi.fn(async () => [{ id: parent,recurrence_info: { process_task_custom_field_values: { public_value: 'مجاز',hidden_value: 'محرمانه' },api_key: 'secret' } }]);
    const result = await setup(read,(_m,f) => f !== 'hidden_value').execute({ moduleId: 'tasks',recordId: parent,section: 'field',field: 'recurrence_info' });
    expect(result.value).toEqual({ process_task_custom_field_values: { public_value: 'مجاز' } });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('does not swallow database failures or cache them as no records', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue([{ id: parent,name: 'الگو' }]);
    const runtime = setup(read), query = { moduleId: 'process_templates',recordId: parent,section: 'record' };
    await expect(runtime.execute(query)).rejects.toThrow('network');
    expect((await runtime.execute(query)).records[0].name).toBe('الگو');
  });

  it('paginates standalone drafts and large JSON fields without silent clipping', async () => {
    const read = vi.fn(async () => [{ id: parent,name: 'پروژه',execution_process_draft: Array.from({ length: 45 },(_,i) => ({ name: `پیش‌نویس ${i}` })) }]);
    const runtime = setup(read);
    const first = await runtime.execute({ moduleId: 'projects',recordId: parent,section: 'drafts',pageSize: 20 });
    expect(first.value).toHaveLength(20); expect(first.nextOffset).toBe(20);
    const last = await runtime.execute({ moduleId: 'projects',recordId: parent,section: 'drafts',pageSize: 20,offset: 40 });
    expect(last.value).toHaveLength(5); expect(last.hasMore).toBe(false); expect(last.coverage).toBe('page');
  });

  it('uses workflow permission and template-scoped conditions for activators', async () => {
    const read = vi.fn(async (table) => table === 'process_templates' ? [{ id: parent,name: 'الگو' }] : [{ id: id(1),name: 'فعال‌کننده' }]);
    await setup(read).execute({ moduleId: 'process_templates',recordId: parent,section: 'activators' });
    expect(read.mock.calls[1][0]).toBe('workflows');
    expect(read.mock.calls[1][1].and).toContain(`process_template_id.eq."${parent}"`);
    expect(read.mock.calls[1][1].org_id).toBe(`eq.${org}`);
  });

  it('budgets a single tool result and keeps full server-side stage hydration', async () => {
    const read = vi.fn(async (table) => table === 'process_templates' ? [{ id: parent,name: 'الگو' }]
      : [{ id: id(1),metadata: { description: 'x'.repeat(18000) } }]);
    const runtime = setup(read);
    const result = await runtime.execute({ moduleId: 'process_templates',recordId: parent,section: 'stages',fields: ['metadata'] });
    expect(result.records[0].detailRequired).toBe(true);
    expect(JSON.stringify(result).length).toBeLessThan(1000);
    expect((await runtime.allStages('process_templates',parent))[0].metadata.description.length).toBe(18000);
    expect(PROCESS_DATA_GUIDANCE.length).toBeLessThan(2400);
  });
});
