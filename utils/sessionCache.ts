import { runSelectWithCompatibleColumns } from './selectCompat';
import { normalizePublicAssetUrl } from './assetUrl';
import { attachAbortSignalIfSupported, runWithSupabaseTimeout } from './supabaseTimeout';

type SessionBootstrapSnapshot = {
  user: any | null;
  profile: any | null;
  roleId: string | null;
  orgId: string | null;
  permissions: Record<string, any> | null;
  loadedAt: number;
  bootstrapError?: any;
};

const AUTH_USER_TTL_MS = 60_000;
const SESSION_BOOTSTRAP_TTL_MS = 5 * 60_000;
const SESSION_BOOTSTRAP_REQUEST_TIMEOUT_MS = 12_000;

const EMPTY_SNAPSHOT: SessionBootstrapSnapshot = {
  user: null,
  profile: null,
  roleId: null,
  orgId: null,
  permissions: null,
  loadedAt: 0,
};

const SESSION_PROFILE_COLUMNS = [
  'id',
  'full_name',
  'avatar_url',
  'role',
  'role_id',
  'org_id',
  'is_active',
  'voip_enabled',
  'voip_operator_code',
  'voip_extension',
  'voip_service_id',
  'voip_dial_mode',
] as const;

const SESSION_ROLE_COLUMNS = [
  'permissions',
  'org_id',
] as const;

type AuthUserCacheStore = {
  user: any | null;
  expiresAt: number;
  promise: Promise<any | null> | null;
};

type SessionBootstrapCacheStore = {
  cacheKey: string | null;
  snapshot: SessionBootstrapSnapshot | null;
  expiresAt: number;
  promise: Promise<SessionBootstrapSnapshot> | null;
};

type SessionCacheStore = {
  authUserCache: AuthUserCacheStore;
  sessionBootstrapCache: SessionBootstrapCacheStore;
};

const globalSessionCache = globalThis as typeof globalThis & {
  __kalamSessionCacheStore?: SessionCacheStore;
};

const sessionCacheStore = globalSessionCache.__kalamSessionCacheStore || {
  authUserCache: {
    user: null,
    expiresAt: 0,
    promise: null,
  },
  sessionBootstrapCache: {
    cacheKey: null,
    snapshot: null,
    expiresAt: 0,
    promise: null,
  },
};

globalSessionCache.__kalamSessionCacheStore = sessionCacheStore;

const { authUserCache, sessionBootstrapCache } = sessionCacheStore;

const isTransientBootstrapError = (error: any) => {
  const text = [
    error?.name,
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
  ].map((value) => String(value || '').toLowerCase()).join(' ');
  return text.includes('abort')
    || text.includes('timeout')
    || text.includes('failed to fetch')
    || text.includes('networkerror')
    || text.includes('network request failed')
    || text.includes('err_failed');
};

const getReusableBootstrapSnapshot = (cacheKey: string, userId: string): SessionBootstrapSnapshot | null => {
  if (
    sessionBootstrapCache.cacheKey === cacheKey &&
    sessionBootstrapCache.snapshot &&
    sessionBootstrapCache.snapshot.user?.id === userId &&
    sessionBootstrapCache.snapshot.orgId
  ) {
    return sessionBootstrapCache.snapshot;
  }
  return null;
};

const RESERVED_TAZE_HOSTS = new Set([
  'tazesystem.ir',
  'www.tazesystem.ir',
  'app.tazesystem.ir',
  'panel.tazesystem.ir',
  'kalam.tazesystem.ir',
]);

/**
 * The active organization is a request/host concern. A user can keep two
 * tenant subdomains open at once, while the profile row still has one legacy
 * active org. Resolve the tenant org from the current host before caching the
 * bootstrap snapshot so one tab cannot reuse another tenant's identity.
 */
const resolveTenantHostContext = async (supabaseClient: any) => {
  if (typeof window === 'undefined') return { hostname: '', orgId: null as string | null };
  const hostname = String(window.location.hostname || '').trim().toLowerCase();
  if (!hostname.endsWith('.tazesystem.ir') || RESERVED_TAZE_HOSTS.has(hostname)) {
    return { hostname, orgId: null as string | null };
  }
  try {
    const { data, error } = await supabaseClient.rpc('get_public_branding', { p_hostname: hostname });
    if (error) return { hostname, orgId: null as string | null, error };
    const row = Array.isArray(data) ? data[0] : data;
    return { hostname, orgId: String(row?.org_id || '').trim() || null };
  } catch (error) {
    return { hostname, orgId: null as string | null, error };
  }
};

export const clearSessionBootstrapCache = () => {
  authUserCache.user = null;
  authUserCache.expiresAt = 0;
  authUserCache.promise = null;

  sessionBootstrapCache.cacheKey = null;
  sessionBootstrapCache.snapshot = null;
  sessionBootstrapCache.expiresAt = 0;
  sessionBootstrapCache.promise = null;
};

export const getCachedAuthUser = async (
  supabaseClient: any,
  options?: { force?: boolean }
) => {
  const now = Date.now();
  if (!options?.force && authUserCache.user && authUserCache.expiresAt > now) {
    return authUserCache.user;
  }

  if (authUserCache.promise) {
    return authUserCache.promise;
  }

  authUserCache.promise = (async () => {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const sessionUser = sessionData?.session?.user || null;
    const sessionExpiresAt = sessionData?.session?.expires_at
      ? sessionData.session.expires_at * 1000
      : 0;

    if (sessionUser && (!sessionExpiresAt || sessionExpiresAt > Date.now())) {
      authUserCache.user = sessionUser;
      authUserCache.expiresAt = Date.now() + AUTH_USER_TTL_MS;
      authUserCache.promise = null;
      return sessionUser;
    }

    const { data } = await supabaseClient.auth.getUser();
    authUserCache.user = data?.user || null;
    authUserCache.expiresAt = Date.now() + AUTH_USER_TTL_MS;
    authUserCache.promise = null;
    return authUserCache.user;
  })().catch((error) => {
    clearSessionBootstrapCache();
    throw error;
  });

  return authUserCache.promise;
};

export const fetchSessionBootstrap = async (
  supabaseClient: any,
  options?: { force?: boolean }
): Promise<SessionBootstrapSnapshot> => {
  try {
    const user = await getCachedAuthUser(supabaseClient, options);
    if (!user?.id) {
      return EMPTY_SNAPSHOT;
    }

    const hostContext = await resolveTenantHostContext(supabaseClient);
    const cacheKey = `${String(user.id)}:${hostContext.hostname || 'shared'}:${hostContext.orgId || 'profile'}`;
    if (
      !options?.force &&
      sessionBootstrapCache.cacheKey === cacheKey &&
      sessionBootstrapCache.snapshot &&
      sessionBootstrapCache.expiresAt > Date.now()
    ) {
      return sessionBootstrapCache.snapshot;
    }

    if (sessionBootstrapCache.cacheKey === cacheKey && sessionBootstrapCache.promise) {
      return sessionBootstrapCache.promise;
    }

    sessionBootstrapCache.cacheKey = cacheKey;
    const pending = (async () => {
      const profileResult = await runSelectWithCompatibleColumns<any | null>({
        cacheKey: 'session-bootstrap:profile',
        columns: SESSION_PROFILE_COLUMNS,
        execute: (selectExpr) =>
          runWithSupabaseTimeout(
            (signal) =>
              attachAbortSignalIfSupported(
                supabaseClient
                  .from('profiles')
                  .select(selectExpr),
                signal,
              )
                .eq('id', user.id)
                .maybeSingle(),
            SESSION_BOOTSTRAP_REQUEST_TIMEOUT_MS,
          ),
      });

      if (profileResult.error) {
        const reusable = isTransientBootstrapError(profileResult.error)
          ? getReusableBootstrapSnapshot(cacheKey, String(user.id))
          : null;
        if (reusable) {
          sessionBootstrapCache.expiresAt = Date.now() + SESSION_BOOTSTRAP_TTL_MS;
          return reusable;
        }
        return {
          user,
          profile: null,
          roleId: null,
          orgId: null,
          permissions: null,
          loadedAt: Date.now(),
          bootstrapError: profileResult.error,
        };
      }

      const profile = profileResult.data
        ? {
            ...profileResult.data,
            avatar_url: normalizePublicAssetUrl(profileResult.data.avatar_url) || null,
          }
        : null;

      let permissions: Record<string, any> | null = null;
      let resolvedOrgId: string | null = hostContext.orgId || (profile?.org_id ? String(profile.org_id) : null);
      let resolvedRoleId: string | null = profile?.role_id ? String(profile.role_id) : null;
      let resolvedSoftwareRole: string | null = profile?.role ? String(profile.role) : null;

      if (hostContext.orgId) {
        const membershipResult = await runWithSupabaseTimeout<any>(
          (signal) => attachAbortSignalIfSupported(
            supabaseClient
              .from('user_organization_memberships')
              .select('org_id,role_id,software_role,is_active')
              .eq('user_id', user.id)
              .eq('org_id', hostContext.orgId)
              .eq('is_active', true)
              .maybeSingle(),
            signal,
          ),
          SESSION_BOOTSTRAP_REQUEST_TIMEOUT_MS,
        );
        if (membershipResult.error || !membershipResult.data) {
          return {
            user,
            profile: null,
            roleId: null,
            orgId: null,
            permissions: null,
            loadedAt: Date.now(),
            bootstrapError: membershipResult.error || new Error('tenant_membership_not_found'),
          };
        }
        resolvedRoleId = membershipResult.data.role_id ? String(membershipResult.data.role_id) : null;
        resolvedSoftwareRole = membershipResult.data.software_role ? String(membershipResult.data.software_role) : resolvedSoftwareRole;
      }

      if (resolvedRoleId) {
        const roleResult = await runSelectWithCompatibleColumns<any | null>({
          cacheKey: 'session-bootstrap:role',
          columns: SESSION_ROLE_COLUMNS,
          execute: (selectExpr) =>
            runWithSupabaseTimeout(
              (signal) =>
                attachAbortSignalIfSupported(
                  supabaseClient
                    .from('org_roles')
                    .select(selectExpr),
                  signal,
                )
                  .eq('id', resolvedRoleId)
                  .maybeSingle(),
              SESSION_BOOTSTRAP_REQUEST_TIMEOUT_MS,
            ),
        });

        if (roleResult.error) {
          const reusable = isTransientBootstrapError(roleResult.error)
            ? getReusableBootstrapSnapshot(cacheKey, String(user.id))
            : null;
          if (reusable) {
            sessionBootstrapCache.expiresAt = Date.now() + SESSION_BOOTSTRAP_TTL_MS;
            return reusable;
          }
          const snapshot: SessionBootstrapSnapshot = {
            user,
            profile: profile || null,
            roleId: resolvedRoleId,
            orgId: resolvedOrgId,
            permissions: null,
            loadedAt: Date.now(),
            bootstrapError: roleResult.error,
          };

          sessionBootstrapCache.snapshot = snapshot;
          sessionBootstrapCache.expiresAt = Date.now() + SESSION_BOOTSTRAP_TTL_MS;
          return snapshot;
        }

        const role = roleResult.data || null;
        permissions = (role?.permissions || null) as Record<string, any> | null;
        if (!resolvedOrgId && role?.org_id) {
          resolvedOrgId = String(role.org_id);
        }
      }

      const snapshot: SessionBootstrapSnapshot = {
        user,
        profile: profile
          ? { ...profile, org_id: resolvedOrgId, role_id: resolvedRoleId, role: resolvedSoftwareRole }
          : null,
        roleId: resolvedRoleId,
        orgId: resolvedOrgId,
        permissions,
        loadedAt: Date.now(),
      };

      sessionBootstrapCache.snapshot = snapshot;
      sessionBootstrapCache.expiresAt = Date.now() + SESSION_BOOTSTRAP_TTL_MS;
      return snapshot;
    })();

    sessionBootstrapCache.promise = pending;
    try {
      return await pending;
    } finally {
      if (sessionBootstrapCache.promise === pending) {
        sessionBootstrapCache.promise = null;
      }
    }
  } catch {
    return EMPTY_SNAPSHOT;
  }
};

export const primeSessionBootstrap = async (
  supabaseClient: any,
  options?: { force?: boolean }
) => {
  await fetchSessionBootstrap(supabaseClient, options);
};
