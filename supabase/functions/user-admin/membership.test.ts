// @vitest-environment node
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';

let handler: (request: Request) => Promise<Response>;
let scope: Record<string, unknown>;
let shared: boolean;
let loginCandidates: Array<{ org_id: string; user_id: string }>;
const calls: { url: URL; method: string; body: any; headers: Headers }[] = [];
const profile = (id: string) => ({ id, org_id: 'org-other', role_id: 'role-other', role: 'super_admin',
  full_name: id === 'caller' ? 'مدیر' : 'عضو مشترک', email: 'person@example.test', mobile_1: '09120000001', avatar_url: null });
beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: (name: string) => name === 'SUPABASE_URL' ? 'https://test.invalid' : 'test-service-key' },
    serve: (callback: typeof handler) => { handler = callback; } });
  await import('./index.ts');
});
beforeEach(() => {
  calls.length = 0; shared = true;
  loginCandidates = [{ org_id: 'org-other', user_id: 'target' }];
  scope = { org_id: 'org-current', role_id: 'role-current', role: 'admin', is_active: true };
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body, headers: new Headers(init?.headers) });
    const json = (data: unknown) => Response.json(data);
    if (url.pathname === '/auth/v1/user') return json({ id: 'caller' });
    if (url.pathname.endsWith('/rpc/get_current_organization_context')) return json(scope);
    if (url.pathname.endsWith('/rpc/manage_organization_member')) return json({ success: true });
    if (url.pathname.endsWith('/rpc/organization_login_candidates')) return json(loginCandidates);
    if (url.pathname.endsWith('/rpc/find_profile_by_phone_for_auth')) return json([profile('target')]);
    if (url.pathname.endsWith('/rpc/provision_organization_password_account')) return json(null);
    if (url.pathname.endsWith('/organization_password_accounts')) return json(url.searchParams.get('user_id') === 'eq.independent'
      ? [{ phone_e164: '+989120000001', recovery_email: null }] : []);
    if (url.pathname === '/auth/v1/admin/users' && method === 'POST') return json({ id: 'independent' });
    if (url.pathname.endsWith('/org_roles')) return json([{ id: 'role-current', org_id: 'org-current', title: 'مدیر' }]);
    if (url.pathname.endsWith('/profiles')) return json([profile(url.searchParams.get('id')?.replace('eq.', '') || 'target')]);
    if (url.pathname.endsWith('/user_organization_memberships')) {
      if (url.searchParams.has('org_id')) return json([{ org_id: 'org-current', role_id: 'role-member', software_role: 'viewer', is_active: true }]);
      return json(shared ? [{ org_id: 'org-current' }, { org_id: 'org-other' }] : [{ org_id: 'org-current' }]);
    }
    throw new Error(`Unexpected endpoint: ${method} ${url.pathname}`);
  }));
});
afterAll(() => vi.unstubAllGlobals());
const invoke = (body: Record<string, unknown>) => handler(new Request('https://test.invalid/functions/v1/user-admin', {
  method: 'POST', headers: { Authorization: 'Bearer test-user-token', Origin: 'https://alpha.tazesystem.ir', 'x-organization-id': 'org-current' },
  body: JSON.stringify({ userId: 'target', ...body }),
}));

describe('tenant user administration uses membership context', () => {
  it('creates a separate password identity in the current organization without changing the demo identity', async () => {
    const response = await invoke({ action: 'create_user', orgId: 'org-current', fullName: 'عضو مشترک',
      phone: '۰۹۱۲۰۰۰۰۰۰۱', roleId: 'role-current', role: 'editor', password: 'second-password' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ independentAccount: true,
      profile: { org_id: 'org-current', independent_account: true, can_edit_identity: false } });
    const auth = calls.find(call => call.url.pathname === '/auth/v1/admin/users');
    expect(auth?.body).toMatchObject({ email: expect.stringMatching(/@org-login\.invalid$/), password: 'second-password' });
    expect(auth?.body).not.toHaveProperty('phone');
    expect(calls.find(call => call.url.pathname.endsWith('provision_organization_password_account'))?.body)
      .toMatchObject({ p_phone: '+989120000001', p_org_id: 'org-current', p_user_id: 'independent' });
    expect(calls.some(call => call.url.pathname.endsWith('/users/target'))).toBe(false);
    expect(calls.some(call => call.url.pathname.endsWith('/profiles') && call.method !== 'GET')).toBe(false);
  });

  it('protects an existing account in the destination organization from a repeated create', async () => {
    loginCandidates = [{ org_id: 'org-current', user_id: 'target' }];
    const response = await invoke({ action: 'create_user', orgId: 'org-current', fullName: 'عضو مشترک', phone: '09120000001', password: 'second-password' });
    expect(response.status).toBe(409);
    expect(calls.some(call => call.url.pathname.includes('/auth/v1/admin/'))).toBe(false);
    expect(calls.some(call => call.url.pathname.endsWith('manage_organization_member'))).toBe(false);
  });

  it('forwards request context and rejects a forged target organization before any write', async () => {
    const response = await invoke({ action: 'update_user', orgId: 'org-other' });
    expect(response.status).toBe(403);
    const context = calls.find(call => call.url.pathname.endsWith('get_current_organization_context'))!;
    expect(context.headers.get('origin')).toBe('https://alpha.tazesystem.ir');
    expect(context.headers.get('x-organization-id')).toBe('org-current');
    expect(calls.some(call => ['PATCH', 'DELETE'].includes(call.method))).toBe(false);
  });
  it('uses the current membership role instead of a super-admin role in another profile context', async () => {
    scope = { ...scope, role: 'viewer', role_id: null };
    const response = await invoke({ action: 'delete_user' });
    expect(response.status).toBe(403);
    expect(calls.some(call => call.url.pathname.endsWith('manage_organization_member'))).toBe(false);
  });
  it('deletes only membership and never deletes the shared Auth identity', async () => {
    const response = await invoke({ action: 'delete_user', orgId: 'org-current' });
    expect(response.status).toBe(200);
    expect(calls.find(call => call.url.pathname.endsWith('manage_organization_member'))?.body)
      .toEqual({ p_user_id: 'target', p_remove: true });
    expect(calls.some(call => call.method === 'DELETE')).toBe(false);
  });
  it('updates the shared member role without rewriting global identity fields', async () => {
    const response = await invoke({ action: 'update_user', roleId: 'role-new', role: 'editor', isActive: false });
    expect(response.status).toBe(200);
    expect(calls.find(call => call.url.pathname.endsWith('manage_organization_member'))?.body.p_patch)
      .toMatchObject({ role_id: 'role-new', role: 'editor', is_active: false });
    expect(calls.some(call => call.method === 'PATCH')).toBe(false);
  });
  it('rejects personal identity edits and password resets for another shared account', async () => {
    for (const body of [{ action: 'update_user', fullName: 'نام دیگر' }, { action: 'set_user_password', password: 'new-password' }]) {
      expect((await invoke(body)).status).toBe(403);
    }
    expect(calls.some(call => ['PATCH', 'DELETE'].includes(call.method))).toBe(false);
  });
  it('refuses legacy profile adoption instead of copying membership or identity', async () => {
    const response = await invoke({ action: 'repair_legacy_phone_login', phone: '09120000001' });
    expect(response.status).toBe(409);
    expect(calls.some(call => ['PATCH', 'DELETE'].includes(call.method))).toBe(false);
  });
});
