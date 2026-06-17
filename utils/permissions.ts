import { BlockType, type ModuleDefinition } from '../types';
import { getResolvedAssigneeId } from './assigneeValue';
import { CUSTOMER_CLUB_PERMISSION_KEY } from './customerClub';
import { fetchAssigneeDirectory } from './referenceData';
import { clearSessionBootstrapCache, fetchSessionBootstrap } from './sessionCache';

export type RecordScope = 'all' | 'own' | 'team' | 'subtree';

export type ViewConditionItem = {
  id: string;
  field: string;
  operator: string;
  value?: any;
};

export type ViewConditionGroup = {
  logic?: 'and' | 'or';
  conditions?: ViewConditionItem[];
  conditions_all?: ViewConditionItem[] | null;
  conditions_any?: ViewConditionItem[] | null;
};

export type ModulePermissionConfig = {
  view?: boolean;
  edit?: boolean;
  delete?: boolean;
  record_scope?: RecordScope;
  view_conditions?: ViewConditionGroup;
  fields?: Record<string, any>;
};

export type PermissionMap = Record<string, ModulePermissionConfig>;
export type CurrentUserRoleContext = {
  userId: string | null;
  roleId: string | null;
  orgId: string | null;
  permissions: PermissionMap | null;
};

export type CurrentUserRecordAccessContext = CurrentUserRoleContext & {
  allowedRoleIds: string[];
  allowedUserIds: string[];
};

export const SETTINGS_PERMISSION_KEY = '__settings_tabs';
export const DASHBOARD_PERMISSION_KEY = '__dashboard_widgets';
export const WORKFLOWS_PERMISSION_KEY = '__workflows';
export const GOALS_PERMISSION_KEY = '__goals';
export const FILES_PERMISSION_KEY = '__files_access';
export const ACCOUNTING_PERMISSION_KEY = '__accounting';
export const REPORTS_PERMISSION_KEY = '__reports';
export const MOBILE_FOOTER_PERMISSION_KEY = '__mobile_footer';
export const VOIP_PERMISSION_KEY = '__voip';
export const STORIES_PERMISSION_KEY = '__stories';
export const SAAS_ADMIN_PERMISSION_KEY = '__saas_admin';
export const COMMUNICATIONS_PERMISSION_KEY = '__communications';
export { CUSTOMER_CLUB_PERMISSION_KEY };
export const SAAS_ADMIN_MODULE_IDS = ['saas_orgs', 'saas_demo_requests', 'saas_users', 'saas_user_announcements'] as const;
const SAAS_ADMIN_MODULE_ID_SET = new Set<string>(SAAS_ADMIN_MODULE_IDS);
export const isSaasAdminModuleId = (moduleId?: string | null) =>
  SAAS_ADMIN_MODULE_ID_SET.has(String(moduleId || '').trim());
export const SAAS_ADMIN_PERMISSION_FIELDS = [
  { key: 'demo_override', label: 'override حد دمو برای شماره‌ها' },
  { key: 'edit_orgs', label: 'ویرایش سازمان‌ها' },
  { key: 'edit_requests', label: 'ویرایش درخواست‌های دمو' },
  { key: 'edit_user_announcements', label: 'ویرایش اعلانات کاربران' },
  { key: 'publish_saas_story', label: 'انتشار استوری برای همه سازمان‌ها' },
  { key: 'publish_saas_admin_story', label: 'انتشار استوری برای مدیران سازمان‌ها' },
];
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
  { key: 'print_templates', label: 'قالب‌های پرینت' },
  { key: 'ai_knowledge', label: 'دانش سازمان' },
  { key: 'workflows', label: 'گردش کارها' },
];

export const PRINT_SIGNATURE_PERMISSION_FIELDS = [
  { key: 'ceo_signature', label: 'استفاده از امضای مدیرعامل در چاپ' },
] as const;

export const DASHBOARD_WIDGET_PERMISSIONS = [
  { key: 'quick_add', label: 'افزودن سریع' },
  { key: 'activity_calendar', label: 'تقویم فعالیت‌ها' },
  { key: 'reports_slider', label: 'گزارش‌های اسلایدی' },
  { key: 'our_processes', label: 'فرآیندهای ما' },
  { key: 'summary_cards', label: 'کارت‌های آماری' },
  { key: 'recent_lists', label: 'جدول‌های آخرین رکوردها' },
];

export const WORKFLOWS_PERMISSION_FIELDS = [
  { key: 'settings_tab', label: 'نمایش در تب تنظیمات' },
  { key: 'module_list_button', label: 'نمایش در بالای لیست ماژول ها' },
];

export const GOALS_PERMISSION_FIELDS = [
  { key: 'module_list_button', label: 'نمایش مدیریت هدف‌ها در لیست ماژول' },
  { key: 'module_list_cards', label: 'نمایش کارت‌های هدف در لیست ماژول' },
  { key: 'dashboard_widget', label: 'نمایش کارت‌های هدف در داشبورد' },
];

export const MODULE_GOAL_PERMISSION_FIELDS = [
  { key: '__goals_view', label: 'هدف‌های این ماژول: مشاهده' },
  { key: '__goals_create', label: 'هدف‌های این ماژول: ایجاد' },
  { key: '__goals_edit', label: 'هدف‌های این ماژول: ویرایش' },
] as const;

export const FILES_PERMISSION_FIELDS = [
  { key: 'gallery_page', label: 'صفحه مدیریت فایل‌ها' },
  { key: 'explorer_page', label: 'فایل منیجر' },
  { key: 'recycle_bin_page', label: 'سطل بازیافت' },
  { key: 'record_files_manager', label: 'مدیریت فایل‌ها' },
  { key: 'manage_manual_folders', label: 'ساخت/ویرایش پوشه‌های دستی' },
  { key: 'share_public_links', label: 'اشتراک‌گذاری لینک عمومی' },
];

export const ACCOUNTING_PERMISSION_FIELDS = [
  { key: 'dashboard_page', label: 'نمایش داشبورد حسابداری' },
  { key: 'cash_bank_page', label: 'نمایش نقد و بانک' },
  { key: 'overview_cards', label: 'کارت های خلاصه مالی' },
  { key: 'operation_links', label: 'لینک های عملیات ضروری' },
  { key: 'reports_hub', label: 'گزارشات حسابداری' },
  { key: 'settings_links', label: 'لینک های تنظیمات حسابداری' },
  { key: 'journal_entry_lines_view', label: 'مشاهده ردیف های سند حسابداری' },
  { key: 'journal_entry_lines_edit', label: 'ویرایش/ایجاد ردیف های سند حسابداری' },
  { key: 'journal_entry_lines_delete', label: 'حذف ردیف های سند حسابداری' },
];

export const REPORTS_PERMISSION_FIELDS = [
  { key: 'hub_page', label: 'صفحه گزارشات' },
  { key: 'builder_page', label: 'گزارش ساز' },
];

export const VOIP_PERMISSION_FIELDS = [
  { key: 'all_call_notifications', label: 'مشاهده اعلان همه تماس‌ها' },
];

export const COMMUNICATIONS_PERMISSION_FIELDS = [
  { key: 'panel_access', label: 'پنل سریع ارتباطات' },
  { key: 'workspace_access', label: 'فضای کامل پیام‌رسانی' },
  { key: 'send_internal', label: 'ارسال پیام داخلی' },
  { key: 'manage_groups', label: 'مدیریت گروه‌های گفتگو' },
  { key: 'use_bot_channels', label: 'کانال‌های بات' },
  { key: 'use_sms', label: 'پیامک' },
  { key: 'use_voip', label: 'تماس VoIP' },
  { key: 'view_system_feed', label: 'فید سیستم و اتوماسیون' },
  { key: 'audit_all_conversations', label: 'ممیزی همه گفتگوها' },
] as const;

export const CUSTOMER_CLUB_PERMISSION_FIELDS = [
  { key: 'rules', label: 'طرح‌های باشگاه مشتریان' },
  { key: 'discount_codes', label: 'کدهای تخفیف' },
  { key: 'credit_ledger', label: 'دفتر اعتبار مشتریان' },
  { key: 'leveling', label: 'سطح‌بندی مشتریان' },
] as const;

export const STORIES_PERMISSION_FIELDS = [
  { key: 'publish', label: 'انتشار استوری' },
  { key: 'edit_own', label: 'ویرایش استوری خود' },
  { key: 'delete_own', label: 'حذف استوری خود' },
  { key: 'edit_others', label: 'ویرایش استوری دیگران' },
  { key: 'delete_others', label: 'حذف استوری دیگران' },
  { key: 'pin', label: 'پین کردن استوری' },
  { key: 'view_reactions', label: 'مشاهده واکنش‌ها و بازدیدها' },
] as const;

export const MOBILE_FOOTER_DEFAULT_MODULES = ['products', 'production_orders', 'invoices', 'customers'] as const;
export const DASHBOARD_QUICK_ACCESS_DEFAULT_MODULES = [
  ...MOBILE_FOOTER_DEFAULT_MODULES,
  'attendance_logs',
  'leave_requests',
  'mission_requests',
  '',
] as const;
export const PREFERRED_ROLE_MODULE_SLOT_KEYS = [
  'slot_1',
  'slot_2',
  'slot_3',
  'slot_4',
  'slot_5',
  'slot_6',
  'slot_7',
  'slot_8',
] as const;
export const MOBILE_FOOTER_PERMISSION_FIELDS = [
  { key: 'slot_1', label: 'ماژول پر استفاده اول' },
  { key: 'slot_2', label: 'ماژول پر استفاده دوم' },
  { key: 'slot_3', label: 'ماژول پر استفاده سوم' },
  { key: 'slot_4', label: 'ماژول پر استفاده چهارم' },
  { key: 'slot_5', label: 'افزودن سریع پنجم' },
  { key: 'slot_6', label: 'افزودن سریع ششم' },
  { key: 'slot_7', label: 'افزودن سریع هفتم' },
  { key: 'slot_8', label: 'افزودن سریع هشتم' },
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

  if (module.id === 'invoices') {
    ensureField(fieldMap, '__action_send_taxpayer_system', 'عملیات: ارسال به سامانه مودیان');
  }

  if (!fieldMap.has('assignee_id')) {
    ensureField(fieldMap, 'assignee_id', 'مسئول');
  }

  // Permission flag for opening module-level settings page.
  if (!fieldMap.has('__module_settings')) {
    ensureField(fieldMap, '__module_settings', 'ویرایش فیلدها و بلاک‌های ماژول');
  }

  MODULE_GOAL_PERMISSION_FIELDS.forEach((item) => {
    ensureField(fieldMap, item.key, item.label);
  });

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

const normalizeConditionList = (value: unknown): ViewConditionItem[] =>
  Array.isArray(value)
    ? value.filter((item) => item && typeof item === 'object' && String((item as any)?.field || '').trim())
      .map((item) => item as ViewConditionItem)
    : [];

export const normalizeViewConditionGroup = (
  value?: ViewConditionGroup | null
): ViewConditionGroup => {
  const legacyConditions = normalizeConditionList(value?.conditions);
  const hasModernShape =
    Array.isArray(value?.conditions_all) ||
    Array.isArray(value?.conditions_any);

  const conditionsAll = hasModernShape
    ? normalizeConditionList(value?.conditions_all)
    : (value?.logic === 'or' ? [] : legacyConditions);
  const conditionsAny = hasModernShape
    ? normalizeConditionList(value?.conditions_any)
    : (value?.logic === 'or' ? legacyConditions : []);

  return {
    conditions_all: conditionsAll,
    conditions_any: conditionsAny,
  };
};

export const hasViewConditionGroupConditions = (
  value?: ViewConditionGroup | null
) => {
  const normalized = normalizeViewConditionGroup(value);
  return (normalized.conditions_all?.length || 0) > 0 || (normalized.conditions_any?.length || 0) > 0;
};

const mergeModulePermission = (base: ModulePermissionConfig, incoming?: ModulePermissionConfig) => {
  const viewConditions = normalizeViewConditionGroup(incoming?.view_conditions || base.view_conditions);
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
    view_conditions: hasViewConditionGroupConditions(viewConditions) ? viewConditions : undefined,
  };
};

export const buildDefaultPermissions = (modules: Record<string, ModuleDefinition>): PermissionMap => {
  const defaults: PermissionMap = {};

  Object.values(modules).forEach((module) => {
    if (isSaasAdminModuleId(module.id)) return;
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
    fields: {
      ...createFieldsMap(SETTINGS_TAB_PERMISSIONS),
      ...createFieldsMap([...PRINT_SIGNATURE_PERMISSION_FIELDS]),
      ceo_signature: false,
    },
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

  defaults[GOALS_PERMISSION_KEY] = {
    view: true,
    edit: true,
    delete: true,
    record_scope: 'all',
    fields: createFieldsMap(GOALS_PERMISSION_FIELDS),
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

  defaults[REPORTS_PERMISSION_KEY] = {
    view: true,
    edit: true,
    delete: true,
    record_scope: 'all',
    fields: createFieldsMap(REPORTS_PERMISSION_FIELDS),
  };

  defaults[CUSTOMER_CLUB_PERMISSION_KEY] = {
    view: true,
    edit: true,
    delete: true,
    record_scope: 'all',
    fields: createFieldsMap([...CUSTOMER_CLUB_PERMISSION_FIELDS]),
  };

  defaults[VOIP_PERMISSION_KEY] = {
    view: true,
    edit: true,
    delete: true,
    record_scope: 'all',
    fields: createFieldsMap(VOIP_PERMISSION_FIELDS),
  };

  defaults[COMMUNICATIONS_PERMISSION_KEY] = {
    view: true,
    edit: true,
    delete: false,
    record_scope: 'all',
    fields: {
      ...createFieldsMap([...COMMUNICATIONS_PERMISSION_FIELDS]),
      audit_all_conversations: false,
    },
  };

  defaults[MOBILE_FOOTER_PERMISSION_KEY] = {
    view: true,
    edit: true,
    delete: true,
    record_scope: 'all',
    fields: {
      slot_1: DASHBOARD_QUICK_ACCESS_DEFAULT_MODULES[0],
      slot_2: DASHBOARD_QUICK_ACCESS_DEFAULT_MODULES[1],
      slot_3: DASHBOARD_QUICK_ACCESS_DEFAULT_MODULES[2],
      slot_4: DASHBOARD_QUICK_ACCESS_DEFAULT_MODULES[3],
      slot_5: DASHBOARD_QUICK_ACCESS_DEFAULT_MODULES[4],
      slot_6: DASHBOARD_QUICK_ACCESS_DEFAULT_MODULES[5],
      slot_7: DASHBOARD_QUICK_ACCESS_DEFAULT_MODULES[6],
      slot_8: DASHBOARD_QUICK_ACCESS_DEFAULT_MODULES[7],
    },
  };

  defaults[STORIES_PERMISSION_KEY] = {
    view: true,
    edit: false,
    delete: false,
    record_scope: 'all',
    fields: createFieldsMap([...STORIES_PERMISSION_FIELDS]),
  };

  defaults[SAAS_ADMIN_PERMISSION_KEY] = {
    view: false,
    edit: false,
    delete: false,
    record_scope: 'all',
    fields: createFieldsMap(SAAS_ADMIN_PERMISSION_FIELDS),
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
  limit = 8
) => {
  const fields = permissions?.[MOBILE_FOOTER_PERMISSION_KEY]?.fields || {};
  const visibleModules = Object.keys(modules).filter(
    (moduleId) => !isSaasAdminModuleId(moduleId) && permissions?.[moduleId]?.view !== false
  );
  const next: string[] = [];

  const pushUnique = (moduleId: string) => {
    if (!moduleId || !modules[moduleId] || !visibleModules.includes(moduleId) || next.includes(moduleId)) return;
    next.push(moduleId);
  };

  PREFERRED_ROLE_MODULE_SLOT_KEYS
    .map((key) => String(fields?.[key] || '').trim())
    .filter(Boolean)
    .forEach(pushUnique);

  DASHBOARD_QUICK_ACCESS_DEFAULT_MODULES.forEach((moduleId) => pushUnique(String(moduleId)));
  visibleModules.forEach(pushUnique);

  return next.slice(0, limit);
};

const normalizeIdSet = (values?: Iterable<string> | null) =>
  new Set(Array.from(values || []).map((value) => String(value || '').trim()).filter(Boolean));

const buildRoleChildrenMap = (roles: Array<{ id?: string | null; parent_id?: string | null }>) => {
  const childrenMap = new Map<string, string[]>();
  (roles || []).forEach((role) => {
    const id = String(role?.id || '').trim();
    const parentId = String(role?.parent_id || '').trim();
    if (!id || !parentId) return;
    const current = childrenMap.get(parentId) || [];
    current.push(id);
    childrenMap.set(parentId, current);
  });
  return childrenMap;
};

export const collectDescendantRoleIds = (
  roles: Array<{ id?: string | null; parent_id?: string | null }>,
  rootRoleId?: string | null
) => {
  const normalizedRootId = String(rootRoleId || '').trim();
  if (!normalizedRootId) return new Set<string>();

  const result = new Set<string>([normalizedRootId]);
  const childrenMap = buildRoleChildrenMap(roles);
  (childrenMap.get(normalizedRootId) || []).forEach((childId) => {
    const normalizedChildId = String(childId || '').trim();
    if (!normalizedChildId) return;
    result.add(normalizedChildId);
  });

  return result;
};

export const resolveScopedRecordAccess = (
  directory: { users?: Array<{ id?: string | null; role_id?: string | null }>; roles?: Array<{ id?: string | null; parent_id?: string | null }> } | null | undefined,
  currentUserId: string | null,
  currentUserRoleId: string | null
) => {
  const allowedRoleIds = collectDescendantRoleIds(directory?.roles || [], currentUserRoleId);
  const allowedUserIds = new Set<string>();
  const normalizedCurrentUserId = String(currentUserId || '').trim();

  if (normalizedCurrentUserId) {
    allowedUserIds.add(normalizedCurrentUserId);
  }

  (directory?.users || []).forEach((user) => {
    const userId = String(user?.id || '').trim();
    const roleId = String(user?.role_id || '').trim();
    if (!userId) return;
    if (roleId && allowedRoleIds.has(roleId)) {
      allowedUserIds.add(userId);
    }
  });

  return {
    allowedRoleIds: Array.from(allowedRoleIds),
    allowedUserIds: Array.from(allowedUserIds),
  };
};

export const canAccessAssignedRecord = (
  record: any,
  currentUserId: string | null,
  currentUserRoleId: string | null,
  recordScope: RecordScope = 'all',
  options?: {
    currentOrgId?: string | null;
    allowedRoleIds?: Iterable<string> | null;
    allowedUserIds?: Iterable<string> | null;
  }
) => {
  if (!record) return false;

  const currentOrgId = String(options?.currentOrgId || '').trim();
  const recordOrgId = String(record?.org_id || '').trim();
  if (currentOrgId && recordOrgId && currentOrgId !== recordOrgId) {
    return false;
  }

  if (recordScope === 'all') return true;

  const resolvedAssigneeId = String(getResolvedAssigneeId(record) || '').trim();
  if (!resolvedAssigneeId) return false;

  if (recordScope === 'team') {
    if (record?.assignee_type === 'role') {
      return !!currentUserRoleId && resolvedAssigneeId === currentUserRoleId;
    }
    if (record?.assignee_type === 'user') {
      return !!currentUserId && resolvedAssigneeId === currentUserId;
    }
    return false;
  }

  if (recordScope === 'subtree') {
    const allowedRoleIds = normalizeIdSet(options?.allowedRoleIds);
    const allowedUserIds = normalizeIdSet(options?.allowedUserIds);
    if (currentUserRoleId) allowedRoleIds.add(String(currentUserRoleId));
    if (currentUserId) allowedUserIds.add(String(currentUserId));

    if (record?.assignee_type === 'role') {
      return allowedRoleIds.has(resolvedAssigneeId);
    }
    if (record?.assignee_type === 'user') {
      return allowedUserIds.has(resolvedAssigneeId);
    }
    return false;
  }

  return !!currentUserId && record?.assignee_type === 'user' && resolvedAssigneeId === currentUserId;
};

const EMPTY_CURRENT_USER_ROLE_CONTEXT: CurrentUserRoleContext = {
  userId: null,
  roleId: null,
  orgId: null,
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
        const result = { userId: user.id, roleId: null, orgId: snapshot.orgId || null, permissions: null };
        currentUserRoleContextCache.set(cacheKey, result);
        return result;
      }

      const result = {
        userId: user.id,
        roleId: snapshot.roleId,
        orgId: snapshot.orgId || null,
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
  const canViewExplorer = canViewRoot && fields.explorer_page !== false;
  const canViewRecycleBin = canViewRoot && fields.recycle_bin_page !== false;
  const canViewRecordFilesManager = canViewRoot && fields.record_files_manager !== false;

  return {
    canViewGallery,
    canViewExplorer,
    canEditGallery: canViewGallery && canEditRoot,
    canDeleteGallery: canViewGallery && canDeleteRoot,
    canViewRecycleBin,
    canViewRecordFilesManager,
    canEditRecordFilesManager: canViewRecordFilesManager && canEditRoot,
    canDeleteRecordFilesManager: canViewRecordFilesManager && canDeleteRoot,
    canManageManualFolders: canViewRoot && canEditRoot && fields.manage_manual_folders !== false,
    canSharePublicLinks: canViewRoot && canEditRoot && fields.share_public_links !== false,
  };
};

export const resolveReportsAccessPermissions = (permissions: PermissionMap | null | undefined) => {
  const perm = permissions?.[REPORTS_PERMISSION_KEY] || {};
  const fields = perm.fields || {};
  const canViewRoot = perm.view !== false;
  const canEditRoot = perm.edit !== false;
  const canDeleteRoot = perm.delete !== false;

  const canViewHub = canViewRoot && fields.hub_page !== false;
  const canUseBuilder = canViewHub && canEditRoot && fields.builder_page !== false;

  return {
    canViewHub,
    canUseBuilder,
    canDeleteReports: canViewHub && canDeleteRoot,
  };
};

export const resolveGoalsAccessPermissions = (permissions: PermissionMap | null | undefined) => {
  const perm = permissions?.[GOALS_PERMISSION_KEY] || {};
  const fields = perm.fields || {};
  const canViewRoot = perm.view !== false;
  const canEditRoot = perm.edit !== false;
  const canDeleteRoot = perm.delete !== false;

  return {
    canViewManager: canViewRoot && fields.module_list_button !== false,
    canViewModuleCards: canViewRoot && fields.module_list_cards !== false,
    canViewDashboardWidget: canViewRoot && fields.dashboard_widget !== false,
    canEditGoals: canViewRoot && canEditRoot,
    canDeleteGoals: canViewRoot && canDeleteRoot,
  };
};

export const resolveModuleGoalAccessPermissions = (
  permissions: PermissionMap | null | undefined,
  moduleId?: string | null
) => {
  const rootPerm = permissions?.[GOALS_PERMISSION_KEY] || {};
  const rootFields = rootPerm.fields || {};
  const modulePerm = moduleId ? (permissions?.[moduleId] || {}) : {};
  const moduleFields = modulePerm.fields || {};
  const canViewRoot = rootPerm.view !== false;
  const canEditRoot = canViewRoot && rootPerm.edit !== false;
  const canViewModule = !moduleId || modulePerm.view !== false;
  const canViewGoal = canViewRoot && canViewModule && moduleFields.__goals_view !== false;

  return {
    canViewGoal,
    canViewModuleCards: canViewGoal && rootFields.module_list_cards !== false,
    canViewDashboardWidget: canViewGoal && rootFields.dashboard_widget !== false,
    canOpenManager: canViewRoot && rootFields.module_list_button !== false,
    canCreateGoal: canViewGoal && canEditRoot && moduleFields.__goals_create !== false,
    canEditGoal: canViewGoal && canEditRoot && moduleFields.__goals_edit !== false,
  };
};

export const resolveVoipAccessPermissions = (permissions: PermissionMap | null | undefined) => {
  const perm = permissions?.[VOIP_PERMISSION_KEY] || {};
  const fields = perm.fields || {};
  const canViewRoot = perm.view !== false;

  return {
    canViewAllCallNotifications: canViewRoot && fields.all_call_notifications !== false,
  };
};

export const resolveCommunicationsPermissions = (permissions: PermissionMap | null | undefined) => {
  const perm = permissions?.[COMMUNICATIONS_PERMISSION_KEY] || {};
  const fields = perm.fields || {};
  const canViewRoot = perm.view !== false;

  return {
    canUsePanel: canViewRoot && fields.panel_access !== false,
    canUseWorkspace: canViewRoot && fields.workspace_access !== false,
    canSendInternal: canViewRoot && perm.edit !== false && fields.send_internal !== false,
    canManageGroups: canViewRoot && perm.edit !== false && fields.manage_groups !== false,
    canUseBotChannels: canViewRoot && fields.use_bot_channels !== false,
    canUseSms: canViewRoot && fields.use_sms !== false,
    canUseVoip: canViewRoot && fields.use_voip !== false,
    canViewSystemFeed: canViewRoot && fields.view_system_feed !== false,
    canAuditAllConversations: canViewRoot && fields.audit_all_conversations === true,
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

export const fetchCurrentUserRecordAccessContext = async (
  supabaseClient: any,
  options?: { force?: boolean }
): Promise<CurrentUserRecordAccessContext> => {
  const context = await fetchCurrentUserRoleContext(supabaseClient, options);
  if (!context.userId) {
    return {
      ...context,
      allowedRoleIds: [],
      allowedUserIds: [],
    };
  }

  const directory = await fetchAssigneeDirectory(supabaseClient, options);
  const scoped = resolveScopedRecordAccess(directory, context.userId, context.roleId);

  return {
    ...context,
    allowedRoleIds: scoped.allowedRoleIds,
    allowedUserIds: scoped.allowedUserIds,
  };
};

export const resolveSaasAdminFieldPermission = (
  permissions: PermissionMap | null | undefined,
  field: string
): boolean => {
  const perm = permissions?.[SAAS_ADMIN_PERMISSION_KEY] || {};
  const hasView = perm.view === true || perm.edit === true;
  if (!hasView) return false;
  const fields = (perm.fields || {}) as Record<string, boolean>;
  return fields[field] === true;
};

export const resolveStoriesPermissions = (permissions: PermissionMap | null | undefined) => {
  const perm = permissions?.[STORIES_PERMISSION_KEY] || {};
  const fields = perm.fields || {};
  const canViewRoot = perm.view !== false;
  const canEditRoot = perm.edit !== false;
  const canDeleteRoot = perm.delete !== false;

  return {
    canView: canViewRoot,
    canPublish: canViewRoot && canEditRoot && fields.publish !== false,
    canEditOwn: canViewRoot && canEditRoot && fields.edit_own !== false,
    canDeleteOwn: canViewRoot && canDeleteRoot && fields.delete_own !== false,
    canEditOthers: canViewRoot && canEditRoot && fields.edit_others !== false,
    canDeleteOthers: canViewRoot && canDeleteRoot && fields.delete_others !== false,
    canPin: canViewRoot && canEditRoot && fields.pin !== false,
    canViewReactions: canViewRoot && fields.view_reactions !== false,
  };
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
