import React, { useEffect, useMemo, useState } from 'react';
import { App, Tree, Checkbox, Button, Input, Empty, Divider, Switch, Collapse, Radio, Select, Tooltip } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, PlusOutlined, DeleteOutlined, SaveOutlined, LockOutlined, TeamOutlined } from '@ant-design/icons';
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
  STORIES_PERMISSION_KEY,
  STORIES_PERMISSION_FIELDS,
  SAAS_ADMIN_PERMISSION_KEY,
  SAAS_ADMIN_PERMISSION_FIELDS,
  isSaasAdminModuleId,
  MOBILE_FOOTER_PERMISSION_KEY,
  DASHBOARD_QUICK_ACCESS_DEFAULT_MODULES,
  PREFERRED_ROLE_MODULE_SLOT_KEYS,
  type PermissionMap,
  type RecordScope,
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

const { Panel } = Collapse;

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
  const { message } = App.useApp();
  const [roles, setRoles] = useState<any[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [newRoleName, setNewRoleName] = useState('');
  const [selectedRoleTitle, setSelectedRoleTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [supportsRoleTreeSchema, setSupportsRoleTreeSchema] = useState<boolean | null>(null);
  const [permissionSchemaVersion, setPermissionSchemaVersion] = useState(0);
  const [fieldSearchByModule, setFieldSearchByModule] = useState<Record<string, string>>({});

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

  useEffect(() => {
    void loadCurrentUser();
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [currentOrgId]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleModuleSettingsApplied = () => {
      setPermissionSchemaVersion((prev) => prev + 1);
    };
    window.addEventListener(MODULE_SETTINGS_APPLIED_EVENT, handleModuleSettingsApplied as EventListener);
    return () => {
      window.removeEventListener(MODULE_SETTINGS_APPLIED_EVENT, handleModuleSettingsApplied as EventListener);
    };
  }, []);

  const loadCurrentUser = async () => {
    const snapshot = await fetchSessionBootstrap(supabase, { force: true });
    setCurrentOrgId(snapshot.orgId || null);
  };

  useEffect(() => {
    if (!selectedRoleId) return;
    const role = roles.find((r) => r.id === selectedRoleId);
    setPermissions(mergePermissionsWithDefaults(role?.permissions || {}, defaultPermissions));
    setSelectedRoleTitle(String(role?.title || ''));
  }, [selectedRoleId, roles, defaultPermissions]);

  const getRoleDisplayTitle = (role: any) => {
    return String(role?.title || role?.name || '').trim() || 'بدون عنوان';
  };

  const sortRoles = (items: any[]) =>
    [...items].sort(
      (a: any, b: any) =>
        Number(a?.sort_order || 0) - Number(b?.sort_order || 0)
        || new Date(String(a?.created_at || 0)).getTime() - new Date(String(b?.created_at || 0)).getTime()
    );

  const syncExpandedParents = (items: any[]) => {
    const parentKeys = items
      .map((role: any) => String(role?.parent_id || '').trim())
      .filter(Boolean);
    setExpandedKeys((prev) => Array.from(new Set([...(prev || []), ...parentKeys])));
  };

  const fetchRoles = async () => {
    if (!currentOrgId) {
      setRoles([]);
      return;
    }

    const runRolesQuery = async (preferTreeSchema: boolean) => {
      if (preferTreeSchema) {
        return supabase
          .from('org_roles')
          .select('id, org_id, title, permissions, created_at, parent_id, sort_order, is_system')
          .eq('org_id', currentOrgId)
          .order('created_at');
      }
      return supabase
        .from('org_roles')
        .select('id, org_id, title, permissions, created_at, is_system')
        .eq('org_id', currentOrgId)
        .order('created_at');
    };

    const preferTreeSchema = supportsRoleTreeSchema !== false;
    const primary = await runRolesQuery(preferTreeSchema);
    let data = primary.data;
    let error = primary.error;
    if (error && isRoleTreeColumnMissingError(error) && preferTreeSchema) {
      setSupportsRoleTreeSchema(false);
      const fallback = await runRolesQuery(false);
      data = (fallback.data || []).map((row: any) => ({ ...row, parent_id: null, sort_order: 0 }));
      error = fallback.error;
    } else if (!error && preferTreeSchema) {
      setSupportsRoleTreeSchema(true);
    } else if (!error && !preferTreeSchema) {
      data = (data || []).map((row: any) => ({ ...row, parent_id: null, sort_order: 0 }));
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

    const [{ data: profileRoleRows }, { data: inviteRoleRows }] = await Promise.all([
      supabase
        .from('profiles')
        .select('role_id')
        .eq('org_id', currentOrgId)
        .not('role_id', 'is', null),
      supabase
        .from('phone_signup_invites')
        .select('role_id')
        .eq('org_id', currentOrgId)
        .not('role_id', 'is', null),
    ]);

    const assignedRoleIds = Array.from(
      new Set(
        [...(profileRoleRows || []), ...(inviteRoleRows || [])]
          .map((row: any) => String(row?.role_id || '').trim())
          .filter(Boolean)
      )
    ).filter((id) => !roleMap.has(id));

    if (assignedRoleIds.length > 0) {
      const primaryAssignedRoles = supportsRoleTreeSchema === false
        ? await supabase
            .from('org_roles')
            .select('id, org_id, title, permissions, created_at, is_system')
            .in('id', assignedRoleIds)
        : await supabase
            .from('org_roles')
            .select('id, org_id, title, permissions, created_at, parent_id, sort_order, is_system')
            .in('id', assignedRoleIds);
      let assignedRoles = primaryAssignedRoles.data;
      if (primaryAssignedRoles.error && isRoleTreeColumnMissingError(primaryAssignedRoles.error)) {
        setSupportsRoleTreeSchema(false);
        const fallbackAssignedRoles = await supabase
          .from('org_roles')
          .select('id, org_id, title, permissions, created_at, is_system')
          .in('id', assignedRoleIds);
        assignedRoles = (fallbackAssignedRoles.data || []).map((row: any) => ({ ...row, parent_id: null, sort_order: 0 }));
      } else if (!primaryAssignedRoles.error && supportsRoleTreeSchema === false) {
        assignedRoles = (assignedRoles || []).map((row: any) => ({ ...row, parent_id: null, sort_order: 0 }));
      }
      (assignedRoles || []).forEach((role: any) => {
        const id = String(role?.id || '');
        if (id) roleMap.set(id, role);
      });
    }

    const mergedRoles = sortRoles(Array.from(roleMap.values()));
    setRoles(mergedRoles);
    syncExpandedParents(mergedRoles);
  };

  const handleAddRole = async (parentRoleId?: string | null) => {
    if (!newRoleName.trim()) return;
    if (!currentOrgId) {
      message.error('سازمان جاری قابل تشخیص نیست');
      return;
    }
    const normalizedParentId = String(parentRoleId || '').trim() || null;
    const siblingSortOrders = roles
      .filter((role) => String(role?.parent_id || '') === String(normalizedParentId || ''))
      .map((role) => Number(role?.sort_order || 0));
    const nextSortOrder = siblingSortOrders.length > 0 ? Math.max(...siblingSortOrders) + 1 : 0;

    const primaryInsert = await supabase
      .from('org_roles')
      .insert([
        {
          title: newRoleName.trim(),
          permissions: defaultPermissions,
          org_id: currentOrgId,
          parent_id: normalizedParentId,
          sort_order: nextSortOrder,
        },
      ]);
    let error = primaryInsert.error;
    if (error && isRoleTreeColumnMissingError(error)) {
      const fallbackInsert = await supabase
        .from('org_roles')
        .insert([
          {
            title: newRoleName.trim(),
            permissions: defaultPermissions,
            org_id: currentOrgId,
          },
        ]);
      error = fallbackInsert.error;
    }
    if (!error) {
      message.success(normalizedParentId ? 'زیرجایگاه اضافه شد' : 'جایگاه اضافه شد');
      setNewRoleName('');
      fetchRoles();
    }
  };

  const handleDeleteRole = async (id: string) => {
    const { error } = await supabase.from('org_roles').delete().eq('id', id);
    if (!error) {
      message.success('حذف شد');
      if (selectedRoleId === id) setSelectedRoleId(null);
      fetchRoles();
    } else {
      message.error('خطا: ممکن است کاربرانی به این نقش متصل باشند.');
    }
  };

  const handleUpdateRoleTitle = async () => {
    if (!selectedRoleId) return;
    const nextTitle = String(selectedRoleTitle || '').trim();
    if (!nextTitle) {
      message.error('عنوان نقش نمی‌تواند خالی باشد');
      return;
    }

    const { error } = await supabase
      .from('org_roles')
      .update({ title: nextTitle })
      .eq('id', selectedRoleId);

    if (error) {
      message.error(toFaErrorMessage(error, 'بروزرسانی عنوان نقش ناموفق بود.'));
      return;
    }

    message.success('عنوان نقش بروزرسانی شد');
    setRoles((prev) => prev.map((r) => (r.id === selectedRoleId ? { ...r, title: nextTitle } : r)));
  };

  const handlePermissionChange = (
    moduleId: string,
    type: 'view' | 'edit' | 'delete' | 'field' | 'scope',
    fieldKey?: string,
    checked?: boolean | string
  ) => {
    setPermissions((prev) => {
      const merged = mergePermissionsWithDefaults(prev, defaultPermissions);
      if (!merged[moduleId]) {
        merged[moduleId] = { view: true, edit: true, delete: true, fields: {} };
      }

      const next = { ...merged };
      const target = {
        ...(next[moduleId] || {}),
        fields: { ...(next[moduleId]?.fields || {}) },
      };

      if (type === 'field' && fieldKey) {
        target.fields![fieldKey] = checked !== false;
      } else if (type === 'scope') {
        target.record_scope = String(checked || 'all') as RecordScope;
      } else {
        (target as any)[type] = checked !== false;
        if (type === 'edit' && checked) target.view = true;
        if (type === 'delete' && checked) target.view = true;
        if (type === 'view' && !checked) {
          if (!target.record_scope) {
            target.record_scope = 'own';
          }
        }
      }

      next[moduleId] = target;
      return next;
    });
  };

  const savePermissions = async () => {
    if (!selectedRoleId) return;
    setLoading(true);
    const normalized = mergePermissionsWithDefaults(permissions, defaultPermissions);
    const { error } = await supabase
      .from('org_roles')
      .update({ permissions: normalized })
      .eq('id', selectedRoleId);
    if (!error) {
      message.success('دسترسی ها بروزرسانی شد');
      setRoles((prev) => prev.map((r) => (r.id === selectedRoleId ? { ...r, permissions: normalized } : r)));
      setPermissions(normalized);
      clearCurrentUserRoleContextCache();
    }
    setLoading(false);
  };

  const mobileFooterFields = useMemo(() => {
    const merged = mergePermissionsWithDefaults(permissions, defaultPermissions);
    return merged[MOBILE_FOOTER_PERMISSION_KEY]?.fields || {};
  }, [defaultPermissions, permissions]);

  const handleMobileFooterChange = (
    slotKey: (typeof PREFERRED_ROLE_MODULE_SLOT_KEYS)[number],
    moduleId: string
  ) => {
    setPermissions((prev) => {
      const merged = mergePermissionsWithDefaults(prev, defaultPermissions);
      const target = merged[MOBILE_FOOTER_PERMISSION_KEY] || {
        view: true,
        edit: true,
        delete: true,
        record_scope: 'all',
        fields: {},
      };
      return {
        ...merged,
        [MOBILE_FOOTER_PERMISSION_KEY]: {
          ...target,
          fields: {
            ...(target.fields || {}),
            [slotKey]: moduleId,
          },
        },
      };
    });
  };

  const getMobileFooterOptions = (slotKey: (typeof PREFERRED_ROLE_MODULE_SLOT_KEYS)[number]) => {
    const selectedElsewhere = new Set(
      PREFERRED_ROLE_MODULE_SLOT_KEYS
        .filter((key) => key !== slotKey)
        .map((key) => String(mobileFooterFields[key] || '').trim())
        .filter(Boolean)
    );
    return [
      { label: 'بدون ماژول', value: '' },
      ...mobileFooterModuleOptions.map((option) => ({
        ...option,
        disabled: selectedElsewhere.has(option.value),
      })),
    ];
  };

  const selectedRole = useMemo(
    () => roles.find((role) => String(role?.id || '') === String(selectedRoleId || '')) || null,
    [roles, selectedRoleId]
  );

  const getSortedSiblings = (parentId?: string | null, excludeRoleId?: string | null) =>
    sortRoles(
      roles
        .filter((role) => String(role?.parent_id || '') === String(parentId || ''))
        .filter((role) => !excludeRoleId || String(role?.id || '') !== String(excludeRoleId))
    );

  const updateRoleTreeLocally = (roleId: string, updates: { parent_id?: string | null; sort_order?: number }) => {
    setRoles((prev) => {
      const next = sortRoles(
        prev.map((role) =>
          String(role?.id || '') === String(roleId || '')
            ? { ...role, ...updates }
            : role
        )
      );
      syncExpandedParents(next);
      return next;
    });
  };

  const handlePromoteRole = async (roleId: string) => {
    if (supportsRoleTreeSchema === false) {
      message.error('برای فعال شدن ساختار درختی نقش‌ها، migration مربوطه باید روی دیتابیس اجرا شود.');
      return;
    }
    const role = roles.find((item) => String(item?.id || '') === String(roleId || ''));
    if (!role?.parent_id) return;

    const parentRole = roles.find((item) => String(item?.id || '') === String(role.parent_id || ''));
    const nextParentId = parentRole?.parent_id || null;
    const siblingSortOrders = getSortedSiblings(nextParentId, roleId).map((item) => Number(item?.sort_order || 0));
    const nextSortOrder = siblingSortOrders.length > 0 ? Math.max(...siblingSortOrders) + 1 : 0;

    const { error } = await supabase
      .from('org_roles')
      .update({ parent_id: nextParentId, sort_order: nextSortOrder })
      .eq('id', roleId);

    if (error) {
      if (isRoleTreeColumnMissingError(error)) {
        message.error('برای فعال شدن ساختار درختی نقش‌ها، migration مربوطه باید روی دیتابیس اجرا شود.');
        return;
      }
      message.error(toFaErrorMessage(error, 'بروزرسانی سطح جایگاه ناموفق بود.'));
      return;
    }

    message.success('جایگاه به سطح بالاتر منتقل شد');
    updateRoleTreeLocally(roleId, { parent_id: nextParentId, sort_order: nextSortOrder });
  };

  const handleDemoteRole = async (roleId: string) => {
    if (supportsRoleTreeSchema === false) {
      message.error('برای فعال شدن ساختار درختی نقش‌ها، migration مربوطه باید روی دیتابیس اجرا شود.');
      return;
    }
    const role = roles.find((item) => String(item?.id || '') === String(roleId || ''));
    if (!role) return;

    const siblings = getSortedSiblings(role.parent_id || null);
    const currentIndex = siblings.findIndex((item) => String(item?.id || '') === String(roleId || ''));
    const previousSibling = currentIndex > 0 ? siblings[currentIndex - 1] : null;
    if (!previousSibling?.id) return;

    const childSortOrders = getSortedSiblings(previousSibling.id, roleId).map((item) => Number(item?.sort_order || 0));
    const nextSortOrder = childSortOrders.length > 0 ? Math.max(...childSortOrders) + 1 : 0;

    const { error } = await supabase
      .from('org_roles')
      .update({ parent_id: previousSibling.id, sort_order: nextSortOrder })
      .eq('id', roleId);

    if (error) {
      if (isRoleTreeColumnMissingError(error)) {
        message.error('برای فعال شدن ساختار درختی نقش‌ها، migration مربوطه باید روی دیتابیس اجرا شود.');
        return;
      }
      message.error(toFaErrorMessage(error, 'بروزرسانی سطح جایگاه ناموفق بود.'));
      return;
    }

    message.success('جایگاه به زیرمجموعه ردیف قبلی منتقل شد');
    updateRoleTreeLocally(roleId, { parent_id: previousSibling.id, sort_order: nextSortOrder });
  };

  const treeData = useMemo(() => {
    const roleMap = new Map<string, any>();
    const childrenMap = new Map<string | null, any[]>();

    roles.forEach((role) => {
      const roleId = String(role?.id || '').trim();
      if (!roleId) return;
      roleMap.set(roleId, role);
    });

    roles.forEach((role) => {
      const parentId = role?.parent_id && roleMap.has(String(role.parent_id)) ? String(role.parent_id) : null;
      const siblings = childrenMap.get(parentId) || [];
      siblings.push(role);
      childrenMap.set(parentId, siblings);
    });

    childrenMap.forEach((items) => {
      items.sort(
        (a, b) =>
          Number(a?.sort_order || 0) - Number(b?.sort_order || 0)
          || new Date(String(a?.created_at || 0)).getTime() - new Date(String(b?.created_at || 0)).getTime()
      );
    });

    const renderNode = (role: any): any => ({
      title: (
        <div className="flex justify-between items-center w-full pr-2 text-gray-700 dark:text-gray-300 gap-2 py-1">
          <span className="truncate">{getRoleDisplayTitle(role)}</span>
          <div className="flex items-center gap-1 shrink-0">
            <Tooltip title="انتقال به سطح بالاتر">
              <Button
                type="text"
                size="small"
                icon={<ArrowUpOutlined />}
                disabled={!role?.parent_id}
                onMouseDown={stopTreeAction}
                onClick={(e) => {
                  e.stopPropagation();
                  void handlePromoteRole(String(role.id));
                }}
              />
            </Tooltip>
            <Tooltip title="انتقال به زیرمجموعه ردیف قبلی">
              <Button
                type="text"
                size="small"
                icon={<ArrowDownOutlined />}
                disabled={getSortedSiblings(role?.parent_id || null).findIndex((item) => String(item?.id || '') === String(role?.id || '')) <= 0}
                onMouseDown={stopTreeAction}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDemoteRole(String(role.id));
                }}
              />
            </Tooltip>
            <Tooltip title="حذف">
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onMouseDown={stopTreeAction}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteRole(role.id);
                }}
              />
            </Tooltip>
          </div>
        </div>
      ),
      key: role.id,
      children: (childrenMap.get(String(role.id)) || []).map(renderNode),
    });

    return (childrenMap.get(null) || []).map(renderNode);
  }, [newRoleName, roles]);

  const getModulePerms = (moduleId: string) => {
    const merged = mergePermissionsWithDefaults(permissions, defaultPermissions);
    return merged[moduleId] || { view: true, edit: true, delete: true, fields: {} };
  };

  const getPermissionFieldItems = (moduleId: string, fields: ReadonlyArray<{ key: string; label: string }>): PermissionFieldItem[] => {
    const moduleDef = MODULES[moduleId];
    const items = new Map<string, PermissionFieldItem>();
    const fallbackLabelMap = new Map(fields.map((field) => [field.key, field.label]));
    const pushItem = (
      key: string,
      label: string | undefined,
      group: PermissionFieldItem['group']
    ) => {
      const normalizedKey = String(key || '').trim();
      if (!normalizedKey) return;
      items.set(normalizedKey, {
        key: normalizedKey,
        label: String(label || fallbackLabelMap.get(normalizedKey) || normalizedKey).trim() || normalizedKey,
        group,
      });
    };

    (moduleDef?.fields || []).forEach((field: any) => {
      const nature = String(field?.nature || '').trim();
      let group: PermissionFieldItem['group'] = 'standard';
      if (!nature) {
        group = 'custom';
      } else if (nature === FieldNature.SYSTEM) {
        group = 'system';
      } else {
        group = 'standard';
      }
      pushItem(String(field?.key || ''), field?.labels?.fa || field?.key, group);
    });

    (moduleDef?.blocks || []).forEach((block: any) => {
      const blockId = String(block?.id || '').trim();
      const blockLabel = block?.titles?.fa || blockId;
      if (!blockId) return;
      pushItem(blockId, `بخش: ${blockLabel}`, 'structure');
      (block?.tableColumns || []).forEach((column: any) => {
        const columnKey = String(column?.key || '').trim();
        if (!columnKey) return;
        pushItem(columnKey, column?.title || columnKey, 'structure');
        pushItem(`${blockId}.${columnKey}`, `${blockLabel}: ${column?.title || columnKey}`, 'structure');
      });
    });

    (moduleDef?.actionButtons || []).forEach((action: any) => {
      const actionId = String(action?.id || '').trim();
      if (!actionId) return;
      pushItem(`__action_${actionId}`, `عملیات: ${action?.label || actionId}`, 'action');
    });

    fields.forEach((field) => {
      const normalizedKey = String(field?.key || '').trim();
      if (!normalizedKey || items.has(normalizedKey)) return;
      const group = normalizedKey.startsWith('__action_')
        ? 'action'
        : (normalizedKey.startsWith('__') || normalizedKey.includes('.'))
          ? 'structure'
          : 'custom';
      pushItem(normalizedKey, field.label, group);
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
    const groupedFields = FIELD_GROUP_ORDER
      .map((groupKey) => {
        const items = getPermissionFieldItems(moduleId, fields).filter((field) => {
          if (field.group !== groupKey) return false;
          if (!searchValue) return true;
          const haystack = `${field.label} ${field.key}`.toLocaleLowerCase('fa');
          return haystack.includes(searchValue);
        });
        return { key: groupKey, label: FIELD_GROUP_LABELS[groupKey], items };
      })
      .filter((group) => group.items.length > 0);
    return (
      <div className="space-y-4">
        {fields.length > 8 ? (
          <Input
            value={fieldSearchByModule[moduleId] || ''}
            onChange={(event) => {
              const nextValue = String(event.target.value || '');
              setFieldSearchByModule((prev) => ({ ...prev, [moduleId]: nextValue }));
            }}
            placeholder="جستجوی فیلد یا بخش..."
            className="dark:bg-[#303030] dark:border-gray-700 dark:text-white"
          />
        ) : null}
        {groupedFields.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="فیلدی برای این جستجو پیدا نشد." />
        ) : null}
        {groupedFields.map((group) => (
          <div key={`${moduleId}-${group.key}`} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{group.label}</span>
              <span className="text-[11px] text-gray-400 dark:text-gray-500">{group.items.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {group.items.map((field) => (
                <div
                  key={field.key}
                  className="flex items-center gap-2 text-sm bg-gray-50 dark:bg-white/5 p-2 rounded border border-transparent dark:border-gray-800"
                >
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

  function stopTreeAction(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.blur();
    }
  }

  return (
    <div className="flex flex-col md:flex-row gap-6 h-[70vh]">
      <div className="w-full md:w-1/3 bg-gray-50 dark:bg-[#202020] border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex flex-col">
        <div className="mb-4">
          <Input
            placeholder="نام جایگاه جدید..."
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            className="mb-2 dark:bg-[#303030] dark:border-gray-700 dark:text-white"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => handleAddRole(null)}
            className="bg-leather-600 border-none"
            disabled={!newRoleName.trim()}
          >
            افزودن مدیر سطح
          </Button>
          <Button
            icon={<PlusOutlined />}
            onClick={() => handleAddRole(selectedRoleId)}
            disabled={!newRoleName.trim() || !selectedRoleId}
          >
            افزودن بعنوان زیرمجموعه
          </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {roles.length > 0 ? (
            <Tree
              className="bg-transparent dark:text-gray-300"
              treeData={treeData}
              motion={null}
              expandedKeys={expandedKeys}
              selectedKeys={selectedRoleId ? [selectedRoleId] : []}
              onExpand={(keys) => setExpandedKeys(keys)}
              onSelect={(keys) => setSelectedRoleId(keys[0] as string)}
              blockNode
            />
          ) : (
            <Empty description={<span className="text-gray-400">هنوز جایگاهی تعریف نشده</span>} />
          )}
        </div>
      </div>

      <div className="w-full md:w-2/3 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-xl p-6 flex flex-col">
        {selectedRoleId ? (
          <>
            <div className="flex justify-between items-center mb-6 border-b border-gray-100 dark:border-gray-800 pb-4">
              <h3 className="text-lg font-bold m-0 flex items-center gap-2 text-gray-800 dark:text-white">
                <LockOutlined className="text-leather-600" />
                دسترسی های جایگاه:
                <span className="text-leather-600">
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
                ذخیره دسترسی ها
              </Button>
            </div>

             <div className="mb-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
              <Input
                value={selectedRoleTitle}
                onChange={(e) => setSelectedRoleTitle(e.target.value)}
                placeholder="عنوان نمایشی نقش (فارسی)"
                className="dark:bg-[#303030] dark:border-gray-700 dark:text-white"
              />
              <Button onClick={handleUpdateRoleTitle} icon={<TeamOutlined />}>
                ذخیره عنوان
              </Button>
            </div>

            <div className="mb-5 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                افزودن، حذف و جابه‌جایی ساختار جایگاه‌ها از روی خود ردیف‌های درخت انجام می‌شود.
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2">
              <div className="mb-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-white/5 p-4">
                  <div className="mb-1 text-sm font-bold text-gray-800 dark:text-gray-100">ماژول های پر استفاده و افزودن سریع این نقش</div>
                  <div className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                  سه ماژول اول در فوتر نسخه موبایل نمایش داده می‌شوند. تا ۸ ماژول برای افزودن سریع داشبورد قابل تعریف است. پیش‌فرض‌های تکمیلی این نقش شامل تردد، مرخصی و ماموریت هستند.
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
              <Collapse defaultActiveKey={[Object.values(MODULES)[0]?.id || 'products']} className="dark:bg-transparent dark:border-gray-800">
                {Object.values(MODULES).filter((module) => !isSaasAdminModuleId(module.id)).map((module) => {
                  const modPerms = getModulePerms(module.id);
                  const fields = collectModulePermissionFields(module);
                  const disabled = modPerms.view === false;
                  return (
                    <Panel
                      key={module.id}
                      className="dark:border-gray-800"
                      header={
                        <div className="flex items-center justify-between w-full dark:text-gray-200">
                          <span className="font-bold">{module.titles.fa}</span>
                          <div className="flex gap-4 text-xs" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              className="dark:text-gray-400"
                              checked={modPerms.view !== false}
                              onChange={(e) => handlePermissionChange(module.id, 'view', undefined, e.target.checked)}
                            >
                              مشاهده
                            </Checkbox>
                            <Checkbox
                              className="dark:text-gray-400"
                              checked={modPerms.edit !== false}
                              disabled={modPerms.view === false}
                              onChange={(e) => handlePermissionChange(module.id, 'edit', undefined, e.target.checked)}
                            >
                              ویرایش/ایجاد
                            </Checkbox>
                            <Checkbox
                              className="dark:text-gray-400"
                              checked={modPerms.delete !== false}
                              disabled={modPerms.view === false}
                              onChange={(e) => handlePermissionChange(module.id, 'delete', undefined, e.target.checked)}
                            >
                              حذف
                            </Checkbox>
                          </div>
                        </div>
                      }
                    >
                      <div className="pl-6 pt-2">
                        <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">
                          نمایش رکوردها
                        </Divider>
                        <Radio.Group
                          value={modPerms.record_scope || 'all'}
                          onChange={(e) => handlePermissionChange(module.id, 'scope', undefined, e.target.value)}
                          className="mb-5 flex flex-col gap-2"
                        >
                          <Radio value="all">مشاهده همه رکوردها</Radio>
                          <Radio value="own">فقط مشاهده رکوردهای به نام شخص</Radio>
                          <Radio value="team">فقط مشاهده رکوردهای به نام تیم (جایگاه)</Radio>
                          <Radio value="subtree">مشاهده رکوردهای افراد زیرمجموعه</Radio>
                        </Radio.Group>
                        <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">
                          دسترسی به فیلدها و جداول
                        </Divider>
                        {renderFieldSwitches(module.id, fields, disabled)}
                      </div>
                    </Panel>
                  );
                })}

                <Panel
                  key={SETTINGS_PERMISSION_KEY}
                  className="dark:border-gray-800"
                  header={
                    <div className="flex items-center justify-between w-full dark:text-gray-200">
                      <span className="font-bold">تنظیمات</span>
                      <div className="flex gap-4 text-xs" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(SETTINGS_PERMISSION_KEY).view !== false}
                          onChange={(e) =>
                            handlePermissionChange(SETTINGS_PERMISSION_KEY, 'view', undefined, e.target.checked)
                          }
                        >
                          مشاهده
                        </Checkbox>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(SETTINGS_PERMISSION_KEY).edit !== false}
                          disabled={getModulePerms(SETTINGS_PERMISSION_KEY).view === false}
                          onChange={(e) =>
                            handlePermissionChange(SETTINGS_PERMISSION_KEY, 'edit', undefined, e.target.checked)
                          }
                        >
                          ویرایش/ایجاد
                        </Checkbox>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(SETTINGS_PERMISSION_KEY).delete !== false}
                          disabled={getModulePerms(SETTINGS_PERMISSION_KEY).view === false}
                          onChange={(e) =>
                            handlePermissionChange(SETTINGS_PERMISSION_KEY, 'delete', undefined, e.target.checked)
                          }
                        >
                          حذف
                        </Checkbox>
                      </div>
                    </div>
                  }
                >
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">
                      دسترسی تب های تنظیمات
                    </Divider>
                    {renderFieldSwitches(
                      SETTINGS_PERMISSION_KEY,
                      SETTINGS_TAB_PERMISSIONS,
                      getModulePerms(SETTINGS_PERMISSION_KEY).view === false
                    )}
                  </div>
                </Panel>

                <Panel
                  key={DASHBOARD_PERMISSION_KEY}
                  className="dark:border-gray-800"
                  header={
                    <div className="flex items-center justify-between w-full dark:text-gray-200">
                      <span className="font-bold">داشبورد</span>
                    </div>
                  }
                >
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">
                      دسترسی ویجت های داشبورد
                    </Divider>
                    {renderFieldSwitches(
                      DASHBOARD_PERMISSION_KEY,
                      DASHBOARD_WIDGET_PERMISSIONS,
                      getModulePerms(DASHBOARD_PERMISSION_KEY).view === false
                    )}
                  </div>
                </Panel>

                <Panel
                  key={WORKFLOWS_PERMISSION_KEY}
                  className="dark:border-gray-800"
                  header={
                    <div className="flex items-center justify-between w-full dark:text-gray-200">
                      <span className="font-bold">گردش کارها</span>
                      <div className="flex gap-4 text-xs" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(WORKFLOWS_PERMISSION_KEY).view !== false}
                          onChange={(e) =>
                            handlePermissionChange(
                              WORKFLOWS_PERMISSION_KEY,
                              'view',
                              undefined,
                              e.target.checked
                            )
                          }
                        >
                          مشاهده
                        </Checkbox>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(WORKFLOWS_PERMISSION_KEY).edit !== false}
                          disabled={getModulePerms(WORKFLOWS_PERMISSION_KEY).view === false}
                          onChange={(e) =>
                            handlePermissionChange(
                              WORKFLOWS_PERMISSION_KEY,
                              'edit',
                              undefined,
                              e.target.checked
                            )
                          }
                        >
                          ویرایش/ایجاد
                        </Checkbox>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(WORKFLOWS_PERMISSION_KEY).delete !== false}
                          disabled={getModulePerms(WORKFLOWS_PERMISSION_KEY).view === false}
                          onChange={(e) =>
                            handlePermissionChange(
                              WORKFLOWS_PERMISSION_KEY,
                              'delete',
                              undefined,
                              e.target.checked
                            )
                          }
                        >
                          حذف
                        </Checkbox>
                      </div>
                    </div>
                  }
                >
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">
                      دسترسی بخش‌های گردش کار
                    </Divider>
                    {renderFieldSwitches(
                      WORKFLOWS_PERMISSION_KEY,
                      WORKFLOWS_PERMISSION_FIELDS,
                      getModulePerms(WORKFLOWS_PERMISSION_KEY).view === false
                    )}
                  </div>
                </Panel>

                <Panel
                  key={GOALS_PERMISSION_KEY}
                  className="dark:border-gray-800"
                  header={
                    <div className="flex items-center justify-between w-full dark:text-gray-200">
                      <span className="font-bold">هدف‌گذاری</span>
                      <div className="flex gap-4 text-xs" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(GOALS_PERMISSION_KEY).view !== false}
                          onChange={(e) =>
                            handlePermissionChange(
                              GOALS_PERMISSION_KEY,
                              'view',
                              undefined,
                              e.target.checked
                            )
                          }
                        >
                          مشاهده
                        </Checkbox>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(GOALS_PERMISSION_KEY).edit !== false}
                          disabled={getModulePerms(GOALS_PERMISSION_KEY).view === false}
                          onChange={(e) =>
                            handlePermissionChange(
                              GOALS_PERMISSION_KEY,
                              'edit',
                              undefined,
                              e.target.checked
                            )
                          }
                        >
                          ویرایش/ایجاد
                        </Checkbox>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(GOALS_PERMISSION_KEY).delete !== false}
                          disabled={getModulePerms(GOALS_PERMISSION_KEY).view === false}
                          onChange={(e) =>
                            handlePermissionChange(
                              GOALS_PERMISSION_KEY,
                              'delete',
                              undefined,
                              e.target.checked
                            )
                          }
                        >
                          حذف
                        </Checkbox>
                      </div>
                    </div>
                  }
                >
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">
                      دسترسی بخش‌های هدف‌گذاری
                    </Divider>
                    {renderFieldSwitches(
                      GOALS_PERMISSION_KEY,
                      GOALS_PERMISSION_FIELDS,
                      getModulePerms(GOALS_PERMISSION_KEY).view === false
                    )}
                  </div>
                </Panel>

                <Panel
                  key={FILES_PERMISSION_KEY}
                  className="dark:border-gray-800"
                  header={
                    <div className="flex items-center justify-between w-full dark:text-gray-200">
                      <span className="font-bold">فایل‌ها</span>
                      <div className="flex gap-4 text-xs" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(FILES_PERMISSION_KEY).view !== false}
                          onChange={(e) =>
                            handlePermissionChange(FILES_PERMISSION_KEY, 'view', undefined, e.target.checked)
                          }
                        >
                          مشاهده
                        </Checkbox>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(FILES_PERMISSION_KEY).edit !== false}
                          disabled={getModulePerms(FILES_PERMISSION_KEY).view === false}
                          onChange={(e) =>
                            handlePermissionChange(FILES_PERMISSION_KEY, 'edit', undefined, e.target.checked)
                          }
                        >
                          ویرایش/ایجاد
                        </Checkbox>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(FILES_PERMISSION_KEY).delete !== false}
                          disabled={getModulePerms(FILES_PERMISSION_KEY).view === false}
                          onChange={(e) =>
                            handlePermissionChange(FILES_PERMISSION_KEY, 'delete', undefined, e.target.checked)
                          }
                        >
                          حذف
                        </Checkbox>
                      </div>
                    </div>
                  }
                >
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">
                      دسترسی بخش‌های فایل
                    </Divider>
                    {renderFieldSwitches(
                      FILES_PERMISSION_KEY,
                      FILES_PERMISSION_FIELDS,
                      getModulePerms(FILES_PERMISSION_KEY).view === false
                    )}
                  </div>
                </Panel>

                <Panel
                  key={ACCOUNTING_PERMISSION_KEY}
                  className="dark:border-gray-800"
                  header={
                    <div className="flex items-center justify-between w-full dark:text-gray-200">
                      <span className="font-bold">حسابداری</span>
                      <div className="flex gap-4 text-xs" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(ACCOUNTING_PERMISSION_KEY).view !== false}
                          onChange={(e) =>
                            handlePermissionChange(
                              ACCOUNTING_PERMISSION_KEY,
                              'view',
                              undefined,
                              e.target.checked
                            )
                          }
                        >
                          مشاهده
                        </Checkbox>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(ACCOUNTING_PERMISSION_KEY).edit !== false}
                          disabled={getModulePerms(ACCOUNTING_PERMISSION_KEY).view === false}
                          onChange={(e) =>
                            handlePermissionChange(
                              ACCOUNTING_PERMISSION_KEY,
                              'edit',
                              undefined,
                              e.target.checked
                            )
                          }
                        >
                          ویرایش/ایجاد
                        </Checkbox>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(ACCOUNTING_PERMISSION_KEY).delete !== false}
                          disabled={getModulePerms(ACCOUNTING_PERMISSION_KEY).view === false}
                          onChange={(e) =>
                            handlePermissionChange(
                              ACCOUNTING_PERMISSION_KEY,
                              'delete',
                              undefined,
                              e.target.checked
                            )
                          }
                        >
                          حذف
                        </Checkbox>
                      </div>
                    </div>
                  }
                >
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">
                      دسترسی بخش‌های حسابداری
                    </Divider>
                    {renderFieldSwitches(
                      ACCOUNTING_PERMISSION_KEY,
                      ACCOUNTING_PERMISSION_FIELDS,
                      getModulePerms(ACCOUNTING_PERMISSION_KEY).view === false
                    )}
                  </div>
                </Panel>

                <Panel
                  key={REPORTS_PERMISSION_KEY}
                  className="dark:border-gray-800"
                  header={
                    <div className="flex items-center justify-between w-full dark:text-gray-200">
                      <span className="font-bold">گزارشات</span>
                      <div className="flex gap-4 text-xs" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(REPORTS_PERMISSION_KEY).view !== false}
                          onChange={(e) =>
                            handlePermissionChange(
                              REPORTS_PERMISSION_KEY,
                              'view',
                              undefined,
                              e.target.checked
                            )
                          }
                        >
                          مشاهده
                        </Checkbox>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(REPORTS_PERMISSION_KEY).edit !== false}
                          disabled={getModulePerms(REPORTS_PERMISSION_KEY).view === false}
                          onChange={(e) =>
                            handlePermissionChange(
                              REPORTS_PERMISSION_KEY,
                              'edit',
                              undefined,
                              e.target.checked
                            )
                          }
                        >
                          ویرایش/ایجاد
                        </Checkbox>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(REPORTS_PERMISSION_KEY).delete !== false}
                          disabled={getModulePerms(REPORTS_PERMISSION_KEY).view === false}
                          onChange={(e) =>
                            handlePermissionChange(
                              REPORTS_PERMISSION_KEY,
                              'delete',
                              undefined,
                              e.target.checked
                            )
                          }
                        >
                          حذف
                        </Checkbox>
                      </div>
                    </div>
                  }
                >
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">
                      دسترسی بخش‌های گزارشات
                    </Divider>
                    {renderFieldSwitches(
                      REPORTS_PERMISSION_KEY,
                      REPORTS_PERMISSION_FIELDS,
                      getModulePerms(REPORTS_PERMISSION_KEY).view === false
                    )}
                  </div>
                </Panel>

                <Panel
                  key={VOIP_PERMISSION_KEY}
                  className="dark:border-gray-800"
                  header={
                    <div className="flex items-center justify-between w-full dark:text-gray-200">
                      <span className="font-bold">VoIP</span>
                      <div className="flex gap-4 text-xs" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(VOIP_PERMISSION_KEY).view !== false}
                          onChange={(e) =>
                            handlePermissionChange(
                              VOIP_PERMISSION_KEY,
                              'view',
                              undefined,
                              e.target.checked
                            )
                          }
                        >
                          مشاهده
                        </Checkbox>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(VOIP_PERMISSION_KEY).edit !== false}
                          disabled={getModulePerms(VOIP_PERMISSION_KEY).view === false}
                          onChange={(e) =>
                            handlePermissionChange(
                              VOIP_PERMISSION_KEY,
                              'edit',
                              undefined,
                              e.target.checked
                            )
                          }
                        >
                          ویرایش/ایجاد
                        </Checkbox>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(VOIP_PERMISSION_KEY).delete !== false}
                          disabled={getModulePerms(VOIP_PERMISSION_KEY).view === false}
                          onChange={(e) =>
                            handlePermissionChange(
                              VOIP_PERMISSION_KEY,
                              'delete',
                              undefined,
                              e.target.checked
                            )
                          }
                        >
                          حذف
                        </Checkbox>
                      </div>
                    </div>
                  }
                >
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">
                      دسترسی‌های اعلان تماس
                    </Divider>
                    {renderFieldSwitches(
                      VOIP_PERMISSION_KEY,
                      VOIP_PERMISSION_FIELDS,
                      getModulePerms(VOIP_PERMISSION_KEY).view === false
                    )}
                  </div>
                </Panel>

                <Panel
                  key={STORIES_PERMISSION_KEY}
                  className="dark:border-gray-800"
                  header={
                    <div className="flex items-center justify-between w-full dark:text-gray-200">
                      <span className="font-bold">استوری‌ها</span>
                      <div className="flex gap-4 text-xs" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(STORIES_PERMISSION_KEY).view !== false}
                          onChange={(e) =>
                            handlePermissionChange(
                              STORIES_PERMISSION_KEY,
                              'view',
                              undefined,
                              e.target.checked
                            )
                          }
                        >
                          مشاهده
                        </Checkbox>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(STORIES_PERMISSION_KEY).edit !== false}
                          disabled={getModulePerms(STORIES_PERMISSION_KEY).view === false}
                          onChange={(e) =>
                            handlePermissionChange(
                              STORIES_PERMISSION_KEY,
                              'edit',
                              undefined,
                              e.target.checked
                            )
                          }
                        >
                          ویرایش/ایجاد
                        </Checkbox>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(STORIES_PERMISSION_KEY).delete !== false}
                          disabled={getModulePerms(STORIES_PERMISSION_KEY).view === false}
                          onChange={(e) =>
                            handlePermissionChange(
                              STORIES_PERMISSION_KEY,
                              'delete',
                              undefined,
                              e.target.checked
                            )
                          }
                        >
                          حذف
                        </Checkbox>
                      </div>
                    </div>
                  }
                >
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">
                      دسترسی‌های انتشار و مدیریت
                    </Divider>
                    {renderFieldSwitches(
                      STORIES_PERMISSION_KEY,
                      STORIES_PERMISSION_FIELDS,
                      getModulePerms(STORIES_PERMISSION_KEY).view === false
                    )}
                  </div>
                </Panel>

                <Panel
                  key={SAAS_ADMIN_PERMISSION_KEY}
                  className="dark:border-gray-800"
                  header={
                    <div className="flex items-center justify-between w-full dark:text-gray-200">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">تازه سیستم — مدیریت SaaS</span>
                        <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 rounded px-1.5 py-0.5 font-mono">فقط داخلی</span>
                      </div>
                      <div className="flex gap-4 text-xs" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(SAAS_ADMIN_PERMISSION_KEY).view === true}
                          onChange={(e) =>
                            handlePermissionChange(
                              SAAS_ADMIN_PERMISSION_KEY,
                              'view',
                              undefined,
                              e.target.checked
                            )
                          }
                        >
                          مشاهده
                        </Checkbox>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(SAAS_ADMIN_PERMISSION_KEY).edit === true}
                          disabled={getModulePerms(SAAS_ADMIN_PERMISSION_KEY).view !== true}
                          onChange={(e) =>
                            handlePermissionChange(
                              SAAS_ADMIN_PERMISSION_KEY,
                              'edit',
                              undefined,
                              e.target.checked
                            )
                          }
                        >
                          ویرایش
                        </Checkbox>
                      </div>
                    </div>
                  }
                >
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">
                      دسترسی‌های اضافی
                    </Divider>
                    {renderFieldSwitches(
                      SAAS_ADMIN_PERMISSION_KEY,
                      SAAS_ADMIN_PERMISSION_FIELDS,
                      getModulePerms(SAAS_ADMIN_PERMISSION_KEY).view !== true
                    )}
                  </div>
                </Panel>
              </Collapse>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <TeamOutlined className="text-4xl mb-2 opacity-30" />
            <p>یک جایگاه سازمانی را از لیست سمت راست انتخاب کنید</p>
          </div>
        )}
      </div>
      <style>{`
        .dark .ant-collapse-content { background-color: #1f1f1f; color: #ddd; border-color: #303030; }
        .dark .ant-collapse-header { color: #ddd !important; }
        .dark .ant-tree-node-content-wrapper:hover { background-color: #303030 !important; }
        .dark .ant-tree-node-selected { background-color: #2b1d11 !important; }
      `}</style>
    </div>
  );
};

export default RolesTab;
