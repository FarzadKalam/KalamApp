// @vitest-environment node
import {beforeAll,beforeEach,afterEach,it,expect,vi} from 'vitest';
const plan=vi.hoisted(()=>({available:true,features:{voip_webphone:true}}));
vi.mock('../_shared/org-plan-access.ts',()=>({loadOrgPlanAccess:async()=>plan}));
let handler:(request:Request)=>Promise<Response>;
let usage='reports',source='external',member=true,contextOrg='org-b';
let account:any;
let gatewayState='pending';
let calls:{url:URL;init:any}[]=[];
beforeAll(async()=>{
 vi.stubGlobal('Deno',{env:{get:(name:string)=>name==='SUPABASE_URL'?'https://isolated.invalid':'test-key'},serve:(fn:any)=>{handler=fn;}});
 await import('./index');
});
beforeEach(()=>{
 vi.stubGlobal('Deno',{env:{get:(name:string)=>({SUPABASE_URL:'https://isolated.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-key',VOIP_GATEWAY_WSS_URL:'wss://gateway.example.test/voip-ws',VOIP_GATEWAY_SIP_DOMAIN:'gateway.example.test',VOIP_TURN_HOST:'gateway.example.test',VOIP_TURN_SECRET:'isolated-turn-key'}[name])}});
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
  else if(url.pathname.endsWith('/rpc/prepare_voip_provider_bridge'))data={browser_username:'bridge-user',browser_secret:'browser-only-secret',registration_status:gatewayState};
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
 usage='browser';account.metadata.wss_url='192.0.2.10';account.metadata.connection_strategy='direct';
 expect(await (await request({action:'get_webphone_session'})).json()).toMatchObject({enabled:false,reason:'missing_verified_wss'});
});
it('uses a separate browser secret for native SIP and never returns provider credentials',async()=>{
 usage='browser';account.metadata.wss_url='';gatewayState='registered';
 const result=await (await request({action:'get_webphone_session'})).json();
 expect(result).toMatchObject({enabled:true,route:'gateway',endpoint:{sipSecret:'browser-only-secret',authUsername:'bridge-user'}});
 expect(JSON.stringify(result)).not.toContain('fixture-secret');
 const call=calls.find(call=>call.url.pathname.endsWith('/rpc/prepare_voip_provider_bridge'))!;
 expect(JSON.parse(call.init.body)).toEqual({p_org_id:'org-b',p_user_id:'user-a'});
});
it('does not announce pending or rejected provider registration as connected',async()=>{
 usage='browser';account.metadata.wss_url='';
 gatewayState='pending';expect(await (await request({action:'get_webphone_session'})).json()).toMatchObject({enabled:false,reason:'gateway_provisioning'});
 gatewayState='rejected';expect(await (await request({action:'get_webphone_session'})).json()).toMatchObject({enabled:false,reason:'provider_rejected'});
});
it('cannot save an account for a user outside the active organization',async()=>{
 usage='browser';account=null;
 expect((await request({action:'upsert_endpoint',endpoint:{assignee_profile_id:'foreign-user',extension:'101',sip_secret:'test-only'}})).status).toBe(403);
 expect(calls.some(call=>call.url.pathname.endsWith('/voip_external_accounts')&&call.init?.method==='POST')).toBe(false);
});
it('directory is disabled for reports-only or unavailable plans',async()=>{
 expect((await request({action:'search_directory'})).status).toBe(403);
 usage='browser';plan.features.voip_webphone=false;
 expect((await request({action:'search_directory'})).status).toBe(403);
 expect(calls.some(call=>call.url.pathname.endsWith('/voip_external_accounts'))).toBe(false);
});
it('directory reads are tenant scoped and never select SIP credentials',async()=>{
 usage='browser';await request({action:'search_directory',query:'۱۰۱'});
 const selected=calls.filter(call=>call.url.pathname.endsWith('/voip_external_accounts'));
 expect(selected).toHaveLength(1);expect(selected[0].url.searchParams.get('org_id')).toBe('eq.org-b');
 expect(selected[0].url.searchParams.get('select')).not.toContain('sip_secret');
 expect(selected[0].url.searchParams.get('select')).not.toMatch(/\bextension\b/);
});
it('operator management remains gated by the webphone plan',async()=>{
 plan.features.voip_webphone=false;
 expect((await request({action:'list_center_operators'})).status).toBe(403);
 expect(calls.some(call=>call.url.pathname.endsWith('/voip_provider_bridges'))).toBe(false);
});

it('records the final event when the initial insert wins a concurrent write', async () => {
 usage = 'browser';
 const fallbackFetch = globalThis.fetch;
 const writes = vi.fn();
 let reads = 0;
 vi.stubGlobal('fetch', async (input: any, init: any) => {
  const url = new URL(input);
  if (!url.pathname.endsWith('/voip_call_logs')) return fallbackFetch(input, init);
  if (!init.method) return Response.json(reads++ ? [{ id: 'call-row', status: 'ringing', started_at: '2026-11-18T10:00:00Z' }] : []);
  const row = JSON.parse(init.body);
  writes(init.method, url.searchParams, row);
  return init.method === 'POST'
   ? Response.json({ code: '23505' }, { status: 409 })
   : Response.json([{ id: 'call-row', ...row }]);
 });
 const response = await request({ action: 'log_webrtc_call', callId: 'same-concurrent-call', status: 'missed', talkSeconds: 0 });
 expect(response.status).toBe(200);
 expect(await response.json()).toMatchObject({ success: true, callLog: { id: 'call-row', status: 'missed', talk_seconds: 0 } });
 expect(writes).toHaveBeenCalledTimes(2);
 const [method, params, row] = writes.mock.calls[1];
 expect(method).toBe('PATCH');
 expect(params.get('org_id')).toBe('eq.org-b');
 expect(params.get('status')).toBe('eq.ringing');
 expect(row).not.toHaveProperty('started_at');
});

it('keeps a terminal status when a late ringing event arrives', async () => {
 usage = 'browser';
 const fallbackFetch = globalThis.fetch;
 const previous = { id: 'call-row', status: 'missed', ended_at: '2026-11-18T10:00:00Z', metadata: { kept: true } };
 vi.stubGlobal('fetch', async (input: any, init: any) => {
  if (!new URL(input).pathname.endsWith('/voip_call_logs')) return fallbackFetch(input, init);
  return Response.json([init.method === 'PATCH' ? { ...previous, ...JSON.parse(init.body) } : previous]);
 });
 const response = await request({ action: 'log_webrtc_call', callId: 'same-call', status: 'ringing' });
 expect(await response.json()).toMatchObject({
  success: true, callLog: { status: 'missed', ended_at: previous.ended_at, metadata: { kept: true } },
 });
});
