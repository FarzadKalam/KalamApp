type ReadRows = (table:string, params:Record<string,string>)=>Promise<any[]>;
export const normalizeDialExtension=(input:unknown)=>String(input??'').trim()
 .replace(/[۰-۹]/g,char=>String(char.charCodeAt(0)-1776))
 .replace(/[٠-٩]/g,char=>String(char.charCodeAt(0)-1632));
export const validDialExtension=(input:unknown)=>/^[0-9*#]{1,20}$/.test(normalizeDialExtension(input));

/** Private accounts remain private: fetch only their directory projection, never credentials. */
export async function searchVoipOperators(read:ReadRows,orgId:string,input:unknown,offset=0){
 if(!orgId)throw new Error('organization_required');
 const query=normalizeDialExtension(input).replace(/[^\p{L}\p{N}\s]/gu,' ').trim().slice(0,100);
 const params:Record<string,string>={org_id:`eq.${orgId}`,is_active:'eq.true',
  select:'id,assignee_profile_id,display_name,dial_extension:metadata->>dial_extension',
  order:'display_name.asc,id.asc',limit:'21',offset:String(offset)};
 if(query)params.or=`(display_name.ilike.*${query}*,metadata->>dial_extension.ilike.*${query}*)`;
 const page=await read('voip_external_accounts',params);
 const ids=page.slice(0,20).map(row=>String(row.assignee_profile_id||''))
  .filter(id=>/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id));
 if(!ids.length)return {items:[],hasMore:page.length>20,nextOffset:offset+20};
 const memberships=await read('user_organization_memberships',{
  org_id:`eq.${orgId}`,is_active:'eq.true',user_id:`in.(${ids.join(',')})`,select:'user_id',limit:'20'});
 const activeIds=memberships.map(row=>row.user_id).filter(id=>ids.includes(id));
 const profiles=activeIds.length?await read('profiles',{
  id:`in.(${activeIds.join(',')})`,select:'id,full_name,avatar_url',limit:'20'}):[];
 const byId=new Map(profiles.map(row=>[row.id,row]));
 return {items:page.slice(0,20).flatMap(row=>{
  const profile=byId.get(row.assignee_profile_id);if(!profile)return [];
  const phone=validDialExtension(row.dial_extension)?normalizeDialExtension(row.dial_extension):'';
  return [{id:row.id,title:row.display_name||profile.full_name||'کاربر تلفن',avatarUrl:profile.avatar_url||null,phone}];
 }),hasMore:page.length>20,nextOffset:offset+20};
}
