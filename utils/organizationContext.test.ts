import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../supabaseClient', () => ({ supabase: {}, SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'test' }));
import { clearOrganizationContext, getSelectedOrganizationId, organizationContextFetch, selectOrganizationContext } from './organizationContext';
import { clearSessionBootstrapCache, fetchSessionBootstrap } from './sessionCache';

beforeEach(() => { clearOrganizationContext(); clearSessionBootstrapCache(); });
afterEach(() => vi.unstubAllGlobals());
const client = (rpc: any) => ({
  auth: { getSession: async () => ({ data: { session: { user: { id: 'person' }, expires_at: Date.now() / 1000 + 3600 } } }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
    id: 'person', org_id: 'legacy-org', role_id: 'legacy-admin-role', role: 'super_admin', full_name: 'کاربر',
  }, error: null }) }) }) }), rpc,
});
describe('request-scoped organization context', () => {
  it('stores selection per tab and forwards it without losing authentication headers', async () => {
    const fetch = vi.fn(async () => new Response()); vi.stubGlobal('fetch', fetch);
    selectOrganizationContext('org-selected');
    expect(localStorage.getItem('kalam:organization-context')).toBeNull();
    await organizationContextFetch('https://api.example.test/rest/v1/profiles', { headers: { Authorization: 'Bearer test-token' } });
    const headers = fetch.mock.calls[0][1].headers as Headers;
    expect(headers.get('x-client-info')).toBe('kalamapp; org=org-selected');
    expect(headers.get('Authorization')).toBe('Bearer test-token');
    await organizationContextFetch('https://api.example.test/functions/v1/send-sms');
    expect((fetch.mock.calls[1][1].headers as Headers).has('x-organization-id')).toBe(false);
    clearOrganizationContext(); expect(getSelectedOrganizationId()).toBeNull();
  });
  it('uses membership permissions instead of a privileged legacy profile in another org', async () => {
    const api = client(async () => ({ data: { org_id: 'current-org', org_name: 'نام فارسی سازمان',
      role_id: 'current-role', role: 'viewer', permissions: { tasks: { view: true, edit: false } } }, error: null }));
    const snapshot = await fetchSessionBootstrap(api);
    expect(snapshot.orgId).toBe('current-org'); expect(snapshot.roleId).toBe('current-role');
    expect(snapshot.profile.role).toBe('viewer'); expect(snapshot.profile.org_name).toBe('نام فارسی سازمان');
    expect(snapshot.permissions?.tasks.edit).toBe(false);
  });
  it('invalidates cached permissions on revocation and never falls back to a legacy admin profile', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: { org_id: 'current-org', role_id: 'current-role', role: 'admin', permissions: {} }, error: null })
      .mockResolvedValue({ data: null, error: null });
    const api = client(rpc);
    expect((await fetchSessionBootstrap(api)).orgId).toBe('current-org');
    const denied = await fetchSessionBootstrap(api, { force: true });
    expect(denied.orgId).toBeNull(); expect(denied.profile).toBeNull(); expect(denied.bootstrapError).toBeTruthy();
    expect((await fetchSessionBootstrap(api)).orgId).toBeNull();
  });
});
