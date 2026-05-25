import { AuthBindings } from "@refinedev/core";
import { supabase } from "./supabaseClient";
import { signOutLocalSession } from "./utils/authSession";
import { normalizePublicAssetUrl } from "./utils/assetUrl";

type CachedUserState = {
  user: any | null;
  expiresAt: number;
  promise: Promise<any | null> | null;
};

const USER_CACHE_TTL_MS = 60_000;
const cachedUserState: CachedUserState = {
  user: null,
  expiresAt: 0,
  promise: null,
};

const clearCachedUser = () => {
  cachedUserState.user = null;
  cachedUserState.expiresAt = 0;
  cachedUserState.promise = null;
};

const getCachedUser = async () => {
  const now = Date.now();
  if (cachedUserState.user && cachedUserState.expiresAt > now) {
    return cachedUserState.user;
  }
  if (cachedUserState.promise) {
    return cachedUserState.promise;
  }

  cachedUserState.promise = (async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const sessionUser = sessionData?.session?.user || null;
    const expiresAt = sessionData?.session?.expires_at ? sessionData.session.expires_at * 1000 : 0;
    if (sessionUser && (!expiresAt || expiresAt > Date.now())) {
      cachedUserState.user = sessionUser;
      cachedUserState.expiresAt = Date.now() + USER_CACHE_TTL_MS;
      cachedUserState.promise = null;
      return sessionUser;
    }

    const { data } = await supabase.auth.getUser();
    cachedUserState.user = data?.user || null;
    cachedUserState.expiresAt = Date.now() + USER_CACHE_TTL_MS;
    cachedUserState.promise = null;
    return cachedUserState.user;
  })().catch((error) => {
    clearCachedUser();
    throw error;
  });

  return cachedUserState.promise;
};

export const authProvider: AuthBindings = {
  login: async ({ email, password }) => {
    clearCachedUser();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return {
        success: false,
        error: {
          name: "LoginError",
          message: error.message,
        },
      };
    }

    return {
      success: true,
      redirectTo: "/",
    };
  },
  logout: async () => {
    clearCachedUser();
    await signOutLocalSession();
    return {
      success: true,
      redirectTo: "/login",
    };
  },
  check: async () => {
    const { data } = await supabase.auth.getSession();
    const { session } = data;

    const expiresAt = session?.expires_at ? session.expires_at * 1000 : 0;
    if (session && (!expiresAt || expiresAt > Date.now())) {
      cachedUserState.user = session.user || cachedUserState.user;
      cachedUserState.expiresAt = Date.now() + USER_CACHE_TTL_MS;
      cachedUserState.promise = null;
      return {
        authenticated: true,
      };
    }

    if (session && expiresAt && expiresAt <= Date.now()) {
      await signOutLocalSession();
    }

    return {
      authenticated: false,
      redirectTo: "/login",
    };
  },
  getPermissions: async () => {
    const user = await getCachedUser();
    if (user) {
      return user.role;
    }
    return null;
  },
  getIdentity: async () => {
    const user = await getCachedUser();
    if (user) {
      return {
        ...user,
        name: user.user_metadata?.full_name || user.email,
        avatar: normalizePublicAssetUrl(user.user_metadata?.avatar_url) || undefined,
      };
    }
    return null;
  },
  onError: async (error) => {
    console.error(error);
    return { error };
  },
};
