import { supabase } from '../supabaseClient';
import { clearOrganizationContext } from './organizationContext';
import { clearSessionBootstrapCache } from './sessionCache';

export const signOutLocalSession = async () => {
  clearOrganizationContext();
  clearSessionBootstrapCache();
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // ignore local cleanup failures
  }
};
