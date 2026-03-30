import { BlockType, type ModuleDefinition } from '../types';
import { getResolvedAssigneeId } from './assigneeValue';
import { clearSessionBootstrapCache, fetchSessionBootstrap } from './sessionCache';

export type ModulePermissionConfig = {
  view?: boolean;
  edit?: boolean;
  delete?: boolean;
  record_scope?: 'all' | 'own' | 'team';
  fields?: Record<string, any>;
};

export type PermissionMap = Record<string, ModulePermissionConfig>;
export type CurrentUserRoleContext = {
  userId: string | null;
  roleId: string | null;
  permissions: PermissionMap | null;
};

export const SETTINGS_PERMISSION_KEY = '__settings_tabs';
export const DASHBOARD_PERMISSION_KEY = '__dashboard_widgets';
export const WORKFLOWS_PERMISSION_KEY = '__workflows';
export const FILES_PERMISSION_KEY = '__files_access';
export const ACCOUNTING_PERMISSION_KEY = '__accounting';
export const MOBILE_FOOTER_PERMISSION_KEY = '__mobile_footer';
export const READY_TEXTS_PERMISSION_FIELDS = [
  { key: '__ready_texts_view', label: 'متن‌های آماده: مشاهده' },
  { key: '__ready_texts_add', label: 'متن‌های آماده: افزودن' },
  { key: '__ready_texts_edit', label: 'متن‌های آماده: ویرایش' },
  { key: '__ready_texts_delete', label: 'متن‌های آماده: حذف' },
] as const;

export const SETTINGS_TAB_PERMISSIONS = [
  { key: 'company', label: 'مشخصات شرکت' },
  { key: 'users', label: 'مدیریت کاربران' },
  { key: 'roles', label: 'چارت سازمانی' },
  { key: 'module_settings', label: 'تنظیمات ماژول ها' },
  { key: 'formulas', label: 'فرمول های محاسباتی' },
  { key: 'connections', label: 'اتصالات' },
  { key: 'customer_leveling', label: 'تنظیمات سطح بندی' },
  { key: 'workflows', label: 'گردش کارها' },
];

export const DASHBOARD_WIDGET_PERMISSIONS = [
  { key: 'quick_add', label: 'افزودن سریع' },
  { key: 'summary_cards', label: 'کارت‌های آماری' },
  { key: 'recent_lists', label: 'جدول‌های آخرین رکوردها' },
];

export const WORKFLOWS_PERMISSION_FIELDS = [
  { key: 'settings_tab', label: 'نمایش در تب تنظیمات' },
  { key: 'module_list_button', label: 'نمایش در بالای لیست ماژول ها' },
];

export const FILES_PERMISSION_FIELDS = [
  { key: 'gallery_page', label: 'گالری فایل‌ها' },
  { key: 'record_files_manager', label: 'مدیریت فایل‌ها' },
];

export const ACCOUNTING_PERMISSION_FIELDS = [
  { key: 'dashboard_page', label: 'نمایش داشبورد حسابداری' },
  { key: 'overview_cards', label: 'کارت های خلاصه مالی' },
  { key: 'operation_links', label: 'لینک های عملیات ضروری' },
  { key: 'reports_hub', label: 'گزارشات حسابداری' },
  { key: 'settings_links', label: 'لینک های تنظیمات حسابداری' },
  { key: 'journal_entry_lines_view', label: 'مشاهده ردیف های سند حسابداری' },
  { key: 'journal_entry_lines_edit', label: 'ویرایش/ایجاد ردیف های سند حسابداری' },
  { key: 'journal_entry_lines_delete', label: 'حذف ردیف های سند حسابداری' },
];

export const MOBILE_FOOTER_DEFAULT_MODULES = ['products', 'production_orders', 'invoices', 'customers'] as const;
export const PREFERRED_ROLE_MODULE_SLOT_KEYS = ['slot_1', 'slot_2', 'slot_3', 'slot_4'] as const;
export const MOBILE_FOOTER_PERMISSION_FIELDS = [
  { key: 'slot_1', label: 'ماژول پر استفاده اول' },
  { key: 'slot_2', label: 'ماژول پر استفاده دوم' },
  { key: 'slot_3', label: 'ماژول پر استفاده سوم' },
  { key: 'slot_4', label: 'ماژول پر استفاده چهارم' },
] as const;

const ensureField = (map: Map<string, string>, key: string, label: string) => {
  if (!key) return;
  if (!map.has(key)) map.set(key, label || key);
};

export const collectModulePermissionFields = (module: ModuleDefinition) => {
  const fieldMap = new Map<string, string>();

  (module.fields || []).forEach((field: any) => {
    ensureField(fieldMap, String(field.key || ''), field?.labels?.fa || field.key);
  });

  (module.blocks || []).forEach((block: any) => {
    const blockId = String(block?.id || '');
    const blockTitle = block?.titles?.fa || blockId || 'بخش';
    if (!blockId) return;

    const prefix =
      block.type === BlockType.GRID_TABLE || block.type === BlockType.TABLE ? 'جدول' : 'بخش';
    ensureField(fieldMap, blockId, `${prefix}: ${blockTitle}`);

    (block.tableColumns || []).forEach((col: any) => {
      const colKey = String(col?.key || '');
      const colTitle = col?.title || colKey;
      if (!colKey) return;
      ensureField(fieldMap, colKey, colTitle);
      ensureField(fieldMap, `${blockId}.${colKey}`, `${blockTitle}: ${colTitle}`);
    });
  });

  (module.actionButtons || []).forEach((action: any) => {
    const actionId = String(action?.id || '');
    if (!actionId) return;
    ensureField(fieldMap, `__action_${actionId}`, `عملیات: ${action?.label || actionId}`);
  });

  if (module.id === 'production_orders') {
    ensureField(fieldMap, '__action_start_production', 'عملیات: شروع تولید');
    ensureField(fieldMap, '__action_stop_production', 'عملیات: توقف تولید');
    ensureField(fieldMap, '__action_complete_production', 'عملیات: تکمیل تولید');
    ensureField(fieldMap, '__action_auto_name', 'عملیات: نامگذاری خودکار');
  }

  if (module.id === 'products') {
    ensureField(fieldMap, '__action_auto_name', 'عملیات: نامگذاری خودکار');
    ensureField(fieldMap, '__action_quick_stock_movement', 'عملیات: افزودن حواله');
  }

  if (module.id === 'shelves') {
    ensureField(fieldMap, '__action_quick_stock_movement', 'عملیات: افزودن حواله');
  }

  if (!fieldMap.has('assignee_id')) {
    ensureField(fieldMap, 'assignee_id', 'مسئول');
  }

  // Permission flag for opening module-level settings page.
  if (!fieldMap.has('__module_settings')) {
    ensureField(fieldMap, '__module_settings', 'تنظیمات ماژول');
  }

  READY_TEXTS_PERMISSION_FIELDS.forEach((item) => {
    ensureField(fieldMap, item.key, item.label);
  });

  return Array.from(fieldMap.entries()).map(([key, label]) => ({ key, label }));
};

const createFieldsMap = (items: Array<{ key: string }>) => {
  return items.reduce<Record<string, boolean>>((acc, item) => {
    acc[item.key] = true;
    return acc;
  }, {});
};

const mergeModulePermission = (base: ModulePermissionConfig, incoming?: ModulePermissionConfig) => {
  return {
    view: incoming?.view ?? base.view ?? true,
    edit: incoming?.edit ?? base.edit ?? true,
    delete: incoming?.delete ?? base.delete ?? true,
    record_scope:
      incoming?.record_scope ??
      (incoming?.view === false ? 'own' : (base.record_scope ?? 'all')),
    fields: {
      ...(base.fields || {}),
      ...(incoming?.fields || {}),
    },
  };
};

export const buildDefaultPermissions = (modules: Record<string, ModuleDefinition>): PermissionMap => {
  const defaults: PermissionMap = {};

  Object.values(modules).forEach((module) => {
    defaults[module.id] = {
      view: true,
      edit: true,
      delete: true,
      record_scope: 'all',
      fields: createFieldsMap(collectModulePermissionFields(module)),
    };
  });

  defaults[SETTINGS_PERMISSION_KEY] = {
    view: true,
    edit: true,
    delete: true,
    record_scope: 'all',
    fields: createFieldsMap(SETTINGS_TAB_PERMISSIONS),
  };

  defaults[DASHBOARD_PERMISSION_KEY] = {
    view: true,
    edit: true,
    delete: true,
    record_scope: 'all',
    fields: createFieldsMap(DASHBOARD_WIDGET_PERMISSIONS),
  };

  defaults[WORKFLOWS_PERMISSION_KEY] = {
    view: true,
    edit: true,
    delete: true,
    record_scope: 'all',
    fields: createFieldsMap(WORKFLOWS_PERMISSION_FIELDS),
  };

  defaults[FILES_PERMISSION_KEY] = {
    view: true,
    edit: true,
    delete: true,
    record_scope: 'all',
    fields: createFieldsMap(FILES_PERMISSION_FIELDS),
  };

  defaults[ACCOUNTING_PERMISSION_KEY] = {
    view: true,
    edit: true,
    delete: true,
    record_scope: 'all',
    fields: createFieldsMap(ACCOUNTING_PERMISSION_FIELDS),
  };

  defaults[MOBILE_FOOTER_PERMISSION_KEY] = {
    view: true,
    edit: true,
    delete: true,
    record_scope: 'all',
    fields: {
      slot_1: MOBILE_FOOTER_DEFAULT_MODULES[0],
      slot_2: MOBILE_FOOTER_DEFAULT_MODULES[1],
      slot_3: MOBILE_FOOTER_DEFAULT_MODULES[2],
      slot_4: MOBILE_FOOTER_DEFAULT_MODULES[3],
    },
  };

  return defaults;
};

export const mergePermissionsWithDefaults = (
  rawPermissions: PermissionMap | null | undefined,
  defaults: PermissionMap
): PermissionMap => {
  const merged: PermissionMap = {};
  const source = rawPermissions || {};
  const allKeys = new Set<string>([...Object.keys(defaults), ...Object.keys(source)]);

  allKeys.forEach((key) => {
    const base = defaults[key] || { view: true, edit: true, delete: true, fields: {} };
    merged[key] = mergeModulePermission(base, source[key]);
  });

  return merged;
};

export const resolvePreferredRoleModuleIds = (
  permissions: PermissionMap | null | undefined,
  modules: Record<string, ModuleDefinition>,
  limit = 4
) => {
  const fields = permissions?.[MOBILE_FOOTER_PERMISSION_KEY]?.fields || {};
  const visibleModules = Object.keys(modules).filter((moduleId) => permissions?.[moduleId]?.view !== false);
  const next: string[] = [];

  const pushUnique = (moduleId: string) => {
    if (!moduleId || !modules[moduleId] || !visibleModules.includes(moduleId) || next.includes(moduleId)) return;
    next.push(moduleId);
  };

  PREFERRED_ROLE_MODULE_SLOT_KEYS
    .map((key) => String(fields?.[key] || '').trim())
    .filter(Boolean)
    .forEach(pushUnique);

  MOBILE_FOOTER_DEFAULT_MODULES.forEach((moduleId) => pushUnique(String(moduleId)));
  visibleModules.forEach(pushUnique);

  return next.slice(0, limit);
};

export const canAccessAssignedRecord = (
  record: any,
  currentUserId: string | null,
  currentUserRoleId: string | null,
  recordScope: 'all' | 'own' | 'team' = 'all'
) => {
  if (recordScope === 'all') return true;
  if (!record) return false;
  const resolvedAssigneeId = getResolvedAssigneeId(record);
  if (recordScope === 'team') {
    return !!currentUserRoleId && record?.assignee_type === 'role' && resolvedAssigneeId === currentUserRoleId;
  }
  return !!currentUserId && record?.assignee_type === 'user' && resolvedAssigneeId === currentUserId;
};

const EMPTY_CURRENT_USER_ROLE_CONTEXT: CurrentUserRoleContext = {
  userId: null,
  roleId: null,
  permissions: null,
};

type CurrentUserRoleContextCacheStore = {
  currentUserRoleContextCache: Map<string, CurrentUserRoleContext>;
  currentUserRoleContextPromiseCache: Map<string, Promise<CurrentUserRoleContext>>;
};

const globalPermissionsCache = globalThis as typeof globalThis & {
  __kalamPermissionsCacheStore?: CurrentUserRoleContextCacheStore;
};

const permissionsCacheStore = globalPermissionsCache.__kalamPermissionsCacheStore || {
  currentUserRoleContextCache: new Map<string, CurrentUserRoleContext>(),
  currentUserRoleContextPromiseCache: new Map<string, Promise<CurrentUserRoleContext>>(),
};

globalPermissionsCache.__kalamPermissionsCacheStore = permissionsCacheStore;

const { currentUserRoleContextCache, currentUserRoleContextPromiseCache } = permissionsCacheStore;

export const clearCurrentUserRoleContextCache = (userId?: string | null) => {
  clearSessionBootstrapCache();
  if (userId) {
    const key = String(userId);
    currentUserRoleContextCache.delete(key);
    currentUserRoleContextPromiseCache.delete(key);
    return;
  }
  currentUserRoleContextCache.clear();
  currentUserRoleContextPromiseCache.clear();
};

export const fetchCurrentUserRoleContext = async (
  supabaseClient: any,
  options?: { force?: boolean }
): Promise<CurrentUserRoleContext> => {
  try {
    const snapshot = await fetchSessionBootstrap(supabaseClient, options);
    const user = snapshot.user;
    if (!user?.id) return EMPTY_CURRENT_USER_ROLE_CONTEXT;

    const cacheKey = String(user.id);
    if (!options?.force) {
      const cached = currentUserRoleContextCache.get(cacheKey);
      if (cached) return cached;

      const pending = currentUserRoleContextPromiseCache.get(cacheKey);
      if (pending) return pending;
    }

    const pending = (async (): Promise<CurrentUserRoleContext> => {
      if (!snapshot.roleId) {
        const result = { userId: user.id, roleId: null, permissions: null };
        currentUserRoleContextCache.set(cacheKey, result);
        return result;
      }

      const result = {
        userId: user.id,
        roleId: snapshot.roleId,
        permissions: (snapshot.permissions || null) as PermissionMap | null,
      };
      currentUserRoleContextCache.set(cacheKey, result);
      return result;
    })();

    currentUserRoleContextPromiseCache.set(cacheKey, pending);
    try {
      return await pending;
    } finally {
      currentUserRoleContextPromiseCache.delete(cacheKey);
    }
  } catch {
    return EMPTY_CURRENT_USER_ROLE_CONTEXT;
  }
};

export const resolveFilesAccessPermissions = (permissions: PermissionMap | null | undefined) => {
  const perm = permissions?.[FILES_PERMISSION_KEY] || {};
  const fields = perm.fields || {};
  const canViewRoot = perm.view !== false;
  const canEditRoot = perm.edit !== false;
  const canDeleteRoot = perm.delete !== false;

  const canViewGallery = canViewRoot && fields.gallery_page !== false;
  const canViewRecordFilesManager = canViewRoot && fields.record_files_manager !== false;

  return {
    canViewGallery,
    canEditGallery: canViewGallery && canEditRoot,
    canDeleteGallery: canViewGallery && canDeleteRoot,
    canViewRecordFilesManager,
    canEditRecordFilesManager: canViewRecordFilesManager && canEditRoot,
    canDeleteRecordFilesManager: canViewRecordFilesManager && canDeleteRoot,
  };
};

export const fetchCurrentUserRolePermissions = async (supabaseClient: any): Promise<PermissionMap | null> => {
  try {
    const context = await fetchCurrentUserRoleContext(supabaseClient);
    return context.permissions;
  } catch {
    return null;
  }
};

export const resolveReadyTextPermissions = (
  permissions: PermissionMap | null | undefined,
  moduleId?: string | null
) => {
  if (!moduleId) {
    return {
      canView: true,
      canAdd: true,
      canEdit: true,
      canDelete: true,
    };
  }

  const modPerm = permissions?.[moduleId] || {};
  const fields = modPerm.fields || {};
  const canViewRoot = modPerm.view !== false;
  const canEditRoot = modPerm.edit !== false;
  const canDeleteRoot = modPerm.delete !== false;

  const canView = canViewRoot && fields.__ready_texts_view !== false;
  return {
    canView,
    canAdd: canView && canEditRoot && fields.__ready_texts_add !== false,
    canEdit: canView && canEditRoot && fields.__ready_texts_edit !== false,
    canDelete: canView && canDeleteRoot && fields.__ready_texts_delete !== false,
  };
};
