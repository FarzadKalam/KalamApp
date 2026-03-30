import React, { useEffect, useMemo, useState } from 'react';
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
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { SavedView, ViewConfig } from '../types';
import { FieldType } from '../types';
import WorkflowConditionsGroup from './workflows/WorkflowConditionsGroup';
import { fetchAssigneeDirectory, fetchDynamicOptionsMap } from '../utils/referenceData';
import { getPreferredRelationTargetField } from '../utils/relationTargetField';

interface ViewManagerProps {
  moduleId: string;
  currentView: SavedView | null;
  onViewChange: (view: SavedView | null, config: ViewConfig | null) => void;
  onRefresh: () => void;
}

const savedViewsCache = new Map<string, SavedView[]>();

const ViewManager: React.FC<ViewManagerProps> = ({ moduleId, currentView, onViewChange, onRefresh }) => {
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
  const defaultView = useMemo<SavedView>(
    () => ({
      id: 'default_all',
      module_id: moduleId,
      name: 'همه رکوردها',
      is_default: true,
      config: { columns: [], filters: [] },
    }),
    [moduleId]
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
        const { data } = await supabase
          .from('saved_views')
          .select('*')
          .eq('module_id', moduleId)
          .order('created_at', { ascending: false });
        if (!active) return;
        const nextViews = [defaultView, ...(data || [])];
        savedViewsCache.set(moduleId, nextViews);
        setViews(nextViews);
      } catch {
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
        const directory = await fetchAssigneeDirectory(supabase);
        if (!active) return;

        const dynamicCategories = Array.from(
          new Set(
            moduleConfig.fields
              .map((field: any) => field?.dynamicOptionsCategory)
              .filter(Boolean)
          )
        ) as string[];
        const dynOptions = await fetchDynamicOptionsMap(supabase, dynamicCategories);
        if (!active) return;
        setDynamicOptions(dynOptions);

        const relationFields = moduleConfig.fields.filter(
          (field) => field.type === FieldType.RELATION || field.type === FieldType.USER
        );
        const nextRelationOptions: Record<string, Array<{ label: string; value: string }>> = {
          profiles: (directory.users || []).map((item: any) => ({
            label: item.display_name || item.full_name || item.id,
            value: String(item.id),
          })),
          org_roles: (directory.roles || []).map((item: any) => ({
            label: item.title || item.id,
            value: String(item.id),
          })),
        };

        await Promise.all(
          relationFields.map(async (field: any) => {
            if (field.type === FieldType.USER) {
              nextRelationOptions[field.key] = nextRelationOptions.profiles || [];
              return;
            }

            const targetModule = String(field?.relationConfig?.targetModule || '').trim();
            if (!targetModule) return;
            const targetResource = MODULES[targetModule]?.table || targetModule;
            const targetField = getPreferredRelationTargetField(targetModule, field?.relationConfig?.targetField);
            const { data } = await supabase
              .from(targetResource)
              .select(`id, ${targetField}`)
              .order(targetField, { ascending: true })
              .limit(400);

            nextRelationOptions[field.key] = (data || []).map((item: any) => ({
              label: String(item?.[targetField] || item?.id || '').trim(),
              value: String(item?.id || '').trim(),
            })).filter((item: any) => item.value);
          })
        );

        if (!active) return;
        setRelationOptions(nextRelationOptions);
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
  }, [isModalOpen, moduleConfig]);

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
      filters: Array.isArray(rawConfig.filters) ? rawConfig.filters : [],
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
      (f) => f.field && f.operator && !(f.value === undefined || f.value === null)
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
      message.error(`خطا: ${err.message}`);
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
        <div className="flex items-center gap-1 px-2 shrink-0">
          <Tooltip title="ایجاد نمای جدید">
            <button
              type="button"
              onClick={handleOpenNewView}
              className="relative inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-transparent hover:bg-gray-100 dark:hover:bg-white/10"
            >
              <PlusOutlined className="relative z-10 text-[11px] !text-gray-500" />
              <span className="absolute inset-y-0 right-5 flex items-center leading-none text-gray-500">
                {"\u0644\u06cc\u0633\u062a \u062c\u062f\u06cc\u062f"}
              </span>
              <span className="leading-none">Ù„ÛŒØ³Øª Ø¬Ø¯ÛŒØ¯</span>
            </button>
          </Tooltip>
          <Tooltip title="بروزرسانی لیست">
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
              onClick={onRefresh}
              className="hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg text-gray-500"
            />
          </Tooltip>
        </div>

        <div className="w-[1px] h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

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
                className={`group px-3 py-1 rounded-lg text-xs cursor-pointer whitespace-nowrap transition-all flex items-center gap-2 select-none border ${
                  currentView?.id === view.id
                    ? 'bg-leather-600 text-white border-leather-600 shadow-md font-bold'
                    : 'bg-gray-50 dark:bg-white/5 border-transparent hover:bg-gray-100 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300'
                }`}
              >
                {view.name}
                {currentView?.id === view.id && (
                  <div className="flex items-center gap-1 mr-1">
                  <Tooltip title="ویرایش">
                    <span
                      className="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 flex items-center"
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
                      <span
                        className="p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 flex items-center"
                        onClick={(e) => e.stopPropagation()}
                      >
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
          <Input
            placeholder="نام نما"
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            prefix={<span className="text-red-500 text-lg leading-none ml-1">*</span>}
            size="large"
          />
          <Tabs
            type="card"
            items={[
              {
                key: 'columns',
                label: (
                  <span>
                    <CheckSquareOutlined /> ستون‌ها
                  </span>
                ),
                children: (
                  <div className="flex gap-4 h-[350px] border border-t-0 p-4 rounded-b-lg border-gray-200">
                    <div className="flex-1 flex flex-col">
                      <div className="text-xs text-gray-500 mb-2 font-bold bg-gray-50 p-2 rounded">موجود</div>
                      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        {moduleConfig.fields.map((field) => (
                          <div
                            key={field.key}
                            className="flex items-center gap-2 py-1.5 px-2 hover:bg-gray-50 rounded cursor-pointer"
                            onClick={() => toggleColumn(field.key)}
                          >
                            <Checkbox checked={config.columns?.includes(field.key)} />
                            <span className="text-sm">{field.labels.fa}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="w-[1px] bg-gray-200 my-2" />
                    <div className="flex-1 flex flex-col">
                      <div className="text-xs text-gray-500 mb-2 font-bold bg-gray-50 p-2 rounded flex justify-between">
                        <span>انتخاب شده</span>
                        <span className="badge border px-1 rounded">{config.columns?.length || 0}</span>
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
                              <List.Item className="bg-white mb-1.5 rounded-lg px-3 border border-gray-100 shadow-sm !py-2 flex justify-between group hover:border-leather-300">
                                <span className="text-sm font-medium">{field.labels.fa}</span>
                                <div className="flex gap-1 opacity-50 group-hover:opacity-100">
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
                  <div className="bg-white p-4 border border-t-0 rounded-b-lg min-h-[350px]">
                    <WorkflowConditionsGroup
                      value={(config.filters || []) as any}
                      onChange={(next) => handleFilterChange(next as any[])}
                      fields={moduleConfig.fields}
                      dynamicOptions={dynamicOptions}
                      relationOptions={relationOptions}
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
