const url = String(process.env.DEPLOY_SUPABASE_URL || '').replace(/\/+$/, '');
const token = String(process.env.DEPLOY_SUPABASE_ANON_KEY || '');
if (!url || !token) throw new Error('Missing condition runtime smoke-test configuration');

const headers = { apikey: token, authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const cases = [
  ['rest/v1/rpc/record_scope_condition_matches', {
    p_record: { entries: [{ amount: 10 }, { amount: 20, deleted: true }] },
    p_condition: { field: 'entries', operator: 'table_all', value: [{ field: 'amount', operator: 'eq', value: 10 }] },
  }, [401, 403], (data) => data?.code === '42501'],
  ['functions/v1/goal-progress', { items: [] }, 200, (data) => !!data?.items && !Object.keys(data.items).length],
  ['functions/v1/report-runtime', {}, 400, (data) => data?.error === 'invalid_report'],
  ['functions/v1/workflow-interval-runner', {}, 401, (data) =>
    data?.error === 'Unauthorized' && data?.build === 'workflow-interval-runner-2026-11-22-table-conditions'],
];

for (const [path, params, status, accepts] of cases) {
  const response = await fetch(`${url}/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json().catch(() => null);
  if (![status].flat().includes(response.status) || !accepts(data)) throw new Error(`${path}: unexpected HTTP ${response.status} or response shape`);
  console.log(`Verified ${path}`);
}
