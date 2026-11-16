import {describe,it,expect,vi} from 'vitest';
import {searchCallContacts,loadCallIdentity,loadCallContextSection,externalCallAgentIdentity,sortContactActivity,type ContactContextReader} from './voip-contact-context';
const org='10000000-0000-4000-8000-000000000001';const id='20000000-0000-4000-8000-000000000001';
const reader=():ContactContextReader=>({orgId:org,permissions:{customers:{view:true},suppliers:{view:true},employees:{view:true},invoices:{view:true}},plan:{available:true},read:vi.fn(async(table)=>({rows:table==='customers'?[{id,full_name:'مخاطب',mobile_1:'09120000000'}]:[],count:null})),rpc:vi.fn(async(name)=>name==='filter_call_contact_identities'?[id]:({rows:[],count:0}))});
describe('shared call contact context',()=>{
 it('uses exact directory lookup, keeps tenant filters and does not use phone suffixes',async()=>{
  const ctx=reader();const rows=await searchCallContacts(ctx,'۰۹۱۲۰۰۰۰۰۰۰');expect(rows).toHaveLength(1);
  const calls=vi.mocked(ctx.read).mock.calls;
  expect(calls[0][0]).toBe('phone_numbers');expect(calls[0][1].lookup_key).toBe('eq.9120000000');
  for(const [,params] of calls){expect(params.org_id).toBe(`eq.${org}`);expect(JSON.stringify(params)).not.toContain('normalized_number');expect(JSON.stringify(params)).not.toContain('ilike');}
 });
 it('never greets a randomly chosen person when the number has multiple matches',()=>{
  const candidates=[{moduleId:'customers' as const,recordId:id,title:'نفر اول',phone:'09120000000'},{moduleId:'suppliers' as const,recordId:id,title:'نفر دوم',phone:'09120000000'}];
  const result=externalCallAgentIdentity(candidates);expect(result.identityStatus).toBe('ambiguous');expect(result).not.toHaveProperty('name');expect(result.identityVerified).toBe(false);
 });
 it('does not read modules unavailable through permission or plan',async()=>{
  const ctx=reader();ctx.permissions={};expect(await searchCallContacts(ctx,'نام مخاطب')).toEqual([]);expect(ctx.read).not.toHaveBeenCalled();
  await expect(loadCallIdentity(ctx,'customers',id)).rejects.toThrow();
 });
 it('strips hidden identity fields before requesting them',async()=>{
  const ctx=reader();ctx.permissions.customers.fields={mobile_1:false};await loadCallIdentity(ctx,'customers',id);
  expect(vi.mocked(ctx.read).mock.calls[0][1].select.split(',')).not.toContain('mobile_1');
 });
 it('preserves full counts and exact cursors from the server instead of counting the current page',async()=>{
  const ctx=reader();vi.mocked(ctx.rpc).mockImplementation(async(name)=>name==='filter_call_contact_identities'?[id]:({rows:[{id,name:'فاکتور'}],count:1234,hasMore:true}));
  const identity=await loadCallIdentity(ctx,'customers',id);const section=await loadCallContextSection(ctx,identity,'invoices',20);
  expect(section).toMatchObject({count:1234,hasMore:true});expect(ctx.rpc).toHaveBeenCalledWith('read_call_contact_history',{p_module_id:'customers',p_record_id:id,p_section:'invoices',p_offset:20});
  expect(section.rows[0].href).toBe(`/invoices/${id}`);
 });
 it('sorts by the newer of creation and update with a stable tie break',()=>{
  expect(sortContactActivity([{id:'a',created_at:'2026-11-16',updated_at:'2026-10-01'},{id:'b',created_at:'2026-11-15'}]).map(row=>row.id)).toEqual(['a','b']);
 });
});
