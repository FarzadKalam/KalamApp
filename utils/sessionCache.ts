import { runSelectWithCompatibleColumns } from './selectCompat';
import { normalizePublicAssetUrl } from './assetUrl';

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

    const cacheKey = String(user.id);
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
          supabaseClient
            .from('profiles')
            .select(selectExpr)
            .eq('id', user.id)
            .maybeSingle(),
      });

      if (profileResult.error) {
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
      let resolvedOrgId: string | null = profile?.org_id ? String(profile.org_id) : null;
      if (profile?.role_id) {
        const roleResult = await runSelectWithCompatibleColumns<any | null>({
          cacheKey: 'session-bootstrap:role',
          columns: SESSION_ROLE_COLUMNS,
          execute: (selectExpr) =>
            supabaseClient
              .from('org_roles')
              .select(selectExpr)
              .eq('id', profile.role_id)
              .maybeSingle(),
        });

        if (roleResult.error) {
          const snapshot: SessionBootstrapSnapshot = {
            user,
            profile: profile || null,
            roleId: profile?.role_id ? String(profile.role_id) : null,
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
        profile: profile || null,
        roleId: profile?.role_id ? String(profile.role_id) : null,
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
