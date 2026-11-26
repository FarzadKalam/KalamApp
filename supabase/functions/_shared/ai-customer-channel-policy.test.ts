import {describe, it, expect} from 'vitest';
import {normalizeCustomerChannelPolicy, assertCustomerChannelPolicyReferences, assertCustomerTelephoneAdmission, createCustomerConsultationGate} from './ai-customer-channel-policy';
const accountId='10000000-0000-4000-8000-000000000001';
const policy=()=>normalizeCustomerChannelPolicy({telephone:{enabled:true,accountId,triggers:['workflow']}},['sales_leads','customer_response']);
describe('customer channel execution policy',()=>{
  it('defaults to no calls, no consultation and no implicit organization knowledge',()=>{
    const p=normalizeCustomerChannelPolicy(null,[]);
    expect(p.telephone.enabled).toBe(false);expect(p.telephone.triggers).toEqual([]);
    expect(p.instructionIds).toEqual([]);expect(p.documentIds).toEqual([]);expect(p.consultation.enabled).toBe(false);
  });
  it('cannot enable unsafe mutations, voice PIN capture or recursive consultation through JSON',()=>{
    const p=normalizeCustomerChannelPolicy({telephone:{mutations:'auto',sensitiveAccess:'caller_id'},consultation:{agentKeys:['customer_response','sales_leads','fake']}},['sales_leads','customer_response']);
    expect(p.telephone.mutations).toBe('human_approval');expect(p.telephone.sensitiveAccess).toBe('dtmf_pin');
    expect(p.consultation.agentKeys).toEqual(['sales_leads']);
  });
  it('rejects deleted, cross-organization and inaccessible resource/account references',()=>{
    expect(()=>assertCustomerChannelPolicyReferences(policy(),{instructionIds:[],documentIds:[],accountIds:[],agentKeys:[]})).toThrow();
    const p=policy();p.documentIds=[accountId];
    expect(()=>assertCustomerChannelPolicyReferences(p,{instructionIds:[],documentIds:[],accountIds:[accountId],agentKeys:[]})).toThrow();
  });
  it('requires current plan, active agent, approved trigger, organization and available budget together',()=>{
    const input={policy:policy(),orgId:'org',routeOrgId:'org',accountId,agentEnabled:true,planAllowed:true,trigger:'workflow',approved:true,usedTodayIrt:0};
    expect(()=>assertCustomerTelephoneAdmission(input)).not.toThrow();
    for(const patch of [{routeOrgId:'other'},{planAllowed:false},{approved:false},{trigger:'raw_model_request'},{agentEnabled:false},{usedTodayIrt:30000},{usedTodayIrt:NaN}]) {
      expect(()=>assertCustomerTelephoneAdmission({...input,...patch})).toThrow();
    }
  });
  it('reserves consultation limits synchronously before concurrent work and blocks when disabled',()=>{
    const gate=createCustomerConsultationGate({enabled:true,agentKeys:['sales_leads'],maxCalls:2,maxCostIrt:100,timeoutMs:1000});
    expect(gate.reserve('sales_leads',60).timeoutMs).toBe(1000);
    expect(()=>gate.reserve('sales_leads',60)).toThrow();
    gate.reserve('sales_leads',40);expect(()=>gate.reserve('sales_leads',1)).toThrow();
    expect(gate.snapshot()).toEqual({calls:2,reservedIrt:100});
    expect(()=>createCustomerConsultationGate({...policy().consultation,enabled:false}).reserve('sales_leads',1)).toThrow();
  });
});


