import { resolveDemoPack } from './demo-seed-runtime.ts';
export const getActiveBatch = async (client: any, orgId: string) => {
  const { data, error } = await client
    .from('demo_seed_batches')
    .select('id, status, seeded_records_count, pack_key, created_at, cleared_at')
    .eq('org_id', orgId)
    .neq('status', 'cleared')
    .is('cleared_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

export const createBatch = async (client: any, orgId: string, callerUserId: string, metadata: Record<string, any>) => {
  const pack = resolveDemoPack(metadata.industry);
  const { data, error } = await client.rpc('begin_demo_seed_batch', {
    p_org_id: orgId, p_user_id: callerUserId, p_pack_key: pack.key, p_industry: metadata.industry || null,
  });
  if (error || !data) throw error || new Error('ساخت داده‌های نمونه آغاز نشد.');
  return String(data);
};

export const markBatchStatus = async (client: any, batchId: string, patch: Record<string, any>) => {
  const { error } = await client.from('demo_seed_batches').update(patch).eq('id', batchId);
  if (error) throw error;
};
