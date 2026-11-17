import { supabase } from '../supabaseClient';
import { canAccessAssignedRecord, fetchCurrentUserRecordAccessContext } from './permissions';
import { canFieldAction } from './fieldAccess';
import { hasCurrentOrgPlanFeature } from './saasPlanFeatures';

export async function saveCommissionProductDefault(moduleId: 'products' | 'billboards', productId: string, percent: number) {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('درصد باید بین صفر و صد باشد.');
  const context = await fetchCurrentUserRecordAccessContext(supabase, { force: true });
  if (!context.orgId || !context.userId || !context.permissions) throw new Error('دسترسی سازمان قابل تأیید نیست.');
  if (!await hasCurrentOrgPlanFeature('advanced_commission', { force: true, defaultEnabled: true })) throw new Error('پورسانت پیشرفته در پلن سازمان فعال نیست.');
  const permission = context.permissions[moduleId];
  if (!canFieldAction(context.permissions.payroll_slips, 'amount', 'edit')
    || !canFieldAction(permission, 'commission_percentage', 'edit')) throw new Error('اجازهٔ ویرایش درصد پیش‌فرض این قلم را ندارید.');
  const { data: record, error: readError } = await supabase.from(moduleId).select('id,org_id,assignee_id,assignee_role_id,assignee_type')
    .eq('org_id', context.orgId).eq('id', productId).single();
  if (readError) throw readError;
  if (!canAccessAssignedRecord(record, context.userId, context.roleId, permission?.record_scope || 'all', {
    currentOrgId: context.orgId, allowedRoleIds: context.allowedRoleIds, allowedUserIds: context.allowedUserIds,
  })) throw new Error('اجازهٔ ویرایش این رکورد را ندارید.');
  const { data, error } = await supabase.from(moduleId).update({ commission_percentage: percent })
    .eq('org_id', context.orgId).eq('id', productId).select('id').single();
  if (error) throw error;
  if (!data) throw new Error('درصد پیش‌فرض ذخیره نشد.');
}
