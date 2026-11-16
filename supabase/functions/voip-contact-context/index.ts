import {loadVoipOrganizationContext} from '../_shared/voip-organization-context.ts';
import {loadOrgPlanAccess} from '../_shared/org-plan-access.ts';
import {searchCallContacts,loadCallIdentity,loadCallContextSection,externalCallAgentIdentity,type ContactContextReader,type CallContextSection} from '../_shared/voip-contact-context.ts';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-organization-id,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json(405,{success:false});
 try{
  const base=Deno.env.get('SUPABASE_URL')||'';const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  const authorization=req.headers.get('authorization')||'';const token=authorization.replace(/^Bearer\s+/i,'');
  if(!token)return json(401,{success:false,message:'برای دیدن پروندهٔ مخاطب وارد حساب شوید.'});
  const context=await loadVoipOrganizationContext(req,base,key,token);
  const plan=await loadOrgPlanAccess(base,key,context.org_id);
  if(!plan.available)return json(403,{success:false,message:'دسترسی به اطلاعات سازمان در پلن جاری فعال نیست.'});
  const headers:Record<string,string>={apikey:key,Authorization:authorization,'Content-Type':'application/json','x-organization-id':context.org_id};
  for(const name of ['origin','x-client-info'])if(req.headers.get(name))headers[name]=req.headers.get(name)!;
  const reader:ContactContextReader={orgId:context.org_id,permissions:context.permissions,plan,
   read:async(table,params,count)=>{
    const url=new URL(`${base}/rest/v1/${table}`);Object.entries(params).forEach(([key,value])=>url.searchParams.set(key,value));
    const response=await fetch(url,{headers:{...headers,...(count?{Prefer:'count=exact'}:{})},signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error('contact_data_unavailable');
    const rows=await response.json();const range=response.headers.get('content-range')?.split('/')[1];
    return {rows:Array.isArray(rows)?rows:[],count:range&&range!=='*'?Number(range):null};
   },
   rpc:async(name,body)=>{const response=await fetch(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error('conversation_unavailable');return response.json();},
  };
  const body=await req.json();
  if(body.action==='search'){
   const candidates=await searchCallContacts(reader,String(body.query||''));
   return json(200,{success:true,candidates,agentIdentity:externalCallAgentIdentity(candidates)});
  }
  const identity=await loadCallIdentity(reader,String(body.moduleId||''),String(body.recordId||''));
  if(body.action==='identity'){
   const {record,...safe}=identity;return json(200,{success:true,identity:safe,agentIdentity:externalCallAgentIdentity([safe])});
  }
  if(body.action==='section'){
   const offset=Math.max(0,Math.floor(Number(body.offset)||0));
   if(!Number.isSafeInteger(offset)||offset>2147483647)return json(400,{success:false,message:'شمارهٔ صفحه معتبر نیست.'});
   return json(200,{success:true,result:await loadCallContextSection(reader,identity,body.section as CallContextSection,offset)});
  }
  if(body.action==='group_messages'){
   // Confirm both ownership of the group and record/module permission before its own RPC ACL.
   const groups=await loadCallContextSection(reader,identity,'groups',Math.max(0,Math.floor(Number(body.groupOffset)||0)));
   const group=groups.rows.find((row:any)=>row.id===body.groupId);
   if(!group)return json(403,{success:false,message:'این گفتگو در محدودهٔ پروندهٔ مجاز نیست.'});
   const payload=await reader.rpc('get_bot_group_timeline_v2',{p_bot_group_id:group.id,p_limit:10,p_before_cursor:null});
   const items=Array.isArray(payload?.items)?payload.items:[];
   return json(200,{success:true,items:items.slice(-10).map((item:any)=>({id:item.id,text:String(item.content_text||'').slice(0,2000),direction:item.direction,createdAt:item.created_at}))});
  }
  return json(400,{success:false,message:'عملیات پروندهٔ تماس معتبر نیست.'});
 }catch{
  return json(403,{success:false,message:'بازیابی این بخش ممکن نشد؛ دسترسی سازمان و پرونده را بررسی کنید.'});
 }
});
