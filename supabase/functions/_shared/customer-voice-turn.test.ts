import {beforeEach,expect,it,vi} from 'vitest';
import {runCustomerVoiceTurn} from './customer-voice-turn';
const grounding=vi.hoisted(()=>({agentStates:{customer_response:{canUse:true,config:{policy_json:{voice_instructions:'راهنمای تماس',voice_instruction_ids:['safe-instruction']}}}},instructions:[{id:'safe-instruction',content:'منبع مجاز'},{id:'private',content:'نباید دیده شود'}],company:{name:'سازمان'}}));
vi.mock('./ai-grounding.ts',()=>({loadCentralAiGrounding:vi.fn(async()=>grounding)}));
let status='active';let spent=0;
const deps=()=>({loadPlan:vi.fn(async()=>({available:true})),read:vi.fn(async(_u:string,_k:string,table:string,params:any)=>{
 expect(params.org_id).toBe('eq.org-a');
 if(table==='voip_ai_sessions')return [{id:'session',status,created_at:new Date().toISOString(),max_duration_seconds:180,model_overrides:{dashboard_chat:'model-chat'}}];
 if(table==='org_ai_usage_ledger')return [{billed_amount_irt:spent}];return [];
}),insert:vi.fn(async()=>[]),provider:vi.fn(async()=>({orgAiSettings:{}})),transcribe:vi.fn(async()=>({transcript:'درخواست مخاطب'})),chat:vi.fn(async(_config:any,_messages:any[],_options:any)=>({content:'پاسخ فارسی',model:'model-chat'})),speak:vi.fn(async()=>({bytes:new Uint8Array([1,2,3]),contentType:'audio/wav'})),ledger:vi.fn(async()=>({})),assertCapability:vi.fn(async()=>{})});
beforeEach(()=>{status='active';spent=0;grounding.agentStates.customer_response.canUse=true;});
it('does not call a model for an ended call, revoked agent or exhausted budget',async()=>{
 for(const denied of ['ended','agent','budget']){
  status=denied==='ended'?'completed':'active';grounding.agentStates.customer_response.canUse=denied!=='agent';spent=denied==='budget'?5000:0;
  const tools=deps();await expect(runCustomerVoiceTurn('url','key',{orgId:'org-a',userId:'owner'},{sessionId:'session'},tools)).rejects.toThrow();expect(tools.chat).not.toHaveBeenCalled();
 }
});
it('uses customer agent policy and only selected instructions, with all three stages centrally billed',async()=>{
 const tools=deps();const result=await runCustomerVoiceTurn('url','key',{orgId:'org-a',userId:'owner'},{sessionId:'session',audio:{data:'AQID'}},tools);
 expect(result).toMatchObject({success:true,text:'پاسخ فارسی',audioBase64:'AQID'});
 const prompt=JSON.stringify(tools.chat.mock.calls[0]);expect(prompt).toContain('راهنمای تماس');expect(prompt).toContain('منبع مجاز');expect(prompt).not.toContain('نباید دیده شود');
 expect(tools.ledger).toHaveBeenCalledTimes(3);expect(tools.assertCapability).toHaveBeenCalledTimes(3);
 const options=tools.chat.mock.calls[0][2];expect(options).not.toHaveProperty('tools');
 expect(tools.read).toHaveBeenCalledWith('url','key','voip_ai_sessions',expect.objectContaining({requested_by:'eq.owner'}));
});
