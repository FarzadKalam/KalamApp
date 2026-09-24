import { isTenantHost } from './hostRouting';
import { fetchSessionBootstrap } from './sessionCache';

export type TenantHostSessionAccess =
  | { status: 'allowed' }
  | { status: 'denied' }
  | { status: 'unverified' };

const normalizeHostname = (value: unknown) => String(value || '').trim().toLowerCase();

const resolveRpcRow = (data: unknown): Record<string, any> | null => {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === 'object' ? row as Record<string, any> : null;
};

/**
 * روی زیردامنهٔ اختصاصی، هویت نشست باید دقیقاً متعلق به همان سازمان باشد.
 * این کنترل جدا از RLS است تا دادهٔ درستِ یک حساب هرگز زیر برند سازمان دیگری
 * نمایش داده نشود. خطاهای شبکه عمداً «مجاز» تلقی نمی‌شوند.
 */
export const validateTenantHostSessionAccess = async (
  supabaseClient: any,
  options?: { hostname?: string },
): Promise<TenantHostSessionAccess> => {
  const hostname = normalizeHostname(
    options?.hostname ?? (typeof window !== 'undefined' ? window.location.hostname : ''),
  );

  if (!isTenantHost(hostname)) return { status: 'allowed' };

  const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError) return { status: 'unverified' };
  if (!sessionData?.session?.user?.id) return { status: 'allowed' };

  const [sessionSnapshot, brandingResult] = await Promise.all([
    fetchSessionBootstrap(supabaseClient, { force: true }),
    supabaseClient.rpc('get_public_branding', { p_hostname: hostname }),
  ]);

  if (sessionSnapshot.bootstrapError || brandingResult?.error) {
    return { status: 'unverified' };
  }

  const expectedOrgId = String(resolveRpcRow(brandingResult?.data)?.org_id || '').trim();
  const activeOrgId = String(sessionSnapshot.orgId || '').trim();
  if (!expectedOrgId) return { status: 'unverified' };
  if (!activeOrgId || activeOrgId !== expectedOrgId) return { status: 'denied' };

  return { status: 'allowed' };
};
