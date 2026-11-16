import {useQuery} from '@tanstack/react-query';
import {supabase} from '../supabaseClient';
export function useVoipConnectionPolicy(orgId?:string|null,enabled=true,userId?:string|null){
 return useQuery({queryKey:['voip-connection-policy',orgId,userId],enabled:!!orgId&&enabled,staleTime:30_000,refetchInterval:60_000,
  queryFn:async()=>{
   const {data,error}=await supabase.functions.invoke('voip-session',{body:{action:'get_connection_policy'}});
   if(error||!data?.success)throw new Error('تنظیمات تلفن سازمان در دسترس نیست.');
   return data as {usageMode:'reports'|'browser';browserSource:'external'|'taze_pbx';enabled:boolean;reason?:string;message?:string;provider?:string};
  },
 });
}
