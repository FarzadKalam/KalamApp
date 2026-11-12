import { sharedRestSelect, canViewModuleWithPlan, normalizeId } from '../ai-grounding.ts';
import type { DomainSkillModule, SkillExecutionContext } from './types.ts';

export const hrManagerSkill: DomainSkillModule = {
  agentKey: 'hr_manager',
  titleFa: 'ایجنت منابع انسانی',
  buildContractPrompt: (ctx: SkillExecutionContext) => {
    const canManageHr = canViewModuleWithPlan(ctx.grounding.planContext, ctx.authContext?.permissions, 'employees');
    return [
      '## قرارداد تخصصی ایجنت منابع انسانی (دوسویه: مدیر و کارمند)',
      canManageHr
        ? '1. **حالت مدیریت منابع انسانی**: کمک به آنبوردینگ متقاضیان (`recruitment_applicants` -> ایجاد `employees`، اتصال `job_description_id`، معرفی دستورالعمل‌ها و اجرای فرآیند آنبوردینگ)، پیگیری درخواست‌های مرخصی/اضافه‌کار/مأموریت، پایش تردد و توزیع عادلانه وظایف.'
        : '1. **حالت همکار/کارمند**: کمک به خود همکار در حدود دسترسی خودش برای درک شرح شغل، دستورالعمل‌ها و فرآیندهای کاری، وضعیت مرخصی/اضافه‌کار/مأموریت شخصی و یادآوری فعالیت‌های محول‌شده.',
      '2. **یادآوری و پیگیری بدون نقض حریم شخصی**: اطلاعات محرمانه سایر کارکنان (حقوق، ارزیابی یا مرخصی فرد دیگر) را هرگز برای کارمند غیرمجاز فاش نکن.',
      '3. **تغییرات پرسنلی و تایید مرخصی/اضافه‌کار**: همیشه خلاصه را واضح نمایش بده و پیش از تغییر وضعیت یا ثبت رکورد، تایید صریح بگیر.',
    ].join('\n');
  },
  gatherDomainContext: async (ctx: SkillExecutionContext) => {
    const orgId = normalizeId(ctx.grounding.orgId);
    const userId = normalizeId(ctx.authContext?.userId);
    if (!orgId || ctx.grounding.freeChatMode) return null;
    const perms = ctx.authContext?.permissions;
    const plan = ctx.grounding.planContext;
    const bundle: Record<string, any> = {};

    const myEmployees = await sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'employees', {
      org_id: `eq.${orgId}`,
      related_profile_id: `eq.${userId}`,
      select: 'id,full_name,employee_code,department,job_description_id,related_profile_id',
      limit: 2,
    });
    if (myEmployees[0]) bundle.actor_employee_profile = myEmployees[0];

    const canSeeApplicants = canViewModuleWithPlan(plan, perms, 'recruitment_applicants');
    const canSeeLeaves = canViewModuleWithPlan(plan, perms, 'leave_requests');
    const canSeeOvertime = canViewModuleWithPlan(plan, perms, 'overtime_requests');

    const [applicants, leaves, overtimes] = await Promise.all([
      canSeeApplicants
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'recruitment_applicants', {
            org_id: `eq.${orgId}`,
            select: 'id,full_name,name,status,mobile,interview_at',
            order: 'updated_at.desc',
            limit: 8,
          })
        : Promise.resolve([]),
      canSeeLeaves
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'leave_requests', {
            org_id: `eq.${orgId}`,
            ...(perms?.leave_requests?.record_scope === 'own' && myEmployees[0]?.id
              ? { employee_id: `eq.${myEmployees[0].id}` }
              : {}),
            select: 'id,name,system_code,status,employee_id,start_date,end_date,created_at',
            order: 'updated_at.desc',
            limit: 8,
          })
        : Promise.resolve([]),
      canSeeOvertime
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'overtime_requests', {
            org_id: `eq.${orgId}`,
            ...(perms?.overtime_requests?.record_scope === 'own' && myEmployees[0]?.id
              ? { employee_id: `eq.${myEmployees[0].id}` }
              : {}),
            select: 'id,name,system_code,status,employee_id,created_at',
            order: 'updated_at.desc',
            limit: 8,
          })
        : Promise.resolve([]),
    ]);

    if (applicants.length) bundle.recruitment_applicants = applicants;
    if (leaves.length) bundle.recent_leave_requests = leaves;
    if (overtimes.length) bundle.recent_overtime_requests = overtimes;
    return bundle;
  },
};
