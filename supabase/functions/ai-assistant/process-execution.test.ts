// @vitest-environment node
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { assertProcessOperationPermissions } from '../_shared/ai-process-operations';
const source = readFileSync(new URL('./index.ts',import.meta.url),'utf8');
const code = source.slice(source.indexOf('const processActorRequest ='),source.indexOf('const handleProcessOperationFromPrompt ='));
const setup = () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ id: 'task',name: 'فعالیت' }),{ status: 200 }));
  vi.stubGlobal('fetch',fetch);
  const dependencies = { assertProcessOperationPermissions,
    loadTenantAiPlanContext: async () => ({}),canViewModuleWithPlan: (_p: any,perms: any,m: string) => Boolean(perms[m]?.view),
    isSensitiveField: () => false,normalizeId: (v: any) => String(v || ''),isUuid: () => true,
    restUrl: (_u: string,table: string) => `https://test/${table}`,getServiceHeaders: () => ({ apikey: 'service-key' }),
  };
  const run = new Function(...Object.keys(dependencies),ts.transpileModule(code+'\nreturn executeAiProcessOperation;',{
    compilerOptions: { target: ts.ScriptTarget.ES2022,module: ts.ModuleKind.None },
  }).outputText)(...Object.values(dependencies));
  const auth = { orgId: 'org',userId: 'actor',callerAuthorization: 'Bearer actor-jwt',permissions: {
    projects: { view: true,edit: true },tasks: { view: true,edit: true,create: false },process_runs: { view: true,edit: true },
  } };
  return { run,fetch,auth,page: { moduleId: 'projects',recordId: 'project' },context: { tasks: [{ id: 'task',name: 'فعالیت',updated_at: '2026-01-01',process_run_stage_id: 'stage' }] } };
};
afterEach(() => vi.unstubAllGlobals());
describe('actual process execution boundary', () => {
  it('uses the actor JWT and one atomic RPC for task edits', async () => {
    const f=setup();
    const result=await f.run('https://test','service-key',f.auth,f.page,{ type: 'update_stage_task',task_id: 'task',status: 'custom_status',custom_values: { report: 'ready' } },f.context,{});
    expect(result.updated_task_id).toBe('task'); expect(f.fetch).toHaveBeenCalledTimes(1);
    const [url,init]=f.fetch.mock.calls[0] as any;
    expect(url).toContain('rpc/apply_ai_process_task_change');
    expect(init.headers.Authorization).toBe('Bearer actor-jwt');
    expect(JSON.parse(init.body)).toMatchObject({ p_patch: { status: 'custom_status' },p_custom_values: { report: 'ready' },p_expected_updated_at: '2026-01-01' });
  });
  it('rejects editing without edit permission before any database write',async () => {
    const f=setup(); f.auth.permissions.tasks.edit=false;
    await expect(f.run('https://test','service-key',f.auth,f.page,{ type: 'update_stage_task',task_id: 'task' },f.context,{})).rejects.toThrow();
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it('does not fall back to service role when actor authentication is missing',async () => {
    const f=setup(); f.auth.callerAuthorization='';
    await expect(f.run('https://test','service-key',f.auth,f.page,{ type: 'cancel_stage_task',task_id: 'task' },f.context,{})).rejects.toThrow();
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it('has no direct mutation path in the proposal handler, including autoExecute flags',() => {
    const handler=source.slice(source.indexOf('const handleProcessOperationFromPrompt ='),source.indexOf('const handleTranscribeVoice ='));
    expect(handler).not.toContain('executeAiProcessOperation(');
    expect(handler).not.toContain('body?.autoExecute');
    expect(handler).toContain("status: 'proposed'");
  });
});
