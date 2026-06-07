import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./sessionCache', () => ({
  fetchSessionBootstrap: vi.fn(async () => ({
    user: { id: 'user-1' },
    profile: { id: 'user-1', org_id: 'org-1', role_id: 'role-1' },
    roleId: 'role-1',
    orgId: 'org-1',
    permissions: null,
    loadedAt: Date.now(),
  })),
}));

import { fetchSessionBootstrap } from './sessionCache';
import { clearReferenceDataCache, fetchAssigneeDirectory } from './referenceData';

const createProfilesQuery = (selectExpr: string) => ({
  limit: () => ({
    eq: async () => {
      if (selectExpr.includes('avatar_url')) {
        return {
          data: null,
          error: { code: '42703', message: 'column "avatar_url" does not exist' },
        };
      }
      return {
        data: [
          {
            id: 'user-2',
            full_name: 'کاربر نمونه',
            role_id: 'role-2',
            email: 'user@example.com',
          },
        ],
        error: null,
      };
    },
  }),
});

const createOrgRolesQuery = () => ({
  limit: () => ({
    eq: async () => ({
      data: [
        {
          id: 'role-2',
          org_id: 'org-1',
          title: 'پشتیبانی',
          parent_id: null,
          sort_order: 1,
          is_system: false,
        },
      ],
      error: null,
    }),
    or: async () => ({
      data: [],
      error: null,
    }),
  }),
  in: async () => ({
    data: [],
    error: null,
  }),
});

const createPhoneInviteQuery = () => ({
  eq: () => ({
    not: async () => ({
      data: [],
      error: null,
    }),
  }),
});

describe('fetchAssigneeDirectory', () => {
  beforeEach(() => {
    clearReferenceDataCache();
    vi.mocked(fetchSessionBootstrap).mockResolvedValue({
      user: { id: 'user-1' },
      profile: { id: 'user-1', org_id: 'org-1', role_id: 'role-1' },
      roleId: 'role-1',
      orgId: 'org-1',
      permissions: null,
      loadedAt: Date.now(),
    });
  });

  it('falls back to compatible profile columns when newer profile fields are missing', async () => {
    const supabaseClient = {
      from: (table: string) => {
        if (table === 'profiles') {
          return {
            select: (selectExpr: string) => createProfilesQuery(selectExpr),
          };
        }
        if (table === 'org_roles') {
          return {
            select: () => createOrgRolesQuery(),
          };
        }
        if (table === 'phone_signup_invites') {
          return {
            select: () => createPhoneInviteQuery(),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    };

    const directory = await fetchAssigneeDirectory(supabaseClient, { force: true });

    expect(directory.users).toHaveLength(1);
    expect(directory.users[0]).toMatchObject({
      id: 'user-2',
      full_name: 'کاربر نمونه',
      role_id: 'role-2',
      display_name: 'کاربر نمونه',
    });
    expect(directory.roles).toEqual([
      expect.objectContaining({
        id: 'role-2',
        title: 'پشتیبانی',
      }),
    ]);
  });

  it('does not reuse an assignee directory across organizations', async () => {
    const requestedOrgIds: string[] = [];
    const supabaseClient = {
      from: (table: string) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              limit: () => ({
                eq: async (_field: string, orgId: string) => {
                  requestedOrgIds.push(orgId);
                  return {
                    data: [{ id: `user-${orgId}`, full_name: `کاربر ${orgId}`, role_id: null }],
                    error: null,
                  };
                },
              }),
            }),
          };
        }
        if (table === 'org_roles') {
          return {
            select: () => ({
              limit: () => ({
                eq: async () => ({ data: [], error: null }),
              }),
            }),
          };
        }
        if (table === 'phone_signup_invites') {
          return {
            select: () => createPhoneInviteQuery(),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    };

    const first = await fetchAssigneeDirectory(supabaseClient, { force: true });
    vi.mocked(fetchSessionBootstrap).mockResolvedValue({
      user: { id: 'user-2' },
      profile: { id: 'user-2', org_id: 'org-2', role_id: null },
      roleId: null,
      orgId: 'org-2',
      permissions: null,
      loadedAt: Date.now(),
    });
    const second = await fetchAssigneeDirectory(supabaseClient);

    expect(first.users[0].id).toBe('user-org-1');
    expect(second.users[0].id).toBe('user-org-2');
    expect(requestedOrgIds).toEqual(['org-1', 'org-2']);
  });
});
