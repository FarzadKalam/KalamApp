import { supabase } from '../supabaseClient';
import { toFaErrorMessage } from './errorMessageFa';

export type OrgSaasStatus = {
  status: string | null;
  is_demo: boolean;
  is_readonly: boolean;
  trial_ends_at: string | null;
  plan_code: string | null;
  slug: string | null;
};

export const getOrgSaasStatus = async (): Promise<OrgSaasStatus | null> => {
  try {
    const { data, error } = await supabase.rpc('get_current_org_saas_status');
    if (error || !data || typeof data !== 'object') return null;
    return data as OrgSaasStatus;
  } catch {
    return null;
  }
};

export const requestTrialRenewal = async (notes?: string): Promise<{ success: boolean; message: string; already_exists?: boolean }> => {
  try {
    const { data, error } = await supabase.rpc('tenant_request_trial_renewal', { p_notes: notes ?? null });
    if (error) throw error;
    return data as { success: boolean; message: string; already_exists?: boolean };
  } catch (err) {
    return { success: false, message: toFaErrorMessage(err as any, 'ثبت درخواست تمدید ناموفق بود.') };
  }
};

export const resolveTrialDaysLeft = (trialEndsAt: string | null): number | null => {
  if (!trialEndsAt) return null;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};
