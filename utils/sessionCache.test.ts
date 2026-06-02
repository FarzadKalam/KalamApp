import { beforeEach, describe, expect, it } from 'vitest';
import { clearSessionBootstrapCache, fetchSessionBootstrap } from './sessionCache';

const createProfileQuery = (selectExpr: string) => ({
  eq: () => ({
    maybeSingle: async () => {
      if (selectExpr.includes('avatar_url')) {
        return {
          data: null,
          error: { code: '42703', message: 'column "avatar_url" does not exist' },
        };
      }
      if (selectExpr.includes('voip_enabled')) {
        return {
          data: null,
          error: { code: '42703', message: 'column "voip_enabled" does not exist' },
        };
      }
      return {
        data: {
          id: 'user-1',
          full_name: 'کاربر تست',
          role: 'admin',
          role_id: 'role-1',
          org_id: 'org-1',
          is_active: true,
        },
        error: null,
      };
    },
  }),
});

const createRoleQuery = () => ({
  eq: () => ({
    maybeSingle: async () => ({
      data: {
        permissions: { tasks: { view: true } },
        org_id: 'org-1',
      },
      error: null,
    }),
  }),
});

describe('fetchSessionBootstrap', () => {
  beforeEach(() => {
    clearSessionBootstrapCache();
  });

  it('falls back to a reduced profile select when newer profile columns are missing', async () => {
    const supabaseClient = {
      auth: {
        getSession: async () => ({
          data: {
            session: {
              user: { id: 'user-1' },
              expires_at: Math.floor(Date.now() / 1000) + 300,
            },
          },
        }),
        getUser: async () => ({ data: { user: { id: 'user-1' } } }),
      },
      from: (table: string) => {
        if (table === 'profiles') {
          return {
            select: (selectExpr: string) => createProfileQuery(selectExpr),
          };
        }
        if (table === 'org_roles') {
          return {
            select: () => createRoleQuery(),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    };

    const snapshot = await fetchSessionBootstrap(supabaseClient, { force: true });

    expect(snapshot.profile?.full_name).toBe('کاربر تست');
    expect(snapshot.roleId).toBe('role-1');
    expect(snapshot.orgId).toBe('org-1');
    expect(snapshot.permissions).toEqual({ tasks: { view: true } });
  });

  it('normalizes legacy avatar storage hosts in the session profile', async () => {
    const supabaseClient = {
      auth: {
        getSession: async () => ({
          data: {
            session: {
              user: { id: 'user-avatar' },
              expires_at: Math.floor(Date.now() / 1000) + 300,
            },
          },
        }),
        getUser: async () => ({ data: { user: { id: 'user-avatar' } } }),
      },
      from: (table: string) => {
        if (table !== 'profiles') throw new Error(`Unexpected table ${table}`);
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'user-avatar',
                  full_name: 'کاربر تصویر',
                  avatar_url: 'https://api.kalamapp.ir/storage/v1/object/public/images/avatar.jpg',
                  org_id: 'org-1',
                  role_id: null,
                },
                error: null,
              }),
            }),
          }),
        };
      },
    };

    const snapshot = await fetchSessionBootstrap(supabaseClient, { force: true });

    expect(snapshot.profile?.avatar_url).toBe('https://api.tazesystem.ir/storage/v1/object/public/images/avatar.jpg');
  });

  it('keeps the authenticated user and marks bootstrap errors instead of returning a successful no-org snapshot', async () => {
    const networkError = { message: 'Failed to fetch' };
    const supabaseClient = {
      auth: {
        getSession: async () => ({
          data: {
            session: {
              user: { id: 'user-network' },
              expires_at: Math.floor(Date.now() / 1000) + 300,
            },
          },
        }),
        getUser: async () => ({ data: { user: { id: 'user-network' } } }),
      },
      from: (table: string) => {
        if (table !== 'profiles') throw new Error(`Unexpected table ${table}`);
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: null,
                error: networkError,
              }),
            }),
          }),
        };
      },
    };

    const snapshot = await fetchSessionBootstrap(supabaseClient, { force: true });

    expect(snapshot.user?.id).toBe('user-network');
    expect(snapshot.orgId).toBeNull();
    expect(snapshot.bootstrapError).toBe(networkError);
  });
});
