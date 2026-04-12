import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Popover, Button, Tooltip, Modal, Form, Input, message, Spin, Select, InputNumber, Space, Checkbox, Steps, Switch, Alert, Empty, Tag, Radio } from 'antd';
import { PlusOutlined, ClockCircleOutlined, UserOutlined, ArrowRightOutlined, ArrowLeftOutlined, UpOutlined, DownOutlined, OrderedListOutlined, TeamOutlined, CopyOutlined, DeleteOutlined, EditOutlined, SettingOutlined, SaveOutlined, LinkOutlined, HourglassOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { toPersianNumber } from '../utils/persianNumberFormatter';
import PersianDatePicker from './PersianDatePicker';
import DynamicSelectField from './DynamicSelectField';
import SmartFieldRenderer from './SmartFieldRenderer';
import RecordImageBox from './RecordImageBox';
import TaskHandoverModal, { type StageHandoverConfirm, type StageHandoverGroup, type StageHandoverDeliveryRow } from './production/TaskHandoverModal';
import TaskHandoverFormsModal, {
  type StageHandoverFormListRow,
  type StageHandoverSummaryRow,
} from './production/TaskHandoverFormsModal';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import { applyInventoryDeltas, syncMultipleProductsStock } from '../utils/inventoryTransactions';
import { MODULES } from '../moduleRegistry';
import { FieldType, ModuleField, SelectOption } from '../types';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import {
  applyTaskSourceRecordFilter,
  buildTaskSourcePatch,
  buildTaskSourceInitialValues,
  getMergedTaskTypeOptions,
  getTaskTypeProtectedValues,
} from '../utils/taskMeta';
import { TASK_AUTOMATION_SELECT, updateTaskStatusWithAutomation } from '../utils/taskUpdateRuntime';
import {
  createDefaultProcessAutomationRule,
  getProcessAutomationRuleSummary,
  normalizeProcessAutomationRules,
  PROCESS_AUTOMATION_LEGACY_PREVIOUS_STAGE_TRIGGER_OPTION,
  type ProcessAutomationRule,
} from '../utils/processAutomationTypes';
import { runProcessAutomationsForTaskEvent } from '../utils/processAutomationRuntime';
import { openTaskProcessModal } from '../utils/taskProcessModalEvents';
import { fetchAssigneeDirectory, fetchDynamicOptionsByCategory } from '../utils/referenceData';
import { fetchRelationOptionsForField } from '../utils/relationOptions';
import { getProcessAutomationConditionFieldsForModules, getProjectModuleOptions, getSyntheticWorkflowAssigneeField, getVisibleWorkflowModuleFields } from '../utils/workflowHelpers';
import {
  WORKFLOW_ASSIGNEE_FIELD_KEY,
  intervalUnitOptions,
  triggerTypeOptions,
  type WorkflowActionType,
  type WorkflowCondition,
  type WorkflowExecutionMode,
  workflowExecutionModeOptions,
} from '../utils/workflowTypes';
import WorkflowConditionsGroup from './workflows/WorkflowConditionsGroup';
import WorkflowActionsBuilder from './workflows/WorkflowActionsBuilder';
import HelpHint from './HelpHint';
import {
  createProcessLinkedFieldKey,
  doesProcessTemplateSupportModule,
  getProcessTargetModuleFields,
  getRelationFieldLinksForModules,
  mergeProcessLinkMaps,
  normalizeProcessTargetModuleIds,
  parseProcessLinkMap,
  syncProcessTemplateTargetModules,
} from '../utils/processTargets';
import {
  buildPreviousStageTaskCustomAutomationFields,
  buildProcessTaskCustomAutomationFields,
  getProcessTaskCustomFieldValuesFromRecurrence,
  getProcessTaskCustomFieldsFromRecurrence,
  getProcessTaskCustomFieldsFromStage,
  isReservedProcessTaskCustomFieldKey,
  isSupportedProcessTaskCustomFieldType,
  mergeProcessTaskCustomFieldValues,
  normalizeProcessTaskCustomFieldKey,
  normalizeProcessTaskCustomFields,
  PREVIOUS_STAGE_TASK_AUTOMATION_FIELD_PREFIX,
  PROCESS_TASK_CUSTOM_FIELDS_KEY,
  PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY,
  withProcessTaskCustomFieldValues,
} from '../utils/processTaskCustomFields';
import {
  getTaskStatusColor,
  getTaskStatusLabel,
  getTaskStatusOptions,
  getTaskStatusSwatchColor,
  normalizeProcessTaskStatusOptions,
  getProcessTaskStatusOptionsFromStage,
  getBaseTaskStatusOptions,
  mergeTaskStatusOptions,
  rebuildProcessTaskStatusOptionsByMergedOrder,
  PROCESS_TASK_STATUS_COLOR_OPTIONS,
  PROCESS_TASK_STATUS_OPTIONS_KEY,
  PROCESS_TASK_STATUS_START_ANCHOR,
} from '../utils/processTaskStatusOptions';
import { fileStorageClient, FILE_STORAGE_BUCKET } from '../utils/storageClient';
import { isUploadCanceledError, uploadFileWithProgress } from '../utils/uploadFileWithProgress';
import { getRecordTitle } from '../utils/recordTitle';
import { fetchCurrentUserRoleContext, resolveFilesAccessPermissions, type PermissionMap } from '../utils/permissions';

interface ProductionStagesFieldProps {
  recordId?: string;
  moduleId?: string;
  automationContextModuleId?: string | null;
  automationContextModuleIds?: string[] | null;
  autoOpenTaskId?: string | null;
  readOnly?: boolean;
  compact?: boolean;
  cardCompact?: boolean;
  allowReportEditInReadOnly?: boolean;
  lazyLoad?: boolean;
  onlyLineId?: string | null;
  onQuantityChange?: (qty: number) => void;
  orderStatus?: string | null;
  draftStages?: any[];
  onDraftStagesChange?: (stages: any[]) => void | Promise<void>;
  showWageSummary?: boolean;
  forceProcessRecordMode?: boolean;
}

type StageHandoverSide = 'giver' | 'receiver';

type StageAssignee = {
  id: string | null;
  type: 'user' | 'role' | null;
  label: string;
};

const TASK_RELATED_FIELD_DEFINITIONS: Array<{ fieldKey: string; moduleId: string; label: string }> = [
  { fieldKey: 'related_customer', moduleId: 'customers', label: 'مشتری مرتبط' },
  { fieldKey: 'related_invoice', moduleId: 'invoices', label: 'فاکتور فروش مرتبط' },
  { fieldKey: 'purchase_invoice_id', moduleId: 'purchase_invoices', label: 'فاکتور خرید مرتبط' },
  { fieldKey: 'project_id', moduleId: 'projects', label: 'پروژه مرتبط' },
  { fieldKey: 'marketing_lead_id', moduleId: 'marketing_leads', label: 'لید بازاریابی مرتبط' },
  { fieldKey: 'related_supplier', moduleId: 'suppliers', label: 'تامین کننده مرتبط' },
  { fieldKey: 'related_production_order', moduleId: 'production_orders', label: 'سفارش تولید مرتبط' },
];

type StageHandoverContext = {
  taskId: string;
  orderId: string;
  lineId: string | null;
  sourceTaskId: string | null;
  sourceStageName: string;
  sourceShelfId: string | null;
  targetShelfId: string | null;
  giver: StageAssignee;
  receiver: StageAssignee;
  groups: StageHandoverGroup[];
  giverConfirmation: StageHandoverConfirm;
  receiverConfirmation: StageHandoverConfirm;
  previousTotalsByProduct: Record<string, number>;
  previousWasteByProduct: Record<string, number>;
  sourceTotalsByProduct: Record<string, number>;
  orderTotalsByProduct: Record<string, number>;
};

type StageHandoverForm = {
  id: string;
  sourceTaskId: string | null;
  sourceStageName: string;
  sourceShelfId: string | null;
  targetShelfId: string | null;
  giver: StageAssignee;
  receiver: StageAssignee;
  groups: StageHandoverGroup[];
  wasteByProduct: Record<string, number>;
  giverConfirmation: StageHandoverConfirm;
  receiverConfirmation: StageHandoverConfirm;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type DraftModalTabKey = 'stage' | 'fields' | 'automation';

const DRAFT_MODAL_STEP_KEYS: DraftModalTabKey[] = ['stage', 'fields', 'automation'];

const TASK_AUTOMATION_FIELD_PREFIX = '__task__';
const createProcessAutomationTaskVariableFields = (): ModuleField[] => ([
  { key: 'task_name', labels: { fa: 'عنوان فعالیت', en: 'Task Name' }, type: FieldType.TEXT, nature: 'standard' as any },
  { key: 'task_type', labels: { fa: 'نوع فعالیت', en: 'Task Type' }, type: FieldType.TEXT, nature: 'standard' as any },
  { key: 'task_status', labels: { fa: 'وضعیت فعالیت', en: 'Task Status' }, type: FieldType.TEXT, nature: 'standard' as any },
  { key: 'status_label', labels: { fa: 'عنوان وضعیت فعالیت', en: 'Task Status Label' }, type: FieldType.TEXT, nature: 'standard' as any },
  { key: 'task_status_label', labels: { fa: 'عنوان وضعیت فعالیت (کلید اختصاصی)', en: 'Task Status Label Key' }, type: FieldType.TEXT, nature: 'standard' as any },
  { key: 'task_due_date', labels: { fa: 'موعد فعالیت', en: 'Task Due Date' }, type: FieldType.DATETIME, nature: 'standard' as any },
  { key: 'task_image_url', labels: { fa: 'تصویر اصلی همین فعالیت', en: 'Current Task Main Image' }, type: FieldType.IMAGE, nature: 'standard' as any },
]);

const processTaskCustomFieldTypeLabels: Partial<Record<FieldType, string>> = {
  [FieldType.TEXT]: 'متن کوتاه',
  [FieldType.LONG_TEXT]: 'متن بلند',
  [FieldType.SUPER_LONG_TEXT]: 'متن خیلی بلند',
  [FieldType.NUMBER]: 'عدد',
  [FieldType.PRICE]: 'قیمت',
  [FieldType.PERCENTAGE]: 'درصد',
  [FieldType.CHECKBOX]: 'چک‌باکس',
  [FieldType.STOCK]: 'موجودی',
  [FieldType.SELECT]: 'انتخابی',
  [FieldType.MULTI_SELECT]: 'چندانتخابی',
  [FieldType.DATE]: 'تاریخ',
  [FieldType.TIME]: 'زمان',
  [FieldType.DATETIME]: 'تاریخ و زمان',
  [FieldType.LINK]: 'لینک',
  [FieldType.RELATION]: 'ارتباط با ماژول',
  [FieldType.USER]: 'کاربر',
  [FieldType.STATUS]: 'وضعیت',
  [FieldType.PHONE]: 'تلفن',
  [FieldType.TAGS]: 'برچسب',
};

const processTaskOptionEditableTypes = new Set<FieldType>([
  FieldType.SELECT,
  FieldType.MULTI_SELECT,
  FieldType.STATUS,
]);

const supportedProcessTaskCustomFieldTypes: FieldType[] = [
  FieldType.TEXT,
  FieldType.LONG_TEXT,
  FieldType.SUPER_LONG_TEXT,
  FieldType.NUMBER,
  FieldType.PRICE,
  FieldType.PERCENTAGE,
  FieldType.CHECKBOX,
  FieldType.STOCK,
  FieldType.SELECT,
  FieldType.MULTI_SELECT,
  FieldType.DATE,
  FieldType.TIME,
  FieldType.DATETIME,
  FieldType.LINK,
  FieldType.RELATION,
  FieldType.USER,
  FieldType.STATUS,
  FieldType.PHONE,
  FieldType.TAGS,
];

const processTaskDynamicOptionCapableTypes = new Set<FieldType>([
  FieldType.SELECT,
  FieldType.MULTI_SELECT,
  FieldType.STATUS,
]);

const TEMPLATE_TOKEN_REGEX = /\{\{\s*([^}]+)\s*\}\}/g;
const EXACT_TEMPLATE_TOKEN_REGEX = /^\s*\{\{\s*([^}]+)\s*\}\}\s*$/;

const stringifyTemplateValue = (value: any): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((item) => String(item ?? '')).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const getInputLikeElement = (target: any): HTMLInputElement | HTMLTextAreaElement | null =>
  target?.input
  || target?.resizableTextArea?.textArea
  || target
  || null;

const insertTextAtSelection = (
  currentValue: string,
  insertedText: string,
  selection?: { start: number; end: number } | null,
) => {
  const safeValue = String(currentValue ?? '');
  const start = Math.max(0, Math.min(selection?.start ?? safeValue.length, safeValue.length));
  const end = Math.max(start, Math.min(selection?.end ?? start, safeValue.length));
  const nextValue = `${safeValue.slice(0, start)}${insertedText}${safeValue.slice(end)}`;
  const caret = start + insertedText.length;
  return { nextValue, caret };
};

const coerceResolvedTemplateValue = (value: any, fieldType?: FieldType) => {
  if (!fieldType) return value;
  if (fieldType === FieldType.CHECKBOX) {
    if (typeof value === 'boolean') return value;
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) return false;
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    return Boolean(value);
  }
  if ([FieldType.NUMBER, FieldType.PRICE, FieldType.PERCENTAGE, FieldType.STOCK].includes(fieldType)) {
    if (typeof value === 'number') return value;
    const parsed = parseFloat(String(value ?? '').replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  if ([FieldType.MULTI_SELECT, FieldType.TAGS].includes(fieldType)) {
    if (Array.isArray(value)) return value;
    const normalized = String(value ?? '').trim();
    return normalized ? normalized.split(',').map((item) => item.trim()).filter(Boolean) : [];
  }
  return value;
};

const renderTemplateValueFromRecord = (
  rawValue: any,
  record: Record<string, any>,
  fieldType?: FieldType,
) => {
  if (typeof rawValue !== 'string') return rawValue;
  const exactMatch = rawValue.match(EXACT_TEMPLATE_TOKEN_REGEX);
  if (exactMatch) {
    const tokenKey = String(exactMatch[1] || '').trim();
    return coerceResolvedTemplateValue(record?.[tokenKey], fieldType);
  }
  return String(rawValue || '').replace(TEMPLATE_TOKEN_REGEX, (_token, key: string) => {
    const tokenKey = String(key || '').trim();
    return stringifyTemplateValue(record?.[tokenKey]);
  });
};

const supportsProcessTaskDynamicCategory = (fieldType: FieldType) =>
  processTaskDynamicOptionCapableTypes.has(fieldType);

const serializeProcessTaskFieldOptions = (field: ModuleField): string =>
  (field.options || [])
    .map((option) =>
      [String(option?.label || ''), String(option?.value || ''), String(option?.color || '')]
        .filter((item) => item !== '')
        .join('|')
    )
    .join('\n');

const parseProcessTaskFieldOptions = (value: string): Array<{ label: string; value: string; color?: string }> =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [labelRaw, valueRaw, colorRaw] = line.split('|').map((item) => item.trim());
      const label = labelRaw || valueRaw || `گزینه ${index + 1}`;
      const optionValue = valueRaw || labelRaw || `option_${index + 1}`;
      return {
        label,
        value: optionValue,
        ...(colorRaw ? { color: colorRaw } : {}),
      };
    });

const TASK_MODAL_CUSTOM_FIELD_DRAFT_ID = '__task_modal_custom_fields__';

const ProductionStagesField: React.FC<ProductionStagesFieldProps> = ({ recordId, moduleId, automationContextModuleId = null, automationContextModuleIds = null, autoOpenTaskId = null, readOnly = false, compact = false, cardCompact = false, allowReportEditInReadOnly = false, lazyLoad = false, onlyLineId = null, onQuantityChange, orderStatus, draftStages, onDraftStagesChange, showWageSummary = false, forceProcessRecordMode = false }) => {
  const [lines, setLines] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [assignees, setAssignees] = useState<{ users: any[]; roles: any[] }>({ users: [], roles: [] });
  const [loading, setLoading] = useState(false);
  const [isLineModalOpen, setIsLineModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [lineForm] = Form.useForm();
  const [taskForm] = Form.useForm();
  const [draftLocal, setDraftLocal] = useState<any[]>(() => (Array.isArray(draftStages) ? draftStages : []));
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);
  const [draftForm] = Form.useForm();
  const [draftToCreate, setDraftToCreate] = useState<any | null>(null);
  const [editingDraft, setEditingDraft] = useState<any | null>(null);
  const [draftAutomationRules, setDraftAutomationRules] = useState<ProcessAutomationRule[]>([]);
  const [isSavingDraftStage, setIsSavingDraftStage] = useState(false);
  const [isReadyToLoad, setIsReadyToLoad] = useState(!lazyLoad);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draftLocalRef = useRef<any[]>(Array.isArray(draftStages) ? draftStages : []);
  const draftEditorStageIdRef = useRef<any>(null);
  const draftStageSavePromiseRef = useRef<Promise<any> | null>(null);
  const isBom = moduleId === 'production_boms';
  const isProcessTemplateModule = moduleId === 'process_templates';
  const isDraftOnlyModule = isBom || isProcessTemplateModule;
  const [currentUser, setCurrentUser] = useState<{ id: string | null; roleId: string | null; fullName: string }>({ id: null, roleId: null, fullName: 'کاربر' });
  const [rolePermissions, setRolePermissions] = useState<PermissionMap | null>(null);
  const [relatedRecordTitleMap, setRelatedRecordTitleMap] = useState<Record<string, string>>({});
  const [processTemplateNameMap, setProcessTemplateNameMap] = useState<Record<string, string>>({});
  const [handoverTask, setHandoverTask] = useState<any | null>(null);
  const [handoverContext, setHandoverContext] = useState<StageHandoverContext | null>(null);
  const [handoverGroups, setHandoverGroups] = useState<StageHandoverGroup[]>([]);
  const [handoverForms, setHandoverForms] = useState<StageHandoverForm[]>([]);
  const [, setNextStageHandoverFormRows] = useState<StageHandoverFormListRow[]>([]);
  const [activeHandoverFormId, setActiveHandoverFormId] = useState<string | null>(null);
  const [handoverFormsModalOpen, setHandoverFormsModalOpen] = useState(false);
  const [handoverEditorOpen, setHandoverEditorOpen] = useState(false);
  const [handoverLoading, setHandoverLoading] = useState(false);
  const [productionShelfOptions, setProductionShelfOptions] = useState<{ label: string; value: string }[]>([]);
  const [openTaskPopoverId, setOpenTaskPopoverId] = useState<string | null>(null);
  const [processTemplateOptions, setProcessTemplateOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [processTemplateOptionsLoading, setProcessTemplateOptionsLoading] = useState(false);
  const [draftStageChooserOpen, setDraftStageChooserOpen] = useState(false);
  const [draftSourceTemplateOptions, setDraftSourceTemplateOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [draftSourceTemplateLoading, setDraftSourceTemplateLoading] = useState(false);
  const [draftSourceTemplateId, setDraftSourceTemplateId] = useState<string | null>(null);
  const [draftSourceTemplateStages, setDraftSourceTemplateStages] = useState<any[]>([]);
  const [draftSourceTemplateStagesLoading, setDraftSourceTemplateStagesLoading] = useState(false);
  const [appendProcessModalOpen, setAppendProcessModalOpen] = useState(false);
  const [appendProcessModalMode, setAppendProcessModalMode] = useState<'append' | 'links'>('append');
  const [appendProcessModalGroupId, setAppendProcessModalGroupId] = useState<string | null>(null);
  const [appendProcessTemplateId, setAppendProcessTemplateId] = useState<string | null>(null);
  const [appendProcessTargetModuleIds, setAppendProcessTargetModuleIds] = useState<string[]>([]);
  const [appendProcessLinkedRecords, setAppendProcessLinkedRecords] = useState<Record<string, string | null>>({});
  const [appendProcessRelationOptions, setAppendProcessRelationOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [, setAppendProcessRelationLoading] = useState<Record<string, boolean>>({});
  const [showEmptyProcessDetails, setShowEmptyProcessDetails] = useState(false);
  const [showCompletedProcessGroups, setShowCompletedProcessGroups] = useState(false);
  const [processOriginTitleMap, setProcessOriginTitleMap] = useState<Record<string, string>>({});
  const [draftTemplatePickerSearch, setDraftTemplatePickerSearch] = useState('');
  const [draftTemplatePickerOpenKey, setDraftTemplatePickerOpenKey] = useState<string | null>(null);
  const [activeProcessGroupMeta, setActiveProcessGroupMeta] = useState<{
    id: string;
    label: string | null;
    templateId: string | null;
    templateName: string | null;
  } | null>(null);
  const [taskTypeOptions, setTaskTypeOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [draftModalTabKey, setDraftModalTabKey] = useState<DraftModalTabKey>('stage');
  const [draftCustomFields, setDraftCustomFields] = useState<ModuleField[]>([]);
  const [draftStageStatusOptions, setDraftStageStatusOptions] = useState<SelectOption[]>([]);
  const [draftStageTaskTypeValue, setDraftStageTaskTypeValue] = useState('');
  const [isDraftCustomFieldModalOpen, setIsDraftCustomFieldModalOpen] = useState(false);
  const [editingDraftCustomFieldKey, setEditingDraftCustomFieldKey] = useState<string | null>(null);
  const [draftCustomFieldOptionsEditorKey, setDraftCustomFieldOptionsEditorKey] = useState<string | null>(null);
  const [taskCustomFieldDrafts, setTaskCustomFieldDrafts] = useState<Record<string, Record<string, any>>>({});
  const [taskCustomFieldDynamicOptions, setTaskCustomFieldDynamicOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [taskCustomFieldRelationOptions, setTaskCustomFieldRelationOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [savingTaskCustomFields, setSavingTaskCustomFields] = useState<Record<string, boolean>>({});
  const [draftCustomFieldForm] = Form.useForm();
  const [draftCustomFieldOptionsForm] = Form.useForm<{ optionsText: string }>();
  const [automationDynamicOptions, setAutomationDynamicOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [automationRelationOptions, setAutomationRelationOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [taskReportDrafts, setTaskReportDrafts] = useState<Record<string, string>>({});
  const [savingReportIds, setSavingReportIds] = useState<Record<string, boolean>>({});
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const autoOpenedTaskIdRef = useRef<string | null>(null);
  const taskQuickModalHistoryRef = useRef<string | null>(null);
  const draftTemplateSelectionRef = useRef<Record<string, { start: number; end: number }>>({});
  const draftStageNameInputRef = useRef<any>(null);
  const draftStageDescriptionInputRef = useRef<any>(null);
  const draftCustomFieldDefaultInputRefs = useRef<Record<string, any>>({});
  const handoverFormsHistoryRef = useRef<string | null>(null);
  const handoverEditorHistoryRef = useRef<string | null>(null);
  const watchedDraftStageStatusOptions = Form.useWatch('stage_status_options_editor', { form: draftForm, preserve: true });
  const watchedDraftStageSortOrder = Form.useWatch('sort_order', { form: draftForm, preserve: true });
  const activeTaskQuickModalTask = useMemo(
    () => (
      openTaskPopoverId
        ? tasks.find((task: any) => String(task?.id || '') === String(openTaskPopoverId)) || null
        : null
    ),
    [openTaskPopoverId, tasks]
  );
  const resetHandoverState = useCallback(() => {
    handoverFormsHistoryRef.current = null;
    handoverEditorHistoryRef.current = null;
    setHandoverFormsModalOpen(false);
    setHandoverEditorOpen(false);
    setHandoverTask(null);
    setHandoverContext(null);
    setHandoverGroups([]);
    setHandoverForms([]);
    setActiveHandoverFormId(null);
  }, []);
  const closeTaskQuickModal = useCallback((syncHistory = true) => {
    if (syncHistory && typeof window !== 'undefined') {
      const marker = taskQuickModalHistoryRef.current;
      if (marker && window.history.state?.kalamappTaskQuickModal === marker) {
        setOpenTaskPopoverId(null);
        taskQuickModalHistoryRef.current = null;
        window.history.back();
        return;
      }
    }
    taskQuickModalHistoryRef.current = null;
    setOpenTaskPopoverId(null);
  }, []);
  useEffect(() => {
    if (!openTaskPopoverId || typeof window === 'undefined') return;

    const marker = `task-quick-modal:${openTaskPopoverId}:${Date.now()}`;
    taskQuickModalHistoryRef.current = marker;
    window.history.pushState(
      { ...(window.history.state || {}), kalamappTaskQuickModal: marker },
      '',
      window.location.href
    );

    const handlePopState = () => {
      if (taskQuickModalHistoryRef.current !== marker) return;
      taskQuickModalHistoryRef.current = null;
      closeTaskQuickModal(false);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [closeTaskQuickModal, openTaskPopoverId]);
  useEffect(() => {
    if (!handoverFormsModalOpen || typeof window === 'undefined') return;

    const marker = `task-handover-forms:${String(handoverTask?.id || 'task')}:${Date.now()}`;
    handoverFormsHistoryRef.current = marker;
    window.history.pushState(
      { ...(window.history.state || {}), kalamappTaskHandoverForms: marker },
      '',
      window.location.href
    );

    const handlePopState = () => {
      if (handoverFormsHistoryRef.current !== marker) return;
      resetHandoverState();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [handoverFormsModalOpen, handoverTask?.id, resetHandoverState]);
  useEffect(() => {
    if (!handoverEditorOpen || typeof window === 'undefined') return;

    const marker = `task-handover-editor:${String(handoverTask?.id || 'task')}:${Date.now()}`;
    handoverEditorHistoryRef.current = marker;
    window.history.pushState(
      { ...(window.history.state || {}), kalamappTaskHandoverEditor: marker },
      '',
      window.location.href
    );

    const handlePopState = () => {
      if (handoverEditorHistoryRef.current !== marker) return;
      handoverEditorHistoryRef.current = null;
      setHandoverEditorOpen(false);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [handoverEditorOpen, handoverTask?.id]);
  const modalSelectProps = useMemo(
    () => ({
      allowClear: true,
      showSearch: true,
      optionFilterProp: 'label' as const,
      getPopupContainer: (node?: HTMLElement | null) => node?.parentElement || document.body,
      placement: 'bottomRight' as const,
      popupMatchSelectWidth: false,
      listHeight: 260,
      virtual: false,
    }),
    []
  );
  const filesAccess = useMemo(
    () => resolveFilesAccessPermissions(rolePermissions),
    [rolePermissions]
  );
  const canViewModuleByPermissions = useCallback((targetModuleId: string) => {
    const normalized = String(targetModuleId || '').trim();
    if (!normalized) return false;
    return rolePermissions?.[normalized]?.view !== false;
  }, [rolePermissions]);
  const processAutomationTriggerTypeOptions = useMemo(
    () => triggerTypeOptions.map((option) => {
      if (option.value === 'on_create') {
        return { ...option, label: 'وقتی فعالیت جدید ایجاد شد' };
      }
      if (option.value === 'on_upsert') {
        return { ...option, label: 'وقتی فعالیت ایجاد یا به روز شد' };
      }
      return option;
    }),
    []
  );
  const automationScopeModuleIds = useMemo(
    () => normalizeProcessTargetModuleIds(
      automationContextModuleIds || [],
      automationContextModuleId
      || ((moduleId === 'process_templates' || moduleId === 'process_runs') ? '' : moduleId)
      || ''
    ),
    [automationContextModuleId, automationContextModuleIds, moduleId]
  );
  const automationScopeModuleId = automationScopeModuleIds[0] || '';
  const draftCustomAutomationFields = useMemo(
    () => buildProcessTaskCustomAutomationFields(draftCustomFields),
    [draftCustomFields]
  );
  const automationConditionFields = useMemo(
    () => [
      ...getProcessAutomationConditionFieldsForModules(automationScopeModuleIds).map((field) => (
        String(field?.key || '').trim() === '__task__status'
          ? { ...field, options: getTaskStatusOptions({ recurrence_info: { [PROCESS_TASK_STATUS_OPTIONS_KEY]: draftStageStatusOptions } }, field.options || []) }
          : field
      )),
      ...draftCustomAutomationFields,
    ],
    [automationScopeModuleIds, draftCustomAutomationFields, draftStageStatusOptions]
  );
  const automationConditionFieldsWithoutTaskType = useMemo(
    () => automationConditionFields.filter((field) => String(field?.key || '').trim() !== '__task__task_type'),
    [automationConditionFields]
  );
  const automationActionModuleFields = useMemo(
    () => Array.from(
      new Map(
        [
          ...draftCustomAutomationFields,
          ...getProcessTargetModuleFields(
            automationScopeModuleIds,
            getVisibleWorkflowModuleFields,
            getSyntheticWorkflowAssigneeField
          ),
        ]
          .filter((field) => !!String(field?.key || '').trim())
          .map((field) => [String(field.key), field] as const)
      ).values()
    ),
    [automationScopeModuleIds, draftCustomAutomationFields]
  );
  const workflowModuleOptions = useMemo(
    () => getProjectModuleOptions(),
    []
  );
  const processTaskCustomFieldTypeOptions = useMemo(
    () =>
      supportedProcessTaskCustomFieldTypes
        .filter((type) => isSupportedProcessTaskCustomFieldType(type))
        .map((type) => ({
          label: processTaskCustomFieldTypeLabels[type] || type,
          value: type,
        })),
    []
  );
  const draftCustomFieldType = Form.useWatch('type', draftCustomFieldForm) || FieldType.TEXT;
  const draftCustomFieldRelationTargetModule = Form.useWatch('relationTargetModule', draftCustomFieldForm);
  const draftStageTaskType = String(draftStageTaskTypeValue || '').trim();
  const baseTaskStatusOptions = useMemo(() => getBaseTaskStatusOptions(), []);
  const draftStageStatusValueSet = useMemo(
    () => new Set(draftStageStatusOptions.map((option) => String(option?.value || '').trim()).filter(Boolean)),
    [draftStageStatusOptions]
  );
  const mergedDraftStageStatusOptions = useMemo(
    () => mergeTaskStatusOptions(baseTaskStatusOptions, draftStageStatusOptions),
    [baseTaskStatusOptions, draftStageStatusOptions]
  );
  const draftStageTaskTypeLabel = useMemo(
    () => taskTypeOptions.find((option) => String(option.value || '').trim() === draftStageTaskType)?.label || draftStageTaskType,
    [draftStageTaskType, taskTypeOptions]
  );
  const draftModalStepItems = useMemo(
    () => [
      {
        key: 'stage' as DraftModalTabKey,
        title: 'مرحله الگوی فرآیند',
        description: 'مشخصات پایه و نوع فعالیت',
      },
      {
        key: 'fields' as DraftModalTabKey,
        title: `فیلدهای اختصاصی (${toPersianNumber(draftCustomFields.length)})`,
        description: 'فیلدها و وضعیت‌های افزوده',
      },
      {
        key: 'automation' as DraftModalTabKey,
        title: `اتوماسیون (${toPersianNumber(draftAutomationRules.length)})`,
        description: 'شرط‌ها و اقدام‌ها',
      },
    ],
    [draftAutomationRules.length, draftCustomFields.length]
  );
  const draftModalStepIndex = useMemo(
    () => Math.max(0, DRAFT_MODAL_STEP_KEYS.indexOf(draftModalTabKey)),
    [draftModalTabKey]
  );
  const taskModalCustomFields = useMemo(
    () => getProcessTaskCustomFieldsFromStage(draftToCreate),
    [draftToCreate]
  );
  const taskModalCustomFieldDraft = taskCustomFieldDrafts[TASK_MODAL_CUSTOM_FIELD_DRAFT_ID] || {};
  const draftCustomFieldOptionEditor = useMemo(
    () => draftCustomFields.find((field) => String(field?.key || '') === String(draftCustomFieldOptionsEditorKey || '')) || null,
    [draftCustomFieldOptionsEditorKey, draftCustomFields]
  );
  const stageModalStyles = useMemo(
    () => ({
      header: {
        padding: '16px 20px 12px',
        borderBottom: '1px solid rgba(var(--brand-200-rgb), 0.28)',
        background: 'linear-gradient(180deg, rgba(var(--brand-100-rgb), 0.9) 0%, rgba(255,255,255,0) 100%)',
      },
      body: {
        padding: '16px 20px 20px',
        background: 'transparent',
      },
      content: {
        overflow: 'hidden',
        borderRadius: 24,
      },
    }),
    []
  );

  const onQuantityChangeRef = useRef<((qty: number) => void) | undefined>();

  useEffect(() => {
    onQuantityChangeRef.current = onQuantityChange;
  }, [onQuantityChange]);

  const normalizeDraftStageForEditor = useCallback((stage: any, index = 0) => {
    const metadata = stage?.metadata && typeof stage.metadata === 'object' && !Array.isArray(stage.metadata)
      ? stage.metadata
      : {};
    const firstText = (...values: any[]) =>
      values.map((value) => String(value ?? '').trim()).find(Boolean) || '';
    const stageName = firstText(
      stage?.name,
      stage?.stage_name,
      stage?.title,
      metadata?.name,
      metadata?.stage_name
    ) || `مرحله ${index + 1}`;
    const description = firstText(stage?.description, metadata?.description) || null;
    const taskType = firstText(stage?.task_type, metadata?.task_type) || null;
    const automationRules = normalizeProcessAutomationRules(
      Array.isArray(stage?.automation_rules)
        ? stage.automation_rules
        : metadata?.automation_rules
    );
    const processTaskCustomFields = normalizeProcessTaskCustomFields(
      Array.isArray(stage?.process_task_custom_fields)
        ? stage.process_task_custom_fields
        : (Array.isArray(stage?.custom_task_fields)
          ? stage.custom_task_fields
          : metadata?.[PROCESS_TASK_CUSTOM_FIELDS_KEY])
    );
    const processTaskStatusOptions = normalizeProcessTaskStatusOptions(
      Array.isArray(stage?.process_task_status_options)
        ? stage.process_task_status_options
        : metadata?.[PROCESS_TASK_STATUS_OPTIONS_KEY]
    );
    const readNumber = (value: any, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const sortOrder = readNumber(stage?.sort_order, (index + 1) * 10) || ((index + 1) * 10);
    const weight = readNumber(stage?.weight ?? metadata?.weight, 0);
    const durationValue = readNumber(stage?.duration_value ?? metadata?.duration_value, 0);
    const durationUnit = String(stage?.duration_unit ?? metadata?.duration_unit ?? 'day') === 'hour' ? 'hour' : 'day';
    const durationFrom = String(stage?.duration_from ?? metadata?.duration_from ?? 'project_start') === 'previous_stage_end'
      ? 'previous_stage_end'
      : 'project_start';
    const id = stage?.id || stage?.template_stage_id || stage?.process_run_stage_id || `draft_${index + 1}_${sortOrder}`;

    return {
      ...(stage || {}),
      id,
      name: stageName,
      title: stage?.title || stageName,
      stage_name: stage?.stage_name || stageName,
      description,
      task_type: taskType,
      automation_rules: automationRules,
      process_task_custom_fields: processTaskCustomFields,
      process_task_status_options: processTaskStatusOptions,
      sort_order: sortOrder,
      wage: readNumber(stage?.wage, 0),
      weight,
      default_assignee_id: stage?.default_assignee_id ?? stage?.assignee_id ?? metadata?.default_assignee_id ?? null,
      default_assignee_role_id: stage?.default_assignee_role_id ?? stage?.assignee_role_id ?? metadata?.default_assignee_role_id ?? null,
      duration_value: durationValue,
      duration_unit: durationUnit,
      duration_from: durationFrom,
      metadata: {
        ...metadata,
        description,
        task_type: taskType,
        automation_rules: automationRules,
        [PROCESS_TASK_CUSTOM_FIELDS_KEY]: processTaskCustomFields,
        [PROCESS_TASK_STATUS_OPTIONS_KEY]: processTaskStatusOptions,
        weight,
        duration_value: durationValue,
        duration_unit: durationUnit,
        duration_from: durationFrom,
      },
    };
  }, []);
  const normalizedDraftStages = useMemo(
    () => (Array.isArray(draftStages) ? draftStages : []).map((stage: any, index: number) =>
      normalizeDraftStageForEditor(stage, index)
    ),
    [draftStages, normalizeDraftStageForEditor]
  );
  const isProcessRecordModule = (
    forceProcessRecordMode
    || moduleId === 'projects'
    || moduleId === 'marketing_leads'
    || moduleId === 'customers'
    || moduleId === 'invoices'
    || moduleId === 'purchase_invoices'
  );
  const isProcessPreviewModule = moduleId === 'process_templates' || moduleId === 'process_runs';
  const isProcessModule = isProcessRecordModule || isProcessPreviewModule;
  const isProductionOrder = moduleId === 'production_orders';
  const supportsHandover = isProductionOrder;
  const processTaskModules = useMemo(
    () => new Set(['projects', 'marketing_leads', 'customers', 'invoices', 'purchase_invoices']),
    []
  );
  const processLineId = useMemo(
    () => `process-line:${String(moduleId || 'unknown')}:${String(recordId || 'draft')}`,
    [moduleId, recordId]
  );
  const processTitle = moduleId === 'marketing_leads'
    ? 'فرآیند بازاریابی'
    : moduleId === 'process_templates'
      ? 'مراحل الگوی فرآیند'
      : moduleId === 'process_runs'
        ? 'مراحل اجرای فرآیند'
        : 'فرآیندها';
  const buildProcessGroupId = useCallback(
    () => `process_group_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    []
  );
  const normalizeStageName = useCallback(
    (val: any) => String(val || '').trim().toLowerCase(),
    []
  );
  const getStageProcessGroupMeta = useCallback((stage: any) => {
    const fallbackGroupId = String(stage?.source_template_id || 'default_process_group').trim() || 'default_process_group';
    const groupId = String(stage?.process_group_id || fallbackGroupId).trim() || 'default_process_group';
    const groupLabel = String(stage?.process_group_name || stage?.source_template_name || '').trim() || null;
    const templateId = String(stage?.source_template_id || '').trim() || null;
    const templateName = String(stage?.source_template_name || '').trim() || null;
    return { groupId, groupLabel, templateId, templateName };
  }, []);
  const previousDraftStage = useMemo(() => {
    const currentSortOrder = Number(watchedDraftStageSortOrder || editingDraft?.sort_order || 0);
    const editingId = String(editingDraft?.id || '').trim();
    const currentGroupId = editingDraft ? getStageProcessGroupMeta(editingDraft).groupId : '';
    const candidates = (Array.isArray(draftLocal) ? draftLocal : [])
      .filter((stage: any) => {
        if (editingId && String(stage?.id || '').trim() === editingId) return false;
        if (currentGroupId && getStageProcessGroupMeta(stage).groupId !== currentGroupId) return false;
        if (currentSortOrder > 0) return Number(stage?.sort_order || 0) < currentSortOrder;
        return true;
      })
      .sort((a: any, b: any) => Number(b?.sort_order || 0) - Number(a?.sort_order || 0));
    return candidates[0] || null;
  }, [draftLocal, editingDraft, getStageProcessGroupMeta, watchedDraftStageSortOrder]);
  const previousStageVariableFields = useMemo(
    () => [
      {
        key: `${PREVIOUS_STAGE_TASK_AUTOMATION_FIELD_PREFIX}image_url`,
        labels: { fa: 'تصویر اصلی فعالیت قبلی', en: 'Previous Stage Main Image' },
        type: FieldType.IMAGE,
        nature: 'standard' as any,
      },
      ...buildPreviousStageTaskCustomAutomationFields(getProcessTaskCustomFieldsFromStage(previousDraftStage)),
    ],
    [previousDraftStage]
  );
  const automationActionVariableFields = useMemo(
    () => Array.from(
      new Map(
        [
          ...createProcessAutomationTaskVariableFields(),
          ...previousStageVariableFields,
          ...automationActionModuleFields,
        ]
          .filter((field) => !!String(field?.key || '').trim())
          .map((field) => [String(field.key), field] as const)
      ).values()
    ),
    [automationActionModuleFields, previousStageVariableFields]
  );
  const stageTemplateVariableOptions = useMemo(
    () => automationActionVariableFields.map((field) => ({
      key: String(field?.key || '').trim(),
      label: String(field?.labels?.fa || field?.key || '').trim(),
      token: `{{${String(field?.key || '').trim()}}}`,
    })).filter((item) => item.key && item.label),
    [automationActionVariableFields]
  );
  const getTaskProcessGroupMeta = useCallback((task: any) => {
    const rawRecurrence = task?.recurrence_info;
    let recurrence: any = {};
    if (rawRecurrence && typeof rawRecurrence === 'object') {
      recurrence = rawRecurrence;
    } else if (typeof rawRecurrence === 'string') {
      try {
        const parsed = JSON.parse(rawRecurrence);
        recurrence = parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        recurrence = {};
      }
    }
    const processMeta = recurrence?.process_group && typeof recurrence.process_group === 'object'
      ? recurrence.process_group
      : {};
    const groupId = String(processMeta?.id || task?.process_group_id || '').trim() || null;
    const groupLabel = String(processMeta?.name || task?.process_group_name || '').trim() || null;
    const templateId = String(processMeta?.template_id || task?.source_template_id || '').trim() || null;
    const templateName = String(processMeta?.template_name || '').trim() || null;
    return { groupId, groupLabel, templateId, templateName };
  }, []);
  const buildProcessStageTaskKey = useCallback((groupIdValue: any, nameValue: any, sortOrderValue: any) => {
    const normalizedGroupId = String(groupIdValue || 'default_process_group').trim() || 'default_process_group';
    const normalizedName = normalizeStageName(nameValue);
    const numericSort = Number(sortOrderValue || 0);
    const normalizedSort = Number.isFinite(numericSort) && numericSort > 0 ? numericSort : 0;
    if (!normalizedName) return '';
    return `${normalizedGroupId}::${normalizedName}::${normalizedSort}`;
  }, [normalizeStageName]);
  const removeSingleMatchingDraftStage = useCallback((stages: any[], targetStage: any) => {
    if (!Array.isArray(stages)) return [];
    if (!targetStage) return stages;
    const targetMeta = getStageProcessGroupMeta(targetStage);
    const targetId = String(targetStage?.id || '').trim();
    const targetSort = Number(targetStage?.sort_order || 0);
    const targetName = normalizeStageName(targetStage?.name || targetStage?.title);
    let removed = false;

    return stages.filter((stage: any) => {
      if (removed) return true;
      const stageMeta = getStageProcessGroupMeta(stage);
      if (stageMeta.groupId !== targetMeta.groupId) return true;

      const sameId = !!targetId && String(stage?.id || '').trim() === targetId;
      const sameSort = targetSort > 0 && Number(stage?.sort_order || 0) === targetSort;
      const sameName = !!targetName && normalizeStageName(stage?.name || stage?.title) === targetName;
      const shouldRemove = sameId || (sameSort && sameName) || (!targetId && sameSort) || (!targetId && !targetSort && sameName);
      if (!shouldRemove) return true;

      removed = true;
      return false;
    });
  }, [getStageProcessGroupMeta, normalizeStageName]);

  const loadAutomationOptions = useCallback(async () => {
    if (automationConditionFields.length === 0) {
      setAutomationDynamicOptions({});
      setAutomationRelationOptions({});
      return;
    }

    const nextDynamicOptions: Record<string, Array<{ label: string; value: string }>> = {};
    const nextRelationOptions: Record<string, Array<{ label: string; value: string }>> = {};

    await Promise.all(automationConditionFields.map(async (field) => {
      if (field.dynamicOptionsCategory && !nextDynamicOptions[field.dynamicOptionsCategory]) {
        nextDynamicOptions[field.dynamicOptionsCategory] = field.dynamicOptionsCategory === 'task_type'
          ? taskTypeOptions
          : await fetchDynamicOptionsByCategory(
              supabase,
              field.dynamicOptionsCategory,
            );
      }

      if (
        field.key === WORKFLOW_ASSIGNEE_FIELD_KEY
        || field.key === `${TASK_AUTOMATION_FIELD_PREFIX}${WORKFLOW_ASSIGNEE_FIELD_KEY}`
        || String(field.key || '').endsWith(`__${WORKFLOW_ASSIGNEE_FIELD_KEY}`)
      ) {
        const directory = await fetchAssigneeDirectory(supabase);
        nextRelationOptions[field.key] = [
          ...directory.users.map((user) => ({
            label: String(user.display_name || user.full_name || user.id).trim(),
            value: `user_${String(user.id)}`,
          })),
          ...directory.roles.map((role) => ({
            label: String(role.title || role.id).trim(),
            value: `role_${String(role.id)}`,
          })),
        ];
        return;
      }

      if (field.type === FieldType.TAGS) {
        const { data } = await supabase
          .from('tags')
          .select('id, title')
          .order('title', { ascending: true });
        nextRelationOptions[field.key] = (data || []).map((row: any) => ({
          label: String(row?.title || row?.id || '').trim(),
          value: String(row?.id || '').trim(),
        })).filter((item) => item.value);
        return;
      }

      if (field.type === FieldType.USER) {
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name')
          .order('full_name', { ascending: true })
          .limit(300);
        nextRelationOptions[field.key] = (data || []).map((row: any) => ({
          label: String(row?.full_name || row?.id || '').trim(),
          value: String(row?.id || '').trim(),
        })).filter((item) => item.value);
        return;
      }

      if (field.type === FieldType.RELATION) {
        nextRelationOptions[field.key] = await fetchRelationOptionsForField(
          supabase,
          field as any,
          { limit: 300 }
        );
      }
    }));

    setAutomationDynamicOptions(nextDynamicOptions);
    setAutomationRelationOptions(nextRelationOptions);
  }, [automationConditionFields, automationScopeModuleId, taskTypeOptions]);

  const parseRecurrenceInfo = useCallback((value: any) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return {};
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }, []);

  const getTaskCustomFields = useCallback((task: any) => {
    const recurrence = parseRecurrenceInfo(task?.recurrence_info);
    return getProcessTaskCustomFieldsFromRecurrence(recurrence);
  }, [parseRecurrenceInfo]);

  const getTaskCustomFieldValues = useCallback((task: any) => {
    const recurrence = parseRecurrenceInfo(task?.recurrence_info);
    const fields = getProcessTaskCustomFieldsFromRecurrence(recurrence);
    return mergeProcessTaskCustomFieldValues(
      fields,
      getProcessTaskCustomFieldValuesFromRecurrence(recurrence)
    );
  }, [parseRecurrenceInfo]);

  const rememberDraftTemplateSelection = useCallback((targetKey: string, target: any) => {
    const node = getInputLikeElement(target);
    if (!node) return;
    const start = typeof node.selectionStart === 'number' ? node.selectionStart : String(node.value || '').length;
    const end = typeof node.selectionEnd === 'number' ? node.selectionEnd : start;
    draftTemplateSelectionRef.current[targetKey] = { start, end };
  }, []);

  const focusDraftTemplateTarget = useCallback((targetKey: string, caret: number) => {
    const refTarget = targetKey === 'name'
      ? draftStageNameInputRef.current
      : targetKey === 'description'
        ? draftStageDescriptionInputRef.current
        : draftCustomFieldDefaultInputRefs.current[targetKey.replace('custom:', '')];
    const node = getInputLikeElement(refTarget);
    if (!node) return;
    window.setTimeout(() => {
      node.focus?.();
      node.setSelectionRange?.(caret, caret);
    }, 0);
  }, []);

  const insertDraftTemplateToken = useCallback((targetKey: string, token: string) => {
    const selection = draftTemplateSelectionRef.current[targetKey] || null;
    if (targetKey === 'name' || targetKey === 'description') {
      const currentValue = String(draftForm.getFieldValue(targetKey) || '');
      const { nextValue, caret } = insertTextAtSelection(currentValue, token, selection);
      draftForm.setFieldValue(targetKey, nextValue);
      focusDraftTemplateTarget(targetKey, caret);
      return;
    }
    if (targetKey.startsWith('custom:')) {
      const fieldKey = targetKey.replace('custom:', '');
      let nextCaret = 0;
      setDraftCustomFields((prev) => prev.map((field) => {
        if (String(field?.key || '') !== fieldKey) return field;
        const currentValue = stringifyTemplateValue(field?.defaultValue);
        const inserted = insertTextAtSelection(currentValue, token, selection);
        nextCaret = inserted.caret;
        return {
          ...field,
          defaultValue: inserted.nextValue,
        };
      }));
      focusDraftTemplateTarget(targetKey, nextCaret);
    }
  }, [draftForm, focusDraftTemplateTarget]);

  const copyDraftTemplateTokenToClipboard = useCallback(async (token: string) => {
    const text = String(token || '').trim();
    if (!text) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch {
      // fallback handled below
    }
    try {
      if (typeof document === 'undefined') return;
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    } catch {
      // no-op: token insertion is still applied even if clipboard is blocked
    }
  }, []);

  const handleDraftTemplateTokenPick = useCallback((targetKey: string, token: string) => {
    insertDraftTemplateToken(targetKey, token);
    setDraftTemplatePickerOpenKey(null);
    setDraftTemplatePickerSearch('');
    void copyDraftTemplateTokenToClipboard(token);
  }, [copyDraftTemplateTokenToClipboard, insertDraftTemplateToken]);

  const buildTaskTemplateContextRecord = useCallback(async ({
    taskName,
    taskType,
    dueDate,
    processLinkMap,
    previousTask,
  }: {
    taskName?: string | null;
    taskType?: string | null;
    dueDate?: string | null;
    processLinkMap?: Record<string, any> | null;
    previousTask?: any;
  }) => {
    const record: Record<string, any> = {
      task_name: String(taskName || '').trim(),
      task_type: String(taskType || '').trim(),
      task_status: 'todo',
      status_label: getTaskStatusLabel('todo'),
      task_status_label: getTaskStatusLabel('todo'),
      task_due_date: dueDate || '',
    };

    if (recordId && moduleId) {
      try {
        const { data: sourceRecord, error } = await supabase
          .from(MODULES[moduleId]?.table || moduleId)
          .select('*')
          .eq('id', recordId)
          .maybeSingle();
        if (error) throw error;
        Object.assign(record, sourceRecord || {});
      } catch (error) {
        console.warn('Could not load source record for task template rendering', error);
      }
    }

    const mergedLinks = mergeProcessLinkMaps(
      recordId && moduleId ? { [moduleId]: String(recordId) } : {},
      processLinkMap && typeof processLinkMap === 'object' ? processLinkMap : {},
    );

    await Promise.all(
      Object.entries(mergedLinks).map(async ([linkedModuleId, linkedRecordId]) => {
        const normalizedModuleId = String(linkedModuleId || '').trim();
        const normalizedRecordId = String(linkedRecordId || '').trim();
        if (!normalizedModuleId || !normalizedRecordId) return;
        if (normalizedModuleId === moduleId && normalizedRecordId === String(recordId || '')) return;
        try {
          const { data, error } = await supabase
            .from(MODULES[normalizedModuleId]?.table || normalizedModuleId)
            .select('*')
            .eq('id', normalizedRecordId)
            .maybeSingle();
          if (error) throw error;
          if (!data) return;
          Object.entries(data).forEach(([fieldKey, value]) => {
            record[createProcessLinkedFieldKey(normalizedModuleId, fieldKey)] = value;
          });
        } catch (error) {
          console.warn('Could not load linked process record for task template rendering', error);
        }
      })
    );

    const previousTaskRecord = previousTask ? withProcessTaskCustomFieldValues(previousTask) : null;
    const previousTaskCustomFields = previousTask
      ? getProcessTaskCustomFieldsFromRecurrence(parseRecurrenceInfo(previousTask?.recurrence_info))
      : [];
    previousTaskCustomFields.forEach((field) => {
      const fieldKey = String(field?.key || '').trim();
      if (!fieldKey) return;
      record[`${PREVIOUS_STAGE_TASK_AUTOMATION_FIELD_PREFIX}${fieldKey}`] = previousTaskRecord?.[fieldKey];
    });

    return record;
  }, [moduleId, parseRecurrenceInfo, recordId]);

  const loadTaskCustomFieldOptions = useCallback(async (inputFields?: ModuleField[]) => {
    const sourceFields = normalizeProcessTaskCustomFields(
      inputFields && inputFields.length > 0
        ? inputFields
        : (Array.isArray(tasks)
          ? tasks.flatMap((task: any) => getTaskCustomFields(task))
          : [])
    );

    if (sourceFields.length === 0) {
      setTaskCustomFieldDynamicOptions({});
      setTaskCustomFieldRelationOptions({});
      return;
    }

    const nextDynamicOptions: Record<string, Array<{ label: string; value: string }>> = {};
    const nextRelationOptions: Record<string, Array<{ label: string; value: string }>> = {};

    await Promise.all(sourceFields.map(async (field) => {
      if (field.dynamicOptionsCategory && !nextDynamicOptions[field.dynamicOptionsCategory]) {
        nextDynamicOptions[field.dynamicOptionsCategory] = field.dynamicOptionsCategory === 'task_type'
          ? taskTypeOptions
          : await fetchDynamicOptionsByCategory(supabase, field.dynamicOptionsCategory);
      }

      if (field.type === FieldType.USER) {
        const directory = await fetchAssigneeDirectory(supabase);
        nextRelationOptions[field.key] = directory.users.map((user) => ({
          label: String(user.display_name || user.full_name || user.id).trim(),
          value: String(user.id),
        }));
        return;
      }

      if (field.type === FieldType.RELATION && field.relationConfig?.targetModule) {
        nextRelationOptions[field.key] = await fetchRelationOptionsForField(
          supabase,
          field as any,
          { limit: 300 }
        );
      }
    }));

    setTaskCustomFieldDynamicOptions(nextDynamicOptions);
    setTaskCustomFieldRelationOptions(nextRelationOptions);
  }, [getTaskCustomFields, taskTypeOptions, tasks]);

  useEffect(() => {
    void loadTaskCustomFieldOptions();
  }, [loadTaskCustomFieldOptions]);

  useEffect(() => {
    draftLocalRef.current = normalizedDraftStages;
    setDraftLocal((prev) => (prev === normalizedDraftStages ? prev : normalizedDraftStages));
  }, [normalizedDraftStages]);

  useEffect(() => {
    if (!lazyLoad) {
      setIsReadyToLoad(true);
      return;
    }
    setIsReadyToLoad(false);
  }, [lazyLoad, recordId, moduleId]);

  useEffect(() => {
    if (!lazyLoad || isReadyToLoad) return;
    const target = containerRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setIsReadyToLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '120px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [lazyLoad, isReadyToLoad]);

  const toNumber = useCallback((value: any) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);

  const categoryLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    const productionModule = MODULES['production_orders'] as any;
    const gridBlock = (productionModule?.blocks || []).find((block: any) => block?.id === 'grid_materials');
    const categories = gridBlock?.gridConfig?.categories || [];
    categories.forEach((category: any) => {
      const key = String(category?.value || '').trim();
      if (!key) return;
      map.set(key, String(category?.label || key));
    });
    return map;
  }, []);

  const resolveCategoryLabel = useCallback((rawCategory: any) => {
    const raw = String(rawCategory || '').trim();
    if (!raw) return 'مواد اولیه';
    return categoryLabelMap.get(raw) || raw;
  }, [categoryLabelMap]);

  const buildHandoverRowKey = useCallback(
    () => `handover_row_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    []
  );

  const normalizeHandoverDeliveryRow = useCallback((group: StageHandoverGroup, rawRow?: any): StageHandoverDeliveryRow => {
    const firstPiece = Array.isArray(group?.pieces) && group.pieces.length > 0 ? group.pieces[0] : null;
    const length = Math.max(0, toNumber(rawRow?.length ?? firstPiece?.length ?? 0));
    const width = Math.max(0, toNumber(rawRow?.width ?? firstPiece?.width ?? 0));
    const quantity = Math.max(0, toNumber(rawRow?.quantity ?? firstPiece?.quantity ?? 1));
    return {
      key: String(rawRow?.key || buildHandoverRowKey()),
      pieceKey: rawRow?.pieceKey ? String(rawRow.pieceKey) : undefined,
      name: String(rawRow?.name ?? firstPiece?.name ?? ''),
      length,
      width,
      quantity,
      mainUnit: String(rawRow?.mainUnit ?? firstPiece?.mainUnit ?? ''),
      subUnit: String(rawRow?.subUnit ?? firstPiece?.subUnit ?? ''),
      deliveredQty: length * width * quantity,
    };
  }, [buildHandoverRowKey, toNumber]);

  const sumDeliveredRows = useCallback((rows: StageHandoverDeliveryRow[]) => {
    return rows.reduce(
      (sum, row) => sum + (Math.max(0, toNumber(row?.length)) * Math.max(0, toNumber(row?.width)) * Math.max(0, toNumber(row?.quantity))),
      0
    );
  }, [toNumber]);

  const recalcHandoverGroup = useCallback((group: StageHandoverGroup): StageHandoverGroup => {
    const pieces = Array.isArray(group?.pieces) ? group.pieces : [];
    const orderPieces = Array.isArray(group?.orderPieces) ? group.orderPieces : [];
    const deliveryRows = Array.isArray(group?.deliveryRows)
      ? group.deliveryRows.map((row) => normalizeHandoverDeliveryRow(group, row))
      : [];
    const totalSourceQty = pieces.reduce((sum, row) => sum + Math.max(0, toNumber(row?.sourceQty)), 0);
    const totalOrderQty = orderPieces.reduce((sum, row) => sum + Math.max(0, toNumber(row?.sourceQty)), 0);
    const fallbackTotal = pieces.reduce(
      (sum, row) => sum + Math.max(0, toNumber((row as any)?.handoverQty ?? row?.sourceQty)),
      0
    );
    const totalHandoverQty = deliveryRows.length > 0 ? sumDeliveredRows(deliveryRows) : fallbackTotal;
    return {
      ...group,
      pieces,
      orderPieces,
      deliveryRows,
      totalSourceQty,
      totalOrderQty,
      totalHandoverQty,
    };
  }, [normalizeHandoverDeliveryRow, sumDeliveredRows, toNumber]);

  const parseAssigneeComboValue = useCallback((raw: any) => {
    const rawValue = String(raw || '').trim();
    if (!rawValue) {
      return { assigneeType: null as 'user' | 'role' | null, assigneeId: null as string | null };
    }
    if (rawValue.includes(':')) {
      const [type, id] = rawValue.split(':');
      return {
        assigneeType: type === 'role' ? 'role' : 'user',
        assigneeId: id ? String(id) : null,
      };
    }
    return { assigneeType: 'user' as const, assigneeId: rawValue };
  }, []);
  const normalizeDueDateValue = useCallback((value: any) => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
    if (typeof value?.toDate === 'function') {
      const dateObj = value.toDate();
      if (dateObj instanceof Date && !Number.isNaN(dateObj.getTime())) return dateObj.toISOString();
    }
    if (typeof value?.format === 'function') {
      try {
        const formatted = value.format('YYYY-MM-DD HH:mm:ss');
        return formatted || null;
      } catch {
        return null;
      }
    }
    return null;
  }, []);
  const getTaskOptionalFieldFallback = useCallback((task: any) => {
    const recurrence = parseRecurrenceInfo(task?.recurrence_info);
    return {
      taskType: String(task?.task_type || recurrence?.task_type || '').trim() || null,
      taskReport: String(task?.task_report || recurrence?.task_report || '').trim() || '',
    };
  }, [parseRecurrenceInfo]);
  const isMissingColumnError = useCallback((error: any, columnName: string) => {
    const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
    if (!text) return false;
    const needle = columnName.toLowerCase();
    return text.includes(needle) && (text.includes('column') || text.includes('schema cache'));
  }, []);
  const extractMissingColumnNames = useCallback((error: any): string[] => {
    const text = [error?.message, error?.details, error?.hint]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join('\n');
    if (!text) return [];
    const sanitize = (raw: string) => String(raw || '')
      .replace(/["'`]/g, '')
      .trim()
      .replace(/^public\./i, '')
      .replace(/^tasks\./i, '')
      .trim();
    const patterns = [
      /could not find the ['"]([^'"]+)['"] column/gi,
      /column ["']([^"']+)["']/gi,
      /column\s+([a-zA-Z0-9_.]+)\s+does not exist/gi,
      /record\s+["'][^"']+["']\s+has no field\s+["']([^"']+)["']/gi,
      /has no field\s+["']([^"']+)["']/gi,
      /unknown field\s+["']([^"']+)["']/gi,
    ];
    const found = new Set<string>();
    patterns.forEach((pattern) => {
      let match = pattern.exec(text);
      while (match) {
        const normalized = sanitize(match?.[1] || '');
        if (normalized) found.add(normalized);
        match = pattern.exec(text);
      }
    });
    return Array.from(found);
  }, []);
  const removeColumnsFromRows = useCallback((rows: any[], columns: string[]) => {
    if (!Array.isArray(rows) || !columns.length) return rows;
    return rows.map((row) => {
      const next = { ...row };
      columns.forEach((columnName) => {
        delete next[columnName];
      });
      return next;
    });
  }, []);
  const insertTasksWithFallback = useCallback(async (rows: any[]) => {
    if (!Array.isArray(rows) || rows.length === 0) return;
    let payload = rows.map((row) => ({ ...row }));
    const optionalColumns = [
      'assignee_id',
      'assignee_type',
      'assignee_role_id',
      'due_date',
      'description',
      'task_type',
      'task_report',
      'wage',
      'weight',
      'sort_order',
      'created_by',
      'produced_qty',
      'related_to_module',
      'related_production_order',
      'related_invoice',
      'related_customer',
      'project_id',
      'purchase_invoice_id',
      'marketing_lead_id',
      'source_module_id',
      'source_record_id',
      'source_template_id',
      'source_stage_sort_order',
      'process_group_id',
      'blocked_reason',
      'waiting_for_task_type',
      'escalation_level',
      'production_line_id',
      'production_shelf_id',
      'recurrence_info',
    ];
    const fkConstraintColumns: Array<{ constraint: string; column: string }> = [
      { constraint: 'tasks_project_id_fkey', column: 'project_id' },
      { constraint: 'tasks_purchase_invoice_id_fkey', column: 'purchase_invoice_id' },
      { constraint: 'tasks_marketing_lead_id_fkey', column: 'marketing_lead_id' },
      { constraint: 'tasks_assignee_role_id_fkey', column: 'assignee_role_id' },
      { constraint: 'tasks_production_line_id_fkey', column: 'production_line_id' },
      { constraint: 'tasks_production_shelf_id_fkey', column: 'production_shelf_id' },
    ];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const { data, error } = await supabase
        .from('tasks')
        .insert(payload)
        .select(TASK_AUTOMATION_SELECT);
      if (!error) {
        const insertedRows = Array.isArray(data) ? data : [];
        for (const insertedTask of insertedRows) {
          await runProcessAutomationsForTaskEvent({
            task: insertedTask,
            event: 'create',
            previousTask: null,
            currentUser: null,
          });
        }
        return insertedRows;
      }
      const payloadColumns = Array.from(new Set(payload.flatMap((row) => Object.keys(row || {}))));
      const removable = optionalColumns.filter((columnName) =>
        payloadColumns.includes(columnName) && isMissingColumnError(error, columnName)
      );
      const missingColumns = extractMissingColumnNames(error)
        .filter((columnName) => payloadColumns.includes(columnName));
      const errorText = String(error?.message || error?.details || error?.hint || '').toLowerCase();
      const fkRemovable = fkConstraintColumns
        .filter((item) => errorText.includes(item.constraint))
        .map((item) => item.column)
        .filter((columnName) => payloadColumns.includes(columnName));
      let merged = Array.from(new Set([...removable, ...missingColumns, ...fkRemovable]));
      if (!merged.length && (errorText.includes('column') || errorText.includes('schema cache'))) {
        const fallbackColumn = optionalColumns.find((columnName) => payloadColumns.includes(columnName));
        if (fallbackColumn) merged = [fallbackColumn];
      }
      if (!merged.length) throw error;
      payload = removeColumnsFromRows(payload, merged);
    }
    return [];
  }, [extractMissingColumnNames, isMissingColumnError, removeColumnsFromRows]);
  const updateTaskWithFallback = useCallback(async (
    taskId: string,
    patch: Record<string, any>,
    options: {
      runAutomation?: boolean;
      previousTask?: Record<string, any> | null;
    } = {}
  ) => {
    let payload = { ...patch };
    let previousTask = options.previousTask === undefined
      ? (Array.isArray(tasks) ? tasks.find((item: any) => String(item?.id) === String(taskId)) || null : null)
      : options.previousTask;
    const optionalColumns = [
      'assignee_id',
      'assignee_type',
      'assignee_role_id',
      'due_date',
      'description',
      'task_type',
      'task_report',
      'wage',
      'weight',
      'sort_order',
      'created_by',
      'produced_qty',
      'related_to_module',
      'related_production_order',
      'related_invoice',
      'related_customer',
      'project_id',
      'purchase_invoice_id',
      'marketing_lead_id',
      'source_module_id',
      'source_record_id',
      'source_template_id',
      'source_stage_sort_order',
      'process_group_id',
      'blocked_reason',
      'waiting_for_task_type',
      'escalation_level',
      'production_line_id',
      'production_shelf_id',
      'image_url',
      'recurrence_info',
    ];
    if (options.runAutomation !== false && !previousTask) {
      const { data, error } = await supabase
        .from('tasks')
        .select(TASK_AUTOMATION_SELECT)
        .eq('id', taskId)
        .maybeSingle();
      if (error) throw error;
      previousTask = data || null;
    }
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const { data, error } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', taskId)
        .select(TASK_AUTOMATION_SELECT)
        .maybeSingle();
      if (!error) {
        if (options.runAutomation !== false && data) {
          await runProcessAutomationsForTaskEvent({
            task: data,
            event: 'update',
            previousTask,
            currentUser: null,
          });
        }
        return data || null;
      }
      const removable = optionalColumns.filter((columnName) =>
        Object.prototype.hasOwnProperty.call(payload, columnName) && isMissingColumnError(error, columnName)
      );
      const missingColumns = extractMissingColumnNames(error)
        .filter((columnName) => Object.prototype.hasOwnProperty.call(payload, columnName));
      if (missingColumns.length) {
        missingColumns.forEach((columnName) => {
          delete payload[columnName];
        });
        continue;
      }
      if (!removable.length) throw error;
      removable.forEach((columnName) => {
        delete payload[columnName];
      });
    }
    return null;
  }, [extractMissingColumnNames, isMissingColumnError, tasks]);

  const getHandoverFromTask = useCallback((task: any) => {
    const recurrence = parseRecurrenceInfo(task?.recurrence_info);
    const handover = recurrence?.production_handover;
    if (!handover || typeof handover !== 'object') return null;
    return handover as any;
  }, [parseRecurrenceInfo]);

  const assigneeLabelFromIds = useCallback((assigneeId: string | null | undefined, assigneeType: string | null | undefined) => {
    if (!assigneeId) return 'تعیین نشده';
    if (assigneeType === 'role') {
      const role = assignees.roles.find((item: any) => String(item?.id) === String(assigneeId));
      return role?.title || 'تعیین نشده';
    }
    const user = assignees.users.find((item: any) => String(item?.id) === String(assigneeId));
    return user?.display_name || user?.full_name || user?.email || user?.mobile_1 || 'تعیین نشده';
  }, [assignees.roles, assignees.users]);

  const fetchAssignees = async () => {
    try {
      const { data: users } = await supabase.from('profiles').select('id, full_name, email, mobile_1');
      const { data: roles } = await supabase.from('org_roles').select('*');
      const normalizedUsers = (users || []).map((user: any) => ({
        ...user,
        display_name:
          String(user?.full_name || '').trim() ||
          String(user?.email || '').trim() ||
          String(user?.mobile_1 || '').trim() ||
          `کاربر ${String(user?.id || '').slice(0, 8)}`,
      }));
      const normalizedRoles = (roles || []).map((role: any) => ({
        ...role,
        title: role?.title || role?.name || role?.id,
      }));
      setAssignees({ users: normalizedUsers, roles: normalizedRoles });
    } catch (e) {
      if (String((e as any)?.name || '') === 'AbortError') return;
      console.warn('Could not fetch assignees', e);
    }
  };
  const fetchTaskTypeOptions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('dynamic_options')
        .select('label, value, is_active')
        .eq('category', 'task_type')
        .order('label', { ascending: true });
      if (error) throw error;
      const options = (data || [])
        .filter((row: any) => row?.is_active !== false)
        .map((row: any) => ({
          label: String(row?.label || row?.value || ''),
          value: String(row?.value || row?.label || ''),
        }))
        .filter((row) => row.label && row.value);
      setTaskTypeOptions(getMergedTaskTypeOptions(options));
    } catch (error) {
      if (String((error as any)?.name || '') === 'AbortError') return;
      setTaskTypeOptions(getMergedTaskTypeOptions([]));
    }
  }, []);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const roleContext = await fetchCurrentUserRoleContext(supabase);
      const userId = roleContext?.userId || null;
      setRolePermissions((roleContext?.permissions || null) as PermissionMap | null);
      if (!userId) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role_id')
        .eq('id', userId)
        .maybeSingle();
      setCurrentUser({ id: userId, roleId: profile?.role_id ? String(profile.role_id) : null, fullName: profile?.full_name || 'کاربر' });
    } catch (err) {
      if (String((err as any)?.name || '') === 'AbortError') return;
    }
  }, []);

  const fetchProductionShelves = useCallback(async () => {
    try {
      const { data: shelves } = await supabase
        .from('shelves')
        .select('id, shelf_number, name, warehouses(name)')
        .limit(500);
      const filtered = (shelves || []).filter((row: any) => {
        const warehouseName = String(row?.warehouses?.name || '');
        return warehouseName.includes('تولید') || /production/i.test(warehouseName);
      });
      const source = filtered.length ? filtered : (shelves || []);
      const options = source.map((row: any) => ({
        value: String(row.id),
        label: `${row?.shelf_number || row?.name || row?.id}${row?.warehouses?.name ? ` - ${row.warehouses.name}` : ''}`,
      }));
      setProductionShelfOptions(options);
    } catch (err) {
      console.warn('Could not fetch production shelves', err);
      setProductionShelfOptions([]);
    }
  }, []);

  const fetchLines = async () => {
    if (isDraftOnlyModule) return;
    if (isProcessModule) {
      setLines([{ id: processLineId, line_no: 1, quantity: 1 }]);
      return;
    }
    if (!recordId || isBom) return;
    try {
      const { data, error } = await supabase
        .from('production_lines')
        .select('*')
        .eq('production_order_id', recordId)
        .order('line_no', { ascending: true });
      if (error) throw error;
      setLines(data || []);
    } catch (error) {
      console.error('Error fetching lines:', error);
    }
  };

  const fetchTasks = async () => {
    if (isDraftOnlyModule) return [] as any[];
    if (!recordId) {
      setTasks([]);
      setTasksLoaded(true);
      return [] as any[];
    }
    try {
      setLoading(true);
      setTasksLoaded(false);
      if (moduleId === 'tasks' && forceProcessRecordMode) {
        const { data: singleTask, error: singleTaskError } = await supabase
          .from('tasks')
          .select(`
            *,
            assignee:profiles!tasks_assignee_id_fkey(full_name, email, mobile_1, avatar_url),
            assigned_role:org_roles(title)
          `)
          .eq('id', recordId)
          .maybeSingle();
        if (singleTaskError) throw singleTaskError;
        const nextSingleTask = singleTask ? [withProcessTaskCustomFieldValues(singleTask)] : [];
        setTasks(nextSingleTask);
        return nextSingleTask;
      }
      let query = supabase
        .from('tasks')
        .select(`
          *,
          assignee:profiles!tasks_assignee_id_fkey(full_name, email, mobile_1, avatar_url),
          assigned_role:org_roles(title)
        `);

      if (isProcessPreviewModule) {
        setTasks([]);
        return [] as any[];
      }

      if (isProcessRecordModule) {
        const [sourceResult, linkedResult] = await Promise.all([
          applyTaskSourceRecordFilter(query, moduleId, recordId)
            .order('sort_order', { ascending: true }),
          supabase
            .from('tasks')
            .select(`
              *,
              assignee:profiles!tasks_assignee_id_fkey(full_name, email, mobile_1, avatar_url),
              assigned_role:org_roles(title)
            `)
            .contains('recurrence_info', { process_links: { [String(moduleId || '')]: String(recordId || '') } })
            .order('sort_order', { ascending: true }),
        ]);

        if (sourceResult.error) throw sourceResult.error;
        if (linkedResult.error) throw linkedResult.error;

        const mergedRows = [
          ...(sourceResult.data || []),
          ...((linkedResult.data || []).filter((row: any) => {
            const processLinks = parseProcessLinkMap(parseRecurrenceInfo(row?.recurrence_info)?.process_links);
            return String(processLinks[String(moduleId || '')] || '').trim() === String(recordId || '').trim();
          })),
        ];
        const next = Array.from(
          new Map(mergedRows.map((row: any) => [String(row?.id || `${row?.name || ''}_${row?.sort_order || ''}`), row])).values()
        ).map((row: any) => withProcessTaskCustomFieldValues(row));
        setTasks(next);
        return next;
      } else {
        query = applyTaskSourceRecordFilter(query, 'production_orders', recordId);
      }

      const { data, error } = await query.order('sort_order', { ascending: true });

      if (error) throw error;
      const next = (data || []).map((row: any) => withProcessTaskCustomFieldValues(row));
      setTasks(next);
      return next;
    } catch (error: any) {
      if (String((error as any)?.name || '') === 'AbortError') return [] as any[];
      return [] as any[];
    } finally {
      setLoading(false);
      setTasksLoaded(true);
    }
  };

  useEffect(() => {
    if (!isReadyToLoad) return;
    fetchLines();
    fetchTasks();
    fetchAssignees();
    fetchTaskTypeOptions();
    fetchCurrentUser();
    if (supportsHandover) {
      fetchProductionShelves();
    }
  }, [recordId, isDraftOnlyModule, isProcessModule, processLineId, supportsHandover, isReadyToLoad, fetchCurrentUser, fetchProductionShelves, fetchTaskTypeOptions]);

  const syncOrderQuantity = useCallback(async (nextLines: any[]) => {
    if (!recordId || isBom || !isProductionOrder) return;
    const nextTotal = nextLines.reduce((sum, line) => sum + (parseFloat(line.quantity) || 0), 0);
    onQuantityChangeRef.current?.(nextTotal);
    const { error } = await supabase
      .from('production_orders')
      .update({ quantity: nextTotal })
      .eq('id', recordId);
    if (error) {
      message.error(toFaErrorMessage(error, 'خطا در بروزرسانی تعداد تولید'));
    }
  }, [recordId, isBom, isProductionOrder]);

  useEffect(() => {
    if (!recordId || isBom || !isProductionOrder) return;
    syncOrderQuantity(lines);
  }, [lines, recordId, syncOrderQuantity, isBom, isProductionOrder]);

  const tasksByLine = useMemo(() => {
    const map = new Map<string, any[]>();
    if (isProcessPreviewModule && moduleId === 'process_runs') {
      const pseudoTasks = normalizedDraftStages.map((stage: any, index: number) => ({
        id: String(stage?.id || `run_stage_${index + 1}`),
        name: stage?.name || stage?.stage_name || `مرحله ${index + 1}`,
        status: stage?.status || 'todo',
        sort_order: stage?.sort_order || ((index + 1) * 10),
        wage: stage?.wage || 0,
        weight: stage?.weight || 0,
        assignee_id: stage?.assignee_id || null,
        assignee_role_id: stage?.assignee_role_id || null,
        assignee_type: stage?.assignee_type || null,
      }));
      map.set(processLineId, pseudoTasks);
      return map;
    }
    if (isProcessModule) {
      map.set(
        processLineId,
        [...tasks].sort((a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0))
      );
      return map;
    }
    lines.forEach(line => map.set(String(line.id), []));
    tasks.forEach(task => {
      const lineId = task.production_line_id ? String(task.production_line_id) : null;
      if (lineId && map.has(lineId)) {
        map.get(lineId)!.push(task);
      }
    });
    return map;
  }, [isProcessPreviewModule, normalizedDraftStages, moduleId, isProcessModule, processLineId, lines, tasks]);

  const getLineTaskChain = useCallback((lineId: string | null | undefined, sourceTasks?: any[]) => {
    if (isProcessModule) {
      return (sourceTasks || tasks)
        .slice()
        .sort((a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
    }
    if (!lineId) return [] as any[];
    const scoped = (sourceTasks || tasks)
      .filter((item: any) => String(item?.production_line_id || '') === String(lineId))
      .slice()
      .sort((a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
    return scoped;
  }, [isProcessModule, tasks]);

  const toGroupTotals = useCallback((groups: StageHandoverGroup[]) => {
    const totals: Record<string, number> = {};
    groups.forEach((group) => {
      const anyGroup = group as any;
      const pickedPiece = (Array.isArray(anyGroup?.pieces) ? anyGroup.pieces : []).find(
        (piece: any) => piece?.selectedProductId || piece?.selected_product_id || piece?.product_id
      );
      const productId =
        anyGroup?.selectedProductId
        || anyGroup?.selected_product_id
        || pickedPiece?.selectedProductId
        || pickedPiece?.selected_product_id
        || pickedPiece?.product_id
        || null;
      const normalizedProductId = productId ? String(productId) : '';
      if (!normalizedProductId) return;
      const deliveryRows = Array.isArray(anyGroup?.deliveryRows) ? anyGroup.deliveryRows : [];
      const qty = deliveryRows.length > 0
        ? deliveryRows.reduce(
            (sum: number, row: any) =>
              sum + (Math.max(0, toNumber(row?.length)) * Math.max(0, toNumber(row?.width)) * Math.max(0, toNumber(row?.quantity))),
            0
          )
        : (Array.isArray(anyGroup?.pieces) ? anyGroup.pieces : []).reduce(
            (sum: number, piece: any) => sum + toNumber(piece?.handoverQty ?? piece?.handover_qty ?? piece?.sourceQty ?? piece?.source_qty ?? 0),
            0
          );
      totals[normalizedProductId] = (totals[normalizedProductId] || 0) + qty;
    });
    return totals;
  }, [toNumber]);

  const toSourceTotals = useCallback((groups: StageHandoverGroup[]) => {
    const totals: Record<string, number> = {};
    groups.forEach((group) => {
      const productId = group?.selectedProductId ? String(group.selectedProductId) : '';
      if (!productId) return;
      const qty = (Array.isArray(group?.pieces) ? group.pieces : []).reduce(
        (sum: number, piece: any) => sum + Math.max(0, toNumber(piece?.sourceQty)),
        0
      );
      totals[productId] = (totals[productId] || 0) + qty;
    });
    return totals;
  }, [toNumber]);

  const toOrderTotals = useCallback((groups: StageHandoverGroup[]) => {
    const totals: Record<string, number> = {};
    groups.forEach((group) => {
      const productId = group?.selectedProductId ? String(group.selectedProductId) : '';
      if (!productId) return;
      const qty = (Array.isArray(group?.orderPieces) ? group.orderPieces : []).reduce(
        (sum: number, piece: any) => sum + Math.max(0, toNumber(piece?.sourceQty)),
        0
      );
      totals[productId] = (totals[productId] || 0) + qty;
    });
    return totals;
  }, [toNumber]);

  const buildHandoverFormId = useCallback(
    () => `handover_form_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    []
  );

  const buildPiecesFromOrderRow = useCallback((row: any, rowIndex: number, orderQty: number, useDeliveredQty: boolean) => {
    const rowPieces = Array.isArray(row?.pieces) && row.pieces.length > 0 ? row.pieces : [row];
    return rowPieces.map((piece: any, pieceIndex: number) => {
      const hasDelivered = Object.prototype.hasOwnProperty.call(piece || {}, 'delivered_qty');
      const deliveredQty = hasDelivered ? toNumber(piece?.delivered_qty) : null;
      const finalUsage = toNumber(piece?.final_usage);
      const totalUsage = toNumber(piece?.total_usage);
      const fallback = totalUsage > 0 ? totalUsage : (finalUsage > 0 ? finalUsage * orderQty : 0);
      const sourceQty = useDeliveredQty && deliveredQty !== null ? deliveredQty : fallback;
      return {
        key: `${String(piece?.key || 'piece')}_${rowIndex}_${pieceIndex}`,
        name: String(piece?.name || `قطعه ${pieceIndex + 1}`),
        length: toNumber(piece?.length),
        width: toNumber(piece?.width),
        quantity: toNumber(piece?.quantity),
        totalQuantity: toNumber(piece?.quantity) * orderQty,
        mainUnit: String(piece?.main_unit || row?.main_unit || ''),
        subUnit: String(piece?.sub_unit || ''),
        subUsage: toNumber(piece?.qty_sub),
        sourceQty,
        handoverQty: sourceQty,
      } as any;
    });
  }, [toNumber]);

  const buildGroupsFromOrder = useCallback((order: any): StageHandoverGroup[] => {
    const rows = Array.isArray(order?.grid_materials) ? order.grid_materials : [];
    const orderQty = Math.max(1, toNumber(order?.quantity));
    return rows.map((row: any, rowIndex: number) => {
      const header = row?.header || {};
      const rowPieces = Array.isArray(row?.pieces) && row.pieces.length > 0 ? row.pieces : [row];
      const selectedPiece = rowPieces.find((piece: any) => (
        piece?.selected_product_id || piece?.product_id || piece?.selected_product_name || piece?.product_name
      )) || null;
      const selectedProductId =
        header?.selected_product_id
        || row?.selected_product_id
        || row?.product_id
        || selectedPiece?.selected_product_id
        || selectedPiece?.product_id
        || null;
      const selectedProductName =
        header?.selected_product_name
        || row?.selected_product_name
        || row?.product_name
        || selectedPiece?.selected_product_name
        || selectedPiece?.product_name
        || '-';
      const selectedProductCode =
        header?.selected_product_code
        || row?.selected_product_code
        || row?.product_code
        || selectedPiece?.selected_product_code
        || selectedPiece?.product_code
        || '';
      const categoryLabel = resolveCategoryLabel(header?.category_label || header?.category);
      const pieces = buildPiecesFromOrderRow(row, rowIndex, orderQty, true);
      const orderPieces = buildPiecesFromOrderRow(row, rowIndex, orderQty, false);
      const deliveryRows = pieces.map((piece: any) => normalizeHandoverDeliveryRow(
        { pieces } as StageHandoverGroup,
        {
          pieceKey: piece.key,
          name: piece.name,
          length: piece.length,
          width: piece.width,
          quantity: piece.quantity,
          mainUnit: piece.mainUnit,
          subUnit: piece.subUnit,
          deliveredQty: piece.sourceQty,
        }
      ));

      return recalcHandoverGroup({
        key: `${String(row?.key || 'group')}_${rowIndex}`,
        rowIndex,
        categoryLabel: String(categoryLabel || 'مواد اولیه'),
        selectedProductId: selectedProductId ? String(selectedProductId) : null,
        selectedProductName: String(selectedProductName || '-'),
        selectedProductCode: String(selectedProductCode || ''),
        sourceShelfId: null,
        targetShelfId: null,
        pieces,
        orderPieces,
        deliveryRows,
        totalSourceQty: 0,
        totalOrderQty: 0,
        totalHandoverQty: 0,
        collapsed: rowIndex !== 0,
        isConfirmed: false,
      } as StageHandoverGroup);
    });
  }, [buildPiecesFromOrderRow, normalizeHandoverDeliveryRow, recalcHandoverGroup, resolveCategoryLabel, toNumber]);

  const buildGroupsFromPreviousStage = useCallback((groups: any[]) => {
    const sourceGroups = Array.isArray(groups) ? groups : [];
    return sourceGroups.map((group: any, groupIndex: number) => {
      const piecesRaw = Array.isArray(group?.pieces) ? group.pieces : [];
      const selectedPiece = piecesRaw.find((piece: any) => (
        piece?.selectedProductId || piece?.selected_product_id || piece?.product_id || piece?.selectedProductName || piece?.selected_product_name
      )) || null;
      const pieces = piecesRaw.map((piece: any, pieceIndex: number) => {
        const sourceQty = toNumber(piece?.handoverQty ?? piece?.sourceQty ?? piece?.totalUsage ?? 0);
        return {
          key: String(piece?.key || `${groupIndex}_${pieceIndex}`),
          name: String(piece?.name || `قطعه ${pieceIndex + 1}`),
          length: toNumber(piece?.length),
          width: toNumber(piece?.width),
          quantity: toNumber(piece?.quantity),
          totalQuantity: toNumber(piece?.totalQuantity),
          mainUnit: String(piece?.mainUnit || piece?.main_unit || ''),
          subUnit: String(piece?.subUnit || piece?.sub_unit || ''),
          subUsage: toNumber(piece?.subUsage ?? piece?.sub_usage ?? 0),
          sourceQty,
          handoverQty: sourceQty,
        };
      });
      const savedDeliveryRows = Array.isArray(group?.deliveryRows) ? group.deliveryRows : [];
      const deliveryRows = savedDeliveryRows.length > 0
        ? savedDeliveryRows.map((row: any) => normalizeHandoverDeliveryRow({ pieces } as StageHandoverGroup, row))
        : pieces.map((piece: any) => normalizeHandoverDeliveryRow(
            { pieces } as StageHandoverGroup,
            {
              pieceKey: piece.key,
              name: piece.name,
              length: piece.length,
              width: piece.width,
              quantity: piece.quantity,
              mainUnit: piece.mainUnit,
              subUnit: piece.subUnit,
              deliveredQty: toNumber(piece?.handoverQty ?? piece?.sourceQty),
            }
          ));
      return recalcHandoverGroup({
        key: String(group?.key || `group_${groupIndex}`),
        rowIndex: Number(group?.rowIndex ?? groupIndex),
        categoryLabel: resolveCategoryLabel(group?.categoryLabel || group?.category_label),
        selectedProductId: (group?.selectedProductId || group?.selected_product_id || selectedPiece?.selectedProductId || selectedPiece?.selected_product_id || selectedPiece?.product_id)
          ? String(group?.selectedProductId || group?.selected_product_id || selectedPiece?.selectedProductId || selectedPiece?.selected_product_id || selectedPiece?.product_id)
          : null,
        selectedProductName: String(group?.selectedProductName || group?.selected_product_name || selectedPiece?.selectedProductName || selectedPiece?.selected_product_name || selectedPiece?.product_name || '-'),
        selectedProductCode: String(group?.selectedProductCode || group?.selected_product_code || selectedPiece?.selectedProductCode || selectedPiece?.selected_product_code || selectedPiece?.product_code || ''),
        sourceShelfId: (group?.sourceShelfId || group?.source_shelf_id)
          ? String(group?.sourceShelfId || group?.source_shelf_id)
          : null,
        targetShelfId: (group?.targetShelfId || group?.target_shelf_id)
          ? String(group?.targetShelfId || group?.target_shelf_id)
          : null,
        pieces,
        orderPieces: Array.isArray(group?.orderPieces) ? group.orderPieces : [],
        deliveryRows,
        totalSourceQty: 0,
        totalOrderQty: 0,
        totalHandoverQty: 0,
        collapsed: typeof group?.collapsed === 'boolean' ? group.collapsed : groupIndex !== 0,
        isConfirmed: group?.isConfirmed === true,
      } as StageHandoverGroup);
    });
  }, [normalizeHandoverDeliveryRow, recalcHandoverGroup, resolveCategoryLabel, toNumber]);

  const mergeSavedGroups = useCallback((baseGroups: StageHandoverGroup[], savedGroups: any[]) => {
    const savedMap = new Map<string, any>((Array.isArray(savedGroups) ? savedGroups : []).map((group: any) => [String(group?.key || ''), group]));
    return baseGroups.map((group) => {
      const savedGroup = savedMap.get(String(group.key));
      if (!savedGroup) return recalcHandoverGroup(group);
      const savedPieces = new Map<string, any>((Array.isArray(savedGroup?.pieces) ? savedGroup.pieces : []).map((piece: any) => [String(piece?.key || ''), piece]));
      const pieces = group.pieces.map((piece) => {
        const savedPiece = savedPieces.get(String(piece.key));
        if (!savedPiece) return piece;
        return {
          ...piece,
          handoverQty: Math.max(0, toNumber(savedPiece?.handoverQty)),
        };
      });

      let deliveryRows = Array.isArray(savedGroup?.deliveryRows)
        ? savedGroup.deliveryRows.map((row: any) => normalizeHandoverDeliveryRow(group, row))
        : [];
      if (!deliveryRows.length) {
        deliveryRows = pieces.map((piece) => {
          const savedPiece = savedPieces.get(String(piece.key));
          return normalizeHandoverDeliveryRow(group, {
            pieceKey: piece.key,
            name: piece.name,
            length: piece.length,
            width: piece.width,
            quantity: piece.quantity,
            mainUnit: piece.mainUnit,
            subUnit: piece.subUnit,
            deliveredQty: toNumber(savedPiece?.handoverQty ?? piece?.sourceQty),
          });
        });
      }

      return recalcHandoverGroup({
        ...group,
        categoryLabel: resolveCategoryLabel(savedGroup?.categoryLabel || group.categoryLabel),
        targetShelfId: savedGroup?.targetShelfId ? String(savedGroup.targetShelfId) : group.targetShelfId,
        pieces,
        deliveryRows,
        collapsed: typeof savedGroup?.collapsed === 'boolean' ? savedGroup.collapsed : group.collapsed,
        isConfirmed: savedGroup?.isConfirmed === true,
      });
    });
  }, [normalizeHandoverDeliveryRow, recalcHandoverGroup, resolveCategoryLabel, toNumber]);

  const openTaskHandoverModal = useCallback(async (task: any, providedTasks?: any[]) => {
    if (!supportsHandover || !task?.id || !recordId || isBom) return;
    try {
      closeTaskQuickModal(false);
      setHandoverLoading(true);
      if (!productionShelfOptions.length) await fetchProductionShelves();
      if (!assignees.users.length && !assignees.roles.length) await fetchAssignees();

      const [{ data: latestTask }, { data: order }] = await Promise.all([
        supabase.from('tasks').select('*').eq('id', task.id).maybeSingle(),
        supabase
          .from('production_orders')
          .select('id, quantity, assignee_id, assignee_type, grid_materials, production_shelf_id')
          .eq('id', recordId)
          .maybeSingle(),
      ]);
      const currentTask = latestTask || task;
      const lineId = currentTask?.production_line_id ? String(currentTask.production_line_id) : null;
      const lineTasks = getLineTaskChain(lineId, providedTasks);
      const currentTaskIndex = lineTasks.findIndex((item: any) => String(item?.id) === String(currentTask.id));
      const previousTask = currentTaskIndex > 0 ? lineTasks[currentTaskIndex - 1] : null;
      const nextTask = currentTaskIndex >= 0 && currentTaskIndex < lineTasks.length - 1
        ? lineTasks[currentTaskIndex + 1]
        : null;

      const previousHandover = previousTask ? getHandoverFromTask(previousTask) : null;
      const currentHandover = getHandoverFromTask(currentTask);
      const nextHandover = nextTask ? getHandoverFromTask(nextTask) : null;

      const sourceStageName = previousTask?.name || 'شروع تولید';
      const sourceShelfId = previousTask?.production_shelf_id
        ? String(previousTask.production_shelf_id)
        : (previousHandover?.targetShelfId || order?.production_shelf_id || null);
      const targetShelfId = currentTask?.production_shelf_id
        ? String(currentTask.production_shelf_id)
        : (currentHandover?.targetShelfId || sourceShelfId || order?.production_shelf_id || null);

      const orderGroups = buildGroupsFromOrder(order || {});
      const orderByKey = new Map<string, StageHandoverGroup>(
        orderGroups.map((group) => [String(group.key), group])
      );
      const orderByProductCategory = new Map<string, StageHandoverGroup>();
      orderGroups.forEach((group) => {
        const key = `${String(group.selectedProductId || '')}|${String(group.categoryLabel || '')}`;
        if (key !== '|') orderByProductCategory.set(key, group);
      });

      const baseGroups = previousTask
        ? buildGroupsFromPreviousStage(previousHandover?.groups || [])
        : orderGroups;

      const withOrderGroups = baseGroups.map((group, index) => {
        const byKey = orderByKey.get(String(group.key));
        const byProductCategory = orderByProductCategory.get(
          `${String(group.selectedProductId || '')}|${String(group.categoryLabel || '')}`
        );
        const byIndex = orderGroups[index];
        const matched = byKey || byProductCategory || byIndex;
        const orderPieces = matched?.orderPieces || matched?.pieces || group.orderPieces || [];
        return recalcHandoverGroup({
          ...group,
          categoryLabel: resolveCategoryLabel(group.categoryLabel),
          orderPieces,
        });
      });

      const mergedGroups = mergeSavedGroups(withOrderGroups, currentHandover?.groups || []).map((group) =>
        recalcHandoverGroup({
          ...group,
          sourceShelfId: sourceShelfId ? String(sourceShelfId) : null,
          targetShelfId: targetShelfId ? String(targetShelfId) : null,
        })
      );

      const giverSourceId = previousTask?.assignee_id || order?.assignee_id || null;
      const giverSourceType = previousTask?.assignee_type || order?.assignee_type || null;
      const giver: StageAssignee = {
        id: giverSourceId ? String(giverSourceId) : null,
        type: giverSourceType === 'role' ? 'role' : (giverSourceType === 'user' ? 'user' : null),
        label: assigneeLabelFromIds(giverSourceId, giverSourceType),
      };
      const receiver: StageAssignee = {
        id: currentTask?.assignee_id ? String(currentTask.assignee_id) : null,
        type: currentTask?.assignee_type === 'role' ? 'role' : (currentTask?.assignee_type === 'user' ? 'user' : null),
        label: assigneeLabelFromIds(currentTask?.assignee_id, currentTask?.assignee_type),
      };

      const normalizeForm = (rawForm: any): StageHandoverForm => {
        const formId = String(rawForm?.id || buildHandoverFormId());
        const mergedFormGroups = mergeSavedGroups(withOrderGroups, rawForm?.groups || []).map((group) =>
          recalcHandoverGroup({
            ...group,
            sourceShelfId: sourceShelfId ? String(sourceShelfId) : null,
            targetShelfId: rawForm?.targetShelfId
              ? String(rawForm.targetShelfId)
              : (targetShelfId ? String(targetShelfId) : null),
          })
        );
        return {
          id: formId,
          sourceTaskId: rawForm?.sourceTaskId ? String(rawForm.sourceTaskId) : (previousTask?.id ? String(previousTask.id) : null),
          sourceStageName: String(rawForm?.sourceStageName || sourceStageName || 'شروع تولید'),
          sourceShelfId: rawForm?.sourceShelfId
            ? String(rawForm.sourceShelfId)
            : (sourceShelfId ? String(sourceShelfId) : null),
          targetShelfId: rawForm?.targetShelfId
            ? String(rawForm.targetShelfId)
            : (targetShelfId ? String(targetShelfId) : null),
          giver,
          receiver,
          groups: mergedFormGroups,
          wasteByProduct: rawForm?.wasteByProduct && typeof rawForm.wasteByProduct === 'object'
            ? rawForm.wasteByProduct
            : {},
          giverConfirmation: rawForm?.giverConfirmation?.confirmed
            ? rawForm.giverConfirmation
            : { confirmed: false },
          receiverConfirmation: rawForm?.receiverConfirmation?.confirmed
            ? rawForm.receiverConfirmation
            : { confirmed: false },
          createdAt: rawForm?.createdAt || rawForm?.updatedAt || new Date().toISOString(),
          updatedAt: rawForm?.updatedAt || rawForm?.createdAt || new Date().toISOString(),
        };
      };

      const existingFormsRaw = Array.isArray(currentHandover?.forms) ? currentHandover.forms : [];
      const legacyForm =
        existingFormsRaw.length === 0 && Array.isArray(currentHandover?.groups)
          ? [{
              id: currentHandover?.activeFormId || buildHandoverFormId(),
              sourceTaskId: currentHandover?.sourceTaskId || (previousTask?.id ? String(previousTask.id) : null),
              sourceStageName: currentHandover?.sourceStageName || sourceStageName,
              sourceShelfId: currentHandover?.sourceShelfId || sourceShelfId,
              targetShelfId: currentHandover?.targetShelfId || targetShelfId,
              giverConfirmation: currentHandover?.giverConfirmation || { confirmed: false },
              receiverConfirmation: currentHandover?.receiverConfirmation || { confirmed: false },
              wasteByProduct: currentHandover?.wasteByProduct || {},
              groups: currentHandover?.groups || [],
              updatedAt: currentHandover?.updatedAt || new Date().toISOString(),
            }]
          : [];
      const seedForms = existingFormsRaw.length > 0 ? existingFormsRaw : legacyForm;
      const normalizedForms = (seedForms.length > 0
        ? seedForms
        : [{
            id: buildHandoverFormId(),
            groups: mergedGroups,
            sourceTaskId: previousTask?.id ? String(previousTask.id) : null,
            sourceStageName,
            sourceShelfId,
            targetShelfId,
            giverConfirmation: { confirmed: false },
            receiverConfirmation: { confirmed: false },
            wasteByProduct: {},
            updatedAt: new Date().toISOString(),
          }]
      ).map((form: any) => normalizeForm(form));

      const preferredFormId = String(currentHandover?.activeFormId || normalizedForms[0]?.id || '');
      const activeForm = normalizedForms.find((form: StageHandoverForm) => String(form.id) === preferredFormId) || normalizedForms[0];
      const sourceTotalsByProduct = toSourceTotals(withOrderGroups);
      const orderTotalsByProduct = toOrderTotals(withOrderGroups);
      const outgoingRows: StageHandoverFormListRow[] = (() => {
        const rawForms = Array.isArray(nextHandover?.forms) ? nextHandover.forms : [];
        const normalizedOutgoing = rawForms.length > 0
          ? rawForms
          : (Array.isArray(nextHandover?.groups) ? [{ ...nextHandover, id: nextHandover?.activeFormId || `next_${Date.now()}` }] : []);
        return normalizedOutgoing.map((form: any, index: number) => ({
          id: String(form?.id || `next_${index}`),
          title: `تحویل به ${String(nextTask?.name || nextTask?.title || 'مرحله بعد')}${index > 0 ? ` (${toPersianNumber(index + 1)})` : ''}`,
          createdAt: form?.createdAt || form?.updatedAt || null,
          updatedAt: form?.updatedAt || form?.createdAt || null,
          giverConfirmed: !!form?.giverConfirmation?.confirmed,
          receiverConfirmed: !!form?.receiverConfirmation?.confirmed,
        }));
      })();

      setHandoverTask(currentTask);
      setHandoverForms(normalizedForms);
      setNextStageHandoverFormRows(outgoingRows);
      setActiveHandoverFormId(activeForm?.id || null);
      setHandoverGroups(activeForm?.groups || []);
      setHandoverContext({
        taskId: String(currentTask.id),
        orderId: String(recordId),
        lineId,
        sourceTaskId: previousTask?.id ? String(previousTask.id) : null,
        sourceStageName,
        sourceShelfId: sourceShelfId ? String(sourceShelfId) : null,
        targetShelfId: activeForm?.targetShelfId || (targetShelfId ? String(targetShelfId) : null),
        giver,
        receiver,
        groups: withOrderGroups,
        giverConfirmation: activeForm?.giverConfirmation || { confirmed: false },
        receiverConfirmation: activeForm?.receiverConfirmation || { confirmed: false },
        previousTotalsByProduct: toGroupTotals((activeForm?.groups || []) as any),
        previousWasteByProduct: activeForm?.wasteByProduct || {},
        sourceTotalsByProduct,
        orderTotalsByProduct,
      });
      setHandoverFormsModalOpen(true);
      setHandoverEditorOpen(false);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'خطا در بارگذاری فرم تحویل'));
    } finally {
      setHandoverLoading(false);
    }
  }, [
    supportsHandover,
    recordId,
    isBom,
    productionShelfOptions.length,
    fetchProductionShelves,
    assignees.roles.length,
    assignees.users.length,
    getLineTaskChain,
    getHandoverFromTask,
    buildGroupsFromPreviousStage,
    buildGroupsFromOrder,
    closeTaskQuickModal,
    mergeSavedGroups,
    recalcHandoverGroup,
    resolveCategoryLabel,
    assigneeLabelFromIds,
    buildHandoverFormId,
    toOrderTotals,
    toSourceTotals,
    toGroupTotals,
  ]);

  useEffect(() => {
    if (!autoOpenTaskId) {
      autoOpenedTaskIdRef.current = null;
      return;
    }
    if (autoOpenedTaskIdRef.current === String(autoOpenTaskId)) return;
    if (!tasks.length) return;

    const targetTask = tasks.find((task: any) => String(task?.id || '') === String(autoOpenTaskId));
    if (!targetTask) return;

    autoOpenedTaskIdRef.current = String(autoOpenTaskId);
    setOpenTaskPopoverId(String(targetTask.id));
  }, [autoOpenTaskId, tasks]);

  const setHandoverGroupCollapsed = useCallback((groupIndex: number, collapsed: boolean) => {
    setHandoverGroups((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      next[groupIndex] = { ...group, collapsed };
      return next;
    });
  }, []);

  const addHandoverDeliveryRow = useCallback((groupIndex: number) => {
    setHandoverGroups((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      const deliveryRows = Array.isArray(group.deliveryRows) ? [...group.deliveryRows] : [];
      deliveryRows.push(normalizeHandoverDeliveryRow(group));
      next[groupIndex] = recalcHandoverGroup({ ...group, deliveryRows, isConfirmed: false });
      return next;
    });
  }, [normalizeHandoverDeliveryRow, recalcHandoverGroup]);

  const deleteHandoverDeliveryRows = useCallback((groupIndex: number, rowKeys: string[]) => {
    if (!rowKeys.length) return;
    const keySet = new Set(rowKeys.map((key) => String(key)));
    setHandoverGroups((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      const deliveryRows = (group.deliveryRows || []).filter((row) => !keySet.has(String(row.key)));
      next[groupIndex] = recalcHandoverGroup({ ...group, deliveryRows, isConfirmed: false });
      return next;
    });
  }, [recalcHandoverGroup]);

  const transferHandoverDeliveryRows = useCallback((
    sourceGroupIndex: number,
    rowKeys: string[],
    targetGroupIndex: number,
    mode: 'copy' | 'move'
  ) => {
    if (!rowKeys.length) return;
    setHandoverGroups((prev) => {
      const next = [...prev];
      const sourceGroup = next[sourceGroupIndex];
      const targetGroup = next[targetGroupIndex];
      if (!sourceGroup || !targetGroup) return prev;
      if (mode === 'move' && sourceGroupIndex === targetGroupIndex) return prev;

      const keySet = new Set(rowKeys.map((key) => String(key)));
      const sourceRows = Array.isArray(sourceGroup.deliveryRows) ? sourceGroup.deliveryRows : [];
      const selectedRows = sourceRows.filter((row) => keySet.has(String(row.key)));
      if (!selectedRows.length) return prev;

      const copiedRows = selectedRows.map((row) =>
        normalizeHandoverDeliveryRow(targetGroup, {
          ...row,
          key: buildHandoverRowKey(),
          pieceKey: undefined,
        })
      );

      const nextTargetRows = [...(targetGroup.deliveryRows || []), ...copiedRows];
      next[targetGroupIndex] = recalcHandoverGroup({
        ...targetGroup,
        deliveryRows: nextTargetRows,
        isConfirmed: false,
      });

      if (mode === 'move') {
        const nextSourceRows = sourceRows.filter((row) => !keySet.has(String(row.key)));
        next[sourceGroupIndex] = recalcHandoverGroup({
          ...sourceGroup,
          deliveryRows: nextSourceRows,
          isConfirmed: false,
        });
      }

      return next;
    });
  }, [buildHandoverRowKey, normalizeHandoverDeliveryRow, recalcHandoverGroup]);

  const updateHandoverDeliveryRowField = useCallback((
    groupIndex: number,
    rowKey: string,
    field: keyof Omit<StageHandoverDeliveryRow, 'key'>,
    value: any
  ) => {
    setHandoverGroups((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      const deliveryRows = [...(group.deliveryRows || [])];
      const rowIndex = deliveryRows.findIndex((row) => String(row.key) === String(rowKey));
      if (rowIndex < 0) return prev;
      const currentRow = deliveryRows[rowIndex];
      const numericFields: Array<keyof Omit<StageHandoverDeliveryRow, 'key'>> = ['length', 'width', 'quantity'];
      const nextValue = numericFields.includes(field)
        ? Math.max(0, toNumber(value))
        : (value == null ? '' : String(value));
      const updatedRow = { ...currentRow, [field]: nextValue };
      deliveryRows[rowIndex] = {
        ...updatedRow,
        deliveredQty: Math.max(0, toNumber(updatedRow.length)) * Math.max(0, toNumber(updatedRow.width)) * Math.max(0, toNumber(updatedRow.quantity)),
      };
      next[groupIndex] = recalcHandoverGroup({ ...group, deliveryRows, isConfirmed: false });
      return next;
    });
  }, [recalcHandoverGroup, toNumber]);

  const confirmHandoverGroup = useCallback((groupIndex: number) => {
    const group = handoverGroups[groupIndex];
    if (!group) return;
    if (!handoverContext?.targetShelfId) {
      message.error('قفسه مرحله انتخاب نشده است.');
      return;
    }
    if (!group.totalHandoverQty || group.totalHandoverQty <= 0) {
      message.error('برای این محصول، مقدار تحویل شده معتبر نیست.');
      return;
    }
    setHandoverGroups((prev) => {
      const next = [...prev];
      const current = next[groupIndex];
      if (!current) return prev;
      next[groupIndex] = { ...current, isConfirmed: true, collapsed: true };
      return next;
    });
    message.success('این محصول ثبت شد.');
  }, [handoverContext?.targetShelfId, handoverGroups]);

  const setHandoverTargetShelf = useCallback((shelfId: string | null) => {
    setHandoverContext((prev) => (prev ? { ...prev, targetShelfId: shelfId } : prev));
    setHandoverGroups((prev) =>
      prev.map((group) => ({
        ...group,
        targetShelfId: shelfId,
        isConfirmed: false,
      }))
    );
  }, []);

  const handleHandoverShelfScan = useCallback((shelfId: string) => {
    const allowed = productionShelfOptions.some((option) => String(option.value) === String(shelfId));
    if (!allowed) {
      message.error('قفسه اسکن‌شده در لیست قفسه‌های تولید نیست.');
      return;
    }
    setHandoverTargetShelf(shelfId);
  }, [productionShelfOptions, setHandoverTargetShelf]);

  const saveHandover = useCallback(async (confirmSide?: StageHandoverSide) => {
    if (!handoverContext || !handoverTask) return false;
    if (!handoverContext.targetShelfId) {
      message.error('قفسه این مرحله انتخاب نشده است.');
      return false;
    }
    if (!handoverContext.sourceShelfId) {
      message.error('قفسه مرحله قبلی/منبع مشخص نشده است.');
      return false;
    }

    setHandoverLoading(true);
    try {
      const { data: freshTask, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', handoverContext.taskId)
        .maybeSingle();
      if (taskError) throw taskError;

      const recurrence = parseRecurrenceInfo(freshTask?.recurrence_info);
      const existing = recurrence?.production_handover && typeof recurrence.production_handover === 'object'
        ? recurrence.production_handover
        : {};

      const existingFormsRaw = Array.isArray(existing?.forms) ? existing.forms : [];
      const fallbackLegacyForm = Array.isArray(existing?.groups)
        ? [{
            id: existing?.activeFormId || activeHandoverFormId || buildHandoverFormId(),
            groups: existing.groups,
            wasteByProduct: existing?.wasteByProduct || {},
            giverConfirmation: existing?.giverConfirmation || { confirmed: false },
            receiverConfirmation: existing?.receiverConfirmation || { confirmed: false },
            sourceTaskId: existing?.sourceTaskId || handoverContext.sourceTaskId,
            sourceStageName: existing?.sourceStageName || handoverContext.sourceStageName,
            sourceShelfId: existing?.sourceShelfId || handoverContext.sourceShelfId,
            targetShelfId: existing?.targetShelfId || handoverContext.targetShelfId,
            createdAt: existing?.createdAt || existing?.updatedAt || new Date().toISOString(),
            updatedAt: existing?.updatedAt || existing?.createdAt || new Date().toISOString(),
          }]
        : [];
      const existingForms = existingFormsRaw.length > 0 ? existingFormsRaw : fallbackLegacyForm;

      const formId = String(activeHandoverFormId || existing?.activeFormId || existingForms[0]?.id || buildHandoverFormId());
      const existingForm = existingForms.find((item: any) => String(item?.id || '') === formId) || null;

      const previousGroups = Array.isArray(existingForm?.groups) ? existingForm.groups : [];
      const previousWasteByProduct = existingForm?.wasteByProduct && typeof existingForm.wasteByProduct === 'object'
        ? existingForm.wasteByProduct
        : {};
      const hasImmutableConfirmation = Boolean(
        existingForm?.giverConfirmation?.confirmed || existingForm?.receiverConfirmation?.confirmed
      );
      const effectiveGroups = (hasImmutableConfirmation ? previousGroups : handoverGroups) as any[];
      const effectiveTargetShelfId = hasImmutableConfirmation
        ? (existingForm?.targetShelfId ? String(existingForm.targetShelfId) : handoverContext.targetShelfId)
        : handoverContext.targetShelfId;
      const previousTotalsByProduct = toGroupTotals(previousGroups as any);
      const nextTotalsByProduct = toGroupTotals(effectiveGroups as any);

      const nextWasteByProduct: Record<string, number> = {};
      effectiveGroups.forEach((group: any) => {
        const productId = (
          group.selectedProductId
          || (group as any)?.selected_product_id
          || (Array.isArray((group as any)?.pieces)
            ? ((group as any).pieces.find((piece: any) => piece?.selectedProductId || piece?.selected_product_id || piece?.product_id)?.selectedProductId
              || (group as any).pieces.find((piece: any) => piece?.selectedProductId || piece?.selected_product_id || piece?.product_id)?.selected_product_id
              || (group as any).pieces.find((piece: any) => piece?.selectedProductId || piece?.selected_product_id || piece?.product_id)?.product_id)
            : null)
        );
        const normalizedProductId = productId ? String(productId) : '';
        if (!normalizedProductId) return;
        const sourceQty = (Array.isArray(group?.pieces) ? group.pieces : []).reduce(
          (sum: number, piece: any) => sum + toNumber(piece?.sourceQty),
          0
        );
        const deliveryRows = Array.isArray(group?.deliveryRows) ? group.deliveryRows : [];
        const handoverQty = deliveryRows.length > 0
          ? deliveryRows.reduce(
              (sum: number, row: any) =>
                sum + (Math.max(0, toNumber(row?.length)) * Math.max(0, toNumber(row?.width)) * Math.max(0, toNumber(row?.quantity))),
              0
            )
          : (Array.isArray(group?.pieces) ? group.pieces : []).reduce(
              (sum: number, piece: any) => sum + toNumber(piece?.handoverQty),
              0
            );
        const waste = Math.max(0, sourceQty - handoverQty);
        if (waste > 0) nextWasteByProduct[normalizedProductId] = (nextWasteByProduct[normalizedProductId] || 0) + waste;
      });

      const shortageTotal = Object.values(nextWasteByProduct).reduce((sum, value) => sum + toNumber(value), 0);
      let registerWaste = false;
      if (shortageTotal > 0) {
        registerWaste = await new Promise<boolean>((resolve) => {
          Modal.confirm({
            title: 'ثبت ضایعات',
            content: 'مقدار تحویل شده از مقداری که تحویل گرفته بودید کمتر است، بعنوان ضایعات ثبت شود؟',
            okText: 'بله',
            cancelText: 'خیر',
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          });
        });
      }

      const finalWasteByProduct = registerWaste ? nextWasteByProduct : {};
      const deltas: Array<{ productId: string; shelfId: string; delta: number }> = [];
      const transferLogs: any[] = [];
      const userId = currentUser.id;

      const productIds = new Set<string>([
        ...Object.keys(previousTotalsByProduct),
        ...Object.keys(nextTotalsByProduct),
      ]);
      productIds.forEach((productId) => {
        const prevQty = toNumber(previousTotalsByProduct[productId]);
        const nextQty = toNumber(nextTotalsByProduct[productId]);
        const delta = nextQty - prevQty;
        if (!delta) return;
        const sourceShelfId = String(handoverContext.sourceShelfId);
        const targetShelfId = String(effectiveTargetShelfId);
        if (!sourceShelfId || !targetShelfId || sourceShelfId === targetShelfId) return;
        if (delta > 0) {
          deltas.push({ productId, shelfId: sourceShelfId, delta: -delta });
          deltas.push({ productId, shelfId: targetShelfId, delta });
          transferLogs.push({
            transfer_type: 'production_stage',
            product_id: productId,
            required_qty: delta,
            delivered_qty: delta,
            production_order_id: handoverContext.orderId,
            from_shelf_id: sourceShelfId,
            to_shelf_id: targetShelfId,
            sender_id: userId,
            receiver_id: userId,
          });
        } else {
          const rollbackQty = Math.abs(delta);
          deltas.push({ productId, shelfId: sourceShelfId, delta: rollbackQty });
          deltas.push({ productId, shelfId: targetShelfId, delta: -rollbackQty });
          transferLogs.push({
            transfer_type: 'production_stage',
            product_id: productId,
            required_qty: rollbackQty,
            delivered_qty: rollbackQty,
            production_order_id: handoverContext.orderId,
            from_shelf_id: targetShelfId,
            to_shelf_id: sourceShelfId,
            sender_id: userId,
            receiver_id: userId,
          });
        }
      });

      const wasteProductIds = new Set<string>([
        ...Object.keys(previousWasteByProduct),
        ...Object.keys(finalWasteByProduct),
      ]);
      wasteProductIds.forEach((productId) => {
        const prevWaste = toNumber(previousWasteByProduct[productId]);
        const nextWaste = toNumber(finalWasteByProduct[productId]);
        const wasteDelta = nextWaste - prevWaste;
        if (!wasteDelta || !handoverContext.sourceShelfId) return;
        if (wasteDelta > 0) {
          deltas.push({ productId, shelfId: String(handoverContext.sourceShelfId), delta: -wasteDelta });
          transferLogs.push({
            transfer_type: 'waste',
            product_id: productId,
            required_qty: wasteDelta,
            delivered_qty: wasteDelta,
            production_order_id: handoverContext.orderId,
            from_shelf_id: String(handoverContext.sourceShelfId),
            to_shelf_id: null,
            sender_id: userId,
            receiver_id: userId,
          });
        } else {
          deltas.push({ productId, shelfId: String(handoverContext.sourceShelfId), delta: Math.abs(wasteDelta) });
        }
      });

      if (deltas.length > 0) {
        await applyInventoryDeltas(supabase as any, deltas);
        await syncMultipleProductsStock(
          supabase as any,
          Array.from(new Set(deltas.map((item) => item.productId).filter(Boolean)))
        );
      }

      if (transferLogs.length > 0) {
        const { error: transferError } = await supabase.from('stock_transfers').insert(transferLogs);
        if (transferError) throw transferError;
      }

      const nowIso = new Date().toISOString();
      const nextGiverConfirmation: StageHandoverConfirm = existingForm?.giverConfirmation?.confirmed
        ? existingForm.giverConfirmation
        : { confirmed: false };
      const nextReceiverConfirmation: StageHandoverConfirm = existingForm?.receiverConfirmation?.confirmed
        ? existingForm.receiverConfirmation
        : { confirmed: false };
      if (confirmSide === 'giver') {
        nextGiverConfirmation.confirmed = true;
        nextGiverConfirmation.userId = currentUser.id;
        nextGiverConfirmation.userName = currentUser.fullName;
        nextGiverConfirmation.at = nowIso;
      }
      if (confirmSide === 'receiver') {
        nextReceiverConfirmation.confirmed = true;
        nextReceiverConfirmation.userId = currentUser.id;
        nextReceiverConfirmation.userName = currentUser.fullName;
        nextReceiverConfirmation.at = nowIso;
      }

      const nextForm: StageHandoverForm = {
        id: formId,
        sourceTaskId: handoverContext.sourceTaskId,
        sourceStageName: handoverContext.sourceStageName,
        sourceShelfId: handoverContext.sourceShelfId,
        targetShelfId: effectiveTargetShelfId,
        giver: handoverContext.giver,
        receiver: handoverContext.receiver,
        groups: effectiveGroups as any,
        wasteByProduct: finalWasteByProduct,
        giverConfirmation: nextGiverConfirmation,
        receiverConfirmation: nextReceiverConfirmation,
        createdAt: existingForm?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      const nextForms = (() => {
        let replaced = false;
        const mapped = existingForms.map((form: any) => {
          if (String(form?.id || '') !== formId) return form;
          replaced = true;
          return nextForm;
        });
        if (!replaced) mapped.push(nextForm);
        return mapped;
      })();

      const nextHandover = {
        sourceTaskId: handoverContext.sourceTaskId,
        sourceStageName: handoverContext.sourceStageName,
        sourceShelfId: handoverContext.sourceShelfId,
        targetShelfId: effectiveTargetShelfId,
        giver: handoverContext.giver,
        receiver: handoverContext.receiver,
        groups: nextForm.groups,
        wasteByProduct: nextForm.wasteByProduct,
        giverConfirmation: nextForm.giverConfirmation,
        receiverConfirmation: nextForm.receiverConfirmation,
        forms: nextForms,
        activeFormId: formId,
        updatedAt: nowIso,
      };

      const nextRecurrence = {
        ...recurrence,
        production_handover: nextHandover,
      };

      const updatePayload: any = {
        recurrence_info: nextRecurrence,
        production_shelf_id: effectiveTargetShelfId,
      };
      const { error: updateError } = await supabase
        .from('tasks')
        .update(updatePayload)
        .eq('id', handoverContext.taskId);
      if (updateError) throw updateError;

      const updatedTask = {
        ...freshTask,
        ...updatePayload,
        recurrence_info: nextRecurrence,
      };
      setTasks((prev) => prev.map((item: any) => (
        String(item?.id) === String(handoverContext.taskId)
          ? {
              ...item,
              recurrence_info: nextRecurrence,
              production_shelf_id: effectiveTargetShelfId,
            }
          : item
      )));
      setHandoverTask(updatedTask);
      setHandoverForms(nextForms as StageHandoverForm[]);
      setActiveHandoverFormId(formId);
      setHandoverContext((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          targetShelfId: effectiveTargetShelfId,
          groups: prev.groups,
          previousTotalsByProduct: nextTotalsByProduct,
          previousWasteByProduct: finalWasteByProduct,
          giverConfirmation: nextGiverConfirmation,
          receiverConfirmation: nextReceiverConfirmation,
        };
      });
      message.success(confirmSide ? 'تایید ثبت شد' : 'فرم تحویل ذخیره شد');
      return true;
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'خطا در ثبت فرم تحویل'));
      return false;
    } finally {
      setHandoverLoading(false);
    }
  }, [
    activeHandoverFormId,
    buildHandoverFormId,
    currentUser.fullName,
    currentUser.id,
    handoverContext,
    handoverGroups,
    handoverTask,
    parseRecurrenceInfo,
    toGroupTotals,
    toNumber,
  ]);

  const maybeOpenHandoverByStatus = useCallback(async (taskId: string, newStatus: string, providedTasks?: any[]) => {
    if (!supportsHandover || !taskId || !recordId || isBom) return;
    const normalized = String(newStatus || '').toLowerCase();
    if (normalized !== 'in_progress' && normalized !== 'done' && normalized !== 'completed') return;
    const allTasks = (providedTasks && providedTasks.length > 0) ? providedTasks : tasks;
    const currentTask = allTasks.find((item: any) => String(item?.id) === String(taskId));
    if (!currentTask || !currentTask?.production_line_id) return;
    const chain = getLineTaskChain(String(currentTask.production_line_id), allTasks);
    const currentIndex = chain.findIndex((item: any) => String(item?.id) === String(taskId));
    const isFirstStage = currentIndex === 0;
    if (normalized === 'in_progress' && !isFirstStage) return;

    const handover = getHandoverFromTask(currentTask);
    const forms = Array.isArray(handover?.forms) ? handover.forms : [];
    const isComplete = forms.length > 0
      ? forms.every((form: any) => form?.giverConfirmation?.confirmed && form?.receiverConfirmation?.confirmed)
      : (handover?.giverConfirmation?.confirmed && handover?.receiverConfirmation?.confirmed);
    if (isComplete) return;

    await openTaskHandoverModal(currentTask, allTasks);
  }, [supportsHandover, recordId, isBom, tasks, getLineTaskChain, getHandoverFromTask, openTaskHandoverModal]);

  const openHandoverEditorForForm = useCallback((formId: string | null) => {
    if (!formId) return;
    const form = handoverForms.find((item) => String(item.id) === String(formId));
    if (!form) return;
    setActiveHandoverFormId(String(form.id));
    setHandoverGroups(Array.isArray(form.groups) ? form.groups : []);
    setHandoverContext((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        targetShelfId: form.targetShelfId || prev.targetShelfId,
        giverConfirmation: form.giverConfirmation || { confirmed: false },
        receiverConfirmation: form.receiverConfirmation || { confirmed: false },
        previousTotalsByProduct: toGroupTotals((form.groups || []) as any),
        previousWasteByProduct: form.wasteByProduct || {},
      };
    });
    setHandoverEditorOpen(true);
  }, [handoverForms, toGroupTotals]);

  const handleCreateHandoverForm = useCallback(() => {
    if (!handoverContext) return;
    const emptyGroups = (handoverContext.groups || []).map((group) =>
      recalcHandoverGroup({
        ...group,
        deliveryRows: [],
        totalHandoverQty: 0,
        isConfirmed: false,
        collapsed: true,
      })
    );
    const nowIso = new Date().toISOString();
    const newForm: StageHandoverForm = {
      id: buildHandoverFormId(),
      sourceTaskId: handoverContext.sourceTaskId,
      sourceStageName: handoverContext.sourceStageName,
      sourceShelfId: handoverContext.sourceShelfId,
      targetShelfId: handoverContext.targetShelfId,
      giver: handoverContext.giver,
      receiver: handoverContext.receiver,
      groups: emptyGroups,
      wasteByProduct: {},
      giverConfirmation: { confirmed: false },
      receiverConfirmation: { confirmed: false },
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    setHandoverForms((prev) => [...prev, newForm]);
    setActiveHandoverFormId(newForm.id);
    setHandoverGroups(newForm.groups);
    setHandoverContext((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        targetShelfId: newForm.targetShelfId,
        giverConfirmation: newForm.giverConfirmation,
        receiverConfirmation: newForm.receiverConfirmation,
        previousTotalsByProduct: {},
        previousWasteByProduct: {},
      };
    });
    setHandoverEditorOpen(true);
  }, [buildHandoverFormId, handoverContext, recalcHandoverGroup]);

  const closeHandoverEditor = useCallback(() => {
    handoverEditorHistoryRef.current = null;
    setHandoverEditorOpen(false);
  }, []);

  const closeHandoverModal = useCallback(() => {
    resetHandoverState();
  }, [resetHandoverState]);
  const handleHandoverTaskUpdated = useCallback(async (updatedTask: any) => {
    if (!updatedTask?.id) return;
    setTasks((prev) => prev.map((item: any) => (
      String(item?.id || '') === String(updatedTask.id)
        ? { ...item, ...updatedTask }
        : item
    )));
    setHandoverTask((prev: any) => (
      prev && String(prev?.id || '') === String(updatedTask.id)
        ? { ...prev, ...updatedTask }
        : prev
    ));
  }, []);

  const handleConfirmGiver = useCallback(async () => {
    const ok = await saveHandover('giver');
    if (!ok) return;
  }, [saveHandover]);

  const handleConfirmReceiver = useCallback(async () => {
    const ok = await saveHandover('receiver');
    if (!ok) return;
  }, [saveHandover]);

  const handleAddLine = async (values: any) => {
    if (!recordId || !isProductionOrder) return;
    try {
      let nextNo = values.line_no;
      if (!nextNo) {
        const { data: maxRow, error: maxError } = await supabase
          .from('production_lines')
          .select('line_no')
          .eq('production_order_id', recordId)
          .order('line_no', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (maxError) throw maxError;
        nextNo = (Number(maxRow?.line_no) || 0) + 1;
      }
      const payload = {
        production_order_id: recordId,
        line_no: nextNo,
        quantity: values.quantity || 0,
      };
      const { error } = await supabase.from('production_lines').insert(payload);
      if (error) throw error;
      message.success('خط تولید جدید اضافه شد');
      setIsLineModalOpen(false);
      lineForm.resetFields();
      fetchLines();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'خطا در ثبت اطلاعات'));
    }
  };

  const handleLineQuantityChange = async (lineId: string, quantity: number) => {
    if (!isProductionOrder) return;
    try {
      const { error } = await supabase.from('production_lines').update({ quantity }).eq('id', lineId);
      if (error) throw error;
      setLines(prev => prev.map(line => (line.id === lineId ? { ...line, quantity } : line)));
    } catch (err: any) {
      message.error(`خطا: ${err.message}`);
    }
  };

  const openTaskModal = (
    lineId: string,
    draftStage?: any,
    processGroupMeta?: { id: string; label?: string | null; templateId?: string | null; templateName?: string | null }
  ) => {
    setActiveLineId(lineId);
    setDraftToCreate(draftStage || null);
    if (processGroupMeta?.id) {
      setActiveProcessGroupMeta({
        id: String(processGroupMeta.id),
        label: processGroupMeta.label || null,
        templateId: processGroupMeta.templateId || null,
        templateName: processGroupMeta.templateName || null,
      });
    } else if (draftStage) {
      const stageMeta = getStageProcessGroupMeta(draftStage);
      setActiveProcessGroupMeta({
        id: stageMeta.groupId,
        label: stageMeta.groupLabel,
        templateId: stageMeta.templateId,
        templateName: stageMeta.templateName,
      });
    } else {
      setActiveProcessGroupMeta(null);
    }
    const stageCustomFields = getProcessTaskCustomFieldsFromStage(draftStage);
    const stageCustomFieldValues = mergeProcessTaskCustomFieldValues(stageCustomFields, {});
    setTaskCustomFieldDrafts((prev) => {
      const next = { ...prev };
      if (stageCustomFields.length > 0) {
        next[TASK_MODAL_CUSTOM_FIELD_DRAFT_ID] = stageCustomFieldValues;
      } else {
        delete next[TASK_MODAL_CUSTOM_FIELD_DRAFT_ID];
      }
      return next;
    });
    void loadTaskCustomFieldOptions(stageCustomFields);
    const defaultRoleId = draftStage?.default_assignee_role_id ? String(draftStage.default_assignee_role_id) : null;
    const defaultUserId = draftStage?.default_assignee_id ? String(draftStage.default_assignee_id) : null;
    const assigneeCombo = defaultRoleId
      ? `role:${defaultRoleId}`
      : (defaultUserId ? `user:${defaultUserId}` : undefined);
    const initial = {
      name: draftStage?.name || '',
      sort_order: draftStage?.sort_order || ((tasks.length + 1) * 10),
      wage: draftStage?.wage || 0,
      weight: draftStage?.weight || 0,
      description: draftStage?.description || '',
      task_type: draftStage?.task_type || undefined,
      duration_from: draftStage?.duration_from || 'project_start',
      duration_value: Number(draftStage?.duration_value || 0),
      duration_unit: draftStage?.duration_unit || 'day',
      assignee_combo: assigneeCombo,
    };
    taskForm.setFieldsValue(initial);
    setIsTaskModalOpen(true);
  };

  const handleAddTask = async (values: any) => {
    if (!recordId || !activeLineId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { assigneeType, assigneeId } = parseAssigneeComboValue(values.assignee_combo);
      let dueDate = normalizeDueDateValue(values.due_date);
      const taskDescription = String(values?.description || '').trim() || null;
      const taskType = String(values?.task_type || '').trim() || null;
      const stageAutomationRules = normalizeProcessAutomationRules(draftToCreate?.automation_rules);
      const stageCustomFields = getProcessTaskCustomFieldsFromStage(draftToCreate);
      const stageCustomStatusOptions = getProcessTaskStatusOptionsFromStage(draftToCreate);
      const stageProcessLinkMap = draftToCreate?.process_link_map && typeof draftToCreate.process_link_map === 'object'
        ? draftToCreate.process_link_map
        : {};
      const stageTargetModuleIds = normalizeProcessTargetModuleIds(
        draftToCreate?.process_target_module_ids,
        moduleId
      );
      const currentSortOrder = Number(values?.sort_order || draftToCreate?.sort_order || 0);
      const previousTaskForTemplate = getLineTaskChain(activeLineId)
        .filter((task: any) => Number(task?.sort_order || 0) < currentSortOrder)
        .sort((a: any, b: any) => Number(b?.sort_order || 0) - Number(a?.sort_order || 0))[0] || null;
      const durationValue = Math.max(0, Number(values?.duration_value || 0));
      const durationUnit = String(values?.duration_unit || 'day') === 'hour' ? 'hour' : 'day';
      const durationFrom = String(values?.duration_from || 'project_start') === 'previous_stage_end'
        ? 'previous_stage_end'
        : 'project_start';

      if (!dueDate && durationValue > 0) {
        let previousDueAt: Date | null = null;
        if (durationFrom === 'previous_stage_end') {
          const currentSort = Number(values?.sort_order || draftToCreate?.sort_order || 0);
          const sortedChain = getLineTaskChain(activeLineId)
            .filter((task: any) => Number(task?.sort_order || 0) < currentSort && !!task?.due_date)
            .sort((a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
          const previousTask = sortedChain.length > 0 ? sortedChain[sortedChain.length - 1] : null;
          if (previousTask?.due_date) {
            const parsedPrevious = new Date(previousTask.due_date);
            if (!Number.isNaN(parsedPrevious.getTime())) previousDueAt = parsedPrevious;
          }
        }
        const baseDate = isProcessRecordModule ? await getProcessBaseDate() : new Date();
        const computedDueAt = computeStageDueAt(
          {
            duration_value: durationValue,
            duration_unit: durationUnit,
            duration_from: durationFrom,
          },
          baseDate,
          previousDueAt
        );
        dueDate = computedDueAt ? computedDueAt.toISOString() : null;
      }

      const templateContext = await buildTaskTemplateContextRecord({
        taskName: values?.name,
        taskType,
        dueDate,
        processLinkMap: stageProcessLinkMap,
        previousTask: previousTaskForTemplate,
      });
      const resolvedTaskName = String(
        renderTemplateValueFromRecord(values?.name, templateContext, FieldType.TEXT) ?? values?.name ?? ''
      ).trim();
      const resolvedTaskDescription = String(
        renderTemplateValueFromRecord(taskDescription, {
          ...templateContext,
          task_name: resolvedTaskName || String(values?.name || '').trim(),
        }, FieldType.LONG_TEXT) ?? taskDescription ?? ''
      ).trim() || null;
      const resolvedStageCustomFields = stageCustomFields.map((field) => ({
        ...field,
        defaultValue: renderTemplateValueFromRecord(
          field?.defaultValue,
          {
            ...templateContext,
            task_name: resolvedTaskName || String(values?.name || '').trim(),
            description: resolvedTaskDescription || '',
          },
          field.type
        ),
      }));
      const stageCustomFieldValues = mergeProcessTaskCustomFieldValues(
        resolvedStageCustomFields,
        taskCustomFieldDrafts[TASK_MODAL_CUSTOM_FIELD_DRAFT_ID] || {}
      );

      const payload: any = {
        name: resolvedTaskName || values.name,
        status: 'todo',
        assignee_id: assigneeType === 'user' ? assigneeId : null,
        assignee_role_id: assigneeType === 'role' ? assigneeId : null,
        assignee_type: assigneeType,
        due_date: dueDate,
        description: resolvedTaskDescription,
        task_type: taskType,
        wage: values.wage || null,
        weight: values.weight || 0,
        sort_order: values.sort_order || ((tasks.length + 1) * 10),
        created_by: user?.id,
        source_template_id: activeProcessGroupMeta?.templateId || null,
        source_stage_sort_order: values.sort_order || draftToCreate?.sort_order || null,
        process_group_id: activeProcessGroupMeta?.id || null,
        ...buildTaskSourceInitialValues(isProductionOrder ? 'production_orders' : moduleId, recordId),
      };
      const currentRecurrence = values?.recurrence_info && typeof values.recurrence_info === 'object'
        ? values.recurrence_info
        : {};

      if (resolvedStageCustomFields.length > 0) {
        payload.recurrence_info = {
          ...currentRecurrence,
          ...(taskType ? { task_type: taskType } : {}),
          [PROCESS_TASK_CUSTOM_FIELDS_KEY]: resolvedStageCustomFields,
          [PROCESS_TASK_STATUS_OPTIONS_KEY]: stageCustomStatusOptions,
          [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: stageCustomFieldValues,
        };
      }

      if (isProductionOrder) {
        payload.produced_qty = 0;
        payload.production_line_id = activeLineId;
      } else if (isProcessRecordModule) {
        payload.produced_qty = 0;
        payload.production_line_id = null;
        payload.production_shelf_id = null;
        payload.recurrence_info = {
          ...(payload.recurrence_info || currentRecurrence),
          ...(taskType ? { task_type: taskType } : {}),
          process_automation_rules: stageAutomationRules,
          process_target_module_ids: stageTargetModuleIds,
          process_links: stageProcessLinkMap,
          [PROCESS_TASK_CUSTOM_FIELDS_KEY]: resolvedStageCustomFields,
          [PROCESS_TASK_STATUS_OPTIONS_KEY]: stageCustomStatusOptions,
          [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: stageCustomFieldValues,
        };
        if (activeProcessGroupMeta?.id) {
          payload.recurrence_info = {
            ...(payload.recurrence_info || {}),
            process_group: {
              id: activeProcessGroupMeta.id,
              name: activeProcessGroupMeta.label || null,
              template_id: activeProcessGroupMeta.templateId || null,
              template_name: activeProcessGroupMeta.templateName || null,
            },
          };
        }
      }

      await insertTasksWithFallback([payload]);

      message.success(isProcessModule ? 'فعالیت جدید اضافه شد' : 'مرحله جدید اضافه شد');
      if (draftToCreate && isProcessRecordModule) {
        const nextDrafts = removeSingleMatchingDraftStage(
          Array.isArray(draftLocal) ? draftLocal : [],
          draftToCreate
        );
        await saveDraftStages(nextDrafts);
      }
      setIsTaskModalOpen(false);
      taskForm.resetFields();
      setTaskCustomFieldDrafts((prev) => {
        const next = { ...prev };
        delete next[TASK_MODAL_CUSTOM_FIELD_DRAFT_ID];
        return next;
      });
      setActiveLineId(null);
      setActiveProcessGroupMeta(null);
      setDraftToCreate(null);
      await fetchTasks();
    } catch (error: any) {
      const debugText = String(error?.message || error?.details || error?.hint || '').trim();
      console.error('Task quick-create failed', error);
      message.error(
        debugText
          ? `خطا در ثبت ${isProcessModule ? 'فعالیت' : 'مرحله'}: ${debugText}`
          : toFaErrorMessage(error, 'خطا در ثبت اطلاعات')
      );
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    const currentTask = tasks.find((item: any) => String(item?.id) === String(taskId)) || null;
    try {
      setTasks((prev) => prev.map((item: any) => (
        String(item?.id) === String(taskId)
          ? withProcessTaskCustomFieldValues({ ...item, status: newStatus })
          : item
      )));
      const updatedTask = await updateTaskStatusWithAutomation({
        taskId,
        nextStatus: newStatus,
        previousTask: currentTask,
        currentUser: {
          id: currentUser.id,
          fullName: currentUser.fullName,
        },
      });
      setTasks((prev) => prev.map((item: any) => (
        String(item?.id) === String(taskId)
          ? withProcessTaskCustomFieldValues({ ...item, ...updatedTask })
          : item
      )));
      message.success('وضعیت بروزرسانی شد');
      const nextTasks = await fetchTasks();
      await maybeOpenHandoverByStatus(taskId, newStatus, nextTasks);
    } catch (err: any) {
      if (currentTask) {
        setTasks((prev) => prev.map((item: any) => (
          String(item?.id) === String(taskId)
            ? withProcessTaskCustomFieldValues({ ...item, ...currentTask })
            : item
        )));
      }
      message.error(toFaErrorMessage(err, 'خطا در بروزرسانی وضعیت'));
    }
  };
  const handleTaskAssigneeChange = async (task: any, assigneeCombo?: string) => {
    if (!task?.id) return;
    try {
      const { assigneeType, assigneeId } = parseAssigneeComboValue(assigneeCombo);
      const currentAssigneeType = task?.assignee_type ? String(task.assignee_type) : null;
      const currentAssigneeId = task?.assignee_role_id
        ? String(task.assignee_role_id)
        : (task?.assignee_id ? String(task.assignee_id) : null);
      if (assigneeType === currentAssigneeType && String(assigneeId || '') === String(currentAssigneeId || '')) return;
      await updateTaskWithFallback(String(task.id), {
        assignee_id: assigneeType === 'user' ? assigneeId : null,
        assignee_role_id: assigneeType === 'role' ? assigneeId : null,
        assignee_type: assigneeType,
      });
      setTasks((prev) => prev.map((row: any) => (
        String(row?.id) === String(task.id)
          ? withProcessTaskCustomFieldValues({
              ...row,
              assignee_id: assigneeType === 'user' ? assigneeId : null,
              assignee_role_id: assigneeType === 'role' ? assigneeId : null,
              assignee_type: assigneeType,
            })
          : row
      )));
      message.success('مسئول بروزرسانی شد');
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'بروزرسانی مسئول ناموفق بود'));
    }
  };
  const handleSaveTaskReport = async (task: any) => {
    if (!task?.id) return;
    const taskId = String(task.id);
    const reportText = String((taskReportDrafts[taskId] ?? getTaskOptionalFieldFallback(task).taskReport) || '').trim();
    try {
      setSavingReportIds((prev) => ({ ...prev, [taskId]: true }));
      const nextRecurrence = {
        ...parseRecurrenceInfo(task?.recurrence_info),
        task_report: reportText || null,
      };
      await updateTaskWithFallback(taskId, {
        task_report: reportText || null,
        recurrence_info: nextRecurrence,
      });
      setTasks((prev) => prev.map((row: any) => (
        String(row?.id) === taskId
          ? withProcessTaskCustomFieldValues({ ...row, task_report: reportText || null, recurrence_info: nextRecurrence })
          : row
      )));
      message.success('گزارش فعالیت ثبت شد');
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'ثبت گزارش فعالیت ناموفق بود'));
    } finally {
      setSavingReportIds((prev) => ({ ...prev, [taskId]: false }));
    }
  };

  const updateTaskCustomFieldDraft = useCallback((taskId: string, fieldKey: string, value: any) => {
    setTaskCustomFieldDrafts((prev) => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] || {}),
        [fieldKey]: value,
      },
    }));
  }, []);

  const handleSaveTaskCustomFields = useCallback(async (task: any) => {
    if (!task?.id) return;
    const taskId = String(task.id);
    const recurrence = parseRecurrenceInfo(task?.recurrence_info);
    const fields = getProcessTaskCustomFieldsFromRecurrence(recurrence);
    if (fields.length === 0) return;

    const currentValues = mergeProcessTaskCustomFieldValues(
      fields,
      getProcessTaskCustomFieldValuesFromRecurrence(recurrence)
    );
    const nextValues = {
      ...currentValues,
      ...(taskCustomFieldDrafts[taskId] || {}),
    };
    const nextRecurrence = {
      ...recurrence,
      [PROCESS_TASK_CUSTOM_FIELDS_KEY]: fields,
      [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: nextValues,
    };

    try {
      setSavingTaskCustomFields((prev) => ({ ...prev, [taskId]: true }));
      await updateTaskWithFallback(taskId, {
        recurrence_info: nextRecurrence,
      });
      setTasks((prev) => prev.map((row: any) => (
        String(row?.id) === taskId
          ? withProcessTaskCustomFieldValues({ ...row, recurrence_info: nextRecurrence })
          : row
      )));
      setTaskCustomFieldDrafts((prev) => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
      message.success('فیلدهای اختصاصی فعالیت ذخیره شد');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ذخیره فیلدهای اختصاصی ناموفق بود'));
    } finally {
      setSavingTaskCustomFields((prev) => ({ ...prev, [taskId]: false }));
    }
  }, [parseRecurrenceInfo, taskCustomFieldDrafts, updateTaskWithFallback]);

  const handleProducedQtyChange = async (taskId: string, value: number | null) => {
    try {
      const nextProducedQty = Math.max(0, toNumber(value));
      const { error } = await supabase
        .from('tasks')
        .update({ produced_qty: nextProducedQty })
        .eq('id', taskId);
      if (error) throw error;
      setTasks((prev) => prev.map((item: any) => (
        String(item?.id) === String(taskId)
          ? withProcessTaskCustomFieldValues({ ...item, produced_qty: nextProducedQty })
          : item
      )));
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در ثبت مقدار تولید شده'));
    }
  };
  const handleTaskMainImageChange = useCallback(async (task: any, url: string | null) => {
    if (!task?.id) return;
    const taskId = String(task.id);
    try {
      await updateTaskWithFallback(taskId, { image_url: url }, { previousTask: task, runAutomation: false });
      setTasks((prev) => prev.map((item: any) => (
        String(item?.id) === taskId
          ? withProcessTaskCustomFieldValues({ ...item, image_url: url })
          : item
      )));
      message.success('تصویر اصلی فعالیت بروزرسانی شد');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'بروزرسانی تصویر اصلی فعالیت ناموفق بود'));
    }
  }, [updateTaskWithFallback]);
  const handleTaskImageUpload = useCallback(async (task: any, file: File) => {
    if (!task?.id) return false;
    const taskId = String(task.id);
    try {
      const ext = String(file.name.split('.').pop() || '').trim();
      const baseName = String(file.name || 'image').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${baseName}${ext && !baseName.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? `.${ext}` : ''}`;
      const filePath = `record_files/tasks/${taskId}/${fileName}`;
      await uploadFileWithProgress({
        client: fileStorageClient,
        bucket: FILE_STORAGE_BUCKET,
        path: filePath,
        file,
        label: file.name || 'تصویر',
        detail: 'تصویر اصلی فعالیت',
      });
      const { data: urlData } = fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(filePath);
      const imageUrl = String(urlData?.publicUrl || '').trim();
      if (!imageUrl) throw new Error('TASK_IMAGE_URL_MISSING');
      await updateTaskWithFallback(taskId, { image_url: imageUrl }, { previousTask: task, runAutomation: false });
      const { error: fileInsertError } = await supabase
        .from('record_files')
        .insert([{
          module_id: 'tasks',
          record_id: taskId,
          file_url: imageUrl,
          file_type: 'image',
          file_name: file.name || null,
          mime_type: file.type || null,
          sort_order: 0,
        }]);
      if (fileInsertError) {
        console.warn('Could not append uploaded task image to record_files', fileInsertError);
      }
      setTasks((prev) => prev.map((item: any) => (
        String(item?.id) === taskId
          ? withProcessTaskCustomFieldValues({ ...item, image_url: imageUrl })
          : item
      )));
      message.success('تصویر فعالیت بروزرسانی شد');
    } catch (error: any) {
      if (isUploadCanceledError(error)) return false;
      message.error(toFaErrorMessage(error, 'آپلود تصویر فعالیت ناموفق بود'));
    }
    return false;
  }, [updateTaskWithFallback]);
  const handleUnlinkTaskFromProcess = useCallback(async (task: any) => {
    if (!task?.id) return;
    const taskId = String(task.id);
    try {
      const recurrence = parseRecurrenceInfo(task?.recurrence_info);
      const nextRecurrence = { ...recurrence };
      delete nextRecurrence.process_group;
      delete nextRecurrence.process_links;
      const nextSourcePatch = buildTaskSourcePatch({
        related_to_module: null,
        source_module_id: null,
        source_record_id: null,
      });
      await updateTaskWithFallback(taskId, {
        ...nextSourcePatch,
        source_template_id: null,
        process_group_id: null,
        recurrence_info: nextRecurrence,
      });
      setTasks((prev) => prev.map((row: any) => (
        String(row?.id) === taskId
          ? withProcessTaskCustomFieldValues({
              ...row,
              ...nextSourcePatch,
              source_template_id: null,
              process_group_id: null,
              recurrence_info: nextRecurrence,
            })
          : row
      )));
      closeTaskQuickModal(false);
      message.success('اتصال وظیفه از فرآیند و رکورد قطع شد');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'قطع اتصال وظیفه ناموفق بود'));
    }
  }, [closeTaskQuickModal, parseRecurrenceInfo, updateTaskWithFallback]);
  const handleDeleteTaskCompletely = useCallback(async (task: any) => {
    if (!task?.id) return;
    const taskId = String(task.id);
    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);
      if (error) throw error;
      setTasks((prev) => prev.filter((row: any) => String(row?.id) !== taskId));
      closeTaskQuickModal(false);
      message.success('وظیفه حذف شد');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'حذف وظیفه ناموفق بود'));
    }
  }, [closeTaskQuickModal]);

  const getStatusColor = (status: string, task?: any) => getTaskStatusSwatchColor(status, task);

  const processLegendHelpContent = useMemo(() => (
    <div className="space-y-3 text-xs leading-6 text-gray-600 dark:text-gray-300">
      <div className="space-y-2">
        <div className="font-semibold text-[rgba(var(--brand-800-rgb),1)]">راهنمای نوار مراحل</div>
        <div className="flex items-center gap-2">
          <div className="flex h-8 min-w-[88px] items-center justify-center rounded-lg border border-dashed border-gray-300 bg-transparent px-2 text-[11px] font-medium text-gray-600">
            مرحله نمونه
          </div>
          <span>حالت پیش‌نویس</span>
        </div>
      </div>
      <div className="space-y-2">
        {[
          { color: '#ef4444', label: 'انجام نشده' },
          { color: '#3b82f6', label: 'در حال انجام' },
          { color: '#f97316', label: 'بازبینی' },
          { color: '#10b981', label: 'تکمیل شده' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div
              className="h-8 min-w-[88px] rounded-lg"
              style={{ backgroundColor: item.color }}
            />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div
          className="h-8 min-w-[88px] rounded-lg"
          style={{
            backgroundColor: '#3b82f6',
            boxShadow: '0 0 8px #3b82f666, 0 0 16px #3b82f64d, 0 0 24px #3b82f633',
          }}
        />
        <span>مرحله‌ای که glow دارد، مربوط به کاربر واردشده است.</span>
      </div>
    </div>
  ), []);

  const getAssigneeLabel = (task: any) => {
    if (task.assignee_role_id && task.assigned_role) {
      return `تیم ${task.assigned_role.title}`;
    }
    if (task.assignee_id && task.assignee) {
      return task.assignee.full_name || task.assignee.email || task.assignee.mobile_1 || 'تعیین نشده';
    }
    return 'تعیین نشده';
  };

  const getDraftAssigneeLabel = useCallback((stage: any) => {
    const roleId = stage?.default_assignee_role_id ? String(stage.default_assignee_role_id) : null;
    const userId = stage?.default_assignee_id ? String(stage.default_assignee_id) : null;
    if (roleId) {
      const role = assignees.roles.find((item: any) => String(item?.id) === roleId);
      return role?.title || 'تعیین نشده';
    }
    if (userId) {
      const user = assignees.users.find((item: any) => String(item?.id) === userId);
      return user?.display_name || user?.full_name || user?.email || user?.mobile_1 || 'تعیین نشده';
    }
    return 'تعیین نشده';
  }, [assignees.roles, assignees.users]);

  const formatDraftDuration = useCallback((stage: any) => {
    const durationValue = Number(stage?.duration_value || 0);
    const durationUnit = String(stage?.duration_unit || 'day') === 'hour' ? 'ساعت' : 'روز';
    const durationFrom = String(stage?.duration_from || 'project_start') === 'previous_stage_end'
      ? 'اتمام مرحله قبلی'
      : 'شروع پروژه';
    if (!durationValue) return `از ${durationFrom}`;
    return `${toPersianNumber(durationValue)} ${durationUnit} بعد از ${durationFrom}`;
  }, []);

  const isTaskAssignedToCurrentUser = useCallback((task: any) => {
    if (!task || !currentUser.id) return false;
    const assigneeType = String(task?.assignee_type || '');
    const assigneeUserId = task?.assignee_id ? String(task.assignee_id) : null;
    const assigneeRoleId = task?.assignee_role_id ? String(task.assignee_role_id) : (assigneeType === 'role' && assigneeUserId ? assigneeUserId : null);
    if ((assigneeType === 'role' || task?.assignee_role_id) && currentUser.roleId) {
      return Boolean(assigneeRoleId && String(assigneeRoleId) === String(currentUser.roleId));
    }
    return Boolean(assigneeUserId && String(assigneeUserId) === String(currentUser.id));
  }, [currentUser.id, currentUser.roleId]);

  const getTaskStageProgress = useCallback((task: any) => {
    const taskId = String(task?.id || '').trim();
    if (!taskId) return null as { index: number; total: number } | null;

    const lineId = task?.production_line_id ? String(task.production_line_id) : null;
    const chain = lineId
      ? getLineTaskChain(lineId)
      : (isProcessModule
        ? getLineTaskChain(processLineId)
        : tasks.slice().sort((a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0)));

    if (!Array.isArray(chain) || chain.length === 0) return null;
    const index = chain.findIndex((row: any) => String(row?.id || '') === taskId);
    if (index < 0) return null;
    return { index: index + 1, total: chain.length };
  }, [getLineTaskChain, isProcessModule, processLineId, tasks]);

  const renderDate = (dateVal: any) => {
    if (!dateVal) return null;
    try {
      const jsDate = new Date(dateVal);
      if (Number.isNaN(jsDate.getTime())) return null;
      const formatted = new DateObject({
        date: jsDate,
        calendar: gregorian,
        locale: gregorian_en,
      })
        .convert(persian, persian_fa)
        .format('YYYY/MM/DD HH:mm');
      return formatted ? toPersianNumber(formatted) : null;
    } catch {
      return null;
    }
  };

  const handoverSummaryRows = useMemo<StageHandoverSummaryRow[]>(() => {
    if (!handoverContext) return [];
    const productMeta = new Map<string, { name: string; code: string; unit: string }>();
    (handoverContext.groups || []).forEach((group) => {
      const productId = group?.selectedProductId ? String(group.selectedProductId) : '';
      if (!productId) return;
      const firstPiece = Array.isArray(group?.pieces) && group.pieces.length > 0 ? group.pieces[0] : null;
      if (!productMeta.has(productId)) {
        productMeta.set(productId, {
          name: String(group?.selectedProductName || '-'),
          code: String(group?.selectedProductCode || ''),
          unit: String(firstPiece?.mainUnit || ''),
        });
      }
    });

    const deliveredTotals: Record<string, number> = {};
    handoverForms.forEach((form) => {
      const totals = toGroupTotals((form?.groups || []) as any);
      Object.entries(totals).forEach(([productId, qty]) => {
        deliveredTotals[productId] = (deliveredTotals[productId] || 0) + toNumber(qty);
      });
    });

    const allProductIds = new Set<string>([
      ...Object.keys(handoverContext.sourceTotalsByProduct || {}),
      ...Object.keys(handoverContext.orderTotalsByProduct || {}),
      ...Object.keys(deliveredTotals || {}),
    ]);

    return Array.from(allProductIds).map((productId) => {
      const meta = productMeta.get(productId) || { name: '-', code: '', unit: '' };
      return {
        productId,
        productName: meta.name,
        productCode: meta.code,
        unit: meta.unit,
        sourceQty: toNumber(handoverContext.sourceTotalsByProduct?.[productId]),
        orderQty: toNumber(handoverContext.orderTotalsByProduct?.[productId]),
        deliveredQty: toNumber(deliveredTotals?.[productId]),
      };
    });
  }, [handoverContext, handoverForms, toGroupTotals, toNumber]);

  const handoverFormRows = useMemo<StageHandoverFormListRow[]>(() => {
    return handoverForms.map((form, index) => ({
      id: String(form.id),
      title: `فرم ${toPersianNumber(index + 1)}`,
      createdAt: form.createdAt || null,
      updatedAt: form.updatedAt || null,
      giverConfirmed: !!form.giverConfirmation?.confirmed,
      receiverConfirmed: !!form.receiverConfirmation?.confirmed,
    }));
  }, [handoverForms]);

  const getProcessTaskFieldOptions = useCallback((field: ModuleField) => {
    if (field.dynamicOptionsCategory) {
      return taskCustomFieldDynamicOptions[field.dynamicOptionsCategory] || [];
    }
    if (field.type === FieldType.SELECT || field.type === FieldType.STATUS) {
      return (field.options || []).map((option) => ({
        label: String(option?.label ?? option?.value ?? '').trim(),
        value: String(option?.value ?? ''),
      }));
    }
    if (field.type === FieldType.RELATION || field.type === FieldType.USER) {
      return taskCustomFieldRelationOptions[field.key] || [];
    }
    return (field.options || []).map((option) => ({
      label: String(option?.label ?? option?.value ?? '').trim(),
      value: String(option?.value ?? ''),
    }));
  }, [taskCustomFieldDynamicOptions, taskCustomFieldRelationOptions]);

  const renderTaskCustomFieldInput = useCallback((task: any, field: ModuleField, value: any) => {
    const taskId = String(task?.id || '');
    const disabled = !!savingTaskCustomFields[taskId];
    const onValueChange = (nextValue: any) => updateTaskCustomFieldDraft(taskId, String(field.key), nextValue);
    const options = getProcessTaskFieldOptions(field);

    if (field.dynamicOptionsCategory) {
      return (
        <DynamicSelectField
          value={value}
          onChange={(nextValue) => onValueChange(nextValue)}
          options={options}
          category={field.dynamicOptionsCategory}
          mode={
            field.type === FieldType.MULTI_SELECT
              ? 'multiple'
              : field.type === FieldType.TAGS
                ? 'tags'
                : undefined
          }
          disabled={disabled}
          className="w-full"
          allowClear
          showSearch
          getPopupContainer={(node) => node?.parentElement || document.body}
          onOptionsUpdate={() => { void loadTaskCustomFieldOptions([field]); }}
          protectedValues={field.dynamicOptionsCategory === 'task_type' ? getTaskTypeProtectedValues() : undefined}
        />
      );
    }

    if (field.type === FieldType.LONG_TEXT || field.type === FieldType.SUPER_LONG_TEXT) {
      return (
        <Input.TextArea
          value={value}
          autoSize={{ minRows: 2, maxRows: 4 }}
          disabled={disabled}
          onChange={(event) => onValueChange(event.target.value)}
        />
      );
    }

    if (
      field.type === FieldType.NUMBER
      || field.type === FieldType.PRICE
      || field.type === FieldType.PERCENTAGE
      || field.type === FieldType.STOCK
    ) {
      return (
        <InputNumber
          className="w-full persian-number"
          value={value}
          disabled={disabled}
          onChange={(nextValue) => onValueChange(nextValue)}
        />
      );
    }

    if (field.type === FieldType.CHECKBOX) {
      return (
        <Switch
          checked={!!value}
          disabled={disabled}
          onChange={(checked) => onValueChange(checked)}
        />
      );
    }

    if (field.type === FieldType.DATE) {
      return (
        <PersianDatePicker
          type="DATE"
          value={value}
          disabled={disabled}
          onChange={(nextValue) => onValueChange(nextValue)}
          className="w-full"
          zIndex={12620}
        />
      );
    }

    if (field.type === FieldType.TIME) {
      return (
        <PersianDatePicker
          type="TIME"
          value={value}
          disabled={disabled}
          onChange={(nextValue) => onValueChange(nextValue)}
          className="w-full"
          zIndex={12620}
        />
      );
    }

    if (field.type === FieldType.DATETIME) {
      return (
        <PersianDatePicker
          type="DATETIME"
          value={value}
          disabled={disabled}
          onChange={(nextValue) => onValueChange(nextValue)}
          className="w-full"
          zIndex={12620}
        />
      );
    }

    if (field.type === FieldType.MULTI_SELECT) {
      return (
        <Select
          mode="multiple"
          value={Array.isArray(value) ? value : []}
          disabled={disabled}
          options={options}
          className="w-full"
          optionFilterProp="label"
          showSearch
          maxTagCount="responsive"
          getPopupContainer={(node) => node?.parentElement || document.body}
          onChange={(nextValue) => onValueChange(nextValue)}
        />
      );
    }

    if (field.type === FieldType.TAGS) {
      return (
        <Select
          mode="tags"
          value={Array.isArray(value) ? value : []}
          disabled={disabled}
          options={options}
          className="w-full"
          tokenSeparators={[',']}
          maxTagCount="responsive"
          getPopupContainer={(node) => node?.parentElement || document.body}
          onChange={(nextValue) => onValueChange(nextValue)}
        />
      );
    }

    if (
      field.type === FieldType.SELECT
      || field.type === FieldType.STATUS
      || field.type === FieldType.RELATION
      || field.type === FieldType.USER
    ) {
      return (
        <Select
          allowClear
          value={value ?? undefined}
          disabled={disabled}
          options={options}
          className="w-full"
          showSearch
          optionFilterProp="label"
          getPopupContainer={(node) => node?.parentElement || document.body}
          onChange={(nextValue) => onValueChange(nextValue)}
        />
      );
    }

    return (
      <Input
        value={value ?? ''}
        disabled={disabled}
        className="w-full"
        onChange={(event) => onValueChange(event.target.value)}
      />
    );
  }, [getProcessTaskFieldOptions, loadTaskCustomFieldOptions, savingTaskCustomFields, updateTaskCustomFieldDraft]);

  const filteredStageTemplateVariableOptions = useMemo(() => {
    const needle = String(draftTemplatePickerSearch || '').trim().toLowerCase();
    if (!needle) return stageTemplateVariableOptions;
    return stageTemplateVariableOptions.filter((item) => (
      String(item?.label || '').toLowerCase().includes(needle)
      || String(item?.token || '').toLowerCase().includes(needle)
      || String(item?.key || '').toLowerCase().includes(needle)
    ));
  }, [draftTemplatePickerSearch, stageTemplateVariableOptions]);

  const renderDraftTemplatePicker = useCallback((targetKey: string) => (
    <Popover
      trigger="click"
      placement="bottomRight"
      open={draftTemplatePickerOpenKey === targetKey}
      onOpenChange={(open) => {
        setDraftTemplatePickerOpenKey(open ? targetKey : null);
        if (!open) setDraftTemplatePickerSearch('');
      }}
      content={(
        <div
          className="w-[min(88vw,24rem)] space-y-2 select-text"
          onClick={(event) => event.stopPropagation()}
        >
          <Input
            value={draftTemplatePickerSearch}
            onChange={(event) => setDraftTemplatePickerSearch(event.target.value)}
            allowClear
            size="small"
            placeholder="جستجو در متغیرها"
          />
          <div
            className="space-y-1 pr-1"
            style={{ maxHeight: '18rem', overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
            onWheelCapture={(event) => event.stopPropagation()}
            onTouchMove={(event) => event.stopPropagation()}
          >
          {filteredStageTemplateVariableOptions.length === 0 ? (
            <div className="px-2 py-3 text-xs text-gray-500">متغیری در دسترس نیست.</div>
          ) : filteredStageTemplateVariableOptions.map((item) => (
            <button
              key={`${targetKey}-${item.key}`}
              type="button"
              className="w-full rounded-lg border border-transparent px-2 py-2 text-right transition-colors hover:border-[rgba(var(--brand-200-rgb),0.75)] hover:bg-[rgba(var(--brand-50-rgb),0.55)] select-text"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleDraftTemplateTokenPick(targetKey, item.token)}
            >
              <div className="text-xs font-semibold text-gray-800 dark:text-gray-100">{item.label}</div>
              <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400" dir="ltr">{item.token}</div>
            </button>
          ))}
          </div>
        </div>
      )}
    >
      <Button
        type="text"
        size="small"
        icon={<CopyOutlined />}
        className="!text-gray-500 hover:!text-[rgba(var(--brand-700-rgb),1)]"
        onMouseDown={(event) => event.preventDefault()}
      />
    </Popover>
  ), [draftTemplatePickerOpenKey, draftTemplatePickerSearch, filteredStageTemplateVariableOptions, handleDraftTemplateTokenPick]);

  const renderPopupContent = (task: any) => {
    const canEditTaskStatus = !readOnly || isTaskAssignedToCurrentUser(task);
    const isTaskCreator = Boolean(currentUser.id && String(task?.created_by || '') === String(currentUser.id));
    const canEditTaskByRolePermissions = rolePermissions?.tasks?.edit !== false;
    const canEditTaskAssignee = isTaskCreator || canEditTaskByRolePermissions;
    const canManageTaskFiles = filesAccess.canEditRecordFilesManager && canEditTaskByRolePermissions;
    const canDeleteTaskFiles = filesAccess.canDeleteRecordFilesManager && canEditTaskByRolePermissions;
    const currentAssigneeCombo = task?.assignee_role_id
      ? `role:${String(task.assignee_role_id)}`
      : (task?.assignee_id ? `user:${String(task.assignee_id)}` : undefined);
    const fallback = getTaskOptionalFieldFallback(task);
    const customFields = getTaskCustomFields(task);
    const currentCustomFieldValues = getTaskCustomFieldValues(task);
    const taskCustomFieldDraft = taskCustomFieldDrafts[String(task?.id || '')] || {};
    const taskTypeValue = String(task?.task_type || fallback.taskType || '').trim() || undefined;
    const reportDraft = taskReportDrafts[String(task.id)] ?? fallback.taskReport;
    const hasWage = task?.wage !== undefined && task?.wage !== null && Number(task.wage) !== 0;
    const hasWeight = task?.weight !== undefined && task?.weight !== null && Number(task.weight) !== 0;
    const taskStatusValue = String(task?.status || '').trim();
    const taskStatusOptions = getTaskStatusOptions(task);
    const taskStatusLabel = getTaskStatusLabel(taskStatusValue, task, taskStatusOptions) || null;
    const taskStatusTagColor = getTaskStatusColor(taskStatusValue, task, taskStatusOptions);
    const stageProgress = getTaskStageProgress(task);
    const recurrence = parseRecurrenceInfo(task?.recurrence_info);
    const processTemplateId = String(task?.process_template_id || recurrence?.process_source?.template_id || '').trim();
    const processTemplateName = String(
      recurrence?.process_source?.template_name
      || task?.source_template_name
      || (processTemplateId ? processTemplateNameMap[processTemplateId] : '')
      || ''
    ).trim();
    const relatedRows = TASK_RELATED_FIELD_DEFINITIONS
      .map((meta) => {
        const relatedId = String(task?.[meta.fieldKey] || '').trim();
        if (!relatedId) return null;
        if (!canViewModuleByPermissions(meta.moduleId)) return null;
        const titleKey = `${meta.moduleId}:${relatedId}`;
        const title = relatedRecordTitleMap[titleKey] || relatedId;
        return { label: meta.label, value: title };
      })
      .filter(Boolean) as Array<{ label: string; value: string }>;

    return (
      <div
        className="w-full max-w-full overflow-x-hidden overflow-y-auto font-['Vazirmatn']"
        style={{
          width: '100%',
          maxWidth: 'calc(100vw - 1rem)',
          maxHeight: 'min(78vh, 42rem)',
          padding: '0.75rem',
        }}
      >
        <div className="mb-3 flex items-start justify-between border-b border-[rgba(var(--brand-200-rgb),0.45)] pb-2 dark:border-[rgba(var(--brand-300-rgb),0.18)]">
          <div className="space-y-2">
            <h4 className="m-0 text-sm font-bold text-[rgba(var(--brand-800-rgb),1)] dark:text-gray-100 line-clamp-2">{task.title || task.name}</h4>
            {(taskStatusLabel || taskTypeValue) ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {taskStatusLabel ? <Tag color={taskStatusTagColor}>{taskStatusLabel}</Tag> : null}
                {taskTypeValue ? <Tag>{taskTypeValue}</Tag> : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mb-3">
          <RecordImageBox
            moduleId="tasks"
            recordId={String(task?.id || '')}
            imageUrl={task?.image_url || null}
            canEdit={canManageTaskFiles}
            canViewFilesManager={filesAccess.canViewRecordFilesManager}
            canEditFilesManager={canManageTaskFiles}
            canDeleteFilesManager={canDeleteTaskFiles}
            onImageUpdate={(file) => handleTaskImageUpload(task, file)}
            onMainImageChange={(url) => { void handleTaskMainImageChange(task, url); }}
          />
        </div>

        <div className="space-y-3 mb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-gray-500">مسئول:</span>
            <Select
              size="small"
              value={currentAssigneeCombo}
              onChange={(val) => { void handleTaskAssigneeChange(task, val); }}
              className="w-full sm:w-44"
              disabled={!canEditTaskAssignee}
              allowClear
              showSearch
              optionFilterProp="label"
              getPopupContainer={(node) => node?.parentElement || document.body}
            >
              <Select.OptGroup label="کاربران">
                {assignees.users.map((u) => (
                  <Select.Option key={`popup-user-${u.id}`} value={`user:${u.id}`} label={u.display_name || u.full_name || u.email || u.mobile_1}>
                    <Space><UserOutlined /> {u.display_name || u.full_name || u.email || u.mobile_1}</Space>
                  </Select.Option>
                ))}
              </Select.OptGroup>
              <Select.OptGroup label="تیم‌ها">
                {assignees.roles.map((r) => (
                  <Select.Option key={`popup-role-${r.id}`} value={`role:${r.id}`} label={r.title}>
                    <Space><TeamOutlined /> {r.title}</Space>
                  </Select.Option>
                ))}
              </Select.OptGroup>
            </Select>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-gray-500">وضعیت:</span>
            <Select
              size="small"
              value={task.status}
              onChange={(val) => { void handleStatusChange(task.id, val); }}
              className="w-full sm:w-44"
              disabled={!canEditTaskStatus}
              getPopupContainer={(node) => node?.parentElement || document.body}
              options={taskStatusOptions.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
          </div>

          <div className="space-y-1">
            <span className="text-xs text-gray-500">نوع فعالیت:</span>
            <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-2 py-1 text-xs text-gray-700 dark:text-gray-200">
              {taskTypeValue || '-'}
            </div>
          </div>

          {isProductionOrder && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-gray-500">مقدار تولید شده:</span>
              <InputNumber
                size="small"
                min={0}
                className="w-full sm:w-44 persian-number"
                value={toNumber(task?.produced_qty)}
                disabled={readOnly || String(task?.status || '').toLowerCase() === 'todo' || String(task?.status || '').toLowerCase() === 'pending'}
                onChange={(val) => {
                  void handleProducedQtyChange(String(task.id), val);
                }}
              />
            </div>
          )}

          <div className="space-y-1">
            <span className="text-xs text-gray-500">شرح فعالیت:</span>
            <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-2 py-2 text-xs leading-6 text-gray-700 dark:text-gray-200 min-h-[54px] whitespace-pre-wrap break-words">
              {String(task?.description || '').trim() || '-'}
            </div>
          </div>

          {customFields.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500">فیلدهای اختصاصی این فعالیت:</span>
                {savingTaskCustomFields[String(task.id)] && <span className="text-[11px] text-gray-500">در حال ذخیره...</span>}
              </div>
              <div className="space-y-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/80 p-2">
                {customFields.map((field) => (
                  <div key={`${task.id}-${field.key}`} className="space-y-1">
                    <div className="text-[11px] text-gray-500">{field.labels?.fa || field.key}</div>
                    {renderTaskCustomFieldInput(
                      task,
                      field,
                      Object.prototype.hasOwnProperty.call(taskCustomFieldDraft, String(field.key))
                        ? taskCustomFieldDraft[String(field.key)]
                        : currentCustomFieldValues[String(field.key)]
                    )}
                  </div>
                ))}
                <div className="flex justify-end pt-1">
                  <Button
                    size="small"
                    icon={<SaveOutlined />}
                    loading={!!savingTaskCustomFields[String(task.id)]}
                    onClick={() => { void handleSaveTaskCustomFields(task); }}
                  >
                    ثبت فیلدها
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2 break-words rounded-lg border border-[rgba(var(--brand-200-rgb),0.45)] bg-[rgba(var(--brand-50-rgb),0.55)] p-2 text-xs text-gray-700 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-[#111827] dark:text-gray-300">
            <div className="flex items-center gap-2">
              <OrderedListOutlined className="text-[rgba(var(--brand-700-rgb),1)]" />
              <span>
                {stageProgress
                  ? `مرحله ${toPersianNumber(stageProgress.index)} از ${toPersianNumber(stageProgress.total)}`
                  : `مرحله ${toPersianNumber(task.sort_order || '-')}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {task.assignee_type === 'role' ? <TeamOutlined className="text-[rgba(var(--brand-700-rgb),1)]" /> : <UserOutlined className="text-[rgba(var(--brand-700-rgb),1)]" />}
              <span>مسئول: {getAssigneeLabel(task)}</span>
            </div>
            {processTemplateName ? (
              <div className="flex items-center gap-2">
                <SettingOutlined className="text-[rgba(var(--brand-700-rgb),1)]" />
                <span>الگوی فرآیند: {toPersianNumber(processTemplateName)}</span>
              </div>
            ) : null}
            {relatedRows.map((row) => (
              <div key={`${task.id}-${row.label}`} className="flex items-center gap-2">
                <LinkOutlined className="text-[rgba(var(--brand-700-rgb),1)]" />
                <span>{row.label}: {toPersianNumber(row.value)}</span>
              </div>
            ))}
            {hasWage && (
              <div className="flex items-center gap-2">
                <span className="text-[rgba(var(--brand-700-rgb),1)]">💰</span>
                <span>دستمزد: {toPersianNumber(Number(task.wage || 0).toLocaleString('en-US'))} تومان</span>
              </div>
            )}
            {hasWeight && (
              <div className="flex items-center gap-2">
                <span className="text-[rgba(var(--brand-700-rgb),1)]">وزن:</span>
                <span>{toPersianNumber(task.weight)}</span>
              </div>
            )}
            {task.due_date && (
              <div className="flex items-center gap-2">
                <ClockCircleOutlined className="text-[rgba(var(--brand-700-rgb),1)]" />
                <span>موعد: {renderDate(task.due_date)}</span>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <span className="text-xs text-gray-500">گزارش فعالیت:</span>
            <Input.TextArea
              value={reportDraft}
              placeholder="متن گزارش را بنویسید..."
              autoSize={{ minRows: 2, maxRows: 4 }}
              disabled={readOnly && !allowReportEditInReadOnly}
              onChange={(event) => {
                const taskId = String(task.id);
                const value = event.target.value;
                setTaskReportDrafts((prev) => ({ ...prev, [taskId]: value }));
              }}
            />
            <div className="flex items-center justify-between">
              <Checkbox
                disabled={(readOnly && !allowReportEditInReadOnly) || savingReportIds[String(task.id)]}
                onChange={(event) => {
                  if (!event.target.checked) return;
                  void handleSaveTaskReport(task);
                }}
              >
                ثبت گزارش
              </Checkbox>
              {savingReportIds[String(task.id)] && <span className="text-[11px] text-gray-500">در حال ثبت...</span>}
            </div>
          </div>
        </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(var(--brand-200-rgb),0.45)] pt-2 dark:border-[rgba(var(--brand-300-rgb),0.18)]">
            {supportsHandover ? (
              <Button
                size="small"
              type="link"
              className="px-0 text-xs text-[rgba(var(--brand-700-rgb),1)] hover:text-[rgba(var(--brand-600-rgb),1)]"
              onClick={() => {
                closeTaskQuickModal(false);
                void openTaskHandoverModal(task);
              }}
            >
              فرم‌های تحویل کالا
            </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center justify-end gap-1">
              <Tooltip title="قطع اتصال از این فرآیند و رکورد">
                <Button
                  size="small"
                  type="text"
                  icon={<LinkOutlined />}
                  className="text-gray-500 hover:!text-amber-600"
                  onClick={() => {
                    Modal.confirm({
                      title: 'قطع اتصال وظیفه',
                      content: 'این وظیفه فقط از این فرآیند و رکورد جدا می‌شود و خود فعالیت باقی می‌ماند. ادامه می‌دهید؟',
                      okText: 'قطع اتصال',
                      cancelText: 'انصراف',
                      onOk: async () => {
                        await handleUnlinkTaskFromProcess(task);
                      },
                    });
                  }}
                />
              </Tooltip>
              <Tooltip title="حذف کامل وظیفه">
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => {
                    Modal.confirm({
                      title: 'حذف کامل وظیفه',
                      content: 'این فعالیت به طور کامل حذف می‌شود. ادامه می‌دهید؟',
                      okText: 'حذف',
                      cancelText: 'انصراف',
                      okButtonProps: { danger: true },
                      onOk: async () => {
                        await handleDeleteTaskCompletely(task);
                      },
                    });
                  }}
                />
              </Tooltip>
              <Button
                size="small"
                type="link"
                icon={<ArrowRightOutlined />}
                className="text-xs text-[rgba(var(--brand-700-rgb),1)] hover:text-[rgba(var(--brand-600-rgb),1)]"
                onClick={() => openTaskProcessModal({ task })}
              >
                جزئیات کامل
              </Button>
            </div>
          </div>
        </div>
      );
  };

  const draftList = Array.isArray(draftLocal) ? draftLocal : [];
  const totalWage = lines.reduce((sum, line) => {
    const lineTasks = tasksByLine.get(String(line.id)) || [];
    const lineWage = lineTasks.reduce((acc, t) => acc + (parseFloat(t.wage) || 0), 0);
    const qty = parseFloat(line.quantity) || 0;
    return sum + (lineWage * qty);
  }, 0);
  const visibleLines = useMemo(() => {
    if (!onlyLineId) return lines;
    return lines.filter((line: any) => String(line?.id || '') === String(onlyLineId));
  }, [lines, onlyLineId]);

  const saveDraftStages = useCallback(async (nextStages: any[]) => {
    draftLocalRef.current = nextStages;
    setDraftLocal(nextStages);
    if (onDraftStagesChange) await onDraftStagesChange(nextStages);
    if (moduleId === 'production_boms' && recordId) {
      await supabase.from('production_boms').update({ production_stages_draft: nextStages }).eq('id', recordId);
    }
  }, [moduleId, onDraftStagesChange, recordId]);

  const loadProcessTemplateOptions = useCallback(async () => {
    if (!moduleId || !isProcessRecordModule) {
      setProcessTemplateOptions([]);
      return;
    }
    try {
      setProcessTemplateOptionsLoading(true);
      const targetModule = String(moduleId);
      let rows: any[] = [];

      const primary = await supabase
        .from('process_templates')
        .select('id,name,module_id,module_ids,is_active')
        .order('name', { ascending: true });
      if (!primary.error) {
        rows = primary.data || [];
      } else {
        const fallback = await supabase
          .from('process_templates')
          .select('id,name,module_id,module_ids')
          .order('name', { ascending: true });
        if (fallback.error) throw fallback.error;
        rows = fallback.data || [];
      }

      const activeRows = rows.filter((row: any) => row?.is_active !== false);
      const sourceRows = activeRows.filter((row: any) => doesProcessTemplateSupportModule(row, targetModule));

      setProcessTemplateOptions(
        sourceRows
          .filter((row: any) => row?.id)
          .map((row: any) => ({
            value: String(row.id),
            label: String(row?.name || row?.id),
          }))
      );
    } catch (err) {
      console.warn('Could not load process template options', err);
      setProcessTemplateOptions([]);
    } finally {
      setProcessTemplateOptionsLoading(false);
    }
  }, [isProcessRecordModule, moduleId]);

  useEffect(() => {
    if (!isProcessRecordModule || readOnly) return;
    void loadProcessTemplateOptions();
  }, [isProcessRecordModule, loadProcessTemplateOptions, readOnly]);

  const handleOpenAppendProcessModal = useCallback(async (
    mode: 'append' | 'links' = 'append',
    group?: { id?: string | null; templateId?: string | null; stages?: any[] }
  ) => {
    if (!isProcessRecordModule || readOnly) return;
    const normalizedTemplateId = String(group?.templateId || '').trim() || null;
    const stageSeed = Array.isArray(group?.stages) ? group?.stages : [];
    const seededTargetModuleIds = normalizeProcessTargetModuleIds(
      stageSeed.flatMap((stage: any) => Array.isArray(stage?.process_target_module_ids) ? stage.process_target_module_ids : []),
      moduleId
    );
    const seededLinks = stageSeed.reduce<Record<string, string | null>>((acc, stage: any) => {
      const rawMap = stage?.process_link_map && typeof stage.process_link_map === 'object'
        ? stage.process_link_map
        : {};
      Object.entries(rawMap).forEach(([targetModuleId, linkedRecordId]) => {
        const normalizedTargetModuleId = String(targetModuleId || '').trim();
        const normalizedRecordId = String(linkedRecordId || '').trim();
        if (normalizedTargetModuleId && normalizedRecordId && !acc[normalizedTargetModuleId]) {
          acc[normalizedTargetModuleId] = normalizedRecordId;
        }
      });
      return acc;
    }, {});
    setAppendProcessModalMode(mode);
    setAppendProcessModalGroupId(mode === 'links' ? (String(group?.id || '').trim() || null) : null);
    setAppendProcessTemplateId(null);
    setAppendProcessTargetModuleIds([]);
    setAppendProcessLinkedRecords({});
    setAppendProcessRelationOptions({});
    setAppendProcessRelationLoading({});
    setAppendProcessModalOpen(true);
    await loadProcessTemplateOptions();
    if (mode === 'links') {
      setAppendProcessTemplateId(normalizedTemplateId);
      setAppendProcessTargetModuleIds(seededTargetModuleIds);
      setAppendProcessLinkedRecords(seededLinks);
    }
  }, [isProcessRecordModule, loadProcessTemplateOptions, moduleId, readOnly]);

  const loadAppendProcessRelationOptions = useCallback(async (targetModuleId: string, exactId?: string | null) => {
    const normalizedTargetModuleId = String(targetModuleId || '').trim();
    if (!normalizedTargetModuleId || !MODULES[normalizedTargetModuleId]) return;
    setAppendProcessRelationLoading((prev) => ({ ...prev, [normalizedTargetModuleId]: true }));
    try {
      const nextOptions = await fetchRelationOptionsForField(
        supabase,
        {
          key: 'process_link_record_id',
          type: FieldType.RELATION,
          relationConfig: { targetModule: normalizedTargetModuleId },
        } as any,
        {
          exactId: exactId || null,
          limit: 200,
        }
      );
      setAppendProcessRelationOptions((prev) => ({
        ...prev,
        [normalizedTargetModuleId]: nextOptions,
      }));
    } catch (error) {
      console.warn('Could not load process link options', normalizedTargetModuleId, error);
    } finally {
      setAppendProcessRelationLoading((prev) => ({ ...prev, [normalizedTargetModuleId]: false }));
    }
  }, []);

  const resolveKnownProcessLinks = useCallback(async (targetModuleIds: string[]) => {
    const normalizedTargetModuleIds = normalizeProcessTargetModuleIds(targetModuleIds, moduleId);
    const directContextLinks = mergeProcessLinkMaps(
      recordId && moduleId ? { [moduleId]: String(recordId) } : {},
    );
    if (!recordId || !moduleId || normalizedTargetModuleIds.length === 0) {
      return directContextLinks;
    }

    try {
      const { data: sourceRecord, error } = await supabase
        .from(MODULES[moduleId]?.table || moduleId)
        .select('*')
        .eq('id', recordId)
        .maybeSingle();
      if (error) throw error;

      return mergeProcessLinkMaps(
        directContextLinks,
        getRelationFieldLinksForModules(moduleId, sourceRecord || null, normalizedTargetModuleIds),
      );
    } catch (error) {
      console.warn('Could not infer process links from current record', error);
      return directContextLinks;
    }
  }, [moduleId, recordId]);

  const hasObjectKeys = (value: Record<string, any> | null | undefined) =>
    Object.keys(value || {}).length > 0;

  const areStringArraysEqual = (left: string[], right: string[]) =>
    left.length === right.length && left.every((value, index) => value === right[index]);

  const areProcessLinkMapsEqual = (
    left: Record<string, string | null>,
    right: Record<string, string | null>,
  ) => {
    const leftKeys = Object.keys(left || {});
    const rightKeys = Object.keys(right || {});
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key) => (left[key] ?? null) === (right[key] ?? null));
  };

  useEffect(() => {
    if ((!appendProcessTemplateId && appendProcessModalMode === 'append') || !appendProcessModalOpen) {
      setAppendProcessTargetModuleIds((prev) => (prev.length > 0 ? [] : prev));
      if (appendProcessModalMode !== 'links') {
        setAppendProcessLinkedRecords((prev) => (hasObjectKeys(prev) ? {} : prev));
      }
      setAppendProcessRelationOptions((prev) => (hasObjectKeys(prev) ? {} : prev));
      setAppendProcessRelationLoading((prev) => (hasObjectKeys(prev) ? {} : prev));
      return;
    }

    let cancelled = false;
    const loadTemplateContext = async () => {
      try {
        const { data, error } = await supabase
          .from('process_templates')
          .select('id, module_id, module_ids')
          .eq('id', appendProcessTemplateId)
          .maybeSingle();
        if (error) throw error;

        const syncedTemplate = syncProcessTemplateTargetModules((data || {}) as Record<string, any>);
        const targetModuleIds = normalizeProcessTargetModuleIds(
          syncedTemplate.module_ids,
          syncedTemplate.module_id
        );
        if (cancelled) return;
        setAppendProcessTargetModuleIds((prev) => (
          areStringArraysEqual(prev, targetModuleIds) ? prev : targetModuleIds
        ));

        const knownLinks = appendProcessModalMode === 'links'
          ? (appendProcessLinkedRecords || {})
          : (await resolveKnownProcessLinks(targetModuleIds) || {});
        if (cancelled) return;
        setAppendProcessLinkedRecords((prev) => (
          areProcessLinkMapsEqual(prev, knownLinks) ? prev : knownLinks
        ));

        await Promise.all(
          targetModuleIds.map((targetModuleId) =>
            loadAppendProcessRelationOptions(targetModuleId, knownLinks[targetModuleId] || null)
          )
        );
      } catch (error) {
        console.warn('Could not load selected process template targets', error);
        if (!cancelled) {
          setAppendProcessTargetModuleIds((prev) => (prev.length > 0 ? [] : prev));
          if (appendProcessModalMode !== 'links') {
            setAppendProcessLinkedRecords((prev) => (hasObjectKeys(prev) ? {} : prev));
          }
        }
      }
    };

    void loadTemplateContext();
    return () => {
      cancelled = true;
    };
  }, [
    appendProcessLinkedRecords,
    appendProcessModalMode,
    appendProcessModalOpen,
    appendProcessTemplateId,
    loadAppendProcessRelationOptions,
    moduleId,
    recordId,
    resolveKnownProcessLinks,
  ]);

  useEffect(() => {
    if (!isProcessRecordModule || readOnly || !recordId || !moduleId || typeof window === 'undefined') return;
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ moduleId?: string; recordId?: string }>;
      const targetModuleId = String(customEvent?.detail?.moduleId || '');
      const targetRecordId = String(customEvent?.detail?.recordId || '');
      if (targetModuleId !== String(moduleId) || targetRecordId !== String(recordId)) return;
      setShowEmptyProcessDetails(true);
      void handleOpenAppendProcessModal();
    };
    window.addEventListener('kalamapp:open-process-append', handler as EventListener);
    return () => {
      window.removeEventListener('kalamapp:open-process-append', handler as EventListener);
    };
  }, [handleOpenAppendProcessModal, isProcessRecordModule, moduleId, readOnly, recordId]);

  const handleAppendProcessTemplate = useCallback(async () => {
    if (!appendProcessTemplateId) {
      message.warning('الگوی فرآیند را انتخاب کنید');
      return;
    }
    try {
      setLoading(true);
      const selectedTemplate = processTemplateOptions.find((opt) => String(opt.value) === String(appendProcessTemplateId));
      const { data: stages, error } = await supabase
        .from('process_template_stages')
        .select('id, stage_name, sort_order, wage, default_assignee_id, default_assignee_role_id, metadata')
        .eq('template_id', appendProcessTemplateId)
        .order('sort_order', { ascending: true });
      if (error) throw error;

      const incomingStages = Array.isArray(stages) ? stages : [];
      if (incomingStages.length === 0) {
        message.info('این الگو مرحله‌ای برای افزودن ندارد');
        return;
      }

      const existing = Array.isArray(draftLocal) ? [...draftLocal] : [];
      const maxSortOrder = existing.reduce((maxValue: number, stage: any) => {
        const n = Number(stage?.sort_order || 0);
        return n > maxValue ? n : maxValue;
      }, 0);
      let cursor = maxSortOrder > 0 ? maxSortOrder + 10 : ((existing.length + 1) * 10);
      const nextGroupId = buildProcessGroupId();
      const existingGroupCount = new Set(
        existing
          .map((stage: any) => String(stage?.process_group_id || stage?.source_template_id || '').trim())
          .filter(Boolean)
      ).size;
      const fallbackGroupName = `فرآیند ${toPersianNumber(
        existingGroupCount + 1
      )}`;
      const nextGroupName = String(selectedTemplate?.label || fallbackGroupName).trim() || fallbackGroupName;

      const appendedStages = incomingStages.map((stage: any, index: number) => {
        const metadata = stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {};
        const stageName = String(stage?.stage_name || `مرحله ${index + 1}`).trim() || `مرحله ${index + 1}`;

        const row = {
          id: `draft_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
          name: stageName,
          description: String(metadata?.description || '').trim() || null,
          task_type: String(metadata?.task_type || '').trim() || null,
          automation_rules: normalizeProcessAutomationRules(metadata?.automation_rules),
          process_task_custom_fields: normalizeProcessTaskCustomFields(metadata?.[PROCESS_TASK_CUSTOM_FIELDS_KEY]),
          process_task_status_options: normalizeProcessTaskStatusOptions(metadata?.[PROCESS_TASK_STATUS_OPTIONS_KEY]),
          sort_order: cursor,
          wage: Number(stage?.wage || 0),
          weight: Number(metadata?.weight || 0),
          default_assignee_id: stage?.default_assignee_id || null,
          default_assignee_role_id: stage?.default_assignee_role_id || null,
          duration_value: Number(metadata?.duration_value || 0),
          duration_unit: String(metadata?.duration_unit || 'day') === 'hour' ? 'hour' : 'day',
          duration_from: String(metadata?.duration_from || 'project_start') === 'previous_stage_end'
            ? 'previous_stage_end'
            : 'project_start',
          source_template_id: appendProcessTemplateId,
          source_template_name: selectedTemplate?.label || null,
          process_group_id: nextGroupId,
          process_group_name: nextGroupName,
          process_target_module_ids: appendProcessTargetModuleIds,
          process_link_map: appendProcessLinkedRecords,
        };
        cursor += 10;
        return row;
      });

      const nextStages = [...existing, ...appendedStages].sort(
        (a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0)
      );
      await saveDraftStages(nextStages);
      setAppendProcessModalOpen(false);
      setAppendProcessTemplateId(null);
      message.success(`${toPersianNumber(appendedStages.length)} مرحله در نوار فرآیند جدید اضافه شد`);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'افزودن فرآیند دیگر ناموفق بود'));
    } finally {
      setLoading(false);
    }
  }, [
    appendProcessLinkedRecords,
    appendProcessTargetModuleIds,
    appendProcessTemplateId,
    buildProcessGroupId,
    draftLocal,
    processTemplateOptions,
    saveDraftStages,
  ]);

  const handleSaveProcessLinksToGroup = useCallback(async () => {
    const normalizedGroupId = String(appendProcessModalGroupId || '').trim();
    if (!normalizedGroupId) {
      setAppendProcessModalOpen(false);
      return;
    }
    try {
      setLoading(true);
      const nextStages = (Array.isArray(draftLocal) ? draftLocal : []).map((stage: any) => {
        const stageGroupId = String(stage?.process_group_id || stage?.source_template_id || 'default_process_group').trim() || 'default_process_group';
        if (stageGroupId !== normalizedGroupId) return stage;
        return {
          ...stage,
          process_target_module_ids: appendProcessTargetModuleIds,
          process_link_map: appendProcessLinkedRecords,
        };
      });
      await saveDraftStages(nextStages);
      setAppendProcessModalOpen(false);
      message.success('رکوردهای مرتبط این فرآیند بروزرسانی شد');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ذخیره رکوردهای مرتبط فرآیند ناموفق بود'));
    } finally {
      setLoading(false);
    }
  }, [
    appendProcessLinkedRecords,
    appendProcessModalGroupId,
    appendProcessTargetModuleIds,
    draftLocal,
    saveDraftStages,
  ]);

  const handleCreateRawProcessGroup = useCallback(async () => {
    if (!isProcessRecordModule) return;
    try {
      setLoading(true);
      const existing = Array.isArray(draftLocal) ? [...draftLocal] : [];
      const maxSortOrder = existing.reduce((maxValue: number, stage: any) => {
        const n = Number(stage?.sort_order || 0);
        return n > maxValue ? n : maxValue;
      }, 0);
      const nextGroupId = buildProcessGroupId();
      const existingGroupCount = new Set(
        existing
          .map((stage: any) => String(stage?.process_group_id || stage?.source_template_id || '').trim())
          .filter(Boolean)
      ).size;
      const nextGroupName = `فرآیند ${toPersianNumber(existingGroupCount + 1)}`;
      const nextStages = [
        ...existing,
        {
          id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: 'مرحله 1',
          description: null,
          task_type: null,
          automation_rules: [],
          sort_order: maxSortOrder > 0 ? maxSortOrder + 10 : ((existing.length + 1) * 10),
          wage: 0,
          weight: 0,
          default_assignee_id: null,
          default_assignee_role_id: null,
          duration_value: 0,
          duration_unit: 'day',
          duration_from: 'project_start',
          source_template_id: null,
          source_template_name: null,
          process_group_id: nextGroupId,
          process_group_name: nextGroupName,
        },
      ];
      await saveDraftStages(nextStages);
      setShowEmptyProcessDetails(true);
      setAppendProcessModalOpen(false);
      setAppendProcessTemplateId(null);
      message.success('فرآیند خام ایجاد شد');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ایجاد فرآیند خام ناموفق بود'));
    } finally {
      setLoading(false);
    }
  }, [buildProcessGroupId, draftLocal, isProcessRecordModule, saveDraftStages]);

  const handleApplyTemplateToGroup = useCallback(async (groupId: string, templateId: string) => {
    const normalizedGroupId = String(groupId || '').trim();
    const normalizedTemplateId = String(templateId || '').trim();
    if (!normalizedGroupId || !normalizedTemplateId) return;
    try {
      setLoading(true);
      const selectedTemplate = processTemplateOptions.find((opt) => String(opt.value) === normalizedTemplateId);
      const { data: stages, error } = await supabase
        .from('process_template_stages')
        .select('id, stage_name, sort_order, wage, default_assignee_id, default_assignee_role_id, metadata')
        .eq('template_id', normalizedTemplateId)
        .order('sort_order', { ascending: true });
      if (error) throw error;

      const incomingStages = Array.isArray(stages) ? stages : [];
      if (incomingStages.length === 0) {
        message.info('این الگو مرحله‌ای برای افزودن ندارد');
        return;
      }

      const existing = Array.isArray(draftLocal) ? [...draftLocal] : [];
      const isCurrentGroupStage = (stage: any) => {
        const stageGroupId = String(stage?.process_group_id || stage?.source_template_id || 'default_process_group').trim() || 'default_process_group';
        return stageGroupId === normalizedGroupId;
      };
      const currentGroupStages = existing.filter(isCurrentGroupStage);
      const otherStages = existing.filter((stage: any) => !isCurrentGroupStage(stage));

      const currentGroupMinSort = currentGroupStages.reduce((minValue: number, stage: any) => {
        const current = Number(stage?.sort_order || 0);
        if (!Number.isFinite(current) || current <= 0) return minValue;
        return current < minValue ? current : minValue;
      }, Number.POSITIVE_INFINITY);
      const maxSortOrder = otherStages.reduce((maxValue: number, stage: any) => {
        const n = Number(stage?.sort_order || 0);
        return n > maxValue ? n : maxValue;
      }, 0);
      let cursor = Number.isFinite(currentGroupMinSort)
        ? currentGroupMinSort
        : (maxSortOrder > 0 ? maxSortOrder + 10 : ((existing.length + 1) * 10));

      const fallbackGroupName = String(currentGroupStages[0]?.process_group_name || currentGroupStages[0]?.source_template_name || '').trim();
      const nextGroupName = String(selectedTemplate?.label || fallbackGroupName || `فرآیند ${toPersianNumber(1)}`).trim();
      const replacedStages = incomingStages.map((stage: any, index: number) => {
        const metadata = stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {};
        const stageName = String(stage?.stage_name || `مرحله ${index + 1}`).trim() || `مرحله ${index + 1}`;
        const row = {
          id: `draft_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
          name: stageName,
          description: String(metadata?.description || '').trim() || null,
          task_type: String(metadata?.task_type || '').trim() || null,
          automation_rules: normalizeProcessAutomationRules(metadata?.automation_rules),
          process_task_custom_fields: normalizeProcessTaskCustomFields(metadata?.[PROCESS_TASK_CUSTOM_FIELDS_KEY]),
          process_task_status_options: normalizeProcessTaskStatusOptions(metadata?.[PROCESS_TASK_STATUS_OPTIONS_KEY]),
          sort_order: cursor,
          wage: Number(stage?.wage || 0),
          weight: Number(metadata?.weight || 0),
          default_assignee_id: stage?.default_assignee_id || null,
          default_assignee_role_id: stage?.default_assignee_role_id || null,
          duration_value: Number(metadata?.duration_value || 0),
          duration_unit: String(metadata?.duration_unit || 'day') === 'hour' ? 'hour' : 'day',
          duration_from: String(metadata?.duration_from || 'project_start') === 'previous_stage_end'
            ? 'previous_stage_end'
            : 'project_start',
          source_template_id: normalizedTemplateId,
          source_template_name: selectedTemplate?.label || null,
          process_group_id: normalizedGroupId,
          process_group_name: nextGroupName,
        };
        cursor += 10;
        return row;
      });

      const nextStages = [...otherStages, ...replacedStages].sort(
        (a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0)
      );
      await saveDraftStages(nextStages);
      message.success('الگوی فرآیند این ردیف بروزرسانی شد');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'بروزرسانی الگوی فرآیند ناموفق بود'));
    } finally {
      setLoading(false);
    }
  }, [draftLocal, processTemplateOptions, saveDraftStages]);

  const handleCopyProcessGroup = useCallback(async (groupId: string) => {
    const normalizedGroupId = String(groupId || '').trim();
    if (!normalizedGroupId) return;
    try {
      setLoading(true);
      const existing = Array.isArray(draftLocal) ? [...draftLocal] : [];
      const sourceStages = existing
        .filter((stage: any) => getStageProcessGroupMeta(stage).groupId === normalizedGroupId)
        .sort((a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
      if (!sourceStages.length) {
        message.info('مرحله‌ای برای کپی وجود ندارد');
        return;
      }
      const maxSortOrder = existing.reduce((maxValue: number, stage: any) => {
        const n = Number(stage?.sort_order || 0);
        return n > maxValue ? n : maxValue;
      }, 0);
      const nextGroupId = buildProcessGroupId();
      const firstMeta = getStageProcessGroupMeta(sourceStages[0]);
      const baseName = String(firstMeta.groupLabel || firstMeta.templateName || 'فرآیند').trim() || 'فرآیند';
      const nextGroupName = `${baseName} (کپی)`;
      let cursor = maxSortOrder > 0 ? maxSortOrder + 10 : ((existing.length + 1) * 10);
      const copiedStages = sourceStages.map((stage: any, index: number) => {
        const next = {
          ...stage,
          id: `draft_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
          sort_order: cursor,
          process_group_id: nextGroupId,
          process_group_name: nextGroupName,
        };
        cursor += 10;
        return next;
      });
      const nextStages = [...existing, ...copiedStages].sort(
        (a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0)
      );
      await saveDraftStages(nextStages);
      message.success('کپی فرآیند انجام شد');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'کپی فرآیند ناموفق بود'));
    } finally {
      setLoading(false);
    }
  }, [buildProcessGroupId, draftLocal, getStageProcessGroupMeta, saveDraftStages]);

  const getConnectedTaskCountForProcessGroup = useCallback((groupId: string) => {
    const normalizedGroupId = String(groupId || '').trim();
    if (!normalizedGroupId) return 0;
    return tasks.filter((task: any) => String(getTaskProcessGroupMeta(task).groupId || '').trim() === normalizedGroupId).length;
  }, [getTaskProcessGroupMeta, tasks]);
  const handleDeleteProcessGroup = useCallback(async (groupId: string) => {
    const normalizedGroupId = String(groupId || '').trim();
    if (!normalizedGroupId) return;
    const connectedTaskCount = getConnectedTaskCountForProcessGroup(normalizedGroupId);
    if (connectedTaskCount > 0) {
      message.warning('فرآیندی که به فعالیت متصل است قابل حذف نیست');
      return;
    }
    try {
      setLoading(true);
      const existing = Array.isArray(draftLocal) ? [...draftLocal] : [];
      const nextStages = existing.filter((stage: any) => getStageProcessGroupMeta(stage).groupId !== normalizedGroupId);
      if (nextStages.length === existing.length) return;
      await saveDraftStages(nextStages);
      message.success('فرآیند حذف شد');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'حذف فرآیند ناموفق بود'));
    } finally {
      setLoading(false);
    }
  }, [draftLocal, getConnectedTaskCountForProcessGroup, getStageProcessGroupMeta, saveDraftStages]);

  const parseStageAssignee = useCallback((stage: any) => {
    const defaultRoleId = stage?.default_assignee_role_id ? String(stage.default_assignee_role_id) : null;
    const defaultUserId = stage?.default_assignee_id ? String(stage.default_assignee_id) : null;
    if (defaultRoleId) {
      return { assigneeType: 'role', assigneeId: defaultRoleId };
    }
    if (defaultUserId) {
      return { assigneeType: 'user', assigneeId: defaultUserId };
    }
    return { assigneeType: null, assigneeId: null };
  }, []);

  const getProcessBaseDate = useCallback(async () => {
    if (!recordId || !moduleId) return new Date();
    const startFieldByModule: Record<string, string | null> = {
      projects: 'start_date',
      invoices: 'invoice_date',
      purchase_invoices: 'invoice_date',
      customers: null,
      marketing_leads: null,
    };
    const startField = startFieldByModule[String(moduleId)] ?? null;
    const selectExpr = startField ? `${startField},created_at` : 'created_at';
    const { data: recordRow } = await supabase
      .from(String(moduleId))
      .select(selectExpr)
      .eq('id', recordId)
      .maybeSingle();
    const recordData: any = (recordRow && typeof recordRow === 'object') ? recordRow : {};
    const startRaw = startField ? recordData?.[startField] : null;
    const baseValue = startRaw || recordData?.created_at || new Date().toISOString();
    const parsed = new Date(baseValue);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [moduleId, recordId]);

  const computeStageDueAt = useCallback((
    stage: any,
    baseDate: Date,
    previousDueAt: Date | null
  ) => {
    const rawValue = Number(stage?.duration_value ?? stage?.lead_time_value ?? 0);
    const durationValue = Number.isFinite(rawValue) ? Math.max(0, rawValue) : 0;
    const durationUnit = String(stage?.duration_unit || stage?.lead_time_unit || 'day') === 'hour' ? 'hour' : 'day';
    const durationFrom = String(stage?.duration_from || stage?.due_anchor || 'project_start') === 'previous_stage_end'
      ? 'previous_stage_end'
      : 'project_start';
    const anchorDate = (durationFrom === 'previous_stage_end' && previousDueAt)
      ? previousDueAt
      : baseDate;
    if (durationValue <= 0) {
      return previousDueAt && durationFrom === 'previous_stage_end' ? previousDueAt : null;
    }
    const offsetMs = durationUnit === 'hour'
      ? durationValue * 60 * 60 * 1000
      : durationValue * 24 * 60 * 60 * 1000;
    const dueAt = new Date(anchorDate.getTime() + offsetMs);
    return Number.isNaN(dueAt.getTime()) ? null : dueAt;
  }, []);

  const handleAutoAssignProcess = useCallback(async (targetGroupId?: string | null) => {
    if (!isProcessRecordModule || !recordId || !moduleId) return;
    const normalizedTargetGroupId = String(targetGroupId || '').trim();
    const stageRows = (Array.isArray(draftLocal) ? draftLocal : [])
      .filter((stage: any) => {
        const hasName = String(stage?.name || stage?.title || '').trim() !== '';
        if (!hasName) return false;
        if (!normalizedTargetGroupId) return true;
        return getStageProcessGroupMeta(stage).groupId === normalizedTargetGroupId;
      })
      .sort((a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
    if (!stageRows.length) {
      message.warning('مرحله‌ای برای ارجاع وجود ندارد');
      return;
    }
    try {
      setLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || null;
      const baseDate = await getProcessBaseDate();
      const dueByStageKey = new Map<string, string | null>();
      let previousDueAt: Date | null = null;
      stageRows.forEach((stage: any) => {
        const normalizedName = normalizeStageName(stage?.name || stage?.title);
        if (!normalizedName) return;
        const { groupId } = getStageProcessGroupMeta(stage);
        const dueAt = computeStageDueAt(stage, baseDate, previousDueAt);
        if (dueAt) previousDueAt = dueAt;
        dueByStageKey.set(
          buildProcessStageTaskKey(groupId, normalizedName, stage?.sort_order),
          dueAt ? dueAt.toISOString() : null
        );
      });

      const existingByStageKey = new Set(
        (Array.isArray(tasks) ? tasks : [])
          .filter((task: any) => processTaskModules.has(String(task?.related_to_module || '')))
          .map((task: any) => {
            const taskMeta = getTaskProcessGroupMeta(task);
            return buildProcessStageTaskKey(
              taskMeta.groupId || 'default_process_group',
              task?.name || task?.title || '',
              task?.sort_order
            );
          })
          .filter(Boolean)
      );

      const payload: any[] = [];
      let previousResolvedTask: any = null;
      const creatableStages = stageRows
        .filter((stage: any) => {
          const stageName = String(stage?.name || stage?.title || '').trim();
          const stageMeta = getStageProcessGroupMeta(stage);
          const stageKey = buildProcessStageTaskKey(stageMeta.groupId, stageName, stage?.sort_order);
          if (!stageName || existingByStageKey.has(stageKey)) return false;
          existingByStageKey.add(stageKey);
          return true;
        })
        .sort((a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));

      for (const [index, stage] of creatableStages.entries()) {
        const stageName = String(stage?.name || stage?.title || `مرحله ${index + 1}`).trim();
        const normalized = normalizeStageName(stageName);
        const stageMeta = getStageProcessGroupMeta(stage);
        const assignee = parseStageAssignee(stage);
        const recurrenceBase = stage?.recurrence_info && typeof stage.recurrence_info === 'object'
          ? stage.recurrence_info
          : {};
        const stageTaskType = String(stage?.task_type || '').trim() || null;
        const stageDescription = String(stage?.description || '').trim() || null;
        const stageAutomationRules = normalizeProcessAutomationRules(stage?.automation_rules);
        const stageCustomFields = getProcessTaskCustomFieldsFromStage(stage);
        const stageCustomStatusOptions = getProcessTaskStatusOptionsFromStage(stage);
        const dueDate = dueByStageKey.get(buildProcessStageTaskKey(stageMeta.groupId, normalized, stage?.sort_order)) || null;
        const processLinkMap = recurrenceBase?.process_links && typeof recurrenceBase.process_links === 'object'
          ? recurrenceBase.process_links
          : {};
        const templateContext = await buildTaskTemplateContextRecord({
          taskName: stageName,
          taskType: stageTaskType,
          dueDate,
          processLinkMap,
          previousTask: previousResolvedTask,
        });
        const resolvedStageName = String(
          renderTemplateValueFromRecord(stageName, templateContext, FieldType.TEXT) ?? stageName
        ).trim() || stageName;
        const resolvedStageDescription = String(
          renderTemplateValueFromRecord(stageDescription, {
            ...templateContext,
            task_name: resolvedStageName,
          }, FieldType.LONG_TEXT) ?? stageDescription ?? ''
        ).trim() || null;
        const resolvedStageCustomFields = stageCustomFields.map((field) => ({
          ...field,
          defaultValue: renderTemplateValueFromRecord(
            field?.defaultValue,
            {
              ...templateContext,
              task_name: resolvedStageName,
              description: resolvedStageDescription || '',
            },
            field.type
          ),
        }));
        const stageCustomFieldValues = mergeProcessTaskCustomFieldValues(resolvedStageCustomFields, {});
        const taskRow: any = {
          name: resolvedStageName,
          status: 'todo',
          source_template_id: stageMeta.templateId,
          source_stage_sort_order: Number(stage?.sort_order || ((index + 1) * 10)),
          process_group_id: stageMeta.groupId,
          production_line_id: null,
          production_shelf_id: null,
          produced_qty: 0,
          description: resolvedStageDescription,
          task_type: stageTaskType,
          assignee_type: assignee.assigneeType,
          assignee_id: assignee.assigneeType === 'user' ? assignee.assigneeId : null,
          assignee_role_id: assignee.assigneeType === 'role' ? assignee.assigneeId : null,
          wage: Number(stage?.wage || 0),
          weight: Number(stage?.weight || 0),
          sort_order: Number(stage?.sort_order || ((index + 1) * 10)),
          due_date: dueDate,
          created_by: userId,
          recurrence_info: {
            ...recurrenceBase,
            ...(stageTaskType ? { task_type: stageTaskType } : {}),
            process_automation_rules: stageAutomationRules,
            [PROCESS_TASK_CUSTOM_FIELDS_KEY]: resolvedStageCustomFields,
            [PROCESS_TASK_STATUS_OPTIONS_KEY]: stageCustomStatusOptions,
            [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: stageCustomFieldValues,
            process_group: {
              id: stageMeta.groupId,
              name: stageMeta.groupLabel,
              template_id: stageMeta.templateId,
              template_name: stageMeta.templateName,
            },
          },
          ...buildTaskSourceInitialValues(moduleId, recordId),
        };
        previousResolvedTask = {
          ...taskRow,
          ...stageCustomFieldValues,
        };
        payload.push(taskRow);
      }

      if (!payload.length) {
        message.info('برای همه مراحل فعالیت ثبت شده است');
        return;
      }
      await insertTasksWithFallback(payload);
      await fetchTasks();
      message.success(`${toPersianNumber(payload.length)} فعالیت ایجاد شد`);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ارجاع خودکار فرآیند ناموفق بود'));
    } finally {
      setLoading(false);
    }
  }, [
    buildTaskTemplateContextRecord,
    buildProcessStageTaskKey,
    computeStageDueAt,
    draftLocal,
    fetchTasks,
    getStageProcessGroupMeta,
    getTaskProcessGroupMeta,
    getProcessBaseDate,
    insertTasksWithFallback,
    isProcessRecordModule,
    moduleId,
    normalizeStageName,
    parseStageAssignee,
    processTaskModules,
    recordId,
    tasks,
  ]);

  const getDraftStageEditorStatusOptions = useCallback(() =>
    normalizeProcessTaskStatusOptions(
      draftForm.getFieldValue('stage_status_options_editor') ?? draftStageStatusOptions
    ), [draftForm, draftStageStatusOptions]);

  const buildDraftStageFromEditorValues = useCallback((values: any, existingStage?: any | null) => {
    const existingMetadata = existingStage?.metadata && typeof existingStage.metadata === 'object' && !Array.isArray(existingStage.metadata)
      ? existingStage.metadata
      : {};
    const firstText = (...inputValues: any[]) =>
      inputValues.map((value) => String(value ?? '').trim()).find(Boolean) || '';
    const assigneeRaw = String(values?.default_assignee_combo || '');
    const assigneeType = assigneeRaw.startsWith('role:') ? 'role' : (assigneeRaw.startsWith('user:') ? 'user' : null);
    const assigneeId = assigneeType ? assigneeRaw.split(':')[1] : null;
    const hasDescriptionValue = Object.prototype.hasOwnProperty.call(values || {}, 'description');
    const hasTaskTypeValue = Object.prototype.hasOwnProperty.call(values || {}, 'task_type');
    const currentDraftCount = Array.isArray(draftLocalRef.current) ? draftLocalRef.current.length : draftLocal.length;
    const stageName = firstText(
      values?.name,
      existingStage?.name,
      existingStage?.stage_name,
      existingStage?.title
    ) || `مرحله ${currentDraftCount + 1}`;
    const stageDescription = String(
      hasDescriptionValue
        ? values?.description
        : (existingStage?.description ?? existingMetadata?.description ?? '')
    ).trim() || null;
    const stageTaskType = String(
      hasTaskTypeValue
        ? values?.task_type
        : (existingStage?.task_type ?? existingMetadata?.task_type ?? '')
    ).trim() || null;
    const stageStatusOptions = getDraftStageEditorStatusOptions();
    const processTaskCustomFields = normalizeProcessTaskCustomFields(draftCustomFields);
    const weight = Number(values?.weight || 0);
    const durationValue = Number(values?.duration_value || 0);
    const durationUnit = values?.duration_unit || 'day';
    const durationFrom = values?.duration_from || 'project_start';
    const automationRules = normalizeProcessAutomationRules(draftAutomationRules.map((rule) => ({
      ...rule,
      conditions_all: [
        ...(stageTaskType ? [{
          id: '__locked_stage_task_type__',
          field: '__task__task_type',
          operator: 'eq',
          value: stageTaskType,
        }] : []),
        ...((Array.isArray(rule?.conditions_all) ? rule.conditions_all : []).filter(
          (condition) => String(condition?.field || '').trim() !== '__task__task_type'
        )),
      ],
      conditions_any: (Array.isArray(rule?.conditions_any) ? rule.conditions_any : []).filter(
        (condition) => String(condition?.field || '').trim() !== '__task__task_type'
      ),
    })));
    return {
      ...(existingStage || {}),
      id: existingStage?.id || Date.now(),
      name: stageName,
      title: existingStage?.title || stageName,
      stage_name: existingStage?.stage_name || stageName,
      description: stageDescription,
      task_type: stageTaskType,
      sort_order: values.sort_order || existingStage?.sort_order || ((currentDraftCount + 1) * 10),
      wage: Number(values?.wage || 0),
      weight,
      default_assignee_id: assigneeType === 'user' ? assigneeId : null,
      default_assignee_role_id: assigneeType === 'role' ? assigneeId : null,
      duration_value: durationValue,
      duration_unit: durationUnit,
      duration_from: durationFrom,
      automation_rules: automationRules,
      process_task_custom_fields: processTaskCustomFields,
      process_task_status_options: stageStatusOptions,
      metadata: {
        ...existingMetadata,
        description: stageDescription,
        task_type: stageTaskType,
        automation_rules: automationRules,
        [PROCESS_TASK_CUSTOM_FIELDS_KEY]: processTaskCustomFields,
        [PROCESS_TASK_STATUS_OPTIONS_KEY]: stageStatusOptions,
        weight,
        duration_value: durationValue,
        duration_unit: durationUnit,
        duration_from: durationFrom,
      },
    };
  }, [draftAutomationRules, draftCustomFields, draftLocal.length, getDraftStageEditorStatusOptions]);

  const saveDraftStageFromEditor = useCallback(async (rawValues?: any) => {
    if (draftStageSavePromiseRef.current) {
      return draftStageSavePromiseRef.current;
    }

    const savePromise = (async () => {
      setIsSavingDraftStage(true);
      const values = {
        ...draftForm.getFieldsValue(true),
        ...(rawValues || {}),
      };
      const currentStages = Array.isArray(draftLocalRef.current) ? [...draftLocalRef.current] : [];
      const editorStageId = draftEditorStageIdRef.current ?? editingDraft?.id ?? null;
      const editorStageNames = new Set(
        [
          normalizeStageName(values?.name),
          normalizeStageName(editingDraft?.name || editingDraft?.stage_name || editingDraft?.title),
        ].filter(Boolean)
      );
      const editorSortOrders = new Set(
        [Number(values?.sort_order || 0), Number(editingDraft?.sort_order || 0)]
          .filter((value) => Number.isFinite(value) && value > 0)
      );
      const existingIndex = currentStages.findIndex((stage: any) => {
        const stageIds = [
          stage?.id,
          stage?.template_stage_id,
          stage?.process_run_stage_id,
        ].map((value) => String(value || '')).filter(Boolean);
        if (editorStageId && stageIds.includes(String(editorStageId))) return true;

        const stageSortOrder = Number(stage?.sort_order || 0);
        const stageName = normalizeStageName(stage?.name || stage?.stage_name || stage?.title);
        return stageSortOrder > 0
          && editorSortOrders.has(stageSortOrder)
          && editorStageNames.has(stageName);
      });
      const existingStage = existingIndex >= 0
        ? currentStages[existingIndex]
        : (editingDraft || null);
      const currentStage = existingStage ? normalizeDraftStageForEditor(existingStage, 0) : null;
      const nextStage = buildDraftStageFromEditorValues(values, currentStage);
      draftEditorStageIdRef.current = nextStage.id;

      let next = currentStages;
      const nextStageId = String(nextStage?.id || '');
      const currentEditorStageId = String(draftEditorStageIdRef.current || '');
      const targetIndex = next.findIndex((stage: any) => {
        const stageId = String(stage?.id || '');
        return !!stageId && (stageId === nextStageId || stageId === currentEditorStageId);
      });
      if (targetIndex >= 0) {
        next = next.map((stage: any, index: number) => (index === targetIndex ? nextStage : stage));
      } else {
        next = [...next, nextStage];
      }

      await saveDraftStages(next);
      const savedStages = Array.isArray(draftLocalRef.current) ? draftLocalRef.current : [];
      const savedStageName = normalizeStageName(nextStage?.name || nextStage?.stage_name || nextStage?.title);
      const savedStageSortOrder = Number(nextStage?.sort_order || 0);
      const persistedStage = savedStages.find((stage: any) => {
        const stageIds = [
          stage?.id,
          stage?.template_stage_id,
          stage?.process_run_stage_id,
        ].map((value) => String(value || '')).filter(Boolean);
        if (nextStage?.id && stageIds.includes(String(nextStage.id))) return true;
        return savedStageSortOrder > 0
          && Number(stage?.sort_order || 0) === savedStageSortOrder
          && normalizeStageName(stage?.name || stage?.stage_name || stage?.title) === savedStageName;
      });
      const editorStage = persistedStage ? normalizeDraftStageForEditor(persistedStage, 0) : nextStage;
      draftEditorStageIdRef.current = editorStage.id;
      setEditingDraft(editorStage);
      setDraftStageStatusOptions(normalizeProcessTaskStatusOptions(editorStage.process_task_status_options));
      return editorStage;
    })();

    draftStageSavePromiseRef.current = savePromise;
    try {
      return await savePromise;
    } finally {
      draftStageSavePromiseRef.current = null;
      setIsSavingDraftStage(false);
    }
  }, [buildDraftStageFromEditorValues, draftForm, editingDraft, normalizeDraftStageForEditor, normalizeStageName, saveDraftStages]);

  const validateDraftModalStep = useCallback(async (stepKey: DraftModalTabKey) => {
    if (stepKey === 'stage') {
      const fieldsToValidate = ['name'];
      if (isProcessModule) fieldsToValidate.push('task_type');
      await draftForm.validateFields(fieldsToValidate);
      return;
    }
    if (stepKey === 'fields') {
      await draftForm.validateFields(['stage_status_options_editor']);
    }
  }, [draftForm, isProcessModule]);

  const resetDraftStageEditorState = useCallback(() => {
    setEditingDraft(null);
    draftEditorStageIdRef.current = null;
    setDraftModalTabKey('stage');
    setDraftAutomationRules([]);
    setDraftCustomFields([]);
    setDraftStageStatusOptions([]);
    setDraftStageTaskTypeValue('');
    draftForm.resetFields();
  }, [draftForm]);

  const closeDraftStageModal = useCallback(() => {
    setIsDraftModalOpen(false);
    resetDraftStageEditorState();
  }, [resetDraftStageEditorState]);

  const handleAddDraftStage = async (values: any) => {
    await validateDraftModalStep('stage');
    await validateDraftModalStep('fields');
    await saveDraftStageFromEditor(values);
    if (draftModalStepIndex < DRAFT_MODAL_STEP_KEYS.length - 1) {
      const nextStepKey = DRAFT_MODAL_STEP_KEYS[draftModalStepIndex + 1];
      if (nextStepKey) {
        setDraftModalTabKey(nextStepKey);
      }
      return;
    }
    closeDraftStageModal();
  };

  const handleSaveDraftStageAndClose = useCallback(async () => {
    try {
      await validateDraftModalStep('stage');
      await validateDraftModalStep('fields');
      await saveDraftStageFromEditor();
      closeDraftStageModal();
    } catch {
      // Ant Form already marks invalid fields.
    }
  }, [closeDraftStageModal, saveDraftStageFromEditor, validateDraftModalStep]);

  const openDraftStageModal = useCallback((stage?: any | null, tab: DraftModalTabKey = 'stage') => {
    const nextEditingDraft = stage ? normalizeDraftStageForEditor(stage, 0) : null;
    draftEditorStageIdRef.current = nextEditingDraft?.id ?? null;
    setEditingDraft(nextEditingDraft);
    setDraftModalTabKey(tab);
    setIsDraftModalOpen(true);
  }, [normalizeDraftStageForEditor]);

  const loadDraftSourceTemplateOptions = useCallback(async () => {
    try {
      setDraftSourceTemplateLoading(true);
      const primary = await supabase
        .from('process_templates')
        .select('id,name,is_active')
        .order('name', { ascending: true });
      const rows = (primary.error ? [] : (primary.data || []))
        .filter((row: any) => row?.is_active !== false)
        .filter((row: any) => {
          const rowId = String(row?.id || '').trim();
          const currentId = String(recordId || '').trim();
          return !!rowId && rowId !== currentId;
        });
      setDraftSourceTemplateOptions(
        rows.map((row: any) => ({
          value: String(row.id),
          label: String(row?.name || row?.id),
        }))
      );
    } catch (error) {
      console.warn('Could not load process templates for draft stage copy', error);
      setDraftSourceTemplateOptions([]);
    } finally {
      setDraftSourceTemplateLoading(false);
    }
  }, [recordId]);

  const openDraftStageChooser = useCallback(() => {
    if (!isProcessTemplateModule) {
      openDraftStageModal(null, 'stage');
      return;
    }
    setDraftSourceTemplateId(null);
    setDraftSourceTemplateStages([]);
    setDraftStageChooserOpen(true);
    void loadDraftSourceTemplateOptions();
  }, [isProcessTemplateModule, loadDraftSourceTemplateOptions, openDraftStageModal]);

  const handleDraftSourceTemplateChange = useCallback(async (templateId?: string) => {
    const normalizedTemplateId = String(templateId || '').trim();
    setDraftSourceTemplateId(normalizedTemplateId || null);
    setDraftSourceTemplateStages([]);
    if (!normalizedTemplateId) return;
    try {
      setDraftSourceTemplateStagesLoading(true);
      const { data, error } = await supabase
        .from('process_template_stages')
        .select('id, stage_name, sort_order, wage, default_assignee_id, default_assignee_role_id, metadata')
        .eq('template_id', normalizedTemplateId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      setDraftSourceTemplateStages(Array.isArray(data) ? data : []);
    } catch (error) {
      console.warn('Could not load process template stages for copy', error);
      setDraftSourceTemplateStages([]);
    } finally {
      setDraftSourceTemplateStagesLoading(false);
    }
  }, []);

  const handleCopyDraftStageFromTemplate = useCallback((sourceStage: any) => {
    const normalized = normalizeDraftStageForEditor(sourceStage, draftLocal.length);
    const sourceStageName = String(normalized?.name || normalized?.stage_name || '').trim();
    const copiedStage = {
      ...normalized,
      id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      template_stage_id: null,
      source_template_stage_id: String(sourceStage?.id || '').trim() || null,
      name: sourceStageName || `مرحله ${draftLocal.length + 1}`,
      stage_name: sourceStageName || `مرحله ${draftLocal.length + 1}`,
      sort_order: Number(normalized?.sort_order || ((draftLocal.length + 1) * 10)),
    };
    setDraftStageChooserOpen(false);
    openDraftStageModal(copiedStage, 'stage');
  }, [draftLocal.length, normalizeDraftStageForEditor, openDraftStageModal]);

  const guardDraftAutomationConditionAdd = useCallback(() => {
    if (draftStageTaskType) return true;
    message.warning('ابتدا در "بخش مرحله الگوی فرآیند" نوع فعالیت را انتخاب کنید.');
    setDraftModalTabKey('stage');
    return false;
  }, [draftStageTaskType]);

  const goToDraftModalStep = useCallback(async (targetKey: DraftModalTabKey) => {
    if (targetKey === draftModalTabKey) return;
    const currentIndex = DRAFT_MODAL_STEP_KEYS.indexOf(draftModalTabKey);
    const targetIndex = DRAFT_MODAL_STEP_KEYS.indexOf(targetKey);
    if (targetIndex < 0 || currentIndex < 0) return;
    try {
      await validateDraftModalStep(draftModalTabKey);
      await saveDraftStageFromEditor();
    } catch {
      return;
    }
    setDraftModalTabKey(targetKey);
  }, [draftModalTabKey, saveDraftStageFromEditor, validateDraftModalStep]);

  const syncDraftStageStatusOptions = useCallback((nextOptions: SelectOption[]) => {
    const normalized = normalizeProcessTaskStatusOptions(nextOptions);
    setDraftStageStatusOptions(normalized);
    draftForm.setFieldValue(
      'stage_status_options_editor',
      normalized.map((option) => ({
        label: String(option?.label || ''),
        value: String(option?.value || ''),
        color: String(option?.color || '') || 'default',
        insertAfter: String(option?.insertAfter || '').trim() || undefined,
      }))
    );
  }, [draftForm]);

  const moveDraftStageStatusOption = useCallback((optionValue: string, direction: 'up' | 'down') => {
    const normalizedValue = String(optionValue || '').trim();
    if (!normalizedValue) return;
    const currentIndex = mergedDraftStageStatusOptions.findIndex(
      (option) => String(option?.value || '').trim() === normalizedValue
    );
    if (currentIndex < 0) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= mergedDraftStageStatusOptions.length) return;

    const reordered = [...mergedDraftStageStatusOptions];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    syncDraftStageStatusOptions(
      rebuildProcessTaskStatusOptionsByMergedOrder(
        reordered,
        draftStageStatusOptions,
        baseTaskStatusOptions
      )
    );
  }, [baseTaskStatusOptions, draftStageStatusOptions, mergedDraftStageStatusOptions, syncDraftStageStatusOptions]);

  const normalizeAutomationRuleForEditor = useCallback((rule: ProcessAutomationRule): ProcessAutomationRule => ({
    ...rule,
    execution_mode: (rule?.execution_mode || 'every_match') as WorkflowExecutionMode,
    interval_value: rule?.trigger_type === 'interval' ? (rule?.interval_value || 1) : null,
    interval_unit: rule?.trigger_type === 'interval' ? (rule?.interval_unit || 'day') : null,
    interval_at: rule?.trigger_type === 'interval' ? (rule?.interval_at || null) : null,
    batch_size: rule?.trigger_type === 'interval' ? (rule?.batch_size || null) : null,
    conditions_all: Array.isArray(rule?.conditions_all) ? rule.conditions_all : [],
    conditions_any: Array.isArray(rule?.conditions_any) ? rule.conditions_any : [],
  }), []);

  const addDraftAutomationRule = useCallback(() => {
    setDraftAutomationRules((prev) => [
      ...prev,
      normalizeAutomationRuleForEditor(createDefaultProcessAutomationRule()),
    ]);
  }, [normalizeAutomationRuleForEditor]);

  const updateDraftAutomationRule = useCallback((ruleId: string, patch: Partial<ProcessAutomationRule>) => {
    setDraftAutomationRules((prev) => prev.map((rule) => (
      String(rule.id) === String(ruleId)
        ? normalizeAutomationRuleForEditor({
            ...rule,
            ...patch,
            ...(patch.note_text !== undefined && patch.actions === undefined
              ? {
                  actions: [
                    {
                      id: String(rule?.actions?.[0]?.id || `proc_action_${ruleId}`),
                      type: (
                        (rule?.actions || []).find((action) => {
                          const actionType = String(action?.type || '').trim();
                          return actionType === 'send_note' || actionType === 'send_note_sms';
                        })?.type || 'send_note'
                      ) as WorkflowActionType,
                      config: {
                        ...(
                          (rule?.actions || []).find((action) => {
                            const actionType = String(action?.type || '').trim();
                            return actionType === 'send_note' || actionType === 'send_note_sms';
                          })?.config || {}
                        ),
                        note_text: String(patch.note_text || ''),
                      },
                    },
                  ],
                }
              : {}),
          } as ProcessAutomationRule)
        : rule
    )));
  }, [normalizeAutomationRuleForEditor]);

  const handleDraftAutomationTriggerChange = useCallback((rule: ProcessAutomationRule, triggerType: ProcessAutomationRule['trigger_type']) => {
    updateDraftAutomationRule(rule.id, {
      trigger_type: triggerType,
      interval_value: triggerType === 'interval' ? (rule?.interval_value || 1) : null,
      interval_unit: triggerType === 'interval' ? (rule?.interval_unit || 'day') : null,
      interval_at: triggerType === 'interval' ? (rule?.interval_at || null) : null,
      batch_size: triggerType === 'interval' ? (rule?.batch_size || null) : null,
    });
  }, [updateDraftAutomationRule]);

  const removeDraftAutomationRule = useCallback((ruleId: string) => {
    setDraftAutomationRules((prev) => prev.filter((rule) => String(rule.id) !== String(ruleId)));
  }, []);

  const openDraftCustomFieldModal = useCallback((field?: ModuleField | null) => {
    const nextField = field || null;
    setEditingDraftCustomFieldKey(nextField?.key ? String(nextField.key) : null);
    draftCustomFieldForm.setFieldsValue({
      key: nextField?.key || undefined,
      labelFa: nextField?.labels?.fa || '',
      type: nextField?.type || FieldType.TEXT,
      relationTargetModule: nextField?.relationConfig?.targetModule || undefined,
      relationTargetField: nextField?.relationConfig?.targetField || undefined,
      dynamicCategory: nextField?.dynamicOptionsCategory || undefined,
    });
    setIsDraftCustomFieldModalOpen(true);
  }, [draftCustomFieldForm]);

  const closeDraftCustomFieldModal = useCallback(() => {
    setIsDraftCustomFieldModalOpen(false);
    setEditingDraftCustomFieldKey(null);
    draftCustomFieldForm.resetFields();
  }, [draftCustomFieldForm]);

  const saveDraftCustomField = useCallback(async () => {
    try {
      const values = await draftCustomFieldForm.validateFields();
      const normalizedKey = normalizeProcessTaskCustomFieldKey(values?.key);
      if (!normalizedKey) {
        message.error('کلید فیلد معتبر نیست.');
        return;
      }
      if (isReservedProcessTaskCustomFieldKey(normalizedKey)) {
        message.error('این کلید برای فیلدهای عمومی فعالیت رزرو شده است.');
        return;
      }
      const duplicate = draftCustomFields.some((field) =>
        String(field?.key || '') === normalizedKey && String(field?.key || '') !== String(editingDraftCustomFieldKey || '')
      );
      if (duplicate) {
        message.error('کلید فیلد تکراری است.');
        return;
      }

      const fieldType = values?.type || FieldType.TEXT;
      if (!isSupportedProcessTaskCustomFieldType(fieldType)) {
        message.error('این نوع فیلد برای فعالیت‌های اختصاصی پشتیبانی نمی‌شود.');
        return;
      }

      const previousField = draftCustomFields.find((field) => String(field?.key || '') === String(editingDraftCustomFieldKey || '')) || null;
      const normalizedField = normalizeProcessTaskCustomFields([{
        key: normalizedKey,
        type: fieldType,
        labels: { fa: String(values?.labelFa || normalizedKey).trim() || normalizedKey, en: normalizedKey },
        relationConfig: fieldType === FieldType.RELATION
          ? {
              targetModule: String(values?.relationTargetModule || '').trim(),
              targetField: String(values?.relationTargetField || '').trim() || undefined,
            }
          : undefined,
        dynamicOptionsCategory: supportsProcessTaskDynamicCategory(fieldType)
          ? String(values?.dynamicCategory || '').trim() || undefined
          : undefined,
        options: processTaskOptionEditableTypes.has(fieldType) ? (previousField?.options || []) : undefined,
      }])[0];

      if (!normalizedField) {
        message.error('تعریف فیلد نامعتبر است.');
        return;
      }

      setDraftCustomFields((prev) => {
        const next = prev.filter((field) => String(field?.key || '') !== String(editingDraftCustomFieldKey || ''));
        return [...next, normalizedField].sort((a, b) => String(a.labels?.fa || a.key).localeCompare(String(b.labels?.fa || b.key), 'fa'));
      });
      closeDraftCustomFieldModal();
    } catch {
      // Ant validation handles this case.
    }
  }, [closeDraftCustomFieldModal, draftCustomFieldForm, draftCustomFields, editingDraftCustomFieldKey]);

  const removeDraftCustomField = useCallback((fieldKey: string) => {
    setDraftCustomFields((prev) => prev.filter((field) => String(field?.key || '') !== String(fieldKey || '')));
  }, []);

  const openDraftCustomFieldOptionsEditor = useCallback((field: ModuleField) => {
    setDraftCustomFieldOptionsEditorKey(String(field?.key || ''));
    draftCustomFieldOptionsForm.setFieldsValue({
      optionsText: serializeProcessTaskFieldOptions(field),
    });
  }, [draftCustomFieldOptionsForm]);

  const saveDraftCustomFieldOptions = useCallback(async () => {
    try {
      const values = await draftCustomFieldOptionsForm.validateFields();
      const nextOptions = parseProcessTaskFieldOptions(String(values?.optionsText || ''));
      setDraftCustomFields((prev) => prev.map((field) => (
        String(field?.key || '') === String(draftCustomFieldOptionsEditorKey || '')
          ? { ...field, options: nextOptions }
          : field
      )));
      setDraftCustomFieldOptionsEditorKey(null);
      draftCustomFieldOptionsForm.resetFields();
    } catch {
      // Ant validation handles this case.
    }
  }, [draftCustomFieldOptionsEditorKey, draftCustomFieldOptionsForm]);

  const handleRemoveDraftStage = async (stageToRemove: any) => {
    Modal.confirm({
      title: 'حذف مرحله پیش‌نویس',
      content: 'آیا از حذف این مرحله پیش‌نویس مطمئن هستید؟',
      okText: 'حذف',
      okType: 'danger',
      cancelText: 'انصراف',
      onOk: async () => {
        const next = removeSingleMatchingDraftStage(
          Array.isArray(draftLocal) ? draftLocal : [],
          stageToRemove
        );
        await saveDraftStages(next);
      },
    });
  };

  useEffect(() => {
    if (!isDraftModalOpen) return;
    if (editingDraft) {
      const draftForEditor = normalizeDraftStageForEditor(editingDraft, 0);
      const assigneeCombo = draftForEditor?.default_assignee_role_id
        ? `role:${String(draftForEditor.default_assignee_role_id)}`
        : (draftForEditor?.default_assignee_id ? `user:${String(draftForEditor.default_assignee_id)}` : undefined);
      draftForm.setFieldsValue({
        name: draftForEditor.name,
        description: draftForEditor.description || '',
        task_type: draftForEditor.task_type || undefined,
        sort_order: draftForEditor.sort_order,
        wage: draftForEditor.wage || 0,
        weight: draftForEditor.weight || 0,
        default_assignee_combo: assigneeCombo,
        duration_value: draftForEditor.duration_value || 0,
        duration_unit: draftForEditor.duration_unit || 'day',
        duration_from: draftForEditor.duration_from || 'project_start',
        stage_status_options_editor: getProcessTaskStatusOptionsFromStage(draftForEditor).map((option) => ({
          label: String(option?.label || ''),
          value: String(option?.value || ''),
          color: String(option?.color || '') || 'default',
          insertAfter: String(option?.insertAfter || '').trim() || undefined,
        })),
      });
      setDraftStageTaskTypeValue(String(draftForEditor?.task_type || '').trim());
      setDraftAutomationRules(
        normalizeProcessAutomationRules(draftForEditor?.automation_rules).map((rule) =>
          normalizeAutomationRuleForEditor(rule)
        )
      );
      setDraftCustomFields(getProcessTaskCustomFieldsFromStage(draftForEditor));
      setDraftStageStatusOptions(getProcessTaskStatusOptionsFromStage(draftForEditor));
    } else {
      draftForm.setFieldsValue({
        description: '',
        task_type: undefined,
        sort_order: (draftLocal.length + 1) * 10,
        wage: 0,
        weight: 0,
        duration_value: 0,
        duration_unit: 'day',
        duration_from: 'project_start',
        stage_status_options_editor: [],
      });
      setDraftAutomationRules([]);
      setDraftCustomFields([]);
      setDraftStageStatusOptions([]);
      setDraftStageTaskTypeValue('');
    }
  }, [isDraftModalOpen, editingDraft, draftForm, draftLocal.length, normalizeAutomationRuleForEditor, normalizeDraftStageForEditor]);

  useEffect(() => {
    if (!isDraftModalOpen) return;
    if (watchedDraftStageStatusOptions === undefined) return;
    setDraftStageStatusOptions(normalizeProcessTaskStatusOptions(watchedDraftStageStatusOptions));
  }, [isDraftModalOpen, watchedDraftStageStatusOptions]);

  useEffect(() => {
    if (!isDraftModalOpen || !isProcessModule) return;
    void loadAutomationOptions();
  }, [automationScopeModuleId, isDraftModalOpen, isProcessModule, loadAutomationOptions]);

  useEffect(() => {
    if (!isDraftModalOpen || taskTypeOptions.length === 0) return;
    setDraftAutomationRules((prev) => prev.map((rule) => normalizeAutomationRuleForEditor(rule)));
  }, [isDraftModalOpen, normalizeAutomationRuleForEditor, taskTypeOptions]);

  const draftSegments = draftList.map((stage: any) => ({
    ...stage,
    type: 'draft',
    label: stage.name || stage.title || 'مرحله',
  }));

  const processDraftGroups = useMemo(() => {
    if (!isProcessRecordModule) return [] as Array<{ id: string; label: string; templateId: string | null; templateName: string | null; stages: any[] }>;
    const sorted = [...draftSegments].sort((a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
    const groups = new Map<string, { id: string; label: string; stages: any[]; firstSort: number; firstIndex: number }>();
    sorted.forEach((stage: any, index: number) => {
      const stageMeta = getStageProcessGroupMeta(stage);
      const groupId = stageMeta.groupId;
      const groupLabel = String(stageMeta.groupLabel || '').trim();
      const sortOrder = Number(stage?.sort_order || 0);
      if (!groups.has(groupId)) {
        groups.set(groupId, {
          id: groupId,
          label: groupLabel,
          stages: [stage],
          firstSort: Number.isFinite(sortOrder) ? sortOrder : 0,
          firstIndex: index,
        });
        return;
      }
      const current = groups.get(groupId)!;
      current.stages.push(stage);
      if (Number.isFinite(sortOrder) && sortOrder < current.firstSort) current.firstSort = sortOrder;
    });
    return Array.from(groups.values())
      .sort((a, b) => (a.firstSort - b.firstSort) || (a.firstIndex - b.firstIndex))
      .map((group) => ({
        id: group.id,
        label: group.label,
        templateId: String(group.stages?.[0]?.source_template_id || '').trim() || null,
        templateName: String(group.stages?.[0]?.source_template_name || '').trim() || null,
        stages: group.stages.sort((a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0)),
      }));
  }, [draftSegments, getStageProcessGroupMeta, isProcessRecordModule]);

  useEffect(() => {
    if (processDraftGroups.length > 0) {
      setShowEmptyProcessDetails(true);
    } else if (tasks.length === 0) {
      setShowEmptyProcessDetails(false);
    }
  }, [processDraftGroups.length, tasks.length]);

  const getLineSegments = (lineTasks: any[], activeDraftSegments: any[] = draftSegments) => {
    const normalizedTasks = (lineTasks || []).map((task: any) => ({
      ...task,
      type: 'task',
      _normalizedName: normalizeStageName(task.name || task.title),
      _normalizedKey: `${normalizeStageName(task.name || task.title)}::${Number(task?.sort_order || 0)}`,
    }));

    const lineDrafts = activeDraftSegments.filter((draft: any) => {
      const normalizedDraft = normalizeStageName(draft.label);
      const normalizedDraftKey = `${normalizedDraft}::${Number(draft?.sort_order || 0)}`;
      const matched = normalizedTasks.some((t: any) =>
        (t._normalizedName && t._normalizedName === normalizedDraft)
        && (t._normalizedKey === normalizedDraftKey || Number(draft?.sort_order || 0) <= 0)
      );
      return !matched;
    });

    const merged = [...normalizedTasks, ...lineDrafts].sort((a: any, b: any) => {
      const aOrder = Number(a.sort_order ?? 0);
      const bOrder = Number(b.sort_order ?? 0);
      return aOrder - bOrder;
    });

    return merged;
  };

  const getProcessLineGroups = (lineTasks: any[]) => {
    const baseGroups = processDraftGroups.length > 0
      ? processDraftGroups
      : [{ id: 'default_process_group', label: '', templateId: null, templateName: null, stages: [] as any[] }];
    const sortedTasks = [...(lineTasks || [])].sort((a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
    const usedTaskIds = new Set<string>();
    const groups = baseGroups.map((group) => {
      const stageNameSet = new Set(group.stages.map((stage: any) => normalizeStageName(stage?.label)));
      const stageSortSet = new Set(
        group.stages
          .map((stage: any) => Number(stage?.sort_order || 0))
          .filter((value: number) => Number.isFinite(value) && value > 0)
      );
      const scopedTasks = sortedTasks.filter((task: any) => {
        const taskId = String(task?.id || '');
        if (taskId && usedTaskIds.has(taskId)) return false;
        const taskMeta = getTaskProcessGroupMeta(task);
        if (taskMeta.groupId) {
          if (taskMeta.groupId !== String(group.id)) return false;
          if (taskId) usedTaskIds.add(taskId);
          return true;
        }
        const normalizedTaskName = normalizeStageName(task?.name || task?.title);
        const taskSort = Number(task?.sort_order || 0);
        const bySort = stageSortSet.size > 0 && Number.isFinite(taskSort) && stageSortSet.has(taskSort);
        const byName = normalizedTaskName && stageNameSet.has(normalizedTaskName);
        if (!bySort && !byName) return false;
        if (taskId) usedTaskIds.add(taskId);
        return true;
      });
      return {
        ...group,
        templateId: group.templateId || scopedTasks.map((task: any) => getTaskProcessGroupMeta(task).templateId).find(Boolean) || null,
        templateName: group.templateName || scopedTasks.map((task: any) => getTaskProcessGroupMeta(task).templateName).find(Boolean) || null,
        tasks: scopedTasks,
      };
    });

    const remainingTasks = sortedTasks.filter((task: any) => !usedTaskIds.has(String(task?.id || '')));
    if (remainingTasks.length > 0) {
      const orphanGroups = new Map<string, any>();
      const ungroupedTasks: any[] = [];
      remainingTasks.forEach((task: any) => {
        const taskMeta = getTaskProcessGroupMeta(task);
        if (!taskMeta.groupId) {
          ungroupedTasks.push(task);
          return;
        }
        if (!orphanGroups.has(taskMeta.groupId)) {
          orphanGroups.set(taskMeta.groupId, {
            id: taskMeta.groupId,
            label: taskMeta.groupLabel || taskMeta.templateName || '',
            templateId: taskMeta.templateId || null,
            templateName: taskMeta.templateName || null,
            stages: [],
            tasks: [],
          });
        }
        orphanGroups.get(taskMeta.groupId).tasks.push(task);
      });
      if (orphanGroups.size > 0) {
        groups.push(...Array.from(orphanGroups.values()));
      }
      if (ungroupedTasks.length > 0) {
        if (!groups.length) {
          groups.push({ id: 'default_process_group', label: '', templateId: null, templateName: null, stages: [], tasks: ungroupedTasks });
        } else {
          groups[0] = { ...groups[0], tasks: [...groups[0].tasks, ...ungroupedTasks] };
        }
      }
    }

    return groups
      .filter((group) => (Array.isArray(group?.stages) && group.stages.length > 0) || (Array.isArray(group?.tasks) && group.tasks.length > 0))
      .map((group) => ({
      ...group,
      lineSegments: getLineSegments(group.tasks, group.stages),
    }));
  };
  const canAutoAssignProcessGroup = useCallback((group: any) => {
    const stages = Array.isArray(group?.stages) ? group.stages : [];
    if (stages.length === 0) return false;
    const existingKeys = new Set(
      (Array.isArray(group?.tasks) ? group.tasks : [])
        .map((task: any) => {
          const taskMeta = getTaskProcessGroupMeta(task);
          return buildProcessStageTaskKey(
            taskMeta.groupId || group?.id || 'default_process_group',
            task?.name || task?.title || '',
            task?.sort_order
          );
        })
        .filter(Boolean)
    );

    return stages.some((stage: any) => {
      const stageName = String(stage?.name || stage?.title || '').trim();
      if (!stageName) return false;
      const stageMeta = getStageProcessGroupMeta(stage);
      const stageKey = buildProcessStageTaskKey(stageMeta.groupId, stageName, stage?.sort_order);
      return !!stageKey && !existingKeys.has(stageKey);
    });
  }, [buildProcessStageTaskKey, getStageProcessGroupMeta, getTaskProcessGroupMeta]);
  const hasProcessGroupStarted = useCallback((group: any) =>
    (Array.isArray(group?.tasks) ? group.tasks : []).some((task: any) => {
      const normalizedStatus = String(task?.status || '').trim().toLowerCase();
      return ['in_progress', 'done', 'completed', 'confirmed', 'final', 'settled'].includes(normalizedStatus);
    }),
  []);
  const getProcessGroupOriginLabel = useCallback((group: any) => {
    const firstTask = (Array.isArray(group?.tasks) ? group.tasks : []).find((task: any) =>
      String(task?.source_module_id || '').trim() || String(task?.source_record_id || '').trim()
    );
    const originModuleId = String(firstTask?.source_module_id || moduleId || '').trim();
    const originRecordId = String(firstTask?.source_record_id || recordId || '').trim();
    const originModuleLabel = MODULES[originModuleId]?.titles?.faSingular
      || MODULES[originModuleId]?.titles?.fa
      || originModuleId
      || 'رکورد';
    const originKey = originModuleId && originRecordId ? `${originModuleId}:${originRecordId}` : '';
    const originRecordLabel = originKey ? processOriginTitleMap[originKey] : '';
    return originRecordLabel
      ? `${originModuleLabel}: ${toPersianNumber(originRecordLabel)}`
      : originModuleLabel;
  }, [moduleId, processOriginTitleMap, recordId]);
  const isProcessGroupCompleted = useCallback((group: any) => {
    const groupTasks = Array.isArray(group?.tasks) ? group.tasks : [];
    if (groupTasks.length === 0) return false;
    return groupTasks.every((task: any) => {
      const normalizedStatus = String(task?.status || '').trim().toLowerCase();
      return ['done', 'completed', 'confirmed', 'final', 'settled'].includes(normalizedStatus);
    });
  }, []);
  useEffect(() => {
    let cancelled = false;

    const loadProcessOriginTitles = async () => {
      const groupedIds = new Map<string, Set<string>>();
      (tasks || []).forEach((task: any) => {
        const originModuleId = String(task?.source_module_id || '').trim();
        const originRecordId = String(task?.source_record_id || '').trim();
        if (!originModuleId || !originRecordId || !MODULES[originModuleId]) return;
        if (!groupedIds.has(originModuleId)) {
          groupedIds.set(originModuleId, new Set<string>());
        }
        groupedIds.get(originModuleId)!.add(originRecordId);
      });

      if (groupedIds.size === 0) {
        setProcessOriginTitleMap({});
        return;
      }

      const nextMap: Record<string, string> = {};
      await Promise.all(
        Array.from(groupedIds.entries()).map(async ([originModuleId, ids]) => {
          const moduleConfig = MODULES[originModuleId];
          const tableName = moduleConfig?.table || originModuleId;
          const idList = Array.from(ids).filter(Boolean);
          if (!tableName || idList.length === 0) return;
          const { data } = await supabase
            .from(tableName)
            .select('*')
            .in('id', idList);
          (data || []).forEach((row: any) => {
            const title = getRecordTitle(row, moduleConfig, { fallback: '' });
            if (!title) return;
            nextMap[`${originModuleId}:${row.id}`] = title;
          });
        })
      );

      if (!cancelled) {
        setProcessOriginTitleMap(nextMap);
      }
    };

    void loadProcessOriginTitles();
    return () => {
      cancelled = true;
    };
  }, [tasks]);

  useEffect(() => {
    let cancelled = false;

    const loadRelatedTitles = async () => {
      const groupedIds = new Map<string, Set<string>>();
      (tasks || []).forEach((task: any) => {
        TASK_RELATED_FIELD_DEFINITIONS.forEach((meta) => {
          const rawId = String(task?.[meta.fieldKey] || '').trim();
          if (!rawId || !MODULES[meta.moduleId] || !canViewModuleByPermissions(meta.moduleId)) return;
          if (!groupedIds.has(meta.moduleId)) groupedIds.set(meta.moduleId, new Set<string>());
          groupedIds.get(meta.moduleId)!.add(rawId);
        });
      });

      if (groupedIds.size === 0) {
        setRelatedRecordTitleMap({});
        return;
      }

      const nextMap: Record<string, string> = {};
      await Promise.all(
        Array.from(groupedIds.entries()).map(async ([targetModuleId, ids]) => {
          const moduleConfig = MODULES[targetModuleId];
          const tableName = moduleConfig?.table || targetModuleId;
          const idList = Array.from(ids).filter(Boolean);
          if (!tableName || idList.length === 0) return;
          const { data } = await supabase
            .from(tableName)
            .select('*')
            .in('id', idList);
          (data || []).forEach((row: any) => {
            const title = getRecordTitle(row, moduleConfig, { fallback: String(row?.id || '') });
            if (!title) return;
            nextMap[`${targetModuleId}:${String(row.id)}`] = title;
          });
        })
      );

      if (!cancelled) {
        setRelatedRecordTitleMap(nextMap);
      }
    };

    void loadRelatedTitles();
    return () => {
      cancelled = true;
    };
  }, [canViewModuleByPermissions, tasks]);

  useEffect(() => {
    let cancelled = false;

    const loadProcessTemplateNames = async () => {
      const templateIds = Array.from(new Set(
        (tasks || [])
          .map((task: any) => {
            const recurrence = parseRecurrenceInfo(task?.recurrence_info);
            return String(task?.process_template_id || recurrence?.process_source?.template_id || '').trim();
          })
          .filter(Boolean)
      ));

      if (templateIds.length === 0) {
        setProcessTemplateNameMap({});
        return;
      }

      const { data } = await supabase
        .from('process_templates')
        .select('id,name')
        .in('id', templateIds);

      const nextMap = (data || []).reduce<Record<string, string>>((acc, row: any) => {
        const id = String(row?.id || '').trim();
        if (!id) return acc;
        acc[id] = String(row?.name || row?.id || '').trim();
        return acc;
      }, {});

      if (!cancelled) {
        setProcessTemplateNameMap(nextMap);
      }
    };

    void loadProcessTemplateNames();
    return () => {
      cancelled = true;
    };
  }, [tasks, parseRecurrenceInfo]);

  const handleCopyLine = async (line: any) => {
    if (!recordId || !line?.id || !isProductionOrder) return;
    try {
      setLoading(true);
      const { data: maxRow, error: maxError } = await supabase
        .from('production_lines')
        .select('line_no')
        .eq('production_order_id', recordId)
        .order('line_no', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (maxError) throw maxError;
      const nextLineNo = (Number(maxRow?.line_no) || 0) + 1;

      const { data: newLine, error: lineError } = await supabase
        .from('production_lines')
        .insert({
          production_order_id: recordId,
          line_no: nextLineNo,
          quantity: line.quantity || 0,
        })
        .select('id')
        .single();
      if (lineError) throw lineError;

      const sourceTasks = tasksByLine.get(String(line.id)) || [];
      if (newLine?.id && sourceTasks.length > 0) {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData?.user?.id || null;
        const payload = sourceTasks.map((task: any) => ({
          name: task.name || task.title,
          status: 'todo',
          produced_qty: toNumber(task?.produced_qty),
          related_production_order: recordId,
          related_to_module: 'production_orders',
          production_line_id: newLine.id,
          assignee_id: task.assignee_id ?? null,
          assignee_role_id: task.assignee_role_id ?? null,
          assignee_type: task.assignee_type ?? null,
          due_date: task.due_date ?? null,
          wage: task.wage ?? null,
          weight: task.weight ?? 0,
          sort_order: task.sort_order ?? null,
          created_by: userId,
        }));
        const { error: taskError } = await supabase.from('tasks').insert(payload);
        if (taskError) throw taskError;
      }

      message.success('خط تولید کپی شد');
      fetchLines();
      fetchTasks();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'خطا در کپی خط'));
    } finally {
      setLoading(false);
    }
  };

  if (!isReadyToLoad && readOnly && compact && !isBom) {
    return (
      <div ref={containerRef} className="w-full select-none" dir="rtl">
        <div className="w-full h-5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 dark:text-gray-500 text-[10px]">
          ...
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full flex flex-col gap-4 select-none" dir="rtl">
      {isDraftOnlyModule && (
        <div className="space-y-2">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {isProcessTemplateModule ? 'مراحل پیش‌نویس فرآیند' : 'مراحل پیش‌نویس (BOM)'}
          </div>
          <div className={`flex-1 flex bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 ${compact ? 'h-5' : 'h-9'}`}>
            {draftSegments.length > 0 ? (
              draftSegments.map((stage: any, index: number) => (
                <Popover
                  key={stage.id || index}
                  content={
                    <div className="max-w-[min(92vw,22rem)] space-y-2 break-words p-1 text-xs">
                      <div className="font-bold text-[rgba(var(--brand-800-rgb),1)] dark:text-gray-100">{stage.label}</div>
                      <div>ترتیب: {toPersianNumber(stage.sort_order || '-')}</div>
                      <div>دستمزد: {toPersianNumber(Number(stage.wage || 0).toLocaleString('en-US'))} تومان</div>
                      <div>وزن: {toPersianNumber(stage.weight || 0)}</div>
                      <div>مسئول: {getDraftAssigneeLabel(stage)}</div>
                      {String(stage?.task_type || '').trim() && <div>نوع فعالیت: {stage.task_type}</div>}
                      {String(stage?.description || '').trim() && <div>توضیحات: {stage.description}</div>}
                      <div>اتوماسیون‌ها: {toPersianNumber(normalizeProcessAutomationRules(stage?.automation_rules).length || 0)}</div>
                      <div>زمان انجام: {formatDraftDuration(stage)}</div>
                      {!readOnly && (
                        <div className="flex gap-2">
                          <Button size="small" onClick={() => openDraftStageModal(stage, 'stage')}>ویرایش</Button>
                          {isProcessTemplateModule && (
                            <Button size="small" onClick={() => openDraftStageModal(stage, 'automation')}>اتوماسیون</Button>
                          )}
                          <Button size="small" danger onClick={() => handleRemoveDraftStage(stage)}>حذف</Button>
                        </div>
                      )}
                    </div>
                  }
                  trigger={readOnly ? 'click' : 'hover'}
                  overlayStyle={{ zIndex: 10000, maxWidth: 'calc(100vw - 1rem)' }}
                >
                  <div
                    className={`relative flex items-center justify-center cursor-pointer transition-all group ${index !== 0 ? 'border-r border-gray-200/70 dark:border-gray-700/80' : ''}`}
                    style={{ flex: 1, border: '1px dashed #d1d5db', backgroundColor: 'transparent' }}
                    onClick={() => {
                      if (!readOnly) openDraftStageModal(stage, 'stage');
                    }}
                  >
                    <span className={`text-gray-600 font-medium truncate w-full text-center ${compact ? 'text-[9px]' : 'text-[11px]'}`}>
                      {stage.label}
                    </span>
                  </div>
                </Popover>
              ))
            ) : (
              <div className="w-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-xs bg-gray-50 dark:bg-gray-900 h-full">
                {compact ? <span className="opacity-50">-</span> : 'بدون مرحله پیش‌نویس'}
              </div>
            )}
          </div>

          {!readOnly && (
            <div className="flex justify-start">
              <Tooltip title="افزودن مرحله پیش‌نویس">
                  <Button
                    type="dashed"
                    icon={<PlusOutlined />}
                    size={compact ? 'small' : 'middle'}
                    onClick={openDraftStageChooser}
                    className="border-amber-300 text-amber-700 hover:!border-amber-600 hover:!text-amber-600 hover:!bg-amber-50"
                  >
                    افزودن مرحله
                  </Button>
              </Tooltip>
            </div>
          )}
        </div>
      )}

      {!isDraftOnlyModule && visibleLines.map((line) => {
        const lineTasks = tasksByLine.get(String(line.id)) || [];
        const canEditQuantity = isProductionOrder && !readOnly && (!orderStatus || orderStatus === 'pending');
        const showInlineQty = isProductionOrder && (!compact || canEditQuantity);
        const lineSegments = getLineSegments(lineTasks);
        const processLineGroups = isProcessRecordModule ? getProcessLineGroups(lineTasks) : [];
        const normalizedProcessLineGroups = processLineGroups.length > 0
          ? processLineGroups
          : [{ id: 'default_process_group', label: '', templateId: null, templateName: null, stages: [], tasks: [], lineSegments: [] as any[] }];
        const visibleProcessLineGroups = normalizedProcessLineGroups.filter((group: any) =>
          showCompletedProcessGroups || !isProcessGroupCompleted(group)
        );
        const isProcessEmptyState = isProcessRecordModule
          && normalizedProcessLineGroups.length === 1
          && (!Array.isArray(normalizedProcessLineGroups[0]?.stages) || normalizedProcessLineGroups[0].stages.length === 0)
          && (!Array.isArray(normalizedProcessLineGroups[0]?.tasks) || normalizedProcessLineGroups[0].tasks.length === 0)
          && (!Array.isArray(normalizedProcessLineGroups[0]?.lineSegments) || normalizedProcessLineGroups[0].lineSegments.length === 0);

        const renderSegmentsBar = (segments: any[], barKey: string) => {
          const shouldCompactSegments = cardCompact && segments.length > 5;
          const displaySegments = shouldCompactSegments ? segments.slice(0, 5) : segments;
          const hiddenCount = shouldCompactSegments ? Math.max(0, segments.length - displaySegments.length) : 0;
          const getCompactLabel = (value: unknown) => {
            const raw = String(value || '').trim();
            return raw ? raw.charAt(0) : '-';
          };

          return (
          <div className={`relative flex-1 flex bg-gray-100 dark:bg-gray-800 rounded-lg overflow-visible border border-gray-200 dark:border-gray-700 ${compact ? 'h-5' : 'h-9'}`}>
            {displaySegments.map((segment: any, index: number) => (
              segment.type === 'task' ? (
                (() => {
                  const isAssignedToCurrent = isTaskAssignedToCurrentUser(segment);
                  const isHighlightedTask = isAssignedToCurrent;
                  const segmentColor = getStatusColor(segment.status, segment);
                  return (
                    <div
                      key={`${barKey}-task-${segment.id}`}
                      data-task-segment-id={String(segment.id)}
                      className={`relative flex items-center justify-center cursor-pointer transition-all hover:brightness-110 group ${index !== 0 ? 'border-r border-gray-200/70 dark:border-gray-700/80' : ''} ${index === 0 ? 'rounded-r-lg' : ''} ${index === displaySegments.length - 1 && hiddenCount === 0 ? 'rounded-l-lg' : ''} ${isHighlightedTask ? 'z-10' : ''}`}
                      style={{
                        flex: 1,
                        backgroundColor: segmentColor,
                        boxShadow: isHighlightedTask
                          ? `0 0 8px ${segmentColor}66, 0 0 16px ${segmentColor}4D, 0 0 24px ${segmentColor}33`
                          : undefined,
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openTaskProcessModal({ task: segment });
                      }}
                    >
                      <div className="flex flex-col items-center justify-center w-full px-1 overflow-hidden">
                        <span className={`inline-flex items-center justify-center gap-1 text-white font-medium truncate w-full text-center drop-shadow-md ${compact ? 'text-[9px]' : 'text-[11px]'}`}>
                          {String(segment?.status || '').toLowerCase() === 'canceled' ? <CloseOutlined className={compact ? 'text-[8px]' : 'text-[10px]'} /> : (
                            ['done', 'completed'].includes(String(segment?.status || '').toLowerCase())
                              ? <CheckOutlined className={compact ? 'text-[8px]' : 'text-[10px]'} />
                              : <HourglassOutlined className={compact ? 'text-[8px]' : 'text-[10px]'} />
                          )}
                          <span className="truncate">
                            {shouldCompactSegments ? getCompactLabel(segment.title || segment.name) : (segment.title || segment.name)}
                          </span>
                        </span>
                        {!compact && segment.sort_order && (
                          <span className="text-[8px] text-white/90 absolute bottom-0.5 right-1 bg-black/10 px-1 rounded-sm">
                            {toPersianNumber(segment.sort_order)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <Popover
                  key={`${barKey}-draft-${segment.id}-${index}`}
                  content={
                    <div className="max-w-[min(92vw,22rem)] space-y-2 break-words p-1 text-xs">
                      <div className="font-bold text-[rgba(var(--brand-800-rgb),1)] dark:text-gray-100">{segment.label}</div>
                      <div>ترتیب: {toPersianNumber(segment.sort_order || '-')}</div>
                      <div>دستمزد: {toPersianNumber(Number(segment.wage || 0).toLocaleString('en-US'))} تومان</div>
                      <div>وزن: {toPersianNumber(segment.weight || 0)}</div>
                      <div>مسئول: {getDraftAssigneeLabel(segment)}</div>
                      {String(segment?.task_type || '').trim() && <div>نوع فعالیت: {segment.task_type}</div>}
                      {String(segment?.description || '').trim() && <div>توضیحات: {segment.description}</div>}
                      <div>فیلدهای اختصاصی: {toPersianNumber(getProcessTaskCustomFieldsFromStage(segment).length || 0)}</div>
                      <div>اتوماسیون‌ها: {toPersianNumber(normalizeProcessAutomationRules(segment?.automation_rules).length || 0)}</div>
                      <div>زمان انجام: {formatDraftDuration(segment)}</div>
                      {!readOnly && (
                        <div className="flex items-center gap-2">
                          {recordId && (
                            <Button
                              size="small"
                              onClick={() => openTaskModal(line.id, segment)}
                              className="border-[rgba(var(--brand-300-rgb),0.7)] text-[rgba(var(--brand-700-rgb),1)] hover:!border-[rgba(var(--brand-500-rgb),0.9)] hover:!text-[rgba(var(--brand-600-rgb),1)] hover:!bg-[rgba(var(--brand-50-rgb),0.7)]"
                            >
                              ایجاد فعالیت
                            </Button>
                          )}
                          <Button
                            size="small"
                            onClick={() => openDraftStageModal(segment, 'automation')}
                          >
                            اتوماسیون
                          </Button>
                          <Button
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                              onClick={() => handleRemoveDraftStage(segment)}
                          >
                            حذف
                          </Button>
                        </div>
                      )}
                    </div>
                  }
                  trigger={compact ? 'hover' : 'click'}
                  overlayStyle={{ zIndex: 10000, maxWidth: 'calc(100vw - 1rem)' }}
                  title={null}
                >
                  <div
                    className={`relative flex items-center justify-center cursor-pointer transition-all group ${index !== 0 ? 'border-r border-gray-200/70 dark:border-gray-700/80' : ''} ${index === 0 ? 'rounded-r-lg' : ''} ${index === displaySegments.length - 1 && hiddenCount === 0 ? 'rounded-l-lg' : ''}`}
                    style={{ flex: 1, border: '1px dashed #d1d5db', backgroundColor: 'transparent' }}
                  >
                    <div className="flex flex-col items-center justify-center w-full px-1 overflow-hidden">
                      <span className={`text-gray-600 font-medium truncate w-full text-center ${compact ? 'text-[9px]' : 'text-[11px]'}`}>
                        {shouldCompactSegments ? getCompactLabel(segment.label) : segment.label}
                      </span>
                    </div>
                  </div>
                </Popover>
              )
            ))}
            {hiddenCount > 0 && (
              <div
                className={`relative flex items-center justify-center bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-100 font-semibold rounded-l-lg ${displaySegments.length !== 0 ? 'border-r border-gray-300/70 dark:border-gray-600/80' : ''} ${compact ? 'text-[9px]' : 'text-[11px]'}`}
                style={{ flex: 0.8 }}
                title={`${toPersianNumber(hiddenCount)} فعالیت دیگر`}
              >
                +{toPersianNumber(hiddenCount)}
              </div>
            )}
            {segments.length === 0 && (
              <div className="w-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-xs bg-gray-50 dark:bg-gray-900 h-full">
                {compact ? <span className="opacity-50">-</span> : (isProcessModule ? 'بدون مرحله فرآیند' : 'بدون مرحله تولید')}
              </div>
            )}
          </div>
          );
        };

        return (
          <div key={line.id} className="space-y-2">
            <div className="flex items-center gap-3 text-xs text-gray-600">
              {(!(isProcessRecordModule && readOnly && compact)) && !isProcessRecordModule && (
                <span className="flex items-center gap-2 font-bold">
                  <span>
                    {isProcessModule
                      ? processTitle
                      : `خط ${toPersianNumber(line.line_no)}${compact ? `: ${toPersianNumber(line.quantity || 0)} عدد` : ''}`}
                  </span>
                  {isProcessModule ? (
                    <HelpHint
                      title="راهنمای نوار مراحل"
                      content={processLegendHelpContent}
                    />
                  ) : null}
                </span>
              )}
              {showInlineQty && (
                <div className="flex items-center gap-2">
                  <span>تعداد تولید:</span>
                  <InputNumber
                    min={0}
                    className="w-24"
                    value={line.quantity}
                    onChange={(val) => handleLineQuantityChange(line.id, Number(val) || 0)}
                    disabled={!canEditQuantity}
                  />
                </div>
              )}
              {!readOnly && isProductionOrder && (
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => handleCopyLine(line)}
                  className="text-amber-700 hover:!text-amber-600"
                >
                  کپی خط
                </Button>
              )}
            </div>

            {isProcessRecordModule ? (
              <>
                {readOnly && !tasksLoaded ? (
                  <div
                    className={
                      (compact || cardCompact)
                        ? "rounded-lg border border-dashed border-gray-300/80 dark:border-gray-700 px-2 py-1.5 text-center text-[10px] leading-4 text-gray-400 dark:text-gray-500"
                        : "rounded-xl border border-dashed border-gray-300 dark:border-gray-700 px-3 py-4 text-center text-xs text-gray-400 dark:text-gray-500"
                    }
                  >
                    در حال بارگذاری فرآیند...
                  </div>
                ) : isProcessEmptyState && !showEmptyProcessDetails ? (
                  readOnly || !recordId ? (
                    <div
                      className={
                        (compact || cardCompact)
                          ? "rounded-lg border border-dashed border-gray-300/80 dark:border-gray-700 px-2 py-1.5 text-center text-[10px] leading-4 text-gray-500 dark:text-gray-400"
                          : "rounded-xl border border-dashed border-gray-300 dark:border-gray-700 px-3 py-3 text-center text-xs text-gray-500 dark:text-gray-400"
                      }
                    >
                      هنوز فرآیندی ایجاد نشده است
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setShowEmptyProcessDetails(true);
                        void handleOpenAppendProcessModal();
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[rgba(var(--brand-300-rgb),0.8)] bg-[rgba(var(--brand-50-rgb),0.42)] px-3 py-3 text-sm font-medium text-[rgba(var(--brand-700-rgb),1)] transition-colors hover:border-[rgba(var(--brand-500-rgb),0.9)] hover:bg-[rgba(var(--brand-50-rgb),0.7)] dark:border-[rgba(var(--brand-300-rgb),0.3)] dark:bg-[rgba(var(--brand-700-rgb),0.12)]"
                    >
                      <PlusOutlined />
                      <span>ایجاد فرآیند</span>
                    </button>
                  )
                ) : (
                  <div className="space-y-2">
                    {visibleProcessLineGroups.map((group: any, groupIndex: number) => {
                      const showAutoAssignButton = canAutoAssignProcessGroup(group);
                      const isTemplateLocked = hasProcessGroupStarted(group);
                      const processOriginLabel = getProcessGroupOriginLabel(group);
                      return (
                      <div
                        key={`${line.id}-${group.id}-${groupIndex}`}
                        className={
                          cardCompact
                            ? 'space-y-2'
                            : 'space-y-3 rounded-2xl border border-[rgba(255,255,255,0.8)] bg-white/80 p-3 shadow-sm dark:border-gray-700 dark:bg-[#151515]'
                        }
                      >
                        {!readOnly && !!recordId && (
                          <div className="flex flex-wrap items-end gap-3">
                            <div className="min-w-[220px] flex-1 max-w-[360px]">
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-gray-400">الگوی فرآیند اجرا</span>
                                <Select
                                  {...modalSelectProps}
                                  allowClear={false}
                                  value={group?.templateId || undefined}
                                  onChange={(val) => {
                                    const normalizedValue = String(val || '').trim();
                                    if (!normalizedValue) return;
                                    void handleApplyTemplateToGroup(String(group?.id || ''), normalizedValue);
                                  }}
                                  options={processTemplateOptions}
                                  loading={processTemplateOptionsLoading}
                                  className="w-full"
                                  placeholder="انتخاب الگوی فرآیند"
                                  disabled={isTemplateLocked}
                                />
                                {isTemplateLocked ? (
                                  <span className="text-[11px] text-gray-500">بعد از شروع این فرآیند، الگوی آن قابل تغییر نیست.</span>
                                ) : null}
                              </div>
                            </div>
                            <Button
                              type="link"
                              size="small"
                              className="px-0"
                              icon={<LinkOutlined />}
                              disabled={!group?.templateId}
                              onClick={() => {
                                void handleOpenAppendProcessModal('links', {
                                  id: String(group?.id || ''),
                                  templateId: group?.templateId || null,
                                  stages: group?.stages || [],
                                });
                              }}
                            >
                              مشاهده بخش های مرتبط این فرآیند
                            </Button>
                            {showAutoAssignButton ? (
                              <Button
                                size={compact ? 'small' : 'middle'}
                                onClick={() => { void handleAutoAssignProcess(String(group?.id || '')); }}
                                className="border-[rgba(var(--brand-300-rgb),0.7)] text-[rgba(var(--brand-700-rgb),1)] hover:!border-[rgba(var(--brand-500-rgb),0.9)] hover:!text-[rgba(var(--brand-600-rgb),1)] hover:!bg-[rgba(var(--brand-50-rgb),0.7)]"
                              >
                                ارجاع خودکار فرآیند
                              </Button>
                            ) : null}
                            <Tooltip title="کپی فرآیند">
                              <Button
                                size={compact ? 'small' : 'middle'}
                                icon={<CopyOutlined />}
                                onClick={() => { void handleCopyProcessGroup(String(group?.id || '')); }}
                                disabled={!Array.isArray(group?.stages) || group.stages.length === 0}
                              />
                            </Tooltip>
                            <Tooltip title={Array.isArray(group?.tasks) && group.tasks.length > 0 ? 'فرآیند متصل به فعالیت قابل حذف نیست' : 'حذف فرآیند'}>
                              <Button
                                danger
                                size={compact ? 'small' : 'middle'}
                                icon={<DeleteOutlined />}
                                onClick={() => {
                                  if (Array.isArray(group?.tasks) && group.tasks.length > 0) {
                                    message.warning('ابتدا فعالیت‌های متصل به این فرآیند را جدا یا حذف کنید');
                                    return;
                                  }
                                  Modal.confirm({
                                    title: 'حذف فرآیند',
                                    content: 'این فرآیند از پیش‌نویس حذف شود؟',
                                    okText: 'حذف',
                                    cancelText: 'انصراف',
                                    okButtonProps: { danger: true },
                                    onOk: async () => {
                                      await handleDeleteProcessGroup(String(group?.id || ''));
                                    },
                                  });
                                }}
                                disabled={!Array.isArray(group?.stages) || group.stages.length === 0 || (Array.isArray(group?.tasks) && group.tasks.length > 0)}
                              />
                            </Tooltip>
                          </div>
                        )}
                        {!compact && !cardCompact ? (
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
                            <span>مبدا فرآیند: {processOriginLabel}</span>
                          </div>
                        ) : null}
                        <div className="w-full flex items-center gap-2">
                          {renderSegmentsBar(group?.lineSegments || [], `${line.id}-${group.id}-${groupIndex}`)}
                          {!readOnly && !!recordId && (
                            <Tooltip title="افزودن مرحله جدید">
                              <Button
                                type="dashed"
                                shape="circle"
                                icon={<PlusOutlined />}
                                size={compact ? 'small' : 'middle'}
                                onClick={() => {
                                  openTaskModal(line.id, undefined, {
                                    id: String(group?.id || ''),
                                    label: group?.label || null,
                                    templateId: group?.templateId || null,
                                    templateName: group?.templateName || null,
                                  });
                                }}
                                className="flex-shrink-0 border-[rgba(var(--brand-300-rgb),0.7)] text-[rgba(var(--brand-700-rgb),1)] hover:!border-[rgba(var(--brand-500-rgb),0.9)] hover:!text-[rgba(var(--brand-600-rgb),1)] hover:!bg-[rgba(var(--brand-50-rgb),0.7)]"
                              />
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    )})}
                  </div>
                )}
                {!readOnly && !!recordId && !(isProcessEmptyState && !showEmptyProcessDetails) && (
                  <div className="flex justify-start">
                    <Button
                      size={compact ? 'small' : 'middle'}
                      onClick={() => {
                        setShowEmptyProcessDetails(true);
                        void handleOpenAppendProcessModal();
                      }}
                      className="border-[rgba(var(--brand-300-rgb),0.7)] text-[rgba(var(--brand-700-rgb),1)] hover:!border-[rgba(var(--brand-500-rgb),0.9)] hover:!text-[rgba(var(--brand-600-rgb),1)] hover:!bg-[rgba(var(--brand-50-rgb),0.7)]"
                    >
                      افزودن فرآیند جدید
                    </Button>
                  </div>
                )}
                {normalizedProcessLineGroups.some((group: any) => isProcessGroupCompleted(group)) && (
                  <div className="flex justify-center">
                    <Button
                      size="small"
                      type="text"
                      icon={showCompletedProcessGroups ? <UpOutlined /> : <DownOutlined />}
                      onClick={() => setShowCompletedProcessGroups((prev) => !prev)}
                      className="px-0 text-xs text-gray-500 hover:!text-leather-600"
                    >
                      {showCompletedProcessGroups ? 'پنهان کردن فرآیندهای تکمیل شده' : 'مشاهده فرآیندهای تکمیل شده'}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="w-full flex items-center gap-2">
                {!readOnly && !!recordId && (
                  <div className="flex items-center gap-2">
                    <Tooltip title="افزودن مرحله جدید">
                      <Button
                        type="dashed"
                        shape="circle"
                        icon={<PlusOutlined />}
                        size={compact ? 'small' : 'middle'}
                        onClick={() => {
                          openTaskModal(line.id);
                        }}
                        className="flex-shrink-0 border-[rgba(var(--brand-300-rgb),0.7)] text-[rgba(var(--brand-700-rgb),1)] hover:!border-[rgba(var(--brand-500-rgb),0.9)] hover:!text-[rgba(var(--brand-600-rgb),1)] hover:!bg-[rgba(var(--brand-50-rgb),0.7)]"
                      />
                    </Tooltip>
                  </div>
                )}
                {renderSegmentsBar(lineSegments, String(line.id))}
              </div>
            )}

            {showWageSummary && (
              <div className="text-xs text-gray-500">
                دستمزد این خط: {toPersianNumber(((lineTasks.reduce((acc, t) => acc + (parseFloat(t.wage) || 0), 0)) * (parseFloat(line.quantity) || 0)).toLocaleString('en-US'))} تومان
              </div>
            )}
          </div>
        );
      })}

      {!isDraftOnlyModule && visibleLines.length === 0 && (
        <div className="w-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-xs bg-gray-50 dark:bg-gray-900 h-10 rounded border border-gray-200 dark:border-gray-700">
          {loading ? <Spin size="small" /> : (isProcessModule ? 'بدون مرحله فرآیند' : 'بدون خط تولید')}
        </div>
      )}

      {!readOnly && !isBom && isProductionOrder && (
        <div className="flex justify-start">
          <Tooltip title="افزودن خط تولید جدید">
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              size={compact ? 'small' : 'middle'}
              onClick={() => setIsLineModalOpen(true)}
              className="border-amber-300 text-amber-700 hover:!border-amber-600 hover:!text-amber-600 hover:!bg-amber-50"
            >
              افزودن خط
            </Button>
          </Tooltip>
        </div>
      )}

      {showWageSummary && (
        <div className="text-sm font-bold text-gray-700">
          جمع دستمزد تولید: {toPersianNumber(totalWage.toLocaleString('en-US'))} تومان
        </div>
      )}

      <Modal
        rootClassName="task-quick-modal-root"
        className="task-quick-modal"
        open={!!activeTaskQuickModalTask}
        onCancel={() => closeTaskQuickModal()}
        footer={null}
        title={null}
        centered
        destroyOnHidden
        width={560}
        zIndex={12000}
        style={{ maxWidth: 'calc(100vw - 1rem)' }}
        styles={{
          body: { padding: 0, overflow: 'hidden' },
          content: { overflow: 'hidden' },
        }}
      >
        {activeTaskQuickModalTask ? renderPopupContent(activeTaskQuickModalTask) : null}
      </Modal>

      <Modal
        title="افزودن خط تولید"
        open={isLineModalOpen && isProductionOrder}
        onCancel={() => setIsLineModalOpen(false)}
        footer={null}
        centered
        destroyOnHidden
      >
        <Form form={lineForm} onFinish={handleAddLine} layout="vertical" className="pt-2">
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-6">
              <Form.Item name="line_no" label="شماره خط" initialValue={(lines[lines.length - 1]?.line_no || 0) + 1}>
                <InputNumber className="w-full" min={1} />
              </Form.Item>
            </div>
            <div className="col-span-6">
              <Form.Item name="quantity" label="تعداد تولید" initialValue={0}>
                <InputNumber className="w-full" min={0} />
              </Form.Item>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4 border-t pt-4">
            <Button onClick={() => setIsLineModalOpen(false)} className="rounded-lg">انصراف</Button>
            <Button type="primary" htmlType="submit" className="rounded-lg bg-amber-700 hover:!bg-amber-600 border-none">
              ثبت خط
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title="افزودن مرحله الگوی فرآیند"
        open={draftStageChooserOpen}
        onCancel={() => setDraftStageChooserOpen(false)}
        footer={null}
        width={560}
        centered
        destroyOnHidden
      >
        <div className="space-y-3 pt-2">
          <Button
            type="primary"
            className="w-full rounded-lg border-none bg-[rgba(var(--brand-600-rgb),1)] hover:!bg-[rgba(var(--brand-500-rgb),1)]"
            onClick={() => {
              setDraftStageChooserOpen(false);
              openDraftStageModal(null, 'stage');
            }}
          >
            ساخت مرحله الگوی فرآیند خام
          </Button>
          <div className="rounded-xl border border-[rgba(var(--brand-200-rgb),0.7)] bg-[rgba(var(--brand-50-rgb),0.55)] p-3">
            <div className="mb-2 text-sm font-medium text-[rgba(var(--brand-800-rgb),1)]">کپی از دیگر الگوهای فرآیند</div>
            <Select
              {...modalSelectProps}
              value={draftSourceTemplateId || undefined}
              placeholder="انتخاب الگوی فرآیند"
              loading={draftSourceTemplateLoading}
              options={draftSourceTemplateOptions}
              className="w-full"
              onChange={(value) => { void handleDraftSourceTemplateChange(String(value || '')); }}
            />
            <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-[rgba(var(--brand-200-rgb),0.7)] bg-white/90 p-2 dark:border-[rgba(var(--brand-300-rgb),0.2)] dark:bg-white/5">
              {draftSourceTemplateStagesLoading ? (
                <div className="flex items-center justify-center py-4 text-xs text-gray-500">در حال بارگذاری مراحل...</div>
              ) : draftSourceTemplateStages.length === 0 ? (
                <div className="py-4 text-center text-xs text-gray-500">مرحله‌ای برای نمایش وجود ندارد</div>
              ) : (
                <div className="space-y-2">
                  {draftSourceTemplateStages.map((stage: any, index: number) => {
                    const stageName = String(stage?.stage_name || `مرحله ${index + 1}`).trim() || `مرحله ${index + 1}`;
                    return (
                      <button
                        key={`${String(stage?.id || 'stage')}-${index}`}
                        type="button"
                        className="flex w-full items-center justify-between rounded-lg border border-[rgba(var(--brand-200-rgb),0.8)] bg-white px-3 py-2 text-right transition-colors hover:border-[rgba(var(--brand-500-rgb),0.6)] hover:bg-[rgba(var(--brand-50-rgb),0.75)] dark:border-[rgba(var(--brand-300-rgb),0.2)] dark:bg-white/5"
                        onClick={() => handleCopyDraftStageFromTemplate(stage)}
                      >
                        <span className="truncate text-sm text-[rgba(var(--brand-900-rgb),1)] dark:text-[rgba(var(--brand-50-rgb),0.95)]">{stageName}</span>
                        <span className="text-xs text-[rgba(var(--brand-700-rgb),1)]">کپی و ویرایش</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        title={<div className="flex items-center gap-2 text-[rgba(var(--brand-800-rgb),1)]"><div className="rounded bg-[rgba(var(--brand-50-rgb),1)] p-1 text-[rgba(var(--brand-600-rgb),1)]"><PlusOutlined /></div> {isProcessModule ? 'افزودن مرحله فرآیند (فعالیت)' : 'افزودن مرحله تولید'}</div>}
        open={isTaskModalOpen}
        onCancel={() => {
          setIsTaskModalOpen(false);
          taskForm.resetFields();
          setActiveLineId(null);
          setActiveProcessGroupMeta(null);
          setDraftToCreate(null);
          setTaskCustomFieldDrafts((prev) => {
            const next = { ...prev };
            delete next[TASK_MODAL_CUSTOM_FIELD_DRAFT_ID];
            return next;
          });
        }}
        footer={null}
        zIndex={10001}
        width={560}
        centered
        destroyOnHidden
        styles={stageModalStyles}
      >
        <Form form={taskForm} onFinish={handleAddTask} layout="vertical" className="pt-1 [&_.ant-form-item]:mb-3">
          <div className="max-h-[68vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-9">
              <Form.Item name="name" label={isProcessModule ? 'عنوان فعالیت' : 'عنوان مرحله'} rules={[{ required: true, message: 'الزامی' }]}> 
                <Input placeholder="مثلا: برشکاری..." />
              </Form.Item>
            </div>
            <div className="col-span-3">
              <Form.Item name="sort_order" label="ترتیب" initialValue={(tasks.length + 1) * 10}>
                <InputNumber className="w-full" min={1} />
              </Form.Item>
            </div>

            <div className="col-span-6">
              <Form.Item name="wage" label="دستمزد">
                <InputNumber className="w-full" min={0} />
              </Form.Item>
            </div>
            <div className="col-span-6">
              <Form.Item name="weight" label="وزن">
                <InputNumber className="w-full" min={0} />
              </Form.Item>
            </div>

            <div className="col-span-12">
              <Form.Item name="task_type" label="نوع فعالیت">
                <DynamicSelectField
                  options={taskTypeOptions}
                  category="task_type"
                  onOptionsUpdate={fetchTaskTypeOptions}
                  protectedValues={getTaskTypeProtectedValues()}
                  placeholder="انتخاب نوع فعالیت"
                  className="w-full"
                  getPopupContainer={(node) => node?.parentElement || document.body}
                />
              </Form.Item>
            </div>

            <div className="col-span-12">
              <Form.Item name="assignee_combo" label="مسئول انجام">
                <Select placeholder="انتخاب کنید..." {...modalSelectProps}>
                  <Select.OptGroup label="کاربران">
                    {assignees.users.map(u => (
                      <Select.Option key={`user-${u.id}`} value={`user:${u.id}`} label={u.display_name || u.full_name || u.email || u.mobile_1}>
                        <Space><UserOutlined /> {u.display_name || u.full_name || u.email || u.mobile_1}</Space>
                      </Select.Option>
                    ))}
                  </Select.OptGroup>
                  <Select.OptGroup label="تیم‌ها">
                    {assignees.roles.map(r => (
                      <Select.Option key={`role-${r.id}`} value={`role:${r.id}`} label={r.title}>
                        <Space><TeamOutlined /> {r.title}</Space>
                      </Select.Option>
                    ))}
                  </Select.OptGroup>
                </Select>
              </Form.Item>
            </div>

            <div className="col-span-12">
              <Form.Item name="description" label="شرح فعالیت">
                <Input.TextArea placeholder="شرح مرحله/فعالیت" autoSize={{ minRows: 2, maxRows: 4 }} />
              </Form.Item>
            </div>

            {taskModalCustomFields.length > 0 ? (
              <div className="col-span-12 rounded-xl border border-[rgba(var(--brand-200-rgb),0.65)] bg-[rgba(var(--brand-50-rgb),0.38)] p-3 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5">
                <div className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">فیلدهای اختصاصی فعالیت</div>
                <div className="grid grid-cols-12 gap-2">
                  {taskModalCustomFields.map((field) => (
                    <div
                      key={`task-modal-custom-${field.key}`}
                      className={
                        field.type === FieldType.LONG_TEXT || field.type === FieldType.SUPER_LONG_TEXT
                          ? 'col-span-12'
                          : 'col-span-12 md:col-span-6'
                      }
                    >
                      <div className="mb-1 text-xs text-gray-500">{field.labels?.fa || field.key}</div>
                      {renderTaskCustomFieldInput(
                        { id: TASK_MODAL_CUSTOM_FIELD_DRAFT_ID },
                        field,
                        taskModalCustomFieldDraft[String(field.key)]
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {isProcessModule && (
              <>
                <div className="col-span-12">
                  <div className="text-xs text-gray-500 mb-1">زمان انجام</div>
                </div>
                <div className="col-span-5">
                  <Form.Item name="duration_from" label="بعد از">
                    <Select
                      {...modalSelectProps}
                      options={[
                        { label: 'شروع پروژه', value: 'project_start' },
                        { label: 'اتمام مرحله قبلی', value: 'previous_stage_end' },
                      ]}
                    />
                  </Form.Item>
                </div>
                <div className="col-span-4">
                  <Form.Item name="duration_value" label="مقدار">
                    <InputNumber className="w-full" min={0} />
                  </Form.Item>
                </div>
                <div className="col-span-3">
                  <Form.Item name="duration_unit" label="واحد">
                    <Select
                      {...modalSelectProps}
                      options={[
                        { label: 'روز', value: 'day' },
                        { label: 'ساعت', value: 'hour' },
                      ]}
                    />
                  </Form.Item>
                </div>
              </>
            )}

            <div className="col-span-12">
              <Form.Item name="due_date" label="موعد انجام (دستی)">
                <PersianDatePicker
                  type="DATETIME"
                  placeholder="تاریخ و ساعت (اختیاری)"
                  className="w-full"
                  zIndex={10060}
                />
              </Form.Item>
            </div>
          </div>
          </div>

          <div className="flex justify-end gap-2 mt-4 border-t pt-4">
            <Button onClick={() => {
              setIsTaskModalOpen(false);
              taskForm.resetFields();
              setActiveLineId(null);
              setActiveProcessGroupMeta(null);
              setDraftToCreate(null);
              setTaskCustomFieldDrafts((prev) => {
                const next = { ...prev };
                delete next[TASK_MODAL_CUSTOM_FIELD_DRAFT_ID];
                return next;
              });
            }} className="rounded-lg">انصراف</Button>
            <Button type="primary" htmlType="submit" loading={loading} className="rounded-lg border-none shadow-md bg-[rgba(var(--brand-600-rgb),1)] hover:!bg-[rgba(var(--brand-500-rgb),1)]">
              {isProcessModule ? 'ثبت فعالیت' : 'ثبت مرحله'}
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title={<div className="flex items-center gap-2 text-[rgba(var(--brand-800-rgb),1)]"><div className="rounded bg-[rgba(var(--brand-50-rgb),1)] p-1 text-[rgba(var(--brand-600-rgb),1)]"><PlusOutlined /></div> {editingDraft ? 'ویرایش مرحله پیش‌نویس' : (isProcessModule ? 'افزودن مرحله پیش‌نویس فرآیند' : 'افزودن مرحله پیش‌نویس')}</div>}
        open={isDraftModalOpen}
        onCancel={closeDraftStageModal}
        footer={null}
        zIndex={10001}
        width={1040}
        centered
        destroyOnHidden
        styles={stageModalStyles}
      >
        <Form
          form={draftForm}
          onFinish={handleAddDraftStage}
          onValuesChange={(changedValues) => {
            if (Object.prototype.hasOwnProperty.call(changedValues || {}, 'task_type')) {
              setDraftStageTaskTypeValue(String(changedValues?.task_type || '').trim());
            }
            if (Object.prototype.hasOwnProperty.call(changedValues || {}, 'stage_status_options_editor')) {
              setDraftStageStatusOptions(normalizeProcessTaskStatusOptions(
                draftForm.getFieldValue('stage_status_options_editor')
              ));
            }
          }}
          layout="vertical"
          className="pt-1"
        >
          <div className="mb-4 rounded-2xl border border-[rgba(var(--brand-200-rgb),0.7)] bg-[rgba(var(--brand-50-rgb),0.75)] px-4 py-3 text-xs leading-6 text-[rgba(var(--brand-800-rgb),1)] dark:border-[rgba(var(--brand-300-rgb),0.2)] dark:bg-[rgba(var(--brand-700-rgb),0.16)] dark:text-[rgba(var(--brand-50-rgb),0.98)]">
            این مرحله فقط در پیش‌نمایش الگو ذخیره می‌شود. بعدا موقع ساخت یا کپی فرآیند، همین تنظیمات برای ایجاد فعالیت‌ها استفاده می‌شود.
          </div>
          <div className="mb-5 rounded-2xl border border-[rgba(var(--brand-200-rgb),0.55)] bg-white/80 px-4 py-4 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5">
            <Steps
              current={draftModalStepIndex}
              responsive={false}
              size="small"
              onChange={(index) => {
                if (isSavingDraftStage) return;
                const targetKey = draftModalStepItems[index]?.key;
                if (targetKey) {
                  void goToDraftModalStep(targetKey);
                }
              }}
              items={draftModalStepItems.map((step, index) => ({
                title: step.title,
                description: `مرحله ${toPersianNumber(index + 1)}: ${step.description}`,
              }))}
            />
          </div>
          {draftModalTabKey === 'stage' && (
            <div className="grid grid-cols-12 gap-3 pt-2">
                    <div className="col-span-9">
                      <Form.Item
                        name="name"
                        label={(
                          <div className="flex items-center justify-between gap-2">
                            <span>عنوان مرحله</span>
                            {renderDraftTemplatePicker('name')}
                          </div>
                        )}
                        rules={[{ required: true, message: 'الزامی' }]}
                      >
                        <Input
                          ref={draftStageNameInputRef}
                          placeholder="مثلا: برشکاری..."
                          onSelect={(event) => rememberDraftTemplateSelection('name', event.currentTarget)}
                          onClick={(event) => rememberDraftTemplateSelection('name', event.currentTarget)}
                          onKeyUp={(event) => rememberDraftTemplateSelection('name', event.currentTarget)}
                        />
                      </Form.Item>
                    </div>
                    <div className="col-span-3">
                      <Form.Item name="sort_order" label="ترتیب" initialValue={(draftLocal.length + 1) * 10}>
                        <InputNumber className="w-full" min={1} />
                      </Form.Item>
                    </div>

                    {isProcessModule && (
                      <>
                        <div className="col-span-6">
                          <Form.Item name="wage" label="دستمزد">
                            <InputNumber className="w-full" min={0} />
                          </Form.Item>
                        </div>
                        <div className="col-span-6">
                          <Form.Item name="weight" label="وزن">
                            <InputNumber className="w-full" min={0} />
                          </Form.Item>
                        </div>
                        <div className="col-span-12">
                          <Form.Item
                            name="task_type"
                            label="نوع فعالیت"
                            rules={[{ required: true, message: 'نوع فعالیت را انتخاب کنید.' }]}
                          >
                            <DynamicSelectField
                              options={taskTypeOptions}
                              category="task_type"
                              onOptionsUpdate={fetchTaskTypeOptions}
                              protectedValues={getTaskTypeProtectedValues()}
                              placeholder="انتخاب نوع فعالیت"
                              className="w-full"
                              getPopupContainer={(node) => node?.parentElement || document.body}
                            />
                          </Form.Item>
                        </div>
                        <div className="col-span-12">
                          <Form.Item
                            name="description"
                            label={(
                              <div className="flex items-center justify-between gap-2">
                                <span>توضیحات</span>
                                {renderDraftTemplatePicker('description')}
                              </div>
                            )}
                          >
                            <Input.TextArea
                              ref={draftStageDescriptionInputRef}
                              placeholder="توضیحات مرحله پیش‌نویس"
                              autoSize={{ minRows: 2, maxRows: 4 }}
                              onSelect={(event) => rememberDraftTemplateSelection('description', event.currentTarget)}
                              onClick={(event) => rememberDraftTemplateSelection('description', event.currentTarget)}
                              onKeyUp={(event) => rememberDraftTemplateSelection('description', event.currentTarget)}
                            />
                          </Form.Item>
                        </div>
                        <div className="col-span-12">
                          <Form.Item name="default_assignee_combo" label="مسئول انجام پیش‌فرض">
                            <Select placeholder="انتخاب کنید..." {...modalSelectProps}>
                              <Select.OptGroup label="کاربران">
                                {assignees.users.map(u => (
                                  <Select.Option key={`draft-user-${u.id}`} value={`user:${u.id}`} label={u.display_name || u.full_name || u.email || u.mobile_1}>
                                    <Space><UserOutlined /> {u.display_name || u.full_name || u.email || u.mobile_1}</Space>
                                  </Select.Option>
                                ))}
                              </Select.OptGroup>
                              <Select.OptGroup label="تیم‌ها">
                                {assignees.roles.map(r => (
                                  <Select.Option key={`draft-role-${r.id}`} value={`role:${r.id}`} label={r.title}>
                                    <Space><TeamOutlined /> {r.title}</Space>
                                  </Select.Option>
                                ))}
                              </Select.OptGroup>
                            </Select>
                          </Form.Item>
                        </div>
                        <div className="col-span-12">
                          <div className="text-xs text-gray-500 mb-1">زمان انجام</div>
                        </div>
                        <div className="col-span-5">
                          <Form.Item name="duration_from" label="بعد از">
                            <Select
                              {...modalSelectProps}
                              options={[
                                { label: 'شروع پروژه', value: 'project_start' },
                                { label: 'اتمام مرحله قبلی', value: 'previous_stage_end' },
                              ]}
                            />
                          </Form.Item>
                        </div>
                        <div className="col-span-4">
                          <Form.Item name="duration_value" label="مقدار">
                            <InputNumber className="w-full" min={0} />
                          </Form.Item>
                        </div>
                        <div className="col-span-3">
                          <Form.Item name="duration_unit" label="واحد">
                            <Select
                              {...modalSelectProps}
                              options={[
                                { label: 'روز', value: 'day' },
                                { label: 'ساعت', value: 'hour' },
                              ]}
                            />
                          </Form.Item>
                        </div>
                      </>
                    )}
                  </div>
          )}
          {draftModalTabKey === 'fields' && (
            <div className="space-y-4 pt-2">
                    <div className="rounded-2xl border border-[rgba(var(--brand-200-rgb),0.7)] bg-white/95 p-4 shadow-sm dark:border-[rgba(var(--brand-300-rgb),0.22)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.7)]">
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">شخصی‌سازی وضعیت‌های فعالیت</div>
                          <div className="space-y-2">
                            {mergedDraftStageStatusOptions.length > 0 ? mergedDraftStageStatusOptions.map((option, index) => {
                              const optionValue = String(option?.value || '').trim();
                              const isCustom = draftStageStatusValueSet.has(optionValue);
                              const isFirst = index === 0;
                              const isLast = index === mergedDraftStageStatusOptions.length - 1;
                              return (
                                <div
                                  key={`draft-stage-status-order-${optionValue}-${index}`}
                                  className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(var(--brand-200-rgb),0.45)] bg-[rgba(var(--brand-50-rgb),0.34)] px-3 py-2 dark:border-[rgba(var(--brand-300-rgb),0.16)] dark:bg-white/5"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Tag color={String(option.color || 'default')}>{option.label}</Tag>
                                    <Tag color={isCustom ? 'processing' : 'default'}>
                                      {isCustom ? 'سفارشی' : 'سیستمی'}
                                    </Tag>
                                  </div>
                                  {isCustom ? (
                                    <Space size="small">
                                      <Button
                                        htmlType="button"
                                        size="small"
                                        icon={<UpOutlined />}
                                        disabled={isFirst}
                                        onClick={() => moveDraftStageStatusOption(optionValue, 'up')}
                                      />
                                      <Button
                                        htmlType="button"
                                        size="small"
                                        icon={<DownOutlined />}
                                        disabled={isLast}
                                        onClick={() => moveDraftStageStatusOption(optionValue, 'down')}
                                      />
                                    </Space>
                                  ) : (
                                    <span className="text-xs text-gray-400">ثابت</span>
                                  )}
                                </div>
                              );
                            }) : (
                              <span className="text-xs text-gray-400">هنوز وضعیتی برای نمایش وجود ندارد.</span>
                            )}
                          </div>
                        </div>

                        <Form.List name="stage_status_options_editor">
                          {(fields, { add, remove }) => (
                            <div className="space-y-3">
                              {fields.map((field) => {
                                const { key, ...listField } = field;
                                return (
                                <div
                                  key={key}
                                  className="grid grid-cols-12 gap-3 rounded-xl border border-[rgba(var(--brand-200-rgb),0.55)] bg-[rgba(var(--brand-50-rgb),0.36)] p-3 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5"
                                >
                                  <div className="col-span-12 md:col-span-4">
                                    <Form.Item
                                      {...listField}
                                      label="عنوان فارسی"
                                      name={[field.name, 'label']}
                                      rules={[{ required: true, message: 'عنوان فارسی را وارد کنید' }]}
                                      className="mb-0"
                                    >
                                      <Input placeholder="مثلا: منتظر تایید مدیر" />
                                    </Form.Item>
                                  </div>
                                  <div className="col-span-12 md:col-span-4">
                                    <Form.Item
                                      {...listField}
                                      label="نام انگلیسی / کلید سیستمی"
                                      name={[field.name, 'value']}
                                      rules={[
                                        { required: true, message: 'نام انگلیسی را وارد کنید' },
                                        { pattern: /^[a-z0-9_]+$/, message: 'فقط حروف انگلیسی کوچک، عدد و _ مجاز است' },
                                      ]}
                                      className="mb-0"
                                    >
                                      <Input placeholder="manager_pending" dir="ltr" />
                                    </Form.Item>
                                  </div>
                                  <div className="col-span-10 md:col-span-3">
                                    <Form.Item
                                      {...listField}
                                      label="رنگ"
                                      name={[field.name, 'color']}
                                      initialValue="default"
                                      rules={[{ required: true, message: 'رنگ را انتخاب کنید' }]}
                                      className="mb-0"
                                    >
                                      <Select
                                        {...modalSelectProps}
                                        options={PROCESS_TASK_STATUS_COLOR_OPTIONS}
                                        placeholder="رنگ"
                                      />
                                    </Form.Item>
                                  </div>
                                  <div className="col-span-2 md:col-span-1 flex items-end justify-end">
                                    <Button htmlType="button" type="text" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                                  </div>
                                  <Form.Item {...listField} name={[field.name, 'insertAfter']} hidden>
                                    <Input />
                                  </Form.Item>
                                </div>
                              )})}
                              <Button
                                type="dashed"
                                htmlType="button"
                                icon={<PlusOutlined />}
                                onClick={() => add({
                                  color: 'default',
                                  insertAfter: String(mergedDraftStageStatusOptions[mergedDraftStageStatusOptions.length - 1]?.value || '').trim() || PROCESS_TASK_STATUS_START_ANCHOR,
                                })}
                                className="w-full"
                              >
                                افزودن وضعیت
                              </Button>
                            </div>
                          )}
                        </Form.List>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3">
                      <Button
                        type="dashed"
                        htmlType="button"
                        icon={<PlusOutlined />}
                        onClick={() => openDraftCustomFieldModal(null)}
                      >
                        افزودن فیلد
                      </Button>
                    </div>

                    {draftCustomFields.length === 0 ? (
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="هنوز فیلد اختصاصی برای این مرحله تعریف نشده است."
                      />
                    ) : (
                      <div className="space-y-3">
                        {draftCustomFields.map((field) => (
                            <div
                              key={field.key}
                              className="rounded-2xl border border-[rgba(var(--brand-200-rgb),0.7)] bg-white/95 p-4 shadow-sm dark:border-[rgba(var(--brand-300-rgb),0.22)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.7)]"
                            >
                              <div className="space-y-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                                        {field.labels?.fa || field.key}
                                      </div>
                                      <Tag color="default">{processTaskCustomFieldTypeLabels[field.type] || field.type}</Tag>
                                      <Tag>{field.key}</Tag>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                      {field.dynamicOptionsCategory ? <span>دسته داینامیک: {field.dynamicOptionsCategory}</span> : null}
                                      {field.relationConfig?.targetModule ? (
                                        <span>ماژول مرتبط: {MODULES[String(field.relationConfig.targetModule)]?.titles?.fa || field.relationConfig.targetModule}</span>
                                      ) : null}
                                      {field.options?.length ? <span>{toPersianNumber(field.options.length)} گزینه ثابت</span> : null}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button size="small" htmlType="button" icon={<EditOutlined />} onClick={() => openDraftCustomFieldModal(field)}>
                                      ویرایش
                                    </Button>
                                    {processTaskOptionEditableTypes.has(field.type) && (
                                      <Button
                                        size="small"
                                        htmlType="button"
                                        icon={<SettingOutlined />}
                                        onClick={() => openDraftCustomFieldOptionsEditor(field)}
                                      >
                                        گزینه‌ها
                                      </Button>
                                    )}
                                    <Button
                                      size="small"
                                      htmlType="button"
                                      danger
                                      icon={<DeleteOutlined />}
                                      onClick={() => removeDraftCustomField(String(field.key))}
                                    >
                                      حذف
                                    </Button>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-xs text-gray-500">مقدار پیش‌فرض / قالب</div>
                                    {renderDraftTemplatePicker(`custom:${String(field.key)}`)}
                                  </div>
                                  {field.type === FieldType.LONG_TEXT || field.type === FieldType.SUPER_LONG_TEXT ? (
                                    <Input.TextArea
                                      ref={(node) => {
                                        draftCustomFieldDefaultInputRefs.current[String(field.key)] = node;
                                      }}
                                      value={stringifyTemplateValue(field?.defaultValue)}
                                      autoSize={{ minRows: 2, maxRows: 4 }}
                                      placeholder="در صورت نیاز مقدار یا متغیر قرار دهید"
                                      onChange={(event) => setDraftCustomFields((prev) => prev.map((item) => (
                                        String(item?.key || '') === String(field.key)
                                          ? { ...item, defaultValue: event.target.value }
                                          : item
                                      )))}
                                      onSelect={(event) => rememberDraftTemplateSelection(`custom:${String(field.key)}`, event.currentTarget)}
                                      onClick={(event) => rememberDraftTemplateSelection(`custom:${String(field.key)}`, event.currentTarget)}
                                      onKeyUp={(event) => rememberDraftTemplateSelection(`custom:${String(field.key)}`, event.currentTarget)}
                                    />
                                  ) : (
                                    <Input
                                      ref={(node) => {
                                        draftCustomFieldDefaultInputRefs.current[String(field.key)] = node;
                                      }}
                                      value={stringifyTemplateValue(field?.defaultValue)}
                                      placeholder="در صورت نیاز مقدار یا متغیر قرار دهید"
                                      onChange={(event) => setDraftCustomFields((prev) => prev.map((item) => (
                                        String(item?.key || '') === String(field.key)
                                          ? { ...item, defaultValue: event.target.value }
                                          : item
                                      )))}
                                      onSelect={(event) => rememberDraftTemplateSelection(`custom:${String(field.key)}`, event.currentTarget)}
                                      onClick={(event) => rememberDraftTemplateSelection(`custom:${String(field.key)}`, event.currentTarget)}
                                      onKeyUp={(event) => rememberDraftTemplateSelection(`custom:${String(field.key)}`, event.currentTarget)}
                                    />
                                  )}
                                </div>
                              </div>
                            </div>
                        ))}
                      </div>
                    )}
                  </div>
          )}
          {draftModalTabKey === 'automation' && (
            <div className="space-y-4 pt-2">
                    {!automationScopeModuleId && isProcessTemplateModule ? (
                      <Alert
                        type="warning"
                        showIcon
                        message="ابتدا ماژول هدف الگوی فرآیند را انتخاب کنید."
                        description="تا قبل از انتخاب ماژول هدف، فقط فیلدهای خود فعالیت در شرط‌ها در دسترس هستند. بعد از تعیین ماژول هدف، فیلدهای همان ماژول و ماژول‌های مرتبط هم اضافه می‌شوند."
                      />
                    ) : null}
                    {!draftStageTaskType ? (
                      <Alert
                        type="warning"
                        showIcon
                        message='ابتدا در "بخش مرحله الگوی فرآیند" نوع فعالیت را انتخاب کنید.'
                      />
                    ) : null}

                    {draftAutomationRules.map((rule, index) => {
                      const ruleActions = Array.isArray(rule.actions) ? rule.actions : [];
                      const editableAllConditions = (Array.isArray(rule.conditions_all) ? rule.conditions_all : []).filter(
                        (condition) => String(condition?.field || '').trim() !== '__task__task_type'
                      );
                      const editableAnyConditions = (Array.isArray(rule.conditions_any) ? rule.conditions_any : []).filter(
                        (condition) => String(condition?.field || '').trim() !== '__task__task_type'
                      );
                      return (
                      <div
                        key={rule.id}
                        className="rounded-2xl border border-[rgba(var(--brand-200-rgb),0.7)] bg-white/95 p-4 shadow-sm dark:border-[rgba(var(--brand-300-rgb),0.22)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.7)]"
                      >
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">اتوماسیون {toPersianNumber(index + 1)}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{getProcessAutomationRuleSummary(rule)}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">فعال</span>
                            <Switch
                              size="small"
                              checked={rule.is_active !== false}
                              onChange={(checked) => updateDraftAutomationRule(rule.id, { is_active: checked })}
                            />
                            <Button
                              type="text"
                              htmlType="button"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => removeDraftAutomationRule(rule.id)}
                            />
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="rounded-2xl border border-[rgba(var(--brand-200-rgb),0.55)] bg-[rgba(var(--brand-50-rgb),0.42)] p-4 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5">
                            <div className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">نام و توضیحات</div>
                            <div className="grid grid-cols-12 gap-3">
                              <div className="col-span-12 md:col-span-6">
                                <div className="mb-1 text-xs text-gray-500">نام اتوماسیون</div>
                                <Input
                                  value={String(rule?.name || '')}
                                  onChange={(event) => updateDraftAutomationRule(rule.id, { name: event.target.value })}
                                  placeholder="مثلا: خبر به چاپ"
                                />
                              </div>
                              <div className="col-span-12 md:col-span-6">
                                <div className="mb-1 text-xs text-gray-500">توضیحات</div>
                                <Input
                                  value={String(rule?.description || '')}
                                  onChange={(event) => updateDraftAutomationRule(rule.id, { description: event.target.value })}
                                  placeholder="توضیح کوتاه"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-[rgba(var(--brand-200-rgb),0.55)] bg-[rgba(var(--brand-50-rgb),0.42)] p-4 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5">
                            <div className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">شرایط اجرا</div>
                            <div className="space-y-4">
                              <div>
                                <div className="mb-2 text-xs text-gray-500">نوع اجرا</div>
                                <Radio.Group
                                  optionType="button"
                                  buttonStyle="solid"
                                  value={rule.trigger_type}
                                  options={
                                    String(rule?.trigger_type || '').trim() === 'previous_stage_completed'
                                      ? [...processAutomationTriggerTypeOptions, PROCESS_AUTOMATION_LEGACY_PREVIOUS_STAGE_TRIGGER_OPTION]
                                      : processAutomationTriggerTypeOptions
                                  }
                                  onChange={(event) => handleDraftAutomationTriggerChange(
                                    rule,
                                    event.target.value as ProcessAutomationRule['trigger_type']
                                  )}
                                />
                              </div>
                              <div>
                                <div className="mb-2 text-xs text-gray-500">زمان اجرا</div>
                                <Radio.Group
                                  value={rule.execution_mode || 'every_match'}
                                  options={workflowExecutionModeOptions}
                                  onChange={(event) => updateDraftAutomationRule(rule.id, {
                                    execution_mode: event.target.value as WorkflowExecutionMode,
                                  })}
                                />
                              </div>
                              {rule.trigger_type === 'interval' ? (
                                <div className="grid grid-cols-12 gap-3">
                                  <div className="col-span-12">
                                    <Alert
                                      type="info"
                                      showIcon
                                      message="اجرای زمان بندی نیاز به Runner دارد (Cron Job یا Edge Function زمان بندی شده)."
                                    />
                                  </div>
                                  <div className="col-span-12 md:col-span-3">
                                    <div className="mb-1 text-xs text-gray-500">هر</div>
                                    <InputNumber
                                      min={1}
                                      className="w-full persian-number"
                                      value={rule.interval_value || undefined}
                                      onChange={(value) => updateDraftAutomationRule(rule.id, {
                                        interval_value: Number.isFinite(Number(value)) ? Math.max(1, Number(value)) : 1,
                                      })}
                                      placeholder="عدد"
                                    />
                                  </div>
                                  <div className="col-span-12 md:col-span-3">
                                    <div className="mb-1 text-xs text-gray-500">واحد زمان</div>
                                    <Select
                                      {...modalSelectProps}
                                      value={rule.interval_unit || 'day'}
                                      options={intervalUnitOptions}
                                      onChange={(value) => updateDraftAutomationRule(rule.id, {
                                        interval_unit: value,
                                      })}
                                    />
                                  </div>
                                  <div className="col-span-12 md:col-span-3">
                                    <div className="mb-1 text-xs text-gray-500">در ساعت</div>
                                    <PersianDatePicker
                                      type="TIME"
                                      value={rule.interval_at || null}
                                      onChange={(value) => updateDraftAutomationRule(rule.id, {
                                        interval_at: value || null,
                                      })}
                                    />
                                  </div>
                                  <div className="col-span-12 md:col-span-3">
                                    <div className="mb-1 text-xs text-gray-500">تعداد بررسی</div>
                                    <InputNumber
                                      min={1}
                                      className="w-full persian-number"
                                      value={rule.batch_size || undefined}
                                      onChange={(value) => updateDraftAutomationRule(rule.id, {
                                        batch_size: value === null || value === undefined
                                          ? null
                                          : (Number.isFinite(Number(value)) ? Math.max(1, Number(value)) : null),
                                      })}
                                      placeholder="پیش فرض: همه"
                                    />
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-[rgba(var(--brand-200-rgb),0.55)] bg-[rgba(var(--brand-50-rgb),0.42)] p-4 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5">
                            <div className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">شرط‌ها</div>
                            <div className="space-y-4">
                              <div>
                                <div className="mb-2 text-xs text-gray-500">همه شرط‌ها</div>
                                {draftStageTaskType ? (
                                  <div className="mb-3 rounded-xl border border-dashed border-[rgba(var(--brand-200-rgb),0.75)] bg-white/70 px-3 py-2 text-xs leading-6 text-gray-700 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5 dark:text-gray-300">
                                    <span className="font-semibold text-[rgba(var(--brand-700-rgb),1)] dark:text-[rgba(var(--brand-200-rgb),1)]">شرط پیش‌فرض:</span>
                                    {' '}نوع فعالیت (فعالیت) برابر است با{' '}
                                    <span className="font-semibold">{draftStageTaskTypeLabel}</span>
                                  </div>
                                ) : null}
                                <WorkflowConditionsGroup
                                  value={editableAllConditions}
                                  onChange={(next) => updateDraftAutomationRule(rule.id, {
                                    conditions_all: (next as WorkflowCondition[]).filter(
                                      (condition) => String(condition?.id || '') !== '__locked_stage_task_type__'
                                    ),
                                  })}
                                  fields={draftStageTaskType ? automationConditionFieldsWithoutTaskType : automationConditionFields}
                                  dynamicOptions={automationDynamicOptions}
                                  relationOptions={automationRelationOptions}
                                  dynamicFieldProps={{
                                    task_type: {
                                      onOptionsUpdate: fetchTaskTypeOptions,
                                      protectedValues: getTaskTypeProtectedValues(),
                                    },
                                  }}
                                  onBeforeAddCondition={guardDraftAutomationConditionAdd}
                                />
                              </div>
                              <div>
                                <div className="mb-2 text-xs text-gray-500">یا یکی از شرط‌ها</div>
                                <WorkflowConditionsGroup
                                  value={editableAnyConditions}
                                  onChange={(next) => updateDraftAutomationRule(rule.id, {
                                    conditions_any: (next as WorkflowCondition[]).filter(
                                      (condition) => String(condition?.field || '').trim() !== '__task__task_type'
                                    ),
                                  })}
                                  fields={draftStageTaskType ? automationConditionFieldsWithoutTaskType : automationConditionFields}
                                  dynamicOptions={automationDynamicOptions}
                                  relationOptions={automationRelationOptions}
                                  dynamicFieldProps={{
                                    task_type: {
                                      onOptionsUpdate: fetchTaskTypeOptions,
                                      protectedValues: getTaskTypeProtectedValues(),
                                    },
                                  }}
                                  onBeforeAddCondition={guardDraftAutomationConditionAdd}
                                />
                              </div>
                            </div>
                          </div>

                            <div className="rounded-2xl border border-[rgba(var(--brand-200-rgb),0.55)] bg-[rgba(var(--brand-50-rgb),0.42)] p-4 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5">
                              <div className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">اقدام‌ها</div>
                              <div className="grid grid-cols-12 gap-3">
                                <div className="col-span-12">
                                  <WorkflowActionsBuilder
                                  value={ruleActions}
                                  onChange={(next) => updateDraftAutomationRule(rule.id, {
                                    actions: next,
                                    note_text: String(
                                      next?.find((action) => {
                                        const actionType = String(action?.type || '').trim();
                                        return actionType === 'send_note' || actionType === 'send_note_sms';
                                      })?.config?.note_text
                                      || ''
                                    ) || null,
                                  })}
                                  currentModuleId={automationScopeModuleId || 'tasks'}
                                  currentModuleFields={automationActionModuleFields}
                                  variableFields={automationActionVariableFields}
                                  moduleOptions={workflowModuleOptions}
                                  relationSourceModuleOptions={automationScopeModuleIds.map((scopeModuleId) => ({
                                    value: scopeModuleId,
                                    label: MODULES[scopeModuleId]?.titles?.fa || scopeModuleId,
                                  }))}
                                  additionalRecipientFieldOptions={[
                                    { label: 'مسئول همین فعالیت', value: '__comm_recipient__current_task_assignee' },
                                    { label: 'مسئول مرحله قبل', value: '__comm_recipient__previous_stage_assignee' },
                                    { label: 'مسئول مرحله بعد', value: '__comm_recipient__next_stage_assignee' },
                                  ]}
                                  dynamicOptions={automationDynamicOptions}
                                  relationOptions={automationRelationOptions}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )})}

                    <Button
                      type="dashed"
                      htmlType="button"
                      icon={<PlusOutlined />}
                      className="rounded-xl border-[rgba(var(--brand-300-rgb),0.7)] text-[rgba(var(--brand-700-rgb),1)] hover:!border-[rgba(var(--brand-500-rgb),0.9)] hover:!text-[rgba(var(--brand-600-rgb),1)] hover:!bg-[rgba(var(--brand-50-rgb),0.7)]"
                      onClick={addDraftAutomationRule}
                    >
                      افزودن اتوماسیون
                    </Button>
                  </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <Button onClick={closeDraftStageModal} className="rounded-lg">انصراف</Button>
            <div className="flex items-center gap-2">
              <Button
                htmlType="button"
                icon={<SaveOutlined />}
                loading={isSavingDraftStage}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void handleSaveDraftStageAndClose();
                }}
                className="rounded-lg"
              >
                ذخیره
              </Button>
              {draftModalStepIndex > 0 ? (
                <Button
                  htmlType="button"
                  icon={<ArrowRightOutlined />}
                  disabled={isSavingDraftStage}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const previousStepKey = DRAFT_MODAL_STEP_KEYS[draftModalStepIndex - 1];
                    if (previousStepKey) {
                      void goToDraftModalStep(previousStepKey);
                    }
                  }}
                  className="rounded-lg"
                >
                  مرحله قبل
                </Button>
              ) : null}
              {draftModalStepIndex < DRAFT_MODAL_STEP_KEYS.length - 1 ? (
                <Button
                  type="primary"
                  htmlType="button"
                  icon={<ArrowLeftOutlined />}
                  loading={isSavingDraftStage}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const nextStepKey = DRAFT_MODAL_STEP_KEYS[draftModalStepIndex + 1];
                    if (nextStepKey) {
                      void goToDraftModalStep(nextStepKey);
                    }
                  }}
                  className="rounded-lg border-none bg-leather-600 !text-white shadow-md hover:!border-none hover:!bg-leather-500 hover:!text-white focus:!border-none focus:!bg-leather-500 focus:!text-white active:!border-none active:!bg-leather-700 active:!text-white"
                >
                  مرحله بعد
                </Button>
              ) : (
                <Button type="primary" htmlType="submit" loading={isSavingDraftStage} className="rounded-lg border-none bg-leather-600 !text-white shadow-md hover:!border-none hover:!bg-leather-500 hover:!text-white focus:!border-none focus:!bg-leather-500 focus:!text-white active:!border-none active:!bg-leather-700 active:!text-white">
                  {editingDraft ? 'بروزرسانی مرحله' : 'ثبت مرحله'}
                </Button>
              )}
            </div>
          </div>
        </Form>
      </Modal>

      <Modal
        title={editingDraftCustomFieldKey ? 'ویرایش فیلد اختصاصی فعالیت' : 'افزودن فیلد اختصاصی فعالیت'}
        open={isDraftCustomFieldModalOpen}
        onCancel={closeDraftCustomFieldModal}
        onOk={() => { void saveDraftCustomField(); }}
        okText={editingDraftCustomFieldKey ? 'بروزرسانی فیلد' : 'ایجاد فیلد'}
        zIndex={10002}
        destroyOnHidden
      >
        <Form
          form={draftCustomFieldForm}
          layout="vertical"
          initialValues={{ type: FieldType.TEXT }}
        >
          <Form.Item label="کلید فیلد" name="key" rules={[{ required: true, message: 'کلید فیلد لازم است.' }]}>
            <Input
              placeholder="مثال: meeting_link"
              disabled={!!editingDraftCustomFieldKey}
            />
          </Form.Item>
          <Form.Item label="عنوان فارسی" name="labelFa" rules={[{ required: true, message: 'عنوان فارسی لازم است.' }]}>
            <Input placeholder="مثال: لینک جلسه" />
          </Form.Item>
          <Form.Item label="نوع فیلد" name="type" rules={[{ required: true, message: 'نوع فیلد را انتخاب کنید.' }]}>
            <Select {...modalSelectProps} allowClear={false} options={processTaskCustomFieldTypeOptions} />
          </Form.Item>

          {draftCustomFieldType === FieldType.RELATION && (
            <>
              <Form.Item
                label="ماژول مرتبط"
                name="relationTargetModule"
                rules={[{ required: true, message: 'ماژول مرتبط را انتخاب کنید.' }]}
              >
                <Select {...modalSelectProps} options={workflowModuleOptions} />
              </Form.Item>
              <Form.Item label="فیلد نمایشی مقصد" name="relationTargetField">
                <Select
                  {...modalSelectProps}
                  allowClear
                  options={(MODULES[String(draftCustomFieldRelationTargetModule || '')]?.fields || []).map((field) => ({
                    value: field.key,
                    label: field.labels?.fa || field.key,
                  }))}
                />
              </Form.Item>
            </>
          )}

          {supportsProcessTaskDynamicCategory(draftCustomFieldType) && (
            <Form.Item label="دسته‌بندی گزینه‌های داینامیک" name="dynamicCategory">
              <Input placeholder="مثال: meeting_type" />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title="ویرایش گزینه‌های فیلد"
        open={!!draftCustomFieldOptionEditor}
        onCancel={() => {
          setDraftCustomFieldOptionsEditorKey(null);
          draftCustomFieldOptionsForm.resetFields();
        }}
        onOk={() => { void saveDraftCustomFieldOptions(); }}
        okText="ثبت گزینه‌ها"
        zIndex={10003}
        destroyOnHidden
      >
        <div className="mb-3 text-xs text-gray-500">
          هر خط به‌صورت <code>label|value|color</code> وارد شود. رنگ اختیاری است.
        </div>
        <Form form={draftCustomFieldOptionsForm} layout="vertical">
          <Form.Item label="گزینه‌ها" name="optionsText">
            <Input.TextArea autoSize={{ minRows: 8, maxRows: 14 }} placeholder={'در حال انجام|in_progress|blue'} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={appendProcessModalMode === 'links' ? 'رکوردهای مرتبط با این فرآیند' : 'افزودن فرآیند جدید'}
        open={appendProcessModalOpen}
        onCancel={() => {
          setAppendProcessModalOpen(false);
          setAppendProcessModalGroupId(null);
          setAppendProcessModalMode('append');
          setAppendProcessTemplateId(null);
        }}
        footer={appendProcessModalMode === 'links'
          ? [
              <Button
                key="cancel"
                onClick={() => {
                  setAppendProcessModalOpen(false);
                  setAppendProcessModalGroupId(null);
                  setAppendProcessModalMode('append');
                  setAppendProcessTemplateId(null);
                }}
              >
                انصراف
              </Button>,
              <Button
                key="save-links"
                type="primary"
                className="border-none bg-[rgba(var(--brand-600-rgb),1)] hover:!bg-[rgba(var(--brand-500-rgb),1)]"
                loading={loading}
                onClick={() => { void handleSaveProcessLinksToGroup(); }}
              >
                ثبت رکوردهای مرتبط
              </Button>,
            ]
          : [
              <Button key="raw" onClick={() => { void handleCreateRawProcessGroup(); }} loading={loading}>
                ایجاد فرآیند خام
              </Button>,
              <Button
                key="cancel"
                onClick={() => {
                  setAppendProcessModalOpen(false);
                  setAppendProcessModalGroupId(null);
                  setAppendProcessModalMode('append');
                  setAppendProcessTemplateId(null);
                }}
              >
                انصراف
              </Button>,
              <Button
                key="add"
                type="primary"
                className="border-none bg-[rgba(var(--brand-600-rgb),1)] hover:!bg-[rgba(var(--brand-500-rgb),1)]"
                loading={loading}
                onClick={() => { void handleAppendProcessTemplate(); }}
                disabled={!appendProcessTemplateId}
              >
                افزودن از الگو
              </Button>,
            ]}
        destroyOnHidden
      >
        <div className="space-y-3 pt-2">
          <div className="text-xs text-gray-500">
            {appendProcessModalMode === 'links'
              ? 'رکوردهای مرتبط این فرآیند را در همین‌جا بررسی و بروزرسانی کنید.'
              : 'یک الگو انتخاب کنید تا یک نوار فرآیند جدید ساخته شود.'}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">الگوی فرآیند اجرا</span>
            <Select
              {...modalSelectProps}
              value={String(appendProcessTemplateId || '').trim() || undefined}
              onChange={(val) => setAppendProcessTemplateId(val ? String(val) : null)}
              options={processTemplateOptions}
              placeholder="انتخاب الگوی فرآیند"
              loading={processTemplateOptionsLoading}
              className="w-full"
              allowClear
              disabled={appendProcessModalMode === 'links'}
            />
          </div>
          {appendProcessTargetModuleIds.length > 0 ? (
            <div className="rounded-2xl border border-[rgba(var(--brand-200-rgb),0.65)] bg-[rgba(var(--brand-50-rgb),0.38)] p-3 space-y-3">
              <div className="text-sm font-semibold text-[rgba(var(--brand-800-rgb),1)]">رکوردهای مرتبط این فرآیند</div>
              <div className="text-xs text-gray-500">
                رکوردهای شناخته‌شده به‌صورت خودکار پر شده‌اند. در صورت نیاز، ماژول‌های باقی‌مانده را همین‌جا انتخاب کنید.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {appendProcessTargetModuleIds.map((targetModuleId) => (
                  <div key={targetModuleId} className="min-w-0">
                    <div className="mb-1 text-xs text-gray-500">
                      {MODULES[targetModuleId]?.titles?.fa || targetModuleId}
                    </div>
                    <SmartFieldRenderer
                      field={{
                        key: `process_link_record_${targetModuleId}`,
                        type: FieldType.RELATION,
                        labels: { fa: MODULES[targetModuleId]?.titles?.fa || targetModuleId, en: targetModuleId },
                        relationConfig: { targetModule: targetModuleId },
                      } as ModuleField}
                      value={appendProcessLinkedRecords[targetModuleId] || undefined}
                      onChange={(value) => setAppendProcessLinkedRecords((prev) => ({
                        ...prev,
                        [targetModuleId]: value ? String(value) : null,
                      }))}
                      forceEditMode={true}
                      options={appendProcessRelationOptions[targetModuleId] || []}
                      onOptionsUpdate={() => { void loadAppendProcessRelationOptions(targetModuleId, appendProcessLinkedRecords[targetModuleId] || null); }}
                      allValues={appendProcessLinkedRecords}
                      moduleId={moduleId}
                      recordId={recordId}
                      overlayZIndexBase={2200}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </Modal>

      {supportsHandover && (
        <>
          <TaskHandoverFormsModal
            open={handoverFormsModalOpen && !!handoverTask && !!handoverContext}
            loading={handoverLoading}
            taskName={String(handoverTask?.name || handoverTask?.title || 'مرحله')}
            sourceStageName={String(handoverContext?.sourceStageName || 'شروع تولید')}
            summaries={handoverSummaryRows}
            forms={handoverFormRows}
            selectedFormId={activeHandoverFormId}
            onSelectForm={(formId) => setActiveHandoverFormId(formId)}
            onCreateForm={handleCreateHandoverForm}
            onOpenSelectedForm={() => openHandoverEditorForForm(activeHandoverFormId)}
            onClose={closeHandoverModal}
          />

          <TaskHandoverModal
            open={handoverEditorOpen && !!handoverTask && !!handoverContext}
            loading={handoverLoading}
            locked={!!(handoverContext?.giverConfirmation?.confirmed || handoverContext?.receiverConfirmation?.confirmed)}
            task={handoverTask}
            currentUser={{
              id: currentUser.id,
              fullName: currentUser.fullName,
            }}
            taskName={String(handoverTask?.name || handoverTask?.title || 'مرحله')}
            sourceStageName={String(handoverContext?.sourceStageName || 'شروع تولید')}
            giverName={String(handoverContext?.giver?.label || 'تعیین نشده')}
            receiverName={String(handoverContext?.receiver?.label || 'تعیین نشده')}
            groups={handoverGroups}
            shelfOptions={productionShelfOptions}
            targetShelfId={handoverContext?.targetShelfId || null}
            giverConfirmation={handoverContext?.giverConfirmation || { confirmed: false }}
            receiverConfirmation={handoverContext?.receiverConfirmation || { confirmed: false }}
            onCancel={closeHandoverEditor}
            onSave={() => { void saveHandover(); }}
            onToggleGroup={setHandoverGroupCollapsed}
            onConfirmGroup={confirmHandoverGroup}
            onDeliveryRowAdd={addHandoverDeliveryRow}
            onDeliveryRowsDelete={deleteHandoverDeliveryRows}
            onDeliveryRowsTransfer={transferHandoverDeliveryRows}
            onDeliveryRowFieldChange={updateHandoverDeliveryRowField}
            onTargetShelfChange={setHandoverTargetShelf}
            onTargetShelfScan={handleHandoverShelfScan}
            onConfirmGiver={() => { void handleConfirmGiver(); }}
            onConfirmReceiver={() => { void handleConfirmReceiver(); }}
            onTaskUpdated={handleHandoverTaskUpdated}
          />
        </>
      )}
    </div>
  );
};

export default ProductionStagesField;
