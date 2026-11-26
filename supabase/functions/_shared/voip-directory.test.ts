import {expect,it,vi} from 'vitest';
import {searchVoipOperators,normalizeDialExtension,validDialExtension} from './voip-directory';
const user='10000000-0000-4000-8000-000000000001';
it('lists only active members in the selected tenant and never reads authentication fields',async()=>{
 const read=vi.fn(async(table:string,_params:Record<string,string>)=>table==='voip_external_accounts'?[{id:'account',assignee_profile_id:user,display_name:'همکار',dial_extension:'۱۰۱',sip_secret:'must-not-escape',extension:'821999'}]:table==='user_organization_memberships'?[{user_id:user}]:[{id:user,avatar_url:'/avatar.png',full_name:'همکار'}]);
 const result=await searchVoipOperators(read,'tenant-a','همکار');
 expect(result.items).toEqual([{id:'account',title:'همکار',avatarUrl:'/avatar.png',phone:'101'}]);
 for(const [table,params] of read.mock.calls){
  if(table!=='profiles')expect(params.org_id).toBe('eq.tenant-a');
  expect(params.select).not.toMatch(/sip_secret|auth_username|password|\bextension\b/);
 }
 expect(JSON.stringify(result)).not.toMatch(/must-not-escape|821999/);
});
it('never substitutes a login name for a missing dial extension or exposes an inactive member',async()=>{
 const read=vi.fn(async(table:string)=>table==='voip_external_accounts'?[{id:'account',assignee_profile_id:user,display_name:'همکار',extension:'821999'}]:table==='user_organization_memberships'?[{user_id:user}]:[{id:user}]);
 expect((await searchVoipOperators(read,'tenant-a','')).items[0].phone).toBe('');
 read.mockImplementation(async(table)=>table==='voip_external_accounts'?[{assignee_profile_id:user}]:[]);
 expect((await searchVoipOperators(read,'tenant-a','')).items).toEqual([]);
 await expect(searchVoipOperators(read,'','')).rejects.toThrow();
});
it('bounds and paginates account reads while discarding filter operators from query text',async()=>{
 const read=vi.fn(async(_table:string,_params:Record<string,string>)=>[]);
 await searchVoipOperators(read,'tenant-a','۱۰۱),org_id.eq.other',40);
 const params=read.mock.calls[0][1];expect(params).toMatchObject({offset:'40',limit:'21'});
 expect(params.or).not.toContain('org_id.eq');expect(params.or).toContain('101');
 expect(normalizeDialExtension('١٠۲')).toBe('102');expect(validDialExtension('۱۰۱')).toBe(true);expect(validDialExtension('101@other')).toBe(false);
});
