import {useEffect,useRef} from 'react';
import {useDocumentVisible} from './useDocumentVisible';
import {useOptionalNotificationRuntime} from '../components/notifications/NotificationRuntimeProvider';
import {isCompletedAiResponse} from '../utils/aiNotifications';

/** Reading is acknowledged only for a visible, loaded conversation, never its navigation link. */
export function useAiConversationRead(threadId:string|null,messages:readonly any[],active:boolean){
 const runtime=useOptionalNotificationRuntime();
 const visible=useDocumentVisible();
 const acknowledged=useRef('');
 useEffect(()=>{
  if(!active||!visible||!threadId)return;
  const complete=messages.filter(isCompletedAiResponse).filter(row=>/^[a-f0-9-]{36}$/i.test(String(row.id||'')));
  const ids=new Set(complete.map(row=>String(row.id)));
  const notified=runtime.ai.items.find(row=>row.thread_id===threadId&&ids.has(row.source_id));
  const latest=notified||[...complete].sort((a,b)=>String(b.notification_ready_at||b.created_at||'').localeCompare(String(a.notification_ready_at||a.created_at||'')))[0];
  const sourceId=String(latest?.source_id||latest?.id||'');if(!sourceId)return;
  const signature=threadId+':'+sourceId+':'+String(latest?.notification_ready_at||latest?.created_at||'');if(acknowledged.current===signature)return;
  const timer=setTimeout(()=>{void runtime.markAiRead('thread:'+threadId,'ai_message',sourceId).then(saved=>{if(saved)acknowledged.current=signature;});},200);
  return()=>clearTimeout(timer);
 },[active,visible,threadId,messages,runtime.ai.items,runtime.markAiRead]);
}
