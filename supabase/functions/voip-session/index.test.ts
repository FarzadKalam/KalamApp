// @vitest-environment node
import {beforeAll,beforeEach,afterEach,it,expect,vi} from 'vitest';
const plan=vi.hoisted(()=>({available:true,features:{voip_webphone:true}}));
vi.mock('../_shared/org-plan-access.ts',()=>({loadOrgPlanAccess:async()=>plan}));
let handler:(request:Request)=>Promise<Response>;
let usage='reports',source='external',member=true,contextOrg='org-b';
let account:any;
let calls:{url:URL;init:any}[]=[];
beforeAll(async()=>{
 vi.stubGlobal('Deno',{env:{get:(name:string)=>name==='SUPABASE_URL'?'https://isolated.invalid':'test-key'},serve:(fn:any)=>{handler=fn;}});
 await import('./index');
});
beforeEach(()=>{
 vi.stubGlobal('Deno',{env:{get:(name:string)=>name==='SUPABASE_URL'?'https://isolated.invalid':'test-key'}});
 usage='reports';source='external';member=true;plan.features.voip_webphone=true;calls=[];
 account={id:'external-a',assignee_profile_id:'user-a',extension:'101',sip_secret:'fixture-secret',metadata:{wss_url:'wss://edge.example.test/socket',sip_domain:'pbx.example.test'}};
 vi.stubGlobal('fetch',vi.fn(async(input:any,init:any)=>{
  const url=new URL(input);calls.push({url,init});
  let data:any=[];
  if(url.pathname==='/auth/v1/user')data={id:'user-a'};
  else if(url.pathname.endsWith('/rpc/get_current_organization_context'))data=member?{org_id:contextOrg,settings:{voip_enabled:true},permissions:{profiles:{edit:true}}}:null;
  else if(url.pathname.endsWith('/profiles'))data=[{id:'user-a',org_id:'org-a',full_name:'کاربر',voip_enabled:true}];
  else if(url.pathname.endsWith('/integration_settings'))data=[{id:'setting',is_active:true,provider:'telefonchy',settings:{usage_mode:usage,browser_source:source}}];
  else if(url.pathname.endsWith('/voip_external_accounts'))data=account?[account]:[];
  else if(url.pathname.endsWith('/user_organization_memberships'))data=[];
  return Response.json(data);
 }));
});
afterEach(()=>vi.unstubAllGlobals());
async function request(body:any){return handler(new Request('https://isolated.invalid/functions/v1/voip-session',{method:'POST',headers:{authorization:'Bearer user-token','content-type':'application/json','x-organization-id':contextOrg},body:JSON.stringify(body)}));}
it('reports-only cannot obtain SIP credentials even if old local endpoints exist',async()=>{
 const response=await request({action:'get_webphone_session'});expect(await response.json()).toMatchObject({enabled:false,reason:'reports_only'});
 expect(calls.some(call=>call.url.pathname.endsWith('/voip_external_accounts'))).toBe(false);
});
it('development source preserves reports but does not issue an audio session',async()=>{
 usage='browser';source='taze_pbx';
 expect(await (await request({action:'get_connection_policy'})).json()).toMatchObject({enabled:false,reportsEnabled:true,reason:'under_development'});
});
it('uses the active membership tenant instead of the global profile org',async()=>{
 usage='browser';const result=await (await request({action:'get_webphone_session'})).json();
 expect(result).toMatchObject({enabled:true,wssUrl:'wss://edge.example.test/socket',endpoint:{authUsername:'101',sipSecret:'fixture-secret'}});
 expect(calls.filter(call=>call.url.pathname.endsWith('/voip_external_accounts')).every(call=>call.url.searchParams.get('org_id')==='eq.org-b')).toBe(true);
});
it('fails closed without membership or plan access',async()=>{
 usage='browser';member=false;expect((await request({action:'get_webphone_session'})).status).toBe(500);
 member=true;plan.features.voip_webphone=false;
 expect(await (await request({action:'get_webphone_session'})).json()).toMatchObject({enabled:false,reason:'plan_disabled'});
});
it('does not guess a WSS URL from legacy provider metadata',async()=>{
 usage='browser';account.metadata.wss_url='192.0.2.10';
 expect(await (await request({action:'get_webphone_session'})).json()).toMatchObject({enabled:false,reason:'missing_verified_wss'});
});
it('cannot save an account for a user outside the active organization',async()=>{
 usage='browser';account=null;
 expect((await request({action:'upsert_endpoint',endpoint:{assignee_profile_id:'foreign-user',extension:'101',sip_secret:'test-only'}})).status).toBe(403);
 expect(calls.some(call=>call.url.pathname.endsWith('/voip_external_accounts')&&call.init?.method==='POST')).toBe(false);
});
