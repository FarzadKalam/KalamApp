import {act,renderHook,waitFor,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useCustomerPhoneAi} from './useCustomerPhoneAi';
const mocks=vi.hoisted(()=>({invoke:vi.fn(),hangup:vi.fn(),dial:vi.fn(),snapshot:{activeCall:null as null|{callId:string}}}));
vi.mock('../supabaseClient',()=>({supabase:{functions:{invoke:mocks.invoke}}}));
vi.mock('../utils/organizationContext',()=>({getSelectedOrganizationId:()=> 'org-a'}));
vi.mock('../utils/voipStore',()=>({
 useVoipState:()=>({activeCall:null}),getVoipSnapshot:()=>mocks.snapshot,
 dialWebPhone:mocks.dial,rejectOrHangupWebPhoneCall:mocks.hangup,
}));
afterEach(()=>{cleanup();vi.clearAllMocks();mocks.snapshot.activeCall=null;});
it.each([true,false])('ending AI session only hangs up its own listening call (same call: %s)',async(sameCall)=>{
 mocks.invoke.mockImplementation(async(_name,{body})=>({data:body.action==='start'?{success:true,sessionId:'fixture'}:body.action==='get'?{success:true,session:{status:'active',canListen:true},events:[]}:body.action==='listen'?{success:true,phone:'*88*1234567890123456'}:{success:true},error:null}));
 mocks.dial.mockImplementation(async()=>{mocks.snapshot.activeCall={callId:'listening'};});
 const {result}=renderHook(()=>useCustomerPhoneAi());
 await act(async()=>{await result.current.start('09120000000','test',{});});
 await waitFor(()=>expect(result.current.session?.status).toBe('active'));
 await act(async()=>{await result.current.listen();});
 if(!sameCall)mocks.snapshot.activeCall={callId:'another-human-call'};
 await act(async()=>{await result.current.cancel();});
 expect(mocks.hangup).toHaveBeenCalledTimes(sameCall?1:0);
});
