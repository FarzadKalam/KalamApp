import {phoneLookupKey,iranMobileLocal,iranMobileE164} from './phone-number.ts';
import {canViewModuleWithPlan} from './ai-grounding.ts';

export const CONTACT_MODULES=['customers','suppliers','employees'] as const;
export type ContactModule=typeof CONTACT_MODULES[number];
export type ContactIdentity={moduleId:ContactModule;recordId:string;title:string;phone:string;rank?:string;updatedAt?:string};
export type ContactContextReader={orgId:string;permissions:any;plan:any;read:(table:string,params:Record<string,string>,count?:boolean)=>Promise<{rows:any[];count:number|null}>;rpc:(name:string,body:any)=>Promise<any>};
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const safeText=(value:any)=>typeof value==='string'&&!UUID.test(value)?value.trim():'';
const title=(row:any)=>['full_name','business_name','name','process_name','title','subject','group_title'].map(key=>safeText(row[key])).find(Boolean)||'بدون عنوان';
export const contactActivityTime=(row:any)=>Math.max(...['updated_at','created_at'].map(key=>Date.parse(row[key]||'')||0));
export const sortContactActivity=(rows:any[])=>rows.slice().sort((a,b)=>contactActivityTime(b)-contactActivityTime(a)||String(b.id).localeCompare(String(a.id)));
const allowed=(ctx:ContactContextReader,module:string)=>canViewModuleWithPlan(ctx.plan,ctx.permissions,module);
const fieldAllowed=(ctx:ContactContextReader,module:string,field:string)=>ctx.permissions?.[module]?.fields?.[field]!==false&&ctx.permissions?.[module]?.fields?.[field]?.view!==false;
const selectFields=(ctx:ContactContextReader,module:string,columns:string[])=>columns.filter(key=>key==='id'||fieldAllowed(ctx,module,key)).join(',');
const phoneValues=(phone:string)=>[...new Set([phoneLookupKey(phone),iranMobileLocal(phone),iranMobileE164(phone)].filter(Boolean))] as string[];
const idList=(ids:string[])=>ids.filter(id=>UUID.test(id)).join(',');

/** End-user RLS is mandatory in reader; never use service-role REST for this data. */
export async function searchCallContacts(ctx:ContactContextReader,input:string):Promise<ContactIdentity[]>{
 const query=String(input||'').trim().slice(0,100);if(query.length<2)return [];
 const isPhone=/^[+\d۰-۹٠-٩\s().-]+$/.test(query);
 const key=isPhone?phoneLookupKey(query):'';
 if(isPhone&&key.length<7)return [];
 let directory:any[]=[];
 if(key){
  const numbers=await ctx.read('phone_numbers',{select:'id',org_id:`eq.${ctx.orgId}`,lookup_key:`eq.${key}`,limit:'20'});
  if(numbers.rows.length)directory=(await ctx.read('phone_number_links',{select:'entity_type,entity_id,source_field',org_id:`eq.${ctx.orgId}`,phone_number_id:`in.(${idList(numbers.rows.map(row=>row.id))})`,limit:'50'})).rows;
 }
 const results=await Promise.all(CONTACT_MODULES.map(async module=>{
  if(!allowed(ctx,module))return [];
  const cols=['id','full_name','first_name','last_name','mobile_1','mobile_2','phone','updated_at','created_at',...(module==='employees'?['job_title','related_profile_id']:['business_name','rank'])];
  const filters:Record<string,string>={org_id:`eq.${ctx.orgId}`,select:selectFields(ctx,module,cols),limit:'20',order:'updated_at.desc.nullslast,created_at.desc,id.desc'};
  if(key){
   const ids=directory.filter(row=>row.entity_type===module&&row.source_field&&fieldAllowed(ctx,module,row.source_field)).map(row=>row.entity_id);
   const variants=phoneValues(query);
   filters.or='('+[...(ids.length?[`id.in.(${idList(ids)})`]:[]),...['mobile_1','mobile_2','phone'].filter(f=>fieldAllowed(ctx,module,f)).flatMap(field=>variants.map(value=>`${field}.eq.${value}`))].join(',')+')';
  }else{
   const text=query.replace(/[%*,()."\\]/g,'').trim();if(!text)return [];
   filters.or='('+['full_name','first_name','last_name',...(module==='employees'?[]:['business_name'])].filter(f=>fieldAllowed(ctx,module,f)).map(field=>`${field}.ilike.*${text}*`).join(',')+')';
  }
  if(filters.or==='()')return [];
  const result=await ctx.read(module,filters);
  return sortContactActivity(result.rows).map(row=>({moduleId:module,recordId:row.id,title:title(row),phone:row.mobile_1||row.mobile_2||row.phone||'',rank:row.rank,updatedAt:row.updated_at||row.created_at}));
 }));
 return results.flat().sort((a,b)=>(Date.parse(b.updatedAt||'')||0)-(Date.parse(a.updatedAt||'')||0));
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
