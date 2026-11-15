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
  buildContractPrompt: () => 'پروژه و فرآیند: از قرارداد و ابزار مرکزی فرآیند استفاده کن؛ ابتدا هدف را مشخص کن، جزئیات لازم را بخوان و پیشنهاد قابل تأیید آماده کن.',
  gatherDomainContext: async () => ({ source: 'on_demand_tools', tool: 'read_process_context', coverage: 'not_loaded' }),
};
