import { supabase } from '../supabaseClient';
import { clearOrganizationContext } from './organizationContext';
import { clearSessionBootstrapCache } from './sessionCache';
import { useEmailComposerStore } from './emailComposerStore';

export const signOutLocalSession = async () => {
  useEmailComposerStore.getState().close();
  clearOrganizationContext();
  clearSessionBootstrapCache();
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // ignore local cleanup failures
  }
};
