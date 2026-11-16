import {loadVoipOrganizationContext} from '../_shared/voip-organization-context.ts';
import {loadOrgPlanAccess} from '../_shared/org-plan-access.ts';
import {loadCentralAiGrounding} from '../_shared/ai-grounding.ts';
import {dialPhone} from '../_shared/phone-number.ts';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-organization-id,x-kalam-voip-secret','Access-Control-Allow-Methods':'POST,OPTIONS'};
const response=(status:number,body:any)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const live=['queued','preparing','dialing','active'];
const b64=(bytes:Uint8Array)=>{let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return btoa(text).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');};
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return response(200,{});
 if(req.method!=='POST')return response(405,{success:false});
 const base=(Deno.env.get('SUPABASE_URL')||'').replace(/\/$/,'');const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 const serviceHeaders={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
 const rest=async(table:string,query:Record<string,string>,method='GET',body?:any)=>{
  const url=new URL(base+'/rest/v1/'+table);Object.entries(query).forEach(([k,v])=>url.searchParams.set(k,v));
  const result=await fetch(url,{method,headers:{...serviceHeaders,Prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{})});
  if(!result.ok)throw new Error('voice_storage_failed');return result.json();
 };
 try{
  const body=await req.json();const internal=Deno.env.get('KALAMAPP_VOIP_INTERNAL_SECRET')||'';
  if(body.action==='worker_turn'){
   if(!internal||req.headers.get('x-kalam-voip-secret')!==internal)return response(403,{success:false});
   if(!uuid.test(String(body.sessionId||'')))return response(400,{success:false});
   if(String(body.audio?.data||'').length>2000000)return response(413,{success:false});
   const rows=await rest('voip_ai_sessions',{id:`eq.${body.sessionId}`,select:'id,org_id,requested_by,status'});const job=rows[0];
   if(!job||!live.includes(job.status))return response(409,{success:false});
   const jwtSecret=Deno.env.get('JWT_SECRET');if(!jwtSecret)throw new Error('voice_identity_unavailable');
   const encoder=new TextEncoder();const now=Math.floor(Date.now()/1000);
   const token=b64(encoder.encode(JSON.stringify({alg:'HS256',typ:'JWT'})))+'.'+b64(encoder.encode(JSON.stringify({sub:job.requested_by,role:'authenticated',aud:'authenticated',iat:now,exp:now+90})));
   const signing=await crypto.subtle.importKey('raw',encoder.encode(jwtSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
   const jwt=token+'.'+b64(new Uint8Array(await crypto.subtle.sign('HMAC',signing,encoder.encode(token))));
   const result=await fetch(base+'/functions/v1/ai-assistant',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+jwt,'Content-Type':'application/json','x-organization-id':job.org_id,'x-kalam-voip-secret':internal},body:JSON.stringify({action:'customer_voice_turn',sessionId:job.id,audio:body.audio,text:body.text})});
   return response(result.status,await result.json());
  }
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!token)return response(401,{success:false});
  const context=await loadVoipOrganizationContext(req,base,key,token);
  const userResult=await fetch(base+'/auth/v1/user',{headers:{apikey:key,Authorization:'Bearer '+token}});const user=await userResult.json();if(!userResult.ok||!user.id)return response(401,{success:false});
  const org=context.org_id;const manager=context.permissions?.__settings_tabs?.edit===true;
  const reportPermission=context.permissions?.voip_call_reports;
  if(reportPermission?.view===false||(!reportPermission&&context.permissions?.__voip?.view===false))return response(403,{success:false,message:'دسترسی تماس‌های سازمان برای شما فعال نیست.'});
  if(body.action==='start'){
   const health=await rest('voip_ai_worker_health',{id:'eq.asterisk-voice',checked_at:`gt.${new Date(Date.now()-20000).toISOString()}`,select:'id'});
   if(!health.length)return response(503,{success:false,message:'پاسخ‌گوی صوتی روی درگاه آماده نیست؛ تماس آغاز نشد.'});
   const plan=await loadOrgPlanAccess(base,key,org);if(!plan.available||!(plan.features?.voip_webphone===true||plan.reason==='internal_organization'))return response(403,{success:false,message:'مکالمه در پلن سازمان فعال نیست.'});
   const grounding=await loadCentralAiGrounding({supabaseUrl:base,serviceRoleKey:key,authContext:{orgId:org,userId:user.id,roleId:context.role_id,permissions:context.permissions},planContext:plan,includeCalendar:false});
   const agent=grounding.agentStates.customer_response;if(!agent?.canUse)return response(403,{success:false,message:'اجازهٔ استفاده از ایجنت پاسخ‌گویی فعال نیست.'});
   const policy=agent.config?.policy_json||{};const accountId=String(policy.voice_account_id||'');
   if(!uuid.test(accountId))return response(400,{success:false,message:'ابتدا حساب مستقل AI را در تنظیمات ایجنت پاسخ‌گویی انتخاب کنید.'});
   const accounts=await rest('voip_external_accounts',{id:`eq.${accountId}`,org_id:`eq.${org}`,is_active:'eq.true',select:'id,metadata'});
   if(!accounts[0]||accounts[0].metadata?.ai_dedicated!==true)return response(400,{success:false,message:'حساب انتخاب‌شده باید فعال و مخصوص پاسخ‌گوی AI باشد.'});
   const phone=dialPhone(body.phone);if(!/^\+?[0-9]{7,15}$/.test(phone))return response(400,{success:false,message:'شمارهٔ تماس مخاطب معتبر نیست.'});
   if(!String(body.purpose||'').trim())return response(400,{success:false,message:'هدف تماس را بنویسید.'});
   const runtime=await rest('voip_ai_sessions',{org_id:`eq.${org}`,account_id:`eq.${accountId}`,status:'in.(queued,preparing,dialing,active)',select:'id',limit:'1'});
   if(runtime.length)return response(409,{success:false,message:'این حساب AI اکنون تماس یا درخواست فعال دارد.'});
   const overrides=Object.fromEntries(['dashboard_chat','voice_input','voice_output'].filter(k=>typeof body.models?.[k]==='string').map(k=>[k,String(body.models[k]).slice(0,150)]));
   const joinCode=String(BigInt('0x'+crypto.randomUUID().replace(/-/g,'').slice(0,14))%9000000000000000n+1000000000000000n);
   const created=await rest('voip_ai_sessions',{},'POST',[{org_id:org,requested_by:user.id,account_id:accountId,phone,join_code:joinCode,purpose:String(body.purpose||'').trim().slice(0,2000),model_overrides:overrides,max_duration_seconds:Math.min(600,Math.max(30,Number(policy.voice_max_duration_seconds)||180))}]);
   return response(200,{success:true,sessionId:created[0].id});
  }
  const id=String(body.sessionId||'');if(!uuid.test(id))return response(400,{success:false,message:'تماس معتبر نیست.'});
  const query:Record<string,string>={id:`eq.${id}`,org_id:`eq.${org}`};if(!manager)query.requested_by=`eq.${user.id}`;
  const sessions=await rest('voip_ai_sessions',{...query,select:'id,status,requested_by,join_code,purpose,created_at,started_at,ended_at,failure_code'});const session=sessions[0];
  if(!session)return response(404,{success:false,message:'تماس در محدودهٔ دسترسی شما پیدا نشد.'});
  if(body.action==='get'){
   const after=Number(body.after||0);if(!Number.isSafeInteger(after)||after<0)return response(400,{success:false});
   const events=await rest('voip_ai_session_events',{org_id:`eq.${org}`,session_id:`eq.${id}`,id:`gt.${after}`,select:'id,kind,content,created_at',order:'id.asc',limit:'100'});
   return response(200,{success:true,session:{id:session.id,status:session.status,purpose:session.purpose,createdAt:session.created_at,startedAt:session.started_at,endedAt:session.ended_at,failed:!!session.failure_code,canListen:session.status==='active'},events});
  }
  if(body.action==='listen'){
   if(session.status!=='active')return response(409,{success:false,message:'تماس هنوز فعال نشده است.'});
   return response(200,{success:true,phone:'*88*'+session.join_code});
  }
  if(body.action==='note'){
   if(!live.includes(session.status))return response(409,{success:false,message:'تماس پایان یافته است.'});
   const note=String(body.note||'').trim().slice(0,2000);if(!note)return response(400,{success:false});
   await rest('voip_ai_session_events',{},'POST',[{org_id:org,session_id:id,kind:'operator_note',content:note,created_by:user.id}]);return response(200,{success:true});
  }
  if(body.action==='cancel'){
   await rest('voip_ai_sessions',{...query,status:'in.(queued,preparing,dialing,active)'},'PATCH',{status:'cancelled',ended_at:new Date().toISOString()});return response(200,{success:true});
  }
  return response(400,{success:false});
 }catch{return response(500,{success:false,message:'عملیات تماس هوشمند انجام نشد؛ تنظیمات و دسترسی را بررسی کنید.'});}
});
