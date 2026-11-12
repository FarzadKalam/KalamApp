import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { getSelectedOrganizationId } from '../utils/organizationContext';
import { fetchCurrentUserRoleContext } from '../utils/permissions';
import { installationRpc, type InstallationDetail } from '../utils/localInstallations';

export function useInstallationAccess() {
  const selectedOrg = getSelectedOrganizationId();
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    void supabase.auth.getSession().then(({ data }) => { if (current) setUserId(data.session?.user.id || null); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUserId(session?.user.id || null));
    return () => { current = false; data.subscription.unsubscribe(); };
  }, []);
  return useQuery({
    queryKey: ['local-installation-access', selectedOrg, userId], enabled: !!userId,
    queryFn: async () => {
      const context = await fetchCurrentUserRoleContext(supabase, { force: true });
      const access = await Promise.all(['view', 'build', 'export', 'cutover'].map(async action => {
        const { data, error } = await supabase.rpc('local_installation_can', { p_action: action });
        if (error) throw error;
        return [action, data === true] as const;
      }));
      return { orgId: context.orgId, userId, ...Object.fromEntries(access) } as { orgId: string | null; userId: string; view: boolean; build: boolean; export: boolean; cutover: boolean };
    }, staleTime: 30_000, retry: false,
  });
}
export function useInstallationDetail(id?: string) {
  const access = useInstallationAccess();
  const client = useQueryClient();
  const orgId = access.data?.orgId;
  const actorId = access.data?.userId;
  const query = useQuery({ queryKey: ['local-installation', orgId, actorId, id], enabled: !!orgId && !!actorId && !!id && access.data?.view === true,
    queryFn: () => installationRpc<InstallationDetail>('detail', id),
    refetchInterval: data => data?.jobs.some(j => ['queued', 'running'].includes(j.status)) ? 5000 : 30_000, retry: false });
  useEffect(() => {
    if (!orgId || !id || !access.data?.view) return;
    const channel = supabase.channel(`local-installation-${orgId}-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saas_local_jobs', filter: `org_id=eq.${orgId}` }, payload => {
        const row = (payload.new || payload.old) as { installation_id?: string };
        if (row.installation_id === id) void client.invalidateQueries({ queryKey: ['local-installation', orgId, actorId, id] });
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [orgId, actorId, id, access.data?.view, client]);
  return { ...query, access };
}
