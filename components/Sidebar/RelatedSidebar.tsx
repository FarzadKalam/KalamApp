import React, { useEffect, useMemo, useState } from 'react';
import { Badge, Drawer, Tooltip } from 'antd';
import {
    FileTextOutlined, CheckSquareOutlined, HistoryOutlined,
    RightOutlined, SkinOutlined, AppstoreOutlined,
    BgColorsOutlined, ScissorOutlined, ToolOutlined, ExperimentOutlined,
    DropboxOutlined, UsergroupAddOutlined, CreditCardOutlined, NodeIndexOutlined,
    ShoppingOutlined, ShoppingCartOutlined, ProjectOutlined, PhoneOutlined, MessageOutlined, WalletOutlined
} from '@ant-design/icons';
import ActivityPanel from './ActivityPanel';
import RelatedRecordsPanel from './RelatedRecordsPanel';
import AssistantPanel from '../ai/AssistantPanel';
import AiSparkleIcon from '../ai/AiSparkleIcon';
import { FieldType, ModuleDefinition, RelatedTabConfig, RelatedTabFilterConfig } from '../../types';
import { supabase } from '../../supabaseClient';
import { applyTaskSourceRecordFilter } from '../../utils/taskMeta';
import { MODULES } from '../../moduleRegistry';
import { runSelectWithCompatibleColumns } from '../../utils/selectCompat';
import { AI_CONTEXT_EVENT, type AssistantContext } from '../../utils/aiAssistantEvents';
import { buildProcessGuideContext, type ProcessGuideContext } from '../../utils/processGuideContext';
import type { ProcessRuntimeSnapshot } from '../../utils/processRuntimeSnapshot';
import { scheduleOverlayLockRelease } from '../../utils/overlayLocks';

// نقشه آیکون‌ها: نام متنی را به کامپوننت واقعی وصل می‌کند
const iconMap: Record<string, React.ReactNode> = {
  'SkinOutlined': <SkinOutlined />,
  'AppstoreOutlined': <AppstoreOutlined />,
    'FileTextOutlined': <FileTextOutlined />,
    'CreditCardOutlined': <CreditCardOutlined />,
  'ShoppingOutlined': <ShoppingOutlined />,
  'ShoppingCartOutlined': <ShoppingCartOutlined />,
  'ProjectOutlined': <ProjectOutlined />,
  'PhoneOutlined': <PhoneOutlined />,
  'MessageOutlined': <MessageOutlined />,
  'WalletOutlined': <WalletOutlined />,
  'BgColorsOutlined': <BgColorsOutlined />,
  'ScissorOutlined': <ScissorOutlined />,
  'ToolOutlined': <ToolOutlined />,
  'ExperimentOutlined': <ExperimentOutlined />,
  'DropboxOutlined': <DropboxOutlined />,
  'UsergroupAddOutlined': <UsergroupAddOutlined />,
  // آیکون پیش‌فرض
  'default': <AppstoreOutlined />
};

interface RelatedSidebarProps {
  moduleConfig: ModuleDefinition;
  recordId: string;
  recordName?: string; // ✅ اضافه شده
  currentRecord?: Record<string, any> | null;
    mentionUsers?: any[];
    mentionRoles?: any[];
    processRuntimeSnapshot?: ProcessRuntimeSnapshot | null;
}

const applyTabFilters = (query: any, filters?: RelatedTabFilterConfig[]) => {
  let nextQuery = query;
  (filters || []).forEach((filter) => {
    const field = String(filter?.field || '').trim();
    if (!field) return;
    const operator = String(filter?.operator || 'eq').trim();
    if (operator === 'neq') {
      nextQuery = nextQuery.neq(field, filter?.value);
      return;
    }
    if (operator === 'in') {
      const values = Array.isArray(filter?.value) ? filter.value : [filter?.value];
      const safeValues = values.filter((value) => value !== undefined);
      if (safeValues.length > 0) {
        nextQuery = nextQuery.in(field, safeValues);
      }
      return;
    }
    if (operator === 'is') {
      nextQuery = nextQuery.is(field, filter?.value ?? null);
      return;
    }
    nextQuery = nextQuery.eq(field, filter?.value);
  });
  return nextQuery;
};

const isMissingColumnError = (error: any) => {
  if (!error) return false;
  const code = String(error?.code || '').trim();
  if (code === '42703') return true;
  const message = String(error?.message || '').toLowerCase();
  return message.includes('does not exist') && message.includes('column');
};

const fetchRecordPhoneNumberIds = async (entityType: string, entityId: string) => {
    const { data, error } = await supabase
        .from('phone_number_links')
        .select('phone_number_id')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId);
    if (error) throw error;
    return Array.from(new Set((data || []).map((row: any) => String(row?.phone_number_id || '').trim()).filter(Boolean)));
};

const resolveLatestTimestamp = (values: Array<string | null | undefined>) =>
  values.filter(Boolean).sort().pop() || null;

const fetchLatestEmployeeFinancialOverviewAt = async (employeeId: string) => {
  const [payrollRes, advanceRes] = await Promise.all([
    supabase
      .from('payroll_slips')
      .select('id, created_at')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })
      .limit(3000),
    supabase
      .from('employee_advances')
      .select('id, created_at')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })
      .limit(3000),
  ]);

  const payrollIds = Array.from(new Set((payrollRes.data || []).map((row: any) => String(row?.id || '').trim()).filter(Boolean)));
  const advanceIds = Array.from(new Set((advanceRes.data || []).map((row: any) => String(row?.id || '').trim()).filter(Boolean)));

  const operationRequests: PromiseLike<any>[] = [];
  if (payrollIds.length > 0) {
    operationRequests.push(
      supabase
        .from('cash_bank_operations')
        .select('created_at')
        .in('payroll_slip_id', payrollIds)
        .order('created_at', { ascending: false })
        .limit(1),
    );
  }
  if (advanceIds.length > 0) {
    operationRequests.push(
      supabase
        .from('cash_bank_operations')
        .select('created_at')
        .in('employee_advance_id', advanceIds)
        .order('created_at', { ascending: false })
        .limit(1),
    );
  }

  const operationResponses = operationRequests.length > 0 ? await Promise.all(operationRequests) : [];
  return resolveLatestTimestamp([
    payrollRes.data?.[0]?.created_at,
    advanceRes.data?.[0]?.created_at,
    ...operationResponses.map((response: any) => response?.data?.[0]?.created_at),
  ]);
};

const getModuleTableName = (moduleId?: string | null) => {
  const normalized = String(moduleId || '').trim();
  return MODULES[normalized]?.table || normalized;
};

const PROCESS_STAGE_FIELD_KEYS = new Set([
  'execution_process_draft',
  'marketing_process_draft',
  'template_stages_preview',
  'run_stages_preview',
]);

const buildMentionAssigneeDirectory = (mentionUsers: any[], mentionRoles: any[]) => ({
  users: (Array.isArray(mentionUsers) ? mentionUsers : []).map((user) => ({
    id: String(user?.id || '').trim(),
    display_name: String(user?.display_name || user?.name || user?.full_name || user?.email || '').trim(),
    full_name: String(user?.full_name || user?.name || user?.display_name || '').trim(),
    email: String(user?.email || '').trim(),
    role_id: String(user?.role_id || user?.roleId || '').trim() || null,
  })).filter((user) => user.id),
  roles: (Array.isArray(mentionRoles) ? mentionRoles : []).map((role) => ({
    id: String(role?.id || '').trim(),
    title: String(role?.title || role?.name || role?.label || '').trim(),
  })).filter((role) => role.id),
});

const RelatedSidebar: React.FC<RelatedSidebarProps> = ({
  moduleConfig,
  recordId,
  recordName = '',
  currentRecord = null,
  mentionUsers = [],
  mentionRoles = [],
  processRuntimeSnapshot = null,
}) => {
  const DESKTOP_TAB_RAIL_LEFT_OFFSET = 12;
  const DESKTOP_TAB_RAIL_WIDTH = 56;
  const DESKTOP_TAB_RAIL_GAP = 12;
  const DESKTOP_DRAWER_LEFT_OFFSET = DESKTOP_TAB_RAIL_LEFT_OFFSET + DESKTOP_TAB_RAIL_WIDTH + DESKTOP_TAB_RAIL_GAP;
  const [activeKey, setActiveKey] = useState<string | null>(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [unreadMap, setUnreadMap] = useState<Record<string, boolean>>({});

  const fixedTabs = [
      { key: 'ai_assistant', icon: <AiSparkleIcon className="h-5 w-5" />, label: 'هوش مصنوعی', color: 'text-fuchsia-500' },
      { key: 'notes', icon: <FileTextOutlined />, label: 'یادداشت‌ها', color: 'text-blue-500' },
      { key: 'tasks', icon: <CheckSquareOutlined />, label: 'فعالیت ها', color: 'text-green-500' },
      { key: 'changelogs', icon: <HistoryOutlined />, label: 'تغییرات', color: 'text-orange-500' }
  ];

  fixedTabs.splice(2, 0, { key: 'processes', icon: <NodeIndexOutlined />, label: 'فرآیندها', color: 'text-violet-500' });

    const relatedTabs = (moduleConfig.relatedTabs || [])
      .filter((tab) => String(tab?.targetModule || '').trim() !== 'tasks')
      .map((tab) => ({
        ...tab,
        key: tab.id || `related_${tab.targetModule}`,
        icon: iconMap[tab.icon || 'default'] || iconMap['default'],
        label: tab.title,
    }));

    const allTabs = [...fixedTabs, ...relatedTabs].filter((tab) => String(tab?.key || '') !== 'processes');

    const processGuideBundle = useMemo<{
        fieldKey: string | null;
        context: ProcessGuideContext;
    } | null>(() => {
        const moduleId = String(moduleConfig?.id || '').trim();
        const normalizedRecordId = String(recordId || '').trim();
        const runtimeTasks = (
            processRuntimeSnapshot?.loaded
            && processRuntimeSnapshot.moduleId === moduleId
            && processRuntimeSnapshot.recordId === normalizedRecordId
        ) ? (processRuntimeSnapshot.tasks || []) : [];
        const processFields = (moduleConfig?.fields || []).filter((field: any) => (
            field?.type === FieldType.PROGRESS_STAGES
            || PROCESS_STAGE_FIELD_KEYS.has(String(field?.key || ''))
        ));
        const firstFieldWithStages = processFields.find((field: any) => {
            const value = currentRecord?.[String(field?.key || '')];
            return Array.isArray(value) && value.length > 0;
        });
        const selectedField = firstFieldWithStages || processFields[0] || null;
        if (!selectedField && runtimeTasks.length === 0) return null;

        const fieldKey = String(selectedField?.key || 'process_runtime').trim();
        const stages = selectedField && Array.isArray(currentRecord?.[fieldKey])
            ? currentRecord?.[fieldKey]
            : [];
        if (!Array.isArray(stages) && runtimeTasks.length === 0) return null;

        const context = buildProcessGuideContext({
            moduleId,
            recordId: normalizedRecordId || null,
            fieldKey,
            stages: Array.isArray(stages) ? stages : [],
            tasks: runtimeTasks,
            assigneeDirectory: buildMentionAssigneeDirectory(mentionUsers, mentionRoles),
        });
        const hasMeaningfulProcessData = (Array.isArray(stages) && stages.length > 0) || runtimeTasks.length > 0;
        const availableCount = Array.isArray(context.available_processes) ? context.available_processes.length : 0;
        if (!hasMeaningfulProcessData || availableCount === 0) return null;
        return { fieldKey, context };
    }, [currentRecord, mentionRoles, mentionUsers, moduleConfig?.fields, moduleConfig?.id, processRuntimeSnapshot, recordId]);

    const loadUnreadMap = async () => {
        try {
            const { data: authData } = await supabase.auth.getUser();
            const userId = authData?.user?.id;
            if (!userId) return;

            const { data: seenRows } = await supabase
                .from('sidebar_unread')
                .select('tab_key, last_seen_at')
                .eq('user_id', userId)
                .eq('module_id', moduleConfig.id)
                .eq('record_id', recordId);

            const seenMap: Record<string, string | null> = {};
            (seenRows || []).forEach((row: any) => {
                seenMap[row.tab_key] = row.last_seen_at;
            });

            const getSourceFieldValue = async (tab: RelatedTabConfig) => {
                if (!tab.sourceField) return null;
                const sourceTable = moduleConfig.table || moduleConfig.id;
                const { data: sourceRecord } = await (supabase
                    .from(sourceTable as any)
                    .select(tab.sourceField)
                    .eq('id', recordId)
                    .maybeSingle() as any);
                return (sourceRecord as any)?.[tab.sourceField] ?? null;
            };

            const computeLatest = async (tab: any) => {
                try {
                if (tab.key === 'notes') {
                    const { data } = await supabase
                        .from('notes')
                        .select('created_at')
                        .eq('module_id', moduleConfig.id)
                        .eq('record_id', recordId)
                        .order('created_at', { ascending: false })
                        .limit(1);
                    return data?.[0]?.created_at || null;
                }

                if (tab.key === 'changelogs') {
                    const { data } = await supabase
                        .from('changelogs')
                        .select('created_at')
                        .eq('module_id', moduleConfig.id)
                        .eq('record_id', recordId)
                        .order('created_at', { ascending: false })
                        .limit(1);
                    return data?.[0]?.created_at || null;
                }

                if (tab.key === 'tasks') {
                    const scopedQuery = applyTaskSourceRecordFilter(
                        supabase
                            .from('tasks')
                            .select('created_at'),
                        moduleConfig.id,
                        recordId
                    );
                    const { data } = await scopedQuery
                        .order('created_at', { ascending: false })
                        .limit(1);
                    return data?.[0]?.created_at || null;
                }

                if (tab.key === 'processes') {
                    const scopedQuery = applyTaskSourceRecordFilter(
                        supabase
                            .from('tasks')
                            .select('updated_at, created_at'),
                        moduleConfig.id,
                        recordId
                    );
                    const { data } = await scopedQuery
                        .order('updated_at', { ascending: false })
                        .limit(1);
                    return data?.[0]?.updated_at || data?.[0]?.created_at || null;
                }

                if ((tab as RelatedTabConfig).relationType === 'customer_payments') {
                    const { data } = await supabase
                        .from('invoices')
                        .select('created_at')
                        .eq('customer_id', recordId)
                        .order('created_at', { ascending: false })
                        .limit(1);
                    return data?.[0]?.created_at || null;
                }

                if ((tab as RelatedTabConfig).relationType === 'customer_payments_from_field') {
                    const sourceCustomerId = await getSourceFieldValue(tab as RelatedTabConfig);
                    if (!sourceCustomerId) return null;
                    const { data } = await supabase
                        .from('invoices')
                        .select('created_at')
                        .eq('customer_id', sourceCustomerId)
                        .order('created_at', { ascending: false })
                        .limit(1);
                    return data?.[0]?.created_at || null;
                }

                if ((tab as RelatedTabConfig).relationType === 'customer_products') {
                    const { data } = await supabase
                        .from('invoices')
                        .select('created_at')
                        .eq('customer_id', recordId)
                        .order('created_at', { ascending: false })
                        .limit(1);
                    return data?.[0]?.created_at || null;
                }

                if ((tab as RelatedTabConfig).relationType === 'supplier_payments') {
                    const { data } = await runSelectWithCompatibleColumns<any[]>({
                        cacheKey: 'related-sidebar:supplier-payments:last-created-at',
                        columns: ['id', 'created_at'],
                        execute: (selectExpr) => supabase
                            .from('purchase_invoices')
                            .select(selectExpr)
                            .eq('supplier_id', recordId)
                            .order('created_at', { ascending: false })
                            .limit(1),
                    });
                    return data?.[0]?.created_at || null;
                }

                if ((tab as RelatedTabConfig).relationType === 'supplier_products') {
                    const { data } = await runSelectWithCompatibleColumns<any[]>({
                        cacheKey: 'related-sidebar:supplier-products:last-created-at',
                        columns: ['id', 'created_at'],
                        execute: (selectExpr) => supabase
                            .from('purchase_invoices')
                            .select(selectExpr)
                            .eq('supplier_id', recordId)
                            .order('created_at', { ascending: false })
                            .limit(1),
                    });
                    return data?.[0]?.created_at || null;
                }

                if ((tab as RelatedTabConfig).relationType === 'operational_financial_overview') {
                    if (moduleConfig.id === 'customers') {
                        const [opsRes, invoicesRes, barterRes] = await Promise.all([
                            supabase.from('cash_bank_operations').select('created_at').eq('customer_id', recordId).order('created_at', { ascending: false }).limit(1),
                            supabase.from('invoices').select('created_at').eq('customer_id', recordId).order('created_at', { ascending: false }).limit(1),
                            supabase.from('barters').select('created_at').eq('customer_id', recordId).order('created_at', { ascending: false }).limit(1),
                        ]);
                        return [opsRes.data?.[0]?.created_at, invoicesRes.data?.[0]?.created_at, barterRes.data?.[0]?.created_at]
                            .filter(Boolean)
                            .sort()
                            .pop() || null;
                    }

                    if (moduleConfig.id === 'suppliers') {
                        const [opsRes, invoicesRes, barterRes] = await Promise.all([
                            supabase.from('cash_bank_operations').select('created_at').eq('supplier_id', recordId).order('created_at', { ascending: false }).limit(1),
                            supabase.from('purchase_invoices').select('created_at').eq('supplier_id', recordId).order('created_at', { ascending: false }).limit(1),
                            supabase.from('barters').select('created_at').eq('supplier_id', recordId).order('created_at', { ascending: false }).limit(1),
                        ]);
                        return [opsRes.data?.[0]?.created_at, invoicesRes.data?.[0]?.created_at, barterRes.data?.[0]?.created_at]
                            .filter(Boolean)
                            .sort()
                            .pop() || null;
                    }

                    return await fetchLatestEmployeeFinancialOverviewAt(recordId);
                }

                if ((tab as RelatedTabConfig).relationType === 'product_customers') {
                    const matchKey = tab.jsonbMatchKey || 'product_id';
                    const matchPayload = JSON.stringify([{ [matchKey]: recordId }]);
                    const { data } = await supabase
                        .from('invoices')
                        .select('created_at')
                        .filter('invoiceItems', 'cs', matchPayload)
                        .order('created_at', { ascending: false })
                        .limit(1);
                    return data?.[0]?.created_at || null;
                }

                if ((tab as RelatedTabConfig).relationType === 'jsonb_contains' && tab.targetModule && tab.jsonbColumn) {
                    const matchKey = tab.jsonbMatchKey || 'product_id';
                    const matchPayload = JSON.stringify([{ [matchKey]: recordId }]);
                    const { data } = await applyTabFilters(
                        (supabase
                            .from(getModuleTableName(tab.targetModule as string)) as any)
                            .select('created_at')
                            .filter(tab.jsonbColumn as string, 'cs', matchPayload),
                        (tab as RelatedTabConfig).filters,
                    )
                        .order('created_at', { ascending: false })
                        .limit(1);
                    return data?.[0]?.created_at || null;
                }

                if ((tab as RelatedTabConfig).relationType === 'join_table' && tab.joinTable && tab.joinSourceKey && tab.joinTargetKey && tab.targetModule) {
                    const { data: links } = await (supabase
                        .from(tab.joinTable as string) as any)
                        .select(tab.joinTargetKey as string)
                        .eq(tab.joinSourceKey as string, recordId)
                        .limit(50);
                    const ids = Array.from(new Set((links || []).map((row: any) => row[tab.joinTargetKey]).filter(Boolean)));
                    if (!ids.length) return null;
                    const { data } = await supabase
                        .from(getModuleTableName(tab.targetModule))
                        .select('created_at')
                        .in('id', ids)
                        .order('created_at', { ascending: false })
                        .limit(1);
                    return data?.[0]?.created_at || null;
                }

                if ((tab as RelatedTabConfig).relationType === 'fk_from_field' && tab.targetModule && tab.foreignKey) {
                    const sourceValue = await getSourceFieldValue(tab as RelatedTabConfig);
                    if (!sourceValue) return null;
                    let query = applyTabFilters(
                        (supabase
                            .from(getModuleTableName(tab.targetModule as string)) as any)
                            .select('created_at')
                            .eq(tab.foreignKey as string, sourceValue),
                        (tab as RelatedTabConfig).filters,
                    );
                    if (tab.targetModule === moduleConfig.id) {
                        query = query.neq('id', recordId);
                    }
                    const { data } = await query
                        .order('created_at', { ascending: false })
                        .limit(1);
                    return data?.[0]?.created_at || null;
                }

                if ((tab as RelatedTabConfig).relationType === 'record_context' && tab.targetModule) {
                    const { data } = await applyTabFilters(
                        (supabase
                            .from(getModuleTableName(tab.targetModule as string)) as any)
                            .select('created_at')
                            .eq('module_id', moduleConfig.id)
                            .eq('record_id', recordId),
                        (tab as RelatedTabConfig).filters,
                    )
                        .order('created_at', { ascending: false })
                        .limit(1);
                    return data?.[0]?.created_at || null;
                }

                if ((tab as RelatedTabConfig).relationType === 'phone_directory' && tab.targetModule) {
                    const phoneNumberIds = await fetchRecordPhoneNumberIds(moduleConfig.id, recordId);
                    if (!phoneNumberIds.length) return null;
                    const orderField = tab.targetModule === 'sms_delivery_reports' ? 'message_at' : 'created_at';
                    const selectFields = orderField === 'created_at' ? 'created_at' : `${orderField},created_at`;
                    const { data } = await applyTabFilters(
                        (supabase
                            .from(getModuleTableName(tab.targetModule as string)) as any)
                            .select(selectFields)
                            .in('phone_number_id', phoneNumberIds),
                        (tab as RelatedTabConfig).filters,
                    )
                        .order(orderField, { ascending: false })
                        .limit(1);
                    return data?.[0]?.[orderField] || data?.[0]?.created_at || null;
                }

                if (tab.targetModule && tab.foreignKey) {
                    const { data } = await applyTabFilters(
                        (supabase
                            .from(getModuleTableName(tab.targetModule as string)) as any)
                            .select('created_at')
                            .eq(tab.foreignKey as string, recordId),
                        (tab as RelatedTabConfig).filters,
                    )
                        .order('created_at', { ascending: false })
                        .limit(1);
                    return data?.[0]?.created_at || null;
                }

                return null;
                } catch (error) {
                    if (isMissingColumnError(error)) {
                        console.warn('Sidebar unread query skipped because a configured column does not exist', {
                            tabKey: tab?.key,
                            relationType: (tab as RelatedTabConfig)?.relationType,
                            targetModule: (tab as RelatedTabConfig)?.targetModule,
                            error,
                        });
                        return null;
                    }
                    throw error;
                }
            };

            const entries = await Promise.all(
                allTabs.map(async (tab) => {
                    const latest = await computeLatest(tab);
                    const lastSeen = seenMap[tab.key] || null;
                    const isUnread = latest && (!lastSeen || new Date(latest) > new Date(lastSeen));
                    return [tab.key, Boolean(isUnread)] as [string, boolean];
                })
            );

            const nextMap: Record<string, boolean> = {};
            entries.forEach(([key, value]) => {
                nextMap[key] = value;
            });
            setUnreadMap(nextMap);
        } catch (err) {
            const isAbortLike =
                String((err as any)?.name || '').toLowerCase() === 'aborterror' ||
                String((err as any)?.message || '').toLowerCase().includes('signal is aborted');
            if (!isAbortLike) {
                console.error(err);
            }
        }
    };

    useEffect(() => {
        loadUnreadMap();
    }, [moduleConfig.id, recordId]);

    const dispatchAiContext = () => {
        if (typeof window === 'undefined') return;
        const availableProcesses = Array.isArray(processGuideBundle?.context.available_processes)
            ? processGuideBundle.context.available_processes
            : [];
        const processPayload = processGuideBundle && availableProcesses.length > 0
            ? {
                intent: 'process_guide' as const,
                processFieldKey: processGuideBundle.fieldKey,
                selectedProcessId: availableProcesses.length === 1 ? availableProcesses[0].id : null,
                selectedProcessGroupId: availableProcesses.length === 1 ? availableProcesses[0].id : null,
                availableProcesses: availableProcesses.map((process) => ({
                    id: process.id,
                    label: process.label,
                    templateId: process.templateId,
                    templateName: process.templateName,
                    stageCount: process.stageCount,
                })),
                processGuideContext: processGuideBundle.context,
            }
            : {};
        const detail: AssistantContext = {
            mode: 'record',
            moduleId: moduleConfig.id,
            recordId,
            route: `${window.location.pathname}${window.location.search || ''}`,
            ...processPayload,
        };
        window.dispatchEvent(new CustomEvent(AI_CONTEXT_EVENT, {
            detail,
        }));
    };

    useEffect(() => {
        if (activeKey === 'ai_assistant') {
            dispatchAiContext();
        }
    }, [activeKey, processGuideBundle]);

    const toggleTab = async (key: string) => {
        if (key === 'ai_assistant' && activeKey !== key) {
            dispatchAiContext();
            if (typeof window !== 'undefined') window.setTimeout(dispatchAiContext, 0);
        }
        setActiveKey(prev => prev === key ? null : key);

        try {
            const { data: authData } = await supabase.auth.getUser();
            const userId = authData?.user?.id;
            if (!userId) return;
            if (activeKey === key) return;

            await supabase
                .from('sidebar_unread')
                .upsert({
                    user_id: userId,
                    module_id: moduleConfig.id,
                    record_id: recordId,
                    tab_key: key,
                    last_seen_at: new Date().toISOString()
                }, { onConflict: 'user_id,module_id,record_id,tab_key' });

            setUnreadMap((prev) => ({ ...prev, [key]: false }));
        } catch (err) {
            console.error(err);
        }
    };

  return (
    <>
        <div
            className="hidden md:flex fixed top-24 bottom-6 bg-white dark:bg-[#1a1a1a] border-r border-gray-200 dark:border-gray-800 flex-col items-center py-5 gap-5 z-40 shadow-[4px_0_24px_rgba(0,0,0,0.02)] rounded-r-3xl transition-all"
            style={{ left: DESKTOP_TAB_RAIL_LEFT_OFFSET, width: DESKTOP_TAB_RAIL_WIDTH }}
        >
            {allTabs.map(tab => {
                const isActive = activeKey === tab.key;
                return (
                    <Tooltip key={tab.key} title={tab.label} placement="right" mouseEnterDelay={0.15} align={{ offset: [10, 0] }}>
                        <div 
                            onClick={() => toggleTab(tab.key)}
                            className={`
                                w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-300 relative
                                ${isActive 
                                    ? 'bg-leather-500 text-white shadow-lg shadow-leather-500/40 scale-110' 
                                    : 'text-leather-600 hover:bg-gray-100 dark:hover:bg-white/10'
                                }
                            `}
                        >
                            <Badge dot={unreadMap[tab.key]} offset={[-4, 4]} color="#ef4444">
                              <span className="text-xl flex items-center justify-center">{tab.icon}</span>
                            </Badge>
                            {isActive && <div className="absolute -right-1 w-1 h-5 bg-leather-500 rounded-l-full" />}
                        </div>
                    </Tooltip>
                );
            })}
        </div>

                {/* دکمه موبایل برای باز کردن سایدبار */}
                <button
                    type="button"
                    className="md:hidden fixed left-2 top-1/2 -translate-y-1/2 z-40 w-9 h-12 rounded-r-2xl bg-leather-500 text-white shadow-lg shadow-leather-500/40 flex items-center justify-center"
                    onClick={() => setIsMobileMenuOpen(true)}
                >
                    <RightOutlined className="text-sm" />
                </button>

                {/* منوی کشویی موبایل برای انتخاب تب‌ها */}
                <Drawer
                    title="سایدبار"
                    placement="left"
                    width={170}
                    open={isMobileMenuOpen}
                    onClose={() => setIsMobileMenuOpen(false)}
                    getContainer={typeof document === 'undefined' ? undefined : () => document.body}
                    maskClosable
                    styles={{ body: { padding: '12px' } }}
                    style={{ left: -16 }}
                    rootStyle={{ zIndex: 2100 }}
                    destroyOnHidden
                    afterOpenChange={(nextOpen) => {
                        if (!nextOpen) scheduleOverlayLockRelease();
                    }}
                >
                    <div className="flex flex-col gap-2">
                        {allTabs.map(tab => {
                            const isActive = activeKey === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    onClick={() => {
                                        toggleTab(tab.key);
                                        setIsMobileMenuOpen(false);
                                    }}
                                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${isActive ? 'border-leather-500 bg-leather-50 text-leather-700' : 'border-gray-100 hover:border-leather-300 hover:bg-leather-50/60'}`}
                                >
                                                                        <Badge dot={unreadMap[tab.key]} offset={[-2, 6]} color="#ef4444">
                                                                            <span className="text-lg flex items-center justify-center w-8 h-8 rounded-lg bg-white shadow-sm text-leather-600">{tab.icon}</span>
                                    </Badge>
                                    <span className="text-sm leading-tight">{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </Drawer>

        <Drawer
            title={allTabs.find(t => t.key === activeKey)?.label}
            placement="left"
            width={activeKey === 'ai_assistant' ? 'min(92vw, 440px)' : 360}
            onClose={() => setActiveKey(null)}
            open={!!activeKey}
            getContainer={typeof document === 'undefined' ? undefined : () => document.body}
            mask={false}
            styles={{ body: { padding: 0 }, header: { padding: activeKey === 'ai_assistant' ? '12px 16px' : '16px 24px' } }}
            className="shadow-2xl"
            style={typeof window !== 'undefined' && window.innerWidth >= 768 ? { left: DESKTOP_DRAWER_LEFT_OFFSET } : undefined}
            rootStyle={{ zIndex: 2000 }}
            destroyOnHidden
            afterOpenChange={(nextOpen) => {
                if (!nextOpen) scheduleOverlayLockRelease();
            }}
        >
            <div className={activeKey === 'ai_assistant' ? 'h-full bg-slate-100 dark:bg-[#101113]' : 'h-full p-4 bg-gray-50 dark:bg-[#121212]'}>
                {activeKey === 'ai_assistant' && (
                    <AssistantPanel active={activeKey === 'ai_assistant'} />
                )}
                {(activeKey === 'notes' || activeKey === 'tasks' || activeKey === 'changelogs') && (
                    <ActivityPanel
                        moduleId={moduleConfig.id}
                        recordId={recordId}
                        view={activeKey as any}
                        recordName={recordName}
                        mentionUsers={mentionUsers}
                        mentionRoles={mentionRoles}
                        moduleConfig={moduleConfig}
                    />
                )}
                {relatedTabs.map(tab => (
                    activeKey === tab.key && (
                        <RelatedRecordsPanel
                          key={tab.key}
                          tab={tab as RelatedTabConfig}
                          currentRecordId={recordId}
                          currentModuleId={moduleConfig.id}
                          currentRecord={currentRecord}
                        />
                    )
                ))}
            </div>
        </Drawer>
    </>
  );
};

export default RelatedSidebar;
