import { describe, expect, it } from 'vitest';
import {
  buildDefaultPermissions,
  mergePermissionsWithDefaults,
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
});
