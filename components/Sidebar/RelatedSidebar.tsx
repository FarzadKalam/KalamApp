import React, { useEffect, useState } from 'react';
import { Badge, Drawer, Tooltip } from 'antd';
import {
    FileTextOutlined, CheckSquareOutlined, HistoryOutlined,
    RightOutlined, SkinOutlined, AppstoreOutlined,
    BgColorsOutlined, ScissorOutlined, ToolOutlined, ExperimentOutlined,
    DropboxOutlined, UsergroupAddOutlined, CreditCardOutlined, NodeIndexOutlined,
    ShoppingOutlined, ShoppingCartOutlined, ProjectOutlined, PhoneOutlined, MessageOutlined
} from '@ant-design/icons';
import ActivityPanel from './ActivityPanel';
import RelatedRecordsPanel from './RelatedRecordsPanel';
import { ModuleDefinition, RelatedTabConfig, RelatedTabFilterConfig } from '../../types';
import { supabase } from '../../supabaseClient';
import { applyTaskSourceRecordFilter } from '../../utils/taskMeta';
import { MODULES } from '../../moduleRegistry';

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
    mentionUsers?: any[];
    mentionRoles?: any[];
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

const getModuleTableName = (moduleId?: string | null) => {
  const normalized = String(moduleId || '').trim();
  return MODULES[normalized]?.table || normalized;
};

const RelatedSidebar: React.FC<RelatedSidebarProps> = ({ moduleConfig, recordId, recordName = '', mentionUsers = [], mentionRoles = [] }) => {
  const DESKTOP_TAB_RAIL_LEFT_OFFSET = 12;
  const DESKTOP_TAB_RAIL_WIDTH = 56;
  const DESKTOP_TAB_RAIL_GAP = 12;
  const DESKTOP_DRAWER_LEFT_OFFSET = DESKTOP_TAB_RAIL_LEFT_OFFSET + DESKTOP_TAB_RAIL_WIDTH + DESKTOP_TAB_RAIL_GAP;
  const [activeKey, setActiveKey] = useState<string | null>(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [unreadMap, setUnreadMap] = useState<Record<string, boolean>>({});

  const fixedTabs = [
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
                    const { data } = await supabase
                        .from('purchase_invoices')
                        .select('created_at')
                        .eq('supplier_id', recordId)
                        .order('created_at', { ascending: false })
                        .limit(1);
                    return data?.[0]?.created_at || null;
                }

                if ((tab as RelatedTabConfig).relationType === 'supplier_products') {
                    const { data } = await supabase
                        .from('purchase_invoices')
                        .select('created_at')
                        .eq('supplier_id', recordId)
                        .order('created_at', { ascending: false })
                        .limit(1);
                    return data?.[0]?.created_at || null;
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

    const toggleTab = async (key: string) => {
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
            width={360}
            onClose={() => setActiveKey(null)}
            open={!!activeKey}
            getContainer={typeof document === 'undefined' ? undefined : () => document.body}
            mask={false}
            styles={{ body: { padding: 0 }, header: { padding: '16px 24px' } }}
            className="shadow-2xl"
            style={typeof window !== 'undefined' && window.innerWidth >= 768 ? { left: DESKTOP_DRAWER_LEFT_OFFSET } : undefined}
            rootStyle={{ zIndex: 2000 }}
        >
            <div className="h-full p-4 bg-gray-50 dark:bg-[#121212]">
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
                        <RelatedRecordsPanel key={tab.key} tab={tab as RelatedTabConfig} currentRecordId={recordId} currentModuleId={moduleConfig.id} />
                    )
                ))}
            </div>
        </Drawer>
    </>
  );
};

export default RelatedSidebar;
