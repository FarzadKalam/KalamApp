import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Popover, Button, Tooltip, Modal, Form, Input, message, Spin, Select, InputNumber, Space, Checkbox, Steps, Switch, Alert, Empty, Tag, Radio, Grid, Segmented, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { PlusOutlined, ClockCircleOutlined, UserOutlined, ArrowRightOutlined, ArrowLeftOutlined, UpOutlined, DownOutlined, OrderedListOutlined, TeamOutlined, CopyOutlined, DeleteOutlined, EditOutlined, SettingOutlined, SaveOutlined, LinkOutlined, HourglassOutlined, CheckOutlined, CloseOutlined, SnippetsOutlined, InfoCircleOutlined, ApartmentOutlined, UnorderedListOutlined, ThunderboltOutlined, DragOutlined, MoreOutlined, ColumnWidthOutlined, CompressOutlined } from '@ant-design/icons';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { supabase } from '../supabaseClient';
import { safeJalaliFormat, toPersianNumber } from '../utils/persianNumberFormatter';
import PersianDatePicker from './PersianDatePicker';
import AdaptiveSelectField from './AdaptiveSelectField';
import DynamicSelectField from './DynamicSelectField';
import SmartFieldRenderer from './SmartFieldRenderer';
import RecordImageBox from './RecordImageBox';
import TaskActionButtons from './tasks/TaskActionButtons';
import TaskStatusIcon from './tasks/TaskStatusIcon';
import RecordLockControl from './recordLocks/RecordLockControl';
import ProfileAvatar from './common/ProfileAvatar';
import type { StageHandoverConfirm, StageHandoverGroup, StageHandoverDeliveryRow } from './production/TaskHandoverModal';
import type {
  StageHandoverFormListRow,
  StageHandoverSummaryRow,
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
import OverlayEventBoundary from './OverlayEventBoundary';
import {
  buildStandardSelectPopupRootStyle,
  resolveOverlayPopupContainer,
  resolveParentOverlayZIndex,
  resolveSelectPopupContainer,
  resolveStableOverlayRoot,
} from '../utils/popupContainer';
import {
  applyTaskSourceRecordFilter,
  buildTaskSourcePatch,
  buildTaskSourceInitialValues,
  getMergedTaskTypeOptions,
  getTaskTypeProtectedValues,
  resolveTaskSourceLink,
} from '../utils/taskMeta';
import { TASK_AUTOMATION_SELECT, updateTaskStatusWithAutomation } from '../utils/taskUpdateRuntime';
import { syncProjectStatusWithProcessState } from '../utils/projectProcessStatus';
import {
  createProcessStageRecipientFieldKey,
  createDefaultProcessAutomationRule,
  extractRuleNoteTextFromActions,
  filterEditableAutomationConditions,
  getProcessAutomationRuleSummary,
  normalizeProcessAutomationRules,
  PROCESS_AUTOMATION_LEGACY_PREVIOUS_STAGE_TRIGGER_OPTION,
  type ProcessAutomationRule,
} from '../utils/processAutomationTypes';
import {
  persistWorkflowViewMode,
  readStoredWorkflowViewMode,
  type WorkflowEditorViewMode,
} from './workflows/flow/viewModePreference';
import { openTaskProcessModal } from '../utils/taskProcessModalEvents';
import { fetchAssigneeDirectory, fetchDynamicOptionsByCategory } from '../utils/referenceData';
import { fetchRelationOptionsForField } from '../utils/relationOptions';
import { fetchSessionBootstrap } from '../utils/sessionCache';
import { fetchProcessRuntimeBatchForRecord } from '../utils/processRuntimeBatch';
import { getProcessAutomationConditionFieldsForModules, getProjectModuleOptions, getSyntheticWorkflowAssigneeField, getVisibleWorkflowModuleFields } from '../utils/workflowHelpers';
import {
  WORKFLOW_ASSIGNEE_FIELD_KEY,
  createWorkflowId,
  createProcessNextStageFieldKey,
  intervalUnitOptions,
  parseWorkflowRelatedFieldKey,
  triggerTypeOptions,
  type WorkflowActionType,
  type WorkflowCondition,
  type WorkflowExecutionMode,
  type WorkflowRecord,
  workflowExecutionModeOptions,
} from '../utils/workflowTypes';
import WorkflowIntervalScheduleFields, {
  type WorkflowIntervalFieldNames,
} from './workflows/WorkflowIntervalScheduleFields';
import { fetchRecordLockState, getRecordLockStateFromRecord, mergeRecordLockIntoRecord, type RecordLockState } from '../utils/recordLockRuntime';
import HelpHint from './HelpHint';
import {
  buildProcessLinkMapFromRecord,
  createProcessLinkedFieldKey,
  doesProcessTemplateSupportModule,
  extractProcessLinkMapFromStages,
  getProcessTargetModuleFields,
  mergeProcessLinkMaps,
  normalizeProcessActivatorTriggerModuleIds,
  normalizeProcessTargetModuleIds,
  parseProcessLinkMap,
  syncProcessTemplateTargetModules,
} from '../utils/processTargets';
import {
  assignProcessTaskCustomFieldOrder,
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
  PROCESS_TASK_STATUS_COLOR_META,
  PROCESS_TASK_STATUS_ICON_OPTIONS,
  PROCESS_TASK_STATUS_OPTIONS_KEY,
  PROCESS_TASK_STATUS_START_ANCHOR,
} from '../utils/processTaskStatusOptions';
import {
  buildAssigneeSelectValue,
  buildResolvedAssigneeCombo,
  isAssigneeOrgBoundaryError,
  normalizeTaskAssigneeRowsForDirectory,
  parseAssigneeValue,
  stripTaskAssignee,
} from '../utils/assigneeValue';
import { fileStorageClient, FILE_STORAGE_BUCKET } from '../utils/storageClient';
import { isUploadCanceledError, uploadFileWithProgress } from '../utils/uploadFileWithProgress';
import { createFileManagerOriginForUpload, detectFileManagerTables } from '../utils/fileManagerService';
import { getRecordTitle } from '../utils/recordTitle';
import { getFieldLabelFa } from '../utils/fieldLabel';
import { canUseRecordLockPermission, fetchCurrentUserRoleContext, resolveFilesAccessPermissions, type PermissionMap } from '../utils/permissions';
import { applyTaskRuntimeUpdate, TASK_RUNTIME_UPDATED_EVENT, type TaskRuntimeUpdatedPayload } from '../utils/taskRuntimeEvents';
import { moveModuleRecordsToRecycleBin } from '../utils/recycleBin';
import { assignProcessTemplateModuleAliases, resolveProcessTemplateTokenValue } from '../utils/processTemplateContext';
import {
  createProcessGroupId,
  ensureProcessRunForDraftStageGroup,
  ensureProcessRunContextsForStageGroups,
  getDraftStageProcessGroupMeta,
  mapProcessTemplateStagesToDraft,
  removeDraftStagesForProcessGroups,
  resolveProcessRunStageId,
  syncProcessRunStageFromTask,
} from '../utils/processRunRuntime';
import { isAbortLikeError } from '../utils/requestErrors';
import {
  getCompletedProcessesToggleLabel,
  isProcessExecutionStarted,
  shouldShowProcessEmptyState,
  type ProcessRuntimeSnapshot,
} from '../utils/processRuntimeSnapshot';
import {
  getInstructionIdsFromStage,
  normalizeInstructionIdList,
  PROCESS_STAGE_INSTRUCTION_IDS_KEY,
  instructionStatusOptions as INSTRUCTION_STATUS_OPTIONS,
} from '../utils/instructionSupport';
import {
  PROCESS_GRAPH_METADATA_KEY,
  PROCESS_LANE_KEY,
  PROCESS_NODE_KEY,
  attachProcessGraphToStages,
  createProcessLaneKey,
  createProcessNodeKey,
  createProcessTriggerKey,
  getNextProcessStages,
  getPreviousProcessStages,
  getProcessStageLaneKey,
  getProcessStageNodeKey,
  getProcessStagesByLane,
  isProcessGraphConnectionCyclic,
  materializeLegacyProcessGraph,
  moveProcessStageToPosition,
  normalizeProcessGraph,
  type ProcessGraphDefinition,
  type ProcessTriggerDefinition,
} from '../utils/processGraph';
import {
  computeProcessStageDueDate,
  getProcessDueAnchorLabel,
  normalizeProcessDueAnchor,
  type ProcessDueAnchorType,
} from '../utils/processSchedule';
import { activateProcessRunNodes, activateProcessStageAction } from '../utils/processStageActivation';
import { hasMultiLaneProcessesFeature } from '../utils/saasPlanFeatures';
import {
  cloneProcessActivatorWorkflowsForTemplate,
  cloneProcessGraphInto,
  type ProcessGraphCloneResult,
} from '../utils/processGraphCopy';
import { syncProcessTemplateStages } from '../utils/processTemplateStages';
import { insertRecordActivity } from '../utils/recordActivity';

const InstructionQuickCreateModal = React.lazy(() => import('./instructions/InstructionQuickCreateModal'));
const TaskHandoverModal = React.lazy(() => import('./production/TaskHandoverModal'));
const TaskHandoverFormsModal = React.lazy(() => import('./production/TaskHandoverFormsModal'));
const WorkflowConditionsGroup = React.lazy(() => import('./workflows/WorkflowConditionsGroup'));
const WorkflowActionsBuilder = React.lazy(() => import('./workflows/WorkflowActionsBuilder'));
const ProcessAutomationFlowModal = React.lazy(() => import('./workflows/flow/ProcessAutomationFlowModal'));

interface ProductionStagesFieldProps {
  recordId?: string;
  moduleId?: string;
  automationContextModuleId?: string | null;
  automationContextModuleIds?: string[] | null;
  autoOpenTaskId?: string | null;
  autoOpenTask?: any | null;
  onAutoOpenTaskClose?: (() => void) | null;
  readOnly?: boolean;
  compact?: boolean;
  cardCompact?: boolean;
  allowReportEditInReadOnly?: boolean;
  lazyLoad?: boolean;
  onlyLineId?: string | null;
  onlyProcessGroupId?: string | null;
  onQuantityChange?: (qty: number) => void;
  orderStatus?: string | null;
  draftStages?: any[];
  onDraftStagesChange?: (stages: any[]) => void | Promise<void>;
  showWageSummary?: boolean;
  forceProcessRecordMode?: boolean;
  onRuntimeSnapshot?: (snapshot: ProcessRuntimeSnapshot) => void;
}

const PROCESS_STAGE_TIP_WIDTH = 18;
const PROCESS_STAGE_NOTCH_WIDTH = 14;
const CARD_COMPACT_PROCESS_STAGE_MIN_WIDTH = 104;

const DraftProcessStageOutline: React.FC<{ hasRightNotch: boolean }> = ({ hasRightNotch }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });

  useEffect(() => {
    const element = svgRef.current;
    if (!element) return;

    const updateSize = () => {
      const bounds = element.getBoundingClientRect();
      setSize({
        width: Math.max(1, bounds.width),
        height: Math.max(1, bounds.height),
      });
    };

    updateSize();
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { width, height } = size;
  const rightNotchX = Math.max(PROCESS_STAGE_TIP_WIDTH, width - PROCESS_STAGE_NOTCH_WIDTH);
  const path = [
    `M ${width} 0`,
    `L ${PROCESS_STAGE_TIP_WIDTH} 0`,
    `L 0 ${height / 2}`,
    `L ${PROCESS_STAGE_TIP_WIDTH} ${height}`,
    `L ${width} ${height}`,
    ...(hasRightNotch ? [`L ${rightNotchX} ${height / 2}`] : []),
    'Z',
  ].join(' ');

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible text-gray-400 dark:text-gray-500"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="5 4"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

type ProcessStageDragData = {
  scopeKey: string;
  laneKey: string;
  index: number;
  stage: any;
};

type ProcessStageDragSurfaceProps = {
  id: string;
  data: ProcessStageDragData;
  disabled?: boolean;
  children: (props: {
    ref: (node: HTMLElement | null) => void;
    attributes: Record<string, any>;
    listeners: Record<string, any> | undefined;
    style: React.CSSProperties;
    isDragging: boolean;
    isOver: boolean;
  }) => React.ReactNode;
};

const ProcessStageDragHandleContext = React.createContext<{
  attributes: Record<string, any>;
  listeners: Record<string, any> | undefined;
} | null>(null);

const ProcessStageMoveHandle = React.forwardRef<HTMLSpanElement, {
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
  inverse?: boolean;
}>(({ onClick, inverse = false }, ref) => {
  const dragHandle = React.useContext(ProcessStageDragHandleContext);
  return (
    <span
      ref={ref}
      role="button"
      tabIndex={0}
      {...(dragHandle?.attributes || {})}
      {...(dragHandle?.listeners || {})}
      className={`inline-flex h-6 w-6 touch-none cursor-grab items-center justify-center rounded shadow-sm active:cursor-grabbing ${
        inverse
          ? 'bg-black/15 text-white hover:bg-black/25'
          : 'bg-white/80 text-gray-600 dark:bg-black/25 dark:text-gray-200'
      }`}
      onClick={onClick}
    >
      <DragOutlined />
    </span>
  );
});
ProcessStageMoveHandle.displayName = 'ProcessStageMoveHandle';

const ProcessStageActionControls: React.FC<{
  mobile: boolean;
  inverse?: boolean;
  copyTitle: string;
  moveTitle: string;
  deleteTitle?: string;
  onCopy: (event: React.MouseEvent<HTMLElement>) => void;
  onMove: (event: React.MouseEvent<HTMLElement>) => void;
  onDelete?: (event: React.MouseEvent<HTMLElement>) => void;
}> = ({ mobile, inverse = false, copyTitle, moveTitle, deleteTitle = 'حذف', onCopy, onMove, onDelete }) => {
  if (mobile) {
    const items: MenuProps['items'] = [
      { key: 'copy', label: copyTitle, icon: <CopyOutlined /> },
      { key: 'move', label: moveTitle, icon: <DragOutlined /> },
      ...(onDelete ? [{ key: 'delete', label: deleteTitle, icon: <DeleteOutlined />, danger: true }] : []),
    ];
    return (
      <Dropdown
        trigger={['click']}
        placement="bottomLeft"
        menu={{
          items,
          onClick: (info) => {
            info.domEvent.preventDefault();
            info.domEvent.stopPropagation();
            const syntheticEvent = info.domEvent as unknown as React.MouseEvent<HTMLElement>;
            if (info.key === 'copy') {
              onCopy(syntheticEvent);
              return;
            }
            if (info.key === 'move') {
              onMove(syntheticEvent);
              return;
            }
            onDelete?.(syntheticEvent);
          },
        }}
      >
        <span
          role="button"
          tabIndex={0}
          className={`inline-flex h-6 w-6 items-center justify-center rounded ${
            inverse
              ? 'bg-black/15 text-white hover:bg-black/25'
              : 'bg-white/80 text-gray-600 shadow-sm hover:bg-white dark:bg-black/25 dark:text-gray-200 dark:hover:bg-black/40'
          }`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <MoreOutlined />
        </span>
      </Dropdown>
    );
  }

  return (
    <>
      <Tooltip title={copyTitle}>
        <span
          role="button"
          tabIndex={0}
          className={`inline-flex h-6 w-6 items-center justify-center rounded shadow-sm ${
            inverse
              ? 'bg-black/15 text-white hover:bg-black/25'
              : 'bg-white/80 text-gray-600 dark:bg-black/25 dark:text-gray-200'
          }`}
          onClick={onCopy}
        >
          <CopyOutlined />
        </span>
      </Tooltip>
      <Tooltip title={moveTitle}>
        <ProcessStageMoveHandle inverse={inverse} onClick={onMove} />
      </Tooltip>
      {onDelete ? (
        <Tooltip title={deleteTitle}>
          <span
            role="button"
            tabIndex={0}
            className={`inline-flex h-6 w-6 items-center justify-center rounded shadow-sm ${
              inverse
                ? 'bg-black/15 text-white hover:bg-red-500/75'
                : 'bg-white/80 text-red-500 dark:bg-black/25 dark:text-red-300'
            }`}
            onClick={onDelete}
          >
            <DeleteOutlined />
          </span>
        </Tooltip>
      ) : null}
    </>
  );
};

const ProcessStageDragSurface: React.FC<ProcessStageDragSurfaceProps> = ({
  id,
  data,
  disabled = false,
  children,
}) => {
  const draggable = useDraggable({ id, data, disabled });
  const droppable = useDroppable({ id, data: { ...data, dropIndex: data.index }, disabled });
  const setNodeRef = useCallback((node: HTMLElement | null) => {
    draggable.setNodeRef(node);
    droppable.setNodeRef(node);
  }, [draggable.setNodeRef, droppable.setNodeRef]);
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(draggable.transform),
    opacity: draggable.isDragging ? 0.45 : 1,
    zIndex: draggable.isDragging ? 2000 : undefined,
  };

  return children({
    ref: setNodeRef,
    attributes: draggable.attributes as Record<string, any>,
    listeners: draggable.listeners as Record<string, any> | undefined,
    style,
    isDragging: draggable.isDragging,
    isOver: droppable.isOver,
  });
};

const ProcessLaneDropZone: React.FC<{
  id: string;
  scopeKey: string;
  laneKey: string;
  index: number;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ id, scopeKey, laneKey, index, disabled = false, className = '', children }) => {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { scopeKey, laneKey, dropIndex: index },
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isOver ? 'ring-2 ring-[rgba(var(--brand-400-rgb),0.65)] ring-offset-1' : ''}`.trim()}
    >
      {children}
    </div>
  );
};

const ProcessStageInsertionDropZone: React.FC<{
  id: string;
  scopeKey: string;
  laneKey: string;
  index: number;
  vertical?: boolean;
  disabled?: boolean;
}> = ({ id, scopeKey, laneKey, index, vertical = false, disabled = false }) => {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { scopeKey, laneKey, dropIndex: index },
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      aria-hidden="true"
      className={
        vertical
          ? `relative -my-1 h-2 w-full shrink-0 ${isOver ? 'z-30' : 'z-10'}`
          : `relative -mx-1 h-full w-2 shrink-0 ${isOver ? 'z-30' : 'z-10'}`
      }
    >
      <span
        className={
          vertical
            ? `absolute inset-x-1 top-1/2 h-0.5 -translate-y-1/2 rounded-full transition-colors ${isOver ? 'bg-[rgba(var(--brand-500-rgb),1)]' : 'bg-transparent'}`
            : `absolute inset-y-1 left-1/2 w-0.5 -translate-x-1/2 rounded-full transition-colors ${isOver ? 'bg-[rgba(var(--brand-500-rgb),1)]' : 'bg-transparent'}`
        }
      />
    </div>
  );
};

type StageHandoverSide = 'giver' | 'receiver';

type StageAssignee = {
  id: string | null;
  type: 'user' | 'role' | null;
  label: string;
};

const PROCESS_TASK_SELECT = [
  'id',
  'org_id',
  'name',
  'status',
  'priority',
  'description',
  'task_type',
  'task_report',
  'assignee_id',
  'assignee_role_id',
  'assignee_type',
  'sort_order',
  'source_stage_sort_order',
  'source_template_id',
  'source_module_id',
  'source_record_id',
  'related_to_module',
  'related_production_order',
  'related_invoice',
  'related_customer',
  'project_id',
  'purchase_invoice_id',
  'marketing_lead_id',
  'process_group_id',
  'process_run_id',
  'process_run_stage_id',
  'production_line_id',
  'production_shelf_id',
  'produced_qty',
  'wage',
  'weight',
  'due_date',
  'start_date',
  'completed_at',
  'actual_start_at',
  'actual_end_at',
  'blocked_reason',
  'waiting_for_task_type',
  'escalation_level',
  'recurrence_info',
  'created_by',
  'created_at',
  'updated_at',
  'assignee:profiles!tasks_assignee_id_fkey(full_name,email,mobile_1,avatar_url)',
  'assigned_role:org_roles(title)',
].join(',');

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

type DraftModalTabKey = 'stage' | 'fields' | 'automation' | 'instructions';

const DRAFT_MODAL_STEP_KEYS: DraftModalTabKey[] = ['stage', 'fields', 'automation', 'instructions'];

const TASK_AUTOMATION_FIELD_PREFIX = '__task__';
const NEXT_STAGE_TRANSFER_LABELS: Record<1 | 2, string> = {
  1: 'مرحله بعد',
  2: 'دو مرحله بعد',
};
const taskPriorityField = (MODULES.tasks?.fields || []).find((field: any) => String(field?.key || '').trim() === 'priority');
const createProcessAutomationTaskVariableFields = (): ModuleField[] => ([
  { key: 'task_name', labels: { fa: 'عنوان فعالیت', en: 'Task Name' }, type: FieldType.TEXT, nature: 'standard' as any },
  { key: 'task_type', labels: { fa: 'نوع فعالیت', en: 'Task Type' }, type: FieldType.TEXT, nature: 'standard' as any },
  { key: 'task_status', labels: { fa: 'وضعیت فعالیت', en: 'Task Status' }, type: FieldType.TEXT, nature: 'standard' as any },
  { key: 'status_label', labels: { fa: 'عنوان وضعیت فعالیت', en: 'Task Status Label' }, type: FieldType.TEXT, nature: 'standard' as any },
  { key: 'task_status_label', labels: { fa: 'عنوان وضعیت فعالیت (کلید اختصاصی)', en: 'Task Status Label Key' }, type: FieldType.TEXT, nature: 'standard' as any },
  {
    key: 'task_priority',
    labels: { fa: 'اولویت فعالیت', en: 'Task Priority' },
    type: FieldType.STATUS,
    options: taskPriorityField?.options || [],
    nature: 'standard' as any,
  },
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
  FieldType.TAGS,
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
  FieldType.TAGS,
]);

const TEMPLATE_TOKEN_REGEX = /\{\{\s*([^}]+)\s*\}\}/g;
const EXACT_TEMPLATE_TOKEN_REGEX = /^\s*\{\{\s*([^}]+)\s*\}\}\s*$/;

const stringifyTemplateValue = (value: any): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((item) => String(item ?? '')).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const assignProcessLinkedRecordFields = (
  target: Record<string, any>,
  moduleId: string | null | undefined,
  record: Record<string, any> | null | undefined,
) => {
  const normalizedModuleId = String(moduleId || '').trim();
  if (!normalizedModuleId || !record) return;
  Object.entries(record).forEach(([fieldKey, value]) => {
    target[createProcessLinkedFieldKey(normalizedModuleId, fieldKey)] = value;
  });
  assignProcessTemplateModuleAliases(target, normalizedModuleId, record);
  target[createProcessLinkedFieldKey(normalizedModuleId, WORKFLOW_ASSIGNEE_FIELD_KEY)] = buildResolvedAssigneeCombo(record);
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
    return coerceResolvedTemplateValue(resolveProcessTemplateTokenValue(record, tokenKey), fieldType);
  }
  return String(rawValue || '').replace(TEMPLATE_TOKEN_REGEX, (_token, key: string) => {
    const tokenKey = String(key || '').trim();
    return stringifyTemplateValue(resolveProcessTemplateTokenValue(record, tokenKey));
  });
};

const resolveProcessTaskCustomFieldsFromRecord = (
  fields: ModuleField[],
  record: Record<string, any>,
) => fields.map((field) => ({
  ...field,
  defaultValue: renderTemplateValueFromRecord(field?.defaultValue, record, field.type),
}));

const resolveProcessTaskCustomFieldDraftValuesFromRecord = (
  fields: ModuleField[],
  rawValues: Record<string, any> | null | undefined,
  record: Record<string, any>,
) => {
  const sourceValues = rawValues && typeof rawValues === 'object' ? rawValues : {};
  return fields.reduce<Record<string, any>>((acc, field) => {
    const key = String(field?.key || '').trim();
    if (!key || !Object.prototype.hasOwnProperty.call(sourceValues, key)) return acc;
    acc[key] = renderTemplateValueFromRecord(sourceValues[key], record, field.type);
    return acc;
  }, {});
};

const supportsProcessTaskDynamicCategory = (fieldType: FieldType) =>
  processTaskDynamicOptionCapableTypes.has(fieldType);

type ProcessTaskOptionEditorRow = {
  label?: string;
  value?: string;
  color?: string;
};

type ProcessTaskOptionEditorFormValues = {
  options?: ProcessTaskOptionEditorRow[];
};

const normalizeProcessTaskOptionKey = (value: unknown, fallback: string) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\u200c\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
};

const buildDefaultProcessTaskOptionValue = (prefix: string, index: number) =>
  `${prefix}_${Date.now().toString(36)}_${Math.max(1, index + 1)}`;

const normalizeProcessTaskOptionRows = (
  rows: ProcessTaskOptionEditorRow[] | undefined,
  fallbackPrefix = 'option',
) => {
  const seen = new Set<string>();
  return (Array.isArray(rows) ? rows : [])
    .map((row, index) => {
      const label = String(row?.label || '').trim();
      const fallbackValue = buildDefaultProcessTaskOptionValue(fallbackPrefix, index);
      const value = normalizeProcessTaskOptionKey(row?.value || label, fallbackValue);
      if (!label || !value || seen.has(value)) return null;
      seen.add(value);
      const color = String(row?.color || '').trim();
      return {
        label,
        value,
        ...(color ? { color } : {}),
      };
    })
    .filter((option): option is { label: string; value: string; color?: string } => Boolean(option));
};

const TASK_MODAL_CUSTOM_FIELD_DRAFT_ID = '__task_modal_custom_fields__';

const DRAFT_AUTOMATION_HEADER_PALETTE = [
  {
    background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(14,165,233,0.1))',
    borderColor: 'rgba(59,130,246,0.32)',
    accentColor: 'rgb(29,78,216)',
  },
  {
    background: 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(45,212,191,0.1))',
    borderColor: 'rgba(16,185,129,0.3)',
    accentColor: 'rgb(4,120,87)',
  },
  {
    background: 'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(251,191,36,0.1))',
    borderColor: 'rgba(245,158,11,0.3)',
    accentColor: 'rgb(180,83,9)',
  },
  {
    background: 'linear-gradient(135deg, rgba(236,72,153,0.18), rgba(244,114,182,0.1))',
    borderColor: 'rgba(236,72,153,0.3)',
    accentColor: 'rgb(190,24,93)',
  },
];

type ProcessBarDisplayMode = 'full' | 'dense' | 'summary';

const PROCESS_BAR_BREAKPOINTS = {
  summary: 360,
  dense: 560,
} as const;

const PROCESS_BAR_DONE_STATUSES = new Set(['done', 'completed', 'canceled']);
const PROCESS_BAR_ACTIVE_STATUSES = new Set(['in_progress', 'review']);
const PROCESS_ACTIVATOR_SOURCE_NODE_CONDITION_ID = '__process_activator_source_node__';
const PROCESS_ACTIVATOR_INTERVAL_FIELD_NAMES: WorkflowIntervalFieldNames = {
  intervalValue: 'workflow_interval_value',
  intervalUnit: 'workflow_interval_unit',
  intervalAt: 'workflow_interval_at',
  intervalFirstRunAt: 'workflow_interval_first_run_at',
  intervalMinute: 'workflow_interval_minute',
  intervalAllowedFromHour: 'workflow_interval_allowed_from_hour',
  intervalAllowedToHour: 'workflow_interval_allowed_to_hour',
  intervalDayOfMonth: 'workflow_interval_day_of_month',
  intervalDayCondition: 'workflow_interval_day_condition',
  intervalDaysAfterHoliday: 'workflow_interval_days_after_holiday',
  batchSize: 'workflow_batch_size',
};

const ProductionStagesField: React.FC<ProductionStagesFieldProps> = ({ recordId, moduleId, automationContextModuleId = null, automationContextModuleIds = null, autoOpenTaskId = null, autoOpenTask = null, onAutoOpenTaskClose = null, readOnly = false, compact = false, cardCompact = false, allowReportEditInReadOnly = false, lazyLoad = false, onlyLineId = null, onlyProcessGroupId = null, onQuantityChange, orderStatus, draftStages, onDraftStagesChange, showWageSummary = false, forceProcessRecordMode = false, onRuntimeSnapshot }) => {
  const screens = Grid.useBreakpoint();
  const isMobileProcessViewport = !screens.md;
  const processDragSensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  }));
  const [lines, setLines] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [assignees, setAssignees] = useState<{ users: any[]; roles: any[] }>({ users: [], roles: [] });
  const [loading, setLoading] = useState(false);
  const [isSubmittingTaskModal, setIsSubmittingTaskModal] = useState(false);
  const taskCreateLockRef = useRef<string | null>(null);
  const autoAssignLockRef = useRef<Set<string>>(new Set());
  const [autoAssigningProcessIds, setAutoAssigningProcessIds] = useState<Record<string, boolean>>({});
  const [isLineModalOpen, setIsLineModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [lineForm] = Form.useForm();
  const [taskForm] = Form.useForm();
  const [draftLocal, setDraftLocal] = useState<any[]>(() => (Array.isArray(draftStages) ? draftStages : []));
  const [activeDraftLaneKey, setActiveDraftLaneKey] = useState<string | null>(null);
  const [processGraphOverride, setProcessGraphOverride] = useState<ProcessGraphDefinition | null>(null);
  const [multiLaneFeatureEnabled, setMultiLaneFeatureEnabled] = useState(true);
  const [stageMoveTarget, setStageMoveTarget] = useState<any | null>(null);
  const [stageMoveForm] = Form.useForm();
  const [processTriggerEditor, setProcessTriggerEditor] = useState<{
    trigger: ProcessTriggerDefinition;
    sourceStage: any | null;
  } | null>(null);
  const [processTriggerForm] = Form.useForm();
  const watchedProcessActivatorTriggerType = Form.useWatch('workflow_trigger_type', processTriggerForm);
  const watchedProcessActivatorIsActive = Form.useWatch('workflow_is_active', processTriggerForm);
  const watchedProcessActivatorSourceNodeKey = Form.useWatch('source_node_key', processTriggerForm);
  const [processActivatorWorkflowRecord, setProcessActivatorWorkflowRecord] = useState<WorkflowRecord | null>(null);
  const [processActivatorConditionsAll, setProcessActivatorConditionsAll] = useState<WorkflowCondition[]>([]);
  const [processActivatorConditionsAny, setProcessActivatorConditionsAny] = useState<WorkflowCondition[]>([]);
  const [processActivatorWorkflowLoading, setProcessActivatorWorkflowLoading] = useState(false);
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);
  const [draftForm] = Form.useForm();
  const watchedTaskDurationFrom = Form.useWatch('duration_from', taskForm);
  const watchedDraftStartDurationFrom = Form.useWatch('start_duration_from', draftForm);
  const watchedDraftDurationFrom = Form.useWatch('duration_from', draftForm);
  const requiresSystemScheduleStageAnchor = useCallback((value: any) => (
    String(value || '').trim().startsWith('specific_stage_')
  ), []);
  const [draftToCreate, setDraftToCreate] = useState<any | null>(null);
  const [editingDraft, setEditingDraft] = useState<any | null>(null);
  const [draftAutomationRules, setDraftAutomationRules] = useState<ProcessAutomationRule[]>([]);
  const [expandedDraftAutomationRuleIds, setExpandedDraftAutomationRuleIds] = useState<string[]>([]);
  const [automationViewMode, setAutomationViewMode] = useState<WorkflowEditorViewMode>(() => readStoredWorkflowViewMode());
  const [diagramAutomationRuleId, setDiagramAutomationRuleId] = useState<string | null>(null);
  const [isSavingDraftStage, setIsSavingDraftStage] = useState(false);
  const [isReadyToLoad, setIsReadyToLoad] = useState(!lazyLoad);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draftLocalRef = useRef<any[]>(Array.isArray(draftStages) ? draftStages : []);
  const autoAssignedProcessGroupIdsRef = useRef<Set<string>>(new Set());
  const draftEditorStageIdRef = useRef<any>(null);
  const draftStageSavePromiseRef = useRef<Promise<any> | null>(null);
  const isBom = moduleId === 'production_boms';
  const isProcessTemplateModule = moduleId === 'process_templates';
  const isDraftOnlyModule = isBom || isProcessTemplateModule;
  const [currentUser, setCurrentUser] = useState<{ id: string | null; roleId: string | null; fullName: string; softwareRole?: string | null }>({ id: null, roleId: null, fullName: 'کاربر', softwareRole: null });
  const [rolePermissions, setRolePermissions] = useState<PermissionMap | null>(null);
  const [taskLockPatches, setTaskLockPatches] = useState<Record<string, Record<string, any>>>({});
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
  const [handoverFormsContentMounted, setHandoverFormsContentMounted] = useState(false);
  const [handoverEditorContentMounted, setHandoverEditorContentMounted] = useState(false);
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
  const [appendProcessTemplateLabel, setAppendProcessTemplateLabel] = useState<string | null>(null);
  const [appendProcessTargetModuleIds, setAppendProcessTargetModuleIds] = useState<string[]>([]);
  const [appendProcessLinkedRecords, setAppendProcessLinkedRecords] = useState<Record<string, string | null>>({});
  const appendProcessLinkedRecordsRef = useRef<Record<string, string | null>>({});
  const [appendProcessRelationOptions, setAppendProcessRelationOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [, setAppendProcessRelationLoading] = useState<Record<string, boolean>>({});
  const [showEmptyProcessDetails, setShowEmptyProcessDetails] = useState(false);
  const [showCompletedProcessGroups, setShowCompletedProcessGroups] = useState(false);
  const [expandedProcessBars, setExpandedProcessBars] = useState<Set<string>>(() => new Set());
  const [processOriginTitleMap, setProcessOriginTitleMap] = useState<Record<string, string>>({});
  const [openDraftSegmentPopoverKey, setOpenDraftSegmentPopoverKey] = useState<string | null>(null);
  const [draftTemplatePickerOpenKey, setDraftTemplatePickerOpenKey] = useState<string | null>(null);
  const [draftTemplatePickerValueMap, setDraftTemplatePickerValueMap] = useState<Record<string, string | undefined>>({});
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
  const [editingTaskCustomFields, setEditingTaskCustomFields] = useState<Record<string, boolean>>({});
  const [taskCustomFieldDynamicOptions, setTaskCustomFieldDynamicOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [taskCustomFieldRelationOptions, setTaskCustomFieldRelationOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [savingTaskCustomFields, setSavingTaskCustomFields] = useState<Record<string, boolean>>({});
  const [draftCustomFieldForm] = Form.useForm();
  const [draftCustomFieldOptionsForm] = Form.useForm<ProcessTaskOptionEditorFormValues>();
  const [draftStageInstructionIds, setDraftStageInstructionIds] = useState<string[]>([]);
  const [instructionsForEditor, setInstructionsForEditor] = useState<any[]>([]);
  const [isLoadingInstructionsForEditor, setIsLoadingInstructionsForEditor] = useState(false);
  const [isInstructionQuickCreateOpen, setIsInstructionQuickCreateOpen] = useState(false);
  const [automationDynamicOptions, setAutomationDynamicOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [automationRelationOptions, setAutomationRelationOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [taskReportDrafts, setTaskReportDrafts] = useState<Record<string, string>>({});
  const [savingReportIds, setSavingReportIds] = useState<Record<string, boolean>>({});
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [tasksLoadSucceeded, setTasksLoadSucceeded] = useState(false);
  const [processRuntimeRuns, setProcessRuntimeRuns] = useState<any[]>([]);
  const [processRuntimeStages, setProcessRuntimeStages] = useState<any[]>([]);
  const autoOpenedTaskIdRef = useRef<string | null>(null);
  const taskQuickModalHistoryRef = useRef<string | null>(null);
  const taskQuickModalBoundaryRef = useRef<HTMLDivElement | null>(null);
  const draftTemplateSelectionRef = useRef<Record<string, { start: number; end: number }>>({});
  const draftStageNameInputRef = useRef<any>(null);
  const draftStageDescriptionInputRef = useRef<any>(null);
  const draftCustomFieldDefaultInputRefs = useRef<Record<string, any>>({});
  const handoverFormsHistoryRef = useRef<string | null>(null);
  const handoverEditorHistoryRef = useRef<string | null>(null);
  const watchedDraftStageStatusOptions = Form.useWatch('stage_status_options_editor', { form: draftForm, preserve: true });
  const watchedDraftStageSortOrder = Form.useWatch('sort_order', { form: draftForm, preserve: true });
  const activeTaskQuickModalTask = useMemo(() => {
    if (!openTaskPopoverId) return null;
    const fromTasks = tasks.find((task: any) => String(task?.id || '') === String(openTaskPopoverId));
    const patch = taskLockPatches[String(openTaskPopoverId)] || {};
    if (fromTasks) return { ...fromTasks, ...patch };
    if (autoOpenTask && String(autoOpenTask?.id || '') === String(openTaskPopoverId)) {
      return { ...autoOpenTask, ...patch };
    }
    return null;
  }, [openTaskPopoverId, tasks, autoOpenTask, taskLockPatches]);
  useEffect(() => {
    const taskId = String(openTaskPopoverId || '').trim();
    if (!taskId) return;
    let cancelled = false;
    fetchRecordLockState('tasks', taskId)
      .then((nextLockState) => {
        if (cancelled) return;
        setTaskLockPatches((prev) => ({
          ...prev,
          [taskId]: mergeRecordLockIntoRecord(prev[taskId] || {}, nextLockState),
        }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [openTaskPopoverId]);
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
    const shouldNotifyAutoOpenClose = !!autoOpenTaskId
      && !!openTaskPopoverId
      && String(openTaskPopoverId) === String(autoOpenTaskId);
    if (syncHistory && typeof window !== 'undefined') {
      const marker = taskQuickModalHistoryRef.current;
      if (marker && window.history.state?.kalamappTaskQuickModal === marker) {
        setOpenTaskPopoverId(null);
        taskQuickModalHistoryRef.current = null;
        if (shouldNotifyAutoOpenClose) {
          onAutoOpenTaskClose?.();
        }
        window.history.back();
        return;
      }
    }
    taskQuickModalHistoryRef.current = null;
    setOpenTaskPopoverId(null);
    if (shouldNotifyAutoOpenClose) {
      onAutoOpenTaskClose?.();
    }
  }, [autoOpenTaskId, onAutoOpenTaskClose, openTaskPopoverId]);
  const openTaskLayerConfirm = useCallback((config: Parameters<typeof Modal.confirm>[0]) => (
    Modal.confirm({
      zIndex: resolveParentOverlayZIndex(taskQuickModalBoundaryRef.current, 15080) + 60,
      centered: true,
      maskClosable: false,
      getContainer: () => resolveStableOverlayRoot(resolveOverlayPopupContainer(taskQuickModalBoundaryRef.current)),
      ...config,
    })
  ), []);
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
    if (handoverFormsModalOpen) {
      setHandoverFormsContentMounted(true);
    }
  }, [handoverFormsModalOpen]);
  useEffect(() => {
    if (handoverEditorOpen) {
      setHandoverEditorContentMounted(true);
    }
  }, [handoverEditorOpen]);
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
  const adaptiveModalSelectProps = useMemo(
    () => ({
      allowClear: true,
      showSearch: true,
      optionFilterProp: 'label' as const,
      getPopupContainer: resolveOverlayPopupContainer,
      modalContainer: resolveOverlayPopupContainer,
      placement: 'bottomRight' as const,
      popupMatchSelectWidth: false,
      listHeight: 260,
      overlayZIndexBase: 13080,
      virtual: false,
    }),
    []
  );
  const assigneeComboOptions = useMemo(
    () => ([
      ...assignees.users.map((user) => ({
        value: `user:${user.id}`,
        label: user.display_name || user.full_name || user.email || user.mobile_1 || 'کاربر بدون نام',
        searchText: [user.display_name, user.full_name, user.email, user.mobile_1, 'کاربر'].filter(Boolean).join(' '),
      })),
      ...assignees.roles.map((role) => ({
        value: `role:${role.id}`,
        label: role.title || 'تیم بدون نام',
        searchText: [role.title, 'تیم'].filter(Boolean).join(' '),
      })),
    ]),
    [assignees.roles, assignees.users]
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
  const processActivatorTargetModuleOptions = useMemo(
    () => automationScopeModuleIds.map((scopeModuleId) => ({
      value: scopeModuleId,
      label: MODULES[scopeModuleId]?.titles?.fa || scopeModuleId,
    })),
    [automationScopeModuleIds]
  );
  const shouldShowProcessActivatorModulePicker = (
    (watchedProcessActivatorTriggerType === 'on_create' || watchedProcessActivatorTriggerType === 'on_upsert')
    && String(watchedProcessActivatorSourceNodeKey || '__process_start__') === '__process_start__'
    && processActivatorTargetModuleOptions.length > 0
  );
  const stageAutomationScopeModuleIds = useMemo(() => {
    const stageModuleIds = normalizeProcessTargetModuleIds(
      [
        ...(Array.isArray(editingDraft?.process_target_module_ids) ? editingDraft.process_target_module_ids : []),
        ...(Array.isArray(editingDraft?.metadata?.process_target_module_ids) ? editingDraft.metadata.process_target_module_ids : []),
      ],
      ''
    );
    return stageModuleIds.length > 0 ? stageModuleIds : automationScopeModuleIds;
  }, [automationScopeModuleIds, editingDraft]);
  const automationScopeModuleId = stageAutomationScopeModuleIds[0] || '';
  const draftCustomAutomationFields = useMemo(
    () => buildProcessTaskCustomAutomationFields(draftCustomFields),
    [draftCustomFields]
  );
  const automationConditionFields = useMemo(
    () => [
      ...getProcessAutomationConditionFieldsForModules(stageAutomationScopeModuleIds).map((field) => (
        String(field?.key || '').trim() === '__task__status'
          ? { ...field, options: getTaskStatusOptions({ recurrence_info: { [PROCESS_TASK_STATUS_OPTIONS_KEY]: draftStageStatusOptions } }, field.options || []) }
          : field
      )),
      ...draftCustomAutomationFields,
    ],
    [draftCustomAutomationFields, draftStageStatusOptions, stageAutomationScopeModuleIds]
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
            stageAutomationScopeModuleIds,
            getVisibleWorkflowModuleFields,
            getSyntheticWorkflowAssigneeField
          ),
        ]
          .filter((field) => !!String(field?.key || '').trim())
          .map((field) => [String(field.key), field] as const)
      ).values()
    ),
    [draftCustomAutomationFields, stageAutomationScopeModuleIds]
  );
  const defaultAssigneeComboOptions = useMemo(() => {
    const fieldOptions = automationActionModuleFields
      .filter((field: any) => String(field?.key || '').includes(WORKFLOW_ASSIGNEE_FIELD_KEY))
      .map((field: any) => ({
        value: `field:${String(field.key || '').trim()}`,
        label: getFieldLabelFa(field),
        searchText: [field?.labels?.fa, field?.key, 'مسئول', 'فیلد'].filter(Boolean).join(' '),
      }))
      .filter((option) => option.value && option.label);
    return [...assigneeComboOptions, ...fieldOptions];
  }, [assigneeComboOptions, automationActionModuleFields]);
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
      {
        key: 'instructions' as DraftModalTabKey,
        title: `دستورالعمل‌ها (${toPersianNumber(draftStageInstructionIds.length)})`,
        description: 'دستورالعمل‌های مرتبط با این مرحله',
      },
    ],
    [draftAutomationRules.length, draftCustomFields.length, draftStageInstructionIds.length]
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
        padding: isMobileProcessViewport ? '14px 16px 10px' : '16px 20px 12px',
        borderBottom: '1px solid rgba(var(--brand-200-rgb), 0.28)',
        background: 'linear-gradient(180deg, rgba(var(--brand-100-rgb), 0.9) 0%, rgba(255,255,255,0) 100%)',
      },
      body: {
        padding: isMobileProcessViewport ? '14px 16px calc(16px + env(safe-area-inset-bottom, 0px))' : '16px 20px 20px',
        background: 'transparent',
      },
      content: {
        overflow: 'hidden',
        borderRadius: isMobileProcessViewport ? 0 : 24,
      },
    }),
    [isMobileProcessViewport]
  );
  const responsiveProcessModalStyle = useMemo(
    () => ({
      maxWidth: isMobileProcessViewport ? '100vw' : 'calc(100vw - 1rem)',
      top: isMobileProcessViewport ? 0 : undefined,
      paddingBottom: isMobileProcessViewport ? 0 : undefined,
    }),
    [isMobileProcessViewport]
  );
  const responsiveProcessBodyMaxHeight = isMobileProcessViewport ? 'calc(100dvh - 154px)' : '68vh';

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
    const startDurationValue = readNumber(stage?.start_duration_value ?? metadata?.start_duration_value ?? metadata?.duration_start_value, 0);
    const startDurationUnit = String(stage?.start_duration_unit ?? metadata?.start_duration_unit ?? metadata?.duration_start_unit ?? 'day') === 'hour' ? 'hour' : 'day';
    const startDurationFrom = String(stage?.start_duration_from ?? metadata?.start_duration_from ?? metadata?.duration_start_from ?? 'project_start') || 'project_start';
    const startAnchorStageNodeKey = String(stage?.start_anchor_stage_node_key ?? metadata?.start_anchor_stage_node_key ?? '').trim() || null;
    const durationValue = readNumber(stage?.duration_value ?? metadata?.duration_value, 0);
    const durationUnit = String(stage?.duration_unit ?? metadata?.duration_unit ?? 'day') === 'hour' ? 'hour' : 'day';
    const dueAnchor = normalizeProcessDueAnchor(stage);
    const durationFrom = dueAnchor.type === 'process_start'
      ? 'project_start'
      : (dueAnchor.type === 'previous_stage_due' ? 'previous_stage_end' : dueAnchor.type);
    const id = stage?.id || stage?.template_stage_id || stage?.process_run_stage_id || `draft_${index + 1}_${sortOrder}`;
    const processNodeKey = getProcessStageNodeKey({ ...stage, metadata }, index);
    const processLaneKey = getProcessStageLaneKey({ ...stage, metadata });

    const instructionIds = getInstructionIdsFromStage(stage);

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
      start_duration_value: startDurationValue,
      start_duration_unit: startDurationUnit,
      start_duration_from: startDurationFrom,
      start_anchor_stage_node_key: startAnchorStageNodeKey,
      duration_value: durationValue,
      duration_unit: durationUnit,
      duration_from: durationFrom,
      due_anchor_type: dueAnchor.type,
      due_anchor_stage_node_key: dueAnchor.stageNodeKey,
      [PROCESS_NODE_KEY]: processNodeKey,
      [PROCESS_LANE_KEY]: processLaneKey,
      [PROCESS_STAGE_INSTRUCTION_IDS_KEY]: instructionIds,
      metadata: {
        ...metadata,
        description,
        task_type: taskType,
        automation_rules: automationRules,
        [PROCESS_TASK_CUSTOM_FIELDS_KEY]: processTaskCustomFields,
        [PROCESS_TASK_STATUS_OPTIONS_KEY]: processTaskStatusOptions,
        weight,
        start_duration_value: startDurationValue,
        start_duration_unit: startDurationUnit,
        start_duration_from: startDurationFrom,
        start_anchor_stage_node_key: startAnchorStageNodeKey,
        duration_value: durationValue,
        duration_unit: durationUnit,
        duration_from: durationFrom,
        due_anchor_type: dueAnchor.type,
        due_anchor_stage_node_key: dueAnchor.stageNodeKey,
        [PROCESS_NODE_KEY]: processNodeKey,
        [PROCESS_LANE_KEY]: processLaneKey,
        [PROCESS_STAGE_INSTRUCTION_IDS_KEY]: instructionIds,
      },
    };
  }, []);
  const normalizedDraftStages = useMemo(
    () => (Array.isArray(draftStages) ? draftStages : []).map((stage: any, index: number) =>
      normalizeDraftStageForEditor(stage, index)
    ),
    [draftStages, normalizeDraftStageForEditor]
  );
  const configuredProcessDraftFieldKeys = new Set([
    'execution_process_draft',
    'marketing_process_draft',
    'process_draft',
    'sub_process_draft',
  ]);
  const moduleHasConfiguredProcessDraft = Boolean(
    moduleId
    && MODULES[moduleId]?.fields?.some((field: any) => configuredProcessDraftFieldKeys.has(String(field?.key || '')))
  );
  const isProcessRecordModule = (
    forceProcessRecordMode
    || moduleHasConfiguredProcessDraft
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
  const canManageProcessGraph = (
    rolePermissions?.process_templates?.edit !== false
    && rolePermissions?.__workflows?.edit !== false
  );

  useEffect(() => {
    if (!isProcessTemplateModule || !Array.isArray(draftStages)) return;
    const materialized = materializeLegacyProcessGraph(draftStages);
    if (!materialized.isLegacy) {
      setProcessGraphOverride(materialized.graph);
    }
  }, [draftStages, isProcessTemplateModule]);

  useEffect(() => {
    if (!isProcessModule) return;
    let cancelled = false;
    void hasMultiLaneProcessesFeature().then((enabled) => {
      if (!cancelled) setMultiLaneFeatureEnabled(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, [isProcessModule]);

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
    () => createProcessGroupId(),
    []
  );
  const normalizeStageName = useCallback(
    (val: any) => String(val || '').trim().toLowerCase(),
    []
  );
  const getStageProcessGroupMeta = useCallback((stage: any) => {
    return getDraftStageProcessGroupMeta(stage);
  }, []);
  const nextDraftStagesForAutomation = useMemo(() => {
    const currentSortOrder = Number(watchedDraftStageSortOrder || editingDraft?.sort_order || 0);
    const editingId = String(editingDraft?.id || '').trim();
    const currentGroupId = editingDraft ? getStageProcessGroupMeta(editingDraft).groupId : '';
    return (Array.isArray(draftLocal) ? draftLocal : [])
      .filter((stage: any) => {
        if (editingId && String(stage?.id || '').trim() === editingId) return false;
        if (currentGroupId && getStageProcessGroupMeta(stage).groupId !== currentGroupId) return false;
        if (currentSortOrder > 0) return Number(stage?.sort_order || 0) > currentSortOrder;
        return true;
      })
      .sort((a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0))
      .slice(0, 2);
  }, [draftLocal, editingDraft, getStageProcessGroupMeta, watchedDraftStageSortOrder]);
  const nextStageTransferFields = useMemo(() => {
    const taskPublicFields = (MODULES.tasks?.fields || [])
      .filter((field: ModuleField) => {
        const key = String(field?.key || '').trim();
        if (!key) return false;
        if (field.readonly === true || String(field.nature || '') === 'system') return false;
        if (key === 'tags') return false;
        return true;
      });
    const taskAssigneeField = getSyntheticWorkflowAssigneeField('tasks');
    const baseTaskFields = taskAssigneeField
      ? [...taskPublicFields, taskAssigneeField]
      : taskPublicFields;

    return nextDraftStagesForAutomation.flatMap((stage: any, index: number) => {
      const offset = (index + 1) as 1 | 2;
      const stageLabel = NEXT_STAGE_TRANSFER_LABELS[offset];
      const fields = [
        ...baseTaskFields,
        ...getProcessTaskCustomFieldsFromStage(stage),
      ];

      return Array.from(
        new Map(
          fields
            .filter((field) => !!String(field?.key || '').trim())
            .map((field) => [String(field.key), field] as const)
        ).values()
      ).map((field) => ({
        ...field,
        key: createProcessNextStageFieldKey(offset, String(field.key)),
        labels: {
          ...field.labels,
          fa: `${getFieldLabelFa(field)} (${stageLabel})`,
        },
        ...( { workflowOptionScopeModuleId: 'tasks' } as any ),
      }));
    });
  }, [nextDraftStagesForAutomation]);
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
    () => automationActionVariableFields.map((field) => {
      const key = String(field?.key || '').trim();
      const label = String(field?.labels?.fa || key).trim();
      return {
        key,
        label,
        token: `{{${label || key}}}`,
      };
    }).filter((item) => item.key && item.label),
    [automationActionVariableFields]
  );
  const stageTemplateVariableOptionMap = useMemo(
    () => new Map(stageTemplateVariableOptions.map((item) => [item.key, item] as const)),
    [stageTemplateVariableOptions]
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
  const getProcessStageSortOrder = useCallback((item: any) => {
    const value = Number(item?.source_stage_sort_order ?? item?.sort_order ?? 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }, []);
  const buildProcessStageIdentityKeys = useCallback((item: any, fallbackGroupId?: any) => {
    const taskMeta = getTaskProcessGroupMeta(item);
    const stageMeta = getStageProcessGroupMeta(item);
    const groupId = String(fallbackGroupId || taskMeta.groupId || stageMeta.groupId || 'default_process_group').trim() || 'default_process_group';
    const keys: string[] = [];
    const processRunStageId = String(item?.process_run_stage_id || '').trim();
    const recurrence = parseRecurrenceInfo(item?.recurrence_info);
    const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    const processNodeKey = String(
      item?.process_node_key
      || item?.[PROCESS_NODE_KEY]
      || recurrence?.[PROCESS_NODE_KEY]
      || metadata?.[PROCESS_NODE_KEY]
      || ''
    ).trim();
    const templateStageId = String(item?.template_stage_id || item?.source_template_stage_id || '').trim();
    const sortOrder = getProcessStageSortOrder(item);
    const name = item?.name || item?.title || item?.label || item?.stage_name || '';
    if (processRunStageId) keys.push(`${groupId}::run-stage::${processRunStageId}`);
    if (processNodeKey) keys.push(`${groupId}::node::${processNodeKey}`);
    if (templateStageId) keys.push(`${groupId}::template-stage::${templateStageId}`);
    if (sortOrder > 0) keys.push(`${groupId}::sort::${sortOrder}`);
    const nameKey = buildProcessStageTaskKey(groupId, name, sortOrder || item?.sort_order);
    if (nameKey) keys.push(`${groupId}::name::${nameKey}`);
    return Array.from(new Set(keys));
  }, [buildProcessStageTaskKey, getProcessStageSortOrder, getStageProcessGroupMeta, getTaskProcessGroupMeta]);
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
    const automationOptionFields = Array.from(
      new Map(
        [
          ...automationConditionFields,
          ...automationActionVariableFields,
          ...nextStageTransferFields,
        ]
          .filter((field) => !!String(field?.key || '').trim())
          .map((field) => [String(field.key), field] as const)
      ).values()
    );

    if (automationOptionFields.length === 0) {
      setAutomationDynamicOptions({});
      setAutomationRelationOptions({});
      return;
    }

    const nextDynamicOptions: Record<string, Array<{ label: string; value: string }>> = {};
    const nextRelationOptions: Record<string, Array<{ label: string; value: string }>> = {};

    await Promise.all(automationOptionFields.map(async (field) => {
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
            label: String(user.display_name || user.full_name || 'کاربر بدون نام').trim(),
            value: `user_${String(user.id)}`,
          })),
          ...directory.roles.map((role) => ({
            label: String(role.title || 'نقش بدون نام').trim(),
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
          label: String(row?.title || 'برچسب بدون عنوان').trim(),
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
          label: String(row?.full_name || 'کاربر بدون نام').trim(),
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
  }, [automationActionVariableFields, automationConditionFields, automationScopeModuleId, nextStageTransferFields, taskTypeOptions]);

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
  const getRelatedTaskRecordRows = useCallback((task: any) => {
    const rows = new Map<string, { moduleId: string; recordId: string; label: string; value: string }>();
    const addRow = (targetModuleId: unknown, targetRecordId: unknown) => {
      const normalizedModuleId = String(targetModuleId || '').trim();
      const normalizedRecordId = String(targetRecordId || '').trim();
      if (!normalizedModuleId || !normalizedRecordId || !MODULES[normalizedModuleId]) return;
      if (!canViewModuleByPermissions(normalizedModuleId)) return;
      const moduleTitle = MODULES[normalizedModuleId]?.titles?.faSingular
        || MODULES[normalizedModuleId]?.titles?.fa
        || normalizedModuleId;
      const titleKey = `${normalizedModuleId}:${normalizedRecordId}`;
      rows.set(titleKey, {
        moduleId: normalizedModuleId,
        recordId: normalizedRecordId,
        label: `${moduleTitle} مرتبط`,
        value: relatedRecordTitleMap[titleKey] || normalizedRecordId,
      });
    };

    const recurrence = parseRecurrenceInfo(task?.recurrence_info);
    const sourceLink = resolveTaskSourceLink(task);
    addRow(sourceLink.moduleId, sourceLink.recordId);
    Object.entries(parseProcessLinkMap(recurrence?.process_links)).forEach(([targetModuleId, targetRecordId]) => {
      addRow(targetModuleId, targetRecordId);
    });

    TASK_RELATED_FIELD_DEFINITIONS.forEach((meta) => {
      addRow(meta.moduleId, task?.[meta.fieldKey]);
    });

    return Array.from(rows.values());
  }, [canViewModuleByPermissions, parseRecurrenceInfo, relatedRecordTitleMap]);

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

  const getTaskCustomFieldEditKey = useCallback((taskId: string, fieldKey: string) =>
    `${String(taskId || '').trim()}::${String(fieldKey || '').trim()}`, []);

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
      draftForm.setFieldsValue({ [targetKey]: nextValue });
      draftTemplateSelectionRef.current[targetKey] = { start: caret, end: caret };
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
        draftTemplateSelectionRef.current[targetKey] = { start: nextCaret, end: nextCaret };
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
    void copyDraftTemplateTokenToClipboard(token);
  }, [copyDraftTemplateTokenToClipboard, insertDraftTemplateToken]);

  const buildTaskTemplateContextRecord = useCallback(async ({
    taskName,
    taskType,
    dueDate,
    processLinkMap,
    previousTask,
    relatedRecordCache,
  }: {
    taskName?: string | null;
    taskType?: string | null;
    dueDate?: string | null;
    processLinkMap?: Record<string, any> | null;
    previousTask?: any;
    relatedRecordCache?: Map<string, Record<string, any>>;
  }) => {
    const record: Record<string, any> = {
      task_name: String(taskName || '').trim(),
      task_type: String(taskType || '').trim(),
      task_status: 'todo',
      status_label: getTaskStatusLabel('todo'),
      task_status_label: getTaskStatusLabel('todo'),
      task_due_date: dueDate || '',
    };
    const effectiveRelatedRecordCache = relatedRecordCache || new Map<string, Record<string, any>>();
    let sourceRecordSnapshot: Record<string, any> | null = null;

    if (recordId && moduleId) {
      try {
        const sourceCacheKey = `${moduleId}:${recordId}`;
        let sourceRecord = effectiveRelatedRecordCache.get(sourceCacheKey);
        if (!sourceRecord) {
          const { data, error } = await supabase
            .from(MODULES[moduleId]?.table || moduleId)
            .select('*')
              .eq('id', recordId)
              .maybeSingle();
          if (error) throw error;
          if (data) {
            sourceRecord = data as Record<string, any>;
            effectiveRelatedRecordCache.set(sourceCacheKey, sourceRecord);
          }
        }
        sourceRecordSnapshot = (sourceRecord || null) as Record<string, any> | null;
        Object.assign(record, sourceRecordSnapshot || {});
        if (sourceRecordSnapshot) {
          record[WORKFLOW_ASSIGNEE_FIELD_KEY] = buildResolvedAssigneeCombo(sourceRecordSnapshot);
          assignProcessLinkedRecordFields(record, moduleId, sourceRecordSnapshot);
        }
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
          const linkCacheKey = `${normalizedModuleId}:${normalizedRecordId}`;
          let linkedRecord = effectiveRelatedRecordCache.get(linkCacheKey);
          if (!linkedRecord) {
            const { data, error } = await supabase
              .from(MODULES[normalizedModuleId]?.table || normalizedModuleId)
              .select('*')
              .eq('id', normalizedRecordId)
              .maybeSingle();
            if (error) throw error;
            if (!data) return;
            linkedRecord = data as Record<string, any>;
            effectiveRelatedRecordCache.set(linkCacheKey, linkedRecord);
          }
          assignProcessLinkedRecordFields(record, normalizedModuleId, linkedRecord);
        } catch (error) {
          console.warn('Could not load linked process record for task template rendering', error);
        }
      })
    );

    const relatedFieldEntries = automationActionVariableFields
      .map((field) => {
        const fieldKey = String(field?.key || '').trim();
        return {
          fieldKey,
          meta: parseWorkflowRelatedFieldKey(fieldKey),
        };
      })
      .filter((item): item is { fieldKey: string; meta: NonNullable<ReturnType<typeof parseWorkflowRelatedFieldKey>> } => Boolean(item.meta));

    await Promise.all(
      relatedFieldEntries.map(async ({ fieldKey, meta }) => {
        if (!sourceRecordSnapshot) return;
        const relationId = String(sourceRecordSnapshot?.[meta.relationFieldKey] || '').trim();
        if (!relationId) return;
        const cacheKey = `${meta.targetModuleId}:${relationId}`;
        let relatedRecord = effectiveRelatedRecordCache.get(cacheKey);
        if (!relatedRecord) {
          try {
            const { data, error } = await supabase
              .from(MODULES[meta.targetModuleId]?.table || meta.targetModuleId)
              .select('*')
              .eq('id', relationId)
              .maybeSingle();
            if (error) throw error;
            if (!data) return;
            relatedRecord = data as Record<string, any>;
            effectiveRelatedRecordCache.set(cacheKey, relatedRecord);
          } catch (error) {
            console.warn('Could not load related record for task template rendering', error);
            return;
          }
        }
        record[fieldKey] = meta.targetFieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY
          ? buildResolvedAssigneeCombo(relatedRecord)
          : relatedRecord?.[meta.targetFieldKey];
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

    automationActionVariableFields.forEach((field) => {
      const fieldKey = String(field?.key || '').trim();
      const label = String(field?.labels?.fa || '').trim();
      if (!fieldKey || !label || !Object.prototype.hasOwnProperty.call(record, fieldKey)) return;
      record[label] = record[fieldKey];
    });

    return record;
  }, [automationActionVariableFields, moduleId, parseRecurrenceInfo, recordId]);

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

    await Promise.allSettled(sourceFields.map(async (field) => {
      try {
        if (field.dynamicOptionsCategory && !nextDynamicOptions[field.dynamicOptionsCategory]) {
          nextDynamicOptions[field.dynamicOptionsCategory] = field.dynamicOptionsCategory === 'task_type'
            ? taskTypeOptions
            : await fetchDynamicOptionsByCategory(supabase, field.dynamicOptionsCategory);
        }

        if (field.type === FieldType.USER) {
          const directory = await fetchAssigneeDirectory(supabase);
          nextRelationOptions[field.key] = directory.users.map((user) => ({
            label: String(user.display_name || user.full_name || 'کاربر بدون نام').trim(),
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
      } catch (error) {
        console.warn('Could not load process task custom field options', field?.key, error);
      }
    }));

    setTaskCustomFieldDynamicOptions(nextDynamicOptions);
    setTaskCustomFieldRelationOptions(nextRelationOptions);
  }, [getTaskCustomFields, taskTypeOptions, tasks]);

  useEffect(() => {
    void loadTaskCustomFieldOptions();
  }, [loadTaskCustomFieldOptions]);

  useEffect(() => {
    const suppressedGroupIds = autoAssignedProcessGroupIdsRef.current;
    const incomingGroupIds = new Set(
      normalizedDraftStages
        .map((stage: any) => getDraftStageProcessGroupMeta(stage).groupId)
        .filter(Boolean)
    );
    Array.from(suppressedGroupIds).forEach((groupId) => {
      if (!incomingGroupIds.has(groupId)) suppressedGroupIds.delete(groupId);
    });
    const nextDraftStages = suppressedGroupIds.size > 0
      ? removeDraftStagesForProcessGroups(normalizedDraftStages, Array.from(suppressedGroupIds))
      : normalizedDraftStages;
    draftLocalRef.current = nextDraftStages;
    setDraftLocal((prev) => (prev === nextDraftStages ? prev : nextDraftStages));
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

  useEffect(() => {
    const target = containerRef.current;
    if (!target || typeof ResizeObserver === 'undefined') return;

    const updateWidth = (nextWidth?: number) => {
      const resolved = Math.round(nextWidth ?? target.getBoundingClientRect().width ?? 0);
      setContainerWidth((prev) => (prev === resolved ? prev : resolved));
    };

    updateWidth();
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      updateWidth(entry?.contentRect?.width);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

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

  const parseAssigneeComboValue = useCallback((raw: any) => parseAssigneeValue(raw), []);
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
  const isMissingColumnLikeError = useCallback((error: any, columnName?: string) => {
    const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
    if (!text) return false;
    const hasSchemaProblem = text.includes('column') || text.includes('schema cache') || text.includes('relation');
    if (!hasSchemaProblem) return false;
    if (!columnName) return true;
    return text.includes(String(columnName || '').toLowerCase());
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
  const resolveCurrentAssigneeDirectory = useCallback(async () => {
    if (assignees.users.length > 0 || assignees.roles.length > 0) {
      return assignees;
    }
    const directory = await fetchAssigneeDirectory(supabase);
    setAssignees({ users: directory.users, roles: directory.roles });
    return { users: directory.users, roles: directory.roles };
  }, [assignees]);
  const normalizeTaskAssigneeRowsForCurrentOrg = useCallback(async (rows: any[]) => {
    const directory = await resolveCurrentAssigneeDirectory().catch(() => assignees);
    return normalizeTaskAssigneeRowsForDirectory((Array.isArray(rows) ? rows : []).map((row) => ({ ...(row || {}) })), directory);
  }, [assignees, resolveCurrentAssigneeDirectory]);
  const insertTasksWithFallback = useCallback(async (rows: any[]) => {
    if (!Array.isArray(rows) || rows.length === 0) return;
    let payload = await normalizeTaskAssigneeRowsForCurrentOrg(rows.map((row) => ({ ...row })));
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
      'process_run_id',
      'process_run_stage_id',
      'process_node_key',
      'process_lane_key',
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
          await syncProcessRunStageFromTask({
            supabaseClient: supabase,
            task: insertedTask,
          });
        }
        const linkedProjectIds = Array.from(new Set(
          insertedRows
            .map((task: any) => String(task?.project_id || '').trim())
            .filter(Boolean)
        ));
        for (const projectId of linkedProjectIds) {
          await syncProjectStatusWithProcessState(projectId);
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
      if (!merged.length && isAssigneeOrgBoundaryError(error)) {
        payload = payload.map((row) => stripTaskAssignee(row));
        continue;
      }
      if (!merged.length && (errorText.includes('column') || errorText.includes('schema cache'))) {
        const fallbackColumn = optionalColumns.find((columnName) => payloadColumns.includes(columnName));
        if (fallbackColumn) merged = [fallbackColumn];
      }
      if (!merged.length) throw error;
      payload = removeColumnsFromRows(payload, merged);
    }
    return [];
  }, [
    extractMissingColumnNames,
    isMissingColumnError,
    normalizeTaskAssigneeRowsForCurrentOrg,
    removeColumnsFromRows,
  ]);
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
      'process_run_id',
      'process_run_stage_id',
      'process_node_key',
      'process_lane_key',
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
          await syncProcessRunStageFromTask({
            supabaseClient: supabase,
            task: data,
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
      const directory = await fetchAssigneeDirectory(supabase);
      setAssignees({ users: directory.users, roles: directory.roles });
    } catch (e) {
      if (isAbortLikeError(e)) return;
      console.warn('Could not fetch assignees', e);
    }
  };
  const fetchTaskTypeOptions = useCallback(async () => {
    try {
      const options = await fetchDynamicOptionsByCategory(supabase, 'task_type');
      setTaskTypeOptions(getMergedTaskTypeOptions(options || []));
    } catch (error) {
      if (String((error as any)?.name || '') === 'AbortError') return;
      setTaskTypeOptions(getMergedTaskTypeOptions([]));
    }
  }, []);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const roleContext = await fetchCurrentUserRoleContext(supabase);
      const snapshot = await fetchSessionBootstrap(supabase);
      const userId = roleContext?.userId || snapshot?.user?.id || null;
      setRolePermissions((roleContext?.permissions || null) as PermissionMap | null);
      if (!userId) return;
      const profile = snapshot?.profile || null;
      setCurrentUser({
        id: String(userId),
        roleId: profile?.role_id ? String(profile.role_id) : (roleContext?.roleId ? String(roleContext.roleId) : null),
        fullName: String(profile?.full_name || snapshot?.user?.user_metadata?.full_name || 'کاربر'),
        softwareRole: roleContext?.softwareRole ? String(roleContext.softwareRole) : (profile?.role ? String(profile.role) : null),
      });
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

  const fetchProcessRunStageRowsForRecord = async () => {
    if (!isProcessRecordModule || !recordId || !moduleId || isProcessPreviewModule) {
      return { rows: [] as any[], runs: [] as any[], stages: [] as any[] };
    }

    if (readOnly && (compact || cardCompact) && !autoOpenTaskId) {
      const batchRuntime = await fetchProcessRuntimeBatchForRecord(supabase, moduleId, recordId).catch(() => null);
      if (batchRuntime) {
        return {
          rows: mapProcessRunStageRows(batchRuntime.runs || [], batchRuntime.stages || []),
          runs: batchRuntime.runs || [],
          stages: batchRuntime.stages || [],
        };
      }
    }

    try {
      const { data, error } = await supabase.rpc('get_process_runtime_for_record', {
        p_module_id: moduleId,
        p_record_id: recordId,
      });
      if (error) throw error;
      const payload = data && typeof data === 'object' ? data as any : {};
      const rpcRuns = Array.isArray(payload?.runs) ? payload.runs : [];
      const rpcStages = Array.isArray(payload?.stages) ? payload.stages : [];
      return {
        rows: mapProcessRunStageRows(rpcRuns, rpcStages),
        runs: rpcRuns,
        stages: rpcStages,
      };
    } catch (error) {
      if (isAbortLikeError(error)) throw error;
      const code = String((error as any)?.code || '').toUpperCase();
      const text = String((error as any)?.message || (error as any)?.details || '').toLowerCase();
      const missingRpc = ['PGRST202', '42883'].includes(code)
        || (text.includes('get_process_runtime_for_record') && text.includes('function'));
      if (!missingRpc) throw error;
    }

    const processRunSelect = 'id, template_id, process_group_id, process_name, status, module_id, record_id, started_at, completed_at, created_at, updated_at';
    const runRowsById = new Map<string, any>();

    try {
      const { data: directRuns, error: directRunsError } = await supabase
        .from('process_runs')
        .select(processRunSelect)
        .eq('module_id', moduleId)
        .eq('record_id', recordId)
        .limit(200);
      if (directRunsError) throw directRunsError;
      (directRuns || []).forEach((run: any) => {
        if (run?.id) runRowsById.set(String(run.id), run);
      });
    } catch (error) {
      if (isAbortLikeError(error)) throw error;
      if (!isMissingColumnLikeError(error)) {
        console.warn('Could not load direct process runs for record', error);
      }
    }

    try {
      const { data: linkRows, error: linkRowsError } = await supabase
        .from('process_run_links')
        .select('process_run_id')
        .eq('module_id', moduleId)
        .eq('record_id', recordId)
        .limit(200);
      if (linkRowsError) throw linkRowsError;

      const linkedRunIds = Array.from(new Set(
        (linkRows || [])
          .map((row: any) => String(row?.process_run_id || '').trim())
          .filter(Boolean)
          .filter((runId: string) => !runRowsById.has(runId))
      ));

      if (linkedRunIds.length > 0) {
        const { data: linkedRuns, error: linkedRunsError } = await supabase
          .from('process_runs')
          .select(processRunSelect)
          .in('id', linkedRunIds)
          .limit(200);
        if (linkedRunsError) throw linkedRunsError;
        (linkedRuns || []).forEach((run: any) => {
          if (run?.id) runRowsById.set(String(run.id), run);
        });
      }
    } catch (error) {
      if (isAbortLikeError(error)) throw error;
      if (!isMissingColumnLikeError(error)) {
        console.warn('Could not load linked process runs for record', error);
      }
    }

    const runRows = Array.from(runRowsById.values());
    if (runRows.length === 0) return { rows: [] as any[], runs: [], stages: [] as any[] };

    try {
      const runIds = runRows.map((run: any) => String(run?.id || '').trim()).filter(Boolean);
      const { data: stageRows, error: stageRowsError } = await supabase
        .from('process_run_stages')
        .select('id, process_run_id, template_stage_id, stage_name, sort_order, status, task_id, assignee_user_id, assignee_role_id, wage, metadata')
        .in('process_run_id', runIds)
        .order('sort_order', { ascending: true });
      if (stageRowsError) throw stageRowsError;

      return {
        rows: mapProcessRunStageRows(runRows, stageRows || []),
        runs: runRows,
        stages: stageRows || [],
      };
    } catch (error) {
      if (isAbortLikeError(error)) throw error;
      if (!isMissingColumnLikeError(error)) {
        console.warn('Could not load process run stages for record', error);
      }
      return { rows: [] as any[], runs: runRows, stages: [] as any[] };
    }
  };

  const mapProcessRunStageRows = (runRows: any[], stageRows: any[]) => {
      const runById = new Map((runRows || []).map((run: any) => [String(run?.id || ''), run]));
      return (stageRows || [])
        .map((stage: any, index: number) => {
        const run = runById.get(String(stage?.process_run_id || '')) || {};
        const metadata = stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {};
        const groupId = String(
          run?.process_group_id
          || metadata?.process_group_id
          || `process_run_${run?.id || stage?.process_run_id || index}`
        ).trim();
        const groupName = String(run?.process_name || metadata?.process_group_name || metadata?.source_template_name || 'فرآیند').trim();
        const normalizedStatus = String(stage?.status || '').trim().toLowerCase();
        const fallbackStatus = String(run?.status || '').trim().toLowerCase() === 'completed' ? 'done' : 'todo';
        const effectiveStatus = fallbackStatus === 'done' && (!normalizedStatus || normalizedStatus === 'todo')
          ? 'done'
          : (normalizedStatus || fallbackStatus);
        const processNodeKey = String(
          stage?.process_node_key
          || metadata?.[PROCESS_NODE_KEY]
          || metadata?.recurrence_info?.[PROCESS_NODE_KEY]
          || ''
        ).trim() || null;
        const processLaneKey = String(
          stage?.process_lane_key
          || metadata?.[PROCESS_LANE_KEY]
          || metadata?.recurrence_info?.[PROCESS_LANE_KEY]
          || 'lane_1'
        ).trim() || 'lane_1';
        const processGraph = metadata?.[PROCESS_GRAPH_METADATA_KEY]
          || metadata?.recurrence_info?.[PROCESS_GRAPH_METADATA_KEY]
          || null;

        return withProcessTaskCustomFieldValues({
          id: stage?.task_id ? String(stage.task_id) : `process_run_stage:${String(stage?.id || index)}`,
          name: stage?.stage_name || `مرحله ${index + 1}`,
          title: stage?.stage_name || `مرحله ${index + 1}`,
          label: stage?.stage_name || `مرحله ${index + 1}`,
          status: effectiveStatus,
          sort_order: Number(stage?.sort_order || ((index + 1) * 10)),
          wage: Number(stage?.wage || 0),
          assignee_id: stage?.assignee_user_id || null,
          assignee_role_id: stage?.assignee_role_id || null,
          assignee_type: stage?.assignee_user_id ? 'user' : (stage?.assignee_role_id ? 'role' : null),
          source_template_id: run?.template_id || metadata?.source_template_id || null,
          source_module_id: run?.module_id || moduleId,
          source_record_id: run?.record_id || recordId,
          process_group_id: groupId,
          process_run_id: run?.id || stage?.process_run_id || null,
          process_run_stage_id: stage?.id || null,
          [PROCESS_NODE_KEY]: processNodeKey,
          [PROCESS_LANE_KEY]: processLaneKey,
          process_run_info: run,
          isProcessRunStagePreview: !stage?.task_id,
          recurrence_info: {
            ...(metadata?.recurrence_info && typeof metadata.recurrence_info === 'object' ? metadata.recurrence_info : {}),
            [PROCESS_NODE_KEY]: processNodeKey,
            [PROCESS_LANE_KEY]: processLaneKey,
            [PROCESS_GRAPH_METADATA_KEY]: processGraph,
            process_group: {
              id: groupId,
              name: groupName,
              template_id: run?.template_id || metadata?.source_template_id || null,
              template_name: groupName,
            },
            process_links: {
              ...(metadata?.process_link_map && typeof metadata.process_link_map === 'object' ? metadata.process_link_map : {}),
              [String(moduleId || '')]: recordId,
            },
          },
        });
      });
  };

  const resolveTemplateNamesForProcessRows = async (rows: any[]) => {
    const rawRows = (Array.isArray(rows) ? rows : []).map((row: any) => withProcessTaskCustomFieldValues(row));
    const needsNameResolution = rawRows.some((row: any) => String(row?.name || '').includes('{{'));
    if (!needsNameResolution) return rawRows;

    if (readOnly && (compact || cardCompact) && !autoOpenTaskId) {
      return rawRows.map((row: any) => {
        const rawName = String(row?.name || '').trim();
        if (!rawName.includes('{{')) return row;
        const compactName = rawName
          .replace(/\{\{[^}]+\}\}/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        return compactName ? { ...row, name: compactName, title: compactName } : row;
      });
    }

    const firstProcessLinks = rawRows
      .map((row: any) => row?.recurrence_info?.process_links)
      .find((links: any) => links && typeof links === 'object') || {};
    const templateContext = await buildTaskTemplateContextRecord({ processLinkMap: firstProcessLinks }).catch(() => ({}));
    return rawRows.map((row: any) => {
      const rawName = String(row?.name || '').trim();
      if (!rawName.includes('{{')) return row;
      const resolvedName = String(
        renderTemplateValueFromRecord(rawName, templateContext, FieldType.TEXT) ?? rawName
      ).trim() || rawName;
      return resolvedName !== rawName ? { ...row, name: resolvedName, title: resolvedName } : row;
    });
  };

  const dedupeProcessRowsByStageIdentity = (rows: any[]) => {
    const result: any[] = [];
    const indexByKey = new Map<string, number>();
    const isPreviewRow = (row: any) =>
      Boolean(row?.isProcessRunStagePreview)
      || String(row?.id || '').startsWith('process_run_stage:');
    const preferRow = (current: any, next: any) => {
      const currentPreview = isPreviewRow(current);
      const nextPreview = isPreviewRow(next);
      if (currentPreview && !nextPreview) return next;
      if (!currentPreview && nextPreview) return current;
      return next;
    };

    (Array.isArray(rows) ? rows : []).forEach((row: any) => {
      const identityKeys = buildProcessStageIdentityKeys(row);
      const fallbackKey = String(row?.id || `${row?.name || ''}_${row?.sort_order || result.length}`).trim();
      const keys = identityKeys.length > 0 ? identityKeys : [fallbackKey];
      const existingIndex = keys.map((key) => indexByKey.get(key)).find((index) => index !== undefined);
      if (existingIndex === undefined) {
        const nextIndex = result.length;
        result.push(row);
        keys.forEach((key) => indexByKey.set(key, nextIndex));
        return;
      }

      const preferred = preferRow(result[existingIndex], row);
      result[existingIndex] = preferred;
      buildProcessStageIdentityKeys(preferred).concat(keys).forEach((key) => indexByKey.set(key, existingIndex));
    });

    return result;
  };

  const fetchTasks = async (attempt = 0): Promise<any[]> => {
    if (isDraftOnlyModule) return [] as any[];
    if (!recordId) {
      setTasks([]);
      setTasksLoaded(true);
      setTasksLoadSucceeded(true);
      return [] as any[];
    }
    try {
      setLoading(true);
      if (attempt === 0) {
        setTasksLoaded(false);
        setTasksLoadSucceeded(false);
      }
      if (moduleId === 'tasks' && forceProcessRecordMode) {
        const { data: singleTask, error: singleTaskError } = await supabase
          .from('tasks')
          .select(PROCESS_TASK_SELECT)
          .eq('id', recordId)
          .maybeSingle();
        if (singleTaskError) throw singleTaskError;
        const nextSingleTask = singleTask ? [withProcessTaskCustomFieldValues(singleTask)] : [];
        setTasks(nextSingleTask);
        setProcessRuntimeRuns([]);
        setProcessRuntimeStages([]);
        setTasksLoadSucceeded(true);
        return nextSingleTask;
      }
      let query = supabase
        .from('tasks')
        .select(PROCESS_TASK_SELECT);

      if (isProcessPreviewModule) {
        setTasks([]);
        setProcessRuntimeRuns([]);
        setProcessRuntimeStages([]);
        setTasksLoadSucceeded(true);
        return [] as any[];
      }

      if (isProcessRecordModule) {
        if (readOnly && (compact || cardCompact) && !autoOpenTaskId) {
          const processRuntime = await fetchProcessRunStageRowsForRecord();
          const [sourceResult, linkedResult] = await Promise.all([
            applyTaskSourceRecordFilter(query, moduleId, recordId)
              .order('sort_order', { ascending: true }),
            supabase
              .from('tasks')
              .select(PROCESS_TASK_SELECT)
              .contains('recurrence_info', { process_links: { [String(moduleId || '')]: String(recordId || '') } })
              .order('sort_order', { ascending: true }),
          ]);

          if (sourceResult.error) throw sourceResult.error;
          if (linkedResult.error) throw linkedResult.error;

          const mergedRows = [
            ...(processRuntime.rows || []),
            ...(sourceResult.data || []),
            ...((linkedResult.data || []).filter((row: any) => {
              const processLinks = parseProcessLinkMap(parseRecurrenceInfo(row?.recurrence_info)?.process_links);
              return String(processLinks[String(moduleId || '')] || '').trim() === String(recordId || '').trim();
            })),
          ];
          const next = await resolveTemplateNamesForProcessRows(dedupeProcessRowsByStageIdentity(mergedRows));
          setTasks(next);
          setProcessRuntimeRuns(processRuntime.runs || []);
          setProcessRuntimeStages(processRuntime.stages || []);
          setTasksLoadSucceeded(true);
          return next;
        }

        const [sourceResult, linkedResult, processRuntime] = await Promise.all([
          applyTaskSourceRecordFilter(query, moduleId, recordId)
            .order('sort_order', { ascending: true }),
          supabase
            .from('tasks')
            .select(PROCESS_TASK_SELECT)
            .contains('recurrence_info', { process_links: { [String(moduleId || '')]: String(recordId || '') } })
            .order('sort_order', { ascending: true }),
          fetchProcessRunStageRowsForRecord(),
        ]);

        if (sourceResult.error) throw sourceResult.error;
        if (linkedResult.error) throw linkedResult.error;

        const mergedRows = [
          ...(processRuntime.rows || []),
          ...(sourceResult.data || []),
          ...((linkedResult.data || []).filter((row: any) => {
            const processLinks = parseProcessLinkMap(parseRecurrenceInfo(row?.recurrence_info)?.process_links);
            return String(processLinks[String(moduleId || '')] || '').trim() === String(recordId || '').trim();
          })),
        ];
        const next = dedupeProcessRowsByStageIdentity(mergedRows);
        const resolvedNext = await resolveTemplateNamesForProcessRows(next);
        setTasks(resolvedNext);
        setProcessRuntimeRuns(processRuntime.runs || []);
        setProcessRuntimeStages(processRuntime.stages || []);
        setTasksLoadSucceeded(true);
        return resolvedNext;
      } else {
        query = applyTaskSourceRecordFilter(query, 'production_orders', recordId);
      }

      const { data, error } = await query.order('sort_order', { ascending: true });

      if (error) throw error;
      const next = (data || []).map((row: any) => withProcessTaskCustomFieldValues(row));
      setTasks(next);
      setProcessRuntimeRuns([]);
      setProcessRuntimeStages([]);
      setTasksLoadSucceeded(true);
      return next;
    } catch (error: any) {
      if (isAbortLikeError(error) && attempt < 1) {
        return fetchTasks(attempt + 1);
      }
      if (!isAbortLikeError(error)) {
        console.warn('Could not load process runtime', error);
      }
      setTasksLoadSucceeded(false);
      return [] as any[];
    } finally {
      setLoading(false);
      setTasksLoaded(true);
    }
  };

  useEffect(() => {
    if (!isReadyToLoad) return;
    setTasks([]);
    setProcessRuntimeRuns([]);
    setProcessRuntimeStages([]);
    setTasksLoaded(false);
    setTasksLoadSucceeded(false);
    fetchLines();
    fetchTasks();
    fetchAssignees();
    fetchTaskTypeOptions();
    fetchCurrentUser();
    if (supportsHandover) {
      fetchProductionShelves();
    }
  }, [recordId, isDraftOnlyModule, isProcessModule, processLineId, supportsHandover, isReadyToLoad, fetchCurrentUser, fetchProductionShelves, fetchTaskTypeOptions]);

  useEffect(() => {
    if (!onRuntimeSnapshot || !moduleId || !recordId) return;
    onRuntimeSnapshot({
      moduleId,
      recordId,
      loaded: tasksLoaded && tasksLoadSucceeded,
      tasks,
      runs: processRuntimeRuns,
      stages: processRuntimeStages,
      hasStartedExecution: isProcessExecutionStarted(tasks),
    });
  }, [
    moduleId,
    onRuntimeSnapshot,
    processRuntimeRuns,
    processRuntimeStages,
    recordId,
    tasks,
    tasksLoaded,
    tasksLoadSucceeded,
  ]);

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
        task_id: stage?.task_id || null,
        isProcessRunStagePreview: true,
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
    if (autoOpenTask && String(autoOpenTask?.id || '') === String(autoOpenTaskId)) {
      autoOpenedTaskIdRef.current = String(autoOpenTaskId);
      setOpenTaskPopoverId(String(autoOpenTaskId));
      return;
    }
    if (!tasks.length) return;

    const targetTask = tasks.find((task: any) => String(task?.id || '') === String(autoOpenTaskId));
    if (!targetTask) return;

    autoOpenedTaskIdRef.current = String(autoOpenTaskId);
    setOpenTaskPopoverId(String(targetTask.id));
  }, [autoOpenTaskId, autoOpenTask, tasks]);

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
          openTaskLayerConfirm({
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
      message.error(toFaErrorMessage(err, 'خطا در بروزرسانی تعداد خط تولید'));
    }
  };

  const closeTaskModal = useCallback(() => {
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
  }, [taskForm]);

  const openTaskModal = (
    lineId: string,
    draftStage?: any,
    processGroupMeta?: { id: string; label?: string | null; templateId?: string | null; templateName?: string | null }
  ) => {
    setOpenDraftSegmentPopoverKey(null);
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
    const ensureAssigneesLoaded = async () => {
      if (!assignees.users.length && !assignees.roles.length) {
        await fetchAssignees();
      }
    };
    const openModal = async () => {
      await ensureAssigneesLoaded();
      const assigneeCombo = draftStage?.default_assignee_role_id
        ? buildAssigneeSelectValue(draftStage.default_assignee_role_id, 'role')
        : buildAssigneeSelectValue(draftStage?.default_assignee_id, 'user');
      const initial = {
        name: draftStage?.name || '',
        sort_order: draftStage?.sort_order || ((tasks.length + 1) * 10),
        wage: draftStage?.wage || 0,
        weight: draftStage?.weight || 0,
        description: draftStage?.description || '',
        task_type: draftStage?.task_type || undefined,
        start_duration_from: draftStage?.start_duration_from || draftStage?.metadata?.start_duration_from || draftStage?.metadata?.duration_start_from || 'project_start',
        start_anchor_stage_node_key: draftStage?.start_anchor_stage_node_key || draftStage?.metadata?.start_anchor_stage_node_key || undefined,
        start_duration_value: Number(draftStage?.start_duration_value ?? draftStage?.metadata?.start_duration_value ?? draftStage?.metadata?.duration_start_value ?? 0),
        start_duration_unit: draftStage?.start_duration_unit || draftStage?.metadata?.start_duration_unit || draftStage?.metadata?.duration_start_unit || 'day',
        duration_from: draftStage?.duration_from || 'project_start',
        due_anchor_stage_node_key: draftStage?.due_anchor_stage_node_key || undefined,
        duration_value: Number(draftStage?.duration_value || 0),
        duration_unit: draftStage?.duration_unit || 'day',
        assignee_combo: assigneeCombo,
      };
      taskForm.setFieldsValue(initial);
      setIsTaskModalOpen(true);
    };
    void openModal();
  };

  const handleCopyActualTask = useCallback((task: any) => {
    const recurrence = parseRecurrenceInfo(task?.recurrence_info);
    const copiedNodeKey = createProcessNodeKey();
    const copiedDraft = {
      ...task,
      id: `draft_copy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: `${String(task?.name || task?.title || 'فعالیت').trim()} - کپی`,
      stage_name: `${String(task?.name || task?.title || 'فعالیت').trim()} - کپی`,
      status: 'todo',
      completed_at: null,
      actual_start_at: null,
      actual_end_at: null,
      task_report: null,
      process_run_stage_id: null,
      [PROCESS_NODE_KEY]: copiedNodeKey,
      [PROCESS_LANE_KEY]: task?.[PROCESS_LANE_KEY] || recurrence?.[PROCESS_LANE_KEY] || 'lane_1',
      sort_order: Number(task?.sort_order || 0) + 1,
      automation_rules: recurrence?.process_automation_rules || [],
      process_task_custom_fields: recurrence?.[PROCESS_TASK_CUSTOM_FIELDS_KEY] || [],
      process_task_status_options: recurrence?.[PROCESS_TASK_STATUS_OPTIONS_KEY] || [],
      metadata: {
        ...recurrence,
        [PROCESS_NODE_KEY]: copiedNodeKey,
        [PROCESS_LANE_KEY]: task?.[PROCESS_LANE_KEY] || recurrence?.[PROCESS_LANE_KEY] || 'lane_1',
      },
    };
    openTaskModal(processLineId, copiedDraft);
  }, [processLineId]);

  const handleAddTask = async (values: any) => {
    if (!recordId || !activeLineId) return;
    const createLockKey = [
      activeLineId,
      draftToCreate?.id || draftToCreate?.sort_order || values?.sort_order || 'manual',
      draftToCreate?.process_group_id || activeProcessGroupMeta?.id || '',
    ].join(':');
    if (taskCreateLockRef.current === createLockKey || isSubmittingTaskModal) return;
    taskCreateLockRef.current = createLockKey;
    try {
      setIsSubmittingTaskModal(true);
      const { data: { user } } = await supabase.auth.getUser();
      const { assigneeType, assigneeId } = parseAssigneeComboValue(values.assignee_combo);
      let dueDate = normalizeDueDateValue(values.due_date);
      const taskDescription = String(values?.description || '').trim() || null;
      const taskType = String(values?.task_type || '').trim() || null;
      const stageAutomationRules = normalizeProcessAutomationRules(draftToCreate?.automation_rules);
      const stageCustomFields = getProcessTaskCustomFieldsFromStage(draftToCreate);
      const stageCustomStatusOptions = getProcessTaskStatusOptionsFromStage(draftToCreate);
      const stageInstructionIds = getInstructionIdsFromStage(draftToCreate);
      const stageProcessLinkMap = draftToCreate?.process_link_map && typeof draftToCreate.process_link_map === 'object'
        ? draftToCreate.process_link_map
        : {};
      const effectiveStageProcessLinkMap = mergeProcessLinkMaps(
        recordId && moduleId ? { [isProductionOrder ? 'production_orders' : moduleId]: String(recordId) } : {},
        stageProcessLinkMap,
      );
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
      const durationFrom = String(values?.duration_from || 'project_start');
      const startDurationValue = Math.max(0, Number(values?.start_duration_value || 0));
      const startDurationUnit = String(values?.start_duration_unit || 'day') === 'hour' ? 'hour' : 'day';
      const startDurationFrom = String(values?.start_duration_from || 'project_start');
      const startAnchorStageNodeKey = requiresSystemScheduleStageAnchor(startDurationFrom)
        ? String(values?.start_anchor_stage_node_key || '').trim() || null
        : null;
      const dueAnchorType: ProcessDueAnchorType = durationFrom === 'project_start'
        ? 'process_start'
        : (durationFrom === 'previous_stage_end' ? 'previous_stage_due' : durationFrom as ProcessDueAnchorType);
      const dueAnchorStageNodeKey = requiresSystemScheduleStageAnchor(dueAnchorType)
        ? String(values?.due_anchor_stage_node_key || '').trim() || null
        : null;

      if (!dueDate) {
        const baseDate = isProcessRecordModule ? await getProcessBaseDate() : new Date();
        const processStagesForDue = [
          ...(Array.isArray(draftLocalRef.current) ? draftLocalRef.current : []),
          ...getLineTaskChain(activeLineId).map((task: any) => ({
            ...task,
            process_node_key: task?.process_node_key || parseRecurrenceInfo(task?.recurrence_info)?.process_node_key,
            process_lane_key: task?.process_lane_key || parseRecurrenceInfo(task?.recurrence_info)?.process_lane_key,
            metadata: parseRecurrenceInfo(task?.recurrence_info),
          })),
        ];
        const computedDueAt = computeProcessStageDueDate({
          stage: {
            ...(draftToCreate || {}),
            sort_order: Number(values?.sort_order || draftToCreate?.sort_order || 10),
            duration_value: durationValue,
            duration_unit: durationUnit,
            due_anchor_type: dueAnchorType,
            due_anchor_stage_node_key: dueAnchorStageNodeKey,
          },
          stages: processStagesForDue,
          processStartedAt: baseDate,
          graph: materializeLegacyProcessGraph(processStagesForDue).graph,
        });
        dueDate = computedDueAt ? computedDueAt.toISOString() : null;
      }

      const templateContext = await buildTaskTemplateContextRecord({
        taskName: values?.name,
        taskType,
        dueDate,
        processLinkMap: effectiveStageProcessLinkMap,
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
      const resolvedCustomFieldContext = {
        ...templateContext,
        task_name: resolvedTaskName || String(values?.name || '').trim(),
        description: resolvedTaskDescription || '',
      };
      const resolvedStageCustomFields = resolveProcessTaskCustomFieldsFromRecord(
        stageCustomFields,
        resolvedCustomFieldContext,
      );
      const resolvedDraftCustomFieldValues = resolveProcessTaskCustomFieldDraftValuesFromRecord(
        stageCustomFields,
        taskCustomFieldDrafts[TASK_MODAL_CUSTOM_FIELD_DRAFT_ID] || {},
        resolvedCustomFieldContext,
      );
      const stageCustomFieldValues = mergeProcessTaskCustomFieldValues(
        resolvedStageCustomFields,
        resolvedDraftCustomFieldValues
      );

      if (draftToCreate && isProcessRecordModule) {
        const targetStageKey = buildProcessStageTaskKey(
          activeProcessGroupMeta?.id || getStageProcessGroupMeta(draftToCreate).groupId,
          resolvedTaskName || values.name,
          values.sort_order || draftToCreate?.sort_order
        );
        const alreadyExists = targetStageKey && (Array.isArray(tasks) ? tasks : []).some((task: any) => {
          const taskMeta = getTaskProcessGroupMeta(task);
          return buildProcessStageTaskKey(
            taskMeta.groupId || activeProcessGroupMeta?.id || 'default_process_group',
            task?.name || task?.title || '',
            task?.sort_order
          ) === targetStageKey;
        });
        if (alreadyExists) {
          message.info('برای این مرحله قبلا فعالیت ثبت شده است');
          closeTaskModal();
          return;
        }
      }

      const draftStageMeta = draftToCreate ? getStageProcessGroupMeta(draftToCreate) : null;
      const effectiveProcessGroupMeta = {
        id: activeProcessGroupMeta?.id || draftStageMeta?.groupId || null,
        label: activeProcessGroupMeta?.label || draftStageMeta?.groupLabel || null,
        templateId: activeProcessGroupMeta?.templateId || draftStageMeta?.templateId || null,
        templateName: activeProcessGroupMeta?.templateName || draftStageMeta?.templateName || null,
      };
      const existingProcessRunStageId = String(draftToCreate?.process_run_stage_id || '').trim();
      const existingProcessRunId = String(
        draftToCreate?.process_run_id
        || draftToCreate?.recurrence_info?.process_run_id
        || ''
      ).trim();
      const processRunContext = existingProcessRunStageId && existingProcessRunId
        ? {
            processRunId: existingProcessRunId,
            processRunStageId: existingProcessRunStageId,
          }
        : (draftToCreate && isProcessRecordModule && moduleId
          ? await ensureProcessRunForDraftStageGroup({
          supabaseClient: supabase,
          moduleId,
          recordId,
          stages: Array.isArray(draftLocalRef.current) ? draftLocalRef.current : [],
          stageScope: 'target',
          targetStage: {
            ...draftToCreate,
            process_group_id: effectiveProcessGroupMeta.id,
            process_group_name: effectiveProcessGroupMeta.label,
            source_template_id: effectiveProcessGroupMeta.templateId,
            source_template_name: effectiveProcessGroupMeta.templateName,
            default_assignee_id: assigneeType === 'user' ? assigneeId : null,
            default_assignee_role_id: assigneeType === 'role' ? assigneeId : null,
            assignee_id: assigneeType === 'user' ? assigneeId : null,
            assignee_role_id: assigneeType === 'role' ? assigneeId : null,
          },
          currentUserId: user?.id || null,
        })
          : { processRunId: null, processRunStageId: null });

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
        source_template_id: effectiveProcessGroupMeta.templateId || null,
        source_stage_sort_order: values.sort_order || draftToCreate?.sort_order || null,
        process_group_id: effectiveProcessGroupMeta.id || null,
        process_run_id: processRunContext.processRunId || null,
        process_run_stage_id: processRunContext.processRunStageId || null,
        process_node_key: draftToCreate ? getProcessStageNodeKey(draftToCreate) : createProcessNodeKey(),
        process_lane_key: draftToCreate ? getProcessStageLaneKey(draftToCreate) : (activeDraftLaneKey || 'lane_1'),
        ...buildTaskSourceInitialValues(isProductionOrder ? 'production_orders' : moduleId, recordId),
      };
      const currentRecurrence = values?.recurrence_info && typeof values.recurrence_info === 'object'
        ? values.recurrence_info
        : {};

      if (resolvedStageCustomFields.length > 0 || stageInstructionIds.length > 0) {
        payload.recurrence_info = {
          ...currentRecurrence,
          ...(taskType ? { task_type: taskType } : {}),
          [PROCESS_TASK_CUSTOM_FIELDS_KEY]: resolvedStageCustomFields,
          [PROCESS_TASK_STATUS_OPTIONS_KEY]: stageCustomStatusOptions,
          [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: stageCustomFieldValues,
          ...(stageInstructionIds.length > 0 ? { [PROCESS_STAGE_INSTRUCTION_IDS_KEY]: stageInstructionIds } : {}),
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
          process_links: effectiveStageProcessLinkMap,
          process_run_id: processRunContext.processRunId || null,
          process_run_stage_id: processRunContext.processRunStageId || null,
          process_node_key: draftToCreate ? getProcessStageNodeKey(draftToCreate) : payload.process_node_key,
          process_lane_key: draftToCreate ? getProcessStageLaneKey(draftToCreate) : payload.process_lane_key,
          process_graph: draftToCreate?.[PROCESS_GRAPH_METADATA_KEY]
            || draftToCreate?.metadata?.[PROCESS_GRAPH_METADATA_KEY]
            || processGraphOverride
            || null,
          start_duration_from: startDurationFrom,
          start_duration_value: startDurationValue,
          start_duration_unit: startDurationUnit,
          start_anchor_stage_node_key: startAnchorStageNodeKey,
          due_anchor_type: dueAnchorType,
          due_anchor_stage_node_key: dueAnchorStageNodeKey,
          duration_value: durationValue,
          duration_unit: durationUnit,
          [PROCESS_TASK_CUSTOM_FIELDS_KEY]: resolvedStageCustomFields,
          [PROCESS_TASK_STATUS_OPTIONS_KEY]: stageCustomStatusOptions,
          [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: stageCustomFieldValues,
          ...(stageInstructionIds.length > 0 ? { [PROCESS_STAGE_INSTRUCTION_IDS_KEY]: stageInstructionIds } : {}),
        };
        if (effectiveProcessGroupMeta.id) {
          payload.recurrence_info = {
            ...(payload.recurrence_info || {}),
            process_group: {
              id: effectiveProcessGroupMeta.id,
              name: effectiveProcessGroupMeta.label || null,
              template_id: effectiveProcessGroupMeta.templateId || null,
              template_name: effectiveProcessGroupMeta.templateName || null,
            },
          };
        }
      }

      const insertedRows = await insertTasksWithFallback([payload]);
      const insertedTask = Array.isArray(insertedRows) && insertedRows.length > 0
        ? withProcessTaskCustomFieldValues(insertedRows[0])
        : null;

      if (insertedTask) {
        if (processRunContext.processRunStageId) {
          await syncProcessRunStageFromTask({
            supabaseClient: supabase,
            task: {
              ...insertedTask,
              process_run_id: processRunContext.processRunId,
              process_run_stage_id: processRunContext.processRunStageId,
            },
          });
        }
        setTasks((prev) => (
          [...prev, insertedTask]
            .filter((task, index, source) => (
              source.findIndex((item) => String(item?.id || '') === String(task?.id || '')) === index
            ))
            .sort((a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0))
        ));
      }

      const nextDrafts = draftToCreate && isProcessRecordModule && !draftToCreate?.isProcessRunStagePreview
        ? removeSingleMatchingDraftStage(
          Array.isArray(draftLocalRef.current) ? draftLocalRef.current : [],
          draftToCreate
        )
        : null;

      if (nextDrafts) {
        draftLocalRef.current = nextDrafts;
        setDraftLocal(nextDrafts);
      }

      message.success(isProcessModule ? 'فعالیت جدید اضافه شد' : 'مرحله جدید اضافه شد');
      closeTaskModal();

      if (nextDrafts) {
        await saveDraftStages(nextDrafts);
      }
      if (moduleId === 'projects' && recordId) {
        await syncProjectStatusWithProcessState(recordId, {
          draftStages: nextDrafts ?? draftLocalRef.current,
        });
      }
      await fetchTasks();
    } catch (error: any) {
      const debugText = String(error?.message || error?.details || error?.hint || '').trim();
      console.error('Task quick-create failed', error);
      message.error(
        debugText
          ? `خطا در ثبت ${isProcessModule ? 'فعالیت' : 'مرحله'}: ${debugText}`
          : toFaErrorMessage(error, 'خطا در ثبت اطلاعات')
      );
    } finally {
      taskCreateLockRef.current = null;
      setIsSubmittingTaskModal(false);
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

  const removeTaskCustomFieldDraftValue = useCallback((taskId: string, fieldKey: string) => {
    setTaskCustomFieldDrafts((prev) => {
      const currentDraft = prev[taskId] || {};
      if (!Object.prototype.hasOwnProperty.call(currentDraft, fieldKey)) return prev;
      const nextTaskDraft = { ...currentDraft };
      delete nextTaskDraft[fieldKey];
      const next = { ...prev };
      if (Object.keys(nextTaskDraft).length > 0) next[taskId] = nextTaskDraft;
      else delete next[taskId];
      return next;
    });
  }, []);

  const startTaskCustomFieldEdit = useCallback((task: any, field: ModuleField, value: any) => {
    const taskId = String(task?.id || '').trim();
    const fieldKey = String(field?.key || '').trim();
    if (!taskId || !fieldKey) return;
    updateTaskCustomFieldDraft(taskId, fieldKey, value);
    setEditingTaskCustomFields((prev) => ({
      ...prev,
      [getTaskCustomFieldEditKey(taskId, fieldKey)]: true,
    }));
  }, [getTaskCustomFieldEditKey, updateTaskCustomFieldDraft]);

  const cancelTaskCustomFieldEdit = useCallback((taskId: string, fieldKey: string) => {
    const normalizedTaskId = String(taskId || '').trim();
    const normalizedFieldKey = String(fieldKey || '').trim();
    if (!normalizedTaskId || !normalizedFieldKey) return;
    removeTaskCustomFieldDraftValue(normalizedTaskId, normalizedFieldKey);
    setEditingTaskCustomFields((prev) => ({
      ...prev,
      [getTaskCustomFieldEditKey(normalizedTaskId, normalizedFieldKey)]: false,
    }));
  }, [getTaskCustomFieldEditKey, removeTaskCustomFieldDraftValue]);

  const handleSaveTaskCustomField = useCallback(async (task: any, fieldKey: string) => {
    if (!task?.id) return;
    const taskId = String(task.id);
    const normalizedFieldKey = String(fieldKey || '').trim();
    if (!normalizedFieldKey) return;
    const recurrence = parseRecurrenceInfo(task?.recurrence_info);
    const fields = getProcessTaskCustomFieldsFromRecurrence(recurrence);
    if (fields.length === 0) return;

    const currentValues = mergeProcessTaskCustomFieldValues(
      fields,
      getProcessTaskCustomFieldValuesFromRecurrence(recurrence)
    );
    const draft = taskCustomFieldDrafts[taskId] || {};
    const nextFieldValue = Object.prototype.hasOwnProperty.call(draft, normalizedFieldKey)
      ? draft[normalizedFieldKey]
      : currentValues[normalizedFieldKey];
    const nextValues = {
      ...currentValues,
      [normalizedFieldKey]: nextFieldValue,
    };
    const nextRecurrence = {
      ...recurrence,
      [PROCESS_TASK_CUSTOM_FIELDS_KEY]: fields,
      [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: nextValues,
    };
    const savingKey = getTaskCustomFieldEditKey(taskId, normalizedFieldKey);

    try {
      setSavingTaskCustomFields((prev) => ({ ...prev, [savingKey]: true }));
      await updateTaskWithFallback(taskId, {
        recurrence_info: nextRecurrence,
      });
      setTasks((prev) => prev.map((row: any) => (
        String(row?.id) === taskId
          ? withProcessTaskCustomFieldValues({ ...row, recurrence_info: nextRecurrence })
          : row
      )));
      removeTaskCustomFieldDraftValue(taskId, normalizedFieldKey);
      setEditingTaskCustomFields((prev) => ({ ...prev, [savingKey]: false }));
      message.success('فیلدهای اختصاصی فعالیت ذخیره شد');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ذخیره فیلدهای اختصاصی ناموفق بود'));
    } finally {
      setSavingTaskCustomFields((prev) => ({ ...prev, [savingKey]: false }));
    }
  }, [getTaskCustomFieldEditKey, parseRecurrenceInfo, removeTaskCustomFieldDraftValue, taskCustomFieldDrafts, updateTaskWithFallback]);

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

      const hasFileManagerTables = await detectFileManagerTables(supabase, false);
      if (hasFileManagerTables) {
        try {
          await createFileManagerOriginForUpload({
            moduleId: 'tasks',
            recordId: taskId,
            recordTitle: String(task?.name || taskId),
            fileUrl: imageUrl,
            fileName: file.name || null,
            mimeType: file.type || null,
            fileType: 'image',
            sortOrder: 0,
          });
        } catch (fileManagerError) {
          console.warn('Could not append uploaded task image to file manager tables', fileManagerError);
        }
      } else {
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
    const taskId = String(task.id || '').trim().replace(/^(process_run_stage|process_run|process_template_stage|process_template|task):/i, '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(taskId)) {
      message.warning('شناسه معتبر فعالیت برای حذف پیدا نشد.');
      return;
    }
    try {
      if (task?.process_run_stage_id) {
        await syncProcessRunStageFromTask({
          supabaseClient: supabase,
          task: {
            ...task,
            id: null,
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
      await moveModuleRecordsToRecycleBin('tasks', [taskId]);
      setTasks((prev) => prev.filter((row: any) => String(row?.id) !== taskId));
      setProcessRuntimeStages((prev) => prev.map((stage: any) => (
        String(stage?.task_id || '') === taskId
          ? { ...stage, task_id: null }
          : stage
      )));
      closeTaskQuickModal(false);
      message.success('فعالیت به سطل بازیافت منتقل شد');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'انتقال فعالیت به سطل بازیافت ناموفق بود'));
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
    const roleId = task?.assignee_role_id ? String(task.assignee_role_id) : null;
    const userId = task?.assignee_id ? String(task.assignee_id) : null;
    if (roleId) {
      const role = task?.assigned_role || assignees.roles.find((item: any) => String(item?.id) === roleId);
      return role?.title ? `تیم ${role.title}` : 'در حال بارگذاری نام تیم...';
    }
    if (userId) {
      const user = task?.assignee || assignees.users.find((item: any) => String(item?.id) === userId);
      return user?.display_name || user?.full_name || user?.email || user?.mobile_1 || 'در حال بارگذاری نام مسئول...';
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
    const durationFrom = getProcessDueAnchorLabel(stage);
    if (!durationValue) return `از ${durationFrom}`;
    return `${toPersianNumber(durationValue)} ${durationUnit} بعد از ${durationFrom}`;
  }, []);

  const getProcessStageShapeStyle = useCallback((
    index: number,
    options?: { summary?: boolean },
  ): React.CSSProperties => {
    if (!isProcessModule) return {};
    const clipPath = index === 0
      ? `polygon(100% 0, ${PROCESS_STAGE_TIP_WIDTH}px 0, 0 50%, ${PROCESS_STAGE_TIP_WIDTH}px 100%, 100% 100%)`
      : `polygon(100% 0, ${PROCESS_STAGE_TIP_WIDTH}px 0, 0 50%, ${PROCESS_STAGE_TIP_WIDTH}px 100%, 100% 100%, calc(100% - ${PROCESS_STAGE_NOTCH_WIDTH}px) 50%)`;
    return {
      clipPath,
      WebkitClipPath: clipPath,
      borderRadius: 0,
      ...(options?.summary
        ? {}
        : {
            paddingLeft: 20,
            paddingRight: index === 0 ? 10 : 18,
          }),
    };
  }, [isProcessModule]);

  const renderDraftProcessStageOutline = useCallback((index: number) => {
    if (!isProcessModule) return null;
    return <DraftProcessStageOutline hasRightNotch={index !== 0} />;
  }, [isProcessModule]);

  const getProcessBarDisplayMode = useCallback((segments: any[]): ProcessBarDisplayMode => {
    if (isMobileProcessViewport) return 'dense';
    if (!compact && !cardCompact) return 'full';

    const resolvedWidth = containerWidth || (cardCompact ? 320 : 480);
    const stageCount = Math.max(1, Array.isArray(segments) ? segments.length : 0);
    const estimatedRequiredWidth = (Array.isArray(segments) ? segments : []).reduce((sum, segment) => {
      const label = String(segment?.title || segment?.name || segment?.label || '').trim();
      return sum + Math.max(76, label.length * 6.5 + 48);
    }, Math.max(0, stageCount - 1) * 2 + 8);

    if (estimatedRequiredWidth <= resolvedWidth) return 'full';
    if (!cardCompact && (stageCount >= 9 || (resolvedWidth <= PROCESS_BAR_BREAKPOINTS.summary && stageCount >= 4))) {
      return 'summary';
    }
    if (resolvedWidth <= PROCESS_BAR_BREAKPOINTS.dense || stageCount >= 5) {
      return 'dense';
    }
    return 'full';
  }, [cardCompact, compact, containerWidth, isMobileProcessViewport]);

  const getDenseSegmentLabel = useCallback((value: unknown) => {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    const compactWords = raw.split(/\s+/).filter(Boolean).slice(0, 2).join(' ');
    if (compactWords.length <= 14) return compactWords;
    return `${compactWords.slice(0, 13).trim()}…`;
  }, []);

  const getExpandedProcessSegmentWidth = useCallback((value: unknown) => {
    const raw = String(value || '').trim();
    if (!raw) return 92;
    return Math.max(120, Math.min(720, raw.length * 8 + 64));
  }, []);

  const shouldShortenProcessSegmentLabel = useCallback((
    labelValue: unknown,
    segmentCount: number,
    displayMode: ProcessBarDisplayMode,
    expanded: boolean,
  ) => {
    if (expanded || displayMode !== 'dense') return false;
    const raw = String(labelValue || '').trim();
    if (!raw) return false;
    const resolvedWidth = containerWidth || (cardCompact ? 320 : (compact ? 480 : 720));
    const availablePerSegment = Math.max(76, (resolvedWidth - 16 - Math.max(0, segmentCount - 1) * 2) / Math.max(1, segmentCount));
    return raw.length * 6.3 + 34 > availablePerSegment;
  }, [cardCompact, compact, containerWidth]);

  const toggleExpandedProcessBar = useCallback((barKey: string) => {
    setExpandedProcessBars((prev) => {
      const next = new Set(prev);
      if (next.has(barKey)) {
        next.delete(barKey);
      } else {
        next.add(barKey);
      }
      return next;
    });
  }, []);

  const renderProcessBarExpandToggle = useCallback((barKey: string, expanded: boolean) => (
    <button
      type="button"
      aria-label={expanded ? 'نمای فشرده فرآیند' : 'نمای باز فرآیند'}
      title={expanded ? 'نمای فشرده فرآیند' : 'نمای باز فرآیند'}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleExpandedProcessBar(barKey);
      }}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-[13px] leading-none text-gray-600 shadow-sm transition-colors hover:border-[rgba(var(--brand-400-rgb),0.8)] hover:text-[rgba(var(--brand-700-rgb),1)] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
    >
      {expanded ? <CompressOutlined /> : <ColumnWidthOutlined />}
    </button>
  ), [toggleExpandedProcessBar]);

  const getSummarySegmentLabel = useCallback((value: unknown) => {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    if (raw.length <= 2) return raw;
    return raw.slice(0, 2);
  }, []);

  const getTaskAssigneeVisual = useCallback((task: any) => {
    const roleId = String(task?.assignee_role_id || '').trim();
    const userId = String(task?.assignee_id || '').trim();
    const assigneeType = String(task?.assignee_type || '').trim().toLowerCase();

    if (roleId || assigneeType === 'role') {
      const resolvedRoleId = roleId || userId;
      const role = assignees.roles.find((item: any) => String(item?.id || '') === resolvedRoleId);
      const label = String(role?.title || role?.name || task?.assigned_role?.title || 'نقش').trim();
      return {
        type: 'role' as const,
        label,
        avatarUrl: String(role?.avatar_url || '').trim() || null,
      };
    }

    if (!userId) return null;

    const joinedUser = task?.assignee && typeof task.assignee === 'object' ? task.assignee : {};
    const directoryUser = assignees.users.find((item: any) => String(item?.id || '') === userId) || {};
    const label = String(
      joinedUser?.display_name ||
      joinedUser?.full_name ||
      directoryUser?.display_name ||
      directoryUser?.full_name ||
      joinedUser?.email ||
      directoryUser?.email ||
      joinedUser?.mobile_1 ||
      directoryUser?.mobile_1 ||
      'کاربر'
    ).trim();

    return {
      type: 'user' as const,
      label,
      avatarUrl: String(joinedUser?.avatar_url || directoryUser?.avatar_url || '').trim() || null,
    };
  }, [assignees.roles, assignees.users]);

  const renderTaskAssigneeAvatar = useCallback((task: any, displayMode: ProcessBarDisplayMode) => {
    const hasCreatedTask = Boolean(task?.task_id || (!task?.isProcessRunStagePreview && task?.id));
    if (!hasCreatedTask) return null;

    const visual = getTaskAssigneeVisual(task);
    if (!visual) return null;

    const avatarSize = displayMode === 'dense' ? 14 : 16;
    const iconClassName = displayMode === 'dense' ? 'text-[9px]' : 'text-[10px]';
    return (
      <span className="inline-flex shrink-0" title={visual.label}>
      <ProfileAvatar
        size={avatarSize}
        src={visual.avatarUrl}
        icon={visual.type === 'role' ? <TeamOutlined className={iconClassName} /> : <UserOutlined className={iconClassName} />}
        name={visual.label}
        className="shrink-0 border border-white/70 bg-white/20 text-white shadow-sm"
        imageLoading="lazy"
      />
      </span>
    );
  }, [getTaskAssigneeVisual]);

  const getSegmentProgressState = useCallback((segment: any) => {
    if (!segment || segment.type !== 'task') return 'draft' as const;
    const normalizedStatus = String(segment?.status || '').trim().toLowerCase();
    if (PROCESS_BAR_DONE_STATUSES.has(normalizedStatus)) return 'done' as const;
    if (PROCESS_BAR_ACTIVE_STATUSES.has(normalizedStatus)) return 'active' as const;
    return 'pending' as const;
  }, []);

  const getCurrentProcessSegment = useCallback((segments: any[]) => {
    if (!Array.isArray(segments) || segments.length === 0) return null;

    const activeSegment = segments.find((segment) => getSegmentProgressState(segment) === 'active');
    if (activeSegment) return activeSegment;

    const firstPendingSegment = segments.find((segment) => {
      const state = getSegmentProgressState(segment);
      return state === 'pending' || state === 'draft';
    });
    if (firstPendingSegment) return firstPendingSegment;

    return segments[segments.length - 1] || null;
  }, [getSegmentProgressState]);

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
    const fieldKey = String(field?.key || '');
    const disabled = !!savingTaskCustomFields[getTaskCustomFieldEditKey(taskId, fieldKey)];
    const onValueChange = (nextValue: any) => updateTaskCustomFieldDraft(taskId, fieldKey, nextValue);
    const options = getProcessTaskFieldOptions(field);

    return (
      <div className={disabled ? 'pointer-events-none opacity-60' : undefined}>
        <SmartFieldRenderer
          field={{ ...field, readonly: disabled }}
          value={value}
          onChange={onValueChange}
          forceEditMode={true}
          compactMode
          options={options}
          onOptionsUpdate={() => { void loadTaskCustomFieldOptions([field]); }}
          allValues={{
            ...(task || {}),
            ...getTaskCustomFieldValues(task),
            [fieldKey]: value,
          }}
          recordId={taskId === TASK_MODAL_CUSTOM_FIELD_DRAFT_ID ? undefined : taskId}
          moduleId="tasks"
          overlayZIndexBase={12640}
          popupContainer={resolveOverlayPopupContainer}
        />
      </div>
    );

  }, [getProcessTaskFieldOptions, getTaskCustomFieldEditKey, getTaskCustomFieldValues, loadTaskCustomFieldOptions, savingTaskCustomFields, updateTaskCustomFieldDraft]);

  const renderTaskCustomFieldInline = useCallback((task: any, field: ModuleField, currentValue: any) => {
    const taskId = String(task?.id || '').trim();
    const fieldKey = String(field?.key || '').trim();
    const editKey = getTaskCustomFieldEditKey(taskId, fieldKey);
    const isEditing = !!editingTaskCustomFields[editKey];
    const isSaving = !!savingTaskCustomFields[editKey];
    const taskDraft = taskCustomFieldDrafts[taskId] || {};
    const editValue = Object.prototype.hasOwnProperty.call(taskDraft, fieldKey)
      ? taskDraft[fieldKey]
      : currentValue;
    const options = getProcessTaskFieldOptions(field);
    const allValues = {
      ...(task || {}),
      ...getTaskCustomFieldValues(task),
      [fieldKey]: isEditing ? editValue : currentValue,
    };

    if (isEditing) {
      return (
        <div className={`flex min-w-[150px] w-full gap-1 ${field.type === FieldType.SUPER_LONG_TEXT || field.type === FieldType.LONG_TEXT ? 'items-start' : 'items-center'}`}>
          <div className="min-w-0 flex-1">
            {renderTaskCustomFieldInput(task, field, editValue)}
          </div>
          <Button
            size="small"
            type="text"
            icon={<CheckOutlined />}
            loading={isSaving}
            onClick={() => { void handleSaveTaskCustomField(task, fieldKey); }}
            className="!h-8 !w-8 !min-w-8 rounded-full border border-gray-200 text-gray-500 hover:!border-emerald-200 hover:!text-emerald-600"
          />
          <Button
            size="small"
            type="text"
            icon={<CloseOutlined />}
            disabled={isSaving}
            onClick={() => cancelTaskCustomFieldEdit(taskId, fieldKey)}
            className="!h-8 !w-8 !min-w-8 rounded-full border border-gray-200 text-gray-500 hover:!border-rose-200 hover:!text-rose-600"
          />
        </div>
      );
    }

    return (
      <div
        className={`group flex min-h-[32px] cursor-pointer justify-between rounded-lg border border-transparent px-3 -mx-3 transition-colors hover:border-gray-100 hover:bg-gray-50 dark:hover:border-gray-700 dark:hover:bg-white/5 ${field.type === FieldType.SUPER_LONG_TEXT || field.type === FieldType.LONG_TEXT ? 'items-start py-2' : 'items-center'}`}
        onClick={() => startTaskCustomFieldEdit(task, field, currentValue)}
      >
        <div className="min-w-0 flex-1 text-gray-800 dark:text-gray-200">
          <SmartFieldRenderer
            field={field}
            value={currentValue}
            onChange={() => undefined}
            forceEditMode={false}
            compactMode
            options={options}
            allValues={allValues}
            recordId={taskId}
            moduleId="tasks"
            overlayZIndexBase={12640}
            popupContainer={resolveOverlayPopupContainer}
          />
        </div>
        <EditOutlined className="text-leather-400 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    );
  }, [cancelTaskCustomFieldEdit, editingTaskCustomFields, getProcessTaskFieldOptions, getTaskCustomFieldEditKey, getTaskCustomFieldValues, handleSaveTaskCustomField, renderTaskCustomFieldInput, savingTaskCustomFields, startTaskCustomFieldEdit, taskCustomFieldDrafts]);

  const renderDraftTemplatePicker = useCallback((targetKey: string) => (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-label="نمایش متغیرهای قابل کپی"
        className="inline-flex cursor-pointer items-center justify-center rounded-md p-1 text-gray-500 transition-colors hover:text-[rgba(var(--brand-700-rgb),1)]"
        style={{ userSelect: 'auto' }}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDraftTemplatePickerOpenKey(targetKey);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          setDraftTemplatePickerOpenKey(targetKey);
        }}
      >
        <CopyOutlined />
      </span>
      <Modal
        open={draftTemplatePickerOpenKey === targetKey}
        onCancel={() => setDraftTemplatePickerOpenKey(null)}
        footer={null}
        width={560}
        centered
        destroyOnHidden={false}
        title="انتخاب متغیر مرحله"
        styles={{ body: { paddingTop: 12 } }}
      >
        <div className="space-y-3">
          <AdaptiveSelectField
            {...adaptiveModalSelectProps}
            allowClear
            showSearch
            value={draftTemplatePickerValueMap[targetKey]}
            options={stageTemplateVariableOptions.map((item) => ({
              value: item.key,
              label: item.label,
              token: item.token,
              searchText: `${item.label} ${item.token} ${item.key}`,
            }))}
            placeholder="جستجو و انتخاب متغیر"
            pickerTitle="انتخاب متغیر"
            optionFilterProp="searchText"
            popupStyle={buildStandardSelectPopupRootStyle({ zIndex: 13120, maxWidth: 'calc(100vw - 1rem)' })}
            optionRender={(option) => {
              const data = option?.data ?? option;
              return (
                <div className="min-w-0 py-1 text-right">
                  <div className="text-xs font-semibold text-gray-800 dark:text-gray-100">{String(data?.label || '')}</div>
                  <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 break-all" dir="ltr">
                    {String(data?.token || '')}
                  </div>
                </div>
              );
            }}
            onChange={(nextValue) => {
              setDraftTemplatePickerValueMap((prev) => ({
                ...prev,
                [targetKey]: String(nextValue || '').trim() || undefined,
              }));
            }}
            notFoundContent="متغیری در دسترس نیست."
          />
          <div className="rounded-md border border-dashed border-gray-200 px-3 py-2 text-[11px] text-gray-500 dark:border-gray-700 dark:text-gray-400" dir="ltr">
            {stageTemplateVariableOptionMap.get(String(draftTemplatePickerValueMap[targetKey] || ''))?.token || '{{...}}'}
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              size="middle"
              icon={<CopyOutlined />}
              disabled={!stageTemplateVariableOptionMap.get(String(draftTemplatePickerValueMap[targetKey] || ''))}
              onClick={() => {
                const selected = stageTemplateVariableOptionMap.get(String(draftTemplatePickerValueMap[targetKey] || ''));
                if (!selected) return;
                void copyDraftTemplateTokenToClipboard(selected.token);
              }}
            >
              کپی
            </Button>
            <Button
              type="primary"
              size="middle"
              icon={<SnippetsOutlined />}
              disabled={!stageTemplateVariableOptionMap.get(String(draftTemplatePickerValueMap[targetKey] || ''))}
              onClick={() => {
                const selected = stageTemplateVariableOptionMap.get(String(draftTemplatePickerValueMap[targetKey] || ''));
                if (!selected) return;
                handleDraftTemplateTokenPick(targetKey, selected.token);
              }}
            >
              درج در فیلد
            </Button>
          </div>
        </div>
      </Modal>
    </>
  ), [adaptiveModalSelectProps, copyDraftTemplateTokenToClipboard, draftTemplatePickerOpenKey, draftTemplatePickerValueMap, handleDraftTemplateTokenPick, stageTemplateVariableOptionMap, stageTemplateVariableOptions]);

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
    const currentAssigneeRoleId = task?.assignee_role_id ? String(task.assignee_role_id) : null;
    const currentAssigneeUserId = !currentAssigneeRoleId && task?.assignee_id ? String(task.assignee_id) : null;
    const currentAssigneeRole = currentAssigneeRoleId
      ? (task?.assigned_role || assignees.roles.find((item: any) => String(item?.id) === currentAssigneeRoleId))
      : null;
    const currentAssigneeUser = currentAssigneeUserId
      ? (task?.assignee || assignees.users.find((item: any) => String(item?.id) === currentAssigneeUserId))
      : null;
    const currentAssigneeLabel = currentAssigneeRoleId
      ? String(currentAssigneeRole?.title || currentAssigneeRole?.name || '').trim() || 'در حال بارگذاری نام تیم...'
      : (
          String(
            currentAssigneeUser?.display_name
            || currentAssigneeUser?.full_name
            || currentAssigneeUser?.email
            || currentAssigneeUser?.mobile_1
            || ''
          ).trim() || (currentAssigneeUserId ? 'در حال بارگذاری نام مسئول...' : '')
        );
    const shouldRenderCurrentAssigneeFallbackOption = Boolean(
      currentAssigneeCombo
      && (
        (currentAssigneeRoleId && !assignees.roles.some((item: any) => String(item?.id) === currentAssigneeRoleId))
        || (currentAssigneeUserId && !assignees.users.some((item: any) => String(item?.id) === currentAssigneeUserId))
      )
    );
    const fallback = getTaskOptionalFieldFallback(task);
    const customFields = getTaskCustomFields(task);
    const currentCustomFieldValues = getTaskCustomFieldValues(task);
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
    const relatedRows = getRelatedTaskRecordRows(task);
    const taskLockState = getRecordLockStateFromRecord(task);
    const isTaskLocked = taskLockState.isLocked;
    const canLockTaskRecord = canUseRecordLockPermission(rolePermissions, 'tasks', 'lock', currentUser.softwareRole);
    const canUnlockTaskRecord = canUseRecordLockPermission(rolePermissions, 'tasks', 'unlock', currentUser.softwareRole);
    const handleTaskLockChanged = (nextLockState: RecordLockState) => {
      setTaskLockPatches((prev) => ({
        ...prev,
        [String(task?.id || '')]: mergeRecordLockIntoRecord(prev[String(task?.id || '')] || {}, nextLockState),
      }));
    };


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
        <div className="mb-3 flex items-start justify-between gap-3 border-b border-[rgba(var(--brand-200-rgb),0.45)] pb-2 dark:border-[rgba(var(--brand-300-rgb),0.18)]">
          <div className="space-y-2">
            <h4 className="m-0 text-sm font-bold text-[rgba(var(--brand-800-rgb),1)] dark:text-gray-100 line-clamp-2">{task.title || task.name}</h4>
            {(taskStatusLabel || taskTypeValue) ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {taskStatusLabel ? <Tag color={taskStatusTagColor}>{taskStatusLabel}</Tag> : null}
                {taskTypeValue ? <Tag>{taskTypeValue}</Tag> : null}
              </div>
            ) : null}
          </div>
          <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
            <RecordLockControl
              moduleId="tasks"
              recordId={String(task?.id || '')}
              lockState={taskLockState}
              canLock={canLockTaskRecord}
              canUnlock={canUnlockTaskRecord}
              showUnlocked={canLockTaskRecord}
              showLockedLabel
              onChanged={handleTaskLockChanged}
            />
          </div>
        </div>

        <div className="mb-3">
          <RecordImageBox
            moduleId="tasks"
            recordId={String(task?.id || '')}
            imageUrl={task?.image_url || null}
            canEdit={canManageTaskFiles && !isTaskLocked}
            canViewFilesManager={filesAccess.canViewRecordFilesManager}
            canEditFilesManager={canManageTaskFiles && !isTaskLocked}
            canUploadFilesManager={canManageTaskFiles}
            canDeleteFilesManager={canDeleteTaskFiles && !isTaskLocked}
            onImageUpdate={isTaskLocked ? undefined : (file) => handleTaskImageUpload(task, file)}
            onMainImageChange={isTaskLocked ? undefined : (url) => { void handleTaskMainImageChange(task, url); }}
          />
          {canEditTaskStatus ? (
            <div className="mt-2 flex justify-center">
              <TaskActionButtons
                task={task}
                currentUser={{
                  id: currentUser.id,
                  fullName: currentUser.fullName,
                }}
                onTaskUpdated={handleHandoverTaskUpdated}
                size="middle"
                disabled={isTaskLocked}
                showReview
                modalZIndex={15120}
              />
            </div>
          ) : null}
        </div>

        <div className="space-y-3 mb-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <div className="h-11 flex items-center justify-between sm:justify-start bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-gray-700 rounded-lg sm:rounded-full pl-2 sm:pl-1 pr-3 py-1 gap-1 sm:gap-2">
                <span className="text-xs text-gray-400 shrink-0">نام مسئول:</span>
                <Select
                  variant="borderless"
                  value={currentAssigneeCombo}
                  onChange={(val) => { void handleTaskAssigneeChange(task, val); }}
                  className="w-full max-w-full smartform-inline-assignee-select font-semibold text-gray-700 dark:text-gray-300"
                  disabled={!canEditTaskAssignee || isTaskLocked}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  getPopupContainer={resolveSelectPopupContainer}
                  styles={{ popup: { root: buildStandardSelectPopupRootStyle({ minWidth: 220, zIndex: 12050, maxWidth: 'calc(100vw - 1rem)' }) } }}
                >
                  {shouldRenderCurrentAssigneeFallbackOption && currentAssigneeCombo ? (
                    <Select.Option
                      key={`popup-current-assignee-${currentAssigneeCombo}`}
                      value={currentAssigneeCombo}
                      label={currentAssigneeLabel}
                    >
                      <Space>
                        {currentAssigneeRoleId ? <TeamOutlined /> : <UserOutlined />}
                        {currentAssigneeLabel}
                      </Space>
                    </Select.Option>
                  ) : null}
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
            </div>

            <div className="min-w-0">
              <div className="smartform-inline-status h-11 flex items-center bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-gray-700 rounded-lg sm:rounded-full px-3 py-1 gap-2">
                <span className="text-xs text-gray-400 shrink-0">وضعیت:</span>
                <Select
                  variant="borderless"
                  value={task.status}
                  onChange={(val) => { void handleStatusChange(task.id, val); }}
                  className="w-full max-w-full font-semibold text-gray-700 dark:text-gray-300"
                  disabled={!canEditTaskStatus || isTaskLocked}
                  getPopupContainer={resolveSelectPopupContainer}
                  styles={{ popup: { root: buildStandardSelectPopupRootStyle({ minWidth: 180, zIndex: 12050, maxWidth: 'calc(100vw - 1rem)' }) } }}
                  options={taskStatusOptions.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                />
              </div>
            </div>
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
              </div>
              <div className="space-y-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/80 p-2">
                {customFields.map((field) => (
                  <div key={`${task.id}-${field.key}`} className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1 text-[11px] text-gray-500">
                      <span>{getFieldLabelFa(field)}</span>
                      {field.validation?.required ? <Tag color="error" className="!m-0">الزامی</Tag> : null}
                    </div>
                    {renderTaskCustomFieldInline(task, field, currentCustomFieldValues[String(field.key)])}
                  </div>
                ))}
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
              <div key={`${task.id}-${row.moduleId}-${row.recordId}`} className="flex items-center gap-2">
                <LinkOutlined className="text-[rgba(var(--brand-700-rgb),1)]" />
                <span className="min-w-0">
                  {row.label}:{' '}
                  <Link
                    to={`/${row.moduleId}/${row.recordId}`}
                    className="text-[rgba(var(--brand-700-rgb),1)] hover:underline"
                    onClick={() => closeTaskQuickModal(false)}
                  >
                    {toPersianNumber(row.value)}
                  </Link>
                </span>
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
                    openTaskLayerConfirm({
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
                    openTaskLayerConfirm({
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
              <Link
                to={`/tasks/${task.id}`}
                className="inline-flex items-center gap-1 px-2 text-xs text-[rgba(var(--brand-700-rgb),1)] hover:text-[rgba(var(--brand-600-rgb),1)] hover:underline"
                onMouseDown={(event) => {
                  event.stopPropagation();
                }}
                onTouchStart={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  closeTaskQuickModal(false);
                }}
              >
                <ArrowRightOutlined />
                جزئیات کامل
              </Link>
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

  const saveDraftStages = useCallback(async (
    nextStages: any[],
    explicitProcessGraph?: ProcessGraphDefinition | null,
  ) => {
    let persistedStages = isProcessModule
      ? (() => {
          const materialized = materializeLegacyProcessGraph(nextStages);
          return attachProcessGraphToStages(
            materialized.stages,
            explicitProcessGraph || processGraphOverride || materialized.graph,
          );
        })()
      : nextStages;
    const previousStages = Array.isArray(draftLocalRef.current) ? draftLocalRef.current : [];
    draftLocalRef.current = persistedStages;
    setDraftLocal(persistedStages);
    if (moduleId === 'process_templates' && recordId) {
      try {
        const refreshed = await syncProcessTemplateStages(supabase, String(recordId), persistedStages);
        if (Array.isArray(refreshed)) {
          persistedStages = refreshed;
          draftLocalRef.current = refreshed;
          setDraftLocal(refreshed);
        }
        const previousSignature = JSON.stringify(previousStages || []);
        const nextSignature = JSON.stringify(persistedStages || []);
        if (previousSignature !== nextSignature) {
          void (async () => {
            try {
              const session = await fetchSessionBootstrap(supabase);
              const changedStageNames = (persistedStages || [])
                .map((stage: any) => String(stage?.name || stage?.stage_name || stage?.title || '').trim())
                .filter(Boolean)
                .slice(0, 3);
              await insertRecordActivity({
                supabase,
                moduleId: 'process_templates',
                recordId: String(recordId),
                action: 'process_updated',
                fieldName: 'template_stages_preview',
                fieldLabel: 'مراحل الگو',
                oldValue: null,
                newValue: changedStageNames.join('، ') || 'مراحل فرآیند',
                userId: session.user?.id || null,
                recordTitle: null,
                metadata: {
                  source: 'process_v2_stage_editor',
                  changeKind: 'process_v2_stage_saved',
                  summary: 'تنظیمات مرحله‌های فرآیند به‌روزرسانی شد',
                  stageCount: persistedStages.length,
                },
              });
            } catch (error) {
              console.warn('Process template stage changelog failed:', error);
            }
          })();
        }
      } catch (error: any) {
        message.error(toFaErrorMessage(error, 'ذخیره مرحله‌های فرآیند ناموفق بود.'));
        throw error;
      }
    }
    if (onDraftStagesChange) await onDraftStagesChange(persistedStages);
    if (moduleId === 'production_boms' && recordId) {
      await supabase.from('production_boms').update({ production_stages_draft: persistedStages }).eq('id', recordId);
    }
    if (moduleId === 'projects' && recordId) {
      await syncProjectStatusWithProcessState(recordId, {
        draftStages: persistedStages,
        tasks,
      });
    }
  }, [isProcessModule, moduleId, onDraftStagesChange, processGraphOverride, recordId, tasks]);

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

  const appendProcessTemplateSelectValue = useMemo(() => {
    const normalizedId = String(appendProcessTemplateId || '').trim();
    if (!normalizedId) return undefined;

    const selectedOption = processTemplateOptions.find((option) => String(option.value) === normalizedId);
    return {
      value: normalizedId,
      label: selectedOption?.label || appendProcessTemplateLabel || normalizedId,
    };
  }, [appendProcessTemplateId, appendProcessTemplateLabel, processTemplateOptions]);

  const handleAppendProcessTemplateSelectChange = useCallback((nextValue: any, option?: any) => {
    const rawValue = typeof nextValue === 'object' && nextValue !== null
      ? nextValue.value
      : nextValue;
    const normalizedValue = String(rawValue || '').trim();

    if (!normalizedValue) {
      setAppendProcessTemplateId(null);
      setAppendProcessTemplateLabel(null);
      return;
    }

    const rawLabel = typeof nextValue === 'object' && nextValue !== null
      ? nextValue.label
      : option?.label;
    setAppendProcessTemplateId(normalizedValue);
    setAppendProcessTemplateLabel(String(rawLabel || '').trim() || null);
  }, []);

  const handleOpenAppendProcessModal = useCallback(async (
    mode: 'append' | 'links' = 'append',
    group?: { id?: string | null; templateId?: string | null; stages?: any[] }
  ) => {
    if (!isProcessRecordModule || readOnly) return;
    const normalizedTemplateId = String(group?.templateId || '').trim() || null;
    const stageSeed = Array.isArray(group?.stages) ? group?.stages : [];
    const seededLinks = extractProcessLinkMapFromStages(stageSeed);
    const seededTargetModuleIds = normalizeProcessTargetModuleIds(
      [
        ...stageSeed.flatMap((stage: any) => Array.isArray(stage?.process_target_module_ids) ? stage.process_target_module_ids : []),
        ...Object.keys(seededLinks),
      ],
      moduleId
    );
    setAppendProcessModalMode(mode);
    setAppendProcessModalGroupId(mode === 'links' ? (String(group?.id || '').trim() || null) : null);
    setAppendProcessTemplateId(null);
    setAppendProcessTemplateLabel(null);
    setAppendProcessTargetModuleIds([]);
    appendProcessLinkedRecordsRef.current = {};
    setAppendProcessLinkedRecords({});
    setAppendProcessRelationOptions({});
    setAppendProcessRelationLoading({});
    setAppendProcessModalOpen(true);
    await loadProcessTemplateOptions();
    if (mode === 'links') {
      setAppendProcessTemplateId(normalizedTemplateId);
      setAppendProcessTemplateLabel(null);
      setAppendProcessTargetModuleIds(seededTargetModuleIds);
      appendProcessLinkedRecordsRef.current = seededLinks;
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

  const resolveKnownProcessLinks = useCallback(async (targetModuleIds: string[], explicitLinks?: Record<string, string | null> | null) => {
    const normalizedTargetModuleIds = normalizeProcessTargetModuleIds(targetModuleIds, moduleId);
    const directContextLinks = mergeProcessLinkMaps(
      recordId && moduleId ? { [moduleId]: String(recordId) } : {},
      explicitLinks || {},
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

      return buildProcessLinkMapFromRecord(
        moduleId,
        sourceRecord || null,
        normalizedTargetModuleIds,
        explicitLinks || {},
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
    appendProcessLinkedRecordsRef.current = appendProcessLinkedRecords;
  }, [appendProcessLinkedRecords]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleTaskRuntimeUpdated = (event: Event) => {
      const detail = (event as CustomEvent<TaskRuntimeUpdatedPayload>)?.detail;
      const updatedTask = detail?.task;
      if (!updatedTask?.id) return;
      setTasks((prev) => applyTaskRuntimeUpdate(
        prev,
        updatedTask,
        (task) => withProcessTaskCustomFieldValues(task)
      ));
    };

    window.addEventListener(TASK_RUNTIME_UPDATED_EVENT, handleTaskRuntimeUpdated as EventListener);
    return () => {
      window.removeEventListener(TASK_RUNTIME_UPDATED_EVENT, handleTaskRuntimeUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!appendProcessModalOpen) {
      setAppendProcessTargetModuleIds((prev) => (prev.length > 0 ? [] : prev));
      appendProcessLinkedRecordsRef.current = {};
      setAppendProcessLinkedRecords((prev) => (hasObjectKeys(prev) ? {} : prev));
      setAppendProcessRelationOptions((prev) => (hasObjectKeys(prev) ? {} : prev));
      setAppendProcessRelationLoading((prev) => (hasObjectKeys(prev) ? {} : prev));
      return;
    }
    if (!appendProcessTemplateId && appendProcessModalMode === 'append') {
      setAppendProcessTargetModuleIds((prev) => (prev.length > 0 ? [] : prev));
      appendProcessLinkedRecordsRef.current = {};
      setAppendProcessLinkedRecords((prev) => (hasObjectKeys(prev) ? {} : prev));
      setAppendProcessRelationOptions((prev) => (hasObjectKeys(prev) ? {} : prev));
      setAppendProcessRelationLoading((prev) => (hasObjectKeys(prev) ? {} : prev));
      return;
    }
    if (!appendProcessTemplateId && appendProcessModalMode === 'links') {
      const latestLinks = appendProcessLinkedRecordsRef.current || {};
      const inferredTargetModuleIds = normalizeProcessTargetModuleIds(
        [
          ...appendProcessTargetModuleIds,
          ...Object.keys(latestLinks),
        ],
        moduleId
      );
      if (inferredTargetModuleIds.length > 0) {
        void Promise.all(
          inferredTargetModuleIds.map((targetModuleId) =>
            loadAppendProcessRelationOptions(targetModuleId, latestLinks[targetModuleId] || null)
          )
        );
      }
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
          ? (await resolveKnownProcessLinks(targetModuleIds, appendProcessLinkedRecordsRef.current || {}))
          : (await resolveKnownProcessLinks(targetModuleIds) || {});
        if (cancelled) return;
        appendProcessLinkedRecordsRef.current = knownLinks;
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
            appendProcessLinkedRecordsRef.current = {};
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
    appendProcessTargetModuleIds,
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
      const customEvent = event as CustomEvent<{
        moduleId?: string;
        recordId?: string;
        mode?: 'append' | 'links';
        group?: { id?: string | null; templateId?: string | null; stages?: any[] };
      }>;
      const targetModuleId = String(customEvent?.detail?.moduleId || '');
      const targetRecordId = String(customEvent?.detail?.recordId || '');
      if (targetModuleId !== String(moduleId) || targetRecordId !== String(recordId)) return;
      setShowEmptyProcessDetails(true);
      void handleOpenAppendProcessModal(customEvent?.detail?.mode || 'append', customEvent?.detail?.group);
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
      const currentLinkedRecords = appendProcessLinkedRecordsRef.current || appendProcessLinkedRecords;

      const appendedStages = mapProcessTemplateStagesToDraft(appendProcessTemplateId, incomingStages, {
        groupId: nextGroupId,
        groupName: nextGroupName,
        templateName: selectedTemplate?.label || null,
        targetModuleIds: appendProcessTargetModuleIds,
        processLinkMap: currentLinkedRecords,
        startSortOrder: 10,
      }).map((stage: any) => ({
        ...stage,
        automation_rules: normalizeProcessAutomationRules(stage?.automation_rules),
        process_task_custom_fields: normalizeProcessTaskCustomFields(stage?.[PROCESS_TASK_CUSTOM_FIELDS_KEY]),
        process_task_status_options: normalizeProcessTaskStatusOptions(stage?.[PROCESS_TASK_STATUS_OPTIONS_KEY]),
        duration_unit: String(stage?.duration_unit || 'day') === 'hour' ? 'hour' : 'day',
        duration_from: String(stage?.duration_from || 'project_start'),
      }));

      const existingSortShift = Math.max(20, (appendedStages.length + 1) * 10);
      const shiftedExisting = existing.map((stage: any, index: number) => ({
        ...stage,
        sort_order: Number(stage?.sort_order || ((index + 1) * 10)) + existingSortShift,
      }));

      const nextStages = [...appendedStages, ...shiftedExisting].sort(
        (a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0)
      );
      await saveDraftStages(nextStages);
      setAppendProcessModalOpen(false);
      setAppendProcessTemplateId(null);
      setAppendProcessTemplateLabel(null);
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
      const currentLinkedRecords = appendProcessLinkedRecordsRef.current || appendProcessLinkedRecords;
      const nextStages = (Array.isArray(draftLocal) ? draftLocal : []).map((stage: any) => {
        const stageGroupId = String(stage?.process_group_id || stage?.source_template_id || 'default_process_group').trim() || 'default_process_group';
        if (stageGroupId !== normalizedGroupId) return stage;
        return {
          ...stage,
          process_target_module_ids: appendProcessTargetModuleIds,
          process_link_map: currentLinkedRecords,
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
      setAppendProcessTemplateLabel(null);
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
      const replacedStages = mapProcessTemplateStagesToDraft(normalizedTemplateId, incomingStages, {
        groupId: normalizedGroupId,
        groupName: nextGroupName,
        templateName: selectedTemplate?.label || null,
        startSortOrder: cursor,
      }).map((stage: any) => ({
        ...stage,
        automation_rules: normalizeProcessAutomationRules(stage?.automation_rules),
        process_task_custom_fields: normalizeProcessTaskCustomFields(stage?.[PROCESS_TASK_CUSTOM_FIELDS_KEY]),
        process_task_status_options: normalizeProcessTaskStatusOptions(stage?.[PROCESS_TASK_STATUS_OPTIONS_KEY]),
        duration_unit: String(stage?.duration_unit || 'day') === 'hour' ? 'hour' : 'day',
        duration_from: String(stage?.duration_from || 'project_start'),
      }));

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
    if (String(stage?.default_assignee_id || stage?.assignee_id || '').trim().startsWith('field:')) {
      return { assigneeType: null, assigneeId: null };
    }
    const roleValue = parseAssigneeValue(stage?.default_assignee_role_id || stage?.assignee_role_id, 'role');
    if (roleValue.assigneeType === 'role' && roleValue.assigneeId) {
      return { assigneeType: 'role', assigneeId: roleValue.assigneeId };
    }
    const userValue = parseAssigneeValue(stage?.default_assignee_id || stage?.assignee_id, 'user');
    if (userValue.assigneeType && userValue.assigneeId) {
      return { assigneeType: userValue.assigneeType, assigneeId: userValue.assigneeId };
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

  const handleAutoAssignProcess = useCallback(async (targetGroupId?: string | null) => {
    if (!isProcessRecordModule || !recordId || !moduleId) return;
    const normalizedTargetGroupId = String(targetGroupId || '').trim();
    const autoAssignKey = normalizedTargetGroupId || 'all';
    if (autoAssignLockRef.current.has(autoAssignKey)) return;
    autoAssignLockRef.current.add(autoAssignKey);
    setAutoAssigningProcessIds((prev) => ({ ...prev, [autoAssignKey]: true }));
    const sourceDraftRows = Array.isArray(draftLocal) ? draftLocal : [];
    const sourceDraftGraph = materializeLegacyProcessGraph(sourceDraftRows);
    const stageRows = sourceDraftGraph.stages
      .filter((stage: any) => {
        const hasName = String(stage?.name || stage?.title || '').trim() !== '';
        if (!hasName) return false;
        if (!normalizedTargetGroupId) return true;
        return getStageProcessGroupMeta(stage).groupId === normalizedTargetGroupId;
      })
      .sort((a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
    if (!stageRows.length) {
      message.warning('مرحله‌ای برای ارجاع وجود ندارد');
      autoAssignLockRef.current.delete(autoAssignKey);
      setAutoAssigningProcessIds((prev) => {
        const next = { ...prev };
        delete next[autoAssignKey];
        return next;
      });
      return;
    }
    try {
      setLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || null;
      const baseDate = await getProcessBaseDate();
      const dueByStageKey = new Map<string, string | null>();
      stageRows.forEach((stage: any) => {
        const normalizedName = normalizeStageName(stage?.name || stage?.title);
        if (!normalizedName) return;
        const { groupId } = getStageProcessGroupMeta(stage);
        const dueAt = computeProcessStageDueDate({
          stage,
          stages: sourceDraftGraph.stages,
          processStartedAt: baseDate,
          graph: sourceDraftGraph.graph,
        });
        dueByStageKey.set(
          buildProcessStageTaskKey(groupId, normalizedName, stage?.sort_order),
          dueAt ? dueAt.toISOString() : null
        );
      });

      const existingByStageKey = new Set(
        (Array.isArray(tasks) ? tasks : [])
          .flatMap((task: any) => buildProcessStageIdentityKeys(task))
      );

      const payload: any[] = [];
      let previousResolvedTask: any = null;
      const templateRecordCache = new Map<string, Record<string, any>>();
      const creatableStages = stageRows
        .filter((stage: any) => {
          const stageName = String(stage?.name || stage?.title || '').trim();
          const stageKeys = buildProcessStageIdentityKeys(stage);
          if (!stageName || stageKeys.some((key) => existingByStageKey.has(key))) return false;
          stageKeys.forEach((key) => existingByStageKey.add(key));
          return true;
        })
        .sort((a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));

      const processRunContexts = await ensureProcessRunContextsForStageGroups(
        creatableStages,
        async (firstStage) => ensureProcessRunForDraftStageGroup({
          supabaseClient: supabase,
          moduleId,
          recordId,
          stages: Array.isArray(draftLocalRef.current) ? draftLocalRef.current : stageRows,
          targetStage: firstStage,
          currentUserId: userId,
        })
      );

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
        const processRunContext = processRunContexts.get(stageMeta.groupId) || {
          processRunId: null,
          processRunStageId: null,
          stageMap: new Map<string, string>(),
        };
        const processRunStageId = resolveProcessRunStageId(processRunContext.stageMap, stage);
        const processLinkMap = mergeProcessLinkMaps(
          stage?.process_link_map && typeof stage.process_link_map === 'object' ? stage.process_link_map : {},
          recurrenceBase?.process_links && typeof recurrenceBase.process_links === 'object' ? recurrenceBase.process_links : {},
        );
        const effectiveProcessLinkMap = mergeProcessLinkMaps(
          recordId && moduleId ? { [moduleId]: String(recordId) } : {},
          processLinkMap,
        );
        const stageTargetModuleIds = normalizeProcessTargetModuleIds(
          stage?.process_target_module_ids || recurrenceBase?.process_target_module_ids,
          moduleId
        );
        const templateContext = await buildTaskTemplateContextRecord({
          taskName: stageName,
          taskType: stageTaskType,
          dueDate,
          processLinkMap: effectiveProcessLinkMap,
          previousTask: previousResolvedTask,
          relatedRecordCache: templateRecordCache,
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
        const resolvedStageCustomFields = resolveProcessTaskCustomFieldsFromRecord(
          stageCustomFields,
          {
            ...templateContext,
            task_name: resolvedStageName,
            description: resolvedStageDescription || '',
          },
        );
        const stageCustomFieldValues = mergeProcessTaskCustomFieldValues(resolvedStageCustomFields, {});
        const taskRow: any = {
          name: resolvedStageName,
          status: 'todo',
          source_template_id: stageMeta.templateId,
          source_stage_sort_order: Number(stage?.sort_order || ((index + 1) * 10)),
          process_group_id: stageMeta.groupId,
          process_run_id: processRunContext.processRunId || null,
          process_run_stage_id: processRunStageId || null,
          process_node_key: getProcessStageNodeKey(stage),
          process_lane_key: getProcessStageLaneKey(stage),
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
            process_target_module_ids: stageTargetModuleIds,
            process_links: effectiveProcessLinkMap,
            process_run_id: processRunContext.processRunId || null,
            process_run_stage_id: processRunStageId || null,
            process_node_key: getProcessStageNodeKey(stage),
            process_lane_key: getProcessStageLaneKey(stage),
            process_graph: sourceDraftGraph.graph,
            due_anchor_type: normalizeProcessDueAnchor(stage).type,
            due_anchor_stage_node_key: normalizeProcessDueAnchor(stage).stageNodeKey,
            duration_value: Number(stage?.duration_value || stage?.metadata?.duration_value || 0),
            duration_unit: String(stage?.duration_unit || stage?.metadata?.duration_unit || 'day'),
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

      const autoAssignedGroupIds = Array.from(new Set(stageRows.map((stage: any) => getStageProcessGroupMeta(stage).groupId)));
      autoAssignedGroupIds
        .map((groupId) => String(groupId || '').trim())
        .filter(Boolean)
        .forEach((groupId) => autoAssignedProcessGroupIdsRef.current.add(groupId));
      if (!payload.length) {
        const nextDrafts = removeDraftStagesForProcessGroups(
          Array.isArray(draftLocalRef.current) ? draftLocalRef.current : [],
          autoAssignedGroupIds
        );
        if (nextDrafts.length !== (Array.isArray(draftLocalRef.current) ? draftLocalRef.current.length : 0)) {
          draftLocalRef.current = nextDrafts;
          setDraftLocal(nextDrafts);
          await saveDraftStages(nextDrafts);
        }
        message.info('برای همه مراحل فعالیت ثبت شده است');
        return;
      }
      await insertTasksWithFallback(payload);
      const nextDrafts = removeDraftStagesForProcessGroups(
        Array.isArray(draftLocalRef.current) ? draftLocalRef.current : [],
        autoAssignedGroupIds
      );
      draftLocalRef.current = nextDrafts;
      setDraftLocal(nextDrafts);
      await saveDraftStages(nextDrafts);
      await fetchTasks();
      message.success(`${toPersianNumber(payload.length)} فعالیت ایجاد شد`);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ارجاع خودکار فرآیند ناموفق بود'));
    } finally {
      autoAssignLockRef.current.delete(autoAssignKey);
      setAutoAssigningProcessIds((prev) => {
        const next = { ...prev };
        delete next[autoAssignKey];
        return next;
      });
      setLoading(false);
    }
  }, [
    buildTaskTemplateContextRecord,
    buildProcessStageTaskKey,
    buildProcessStageIdentityKeys,
    draftLocal,
    fetchTasks,
    getStageProcessGroupMeta,
    getTaskProcessGroupMeta,
    getProcessBaseDate,
    insertTasksWithFallback,
    removeSingleMatchingDraftStage,
    saveDraftStages,
    isProcessRecordModule,
    moduleId,
    normalizeStageName,
    parseStageAssignee,
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
    const rawDefaultAssigneeCombo = String(values?.default_assignee_combo || '').trim();
    const isDefaultAssigneeField = rawDefaultAssigneeCombo.startsWith('field:');
    const { assigneeType, assigneeId } = isDefaultAssigneeField
      ? { assigneeType: null, assigneeId: null }
      : parseAssigneeComboValue(values?.default_assignee_combo);
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
    const processTaskCustomFields = normalizeProcessTaskCustomFields(assignProcessTaskCustomFieldOrder(draftCustomFields));
    const weight = Number(values?.weight || 0);
    const startDurationValue = Number(values?.start_duration_value || 0);
    const startDurationUnit = values?.start_duration_unit || 'day';
    const startDurationFrom = values?.start_duration_from || 'project_start';
    const startAnchorStageNodeKey = requiresSystemScheduleStageAnchor(startDurationFrom)
      ? String(values?.start_anchor_stage_node_key || existingStage?.start_anchor_stage_node_key || existingMetadata?.start_anchor_stage_node_key || '').trim() || null
      : null;
    const durationValue = Number(values?.duration_value || 0);
    const durationUnit = values?.duration_unit || 'day';
    const durationFrom = values?.duration_from || 'project_start';
    const dueAnchorType: ProcessDueAnchorType = durationFrom === 'project_start'
      ? 'process_start'
      : (durationFrom === 'previous_stage_end' ? 'previous_stage_due' : durationFrom);
    const dueAnchorStageNodeKey = requiresSystemScheduleStageAnchor(dueAnchorType)
      ? String(values?.due_anchor_stage_node_key || existingStage?.due_anchor_stage_node_key || '').trim() || null
      : null;
    const processNodeKey = String(
      existingStage?.[PROCESS_NODE_KEY]
      || existingMetadata?.[PROCESS_NODE_KEY]
      || createProcessNodeKey()
    );
    const processLaneKey = String(
      existingStage?.[PROCESS_LANE_KEY]
      || existingMetadata?.[PROCESS_LANE_KEY]
      || activeDraftLaneKey
      || 'lane_1'
    );
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
    const stageInstructionIds = normalizeInstructionIdList(draftStageInstructionIds);

    return {
      ...(existingStage || {}),
      id: existingStage?.id || Date.now(),
      name: stageName,
      title: stageName,
      stage_name: stageName,
      description: stageDescription,
      task_type: stageTaskType,
      sort_order: values.sort_order || existingStage?.sort_order || ((currentDraftCount + 1) * 10),
      wage: Number(values?.wage || 0),
      weight,
      default_assignee_id: isDefaultAssigneeField ? rawDefaultAssigneeCombo : (assigneeType === 'user' ? assigneeId : null),
      default_assignee_role_id: assigneeType === 'role' ? assigneeId : null,
      start_duration_value: startDurationValue,
      start_duration_unit: startDurationUnit,
      start_duration_from: startDurationFrom,
      start_anchor_stage_node_key: startAnchorStageNodeKey,
      duration_value: durationValue,
      duration_unit: durationUnit,
      duration_from: durationFrom,
      due_anchor_type: dueAnchorType,
      due_anchor_stage_node_key: dueAnchorStageNodeKey,
      [PROCESS_NODE_KEY]: processNodeKey,
      [PROCESS_LANE_KEY]: processLaneKey,
      automation_rules: automationRules,
      process_task_custom_fields: processTaskCustomFields,
      process_task_status_options: stageStatusOptions,
      [PROCESS_STAGE_INSTRUCTION_IDS_KEY]: stageInstructionIds,
      metadata: {
        ...existingMetadata,
        description: stageDescription,
        task_type: stageTaskType,
        automation_rules: automationRules,
        [PROCESS_TASK_CUSTOM_FIELDS_KEY]: processTaskCustomFields,
        [PROCESS_TASK_STATUS_OPTIONS_KEY]: stageStatusOptions,
        weight,
        start_duration_value: startDurationValue,
        start_duration_unit: startDurationUnit,
        start_duration_from: startDurationFrom,
        start_anchor_stage_node_key: startAnchorStageNodeKey,
        duration_value: durationValue,
        duration_unit: durationUnit,
        duration_from: durationFrom,
        due_anchor_type: dueAnchorType,
        due_anchor_stage_node_key: dueAnchorStageNodeKey,
        default_assignee_field: isDefaultAssigneeField ? rawDefaultAssigneeCombo : null,
        [PROCESS_NODE_KEY]: processNodeKey,
        [PROCESS_LANE_KEY]: processLaneKey,
        [PROCESS_STAGE_INSTRUCTION_IDS_KEY]: stageInstructionIds,
      },
    };
  }, [activeDraftLaneKey, draftAutomationRules, draftCustomFields, draftLocal.length, draftStageInstructionIds, getDraftStageEditorStatusOptions, requiresSystemScheduleStageAnchor]);

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
      if (isProcessModule) {
        fieldsToValidate.push('task_type', 'default_assignee_combo');
        if (requiresSystemScheduleStageAnchor(draftForm.getFieldValue('start_duration_from'))) {
          fieldsToValidate.push('start_anchor_stage_node_key');
        }
        if (requiresSystemScheduleStageAnchor(draftForm.getFieldValue('duration_from'))) {
          fieldsToValidate.push('due_anchor_stage_node_key');
        }
      }
      await draftForm.validateFields(fieldsToValidate);
      return;
    }
    if (stepKey === 'fields') {
      await draftForm.validateFields(['stage_status_options_editor']);
    }
  }, [draftForm, isProcessModule, requiresSystemScheduleStageAnchor]);

  const resetDraftStageEditorState = useCallback(() => {
    setEditingDraft(null);
    draftEditorStageIdRef.current = null;
    setDraftTemplatePickerOpenKey(null);
    setDraftModalTabKey('stage');
    setDraftAutomationRules([]);
    setExpandedDraftAutomationRuleIds([]);
    setDraftCustomFields([]);
    setDraftStageStatusOptions([]);
    setDraftStageTaskTypeValue('');
    setDraftStageInstructionIds([]);
    setInstructionsForEditor([]);
    draftForm.resetFields();
  }, [draftForm]);

  const closeDraftStageModal = useCallback(() => {
    setIsDraftModalOpen(false);
    setActiveDraftLaneKey(null);
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
    setOpenDraftSegmentPopoverKey(null);
    setDraftTemplatePickerOpenKey(null);
    const nextEditingDraft = stage ? normalizeDraftStageForEditor(stage, 0) : null;
    if (nextEditingDraft) {
      setActiveDraftLaneKey(getProcessStageLaneKey(nextEditingDraft));
    }
    draftEditorStageIdRef.current = nextEditingDraft?.id ?? null;
    setEditingDraft(nextEditingDraft);
    setDraftStageInstructionIds(stage ? getInstructionIdsFromStage(stage) : []);
    setDraftModalTabKey(tab);
    setIsDraftModalOpen(true);
  }, [normalizeDraftStageForEditor]);

  useEffect(() => {
    if (!isProcessTemplateModule || typeof window === 'undefined') return undefined;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<any>)?.detail || {};
      if (String(detail?.moduleId || '').trim() !== String(moduleId || '').trim()) return;
      if (String(detail?.recordId || '').trim() !== String(recordId || '').trim()) return;
      const requestedStageId = String(detail?.stageId || '').trim();
      const stageFromList = requestedStageId
        ? (draftLocalRef.current || []).find((stage: any) => (
            String(stage?.id || stage?.template_stage_id || stage?.process_node_key || '').trim() === requestedStageId
          ))
        : null;
      openDraftStageModal(stageFromList || detail?.stage || null, detail?.tab || 'stage');
    };
    window.addEventListener('kalamapp:open-process-template-stage', handler as EventListener);
    return () => {
      window.removeEventListener('kalamapp:open-process-template-stage', handler as EventListener);
    };
  }, [isProcessTemplateModule, moduleId, openDraftStageModal, recordId]);

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

  const cloneProcessActivatorWorkflows = useCallback(async (
    sourceTemplateId: string,
    sourceGraph: ProcessGraphDefinition,
    cloneResult: ProcessGraphCloneResult,
  ) => {
    if (!recordId) return cloneResult.graph;
    return cloneProcessActivatorWorkflowsForTemplate({
      supabaseClient: supabase,
      sourceTemplateId,
      targetTemplateId: recordId,
      sourceGraph,
      cloneResult,
    });
  }, [recordId]);

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
        icon: String((option as any)?.icon || '') || 'circle',
        disabled: option?.disabled === true,
        insertAfter: String(option?.insertAfter || '').trim() || undefined,
      }))
    );
  }, [draftForm]);

  const upsertDraftStageStatusOption = useCallback((sourceOption: SelectOption, patch: Partial<SelectOption>) => {
    const optionValue = String(sourceOption?.value || '').trim();
    if (!optionValue) return;
    const existing = draftStageStatusOptions.find((option) => String(option?.value || '').trim() === optionValue);
    const patchedMerged = mergedDraftStageStatusOptions.map((option) => (
      String(option?.value || '').trim() === optionValue
        ? { ...option, ...existing, ...patch, value: optionValue }
        : option
    ));
    const nextCustom = normalizeProcessTaskStatusOptions([
      ...draftStageStatusOptions.filter((option) => String(option?.value || '').trim() !== optionValue),
      {
        ...sourceOption,
        ...existing,
        ...patch,
        value: optionValue,
      },
    ]);
    syncDraftStageStatusOptions(
      rebuildProcessTaskStatusOptionsByMergedOrder(
        patchedMerged,
        nextCustom,
        baseTaskStatusOptions
      )
    );
  }, [baseTaskStatusOptions, draftStageStatusOptions, mergedDraftStageStatusOptions, syncDraftStageStatusOptions]);

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
    const nextRule = normalizeAutomationRuleForEditor(createDefaultProcessAutomationRule());
    setDraftAutomationRules((prev) => [
      ...prev,
      nextRule,
    ]);
    setExpandedDraftAutomationRuleIds((prev) => (
      prev.includes(String(nextRule.id)) ? prev : [...prev, String(nextRule.id)]
    ));
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
    setExpandedDraftAutomationRuleIds((prev) => prev.filter((id) => String(id) !== String(ruleId)));
  }, []);

  const toggleDraftAutomationRuleExpanded = useCallback((ruleId: string) => {
    const normalizedRuleId = String(ruleId || '').trim();
    if (!normalizedRuleId) return;
    setExpandedDraftAutomationRuleIds((prev) => (
      prev.includes(normalizedRuleId)
        ? prev.filter((id) => id !== normalizedRuleId)
        : [...prev, normalizedRuleId]
    ));
  }, []);

  const moveDraftAutomationRule = useCallback((ruleId: string, direction: 'up' | 'down') => {
    const normalizedRuleId = String(ruleId || '').trim();
    if (!normalizedRuleId) return;

    setDraftAutomationRules((prev) => {
      const currentIndex = prev.findIndex((rule) => String(rule?.id || '').trim() === normalizedRuleId);
      if (currentIndex < 0) return prev;
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;

      const reordered = [...prev];
      const [moved] = reordered.splice(currentIndex, 1);
      reordered.splice(targetIndex, 0, moved);
      return reordered;
    });
  }, []);

  const openDraftCustomFieldModal = useCallback((field?: ModuleField | null) => {
    const nextField = field || null;
    setEditingDraftCustomFieldKey(nextField?.key ? String(nextField.key) : null);
    draftCustomFieldForm.setFieldsValue({
      key: nextField?.key || undefined,
      labelFa: nextField?.labels?.fa || '',
      type: nextField?.type || FieldType.TEXT,
      required: !!nextField?.validation?.required,
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
        validation: { required: !!values?.required },
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
        defaultValue: previousField?.defaultValue,
        order: previousField?.order,
      }])[0];

      if (!normalizedField) {
        message.error('تعریف فیلد نامعتبر است.');
        return;
      }

      setDraftCustomFields((prev) => {
        if (editingDraftCustomFieldKey) {
          return assignProcessTaskCustomFieldOrder(prev.map((field) => (
            String(field?.key || '') === String(editingDraftCustomFieldKey || '')
              ? normalizedField
              : field
          )));
        }
        return assignProcessTaskCustomFieldOrder([...prev, normalizedField]);
      });
      closeDraftCustomFieldModal();
    } catch {
      // Ant validation handles this case.
    }
  }, [closeDraftCustomFieldModal, draftCustomFieldForm, draftCustomFields, editingDraftCustomFieldKey]);

  const removeDraftCustomField = useCallback((fieldKey: string) => {
    setDraftCustomFields((prev) => assignProcessTaskCustomFieldOrder(
      prev.filter((field) => String(field?.key || '') !== String(fieldKey || ''))
    ));
  }, []);

  const moveDraftCustomField = useCallback((fieldKey: string, direction: 'up' | 'down') => {
    const normalizedFieldKey = String(fieldKey || '').trim();
    if (!normalizedFieldKey) return;
    setDraftCustomFields((prev) => {
      const currentIndex = prev.findIndex((field) => String(field?.key || '').trim() === normalizedFieldKey);
      if (currentIndex < 0) return prev;
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;

      const reordered = [...prev];
      const [moved] = reordered.splice(currentIndex, 1);
      reordered.splice(targetIndex, 0, moved);
      return assignProcessTaskCustomFieldOrder(reordered);
    });
  }, []);

  const openDraftCustomFieldOptionsEditor = useCallback((field: ModuleField) => {
    setDraftCustomFieldOptionsEditorKey(String(field?.key || ''));
    draftCustomFieldOptionsForm.setFieldsValue({
      options: (field.options || []).map((option) => ({
        label: String(option?.label || ''),
        value: String(option?.value || ''),
        color: String(option?.color || '') || undefined,
      })),
    });
  }, [draftCustomFieldOptionsForm]);

  const saveDraftCustomFieldOptions = useCallback(async () => {
    try {
      const values = await draftCustomFieldOptionsForm.validateFields();
      const rawRows = Array.isArray(values?.options) ? values.options : [];
      const nextOptions = normalizeProcessTaskOptionRows(rawRows, 'option');
      const filledRowCount = rawRows.filter((row) => String(row?.label || row?.value || '').trim()).length;
      if (nextOptions.length !== filledRowCount) {
        message.error('عنوان یا مقدار گزینه‌ها تکراری یا نامعتبر است.');
        return;
      }
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
  }, [draftCustomFieldOptionsEditorKey, draftCustomFieldOptionsForm, message]);

  const handleRemoveDraftStage = async (stageToRemove: any) => {
    openTaskLayerConfirm({
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
      const rawDefaultAssigneeId = String(draftForEditor?.default_assignee_id || '').trim();
      const assigneeCombo = rawDefaultAssigneeId.startsWith('field:')
        ? rawDefaultAssigneeId
        : draftForEditor?.default_assignee_role_id
        ? buildAssigneeSelectValue(draftForEditor.default_assignee_role_id, 'role')
        : buildAssigneeSelectValue(rawDefaultAssigneeId, 'user');
      draftForm.setFieldsValue({
        name: draftForEditor.name,
        description: draftForEditor.description || '',
        task_type: draftForEditor.task_type || undefined,
        sort_order: draftForEditor.sort_order,
        wage: draftForEditor.wage || 0,
        weight: draftForEditor.weight || 0,
        default_assignee_combo: assigneeCombo,
        start_duration_value: draftForEditor.start_duration_value ?? draftForEditor.metadata?.start_duration_value ?? draftForEditor.metadata?.duration_start_value ?? 0,
        start_duration_unit: draftForEditor.start_duration_unit || draftForEditor.metadata?.start_duration_unit || draftForEditor.metadata?.duration_start_unit || 'day',
        start_duration_from: draftForEditor.start_duration_from || draftForEditor.metadata?.start_duration_from || draftForEditor.metadata?.duration_start_from || 'project_start',
        start_anchor_stage_node_key: draftForEditor.start_anchor_stage_node_key || draftForEditor.metadata?.start_anchor_stage_node_key || undefined,
        duration_value: draftForEditor.duration_value || 0,
        duration_unit: draftForEditor.duration_unit || 'day',
        duration_from: draftForEditor.duration_from || 'project_start',
        due_anchor_stage_node_key: draftForEditor.due_anchor_stage_node_key || undefined,
        stage_status_options_editor: getProcessTaskStatusOptionsFromStage(draftForEditor).map((option) => ({
          label: String(option?.label || ''),
          value: String(option?.value || ''),
          color: String(option?.color || '') || 'default',
          icon: String((option as any)?.icon || '') || 'circle',
          disabled: option?.disabled === true,
          insertAfter: String(option?.insertAfter || '').trim() || undefined,
        })),
      });
      setDraftStageTaskTypeValue(String(draftForEditor?.task_type || '').trim());
      const nextAutomationRules = normalizeProcessAutomationRules(draftForEditor?.automation_rules).map((rule) =>
        normalizeAutomationRuleForEditor(rule)
      );
      setDraftAutomationRules(nextAutomationRules);
      setExpandedDraftAutomationRuleIds(
        nextAutomationRules.length > 0 ? [String(nextAutomationRules[0]?.id || '')].filter(Boolean) : []
      );
      setDraftCustomFields(assignProcessTaskCustomFieldOrder(getProcessTaskCustomFieldsFromStage(draftForEditor)));
      setDraftStageStatusOptions(getProcessTaskStatusOptionsFromStage(draftForEditor));
    } else {
      draftForm.setFieldsValue({
        description: '',
        task_type: undefined,
        sort_order: (draftLocal.length + 1) * 10,
        wage: 0,
        weight: 0,
        default_assignee_combo: undefined,
        start_duration_value: 0,
        start_duration_unit: 'day',
        start_duration_from: 'project_start',
        start_anchor_stage_node_key: undefined,
        duration_value: 0,
        duration_unit: 'day',
        duration_from: 'project_start',
        due_anchor_stage_node_key: undefined,
        stage_status_options_editor: [],
      });
      setDraftAutomationRules([]);
      setExpandedDraftAutomationRuleIds([]);
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
    if ((!isDraftModalOpen && !processTriggerEditor) || !isProcessModule) return;
    void loadAutomationOptions();
  }, [
    automationScopeModuleId,
    isDraftModalOpen,
    isProcessModule,
    loadAutomationOptions,
    processTriggerEditor,
  ]);

  useEffect(() => {
    if (!isDraftModalOpen || taskTypeOptions.length === 0) return;
    setDraftAutomationRules((prev) => prev.map((rule) => normalizeAutomationRuleForEditor(rule)));
  }, [isDraftModalOpen, normalizeAutomationRuleForEditor, taskTypeOptions]);

  useEffect(() => {
    if (!isDraftModalOpen || draftModalTabKey !== 'instructions') return;
    if (instructionsForEditor.length > 0) return;
    setIsLoadingInstructionsForEditor(true);
    supabase
      .from('instructions')
      .select('id, name, system_code, status, department, goal')
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (!error && Array.isArray(data)) {
          setInstructionsForEditor(data);
        }
        setIsLoadingInstructionsForEditor(false);
      });
  }, [isDraftModalOpen, draftModalTabKey, instructionsForEditor.length]);

  const draftSegments = draftList.map((stage: any) => ({
    ...stage,
    type: 'draft',
    label: stage.name || stage.title || 'مرحله',
  }));
  const draftGraphSnapshot = useMemo(() => {
    const materialized = materializeLegacyProcessGraph(draftSegments);
    const graph = normalizeProcessGraph(processGraphOverride || materialized.graph, materialized.stages);
    return {
      graph,
      stages: attachProcessGraphToStages(materialized.stages, graph),
    };
  }, [draftSegments, processGraphOverride]);
  const draftProcessLanes = useMemo(
    () => getProcessStagesByLane(draftGraphSnapshot.stages, draftGraphSnapshot.graph),
    [draftGraphSnapshot],
  );
  const draftSourceGraphSnapshot = useMemo(
    () => materializeLegacyProcessGraph(draftSourceTemplateStages),
    [draftSourceTemplateStages],
  );
  const draftSourceProcessLanes = useMemo(
    () => getProcessStagesByLane(draftSourceGraphSnapshot.stages, draftSourceGraphSnapshot.graph),
    [draftSourceGraphSnapshot],
  );
  const processStageNodeOptions = useMemo(
    () => draftProcessLanes.flatMap((lane) => lane.stages.map((stage: any, index: number) => ({
      value: getProcessStageNodeKey(stage, index),
      label: `${lane.name || 'ردیف بدون نام'} - ${stage?.name || stage?.stage_name || `مرحله ${index + 1}`}`,
    }))),
    [draftProcessLanes],
  );
  const activationStageNodeOptions = useMemo(() => {
    const currentNodeKey = editingDraft
      ? getProcessStageNodeKey(editingDraft)
      : '';
    if (!currentNodeKey) return processStageNodeOptions;

    const labelByNodeKey = new Map(processStageNodeOptions.map((option) => [option.value, option.label] as const));
    const connectedEntries = [
      ...getNextProcessStages(draftGraphSnapshot.stages, currentNodeKey, draftGraphSnapshot.graph).map((stage: any) => ({
        value: getProcessStageNodeKey(stage),
        relationLabel: 'مرحله بعدی',
      })),
      ...getPreviousProcessStages(draftGraphSnapshot.stages, currentNodeKey, draftGraphSnapshot.graph).map((stage: any) => ({
        value: getProcessStageNodeKey(stage),
        relationLabel: 'مرحله قبلی',
      })),
    ]
      .filter((entry) => entry.value && entry.value !== currentNodeKey && labelByNodeKey.has(entry.value));

    const unique = Array.from(
      new Map(connectedEntries.map((entry) => [entry.value, entry] as const)).values()
    );
    if (unique.length === 0) {
      return processStageNodeOptions.filter((option) => option.value !== currentNodeKey);
    }
    return unique.map((entry) => ({
      value: entry.value,
      label: `${entry.relationLabel}: ${labelByNodeKey.get(entry.value) || entry.value}`,
    }));
  }, [draftGraphSnapshot.graph, draftGraphSnapshot.stages, editingDraft, processStageNodeOptions]);
  const processSystemScheduleAnchorOptions = useMemo(() => ([
    { label: 'ایجاد همین فعالیت', value: 'current_stage_created' },
    { label: 'شروع فرآیند', value: 'project_start' },
    { label: 'ایجاد مرحله قبلی', value: 'previous_stage_created' },
    { label: 'زمان شروع مرحله قبلی', value: 'previous_stage_start' },
    { label: 'مهلت انجام مرحله قبلی', value: 'previous_stage_end' },
    { label: 'زمان تکمیل واقعی مرحله قبلی', value: 'previous_stage_completed' },
    { label: 'ایجاد مرحله بعدی', value: 'next_stage_created' },
    { label: 'زمان شروع مرحله بعدی', value: 'next_stage_start' },
    { label: 'مهلت انجام مرحله بعدی', value: 'next_stage_due' },
    { label: 'زمان تکمیل واقعی مرحله بعدی', value: 'next_stage_completed' },
    { label: 'ایجاد مرحله خاص', value: 'specific_stage_created' },
    { label: 'زمان شروع مرحله خاص', value: 'specific_stage_start' },
    { label: 'مهلت انجام مرحله خاص', value: 'specific_stage_due' },
    { label: 'زمان تکمیل واقعی مرحله خاص', value: 'specific_stage_completed' },
  ]), []);
  const processScheduleUnitOptions = useMemo(() => ([
    { label: 'روز', value: 'day' },
    { label: 'ساعت', value: 'hour' },
  ]), []);
  const processSpecificStageRecipientOptions = useMemo(
    () => processStageNodeOptions.map((option) => ({
      value: createProcessStageRecipientFieldKey(option.value),
      label: `مسئول مرحله خاص: ${option.label}`,
    })),
    [processStageNodeOptions],
  );

  const persistProcessGraph = useCallback(async (
    graph: ProcessGraphDefinition,
    stages: any[] = draftGraphSnapshot.stages,
  ) => {
    const normalizedGraph = normalizeProcessGraph(graph, stages);
    setProcessGraphOverride(normalizedGraph);
    await saveDraftStages(stages, normalizedGraph);
  }, [draftGraphSnapshot.stages, saveDraftStages]);

  const handleCopyDraftLaneFromTemplate = useCallback(async (sourceLaneKey: string) => {
    const cloneResult = cloneProcessGraphInto({
      sourceStages: draftSourceGraphSnapshot.stages,
      targetStages: draftGraphSnapshot.stages,
      targetGraph: draftGraphSnapshot.graph,
      sourceLaneKeys: [sourceLaneKey],
      includeTriggers: false,
    });
    const targetLaneKey = cloneResult.laneKeyMap.get(sourceLaneKey) || null;
    await persistProcessGraph(cloneResult.graph, cloneResult.stages);
    setActiveDraftLaneKey(targetLaneKey);
    setDraftStageChooserOpen(false);
    message.success('ردیف کامل با شناسه‌های مستقل کپی شد');
  }, [
    draftGraphSnapshot.graph,
    draftGraphSnapshot.stages,
    draftSourceGraphSnapshot.stages,
    persistProcessGraph,
  ]);

  const handleCopyFullDraftTemplate = useCallback(async () => {
    const sourceTemplateId = String(draftSourceTemplateId || '').trim();
    if (!sourceTemplateId || draftSourceGraphSnapshot.stages.length === 0) return;
    if (!recordId && draftSourceGraphSnapshot.graph.triggers.some((trigger) => !!trigger.workflowId)) {
      message.warning('برای کپی گردش‌کارهای فعال‌کننده، ابتدا الگوی مقصد را ذخیره کنید.');
      return;
    }
    const cloneResult = cloneProcessGraphInto({
      sourceStages: draftSourceGraphSnapshot.stages,
      targetStages: draftGraphSnapshot.stages,
      targetGraph: draftGraphSnapshot.graph,
      includeTriggers: true,
    });
    const graphWithWorkflows = await cloneProcessActivatorWorkflows(
      sourceTemplateId,
      draftSourceGraphSnapshot.graph,
      cloneResult,
    );
    await persistProcessGraph(graphWithWorkflows, cloneResult.stages);
    setDraftStageChooserOpen(false);
    message.success('الگوی فرآیند همراه ردیف‌ها و فعال‌کننده‌ها کپی شد');
  }, [
    cloneProcessActivatorWorkflows,
    draftGraphSnapshot.graph,
    draftGraphSnapshot.stages,
    draftSourceGraphSnapshot,
    draftSourceTemplateId,
    persistProcessGraph,
    recordId,
  ]);

  const handleAddProcessLane = useCallback(async () => {
    if (!multiLaneFeatureEnabled || !canManageProcessGraph) return;
    const laneKey = createProcessLaneKey();
    const nextGraph: ProcessGraphDefinition = {
      ...draftGraphSnapshot.graph,
      lanes: [
        ...draftGraphSnapshot.graph.lanes,
        {
          key: laneKey,
          name: `ردیف ${toPersianNumber(draftGraphSnapshot.graph.lanes.length + 1)}`,
          sortOrder: (draftGraphSnapshot.graph.lanes.length + 1) * 10,
          parentTriggerKey: null,
        },
      ],
    };
    setActiveDraftLaneKey(laneKey);
    await persistProcessGraph(nextGraph);
  }, [
    canManageProcessGraph,
    draftGraphSnapshot.graph,
    multiLaneFeatureEnabled,
    persistProcessGraph,
  ]);

  const handleRenameProcessLane = useCallback(async (laneKey: string, name: string) => {
    const nextGraph: ProcessGraphDefinition = {
      ...draftGraphSnapshot.graph,
      lanes: draftGraphSnapshot.graph.lanes.map((lane) => (
        lane.key === laneKey ? { ...lane, name: String(name || '').trim() } : lane
      )),
    };
    await persistProcessGraph(nextGraph);
  }, [draftGraphSnapshot.graph, persistProcessGraph]);

  const handleDuplicateDraftStage = useCallback(async (stage: any) => {
    if (stage?.isProcessRunStagePreview) {
      const processRunStageId = String(
        stage?.process_run_stage_id
        || String(stage?.id || '').replace(/^process_run_stage:/, '')
      ).trim();
      if (!processRunStageId) return;
      const { error } = await supabase.rpc('copy_process_run_stage', {
        p_process_run_stage_id: processRunStageId,
      });
      if (error) throw error;
      await fetchTasks();
      message.success('کپی مرحله پیش‌نویس در جایگاه بعدی اضافه شد');
      return;
    }
    const laneKey = getProcessStageLaneKey(stage);
    const laneStages = draftGraphSnapshot.stages
      .filter((item) => getProcessStageLaneKey(item) === laneKey)
      .sort((left, right) => Number(left?.sort_order || 0) - Number(right?.sort_order || 0));
    const sourceIndex = laneStages.findIndex(
      (item, index) => getProcessStageNodeKey(item, index) === getProcessStageNodeKey(stage),
    );
    const copiedNodeKey = createProcessNodeKey();
    const copiedStage = {
      ...stage,
      id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      template_stage_id: null,
      source_template_stage_id: stage?.template_stage_id || stage?.id || null,
      name: `${String(stage?.name || stage?.stage_name || 'مرحله').trim()} - کپی`,
      stage_name: `${String(stage?.name || stage?.stage_name || 'مرحله').trim()} - کپی`,
      [PROCESS_NODE_KEY]: copiedNodeKey,
      [PROCESS_LANE_KEY]: laneKey,
      metadata: {
        ...(stage?.metadata || {}),
        [PROCESS_NODE_KEY]: copiedNodeKey,
        [PROCESS_LANE_KEY]: laneKey,
      },
    };
    const nextLaneStages = [...laneStages];
    nextLaneStages.splice(Math.max(0, sourceIndex + 1), 0, copiedStage);
    const nextOrder = new Map(
      nextLaneStages.map((item, index) => [getProcessStageNodeKey(item, index), (index + 1) * 10]),
    );
    const nextStages = draftGraphSnapshot.stages.map((item) => (
      getProcessStageLaneKey(item) === laneKey
        ? { ...item, sort_order: nextOrder.get(getProcessStageNodeKey(item)) || item.sort_order }
        : item
    ));
    const insertedOrder = nextOrder.get(copiedStage[PROCESS_NODE_KEY]) || ((sourceIndex + 2) * 10);
    await saveDraftStages([...nextStages, { ...copiedStage, sort_order: insertedOrder }]);
    message.success('کپی مرحله در جایگاه بعدی اضافه شد');
  }, [draftGraphSnapshot.stages, fetchTasks, saveDraftStages]);

  const openStageMoveModal = useCallback((stage: any) => {
    setStageMoveTarget(stage);
    stageMoveForm.setFieldsValue({
      lane_key: getProcessStageLaneKey(stage),
      sort_order: Number(stage?.sort_order || 10),
    });
  }, [stageMoveForm]);

  const handleMoveStage = useCallback(async (confirmedCompletedMove = false): Promise<void> => {
    const values = await stageMoveForm.validateFields();
    if (!stageMoveTarget) return;
    const normalizedStageStatus = String(stageMoveTarget?.status || '').trim().toLowerCase();
    const isCompletedActualTask = (
      !stageMoveTarget?.isProcessRunStagePreview
      && PROCESS_BAR_DONE_STATUSES.has(normalizedStageStatus)
    );
    if (isCompletedActualTask && !confirmedCompletedMove) {
      Modal.confirm({
        title: 'جابجایی فعالیت تکمیل‌شده',
        content: 'این فعالیت تکمیل شده است. فقط جایگاه آن در ادامه فرآیند تغییر می‌کند و اتوماسیون‌های گذشته دوباره اجرا نمی‌شوند.',
        okText: 'تایید جابجایی',
        cancelText: 'انصراف',
        zIndex: 10150,
        onOk: () => handleMoveStage(true),
      });
      return;
    }
    const laneKey = String(values?.lane_key || '').trim() || 'lane_1';
    const sortOrder = Math.max(1, Number(values?.sort_order || 10));

    if (stageMoveTarget?.process_run_stage_id || stageMoveTarget?.isProcessRunStagePreview) {
      const processRunStageId = String(
        stageMoveTarget?.process_run_stage_id
        || String(stageMoveTarget?.id || '').replace(/^process_run_stage:/, '')
      ).trim();
      const { error } = await supabase.rpc('move_process_run_stage', {
        p_process_run_stage_id: processRunStageId,
        p_lane_key: laneKey,
        p_sort_order: sortOrder,
      });
      if (error) throw error;
      setStageMoveTarget(null);
      await fetchTasks();
      message.success('مرحله و فعالیت متصل جابه‌جا شدند');
      return;
    }

    const targetNodeKey = getProcessStageNodeKey(stageMoveTarget);
    const nextStages = draftGraphSnapshot.stages.map((stage, index) => (
      getProcessStageNodeKey(stage, index) === targetNodeKey
        ? {
            ...stage,
            sort_order: sortOrder,
            [PROCESS_LANE_KEY]: laneKey,
            metadata: { ...(stage?.metadata || {}), [PROCESS_LANE_KEY]: laneKey },
          }
        : stage
    ));
    await saveDraftStages(nextStages);
    setStageMoveTarget(null);
    message.success('مرحله جابه‌جا شد');
  }, [draftGraphSnapshot.stages, fetchTasks, saveDraftStages, stageMoveForm, stageMoveTarget]);

  const handleDraftStageDragEnd = useCallback(async (event: DragEndEvent) => {
    const activeData = event.active.data.current as ProcessStageDragData | undefined;
    const overData = event.over?.data.current as (ProcessStageDragData & { dropIndex?: number }) | undefined;
    if (!activeData || !overData || activeData.scopeKey !== overData.scopeKey) return;
    const targetLaneKey = String(overData.laneKey || '').trim();
    if (!targetLaneKey) return;
    const targetIndex = Number.isFinite(Number(overData.dropIndex))
      ? Number(overData.dropIndex)
      : Number(overData.index || 0);
    const targetNodeKey = getProcessStageNodeKey(activeData.stage);
    const nextStages = moveProcessStageToPosition(
      draftGraphSnapshot.stages,
      targetNodeKey,
      targetLaneKey,
      targetIndex,
      draftGraphSnapshot.graph,
    );
    await persistProcessGraph(draftGraphSnapshot.graph, nextStages);
  }, [draftGraphSnapshot, persistProcessGraph]);

  const persistRuntimeStageDrag = useCallback(async (
    previousStages: any[],
    nextStages: any[],
  ) => {
    const previousByNodeKey = new Map(
      previousStages.map((stage, index) => [getProcessStageNodeKey(stage, index), stage]),
    );
    const changedStages = nextStages.filter((stage, index) => {
      const previous = previousByNodeKey.get(getProcessStageNodeKey(stage, index));
      return previous && (
        getProcessStageLaneKey(previous) !== getProcessStageLaneKey(stage)
        || Number(previous?.sort_order || 0) !== Number(stage?.sort_order || 0)
      );
    });
    const draftPositionByNodeKey = new Map<string, any>();

    for (const stage of changedStages) {
      const processRunStageId = String(
        stage?.process_run_stage_id
        || (String(stage?.id || '').startsWith('process_run_stage:')
          ? String(stage.id).replace(/^process_run_stage:/, '')
          : '')
      ).trim();
      const laneKey = getProcessStageLaneKey(stage);
      const sortOrder = Math.max(1, Number(stage?.sort_order || 10));

      if (processRunStageId) {
        const { error } = await supabase.rpc('move_process_run_stage', {
          p_process_run_stage_id: processRunStageId,
          p_lane_key: laneKey,
          p_sort_order: sortOrder,
        });
        if (error) throw error;
        continue;
      }

      if (stage?.type === 'task' && stage?.id) {
        const recurrence = parseRecurrenceInfo(stage?.recurrence_info);
        const { error } = await supabase
          .from('tasks')
          .update({
            process_lane_key: laneKey,
            sort_order: sortOrder,
            source_stage_sort_order: sortOrder,
            recurrence_info: {
              ...recurrence,
              [PROCESS_LANE_KEY]: laneKey,
            },
          })
          .eq('id', stage.id);
        if (error) throw error;
        continue;
      }

      draftPositionByNodeKey.set(getProcessStageNodeKey(stage), stage);
    }

    if (draftPositionByNodeKey.size > 0) {
      const nextDraftStages = draftGraphSnapshot.stages.map((stage, index) => {
        const moved = draftPositionByNodeKey.get(getProcessStageNodeKey(stage, index));
        if (!moved) return stage;
        const laneKey = getProcessStageLaneKey(moved);
        return {
          ...stage,
          sort_order: Number(moved?.sort_order || stage?.sort_order || 10),
          [PROCESS_LANE_KEY]: laneKey,
          metadata: {
            ...(stage?.metadata || {}),
            [PROCESS_LANE_KEY]: laneKey,
          },
        };
      });
      await saveDraftStages(nextDraftStages);
    }

    await fetchTasks();
  }, [draftGraphSnapshot.stages, fetchTasks, parseRecurrenceInfo, saveDraftStages]);

  const handleRuntimeStageDragEnd = useCallback(async (
    event: DragEndEvent,
    stages: any[],
    graph: ProcessGraphDefinition,
  ) => {
    const activeData = event.active.data.current as ProcessStageDragData | undefined;
    const overData = event.over?.data.current as (ProcessStageDragData & { dropIndex?: number }) | undefined;
    if (!activeData || !overData || activeData.scopeKey !== overData.scopeKey) return;
    const targetLaneKey = String(overData.laneKey || '').trim();
    if (!targetLaneKey) return;
    const targetIndex = Number.isFinite(Number(overData.dropIndex))
      ? Number(overData.dropIndex)
      : Number(overData.index || 0);
    const executeMove = async () => {
      const nextStages = moveProcessStageToPosition(
        stages,
        getProcessStageNodeKey(activeData.stage),
        targetLaneKey,
        targetIndex,
        graph,
      );
      await persistRuntimeStageDrag(stages, nextStages);
      message.success('جایگاه مرحله فرآیند تغییر کرد');
    };
    const normalizedStatus = String(activeData.stage?.status || '').trim().toLowerCase();
    if (
      activeData.stage?.type === 'task'
      && PROCESS_BAR_DONE_STATUSES.has(normalizedStatus)
    ) {
      Modal.confirm({
        title: 'جابجایی فعالیت تکمیل‌شده',
        content: 'این فعالیت تکمیل شده است. فقط جایگاه آن تغییر می‌کند و اتوماسیون‌های گذشته دوباره اجرا نمی‌شوند.',
        okText: 'تایید جابجایی',
        cancelText: 'انصراف',
        zIndex: 10150,
        onOk: executeMove,
      });
      return;
    }
    await executeMove();
  }, [persistRuntimeStageDrag]);

  const openProcessTriggerModal = useCallback((
    sourceStage: any | null,
    trigger?: ProcessTriggerDefinition | null,
    initialTargetLaneKeys: string[] = [],
  ) => {
    const sourceNodeKey = sourceStage ? getProcessStageNodeKey(sourceStage) : null;
    const nextTrigger = trigger || {
      key: createProcessTriggerKey(),
      name: 'فعال‌کننده فرآیند',
      sourceNodeKey,
      targetLaneKeys: initialTargetLaneKeys,
      workflowId: null,
      manualEnabled: true,
      sortOrder: (draftGraphSnapshot.graph.triggers.length + 1) * 10,
    };
    const initialWorkflowTriggerModuleIds = normalizeProcessActivatorTriggerModuleIds(
      nextTrigger.workflowTriggerModuleIds,
      automationScopeModuleIds,
    );
    setProcessTriggerEditor({ trigger: nextTrigger, sourceStage });
    processTriggerForm.setFieldsValue({
      name: nextTrigger.name,
      manual_enabled: nextTrigger.manualEnabled,
      target_lane_keys: nextTrigger.targetLaneKeys,
      source_node_key: nextTrigger.sourceNodeKey || '__process_start__',
      workflow_description: '',
      workflow_trigger_type: 'on_upsert',
      workflow_execution_mode: 'first_match',
      workflow_interval_value: 1,
      workflow_interval_unit: 'day',
      workflow_interval_at: null,
      workflow_interval_first_run_at: null,
      workflow_interval_minute: null,
      workflow_interval_allowed_from_hour: null,
      workflow_interval_allowed_to_hour: null,
      workflow_interval_day_of_month: null,
      workflow_interval_day_condition: 'any',
      workflow_interval_days_after_holiday: null,
      workflow_batch_size: null,
      workflow_is_active: true,
      workflow_process_execution_action: 'copy_process_template',
      workflow_trigger_module_ids: initialWorkflowTriggerModuleIds,
    });
    setProcessActivatorWorkflowRecord(null);
    setProcessActivatorConditionsAll([]);
    setProcessActivatorConditionsAny([]);
  }, [automationScopeModuleIds, draftGraphSnapshot.graph.triggers.length, processTriggerForm]);

  useEffect(() => {
    if (!processTriggerEditor || !recordId) {
      setProcessActivatorWorkflowRecord(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setProcessActivatorWorkflowLoading(true);
      try {
        let query = supabase
          .from('workflows')
          .select('*')
          .eq('scope_type', 'process_activator')
          .eq('process_template_id', recordId)
          .eq('process_trigger_key', processTriggerEditor.trigger.key)
          .limit(1);
        if (processTriggerEditor.trigger.workflowId) {
          query = query.eq('id', processTriggerEditor.trigger.workflowId);
        }
        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        const workflow = (data || null) as WorkflowRecord | null;
        setProcessActivatorWorkflowRecord(workflow);
        const workflowModuleIds = normalizeProcessActivatorTriggerModuleIds(
          workflow?.module_ids,
          automationScopeModuleIds,
        );
        const workflowPrimaryModuleIds = normalizeProcessActivatorTriggerModuleIds(
          workflow?.module_id ? [workflow.module_id] : [],
          automationScopeModuleIds,
        );
        const triggerModuleIds = normalizeProcessActivatorTriggerModuleIds(
          processTriggerEditor.trigger.workflowTriggerModuleIds,
          automationScopeModuleIds,
        );
        const workflowActions = Array.isArray(workflow?.actions) ? workflow.actions : [];
        const processExecutionAction = workflowActions.find((action: any) => (
          action?.type === 'copy_process_template' || action?.type === 'execute_process'
        ));
        const hasLegacyStageActivationAction = workflowActions.some((action: any) => action?.type === 'activate_specific_process_stage');
        processTriggerForm.setFieldsValue({
          workflow_description: workflow?.description || '',
          workflow_trigger_type: workflow?.trigger_type || 'on_upsert',
          workflow_execution_mode: workflow?.execution_mode || 'first_match',
          workflow_interval_value: workflow?.interval_value || 1,
          workflow_interval_unit: workflow?.interval_unit || 'day',
          workflow_interval_at: workflow?.interval_at || null,
          workflow_interval_first_run_at: workflow?.interval_first_run_at || null,
          workflow_interval_minute: workflow?.interval_minute ?? null,
          workflow_interval_allowed_from_hour: workflow?.interval_allowed_from_hour ?? null,
          workflow_interval_allowed_to_hour: workflow?.interval_allowed_to_hour ?? null,
          workflow_interval_day_of_month: workflow?.interval_day_of_month ?? null,
          workflow_interval_day_condition: workflow?.interval_day_condition || 'any',
          workflow_interval_days_after_holiday: workflow?.interval_days_after_holiday ?? null,
          workflow_batch_size: workflow?.batch_size || null,
          workflow_is_active: workflow?.is_active !== false,
          workflow_process_execution_action: processExecutionAction?.type || (hasLegacyStageActivationAction ? 'execute_process' : 'copy_process_template'),
          workflow_trigger_module_ids: workflowModuleIds.length > 0
            ? workflowModuleIds
            : (workflowPrimaryModuleIds.length > 0 ? workflowPrimaryModuleIds : triggerModuleIds),
        });
        setProcessActivatorConditionsAll(
          (Array.isArray(workflow?.conditions_all) ? workflow.conditions_all : []).filter(
            (condition) => condition.id !== PROCESS_ACTIVATOR_SOURCE_NODE_CONDITION_ID,
          ),
        );
        setProcessActivatorConditionsAny(Array.isArray(workflow?.conditions_any) ? workflow.conditions_any : []);
      } catch (error) {
        if (isAbortLikeError(error)) return;
        if (!cancelled) {
          message.error(toFaErrorMessage(error as Error, 'بارگذاری شرط‌ها و زمان‌بندی فعال‌کننده ناموفق بود'));
        }
      } finally {
        if (!cancelled) setProcessActivatorWorkflowLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [automationScopeModuleIds, message, processTriggerEditor, processTriggerForm, recordId]);

  const handleSaveProcessTrigger = useCallback(async () => {
    if (!processTriggerEditor) return null;
    const values = await processTriggerForm.validateFields();
    const isProcessStartTrigger = String(values?.source_node_key || '').trim() === '__process_start__';
    const workflowTriggerType = String(values?.workflow_trigger_type || 'on_upsert');
    const requiresTriggerModuleSelection = isProcessStartTrigger && workflowTriggerType !== 'interval';
    const selectedWorkflowTriggerModuleIds = isProcessStartTrigger
      ? (requiresTriggerModuleSelection ? normalizeProcessActivatorTriggerModuleIds(
          values?.workflow_trigger_module_ids,
          automationScopeModuleIds,
        ) : [])
      : [];
    if (requiresTriggerModuleSelection && selectedWorkflowTriggerModuleIds.length === 0) {
      throw new Error('حداقل یک ماژول محرک را انتخاب کنید.');
    }
    const triggerBase: ProcessTriggerDefinition = {
      ...processTriggerEditor.trigger,
      name: String(values?.name || '').trim() || 'فعال‌کننده فرآیند',
      sourceNodeKey: isProcessStartTrigger
        ? null
        : String(values?.source_node_key || '').trim() || null,
      manualEnabled: values?.manual_enabled !== false,
      targetLaneKeys: Array.isArray(values?.target_lane_keys) ? values.target_lane_keys : [],
      workflowTriggerModuleIds: selectedWorkflowTriggerModuleIds,
    };
    if (isProcessGraphConnectionCyclic(
      draftGraphSnapshot.graph,
      triggerBase.key,
      triggerBase.sourceNodeKey,
      triggerBase.targetLaneKeys,
      draftGraphSnapshot.stages,
    )) {
      throw new Error('این اتصال باعث ایجاد چرخه در فرآیند می‌شود. ردیف مقصد دیگری انتخاب کنید.');
    }
    let savedWorkflowId = String(triggerBase.workflowId || processActivatorWorkflowRecord?.id || '').trim() || null;
    if (recordId) {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || null;
      const isInterval = workflowTriggerType === 'interval';
      const selectedTriggerModuleIds = triggerBase.sourceNodeKey
        ? ['tasks']
        : (isInterval
            ? automationScopeModuleIds
            : selectedWorkflowTriggerModuleIds);
      const lockedConditions = triggerBase.sourceNodeKey
        ? [{
            id: PROCESS_ACTIVATOR_SOURCE_NODE_CONDITION_ID,
            field: 'process_node_key',
            operator: 'eq',
            value: triggerBase.sourceNodeKey,
          }]
        : [];
      const selectedProcessActionType = String(values?.workflow_process_execution_action || 'copy_process_template') === 'execute_process'
        ? 'execute_process'
        : 'copy_process_template';
      const existingActivationAction = (Array.isArray(processActivatorWorkflowRecord?.actions)
        ? processActivatorWorkflowRecord?.actions
        : []
      )?.find((action: any) => (
        action?.type === selectedProcessActionType
        || action?.type === 'copy_process_template'
        || action?.type === 'execute_process'
        || action?.type === 'activate_specific_process_stage'
      ));
      const activationAction = {
        id: String(existingActivationAction?.id || createWorkflowId()),
        type: selectedProcessActionType,
        config: {
          template_id: recordId,
          process_trigger_key: triggerBase.key,
          target_lane_keys: triggerBase.targetLaneKeys,
        },
      };
      const workflowPayload: Record<string, any> = {
        module_id: triggerBase.sourceNodeKey ? 'tasks' : (selectedTriggerModuleIds[0] || 'tasks'),
        module_ids: selectedTriggerModuleIds,
        scope_type: 'process_activator',
        process_template_id: recordId,
        process_trigger_key: triggerBase.key,
        process_source_node_key: triggerBase.sourceNodeKey,
        process_target_lane_keys: triggerBase.targetLaneKeys,
        manual_enabled: triggerBase.manualEnabled,
        name: triggerBase.name,
        description: String(values?.workflow_description || '').trim() || null,
        trigger_type: workflowTriggerType,
        execution_mode: values?.workflow_execution_mode || 'first_match',
        interval_value: isInterval ? Math.max(1, Number(values?.workflow_interval_value || 1)) : null,
        interval_unit: isInterval ? values?.workflow_interval_unit || 'day' : null,
        interval_at: isInterval ? values?.workflow_interval_at || null : null,
        interval_first_run_at: isInterval ? values?.workflow_interval_first_run_at || null : null,
        interval_minute: isInterval ? values?.workflow_interval_minute ?? null : null,
        interval_allowed_from_hour: isInterval ? values?.workflow_interval_allowed_from_hour ?? null : null,
        interval_allowed_to_hour: isInterval ? values?.workflow_interval_allowed_to_hour ?? null : null,
        interval_day_of_month: isInterval ? values?.workflow_interval_day_of_month ?? null : null,
        interval_day_condition: isInterval ? values?.workflow_interval_day_condition || null : null,
        interval_days_after_holiday: isInterval ? values?.workflow_interval_days_after_holiday ?? null : null,
        batch_size: isInterval && values?.workflow_batch_size ? Math.max(1, Number(values.workflow_batch_size)) : null,
        conditions_all: [...lockedConditions, ...processActivatorConditionsAll],
        conditions_any: processActivatorConditionsAny,
        actions: [activationAction],
        is_active: values?.workflow_is_active !== false,
        updated_by: userId,
      };

      if (savedWorkflowId) {
        const { error } = await supabase.from('workflows').update(workflowPayload).eq('id', savedWorkflowId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('workflows')
          .insert({ ...workflowPayload, created_by: userId })
          .select('id')
          .single();
        if (error) throw error;
        savedWorkflowId = String(data?.id || '').trim() || null;
      }
    }
    const trigger: ProcessTriggerDefinition = {
      ...triggerBase,
      workflowId: savedWorkflowId,
    };
    const nextGraph: ProcessGraphDefinition = {
      ...draftGraphSnapshot.graph,
      triggers: [
        ...draftGraphSnapshot.graph.triggers
          .filter((item) => item.key !== trigger.key)
          .map((item) => ({
            ...item,
            targetLaneKeys: item.targetLaneKeys.filter(
              (laneKey) => !trigger.targetLaneKeys.includes(laneKey),
            ),
          })),
        trigger,
      ],
      lanes: draftGraphSnapshot.graph.lanes.map((lane) => (
        trigger.targetLaneKeys.includes(lane.key)
          ? { ...lane, parentTriggerKey: trigger.key }
          : (lane.parentTriggerKey === trigger.key ? { ...lane, parentTriggerKey: null } : lane)
      )),
    };
    await persistProcessGraph(nextGraph);
    if (savedWorkflowId) {
      setProcessActivatorWorkflowRecord((current) => current
        ? {
            ...current,
            id: savedWorkflowId!,
            name: trigger.name,
            module_id: (trigger.workflowTriggerModuleIds || [])[0] || current.module_id,
            module_ids: trigger.workflowTriggerModuleIds || current.module_ids,
          }
        : ({
            id: savedWorkflowId,
            name: trigger.name,
            module_id: (trigger.workflowTriggerModuleIds || [])[0] || null,
            module_ids: trigger.workflowTriggerModuleIds || [],
          } as WorkflowRecord));
    }
    setProcessTriggerEditor({ ...processTriggerEditor, trigger });
    message.success('فعال‌کننده فرآیند ذخیره شد');
    return trigger;
  }, [
    automationScopeModuleIds,
    draftGraphSnapshot.graph,
    draftGraphSnapshot.stages,
    persistProcessGraph,
    processActivatorConditionsAll,
    processActivatorConditionsAny,
    processActivatorWorkflowRecord,
    processTriggerEditor,
    processTriggerForm,
    recordId,
  ]);

  const handleDeleteProcessTrigger = useCallback(async (deleteChildLanes: boolean) => {
    if (!processTriggerEditor) return;
    const triggerKey = processTriggerEditor.trigger.key;
    const storedTrigger = draftGraphSnapshot.graph.triggers.find((trigger) => trigger.key === triggerKey);
    if (!storedTrigger) {
      setProcessTriggerEditor(null);
      return;
    }

    const removedLaneKeys = new Set<string>();
    const removedTriggerKeys = new Set<string>([triggerKey]);
    if (deleteChildLanes) {
      const pendingLaneKeys = [...storedTrigger.targetLaneKeys];
      while (pendingLaneKeys.length > 0) {
        const laneKey = String(pendingLaneKeys.shift() || '').trim();
        if (!laneKey || removedLaneKeys.has(laneKey)) continue;
        removedLaneKeys.add(laneKey);
        const laneNodeKeys = new Set(
          draftGraphSnapshot.stages
            .filter((stage) => getProcessStageLaneKey(stage) === laneKey)
            .map((stage, index) => getProcessStageNodeKey(stage, index)),
        );
        draftGraphSnapshot.graph.triggers.forEach((trigger) => {
          if (!trigger.sourceNodeKey || !laneNodeKeys.has(trigger.sourceNodeKey)) return;
          removedTriggerKeys.add(trigger.key);
          trigger.targetLaneKeys.forEach((targetLaneKey) => pendingLaneKeys.push(targetLaneKey));
        });
      }
    }

    const removedWorkflowIds = draftGraphSnapshot.graph.triggers
      .filter((trigger) => removedTriggerKeys.has(trigger.key))
      .map((trigger) => String(trigger.workflowId || '').trim())
      .filter(Boolean);
    const nextStages = deleteChildLanes
      ? draftGraphSnapshot.stages.filter((stage) => !removedLaneKeys.has(getProcessStageLaneKey(stage)))
      : draftGraphSnapshot.stages;
    const nextGraph: ProcessGraphDefinition = {
      ...draftGraphSnapshot.graph,
      lanes: draftGraphSnapshot.graph.lanes
        .filter((lane) => !removedLaneKeys.has(lane.key))
        .map((lane) => (
          lane.parentTriggerKey && removedTriggerKeys.has(lane.parentTriggerKey)
            ? { ...lane, parentTriggerKey: null }
            : lane
        )),
      triggers: draftGraphSnapshot.graph.triggers.filter(
        (trigger) => !removedTriggerKeys.has(trigger.key),
      ),
    };

    await persistProcessGraph(nextGraph, nextStages);
    if (removedWorkflowIds.length > 0) {
      const { error } = await supabase.from('workflows').delete().in('id', removedWorkflowIds);
      if (error) throw error;
    }
    setProcessTriggerEditor(null);
    message.success(
      deleteChildLanes
        ? 'فعال‌کننده و ردیف‌های زیرمجموعه حذف شدند'
        : 'فعال‌کننده حذف و ردیف‌ها مستقل شدند',
    );
  }, [
    draftGraphSnapshot.graph,
    draftGraphSnapshot.stages,
    persistProcessGraph,
    processTriggerEditor,
  ]);

  const handleRunProcessTrigger = useCallback(async (trigger: ProcessTriggerDefinition, stages: any[]) => {
    if (!trigger.manualEnabled) return;
    const processRunId = String(
      stages.map((stage) => stage?.process_run_id || stage?.recurrence_info?.process_run_id).find(Boolean) || ''
    ).trim();
    if (!processRunId) {
      const templateId = String(
        stages
          .map((stage) => (
            stage?.source_template_id
            || stage?.recurrence_info?.process_group?.template_id
            || stage?.metadata?.source_template_id
          ))
          .find(Boolean)
        || ''
      ).trim();
      if (!templateId || !recordId || !moduleId) {
        message.warning('الگوی مبدا برای اجرای فعال‌کننده پیدا نشد');
        return;
      }
      await activateProcessStageAction({
        actionType: 'activate_specific_process_stage',
        config: {
          template_id: templateId,
          target_lane_keys: trigger.targetLaneKeys,
        },
        record: { id: recordId },
        moduleId,
      });
      await fetchTasks();
      message.success('فعال‌کننده فرآیند اجرا شد');
      return;
    }
    const materialized = materializeLegacyProcessGraph(stages);
    const laneKeys = new Set(trigger.targetLaneKeys);
    const nodeKeys = getProcessStagesByLane(materialized.stages, materialized.graph)
      .filter((lane) => laneKeys.has(lane.key))
      .map((lane) => lane.stages[0])
      .filter(Boolean)
      .map((stage, index) => getProcessStageNodeKey(stage, index));
    await activateProcessRunNodes({ processRunId, nodeKeys });
    await fetchTasks();
    message.success('فعال‌کننده فرآیند اجرا شد');
  }, [fetchTasks, moduleId, recordId]);

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

  const getLineSegments = (lineTasks: any[], activeDraftSegments: any[] = draftSegments, fallbackGroupId?: any) => {
    const normalizedTasks = (lineTasks || []).map((task: any) => {
      const recurrence = parseRecurrenceInfo(task?.recurrence_info);
      const isRuntimeStagePreview = Boolean(task?.isProcessRunStagePreview);
      return {
        ...task,
        type: isRuntimeStagePreview ? 'draft' : 'task',
        label: task?.label || task?.name || task?.title || 'مرحله',
        [PROCESS_NODE_KEY]: task?.[PROCESS_NODE_KEY] || recurrence?.[PROCESS_NODE_KEY],
        [PROCESS_LANE_KEY]: task?.[PROCESS_LANE_KEY] || recurrence?.[PROCESS_LANE_KEY],
        metadata: {
          ...recurrence,
          [PROCESS_GRAPH_METADATA_KEY]: recurrence?.[PROCESS_GRAPH_METADATA_KEY],
        },
        _normalizedName: normalizeStageName(task.name || task.title),
        _normalizedKey: `${normalizeStageName(task.name || task.title)}::${Number(task?.sort_order || 0)}`,
      };
    });
    const taskIdentityKeys = new Set(
      normalizedTasks.flatMap((task: any) => buildProcessStageIdentityKeys(task, fallbackGroupId))
    );

    const lineDrafts = activeDraftSegments.filter((draft: any) => {
      const normalizedDraft = normalizeStageName(draft.label);
      const normalizedDraftKey = `${normalizedDraft}::${Number(draft?.sort_order || 0)}`;
      const draftIdentityKeys = buildProcessStageIdentityKeys(draft, fallbackGroupId);
      const matched = normalizedTasks.some((t: any) =>
        draftIdentityKeys.some((key) => taskIdentityKeys.has(key))
        || (
          (t._normalizedName && t._normalizedName === normalizedDraft)
          && (t._normalizedKey === normalizedDraftKey || Number(draft?.sort_order || 0) <= 0)
        )
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
      lineSegments: getLineSegments(group.tasks, group.stages, group.id),
    }));
  };
  const canAutoAssignProcessGroup = useCallback((group: any) => {
    const stages = Array.isArray(group?.stages) ? group.stages : [];
    if (stages.length === 0) return false;
    const existingKeys = new Set(
      (Array.isArray(group?.tasks) ? group.tasks : [])
        .flatMap((task: any) => buildProcessStageIdentityKeys(task, group?.id))
    );

    return stages.some((stage: any) => {
      const stageName = String(stage?.name || stage?.title || '').trim();
      if (!stageName) return false;
      const stageKeys = buildProcessStageIdentityKeys(stage, group?.id);
      return stageKeys.length > 0 && !stageKeys.some((key) => existingKeys.has(key));
    });
  }, [buildProcessStageIdentityKeys]);
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
  const getProcessGroupRunInfo = useCallback((group: any) => {
    const groupTasks = Array.isArray(group?.tasks) ? group.tasks : [];
    const runId = groupTasks
      .map((task: any) => String(task?.process_run_id || '').trim())
      .find(Boolean);
    const groupId = String(group?.id || '').trim();
    return processRuntimeRuns.find((run: any) => (
      (runId && String(run?.id || '') === runId)
      || (groupId && String(run?.process_group_id || '') === groupId)
    )) || groupTasks.map((task: any) => task?.process_run_info).find(Boolean) || null;
  }, [processRuntimeRuns]);
  const formatProcessSystemDate = useCallback((value: any) => {
    const raw = String(value || '').trim();
    if (!raw) return 'ثبت نشده';
    return toPersianNumber(safeJalaliFormat(raw, 'YYYY/MM/DD HH:mm') || raw);
  }, []);
  const renderProcessRunInfo = useCallback((group: any) => {
    const run = getProcessGroupRunInfo(group);
    if (!run) return null;
    const content = (
      <div className="min-w-[15rem] space-y-2 text-xs" dir="rtl">
        <div><span className="text-gray-500">وضعیت:</span> {String(run?.status || '').trim() === 'completed' ? 'تکمیل‌شده' : String(run?.status || '').trim() === 'canceled' ? 'لغوشده' : 'در حال اجرا'}</div>
        <div><span className="text-gray-500">زمان ایجاد:</span> {formatProcessSystemDate(run?.created_at)}</div>
        <div><span className="text-gray-500">ایجادکننده:</span> {String(run?.created_by_name || '').trim() || 'ثبت نشده'}</div>
        <div><span className="text-gray-500">آخرین ویرایش:</span> {formatProcessSystemDate(run?.updated_at)}</div>
        <div><span className="text-gray-500">آخرین ویرایش‌کننده:</span> {String(run?.updated_by_name || '').trim() || 'ثبت نشده'}</div>
        <div><span className="text-gray-500">زمان شروع:</span> {formatProcessSystemDate(run?.started_at)}</div>
        {run?.completed_at ? (
          <div><span className="text-gray-500">زمان تکمیل:</span> {formatProcessSystemDate(run.completed_at)}</div>
        ) : null}
      </div>
    );
    return (
      <Popover
        content={content}
        trigger="click"
        getPopupContainer={resolveOverlayPopupContainer}
        overlayStyle={{ zIndex: 10000 }}
      >
        <button
          type="button"
          aria-label="اطلاعات سیستمی فرآیند"
          title="اطلاعات سیستمی فرآیند"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/30"
        >
          <InfoCircleOutlined className="text-xs" />
        </button>
      </Popover>
    );
  }, [formatProcessSystemDate, getProcessGroupRunInfo]);
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
      const addRelatedId = (targetModuleId: unknown, targetRecordId: unknown) => {
        const normalizedModuleId = String(targetModuleId || '').trim();
        const normalizedRecordId = String(targetRecordId || '').trim();
        if (!normalizedModuleId || !normalizedRecordId || !MODULES[normalizedModuleId]) return;
        if (!canViewModuleByPermissions(normalizedModuleId)) return;
        if (!groupedIds.has(normalizedModuleId)) groupedIds.set(normalizedModuleId, new Set<string>());
        groupedIds.get(normalizedModuleId)!.add(normalizedRecordId);
      };

      (tasks || []).forEach((task: any) => {
        const recurrence = parseRecurrenceInfo(task?.recurrence_info);
        const sourceLink = resolveTaskSourceLink(task);
        addRelatedId(sourceLink.moduleId, sourceLink.recordId);
        Object.entries(parseProcessLinkMap(recurrence?.process_links)).forEach(([targetModuleId, targetRecordId]) => {
          addRelatedId(targetModuleId, targetRecordId);
        });
        TASK_RELATED_FIELD_DEFINITIONS.forEach((meta) => {
          addRelatedId(meta.moduleId, task?.[meta.fieldKey]);
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
  }, [canViewModuleByPermissions, parseRecurrenceInfo, tasks]);

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
          {isProcessTemplateModule ? (
            <div className="space-y-2">
              <DndContext
                sensors={processDragSensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => {
                  void handleDraftStageDragEnd(event).catch((error) => {
                    message.error(toFaErrorMessage(error, 'جابجایی مرحله الگوی فرآیند ناموفق بود'));
                  });
                }}
              >
              {draftProcessLanes.map((lane, laneIndex) => {
                const laneTriggers = draftGraphSnapshot.graph.triggers.filter(
                  (trigger) => trigger.targetLaneKeys.includes(lane.key),
                );
                const laneDragScopeKey = `template:${recordId || 'draft'}`;
                const laneBarKey = `${laneDragScopeKey}:bar:${lane.key}`;
                const isLaneBarExpanded = expandedProcessBars.has(laneBarKey);
                return (
                  <div
                    key={lane.key}
                    className={`relative border-r-2 pr-2 ${lane.parentTriggerKey ? 'border-amber-300' : 'border-transparent'}`}
                  >
                  <div className="mb-1 flex items-center gap-2">
                    <Input
                      variant="borderless"
                      defaultValue={lane.name}
                      placeholder={laneIndex === 0 && !lane.name ? 'نام ردیف (اختیاری)' : 'نام ردیف'}
                      disabled={readOnly || !multiLaneFeatureEnabled || !canManageProcessGraph}
                      className="max-w-64 !px-1 text-xs font-semibold"
                      onBlur={(event) => {
                        const nextName = event.target.value.trim();
                        if (nextName !== lane.name) void handleRenameProcessLane(lane.key, nextName);
                      }}
                    />
                    {renderProcessBarExpandToggle(laneBarKey, isLaneBarExpanded)}
                  </div>
                  <ProcessLaneDropZone
                    id={`${laneDragScopeKey}:lane:${lane.key}:end`}
                    scopeKey={laneDragScopeKey}
                    laneKey={lane.key}
                    index={lane.stages.length}
                    disabled={readOnly || !multiLaneFeatureEnabled || !canManageProcessGraph}
                    className={`flex min-h-0 w-full items-stretch overflow-x-auto overflow-y-visible rounded-lg border border-gray-200/80 bg-white/80 p-1 dark:border-gray-700 dark:bg-white/5 ${compact ? 'min-h-[2.5rem]' : 'min-h-[3rem]'}`}
                  >
                    <div className="flex shrink-0 items-center pl-1">
                      {laneTriggers.length > 0 ? laneTriggers.map((trigger) => (
                        <Tooltip key={trigger.key} title={trigger.name || 'فعال‌کننده فرآیند'}>
                          <Button
                            shape="circle"
                            size="small"
                            icon={<ThunderboltOutlined />}
                            disabled={readOnly || !multiLaneFeatureEnabled || !canManageProcessGraph}
                            onClick={() => openProcessTriggerModal(null, trigger, [lane.key])}
                            className="border-amber-300 bg-amber-50 text-amber-700"
                          />
                        </Tooltip>
                      )) : (
                        !readOnly && multiLaneFeatureEnabled && canManageProcessGraph ? (
                          <Tooltip title="افزودن فعال‌کننده فرآیند">
                            <Button
                              type="text"
                              shape="circle"
                              size="small"
                              icon={<ThunderboltOutlined />}
                              onClick={() => openProcessTriggerModal(null, null, [lane.key])}
                              className="text-gray-400 hover:!text-amber-600"
                            />
                          </Tooltip>
                        ) : (
                          <span className="inline-block h-6 w-6" />
                        )
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 items-stretch">
                      {lane.stages.length > 0 ? lane.stages.map((stage: any, index: number) => {
                        const nodeKey = getProcessStageNodeKey(stage, index);
                        return (
                          <React.Fragment key={stage.id || nodeKey}>
                          <ProcessStageInsertionDropZone
                            id={`${laneDragScopeKey}:lane:${lane.key}:insert:${index}`}
                            scopeKey={laneDragScopeKey}
                            laneKey={lane.key}
                            index={index}
                            disabled={readOnly || !multiLaneFeatureEnabled || !canManageProcessGraph}
                          />
                          <ProcessStageDragSurface
                            id={`${laneDragScopeKey}:stage:${nodeKey}`}
                            data={{
                              scopeKey: laneDragScopeKey,
                              laneKey: lane.key,
                              index,
                              stage,
                            }}
                            disabled={readOnly || !multiLaneFeatureEnabled || !canManageProcessGraph}
                          >
                            {({ ref, attributes, listeners, style: dragStyle, isOver }) => (
                              <Popover
                                content={
                                  <div className="max-w-[min(92vw,22rem)] space-y-2 break-words p-1 text-xs">
                                    <div className="font-bold text-[rgba(var(--brand-800-rgb),1)] dark:text-gray-100">{stage.label || stage.name}</div>
                                    <div>ترتیب: {toPersianNumber(stage.sort_order || '-')}</div>
                                    <div>مسئول: {getDraftAssigneeLabel(stage)}</div>
                                    <div>زمان انجام: {formatDraftDuration(stage)}</div>
                                  </div>
                                }
                                trigger={readOnly ? 'click' : 'hover'}
                                overlayStyle={{ zIndex: 10000, maxWidth: 'calc(100vw - 1rem)' }}
                              >
                                <div
                                  ref={ref as React.Ref<HTMLDivElement>}
                                  className={`group relative flex min-w-0 flex-1 basis-0 items-stretch ${index !== 0 ? 'mr-px' : ''} ${isOver ? 'brightness-95' : ''}`}
                                  style={{
                                    ...dragStyle,
                                    zIndex: Math.max(1, 1000 - index),
                                    minWidth: isLaneBarExpanded
                                      ? getExpandedProcessSegmentWidth(stage.label || stage.name)
                                      : (isMobileProcessViewport ? 76 : undefined),
                                  }}
                                >
                                  <ProcessStageDragHandleContext.Provider value={{ attributes, listeners }}>
                                  <div
                                    className="relative flex w-full min-w-0 cursor-pointer items-center justify-center overflow-hidden bg-[rgba(var(--brand-50-rgb),0.92)] px-2 py-2 text-center transition-all group-hover:bg-[rgba(var(--brand-100-rgb),0.9)] dark:bg-[rgba(var(--brand-700-rgb),0.18)] dark:group-hover:bg-[rgba(var(--brand-700-rgb),0.28)]"
                                    style={getProcessStageShapeStyle(index)}
                                    onClick={() => {
                                      if (!readOnly) openDraftStageModal(stage, 'stage');
                                    }}
                                  >
                                    <span className={`block w-full min-w-0 truncate font-medium text-gray-700 dark:text-gray-100 ${compact ? 'text-[10px]' : 'text-[12px]'}`}>
                                      {stage.label || stage.name}
                                    </span>
                                    {!readOnly && (
                                      <div className={`absolute top-1 z-30 flex gap-0.5 ${isMobileProcessViewport ? 'left-1 opacity-100' : 'left-4 opacity-0 transition-opacity group-hover:opacity-100'}`}>
                                        <ProcessStageActionControls
                                          mobile={isMobileProcessViewport}
                                          copyTitle="کپی مرحله"
                                          moveTitle="جابجایی مرحله"
                                          deleteTitle="حذف مرحله"
                                          onCopy={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            void handleDuplicateDraftStage(stage);
                                          }}
                                          onMove={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            openStageMoveModal(stage);
                                          }}
                                          onDelete={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            void handleRemoveDraftStage(stage);
                                          }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                  {renderDraftProcessStageOutline(index)}
                                  </ProcessStageDragHandleContext.Provider>
                                </div>
                              </Popover>
                            )}
                          </ProcessStageDragSurface>
                          {index === lane.stages.length - 1 ? (
                            <ProcessStageInsertionDropZone
                              id={`${laneDragScopeKey}:lane:${lane.key}:insert:${lane.stages.length}`}
                              scopeKey={laneDragScopeKey}
                              laneKey={lane.key}
                              index={lane.stages.length}
                              disabled={readOnly || !multiLaneFeatureEnabled || !canManageProcessGraph}
                            />
                          ) : null}
                          </React.Fragment>
                        );
                      }) : (
                        <div className="flex w-full items-center justify-center text-xs text-gray-400">این ردیف هنوز مرحله‌ای ندارد</div>
                      )}
                    </div>
                    {!readOnly && multiLaneFeatureEnabled && canManageProcessGraph ? (
                      <div className="flex shrink-0 items-center pr-1">
                        <Tooltip title="افزودن مرحله به انتهای این ردیف">
                          <Button
                            type="text"
                            shape="circle"
                            size="small"
                            icon={<PlusOutlined />}
                            onClick={() => {
                              setActiveDraftLaneKey(lane.key);
                              openDraftStageChooser();
                            }}
                            className="text-[rgba(var(--brand-700-rgb),1)] hover:!bg-[rgba(var(--brand-50-rgb),0.9)] hover:!text-[rgba(var(--brand-600-rgb),1)]"
                          />
                        </Tooltip>
                      </div>
                    ) : null}
                  </ProcessLaneDropZone>
                  </div>
                );
              })}
              </DndContext>
              {draftProcessLanes.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="بدون ردیف فرآیند" />
              ) : null}
            </div>
          ) : (
            <div className={`flex min-h-0 w-full items-stretch rounded-2xl border border-gray-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(243,244,246,0.96))] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] dark:border-gray-700 dark:bg-[linear-gradient(180deg,rgba(31,41,55,0.94),rgba(17,24,39,0.94))] ${compact ? 'min-h-[2.5rem]' : 'min-h-[3rem]'}`}>
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
                    className={`group relative flex min-w-0 flex-1 basis-0 cursor-pointer items-center justify-center rounded-xl border border-dashed border-gray-300/90 bg-white/70 px-2 py-2 text-center transition-all hover:border-[rgba(var(--brand-400-rgb),0.85)] hover:bg-white dark:border-gray-600/80 dark:bg-white/5 dark:hover:border-[rgba(var(--brand-300-rgb),0.55)] dark:hover:bg-white/10 ${index !== 0 ? 'mr-1' : ''}`}
                    onClick={() => {
                      if (!readOnly) openDraftStageModal(stage, 'stage');
                    }}
                  >
                    <span className={`block w-full min-w-0 truncate font-medium text-gray-700 dark:text-gray-100 ${compact ? 'text-[10px]' : 'text-[12px]'}`}>
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
          )}

          {!readOnly && (
            <div className="flex flex-wrap justify-start gap-2">
              {isProcessTemplateModule ? (
                <>
                  <Button
                    icon={<PlusOutlined />}
                    size={compact ? 'small' : 'middle'}
                    disabled={!multiLaneFeatureEnabled || !canManageProcessGraph}
                    onClick={() => { void handleAddProcessLane(); }}
                  >
                    افزودن ردیف
                  </Button>
                </>
              ) : null}
            </div>
          )}
          {isProcessTemplateModule && !multiLaneFeatureEnabled ? (
            <Alert
              type="info"
              showIcon
              message="نمایش فرآیند حفظ شده است؛ ایجاد یا ویرایش ردیف‌ها در پلن فعلی فعال نیست."
            />
          ) : null}
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
        const normalizedOnlyProcessGroupId = String(onlyProcessGroupId || '').trim();
        const hiddenCompletedGroupCount = normalizedProcessLineGroups.filter((group: any) => isProcessGroupCompleted(group)).length;
        const visibleProcessLineGroups = normalizedProcessLineGroups.filter((group: any) => {
          const groupId = String(group?.id || '').trim();
          if (normalizedOnlyProcessGroupId && groupId !== normalizedOnlyProcessGroupId) return false;
          return showCompletedProcessGroups || !isProcessGroupCompleted(group);
        });
        const hasHiddenCompletedProcessGroups = hiddenCompletedGroupCount > 0 && visibleProcessLineGroups.length === 0;
        const isProcessEmptyState = isProcessRecordModule
          && normalizedProcessLineGroups.length === 1
          && (!Array.isArray(normalizedProcessLineGroups[0]?.stages) || normalizedProcessLineGroups[0].stages.length === 0)
          && (!Array.isArray(normalizedProcessLineGroups[0]?.tasks) || normalizedProcessLineGroups[0].tasks.length === 0)
          && (!Array.isArray(normalizedProcessLineGroups[0]?.lineSegments) || normalizedProcessLineGroups[0].lineSegments.length === 0);
        const showProcessEmptyState = shouldShowProcessEmptyState({
          loaded: tasksLoaded,
          succeeded: tasksLoadSucceeded,
          isEmpty: isProcessEmptyState,
        });

        const renderSegmentsBar = (
          segments: any[],
          barKey: string,
          dragConfig?: { scopeKey: string; laneKey: string },
          options?: { expanded?: boolean },
        ) => {
          const isBarExpanded = !!options?.expanded;
          const naturalDisplayMode = getProcessBarDisplayMode(segments);
          const displayMode = isBarExpanded && naturalDisplayMode === 'summary'
            ? 'dense'
            : naturalDisplayMode;
          const useVerticalMainLayout = false;
          const forceCompactProcessBar = isMobileProcessViewport || displayMode === 'dense' || isBarExpanded;
          const compactProcessStageMinWidth = cardCompact
            ? CARD_COMPACT_PROCESS_STAGE_MIN_WIDTH
            : 76;
          const shouldCompactSegments = !isBarExpanded && displayMode !== 'summary' && cardCompact && segments.length > 5;
          const displaySegments = shouldCompactSegments ? segments.slice(0, 5) : segments;
          const hiddenCount = shouldCompactSegments ? Math.max(0, segments.length - displaySegments.length) : 0;
          const currentSegment = getCurrentProcessSegment(segments);
          const currentSegmentIndex = currentSegment
            ? segments.findIndex((segment) => String(segment?.id || '') === String(currentSegment?.id || ''))
            : -1;
          const currentSegmentLabel = currentSegment
            ? String(currentSegment?.title || currentSegment?.name || currentSegment?.label || 'مرحله بدون عنوان').trim()
            : 'بدون مرحله فعال';
          const currentStatusLabel = currentSegment?.type === 'task'
            ? getTaskStatusLabel(String(currentSegment?.status || ''), currentSegment)
            : 'پیش نویس';

          const renderTaskSegment = (segment: any, index: number, summary = false) => {
            const isAssignedToCurrent = isTaskAssignedToCurrentUser(segment);
            const isCurrent = currentSegment && String(currentSegment?.id || '') === String(segment?.id || '');
            const segmentColor = getStatusColor(segment.status, segment);
            const normalizedStatus = String(segment?.status || '').toLowerCase();
            const segmentLabel = String(segment?.title || segment?.name || 'مرحله بدون عنوان').trim();
            const isRuntimeStagePreview = Boolean(segment?.isProcessRunStagePreview);

            if (summary) {
              return (
                <button
                  type="button"
                  key={`${barKey}-task-summary-${segment.id || index}`}
                  data-task-segment-id={String(segment.id)}
                  title={segmentLabel}
                  className={`relative min-w-[0.7rem] flex-1 basis-0 rounded-full transition-all ${isCurrent ? 'h-3.5 ring-2 ring-white/90 dark:ring-gray-900' : 'h-2.5 opacity-90'} ${isRuntimeStagePreview ? 'cursor-default' : 'cursor-pointer hover:opacity-100'} ${isAssignedToCurrent ? 'z-10' : ''}`}
                  style={{
                    ...getProcessStageShapeStyle(index, { summary: true }),
                    zIndex: Math.max(1, 1000 - index),
                    backgroundColor: segmentColor,
                    boxShadow: isAssignedToCurrent
                      ? `0 0 8px ${segmentColor}55, 0 0 18px ${segmentColor}33`
                      : undefined,
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (isRuntimeStagePreview) return;
                    openTaskProcessModal({ task: segment });
                  }}
                />
              );
            }

            return (
              <button
                type="button"
                key={`${barKey}-task-${segment.id}`}
                data-task-segment-id={String(segment.id)}
                className={`group relative flex min-w-0 overflow-hidden rounded-xl px-2 text-center transition-all ${isRuntimeStagePreview ? 'cursor-default' : 'cursor-pointer hover:brightness-105'} ${useVerticalMainLayout ? `w-full justify-between gap-3 text-right ${index !== 0 ? 'mt-1.5' : ''}` : `${isBarExpanded ? 'flex-none' : 'flex-1 basis-0'} items-center justify-center ${index !== 0 ? (compact || cardCompact ? 'mr-px' : 'mr-0.5') : ''}`} ${isAssignedToCurrent ? 'z-10' : ''} ${displayMode === 'dense' ? 'py-2.5' : 'py-3'}`}
                style={{
                  ...getProcessStageShapeStyle(index),
                  zIndex: Math.max(1, 1000 - index),
                  backgroundColor: segmentColor,
                  minWidth: forceCompactProcessBar ? compactProcessStageMinWidth : undefined,
                  width: isBarExpanded ? getExpandedProcessSegmentWidth(segmentLabel) : undefined,
                  minHeight: forceCompactProcessBar ? 44 : undefined,
                  boxShadow: isAssignedToCurrent
                    ? `0 0 8px ${segmentColor}66, 0 0 16px ${segmentColor}4D, 0 0 24px ${segmentColor}33`
                    : undefined,
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (isRuntimeStagePreview) return;
                  openTaskProcessModal({ task: segment });
                }}
              >
                <div className={`flex min-w-0 overflow-hidden ${useVerticalMainLayout ? 'flex-1 items-center justify-between gap-3' : 'flex-col items-center justify-center gap-1'}`}>
                  <span className={`inline-flex max-w-full items-center gap-1.5 text-white drop-shadow-md ${useVerticalMainLayout ? 'justify-start text-right' : `justify-center ${isBarExpanded ? '' : 'truncate'}`} ${displayMode === 'dense' ? 'text-[10px]' : (compact || cardCompact ? 'text-[10px]' : 'text-[12px]')} font-semibold`}>
                    {renderTaskAssigneeAvatar(segment, displayMode)}
                    {normalizedStatus === 'canceled' ? <CloseOutlined className={displayMode === 'dense' ? 'text-[10px]' : 'text-[11px]'} /> : (
                      PROCESS_BAR_DONE_STATUSES.has(normalizedStatus)
                        ? <CheckOutlined className={displayMode === 'dense' ? 'text-[10px]' : 'text-[11px]'} />
                        : <HourglassOutlined className={displayMode === 'dense' ? 'text-[10px]' : 'text-[11px]'} />
                    )}
                    <span className={useVerticalMainLayout ? 'min-w-0 flex-1 whitespace-normal break-words leading-5' : (isBarExpanded ? 'whitespace-normal break-words leading-4' : 'truncate')}>
                      {displayMode === 'dense'
                        ? (shouldShortenProcessSegmentLabel(segmentLabel, segments.length, displayMode, isBarExpanded) ? getDenseSegmentLabel(segmentLabel) : segmentLabel)
                        : (shouldCompactSegments ? getSummarySegmentLabel(segmentLabel) : segmentLabel)}
                    </span>
                  </span>
                  {!compact && !cardCompact && displayMode === 'full' && segment.sort_order && (
                    <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[8px] text-white/90">
                      {toPersianNumber(segment.sort_order)}
                    </span>
                  )}
                </div>
                {!readOnly && !isRuntimeStagePreview ? (
                  <span
                    className={`absolute top-1 flex gap-0.5 ${isMobileProcessViewport ? 'left-1 opacity-100' : 'left-4 opacity-0 transition-opacity group-hover:opacity-100'}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  >
                    <ProcessStageActionControls
                      mobile={isMobileProcessViewport}
                      inverse
                      copyTitle="کپی فعالیت"
                      moveTitle="جابجایی فعالیت"
                      deleteTitle="حذف فعالیت"
                      onCopy={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        handleCopyActualTask(segment);
                      }}
                      onMove={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openStageMoveModal(segment);
                      }}
                      onDelete={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openTaskLayerConfirm({
                          title: 'حذف کامل فعالیت',
                          content: 'این فعالیت به طور کامل حذف می‌شود. ادامه می‌دهید؟',
                          okText: 'حذف',
                          cancelText: 'انصراف',
                          okButtonProps: { danger: true },
                          onOk: async () => {
                            await handleDeleteTaskCompletely(segment);
                          },
                        });
                      }}
                    />
                  </span>
                ) : null}
              </button>
            );
          };

          const renderDraftSegment = (segment: any, index: number, summary = false) => {
            const draftPopoverKey = `${barKey}-draft-${segment.id}-${index}-${summary ? 'summary' : 'full'}`;
            const isRuntimeStagePreview = Boolean(segment?.isProcessRunStagePreview);
            return (
            <Popover
              key={draftPopoverKey}
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
                          type="primary"
                          size="small"
                          onClick={() => {
                            setOpenDraftSegmentPopoverKey(null);
                            openTaskModal(line.id, segment);
                          }}
                          className="kalam-btn-brand shadow-md ring-1 ring-[rgba(var(--brand-300-rgb),0.45)] hover:shadow-lg dark:ring-[rgba(var(--brand-400-rgb),0.45)]"
                        >
                          ایجاد فعالیت
                        </Button>
                      )}
                      {!isRuntimeStagePreview ? (
                        <>
                          <Button
                            size="small"
                            onClick={() => {
                              setOpenDraftSegmentPopoverKey(null);
                              openDraftStageModal(segment, 'automation');
                            }}
                          >
                            اتوماسیون
                          </Button>
                          <Button
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => {
                              setOpenDraftSegmentPopoverKey(null);
                              handleRemoveDraftStage(segment);
                            }}
                          >
                            حذف
                          </Button>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              }
              trigger="click"
              getPopupContainer={resolveOverlayPopupContainer}
              open={openDraftSegmentPopoverKey === draftPopoverKey}
              onOpenChange={(open) => setOpenDraftSegmentPopoverKey(open ? draftPopoverKey : null)}
              overlayStyle={{ zIndex: 10000, maxWidth: 'calc(100vw - 1rem)' }}
              title={null}
            >
              <div
                className={
                  summary
                    ? 'relative min-w-[0.7rem] flex-1 basis-0'
                    : `group relative ${useVerticalMainLayout
                      ? `w-full ${index !== 0 ? 'mt-1.5' : ''}`
                      : `min-w-0 ${isBarExpanded ? 'flex-none' : 'flex-1 basis-0'} ${index !== 0 ? (compact || cardCompact ? 'mr-px' : 'mr-0.5') : ''}`}`
                }
                style={{
                  zIndex: Math.max(1, 1000 - index),
                  minWidth: !summary && forceCompactProcessBar ? compactProcessStageMinWidth : undefined,
                  width: !summary && isBarExpanded ? getExpandedProcessSegmentWidth(segment.label) : undefined,
                }}
              >
                <button
                  type="button"
                  className={
                    summary
                      ? `relative w-full cursor-pointer rounded-full border border-dashed border-gray-300/90 bg-white/75 transition-all ${currentSegment && String(currentSegment?.id || '') === String(segment?.id || '') ? 'h-3.5 border-[rgba(var(--brand-400-rgb),0.95)] bg-[rgba(var(--brand-50-rgb),0.92)]' : 'h-2.5 hover:border-[rgba(var(--brand-400-rgb),0.8)]'} dark:border-gray-600 dark:bg-white/10`
                      : `relative flex h-full w-full min-w-0 cursor-pointer overflow-hidden bg-[rgba(var(--brand-50-rgb),0.92)] px-2 text-center transition-all group-hover:bg-[rgba(var(--brand-100-rgb),0.9)] dark:bg-[rgba(var(--brand-700-rgb),0.18)] dark:group-hover:bg-[rgba(var(--brand-700-rgb),0.28)] ${useVerticalMainLayout ? 'justify-start' : 'items-center justify-center'} ${displayMode === 'dense' ? 'py-2.5' : 'py-3'}`
                  }
                  style={{
                    ...getProcessStageShapeStyle(index, { summary }),
                    minWidth: !summary && forceCompactProcessBar ? compactProcessStageMinWidth : undefined,
                    minHeight: !summary && forceCompactProcessBar ? 44 : undefined,
                  }}
                >
                  {!summary && (
                    <span className={`block w-full min-w-0 font-medium text-gray-700 dark:text-gray-100 ${useVerticalMainLayout ? 'whitespace-normal break-words text-right leading-5' : (isBarExpanded ? 'whitespace-normal break-words leading-4' : 'truncate')} ${displayMode === 'dense' ? 'text-[10px]' : (compact || cardCompact ? 'text-[10px]' : 'text-[12px]')}`}>
                      {displayMode === 'dense'
                        ? (shouldShortenProcessSegmentLabel(segment.label, segments.length, displayMode, isBarExpanded) ? getDenseSegmentLabel(segment.label) : segment.label)
                        : (shouldCompactSegments ? getSummarySegmentLabel(segment.label) : segment.label)}
                    </span>
                  )}
                  {!summary && !readOnly ? (
                    <span
                      className={`absolute top-1 z-30 flex gap-0.5 ${isMobileProcessViewport ? 'left-1 opacity-100' : 'left-4 opacity-0 transition-opacity group-hover:opacity-100'}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      <ProcessStageActionControls
                        mobile={isMobileProcessViewport}
                        copyTitle="کپی مرحله"
                        moveTitle="جابجایی مرحله"
                        deleteTitle="حذف مرحله"
                        onCopy={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleDuplicateDraftStage(segment);
                        }}
                        onMove={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openStageMoveModal(segment);
                        }}
                        onDelete={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setOpenDraftSegmentPopoverKey(null);
                          void handleRemoveDraftStage(segment);
                        }}
                      />
                    </span>
                  ) : null}
                </button>
                {!summary ? renderDraftProcessStageOutline(index) : null}
              </div>
            </Popover>
          );
          };

          const renderSegment = (segment: any, index: number, summary = false) => {
            const content = segment.type === 'task'
              ? renderTaskSegment(segment, index, summary)
              : renderDraftSegment(segment, index, summary);
            if (!dragConfig || summary || readOnly || !recordId) return content;
            const nodeKey = getProcessStageNodeKey(segment, index);
            return (
              <ProcessStageDragSurface
                key={`${barKey}-drag-${nodeKey}`}
                id={`${dragConfig.scopeKey}:stage:${nodeKey}`}
                data={{
                  scopeKey: dragConfig.scopeKey,
                  laneKey: dragConfig.laneKey,
                  index,
                  stage: segment,
                }}
              >
                {({ ref, attributes, listeners, style: dragStyle, isOver }) => (
                  <div
                    ref={ref as React.Ref<HTMLDivElement>}
                    className={`${useVerticalMainLayout ? 'relative flex w-full items-stretch' : `relative flex min-w-0 ${isBarExpanded ? 'flex-none' : 'flex-1 basis-0'} items-stretch`} ${isOver ? 'brightness-95' : ''}`}
                    style={{
                      ...dragStyle,
                      minWidth: forceCompactProcessBar ? compactProcessStageMinWidth : undefined,
                      width: isBarExpanded ? getExpandedProcessSegmentWidth(segment?.title || segment?.name || segment?.label) : undefined,
                    }}
                  >
                    <ProcessStageDragHandleContext.Provider value={{ attributes, listeners }}>
                      {content}
                    </ProcessStageDragHandleContext.Provider>
                  </div>
                )}
              </ProcessStageDragSurface>
            );
          };

          const renderSegmentsWithDropZones = (items: any[]) => items.map((segment: any, index: number) => {
            const nodeKey = getProcessStageNodeKey(segment, index);
            if (!dragConfig || readOnly || !recordId) {
              return <React.Fragment key={`${barKey}-segment-${nodeKey}`}>{renderSegment(segment, index)}</React.Fragment>;
            }
            return (
              <React.Fragment key={`${barKey}-segment-${nodeKey}`}>
                <ProcessStageInsertionDropZone
                  id={`${dragConfig.scopeKey}:lane:${dragConfig.laneKey}:insert:${index}`}
                  scopeKey={dragConfig.scopeKey}
                  laneKey={dragConfig.laneKey}
                  index={index}
                  vertical={useVerticalMainLayout}
                />
                {renderSegment(segment, index)}
                {index === items.length - 1 ? (
                  <ProcessStageInsertionDropZone
                    id={`${dragConfig.scopeKey}:lane:${dragConfig.laneKey}:insert:${items.length}`}
                    scopeKey={dragConfig.scopeKey}
                    laneKey={dragConfig.laneKey}
                    index={items.length}
                    vertical={useVerticalMainLayout}
                  />
                ) : null}
              </React.Fragment>
            );
          });

          if (segments.length === 0) {
            return (
              <div className={`flex w-full items-center justify-center rounded-2xl border border-dashed border-gray-300/80 bg-gray-50/90 text-gray-400 dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-500 ${compact || cardCompact ? 'min-h-[2.5rem] text-[11px]' : 'min-h-[3rem] text-xs'}`}>
                {compact ? <span className="opacity-60">-</span> : (isProcessModule ? 'بدون مرحله فرآیند' : 'بدون مرحله تولید')}
              </div>
            );
          }

          if (displayMode === 'summary') {
            return (
              <div className="w-full">
                <div
                  className="flex min-h-[2.75rem] items-stretch gap-0.5 overflow-hidden rounded-2xl border border-gray-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(243,244,246,0.94))] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-gray-700 dark:bg-[linear-gradient(180deg,rgba(31,41,55,0.94),rgba(17,24,39,0.94))]"
                  title={`${currentStatusLabel} - ${currentSegmentLabel} (${toPersianNumber(`${Math.max(currentSegmentIndex + 1, 1)}/${segments.length}`)})`}
                >
                  {segments.map((segment: any, index: number) => renderSegment(segment, index, true))}
                </div>
              </div>
            );
          }

          return (
            <div className="w-full space-y-1.5">
              {displayMode === 'dense' && currentSegment ? (
                <div className="flex items-center justify-between gap-2 px-1 text-[10px] text-gray-500 dark:text-gray-400">
                  <span className="min-w-0 truncate">
                    {currentSegmentLabel}
                  </span>
                  <span className="shrink-0 rounded-full bg-[rgba(var(--brand-50-rgb),0.85)] px-2 py-0.5 font-semibold text-[rgba(var(--brand-700-rgb),1)] dark:bg-white/10 dark:text-gray-100">
                    {currentStatusLabel}
                  </span>
                </div>
              ) : null}
              <div className={`relative min-h-0 w-full rounded-2xl border border-gray-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(243,244,246,0.96))] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] dark:border-gray-700 dark:bg-[linear-gradient(180deg,rgba(31,41,55,0.94),rgba(17,24,39,0.94))] ${useVerticalMainLayout ? 'flex flex-col items-stretch' : 'flex items-stretch'} ${forceCompactProcessBar ? 'overflow-x-auto overflow-y-visible' : ''} ${displayMode === 'dense' ? 'min-h-[2.75rem]' : (compact || cardCompact ? 'min-h-[2.75rem]' : 'min-h-[3.25rem]')}`}>
                {renderSegmentsWithDropZones(displaySegments)}
                {hiddenCount > 0 && (
                  <div
                    className={`relative flex items-center justify-center rounded-xl bg-gray-200/90 px-2 text-gray-700 dark:bg-gray-700 dark:text-gray-100 ${useVerticalMainLayout ? `${displaySegments.length !== 0 ? 'mt-1.5' : ''} w-full py-2.5` : `${displaySegments.length !== 0 ? (compact || cardCompact ? 'mr-px' : 'mr-0.5') : ''}`} ${displayMode === 'dense' ? 'text-[10px]' : 'text-[11px]'} font-semibold`}
                    style={useVerticalMainLayout ? undefined : { flex: 0.8 }}
                    title={`${toPersianNumber(hiddenCount)} فعالیت دیگر`}
                  >
                    +{toPersianNumber(hiddenCount)}
                  </div>
                )}
              </div>
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
                {!tasksLoaded || !tasksLoadSucceeded ? (
                  <div
                    className={
                      (compact || cardCompact)
                        ? "rounded-lg border border-dashed border-gray-300/80 dark:border-gray-700 px-2 py-1.5 text-center text-[10px] leading-4 text-gray-400 dark:text-gray-500"
                        : "rounded-xl border border-dashed border-gray-300 dark:border-gray-700 px-3 py-4 text-center text-xs text-gray-400 dark:text-gray-500"
                    }
                  >
                    {!tasksLoaded ? 'در حال بارگذاری فرآیند...' : 'بارگذاری فرآیند کامل نشد؛ دوباره تلاش کنید.'}
                  </div>
                ) : showProcessEmptyState && !showEmptyProcessDetails ? (
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
                    {hasHiddenCompletedProcessGroups ? (
                      <div className="flex justify-center">
                        <Button
                          size="small"
                          type="text"
                          icon={<CheckOutlined className="text-emerald-600" />}
                          onClick={() => setShowCompletedProcessGroups(true)}
                          className="px-0 text-xs text-gray-500 hover:!text-emerald-700"
                        >
                          {getCompletedProcessesToggleLabel(hiddenCompletedGroupCount)}
                        </Button>
                      </div>
                    ) : null}
                    {visibleProcessLineGroups.map((group: any, groupIndex: number) => {
                      const showAutoAssignButton = canAutoAssignProcessGroup(group);
                      const isTemplateLocked = hasProcessGroupStarted(group);
                      const processOriginLabel = getProcessGroupOriginLabel(group);
                      const groupGraphMaterialized = materializeLegacyProcessGraph(group?.lineSegments || []);
                      const groupProcessLanes = getProcessStagesByLane(
                        groupGraphMaterialized.stages,
                        groupGraphMaterialized.graph,
                      );
                      const groupDragScopeKey = `runtime:${line.id}:${group.id}`;
                      return (
                      <div
                        key={`${line.id}-${group.id}-${groupIndex}`}
                        className={
                          cardCompact
                            ? 'space-y-2'
                            : 'space-y-3 rounded-2xl border border-[rgba(255,255,255,0.8)] bg-white/80 p-3 shadow-sm dark:border-gray-700 dark:bg-[#151515]'
                        }
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-xs font-bold text-gray-700 dark:text-gray-200">
                            {String(group?.label || group?.templateName || 'فرآیند').trim()}
                          </span>
                          {renderProcessRunInfo(group)}
                        </div>
                        {!readOnly && !!recordId && (
                          <div className="flex flex-wrap items-end gap-3">
                            <div className="min-w-[220px] flex-1 max-w-[360px]">
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-gray-400">الگوی فرآیند اجرا</span>
                                <AdaptiveSelectField
                                  {...adaptiveModalSelectProps}
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
                                loading={!!autoAssigningProcessIds[String(group?.id || '').trim() || 'all']}
                                disabled={!!autoAssigningProcessIds[String(group?.id || '').trim() || 'all']}
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
                                  openTaskLayerConfirm({
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
                        <div className="w-full space-y-2">
                          <DndContext
                            sensors={processDragSensors}
                            collisionDetection={closestCenter}
                            onDragEnd={(event) => {
                              void handleRuntimeStageDragEnd(
                                event,
                                groupGraphMaterialized.stages,
                                groupGraphMaterialized.graph,
                              ).catch((error) => {
                                message.error(toFaErrorMessage(error, 'جابجایی مرحله فرآیند ناموفق بود'));
                              });
                            }}
                          >
                          {groupProcessLanes.map((lane, laneIndex) => (
                            <div
                              key={`${group.id}-${lane.key}`}
                              className={`relative ${lane.parentTriggerKey ? 'border-r-2 border-amber-300 pr-2' : ''}`}
                            >
                              {(() => {
                                const runtimeLaneBarKey = `${groupDragScopeKey}:bar:${lane.key}`;
                                const isRuntimeLaneBarExpanded = expandedProcessBars.has(runtimeLaneBarKey);
                                return (
                                  <>
                              <div className="mb-1 flex items-center justify-between gap-2 px-1">
                                {!compact && !cardCompact && (lane.name || groupProcessLanes.length > 1) ? (
                                  <div className="min-w-0 truncate text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                                    {lane.name || `ردیف ${toPersianNumber(laneIndex + 1)}`}
                                  </div>
                                ) : <span />}
                                {renderProcessBarExpandToggle(runtimeLaneBarKey, isRuntimeLaneBarExpanded)}
                              </div>
                              <div className="flex w-full items-center gap-2">
                                <div className="flex shrink-0 flex-col gap-1">
                                  {groupGraphMaterialized.graph.triggers
                                    .filter((trigger) => trigger.targetLaneKeys.includes(lane.key))
                                    .map((trigger) => (
                                      <Tooltip key={trigger.key} title={trigger.name}>
                                        <Button
                                          size="small"
                                          shape="circle"
                                          icon={<ThunderboltOutlined />}
                                          disabled={!trigger.manualEnabled || !canManageProcessGraph}
                                          onClick={() => {
                                            void handleRunProcessTrigger(trigger, groupGraphMaterialized.stages).catch((error) => {
                                              if (isAbortLikeError(error)) return;
                                              message.error(toFaErrorMessage(error, 'اجرای فعال‌کننده ناموفق بود'));
                                            });
                                          }}
                                          className="border-amber-300 bg-amber-50 text-amber-700"
                                        />
                                      </Tooltip>
                                    ))}
                                </div>
                                <ProcessLaneDropZone
                                  id={`${groupDragScopeKey}:lane:${lane.key}:end`}
                                  scopeKey={groupDragScopeKey}
                                  laneKey={lane.key}
                                  index={lane.stages.length}
                                  disabled={readOnly || !recordId}
                                  className="min-w-0 flex-1"
                                >
                                  {renderSegmentsBar(
                                    lane.stages || [],
                                    `${line.id}-${group.id}-${lane.key}-${groupIndex}`,
                                    { scopeKey: groupDragScopeKey, laneKey: lane.key },
                                    { expanded: isRuntimeLaneBarExpanded },
                                  )}
                                </ProcessLaneDropZone>
                                {!readOnly && !!recordId && (
                                  <Tooltip title="افزودن مرحله جدید">
                                    <Button
                                      type="dashed"
                                      shape="circle"
                                      icon={<PlusOutlined />}
                                      size={compact ? 'small' : 'middle'}
                                      onClick={() => {
                                        setActiveDraftLaneKey(lane.key);
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
                                  </>
                                );
                              })()}
                            </div>
                          ))}
                          </DndContext>
                        </div>
                      </div>
                    )})}
                  </div>
                )}
                {tasksLoadSucceeded && !readOnly && !!recordId && !(showProcessEmptyState && !showEmptyProcessDetails) && (
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
                {hiddenCompletedGroupCount > 0 && !hasHiddenCompletedProcessGroups && (
                  <div className="flex justify-center">
                    <Button
                      size="small"
                      type="text"
                      icon={<CheckOutlined className="text-emerald-600" />}
                      onClick={() => setShowCompletedProcessGroups((prev) => !prev)}
                      className="px-0 text-xs text-gray-500 hover:!text-emerald-700"
                    >
                      {getCompletedProcessesToggleLabel(hiddenCompletedGroupCount, showCompletedProcessGroups)}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              (() => {
                const lineBarKey = `line:${line.id}:bar`;
                const isLineBarExpanded = expandedProcessBars.has(lineBarKey);
                return (
                  <div className="w-full space-y-1">
                    <div className="flex justify-end">
                      {renderProcessBarExpandToggle(lineBarKey, isLineBarExpanded)}
                    </div>
                    <div className="flex w-full items-center gap-2">
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
                      {renderSegmentsBar(lineSegments, String(line.id), undefined, { expanded: isLineBarExpanded })}
                    </div>
                  </div>
                );
              })()
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
        zIndex={15080}
        maskClosable={false}
        style={{ maxWidth: 'calc(100vw - 1rem)' }}
        styles={{
          body: { padding: 0, overflow: 'hidden' },
          content: { overflow: 'hidden' },
        }}
        modalRender={(node) => (
          <OverlayEventBoundary>
            <div ref={taskQuickModalBoundaryRef}>
              {node}
            </div>
          </OverlayEventBoundary>
        )}
      >
        {activeTaskQuickModalTask ? renderPopupContent(activeTaskQuickModalTask) : null}
      </Modal>

      <Modal
        title="افزودن خط تولید"
        rootClassName={isMobileProcessViewport ? 'process-stage-modal-root' : undefined}
        className={isMobileProcessViewport ? 'process-stage-modal' : undefined}
        open={isLineModalOpen && isProductionOrder}
        onCancel={() => setIsLineModalOpen(false)}
        footer={null}
        centered={!isMobileProcessViewport}
        destroyOnHidden
        width={isMobileProcessViewport ? '100vw' : 520}
        style={responsiveProcessModalStyle}
        styles={stageModalStyles}
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
        rootClassName={isMobileProcessViewport ? 'process-stage-modal-root' : undefined}
        className={isMobileProcessViewport ? 'process-stage-modal' : undefined}
        open={draftStageChooserOpen}
        onCancel={() => setDraftStageChooserOpen(false)}
        footer={null}
        width={isMobileProcessViewport ? '100vw' : 560}
        centered={!isMobileProcessViewport}
        destroyOnHidden
        style={responsiveProcessModalStyle}
        styles={stageModalStyles}
      >
        <div className="space-y-3 pt-2">
          <Button
            type="primary"
            className="w-full rounded-lg kalam-btn-brand"
            onClick={() => {
              setDraftStageChooserOpen(false);
              openDraftStageModal(null, 'stage');
            }}
          >
            ساخت مرحله الگوی فرآیند خام
          </Button>
          <div className="rounded-xl border border-[rgba(var(--brand-200-rgb),0.7)] bg-[rgba(var(--brand-50-rgb),0.55)] p-3">
            <div className="mb-2 text-sm font-medium text-[rgba(var(--brand-800-rgb),1)]">کپی از دیگر الگوهای فرآیند</div>
            <AdaptiveSelectField
              {...adaptiveModalSelectProps}
              value={draftSourceTemplateId || undefined}
              placeholder="انتخاب الگوی فرآیند"
              loading={draftSourceTemplateLoading}
              options={draftSourceTemplateOptions}
              className="w-full"
              onChange={(value) => { void handleDraftSourceTemplateChange(String(value || '')); }}
            />
            {draftSourceTemplateStages.length > 0 ? (
              <Button
                block
                className="mt-3"
                icon={<CopyOutlined />}
                onClick={() => {
                  void handleCopyFullDraftTemplate().catch((error) => {
                    message.error(toFaErrorMessage(error, 'کپی کامل الگوی فرآیند ناموفق بود'));
                  });
                }}
              >
                کپی کامل الگو با همه ردیف‌ها و فعال‌کننده‌ها
              </Button>
            ) : null}
            <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-[rgba(var(--brand-200-rgb),0.7)] bg-white/90 p-2 dark:border-[rgba(var(--brand-300-rgb),0.2)] dark:bg-white/5">
              {draftSourceTemplateStagesLoading ? (
                <div className="flex items-center justify-center py-4 text-xs text-gray-500">در حال بارگذاری مراحل...</div>
              ) : draftSourceTemplateStages.length === 0 ? (
                <div className="py-4 text-center text-xs text-gray-500">مرحله‌ای برای نمایش وجود ندارد</div>
              ) : (
                <div className="space-y-3">
                  {draftSourceProcessLanes.map((lane, laneIndex) => (
                    <div
                      key={lane.key}
                      className="rounded-md border border-[rgba(var(--brand-200-rgb),0.8)] p-2 dark:border-[rgba(var(--brand-300-rgb),0.2)]"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-semibold text-gray-600 dark:text-gray-300">
                          {lane.name || `ردیف ${toPersianNumber(laneIndex + 1)}`}
                        </span>
                        <Button
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => {
                            void handleCopyDraftLaneFromTemplate(lane.key).catch((error) => {
                              message.error(toFaErrorMessage(error, 'کپی ردیف فرآیند ناموفق بود'));
                            });
                          }}
                        >
                          کپی ردیف کامل
                        </Button>
                      </div>
                      <div className="space-y-1">
                        {lane.stages.map((stage: any, index: number) => {
                          const stageName = String(stage?.stage_name || `مرحله ${index + 1}`).trim() || `مرحله ${index + 1}`;
                          return (
                            <button
                              key={`${String(stage?.id || 'stage')}-${index}`}
                              type="button"
                              className="flex w-full items-center justify-between rounded border border-gray-200 bg-white px-3 py-2 text-right transition-colors hover:border-[rgba(var(--brand-500-rgb),0.6)] hover:bg-[rgba(var(--brand-50-rgb),0.75)] dark:border-gray-700 dark:bg-white/5"
                              onClick={() => handleCopyDraftStageFromTemplate(stage)}
                            >
                              <span className="truncate text-sm text-[rgba(var(--brand-900-rgb),1)] dark:text-[rgba(var(--brand-50-rgb),0.95)]">{stageName}</span>
                              <span className="text-xs text-[rgba(var(--brand-700-rgb),1)]">کپی و ویرایش</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        title="جابجایی مرحله فرآیند"
        open={!!stageMoveTarget}
        onCancel={() => setStageMoveTarget(null)}
        onOk={() => { void handleMoveStage().catch((error) => {
          message.error(toFaErrorMessage(error, 'جابجایی مرحله ناموفق بود'));
        }); }}
        okText="جابجایی"
        cancelText="انصراف"
        zIndex={10020}
        destroyOnHidden
      >
        <Form form={stageMoveForm} layout="vertical">
          <Alert
            type="warning"
            showIcon
            className="mb-3"
            message="جابجایی فعالیت واقعی، ترتیب آینده فرآیند را تغییر می‌دهد و اتوماسیون‌های گذشته دوباره اجرا نمی‌شوند."
          />
          <Form.Item name="lane_key" label="ردیف مقصد" rules={[{ required: true, message: 'ردیف مقصد را انتخاب کنید.' }]}>
            <AdaptiveSelectField
              {...adaptiveModalSelectProps}
              options={(() => {
                const recurrence = parseRecurrenceInfo(stageMoveTarget?.recurrence_info);
                const targetGraph = normalizeProcessGraph(
                  recurrence?.[PROCESS_GRAPH_METADATA_KEY]
                    || stageMoveTarget?.metadata?.[PROCESS_GRAPH_METADATA_KEY]
                    || draftGraphSnapshot.graph,
                  draftGraphSnapshot.stages,
                );
                return targetGraph.lanes.map((lane, index) => ({
                  value: lane.key,
                  label: lane.name || `ردیف ${toPersianNumber(index + 1)}`,
                }));
              })()}
            />
          </Form.Item>
          <Form.Item name="sort_order" label="ترتیب در ردیف" rules={[{ required: true, message: 'ترتیب را وارد کنید.' }]}>
            <InputNumber min={1} className="w-full" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="فعال‌کننده فرآیند"
        open={!!processTriggerEditor}
        onCancel={() => setProcessTriggerEditor(null)}
        onOk={() => { void handleSaveProcessTrigger().catch((error) => {
          message.error(toFaErrorMessage(error, 'ذخیره فعال‌کننده ناموفق بود'));
        }); }}
        okText="ذخیره"
        cancelText="انصراف"
        width={900}
        zIndex={10020}
        destroyOnHidden
        loading={processActivatorWorkflowLoading}
      >
        <Form form={processTriggerForm} layout="vertical">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Form.Item name="name" label="نام فعال‌کننده" rules={[{ required: true, message: 'نام فعال‌کننده را وارد کنید.' }]}>
              <Input placeholder="مثلا: آغاز کنترل کیفیت" />
            </Form.Item>
            <Form.Item name="workflow_is_active" label="اجرای خودکار" valuePropName="checked">
              <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
            </Form.Item>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Form.Item name="source_node_key" label="مرحله مبدا فعال‌سازی" rules={[{ required: true, message: 'مبدا فعال‌کننده را انتخاب کنید.' }]}>
              <AdaptiveSelectField
                {...adaptiveModalSelectProps}
                options={[
                  { value: '__process_start__', label: 'شروع فرآیند' },
                  ...draftProcessLanes.flatMap((lane, laneIndex) => (
                    lane.stages.map((stage: any, stageIndex: number) => ({
                      value: getProcessStageNodeKey(stage, stageIndex),
                      label: `${lane.name || `ردیف ${toPersianNumber(laneIndex + 1)}`} - ${stage.name || stage.stage_name || `مرحله ${toPersianNumber(stageIndex + 1)}`}`,
                    }))
                  )),
                ]}
                placeholder="انتخاب مرحله یا شروع فرآیند"
              />
            </Form.Item>
            <Form.Item name="manual_enabled" label="اجرای دستی" valuePropName="checked">
              <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
            </Form.Item>
          </div>
          <Form.Item name="target_lane_keys" label="ردیف‌های مقصد" rules={[{ required: true, message: 'حداقل یک ردیف مقصد انتخاب کنید.' }]}>
            <AdaptiveSelectField
              {...adaptiveModalSelectProps}
              mode="multiple"
              options={draftGraphSnapshot.graph.lanes.map((lane, index) => ({
                value: lane.key,
                label: lane.name || `ردیف ${toPersianNumber(index + 1)}`,
                disabled: !!lane.parentTriggerKey
                  && lane.parentTriggerKey !== processTriggerEditor?.trigger.key,
              }))}
              placeholder="انتخاب یک یا چند ردیف"
            />
          </Form.Item>
          <Form.Item name="workflow_description" label="توضیحات">
            <Input.TextArea rows={2} />
          </Form.Item>
          {watchedProcessActivatorIsActive !== false ? (
            <Form.Item name="workflow_process_execution_action" label="نوع اجرای خودکار">
              <Radio.Group
                options={[
                  { label: 'کپی کردن الگوی فرآیند', value: 'copy_process_template' },
                  { label: 'اجرای فرآیند و ارجاع خودکار مراحل', value: 'execute_process' },
                ]}
                optionType="button"
                buttonStyle="solid"
              />
            </Form.Item>
          ) : null}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Form.Item name="workflow_trigger_type" label="نوع اجرای خودکار">
              <Radio.Group options={triggerTypeOptions} optionType="button" buttonStyle="solid" />
            </Form.Item>
            <Form.Item name="workflow_execution_mode" label="تکرار اجرا">
              <Radio.Group options={workflowExecutionModeOptions} />
            </Form.Item>
          </div>
          {shouldShowProcessActivatorModulePicker ? (
            <Form.Item
              name="workflow_trigger_module_ids"
              label={watchedProcessActivatorTriggerType === 'on_create'
                ? 'ایجاد رکورد جدید در ماژول‌های'
                : 'ایجاد/به‌روزرسانی رکورد در ماژول‌های'}
              rules={[{ required: true, message: 'حداقل یک ماژول را انتخاب کنید.' }]}
            >
              <AdaptiveSelectField
                {...adaptiveModalSelectProps}
                mode="multiple"
                options={processActivatorTargetModuleOptions}
                placeholder="انتخاب از ماژول‌های هدف"
                pickerTitle="ماژول‌های محرک"
              />
            </Form.Item>
          ) : null}
          {watchedProcessActivatorTriggerType === 'interval' ? (
            <WorkflowIntervalScheduleFields
              form={processTriggerForm}
              fieldNames={PROCESS_ACTIVATOR_INTERVAL_FIELD_NAMES}
              overlayZIndexBase={10060}
              popupContainer={resolveOverlayPopupContainer}
            />
          ) : null}
          <Alert
            type="info"
            showIcon
            message="همه تنظیمات دستی، خودکار، شرط‌ها و زمان‌بندی این فعال‌کننده با همین ذخیره اعمال می‌شود."
          />
          {!recordId ? (
            <div className="mt-2 text-xs text-gray-500">
              برای ذخیره اجرای خودکار، ابتدا رکورد الگوی فرآیند را ذخیره کنید. تنظیمات دستی فعال‌کننده در همین فرم باقی می‌ماند.
            </div>
          ) : null}
          <div className="mt-4 space-y-4 border-t border-gray-200 pt-4 dark:border-gray-700">
            <div>
              <div className="mb-2 text-sm font-semibold">همه شرط‌ها</div>
              <WorkflowConditionsGroup
                value={processActivatorConditionsAll}
                onChange={(next) => setProcessActivatorConditionsAll(next as WorkflowCondition[])}
                fields={automationConditionFields}
                dynamicOptions={automationDynamicOptions}
                relationOptions={automationRelationOptions}
                overlayZIndexBase={10060}
              />
            </div>
            <div>
              <div className="mb-2 text-sm font-semibold">یا یکی از شرط‌ها</div>
              <WorkflowConditionsGroup
                value={processActivatorConditionsAny}
                onChange={(next) => setProcessActivatorConditionsAny(next as WorkflowCondition[])}
                fields={automationConditionFields}
                dynamicOptions={automationDynamicOptions}
                relationOptions={automationRelationOptions}
                overlayZIndexBase={10060}
              />
            </div>
          </div>
          {processTriggerEditor && draftGraphSnapshot.graph.triggers.some(
            (trigger) => trigger.key === processTriggerEditor.trigger.key,
          ) ? (
            <div className="mt-4 grid grid-cols-1 gap-2 border-t border-gray-200 pt-4 sm:grid-cols-2 dark:border-gray-700">
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={() => {
                  Modal.confirm({
                    title: 'حذف فعال‌کننده و مستقل‌کردن ردیف‌ها',
                    content: 'ردیف‌های متصل باقی می‌مانند و به ردیف‌های مستقل این فرآیند تبدیل می‌شوند.',
                    okText: 'حذف و مستقل‌کردن',
                    cancelText: 'انصراف',
                    okButtonProps: { danger: true },
                    zIndex: 10200,
                    onOk: () => handleDeleteProcessTrigger(false),
                  });
                }}
              >
                حذف و مستقل‌کردن ردیف‌ها
              </Button>
              <Button
                danger
                type="primary"
                icon={<DeleteOutlined />}
                onClick={() => {
                  Modal.confirm({
                    title: 'حذف فعال‌کننده و ردیف‌های زیرمجموعه',
                    content: 'همه مراحل ردیف‌های متصل و شاخه‌های زیرمجموعه آن‌ها حذف می‌شوند. این عملیات قابل بازگشت نیست.',
                    okText: 'حذف همه',
                    cancelText: 'انصراف',
                    okButtonProps: { danger: true },
                    zIndex: 10200,
                    onOk: () => handleDeleteProcessTrigger(true),
                  });
                }}
              >
                حذف همراه ردیف‌ها
              </Button>
            </div>
          ) : null}
        </Form>
      </Modal>

      <Modal
        rootClassName={isMobileProcessViewport ? 'process-stage-modal-root task-create-modal-root' : 'task-create-modal-root'}
        className={`task-create-modal ${isMobileProcessViewport ? 'process-stage-modal' : ''}`.trim()}
        title={<div className="flex items-center gap-2 text-[rgba(var(--brand-800-rgb),1)]"><div className="rounded bg-[rgba(var(--brand-50-rgb),1)] p-1 text-[rgba(var(--brand-600-rgb),1)]"><PlusOutlined /></div> {isProcessModule ? 'افزودن مرحله فرآیند (فعالیت)' : 'افزودن مرحله تولید'}</div>}
        open={isTaskModalOpen}
        onCancel={closeTaskModal}
        footer={null}
        zIndex={10001}
        width={isMobileProcessViewport ? '100vw' : 560}
        centered={!isMobileProcessViewport}
        destroyOnHidden
        style={responsiveProcessModalStyle}
        styles={stageModalStyles}
        modalRender={(node) => (
          <div
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
          >
            {node}
          </div>
        )}
      >
        <Form form={taskForm} onFinish={handleAddTask} layout="vertical" className="pt-1 [&_.ant-form-item]:mb-3">
          <div className="overflow-y-auto pr-1" style={{ maxHeight: responsiveProcessBodyMaxHeight }}>
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
                  getPopupContainer={resolveOverlayPopupContainer}
                />
              </Form.Item>
            </div>

            <div className="col-span-12">
              <Form.Item name="assignee_combo" label="مسئول انجام">
                <AdaptiveSelectField
                  {...adaptiveModalSelectProps}
                  placeholder="انتخاب کنید..."
                  options={assigneeComboOptions}
                />
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
                      <div className="mb-1 flex flex-wrap items-center gap-1 text-xs text-gray-500">
                        <span>{getFieldLabelFa(field)}</span>
                        {field.validation?.required ? <Tag color="error" className="!m-0">الزامی</Tag> : null}
                      </div>
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
                <div className="col-span-4">
                  <Form.Item name="duration_value" label="مقدار">
                    <InputNumber className="w-full" min={0} />
                  </Form.Item>
                </div>
                <div className="col-span-3">
                  <Form.Item name="duration_unit" label="واحد">
                    <AdaptiveSelectField
                      {...adaptiveModalSelectProps}
                      options={processScheduleUnitOptions}
                    />
                  </Form.Item>
                </div>
                <div className="col-span-5">
                  <Form.Item name="duration_from" label="بعد از">
                    <AdaptiveSelectField
                      {...adaptiveModalSelectProps}
                      options={processSystemScheduleAnchorOptions}
                    />
                  </Form.Item>
                </div>
                {requiresSystemScheduleStageAnchor(watchedTaskDurationFrom) ? (
                  <div className="col-span-12">
                    <Form.Item
                      name="due_anchor_stage_node_key"
                      label="مرحله مبنا"
                      rules={[{ required: true, message: 'مرحله مبنا را انتخاب کنید.' }]}
                    >
                      <AdaptiveSelectField
                        {...adaptiveModalSelectProps}
                        options={processStageNodeOptions}
                        placeholder="انتخاب مرحله خاص"
                      />
                    </Form.Item>
                  </div>
                ) : null}
              </>
            )}

            <div className="col-span-12">
              <Form.Item name="due_date" label="موعد انجام (دستی)">
                <PersianDatePicker
                  type="DATETIME"
                  placeholder="تاریخ و ساعت (اختیاری)"
                  className="w-full"
                  zIndex={10060}
                  modalContainer={resolveOverlayPopupContainer}
                />
              </Form.Item>
            </div>
          </div>
          </div>

          <div className="flex justify-end gap-2 mt-4 border-t pt-4">
            <Button onClick={() => {
              closeTaskModal();
            }} className="rounded-lg">انصراف</Button>
            <Button type="primary" htmlType="submit" loading={isSubmittingTaskModal} className="rounded-lg shadow-md kalam-btn-brand">
              {isProcessModule ? 'ثبت فعالیت' : 'ثبت مرحله'}
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title={<div className="flex items-center gap-2 text-[rgba(var(--brand-800-rgb),1)]"><div className="rounded bg-[rgba(var(--brand-50-rgb),1)] p-1 text-[rgba(var(--brand-600-rgb),1)]"><PlusOutlined /></div> {editingDraft ? 'ویرایش مرحله پیش‌نویس' : (isProcessModule ? 'افزودن مرحله پیش‌نویس فرآیند' : 'افزودن مرحله پیش‌نویس')}</div>}
        rootClassName={isMobileProcessViewport ? 'process-stage-modal-root' : undefined}
        className={isMobileProcessViewport ? 'process-stage-modal' : undefined}
        open={isDraftModalOpen}
        onCancel={closeDraftStageModal}
        footer={null}
        zIndex={10001}
        width={isMobileProcessViewport ? '100vw' : 1040}
        centered={!isMobileProcessViewport}
        destroyOnHidden
        style={responsiveProcessModalStyle}
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
                              getPopupContainer={resolveOverlayPopupContainer}
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
                          <Form.Item
                            name="default_assignee_combo"
                            label="مسئول انجام پیش‌فرض"
                            rules={[{ required: true, message: 'مسئول انجام پیش‌فرض را انتخاب کنید.' }]}
                          >
                            <AdaptiveSelectField
                              {...adaptiveModalSelectProps}
                              placeholder="انتخاب کنید..."
                              options={defaultAssigneeComboOptions}
                            />
                          </Form.Item>
                        </div>
                        <div className="col-span-12 grid grid-cols-1 gap-3 lg:grid-cols-2">
                          <div className="rounded-xl border border-[rgba(var(--brand-200-rgb),0.55)] bg-[rgba(var(--brand-50-rgb),0.35)] p-3 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5">
                            <div className="mb-3 text-xs font-bold text-gray-600 dark:text-gray-300">زمان شروع سیستمی</div>
                            <div className="grid grid-cols-12 gap-2">
                              <div className="col-span-6">
                                <Form.Item name="start_duration_value" label="مقدار">
                                  <InputNumber className="w-full" min={0} />
                                </Form.Item>
                              </div>
                              <div className="col-span-6">
                                <Form.Item name="start_duration_unit" label="واحد">
                                  <AdaptiveSelectField
                                    {...adaptiveModalSelectProps}
                                    options={processScheduleUnitOptions}
                                  />
                                </Form.Item>
                              </div>
                              <div className="col-span-12">
                                <Form.Item name="start_duration_from" label="بعد از">
                                  <AdaptiveSelectField
                                    {...adaptiveModalSelectProps}
                                    options={processSystemScheduleAnchorOptions}
                                  />
                                </Form.Item>
                              </div>
                              {requiresSystemScheduleStageAnchor(watchedDraftStartDurationFrom) ? (
                                <div className="col-span-12">
                                  <Form.Item
                                    name="start_anchor_stage_node_key"
                                    label="مرحله مبنا"
                                    rules={[{ required: true, message: 'مرحله مبنا را انتخاب کنید.' }]}
                                  >
                                    <AdaptiveSelectField
                                      {...adaptiveModalSelectProps}
                                      options={processStageNodeOptions.filter(
                                        (option) => option.value !== String(editingDraft?.[PROCESS_NODE_KEY] || ''),
                                      )}
                                      placeholder="انتخاب مرحله خاص"
                                    />
                                  </Form.Item>
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <div className="rounded-xl border border-[rgba(var(--brand-200-rgb),0.55)] bg-[rgba(var(--brand-50-rgb),0.35)] p-3 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5">
                            <div className="mb-3 text-xs font-bold text-gray-600 dark:text-gray-300">مهلت انجام سیستمی</div>
                            <div className="grid grid-cols-12 gap-2">
                              <div className="col-span-6">
                                <Form.Item name="duration_value" label="مقدار">
                                  <InputNumber className="w-full" min={0} />
                                </Form.Item>
                              </div>
                              <div className="col-span-6">
                                <Form.Item name="duration_unit" label="واحد">
                                  <AdaptiveSelectField
                                    {...adaptiveModalSelectProps}
                                    options={processScheduleUnitOptions}
                                  />
                                </Form.Item>
                              </div>
                              <div className="col-span-12">
                                <Form.Item name="duration_from" label="بعد از">
                                  <AdaptiveSelectField
                                    {...adaptiveModalSelectProps}
                                    options={processSystemScheduleAnchorOptions}
                                  />
                                </Form.Item>
                              </div>
                              {requiresSystemScheduleStageAnchor(watchedDraftDurationFrom) ? (
                                <div className="col-span-12">
                                  <Form.Item
                                    name="due_anchor_stage_node_key"
                                    label="مرحله مبنا"
                                    rules={[{ required: true, message: 'مرحله مبنا را انتخاب کنید.' }]}
                                  >
                                    <AdaptiveSelectField
                                      {...adaptiveModalSelectProps}
                                      options={processStageNodeOptions.filter(
                                        (option) => option.value !== String(editingDraft?.[PROCESS_NODE_KEY] || ''),
                                      )}
                                      placeholder="انتخاب مرحله خاص"
                                    />
                                  </Form.Item>
                                </div>
                              ) : null}
                            </div>
                          </div>
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
                                    <Tag color={String(option.color || 'default')}>
                                      <span className="inline-flex items-center gap-1">
                                        <TaskStatusIcon iconKey={String((option as any).icon || 'circle')} />
                                        <span>{option.label}</span>
                                      </span>
                                    </Tag>
                                    <Tag color={isCustom ? 'processing' : 'default'}>
                                      {isCustom ? 'سفارشی' : 'سیستمی'}
                                    </Tag>
                                    {option.disabled === true ? (
                                      <Tag color="default">غیرفعال</Tag>
                                    ) : null}
                                  </div>
                                  <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
                                    <Input
                                      size="small"
                                      value={String(option.label || '')}
                                      placeholder="نام فارسی وضعیت"
                                      className="!w-44 !rounded-lg"
                                      onKeyDown={(event) => event.stopPropagation()}
                                      onChange={(event) => upsertDraftStageStatusOption(option, { label: event.target.value })}
                                    />
                                    <Switch
                                      size="small"
                                      checked={option.disabled !== true}
                                      checkedChildren="فعال"
                                      unCheckedChildren="خاموش"
                                      onChange={(checked) => upsertDraftStageStatusOption(option, { disabled: !checked })}
                                    />
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
                                    ) : null}
                                  </div>
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
                              {fields.map((field, statusIndex) => {
                                const { key, ...listField } = field;
                                return (
                                <div
                                  key={key}
                                  className="grid grid-cols-12 gap-3 rounded-xl border border-[rgba(var(--brand-200-rgb),0.55)] bg-[rgba(var(--brand-50-rgb),0.36)] p-3 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5"
                                >
                                  <div className="col-span-12 md:col-span-3">
                                    <Form.Item
                                      {...listField}
                                      label="عنوان فارسی"
                                      name={[field.name, 'label']}
                                      rules={[{ required: true, message: 'عنوان فارسی را وارد کنید' }]}
                                      className="mb-0"
                                    >
                                      <Input
                                        placeholder="مثلا: منتظر تایید مدیر"
                                        autoComplete="off"
                                        onKeyDown={(event) => event.stopPropagation()}
                                        onChange={(event) => {
                                          const currentValue = String(
                                            draftForm.getFieldValue(['stage_status_options_editor', field.name, 'value']) || ''
                                          ).trim();
                                          if (!currentValue) {
                                            draftForm.setFieldValue(
                                              ['stage_status_options_editor', field.name, 'value'],
                                              normalizeProcessTaskOptionKey(
                                                event.target.value,
                                                buildDefaultProcessTaskOptionValue('custom_status', statusIndex)
                                              )
                                            );
                                          }
                                        }}
                                      />
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
                                      <Input
                                        placeholder="manager_pending"
                                        dir="ltr"
                                        autoComplete="off"
                                        onKeyDown={(event) => event.stopPropagation()}
                                        onBlur={(event) => {
                                          const normalized = normalizeProcessTaskOptionKey(
                                            event.target.value,
                                            buildDefaultProcessTaskOptionValue('custom_status', statusIndex)
                                          );
                                          draftForm.setFieldValue(['stage_status_options_editor', field.name, 'value'], normalized);
                                        }}
                                      />
                                    </Form.Item>
                                  </div>
                                  <div className="col-span-6 md:col-span-2">
                                    <Form.Item
                                      {...listField}
                                      label="رنگ"
                                      name={[field.name, 'color']}
                                      initialValue="default"
                                      rules={[{ required: true, message: 'رنگ را انتخاب کنید' }]}
                                      className="mb-0"
                                    >
                                      <AdaptiveSelectField
                                        {...adaptiveModalSelectProps}
                                        options={PROCESS_TASK_STATUS_COLOR_OPTIONS}
                                        placeholder="رنگ"
                                      />
                                    </Form.Item>
                                  </div>
                                  <div className="col-span-6 md:col-span-2">
                                    <Form.Item
                                      {...listField}
                                      label="آیکون"
                                      name={[field.name, 'icon']}
                                      initialValue="circle"
                                      className="mb-0"
                                    >
                                      <AdaptiveSelectField
                                        {...adaptiveModalSelectProps}
                                        options={PROCESS_TASK_STATUS_ICON_OPTIONS}
                                        placeholder="آیکون"
                                        optionRender={(option: any) => {
                                          const rawValue = String(option?.value ?? option?.data?.value ?? '').trim();
                                          const label = PROCESS_TASK_STATUS_ICON_OPTIONS.find((item) => item.value === rawValue)?.label
                                            || String(option?.label ?? option?.data?.label ?? rawValue);
                                          return (
                                            <span className="inline-flex items-center gap-2">
                                              <TaskStatusIcon iconKey={rawValue} />
                                              <span>{label}</span>
                                            </span>
                                          );
                                        }}
                                        renderMobileOption={(option: any) => (
                                          <span className="inline-flex items-center gap-2">
                                            <TaskStatusIcon iconKey={String(option?.value || 'circle')} />
                                            <span>{option?.label}</span>
                                          </span>
                                        )}
                                      />
                                    </Form.Item>
                                  </div>
                                  <div className="col-span-2 md:col-span-1 flex items-end justify-end">
                                    <Button htmlType="button" type="text" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                                  </div>
                                  <Form.Item {...listField} name={[field.name, 'insertAfter']} hidden>
                                    <Input />
                                  </Form.Item>
                                  <Form.Item {...listField} name={[field.name, 'disabled']} hidden>
                                    <Input />
                                  </Form.Item>
                                </div>
                              )})}
                              <Button
                                type="dashed"
                                htmlType="button"
                                icon={<PlusOutlined />}
                                onClick={() => add({
                                  value: buildDefaultProcessTaskOptionValue('custom_status', fields.length),
                                  color: 'default',
                                  icon: 'circle',
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
                        {draftCustomFields.map((field, index) => (
                            <div
                              key={field.key}
                              className="rounded-2xl border border-[rgba(var(--brand-200-rgb),0.7)] bg-white/95 p-4 shadow-sm dark:border-[rgba(var(--brand-300-rgb),0.22)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.7)]"
                            >
                              <div className="space-y-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                                        {getFieldLabelFa(field)}
                                      </div>
                                      <Tag color="default">{processTaskCustomFieldTypeLabels[field.type] || field.type}</Tag>
                                      {field.validation?.required ? <Tag color="error">اجباری در تکمیل</Tag> : null}
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
                                    <Tooltip title="جابجایی به بالا">
                                      <Button
                                        size="small"
                                        htmlType="button"
                                        icon={<UpOutlined />}
                                        disabled={index === 0}
                                        onClick={() => moveDraftCustomField(String(field.key), 'up')}
                                      />
                                    </Tooltip>
                                    <Tooltip title="جابجایی به پایین">
                                      <Button
                                        size="small"
                                        htmlType="button"
                                        icon={<DownOutlined />}
                                        disabled={index === draftCustomFields.length - 1}
                                        onClick={() => moveDraftCustomField(String(field.key), 'down')}
                                      />
                                    </Tooltip>
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

                    {draftAutomationRules.length > 0 ? (
                      <div className="flex items-center justify-end">
                        <Segmented
                          size="small"
                          value={automationViewMode}
                          onChange={(value) => {
                            const nextMode = value as WorkflowEditorViewMode;
                            setAutomationViewMode(nextMode);
                            persistWorkflowViewMode(nextMode);
                          }}
                          options={[
                            { label: 'فرم', value: 'form', icon: <UnorderedListOutlined /> },
                            { label: 'دیاگرام', value: 'diagram', icon: <ApartmentOutlined /> },
                          ]}
                        />
                      </div>
                    ) : null}

                    {draftAutomationRules.map((rule, index) => {
                      const ruleActions = Array.isArray(rule.actions) ? rule.actions : [];
                      const editableAllConditions = filterEditableAutomationConditions(rule.conditions_all);
                      const editableAnyConditions = filterEditableAutomationConditions(rule.conditions_any);
                      const ruleId = String(rule?.id || '');
                      const isExpanded = expandedDraftAutomationRuleIds.includes(ruleId);
                      const isFirstRule = index === 0;
                      const isLastRule = index === draftAutomationRules.length - 1;
                      const ruleName = String(rule?.name || '').trim() || 'اتوماسیون بدون نام';
                      const headerPalette = DRAFT_AUTOMATION_HEADER_PALETTE[index % DRAFT_AUTOMATION_HEADER_PALETTE.length];
                      return (
                      <div
                        key={rule.id}
                        className="rounded-2xl border border-[rgba(var(--brand-200-rgb),0.7)] bg-white/95 p-4 shadow-sm dark:border-[rgba(var(--brand-300-rgb),0.22)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.7)]"
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          className="mb-4 flex cursor-pointer items-start justify-between gap-3 rounded-2xl border px-4 py-3 transition hover:shadow-sm"
                          style={{
                            background: headerPalette.background,
                            borderColor: headerPalette.borderColor,
                          }}
                          onClick={() => {
                            if (automationViewMode === 'diagram') {
                              setDiagramAutomationRuleId(ruleId);
                              return;
                            }
                            toggleDraftAutomationRuleExpanded(ruleId);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              if (automationViewMode === 'diagram') {
                                setDiagramAutomationRuleId(ruleId);
                                return;
                              }
                              toggleDraftAutomationRuleExpanded(ruleId);
                            }
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: headerPalette.accentColor }}
                              />
                              <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{ruleName}</div>
                              <Tag color={rule.is_active !== false ? 'green' : 'default'} className="m-0">
                                {rule.is_active !== false ? 'فعال' : 'غیرفعال'}
                              </Tag>
                            </div>
                            <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">{getProcessAutomationRuleSummary(rule)}</div>
                          </div>
                          <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                            <Tooltip title="انتقال به بالا">
                              <Button
                                type="text"
                                htmlType="button"
                                icon={<UpOutlined />}
                                disabled={isFirstRule}
                                onClick={() => moveDraftAutomationRule(ruleId, 'up')}
                              />
                            </Tooltip>
                            <Tooltip title="انتقال به پایین">
                              <Button
                                type="text"
                                htmlType="button"
                                icon={<DownOutlined />}
                                disabled={isLastRule}
                                onClick={() => moveDraftAutomationRule(ruleId, 'down')}
                              />
                            </Tooltip>
                            <Tooltip title="نمای دیاگرام">
                              <Button
                                type="text"
                                htmlType="button"
                                icon={<ApartmentOutlined />}
                                onClick={() => setDiagramAutomationRuleId(ruleId)}
                              />
                            </Tooltip>
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
                            <Button
                              type="text"
                              htmlType="button"
                              icon={isExpanded ? <UpOutlined /> : <DownOutlined />}
                              onClick={() => toggleDraftAutomationRuleExpanded(ruleId)}
                            />
                          </div>
                        </div>

                        {isExpanded ? (
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
                                    <AdaptiveSelectField
                                      {...adaptiveModalSelectProps}
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
                                <React.Suspense fallback={<Spin size="small" />}>
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
                                    overlayZIndexBase={16040}
                                    popupContainer={resolveOverlayPopupContainer}
                                  />
                                </React.Suspense>
                              </div>
                              <div>
                                <div className="mb-2 text-xs text-gray-500">یا یکی از شرط‌ها</div>
                                <React.Suspense fallback={<Spin size="small" />}>
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
                                    overlayZIndexBase={16040}
                                    popupContainer={resolveOverlayPopupContainer}
                                  />
                                </React.Suspense>
                              </div>
                            </div>
                          </div>

                            <div className="rounded-2xl border border-[rgba(var(--brand-200-rgb),0.55)] bg-[rgba(var(--brand-50-rgb),0.42)] p-4 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5">
                              <div className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">اقدام‌ها</div>
                              <div className="grid grid-cols-12 gap-3">
                                <div className="col-span-12">
                                  <React.Suspense fallback={<Spin size="small" />}>
                                    <WorkflowActionsBuilder
                                      value={ruleActions}
                                      onChange={(next) => updateDraftAutomationRule(rule.id, {
                                        actions: next,
                                        note_text: extractRuleNoteTextFromActions(next),
                                      })}
                                      currentModuleId={automationScopeModuleId || 'tasks'}
                                      currentModuleFields={automationActionModuleFields}
                                      variableFields={automationActionVariableFields}
                                      nextStageFields={nextStageTransferFields}
                                      enableNextStageActions
                                      processStageOptions={processStageNodeOptions}
                                      activationStageOptions={activationStageNodeOptions}
                                      moduleOptions={workflowModuleOptions}
                                      relationSourceModuleOptions={automationScopeModuleIds.map((scopeModuleId) => ({
                                        value: scopeModuleId,
                                        label: MODULES[scopeModuleId]?.titles?.fa || scopeModuleId,
                                      }))}
                                      additionalRecipientFieldOptions={[
                                        { label: 'مسئول همین فعالیت', value: '__comm_recipient__current_task_assignee' },
                                        { label: 'مسئول مرحله قبل', value: '__comm_recipient__previous_stage_assignee' },
                                        { label: 'مسئول مرحله بعد', value: '__comm_recipient__next_stage_assignee' },
                                        ...processSpecificStageRecipientOptions,
                                      ]}
                                      dynamicOptions={automationDynamicOptions}
                                      relationOptions={automationRelationOptions}
                                      overlayZIndexBase={16040}
                                      popupContainer={resolveOverlayPopupContainer}
                                    />
                                  </React.Suspense>
                              </div>
                            </div>
                          </div>
                        </div>
                        ) : null}
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

                    {diagramAutomationRuleId ? (
                      <React.Suspense fallback={null}>
                        <ProcessAutomationFlowModal
                          open={!!diagramAutomationRuleId}
                          onClose={() => setDiagramAutomationRuleId(null)}
                          rule={
                            draftAutomationRules.find(
                              (rule) => String(rule?.id || '') === String(diagramAutomationRuleId)
                            ) || null
                          }
                          onPatch={(patch) => updateDraftAutomationRule(diagramAutomationRuleId, patch)}
                          zIndex={16100}
                          context={{
                            triggerTypeOptions: processAutomationTriggerTypeOptions,
                            legacyTriggerOption: PROCESS_AUTOMATION_LEGACY_PREVIOUS_STAGE_TRIGGER_OPTION,
                            conditionFields: draftStageTaskType ? automationConditionFieldsWithoutTaskType : automationConditionFields,
                            hasLockedTaskType: !!draftStageTaskType,
                            lockedTaskTypeLabel: draftStageTaskTypeLabel,
                            dynamicOptions: automationDynamicOptions,
                            relationOptions: automationRelationOptions,
                            dynamicFieldProps: {
                              task_type: {
                                onOptionsUpdate: fetchTaskTypeOptions,
                                protectedValues: getTaskTypeProtectedValues(),
                              },
                            },
                            onBeforeAddCondition: guardDraftAutomationConditionAdd,
                            actionsBuilder: {
                              currentModuleId: automationScopeModuleId || 'tasks',
                              currentModuleFields: automationActionModuleFields,
                              variableFields: automationActionVariableFields,
                              nextStageFields: nextStageTransferFields,
                              enableNextStageActions: true,
                              processStageOptions: processStageNodeOptions,
                              activationStageOptions: activationStageNodeOptions,
                              moduleOptions: workflowModuleOptions,
                              relationSourceModuleOptions: automationScopeModuleIds.map((scopeModuleId) => ({
                                value: scopeModuleId,
                                label: MODULES[scopeModuleId]?.titles?.fa || scopeModuleId,
                              })),
                              additionalRecipientFieldOptions: [
                                { label: 'مسئول همین فعالیت', value: '__comm_recipient__current_task_assignee' },
                                { label: 'مسئول مرحله قبل', value: '__comm_recipient__previous_stage_assignee' },
                                { label: 'مسئول مرحله بعد', value: '__comm_recipient__next_stage_assignee' },
                                ...processSpecificStageRecipientOptions,
                              ],
                            },
                            overlayZIndexBase: 16140,
                            popupContainer: resolveOverlayPopupContainer,
                          }}
                        />
                      </React.Suspense>
                    ) : null}
                  </div>
          )}

          {draftModalTabKey === 'instructions' && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600 dark:text-gray-300">
                  دستورالعمل‌هایی که باید در این مرحله رعایت شوند را انتخاب کنید.
                </div>
                <Button
                  type="primary"
                  htmlType="button"
                  icon={<PlusOutlined />}
                  size="small"
                  className="rounded-lg border-none bg-leather-600 !text-white shadow-sm hover:!bg-leather-500"
                  onClick={() => setIsInstructionQuickCreateOpen(true)}
                >
                  افزودن دستورالعمل
                </Button>
              </div>

              {isLoadingInstructionsForEditor ? (
                <div className="flex items-center justify-center py-8">
                  <Spin size="small" />
                </div>
              ) : instructionsForEditor.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <span className="text-sm text-gray-500">
                      هنوز دستورالعملی ثبت نشده است.{' '}
                      <button
                        type="button"
                        className="cursor-pointer text-leather-600 underline"
                        onClick={() => setIsInstructionQuickCreateOpen(true)}
                      >
                        ایجاد دستورالعمل جدید
                      </button>
                    </span>
                  }
                />
              ) : (
                <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                  {instructionsForEditor.map((instruction) => {
                    const instructionId = String(instruction?.id || '');
                    const isSelected = draftStageInstructionIds.includes(instructionId);
                    const statusOption = INSTRUCTION_STATUS_OPTIONS.find((o) => o.value === instruction?.status);
                    return (
                      <div
                        key={instructionId}
                        role="checkbox"
                        aria-checked={isSelected}
                        tabIndex={0}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${
                          isSelected
                            ? 'border-leather-400 bg-leather-50/60 dark:border-leather-500 dark:bg-leather-900/20'
                            : 'border-gray-200 bg-white hover:border-leather-300 dark:border-gray-700 dark:bg-white/5'
                        }`}
                        onClick={() => {
                          setDraftStageInstructionIds((prev) =>
                            prev.includes(instructionId)
                              ? prev.filter((id) => id !== instructionId)
                              : [...prev, instructionId]
                          );
                        }}
                        onKeyDown={(event) => {
                          if (event.key === ' ' || event.key === 'Enter') {
                            event.preventDefault();
                            setDraftStageInstructionIds((prev) =>
                              prev.includes(instructionId)
                                ? prev.filter((id) => id !== instructionId)
                                : [...prev, instructionId]
                            );
                          }
                        }}
                      >
                        <div className={`mt-0.5 h-4 w-4 flex-shrink-0 rounded border-2 transition ${
                          isSelected
                            ? 'border-leather-500 bg-leather-500'
                            : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800'
                        }`}>
                          {isSelected ? (
                            <CheckOutlined className="flex h-full w-full items-center justify-center text-[10px] text-white" />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                              {String(instruction?.name || instruction?.system_code || 'دستورالعمل')}
                            </span>
                            {statusOption ? (
                              <Tag color={String(statusOption.color || 'default')} className="m-0 text-xs">
                                {statusOption.label}
                              </Tag>
                            ) : null}
                            {instruction?.department ? (
                              <Tag className="m-0 text-xs">{String(instruction.department)}</Tag>
                            ) : null}
                          </div>
                          {instruction?.goal ? (
                            <div className="mt-1 line-clamp-2 text-xs text-gray-500">
                              {String(instruction.goal)}
                            </div>
                          ) : null}
                          {instruction?.system_code ? (
                            <div className="mt-0.5 text-xs text-gray-400">{String(instruction.system_code)}</div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
        rootClassName={isMobileProcessViewport ? 'process-stage-modal-root' : undefined}
        className={isMobileProcessViewport ? 'process-stage-modal' : undefined}
        zIndex={10002}
        destroyOnHidden
        width={isMobileProcessViewport ? '100vw' : 560}
        centered={!isMobileProcessViewport}
        style={responsiveProcessModalStyle}
        styles={stageModalStyles}
      >
        <Form
          form={draftCustomFieldForm}
          layout="vertical"
          initialValues={{ type: FieldType.TEXT, required: false }}
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
            <AdaptiveSelectField {...adaptiveModalSelectProps} allowClear={false} options={processTaskCustomFieldTypeOptions} />
          </Form.Item>

          {draftCustomFieldType === FieldType.RELATION && (
            <>
              <Form.Item
                label="ماژول مرتبط"
                name="relationTargetModule"
                rules={[{ required: true, message: 'ماژول مرتبط را انتخاب کنید.' }]}
              >
                <AdaptiveSelectField {...adaptiveModalSelectProps} options={workflowModuleOptions} />
              </Form.Item>
              <Form.Item label="فیلد نمایشی مقصد" name="relationTargetField">
                <AdaptiveSelectField
                  {...adaptiveModalSelectProps}
                  allowClear
                  options={(MODULES[String(draftCustomFieldRelationTargetModule || '')]?.fields || []).map((field) => ({
                    value: field.key,
                    label: getFieldLabelFa(field),
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

          <Form.Item label="الزام در تکمیل فعالیت" name="required" valuePropName="checked">
            <Switch checkedChildren="اجباری" unCheckedChildren="اختیاری" />
          </Form.Item>
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
        rootClassName={isMobileProcessViewport ? 'process-stage-modal-root' : undefined}
        className={isMobileProcessViewport ? 'process-stage-modal' : undefined}
        zIndex={10003}
        destroyOnHidden
        width={isMobileProcessViewport ? '100vw' : 620}
        centered={!isMobileProcessViewport}
        style={responsiveProcessModalStyle}
        styles={stageModalStyles}
      >
        <div className="mb-3 rounded-xl border border-[rgba(var(--brand-200-rgb),0.45)] bg-[rgba(var(--brand-50-rgb),0.32)] px-3 py-2 text-xs leading-6 text-gray-600 dark:border-[rgba(var(--brand-300-rgb),0.16)] dark:bg-white/5 dark:text-gray-300">
          برای هر گزینه عنوان نمایشی، مقدار ذخیره‌شده و رنگ را جدا وارد کنید. اگر مقدار خالی بماند، مقدار فنی به‌صورت خودکار ساخته می‌شود.
        </div>
        <Form form={draftCustomFieldOptionsForm} layout="vertical">
          <Form.List name="options">
            {(fields, { add, remove }) => (
              <div className="space-y-3">
                {fields.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="هنوز گزینه‌ای برای این فیلد ثبت نشده است."
                  />
                ) : null}
                {fields.map((field, optionIndex) => {
                  const { key, ...listField } = field;
                  return (
                    <div
                      key={key}
                      className="grid grid-cols-12 gap-3 rounded-xl border border-[rgba(var(--brand-200-rgb),0.55)] bg-white/90 p-3 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5"
                    >
                      <div className="col-span-12 md:col-span-4">
                        <Form.Item
                          {...listField}
                          label="عنوان نمایشی"
                          name={[field.name, 'label']}
                          rules={[{ required: true, message: 'عنوان گزینه را وارد کنید.' }]}
                          className="mb-0"
                        >
                          <Input
                            placeholder="مثلا: منتظر تایید مدیر"
                            autoComplete="off"
                            onKeyDown={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              const currentValue = String(
                                draftCustomFieldOptionsForm.getFieldValue(['options', field.name, 'value']) || ''
                              ).trim();
                              if (!currentValue) {
                                draftCustomFieldOptionsForm.setFieldValue(
                                  ['options', field.name, 'value'],
                                  normalizeProcessTaskOptionKey(
                                    event.target.value,
                                    buildDefaultProcessTaskOptionValue('option', optionIndex)
                                  )
                                );
                              }
                            }}
                          />
                        </Form.Item>
                      </div>
                      <div className="col-span-12 md:col-span-4">
                        <Form.Item
                          {...listField}
                          label="مقدار ذخیره‌شده"
                          name={[field.name, 'value']}
                          className="mb-0"
                        >
                          <Input
                            placeholder="manager_pending"
                            dir="ltr"
                            autoComplete="off"
                            onKeyDown={(event) => event.stopPropagation()}
                            onBlur={(event) => {
                              draftCustomFieldOptionsForm.setFieldValue(
                                ['options', field.name, 'value'],
                                normalizeProcessTaskOptionKey(
                                  event.target.value,
                                  buildDefaultProcessTaskOptionValue('option', optionIndex)
                                )
                              );
                            }}
                          />
                        </Form.Item>
                      </div>
                      <div className="col-span-10 md:col-span-3">
                        <Form.Item
                          {...listField}
                          label="رنگ"
                          name={[field.name, 'color']}
                          className="mb-0"
                        >
                          <AdaptiveSelectField
                            {...adaptiveModalSelectProps}
                            allowClear
                            options={PROCESS_TASK_STATUS_COLOR_OPTIONS}
                            placeholder="بدون رنگ"
                            optionRender={(option: any) => {
                              const rawValue = String(option?.value ?? option?.data?.value ?? '').trim();
                              const meta = PROCESS_TASK_STATUS_COLOR_META.find((item) => item.value === rawValue);
                              const label = meta?.label || String(option?.label ?? option?.data?.label ?? rawValue);
                              return (
                                <span className="inline-flex items-center gap-2">
                                  <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{ backgroundColor: meta?.hex || '#9ca3af' }}
                                  />
                                  <span>{label}</span>
                                </span>
                              );
                            }}
                            renderMobileOption={(option: any) => {
                              const meta = PROCESS_TASK_STATUS_COLOR_META.find((item) => item.value === String(option?.value || '').trim());
                              return (
                                <span className="inline-flex items-center gap-2">
                                  <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{ backgroundColor: meta?.hex || '#9ca3af' }}
                                  />
                                  <span>{option?.label}</span>
                                </span>
                              );
                            }}
                          />
                        </Form.Item>
                      </div>
                      <div className="col-span-2 md:col-span-1 flex items-end justify-end">
                        <Button
                          htmlType="button"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => remove(field.name)}
                        />
                      </div>
                    </div>
                  );
                })}
                <Button
                  type="dashed"
                  htmlType="button"
                  icon={<PlusOutlined />}
                  onClick={() => add({
                    value: buildDefaultProcessTaskOptionValue('option', fields.length),
                    color: 'default',
                  })}
                  className="w-full"
                >
                  افزودن گزینه
                </Button>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>

      <Modal
        title={appendProcessModalMode === 'links' ? 'رکوردهای مرتبط با این فرآیند' : 'افزودن فرآیند جدید'}
        rootClassName={isMobileProcessViewport ? 'process-stage-modal-root' : undefined}
        className={isMobileProcessViewport ? 'process-stage-modal' : undefined}
        open={appendProcessModalOpen}
        width={isMobileProcessViewport ? '100vw' : (appendProcessModalMode === 'links' ? 1120 : 760)}
        style={responsiveProcessModalStyle}
        onCancel={() => {
          setAppendProcessModalOpen(false);
          setAppendProcessModalGroupId(null);
          setAppendProcessModalMode('append');
          setAppendProcessTemplateId(null);
          setAppendProcessTemplateLabel(null);
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
                  setAppendProcessTemplateLabel(null);
                }}
              >
                انصراف
              </Button>,
              <Button
                key="save-links"
                type="primary"
                className="kalam-btn-brand"
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
                  setAppendProcessTemplateLabel(null);
                }}
              >
                انصراف
              </Button>,
              <Button
                key="add"
                type="primary"
                className="kalam-btn-brand"
                loading={loading}
                onClick={() => { void handleAppendProcessTemplate(); }}
                disabled={!appendProcessTemplateId}
              >
                افزودن از الگو
              </Button>,
            ]}
        destroyOnHidden
        centered={!isMobileProcessViewport}
        styles={stageModalStyles}
      >
        <div className="space-y-3 pt-2">
          <div className="text-xs text-gray-500">
            {appendProcessModalMode === 'links'
              ? 'رکوردهای مرتبط این فرآیند را در همین‌جا بررسی و بروزرسانی کنید.'
              : 'یک الگو انتخاب کنید تا یک نوار فرآیند جدید ساخته شود.'}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">الگوی فرآیند اجرا</span>
            <AdaptiveSelectField
              {...adaptiveModalSelectProps}
              placement="topRight"
              labelInValue
              value={appendProcessTemplateSelectValue}
              onChange={handleAppendProcessTemplateSelectChange}
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
                    <SmartFieldRenderer
                      field={{
                        key: createProcessLinkedFieldKey(targetModuleId, 'id'),
                        type: FieldType.RELATION,
                        labels: {
                          fa: `رکورد مرتبط ${MODULES[targetModuleId]?.titles?.faSingular || MODULES[targetModuleId]?.titles?.fa || targetModuleId}`,
                          en: `Linked ${targetModuleId}`,
                        },
                        relationConfig: { targetModule: targetModuleId },
                      } as ModuleField}
                      value={appendProcessLinkedRecords[targetModuleId] || undefined}
                      onChange={(value) => {
                        const normalizedValue = value ? String(value) : null;
                        setAppendProcessLinkedRecords((prev) => {
                          const next = {
                            ...prev,
                            [targetModuleId]: normalizedValue,
                          };
                          appendProcessLinkedRecordsRef.current = next;
                          return next;
                        });
                        if (normalizedValue) {
                          void loadAppendProcessRelationOptions(targetModuleId, normalizedValue);
                        }
                      }}
                      forceEditMode={true}
                      options={appendProcessRelationOptions[targetModuleId] || []}
                      onOptionsUpdate={() => {
                        const latestLinks = appendProcessLinkedRecordsRef.current || appendProcessLinkedRecords;
                        void loadAppendProcessRelationOptions(targetModuleId, latestLinks[targetModuleId] || null);
                      }}
                      allValues={{
                        ...appendProcessLinkedRecords,
                        [createProcessLinkedFieldKey(targetModuleId, 'id')]: appendProcessLinkedRecords[targetModuleId] || undefined,
                      }}
                      moduleId={moduleId}
                      recordId={recordId}
                      overlayZIndexBase={16040}
                      popupContainer={resolveOverlayPopupContainer}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </Modal>

      {supportsHandover && (handoverFormsContentMounted || handoverEditorContentMounted) && (
        <>
          {handoverFormsContentMounted ? (
            <React.Suspense fallback={null}>
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
            </React.Suspense>
          ) : null}

          {handoverEditorContentMounted ? (
            <React.Suspense fallback={null}>
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
            </React.Suspense>
          ) : null}
        </>
      )}
      {isInstructionQuickCreateOpen ? (
        <React.Suspense fallback={null}>
          <InstructionQuickCreateModal
            open={isInstructionQuickCreateOpen}
            onClose={() => setIsInstructionQuickCreateOpen(false)}
            overlayZIndex={10100}
            onCreated={(record) => {
              const newInstruction = record as any;
              setInstructionsForEditor((prev) => {
                const exists = prev.some((item) => String(item?.id || '') === String(newInstruction?.id || ''));
                return exists ? prev : [...prev, newInstruction];
              });
              if (newInstruction?.id) {
                setDraftStageInstructionIds((prev) => {
                  const id = String(newInstruction.id);
                  return prev.includes(id) ? prev : [...prev, id];
                });
              }
            }}
          />
        </React.Suspense>
      ) : null}

      <style>{`
        @media (max-width: 768px) {
          .process-stage-modal-root .ant-modal-wrap {
            overflow: hidden;
          }

          .process-stage-modal {
            top: 0 !important;
            max-width: 100vw !important;
            margin: 0 !important;
            padding-bottom: 0 !important;
          }

          .process-stage-modal .ant-modal-content {
            min-height: 100dvh;
            max-height: 100dvh;
            border-radius: 0 !important;
            display: flex;
            flex-direction: column;
          }

          .process-stage-modal .ant-modal-body {
            flex: 1;
            min-height: 0;
            overflow: auto;
          }

          .process-stage-modal .ant-modal-footer {
            padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px)) !important;
          }
        }
      `}</style>
    </div>
  );
};

export default ProductionStagesField;
