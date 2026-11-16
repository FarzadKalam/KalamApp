// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({invoke:vi.fn(),constructed:[] as any[]}));
vi.mock('../supabaseClient',()=>({supabase:{functions:{invoke:mocks.invoke}}}));
vi.mock('./voipContactContext',()=>({resolveVoipContact:vi.fn(async()=>null)}));
vi.mock('sip.js',()=>{
 class UserAgent{
  static makeURI=(value:string)=>({value});
  start=vi.fn(async()=>{});stop=vi.fn(async()=>{});
  constructor(public options:any){mocks.constructed.push(this);}
 }
 class Registerer{
  listener:(state:string)=>void=()=>{};
  stateChange={addListener:(fn:any)=>{this.listener=fn;}};
  register=async()=>{this.listener('Registered');};unregister=async()=>{};
 }
 return {UserAgent,Registerer,RegistererState:{Registered:'Registered',Unregistered:'Unregistered'},Invitation:class{},Inviter:class{},Session:class{},URI:class{},SessionState:{Established:'Established',Terminated:'Terminated'}};
});
import {connectVoipWebPhone,disconnectVoipWebPhone,getVoipSnapshot} from './voipStore';
const config=(displayName:string)=>({success:true,enabled:true,route:'direct',strategy:'direct',wssUrl:'wss://pbx.example.test/ws',sipDomain:'pbx.example.test',endpoint:{extension:'101',displayName,pjsipId:'101',sipUri:'sip:101@pbx.example.test',sipSecret:'fixture-secret',transport:'wss'}});
afterEach(async()=>{await disconnectVoipWebPhone();vi.clearAllMocks();mocks.constructed.length=0;});
it('ignores a previous organization session that arrives after disconnect',async()=>{
 let resolveOld:(value:any)=>void=()=>{};
 mocks.invoke.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;}));
 const old=connectVoipWebPhone();await disconnectVoipWebPhone();
 mocks.invoke.mockResolvedValueOnce({data:config('سازمان جدید'),error:null});
 expect(await connectVoipWebPhone()).toBe(true);
 resolveOld({data:config('سازمان قبلی'),error:null});expect(await old).toBe(false);
 expect(getVoipSnapshot().displayName).toBe('سازمان جدید');expect(mocks.constructed).toHaveLength(1);
});
it('clears contact identity before asynchronous transport teardown finishes',async()=>{
 mocks.invoke.mockResolvedValue({data:config('مخاطب قبلی'),error:null});await connectVoipWebPhone();
 let finish:()=>void=()=>{};const teardown=new Promise<void>(resolve=>{finish=resolve;});mocks.constructed[0].stop=vi.fn(()=>teardown);
 const disconnect=disconnectVoipWebPhone();
 expect(getVoipSnapshot()).toMatchObject({activeCall:null,displayName:null,provider:null,extension:null});
 await Promise.resolve();finish();await disconnect;
});
