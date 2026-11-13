import { sharedRestSelect, canViewModuleWithPlan, normalizeId } from '../ai-grounding.ts';
import type { DomainSkillModule, SkillExecutionContext } from './types.ts';

export type ProcessTemplateBlueprintStage = {
  stage_name: string;
  sort_order: number;
  default_status: 'todo' | 'in_progress' | 'done' | 'blocked' | 'canceled';
  default_assignee_id?: string | null;
  default_assignee_role_id?: string | null;
  auto_create_task?: boolean;
  wage?: number;
  process_node_key?: string | null;
  process_lane_key?: string | null;
  metadata?: {
    description?: string | null;
    task_type?: string | null;
    duration_hours?: number;
    duration_days?: number;
    duration_value?: number;
    duration_unit?: 'day' | 'hour';
    duration_from?: string;
    due_anchor_type?: string;
    due_anchor_stage_node_key?: string | null;
    weight?: number;
    default_assignee_field?: string | null;
    instruction_ids?: string[];
    process_task_custom_fields?: Array<{ key: string; label: string; type: string; required?: boolean; options?: any[] }>;
    process_task_status_options?: Array<{ value: string; label: string; color?: string }>;
    automation_rules?: Array<Record<string, any>>;
    custom_fields?: Array<{ key: string; label: string; type: string; required?: boolean }>;
    custom_statuses?: Array<{ value: string; label: string; color?: string }>;
    automations?: Array<{ trigger: string; action: string; target?: string }>;
    process_graph?: Record<string, any>;
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
      const rawMeta = stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {};
      const durationValue = Number(stage?.duration_value ?? rawMeta?.duration_value ?? rawMeta?.duration_days ?? rawMeta?.duration_hours ?? 0);
      const durationUnit = String(stage?.duration_unit ?? rawMeta?.duration_unit ?? (rawMeta?.duration_hours ? 'hour' : 'day')) === 'hour' ? 'hour' : 'day';
      const processNodeKey = String(stage?.process_node_key || rawMeta?.process_node_key || `node_${index + 1}`).trim();
      const processLaneKey = String(stage?.process_lane_key || rawMeta?.process_lane_key || 'lane_1').trim();
      const customFields = stage?.process_task_custom_fields || rawMeta?.process_task_custom_fields || rawMeta?.custom_fields;
      const customStatuses = stage?.process_task_status_options || rawMeta?.process_task_status_options || rawMeta?.custom_statuses;
      const automationRules = stage?.automation_rules || rawMeta?.automation_rules || rawMeta?.automations;

      return {
        stage_name: stageName,
        sort_order: Number.isFinite(Number(stage?.sort_order)) ? Number(stage.sort_order) : (index + 1) * 10,
        default_status: (allowedStatuses.has(status) ? status : 'todo') as ProcessTemplateBlueprintStage['default_status'],
        default_assignee_id: stage?.default_assignee_id ? String(stage.default_assignee_id).trim() : null,
        default_assignee_role_id: stage?.default_assignee_role_id ? String(stage.default_assignee_role_id).trim() : null,
        auto_create_task: stage?.auto_create_task !== false,
        wage: Number.isFinite(Number(stage?.wage)) ? Number(stage.wage) : 0,
        process_node_key: processNodeKey,
        process_lane_key: processLaneKey,
        metadata: {
          ...rawMeta,
          ...(stage?.description || rawMeta?.description ? { description: String(stage?.description || rawMeta?.description).trim() } : {}),
          ...(stage?.task_type || rawMeta?.task_type ? { task_type: String(stage?.task_type || rawMeta?.task_type).trim() } : {}),
          ...(durationValue > 0 ? { duration_value: durationValue, duration_unit: durationUnit } : {}),
          ...(stage?.due_anchor_type || rawMeta?.due_anchor_type ? { due_anchor_type: String(stage?.due_anchor_type || rawMeta?.due_anchor_type).trim() } : {}),
          ...(stage?.due_anchor_stage_node_key || rawMeta?.due_anchor_stage_node_key ? { due_anchor_stage_node_key: String(stage?.due_anchor_stage_node_key || rawMeta?.due_anchor_stage_node_key).trim() } : {}),
          ...(Number.isFinite(Number(stage?.weight ?? rawMeta?.weight)) ? { weight: Number(stage?.weight ?? rawMeta?.weight) } : {}),
          ...(stage?.default_assignee_field || rawMeta?.default_assignee_field ? { default_assignee_field: String(stage?.default_assignee_field || rawMeta?.default_assignee_field).trim() } : {}),
          ...(Array.isArray(stage?.instruction_ids || rawMeta?.instruction_ids) ? { instruction_ids: stage?.instruction_ids || rawMeta?.instruction_ids } : {}),
          ...(Array.isArray(customFields) ? { process_task_custom_fields: customFields } : {}),
          ...(Array.isArray(customStatuses) ? { process_task_status_options: customStatuses } : {}),
          ...(Array.isArray(automationRules) ? { automation_rules: automationRules } : {}),
          process_node_key: processNodeKey,
          process_lane_key: processLaneKey,
        },
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
    '## قرارداد تخصصی ایجنت پروژه و فرآیند (دسترسی کامل به ویزارد و جزئیات الگوهای فرآیند V2)',
    'تو دسترسی کامل به جدول `process_templates` و تمام مراحل آن در `process_template_stages` (از جمله `metadata`، گراف مسیرها، فیلدهای اختصاصی، وضعیت‌های اختصاصی، اتوماسیون‌ها و زمان‌بندی‌ها) داری و هرگز نباید بگویی به جزئیات الگوهای فرآیند دسترسی نداری.',
    '1. **ساختار کامل ویزارد تعریف الگوی فرآیند در KalamApp (`process_templates` + `process_template_stages`)**:',
    '   - **گام ۱ (اطلاعات پایه الگو)**: `name` (نام الگو)، `description` (توضیحات)، `module_ids` (ماژول‌های هدف مثل `projects`, `invoices`, `marketing_leads`, `customers`, `production_orders`, `tasks`)، `process_kind` (نوع فرآیند)، `auto_copy_mode`، `is_active`.',
    '   - **گام ۲ (چینش گراف و خطوط موازی/ترتیبی)**: هر مرحله در `process_template_stages` دارای `process_lane_key` (خط/مسیر موازی مثل `lane_1`, `lane_2`)، `process_node_key` (شناسه یکتای گره)، `sort_order` (ترتیب)، و `metadata.process_graph` (اتصالات و وابستگی بین گره‌ها) است.',
    '   - **گام ۳ (جزئیات هر مرحله در ویزارد مراحل)**:',
    '     • هویت مرحله: `stage_name`، `metadata.description`، `metadata.task_type` (نوع فعالیت)، `auto_create_task` (ساخت خودکار تسک در شروع مرحله).',
    '     • مسئولیت: `default_assignee_id` (کاربر مشخص)، `default_assignee_role_id` (نقش سازمانی)، یا `metadata.default_assignee_field` (ارجاع پویا به مسئول رکورد والد).',
    '     • زمان‌بندی و مهلت: `metadata.duration_value`، `metadata.duration_unit` (`day` | `hour`)، `metadata.due_anchor_type` (`process_start` | `previous_stage_due` | `stage_start` | `specific_stage_due`) و `metadata.due_anchor_stage_node_key`.',
    '     • وزن و دستمزد: `metadata.weight` (وزن مرحله در پیشرفت فرآیند) و `wage` (دستمزد مرحله).',
    '     • فرم و وضعیت‌های اختصاصی تسک مرحله: `metadata.process_task_custom_fields` (فیلدهای فرم اختصاصی داخل تسک)، `metadata.process_task_status_options` (وضعیت‌های اختصاصی مرحله) و `metadata.instruction_ids` (دستورالعمل‌های متصل).',
    '     • اتوماسیون مرحله: `metadata.automation_rules` (قوانین خودکار مثل ارسال پیام، تغییر فیلد رکورد، یا ایجاد رکورد هنگام ورود/تکمیل مرحله).',
    '   - وقتی کاربر می‌خواهد یک الگوی فرآیند بسازید یا بازطراحی کنید، بر اساس همین ساختار ویزارد گام‌به‌گام با او جلو برو، الگوهای فعلی سازمان در `active_process_templates` (به همراه مراحل و `stages` داخلشان) را بخوان و تحلیل کن، و پس از نهایی شدن ساختار، نقشه کامل را برای تأیید و ثبت مستقیم ارائه بده.',
    '2. **ایجاد فعالیت (`tasks`) و پروژه (`projects`) با رعایت تقویم جلالی**:',
    '   - نام مسئول را از `orgDirectory` پیدا کن؛ اگر فرد دقیق پیدا نشد یا چند نفر هم‌نام بودند بپرس؛ تاریخ نسبی/جلالی را با `calendarContext` تبدیل کن و اگر روز جمعه یا تعطیل رسمی بود هشدار بده یا اولین روز کاری را پیشنهاد بده.',
    '3. **شناخت اجرای فرآیندها (`process_runs` و `process_run_stages`)**: همیشه وضعیت واقعی مراحل اجراشده، مراحل در جریان و وابستگی‌ها را از `active_process_runs` بخوان و بدون دلیل حدس نزن.',
  ].join('\n'),
  gatherDomainContext: async (ctx: SkillExecutionContext) => {
    const orgId = normalizeId(ctx.grounding.orgId);
    if (!orgId || ctx.grounding.freeChatMode) return null;
    const perms = ctx.authContext?.permissions;
    const plan = ctx.grounding.planContext;
    const bundle: Record<string, any> = {};

    const canTemplates = canViewModuleWithPlan(plan, perms, 'process_templates');
    const [templates, projects, processRuns] = await Promise.all([
      canTemplates
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'process_templates', {
            org_id: `eq.${orgId}`,
            select: 'id,name,description,module_id,module_ids,process_kind,auto_copy_mode,is_active,updated_at',
            order: 'updated_at.desc',
            limit: 30,
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

    const templateIds = (templates || []).map((t: any) => normalizeId(t?.id)).filter(Boolean);
    const templateStages = templateIds.length
      ? await sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'process_template_stages', {
          template_id: `in.(${templateIds.join(',')})`,
          select: 'id,template_id,stage_name,sort_order,default_status,default_assignee_id,default_assignee_role_id,auto_create_task,wage,process_node_key,process_lane_key,metadata',
          order: 'sort_order.asc',
          limit: 300,
        })
      : [];

    const stagesByTemplate = new Map<string, any[]>();
    for (const stage of templateStages || []) {
      const tid = normalizeId(stage?.template_id);
      if (!tid) continue;
      if (!stagesByTemplate.has(tid)) stagesByTemplate.set(tid, []);
      stagesByTemplate.get(tid)!.push(stage);
    }

    const enrichedTemplates = (templates || []).map((tpl: any) => ({
      ...tpl,
      stages: stagesByTemplate.get(normalizeId(tpl?.id)) || [],
    }));

    if (enrichedTemplates.length) bundle.active_process_templates = enrichedTemplates;
    if (projects.length) bundle.recent_projects = projects;
    if (processRuns.length) bundle.active_process_runs = processRuns;
    bundle.process_template_wizard_schema = {
      step_1_basic: ['name', 'description', 'module_ids', 'process_kind', 'auto_copy_mode', 'is_active'],
      step_2_graph_and_lanes: ['process_lane_key', 'process_node_key', 'sort_order', 'metadata.process_graph'],
      step_3_stage_details: [
        'stage_name', 'default_status', 'auto_create_task', 'wage',
        'default_assignee_id', 'default_assignee_role_id', 'metadata.default_assignee_field',
        'metadata.description', 'metadata.task_type', 'metadata.weight',
        'metadata.duration_value', 'metadata.duration_unit', 'metadata.due_anchor_type', 'metadata.due_anchor_stage_node_key',
        'metadata.instruction_ids', 'metadata.process_task_custom_fields', 'metadata.process_task_status_options', 'metadata.automation_rules',
      ],
    };
    return bundle;
  },
};
