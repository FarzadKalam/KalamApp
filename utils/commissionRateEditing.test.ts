import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), context: vi.fn(), feature: vi.fn(), access: vi.fn() }));
vi.mock('../supabaseClient', () => ({ supabase: { from: mocks.from } }));
vi.mock('./permissions', () => ({ fetchCurrentUserRecordAccessContext: mocks.context, canAccessAssignedRecord: mocks.access }));
vi.mock('./saasPlanFeatures', () => ({ hasCurrentOrgPlanFeature: mocks.feature }));
import { saveCommissionProductDefault } from './commissionRateEditing';

describe('commission default editing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.context.mockResolvedValue({ orgId: 'org-a', userId: 'operator', roleId: 'role', permissions: { payroll_slips: { edit: true }, billboards: { edit: true } } });
    mocks.feature.mockResolvedValue(true); mocks.access.mockReturnValue(true);
  });
  it('fails closed without organization, plan availability or field permission', async () => {
    mocks.context.mockResolvedValueOnce({ orgId: null });
    await expect(saveCommissionProductDefault('billboards', 'item', 5)).rejects.toThrow();
    mocks.feature.mockResolvedValueOnce(false);
    await expect(saveCommissionProductDefault('billboards', 'item', 5)).rejects.toThrow();
    mocks.context.mockResolvedValueOnce({ orgId: 'org-a', userId: 'operator', permissions: { billboards: { field_actions: { commission_percentage: { edit: false } } } } });
    await expect(saveCommissionProductDefault('billboards', 'item', 5)).rejects.toThrow();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('writes only the selected module and organization, and propagates a failed write', async () => {
    const query = { select: vi.fn(), eq: vi.fn(), single: vi.fn(), update: vi.fn() };
    for (const method of ['select', 'eq', 'update'] as const) query[method].mockReturnValue(query);
    query.single.mockResolvedValueOnce({ data: { id: 'item', org_id: 'org-a' }, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('write denied') });
    mocks.from.mockReturnValue(query);
    await expect(saveCommissionProductDefault('billboards', 'item', 7)).rejects.toThrow('write denied');
    expect(mocks.from.mock.calls).toEqual([['billboards'], ['billboards']]);
    expect(query.eq.mock.calls.filter(([key]) => key === 'org_id')).toEqual([['org_id', 'org-a'], ['org_id', 'org-a']]);
    expect(query.update).toHaveBeenCalledWith({ commission_percentage: 7 });
  });
});
