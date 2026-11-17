import { describe, expect, it, vi } from 'vitest';
import { readSaasWorkflowSource, saasWorkflowRelationField } from './saas-workflow-source';
describe('SaaS workflow source adapter', () => {
  it('sends provider and actor context instead of filtering customers by the provider tenant', async () => {
    const rpc = vi.fn(async () => [{ id: 'customer-org', org_id: 'provider' }]);
    expect(await readSaasWorkflowSource(rpc, { orgId:'provider', actorUserId:'operator', moduleId:'saas_orgs', offset:200, limit:200 })).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith('read_saas_workflow_source', expect.objectContaining({ p_provider_org_id:'provider',p_actor_user_id:'operator',p_offset:200,p_limit:200 }));
    expect(saasWorkflowRelationField('saas_orgs')).toBe('saas_tenant_org_id');
  });
  it('rejects missing actors, unsupported sources and malformed RPC responses', async () => {
    const rpc=vi.fn(async () => ({}));
    await expect(readSaasWorkflowSource(rpc,{orgId:'p',actorUserId:null,moduleId:'saas_orgs'})).rejects.toThrow();
    await expect(readSaasWorkflowSource(rpc,{orgId:'p',actorUserId:'a',moduleId:'customers'})).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
    await expect(readSaasWorkflowSource(rpc,{orgId:'p',actorUserId:'a',moduleId:'saas_orgs'})).rejects.toThrow();
  });
});
