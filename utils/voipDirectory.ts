import {supabase} from '../supabaseClient';
import {getSelectedOrganizationId} from './organizationContext';
export type VoipOperatorDirectoryItem={id:string;title:string;avatarUrl:string|null;phone:string};
export async function searchVoipOperatorDirectory(query:string,offset=0,signal?:AbortSignal):Promise<{items:VoipOperatorDirectoryItem[];hasMore:boolean;nextOffset:number}>{
 const orgId=getSelectedOrganizationId();
 const {data,error}=await supabase.functions.invoke('voip-session',{
  body:{action:'search_directory',query,offset},headers:orgId?{'x-organization-id':orgId}:{},signal});
 if(error||!data?.success)throw new Error('دریافت داخلی‌های سازمان انجام نشد.');
 return data;
}
