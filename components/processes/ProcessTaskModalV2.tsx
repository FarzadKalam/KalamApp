import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { App, Badge, Button, Input, Modal, Switch, Tag, Tooltip } from 'antd';
import {
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  LockOutlined,
  LinkOutlined,
  MessageOutlined,
  OrderedListOutlined,
  PlusOutlined,
  ReadOutlined,
  ShareAltOutlined,
  StarFilled,
  StarOutlined,
  UnlockOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { Link, useInRouterContext } from 'react-router-dom';
import AdaptiveSelectField from '../AdaptiveSelectField';
import AdaptiveIdentityPicker from '../AdaptiveIdentityPicker';
import DynamicSelectField from '../DynamicSelectField';
import SmartFieldRenderer from '../SmartFieldRenderer';
import FileExtensionTile from '../files/FileExtensionTile';
import RecordImageBox from '../RecordImageBox';
import ResilientImage from '../common/ResilientImage';
import AssigneeAvatarDisplay from '../common/AssigneeAvatarDisplay';
import ActivityPanel from '../Sidebar/ActivityPanel';
import AssistantPanel from '../ai/AssistantPanel';
import AiSparkleIcon from '../ai/AiSparkleIcon';
import TaskInstructionsModal from '../tasks/TaskInstructionsModal';
import { AI_CONTEXT_EVENT, type AssistantContext } from '../../utils/aiAssistantEvents';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { FieldNature, FieldType, type ModuleField } from '../../types';
import {
  getProcessTaskCustomFieldValuesFromRecurrence,
  getProcessTaskCustomFieldsFromRecurrence,
  getProcessTaskCustomFieldsFromStage,
  applyProcessLinkedRelationValues,
  mergeProcessLinksFromLinkedRelationValues,
  mergeProcessTaskCustomFieldValues,
  normalizeProcessTaskCustomFields,
  PROCESS_TASK_CUSTOM_FIELDS_KEY,
  PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY,
} from '../../utils/processTaskCustomFields';
import {
  getProcessTaskStatusOptionsFromStage,
  getTaskStatusIconKey,
  getTaskStatusOptions,
  getTaskStatusSwatchColor,
} from '../../utils/processTaskStatusOptions';
import TaskStatusActionStrip from '../tasks/TaskStatusActionStrip';
import { invalidateFileManagerFolderCaches, loadRecordFileItems, type FileManagerListItem } from '../../utils/fileManagerQueries';
import { FILE_STORAGE_BUCKET, fileStorageClient } from '../../utils/storageClient';
import { isUploadCanceledError, uploadFileWithProgress } from '../../utils/uploadFileWithProgress';
import { createFileManagerOriginForUpload, detectFileManagerTables } from '../../utils/fileManagerService';
import { buildImagePreviewUrl } from '../../utils/imagePreview';
import { parseProcessLinkMap } from '../../utils/processTargets';
import { fetchRecordReferenceLabels, buildRecordReferenceKey } from '../../utils/recordReference';
import {
  getInstructionIdsFromStage,
  getInstructionIdsFromTask,
  instructionStatusOptions,
  normalizeInstructionIdList,
} from '../../utils/instructionSupport';
import { updateTaskStatusWithAutomation } from '../../utils/taskUpdateRuntime';
import { syncProcessRunStageFromTask } from '../../utils/processRunRuntime';
import { patchProcessTaskCustomFieldValues } from '../../utils/processTaskCustomFieldPersistence';
import { moveModuleRecordsToRecycleBin } from '../../utils/recycleBin';
import { MODULES } from '../../moduleRegistry';
import { supabase } from '../../supabaseClient';
import { fetchDynamicOptionsByCategory } from '../../utils/referenceData';
import { searchIdentityOptions } from '../../utils/identityDirectory';
import { buildTaskSourcePatch, getMergedTaskTypeOptions } from '../../utils/taskMeta';
import { buildAssigneeSelectValue, parseAssigneeValue } from '../../utils/assigneeValue';
import { resolveSelectPopupContainer } from '../../utils/popupContainer';
import { renderProcessV2TemplateValueFromRecord } from '../../utils/processV2AutoAssign';
import { resolveProcessAssigneeReference } from '../../utils/processAssigneeReference';
import {
  formatProcessStageDueLabel,
  getProcessTaskCustomFieldLabelFa,
} from '../../utils/processStageCardLabels';
import TagInput from '../TagInput';
import TaskRelatedProcessBar from '../tasks/TaskRelatedProcessBar';
import type { ProcessV2CardData, ProcessV2Stage, ProcessV2TemplateOption } from './ProcessCardsV2';

type ProcessTaskModalV2Props = {
  open: boolean;
  process: ProcessV2CardData;
  stage: ProcessV2Stage | null;
  laneTitle?: string | null;
  templates?: ProcessV2TemplateOption[];
  onClose: () => void;
  onStageStatusChange?: (stageId: string, status: string, sourcePatch?: Record<string, any>) => void;
  onCreateDraftActivity?: (overrides?: Record<string, any>) => any | Promise<any>;
  onSaveDraftActivity?: (overrides?: Record<string, any>) => any | Promise<any>;
};

type MockCustomField = {
  key: string;
  label: string;
  value: any;
  type: FieldType;
  field?: ModuleField;
  options?: Array<{ value: string; label: string; color?: string }>;
  requiredForCompletion?: boolean;
  requiredForCreation?: boolean;
};
type ModalFileItem = {
  id: string;
  title: string;
  meta: string;
  fileType: 'image' | 'video' | 'file';
  mimeType: string | null;
  fileUrl: string;
  starred: boolean;
  entryId?: string | null;
};
type RelatedRecordRow = {
  label: string;
  value: string;
  moduleId: string;
  recordId: string;
};
type TagItem = { id: string; title: string; color: string };

const CREATION_DRAFT_STORAGE_PREFIX = 'process-task-modal-v2:create-draft';

const buildCreationDraftStorageKey = (process: ProcessV2CardData, stage: ProcessV2Stage | null) => {
  const source = stage?.source && typeof stage.source === 'object' ? stage.source as Record<string, any> : {};
  const sourceMetadata = parseObject(source?.metadata);
  const processKey = String(
    process?.id
    || ('runId' in process ? process.runId : '')
    || process?.title
    || ''
  ).trim();
  const stageKey = String(
    stage?.id
    || source?.template_stage_id
    || source?.process_node_key
    || sourceMetadata?.process_node_key
    || source?.id
    || ''
  ).trim();
  if (!processKey || !stageKey) return '';
  return `${CREATION_DRAFT_STORAGE_PREFIX}:${processKey}:${stageKey}`;
};

const readCreationDraftSnapshot = (storageKey: string): Record<string, any> | null => {
  if (!storageKey || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const writeCreationDraftSnapshot = (storageKey: string, snapshot: Record<string, any>) => {
  if (!storageKey || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({
      ...snapshot,
      savedAt: new Date().toISOString(),
    }));
  } catch {
    // localStorage can be unavailable in private browsing or quota-constrained contexts.
  }
};

const clearCreationDraftSnapshot = (storageKey: string) => {
  if (!storageKey || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage cleanup failures.
  }
};

const statusOptions = [
  { value: 'draft', label: 'پیش نویس', icon: 'file' },
  { value: 'waiting', label: 'شروع نشده', icon: 'clock' },
  { value: 'active', label: 'در حال انجام', icon: 'play' },
  { value: 'review', label: 'بازبینی', icon: 'audit' },
  { value: 'done', label: 'تکمیل شده', icon: 'approve' },
  { value: 'blocked', label: 'متوقف', icon: 'stop' },
  { value: 'canceled', label: 'لغو شده', icon: 'cancel' },
];

const statusLabel: Record<string, string> = {
  draft: 'پیش نویس',
  waiting: 'شروع نشده',
  active: 'در حال انجام',
  review: 'بازبینی',
  done: 'تکمیل شده',
  blocked: 'متوقف',
  canceled: 'لغو شده',
};

const statusColor: Record<string, string> = {
  draft: '#64748b',
  waiting: '#dc2626',
  active: '#2563eb',
  review: '#f97316',
  done: '#16a34a',
  blocked: '#dc2626',
  canceled: '#64748b',
};

const statusTagClass: Record<string, string> = {
  draft: '!border-slate-300 !bg-slate-100 !text-slate-600 dark:!border-slate-600 dark:!bg-white/10 dark:!text-slate-200',
  waiting: '!border-red-200 !bg-red-50 !text-red-700 dark:!border-red-700/50 dark:!bg-red-500/10 dark:!text-red-200',
  active: '!border-blue-200 !bg-blue-50 !text-blue-700 dark:!border-blue-700/50 dark:!bg-blue-500/10 dark:!text-blue-200',
  review: '!border-orange-200 !bg-orange-50 !text-orange-700 dark:!border-orange-700/50 dark:!bg-orange-500/10 dark:!text-orange-200',
  done: '!border-green-200 !bg-green-50 !text-green-700 dark:!border-green-700/50 dark:!bg-green-500/10 dark:!text-green-200',
  blocked: '!border-rose-200 !bg-rose-50 !text-rose-700 dark:!border-rose-700/50 dark:!bg-rose-500/10 dark:!text-rose-200',
  canceled: '!border-slate-300 !bg-slate-100 !text-slate-600 dark:!border-slate-600 dark:!bg-white/10 dark:!text-slate-200',
};

const normalizeTaskTags = (value: any): TagItem[] => (
  (Array.isArray(value) ? value : [])
    .map((tag: any) => {
      const title = String(tag?.title || tag?.label || tag?.name || tag || '').trim();
      const id = String(tag?.id || title).trim();
      if (!id || !title) return null;
      return {
        id,
        title,
        color: String(tag?.color || '#1677ff').trim() || '#1677ff',
      };
    })
    .filter(Boolean) as TagItem[]
);

const getTaskField = (fieldKey: string) => (
  (MODULES.tasks?.fields || []).find((field: any) => String(field?.key || '').trim() === fieldKey) as ModuleField | undefined
);

const UUID_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeDbUuid = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const stripped = raw.replace(/^(process_run_stage|process_run|process_template_stage|process_template|task):/i, '');
  return UUID_LIKE_RE.test(stripped) ? stripped : '';
};

const parseObject = (value: any): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const stringifyFieldValue = (value: any): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((item) => {
    if (item && typeof item === 'object') return String(item?.id || item?.value || item?.title || item?.label || item?.name || '').trim();
    return stringifyFieldValue(item);
  }).filter(Boolean).join(',');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return String(value?.id || value?.value || value?.label || value?.title || value?.name || '').trim();
  return String(value);
};

const hasOwnValue = (container: any, key: string) => (
  container
  && typeof container === 'object'
  && !Array.isArray(container)
  && Object.prototype.hasOwnProperty.call(container, key)
);

const pickCustomFieldValue = (key: string, containers: any[]) => {
  for (const container of containers) {
    if (hasOwnValue(container, key)) return container[key];
  }
  return undefined;
};

const pickFirstMeaningful = (...values: any[]) => {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    return value;
  }
  return undefined;
};

const mapFieldType = (type: any): MockCustomField['type'] => {
  if (type === FieldType.RELATION) return FieldType.RELATION;
  if (type === FieldType.MULTI_RELATION) return FieldType.MULTI_RELATION;
  if (type === FieldType.USER) return FieldType.RELATION;
  if (type === FieldType.SELECT || type === FieldType.STATUS) return FieldType.SELECT;
  if (type === FieldType.MULTI_SELECT || type === FieldType.TAGS) return FieldType.MULTI_SELECT;
  if (type === FieldType.NUMBER || type === FieldType.PRICE || type === FieldType.PERCENTAGE || type === FieldType.STOCK || type === FieldType.PERCENTAGE_OR_AMOUNT) return FieldType.NUMBER;
  if (type === FieldType.DATE) return FieldType.DATE;
  if (type === FieldType.TIME) return FieldType.TIME;
  if (type === FieldType.DATETIME) return FieldType.DATETIME;
  if (type === FieldType.CHECKBOX) return FieldType.CHECKBOX;
  if (type === FieldType.LONG_TEXT) return FieldType.LONG_TEXT;
  if (type === FieldType.SUPER_LONG_TEXT) return FieldType.SUPER_LONG_TEXT;
  return FieldType.TEXT;
};

const isFieldRequiredForCompletion = (field: any): boolean => {
  if (field?.validation?.required === true) return true;
  const containers = [
    field,
    field?.metadata,
    field?.config,
    field?.validation,
    field?.rules,
  ].filter((item) => item && typeof item === 'object' && !Array.isArray(item));

  return containers.some((item) => (
    item.required_for_completion === true
    || item.requiredForCompletion === true
    || item.completion_required === true
    || item.completionRequired === true
    || item.required_on_complete === true
    || item.requiredOnComplete === true
  ));
};

const isFieldRequiredForCreation = (field: any): boolean => {
  const containers = [
    field,
    field?.metadata,
    field?.config,
    field?.validation,
    field?.rules,
  ].filter((item) => item && typeof item === 'object' && !Array.isArray(item));

  return containers.some((item) => (
    item.required_for_creation === true
    || item.requiredForCreation === true
    || item.creation_required === true
    || item.creationRequired === true
    || item.required_on_create === true
    || item.requiredOnCreate === true
  ));
};

const isEmptyFieldValue = (value: any): boolean => {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

const isEmptyCreationSnapshotValue = (value: any): boolean => {
  if (isEmptyFieldValue(value)) return true;
  if (typeof value !== 'string') return false;
  return ['تعیین نشده', 'انتخاب کنید', 'انتخاب نشده'].includes(value.trim());
};

const buildCustomFields = (stage: ProcessV2Stage | null): MockCustomField[] => {
  const source = stage?.source && typeof stage.source === 'object' ? stage.source : {};
  const sourceMetadata = parseObject(source?.metadata);
  const sourceStage = source?.source_stage && typeof source.source_stage === 'object' ? source.source_stage : {};
  const sourceStageMetadata = parseObject(sourceStage?.metadata);
  const recurrence = parseObject(source?.recurrence_info);
  const sourceStageRecurrence = parseObject(sourceStage?.recurrence_info || sourceStageMetadata?.recurrence_info);
  const templateContext = {
    ...(source?.__process_v2_template_context && typeof source.__process_v2_template_context === 'object' ? source.__process_v2_template_context : {}),
    ...source,
    ...sourceMetadata,
    ...recurrence,
    ...sourceStage,
    ...sourceStageMetadata,
    ...sourceStageRecurrence,
    task_name: stage?.title || source?.name || source?.stage_name || '',
    task_type: source?.task_type || sourceMetadata?.task_type || recurrence?.task_type || sourceStage?.task_type || sourceStageMetadata?.task_type || '',
  };
  const fieldCandidates = [
    ...(stage?.kind === 'draft' ? getProcessTaskCustomFieldsFromStage(source) : []),
    ...getProcessTaskCustomFieldsFromRecurrence(recurrence),
    ...getProcessTaskCustomFieldsFromRecurrence(sourceStageRecurrence),
    ...normalizeProcessTaskCustomFields(source?.[PROCESS_TASK_CUSTOM_FIELDS_KEY] || source?.custom_task_fields),
    ...normalizeProcessTaskCustomFields(sourceMetadata?.[PROCESS_TASK_CUSTOM_FIELDS_KEY] || sourceMetadata?.custom_task_fields),
    ...normalizeProcessTaskCustomFields(sourceStage?.[PROCESS_TASK_CUSTOM_FIELDS_KEY] || sourceStage?.custom_task_fields),
    ...normalizeProcessTaskCustomFields(sourceStageMetadata?.[PROCESS_TASK_CUSTOM_FIELDS_KEY] || sourceStageMetadata?.custom_task_fields),
  ];
  const fieldsByKey = new Map<string, any>();
  fieldCandidates.forEach((field: any) => {
    const key = String(field?.key || '').trim();
    if (key && !fieldsByKey.has(key)) fieldsByKey.set(key, field);
  });
  const rawValues = {
    ...getProcessTaskCustomFieldValuesFromRecurrence(sourceStageRecurrence),
    ...(sourceStage?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] && typeof sourceStage[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] === 'object' ? sourceStage[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] : {}),
    ...(sourceStageMetadata?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] && typeof sourceStageMetadata[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] === 'object' ? sourceStageMetadata[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] : {}),
    ...(sourceStage?.custom_field_values && typeof sourceStage.custom_field_values === 'object' ? sourceStage.custom_field_values : {}),
    ...(sourceStage?.customFields && typeof sourceStage.customFields === 'object' ? sourceStage.customFields : {}),
    ...(sourceStageMetadata?.custom_field_values && typeof sourceStageMetadata.custom_field_values === 'object' ? sourceStageMetadata.custom_field_values : {}),
    ...(sourceStageMetadata?.customFields && typeof sourceStageMetadata.customFields === 'object' ? sourceStageMetadata.customFields : {}),
    ...(sourceMetadata?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] && typeof sourceMetadata[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] === 'object' ? sourceMetadata[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] : {}),
    ...(sourceMetadata?.custom_field_values && typeof sourceMetadata.custom_field_values === 'object' ? sourceMetadata.custom_field_values : {}),
    ...(sourceMetadata?.customFields && typeof sourceMetadata.customFields === 'object' ? sourceMetadata.customFields : {}),
    ...(source?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] && typeof source[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] === 'object' ? source[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] : {}),
    ...(source?.custom_field_values && typeof source.custom_field_values === 'object' ? source.custom_field_values : {}),
    ...(source?.customFields && typeof source.customFields === 'object' ? source.customFields : {}),
    ...getProcessTaskCustomFieldValuesFromRecurrence(recurrence),
    ...(recurrence?.custom_field_values && typeof recurrence.custom_field_values === 'object' ? recurrence.custom_field_values : {}),
    ...(recurrence?.customFields && typeof recurrence.customFields === 'object' ? recurrence.customFields : {}),
  };
  Object.keys(rawValues).forEach((key) => {
    if (!fieldsByKey.has(key)) {
      fieldsByKey.set(key, {
        key,
        type: FieldType.TEXT,
        labels: { fa: key, en: key },
      });
    }
  });
  const fields = Array.from(fieldsByKey.values());
  const fallbackValues = fields.reduce<Record<string, any>>((acc, field: any) => {
    const key = String(field?.key || '').trim();
    if (!key) return acc;
    const value = pickCustomFieldValue(key, [
      recurrence,
      source,
      sourceMetadata,
      sourceStageRecurrence,
      sourceStage,
      sourceStageMetadata,
    ]);
    if (value !== undefined) acc[key] = value;
    return acc;
  }, {});
  const processLinks = [
    source?.process_links,
    source?.process_link_map,
    sourceMetadata?.process_links,
    sourceMetadata?.process_link_map,
    recurrence?.process_links,
    sourceStage?.process_links,
    sourceStage?.process_link_map,
    sourceStageMetadata?.process_links,
    sourceStageMetadata?.process_link_map,
    sourceStageRecurrence?.process_links,
  ].reduce<Record<string, string>>((links, value) => ({ ...links, ...parseProcessLinkMap(value) }), {});
  const values = applyProcessLinkedRelationValues(fields, mergeProcessTaskCustomFieldValues(fields, {
    ...rawValues,
    ...fallbackValues,
  }), processLinks);

  return fields.map((field: any, index) => {
    const key = String(field?.key || '').trim();
    const type = mapFieldType(field?.type);
    const label = getProcessTaskCustomFieldLabelFa(field, index, 'tasks');
    const options = Array.isArray(field?.options)
      ? field.options.map((option: any) => ({
        value: String(option?.value ?? option?.label ?? '').trim(),
        label: String(option?.label ?? option?.value ?? '').trim(),
        color: option?.color ? String(option.color) : undefined,
      })).filter((option: any) => option.value && option.label)
      : undefined;
    const relationConfig = type === FieldType.RELATION
      ? (field?.relationConfig || (field?.type === FieldType.USER
        ? { targetModule: 'profiles', targetField: 'full_name' }
        : undefined))
      : field?.relationConfig;
    return {
      key,
      label,
      value: renderProcessV2TemplateValueFromRecord(values[key], templateContext, type),
      type,
      field: {
        ...field,
        key,
        type,
        labels: {
          ...(field?.labels || {}),
          fa: label,
          en: field?.labels?.en || key,
        },
        options,
        relationConfig,
        multiRelationConfig: field?.multiRelationConfig,
        nature: field?.nature || FieldNature.STANDARD,
      } as ModuleField,
      requiredForCompletion: isFieldRequiredForCompletion(field),
      requiredForCreation: isFieldRequiredForCreation(field),
      options,
    };
  });
};

const buildStatusOptions = (stage: ProcessV2Stage | null) => {
  const source = stage?.source && typeof stage.source === 'object' ? stage.source : {};
  const options = stage?.kind === 'draft'
    ? getProcessTaskStatusOptionsFromStage(source)
    : getTaskStatusOptions(source);
  const normalized = (options.length ? options : statusOptions).map((option: any) => ({
    value: String(option?.value || '').trim(),
    label: String(option?.label || option?.value || '').trim(),
    color: option?.color ? String(option.color) : undefined,
    icon: String(option?.icon || '').trim() || getTaskStatusIconKey(option?.value),
    disabled: option?.disabled === true,
  })).filter((option) => option.value && option.label && option.disabled !== true);
  return normalized.length ? normalized : statusOptions;
};

const statusValueToV2 = (stageStatus?: string | null) => {
  const value = String(stageStatus || '').trim();
  if (value === 'active') return 'in_progress';
  if (value === 'done') return 'done';
  if (value === 'waiting') return 'todo';
  return value || 'todo';
};

const mapFileItem = (item: FileManagerListItem): ModalFileItem => ({
  id: String(item.id || item.entry_id || item.asset_id || item.file_url),
  title: String(item.file_name || item.file_url?.split('/').pop() || 'فایل').trim(),
  meta: item.file_type === 'image' ? 'تصویر' : item.file_type === 'video' ? 'ویدئو' : 'فایل',
  fileType: (item.file_type === 'image' || item.file_type === 'video') ? item.file_type : 'file',
  mimeType: item.mime_type || null,
  fileUrl: item.file_url || '',
  starred: Boolean(item.is_main_image || item.entry_metadata?.main_image?.starred || item.entry_metadata?.starred || (item as any)?.metadata?.starred),
  entryId: item.entry_id || null,
});

const readStageNumber = (stage: any, key: string, fallback = 0) => {
  const metadata = parseObject(stage?.metadata);
  const value = Number(stage?.[key] ?? metadata?.[key] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
};

const readStageText = (stage: any, key: string, fallback = '') => {
  const metadata = parseObject(stage?.metadata);
  return String(stage?.[key] ?? metadata?.[key] ?? fallback ?? '').trim();
};

const mapTemplateStageToCopyStage = (row: any): ProcessV2Stage => {
  const metadata = parseObject(row?.metadata);
  const id = String(row?.id || '').trim();
  const title = String(row?.stage_name || row?.name || metadata?.stage_name || 'مرحله الگو').trim();
  const assigneeLabel = String(row?.assignee_label || metadata?.assignee_label || '').trim() || 'مسئول پیش فرض';
  return {
    id,
    title,
    kind: 'draft',
    status: 'draft',
    layoutSlot: Number(row?.sort_order || metadata?.sort_order || 0),
    assigneeLabel,
    activityTypeLabel: String(row?.task_type || metadata?.task_type || '').trim() || 'مرحله پیش نویس',
    dueLabel: undefined,
    actionCount: Array.isArray(metadata?.automation_rules) ? metadata.automation_rules.length : 0,
    source: {
      ...row,
      ...metadata,
      id,
      stage_name: title,
      metadata,
      source_template_id: String(row?.template_id || metadata?.source_template_id || '').trim(),
      template_stage_id: id,
      process_task_custom_fields: row?.process_task_custom_fields || metadata?.process_task_custom_fields,
      process_task_status_options: row?.process_task_status_options || metadata?.process_task_status_options,
      wage: readStageNumber(row, 'wage', 0),
      weight: readStageNumber(row, 'weight', 0),
      duration_value: readStageNumber(row, 'duration_value', 0),
      duration_unit: readStageText(row, 'duration_unit', 'day') || 'day',
      duration_from: readStageText(row, 'duration_from', 'project_start') || 'project_start',
      due_date: readStageText(row, 'due_date', ''),
      start_date: readStageText(row, 'start_date', ''),
    },
  };
};

const getModuleLabel = (moduleId?: string | null) => {
  const normalized = String(moduleId || '').trim();
  return MODULES[normalized]?.titles?.faSingular || MODULES[normalized]?.titles?.fa || normalized || 'رکورد';
};

const collectStageRelatedRecordRefs = (stage: ProcessV2Stage | null) => {
  const source = stage?.source && typeof stage.source === 'object' ? stage.source : {};
  const metadata = parseObject(source?.metadata);
  const recurrence = parseObject(source?.recurrence_info);
  const sourceStage = source?.source_stage && typeof source.source_stage === 'object' ? source.source_stage : {};
  const sourceStageMetadata = parseObject(sourceStage?.metadata);
  const sourceStageRecurrence = parseObject(sourceStage?.recurrence_info || sourceStageMetadata?.recurrence_info);
  const refs = new Map<string, { moduleId: string; recordId: string }>();
  const addRef = (moduleId?: unknown, recordId?: unknown) => {
    const normalizedModuleId = String(moduleId || '').trim();
    const normalizedRecordId = String(recordId || '').trim();
    if (!normalizedModuleId || !normalizedRecordId) return;
    refs.set(buildRecordReferenceKey(normalizedModuleId, normalizedRecordId), {
      moduleId: normalizedModuleId,
      recordId: normalizedRecordId,
    });
  };

  [
    source?.process_links,
    source?.process_link_map,
    metadata?.process_links,
    metadata?.process_link_map,
    recurrence?.process_links,
    sourceStage?.process_links,
    sourceStage?.process_link_map,
    sourceStageMetadata?.process_links,
    sourceStageMetadata?.process_link_map,
    sourceStageRecurrence?.process_links,
  ].forEach((value) => {
    Object.entries(parseProcessLinkMap(value)).forEach(([moduleId, recordId]) => addRef(moduleId, recordId));
  });
  addRef(source?.source_module_id, source?.source_record_id);
  addRef(sourceStage?.source_module_id, sourceStage?.source_record_id);
  (MODULES.tasks?.fields || [])
    .filter((field: any) => field?.type === FieldType.RELATION && field?.relationConfig?.targetModule)
    .forEach((field: any) => {
      const fieldKey = String(field?.key || '').trim();
      const targetModule = String(field?.relationConfig?.targetModule || '').trim();
      if (!fieldKey || !targetModule) return;
      addRef(targetModule, source?.[fieldKey] ?? metadata?.[fieldKey] ?? recurrence?.[fieldKey] ?? sourceStage?.[fieldKey] ?? sourceStageMetadata?.[fieldKey] ?? sourceStageRecurrence?.[fieldKey]);
    });
  return Array.from(refs.values());
};

const collectProcessRelatedRecordRefs = (process: ProcessV2CardData) => {
  const refs = new Map<string, { moduleId: string; recordId: string }>();
  process.lanes.forEach((lane) => {
    lane.stages.forEach((item) => {
      collectStageRelatedRecordRefs(item).forEach((ref) => {
        refs.set(buildRecordReferenceKey(ref.moduleId, ref.recordId), ref);
      });
    });
  });
  return Array.from(refs.values());
};

const collectProcessTemplateContext = (process: ProcessV2CardData) => {
  const context: Record<string, any> = {};
  process.lanes.forEach((lane) => {
    lane.stages.forEach((item) => {
      const source = item.source && typeof item.source === 'object' ? item.source : {};
      const sourceStage = source?.source_stage && typeof source.source_stage === 'object' ? source.source_stage : {};
      [
        source?.__process_v2_template_context,
        sourceStage?.__process_v2_template_context,
      ].forEach((candidate) => {
        if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
          Object.assign(context, candidate);
        }
      });
    });
  });
  return context;
};

type InlineEditableFieldProps = {
  label: string;
  value: any;
  onSave: (value: any) => void;
  onDraftChange?: (value: any) => void;
  field?: ModuleField;
  options?: Array<{ value: string; label: string; color?: string }>;
  fieldType?: MockCustomField['type'];
  forceEditMode?: boolean;
  requiredForCompletion?: boolean;
  requiredForCreation?: boolean;
  allValues?: Record<string, any>;
  moduleId?: string;
  recordId?: string | null;
  overlayZIndexBase?: number;
  displayNode?: React.ReactNode;
  onOptionsUpdate?: () => void;
  saving?: boolean;
  renderEditor?: (args: { value: any; onChange: (value: any) => void }) => React.ReactNode;
};

const InlineEditableField: React.FC<InlineEditableFieldProps> = ({
  label,
  value,
  onSave,
  onDraftChange,
  field,
  options,
  fieldType = FieldType.TEXT,
  forceEditMode = false,
  requiredForCompletion = false,
  requiredForCreation = false,
  allValues,
  moduleId,
  recordId,
  overlayZIndexBase = 16020,
  displayNode,
  onOptionsUpdate,
  saving = false,
  renderEditor,
}) => {
  const [editing, setEditing] = useState(false);
  const [draftValue, setDraftValue] = useState<any>(value);
  const normalizedFieldType = field?.type || fieldType || FieldType.TEXT;
  const fieldModel = useMemo<ModuleField>(() => ({
    ...(field || {}),
    key: field?.key || `process-task-${label.replace(/\s+/g, '-').toLowerCase()}`,
    type: normalizedFieldType,
    labels: {
      ...(field?.labels || {}),
      fa: field?.labels?.fa || label,
      en: field?.labels?.en || label,
    },
    options: options
      ? options.map((item) => ({
        value: item.value,
        label: item.label,
        color: item.color,
      }))
      : field?.options,
    protectedDynamicValues: field?.dynamicOptionsCategory
      ? (field?.options || []).map((item: any) => String(item?.value || '')).filter(Boolean)
      : undefined,
    validation: requiredForCreation ? { ...(field?.validation || {}), required: true } : { ...(field?.validation || {}), required: false },
    nature: field?.nature || FieldNature.STANDARD,
  } as ModuleField), [field, label, normalizedFieldType, options, requiredForCreation]);

  useEffect(() => {
    if (!editing) setDraftValue(value);
  }, [editing, value]);

  useEffect(() => {
    if (forceEditMode) setDraftValue(value);
  }, [forceEditMode, value]);

  const normalizeRendererValue = useCallback((rawValue: any) => {
    if (rawValue === null || rawValue === undefined) {
      if (normalizedFieldType === FieldType.MULTI_SELECT || normalizedFieldType === FieldType.TAGS || normalizedFieldType === FieldType.MULTI_RELATION) return [];
      if (normalizedFieldType === FieldType.CHECKBOX) return false;
      return '';
    }
    if (normalizedFieldType === FieldType.MULTI_SELECT || normalizedFieldType === FieldType.TAGS || normalizedFieldType === FieldType.MULTI_RELATION) {
      if (Array.isArray(rawValue)) return rawValue;
      return String(rawValue || '').split(',').map((item) => item.trim()).filter(Boolean);
    }
    if (normalizedFieldType === FieldType.CHECKBOX) {
      if (typeof rawValue === 'boolean') return rawValue;
      return String(rawValue || '') === 'true';
    }
    return rawValue;
  }, [normalizedFieldType]);

  const serializeRendererValue = useCallback((nextValue: any) => {
    if (normalizedFieldType === FieldType.MULTI_SELECT || normalizedFieldType === FieldType.TAGS || normalizedFieldType === FieldType.MULTI_RELATION) {
      return Array.isArray(nextValue) ? nextValue.map((item) => String(item || '').trim()).filter(Boolean) : (nextValue ? [String(nextValue).trim()].filter(Boolean) : []);
    }
    if (normalizedFieldType === FieldType.CHECKBOX) return Boolean(nextValue);
    return nextValue ?? '';
  }, [normalizedFieldType]);

  const activeValue = forceEditMode ? value : (editing ? draftValue : value);
  const rendererValue = useMemo(
    () => normalizeRendererValue(activeValue),
    [activeValue, normalizeRendererValue]
  );
  const useExpandedTextEditor = (
    normalizedFieldType === FieldType.LONG_TEXT
    || normalizedFieldType === FieldType.SUPER_LONG_TEXT
  ) && (forceEditMode || editing);

  const handleChange = useCallback((nextValue: any) => {
    const serialized = serializeRendererValue(nextValue);
    setDraftValue(serialized);
    onDraftChange?.(serialized);
    if (forceEditMode) onSave(serialized);
  }, [forceEditMode, onDraftChange, onSave, serializeRendererValue]);

  const commit = useCallback(() => {
    onSave(draftValue);
    setEditing(false);
  }, [draftValue, onSave]);

  const cancel = useCallback(() => {
    setDraftValue(value);
    setEditing(false);
  }, [value]);

  const fieldNode = renderEditor ? renderEditor({ value: rendererValue, onChange: handleChange }) : (
    <SmartFieldRenderer
      field={fieldModel}
      value={rendererValue}
      onChange={handleChange}
      forceEditMode={forceEditMode || editing}
      allValues={allValues}
      moduleId={moduleId || 'tasks'}
      recordId={recordId || undefined}
      compactMode={!useExpandedTextEditor}
      overlayZIndexBase={overlayZIndexBase}
      popupContainer={resolveSelectPopupContainer}
      onOptionsUpdate={onOptionsUpdate}
    />
  );

  const labelNode = (
    <span className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-gray-500 dark:text-gray-400">
      <span>{label}</span>
      {requiredForCreation ? (
        <Tag className="!m-0 !rounded-full !border-red-200 !bg-red-50 !px-1.5 !py-0 !text-[10px] !font-bold !text-red-700 dark:!border-red-500/30 dark:!bg-red-500/10 dark:!text-red-200">
          ضروری برای ایجاد
        </Tag>
      ) : null}
      {requiredForCompletion ? (
        <Tag className="!m-0 !rounded-full !border-amber-200 !bg-amber-50 !px-1.5 !py-0 !text-[10px] !font-bold !text-amber-700 dark:!border-amber-500/30 dark:!bg-amber-500/10 dark:!text-amber-200">
          ضروری برای تکمیل
        </Tag>
      ) : null}
    </span>
  );

  if (forceEditMode) {
    return (
      <div className="min-w-0 rounded-lg border border-transparent bg-gray-50 px-3 py-2 text-right transition focus-within:border-[rgba(var(--brand-200-rgb),0.8)] focus-within:bg-white dark:bg-white/5 dark:focus-within:border-[rgba(var(--brand-300-rgb),0.35)] dark:focus-within:bg-white/10">
        <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-gray-500 dark:text-gray-400">
          <span>{label}</span>
          {requiredForCreation ? (
            <Tag className="!m-0 !rounded-full !border-red-200 !bg-red-50 !px-1.5 !py-0 !text-[10px] !font-bold !text-red-700 dark:!border-red-500/30 dark:!bg-red-500/10 dark:!text-red-200">
              ضروری برای ایجاد
            </Tag>
          ) : null}
          {requiredForCompletion ? (
            <Tag className="!m-0 !rounded-full !border-amber-200 !bg-amber-50 !px-1.5 !py-0 !text-[10px] !font-bold !text-amber-700 dark:!border-amber-500/30 dark:!bg-amber-500/10 dark:!text-amber-200">
              ضروری برای تکمیل
            </Tag>
          ) : null}
        </div>
        <div className="min-w-0">{fieldNode}</div>
      </div>
    );
  }

  if (normalizedFieldType === FieldType.CHECKBOX) {
    const checked = Boolean(rendererValue);
    return (
      <div className="flex min-h-[3.25rem] w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-transparent bg-gray-50 px-3 py-2 text-right transition hover:border-[rgba(var(--brand-200-rgb),0.7)] hover:bg-white dark:bg-white/5 dark:hover:border-[rgba(var(--brand-300-rgb),0.25)] dark:hover:bg-white/10">
        <span className="min-w-0 flex-1">
          {labelNode}
          <span className="mt-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
            {checked ? 'فعال' : 'غیرفعال'}
          </span>
        </span>
        <Switch
          checked={checked}
          loading={saving}
          checkedChildren="بله"
          unCheckedChildren="خیر"
          onChange={(nextChecked) => {
            setDraftValue(nextChecked);
            onSave(Boolean(nextChecked));
          }}
        />
      </div>
    );
  }

  if (editing) {
    return (
      <div className="min-w-0 rounded-lg border border-[rgba(var(--brand-200-rgb),0.7)] bg-gray-50 px-2 py-2 dark:border-[rgba(var(--brand-300-rgb),0.25)] dark:bg-white/5">
        <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-gray-500 dark:text-gray-400">
          <span>{label}</span>
          {requiredForCreation ? (
            <Tag className="!m-0 !rounded-full !border-red-200 !bg-red-50 !px-1.5 !py-0 !text-[10px] !font-bold !text-red-700 dark:!border-red-500/30 dark:!bg-red-500/10 dark:!text-red-200">
              ضروری برای ایجاد
            </Tag>
          ) : null}
          {requiredForCompletion ? (
            <Tag className="!m-0 !rounded-full !border-amber-200 !bg-amber-50 !px-1.5 !py-0 !text-[10px] !font-bold !text-amber-700 dark:!border-amber-500/30 dark:!bg-amber-500/10 dark:!text-amber-200">
              ضروری برای تکمیل
            </Tag>
          ) : null}
        </div>
        <div className={`flex min-w-0 items-start gap-1.5 ${useExpandedTextEditor ? 'flex-col sm:flex-row' : ''}`}>
          <div className={`min-w-0 flex-1 ${useExpandedTextEditor ? 'order-2 w-full sm:order-1' : ''}`}>{fieldNode}</div>
          <div className={`flex shrink-0 items-center gap-1.5 ${useExpandedTextEditor ? 'order-1 sm:order-2' : ''}`}>
            <Button
              type="text"
              size="small"
              shape="circle"
              icon={<CheckOutlined />}
              onClick={commit}
              aria-label="تایید"
              className="!inline-flex !items-center !justify-center !text-green-600"
            />
            <Button
              type="text"
              size="small"
              shape="circle"
              icon={<CloseOutlined />}
              onClick={cancel}
              aria-label="لغو"
              className="!inline-flex !items-center !justify-center !text-gray-500"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          setEditing(true);
        }
      }}
      className="group flex min-h-[3.25rem] w-full min-w-0 cursor-pointer items-start gap-2 rounded-lg border border-transparent bg-gray-50 px-3 py-2 text-right transition hover:border-[rgba(var(--brand-200-rgb),0.7)] hover:bg-white dark:bg-white/5 dark:hover:border-[rgba(var(--brand-300-rgb),0.25)] dark:hover:bg-white/10"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-gray-500 dark:text-gray-400">
          <span>{label}</span>
          {requiredForCreation ? (
            <Tag className="!m-0 !rounded-full !border-red-200 !bg-red-50 !px-1.5 !py-0 !text-[10px] !font-bold !text-red-700 dark:!border-red-500/30 dark:!bg-red-500/10 dark:!text-red-200">
              ضروری برای ایجاد
            </Tag>
          ) : null}
          {requiredForCompletion ? (
            <Tag className="!m-0 !rounded-full !border-amber-200 !bg-amber-50 !px-1.5 !py-0 !text-[10px] !font-bold !text-amber-700 dark:!border-amber-500/30 dark:!bg-amber-500/10 dark:!text-amber-200">
              ضروری برای تکمیل
            </Tag>
          ) : null}
        </span>
        <span className="mt-1 block min-w-0 text-sm font-semibold text-gray-800 dark:text-gray-100">
          {displayNode || fieldNode}
        </span>
      </span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setEditing(true);
        }}
        className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-300 opacity-55 transition group-hover:bg-white group-hover:text-gray-500 group-hover:opacity-80 dark:text-gray-500 dark:group-hover:bg-white/10 dark:group-hover:text-gray-300"
        aria-label={`ویرایش ${label}`}
      >
        <EditOutlined className="text-[12px]" />
      </button>
    </div>
  );
};

const FilePreviewThumb: React.FC<{
  file: ModalFileItem;
}> = ({ file }) => {
  if (file.fileType === 'image' && file.fileUrl) {
    return (
      <ResilientImage
        src={file.fileUrl}
        preset="thumb"
        alt={file.title}
        className="h-11 w-11 rounded-lg border border-gray-200 object-cover dark:border-gray-700"
      />
    );
  }
  return (
    <div className="h-11 w-11 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
      <FileExtensionTile fileName={file.title} url={file.fileUrl} mimeType={file.mimeType} compact />
    </div>
  );
};

const ProcessTaskModalV2: React.FC<ProcessTaskModalV2Props> = ({
  open,
  process,
  stage,
  laneTitle,
  templates = [],
  onClose,
  onStageStatusChange,
  onCreateDraftActivity,
  onSaveDraftActivity,
}) => {
  const { message } = App.useApp();
  const isInsideRouter = useInRouterContext();
  const [statusValue, setStatusValue] = useState('waiting');
  const [savingStatusValue, setSavingStatusValue] = useState<string | null>(null);
  const [savingFieldKey, setSavingFieldKey] = useState<string | null>(null);
  const [creatingDraftActivity, setCreatingDraftActivity] = useState(false);
  const [savingDraftActivity, setSavingDraftActivity] = useState(false);
  const [taskActionBusy, setTaskActionBusy] = useState<string | null>(null);
  const [localTaskPatch, setLocalTaskPatch] = useState<Record<string, any>>({});
  const [assigneeValue, setAssigneeValue] = useState('تعیین نشده');
  const [taskNameValue, setTaskNameValue] = useState('');
  const [activityTypeValue, setActivityTypeValue] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [reportDraft, setReportDraft] = useState('');
  const [activityTags, setActivityTags] = useState<TagItem[]>([]);
  const [wageValue, setWageValue] = useState('0');
  const [weightValue, setWeightValue] = useState('0');
  const [dueDateValue, setDueDateValue] = useState('');
  const [startDateValue, setStartDateValue] = useState('');
  const [startScheduleMode, setStartScheduleMode] = useState<'manual' | 'system'>('manual');
  const [dueScheduleMode, setDueScheduleMode] = useState<'manual' | 'system'>('system');
  const [startDurationFromValue, setStartDurationFromValue] = useState('project_start');
  const [startDurationValue, setStartDurationValue] = useState('0');
  const [startDurationUnitValue, setStartDurationUnitValue] = useState('day');
  const [startAnchorStageValue, setStartAnchorStageValue] = useState('');
  const [dueDurationFromValue, setDueDurationFromValue] = useState('project_start');
  const [dueDurationValue, setDueDurationValue] = useState('0');
  const [dueDurationUnitValue, setDueDurationUnitValue] = useState('day');
  const [dueAnchorStageValue, setDueAnchorStageValue] = useState('');
  const [customFields, setCustomFields] = useState<MockCustomField[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [filesExpanded, setFilesExpanded] = useState(false);
  const [modalFiles, setModalFiles] = useState<ModalFileItem[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [queuedUploadFiles, setQueuedUploadFiles] = useState<File[]>([]);
  const [previewFile, setPreviewFile] = useState<ModalFileItem | null>(null);
  const [starredFileIds, setStarredFileIds] = useState<Set<string>>(() => new Set());
  const [relatedLabelMap, setRelatedLabelMap] = useState<Record<string, string>>({});
  const [sideTab, setSideTab] = useState<'files' | 'conversation' | 'ai' | 'instructions' | 'changelogs'>('files');
  const [conversationCount, setConversationCount] = useState(0);
  const [changelogCount, setChangelogCount] = useState(0);
  const [instructionsModalOpen, setInstructionsModalOpen] = useState(false);
  const [loadingInstructions, setLoadingInstructions] = useState(false);
  const [loadedInstructions, setLoadedInstructions] = useState<any[]>([]);
  const [activeInstructionId, setActiveInstructionId] = useState<string | null>(null);
  const [assigneeUsers, setAssigneeUsers] = useState<any[]>([]);
  const [assigneeRoles, setAssigneeRoles] = useState<any[]>([]);
  const [taskTypeOptions, setTaskTypeOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [draftCopyTemplateId, setDraftCopyTemplateId] = useState<string | undefined>(undefined);
  const [draftCopyStageId, setDraftCopyStageId] = useState<string | undefined>(undefined);
  const [templateCopyStages, setTemplateCopyStages] = useState<ProcessV2Stage[]>([]);
  const [templateCopyStagesLoading, setTemplateCopyStagesLoading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadFilesForTaskRef = useRef<((targetTaskId: string, files: File[], shouldReload?: boolean) => Promise<void>) | null>(null);
  const initializedModalKeyRef = useRef('');
  const taskTypeField = useMemo(() => getTaskField('task_type'), []);
  const runProcess = process.mode === 'run' ? process as Extract<ProcessV2CardData, { mode: 'run' }> : null;
  const rawSource: Record<string, any> = stage?.source && typeof stage.source === 'object'
    ? stage.source as Record<string, any>
    : {};
  const rawTaskRecordId = normalizeDbUuid(
    rawSource?.task_id
    || rawSource?.process_task_id
    || (stage?.kind !== 'draft' ? rawSource?.id : '')
    || ''
  );
  const isDraftActivityCreationMode = stage?.kind === 'draft' && !rawTaskRecordId;
  const fieldDraftStorageKey = useMemo(
    () => buildCreationDraftStorageKey(process, stage),
    [process, stage],
  );
  const rawSourceRecurrence = parseObject(rawSource?.recurrence_info);
  const localPatchRecurrence = parseObject(localTaskPatch?.recurrence_info);
  const source: Record<string, any> = {
    ...rawSource,
    ...localTaskPatch,
    recurrence_info: {
      ...rawSourceRecurrence,
      ...localPatchRecurrence,
    },
  };
  const sourceMetadata = parseObject(source?.metadata);
  const isTemplateBackedDraft = isDraftActivityCreationMode && Boolean(
    String(source?.template_stage_id || source?.source_template_id || sourceMetadata?.source_template_id || '').trim()
  );
  const templateBackedStageId = String(stage?.id || source?.template_stage_id || source?.id || '').trim();
  const templateBackedTemplateId = String(source?.source_template_id || sourceMetadata?.source_template_id || runProcess?.templateId || '').trim();
  const draftCopyStage = useMemo(() => (
    [
      ...process.lanes.flatMap((lane) => lane.stages),
      ...templateCopyStages,
    ]
      .find((candidate) => candidate.id === draftCopyStageId) || null
  ), [draftCopyStageId, process.lanes, templateCopyStages]);
  const effectiveConfigStage = draftCopyStage || stage;
  const effectiveSource = effectiveConfigStage?.source && typeof effectiveConfigStage.source === 'object' ? effectiveConfigStage.source : source;
  const sourceStage = source?.source_stage && typeof source.source_stage === 'object' ? source.source_stage : {};
  const effectiveSourceStage = effectiveSource?.source_stage && typeof effectiveSource.source_stage === 'object' ? effectiveSource.source_stage : sourceStage;
  const taskRecordId = normalizeDbUuid(
    source?.task_id
    || source?.process_task_id
    || rawTaskRecordId
    || (!isDraftActivityCreationMode ? source?.id : '')
    || ''
  );
  const modalInitKey = useMemo(() => (
    open && stage
      ? `${process.mode}:${process.id}:${stage.id}:${taskRecordId || 'draft'}:${isDraftActivityCreationMode ? 'draft' : 'activity'}`
      : ''
  ), [isDraftActivityCreationMode, open, process.id, process.mode, stage, taskRecordId]);
  const processTemplateContext = useMemo(() => collectProcessTemplateContext(process), [process]);
  const processTemplateContextRef = useRef<Record<string, any>>({});
  processTemplateContextRef.current = processTemplateContext;
  const recurrence = useMemo(() => parseObject(effectiveSource?.recurrence_info), [effectiveSource?.recurrence_info]);
  const effectiveStatusOptions = useMemo(() => buildStatusOptions(effectiveConfigStage), [effectiveConfigStage]);
  const draftSourceStageMetadata = useMemo(() => parseObject(sourceStage?.metadata), [sourceStage?.metadata]);
  const draftSourceRecurrence = useMemo(() => parseObject(source?.recurrence_info), [source?.recurrence_info]);
  const draftSourceStageRecurrence = useMemo(
    () => parseObject(sourceStage?.recurrence_info || draftSourceStageMetadata?.recurrence_info),
    [draftSourceStageMetadata?.recurrence_info, sourceStage?.recurrence_info],
  );
  const resolvedDraftTaskName = useMemo(() => {
    if (!isDraftActivityCreationMode) return '';
    const renderedStageTitle = String(stage?.title || '').trim();
    const rawSourceTitle = String(
      source?.name
      || source?.stage_name
      || source?.title
      || sourceMetadata?.name
      || sourceMetadata?.stage_name
      || sourceMetadata?.title
      || sourceStage?.name
      || sourceStage?.stage_name
      || draftSourceStageMetadata?.name
      || draftSourceStageMetadata?.stage_name
      || ''
    ).trim();
    return renderedStageTitle || rawSourceTitle;
  }, [draftSourceStageMetadata?.name, draftSourceStageMetadata?.stage_name, isDraftActivityCreationMode, source?.name, source?.stage_name, source?.title, sourceMetadata?.name, sourceMetadata?.stage_name, sourceMetadata?.title, sourceStage?.name, sourceStage?.stage_name, stage?.title]);
  const resolvedDraftActivityType = useMemo(() => {
    if (!isDraftActivityCreationMode) return '';
    return String(
      source?.task_type
      || sourceMetadata?.task_type
      || draftSourceRecurrence?.task_type
      || source?.source_stage?.task_type
      || parseObject(source?.source_stage?.metadata)?.task_type
      || parseObject(source?.source_stage?.recurrence_info || parseObject(source?.source_stage?.metadata)?.recurrence_info)?.task_type
      || sourceStage?.task_type
      || draftSourceStageMetadata?.task_type
      || draftSourceStageRecurrence?.task_type
      || stage?.activityTypeLabel
      || 'مرحله پیش نویس'
    ).trim();
  }, [draftSourceRecurrence?.task_type, draftSourceStageMetadata?.task_type, draftSourceStageRecurrence?.task_type, isDraftActivityCreationMode, source?.task_type, sourceMetadata?.task_type, sourceStage?.task_type, stage?.activityTypeLabel]);
  const assigneeDisplaySource = useMemo(() => {
    const parsed = parseAssigneeValue(assigneeValue, null);
    const normalizedType = parsed.assigneeType || String(effectiveSource?.assignee_type || source?.assignee_type || '').trim() || (effectiveSource?.assignee_role_id || source?.assignee_role_id ? 'role' : 'user');
    const normalizedId = parsed.assigneeId || String(
      normalizedType === 'role'
        ? (effectiveSource?.assignee_role_id || source?.assignee_role_id || effectiveSource?.assignee_id || source?.assignee_id || '')
        : (effectiveSource?.assignee_id || source?.assignee_id || '')
    ).trim();
    return {
      ...effectiveSource,
      assignee_type: normalizedType,
      assignee_id: normalizedType === 'role' ? null : normalizedId,
      assignee_role_id: normalizedType === 'role' ? normalizedId : null,
      assignee_label: assigneeValue,
    };
  }, [assigneeValue, effectiveSource, source]);
  const processTemplateOptions = useMemo(() => {
    const base = templates.map((template) => ({ value: template.id, label: template.title }));
    if (process.mode === 'run') {
      const runProcess = process as Extract<ProcessV2CardData, { mode: 'run' }>;
      if (runProcess.templateId && !base.some((option) => option.value === runProcess.templateId)) {
        base.unshift({ value: runProcess.templateId, label: runProcess.templateTitle || 'الگوی فرآیند' });
      }
    }
    return base;
  }, [process, templates]);
  const currentProcessDraftStageOptions = useMemo(() => (
    process.lanes.flatMap((lane) => lane.stages
      .filter((candidate) => candidate.kind === 'draft' && (isTemplateBackedDraft || candidate.id !== stage?.id))
      .map((candidate) => ({
        value: candidate.id,
        label: `${lane.title} / ${candidate.title}`,
      })))
  ), [isTemplateBackedDraft, process.lanes, stage?.id]);
  const draftStageOptions = useMemo(() => {
    if (isTemplateBackedDraft || !draftCopyTemplateId) {
      return currentProcessDraftStageOptions;
    }
    return templateCopyStages.map((candidate) => ({
      value: candidate.id,
      label: candidate.title,
    }));
  }, [currentProcessDraftStageOptions, draftCopyTemplateId, isTemplateBackedDraft, templateCopyStages]);
  const processStageAnchorOptions = useMemo(() => (
    process.lanes.flatMap((lane) => lane.stages.map((item) => {
      const itemSource = item.source && typeof item.source === 'object' ? item.source : {};
      const value = String(itemSource.process_node_key || itemSource.template_stage_id || itemSource.id || item.id || '').trim();
      return {
        value,
        label: `${lane.title} / ${item.title}`,
      };
    })).filter((option) => option.value)
  ), [process.lanes]);
  const timingAnchorOptions = useMemo(() => ([
    { value: 'current_stage_created', label: 'ایجاد همین فعالیت' },
    { value: 'project_start', label: 'شروع فرآیند' },
    { value: 'previous_stage_created', label: 'ایجاد مرحله قبلی' },
    { value: 'previous_stage_start', label: 'زمان شروع مرحله قبلی' },
    { value: 'previous_stage_end', label: 'مهلت انجام مرحله قبلی' },
    { value: 'previous_stage_completed', label: 'زمان تکمیل واقعی مرحله قبلی' },
    { value: 'next_stage_created', label: 'ایجاد مرحله بعدی' },
    { value: 'next_stage_start', label: 'زمان شروع مرحله بعدی' },
    { value: 'next_stage_due', label: 'مهلت انجام مرحله بعدی' },
    { value: 'next_stage_completed', label: 'زمان تکمیل واقعی مرحله بعدی' },
    { value: 'specific_stage_created', label: 'ایجاد مرحله خاص' },
    { value: 'specific_stage_start', label: 'زمان شروع مرحله خاص' },
    { value: 'specific_stage_due', label: 'مهلت انجام مرحله خاص' },
    { value: 'specific_stage_completed', label: 'زمان تکمیل واقعی مرحله خاص' },
  ]), []);
  const instructionIds = useMemo(() => normalizeInstructionIdList([
    ...getInstructionIdsFromTask(effectiveSource),
    ...getInstructionIdsFromStage(effectiveSource),
    ...getInstructionIdsFromStage(effectiveSourceStage),
    ...normalizeInstructionIdList(recurrence?.instruction_ids),
    ...normalizeInstructionIdList(recurrence?.instructionIds),
  ]), [effectiveSource, effectiveSourceStage, recurrence?.instructionIds, recurrence?.instruction_ids]);
  const taskForActions = useMemo(() => {
    if (!taskRecordId) return null;
    return {
      ...source,
      id: taskRecordId,
      status: statusValue,
      recurrence_info: {
        ...recurrence,
        instruction_ids: instructionIds,
      },
      instruction_ids: instructionIds,
    };
  }, [instructionIds, recurrence, source, statusValue, taskRecordId]);
  const buildStageStatusPatch = useCallback((nextStatus: string, patch?: Record<string, any>) => ({
    id: taskRecordId || source?.id || stage?.id,
    task_id: taskRecordId || source?.task_id,
    process_task_id: source?.process_task_id,
    process_run_stage_id: source?.process_run_stage_id || sourceStage?.id,
    run_stage_id: source?.run_stage_id,
    template_stage_id: source?.template_stage_id || sourceStage?.template_stage_id,
    process_node_key: source?.process_node_key || sourceStage?.process_node_key,
    ...(patch || {}),
    status: nextStatus,
  }), [source, sourceStage, stage?.id, taskRecordId]);
  const getAssigneeDisplayLabel = useCallback((value: string) => {
    const parsed = parseAssigneeValue(value, null);
    if (!parsed.assigneeType || !parsed.assigneeId) return String(value || '').trim();
    if (parsed.assigneeType === 'role') {
      return String(assigneeRoles.find((role: any) => String(role?.id || '') === parsed.assigneeId)?.title || 'نقش مسئول').trim();
    }
    const user = assigneeUsers.find((item: any) => String(item?.id || '') === parsed.assigneeId);
    return String(user?.display_name || user?.full_name || user?.email || 'کاربر مسئول').trim();
  }, [assigneeRoles, assigneeUsers]);
  const persistTaskFieldPatch = useCallback(async (
    fieldKey: string,
    patch: Record<string, any>,
    recurrencePatch?: Record<string, any>,
    sourcePatch?: Record<string, any>,
  ) => {
    if (isDraftActivityCreationMode) return;
    if (!taskRecordId) {
      message.error('شناسه فعالیت برای ذخیره تغییرات پیدا نشد.');
      throw new Error('PROCESS_TASK_ID_MISSING');
    }
    const currentRecurrence = parseObject(source?.recurrence_info);
    const nextPatch: Record<string, any> = {
      ...patch,
      ...(recurrencePatch ? { recurrence_info: { ...currentRecurrence, ...recurrencePatch } } : {}),
    };
    setSavingFieldKey(fieldKey);
    setLocalTaskPatch((current) => ({
      ...current,
      ...nextPatch,
      recurrence_info: {
        ...parseObject(current?.recurrence_info),
        ...parseObject(nextPatch?.recurrence_info),
      },
    }));
    const optimisticSourcePatch = {
      ...source,
      ...nextPatch,
      ...(sourcePatch || {}),
      id: taskRecordId,
      task_id: taskRecordId,
      process_run_stage_id: source?.process_run_stage_id || sourceStage?.id,
    };
    if (stage?.id) {
      onStageStatusChange?.(stage.id, String(nextPatch.status || statusValue || source?.status || 'todo'), buildStageStatusPatch(
        String(nextPatch.status || statusValue || source?.status || 'todo'),
        optimisticSourcePatch,
      ));
    }
    try {
      const customFieldValuesPatch = recurrencePatch?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY];
      let data: any = null;
      if (customFieldValuesPatch && typeof customFieldValuesPatch === 'object' && !Array.isArray(customFieldValuesPatch)) {
        data = await patchProcessTaskCustomFieldValues({
          supabaseClient: supabase,
          taskId: taskRecordId,
          values: customFieldValuesPatch,
          fallbackRecurrence: parseObject(nextPatch.recurrence_info),
        });
      } else {
        const result = await supabase
          .from('tasks')
          .update(nextPatch)
          .eq('id', taskRecordId)
          .select('id,name,status,task_type,assignee_id,assignee_role_id,assignee_type,due_date,start_date,actual_start_at,completed_at,description,task_report,wage,weight,recurrence_info,process_run_stage_id,process_node_key,process_lane_key,source_template_id,source_module_id,source_record_id,process_group_id')
          .maybeSingle();
        if (result.error) throw result.error;
        data = result.data;
      }
      if (!data?.id) {
        throw new Error('ذخیره فعالیت روی سرور اعمال نشد.');
      }
      const updatedTask = {
        ...source,
        ...nextPatch,
        ...data,
        ...(sourcePatch || {}),
        id: taskRecordId,
        process_run_stage_id: data?.process_run_stage_id || source?.process_run_stage_id || sourceStage?.id,
      };
      setLocalTaskPatch((current) => ({
        ...current,
        ...data,
        recurrence_info: {
          ...parseObject(current?.recurrence_info),
          ...parseObject(nextPatch?.recurrence_info),
          ...parseObject(data?.recurrence_info),
        },
      }));
      const runStageRelevantKeys = new Set([
        'status',
        'assignee_id',
        'assignee_role_id',
        'due_date',
        'start_date',
        'actual_start_at',
        'completed_at',
      ]);
      if (Object.keys(patch || {}).some((key) => runStageRelevantKeys.has(key))) {
        await syncProcessRunStageFromTask({
          supabaseClient: supabase,
          task: updatedTask,
        });
      }
      if (stage?.id) {
        onStageStatusChange?.(
          stage.id,
          String(updatedTask.status || statusValue || 'todo'),
          buildStageStatusPatch(String(updatedTask.status || statusValue || 'todo'), updatedTask),
        );
      }
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ذخیره تغییرات فعالیت ناموفق بود'));
      throw error;
    } finally {
      setSavingFieldKey(null);
    }
  }, [
    buildStageStatusPatch,
    isDraftActivityCreationMode,
    message,
    onStageStatusChange,
    source,
    sourceStage?.id,
    stage?.id,
    statusValue,
    taskRecordId,
  ]);
  const statusLabelMap = useMemo(
    () => Object.fromEntries(effectiveStatusOptions.map((option) => [option.value, option.label])),
    [effectiveStatusOptions],
  );
  const saveTaskAssignee = useCallback(async (nextValue: string) => {
    const normalized = String(nextValue || '').trim();
    const parsed = parseAssigneeValue(normalized, null);
    const patch = parsed.assigneeType && parsed.assigneeId
      ? {
          assignee_type: parsed.assigneeType,
          assignee_id: parsed.assigneeType === 'user' ? parsed.assigneeId : null,
          assignee_role_id: parsed.assigneeType === 'role' ? parsed.assigneeId : null,
        }
      : {
          assignee_type: null,
          assignee_id: null,
          assignee_role_id: null,
        };
    setAssigneeValue(normalized);
    await persistTaskFieldPatch('assignee', patch, undefined, {
      ...patch,
      assignee_label: getAssigneeDisplayLabel(normalized),
    });
  }, [getAssigneeDisplayLabel, persistTaskFieldPatch]);
  const saveTaskDescription = useCallback(async (nextValue: string) => {
    setDescriptionDraft(nextValue);
    await persistTaskFieldPatch('description', { description: String(nextValue || '').trim() || null });
  }, [persistTaskFieldPatch]);
  const saveTaskReport = useCallback(async (nextValue: string) => {
    setReportDraft(nextValue);
    await persistTaskFieldPatch('task_report', { task_report: String(nextValue || '').trim() || null });
  }, [persistTaskFieldPatch]);
  const saveCustomFieldValue = useCallback(async (fieldKey: string, nextValue: any) => {
    const currentRecurrence = parseObject(source?.recurrence_info);
    const currentValues = currentRecurrence?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]
      && typeof currentRecurrence[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] === 'object'
      ? currentRecurrence[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]
      : {};
    const currentFieldValues = customFields.reduce<Record<string, any>>((acc, field) => {
      if (field.key) acc[field.key] = field.value;
      return acc;
    }, {});
    const currentField = customFields.find((field) => field.key === fieldKey);
    const oldValue = currentField?.value;
    const nextValues = {
      ...currentValues,
      ...currentFieldValues,
      [fieldKey]: nextValue,
    };
    const currentProcessLinks = parseProcessLinkMap(currentRecurrence?.process_links);
    const nextProcessLinks = mergeProcessLinksFromLinkedRelationValues(
      customFields.map((field) => field.field).filter(Boolean) as ModuleField[],
      nextValues,
      currentProcessLinks,
    );
    setCustomFields((current) => current.map((item) => (
      item.key === fieldKey ? { ...item, value: nextValue } : item
    )));
    await persistTaskFieldPatch(
      fieldKey,
      {},
      {
        [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: nextValues,
        process_links: nextProcessLinks,
      },
      {
        [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: nextValues,
        process_links: nextProcessLinks,
        [fieldKey]: nextValue,
      },
    );
    if (JSON.stringify(oldValue ?? null) !== JSON.stringify(nextValue ?? null)) {
      // The database trigger writes the detailed custom-field audit row from
      // the saved snapshot.  Keeping it server-side also covers automation,
      // AI and public entry points.
      setChangelogCount((count) => count + 1);
    }
  }, [customFields, persistTaskFieldPatch, source?.recurrence_info, stage?.title, taskNameValue, taskRecordId]);
  const hasFiles = modalFiles.length > 0;
  const customFieldAllValues = useMemo(
    () => customFields.reduce<Record<string, any>>((values, field) => {
      if (field.key) values[field.key] = field.value;
      return values;
    }, {}),
    [customFields],
  );
  const mainImageFile = useMemo(
    () => modalFiles.find((file) => file.fileType === 'image' && starredFileIds.has(file.id))
      || modalFiles.find((file) => file.fileType === 'image' && file.starred)
      || null,
    [modalFiles, starredFileIds],
  );
  const handleToggleFileStar = async (file: ModalFileItem) => {
    const nextStarred = !starredFileIds.has(file.id);
    setStarredFileIds((current) => {
      const next = new Set(current);
      if (nextStarred) next.add(file.id);
      else next.delete(file.id);
      return next;
    });
    setModalFiles((current) => current.map((item) => item.id === file.id ? { ...item, starred: nextStarred } : item));

    if (!file.entryId) return;
    try {
      const { data } = await supabase
        .from('file_entries')
        .select('metadata')
        .eq('id', file.entryId)
        .maybeSingle();
      const previousMetadata = data?.metadata && typeof data.metadata === 'object' ? data.metadata : {};
      const { error } = await supabase
        .from('file_entries')
        .update({
          metadata: {
            ...previousMetadata,
            main_image: {
              ...(previousMetadata as any)?.main_image,
              starred: nextStarred,
              starred_at: nextStarred ? new Date().toISOString() : null,
              module_id: 'tasks',
              record_id: taskRecordId || null,
            },
          },
        })
        .eq('id', file.entryId);
      if (error) throw error;
      invalidateFileManagerFolderCaches('tasks', taskRecordId);
    } catch (error) {
      setStarredFileIds((current) => {
        const next = new Set(current);
        if (nextStarred) next.delete(file.id);
        else next.add(file.id);
        return next;
      });
      setModalFiles((current) => current.map((item) => item.id === file.id ? { ...item, starred: !nextStarred } : item));
      message.error('بروزرسانی ستاره فایل ناموفق بود');
    }
  };

  const loadTaskTypeOptions = useCallback(async (force = false) => {
    try {
      const loaded = taskTypeField?.dynamicOptionsCategory
        ? await fetchDynamicOptionsByCategory(supabase, taskTypeField.dynamicOptionsCategory, { force })
        : [];
      const merged = getMergedTaskTypeOptions(loaded || []);
      setTaskTypeOptions(
        activityTypeValue && !merged.some((option) => String(option.value) === activityTypeValue)
          ? [{ label: activityTypeValue, value: activityTypeValue }, ...merged]
          : merged
      );
    } catch {
      const fallback = getMergedTaskTypeOptions([]);
      setTaskTypeOptions(
        activityTypeValue && !fallback.some((option) => String(option.value) === activityTypeValue)
          ? [{ label: activityTypeValue, value: activityTypeValue }, ...fallback]
          : fallback
      );
    }
  }, [activityTypeValue, taskTypeField?.dynamicOptionsCategory]);

  const handleDirectShareFile = async (file: ModalFileItem) => {
    const url = String(file.fileUrl || '').trim();
    if (!url) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: file.title, url });
        return;
      }
      await navigator.clipboard?.writeText(url);
      message.success('لینک فایل برای ارسال مستقیم کپی شد');
    } catch (error) {
      console.warn('Direct share failed', error);
      message.error('ارسال مستقیم ناموفق بود');
    }
  };

  const renderPreviewFileContent = (file: ModalFileItem) => {
    if (file.fileType === 'image') {
      return (
        <ResilientImage
          src={buildImagePreviewUrl(file.fileUrl, 'gallery')}
          preset="gallery"
          alt={file.title}
          className="max-h-[68vh] w-full rounded-lg border border-gray-200 object-contain dark:border-gray-700"
        />
      );
    }
    if (file.fileType === 'video') {
      return (
        <video
          src={file.fileUrl}
          controls
          className="max-h-[68vh] w-full rounded-lg border border-gray-200 bg-black dark:border-gray-700"
        />
      );
    }
    return (
      <div className="mx-auto max-w-sm rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
        <FileExtensionTile fileName={file.title} url={file.fileUrl} mimeType={file.mimeType} />
      </div>
    );
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const selectedToken = String(assigneeValue || '').trim();
    if (!selectedToken) {
      setAssigneeUsers([]);
      setAssigneeRoles([]);
      return;
    }
    searchIdentityOptions(supabase, { scopes: ['user', 'role'], exactTokens: [selectedToken] })
      .then((result) => {
        if (cancelled) return;
        setAssigneeUsers(result.items.filter((item) => item.kind === 'user').map((item) => ({
          id: item.id, display_name: item.label, avatar_url: item.avatarUrl, role_id: item.roleId,
        })));
        setAssigneeRoles(result.items.filter((item) => item.kind === 'role').map((item) => ({
          id: item.id, title: item.label, icon_key: item.iconKey,
        })));
      })
      .catch(() => {
        if (!cancelled) {
          setAssigneeUsers([]);
          setAssigneeRoles([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [assigneeValue, open]);

  const handleStatusActionClick = async (nextStatus: string) => {
    const normalizedStatus = String(nextStatus || '').trim();
    if (!normalizedStatus || normalizedStatus === statusValue) return;
    if (isDraftActivityCreationMode || !taskForActions?.id) {
      setStatusValue(normalizedStatus);
      return;
    }
    setSavingStatusValue(normalizedStatus);
    const previousStatus = statusValue;
    setStatusValue(normalizedStatus);
    if (stage?.id) {
      onStageStatusChange?.(stage.id, normalizedStatus, buildStageStatusPatch(normalizedStatus));
    }
    try {
      const updatedTask = await updateTaskStatusWithAutomation({
        taskId: String(taskForActions.id),
        nextStatus: normalizedStatus,
        previousTask: taskForActions,
        currentUser: null,
      });
      setStatusValue(String(updatedTask?.status || normalizedStatus));
      if (stage?.id) {
        onStageStatusChange?.(
          stage.id,
          String(updatedTask?.status || normalizedStatus),
          buildStageStatusPatch(String(updatedTask?.status || normalizedStatus), updatedTask || undefined),
        );
      }
      message.success('وضعیت فعالیت بروزرسانی شد');
    } catch (error: any) {
      setStatusValue(previousStatus);
      if (stage?.id) {
        onStageStatusChange?.(stage.id, previousStatus, buildStageStatusPatch(previousStatus));
      }
      message.error(toFaErrorMessage(error, 'تغییر وضعیت فعالیت ناموفق بود'));
    } finally {
      setSavingStatusValue(null);
    }
  };

  const buildDraftActivityOverrides = useCallback(() => {
    const nextTaskName = taskNameValue || resolvedDraftTaskName || String(stage?.title || '').trim();
    const nextTaskType = activityTypeValue || resolvedDraftActivityType || String(stage?.activityTypeLabel || '').trim();
      const parsedAssignee = parseAssigneeValue(assigneeValue, null);
      const hasSelectableAssignee = /^(user|role)[:_]/i.test(String(assigneeValue || '').trim())
        && parsedAssignee.assigneeType
        && parsedAssignee.assigneeId;
      const customFieldValues = customFields.reduce<Record<string, any>>((acc, field) => {
        acc[field.key] = field.value;
        return acc;
      }, {});
      const overrides: Record<string, any> = {
        name: nextTaskName,
        stage_name: nextTaskName,
        task_type: nextTaskType,
        ...(hasSelectableAssignee ? {
          assignee_type: parsedAssignee.assigneeType,
          assignee_id: parsedAssignee.assigneeType === 'user' ? parsedAssignee.assigneeId : null,
          assignee_role_id: parsedAssignee.assigneeType === 'role' ? parsedAssignee.assigneeId : null,
          default_assignee_id: parsedAssignee.assigneeType === 'user' ? parsedAssignee.assigneeId : null,
          default_assignee_role_id: parsedAssignee.assigneeType === 'role' ? parsedAssignee.assigneeId : null,
          default_assignee_field: null,
          default_assignee_combo: null,
        } : {}),
        description: String(descriptionDraft || '').trim() || null,
        tags: activityTags,
        wage: Number(wageValue) || 0,
        weight: Number(weightValue) || 0,
        start_date: startScheduleMode === 'manual' ? (startDateValue || null) : null,
        due_date: dueScheduleMode === 'manual' ? (dueDateValue || null) : null,
        start_duration_from: startScheduleMode === 'system' ? startDurationFromValue : null,
        start_duration_value: startScheduleMode === 'system' ? Number(startDurationValue || 0) : null,
        start_duration_unit: startScheduleMode === 'system' ? startDurationUnitValue : null,
        start_anchor_stage_node_key: startScheduleMode === 'system' ? (startAnchorStageValue || null) : null,
        duration_from: dueScheduleMode === 'system' ? dueDurationFromValue : null,
        duration_value: dueScheduleMode === 'system' ? Number(dueDurationValue || 0) : null,
        duration_unit: dueScheduleMode === 'system' ? dueDurationUnitValue : null,
        due_anchor_stage_node_key: dueScheduleMode === 'system' ? (dueAnchorStageValue || null) : null,
        [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: customFieldValues,
        recurrence_info: {
          ...draftSourceRecurrence,
          [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: customFieldValues,
          ...(activityTags.length > 0 ? { tags: activityTags } : {}),
          ...(String(descriptionDraft || '').trim() ? { description: String(descriptionDraft || '').trim() } : {}),
        },
        metadata: {
          ...sourceMetadata,
          task_type: nextTaskType,
          ...(hasSelectableAssignee ? {
            default_assignee_field: null,
            default_assignee_combo: null,
          } : {}),
          description: String(descriptionDraft || '').trim() || null,
          tags: activityTags,
          [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: customFieldValues,
          start_schedule_mode: startScheduleMode,
          due_schedule_mode: dueScheduleMode,
          start_duration_from: startScheduleMode === 'system' ? startDurationFromValue : null,
          start_duration_value: startScheduleMode === 'system' ? Number(startDurationValue || 0) : null,
          start_duration_unit: startScheduleMode === 'system' ? startDurationUnitValue : null,
          start_anchor_stage_node_key: startScheduleMode === 'system' ? (startAnchorStageValue || null) : null,
          duration_from: dueScheduleMode === 'system' ? dueDurationFromValue : null,
          duration_value: dueScheduleMode === 'system' ? Number(dueDurationValue || 0) : null,
          duration_unit: dueScheduleMode === 'system' ? dueDurationUnitValue : null,
          due_anchor_stage_node_key: dueScheduleMode === 'system' ? (dueAnchorStageValue || null) : null,
        },
      };
    return {
      nextTaskName,
      nextTaskType,
      missingCreationField: customFields.find((field) => field.requiredForCreation && isEmptyFieldValue(field.value)) || null,
      overrides,
    };
  }, [
    activityTags,
    activityTypeValue,
    assigneeValue,
    customFields,
    descriptionDraft,
    draftSourceRecurrence,
    dueAnchorStageValue,
    dueDateValue,
    dueDurationFromValue,
    dueDurationUnitValue,
    dueDurationValue,
    dueScheduleMode,
    resolvedDraftActivityType,
    resolvedDraftTaskName,
    sourceMetadata,
    stage?.activityTypeLabel,
    stage?.title,
    startAnchorStageValue,
    startDateValue,
    startDurationFromValue,
    startDurationUnitValue,
    startDurationValue,
    startScheduleMode,
    taskNameValue,
    wageValue,
    weightValue,
  ]);

  const handleCreateDraftActivity = useCallback(async () => {
    if (!onCreateDraftActivity || creatingDraftActivity) return;
    setCreatingDraftActivity(true);
    try {
      const { nextTaskName, nextTaskType, missingCreationField, overrides } = buildDraftActivityOverrides();
      if (!String(nextTaskName || '').trim()) {
        message.warning('عنوان فعالیت را وارد کنید.');
        return;
      }
      if (!String(nextTaskType || '').trim()) {
        message.warning('نوع فعالیت را انتخاب کنید.');
        return;
      }
      if (missingCreationField) {
        message.warning(`فیلد «${missingCreationField.label}» برای ایجاد فعالیت ضروری است.`);
        return;
      }
      const creationResult = await onCreateDraftActivity(overrides);
      const createdTasks = Array.isArray(creationResult?.createdTasks) ? creationResult.createdTasks : [];
      const createdTask = createdTasks[0] || creationResult?.createdTask || creationResult?.task || null;
      const createdTaskId = String(createdTask?.id || creationResult?.taskId || creationResult?.createdTaskId || '').trim();
      if (Number(creationResult?.createdCount ?? (createdTaskId ? 1 : 0)) <= 0 && !createdTaskId) {
        return;
      }
      if (queuedUploadFiles.length > 0) {
        if (!createdTaskId) {
          message.warning('فعالیت ایجاد شد، اما شناسه فعالیت برای آپلود فایل‌ها برنگشت.');
        } else {
          await uploadFilesForTaskRef.current?.(createdTaskId, queuedUploadFiles, false);
          setQueuedUploadFiles([]);
        }
      }
      clearCreationDraftSnapshot(fieldDraftStorageKey);
      onClose();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ایجاد فعالیت ناموفق بود'));
    } finally {
      setCreatingDraftActivity(false);
    }
  }, [
    buildDraftActivityOverrides,
    creatingDraftActivity,
    fieldDraftStorageKey,
    message,
    onClose,
    onCreateDraftActivity,
    queuedUploadFiles,
  ]);

  const handleSaveDraftActivity = useCallback(async () => {
    if (!onSaveDraftActivity || savingDraftActivity) return;
    setSavingDraftActivity(true);
    try {
      const { overrides } = buildDraftActivityOverrides();
      await onSaveDraftActivity(overrides);
      message.success('پیش‌نویس مرحله ذخیره شد');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ذخیره پیش‌نویس ناموفق بود'));
    } finally {
      setSavingDraftActivity(false);
    }
  }, [buildDraftActivityOverrides, message, onSaveDraftActivity, savingDraftActivity]);

  const handleUnlinkTaskFromProcess = useCallback(async () => {
    if (!taskRecordId || taskActionBusy) return;
    setTaskActionBusy('unlink');
    try {
      const currentRecurrence = parseObject(source?.recurrence_info);
      const nextRecurrence = { ...currentRecurrence };
      delete nextRecurrence.process_group;
      delete nextRecurrence.process_links;
      delete nextRecurrence.process_graph;
      delete nextRecurrence.process_run_id;
      delete nextRecurrence.process_run_stage_id;
      delete nextRecurrence.process_node_key;
      delete nextRecurrence.process_lane_key;
      const nextSourcePatch = buildTaskSourcePatch({
        related_to_module: null,
        source_module_id: null,
        source_record_id: null,
      });
      const patch = {
        ...nextSourcePatch,
        source_template_id: null,
        process_group_id: null,
        process_run_id: null,
        process_run_stage_id: null,
        process_node_key: null,
        process_lane_key: null,
        recurrence_info: nextRecurrence,
      };
      const { error } = await supabase.from('tasks').update(patch).eq('id', taskRecordId);
      if (error) throw error;
      if (source?.process_run_stage_id || source?.source_stage?.id) {
        await syncProcessRunStageFromTask({
          supabaseClient: supabase,
          task: {
            ...source,
            ...patch,
            id: null,
            process_run_stage_id: source?.process_run_stage_id || source?.source_stage?.id,
            status: 'todo',
            assignee_id: null,
            assignee_role_id: null,
            due_date: null,
            start_date: null,
            actual_start_at: null,
            completed_at: null,
          },
        });
      }
      message.success('اتصال فعالیت از فرآیند و رکورد قطع شد');
      onClose();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'قطع اتصال فعالیت ناموفق بود'));
    } finally {
      setTaskActionBusy(null);
    }
  }, [message, onClose, source, taskActionBusy, taskRecordId]);

  const handleDeleteTaskCompletely = useCallback(async () => {
    if (!taskRecordId || taskActionBusy) return;
    setTaskActionBusy('delete');
    try {
      if (source?.process_run_stage_id || source?.source_stage?.id) {
        await syncProcessRunStageFromTask({
          supabaseClient: supabase,
          task: {
            ...source,
            id: null,
            process_run_stage_id: source?.process_run_stage_id || source?.source_stage?.id,
            status: 'todo',
            assignee_id: null,
            assignee_role_id: null,
            due_date: null,
            start_date: null,
            actual_start_at: null,
            completed_at: null,
          },
        });
      }
      await moveModuleRecordsToRecycleBin('tasks', [taskRecordId]);
      message.success('فعالیت به سطل بازیافت منتقل شد');
      onClose();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'حذف فعالیت ناموفق بود'));
    } finally {
      setTaskActionBusy(null);
    }
  }, [message, onClose, source, taskActionBusy, taskRecordId]);

  const confirmUnlinkTaskFromProcess = useCallback(() => {
    Modal.confirm({
      title: 'قطع اتصال فعالیت',
      content: 'این فعالیت فقط از این فرآیند و رکورد جدا می‌شود و خود فعالیت باقی می‌ماند. ادامه می‌دهید؟',
      okText: 'قطع اتصال',
      cancelText: 'انصراف',
      centered: true,
      onOk: handleUnlinkTaskFromProcess,
    });
  }, [handleUnlinkTaskFromProcess]);

  const confirmDeleteTaskCompletely = useCallback(() => {
    Modal.confirm({
      title: 'حذف کامل فعالیت',
      content: 'این فعالیت به سطل بازیافت منتقل می‌شود. ادامه می‌دهید؟',
      okText: 'حذف',
      cancelText: 'انصراف',
      okButtonProps: { danger: true },
      centered: true,
      onOk: handleDeleteTaskCompletely,
    });
  }, [handleDeleteTaskCompletely]);

  const loadInstructions = async () => {
    if (loadedInstructions.length > 0 || instructionIds.length === 0) return;
    setLoadingInstructions(true);
    try {
      const [{ data, error }, { data: filesData }] = await Promise.all([
        supabase
          .from('instructions')
          .select('id, name, system_code, status, department, goal, body, image_url')
          .in('id', instructionIds),
        supabase
          .from('record_files')
          .select('id, record_id, file_url, file_name, mime_type, file_type')
          .eq('module_id', 'instructions')
          .in('record_id', instructionIds),
      ]);
      if (error) throw error;
      const filesByRecordId: Record<string, any[]> = {};
      for (const file of filesData || []) {
        const recordId = String(file.record_id || '');
        if (!filesByRecordId[recordId]) filesByRecordId[recordId] = [];
        filesByRecordId[recordId].push({
          id: String(file.id),
          url: String(file.file_url || ''),
          name: String(file.file_name || file.id),
          mimeType: file.mime_type || null,
          fileType: file.file_type || null,
        });
      }
      const withStatus = (data || []).map((item) => {
        const statusOption = instructionStatusOptions.find((option) => option.value === item?.status);
        return {
          ...item,
          status_label: statusOption?.label || item?.status || null,
          status_color: statusOption?.color || 'default',
          attachments: filesByRecordId[String(item?.id || '')] || [],
        };
      });
      const ordered = instructionIds
        .map((id) => withStatus.find((item) => String(item?.id || '') === id))
        .filter(Boolean);
      setLoadedInstructions(ordered);
      if (ordered.length > 0 && !activeInstructionId) {
        setActiveInstructionId(String(ordered[0]?.id || ''));
      }
    } catch {
      message.error('بارگذاری دستورالعمل‌ها ناموفق بود.');
    } finally {
      setLoadingInstructions(false);
    }
  };

  const handleOpenInstructionsModal = async (instructionId?: string | null) => {
    if (instructionId) setActiveInstructionId(String(instructionId));
    await loadInstructions();
    if (instructionId) setActiveInstructionId(String(instructionId));
    setInstructionsModalOpen(true);
  };

  const applyStageSettingsToDraft = useCallback((targetStage: ProcessV2Stage | null, storedSnapshot: Record<string, any> | null = null) => {
    if (!targetStage) return;
    const targetSource = targetStage?.source && typeof targetStage.source === 'object' ? targetStage.source : {};
    const targetSourceStage = targetSource?.source_stage && typeof targetSource.source_stage === 'object' ? targetSource.source_stage : {};
    const targetSourceMetadata = parseObject(targetSource?.metadata);
    const targetSourceStageMetadata = parseObject(targetSourceStage?.metadata);
    const targetRecurrence = parseObject(targetSource?.recurrence_info);
    const targetSourceStageRecurrence = parseObject(targetSourceStage?.recurrence_info || targetSourceStageMetadata?.recurrence_info);
    const targetTemplateContext = {
      ...processTemplateContextRef.current,
      ...(targetSource?.__process_v2_template_context && typeof targetSource.__process_v2_template_context === 'object' ? targetSource.__process_v2_template_context : {}),
      ...(targetSourceStage?.__process_v2_template_context && typeof targetSourceStage.__process_v2_template_context === 'object' ? targetSourceStage.__process_v2_template_context : {}),
      ...targetSource,
      ...targetSourceMetadata,
      ...targetRecurrence,
      ...targetSourceStage,
      ...targetSourceStageMetadata,
      ...targetSourceStageRecurrence,
      task_name: targetStage?.title || targetSource?.name || targetSource?.stage_name || '',
      task_type: targetSource?.task_type || targetSourceMetadata?.task_type || targetRecurrence?.task_type || targetSourceStage?.task_type || targetSourceStageMetadata?.task_type || targetSourceStageRecurrence?.task_type || '',
    };
    const renderStageTemplateValue = (value: any, type?: FieldType) => (
      renderProcessV2TemplateValueFromRecord(value, targetTemplateContext, type)
    );
    const snapshotValue = (key: string, fallback: any) => (
      storedSnapshot && Object.prototype.hasOwnProperty.call(storedSnapshot, key)
        ? (!isEmptyCreationSnapshotValue(storedSnapshot[key]) || isEmptyFieldValue(fallback) ? storedSnapshot[key] : fallback)
        : fallback
    );
    const targetStatusOptions = buildStatusOptions(targetStage);
    const targetSourceStatus = String(targetSource?.status || '').trim();
    const nextStatus = targetStage.kind === 'draft'
      ? (targetStatusOptions.find((option) => ['todo', 'planned', 'pending', 'waiting'].includes(option.value))?.value || targetStatusOptions[0]?.value || 'todo')
      : (targetSourceStatus || statusValueToV2(targetStage.status));
    setStatusValue(nextStatus);
    const rawRoleAssignee = targetSource?.default_assignee_role_id
      || targetSource?.assignee_role_id
      || targetSourceMetadata?.default_assignee_role_id
      || targetSourceMetadata?.assignee_role_id
      || targetRecurrence?.default_assignee_role_id
      || targetRecurrence?.assignee_role_id
      || targetSourceStage?.default_assignee_role_id
      || targetSourceStage?.assignee_role_id
      || targetSourceStageMetadata?.default_assignee_role_id
      || targetSourceStageMetadata?.assignee_role_id
      || targetSourceStageRecurrence?.default_assignee_role_id
      || targetSourceStageRecurrence?.assignee_role_id;
    const rawUserAssignee = targetSource?.default_assignee_id
      || targetSource?.assignee_id
      || targetSource?.assignee_user_id
      || targetSourceMetadata?.default_assignee_id
      || targetSourceMetadata?.assignee_id
      || targetSourceMetadata?.assignee_user_id
      || targetRecurrence?.default_assignee_id
      || targetRecurrence?.assignee_id
      || targetRecurrence?.assignee_user_id
      || targetSourceStage?.default_assignee_id
      || targetSourceStage?.assignee_id
      || targetSourceStage?.assignee_user_id
      || targetSourceStageMetadata?.default_assignee_id
      || targetSourceStageMetadata?.assignee_id
      || targetSourceStageMetadata?.assignee_user_id
      || targetSourceStageRecurrence?.default_assignee_id
      || targetSourceStageRecurrence?.assignee_id
      || targetSourceStageRecurrence?.assignee_user_id;
    const rawAssigneeReference = pickFirstMeaningful(
      targetSource?.default_assignee_combo,
      targetSourceMetadata?.default_assignee_combo,
      targetRecurrence?.default_assignee_combo,
      targetSourceStage?.default_assignee_combo,
      targetSourceStageMetadata?.default_assignee_combo,
      targetSourceStageRecurrence?.default_assignee_combo,
      targetSource?.default_assignee_field,
      targetSourceMetadata?.default_assignee_field,
      targetRecurrence?.default_assignee_field,
      targetSourceStage?.default_assignee_field,
      targetSourceStageMetadata?.default_assignee_field,
      targetSourceStageRecurrence?.default_assignee_field,
    );
    const resolveAssigneeReference = (value: any) => resolveProcessAssigneeReference(value, targetTemplateContext);
    const resolvedRoleAssignee = resolveAssigneeReference(rawRoleAssignee);
    const resolvedUserAssignee = resolveAssigneeReference(rawUserAssignee);
    const resolvedReferenceAssignee = resolveAssigneeReference(rawAssigneeReference);
    const parsedReferenceAssignee = parseAssigneeValue(resolvedReferenceAssignee, null);
    const assigneeFallbackType = (resolvedRoleAssignee
      || parsedReferenceAssignee.assigneeType === 'role'
      || String(targetSource?.assignee_type || targetSourceMetadata?.assignee_type || targetRecurrence?.assignee_type || '').trim() === 'role')
      ? 'role'
      : 'user';
    const nextAssigneeValue = buildAssigneeSelectValue(
      resolvedRoleAssignee
        || resolvedUserAssignee
        || (parsedReferenceAssignee.assigneeType && parsedReferenceAssignee.assigneeId
          ? `${parsedReferenceAssignee.assigneeType}:${parsedReferenceAssignee.assigneeId}`
          : resolvedReferenceAssignee),
      assigneeFallbackType,
    );
    setAssigneeValue(
      String(snapshotValue(
        'assigneeValue',
        nextAssigneeValue
          || String(targetStage.assigneeLabel || targetSource?.assignee_label || targetSourceMetadata?.assignee_label || '').trim()
          || ''
      ) || '')
    );
    const renderedStageTitle = String(targetStage.title || '').trim();
    const rawSourceTitle = String(
      targetSource?.name
      || targetSource?.stage_name
      || targetSource?.title
      || targetSourceMetadata?.name
      || targetSourceMetadata?.stage_name
      || targetSourceMetadata?.title
      || targetSourceStage?.name
      || targetSourceStage?.stage_name
      || targetSourceStageMetadata?.name
      || targetSourceStageMetadata?.stage_name
      || ''
    ).trim();
    const nextTaskName = targetStage.kind === 'draft'
      ? (renderedStageTitle || String(renderStageTemplateValue(rawSourceTitle, FieldType.TEXT) || rawSourceTitle).trim())
      : (String(renderStageTemplateValue(rawSourceTitle, FieldType.TEXT) || rawSourceTitle).trim() || renderedStageTitle);
    setTaskNameValue(String(snapshotValue('taskNameValue', nextTaskName) || ''));
    const nextActivityType = String(renderStageTemplateValue(pickFirstMeaningful(
      targetSource?.task_type
      || targetSourceMetadata?.task_type
      || targetRecurrence?.task_type
      || targetSourceStage?.task_type
      || targetSourceStageMetadata?.task_type
      || targetSourceStageRecurrence?.task_type
      || targetStage.activityTypeLabel
      || (targetStage.kind === 'draft' ? 'مرحله پیش نویس' : 'فعالیت سازمانی')
    ), FieldType.TEXT) || '').trim();
    setActivityTypeValue(String(snapshotValue('activityTypeValue', nextActivityType) || ''));
    const rawTags = Array.isArray(targetSource?.tags) ? targetSource.tags : (Array.isArray(targetRecurrence?.tags) ? targetRecurrence.tags : []);
    const normalizedTags = normalizeTaskTags(rawTags);
    setActivityTags(Array.isArray(storedSnapshot?.activityTags) ? normalizeTaskTags(storedSnapshot?.activityTags) : normalizedTags);
    const nextDescription = String(renderStageTemplateValue(pickFirstMeaningful(
      targetSource?.description,
      targetSourceMetadata?.description,
      targetRecurrence?.description,
      targetSourceStage?.description,
      targetSourceStageMetadata?.description,
      targetSourceStageRecurrence?.description,
      ''
    ), FieldType.LONG_TEXT) || '').trim();
    setDescriptionDraft(String(snapshotValue('descriptionDraft', nextDescription) || ''));
    const nextReport = String(renderStageTemplateValue(pickFirstMeaningful(targetSource?.task_report, targetRecurrence?.task_report, ''), FieldType.LONG_TEXT) || '').trim();
    setReportDraft(String(snapshotValue('reportDraft', nextReport) || ''));
    const nextWage = renderStageTemplateValue(pickFirstMeaningful(
      targetSource?.wage,
      targetSourceMetadata?.wage,
      targetRecurrence?.wage,
      targetSourceStage?.wage,
      targetSourceStageMetadata?.wage,
      targetSourceStageRecurrence?.wage,
      '0'
    ), FieldType.NUMBER);
    const nextWeight = renderStageTemplateValue(pickFirstMeaningful(
      targetSource?.weight,
      targetSourceMetadata?.weight,
      targetRecurrence?.weight,
      targetSourceStage?.weight,
      targetSourceStageMetadata?.weight,
      targetSourceStageRecurrence?.weight,
      '0'
    ), FieldType.NUMBER);
    setWageValue(String(snapshotValue('wageValue', nextWage ?? '0')));
    setWeightValue(String(snapshotValue('weightValue', nextWeight ?? '0')));
    const nextDueDate = String(renderStageTemplateValue(pickFirstMeaningful(
      targetSource?.planned_due_at,
      targetSource?.due_date,
      targetSourceMetadata?.planned_due_at,
      targetSourceMetadata?.due_date,
      targetRecurrence?.due_date,
      targetRecurrence?.planned_due_at,
      targetSourceStage?.planned_due_at,
      targetSourceStage?.due_date,
      targetSourceStageMetadata?.planned_due_at,
      targetSourceStageMetadata?.due_date,
      targetSourceStageRecurrence?.planned_due_at,
      targetSourceStageRecurrence?.due_date,
      ''
    ), FieldType.DATETIME) || '').trim();
    const nextStartDate = String(renderStageTemplateValue(pickFirstMeaningful(
      targetSource?.start_date,
      targetSource?.planned_start_at,
      targetSource?.actual_start_at,
      targetSourceMetadata?.start_date,
      targetSourceMetadata?.planned_start_at,
      targetRecurrence?.start_date,
      targetRecurrence?.planned_start_at,
      targetSourceStage?.start_date,
      targetSourceStage?.planned_start_at,
      targetSourceStageMetadata?.start_date,
      targetSourceStageMetadata?.planned_start_at,
      targetSourceStageRecurrence?.start_date,
      targetSourceStageRecurrence?.planned_start_at,
      ''
    ), FieldType.DATETIME) || '').trim();
    setDueDateValue(String(snapshotValue('dueDateValue', nextDueDate) || ''));
    setStartDateValue(String(snapshotValue('startDateValue', nextStartDate) || ''));
    setStartScheduleMode(snapshotValue('startScheduleMode', nextStartDate ? 'manual' : 'system') === 'manual' ? 'manual' : 'system');
    setDueScheduleMode(snapshotValue('dueScheduleMode', nextDueDate ? 'manual' : 'system') === 'manual' ? 'manual' : 'system');
    setStartDurationFromValue(String(snapshotValue('startDurationFromValue', pickFirstMeaningful(
      targetSource?.start_duration_from,
      targetRecurrence?.start_duration_from,
      targetSourceMetadata?.start_duration_from,
      targetSourceStage?.start_duration_from,
      targetSourceStageRecurrence?.start_duration_from,
      targetSourceStageMetadata?.start_duration_from,
      targetSource?.duration_start_from,
      targetSourceMetadata?.duration_start_from,
      targetSourceStage?.duration_start_from,
      targetSourceStageRecurrence?.duration_start_from,
      targetSourceStageMetadata?.duration_start_from,
      'project_start'
    )) || 'project_start').trim() || 'project_start');
    setStartDurationValue(String(snapshotValue('startDurationValue', pickFirstMeaningful(
      targetSource?.start_duration_value,
      targetRecurrence?.start_duration_value,
      targetSourceMetadata?.start_duration_value,
      targetSourceStage?.start_duration_value,
      targetSourceStageRecurrence?.start_duration_value,
      targetSourceStageMetadata?.start_duration_value,
      targetSource?.duration_start_value,
      targetSourceMetadata?.duration_start_value,
      targetSourceStage?.duration_start_value,
      targetSourceStageRecurrence?.duration_start_value,
      targetSourceStageMetadata?.duration_start_value,
      '0'
    ))));
    const nextStartUnit = String(snapshotValue('startDurationUnitValue', pickFirstMeaningful(
      targetSource?.start_duration_unit,
      targetRecurrence?.start_duration_unit,
      targetSourceMetadata?.start_duration_unit,
      targetSourceStage?.start_duration_unit,
      targetSourceStageRecurrence?.start_duration_unit,
      targetSourceStageMetadata?.start_duration_unit,
      targetSource?.duration_start_unit,
      targetSourceMetadata?.duration_start_unit,
      targetSourceStage?.duration_start_unit,
      targetSourceStageRecurrence?.duration_start_unit,
      targetSourceStageMetadata?.duration_start_unit,
      'day'
    )));
    setStartDurationUnitValue(nextStartUnit === 'hour' ? 'hour' : 'day');
    setStartAnchorStageValue(String(snapshotValue('startAnchorStageValue', pickFirstMeaningful(
      targetSource?.start_anchor_stage_node_key,
      targetRecurrence?.start_anchor_stage_node_key,
      targetSourceMetadata?.start_anchor_stage_node_key,
      targetSourceStage?.start_anchor_stage_node_key,
      targetSourceStageRecurrence?.start_anchor_stage_node_key,
      targetSourceStageMetadata?.start_anchor_stage_node_key,
      ''
    )) || '').trim());
    setDueDurationFromValue(String(snapshotValue('dueDurationFromValue', pickFirstMeaningful(
      targetSource?.duration_from,
      targetRecurrence?.duration_from,
      targetSourceMetadata?.duration_from,
      targetSourceStage?.duration_from,
      targetSourceStageRecurrence?.duration_from,
      targetSourceStageMetadata?.duration_from,
      'project_start'
    )) || 'project_start').trim() || 'project_start');
    setDueDurationValue(String(snapshotValue('dueDurationValue', pickFirstMeaningful(
      targetSource?.duration_value,
      targetRecurrence?.duration_value,
      targetSourceMetadata?.duration_value,
      targetSourceStage?.duration_value,
      targetSourceStageRecurrence?.duration_value,
      targetSourceStageMetadata?.duration_value,
      '0'
    ))));
    const nextDueUnit = String(snapshotValue('dueDurationUnitValue', pickFirstMeaningful(
      targetSource?.duration_unit,
      targetRecurrence?.duration_unit,
      targetSourceMetadata?.duration_unit,
      targetSourceStage?.duration_unit,
      targetSourceStageRecurrence?.duration_unit,
      targetSourceStageMetadata?.duration_unit,
      'day'
    )));
    setDueDurationUnitValue(nextDueUnit === 'hour' ? 'hour' : 'day');
    setDueAnchorStageValue(String(snapshotValue('dueAnchorStageValue', pickFirstMeaningful(
      targetSource?.due_anchor_stage_node_key,
      targetRecurrence?.due_anchor_stage_node_key,
      targetSourceMetadata?.due_anchor_stage_node_key,
      targetSourceStage?.due_anchor_stage_node_key,
      targetSourceStageRecurrence?.due_anchor_stage_node_key,
      targetSourceStageMetadata?.due_anchor_stage_node_key,
      ''
    )) || '').trim());
    const storedCustomFieldValues = storedSnapshot?.customFieldValues && typeof storedSnapshot.customFieldValues === 'object'
      ? storedSnapshot.customFieldValues
      : {};
    setCustomFields(buildCustomFields(targetStage).map((field) => (
      Object.prototype.hasOwnProperty.call(storedCustomFieldValues, field.key)
        && (!isEmptyCreationSnapshotValue(storedCustomFieldValues[field.key]) || isEmptyFieldValue(field.value))
        ? { ...field, value: storedCustomFieldValues[field.key] }
        : field
    )));
  }, []);

  useEffect(() => {
    if (!open) {
      initializedModalKeyRef.current = '';
      return;
    }
    if (!modalInitKey || initializedModalKeyRef.current === modalInitKey) return;
    initializedModalKeyRef.current = modalInitKey;
    setDraftCopyTemplateId(isTemplateBackedDraft ? (templateBackedTemplateId || undefined) : (runProcess?.templateId || undefined));
    setDraftCopyStageId(isTemplateBackedDraft ? (templateBackedStageId || stage?.id || undefined) : undefined);
    setTemplateCopyStages([]);
    const storedCreationDraft = readCreationDraftSnapshot(fieldDraftStorageKey);
    applyStageSettingsToDraft(stage, storedCreationDraft);
    setIsLocked(false);
    setFilesExpanded(false);
    setPreviewFile(null);
    setModalFiles([]);
    setStarredFileIds(new Set());
    setUploadingFile(false);
    setQueuedUploadFiles([]);
    setInstructionsModalOpen(false);
    setLoadingInstructions(false);
    setLoadedInstructions([]);
    setActiveInstructionId(null);
    setConversationCount(0);
    setChangelogCount(0);
    setSideTab('files');
    setCreatingDraftActivity(false);
    setSavingDraftActivity(false);
    setTaskActionBusy(null);
    setSavingFieldKey(null);
    setLocalTaskPatch({});
  }, [applyStageSettingsToDraft, fieldDraftStorageKey, isDraftActivityCreationMode, isTemplateBackedDraft, modalInitKey, open, runProcess?.templateId, stage, templateBackedStageId, templateBackedTemplateId]);

  useLayoutEffect(() => {
    if (!open || !isDraftActivityCreationMode) return;
    if (fieldDraftStorageKey && readCreationDraftSnapshot(fieldDraftStorageKey)) return;
    setTaskNameValue(resolvedDraftTaskName || '');
    setActivityTypeValue(resolvedDraftActivityType || '');
  }, [fieldDraftStorageKey, isDraftActivityCreationMode, open, resolvedDraftActivityType, resolvedDraftTaskName]);

  useEffect(() => {
    if (!open || !fieldDraftStorageKey) return;
    const customFieldValues = customFields.reduce<Record<string, any>>((acc, field) => {
      acc[field.key] = field.value;
      return acc;
    }, {});
    writeCreationDraftSnapshot(fieldDraftStorageKey, {
      taskNameValue: taskNameValue || resolvedDraftTaskName || '',
      activityTypeValue: activityTypeValue || resolvedDraftActivityType || '',
      assigneeValue,
      descriptionDraft,
      reportDraft,
      activityTags,
      wageValue,
      weightValue,
      dueDateValue,
      startDateValue,
      startScheduleMode,
      dueScheduleMode,
      startDurationFromValue,
      startDurationValue,
      startDurationUnitValue,
      startAnchorStageValue,
      dueDurationFromValue,
      dueDurationValue,
      dueDurationUnitValue,
      dueAnchorStageValue,
      customFieldValues,
    });
  }, [
    activityTags,
    activityTypeValue,
    assigneeValue,
    fieldDraftStorageKey,
    customFields,
    descriptionDraft,
    dueAnchorStageValue,
    dueDateValue,
    dueDurationFromValue,
    dueDurationUnitValue,
    dueDurationValue,
    dueScheduleMode,
    isDraftActivityCreationMode,
    open,
    reportDraft,
    resolvedDraftActivityType,
    resolvedDraftTaskName,
    startAnchorStageValue,
    startDateValue,
    startDurationFromValue,
    startDurationUnitValue,
    startDurationValue,
    startScheduleMode,
    taskNameValue,
    wageValue,
    weightValue,
  ]);

  useEffect(() => {
    if (!open) return;
    void loadTaskTypeOptions(false);
  }, [loadTaskTypeOptions, open]);

  useEffect(() => {
    if (!open || !draftCopyStage) return;
    applyStageSettingsToDraft(draftCopyStage);
  }, [applyStageSettingsToDraft, draftCopyStage, open]);

  useEffect(() => {
    if (!open || isTemplateBackedDraft || !draftCopyTemplateId) {
      setTemplateCopyStages([]);
      return;
    }
    let cancelled = false;
    setTemplateCopyStagesLoading(true);
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('process_template_stages')
          .select('*')
          .eq('template_id', draftCopyTemplateId)
          .order('sort_order', { ascending: true });
        if (error) throw error;
        if (cancelled) return;
        setTemplateCopyStages((data || []).map(mapTemplateStageToCopyStage).filter((item) => item.id));
      } catch {
        if (!cancelled) setTemplateCopyStages([]);
      } finally {
        if (!cancelled) setTemplateCopyStagesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draftCopyTemplateId, isTemplateBackedDraft, open]);

  useEffect(() => {
    if (!open || !taskRecordId) return;
    let cancelled = false;
    loadRecordFileItems('tasks', taskRecordId, stage?.title || null, 'full')
      .then((items) => {
        if (cancelled) return;
        const nextFiles = (items || []).map(mapFileItem);
        setModalFiles(nextFiles);
        setStarredFileIds(new Set(nextFiles.filter((file) => file.starred).map((file) => file.id)));
      })
      .catch(() => {
        if (!cancelled) setModalFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, stage?.title, taskRecordId]);

  useEffect(() => {
    if (!open || isDraftActivityCreationMode || !taskRecordId) {
      setConversationCount(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { count } = await supabase
          .from('notes')
          .select('id', { count: 'exact', head: true })
          .eq('module_id', 'tasks')
          .eq('record_id', taskRecordId);
        if (!cancelled) setConversationCount(Math.max(0, Number(count || 0)));
      } catch {
        if (!cancelled) setConversationCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDraftActivityCreationMode, open, taskRecordId]);

  useEffect(() => {
    if (!open || !taskRecordId) {
      setChangelogCount(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { count } = await supabase
          .from('changelogs')
          .select('id', { count: 'exact', head: true })
          .eq('module_id', 'tasks')
          .eq('record_id', taskRecordId);
        if (!cancelled) setChangelogCount(count || 0);
      } catch {
        if (!cancelled) setChangelogCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, taskRecordId]);

  const taskTitle = isDraftActivityCreationMode
    ? (taskNameValue || resolvedDraftTaskName || 'فعالیت جدید')
    : stage?.title || 'جزئیات فعالیت';
  const draftTaskNameDisplayValue = isDraftActivityCreationMode
    ? (taskNameValue || resolvedDraftTaskName)
    : taskNameValue;
  const draftActivityTypeDisplayValue = isDraftActivityCreationMode
    ? (activityTypeValue || resolvedDraftActivityType)
    : activityTypeValue;
  const actionCount = toPersianNumber(stage?.actionCount ?? 0);
  const headerStatusValue = isDraftActivityCreationMode ? 'draft' : statusValue;
  const headerStatusLabel = isDraftActivityCreationMode
    ? 'پیش نویس'
    : (statusLabelMap[statusValue] || statusLabel[statusValue] || statusValue);
  const currentStatusColor = getTaskStatusSwatchColor(headerStatusValue, source) || statusColor[headerStatusValue] || '#64748b';
  const relatedRows = useMemo<RelatedRecordRow[]>(() => {
    const refs = collectProcessRelatedRecordRefs(process);
    const rows = refs.map((ref) => {
      const key = buildRecordReferenceKey(ref.moduleId, ref.recordId);
      return {
        label: getModuleLabel(ref.moduleId),
        value: relatedLabelMap[key] || getModuleLabel(ref.moduleId),
        moduleId: ref.moduleId,
        recordId: ref.recordId,
      };
    });
    return rows;
  }, [process, relatedLabelMap]);
  const primaryProcessRecordLink = useMemo(() => {
    const ref = collectProcessRelatedRecordRefs(process)[0];
    return ref || null;
  }, [process]);
  const renderRouteText = useCallback((to: string, className: string, children: React.ReactNode) => {
    void to;
    void isInsideRouter;
    return <span className={className}>{children}</span>;
  }, [isInsideRouter]);
  const formattedStageDueLabel = useMemo(() => {
    const rawDue = String(source?.due_date || source?.planned_due_at || stage?.dueLabel || '').trim();
    return formatProcessStageDueLabel(rawDue) || '';
  }, [source?.due_date, source?.planned_due_at, stage?.dueLabel]);
  const reloadTaskFiles = useCallback(async () => {
    if (!taskRecordId) {
      setModalFiles([]);
      setStarredFileIds(new Set());
      return;
    }
    const nextFiles = (await loadRecordFileItems('tasks', taskRecordId, stage?.title || null, 'full')).map(mapFileItem);
    setModalFiles(nextFiles);
    setStarredFileIds(new Set(nextFiles.filter((file) => file.starred).map((file) => file.id)));
  }, [stage?.title, taskRecordId]);
  const uploadFilesForTask = useCallback(async (targetTaskId: string, files: File[], shouldReload = true) => {
    const normalizedTaskId = String(targetTaskId || '').trim();
    const selectedFiles = Array.from(files || []).filter(Boolean);
    if (!normalizedTaskId || selectedFiles.length === 0) return;
    setUploadingFile(true);
    try {
      for (const file of selectedFiles) {
        const baseName = String(file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'file';
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${baseName}`;
        const filePath = `record_files/tasks/${normalizedTaskId}/${fileName}`;
        await uploadFileWithProgress({
          client: fileStorageClient,
          bucket: FILE_STORAGE_BUCKET,
          path: filePath,
          file,
          label: file.name || 'فایل فعالیت',
          detail: 'فایل فعالیت',
        });
        const { data: urlData } = fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(filePath);
        const fileUrl = String(urlData?.publicUrl || '').trim();
        if (!fileUrl) throw new Error('TASK_FILE_URL_MISSING');
        const mimeType = file.type || null;
        const fileType = mimeType?.startsWith('image/')
          ? 'image'
          : mimeType?.startsWith('video/')
          ? 'video'
          : mimeType?.startsWith('audio/')
          ? 'audio'
          : 'file';
        const hasFileManagerTables = await detectFileManagerTables(supabase, false);
        if (hasFileManagerTables) {
          await createFileManagerOriginForUpload({
            moduleId: 'tasks',
            recordId: normalizedTaskId,
            recordTitle: taskTitle,
            fileUrl,
            fileName: file.name || null,
            mimeType,
            fileType,
            sortOrder: modalFiles.length,
            starred: fileType === 'image',
          });
        } else {
          const { error } = await supabase.from('record_files').insert([{
            module_id: 'tasks',
            record_id: normalizedTaskId,
            file_url: fileUrl,
            file_type: fileType === 'image' || fileType === 'video' ? fileType : 'file',
            file_name: file.name || null,
            mime_type: mimeType,
            sort_order: modalFiles.length,
          }]);
          if (error) throw error;
        }
      }
      if (shouldReload && normalizedTaskId === taskRecordId) {
        await reloadTaskFiles();
      }
      message.success('فایل فعالیت آپلود شد');
    } catch (error: any) {
      if (!isUploadCanceledError(error)) {
        message.error(toFaErrorMessage(error, 'آپلود فایل فعالیت ناموفق بود'));
      }
      throw error;
    } finally {
      setUploadingFile(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  }, [message, modalFiles.length, reloadTaskFiles, taskRecordId, taskTitle]);
  uploadFilesForTaskRef.current = uploadFilesForTask;
  const handleUploadFiles = useCallback(async (files: FileList | File[] | null) => {
    const selectedFiles = Array.from(files || []).filter(Boolean);
    if (selectedFiles.length === 0) return;
    if (!taskRecordId || isDraftActivityCreationMode) {
      setQueuedUploadFiles((current) => [...current, ...selectedFiles]);
      message.success(`${toPersianNumber(selectedFiles.length)} فایل پس از ایجاد فعالیت آپلود می‌شود`);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
      return;
    }
    try {
      await uploadFilesForTask(taskRecordId, selectedFiles, true);
    } catch {
      // Error message is handled inside uploadFilesForTask.
    }
  }, [isDraftActivityCreationMode, message, taskRecordId, uploadFilesForTask]);
  const writeModalFieldDraftPatch = useCallback((patch: Record<string, any>) => {
    if (!open || !fieldDraftStorageKey) return;
    const current = readCreationDraftSnapshot(fieldDraftStorageKey) || {};
    writeCreationDraftSnapshot(fieldDraftStorageKey, {
      ...current,
      ...patch,
    });
  }, [fieldDraftStorageKey, open]);
  const shouldShowTimingStageAnchor = useCallback((anchorType: string) => (
    String(anchorType || '').trim().startsWith('specific_stage_')
  ), []);
  const renderScheduleEditor = useCallback((config: {
    title: string;
    mode: 'manual' | 'system';
    onModeChange: (value: 'manual' | 'system') => void;
    manualValue: string;
    onManualSave: (value: string) => void;
    durationFrom: string;
    onDurationFromSave: (value: string) => void;
    durationValue: string;
    onDurationValueSave: (value: string) => void;
    durationUnit: string;
    onDurationUnitSave: (value: string) => void;
    anchorStage: string;
    onAnchorStageSave: (value: string) => void;
  }) => (
    <div className="sm:col-span-2 rounded-lg border border-gray-200 bg-white/70 p-2 dark:border-gray-700 dark:bg-white/5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-bold text-gray-500 dark:text-gray-300">{config.title}</div>
        <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-[11px] dark:border-gray-700 dark:bg-white/5">
          {[
            { value: 'manual' as const, label: 'دستی' },
            { value: 'system' as const, label: 'سیستمی' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => config.onModeChange(option.value)}
              className={`rounded-md px-2 py-1 font-bold transition ${
                config.mode === option.value
                  ? 'bg-white text-[rgba(var(--brand-700-rgb),1)] shadow-sm dark:bg-white/10 dark:text-[rgba(var(--brand-100-rgb),1)]'
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {config.mode === 'manual' ? (
        <InlineEditableField
          label={config.title}
          value={config.manualValue}
          onSave={config.onManualSave}
          fieldType={FieldType.DATETIME}
          forceEditMode
        />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(6rem,0.45fr)_minmax(6rem,0.45fr)_minmax(0,1.3fr)]">
          <InlineEditableField
            label="مقدار"
            value={config.durationValue}
            onSave={config.onDurationValueSave}
            fieldType={FieldType.NUMBER}
            forceEditMode
          />
          <InlineEditableField
            label="واحد"
            value={config.durationUnit}
            onSave={config.onDurationUnitSave}
            fieldType={FieldType.SELECT}
            forceEditMode
            options={[
              { value: 'hour', label: 'ساعت' },
              { value: 'day', label: 'روز' },
            ]}
          />
          <InlineEditableField
            label="بعد از"
            value={config.durationFrom}
            onSave={config.onDurationFromSave}
            fieldType={FieldType.SELECT}
            forceEditMode
            options={timingAnchorOptions}
          />
          {shouldShowTimingStageAnchor(config.durationFrom) ? (
            <div className="sm:col-span-3">
              <InlineEditableField
                label="مرحله مبنا"
                value={config.anchorStage}
                onSave={config.onAnchorStageSave}
                fieldType={FieldType.SELECT}
                forceEditMode
                options={processStageAnchorOptions}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  ), [processStageAnchorOptions, shouldShowTimingStageAnchor, timingAnchorOptions]);

  const aiProcessContext = useMemo(() => ({
    record_type: 'process_task',
    process: {
      id: process.id,
      title: process.title,
      mode: process.mode,
      template_id: runProcess?.templateId || process.id,
      template_title: runProcess?.templateTitle || process.title,
      selected_stage_id: stage?.id || null,
      selected_stage_title: stage?.title || null,
      selected_lane_title: laneTitle || null,
    },
    lanes: process.lanes.map((lane) => ({
      id: lane.id,
      title: lane.title,
      collapsed: !!lane.collapsed,
      stages: lane.stages.map((item) => ({
        id: item.id,
        title: item.title,
        kind: item.kind,
        status: item.status,
        assignee: item.assigneeLabel || null,
        activity_type: item.activityTypeLabel || null,
        due: item.dueLabel || null,
        action_count: item.actionCount ?? 0,
        is_current: item.id === stage?.id,
      })),
    })),
    related_records: relatedRows.map((row) => ({
      module_id: row.moduleId,
      title: row.value,
      label: row.label,
    })),
  }), [laneTitle, process, relatedRows, stage?.id, stage?.title]);

  useEffect(() => {
    if (!open || sideTab !== 'ai' || !taskRecordId || typeof window === 'undefined') return;
    const detail: AssistantContext = {
      route: `/tasks/${taskRecordId}`,
      mode: 'record',
      moduleId: 'tasks',
      recordId: taskRecordId,
      visibleRecordIds: [],
      selectedRecordIds: [taskRecordId],
      processFieldKey: 'process_v2_task',
      selectedProcessId: process.id,
      selectedProcessGroupId: process.id,
      availableProcesses: [{
        id: process.id,
        label: process.title,
        templateId: runProcess?.templateId || process.id,
        templateName: runProcess?.templateTitle || process.title,
        stageCount: process.lanes.reduce((sum, lane) => sum + lane.stages.length, 0),
      }],
      processGuideContext: aiProcessContext,
    };
    window.dispatchEvent(new CustomEvent(AI_CONTEXT_EVENT, { detail }));
  }, [aiProcessContext, open, process, sideTab, taskRecordId]);

  useEffect(() => {
    if (!open) return;
    const refs = collectProcessRelatedRecordRefs(process);
    if (refs.length === 0) {
      setRelatedLabelMap({});
      return;
    }
    let cancelled = false;
    fetchRecordReferenceLabels(supabase, refs).then((labels) => {
      if (!cancelled) setRelatedLabelMap(labels || {});
    }).catch(() => {
      if (!cancelled) setRelatedLabelMap({});
    });
    return () => {
      cancelled = true;
    };
  }, [open, process]);

  return (
    <>
    <Modal
      rootClassName="task-quick-modal-root process-task-v2-modal-root"
      className="task-quick-modal process-task-v2-modal"
      open={open}
      onCancel={onClose}
      footer={null}
      title={null}
      closable={false}
      centered
      destroyOnHidden
      width={860}
      maskClosable={false}
      style={{ maxWidth: 'calc(100vw - 1rem)' }}
      styles={{
        body: { padding: 0, overflow: 'hidden' },
        content: { overflow: 'hidden' },
      }}
    >
      <div
        data-testid="global-process-modal"
        data-module-id={primaryProcessRecordLink?.moduleId || undefined}
        data-record-id={primaryProcessRecordLink?.recordId || undefined}
        data-task-id={taskRecordId || undefined}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-full overflow-x-hidden overflow-y-auto font-['Peyda']"
        dir="rtl"
        style={{
          width: '100%',
          maxWidth: 'calc(100vw - 1rem)',
          maxHeight: 'min(80vh, 43rem)',
          padding: '0.75rem',
        }}
      >
        <div className="mb-3 flex items-start justify-between gap-3 border-b border-[rgba(var(--brand-200-rgb),0.45)] pb-2 dark:border-[rgba(var(--brand-300-rgb),0.18)]">
          <div className="min-w-0 space-y-2">
            <h4 className="m-0 line-clamp-2 text-sm font-bold text-[rgba(var(--brand-800-rgb),1)] dark:text-gray-100">{taskTitle}</h4>
            <div className="flex flex-wrap items-center gap-1.5">
              <Tag
                className={`!m-0 !rounded-full !border !px-2.5 !py-0.5 !text-[11px] !font-black ${statusTagClass[headerStatusValue] || ''}`}
                style={!statusTagClass[headerStatusValue] ? {
                  borderColor: `${currentStatusColor}55`,
                  backgroundColor: `${currentStatusColor}18`,
                  color: currentStatusColor,
                } : undefined}
              >
                {headerStatusLabel}
              </Tag>
              <Tag className="!m-0 !rounded-full !text-[11px] !font-bold">{draftActivityTypeDisplayValue || '-'}</Tag>
              <Tag className="!m-0 !rounded-full !text-[11px] !font-bold">{actionCount} اقدام</Tag>
              {savingFieldKey ? (
                <Tag className="!m-0 !rounded-full !text-[11px] !font-bold" color="processing">
                  در حال ذخیره
                </Tag>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
            <Tooltip title={isLocked ? 'باز کردن رکورد' : 'قفل کردن رکورد'}>
              <Button
                type="text"
                shape="circle"
                icon={isLocked ? <LockOutlined /> : <UnlockOutlined />}
                onClick={() => setIsLocked((current) => !current)}
                aria-label={isLocked ? 'باز کردن رکورد' : 'قفل کردن رکورد'}
                className={isLocked ? '!text-red-600' : '!text-slate-500'}
              />
            </Tooltip>
            <Button type="text" shape="circle" icon={<CloseOutlined />} onClick={onClose} aria-label="بستن" />
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-stretch gap-2 rounded-lg border border-gray-100 bg-gray-50/70 p-2 dark:border-gray-700 dark:bg-transparent">
          <div className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-white px-2 py-2 dark:bg-white/5">
            {isDraftActivityCreationMode ? (
              <div className="grid w-full grid-cols-1 items-end gap-2 md:grid-cols-2">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <label className="shrink-0 text-sm font-bold text-gray-800 dark:text-gray-100">
                      عنوان فعالیت: <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={draftTaskNameDisplayValue}
                      onChange={(event) => setTaskNameValue(event.target.value)}
                      placeholder="عنوان فعالیت"
                      className="!h-10 !min-w-0 !rounded-lg !text-right !font-semibold"
                    />
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <label className="shrink-0 text-sm font-bold text-gray-800 dark:text-gray-100">
                      نوع فعالیت: <span className="text-red-500">*</span>
                    </label>
                    <DynamicSelectField
                      value={draftActivityTypeDisplayValue}
                      onChange={(value) => setActivityTypeValue(String(value || '').trim())}
                      options={taskTypeOptions.length > 0 ? taskTypeOptions : []}
                      category={taskTypeField?.dynamicOptionsCategory || 'task_type'}
                      protectedValues={(taskTypeField?.options || []).map((item: any) => String(item?.value || '')).filter(Boolean)}
                      placeholder="انتخاب کنید"
                      className="w-full"
                      onOptionsUpdate={() => void loadTaskTypeOptions(true)}
                      overlayZIndexBase={16030}
                      modalZIndex={16040}
                      pickerTitle="نوع فعالیت"
                      getPopupContainer={resolveSelectPopupContainer}
                    />
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="mb-1 text-[11px] font-bold text-gray-500 dark:text-gray-300">
                    کپی کردن فعالیت از فرآیند
                  </div>
                  <AdaptiveSelectField
                    value={draftCopyTemplateId}
                    onChange={(value) => {
                      setDraftCopyTemplateId(String(value || '') || undefined);
                      setDraftCopyStageId(undefined);
                    }}
                    options={processTemplateOptions}
                    allowClear
                    disabled={isTemplateBackedDraft}
                    placeholder="انتخاب الگوی فرآیند"
                    pickerTitle="انتخاب الگوی فرآیند"
                    className="w-full"
                  />
                </div>
                <div className="min-w-0">
                  <div className="mb-1 text-[11px] font-bold text-gray-500 dark:text-gray-300">
                    انتخاب پیش نویس فعالیت
                  </div>
                  <AdaptiveSelectField
                    value={draftCopyStageId}
                    onChange={(value) => setDraftCopyStageId(String(value || '') || undefined)}
                    options={draftStageOptions}
                    allowClear
                    disabled={isTemplateBackedDraft || draftStageOptions.length === 0}
                    loading={templateCopyStagesLoading}
                    placeholder={draftStageOptions.length > 0 ? 'انتخاب پیش‌نویس فعالیت' : 'پیش‌نویسی برای کپی وجود ندارد'}
                    pickerTitle="انتخاب پیش نویس فعالیت"
                    className="w-full"
                  />
                </div>
              </div>
            ) : (
              <TaskStatusActionStrip
                options={effectiveStatusOptions}
                currentValue={statusValue}
                savingValue={savingStatusValue}
                onChange={handleStatusActionClick}
                getColor={(value) => getTaskStatusSwatchColor(value, taskForActions || source) || '#64748b'}
                getIconKey={(value, option) => option.icon || getTaskStatusIconKey(value, taskForActions || source)}
              />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row" dir="ltr">
          <aside className="min-w-0 space-y-3 lg:w-[17rem] lg:shrink-0" dir="rtl">
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-white/5">
              <div className="flex items-center justify-center gap-1 border-b border-gray-100 bg-gray-50/70 px-2 py-1.5 dark:border-gray-700 dark:bg-white/5">
                {([
                  { key: 'files' as const, title: 'فایل‌ها', icon: <FileOutlined />, count: modalFiles.length },
                  { key: 'conversation' as const, title: 'گفتگوها', icon: <MessageOutlined />, count: conversationCount },
                  { key: 'ai' as const, title: 'هوش مصنوعی', icon: <AiSparkleIcon className="h-4 w-4" />, count: 0 },
                  { key: 'instructions' as const, title: 'دستورالعمل‌ها', icon: <ReadOutlined />, count: instructionIds.length },
                  { key: 'changelogs' as const, title: 'آخرین تغییرات', icon: <HistoryOutlined />, count: changelogCount },
                ]).map((tab) => {
                  const active = sideTab === tab.key;
                  return (
                    <Tooltip key={tab.key} title={tab.title}>
                      <Badge count={tab.count > 0 ? toPersianNumber(tab.count) : 0} size="small" offset={[-2, 3]}>
                        <button
                          type="button"
                          onClick={() => {
                            setSideTab(tab.key);
                            if (tab.key === 'instructions' && instructionIds.length > 0) void loadInstructions();
                          }}
                          className={`inline-flex h-8 w-10 items-center justify-center rounded-lg border text-[16px] transition ${
                            active
                              ? 'border-[rgba(var(--brand-400-rgb),0.75)] bg-[rgba(var(--brand-50-rgb),0.95)] text-[rgba(var(--brand-800-rgb),1)] shadow-[0_7px_16px_rgba(var(--brand-700-rgb),0.16)] ring-2 ring-[rgba(var(--brand-200-rgb),0.65)] dark:border-[rgba(var(--brand-300-rgb),0.45)] dark:bg-[rgba(var(--brand-500-rgb),0.18)] dark:text-[rgba(var(--brand-100-rgb),1)]'
                              : 'border-transparent text-gray-400 opacity-70 hover:bg-white hover:text-gray-700 hover:opacity-100 dark:text-gray-500 dark:hover:bg-white/10 dark:hover:text-gray-200'
                          }`}
                          aria-label={tab.title}
                        >
                          {tab.icon}
                        </button>
                      </Badge>
                    </Tooltip>
                  );
                })}
              </div>

              <div className="p-2">
                {sideTab === 'files' ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      className="block w-full cursor-pointer rounded-lg text-right"
                      onClick={mainImageFile ? () => setPreviewFile(mainImageFile) : undefined}
                      disabled={!mainImageFile}
                    >
                      <RecordImageBox
                        moduleId="tasks"
                        recordId={taskRecordId || undefined}
                        imageUrl={mainImageFile?.fileUrl || source?.image_url || null}
                        canEdit={false}
                        canViewFilesManager={false}
                        compact
                        filesButtonLabel="فایل‌ها"
                      />
                    </button>
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                      <input
                        ref={uploadInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(event) => void handleUploadFiles(event.target.files)}
                      />
                      <Button
                        block
                        icon={<UploadOutlined />}
                        loading={uploadingFile}
                        onClick={() => {
                          uploadInputRef.current?.click();
                        }}
                        className="!h-9 !rounded-lg"
                      >
                        {queuedUploadFiles.length > 0
                          ? `آپلود فایل (${toPersianNumber(queuedUploadFiles.length)})`
                          : 'آپلود فایل'}
                      </Button>
                      <Button
                        block
                        icon={<FolderOpenOutlined />}
                        disabled={!hasFiles}
                        onClick={() => setFilesExpanded((current) => !current)}
                        className="!h-9 !rounded-lg lg:!hidden"
                      >
                        مشاهده فایل‌ها
                      </Button>
                    </div>
                    <div className={`${filesExpanded ? 'block' : 'hidden'} space-y-1.5 lg:block`}>
                      {modalFiles.map((file) => (
                        <button
                          key={file.id}
                          type="button"
                          onClick={() => setPreviewFile(file)}
                          className="flex w-full min-w-0 items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5 text-right text-xs transition hover:bg-white dark:bg-white/5 dark:hover:bg-white/10"
                        >
                          <FilePreviewThumb file={file} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold text-gray-700 dark:text-gray-200">{file.title}</div>
                            <div className="mt-0.5 text-[10px] text-gray-400">{file.meta}</div>
                          </div>
                          <Tooltip title={starredFileIds.has(file.id) ? 'ستاره‌دار' : 'ستاره‌دار کردن'}>
                            <Button
                              size="small"
                              type={starredFileIds.has(file.id) ? 'primary' : 'text'}
                              icon={starredFileIds.has(file.id) ? <StarFilled /> : <StarOutlined />}
                              className={starredFileIds.has(file.id) ? '!bg-amber-500 !text-white' : '!text-gray-400 hover:!text-amber-500'}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleToggleFileStar(file);
                              }}
                              aria-label={starredFileIds.has(file.id) ? 'حذف ستاره فایل' : 'ستاره‌دار کردن فایل'}
                            />
                          </Tooltip>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {sideTab === 'conversation' ? (
                  !isDraftActivityCreationMode && taskRecordId ? (
                    <div className="h-[24rem] max-h-[52vh] min-h-[18rem] overflow-hidden">
                      <ActivityPanel
                        moduleId="tasks"
                        recordId={taskRecordId}
                        view="notes"
                        recordName={stage?.title || taskTitle}
                        moduleConfig={MODULES.tasks}
                        compact
                      />
                    </div>
                  ) : (
                    <div className="px-2 py-4 text-xs leading-6 text-gray-400">
                      گفتگو بعد از ایجاد فعالیت فعال می‌شود.
                    </div>
                  )
                ) : null}

                {sideTab === 'ai' ? (
                  !isDraftActivityCreationMode && taskRecordId ? (
                    <div className="h-[24rem] max-h-[52vh] min-h-[18rem] overflow-hidden rounded-lg bg-slate-100 dark:bg-[#101113]">
                      <AssistantPanel active={sideTab === 'ai'} showThreadListButton />
                    </div>
                  ) : (
                    <div className="px-2 py-4 text-xs leading-6 text-gray-400">
                      گفتگوی هوش مصنوعی بعد از ایجاد فعالیت فعال می‌شود.
                    </div>
                  )
                ) : null}

                {sideTab === 'changelogs' ? (
                  !isDraftActivityCreationMode && taskRecordId ? (
                    <div className="h-[24rem] max-h-[52vh] min-h-[18rem] overflow-hidden">
                      <ActivityPanel
                        moduleId="tasks"
                        recordId={taskRecordId}
                        view="changelogs"
                        recordName={stage?.title || taskTitle}
                        moduleConfig={MODULES.tasks}
                        compact
                      />
                    </div>
                  ) : (
                    <div className="px-2 py-4 text-xs leading-6 text-gray-400">
                      آخرین تغییرات بعد از ایجاد فعالیت ثبت می‌شود.
                    </div>
                  )
                ) : null}

                {sideTab === 'instructions' ? (
                  <div className="space-y-2">
                    {loadingInstructions ? (
                      <div className="rounded-lg bg-gray-50 px-3 py-4 text-center text-xs text-gray-400 dark:bg-white/5">
                        در حال بارگذاری دستورالعمل‌ها...
                      </div>
                    ) : instructionIds.length === 0 ? (
                      <div className="rounded-lg bg-gray-50 px-3 py-4 text-center text-xs text-gray-400 dark:bg-white/5">
                        دستورالعملی برای این فعالیت ثبت نشده است.
                      </div>
                    ) : loadedInstructions.length === 0 ? (
                      <Button
                        block
                        icon={<ReadOutlined />}
                        onClick={() => void loadInstructions()}
                        className="!h-9 !rounded-lg"
                      >
                        بارگذاری دستورالعمل‌ها
                      </Button>
                    ) : (
                      <div className="max-h-[22rem] space-y-1.5 overflow-y-auto pr-0.5">
                        {loadedInstructions.map((instruction) => (
                          <button
                            key={String(instruction?.id || '')}
                            type="button"
                            onClick={() => void handleOpenInstructionsModal(String(instruction?.id || ''))}
                            className="w-full rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2 text-right transition hover:border-[rgba(var(--brand-300-rgb),0.85)] hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                          >
                            <div className="flex min-w-0 items-center justify-between gap-2">
                              <span className="min-w-0 truncate text-xs font-bold text-gray-700 dark:text-gray-100">
                                {String(instruction?.name || instruction?.system_code || 'دستورالعمل')}
                              </span>
                              {instruction?.status_label ? (
                                <Tag className="!m-0 !text-[10px]" color={String(instruction?.status_color || 'default')}>
                                  {instruction.status_label}
                                </Tag>
                              ) : null}
                            </div>
                            <div className="mt-1 truncate text-[10px] text-gray-400">
                              {String(instruction?.department || '').trim() || 'بدون دپارتمان'}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            {isDraftActivityCreationMode ? (
              <div className="max-lg:hidden space-y-2">
                <Button
                  type="primary"
                  block
                  icon={<PlusOutlined />}
                  loading={creatingDraftActivity}
                  disabled={!onCreateDraftActivity}
                  onClick={() => void handleCreateDraftActivity()}
                  className="!h-10 !rounded-lg !font-bold"
                >
                  ایجاد فعالیت
                </Button>
                <Button
                  block
                  icon={<EditOutlined />}
                  loading={savingDraftActivity}
                  disabled={!onSaveDraftActivity}
                  onClick={() => void handleSaveDraftActivity()}
                  className="!h-10 !rounded-lg !border-dashed !font-bold"
                >
                  ذخیره پیش‌نویس
                </Button>
              </div>
            ) : null}
          </aside>

          <main className="min-w-0 flex-1" dir="rtl">
            <div className="mb-3 space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <InlineEditableField
                  label="مسئول"
                  value={assigneeValue}
                  onSave={isDraftActivityCreationMode ? setAssigneeValue : (value) => { void saveTaskAssignee(value); }}
                  onDraftChange={(value) => writeModalFieldDraftPatch({ assigneeValue: value })}
                  options={[]}
                  fieldType={FieldType.SELECT}
                  forceEditMode={isDraftActivityCreationMode}
                  renderEditor={({ value, onChange }) => (
                    <AdaptiveIdentityPicker
                      value={String(value || '') || undefined}
                      scopes={['user', 'role']}
                      onChange={(nextValue) => onChange(typeof nextValue === 'string' ? nextValue : '')}
                      placeholder="انتخاب مسئول یا نقش"
                      pickerTitle="انتخاب مسئول فعالیت"
                      overlayZIndexBase={17020}
                    />
                  )}
                  displayNode={(
                    <AssigneeAvatarDisplay
                      source={assigneeDisplaySource}
                      allUsers={assigneeUsers}
                      allRoles={assigneeRoles}
                      explicitLabel={assigneeValue.includes(':') ? null : assigneeValue}
                      avatarSize={24}
                      className="flex min-w-0 items-center gap-2"
                      labelClassName="min-w-0 truncate text-sm font-bold text-gray-800 dark:text-gray-100"
                    />
                  )}
                />
                <div className="min-w-0 rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/5">
                  <div className="mb-1 text-[11px] font-bold text-gray-500 dark:text-gray-400">برچسب‌ها</div>
                  <TagInput
                    moduleId="tasks"
                    recordId={taskRecordId || undefined}
                    initialTags={activityTags}
                    onChange={(tags) => {
                      const nextTags = normalizeTaskTags(tags || []);
                      setActivityTags(nextTags);
                    }}
                    popupZIndex={16030}
                  />
                </div>
              </div>

              <InlineEditableField
                label="شرح فعالیت"
                value={descriptionDraft}
                onSave={isDraftActivityCreationMode ? setDescriptionDraft : (value) => { void saveTaskDescription(value); }}
                onDraftChange={(value) => writeModalFieldDraftPatch({ descriptionDraft: value })}
                fieldType={FieldType.LONG_TEXT}
                forceEditMode={isDraftActivityCreationMode}
              />

              {isDraftActivityCreationMode ? (
                <div className="grid grid-cols-1 gap-2 rounded-lg border border-gray-200 bg-gray-50/80 p-2 dark:border-gray-700 dark:bg-white/5 sm:grid-cols-2">
                  <InlineEditableField
                    label="دستمزد"
                    value={wageValue}
                    onSave={setWageValue}
                    onDraftChange={(value) => writeModalFieldDraftPatch({ wageValue: value })}
                    fieldType={FieldType.NUMBER}
                    forceEditMode
                  />
                  <InlineEditableField
                    label="وزن"
                    value={weightValue}
                    onSave={setWeightValue}
                    onDraftChange={(value) => writeModalFieldDraftPatch({ weightValue: value })}
                    fieldType={FieldType.NUMBER}
                    forceEditMode
                  />
                  {renderScheduleEditor({
                    title: 'زمان شروع',
                    mode: startScheduleMode,
                    onModeChange: setStartScheduleMode,
                    manualValue: startDateValue,
                    onManualSave: setStartDateValue,
                    durationFrom: startDurationFromValue,
                    onDurationFromSave: setStartDurationFromValue,
                    durationValue: startDurationValue,
                    onDurationValueSave: setStartDurationValue,
                    durationUnit: startDurationUnitValue,
                    onDurationUnitSave: setStartDurationUnitValue,
                    anchorStage: startAnchorStageValue,
                    onAnchorStageSave: setStartAnchorStageValue,
                  })}
                  {renderScheduleEditor({
                    title: 'موعد انجام',
                    mode: dueScheduleMode,
                    onModeChange: setDueScheduleMode,
                    manualValue: dueDateValue,
                    onManualSave: setDueDateValue,
                    durationFrom: dueDurationFromValue,
                    onDurationFromSave: setDueDurationFromValue,
                    durationValue: dueDurationValue,
                    onDurationValueSave: setDueDurationValue,
                    durationUnit: dueDurationUnitValue,
                    onDurationUnitSave: setDueDurationUnitValue,
                    anchorStage: dueAnchorStageValue,
                    onAnchorStageSave: setDueAnchorStageValue,
                  })}
                </div>
              ) : null}

              {customFields.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-500">فیلدهای اختصاصی این فعالیت:</span>
                  </div>
                  <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/80 p-2 dark:border-gray-700 dark:bg-white/5">
                    {customFields.map((field) => (
                      <div key={field.key}>
                        <InlineEditableField
                          label={field.label}
                          value={field.value}
                          field={field.field}
                          fieldType={field.type}
                          options={field.options}
                          allValues={customFieldAllValues}
                          forceEditMode={isDraftActivityCreationMode}
                          requiredForCompletion={field.requiredForCompletion}
                          requiredForCreation={field.requiredForCreation}
                          saving={savingFieldKey === field.key}
                          onDraftChange={(nextValue) => {
                            const current = readCreationDraftSnapshot(fieldDraftStorageKey) || {};
                            const currentValues = current?.customFieldValues && typeof current.customFieldValues === 'object'
                              ? current.customFieldValues
                              : {};
                            writeModalFieldDraftPatch({
                              customFieldValues: {
                                ...currentValues,
                                [field.key]: nextValue,
                              },
                            });
                          }}
                          onSave={(nextValue) => {
                            if (isDraftActivityCreationMode) {
                              setCustomFields((current) => current.map((item) => (
                                item.key === field.key ? { ...item, value: nextValue } : item
                              )));
                              return;
                            }
                            void saveCustomFieldValue(field.key, nextValue);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 break-words rounded-lg border border-[rgba(var(--brand-200-rgb),0.45)] bg-gray-50/80 p-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-white/5 dark:text-gray-300 md:grid-cols-[minmax(8rem,0.78fr)_minmax(0,1.22fr)]">
                <div className="order-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <OrderedListOutlined className="text-gray-500 dark:text-gray-300" />
                    <span>مرحله {toPersianNumber((stage?.layoutSlot ?? 0) + 1)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">ترتیب:</span>
                    <span className="font-semibold">{toPersianNumber(source?.sort_order ?? stage?.layoutSlot ?? 0)}</span>
                  </div>
                  {formattedStageDueLabel ? (
                    <div className="flex items-center gap-2">
                      <ClockCircleOutlined className="text-gray-500 dark:text-gray-300" />
                      <span>موعد: {formattedStageDueLabel}</span>
                    </div>
                  ) : null}
                  {primaryProcessRecordLink ? (
                    <div className="flex items-center gap-2">
                      <LinkOutlined className="text-gray-500 dark:text-gray-300" />
                      <span className="min-w-0">
                        فرآیند:{' '}
                        {renderRouteText(
                          `/${primaryProcessRecordLink.moduleId}/${primaryProcessRecordLink.recordId}`,
                          'font-bold text-cyan-700 hover:underline dark:text-cyan-300',
                          process.title,
                        )}
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="order-2 space-y-2">
                  {relatedRows.map((row) => (
                    <div key={`${row.moduleId}-${row.recordId}`} className="flex items-center gap-2">
                      <LinkOutlined className="text-gray-500 dark:text-gray-300" />
                      <span className="min-w-0">
                        {row.label}:{' '}
                        {renderRouteText(
                          `/${row.moduleId}/${row.recordId}`,
                          'font-bold text-cyan-700 hover:underline dark:text-cyan-300',
                          row.value,
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <InlineEditableField
                label="گزارش فعالیت"
                value={reportDraft}
                  onSave={isDraftActivityCreationMode ? setReportDraft : (value) => { void saveTaskReport(value); }}
                  onDraftChange={(value) => writeModalFieldDraftPatch({ reportDraft: value })}
                  fieldType={FieldType.LONG_TEXT}
                  forceEditMode={isDraftActivityCreationMode}
                />
              </div>
            </div>

          </main>
        </div>

        {!isDraftActivityCreationMode && taskRecordId ? (
          <TaskRelatedProcessBar
            task={{ ...source, id: taskRecordId, task_id: taskRecordId }}
            variant="full"
            className="mt-3 w-full min-w-0 overflow-x-hidden border-t border-[rgba(var(--brand-200-rgb),0.45)] pt-1 dark:border-[rgba(var(--brand-300-rgb),0.18)]"
          />
        ) : null}

        <div className="flex w-full flex-wrap items-center justify-between gap-2 border-t border-[rgba(var(--brand-200-rgb),0.45)] pt-2 dark:border-[rgba(var(--brand-300-rgb),0.18)]" dir="rtl">
          <span />
          <div className="flex items-center justify-end gap-1">
            {!isDraftActivityCreationMode && taskRecordId ? (
              <>
                <Tooltip title="قطع اتصال از این فرآیند و رکورد">
                  <Button
                    size="small"
                    type="text"
                    icon={<LinkOutlined />}
                    loading={taskActionBusy === 'unlink'}
                    disabled={taskActionBusy !== null}
                    onClick={confirmUnlinkTaskFromProcess}
                    className="text-gray-500 hover:!text-amber-600"
                  />
                </Tooltip>
                <Tooltip title="حذف کامل وظیفه">
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    loading={taskActionBusy === 'delete'}
                    disabled={taskActionBusy !== null}
                    onClick={confirmDeleteTaskCompletely}
                  />
                </Tooltip>
                {isInsideRouter ? (
                  <Link
                    to={`/tasks/${taskRecordId}`}
                    onClick={onClose}
                    className="inline-flex items-center gap-1 px-2 text-xs text-[rgba(var(--brand-700-rgb),1)] hover:text-[rgba(var(--brand-600-rgb),1)] hover:underline"
                  >
                    جزئیات کامل
                  </Link>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
        {isDraftActivityCreationMode ? (
          <div className="sticky bottom-0 z-20 -mx-3 mt-3 border-t border-gray-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-gray-700 dark:bg-[#141416]/95 lg:hidden">
            <Button
              type="primary"
              block
              icon={<PlusOutlined />}
              loading={creatingDraftActivity}
              disabled={!onCreateDraftActivity}
              onClick={() => void handleCreateDraftActivity()}
              className="!h-11 !rounded-xl !font-bold"
            >
              ایجاد فعالیت
            </Button>
            <Button
              block
              icon={<EditOutlined />}
              loading={savingDraftActivity}
              disabled={!onSaveDraftActivity}
              onClick={() => void handleSaveDraftActivity()}
              className="mt-2 !h-10 !rounded-xl !border-dashed !font-bold"
            >
              ذخیره پیش‌نویس
            </Button>
          </div>
        ) : null}
      </div>
      <TaskInstructionsModal
        open={instructionsModalOpen}
        loading={loadingInstructions}
        instructions={loadedInstructions}
        activeInstructionId={activeInstructionId}
        onSelectInstruction={(id) => setActiveInstructionId(id)}
        onClose={() => setInstructionsModalOpen(false)}
        hideList
      />
    </Modal>
    <Modal
      title={previewFile?.title || 'پیش‌نمایش فایل'}
      open={!!previewFile}
      onCancel={() => setPreviewFile(null)}
      width={860}
      centered
      destroyOnHidden
      footer={previewFile ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button icon={<ShareAltOutlined />} onClick={() => void handleDirectShareFile(previewFile)}>
            ارسال مستقیم
          </Button>
          <Button icon={<DownloadOutlined />} href={previewFile.fileUrl} target="_blank" rel="noreferrer" download={previewFile.title}>
            دانلود فایل اصلی
          </Button>
        </div>
      ) : null}
    >
      {previewFile ? renderPreviewFileContent(previewFile) : null}
    </Modal>
    </>
  );
};

export default memo(ProcessTaskModalV2);
