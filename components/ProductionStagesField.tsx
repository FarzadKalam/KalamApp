import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Popover, Button, Tooltip, Modal, Form, Input, message, Spin, Select, InputNumber, Space, Checkbox } from 'antd';
import { PlusOutlined, ClockCircleOutlined, UserOutlined, ArrowRightOutlined, OrderedListOutlined, TeamOutlined, CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';
import { toPersianNumber } from '../utils/persianNumberFormatter';
import PersianDatePicker from './PersianDatePicker';
import DynamicSelectField from './DynamicSelectField';
import StageAutomationEditor from './production/StageAutomationEditor';
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
import { toFaErrorMessage } from '../utils/errorMessageFa';
import {
  applyTaskSourceRecordFilter,
  buildTaskSourceInitialValues,
  getMergedTaskTypeOptions,
  getTaskTypeProtectedValues,
} from '../utils/taskMeta';
import { updateTaskStatusWithAutomation } from '../utils/taskUpdateRuntime';
import {
  getProcessAutomationRuleSummary,
  normalizeProcessAutomationRules,
  type ProcessAutomationRule,
} from '../utils/processAutomationTypes';

interface ProductionStagesFieldProps {
  recordId?: string;
  moduleId?: string;
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
  onDraftStagesChange?: (stages: any[]) => void;
  showWageSummary?: boolean;
}

type StageHandoverSide = 'giver' | 'receiver';

type StageAssignee = {
  id: string | null;
  type: 'user' | 'role' | null;
  label: string;
};

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

const ProductionStagesField: React.FC<ProductionStagesFieldProps> = ({ recordId, moduleId, autoOpenTaskId = null, readOnly = false, compact = false, cardCompact = false, allowReportEditInReadOnly = false, lazyLoad = false, onlyLineId = null, onQuantityChange, orderStatus, draftStages, onDraftStagesChange, showWageSummary = false }) => {
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
  const [automationStageTarget, setAutomationStageTarget] = useState<any | null>(null);
  const [isReadyToLoad, setIsReadyToLoad] = useState(!lazyLoad);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isBom = moduleId === 'production_boms';
  const isProcessTemplateModule = moduleId === 'process_templates';
  const isDraftOnlyModule = isBom || isProcessTemplateModule;
  const [currentUser, setCurrentUser] = useState<{ id: string | null; roleId: string | null; fullName: string }>({ id: null, roleId: null, fullName: 'کاربر' });
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
  const [appendProcessModalOpen, setAppendProcessModalOpen] = useState(false);
  const [isStageAutomationModalOpen, setIsStageAutomationModalOpen] = useState(false);
  const [appendProcessTemplateId, setAppendProcessTemplateId] = useState<string | null>(null);
  const [showEmptyProcessDetails, setShowEmptyProcessDetails] = useState(false);
  const [activeProcessGroupMeta, setActiveProcessGroupMeta] = useState<{
    id: string;
    label: string | null;
    templateId: string | null;
    templateName: string | null;
  } | null>(null);
  const [taskTypeOptions, setTaskTypeOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [taskReportDrafts, setTaskReportDrafts] = useState<Record<string, string>>({});
  const [savingReportIds, setSavingReportIds] = useState<Record<string, boolean>>({});
  const autoOpenedTaskIdRef = useRef<string | null>(null);
  const modalSelectProps = useMemo(
    () => ({
      allowClear: true,
      showSearch: true,
      optionFilterProp: 'label' as const,
      getPopupContainer: (node?: HTMLElement | null) => node?.parentElement || document.body,
      placement: 'bottomRight' as const,
    }),
    []
  );
  const taskStatusOptions = useMemo(
    () => (MODULES.tasks?.fields || []).find((field: any) => String(field?.key || '') === 'status')?.options || [],
    []
  );
  const assigneeUserOptions = useMemo(
    () => assignees.users.map((user: any) => ({
      value: String(user.id),
      label: user.display_name || user.full_name || user.email || user.mobile_1 || String(user.id),
    })),
    [assignees.users]
  );
  const assigneeRoleOptions = useMemo(
    () => assignees.roles.map((role: any) => ({
      value: String(role.id),
      label: role.title || role.name || String(role.id),
    })),
    [assignees.roles]
  );
  const stageModalStyles = useMemo(
    () => ({
      header: {
        padding: '16px 20px 12px',
        borderBottom: '1px solid rgba(148, 163, 184, 0.18)',
        background: 'linear-gradient(180deg, rgba(245, 158, 11, 0.12) 0%, rgba(255,255,255,0) 100%)',
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

  const normalizedDraftStages = useMemo(
    () => (Array.isArray(draftStages) ? draftStages : []),
    [draftStages]
  );
  const isProcessRecordModule = (
    moduleId === 'projects'
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
  const getStageProcessGroupMeta = useCallback((stage: any) => {
    const fallbackGroupId = String(stage?.source_template_id || 'default_process_group').trim() || 'default_process_group';
    const groupId = String(stage?.process_group_id || fallbackGroupId).trim() || 'default_process_group';
    const groupLabel = String(stage?.process_group_name || stage?.source_template_name || '').trim() || null;
    const templateId = String(stage?.source_template_id || '').trim() || null;
    const templateName = String(stage?.source_template_name || '').trim() || null;
    return { groupId, groupLabel, templateId, templateName };
  }, []);
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
    const groupId = String(processMeta?.id || '').trim() || null;
    const groupLabel = String(processMeta?.name || '').trim() || null;
    const templateId = String(processMeta?.template_id || '').trim() || null;
    const templateName = String(processMeta?.template_name || '').trim() || null;
    return { groupId, groupLabel, templateId, templateName };
  }, []);

  useEffect(() => {
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
      const { error } = await supabase.from('tasks').insert(payload);
      if (!error) return;
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
  }, [extractMissingColumnNames, isMissingColumnError, removeColumnsFromRows]);
  const updateTaskWithFallback = useCallback(async (taskId: string, patch: Record<string, any>) => {
    let payload = { ...patch };
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
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const { error } = await supabase.from('tasks').update(payload).eq('id', taskId);
      if (!error) return;
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
  }, [extractMissingColumnNames, isMissingColumnError]);

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
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || null;
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
      return [] as any[];
    }
    try {
      setLoading(true);
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
        query = applyTaskSourceRecordFilter(query, moduleId, recordId);
      } else {
        query = applyTaskSourceRecordFilter(query, 'production_orders', recordId);
      }

      const { data, error } = await query.order('sort_order', { ascending: true });

      if (error) throw error;
      const next = data || [];
      setTasks(next);
      return next;
    } catch (error: any) {
      if (String((error as any)?.name || '') === 'AbortError') return [] as any[];
      return [] as any[];
    } finally {
      setLoading(false);
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
      setOpenTaskPopoverId(null);
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
    void openTaskHandoverModal(targetTask, tasks);
  }, [autoOpenTaskId, openTaskHandoverModal, tasks]);

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
    setHandoverEditorOpen(false);
  }, []);

  const closeHandoverModal = useCallback(() => {
    setHandoverFormsModalOpen(false);
    setHandoverEditorOpen(false);
    setHandoverTask(null);
    setHandoverContext(null);
    setHandoverGroups([]);
    setHandoverForms([]);
    setActiveHandoverFormId(null);
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
      production_shelf_id: null,
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

      const payload: any = {
        name: values.name,
        status: 'todo',
        assignee_id: assigneeType === 'user' ? assigneeId : null,
        assignee_role_id: assigneeType === 'role' ? assigneeId : null,
        assignee_type: assigneeType,
        due_date: dueDate,
        description: taskDescription,
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

      if (isProductionOrder) {
        payload.produced_qty = 0;
        payload.production_line_id = activeLineId;
        payload.production_shelf_id = values.production_shelf_id || null;
      } else if (isProcessRecordModule) {
        payload.produced_qty = 0;
        payload.production_line_id = null;
        payload.production_shelf_id = null;
        const currentRecurrence = values?.recurrence_info && typeof values.recurrence_info === 'object'
          ? values.recurrence_info
          : {};
        payload.recurrence_info = {
          ...currentRecurrence,
          ...(taskType ? { task_type: taskType } : {}),
          process_automation_rules: stageAutomationRules,
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

      message.success('مرحله جدید اضافه شد');
      if (draftToCreate?.id && isProcessRecordModule) {
        const nextDrafts = (Array.isArray(draftLocal) ? draftLocal : []).filter(
          (stage: any) => String(stage?.id || '') !== String(draftToCreate.id)
        );
        await saveDraftStages(nextDrafts);
      }
      setIsTaskModalOpen(false);
      taskForm.resetFields();
      setActiveLineId(null);
      setActiveProcessGroupMeta(null);
      setDraftToCreate(null);
      await fetchTasks();
    } catch (error: any) {
      const debugText = String(error?.message || error?.details || error?.hint || '').trim();
      console.error('Task quick-create failed', error);
      message.error(debugText ? `خطا در ثبت مرحله: ${debugText}` : toFaErrorMessage(error, 'خطا در ثبت اطلاعات'));
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      const currentTask = tasks.find((item: any) => String(item?.id) === String(taskId)) || null;
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
          ? { ...item, ...updatedTask }
          : item
      )));
      message.success('وضعیت بروزرسانی شد');
      const nextTasks = await fetchTasks();
      await maybeOpenHandoverByStatus(taskId, newStatus, nextTasks);
    } catch (err: any) {
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
          ? {
              ...row,
              assignee_id: assigneeType === 'user' ? assigneeId : null,
              assignee_role_id: assigneeType === 'role' ? assigneeId : null,
              assignee_type: assigneeType,
            }
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
          ? { ...row, task_report: reportText || null, recurrence_info: nextRecurrence }
          : row
      )));
      message.success('گزارش فعالیت ثبت شد');
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'ثبت گزارش فعالیت ناموفق بود'));
    } finally {
      setSavingReportIds((prev) => ({ ...prev, [taskId]: false }));
    }
  };

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
          ? { ...item, produced_qty: nextProducedQty }
          : item
      )));
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در ثبت مقدار تولید شده'));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done':
      case 'completed':
        return '#10b981';
      case 'review':
        return '#f97316';
      case 'in_progress':
        return '#3b82f6';
      case 'todo':
      case 'pending':
        return '#ef4444';
      default:
        return '#9ca3af';
    }
  };

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

  const getShelfLabel = useCallback((shelfId: string | null | undefined) => {
    if (!shelfId) return 'تعیین نشده';
    const option = productionShelfOptions.find((item) => String(item.value) === String(shelfId));
    return option?.label || String(shelfId);
  }, [productionShelfOptions]);

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

  const renderPopupContent = (task: any) => {
    const canEditTaskStatus = !readOnly || isTaskAssignedToCurrentUser(task);
    const currentAssigneeCombo = task?.assignee_role_id
      ? `role:${String(task.assignee_role_id)}`
      : (task?.assignee_id ? `user:${String(task.assignee_id)}` : undefined);
    const fallback = getTaskOptionalFieldFallback(task);
    const taskTypeValue = String(task?.task_type || fallback.taskType || '').trim() || undefined;
    const reportDraft = taskReportDrafts[String(task.id)] ?? fallback.taskReport;
    const hasWage = task?.wage !== undefined && task?.wage !== null && Number(task.wage) !== 0;
    const hasWeight = task?.weight !== undefined && task?.weight !== null && Number(task.weight) !== 0;

    return (
      <div className="w-80 p-1 font-['Vazirmatn']">
        <div className="flex justify-between items-start mb-3 border-b border-leather-100 pb-2">
          <h4 className="font-bold text-leather-900 dark:text-gray-100 m-0 text-sm line-clamp-2">{task.title || task.name}</h4>
        </div>

        <div className="space-y-3 mb-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-500">مسئول:</span>
            <Select
              size="small"
              value={currentAssigneeCombo}
              onChange={(val) => { void handleTaskAssigneeChange(task, val); }}
              className="w-44"
              disabled={readOnly}
              allowClear
              showSearch
              optionFilterProp="label"
              getPopupContainer={(node) => node?.parentElement || document.body}
              styles={{ popup: { root: { zIndex: 10050 } } }}
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

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-500">وضعیت:</span>
            <Select
              size="small"
              value={task.status}
              onChange={(val) => { void handleStatusChange(task.id, val); }}
              className="w-44"
              disabled={!canEditTaskStatus}
              getPopupContainer={(node) => node?.parentElement || document.body}
              styles={{ popup: { root: { zIndex: 10050 } } }}
              options={[
                { value: 'todo', label: 'انجام نشده' },
                { value: 'in_progress', label: 'در حال انجام' },
                { value: 'review', label: 'بازبینی' },
                { value: 'done', label: 'تکمیل شده' },
              ]}
            />
          </div>

          <div className="space-y-1">
            <span className="text-xs text-gray-500">نوع فعالیت:</span>
            <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-2 py-1 text-xs text-gray-700 dark:text-gray-200">
              {taskTypeValue || '-'}
            </div>
          </div>

          {isProductionOrder && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-500">مقدار تولید شده:</span>
              <InputNumber
                size="small"
                min={0}
                className="w-44 persian-number"
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

          <div className="bg-leather-50/70 dark:bg-[#111827] p-2 rounded-lg border border-leather-100 dark:border-gray-700 space-y-2 text-xs text-gray-700 dark:text-gray-300">
            <div className="flex items-center gap-2">
              <OrderedListOutlined className="text-leather-700" />
              <span>ترتیب: {toPersianNumber(task.sort_order || '-')}</span>
            </div>
            <div className="flex items-center gap-2">
              {task.assignee_type === 'role' ? <TeamOutlined className="text-leather-700" /> : <UserOutlined className="text-leather-700" />}
              <span>مسئول: {getAssigneeLabel(task)}</span>
            </div>
            {isProductionOrder && task.production_shelf_id && (
              <div className="flex items-center gap-2">
                <span className="text-leather-700">قفسه:</span>
                <span>{getShelfLabel(task.production_shelf_id)}</span>
              </div>
            )}
            {hasWage && (
              <div className="flex items-center gap-2">
                <span className="text-leather-700">💰</span>
                <span>دستمزد: {toPersianNumber(Number(task.wage || 0).toLocaleString('en-US'))} تومان</span>
              </div>
            )}
            {hasWeight && (
              <div className="flex items-center gap-2">
                <span className="text-leather-700">وزن:</span>
                <span>{toPersianNumber(task.weight)}</span>
              </div>
            )}
            {task.due_date && (
              <div className="flex items-center gap-2">
                <ClockCircleOutlined className="text-leather-700" />
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

        <div className="flex justify-between pt-2 border-t border-leather-100">
          {supportsHandover ? (
            <Button
              size="small"
              type="link"
              className="text-xs text-leather-700 hover:text-leather-600 px-0"
              onClick={() => {
                setOpenTaskPopoverId(null);
                void openTaskHandoverModal(task);
              }}
            >
              فرم‌های تحویل کالا
            </Button>
          ) : (
            <span />
          )}
          <Link to={`/tasks/${task.id}`} target="_blank">
            <Button size="small" type="link" icon={<ArrowRightOutlined />} className="text-xs text-leather-700 hover:text-leather-600">
              جزئیات کامل
            </Button>
          </Link>
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

  const saveDraftStages = async (nextStages: any[]) => {
    setDraftLocal(nextStages);
    if (onDraftStagesChange) onDraftStagesChange(nextStages);
    if (moduleId === 'production_boms' && recordId) {
      await supabase.from('production_boms').update({ production_stages_draft: nextStages }).eq('id', recordId);
    }
  };

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
        .select('id,name,module_id,is_active')
        .order('name', { ascending: true });
      if (!primary.error) {
        rows = primary.data || [];
      } else {
        const fallback = await supabase
          .from('process_templates')
          .select('id,name,module_id')
          .order('name', { ascending: true });
        if (fallback.error) throw fallback.error;
        rows = fallback.data || [];
      }

      const activeRows = rows.filter((row: any) => row?.is_active !== false);
      const scopedRows = activeRows.filter((row: any) => {
        const rowModule = String(row?.module_id || '').trim();
        return !rowModule || rowModule === targetModule;
      });
      const sourceRows = scopedRows.length > 0 ? scopedRows : activeRows;

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

  const handleOpenAppendProcessModal = useCallback(async () => {
    if (!isProcessRecordModule || readOnly) return;
    setAppendProcessTemplateId(null);
    setAppendProcessModalOpen(true);
    await loadProcessTemplateOptions();
  }, [isProcessRecordModule, loadProcessTemplateOptions, readOnly]);

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
  }, [appendProcessTemplateId, buildProcessGroupId, draftLocal, processTemplateOptions, saveDraftStages]);

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

  const handleDeleteProcessGroup = useCallback(async (groupId: string) => {
    const normalizedGroupId = String(groupId || '').trim();
    if (!normalizedGroupId) return;
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
  }, [draftLocal, getStageProcessGroupMeta, saveDraftStages]);

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
      const buildStageTaskKey = (groupIdValue: any, nameValue: any, sortOrderValue: any) => {
        const normalizedGroupId = String(groupIdValue || 'default_process_group').trim() || 'default_process_group';
        const normalizedName = String(nameValue || '').trim().toLowerCase();
        const normalizedSort = Number(sortOrderValue || 0);
        return `${normalizedGroupId}::${normalizedName}::${normalizedSort}`;
      };
      stageRows.forEach((stage: any) => {
        const normalizedName = String(stage?.name || stage?.title || '').trim().toLowerCase();
        if (!normalizedName) return;
        const { groupId } = getStageProcessGroupMeta(stage);
        const dueAt = computeStageDueAt(stage, baseDate, previousDueAt);
        if (dueAt) previousDueAt = dueAt;
        dueByStageKey.set(
          buildStageTaskKey(groupId, normalizedName, stage?.sort_order),
          dueAt ? dueAt.toISOString() : null
        );
      });

      const existingByStageKey = new Set(
        (Array.isArray(tasks) ? tasks : [])
          .filter((task: any) => processTaskModules.has(String(task?.related_to_module || '')))
          .map((task: any) => {
            const taskMeta = getTaskProcessGroupMeta(task);
            return buildStageTaskKey(
              taskMeta.groupId || 'default_process_group',
              task?.name || task?.title || '',
              task?.sort_order
            );
          })
          .filter(Boolean)
      );

      const payload = stageRows
        .filter((stage: any) => {
          const stageName = String(stage?.name || stage?.title || '').trim();
          const stageMeta = getStageProcessGroupMeta(stage);
          const stageKey = buildStageTaskKey(stageMeta.groupId, stageName, stage?.sort_order);
          if (!stageName || existingByStageKey.has(stageKey)) return false;
          existingByStageKey.add(stageKey);
          return true;
        })
        .map((stage: any, index: number) => {
          const stageName = String(stage?.name || stage?.title || `مرحله ${index + 1}`).trim();
          const normalized = stageName.toLowerCase();
          const stageMeta = getStageProcessGroupMeta(stage);
          const assignee = parseStageAssignee(stage);
          const recurrenceBase = stage?.recurrence_info && typeof stage.recurrence_info === 'object'
            ? stage.recurrence_info
            : {};
          const stageTaskType = String(stage?.task_type || '').trim() || null;
          const stageDescription = String(stage?.description || '').trim() || null;
          const stageAutomationRules = normalizeProcessAutomationRules(stage?.automation_rules);
          const taskRow: any = {
            name: stageName,
            status: 'todo',
            source_template_id: stageMeta.templateId,
            source_stage_sort_order: Number(stage?.sort_order || ((index + 1) * 10)),
            process_group_id: stageMeta.groupId,
            production_line_id: null,
            production_shelf_id: null,
            produced_qty: 0,
            description: stageDescription,
            task_type: stageTaskType,
            assignee_type: assignee.assigneeType,
            assignee_id: assignee.assigneeType === 'user' ? assignee.assigneeId : null,
            assignee_role_id: assignee.assigneeType === 'role' ? assignee.assigneeId : null,
            wage: Number(stage?.wage || 0),
            weight: Number(stage?.weight || 0),
            sort_order: Number(stage?.sort_order || ((index + 1) * 10)),
            due_date: dueByStageKey.get(buildStageTaskKey(stageMeta.groupId, normalized, stage?.sort_order)) || null,
            created_by: userId,
            recurrence_info: {
              ...recurrenceBase,
              ...(stageTaskType ? { task_type: stageTaskType } : {}),
              process_automation_rules: stageAutomationRules,
              process_group: {
                id: stageMeta.groupId,
                name: stageMeta.groupLabel,
                template_id: stageMeta.templateId,
                template_name: stageMeta.templateName,
              },
            },
            ...buildTaskSourceInitialValues(moduleId, recordId),
          };
          return taskRow;
        });

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
    computeStageDueAt,
    draftLocal,
    fetchTasks,
    getStageProcessGroupMeta,
    getTaskProcessGroupMeta,
    getProcessBaseDate,
    insertTasksWithFallback,
    isProcessRecordModule,
    moduleId,
    parseStageAssignee,
    processTaskModules,
    recordId,
    tasks,
  ]);

  const handleAddDraftStage = async (values: any) => {
    const assigneeRaw = String(values?.default_assignee_combo || '');
    const assigneeType = assigneeRaw.startsWith('role:') ? 'role' : (assigneeRaw.startsWith('user:') ? 'user' : null);
    const assigneeId = assigneeType ? assigneeRaw.split(':')[1] : null;
    const automationRules = normalizeProcessAutomationRules(draftAutomationRules);
    let next = [...draftLocal];
    if (editingDraft?.id) {
      next = next.map((stage: any) =>
        stage.id === editingDraft.id
          ? {
              ...stage,
              name: values.name,
              description: String(values?.description || '').trim() || null,
              task_type: String(values?.task_type || '').trim() || null,
              sort_order: values.sort_order || stage.sort_order,
              wage: Number(values?.wage || 0),
              weight: Number(values?.weight || 0),
              default_assignee_id: assigneeType === 'user' ? assigneeId : null,
              default_assignee_role_id: assigneeType === 'role' ? assigneeId : null,
              duration_value: Number(values?.duration_value || 0),
              duration_unit: values?.duration_unit || 'day',
              duration_from: values?.duration_from || 'project_start',
              automation_rules: automationRules,
            }
          : stage
      );
    } else {
      next.push({
        id: Date.now(),
        name: values.name,
        description: String(values?.description || '').trim() || null,
        task_type: String(values?.task_type || '').trim() || null,
        sort_order: values.sort_order || ((draftLocal.length + 1) * 10),
        wage: Number(values?.wage || 0),
        weight: Number(values?.weight || 0),
        default_assignee_id: assigneeType === 'user' ? assigneeId : null,
        default_assignee_role_id: assigneeType === 'role' ? assigneeId : null,
        duration_value: Number(values?.duration_value || 0),
        duration_unit: values?.duration_unit || 'day',
        duration_from: values?.duration_from || 'project_start',
        automation_rules: automationRules,
      });
    }
    await saveDraftStages(next);
    setIsDraftModalOpen(false);
    setEditingDraft(null);
    setAutomationStageTarget(null);
    draftForm.resetFields();
  };

  const openStageAutomationEditor = useCallback((stage?: any | null) => {
    const nextStage = stage || null;
    setAutomationStageTarget(nextStage);
    setDraftAutomationRules(normalizeProcessAutomationRules(nextStage?.automation_rules));
    setIsStageAutomationModalOpen(true);
  }, []);

  const handleSaveStageAutomationRules = useCallback(async (rules: ProcessAutomationRule[]) => {
    if (automationStageTarget?.id) {
      const nextStages = (Array.isArray(draftLocal) ? draftLocal : []).map((stage: any) => (
        String(stage?.id || '') === String(automationStageTarget.id)
          ? { ...stage, automation_rules: rules }
          : stage
      ));
      await saveDraftStages(nextStages);
      if (editingDraft?.id && String(editingDraft.id) === String(automationStageTarget.id)) {
        setEditingDraft((prev: any) => (prev ? { ...prev, automation_rules: rules } : prev));
      }
    } else {
      setDraftAutomationRules(rules);
    }
    setAutomationStageTarget(null);
    setIsStageAutomationModalOpen(false);
  }, [automationStageTarget, draftLocal, editingDraft?.id, saveDraftStages]);

  const handleRemoveDraftStage = async (id: any) => {
    Modal.confirm({
      title: 'حذف مرحله پیش‌نویس',
      content: 'آیا از حذف این مرحله پیش‌نویس مطمئن هستید؟',
      okText: 'حذف',
      okType: 'danger',
      cancelText: 'انصراف',
      onOk: async () => {
        const next = draftLocal.filter((s: any) => s.id !== id);
        await saveDraftStages(next);
      },
    });
  };

  useEffect(() => {
    if (!isDraftModalOpen) return;
    if (editingDraft) {
      const assigneeCombo = editingDraft?.default_assignee_role_id
        ? `role:${String(editingDraft.default_assignee_role_id)}`
        : (editingDraft?.default_assignee_id ? `user:${String(editingDraft.default_assignee_id)}` : undefined);
      draftForm.setFieldsValue({
        name: editingDraft.name,
        description: editingDraft.description || '',
        task_type: editingDraft.task_type || undefined,
        sort_order: editingDraft.sort_order,
        wage: editingDraft.wage || 0,
        weight: editingDraft.weight || 0,
        default_assignee_combo: assigneeCombo,
        duration_value: editingDraft.duration_value || 0,
        duration_unit: editingDraft.duration_unit || 'day',
        duration_from: editingDraft.duration_from || 'project_start',
      });
      setDraftAutomationRules(normalizeProcessAutomationRules(editingDraft?.automation_rules));
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
      });
      setDraftAutomationRules([]);
    }
  }, [isDraftModalOpen, editingDraft, draftForm, draftLocal.length]);

  const normalizeStageName = (val: any) => String(val || '').trim().toLowerCase();
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
      if (!groups.length) {
        groups.push({ id: 'default_process_group', label: '', templateId: null, templateName: null, stages: [], tasks: remainingTasks });
      } else {
        groups[0] = { ...groups[0], tasks: [...groups[0].tasks, ...remainingTasks] };
      }
    }

    return groups.map((group) => ({
      ...group,
      lineSegments: getLineSegments(group.tasks, group.stages),
    }));
  };

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
          {isProcessTemplateModule && (
            <div className="rounded-2xl border border-[rgba(var(--brand-200-rgb),0.75)] bg-[rgba(var(--brand-50-rgb),0.55)] p-4 shadow-sm dark:border-[rgba(var(--brand-300-rgb),0.2)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.58)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">اتوماسیون مراحل الگو</div>
                  <div className="text-xs leading-6 text-gray-500 dark:text-gray-400">
                    قانون‌های هر مرحله از همین الگو ذخیره می‌شوند و بعدا چه در کپی از الگو و چه در اجرای خودکار فرآیند، همراه همان مرحله به فعالیت‌های ساخته‌شده منتقل می‌شوند.
                  </div>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100">
                  مجموع قوانین: {toPersianNumber(
                    draftSegments.reduce((sum: number, stage: any) => sum + normalizeProcessAutomationRules(stage?.automation_rules).length, 0)
                  )}
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                {draftSegments.length > 0 ? draftSegments.map((stage: any) => {
                  const automationCount = normalizeProcessAutomationRules(stage?.automation_rules).length;
                  return (
                    <div
                      key={`template-auto-${stage.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/70 bg-white/80 px-3 py-2 dark:border-white/10 dark:bg-white/5"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{stage.label}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {automationCount > 0
                            ? `${toPersianNumber(automationCount)} قانون ثبت شده`
                            : 'هنوز اتوماسیونی برای این مرحله ثبت نشده است'}
                        </div>
                      </div>
                      {!readOnly ? (
                        <Button
                          size="small"
                          className="rounded-xl"
                          onClick={() => { void openStageAutomationEditor(stage); }}
                        >
                          {automationCount > 0 ? 'مدیریت اتوماسیون' : 'افزودن اتوماسیون'}
                        </Button>
                      ) : null}
                    </div>
                  );
                }) : (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    بعد از افزودن مرحله، تنظیم اتوماسیون هر مرحله از همین بخش در دسترس خواهد بود.
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {isProcessTemplateModule ? 'مراحل پیش‌نویس فرآیند' : 'مراحل پیش‌نویس (BOM)'}
          </div>
          <div className={`flex-1 flex bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 ${compact ? 'h-5' : 'h-9'}`}>
            {draftSegments.length > 0 ? (
              draftSegments.map((stage: any, index: number) => (
                <Popover
                  key={stage.id || index}
                  content={
                    <div className="space-y-2 text-xs p-1">
                      <div className="font-bold text-leather-900 dark:text-gray-100">{stage.label}</div>
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
                          <Button size="small" onClick={() => { setEditingDraft(stage); setIsDraftModalOpen(true); }}>ویرایش</Button>
                          {isProcessTemplateModule && (
                            <Button size="small" onClick={() => { void openStageAutomationEditor(stage); }}>اتوماسیون</Button>
                          )}
                          <Button size="small" danger onClick={() => handleRemoveDraftStage(stage.id)}>حذف</Button>
                        </div>
                      )}
                    </div>
                  }
                  trigger="click"
                  overlayStyle={{ zIndex: 10000 }}
                >
                  <div
                    className={`relative flex items-center justify-center cursor-pointer transition-all group ${index !== 0 ? 'border-r border-gray-200/70 dark:border-gray-700/80' : ''}`}
                    style={{ flex: 1, border: '1px dashed #d1d5db', backgroundColor: 'transparent' }}
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
                  onClick={() => { setEditingDraft(null); setIsDraftModalOpen(true); }}
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
                  const segmentColor = getStatusColor(segment.status);
                  return (
                    <Popover
                      key={`${barKey}-task-${segment.id}`}
                      content={renderPopupContent(segment)}
                      trigger={(compact && !(readOnly && allowReportEditInReadOnly)) ? 'hover' : 'click'}
                      open={((compact && !(readOnly && allowReportEditInReadOnly)) ? undefined : (openTaskPopoverId === String(segment.id)))}
                      onOpenChange={(open) => {
                        if (compact && !(readOnly && allowReportEditInReadOnly)) return;
                        setOpenTaskPopoverId(open ? String(segment.id) : null);
                      }}
                      overlayStyle={{ zIndex: 10000 }}
                      title={null}
                    >
                      <div
                        className={`relative flex items-center justify-center cursor-pointer transition-all hover:brightness-110 group ${index !== 0 ? 'border-r border-gray-200/70 dark:border-gray-700/80' : ''} ${index === 0 ? 'rounded-r-lg' : ''} ${index === displaySegments.length - 1 && hiddenCount === 0 ? 'rounded-l-lg' : ''} ${isHighlightedTask ? 'z-10' : ''}`}
                        style={{
                          flex: 1,
                          backgroundColor: segmentColor,
                          boxShadow: isHighlightedTask
                            ? `0 0 8px ${segmentColor}66, 0 0 16px ${segmentColor}4D, 0 0 24px ${segmentColor}33`
                            : undefined,
                        }}
                        >
                        <div className="flex flex-col items-center justify-center w-full px-1 overflow-hidden">
                          <span className={`text-white font-medium truncate w-full text-center drop-shadow-md ${compact ? 'text-[9px]' : 'text-[11px]'}`}>
                            {shouldCompactSegments ? getCompactLabel(segment.title || segment.name) : (segment.title || segment.name)}
                          </span>
                          {!compact && segment.sort_order && (
                            <span className="text-[8px] text-white/90 absolute bottom-0.5 right-1 bg-black/10 px-1 rounded-sm">
                              {toPersianNumber(segment.sort_order)}
                            </span>
                          )}
                        </div>
                      </div>
                    </Popover>
                  );
                })()
              ) : (
                <Popover
                  key={`${barKey}-draft-${segment.id}-${index}`}
                  content={
                    <div className="space-y-2 text-xs p-1">
                      <div className="font-bold text-leather-900 dark:text-gray-100">{segment.label}</div>
                      <div>ترتیب: {toPersianNumber(segment.sort_order || '-')}</div>
                      <div>دستمزد: {toPersianNumber(Number(segment.wage || 0).toLocaleString('en-US'))} تومان</div>
                      <div>وزن: {toPersianNumber(segment.weight || 0)}</div>
                      <div>مسئول: {getDraftAssigneeLabel(segment)}</div>
                      {String(segment?.task_type || '').trim() && <div>نوع فعالیت: {segment.task_type}</div>}
                      {String(segment?.description || '').trim() && <div>توضیحات: {segment.description}</div>}
                      <div>اتوماسیون‌ها: {toPersianNumber(normalizeProcessAutomationRules(segment?.automation_rules).length || 0)}</div>
                      <div>زمان انجام: {formatDraftDuration(segment)}</div>
                      {!readOnly && (
                        <div className="flex items-center gap-2">
                          {recordId && (
                            <Button
                              size="small"
                              onClick={() => openTaskModal(line.id, segment)}
                              className="border-leather-300 text-leather-700 hover:!border-leather-500 hover:!text-leather-600 hover:!bg-leather-50"
                            >
                              ایجاد فعالیت
                            </Button>
                          )}
                          <Button
                            size="small"
                            onClick={() => { void openStageAutomationEditor(segment); }}
                          >
                            اتوماسیون
                          </Button>
                          <Button
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => handleRemoveDraftStage(segment.id)}
                          >
                            حذف
                          </Button>
                        </div>
                      )}
                    </div>
                  }
                  trigger={compact ? 'hover' : 'click'}
                  overlayStyle={{ zIndex: 10000 }}
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
                <span className="font-bold">
                  {isProcessModule
                    ? processTitle
                    : `خط ${toPersianNumber(line.line_no)}${compact ? `: ${toPersianNumber(line.quantity || 0)} عدد` : ''}`}
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
                {isProcessEmptyState && !showEmptyProcessDetails ? (
                  <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">فرآیندی ثبت نشده است</span>
                    <div className="flex items-center gap-2">
                      {!readOnly && !!recordId && (
                        <Button
                          size={compact ? 'small' : 'middle'}
                          onClick={() => { void handleOpenAppendProcessModal(); }}
                          className="border-leather-300 text-leather-700 hover:!border-leather-500 hover:!text-leather-600 hover:!bg-leather-50"
                        >
                          افزودن فرآیند
                        </Button>
                      )}
                      <Button
                        size={compact ? 'small' : 'middle'}
                        onClick={() => setShowEmptyProcessDetails(true)}
                      >
                        نمایش جزئیات
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {normalizedProcessLineGroups.map((group: any, groupIndex: number) => (
                      <div key={`${line.id}-${group.id}-${groupIndex}`} className="space-y-1">
                        {!readOnly && !!recordId && (
                          <div className="flex flex-wrap items-end gap-2">
                            <div className="min-w-[220px] flex-1 max-w-[360px]">
                              <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">
                                الگوی فرآیند اجرا
                              </div>
                              <Select
                                value={group?.templateId || undefined}
                                onChange={(val) => {
                                  if (!val) return;
                                  void handleApplyTemplateToGroup(String(group?.id || ''), String(val));
                                }}
                                options={processTemplateOptions}
                                showSearch
                                optionFilterProp="label"
                                loading={processTemplateOptionsLoading}
                                className="w-full"
                                placeholder="انتخاب الگوی فرآیند"
                              />
                            </div>
                            <Button
                              size={compact ? 'small' : 'middle'}
                              onClick={() => { void handleAutoAssignProcess(String(group?.id || '')); }}
                              className="border-leather-300 text-leather-700 hover:!border-leather-500 hover:!text-leather-600 hover:!bg-leather-50"
                              disabled={!Array.isArray(group?.stages) || group.stages.length === 0}
                            >
                              ارجاع خودکار فرآیند
                            </Button>
                            <Tooltip title="کپی فرآیند">
                              <Button
                                size={compact ? 'small' : 'middle'}
                                icon={<CopyOutlined />}
                                onClick={() => { void handleCopyProcessGroup(String(group?.id || '')); }}
                                disabled={!Array.isArray(group?.stages) || group.stages.length === 0}
                              />
                            </Tooltip>
                            <Tooltip title="حذف فرآیند">
                              <Button
                                danger
                                size={compact ? 'small' : 'middle'}
                                icon={<DeleteOutlined />}
                                onClick={() => {
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
                                disabled={!Array.isArray(group?.stages) || group.stages.length === 0}
                              />
                            </Tooltip>
                          </div>
                        )}
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
                                className="flex-shrink-0 border-leather-300 text-leather-700 hover:!border-leather-500 hover:!text-leather-600 hover:!bg-leather-50"
                              />
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!readOnly && !!recordId && (
                  <div className="flex justify-start">
                    <Button
                      size={compact ? 'small' : 'middle'}
                      onClick={() => {
                        setShowEmptyProcessDetails(true);
                        void handleOpenAppendProcessModal();
                      }}
                      className="border-leather-300 text-leather-700 hover:!border-leather-500 hover:!text-leather-600 hover:!bg-leather-50"
                    >
                      افزودن فرآیند جدید
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
                        className="flex-shrink-0 border-leather-300 text-leather-700 hover:!border-leather-500 hover:!text-leather-600 hover:!bg-leather-50"
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
        title={<div className="flex items-center gap-2 text-leather-800"><div className="bg-leather-50 p-1 rounded text-leather-600"><PlusOutlined /></div> {isProcessModule ? 'افزودن مرحله فرآیند (فعالیت)' : 'افزودن مرحله تولید'}</div>}
        open={isTaskModalOpen}
        onCancel={() => setIsTaskModalOpen(false)}
        footer={null}
        zIndex={10001}
        width={480}
        centered
        destroyOnHidden
        styles={stageModalStyles}
      >
        <Form form={taskForm} onFinish={handleAddTask} layout="vertical" className="pt-1">
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-9">
              <Form.Item name="name" label="عنوان مرحله" rules={[{ required: true, message: 'الزامی' }]}> 
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
              <Form.Item name="description" label="توضیحات">
                <Input.TextArea placeholder="شرح مرحله/فعالیت" autoSize={{ minRows: 2, maxRows: 4 }} />
              </Form.Item>
            </div>

            {isProductionOrder && (
              <div className="col-span-12">
                <Form.Item name="production_shelf_id" label="قفسه مرحله">
                  <Select
                    placeholder="انتخاب قفسه از انبار تولید"
                    options={productionShelfOptions}
                    {...modalSelectProps}
                  />
                </Form.Item>
              </div>
            )}

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

          <div className="flex justify-end gap-2 mt-4 border-t pt-4">
            <Button onClick={() => setIsTaskModalOpen(false)} className="rounded-lg">انصراف</Button>
            <Button type="primary" htmlType="submit" loading={loading} className="rounded-lg bg-leather-600 hover:!bg-leather-500 border-none shadow-md">
              ثبت مرحله
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title={<div className="flex items-center gap-2 text-amber-800"><div className="bg-amber-50 p-1 rounded text-amber-600"><PlusOutlined /></div> {editingDraft ? 'ویرایش مرحله پیش‌نویس' : (isProcessModule ? 'افزودن مرحله پیش‌نویس فرآیند' : 'افزودن مرحله پیش‌نویس')}</div>}
        open={isDraftModalOpen}
        onCancel={() => {
          setIsDraftModalOpen(false);
          setEditingDraft(null);
          setAutomationStageTarget(null);
          setIsStageAutomationModalOpen(false);
          setDraftAutomationRules([]);
          draftForm.resetFields();
        }}
        footer={null}
        zIndex={10001}
        width={460}
        centered
        destroyOnHidden
        styles={stageModalStyles}
      >
        <Form form={draftForm} onFinish={handleAddDraftStage} layout="vertical" className="pt-1">
          <div className="mb-4 rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-xs leading-6 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
            این مرحله فقط در پیش‌نمایش الگو ذخیره می‌شود. بعدا موقع ساخت یا کپی فرآیند، همین تنظیمات برای ایجاد فعالیت‌ها استفاده می‌شود.
          </div>
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-9">
              <Form.Item name="name" label="عنوان مرحله" rules={[{ required: true, message: 'الزامی' }]}> 
                <Input placeholder="مثلا: برشکاری..." />
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
                  <Form.Item name="description" label="توضیحات">
                    <Input.TextArea placeholder="توضیحات مرحله پیش‌نویس" autoSize={{ minRows: 2, maxRows: 4 }} />
                  </Form.Item>
                </div>
                <div className="col-span-12">
                  <div className="rounded-2xl border border-[rgba(var(--brand-200-rgb),0.75)] bg-[rgba(var(--brand-50-rgb),0.6)] px-4 py-3 dark:border-[rgba(var(--brand-300-rgb),0.22)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.6)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-100">اتوماسیون‌های این مرحله</div>
                        <div className="mt-1 text-xs leading-6 text-gray-500 dark:text-gray-400">
                          برای مرحله می‌توانی قانون‌های سبک تعریف کنی تا هنگام تغییر وضعیت فعالیت، روی رکورد مرتبط یادداشت و منشن خودکار ثبت شود.
                        </div>
                      </div>
                      <Button
                        type="default"
                        className="shrink-0 rounded-xl"
                        onClick={() => {
                          setAutomationStageTarget(null);
                          setIsStageAutomationModalOpen(true);
                        }}
                      >
                        تنظیم اتوماسیون
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {draftAutomationRules.length > 0 ? draftAutomationRules.map((rule) => (
                        <span
                          key={rule.id}
                          className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100"
                        >
                          {getProcessAutomationRuleSummary(rule)}
                        </span>
                      )) : (
                        <span className="text-xs text-gray-500 dark:text-gray-400">هنوز قانونی برای این مرحله ثبت نشده است.</span>
                      )}
                    </div>
                  </div>
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

          <div className="flex justify-end gap-2 mt-4 border-t pt-4">
            <Button onClick={() => {
              setIsDraftModalOpen(false);
              setEditingDraft(null);
              setAutomationStageTarget(null);
              setIsStageAutomationModalOpen(false);
              setDraftAutomationRules([]);
              draftForm.resetFields();
            }} className="rounded-lg">انصراف</Button>
            <Button type="primary" htmlType="submit" className="rounded-lg bg-amber-700 hover:!bg-amber-600 border-none shadow-md">
              {editingDraft ? 'بروزرسانی مرحله' : 'ثبت مرحله'}
            </Button>
          </div>
        </Form>
      </Modal>

      <StageAutomationEditor
        open={isStageAutomationModalOpen}
        value={draftAutomationRules}
        statusOptions={taskStatusOptions}
        taskTypeOptions={taskTypeOptions}
        userOptions={assigneeUserOptions}
        roleOptions={assigneeRoleOptions}
        onCancel={() => {
          setAutomationStageTarget(null);
          setIsStageAutomationModalOpen(false);
        }}
        onSave={(rules) => { void handleSaveStageAutomationRules(rules); }}
      />

      <Modal
        title="افزودن فرآیند جدید"
        open={appendProcessModalOpen}
        onCancel={() => {
          setAppendProcessModalOpen(false);
          setAppendProcessTemplateId(null);
        }}
        footer={[
          <Button key="raw" onClick={() => { void handleCreateRawProcessGroup(); }} loading={loading}>
            ایجاد فرآیند خام
          </Button>,
          <Button key="cancel" onClick={() => { setAppendProcessModalOpen(false); setAppendProcessTemplateId(null); }}>
            انصراف
          </Button>,
          <Button
            key="add"
            type="primary"
            className="bg-leather-600 hover:!bg-leather-500 border-none"
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
            یک الگو انتخاب کنید تا یک نوار فرآیند جدید ساخته شود.
          </div>
          <Select
            value={appendProcessTemplateId || undefined}
            onChange={(val) => setAppendProcessTemplateId(val)}
            options={processTemplateOptions}
            placeholder="انتخاب الگوی فرآیند"
            showSearch
            optionFilterProp="label"
            loading={processTemplateOptionsLoading}
            className="w-full"
            allowClear
          />
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
          />
        </>
      )}
    </div>
  );
};

export default ProductionStagesField;
