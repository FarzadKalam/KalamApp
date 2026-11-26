export const isSaasWorkflowSource = (moduleId: string) =>
  ['saas_orgs', 'saas_demo_requests', 'saas_users'].includes(moduleId);

export const saasWorkflowRelationField = (moduleId: string) =>
  moduleId === 'saas_orgs' ? 'saas_tenant_org_id' : moduleId === 'saas_demo_requests' ? 'saas_demo_request_id' : null;

export const readSaasWorkflowSource = async (
  rpc: (name: string, args: Record<string, unknown>) => Promise<any>,
  input: { orgId: string; actorUserId: string | null; moduleId: string; recordId?: string; limit?: number; offset?: number },
) => {
  if (!isSaasWorkflowSource(input.moduleId) || !input.actorUserId) throw new Error('دسترسی مبدأ گردش کار SaaS تأیید نشد.');
  const result = await rpc('read_saas_workflow_source', {
    p_provider_org_id: input.orgId, p_actor_user_id: input.actorUserId,
    p_module_id: input.moduleId, p_record_id: input.recordId || null,
    p_limit: Math.min(200, Math.max(1, input.limit || 100)), p_offset: Math.max(0, input.offset || 0),
  });
  if (!Array.isArray(result)) throw new Error('پاسخ مبدأ گردش کار SaaS معتبر نیست.');
  return result;
};
