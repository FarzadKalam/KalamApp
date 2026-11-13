import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModuleDefinition } from '../types';
import { showRecordCreatedFeedback } from './recordFeedback';
import { clearFeedback, getFeedbackSnapshot, setFeedbackScope } from './appFeedback';
import { fetchCurrentUserRoleContext } from './permissions';
import { hasCurrentOrgPlanModule } from './saasPlanModules';
vi.mock('../supabaseClient', () => ({ supabase: {} }));
vi.mock('./permissions', () => ({ fetchCurrentUserRoleContext: vi.fn(), resolveCommunicationsPermissions: () => ({ canUseSms: true, canUseVoip: true }) }));
vi.mock('./saasPlanModules', () => ({ hasCurrentOrgPlanModule: vi.fn() }));
vi.mock('./recordMessaging', () => ({ getPrimaryRecordPhone: (_module: string, record: Record<string, unknown>) => record.mobile_1 || '' }));
const module = (primary: 'create_activity' | 'create_invoice') => ({ id: primary === 'create_invoice' ? 'customers' : 'marketing_leads', titles: { fa: 'مخاطبان', faSingular: 'مخاطب' }, fields: [], createdFeedback: { primary, communications: true } }) as unknown as ModuleDefinition;
const context = { userId: 'user', orgId: 'org', roleId: 'role', permissions: {} };
beforeEach(() => { clearFeedback(); setFeedbackScope(JSON.stringify(['org', 'user'])); vi.mocked(fetchCurrentUserRoleContext).mockResolvedValue(context); vi.mocked(hasCurrentOrgPlanModule).mockResolvedValue(true); });
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
describe('record-specific feedback actions', () => {
  it('offers an invoice and contact shortcuts for a saved customer with a phone', async () => {
    showRecordCreatedFeedback(module('create_invoice'), { id: 'saved', full_name: 'مشتری نمونه', mobile_1: '09120000000' });
    await settle();
    expect(getFeedbackSnapshot()[0].actions?.map(action => action.label)).toEqual(['ثبت فاکتور سریع', 'تماس', 'ارسال پیام']);
    expect(getFeedbackSnapshot()[0].description).toBe('مشتری نمونه');
  });
  it('hides a denied primary action and absent phone shortcuts', async () => {
    vi.mocked(hasCurrentOrgPlanModule).mockResolvedValue(false);
    showRecordCreatedFeedback(module('create_activity'), { id: 'saved', name: 'سرنخ نمونه' });
    await settle();
    expect(getFeedbackSnapshot()[0].actions).toEqual([]);
  });
  it('never resurrects a closed toast or publishes another organization’s action discovery', async () => {
    showRecordCreatedFeedback(module('create_activity'), { id: 'saved', name: 'سرنخ نمونه' });
    clearFeedback(); await settle(); expect(getFeedbackSnapshot()).toEqual([]);
    showRecordCreatedFeedback(module('create_invoice'), { id: 'saved', name: 'مشتری نمونه' });
    setFeedbackScope('other-org'); await settle(); expect(getFeedbackSnapshot()).toEqual([]);
  });
});
