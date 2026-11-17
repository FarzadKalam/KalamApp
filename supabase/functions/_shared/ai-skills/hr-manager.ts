import { canViewModuleWithPlan } from '../ai-grounding.ts';
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
      '4. **بررسی کامل منابع انسانی**: از ابزارهای داده برای تردد، برنامه کاری، فعالیت‌ها، شرح شغل، قرارداد، دستورالعمل و فرمول‌های محاسباتی استفاده کن. read_employee_context دفتر محاسبات ذخیره‌شده حقوق و پورسانت، قواعد عملکرد و سهم ثبت‌شده اهداف را می‌خواند. read_goal_context تعریف، شرط‌ها و تنظیمات واقعی اهداف ماژول را می‌خواند. در فیش حقوقی lines، payments و performance_snapshot و در محاسبات details را با ابزار جزئیات بخوان. خلاصه اولیه و ارقام فیش جای شرح محاسبه نیستند؛ پیش‌نمایش ذخیره‌نشده مودال را قابل مشاهده یا قطعی معرفی نکن. اعداد مالی را از منبع واقعی بگیر و فرمول یا نتیجه را حدس نزن.',
    ].join('\n');
  },
  gatherDomainContext: async () => ({ source: 'on_demand_tools', tools: ['describe_organization_data','read_organization_data','read_employee_context','read_goal_context','read_process_context'], coverage: 'not_loaded' }),
};
