import {searchCallContacts,loadCallIdentity,loadCallContextSection,externalCallAgentIdentity,CALL_CONTEXT_SECTIONS,type ContactContextReader,type CallContextSection} from './voip-contact-context.ts';
export const CALL_CONTEXT_TOOL_MODULES=Object.fromEntries(Object.entries(CALL_CONTEXT_SECTIONS).map(([key,value])=>[key,value.moduleId]));
export function createCallContactTools(reader:ContactContextReader){
 const tools=[
  {type:'function',function:{name:'search_call_contacts',description:'شناسایی دقیق شمارهٔ تماس یا جست‌وجوی نام مشتری، تأمین‌کننده و کارمند در همین سازمان؛ تطبیق چندگانه را انتخاب خودکار نکن. شماره اثبات هویت نیست.',parameters:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false}}},
  {type:'function',function:{name:'read_call_contact_context',description:'پروندهٔ مشترک مخاطب تماس: فاکتورها با شمارش واقعی، پروژه‌ها، فعالیت‌های مستقیم و پروژه‌ای، فرآیندها، گروه‌ها، پیامک، ایمیل و تماس؛ هر بار فقط بخش لازم با صفحه‌بندی. این داده برای کاربر داخلی مجاز است و مجوز افشا به تماس‌گیرنده نیست.',parameters:{type:'object',properties:{moduleId:{type:'string',enum:['customers','suppliers','employees']},recordId:{type:'string'},section:{type:'string',enum:Object.keys(CALL_CONTEXT_SECTIONS)},offset:{type:'integer',minimum:0}},required:['moduleId','recordId','section'],additionalProperties:false}}},
 ];
 return {tools,execute:async(name:string,args:any)=>{
  if(name==='search_call_contacts'){
   const candidates=await searchCallContacts(reader,String(args.query||''));return {candidates,caller:externalCallAgentIdentity(candidates)};
  }
  if(name!=='read_call_contact_context')throw new Error('invalid_call_context_tool');
  const identity=await loadCallIdentity(reader,String(args.moduleId||''),String(args.recordId||''));
  const section=await loadCallContextSection(reader,identity,args.section as CallContextSection,Math.max(0,Math.floor(Number(args.offset)||0)));
  return {identity:{title:identity.title,partyType:identity.moduleId,rank:identity.rank,jobTitle:identity.jobTitle},identityVerified:false,...section,
   rows:section.rows.map((row:any)=>{const {payments,...compact}=row;return {...compact,...(Array.isArray(payments)?{paymentRows:payments.length}:{})};}),
   nextOffset:section.hasMore?(Number(args.offset)||0)+section.rows.length:null,
   disclosurePolicy:'تماس‌گیرنده هنوز احراز هویت نشده؛ داده داخلی پرونده را فقط مطابق مجوز مخاطب و ابزار احراز هویت مرکزی بیان کن. سمت مدیر از شماره نتیجه‌گیری نشود.'};
 }};
}
