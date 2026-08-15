import { describe, expect, it, vi } from 'vitest';
import { resolvePrintPreferenceIdentity } from './preferenceIdentity';

describe('resolvePrintPreferenceIdentity', () => {
  it('uses the already resolved tenant without another session call', async () => {
    const loadSession = vi.fn();
    await expect(resolvePrintPreferenceIdentity({
      currentOrgId: 'org-a',
      currentUserId: 'user-a',
      loadSession,
    })).resolves.toEqual({ orgId: 'org-a', userId: 'user-a' });
    expect(loadSession).not.toHaveBeenCalled();
  });

  it('recovers the tenant identity when the print modal opens before session state settles', async () => {
    await expect(resolvePrintPreferenceIdentity({
      currentOrgId: null,
      currentUserId: null,
      loadSession: async () => ({ orgId: 'org-b', user: { id: 'user-b' } }),
    })).resolves.toEqual({ orgId: 'org-b', userId: 'user-b' });
  });
});
