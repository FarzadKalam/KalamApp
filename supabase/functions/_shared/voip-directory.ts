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

/** Management projection: no SIP secret and no arbitrary metadata is returned. */
export async function listContactCenterOperators(read:ReadRows,orgId:string,offset=0){
 if(!orgId)throw new Error('organization_required');
 const accounts=await read('voip_external_accounts',{org_id:`eq.${orgId}`,
  select:'id,assignee_profile_id,extension,display_name,is_active,metadata',order:'display_name.asc,id.asc',limit:'21',offset:String(offset)});
 const page=accounts.slice(0,20);const ids=page.map(row=>row.assignee_profile_id).filter(id=>/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id));
 const profiles=ids.length?await read('profiles',{id:`in.(${ids.join(',')})`,select:'id,full_name,avatar_url',limit:'20'}):[];
 const profilesById=new Map(profiles.map(row=>[row.id,row]));
 const bridges=page.length?await read('voip_provider_bridges',{org_id:`eq.${orgId}`,account_id:`in.(${page.map(row=>row.id).join(',')})`,select:'account_id,id,registration_status,lease_until,last_checked_at,active_call_count',limit:'20'}):[];
 const endpoints=bridges.map(row=>'b_'+String(row.id).replace(/-/g,'')+'_browser');
 const contacts=endpoints.length?await read('ps_contacts',{org_id:`eq.${orgId}`,endpoint:`in.(${endpoints.join(',')})`,select:'endpoint,expiration_time',limit:'100'}):[];
 const safeKeys=['dial_extension','server_url','sip_domain','auth_username','wss_url','connection_strategy','sip_transport','sip_port'];
 return {items:page.map(account=>{
  const person=profilesById.get(account.assignee_profile_id);const bridge=bridges.find(row=>row.account_id===account.id);
  const endpoint=bridge?'b_'+String(bridge.id).replace(/-/g,'')+'_browser':'';
  const fresh=Date.parse(bridge?.last_checked_at||'')>Date.now()-20000;
  const connected=account.is_active&&fresh&&bridge?.registration_status==='registered'&&Date.parse(bridge.lease_until)>Date.now()
   &&contacts.some(row=>row.endpoint===endpoint&&Number(row.expiration_time)*1000>Date.now());
  return {id:account.id,profileId:account.assignee_profile_id,title:account.display_name||person?.full_name||'اپراتور',avatarUrl:person?.avatar_url||null,
   loginUsername:account.extension,isActive:account.is_active,status:account.is_active&&fresh&&Number(bridge?.active_call_count)>0?'busy':connected?'online':account.is_active?'offline':'disabled',lastCheckedAt:bridge?.last_checked_at||null,
   metadata:Object.fromEntries(safeKeys.filter(key=>account.metadata?.[key]!=null).map(key=>[key,account.metadata[key]]))};
 }),hasMore:accounts.length>20,nextOffset:offset+20};
}
