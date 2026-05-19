import { supabase } from '../supabaseClient';

export const signOutLocalSession = async () => {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // ignore local cleanup failures
  }
};
