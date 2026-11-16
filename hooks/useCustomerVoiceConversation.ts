import {useEffect,useRef,useState} from 'react';
import {supabase} from '../supabaseClient';
import {blobToBase64} from '../utils/blobBase64';
import {getSelectedOrganizationId} from '../utils/organizationContext';
import {toFaErrorMessage} from '../utils/errorMessageFa';
export type CustomerVoiceMessage={role:'user'|'assistant';text:string};
export function useCustomerVoiceConversation(models:Record<string,string>){
 const [state,setState]=useState<'idle'|'listening'|'thinking'|'speaking'>('idle');const [error,setError]=useState('');
 const [messages,setMessages]=useState<CustomerVoiceMessage[]>([]);const [threadId,setThreadId]=useState<string|null>(null);const [approval,setApproval]=useState<any>(null);
 const engine=useRef<{stream:MediaStream;context:AudioContext;recorder:MediaRecorder|null;audio:HTMLAudioElement|null;timer:number;controller:AbortController;stopped:boolean}|null>(null);
 const settings=useRef(models);settings.current=models;const notes=useRef<string[]>([]);const thread=useRef<string|null>(null);
 const generation=useRef(0);
 const org=getSelectedOrganizationId();
 const stop=()=>{
  const current=engine.current;engine.current=null;
  generation.current++;
  if(current){current.stopped=true;current.controller.abort();window.clearInterval(current.timer);current.audio?.pause();current.stream.getTracks().forEach(track=>track.stop());if(current.recorder?.state==='recording')current.recorder.stop();void current.context.close();}
  setState('idle');
 };
 useEffect(()=>()=>stop(),[org]);
 const addNote=(value:string)=>{const text=value.trim().slice(0,2000);if(text)notes.current.push(text);};
 const start=async()=>{
  stop();setError('');setMessages([]);setThreadId(null);setApproval(null);thread.current=null;notes.current=[];
  try{
   const startedGeneration=generation.current;
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
   if(startedGeneration!==generation.current){stream.getTracks().forEach(track=>track.stop());return;}
   const context=new AudioContext();await context.resume();const source=context.createMediaStreamSource(stream);const analyser=context.createAnalyser();analyser.fftSize=1024;source.connect(analyser);
   if(startedGeneration!==generation.current){stream.getTracks().forEach(track=>track.stop());void context.close();return;}
   const current={stream,context,recorder:null as MediaRecorder|null,audio:null as HTMLAudioElement|null,timer:0,controller:new AbortController(),stopped:false};engine.current=current;
   const orgId=getSelectedOrganizationId();const invoke=async(body:any)=>{
    const result=await supabase.functions.invoke('ai-assistant',{body,headers:orgId?{'x-organization-id':orgId}:{},signal:current.controller.signal});
    if(current.stopped||engine.current!==current)throw new DOMException('Stopped','AbortError');
    if(result.error||!result.data?.success)throw new Error(result.data?.message||'پاسخ‌گویی صوتی انجام نشد.');return result.data;
   };
   let processing=false;let voiceStarted=0;let lastVoice=0;let recordingStarted=0;let chunks:Blob[]=[];
   const record=()=>{
    if(current.stopped)return;chunks=[];voiceStarted=0;lastVoice=0;recordingStarted=Date.now();
    const mime=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
    const recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);current.recorder=recorder;
    recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
    recorder.onstop=()=>{
     if(current.stopped||!voiceStarted||processing)return;
     const blob=new Blob(chunks,{type:recorder.mimeType});chunks=[];processing=true;setState('thinking');
     void (async()=>{
      const speech=await invoke({action:'transcribe_voice',context:{route:'/contact-center',mode:'page'},audio:{data:await blobToBase64(blob),mimeType:blob.type,filename:blob.type.includes('mp4')?'voice.m4a':'voice.webm',durationMs:Date.now()-recordingStarted},modelOverride:settings.current.voice_input||undefined});
      const text=String(speech.transcript||'').trim();if(!text)return;
      setMessages(previous=>[...previous,{role:'user',text}]);
      const queuedNotes=notes.current.splice(0);const prompt=['این گفتگو یک آزمایش تماس صوتی فارسی با اپراتور مجاز سازمان است. دستورالعمل اختصاصی صوت را رعایت کن؛ کوتاه و طبیعی جواب بده و از تکرار خوشامدگویی خودداری کن.',queuedNotes.length?'یادداشت خصوصی اپراتور برای این نوبت: '+queuedNotes.join('\n'):'','گفتهٔ گوینده: '+text].filter(Boolean).join('\n');
      const reply=await invoke({action:'chat',capability:'dashboard_chat',capabilities:[],agents:['customer_response'],context:{route:'/contact-center',mode:'page'},message:prompt,inputKind:'voice',threadId:thread.current,forceNewThread:!thread.current,modelOverride:settings.current.dashboard_chat||undefined});
      thread.current=reply.threadId||thread.current;setThreadId(thread.current);
      const answer=String(reply.answer||reply.message||'').trim();if(!answer)throw new Error('پاسخ متنی دریافت نشد.');
      setMessages(previous=>[...previous,{role:'assistant',text:answer}]);
      if(reply.proposedAction)setApproval({...reply.proposedAction,thread_id:thread.current});
      const output=await invoke({action:'generate_voice_output',text:answer,threadId:thread.current,context:{route:'/contact-center',mode:'page'},modelOverride:settings.current.voice_output||undefined,settings:{language:'fa-IR',responseFormat:'mp3'}});
      const url=String(output.file?.url||'');if(!url)throw new Error('فایل صوت پاسخ در دسترس نیست.');
      await new Promise<void>((resolve,reject)=>{
       const audio=new Audio(url);current.audio=audio;audio.onended=()=>resolve();audio.onerror=()=>reject(new Error('پخش پاسخ صوتی انجام نشد.'));setState('speaking');void audio.play().catch(reject);
       current.controller.signal.addEventListener('abort',()=>{audio.pause();resolve();},{once:true});
      });
     })().catch(cause=>{if(!current.stopped){setError(toFaErrorMessage(cause,'گفتگوی صوتی انجام نشد.'));stop();}}).finally(()=>{
      processing=false;if(!current.stopped){setState('listening');record();}
     });
    };
    recorder.start();setState('listening');
   };
   const samples=new Uint8Array(analyser.fftSize);
   current.timer=window.setInterval(()=>{
    if(current.stopped||processing||current.recorder?.state!=='recording')return;
    analyser.getByteTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((sum,value)=>sum+((value-128)/128)**2,0)/samples.length);const now=Date.now();
    if(rms>0.018){voiceStarted||=now;lastVoice=now;}
    if(voiceStarted&&(now-lastVoice>850||now-voiceStarted>12000)){current.recorder.stop();}
    else if(!voiceStarted&&now-recordingStarted>15000){current.recorder.onstop=null;current.recorder.stop();record();}
   },100);record();
  }catch(cause){stop();setError(toFaErrorMessage(cause,'دسترسی به میکروفون یا آغاز گفتگو ممکن نشد.'));}
 };
 return {state,error,messages,threadId,approval,setApproval,start,stop,addNote};
}
