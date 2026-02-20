import { AuthBindings } from "@refinedev/core";
import { supabase } from "./supabaseClient";

export const authProvider: AuthBindings = {
  login: async ({ email, password }) => {
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
    const { error } = await supabase.auth.signOut();
    if (error) {
      return {
        success: false,
        error: {
          name: "LogoutError",
          message: error.message,
        },
      };
    }
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
      return {
        authenticated: true,
      };
    }

    if (session && expiresAt && expiresAt <= Date.now()) {
      await supabase.auth.signOut();
    }

    return {
      authenticated: false,
      redirectTo: "/login",
    };
  },
  getPermissions: async () => {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      return data.user.role;
    }
    return null;
  },
  getIdentity: async () => {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      return {
        ...data.user,
        name: data.user.user_metadata?.full_name || data.user.email,
        avatar: data.user.user_metadata?.avatar_url,
      };
    }
    return null;
  },
  onError: async (error) => {
    console.error(error);
    return { error };
  },
};