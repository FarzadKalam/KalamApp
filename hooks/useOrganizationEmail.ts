import { useEffect, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { fetchSessionBootstrap } from '../utils/sessionCache';
import { EmailAccount, invokeEmail, listEmailMessages } from '../utils/organizationEmail';

export function useOrganizationEmail(folder: string) {
  const [identity, setIdentity] = useState<{ org: string; user: string } | null>(null);
  const client = useQueryClient();
  useEffect(() => {
    let alive = true;
    void fetchSessionBootstrap(supabase).then(ctx => { if (alive && ctx.orgId && ctx.user?.id) setIdentity({ org: ctx.orgId, user: ctx.user.id }); });
    return () => { alive = false; };
  }, []);
  const key = ['organization-email', identity?.org, identity?.user];
  const mails = useInfiniteQuery({ queryKey: [...key, 'messages', folder], enabled: Boolean(identity), cacheTime: 0, staleTime: 15000,
    queryFn: ({ pageParam }) => listEmailMessages(folder, pageParam), getNextPageParam: page => page.length === 40 ? page[page.length - 1] : undefined });
  const accounts = useQuery<EmailAccount[]>({ queryKey: [...key, 'accounts'], enabled: Boolean(identity), cacheTime: 0, staleTime: 15000,
    queryFn: async () => (await invokeEmail('email-admin', { action: 'accounts' })).accounts });
  const sendAccess = useQuery({ queryKey: [...key, 'send-access'], enabled: Boolean(identity), cacheTime: 0, staleTime: 15000,
    queryFn: async () => { const { data, error } = await supabase.rpc('email_can_access', { p_action: 'send' }); return !error && data === true; } });
  useEffect(() => {
    if (!identity) return;
    const refresh = () => { void client.invalidateQueries({ queryKey: ['organization-email', identity.org, identity.user] }); };
    const channel = supabase.channel(`email-workspace-${identity.org}-${identity.user}`).on('postgres_changes', { event: '*', schema: 'public', table: 'email_messages', filter: `org_id=eq.${identity.org}` }, refresh).on('postgres_changes', { event: '*', schema: 'public', table: 'email_message_receipts', filter: `org_id=eq.${identity.org}` }, refresh).subscribe();
    window.addEventListener('organization-email-changed', refresh);
    return () => { window.removeEventListener('organization-email-changed', refresh); void supabase.removeChannel(channel); };
  }, [client, identity]);
  return { identity, canSend: sendAccess.data === true, rows: mails.data?.pages.flat() || [], accounts: accounts.data || [], error: mails.error || accounts.error,
    busy: mails.isFetching || accounts.isFetching, hasMore: mails.hasNextPage, more: mails.fetchNextPage,
    refresh: async () => { await Promise.all([mails.refetch(), accounts.refetch()]); } };
}
