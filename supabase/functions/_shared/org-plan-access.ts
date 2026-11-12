// Server-only access context: one source for overrides, purchases and expiry.
export async function loadOrgPlanAccess(url: string, key: string, orgId: string) {
  const denied = { available: false, features: {}, enabledModules: {}, moduleOverrides: {}, reason: 'plan_access_unavailable' };
  if (!orgId) return denied;
  try {
    const response = await fetch(`${url}/rest/v1/rpc/get_org_plan_access_context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_org_id: orgId }),
    });
    if (!response.ok) return denied;
    const context = await response.json();
    return context && typeof context === 'object' && typeof context.available === 'boolean' ? context : denied;
  } catch { return denied; }
}
