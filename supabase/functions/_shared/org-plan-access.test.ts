import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadOrgPlanAccess } from './org-plan-access';

afterEach(() => vi.unstubAllGlobals());
describe('server organization plan access', () => {
  it('denies unknown org and network/RPC errors without a permissive fallback', async () => {
    const request = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', request);
    expect((await loadOrgPlanAccess('https://example.invalid', 'test', '')).available).toBe(false);
    expect(request).not.toHaveBeenCalled();
    expect((await loadOrgPlanAccess('https://example.invalid', 'test', 'org-a')).available).toBe(false);
    request.mockResolvedValueOnce({ ok: false });
    expect((await loadOrgPlanAccess('https://example.invalid', 'test', 'org-a')).available).toBe(false);
  });
  it('passes the exact org to the shared service RPC and retains disabled features', async () => {
    const context = { available: true, features: { api_access: false, 'ai_agent:lead_orchestrator': false }, enabledModules: { tasks: true } };
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => context });
    vi.stubGlobal('fetch', request);
    expect(await loadOrgPlanAccess('https://example.invalid', 'test', 'org-b')).toEqual(context);
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ p_org_id: 'org-b' });
  });
  it('rejects malformed snapshots', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: { api_access: true } }) }));
    expect((await loadOrgPlanAccess('https://example.invalid', 'test', 'org-a')).available).toBe(false);
  });
});
