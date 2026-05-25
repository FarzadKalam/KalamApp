import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Badge,
  Button,
  Checkbox,
  Input,
  List,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Skeleton,
  Tabs,
  Tag,
  Tooltip,
} from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckSquareOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  FilterOutlined,
  LockOutlined,
  PlusOutlined,
  SaveOutlined,
  SortAscendingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { FieldType, ModuleField, SavedView, ViewConfig } from '../types';
import WorkflowConditionsGroup from './workflows/WorkflowConditionsGroup';
import AdaptivePickerSurface from './AdaptivePickerSurface';
import { getDefaultWorkflowOperator, getWorkflowOperatorOptions, workflowOperatorNeedsValue } from '../utils/filterUtils';
import { loadWorkflowConditionEditorOptions } from '../utils/workflowConditionOptions';
import { getWorkflowConditionFields } from '../utils/workflowHelpers';
import { createWorkflowId, WORKFLOW_ASSIGNEE_FIELD_KEY } from '../utils/workflowTypes';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { resolveOverlayPopupContainer } from '../utils/popupContainer';
import { getModuleListVisibleFields, normalizeCashBankVisibleColumnKeys } from '../utils/moduleListOptions';
import { getCachedAuthUser } from '../utils/sessionCache';
import { fetchAssigneeDirectory } from '../utils/referenceData';

const CURRENT_USER_OPTION_VALUE = '__current_user__';
const CURRENT_ROLE_OPTION_VALUE = '__current_role__';
const SPECIAL_ASSIGNEE_OPTIONS = [
  { label: 'کاربر در حال مشاهده', value: CURRENT_USER_OPTION_VALUE },
  { label: 'نقش در حال مشاهده', value: CURRENT_ROLE_OPTION_VALUE },
];

type ViewManagerRenderMode = 'inline' | 'mobile-sheet';

interface ViewManagerProps {
  moduleId: string;
  currentView: SavedView | null;
  onViewChange: (view: SavedView | null, config: ViewConfig | null) => void;
  onRefresh: () => void;
  renderMode?: ViewManagerRenderMode;
}

const savedViewsCache = new Map<string, SavedView[]>();
const savedViewsPromiseCache = new Map<string, Promise<SavedView[]>>();
const SAVED_VIEW_SELECT_FIELDS = 'id,name,module_id,config,is_default,created_at';

const ViewManager: React.FC<ViewManagerProps> = ({
  moduleId,
  currentView,
  onViewChange,
  onRefresh: _onRefresh,
  renderMode = 'inline',
}) => {
  const { message } = App.useApp();
  const [views, setViews] = useState<SavedView[]>([]);
  const [loadingViews, setLoadingViews] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const [viewName, setViewName] = useState('');
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [editingDefaultView, setEditingDefaultView] = useState(false);
  const [config, setConfig] = useState<ViewConfig>({ columns: [], filters: [] });
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [relationOptions, setRelationOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [accessDirectory, setAccessDirectory] = useState<{ users: Array<{ id: string; display_name?: string; full_name?: string; role_id?: string | null }>; roles: Array<{ id: string; title?: string }> } | null>(null);
  const [loadingAccessDirectory, setLoadingAccessDirectory] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState('columns');
  const accessDirectoryLoadedRef = useRef(false);
  const popupContainer = useCallback((triggerNode?: HTMLElement | null) => resolveOverlayPopupContainer(triggerNode), []);

  const moduleConfig = MODULES[moduleId];
  const defaultViewColumnKeys = useMemo(
    () => getModuleListVisibleFields(moduleConfig).map((field) => String(field?.key || '').trim()).filter(Boolean),
    [moduleConfig]
  );
  const getViewColumnKeys = useCallback(
    (columns?: string[] | null) => {
      const sourceColumns = Array.isArray(columns) ? columns : [];
      if (moduleId === 'cash_bank_operations') {
        return normalizeCashBankVisibleColumnKeys(moduleConfig, sourceColumns);
      }
      const allowedFieldKeys = new Set((moduleConfig?.fields || []).map((field) => String(field?.key || '').trim()).filter(Boolean));
      const seen = new Set<string>();
      return sourceColumns
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .filter((key) => {
          if (!allowedFieldKeys.has(key) || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    },
    [moduleConfig, moduleId]
  );
  const viewColumnFields = useMemo(
    () => (moduleConfig?.fields || []).filter((field) => getViewColumnKeys([field.key]).includes(field.key)),
    [getViewColumnKeys, moduleConfig?.fields]
  );
  const selectedColumnKeys = useMemo(() => {
    const explicitColumns = getViewColumnKeys(config.columns);
    return explicitColumns.length > 0 ? explicitColumns : defaultViewColumnKeys;
  }, [config.columns, defaultViewColumnKeys, getViewColumnKeys]);
  const isEditingView = editingViewId !== null || editingDefaultView;
  const viewConditionFields = useMemo(() => getWorkflowConditionFields(moduleId), [moduleId]);

  const sortableFields = useMemo(() => {
    const fields = moduleConfig?.fields || [];
    const timeSystemKeys = ['created_at', 'updated_at'];
    const dateTypes = new Set<FieldType>([FieldType.DATE, FieldType.DATETIME]);
    const timeSystemFields = fields.filter((f) => timeSystemKeys.includes(f.key));
    const otherDateFields = fields.filter((f) => !timeSystemKeys.includes(f.key) && dateTypes.has(f.type as FieldType));
    const otherFields = fields.filter((f) => !timeSystemKeys.includes(f.key) && !dateTypes.has(f.type as FieldType));
    return [...timeSystemFields, ...otherDateFields, ...otherFields];
  }, [moduleConfig]);
  const supportedViewFilterOperators = useMemo(
    () =>
      new Set([
        'eq',
        'neq',
        'contains',
        'not_contains',
        'starts_with',
        'ends_with',
        'gt',
        'gte',
        'lt',
        'lte',
        'in',
        'not_in',
        'is_true',
        'is_false',
        'is_null',
        'not_null',
        'is_today',
        'is_yesterday',
        'is_tomorrow',
      ]),
    []
  );
  const getViewFilterOperatorOptions = useCallback(
    (field?: ModuleField | null) =>
      getWorkflowOperatorOptions(field).filter((option) => supportedViewFilterOperators.has(String(option.value || ''))),
    [supportedViewFilterOperators]
  );
  const getViewFilterDefaultOperator = useCallback(
    (field?: ModuleField | null) => getViewFilterOperatorOptions(field)[0]?.value || getDefaultWorkflowOperator(field),
    [getViewFilterOperatorOptions]
  );
  const normalizeViewFilters = useCallback(
    (rawFilters: any[] | null | undefined) =>
      (Array.isArray(rawFilters) ? rawFilters : [])
        .map((rawFilter) => {
          const fieldKey = String(rawFilter?.field || '').trim();
          const field =
            viewConditionFields.find((item) => String(item?.key || '').trim() === fieldKey) || null;
          const operator = String(rawFilter?.operator || '').trim() || getViewFilterDefaultOperator(field);
          if (!fieldKey || !operator) return null;
          const nextFilter: any = {
            id: String(rawFilter?.id || '').trim() || createWorkflowId(),
            field: fieldKey,
            operator,
          };
          if (Object.prototype.hasOwnProperty.call(rawFilter || {}, 'value')) {
            nextFilter.value = rawFilter?.value;
          }
          return nextFilter;
        })
        .filter(Boolean) as any[],
    [getViewFilterDefaultOperator, viewConditionFields]
  );
  const defaultView = useMemo<SavedView>(
    () => ({
      id: 'default_all',
      module_id: moduleId,
      name: moduleConfig?.titles?.fa ? `همه ${moduleConfig.titles.fa}` : 'همه رکوردها',
      is_default: true,
      config: { columns: [], filters: [] },
    }),
    [moduleConfig?.titles?.fa, moduleId]
  );
  const normalizeViewsList = useCallback(
    (items: SavedView[]) => {
      const normalizedItems = Array.isArray(items) ? items.filter(Boolean) : [];
      const persistedDefaultView = normalizedItems.find((view) => view.is_default) || null;
      const otherViews = normalizedItems.filter((view) => !view.is_default && view.id !== defaultView.id);
      return [persistedDefaultView || defaultView, ...otherViews];
    },
    [defaultView]
  );

  const filterViewsByAccess = useCallback(async (allViews: SavedView[]): Promise<SavedView[]> => {
    try {
      const authUser = await getCachedAuthUser(supabase);
      const currentUserId = authUser?.id || null;
      if (!currentUserId) return allViews;
      const directory = await fetchAssigneeDirectory(supabase);
      const me = (directory.users || []).find((u) => String(u?.id || '') === currentUserId);
      const myRoleId = me?.role_id ? String(me.role_id) : null;
      return allViews.filter((view) => {
        if (view.is_default || view.id.startsWith('default_')) return true;
        const access = (view.config as any)?.access;
        if (!access || access.type !== 'specific') return true;
        const userIds: string[] = Array.isArray(access.userIds) ? access.userIds : [];
        const roleIds: string[] = Array.isArray(access.roleIds) ? access.roleIds : [];
        if (userIds.includes(currentUserId)) return true;
        if (myRoleId && roleIds.includes(myRoleId)) return true;
        return false;
      });
    } catch {
      return allViews;
    }
  }, []);

  useEffect(() => {
    if (!moduleId) return;
    let active = true;

    const fetchViews = async () => {
      const cachedViews = savedViewsCache.get(moduleId);
      if (cachedViews?.length) {
        setViews(cachedViews);
      } else {
        setViews([defaultView]);
      }
      setLoadingViews(!cachedViews?.length);

      try {
        const pending =
          savedViewsPromiseCache.get(moduleId) ||
          (async () => {
            const { data } = await supabase
              .from('saved_views')
              .select(SAVED_VIEW_SELECT_FIELDS)
              .eq('module_id', moduleId)
              .order('created_at', { ascending: false });
            const normalized = normalizeViewsList((data || []) as SavedView[]);
            return filterViewsByAccess(normalized);
          })();

        if (!savedViewsPromiseCache.has(moduleId)) {
          savedViewsPromiseCache.set(moduleId, pending);
        }

        const nextViews = await pending;
        savedViewsPromiseCache.delete(moduleId);
        if (!active) return;
        savedViewsCache.set(moduleId, nextViews);
        setViews(nextViews);
      } catch {
        savedViewsPromiseCache.delete(moduleId);
        if (!active) return;
        setViews(savedViewsCache.get(moduleId) || [defaultView]);
      } finally {
        if (active) setLoadingViews(false);
      }
    };

    void fetchViews();
    return () => {
      active = false;
    };
  }, [defaultView, filterViewsByAccess, moduleId, normalizeViewsList]);

  useEffect(() => {
    if (!moduleConfig || !isModalOpen) return;
    let active = true;

    const loadFilterOptions = async () => {
      try {
        const optionState = await loadWorkflowConditionEditorOptions(moduleId, viewConditionFields);
        if (!active) return;
        const nextDynamic = { ...(optionState.dynamicOptions || {}) };
        // inject special current-user/role options at the top of assignee fields
        const assigneeKeys = viewConditionFields
          .filter((f) => f.key === WORKFLOW_ASSIGNEE_FIELD_KEY || String(f.key).includes(WORKFLOW_ASSIGNEE_FIELD_KEY))
          .map((f) => f.key);
        for (const key of Object.keys(nextDynamic)) {
          if (key === WORKFLOW_ASSIGNEE_FIELD_KEY || assigneeKeys.includes(key)) {
            nextDynamic[key] = [...SPECIAL_ASSIGNEE_OPTIONS, ...(nextDynamic[key] || [])];
          }
        }
        setDynamicOptions(nextDynamic);
        setRelationOptions(optionState.relationOptions || {});
      } catch (error) {
        if (!active) return;
        console.warn('Could not load view filter options', error);
        setDynamicOptions({});
        setRelationOptions({});
      }
    };

    void loadFilterOptions();
    return () => {
      active = false;
    };
  }, [isModalOpen, moduleId, moduleConfig, viewConditionFields]);

  useEffect(() => {
    if (!isModalOpen || activeModalTab !== 'access' || accessDirectoryLoadedRef.current) return;
    accessDirectoryLoadedRef.current = true;
    let active = true;
    setLoadingAccessDirectory(true);
    fetchAssigneeDirectory(supabase)
      .then((dir) => {
        if (!active) return;
        setAccessDirectory(dir as any);
      })
      .catch(() => { if (active) setAccessDirectory(null); })
      .finally(() => { if (active) setLoadingAccessDirectory(false); });
    return () => { active = false; };
  }, [isModalOpen, activeModalTab]);

  const handleOpenNewView = () => {
    setConfig({ columns: defaultViewColumnKeys, filters: [] });
    setViewName('');
    setEditingViewId(null);
    setEditingDefaultView(false);
    setActiveModalTab('columns');
    accessDirectoryLoadedRef.current = false;
    setIsModalOpen(true);
  };

  const handleOpenNewViewFromSheet = () => {
    setIsMobileSheetOpen(false);
    handleOpenNewView();
  };

  const handleEditView = (view: SavedView, e: React.MouseEvent) => {
    e.stopPropagation();
    const rawConfig = (view.config as any) || {};
    const safeConfig: ViewConfig = {
      columns:
        Array.isArray(rawConfig.columns) && rawConfig.columns.length > 0
          ? getViewColumnKeys(rawConfig.columns)
          : defaultViewColumnKeys,
      filters: normalizeViewFilters(rawConfig.filters),
      sort: rawConfig.sort,
      access: rawConfig.access,
    };
    setConfig(safeConfig);
    setViewName(view.name);
    setEditingViewId(view.id.startsWith('default_') ? null : view.id);
    setEditingDefaultView(view.is_default || view.id.startsWith('default_'));
    setActiveModalTab('columns');
    accessDirectoryLoadedRef.current = false;
    setIsModalOpen(true);
  };

  const handleCopyView = (view: SavedView, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const rawConfig = (view.config as any) || {};
    const safeConfig: ViewConfig = {
      columns:
        Array.isArray(rawConfig.columns) && rawConfig.columns.length > 0
          ? getViewColumnKeys(rawConfig.columns)
          : defaultViewColumnKeys,
      filters: normalizeViewFilters(rawConfig.filters).map((filter) => ({
        ...filter,
        id: createWorkflowId(),
      })),
      sort: rawConfig.sort,
      access: rawConfig.access,
    };
    setConfig(safeConfig);
    setViewName(`${view.name} (کپی)`);
    setEditingViewId(null);
    setEditingDefaultView(false);
    setActiveModalTab('columns');
    accessDirectoryLoadedRef.current = false;
    setIsModalOpen(true);
  };

  const handleEditViewFromSheet = (view: SavedView) => {
    const rawConfig = (view.config as any) || {};
    const safeConfig: ViewConfig = {
      columns:
        Array.isArray(rawConfig.columns) && rawConfig.columns.length > 0
          ? getViewColumnKeys(rawConfig.columns)
          : defaultViewColumnKeys,
      filters: normalizeViewFilters(rawConfig.filters),
      sort: rawConfig.sort,
      access: rawConfig.access,
    };
    setConfig(safeConfig);
    setViewName(view.name);
    setEditingViewId(view.id.startsWith('default_') ? null : view.id);
    setEditingDefaultView(view.is_default || view.id.startsWith('default_'));
    setIsMobileSheetOpen(false);
    setActiveModalTab('columns');
    accessDirectoryLoadedRef.current = false;
    setIsModalOpen(true);
  };

  const handleCopyViewFromSheet = (view: SavedView) => {
    setIsMobileSheetOpen(false);
    handleCopyView(view);
  };

  const handleSaveView = async () => {
    if (!viewName.trim()) {
      message.error('نام نما را وارد کنید');
      return;
    }

    const validFilters = (config.filters || []).filter(
      (f) => f.field && f.operator && (
        !workflowOperatorNeedsValue(f.operator) || !(f.value === undefined || f.value === null)
      )
    );

    const cleanConfig: ViewConfig = { ...config, columns: getViewColumnKeys(config.columns), filters: validFilters };
    const payload = {
      module_id: moduleId,
      name: viewName,
      config: cleanConfig,
      is_default: editingDefaultView,
    };

    try {
      if (editingDefaultView) {
        let resetQuery = supabase
          .from('saved_views')
          .update({ is_default: false })
          .eq('module_id', moduleId)
          .eq('is_default', true);
        if (editingViewId) {
          resetQuery = resetQuery.neq('id', editingViewId);
        }
        const { error: resetError } = await resetQuery;
        if (resetError) throw resetError;
      }

      let savedData: SavedView | null;
      if (editingViewId) {
        const { data, error } = await supabase
          .from('saved_views')
          .update(payload)
          .eq('id', editingViewId)
          .select()
          .single();
        if (error) throw error;
        savedData = data;
        if (savedData) {
          setViews((prev) => {
            const nextViews = normalizeViewsList(
              prev.map((view) => (view.id === editingViewId ? savedData! : view))
            );
            savedViewsCache.set(moduleId, nextViews);
            return nextViews;
          });
        }
        message.success('ذخیره شد');
      } else {
        const { data, error } = await supabase
          .from('saved_views')
          .insert([payload])
          .select()
          .single();
        if (error) throw error;
        savedData = data;
        if (savedData) {
          setViews((prev) => {
            const nextViews = normalizeViewsList([...prev, savedData!]);
            savedViewsCache.set(moduleId, nextViews);
            return nextViews;
          });
        }
        message.success(isEditingView ? 'ذخیره شد' : 'ایجاد شد');
      }

      setIsModalOpen(false);
      setEditingViewId(null);
      setEditingDefaultView(false);
      if (savedData) {
        onViewChange(savedData, savedData.config);
      }
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'ذخیره نما ناموفق بود.'));
    }
  };

  const moveColumn = (index: number, direction: 'up' | 'down') => {
    setConfig((prev) => {
      const newCols = [...(prev.columns || [])];
      if (direction === 'up' && index > 0) {
        [newCols[index], newCols[index - 1]] = [newCols[index - 1], newCols[index]];
      } else if (direction === 'down' && index < newCols.length - 1) {
        [newCols[index], newCols[index + 1]] = [newCols[index + 1], newCols[index]];
      }
      return { ...prev, columns: getViewColumnKeys(newCols) };
    });
  };

  const toggleColumn = (key: string) => {
    setConfig((prev) => {
      let newCols = [...(prev.columns || [])];
      if (newCols.includes(key)) newCols = newCols.filter((col) => col !== key);
      else newCols.push(key);
      return { ...prev, columns: getViewColumnKeys(newCols) };
    });
  };

  const handleFilterChange = (newFilters: any[]) => {
    setConfig((prev) => {
      const prevSerialized = JSON.stringify(prev?.filters || []);
      const nextSerialized = JSON.stringify(newFilters || []);
      if (prevSerialized === nextSerialized) {
        return prev;
      }
      return { ...prev, filters: newFilters };
    });
  };

  const handleDeleteView = async (view: SavedView) => {
    await supabase.from('saved_views').delete().eq('id', view.id);
    setViews((prev) => {
      const remainingViews = prev.filter((item) => item.id !== view.id);
      const nextViews = view.is_default
        ? normalizeViewsList(remainingViews)
        : remainingViews;
      savedViewsCache.set(moduleId, nextViews);
      return nextViews;
    });
    if (currentView?.id === view.id) onViewChange(null, null);
  };

  const handleViewSelect = (view: SavedView) => {
    const rawConfig = (view.config as any) || {};
    onViewChange(view, {
      ...rawConfig,
      columns: getViewColumnKeys(rawConfig.columns),
    });
    if (renderMode === 'mobile-sheet') {
      setIsMobileSheetOpen(false);
    }
  };

  const renderInlineStrip = () => (
    <div className="flex items-center gap-2 bg-white dark:bg-[#1f1f1f] p-1 rounded-xl border border-gray-200 dark:border-gray-800 h-10 shadow-sm animate-fadeIn overflow-hidden">
      <div className="flex items-center gap-1 overflow-x-auto flex-1 no-scrollbar px-1">
        {loadingViews ? (
          <>
            {Array.from({ length: 4 }).map((_, idx) => (
              <Skeleton.Button
                key={idx}
                active
                size="small"
                style={{ width: idx === 0 ? 96 : 80, height: 26, borderRadius: 8 }}
              />
            ))}
          </>
        ) : (
          views.map((view) => (
            <div
              key={view.id}
              onClick={() => handleViewSelect(view)}
              className={`group px-2.5 py-1 rounded-lg text-xs cursor-pointer whitespace-nowrap transition-all flex items-center gap-1.5 select-none border ${
                currentView?.id === view.id
                  ? 'bg-leather-600 text-white border-leather-600 shadow-md font-bold'
                  : 'bg-gray-50 dark:bg-white/5 border-transparent hover:bg-gray-100 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300'
              }`}
            >
              <span className="leading-none">{view.name}</span>
              {currentView?.id === view.id && (
                <div className="mr-0 flex shrink-0 items-center gap-0.5">
                  <Tooltip
                    title="ویرایش"
                    placement="bottom"
                    align={{ offset: [0, 8] }}
                    mouseEnterDelay={0.45}
                    getPopupContainer={() => document.body}
                    destroyOnHidden
                  >
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                      onClick={(e) => handleEditView(view, e)}
                    >
                      <EditOutlined className="text-[10px]" />
                    </span>
                  </Tooltip>

                  <Tooltip
                    title="کپی"
                    placement="bottom"
                    align={{ offset: [0, 8] }}
                    mouseEnterDelay={0.45}
                    getPopupContainer={() => document.body}
                    destroyOnHidden
                  >
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                      onClick={(e) => handleCopyView(view, e)}
                    >
                      <CopyOutlined className="text-[10px]" />
                    </span>
                  </Tooltip>

                  {!view.is_default && !view.id.startsWith('default_') && (
                    <Popconfirm
                      title="حذف نما؟"
                      onConfirm={async (e) => {
                        e?.stopPropagation();
                        await handleDeleteView(view);
                      }}
                      onCancel={(e) => e?.stopPropagation()}
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10" onClick={(e) => e.stopPropagation()}>
                        <DeleteOutlined className="text-[10px]" />
                      </span>
                    </Popconfirm>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="w-[1px] h-5 bg-gray-200 dark:bg-gray-700 mx-1 shrink-0" />

      <div className="flex items-center gap-1 px-2 shrink-0">
        <Tooltip title="ایجاد نمای جدید">
          <button
            type="button"
            onClick={handleOpenNewView}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-gray-600 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
          >
            <PlusOutlined className="text-[11px]" />
            <span className="hidden md:inline leading-none">لیست جدید</span>
          </button>
        </Tooltip>
      </div>
    </div>
  );

  const renderMobileSheet = () => (
    <>
      <Button
        type="text"
        icon={<FilterOutlined />}
        className="module-list-toolbar__compact-icon !h-9 !w-9 !min-w-9 !rounded-full !border-0 !bg-transparent !p-0 !shadow-none !text-gray-500 hover:!bg-black/5 hover:!text-leather-600 dark:!text-gray-300 dark:hover:!bg-white/10"
        aria-label="لیست‌های نمایش"
        title="لیست‌های نمایش"
        onClick={() => setIsMobileSheetOpen(true)}
      />
      <AdaptivePickerSurface
        open={isMobileSheetOpen}
        title="لیست‌های نمایش"
        subtitle="نمای ذخیره‌شده را انتخاب یا مدیریت کنید"
        zIndex={1060}
        onClose={() => setIsMobileSheetOpen(false)}
      >
        <div className="space-y-3">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            className="!w-full !rounded-2xl bg-leather-600 hover:!bg-leather-500"
            onClick={handleOpenNewViewFromSheet}
          >
            ایجاد نمای جدید
          </Button>

          <div className="space-y-2">
            {loadingViews ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <Skeleton.Button
                  key={idx}
                  active
                  block
                  style={{ height: 52, borderRadius: 16 }}
                />
              ))
            ) : (
              views.map((view) => {
                const isActive = currentView?.id === view.id;
                const canDelete = !view.is_default && !view.id.startsWith('default_');
                return (
                  <div
                    key={view.id}
                    className={`rounded-2xl border px-3 py-3 transition ${
                      isActive
                        ? 'border-leather-500 bg-[rgba(var(--brand-50-rgb),0.72)] dark:border-leather-500 dark:bg-white/10'
                        : 'border-gray-200 bg-white dark:border-white/10 dark:bg-[#171717]'
                    }`}
                  >
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 text-right"
                      onClick={() => handleViewSelect(view)}
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-gray-800 dark:text-gray-100">{view.name}</span>
                      {isActive ? (
                        <span className="shrink-0 rounded-full bg-leather-600 px-2 py-0.5 text-[10px] font-bold text-white">فعال</span>
                      ) : null}
                    </button>
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        className="!rounded-xl"
                        onClick={() => handleEditViewFromSheet(view)}
                      >
                        ویرایش
                      </Button>
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        className="!rounded-xl"
                        onClick={() => handleCopyViewFromSheet(view)}
                      >
                        کپی
                      </Button>
                      {canDelete ? (
                        <Popconfirm
                          title="حذف نما؟"
                          onConfirm={async () => {
                            await handleDeleteView(view);
                          }}
                        >
                          <Button size="small" danger icon={<DeleteOutlined />} className="!rounded-xl">
                            حذف
                          </Button>
                        </Popconfirm>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </AdaptivePickerSurface>
    </>
  );

  return (
    <>
      {renderMode === 'mobile-sheet' ? renderMobileSheet() : renderInlineStrip()}

      {isModalOpen && (
      <Modal
        title={
          <div className="flex items-center gap-2">
            {isEditingView ? <EditOutlined /> : <PlusOutlined />}
            {isEditingView ? 'ویرایش نما' : 'ساخت نمای جدید'}
          </div>
        }
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        destroyOnHidden
        width={700}
        zIndex={1001}
        footer={[
          <Button key="back" onClick={() => setIsModalOpen(false)}>
            انصراف
          </Button>,
          <Button
            key="submit"
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSaveView}
            className="bg-leather-600 hover:!bg-leather-500"
          >
            {isEditingView ? 'ذخیره تغییرات' : 'ایجاد نما'}
          </Button>,
        ]}
      >
        <div className="flex flex-col gap-4 py-4">
          {!isEditingView && viewName.includes('(کپی)') && (
            <Alert
              type="info"
              showIcon
                message="شما در حال ساخت کپی از یک نمای موجود هستید."
              className="mb-2"
            />
          )}
          <div className="rounded-2xl border border-[rgba(var(--brand-200-rgb),0.65)] bg-[rgba(var(--brand-50-rgb),0.38)] p-3 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5">
            <Input
              placeholder="نام نما"
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              prefix={<span className="text-red-500 text-lg leading-none ml-1">*</span>}
              size="large"
            />
          </div>
          <Tabs
            className="view-manager-modal-tabs"
            type="card"
            activeKey={activeModalTab}
            onChange={setActiveModalTab}
            items={[
              {
                key: 'columns',
                label: (
                  <span className="inline-flex items-center gap-2">
                    <CheckSquareOutlined /> ستون‌ها
                  </span>
                ),
                children: (
                  <div className="flex h-[350px] gap-4 rounded-2xl border border-[rgba(var(--brand-200-rgb),0.65)] bg-[rgba(var(--brand-50-rgb),0.38)] p-4 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5">
                    <div className="flex flex-1 flex-col rounded-2xl border border-[rgba(var(--brand-200-rgb),0.55)] bg-white/80 p-3 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.72)]">
                      <div className="mb-2 rounded-xl border border-[rgba(var(--brand-200-rgb),0.5)] bg-[rgba(var(--brand-50-rgb),0.72)] p-2 text-xs font-bold text-[rgba(var(--brand-700-rgb),1)] dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5 dark:text-[rgba(var(--brand-200-rgb),1)]">موجود</div>
                      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        {viewColumnFields.map((field) => (
                          <div
                            key={field.key}
                            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-[rgba(var(--brand-50-rgb),0.78)] dark:hover:bg-white/5 cursor-pointer"
                            onClick={() => toggleColumn(field.key)}
                          >
                            <Checkbox checked={config.columns?.includes(field.key)} />
                            <span className="text-sm">{field.labels.fa}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="my-2 w-[1px] bg-[rgba(var(--brand-200-rgb),0.55)] dark:bg-[rgba(var(--brand-300-rgb),0.18)]" />
                    <div className="flex flex-1 flex-col rounded-2xl border border-[rgba(var(--brand-200-rgb),0.55)] bg-white/80 p-3 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.72)]">
                      <div className="mb-2 flex justify-between rounded-xl border border-[rgba(var(--brand-200-rgb),0.5)] bg-[rgba(var(--brand-50-rgb),0.72)] p-2 text-xs font-bold text-[rgba(var(--brand-700-rgb),1)] dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5 dark:text-[rgba(var(--brand-200-rgb),1)]">
                        <span>انتخاب شده</span>
                        <span className="rounded-md border border-[rgba(var(--brand-300-rgb),0.65)] bg-white/80 px-1.5 py-0.5 text-[rgba(var(--brand-700-rgb),1)] dark:bg-white/10 dark:text-[rgba(var(--brand-100-rgb),1)]">{selectedColumnKeys.length || 0}</span>
                      </div>
                      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        <List
                          size="small"
                          dataSource={selectedColumnKeys}
                          renderItem={(item) => {
                            const colKey = item as string;
                            const field = moduleConfig.fields.find((f) => f.key === colKey);
                            if (!field) return null;
                            const index = selectedColumnKeys.indexOf(colKey);
                            return (
                              <List.Item className="!mb-1.5 !flex !justify-between !rounded-xl !border !border-[rgba(var(--brand-200-rgb),0.55)] !bg-[rgba(var(--brand-50-rgb),0.42)] !px-3 !py-2 shadow-sm transition hover:!border-[rgba(var(--brand-400-rgb),0.85)] dark:!border-[rgba(var(--brand-300-rgb),0.18)] dark:!bg-white/5">
                                <span className="text-sm font-medium">{field.labels.fa}</span>
                                <div className="flex gap-1">
                                  <Button
                                    size="small"
                                    type="text"
                                    icon={<ArrowUpOutlined className="text-[10px]" />}
                                    disabled={index === 0}
                                    onClick={() => moveColumn(index, 'up')}
                                  />
                                  <Button
                                    size="small"
                                    type="text"
                                    icon={<ArrowDownOutlined className="text-[10px]" />}
                                    disabled={index === selectedColumnKeys.length - 1}
                                    onClick={() => moveColumn(index, 'down')}
                                  />
                                </div>
                              </List.Item>
                            );
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                key: 'filters',
                label: (
                  <div className="flex items-center gap-2">
                    <FilterOutlined />
                    فیلترها
                    {config.filters && config.filters.length > 0 && (
                      <Badge count={config.filters.length} size="small" color="rgb(var(--brand-500-rgb))" />
                    )}
                  </div>
                ),
                children: (
                  <div className="min-h-[350px] rounded-2xl border border-[rgba(var(--brand-200-rgb),0.65)] bg-[rgba(var(--brand-50-rgb),0.38)] p-4 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5">
                    <div className="mb-3 text-sm font-medium text-[rgba(var(--brand-700-rgb),1)] dark:text-[rgba(var(--brand-200-rgb),1)]">
                      شرط‌های این نما
                    </div>
                    <WorkflowConditionsGroup
                      value={(config.filters || []) as any}
                      onChange={(next) => handleFilterChange(next as any[])}
                      fields={viewConditionFields}
                      dynamicOptions={dynamicOptions}
                      relationOptions={relationOptions}
                      getOperatorOptions={getViewFilterOperatorOptions}
                      getDefaultOperator={getViewFilterDefaultOperator}
                      overlayZIndexBase={1400}
                      popupContainer={popupContainer}
                    />
                  </div>
                ),
              },
              {
                key: 'sort',
                label: (
                  <span className="inline-flex items-center gap-2">
                    <SortAscendingOutlined />
                    ترتیب نمایش
                    {config.sort && config.sort.length > 0 && (
                      <Badge count={config.sort.length} size="small" color="rgb(var(--brand-500-rgb))" />
                    )}
                  </span>
                ),
                children: (
                  <div className="min-h-[350px] rounded-2xl border border-[rgba(var(--brand-200-rgb),0.65)] bg-[rgba(var(--brand-50-rgb),0.38)] p-4 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5">
                    <div className="mb-4 text-sm font-medium text-[rgba(var(--brand-700-rgb),1)] dark:text-[rgba(var(--brand-200-rgb),1)]">
                      معیار ترتیب نمایش پیش‌فرض
                    </div>
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center gap-3">
                        <span className="w-20 shrink-0 text-sm text-gray-600 dark:text-gray-400">فیلد</span>
                        <Select
                          className="flex-1"
                          allowClear
                          placeholder="انتخاب فیلد..."
                          value={config.sort?.[0]?.field || null}
                          onChange={(val) =>
                            setConfig((prev) => ({
                              ...prev,
                              sort: val ? [{ field: val, order: prev.sort?.[0]?.order || 'desc' }] : [],
                            }))
                          }
                          getPopupContainer={popupContainer}
                          options={sortableFields.map((f, idx) => {
                            const isTimeSystem = f.key === 'created_at' || f.key === 'updated_at';
                            const isDateType = f.type === FieldType.DATE || f.type === FieldType.DATETIME;
                            const prevField = sortableFields[idx - 1];
                            const isFirstDateGroup =
                              !isTimeSystem &&
                              isDateType &&
                              (prevField?.key === 'created_at' || prevField?.key === 'updated_at' || (prevField?.type !== FieldType.DATE && prevField?.type !== FieldType.DATETIME));
                            const isFirstOtherGroup =
                              !isTimeSystem &&
                              !isDateType &&
                              prevField &&
                              (prevField.type === FieldType.DATE || prevField.type === FieldType.DATETIME);
                            return {
                              label: (
                                <span className="flex items-center gap-1.5">
                                  {isTimeSystem && <span className="text-[10px] text-amber-500">⏱</span>}
                                  {!isTimeSystem && isDateType && <span className="text-[10px] text-blue-400">📅</span>}
                                  {f.labels.fa}
                                  {isFirstDateGroup && <span className="mr-1 text-[10px] text-gray-400">— فیلدهای تاریخ</span>}
                                  {isFirstOtherGroup && <span className="mr-1 text-[10px] text-gray-400">— سایر فیلدها</span>}
                                </span>
                              ),
                              value: f.key,
                            };
                          })}
                        />
                      </div>
                      {config.sort?.[0]?.field && (
                        <div className="flex items-center gap-3">
                          <span className="w-20 shrink-0 text-sm text-gray-600 dark:text-gray-400">جهت</span>
                          <Radio.Group
                            value={config.sort[0].order}
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                sort: prev.sort?.map((s, i) => (i === 0 ? { ...s, order: e.target.value } : s)),
                              }))
                            }
                          >
                            <Radio.Button value="desc">جدیدترین اول ↓</Radio.Button>
                            <Radio.Button value="asc">قدیمی‌ترین اول ↑</Radio.Button>
                          </Radio.Group>
                        </div>
                      )}
                      {(!config.sort || config.sort.length === 0) && (
                        <div className="mt-2 rounded-xl border border-dashed border-[rgba(var(--brand-300-rgb),0.5)] p-4 text-center text-sm text-gray-400 dark:border-[rgba(var(--brand-300-rgb),0.2)] dark:text-gray-500">
                          هیچ معیار ترتیبی انتخاب نشده — از ترتیب پیش‌فرض سیستم استفاده می‌شود
                        </div>
                      )}
                    </div>
                  </div>
                ),
              },
              {
                key: 'access',
                label: (
                  <span className="inline-flex items-center gap-2">
                    <LockOutlined />
                    دسترسی مشاهده
                    {config.access?.type === 'specific' && (
                      <Badge
                        count={(config.access.userIds?.length || 0) + (config.access.roleIds?.length || 0)}
                        size="small"
                        color="rgb(var(--brand-500-rgb))"
                      />
                    )}
                  </span>
                ),
                children: (
                  <div className="min-h-[350px] rounded-2xl border border-[rgba(var(--brand-200-rgb),0.65)] bg-[rgba(var(--brand-50-rgb),0.38)] p-4 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5">
                    <div className="mb-4 text-sm font-medium text-[rgba(var(--brand-700-rgb),1)] dark:text-[rgba(var(--brand-200-rgb),1)]">
                      چه کسانی می‌توانند این نما را ببینند؟
                    </div>
                    <div className="flex flex-col gap-4">
                      <Radio.Group
                        value={config.access?.type || 'all'}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            access: e.target.value === 'all'
                              ? { type: 'all' }
                              : { type: 'specific', userIds: prev.access?.userIds || [], roleIds: prev.access?.roleIds || [] },
                          }))
                        }
                      >
                        <div className="flex flex-col gap-3">
                          <Radio value="all">
                            <span className="mr-1 font-medium">همه کاربران</span>
                            <span className="mr-2 text-xs text-gray-400">(پیش‌فرض)</span>
                          </Radio>
                          <Radio value="specific">
                            <span className="mr-1 font-medium">کاربران / نقش‌های انتخابی</span>
                          </Radio>
                        </div>
                      </Radio.Group>

                      {config.access?.type === 'specific' && (
                        <div className="flex flex-col gap-3 rounded-xl border border-[rgba(var(--brand-200-rgb),0.5)] bg-white/60 p-3 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5">
                          <div>
                            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                              <TeamOutlined /> کاربران
                            </div>
                            {loadingAccessDirectory ? (
                              <Skeleton.Input active block style={{ height: 36, borderRadius: 8 }} />
                            ) : (
                              <Select
                                mode="multiple"
                                className="w-full"
                                placeholder="انتخاب کاربران..."
                                value={config.access?.userIds || []}
                                onChange={(val) =>
                                  setConfig((prev) => ({
                                    ...prev,
                                    access: { ...prev.access, type: 'specific', userIds: val, roleIds: prev.access?.roleIds || [] },
                                  }))
                                }
                                getPopupContainer={popupContainer}
                                tagRender={({ label, value, closable, onClose }) => (
                                  <Tag closable={closable} onClose={onClose} className="!rounded-lg !text-xs" key={value}>
                                    {label}
                                  </Tag>
                                )}
                                options={(accessDirectory?.users || []).map((u) => ({
                                  label: String(u?.display_name || u?.full_name || u?.id || ''),
                                  value: String(u?.id || ''),
                                }))}
                                filterOption={(input, opt) =>
                                  String(opt?.label || '').includes(input)
                                }
                              />
                            )}
                          </div>
                          <div>
                            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                              <LockOutlined /> نقش‌ها
                            </div>
                            {loadingAccessDirectory ? (
                              <Skeleton.Input active block style={{ height: 36, borderRadius: 8 }} />
                            ) : (
                              <Select
                                mode="multiple"
                                className="w-full"
                                placeholder="انتخاب نقش‌ها..."
                                value={config.access?.roleIds || []}
                                onChange={(val) =>
                                  setConfig((prev) => ({
                                    ...prev,
                                    access: { ...prev.access, type: 'specific', userIds: prev.access?.userIds || [], roleIds: val },
                                  }))
                                }
                                getPopupContainer={popupContainer}
                                tagRender={({ label, value, closable, onClose }) => (
                                  <Tag closable={closable} onClose={onClose} className="!rounded-lg !text-xs" key={value}>
                                    {label}
                                  </Tag>
                                )}
                                options={(accessDirectory?.roles || []).map((r) => ({
                                  label: String(r?.title || r?.id || ''),
                                  value: String(r?.id || ''),
                                }))}
                                filterOption={(input, opt) =>
                                  String(opt?.label || '').includes(input)
                                }
                              />
                            )}
                          </div>
                          {(config.access.userIds?.length || 0) + (config.access.roleIds?.length || 0) === 0 && (
                            <div className="text-xs text-amber-500">
                              ⚠️ هیچ کاربر یا نقشی انتخاب نشده — این نما برای کسی نمایش داده نمی‌شود
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </div>
      </Modal>
      )}
    </>
  );
};

export default ViewManager;
