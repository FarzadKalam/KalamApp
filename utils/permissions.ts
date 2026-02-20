import { BlockType, type ModuleDefinition } from '../types';

export type ModulePermissionConfig = {
  view?: boolean;
  edit?: boolean;
  delete?: boolean;
  fields?: Record<string, boolean>;
};

export type PermissionMap = Record<string, ModulePermissionConfig>;

export const SETTINGS_PERMISSION_KEY = '__settings_tabs';
export const DASHBOARD_PERMISSION_KEY = '__dashboard_widgets';
export const WORKFLOWS_PERMISSION_KEY = '__workflows';

export const SETTINGS_TAB_PERMISSIONS = [
  { key: 'company', label: 'مشخصات شرکت' },
  { key: 'users', label: 'مدیریت کاربران' },
  { key: 'roles', label: 'چارت سازمانی' },
  { key: 'formulas', label: 'فرمول های محاسباتی' },
  { key: 'connections', label: 'اتصالات' },
  { key: 'workflows', label: 'گردش کارها' },
];

export const DASHBOARD_WIDGET_PERMISSIONS = [
  { key: 'quick_add', label: 'افزودن سریع' },
  { key: 'kpi_total_sales', label: 'کارت مجموع فروش' },
  { key: 'kpi_in_production', label: 'کارت سفارشات در حال تولید' },
  { key: 'kpi_total_products', label: 'کارت تعداد محصولات' },
  { key: 'kpi_monthly_growth', label: 'کارت رشد ماهانه' },
  { key: 'chart_production_status', label: 'نمودار وضعیت سفارشات تولید' },
  { key: 'chart_monthly_sales', label: 'نمودار فروش ماهانه' },
  { key: 'table_latest_invoices', label: 'جدول آخرین فاکتورها' },
  { key: 'table_latest_production_orders', label: 'جدول آخرین سفارشات تولید' },
  { key: 'timeline_recent_activity', label: 'تایم لاین تغییرات اخیر' },
  { key: 'top_selling_products', label: 'بخش پرفروش ترین محصولات' },
];

export const WORKFLOWS_PERMISSION_FIELDS = [
  { key: 'settings_tab', label: 'نمایش در تب تنظیمات' },
  { key: 'module_list_button', label: 'نمایش در بالای لیست ماژول ها' },
];

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
      fields: createFieldsMap(collectModulePermissionFields(module)),
    };
  });

  defaults[SETTINGS_PERMISSION_KEY] = {
    view: true,
    edit: true,
    delete: true,
    fields: createFieldsMap(SETTINGS_TAB_PERMISSIONS),
  };

  defaults[DASHBOARD_PERMISSION_KEY] = {
    view: true,
    edit: true,
    delete: true,
    fields: createFieldsMap(DASHBOARD_WIDGET_PERMISSIONS),
  };

  defaults[WORKFLOWS_PERMISSION_KEY] = {
    view: true,
    edit: true,
    delete: true,
    fields: createFieldsMap(WORKFLOWS_PERMISSION_FIELDS),
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

export const canAccessAssignedRecord = (
  record: any,
  currentUserId: string | null,
  currentUserRoleId: string | null
) => {
  if (!record || !currentUserId) return false;
  if (record?.assignee_type === 'user' && record?.assignee_id === currentUserId) return true;
  if (record?.assignee_type === 'role' && currentUserRoleId && record?.assignee_id === currentUserRoleId) return true;
  return false;
};
