import {getAgentTitleFa} from './aiAgentCatalog';
export type AiNotificationEvent={source_type:'ai_message'|'note';source_id:string;conversation_key:string;thread_id:string|null;agent_key:string|null;title:string;content:string;created_at:string};
export type AiNotificationSnapshot={total:number;agentNoteTotal:number;communicationAgentNoteTotal:number;alertAgentNoteTotal:number;byAgent:Record<string,number>;byConversation:Record<string,number>;items:AiNotificationEvent[]};
export const EMPTY_AI_NOTIFICATIONS:AiNotificationSnapshot={total:0,agentNoteTotal:0,communicationAgentNoteTotal:0,alertAgentNoteTotal:0,byAgent:{},byConversation:{},items:[]};
const count=(value:unknown)=>Number.isFinite(Number(value))?Math.max(0,Math.floor(Number(value))):0;
const counts=(value:any):Record<string,number>=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).map(([key,value])=>[key,count(value)])):{};
export const normalizeAiNotifications=(value:any):AiNotificationSnapshot=>({
 total:count(value?.total),agentNoteTotal:count(value?.agentNoteTotal),communicationAgentNoteTotal:count(value?.communicationAgentNoteTotal),alertAgentNoteTotal:count(value?.alertAgentNoteTotal),byAgent:counts(value?.byAgent),byConversation:counts(value?.byConversation),
 items:Array.isArray(value?.items)?value.items.filter((row:any)=>row?.source_type==='ai_message'&&row.source_id&&row.thread_id&&row.conversation_key).slice(0,20):[],
});
export const isCompletedAiResponse=(row:any)=>row?.role==='assistant'&&String(row?.content||'').trim()&&
 !['failed','pending_status','streaming','stopped','incomplete','internal_agent_step','internal_agent_input'].some(key=>row?.metadata?.[key]===true)&&row?.metadata?.status!=='failed';
export const aiNotificationHref=(row:Pick<AiNotificationEvent,'thread_id'|'agent_key'>)=>row.thread_id?'/ai?thread='+encodeURIComponent(row.thread_id):'/ai?inbox=1&agent='+encodeURIComponent(row.agent_key||'lead_orchestrator');
export const aiNotificationTitle=(row:AiNotificationEvent)=>row.agent_key?getAgentTitleFa(row.agent_key):'پاسخ هوش مصنوعی آماده شد';
