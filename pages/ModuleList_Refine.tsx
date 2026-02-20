import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useTable } from "@refinedev/antd";
import { CrudFilters, useDeleteMany, useUpdate } from "@refinedev/core";
import { useNavigate, useParams } from "react-router-dom";
import { MODULES } from "../moduleRegistry";
import SmartTableRenderer from "../components/SmartTableRenderer";
import { BlockType, FieldType, SavedView, ViewMode } from "../types";
import { App, Badge, Button, Empty, Skeleton } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import ViewManager from "../components/ViewManager";
import SmartForm from "../components/SmartForm";
import { supabase } from "../supabaseClient";
import Toolbar from "../components/moduleList/Toolbar";
import BulkActionsBar from "../components/moduleList/BulkActionsBar";
import ViewWrapper from "../components/moduleList/ViewWrapper";
import GridView from "../components/moduleList/GridView";
import RenderCardItem from "../components/moduleList/RenderCardItem";
import { canAccessAssignedRecord, WORKFLOWS_PERMISSION_KEY } from "../utils/permissions";
import BulkProductsCreateModal from "../components/products/BulkProductsCreateModal";
import WorkflowsManager from "../components/workflows/WorkflowsManager";
import { buildCopyPayload, copyProductionOrderRelations, detectCopyNameField } from "../utils/recordCopy";

const ModuleListContentSkeleton: React.FC<{ viewMode: ViewMode }> = ({ viewMode }) => {
  if (viewMode === ViewMode.GRID) {
    return (
      <div className="h-full overflow-y-auto p-1 custom-scrollbar">
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-gray-200 dark:border-gray-700 p-3"
            >
              <Skeleton active avatar={{ shape: "square", size: 44 }} paragraph={{ rows: 2 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (viewMode === ViewMode.KANBAN) {
    return (
      <div className="flex gap-4 h-full overflow-x-auto pb-4 px-2">
        {Array.from({ length: 3 }).map((_, colIdx) => (
          <div
            key={colIdx}
            className="min-w-[280px] w-[280px] flex flex-col bg-gray-100/50 dark:bg-white/5 rounded-2xl p-2 border border-gray-200 dark:border-gray-800 h-full"
          >
            <div className="p-2 mb-2">
              <Skeleton.Input active size="small" style={{ width: 120 }} />
            </div>
            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2 custom-scrollbar pb-2">
              {Array.from({ length: 3 }).map((__, cardIdx) => (
                <div
                  key={cardIdx}
                  className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-gray-200 dark:border-gray-700 p-3"
                >
                  <Skeleton active title={{ width: "65%" }} paragraph={{ rows: 2 }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 h-full overflow-hidden p-4">
      <Skeleton active title={{ width: "20%" }} paragraph={{ rows: 10 }} />
    </div>
  );
};

export const ModuleListRefine: React.FC<{ moduleIdOverride?: string }> = ({ moduleIdOverride }) => {
  const { moduleId } = useParams();
  const resolvedModuleId = moduleIdOverride || moduleId;
  const navigate = useNavigate();
  const { modal, message: msg } = App.useApp();
  
  const moduleConfig = resolvedModuleId ? MODULES[resolvedModuleId] : null;

  // ✅ Use default view mode from module config, fallback to LIST
  const [viewMode, setViewMode] = useState<ViewMode>(moduleConfig?.defaultViewMode || ViewMode.LIST);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [currentView, setCurrentView] = useState<SavedView | null>(null);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [editRecordId, setEditRecordId] = useState<string | null>(null);
  const [isBulkEditMode, setIsBulkEditMode] = useState(false);
  const [kanbanGroupBy, setKanbanGroupBy] = useState<string>("");
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);  // ✅ ستون‌های انتخاب‌شده
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, any[]>>({});  // ✅ اضافه شد
  const [relationOptions, setRelationOptions] = useState<Record<string, any[]>>({});  // ✅ اضافه شد
  const [tagsMap, setTagsMap] = useState<Record<string, any[]>>({});  // ✅ Map of record id to tags
  const [gridPageSize, setGridPageSize] = useState<number>(20); // ✅ Grid pagination
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allRoles, setAllRoles] = useState<any[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fieldPermissions, setFieldPermissions] = useState<Record<string, boolean>>({});
  const [modulePermissions, setModulePermissions] = useState<{ view?: boolean; edit?: boolean; delete?: boolean }>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRoleId, setCurrentUserRoleId] = useState<string | null>(null);
  const [isBulkProductsModalOpen, setIsBulkProductsModalOpen] = useState(false);
  const [isWorkflowsModalOpen, setIsWorkflowsModalOpen] = useState(false);
  const [canOpenWorkflows, setCanOpenWorkflows] = useState(true);

  const { tableProps, tableQueryResult, setFilters, filters } = useTable({
    resource: resolvedModuleId,
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
    pagination: { pageSize: 10 }, 
    queryOptions: { enabled: !!resolvedModuleId },
    syncWithLocation: false,
  });

  const { mutate: deleteMany } = useDeleteMany();
  const { mutate: updateRecord } = useUpdate();

  const loading = tableQueryResult.isLoading;
  const isRefreshing = tableQueryResult.isFetching && !loading;
  const allData = tableQueryResult.data?.data || [];
  const selectedRows = useMemo(
    () => allData.filter((row: any) => selectedRowKeys.includes(row.id)),
    [allData, selectedRowKeys]
  );
  const allSelectedPendingInProductionOrders = useMemo(() => {
    if (resolvedModuleId !== 'production_orders') return false;
    if (!selectedRows.length) return false;
    return selectedRows.every((row: any) => String(row?.status || '') === 'pending');
  }, [resolvedModuleId, selectedRows]);
  const [readyModuleId, setReadyModuleId] = useState<string | null>(null);
  const showContentSkeleton = readyModuleId !== resolvedModuleId;

  useEffect(() => {
    setReadyModuleId(null);
  }, [resolvedModuleId]);

  useEffect(() => {
    if (!resolvedModuleId) return;
    if (!tableQueryResult.isLoading || tableQueryResult.isError) {
      setReadyModuleId(resolvedModuleId);
    }
  }, [resolvedModuleId, tableQueryResult.isLoading, tableQueryResult.isError]);

  useEffect(() => {
    if (isFullscreen) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }
    return () => document.body.classList.remove("overflow-hidden");
  }, [isFullscreen]);

  useEffect(() => {
    setViewMode(moduleConfig?.defaultViewMode || ViewMode.LIST);
    setCurrentView(null);
    setSelectedRowKeys([]);
    setVisibleColumns([]);
    setGridPageSize(20);
    setKanbanGroupBy("");
    setSearchTerm("");
    setEditRecordId(null);
    setIsBulkEditOpen(false);
    setIsBulkEditMode(false);
    setIsBulkProductsModalOpen(false);
    setIsWorkflowsModalOpen(false);
    setCanOpenWorkflows(true);
  }, [resolvedModuleId, moduleConfig?.defaultViewMode]);

  const fetchPermissions = useCallback(async () => {
    if (!resolvedModuleId) return;
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('role_id')
        .eq('id', user.id)
        .single();

      if (!profile?.role_id) return;

      const { data: role } = await supabase
        .from('org_roles')
        .select('permissions')
        .eq('id', profile.role_id)
        .single();

      const modulePerms = role?.permissions?.[resolvedModuleId] || {};
      const workflowPerms = role?.permissions?.[WORKFLOWS_PERMISSION_KEY] || {};
      setModulePermissions({
        view: modulePerms.view,
        edit: modulePerms.edit,
        delete: modulePerms.delete
      });
      setFieldPermissions(modulePerms.fields || {});
      setCanOpenWorkflows(
        workflowPerms.view !== false && (workflowPerms?.fields?.module_list_button !== false)
      );
    } catch (err) {
      console.warn('Could not fetch permissions:', err);
      setCanOpenWorkflows(true);
    }
  }, [resolvedModuleId]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user;
        if (!user) return;
        setCurrentUserId(user.id);
        const { data: profile } = await supabase
          .from('profiles')
          .select('role_id')
          .eq('id', user.id)
          .single();
        setCurrentUserRoleId(profile?.role_id || null);
      } catch (err) {
        console.warn('Could not fetch current user role:', err);
      }
    };
    fetchCurrentUser();
  }, []);

  const canViewField = useCallback(
    (fieldKey: string) => {
      if (Object.prototype.hasOwnProperty.call(fieldPermissions, fieldKey)) {
        return fieldPermissions[fieldKey] !== false;
      }
      return true;
    },
    [fieldPermissions]
  );

  const canViewModule = modulePermissions.view !== false;
  const canEditModule = modulePermissions.edit !== false;
  const canDeleteModule = modulePermissions.delete !== false;

  // ✅ Define field keys FIRST (before any useMemo/useEffect that uses them)
  const imageField = moduleConfig?.fields.find(f => f.type === FieldType.IMAGE)?.key;
  const tagsField = moduleConfig?.fields.find(f => f.type === FieldType.TAGS)?.key;
  const statusField = moduleConfig?.fields.find(f => f.type === FieldType.STATUS)?.key;
  const categoryField = resolvedModuleId === 'tasks'
    ? 'related_to_module'
    : moduleConfig?.fields.find(f => f.key === 'category' || f.key === 'product_category')?.key;

  // ✅ Merge tags into allData
  const accessibleData = useMemo(() => {
    if (canViewModule) return allData;
    return allData.filter((record: any) => canAccessAssignedRecord(record, currentUserId, currentUserRoleId));
  }, [allData, canViewModule, currentUserId, currentUserRoleId]);

  const enrichedData = useMemo(() => {
    if (!tagsField) return accessibleData;
    const tf: string = tagsField;
    return accessibleData.map(record => ({
      ...record,
      [tf]: tagsMap[record.id as string] || []
    }));
  }, [accessibleData, tagsMap, tagsField]);

  // ✅ Grid view - paginated data
  const gridData = useMemo(() => {
    return enrichedData.slice(0, gridPageSize);
  }, [enrichedData, gridPageSize]);

  // ✅ اضافه شد: Fetch dynamic و relation options
  useEffect(() => {
    if (!moduleConfig) return;

    let isActive = true;

    const fetchOptions = async () => {
      try {
        const [{ data: users }, { data: roles }] = await Promise.all([
          supabase.from("profiles").select("id, full_name, avatar_url"),
          supabase.from("org_roles").select("id, title"),
        ]);

        if (!isActive) return;
        if (users) setAllUsers(users);
        if (roles) setAllRoles(roles);

        const dynFields: any[] = [...moduleConfig.fields.filter((f) => (f as any).dynamicOptionsCategory)];
        moduleConfig.blocks?.forEach((b) => {
          if ((b.type === BlockType.TABLE || b.type === BlockType.GRID_TABLE) && b.tableColumns) {
            b.tableColumns.forEach((c) => {
              if (
                (c.type === FieldType.SELECT || c.type === FieldType.MULTI_SELECT) &&
                (c as any).dynamicOptionsCategory
              ) {
                dynFields.push(c);
              }
            });
          }
        });

        const dynCategories: string[] = Array.from(
          new Set(
            dynFields
              .map((f) => (f as any).dynamicOptionsCategory as string | undefined)
              .filter(Boolean)
          )
        ) as string[];

        const dynResults = await Promise.all(
          dynCategories.map((cat) =>
            supabase
              .from("dynamic_options")
              .select("label, value")
              .eq("category", cat!)
              .eq("is_active", true)
          )
        );

        if (!isActive) return;
        const dynOpts: Record<string, any[]> = {};
        dynCategories.forEach((cat, idx) => {
          const data = dynResults[idx]?.data || [];
          dynOpts[cat] = data.filter((i: any) => i.value !== null);
        });
        try {
          const { data: formulas } = await supabase
            .from('calculation_formulas')
            .select('id, name');
          if (formulas) {
            dynOpts['calculation_formulas'] = formulas.map((f: any) => ({ label: f.name, value: f.id }));
          }
        } catch (err) {
          console.warn('Could not load calculation formulas', err);
        }
        setDynamicOptions(dynOpts);

        const relFields: any[] = [...moduleConfig.fields.filter((f) => f.type === FieldType.RELATION || f.type === FieldType.USER)];
        moduleConfig.blocks?.forEach((b) => {
          if (b.type === BlockType.TABLE && b.tableColumns) {
            b.tableColumns.forEach((c) => {
              if (c.type === FieldType.RELATION || c.type === FieldType.USER) relFields.push({ ...c, key: `${b.id}_${c.key}` });
            });
          }
        });

        const relOpts: Record<string, any[]> = {};

        const { data: profileData } = await supabase.from("profiles").select("id, full_name");
        if (!isActive) return;
        const profileOptions = profileData?.map((p) => ({ label: p.full_name || p.id, value: p.id })) || [];
        relOpts["profiles"] = profileOptions;
        relOpts["assignee_id"] = profileOptions;

        const relResults = await Promise.all(
          relFields.map(async (field) => {
            if (field.type === FieldType.USER) {
              return { key: field.key, options: profileOptions };
            }
            if (field.relationConfig) {
              const { targetModule, targetField, filter } = field.relationConfig;
              const selectFields = ["id", "system_code"].concat(targetField ? [targetField] : []);
              if (targetModule === "shelves" && !selectFields.includes("shelf_number")) {
                selectFields.push("shelf_number");
              }
              let query = supabase.from(targetModule).select(selectFields.join(", "));
              if (filter) Object.keys(filter).forEach((k) => (query = query.eq(k, filter[k])));
              const { data: relData } = await query.limit(200);
              const options = (relData || []).map((i: any) => {
                const labelValue = (targetField ? (i as any)[targetField] : null) || i.shelf_number || i.system_code || i.id;
                const sys = (i as any).system_code ? ` (${(i as any).system_code})` : "";
                return { label: `${labelValue}${sys}`, value: i.id };
              });
              return { key: field.key, options };
            }
            return null;
          })
        );

        if (!isActive) return;
        relResults.forEach((res) => {
          if (res) {
            relOpts[res.key] = res.options;
            if (res.key.includes("_")) relOpts[res.key.split("_").pop()!] = res.options;
          }
        });
        setRelationOptions(relOpts);
      } catch (error) {
        console.error("Error fetching options", error);
      }
    };

    fetchOptions();

    return () => {
      isActive = false;
    };
  }, [moduleConfig]);

  // ✅ Fetch tags for all records
  useEffect(() => {
    if (!tagsField || !resolvedModuleId || accessibleData.length === 0) return;

    const fetchTags = async () => {
      try {
        // Get all tags for records in this module
        const recordIds = accessibleData.map(r => r.id);
        const { data: tagsData } = await supabase
          .from('record_tags')
          .select('record_id, tags(id, title, color)')
          .in('record_id', recordIds);

        // Map tags to records
        if (tagsData) {
          const newTagsMap: Record<string, any[]> = {};
          tagsData.forEach((item: any) => {
            if (!newTagsMap[item.record_id]) {
              newTagsMap[item.record_id] = [];
            }
            if (item.tags) {
              newTagsMap[item.record_id].push(item.tags);
            }
          });
          setTagsMap(newTagsMap);
        }
      } catch (err) {
        console.error('Error fetching tags:', err);
      }
    };

    fetchTags();
  }, [resolvedModuleId, tagsField, accessibleData.length]);

  const searchTargetField = useMemo(() => {
    if (!moduleConfig) return null;
    const keyField = moduleConfig.fields.find(f => f.isKey);
    if (keyField) return keyField.key;
    const priorityKeys = ['name', 'title', 'business_name', 'full_name', 'subject', 'description'];
    const priorityField = moduleConfig.fields.find(f => priorityKeys.includes(f.key));
    if (priorityField) return priorityField.key;
    const textField = moduleConfig.fields.find(f => f.type === FieldType.TEXT);
    if (textField) return textField.key;
    return null;
  }, [moduleConfig]);

  const availableGroupFields = useMemo(() => {
    return moduleConfig?.fields.filter(f => 
        (f.type === FieldType.STATUS || f.type === FieldType.SELECT) && f.options && f.options.length > 0
    ) || [];
  }, [moduleConfig]);

  useEffect(() => {
    if (viewMode !== ViewMode.KANBAN) return;
    if (kanbanGroupBy) return;
    if (availableGroupFields.length === 0) return;
    const defaultField = availableGroupFields.find((f) => f.type === FieldType.STATUS) || availableGroupFields[0];
    setKanbanGroupBy(defaultField.key);
  }, [viewMode, kanbanGroupBy, availableGroupFields]);

  useEffect(() => {
    if (!searchTargetField) return;
    const handle = setTimeout(() => handleSearch(searchTerm), 300);
    return () => clearTimeout(handle);
  }, [searchTerm, searchTargetField]);

  const handleViewChange = (view: SavedView | null, config: any) => {
    setCurrentView(view);

    if (config && config.filters && Array.isArray(config.filters) && config.filters.length > 0) {
        const refineFilters: CrudFilters = config.filters.map((f: any) => ({
            field: f.field,
            operator: f.operator || 'eq',
            value: f.value
        }));
        setFilters(refineFilters, 'replace');
    } else {
        setFilters([], 'replace');
    }

    // ✅ اعمال ستون‌های انتخاب‌شده
    if (config && config.columns && Array.isArray(config.columns) && config.columns.length > 0) {
        setVisibleColumns(config.columns);
    } else {
        setVisibleColumns([]);
    }
  };

  // ✅ FIX: سرچ فقط فیلتر سرچ را اضافه/حذف می‌کند و به فیلترهای View دست نمی‌زند
  const handleSearch = (val: string) => {
      if (!searchTargetField) return;

      const nonSearchFilters = filters.filter(f => {
        const lf = f as any;
        return !(lf?.field === searchTargetField && lf?.operator === 'contains');
      });

      if (!val) {
        setFilters(nonSearchFilters, 'replace');
        return;
      }

      setFilters([
        ...nonSearchFilters,
        {
          field: searchTargetField,
          operator: 'contains',
          value: val
        }
      ], 'replace');
  };

  const handleBulkDelete = () => {
    if (selectedRowKeys.length === 0) return;
    modal.confirm({
      title: `حذف ${selectedRowKeys.length} رکورد`,
      content: 'آیا مطمئن هستید؟',
      okType: 'danger',
      okText: 'بله، حذف کن',
      cancelText: 'خیر',
      onOk: () => {
        deleteMany(
          { resource: resolvedModuleId!, ids: selectedRowKeys as string[] },
          { onSuccess: () => { setSelectedRowKeys([]); msg.success('حذف شد'); tableQueryResult.refetch(); } }
        );
      }
    });
  };

  const handleBulkEditOpen = () => {
      if (selectedRowKeys.length === 0) return;
      if (selectedRowKeys.length === 1) {
        setEditRecordId(String(selectedRowKeys[0]));
        setIsBulkEditMode(false);
      } else {
        setEditRecordId(null);
        setIsBulkEditMode(true);
      }
      setIsBulkEditOpen(true);
  };

  const handleBulkCopy = () => {
    if (!selectedRowKeys.length || !resolvedModuleId || !moduleConfig) return;
    modal.confirm({
      title: `کپی ${selectedRowKeys.length} رکورد`,
      content: 'از رکوردهای انتخاب‌شده نسخه کپی ساخته شود؟',
      okText: 'بله، کپی کن',
      cancelText: 'انصراف',
      onOk: async () => {
        const tableName = moduleConfig.table || resolvedModuleId;
        const ids = selectedRowKeys.map((id) => String(id));
        const hide = msg.loading('در حال کپی رکوردها...', 0);
        try {
          const { data: sourceRows, error: sourceError } = await supabase
            .from(tableName)
            .select('*')
            .in('id', ids);
          if (sourceError) throw sourceError;
          const records = sourceRows || [];
          if (!records.length) {
            msg.warning('رکوردی برای کپی یافت نشد.');
            return;
          }
          const nameField = detectCopyNameField(moduleConfig);
          if (resolvedModuleId === 'production_orders') {
            let copiedCount = 0;
            for (let idx = 0; idx < records.length; idx += 1) {
              const record = records[idx];
              const payload = buildCopyPayload(record, { nameField, copyIndex: idx });
              const { data: inserted, error: insertError } = await supabase
                .from(tableName)
                .insert(payload)
                .select('id')
                .single();
              if (insertError) throw insertError;
              if (inserted?.id) {
                await copyProductionOrderRelations(supabase, String(record.id), String(inserted.id));
              }
              copiedCount += 1;
            }
            msg.success(`${copiedCount} رکورد کپی شد.`);
          } else {
            const payloads = records.map((record: any, idx: number) =>
              buildCopyPayload(record, { nameField, copyIndex: idx })
            );
            const { error: insertError } = await supabase.from(tableName).insert(payloads);
            if (insertError) throw insertError;
            msg.success(`${payloads.length} رکورد کپی شد.`);
          }
          setSelectedRowKeys([]);
          tableQueryResult.refetch();
        } catch (err: any) {
          msg.error(`کپی رکوردها ناموفق بود: ${err?.message || err}`);
        } finally {
          hide();
        }
      }
    });
  };

  const handleCreateGroupOrderFromSelection = () => {
    if (resolvedModuleId !== 'production_orders') return;
    if (!selectedRowKeys.length) return;
    if (!allSelectedPendingInProductionOrders) {
      msg.error('برای ایجاد سفارش گروهی، همه سفارش‌های انتخاب شده باید در وضعیت «در انتظار» باشند.');
      return;
    }
    const selectedIds = selectedRowKeys.map((item) => String(item));
    navigate('/production_group_orders/create', {
      state: { selectedOrderIds: selectedIds },
    });
  };

  const handleBulkSave = (values: any) => {
      const changes: any = {};
      Object.keys(values).forEach(key => {
          if (values[key] !== undefined && values[key] !== null && values[key] !== '') {
              changes[key] = values[key];
          }
      });
      if (Object.keys(changes).length === 0) return;

      let completed = 0;
      selectedRowKeys.forEach(id => {
          updateRecord(
            { resource: resolvedModuleId!, id: id as string, values: changes },
            { onSuccess: () => {
                  completed++;
                  if (completed === selectedRowKeys.length) {
                      msg.success('بروزرسانی شد');
                      setIsBulkEditOpen(false);
                      setSelectedRowKeys([]);
                      tableQueryResult.refetch();
                  }
              }
            }
          );
      });
  };

  const handleExport = () => {
      const recordsToExport = allData.filter((d: any) => selectedRowKeys.includes(d.id));
      if(recordsToExport.length === 0) return;
      const headers = moduleConfig?.fields.map(f => f.key).join(',') || '';
      const rows = recordsToExport.map((row: any) => {
          return moduleConfig?.fields.map(f => {
              const val = row[f.key];
              return val ? `"${val}"` : '';
          }).join(',');
      }).join('\n');
      const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + headers + '\n' + rows;
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `${resolvedModuleId}_export_${new Date().getTime()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  if (!resolvedModuleId || !moduleConfig) return null;
  if (!canViewModule && !loading && accessibleData.length === 0) {
    return (
      <div className="p-6">
        <Empty description="دسترسی مشاهده برای این ماژول ندارید" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1800px] mx-auto animate-fadeIn pb-20 h-[calc(105vh-64px)] flex flex-col">
        <div className="flex flex-col gap-2 mb-4 shrink-0">
        {/* ردیف ۱: عنوان + شمارنده + دکمه افزودن */}
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-2xl font-black text-gray-800 dark:text-white m-0 flex items-center gap-2 min-w-0">
                <span className="w-2 h-8 bg-leather-500 rounded-full inline-block shrink-0"></span>
                <span className="truncate">{moduleConfig.titles.fa}</span>
            </h1>
            <Badge
                count={tableQueryResult.data?.total || 0}
                overflowCount={999}
                style={{ backgroundColor: '#f0f0f0', color: '#666', boxShadow: 'none' }}
            />
            </div>

            {selectedRowKeys.length === 0 && (
              <div className="flex items-center gap-2 shrink-0">
                {canOpenWorkflows && (
                  <Button
                    onClick={() => setIsWorkflowsModalOpen(true)}
                    className="rounded-xl"
                  >
                    گردش کارها
                  </Button>
                )}
                {canEditModule && resolvedModuleId === 'products' && (
                  <Button
                    icon={<PlusOutlined />}
                    onClick={() => setIsBulkProductsModalOpen(true)}
                    className="rounded-xl"
                  >
                    افزودن گروهی
                  </Button>
                )}
                {resolvedModuleId === 'production_orders' && (
                  <Button
                    onClick={() => navigate('/production_group_orders')}
                    className="rounded-xl"
                  >
                    سفارشات گروهی
                  </Button>
                )}
                {canEditModule && (
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => navigate(`/${resolvedModuleId}/create`)}
                    className="rounded-xl bg-leather-600 hover:!bg-leather-500 shadow-lg shadow-leather-500/30 shrink-0"
                  >افزودن تکی</Button>
                )}
              </div>
            )}
        </div>

        <Toolbar
          viewMode={viewMode}
          setViewMode={setViewMode}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onRefresh={() => tableQueryResult.refetch()}
          isFullscreen={isFullscreen}
          toggleFullscreen={() => setIsFullscreen((prev) => !prev)}
          kanbanEnabled={availableGroupFields.length > 0}
          kanbanGroupBy={kanbanGroupBy}
          kanbanGroupOptions={availableGroupFields.map((f) => ({ label: f.labels.fa, value: f.key }))}
          onKanbanGroupChange={setKanbanGroupBy}
        />

        <BulkActionsBar
          selectedCount={selectedRowKeys.length}
          onClear={() => setSelectedRowKeys([])}
          onEdit={selectedRowKeys.length && canEditModule ? handleBulkEditOpen : undefined}
          onCopy={selectedRowKeys.length && canEditModule ? handleBulkCopy : undefined}
          onDelete={selectedRowKeys.length && canDeleteModule ? handleBulkDelete : undefined}
          onExport={selectedRowKeys.length ? handleExport : undefined}
          primaryActionLabel={
            selectedRowKeys.length > 0 && resolvedModuleId === 'production_orders'
              ? 'ایجاد سفارش گروهی جدید'
              : undefined
          }
          onPrimaryAction={
            selectedRowKeys.length > 0 && resolvedModuleId === 'production_orders'
              ? handleCreateGroupOrderFromSelection
              : undefined
          }
          primaryActionDisabled={
            resolvedModuleId === 'production_orders' && selectedRowKeys.length > 0
              ? !allSelectedPendingInProductionOrders
              : false
          }
          primaryActionTooltip={
            resolvedModuleId === 'production_orders' &&
            selectedRowKeys.length > 0 &&
            !allSelectedPendingInProductionOrders
              ? 'فقط سفارش‌های تولید با وضعیت «در انتظار» قابل تبدیل به سفارش گروهی هستند.'
              : undefined
          }
        />
        </div>

         <div className="mb-4">
          <ViewManager 
            moduleId={resolvedModuleId} 
            currentView={currentView} 
            onViewChange={handleViewChange} 
            onRefresh={() => tableQueryResult.refetch()}
          />
         </div>

         <ViewWrapper isFullscreen={isFullscreen}>
         <div className="flex-1 overflow-hidden relative rounded-[2rem]">
           {showContentSkeleton ? (
              <ModuleListContentSkeleton viewMode={viewMode} />
           ) : accessibleData.length === 0 ? (
             <div className="flex h-full items-center justify-center bg-white dark:bg-[#1a1a1a] rounded-[2rem] border border-dashed border-gray-300">
                <Empty description="هیچ داده‌ای یافت نشد" />
             </div>
           ) : (
             <>
               {viewMode === ViewMode.LIST && (
                <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 h-full overflow-hidden">
                  <SmartTableRenderer 
                    moduleConfig={moduleConfig}
                    data={enrichedData} 
                    loading={isRefreshing}
                    visibleColumns={visibleColumns.length > 0 ? visibleColumns : undefined}
                    onChange={tableProps.onChange as any}
                    pagination={tableProps.pagination}
                    rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
                    onRow={(record: any) => ({ 
                      onClick: () => navigate(`/${resolvedModuleId}/${record.id}`), 
                      style: { cursor: 'pointer' } 
                    })}
                    dynamicOptions={dynamicOptions}
                    relationOptions={relationOptions}
                    allUsers={allUsers}
                    allRoles={allRoles}
                    canViewField={canViewField}
                  />
                </div>
               )}
               {viewMode === ViewMode.GRID && (
                <div className="h-full overflow-y-auto p-1 custom-scrollbar flex flex-col">
                            <GridView
                              data={gridData}
                              moduleId={resolvedModuleId}
                              moduleConfig={moduleConfig}
                              imageField={imageField}
                              tagsField={tagsField}
                              statusField={statusField}
                              categoryField={categoryField}
                              selectedRowKeys={selectedRowKeys}
                              setSelectedRowKeys={setSelectedRowKeys}
                              navigate={navigate}
                              canViewField={canViewField}
                              allUsers={allUsers}
                              allRoles={allRoles}
                              relationOptions={relationOptions}
                            />
                            
                  {/* Load More Button */}
                  {gridPageSize < enrichedData.length && (
                    <div className="flex justify-center items-center py-6 border-t border-gray-200 dark:border-gray-800">
                    <Button 
                      size="large"
                      onClick={() => setGridPageSize(prev => prev + 20)}
                      className="px-8 h-12 font-bold"
                    >
                      بارگیری بیشتر ({gridPageSize} از {enrichedData.length})
                    </Button>
                    </div>
                  )}
                </div>
               )}
               {viewMode === ViewMode.KANBAN && (
                <div className="flex gap-4 h-full overflow-x-auto pb-4 px-2">
                  {moduleConfig.fields.find(f => f.key === kanbanGroupBy)?.options?.map((col: any) => {
                    const columnItems = enrichedData.filter((d: any) => d[kanbanGroupBy] === col.value);
                    return (
                      <div key={col.value} className="min-w-[280px] w-[280px] flex flex-col bg-gray-100/50 dark:bg-white/5 rounded-2xl p-2 border border-gray-200 dark:border-gray-800 h-full">
                        <div className="flex items-center justify-between p-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color || '#ccc' }}></span>
                            <span className="font-bold text-gray-700 dark:text-gray-300 text-sm">{col.label}</span>
                          </div>
                          <span className="bg-white dark:bg-white/10 px-2 py-0.5 rounded-full text-xs text-gray-500">
                            {columnItems.length}
                          </span>
                        </div>
                        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-0 custom-scrollbar pb-2">
                          {columnItems.map((item: any) => (
                            <RenderCardItem 
                              key={item.id} 
                              item={item} 
                              moduleId={resolvedModuleId}
                              moduleConfig={moduleConfig}
                              imageField={imageField}
                              tagsField={tagsField}
                              statusField={statusField}
                              categoryField={categoryField}
                              selectedRowKeys={selectedRowKeys}
                              setSelectedRowKeys={setSelectedRowKeys}
                              navigate={navigate}
                              minimal={true}
                              canViewField={canViewField}
                              allUsers={allUsers}
                              allRoles={allRoles}
                              relationOptions={relationOptions}
                            />
                          ))}
                        </div>
                        <Button 
                          type="dashed" 
                          block 
                          icon={<PlusOutlined />} 
                          className="mt-2 text-xs text-gray-500 hover:text-leather-600 hover:border-leather-400"
                          onClick={() => {
                            navigate(`/${resolvedModuleId}/create`, { 
                              state: { initialValues: { [kanbanGroupBy]: col.value } } 
                            });
                          }}
                        >
                          افزودن به {col.label}
                        </Button>
                      </div>
                    );
                  })}
                </div>
               )}
             </>
           )}
         </div>
         </ViewWrapper>
       {isBulkEditOpen && (
           <SmartForm 
               module={moduleConfig}
               visible={isBulkEditOpen}
               recordId={editRecordId || undefined}
               onCancel={() => {
                 setIsBulkEditOpen(false);
                 setEditRecordId(null);
                 setIsBulkEditMode(false);
                 tableQueryResult.refetch();
               }}
               onSave={isBulkEditMode ? handleBulkSave : undefined}
                title={isBulkEditMode ? `ویرایش گروهی ${selectedRowKeys.length} مورد` : `ویرایش مورد انتخابی`}
               isBulkEdit={isBulkEditMode}
           />
       )}
      {resolvedModuleId === 'products' && (
        <BulkProductsCreateModal
          open={isBulkProductsModalOpen}
          onClose={() => setIsBulkProductsModalOpen(false)}
          onCreated={() => {
            setIsBulkProductsModalOpen(false);
            tableQueryResult.refetch();
          }}
        />
      )}
      <WorkflowsManager
        inline={false}
        open={isWorkflowsModalOpen}
        onClose={() => setIsWorkflowsModalOpen(false)}
        defaultModuleId={resolvedModuleId}
        context="module_list"
      />
    </div>
  );
};

export default ModuleListRefine;
