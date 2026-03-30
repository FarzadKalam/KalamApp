import { supabase } from '../supabaseClient';

type LoginMethod = 'password' | 'otp';

export const trackSuccessfulLogin = async (loginMethod: LoginMethod) => {
  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, org_id')
      .eq('id', userId)
      .maybeSingle();

    if (!profile?.id) return;

    await supabase.from('user_login_events').insert([
      {
        org_id: profile.org_id || null,
        user_id: profile.id,
        login_method: loginMethod,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      },
    ]);
  } catch (error) {
    console.warn('Could not track login event', error);
  }
};
