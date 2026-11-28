// @vitest-environment node
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe,it,expect,vi } from 'vitest';
const source=readFileSync(new URL('./index.ts',import.meta.url),'utf8');
const load=(name:string,end:string,deps:Record<string,any>) => new Function(...Object.keys(deps),ts.transpileModule(source.slice(source.indexOf(`const ${name} =`),source.indexOf(`const ${end} =`))+`\nreturn ${name};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(...Object.values(deps));
describe('free conversation identity',() => {
  it('creates an unassigned thread and keeps it unassigned after completion, even with legacy lead metadata',async () => {
    const insert=vi.fn(async (_u,_k,_table,rows) => rows.map(row=>({...row,id:'thread'})));
    const deps={getEnvProviderConfig:()=>({provider:'test'}),normalizeId:(v:any)=>v||null,isUuid:()=>false,buildContextKey:()=> 'free_chat',buildThreadTitle:(v:any)=>v,getContextKind:()=> 'page',buildThreadContextLabel:()=> 'گفتگوی آزاد',normalizeSelectedAgents:(v:any)=>v,restInsert:insert};
    const create=load('ensureThread','insertAiMessage',deps);
    const thread=await create('url','key',{orgId:'org',userId:'actor'},{forceNew:true,title:'متن',agentKey:'lead_orchestrator',selectedAgents:['lead_orchestrator'],metadata:{free_chat:true}});
    expect(thread.agent_key).toBeNull();expect(thread.selected_agents).toEqual([]);
    expect(thread.metadata.agent_key).toBeNull();expect(thread.metadata.selected_agents).toEqual([]);
    const switchMode=load('ensureThread','insertAiMessage',{...deps,isUuid:()=>true,fetchThreadForRead:async()=>({id:'old-org-thread',metadata:{free_chat:false}})});
    const freeThread=await switchMode('url','key',{orgId:'org',userId:'actor'},{threadId:'old-org-thread',forceNew:true,metadata:{free_chat:true}});
    expect(freeThread.id).not.toBe('old-org-thread');expect(freeThread.metadata.free_chat).toBe(true);
    const patch=vi.fn(async(..._args:any[])=>[]);
    const aiMessageHistoryFilter = load('aiMessageHistoryFilter', 'findThreadByContextKey', {});
    const complete=load('patchChatThreadAfterAssistant','handleChat',{restPatch:patch,getContextKind:deps.getContextKind,buildThreadContextLabel:deps.buildThreadContextLabel,buildThreadModelOverrides:()=>({}),buildThreadComposerPreferences:()=>({}),aiMessageHistoryFilter});
    await complete('url','key',{orgId:'org'},{freeChatMode:true,message:'متن',pageContext:{context:{}},providerConfig:{},thread:{id:'thread',agent_key:'lead_orchestrator',message_history_revision:3,metadata:{agent_key:'lead_orchestrator'}},selectedAgents:[],body:{}},{});
    expect(patch.mock.calls[0][3]).toEqual({id:'eq.thread',org_id:'eq.org',message_history_revision:'eq.3'});
    expect(patch.mock.calls[0][4]).toMatchObject({agent_key:null,selected_agents:[],metadata:{free_chat:true,agent_key:null,selected_agents:[]}});
  });
});
