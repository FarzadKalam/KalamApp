import {supabase} from '../supabaseClient';
import {getSelectedOrganizationId} from './organizationContext';
export type CallContactIdentity={moduleId:'customers'|'suppliers'|'employees';recordId:string;title:string;phone:string;rank?:string;jobTitle?:string;avatarUrl?:string|null};
export type CallContactSection={section:string;moduleId:string;label:string;state:string;count:number|null;offset?:number;hasMore?:boolean;rows:Record<string,any>[]};
export const CALL_CONTACT_SECTION_KEYS=['invoices','purchases','projects','tasks','processes','groups','sms','email','calls'] as const;
export const CALL_CONTACT_SECTION_LABELS:Record<string,string>={invoices:'فاکتورهای فروش و پرداخت‌ها',purchases:'فاکتورهای خرید و پرداخت‌ها',projects:'پروژه‌ها',tasks:'فعالیت‌های مرتبط',processes:'فرآیندها',groups:'گروه‌های پیام‌رسان',sms:'پیامک‌ها',email:'ایمیل‌ها',calls:'تماس‌ها'};
export async function readVoipContactContext(body:Record<string,any>,signal?:AbortSignal){
 const orgId=getSelectedOrganizationId();
 const {data,error}=await supabase.functions.invoke('voip-contact-context',{body,headers:orgId?{'x-organization-id':orgId}:{},signal});
 if(error||!data?.success)throw new Error(data?.message||'بازیابی پروندهٔ مخاطب انجام نشد.');
 return data;
}
/** Exact directory resolution; ambiguity is preserved instead of picking the first person. */
export async function resolveVoipContact(phone:string){
 const data=await readVoipContactContext({action:'search',query:phone});
 const candidates=(data.candidates||[]) as CallContactIdentity[];
 return candidates.length===1?candidates[0]:null;
}
