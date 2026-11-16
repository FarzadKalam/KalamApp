import {supabase} from '../supabaseClient';
import {getSelectedOrganizationId} from './organizationContext';
import {fetchSessionBootstrap} from './sessionCache';
import {dialPhone,iranMobileE164,phoneDigits} from '../supabase/functions/_shared/phone-number';

export type RecentVoipCall = {
  id:string; source_number?:string|null; destination_number?:string|null;
  direction?:string|null; status?:string|null; started_at?:string|null;
  talk_seconds?:number|null; extension?:string|null; recording_url?:string|null;
  file_id?:string|null; transcript?:string|null; transcript_status?:string|null;
};
export const RECENT_VOIP_CALL_COLUMNS='id,source_number,destination_number,direction,status,started_at,talk_seconds,extension,recording_url,file_id,transcript,transcript_status';

/** Use the current report schema and full phone variants; never match a suffix. */
export async function loadRecentVoipCalls(phone:string):Promise<RecentVoipCall[]> {
  const orgId=getSelectedOrganizationId()||(await fetchSessionBootstrap(supabase)).orgId;
  if(!orgId)throw new Error('سازمان جاری برای دریافت سوابق تماس مشخص نیست.');
  let query=supabase.from('voip_call_logs').select(RECENT_VOIP_CALL_COLUMNS).eq('org_id',orgId);
  if(phone.trim()){
    const digits=phoneDigits(phone);
    if(digits.length<7)return [];
    const international=iranMobileE164(phone);
    const variants=[...new Set([digits,dialPhone(phone),...(international?[international,international.slice(1),'00'+international.slice(1),international.slice(3)]:[])])]
      .filter(v=>/^\+?\d{7,16}$/.test(v));
    if(!variants.length)return [];
    const values=variants.join(',');
    query=query.or(`source_number.in.(${values}),destination_number.in.(${values})`);
  }
  const {data,error}=await query.order('started_at',{ascending:false,nullsFirst:false}).order('id',{ascending:false}).limit(8);
  if(error)throw error;
  return (data||[]) as RecentVoipCall[];
}
