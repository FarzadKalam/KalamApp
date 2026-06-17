import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  Checkbox,
  Button,
  Input,
  Empty,
  Divider,
  Switch,
  Collapse,
  Radio,
  Select,
  Badge,
} from 'antd';
import {
  SaveOutlined,
  LockOutlined,
  TeamOutlined,
  FilterOutlined,
  CaretDownOutlined,
} from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import {
  buildDefaultPermissions,
  clearCurrentUserRoleContextCache,
  collectModulePermissionFields,
  mergePermissionsWithDefaults,
  SETTINGS_PERMISSION_KEY,
  DASHBOARD_PERMISSION_KEY,
  SETTINGS_TAB_PERMISSIONS,
  PRINT_SIGNATURE_PERMISSION_FIELDS,
  DASHBOARD_WIDGET_PERMISSIONS,
  WORKFLOWS_PERMISSION_KEY,
  WORKFLOWS_PERMISSION_FIELDS,
  GOALS_PERMISSION_KEY,
  GOALS_PERMISSION_FIELDS,
  FILES_PERMISSION_KEY,
  FILES_PERMISSION_FIELDS,
  ACCOUNTING_PERMISSION_KEY,
  ACCOUNTING_PERMISSION_FIELDS,
  REPORTS_PERMISSION_KEY,
  REPORTS_PERMISSION_FIELDS,
  VOIP_PERMISSION_KEY,
  VOIP_PERMISSION_FIELDS,
  COMMUNICATIONS_PERMISSION_KEY,
  COMMUNICATIONS_PERMISSION_FIELDS,
  CUSTOMER_CLUB_PERMISSION_KEY,
  CUSTOMER_CLUB_PERMISSION_FIELDS,
  STORIES_PERMISSION_KEY,
  STORIES_PERMISSION_FIELDS,
  SAAS_ADMIN_PERMISSION_KEY,
  SAAS_ADMIN_PERMISSION_FIELDS,
  isSaasAdminModuleId,
  MOBILE_FOOTER_PERMISSION_KEY,
  DASHBOARD_QUICK_ACCESS_DEFAULT_MODULES,
  PREFERRED_ROLE_MODULE_SLOT_KEYS,
  hasViewConditionGroupConditions,
  normalizeViewConditionGroup,
  type PermissionMap,
  type RecordScope,
  type ViewConditionGroup,
} from '../../utils/permissions';
import { fetchSessionBootstrap } from '../../utils/sessionCache';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { MODULE_SETTINGS_APPLIED_EVENT } from '../../utils/moduleSettingsRuntime';
import { FieldNature } from '../../types';
import {
  buildStandardSelectPopupRootStyle,
  KALAM_SELECT_FIELD_CLASSNAME,
  mergeClassNames,
  resolveSelectPopupContainer,
} from '../../utils/popupContainer';
import WorkflowConditionsGroup from '../../components/workflows/WorkflowConditionsGroup';
import { loadWorkflowConditionEditorOptions } from '../../utils/workflowConditionOptions';
import { getWorkflowConditionFields } from '../../utils/workflowHelpers';
import { getDefaultWorkflowOperator, getWorkflowOperatorOptions } from '../../utils/filterUtils';
import { WORKFLOW_ASSIGNEE_FIELD_KEY } from '../../utils/workflowTypes';
import { OrgChart } from './OrgChart';
import { useRoleDragDrop } from './useRoleDragDrop';

const CURRENT_USER_OPTION_VALUE = '__current_user__';
const CURRENT_ROLE_OPTION_VALUE = '__current_role__';
const SPECIAL_ASSIGNEE_OPTIONS = [
  { label: 'کاربر در حال مشاهده', value: CURRENT_USER_OPTION_VALUE },
  { label: 'نقش در حال مشاهده', value: CURRENT_ROLE_OPTION_VALUE },
];

type ModuleConditionOptions = {
  dynamicOptions: Record<string, Array<{ label: string; value: string }>>;
  relationOptions: Record<string, Array<{ label: string; value: string }>>;
  loading: boolean;
  loaded: boolean;
};

const { Panel } = Collapse;
const SETTINGS_PAGE_FIELD_PERMISSIONS = SETTINGS_TAB_PERMISSIONS.filter((item) => item.key !== 'ai_knowledge');
const SETTINGS_TOOL_FIELD_PERMISSIONS = SETTINGS_TAB_PERMISSIONS.filter((item) => item.key === 'ai_knowledge');
const SETTINGS_PRINT_FIELD_PERMISSIONS = [...PRINT_SIGNATURE_PERMISSION_FIELDS];

type PermissionFieldItem = {
  key: string;
  label: string;
  group: 'custom' | 'standard' | 'system' | 'structure' | 'action';
};

const FIELD_GROUP_ORDER: PermissionFieldItem['group'][] = ['custom', 'standard', 'system', 'structure', 'action'];
const FIELD_GROUP_LABELS: Record<PermissionFieldItem['group'], string> = {
  custom: 'فیلدهای سفارشی سازمان',
  standard: 'فیلدهای اصلی',
  system: 'فیلدهای سیستمی',
  structure: 'بخش‌ها و جدول‌ها',
  action: 'دکمه‌ها و عملیات',
};

const isRoleTreeColumnMissingError = (error: any) => {
  const text = String(error?.message || error?.details || error || '').toLowerCase();
  return text.includes('parent_id') || text.includes('sort_order');
};

const RolesTab: React.FC = () => {
  const { message, modal } = App.useApp();
  const permissionsPanelRef = useRef<HTMLDivElement>(null);

  // ─── State ────────────────────────────────────────────────────────────────
  const [roles, setRoles] = useState<any[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [selectedRoleTitle, setSelectedRoleTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [supportsRoleTreeSchema, setSupportsRoleTreeSchema] = useState<boolean | null>(null);
  const [permissionSchemaVersion, setPermissionSchemaVersion] = useState(0);
  const [fieldSearchByModule, setFieldSearchByModule] = useState<Record<string, string>>({});
  const [conditionEditorOpen, setConditionEditorOpen] = useState<Record<string, boolean>>({});
  const [moduleConditionOptions, setModuleConditionOptions] = useState<Record<string, ModuleConditionOptions>>({});
  const conditionOptionsLoadingRef = useRef<Set<string>>(new Set());

  // ─── Derived ──────────────────────────────────────────────────────────────
  const defaultPermissions = useMemo(() => buildDefaultPermissions(MODULES), [permissionSchemaVersion]);
  const mobileFooterModuleOptions = useMemo(
    () =>
      Object.values(MODULES)
        .filter((module) => !isSaasAdminModuleId(module.id))
        .map((module) => ({
          label: module.titles.faSingular || module.titles.fa,
          value: module.id,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'fa')),
    []
  );

  const selectedRole = useMemo(
    () => roles.find((role) => String(role?.id || '') === String(selectedRoleId || '')) || null,
    [roles, selectedRoleId]
  );

  const mobileFooterFields = useMemo(() => {
    const merged = mergePermissionsWithDefaults(permissions, defaultPermissions);
    return merged[MOBILE_FOOTER_PERMISSION_KEY]?.fields || {};
  }, [defaultPermissions, permissions]);

  // ─── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => { void loadCurrentUser(); }, []);
  useEffect(() => { fetchRoles(); }, [currentOrgId]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handle = () => setPermissionSchemaVersion((v) => v + 1);
    window.addEventListener(MODULE_SETTINGS_APPLIED_EVENT, handle as EventListener);
    return () => window.removeEventListener(MODULE_SETTINGS_APPLIED_EVENT, handle as EventListener);
  }, []);

  useEffect(() => {
    if (!selectedRoleId) return;
    const role = roles.find((r) => r.id === selectedRoleId);
    setPermissions(mergePermissionsWithDefaults(role?.permissions || {}, defaultPermissions));
    setSelectedRoleTitle(String(role?.title || ''));
  }, [selectedRoleId, roles, defaultPermissions]);

  // ─── Data helpers ──────────────────────────────────────────────────────────
  const getRoleDisplayTitle = (role: any) =>
    String(role?.title || role?.name || '').trim() || 'بدون عنوان';

  const sortRoles = (items: any[]) =>
    [...items].sort(
      (a, b) =>
        Number(a?.sort_order || 0) - Number(b?.sort_order || 0) ||
        new Date(String(a?.created_at || 0)).getTime() -
          new Date(String(b?.created_at || 0)).getTime()
    );

  const syncExpandedParents = (items: any[]) => {
    const parentKeys = items
      .map((role: any) => String(role?.parent_id || '').trim())
      .filter(Boolean);
    setExpandedKeys((prev) => Array.from(new Set([...(prev || []), ...parentKeys])));
  };

  const loadCurrentUser = async () => {
    const snapshot = await fetchSessionBootstrap(supabase, { force: true });
    setCurrentOrgId(snapshot.orgId || null);
  };

  const fetchRoles = async () => {
    if (!currentOrgId) { setRoles([]); return; }

    const runQuery = async (tree: boolean) =>
      tree
        ? supabase
            .from('org_roles')
            .select('id, org_id, title, permissions, created_at, parent_id, sort_order, is_system')
            .eq('org_id', currentOrgId)
            .order('created_at')
        : supabase
            .from('org_roles')
            .select('id, org_id, title, permissions, created_at, is_system')
            .eq('org_id', currentOrgId)
            .order('created_at');

    const preferTree = supportsRoleTreeSchema !== false;
    const primary = await runQuery(preferTree);
    let data = primary.data;
    let error = primary.error;

    if (error && isRoleTreeColumnMissingError(error) && preferTree) {
      setSupportsRoleTreeSchema(false);
      const fallback = await runQuery(false);
      data = (fallback.data || []).map((r: any) => ({ ...r, parent_id: null, sort_order: 0 }));
      error = fallback.error;
    } else if (!error && preferTree) {
      setSupportsRoleTreeSchema(true);
    } else if (!error && !preferTree) {
      data = (data || []).map((r: any) => ({ ...r, parent_id: null, sort_order: 0 }));
    }

    if (error) {
      console.error('RolesTab.fetchRoles error:', error);
      message.error('خطا در بارگذاری لیست نقش‌ها');
      setRoles([]);
      return;
    }

    const roleMap = new Map<string, any>();
    (data || []).forEach((role: any) => {
      const id = String(role?.id || '');
      if (id) roleMap.set(id, role);
    });

    const [{ data: profileRows }, { data: inviteRows }] = await Promise.all([
      supabase.from('profiles').select('role_id').eq('org_id', currentOrgId).not('role_id', 'is', null),
      supabase.from('phone_signup_invites').select('role_id').eq('org_id', currentOrgId).not('role_id', 'is', null),
    ]);

    const assignedIds = Array.from(
      new Set(
        [...(profileRows || []), ...(inviteRows || [])]
          .map((r: any) => String(r?.role_id || '').trim())
          .filter(Boolean)
      )
    ).filter((id) => !roleMap.has(id));

    if (assignedIds.length > 0) {
      const q = supportsRoleTreeSchema === false
        ? await supabase.from('org_roles').select('id, org_id, title, permissions, created_at, is_system').in('id', assignedIds)
        : await supabase.from('org_roles').select('id, org_id, title, permissions, created_at, parent_id, sort_order, is_system').in('id', assignedIds);
      let ar = q.data;
      if (q.error && isRoleTreeColumnMissingError(q.error)) {
        setSupportsRoleTreeSchema(false);
        const fb = await supabase.from('org_roles').select('id, org_id, title, permissions, created_at, is_system').in('id', assignedIds);
        ar = (fb.data || []).map((r: any) => ({ ...r, parent_id: null, sort_order: 0 }));
      } else if (!q.error && supportsRoleTreeSchema === false) {
        ar = (ar || []).map((r: any) => ({ ...r, parent_id: null, sort_order: 0 }));
      }
      (ar || []).forEach((role: any) => {
        const id = String(role?.id || '');
        if (id) roleMap.set(id, role);
      });
    }

    const merged = sortRoles(Array.from(roleMap.values()));
    setRoles(merged);
    syncExpandedParents(merged);
  };

  const getSortedSiblings = (parentId?: string | null, excludeRoleId?: string | null) =>
    sortRoles(
      roles
        .filter((r) => String(r?.parent_id || '') === String(parentId || ''))
        .filter((r) => !excludeRoleId || String(r?.id || '') !== String(excludeRoleId))
    );

  const updateRoleTreeLocally = (roleId: string, updates: { parent_id?: string | null; sort_order?: number }) => {
    setRoles((prev) => {
      const next = sortRoles(prev.map((r) => (String(r?.id || '') === roleId ? { ...r, ...updates } : r)));
      syncExpandedParents(next);
      return next;
    });
  };

  // ─── CRUD ─────────────────────────────────────────────────────────────────
  const handleAddRole = async (parentRoleId: string | null, roleName: string) => {
    const name = roleName.trim();
    if (!name) return;
    if (!currentOrgId) { message.error('سازمان جاری قابل تشخیص نیست'); return; }

    const normalizedParentId = parentRoleId || null;
    const siblingSortOrders = roles
      .filter((r) => String(r?.parent_id || '') === String(normalizedParentId || ''))
      .map((r) => Number(r?.sort_order || 0));
    const nextSort = siblingSortOrders.length > 0 ? Math.max(...siblingSortOrders) + 1 : 0;

    const primary = await supabase.from('org_roles').insert([{
      title: name,
      permissions: defaultPermissions,
      org_id: currentOrgId,
      parent_id: normalizedParentId,
      sort_order: nextSort,
    }]);
    let err = primary.error;
    if (err && isRoleTreeColumnMissingError(err)) {
      const fb = await supabase.from('org_roles').insert([{
        title: name,
        permissions: defaultPermissions,
        org_id: currentOrgId,
      }]);
      err = fb.error;
    }
    if (!err) {
      message.success(normalizedParentId ? 'زیرجایگاه اضافه شد' : 'جایگاه اضافه شد');
      fetchRoles();
    }
  };

  const handleDeleteRole = (id: string) => {
    const role = roles.find((r) => String(r?.id) === id);
    const title = getRoleDisplayTitle(role);
    modal.confirm({
      title: 'حذف جایگاه',
      content: `جایگاه «${title}» حذف شود؟`,
      okButtonProps: { danger: true },
      okText: 'حذف',
      cancelText: 'انصراف',
      onOk: async () => {
        const { error } = await supabase.from('org_roles').delete().eq('id', id);
        if (!error) {
          message.success('حذف شد');
          if (selectedRoleId === id) setSelectedRoleId(null);
          fetchRoles();
        } else {
          message.error('خطا: ممکن است کاربرانی به این نقش متصل باشند.');
        }
      },
    });
  };

  const handleUpdateRoleTitle = async () => {
    if (!selectedRoleId) return;
    const nextTitle = String(selectedRoleTitle || '').trim();
    if (!nextTitle) { message.error('عنوان نقش نمی‌تواند خالی باشد'); return; }
    const { error } = await supabase.from('org_roles').update({ title: nextTitle }).eq('id', selectedRoleId);
    if (error) { message.error(toFaErrorMessage(error, 'بروزرسانی عنوان نقش ناموفق بود.')); return; }
    message.success('عنوان نقش بروزرسانی شد');
    setRoles((prev) => prev.map((r) => (r.id === selectedRoleId ? { ...r, title: nextTitle } : r)));
  };

  // ─── Edit + scroll ─────────────────────────────────────────────────────────
  const handleEditClick = (roleId: string) => {
    setSelectedRoleId(roleId);
    setTimeout(() => {
      permissionsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  // ─── Permissions ──────────────────────────────────────────────────────────
  const handlePermissionChange = (
    moduleId: string,
    type: 'view' | 'edit' | 'delete' | 'field' | 'scope',
    fieldKey?: string,
    checked?: boolean | string
  ) => {
    setPermissions((prev) => {
      const merged = mergePermissionsWithDefaults(prev, defaultPermissions);
      if (!merged[moduleId]) merged[moduleId] = { view: true, edit: true, delete: true, fields: {} };
      const next = { ...merged };
      const target = { ...(next[moduleId] || {}), fields: { ...(next[moduleId]?.fields || {}) } };
      if (type === 'field' && fieldKey) {
        target.fields![fieldKey] = checked !== false;
      } else if (type === 'scope') {
        target.record_scope = String(checked || 'all') as RecordScope;
      } else {
        (target as any)[type] = checked !== false;
        if (type === 'edit' && checked) target.view = true;
        if (type === 'delete' && checked) target.view = true;
        if (type === 'view' && !checked && !target.record_scope) target.record_scope = 'own';
      }
      next[moduleId] = target;
      return next;
    });
  };

  const handleViewConditionsChange = useCallback(
    (moduleId: string, group: ViewConditionGroup) => {
      const normalizedGroup = normalizeViewConditionGroup(group);
      setPermissions((prev) => {
        const merged = mergePermissionsWithDefaults(prev, defaultPermissions);
        return {
          ...merged,
          [moduleId]: {
            ...(merged[moduleId] || {}),
            view_conditions: hasViewConditionGroupConditions(normalizedGroup) ? normalizedGroup : undefined,
          },
        };
      });
    },
    [defaultPermissions]
  );

  const loadConditionOptions = useCallback(
    async (moduleId: string) => {
      if (conditionOptionsLoadingRef.current.has(moduleId)) return;
      if (moduleConditionOptions[moduleId]?.loaded) return;
      conditionOptionsLoadingRef.current.add(moduleId);
      setModuleConditionOptions((prev) => ({
        ...prev,
        [moduleId]: { dynamicOptions: {}, relationOptions: {}, loading: true, loaded: false },
      }));
      try {
        const fields = getWorkflowConditionFields(moduleId);
        const result = await loadWorkflowConditionEditorOptions(moduleId, fields);
        const nextDynamic = { ...(result.dynamicOptions || {}) };
        for (const key of Object.keys(nextDynamic)) {
          if (key === WORKFLOW_ASSIGNEE_FIELD_KEY || key.includes(WORKFLOW_ASSIGNEE_FIELD_KEY)) {
            nextDynamic[key] = [...SPECIAL_ASSIGNEE_OPTIONS, ...(nextDynamic[key] || [])];
          }
        }
        setModuleConditionOptions((prev) => ({
          ...prev,
          [moduleId]: { dynamicOptions: nextDynamic, relationOptions: result.relationOptions || {}, loading: false, loaded: true },
        }));
      } catch {
        setModuleConditionOptions((prev) => ({
          ...prev,
          [moduleId]: { dynamicOptions: {}, relationOptions: {}, loading: false, loaded: true },
        }));
      } finally {
        conditionOptionsLoadingRef.current.delete(moduleId);
      }
    },
    [moduleConditionOptions]
  );

  const toggleConditionEditor = useCallback(
    (moduleId: string) => {
      setConditionEditorOpen((prev) => {
        const next = !prev[moduleId];
        if (next) void loadConditionOptions(moduleId);
        return { ...prev, [moduleId]: next };
      });
    },
    [loadConditionOptions]
  );

  const savePermissions = async () => {
    if (!selectedRoleId) return;
    setLoading(true);
    const normalized = mergePermissionsWithDefaults(permissions, defaultPermissions);
    const { error } = await supabase.from('org_roles').update({ permissions: normalized }).eq('id', selectedRoleId);
    if (!error) {
      message.success('دسترسی‌ها بروزرسانی شد');
      setRoles((prev) => prev.map((r) => (r.id === selectedRoleId ? { ...r, permissions: normalized } : r)));
      setPermissions(normalized);
      clearCurrentUserRoleContextCache();
    }
    setLoading(false);
  };

  const handleMobileFooterChange = (
    slotKey: (typeof PREFERRED_ROLE_MODULE_SLOT_KEYS)[number],
    moduleId: string
  ) => {
    setPermissions((prev) => {
      const merged = mergePermissionsWithDefaults(prev, defaultPermissions);
      const target = merged[MOBILE_FOOTER_PERMISSION_KEY] || { view: true, edit: true, delete: true, record_scope: 'all', fields: {} };
      return {
        ...merged,
        [MOBILE_FOOTER_PERMISSION_KEY]: { ...target, fields: { ...(target.fields || {}), [slotKey]: moduleId } },
      };
    });
  };

  const getMobileFooterOptions = (slotKey: (typeof PREFERRED_ROLE_MODULE_SLOT_KEYS)[number]) => {
    const selectedElsewhere = new Set(
      PREFERRED_ROLE_MODULE_SLOT_KEYS
        .filter((k) => k !== slotKey)
        .map((k) => String(mobileFooterFields[k] || '').trim())
        .filter(Boolean)
    );
    return [
      { label: 'بدون ماژول', value: '' },
      ...mobileFooterModuleOptions.map((opt) => ({ ...opt, disabled: selectedElsewhere.has(opt.value) })),
    ];
  };

  // ─── Field permissions helpers ─────────────────────────────────────────────
  const getModulePerms = (moduleId: string) => {
    const merged = mergePermissionsWithDefaults(permissions, defaultPermissions);
    return merged[moduleId] || { view: true, edit: true, delete: true, fields: {} };
  };

  const getPermissionFieldItems = (
    moduleId: string,
    fields: ReadonlyArray<{ key: string; label: string }>
  ): PermissionFieldItem[] => {
    const moduleDef = MODULES[moduleId];
    const items = new Map<string, PermissionFieldItem>();
    const fallbackLabelMap = new Map(fields.map((f) => [f.key, f.label]));

    const pushItem = (key: string, label: string | undefined, group: PermissionFieldItem['group']) => {
      const k = String(key || '').trim();
      if (!k) return;
      items.set(k, { key: k, label: String(label || fallbackLabelMap.get(k) || k).trim() || k, group });
    };

    (moduleDef?.fields || []).forEach((field: any) => {
      const nature = String(field?.nature || '').trim();
      const group: PermissionFieldItem['group'] = !nature ? 'custom' : nature === FieldNature.SYSTEM ? 'system' : 'standard';
      pushItem(String(field?.key || ''), field?.labels?.fa || field?.key, group);
    });

    (moduleDef?.blocks || []).forEach((block: any) => {
      const blockId = String(block?.id || '').trim();
      const blockLabel = block?.titles?.fa || blockId;
      if (!blockId) return;
      pushItem(blockId, `بخش: ${blockLabel}`, 'structure');
      (block?.tableColumns || []).forEach((col: any) => {
        const colKey = String(col?.key || '').trim();
        if (!colKey) return;
        pushItem(colKey, col?.title || colKey, 'structure');
        pushItem(`${blockId}.${colKey}`, `${blockLabel}: ${col?.title || colKey}`, 'structure');
      });
    });

    (moduleDef?.actionButtons || []).forEach((action: any) => {
      const actionId = String(action?.id || '').trim();
      if (!actionId) return;
      pushItem(`__action_${actionId}`, `عملیات: ${action?.label || actionId}`, 'action');
    });

    fields.forEach((f) => {
      const k = String(f?.key || '').trim();
      if (!k || items.has(k)) return;
      const group = k.startsWith('__action_') ? 'action' : (k.startsWith('__') || k.includes('.')) ? 'structure' : 'custom';
      pushItem(k, f.label, group);
    });

    return Array.from(items.values()).sort((a, b) => a.label.localeCompare(b.label, 'fa'));
  };

  const renderFieldSwitches = (
    moduleId: string,
    fields: ReadonlyArray<{ key: string; label: string }>,
    disabled: boolean
  ) => {
    const modPerms = getModulePerms(moduleId);
    const searchValue = String(fieldSearchByModule[moduleId] || '').trim().toLocaleLowerCase('fa');
    const groupedFields = FIELD_GROUP_ORDER.map((groupKey) => ({
      key: groupKey,
      label: FIELD_GROUP_LABELS[groupKey],
      items: getPermissionFieldItems(moduleId, fields).filter((f) => {
        if (f.group !== groupKey) return false;
        if (!searchValue) return true;
        return `${f.label} ${f.key}`.toLocaleLowerCase('fa').includes(searchValue);
      }),
    })).filter((g) => g.items.length > 0);

    return (
      <div className="space-y-4">
        {fields.length > 8 && (
          <Input
            value={fieldSearchByModule[moduleId] || ''}
            onChange={(e) => setFieldSearchByModule((prev) => ({ ...prev, [moduleId]: String(e.target.value || '') }))}
            placeholder="جستجوی فیلد یا بخش..."
            className="dark:bg-[#303030] dark:border-gray-700 dark:text-white"
          />
        )}
        {groupedFields.length === 0 && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="فیلدی برای این جستجو پیدا نشد." />
        )}
        {groupedFields.map((group) => (
          <div key={`${moduleId}-${group.key}`} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{group.label}</span>
              <span className="text-[11px] text-gray-400 dark:text-gray-500">{group.items.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {group.items.map((field) => (
                <div key={field.key} className="flex items-center gap-2 text-sm bg-gray-50 dark:bg-white/5 p-2 rounded border border-transparent dark:border-gray-800">
                  <Switch
                    size="small"
                    checked={modPerms.fields?.[field.key] !== false}
                    onChange={(checked) => handlePermissionChange(moduleId, 'field', field.key, checked)}
                    disabled={disabled}
                    className="bg-gray-300"
                  />
                  <span className="text-gray-600 dark:text-gray-400">{field.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ─── Drag-drop ─────────────────────────────────────────────────────────────
  const { activeId, overId, handleDragStart, handleDragOver, handleDragEnd, handleDragCancel } =
    useRoleDragDrop({
      roles,
      supportsRoleTreeSchema,
      updateRoleTreeLocally,
      getSortedSiblings,
      fetchRoles,
      messageApi: message,
    });

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      {/* ── Top: Org Chart ── */}
      <OrgChart
        roles={roles}
        selectedRoleId={selectedRoleId}
        expandedKeys={expandedKeys}
        supportsRoleTreeSchema={supportsRoleTreeSchema}
        activeId={activeId}
        overId={overId}
        onEditClick={handleEditClick}
        onDeleteRole={handleDeleteRole}
        onAddRole={handleAddRole}
        onSelectRole={setSelectedRoleId}
        onExpandChange={setExpandedKeys}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      />

      {/* ── Bottom: Permissions Panel ── */}
      <div
        ref={permissionsPanelRef}
        className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden"
      >
        {/* Sticky header */}
        {selectedRoleId && (
          <div
            className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1a1a1a]"
            style={{ backdropFilter: 'blur(8px)' }}
          >
            <h3 className="text-base font-bold m-0 flex items-center gap-2 text-gray-800 dark:text-white">
              <LockOutlined style={{ color: 'rgb(var(--brand-500-rgb))' }} />
              ویرایش دسترسی‌های جایگاه:
              <span style={{ color: 'rgb(var(--brand-500-rgb))' }}>
                {getRoleDisplayTitle(selectedRole)}
              </span>
            </h3>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={savePermissions}
              loading={loading}
              className="bg-green-600 border-none"
            >
              ذخیره دسترسی‌ها
            </Button>
          </div>
        )}

        <div className="p-6">
          {selectedRoleId ? (
            <>
              {/* Role title editor */}
              <div className="mb-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
                <Input
                  value={selectedRoleTitle}
                  onChange={(e) => setSelectedRoleTitle(e.target.value)}
                  placeholder="عنوان نمایشی جایگاه (فارسی)"
                  className="dark:bg-[#303030] dark:border-gray-700 dark:text-white"
                />
                <Button onClick={handleUpdateRoleTitle} icon={<TeamOutlined />}>ذخیره عنوان</Button>
              </div>

              {/* Mobile footer module preferences */}
              <div className="mb-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-white/5 p-4">
                <div className="mb-1 text-sm font-bold text-gray-800 dark:text-gray-100">ماژول‌های پر استفاده و افزودن سریع این نقش</div>
                <div className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                  سه ماژول اول در فوتر نسخه موبایل نمایش داده می‌شوند. تا ۸ ماژول برای افزودن سریع داشبورد قابل تعریف است.
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  {PREFERRED_ROLE_MODULE_SLOT_KEYS.map((slotKey, index) => (
                    <div key={slotKey}>
                      <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                        {index < 3 ? `ماژول ${index + 1} فوتر موبایل` : index === 3 ? 'ماژول 4 داشبورد' : `افزودن سریع ${index + 1}`}
                      </div>
                      <Select
                        value={String(mobileFooterFields[slotKey] ?? DASHBOARD_QUICK_ACCESS_DEFAULT_MODULES[index] ?? '')}
                        options={getMobileFooterOptions(slotKey)}
                        placeholder="انتخاب ماژول"
                        className={mergeClassNames(KALAM_SELECT_FIELD_CLASSNAME, 'w-full')}
                        showSearch
                        optionFilterProp="label"
                        optionLabelProp="label"
                        allowClear={index >= 3}
                        getPopupContainer={resolveSelectPopupContainer}
                        styles={{ popup: { root: buildStandardSelectPopupRootStyle({ minWidth: 240 }) } }}
                        onChange={(value) => handleMobileFooterChange(slotKey, String(value || ''))}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Module permissions */}
              <Collapse defaultActiveKey={[Object.values(MODULES)[0]?.id || 'products']} className="dark:bg-transparent dark:border-gray-800">
                {Object.values(MODULES).filter((module) => !isSaasAdminModuleId(module.id)).map((module) => {
                  const modPerms = getModulePerms(module.id);
                  const fields = collectModulePermissionFields(module);
                  const disabled = modPerms.view === false;
                  return (
                    <Panel key={module.id} className="dark:border-gray-800" header={
                      <div className="flex items-center justify-between w-full dark:text-gray-200">
                        <span className="font-bold">{module.titles.fa}</span>
                        <div className="flex gap-4 text-xs" onClick={(e) => e.stopPropagation()}>
                          <Checkbox className="dark:text-gray-400" checked={modPerms.view !== false} onChange={(e) => handlePermissionChange(module.id, 'view', undefined, e.target.checked)}>مشاهده</Checkbox>
                          <Checkbox className="dark:text-gray-400" checked={modPerms.edit !== false} disabled={disabled} onChange={(e) => handlePermissionChange(module.id, 'edit', undefined, e.target.checked)}>ویرایش/ایجاد</Checkbox>
                          <Checkbox className="dark:text-gray-400" checked={modPerms.delete !== false} disabled={disabled} onChange={(e) => handlePermissionChange(module.id, 'delete', undefined, e.target.checked)}>حذف</Checkbox>
                        </div>
                      </div>
                    }>
                      <div className="pl-6 pt-2">
                        <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">نمایش رکوردها</Divider>
                        <Radio.Group value={modPerms.record_scope || 'all'} onChange={(e) => handlePermissionChange(module.id, 'scope', undefined, e.target.value)} className="mb-4 flex flex-col gap-2">
                          <Radio value="all">مشاهده همه رکوردها</Radio>
                          <Radio value="own">فقط مشاهده رکوردهای به نام شخص</Radio>
                          <Radio value="team">فقط مشاهده رکوردهای به نام تیم (جایگاه)</Radio>
                          <Radio value="subtree">مشاهده رکوردهای افراد زیرمجموعه</Radio>
                        </Radio.Group>

                        {(() => {
                          const condOpen = conditionEditorOpen[module.id] || false;
                          const condOpts = moduleConditionOptions[module.id];
                          const existingConditions = normalizeViewConditionGroup(modPerms.view_conditions);
                          const conditionsAll = existingConditions.conditions_all || [];
                          const conditionsAny = existingConditions.conditions_any || [];
                          const condCount = conditionsAll.length + conditionsAny.length;
                          const condFields = getWorkflowConditionFields(module.id);
                          return (
                            <div className="mb-5">
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-xl border border-dashed border-[rgba(var(--brand-300-rgb),0.6)] bg-[rgba(var(--brand-50-rgb),0.4)] px-3 py-2 text-sm text-[rgba(var(--brand-700-rgb),1)] transition hover:border-[rgba(var(--brand-500-rgb),0.7)] hover:bg-[rgba(var(--brand-50-rgb),0.7)] dark:border-[rgba(var(--brand-300-rgb),0.2)] dark:bg-white/5 dark:text-[rgba(var(--brand-200-rgb),1)] dark:hover:bg-white/10"
                                onClick={() => toggleConditionEditor(module.id)}
                                disabled={disabled}
                              >
                                <FilterOutlined className="text-xs" />
                                <span className="flex-1 text-right text-xs font-medium">شرط‌های نمایش پیشرفته</span>
                                {condCount > 0 && !condOpen && <Badge count={condCount} size="small" color="rgb(var(--brand-500-rgb))" />}
                                <CaretDownOutlined className={`text-xs transition-transform ${condOpen ? 'rotate-180' : ''}`} />
                              </button>
                              {condOpen && (
                                <div className="mt-2 rounded-xl border border-[rgba(var(--brand-200-rgb),0.5)] bg-white/60 p-3 dark:border-[rgba(var(--brand-300-rgb),0.15)] dark:bg-white/5">
                                  <div className="mb-3">
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">رکوردهایی که این شرط‌ها را دارند قابل مشاهده می‌شوند</span>
                                  </div>
                                  <div className="space-y-4">
                                    <div>
                                      <div className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">حتماً همه این شرط‌ها برقرار باشند</div>
                                      <WorkflowConditionsGroup
                                        value={conditionsAll as any}
                                        onChange={(next) => handleViewConditionsChange(module.id, { ...existingConditions, conditions_all: next as any })}
                                        fields={condFields}
                                        dynamicOptions={condOpts?.dynamicOptions || {}}
                                        relationOptions={condOpts?.relationOptions || {}}
                                        getOperatorOptions={(field) => getWorkflowOperatorOptions(field).filter((opt) => ['eq','neq','contains','not_contains','in','not_in','is_null','not_null','is_true','is_false','gt','gte','lt','lte'].includes(String(opt.value || '')))}
                                        getDefaultOperator={getDefaultWorkflowOperator}
                                        overlayZIndexBase={2000}
                                        disabled={disabled}
                                      />
                                    </div>
                                    <div>
                                      <div className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">کافی است یکی از این شرط‌ها برقرار باشد</div>
                                      <WorkflowConditionsGroup
                                        value={conditionsAny as any}
                                        onChange={(next) => handleViewConditionsChange(module.id, { ...existingConditions, conditions_any: next as any })}
                                        fields={condFields}
                                        dynamicOptions={condOpts?.dynamicOptions || {}}
                                        relationOptions={condOpts?.relationOptions || {}}
                                        getOperatorOptions={(field) => getWorkflowOperatorOptions(field).filter((opt) => ['eq','neq','contains','not_contains','in','not_in','is_null','not_null','is_true','is_false','gt','gte','lt','lte'].includes(String(opt.value || '')))}
                                        getDefaultOperator={getDefaultWorkflowOperator}
                                        overlayZIndexBase={2000}
                                        disabled={disabled}
                                      />
                                    </div>
                                  </div>
                                  {condCount === 0 && <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">بدون شرط — همه رکوردها (با توجه به محدوده بالا) نمایش داده می‌شوند</div>}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">دسترسی به فیلدها و جداول</Divider>
                        {renderFieldSwitches(module.id, fields, disabled)}
                      </div>
                    </Panel>
                  );
                })}

                <Panel key={SETTINGS_PERMISSION_KEY} className="dark:border-gray-800" header={
                  <div className="flex items-center justify-between w-full dark:text-gray-200">
                    <span className="font-bold">تنظیمات</span>
                    <div className="flex gap-4 text-xs" onClick={(e) => e.stopPropagation()}>
                      <Checkbox className="dark:text-gray-400" checked={getModulePerms(SETTINGS_PERMISSION_KEY).view !== false} onChange={(e) => handlePermissionChange(SETTINGS_PERMISSION_KEY, 'view', undefined, e.target.checked)}>مشاهده</Checkbox>
                      <Checkbox className="dark:text-gray-400" checked={getModulePerms(SETTINGS_PERMISSION_KEY).edit !== false} disabled={getModulePerms(SETTINGS_PERMISSION_KEY).view === false} onChange={(e) => handlePermissionChange(SETTINGS_PERMISSION_KEY, 'edit', undefined, e.target.checked)}>ویرایش/ایجاد</Checkbox>
                      <Checkbox className="dark:text-gray-400" checked={getModulePerms(SETTINGS_PERMISSION_KEY).delete !== false} disabled={getModulePerms(SETTINGS_PERMISSION_KEY).view === false} onChange={(e) => handlePermissionChange(SETTINGS_PERMISSION_KEY, 'delete', undefined, e.target.checked)}>حذف</Checkbox>
                    </div>
                  </div>
                }>
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">دسترسی تب های تنظیمات</Divider>
                    {renderFieldSwitches(SETTINGS_PERMISSION_KEY, SETTINGS_PAGE_FIELD_PERMISSIONS, getModulePerms(SETTINGS_PERMISSION_KEY).view === false)}
                    {SETTINGS_TOOL_FIELD_PERMISSIONS.length > 0 && (
                      <>
                        <Divider orientation="left" className="text-xs text-gray-400 m-0 my-3 border-gray-200 dark:border-gray-700">دسترسی ابزارهای مدیریتی</Divider>
                        {renderFieldSwitches(SETTINGS_PERMISSION_KEY, SETTINGS_TOOL_FIELD_PERMISSIONS, getModulePerms(SETTINGS_PERMISSION_KEY).view === false)}
                      </>
                    )}
                    {SETTINGS_PRINT_FIELD_PERMISSIONS.length > 0 && (
                      <>
                        <Divider orientation="left" className="text-xs text-gray-400 m-0 my-3 border-gray-200 dark:border-gray-700">دسترسی‌های مهر و امضای چاپ</Divider>
                        {renderFieldSwitches(SETTINGS_PERMISSION_KEY, SETTINGS_PRINT_FIELD_PERMISSIONS, getModulePerms(SETTINGS_PERMISSION_KEY).view === false)}
                      </>
                    )}
                  </div>
                </Panel>

                <Panel key={DASHBOARD_PERMISSION_KEY} className="dark:border-gray-800" header={<div className="flex items-center justify-between w-full dark:text-gray-200"><span className="font-bold">داشبورد</span></div>}>
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">دسترسی ویجت‌های داشبورد</Divider>
                    {renderFieldSwitches(DASHBOARD_PERMISSION_KEY, DASHBOARD_WIDGET_PERMISSIONS, getModulePerms(DASHBOARD_PERMISSION_KEY).view === false)}
                  </div>
                </Panel>

                <Panel key={WORKFLOWS_PERMISSION_KEY} className="dark:border-gray-800" header={
                  <div className="flex items-center justify-between w-full dark:text-gray-200">
                    <span className="font-bold">گردش کارها</span>
                    <div className="flex gap-4 text-xs" onClick={(e) => e.stopPropagation()}>
                      <Checkbox className="dark:text-gray-400" checked={getModulePerms(WORKFLOWS_PERMISSION_KEY).view !== false} onChange={(e) => handlePermissionChange(WORKFLOWS_PERMISSION_KEY, 'view', undefined, e.target.checked)}>مشاهده</Checkbox>
                      <Checkbox className="dark:text-gray-400" checked={getModulePerms(WORKFLOWS_PERMISSION_KEY).edit !== false} disabled={getModulePerms(WORKFLOWS_PERMISSION_KEY).view === false} onChange={(e) => handlePermissionChange(WORKFLOWS_PERMISSION_KEY, 'edit', undefined, e.target.checked)}>ویرایش/ایجاد</Checkbox>
                      <Checkbox className="dark:text-gray-400" checked={getModulePerms(WORKFLOWS_PERMISSION_KEY).delete !== false} disabled={getModulePerms(WORKFLOWS_PERMISSION_KEY).view === false} onChange={(e) => handlePermissionChange(WORKFLOWS_PERMISSION_KEY, 'delete', undefined, e.target.checked)}>حذف</Checkbox>
                    </div>
                  </div>
                }>
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">دسترسی‌های گردش کار</Divider>
                    {renderFieldSwitches(WORKFLOWS_PERMISSION_KEY, WORKFLOWS_PERMISSION_FIELDS, getModulePerms(WORKFLOWS_PERMISSION_KEY).view === false)}
                  </div>
                </Panel>

                <Panel key={GOALS_PERMISSION_KEY} className="dark:border-gray-800" header={<div className="flex items-center justify-between w-full dark:text-gray-200"><span className="font-bold">اهداف</span></div>}>
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">دسترسی‌های اهداف</Divider>
                    {renderFieldSwitches(GOALS_PERMISSION_KEY, GOALS_PERMISSION_FIELDS, getModulePerms(GOALS_PERMISSION_KEY).view === false)}
                  </div>
                </Panel>

                <Panel key={FILES_PERMISSION_KEY} className="dark:border-gray-800" header={<div className="flex items-center justify-between w-full dark:text-gray-200"><span className="font-bold">فایل‌ها</span></div>}>
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">دسترسی‌های مدیریت فایل</Divider>
                    {renderFieldSwitches(FILES_PERMISSION_KEY, FILES_PERMISSION_FIELDS, getModulePerms(FILES_PERMISSION_KEY).view === false)}
                  </div>
                </Panel>

                <Panel key={ACCOUNTING_PERMISSION_KEY} className="dark:border-gray-800" header={<div className="flex items-center justify-between w-full dark:text-gray-200"><span className="font-bold">حسابداری</span></div>}>
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">دسترسی‌های حسابداری</Divider>
                    {renderFieldSwitches(ACCOUNTING_PERMISSION_KEY, ACCOUNTING_PERMISSION_FIELDS, getModulePerms(ACCOUNTING_PERMISSION_KEY).view === false)}
                  </div>
                </Panel>

                <Panel key={REPORTS_PERMISSION_KEY} className="dark:border-gray-800" header={<div className="flex items-center justify-between w-full dark:text-gray-200"><span className="font-bold">گزارش‌ها</span></div>}>
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">دسترسی‌های گزارش</Divider>
                    {renderFieldSwitches(REPORTS_PERMISSION_KEY, REPORTS_PERMISSION_FIELDS, getModulePerms(REPORTS_PERMISSION_KEY).view === false)}
                  </div>
                </Panel>

                <Panel key={CUSTOMER_CLUB_PERMISSION_KEY} className="dark:border-gray-800" header={
                  <div className="flex items-center justify-between w-full dark:text-gray-200">
                    <span className="font-bold">باشگاه مشتریان</span>
                    <div className="flex gap-4 text-xs" onClick={(e) => e.stopPropagation()}>
                      <Checkbox className="dark:text-gray-400" checked={getModulePerms(CUSTOMER_CLUB_PERMISSION_KEY).view !== false} onChange={(e) => handlePermissionChange(CUSTOMER_CLUB_PERMISSION_KEY, 'view', undefined, e.target.checked)}>مشاهده</Checkbox>
                      <Checkbox className="dark:text-gray-400" checked={getModulePerms(CUSTOMER_CLUB_PERMISSION_KEY).edit !== false} disabled={getModulePerms(CUSTOMER_CLUB_PERMISSION_KEY).view === false} onChange={(e) => handlePermissionChange(CUSTOMER_CLUB_PERMISSION_KEY, 'edit', undefined, e.target.checked)}>ویرایش/ایجاد</Checkbox>
                      <Checkbox className="dark:text-gray-400" checked={getModulePerms(CUSTOMER_CLUB_PERMISSION_KEY).delete !== false} disabled={getModulePerms(CUSTOMER_CLUB_PERMISSION_KEY).view === false} onChange={(e) => handlePermissionChange(CUSTOMER_CLUB_PERMISSION_KEY, 'delete', undefined, e.target.checked)}>حذف</Checkbox>
                    </div>
                  </div>
                }>
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">دسترسی‌های باشگاه مشتریان</Divider>
                    {renderFieldSwitches(CUSTOMER_CLUB_PERMISSION_KEY, CUSTOMER_CLUB_PERMISSION_FIELDS, getModulePerms(CUSTOMER_CLUB_PERMISSION_KEY).view === false)}
                  </div>
                </Panel>

                <Panel key={COMMUNICATIONS_PERMISSION_KEY} className="dark:border-gray-800" header={
                  <div className="flex items-center justify-between w-full dark:text-gray-200">
                    <span className="font-bold">ارتباطات</span>
                    <div className="flex gap-4 text-xs" onClick={(e) => e.stopPropagation()}>
                      <Checkbox className="dark:text-gray-400" checked={getModulePerms(COMMUNICATIONS_PERMISSION_KEY).view !== false} onChange={(e) => handlePermissionChange(COMMUNICATIONS_PERMISSION_KEY, 'view', undefined, e.target.checked)}>مشاهده</Checkbox>
                      <Checkbox className="dark:text-gray-400" checked={getModulePerms(COMMUNICATIONS_PERMISSION_KEY).edit !== false} disabled={getModulePerms(COMMUNICATIONS_PERMISSION_KEY).view === false} onChange={(e) => handlePermissionChange(COMMUNICATIONS_PERMISSION_KEY, 'edit', undefined, e.target.checked)}>ویرایش/ایجاد</Checkbox>
                      <Checkbox className="dark:text-gray-400" checked={getModulePerms(COMMUNICATIONS_PERMISSION_KEY).delete !== false} disabled={getModulePerms(COMMUNICATIONS_PERMISSION_KEY).view === false} onChange={(e) => handlePermissionChange(COMMUNICATIONS_PERMISSION_KEY, 'delete', undefined, e.target.checked)}>حذف</Checkbox>
                    </div>
                  </div>
                }>
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">دسترسی‌های ارتباطات</Divider>
                    {renderFieldSwitches(COMMUNICATIONS_PERMISSION_KEY, COMMUNICATIONS_PERMISSION_FIELDS, getModulePerms(COMMUNICATIONS_PERMISSION_KEY).view === false)}
                  </div>
                </Panel>

                <Panel key={VOIP_PERMISSION_KEY} className="dark:border-gray-800" header={<div className="flex items-center justify-between w-full dark:text-gray-200"><span className="font-bold">تلفن و VOIP</span></div>}>
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">دسترسی‌های VOIP</Divider>
                    {renderFieldSwitches(VOIP_PERMISSION_KEY, VOIP_PERMISSION_FIELDS, getModulePerms(VOIP_PERMISSION_KEY).view === false)}
                  </div>
                </Panel>

                <Panel key={STORIES_PERMISSION_KEY} className="dark:border-gray-800" header={
                  <div className="flex items-center justify-between w-full dark:text-gray-200">
                    <span className="font-bold">استوری سازمانی</span>
                    <div className="flex gap-4 text-xs" onClick={(e) => e.stopPropagation()}>
                      <Checkbox className="dark:text-gray-400" checked={getModulePerms(STORIES_PERMISSION_KEY).view !== false} onChange={(e) => handlePermissionChange(STORIES_PERMISSION_KEY, 'view', undefined, e.target.checked)}>مشاهده</Checkbox>
                      <Checkbox className="dark:text-gray-400" checked={getModulePerms(STORIES_PERMISSION_KEY).edit !== false} disabled={getModulePerms(STORIES_PERMISSION_KEY).view === false} onChange={(e) => handlePermissionChange(STORIES_PERMISSION_KEY, 'edit', undefined, e.target.checked)}>ویرایش/ایجاد</Checkbox>
                      <Checkbox className="dark:text-gray-400" checked={getModulePerms(STORIES_PERMISSION_KEY).delete !== false} disabled={getModulePerms(STORIES_PERMISSION_KEY).view === false} onChange={(e) => handlePermissionChange(STORIES_PERMISSION_KEY, 'delete', undefined, e.target.checked)}>حذف</Checkbox>
                    </div>
                  </div>
                }>
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">دسترسی‌های انتشار و مدیریت</Divider>
                    {renderFieldSwitches(STORIES_PERMISSION_KEY, STORIES_PERMISSION_FIELDS, getModulePerms(STORIES_PERMISSION_KEY).view === false)}
                  </div>
                </Panel>

                <Panel key={SAAS_ADMIN_PERMISSION_KEY} className="dark:border-gray-800" header={
                  <div className="flex items-center justify-between w-full dark:text-gray-200">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">تازه سیستم — مدیریت SaaS</span>
                      <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 rounded px-1.5 py-0.5 font-mono">فقط داخلی</span>
                    </div>
                    <div className="flex gap-4 text-xs" onClick={(e) => e.stopPropagation()}>
                      <Checkbox className="dark:text-gray-400" checked={getModulePerms(SAAS_ADMIN_PERMISSION_KEY).view === true} onChange={(e) => handlePermissionChange(SAAS_ADMIN_PERMISSION_KEY, 'view', undefined, e.target.checked)}>مشاهده</Checkbox>
                      <Checkbox className="dark:text-gray-400" checked={getModulePerms(SAAS_ADMIN_PERMISSION_KEY).edit === true} disabled={getModulePerms(SAAS_ADMIN_PERMISSION_KEY).view !== true} onChange={(e) => handlePermissionChange(SAAS_ADMIN_PERMISSION_KEY, 'edit', undefined, e.target.checked)}>ویرایش</Checkbox>
                    </div>
                  </div>
                }>
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">دسترسی‌های اضافی</Divider>
                    {renderFieldSwitches(SAAS_ADMIN_PERMISSION_KEY, SAAS_ADMIN_PERMISSION_FIELDS, getModulePerms(SAAS_ADMIN_PERMISSION_KEY).view !== true)}
                  </div>
                </Panel>
              </Collapse>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <TeamOutlined className="text-4xl mb-2 opacity-30" />
              <p>روی آیکون ✏ یک جایگاه در چارت بالا کلیک کنید</p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .dark .ant-collapse-content { background-color: #1f1f1f; color: #ddd; border-color: #303030; }
        .dark .ant-collapse-header { color: #ddd !important; }
      `}</style>
    </div>
  );
};

export default RolesTab;
