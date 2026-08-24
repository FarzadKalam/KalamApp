import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Modal, Skeleton } from 'antd';
import { FieldType, type ModuleField } from '../../types';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import { safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import { fetchProcessAudit } from '../../utils/processAudit';
import { fetchProcessRuntimeBatchForRecord } from '../../utils/processRuntimeBatch';
import { fetchProcessRuntimeTasksForRecord } from '../../utils/processRuntimeTasks';
import { clearAppRuntimeCache } from '../../utils/appRuntimeCache';
import {
  resolveProcessRuntimeSurfaceMode,
  shouldApplyProcessTemplateStagePreview,
  shouldLoadProcessRuntime,
} from '../../utils/processRuntimePresentation';
import { filterDeletedProcessRunStageMarks } from '../../utils/processDeletedStageMarks';
import {
  getCompletedProcessesToggleLabel,
  isProcessExecutionStarted,
  type ProcessRuntimeSnapshot,
} from '../../utils/processRuntimeSnapshot';
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
import { persistProcessDraftField } from '../../utils/processDraftPersistence';
import {
  buildMaterializedProcessIdentityIndex,
  collectExplicitProcessGroupIds,
  collectProcessInstanceIdentityKeys,
  isDraftProcessInstanceMaterialized,
  isProcessInstanceMutationScopeCompatible,
} from '../../utils/processInstanceIdentity';
import {
  assignProcessTemplateIdentityAliases,
  assignProcessTemplateModuleAliases,
  resolveProcessTemplateTokenValue,
  resolveProcessTemplateLaneName,
} from '../../utils/processTemplateContext';
import {
  buildProcessLinkMapFromRecord,
  getProcessTargetModuleFields,
  normalizeProcessTargetModuleIds,
  parseProcessLinkMap,
} from '../../utils/processTargets';
import { fetchLinkedProcessDraftStagesForRecord } from '../../utils/processLinkedDraftLookup';
import { fetchRecordReferenceLabels, buildRecordReferenceKey } from '../../utils/recordReference';
import { fetchRelationOptionsForField } from '../../utils/relationOptions';
import { getAssigneeLabel } from '../../utils/assigneeLabel';
import { parseAssigneeValue } from '../../utils/assigneeValue';
import { resolveTaskSourceLink } from '../../utils/taskMeta';
import { TASK_RUNTIME_UPDATED_EVENT, type TaskRuntimeUpdatedPayload } from '../../utils/taskRuntimeEvents';
import { WORKFLOW_ASSIGNEE_FIELD_KEY } from '../../utils/workflowTypes';
import {
  getProcessAutomationConditionFieldsForModules,
  getSyntheticWorkflowAssigneeField,
  getVisibleWorkflowModuleFields,
} from '../../utils/workflowHelpers';
import {
  attachProcessGraphToStages,
  createProcessTriggerKey,
  getProcessStageNodeKey,
  getProcessStagesByLane,
  materializeLegacyProcessGraph,
  PROCESS_GRAPH_METADATA_KEY,
  PROCESS_LANE_KEY,
  PROCESS_NODE_KEY,
} from '../../utils/processGraph';
import { getFieldLabelFa } from '../../utils/fieldLabel';
import {
  getTaskStatusLabel,
  normalizeProcessTaskStatusOptions,
  PROCESS_TASK_STATUS_OPTIONS_KEY,
} from '../../utils/processTaskStatusOptions';
import {
  normalizeProcessTaskCustomFields,
  PROCESS_TASK_CUSTOM_FIELDS_KEY,
  PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY,
} from '../../utils/processTaskCustomFields';
import { loadProcessTaskModalContext } from '../../utils/processTaskModalContext';
import { markModuleListChanged, subscribeToLocalModuleListInvalidation } from '../../utils/moduleListLive';
import {
  syncProjectStatusesForProcessContext,
} from '../../utils/projectProcessStatus';
import {
  createProcessGroupId,
  mapProcessTemplateStagesToDraft,
} from '../../utils/processRunRuntime';
import {
  autoAssignProcessV2DraftStages,
  buildProcessV2TemplateContext,
} from '../../utils/processV2AutoAssign';
import {
  formatProcessStageDueLabel,
  formatProcessStageScheduleRule,
  resolveProcessStageDueValue,
} from '../../utils/processStageCardLabels';
import {
  findProcessAssigneeFieldReference,
  getProcessAssigneeFieldKey,
  normalizeProcessAssigneeFieldReference,
  resolveProcessAssigneeReference,
} from '../../utils/processAssigneeReference';
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
  onRuntimeSnapshot?: (snapshot: ProcessRuntimeSnapshot) => void;
  onDraftLoadRetry?: () => void | Promise<void>;
  variant?: ProcessV2Variant;
  enabled?: boolean;
  highlightedTaskId?: string | null;
  highlightedRunStageId?: string | null;
  loadLegacyLinkedDrafts?: boolean;
  snapshotOnly?: boolean;
};

type RuntimeState = {
  runs: any[];
  stages: any[];
  tasks: any[];
};

type StageDeleteMode = 'unlink' | 'delete_task_keep_draft' | 'delete_all';
type StageDeleteRequest = {
  stage: ProcessV2Stage;
  lane: ProcessV2Lane;
  process: ProcessV2CardData;
};
type BulkDeleteRequest = {
  kind: 'lane' | 'process';
  process: ProcessV2CardData;
  lane?: ProcessV2Lane | null;
};

type ProcessRuntimeBlockCacheEntry = {
  runtime: RuntimeState;
  templateStages: any[];
  linkedDraftStages: any[];
  savedAt: number;
};

type ProcessRuntimeReferenceCache = {
  orgId: string;
  directory: AssigneeDirectory | null;
  templates: ProcessV2TemplateOption[];
  savedAt: number;
};
type ProcessRuntimeReferencePayload = Omit<ProcessRuntimeReferenceCache, 'savedAt'>;

const PROCESS_RUNTIME_BLOCK_CACHE_TTL_MS = 30_000;
const PROCESS_RUNTIME_REFERENCE_CACHE_TTL_MS = 90_000;
const processRuntimeBlockCache = new Map<string, ProcessRuntimeBlockCacheEntry>();
const processRuntimeReferenceCacheByOrg = new Map<string, ProcessRuntimeReferenceCache>();
const processRuntimeReferencePromiseByOrg = new Map<string, Promise<ProcessRuntimeReferencePayload>>();
const EMPTY_RUNTIME_STATE: RuntimeState = { runs: [], stages: [], tasks: [] };
const EMPTY_STAGE_LIST: any[] = [];

const normalizeText = (value: unknown) => String(value || '').trim();
const UUID_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const normalizeDbUuid = (value: unknown) => {
  const raw = normalizeText(value);
  if (!raw) return '';
  const stripped = raw.replace(/^(process_run_stage|process_run|process_template_stage|process_template|task|user|role)[_:]/i, '');
  return UUID_LIKE_RE.test(stripped) ? stripped : '';
};

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
      value: `user:${normalizeText(user?.id)}`,
    })).filter((item) => item.value !== 'user_');

    const roleOptions = supportsGlobalRoleAssignee(scopeModuleId)
      ? (directory.roles || []).map((role) => ({
          label: normalizeText(role?.title || role?.id),
          value: `role:${normalizeText(role?.id)}`,
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

const getRuntimeStageTaskId = (stage: any) => {
  const metadata = parseObject(stage?.metadata);
  const sourceStage = stage?.source_stage && typeof stage.source_stage === 'object' ? stage.source_stage : {};
  const sourceMetadata = parseObject(sourceStage?.metadata);
  return normalizeDbUuid(
    stage?.task_id
    || stage?.process_task_id
    || metadata?.task_id
    || metadata?.process_task_id
    || sourceStage?.task_id
    || sourceStage?.process_task_id
    || sourceMetadata?.task_id
    || sourceMetadata?.process_task_id,
  );
};

const getRuntimeStageRunId = (stage: any) => {
  const metadata = parseObject(stage?.metadata);
  const sourceStage = stage?.source_stage && typeof stage.source_stage === 'object' ? stage.source_stage : {};
  const sourceMetadata = parseObject(sourceStage?.metadata);
  return normalizeDbUuid(
    stage?.process_run_id
    || metadata?.process_run_id
    || sourceStage?.process_run_id
    || sourceMetadata?.process_run_id,
  );
};

const getRuntimeStageNodeKey = (stage: any) => {
  const metadata = parseObject(stage?.metadata);
  const sourceStage = stage?.source_stage && typeof stage.source_stage === 'object' ? stage.source_stage : {};
  const sourceMetadata = parseObject(sourceStage?.metadata);
  return normalizeText(
    stage?.process_node_key
    || stage?.[PROCESS_NODE_KEY]
    || metadata?.process_node_key
    || metadata?.[PROCESS_NODE_KEY]
    || sourceStage?.process_node_key
    || sourceStage?.[PROCESS_NODE_KEY]
    || sourceMetadata?.process_node_key
    || sourceMetadata?.[PROCESS_NODE_KEY],
  );
};

const getTaskRuntimeNodeKey = (task: any) => {
  const recurrence = parseObject(task?.recurrence_info);
  const metadata = parseObject(task?.metadata);
  return normalizeText(
    task?.process_node_key
    || task?.[PROCESS_NODE_KEY]
    || recurrence?.process_node_key
    || recurrence?.[PROCESS_NODE_KEY]
    || metadata?.process_node_key
    || metadata?.[PROCESS_NODE_KEY],
  );
};

const shouldForceActivityStageToDraft = (stage: any, hasRealTask: boolean) => {
  if (hasRealTask || getRuntimeStageTaskId(stage)) return false;
  const metadata = parseObject(stage?.metadata);
  const status = normalizeText(stage?.status || metadata?.status).toLowerCase();
  if (['done', 'completed', 'customer_approval', 'in_progress', 'active', 'blocked', 'cancelled', 'canceled'].includes(status)) {
    return false;
  }
  return !status || ['todo', 'waiting', 'planned', 'draft', 'template', 'not_assigned', 'unassigned'].includes(status);
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

const collectStageTemplateSourceTexts = (stage: any) => {
  const metadata = parseObject(stage?.metadata);
  const graph = parseObject(stage?.[PROCESS_GRAPH_METADATA_KEY] || metadata?.[PROCESS_GRAPH_METADATA_KEY]);
  const laneNames = Array.isArray(graph?.lanes)
    ? graph.lanes.map((lane: any) => normalizeText(lane?.name)).filter(Boolean)
    : [];
  return [
    collectStageTemplateSourceText(stage),
    normalizeText(stage?.process_group_name || metadata?.process_group_name),
    normalizeText(stage?.source_template_name || metadata?.source_template_name),
    ...laneNames,
  ].filter(Boolean);
};

const collectRunTemplateSourceTexts = (run: any) => [
  normalizeText(run?.process_name),
  normalizeText(run?.template_name || run?.metadata?.source_template_name),
].filter(Boolean);

const collectStageProcessLinks = (stage: any) => {
  const metadata = parseObject(stage?.metadata);
  const recurrence = parseObject(stage?.recurrence_info || metadata?.recurrence_info);
  return parseProcessLinkMap(stage?.process_links || recurrence?.process_links || metadata?.process_links || metadata?.process_link_map);
};

const collectStageAssigneeFieldReference = (stage: any) => {
  const metadata = parseObject(stage?.metadata);
  const recurrence = parseObject(stage?.recurrence_info || metadata?.recurrence_info);
  return findProcessAssigneeFieldReference(
    stage?.default_assignee_field,
    metadata?.default_assignee_field,
    recurrence?.default_assignee_field,
    stage?.default_assignee_combo,
    metadata?.default_assignee_combo,
    recurrence?.default_assignee_combo,
    stage?.default_assignee_id,
    metadata?.default_assignee_id,
    recurrence?.default_assignee_id,
    stage?.default_assignee_role_id,
    metadata?.default_assignee_role_id,
    recurrence?.default_assignee_role_id,
    stage?.assignee_id,
    metadata?.assignee_id,
    recurrence?.assignee_id,
    stage?.assignee_role_id,
    metadata?.assignee_role_id,
    recurrence?.assignee_role_id,
  );
};

const formatDueLabel = (value: unknown) => formatProcessStageDueLabel(value);

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
  if (!normalizeProcessAssigneeFieldReference(raw)) return '';
  const fieldKey = getProcessAssigneeFieldKey(raw);
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

type ResolvedProcessAssignee = {
  label: string;
  avatarUrl?: string;
  kind?: 'user' | 'role';
  id?: string;
  iconKey?: string;
};

const resolveAssignee = (
  stage: any,
  directory: AssigneeDirectory | null,
  fallbackModuleId?: string | null,
  templateContext?: Record<string, any> | null,
): ResolvedProcessAssignee => {
  const metadata = parseObject(stage?.metadata);
  const recurrence = parseObject(stage?.recurrence_info || metadata?.recurrence_info);
  const rawUserId = stage?.assignee_user_id || stage?.assignee_id || stage?.default_assignee_id || metadata?.assignee_user_id || metadata?.assignee_id || metadata?.default_assignee_id || recurrence?.assignee_user_id || recurrence?.assignee_id || recurrence?.default_assignee_id;
  const rawRoleId = stage?.assignee_role_id || stage?.default_assignee_role_id || metadata?.assignee_role_id || metadata?.default_assignee_role_id || recurrence?.assignee_role_id || recurrence?.default_assignee_role_id;
  const fieldReference = findProcessAssigneeFieldReference(
    rawUserId,
    rawRoleId,
    stage?.default_assignee_field,
    metadata?.default_assignee_field,
    recurrence?.default_assignee_field,
    stage?.default_assignee_combo,
    metadata?.default_assignee_combo,
    recurrence?.default_assignee_combo,
  );
  if (fieldReference && templateContext) {
    const resolvedReference = resolveProcessAssigneeReference(fieldReference, templateContext);
    const parsedReference = parseAssigneeValue(resolvedReference, null);
    const resolvedId = normalizeDbUuid(parsedReference.assigneeId);
    if (parsedReference.assigneeType === 'role' && resolvedId) {
      const role = directory?.roles?.find((item) => normalizeText(item.id) === resolvedId);
      return {
        label: role?.title || 'نقش مسئول',
        avatarUrl: undefined,
        kind: 'role' as const,
        id: resolvedId,
        iconKey: role?.icon_key,
      };
    }
    if (parsedReference.assigneeType === 'user' && resolvedId) {
      const user = directory?.users?.find((item) => normalizeText(item.id) === resolvedId);
      return {
        label: user?.display_name || user?.full_name || 'کاربر مسئول',
        avatarUrl: user?.avatar_url || undefined,
        kind: 'user' as const,
        id: resolvedId,
      };
    }
  }
  const roleCandidate = parseAssigneeValue(rawRoleId, 'role');
  const userCandidate = parseAssigneeValue(rawUserId, 'user');
  const comboCandidate = parseAssigneeValue(
    stage?.default_assignee_combo
    || metadata?.default_assignee_combo
    || recurrence?.default_assignee_combo,
    null,
  );
  const roleId = normalizeDbUuid(
    roleCandidate.assigneeType === 'role' ? roleCandidate.assigneeId : (
      userCandidate.assigneeType === 'role' ? userCandidate.assigneeId : (
        comboCandidate.assigneeType === 'role' ? comboCandidate.assigneeId : ''
      )
    )
  );
  const userId = roleId ? '' : normalizeDbUuid(
    userCandidate.assigneeType === 'user' ? userCandidate.assigneeId : (
      comboCandidate.assigneeType === 'user' ? comboCandidate.assigneeId : ''
    )
  );
  const fieldLabel = resolveFieldAssigneeLabel(
    fieldReference,
    stage,
    fallbackModuleId,
  );
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
      kind: 'user' as const,
      id: userId,
    };
  }
  if (roleId) {
    const role = directory?.roles?.find((item) => normalizeText(item.id) === roleId);
    return {
      label: role?.title || 'نقش مسئول',
      avatarUrl: undefined,
      kind: 'role' as const,
      id: roleId,
      iconKey: role?.icon_key,
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
  allStages: any[] = [],
  graph?: any,
): ProcessV2Stage => {
  const metadata = parseObject(stage?.metadata);
  const status = normalizeText(stage?.status || metadata?.status).toLowerCase();
  const explicitDraft = (
    stage?.is_draft === true
    || metadata?.is_draft === true
    || metadata?.draft === true
    || ['draft', 'template', 'not_assigned', 'unassigned'].includes(status)
  );
  const hasRealTask = stage?.__process_v2_has_real_task === true || Boolean(getRuntimeStageTaskId(stage));
  const effectiveKind = hasRealTask
    ? 'activity'
    : (explicitDraft || (kind === 'activity' && shouldForceActivityStageToDraft(stage, hasRealTask)) ? 'draft' : kind);
  const stageTemplateContext = assignProcessTemplateIdentityAliases(
    { ...templateContext },
    {
      processName: stage?.process_name
        || stage?.process_group_name
        || metadata?.process_group_name
        || metadata?.source_template_name,
      laneName: resolveProcessTemplateLaneName(stage),
    },
  );
  const assignee = resolveAssignee(stage, directory, fallbackModuleId, stageTemplateContext);
  const rawDue = resolveProcessStageDueValue({
    stage,
    stages: allStages,
    graph,
    processStartedAt: stage?.process_started_at || stage?.started_at || stage?.created_at || null,
  });
  const scheduleRuleLabel = formatProcessStageScheduleRule({ stage, stages: allStages, graph });
  const automationActionCount = getAutomationActionCount(stage);
  const fallbackActionCount = Number(stage?.action_count ?? metadata?.action_count ?? metadata?.actions_count ?? 0);
  const actionCount = automationActionCount > 0 ? automationActionCount : fallbackActionCount;
  const statusLabel = effectiveKind === 'draft' ? 'پیش نویس' : getTaskStatusLabel(status || 'todo', stage);
  const activityType = resolveStageActivityType(stage);
  const rawTitle = normalizeText(stage?.stage_name || stage?.name || stage?.title || stage?.label) || `مرحله ${toPersianNumber(index + 1)}`;
  const title = renderTemplateVariables ? (renderTemplateText(rawTitle, stageTemplateContext) || rawTitle) : rawTitle;
  return {
    id: normalizeText(stage?.id || stage?.template_stage_id || stage?.process_run_stage_id || stage?.[PROCESS_NODE_KEY]) || `stage_${index + 1}`,
    title,
    kind: effectiveKind,
    status: mapStageStatus(status, effectiveKind),
    layoutSlot: index,
    assigneeLabel: assignee.label,
    assigneeAvatarUrl: assignee.avatarUrl,
    assigneeKind: assignee.kind,
    assigneeId: assignee.id,
    assigneeIconKey: assignee.iconKey,
    activityTypeLabel: activityType,
    dueLabel: effectiveKind === 'draft'
      ? scheduleRuleLabel
      : (formatDueLabel(rawDue) || scheduleRuleLabel),
    actionCount: Number.isFinite(actionCount) ? Math.max(0, actionCount) : 0,
    metaLabel: statusLabel,
    source: {
      ...stage,
      __process_v2_template_context: stageTemplateContext,
      __process_v2_fallback_module_id: fallbackModuleId || null,
    },
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
    .map((lane, laneIndex) => {
      const rawLaneTitle = normalizeText(lane.name) || `ردیف ${toPersianNumber(laneIndex + 1)}`;
      const laneTitle = renderTemplateVariables
        ? (renderTemplateText(rawLaneTitle, templateContext) || rawLaneTitle)
        : rawLaneTitle;
      return {
      id: normalizeText(lane.key) || `lane_${laneIndex + 1}`,
      title: laneTitle,
      stages: lane.stages.map((stage: any, stageIndex: number) => {
        const stageWithGraphKeys = {
          ...stage,
          [PROCESS_LANE_KEY]: stage?.[PROCESS_LANE_KEY] || lane.key,
        };
        return mapRawStageToV2(
          stageWithGraphKeys,
          stageIndex,
          kind,
          directory,
          templateContext,
          fallbackModuleId,
          renderTemplateVariables,
          materialized.stages,
          materialized.graph,
        );
      }),
    };
    })
    .filter((lane) => lane.stages.length > 0);

  return lanes.length > 0 ? lanes : [{ id: 'lane_1', title: 'ردیف اصلی', stages: [] }];
};

const getModuleLabel = (moduleId?: string | null) => {
  const normalized = normalizeText(moduleId);
  const processModuleLabels: Record<string, string> = {
    process_templates: 'الگوی فرآیند',
    process_template_stages: 'مرحله الگوی فرآیند',
    process_runs: 'اجرای فرآیند',
    process_run_stages: 'مرحله اجرای فرآیند',
    tasks: 'فعالیت',
  };
  if (processModuleLabels[normalized]) return processModuleLabels[normalized];
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
    auditSource: recordData,
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
  const rawProcessTitle = normalizeText(run?.process_name) || templateTitle || 'فرآیند';
  const processTitle = renderTemplateText(rawProcessTitle, templateContext) || rawProcessTitle;
  const runTemplateContext = assignProcessTemplateIdentityAliases(
    { ...templateContext },
    { processName: processTitle },
  );
  const runMetadata = parseObject(run?.metadata);
  const runGroupId = collectExplicitProcessGroupIds(run)[0] || '';
  return {
    mode: 'run',
    id,
    title: processTitle,
    templateId,
    templateTitle,
    relatedRecordLabel: fallbackRecordLabel,
    statusLabel: normalizeText(run?.status) || 'active',
    realtimeLabel: 'زنده',
    auditSource: run,
    lanes: buildLanesFromStages(
      stages.map((stage) => ({
        ...stage,
        process_group_id: stage?.process_group_id || parseObject(stage?.metadata)?.process_group_id || runGroupId || null,
        source_template_id: stage?.source_template_id || run?.template_id || runMetadata?.source_template_id || null,
        process_started_at: stage?.process_started_at || run?.started_at || run?.created_at || null,
      })),
      'activity',
      directory,
      runTemplateContext,
      run?.module_id,
    ),
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
    stage?.draft_stage_id,
    stage?.draft_stage_key,
    stage?.template_stage_id,
    stage?.process_run_stage_id,
    stage?.run_stage_id,
    stage?.process_node_key,
    stage?.[PROCESS_NODE_KEY],
    metadata?.id,
    metadata?.task_id,
    metadata?.draft_stage_id,
    metadata?.draft_stage_key,
    metadata?.template_stage_id,
    metadata?.process_run_stage_id,
    metadata?.run_stage_id,
    metadata?.process_node_key,
    metadata?.[PROCESS_NODE_KEY],
    sourceStage?.id,
    sourceStage?.task_id,
    sourceStage?.draft_stage_id,
    sourceStage?.draft_stage_key,
    sourceStage?.template_stage_id,
    sourceStage?.process_run_stage_id,
    sourceStage?.run_stage_id,
    sourceStage?.process_node_key,
    getProcessStageNodeKey(stage, index),
  ].map(normalizeText).filter(Boolean);
};

const rawStageMatchesV2Stage = (rawStage: any, stage: ProcessV2Stage, index = 0) => {
  const stageSource = stage.source && typeof stage.source === 'object' ? stage.source : stage;
  if (!isProcessInstanceMutationScopeCompatible(rawStage, stageSource)) return false;
  const matchIds = getProcessV2StageMatchIds(stage);
  if (matchIds.size === 0) return false;
  return collectRawStageIdentityIds(rawStage, index).some((id) => matchIds.has(id));
};

const rawStageMatchesV2StageIdsWithinInstance = (
  rawStage: any,
  stage: ProcessV2Stage,
  wantedIds: Set<string>,
  index = 0,
) => {
  const stageSource = stage.source && typeof stage.source === 'object' ? stage.source : stage;
  if (!isProcessInstanceMutationScopeCompatible(rawStage, stageSource)) return false;
  return rawStageMatchesV2Stage(rawStage, stage, index)
    || collectRawStageIdentityIds(rawStage, index).some((id) => wantedIds.has(id));
};

const collectV2StageAutoAssignIds = (stage: ProcessV2Stage, index = 0) => {
  const source = stage.source && typeof stage.source === 'object' ? stage.source : {};
  const sourceStage = source.source_stage && typeof source.source_stage === 'object' ? source.source_stage : {};
  const metadata = parseObject(source?.metadata);
  const sourceMetadata = parseObject(sourceStage?.metadata);
  return [
    ...Array.from(getProcessV2StageMatchIds(stage)),
    stage.id,
    source?.id,
    source?.template_stage_id,
    source?.process_run_stage_id,
    source?.process_node_key,
    source?.[PROCESS_NODE_KEY],
    metadata?.draft_stage_id,
    metadata?.draft_stage_key,
    metadata?.template_stage_id,
    metadata?.process_node_key,
    metadata?.[PROCESS_NODE_KEY],
    sourceStage?.id,
    sourceStage?.template_stage_id,
    sourceStage?.process_run_stage_id,
    sourceStage?.process_node_key,
    sourceStage?.[PROCESS_NODE_KEY],
    sourceMetadata?.draft_stage_id,
    sourceMetadata?.draft_stage_key,
    sourceMetadata?.template_stage_id,
    sourceMetadata?.process_node_key,
    sourceMetadata?.[PROCESS_NODE_KEY],
    getProcessStageNodeKey(sourceStage, index),
    getProcessStageNodeKey(source, index),
  ].map(normalizeText).filter(Boolean);
};

const getV2StageLayoutSlot = (stage: ProcessV2Stage, fallbackIndex: number) => (
  typeof stage.layoutSlot === 'number' && Number.isFinite(stage.layoutSlot)
    ? Math.max(0, Math.floor(stage.layoutSlot))
    : fallbackIndex
);

const getV2StageSourceLaneKey = (stage: ProcessV2Stage) => {
  const source = stage.source && typeof stage.source === 'object' ? stage.source : {};
  const metadata = parseObject(source?.metadata);
  const sourceStage = source?.source_stage && typeof source.source_stage === 'object' ? source.source_stage : {};
  const sourceMetadata = parseObject(sourceStage?.metadata);
  return normalizeText(
    source?.process_lane_key
    || source?.[PROCESS_LANE_KEY]
    || metadata?.process_lane_key
    || metadata?.[PROCESS_LANE_KEY]
    || sourceStage?.process_lane_key
    || sourceStage?.[PROCESS_LANE_KEY]
    || sourceMetadata?.process_lane_key
    || sourceMetadata?.[PROCESS_LANE_KEY],
  );
};

const getV2StageSourceSortOrder = (stage: ProcessV2Stage) => {
  const source = stage.source && typeof stage.source === 'object' ? stage.source : {};
  const metadata = parseObject(source?.metadata);
  const sourceStage = source?.source_stage && typeof source.source_stage === 'object' ? source.source_stage : {};
  const sourceMetadata = parseObject(sourceStage?.metadata);
  return Number(
    source?.sort_order
    || source?.source_stage_sort_order
    || metadata?.sort_order
    || metadata?.source_stage_sort_order
    || sourceStage?.sort_order
    || sourceStage?.source_stage_sort_order
    || sourceMetadata?.sort_order
    || 0
  ) || 0;
};

const getV2StageTaskId = (stage: ProcessV2Stage) => {
  const source = stage.source && typeof stage.source === 'object' ? stage.source : {};
  const sourceStage = source?.source_stage && typeof source.source_stage === 'object' ? source.source_stage : {};
  const metadata = parseObject(source?.metadata);
  const sourceMetadata = parseObject(sourceStage?.metadata);
  return normalizeDbUuid(
    source?.task_id
    || source?.process_task_id
    || (source?.__process_v2_has_real_task === true || stage.kind === 'activity' ? source?.id : '')
    || metadata?.task_id
    || metadata?.process_task_id
    || sourceStage?.task_id
    || sourceStage?.process_task_id
    || sourceMetadata?.task_id,
  );
};

const getV2StageRunStageId = (stage: ProcessV2Stage) => {
  const source = stage.source && typeof stage.source === 'object' ? stage.source : {};
  const sourceStage = source?.source_stage && typeof source.source_stage === 'object' ? source.source_stage : {};
  const metadata = parseObject(source?.metadata);
  return normalizeDbUuid(
    source?.process_run_stage_id
    || source?.run_stage_id
    || sourceStage?.id
    || sourceStage?.process_run_stage_id
    || metadata?.process_run_stage_id
    || metadata?.run_stage_id
    || (source?.process_run_id ? source?.id : ''),
  );
};

const getRawStageLaneKey = (stage: any) => {
  const metadata = parseObject(stage?.metadata);
  return normalizeText(stage?.process_lane_key || stage?.[PROCESS_LANE_KEY] || metadata?.process_lane_key || metadata?.[PROCESS_LANE_KEY]);
};

const getRawStageSortOrder = (stage: any) => {
  const metadata = parseObject(stage?.metadata);
  const recurrence = parseObject(stage?.recurrence_info || metadata?.recurrence_info);
  return Number(
    stage?.source_stage_sort_order
    || stage?.sort_order
    || metadata?.source_stage_sort_order
    || metadata?.sort_order
    || recurrence?.source_stage_sort_order
    || 0
  ) || 0;
};

const getRawStageTitleKey = (stage: any) => {
  const metadata = parseObject(stage?.metadata);
  return normalizeText(stage?.stage_name || stage?.name || stage?.title || metadata?.stage_name || metadata?.name).toLowerCase();
};

const rawDraftCandidateMatchesV2StagePoint = (candidate: any, candidateIndex: number, stage: ProcessV2Stage, stageIndex = 0) => {
  const source = stage.source && typeof stage.source === 'object' ? stage.source : {};
  if (!isProcessInstanceMutationScopeCompatible(candidate, source)) return false;
  if (rawStageMatchesV2Stage(candidate, stage, candidateIndex)) return true;
  const wantedIds = new Set(collectV2StageAutoAssignIds(stage, stageIndex));
  if (collectRawStageIdentityIds(candidate, candidateIndex).some((id) => wantedIds.has(id))) return true;

  const sourceStage = source?.source_stage && typeof source.source_stage === 'object' ? source.source_stage : {};
  const sourceMetadata = parseObject(source?.metadata);
  const candidateMeta = resolveDraftGroupMeta(candidate);
  const sourceMeta = resolveDraftGroupMeta(source);
  const targetGroupId = normalizeText(
    source?.process_group_id
    || sourceMetadata?.process_group_id
    || source?.source_template_id
    || sourceMeta.groupId,
  );
  if (targetGroupId && candidateMeta.groupId && targetGroupId !== candidateMeta.groupId) return false;

  const targetStrongIds = new Set([
    source?.process_node_key,
    source?.[PROCESS_NODE_KEY],
    sourceMetadata?.process_node_key,
    sourceMetadata?.[PROCESS_NODE_KEY],
    source?.template_stage_id,
    source?.source_template_stage_id,
    sourceStage?.template_stage_id,
    sourceStage?.id,
    sourceStage?.process_node_key,
    getProcessStageNodeKey(source, stageIndex),
  ].map(normalizeText).filter(Boolean));
  if (targetStrongIds.size > 0 && collectRawStageIdentityIds(candidate, candidateIndex).some((id) => targetStrongIds.has(id))) {
    return true;
  }

  const targetLaneKey = normalizeText(
    source?.process_lane_key
    || source?.[PROCESS_LANE_KEY]
    || sourceMetadata?.process_lane_key
    || sourceMetadata?.[PROCESS_LANE_KEY],
  );
  const targetSortOrder = Number(source?.source_stage_sort_order || source?.sort_order || sourceMetadata?.source_stage_sort_order || sourceMetadata?.sort_order || 0) || 0;
  if (targetLaneKey && targetSortOrder > 0) {
    return getRawStageLaneKey(candidate) === targetLaneKey && getRawStageSortOrder(candidate) === targetSortOrder;
  }

  const targetTitle = normalizeText(source?.stage_name || source?.name || stage.title).toLowerCase();
  return Boolean(targetGroupId && targetSortOrder > 0 && targetTitle)
    && getRawStageSortOrder(candidate) === targetSortOrder
    && getRawStageTitleKey(candidate) === targetTitle;
};

// بعضی previewهای قدیمی، context اجرایی را کامل برنمی‌گردانند. در حذف نباید
// صرفاً به خاطر این نقص، مرحلهٔ واقعیِ همان گروه پیدا نشود؛ اما fallback فقط
// در مرز process_group و با node پایدار یا lane+sort فعال است، نه با عنوان.
const isSameDraftStageWithinProcessGroup = (
  candidate: any,
  candidateIndex: number,
  stage: ProcessV2Stage,
  stageIndex = 0,
) => {
  const source = stage.source && typeof stage.source === 'object' ? stage.source : {};
  const candidateGroupId = normalizeText(resolveDraftGroupMeta(candidate).groupId);
  const sourceGroupId = normalizeText(resolveDraftGroupMeta(source).groupId);
  if (!candidateGroupId || !sourceGroupId || candidateGroupId !== sourceGroupId) return false;

  const candidateIds = new Set(collectRawStageIdentityIds(candidate, candidateIndex));
  const sourceIds = collectV2StageAutoAssignIds(stage, stageIndex);
  if (sourceIds.some((id) => candidateIds.has(normalizeText(id)))) return true;

  const sourceNodeKey = normalizeText(
    source?.process_node_key
    || source?.[PROCESS_NODE_KEY]
    || parseObject(source?.metadata)?.process_node_key
    || parseObject(source?.metadata)?.[PROCESS_NODE_KEY],
  );
  if (sourceNodeKey && candidateIds.has(sourceNodeKey)) return true;

  const sourceLaneKey = getV2StageSourceLaneKey(stage);
  const sourceSortOrder = getV2StageSourceSortOrder(stage);
  return Boolean(sourceLaneKey && sourceSortOrder > 0)
    && getRawStageLaneKey(candidate) === sourceLaneKey
    && getRawStageSortOrder(candidate) === sourceSortOrder;
};

const collectV2CardStagePositions = (card: ProcessV2CardData) => (
  card.lanes.flatMap((lane) => (
    [...(lane.stages || [])]
      .sort((left, right) => {
        const leftSlot = getV2StageLayoutSlot(left, 0);
        const rightSlot = getV2StageLayoutSlot(right, 0);
        if (leftSlot !== rightSlot) return leftSlot - rightSlot;
        return normalizeText(left.id).localeCompare(normalizeText(right.id));
      })
      .map((stage, index) => ({
        stage,
        laneKey: normalizeText(lane.id) || 'lane_1',
        sortOrder: (index + 1) * 10,
      }))
  ))
);

const patchV2StageSourcePosition = (stage: ProcessV2Stage, laneKey: string, sortOrder: number): ProcessV2Stage => {
  const source = stage.source && typeof stage.source === 'object' ? stage.source : {};
  const metadata = parseObject(source?.metadata);
  const sourceStage = source?.source_stage && typeof source.source_stage === 'object' ? source.source_stage : null;
  const patchedSourceStage = sourceStage
    ? {
        ...sourceStage,
        sort_order: sortOrder,
        source_stage_sort_order: sortOrder,
        [PROCESS_LANE_KEY]: laneKey,
        metadata: {
          ...parseObject(sourceStage?.metadata),
          [PROCESS_LANE_KEY]: laneKey,
        },
      }
    : sourceStage;
  return {
    ...stage,
    layoutSlot: Math.max(0, Math.floor(sortOrder / 10) - 1),
    source: {
      ...source,
      sort_order: sortOrder,
      source_stage_sort_order: sortOrder,
      [PROCESS_LANE_KEY]: laneKey,
      ...(patchedSourceStage ? { source_stage: patchedSourceStage } : {}),
      metadata: {
        ...metadata,
        [PROCESS_LANE_KEY]: laneKey,
        sort_order: sortOrder,
      },
    },
  };
};

const patchV2CardStageSourcePositions = (card: ProcessV2CardData): ProcessV2CardData => {
  const positionByStageId = new Map<string, { laneKey: string; sortOrder: number }>();
  collectV2CardStagePositions(card).forEach((entry) => {
    positionByStageId.set(entry.stage.id, { laneKey: entry.laneKey, sortOrder: entry.sortOrder });
  });
  return {
    ...card,
    lanes: card.lanes.map((lane) => ({
      ...lane,
      stages: lane.stages.map((stage) => {
        const position = positionByStageId.get(stage.id);
        return position ? patchV2StageSourcePosition(stage, position.laneKey, position.sortOrder) : stage;
      }),
    })),
  } as ProcessV2CardData;
};

const mergeRuntimeDraftStageForAutoAssign = (
  rawStage: any,
  stageSource: any,
  runtimeStage: any,
) => {
  const rawMetadata = parseObject(rawStage?.metadata);
  const sourceMetadata = parseObject(stageSource?.metadata);
  const runtimeMetadata = parseObject(runtimeStage?.metadata);
  const rawRecurrence = parseObject(rawStage?.recurrence_info);
  const sourceRecurrence = parseObject(stageSource?.recurrence_info);
  const runtimeRecurrence = parseObject(runtimeStage?.recurrence_info || runtimeMetadata?.recurrence_info);
  const nextMetadata = {
    ...rawMetadata,
    ...sourceMetadata,
    ...runtimeMetadata,
  };
  const nextRecurrence = {
    ...rawRecurrence,
    ...sourceRecurrence,
    ...runtimeRecurrence,
  };
  const sourceStage = stageSource?.source_stage && typeof stageSource.source_stage === 'object'
    ? stageSource.source_stage
    : {};
  return {
    ...rawStage,
    ...sourceStage,
    ...stageSource,
    ...runtimeStage,
    id: rawStage?.id || sourceStage?.id || stageSource?.id || runtimeStage?.id,
    process_run_stage_id: runtimeStage?.id || stageSource?.process_run_stage_id || sourceStage?.process_run_stage_id || sourceStage?.id,
    template_stage_id: runtimeStage?.template_stage_id || stageSource?.template_stage_id || sourceStage?.template_stage_id || rawStage?.template_stage_id,
    process_node_key: runtimeStage?.process_node_key || stageSource?.process_node_key || sourceStage?.process_node_key || rawStage?.process_node_key,
    process_lane_key: runtimeStage?.process_lane_key || stageSource?.process_lane_key || sourceStage?.process_lane_key || rawStage?.process_lane_key,
    stage_name: runtimeStage?.stage_name || stageSource?.stage_name || rawStage?.stage_name || rawStage?.name,
    name: runtimeStage?.stage_name || stageSource?.name || stageSource?.stage_name || rawStage?.name || rawStage?.stage_name,
    assignee_id: runtimeStage?.assignee_user_id ?? stageSource?.assignee_id ?? rawStage?.assignee_id,
    default_assignee_id: runtimeStage?.assignee_user_id ?? stageSource?.default_assignee_id ?? rawStage?.default_assignee_id,
    assignee_user_id: runtimeStage?.assignee_user_id ?? stageSource?.assignee_user_id ?? rawStage?.assignee_user_id,
    assignee_role_id: runtimeStage?.assignee_role_id ?? stageSource?.assignee_role_id ?? rawStage?.assignee_role_id,
    default_assignee_role_id: runtimeStage?.assignee_role_id ?? stageSource?.default_assignee_role_id ?? rawStage?.default_assignee_role_id,
    wage: runtimeStage?.wage ?? stageSource?.wage ?? rawStage?.wage,
    due_date: runtimeStage?.planned_due_at ?? stageSource?.due_date ?? rawStage?.due_date,
    start_date: runtimeStage?.planned_start_at ?? stageSource?.start_date ?? rawStage?.start_date,
    task_type: runtimeMetadata?.task_type || sourceMetadata?.task_type || rawMetadata?.task_type || stageSource?.task_type || rawStage?.task_type,
    metadata: nextMetadata,
    recurrence_info: nextRecurrence,
  };
};

const collectProcessGroupIdentityKeys = (value: any) => {
  return collectProcessInstanceIdentityKeys(value);
};

const mapRuntimeTaskToStage = (task: any, index = 0) => {
  const recurrence = parseObject(task?.recurrence_info);
  const metadata = parseObject(task?.metadata);
  const nodeKey = normalizeText(
    task?.process_node_key
    || task?.[PROCESS_NODE_KEY]
    || recurrence?.process_node_key
    || recurrence?.[PROCESS_NODE_KEY]
    || metadata?.process_node_key
    || metadata?.[PROCESS_NODE_KEY]
    || task?.process_run_stage_id
    || task?.id
  ) || `task_${index + 1}`;
  const laneKey = normalizeText(
    task?.process_lane_key
    || task?.[PROCESS_LANE_KEY]
    || recurrence?.process_lane_key
    || recurrence?.[PROCESS_LANE_KEY]
    || metadata?.process_lane_key
    || metadata?.[PROCESS_LANE_KEY]
  ) || 'lane_1';
  return {
    ...task,
    id: normalizeText(task?.process_run_stage_id || task?.id) || nodeKey,
    task_id: task?.id || null,
    stage_name: task?.name || task?.stage_name || `مرحله ${toPersianNumber(index + 1)}`,
    process_node_key: nodeKey,
    process_lane_key: laneKey,
    __process_v2_has_real_task: true,
  };
};

const buildTaskBackedRunCards = (
  tasks: any[],
  runtimeRuns: any[],
  directory: AssigneeDirectory | null,
  fallbackRecordLabel: string,
  templateNameById: Map<string, string>,
  templateContext: Record<string, any>,
): ProcessV2CardData[] => {
  const runIds = new Set((runtimeRuns || []).map((run: any) => normalizeText(run?.id)).filter(Boolean));
  const groups = new Map<string, { run: any; tasks: any[]; firstSort: number }>();
  (tasks || []).forEach((task: any, index: number) => {
    const runId = normalizeText(task?.process_run_id || parseObject(task?.recurrence_info)?.process_run_id);
    if (runId && runIds.has(runId)) return;
    const keys = collectProcessGroupIdentityKeys(task);
    const groupId = runId || keys[0] || normalizeText(task?.source_template_id) || 'task_process_group';
    if (!groups.has(groupId)) {
      const templateId = normalizeText(task?.source_template_id || parseObject(task?.recurrence_info)?.source_template_id);
      groups.set(groupId, {
        run: {
          id: groupId,
          template_id: templateId || null,
          process_group_id: normalizeText(task?.process_group_id) || groupId,
          process_name: templateId ? templateNameById.get(templateId) : '',
          status: 'active',
          module_id: normalizeText(task?.source_module_id),
          record_id: normalizeText(task?.source_record_id),
          created_at: task?.created_at || task?.updated_at || null,
          updated_at: task?.updated_at || null,
          __process_v2_task_backed: true,
        },
        tasks: [],
        firstSort: Number(task?.sort_order || task?.source_stage_sort_order || index + 1),
      });
    }
    groups.get(groupId)!.tasks.push(mapRuntimeTaskToStage(task, index));
  });

  return Array.from(groups.values())
    .sort((left, right) => left.firstSort - right.firstSort)
    .map((group) => buildRunCard(group.run, group.tasks, directory, fallbackRecordLabel, templateNameById, templateContext))
    .filter((item): item is ProcessV2CardData => Boolean(item));
};

const buildDraftProcessCards = (
  draftStages: any[],
  directory: AssigneeDirectory | null,
  templateNameById: Map<string, string>,
  runtimeRuns: any[],
  runtimeTasks: any[],
  templateContext: Record<string, any>,
  fallbackModuleId?: string | null,
): ProcessV2CardData[] => {
  const materializedProcessIndex = buildMaterializedProcessIdentityIndex([
    ...(runtimeRuns || []),
    ...(runtimeTasks || []),
  ]);
  const groups = new Map<string, { id: string; label: string; templateId: string; templateName: string; stages: any[]; firstSort: number }>();

  (Array.isArray(draftStages) ? draftStages : []).forEach((stage: any, index: number) => {
    const meta = resolveDraftGroupMeta(stage);
    if (isDraftProcessInstanceMaterialized(stage, materializedProcessIndex)) return;
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
    .map((group) => {
      const rawProcessTitle = group.label || group.templateName || 'فرآیند پیش نویس';
      const processTitle = renderTemplateText(rawProcessTitle, templateContext) || rawProcessTitle;
      return {
      mode: 'run' as const,
      id: `draft:${group.id}`,
      title: processTitle,
      templateId: group.templateId,
      templateTitle: group.templateId ? (templateNameById.get(group.templateId) || group.templateName) : group.templateName,
      relatedRecordLabel: '',
      statusLabel: 'draft',
      auditSource: group.stages[0] || null,
      lanes: buildLanesFromStages(
        group.stages,
        'draft',
        directory,
        assignProcessTemplateIdentityAliases({ ...templateContext }, { processName: processTitle }),
        fallbackModuleId,
      ),
    };
    });
};

const getProcessCardCreatedAt = (card: ProcessV2CardData) => {
  const source = card.auditSource && typeof card.auditSource === 'object' ? card.auditSource : {};
  const metadata = parseObject(source?.metadata);
  const firstStageSource = card.lanes.flatMap((lane) => lane.stages)
    .map((stage) => (stage.source && typeof stage.source === 'object' ? stage.source : {}))[0] || {};
  const firstStageMetadata = parseObject(firstStageSource?.metadata);
  const rawValue = source?.process_created_at
    || metadata?.process_created_at
    || source?.created_at
    || source?.started_at
    || source?.updated_at
    || firstStageSource?.process_created_at
    || firstStageMetadata?.process_created_at
    || firstStageSource?.created_at
    || firstStageSource?.updated_at;
  const timestamp = new Date(rawValue || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const isCompletedProcessCard = (card: ProcessV2CardData) => {
  const status = normalizeText(card.statusLabel).toLowerCase();
  if (['done', 'completed', 'confirmed', 'final', 'settled'].includes(status)) return true;
  const stages = card.lanes.flatMap((lane) => lane.stages);
  return stages.length > 0 && stages.every((stage) => (
    stage.kind === 'activity' && ['done', 'canceled'].includes(stage.status)
  ));
};

const fetchRunStages = async (runId: string, options?: { force?: boolean }) => {
  if (!runId) return [];
  const extended = await supabase
    .from('process_run_stages')
    .select('id, process_run_id, template_stage_id, stage_name, sort_order, status, task_id, assignee_user_id, assignee_role_id, planned_due_at, completed_at, metadata, process_node_key, process_lane_key')
    .eq('process_run_id', runId)
    .order('sort_order', { ascending: true });
  if (!extended.error) return filterDeletedProcessRunStageMarks(supabase, extended.data || [], options);

  const fallback = await supabase
    .from('process_run_stages')
    .select('id, process_run_id, template_stage_id, stage_name, sort_order, status, task_id, assignee_user_id, assignee_role_id, metadata')
    .eq('process_run_id', runId)
    .order('sort_order', { ascending: true });
  if (fallback.error) throw fallback.error;
  return filterDeletedProcessRunStageMarks(supabase, fallback.data || [], options);
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

const isInvalidUuidLikeError = (error: any) => {
  const text = normalizeText(error?.message || error?.details || error?.hint).toLowerCase();
  return error?.code === '22P02' || text.includes('invalid input syntax for type uuid');
};

const moveProcessRowsToRecycleBin = async (
  sourceTable: 'process_templates' | 'process_template_stages' | 'process_runs' | 'process_run_stages',
  moduleId: string,
  ids: string[],
) => {
  const normalizedIds = Array.from(new Set(ids.map(normalizeDbUuid).filter(Boolean)));
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
  const normalizedIds = Array.from(new Set(ids.map(normalizeDbUuid).filter(Boolean)));
  if (normalizedIds.length === 0) return 0;
  const { error } = await (supabase.from(sourceTable as any) as any)
    .delete()
    .in('id', normalizedIds);
  if (!error) return normalizedIds.length;
  if (sourceTable !== 'process_run_stages' || !isInvalidUuidLikeError(error)) throw error;
  const { error: softDeleteError } = await (supabase.from(sourceTable as any) as any)
    .update({
      status: 'canceled',
      task_id: null,
      assignee_user_id: null,
      assignee_role_id: null,
      metadata: {
        process_v2_deleted: true,
        deleted_from_process_v2: true,
        deleted_at: new Date().toISOString(),
      },
    })
    .in('id', normalizedIds);
  if (softDeleteError) throw softDeleteError;
  return normalizedIds.length;
};

const deleteProcessRunStagesSafely = async (ids: string[]) => {
  const normalizedIds = Array.from(new Set(ids.map(normalizeDbUuid).filter(Boolean)));
  if (normalizedIds.length === 0) return 0;
  const actor = await fetchSessionBootstrap(supabase);
  const { data, error } = await supabase.rpc('delete_process_run_stages_v2_safe', {
    p_stage_ids: normalizedIds,
    p_deleted_by: actor.user?.id || null,
    p_deleted_by_name: actor.profile?.full_name || null,
    p_org_id: actor.orgId || null,
  });
  if (error) throw error;
  return Number(data || 0) || 0;
};

const processV2DeleteTaskStageSafely = async (
  mode: 'unlink' | 'delete_task_keep_draft' | 'delete_all',
  taskId?: string | null,
  stageId?: string | null,
) => {
  const normalizedTaskId = normalizeDbUuid(taskId);
  const normalizedStageId = normalizeDbUuid(stageId);
  if (!normalizedTaskId && !normalizedStageId) return null;
  const actor = await fetchSessionBootstrap(supabase);
  const { data, error } = await supabase.rpc('process_v2_delete_task_stage', {
    p_org_id: actor.orgId || null,
    p_task_id: normalizedTaskId || null,
    p_stage_id: normalizedStageId || null,
    p_mode: mode,
    p_deleted_by: actor.user?.id || null,
    p_deleted_by_name: actor.profile?.full_name || null,
  });
  if (error) throw error;
  return data || null;
};

const processV2SaveDraftStageSafely = async ({
  stageId,
  stageName,
  assigneeUserId,
  assigneeRoleId,
  wage,
  plannedStartAt,
  plannedDueAt,
  metadata,
}: {
  stageId?: string | null;
  stageName?: string | null;
  assigneeUserId?: string | null;
  assigneeRoleId?: string | null;
  wage?: number | null;
  plannedStartAt?: string | null;
  plannedDueAt?: string | null;
  metadata?: Record<string, any> | null;
}) => {
  const normalizedStageId = normalizeDbUuid(stageId);
  if (!normalizedStageId) throw new Error('مرحله پیش‌نویس فرآیند برای ذخیره پیدا نشد.');
  const normalizedRoleId = normalizeDbUuid(assigneeRoleId);
  const normalizedUserId = normalizedRoleId ? '' : normalizeDbUuid(assigneeUserId);
  const actor = await fetchSessionBootstrap(supabase);
  const { data, error } = await supabase.rpc('process_v2_save_draft_stage', {
    p_org_id: actor.orgId || null,
    p_stage_id: normalizedStageId,
    p_stage_name: normalizeText(stageName) || 'مرحله',
    p_assignee_user_id: normalizedUserId || null,
    p_assignee_role_id: normalizedRoleId || null,
    p_wage: Number.isFinite(Number(wage)) ? Number(wage) : null,
    p_planned_start_at: normalizeText(plannedStartAt) || null,
    p_planned_due_at: normalizeText(plannedDueAt) || null,
    p_metadata: metadata && typeof metadata === 'object' ? metadata : {},
  });
  if (error) throw error;
  return data || null;
};

const moveProcessRunStagePositionSafely = async (
  stageId: string,
  laneKey: string,
  sortOrder: number,
) => {
  const normalizedStageId = normalizeDbUuid(stageId);
  if (!normalizedStageId) return false;
  const normalizedLaneKey = normalizeText(laneKey) || 'lane_1';
  const normalizedSortOrder = Math.max(1, Number(sortOrder || 10));
  const rpcResult = await supabase.rpc('move_process_run_stage', {
    p_process_run_stage_id: normalizedStageId,
    p_lane_key: normalizedLaneKey,
    p_sort_order: normalizedSortOrder,
  });
  if (!rpcResult.error) return true;

  const withLane = await (supabase.from('process_run_stages' as any) as any)
    .update({
      process_lane_key: normalizedLaneKey,
      sort_order: normalizedSortOrder,
      updated_at: new Date().toISOString(),
    })
    .eq('id', normalizedStageId);
  if (!withLane.error) return true;

  const sortOnly = await (supabase.from('process_run_stages' as any) as any)
    .update({
      sort_order: normalizedSortOrder,
      updated_at: new Date().toISOString(),
    })
    .eq('id', normalizedStageId);
  if (sortOnly.error) throw sortOnly.error;
  return true;
};

const updateTaskProcessPositionSafely = async (
  taskId: string,
  laneKey: string,
  sortOrder: number,
  currentRecurrence: Record<string, any> = {},
) => {
  const normalizedTaskId = normalizeDbUuid(taskId);
  if (!normalizedTaskId) return false;
  const normalizedLaneKey = normalizeText(laneKey) || 'lane_1';
  const normalizedSortOrder = Math.max(1, Number(sortOrder || 10));
  const recurrenceInfo = {
    ...currentRecurrence,
    [PROCESS_LANE_KEY]: normalizedLaneKey,
    source_stage_sort_order: normalizedSortOrder,
  };

  const withLane = await (supabase.from('tasks' as any) as any)
    .update({
      process_lane_key: normalizedLaneKey,
      sort_order: normalizedSortOrder,
      source_stage_sort_order: normalizedSortOrder,
      recurrence_info: recurrenceInfo,
    })
    .eq('id', normalizedTaskId);
  if (!withLane.error) return true;

  const withoutLane = await (supabase.from('tasks' as any) as any)
    .update({
      sort_order: normalizedSortOrder,
      source_stage_sort_order: normalizedSortOrder,
      recurrence_info: recurrenceInfo,
    })
    .eq('id', normalizedTaskId);
  if (!withoutLane.error) return true;

  const sortOnly = await (supabase.from('tasks' as any) as any)
    .update({ sort_order: normalizedSortOrder })
    .eq('id', normalizedTaskId);
  if (sortOnly.error) throw sortOnly.error;
  return true;
};

const recycleOrDeleteProcessRows = async (
  sourceTable: 'process_template_stages' | 'process_run_stages',
  moduleId: string,
  ids: string[],
) => {
  if (sourceTable === 'process_run_stages') {
    return deleteProcessRunStagesSafely(ids);
  }
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
  onRuntimeSnapshot,
  onDraftLoadRetry,
  variant = 'full',
  enabled = true,
  highlightedTaskId,
  highlightedRunStageId,
  loadLegacyLinkedDrafts = false,
  snapshotOnly = false,
}) => {
  const { message } = App.useApp();
  const normalizedModuleId = normalizeText(moduleId);
  const normalizedRecordId = normalizeText(recordId || recordData?.id);
  const cacheOrgId = normalizeText(recordData?.org_id);
  const cacheKey = `${cacheOrgId || '__unknown_org__'}:${normalizedModuleId}:${normalizedRecordId}`;
  const cachedRuntimeBlock = cacheOrgId ? processRuntimeBlockCache.get(cacheKey) : undefined;
  const cacheFresh = Boolean(cachedRuntimeBlock && Date.now() - cachedRuntimeBlock.savedAt < PROCESS_RUNTIME_BLOCK_CACHE_TTL_MS);
  const runtimeSnapshotReady = Boolean(
    runtimeSnapshot
    && runtimeSnapshot.loaded !== false
    && normalizeText(runtimeSnapshot.moduleId) === normalizedModuleId
    && normalizeText(runtimeSnapshot.recordId) === normalizedRecordId
  );
  const initialRuntimeSnapshot = runtimeSnapshotReady && runtimeSnapshot
    ? runtimeSnapshot
    : EMPTY_RUNTIME_STATE;
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
  const [hasLoadedRuntime, setHasLoadedRuntime] = useState(cacheFresh || runtimeSnapshotReady);
  const [errorText, setErrorText] = useState('');
  const [cardOverrides, setCardOverrides] = useState<Record<string, ProcessV2CardData>>({});
  const [extraCards, setExtraCards] = useState<ProcessV2CardData[]>([]);
  const [hiddenCardIds, setHiddenCardIds] = useState<Set<string>>(() => new Set());
  const [showCompletedProcesses, setShowCompletedProcesses] = useState(false);
  const [draftStagesOverride, setDraftStagesOverride] = useState<any[] | null>(null);
  const [linkedDraftStages, setLinkedDraftStages] = useState<any[]>(() => (
    cacheFresh && cachedRuntimeBlock ? cachedRuntimeBlock.linkedDraftStages || EMPTY_STAGE_LIST : EMPTY_STAGE_LIST
  ));
  const [autoAssigningCardIds, setAutoAssigningCardIds] = useState<Record<string, boolean>>({});
  const [stageDeleteRequest, setStageDeleteRequest] = useState<StageDeleteRequest | null>(null);
  const [stageDeleteBusy, setStageDeleteBusy] = useState<StageDeleteMode | null>(null);
  const [bulkDeleteRequest, setBulkDeleteRequest] = useState<BulkDeleteRequest | null>(null);
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState<StageDeleteMode | null>(null);
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
  const templateVariableOptions = useMemo(() => Array.from(
    new Map(
      getProcessTargetModuleFields(
        processTemplateTargetModuleIds,
        getVisibleWorkflowModuleFields,
        getSyntheticWorkflowAssigneeField,
      )
        .map((field) => {
          const key = normalizeText(field?.key);
          const label = getFieldLabelFa(field, { fallback: key });
          return [key, { key, label, token: `{{${key}}}` }] as const;
        })
        .filter(([key, option]) => Boolean(key && option.label)),
    ).values(),
  ), [processTemplateTargetModuleIds]);
  const activatorConditionFields = useMemo(
    () => getProcessAutomationConditionFieldsForModules(processTemplateTargetModuleIds),
    [processTemplateTargetModuleIds],
  );
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRequestIdRef = useRef(0);
  const initialRefreshKeyRef = useRef('');
  const activeRuntimeCacheKeyRef = useRef(cacheKey);
  const pendingScrollToFirstCardRef = useRef(false);
  const pendingScrollCardKeyRef = useRef<string | null>(null);
  const cardElementRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const runtimeRef = useRef<RuntimeState>(runtime);
  const templateStagesRef = useRef<any[]>(templateStages);
  const linkedDraftStagesRef = useRef<any[]>(linkedDraftStages);
  const recordDataRef = useRef<any>(recordData);
  const readOnlyVariant = variant !== 'full';
  const draftLoadErrorText = normalizeText(recordData?.__process_draft_load_error);
  const liveRuntimeEnabled = variant === 'full';
  const directDraftStages = draftStagesOverride || (Array.isArray(draftStages) ? draftStages : EMPTY_STAGE_LIST);
  const effectiveDraftStages = useMemo(() => {
    if (!Array.isArray(linkedDraftStages) || linkedDraftStages.length === 0) return directDraftStages;
    const seen = new Set<string>();
    return [...directDraftStages, ...linkedDraftStages].filter((stage: any, index) => {
      const metadata = parseObject(stage?.metadata);
      const key = [
        normalizeText(stage?.process_group_id || metadata?.process_group_id || stage?.source_template_id || metadata?.source_template_id),
        normalizeText(stage?.id || stage?.template_stage_id || stage?.process_node_key || metadata?.process_node_key),
        String(Number(stage?.sort_order || index + 1)),
      ].join(':');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [directDraftStages, linkedDraftStages]);

  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

  useEffect(() => {
    templateStagesRef.current = templateStages;
  }, [templateStages]);

  useEffect(() => {
    linkedDraftStagesRef.current = linkedDraftStages;
  }, [linkedDraftStages]);

  const directDraftStagesRef = useRef<any[]>(directDraftStages);
  useEffect(() => {
    directDraftStagesRef.current = directDraftStages;
  }, [directDraftStages]);

  useEffect(() => {
    recordDataRef.current = recordData;
  }, [recordData]);

  useEffect(() => {
    if (!isProcessTemplateModule(normalizedModuleId) || typeof window === 'undefined') return undefined;
    const handleTemplateStagesSaved = (event: Event) => {
      const detail = (event as CustomEvent<any>)?.detail || {};
      if (normalizeText(detail?.moduleId) !== 'process_templates') return;
      if (normalizeText(detail?.recordId) !== normalizedRecordId) return;
      const nextStages = Array.isArray(detail?.stages) ? detail.stages : [];
      templateStagesRef.current = nextStages;
      setTemplateStages(nextStages);
      setDraftStagesOverride(null);
      processRuntimeBlockCache.delete(cacheKey);
      setCardOverrides((current) => {
        const templateCardKey = `template:${normalizedRecordId}`;
        if (!Object.prototype.hasOwnProperty.call(current, templateCardKey)) return current;
        const next = { ...current };
        delete next[templateCardKey];
        return next;
      });
    };
    window.addEventListener('kalamapp:process-template-stages-saved', handleTemplateStagesSaved as EventListener);
    return () => {
      window.removeEventListener('kalamapp:process-template-stages-saved', handleTemplateStagesSaved as EventListener);
    };
  }, [cacheKey, normalizedModuleId, normalizedRecordId]);

  useEffect(() => {
    // در نمای کامل snapshot فقط مقدار اولیه است و حق بازنویسی پاسخ authoritative همین بلاک را ندارد.
    if (!runtimeSnapshot || variant === 'full' || runtimeSnapshot.loaded === false) return;
    if (
      normalizeText(runtimeSnapshot.moduleId) !== normalizedModuleId
      || normalizeText(runtimeSnapshot.recordId) !== normalizedRecordId
    ) return;
    setRuntime({
      runs: runtimeSnapshot?.runs || [],
      stages: runtimeSnapshot?.stages || [],
      tasks: runtimeSnapshot?.tasks || [],
    });
    setLinkedDraftStages([]);
    setHasLoadedRuntime(true);
  }, [normalizedModuleId, normalizedRecordId, runtimeSnapshot?.loaded, runtimeSnapshot?.moduleId, runtimeSnapshot?.recordId, runtimeSnapshot?.runs, runtimeSnapshot?.stages, runtimeSnapshot?.tasks, variant]);

  useEffect(() => {
    if (
      Array.isArray(draftStages)
      && shouldApplyProcessTemplateStagePreview({
        isProcessTemplate: isProcessTemplateModule(normalizedModuleId),
        currentStages: templateStagesRef.current,
        previewStages: draftStages,
      })
    ) {
      setTemplateStages(draftStages);
    }
    setDraftStagesOverride(null);
  }, [draftStages, normalizedModuleId]);

  useEffect(() => {
    const cached = processRuntimeBlockCache.get(cacheKey);
    const nextCacheFresh = Boolean(cached && Date.now() - cached.savedAt < PROCESS_RUNTIME_BLOCK_CACHE_TTL_MS);
    const identityChanged = activeRuntimeCacheKeyRef.current !== cacheKey;
    if (identityChanged) {
      activeRuntimeCacheKeyRef.current = cacheKey;
      refreshRequestIdRef.current += 1;
      const nextRuntime = nextCacheFresh && cached
        ? cached.runtime
        : runtimeSnapshotReady && runtimeSnapshot
          ? {
              runs: runtimeSnapshot.runs || [],
              stages: runtimeSnapshot.stages || [],
              tasks: runtimeSnapshot.tasks || [],
            }
          : EMPTY_RUNTIME_STATE;
      const nextTemplateStages = nextCacheFresh && cached
        ? cached.templateStages
        : (Array.isArray(draftStages) ? draftStages : []);
      runtimeRef.current = nextRuntime;
      templateStagesRef.current = nextTemplateStages;
      linkedDraftStagesRef.current = nextCacheFresh && cached ? cached.linkedDraftStages || [] : [];
      setRuntime(nextRuntime);
      setTemplateStages(nextTemplateStages);
      setLoading(false);
      setErrorText('');
      setCardOverrides({});
      setExtraCards([]);
      setHiddenCardIds(new Set());
      setDraftStagesOverride(null);
      cardElementRefs.current.clear();
    }
    setHasLoadedRuntime(nextCacheFresh || runtimeSnapshotReady);
    setLinkedDraftStages(nextCacheFresh ? cached?.linkedDraftStages || [] : []);
    setResolvedTemplateContext(null);
    setTemplateContextResolving(false);
    setTemplateContextResolvedKey('');
  }, [cacheKey, draftStages, runtimeSnapshot, runtimeSnapshotReady]);

  useEffect(() => {
    if (draftLoadErrorText) {
      setErrorText(draftLoadErrorText);
    }
  }, [draftLoadErrorText]);

  const loadDirectoryAndTemplates = useCallback(async () => {
    const applyReferencePayload = (payload: ProcessRuntimeReferencePayload) => {
      setOrgId(payload.orgId);
      if (payload.directory) setDirectory(payload.directory);
      setTemplates(payload.templates);
    };
    const bootstrap = await fetchSessionBootstrap(supabase);
    const currentOrgId = normalizeText(bootstrap?.orgId);
    const orgCacheKey = currentOrgId || '__no_org__';
    const cachedReference = processRuntimeReferenceCacheByOrg.get(orgCacheKey);
    if (cachedReference && Date.now() - cachedReference.savedAt < PROCESS_RUNTIME_REFERENCE_CACHE_TTL_MS) {
      applyReferencePayload(cachedReference);
      return;
    }
    let referencePromise = processRuntimeReferencePromiseByOrg.get(orgCacheKey);
    if (!referencePromise) {
      referencePromise = (async () => {
        const [assignees, templateRows] = await Promise.all([
          fetchAssigneeDirectory(supabase).catch(() => null),
          fetchProcessTemplateRows(supabase),
        ]);
        const nextTemplates = (templateRows || [])
          .filter((row: any) => row?.is_active !== false)
          .map((row: any) => ({
            id: normalizeText(row?.id),
            title: normalizeText(row?.name) || 'الگوی فرآیند',
            moduleId: normalizeText(row?.module_id) || null,
            moduleIds: normalizeProcessTargetModuleIds(row?.module_ids, row?.module_id),
          }))
          .filter((item) => item.id);
        return {
          orgId: currentOrgId,
          directory: assignees || null,
          templates: nextTemplates,
        };
      })().finally(() => {
        processRuntimeReferencePromiseByOrg.delete(orgCacheKey);
      });
      processRuntimeReferencePromiseByOrg.set(orgCacheKey, referencePromise);
    }

    const payload = await referencePromise;
    applyReferencePayload(payload);
    processRuntimeReferenceCacheByOrg.set(orgCacheKey, {
      ...payload,
      savedAt: Date.now(),
    });
  }, []);

  const publishRuntimeSnapshot = useCallback((nextRuntime: RuntimeState) => {
    if (!onRuntimeSnapshot || !normalizedModuleId || !normalizedRecordId) return;
    onRuntimeSnapshot({
      moduleId: normalizedModuleId,
      recordId: normalizedRecordId,
      loaded: true,
      runs: nextRuntime.runs || [],
      stages: nextRuntime.stages || [],
      tasks: nextRuntime.tasks || [],
      hasStartedExecution: isProcessExecutionStarted(nextRuntime.tasks || []),
    });
  }, [normalizedModuleId, normalizedRecordId, onRuntimeSnapshot]);

  const syncProjectStatusForRuntime = useCallback(async (
    nextRuntime: RuntimeState,
    draftStageValue?: any[] | null,
  ) => {
    if (!normalizedModuleId || !normalizedRecordId) return;
    try {
      const statuses = await syncProjectStatusesForProcessContext({
        moduleId: normalizedModuleId,
        recordId: normalizedRecordId,
        recordData: recordDataRef.current || recordData || null,
        draftStages: draftStageValue ?? [
          ...(Array.isArray(directDraftStagesRef.current) ? directDraftStagesRef.current : []),
          ...(Array.isArray(linkedDraftStagesRef.current) ? linkedDraftStagesRef.current : []),
        ],
        runStages: nextRuntime.stages || [],
        tasks: nextRuntime.tasks || [],
      });
      statuses.forEach((result) => {
        if (!result.projectId || !result.status) return;
        markModuleListChanged({
          org_id: orgId || recordDataRef.current?.org_id || null,
          module_id: 'projects',
          record_id: result.projectId,
          action: 'update',
          updated_at: new Date().toISOString(),
        });
      });
    } catch (error) {
      console.warn('Could not sync project status from process v2 runtime', error);
    }
  }, [normalizedModuleId, normalizedRecordId, orgId, recordData]);

  const refresh = useCallback(async (force = false) => {
    if (!enabled || !normalizedModuleId || !normalizedRecordId) return;
    const requestId = ++refreshRequestIdRef.current;
    if (force) {
      clearAppRuntimeCache(`process-runtime:full:${normalizedModuleId}:${normalizedRecordId}`);
      clearAppRuntimeCache(`process-runtime:summary:${normalizedModuleId}:${normalizedRecordId}`);
      clearAppRuntimeCache(`process-runtime-tasks:${normalizedModuleId}:${normalizedRecordId}`);
    }
    if (readOnlyVariant && !force) {
      const cached = processRuntimeBlockCache.get(cacheKey);
      if (cached && Date.now() - cached.savedAt < PROCESS_RUNTIME_BLOCK_CACHE_TTL_MS) {
        setTemplateStages(cached.templateStages);
        setRuntime(cached.runtime);
        setLinkedDraftStages(cached.linkedDraftStages || []);
        setHasLoadedRuntime(true);
        setLoading(false);
        return;
      }
    }
    const cachedAtStart = processRuntimeBlockCache.get(cacheKey);
    const cacheFreshAtStart = Boolean(cachedAtStart && Date.now() - cachedAtStart.savedAt < PROCESS_RUNTIME_BLOCK_CACHE_TTL_MS);
    setErrorText(draftLoadErrorText);
    setLoading((current) => current || force || readOnlyVariant || !cacheFreshAtStart);
    try {
      if (isProcessTemplateModule(normalizedModuleId)) {
        const stages = await loadProcessTemplateStages(supabase, normalizedRecordId);
        if (requestId !== refreshRequestIdRef.current) return;
        setTemplateStages(stages);
        processRuntimeBlockCache.set(cacheKey, {
          runtime: runtimeRef.current,
          templateStages: stages,
          linkedDraftStages: linkedDraftStagesRef.current,
          savedAt: Date.now(),
        });
        return;
      }

      if (isProcessRunModule(normalizedModuleId)) {
        const stages = await fetchRunStages(normalizedRecordId, force ? { force: true } : undefined);
        const runs = [recordDataRef.current].filter(Boolean);
        const tasks = await fetchProcessRuntimeTasksForRecord(
          supabase,
          normalizedModuleId,
          normalizedRecordId,
          { runs, stages },
          { force },
        );
        const nextRuntime = {
          runs,
          stages,
          tasks,
        };
        if (requestId !== refreshRequestIdRef.current) return;
        setRuntime(nextRuntime);
        publishRuntimeSnapshot(nextRuntime);
        processRuntimeBlockCache.set(cacheKey, {
          runtime: nextRuntime,
          templateStages: templateStagesRef.current,
          linkedDraftStages: linkedDraftStagesRef.current,
          savedAt: Date.now(),
        });
        return;
      }

      const snapshot = await fetchProcessRuntimeBatchForRecord(
        supabase,
        normalizedModuleId,
        normalizedRecordId,
        {
          force,
          // نمای ستونی فقط وضعیت و نام مرحله‌ها را نشان می‌دهد؛ داده کامل
          // فعالیت‌ها و پیش‌نویس‌ها همچنان فقط در نمای کامل دریافت می‌شود.
          mode: variant === 'column' ? 'summary' : 'full',
        },
      );
      const snapshotStages = snapshot.isSummary
        ? (snapshot.stages || [])
        : await filterDeletedProcessRunStageMarks(
          supabase,
          snapshot.stages || [],
          force ? { force: true } : undefined,
        );
      const tasks = variant === 'column'
        ? []
        : await fetchProcessRuntimeTasksForRecord(
          supabase,
          normalizedModuleId,
          normalizedRecordId,
          { runs: snapshot.runs || [], stages: snapshotStages },
          { force },
        );
      const directDrafts = Array.isArray(directDraftStagesRef.current) ? directDraftStagesRef.current : [];
      const shouldLoadLinkedDrafts = (
        loadLegacyLinkedDrafts
        && variant === 'full'
        && (snapshot.runs || []).length === 0
        && snapshotStages.length === 0
        && directDrafts.length === 0
      );
      const nextLinkedDraftStages = shouldLoadLinkedDrafts
        ? await fetchLinkedProcessDraftStagesForRecord(supabase, normalizedModuleId, normalizedRecordId, {
          excludeModuleId: normalizedModuleId,
          excludeRecordId: normalizedRecordId,
          allowGlobalScan: true,
        }).catch(() => [])
        : [];
      const nextRuntime = { runs: snapshot.runs || [], stages: snapshotStages, tasks };
      if (requestId !== refreshRequestIdRef.current) return;
      setRuntime(nextRuntime);
      setLinkedDraftStages(nextLinkedDraftStages);
      publishRuntimeSnapshot(nextRuntime);
      processRuntimeBlockCache.set(cacheKey, {
        runtime: nextRuntime,
        templateStages: templateStagesRef.current,
        linkedDraftStages: nextLinkedDraftStages,
        savedAt: Date.now(),
      });
    } catch (error: any) {
      if (requestId !== refreshRequestIdRef.current) return;
      setErrorText(normalizeText(error?.message || error?.details) || 'خواندن نسخه جدید فرآیند ناموفق بود.');
    } finally {
      if (requestId !== refreshRequestIdRef.current) return;
      setHasLoadedRuntime(true);
      setLoading(false);
    }
  }, [cacheKey, draftLoadErrorText, enabled, loadLegacyLinkedDrafts, normalizedModuleId, normalizedRecordId, publishRuntimeSnapshot, readOnlyVariant, variant]);

  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const scheduleRefresh = useCallback(() => {
    clearAppRuntimeCache(`process-runtime:full:${normalizedModuleId}:${normalizedRecordId}`);
    clearAppRuntimeCache(`process-runtime:summary:${normalizedModuleId}:${normalizedRecordId}`);
    clearAppRuntimeCache(`process-runtime-tasks:${normalizedModuleId}:${normalizedRecordId}`);
    processRuntimeBlockCache.delete(cacheKey);
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      void refreshRef.current(true);
    }, 220);
  }, [cacheKey]);

  const commitRuntimeRealtimePatch = useCallback((updater: (current: RuntimeState) => RuntimeState) => {
    clearAppRuntimeCache(`process-runtime-tasks:${normalizedModuleId}:${normalizedRecordId}`);
    processRuntimeBlockCache.delete(cacheKey);
    setRuntime((current) => {
      const next = updater(current);
      runtimeRef.current = next;
      publishRuntimeSnapshot(next);
      return next;
    });
  }, [cacheKey, publishRuntimeSnapshot]);

  const applyTaskRealtimePayload = useCallback((payload: any) => {
    const eventType = normalizeText(payload?.eventType || payload?.event_type).toUpperCase();
    const row = payload?.new || payload?.old || {};
    const taskId = normalizeDbUuid(row?.id);
    if (!taskId) return false;

    let matched = false;
    commitRuntimeRealtimePatch((current) => {
      const tasks = Array.isArray(current.tasks) ? current.tasks : [];
      const existingIndex = tasks.findIndex((task: any) => normalizeDbUuid(task?.id) === taskId);
      matched = existingIndex >= 0;

      const relatedRunIds = new Set((current.runs || []).map((run: any) => normalizeText(run?.id)).filter(Boolean));
      const relatedStageIds = new Set((current.stages || []).flatMap((stage: any) => [
        normalizeText(stage?.id),
        normalizeText(stage?.process_run_stage_id),
      ]).filter(Boolean));
      const sourceLink = resolveTaskSourceLink(row);
      const belongsToCurrentRecord = normalizeText(sourceLink.moduleId) === normalizedModuleId
        && normalizeText(sourceLink.recordId) === normalizedRecordId;
      const belongsToRuntime = relatedRunIds.has(normalizeText(row?.process_run_id))
        || relatedStageIds.has(normalizeText(row?.process_run_stage_id));

      if (!matched && !belongsToCurrentRecord && !belongsToRuntime) return current;
      matched = true;

      const nextTasks = eventType === 'DELETE'
        ? tasks.filter((task: any) => normalizeDbUuid(task?.id) !== taskId)
        : existingIndex >= 0
          ? tasks.map((task: any, index: number) => (
              index === existingIndex
                ? {
                    ...task,
                    ...row,
                    recurrence_info: {
                      ...parseObject(task?.recurrence_info),
                      ...parseObject(row?.recurrence_info),
                    },
                    metadata: {
                      ...parseObject(task?.metadata),
                      ...parseObject(row?.metadata),
                    },
                  }
                : task
            ))
          : [...tasks, row];
      return { ...current, tasks: nextTasks };
    });
    return matched;
  }, [commitRuntimeRealtimePatch, normalizedModuleId, normalizedRecordId]);

  const applyRunStageRealtimePayload = useCallback((payload: any) => {
    const eventType = normalizeText(payload?.eventType || payload?.event_type).toUpperCase();
    const row = payload?.new || payload?.old || {};
    const stageId = normalizeDbUuid(row?.id || row?.process_run_stage_id);
    if (!stageId) return false;

    let matched = false;
    commitRuntimeRealtimePatch((current) => {
      const stages = Array.isArray(current.stages) ? current.stages : [];
      const relatedRunIds = new Set((current.runs || []).map((run: any) => normalizeText(run?.id)).filter(Boolean));
      const belongsToRuntime = relatedRunIds.has(normalizeText(row?.process_run_id));
      const existingIndex = stages.findIndex((stage: any) => (
        normalizeDbUuid(stage?.id) === stageId
        || normalizeDbUuid(stage?.process_run_stage_id) === stageId
      ));
      matched = existingIndex >= 0 || belongsToRuntime;
      if (!matched) return current;

      const nextStages = eventType === 'DELETE'
        ? stages.filter((stage: any) => normalizeDbUuid(stage?.id) !== stageId && normalizeDbUuid(stage?.process_run_stage_id) !== stageId)
        : existingIndex >= 0
          ? stages.map((stage: any, index: number) => (
              index === existingIndex
                ? {
                    ...stage,
                    ...row,
                    metadata: {
                      ...parseObject(stage?.metadata),
                      ...parseObject(row?.metadata),
                    },
                  }
                : stage
            ))
          : [...stages, row];
      return { ...current, stages: nextStages };
    });
    return matched;
  }, [commitRuntimeRealtimePatch]);

  const applyTemplateStageRealtimePayload = useCallback((payload: any) => {
    const eventType = normalizeText(payload?.eventType || payload?.event_type).toUpperCase();
    const row = payload?.new || payload?.old || {};
    const stageId = normalizeDbUuid(row?.id);
    if (!stageId) return false;
    let matched = false;
    setTemplateStages((current) => {
      const stages = Array.isArray(current) ? current : [];
      const existingIndex = stages.findIndex((stage: any) => normalizeDbUuid(stage?.id || stage?.template_stage_id) === stageId);
      matched = existingIndex >= 0 || eventType !== 'DELETE';
      if (!matched) return current;
      const nextStages = eventType === 'DELETE'
        ? stages.filter((stage: any) => normalizeDbUuid(stage?.id || stage?.template_stage_id) !== stageId)
        : existingIndex >= 0
          ? stages.map((stage: any, index: number) => (
              index === existingIndex
                ? {
                    ...stage,
                    ...parseObject(stage?.metadata),
                    ...parseObject(row?.metadata),
                    ...row,
                    name: row?.stage_name || row?.name || stage?.name,
                    template_stage_id: row?.id || stage?.template_stage_id,
                    metadata: {
                      ...parseObject(stage?.metadata),
                      ...parseObject(row?.metadata),
                    },
                  }
                : stage
            ))
          : [...stages, {
              ...parseObject(row?.metadata),
              ...row,
              name: row?.stage_name || row?.name || 'مرحله',
              template_stage_id: row?.id,
            }];
      templateStagesRef.current = nextStages;
      processRuntimeBlockCache.delete(cacheKey);
      return nextStages;
    });
    return matched;
  }, [cacheKey]);

  const applyParentDraftRealtimePayload = useCallback((payload: any) => {
    const row = payload?.new || {};
    const normalizedFieldKey = normalizeText(fieldKey);
    if (!normalizedFieldKey || !row || !Object.prototype.hasOwnProperty.call(row, normalizedFieldKey)) return false;
    const nextStages = Array.isArray(row?.[normalizedFieldKey]) ? row[normalizedFieldKey] : [];
    setDraftStagesOverride(nextStages);
    directDraftStagesRef.current = nextStages;
    processRuntimeBlockCache.delete(cacheKey);
    return true;
  }, [cacheKey, fieldKey]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    return subscribeToLocalModuleListInvalidation({
      orgId: orgId || recordData?.org_id || null,
      moduleId: 'tasks',
      onInvalidate: (payload) => {
        const taskId = normalizeDbUuid(payload?.record_id);
        if (taskId) {
          const belongsToCurrentRuntime = (runtimeRef.current.tasks || []).some((task: any) => normalizeDbUuid(task?.id) === taskId);
          if (!belongsToCurrentRuntime) return;
        }
        const taskPatch = payload?.record_patch && typeof payload.record_patch === 'object'
          ? { ...payload.record_patch, id: taskId || payload.record_patch.id }
          : null;
        if (taskId && taskPatch) {
          applyTaskRealtimePayload({ eventType: 'UPDATE', new: taskPatch });
          return;
        }
        scheduleRefresh();
      },
    });
  }, [applyTaskRealtimePayload, enabled, orgId, recordData?.org_id, scheduleRefresh]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    const handleRuntimePatch = (event: Event) => {
      const detail = (event as CustomEvent<TaskRuntimeUpdatedPayload>)?.detail;
      const task = detail?.task;
      const taskId = normalizeDbUuid(task?.id);
      if (!taskId) return;
      const belongsToCurrentRuntime = (runtimeRef.current.tasks || []).some((item: any) => normalizeDbUuid(item?.id) === taskId);
      if (!belongsToCurrentRuntime) return;
      applyTaskRealtimePayload({ eventType: 'UPDATE', new: task });
    };
    window.addEventListener(TASK_RUNTIME_UPDATED_EVENT, handleRuntimePatch as EventListener);
    return () => window.removeEventListener(TASK_RUNTIME_UPDATED_EVENT, handleRuntimePatch as EventListener);
  }, [applyTaskRealtimePayload, enabled]);

  useEffect(() => {
    if (!enabled) return;
    void loadDirectoryAndTemplates().catch((error) => {
      console.warn('Could not load process runtime reference data', error);
    });
  }, [enabled, loadDirectoryAndTemplates]);

  useEffect(() => {
    if (!shouldLoadProcessRuntime({
      enabled,
      moduleId: normalizedModuleId,
      recordId: normalizedRecordId,
      variant,
      snapshotOnly,
    })) return;
    const initialRefreshKey = `${cacheKey}:${variant}:${snapshotOnly ? 'snapshot' : 'live'}`;
    if (initialRefreshKeyRef.current === initialRefreshKey) return;
    initialRefreshKeyRef.current = initialRefreshKey;
    // نمای کامل همیشه منبع اصلی را می‌خواند؛ snapshot فقط برای جلوگیری از پرش بصری است.
    void refresh(variant === 'full');
  }, [cacheKey, enabled, normalizedModuleId, normalizedRecordId, refresh, snapshotOnly, variant]);

  useEffect(() => {
    if (!enabled || !liveRuntimeEnabled || !orgId || !normalizedModuleId || !normalizedRecordId) return undefined;
    const channel = supabase.channel(`process-v2-runtime-${normalizedModuleId}-${normalizedRecordId}`);

    if (isProcessTemplateModule(normalizedModuleId)) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'process_template_stages', filter: `template_id=eq.${normalizedRecordId}` },
        (payload: any) => {
          applyTemplateStageRealtimePayload(payload);
          scheduleRefresh();
        },
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
          if (runId === normalizedRecordId) {
            applyRunStageRealtimePayload(payload);
            scheduleRefresh();
          }
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
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `org_id=eq.${orgId}` },
        (payload: any) => {
          const row = payload?.new || payload?.old || {};
          if (normalizeText(row?.process_run_id) === normalizedRecordId) {
            applyTaskRealtimePayload(payload);
            scheduleRefresh();
            return;
          }
          const currentRuntime = runtimeRef.current;
          const relatedStageIds = new Set((currentRuntime.stages || []).flatMap((stage: any) => [
            normalizeText(stage?.id),
            normalizeText(stage?.process_run_stage_id),
          ]).filter(Boolean));
          if (relatedStageIds.has(normalizeText(row?.process_run_stage_id))) {
            applyTaskRealtimePayload(payload);
            scheduleRefresh();
          }
        },
      );
    } else {
      channel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: normalizedModuleId, filter: `id=eq.${normalizedRecordId}` },
        (payload: any) => {
          if (applyParentDraftRealtimePayload(payload)) scheduleRefresh();
        },
      );
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
          if (runId && relatedRunIds.has(runId)) {
            applyRunStageRealtimePayload(payload);
            scheduleRefresh();
          }
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
            applyTaskRealtimePayload(payload);
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
            applyTaskRealtimePayload(payload);
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
  }, [applyParentDraftRealtimePayload, applyRunStageRealtimePayload, applyTaskRealtimePayload, applyTemplateStageRealtimePayload, enabled, liveRuntimeEnabled, normalizedModuleId, normalizedRecordId, orgId, scheduleRefresh]);

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
      ...[
        ...effectiveDraftStages,
        ...(runtime.stages || []),
        ...(runtime.tasks || []),
      ].flatMap((stage) => collectStageTemplateSourceTexts(stage)),
      ...(runtime.runs || []).flatMap((run) => collectRunTemplateSourceTexts(run)),
    ]
      .filter((value) => hasTemplateTokens(value))
      .concat([
        ...effectiveDraftStages,
        ...(runtime.stages || []),
        ...(runtime.tasks || []),
      ].map((stage) => collectStageAssigneeFieldReference(stage)).filter(Boolean))
      .join('|')
  ), [effectiveDraftStages, runtime.runs, runtime.stages, runtime.tasks]);
  const waitingForTemplateContext = Boolean(
    templateTokenKey
    && (templateContextResolving || templateContextResolvedKey !== templateTokenKey)
  );

  useEffect(() => {
    if (!enabled || !normalizedModuleId || !normalizedRecordId || isProcessTemplateModule(normalizedModuleId)) return undefined;
    const tokenSources = [
      ...effectiveDraftStages,
      ...(runtime.stages || []),
      ...(runtime.tasks || []),
    ];
    const templateTextSources = [
      ...tokenSources.flatMap((stage) => collectStageTemplateSourceTexts(stage)),
      ...(runtime.runs || []).flatMap((run) => collectRunTemplateSourceTexts(run)),
    ];
    const tokenKey = tokenSources
      .flatMap((stage) => [
        ...collectStageTemplateSourceTexts(stage).filter((value) => hasTemplateTokens(value)),
        collectStageAssigneeFieldReference(stage),
      ])
      .concat((runtime.runs || []).flatMap((run) => collectRunTemplateSourceTexts(run)).filter((value) => hasTemplateTokens(value)))
      .filter(Boolean)
      .join('|');
    if (
      !templateTextSources.some((value) => hasTemplateTokens(value))
      && !tokenSources.some((stage) => Boolean(collectStageAssigneeFieldReference(stage)))
    ) {
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
    const timeoutId = window.setTimeout(() => {
      if (!disposed) {
        setTemplateContextResolving(false);
        setTemplateContextResolvedKey(tokenKey);
      }
    }, 5000);

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
        window.clearTimeout(timeoutId);
        if (!disposed) setTemplateContextResolving(false);
      });

    return () => {
      disposed = true;
      window.clearTimeout(timeoutId);
    };
  }, [effectiveDraftStages, enabled, normalizedModuleId, normalizedRecordId, recordData, runtime.runs, runtime.stages, runtime.tasks]);

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
    const stageTaskId = getRuntimeStageTaskId(stage);
    const stageRunStageId = normalizeDbUuid(stage?.process_run_stage_id || stage?.id);
    const stageRunId = getRuntimeStageRunId(stage);
    const stageNodeKey = getRuntimeStageNodeKey(stage);
    const stageSortOrder = Number(stage?.sort_order || parseObject(stage?.metadata)?.sort_order || 0);
    const stageName = normalizeText(stage?.stage_name || stage?.name).toLowerCase();
    const task = (runtime.tasks || []).find((item: any) => (
      (stageTaskId && normalizeDbUuid(item?.id) === stageTaskId)
      || (stageRunStageId && normalizeDbUuid(item?.process_run_stage_id) === stageRunStageId)
    )) || (runtime.tasks || []).find((item: any) => {
      const recurrence = parseObject(item?.recurrence_info);
      const taskRunId = normalizeDbUuid(item?.process_run_id || recurrence?.process_run_id);
      if (stageRunId && taskRunId && stageRunId !== taskRunId) return false;
      const taskNodeKey = getTaskRuntimeNodeKey(item);
      if (stageNodeKey && taskNodeKey && stageNodeKey === taskNodeKey) return true;
      const taskSortOrder = Number(item?.source_stage_sort_order || recurrence?.source_stage_sort_order || 0);
      if (!stageSortOrder || !taskSortOrder || stageSortOrder !== taskSortOrder) return false;
      const taskName = normalizeText(item?.name).toLowerCase();
      return !stageName || !taskName || stageName === taskName;
    });
    if (!task) return stage;
    return {
      ...stage,
      ...task,
      id: task.id || stage.id,
      process_run_stage_id: stageRunStageId || normalizeDbUuid(task.process_run_stage_id),
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
    if (isProcessTemplateModule(normalizedModuleId)) {
      if (readOnlyVariant && templateStages.length === 0 && !hasLoadedRuntime) return [];
      const card = buildTemplateCard(recordData || { id: normalizedRecordId }, templateStages, directory, templateContext, false);
      return card ? [card] : [];
    }
    if (!hasLoadedRuntime) return [];

    const runRows = (isProcessRunModule(normalizedModuleId)
      ? [recordData].filter(Boolean)
      : (runtime.runs || []))
      .slice()
      .sort((left: any, right: any) => (
        new Date(right?.created_at || right?.started_at || right?.updated_at || 0).getTime()
        - new Date(left?.created_at || left?.started_at || left?.updated_at || 0).getTime()
      ));
    const stageRows = runtime.stages || [];
    const runtimeTasks = runtime.tasks || [];
    const runCards = runRows
      .map((run: any) => {
        const runId = normalizeText(run?.id);
        const taskStages = runtimeTasks
          .filter((task: any) => normalizeText(task?.process_run_id || parseObject(task?.recurrence_info)?.process_run_id) === runId)
          .map(mapRuntimeTaskToStage);
        const runStages = [
          ...stageRows
          .filter((stage: any) => normalizeText(stage?.process_run_id) === runId)
            .map(mergeRuntimeStageWithTask),
          ...taskStages.filter((taskStage: any) => !stageRows.some((stage: any) => (
            normalizeDbUuid(stage?.id || stage?.process_run_stage_id) === normalizeDbUuid(taskStage?.process_run_stage_id || taskStage?.id)
            || (getRuntimeStageNodeKey(stage) && getRuntimeStageNodeKey(stage) === getRuntimeStageNodeKey(taskStage))
          ))),
        ];
        return buildRunCard(run, runStages, directory, fallbackRecordLabel, templateNameById, templateContext);
      })
      .filter((item): item is ProcessV2CardData => Boolean(item));
    const taskBackedRunCards = buildTaskBackedRunCards(runtimeTasks, runRows, directory, fallbackRecordLabel, templateNameById, templateContext);
    if (isProcessRunModule(normalizedModuleId)) return [...runCards, ...taskBackedRunCards];
    return [
      ...runCards,
      ...taskBackedRunCards,
      ...buildDraftProcessCards(effectiveDraftStages, directory, templateNameById, runtime.runs, runtimeTasks, templateContext, normalizedModuleId),
    ];
  }, [directory, effectiveDraftStages, enabled, fallbackRecordLabel, hasLoadedRuntime, mergeRuntimeStageWithTask, normalizedModuleId, normalizedRecordId, readOnlyVariant, recordData, runtime.runs, runtime.stages, runtime.tasks, templateContext, templateNameById, templateStages, waitingForTemplateContext]);

  const cardKey = useCallback((card: ProcessV2CardData) => `${card.mode}:${card.id}`, []);

  const allDisplayCards = useMemo(
    () => [...extraCards, ...cards]
      .map((card) => cardOverrides[cardKey(card)] || card)
      .filter((card) => !hiddenCardIds.has(cardKey(card)))
      .map((card, index) => ({ card, index }))
      .sort((left, right) => (
        getProcessCardCreatedAt(right.card) - getProcessCardCreatedAt(left.card)
        || left.index - right.index
      ))
      .map(({ card }) => card),
    [cardKey, cardOverrides, cards, extraCards, hiddenCardIds],
  );
  const completedCards = useMemo(
    () => allDisplayCards.filter(isCompletedProcessCard),
    [allDisplayCards],
  );
  const displayCards = useMemo(
    () => showCompletedProcesses
      ? allDisplayCards
      : allDisplayCards.filter((card) => !isCompletedProcessCard(card)),
    [allDisplayCards, showCompletedProcesses],
  );

  useEffect(() => {
    if (displayCards.length === 0) return;
    const explicitKey = pendingScrollCardKeyRef.current;
    const targetKey = explicitKey || (pendingScrollToFirstCardRef.current ? cardKey(displayCards[0]) : '');
    if (!targetKey) return;
    const node = cardElementRefs.current.get(targetKey);
    if (!node) return;
    pendingScrollCardKeyRef.current = null;
    pendingScrollToFirstCardRef.current = false;
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [cardKey, displayCards]);

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

  const markRuntimeModuleListsChanged = useCallback((options?: {
    taskId?: string | null;
    processRunId?: string | null;
    templateId?: string | null;
    taskPatch?: Record<string, any> | null;
    skipParent?: boolean;
  }) => {
    const updatedAt = new Date().toISOString();
    if (!options?.skipParent && normalizedModuleId && normalizedRecordId) {
      markModuleListChanged({
        org_id: orgId || recordData?.org_id || null,
        module_id: normalizedModuleId,
        record_id: normalizedRecordId,
        action: 'update',
        updated_at: updatedAt,
      });
    }
    const taskId = normalizeText(options?.taskId);
    if (taskId) {
      markModuleListChanged({
        org_id: orgId || recordData?.org_id || null,
        module_id: 'tasks',
        record_id: taskId,
        action: 'update',
        updated_at: updatedAt,
        record_patch: options?.taskPatch || null,
      });
    }
    const processRunId = normalizeText(options?.processRunId);
    if (processRunId) {
      markModuleListChanged({
        org_id: orgId || recordData?.org_id || null,
        module_id: 'process_runs',
        record_id: processRunId,
        action: 'update',
        updated_at: updatedAt,
      });
    }
    const templateId = normalizeText(options?.templateId);
    if (templateId) {
      markModuleListChanged({
        org_id: orgId || recordData?.org_id || null,
        module_id: 'process_templates',
        record_id: templateId,
        action: 'update',
        updated_at: updatedAt,
      });
    }
  }, [normalizedModuleId, normalizedRecordId, orgId, recordData?.org_id]);

  const handleStageStatusChange = useCallback((process: ProcessV2CardData, stageId: string, status: string, sourcePatch?: Record<string, any>) => {
    clearAppRuntimeCache(`process-runtime-tasks:${normalizedModuleId}:${normalizedRecordId}`);
    processRuntimeBlockCache.delete(cacheKey);
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
      const patchStage = (stage: ProcessV2Stage): ProcessV2Stage => {
        const mergedSource = {
          ...((stage.source && typeof stage.source === 'object') ? stage.source : {}),
          ...(sourcePatch || {}),
          status,
        };
        const resolvedAssignee = resolveAssignee(mergedSource, directory, normalizedModuleId);
        return {
          ...stage,
          title: normalizeText(sourcePatch?.name || sourcePatch?.stage_name) || stage.title,
          assigneeLabel: normalizeText(sourcePatch?.assignee_label) || resolvedAssignee.label || stage.assigneeLabel,
          assigneeAvatarUrl: resolvedAssignee.avatarUrl,
          activityTypeLabel: normalizeText(sourcePatch?.task_type) || stage.activityTypeLabel,
          dueLabel: normalizeText(sourcePatch?.dueLabel || sourcePatch?.due_label) || stage.dueLabel,
          status: displayStatus,
          kind: stageStatus === 'draft' ? 'draft' : 'activity',
          source: mergedSource,
        };
      };
      return {
        ...current,
        [key]: {
          ...base,
          lanes: base.lanes.map((lane) => ({
            ...lane,
            stages: lane.stages.map((stage) => (
              processV2StageMatches(stage, matchIds)
                ? patchStage(stage)
                : stage
            )),
          })),
        } as ProcessV2CardData,
      };
    });
    markRuntimeModuleListsChanged({
      taskId: sourcePatch?.task_id || sourcePatch?.process_task_id || sourcePatch?.id,
      processRunId: sourcePatch?.process_run_id,
      templateId: sourcePatch?.source_template_id,
      taskPatch: {
        ...(sourcePatch || {}),
        status,
      },
      skipParent: true,
    });
    void syncProjectStatusForRuntime(runtimeRef.current).catch((error) => {
      console.warn('Could not sync project status after process v2 stage status change', error);
    });
  }, [cacheKey, cardKey, directory, markRuntimeModuleListsChanged, normalizedModuleId, normalizedRecordId, syncProjectStatusForRuntime]);

  const persistDraftStageList = useCallback(async (nextStages: any[]) => {
    const normalizedStages = Array.isArray(nextStages) ? nextStages : [];
    const previousStages = Array.isArray(directDraftStagesRef.current) ? directDraftStagesRef.current : [];
    setDraftStagesOverride(normalizedStages);
    processRuntimeBlockCache.delete(cacheKey);

    if (onDraftStagesChange) {
      try {
        await onDraftStagesChange(normalizedStages);
      } catch (error) {
        setDraftStagesOverride(previousStages);
        throw error;
      }
      markRuntimeModuleListsChanged();
      void syncProjectStatusForRuntime(runtimeRef.current, normalizedStages);
      return;
    }

    const normalizedFieldKey = normalizeText(fieldKey);
    if (!normalizedModuleId || !normalizedRecordId || !normalizedFieldKey) return;
    if (isProcessTemplateModule(normalizedModuleId) || isProcessRunModule(normalizedModuleId)) return;

    try {
      await persistProcessDraftField({
        supabaseClient: supabase,
        moduleId: normalizedModuleId,
        recordId: normalizedRecordId,
        fieldKey: normalizedFieldKey,
        stages: normalizedStages,
      });
    } catch (error) {
      setDraftStagesOverride(previousStages);
      throw error;
    }
    markRuntimeModuleListsChanged();
    void syncProjectStatusForRuntime(runtimeRef.current, normalizedStages);
  }, [cacheKey, fieldKey, markRuntimeModuleListsChanged, normalizedModuleId, normalizedRecordId, onDraftStagesChange, syncProjectStatusForRuntime]);

  const persistCardStagePositions = useCallback(async (card: ProcessV2CardData) => {
    const positionEntries = collectV2CardStagePositions(card);
    if (positionEntries.length === 0) return;

    const changedEntries = positionEntries.filter(({ stage, laneKey, sortOrder }) => (
      getV2StageSourceLaneKey(stage) !== laneKey
      || Number(getV2StageSourceSortOrder(stage) || 0) !== Number(sortOrder)
    ));
    if (changedEntries.length === 0) return;

    clearAppRuntimeCache(`process-runtime-tasks:${normalizedModuleId}:${normalizedRecordId}`);
    processRuntimeBlockCache.delete(cacheKey);

    const draftPositions = changedEntries
      .filter(({ stage }) => stage.kind === 'draft' || !getV2StageTaskId(stage))
      .map((entry) => ({ ...entry, wantedIds: new Set(collectV2StageAutoAssignIds(entry.stage)) }));

    const directStages = Array.isArray(directDraftStagesRef.current) ? directDraftStagesRef.current : [];
    let directChanged = false;
    const nextDirectStages = directStages.map((candidate, index) => {
      const match = draftPositions.find((entry) => (
        rawStageMatchesV2StageIdsWithinInstance(candidate, entry.stage, entry.wantedIds, index)
      ));
      if (!match) return candidate;
      directChanged = true;
      const metadata = parseObject(candidate?.metadata);
      return {
        ...candidate,
        sort_order: match.sortOrder,
        [PROCESS_LANE_KEY]: match.laneKey,
        metadata: {
          ...metadata,
          [PROCESS_LANE_KEY]: match.laneKey,
          sort_order: match.sortOrder,
        },
      };
    });
    if (directChanged) {
      await persistDraftStageList(nextDirectStages);
    }

    const linkedStages = Array.isArray(linkedDraftStagesRef.current) ? linkedDraftStagesRef.current : [];
    const linkedUpdates = new Map<string, {
      ownerModuleId: string;
      ownerRecordId: string;
      ownerFieldKey: string;
      entries: typeof draftPositions;
    }>();
    linkedStages.forEach((candidate, index) => {
      const match = draftPositions.find((entry) => (
        rawStageMatchesV2StageIdsWithinInstance(candidate, entry.stage, entry.wantedIds, index)
      ));
      if (!match) return;
      const ownerModuleId = normalizeText(candidate?.__process_v2_linked_owner_module_id);
      const ownerRecordId = normalizeDbUuid(candidate?.__process_v2_linked_owner_record_id);
      const ownerFieldKey = normalizeText(candidate?.__process_v2_linked_owner_field_key);
      if (!ownerModuleId || !ownerRecordId || !ownerFieldKey) return;
      const ownerKey = `${ownerModuleId}:${ownerRecordId}:${ownerFieldKey}`;
      const existing = linkedUpdates.get(ownerKey) || {
        ownerModuleId,
        ownerRecordId,
        ownerFieldKey,
        entries: [],
      };
      existing.entries.push(match);
      linkedUpdates.set(ownerKey, existing);
    });

    for (const owner of linkedUpdates.values()) {
      const { data, error } = await (supabase.from(owner.ownerModuleId as any) as any)
        .select(owner.ownerFieldKey)
        .eq('id', owner.ownerRecordId)
        .maybeSingle();
      if (error) throw error;
      const ownerStages = Array.isArray(data?.[owner.ownerFieldKey]) ? data[owner.ownerFieldKey] : [];
      let ownerChanged = false;
      const nextOwnerStages = ownerStages.map((candidate: any, index: number) => {
        const match = owner.entries.find((entry) => (
          rawStageMatchesV2StageIdsWithinInstance(candidate, entry.stage, entry.wantedIds, index)
        ));
        if (!match) return candidate;
        ownerChanged = true;
        const metadata = parseObject(candidate?.metadata);
        return {
          ...candidate,
          sort_order: match.sortOrder,
          [PROCESS_LANE_KEY]: match.laneKey,
          metadata: {
            ...metadata,
            [PROCESS_LANE_KEY]: match.laneKey,
            sort_order: match.sortOrder,
          },
        };
      });
      if (!ownerChanged) continue;
      const { error: updateError } = await (supabase.from(owner.ownerModuleId as any) as any)
        .update({ [owner.ownerFieldKey]: nextOwnerStages })
        .eq('id', owner.ownerRecordId);
      if (updateError) throw updateError;
      markModuleListChanged({
        org_id: orgId || recordDataRef.current?.org_id || null,
        module_id: owner.ownerModuleId,
        record_id: owner.ownerRecordId,
        action: 'update',
        updated_at: new Date().toISOString(),
      });
    }

    const runtimePositionUpdates = changedEntries.map(({ stage, laneKey, sortOrder }) => ({
      taskId: getV2StageTaskId(stage),
      runStageId: getV2StageRunStageId(stage),
      laneKey,
      sortOrder,
      recurrenceInfo: parseObject((stage.source && typeof stage.source === 'object' ? stage.source : {})?.recurrence_info),
    }));

    await Promise.all(runtimePositionUpdates.map(async (entry) => {
      if (entry.runStageId) {
        await moveProcessRunStagePositionSafely(entry.runStageId, entry.laneKey, entry.sortOrder);
      }
      if (entry.taskId) {
        await updateTaskProcessPositionSafely(entry.taskId, entry.laneKey, entry.sortOrder, entry.recurrenceInfo);
      }
    }));

    setRuntime((current) => {
      const next = {
        runs: current.runs,
        stages: current.stages.map((stageRow: any) => {
          const match = runtimePositionUpdates.find((entry) => entry.runStageId && normalizeDbUuid(stageRow?.id || stageRow?.process_run_stage_id) === entry.runStageId);
          if (!match) return stageRow;
          const metadata = parseObject(stageRow?.metadata);
          return {
            ...stageRow,
            sort_order: match.sortOrder,
            [PROCESS_LANE_KEY]: match.laneKey,
            metadata: {
              ...metadata,
              [PROCESS_LANE_KEY]: match.laneKey,
              sort_order: match.sortOrder,
            },
          };
        }),
        tasks: current.tasks.map((task: any) => {
          const match = runtimePositionUpdates.find((entry) => entry.taskId && normalizeDbUuid(task?.id) === entry.taskId);
          if (!match) return task;
          const recurrence = parseObject(task?.recurrence_info);
          return {
            ...task,
            sort_order: match.sortOrder,
            source_stage_sort_order: match.sortOrder,
            [PROCESS_LANE_KEY]: match.laneKey,
            recurrence_info: {
              ...recurrence,
              [PROCESS_LANE_KEY]: match.laneKey,
              source_stage_sort_order: match.sortOrder,
            },
          };
        }),
      };
      runtimeRef.current = next;
      return next;
    });

    setLinkedDraftStages((current) => current.map((candidate, index) => {
      const match = draftPositions.find((entry) => (
        rawStageMatchesV2StageIdsWithinInstance(candidate, entry.stage, entry.wantedIds, index)
      ));
      if (!match) return candidate;
      const metadata = parseObject(candidate?.metadata);
      return {
        ...candidate,
        sort_order: match.sortOrder,
        [PROCESS_LANE_KEY]: match.laneKey,
        metadata: {
          ...metadata,
          [PROCESS_LANE_KEY]: match.laneKey,
          sort_order: match.sortOrder,
        },
      };
    }));

    markRuntimeModuleListsChanged({
      processRunId: card.mode === 'run' && !normalizeText(card.id).startsWith('draft:') ? card.id : undefined,
      templateId: card.mode === 'run' ? card.templateId : undefined,
    });
  }, [cacheKey, markRuntimeModuleListsChanged, orgId, persistDraftStageList]);

  const persistTemplateCardLabels = useCallback(async (card: ProcessV2CardData) => {
    if (!isProcessTemplateModule(normalizedModuleId) || card.mode !== 'template') return;

    const nextProcessTitle = normalizeText(card.title);
    const currentProcessTitle = normalizeText(recordDataRef.current?.name);
    if (nextProcessTitle && nextProcessTitle !== currentProcessTitle) {
      const { error } = await (supabase.from('process_templates' as any) as any)
        .update({ name: nextProcessTitle })
        .eq('id', normalizedRecordId);
      if (error) throw error;
      recordDataRef.current = {
        ...(recordDataRef.current || {}),
        name: nextProcessTitle,
      };
      markRuntimeModuleListsChanged({ templateId: normalizedRecordId });
    }

    const sourceStages = Array.isArray(templateStagesRef.current) ? templateStagesRef.current : [];
    if (sourceStages.length === 0) return;
    const materialized = materializeLegacyProcessGraph(sourceStages);
    const laneTitleByKey = new Map(card.lanes.map((lane) => [normalizeText(lane.id), normalizeText(lane.title)] as const));
    let laneNamesChanged = false;
    const nextGraph = {
      ...materialized.graph,
      lanes: materialized.graph.lanes.map((lane) => {
        const nextTitle = laneTitleByKey.get(normalizeText(lane.key));
        if (nextTitle === undefined || nextTitle === normalizeText(lane.name)) return lane;
        laneNamesChanged = true;
        return { ...lane, name: nextTitle };
      }),
    };
    if (!laneNamesChanged) return;

    const nextStages = attachProcessGraphToStages(materialized.stages, nextGraph);
    templateStagesRef.current = nextStages;
    setTemplateStages(nextStages);
    await persistDraftStageList(nextStages);
  }, [markRuntimeModuleListsChanged, normalizedModuleId, normalizedRecordId, persistDraftStageList]);

  const handleCardChange = useCallback((next: ProcessV2CardData) => {
    const patchedNext = patchV2CardStageSourcePositions(next);
    setCardOverrides((current) => ({
      ...current,
      [cardKey(next)]: patchedNext,
    }));
    void persistCardStagePositions(next).catch((error: any) => {
      message.error(normalizeText(error?.message || error?.details) || 'ذخیره جایگاه مرحله فرآیند ناموفق بود');
    });
    void persistTemplateCardLabels(next).catch((error: any) => {
      message.error(normalizeText(error?.message || error?.details) || 'ذخیره نام فرآیند یا ردیف ناموفق بود');
    });
  }, [cardKey, message, persistCardStagePositions, persistTemplateCardLabels]);

  const handleDraftStageTransfer = useCallback(async (
    payload: { processId?: string; laneId: string; stageId: string },
    targetProcess: ProcessV2CardData,
    targetLaneId: string,
    targetSlot: number,
  ) => {
    const sourceProcess = allDisplayCards.find((card) => normalizeText(card.id) === normalizeText(payload.processId));
    const targetGroupId = normalizeText(targetProcess.id).replace(/^draft:/, '');
    if (!sourceProcess || !targetGroupId) {
      message.warning('انتقال بین اجرای واقعی فرآیند در این مرحله پشتیبانی نمی‌شود.');
      return;
    }
    const sourceLane = sourceProcess.lanes.find((lane) => lane.id === payload.laneId);
    const sourceStage = sourceLane?.stages.find((stage) => stage.id === payload.stageId);
    if (!sourceLane || !sourceStage || sourceStage.kind !== 'draft') {
      message.warning('فقط مرحله‌های پیش‌نویس قابل انتقال بین فرآیندها هستند.');
      return;
    }
    const sourceIndex = sourceLane.stages.findIndex((stage) => stage.id === sourceStage.id);
    const shiftedTargetStages = targetProcess.lanes
      .find((lane) => lane.id === targetLaneId)?.stages
      .map((stage) => ({ ...stage, layoutSlot: (stage.layoutSlot ?? 0) >= targetSlot ? (stage.layoutSlot ?? 0) + 1 : stage.layoutSlot })) || [];
    const movedSource = sourceStage.source && typeof sourceStage.source === 'object' ? sourceStage.source : {};
    const movedMetadata = parseObject(movedSource?.metadata);
    const movedStage: ProcessV2Stage = {
      ...sourceStage,
      layoutSlot: targetSlot,
      source: {
        ...movedSource,
        process_group_id: targetGroupId,
        process_lane_key: targetLaneId,
        metadata: { ...movedMetadata, process_group_id: targetGroupId, process_lane_key: targetLaneId },
      },
    };
    const nextSource: ProcessV2CardData = {
      ...sourceProcess,
      lanes: sourceProcess.lanes.map((lane) => lane.id === sourceLane.id
        ? { ...lane, stages: lane.stages.filter((stage) => stage.id !== sourceStage.id) }
        : lane),
    };
    const nextTarget: ProcessV2CardData = {
      ...targetProcess,
      lanes: targetProcess.lanes.map((lane) => lane.id === targetLaneId
        ? { ...lane, stages: [...shiftedTargetStages, movedStage] }
        : lane),
    };
    setCardOverrides((current) => ({
      ...current,
      [cardKey(sourceProcess)]: nextSource,
      [cardKey(targetProcess)]: nextTarget,
    }));
    const directStages = Array.isArray(directDraftStagesRef.current) ? directDraftStagesRef.current : [];
    const nextDraftStages = directStages.map((candidate, index) => {
      if (!rawDraftCandidateMatchesV2StagePoint(candidate, index, sourceStage, sourceIndex)) return candidate;
      const metadata = parseObject(candidate?.metadata);
      return {
        ...candidate,
        process_group_id: targetGroupId,
        process_lane_key: targetLaneId,
        sort_order: (targetSlot + 1) * 10,
        metadata: { ...metadata, process_group_id: targetGroupId, process_lane_key: targetLaneId, sort_order: (targetSlot + 1) * 10 },
      };
    });
    try {
      await persistDraftStageList(nextDraftStages);
      markRuntimeModuleListsChanged();
    } catch (error: any) {
      setCardOverrides((current) => {
        const next = { ...current };
        delete next[cardKey(sourceProcess)];
        delete next[cardKey(targetProcess)];
        return next;
      });
      message.error(normalizeText(error?.message || error?.details) || 'انتقال مرحله پیش‌نویس ناموفق بود');
    }
  }, [allDisplayCards, cardKey, markRuntimeModuleListsChanged, message, persistDraftStageList]);

  const resolveRawDraftStagesForV2Stages = useCallback((
    stages: ProcessV2Stage[],
    targetGroupId?: string | null,
  ) => {
    const sourceStages = Array.isArray(stages) ? stages.filter((stage) => stage.kind === 'draft') : [];
    if (sourceStages.length === 0) return [];
    const rawCandidates = Array.isArray(effectiveDraftStages) ? effectiveDraftStages : [];
    const normalizedTargetGroupId = normalizeText(targetGroupId);
    const resolved: any[] = [];
    const seen = new Set<string>();

    sourceStages.forEach((stage, stageIndex) => {
      const stageSource = stage.source && typeof stage.source === 'object' ? stage.source : stage;
      const localCopiedStage = normalizeText(stage.id).startsWith('stage_')
        && normalizeText(stage.title).includes('کپی')
        && normalizeText(stageSource?.id) !== normalizeText(stage.id);
      const effectiveStageSource = localCopiedStage
        ? {
            ...stageSource,
            id: stage.id,
            name: stage.title,
            stage_name: stage.title,
            template_stage_id: null,
            process_run_stage_id: null,
            run_stage_id: null,
            task_id: null,
            process_task_id: null,
            source_stage: undefined,
            __process_v2_has_real_task: false,
            process_node_key: stage.id,
            is_draft: true,
            status: 'draft',
            metadata: {
              ...parseObject(stageSource?.metadata),
              draft_stage_id: stage.id,
              draft_stage_key: stage.id,
              process_node_key: stage.id,
              copy_of_stage_id: stageSource?.id || null,
              copy_of_template_stage_id: stageSource?.template_stage_id || parseObject(stageSource?.metadata)?.template_stage_id || null,
              template_stage_id: null,
              process_run_stage_id: null,
              task_id: null,
              name: stage.title,
              stage_name: stage.title,
            },
          }
        : stageSource;
      const wantedIds = new Set(localCopiedStage ? [normalizeText(stage.id)] : collectV2StageAutoAssignIds(stage, stageIndex));
      const stageSourceStage = effectiveStageSource.source_stage && typeof effectiveStageSource.source_stage === 'object' ? effectiveStageSource.source_stage : {};
      const stageMetadata = parseObject(effectiveStageSource?.metadata);
      const runtimeStageId = normalizeDbUuid(
        effectiveStageSource?.process_run_stage_id
        || effectiveStageSource?.run_stage_id
        || stageSourceStage?.id
        || stageSourceStage?.process_run_stage_id
        || stageMetadata?.process_run_stage_id
        || (effectiveStageSource?.process_run_id ? effectiveStageSource?.id : '')
      );
      const runtimeStage = runtimeStageId
        ? (runtimeRef.current.stages || []).find((candidate: any) => normalizeDbUuid(candidate?.id || candidate?.process_run_stage_id) === runtimeStageId)
        : null;
      const stageGroupId = normalizeText(resolveDraftGroupMeta(effectiveStageSource).groupId);
      const effectiveGroupId = normalizedTargetGroupId || stageGroupId;
      const matched = rawCandidates.find((candidate, candidateIndex) => {
        const candidateGroupId = normalizeText(resolveDraftGroupMeta(candidate).groupId);
        if (effectiveGroupId && candidateGroupId && candidateGroupId !== effectiveGroupId) return false;
        return collectRawStageIdentityIds(candidate, candidateIndex).some((id) => wantedIds.has(id));
      });
      const rawStage = mergeRuntimeDraftStageForAutoAssign(matched || effectiveStageSource, effectiveStageSource, runtimeStage || {});
      const rawIds = collectRawStageIdentityIds(rawStage, stageIndex);
      const key = [
        normalizeText(resolveDraftGroupMeta(rawStage).groupId) || effectiveGroupId,
        rawIds.find(Boolean) || stage.id || stageIndex,
      ].join(':');
      if (seen.has(key)) return;
      seen.add(key);
      resolved.push(rawStage);
    });

    return resolved;
  }, [effectiveDraftStages]);

  const removeDraftSourceForV2Stages = useCallback(async (
    stages: ProcessV2Stage[],
  ) => {
    const targetStages = Array.isArray(stages) ? stages : [];
    if (targetStages.length === 0) return false;
    const matchesTarget = (candidate: any, index: number) => targetStages.some((stage, stageIndex) => {
      return rawDraftCandidateMatchesV2StagePoint(candidate, index, stage, stageIndex)
        || isSameDraftStageWithinProcessGroup(candidate, index, stage, stageIndex);
    });

    const directStages = Array.isArray(directDraftStagesRef.current) ? directDraftStagesRef.current : [];
    const nextDirectStages = directStages.filter((stage, index) => !matchesTarget(stage, index));
    let removedAny = false;
    if (nextDirectStages.length !== directStages.length) {
      await persistDraftStageList(nextDirectStages);
      removedAny = true;
    }

    const linkedStages = Array.isArray(linkedDraftStagesRef.current) ? linkedDraftStagesRef.current : [];
    const linkedOwnerKeys = new Map<string, { ownerModuleId: string; ownerRecordId: string; ownerFieldKey: string }>();
    linkedStages.forEach((stage, index) => {
      if (!matchesTarget(stage, index)) return;
      const ownerModuleId = normalizeText(stage?.__process_v2_linked_owner_module_id);
      const ownerRecordId = normalizeDbUuid(stage?.__process_v2_linked_owner_record_id);
      const ownerFieldKey = normalizeText(stage?.__process_v2_linked_owner_field_key);
      if (!ownerModuleId || !ownerRecordId || !ownerFieldKey) return;
      linkedOwnerKeys.set(`${ownerModuleId}:${ownerRecordId}:${ownerFieldKey}`, {
        ownerModuleId,
        ownerRecordId,
        ownerFieldKey,
      });
    });

    for (const owner of linkedOwnerKeys.values()) {
      const { data, error } = await (supabase.from(owner.ownerModuleId as any) as any)
        .select(owner.ownerFieldKey)
        .eq('id', owner.ownerRecordId)
        .maybeSingle();
      if (error) throw error;
      const ownerStages = Array.isArray(data?.[owner.ownerFieldKey]) ? data[owner.ownerFieldKey] : [];
      const nextOwnerStages = ownerStages.filter((stage: any, index: number) => !matchesTarget(stage, index));
      if (nextOwnerStages.length === ownerStages.length) continue;
      const { error: updateError } = await (supabase.from(owner.ownerModuleId as any) as any)
        .update({ [owner.ownerFieldKey]: nextOwnerStages })
        .eq('id', owner.ownerRecordId);
      if (updateError) throw updateError;
      removedAny = true;
      markModuleListChanged({
        org_id: orgId || recordDataRef.current?.org_id || null,
        module_id: owner.ownerModuleId,
        record_id: owner.ownerRecordId,
        action: 'update',
        updated_at: new Date().toISOString(),
      });
    }

    if (removedAny) {
      setLinkedDraftStages((current) => current.filter((stage, index) => !matchesTarget(stage, index)));
      processRuntimeBlockCache.delete(cacheKey);
    }
    return removedAny;
  }, [cacheKey, orgId, persistDraftStageList]);

  const removeLocalDraftStageFromCard = useCallback((
    stage: ProcessV2Stage,
    process: ProcessV2CardData,
  ) => {
    const key = cardKey(process);
    const matchIds = getProcessV2StageMatchIds(stage);
    const directStageId = normalizeText(stage.id);
    if (directStageId) matchIds.add(directStageId);
    if (matchIds.size === 0) return false;

    const removeFromCard = (card: ProcessV2CardData) => {
      let removed = false;
      const nextCard = {
        ...card,
        lanes: card.lanes.map((lane) => ({
          ...lane,
          stages: lane.stages.filter((candidate) => {
            const matches = processV2StageMatches(candidate, matchIds)
              || normalizeText(candidate.id) === directStageId;
            if (matches) removed = true;
            return !matches;
          }),
        })),
      } as ProcessV2CardData;
      return { nextCard, removed };
    };

    const preview = removeFromCard(process);
    if (!preview.removed) return false;
    setCardOverrides((current) => {
      const result = removeFromCard(current[key] || process);
      if (!result.removed) return current;
      return {
        ...current,
        [key]: result.nextCard,
      };
    });
    processRuntimeBlockCache.delete(cacheKey);
    markRuntimeModuleListsChanged({
      processRunId: process.mode === 'run' && !normalizeText(process.id).startsWith('draft:') ? process.id : undefined,
      templateId: process.mode === 'run' ? process.templateId : undefined,
    });
    return true;
  }, [cacheKey, cardKey, markRuntimeModuleListsChanged]);

  const deleteTemplateStages = useCallback(async (stageIds: string[]) => {
    const normalizedIds = Array.from(new Set(stageIds.map(normalizeDbUuid).filter(Boolean)));
    if (normalizedIds.length === 0) return false;
    await recycleOrDeleteProcessRows('process_template_stages', 'process_template_stages', normalizedIds);
    setTemplateStages((current) => current.filter((stage) => !normalizedIds.includes(normalizeDbUuid(stage?.id || stage?.template_stage_id))));
    processRuntimeBlockCache.delete(cacheKey);
    await refresh(true);
    markRuntimeModuleListsChanged({ templateId: normalizedRecordId });
    return true;
  }, [cacheKey, markRuntimeModuleListsChanged, normalizedRecordId, refresh]);

  const deleteRunDraftStages = useCallback(async (stageIds: string[]) => {
    const normalizedIds = Array.from(new Set(stageIds.map(normalizeDbUuid).filter(Boolean)));
    if (normalizedIds.length === 0) return false;
    await recycleOrDeleteProcessRows('process_run_stages', 'process_run_stages', normalizedIds);
    setRuntime((current) => ({
      ...current,
      stages: current.stages.filter((stage) => !normalizedIds.includes(normalizeDbUuid(stage?.id || stage?.process_run_stage_id))),
    }));
    processRuntimeBlockCache.delete(cacheKey);
    await refresh(true);
    markRuntimeModuleListsChanged();
    return true;
  }, [cacheKey, markRuntimeModuleListsChanged, refresh]);

  const getRunStageIdForDraftStage = useCallback((stage: ProcessV2Stage) => {
    const source = stage.source && typeof stage.source === 'object' ? stage.source : {};
    const sourceStage = source.source_stage && typeof source.source_stage === 'object' ? source.source_stage : {};
    const metadata = parseObject(source?.metadata);
    return normalizeDbUuid(
      source?.process_run_stage_id
      || sourceStage?.id
      || sourceStage?.process_run_stage_id
      || metadata?.process_run_stage_id
      || (source?.process_run_id ? source?.id : '')
    );
  }, []);

  const getTaskIdForProcessStage = useCallback((stage: ProcessV2Stage) => {
    const source = stage.source && typeof stage.source === 'object' ? stage.source : {};
    const sourceStage = source.source_stage && typeof source.source_stage === 'object' ? source.source_stage : {};
    const metadata = parseObject(source?.metadata);
    if (source?.__process_v2_has_real_task === true || stage.kind === 'activity') {
      return normalizeDbUuid(source?.task_id || source?.process_task_id || source?.id || metadata?.task_id || sourceStage?.task_id);
    }
    return normalizeDbUuid(source?.task_id || source?.process_task_id || metadata?.task_id || sourceStage?.task_id);
  }, []);

  const unlinkTaskFromProcessStage = useCallback(async (stage: ProcessV2Stage) => {
    const taskId = getTaskIdForProcessStage(stage);
    const runStageId = getRunStageIdForDraftStage(stage);
    if (!taskId) {
      message.warning('فعالیت متناظر برای قطع اتصال پیدا نشد.');
      return false;
    }
    await processV2DeleteTaskStageSafely('unlink', taskId, runStageId);
    setCardOverrides({});
    setRuntime((current) => {
      const next = {
        ...current,
        tasks: current.tasks.filter((item: any) => normalizeText(item?.id) !== taskId),
        stages: current.stages.map((item: any) => (
          runStageId && normalizeDbUuid(item?.id || item?.process_run_stage_id) === runStageId
            ? {
                ...item,
                task_id: null,
                status: 'todo',
                assignee_user_id: null,
                assignee_role_id: null,
                planned_due_at: null,
                completed_at: null,
              }
            : item
        )),
      };
      runtimeRef.current = next;
      return next;
    });
    processRuntimeBlockCache.delete(cacheKey);
    void refresh(true);
    markRuntimeModuleListsChanged({ taskId });
    message.success('اتصال فعالیت از این فرآیند حذف شد');
    return true;
  }, [cacheKey, getRunStageIdForDraftStage, getTaskIdForProcessStage, markRuntimeModuleListsChanged, message, refresh]);

  const deleteTaskAndKeepDraftStage = useCallback(async (stage: ProcessV2Stage) => {
    const taskId = getTaskIdForProcessStage(stage);
    const runStageId = getRunStageIdForDraftStage(stage);
    if (!taskId) {
      message.warning('فعالیت متناظر برای حذف پیدا نشد.');
      return false;
    }
    await processV2DeleteTaskStageSafely('delete_task_keep_draft', taskId, runStageId);
    setCardOverrides({});
    setRuntime((current) => {
      const next = {
        ...current,
        tasks: current.tasks.filter((item: any) => normalizeText(item?.id) !== taskId),
        stages: current.stages.map((item: any) => (
          runStageId && normalizeDbUuid(item?.id || item?.process_run_stage_id) === runStageId
            ? {
                ...item,
                task_id: null,
                status: 'todo',
                assignee_user_id: null,
                assignee_role_id: null,
                planned_due_at: null,
                completed_at: null,
              }
            : item
        )),
      };
      runtimeRef.current = next;
      return next;
    });
    processRuntimeBlockCache.delete(cacheKey);
    void refresh(true);
    markRuntimeModuleListsChanged({ taskId });
    message.success('فعالیت حذف شد و مرحله پیش‌نویس باقی ماند');
    return true;
  }, [cacheKey, getRunStageIdForDraftStage, getTaskIdForProcessStage, markRuntimeModuleListsChanged, message, refresh]);

  const deleteDraftStageCompletely = useCallback(async (
    stage: ProcessV2Stage,
    process: ProcessV2CardData,
    showMessage = true,
  ) => {
    if (process.mode === 'template' && isProcessTemplateModule(normalizedModuleId)) {
      const source = stage.source && typeof stage.source === 'object' ? stage.source : {};
      const templateStageId = normalizeDbUuid(source?.template_stage_id || source?.id || stage.id);
      if (await deleteTemplateStages([templateStageId])) {
        if (showMessage) message.success('مرحله پیش‌نویس حذف شد');
        return true;
      }
      return false;
    }

    const runStageId = getRunStageIdForDraftStage(stage);
    if (runStageId) {
      if (await deleteRunDraftStages([runStageId])) {
        await removeDraftSourceForV2Stages([stage]).catch((error) => {
          console.warn('Could not remove process v2 draft source after deleting run stage', error);
        });
        if (showMessage) message.success('مرحله پیش‌نویس حذف شد');
        return true;
      }
      return false;
    }

    if (await removeDraftSourceForV2Stages([stage])) {
      if (showMessage) message.success('مرحله پیش‌نویس حذف شد');
      return true;
    }

    if (removeLocalDraftStageFromCard(stage, process)) {
      if (showMessage) message.success('مرحله پیش‌نویس حذف شد');
      return true;
    }
    if (showMessage) message.warning('مرحله پیش‌نویس متناظر برای حذف پیدا نشد.');
    return false;
  }, [deleteRunDraftStages, deleteTemplateStages, getRunStageIdForDraftStage, message, normalizedModuleId, removeDraftSourceForV2Stages, removeLocalDraftStageFromCard]);

  const deleteTaskAndDraftStageCompletely = useCallback(async (
    stage: ProcessV2Stage,
    process: ProcessV2CardData,
  ) => {
    const taskId = getTaskIdForProcessStage(stage);
    const runStageId = getRunStageIdForDraftStage(stage);
    if (taskId || runStageId) {
      await processV2DeleteTaskStageSafely('delete_all', taskId, runStageId);
      await removeDraftSourceForV2Stages([stage]).catch((error) => {
        console.warn('Could not remove process v2 draft source after deleting task and stage', error);
      });
      setCardOverrides({});
      setRuntime((current) => {
        const next = {
          ...current,
          tasks: current.tasks.filter((item: any) => normalizeText(item?.id) !== taskId),
          stages: current.stages.filter((item: any) => !runStageId || normalizeDbUuid(item?.id || item?.process_run_stage_id) !== runStageId),
        };
        runtimeRef.current = next;
        return next;
      });
      processRuntimeBlockCache.delete(cacheKey);
      void refresh(true);
      markRuntimeModuleListsChanged({ taskId });
      if (taskId) message.success('فعالیت و مرحله فرآیند حذف شدند');
      return true;
    }
    const deletedDraft = await deleteDraftStageCompletely(stage, process, false);
    if (!deletedDraft && taskId) {
      processRuntimeBlockCache.delete(cacheKey);
      await refresh(true);
    }
    markRuntimeModuleListsChanged({ taskId });
    if (taskId && deletedDraft) {
      message.success('فعالیت و مرحله فرآیند حذف شدند');
    } else if (taskId) {
      message.warning('فعالیت حذف شد، اما مرحله فرآیند برای حذف پیدا نشد.');
    }
    return deletedDraft || Boolean(taskId);
  }, [cacheKey, deleteDraftStageCompletely, getRunStageIdForDraftStage, getTaskIdForProcessStage, markRuntimeModuleListsChanged, message, refresh, removeDraftSourceForV2Stages]);

  const handleDeleteStage = useCallback(async (
    stage: ProcessV2Stage,
    lane: ProcessV2Lane,
    process: ProcessV2CardData,
  ) => {
    setStageDeleteRequest({ stage, lane, process });
    return false;
  }, []);

  const handleStageDeleteChoice = useCallback(async (mode: StageDeleteMode) => {
    if (!stageDeleteRequest || stageDeleteBusy) return;
    setStageDeleteBusy(mode);
    try {
      const { stage, process } = stageDeleteRequest;
      if (mode === 'unlink') {
        await unlinkTaskFromProcessStage(stage);
      } else if (mode === 'delete_task_keep_draft') {
        await deleteTaskAndKeepDraftStage(stage);
      } else if (stage.kind === 'draft' && !getTaskIdForProcessStage(stage)) {
        await deleteDraftStageCompletely(stage, process);
      } else {
        await deleteTaskAndDraftStageCompletely(stage, process);
      }
      setStageDeleteRequest(null);
    } catch (error: any) {
      message.error(normalizeText(error?.message || error?.details) || 'حذف مرحله فرآیند ناموفق بود');
    } finally {
      setStageDeleteBusy(null);
    }
  }, [
    deleteDraftStageCompletely,
    deleteTaskAndDraftStageCompletely,
    deleteTaskAndKeepDraftStage,
    getTaskIdForProcessStage,
    message,
    stageDeleteBusy,
    stageDeleteRequest,
    unlinkTaskFromProcessStage,
  ]);

  const getBulkDeleteStages = useCallback((request: BulkDeleteRequest | null) => (
    request?.kind === 'lane'
      ? (request.lane?.stages || [])
      : (request?.process.lanes || []).flatMap((lane) => lane.stages)
  ), []);

  const deleteProcessRecordCompletely = useCallback(async (process: ProcessV2CardData) => {
    if (normalizeText(process.id).startsWith('draft:')) {
      const removedBySource = await removeDraftSourceForV2Stages(process.lanes.flatMap((lane) => lane.stages));
      if (removedBySource) {
        setHiddenCardIds((current) => new Set([...Array.from(current), cardKey(process)]));
      }
      return removedBySource;
    }

    if (process.mode === 'template') {
      const stageIds = process.lanes
        .flatMap((lane) => lane.stages)
        .map((stage) => {
          const source = stage.source && typeof stage.source === 'object' ? stage.source : {};
          return normalizeDbUuid(source?.template_stage_id || source?.id || stage.id);
        })
        .filter(Boolean);
      if (stageIds.length > 0) {
        await deleteTemplateStages(stageIds);
      }
      setHiddenCardIds((current) => new Set([...Array.from(current), cardKey(process)]));
      return true;
    }

    if (process.mode !== 'run') return false;
    const sourceRunId = normalizeDbUuid(process.id);
    if (!sourceRunId) {
      message.warning('شناسه دیتابیسی فرآیند برای حذف پیدا نشد.');
      return false;
    }
    try {
      await moveProcessRowsToRecycleBin('process_runs', 'process_runs', [sourceRunId]);
    } catch (error) {
      if (!isUnsupportedRecycleError(error)) throw error;
      const { error: deleteError } = await (supabase.from('process_runs' as any) as any)
        .delete()
        .eq('id', sourceRunId);
      if (deleteError) throw deleteError;
    }
    setHiddenCardIds((current) => new Set([...Array.from(current), cardKey(process)]));
    await removeDraftSourceForV2Stages(process.lanes.flatMap((lane) => lane.stages)).catch((error) => {
      console.warn('Could not remove process v2 draft sources after deleting process', error);
    });
    processRuntimeBlockCache.delete(cacheKey);
    await refresh(true);
    return true;
  }, [cacheKey, cardKey, deleteTemplateStages, message, refresh, removeDraftSourceForV2Stages]);

  const handleBulkDeleteChoice = useCallback(async (mode: StageDeleteMode) => {
    if (!bulkDeleteRequest || bulkDeleteBusy) return;
    setBulkDeleteBusy(mode);
    try {
      const stages = getBulkDeleteStages(bulkDeleteRequest);
      const stagesWithTask = stages.filter((stage) => Boolean(getTaskIdForProcessStage(stage)));
      if (mode === 'delete_all' && stagesWithTask.length === 0) {
        if (bulkDeleteRequest.kind === 'process') {
          await deleteProcessRecordCompletely(bulkDeleteRequest.process);
          message.success('فرآیند پیش‌نویس حذف شد');
        } else {
          const lane = bulkDeleteRequest.lane;
          const process = bulkDeleteRequest.process;
          if (!lane) return;
          if (process.mode === 'template' && isProcessTemplateModule(normalizedModuleId)) {
            const stageIds = lane.stages
              .map((stage) => {
                const source = stage.source && typeof stage.source === 'object' ? stage.source : {};
                return normalizeDbUuid(source?.template_stage_id || source?.id || stage.id);
              })
              .filter(Boolean);
            await deleteTemplateStages(stageIds);
          } else {
            const runStageIds = lane.stages.map(getRunStageIdForDraftStage).filter(Boolean);
            if (runStageIds.length === lane.stages.length && runStageIds.length > 0) {
              await deleteRunDraftStages(runStageIds);
              await removeDraftSourceForV2Stages(lane.stages).catch((error) => {
                console.warn('Could not remove process v2 draft sources after deleting lane', error);
              });
            } else {
              const removed = await removeDraftSourceForV2Stages(lane.stages);
              if (!removed) {
                message.warning('مرحله پیش‌نویس متناظر برای این ردیف پیدا نشد؛ حذف وسیع انجام نشد.');
                return;
              }
            }
          }
          setCardOverrides((current) => {
            const process = bulkDeleteRequest.process;
            const laneId = normalizeText(lane.id);
            const key = cardKey(process);
            const base = current[key] || process;
            return {
              ...current,
              [key]: {
                ...base,
                lanes: base.lanes.filter((candidate) => normalizeText(candidate.id) !== laneId),
              } as ProcessV2CardData,
            };
          });
          message.success('ردیف پیش‌نویس حذف شد');
        }
        setBulkDeleteRequest(null);
        return;
      }
      if (mode === 'unlink') {
        for (const stage of stagesWithTask) {
          await unlinkTaskFromProcessStage(stage);
        }
        if (stagesWithTask.length === 0) {
          message.warning('فعالیت واقعی برای قطع اتصال پیدا نشد.');
        } else {
          message.success('اتصال فعالیت‌های این بخش از فرآیند قطع شد');
        }
      } else if (mode === 'delete_task_keep_draft') {
        for (const stage of stagesWithTask) {
          await deleteTaskAndKeepDraftStage(stage);
        }
        if (stagesWithTask.length === 0) {
          message.warning('فعالیت واقعی برای حذف پیدا نشد.');
        } else {
          message.success('فعالیت‌ها حذف شدند و مرحله‌ها پیش‌نویس ماندند');
        }
      } else {
        for (const stage of stages) {
          const hasTask = Boolean(getTaskIdForProcessStage(stage));
          if (hasTask) {
            await deleteTaskAndDraftStageCompletely(stage, bulkDeleteRequest.process);
          } else {
            await deleteDraftStageCompletely(stage, bulkDeleteRequest.process, false);
          }
        }
        if (bulkDeleteRequest.kind === 'process') {
          await deleteProcessRecordCompletely(bulkDeleteRequest.process);
          message.success('فرآیند و مرحله‌های آن حذف شدند');
        } else {
          const deletedLaneId = normalizeText(bulkDeleteRequest.lane?.id);
          if (deletedLaneId) {
            setCardOverrides((current) => {
              const process = bulkDeleteRequest.process;
              const key = cardKey(process);
              const base = current[key] || process;
              return {
                ...current,
                [key]: {
                  ...base,
                  lanes: base.lanes.filter((candidate) => normalizeText(candidate.id) !== deletedLaneId),
                } as ProcessV2CardData,
              };
            });
          }
          processRuntimeBlockCache.delete(cacheKey);
          await refresh(true);
          message.success('ردیف و مرحله‌های آن حذف شدند');
        }
      }
      setBulkDeleteRequest(null);
    } catch (error: any) {
      message.error(normalizeText(error?.message || error?.details) || 'حذف بخش فرآیند ناموفق بود');
    } finally {
      setBulkDeleteBusy(null);
    }
  }, [
    bulkDeleteBusy,
    bulkDeleteRequest,
    cardKey,
    cacheKey,
    deleteDraftStageCompletely,
    deleteProcessRecordCompletely,
    deleteTaskAndDraftStageCompletely,
    deleteTaskAndKeepDraftStage,
    getBulkDeleteStages,
    getTaskIdForProcessStage,
    getRunStageIdForDraftStage,
    message,
    normalizedModuleId,
    refresh,
    removeDraftSourceForV2Stages,
    deleteRunDraftStages,
    deleteTemplateStages,
    unlinkTaskFromProcessStage,
  ]);

  const handleDeleteLane = useCallback(async (
    lane: ProcessV2Lane,
    process: ProcessV2CardData,
  ) => {
    if (!lane.stages || lane.stages.length === 0) return true;
    setBulkDeleteRequest({ kind: 'lane', lane, process });
    return false;
  }, []);

  const handleDeleteCard = useCallback(async (id: string) => {
    const source = displayCards.find((card) => card.id === id);
    if (!source) return;
    if (
      (normalizeText(source.id).startsWith('new-run:') || normalizeText(source.id).startsWith('draft:'))
      && source.lanes.every((lane) => lane.stages.length === 0)
    ) {
      setExtraCards((current) => current.filter((card) => card.id !== source.id));
      return;
    }
    setBulkDeleteRequest({ kind: 'process', process: source });
  }, [cardKey, displayCards]);

  const handleCopyCard = useCallback((id: string) => {
    const source = displayCards.find((card) => card.id === id);
    if (!source) return;
    const cloneCardStage = (stage: ProcessV2Stage): ProcessV2Stage => {
      const clonedId = `copy_stage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const clonedNodeKey = `copy_node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const clonedTitle = `${stage.title} کپی`;
      const stageSource = stage.source && typeof stage.source === 'object' ? stage.source : {};
      const metadata = parseObject(stageSource?.metadata);
      return {
        ...stage,
        id: clonedId,
        title: clonedTitle,
        kind: 'draft',
        status: 'draft',
        source: {
          ...stageSource,
          id: clonedId,
          name: clonedTitle,
          stage_name: clonedTitle,
          template_stage_id: null,
          process_run_stage_id: null,
          run_stage_id: null,
          task_id: null,
          process_task_id: null,
          source_stage: undefined,
          __process_v2_has_real_task: false,
          process_node_key: clonedNodeKey,
          is_draft: true,
          status: 'draft',
          metadata: {
            ...metadata,
            draft_stage_id: clonedId,
            draft_stage_key: clonedId,
            process_node_key: clonedNodeKey,
            copy_of_stage_id: stage.id || stageSource?.id || null,
            copy_of_template_stage_id: stageSource?.template_stage_id || metadata?.template_stage_id || null,
            template_stage_id: null,
            process_run_stage_id: null,
            task_id: null,
            name: clonedTitle,
            stage_name: clonedTitle,
          },
        },
      };
    };
    const cloned: ProcessV2CardData = {
      ...source,
      id: `copy:${source.id}:${Date.now()}`,
      title: `${source.title} کپی`,
      lanes: source.lanes.map((lane) => ({
        ...lane,
        id: `copy:${lane.id}:${Date.now()}`,
        stages: lane.stages.map(cloneCardStage),
      })),
    } as ProcessV2CardData;
    pendingScrollCardKeyRef.current = cardKey(cloned);
    setExtraCards((current) => [cloned, ...current]);
    message.success('کپی فرآیند در نمای جدید ساخته شد.');
  }, [cardKey, displayCards, message]);

  const formatAuditDate = (value: unknown) => {
    const raw = normalizeText(value);
    return raw ? toPersianNumber(safeJalaliFormat(raw, 'YYYY/MM/DD HH:mm') || raw) : 'ثبت نشده';
  };

  const processAuditFieldLabels: Record<string, string> = {
    process_name: 'نام فرآیند',
    stage_name: 'نام مرحله',
    status: 'وضعیت',
    sort_order: 'ترتیب مرحله',
    process_lane_key: 'ردیف فرآیند',
    assignee_user_id: 'مسئول',
    assignee_role_id: 'نقش مسئول',
    task_id: 'فعالیت مرتبط',
    planned_start_at: 'زمان شروع برنامه‌ریزی‌شده',
    planned_due_at: 'موعد برنامه‌ریزی‌شده',
    started_at: 'زمان شروع',
    completed_at: 'زمان تکمیل',
    name: 'نام فعالیت',
    description: 'شرح فعالیت',
    due_date: 'موعد فعالیت',
  };

  const getProcessAuditSummary = (row: any) => {
    const metadata = parseObject(row?.metadata);
    const explicit = normalizeText(metadata?.summary);
    if (explicit && explicit !== 'یکی از فیلدهای رکورد تغییر کرد') return explicit;
    const action = normalizeText(row?.action);
    if (action === 'create') return `${getModuleLabel(row?.module_id)} ایجاد شد`;
    if (action === 'delete') return `${getModuleLabel(row?.module_id)} حذف شد`;
    const field = normalizeText(row?.field_name);
    return field ? `${processAuditFieldLabels[field] || 'اطلاعات فرآیند'} تغییر کرد` : 'فرآیند تغییر کرد';
  };

  const getProcessAuditValue = (value: unknown) => {
    if (value === null || value === undefined || value === '') return 'خالی';
    const text = normalizeText(value);
    if (!text) return 'خالی';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
      return 'رکورد مرتبط';
    }
    if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
      return 'اطلاعات چندبخشی';
    }
    const statusLabels: Record<string, string> = {
      todo: 'در انتظار انجام',
      in_progress: 'در حال انجام',
      done: 'انجام شده',
      completed: 'تکمیل شده',
      active: 'فعال',
      paused: 'متوقف شده',
      cancelled: 'لغو شده',
      draft: 'پیش نویس',
    };
    const displayText = statusLabels[text] || text;
    return toPersianNumber(displayText.length > 90 ? `${displayText.slice(0, 90)}…` : displayText);
  };

  const handleShowInfo = useCallback(async (item: ProcessV2CardData) => {
    const stageCount = item.lanes.reduce((sum, lane) => sum + lane.stages.length, 0);
    const closeLoading = message.loading('در حال خواندن اطلاعات فرآیند...', 0);
    let audit: Awaited<ReturnType<typeof fetchProcessAudit>> | null = null;
    try {
      audit = await fetchProcessAudit(supabase, item, {
        moduleId: normalizedModuleId,
        recordId: normalizedRecordId,
      });
    } catch (error) {
      console.warn('Could not load process audit info', error);
    } finally {
      closeLoading();
    }
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
          <div><span className="text-gray-500">ایجادکننده:</span> {audit?.createdBy || 'ثبت نشده'}</div>
          <div><span className="text-gray-500">زمان ایجاد:</span> {formatAuditDate(audit?.createdAt)}</div>
          <div><span className="text-gray-500">آخرین ویرایش‌کننده:</span> {audit?.updatedBy || 'ثبت نشده'}</div>
          <div><span className="text-gray-500">زمان آخرین ویرایش:</span> {formatAuditDate(audit?.updatedAt)}</div>
        </div>
      ),
      okText: 'بستن',
      centered: true,
      direction: 'rtl',
    });
  }, [message, normalizedModuleId, normalizedRecordId]);

  const handleShowHistory = useCallback(async (item: ProcessV2CardData) => {
    const closeLoading = message.loading('در حال خواندن تاریخچه فرآیند...', 0);
    try {
      const audit = await fetchProcessAudit(supabase, item, {
        moduleId: normalizedModuleId,
        recordId: normalizedRecordId,
      });
      Modal.info({
        title: 'تاریخچه تغییرات فرآیند',
        content: (
          <div className="max-h-[62vh] space-y-2 overflow-y-auto pl-1 text-sm" dir="rtl">
            {audit.rows.length > 0 ? audit.rows.map((row: any) => (
              <div key={row.id} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                <div className="font-bold text-gray-800 dark:text-gray-100">{getProcessAuditSummary(row)}</div>
                {normalizeText(row.action) === 'update' && (row.old_value !== null || row.new_value !== null) ? (
                  <div className="mt-1 text-xs leading-6 text-gray-600 dark:text-gray-300">
                    از «{getProcessAuditValue(row.old_value)}» به «{getProcessAuditValue(row.new_value)}»
                  </div>
                ) : null}
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                  <span>{getModuleLabel(row.module_id)}</span>
                  <span>•</span>
                  <span>{formatAuditDate(row.created_at)}</span>
                  {row.user_id ? <><span>•</span><span>{audit.authorNameMap[normalizeText(row.user_id)] || 'کاربر سیستم'}</span></> : null}
                </div>
              </div>
            )) : (
              <div className="rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-gray-500 dark:border-white/10">
                هنوز تغییری برای این فرآیند ثبت نشده است.
              </div>
            )}
          </div>
        ),
        width: 680,
        okText: 'بستن',
        centered: true,
        direction: 'rtl',
      });
    } catch (error) {
      console.warn('Could not load process changelog', error);
      message.error('خواندن تاریخچه فرآیند ناموفق بود.');
    } finally {
      closeLoading();
    }
  }, [message, normalizedModuleId, normalizedRecordId]);

  const handleShowRecords = useCallback(async (item: ProcessV2CardData) => {
    const relatedRecords = collectProcessRelatedRecords(item);
    const groupStages = item.mode === 'run'
      ? item.lanes.flatMap((lane) => lane.stages).map((stage) => stage.source || stage)
      : [];
    const rawGroupId = item.mode === 'run'
      ? (
          groupStages
            .map((stage) => resolveDraftGroupMeta(stage).groupId)
            .map(normalizeText)
            .find(Boolean)
          || normalizeText(item.id).replace(/^(draft|new-run):/, '')
        )
      : '';
    const fallbackGroup = item.mode === 'run'
      ? {
          id: rawGroupId || item.id,
          templateId: item.templateId || null,
          stages: groupStages,
        }
      : undefined;

    if (
      typeof window !== 'undefined'
      && normalizedModuleId
      && normalizedRecordId
      && !isProcessTemplateModule(normalizedModuleId)
      && !isProcessRunModule(normalizedModuleId)
    ) {
      window.dispatchEvent(new CustomEvent('kalamapp:open-process-append', {
        detail: {
          moduleId: normalizedModuleId,
          recordId: normalizedRecordId,
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
  }, [normalizedModuleId, normalizedRecordId, recordData?.module_id, recordData?.module_ids]);

  const buildLocalRunCard = useCallback((templateId?: string | null): ProcessV2CardData => {
    const normalizedTemplateId = normalizeText(templateId);
    const templateTitle = normalizedTemplateId
      ? (templateNameById.get(normalizedTemplateId) || templates.find((template) => template.id === normalizedTemplateId)?.title || 'الگوی فرآیند')
      : '';
    const groupId = createProcessGroupId();
    return {
      mode: 'run',
      id: `new-run:${groupId}`,
      title: templateTitle || 'فرآیند جدید',
      templateId: normalizedTemplateId,
      templateTitle: templateTitle || '',
      relatedRecordLabel: fallbackRecordLabel,
      statusLabel: 'draft',
      auditSource: { process_created_at: new Date().toISOString() },
      lanes: [{ id: `lane_${Date.now()}`, title: 'ردیف اصلی', stages: [] }],
    };
  }, [fallbackRecordLabel, templateNameById, templates]);

  const handleAddRun = useCallback(() => {
    if (isProcessTemplateModule(normalizedModuleId)) return;
    if (typeof window !== 'undefined' && normalizedModuleId && normalizedRecordId && !isProcessRunModule(normalizedModuleId)) {
      pendingScrollToFirstCardRef.current = true;
      window.dispatchEvent(new CustomEvent('kalamapp:open-process-append', {
        detail: {
          moduleId: normalizedModuleId,
          recordId: normalizedRecordId,
          mode: 'append',
        },
      }));
      return;
    }
    const next = buildLocalRunCard(null);
    pendingScrollCardKeyRef.current = cardKey(next);
    setExtraCards((current) => [next, ...current]);
  }, [buildLocalRunCard, cardKey, normalizedModuleId, normalizedRecordId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !normalizedModuleId || !normalizedRecordId) return undefined;
    if (isProcessTemplateModule(normalizedModuleId) || isProcessRunModule(normalizedModuleId)) return undefined;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{
        moduleId?: string;
        recordId?: string;
        mode?: 'append' | 'links';
      }>)?.detail || {};
      if (normalizeText(detail.moduleId) !== normalizedModuleId) return;
      if (normalizeText(detail.recordId) !== normalizedRecordId) return;
      if (detail.mode === 'links') return;
      pendingScrollToFirstCardRef.current = true;
    };
    window.addEventListener('kalamapp:open-process-append', handler as EventListener);
    return () => {
      window.removeEventListener('kalamapp:open-process-append', handler as EventListener);
    };
  }, [normalizedModuleId, normalizedRecordId]);

  const handleTemplateChange = useCallback(async (item: ProcessV2RunCard, templateId: string, intent: 'replace' | 'add') => {
    const selectedTitle = templateNameById.get(templateId) || templates.find((template) => template.id === templateId)?.title || item.templateTitle || 'الگوی فرآیند';
    const normalizedItemId = normalizeText(item.id);
    const isDraftProcessCard = normalizedItemId.startsWith('draft:') || normalizedItemId.startsWith('new-run:');
    const isEmptyLocalDraft = isDraftProcessCard && item.lanes.every((lane) => lane.stages.length === 0);
    if (isDraftProcessCard || intent === 'add') {
      try {
        const selectedTemplate = templates.find((template) => template.id === templateId);
        const templateTargetModuleIds = normalizeProcessTargetModuleIds(selectedTemplate?.moduleIds, selectedTemplate?.moduleId || normalizedModuleId);
        const processLinkMap = buildProcessLinkMapFromRecord(
          normalizedModuleId,
          recordDataRef.current || recordData || {},
          templateTargetModuleIds,
        );
        const templateStageRows = await loadProcessTemplateStages(supabase, templateId);
        if (!Array.isArray(templateStageRows) || templateStageRows.length === 0) {
          message.info('این الگو مرحله‌ای برای افزودن ندارد');
          return;
        }
        const existingDirectStages = Array.isArray(directDraftStagesRef.current) ? directDraftStagesRef.current : [];
        const currentGroupId = isDraftProcessCard ? normalizedItemId.replace(/^(draft|new-run):/, '') : '';
        const nextGroupId = intent === 'replace' && currentGroupId ? currentGroupId : createProcessGroupId();
        const draftRows = mapProcessTemplateStagesToDraft(templateId, templateStageRows, {
          groupId: nextGroupId,
          groupName: selectedTitle,
          templateName: selectedTitle,
          targetModuleIds: templateTargetModuleIds,
          processLinkMap,
          startSortOrder: 10,
        }).map((stage: any) => ({
          ...stage,
          process_created_at: new Date().toISOString(),
          automation_rules: Array.isArray(stage?.automation_rules) ? stage.automation_rules : [],
          [PROCESS_TASK_CUSTOM_FIELDS_KEY]: normalizeProcessTaskCustomFields(stage?.[PROCESS_TASK_CUSTOM_FIELDS_KEY] || stage?.metadata?.[PROCESS_TASK_CUSTOM_FIELDS_KEY]),
          [PROCESS_TASK_STATUS_OPTIONS_KEY]: normalizeProcessTaskStatusOptions(stage?.[PROCESS_TASK_STATUS_OPTIONS_KEY] || stage?.metadata?.[PROCESS_TASK_STATUS_OPTIONS_KEY]),
          duration_unit: normalizeText(stage?.duration_unit) === 'hour' ? 'hour' : 'day',
          duration_from: normalizeText(stage?.duration_from || 'project_start'),
        }));
        const baseStages = intent === 'replace' && currentGroupId
          ? existingDirectStages.filter((stage: any) => resolveDraftGroupMeta(stage).groupId !== currentGroupId)
          : existingDirectStages;
        const sortShift = Math.max(20, (draftRows.length + 1) * 10);
        const shiftedExisting = baseStages.map((stage: any, index: number) => ({
          ...stage,
          sort_order: Number(stage?.sort_order || ((index + 1) * 10)) + sortShift,
        }));
        await persistDraftStageList([...draftRows, ...shiftedExisting].sort((a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0)));
        setExtraCards((current) => current.filter((card) => card.id !== item.id));
        setCardOverrides((current) => {
          const next = { ...current };
          delete next[cardKey(item)];
          return next;
        });
        pendingScrollToFirstCardRef.current = true;
        markRuntimeModuleListsChanged({ templateId });
        message.success(isEmptyLocalDraft ? 'فرآیند جدید از الگو ساخته شد' : 'الگوی فرآیند اعمال شد');
        return;
      } catch (error: any) {
        message.error(normalizeText(error?.message || error?.details) || 'اعمال الگوی فرآیند ناموفق بود');
        return;
      }
    }
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
    pendingScrollCardKeyRef.current = cardKey(next);
    setExtraCards((current) => [next, ...current]);
    void handleShowRecords(next);
  }, [
    buildLocalRunCard,
    cardKey,
    handleShowRecords,
    markRuntimeModuleListsChanged,
    message,
    normalizedModuleId,
    persistDraftStageList,
    recordData,
    templateNameById,
    templates,
  ]);

  const handleAutoAssignProcess = useCallback(async (item: ProcessV2CardData) => {
    const itemDraftStages = item.lanes.flatMap((lane) => lane.stages.filter((stage) => stage.kind === 'draft'));
    if (itemDraftStages.length === 0) {
      message.info('مرحله پیش‌نویسی برای ارجاع وجود ندارد.');
      return;
    }
    const isDraftCard = normalizeText(item.id).startsWith('draft:');
    const itemGroupIds = Array.from(new Set(
      itemDraftStages
        .map((stage) => resolveDraftGroupMeta(stage.source && typeof stage.source === 'object' ? stage.source : stage).groupId)
        .map(normalizeText)
        .filter(Boolean),
    ));
    const targetGroupId = isDraftCard
      ? normalizeText(item.id).replace(/^draft:/, '')
      : (itemGroupIds.length === 1 ? itemGroupIds[0] : '');
    const sourceDraftStages = resolveRawDraftStagesForV2Stages(itemDraftStages, targetGroupId);
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
        const createdStageIdentityKeys = new Set(
          (Array.isArray(result.createdTasks) ? result.createdTasks : []).flatMap((task: any) => {
            const recurrence = parseObject(task?.recurrence_info);
            return [
              task?.process_node_key,
              task?.process_run_stage_id,
              task?.template_stage_id,
              task?.source_template_stage_id,
              recurrence?.process_node_key,
              recurrence?.process_run_stage_id,
              recurrence?.template_stage_id,
            ].map(normalizeText).filter(Boolean);
          }),
        );
        const createdDraftStages = itemDraftStages.filter((stage, index) => {
          const source = stage.source && typeof stage.source === 'object' ? stage.source : stage;
          const stageIds = collectV2StageAutoAssignIds(stage, index);
          return stageIds.some((stageId) => createdStageIdentityKeys.has(normalizeText(stageId)));
        });
        // فقط مرحله‌هایی که واقعاً فعالیت متناظرشان ساخته شده حذف می‌شوند؛
        // مرحله‌های بدون مسئول یا مرحله‌هایی که ساختشان ناموفق بوده‌اند پیش‌نویس می‌مانند.
        await removeDraftSourceForV2Stages(createdDraftStages);
        setCardOverrides((current) => {
          const next = { ...current };
          delete next[cardKey(item)];
          return next;
        });
        message.success(`${toPersianNumber(result.createdCount)} فعالیت ایجاد شد`);
      } else if (Number(result.missingAssigneeCount || 0) > 0) {
        message.warning(`${toPersianNumber(result.missingAssigneeCount || 0)} مرحله مسئول مشخص ندارد و ارجاع نشد`);
      } else if (result.skippedCount > 0) {
        message.warning(`${toPersianNumber(result.skippedCount)} مرحله از قبل فعالیت مرتبط داشت یا قابل ایجاد نبود`);
      } else {
        message.warning('فعالیتی ایجاد نشد. تنظیمات مراحل پیش نویس را بررسی کنید.');
      }
      await refresh(true);
      const createdTaskIds = Array.isArray(result.createdTasks)
        ? result.createdTasks.map((task: any) => normalizeText(task?.id)).filter(Boolean)
        : [];
      if (createdTaskIds.length > 0) {
        createdTaskIds.forEach((taskId) => markRuntimeModuleListsChanged({ taskId }));
      } else {
        markRuntimeModuleListsChanged();
      }
    } catch (error: any) {
      message.error(normalizeText(error?.message || error?.details) || 'ارجاع خودکار فرآیند ناموفق بود');
    } finally {
      setAutoAssigningCardIds((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }, [autoAssigningCardIds, cardKey, markRuntimeModuleListsChanged, message, normalizedModuleId, normalizedRecordId, recordData, refresh, removeDraftSourceForV2Stages, resolveRawDraftStagesForV2Stages]);

  const handleAutoAssignStage = useCallback(async (stage: ProcessV2Stage, _laneTitle: string, item: ProcessV2CardData, overrides?: Record<string, any>) => {
    if (stage.kind !== 'draft') return;
    if (item.mode !== 'run') return;
    const sourceStage = stage.source && typeof stage.source === 'object' ? stage.source : {};
    const sourceMeta = parseObject(sourceStage?.metadata);
    const itemRunId = item.mode === 'run' ? normalizeDbUuid(item.id) : '';
    const runRow = itemRunId
      ? (runtimeRef.current.runs || []).find((row: any) => normalizeDbUuid(row?.id) === itemRunId)
      : null;
    const runMetadata = parseObject(runRow?.metadata);
    const runGroupId = normalizeText(runRow?.process_group_id || runMetadata?.process_group_id);
    const targetGroupId = normalizeText(item.id).startsWith('draft:')
      ? normalizeText(item.id).replace(/^draft:/, '')
      : normalizeText(runGroupId || sourceStage?.process_group_id || sourceMeta?.process_group_id || sourceMeta?.process_group?.id);
    const itemDraftStages = item.lanes.flatMap((lane) => lane.stages.filter((candidate) => candidate.kind === 'draft'));
    const applyExistingRunContext = (candidate: any) => {
      if (!runRow) return candidate;
      const candidateMetadata = parseObject(candidate?.metadata);
      const candidateRecurrence = parseObject(candidate?.recurrence_info);
      const processGroupId = targetGroupId || runGroupId || normalizeText(candidate?.process_group_id || candidateMetadata?.process_group_id);
      const processGroupName = normalizeText(candidate?.process_group_name || candidateMetadata?.process_group_name || runRow?.process_name || item.title) || 'فرآیند';
      const sourceTemplateId = normalizeText(candidate?.source_template_id || candidateMetadata?.source_template_id || item.templateId || runRow?.template_id || runMetadata?.source_template_id);
      const sourceTemplateName = normalizeText(candidate?.source_template_name || candidateMetadata?.source_template_name || item.templateTitle || runRow?.template_name || runMetadata?.source_template_name);
      return {
        ...candidate,
        process_group_id: processGroupId || candidate?.process_group_id || null,
        process_group_name: processGroupName,
        source_template_id: sourceTemplateId || null,
        source_template_name: sourceTemplateName || null,
        process_run_id: itemRunId || candidate?.process_run_id || null,
        metadata: {
          ...candidateMetadata,
          ...(processGroupId ? { process_group_id: processGroupId } : {}),
          process_group_name: processGroupName,
          process_run_id: itemRunId || candidateMetadata?.process_run_id || null,
          source_template_id: sourceTemplateId || candidateMetadata?.source_template_id || null,
          source_template_name: sourceTemplateName || candidateMetadata?.source_template_name || null,
        },
        recurrence_info: {
          ...candidateRecurrence,
          process_run_id: itemRunId || candidateRecurrence?.process_run_id || null,
        },
      };
    };
    const sourceDraftStagesBase = resolveRawDraftStagesForV2Stages(itemDraftStages, targetGroupId).map(applyExistingRunContext);
    const targetDraftStagesBase = resolveRawDraftStagesForV2Stages([stage], targetGroupId).map(applyExistingRunContext);
    const targetRawStage = targetDraftStagesBase[0] || sourceStage;
    const targetStageId = normalizeText(
      targetRawStage?.process_node_key
      || targetRawStage?.[PROCESS_NODE_KEY]
      || targetRawStage?.template_stage_id
      || targetRawStage?.id
      || stage.id,
    );
    const targetIdentityIds = new Set(collectRawStageIdentityIds(targetRawStage, 0));
    const sourceDraftStages = sourceDraftStagesBase.map((candidate: any, index: number) => {
      const candidateMatchesTarget = collectRawStageIdentityIds(candidate, index).some((id) => targetIdentityIds.has(id))
        || normalizeText(candidate?.process_node_key || candidate?.[PROCESS_NODE_KEY]) === targetStageId
        || normalizeText(candidate?.template_stage_id) === targetStageId
        || normalizeText(candidate?.id) === targetStageId;
      if (!candidateMatchesTarget || !overrides) return candidate;
      const candidateMetadata = parseObject(candidate?.metadata);
      const candidateRecurrence = parseObject(candidate?.recurrence_info);
      return {
        ...candidate,
        ...overrides,
        recurrence_info: {
          ...candidateRecurrence,
          ...(overrides.recurrence_info && typeof overrides.recurrence_info === 'object' ? overrides.recurrence_info : {}),
        },
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
        // ارجاع تک‌مرحله‌ای باید همان پیش‌نویس را به فعالیت تبدیل کند، نه اینکه
        // یک فعالیت موازی در ردیف دیگری بسازد و پیش‌نویس را باقی بگذارد.
        await removeDraftSourceForV2Stages([stage]);
        setCardOverrides((current) => {
          const next = { ...current };
          delete next[cardKey(item)];
          return next;
        });
        message.success(`${toPersianNumber(result.createdCount)} فعالیت ایجاد شد`);
      } else if (Number(result.missingAssigneeCount || 0) > 0) {
        message.warning('این مرحله مسئول مشخص ندارد و ارجاع نشد');
      } else if (result.skippedCount > 0) {
        message.warning('برای این مرحله فعالیت مرتبط از قبل وجود دارد یا قابل ایجاد نیست');
      } else {
        message.warning('فعالیتی برای این مرحله ایجاد نشد. تنظیمات مرحله را بررسی کنید.');
      }
      await refresh(true);
      const createdTaskId = Array.isArray(result.createdTasks)
        ? normalizeText(result.createdTasks[0]?.id)
        : '';
      markRuntimeModuleListsChanged({ taskId: createdTaskId || undefined });
      return result;
    } catch (error: any) {
      message.error(normalizeText(error?.message || error?.details) || 'ارجاع خودکار مرحله ناموفق بود');
      return { createdCount: 0, skippedCount: 0, groupIds: [], createdTasks: [] };
    } finally {
      setAutoAssigningCardIds((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }, [autoAssigningCardIds, cardKey, markRuntimeModuleListsChanged, message, normalizedModuleId, normalizedRecordId, recordData, refresh, removeDraftSourceForV2Stages, resolveRawDraftStagesForV2Stages]);

  const mergeDraftStageOverrides = useCallback((rawStage: any, overrides?: Record<string, any>) => {
    const patch = overrides && typeof overrides === 'object' ? overrides : {};
    const currentMetadata = parseObject(rawStage?.metadata);
    const patchMetadata = parseObject(patch?.metadata);
    const currentRecurrence = parseObject(rawStage?.recurrence_info);
    const patchRecurrence = parseObject(patch?.recurrence_info);
    const nextName = normalizeText(patch?.stage_name || patch?.name || rawStage?.stage_name || rawStage?.name || currentMetadata?.stage_name || currentMetadata?.name) || 'مرحله';
    const nextTaskType = normalizeText(patch?.task_type || patchMetadata?.task_type || rawStage?.task_type || currentMetadata?.task_type);
    const nextAssigneeUserId = normalizeDbUuid(patch?.default_assignee_id || patch?.assignee_id || rawStage?.default_assignee_id || rawStage?.assignee_id);
    const nextAssigneeRoleId = normalizeDbUuid(patch?.default_assignee_role_id || patch?.assignee_role_id || rawStage?.default_assignee_role_id || rawStage?.assignee_role_id);
    const patchHasConcreteAssignee = Boolean(
      normalizeDbUuid(patch?.default_assignee_id || patch?.assignee_id)
      || normalizeDbUuid(patch?.default_assignee_role_id || patch?.assignee_role_id)
    );
    const nextAssigneeField = patchHasConcreteAssignee
      ? ''
      : findProcessAssigneeFieldReference(
          patch?.default_assignee_field,
          patchMetadata?.default_assignee_field,
          patch?.default_assignee_combo,
          patchMetadata?.default_assignee_combo,
          patch?.default_assignee_id,
          patch?.assignee_id,
          patch?.default_assignee_role_id,
          patch?.assignee_role_id,
          rawStage?.default_assignee_field,
          currentMetadata?.default_assignee_field,
          rawStage?.default_assignee_combo,
          currentMetadata?.default_assignee_combo,
          rawStage?.default_assignee_id,
          rawStage?.assignee_id,
          rawStage?.default_assignee_role_id,
          rawStage?.assignee_role_id,
        );
    const nextCustomValues = patch?.process_task_custom_field_values || patch?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] || patchMetadata?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY];
    const nextMetadata = {
      ...currentMetadata,
      ...patchMetadata,
      name: nextName,
      stage_name: nextName,
      task_type: nextTaskType || null,
      description: patch?.description ?? patchMetadata?.description ?? currentMetadata?.description ?? null,
      tags: Array.isArray(patch?.tags) ? patch.tags : (Array.isArray(patchMetadata?.tags) ? patchMetadata.tags : currentMetadata?.tags),
      wage: Number(patch?.wage ?? patchMetadata?.wage ?? rawStage?.wage ?? currentMetadata?.wage ?? 0) || 0,
      weight: Number(patch?.weight ?? patchMetadata?.weight ?? rawStage?.weight ?? currentMetadata?.weight ?? 0) || 0,
      default_assignee_field: nextAssigneeField || null,
      ...(nextCustomValues && typeof nextCustomValues === 'object' ? { [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: nextCustomValues } : {}),
    };
    const nextRecurrence = {
      ...currentRecurrence,
      ...patchRecurrence,
      ...(nextCustomValues && typeof nextCustomValues === 'object' ? { [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: nextCustomValues } : {}),
    };
    return {
      ...rawStage,
      ...patch,
      id: rawStage?.id,
      name: nextName,
      stage_name: nextName,
      task_type: nextTaskType || rawStage?.task_type || null,
      default_assignee_id: nextAssigneeRoleId ? null : (nextAssigneeUserId || null),
      default_assignee_role_id: nextAssigneeRoleId || null,
      default_assignee_field: nextAssigneeField || null,
      assignee_id: nextAssigneeRoleId ? null : (nextAssigneeUserId || null),
      assignee_role_id: nextAssigneeRoleId || null,
      wage: Number(patch?.wage ?? rawStage?.wage ?? 0) || 0,
      weight: Number(patch?.weight ?? rawStage?.weight ?? currentMetadata?.weight ?? 0) || 0,
      recurrence_info: nextRecurrence,
      metadata: nextMetadata,
    };
  }, []);

  const handleSaveDraftStage = useCallback(async (
    stage: ProcessV2Stage,
    laneTitle: string,
    item: ProcessV2CardData,
    overrides?: Record<string, any>,
  ) => {
    const source = stage.source && typeof stage.source === 'object' ? stage.source : {};
    const runStageId = getRunStageIdForDraftStage(stage);
    const mergedSource = mergeDraftStageOverrides(source, overrides);

    if (runStageId) {
      const nextMetadata = parseObject(mergedSource?.metadata);
      const nextStageName = normalizeText(mergedSource?.stage_name || mergedSource?.name || stage.title) || 'مرحله';
      const nextAssigneeUserId = normalizeDbUuid(mergedSource?.default_assignee_id || mergedSource?.assignee_id);
      const nextAssigneeRoleId = normalizeDbUuid(mergedSource?.default_assignee_role_id || mergedSource?.assignee_role_id);
      const updatePatch = {
        stage_name: nextStageName,
        assignee_user_id: nextAssigneeRoleId ? null : (nextAssigneeUserId || null),
        assignee_role_id: nextAssigneeRoleId || null,
        wage: Number(mergedSource?.wage || 0) || 0,
        planned_start_at: mergedSource?.start_date || null,
        planned_due_at: mergedSource?.due_date || null,
        metadata: nextMetadata,
        updated_at: new Date().toISOString(),
      };
      const saved = await processV2SaveDraftStageSafely({
        stageId: runStageId,
        stageName: nextStageName,
        assigneeUserId: nextAssigneeUserId,
        assigneeRoleId: nextAssigneeRoleId,
        wage: updatePatch.wage,
        plannedStartAt: updatePatch.planned_start_at,
        plannedDueAt: updatePatch.planned_due_at,
        metadata: nextMetadata,
      });
      const savedStage = parseObject((saved as any)?.stage);
      const runtimePatch = Object.keys(savedStage).length > 0
        ? { ...savedStage, id: savedStage.id || runStageId }
        : updatePatch;
      setCardOverrides({});
      setRuntime((current) => {
        const next = {
          ...current,
          stages: current.stages.map((row: any) => (
            normalizeDbUuid(row?.id || row?.process_run_stage_id) === runStageId
              ? { ...row, ...runtimePatch, id: row?.id || runStageId }
              : row
          )),
        };
        runtimeRef.current = next;
        return next;
      });
      processRuntimeBlockCache.delete(cacheKey);
      markRuntimeModuleListsChanged({ processRunId: item.mode === 'run' ? item.id : undefined });
      return;
    }

    const currentStages = Array.isArray(directDraftStagesRef.current) ? directDraftStagesRef.current : [];
    let matched = false;
    const nextStages = currentStages.map((candidate, index) => {
      if (!rawStageMatchesV2Stage(candidate, stage, index)) return candidate;
      matched = true;
      return mergeDraftStageOverrides(candidate, overrides);
    });
    if (matched) {
      await persistDraftStageList(nextStages);
      return;
    }

    const ownerModuleId = normalizeText(source?.__process_v2_linked_owner_module_id);
    const ownerRecordId = normalizeDbUuid(source?.__process_v2_linked_owner_record_id);
    const ownerFieldKey = normalizeText(source?.__process_v2_linked_owner_field_key);
    if (ownerModuleId && ownerRecordId && ownerFieldKey) {
      const { data, error } = await (supabase.from(ownerModuleId as any) as any)
        .select(ownerFieldKey)
        .eq('id', ownerRecordId)
        .maybeSingle();
      if (error) throw error;
      const ownerStages = Array.isArray(data?.[ownerFieldKey]) ? data[ownerFieldKey] : [];
      let ownerMatched = false;
      const nextOwnerStages = ownerStages.map((candidate: any, index: number) => {
        if (!rawStageMatchesV2Stage(candidate, stage, index)) return candidate;
        ownerMatched = true;
        return mergeDraftStageOverrides(candidate, overrides);
      });
      if (!ownerMatched) throw new Error('مرحله پیش‌نویس متناظر برای ذخیره پیدا نشد.');
      const { error: updateError } = await (supabase.from(ownerModuleId as any) as any)
        .update({ [ownerFieldKey]: nextOwnerStages })
        .eq('id', ownerRecordId);
      if (updateError) throw updateError;
      processRuntimeBlockCache.delete(cacheKey);
      setLinkedDraftStages((current) => current.map((candidate, index) => (
        rawStageMatchesV2Stage(candidate, stage, index)
          ? {
              ...mergeDraftStageOverrides(candidate, overrides),
              __process_v2_linked_owner_module_id: ownerModuleId,
              __process_v2_linked_owner_record_id: ownerRecordId,
              __process_v2_linked_owner_field_key: ownerFieldKey,
            }
          : candidate
      )));
      markModuleListChanged({
        org_id: orgId || recordDataRef.current?.org_id || null,
        module_id: ownerModuleId,
        record_id: ownerRecordId,
        action: 'update',
        updated_at: new Date().toISOString(),
      });
      return;
    }

    const sourceMetadata = parseObject(source?.metadata);
    const normalizedItemIdForDraftSave = normalizeText(item.id);
    const processGroupId = normalizedItemIdForDraftSave.match(/^(draft|new-run):/)
      ? normalizedItemIdForDraftSave.replace(/^(draft|new-run):/, '')
      : (normalizeText(source?.process_group_id || sourceMetadata?.process_group_id) || createProcessGroupId());
    const processGroupName = normalizeText(source?.process_group_name || sourceMetadata?.process_group_name || item.title) || 'فرآیند پیش نویس';
    const processNodeKey = normalizeText(source?.process_node_key || source?.[PROCESS_NODE_KEY] || sourceMetadata?.process_node_key || sourceMetadata?.[PROCESS_NODE_KEY] || stage.id) || `node_${Date.now()}`;
    const processLaneKey = normalizeText(source?.process_lane_key || source?.[PROCESS_LANE_KEY] || sourceMetadata?.process_lane_key || sourceMetadata?.[PROCESS_LANE_KEY]) || normalizeText(laneTitle) || 'lane_1';
    const itemStageCount = item.lanes.reduce((sum, lane) => sum + lane.stages.length, 0);
    const isNewProcess = itemStageCount <= 1 && /^(draft|new-run):/.test(normalizedItemIdForDraftSave);
    const nextSortOrder = isNewProcess
      ? 10
      : Number.isFinite(Number(stage.layoutSlot))
      ? (Number(stage.layoutSlot) + 1) * 10
      : ((currentStages.length + 1) * 10);
    const itemTemplateId = item.mode === 'run' ? item.templateId : '';
    const itemTemplateTitle = item.mode === 'run' ? item.templateTitle : '';
    const baseDraftStage = {
      ...source,
      id: normalizeText(source?.id) || stage.id || `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: normalizeText(source?.name || source?.stage_name || stage.title) || 'مرحله',
      stage_name: normalizeText(source?.stage_name || source?.name || stage.title) || 'مرحله',
      status: 'draft',
      is_draft: true,
      sort_order: Number(source?.sort_order || nextSortOrder),
      process_group_id: processGroupId,
      process_group_name: processGroupName,
      source_template_id: normalizeText(source?.source_template_id || itemTemplateId) || null,
      source_template_name: normalizeText(source?.source_template_name || itemTemplateTitle) || null,
      process_node_key: processNodeKey,
      process_lane_key: processLaneKey,
      process_created_at: normalizeText(source?.process_created_at || sourceMetadata?.process_created_at) || new Date().toISOString(),
      metadata: {
        ...sourceMetadata,
        process_group_id: processGroupId,
        process_group_name: processGroupName,
        process_node_key: processNodeKey,
        process_lane_key: processLaneKey,
        process_created_at: normalizeText(source?.process_created_at || sourceMetadata?.process_created_at) || new Date().toISOString(),
      },
    };
    const nextDraftStage = mergeDraftStageOverrides(baseDraftStage, overrides);
    const shiftedExistingStages = isNewProcess
      ? currentStages.map((candidate: any, index: number) => ({
          ...candidate,
          sort_order: Number(candidate?.sort_order || ((index + 1) * 10)) + 20,
        }))
      : currentStages;
    await persistDraftStageList([...shiftedExistingStages, nextDraftStage].sort((a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0)));
    if (itemStageCount <= 1) {
      setExtraCards((current) => current.filter((card) => card.id !== item.id));
      setCardOverrides((current) => {
        const next = { ...current };
        delete next[cardKey(item)];
        return next;
      });
    }
    markRuntimeModuleListsChanged({ templateId: item.mode === 'run' ? item.templateId : undefined });
  }, [
    cardKey,
    cacheKey,
    getRunStageIdForDraftStage,
    markRuntimeModuleListsChanged,
    mergeDraftStageOverrides,
    orgId,
    persistDraftStageList,
  ]);

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

  const handleOpenStageDetails = useCallback(async (stage: ProcessV2Stage) => {
    if (
      isProcessTemplateModule(normalizedModuleId)
      && stage.kind === 'draft'
      && typeof window !== 'undefined'
    ) {
      window.dispatchEvent(new CustomEvent('kalamapp:open-process-template-stage', {
        detail: {
          moduleId: normalizedModuleId,
          recordId: normalizedRecordId,
          stageId: normalizeText(stage.source?.template_stage_id || stage.source?.id || stage.id),
          stage: stage.source || stage,
          tab: 'stage',
        },
      }));
      return true;
    }
    const source = stage.source && typeof stage.source === 'object' ? stage.source : {};
    const sourceMetadata = parseObject(source?.metadata);
    const taskId = normalizeDbUuid(
      source?.task_id
      || source?.process_task_id
      || (stage.kind === 'activity' ? source?.id : '')
      || sourceMetadata?.task_id,
    );
    const runStageId = normalizeDbUuid(
      source?.process_run_stage_id
      || source?.run_stage_id
      || (stage.kind === 'draft' ? source?.id : '')
      || stage.id,
    );
    if (!taskId && !runStageId) return stage;

    const context = await loadProcessTaskModalContext(supabase, source, {
      taskId: taskId || null,
      processRunStageId: runStageId || null,
    });
    return {
      ...stage,
      title: normalizeText(context?.name || context?.stage_name) || stage.title,
      activityTypeLabel: normalizeText(context?.task_type) || stage.activityTypeLabel,
      source: {
        ...source,
        ...context,
        process_run_stage_id: context?.process_run_stage_id || runStageId || source?.process_run_stage_id,
      },
    } as ProcessV2Stage;
  }, [normalizedModuleId, normalizedRecordId]);

  const hasValidRuntimeRecord = Boolean(enabled && normalizedModuleId && normalizedRecordId);
  const supportsEmptyCreate = (
    variant === 'full'
    && !isProcessTemplateModule(normalizedModuleId)
    && !isProcessRunModule(normalizedModuleId)
  );
  const surfaceMode = resolveProcessRuntimeSurfaceMode({
    variant,
    hasValidRecord: hasValidRuntimeRecord,
    hasLoadedRuntime,
    loading,
    waitingForContext: waitingForTemplateContext,
    hasError: Boolean(errorText),
    // فرآیندهای تکمیل‌شده در حالت جمع‌شده هم دادهٔ معتبر هستند؛ اگر همهٔ کارت‌ها
    // تکمیل شده باشند، سطح خالی نباید toggle بازگرداندن آن‌ها را پنهان کند.
    cardCount: allDisplayCards.length,
  });
  const stageDeleteHasTask = Boolean(stageDeleteRequest && getTaskIdForProcessStage(stageDeleteRequest.stage));
  const bulkDeleteStages = getBulkDeleteStages(bulkDeleteRequest);
  const bulkDeleteHasTask = bulkDeleteStages.some((stage) => Boolean(getTaskIdForProcessStage(stage)));
  const bulkDeleteTitle = bulkDeleteRequest?.kind === 'lane' ? 'حذف ردیف فرآیند' : 'حذف فرآیند';
  const bulkDeleteSubject = bulkDeleteRequest?.kind === 'lane'
    ? (bulkDeleteRequest.lane?.title || 'این ردیف')
    : (bulkDeleteRequest?.process.title || 'این فرآیند');
  if (surfaceMode === 'hidden') return null;

  return (
    <div className={variant === 'full' ? 'mt-5' : 'mt-0'} dir="rtl">
      {errorText ? (
        <Alert type="warning" showIcon message={errorText} className="mb-3 !rounded-xl" />
      ) : null}
      {surfaceMode === 'loading' ? (
        <Skeleton active title={variant === 'full'} paragraph={{ rows: readOnlyVariant ? 1 : 3 }} />
      ) : surfaceMode === 'error' ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-5 text-center dark:border-amber-400/20 dark:bg-amber-400/[0.04]">
          <div className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">
            نمایش فرآیندهای این رکورد کامل نشد.
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              className="!rounded-full !px-5"
              loading={loading}
              onClick={() => {
                void refresh(true);
                if (draftLoadErrorText) void onDraftLoadRetry?.();
              }}
            >
              تلاش دوباره
            </Button>
            {supportsEmptyCreate ? (
              <Button
                type="primary"
                className="kalam-btn-brand !rounded-full !px-5"
                onClick={handleAddRun}
              >
                ایجاد فرآیند جدید
              </Button>
            ) : null}
          </div>
        </div>
      ) : surfaceMode === 'empty' ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-center dark:border-white/10 dark:bg-white/[0.025]">
          <div className="mb-3 text-sm font-bold text-slate-600 dark:text-slate-200">
            {supportsEmptyCreate
              ? 'برای این رکورد هنوز فرآیندی ثبت نشده است.'
              : 'هنوز اطلاعاتی برای نمایش در این فرآیند ثبت نشده است.'}
          </div>
          {supportsEmptyCreate ? (
            <Button
              type="primary"
              className="kalam-btn-brand !rounded-full !px-5"
              onClick={handleAddRun}
            >
              ایجاد فرآیند جدید
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {completedCards.length > 0 ? (
            <div className="flex justify-end">
              <Button type="link" size="small" onClick={() => setShowCompletedProcesses((current) => !current)}>
                {getCompletedProcessesToggleLabel(completedCards.length, showCompletedProcesses)}
              </Button>
            </div>
          ) : null}
          {displayCards.map((card) => {
            const key = cardKey(card);
            return (
              <div
                key={key}
                ref={(node) => {
                  if (node) cardElementRefs.current.set(key, node);
                  else cardElementRefs.current.delete(key);
                }}
              >
                <ProcessCardsV2
                  item={card}
                  templates={templates}
                  variant={variant}
                  onChange={handleCardChange}
                  onStageTransfer={(payload, laneId, slot) => {
                    void handleDraftStageTransfer(payload, card, laneId, slot);
                  }}
                  onStageStatusChange={handleStageStatusChange}
                  onDelete={handleDeleteCard}
                  onDeleteLane={handleDeleteLane}
                  onDeleteStage={handleDeleteStage}
                  onCopy={handleCopyCard}
                  onAddRun={handleAddRun}
                  onShowInfo={handleShowInfo}
                  onShowHistory={handleShowHistory}
                  onShowRecords={handleShowRecords}
                  onTemplateChange={handleTemplateChange}
                  onAutoAssignProcess={isProcessTemplateModule(normalizedModuleId) ? undefined : handleAutoAssignProcess}
                  onAutoAssignStage={isProcessTemplateModule(normalizedModuleId) ? undefined : handleAutoAssignStage}
                  onSaveDraftStage={handleSaveDraftStage}
                  onOpenStageDetails={handleOpenStageDetails}
                  onConfigureActivator={
                    isProcessTemplateModule(normalizedModuleId) && variant === 'full'
                      ? handleConfigureTemplateActivator
                      : undefined
                  }
                  autoAssigning={Boolean(autoAssigningCardIds[key])}
                  canAutoAssign={!isProcessTemplateModule(normalizedModuleId) && card.lanes.some((lane) => lane.stages.some((stage) => stage.kind === 'draft'))}
                  highlightedStageIds={getHighlightedStageIds(card)}
                  templateVariableOptions={templateVariableOptions}
                />
              </div>
            );
          })}
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
      <Modal
        open={Boolean(stageDeleteRequest)}
        title="حذف مرحله فرآیند"
        footer={null}
        centered
        zIndex={32000}
        destroyOnHidden
        onCancel={() => {
          if (!stageDeleteBusy) setStageDeleteRequest(null);
        }}
      >
        <div className="space-y-3 text-right" dir="rtl">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {stageDeleteRequest?.stage.title || 'این مرحله'} چگونه حذف شود؟
          </div>
          {stageDeleteHasTask ? (
            <div className="space-y-2">
              <Button
                block
                className="!h-auto !justify-start !rounded-xl !py-3 !text-right"
                loading={stageDeleteBusy === 'unlink'}
                disabled={stageDeleteBusy !== null}
                onClick={() => void handleStageDeleteChoice('unlink')}
              >
                <span className="block w-full">
                  <span className="block font-bold">اتصال فعالیت از این فرآیند حذف شود</span>
                  <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
                    فعالیت باقی می‌ماند، اما دیگر در این فرآیند نمایش داده نمی‌شود.
                  </span>
                </span>
              </Button>
              <Button
                block
                className="!h-auto !justify-start !rounded-xl !py-3 !text-right"
                loading={stageDeleteBusy === 'delete_task_keep_draft'}
                disabled={stageDeleteBusy !== null}
                onClick={() => void handleStageDeleteChoice('delete_task_keep_draft')}
              >
                <span className="block w-full">
                  <span className="block font-bold">فعالیت حذف شود و مرحله پیش‌نویس باقی بماند</span>
                  <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
                    فعالیت به سطل بازیافت می‌رود و این مرحله دوباره به حالت پیش‌نویس برمی‌گردد.
                  </span>
                </span>
              </Button>
              <Button
                block
                danger
                className="!h-auto !justify-start !rounded-xl !py-3 !text-right"
                loading={stageDeleteBusy === 'delete_all'}
                disabled={stageDeleteBusy !== null}
                onClick={() => void handleStageDeleteChoice('delete_all')}
              >
                <span className="block w-full">
                  <span className="block font-bold">فعالیت و پیش‌نویس کامل حذف شوند</span>
                  <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
                    فعالیت و جایگاه این مرحله از فرآیند حذف می‌شوند و با refresh دوباره از الگو برنمی‌گردند.
                  </span>
                </span>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                این مرحله هنوز فعالیت واقعی ندارد و فقط مرحله پیش‌نویس حذف می‌شود.
              </div>
              <Button
                block
                danger
                className="!h-auto !justify-start !rounded-xl !py-3 !text-right"
                loading={stageDeleteBusy === 'delete_all'}
                disabled={stageDeleteBusy !== null}
                onClick={() => void handleStageDeleteChoice('delete_all')}
              >
                حذف مرحله پیش‌نویس
              </Button>
            </div>
          )}
        </div>
      </Modal>
      <Modal
        open={Boolean(bulkDeleteRequest)}
        title={bulkDeleteTitle}
        footer={null}
        centered
        zIndex={32000}
        destroyOnHidden
        onCancel={() => {
          if (!bulkDeleteBusy) setBulkDeleteRequest(null);
        }}
      >
        <div className="space-y-3 text-right" dir="rtl">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {bulkDeleteSubject} چگونه حذف شود؟
          </div>
          {bulkDeleteHasTask ? (
            <div className="space-y-2">
              <Button
                block
                className="!h-auto !justify-start !rounded-xl !py-3 !text-right"
                loading={bulkDeleteBusy === 'unlink'}
                disabled={bulkDeleteBusy !== null}
                onClick={() => void handleBulkDeleteChoice('unlink')}
              >
                <span className="block w-full">
                  <span className="block font-bold">اتصال فعالیت‌ها از این فرآیند حذف شود</span>
                  <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
                    فعالیت‌ها باقی می‌مانند، اما دیگر در این ردیف/فرآیند نمایش داده نمی‌شوند.
                  </span>
                </span>
              </Button>
              <Button
                block
                className="!h-auto !justify-start !rounded-xl !py-3 !text-right"
                loading={bulkDeleteBusy === 'delete_task_keep_draft'}
                disabled={bulkDeleteBusy !== null}
                onClick={() => void handleBulkDeleteChoice('delete_task_keep_draft')}
              >
                <span className="block w-full">
                  <span className="block font-bold">فعالیت‌ها حذف شوند و مرحله‌ها پیش‌نویس بمانند</span>
                  <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
                    فعالیت‌ها به سطل بازیافت می‌روند و مرحله‌های این بخش به حالت پیش‌نویس برمی‌گردند.
                  </span>
                </span>
              </Button>
              <Button
                block
                danger
                className="!h-auto !justify-start !rounded-xl !py-3 !text-right"
                loading={bulkDeleteBusy === 'delete_all'}
                disabled={bulkDeleteBusy !== null}
                onClick={() => void handleBulkDeleteChoice('delete_all')}
              >
                <span className="block w-full">
                  <span className="block font-bold">فعالیت‌ها و مرحله‌ها کامل حذف شوند</span>
                  <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
                    فعالیت‌ها و جایگاه مرحله‌های این بخش حذف می‌شوند و با refresh دوباره از الگو برنمی‌گردند.
                  </span>
                </span>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                این بخش فعالیت واقعی ندارد و فقط مرحله‌های پیش‌نویس حذف می‌شوند.
              </div>
              <Button
                block
                danger
                className="!h-auto !justify-start !rounded-xl !py-3 !text-right"
                loading={bulkDeleteBusy === 'delete_all'}
                disabled={bulkDeleteBusy !== null}
                onClick={() => void handleBulkDeleteChoice('delete_all')}
              >
                حذف مرحله‌های پیش‌نویس
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default memo(ProcessCardsV2RuntimeBlock);
