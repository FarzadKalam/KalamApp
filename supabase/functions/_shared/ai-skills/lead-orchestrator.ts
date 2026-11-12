import { sharedRestSelect, canViewModuleWithPlan, normalizeId } from '../ai-grounding.ts';
import type { DomainSkillModule, SkillExecutionContext } from './types.ts';

export const leadOrchestratorSkill: DomainSkillModule = {
  agentKey: 'lead_orchestrator',
  titleFa: 'ایجنت راهبر',
  buildContractPrompt: (ctx: SkillExecutionContext) => {
    const activeOtherAgents = (ctx.selectedAgents || []).filter((key) => key !== 'lead_orchestrator');
    return [
      '## قرارداد ایجنت راهبر (Lead Orchestrator)',
      activeOtherAgents.length
        ? `ایجنت‌های تخصصی فعال در این درخواست: ${activeOtherAgents.join('، ')}. وظیفه تو هماهنگ‌کردن داده‌ها، ترتیب گام‌ها و جلوگیری از تداخل بین آن‌هاست.`
        : 'درخواست‌های چندمرحله‌ای یا ترکیبی را به گام‌های شفاف تقسیم کن و در صورت وجود چند گزینه، پیش از اقدام از کاربر تأیید دقیق بگیر.',
      '- در درخواست‌های ویس یا دستورات کوتاه، ابتدا موجودیت‌های واقعی سازمان (مشتری، تأمین‌کننده، همکار، محصول، پروژه، رزرو یا الگوی فرآیند) را با جستجو تطبیق بده و از کاربر نام حدسی نپذیر.',
      '- در هر مرحله اگر دو یا چند رکورد مشابه پیدا شد یا فیلد کلیدی مبهم بود (مثل نوع قیمت، حساب بانکی/صندوق تسویه یا الگوی فرآیند)، فقط گزینه‌های واقعی را به‌صورت انتخابی و کوتاه بپرس.',
      '- برای کارهای پرریسک یا تغییر وضعیت مالی/رکوردی، خلاصه پیش‌نویس را با جدول شفاف و دکمه تأیید ارائه بده.',
    ].join('\n');
  },
  gatherDomainContext: async (ctx: SkillExecutionContext) => {
    const orgId = normalizeId(ctx.grounding.orgId);
    if (!orgId || ctx.grounding.freeChatMode) return null;

    const result: Record<string, any> = {
      active_agents: ctx.selectedAgents,
      org_roles_count: ctx.grounding.orgDirectory.roles.length,
      org_members_count: ctx.grounding.orgDirectory.members.length,
    };

    if (canViewModuleWithPlan(ctx.grounding.planContext, ctx.authContext?.permissions, 'tasks')) {
      const openTasks = await sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'tasks', {
        org_id: `eq.${orgId}`,
        status: 'not.in.(done,canceled,completed)',
        select: 'id,name,system_code,status,priority,due_date,assignee_id,related_to_module',
        order: 'due_date.asc.nullslast,updated_at.desc',
        limit: 8,
      });
      result.priority_open_tasks = openTasks;
    }

    return result;
  },
};
