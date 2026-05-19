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
});
