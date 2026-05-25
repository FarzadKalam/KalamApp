import { supabase } from '../supabaseClient';

export type SaasUserSeverity = 'critical' | 'repair_required' | 'warning' | 'healthy';

export type SaasAdminUserRow = {
  id: string;
  profile_exists: boolean;
  auth_exists: boolean;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  org_id: string | null;
  org_name: string | null;
  org_slug: string | null;
  role_id: string | null;
  role_title: string | null;
  software_role: string | null;
  is_active: boolean;
  is_demo: boolean;
  phone_confirmed: boolean;
  audit_status: SaasUserSeverity;
  issues: string;
};

export type SaasUserDirectory = {
  organizations: Array<{ value: string; label: string; slug?: string | null; is_demo?: boolean }>;
  roles: Array<{ value: string; label: string; org_id: string | null }>;
};

export type SaasUserMatchCandidate = {
  userId: string;
  fullName: string | null;
  email: string | null;
  mobile: string | null;
  orgId: string | null;
  isActive: boolean;
};

export const invokeSaasUserAdmin = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke('user-admin', { body });
  if (error) throw error;
  if (data?.success === false) throw new Error(String(data?.message || 'عملیات کاربر ناموفق بود.'));
  return data;
};

export const fetchSaasUserDirectory = async (): Promise<SaasUserDirectory> => {
  const { data, error } = await supabase.rpc('admin_saas_user_directory_options');
  if (error) throw error;
  return {
    organizations: Array.isArray(data?.organizations) ? data.organizations : [],
    roles: Array.isArray(data?.roles) ? data.roles : [],
  };
};
