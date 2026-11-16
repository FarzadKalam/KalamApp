// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({from:vi.fn(),select:vi.fn(),eq:vi.fn(),or:vi.fn(),order:vi.fn(),limit:vi.fn(),org:vi.fn(),bootstrap:vi.fn()}));
vi.mock('../supabaseClient',()=>({supabase:{from:m.from}}));
vi.mock('./organizationContext',()=>({getSelectedOrganizationId:m.org}));
vi.mock('./sessionCache',()=>({fetchSessionBootstrap:m.bootstrap}));
import {loadRecentVoipCalls,RECENT_VOIP_CALL_COLUMNS} from './voipCallHistory';
beforeEach(()=>{
 vi.clearAllMocks();m.org.mockReturnValue('org');m.bootstrap.mockResolvedValue({orgId:'bootstrap-org'});
 const chain={select:m.select,eq:m.eq,or:m.or,order:m.order,limit:m.limit};
 for(const fn of [m.from,m.select,m.eq,m.or,m.order])fn.mockReturnValue(chain);
 m.limit.mockResolvedValue({data:[{id:'call',talk_seconds:65}],error:null});
});
describe('recent VoIP reports use the live schema',()=>{
 it('selects canonical columns and scopes to the selected organization',async()=>{
  expect(await loadRecentVoipCalls('')).toEqual([{id:'call',talk_seconds:65}]);
  expect(m.select).toHaveBeenCalledWith(RECENT_VOIP_CALL_COLUMNS);
  expect(RECENT_VOIP_CALL_COLUMNS).not.toMatch(/counterparty_phone|(?:^|,)duration(?:,|$)/);
  expect(m.eq).toHaveBeenCalledWith('org_id','org');expect(m.limit).toHaveBeenCalledWith(8);
 });
 it('matches complete mobile forms in either canonical number field without suffix matching',async()=>{
  await loadRecentVoipCalls('۰۹۱۲۰۰۰۰۰۰۰');
  expect(m.or).toHaveBeenCalledWith('source_number.in.(09120000000,+989120000000,989120000000,00989120000000,9120000000),destination_number.in.(09120000000,+989120000000,989120000000,00989120000000,9120000000)');
 });
 it('does not substitute all recent records for a partially entered number',async()=>{
  expect(await loadRecentVoipCalls('1234')).toEqual([]);expect(m.limit).not.toHaveBeenCalled();
 });
 it('supports the host-resolved organization and fails closed when it is unavailable',async()=>{
  m.org.mockReturnValue(null);await loadRecentVoipCalls('');expect(m.eq).toHaveBeenCalledWith('org_id','bootstrap-org');
  m.bootstrap.mockResolvedValue({orgId:null});await expect(loadRecentVoipCalls('')).rejects.toThrow();
 });
 it('preserves a report error instead of showing an empty history',async()=>{
  const error={code:'42703',message:'fixture failure'};m.limit.mockResolvedValue({data:null,error});
  await expect(loadRecentVoipCalls('')).rejects.toEqual(error);
 });
});
