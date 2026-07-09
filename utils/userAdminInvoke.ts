import { supabase } from '../supabaseClient';

const readFunctionErrorPayload = async (error: any) => {
  const context = error?.context;
  if (!context || typeof context.clone !== 'function') return null;
  try {
    return await context.clone().json();
  } catch {
    return null;
  }
};

export const invokeUserAdminFunction = async (body: Record<string, unknown>) => {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token || '';
  if (sessionError || !accessToken) {
    throw new Error('برای انجام این عملیات باید دوباره وارد شوید.');
  }

  const { data, error } = await supabase.functions.invoke('user-admin', {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    const payload = await readFunctionErrorPayload(error);
    const message = String(payload?.message || error?.message || 'عملیات کاربر ناموفق بود.').trim();
    const nextError: any = new Error(message);
    const reasonCode = String(payload?.reason_code || '').trim();
    if (reasonCode) nextError.code = reasonCode;
    throw nextError;
  }

  if (data?.success === false) {
    const nextError: any = new Error(String(data?.message || 'عملیات کاربر ناموفق بود.'));
    if (data?.reason_code) nextError.code = String(data.reason_code);
    throw nextError;
  }

  return data;
};
