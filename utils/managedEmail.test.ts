import { describe, expect, it, vi } from 'vitest';
import { managedEmailAddress, requireManagedEmailFeature } from '../supabase/functions/_shared/managed-email';

describe('managed organization mailbox', () => {
  it('separates organizations on the same provider domain', () => {
    expect(managedEmailAddress('first-org', 'info', 'mail.example.com')).toBe('first-org.info@mail.example.com');
    expect(managedEmailAddress('second', 'info', 'mail.example.com')).toBe('second.info@mail.example.com');
    expect(() => managedEmailAddress('first-org', 'other.info', 'mail.example.com')).toThrow();
    expect(() => managedEmailAddress('', 'info', 'mail.example.com')).toThrow();
    expect(() => managedEmailAddress('x'.repeat(63), 'info', 'mail.example.com')).toThrow();
  });
  it('fails closed when hosting entitlement is absent, including background requests', async () => {
    const rpc = vi.fn().mockResolvedValue(false);
    await expect(requireManagedEmailFeature({ rpc }, 'organization')).rejects.toThrow('پلن');
    expect(rpc).toHaveBeenCalledWith('org_has_plan_feature', {
      p_org_id: 'organization', p_feature_key: 'managed_organization_email', p_default_enabled: false,
    });
    rpc.mockResolvedValue(true);
    await expect(requireManagedEmailFeature({ rpc }, 'organization')).resolves.toBeUndefined();
    rpc.mockResolvedValue(null);
    await expect(requireManagedEmailFeature({ rpc }, 'organization')).rejects.toThrow();
  });
});
