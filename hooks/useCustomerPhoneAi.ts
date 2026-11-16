import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '../supabaseClient';
import {getSelectedOrganizationId} from '../utils/organizationContext';
import {dialWebPhone,getVoipSnapshot,rejectOrHangupWebPhoneCall,useVoipState} from '../utils/voipStore';
import {toFaErrorMessage} from '../utils/errorMessageFa';
type Event={id:number;kind:'customer'|'assistant'|'operator_note'|'system';content:string;created_at:string};
export function useCustomerPhoneAi(){
 const [sessionId,setSessionId]=useState<string|null>(null);const [session,setSession]=useState<any>(null);const [events,setEvents]=useState<Event[]>([]);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const cursor=useRef(0);const polling=useRef(false);const phone=useVoipState();const monitoringCall=useRef<string|null>(null);
 const org=getSelectedOrganizationId();const generation=useRef(0);
 useEffect(()=>{generation.current++;setSessionId(null);setSession(null);setEvents([]);cursor.current=0;},[org]);
 const invoke=useCallback(async(body:any)=>{
  const result=await supabase.functions.invoke('voip-ai-session',{body,headers:org?{'x-organization-id':org}:{}});
  if(result.error||!result.data?.success)throw new Error(result.data?.message||'عملیات تماس هوشمند انجام نشد.');return result.data;
 },[org]);
 useEffect(()=>{
  if(!sessionId)return;let current=true;const poll=async()=>{
   if(polling.current)return;polling.current=true;
   try{const data=await invoke({action:'get',sessionId,after:cursor.current});if(!current)return;setSession(data.session);
    if(data.events?.length){cursor.current=Math.max(...data.events.map((item:Event)=>item.id),cursor.current);setEvents(previous=>[...previous,...data.events]);}
   }catch(cause){if(current)setError(toFaErrorMessage(cause,'دریافت وضعیت تماس انجام نشد.'));}finally{polling.current=false;}
  };void poll();const timer=window.setInterval(()=>void poll(),2000);return()=>{current=false;window.clearInterval(timer);};
 },[sessionId,invoke]);
 const start=async(number:string,purpose:string,models:Record<string,string>)=>{
  setBusy(true);setError('');
  const started=generation.current;
  try{const data=await invoke({action:'start',phone:number,purpose,models});if(started!==generation.current)return;cursor.current=0;setEvents([]);setSession({status:'queued'});setSessionId(data.sessionId);}
  catch(cause){setError(toFaErrorMessage(cause,'تماس آغاز نشد.'));}finally{setBusy(false);}
 };
 const listen=async()=>{
  if(!sessionId)return;setError('');setBusy(true);
  try{const data=await invoke({action:'listen',sessionId});await dialWebPhone(data.phone,{title:'شنیدن تماس پاسخ‌گوی هوشمند'});monitoringCall.current=getVoipSnapshot().activeCall?.callId||null;}
  catch(cause){setError(toFaErrorMessage(cause,'اتصال برای شنیدن تماس انجام نشد.'));}finally{setBusy(false);}
 };
 const note=async(text:string)=>{if(!sessionId)return;await invoke({action:'note',sessionId,note:text});};
 const cancel=async()=>{if(!sessionId)return;try{await invoke({action:'cancel',sessionId});setSession((previous:any)=>({...previous,status:'cancelled'}));if(monitoringCall.current&&getVoipSnapshot().activeCall?.callId===monitoringCall.current)await rejectOrHangupWebPhoneCall();monitoringCall.current=null;}catch(cause){setError(toFaErrorMessage(cause,'پایان تماس انجام نشد.'));}};
 return {session,events,error,busy,start,listen,note,cancel,canListen:session?.canListen&&!phone.activeCall,sessionId};
}
