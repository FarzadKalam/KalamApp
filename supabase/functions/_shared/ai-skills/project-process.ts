import { sharedRestSelect, canViewModuleWithPlan, normalizeId } from '../ai-grounding.ts';
import type { DomainSkillModule, SkillExecutionContext } from './types.ts';

export type ProcessTemplateBlueprintStage = {
  stage_name: string;
  sort_order: number;
  default_status: 'todo' | 'in_progress' | 'done' | 'blocked' | 'canceled';
  default_assignee_id?: string | null;
  default_assignee_role_id?: string | null;
  auto_create_task?: boolean;
  metadata?: {
    duration_hours?: number;
    duration_days?: number;
    custom_fields?: Array<{ key: string; label: string; type: string; required?: boolean }>;
    custom_statuses?: Array<{ value: string; label: string; color?: string }>;
    automations?: Array<{ trigger: string; action: string; target?: string }>;
  };
};

export type ProcessTemplateBlueprint = {
  name: string;
  description: string;
  module_ids: string[];
  process_kind?: string;
  stages: ProcessTemplateBlueprintStage[];
};

export const normalizeProcessTemplateBlueprint = (raw: any): ProcessTemplateBlueprint | null => {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || raw.template_name || '').trim();
  const moduleIds = Array.isArray(raw.module_ids)
    ? raw.module_ids.map((m: any) => String(m || '').trim()).filter(Boolean)
    : raw.module_id
    ? [String(raw.module_id).trim()]
    : ['projects'];
  const rawStages = Array.isArray(raw.stages) ? raw.stages : [];
  if (!name || rawStages.length === 0) return null;

  const allowedStatuses = new Set(['todo', 'in_progress', 'done', 'blocked', 'canceled']);
  const stages: ProcessTemplateBlueprintStage[] = rawStages
    .map((stage: any, index: number) => {
      const stageName = String(stage?.stage_name || stage?.name || '').trim();
      if (!stageName) return null;
      const status = String(stage?.default_status || 'todo').trim();
      return {
        stage_name: stageName,
        sort_order: Number.isFinite(Number(stage?.sort_order)) ? Number(stage.sort_order) : (index + 1) * 10,
        default_status: (allowedStatuses.has(status) ? status : 'todo') as ProcessTemplateBlueprintStage['default_status'],
        default_assignee_id: stage?.default_assignee_id ? String(stage.default_assignee_id).trim() : null,
        default_assignee_role_id: stage?.default_assignee_role_id ? String(stage.default_assignee_role_id).trim() : null,
        auto_create_task: stage?.auto_create_task !== false,
        metadata: stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {},
      };
    })
    .filter((s: ProcessTemplateBlueprintStage | null): s is ProcessTemplateBlueprintStage => Boolean(s));

  if (!stages.length) return null;
  return {
    name,
    description: String(raw.description || '').trim(),
    module_ids: Array.from(new Set(moduleIds)),
    process_kind: raw.process_kind ? String(raw.process_kind).trim() : undefined,
    stages,
  };
};

export const projectProcessSkill: DomainSkillModule = {
  agentKey: 'project_process',
  titleFa: 'ایجنت پروژه و فرآیند',
  buildContractPrompt: () => [
    '## قرارداد تخصصی ایجنت پروژه و فرآیند (منطبق بر قرارداد فرآیند V2)',
    '1. **طراحی و ساخت الگوی فرآیند کامل (`process_templates` + `process_template_stages`)**:',
    '   - وقتی کاربر می‌خواهد یک فرآیند یا الگو تعریف کند (مثلاً «باهم فرآیند تعریف کنیم و الگوی فرآیند بسازیم کاملِ کامل»)، ابتدا در ۲ تا ۳ سؤال شفاف ماژول‌های هدف، ترتیب مراحل، مسئول هر مرحله (شخص یا نقش سازمانی)، مهلت کاری و نیاز به وضعیت‌ها/فیلدها/اتوماسیون‌های اختصاصی را نهایی کن.',
    '   - پس از روشن شدن ساختار، یک نقشه کامل شامل: نام الگو، `module_ids`، آرایه مراحل با `sort_order`، `default_assignee_role_id`/`default_assignee_id`، زمان‌بندی، فیلدهای اختصاصی و اتوماسیون‌ها تولید کن و برای تأیید و ثبت مستقیم ارائه بده.',
    '2. **ایجاد فعالیت (`tasks`) و پروژه (`projects`) با رعایت تقویم جلالی**:',
    '   - برای «یه فعالیت ایجاد کن واسه فلانی»، نام مسئول را از `orgDirectory` پیدا کن؛ اگر فرد دقیق پیدا نشد یا چند نفر هم‌نام بودند بپرس؛ تاریخ نسبی/جلالی را با `calendarContext` تبدیل کن و اگر روز جمعه یا تعطیل رسمی بود هشدار بده یا اولین روز کاری را پیشنهاد بده.',
    '3. **شناخت اجرای فرآیندها (`process_runs`)**: هرگز پیش‌نویس، اجرای فعال و وابستگی مراحل را بدون دلیل حذف یا حدس نزن.',
  ].join('\n'),
  gatherDomainContext: async (ctx: SkillExecutionContext) => {
    const orgId = normalizeId(ctx.grounding.orgId);
    if (!orgId || ctx.grounding.freeChatMode) return null;
    const perms = ctx.authContext?.permissions;
    const plan = ctx.grounding.planContext;
    const bundle: Record<string, any> = {};

    const [templates, projects, processRuns] = await Promise.all([
      canViewModuleWithPlan(plan, perms, 'process_templates')
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'process_templates', {
            org_id: `eq.${orgId}`,
            is_active: 'eq.true',
            select: 'id,name,description,module_id,module_ids,process_kind',
            order: 'updated_at.desc',
            limit: 12,
          })
        : Promise.resolve([]),
      canViewModuleWithPlan(plan, perms, 'projects')
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'projects', {
            org_id: `eq.${orgId}`,
            select: 'id,name,system_code,status,customer_id,assignee_id,process_template_id,updated_at',
            order: 'updated_at.desc',
            limit: 10,
          })
        : Promise.resolve([]),
      canViewModuleWithPlan(plan, perms, 'process_runs')
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'process_runs', {
            org_id: `eq.${orgId}`,
            status: 'eq.active',
            select: 'id,process_name,module_id,record_id,template_id,status,updated_at',
            order: 'updated_at.desc',
            limit: 10,
          })
        : Promise.resolve([]),
    ]);

    if (templates.length) bundle.active_process_templates = templates;
    if (projects.length) bundle.recent_projects = projects;
    if (processRuns.length) bundle.active_process_runs = processRuns;
    return bundle;
  },
};
