import {phoneLookupKey} from './phone-number.ts';
import {canViewModuleWithPlan} from './ai-grounding.ts';

export const CONTACT_MODULES=['customers','suppliers','employees'] as const;
export type ContactModule=typeof CONTACT_MODULES[number];
export type ContactIdentity={moduleId:ContactModule;recordId:string;title:string;phone:string;rank?:string;updatedAt?:string;avatarUrl?:string|null};
export type ContactContextReader={orgId:string;permissions:any;plan:any;read:(table:string,params:Record<string,string>,count?:boolean)=>Promise<{rows:any[];count:number|null}>;rpc:(name:string,body:any)=>Promise<any>};
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const safeText=(value:any)=>typeof value==='string'&&!UUID.test(value)?value.trim():'';
const title=(row:any)=>['full_name','business_name','name','process_name','title','subject','group_title'].map(key=>safeText(row[key])).find(Boolean)||'بدون عنوان';
export const contactActivityTime=(row:any)=>Math.max(...['updated_at','created_at'].map(key=>Date.parse(row[key]||'')||0));
export const sortContactActivity=(rows:any[])=>rows.slice().sort((a,b)=>contactActivityTime(b)-contactActivityTime(a)||String(b.id).localeCompare(String(a.id)));
const allowed=(ctx:ContactContextReader,module:string)=>canViewModuleWithPlan(ctx.plan,ctx.permissions,module);
const fieldAllowed=(ctx:ContactContextReader,module:string,field:string)=>ctx.permissions?.[module]?.fields?.[field]!==false&&ctx.permissions?.[module]?.fields?.[field]?.view!==false;
const selectFields=(ctx:ContactContextReader,module:string,columns:string[])=>columns.filter(key=>key==='id'||fieldAllowed(ctx,module,key)).join(',');


/** End-user RLS is mandatory in reader; never use service-role REST for this data. */
export async function searchCallContacts(ctx:ContactContextReader,input:string):Promise<ContactIdentity[]>{
 const query=String(input||'').trim().slice(0,100);if(query.length<2)return [];
 const isPhone=/^[+\d۰-۹٠-٩\s().-]+$/.test(query);
 const key=isPhone?phoneLookupKey(query):'';
 if(isPhone&&key.length<7)return [];
 if(!CONTACT_MODULES.some(module=>allowed(ctx,module)))return [];
 const matches=await ctx.rpc('search_call_contact_identities',{p_query:query,p_phone_key:key||null});
 const rows=(Array.isArray(matches)?matches:[]).filter(row=>CONTACT_MODULES.includes(row.moduleId)&&allowed(ctx,row.moduleId));
 const avatars=new Map<string,string>();
 await Promise.all(CONTACT_MODULES.map(async module=>{
  if(!fieldAllowed(ctx,module,'image_url'))return;
  const ids=rows.filter(row=>row.moduleId===module&&UUID.test(row.id)).map(row=>row.id);if(!ids.length)return;
  try{
   const result=await ctx.read(module,{org_id:`eq.${ctx.orgId}`,id:`in.(${ids.join(',')})`,select:'id,image_url',limit:String(ids.length)});
   for(const row of result.rows)if(typeof row.image_url==='string')avatars.set(module+row.id,row.image_url);
  }catch{/* Optional images must not block the authorized identity lookup. */}
 }));
 return sortContactActivity(rows).map(row=>({moduleId:row.moduleId,recordId:row.id,title:title(row),phone:row.mobile_1||row.mobile_2||row.phone||'',rank:row.rank,updatedAt:row.updated_at||row.created_at,avatarUrl:avatars.get(row.moduleId+row.id)||null}));
}

export const CALL_CONTEXT_SECTIONS={
 invoices:{moduleId:'invoices',table:'invoices',label:'فاکتورهای فروش',columns:['id','name','system_code','status','invoice_date','total_invoice_amount','total_received_amount','remaining_balance','payments','created_at','updated_at']},
 purchases:{moduleId:'purchase_invoices',table:'purchase_invoices',label:'فاکتورهای خرید',columns:['id','name','system_code','status','invoice_date','total_invoice_amount','total_received_amount','remaining_balance','payments','created_at','updated_at']},
 projects:{moduleId:'projects',table:'projects',label:'پروژه‌ها',columns:['id','name','system_code','status','start_date','due_date','progress_percent','created_at','updated_at']},
 tasks:{moduleId:'tasks',table:'tasks',label:'فعالیت‌ها',columns:['id','name','system_code','status','due_date','assignee_id','project_id','created_at','updated_at']},
 processes:{moduleId:'process_runs',table:'process_runs',label:'فرآیندها',columns:['id','process_name','system_code','status','started_at','completed_at','module_id','record_id','created_at','updated_at']},
 groups:{moduleId:'counterparty_bot_groups',table:'counterparty_bot_groups',label:'گروه‌های پیام‌رسان',columns:['id','group_title','channel_type','status','last_inbound_at','created_at','updated_at']},
 sms:{moduleId:'sms_delivery_reports',table:'sms_delivery_reports',label:'پیامک‌ها',columns:['id','title','message_text','status','direction','sent_at','created_at','updated_at']},
 email:{moduleId:'email_delivery_reports',table:'email_messages',label:'ایمیل‌ها',columns:['id','subject','status','direction','message_at','created_at']},
 calls:{moduleId:'voip_call_reports',table:'voip_call_logs',label:'تماس‌ها',columns:['id','title','direction','status','started_at','talk_seconds','created_at','updated_at']},
} as const;
export type CallContextSection=keyof typeof CALL_CONTEXT_SECTIONS;

export async function loadCallIdentity(ctx:ContactContextReader,module:string,id:string){
 if(!CONTACT_MODULES.includes(module as ContactModule)||!UUID.test(id)||!allowed(ctx,module))throw new Error('contact_not_available');
 const columns=['id','full_name','first_name','last_name','prefix','mobile_1','mobile_2','phone','created_at','updated_at',...(module==='suppliers'?[]:['email']),...(module==='employees'?['job_title','related_profile_id']:['business_name','rank'])];
 const result=await ctx.read(module,{org_id:`eq.${ctx.orgId}`,id:`eq.${id}`,select:selectFields(ctx,module,columns),limit:'1'});
 const record=result.rows[0];if(!record)throw new Error('contact_not_available');
 const visible=await ctx.rpc('filter_call_contact_identities',{p_module_id:module,p_ids:[id]});
 if(!Array.isArray(visible)||!visible.includes(id))throw new Error('contact_not_available');
 return {moduleId:module as ContactModule,recordId:id,title:title(record),phone:record.mobile_1||record.mobile_2||record.phone||'',rank:record.rank,jobTitle:record.job_title,record};
}

export async function loadCallContextSection(ctx:ContactContextReader,identity:Awaited<ReturnType<typeof loadCallIdentity>>,section:CallContextSection,offset=0){
 const definition=CALL_CONTEXT_SECTIONS[section];if(!definition)throw new Error('invalid_section');
 if(!allowed(ctx,definition.moduleId))return {section,moduleId:definition.moduleId,label:definition.label,state:'restricted',rows:[],count:null};
 const result=await ctx.rpc('read_call_contact_history',{p_module_id:identity.moduleId,p_record_id:identity.recordId,p_section:section,p_offset:offset});
 return {section,moduleId:definition.moduleId,label:definition.label,state:'ready',...result,
  rows:(Array.isArray(result?.rows)?result.rows:[]).map((row:any)=>({...row,displayTitle:title(row),href:`/${definition.moduleId}/${row.id}`}))};
}

/** Safe pre-verification context for an external caller: no financial or staff data. */
export function externalCallAgentIdentity(candidates:ContactIdentity[]){
 return {identityStatus:candidates.length===1?'matched_unverified':candidates.length?'ambiguous':'unknown',
  identityVerified:false,...(candidates.length===1?{name:candidates[0].title,partyType:candidates[0].moduleId}:{}),
  guidance:'شمارهٔ تماس اثبات هویت یا سمت نیست. پیش از افشای دادهٔ مالی، پروژه، کارکنان یا پیام‌های داخلی، هویت و مجوز مخاطب را با ابزار مرکزی تأیید کن. نقش مدیریتی از شماره حدس زده نشود.'};
}
