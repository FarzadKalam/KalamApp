import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  Skeleton,
  Tabs,
  Tooltip,
} from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckSquareOutlined,
  DeleteOutlined,
  EditOutlined,
  FilterOutlined,
  PlusOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { ModuleField, SavedView, ViewConfig } from '../types';
import WorkflowConditionsGroup from './workflows/WorkflowConditionsGroup';
import { getDefaultWorkflowOperator, getWorkflowOperatorOptions, workflowOperatorNeedsValue } from '../utils/filterUtils';
import { loadWorkflowConditionEditorOptions } from '../utils/workflowConditionOptions';
import { getWorkflowConditionFields } from '../utils/workflowHelpers';
import { createWorkflowId } from '../utils/workflowTypes';
import { toFaErrorMessage } from '../utils/errorMessageFa';

interface ViewManagerProps {
  moduleId: string;
  currentView: SavedView | null;
  onViewChange: (view: SavedView | null, config: ViewConfig | null) => void;
  onRefresh: () => void;
}

const savedViewsCache = new Map<string, SavedView[]>();
const savedViewsPromiseCache = new Map<string, Promise<SavedView[]>>();

const ViewManager: React.FC<ViewManagerProps> = ({ moduleId, currentView, onViewChange, onRefresh: _onRefresh }) => {
  const { message } = App.useApp();
  const [views, setViews] = useState<SavedView[]>([]);
  const [loadingViews, setLoadingViews] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewName, setViewName] = useState('');
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [config, setConfig] = useState<ViewConfig>({ columns: [], filters: [] });
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [relationOptions, setRelationOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});

  const moduleConfig = MODULES[moduleId];
  const viewConditionFields = useMemo(() => getWorkflowConditionFields(moduleId), [moduleId]);
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
              .select('*')
              .eq('module_id', moduleId)
              .order('created_at', { ascending: false });
            return [defaultView, ...(data || [])] as SavedView[];
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
  }, [defaultView, moduleId]);

  useEffect(() => {
    if (!moduleConfig || !isModalOpen) return;
    let active = true;

    const loadFilterOptions = async () => {
      try {
        const optionState = await loadWorkflowConditionEditorOptions(moduleId, viewConditionFields);
        if (!active) return;
        setDynamicOptions(optionState.dynamicOptions || {});
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

  const handleOpenNewView = () => {
    const allCols = moduleConfig.fields.map((f) => f.key);
    setConfig({ columns: allCols, filters: [] });
    setViewName('');
    setEditingViewId(null);
    setIsModalOpen(true);
  };

  const handleEditView = (view: SavedView, e: React.MouseEvent) => {
    e.stopPropagation();
    const rawConfig = (view.config as any) || {};
    const safeConfig: ViewConfig = {
      columns:
        Array.isArray(rawConfig.columns) && rawConfig.columns.length > 0
          ? rawConfig.columns
          : moduleConfig.fields.map((f) => f.key),
      filters: normalizeViewFilters(rawConfig.filters),
      sort: rawConfig.sort,
    };
    setConfig(safeConfig);

    if (view.is_default || view.id.startsWith('default_')) {
      setViewName(`${view.name} (کپی)`);
      setEditingViewId(null);
    } else {
      setViewName(view.name);
      setEditingViewId(view.id);
    }
    setIsModalOpen(true);
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

    const cleanConfig: ViewConfig = { ...config, filters: validFilters };
    const payload = {
      module_id: moduleId,
      name: viewName,
      config: cleanConfig,
      is_default: false,
    };

    try {
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
            const nextViews = prev.map((view) => (view.id === editingViewId ? savedData! : view));
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
            const nextViews = [...prev, savedData!];
            savedViewsCache.set(moduleId, nextViews);
            return nextViews;
          });
        }
        message.success('ایجاد شد');
      }

      setIsModalOpen(false);
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
      return { ...prev, columns: newCols };
    });
  };

  const toggleColumn = (key: string) => {
    setConfig((prev) => {
      let newCols = [...(prev.columns || [])];
      if (newCols.includes(key)) newCols = newCols.filter((col) => col !== key);
      else newCols.push(key);
      return { ...prev, columns: newCols };
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

  return (
    <>
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
                onClick={() => onViewChange(view, (view.config as any))}
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

                  {!view.is_default && !view.id.startsWith('default_') && (
                    <Popconfirm
                      title="حذف نما؟"
                      onConfirm={async (e) => {
                        e?.stopPropagation();
                        await supabase.from('saved_views').delete().eq('id', view.id);
                        setViews((prev) => {
                          const nextViews = prev.filter((item) => item.id !== view.id);
                          savedViewsCache.set(moduleId, nextViews);
                          return nextViews;
                        });
                        if (currentView?.id === view.id) onViewChange(null, null);
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

      {isModalOpen && (
      <Modal
        title={
          <div className="flex items-center gap-2">
            {editingViewId ? <EditOutlined /> : <PlusOutlined />}
            {editingViewId ? 'ویرایش نما' : 'ساخت نمای جدید'}
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
            {editingViewId ? 'ذخیره تغییرات' : 'ایجاد نما'}
          </Button>,
        ]}
      >
        <div className="flex flex-col gap-4 py-4">
          {!editingViewId && viewName.includes('(کپی)') && (
            <Alert
              type="info"
              showIcon
              message="شما در حال کپی کردن یک نمای پایه هستید."
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
                        {moduleConfig.fields.map((field) => (
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
                        <span className="rounded-md border border-[rgba(var(--brand-300-rgb),0.65)] bg-white/80 px-1.5 py-0.5 text-[rgba(var(--brand-700-rgb),1)] dark:bg-white/10 dark:text-[rgba(var(--brand-100-rgb),1)]">{config.columns?.length || 0}</span>
                      </div>
                      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        <List
                          size="small"
                          dataSource={config.columns || []}
                          renderItem={(item) => {
                            const colKey = item as string;
                            const field = moduleConfig.fields.find((f) => f.key === colKey);
                            if (!field) return null;
                            const index = config.columns.indexOf(colKey);
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
                                    disabled={index === (config.columns?.length || 0) - 1}
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
                    />
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
