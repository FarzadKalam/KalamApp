// @vitest-environment node
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';

let handler: (request: Request) => Promise<Response>;
let scope: Record<string, unknown>;
let shared: boolean;
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
