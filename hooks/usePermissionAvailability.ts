import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { fetchSessionBootstrap } from '../utils/sessionCache';

export type PermissionAvailability = { modules: Record<string, boolean>; features: Record<string, boolean> };
export const usePermissionAvailability = (orgId?: string | null) => {
  const [result, setResult] = useState<{ org: string; value: PermissionAvailability } | null>(null);
  const [failedOrg, setFailedOrg] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const session = await fetchSessionBootstrap(supabase);
      const org = session.orgId;
      if (!org || (orgId && orgId !== org)) return;
      const { data, error } = await supabase.rpc('current_org_permission_availability');
      if (!active) return;
      if (error || !data?.modules || !data?.features) { setFailedOrg(org); return; }
      setFailedOrg(null);
      setResult({ org, value: data as PermissionAvailability });
    };
    void load().catch(() => { if (active) setFailedOrg(orgId || 'current'); });
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load().catch(() => { if (active) setFailedOrg(orgId || 'current'); });
    }, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [orgId]);
  return {
    availability: result && (!orgId || result.org === orgId) ? result.value : null,
    error: failedOrg !== null && (!orgId || failedOrg === orgId),
  };
};
