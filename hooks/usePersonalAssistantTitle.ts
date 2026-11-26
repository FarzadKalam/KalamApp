import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { getSelectedOrganizationId } from '../utils/organizationContext';
import { fetchSessionBootstrap } from '../utils/sessionCache';
import { personalAssistantTitle } from '../supabase/functions/_shared/ai-personal-assistant';

export function usePersonalAssistantTitle() {
  const orgId = getSelectedOrganizationId();
  const [identity, setIdentity] = useState<{ orgId: string | null; title: string }>();
  useEffect(() => {
    let current = true;
    void fetchSessionBootstrap(supabase).then(({ profile }) => {
      if (current) setIdentity({ orgId, title: personalAssistantTitle(profile?.role_name, profile?.role) });
    }).catch(() => {});
    return () => { current = false; };
  }, [orgId]);
  return identity?.orgId === orgId ? identity.title : personalAssistantTitle(null);
}
