import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button, App, Checkbox, Modal, Select, Form, Input, Skeleton } from 'antd';
import { EditOutlined, CheckOutlined, CloseOutlined, CopyOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { FieldType, BlockType, FieldLocation, FieldNature } from '../types';
import RelatedSidebar from '../components/Sidebar/RelatedSidebar';
import SmartFieldRenderer from '../components/SmartFieldRenderer';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import HeaderActions from '../components/moduleShow/HeaderActions';
import HeroSection from '../components/moduleShow/HeroSection';
import FieldGroupsTabs from '../components/moduleShow/FieldGroupsTabs';
import PrintSection from '../components/moduleShow/PrintSection';
import TablesSection from '../components/moduleShow/TablesSection';
import RecordImageBox from '../components/RecordImageBox';
import type { StartMaterialGroup, StartMaterialPiece, StartMaterialDeliveryRow } from '../components/production/StartProductionModal';
import { printStyles } from '../utils/printTemplates';
import { usePrintManager } from '../utils/printTemplates/usePrintManager';
import { createPrintPerformanceTracker, waitForNextPaint } from '../utils/printTemplates/printPerformance';
import { resolvePrintAssigneeLabel, resolvePrintOptionLabel } from '../utils/printTemplates/assigneeDisplay';
import { formatPersianPrice, toPersianNumber } from '../utils/persianNumberFormatter';
import { convertArea } from '../utils/unitConversions';
import QrScanPopover from '../components/QrScanPopover';
import { PRODUCTION_MESSAGES } from '../utils/productionMessages';
import { getRecordTitle } from '../utils/recordTitle';
import {
  applyProductionMoves,
  rollbackProductionMoves,
  consumeProductionMaterials,
  addFinishedGoods,
  syncProductStock,
} from '../utils/productionWorkflow';
import { applyInvoiceFinalizationInventory } from '../utils/invoiceInventoryWorkflow';
import { applyStockTransferInventory } from '../utils/stockTransferInventoryWorkflow';
import { createJournalFromInvoice, getAccountingEventLabelFa, syncInvoiceAccountingEntries, type ResolvedJournalEntry } from '../utils/accountingAutoPosting';
import { shouldAutoSyncInvoiceAccounting } from '../utils/invoiceAccountingPolicy';
import { syncCustomerLevelsByInvoiceCustomers } from '../utils/customerLeveling';
import {
  canAccessAssignedRecord,
  canUseRecordLockPermission,
  fetchCurrentUserRecordAccessContext,
  isSaasAdminModuleId,
  SAAS_ADMIN_PERMISSION_KEY,
  type PermissionMap,
  type RecordScope,
} from '../utils/permissions';
import { normalizeAutoNameEnabled } from '../utils/autoName';
import { buildClientFallbackSystemCode, supportsSystemCode } from '../utils/systemCode';
import { buildCopyPayload, detectCopyNameField } from '../utils/recordCopy';
import { useCurrencyConfig } from '../utils/currency';
import { fileStorageClient, FILE_STORAGE_BUCKET } from '../utils/storageClient';
import { joinStoragePath, sanitizeStorageFileName } from '../utils/storagePath';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { getSafeOptionFallback } from '../utils/optionHelpers';
import { getAssigneeLabel } from '../utils/assigneeLabel';
import { getResolvedAssigneeId, parseAssigneeValue } from '../utils/assigneeValue';
import { getFieldLabelFa } from '../utils/fieldLabel';
import { fetchAssigneeDirectory, fetchDynamicOptionsMap, fetchFormulaOptions } from '../utils/referenceData';
import { getCachedAuthUser } from '../utils/sessionCache';
import { shouldHideManagedAssigneeField, supportsModuleAssignee, supportsModuleRoleAssignee } from '../utils/assigneeSupport';
import { fetchRelationOptionsForField } from '../utils/relationOptions';
import { syncRecordTags } from '../utils/recordTags';
import { getProcessTemplateModuleOptions } from '../utils/workflowHelpers';
import { runWorkflowsForEvent } from '../utils/workflowRuntime';
import { mapProcessTemplateStagesToDraft } from '../utils/processRunRuntime';
import { createProcessLinkedFieldKey, doesProcessTemplateSupportModule, getRelationFieldLinksForModules, normalizeProcessTargetModuleIds, syncProcessTemplateTargetModules } from '../utils/processTargets';
import { syncProcessDraftToLinkedRecords } from '../utils/processLinkedDraftSync';
import { buildTaskSourcePatch, fetchTaskSourceRecordOptions, getTaskModuleOptions, normalizeTaskSourceValues } from '../utils/taskMeta';
import { updateTaskStatusWithAutomation } from '../utils/taskUpdateRuntime';
import { markModuleListChanged } from '../utils/moduleListLive';
import { mergeOptionLists, mergeOptionMaps, readModuleOptionSnapshot, writeModuleOptionSnapshot } from '../utils/moduleOptionSnapshot';
import { isUploadCanceledError, uploadFileWithProgress } from '../utils/uploadFileWithProgress';
import {
  getProcessTaskCustomFieldsFromRecurrence,
  getProcessTaskCustomFieldValuesFromRecurrence,
  mergeProcessTaskCustomFieldValues,
  PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY,
  PROCESS_TASK_CUSTOM_FIELDS_KEY,
  withProcessTaskCustomFieldValues,
} from '../utils/processTaskCustomFields';
import { getTaskStatusOptions } from '../utils/processTaskStatusOptions';
import { isRecycleBinEnabledModule } from '../utils/recycleBin';
import { isOnlineCatalogModule } from '../utils/onlineCatalog';
import type { BotChannel, BotPlatformState } from '../components/bot/CounterpartyBotStatusModal';
import { BOT_CHANNELS, BOT_CHANNEL_LABELS_FA, getBotChatIdFieldKey, type BotTargetModuleId } from '../utils/botPlatform';
import { syncBotDirectChatIdForTarget } from '../utils/botIdentityBindings';
import { loadScopedCompanySettings } from '../utils/companySettings';
import { serializeNoteContent } from '../utils/noteContent';
import { useConditionalFieldRuntime } from '../hooks/useConditionalFieldRuntime';
import { evaluateLegacyVisibilityRule } from '../utils/conditionalFieldRules';
import { normalizeModuleFormValues, transformModulePayloadForSave, validateModuleFormValues } from '../utils/moduleFormRuntime';
import { enrichAttendancePresenceRows } from '../utils/attendancePresence';
import { applyInvoicePaymentAllocation } from '../utils/invoicePaymentAllocationRuntime';
import type { SmartFormSaveMeta } from '../components/SmartForm';
import { normalizeNoteScope } from '../utils/noteScope';
import { buildModuleRecordProjection } from '../utils/moduleRecordProjection';
import { runSelectWithCompatibleColumns } from '../utils/selectCompat';
import { getActiveChannelSettings } from '../utils/channelSettings';
import { insertNotesWithFallback } from '../utils/noteDispatch';
import { sendSmsViaGateway } from '../utils/smsGateway';
import { isOperationalAccountingModule, syncOperationalAccountingEntry } from '../utils/operationalAccounting';
import { normalizeOperationalDocumentTotals } from '../utils/operationalDocumentTotals';
import { shortenAttachmentsForExternalShare } from '../utils/fileShortLinks';
import { createFileManagerOriginForUpload, detectFileManagerTables } from '../utils/fileManagerService';
import { insertRecordActivity, logAndTouchRecord } from '../utils/recordActivity';
import { executeSaasModuleAction } from '../utils/saasAdminModules';
import {
  buildInstructionModuleConfig,
  buildInstructionModuleOptions,
  INSTRUCTIONS_MODULE_ID,
} from '../utils/instructionSupport';
import { syncProcessTemplateStages as syncProcessTemplateStagesShared } from '../utils/processTemplateStages';
import type { ProcessRuntimeSnapshot } from '../utils/processRuntimeSnapshot';
import { buildSurveyRuntimeModule, mergeSurveyTemplateValuesIntoRecord, supportsWebFormTemplateRuntime } from '../utils/surveyTemplates';
import RecordLockControl from '../components/recordLocks/RecordLockControl';
import {
  fetchRecordLockState,
  getRecordLockStateFromRecord,
  mergeRecordLockIntoRecord,
  type RecordLockState,
} from '../utils/recordLockRuntime';

const SmartForm = React.lazy(() => import('../components/SmartForm'));
const OperationalFinancialOverviewPanel = React.lazy(() => import('../components/accounting/OperationalFinancialOverviewPanel'));
const AccountLedgerPanel = React.lazy(() => import('../components/accounting/AccountLedgerPanel'));
const StartProductionModal = React.lazy(() => import('../components/production/StartProductionModal'));
const TaxpayerInvoiceModal = React.lazy(() => import('../components/taxpayer/TaxpayerInvoiceModal'));
const CounterpartyBotStatusModal = React.lazy(() => import('../components/bot/CounterpartyBotStatusModal'));
const MessageComposerModal = React.lazy(() => import('../components/MessageComposerModal'));
const DeleteModuleRecordsModal = React.lazy(() => import('../components/moduleDelete/DeleteModuleRecordsModal'));
const OnlineCatalogManagerModal = React.lazy(() => import('../components/onlineCatalog/OnlineCatalogManagerModal'));

const DEFAULT_BOT_PLATFORM_STATE: BotPlatformState = {
  groupTitle: '',
  groupJoinLink: '',
  directChatId: '',
  currentStatus: 'pending_join',
  activationCode: '',
  lastInboundAt: '',
  lastInboundText: '',
  allowedUserIds: [],
  allowedRoleIds: [],
  aiAutoReplyEnabled: false,
  aiCounterpartyGuide: '',
};

const isStatementTimeoutError = (error: any) => {
  const code = String(error?.code || '').trim();
  const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return code === '57014' || text.includes('statement timeout');
};

const isDuplicateSystemCodeError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return code === '23505' && (text.includes('system_code') || text.includes('org_system_code'));
};

const toFaAccountingSyncError = (raw: unknown): string => {
  const text = String(raw || '').trim();
  if (!text) return 'خطا در صدور سند حسابداری.';

  const lower = text.toLowerCase();
  if (lower.includes('missing default accounts') && lower.includes('receivable') && lower.includes('revenue')) {
    return 'حساب‌های پیش‌فرض دریافتنی و درآمد فروش تعریف نشده‌اند.';
  }
  if (lower.includes('missing default accounts') && lower.includes('payable')) {
    return 'حساب پیش‌فرض پرداختنی تعریف نشده است.';
  }
  if (lower.includes('json object requested') && lower.includes('multiple')) {
    return 'چند تنظیم هم‌زمان برای حسابداری پیدا شد. لطفا فقط یک تنظیم پیش‌فرض نگه دارید.';
  }
  if (/[a-z]/i.test(text)) {
    return 'خطا در صدور سند حسابداری.';
  }
  return text;
};

const PROJECT_PROCESS_HIDDEN_LINK_MODULE_IDS = new Set([
  'projects',
  'tasks',
  'process_templates',
  'process_runs',
  'customers',
  'invoices',
  'purchase_invoices',
]);

const CUSTOMER_BOT_CHANNEL_LABELS: Record<string, string> = {
  ...BOT_CHANNEL_LABELS_FA,
  none: 'بدون پلتفرم',
};

const buildEnglishActivationBase = (value: any) => {
  const ascii = String(value || '')
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toUpperCase();
  if (!ascii) return '';
  const words = ascii.split(/\s+/).filter(Boolean).slice(0, 3);
  return words.join('-').slice(0, 20);
};

const createBotActivationCode = (englishName?: string, orgPrefix?: string) => {
  const prefix = String(orgPrefix || 'TAZESYSTEM').toUpperCase();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  const base = buildEnglishActivationBase(englishName);
  return base ? `${prefix}-${base}-${random}` : `${prefix}-${random}`;
};

const loadOrgBotPrefix = async (): Promise<string> => {
  try {
    const result = await loadScopedCompanySettings(supabase);
    const nameEn = String(result?.data?.company_name_en || result?.data?.name_en || '').trim();
    if (!nameEn) return 'TAZESYSTEM';
    const ascii = nameEn
      .normalize('NFKD')
      .replace(/[^\x00-\x7F]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '')
      .toUpperCase()
      .slice(0, 8);
    return ascii || 'TAZESYSTEM';
  } catch {
    return 'TAZESYSTEM';
  }
};

const buildAccountingEntryChoices = (entries: ResolvedJournalEntry[]): AccountingEntryChoice[] => {
  const grouped = new Map<string, AccountingEntryChoice>();
  (entries || []).forEach((entry) => {
    const journalEntryId = String(entry?.journalEntryId || '').trim();
    const eventKey = String(entry?.eventKey || '').trim();
    if (!journalEntryId || !eventKey) return;
    const current = grouped.get(journalEntryId);
    if (current) {
      if (!current.eventKeys.includes(eventKey)) current.eventKeys.push(eventKey);
      if (entry.state === 'created') current.state = 'created';
      return;
    }
    grouped.set(journalEntryId, {
      journalEntryId,
      eventKeys: [eventKey],
      state: entry.state === 'created' ? 'created' : 'existing',
    });
  });
  return Array.from(grouped.values());
};

const MODULE_SHOW_INLINE_DRAFT_PREFIX = 'kalamapp:module-show-inline-draft:v1';

const readModuleShowInlineDraft = (key: string) => {
  if (!key || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      values: parsed.values && typeof parsed.values === 'object' ? parsed.values : {},
      editingFields: parsed.editingFields && typeof parsed.editingFields === 'object' ? parsed.editingFields : {},
    };
  } catch {
    return null;
  }
};

const writeModuleShowInlineDraft = (
  key: string,
  values: Record<string, any>,
  editingFields: Record<string, boolean>,
) => {
  if (!key || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify({
      values,
      editingFields,
      savedAt: Date.now(),
    }));
  } catch {
    // Draft persistence must not block editing if storage is unavailable.
  }
};

const clearModuleShowInlineDraft = (key: string) => {
  if (!key || typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }
};

const ModuleShowSkeleton: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#f6f7fb] dark:bg-[#0f1115] px-4 py-5 md:px-6">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
        <div className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#17191f]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <Skeleton.Avatar active size={72} shape="square" className="!rounded-2xl" />
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <Skeleton.Input active style={{ width: '42%', height: 28 }} />
                <Skeleton.Input active style={{ width: '68%', height: 18 }} />
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 3 }).map((_, idx) => (
                    <Skeleton.Button key={idx} active size="small" shape="round" />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 3 }).map((_, idx) => (
                <Skeleton.Button key={idx} active />
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#17191f]">
            <Skeleton active title={{ width: '26%' }} paragraph={{ rows: 10 }} />
          </div>
          <div className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#17191f]">
            <Skeleton active title={{ width: '45%' }} paragraph={{ rows: 6 }} />
          </div>
        </div>
      </div>
    </div>
  );
};

const MODULE_SHOW_CACHE_TTL_MS = 30000;
type ModuleShowSnapshot = {
  record: any;
  tags: any[];
  cachedAt: number;
};

type AccountingEntryChoice = {
  journalEntryId: string;
  eventKeys: string[];
  state: 'created' | 'existing';
};

const moduleShowSnapshotCache = new Map<string, ModuleShowSnapshot>();
let moduleShowBaseInfoCache: { users: any[]; roles: any[] } | null = null;
let moduleShowBaseInfoPromise: Promise<{ users: any[]; roles: any[] }> | null = null;

const resolveStablePopupContainer = (trigger?: HTMLElement | null) => {
  if (typeof document === 'undefined') return (trigger || {}) as HTMLElement;
  if (!trigger) return document.body;
  return (
    trigger.closest('.ant-modal-root, .ant-modal-wrap, .ant-modal, .ant-drawer-content-wrapper, .ant-drawer-content, .ant-drawer') as HTMLElement | null
  ) || document.body;
};

type BotStatusModalContext = {
  moduleId: 'customers' | 'suppliers' | 'employees';
  targetType: BotTargetModuleId;
  counterpartyId: string;
};

const applyBotTargetFilter = (query: any, context: Pick<BotStatusModalContext, 'targetType' | 'counterpartyId'>) => {
  if (context.targetType === 'customers') return query.eq('customer_id', context.counterpartyId);
  if (context.targetType === 'suppliers') return query.eq('supplier_id', context.counterpartyId);
  return query.eq('employee_id', context.counterpartyId);
};

const _msToNumber = (value: any) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const _msCalcDeliveredQty = (row?: Partial<StartMaterialDeliveryRow> | null) => {
  const length = Math.max(0, _msToNumber((row as any)?.length));
  const width = Math.max(0, _msToNumber((row as any)?.width));
  const quantity = Math.max(0, _msToNumber((row as any)?.quantity));
  return length * width * quantity;
};

const _msSumDeliveredRows = (rows: StartMaterialDeliveryRow[]) =>
  rows.reduce((sum: number, row: StartMaterialDeliveryRow) => sum + _msCalcDeliveredQty(row), 0);

const _msBuildDeliveryRowKey = () =>
  `delivery_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const _msNormalizeDeliveryRow = (group: StartMaterialGroup, rawRow?: any): StartMaterialDeliveryRow => {
  const firstPiece = Array.isArray(group.pieces) && group.pieces.length > 0 ? group.pieces[0] : null;
  return {
    key: String(rawRow?.key || _msBuildDeliveryRowKey()),
    pieceKey: rawRow?.pieceKey ? String(rawRow.pieceKey) : undefined,
    name: String(rawRow?.name ?? firstPiece?.name ?? ''),
    length: _msToNumber(rawRow?.length ?? firstPiece?.length ?? 0),
    width: _msToNumber(rawRow?.width ?? firstPiece?.width ?? 0),
    quantity: _msToNumber(rawRow?.quantity ?? firstPiece?.quantity ?? 1),
    mainUnit: String(rawRow?.mainUnit ?? firstPiece?.mainUnit ?? ''),
    subUnit: String(rawRow?.subUnit ?? firstPiece?.subUnit ?? ''),
    deliveredQty: _msCalcDeliveredQty({
      length: rawRow?.length ?? firstPiece?.length ?? 0,
      width: rawRow?.width ?? firstPiece?.width ?? 0,
      quantity: rawRow?.quantity ?? firstPiece?.quantity ?? 1,
    }),
  };
};

const _msRecalcStartGroup = (group: StartMaterialGroup): StartMaterialGroup => {
  const pieces = Array.isArray(group.pieces) ? group.pieces : [];
  const deliveryRows = (Array.isArray(group.deliveryRows) ? group.deliveryRows : []).map((row) => ({
    ...row,
    deliveredQty: _msCalcDeliveredQty(row),
  }));
  return {
    ...group,
    deliveryRows,
    totalPerItemUsage: pieces.reduce((sum: number, piece: StartMaterialPiece) => sum + piece.perItemUsage, 0),
    totalUsage: pieces.reduce((sum: number, piece: StartMaterialPiece) => sum + piece.totalUsage, 0),
    totalDeliveredQty: _msSumDeliveredRows(deliveryRows),
  };
};

const _msMergeUsersById = (rows: any[]) =>
  rows.reduce((acc: any[], row: any) => {
    const id = String(row?.id || '').trim();
    if (!id) return acc;
    const existingIndex = acc.findIndex((item) => String(item?.id || '') === id);
    if (existingIndex >= 0) {
      const next = [...acc];
      next[existingIndex] = { ...next[existingIndex], ...row };
      return next;
    }
    return [...acc, row];
  }, []);

const _msIsMissingColumnError = (error: any, columnName: string) => {
  const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  const needle = String(columnName || '').toLowerCase();
  return !!text && !!needle && text.includes(needle) && (text.includes('column') || text.includes('schema cache'));
};

const ModuleShow: React.FC = () => {
  const { moduleId = 'products', id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { message: msg, modal } = App.useApp();
  const { label: currencyLabel } = useCurrencyConfig();
  const baseModuleConfig = MODULES[moduleId];
  const focusBlockId = useMemo(
    () => String((location.state as any)?.focusBlockId || '').trim() || null,
    [location.state]
  );
  const focusRowKey = useMemo(
    () => String((location.state as any)?.focusRowKey || '').trim() || null,
    [location.state]
  );
  const openProcessLinksRequest = useMemo(() => {
    const request = (location.state as any)?.openProcessLinks;
    if (!request || typeof request !== 'object') return null;
    return {
      groupId: String(request?.groupId || '').trim() || null,
      templateId: String(request?.templateId || '').trim() || null,
    };
  }, [location.state]);
  const supportsAssignee = supportsModuleAssignee(baseModuleConfig);
  const supportsRoleAssignee = supportsModuleRoleAssignee(baseModuleConfig);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allRoles, setAllRoles] = useState<any[]>([]);
  const taskProcessCustomFields = useMemo(() => {
    if (moduleId !== 'tasks' || !data?.recurrence_info) return [] as any[];
    const recurrence = data.recurrence_info && typeof data.recurrence_info === 'object' ? data.recurrence_info : {};
    return getProcessTaskCustomFieldsFromRecurrence(recurrence).map((field: any, index: number) => ({
      ...field,
      location: FieldLocation.BLOCK,
      blockId: 'process_task_custom_fields',
      order: 100 + index,
      nature: FieldNature.STANDARD,
      __processTaskCustomField: true,
    }));
  }, [data?.recurrence_info, moduleId]);
  const moduleConfig = useMemo(() => {
    let nextConfig = baseModuleConfig;
    if (moduleId === 'tasks' && taskProcessCustomFields.length > 0) {
      const existingFieldKeys = new Set((nextConfig?.fields || []).map((field: any) => String(field?.key || '').trim()));
      const extraFields = taskProcessCustomFields.filter((field: any) => !existingFieldKeys.has(String(field?.key || '').trim()));
      if (extraFields.length > 0) {
        const hasCustomBlock = (nextConfig?.blocks || []).some((block: any) => String(block?.id || '') === 'process_task_custom_fields');
        nextConfig = {
          ...nextConfig,
          fields: [...(nextConfig?.fields || []), ...extraFields],
          blocks: [
            ...(nextConfig?.blocks || []),
            ...(hasCustomBlock ? [] : [{
              id: 'process_task_custom_fields',
              titles: { fa: 'فیلدهای اختصاصی فعالیت', en: 'Activity Custom Fields' },
              type: BlockType.FIELD_GROUP,
              order: 1.6,
            }]),
          ],
        };
      }
    }
    if (moduleId === INSTRUCTIONS_MODULE_ID && nextConfig) {
      nextConfig = buildInstructionModuleConfig(nextConfig, {
        moduleOptions: buildInstructionModuleOptions(),
        userOptions: allUsers.map((user: any) => ({
          value: String(user?.id || ''),
          label: String(user?.full_name || user?.email || user?.mobile_1 || user?.id || '').trim() || '-',
        })).filter((option) => option.value),
        roleOptions: allRoles.map((role: any) => ({
          value: String(role?.id || ''),
          label: String(role?.title || role?.name || role?.id || '').trim() || '-',
        })).filter((option) => option.value),
      });
    }
    if (nextConfig && supportsWebFormTemplateRuntime(nextConfig) && data?.template_schema_snapshot) {
      nextConfig = buildSurveyRuntimeModule(nextConfig, data.template_schema_snapshot, 'show');
    }
    return nextConfig;
  }, [allRoles, allUsers, baseModuleConfig, data?.template_schema_snapshot, moduleId, taskProcessCustomFields]);
  const moduleTable = moduleConfig?.table || moduleId;
  const displayData = useMemo(
    () => mergeSurveyTemplateValuesIntoRecord(normalizeModuleFormValues(moduleId, data || {})) || normalizeModuleFormValues(moduleId, data || {}),
    [data, moduleId]
  );
  const inlineDraftStorageKey = useMemo(
    () => (moduleId && id ? `${MODULE_SHOW_INLINE_DRAFT_PREFIX}:${moduleId}:${id}` : ''),
    [id, moduleId],
  );
  const recordLockState = useMemo(() => getRecordLockStateFromRecord(data), [data]);
  const isRecordLocked = recordLockState.isLocked;
  const handleRecordLockChanged = useCallback((nextLockState: RecordLockState) => {
    setData((prev: any) => {
      if (!prev) return prev;
      const nextRecord = mergeRecordLockIntoRecord(prev, nextLockState);
      const cacheKey = `${moduleId}:${id || ''}`;
      const cachedSnapshot = moduleShowSnapshotCache.get(cacheKey);
      if (cachedSnapshot) {
        moduleShowSnapshotCache.set(cacheKey, {
          ...cachedSnapshot,
          record: nextRecord,
          cachedAt: Date.now(),
        });
      }
      return nextRecord;
    });
  }, [id, moduleId]);

  useEffect(() => {
    if (!moduleId || !id) return;
    let cancelled = false;
    fetchRecordLockState(moduleId, id)
      .then((nextLockState) => {
        if (cancelled) return;
        setData((prev: any) => {
          if (!prev) return prev;
          const nextRecord = mergeRecordLockIntoRecord(prev, nextLockState);
          const cacheKey = `${moduleId}:${id || ''}`;
          const cachedSnapshot = moduleShowSnapshotCache.get(cacheKey);
          if (cachedSnapshot) {
            moduleShowSnapshotCache.set(cacheKey, {
              ...cachedSnapshot,
              record: nextRecord,
              cachedAt: Date.now(),
            });
          }
          return nextRecord;
        });
      })
      .catch((error) => {
        console.warn('Could not load record lock state', error);
      });
    return () => {
      cancelled = true;
    };
  }, [id, moduleId]);
  useEffect(() => {
    if (moduleId !== 'attendance_logs' || !id || !data) return;
    if (displayData?.presence_minutes !== null && displayData?.presence_minutes !== undefined && displayData?.presence_minutes !== '') return;
    if (displayData?.presence_hours !== null && displayData?.presence_hours !== undefined && displayData?.presence_hours !== '') return;

    const attendanceDate = String(displayData?.attendance_date || '').trim().slice(0, 10);
    if (!attendanceDate) return;

    const run = async () => {
      let query = supabase
        .from('attendance_logs')
        .select('id, org_id, employee_id, related_profile_id, assignee_id, log_type, occurred_at, attendance_date, check_in_time, check_out_time, actual_check_in_time, actual_check_out_time, manual_check_in_time, manual_check_out_time, presence_minutes, presence_hours')
        .eq('attendance_date', attendanceDate);

      if (displayData?.org_id) query = query.eq('org_id', displayData.org_id);
      if (displayData?.employee_id) {
        query = query.eq('employee_id', displayData.employee_id);
      } else if (displayData?.related_profile_id) {
        query = query.eq('related_profile_id', displayData.related_profile_id);
      } else if (displayData?.assignee_id) {
        query = query.eq('assignee_id', displayData.assignee_id);
      } else {
        return;
      }

      const { data: siblingRows, error } = await query.limit(50);
      if (error || !Array.isArray(siblingRows) || siblingRows.length === 0) return;
      const enrichedRows = enrichAttendancePresenceRows(siblingRows);
      const currentRow = enrichedRows.find((row: any) => String(row?.id || '') === String(id));
      if (!currentRow?.presence_minutes && !currentRow?.presence_hours) return;
      setData((prev: any) => ({
        ...(prev || {}),
        presence_minutes: currentRow.presence_minutes ?? prev?.presence_minutes,
        presence_hours: currentRow.presence_hours ?? prev?.presence_hours,
      }));
    };

    void run();
  }, [
    data,
    displayData?.assignee_id,
    displayData?.attendance_date,
    displayData?.employee_id,
    displayData?.org_id,
    displayData?.presence_hours,
    displayData?.presence_minutes,
    displayData?.related_profile_id,
    id,
    moduleId,
  ]);
  const conditionalFieldRuntime = useConditionalFieldRuntime(moduleConfig || null, displayData || {});
  
  const [, setLinkedBomData] = useState<any>(null);
  const [currentTags, setCurrentTags] = useState<any[]>([]); // استیت تگ‌ها

  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingFields, setEditingFields] = useState<Record<string, boolean>>({});
  const [tempValues, setTempValues] = useState<Record<string, any>>({});
  const [savingField, setSavingField] = useState<string | null>(null);
  const [, setUploadingImage] = useState(false);
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, any[]>>({});
  const [relationOptions, setRelationOptions] = useState<Record<string, any[]>>({});
  const [, setOptionsReady] = useState(false);
  const hasRecordDataRef = useRef(false);
  const activeRecordRequestRef = useRef(0);
  const recordFetchPromiseRef = useRef<Promise<void> | null>(null);
  const recordFetchKeyRef = useRef<string>('');
  const skipNextOptionsFetchRef = useRef(false);
  const [fieldPermissions, setFieldPermissions] = useState<Record<string, boolean>>({});
  const [modulePermissions, setModulePermissions] = useState<{ view?: boolean; edit?: boolean; delete?: boolean; record_scope?: RecordScope }>({});
  const [currentPermissionMap, setCurrentPermissionMap] = useState<PermissionMap | null>(null);
  const [currentSoftwareRole, setCurrentSoftwareRole] = useState<string | null>(null);
  const [isCreateOrderOpen, setIsCreateOrderOpen] = useState(false);
  const [autoSyncedBomId, setAutoSyncedBomId] = useState<string | null>(null);
  const [autoSyncedProcessTemplateId, setAutoSyncedProcessTemplateId] = useState<string | null>(null);
  const [processTemplateFieldOptions, setProcessTemplateFieldOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [hasStartedProcessExecution, setHasStartedProcessExecution] = useState(false);
  const [processRuntimeSnapshot, setProcessRuntimeSnapshot] = useState<ProcessRuntimeSnapshot | null>(null);
  const bomCopyPromptRef = useRef<string | null>(null);
  const processTemplatePromptRef = useRef<string | null>(null);
  const handledProcessLinksRequestRef = useRef('');
  const processDraftFieldKey = useMemo(() => {
    if (!moduleConfig?.fields?.length) return null;
    const hasProcessTemplateField = moduleConfig.fields.some((f: any) => String(f?.key || '') === 'process_template_id');
    if (!hasProcessTemplateField) return null;
    const knownDraftKeys = ['execution_process_draft', 'marketing_process_draft', 'production_stages_draft'];
    return knownDraftKeys.find((key) => moduleConfig.fields.some((f: any) => String(f?.key || '') === key)) || null;
  }, [moduleConfig?.fields]);
  useEffect(() => {
    if (!openProcessLinksRequest || loading || !data?.id || !processDraftFieldKey || typeof window === 'undefined') return;
    const requestKey = `${moduleId}:${id}:${openProcessLinksRequest.groupId || ''}:${openProcessLinksRequest.templateId || ''}`;
    if (handledProcessLinksRequestRef.current === requestKey) return;
    const timeoutId = window.setTimeout(() => {
      handledProcessLinksRequestRef.current = requestKey;
      document.getElementById(`process-section-${String(moduleId)}-${String(id || '')}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.dispatchEvent(new CustomEvent('kalamapp:open-process-append', {
        detail: {
          moduleId: String(moduleId),
          recordId: String(id || ''),
          mode: 'links',
          group: {
            id: openProcessLinksRequest.groupId,
            templateId: openProcessLinksRequest.templateId,
            stages: [],
          },
        },
      }));
    }, 180);
    return () => window.clearTimeout(timeoutId);
  }, [data?.id, id, loading, moduleId, openProcessLinksRequest, processDraftFieldKey]);
  const [productionModal, setProductionModal] = useState<'start' | 'stop' | 'complete' | null>(null);
  const [productionShelfOptions, setProductionShelfOptions] = useState<{ label: string; value: string }[]>([]);
  const [sourceShelfOptionsByProduct, setSourceShelfOptionsByProduct] = useState<Record<string, { label: string; value: string; stock?: number }[]>>({});
  const [startMaterials, setStartMaterials] = useState<StartMaterialGroup[]>([]);
  const [outputProductOptions, setOutputProductOptions] = useState<{ label: string; value: string; product_type?: string | null }[]>([]);
  const [outputShelfOptions, setOutputShelfOptions] = useState<{ label: string; value: string }[]>([]);
  const [outputProductId, setOutputProductId] = useState<string | null>(null);
  const [outputShelfId, setOutputShelfId] = useState<string | null>(null);
  const [isCreateProductOpen, setIsCreateProductOpen] = useState(false);
  const [isCreateCustomerFromLeadOpen, setIsCreateCustomerFromLeadOpen] = useState(false);
  const [outputProductType, setOutputProductType] = useState<'goods' | null>(null);
  const [outputMode, setOutputMode] = useState<'existing' | 'new'>('existing');
  const [productionQuantityPreview, setProductionQuantityPreview] = useState<number | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [issueAccountingLoading, setIssueAccountingLoading] = useState(false);
  const [accountingEntryPickerOpen, setAccountingEntryPickerOpen] = useState(false);
  const [accountingEntryChoices, setAccountingEntryChoices] = useState<AccountingEntryChoice[]>([]);
  const assigneeLabel = getAssigneeLabel(moduleId);
  const [stockMovementQuickAddSignal, setStockMovementQuickAddSignal] = useState(0);
  const [isTaxpayerModalOpen, setIsTaxpayerModalOpen] = useState(false);
  const [isQuickProjectModalOpen, setIsQuickProjectModalOpen] = useState(false);
  const [quickProjectLoading, setQuickProjectLoading] = useState(false);
  const [quickProjectCustomerOptions, setQuickProjectCustomerOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [quickProjectTemplateOptions, setQuickProjectTemplateOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [quickProjectDynamicOptions, setQuickProjectDynamicOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [quickProjectTargetModuleIds, setQuickProjectTargetModuleIds] = useState<string[]>([]);
  const [quickProjectLinkedRecords, setQuickProjectLinkedRecords] = useState<Record<string, string | null>>({});
  const [quickProjectRelationOptions, setQuickProjectRelationOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [quickProjectRelationLoading, setQuickProjectRelationLoading] = useState<Record<string, boolean>>({});
  const quickProjectSubmitLockRef = useRef(false);
  const [quickProjectForm] = Form.useForm();
  const quickProjectName = Form.useWatch('name', quickProjectForm);
  const quickProjectTemplateId = Form.useWatch('process_template_id', quickProjectForm);
  const quickProjectCustomerId = Form.useWatch('customer_id', quickProjectForm);
  const quickProjectAlignment = Form.useWatch('project_alignment', quickProjectForm);
  const quickProjectNameField = useMemo(() => {
    const projectNameField = (MODULES.projects?.fields || []).find((field: any) => String(field?.key || '') === 'name');
    return (projectNameField || {
      key: 'name',
      labels: { fa: 'عنوان پروژه', en: 'Project Name' },
      type: FieldType.TEXT,
      validation: { required: true },
    }) as any;
  }, []);
  const quickProjectCustomerField = useMemo(() => {
    const projectCustomerField = (MODULES.projects?.fields || []).find((field: any) => String(field?.key || '') === 'customer_id');
    return {
      ...(projectCustomerField || {
        key: 'customer_id',
        labels: { fa: 'مشتری', en: 'Customer' },
        type: FieldType.RELATION,
      }),
      relationConfig: {
        ...((projectCustomerField as any)?.relationConfig || {}),
        targetModule: 'customers',
        targetField: 'full_name',
        disableQuickCreate: true,
      },
    } as any;
  }, []);
  const quickProjectAlignmentField = useMemo(() => {
    const projectAlignmentField = (MODULES.projects?.fields || []).find((field: any) => String(field?.key || '') === 'project_alignment');
    return (projectAlignmentField || {
      key: 'project_alignment',
      labels: { fa: 'دپارتمان‌ها', en: 'Departments' },
      type: FieldType.MULTI_SELECT,
      dynamicOptionsCategory: 'project_alignment',
    }) as any;
  }, []);
  const quickProjectTemplateField = useMemo(() => {
    const projectTemplateField = (MODULES.projects?.fields || []).find((field: any) => String(field?.key || '') === 'process_template_id');
    return {
      ...(projectTemplateField || {
        key: 'process_template_id',
        labels: { fa: 'الگوی فرآیند اجرا', en: 'Execution Template' },
        type: FieldType.RELATION,
      }),
      relationConfig: {
        targetModule: 'process_templates',
        targetField: 'name',
        sourceModules: [
          {
            targetModule: 'process_templates',
            targetField: 'name',
            filter: { module_ids__contains: ['projects'], is_active: true },
          },
          {
            targetModule: 'process_templates',
            targetField: 'name',
            filter: { module_id: 'projects', is_active: true },
          },
        ],
        disableQuickCreate: true,
      },
    } as any;
  }, []);
  const quickProjectModalFields = useMemo(
    () => [
      quickProjectNameField,
      quickProjectCustomerField,
      quickProjectAlignmentField,
      quickProjectTemplateField,
    ].filter(Boolean),
    [quickProjectAlignmentField, quickProjectCustomerField, quickProjectNameField, quickProjectTemplateField]
  );
  const quickProjectDisplayModuleIds = useMemo(
    () => Array.from(new Set([
      ...quickProjectTargetModuleIds,
      ...(moduleId === 'invoices' ? ['invoices'] : []),
      ...(moduleId === 'purchase_invoices' ? ['purchase_invoices'] : []),
      ...(String(quickProjectCustomerId || '').trim() ? ['customers'] : []),
    ])).filter((targetModuleId) =>
      !!MODULES[targetModuleId]
      && !['projects', 'tasks', 'process_templates', 'process_runs'].includes(targetModuleId)
    ),
    [moduleId, quickProjectCustomerId, quickProjectTargetModuleIds]
  );
  const quickProjectLinkedFields = useMemo(
    () => quickProjectDisplayModuleIds.map((targetModuleId) => {
      const moduleTitle = MODULES[targetModuleId]?.titles?.faSingular || MODULES[targetModuleId]?.titles?.fa || targetModuleId;
      const fieldKey = createProcessLinkedFieldKey(targetModuleId, 'id');
      return {
        moduleId: targetModuleId,
        field: {
          key: fieldKey,
          labels: {
            fa: `رکورد مرتبط ${moduleTitle}`,
            en: `Linked ${targetModuleId}`,
          },
          type: FieldType.RELATION,
          relationConfig: { targetModule: targetModuleId },
          nature: 'standard',
        } as any,
      };
    }),
    [quickProjectDisplayModuleIds]
  );
  const quickProjectRelationsLoading = useMemo(
    () => Object.values(quickProjectRelationLoading).some(Boolean),
    [quickProjectRelationLoading]
  );
  const startDraftStorageKey = useMemo(() => (id ? `production-start-draft:${id}` : null), [id]);
  const [canIssueAccountingEntry, setCanIssueAccountingEntry] = useState(true);
  const [botStatusModalOpen, setBotStatusModalOpen] = useState(false);
  const [botStatusModalLoading, setBotStatusModalLoading] = useState(false);
  const [botStatusModalSaving, setBotStatusModalSaving] = useState(false);
  const [botStatusModalContext, setBotStatusModalContext] = useState<BotStatusModalContext | null>(null);
  const [botStatusActiveTab, setBotStatusActiveTab] = useState<BotChannel>('rubika');
  const [botStatusDefaultChannel, setBotStatusDefaultChannel] = useState<BotChannel>('rubika');
  const [botStatusFallbackToActive, setBotStatusFallbackToActive] = useState(false);
  const [botStatusPlatformData, setBotStatusPlatformData] = useState<Record<BotChannel, BotPlatformState>>({
    rubika: { ...DEFAULT_BOT_PLATFORM_STATE },
    telegram: { ...DEFAULT_BOT_PLATFORM_STATE },
    bale: { ...DEFAULT_BOT_PLATFORM_STATE },
  });
  const [botStatusCountdown, setBotStatusCountdown] = useState(0);
  const [botStatusWatchingChannel, setBotStatusWatchingChannel] = useState<BotChannel | null>(null);
  const botStatusWatchTimerRef = useRef<number | null>(null);
    const fetchProductionQuantity = useCallback(async () => {
      if (moduleId !== 'production_orders' || !id) return null;
      const { data: lines } = await supabase
        .from('production_lines')
        .select('quantity, qty, count')
        .eq('production_order_id', id);
      const total = (lines || []).reduce((sum: number, row: any) => {
        const raw = row?.quantity ?? row?.qty ?? row?.count ?? 0;
        return sum + (parseFloat(raw) || 0);
      }, 0);
      return total;
    }, [moduleId, id]);

  useEffect(() => {
    const cacheKey = `${moduleId}:${id || ''}`;
    const cachedSnapshot = moduleShowSnapshotCache.get(cacheKey);
    const cachedOptionSnapshot = readModuleOptionSnapshot(moduleId);
    const hasFreshSnapshot = !!cachedSnapshot && (Date.now() - cachedSnapshot.cachedAt) < MODULE_SHOW_CACHE_TTL_MS;
    hasRecordDataRef.current = false;
    skipNextOptionsFetchRef.current = false;
    setData(hasFreshSnapshot ? cachedSnapshot?.record ?? null : null);
    setLoading(!hasFreshSnapshot);
    setAutoSyncedBomId(null);
    setAutoSyncedProcessTemplateId(null);
    setProcessTemplateFieldOptions([]);
    setHasStartedProcessExecution(false);
    setProcessRuntimeSnapshot(null);
    setDynamicOptions(cachedOptionSnapshot?.dynamicOptions || {});
    setRelationOptions(cachedOptionSnapshot?.relationOptions || {});
    setOptionsReady(!!cachedOptionSnapshot);
    setCurrentTags(hasFreshSnapshot ? cachedSnapshot?.tags ?? [] : []);
    setAccessDenied(false);
    const inlineDraft = readModuleShowInlineDraft(inlineDraftStorageKey);
    setEditingFields(inlineDraft?.editingFields || {});
    setTempValues(inlineDraft?.values || {});
    hasRecordDataRef.current = hasFreshSnapshot;
  }, [id, inlineDraftStorageKey, moduleId]);

  useEffect(() => {
    if (!inlineDraftStorageKey) return;
    const activeKeys = Object.keys(editingFields || {}).filter((key) => editingFields[key]);
    if (activeKeys.length === 0) {
      clearModuleShowInlineDraft(inlineDraftStorageKey);
      return;
    }
    const draftValues = activeKeys.reduce<Record<string, any>>((acc, key) => {
      if (Object.prototype.hasOwnProperty.call(tempValues || {}, key)) {
        acc[key] = tempValues[key];
      }
      return acc;
    }, {});
    writeModuleShowInlineDraft(inlineDraftStorageKey, draftValues, editingFields);
  }, [editingFields, inlineDraftStorageKey, tempValues]);

  useEffect(() => {
    hasRecordDataRef.current = !!data;
  }, [data]);

  const readOrderQuantity = useCallback((record: any, override?: number | null) => {
    const raw = override ?? record?.quantity ?? record?.production_qty ?? record?.production_quantity ?? record?.qty ?? record?.count ?? 0;
    const parsed = parseFloat(raw as any);
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);

  const getOrderQuantity = useCallback((override?: number | null) => {
    return readOrderQuantity(data, override);
  }, [data, readOrderQuantity]);

  const resolveProductionQuantity = useCallback(async (record?: any) => {
    const qtyFromRecord = readOrderQuantity(record ?? data);
    if (qtyFromRecord > 0) return qtyFromRecord;
    const qtyFromLines = await fetchProductionQuantity();
    if (typeof qtyFromLines === 'number' && qtyFromLines > 0) return qtyFromLines;
    return 0;
  }, [data, fetchProductionQuantity, readOrderQuantity]);

  const filteredOutputProductOptions = useMemo(() => {
    if (!outputProductType) return outputProductOptions;
    return outputProductOptions.filter((item) => String(item?.product_type || '') === outputProductType);
  }, [outputProductOptions, outputProductType]);

  const categoryLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    const gridBlock = moduleConfig?.blocks?.find((block: any) => block?.id === 'grid_materials') as any;
    const categories = gridBlock?.gridConfig?.categories || [];
    categories.forEach((category: any) => {
      const key = String(category?.value || '');
      if (!key) return;
      map.set(key, category?.label || key);
    });
    return map;
  }, [moduleConfig, moduleId]);

  const productMetaMap = useMemo(() => {
    const map = new Map<string, { name: string; system_code: string }>();
    const products = relationOptions?.products || [];
    products.forEach((product: any) => {
      const id = String(product?.value || '');
      if (!id) return;
      const label = String(product?.label || '').trim();
      const hyphenIndex = label.indexOf(' - ');
      let systemCode = '';
      let name = label || id;
      if (hyphenIndex > 0) {
        systemCode = label.slice(0, hyphenIndex).trim();
        name = label.slice(hyphenIndex + 3).trim() || label;
      }
      map.set(id, {
        name,
        system_code: systemCode,
      });
    });
    return map;
  }, [relationOptions]);

  const toNumber = _msToNumber;
  const calcDeliveredQty = _msCalcDeliveredQty;
  const sumDeliveredRows = _msSumDeliveredRows;
  const buildDeliveryRowKey = _msBuildDeliveryRowKey;
  const normalizeDeliveryRow = _msNormalizeDeliveryRow;
  const recalcStartGroup = _msRecalcStartGroup;

  const getRowSelectedProduct = useCallback((row: any) => {
    const header = row?.header || {};
    const pieces = Array.isArray(row?.pieces) ? row.pieces : [];

    const selectedProductId =
      header?.selected_product_id ||
      row?.selected_product_id ||
      row?.product_id ||
      pieces.find((piece: any) => piece?.selected_product_id || piece?.product_id)?.selected_product_id ||
      pieces.find((piece: any) => piece?.selected_product_id || piece?.product_id)?.product_id ||
      null;

    const selectedProductMeta = selectedProductId ? productMetaMap.get(String(selectedProductId)) : null;
    const selectedProductName =
      header?.selected_product_name ||
      row?.selected_product_name ||
      row?.product_name ||
      selectedProductMeta?.name ||
      '-';
    const selectedProductCode =
      header?.selected_product_code ||
      row?.selected_product_code ||
      row?.product_system_code ||
      selectedProductMeta?.system_code ||
      '';

    return {
      selectedProductId: selectedProductId ? String(selectedProductId) : null,
      selectedProductName: String(selectedProductName || '-'),
      selectedProductCode: String(selectedProductCode || ''),
    };
  }, [productMetaMap]);

  const buildStartMaterialsDraft = useCallback((order: any, quantity: number): StartMaterialGroup[] => {
    const rows = Array.isArray(order?.grid_materials) ? order.grid_materials : [];
    const normalizedOrderQty = quantity > 0 ? quantity : 1;
    return rows
      .map((row: any, rowIndex: number) => {
        const categoryValue = String(row?.header?.category || '');
        const categoryLabel = categoryLabelMap.get(categoryValue) || categoryValue || 'بدون دسته‌بندی';
        const rowPieces = Array.isArray(row?.pieces) && row.pieces.length > 0 ? row.pieces : [row];
        const pieces: StartMaterialPiece[] = rowPieces
          .map((piece: any, pieceIndex: number) => {
            const totalUsageRaw = toNumber(piece?.total_usage);
            const perItemUsageRaw = toNumber(piece?.final_usage);
            const perItemUsage = perItemUsageRaw > 0
              ? perItemUsageRaw
              : (totalUsageRaw > 0 ? totalUsageRaw / normalizedOrderQty : 0);
            const totalUsage = totalUsageRaw > 0
              ? totalUsageRaw
              : perItemUsage * normalizedOrderQty;
            const subPerItemUsageRaw = toNumber(piece?.qty_sub);
            const subUsage = subPerItemUsageRaw > 0
              ? subPerItemUsageRaw * normalizedOrderQty
              : 0;
            return {
              key: `${String(piece?.key || 'piece')}_${rowIndex}_${pieceIndex}`,
              name: String(piece?.name || `قطعه ${pieceIndex + 1}`),
              length: toNumber(piece?.length),
              width: toNumber(piece?.width),
              quantity: toNumber(piece?.quantity),
              totalQuantity: toNumber(piece?.quantity) * normalizedOrderQty,
              mainUnit: String(piece?.main_unit || row?.header?.main_unit || ''),
              subUnit: String(piece?.sub_unit || ''),
              subUsage,
              perItemUsage,
              totalUsage,
            } as StartMaterialPiece;
          });

        const totalPerItemUsage = pieces.reduce((sum: number, piece: StartMaterialPiece) => sum + piece.perItemUsage, 0);
        const totalUsage = pieces.reduce((sum: number, piece: StartMaterialPiece) => sum + piece.totalUsage, 0);
        const { selectedProductId, selectedProductName, selectedProductCode } = getRowSelectedProduct(row);
        const sourceShelfId =
          row?.selected_shelf_id ||
          row?.shelf_id ||
          rowPieces.find((piece: any) => piece?.selected_shelf_id || piece?.shelf_id)?.selected_shelf_id ||
          rowPieces.find((piece: any) => piece?.selected_shelf_id || piece?.shelf_id)?.shelf_id ||
          null;
        return {
          key: `${String(row?.key || 'group')}_${rowIndex}`,
          rowIndex,
          categoryLabel,
          selectedProductId,
          selectedProductName,
          selectedProductCode,
          sourceShelfId: sourceShelfId ? String(sourceShelfId) : null,
          productionShelfId: order?.production_shelf_id || null,
          pieces,
          deliveryRows: [],
          totalPerItemUsage,
          totalUsage,
          totalDeliveredQty: 0,
          collapsed: rowIndex !== 0,
          isConfirmed: false,
        } as StartMaterialGroup;
      })
      .filter((group: StartMaterialGroup) => group.pieces.length > 0);
  }, [categoryLabelMap, getRowSelectedProduct]);

  const askStartWarning = useCallback((content: string) => {
    return new Promise<boolean>((resolve) => {
      modal.confirm({
        title: 'تایید ادامه',
        content,
        okText: 'ادامه',
        cancelText: 'انصراف',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }, [modal]);

  const isConfiguredMaterialRow = useCallback((row: any) => {
    const category = String(row?.header?.category || '').trim();
    const { selectedProductId } = getRowSelectedProduct(row);
    const pieces = Array.isArray(row?.pieces) ? row.pieces : [];
    const hasPieceData = pieces.some((piece: any) => {
      const name = String(piece?.name || '').trim();
      const length = toNumber(piece?.length);
      const width = toNumber(piece?.width);
      const quantity = toNumber(piece?.quantity);
      const usage = toNumber(piece?.final_usage ?? piece?.total_usage);
      return name.length > 0 || length > 0 || width > 0 || usage > 0 || quantity > 1;
    });
    return !!category || !!selectedProductId || hasPieceData;
  }, [getRowSelectedProduct]);

  const addStartDeliveryRow = useCallback((groupIndex: number) => {
    setStartMaterials((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      const deliveryRows = Array.isArray(group.deliveryRows) ? [...group.deliveryRows] : [];
      deliveryRows.push(normalizeDeliveryRow(group));
      next[groupIndex] = recalcStartGroup({ ...group, deliveryRows, isConfirmed: false });
      return next;
    });
  }, []);

  const deleteStartDeliveryRows = useCallback((groupIndex: number, rowKeys: string[]) => {
    if (!rowKeys.length) return;
    const keySet = new Set(rowKeys.map((key) => String(key)));
    setStartMaterials((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      const deliveryRows = (group.deliveryRows || []).filter((row) => !keySet.has(String(row.key)));
      next[groupIndex] = recalcStartGroup({ ...group, deliveryRows, isConfirmed: false });
      return next;
    });
  }, []);

  const transferStartDeliveryRows = useCallback((
    sourceGroupIndex: number,
    rowKeys: string[],
    targetGroupIndex: number,
    mode: 'copy' | 'move'
  ) => {
    if (!rowKeys.length) return;
    setStartMaterials((prev) => {
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
        normalizeDeliveryRow(targetGroup, {
          ...row,
          key: buildDeliveryRowKey(),
          pieceKey: undefined,
        })
      );

      const nextTargetRows = [...(targetGroup.deliveryRows || []), ...copiedRows];
      next[targetGroupIndex] = recalcStartGroup({
        ...targetGroup,
        deliveryRows: nextTargetRows,
        isConfirmed: false,
      });

      if (mode === 'move') {
        const nextSourceRows = sourceRows.filter((row) => !keySet.has(String(row.key)));
        next[sourceGroupIndex] = recalcStartGroup({
          ...sourceGroup,
          deliveryRows: nextSourceRows,
          isConfirmed: false,
        });
      }

      return next;
    });
  }, []);

  const updateStartDeliveryRowField = useCallback((
    groupIndex: number,
    rowKey: string,
    field: keyof Omit<StartMaterialDeliveryRow, 'key'>,
    value: any
  ) => {
    setStartMaterials((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      const deliveryRows = [...(group.deliveryRows || [])];
      const rowIndex = deliveryRows.findIndex((row) => String(row.key) === String(rowKey));
      if (rowIndex < 0) return prev;
      const currentRow = deliveryRows[rowIndex];
      const numericFields: Array<keyof Omit<StartMaterialDeliveryRow, 'key'>> = ['length', 'width', 'quantity'];
      const nextValue = numericFields.includes(field)
        ? Math.max(0, toNumber(value))
        : (value == null ? '' : String(value));
      const updatedRow = { ...currentRow, [field]: nextValue };
      deliveryRows[rowIndex] = { ...updatedRow, deliveredQty: calcDeliveredQty(updatedRow) };
      next[groupIndex] = recalcStartGroup({ ...group, deliveryRows, isConfirmed: false });
      return next;
    });
  }, []);

  const setStartMaterialCollapsed = useCallback((groupIndex: number, collapsed: boolean) => {
    setStartMaterials((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      next[groupIndex] = { ...group, collapsed };
      return next;
    });
  }, []);

  const setStartMaterialSourceShelf = useCallback((groupIndex: number, shelfId: string | null) => {
    setStartMaterials((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      next[groupIndex] = { ...group, sourceShelfId: shelfId, isConfirmed: false };
      return next;
    });
  }, []);

  const handleSourceShelfScan = useCallback((groupIndex: number, shelfId: string) => {
    const group = startMaterials[groupIndex];
    if (!group) return;
    const productId = group.selectedProductId;
    if (!productId) {
      msg.error('برای این ردیف، محصول انتخاب نشده است.');
      return;
    }
    const validOptions = sourceShelfOptionsByProduct[productId] || [];
    const isAllowed = validOptions.some((option) => option.value === shelfId);
    if (!isAllowed) {
      msg.error('این قفسه برای محصول انتخاب‌شده موجودی ندارد.');
      return;
    }
    setStartMaterialSourceShelf(groupIndex, shelfId);
  }, [msg, setStartMaterialSourceShelf, sourceShelfOptionsByProduct, startMaterials]);

  const setStartMaterialProductionShelf = useCallback((groupIndex: number, shelfId: string | null) => {
    setStartMaterials((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      next[groupIndex] = { ...group, productionShelfId: shelfId, isConfirmed: false };
      return next;
    });
  }, []);

  const readStartDraft = useCallback(() => {
    if (!startDraftStorageKey || typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(startDraftStorageKey);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, [startDraftStorageKey]);

  const writeStartDraft = useCallback((groups: StartMaterialGroup[]) => {
    if (!startDraftStorageKey || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        startDraftStorageKey,
        JSON.stringify({
          groups,
        })
      );
    } catch {
      // ignore storage errors
    }
  }, [startDraftStorageKey]);

  const clearStartDraft = useCallback(() => {
    if (!startDraftStorageKey || typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(startDraftStorageKey);
    } catch {
      // ignore storage errors
    }
  }, [startDraftStorageKey]);

  const buildConsumptionMoves = useCallback((order: any, quantity: number, productionShelfId: string) => {
    const tables = ['items_leather', 'items_lining', 'items_fitting', 'items_accessory'];
    const moves: Array<{ product_id: string; from_shelf_id: string; to_shelf_id: string; quantity: number }> = [];
    tables.forEach((table) => {
      const rows = Array.isArray(order?.[table]) ? order[table] : [];
      rows.forEach((row: any) => {
        const usage = parseFloat(row?.usage ?? row?.quantity ?? row?.qty ?? row?.count ?? 0) || 0;
        if (usage <= 0) return;
        const productId = row?.selected_product_id || row?.product_id;
        if (!productId) return;
        moves.push({
          product_id: productId,
          from_shelf_id: productionShelfId,
          to_shelf_id: productionShelfId,
          quantity: usage * quantity,
        });
      });
    });
    return moves;
  }, []);

  const buildFinalStageConsumptionMoves = useCallback(async () => {
    if (!id) return [] as Array<{ product_id: string; from_shelf_id: string; to_shelf_id: string; quantity: number }>;
    try {
      const { data: taskRows, error } = await supabase
        .from('tasks')
        .select('id, sort_order, production_line_id, production_shelf_id, recurrence_info')
        .eq('related_production_order', id);
      if (error) throw error;

      const tasks = Array.isArray(taskRows) ? taskRows : [];
      if (!tasks.length) return [];

      const byLine = new Map<string, any[]>();
      tasks.forEach((task: any) => {
        const lineKey = String(task?.production_line_id || 'default');
        if (!byLine.has(lineKey)) byLine.set(lineKey, []);
        byLine.get(lineKey)!.push(task);
      });

      const finalMoves: Array<{ product_id: string; from_shelf_id: string; to_shelf_id: string; quantity: number }> = [];
      byLine.forEach((lineTasks) => {
        const ordered = [...lineTasks].sort((a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
        const lastTask = ordered[ordered.length - 1];
        if (!lastTask) return;

        let recurrenceInfo: any = lastTask?.recurrence_info;
        if (typeof recurrenceInfo === 'string') {
          try {
            recurrenceInfo = JSON.parse(recurrenceInfo);
          } catch {
            recurrenceInfo = null;
          }
        }

        const handover = recurrenceInfo?.production_handover;
        const groups = Array.isArray(handover?.groups) ? handover.groups : [];
        const targetShelfId = String(
          handover?.targetShelfId
          || handover?.target_shelf_id
          || lastTask?.production_shelf_id
          || data?.production_shelf_id
          || ''
        );
        if (!targetShelfId || !groups.length) return;

        groups.forEach((group: any) => {
          const pieces = Array.isArray(group?.pieces) ? group.pieces : [];
          const selectedPiece = pieces.find((piece: any) => piece?.selectedProductId || piece?.selected_product_id || piece?.product_id) || null;
          const productId = String(
            group?.selectedProductId
            || group?.selected_product_id
            || selectedPiece?.selectedProductId
            || selectedPiece?.selected_product_id
            || selectedPiece?.product_id
            || ''
          );
          if (!productId) return;
          const qty = pieces.reduce((sum: number, piece: any) => {
            const raw = piece?.handoverQty ?? piece?.handover_qty ?? piece?.sourceQty ?? piece?.source_qty ?? 0;
            const value = parseFloat(raw);
            return sum + (Number.isFinite(value) ? value : 0);
          }, 0);
          if (!qty || qty <= 0) return;
          finalMoves.push({
            product_id: productId,
            from_shelf_id: targetShelfId,
            to_shelf_id: targetShelfId,
            quantity: qty,
          });
        });
      });

      return finalMoves;
    } catch (err) {
      console.warn('Could not build final stage consumption moves', err);
      return [] as Array<{ product_id: string; from_shelf_id: string; to_shelf_id: string; quantity: number }>;
    }
  }, [data?.production_shelf_id, id]);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRoleId, setCurrentUserRoleId] = useState<string | null>(null);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [allowedRoleIds, setAllowedRoleIds] = useState<string[]>([]);
  const [allowedUserIds, setAllowedUserIds] = useState<string[]>([]);
  const [accessDenied, setAccessDenied] = useState(false);

  const [printShareModalOpen, setPrintShareModalOpen] = useState(false);
  const [printShareTemplateModalOpen, setPrintShareTemplateModalOpen] = useState(false);
  const [printShareTargetIds, setPrintShareTargetIds] = useState<string[]>([]);
  const [printShareSubmitting, setPrintShareSubmitting] = useState(false);
  const [printShareGroups, setPrintShareGroups] = useState<Array<{
    id: string;
    name: string;
    user_ids: string[];
    role_ids: string[];
  }>>([]);
  const [printShareBotGroups, setPrintShareBotGroups] = useState<Array<{
    id: string;
    title: string;
    channel_type: 'telegram' | 'bale' | 'rubika';
    bot_chat_id: string;
    customer_id: string | null;
    supplier_id: string | null;
  }>>([]);
  const [pendingPrintShareFile, setPendingPrintShareFile] = useState<{ url: string; name: string } | null>(null);
  const [printShareMessageText, setPrintShareMessageText] = useState('');
  const [isOnlineCatalogManagerOpen, setIsOnlineCatalogManagerOpen] = useState(false);

  const mergeUsersById = _msMergeUsersById;

  const fetchBaseInfo = useCallback(async () => {
      if (moduleShowBaseInfoCache) {
        setAllUsers((prev) => {
          const mergedUsers = mergeUsersById([...prev, ...moduleShowBaseInfoCache!.users]);
          writeModuleOptionSnapshot(moduleId, { allUsers: mergedUsers });
          return mergedUsers;
        });
        setAllRoles(moduleShowBaseInfoCache.roles);
        writeModuleOptionSnapshot(moduleId, { allRoles: moduleShowBaseInfoCache.roles });
        return;
      }

      if (!moduleShowBaseInfoPromise) {
        moduleShowBaseInfoPromise = (async () => {
          const directory = await fetchAssigneeDirectory(supabase);
          moduleShowBaseInfoCache = {
            users: directory.users || [],
            roles: directory.roles || [],
          };
          return moduleShowBaseInfoCache;
        })().finally(() => {
          moduleShowBaseInfoPromise = null;
        });
      }

      const directory = await moduleShowBaseInfoPromise;
      setAllUsers((prev) => {
        const mergedUsers = mergeUsersById([...prev, ...directory.users]);
        writeModuleOptionSnapshot(moduleId, { allUsers: mergedUsers });
        return mergedUsers;
      });
      setAllRoles(directory.roles);
      writeModuleOptionSnapshot(moduleId, { allRoles: directory.roles });
  }, [moduleId]);

  const ensureUserLabels = useCallback(async (userIds: Array<string | null | undefined>) => {
    const normalizedIds = Array.from(
      new Set(userIds.map((item) => String(item || '').trim()).filter(Boolean))
    );
    if (!normalizedIds.length) return;

    const missingIds = normalizedIds.filter((id) => !allUsers.some((user) => String(user?.id || '') === id));
    if (!missingIds.length) return;

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, mobile_1, avatar_url')
      .in('id', missingIds);
    if (error || !profiles?.length) return;

    const normalizedProfiles = (profiles || []).map((user: any) => ({
      ...user,
      full_name:
        String(user?.full_name || '').trim() ||
        String(user?.email || '').trim() ||
        String(user?.mobile_1 || '').trim() ||
        `کاربر ${String(user?.id || '').slice(0, 8)}`,
    }));

    setAllUsers((prev) => {
      const mergedUsers = mergeUsersById([...prev, ...normalizedProfiles]);
      writeModuleOptionSnapshot(moduleId, { allUsers: mergedUsers });
      return mergedUsers;
    });
  }, [allUsers, moduleId]);

  const fetchRecord = useCallback((force = false) => {
    if (!id || !moduleConfig) return;
    const fetchKey = `${moduleId}:${id}`;
    if (!force && recordFetchPromiseRef.current && recordFetchKeyRef.current === fetchKey) {
      return recordFetchPromiseRef.current;
    }
    const requestId = activeRecordRequestRef.current + 1;
    activeRecordRequestRef.current = requestId;
    setLoading((prev) => (hasRecordDataRef.current ? prev : true));
    const run = (async () => {
      try {
        const recordProjection = buildModuleRecordProjection(moduleConfig);
        const recordResult = await runSelectWithCompatibleColumns<any | null>({
          cacheKey: `module-show:${moduleId}`,
          columns: recordProjection.initialColumns,
          execute: (selectExpr) => supabase
            .from(moduleTable)
            .select(selectExpr)
            .eq('id', id)
            .maybeSingle(),
        });
        const record = recordResult.data;
        const error = recordResult.error;

        if (error && String(error.code) !== 'PGRST116') throw error;
        if (activeRecordRequestRef.current !== requestId) return;
        if (!record) {
          if (moduleId === 'products') {
            const { data: billboardRecord, error: billboardError } = await supabase
              .from('billboards')
              .select('id')
              .eq('id', id)
              .maybeSingle();
            if (billboardError && String(billboardError.code) !== 'PGRST116') throw billboardError;
            if (billboardRecord?.id) {
              navigate(`/billboards/${id}`, { replace: true });
              return;
            }
          }
          if (activeRecordRequestRef.current !== requestId) return;
          setData(null);
          msg.error('رکورد موردنظر یافت نشد یا حذف شده است.');
          return;
        }

        let nextRecord: any = normalizeModuleFormValues(moduleId, record);
        if (moduleId === 'products') {
          const mainUnit = nextRecord?.main_unit;
          const subUnit = nextRecord?.sub_unit;
          const stockValue = parseFloat(nextRecord?.stock) || 0;
          if (mainUnit && subUnit) {
            const computedSubStock = convertArea(stockValue, mainUnit, subUnit);
            if (Number.isFinite(computedSubStock)) {
              nextRecord = { ...nextRecord, sub_stock: computedSubStock };
            }
          }
        }
        if (moduleId === 'process_templates') {
          nextRecord = syncProcessTemplateTargetModules(nextRecord);
          const { data: templateStages } = await supabase
            .from('process_template_stages')
            .select('id, stage_name, sort_order, wage, default_assignee_id, default_assignee_role_id, metadata')
            .eq('template_id', id)
            .order('sort_order', { ascending: true });
          nextRecord = {
            ...nextRecord,
            template_stages_preview: (templateStages || []).map((stage: any, index: number) => ({
              ...(stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {}),
              id: stage.id || `${id}_${index + 1}`,
              name: stage.stage_name || `مرحله ${index + 1}`,
              sort_order: stage.sort_order || ((index + 1) * 10),
              wage: stage.wage || 0,
              weight: Number(stage?.metadata?.weight || 0),
              duration_value: Number(stage?.metadata?.duration_value || 0),
              duration_unit: stage?.metadata?.duration_unit || 'day',
              duration_from: stage?.metadata?.duration_from || 'project_start',
              default_assignee_id: stage.default_assignee_id || null,
              default_assignee_role_id: stage.default_assignee_role_id || null,
              template_stage_id: stage.id || null,
            })),
          };
        }
        if (moduleId === 'process_runs') {
          const { data: runStages } = await supabase
            .from('process_run_stages')
            .select('id, stage_name, sort_order, status, wage, assignee_user_id, assignee_role_id, task_id, metadata')
            .eq('process_run_id', id)
            .order('sort_order', { ascending: true });
          nextRecord = {
            ...nextRecord,
            run_stages_preview: (runStages || []).map((stage: any, index: number) => ({
              ...(stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {}),
              id: stage.id || `${id}_${index + 1}`,
              name: stage.stage_name || `مرحله ${index + 1}`,
              sort_order: stage.sort_order || ((index + 1) * 10),
              status: stage.status || 'todo',
              wage: stage.wage || 0,
              weight: Number(stage?.metadata?.weight || 0),
              duration_value: Number(stage?.metadata?.duration_value || 0),
              duration_unit: stage?.metadata?.duration_unit || 'day',
              duration_from: stage?.metadata?.duration_from || 'project_start',
              assignee_id: stage.assignee_user_id || null,
              assignee_role_id: stage.assignee_role_id || null,
              assignee_type: stage.assignee_role_id ? 'role' : (stage.assignee_user_id ? 'user' : null),
              process_run_stage_id: stage.id || null,
              task_id: stage.task_id || null,
            })),
          };
        }
        if (moduleId === 'tasks') {
          nextRecord = withProcessTaskCustomFieldValues(normalizeTaskSourceValues(nextRecord));
        }
        if (moduleId === 'surveys') {
          nextRecord = mergeSurveyTemplateValuesIntoRecord(nextRecord) || nextRecord;
        }
        try {
          const nextLockState = await fetchRecordLockState(moduleId, id);
          nextRecord = mergeRecordLockIntoRecord(nextRecord, nextLockState);
        } catch (lockError) {
          console.warn('Could not load record lock state', lockError);
          nextRecord = mergeRecordLockIntoRecord(nextRecord, null);
        }
        if (activeRecordRequestRef.current !== requestId) return;
        skipNextOptionsFetchRef.current = true;
        setData(nextRecord);
        void fetchOptions(nextRecord, requestId);
        if (recordProjection.deferredProcessDraftColumns.length > 0) {
          void runSelectWithCompatibleColumns<any | null>({
            cacheKey: `module-show-process-drafts:${moduleId}`,
            columns: ['id', ...recordProjection.deferredProcessDraftColumns],
            execute: (selectExpr) => supabase
              .from(moduleTable)
              .select(selectExpr)
              .eq('id', id)
              .maybeSingle(),
          }).then((draftResult) => {
            if (activeRecordRequestRef.current !== requestId || draftResult.error || !draftResult.data) return;
            const draftPatch = recordProjection.deferredProcessDraftColumns.reduce<Record<string, any>>((patch, key) => {
              if (Object.prototype.hasOwnProperty.call(draftResult.data, key)) patch[key] = draftResult.data[key];
              return patch;
            }, {});
            if (Object.keys(draftPatch).length === 0) return;
            const mergedRecord = { ...nextRecord, ...draftPatch };
            skipNextOptionsFetchRef.current = true;
            setData((previous: any) => ({ ...(previous || {}), ...draftPatch }));
            void fetchOptions(mergedRecord, requestId);
          }).catch((draftError) => {
            console.warn('Could not load process draft snapshot for ModuleShow', draftError);
          });
        }
        void (async () => {
          const { data: tagsData } = await supabase
            .from('record_tags')
            .select('tags(id, title, color)')
            .eq('record_id', id);
          if (activeRecordRequestRef.current !== requestId) return;
          const tags = tagsData?.map((item: any) => item.tags).filter(Boolean) || [];
          moduleShowSnapshotCache.set(fetchKey, {
            record: nextRecord,
            tags,
            cachedAt: Date.now(),
          });
          setCurrentTags(tags);
        })();
    } catch (err: any) {
        const abortLike = String(err?.name || '').toLowerCase() === 'aborterror'
          || String(err?.message || '').toLowerCase().includes('signal is aborted');
        if (!abortLike) {
          const code = String(err?.code || '');
          const rawMessage = String(err?.message || '');
          const missingRow = code === 'PGRST116' || /0 rows/i.test(rawMessage);
          if (missingRow) {
            msg.error('رکورد موردنظر یافت نشد یا حذف شده است.');
            return;
          }
          console.error(err);
          msg.error(toFaErrorMessage(err, 'خطا در دریافت رکورد.'));
        }
    } finally {
        if (activeRecordRequestRef.current === requestId) {
          setLoading(false);
        }
      }
    })().finally(() => {
      if (recordFetchKeyRef.current === fetchKey) {
        recordFetchPromiseRef.current = null;
        recordFetchKeyRef.current = '';
      }
    });
    recordFetchKeyRef.current = fetchKey;
    recordFetchPromiseRef.current = run;
    return run;
  }, [id, moduleConfig, moduleId, msg, navigate]);

  useEffect(() => {
    if (!id) return;
    const timer = window.setTimeout(() => {
      void fetchBaseInfo();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [id, fetchBaseInfo]);

  useEffect(() => {
    void fetchRecord();
  }, [fetchRecord]);

  useEffect(() => {
    void ensureUserLabels([data?.created_by, data?.updated_by, data?.assignee_type === 'user' ? data?.assignee_id : null]);
  }, [data?.created_by, data?.updated_by, data?.assignee_id, data?.assignee_type, ensureUserLabels]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [id, moduleId]);

  useEffect(() => {
    if (!data) {
      setAccessDenied(false);
      return;
    }
    const recordScope = modulePermissions.record_scope ?? (modulePermissions.view === false ? 'own' : 'all');
    const hasModuleViewAccess = modulePermissions.view !== false || recordScope !== 'all';
    const scopedAccess = canAccessAssignedRecord(data, currentUserId, currentUserRoleId, recordScope, {
      currentOrgId,
      allowedRoleIds,
      allowedUserIds,
    });
    setAccessDenied(!hasModuleViewAccess || !scopedAccess);
  }, [allowedRoleIds, allowedUserIds, currentOrgId, currentUserId, currentUserRoleId, data, modulePermissions.record_scope, modulePermissions.view]);

  const loadProductionShelves = useCallback(async () => {
    const { data: shelves } = await supabase
      .from('shelves')
      .select('id, shelf_number, name, warehouses(name)')
      .limit(500);
    const filtered = (shelves || []).filter((row: any) => {
      const name = row?.warehouses?.name || '';
      return name.includes('تولید') || /production/i.test(name);
    });
    const options = (filtered.length ? filtered : (shelves || [])).map((row: any) => ({
      value: row.id,
      label: `${row.shelf_number || row.name || row.id}${row?.warehouses?.name ? ` - ${row.warehouses.name}` : ''}`
    }));
    setProductionShelfOptions(options);
  }, []);

  const loadSourceShelvesByProduct = useCallback(async (productIds: string[]) => {
    if (!productIds.length) {
      setSourceShelfOptionsByProduct({});
      return;
    }
    const { data: inventoryRows } = await supabase
      .from('product_inventory')
      .select('product_id, shelf_id, stock')
      .in('product_id', productIds)
      .gt('stock', 0);

    const rows = (inventoryRows || []).filter((row: any) => row?.product_id && row?.shelf_id);
    const shelfIds = Array.from(new Set(rows.map((row: any) => String(row.shelf_id))));
    let shelfMap = new Map<string, { label: string; isProductionWarehouse: boolean }>();
    if (shelfIds.length > 0) {
      const { data: shelves } = await supabase
        .from('shelves')
        .select('id, shelf_number, name, warehouses(name)')
        .in('id', shelfIds)
        .limit(1000);
      shelfMap = new Map((shelves || []).map((shelf: any) => {
        const warehouseName = String(shelf?.warehouses?.name || '');
        const isProductionWarehouse = warehouseName.includes('تولید') || /production/i.test(warehouseName);
        const label = `${shelf.shelf_number || shelf.name || shelf.id}${warehouseName ? ` - ${warehouseName}` : ''}`;
        return [String(shelf.id), { label, isProductionWarehouse }];
      }));
    }

    const next: Record<string, { label: string; value: string; stock?: number }[]> = {};
    rows.forEach((row: any) => {
      const productId = String(row.product_id);
      const shelfId = String(row.shelf_id);
      const stock = parseFloat(row?.stock) || 0;
      const shelfInfo = shelfMap.get(shelfId);
      if (shelfInfo?.isProductionWarehouse) return;
      const labelBase = shelfInfo?.label || shelfId;
      const label = `${labelBase} (موجودی: ${toPersianNumber(stock)})`;
      if (!next[productId]) next[productId] = [];
      if (!next[productId].some((opt) => opt.value === shelfId)) {
        next[productId].push({ value: shelfId, label, stock });
      }
    });
    setSourceShelfOptionsByProduct(next);
  }, []);

  const loadOutputShelves = useCallback(async () => {
    const { data: shelves } = await supabase
      .from('shelves')
      .select('id, shelf_number, name, warehouses(name)')
      .limit(500);
    const options = (shelves || []).map((row: any) => ({
      value: row.id,
      label: `${row.shelf_number || row.name || row.id}${row?.warehouses?.name ? ` - ${row.warehouses.name}` : ''}`
    }));
    setOutputShelfOptions(options);
  }, []);

  const loadOutputProducts = useCallback(async () => {
    const { data: products } = await supabase
      .from('products')
      .select('id, name, system_code, product_type')
      .limit(500);
    const options = (products || []).map((row: any) => ({
      value: row.id,
      label: row.system_code ? `${row.name} (${row.system_code})` : row.name,
      product_type: row.product_type || null,
    }));
    setOutputProductOptions(options);
  }, []);

  const openProductionModal = async (type: 'start' | 'stop' | 'complete') => {
    if (type === 'start') {
      let modalRecord = data;
      if (moduleId === 'production_orders' && id) {
        try {
          const { data: latestRecord, error: latestError } = await supabase
            .from(moduleTable)
            .select('*')
            .eq('id', id)
            .single();
          if (latestError) throw latestError;
          if (latestRecord) {
            modalRecord = { ...(data || {}), ...latestRecord };
            setData((prev: any) => ({ ...(prev || {}), ...latestRecord }));
          }
        } catch (err) {
          console.warn('Could not refresh production order before opening modal', err);
        }
      }

      const materialRows = Array.isArray(modalRecord?.grid_materials) ? modalRecord.grid_materials : [];
      const configuredRows = materialRows.filter((row: any) => isConfiguredMaterialRow(row));
      const missingProductCount = configuredRows.filter((row: any) => !getRowSelectedProduct(row).selectedProductId).length;
      if (missingProductCount > 0) {
        const shouldContinue = await askStartWarning(
          `برای ${toPersianNumber(missingProductCount)} تعداد از مواد اولیه ای که ثبت کرده اید، محصول انتخاب نشده، آیا ادامه می دهید؟`
        );
        if (!shouldContinue) return;
      }

      const draftStages = Array.isArray(modalRecord?.production_stages_draft)
        ? modalRecord.production_stages_draft.filter((stage: any) => String(stage?.name || stage?.title || '').trim() !== '')
        : [];
      let hasIncompleteDraftStages = false;
      let hasProductionLine = true;
      if (id) {
        const [{ data: tasksData, error: tasksError }, { data: linesData, error: linesError }] = await Promise.all([
          supabase
            .from('tasks')
            .select('id, name, title, production_line_id')
            .eq('related_production_order', id),
          supabase
            .from('production_lines')
            .select('id')
            .eq('production_order_id', id),
        ]);
        if (!linesError) {
          hasProductionLine = Array.isArray(linesData) && linesData.length > 0;
        }
        if (!tasksError && !linesError && hasProductionLine && draftStages.length > 0) {
          const normalizeName = (value: any) => String(value || '').trim().toLowerCase();
          const draftStageNames = draftStages
            .map((stage: any) => normalizeName(stage?.name || stage?.title))
            .filter(Boolean);
          const draftStageNameSet = new Set(draftStageNames);
          const lineCount = Array.isArray(linesData) ? linesData.length : 0;
          const expectedDraftTasksCount = lineCount * draftStageNames.length;
          const createdFromDraftCount = (tasksData || []).filter((task: any) => {
            const taskName = normalizeName(task?.name || task?.title);
            return draftStageNameSet.has(taskName);
          }).length;
          hasIncompleteDraftStages = createdFromDraftCount < expectedDraftTasksCount;
        }
      }
      if (hasIncompleteDraftStages || !hasProductionLine) {
        const shouldContinue = await askStartWarning(
          'برای این سفارش، خط تولید تکمیل نشده و یک یا چند فعالیت در حالت پیش نویس هستند، آیا ادامه می دهید؟'
        );
        if (!shouldContinue) return;
      }

      const resolvedQty = await resolveProductionQuantity({
        ...(modalRecord || {}),
        quantity: data?.quantity ?? modalRecord?.quantity,
      });
      setProductionQuantityPreview(resolvedQty > 0 ? resolvedQty : null);
      const baseGroups = buildStartMaterialsDraft(modalRecord, resolvedQty);
      const selectedProductIds: string[] = Array.from(
        new Set(
          baseGroups
            .map((group) => group.selectedProductId)
            .filter((value): value is string => !!value)
        )
      );
      const fetchedProductMeta = new Map<string, { name: string; system_code: string }>();
      if (selectedProductIds.length > 0) {
        const { data: products } = await supabase
          .from('products')
          .select('id, name, system_code')
          .in('id', selectedProductIds);
        (products || []).forEach((product: any) => {
          fetchedProductMeta.set(String(product.id), {
            name: String(product.name || ''),
            system_code: String(product.system_code || ''),
          });
        });
      }
      const draft = readStartDraft();
      const draftGroups = Array.isArray(draft?.groups) ? draft.groups : [];
      const mergedGroups: StartMaterialGroup[] = baseGroups.map((group: StartMaterialGroup) => {
        const selectedMeta = group.selectedProductId
          ? (fetchedProductMeta.get(group.selectedProductId) || productMetaMap.get(group.selectedProductId))
          : null;
        const savedGroup = draftGroups.find((item: any) => item?.key === group.key);
        const baseWithMeta = {
          ...group,
          selectedProductName: selectedMeta?.name || group.selectedProductName,
          selectedProductCode: selectedMeta?.system_code || group.selectedProductCode,
        };
        if (!savedGroup) return baseWithMeta;
        const savedDeliveryRows = Array.isArray(savedGroup?.deliveryRows) ? savedGroup.deliveryRows : [];
        const deliveryRows: StartMaterialDeliveryRow[] = savedDeliveryRows.map((row: any) =>
          normalizeDeliveryRow(baseWithMeta, row)
        );
        const totalPerItemUsage = baseWithMeta.pieces.reduce((sum: number, piece: StartMaterialPiece) => sum + piece.perItemUsage, 0);
        const totalUsage = baseWithMeta.pieces.reduce((sum: number, piece: StartMaterialPiece) => sum + piece.totalUsage, 0);
        const totalDeliveredQty = sumDeliveredRows(deliveryRows);
        const savedName = typeof savedGroup?.selectedProductName === 'string' && savedGroup.selectedProductName.trim() && savedGroup.selectedProductName !== '-'
          ? savedGroup.selectedProductName
          : null;
        const savedCode = typeof savedGroup?.selectedProductCode === 'string' && savedGroup.selectedProductCode.trim()
          ? savedGroup.selectedProductCode
          : null;
        return {
          ...baseWithMeta,
          deliveryRows,
          totalPerItemUsage,
          totalUsage,
          totalDeliveredQty,
          selectedProductName: savedName || baseWithMeta.selectedProductName,
          selectedProductCode: savedCode || baseWithMeta.selectedProductCode,
          sourceShelfId: savedGroup?.sourceShelfId ?? baseWithMeta.sourceShelfId,
          productionShelfId: savedGroup?.productionShelfId ?? baseWithMeta.productionShelfId,
          collapsed: typeof savedGroup?.collapsed === 'boolean' ? savedGroup.collapsed : baseWithMeta.collapsed,
          isConfirmed: savedGroup?.isConfirmed === true,
        };
      });
      setStartMaterials(mergedGroups);
      await loadProductionShelves();
      await loadSourceShelvesByProduct(selectedProductIds);
      setProductionModal(type);
      return;
    }
    if (type === 'complete') {
      await loadOutputShelves();
      await loadOutputProducts();
      const resolvedQty = await resolveProductionQuantity();
      setProductionQuantityPreview(resolvedQty > 0 ? resolvedQty : null);
      setOutputMode('existing');
      setOutputProductId(null);
      setOutputProductType(null);
      setProductionModal(type);
      return;
    }
    setProductionModal(type);
  };

  const finalizeStatusUpdate = async (payload: any) => {
    if (!id) return;
    const { error } = await supabase.from(moduleTable).update(payload).eq('id', id);
    if (error) throw error;
    setData((prev: any) => ({ ...prev, ...payload }));
  };

  useEffect(() => {
    if (productionModal !== 'start') return;
    writeStartDraft(startMaterials);
  }, [productionModal, startMaterials, writeStartDraft]);

  useEffect(() => {
    if (productionModal !== 'start') return;
    if (productMetaMap.size === 0) return;
    setStartMaterials((prev) =>
      prev.map((group) => {
        if (!group.selectedProductId) return group;
        const meta = productMetaMap.get(group.selectedProductId);
        if (!meta) return group;
        const nextName = group.selectedProductName && group.selectedProductName !== '-' ? group.selectedProductName : meta.name;
        const nextCode = group.selectedProductCode || meta.system_code || '';
        return { ...group, selectedProductName: nextName, selectedProductCode: nextCode };
      })
    );
  }, [productionModal, productMetaMap]);

  const handleProductionStatusChange = async (nextStatus: string) => {
    if (moduleId !== 'production_orders') return;
    if (data?.status === nextStatus) return;
    if (nextStatus === 'in_progress') {
      await openProductionModal('start');
      return;
    }
    if (nextStatus === 'pending') {
      await openProductionModal('stop');
      return;
    }
    if (nextStatus === 'completed') {
      await openProductionModal('complete');
    }
  };

  const fetchFieldPermissions = useCallback(async () => {
    try {
      const context = await fetchCurrentUserRecordAccessContext(supabase);
      setCurrentUserId(context.userId);
      setCurrentUserRoleId(context.roleId);
      setCurrentOrgId(context.orgId);
      setAllowedRoleIds(context.allowedRoleIds);
      setAllowedUserIds(context.allowedUserIds);

      if (!context.roleId) {
        setFieldPermissions({});
        setModulePermissions({});
        setCurrentPermissionMap(context.permissions || null);
        setCurrentSoftwareRole(context.softwareRole || null);
        setCanIssueAccountingEntry(true);
        return;
      }

      const permissions = context.permissions || {};
      setCurrentPermissionMap(permissions);
      setCurrentSoftwareRole(context.softwareRole || null);
      const journalPerms = permissions?.journal_entries || {};

      // برای ماژول‌های SaaS Admin، دسترسی edit از __saas_admin sub-field خوانده می‌شود
      const SAAS_ADMIN_EDIT_MAP: Record<string, string> = {
        saas_orgs: 'edit_orgs',
        saas_demo_requests: 'edit_requests',
        saas_user_announcements: 'edit_user_announcements',
      };
      if (isSaasAdminModuleId(moduleId)) {
        const saasPerms = (permissions?.[SAAS_ADMIN_PERMISSION_KEY] || {}) as Record<string, any>;
        const saasFields = saasPerms.fields || {};
        const editFieldKey = SAAS_ADMIN_EDIT_MAP[moduleId];
        const canViewSaas = saasPerms.view === true || saasPerms.edit === true || (editFieldKey ? saasFields[editFieldKey] === true : false);
        const canEditSaas = canViewSaas && (saasPerms.edit === true || (editFieldKey ? saasFields[editFieldKey] === true : false));
        setFieldPermissions({});
        setModulePermissions({
          view: canViewSaas ? true : false,
          edit: canEditSaas,
          delete: false,
          record_scope: 'all',
        });
        setCanIssueAccountingEntry(false);
        return;
      }

      const modulePerms = permissions?.[moduleId] || {};
      const perms = modulePerms.fields || {};
      setFieldPermissions(perms);
      setModulePermissions({
        view: modulePerms.view,
        edit: modulePerms.edit,
        delete: modulePerms.delete,
        record_scope: (modulePerms.record_scope ?? (modulePerms.view === false ? 'own' : 'all')) as RecordScope,
      });
      setCanIssueAccountingEntry(journalPerms.view !== false && journalPerms.edit !== false);
    } catch (err) {
      if (String((err as any)?.name || '') === 'AbortError') return;
      console.warn('Could not fetch field permissions:', err);
      setCurrentPermissionMap(null);
      setCurrentSoftwareRole(null);
      setCanIssueAccountingEntry(true);
    }
  }, [moduleId]);

  useEffect(() => {
    fetchFieldPermissions();
  }, [fetchFieldPermissions]);

  const canViewField = useCallback(
    (fieldKey: string) => {
      if (Object.prototype.hasOwnProperty.call(fieldPermissions, fieldKey)) {
        return fieldPermissions[fieldKey] !== false;
      }
      return true;
    },
    [fieldPermissions]
  );

  const baseCanEditModule = modulePermissions.edit !== false;
  const baseCanDeleteModule = modulePermissions.delete !== false;
  const canLockCurrentRecord = canUseRecordLockPermission(currentPermissionMap, moduleId, 'lock', currentSoftwareRole);
  const canUnlockCurrentRecord = canUseRecordLockPermission(currentPermissionMap, moduleId, 'unlock', currentSoftwareRole);
  const canEditModule = baseCanEditModule && !isRecordLocked;
  const canDeleteModule = baseCanDeleteModule && !isRecordLocked;



  const fetchLinkedBom = useCallback(async (bomId: string) => {
      const { data: bom } = await supabase.from('production_boms').select('*').eq('id', bomId).single();
      if (bom) setLinkedBomData(bom);
  }, []);

  const fetchOptions = useCallback(async (recordData: any = null, requestId?: number) => {
    if (!moduleConfig) return;
    try {
      const dynFields: any[] = [...moduleConfig.fields.filter(f => (f as any).dynamicOptionsCategory)];
      moduleConfig.blocks?.forEach(b => {
        if (b.tableColumns) {
          b.tableColumns.forEach(c => {
            if ((c.type === FieldType.SELECT || c.type === FieldType.MULTI_SELECT) && (c as any).dynamicOptionsCategory) {
              dynFields.push(c);
            }
          });
        }
      });
      
      const dynCategories = Array.from(
        new Set(
          dynFields
            .map((field) => (field as any).dynamicOptionsCategory as string | undefined)
            .filter(Boolean)
        )
      ) as string[];
      const dynOpts: Record<string, any[]> = await fetchDynamicOptionsMap(supabase, dynCategories);
      try {
        const formulas = await fetchFormulaOptions(supabase);
        if (formulas.length > 0) {
          dynOpts['calculation_formulas'] = formulas;
        }
      } catch (err) {
        console.warn('Could not load calculation formulas', err);
      }
      if (requestId && activeRecordRequestRef.current !== requestId) return;
      setDynamicOptions((prev) => {
        const mergedDynamic = mergeOptionMaps(readModuleOptionSnapshot(moduleId)?.dynamicOptions, prev, dynOpts);
        writeModuleOptionSnapshot(moduleId, { dynamicOptions: mergedDynamic });
        return mergedDynamic;
      });

      const relOpts: Record<string, any[]> = {};
      const normalizedRecordData = normalizeModuleFormValues(
        moduleId,
        moduleId === 'tasks'
          ? normalizeTaskSourceValues(recordData || {})
          : (recordData || {})
      );
      const relationFieldsWithValue = moduleConfig.fields.filter((field) => {
        const relationConfig = field.type === FieldType.MULTI_RELATION
          ? field.multiRelationConfig
          : field.relationConfig;
        if (!relationConfig) return false;
        const rawValue = normalizedRecordData?.[field.key];
        if (Array.isArray(rawValue)) {
          return rawValue.some((item: any) => String(item ?? '').trim() !== '');
        }
        return rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== '';
      });

      const relationRequests: Array<Promise<{
        keys: string[];
        options: any[];
        fieldKey?: string;
        blockId?: string;
        rowIndex?: number;
        relationConfig?: any;
      }>> = relationFieldsWithValue.map(async (field) => {
        const rawValue = normalizedRecordData?.[field.key];
        const exactIds = Array.isArray(rawValue)
          ? Array.from(new Set(rawValue.map((item: any) => String(item ?? '').trim()).filter(Boolean)))
          : (String(rawValue ?? '').trim() ? [String(rawValue).trim()] : []);
        const relationConfig = field.type === FieldType.MULTI_RELATION
          ? field.multiRelationConfig
          : field.relationConfig;
        const effectiveField = field.type === FieldType.MULTI_RELATION
          ? { ...field, relationConfig }
          : field;
        const optionGroups = await Promise.all(
          exactIds.map((exactId) => (
            moduleId === 'tasks' && field.key === 'source_record_id'
              ? fetchTaskSourceRecordOptions(
                  supabase,
                  String(normalizedRecordData?.related_to_module || normalizedRecordData?.source_module_id || '').trim(),
                  {
                    exactId,
                    limit: 1,
                  }
                )
              : fetchRelationOptionsForField(supabase, effectiveField, {
                  allValues: normalizedRecordData,
                  exactId,
                  limit: 1,
                }).catch(() => [])
          ))
        );
        const options = mergeOptionLists(...optionGroups);
        return {
          keys: [field.key],
          options,
          fieldKey: field.key,
          relationConfig,
        };
      });

      if (moduleId === 'projects' && processDraftFieldKey) {
        const draftStages = Array.isArray(normalizedRecordData?.[processDraftFieldKey])
          ? normalizedRecordData[processDraftFieldKey]
          : [];
        const targetModuleIds = normalizeProcessTargetModuleIds(
          draftStages.flatMap((stage: any) => (
            Array.isArray(stage?.process_target_module_ids) ? stage.process_target_module_ids : []
          )),
          ''
        );
        const linkedRecordMap = draftStages.reduce<Record<string, string>>((acc, stage: any) => {
          const rawMap = stage?.process_link_map && typeof stage.process_link_map === 'object'
            ? stage.process_link_map
            : {};
          Object.entries(rawMap).forEach(([targetModuleId, recordId]) => {
            const normalizedTargetModuleId = String(targetModuleId || '').trim();
            const normalizedRecordId = String(recordId || '').trim();
            if (normalizedTargetModuleId && normalizedRecordId && !acc[normalizedTargetModuleId]) {
              acc[normalizedTargetModuleId] = normalizedRecordId;
            }
          });
          return acc;
        }, {});

        targetModuleIds
          .filter((targetModuleId) => !!MODULES[targetModuleId] && !PROJECT_PROCESS_HIDDEN_LINK_MODULE_IDS.has(targetModuleId))
          .forEach((targetModuleId) => {
            const fieldKey = createProcessLinkedFieldKey(targetModuleId, 'id');
            const exactId = linkedRecordMap[targetModuleId];
            // مقصدی که هنوز به رکوردی وصل نشده است، نباید برای پرکردن یک
            // dropdown پنهان صدها رکورد را در زمان بازشدن صفحه دریافت کند.
            if (!exactId) return;
            relationRequests.push((async () => {
              const syntheticField = {
                key: fieldKey,
                type: FieldType.RELATION,
                relationConfig: { targetModule: targetModuleId },
              } as any;
              const options = await fetchRelationOptionsForField(supabase, syntheticField, {
                exactId,
                limit: 1,
              });
              return {
                keys: [fieldKey],
                options,
                relationConfig: syntheticField.relationConfig,
              };
            })());
          });
      }

      (moduleConfig.blocks || []).forEach((block: any) => {
        const blockRows = Array.isArray(normalizedRecordData?.[block.id]) ? normalizedRecordData[block.id] : [];
        if (!block.tableColumns || blockRows.length === 0) return;

        block.tableColumns.forEach((column: any) => {
          if (column?.type !== FieldType.RELATION || !column?.relationConfig) return;

          const specificKey = `${block.id}_${column.key}`;
          const handledValues = new Set<string>();

          blockRows.forEach((row: any) => {
            const exactValue = row?.[column.key];
            const normalizedExactValue = String(exactValue ?? '').trim();
            if (!normalizedExactValue || handledValues.has(normalizedExactValue)) return;
            handledValues.add(normalizedExactValue);

            relationRequests.push((async () => {
              const options = await fetchRelationOptionsForField(supabase, column, {
                allValues: row,
                exactId: exactValue,
                limit: 1,
              });
              return {
                keys: [specificKey, column.key],
                options,
                fieldKey: column.key,
                blockId: block.id,
                rowIndex: blockRows.indexOf(row),
                relationConfig: column.relationConfig,
              };
            })());
          });
        });
      });

      const relationResults = await Promise.allSettled(
        relationRequests.map(async (request) => {
          return request;
        })
      );

      const relationDisplayPatch: Record<string, any> = {};
      const relationBlockPatch: Record<string, any[]> = {};

      const applyResolvedLabel = (
        target: Record<string, any>,
        fieldKey: string,
        relationConfig: any,
        options: any[],
        rawValue: any,
      ) => {
        const normalizedValue = String(rawValue ?? '').trim();
        if (!fieldKey || !normalizedValue) return;

        const matchedOption = (options || []).find((item: any) => String(item?.value || '').trim() === normalizedValue);
        const label = String(matchedOption?.label || '').trim() || 'رکورد حذف شده';
        const baseKey = fieldKey.endsWith('_id') ? fieldKey.slice(0, -3) : fieldKey;
        const targetField = String(relationConfig?.targetField || '').trim();

        target[`${baseKey}_label`] = label;
        target[`${baseKey}_name`] = label;
        if (baseKey === 'customer') {
          target.customer_name = label;
          target.customer_full_name = label;
        }
        if (baseKey === 'product') {
          target.product_name = label;
          target.selected_product_name = target.selected_product_name || label;
        }
        if (targetField) {
          target[`${baseKey}_${targetField}`] = label;
        }
      };

      relationResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          result.value.keys.forEach((key) => {
            relOpts[key] = mergeOptionLists(relOpts[key], result.value.options);
          });

          if (result.value.blockId && Number.isInteger(result.value.rowIndex)) {
            const blockId = String(result.value.blockId);
            const rowIndex = Number(result.value.rowIndex);
            const sourceRows = relationBlockPatch[blockId]
              || (Array.isArray(normalizedRecordData?.[blockId]) ? normalizedRecordData[blockId].map((row: any) => ({ ...(row || {}) })) : []);
            if (sourceRows[rowIndex]) {
              applyResolvedLabel(
                sourceRows[rowIndex],
                String(result.value.fieldKey || ''),
                result.value.relationConfig,
                result.value.options,
                sourceRows[rowIndex]?.[String(result.value.fieldKey || '')],
              );
              relationBlockPatch[blockId] = sourceRows;
            }
          } else if (result.value.fieldKey) {
            applyResolvedLabel(
              relationDisplayPatch,
              String(result.value.fieldKey),
              result.value.relationConfig,
              result.value.options,
              normalizedRecordData?.[String(result.value.fieldKey)],
            );
          }
        } else {
          console.warn('Could not fetch exact relation option for ModuleShow field:', result.reason);
        }
      });
      if (requestId && activeRecordRequestRef.current !== requestId) return;
      const relationDisplayPatchKeys = Object.keys(relationDisplayPatch);
      const relationBlockPatchKeys = Object.keys(relationBlockPatch);
      if (relationDisplayPatchKeys.length > 0 || relationBlockPatchKeys.length > 0) {
        skipNextOptionsFetchRef.current = true;
        setData((prev: any) => ({
          ...(prev || {}),
          ...relationDisplayPatch,
          ...relationBlockPatch,
        }));
      }
      setRelationOptions((prev) => {
        const mergedRelation = mergeOptionMaps(readModuleOptionSnapshot(moduleId)?.relationOptions, prev, relOpts);
        writeModuleOptionSnapshot(moduleId, { relationOptions: mergedRelation });
        return mergedRelation;
      });
    } finally {
      if (requestId && activeRecordRequestRef.current !== requestId) return;
      setOptionsReady(true);
    }
  }, [moduleConfig, moduleId, processDraftFieldKey]);

  useEffect(() => {
    if (moduleId !== 'tasks' || !data || taskProcessCustomFields.length === 0) return;
    void fetchOptions(data);
  }, [data?.recurrence_info, moduleId, taskProcessCustomFields.length]);

  useEffect(() => {
    if (data) {
      if (skipNextOptionsFetchRef.current) {
        skipNextOptionsFetchRef.current = false;
      } else {
        void fetchOptions(data);
      }
      if (moduleId === 'products' && data.production_bom_id) {
        fetchLinkedBom(data.production_bom_id);
      } else if (moduleId === 'production_boms') {
        setLinkedBomData(data); 
      } else {
        setLinkedBomData(null);
      }
    }
  }, [data, moduleId, fetchOptions, fetchLinkedBom]);

  useEffect(() => {
    if (moduleId !== 'production_orders' || !data?.bom_id) return;
    if (autoSyncedBomId === data.bom_id) return;

    const isEmptyArray = (val: any) => !Array.isArray(val) || val.length === 0;
    const shouldSync = isEmptyArray(data?.grid_materials) || isEmptyArray(data?.production_stages_draft);
    if (!shouldSync) return;

    const syncFromBom = async () => {
      try {
        const { data: bom, error } = await supabase
          .from('production_boms')
          .select('name, grid_materials, production_stages_draft, product_category')
          .eq('id', data.bom_id)
          .single();
        if (error) throw error;

        const patch: any = {
          grid_materials: bom?.grid_materials || [],
          production_stages_draft: bom?.production_stages_draft || [],
          product_category: bom?.product_category ?? data?.product_category ?? null,
          name: bom?.name || data?.name || '',
        };

        await supabase.from('production_orders').update(patch).eq('id', data.id);
        setData((prev: any) => ({ ...prev, ...patch }));
        setAutoSyncedBomId(data.bom_id);
      } catch (err) {
        console.warn('همگام‌سازی خودکار از BOM ناموفق بود', err);
      }
    };

    syncFromBom();
  }, [moduleId, data, autoSyncedBomId]);

  useEffect(() => {
    if (!processDraftFieldKey) {
      setProcessTemplateFieldOptions([]);
      return;
    }
    let cancelled = false;
    const loadScopedProcessTemplateOptions = async () => {
      try {
        const { data: templates, error } = await supabase
          .from('process_templates')
          .select('id,name,module_id,module_ids,is_active')
          .order('name', { ascending: true });
        if (error) throw error;
        if (cancelled) return;
        setProcessTemplateFieldOptions(
          (templates || [])
            .filter((row: any) => row?.is_active !== false && doesProcessTemplateSupportModule(row, moduleId))
            .map((row: any) => ({
              value: String(row.id),
              label: String(row?.name || row?.id),
            }))
        );
      } catch (error) {
        console.warn('بارگذاری گزینه‌های الگوی فرآیند ناموفق بود', error);
        if (!cancelled) setProcessTemplateFieldOptions([]);
      }
    };
    void loadScopedProcessTemplateOptions();
    return () => {
      cancelled = true;
    };
  }, [moduleId, processDraftFieldKey]);

  useEffect(() => {
    if (!processDraftFieldKey || !id) {
      setHasStartedProcessExecution(false);
      return;
    }
    if (
      !processRuntimeSnapshot?.loaded
      || processRuntimeSnapshot.moduleId !== moduleId
      || processRuntimeSnapshot.recordId !== String(id || '')
    ) return;
    setHasStartedProcessExecution(processRuntimeSnapshot.hasStartedExecution);
  }, [id, moduleId, processDraftFieldKey, processRuntimeSnapshot]);

  useEffect(() => {
    if (!processDraftFieldKey || !data?.process_template_id || !data?.id) return;
    if (autoSyncedProcessTemplateId === data.process_template_id) return;
    if (
      !processRuntimeSnapshot?.loaded
      || processRuntimeSnapshot.moduleId !== moduleId
      || processRuntimeSnapshot.recordId !== String(data.id)
    ) return;

    const currentDraft = (data as any)?.[processDraftFieldKey];
    const isDraftEmpty = !Array.isArray(currentDraft) || currentDraft.length === 0;
    if (!isDraftEmpty) return;
    if ((processRuntimeSnapshot.tasks || []).length > 0 || (processRuntimeSnapshot.runs || []).length > 0) {
      setAutoSyncedProcessTemplateId(data.process_template_id);
      return;
    }

    const syncFromProcessTemplate = async () => {
      try {
        const { data: stages, error } = await supabase
          .from('process_template_stages')
          .select('id, stage_name, sort_order, wage, default_assignee_id, default_assignee_role_id, metadata')
          .eq('template_id', data.process_template_id)
          .order('sort_order', { ascending: true });
        if (error) throw error;

        const templateOption = processTemplateFieldOptions.find(
          (option) => String(option.value) === String(data.process_template_id)
        );
        const mappedDraft = mapProcessTemplateStagesToDraft(data.process_template_id, stages || [], {
          templateName: templateOption?.label || null,
        });

        const patch = { [processDraftFieldKey]: mappedDraft } as any;
        await supabase.from(moduleTable).update(patch).eq('id', data.id);
        setData((prev: any) => ({ ...prev, ...patch }));
        setAutoSyncedProcessTemplateId(data.process_template_id);
      } catch (err) {
        console.warn('همگام‌سازی خودکار از الگوی فرآیند ناموفق بود', err);
      }
    };

    syncFromProcessTemplate();
  }, [moduleId, data, processDraftFieldKey, autoSyncedProcessTemplateId, processTemplateFieldOptions, processRuntimeSnapshot]);

  useEffect(() => {
    if (!moduleConfig) return;
    const recordName = getRecordTitle(data, moduleConfig, { fallback: '' });
    window.dispatchEvent(new CustomEvent('erp:breadcrumb', {
      detail: {
        moduleTitle: moduleConfig.titles?.fa || moduleId,
        moduleId,
        recordName,
      }
    }));
    return () => {
      window.dispatchEvent(new CustomEvent('erp:breadcrumb', { detail: null }));
    };
  }, [moduleConfig, moduleId, data, id]);

  useEffect(() => {
    if (!moduleConfig) return;
    const moduleTitle = moduleConfig.titles?.fa || moduleId;
    const recordName = getRecordTitle(data, moduleConfig, { fallback: '' });
    const brandTitle = document.documentElement.getAttribute('data-brand-title') || 'هلدینگ رسانه ای کلام تازه.';
    document.title = recordName ? `${recordName} | ${moduleTitle} | ${brandTitle}` : `${moduleTitle} | ${brandTitle}`;
  }, [moduleConfig, moduleId, data]);

  const markCurrentModuleListChanged = useCallback((patch?: Record<string, any> | null) => {
    markModuleListChanged({
      org_id: patch?.org_id || data?.org_id || null,
      module_id: moduleId,
      record_id: id,
      action: 'update',
      updated_at: new Date().toISOString(),
    });
  }, [data?.org_id, id, moduleId]);

    const handleAssigneeChange = useCallback(async (value: string) => {
      if (!supportsAssignee) {
        msg.error('برای این ماژول ارجاع مسئول فعال نشده است.');
        return;
      }
      const parsedAssignee = parseAssigneeValue(value);
      const type = parsedAssignee.assigneeType || 'user';
      const assignId = parsedAssignee.assigneeId || '';
      if (!assignId) return;
      if (type === 'role' && !supportsRoleAssignee) {
        msg.error('در این ماژول فقط امکان انتخاب مسئول از نوع پرسنل وجود دارد.');
        return;
      }
      try {
        const payload = type === 'role'
          ? { assignee_id: null, assignee_role_id: assignId, assignee_type: type }
          : { assignee_id: assignId, assignee_role_id: null, assignee_type: type };
        const { error } = await supabase.from(moduleConfig?.table || moduleId).update(payload).eq('id', id);
        if (error) throw error;

        await runWorkflowsForEvent({
          moduleId,
          event: 'upsert',
          currentRecord: {
            ...(data || {}),
            ...payload,
            id,
          } as Record<string, any>,
          previousRecord: (data || null) as Record<string, any> | null,
        });

        const previousAssigneeId = getResolvedAssigneeId(data);
        const prevAssigneeType = String(data?.assignee_type || (data?.assignee_role_id ? 'role' : 'user'));
        const prevAssignee = previousAssigneeId ? `${prevAssigneeType}:${previousAssigneeId}` : null;
        const nextAssignee = assignId ? `${type}:${assignId}` : null;

        const resolveAssigneeLabel = async (val: string | null) => {
          if (!val) return 'خالی';
          const [t, uid] = val.split(':');
          if (t === 'user') {
            const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', uid).maybeSingle();
            return profile?.full_name || uid;
          }
          if (t === 'role') {
            const { data: role } = await supabase.from('org_roles').select('title').eq('id', uid).maybeSingle();
            return role?.title || uid;
          }
          return uid;
        };

        const oldLabel = await resolveAssigneeLabel(prevAssignee);
        const newLabel = await resolveAssigneeLabel(nextAssignee);

        setData((prev: any) => ({
          ...prev,
          assignee_id: type === 'role' ? null : assignId,
          assignee_role_id: type === 'role' ? assignId : null,
          assignee_type: type,
        }));

        const authUser = await getCachedAuthUser(supabase);
        await insertRecordActivity({
          supabase,
          moduleId,
          recordId: String(id || ''),
          action: 'update',
          fieldName: 'assignee_id',
          fieldLabel: assigneeLabel,
          oldValue: oldLabel,
          newValue: newLabel,
          userId: authUser?.id || null,
          recordTitle: getRecordTitle(data, moduleConfig) || null,
        });

        msg.success(`${assigneeLabel} رکورد تغییر کرد`);
      } catch (e: any) { msg.error(toFaErrorMessage(e, 'ذخیره جدول ناموفق بود.')); }
    }, [assigneeLabel, data?.assignee_id, data?.assignee_type, data, id, moduleConfig, moduleConfig?.table, moduleId, msg, supportsAssignee, supportsRoleAssignee]);

  // تابع برای کپی اقلام BOM به جداول مواد اولیه (با تایید کاربر)
    const handleRelatedBomChange = useCallback(async (bomId: string) => {
      if (!bomId) return;
      if (bomCopyPromptRef.current === bomId) return;
      bomCopyPromptRef.current = bomId;

      modal.confirm({
        title: 'کپی از شناسنامه تولید',
        content: 'جداول سفارش تولید ریست شوند و مقادیر از روی BOM کپی شوند؟',
        okText: 'بله، کپی کن',
        cancelText: 'خیر',
        onCancel: () => {
          bomCopyPromptRef.current = null;
        },
        onOk: async () => {
          try {
            const { data: bom, error: bomError } = await supabase
              .from('production_boms')
              .select('*')
              .eq('id', bomId)
              .single();

            if (bomError) throw bomError;
              
            const updateData: any = {};
            if (bom.grid_materials) {
              updateData['grid_materials'] = bom.grid_materials;
            }
            if (moduleId === 'production_orders') {
              updateData['bom_id'] = bomId;
              updateData['name'] = bom?.name || '';
            } else {
              updateData['related_bom'] = bomId;
            }
            updateData['product_category'] = bom?.product_category ?? null;
            if (bom.production_stages_draft) {
              updateData['production_stages_draft'] = bom.production_stages_draft;
            }

            const { error: updateError } = await supabase
              .from(moduleTable)
              .update(updateData)
              .eq('id', id);

            if (updateError) throw updateError;

            setData((prev: any) => ({ 
              ...prev, 
              ...updateData 
            }));
              
            setLinkedBomData(bom);
            msg.success('اقلام شناسنامه تولید بارگذاری شد و بهای تمام شده محاسبه شد');
          } catch (e: any) {
            msg.error(toFaErrorMessage(e, 'بارگذاری اقلام ناموفق بود.'));
          } finally {
            bomCopyPromptRef.current = null;
          }
        }
      });
    }, [id, moduleId, msg, modal]);

  const handleProcessTemplateChange = useCallback(async (templateId: string) => {
    if (!templateId || !processDraftFieldKey || !id) return;
    if (processTemplatePromptRef.current === templateId) return;
    processTemplatePromptRef.current = templateId;

    modal.confirm({
      title: 'کپی مراحل از الگوی فرآیند',
      content: 'مراحل پیش‌نویس فرآیند با الگوی انتخاب‌شده جایگزین شود؟',
      okText: 'بله، جایگزین کن',
      cancelText: 'خیر',
      onCancel: () => {
        processTemplatePromptRef.current = null;
      },
      onOk: async () => {
        try {
          const { data: templateRow } = await supabase
            .from('process_templates')
            .select('id, name, module_id, module_ids')
            .eq('id', templateId)
            .maybeSingle();
          const targetModuleIds = normalizeProcessTargetModuleIds(templateRow?.module_ids, templateRow?.module_id);
          const processLinkMap = {
            ...(moduleId && id ? { [moduleId]: String(id) } : {}),
            ...getRelationFieldLinksForModules(moduleId, data || null, targetModuleIds),
          };
          const { data: stages, error } = await supabase
            .from('process_template_stages')
            .select('id, stage_name, sort_order, wage, default_assignee_id, default_assignee_role_id, metadata')
            .eq('template_id', templateId)
            .order('sort_order', { ascending: true });
          if (error) throw error;

          const templateOption = processTemplateFieldOptions.find(
            (option) => String(option.value) === String(templateId)
          );
          const mappedDraft = mapProcessTemplateStagesToDraft(templateId, stages || [], {
            templateName: String(templateRow?.name || templateOption?.label || '').trim() || null,
            targetModuleIds,
            processLinkMap,
          });

          const patch: Record<string, any> = {
            process_template_id: templateId,
            [processDraftFieldKey]: mappedDraft,
          };
          const { error: updateError } = await supabase.from(moduleTable).update(patch).eq('id', id);
          if (updateError) throw updateError;
          await syncProcessDraftToLinkedRecords(supabase, mappedDraft, processLinkMap);

          setData((prev: any) => ({ ...(prev || {}), ...patch }));
          setAutoSyncedProcessTemplateId(templateId);
          await insertChangelog({
            action: 'process_template_applied',
            fieldName: 'process_template_id',
            fieldLabel: 'الگوی فرآیند',
            oldValue: data?.process_template_id ?? null,
            newValue: templateId,
            metadata: {
              changeKind: 'process_template_applied',
              summary: 'الگوی فرآیند به رکورد افزوده شد',
              blockLabel: 'فرآیند',
            },
          });
          msg.success('مراحل فرآیند بارگذاری شد');
        } catch (e: any) {
          msg.error('خطا در بارگذاری مراحل فرآیند: ' + (e?.message || e));
        } finally {
          processTemplatePromptRef.current = null;
        }
      },
    });
  }, [data, id, moduleId, msg, modal, processDraftFieldKey, processTemplateFieldOptions]);

  const handleDelete = () => {
    if (isRecycleBinEnabledModule(moduleId)) {
      setIsDeleteModalOpen(true);
      return;
    }
    modal.confirm({
      title: 'حذف رکورد',
      okType: 'danger',
      onOk: async () => {
        try {
          const { error } = await supabase.from(moduleConfig?.table || moduleId).delete().eq('id', id);
          if (error) throw error;
          msg.success('رکورد حذف شد');
          navigate(`/${moduleId}`);
        } catch (error: any) {
          msg.error(toFaErrorMessage(error, 'خطا در حذف رکورد'));
        }
      },
    });
  };

  const handleCopyRecord = useCallback(() => {
    if (!data || !id || !moduleConfig) return;
    modal.confirm({
      title: 'کپی رکورد',
      content: 'فرم ایجاد رکورد جدید با مقادیر کپی‌شده باز شود؟',
      okText: 'بله، فرم را باز کن',
      cancelText: 'انصراف',
      onOk: async () => {
        try {
          const nameField = detectCopyNameField(moduleConfig);
          const payload = buildCopyPayload(data, { nameField, moduleId });
          writeModuleOptionSnapshot(moduleId, {
            dynamicOptions,
            relationOptions,
            allUsers,
            allRoles,
          });
          navigate(`/${moduleId}/create`, {
            state: {
              initialValues: payload,
              copySource: {
                sourceRecordId: String(id),
                copyRelations: moduleId === 'production_orders' || moduleId === 'process_templates',
              },
            },
          });
          msg.success('فرم ایجاد با اطلاعات کپی‌شده باز شد.');
        } catch (e: any) {
          msg.error(`آماده‌سازی کپی ناموفق بود: ${e?.message || e}`);
        }
      }
    });
  }, [allRoles, allUsers, data, dynamicOptions, id, moduleConfig, modal, moduleId, msg, navigate, relationOptions]);

  const isMissingColumnError = _msIsMissingColumnError;

  const createProjectWithFallback = async (payload: Record<string, any>) => {
    let currentPayload: Record<string, any> = { ...payload };
    const optionalColumns = ['source_invoice_id', 'source_purchase_invoice_id'];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data: inserted, error } = await supabase
        .from('projects')
        .insert(currentPayload)
        .select('id')
        .single();
      if (!error && inserted?.id) return String(inserted.id);
      const removable = optionalColumns.filter((columnName) =>
        Object.prototype.hasOwnProperty.call(currentPayload, columnName) && isMissingColumnError(error, columnName)
      );
      if (!removable.length) throw error || new Error('ایجاد پروژه ناموفق بود');
      removable.forEach((columnName) => {
        delete currentPayload[columnName];
      });
    }
    throw new Error('ایجاد پروژه ناموفق بود');
  };

  const updateCustomerBotLegacyFieldsWithFallback = async (
    customerId: string,
    payload: Record<string, any>
  ) => {
    let currentPayload: Record<string, any> = { ...payload };
    const optionalColumns = ['preferred_notification_channel'];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (Object.keys(currentPayload).length === 0) return;
      const { error } = await supabase
        .from('customers')
        .update(currentPayload)
        .eq('id', customerId);
      if (!error) return;

      const removable = optionalColumns.filter((columnName) =>
        Object.prototype.hasOwnProperty.call(currentPayload, columnName) && isMissingColumnError(error, columnName)
      );
      if (!removable.length) throw error;
      removable.forEach((columnName) => {
        delete currentPayload[columnName];
      });
    }
  };

  const clearBotStatusWatchTimer = useCallback(() => {
    if (botStatusWatchTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearInterval(botStatusWatchTimerRef.current);
      botStatusWatchTimerRef.current = null;
    }
  }, [botStatusWatchTimerRef]);

  const loadBotStatusRow = useCallback(async (context: BotStatusModalContext) => {
    const counterpartyEnglishName = String(
      data?.company_name_en || data?.business_name_en || data?.english_name
      || data?.name_en || data?.legal_name_en || data?.full_name_en || ''
    ).trim();

    const groupQueryBase = supabase
      .from('counterparty_bot_groups')
      .select('id, channel_type, status, group_title, group_join_link, metadata, last_inbound_at, bot_chat_id')
      .limit(10);
    const groupQueryFiltered = applyBotTargetFilter(groupQueryBase, context);

    const prefQueryBase = supabase
      .from('counterparty_bot_config')
      .select('default_channel, fallback_to_active')
      .limit(1);
    const prefQueryFiltered = applyBotTargetFilter(prefQueryBase, context);

    const [orgPrefix, groupResult, { data: prefRow }] = await Promise.all([
      loadOrgBotPrefix(),
      groupQueryFiltered,
      prefQueryFiltered.maybeSingle(),
    ]);

    const { data: rows, error } = groupResult;
    if (error) throw error;
    const rowMap = new Map<string, any>((rows || []).map((row: any) => [String(row?.channel_type || '').trim(), row] as const));
    const defaultChannel = (['rubika', 'telegram', 'bale'].includes(String(prefRow?.default_channel || ''))
      ? prefRow!.default_channel
      : 'rubika') as BotChannel;

    // بارگذاری آخرین پیام دریافتی برای همه گروه‌ها با یک کوئری
    const groupIds = (rows || []).map((r: any) => String(r?.id || '').trim()).filter(Boolean);
    const inboundMap = new Map<string, { created_at: string; content_text: string }>();
    if (groupIds.length > 0) {
      const { data: inboundRows } = await supabase
        .from('counterparty_bot_messages')
        .select('created_at, content_text, bot_group_id')
        .in('bot_group_id', groupIds)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(20);
      (inboundRows || []).forEach((r: any) => {
        const groupId = String(r?.bot_group_id || '').trim();
        if (groupId && !inboundMap.has(groupId)) inboundMap.set(groupId, r);
      });
    }

    const platforms: Record<BotChannel, BotPlatformState> = {
      rubika: { ...DEFAULT_BOT_PLATFORM_STATE },
      telegram: { ...DEFAULT_BOT_PLATFORM_STATE },
      bale: { ...DEFAULT_BOT_PLATFORM_STATE },
    };
    const currentProfileId = String(currentUserId || '').trim();
    for (const channel of BOT_CHANNELS) {
      const row = rowMap.get(channel) || null;
      const metadata = (row?.metadata && typeof row.metadata === 'object') ? row.metadata : {};
      const existingCode = String(metadata?.activation_code || '').trim().toUpperCase();
      const rowId = String(row?.id || '').trim();
      const inbound = rowId ? inboundMap.get(rowId) : null;
      const rawStatus = String(row?.status || 'pending_join').trim();
      const rawAllowedUserIds = Array.isArray(metadata?.allowed_user_ids)
        ? metadata.allowed_user_ids.map((id: any) => String(id || '').trim()).filter(Boolean)
        : [];
      platforms[channel] = {
        groupTitle: String(row?.group_title || '').trim(),
        groupJoinLink: String(row?.group_join_link || '').trim(),
        directChatId: String((data as any)?.[getBotChatIdFieldKey(channel)] || '').trim(),
        currentStatus: rawStatus === 'pending_join_link' ? 'pending_join' : (rawStatus || 'pending_join'),
        activationCode: existingCode || createBotActivationCode(counterpartyEnglishName, orgPrefix),
        lastInboundAt: String(inbound?.created_at || row?.last_inbound_at || '').trim(),
        lastInboundText: String(inbound?.content_text || '').trim(),
        allowedUserIds: rawAllowedUserIds.length > 0 ? rawAllowedUserIds : (currentProfileId ? [currentProfileId] : []),
        allowedRoleIds: Array.isArray(metadata?.allowed_role_ids) ? metadata.allowed_role_ids.map((id: any) => String(id || '').trim()).filter(Boolean) : [],
        aiAutoReplyEnabled: Boolean(metadata?.ai_auto_reply_enabled),
        aiCounterpartyGuide: String(metadata?.ai_counterparty_guide || '').trim(),
      };
    }

    setBotStatusPlatformData(platforms);
    setBotStatusDefaultChannel(defaultChannel);
    setBotStatusFallbackToActive(Boolean(prefRow?.fallback_to_active));
    setBotStatusActiveTab(defaultChannel);
  }, [currentUserId, data?.business_name_en, data?.company_name_en, data?.english_name, data?.full_name_en, data?.legal_name_en, data?.name_en]);

  const saveBotStatusSettings = useCallback(async (options?: { forceCapture?: boolean; captureChannel?: BotChannel; captureSeconds?: number }) => {
    const context = botStatusModalContext;
    if (!context) return;
    const forceCapture = options?.forceCapture === true;
    const captureChannel = options?.captureChannel || botStatusActiveTab;
    const captureSeconds = Number(options?.captureSeconds || 30);
    const nowIso = new Date().toISOString();
    const captureExpiresAt = forceCapture
      ? new Date(Date.now() + Math.max(10, captureSeconds) * 1000).toISOString()
      : null;

    // ذخیره هر پلتفرم
    const localRecordPatch: Record<string, any> = {};
    for (const channel of BOT_CHANNELS) {
      const platformState = botStatusPlatformData[channel];
      if (!platformState) continue;
      const isCapturing = forceCapture && channel === captureChannel;

      let existingQuery = supabase
        .from('counterparty_bot_groups')
        .select('id, status, bot_chat_id, metadata')
        .eq('channel_type', channel)
        .limit(1);
      existingQuery = applyBotTargetFilter(existingQuery, context);
      const { data: existingRows } = await existingQuery;
      const existingRow = Array.isArray(existingRows) ? existingRows[0] : null;
      const existingStatus = String(existingRow?.status || '').trim() === 'pending_join_link' ? 'pending_join' : String(existingRow?.status || '').trim();
      const existingChatId = String(existingRow?.bot_chat_id || '').trim();
      const existingRowMetadata = (existingRow?.metadata && typeof existingRow.metadata === 'object') ? existingRow.metadata : {};
      const nextStatus = isCapturing ? 'pending_join' : ((existingStatus === 'active' && existingChatId) ? 'active' : 'pending_join');

      const payload: Record<string, any> = {
        target_type: context.targetType,
        channel_type: channel,
        status: nextStatus,
        group_title: String(platformState.groupTitle || '').trim() || null,
        group_join_link: String(platformState.groupJoinLink || '').trim() || null,
        metadata: {
          ...existingRowMetadata,
          activation_code: String(platformState.activationCode || '').trim().toUpperCase(),
          activation_required: true,
          capture_mode: isCapturing,
          capture_started_at: isCapturing ? nowIso : null,
          capture_expires_at: isCapturing ? captureExpiresAt : null,
          last_capture_channel: isCapturing ? channel : existingRowMetadata?.last_capture_channel,
          allowed_user_ids: platformState.allowedUserIds,
          allowed_role_ids: platformState.allowedRoleIds,
          ai_auto_reply_enabled: platformState.aiAutoReplyEnabled,
          ai_counterparty_guide: String(platformState.aiCounterpartyGuide || '').trim() || null,
          activation_confirmation_sent: isCapturing ? false : Boolean(existingRowMetadata?.activation_confirmation_sent),
          last_capture_error: isCapturing ? null : existingRowMetadata?.last_capture_error,
          activation_updated_at: nowIso,
        },
        updated_by: null,
        customer_id: context.targetType === 'customers' ? context.counterpartyId : null,
        supplier_id: context.targetType === 'suppliers' ? context.counterpartyId : null,
        employee_id: context.targetType === 'employees' ? context.counterpartyId : null,
      };

      if (existingRow?.id) {
        const { error } = await supabase.from('counterparty_bot_groups').update(payload).eq('id', String(existingRow.id));
        if (error) throw error;
      } else {
        const { error } = await supabase.from('counterparty_bot_groups').insert([payload]);
        if (error) throw error;
      }

      await syncBotDirectChatIdForTarget({
        client: supabase,
        orgId: String(currentOrgId || '').trim(),
        moduleId: context.targetType,
        recordId: context.counterpartyId,
        channel,
        chatId: platformState.directChatId,
        previousChatId: String((data as any)?.[getBotChatIdFieldKey(channel)] || '').trim() || null,
      });
      localRecordPatch[getBotChatIdFieldKey(channel)] = String(platformState.directChatId || '').trim() || null;
    }

    // ذخیره تنظیمات پیش‌فرض در counterparty_bot_config
    const configPayload = {
      org_id: currentOrgId,
      default_channel: botStatusDefaultChannel,
      fallback_to_active: botStatusFallbackToActive,
      customer_id: context.targetType === 'customers' ? context.counterpartyId : null,
      supplier_id: context.targetType === 'suppliers' ? context.counterpartyId : null,
      employee_id: context.targetType === 'employees' ? context.counterpartyId : null,
    };
    let existingConfigQuery = supabase.from('counterparty_bot_config').select('id').limit(1);
    existingConfigQuery = applyBotTargetFilter(existingConfigQuery, context);
    const { data: existingConfigRow } = await existingConfigQuery.maybeSingle();
    if (existingConfigRow?.id) {
      await supabase.from('counterparty_bot_config').update(configPayload).eq('id', String(existingConfigRow.id));
    } else {
      await supabase.from('counterparty_bot_config').insert([configPayload]);
    }

    if (context.moduleId === 'customers') {
      const legacyPatch = { preferred_notification_channel: botStatusDefaultChannel };
      await updateCustomerBotLegacyFieldsWithFallback(context.counterpartyId, legacyPatch);
      localRecordPatch.preferred_notification_channel = legacyPatch.preferred_notification_channel;
    }
    setData((prev: any) => ({ ...prev, ...localRecordPatch }));
  }, [botStatusActiveTab, botStatusDefaultChannel, botStatusFallbackToActive, botStatusModalContext, botStatusPlatformData, currentOrgId]);

  const handleCloseBotStatusModal = useCallback(() => {
    clearBotStatusWatchTimer();
    setBotStatusWatchingChannel(null);
    setBotStatusCountdown(0);
    setBotStatusModalOpen(false);
  }, [clearBotStatusWatchTimer]);

  const handleSaveBotStatusModal = useCallback(async () => {
    if (!botStatusModalContext) return;
    try {
      setBotStatusModalSaving(true);
      await saveBotStatusSettings();
      await loadBotStatusRow(botStatusModalContext);
      msg.success('وضعیت گروه بات ذخیره شد.');
    } catch (error: any) {
      msg.error(toFaErrorMessage(error, 'ذخیره وضعیت گروه بات ناموفق بود.'));
    } finally {
      setBotStatusModalSaving(false);
    }
  }, [botStatusModalContext, loadBotStatusRow, msg, saveBotStatusSettings]);

  const handleStartBotBindWatch = useCallback(async (channel: BotChannel) => {
    if (!botStatusModalContext) return;
    try {
      setBotStatusModalSaving(true);
      await saveBotStatusSettings({ forceCapture: true, captureChannel: channel, captureSeconds: 30 });
      let captureConnectionId = '';
      let captureCursor: string | number | null = null;
      try {
        const integration = await getActiveChannelSettings(channel);
        captureConnectionId = String(integration?.id || '').trim();
        if (!captureConnectionId) {
          msg.warning(`اتصال فعال برای بات ${CUSTOMER_BOT_CHANNEL_LABELS[channel] || channel} پیدا نشد.`);
        } else {
          const { data: captureData, error: captureError } = await supabase.functions.invoke('bot-admin', {
            body: { action: 'start_capture', channel, connectionId: captureConnectionId },
          });
          if (captureError) throw captureError;
          if (!captureData?.success) throw new Error(String(captureData?.message || 'شروع capture ناموفق بود.'));
          if (channel !== 'rubika' && Object.prototype.hasOwnProperty.call(captureData, 'cursor')) {
            captureCursor = captureData?.cursor ?? null;
          }
        }
      } catch (captureErr: any) {
        msg.warning(toFaErrorMessage(captureErr, 'شروع capture بات با خطا مواجه شد.'));
      }
      await loadBotStatusRow(botStatusModalContext);
      clearBotStatusWatchTimer();
      setBotStatusWatchingChannel(channel);
      setBotStatusCountdown(30);

      let remaining = 30;
      botStatusWatchTimerRef.current = window.setInterval(async () => {
        remaining -= 1;
        setBotStatusCountdown(Math.max(remaining, 0));
        if (remaining % 2 === 0) {
          try {
            if (captureConnectionId) {
              const activationCode = String(botStatusPlatformData[channel]?.activationCode || '').trim().toUpperCase();
              const { data: pollData } = await supabase.functions.invoke('bot-admin', {
                body: { action: 'poll_updates', channel, connectionId: captureConnectionId, cursor: captureCursor, activationCode },
              });
              if (pollData?.success && Object.prototype.hasOwnProperty.call(pollData, 'cursor')) {
                captureCursor = pollData?.cursor ?? captureCursor;
              }
              const polledContact = pollData?.found ? (pollData?.contact || null) : null;
              const polledChatId = String(polledContact?.chat_id || polledContact?.chatId || '').trim();
              if (polledContact && polledChatId) {
                const polledText = String(polledContact?.last_message_text || polledContact?.text || '').trim();
                const polledPayload = (polledContact?.last_payload && typeof polledContact.last_payload === 'object') ? polledContact.last_payload : {};
                const chatTitle = String(polledPayload?.update?.chat_title || polledPayload?.update?.group_title || polledPayload?.update?.new_message?.chat_title || polledPayload?.update?.new_message?.group_title || polledPayload?.update?.new_message?.chat?.title || polledPayload?.chat_title || polledPayload?.group_title || '').trim();
                const chatType = String(polledPayload?.update?.chat_type || polledPayload?.update?.new_message?.chat?.type || polledPayload?.chat_type || '').trim().toLowerCase();
                const isGroupByType = ['group', 'supergroup', 'channel'].includes(chatType);
                const chatIdLower = polledChatId.toLowerCase();
                const isGroup = isGroupByType || chatIdLower.startsWith('g0') || chatIdLower.startsWith('c0') || chatIdLower.startsWith('ch') || Boolean(chatTitle);
                const hasActivationCode = !activationCode || String(polledText || '').toUpperCase().includes(activationCode);
                const allowRubikaActivationBind = channel === 'rubika' && hasActivationCode && Boolean(polledChatId);
                if ((isGroup && hasActivationCode) || allowRubikaActivationBind) {
                  let groupQuery = supabase.from('counterparty_bot_groups').select('id, metadata, group_title').eq('channel_type', channel).limit(1);
                  groupQuery = applyBotTargetFilter(groupQuery, botStatusModalContext);
                  const { data: bindRows } = await groupQuery;
                  const bindRow = Array.isArray(bindRows) ? bindRows[0] : null;
                  const bindRowId = String(bindRow?.id || '').trim();
                  if (bindRowId) {
                    const existingMetadata = (bindRow?.metadata && typeof bindRow.metadata === 'object') ? bindRow.metadata : {};
                    await supabase.from('counterparty_bot_groups').update({ status: 'active', bot_chat_id: polledChatId, group_title: chatTitle || String(bindRow?.group_title || '').trim() || null, last_inbound_at: new Date().toISOString(), metadata: { ...existingMetadata, capture_mode: false, capture_expires_at: null, last_capture_error: null, last_bound_chat_id: polledChatId, last_bound_chat_title: chatTitle || null, last_bound_chat_type: chatType || null, activation_last_match_at: new Date().toISOString() } }).eq('id', bindRowId);
                    await loadBotStatusRow(botStatusModalContext);
                  }
                }
              }
            }
            await loadBotStatusRow(botStatusModalContext);
            let liveQuery = supabase.from('counterparty_bot_groups').select('status, bot_chat_id').eq('channel_type', channel).limit(1);
            liveQuery = applyBotTargetFilter(liveQuery, botStatusModalContext);
            const { data: liveRows } = await liveQuery;
            const row = Array.isArray(liveRows) ? liveRows[0] : null;
            if (String(row?.status || '').trim() === 'active' && String(row?.bot_chat_id || '').trim()) {
              clearBotStatusWatchTimer();
              setBotStatusWatchingChannel(null);
              setBotStatusCountdown(0);
              msg.success('اتصال گروه بات با موفقیت انجام شد.');
            }
          } catch {
            // ignore temporary poll failures
          }
        }
        if (remaining <= 0) {
          clearBotStatusWatchTimer();
          setBotStatusWatchingChannel(null);
          setBotStatusCountdown(0);
          msg.info('زمان انتظار bind تمام شد. در صورت نیاز دوباره شروع کنید.');
        }
      }, 1000);
    } catch (error: any) {
      msg.error(toFaErrorMessage(error, 'شروع حالت انتظار bind ناموفق بود.'));
      setBotStatusWatchingChannel(null);
      setBotStatusCountdown(0);
    } finally {
      setBotStatusModalSaving(false);
    }
  }, [botStatusModalContext, botStatusPlatformData, clearBotStatusWatchTimer, loadBotStatusRow, msg, saveBotStatusSettings]);

  const handleCopyBotActivationCode = useCallback(async (channel: BotChannel) => {
    try {
      const code = String(botStatusPlatformData[channel]?.activationCode || '').trim();
      await navigator.clipboard.writeText(code);
      msg.success('کد فعال‌سازی کپی شد.');
    } catch {
      msg.error('کپی کد فعال‌سازی ناموفق بود.');
    }
  }, [botStatusPlatformData, msg]);

  useEffect(() => {
    return () => {
      clearBotStatusWatchTimer();
    };
  }, []);

  const loadQuickProjectModalOptions = useCallback(async (prefill?: { customerId?: string | null; templateId?: string | null }) => {
    const prefillCustomerId = String(prefill?.customerId || '').trim();
    try {
      const dynamicCategories = Array.from(new Set(
        quickProjectModalFields
          .map((field: any) => String(field?.dynamicOptionsCategory || '').trim())
          .filter(Boolean)
      ));
      const [recentCustomerOptions, exactCustomerOptions, { data: templates, error: templatesError }, dynamicOptionMap] = await Promise.all([
        fetchRelationOptionsForField(supabase, quickProjectCustomerField, { limit: 200 }),
        prefillCustomerId
          ? fetchRelationOptionsForField(supabase, quickProjectCustomerField, { exactId: prefillCustomerId, limit: 1 }).catch(() => [])
          : Promise.resolve([]),
        supabase
          .from('process_templates')
          .select('id,name,module_id,module_ids,is_active')
          .order('name', { ascending: true }),
        dynamicCategories.length > 0
          ? fetchDynamicOptionsMap(supabase, dynamicCategories)
          : Promise.resolve({}),
      ]);
      if (templatesError) throw templatesError;
      const customerOptions = mergeOptionLists(recentCustomerOptions, exactCustomerOptions);
      const scopedTemplates = (templates || []).filter((row: any) =>
        row?.is_active !== false && doesProcessTemplateSupportModule(row, 'projects')
      );
      const templateOptions = scopedTemplates.map((row: any) => ({
        value: String(row.id),
        label: String(row?.name || row?.id),
      }));
      setQuickProjectCustomerOptions(customerOptions);
      setQuickProjectTemplateOptions(templateOptions);
      setQuickProjectDynamicOptions(dynamicOptionMap || {});
      return { customerOptions, templateOptions, dynamicOptionMap: dynamicOptionMap || {} };
    } catch (error) {
      console.warn('Could not load quick project modal options', error);
      setQuickProjectCustomerOptions([]);
      setQuickProjectTemplateOptions([]);
      setQuickProjectDynamicOptions({});
      return { customerOptions: [], templateOptions: [], dynamicOptionMap: {} };
    }
  }, [quickProjectCustomerField, quickProjectModalFields]);

  const handleOpenQuickProjectModal = useCallback(async () => {
    const baseTitle = String(getRecordTitle(data, moduleConfig, { fallback: '' }) || data?.name || data?.title || data?.system_code || 'جدید').trim();
    const suggestedName = `پروژه "${baseTitle || 'جدید'}"`;
    const suggestedCustomerId = moduleId === 'invoices'
      ? (data?.customer_id || null)
      : (moduleId === 'tasks' ? (data?.related_customer || null) : null);
    const { templateOptions } = await loadQuickProjectModalOptions({
      customerId: suggestedCustomerId,
      templateId: data?.process_template_id || null,
    });
    const currentTemplateId = String(data?.process_template_id || '').trim();
    const suggestedTemplateId = currentTemplateId && templateOptions.some((option: any) => String(option?.value || '') === currentTemplateId)
      ? currentTemplateId
      : undefined;
    quickProjectForm.setFieldsValue({
      name: suggestedName,
      customer_id: suggestedCustomerId,
      project_alignment: [],
      process_template_id: suggestedTemplateId,
    });
    setQuickProjectTargetModuleIds([]);
    setQuickProjectLinkedRecords({});
    setQuickProjectRelationOptions({});
    setQuickProjectRelationLoading({});
    setQuickProjectDynamicOptions({});
    setIsQuickProjectModalOpen(true);
  }, [data, loadQuickProjectModalOptions, moduleConfig, moduleId, quickProjectForm]);

  const loadQuickProjectRelationOptions = useCallback(async (targetModuleId: string, exactId?: string | null) => {
    const normalizedTargetModuleId = String(targetModuleId || '').trim();
    if (!normalizedTargetModuleId || !MODULES[normalizedTargetModuleId]) return;
    setQuickProjectRelationLoading((prev) => ({ ...prev, [normalizedTargetModuleId]: true }));
    try {
      const options = await fetchRelationOptionsForField(
        supabase,
        {
          key: 'quick_project_process_link_record_id',
          type: FieldType.RELATION,
          relationConfig: { targetModule: normalizedTargetModuleId },
        } as any,
        { exactId: exactId || null, limit: 200 }
      );
      setQuickProjectRelationOptions((prev) => ({ ...prev, [normalizedTargetModuleId]: options }));
    } catch (error) {
      console.warn('Could not load quick-project relation options', normalizedTargetModuleId, error);
    } finally {
      setQuickProjectRelationLoading((prev) => ({ ...prev, [normalizedTargetModuleId]: false }));
    }
  }, []);

  useEffect(() => {
    const selectedTemplateId = String(quickProjectTemplateId || '').trim();
    if (!isQuickProjectModalOpen || !selectedTemplateId) {
      setQuickProjectTargetModuleIds([]);
      setQuickProjectLinkedRecords({});
      setQuickProjectRelationOptions({});
      setQuickProjectRelationLoading({});
      setQuickProjectDynamicOptions({});
      return;
    }

    let cancelled = false;
    const loadQuickProjectTemplateContext = async () => {
      try {
        const { data: templateRow, error: templateError } = await supabase
          .from('process_templates')
          .select('id, module_id, module_ids')
          .eq('id', selectedTemplateId)
          .maybeSingle();
        if (templateError) throw templateError;

        const targetModuleIds = normalizeProcessTargetModuleIds(templateRow?.module_ids, templateRow?.module_id);
        if (cancelled) return;
        setQuickProjectTargetModuleIds(targetModuleIds);

        const inferredLinks: Record<string, string | null> = {};
        if (id && moduleId && targetModuleIds.includes(moduleId)) {
          inferredLinks[moduleId] = String(id);
        }
        const currentRecordLinks = getRelationFieldLinksForModules(moduleId, data || null, targetModuleIds);
        Object.assign(inferredLinks, currentRecordLinks);
        if (String(quickProjectCustomerId || '').trim()) {
          inferredLinks.customers = String(quickProjectCustomerId);
        }
        if (cancelled) return;
        setQuickProjectLinkedRecords(inferredLinks);

        await Promise.all(
          Array.from(new Set([
            ...targetModuleIds,
            ...(moduleId === 'invoices' ? ['invoices'] : []),
            ...(moduleId === 'purchase_invoices' ? ['purchase_invoices'] : []),
            ...(String(quickProjectCustomerId || '').trim() ? ['customers'] : []),
          ]))
            .filter((targetModuleId) => !['projects', 'tasks', 'process_templates', 'process_runs'].includes(targetModuleId))
            .map((targetModuleId) =>
              loadQuickProjectRelationOptions(targetModuleId, inferredLinks[targetModuleId] || null)
            )
        );
      } catch (error) {
        console.warn('Could not load quick-project process targets', error);
      }
    };

    void loadQuickProjectTemplateContext();
    return () => {
      cancelled = true;
    };
  }, [data, id, isQuickProjectModalOpen, loadQuickProjectRelationOptions, moduleId, quickProjectCustomerId, quickProjectTemplateId]);

  const handleQuickProjectCreate = useCallback(async (values: any) => {
    if (!id) return;
    if (quickProjectSubmitLockRef.current) return;
    quickProjectSubmitLockRef.current = true;
    setQuickProjectLoading(true);
    try {
      const selectedTemplateId = String(values?.process_template_id || '').trim() || null;
      const selectedTemplateLabel = quickProjectTemplateOptions.find((item) => String(item.value) === selectedTemplateId)?.label || null;
      const targetModuleIds = normalizeProcessTargetModuleIds(quickProjectTargetModuleIds, 'projects');
      let executionDraft: any[] = [];
      if (selectedTemplateId) {
        const { data: stages, error: stagesError } = await supabase
          .from('process_template_stages')
          .select('id, stage_name, sort_order, wage, default_assignee_id, default_assignee_role_id, metadata')
          .eq('template_id', selectedTemplateId)
          .order('sort_order', { ascending: true });
        if (stagesError) throw stagesError;
        const groupId = `process_group_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const groupLabel = String(selectedTemplateLabel || 'فرآیند ۱').trim() || 'فرآیند ۱';
        executionDraft = mapProcessTemplateStagesToDraft(selectedTemplateId, stages || [], {
          groupId,
          groupName: groupLabel,
          templateName: selectedTemplateLabel,
          targetModuleIds,
          processLinkMap: {
            ...quickProjectLinkedRecords,
            ...(moduleId && id ? { [moduleId]: String(id) } : {}),
          },
        });
      }

      const authUser = await getCachedAuthUser(supabase);
      const userId = authUser?.id || null;
      const payload: Record<string, any> = {
        name: String(values?.name || '').trim(),
        status: 'draft',
        customer_id: values?.customer_id || quickProjectLinkedRecords.customers || null,
        project_alignment: Array.isArray(values?.project_alignment) ? values.project_alignment : [],
        process_template_id: selectedTemplateId,
        execution_process_draft: executionDraft,
        source_invoice_id: moduleId === 'invoices' ? id : (quickProjectLinkedRecords.invoices || null),
        source_purchase_invoice_id: moduleId === 'purchase_invoices' ? id : (quickProjectLinkedRecords.purchase_invoices || null),
        created_by: userId,
      };
      if (!payload.name) {
        msg.error('نام پروژه الزامی است');
        return;
      }
      const projectId = await createProjectWithFallback(payload);

      if (selectedTemplateId && executionDraft.length > 0) {
        const processLinkMap = {
          ...quickProjectLinkedRecords,
          ...(moduleId && id ? { [moduleId]: String(id) } : {}),
          projects: projectId,
        };
        const enrichedDraft = executionDraft.map((stage) => ({
          ...stage,
          process_target_module_ids: targetModuleIds,
          process_link_map: processLinkMap,
        }));
        const { error: projectDraftUpdateError } = await supabase
          .from('projects')
          .update({ execution_process_draft: enrichedDraft })
          .eq('id', projectId);
        if (projectDraftUpdateError) throw projectDraftUpdateError;
        await syncProcessDraftToLinkedRecords(supabase, enrichedDraft, processLinkMap);
        payload.execution_process_draft = enrichedDraft;
      }

      if (moduleId === 'invoices') {
        await supabase.from('invoices').update({ project_id: projectId }).eq('id', id);
      } else if (moduleId === 'purchase_invoices') {
        await supabase.from('purchase_invoices').update({ project_id: projectId }).eq('id', id);
      }

      await runWorkflowsForEvent({
        moduleId: 'projects',
        event: 'create',
        currentRecord: {
          ...payload,
          id: projectId,
        } as Record<string, any>,
      });

      if ((moduleId === 'invoices' || moduleId === 'purchase_invoices') && id) {
        await runWorkflowsForEvent({
          moduleId,
          event: 'upsert',
          currentRecord: {
            ...(data || {}),
            project_id: projectId,
            id,
          } as Record<string, any>,
          previousRecord: (data || null) as Record<string, any> | null,
        });
      }

      if (moduleId && id) {
        await insertChangelog({
          action: 'project_auto_referred',
          fieldName: 'project_id',
          fieldLabel: 'پروژه',
          oldValue: data?.project_id ?? null,
          newValue: projectId,
          metadata: {
            changeKind: 'project_auto_referred',
            summary: 'پروژه به رکورد فعلی متصل شد',
          },
          touchRecord: moduleId !== 'invoices' && moduleId !== 'purchase_invoices',
        });
      }

      setIsQuickProjectModalOpen(false);
      quickProjectForm.resetFields();
      msg.success('پروژه ایجاد شد');
      navigate(`/projects/${projectId}`);
    } catch (error: any) {
      msg.error(`ایجاد پروژه ناموفق بود: ${error?.message || error}`);
    } finally {
      quickProjectSubmitLockRef.current = false;
      setQuickProjectLoading(false);
    }
  }, [id, moduleId, msg, navigate, quickProjectLinkedRecords, quickProjectTargetModuleIds, quickProjectForm, quickProjectTemplateOptions]);



  const handleIssueAccounting = async () => {
    if (!id) return;
    setIssueAccountingLoading(true);
    try {
      if (moduleId === 'invoices') {
        await createJournalFromInvoice(supabase, id, navigate, msg);
        return;
      }
      if (isOperationalAccountingModule(moduleId)) {
        const result = await syncOperationalAccountingEntry(supabase as any, moduleId, id);
        if (result.journalEntryId) {
          if (result.created) msg.success('پیش‌نویس سند حسابداری ایجاد شد.');
          else msg.info('سند حسابداری موجود باز شد.');
          navigate(`/journal_entries/${result.journalEntryId}`);
          return;
        }
      }
    } catch (error: any) {
      msg.error(toFaErrorMessage(error, 'صدور سند حسابداری ناموفق بود.'));
    } finally {
      setIssueAccountingLoading(false);
    }
  };

    const handleHeaderAction = async (actionId: string) => {

      if (actionId === 'create_journal_entry') {

        handleIssueAccounting();

        return;

      }

      if (actionId === 'create_production_order') {
      if (!MODULES['production_orders']) {
        msg.error('ماژول سفارش تولید یافت نشد');
        return;
      }
      setIsCreateOrderOpen(true);
      return;
    }
    if (actionId === 'quick_stock_movement' && (moduleId === 'products' || moduleId === 'shelves')) {
      if (!canEditModule) {
        msg.error('دسترسی ویرایش برای افزودن حواله ندارید.');
        return;
      }
      if (moduleId === 'products' && String(data?.product_type || 'goods') !== 'goods') {
        msg.info('افزودن حواله فقط برای محصولات کالایی فعال است.');
        return;
      }
      setStockMovementQuickAddSignal((prev) => prev + 1);
      return;
    }
    if (actionId === 'create_process') {
      if (!processDraftFieldKey) {
        msg.info('برای این ماژول فرآیند فعال نیست');
        return;
      }
      const processSectionEl = document.getElementById(`process-section-${String(moduleId)}-${String(id || '')}`);
      processSectionEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kalamapp:open-process-append', {
          detail: { moduleId: String(moduleId), recordId: String(id || '') },
        }));
      }
      return;
    }
    if (actionId === 'create_project') {
      void handleOpenQuickProjectModal();
      return;
    }
    if (actionId === 'send_taxpayer_system' && (moduleId === 'invoices' || moduleId === 'sales_return_invoices')) {
      setIsTaxpayerModalOpen(true);
      return;
    }
    if (actionId === 'create_customer_from_lead' && moduleId === 'marketing_leads') {
      if (!canEditModule) return;
      setIsCreateCustomerFromLeadOpen(true);
      return;
    }
    if (actionId === 'counterparty_bot_group_status' && (moduleId === 'customers' || moduleId === 'suppliers' || moduleId === 'employees')) {
      if (!canEditModule) {
        msg.error('دسترسی ویرایش برای تنظیم گروه بات ندارید.');
        return;
      }
      const counterpartyId = String(id || '').trim();
      if (!counterpartyId) {
        msg.error('شناسه رکورد معتبر نیست.');
        return;
      }

      const context: BotStatusModalContext = {
        moduleId: moduleId as 'customers' | 'suppliers' | 'employees',
        targetType: moduleId as BotTargetModuleId,
        counterpartyId,
      };
      setBotStatusModalContext(context);
      setBotStatusModalLoading(true);
      setBotStatusModalOpen(true);
      clearBotStatusWatchTimer();
      setBotStatusWatchingChannel(null);
      setBotStatusCountdown(0);
      try {
        await loadBotStatusRow(context);
      } catch (error: any) {
        msg.error(toFaErrorMessage(error, 'خواندن تنظیم گروه بات ناموفق بود.'));
      } finally {
        setBotStatusModalLoading(false);
      }
      return;
    }
    if (actionId === 'auto_name' && (moduleId === 'products' || moduleId === 'production_orders' || moduleId === 'customers')) {
      if (!canEditModule) return;
      const supportsAutoToggle = moduleId === 'products' || moduleId === 'production_orders';
      let enableAuto = normalizeAutoNameEnabled(data?.auto_name_enabled, false);
      modal.confirm({
        title: moduleId === 'products'
          ? 'نامگذاری خودکار محصول'
          : moduleId === 'production_orders'
            ? 'نامگذاری خودکار سفارش تولید'
            : 'نامگذاری خودکار مشتری',
        content: (
          <div className="space-y-3">
            <div>
              {moduleId === 'products'
                ? 'نام محصول از مقادیر فعلی ساخته شود؟'
                : moduleId === 'production_orders'
                  ? 'نام سفارش تولید بر اساس BOM و رنگ ساخته شود؟'
                  : 'نام کامل مشتری از فیلدهای فعلی ساخته شود؟'}
            </div>
            {supportsAutoToggle && (
              <Checkbox defaultChecked={enableAuto} onChange={(e) => { enableAuto = e.target.checked; }}>
                با تغییر فیلدهای مرتبط، نام به صورت خودکار بروزرسانی شود
              </Checkbox>
            )}
          </div>
        ),
        okText: 'اعمال',
        cancelText: 'انصراف',
        onOk: async () => {
          const nextName = moduleId === 'products'
            ? buildAutoProductName(data)
            : moduleId === 'production_orders'
              ? buildAutoProductionOrderName(data)
              : buildAutoCustomerName(data);
          if (!nextName) {
            msg.warning('اطلاعات کافی برای نامگذاری خودکار وجود ندارد.');
            return;
          }

          const updatePayload = moduleId === 'customers'
            ? { full_name: nextName }
            : { name: nextName, auto_name_enabled: enableAuto };

          try {
            const { error } = await supabase
              .from(moduleTable)
              .update(updatePayload)
              .eq('id', id);
            if (error) throw error;

            if (moduleId === 'customers') {
              setData((prev: any) => ({ ...prev, full_name: nextName }));
            } else {
              setData((prev: any) => ({ ...prev, name: nextName, auto_name_enabled: enableAuto }));
            }

            await insertChangelog({
              action: 'update',
              fieldName: moduleId === 'customers' ? 'full_name' : 'name',
              fieldLabel: getFieldLabel(moduleId === 'customers' ? 'full_name' : 'name'),
              oldValue: moduleId === 'customers' ? (data?.full_name ?? null) : (data?.name ?? null),
              newValue: nextName
            });
            msg.success(moduleId === 'customers' ? 'نام کامل مشتری بروزرسانی شد.' : 'نام با موفقیت بروزرسانی شد.');
          } catch (e: any) {
            msg.error(toFaErrorMessage(e, 'بروزرسانی نام ناموفق بود.'));
          }
        }
      });
      return;
    }
    msg.info('این عملیات هنوز پیاده‌سازی نشده است');
  };




  const handleImageUpdate = useCallback(async (file: File) => {
    if (!canEditModule) {
      msg.warning('ابتدا رکورد را ذخیره کنید');
      return false;
    }
    if (!id) {
      msg.warning('ابتدا رکورد را ذخیره کنید');
      return false;
    }
    setUploadingImage(true);
    try {
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${sanitizeStorageFileName(file.name || 'image')}`;
      const filePath = joinStoragePath('record_files', moduleId, id, fileName);
      await uploadFileWithProgress({
        client: fileStorageClient,
        bucket: FILE_STORAGE_BUCKET,
        path: filePath,
        file,
        label: file.name || 'تصویر',
        detail: 'تصویر اصلی رکورد',
      });
      const { data: urlData } = fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(filePath);
      const imageUpdatePayload =
        moduleId === 'cash_bank_operations'
          ? { image_url: urlData.publicUrl, attachment_url: urlData.publicUrl }
          : { image_url: urlData.publicUrl };
      const { error: updateError } = await supabase
        .from(moduleTable)
        .update(imageUpdatePayload)
        .eq('id', id);
      if (updateError) throw updateError;

      const hasFileManagerTables = await detectFileManagerTables(supabase, false);
      if (hasFileManagerTables) {
        try {
          await createFileManagerOriginForUpload({
            moduleId,
            recordId: id,
            recordTitle: getRecordTitle(data || { id }, moduleConfig, { fallback: String(id) }),
            fileUrl: urlData.publicUrl,
            fileName: file.name || null,
            mimeType: file.type || null,
            fileType: 'image',
            sortOrder: 0,
          });
        } catch (fileManagerError) {
          console.warn('Could not append uploaded image to file manager tables', fileManagerError);
        }
      } else {
        const { error: fileInsertError } = await supabase
          .from('record_files')
          .insert([
            {
              module_id: moduleId,
              record_id: id,
              file_url: urlData.publicUrl,
              file_type: 'image',
              file_name: file.name || null,
              mime_type: file.type || null,
              sort_order: 0,
            },
          ]);
        if (fileInsertError) {
          console.warn('Could not append uploaded image to record_files', fileInsertError);
        }
      }
      setData((prev: any) => ({
        ...prev,
        image_url: urlData.publicUrl,
        ...(moduleId === 'cash_bank_operations' ? { attachment_url: urlData.publicUrl } : {}),
      }));
      await insertChangelog({
        action: 'file_attached',
        fieldName: 'image_url',
        fieldLabel: 'تصویر اصلی',
        oldValue: data?.image_url ?? null,
        newValue: file.name || 'تصویر',
        metadata: {
          changeKind: 'file_attached',
          fileName: file.name || null,
          fileType: 'image',
          summary: 'تصویر به رکورد پیوست شد',
        },
        touchRecord: true,
      });
      msg.success('تصویر بروزرسانی شد');
    } catch (e: any) {
      if (isUploadCanceledError(e)) return false;
      msg.error(toFaErrorMessage(e, 'عملیات ناموفق بود.'));
    } finally { setUploadingImage(false); }
    return false;
  }, [canEditModule, id, moduleId, msg]);

  const recordSupportsFileSave = useMemo(
    () => Boolean((moduleConfig?.fields || []).some((field: any) => String(field?.key || '').trim() === 'image_url')),
    [moduleConfig]
  );

  const sanitizePrintFileName = useCallback((rawName: string) => {
    const baseName = String(rawName || 'print')
      .normalize('NFKD')
      .replace(/[^\x00-\x7F]/g, ' ')
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[_\-.]+|[_\-.]+$/g, '')
      .slice(0, 120) || 'print';
    return baseName.toLowerCase().endsWith('.pdf') ? baseName : `${baseName}.pdf`;
  }, []);

  const buildDirectPrintDisplayName = useCallback((templateTitleValue?: string | null) => {
    const recordTitle = String(getRecordTitle(data || { id }, moduleConfig, { fallback: '' }) || '').trim();
    const templateTitle = String(templateTitleValue || '').trim();
    const baseName = [recordTitle, templateTitle]
      .filter(Boolean)
      .filter((value, index, all) => all.findIndex((item) => item === value) === index)
      .join(' - ')
      .trim() || recordTitle || templateTitle || 'فایل PDF';
    return baseName.toLowerCase().endsWith('.pdf') ? baseName : `${baseName}.pdf`;
  }, [data, id, moduleConfig]);

  const normalizeSmsPhone = useCallback((value: unknown) => {
    let digits = String(value ?? '')
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/[^\d]/g, '')
      .trim();
    if (!digits) return '';
    if (digits.startsWith('0098')) digits = `0${digits.slice(4)}`;
    else if (digits.startsWith('98')) digits = `0${digits.slice(2)}`;
    else if (digits.length === 10 && digits.startsWith('9')) digits = `0${digits}`;
    return /^09\d{9}$/.test(digits) ? digits : '';
  }, []);

  const uploadGeneratedPdf = useCallback(async (
    blob: Blob,
    rawFileName: string,
    templateTitle?: string | null,
    tracker?: ReturnType<typeof createPrintPerformanceTracker>
  ) => {
    if (!id) {
      throw new Error('record_missing');
    }
    const fileName = sanitizePrintFileName(rawFileName);
    const displayName = buildDirectPrintDisplayName(templateTitle);
    const pdfFile = new File([blob], fileName, { type: 'application/pdf' });
    const filePath = joinStoragePath('record_files', moduleId, id, 'prints', `${Date.now()}_${sanitizeStorageFileName(fileName)}`);
    tracker?.addMetadata({
      uploadFileName: fileName,
      displayFileName: displayName,
      uploadFileSize: blob.size,
    });
    const uploadTask = async () => {
      await uploadFileWithProgress({
        client: fileStorageClient,
        bucket: FILE_STORAGE_BUCKET,
        path: filePath,
        file: pdfFile,
        label: fileName,
        detail: 'PDF چاپ',
      });
      const { data: urlData } = fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(filePath);
      return {
        url: urlData.publicUrl,
        name: displayName,
      };
    };
    const uploaded = tracker
      ? await tracker.step('upload_generated_pdf', uploadTask, (result) => ({
          uploadedName: result.name,
          uploadedUrlLength: String(result.url || '').length,
        }))
      : await uploadTask();
    return {
      url: uploaded.url,
      name: uploaded.name,
    };
  }, [buildDirectPrintDisplayName, id, moduleId, sanitizePrintFileName]);

  const printShareTargetOptions = useMemo(() => [
    ...printShareBotGroups.map((group) => ({
      label: `بات ${CUSTOMER_BOT_CHANNEL_LABELS[group.channel_type]}: ${group.title}`,
      value: `bot_group:${group.id}`,
    })),
    ...printShareGroups.map((group) => ({
      label: `گروه داخلی: ${group.name}`,
      value: `chat_group:${group.id}`,
    })),
    ...allUsers
      .filter((user) => String(user?.id || '') !== String(currentUserId || ''))
      .map((user) => ({
        label: `داخلی: ${user.full_name || user.email || user.mobile_1 || user.id}`,
        value: `user:${user.id}`,
      })),
    ...allUsers
      .filter((user) => String(user?.id || '') !== String(currentUserId || '') && String(user?.mobile_1 || '').trim())
      .map((user) => ({
        label: `پیامک: ${user.full_name || user.email || user.mobile_1 || user.id}`,
        value: `sms_user:${user.id}`,
      })),
  ], [allUsers, currentUserId, printShareBotGroups, printShareGroups]);

  useEffect(() => {
    if (!printShareModalOpen || !currentOrgId) return;
    let cancelled = false;
    const loadPrintShareGroups = async () => {
      const { data: groupsData, error } = await supabase
        .from('chat_groups')
        .select('id, name, user_ids, role_ids')
        .eq('org_id', currentOrgId)
        .order('updated_at', { ascending: false })
        .limit(200);
      if (error) {
        if (!cancelled) setPrintShareGroups([]);
        return;
      }
      if (!cancelled) {
        setPrintShareGroups((groupsData || []).map((group: any) => ({
          id: String(group?.id || ''),
          name: String(group?.name || 'گروه'),
          user_ids: Array.isArray(group?.user_ids) ? group.user_ids.map((value: any) => String(value)) : [],
          role_ids: Array.isArray(group?.role_ids) ? group.role_ids.map((value: any) => String(value)) : [],
        })));
      }

      const { data: botGroupsData, error: botGroupsError } = await supabase
        .from('counterparty_bot_groups')
        .select('id, group_title, group_join_link, channel_type, bot_chat_id, customer_id, supplier_id')
        .in('channel_type', ['telegram', 'bale', 'rubika'])
        .order('updated_at', { ascending: false })
        .limit(200);
      if (botGroupsError) {
        if (!cancelled) setPrintShareBotGroups([]);
        return;
      }
      if (!cancelled) {
        setPrintShareBotGroups((botGroupsData || [])
          .map((row: any) => {
            const channelType = String(row?.channel_type || '').trim() as 'telegram' | 'bale' | 'rubika';
            if (!['telegram', 'bale', 'rubika'].includes(channelType)) return null;
            return {
              id: String(row?.id || ''),
              title: String(row?.group_title || row?.group_join_link || row?.id || 'گروه بات').trim(),
              channel_type: channelType,
              bot_chat_id: String(row?.bot_chat_id || '').trim(),
              customer_id: row?.customer_id ? String(row.customer_id) : null,
              supplier_id: row?.supplier_id ? String(row.supplier_id) : null,
            };
          })
          .filter(Boolean) as Array<{
            id: string;
            title: string;
            channel_type: 'telegram' | 'bale' | 'rubika';
            bot_chat_id: string;
            customer_id: string | null;
            supplier_id: string | null;
          }>);
      }
    };
    void loadPrintShareGroups();
    return () => {
      cancelled = true;
    };
  }, [currentOrgId, printShareModalOpen]);

  const handleSavePrintPdfToRecord = async () => {
    if (!id) {
      msg.warning('ابتدا رکورد را ذخیره کنید');
      return;
    }
    const { tracker, messageKey, uploaded } = await prepareDirectPdfAsset('print_save_to_record');
    try {
      msg.open({ key: messageKey, type: 'loading', content: 'در حال ثبت PDF در فایل‌های رکورد...', duration: 0 });
      const hasFileManagerTables = await detectFileManagerTables(supabase, false);
      if (hasFileManagerTables) {
        await tracker.step(
          'insert_file_manager_origin',
          async () => await createFileManagerOriginForUpload({
            moduleId,
            recordId: id,
            recordTitle: getRecordTitle(data || { id }, moduleConfig, { fallback: String(id) }),
            fileUrl: uploaded.url,
            fileName: uploaded.name,
            mimeType: 'application/pdf',
            fileType: 'file',
            sortOrder: 0,
          }),
          (result: any) => ({
            assetId: result?.asset?.id ? String(result.asset.id) : null,
            entryId: result?.entry?.id ? String(result.entry.id) : null,
          })
        );
      } else {
        const { error } = await tracker.step(
          'insert_record_file_row',
          async () => await (supabase
            .from('record_files')
            .insert([{
              module_id: moduleId,
              record_id: id,
              file_url: uploaded.url,
              file_type: 'file',
              file_name: uploaded.name,
              mime_type: 'application/pdf',
              sort_order: 0,
            }]) as any),
          (result: any) => ({ insertError: result?.error ? String(result.error.message || result.error) : null })
        );
        if (error) throw error;
      }
      tracker.finalize({ status: 'saved_to_record', uploadedUrl: uploaded.url });
      await insertChangelog({
        action: 'file_attached',
        fieldName: 'record_files',
        fieldLabel: 'فایل‌های رکورد',
        oldValue: null,
        newValue: uploaded.name,
        metadata: {
          changeKind: 'file_attached',
          fileName: uploaded.name || null,
          fileType: 'file',
          summary: 'فایل به رکورد پیوست شد',
        },
        touchRecord: true,
      });
      msg.success({ key: messageKey, content: 'PDF در فایل‌های رکورد ذخیره شد.' });
    } catch (error) {
      tracker.finalize({
        status: 'failed_after_upload',
        uploadedUrl: uploaded.url,
        error: String((error as any)?.message || error || 'unknown_error'),
      });
      msg.error({ key: messageKey, content: toFaErrorMessage(error as any, 'ذخیره PDF در فایل‌های رکورد ناموفق بود.') });
      throw error;
    }
  };

  const handleOpenPrintShare = async () => {
    if (!id) {
      msg.warning('ابتدا رکورد را ذخیره کنید');
      return;
    }
    const { tracker, messageKey, uploaded } = await prepareDirectPdfAsset('print_share_prepare');
    tracker.finalize({ status: 'ready_for_share', uploadedUrl: uploaded.url });
    msg.destroy(messageKey);
    setPendingPrintShareFile(uploaded);
    setPrintShareTargetIds([]);
    setPrintShareMessageText('');
    setPrintShareTemplateModalOpen(false);
    setPrintShareModalOpen(true);
  };

  const handleSubmitPrintShare = async () => {
    if (!pendingPrintShareFile || !id) return;
    const normalizedTargets = Array.from(new Set(printShareTargetIds.map((value) => String(value || '').trim()).filter(Boolean)));
    if (normalizedTargets.length === 0) {
      msg.warning('حداقل یک مقصد معتبر انتخاب کنید');
      return;
    }
    const scope = normalizeNoteScope(moduleId, id);
    const authorName = allUsers.find((user) => String(user?.id || '') === String(currentUserId || ''))?.full_name || null;
    const noteText = String(printShareMessageText || '').trim();
    const attachment = [{ url: pendingPrintShareFile.url, name: pendingPrintShareFile.name, mimeType: 'application/pdf' }];
    const externalAttachment = await shortenAttachmentsForExternalShare(attachment as any, {
      moduleId: scope.module_id,
      recordId: scope.record_id,
      title: pendingPrintShareFile.name,
      metadata: {
        source_type: 'print_share',
      },
    });
    const externalText = [
      noteText,
      externalAttachment.map((item) => `فایل: ${String(item?.url || '').trim()}`).filter(Boolean).join('\n'),
    ].filter(Boolean).join('\n');
    const attachmentNameText = `پیوست‌ها:\n🔗 ${String(pendingPrintShareFile.name || 'فایل PDF').trim() || 'فایل PDF'}`;
    const payloads: Array<Record<string, any>> = [];
    const smsRecipients = new Set<string>();
    const botTargets: Array<{
      id: string;
      channel_type: 'telegram' | 'bale' | 'rubika';
      bot_chat_id: string;
      customer_id: string | null;
      supplier_id: string | null;
    }> = [];
    normalizedTargets.forEach((targetId) => {
      const normalizedTarget = String(targetId || '').trim();
      if (!normalizedTarget) return;
      if (normalizedTarget.startsWith('chat_group:')) {
        const groupId = normalizedTarget.replace('chat_group:', '');
        const group = printShareGroups.find((item) => item.id === groupId);
        if (!group) return;
        const roleDrivenUserIds = allUsers
          .filter((user) => user?.role_id && group.role_ids.includes(String(user.role_id)))
          .map((user) => String(user.id));
        const mentionUserIds = Array.from(new Set([...group.user_ids, ...roleDrivenUserIds])).filter((userId) => userId !== String(currentUserId || ''));
        payloads.push({
          module_id: scope.module_id,
          record_id: scope.record_id,
          content: serializeNoteContent(noteText, attachment as any),
          reply_to: null,
          mention_user_ids: mentionUserIds,
          mention_role_ids: group.role_ids,
          author_id: currentUserId,
          author_name: authorName,
          metadata: { chat_group_id: group.id },
        });
        return;
      }
      if (normalizedTarget.startsWith('bot_group:')) {
        const groupId = normalizedTarget.replace('bot_group:', '');
        const group = printShareBotGroups.find((item) => item.id === groupId);
        if (!group) return;
        botTargets.push(group);
        return;
      }
      if (normalizedTarget.startsWith('sms_user:')) {
        const userId = normalizedTarget.replace('sms_user:', '');
        const user = allUsers.find((item) => String(item?.id || '') === userId);
        const mobile = normalizeSmsPhone(user?.mobile_1);
        if (!mobile) return;
        smsRecipients.add(mobile);
        return;
      }
      if (normalizedTarget.startsWith('user:')) {
        const userId = normalizedTarget.replace('user:', '');
        if (!userId || userId === String(currentUserId || '')) return;
        payloads.push({
          module_id: scope.module_id,
          record_id: scope.record_id,
          content: serializeNoteContent(noteText, attachment as any),
          reply_to: null,
          mention_user_ids: [userId],
          mention_role_ids: [],
          author_id: currentUserId,
          author_name: authorName,
          metadata: null,
        });
      }
    });

    if (payloads.length === 0 && botTargets.length === 0 && smsRecipients.size === 0) {
      msg.warning('حداقل یک مقصد معتبر انتخاب کنید');
      return;
    }

    setPrintShareSubmitting(true);
    try {
      if (payloads.length > 0) {
        await insertNotesWithFallback(payloads);
      }
      for (const target of botTargets) {
        if (!target.bot_chat_id) {
          throw new Error(`chat id برای گروه بات "${target.id}" تنظیم نشده است.`);
        }
        const activeConnection = await getActiveChannelSettings(target.channel_type);
        const connectionId = String(activeConnection?.id || '').trim();
        if (!connectionId) {
          throw new Error(`تنظیمات فعال بات ${CUSTOMER_BOT_CHANNEL_LABELS[target.channel_type]} پیدا نشد.`);
        }
        const isRubikaTarget = String(target.channel_type || '').trim() === 'rubika';
        const botMessageText = isRubikaTarget
          ? (String(noteText || '').trim() || 'PDF ارسال شد.')
          : (externalText || 'PDF ارسال شد.');
        const fallbackText = isRubikaTarget
          ? [noteText, attachmentNameText].filter(Boolean).join('\n')
          : undefined;
        const { data: proxyData, error: proxyError } = await supabase.functions.invoke('bot-admin', {
          body: {
            action: 'send_test_message',
            channel: target.channel_type,
            connectionId,
            chatId: target.bot_chat_id,
            text: botMessageText,
            skipLog: false,
            fallbackText,
            attachments: isRubikaTarget ? attachment.map((item) => ({
              url: item.url,
              name: item.name,
              mimeType: 'application/pdf',
              fileType: 'file',
            })) : undefined,
          },
        });
        if (proxyError) throw proxyError;
        if (!proxyData?.success) {
          throw new Error(String(proxyData?.message || 'ارسال پیام بات ناموفق بود.'));
        }

        const providerResponse = proxyData?.provider_result || {};
        const currentSender = allUsers.find((user) => String(user?.id || '') === String(currentUserId || '')) || null;
        const senderPayload = {
          sender_user_id: String(currentUserId || '').trim() || null,
          sender_profile_id: String(currentUserId || '').trim() || null,
          sender_display_name: String(currentSender?.full_name || currentSender?.email || currentSender?.mobile_1 || '').trim() || null,
          sender_avatar_url: String(currentSender?.avatar_url || '').trim() || null,
        };
        const { error: insertError } = await supabase
          .from('counterparty_bot_messages')
          .insert([{
            bot_group_id: target.id,
            customer_id: target.customer_id,
            supplier_id: target.supplier_id,
            channel_type: target.channel_type,
            direction: 'outbound',
            message_type: 'file',
            chat_id: target.bot_chat_id,
            provider_message_id: String(providerResponse?.result?.message_id || providerResponse?.message_id || providerResponse?.data?.message_id || '') || null,
            content_text: String(botMessageText || '').trim(),
            file_url: pendingPrintShareFile.url,
            file_name: pendingPrintShareFile.name,
            mime_type: 'application/pdf',
            created_by: String(currentUserId || '').trim() || null,
            payload: {
              attachments: attachment,
              external_attachments: externalAttachment,
              ...senderPayload,
              provider_response: providerResponse || {},
            },
          }]);
        if (insertError) throw insertError;
      }
      if (smsRecipients.size > 0) {
        await sendSmsViaGateway({
          to: Array.from(smsRecipients),
          text: externalText || 'PDF ارسال شد.',
          allowDirectFallback: true,
          moduleId,
          recordId: id,
          title: 'ارسال مستقیم PDF',
          metadata: {
            source_type: 'print_share',
            file_url: pendingPrintShareFile.url,
          },
        });
      }
      setPrintShareModalOpen(false);
      setPendingPrintShareFile(null);
      setPrintShareTargetIds([]);
      setPrintShareMessageText('');
      msg.success('ارسال مستقیم انجام شد.');
    } catch (error: any) {
      msg.error(toFaErrorMessage(error, 'ارسال مستقیم ناموفق بود.'));
    } finally {
      setPrintShareSubmitting(false);
    }
  };


  const getFieldLabel = useCallback(
    (fieldKey: string) => getFieldLabelFa(moduleConfig?.fields?.find(f => f.key === fieldKey), { moduleId, fallback: fieldKey }),
    [moduleConfig]
  );

  const insertChangelog = useCallback(
    async (payload: {
      action: string;
      fieldName?: string;
      fieldLabel?: string;
      oldValue?: any;
      newValue?: any;
      metadata?: Record<string, any>;
      touchRecord?: boolean;
    }) => {
      try {
        if (!moduleId || !id) return;
        const authUser = await getCachedAuthUser(supabase);
        const userId = authUser?.id || null;
        const recordTitle = getRecordTitle(data, moduleConfig) || null;

        if (payload.touchRecord) {
          await logAndTouchRecord({
            supabase,
            moduleId,
            recordId: id,
            action: payload.action,
            fieldName: payload.fieldName || null,
            fieldLabel: payload.fieldLabel || null,
            oldValue: payload.oldValue,
            newValue: payload.newValue,
            userId,
            recordTitle,
            metadata: payload.metadata,
          });
          return;
        }

        await insertRecordActivity({
          supabase,
          moduleId,
          recordId: id,
          action: payload.action,
          fieldName: payload.fieldName || null,
          fieldLabel: payload.fieldLabel || null,
          oldValue: payload.oldValue,
          newValue: payload.newValue,
          userId,
          recordTitle,
          metadata: payload.metadata,
        });
      } catch (err) {
        console.warn('Changelog insert failed:', err);
      }
    },
    [moduleId, id, data, moduleConfig]
  );

  const logFieldChange = useCallback(
    async (fieldKey: string, oldValue: any, newValue: any) => {
      await insertChangelog({
        action: 'update',
        fieldName: fieldKey,
        fieldLabel: getFieldLabel(fieldKey),
        oldValue,
        newValue,
      });
    },
    [getFieldLabel, insertChangelog]
  );

  const handleMainImageChange = useCallback(async (url: string | null) => {
    if (!canEditModule) return;
    try {
      const updatePayload = moduleId === 'cash_bank_operations'
        ? { image_url: url, attachment_url: url }
        : { image_url: url };
      const { error } = await supabase.from(moduleTable).update(updatePayload).eq('id', id);
      if (error) throw error;
      setData((prev: any) => ({
        ...prev,
        image_url: url,
        ...(moduleId === 'cash_bank_operations' ? { attachment_url: url } : {}),
      }));
      await insertChangelog({
        action: 'update',
        fieldName: 'image_url',
        fieldLabel: getFieldLabel('image_url'),
        oldValue: data?.image_url ?? null,
        newValue: url,
      });
      msg.success('تصویر اصلی بروزرسانی شد');
    } catch (e: any) {
      msg.error(toFaErrorMessage(e, 'بروزرسانی تصویر ناموفق بود.'));
    }
  }, [canEditModule, data?.image_url, getFieldLabel, id, insertChangelog, moduleId, msg]);

  const handleCreateOrderFromBom = useCallback(async (values: any) => {
    try {
      const { data: inserted, error } = await supabase
        .from('production_orders')
        .insert(values)
        .select('id')
        .single();
      if (error) throw error;
      if (inserted?.id) {
        const postPayload: any = {};
        if (values?.grid_materials !== undefined) postPayload.grid_materials = values.grid_materials;
        if (values?.production_stages_draft !== undefined) postPayload.production_stages_draft = values.production_stages_draft;
        if (Object.keys(postPayload).length > 0) {
          await supabase.from('production_orders').update(postPayload).eq('id', inserted.id);
        }
        const hasDraftStages = Array.isArray(values?.production_stages_draft) && values.production_stages_draft.length > 0;
        if (hasDraftStages) {
          await supabase.from('production_lines').insert({
            production_order_id: inserted.id,
            line_no: 1,
            quantity: 0,
          });
        }
      }
      setIsCreateOrderOpen(false);
      msg.success('سفارش تولید ایجاد شد');
      if (inserted?.id) {
        navigate(`/production_orders/${inserted.id}`);
      }
    } catch (e: any) {
      msg.error(toFaErrorMessage(e, 'ایجاد سفارش تولید ناموفق بود.'));
    }
  }, [msg, navigate]);

  const saveEdit = async (key: string) => {
    if (!canEditModule) return;
    // A field save can dispatch asynchronous automation. Guard the entry point so
    // repeated taps on the confirmation icon never submit the same edit twice.
    if (savingField === key) return;
    if (moduleId === 'production_orders' && key === 'status') {
      setSavingField(key);
      try {
        const newStatus = tempValues[key];
        await handleProductionStatusChange(String(newStatus));
        setTimeout(() => setEditingFields(prev => ({ ...prev, [key]: false })), 100);
      } finally {
        setSavingField(null);
      }
      return;
    }
    setSavingField(key);
    let newValue = tempValues[key];
    const fieldDef = moduleConfig?.fields.find((field) => String(field?.key || '') === String(key));
    if (newValue === '' || newValue === undefined) newValue = null;
    if (fieldDef?.type === FieldType.MULTI_RELATION) {
      const normalizedValues = Array.isArray(newValue)
        ? newValue.map((item: any) => String(item ?? '').trim()).filter(Boolean)
        : [];
      newValue = normalizedValues.length > 0 ? normalizedValues : null;
    }
    try {
      const taskSourceEditKeys = new Set([
        'related_to_module',
        'source_record_id',
        'related_product',
        'related_customer',
        'related_supplier',
        'related_production_order',
        'related_invoice',
        'project_id',
        'purchase_invoice_id',
        'marketing_lead_id',
      ]);
      const processTaskCustomField = taskProcessCustomFields.find((field: any) => String(field?.key || '') === String(key));
      if (moduleId === 'tasks' && processTaskCustomField) {
        const recurrence = data?.recurrence_info && typeof data.recurrence_info === 'object' ? data.recurrence_info : {};
        const fields = getProcessTaskCustomFieldsFromRecurrence(recurrence);
        const currentValues = mergeProcessTaskCustomFieldValues(
          fields,
          getProcessTaskCustomFieldValuesFromRecurrence(recurrence)
        );
        const nextValues = {
          ...currentValues,
          [key]: newValue,
        };
        const nextRecurrence = {
          ...recurrence,
          [PROCESS_TASK_CUSTOM_FIELDS_KEY]: fields,
          [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: nextValues,
        };
        const { error } = await supabase.from('tasks').update({ recurrence_info: nextRecurrence }).eq('id', id);
        if (error) throw error;
        const nextData = withProcessTaskCustomFieldValues({ ...(data || {}), recurrence_info: nextRecurrence });
        setData(nextData);
        markCurrentModuleListChanged({ recurrence_info: nextRecurrence });
        await insertChangelog({
          action: 'update',
          fieldName: key,
          fieldLabel: getFieldLabel(key),
          oldValue: data?.[key],
          newValue,
        });
        msg.success('ذخیره شد');
        setTimeout(() => setEditingFields(prev => ({ ...prev, [key]: false })), 100);
        return;
      }
      if (moduleId === 'tasks' && key === 'status') {
        const optimisticStatus = String(newValue || '');
        setData((prev: any) => ({ ...(prev || {}), status: optimisticStatus }));
        setTempValues((prev) => ({ ...(prev || {}), status: optimisticStatus }));
        const updatedTask = await updateTaskStatusWithAutomation({
          taskId: String(id),
          nextStatus: String(newValue || ''),
          previousTask: data || null,
          currentUser: {
            id: currentUserId,
            fullName: null,
          },
        });
        await runWorkflowsForEvent({
          moduleId,
          event: 'upsert',
          currentRecord: updatedTask as Record<string, any>,
          previousRecord: (data || null) as Record<string, any> | null,
        });
        setData((prev: any) => ({ ...(prev || {}), ...updatedTask }));
        setTempValues((prev) => ({ ...(prev || {}), status: updatedTask.status }));
        markCurrentModuleListChanged(updatedTask as Record<string, any>);
        await insertChangelog({
          action: 'update',
          fieldName: key,
          fieldLabel: getFieldLabel(key),
          oldValue: data?.[key],
          newValue: updatedTask.status,
        });
        msg.success('ذخیره شد');
        setTimeout(() => setEditingFields(prev => ({ ...prev, [key]: false })), 100);
        return;
      }
      const isCashBankAccountEdit =
        moduleId === 'cash_bank_operations'
        && ['operation_type', 'payment_account_id', 'receipt_account_id', 'assignee_id', 'assignee_type', 'assignee_role_id', 'image_url', 'attachment_url'].includes(String(key));
      let updatePayload = moduleId === 'tasks' && taskSourceEditKeys.has(key)
        ? buildTaskSourcePatch({ ...(data || {}), ...tempValues, [key]: newValue })
        : { [key]: newValue };
      if (isCashBankAccountEdit) {
        const nextCashBankValues = normalizeModuleFormValues(moduleId, {
          ...(data || {}),
          ...tempValues,
          [key]: newValue,
        });
        if (key !== 'operation_type') {
          const validationError = validateModuleFormValues(moduleId, nextCashBankValues, relationOptions);
          if (validationError) {
            throw new Error(validationError);
          }
        }
        const transformedCashBankValues = transformModulePayloadForSave(moduleId, nextCashBankValues, relationOptions);
        updatePayload = {
          operation_type: transformedCashBankValues.operation_type || null,
          assignee_id: transformedCashBankValues.assignee_id ?? null,
          assignee_type: transformedCashBankValues.assignee_type ?? null,
          assignee_role_id: transformedCashBankValues.assignee_role_id ?? null,
          image_url: transformedCashBankValues.image_url ?? null,
          attachment_url: transformedCashBankValues.attachment_url ?? null,
          employee_id: transformedCashBankValues.employee_id ?? null,
          bank_account_id: transformedCashBankValues.bank_account_id ?? null,
          cash_box_id: transformedCashBankValues.cash_box_id ?? null,
          petty_fund_id: transformedCashBankValues.petty_fund_id ?? null,
          payment_bank_account_id: transformedCashBankValues.payment_bank_account_id ?? null,
          payment_cash_box_id: transformedCashBankValues.payment_cash_box_id ?? null,
          payment_petty_fund_id: transformedCashBankValues.payment_petty_fund_id ?? null,
          receipt_bank_account_id: transformedCashBankValues.receipt_bank_account_id ?? null,
          receipt_cash_box_id: transformedCashBankValues.receipt_cash_box_id ?? null,
          receipt_petty_fund_id: transformedCashBankValues.receipt_petty_fund_id ?? null,
        };
        if (String(nextCashBankValues.operation_type || '').trim() === 'transfer') {
          Object.assign(updatePayload, {
            sales_invoice_id: null,
            purchase_invoice_id: null,
            expense_document_id: null,
            employee_advance_id: null,
            payroll_slip_id: null,
            customer_id: null,
            supplier_id: null,
            cheque_id: null,
            barter_id: null,
          });
        }
      }
      const { error } = await supabase.from(moduleTable).update(updatePayload).eq('id', id);
      if (error) throw error;
      if ((moduleId === 'invoices' || moduleId === 'purchase_invoices') && key === 'status') {
        const authUser = await getCachedAuthUser(supabase);
        const userId = authUser?.id || null;
        await applyInvoiceFinalizationInventory({
          supabase: supabase as any,
          moduleId,
          recordId: id || '',
          previousStatus: data?.status ?? null,
          nextStatus: newValue,
          invoiceItems: data?.invoiceItems || [],
          userId,
        });
        if (shouldAutoSyncInvoiceAccounting(moduleId)) {
          const accountingSync = await syncInvoiceAccountingEntries({
          supabase: supabase as any,
          moduleId,
          recordId: id || '',
          recordData: {
            ...(data || {}),
            [key]: newValue,
          },
          includePayments: true,
        });
          if (accountingSync.errors.length > 0) {
          console.warn('هشدارهای همگام‌سازی سند حسابداری فاکتور:', accountingSync.errors);
          msg.warning(`هشدار صدور سند: ${toFaAccountingSyncError(accountingSync.errors[0])}`);
          }
        }
      }
      if (moduleId === 'stock_transfers' && key === 'status') {
        const authUser = await getCachedAuthUser(supabase);
        const userId = authUser?.id || null;
        await applyStockTransferInventory({
          supabase: supabase as any,
          recordId: id || '',
          previousStatus: data?.status ?? null,
          nextStatus: newValue,
          recordData: {
            ...(data || {}),
            [key]: newValue,
          },
          userId,
        });
      }
      if (moduleId === 'invoices' && (key === 'status' || key === 'customer_id')) {
        const nextCustomerId = key === 'customer_id'
          ? newValue
          : data?.customer_id;
        await syncCustomerLevelsByInvoiceCustomers({
          supabase: supabase as any,
          customerIds: [data?.customer_id, nextCustomerId],
        });
      }
      await runWorkflowsForEvent({
        moduleId,
        event: 'upsert',
        currentRecord: {
          ...(data || {}),
          ...updatePayload,
          id,
        } as Record<string, any>,
        previousRecord: (data || null) as Record<string, any> | null,
      });
      setData((prev: any) => (
        isCashBankAccountEdit
          ? { ...(prev || {}), ...updatePayload }
          : moduleId === 'tasks' && taskSourceEditKeys.has(key)
          ? { ...(prev || {}), ...updatePayload }
          : { ...(prev || {}), [key]: newValue }
      ));
      markCurrentModuleListChanged(updatePayload);
      await insertChangelog({
        action: 'update',
        fieldName: key,
        fieldLabel: getFieldLabel(key),
        oldValue: data?.[key],
        newValue,
      });
      msg.success('ذخیره شد');
      setTimeout(() => setEditingFields(prev => ({ ...prev, [key]: false })), 100);
    } catch (error: any) {
      if (moduleId === 'tasks' && key === 'status') {
        const fallbackStatus = data?.status ?? null;
        setData((prev: any) => ({ ...(prev || {}), status: fallbackStatus }));
        setTempValues((prev) => ({ ...(prev || {}), status: fallbackStatus }));
      }
      msg.error(toFaErrorMessage(error, 'عملیات ناموفق بود.'));
    } finally { setSavingField(null); }
  };

  const areValuesEqual = (a: any, b: any) => {
    if (Array.isArray(a) || Array.isArray(b)) {
      try {
        return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
      } catch {
        return a === b;
      }
    }
    return a === b;
  };

  const syncProcessTemplateStages = useCallback(
    (templateId: string, rawStages: any[]) =>
      syncProcessTemplateStagesShared(supabase, templateId, rawStages),
    [],
  );

  const handleSmartFormSave = useCallback(async (
    values: any,
    meta?: SmartFormSaveMeta
  ) => {
    try {
      if (!id) return;
      if (moduleConfig?.formAdapter?.save) {
        const result = await moduleConfig.formAdapter.save({
          mode: 'update',
          recordId: String(id),
          values,
          currentValues: data || {},
          meta: meta || null,
        });
        msg.success('ذخیره شد');
        setIsEditDrawerOpen(false);
        const nextRecordId = String(result?.id || '').trim();
        if (nextRecordId && nextRecordId !== String(id)) {
          navigate(`/${moduleId}/${nextRecordId}`, { replace: true });
          return;
        }
        markCurrentModuleListChanged(values);
        void fetchRecord(true);
        return;
      }
      if (moduleId === 'process_templates') {
        values = syncProcessTemplateTargetModules(values);
      }
      const previous = data || {};
      values = normalizeOperationalDocumentTotals(moduleId, values);
      const authUser = await getCachedAuthUser(supabase);
      const authUserId = authUser?.id || null;
      const withUpdateAuditFields = (recordPayload: Record<string, any>) => {
        if (!authUserId) return { ...recordPayload };
        return {
          ...recordPayload,
          updated_by: recordPayload.updated_by ?? authUserId,
        };
      };
      const isMissingAuditColumnError = (error: any) => {
        const code = String(error?.code || '').toUpperCase();
        const text = String(error?.message || error?.details || '').toLowerCase();
        return (
          code === '42703'
          || code === 'PGRST204'
          || text.includes('created_by')
          || text.includes('updated_by')
        );
      };
      const persistedValues = withUpdateAuditFields(values);

      const changedKeys = Object.keys(values).filter((k) => !areValuesEqual(values[k], previous[k]));

      let updateResult = await supabase.from(moduleTable).update(persistedValues).eq('id', id);
      if (updateResult.error && isMissingAuditColumnError(updateResult.error)) {
        updateResult = await supabase.from(moduleTable).update(values).eq('id', id);
      }
      if (updateResult.error) throw updateResult.error;
      let allocatedInvoiceIds: string[] = [String(id)];
      if (
        (moduleId === 'invoices' || moduleId === 'purchase_invoices')
        && meta?.invoicePaymentAllocation
      ) {
        const allocation = meta.invoicePaymentAllocation;
        const changedRows = await applyInvoicePaymentAllocation({
          supabase: supabase as any,
          moduleId,
          sourceInvoiceId: String(id),
          sourceRowKey: allocation.plan.segments[0]?.sourceRowKey || '',
          sourcePayments: allocation.plan.sourcePayments,
          allocationGroupKey: allocation.allocationGroupKey,
          allocations: allocation.allocations,
          plan: allocation.plan,
        });
        allocatedInvoiceIds = Array.from(new Set(
          changedRows
            .map((row: any) => String(row?.invoice_id || '').trim())
            .filter(Boolean)
        ));
      }
      if (moduleId === 'process_templates') {
        await syncProcessTemplateStages(String(id), meta?.templateStagesPreview || []);
      }
      markCurrentModuleListChanged(persistedValues);

      if (moduleId === 'invoices' || moduleId === 'purchase_invoices') {
        await applyInvoiceFinalizationInventory({
          supabase: supabase as any,
          moduleId,
          recordId: id,
          previousStatus: previous?.status || null,
          nextStatus: values?.status ?? previous?.status ?? null,
          invoiceItems: values?.invoiceItems ?? previous?.invoiceItems ?? [],
          userId: authUserId,
        });
        if (shouldAutoSyncInvoiceAccounting(moduleId)) {
          for (const invoiceId of allocatedInvoiceIds) {
            const accountingSync = await syncInvoiceAccountingEntries({
              supabase: supabase as any,
              moduleId,
              recordId: invoiceId,
              recordData: invoiceId === String(id) ? {
                ...previous,
                ...persistedValues,
              } : undefined,
              includePayments: true,
            });
            if (accountingSync.errors.length > 0) {
              console.warn('هشدارهای همگام‌سازی سند حسابداری فاکتور:', accountingSync.errors);
              msg.warning(`هشدار صدور سند: ${toFaAccountingSyncError(accountingSync.errors[0])}`);
            }
          }
        }
      }
      if (moduleId === 'invoices') {
        await syncCustomerLevelsByInvoiceCustomers({
          supabase: supabase as any,
          customerIds: [previous?.customer_id, values?.customer_id],
        });
      }
      if (moduleId === 'stock_transfers') {
        await applyStockTransferInventory({
          supabase: supabase as any,
          recordId: id,
          previousStatus: previous?.status || null,
          nextStatus: values?.status ?? previous?.status ?? null,
          recordData: {
            ...previous,
            ...persistedValues,
          },
          userId: authUserId,
        });
      }

      await runWorkflowsForEvent({
        moduleId,
        event: 'upsert',
        currentRecord: {
          ...previous,
          ...persistedValues,
          id,
        } as Record<string, any>,
        previousRecord: previous as Record<string, any>,
      });

      for (const key of changedKeys) {
        await logFieldChange(key, previous[key], values[key]);
      }

      msg.success('ذخیره شد');
      setIsEditDrawerOpen(false);
      void fetchRecord(true);
    } catch (err: any) {
      msg.error(toFaErrorMessage(err, 'عملیات ناموفق بود.'));
    }
  }, [data, fetchRecord, id, logFieldChange, markCurrentModuleListChanged, moduleConfig, moduleId, msg, navigate, syncProcessTemplateStages]);

  const openResolvedAccountingEntries = useCallback((entries: ResolvedJournalEntry[]) => {
    const choices = buildAccountingEntryChoices(entries);
    if (choices.length === 0) return false;
    const journalModule = MODULES.journal_entries;
    if (choices.length === 1) {
      navigate(`/${journalModule.table}/${choices[0].journalEntryId}`);
      return true;
    }
    setAccountingEntryChoices(choices);
    setAccountingEntryPickerOpen(true);
    return true;
  }, [navigate]);

  const handleIssueAccountingEntry = useCallback(async () => {
    if (issueAccountingLoading) return;
    if (!id) return;
    if (moduleId !== 'invoices' && moduleId !== 'purchase_invoices') return;
    if (!canIssueAccountingEntry) {
      msg.error('دسترسی صدور سند حسابداری ندارید.');
      return;
    }

    const normalizedStatus = String(data?.status || '').trim().toLowerCase();
    if (!['final', 'settled', 'completed', 'confirmed'].includes(normalizedStatus)) {
      msg.warning('برای صدور سند، وضعیت فاکتور باید یکی از حالت‌های تایید/نهایی/تسویه/تکمیل باشد.');
      return;
    }

    setIssueAccountingLoading(true);
    try {
      const accountingSync = await syncInvoiceAccountingEntries({
        supabase: supabase as any,
        moduleId,
        recordId: id,
        includePayments: true,
      });

      if (accountingSync.errors.length > 0) {
        console.warn('هشدارهای همگام‌سازی دستی سند حسابداری فاکتور:', accountingSync.errors);
      }

      if (accountingSync.resolvedJournalEntries.length > 0) {
        const opened = openResolvedAccountingEntries(accountingSync.resolvedJournalEntries);
        const createdLabel = accountingSync.createdEventKeys
          .map((key) => getAccountingEventLabelFa(key))
          .join('، ');
        if (accountingSync.createdEventKeys.length > 0 && createdLabel) {
          msg.success(`پیش‌نویس سند آماده شد: ${createdLabel}`);
        } else if (opened) {
          msg.info('سند حسابداری مرتبط باز شد.');
        }
        if (accountingSync.errors.length > 0) {
          msg.warning(`صدور سند با هشدار: ${toFaAccountingSyncError(accountingSync.errors[0])}`);
        }
      } else if (accountingSync.errors.length === 0) {
        msg.info('سندی برای این فاکتور آماده نشد.');
      } else {
        msg.warning(`صدور سند ناموفق: ${toFaAccountingSyncError(accountingSync.errors[0])}`);
      }

      await fetchRecord(true);
    } catch (error: any) {
      msg.error(toFaErrorMessage(error, 'صدور سند حسابداری ناموفق بود.'));
    } finally {
      setIssueAccountingLoading(false);
    }
  }, [canIssueAccountingEntry, data?.status, fetchRecord, id, issueAccountingLoading, moduleId, msg, openResolvedAccountingEntries]);

  const startEdit = (key: string, value: any) => {
    if (!canEditModule) return;
    setEditingFields(prev => ({ ...prev, [key]: true }));
    setTempValues(prev => ({
      ...prev,
      [key]: Object.prototype.hasOwnProperty.call(prev || {}, key) ? prev[key] : value,
    }));
  };
  const cancelEdit = (key: string) => {
    setEditingFields(prev => ({ ...prev, [key]: false }));
    setTempValues(prev => {
      const next = { ...(prev || {}) };
      delete next[key];
      return next;
    });
  };

  const checkVisibility = useCallback((target: any) => {
    if (!target) return true;
    if (target?.key) {
      return conditionalFieldRuntime.isFieldVisible(target);
    }
    return evaluateLegacyVisibilityRule(target, displayData || {});
  }, [conditionalFieldRuntime, displayData]);

    const getOptionLabel = (field: any, value: any) => {
      if (!field) return getSafeOptionFallback(value);
      if (String(field?.key || '').trim() === 'assignee_id') {
        return resolvePrintAssigneeLabel(
          {
            ...data,
            assignee_id: value,
          },
          relationOptions,
        ) || getSafeOptionFallback(value);
      }
      const effectiveOptions =
        (
          (moduleId === 'process_templates' && (field.key === 'module_id' || field.key === 'module_ids'))
          || (moduleId === 'process_runs' && field.key === 'module_id')
        )
          ? getProcessTemplateModuleOptions()
          : (field.options || []);
      // اگر MULTI_SELECT است و آرایه است
      if ((field.type === FieldType.MULTI_SELECT || field.type === FieldType.MULTI_RELATION) && Array.isArray(value)) {
          return value.map(v => {
              let opt = effectiveOptions?.find((o: any) => o.value === v);
              if (opt) return opt.label;
              if ((field as any).dynamicOptionsCategory) {
                  const cat = (field as any).dynamicOptionsCategory;
                  opt = dynamicOptions[cat]?.find((o: any) => o.value === v);
                  if (opt) return opt.label;
              }
              if (field.type === FieldType.MULTI_RELATION) {
                for (const key in relationOptions) {
                  const found = relationOptions[key]?.find((o: any) => String(o?.value) === String(v));
                  if (found) return found.label;
                }
              }
              return getSafeOptionFallback(v);
          }).join(', ');
      }
      
      let opt = effectiveOptions?.find((o: any) => o.value === value);
      if (opt) return opt.label;
      if ((field as any).dynamicOptionsCategory) {
          const cat = (field as any).dynamicOptionsCategory;
          opt = dynamicOptions[cat]?.find((o: any) => o.value === value);
          if (opt) return opt.label;
      }
      if (field.type === FieldType.RELATION || field.type === FieldType.MULTI_RELATION || field.type === FieldType.USER) {
          const scopedLabel = resolvePrintOptionLabel(relationOptions[field.key] || [], value);
          if (scopedLabel) return scopedLabel;
          for (const key in relationOptions) {
              const found = resolvePrintOptionLabel(relationOptions[key] || [], value);
              if (found) return found;
          }
      }
      return getSafeOptionFallback(value);
  };

  const getFieldValueLabel = (fieldKey: string, value: any) => {
    if (value === undefined || value === null) return '';
    const field = moduleConfig?.fields?.find(f => f.key === fieldKey);
    if (!field) return getSafeOptionFallback(value, '');
    return String(getOptionLabel(field, value));
  };

  const buildAutoProductName = (record: any) => {
    if (!record) return '';
    const parts: string[] = [];
    const addPart = (part?: string) => {
      if (!part) return;
      const trimmed = String(part).trim();
      if (trimmed) parts.push(trimmed);
    };

    const productType = record?.product_type;
    if (productType === 'goods') {
      addPart(getFieldValueLabel('category', record?.category));
    } else if (productType === 'service') {
      addPart(getFieldValueLabel('product_category', record?.product_category));
    } else {
      addPart(getFieldValueLabel('category', record?.category));
      addPart(getFieldValueLabel('product_category', record?.product_category));
    }
    addPart(getFieldValueLabel('brand_name', record?.brand_name));

    return parts.join(' ');
  };

  const buildAutoProductionOrderName = (record: any) => {
    if (!record) return '';
    const parts: string[] = [];
    const addPart = (part?: string) => {
      if (!part) return;
      const trimmed = String(part).trim();
      if (trimmed) parts.push(trimmed);
    };
    const bomLabelRaw = getFieldValueLabel('bom_id', record?.bom_id);
    const bomLabelClean = String(bomLabelRaw || '').replace(/\s*\([^()]*\)\s*$/, '').trim();
    addPart(bomLabelClean);
    addPart(getFieldValueLabel('color', record?.color));
    return parts.join(' ');
  };


  const buildAutoCustomerName = (record: any) => {
    if (!record) return '';
    const normalize = (value: any) => String(value ?? '').replace(/\s+/g, ' ').trim();
    const businessName = normalize(record?.business_name);
    const personType = normalize(record?.person_type).toLowerCase();

    if (personType === 'legal') {
      const legalName = normalize(record?.legal_name);
      if (legalName && businessName) return legalName + ' - ' + businessName;
      return legalName || businessName;
    }

    const realName = [record?.prefix, record?.first_name, record?.last_name]
      .map((part) => normalize(part))
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (realName && businessName) return realName + ' - ' + businessName;
    return realName || businessName;
  };

  const buildCustomerInitialValuesFromLead = useCallback(() => {
    if (moduleId !== 'marketing_leads') return {};
    return {
      business_name: data?.business_name || '',
      prefix: data?.prefix || null,
      first_name: data?.first_name || '',
      last_name: data?.last_name || '',
      mobile_1: data?.mobile || '',
      mobile_2: data?.mobile_2 || '',
      assistant_phone: data?.assistant_phone || '',
      email: data?.email || '',
      province: data?.province || null,
      city: data?.city || null,
      address: data?.address || '',
      location: data?.location || undefined,
      industry: data?.industry || null,
      lead_source: data?.lead_source || data?.source || null,
      notes: data?.notes || '',
      assignee_id: data?.assignee_id || null,
      assignee_type: data?.assignee_type || null,
      assignee_role_id: data?.assignee_role_id || null,
    } as Record<string, any>;
  }, [data, moduleId]);

  const formatPersian = (val: any, kind: 'DATE' | 'TIME' | 'DATETIME') => {
    if (!val) return '';
    try {
      let dateObj: DateObject;

      if (kind === 'TIME') {
        dateObj = new DateObject({
          date: `1970-01-01 ${val}`,
          format: 'YYYY-MM-DD HH:mm',
          calendar: gregorian,
          locale: gregorian_en,
        });
      } else if (kind === 'DATE') {
        dateObj = new DateObject({
          date: val,
          format: 'YYYY-MM-DD',
          calendar: gregorian,
          locale: gregorian_en,
        });
      } else {
        const jsDate = new Date(val);
        if (Number.isNaN(jsDate.getTime())) return '';
        dateObj = new DateObject({
          date: jsDate,
          calendar: gregorian,
          locale: gregorian_en,
        });
      }

      const format = kind === 'DATE' ? 'YYYY/MM/DD' : kind === 'TIME' ? 'HH:mm' : 'YYYY/MM/DD HH:mm';
      return dateObj.convert(persian, persian_fa).format(format);
    } catch {
      return '';
    }
  };
  
  const formatPrintValue = (field: any, value: any) => {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.join('، ');
    if (String(field?.key || '').trim() === 'assignee_id') {
      return resolvePrintAssigneeLabel(
        {
          ...data,
          assignee_id: value,
        },
        relationOptions,
      ) || '';
    }
    if (field.type === FieldType.CHECKBOX) return value ? 'بله' : 'خیر';
    if (field.type === FieldType.PRICE) return `${formatPersianPrice(value)} ${currencyLabel}`;
    if (field.type === FieldType.PERCENTAGE) return `${value}%`;
    if (field.type === FieldType.DATE) {
      return formatPersian(value, 'DATE') || String(value);
    }
    if (field.type === FieldType.TIME) {
      return formatPersian(value, 'TIME') || String(value);
    }
    if (field.type === FieldType.DATETIME) {
      return formatPersian(value, 'DATETIME') || String(value);
    }
    if (
      field.type === FieldType.STATUS
      || field.type === FieldType.SELECT
      || field.type === FieldType.MULTI_SELECT
      || field.type === FieldType.MULTI_RELATION
      || field.type === FieldType.RELATION
    ) {
      return String(getOptionLabel(field, value));
    }
    return String(value);
  };

  const printableFields = useMemo(() => {
    if (!moduleConfig || !data) return [];
    const hasValue = (val: any) => {
      if (val === null || val === undefined) return false;
      if (typeof val === 'string') return val.trim() !== '';
      if (Array.isArray(val)) return val.length > 0;
      return true;
    };
    const blockTitleMap = new Map(
      (Array.isArray(moduleConfig?.blocks) ? moduleConfig.blocks : [])
        .filter((block: any) => block?.id)
        .map((block: any) => [String(block.id), String(block?.titles?.fa || block.id)])
    );
    const printableBlockMap = new Map(
      (Array.isArray(moduleConfig?.blocks) ? moduleConfig.blocks : [])
        .filter((block: any) => block?.id)
        .map((block: any) => [String(block.id), block?.printable !== false])
    );
    return moduleConfig.fields
      .filter(f => f.type !== FieldType.IMAGE && f.type !== FieldType.JSON && f.type !== FieldType.READONLY_LOOKUP)
      .filter(f => !shouldHideManagedAssigneeField(moduleId, f.key))
      .filter((field) => {
        const blockId = String((field as any)?.blockId || '').trim();
        if (field.location !== FieldLocation.BLOCK || !blockId) return true;
        return printableBlockMap.get(blockId) !== false;
      })
      .filter(f => conditionalFieldRuntime.isFieldVisible(f))
      .filter(f => canViewField(f.key))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((field) => {
        const blockId = String((field as any)?.blockId || '').trim();
        const isBlockField = field.location === FieldLocation.BLOCK && Boolean(blockId);
        const blockTitle = blockTitleMap.get(blockId) || blockId;
        const value = displayData[field.key];
        return {
          ...field,
          value,
          printValue: formatPrintValue(field, value),
          hasValue: hasValue(value),
          group: isBlockField ? `بخش: ${blockTitle}` : 'فیلدهای عمومی',
          scope: isBlockField ? 'module' : 'general',
        };
      });
  }, [canViewField, conditionalFieldRuntime, currencyLabel, data, displayData, dynamicOptions, moduleConfig, relationOptions]);

  // ✅ استفاده از custom hook برای مدیریت print
  const printManager = usePrintManager({
    moduleId,
    data,
    moduleConfig,
    printableFields,
    formatPrintValue,
    relationOptions,
    canViewField,
  });

  const prepareDirectPdfAsset = useCallback(async (flow: 'print_share_prepare' | 'print_save_to_record') => {
    if (!id) {
      throw new Error('record_missing');
    }

    const tracker = createPrintPerformanceTracker(flow, {
      moduleId,
      recordId: id,
      templateId: printManager.selectedTemplateId || null,
      printModalOpen: printManager.isPrintModalOpen === true,
    });
    const messageKey = `${flow}:${Date.now()}`;

    try {
      msg.open({ key: messageKey, type: 'loading', content: 'در حال بستن پیش‌نمایش چاپ...', duration: 0 });
      tracker.mark('close_print_modal_requested');
      printManager.closePrintModal();

      await tracker.step('wait_for_ui_paint', () => waitForNextPaint(2));
      msg.open({ key: messageKey, type: 'loading', content: 'در حال ساخت PDF...', duration: 0 });

      const pdfResult = await printManager.generateCurrentPdfBlob({ tracker });
      msg.open({ key: messageKey, type: 'loading', content: 'در حال بارگذاری فایل PDF...', duration: 0 });

      const uploaded = await uploadGeneratedPdf(pdfResult.blob, pdfResult.filename, pdfResult.title, tracker);
      return { tracker, messageKey, uploaded, pdfResult };
    } catch (error) {
      tracker.finalize({
        status: 'failed',
        error: String((error as any)?.message || error || 'unknown_error'),
      });
      msg.destroy(messageKey);
      throw error;
    }
  }, [
    id,
    moduleId,
    msg,
    printManager,
    uploadGeneratedPdf,
  ]);

  const getUserName = useCallback((uid: string) => {
    if (!String(uid || '').trim()) return 'سیستم';
    const user = allUsers.find(u => u.id === uid);
    return user?.full_name || user?.email || user?.mobile_1 || 'نامشخص';
  }, [allUsers]);

  const handleConfirmStartProduction = async () => {
    try {
      const confirmedGroups = startMaterials.filter((group) => group.isConfirmed === true);
      if (confirmedGroups.length === 0) {
        msg.warning('هیچ محصولی در حالت تایید نهایی نیست');
        return;
      }
      const materialsWithDelivery = confirmedGroups.filter((group) => group.totalDeliveredQty > 0);
      if (!materialsWithDelivery.length) {
        msg.error('برای محصول‌های تایید شده، مقدار تحویل شده معتبر ثبت نشده است.');
        return;
      }
      const missingProduct = materialsWithDelivery.filter((group) => !group.selectedProductId);
      if (missingProduct.length > 0) {
        msg.error(PRODUCTION_MESSAGES.requireSelectedProduct);
        return;
      }
      const missingSourceShelf = materialsWithDelivery.filter((group) => !group.sourceShelfId);
      if (missingSourceShelf.length > 0) {
        msg.error('برخی قفسه‌های برداشت برای محصول انتخاب‌شده موجودی معتبر ندارند.');
        return;
      }
      const invalidSourceShelf = materialsWithDelivery.filter((group) => {
        const options = group.selectedProductId ? (sourceShelfOptionsByProduct[group.selectedProductId] || []) : [];
        return !options.some((option) => option.value === group.sourceShelfId);
      });
      if (invalidSourceShelf.length > 0) {
        msg.error('برخی قفسه‌های برداشت برای محصول انتخاب‌شده موجودی معتبر ندارند.');
        return;
      }
      const missingProductionShelf = materialsWithDelivery.filter((group) => !group.productionShelfId);
      if (missingProductionShelf.length > 0) {
        msg.error(PRODUCTION_MESSAGES.requireProductionShelf);
        return;
      }
      const moves = materialsWithDelivery.map((group) => ({
        product_id: String(group.selectedProductId),
        from_shelf_id: String(group.sourceShelfId),
        to_shelf_id: String(group.productionShelfId),
        quantity: group.totalDeliveredQty,
      }));

      setStatusLoading(true);
      await applyProductionMoves(moves);
      try {
        const authUser = await getCachedAuthUser(supabase);
        const userId = authUser?.id || null;
        const transferPayload = moves.map((move) => ({
          transfer_type: 'production',
          product_id: move.product_id,
          delivered_qty: move.quantity,
          required_qty: move.quantity,
          invoice_id: null,
          production_order_id: id || null,
          from_shelf_id: move.from_shelf_id,
          to_shelf_id: move.to_shelf_id,
          sender_id: userId,
          receiver_id: userId,
        }));
        if (transferPayload.length > 0) {
          await supabase.from('stock_transfers').insert(transferPayload);
        }
      } catch (movementLogError) {
        console.warn('Could not log production stock transfers', movementLogError);
      }
      const currentGridMaterials = Array.isArray(data?.grid_materials) ? data.grid_materials : [];
      const deliveredByGroupKey = new Map<string, StartMaterialGroup>(
        materialsWithDelivery.map((group) => [group.key, group])
      );
      const nextGridMaterials = currentGridMaterials.map((row: any, rowIndex: number) => {
        const rowKey = `${String(row?.key || 'group')}_${rowIndex}`;
        const group = deliveredByGroupKey.get(rowKey);
        if (!group) return row;
        const rowPieces = Array.isArray(row?.pieces) ? row.pieces : [];
        const deliveredByPieceKey = new Map<string, number>();
        (group.deliveryRows || []).forEach((deliveryRow: StartMaterialDeliveryRow) => {
          const pieceKey = String(deliveryRow?.pieceKey || '');
          if (!pieceKey) return;
          const current = deliveredByPieceKey.get(pieceKey) || 0;
          deliveredByPieceKey.set(pieceKey, current + calcDeliveredQty(deliveryRow));
        });
        const nextPieces = rowPieces.map((piece: any, pieceIndex: number) => {
          const normalizedPieceKey = `${String(piece?.key || 'piece')}_${rowIndex}_${pieceIndex}`;
          const deliveredQty = deliveredByPieceKey.get(normalizedPieceKey);
          if (deliveredQty === undefined) return piece;
          return {
            ...piece,
            delivered_qty: deliveredQty,
          };
        });
        return {
          ...row,
          selected_shelf_id: group.sourceShelfId || row?.selected_shelf_id || null,
          production_shelf_id: group.productionShelfId || row?.production_shelf_id || null,
          delivered_total_qty: group.totalDeliveredQty,
          delivery_rows: group.deliveryRows || [],
          pieces: nextPieces,
        };
      });
      const firstProductionShelfId = moves[0]?.to_shelf_id || null;
      const nowIso = new Date().toISOString();
      await finalizeStatusUpdate({
        status: 'in_progress',
        production_shelf_id: firstProductionShelfId,
        production_moves: moves,
        grid_materials: nextGridMaterials,
        production_started_at: nowIso,
      });
      clearStartDraft();
      msg.success('تولید آغاز شد');
      setProductionModal(null);
    } catch (e: any) {
      msg.error(toFaErrorMessage(e, 'شروع تولید ناموفق بود.'));
    } finally {
      setStatusLoading(false);
    }
  };

  const handleConfirmStartGroup = useCallback((groupIndex: number) => {
    const group = startMaterials[groupIndex];
    if (!group) return;
    if (!group.selectedProductId) {
      msg.error('برای این محصول، محصول انتخاب‌شده مشخص نیست.');
      return;
    }
    if (!group.sourceShelfId) {
      msg.error('برای این محصول، قفسه برداشت انتخاب نشده است.');
      return;
    }
    const validSourceShelves = group.selectedProductId ? (sourceShelfOptionsByProduct[group.selectedProductId] || []) : [];
    if (!validSourceShelves.some((option) => option.value === group.sourceShelfId)) {
      msg.error('قفسه برداشت انتخاب‌شده برای این محصول موجودی ندارد.');
      return;
    }
    if (!group.productionShelfId) {
      msg.error('برای این محصول، قفسه تولید انتخاب نشده است.');
      return;
    }
    if (!group.totalDeliveredQty || group.totalDeliveredQty <= 0) {
      msg.error('برای این محصول، مقدار تحویل شده معتبر نیست.');
      return;
    }
    setStartMaterials((prev) => {
      const next = [...prev];
      const current = next[groupIndex];
      if (!current) return prev;
      next[groupIndex] = { ...current, isConfirmed: true, collapsed: true };
      return next;
    });
    msg.success('این محصول ثبت شد.');
  }, [msg, sourceShelfOptionsByProduct, startMaterials]);

  const handleConfirmStopProduction = async () => {
    try {
      const moves = Array.isArray(data?.production_moves) ? data.production_moves : [];
      const currentGridMaterials = Array.isArray(data?.grid_materials) ? data.grid_materials : [];
      const clearedGridMaterials = currentGridMaterials.map((row: any) => {
        const pieces = Array.isArray(row?.pieces) ? row.pieces : [];
        const nextRow = { ...row };
        if (Object.prototype.hasOwnProperty.call(nextRow, 'delivered_total_qty')) {
          delete (nextRow as any).delivered_total_qty;
        }
        if (Object.prototype.hasOwnProperty.call(nextRow, 'delivery_rows')) {
          delete (nextRow as any).delivery_rows;
        }
        return {
          ...nextRow,
          pieces: pieces.map((piece: any) => {
            const nextPiece = { ...piece };
            if (Object.prototype.hasOwnProperty.call(nextPiece, 'delivered_qty')) {
              delete (nextPiece as any).delivered_qty;
            }
            return nextPiece;
          }),
        };
      });
      if (moves.length === 0) {
        msg.warning('حرکتی برای بازگشت موجودی ثبت نشده است');
        const nowIso = new Date().toISOString();
        await finalizeStatusUpdate({
          status: 'pending',
          production_shelf_id: null,
          production_moves: null,
          grid_materials: clearedGridMaterials,
          production_stopped_at: nowIso,
        });
        setProductionModal(null);
        return;
      }
      setStatusLoading(true);
      await rollbackProductionMoves(moves);
      const productIds = Array.from(new Set(moves.map((move: any) => String(move?.product_id || '')).filter(Boolean))) as string[];
      if (productIds.length > 0) {
        await Promise.all(productIds.map((productId) => syncProductStock(productId)));
      }
      const nowIso = new Date().toISOString();
      await finalizeStatusUpdate({
        status: 'pending',
        production_shelf_id: null,
        production_moves: null,
        grid_materials: clearedGridMaterials,
        production_stopped_at: nowIso,
      });
      msg.success('تولید متوقف شد');
      setProductionModal(null);
    } catch (e: any) {
      msg.error(toFaErrorMessage(e, 'توقف تولید ناموفق بود.'));
    } finally {
      setStatusLoading(false);
    }
  };

  const handleConfirmCompleteProduction = async () => {
    try {
      if (!outputProductType) {
        msg.error('نوع محصول تولید شده را انتخاب کنید.');
        return;
      }
      if (!outputProductId) {
        msg.error(PRODUCTION_MESSAGES.requireOutputProduct);
        return;
      }
      if (!outputShelfId) {
        msg.error(PRODUCTION_MESSAGES.requireOutputShelf);
        return;
      }
      const normalizedQty = await resolveProductionQuantity();
      if (!normalizedQty || normalizedQty <= 0) {
        msg.error(PRODUCTION_MESSAGES.requireQuantity);
        return;
      }
      const moves = Array.isArray(data?.production_moves) ? data.production_moves : [];
      const productionShelfId = data?.production_shelf_id;
      const finalStageMoves = await buildFinalStageConsumptionMoves();
      const fallbackMoves = moves.length
        ? moves
        : (productionShelfId ? buildConsumptionMoves(data, normalizedQty, String(productionShelfId)) : []);
      const consumptionMoves = finalStageMoves.length ? finalStageMoves : fallbackMoves;
      if (!consumptionMoves.length) {
        msg.error(PRODUCTION_MESSAGES.requireProductionShelf);
        return;
      }
      setStatusLoading(true);
      if (consumptionMoves.length) {
        await consumeProductionMaterials(consumptionMoves, productionShelfId || undefined);
      }
      const consumedGrouped = new Map<string, number>();
      consumptionMoves.forEach((move: any) => {
        const shelfId = String(move?.to_shelf_id || productionShelfId || '');
        const productId = String(move?.product_id || '');
        const qty = parseFloat(move?.quantity) || 0;
        if (!productId || !shelfId || qty <= 0) return;
        const key = `${productId}:${shelfId}`;
        consumedGrouped.set(key, (consumedGrouped.get(key) || 0) + qty);
      });
      const consumedProductIds = Array.from(
        new Set(consumptionMoves.map((move: any) => String(move?.product_id || '')).filter(Boolean))
      ) as string[];
      if (consumedProductIds.length > 0) {
        await Promise.all(consumedProductIds.map((productId) => syncProductStock(productId)));
      }
      try {
        const authUser = await getCachedAuthUser(supabase);
        const userId = authUser?.id || null;
        const consumptionTransferPayload = Array.from(consumedGrouped.entries()).map(([key, qty]) => {
          const [productId, fromShelfId] = key.split(':');
          return {
            transfer_type: 'production',
            product_id: productId,
            delivered_qty: qty,
            required_qty: qty,
            invoice_id: null,
            production_order_id: id || null,
            from_shelf_id: fromShelfId || null,
            to_shelf_id: null,
            sender_id: userId,
            receiver_id: userId,
          };
        });
        if (consumptionTransferPayload.length > 0) {
          await supabase.from('stock_transfers').insert(consumptionTransferPayload);
        }
      } catch (consumptionLogErr) {
        console.warn('Could not log production material consumption transfers', consumptionLogErr);
      }
      await addFinishedGoods(outputProductId, outputShelfId, normalizedQty);
      await syncProductStock(outputProductId);
      try {
        const authUser = await getCachedAuthUser(supabase);
        const userId = authUser?.id || null;
        await supabase.from('stock_transfers').insert({
          transfer_type: 'production',
          product_id: outputProductId,
          delivered_qty: normalizedQty,
          required_qty: normalizedQty,
          invoice_id: null,
          production_order_id: id || null,
          from_shelf_id: null,
          to_shelf_id: outputShelfId,
          sender_id: userId,
          receiver_id: userId,
        });
      } catch (transferLogErr) {
        console.warn('Could not log finished goods transfer', transferLogErr);
      }
      const nowIso = new Date().toISOString();
      await finalizeStatusUpdate({
        status: 'completed',
        production_output_product_id: outputProductId,
        production_output_shelf_id: outputShelfId,
        production_output_qty: normalizedQty,
        production_completed_at: nowIso,
      });
      msg.success('تولید تکمیل شد');
      setProductionModal(null);
    } catch (e: any) {
      msg.error(toFaErrorMessage(e, 'تکمیل تولید ناموفق بود.'));
    } finally {
      setStatusLoading(false);
    }
  };

  const buildNewProductInitialValues = () => {
    const autoNameDefault = normalizeAutoNameEnabled(
      MODULES.products?.fields?.find((field) => field.key === 'auto_name_enabled')?.defaultValue,
      false
    );
    return {
      name: data?.name || '',
      product_type: outputProductType || 'goods',
      category: data?.product_category || null,
      product_category: null,
      auto_name_enabled: autoNameDefault,
    } as any;
  };

  const handleCreateProductSave = async (values: any, meta?: { selectedTags?: any[] }) => {
    try {
      setStatusLoading(true);
      const payload = { ...values };
      if (supportsSystemCode('products') && !payload.system_code) {
        payload.system_code = await buildClientFallbackSystemCode(supabase, 'products', 'products');
      }
      const { data: inserted, error } = await supabase
        .from('products')
        .insert(payload)
        .select('id')
        .single();
      if (error) throw error;
      const productId = inserted?.id;
      if (!productId) throw new Error('ثبت محصول ناموفق بود');
      if (Array.isArray(meta?.selectedTags) && meta.selectedTags.length > 0) {
        await syncRecordTags(supabase, 'products', String(productId), meta.selectedTags);
      }
      setOutputProductId(productId);
      const outputShelf = outputShelfId || null;
      if (!outputShelf) {
        msg.error(PRODUCTION_MESSAGES.requireOutputShelf);
        return;
      }
      setOutputShelfId(outputShelf);

      const normalizedQty = await resolveProductionQuantity();
      if (!normalizedQty || normalizedQty <= 0) {
        msg.error(PRODUCTION_MESSAGES.requireQuantity);
        return;
      }
      const moves = Array.isArray(data?.production_moves) ? data.production_moves : [];
      const productionShelfId = data?.production_shelf_id;
      const finalStageMoves = await buildFinalStageConsumptionMoves();
      const fallbackMoves = moves.length
        ? moves
        : (productionShelfId ? buildConsumptionMoves(data, normalizedQty, String(productionShelfId)) : []);
      const consumptionMoves = finalStageMoves.length ? finalStageMoves : fallbackMoves;
      if (!consumptionMoves.length) {
        msg.error(PRODUCTION_MESSAGES.requireProductionShelf);
        return;
      }
      if (consumptionMoves.length) {
        await consumeProductionMaterials(consumptionMoves, productionShelfId || undefined);
      }
      const consumedGrouped = new Map<string, number>();
      consumptionMoves.forEach((move: any) => {
        const shelfId = String(move?.to_shelf_id || productionShelfId || '');
        const productId = String(move?.product_id || '');
        const qty = parseFloat(move?.quantity) || 0;
        if (!productId || !shelfId || qty <= 0) return;
        const key = `${productId}:${shelfId}`;
        consumedGrouped.set(key, (consumedGrouped.get(key) || 0) + qty);
      });
      const consumedProductIds = Array.from(
        new Set(consumptionMoves.map((move: any) => String(move?.product_id || '')).filter(Boolean))
      ) as string[];
      if (consumedProductIds.length > 0) {
        await Promise.all(consumedProductIds.map((productId) => syncProductStock(productId)));
      }
      try {
        const authUser = await getCachedAuthUser(supabase);
        const userId = authUser?.id || null;
        const consumptionTransferPayload = Array.from(consumedGrouped.entries()).map(([key, qty]) => {
          const [productId, fromShelfId] = key.split(':');
          return {
            transfer_type: 'production',
            product_id: productId,
            delivered_qty: qty,
            required_qty: qty,
            invoice_id: null,
            production_order_id: id || null,
            from_shelf_id: fromShelfId || null,
            to_shelf_id: null,
            sender_id: userId,
            receiver_id: userId,
          };
        });
        if (consumptionTransferPayload.length > 0) {
          await supabase.from('stock_transfers').insert(consumptionTransferPayload);
        }
      } catch (consumptionLogErr) {
        console.warn('Could not log production material consumption transfers for new product', consumptionLogErr);
      }
      await addFinishedGoods(productId, outputShelf, normalizedQty);
      await syncProductStock(productId);
      try {
        const authUser = await getCachedAuthUser(supabase);
        const userId = authUser?.id || null;
        await supabase.from('stock_transfers').insert({
          transfer_type: 'production',
          product_id: productId,
          delivered_qty: normalizedQty,
          required_qty: normalizedQty,
          invoice_id: null,
          production_order_id: id || null,
          from_shelf_id: null,
          to_shelf_id: outputShelf,
          sender_id: userId,
          receiver_id: userId,
        });
      } catch (transferLogErr) {
        console.warn('Could not log finished goods transfer for new product', transferLogErr);
      }
      const nowIso = new Date().toISOString();
      await finalizeStatusUpdate({
        status: 'completed',
        production_output_product_id: productId,
        production_output_shelf_id: outputShelf,
        production_output_qty: normalizedQty,
        production_completed_at: nowIso,
      });

      msg.success('محصول جدید ایجاد شد و سفارش تکمیل شد');
      setIsCreateProductOpen(false);
    } catch (e: any) {
      msg.error(toFaErrorMessage(e, 'ایجاد محصول ناموفق بود.'));
    } finally {
      setStatusLoading(false);
    }
  };

  const handleCreateCustomerFromLeadSave = useCallback(async (values: any) => {
    try {
      if (!id || moduleId !== 'marketing_leads') return;
      const authUser = await getCachedAuthUser(supabase);
      const authUserId = authUser?.id || null;
      const customerPayload = {
        ...values,
        assignee_id: values?.assignee_id ?? data?.assignee_id ?? null,
        assignee_type: values?.assignee_type ?? data?.assignee_type ?? null,
        assignee_role_id: values?.assignee_role_id ?? data?.assignee_role_id ?? null,
        created_by: values?.created_by ?? authUserId ?? undefined,
        updated_by: values?.updated_by ?? authUserId ?? undefined,
      };
      if (supportsSystemCode('customers') && !customerPayload.system_code) {
        customerPayload.system_code = await buildClientFallbackSystemCode(supabase, 'customers', 'customers');
      }

      let { data: insertedCustomer, error: insertError } = await supabase
        .from('customers')
        .insert(customerPayload)
        .select('id')
        .single();
      for (
        let attempt = 0;
        insertError
        && supportsSystemCode('customers')
        && (isDuplicateSystemCodeError(insertError) || isStatementTimeoutError(insertError))
        && attempt < 3;
        attempt += 1
      ) {
        customerPayload.system_code = await buildClientFallbackSystemCode(supabase, 'customers', 'customers');
        ({ data: insertedCustomer, error: insertError } = await supabase
          .from('customers')
          .insert(customerPayload)
          .select('id')
          .single());
      }
      if (insertError) throw insertError;

      const customerId = insertedCustomer?.id;
      if (!customerId) throw new Error('ایجاد مشتری ناموفق بود.');

      const { error: leadUpdateError } = await supabase
        .from('marketing_leads')
        .update({
          customer_id: customerId,
          lead_type: 'existing_customer',
          updated_by: authUserId ?? undefined,
        })
        .eq('id', id);
      if (leadUpdateError) throw leadUpdateError;

      msg.success('مشتری از روی لید ایجاد شد.');
      setIsCreateCustomerFromLeadOpen(false);
      void fetchRecord(true);
    } catch (err: any) {
      msg.error(toFaErrorMessage(err));
      throw err;
    }
  }, [data, fetchRecord, id, moduleId, msg]);

  const handleRecordPatch = useCallback((patch: Record<string, any>) => {
    setData((prev: any) => ({ ...(prev || {}), ...patch }));
    markCurrentModuleListChanged(patch);
  }, [markCurrentModuleListChanged]);
  const projectProcessLinkedFields = useMemo(() => {
    if (moduleId !== 'projects' || !processDraftFieldKey || !data) return [] as Array<{
      field: any;
      value?: string;
    }>;
    const draftStages = Array.isArray(data?.[processDraftFieldKey]) ? data[processDraftFieldKey] : [];
    const targetModuleIds = normalizeProcessTargetModuleIds(
      draftStages.flatMap((stage: any) => (
        Array.isArray(stage?.process_target_module_ids) ? stage.process_target_module_ids : []
      )),
      ''
    );
    const linkedRecordMap = draftStages.reduce<Record<string, string>>((acc, stage: any) => {
      const rawMap = stage?.process_link_map && typeof stage.process_link_map === 'object'
        ? stage.process_link_map
        : {};
      Object.entries(rawMap).forEach(([targetModuleId, recordId]) => {
        const normalizedTargetModuleId = String(targetModuleId || '').trim();
        const normalizedRecordId = String(recordId || '').trim();
        if (normalizedTargetModuleId && normalizedRecordId && !acc[normalizedTargetModuleId]) {
          acc[normalizedTargetModuleId] = normalizedRecordId;
        }
      });
      return acc;
    }, {});

    return targetModuleIds
      .filter((targetModuleId) => !!MODULES[targetModuleId] && !PROJECT_PROCESS_HIDDEN_LINK_MODULE_IDS.has(targetModuleId))
      .map((targetModuleId) => {
        const fieldKey = createProcessLinkedFieldKey(targetModuleId, 'id');
        return {
          field: {
            key: fieldKey,
            labels: {
              fa: `${MODULES[targetModuleId]?.titles?.faSingular || MODULES[targetModuleId]?.titles?.fa || targetModuleId} مرتبط`,
              en: `Linked ${targetModuleId}`,
            },
            type: FieldType.RELATION,
            relationConfig: { targetModule: targetModuleId },
            nature: 'standard',
          },
          value: String(linkedRecordMap[targetModuleId] || '').trim() || undefined,
        };
      });
  }, [data, moduleId, processDraftFieldKey]);
  const extraBlockContent = useMemo<Record<string, React.ReactNode>>(() => {
    const content: Record<string, React.ReactNode> = {};
    if (moduleId === 'customers' && id) {
      content.financial_stats = (
        <React.Suspense fallback={<Skeleton active paragraph={{ rows: 3 }} />}>
          <OperationalFinancialOverviewPanel entityType="customer" entityId={id} entityPrintFields={printableFields.map((field: any) => ({
            key: field.key,
            label: field?.labels?.fa || field.key,
            group: field.group,
            printValue: field.printValue,
          }))} />
        </React.Suspense>
      );
    }
    if (moduleId === 'suppliers' && id) {
      content.financial_info = (
        <React.Suspense fallback={<Skeleton active paragraph={{ rows: 3 }} />}>
          <OperationalFinancialOverviewPanel entityType="supplier" entityId={id} entityPrintFields={printableFields.map((field: any) => ({
            key: field.key,
            label: field?.labels?.fa || field.key,
            group: field.group,
            printValue: field.printValue,
          }))} />
        </React.Suspense>
      );
    }
    if (moduleId === 'employees' && id) {
      content.payroll_info = (
        <React.Suspense fallback={<Skeleton active paragraph={{ rows: 3 }} />}>
          <OperationalFinancialOverviewPanel entityType="employee" entityId={id} entityPrintFields={printableFields.map((field: any) => ({
            key: field.key,
            label: field?.labels?.fa || field.key,
            group: field.group,
            printValue: field.printValue,
          }))} />
        </React.Suspense>
      );
    }
    if (moduleId === 'delivery_forms' && id) {
      content.details = (
        <div className="rounded-2xl border border-[rgba(var(--brand-200-rgb),0.65)] bg-[rgba(var(--brand-50-rgb),0.35)] p-4">
          <div className="mb-3">
            <div className="text-sm font-semibold text-[rgba(var(--brand-800-rgb),1)]">فایل‌ها و تصاویر</div>
            <div className="mt-1 text-xs text-gray-500">
              عکس‌ها، رسیدها و فایل‌های مرتبط با این فرم تحویل را از همین بخش بارگذاری و مدیریت کنید.
            </div>
          </div>
          <div className="max-w-sm">
            <RecordImageBox
              moduleId={moduleId}
              recordId={id}
              imageUrl={null}
              canEdit={canEditModule}
              canViewFilesManager={true}
              canEditFilesManager={canEditModule}
              canUploadFilesManager={baseCanEditModule}
              canDeleteFilesManager={canEditModule}
              onImageUpdate={canEditModule ? () => false : undefined}
              filesButtonLabel="فایل‌ها و تصاویر"
            />
          </div>
        </div>
      );
    }
    if (moduleId === 'projects' && projectProcessLinkedFields.length > 0) {
      content.process = (
        <div className="rounded-2xl border border-[rgba(var(--brand-200-rgb),0.65)] bg-[rgba(var(--brand-50-rgb),0.45)] p-4">
          <div className="mb-3 text-sm font-semibold text-[rgba(var(--brand-800-rgb),1)]">رکوردهای مرتبط فرآیند</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projectProcessLinkedFields.map(({ field, value }) => (
              <div key={field.key}>
                <SmartFieldRenderer
                  field={field}
                  value={value}
                  onChange={() => {}}
                  forceEditMode={false}
                  options={relationOptions[field.key]}
                  moduleId={moduleId}
                  allValues={data}
                />
              </div>
            ))}
          </div>
        </div>
      );
    }
    return content;
  }, [baseCanEditModule, canEditModule, data, id, moduleId, printableFields, projectProcessLinkedFields, relationOptions]);

  if (accessDenied) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-400">
        دسترسی مشاهده برای این رکورد ندارید.
      </div>
    );
  }
  if (!moduleConfig || (!data && loading)) {
    return <ModuleShowSkeleton />;
  }
  if (!data) return null;
  const canInlineEdit = canEditModule && moduleConfig.disableInlineFieldEditing !== true;

  const renderSmartField = (field: any, isHeader = false) => {
    if (!canViewField(field.key)) return null;
    const isEditing = editingFields[field.key];
    const value = displayData[field.key];
    const isProcessDraftField = (
      field.key === 'execution_process_draft' ||
      field.key === 'marketing_process_draft' ||
      field.key === 'template_stages_preview' ||
      field.key === 'run_stages_preview'
    );
    const isSuperLongTextField = field.type === FieldType.SUPER_LONG_TEXT;
    const compactMode = (field.type === FieldType.PROGRESS_STAGES || isProcessDraftField) ? false : true;

    if (field.type === FieldType.PROGRESS_STAGES || isProcessDraftField) {
      let options = field.options;
      if (
        (moduleId === 'process_templates' && (field.key === 'module_id' || field.key === 'module_ids'))
        || (moduleId === 'process_runs' && field.key === 'module_id')
      ) options = getProcessTemplateModuleOptions();
      else if (moduleId === 'tasks' && field.key === 'related_to_module') options = getTaskModuleOptions();
      else if ((field as any).dynamicOptionsCategory) options = dynamicOptions[(field as any).dynamicOptionsCategory];
      else if (field.type === FieldType.RELATION || field.type === FieldType.MULTI_RELATION) options = relationOptions[field.key];

      return (
        <div className="w-full">
          <SmartFieldRenderer
            field={field}
            value={value}
            onChange={(nextValue) => {
              if (!isProcessDraftField || !id || !canEditModule) return;
              if (field.key === 'template_stages_preview' || field.key === 'run_stages_preview') return;
              const patch = { [field.key]: nextValue } as Record<string, any>;
              setData((prev: any) => ({ ...(prev || {}), ...patch }));
              void supabase
                .from(moduleTable)
                .update(patch)
                .eq('id', id)
                .then(({ error }) => {
                  if (error) {
                    msg.error('ذخیره مراحل فرآیند ناموفق بود');
                  }
                });
            }}
            forceEditMode={canEditModule}
            compactMode={false}
            options={options}
            recordId={id}
            moduleId={moduleId}
            allValues={displayData}
          />
        </div>
      );
    }
    let baseValue = value ?? undefined;

    if (field.type === FieldType.MULTI_SELECT && typeof baseValue === 'string') {
      try {
        baseValue = JSON.parse(baseValue);
      } catch {
        baseValue = baseValue ? [baseValue] : [];
      }
    }

    const tempValue = tempValues[field.key] !== undefined ? tempValues[field.key] : baseValue;
    let options = field.options;
    if (
      (moduleId === 'process_templates' && (field.key === 'module_id' || field.key === 'module_ids'))
      || (moduleId === 'process_runs' && field.key === 'module_id')
    ) options = getProcessTemplateModuleOptions();
    else if (moduleId === 'tasks' && field.key === 'related_to_module') options = getTaskModuleOptions();
      else if (moduleId === 'tasks' && field.key === 'status') options = getTaskStatusOptions(displayData);
    else if ((field as any).dynamicOptionsCategory) options = dynamicOptions[(field as any).dynamicOptionsCategory];
    else if (field.type === FieldType.RELATION || field.type === FieldType.MULTI_RELATION) options = relationOptions[field.key];
    if (field.key === 'process_template_id' && processDraftFieldKey) {
      options = processTemplateFieldOptions;
    }
    const isProcessTemplateFieldLocked = field.key === 'process_template_id' && hasStartedProcessExecution;
    const isCashBankAttachmentField =
      moduleId === 'cash_bank_operations'
      && !isHeader
      && field.type === FieldType.IMAGE
      && String(field.key || '').trim() === 'attachment_url';

    if (isEditing) {
      const inlineEditorClassName = isHeader
        ? `flex w-full min-w-0 flex-col gap-2 ${isSuperLongTextField ? 'items-stretch' : ''}`
        : `flex w-full min-w-[150px] gap-1 ${isSuperLongTextField ? 'items-start' : 'items-center'}`;
      return (
        <div className={inlineEditorClassName}>
          <div className="min-w-0 flex-1">
            <SmartFieldRenderer
              field={field}
              value={tempValue}
              onChange={(val) => {
                if (isProcessTemplateFieldLocked) return;
                setTempValues(prev => ({ ...prev, [field.key]: val }));
                const shouldHandleBom =
                  (field.key === 'related_bom' && val && val !== displayData?.related_bom) ||
                  (moduleId === 'production_orders' && field.key === 'bom_id' && val && val !== displayData?.bom_id);
                const shouldHandleProcessTemplate =
                  !!processDraftFieldKey &&
                  field.key === 'process_template_id' &&
                  val &&
                  val !== displayData?.process_template_id;
                if (shouldHandleBom) {
                  setTimeout(() => handleRelatedBomChange(val), 100);
                }
                if (shouldHandleProcessTemplate) {
                  setTimeout(() => handleProcessTemplateChange(val), 100);
                }
              }}
              forceEditMode={true}
              compactMode={compactMode}
              options={options}
              onOptionsUpdate={fetchOptions}
              recordId={id}
              moduleId={moduleId}
                allValues={displayData}
            />
          </div>
          <div className={`flex shrink-0 gap-1 ${isHeader ? 'justify-end' : ''}`}>
            <Button
              size="small"
              type="text"
              icon={<CheckOutlined />}
              onClick={() => saveEdit(field.key)}
              disabled={isProcessTemplateFieldLocked || savingField === field.key}
              loading={savingField === field.key}
              className="!h-8 !w-8 !min-w-8 rounded-full border border-gray-200 text-gray-500 hover:!border-emerald-200 hover:!text-emerald-600"
            />
            <Button
              size="small"
              type="text"
              icon={<CloseOutlined />}
              onClick={() => cancelEdit(field.key)}
              disabled={savingField === field.key}
              className="!h-8 !w-8 !min-w-8 rounded-full border border-gray-200 text-gray-500 hover:!border-rose-200 hover:!text-rose-600"
            />
          </div>
        </div>
      );
    }

    if (isCashBankAttachmentField) {
      const resolvedAttachmentUrl =
        String(displayData?.attachment_url || displayData?.image_url || '').trim() || null;
      return (
        <div className="max-w-[240px]">
          <RecordImageBox
            moduleId={moduleId}
            recordId={id}
            imageUrl={resolvedAttachmentUrl}
            compact
            canEdit={canEditModule}
            canUploadFilesManager={baseCanEditModule}
            canDeleteFilesManager={canEditModule}
            onImageUpdate={canEditModule ? handleImageUpdate : undefined}
            onMainImageChange={canEditModule ? handleMainImageChange : undefined}
          />
        </div>
      );
    }

    const displayNode = (
      <SmartFieldRenderer
        field={field}
        value={baseValue}
        onChange={() => undefined}
        forceEditMode={false}
        compactMode={compactMode}
        options={options}
        recordId={id}
        moduleId={moduleId}
        allValues={displayData}
      />
    );

    if (isHeader) {
      return (
        <div
          className="group flex w-full min-w-0 items-start gap-2 cursor-pointer"
          onClick={(event) => {
            event.stopPropagation();
            if (!field.readonly && canInlineEdit && !isProcessTemplateFieldLocked) startEdit(field.key, value);
          }}
        >
          <div className="min-w-0 flex-1 overflow-hidden">
            {displayNode}
          </div>
          {!field.readonly && canInlineEdit && !isProcessTemplateFieldLocked && <EditOutlined className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-xs" />}
        </div>
      );
    }

    return (
      <div
        className={`group flex justify-between min-h-[32px] hover:bg-gray-50 dark:hover:bg-white/5 px-3 rounded-lg -mx-3 transition-colors cursor-pointer border border-transparent hover:border-gray-100 dark:hover:border-gray-700 ${isSuperLongTextField ? 'items-start py-2' : 'items-center'}`}
        onClick={(event) => {
          event.stopPropagation();
          if (!field.readonly && canInlineEdit && !isProcessTemplateFieldLocked) startEdit(field.key, value);
        }}
      >
        <div className="text-gray-800 dark:text-gray-200 flex-1 min-w-0">{displayNode}</div>
        {!field.readonly && canInlineEdit && !isProcessTemplateFieldLocked && <EditOutlined className="text-leather-400 opacity-0 group-hover:opacity-100 transition-opacity" />}
      </div>
    );
  };

  const canUseAction = (actionId: string) => canViewField(`__action_${actionId}`);
  const handleModuleRecordAction = async (actionId: string) => {
    try {
      const result = await executeSaasModuleAction(moduleId, actionId, data);
      if (result?.message) {
        msg.success(result.message);
      }
      const nextRecordId = String(result?.nextRecordId || '').trim();
      if (nextRecordId && nextRecordId !== String(id || '').trim()) {
        navigate(`/${moduleId}/${nextRecordId}`, { replace: true });
        return;
      }
      void fetchRecord(true);
    } catch (error: any) {
      msg.error(toFaErrorMessage(error, 'اجرای عملیات ناموفق بود.'));
    }
  };

  const fieldGroups = moduleConfig.blocks?.filter(
    (b) => b.type === BlockType.FIELD_GROUP && checkVisibility(b) && canViewField(String(b.id))
  );
  const headerActions = (moduleConfig.actionButtons || [])
    .filter((b: any) => b.placement === 'header')
    .filter((b: any) => canUseAction(b.id))
    .map((b: any) => ({
      id: b.id,
      label: b.label,
      variant: b.variant,
      onClick: () => handleHeaderAction(b.id)
    }));
  if (
    canEditModule
    && !!processDraftFieldKey
    && !['invoices', 'purchase_invoices'].includes(String(moduleId))
  ) {
    headerActions.push({
      id: 'create_process',
      label: 'ایجاد فرآیند',
      variant: 'primary',
      onClick: () => handleHeaderAction('create_process')
    });
  }
  if (['products', 'invoices', 'purchase_invoices', 'tasks'].includes(String(moduleId)) && canEditModule) {
    headerActions.push({
      id: 'create_project',
      label: 'ایجاد پروژه',
      variant: 'default',
      onClick: () => handleHeaderAction('create_project')
    });
  }
  if (moduleId === 'marketing_leads' && canEditModule && data?.lead_type === 'new_lead' && !data?.customer_id) {
    headerActions.push({
      id: 'create_customer_from_lead',
      label: 'ایجاد مشتری',
      variant: 'primary',
      onClick: () => handleHeaderAction('create_customer_from_lead')
    });
  }
  if ((moduleId === 'customers' || moduleId === 'suppliers' || moduleId === 'employees') && canEditModule) {
    const platformKey = String(data?.bot_default_channel || data?.preferred_notification_channel || 'none').trim();
    const platformLabel = CUSTOMER_BOT_CHANNEL_LABELS[platformKey] || CUSTOMER_BOT_CHANNEL_LABELS.none;
    headerActions.push({
      id: 'counterparty_bot_group_status',
      label: moduleId === 'customers'
        ? `وضعیت گروه ${platformLabel}`
        : 'وضعیت گروه بات',
      variant: 'default',
      onClick: () => handleHeaderAction('counterparty_bot_group_status')
    });
  }
  if (moduleId === 'products' && canUseAction('quick_stock_movement')) {
    headerActions.push({
      id: 'quick_stock_movement',
      label: 'افزودن حواله',
      variant: 'default',
      onClick: () => handleHeaderAction('quick_stock_movement')
    });
  }
  if (moduleId === 'shelves' && canUseAction('quick_stock_movement')) {
    headerActions.push({
      id: 'quick_stock_movement',
      label: 'افزودن حواله',
      variant: 'default',
      onClick: () => handleHeaderAction('quick_stock_movement')
    });
  }
  if ((moduleId === 'invoices' || moduleId === 'purchase_invoices') && canIssueAccountingEntry) {
    headerActions.push({
      id: 'issue_accounting_entry',
      label: issueAccountingLoading ? 'در حال صدور...' : 'صدور سند',
      variant: 'primary',
      onClick: handleIssueAccountingEntry,
    });
  }
  if ((moduleId === 'invoices' || moduleId === 'sales_return_invoices') && canUseAction('send_taxpayer_system')) {
    headerActions.push({
      id: 'send_taxpayer_system',
      label: 'ارسال به سامانه مودیان',
      variant: 'default',
      onClick: () => handleHeaderAction('send_taxpayer_system'),
    });
  }
  if (moduleId === 'production_orders') {
    if (data?.status === 'in_progress') {
      if (canUseAction('stop_production')) {
        headerActions.push({
          id: 'stop_production',
          label: 'توقف تولید',
          variant: 'default',
          onClick: () => handleProductionStatusChange('pending')
        });
      }
      if (canUseAction('complete_production')) {
        headerActions.push({
          id: 'complete_production',
          label: 'تکمیل تولید',
          variant: 'primary',
          onClick: () => handleProductionStatusChange('completed')
        });
      }
    } else if (data?.status === 'pending') {
      if (canUseAction('start_production')) {
        headerActions.push({
          id: 'start_production',
          label: 'شروع تولید',
          variant: 'primary',
          onClick: () => handleProductionStatusChange('in_progress')
        });
      }
    }
  }
  (moduleConfig.recordActions || [])
    .filter((action: any) => (action.placement || 'header') === 'header')
    .filter((action: any) => canUseAction(action.id))
    .filter((action: any) => !action.visible || action.visible(data))
    .forEach((action: any) => {
      headerActions.push({
        id: action.id,
        label: action.label,
        variant: action.variant,
        onClick: async () => {
          if (action.navigateTo) {
            navigate(action.navigateTo(data ?? {}));
            return;
          }
          if (action.confirmTitle) {
            modal.confirm({
              title: action.confirmTitle,
              content: action.confirmDescription || undefined,
              okText: 'تایید',
              cancelText: 'انصراف',
              okButtonProps: action.danger ? { danger: true } : undefined,
              onOk: async () => {
                await handleModuleRecordAction(action.id);
              },
            });
            return;
          }
          await handleModuleRecordAction(action.id);
        },
      });
    });

  if (isOnlineCatalogModule(moduleId) && ['price_lists', 'product_bundles'].includes(moduleId) && canEditModule && id) {
    headerActions.push({
      id: 'online_catalog',
      label: 'کاتالوگ‌های آنلاین',
      variant: 'default',
      onClick: async () => { setIsOnlineCatalogManagerOpen(true); },
    });
  }

  const resolvedRecordTitle = getRecordTitle(data, moduleConfig, { fallback: '' });
  const recordTitleField = (moduleConfig?.fields || []).find((field: any) => {
    if (!field?.key || field.readonly || canViewField(field.key) === false) return false;
    return field.isKey && [FieldType.TEXT, FieldType.LONG_TEXT, FieldType.SUPER_LONG_TEXT].includes(field.type);
  }) || (moduleConfig?.fields || []).find((field: any) => {
    if (!field?.key || field.readonly || canViewField(field.key) === false) return false;
    return ['name', 'title', 'business_name', 'full_name', 'subject'].includes(String(field.key))
      && [FieldType.TEXT, FieldType.LONG_TEXT, FieldType.SUPER_LONG_TEXT].includes(field.type);
  });
  const renderEditableRecordTitle = recordTitleField
    ? () => (
      <div className="min-w-0 [&_.ant-input]:!text-2xl [&_.ant-input]:md:!text-3xl [&_.ant-input]:!font-black [&_.ant-input]:!h-auto [&_.ant-input]:!py-0">
        {renderSmartField(recordTitleField, true)}
      </div>
    )
    : undefined;
  const handleHeaderRefresh = async () => {
    await fetchRecord(true);
  };

  return (
    <div className="p-4 pt-1 md:p-6 md:pt-1 max-w-[1600px] mx-auto pb-20 transition-all overflow-x-hidden pl-0 md:pl-[88px] scrollbar-wide">
      <div className="mb-4 md:mb-0">
        <RelatedSidebar
          moduleConfig={moduleConfig}
          recordId={id!}
          recordName={resolvedRecordTitle}
          currentRecord={{ ...displayData, id }}
          mentionUsers={allUsers}
          mentionRoles={allRoles}
          processRuntimeSnapshot={processRuntimeSnapshot}
        />
      </div>

      <HeaderActions
        moduleTitle={moduleConfig.titles.fa}
        recordName={resolvedRecordTitle}
        shareUrl={printManager.printQrValue}
        onBack={() => navigate(`/${moduleId}`)}
        onHome={() => navigate('/')}
        onModule={() => navigate(`/${moduleId}`)}
        onPrint={() => printManager.setIsPrintModalOpen(true)}
        onRefresh={handleHeaderRefresh}
        onCopy={canEditModule ? handleCopyRecord : undefined}
        refreshLoading={loading}
        onEdit={() => setIsEditDrawerOpen(true)}
        onDelete={handleDelete}
        lockControl={
          <RecordLockControl
            moduleId={moduleId}
            recordId={id}
            lockState={recordLockState}
            canLock={canLockCurrentRecord}
            canUnlock={canUnlockCurrentRecord}
            showUnlocked
            showLockedLabel
            size="middle"
            onChanged={handleRecordLockChanged}
          />
        }
        canEdit={canEditModule}
        canDelete={canDeleteModule}
        extraActions={headerActions}
      />

      <HeroSection
        data={{ ...displayData, id }}
        recordTitle={resolvedRecordTitle}
        moduleId={moduleId}
        moduleConfig={moduleConfig}
        currentTags={currentTags}
        onTagsChange={() => void fetchRecord(true)}
        renderSmartField={renderSmartField}
        getOptionLabel={getOptionLabel}
        getUserName={getUserName}
        handleAssigneeChange={handleAssigneeChange}
        supportsRoleAssignee={supportsRoleAssignee}
        canManageAssignee={supportsAssignee}
        onImageUpdate={handleImageUpdate}
        onMainImageChange={handleMainImageChange}
        canViewField={canViewField}
        canEditModule={canEditModule}
        canUploadFilesManager={baseCanEditModule}
        canDeleteFilesManager={canEditModule}
        checkVisibility={checkVisibility}
        isFieldVisible={conditionalFieldRuntime.isFieldVisible}
        recordTitleFieldKey={recordTitleField?.key || null}
        renderRecordTitle={renderEditableRecordTitle}
      />

      <FieldGroupsTabs
        fieldGroups={fieldGroups}
        moduleConfig={moduleConfig}
        data={displayData}
        moduleId={moduleId}
        recordId={id!}
        relationOptions={relationOptions}
        dynamicOptions={dynamicOptions}
        renderSmartField={renderSmartField}
        checkVisibility={checkVisibility}
        isFieldVisible={conditionalFieldRuntime.isFieldVisible}
        canViewField={canViewField}
        canEditModule={canEditModule}
        onDataUpdate={handleRecordPatch}
        stockMovementQuickAddSignal={stockMovementQuickAddSignal}
        extraBlockContent={extraBlockContent}
      />

      <TablesSection
        module={moduleConfig}
        data={displayData}
        relationOptions={relationOptions}
        dynamicOptions={dynamicOptions}
        checkVisibility={checkVisibility}
        isFieldVisible={conditionalFieldRuntime.isFieldVisible}
        canViewField={canViewField}
        canEditModule={canEditModule}
        onDataUpdate={handleRecordPatch}
        focusBlockId={focusBlockId}
        focusRowKey={focusRowKey}
        processRuntimeSnapshot={processRuntimeSnapshot}
        onProcessRuntimeSnapshot={setProcessRuntimeSnapshot}
      />

      {isDeleteModalOpen && id ? (
        <React.Suspense fallback={null}>
          <DeleteModuleRecordsModal
            open={isDeleteModalOpen}
            moduleId={moduleId}
            moduleConfig={moduleConfig}
            recordIds={[String(id)]}
            seededRecords={data ? [{ ...data, id }] : undefined}
            onCancel={() => setIsDeleteModalOpen(false)}
            onDeleted={async () => {
              setIsDeleteModalOpen(false);
              msg.success('رکورد به سطل بازیافت منتقل شد.');
              navigate(`/${moduleId}`);
            }}
          />
        </React.Suspense>
      ) : null}

      {moduleId === 'chart_of_accounts' && id ? (
        <React.Suspense fallback={<Skeleton active paragraph={{ rows: 3 }} />}>
          <AccountLedgerPanel
            accountId={id}
            accountCode={data?.code ?? null}
            accountName={data?.name ?? null}
          />
        </React.Suspense>
      ) : null}

      {isEditDrawerOpen && (
        <React.Suspense fallback={null}>
        <SmartForm
          module={moduleConfig}
          visible={isEditDrawerOpen}
          recordId={id}
          initialValues={data || {}}
          onSave={handleSmartFormSave}
          onCancel={() => {
            setIsEditDrawerOpen(false);
          }}
        />
        </React.Suspense>
      )}

      {isCreateOrderOpen && MODULES['production_orders'] && (
        <React.Suspense fallback={null}>
        <SmartForm
          module={MODULES['production_orders']}
          visible={isCreateOrderOpen}
          title="ایجاد سفارش تولید"
          initialValues={{
            bom_id: id,
            name: data?.name || '',
            product_category: data?.product_category || null,
            grid_materials: data?.grid_materials || [],
            production_stages_draft: data?.production_stages_draft || [],
            __skipBomConfirm: true,
          }}
          onCancel={() => setIsCreateOrderOpen(false)}
          onSave={handleCreateOrderFromBom}
        />
        </React.Suspense>
      )}

      {isCreateCustomerFromLeadOpen && MODULES['customers'] && (
        <React.Suspense fallback={null}>
        <SmartForm
          module={MODULES['customers']}
          visible={isCreateCustomerFromLeadOpen}
          title="ایجاد مشتری از روی لید"
          initialValues={buildCustomerInitialValuesFromLead()}
          onCancel={() => setIsCreateCustomerFromLeadOpen(false)}
          onSave={handleCreateCustomerFromLeadSave}
        />
        </React.Suspense>
      )}

      {(moduleId === 'invoices' || moduleId === 'sales_return_invoices') && id && isTaxpayerModalOpen && (
        <React.Suspense fallback={null}>
        <TaxpayerInvoiceModal
          open
          moduleId={moduleId}
          invoiceId={id}
          invoiceRecord={data}
          onClose={() => setIsTaxpayerModalOpen(false)}
          onRefresh={() => fetchRecord(true)}
        />
        </React.Suspense>
      )}

      <Modal
        title="ایجاد سریع پروژه"
        open={isQuickProjectModalOpen}
        width={920}
        zIndex={12500}
        style={{ maxWidth: 'calc(100vw - 1rem)' }}
        onCancel={() => {
          if (quickProjectLoading) return;
          setIsQuickProjectModalOpen(false);
          setQuickProjectTargetModuleIds([]);
          setQuickProjectLinkedRecords({});
          setQuickProjectRelationOptions({});
          setQuickProjectRelationLoading({});
          setQuickProjectDynamicOptions({});
          quickProjectSubmitLockRef.current = false;
          quickProjectForm.resetFields();
        }}
        footer={null}
        destroyOnHidden
      >
        <Form form={quickProjectForm} layout="vertical" onFinish={handleQuickProjectCreate} className="pt-2">
          {quickProjectModalFields.map((field: any) => {
            const fieldKey = String(field?.key || '').trim();
            const fieldValue = fieldKey === 'name'
              ? quickProjectName
              : fieldKey === 'customer_id'
                ? quickProjectCustomerId
                : fieldKey === 'project_alignment'
                  ? quickProjectAlignment
                  : quickProjectTemplateId;
            const fieldOptions = fieldKey === 'customer_id'
              ? quickProjectCustomerOptions
              : fieldKey === 'process_template_id'
                ? quickProjectTemplateOptions
                : field.dynamicOptionsCategory
                  ? (quickProjectDynamicOptions[String(field.dynamicOptionsCategory || '').trim()] || field.options || [])
                  : field.options;
            const handleOptionsUpdate = fieldKey === 'customer_id' || fieldKey === 'process_template_id'
              ? () => {
                  void loadQuickProjectModalOptions({
                    customerId: quickProjectForm.getFieldValue('customer_id'),
                    templateId: quickProjectForm.getFieldValue('process_template_id'),
                  });
                }
              : undefined;
            return (
              <SmartFieldRenderer
                key={fieldKey}
                field={field}
                value={fieldValue}
                onChange={(value) => {
                  quickProjectForm.setFieldValue(fieldKey, value ?? (field.type === FieldType.MULTI_SELECT ? [] : null));
                }}
                forceEditMode={true}
                options={fieldOptions}
                onOptionsUpdate={handleOptionsUpdate}
                moduleId="projects"
                allValues={quickProjectForm.getFieldsValue(true)}
                overlayZIndexBase={12600}
              />
            );
          })}

          {String(quickProjectTemplateId || '').trim() && quickProjectLinkedFields.length > 0 ? (
            <div className="mb-4 rounded-xl border border-leather-200 bg-leather-50 px-3 py-3 dark:border-white/10 dark:bg-white/5">
              <div className="text-sm font-semibold text-leather-800 dark:text-gray-100">رکوردهای مرتبط فرآیند</div>
              <div className="mt-1 text-xs text-leather-700 dark:text-gray-300">
                رکوردهای شناخته‌شده به‌صورت خودکار پر شده‌اند. برای ماژول‌های دیگر در صورت نیاز رکورد انتخاب کنید.
              </div>
              {quickProjectRelationsLoading ? (
                <div className="mt-1 text-xs text-leather-600 dark:text-gray-400">در حال بارگذاری گزینه‌های رکوردهای مرتبط...</div>
              ) : null}
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                {quickProjectLinkedFields.map(({ moduleId: targetModuleId, field }) => (
                  <div key={field.key}>
                    <SmartFieldRenderer
                      field={field}
                      value={quickProjectLinkedRecords[targetModuleId] || undefined}
                      onChange={(value) => setQuickProjectLinkedRecords((prev) => ({
                        ...prev,
                        [targetModuleId]: value ? String(value) : null,
                      }))}
                      forceEditMode={true}
                      options={quickProjectRelationOptions[targetModuleId] || []}
                      onOptionsUpdate={() => { void loadQuickProjectRelationOptions(targetModuleId, quickProjectLinkedRecords[targetModuleId] || null); }}
                      moduleId={moduleId}
                      allValues={quickProjectLinkedRecords}
                      overlayZIndexBase={12600}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {(moduleId === 'invoices' || moduleId === 'purchase_invoices') && (
            <div className="rounded-xl border border-leather-200 bg-leather-50 px-3 py-2 text-xs text-leather-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
              {moduleId === 'invoices'
                ? 'این پروژه به‌صورت خودکار به فاکتور فروش جاری هم لینک می‌شود.'
                : 'این پروژه به‌صورت خودکار به فاکتور خرید جاری هم لینک می‌شود.'}
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-white/10">
            <Button disabled={quickProjectLoading} onClick={() => {
              setIsQuickProjectModalOpen(false);
              setQuickProjectTargetModuleIds([]);
              setQuickProjectLinkedRecords({});
              setQuickProjectRelationOptions({});
              setQuickProjectRelationLoading({});
              quickProjectSubmitLockRef.current = false;
              quickProjectForm.resetFields();
            }}>
              انصراف
            </Button>
            <Button type="primary" htmlType="submit" loading={quickProjectLoading} className="bg-leather-600 hover:!bg-leather-500 border-none">
              ایجاد پروژه
            </Button>
          </div>
        </Form>
      </Modal>

      {moduleId === 'production_orders' && (
        <>
          {productionModal === 'start' ? (
            <React.Suspense fallback={null}>
              <StartProductionModal
                open
                loading={statusLoading}
                materials={startMaterials}
                orderName={String(data?.name || '')}
                sourceShelfOptionsByProduct={sourceShelfOptionsByProduct}
                productionShelfOptions={productionShelfOptions}
                onCancel={() => setProductionModal(null)}
                onStart={handleConfirmStartProduction}
                onToggleGroup={setStartMaterialCollapsed}
                onDeliveryRowAdd={addStartDeliveryRow}
                onDeliveryRowsDelete={deleteStartDeliveryRows}
                onDeliveryRowsTransfer={transferStartDeliveryRows}
                onDeliveryRowFieldChange={updateStartDeliveryRowField}
                onSourceShelfChange={setStartMaterialSourceShelf}
                onSourceShelfScan={handleSourceShelfScan}
                onProductionShelfChange={setStartMaterialProductionShelf}
                onConfirmGroup={handleConfirmStartGroup}
              />
            </React.Suspense>
          ) : null}

          <Modal
            title={PRODUCTION_MESSAGES.stopTitle}
            open={productionModal === 'stop'}
            onOk={handleConfirmStopProduction}
            onCancel={() => setProductionModal(null)}
            okText="توقف تولید"
            cancelText="انصراف"
            confirmLoading={statusLoading}
            destroyOnHidden
          >
            <div className="text-sm text-gray-600 whitespace-pre-line">
              {PRODUCTION_MESSAGES.stopNotice}
            </div>
          </Modal>

          <Modal
            title={PRODUCTION_MESSAGES.completeTitle}
            open={productionModal === 'complete'}
            onOk={outputMode === 'existing' ? handleConfirmCompleteProduction : undefined}
            onCancel={() => setProductionModal(null)}
            okText={outputMode === 'existing' ? 'ثبت تکمیل' : undefined}
            cancelText="انصراف"
            confirmLoading={statusLoading}
            destroyOnHidden
            footer={outputMode === 'existing' ? undefined : null}
          >
            <div className="space-y-4">
              <div className="text-sm text-gray-700 whitespace-pre-line">
                تعداد "{toPersianNumber(getOrderQuantity(productionQuantityPreview))}" عدد از محصول بر اساس شناسنامه تولید "{getFieldValueLabel('bom_id', data?.bom_id) || '-'}" تولید شد.
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
                <div className="text-xs text-gray-500">قفسه نگهداری محصول تولید شده:</div>
                <div className="flex items-center gap-2">
                  <Select
                    placeholder="انتخاب قفسه مقصد"
                    value={outputShelfId}
                    onChange={(val) => setOutputShelfId(val)}
                    options={outputShelfOptions}
                    showSearch
                    optionFilterProp="label"
                    className="w-full"
                    getPopupContainer={resolveStablePopupContainer}
                  />
                  <QrScanPopover
                    label=""
                    buttonProps={{ type: 'default', shape: 'circle' }}
                    onScan={({ moduleId: scannedModule, recordId: scannedRecordId }) => {
                      if (scannedModule === 'shelves' && scannedRecordId) {
                        setOutputShelfId(scannedRecordId);
                      }
                    }}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                <div className="text-xs text-gray-500">نوع محصول تولید شده:</div>
                <Select
                  placeholder="انتخاب نوع محصول"
                  value={outputProductType}
                  onChange={(val) => {
                    setOutputProductType(val);
                    setOutputProductId(null);
                  }}
                  options={[
                    { label: 'کالا', value: 'goods' },
                  ]}
                  className="w-full"
                  getPopupContainer={resolveStablePopupContainer}
                />
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
                <div className="text-xs text-gray-500">روش ثبت محصول خروجی:</div>
                <div className="flex items-center gap-2">
                  <Button
                    type={outputMode === 'existing' ? 'primary' : 'default'}
                    onClick={() => setOutputMode('existing')}
                  >
                    افزودن به محصول فعلی
                  </Button>
                  <Button
                    type={outputMode === 'new' ? 'primary' : 'default'}
                    onClick={() => setOutputMode('new')}
                  >
                    تعریف محصول جدید
                  </Button>
                </div>

                {outputMode === 'existing' && (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-500">به موجودی یکی از محصولات فعلی اضافه کنید:</div>
                    <div className="flex items-center gap-2">
                      <Select
                        placeholder="انتخاب محصول"
                        value={outputProductId}
                        onChange={(val) => setOutputProductId(val)}
                        options={filteredOutputProductOptions}
                        showSearch
                        optionFilterProp="label"
                        className="w-full"
                        getPopupContainer={resolveStablePopupContainer}
                      />
                      <QrScanPopover
                        label=""
                        buttonProps={{ type: 'default', shape: 'circle' }}
                        onScan={({ moduleId: scannedModule, recordId: scannedRecordId }) => {
                          if (scannedModule === 'products' && scannedRecordId) {
                            const match = filteredOutputProductOptions.find((item) => item.value === scannedRecordId);
                            if (!match) {
                              msg.error('این محصول با نوع انتخاب‌شده همخوانی ندارد.');
                              return;
                            }
                            setOutputProductId(scannedRecordId);
                          }
                        }}
                      />
                    </div>
                  </div>
                )}

                {outputMode === 'new' && (
                  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3 flex items-center justify-between">
                    <div className="text-xs text-gray-500">محصول جدید بسازید:</div>
                    <Button
                      onClick={() => {
                        if (!outputShelfId) {
                          msg.error(PRODUCTION_MESSAGES.requireOutputShelf);
                          return;
                        }
                        if (!outputProductType) {
                          msg.error('نوع محصول تولید شده را انتخاب کنید.');
                          return;
                        }
                        setProductionModal(null);
                        setIsCreateProductOpen(true);
                      }}
                      type="dashed"
                    >
                      تعریف محصول جدید
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Modal>

          {isCreateProductOpen && MODULES['products'] && (
            <React.Suspense fallback={null}>
            <SmartForm
              module={MODULES['products']}
              visible={isCreateProductOpen}
              title="ایجاد محصول جدید از سفارش تولید"
              initialValues={buildNewProductInitialValues()}
              onCancel={() => setIsCreateProductOpen(false)}
              onSave={handleCreateProductSave}
            />
            </React.Suspense>
          )}
        </>
      )}

      {botStatusModalOpen ? (
        <React.Suspense fallback={null}>
          <CounterpartyBotStatusModal
            open
            loading={botStatusModalLoading}
            saving={botStatusModalSaving}
            watchingChannel={botStatusWatchingChannel}
            countdown={botStatusCountdown}
            activeTab={botStatusActiveTab}
            defaultChannel={botStatusDefaultChannel}
            fallbackToActive={botStatusFallbackToActive}
            counterpartyType={
              botStatusModalContext?.moduleId === 'suppliers'
                ? 'supplier'
                : botStatusModalContext?.moduleId === 'employees'
                  ? 'employee'
                  : 'customer'
            }
            platforms={botStatusPlatformData}
            userOptions={allUsers.map((user: any) => ({
              label: String(user?.full_name || user?.email || user?.mobile_1 || user?.id || '-').trim(),
              value: String(user?.id || '').trim(),
            })).filter((item: any) => item.value)}
            roleOptions={allRoles.map((role: any) => ({
              label: String(role?.title || role?.name || role?.id || '-').trim(),
              value: String(role?.id || '').trim(),
            })).filter((item: any) => item.value)}
            onClose={handleCloseBotStatusModal}
            onSave={() => void handleSaveBotStatusModal()}
            onChangeTab={setBotStatusActiveTab}
            onChangeDefaultChannel={setBotStatusDefaultChannel}
            onChangeFallbackToActive={setBotStatusFallbackToActive}
            onStartBindWatch={(channel) => void handleStartBotBindWatch(channel)}
            onCopyActivationCode={(channel) => void handleCopyBotActivationCode(channel)}
            onChangePlatform={(channel, key, value) => setBotStatusPlatformData((prev) => ({
              ...prev,
              [channel]: { ...prev[channel], [key]: value },
            }))}
          />
        </React.Suspense>
      ) : null}

      <Modal
        open={accountingEntryPickerOpen}
        title="انتخاب سند حسابداری"
        onCancel={() => setAccountingEntryPickerOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <div className="space-y-3">
          <div className="text-sm text-gray-500">
            برای این فاکتور بیش از یک سند حسابداری مرتبط پیدا شد. سند موردنظر را باز کنید.
          </div>
          <div className="flex flex-col gap-2">
            {accountingEntryChoices.map((choice) => {
              const labels = choice.eventKeys.map((eventKey) => getAccountingEventLabelFa(eventKey)).join('، ');
              return (
                <Button
                  key={choice.journalEntryId}
                  block
                  onClick={() => {
                    setAccountingEntryPickerOpen(false);
                    navigate(`/${MODULES.journal_entries.table}/${choice.journalEntryId}`);
                  }}
                >
                  {`${labels}${choice.state === 'created' ? ' | پیش‌نویس جدید' : ' | سند موجود'}`}
                </Button>
              );
            })}
          </div>
        </div>
      </Modal>

      {(printManager.isPrintModalOpen || printManager.printMode) ? (
        <React.Suspense fallback={null}>
          <PrintSection
            isPrintModalOpen={printManager.isPrintModalOpen}
            onClose={() => printManager.setIsPrintModalOpen(false)}
            onPreparePrint={printManager.preparePrint}
            onPrint={printManager.handlePrint}
            onSendInternalPdf={handleOpenPrintShare}
            onSavePdfToRecord={recordSupportsFileSave ? handleSavePrintPdfToRecord : undefined}
            printTemplates={printManager.printTemplates}
            selectedTemplateId={printManager.selectedTemplateId}
            onSelectTemplate={printManager.setSelectedTemplateId}
            renderPrintCard={printManager.renderPrintCard}
            printMode={printManager.printMode}
            printableFields={printManager.printableFieldsForTemplate || printableFields}
            selectedPrintFields={printManager.selectedPrintFields}
            onTogglePrintField={printManager.handleTogglePrintField}
            onTogglePrintFieldGroup={printManager.handleTogglePrintFieldGroup}
            onMovePrintField={printManager.handleMovePrintField}
            imageDisplayMode={printManager.imageDisplayMode}
            onChangeImageDisplayMode={printManager.handleChangeImageDisplayMode}
            onSavePrintFields={printManager.handleSavePrintFields}
            savingPrintFields={printManager.savingPrintFields}
            printSignatureRows={printManager.printSignatureStates}
            printSignatureQuickAddOptions={printManager.printSignatureQuickAddOptions}
            signatureOptionsByRow={printManager.signatureOptionsByRow}
            onAddPrintSignatureRow={printManager.handleAddPrintSignatureRow}
            onRemovePrintSignatureRow={printManager.handleRemovePrintSignatureRow}
            onMovePrintSignatureRow={printManager.handleMovePrintSignatureRow}
            onTogglePrintSignatureAutomatic={printManager.handleTogglePrintSignatureAutomatic}
            onChangePrintSignatureName={printManager.handleChangePrintSignatureName}
            onChangePrintSignatureSubtitle={printManager.handleChangePrintSignatureSubtitle}
            onChangePrintSignatureSignerModule={printManager.handleChangePrintSignatureSignerModule}
            onChangePrintSignatureSignerId={printManager.handleChangePrintSignatureSignerId}
            onSearchPrintSignatureOptions={printManager.loadSignatureSignerOptions}
            onRefreshPreview={printManager.refreshTemplates}
            allowFieldSelectionTab={printManager.allowFieldSelectionTab}
            showImageDisplayModeControl={printManager.showImageDisplayModeControl}
            previewMeta={printManager.previewMeta}
          />
        </React.Suspense>
      ) : null}
      {isOnlineCatalogManagerOpen && isOnlineCatalogModule(moduleId) && ['price_lists', 'product_bundles'].includes(moduleId) ? (
        <React.Suspense fallback={null}>
          <OnlineCatalogManagerModal
            open={isOnlineCatalogManagerOpen}
            moduleId={moduleId}
            sourceRecordIds={id ? [String(id)] : []}
            onCancel={() => setIsOnlineCatalogManagerOpen(false)}
            onSaved={() => setIsOnlineCatalogManagerOpen(false)}
          />
        </React.Suspense>
      ) : null}
      <Modal
        title="ارسال مستقیم PDF"
        open={printShareModalOpen}
        onCancel={() => {
          setPrintShareModalOpen(false);
          setPrintShareTemplateModalOpen(false);
          setPrintShareTargetIds([]);
          setPendingPrintShareFile(null);
          setPrintShareMessageText('');
        }}
        onOk={() => { void handleSubmitPrintShare(); }}
        confirmLoading={printShareSubmitting}
        okText="ارسال مستقیم"
        cancelText="انصراف"
        okButtonProps={{ disabled: printShareTargetIds.length === 0 }}
        zIndex={1700}
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-[rgba(var(--brand-200-rgb),0.7)] bg-[rgba(var(--brand-50-rgb),0.7)] px-3 py-2 text-sm text-gray-700">
            {pendingPrintShareFile?.name || 'فایل PDF آماده ارسال است.'}
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-gray-500">متن پیام</div>
            <Button size="small" icon={<CopyOutlined />} onClick={() => setPrintShareTemplateModalOpen(true)}>
              پیام‌های آماده
            </Button>
          </div>
          <Input.TextArea
            value={printShareMessageText}
            onChange={(event) => setPrintShareMessageText(event.target.value)}
            rows={4}
            placeholder="متن پیام (اختیاری)"
            className="w-full"
          />
          <Select
            mode="multiple"
            showSearch
            allowClear
            value={printShareTargetIds}
            onChange={(values) => setPrintShareTargetIds((values || []).map((value) => String(value)))}
            options={printShareTargetOptions}
            optionFilterProp="label"
            placeholder="انتخاب مقصد (داخلی، بات، پیامک)"
            className="w-full"
            maxTagCount="responsive"
            getPopupContainer={(trigger) => trigger.parentElement || document.body}
            styles={{ popup: { root: { zIndex: 1710 } } }}
          />
        </div>
      </Modal>
      {printShareTemplateModalOpen ? (
        <React.Suspense fallback={null}>
        <MessageComposerModal
          open
          mode="template"
          moduleId={moduleId}
          record={(data || null) as Record<string, any> | null}
          templateOnlyTitle="پیام‌های آماده ارسال مستقیم PDF"
          onApplyTemplate={(content) => {
            const normalizedContent = String(content || '').trim();
            if (!normalizedContent) return;
            setPrintShareMessageText((prev) => (String(prev || '').trim()
              ? `${String(prev || '').trim()}\n${normalizedContent}`
              : normalizedContent));
          }}
          onInsertVariable={(token) => {
            const normalizedToken = String(token || '').trim();
            if (!normalizedToken) return;
            setPrintShareMessageText((prev) => `${String(prev || '')}${normalizedToken}`);
          }}
          onCancel={() => setPrintShareTemplateModalOpen(false)}
        />
        </React.Suspense>
      ) : null}

      <style>{`
        .animate-fadeIn { animation: fadeIn 0.5s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .custom-erp-table .ant-table-thead > tr > th { background: #f9fafb !important; color: #6b7280 !important; font-size: 12px !important; }
        .dark .custom-erp-table .ant-table-thead > tr > th { background: #262626 !important; color: #bbb; border-bottom: 1px solid #303030 !important; }
        .dark .ant-tabs-tab { color: #888; }
        .dark .ant-tabs-tab-active .ant-tabs-tab-btn { color: white !important; }
        .dark .ant-table-cell { background: #1a1a1a !important; color: #ddd !important; border-bottom: 1px solid #303030 !important; }
        .dark .ant-table-tbody > tr:hover > td { background: #222 !important; }
      `}</style>
      <style>{printStyles}</style>
    </div>
  );
};

export default ModuleShow;
