import {build} from 'esbuild';
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const org='10000000-0000-4000-8000-000000000001';const user='20000000-0000-4000-8000-000000000001';
const snapshot={user:{id:user},profile:{id:user,org_id:org,full_name:'همکار نمونه',voip_enabled:true},orgId:org,roleId:'30000000-0000-4000-8000-000000000001',permissions:{__settings_tabs:{edit:true},profiles:{edit:true},voip_call_reports:{view:true}},loadedAt:Date.now()};
await build({entryPoints:['scripts/qa/contact-center-fixture.tsx'],outdir:'tmp/contact-center-preview',entryNames:'entry',chunkNames:'[name]-[hash]',bundle:true,splitting:true,format:'esm',platform:'browser',minify:true,
 define:{'process.env.NODE_ENV':'"production"','import.meta.env':JSON.stringify({DEV:false,PROD:true,MODE:'test',BASE_URL:'/',VITE_SUPABASE_URL:'https://isolated-preview.invalid',VITE_SUPABASE_ANON_KEY:'fixture'}),__TAZESYSTEM_APP_VERSION__:JSON.stringify(pkg.version)},
 plugins:[{name:'isolated-contact-center',setup(builder){
  builder.onResolve({filter:/^@ant-design\/icons\/[A-Z][\w]+$/},({path:name})=>({path:require.resolve(name.replace('@ant-design/icons/','@ant-design/icons/es/icons/')+'.js')}));
  builder.onResolve({filter:/(^|\/)sessionCache(?:\.ts)?$/},args=>args.namespace==='contact-center'?undefined:{path:'session',namespace:'contact-center'});
  builder.onResolve({filter:/(^|\/)useOrgPlanFeature(?:\.ts)?$/},()=>({path:'plan',namespace:'contact-center'}));
  builder.onResolve({filter:/(^|\/)supabaseClient(?:\.ts)?$/},()=>({path:'backend',namespace:'contact-center'}));
  builder.onLoad({filter:/.*/,namespace:'contact-center'},args=>{
   if(args.path==='session')return {contents:`export * from ${JSON.stringify(path.resolve('utils/sessionCache.ts'))};export async function fetchSessionBootstrap(){return ${JSON.stringify(snapshot)}}`,loader:'js'};
   if(args.path==='plan')return {contents:'export function useOrgPlanFeature(){return true}',loader:'js'};
   return {contents:`
    const org=${JSON.stringify(org)},user=${JSON.stringify(user)};
    const call={id:'40000000-0000-4000-8000-000000000001',title:'مخاطب نمونه',org_id:org,provider:'telefonchy',direction:'outgoing',status:'answered',source_number:'101',destination_number:'09120000000',extension:'101',started_at:'2026-11-16T12:00:00Z',created_at:'2026-11-16T12:00:00Z',talk_seconds:65};
    const query=new Proxy(function(){},{get:(_,key)=>key==='then'?(resolve,reject)=>Promise.resolve({data:[],error:null}).then(resolve,reject):key==='maybeSingle'||key==='single'?async()=>({data:null,error:null}):query,apply:()=>query});
    const operators=[{id:'operator-fixture',profileId:user,title:'اپراتور نمونه',avatarUrl:null,loginUsername:'821000',isActive:true,status:'online',metadata:{dial_extension:'101'}}];
    const capabilities=Object.fromEntries(['dashboard_chat','voice_input','voice_output'].map(key=>[key,{model:'fixture-model',modelLabel:'مدل آزمون',selectable:[{value:'fixture-model',label:'مدل آزمون'}],available:true}]));
    export const supabase={from:()=>query,rpc:async(name)=>({data:name==='get_accessible_voip_call_logs_page'?[call]:[],error:null}),auth:{getUser:async()=>({data:{user:{id:user}},error:null}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},channel:()=>({on(){return this},subscribe(){return this},unsubscribe(){}}),removeChannel:async()=>{},storage:{from:()=>query},functions:{invoke:async(name,options)=>({error:null,data:name==='voip-session'?(options.body.action==='get_connection_policy'?{success:true,enabled:true,usageMode:'browser',browserSource:'external',provider:'telefonchy'}:options.body.action==='list_center_operators'?{success:true,items:operators,hasMore:false,nextOffset:20}:{success:true,enabled:false,reason:'fixture',message:'نمونهٔ بدون تماس واقعی'}):{success:true,capabilities,agents:[]}})}};
    export const supabasePublic=supabase;export const supabaseSignUpClient=supabase;
    export const SUPABASE_URL='https://isolated-preview.invalid';export const SUPABASE_ANON_KEY='fixture';export const SUPABASE_AUTH_STORAGE_KEY='fixture';
   `,loader:'js'};
  });
 }}]});
console.log('Built isolated contact-center preview; no real account, microphone or call.');
