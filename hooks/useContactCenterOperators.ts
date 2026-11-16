import {useQuery} from '@tanstack/react-query';
import {supabase} from '../supabaseClient';
export type ContactCenterOperator={id:string;profileId:string;title:string;avatarUrl:string|null;loginUsername:string;isActive:boolean;status:'online'|'busy'|'offline'|'disabled';lastCheckedAt:string|null;metadata:Record<string,any>};
export function useContactCenterOperators(orgId:string|null,offset:number,enabled:boolean){
 return useQuery({queryKey:['contact-center-operators',orgId,offset],enabled:!!orgId&&enabled,staleTime:5000,refetchInterval:15000,
  queryFn:async()=>{
   const {data,error}=await supabase.functions.invoke('voip-session',{headers:{'x-organization-id':orgId!},body:{action:'list_center_operators',offset}});
   if(error||!data?.success)throw new Error(data?.message||'دریافت اپراتورها انجام نشد.');
   return data as {items:ContactCenterOperator[];hasMore:boolean;nextOffset:number};
  },
 });
}
