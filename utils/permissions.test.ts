import { describe, expect, it } from 'vitest';
import {
  buildDefaultPermissions,
  COMMUNICATIONS_PERMISSION_KEY,
  mergePermissionsWithDefaults,
  normalizeViewConditionGroup,
  resolveCommunicationsPermissions,
  resolvePreferredRoleModuleIds,
  resolveVoipAccessPermissions,
  SAAS_ADMIN_PERMISSION_KEY,
} from './permissions';

const modules = {
  products: {
    id: 'products',
    titles: { fa: 'محصولات', faSingular: 'محصول' },
    fields: [],
    blocks: [],
    actionButtons: [],
  },
  saas_orgs: {
    id: 'saas_orgs',
    titles: { fa: 'سازمان‌های SaaS', faSingular: 'سازمان SaaS' },
    fields: [],
    blocks: [],
    actionButtons: [],
  },
  saas_demo_requests: {
    id: 'saas_demo_requests',
    titles: { fa: 'درخواست‌های دمو', faSingular: 'درخواست دمو' },
    fields: [],
    blocks: [],
    actionButtons: [],
  },
} as any;

describe('permissions', () => {
  it('keeps SaaS admin modules out of default business module permissions', () => {
    const defaults = buildDefaultPermissions(modules);

    expect(defaults.products?.view).toBe(true);
    expect(defaults.saas_orgs).toBeUndefined();
    expect(defaults.saas_demo_requests).toBeUndefined();
    expect(defaults[SAAS_ADMIN_PERMISSION_KEY]).toMatchObject({
      view: false,
      edit: false,
      delete: false,
    });
  });

  it('does not expose SaaS admin modules in preferred business shortcuts', () => {
    const defaults = buildDefaultPermissions(modules);
    const merged = mergePermissionsWithDefaults({}, defaults);

    expect(resolvePreferredRoleModuleIds(merged, modules, 10)).toEqual(['products']);
  });

  it('preserves communication access but keeps conversation audit opt-in', () => {
    const defaults = buildDefaultPermissions(modules);
    const resolved = resolveCommunicationsPermissions(defaults);

    expect(defaults[COMMUNICATIONS_PERMISSION_KEY]?.fields?.audit_all_conversations).toBe(false);
    expect(resolved.canUsePanel).toBe(true);
    expect(resolved.canUseWorkspace).toBe(true);
    expect(resolved.canAuditAllConversations).toBe(false);
  });

  it('requires an explicit communication audit grant', () => {
    const resolved = resolveCommunicationsPermissions({
      [COMMUNICATIONS_PERMISSION_KEY]: {
        view: true,
        edit: true,
        fields: { audit_all_conversations: true },
      },
    });

    expect(resolved.canAuditAllConversations).toBe(true);
  });

  it('uses the standard module scope for both user and role call visibility', () => {
    expect(resolveVoipAccessPermissions({
      voip_call_reports: { view: true, record_scope: 'own' },
    })).toMatchObject({
      canViewAllCallNotifications: false,
      canViewUserCalls: true,
      canViewRoleCalls: false,
      recordScope: 'own',
    });

    expect(resolveVoipAccessPermissions({
      voip_call_reports: { view: true, record_scope: 'team' },
    })).toMatchObject({
      canViewAllCallNotifications: false,
      canViewUserCalls: true,
      canViewRoleCalls: true,
      recordScope: 'team',
    });
  });

  it('preserves advanced view conditions while merging defaults', () => {
    const defaults = buildDefaultPermissions(modules);
    const merged = mergePermissionsWithDefaults({
      products: {
        view: true,
        view_conditions: {
          conditions_all: [{ id: 'a', field: 'status', operator: 'eq', value: 'active' }],
          conditions_any: [{ id: 'b', field: 'category', operator: 'eq', value: 'vip' }],
        },
      },
    }, defaults);

    expect(merged.products?.view_conditions?.conditions_all).toHaveLength(1);
    expect(merged.products?.view_conditions?.conditions_any).toHaveLength(1);
  });

  it('normalizes legacy role view conditions into all or any groups', () => {
    expect(normalizeViewConditionGroup({
      logic: 'or',
      conditions: [{ id: 'a', field: 'status', operator: 'eq', value: 'open' }],
    }).conditions_any).toHaveLength(1);

    expect(normalizeViewConditionGroup({
      logic: 'and',
      conditions: [{ id: 'b', field: 'status', operator: 'eq', value: 'open' }],
    }).conditions_all).toHaveLength(1);
  });
});
