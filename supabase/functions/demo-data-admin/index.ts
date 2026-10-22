// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';
import { getActiveBatch } from './_shared/demo-seed-batches.ts';
import { seedOrgDemoData } from './packs/index.ts';

type DemoDataAction = 'seed_org_demo_data' | 'clear_org_demo_data' | 'get_demo_seed_status';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, payload: Record<string, any>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const ALLOWED_DEMO_ROLES = new Set(['super_admin', 'admin', 'manager']);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeRole = (value?: string | null) => String(value || '').trim().toLowerCase();

const createServiceClient = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase function secrets are not configured.');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const getBearerToken = (request: Request) =>
  String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();

const verifyCaller = async (client: any, request: Request) => {
  const token = getBearerToken(request);
  if (!token) {
    throw new Error('درخواست احراز هویت نشده است.');
  }
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user?.id) {
    throw new Error('درخواست احراز هویت نشده است.');
  }
  return data.user;
};

const loadCallerProfile = async (client: any, callerUserId: string) => {
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('id, org_id, role, role_id, full_name, email, mobile_1, is_active')
    .eq('id', callerUserId)
    .maybeSingle();
  if (profileError) throw profileError;
  return profile || null;
};

const requireCallerOrgAccess = async (client: any, callerUserId: string, requestedOrgId?: string | null, action?: DemoDataAction) => {
  const normalizedRequestedOrgId = String(requestedOrgId || '').trim() || null;
  let profile: any = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    profile = await loadCallerProfile(client, callerUserId);
    if (profile?.id && (normalizedRequestedOrgId || profile?.org_id)) break;
    if (attempt < 3) {
      await sleep(350);
    }
  }

  if (!profile?.id || profile.is_active === false) {
    throw new Error('پروفایل کاربر یا سازمان جاری پیدا نشد.');
  }
  const targetOrgId = normalizedRequestedOrgId || String(profile.org_id || '').trim();
  if (!targetOrgId) throw new Error('سازمان جاری کاربر پیدا نشد.');
  const { data: membership, error: membershipError } = await client
    .from('user_organization_memberships')
    .select('org_id, role_id, software_role, is_owner, is_active')
    .eq('user_id', callerUserId).eq('org_id', targetOrgId).eq('is_active', true).maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) {
    throw new Error('عضویت فعال در سازمان درخواستی پیدا نشد.');
  }
  const isProfileOrg = String(profile.org_id || '') === targetOrgId;
  const effectiveRole = String(membership.software_role || (isProfileOrg ? profile.role : '') || '').trim();
  const effectiveRoleId = membership.role_id || (isProfileOrg ? profile.role_id : null);
  if (!ALLOWED_DEMO_ROLES.has(normalizeRole(effectiveRole)) && membership?.is_owner !== true) {
    throw new Error('دسترسی کافی برای مدیریت داده‌های دمو ندارید.');
  }
  if (effectiveRoleId) {
    const { data: role, error: roleError } = await client.from('org_roles')
      .select('permissions').eq('id', effectiveRoleId).eq('org_id', targetOrgId).maybeSingle();
    if (roleError || !role) throw new Error('نقش سازمانی کاربر معتبر نیست.');
    const permission = role.permissions?.__settings_tabs || {};
    if (permission.view === false || permission.fields?.account === false
      || (action !== 'get_demo_seed_status' && permission.edit === false)) {
      throw new Error('دسترسی کافی برای مدیریت داده‌های دمو ندارید.');
    }
  }

  const { data: saasSettings, error: saasError } = await client
    .from('saas_org_settings')
    .select('org_id, slug, is_demo')
    .eq('org_id', targetOrgId)
    .maybeSingle();
  if (saasError || !saasSettings?.org_id) {
    throw new Error('تنظیمات SaaS سازمان پیدا نشد.');
  }
  if (saasSettings.is_demo !== true && action === 'seed_org_demo_data') {
    throw new Error('داده‌های دمو فقط برای سازمان‌های دمو قابل مدیریت است.');
  }

  const { data: company, error: companyError } = await client
    .from('company_settings')
    .select('company_full_name, trade_name, email, mobile, brand_palette_key')
    .eq('org_id', targetOrgId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (companyError) throw companyError;

  // Industry belongs to the SaaS onboarding request, not company_settings.
  // Scope it to this organization so a user's other demos cannot affect the pack.
  const { data: onboarding, error: onboardingError } = await client
    .from('saas_onboarding_requests')
    .select('industry')
    .eq('org_id', targetOrgId)
    .eq('status', 'provisioned')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (onboardingError) throw onboardingError;

  return {
    profile: { ...profile, org_id: targetOrgId, role: effectiveRole, role_id: effectiveRoleId },
    saasSettings,
    company: company ? { ...company, industry: onboarding?.industry || null } : { industry: onboarding?.industry || null },
  };
};

const clearSeededDemoData = async (client: any, caller: any, context: any) => {
  const { data, error } = await client.rpc('clear_demo_seed_batches', {
    p_org_id: String(context.profile.org_id), p_user_id: caller.id,
  });
  if (error) throw error;
  return data;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const client = createServiceClient();
    const caller = await verifyCaller(client, request);
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || '').trim() as DemoDataAction;
    const requestedOrgId = String(body?.org_id || '').trim() || null;
    const context = await requireCallerOrgAccess(client, caller.id, requestedOrgId, action);

    if (action === 'get_demo_seed_status') {
      const activeBatch = await getActiveBatch(client, String(context.profile.org_id));
      return json(200, {
        success: true,
        is_demo: context.saasSettings.is_demo === true,
        slug: context.saasSettings?.slug || null,
        has_seeded_batch: !!activeBatch?.id,
        batch_id: activeBatch?.id || null,
        status: activeBatch?.status || null,
        seeded_records_count: Number(activeBatch?.seeded_records_count || 0),
        pack_key: activeBatch?.pack_key || null,
      });
    }

    if (action === 'seed_org_demo_data') {
      const result = await seedOrgDemoData(client, caller, context);
      return json(200, {
        ...result,
        is_demo: context.saasSettings.is_demo === true,
        slug: context.saasSettings?.slug || null,
      });
    }

    if (action === 'clear_org_demo_data') {
      const result = await clearSeededDemoData(client, caller, context);
      return json(200, {
        ...result,
        is_demo: context.saasSettings.is_demo === true,
        slug: context.saasSettings?.slug || null,
      });
    }

    return json(400, {
      success: false,
      message: 'action نامعتبر است.',
    });
  } catch (error) {
    return json(400, {
      success: false,
      message: String(error?.message || error || 'اجرای سرویس داده دمو ناموفق بود.'),
    });
  }
});
