// @vitest-environment node
import {beforeAll,beforeEach,afterEach,expect,it,vi} from 'vitest';
const fixtures=vi.hoisted(()=>({org:'10000000-0000-4000-8000-000000000001',user:'20000000-0000-4000-8000-000000000001',account:'30000000-0000-4000-8000-000000000001',healthy:true}));
vi.mock('../_shared/voip-organization-context.ts',()=>({loadVoipOrganizationContext:async()=>({org_id:fixtures.org,permissions:{voip_call_reports:{view:true}}})}));
vi.mock('../_shared/org-plan-access.ts',()=>({loadOrgPlanAccess:async()=>({available:true,features:{voip_webphone:true}})}));
vi.mock('../_shared/ai-grounding.ts',()=>({loadCentralAiGrounding:async()=>({agentStates:{customer_response:{canUse:true,config:{policy_json:{voice_account_id:fixtures.account}}}}})}));
let handler:(req:Request)=>Promise<Response>;let calls:{url:URL;init:any}[]=[];
beforeAll(async()=>{
 vi.stubGlobal('Deno',{env:{get:(name:string)=>({SUPABASE_URL:'https://isolated.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-key',KALAMAPP_VOIP_INTERNAL_SECRET:'fixture-internal'}[name])},serve:(fn:any)=>{handler=fn;}});
 await import('./index');
});
beforeEach(()=>{
 vi.stubGlobal('Deno',{env:{get:(name:string)=>({SUPABASE_URL:'https://isolated.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-key',KALAMAPP_VOIP_INTERNAL_SECRET:'fixture-internal'}[name])}});
 fixtures.healthy=true;calls=[];
 vi.stubGlobal('fetch',vi.fn(async(input:any,init:any)=>{
  const url=new URL(input);calls.push({url,init});let data:any=[];
  if(url.pathname==='/auth/v1/user')data={id:fixtures.user};
  if(url.pathname.endsWith('/voip_ai_worker_health'))data=fixtures.healthy?[{id:'asterisk-voice'}]:[];
  if(url.pathname.endsWith('/voip_external_accounts'))data=[{id:fixtures.account,metadata:{ai_dedicated:true}}];
  if(url.pathname.endsWith('/voip_ai_sessions')&&init?.method==='POST')data=[{id:'40000000-0000-4000-8000-000000000001'}];
  return Response.json(data);
 }));
});
afterEach(()=>vi.unstubAllGlobals());
const request=(body:any,headers:any={authorization:'Bearer authorized-user'})=>handler(new Request('https://isolated.invalid/functions/v1/voip-ai-session',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}));
it('does not admit unsigned users or unauthenticated platform turns',async()=>{
 expect((await request({action:'get'},{})).status).toBe(401);
 expect((await request({action:'worker_turn',sessionId:fixtures.account})).status).toBe(403);
 expect(calls).toHaveLength(0);
});
it('never reads another tenant or another operator session',async()=>{
 expect((await request({action:'get',sessionId:fixtures.account})).status).toBe(404);
 const access=calls.find(call=>call.url.pathname.endsWith('/voip_ai_sessions'))!;
 expect(access.url.searchParams.get('org_id')).toBe('eq.'+fixtures.org);
 expect(access.url.searchParams.get('requested_by')).toBe('eq.'+fixtures.user);
});
it('does not queue or dial when the platform worker is absent',async()=>{
 fixtures.healthy=false;expect((await request({action:'start',phone:'09120000000',purpose:'آزمون'})).status).toBe(503);
 expect(calls.some(call=>call.init?.method==='POST')).toBe(false);
});
it('chooses only the configured tenant AI account and stores a scoped job, never a provider call',async()=>{
 const result=await request({action:'start',phone:'۰۹۱۲۰۰۰۰۰۰۰',purpose:'آزمون',accountId:'foreign-account'});
 expect(result.status).toBe(200);const write=calls.find(call=>call.url.pathname.endsWith('/voip_ai_sessions')&&call.init?.method==='POST')!;
 const job=JSON.parse(write.init.body)[0];expect(job).toMatchObject({org_id:fixtures.org,requested_by:fixtures.user,account_id:fixtures.account});expect(job.join_code).toMatch(/^\d{16}$/);
 expect(calls.every(call=>call.url.hostname==='isolated.invalid')).toBe(true);
});
