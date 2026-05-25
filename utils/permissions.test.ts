import { describe, expect, it } from 'vitest';
import {
  buildDefaultPermissions,
  COMMUNICATIONS_PERMISSION_KEY,
  mergePermissionsWithDefaults,
  resolveCommunicationsPermissions,
  resolvePreferredRoleModuleIds,
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
});
