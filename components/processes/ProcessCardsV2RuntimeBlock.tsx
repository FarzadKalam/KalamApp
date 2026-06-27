import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Modal, Skeleton } from 'antd';
import { FieldType, type ModuleField } from '../../types';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import { safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import { fetchProcessRuntimeBatchForRecord } from '../../utils/processRuntimeBatch';
import { type ProcessRuntimeSnapshot } from '../../utils/processRuntimeSnapshot';
import {
  fetchAssigneeDirectory,
  fetchDynamicOptionsMap,
  fetchProcessTemplateOptions,
  fetchProcessTemplateRows,
  fetchTagOptions,
  type AssigneeDirectory,
} from '../../utils/referenceData';
import { supportsGlobalRoleAssignee } from '../../utils/assigneeSupport';
import { fetchSessionBootstrap } from '../../utils/sessionCache';
import { loadProcessTemplateStages } from '../../utils/processTemplateStages';
import {
  assignProcessTemplateModuleAliases,
  resolveProcessTemplateTokenValue,
} from '../../utils/processTemplateContext';
import { normalizeProcessTargetModuleIds, parseProcessLinkMap } from '../../utils/processTargets';
import { fetchRecordReferenceLabels, buildRecordReferenceKey } from '../../utils/recordReference';
import { fetchRelationOptionsForField } from '../../utils/relationOptions';
import { runSelectWithCompatibleColumns } from '../../utils/selectCompat';
import { getAssigneeLabel } from '../../utils/assigneeLabel';
import { resolveTaskSourceLink } from '../../utils/taskMeta';
import { WORKFLOW_ASSIGNEE_FIELD_KEY } from '../../utils/workflowTypes';
import { getProcessAutomationConditionFieldsForModules } from '../../utils/workflowHelpers';
import {
  createProcessTriggerKey,
  getProcessStageLaneKey,
  getProcessStageNodeKey,
  getProcessStagesByLane,
  materializeLegacyProcessGraph,
  PROCESS_LANE_KEY,
  PROCESS_NODE_KEY,
} from '../../utils/processGraph';
import {
  getTaskStatusLabel,
} from '../../utils/processTaskStatusOptions';
import {
  autoAssignProcessV2DraftStages,
  buildProcessV2TemplateContext,
} from '../../utils/processV2AutoAssign';
import ProcessCardsV2, {
  getProcessV2StageMatchIds,
  mapTaskStatusToStageStatus,
  processV2StageMatches,
  type ProcessV2CardData,
  type ProcessV2Lane,
  type ProcessV2RunCard,
  type ProcessV2Stage,
  type ProcessV2StageStatus,
  type ProcessV2TemplateOption,
  type ProcessV2Variant,
} from './ProcessCardsV2';
import ProcessActivatorModal from './ProcessActivatorModal';

type ProcessCardsV2RuntimeBlockProps = {
  moduleId?: string | null;
  recordId?: string | null;
  recordData?: any;
  draftStages?: any[];
  onDraftStagesChange?: (stages: any[]) => void | Promise<void>;
  fieldKey?: string | null;
  runtimeSnapshot?: ProcessRuntimeSnapshot | null;
  variant?: ProcessV2Variant;
  enabled?: boolean;
  highlightedTaskId?: string | null;
  highlightedRunStageId?: string | null;
};

type RuntimeState = {
  runs: any[];
  stages: any[];
  tasks: any[];
};

type ProcessRuntimeBlockCacheEntry = {
  runtime: RuntimeState;
  templateStages: any[];
  savedAt: number;
};

type ProcessRuntimeReferenceCache = {
  orgId: string;
  directory: AssigneeDirectory | null;
  templates: ProcessV2TemplateOption[];
  savedAt: number;
};

const PROCESS_RUNTIME_BLOCK_CACHE_TTL_MS = 30_000;
const PROCESS_RUNTIME_REFERENCE_CACHE_TTL_MS = 90_000;
const processRuntimeBlockCache = new Map<string, ProcessRuntimeBlockCacheEntry>();
let processRuntimeReferenceCache: ProcessRuntimeReferenceCache | null = null;
const EMPTY_RUNTIME_STATE: RuntimeState = { runs: [], stages: [], tasks: [] };
const EMPTY_STAGE_LIST: any[] = [];

const normalizeText = (value: unknown) => String(value || '').trim();

const isProcessTemplateModule = (moduleId?: string | null) => normalizeText(moduleId) === 'process_templates';
const isProcessRunModule = (moduleId?: string | null) => normalizeText(moduleId) === 'process_runs';

type ActivatorOptionList = Array<{ label: string; value: string }>;

const buildStableProcessStartTriggerKey = (templateId?: string | null) => {
  const normalized = normalizeText(templateId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return normalized ? `trigger_process_start_${normalized}` : createProcessTriggerKey();
};

const loadActivatorFieldOptions = async (
  field: ModuleField,
  moduleScopeId: string,
): Promise<ActivatorOptionList> => {
  const scopeModuleId = normalizeText((field as any)?.workflowOptionScopeModuleId || moduleScopeId);

  if (field.key === WORKFLOW_ASSIGNEE_FIELD_KEY || normalizeText(field.key).endsWith(`__${WORKFLOW_ASSIGNEE_FIELD_KEY}`)) {
    const directory = await fetchAssigneeDirectory(supabase);
    const userOptions = (directory.users || []).map((user) => ({
      label: normalizeText(user?.display_name || user?.full_name || user?.id),
      value: `user_${normalizeText(user?.id)}`,
    })).filter((item) => item.value !== 'user_');

    const roleOptions = supportsGlobalRoleAssignee(scopeModuleId)
      ? (directory.roles || []).map((role) => ({
          label: normalizeText(role?.title || role?.id),
          value: `role_${normalizeText(role?.id)}`,
        })).filter((item) => item.value !== 'role_')
      : [];

    return [...userOptions, ...roleOptions];
  }

  if (field.type === FieldType.TAGS) {
    return fetchTagOptions(supabase);
  }

  if (field.type === FieldType.USER) {
    const directory = await fetchAssigneeDirectory(supabase);
    return (directory.users || []).map((user) => ({
      label: normalizeText(user?.display_name || user?.full_name || 'بدون عنوان'),
      value: normalizeText(user?.id),
    })).filter((item) => item.value);
  }

  const relationConfig = field.type === FieldType.MULTI_RELATION
    ? field?.multiRelationConfig
    : field?.relationConfig;
  const targetModule = normalizeText(relationConfig?.targetModule);
  if (!targetModule) return [];

  if (targetModule === 'process_templates') {
    return fetchProcessTemplateOptions(supabase, scopeModuleId);
  }

  const effectiveField = field.type === FieldType.MULTI_RELATION
    ? { ...field, relationConfig }
    : field;

  return fetchRelationOptionsForField(supabase, effectiveField, { limit: 300 });
};

const loadActivatorEditorOptions = async (
  moduleId: string,
  fields: ModuleField[],
): Promise<{
  dynamicOptions: Record<string, ActivatorOptionList>;
  relationOptions: Record<string, ActivatorOptionList>;
}> => {
  if (!moduleId || !MODULES[moduleId]) {
    return { dynamicOptions: {}, relationOptions: {} };
  }

  const dynamicCategories = Array.from(new Set(
    (fields || [])
      .map((field) => field.dynamicOptionsCategory)
      .filter((category): category is string => Boolean(category)),
  ));
  const dynamicOptions = await fetchDynamicOptionsMap(supabase, dynamicCategories);
  const relationOptions: Record<string, ActivatorOptionList> = {};

  const optionFields = (fields || []).filter((field) => (
    field.key === WORKFLOW_ASSIGNEE_FIELD_KEY
    || normalizeText(field.key).endsWith(`__${WORKFLOW_ASSIGNEE_FIELD_KEY}`)
    || field.type === FieldType.RELATION
    || field.type === FieldType.MULTI_RELATION
    || field.type === FieldType.USER
    || field.type === FieldType.TAGS
  ));

  await Promise.allSettled(optionFields.map(async (field) => {
    relationOptions[field.key] = await loadActivatorFieldOptions(field, moduleId);
  }));

  return { dynamicOptions, relationOptions };
};

const parseObject = (value: unknown): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const stringifyTemplateValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(stringifyTemplateValue).filter(Boolean).join('، ');
  if (typeof value === 'object') {
    const candidate = value as Record<string, any>;
    return normalizeText(candidate.title || candidate.name || candidate.label || candidate.system_code || '');
  }
  return normalizeText(value);
};

const renderTemplateText = (rawValue: unknown, context: Record<string, any>) => {
  if (typeof rawValue !== 'string') return normalizeText(rawValue);
  return rawValue.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_token, key: string) => (
    stringifyTemplateValue(resolveProcessTemplateTokenValue(context, key)) || _token
  )).replace(/\s+/g, ' ').trim();
};

const hasTemplateTokens = (value: unknown) => typeof value === 'string' && /\{\{\s*[^}]+?\s*\}\}/.test(value);

const collectStageTemplateSourceText = (stage: any) => normalizeText(stage?.stage_name || stage?.name || stage?.title || stage?.label);

const collectStageProcessLinks = (stage: any) => {
  const metadata = parseObject(stage?.metadata);
  const recurrence = parseObject(stage?.recurrence_info || metadata?.recurrence_info);
  return parseProcessLinkMap(stage?.process_links || recurrence?.process_links || metadata?.process_links || metadata?.process_link_map);
};

const formatDueLabel = (value: unknown) => {
  const raw = normalizeText(value);
  if (!raw) return undefined;
  return toPersianNumber(safeJalaliFormat(raw, raw.includes(':') ? 'YYYY/MM/DD HH:mm' : 'YYYY/MM/DD') || raw);
};

const mapStageStatus = (status: unknown, kind: 'draft' | 'activity'): ProcessV2StageStatus => {
  if (kind === 'draft') return 'draft';
  const normalized = normalizeText(status).toLowerCase();
  if (['done', 'completed', 'confirmed', 'final', 'settled'].includes(normalized)) return 'done';
  if (['in_progress', 'active', 'started', 'doing', 'review'].includes(normalized)) return 'active';
  if (['blocked', 'failed', 'rejected'].includes(normalized)) return 'blocked';
  if (['canceled', 'cancelled'].includes(normalized)) return 'canceled';
  return 'waiting';
};

const resolveFieldAssigneeLabel = (rawValue: unknown, stage: any, fallbackModuleId?: string | null) => {
  const raw = normalizeText(rawValue);
  if (!raw.startsWith('field:')) return '';
  const fieldKey = raw.replace(/^field:/, '').trim();
  const metadata = parseObject(stage?.metadata);
  const targetModuleIds = [
    ...(Array.isArray(stage?.process_target_module_ids) ? stage.process_target_module_ids : []),
    ...(Array.isArray(metadata?.process_target_module_ids) ? metadata.process_target_module_ids : []),
    fallbackModuleId,
  ].map(normalizeText).filter(Boolean);
  const primaryModuleId = targetModuleIds[0] || normalizeText(fallbackModuleId);
  if (fieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY || fieldKey.endsWith(`.${WORKFLOW_ASSIGNEE_FIELD_KEY}`) || fieldKey.includes(WORKFLOW_ASSIGNEE_FIELD_KEY)) {
    return getAssigneeLabel(primaryModuleId) || 'مسئول پیش فرض';
  }
  const field = targetModuleIds
    .map((moduleId) => MODULES[moduleId]?.fields?.find((item: any) => normalizeText(item?.key) === fieldKey))
    .find(Boolean) as any;
  return normalizeText(field?.labels?.fa || field?.labelFa) || 'مسئول پیش فرض';
};

const resolveAssignee = (stage: any, directory: AssigneeDirectory | null, fallbackModuleId?: string | null) => {
  const metadata = parseObject(stage?.metadata);
  const userId = normalizeText(stage?.assignee_user_id || stage?.assignee_id || stage?.default_assignee_id || metadata?.assignee_user_id);
  const roleId = normalizeText(stage?.assignee_role_id || stage?.default_assignee_role_id || metadata?.assignee_role_id);
  const fieldLabel = resolveFieldAssigneeLabel(userId || metadata?.default_assignee_field, stage, fallbackModuleId);
  if (fieldLabel) {
    return {
      label: fieldLabel,
      avatarUrl: undefined,
    };
  }
  if (userId) {
    const user = directory?.users?.find((item) => normalizeText(item.id) === userId);
    return {
      label: user?.display_name || user?.full_name || 'کاربر مسئول',
      avatarUrl: user?.avatar_url || undefined,
    };
  }
  if (roleId) {
    const role = directory?.roles?.find((item) => normalizeText(item.id) === roleId);
    return {
      label: role?.title || 'نقش مسئول',
      avatarUrl: undefined,
    };
  }
  return { label: 'تعیین نشده', avatarUrl: undefined };
};

const resolveStageActivityType = (stage: any) => {
  const metadata = parseObject(stage?.metadata);
  const recurrence = parseObject(stage?.recurrence_info || metadata?.recurrence_info);
  return normalizeText(stage?.task_type || metadata?.task_type || recurrence?.task_type) || undefined;
};

const getAutomationActionCount = (stage: any) => {
  const metadata = parseObject(stage?.metadata);
  const recurrence = parseObject(stage?.recurrence_info || metadata?.recurrence_info);
  const sourceStage = stage?.source_stage && typeof stage.source_stage === 'object' ? stage.source_stage : {};
  const sourceMetadata = parseObject(sourceStage?.metadata);
  const candidates = [
    stage?.automation_rules,
    metadata?.automation_rules,
    recurrence?.automation_rules,
    sourceStage?.automation_rules,
    sourceMetadata?.automation_rules,
  ];
  const rules = candidates.find((value) => Array.isArray(value)) || [];
  const count = (rules as any[]).reduce((sum, rule) => (
    sum + (Array.isArray(rule?.actions) ? rule.actions.length : 0)
  ), 0);
  return Number.isFinite(count) ? count : 0;
};

const mapRawStageToV2 = (
  stage: any,
  index: number,
  kind: 'draft' | 'activity',
  directory: AssigneeDirectory | null,
  templateContext: Record<string, any>,
  fallbackModuleId?: string | null,
  renderTemplateVariables = true,
): ProcessV2Stage => {
  const metadata = parseObject(stage?.metadata);
  const status = normalizeText(stage?.status || metadata?.status).toLowerCase();
  const explicitDraft = (
    stage?.is_draft === true
    || metadata?.is_draft === true
    || metadata?.draft === true
    || ['draft', 'template', 'not_assigned', 'unassigned'].includes(status)
  );
  const hasLinkedTaskId = Boolean(normalizeText(stage?.task_id));
  const hasRealTask = stage?.__process_v2_has_real_task === true || (!explicitDraft && hasLinkedTaskId);
  const effectiveKind = explicitDraft || (kind === 'activity' && !hasRealTask) ? 'draft' : kind;
  const assignee = resolveAssignee(stage, directory, fallbackModuleId);
  const rawDue = stage?.planned_due_at || stage?.due_date || metadata?.planned_due_at || metadata?.due_date;
  const automationActionCount = getAutomationActionCount(stage);
  const fallbackActionCount = Number(stage?.action_count ?? metadata?.action_count ?? metadata?.actions_count ?? 0);
  const actionCount = automationActionCount > 0 ? automationActionCount : fallbackActionCount;
  const statusLabel = effectiveKind === 'draft' ? 'پیش نویس' : getTaskStatusLabel(status || 'todo', stage);
  const activityType = resolveStageActivityType(stage);
  const rawTitle = normalizeText(stage?.stage_name || stage?.name || stage?.title || stage?.label) || `مرحله ${toPersianNumber(index + 1)}`;
  const title = renderTemplateVariables ? (renderTemplateText(rawTitle, templateContext) || rawTitle) : rawTitle;
  return {
    id: normalizeText(stage?.id || stage?.template_stage_id || stage?.process_run_stage_id || stage?.[PROCESS_NODE_KEY]) || `stage_${index + 1}`,
    title,
    kind: effectiveKind,
    status: mapStageStatus(status, effectiveKind),
    layoutSlot: index,
    assigneeLabel: assignee.label,
    assigneeAvatarUrl: assignee.avatarUrl,
    activityTypeLabel: activityType,
    dueLabel: formatDueLabel(rawDue),
    actionCount: Number.isFinite(actionCount) ? Math.max(0, actionCount) : 0,
    metaLabel: statusLabel,
    source: stage,
  };
};

const buildLanesFromStages = (
  stages: any[],
  kind: 'draft' | 'activity',
  directory: AssigneeDirectory | null,
  templateContext: Record<string, any>,
  fallbackModuleId?: string | null,
  renderTemplateVariables = true,
): ProcessV2Lane[] => {
  const materialized = materializeLegacyProcessGraph(Array.isArray(stages) ? stages : []);
  const lanes = getProcessStagesByLane(materialized.stages, materialized.graph)
    .map((lane, laneIndex) => ({
      id: normalizeText(lane.key) || `lane_${laneIndex + 1}`,
      title: normalizeText(lane.name) || `ردیف ${toPersianNumber(laneIndex + 1)}`,
      stages: lane.stages.map((stage: any, stageIndex: number) => {
        const stageWithGraphKeys = {
          ...stage,
          [PROCESS_LANE_KEY]: stage?.[PROCESS_LANE_KEY] || lane.key,
        };
        return mapRawStageToV2(stageWithGraphKeys, stageIndex, kind, directory, templateContext, fallbackModuleId, renderTemplateVariables);
      }),
    }))
    .filter((lane) => lane.stages.length > 0);

  return lanes.length > 0 ? lanes : [{ id: 'lane_1', title: 'ردیف اصلی', stages: [] }];
};

const getModuleLabel = (moduleId?: string | null) => {
  const normalized = normalizeText(moduleId);
  return MODULES[normalized]?.titles?.fa || MODULES[normalized]?.titles?.faSingular || normalized || 'رکورد';
};

const collectProcessRelatedRecords = (item: ProcessV2CardData) => {
  const refs = new Map<string, { moduleId: string; recordId: string }>();
  const addRef = (moduleId?: unknown, recordId?: unknown) => {
    const normalizedModuleId = normalizeText(moduleId);
    const normalizedRecordId = normalizeText(recordId);
    if (!normalizedModuleId || !normalizedRecordId) return;
    refs.set(buildRecordReferenceKey(normalizedModuleId, normalizedRecordId), {
      moduleId: normalizedModuleId,
      recordId: normalizedRecordId,
    });
  };

  item.lanes.forEach((lane) => {
    lane.stages.forEach((stage) => {
      const source = stage.source && typeof stage.source === 'object' ? stage.source : {};
      const metadata = parseObject(source?.metadata);
      const recurrence = parseObject(source?.recurrence_info);
      [
        source?.process_links,
        source?.process_link_map,
        metadata?.process_links,
        metadata?.process_link_map,
        recurrence?.process_links,
      ].forEach((value) => {
        Object.entries(parseProcessLinkMap(value)).forEach(([moduleId, recordId]) => addRef(moduleId, recordId));
      });
      addRef(source?.source_module_id, source?.source_record_id);
    });
  });

  return Array.from(refs.values());
};

const buildTemplateCard = (
  recordData: any,
  templateStages: any[],
  directory: AssigneeDirectory | null,
  templateContext: Record<string, any>,
  renderTemplateVariables = true,
): ProcessV2CardData | null => {
  const id = normalizeText(recordData?.id);
  if (!id) return null;
  return {
    mode: 'template',
    id,
    title: normalizeText(recordData?.name) || 'الگوی فرآیند',
    moduleLabel: getModuleLabel(recordData?.module_id || (Array.isArray(recordData?.module_ids) ? recordData.module_ids[0] : '')),
    activatorLabel: 'فعال کننده',
    realtimeLabel: 'زنده',
    lanes: buildLanesFromStages(
      templateStages,
      'draft',
      directory,
      templateContext,
      recordData?.module_id || (Array.isArray(recordData?.module_ids) ? recordData.module_ids[0] : ''),
      renderTemplateVariables,
    ),
  };
};

const buildRunCard = (
  run: any,
  stages: any[],
  directory: AssigneeDirectory | null,
  fallbackRecordLabel: string,
  templateNameById?: Map<string, string>,
  templateContext: Record<string, any> = {},
): ProcessV2CardData | null => {
  const id = normalizeText(run?.id);
  if (!id) return null;
  const templateId = normalizeText(run?.template_id);
  const templateTitle = normalizeText(run?.template_name || run?.metadata?.source_template_name)
    || (templateId ? templateNameById?.get(templateId) : '')
    || 'الگوی فرآیند';
  return {
    mode: 'run',
    id,
    title: normalizeText(run?.process_name) || templateTitle || 'فرآیند',
    templateId,
    templateTitle,
    relatedRecordLabel: fallbackRecordLabel,
    statusLabel: normalizeText(run?.status) || 'active',
    realtimeLabel: 'زنده',
    lanes: buildLanesFromStages(stages, 'activity', directory, templateContext, run?.module_id),
  };
};

const resolveDraftGroupMeta = (stage: any) => {
  const metadata = parseObject(stage?.metadata);
  const processGroup = parseObject(stage?.process_group || metadata?.process_group);
  const templateId = normalizeText(stage?.source_template_id || metadata?.source_template_id || processGroup?.template_id);
  const groupId = normalizeText(stage?.process_group_id || metadata?.process_group_id || processGroup?.id || templateId) || 'default_process_group';
  const label = normalizeText(stage?.process_group_name || metadata?.process_group_name || processGroup?.name || stage?.source_template_name || metadata?.source_template_name);
  return {
    groupId,
    label: label || 'فرآیند پیش نویس',
    templateId,
    templateName: normalizeText(stage?.source_template_name || metadata?.source_template_name || processGroup?.template_name) || label || 'الگوی فرآیند',
  };
};

const collectRawStageIdentityIds = (stage: any, index = 0) => {
  const metadata = parseObject(stage?.metadata);
  const sourceStage = stage?.source_stage && typeof stage.source_stage === 'object' ? stage.source_stage : {};
  return [
    stage?.id,
    stage?.task_id,
    stage?.template_stage_id,
    stage?.process_run_stage_id,
    stage?.run_stage_id,
    stage?.process_node_key,
    stage?.[PROCESS_NODE_KEY],
    metadata?.id,
    metadata?.task_id,
    metadata?.template_stage_id,
    metadata?.process_run_stage_id,
    metadata?.run_stage_id,
    metadata?.process_node_key,
    metadata?.[PROCESS_NODE_KEY],
    sourceStage?.id,
    sourceStage?.task_id,
    sourceStage?.template_stage_id,
    sourceStage?.process_run_stage_id,
    sourceStage?.run_stage_id,
    sourceStage?.process_node_key,
    getProcessStageNodeKey(stage, index),
  ].map(normalizeText).filter(Boolean);
};

const rawStageMatchesV2Stage = (rawStage: any, stage: ProcessV2Stage, index = 0) => {
  const matchIds = getProcessV2StageMatchIds(stage);
  if (matchIds.size === 0) return false;
  return collectRawStageIdentityIds(rawStage, index).some((id) => matchIds.has(id));
};

const buildDraftProcessCards = (
  draftStages: any[],
  directory: AssigneeDirectory | null,
  templateNameById: Map<string, string>,
  runtimeRuns: any[],
  templateContext: Record<string, any>,
  fallbackModuleId?: string | null,
): ProcessV2CardData[] => {
  const runtimeGroupIds = new Set(
    (runtimeRuns || [])
      .map((run: any) => normalizeText(run?.process_group_id))
      .filter(Boolean),
  );
  const groups = new Map<string, { id: string; label: string; templateId: string; templateName: string; stages: any[]; firstSort: number }>();

  (Array.isArray(draftStages) ? draftStages : []).forEach((stage: any, index: number) => {
    const meta = resolveDraftGroupMeta(stage);
    if (runtimeGroupIds.has(meta.groupId)) return;
    const sortOrder = Number(stage?.sort_order || ((index + 1) * 10));
    if (!groups.has(meta.groupId)) {
      groups.set(meta.groupId, {
        id: meta.groupId,
        label: meta.label,
        templateId: meta.templateId,
        templateName: meta.templateName,
        stages: [],
        firstSort: Number.isFinite(sortOrder) ? sortOrder : index,
      });
    }
    groups.get(meta.groupId)!.stages.push(stage);
  });

  return Array.from(groups.values())
    .sort((left, right) => left.firstSort - right.firstSort)
    .map((group) => ({
      mode: 'run' as const,
      id: `draft:${group.id}`,
      title: group.label || group.templateName || 'فرآیند پیش نویس',
      templateId: group.templateId,
      templateTitle: group.templateId ? (templateNameById.get(group.templateId) || group.templateName) : group.templateName,
      relatedRecordLabel: '',
      statusLabel: 'draft',
      lanes: buildLanesFromStages(group.stages, 'draft', directory, templateContext, fallbackModuleId),
    }));
};

const TASK_RUNTIME_COLUMNS = [
  'id',
  'name',
  'status',
  'task_type',
  'assignee_id',
  'assignee_role_id',
  'assignee_type',
  'sort_order',
  'process_group_id',
  'process_run_id',
  'process_run_stage_id',
  'recurrence_info',
  'source_module_id',
  'source_record_id',
  'source_template_id',
  'source_stage_sort_order',
  'due_date',
  'metadata',
] as const;

const fetchRuntimeTasksByColumn = async (
  cacheKey: string,
  column: 'id' | 'process_run_id' | 'process_run_stage_id',
  ids: string[],
) => {
  if (ids.length === 0) return { data: [], error: null };
  return runSelectWithCompatibleColumns<any[]>({
    cacheKey,
    columns: TASK_RUNTIME_COLUMNS,
    execute: (selectExpr) => supabase
      .from('tasks')
      .select(selectExpr)
      .in(column, ids),
  });
};

const fetchRuntimeTasks = async (runs: any[], stages: any[]) => {
  const taskIds = Array.from(new Set((stages || []).map((stage: any) => normalizeText(stage?.task_id)).filter(Boolean)));
  const runIds = Array.from(new Set((runs || []).map((run: any) => normalizeText(run?.id)).filter(Boolean)));
  const stageIds = Array.from(new Set((stages || []).flatMap((stage: any) => [
    normalizeText(stage?.id),
    normalizeText(stage?.process_run_stage_id),
  ]).filter(Boolean)));
  const results = await Promise.allSettled([
    taskIds.length
      ? fetchRuntimeTasksByColumn('process-v2-runtime:tasks:id', 'id', taskIds)
      : Promise.resolve({ data: [], error: null }),
    runIds.length
      ? fetchRuntimeTasksByColumn('process-v2-runtime:tasks:process-run', 'process_run_id', runIds)
      : Promise.resolve({ data: [], error: null }),
    stageIds.length
      ? fetchRuntimeTasksByColumn('process-v2-runtime:tasks:run-stage', 'process_run_stage_id', stageIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const byId = new Map<string, any>();
  results.forEach((result) => {
    if (result.status !== 'fulfilled') return;
    const value = result.value as { data?: any[]; error?: any };
    if (value.error || !Array.isArray(value.data)) return;
    value.data.forEach((task) => {
      const id = normalizeText(task?.id);
      if (id) byId.set(id, task);
    });
  });
  return Array.from(byId.values());
};

const fetchRunStages = async (runId: string) => {
  if (!runId) return [];
  const extended = await supabase
    .from('process_run_stages')
    .select('id, process_run_id, template_stage_id, stage_name, sort_order, status, task_id, assignee_user_id, assignee_role_id, planned_due_at, completed_at, metadata, process_node_key, process_lane_key')
    .eq('process_run_id', runId)
    .order('sort_order', { ascending: true });
  if (!extended.error) return extended.data || [];

  const fallback = await supabase
    .from('process_run_stages')
    .select('id, process_run_id, template_stage_id, stage_name, sort_order, status, task_id, assignee_user_id, assignee_role_id, metadata')
    .eq('process_run_id', runId)
    .order('sort_order', { ascending: true });
  if (fallback.error) throw fallback.error;
  return fallback.data || [];
};

const isUnsupportedRecycleError = (error: any) => {
  const text = normalizeText(error?.message || error?.details || error?.hint).toLowerCase();
  return (
    text.includes('not valid')
    || text.includes('valid')
    || text.includes('schema cache')
    || text.includes('function')
    || text.includes('معتبر')
    || text.includes('پیدا نشد')
  );
};

const moveProcessRowsToRecycleBin = async (
  sourceTable: 'process_templates' | 'process_template_stages' | 'process_runs' | 'process_run_stages',
  moduleId: string,
  ids: string[],
) => {
  const normalizedIds = Array.from(new Set(ids.map(normalizeText).filter(Boolean)));
  if (normalizedIds.length === 0) return 0;
  const actor = await fetchSessionBootstrap(supabase);
  const { data, error } = await supabase.rpc('move_records_to_recycle_bin', {
    p_module_id: moduleId,
    p_source_table: sourceTable,
    p_record_ids: normalizedIds,
    p_deleted_by: actor.user?.id || null,
    p_deleted_by_name: actor.profile?.full_name || null,
    p_org_id: actor.orgId || null,
  });
  if (error) throw error;
  return Number(data || 0) || 0;
};

const deleteProcessRowsDirectly = async (
  sourceTable: 'process_template_stages' | 'process_run_stages',
  ids: string[],
) => {
  const normalizedIds = Array.from(new Set(ids.map(normalizeText).filter(Boolean)));
  if (normalizedIds.length === 0) return 0;
  const { error } = await (supabase.from(sourceTable as any) as any)
    .delete()
    .in('id', normalizedIds);
  if (error) throw error;
  return normalizedIds.length;
};

const recycleOrDeleteProcessRows = async (
  sourceTable: 'process_template_stages' | 'process_run_stages',
  moduleId: string,
  ids: string[],
) => {
  try {
    return await moveProcessRowsToRecycleBin(sourceTable, moduleId, ids);
  } catch (error) {
    if (!isUnsupportedRecycleError(error)) throw error;
    return deleteProcessRowsDirectly(sourceTable, ids);
  }
};

const ProcessCardsV2RuntimeBlock: React.FC<ProcessCardsV2RuntimeBlockProps> = ({
  moduleId,
  recordId,
  recordData,
  draftStages,
  onDraftStagesChange,
  fieldKey,
  runtimeSnapshot,
  variant = 'full',
  enabled = true,
  highlightedTaskId,
  highlightedRunStageId,
}) => {
  const { message } = App.useApp();
  const normalizedModuleId = normalizeText(moduleId);
  const normalizedRecordId = normalizeText(recordId || recordData?.id);
  const cacheKey = `${normalizedModuleId}:${normalizedRecordId}`;
  const cachedRuntimeBlock = processRuntimeBlockCache.get(cacheKey);
  const cacheFresh = Boolean(cachedRuntimeBlock && Date.now() - cachedRuntimeBlock.savedAt < PROCESS_RUNTIME_BLOCK_CACHE_TTL_MS);
  const initialRuntimeSnapshot = runtimeSnapshot || EMPTY_RUNTIME_STATE;
  const [orgId, setOrgId] = useState<string>('');
  const [templateStages, setTemplateStages] = useState<any[]>(() => (
    cacheFresh && cachedRuntimeBlock ? cachedRuntimeBlock.templateStages : (Array.isArray(draftStages) ? draftStages : EMPTY_STAGE_LIST)
  ));
  const [runtime, setRuntime] = useState<RuntimeState>(() => ({
    runs: cacheFresh && cachedRuntimeBlock ? cachedRuntimeBlock.runtime.runs : (initialRuntimeSnapshot.runs || EMPTY_STAGE_LIST),
    stages: cacheFresh && cachedRuntimeBlock ? cachedRuntimeBlock.runtime.stages : (initialRuntimeSnapshot.stages || EMPTY_STAGE_LIST),
    tasks: cacheFresh && cachedRuntimeBlock ? cachedRuntimeBlock.runtime.tasks : (initialRuntimeSnapshot.tasks || EMPTY_STAGE_LIST),
  }));
  const [templates, setTemplates] = useState<ProcessV2TemplateOption[]>([]);
  const [directory, setDirectory] = useState<AssigneeDirectory | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasLoadedRuntime, setHasLoadedRuntime] = useState(cacheFresh);
  const [errorText, setErrorText] = useState('');
  const [cardOverrides, setCardOverrides] = useState<Record<string, ProcessV2CardData>>({});
  const [extraCards, setExtraCards] = useState<ProcessV2CardData[]>([]);
  const [hiddenCardIds, setHiddenCardIds] = useState<Set<string>>(() => new Set());
  const [draftStagesOverride, setDraftStagesOverride] = useState<any[] | null>(null);
  const [autoAssigningCardIds, setAutoAssigningCardIds] = useState<Record<string, boolean>>({});
  const [activatorModal, setActivatorModal] = useState<{
    templateId: string;
    triggerKey: string;
    workflowId?: string | null;
    targetLaneKeys: string[];
    targetModuleIds: string[];
    defaultName: string;
    manualEnabled: boolean;
  } | null>(null);
  const [activatorEditorOptions, setActivatorEditorOptions] = useState<{
    dynamicOptions: Record<string, ActivatorOptionList>;
    relationOptions: Record<string, ActivatorOptionList>;
  }>({ dynamicOptions: {}, relationOptions: {} });
  const [resolvedTemplateContext, setResolvedTemplateContext] = useState<Record<string, any> | null>(null);
  const [templateContextResolving, setTemplateContextResolving] = useState(false);
  const [templateContextResolvedKey, setTemplateContextResolvedKey] = useState('');
  const processTemplateTargetModuleIds = useMemo(
    () => normalizeProcessTargetModuleIds(recordData?.module_ids, recordData?.module_id),
    [recordData?.module_id, recordData?.module_ids],
  );
  const activatorConditionFields = useMemo(
    () => getProcessAutomationConditionFieldsForModules(processTemplateTargetModuleIds),
    [processTemplateTargetModuleIds],
  );
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runtimeRef = useRef<RuntimeState>(runtime);
  const templateStagesRef = useRef<any[]>(templateStages);
  const recordDataRef = useRef<any>(recordData);
  const readOnlyVariant = variant !== 'full';
  const effectiveDraftStages = draftStagesOverride || (Array.isArray(draftStages) ? draftStages : EMPTY_STAGE_LIST);

  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

  useEffect(() => {
    templateStagesRef.current = templateStages;
  }, [templateStages]);

  useEffect(() => {
    recordDataRef.current = recordData;
  }, [recordData]);

  useEffect(() => {
    if (!runtimeSnapshot) return;
    setRuntime({
      runs: runtimeSnapshot?.runs || [],
      stages: runtimeSnapshot?.stages || [],
      tasks: runtimeSnapshot?.tasks || [],
    });
    setHasLoadedRuntime(true);
  }, [runtimeSnapshot?.runs, runtimeSnapshot?.stages, runtimeSnapshot?.tasks]);

  useEffect(() => {
    if (Array.isArray(draftStages)) setTemplateStages(draftStages);
    setDraftStagesOverride(null);
  }, [draftStages]);

  useEffect(() => {
    const cached = processRuntimeBlockCache.get(cacheKey);
    setHasLoadedRuntime(Boolean(cached && Date.now() - cached.savedAt < PROCESS_RUNTIME_BLOCK_CACHE_TTL_MS));
    setResolvedTemplateContext(null);
    setTemplateContextResolving(false);
    setTemplateContextResolvedKey('');
  }, [cacheKey]);

  const loadDirectoryAndTemplates = useCallback(async () => {
    if (
      processRuntimeReferenceCache
      && Date.now() - processRuntimeReferenceCache.savedAt < PROCESS_RUNTIME_REFERENCE_CACHE_TTL_MS
    ) {
      setOrgId(processRuntimeReferenceCache.orgId);
      if (processRuntimeReferenceCache.directory) setDirectory(processRuntimeReferenceCache.directory);
      setTemplates(processRuntimeReferenceCache.templates);
      return;
    }
    const [bootstrap, assignees, templateRows] = await Promise.all([
      fetchSessionBootstrap(supabase),
      fetchAssigneeDirectory(supabase).catch(() => null),
      fetchProcessTemplateRows(supabase).catch(() => []),
    ]);
    const nextOrgId = normalizeText(bootstrap?.orgId);
    const nextTemplates = (templateRows || [])
      .filter((row: any) => row?.is_active !== false)
      .map((row: any) => ({
        id: normalizeText(row?.id),
        title: normalizeText(row?.name) || 'الگوی فرآیند',
      }))
      .filter((item) => item.id);
    setOrgId(nextOrgId);
    if (assignees) setDirectory(assignees);
    setTemplates(nextTemplates);
    processRuntimeReferenceCache = {
      orgId: nextOrgId,
      directory: assignees || null,
      templates: nextTemplates,
      savedAt: Date.now(),
    };
  }, []);

  const refresh = useCallback(async (force = false) => {
    if (!enabled || !normalizedModuleId || !normalizedRecordId) return;
    if (readOnlyVariant && !force) {
      const cached = processRuntimeBlockCache.get(cacheKey);
      if (cached && Date.now() - cached.savedAt < PROCESS_RUNTIME_BLOCK_CACHE_TTL_MS) {
        setTemplateStages(cached.templateStages);
        setRuntime(cached.runtime);
        setHasLoadedRuntime(true);
        setLoading(false);
        return;
      }
    }
    setErrorText('');
    setLoading((current) => current || force || readOnlyVariant);
    try {
      if (isProcessTemplateModule(normalizedModuleId)) {
        const stages = await loadProcessTemplateStages(supabase, normalizedRecordId);
        setTemplateStages(stages);
        processRuntimeBlockCache.set(cacheKey, {
          runtime: runtimeRef.current,
          templateStages: stages,
          savedAt: Date.now(),
        });
        return;
      }

      if (isProcessRunModule(normalizedModuleId)) {
        const stages = await fetchRunStages(normalizedRecordId);
        const runs = [recordDataRef.current].filter(Boolean);
        const tasks = await fetchRuntimeTasks(runs, stages);
        const nextRuntime = {
          runs,
          stages,
          tasks,
        };
        setRuntime(nextRuntime);
        processRuntimeBlockCache.set(cacheKey, {
          runtime: nextRuntime,
          templateStages: templateStagesRef.current,
          savedAt: Date.now(),
        });
        return;
      }

      const snapshot = await fetchProcessRuntimeBatchForRecord(supabase, normalizedModuleId, normalizedRecordId, { force: true });
      const tasks = await fetchRuntimeTasks(snapshot.runs || [], snapshot.stages || []);
      const nextRuntime = { runs: snapshot.runs || [], stages: snapshot.stages || [], tasks };
      setRuntime(nextRuntime);
      processRuntimeBlockCache.set(cacheKey, {
        runtime: nextRuntime,
        templateStages: templateStagesRef.current,
        savedAt: Date.now(),
      });
    } catch (error: any) {
      setErrorText(normalizeText(error?.message || error?.details) || 'خواندن نسخه جدید فرآیند ناموفق بود.');
    } finally {
      setHasLoadedRuntime(true);
      setLoading(false);
    }
  }, [cacheKey, enabled, normalizedModuleId, normalizedRecordId, readOnlyVariant]);

  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      void refreshRef.current(true);
    }, 220);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void loadDirectoryAndTemplates();
  }, [enabled, loadDirectoryAndTemplates]);

  useEffect(() => {
    if (!enabled || !normalizedModuleId || !normalizedRecordId) return;
    if (
      runtimeSnapshot
      && normalizeText(runtimeSnapshot.moduleId) === normalizedModuleId
      && normalizeText(runtimeSnapshot.recordId) === normalizedRecordId
      && !readOnlyVariant
      && !isProcessTemplateModule(normalizedModuleId)
    ) {
      return;
    }
    void refresh(false);
  }, [enabled, normalizedModuleId, normalizedRecordId, readOnlyVariant, refresh, runtimeSnapshot]);

  useEffect(() => {
    if (!enabled || !orgId || !normalizedModuleId || !normalizedRecordId) return undefined;
    const channel = supabase.channel(`process-v2-runtime-${normalizedModuleId}-${normalizedRecordId}`);

    if (isProcessTemplateModule(normalizedModuleId)) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'process_template_stages', filter: `template_id=eq.${normalizedRecordId}` },
        scheduleRefresh,
      );
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'process_templates', filter: `org_id=eq.${orgId}` },
        (payload: any) => {
          const rowId = normalizeText(payload?.new?.id || payload?.old?.id);
          if (rowId === normalizedRecordId) scheduleRefresh();
        },
      );
    } else if (isProcessRunModule(normalizedModuleId)) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'process_run_stages', filter: `org_id=eq.${orgId}` },
        (payload: any) => {
          const runId = normalizeText(payload?.new?.process_run_id || payload?.old?.process_run_id);
          if (runId === normalizedRecordId) scheduleRefresh();
        },
      );
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'process_runs', filter: `org_id=eq.${orgId}` },
        (payload: any) => {
          const rowId = normalizeText(payload?.new?.id || payload?.old?.id);
          if (rowId === normalizedRecordId) scheduleRefresh();
        },
      );
    } else {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'process_runs', filter: `org_id=eq.${orgId}` },
        (payload: any) => {
          const next = payload?.new || payload?.old || {};
          if (normalizeText(next?.module_id) === normalizedModuleId && normalizeText(next?.record_id) === normalizedRecordId) {
            scheduleRefresh();
          }
        },
      );
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'process_run_stages', filter: `org_id=eq.${orgId}` },
        (payload: any) => {
          const row = payload?.new || payload?.old || {};
          const runId = normalizeText(row?.process_run_id);
          const currentRuntime = runtimeRef.current;
          const relatedRunIds = new Set((currentRuntime.runs || []).map((run: any) => normalizeText(run?.id)).filter(Boolean));
          if (runId && relatedRunIds.has(runId)) scheduleRefresh();
        },
      );
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `org_id=eq.${orgId}` },
        (payload: any) => {
          const row = payload?.new || payload?.old || {};
          const sourceLink = resolveTaskSourceLink(row);
          if (
            normalizeText(sourceLink.moduleId) === normalizedModuleId
            && normalizeText(sourceLink.recordId) === normalizedRecordId
          ) {
            scheduleRefresh();
            return;
          }
          const currentRuntime = runtimeRef.current;
          const relatedRunIds = new Set((currentRuntime.runs || []).map((run: any) => normalizeText(run?.id)).filter(Boolean));
          const relatedStageIds = new Set((currentRuntime.stages || []).flatMap((stage: any) => [
            normalizeText(stage?.id),
            normalizeText(stage?.process_run_stage_id),
          ]).filter(Boolean));
          const relatedTaskIds = new Set((currentRuntime.stages || []).map((stage: any) => normalizeText(stage?.task_id)).filter(Boolean));
          if (
            relatedTaskIds.has(normalizeText(row?.id))
            || relatedRunIds.has(normalizeText(row?.process_run_id))
            || relatedStageIds.has(normalizeText(row?.process_run_stage_id))
          ) {
            scheduleRefresh();
          }
        },
      );
    }

    channel.subscribe();
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [enabled, normalizedModuleId, normalizedRecordId, orgId, scheduleRefresh]);

  const fallbackRecordLabel = useMemo(() => {
    const moduleLabel = getModuleLabel(normalizedModuleId);
    const title = normalizeText(recordData?.system_code || recordData?.name || recordData?.title || recordData?.process_name);
    return title ? `${moduleLabel}: ${toPersianNumber(title)}` : moduleLabel;
  }, [normalizedModuleId, recordData]);

  const templateNameById = useMemo(
    () => new Map(templates.map((template) => [template.id, template.title] as const)),
    [templates],
  );

  const baseTemplateContext = useMemo(() => {
    const context = {
      ...(recordData && typeof recordData === 'object' ? recordData : {}),
    };
    assignProcessTemplateModuleAliases(context, normalizedModuleId, recordData);
    return context;
  }, [normalizedModuleId, recordData]);
  const templateContext = resolvedTemplateContext || baseTemplateContext;
  const templateTokenKey = useMemo(() => (
    [
      ...effectiveDraftStages,
      ...(runtime.stages || []),
      ...(runtime.tasks || []),
    ]
      .map((stage) => collectStageTemplateSourceText(stage))
      .filter((value) => hasTemplateTokens(value))
      .join('|')
  ), [effectiveDraftStages, runtime.stages, runtime.tasks]);
  const waitingForTemplateContext = Boolean(
    readOnlyVariant
    && templateTokenKey
    && (templateContextResolving || templateContextResolvedKey !== templateTokenKey)
  );

  useEffect(() => {
    if (!enabled || !normalizedModuleId || !normalizedRecordId || isProcessTemplateModule(normalizedModuleId)) return undefined;
    const tokenSources = [
      ...effectiveDraftStages,
      ...(runtime.stages || []),
      ...(runtime.tasks || []),
    ];
    const tokenKey = tokenSources
      .map((stage) => collectStageTemplateSourceText(stage))
      .filter((value) => hasTemplateTokens(value))
      .join('|');
    if (!tokenSources.some((stage) => hasTemplateTokens(collectStageTemplateSourceText(stage)))) {
      setResolvedTemplateContext(null);
      setTemplateContextResolving(false);
      setTemplateContextResolvedKey('');
      return undefined;
    }

    let disposed = false;
    setTemplateContextResolving(true);
    setTemplateContextResolvedKey('');
    const processLinkMap = tokenSources.reduce((acc, stage) => ({
      ...acc,
      ...collectStageProcessLinks(stage),
    }), {} as Record<string, any>);

    buildProcessV2TemplateContext({
      supabaseClient: supabase,
      moduleId: normalizedModuleId,
      recordId: normalizedRecordId,
      recordData,
      processLinkMap,
    })
      .then((context) => {
        if (!disposed) {
          setResolvedTemplateContext(context);
          setTemplateContextResolvedKey(tokenKey);
        }
      })
      .catch(() => {
        if (!disposed) {
          setResolvedTemplateContext(null);
          setTemplateContextResolvedKey(tokenKey);
        }
      })
      .finally(() => {
        if (!disposed) setTemplateContextResolving(false);
      });

    return () => {
      disposed = true;
    };
  }, [effectiveDraftStages, enabled, normalizedModuleId, normalizedRecordId, recordData, runtime.stages, runtime.tasks]);

  useEffect(() => {
    if (!activatorModal) return;
    let disposed = false;
    const scopeModuleId = activatorModal.targetModuleIds[0] || 'tasks';
    void loadActivatorEditorOptions(scopeModuleId, activatorConditionFields)
      .then((options) => {
        if (!disposed) setActivatorEditorOptions(options);
      })
      .catch(() => {
        if (!disposed) setActivatorEditorOptions({ dynamicOptions: {}, relationOptions: {} });
      });
    return () => {
      disposed = true;
    };
  }, [activatorConditionFields, activatorModal]);

  const mergeRuntimeStageWithTask = useCallback((stage: any) => {
    const task = (runtime.tasks || []).find((item: any) => (
      (normalizeText(stage?.task_id) && normalizeText(item?.id) === normalizeText(stage?.task_id))
      || (normalizeText(stage?.id) && normalizeText(item?.process_run_stage_id) === normalizeText(stage?.id))
      || (normalizeText(stage?.process_run_stage_id) && normalizeText(item?.process_run_stage_id) === normalizeText(stage?.process_run_stage_id))
    ));
    if (!task) return stage;
    return {
      ...stage,
      ...task,
      id: task.id || stage.id,
      process_run_stage_id: stage.id || task.process_run_stage_id,
      stage_name: task.name || stage.stage_name,
      metadata: {
        ...parseObject(stage?.metadata),
        ...parseObject(task?.metadata),
      },
      source_stage: stage,
      __process_v2_has_real_task: true,
    };
  }, [runtime.tasks]);

  const cards = useMemo<ProcessV2CardData[]>(() => {
    if (!enabled || !normalizedModuleId || !normalizedRecordId) return [];
    if (waitingForTemplateContext) return [];
    if (isProcessTemplateModule(normalizedModuleId)) {
      if (readOnlyVariant && templateStages.length === 0 && !hasLoadedRuntime) return [];
      const card = buildTemplateCard(recordData || { id: normalizedRecordId }, templateStages, directory, templateContext, false);
      return card ? [card] : [];
    }
    if (readOnlyVariant && !hasLoadedRuntime) return [];

    const runRows = isProcessRunModule(normalizedModuleId)
      ? [recordData].filter(Boolean)
      : (runtime.runs || []);
    const stageRows = runtime.stages || [];
    const runCards = runRows
      .map((run: any) => {
        const runId = normalizeText(run?.id);
        const runStages = stageRows
          .filter((stage: any) => normalizeText(stage?.process_run_id) === runId)
          .map(mergeRuntimeStageWithTask);
        return buildRunCard(run, runStages, directory, fallbackRecordLabel, templateNameById, templateContext);
      })
      .filter((item): item is ProcessV2CardData => Boolean(item));
    if (isProcessRunModule(normalizedModuleId)) return runCards;
    return [
      ...runCards,
      ...buildDraftProcessCards(effectiveDraftStages, directory, templateNameById, runtime.runs, templateContext, normalizedModuleId),
    ];
  }, [directory, effectiveDraftStages, enabled, fallbackRecordLabel, hasLoadedRuntime, mergeRuntimeStageWithTask, normalizedModuleId, normalizedRecordId, readOnlyVariant, recordData, runtime.runs, runtime.stages, templateContext, templateNameById, templateStages, waitingForTemplateContext]);

  const cardKey = useCallback((card: ProcessV2CardData) => `${card.mode}:${card.id}`, []);

  const displayCards = useMemo(
    () => [...cards, ...extraCards]
      .map((card) => cardOverrides[cardKey(card)] || card)
      .filter((card) => !hiddenCardIds.has(cardKey(card))),
    [cardKey, cardOverrides, cards, extraCards, hiddenCardIds],
  );

  const getHighlightedStageIds = useCallback((card: ProcessV2CardData) => {
    const taskId = normalizeText(highlightedTaskId);
    const runStageId = normalizeText(highlightedRunStageId);
    if (!taskId && !runStageId) return [];
    return card.lanes
      .flatMap((lane) => lane.stages)
      .filter((stage) => {
        const source = stage.source && typeof stage.source === 'object' ? stage.source : {};
        return (
          (taskId && normalizeText(source?.id) === taskId)
          || (taskId && normalizeText(source?.task_id) === taskId)
          || (runStageId && normalizeText(source?.process_run_stage_id || source?.source_stage?.id || source?.id) === runStageId)
        );
      })
      .map((stage) => stage.id);
  }, [highlightedRunStageId, highlightedTaskId]);

  const handleCardChange = useCallback((next: ProcessV2CardData) => {
    setCardOverrides((current) => ({
      ...current,
      [cardKey(next)]: next,
    }));
  }, [cardKey]);

  const handleStageStatusChange = useCallback((process: ProcessV2CardData, stageId: string, status: string, sourcePatch?: Record<string, any>) => {
    const key = cardKey(process);
    const stageStatus = mapTaskStatusToStageStatus(status);
    const displayStatus = stageStatus === 'waiting' && normalizeText(status).toLowerCase() !== 'waiting'
      ? (normalizeText(status) as ProcessV2StageStatus)
      : stageStatus;
    const matchIds = getProcessV2StageMatchIds(null, sourcePatch);
    const directStageId = normalizeText(stageId);
    if (directStageId) matchIds.add(directStageId);
    setCardOverrides((current) => {
      const base = current[key] || process;
      return {
        ...current,
        [key]: {
          ...base,
          lanes: base.lanes.map((lane) => ({
            ...lane,
            stages: lane.stages.map((stage) => (
              processV2StageMatches(stage, matchIds)
                ? {
                    ...stage,
                    status: displayStatus,
                    kind: stageStatus === 'draft' ? 'draft' : 'activity',
                    source: {
                      ...((stage.source && typeof stage.source === 'object') ? stage.source : {}),
                      ...(sourcePatch || {}),
                      status,
                    },
                  }
                : stage
            )),
          })),
        } as ProcessV2CardData,
      };
    });
  }, [cardKey]);

  const persistDraftStageList = useCallback(async (nextStages: any[]) => {
    const normalizedStages = Array.isArray(nextStages) ? nextStages : [];
    setDraftStagesOverride(normalizedStages);
    processRuntimeBlockCache.delete(cacheKey);

    if (onDraftStagesChange) {
      await onDraftStagesChange(normalizedStages);
      return;
    }

    const normalizedFieldKey = normalizeText(fieldKey);
    if (!normalizedModuleId || !normalizedRecordId || !normalizedFieldKey) return;
    if (isProcessTemplateModule(normalizedModuleId) || isProcessRunModule(normalizedModuleId)) return;

    const { error } = await (supabase.from(normalizedModuleId as any) as any)
      .update({ [normalizedFieldKey]: normalizedStages })
      .eq('id', normalizedRecordId);
    if (error) throw error;
  }, [cacheKey, fieldKey, normalizedModuleId, normalizedRecordId, onDraftStagesChange]);

  const removeDraftStagesByPredicate = useCallback(async (
    predicate: (stage: any, index: number) => boolean,
  ) => {
    const currentStages = Array.isArray(effectiveDraftStages) ? effectiveDraftStages : [];
    const nextStages = currentStages.filter((stage, index) => !predicate(stage, index));
    if (nextStages.length === currentStages.length) {
      message.warning('مرحله پیش‌نویس متناظر برای حذف پیدا نشد.');
      return false;
    }
    await persistDraftStageList(nextStages);
    return true;
  }, [effectiveDraftStages, message, persistDraftStageList]);

  const deleteTemplateStages = useCallback(async (stageIds: string[]) => {
    const normalizedIds = Array.from(new Set(stageIds.map(normalizeText).filter(Boolean)));
    if (normalizedIds.length === 0) return false;
    await recycleOrDeleteProcessRows('process_template_stages', 'process_template_stages', normalizedIds);
    setTemplateStages((current) => current.filter((stage) => !normalizedIds.includes(normalizeText(stage?.id || stage?.template_stage_id))));
    processRuntimeBlockCache.delete(cacheKey);
    await refresh(true);
    return true;
  }, [cacheKey, refresh]);

  const deleteRunDraftStages = useCallback(async (stageIds: string[]) => {
    const normalizedIds = Array.from(new Set(stageIds.map(normalizeText).filter(Boolean)));
    if (normalizedIds.length === 0) return false;
    await recycleOrDeleteProcessRows('process_run_stages', 'process_run_stages', normalizedIds);
    setRuntime((current) => ({
      ...current,
      stages: current.stages.filter((stage) => !normalizedIds.includes(normalizeText(stage?.id || stage?.process_run_stage_id))),
    }));
    processRuntimeBlockCache.delete(cacheKey);
    await refresh(true);
    return true;
  }, [cacheKey, refresh]);

  const getRunStageIdForDraftStage = useCallback((stage: ProcessV2Stage) => {
    const source = stage.source && typeof stage.source === 'object' ? stage.source : {};
    const sourceStage = source.source_stage && typeof source.source_stage === 'object' ? source.source_stage : {};
    const metadata = parseObject(source?.metadata);
    return normalizeText(
      source?.process_run_stage_id
      || sourceStage?.id
      || sourceStage?.process_run_stage_id
      || metadata?.process_run_stage_id
      || (source?.process_run_id ? source?.id : '')
    );
  }, []);

  const handleDeleteStage = useCallback(async (
    stage: ProcessV2Stage,
    _lane: ProcessV2Lane,
    process: ProcessV2CardData,
  ) => {
    if (stage.kind !== 'draft') {
      message.warning('حذف فعالیت واقعی از مسیر حذف فعالیت انجام می‌شود؛ این دکمه فقط مرحله پیش‌نویس را حذف می‌کند.');
      return false;
    }

    if (process.mode === 'template' && isProcessTemplateModule(normalizedModuleId)) {
      const source = stage.source && typeof stage.source === 'object' ? stage.source : {};
      const templateStageId = normalizeText(source?.template_stage_id || source?.id || stage.id);
      if (await deleteTemplateStages([templateStageId])) {
        message.success('مرحله پیش‌نویس حذف شد');
        return true;
      }
      return false;
    }

    const runStageId = getRunStageIdForDraftStage(stage);
    if (runStageId && !normalizeText(stage.source?.task_id)) {
      if (await deleteRunDraftStages([runStageId])) {
        message.success('مرحله پیش‌نویس حذف شد');
        return true;
      }
      return false;
    }

    if (await removeDraftStagesByPredicate((candidate, index) => rawStageMatchesV2Stage(candidate, stage, index))) {
      message.success('مرحله پیش‌نویس حذف شد');
      return true;
    }
    return false;
  }, [deleteRunDraftStages, deleteTemplateStages, getRunStageIdForDraftStage, message, normalizedModuleId, removeDraftStagesByPredicate]);

  const handleDeleteLane = useCallback(async (
    lane: ProcessV2Lane,
    process: ProcessV2CardData,
  ) => {
    if (lane.stages.some((stage) => stage.kind !== 'draft')) {
      message.warning('این ردیف فعالیت واقعی دارد. ابتدا فعالیت‌های واقعی را از مسیر خودشان حذف کنید.');
      return false;
    }

    if (process.mode === 'template' && isProcessTemplateModule(normalizedModuleId)) {
      const stageIds = lane.stages
        .map((stage) => {
          const source = stage.source && typeof stage.source === 'object' ? stage.source : {};
          return normalizeText(source?.template_stage_id || source?.id || stage.id);
        })
        .filter(Boolean);
      if (await deleteTemplateStages(stageIds)) {
        message.success('ردیف پیش‌نویس حذف شد');
        return true;
      }
      return false;
    }

    const runStageIds = lane.stages
      .map(getRunStageIdForDraftStage)
      .filter(Boolean);
    if (runStageIds.length === lane.stages.length && runStageIds.length > 0) {
      if (await deleteRunDraftStages(runStageIds)) {
        message.success('ردیف پیش‌نویس حذف شد');
        return true;
      }
      return false;
    }

    const targetGroupId = normalizeText(process.id).startsWith('draft:')
      ? normalizeText(process.id).replace(/^draft:/, '')
      : '';
    const targetLaneId = normalizeText(lane.id);
    if (await removeDraftStagesByPredicate((candidate) => {
      const meta = resolveDraftGroupMeta(candidate);
      if (targetGroupId && meta.groupId !== targetGroupId) return false;
      return getProcessStageLaneKey(candidate) === targetLaneId;
    })) {
      message.success('ردیف پیش‌نویس حذف شد');
      return true;
    }
    return false;
  }, [deleteRunDraftStages, deleteTemplateStages, getRunStageIdForDraftStage, message, normalizedModuleId, removeDraftStagesByPredicate]);

  const handleDeleteCard = useCallback(async (id: string) => {
    const source = displayCards.find((card) => card.id === id);
    if (!source) return;

    if (normalizeText(source.id).startsWith('draft:')) {
      const targetGroupId = normalizeText(source.id).replace(/^draft:/, '');
      const removed = await removeDraftStagesByPredicate((stage) => (
        resolveDraftGroupMeta(stage).groupId === targetGroupId
      ));
      if (removed) {
        setHiddenCardIds((current) => new Set([...Array.from(current), cardKey(source)]));
        message.success('فرآیند پیش‌نویس حذف شد');
      }
      return;
    }

    if (source.mode === 'template') {
      setHiddenCardIds((current) => new Set([...Array.from(current), cardKey(source)]));
      message.info('الگو فقط از نمای جدید پنهان شد؛ حذف رکورد الگو از مسیر حذف رکورد انجام می‌شود.');
      return;
    }

    if (source.mode === 'run' && !source.lanes.some((lane) => lane.stages.some((stage) => stage.kind !== 'draft'))) {
      try {
        await moveProcessRowsToRecycleBin('process_runs', 'process_runs', [source.id]);
      } catch (error) {
        if (!isUnsupportedRecycleError(error)) throw error;
        const { error: deleteError } = await (supabase.from('process_runs' as any) as any)
          .delete()
          .eq('id', source.id);
        if (deleteError) throw deleteError;
      }
      setHiddenCardIds((current) => new Set([...Array.from(current), cardKey(source)]));
      processRuntimeBlockCache.delete(cacheKey);
      await refresh(true);
      message.success('فرآیند حذف شد');
      return;
    }

    message.warning('برای حذف فرآیند شامل فعالیت واقعی، ابتدا فعالیت‌ها را از مسیر خودشان حذف کنید.');
    return;
  }, [cacheKey, cardKey, displayCards, message, refresh, removeDraftStagesByPredicate]);

  const handleCopyCard = useCallback((id: string) => {
    const source = displayCards.find((card) => card.id === id);
    if (!source) return;
    const cloned: ProcessV2CardData = {
      ...source,
      id: `copy:${source.id}:${Date.now()}`,
      title: `${source.title} کپی`,
      lanes: source.lanes.map((lane) => ({
        ...lane,
        id: `copy:${lane.id}:${Date.now()}`,
        stages: lane.stages.map((stage) => ({
          ...stage,
          id: `copy:${stage.id}:${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        })),
      })),
    } as ProcessV2CardData;
    setExtraCards((current) => [...current, cloned]);
    message.success('کپی فرآیند در نمای جدید ساخته شد.');
  }, [displayCards, message]);

  const handleShowInfo = useCallback((item: ProcessV2CardData) => {
    const stageCount = item.lanes.reduce((sum, lane) => sum + lane.stages.length, 0);
    Modal.info({
      title: 'اطلاعات فرآیند',
      content: (
        <div className="space-y-2 text-sm" dir="rtl">
          <div><span className="text-gray-500">نام:</span> {item.title}</div>
          <div><span className="text-gray-500">نوع:</span> {item.mode === 'run' ? 'اجرای فرآیند' : 'الگوی فرآیند'}</div>
          {item.mode === 'run' ? (
            <div><span className="text-gray-500">الگو:</span> {item.templateTitle || 'ثبت نشده'}</div>
          ) : null}
          <div><span className="text-gray-500">تعداد ردیف:</span> {toPersianNumber(item.lanes.length)}</div>
          <div><span className="text-gray-500">تعداد مرحله:</span> {toPersianNumber(stageCount)}</div>
        </div>
      ),
      okText: 'بستن',
      centered: true,
      direction: 'rtl',
    });
  }, []);

  const handleShowRecords = useCallback(async (item: ProcessV2CardData) => {
    const relatedRecords = collectProcessRelatedRecords(item);
    const fallbackGroup = item.mode === 'run'
      ? {
          id: item.id,
          templateId: item.templateId || null,
          stages: item.lanes.flatMap((lane) => lane.stages).map((stage) => stage.source || stage),
        }
      : undefined;

    if (typeof window !== 'undefined' && recordData?.module_id && recordData?.id) {
      window.dispatchEvent(new CustomEvent('kalamapp:open-process-append', {
        detail: {
          moduleId: String(recordData.module_id),
          recordId: String(recordData.id),
          mode: 'links',
          group: fallbackGroup,
        },
      }));
      return;
    }

    const labelMap = relatedRecords.length > 0
      ? await fetchRecordReferenceLabels(supabase, relatedRecords).catch(() => ({} as Record<string, string>))
      : {};
    const targetModuleIds = Array.from(new Set([
      ...(Array.isArray(recordData?.module_ids) ? recordData.module_ids : []),
      recordData?.module_id,
    ].map(normalizeText).filter(Boolean)));

    Modal.info({
      title: 'رکوردهای مرتبط',
      content: (
        <div className="space-y-3 text-sm" dir="rtl">
          {targetModuleIds.length > 0 ? (
            <div className="rounded-lg bg-gray-50 p-2 dark:bg-white/5">
              <div className="mb-1 text-xs font-bold text-gray-500">ماژول‌های هدف الگو</div>
              <div className="flex flex-wrap gap-1">
                {targetModuleIds.map((moduleId) => (
                  <span key={moduleId} className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-200">
                    {getModuleLabel(moduleId)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {relatedRecords.length > 0 ? (
            <div className="space-y-2">
              {relatedRecords.map((ref) => {
                const key = buildRecordReferenceKey(ref.moduleId, ref.recordId);
                const title = labelMap[key] || getModuleLabel(ref.moduleId);
                return (
                  <div key={key} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-white px-2 py-1.5 dark:border-white/10 dark:bg-white/5">
                    <span className="text-xs text-gray-500">{getModuleLabel(ref.moduleId)}</span>
                    <a href={`/${ref.moduleId}/${ref.recordId}`} className="min-w-0 truncate font-bold text-cyan-700 hover:underline dark:text-cyan-300">
                      {title}
                    </a>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-gray-500">برای این فرآیند هنوز رکورد مرتبطی ثبت نشده است.</div>
          )}
        </div>
      ),
      okText: 'بستن',
      centered: true,
      direction: 'rtl',
    });
  }, [recordData?.id, recordData?.module_id, recordData?.module_ids]);

  const buildLocalRunCard = useCallback((templateId?: string | null): ProcessV2CardData => {
    const normalizedTemplateId = normalizeText(templateId);
    const templateTitle = normalizedTemplateId
      ? (templateNameById.get(normalizedTemplateId) || templates.find((template) => template.id === normalizedTemplateId)?.title || 'الگوی فرآیند')
      : (templates[0]?.title || 'الگوی فرآیند');
    return {
      mode: 'run',
      id: `new-run:${normalizedTemplateId || 'template'}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
      title: templateTitle ? `فرآیند ${templateTitle}` : 'فرآیند جدید',
      templateId: normalizedTemplateId || templates[0]?.id || '',
      templateTitle,
      relatedRecordLabel: fallbackRecordLabel,
      statusLabel: 'draft',
      lanes: [{ id: `lane_${Date.now()}`, title: 'ردیف اصلی', stages: [] }],
    };
  }, [fallbackRecordLabel, templateNameById, templates]);

  const handleAddRun = useCallback(() => {
    if (typeof window !== 'undefined' && normalizedModuleId && normalizedRecordId) {
      window.dispatchEvent(new CustomEvent('kalamapp:open-process-append', {
        detail: {
          moduleId: normalizedModuleId,
          recordId: normalizedRecordId,
        },
      }));
      return;
    }
    const next = buildLocalRunCard(templates[0]?.id || null);
    setExtraCards((current) => [...current, next]);
    void handleShowRecords(next);
  }, [buildLocalRunCard, handleShowRecords, normalizedModuleId, normalizedRecordId, templates]);

  const handleTemplateChange = useCallback((item: ProcessV2RunCard, templateId: string, intent: 'replace' | 'add') => {
    const selectedTitle = templateNameById.get(templateId) || templates.find((template) => template.id === templateId)?.title || item.templateTitle || 'الگوی فرآیند';
    if (intent === 'replace') {
      const next: ProcessV2CardData = {
        ...item,
        templateId,
        templateTitle: selectedTitle,
        title: item.title || `فرآیند ${selectedTitle}`,
      };
      setCardOverrides((current) => ({
        ...current,
        [cardKey(item)]: next,
      }));
      void handleShowRecords(next);
      return;
    }

    const next = buildLocalRunCard(templateId);
    setExtraCards((current) => [...current, next]);
    void handleShowRecords(next);
  }, [buildLocalRunCard, cardKey, handleShowRecords, templateNameById, templates]);

  const handleAutoAssignProcess = useCallback(async (item: ProcessV2CardData) => {
    const draftCount = item.lanes.reduce((sum, lane) => (
      sum + lane.stages.filter((stage) => stage.kind === 'draft').length
    ), 0);
    if (draftCount === 0) {
      message.info('مرحله پیش‌نویسی برای ارجاع وجود ندارد.');
      return;
    }
    const isDraftCard = normalizeText(item.id).startsWith('draft:');
    const targetGroupId = isDraftCard ? normalizeText(item.id).replace(/^draft:/, '') : '';
    const sourceDraftStages = effectiveDraftStages.length > 0
      ? effectiveDraftStages
      : item.lanes.flatMap((lane) => lane.stages.filter((stage) => stage.kind === 'draft').map((stage) => stage.source || stage));
    const key = cardKey(item);
    if (autoAssigningCardIds[key]) return;
    setAutoAssigningCardIds((current) => ({ ...current, [key]: true }));
    try {
      const result = await autoAssignProcessV2DraftStages({
        supabaseClient: supabase,
        moduleId: normalizedModuleId,
        recordId: normalizedRecordId,
        recordData,
        draftStages: sourceDraftStages,
        targetGroupId,
      });
      if (result.createdCount > 0) {
        message.success(`${toPersianNumber(result.createdCount)} فعالیت ایجاد شد`);
      } else if (result.skippedCount > 0) {
        message.warning(`${toPersianNumber(result.skippedCount)} مرحله از قبل فعالیت مرتبط داشت یا قابل ایجاد نبود`);
      } else {
        message.warning('فعالیتی ایجاد نشد. تنظیمات مراحل پیش نویس را بررسی کنید.');
      }
      await refresh(true);
    } catch (error: any) {
      message.error(normalizeText(error?.message || error?.details) || 'ارجاع خودکار فرآیند ناموفق بود');
    } finally {
      setAutoAssigningCardIds((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }, [autoAssigningCardIds, cardKey, effectiveDraftStages, message, normalizedModuleId, normalizedRecordId, recordData, refresh]);

  const handleAutoAssignStage = useCallback(async (stage: ProcessV2Stage, _laneTitle: string, item: ProcessV2CardData, overrides?: Record<string, any>) => {
    if (stage.kind !== 'draft') return;
    const sourceDraftStagesBase = effectiveDraftStages.length > 0
      ? effectiveDraftStages
      : item.lanes.flatMap((lane) => lane.stages.filter((candidate) => candidate.kind === 'draft').map((candidate) => candidate.source || candidate));
    const sourceStage = stage.source && typeof stage.source === 'object' ? stage.source : {};
    const sourceMeta = parseObject(sourceStage?.metadata);
    const targetGroupId = normalizeText(item.id).startsWith('draft:')
      ? normalizeText(item.id).replace(/^draft:/, '')
      : normalizeText(sourceStage?.process_group_id || sourceMeta?.process_group_id || sourceMeta?.process_group?.id);
    const targetStageId = normalizeText(stage.source?.id || stage.source?.template_stage_id || stage.source?.process_node_key || stage.id);
    const sourceDraftStages = sourceDraftStagesBase.map((candidate: any) => {
      const candidateId = normalizeText(candidate?.id || candidate?.template_stage_id || candidate?.process_node_key);
      if (!targetStageId || candidateId !== targetStageId || !overrides) return candidate;
      const candidateMetadata = parseObject(candidate?.metadata);
      return {
        ...candidate,
        ...overrides,
        metadata: {
          ...candidateMetadata,
          ...(overrides.metadata && typeof overrides.metadata === 'object' ? overrides.metadata : {}),
        },
      };
    });
    const key = `${cardKey(item)}:${stage.id}`;
    if (autoAssigningCardIds[key]) return;
    setAutoAssigningCardIds((current) => ({ ...current, [key]: true }));
    try {
      const result = await autoAssignProcessV2DraftStages({
        supabaseClient: supabase,
        moduleId: normalizedModuleId,
        recordId: normalizedRecordId,
        recordData,
        draftStages: sourceDraftStages,
        targetGroupId,
        targetStageId,
      });
      if (result.createdCount > 0) {
        message.success(`${toPersianNumber(result.createdCount)} فعالیت ایجاد شد`);
      } else if (result.skippedCount > 0) {
        message.warning('برای این مرحله فعالیت مرتبط از قبل وجود دارد یا قابل ایجاد نیست');
      } else {
        message.warning('فعالیتی برای این مرحله ایجاد نشد. تنظیمات مرحله را بررسی کنید.');
      }
      await refresh(true);
    } catch (error: any) {
      message.error(normalizeText(error?.message || error?.details) || 'ارجاع خودکار مرحله ناموفق بود');
    } finally {
      setAutoAssigningCardIds((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }, [autoAssigningCardIds, cardKey, effectiveDraftStages, message, normalizedModuleId, normalizedRecordId, recordData, refresh]);

  const handleConfigureTemplateActivator = useCallback((item: ProcessV2CardData) => {
    if (item.mode !== 'template') return;
    const templateId = normalizeText(item.id || normalizedRecordId);
    if (!templateId) return;
    const targetLaneKeys = item.lanes.map((lane) => normalizeText(lane.id)).filter(Boolean);
    const graphSourceStages = templateStages.length > 0
      ? templateStages
      : effectiveDraftStages;
    const materialized = materializeLegacyProcessGraph(graphSourceStages);
    const existingTrigger = materialized.graph.triggers.find((trigger) => {
      if (trigger.sourceNodeKey) return false;
      const triggerLaneKeys = Array.isArray(trigger.targetLaneKeys) ? trigger.targetLaneKeys : [];
      if (targetLaneKeys.length === 0) return true;
      return targetLaneKeys.some((laneKey) => triggerLaneKeys.includes(laneKey));
    }) || null;
    setActivatorModal({
      templateId,
      triggerKey: normalizeText(existingTrigger?.key) || buildStableProcessStartTriggerKey(templateId),
      workflowId: normalizeText(existingTrigger?.workflowId) || null,
      targetLaneKeys: existingTrigger?.targetLaneKeys?.length ? existingTrigger.targetLaneKeys : targetLaneKeys,
      targetModuleIds: processTemplateTargetModuleIds,
      defaultName: existingTrigger?.name || 'فعال‌کننده فرآیند',
      manualEnabled: existingTrigger?.manualEnabled !== false,
    });
  }, [effectiveDraftStages, normalizedRecordId, processTemplateTargetModuleIds, templateStages]);

  const handleOpenStageDetails = useCallback((stage: ProcessV2Stage) => {
    if (
      variant === 'full'
      && isProcessTemplateModule(normalizedModuleId)
      && stage.kind === 'draft'
      && typeof window !== 'undefined'
    ) {
      window.dispatchEvent(new CustomEvent('kalamapp:open-process-template-stage', {
        detail: {
          moduleId: normalizedModuleId,
          recordId: normalizedRecordId,
          stageId: normalizeText(stage.source?.id || stage.source?.template_stage_id || stage.id),
          stage: stage.source || stage,
          tab: 'stage',
        },
      }));
      return true;
    }
    return false;
  }, [normalizedModuleId, normalizedRecordId, variant]);

  const canShowEmptyAddProcess = (
    variant === 'full'
    && !isProcessTemplateModule(normalizedModuleId)
    && !isProcessRunModule(normalizedModuleId)
    && Boolean(normalizedModuleId && normalizedRecordId)
  );
  const shouldRender = displayCards.length > 0 || loading || waitingForTemplateContext || errorText || canShowEmptyAddProcess;
  if (!shouldRender) return null;

  return (
    <div className={variant === 'full' ? 'mt-5' : 'mt-0'} dir="rtl">
      {errorText ? (
        <Alert type="warning" showIcon message={errorText} className="mb-3 !rounded-xl" />
      ) : null}
      {(loading || waitingForTemplateContext) && cards.length === 0 ? (
        <Skeleton active title={variant === 'full'} paragraph={{ rows: readOnlyVariant ? 1 : 3 }} />
      ) : displayCards.length === 0 && canShowEmptyAddProcess ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-center dark:border-white/10 dark:bg-white/[0.025]">
          <div className="mb-3 text-sm font-bold text-slate-600 dark:text-slate-200">
            برای این رکورد هنوز فرآیندی ثبت نشده است.
          </div>
          <Button
            type="primary"
            className="kalam-btn-brand !rounded-full !px-5"
            onClick={handleAddRun}
          >
            افزودن فرآیند جدید
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {displayCards.map((card) => (
            <ProcessCardsV2
              key={`${card.mode}:${card.id}`}
              item={card}
              templates={templates}
              variant={variant}
              onChange={handleCardChange}
              onStageStatusChange={handleStageStatusChange}
              onDelete={handleDeleteCard}
              onDeleteLane={handleDeleteLane}
              onDeleteStage={handleDeleteStage}
              onCopy={handleCopyCard}
              onAddRun={handleAddRun}
              onShowInfo={handleShowInfo}
              onShowRecords={handleShowRecords}
              onTemplateChange={handleTemplateChange}
              onAutoAssignProcess={handleAutoAssignProcess}
              onAutoAssignStage={handleAutoAssignStage}
              onOpenStageDetails={handleOpenStageDetails}
              onConfigureActivator={
                isProcessTemplateModule(normalizedModuleId) && variant === 'full'
                  ? handleConfigureTemplateActivator
                  : undefined
              }
              autoAssigning={Boolean(autoAssigningCardIds[cardKey(card)])}
              canAutoAssign={card.lanes.some((lane) => lane.stages.some((stage) => stage.kind === 'draft'))}
              highlightedStageIds={getHighlightedStageIds(card)}
            />
          ))}
        </div>
      )}
      {activatorModal ? (
        <ProcessActivatorModal
          open={Boolean(activatorModal)}
          onClose={() => setActivatorModal(null)}
          onSaved={() => {
            void refresh(true);
          }}
          workflowId={activatorModal.workflowId}
          templateId={activatorModal.templateId}
          triggerKey={activatorModal.triggerKey}
          sourceNodeKey={null}
          targetLaneKeys={activatorModal.targetLaneKeys}
          targetModuleIds={activatorModal.targetModuleIds}
          defaultName={activatorModal.defaultName}
          manualEnabled={activatorModal.manualEnabled}
          conditionFields={activatorConditionFields}
          dynamicOptions={activatorEditorOptions.dynamicOptions}
          relationOptions={activatorEditorOptions.relationOptions}
        />
      ) : null}
    </div>
  );
};

export default memo(ProcessCardsV2RuntimeBlock);
