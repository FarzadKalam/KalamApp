import {expect,it} from 'vitest';
import {aiNotificationHref,isCompletedAiResponse,normalizeAiNotifications} from './aiNotifications';
it('uses exact aggregate totals even when only a preview page is published',()=>{
 const data=normalizeAiNotifications({total:420,agentNoteTotal:7,communicationAgentNoteTotal:5,byAgent:{sales_leads:32,invalid:-1},items:[]});
 expect(data.total).toBe(420);expect(data.byAgent.sales_leads).toBe(32);expect(data.byAgent.invalid).toBe(0);
 expect(data.communicationAgentNoteTotal).toBe(5);
});
it('links an AI response to its own conversation and a reminder to the agent inbox',()=>{
 expect(aiNotificationHref({thread_id:'thread',agent_key:'sales_leads'})).toBe('/ai?thread=thread');
 expect(aiNotificationHref({thread_id:null,agent_key:'sales_leads'})).toBe('/ai?inbox=1&agent=sales_leads');
 expect(isCompletedAiResponse({role:'assistant',content:'partial',metadata:{pending_status:true}})).toBe(false);
 expect(isCompletedAiResponse({role:'assistant',content:'complete'})).toBe(true);
});
