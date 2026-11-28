// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleOrganizationPasswordAuth } from './organization-password-auth';

const contact = '+989120000001';
const firstId = '10000000-0000-4000-8000-000000000001';
const secondId = '10000000-0000-4000-8000-000000000002';
const proofId = '10000000-0000-4000-8000-000000000003';
const credentials = { url: 'https://auth.test', key: 'test-key' };
const accounts = [
  { org_id: firstId, org_name: 'دمو', resolved_host: 'demo.tazesystem.ir', user_id: 'first',
    auth_email: null, auth_phone: contact, recovery_phone: contact, is_owner: true },
  { org_id: secondId, org_name: 'کار', resolved_host: 'work.tazesystem.ir', user_id: 'second',
    auth_email: 'second@org-login.invalid', auth_phone: null, recovery_email: 'real@example.test', is_owner: false },
];
const request = (host: string) => new Request('https://auth.test', { headers: { Origin: `https://${host}` } });
afterEach(() => vi.unstubAllGlobals());

describe('organization-scoped credentials', () => {
  it('sends the password to only the Auth identity bound to the tenant host', async () => {
    const calls = vi.fn(async (url: string) => url.includes('organization_login_candidates')
      ? Response.json(accounts) : Response.json({ user: { id: 'second' }, access_token: 'access', refresh_token: 'refresh' }));
    vi.stubGlobal('fetch', calls);
    const result = await handleOrganizationPasswordAuth(credentials, request('work.tazesystem.ir'), 'login_organization_password', {
      contact, password: 'work-password', orgId: firstId,
    });
    expect(result.status).toBe(200);
    expect(calls).toHaveBeenCalledWith(expect.stringContaining('grant_type=password'),
      expect.objectContaining({ body: JSON.stringify({ email: 'second@org-login.invalid', password: 'work-password' }) }));
    expect(JSON.stringify(result.data)).not.toContain('@org-login.invalid');
  });

  it('requires proof of contact before using a selection on the shared host', async () => {
    const mock = vi.fn();
    vi.stubGlobal('fetch', mock);
    const result = await handleOrganizationPasswordAuth(credentials, request('app.tazesystem.ir'), 'login_organization_password', {
      contact, password: 'work-password', orgId: secondId,
    });
    expect(result.status).toBe(401);
    expect(mock).not.toHaveBeenCalled();
  });

  it('lists organizations after verification without exposing credential or recovery addresses', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('verify_organization_auth_challenge')
      ? Response.json({ contact }) : Response.json(accounts)));
    const result = await handleOrganizationPasswordAuth(credentials, request('app.tazesystem.ir'), 'verify_organization_discovery', {
      challengeId: proofId, code: '123456',
    });
    expect(result.data.organizations).toMatchObject([{ org_id: firstId }, { org_id: secondId, recovery_channels: ['email'] }]);
    expect(JSON.stringify(result.data)).not.toContain('real@example.test');
  });

  it('resets the chosen organization only and refuses an obsolete recovery address', async () => {
    let address = 'old@example.test';
    const mock = vi.fn(async (url: string) => {
      if (url.includes('consume_organization_password_recovery')) return Response.json({
        contact, org_id: secondId, user_id: 'second', delivery_channel: 'email', delivery_address: address,
      });
      if (url.includes('organization_login_candidates')) return Response.json(accounts);
      return Response.json({ id: 'second' });
    });
    vi.stubGlobal('fetch', mock);
    const reset = () => handleOrganizationPasswordAuth(credentials, request('work.tazesystem.ir'), 'finish_organization_password_recovery',
      { challengeId: proofId, code: '123456', password: 'new-work-password' });
    expect((await reset()).status).toBe(400);
    expect(mock.mock.calls.some(([url]) => url.includes('/admin/users/'))).toBe(false);
    address = 'real@example.test';
    expect((await reset()).status).toBe(200);
    expect(mock).toHaveBeenCalledWith(expect.stringMatching(/\/admin\/users\/second$/),
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ password: 'new-work-password' }) }));
  });
});
