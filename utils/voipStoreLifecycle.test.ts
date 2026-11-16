// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({invoke:vi.fn(),constructed:[] as any[]}));
const callAudio=vi.hoisted(()=>({prepareVoipRingbackTone:vi.fn(),startVoipRingbackTone:vi.fn(),stopVoipRingbackTone:vi.fn(),disposeVoipRingbackTone:vi.fn()}));
vi.mock('./voipRingbackTone',()=>callAudio);
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
 class Inviter{
  static last:Inviter;
  request={callId:'fixture-call'};state='Initial';listener:(state:string)=>void=()=>{};
  stateChange={addListener:(fn:any)=>{this.listener=fn;}};
  inviteOptions:any;
  constructor(public ua:any,public uri:any,public options:any){Inviter.last=this;}
  invite=async(options:any)=>{this.inviteOptions=options;};cancel=async()=>{};
 }
 return {UserAgent,Registerer,RegistererState:{Registered:'Registered',Unregistered:'Unregistered'},Invitation:class{},Inviter,Session:class{},URI:class{},SessionState:{Established:'Established',Terminated:'Terminated'}};
});
import {connectVoipWebPhone,disconnectVoipWebPhone,getVoipSnapshot,dialWebPhone} from './voipStore';
import {Inviter} from 'sip.js';
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
it('rings only on real SIP ringing and stops on early media, rejection and termination',async()=>{
 mocks.invoke.mockResolvedValue({data:config('مخاطب'),error:null});
 await dialWebPhone('09120000000');
 const call=(Inviter as any).last;
 expect(call.options.earlyMedia).toBe(true);expect(callAudio.prepareVoipRingbackTone).toHaveBeenCalledOnce();
 expect(callAudio.startVoipRingbackTone).not.toHaveBeenCalled();
 call.inviteOptions.requestDelegate.onProgress({message:{statusCode:180}});
 expect(callAudio.startVoipRingbackTone).toHaveBeenCalledOnce();
 call.inviteOptions.requestDelegate.onProgress({message:{statusCode:183}});
 expect(callAudio.stopVoipRingbackTone).toHaveBeenCalledTimes(1);
 call.inviteOptions.requestDelegate.onReject();expect(callAudio.stopVoipRingbackTone).toHaveBeenCalledTimes(2);
 call.listener('Terminated');expect(callAudio.stopVoipRingbackTone).toHaveBeenCalledTimes(3);
});
