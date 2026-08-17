import { BlockType, FieldType, ModuleDefinition } from '../types';
import { MODULES } from '../moduleRegistry';
import { buildCustomerRelationSearchText } from './customerRelation';
import { getPreferredRelationTargetField } from './relationTargetField';
import { CASH_BANK_LEGACY_ACCOUNT_KEYS } from './cashBankLegacyAccountKeys';
import { shouldSkipModuleListField } from './moduleListFieldSelection';
import { fetchRelationOptionsForField } from './relationOptions';
import { buildRecordReferenceKey, fetchRecordReferenceLabels } from './recordReference';
import { isWorkflowVirtualField, shouldRenderInGeneralModuleUi } from './moduleFieldVisibility';

type ModuleFieldLike = {
  key: string;
  type?: FieldType;
  isTableColumn?: boolean;
  labels?: {
    fa: string;
    en?: string;
  };
  order?: number;
  dynamicOptionsCategory?: string;
  relationConfig?: {
    targetModule?: string;
    targetField?: string;
    dependsOn?: string;
    filter?: Record<string, any>;
    sourceModules?: Array<{
      targetModule?: string;
      targetField?: string;
      filter?: Record<string, any>;
      tagLabel?: string;
      tagColor?: string;
    }>;
  };
};

const MODULE_LIST_SYSTEM_FIELDS: ModuleFieldLike[] = [
  { key: 'created_at', labels: { fa: 'زمان ایجاد' }, type: FieldType.DATETIME },
  { key: 'updated_at', labels: { fa: 'زمان ویرایش' }, type: FieldType.DATETIME },
  { key: 'created_by', labels: { fa: 'ایجاد کننده' }, type: FieldType.USER, relationConfig: { targetModule: 'profiles', targetField: 'full_name' } },
  { key: 'updated_by', labels: { fa: 'آخرین ویرایشگر' }, type: FieldType.USER, relationConfig: { targetModule: 'profiles', targetField: 'full_name' } },
] as const;

const getModuleListSystemFields = (
  moduleConfig: ModuleDefinition | null | undefined,
): ModuleFieldLike[] => {
  if (!moduleConfig) return [];
  return MODULE_LIST_SYSTEM_FIELDS.filter((field) => !shouldSkipModuleListField(moduleConfig.id, String(field.key || '').trim()));
};

export const getModuleListSelectableFields = (
  moduleConfig: ModuleDefinition | null | undefined,
): ModuleFieldLike[] => {
  if (!moduleConfig) return [];

  const explicitFields = (moduleConfig.fields || [])
    .filter((field) => !isWorkflowVirtualField(field))
    .filter((field) => shouldRenderInGeneralModuleUi(field))
    .filter((field) => !shouldSkipModuleListField(moduleConfig.id, String(field?.key || '').trim()))
    .filter((field) => moduleConfig.id !== 'cash_bank_operations' || !CASH_BANK_LEGACY_ACCOUNT_KEYS.has(String(field?.key || '').trim()));

  const seen = new Set<string>();
  const combined: ModuleFieldLike[] = [];

  explicitFields.forEach((field) => {
    const key = String(field?.key || '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    combined.push(field);
  });

  getModuleListSystemFields(moduleConfig).forEach((field) => {
    const key = String(field?.key || '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    combined.push(field);
  });

  return combined;
};

export type ModuleListOptionPlan = {
  immediateDynamicCategories: string[];
  immediateRelationFields: ModuleFieldLike[];
  allDynamicCategories: string[];
  allRelationFields: ModuleFieldLike[];
};

const RELATION_OPTIONS_TTL_MS = 15 * 60_000;
const relationTargetOptionsCache = new Map<string, { data: any[]; expiresAt: number }>();
const relationTargetPromiseCache = new Map<string, Promise<any[]>>();
const normalizeFilter = (value: Record<string, any> | undefined) => {
  if (!value || typeof value !== 'object') return {};
  return Object.keys(value)
    .sort()
    .reduce<Record<string, any>>((acc, key) => {
      acc[key] = value[key];
      return acc;
    }, {});
};

const normalizeOptionValue = (value: unknown) => String(value ?? '').trim();
const buildRelationTargetCacheKey = (
  targetModule: string,
  targetField: string | undefined,
  filter?: Record<string, any>
) => JSON.stringify({
  targetModule: normalizeOptionValue(targetModule),
  targetField: normalizeOptionValue(targetField || '') || null,
  filter: normalizeFilter(filter),
});

const getDefaultListFields = (moduleConfig: ModuleDefinition): ModuleFieldLike[] => {
  const tableFields = (moduleConfig.fields || [])
    .filter((field) => !isWorkflowVirtualField(field))
    .filter((field) => shouldRenderInGeneralModuleUi(field))
    .filter((field) => !shouldSkipModuleListField(moduleConfig.id, String(field?.key || '').trim()))
    .filter((field) => field.isTableColumn)
    .filter((field) => moduleConfig.id !== 'cash_bank_operations' || !CASH_BANK_LEGACY_ACCOUNT_KEYS.has(String(field?.key || '').trim()))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  if (tableFields.length > 0) {
    return tableFields;
  }

  return (moduleConfig.fields || []).filter((field) =>
    !isWorkflowVirtualField(field) &&
    shouldRenderInGeneralModuleUi(field) &&
    !shouldSkipModuleListField(moduleConfig.id, String(field?.key || '').trim()) &&
    ['name', 'title', 'business_name', 'system_code', 'sell_price', 'stock_quantity', 'status', 'mobile_1', 'rank'].includes(field.key)
  );
};

export const CASH_BANK_REQUIRED_VISIBLE_FIELD_KEYS = [
  'image_url',
  'operation_type',
  'status',
  'operation_date',
  'amount',
  'payment_type',
  'receipt_account_id',
  'payment_account_id',
] as const;

export const normalizeCashBankVisibleColumnKeys = (
  moduleConfig: ModuleDefinition | null | undefined,
  columns?: string[] | null,
) => {
  const allowedFieldKeys = new Set(getModuleListSelectableFields(moduleConfig).map((field) => String(field?.key || '').trim()).filter(Boolean));
  const seen = new Set<string>();
  const normalized = [
    ...CASH_BANK_REQUIRED_VISIBLE_FIELD_KEYS,
    ...(Array.isArray(columns) ? columns : []),
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((key) => {
      if (CASH_BANK_LEGACY_ACCOUNT_KEYS.has(key)) return false;
      if (!allowedFieldKeys.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return normalized;
};

const prependCashBankImageField = (
  moduleConfig: ModuleDefinition,
  fields: ModuleFieldLike[]
) => {
  if (moduleConfig.id !== 'cash_bank_operations') return fields;
  const imageField = moduleConfig.fields.find((field) => String(field?.key || '').trim() === 'image_url');
  if (!imageField) return fields;
  const withoutImage = fields.filter((field) => String(field?.key || '').trim() !== 'image_url');
  return [imageField, ...withoutImage];
};

export const getModuleListVisibleFields = (
  moduleConfig: ModuleDefinition | null | undefined,
  visibleColumns?: string[]
): ModuleFieldLike[] => {
  if (!moduleConfig) return [];

  if (Array.isArray(visibleColumns) && visibleColumns.length > 0) {
    const selectableFieldMap = new Map(
      getModuleListSelectableFields(moduleConfig)
        .map((field) => [String(field?.key || '').trim(), field] as const)
        .filter(([key]) => Boolean(key))
    );
    const nextVisibleColumns = moduleConfig.id === 'cash_bank_operations'
      ? normalizeCashBankVisibleColumnKeys(moduleConfig, visibleColumns)
      : visibleColumns;
    return prependCashBankImageField(moduleConfig, nextVisibleColumns
      .filter((fieldKey) => !shouldSkipModuleListField(moduleConfig.id, String(fieldKey || '').trim()))
      .filter((fieldKey) => moduleConfig.id !== 'cash_bank_operations' || !CASH_BANK_LEGACY_ACCOUNT_KEYS.has(String(fieldKey || '').trim()))
      .map((fieldKey) => selectableFieldMap.get(String(fieldKey || '').trim()))
      .filter(Boolean) as ModuleFieldLike[]);
  }

  return prependCashBankImageField(moduleConfig, getDefaultListFields(moduleConfig));
};

const collectFullDynamicOptionFields = (moduleConfig: ModuleDefinition): ModuleFieldLike[] => {
  const fields: ModuleFieldLike[] = [...(moduleConfig.fields || []).filter((field: any) => field.dynamicOptionsCategory)];

  (moduleConfig.blocks || []).forEach((block) => {
    if ((block.type === BlockType.TABLE || block.type === BlockType.GRID_TABLE) && block.tableColumns) {
      block.tableColumns.forEach((column: any) => {
        if (
          (column.type === FieldType.SELECT || column.type === FieldType.MULTI_SELECT || column.type === FieldType.STATUS) &&
          column.dynamicOptionsCategory
        ) {
          fields.push(column);
        }
      });
    }
  });

  return fields;
};

const collectFullRelationFields = (moduleConfig: ModuleDefinition): ModuleFieldLike[] => {
  const fields: ModuleFieldLike[] = [
    ...(moduleConfig.fields || []).filter((field) => field.type === FieldType.RELATION || field.type === FieldType.USER || field.type === FieldType.TAGS),
  ];

  (moduleConfig.blocks || []).forEach((block) => {
    if ((block.type === BlockType.TABLE || block.type === BlockType.GRID_TABLE) && block.tableColumns) {
      block.tableColumns.forEach((column) => {
        if (column.type === FieldType.RELATION || column.type === FieldType.USER || column.type === FieldType.TAGS) {
          fields.push({ ...column, key: `${block.id}_${column.key}` });
        }
      });
    }
  });

  return fields;
};

const toUniqueCategories = (fields: ModuleFieldLike[]) =>
  Array.from(
    new Set(
      fields
        .map((field) => normalizeOptionValue(field.dynamicOptionsCategory))
        .filter(Boolean)
    )
  );

const toUniqueRelationFields = (fields: ModuleFieldLike[]) => {
  const seen = new Set<string>();
  return fields.filter((field) => {
    const key = normalizeOptionValue(field.key);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const isCheapImmediateRelationField = (field: ModuleFieldLike) => {
  const key = normalizeOptionValue(field.key);
  if (field.isTableColumn) return true;
  if (field.type === FieldType.TAGS) return true;
  if (field.type === FieldType.USER) return true;
  return key === 'assignee_id' || key === 'assignee_role_id' || key === 'assignee_user_id';
};

export const buildModuleListOptionPlan = (
  moduleConfig: ModuleDefinition | null | undefined,
  visibleColumns?: string[]
): ModuleListOptionPlan => {
  if (!moduleConfig) {
    return {
      immediateDynamicCategories: [],
      immediateRelationFields: [],
      allDynamicCategories: [],
      allRelationFields: [],
    };
  }

  const visibleFields = getModuleListVisibleFields(moduleConfig, visibleColumns);
  const hasExplicitVisibleColumns = Array.isArray(visibleColumns) && visibleColumns.length > 0;
  const immediateDynamicFields = visibleFields.filter(
    (field) =>
      (field.type === FieldType.SELECT || field.type === FieldType.MULTI_SELECT || field.type === FieldType.STATUS) &&
      field.dynamicOptionsCategory
  );
  const immediateRelationFields = visibleFields.filter(
    (field) =>
      (field.type === FieldType.RELATION || field.type === FieldType.USER || field.type === FieldType.TAGS) &&
      (hasExplicitVisibleColumns || isCheapImmediateRelationField(field))
  );

  const allDynamicFields = collectFullDynamicOptionFields(moduleConfig);
  const allRelationFields = collectFullRelationFields(moduleConfig);

  return {
    immediateDynamicCategories: toUniqueCategories(immediateDynamicFields),
    immediateRelationFields: toUniqueRelationFields(immediateRelationFields),
    allDynamicCategories: toUniqueCategories(allDynamicFields),
    allRelationFields: toUniqueRelationFields(allRelationFields),
  };
};

const buildRelationOptionsFromRows = (
  targetModule: string,
  resolvedTargetField: string | undefined,
  rows: any[]
) =>
  (rows || []).map((row: any) => {
    const isCustomer = targetModule === 'customers';
    const labelValue = isCustomer
      ? String(
          row?.full_name
          || (resolvedTargetField ? row?.[resolvedTargetField] : '')
          || row?.business_name
          || row?.system_code
          || row?.id
          || 'بدون نام'
        ).trim()
      : ((resolvedTargetField ? row?.[resolvedTargetField] : null) || row?.shelf_number || row?.system_code || row?.id);
    const systemCodeSuffix = !isCustomer && row?.system_code ? ` (${row.system_code})` : '';
    return {
      label: `${labelValue}${systemCodeSuffix}`,
      value: row.id,
      module: targetModule,
      searchText: isCustomer
        ? buildCustomerRelationSearchText(row, resolvedTargetField)
        : `${String(labelValue || '').toLowerCase()} ${String(row?.system_code || '').toLowerCase()}`.trim(),
    };
  });

const fetchRelationOptionsByTarget = async (
  supabaseClient: any,
  targetModule: string,
  targetField: string | undefined,
  filter?: Record<string, any>
) => {
  const cacheKey = buildRelationTargetCacheKey(targetModule, targetField, filter);
  const cached = relationTargetOptionsCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const inFlight = relationTargetPromiseCache.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const pending = (async () => {
    const resolvedTargetField = getPreferredRelationTargetField(targetModule, targetField);
    const field = {
      key: `module_list_target_${targetModule}_${resolvedTargetField || 'label'}`,
      type: FieldType.RELATION,
      relationConfig: {
        targetModule,
        targetField: resolvedTargetField,
        filter,
      },
    };
    const lightweightOptions = await fetchRelationOptionsForField(supabaseClient, field, { limit: 50 }).catch(() => []);
    const options = Array.isArray(lightweightOptions) && lightweightOptions.length > 0
      ? lightweightOptions
      : buildRelationOptionsFromRows(targetModule, resolvedTargetField, []);
    relationTargetOptionsCache.set(cacheKey, {
      data: options,
      expiresAt: Date.now() + RELATION_OPTIONS_TTL_MS,
    });
    relationTargetPromiseCache.delete(cacheKey);
    return options;
  })().catch((error) => {
    relationTargetPromiseCache.delete(cacheKey);
    throw error;
  });

  relationTargetPromiseCache.set(cacheKey, pending);
  return pending;
};

const getRowFieldValues = (row: any, fieldKey: string) => {
  const rawValue = row?.[fieldKey];
  if (Array.isArray(rawValue)) {
    return rawValue.map((item) => normalizeOptionValue(item)).filter(Boolean);
  }
  const normalizedValue = normalizeOptionValue(rawValue);
  return normalizedValue ? [normalizedValue] : [];
};

export const hydrateModuleListRelationOptionsForRows = async (
  supabaseClient: any,
  fields: ModuleFieldLike[],
  rows: any[],
  directory: { users: any[]; roles: any[] } | null
) => {
  const profileOptions = (directory?.users || []).map((user: any) => ({
    label: user.display_name || user.full_name || user.id,
    value: user.id,
    module: 'profiles',
  }));
  const roleOptions = (directory?.roles || []).map((role: any) => ({
    label: role.title || role.id,
    value: role.id,
    module: 'org_roles',
  }));

  const relationOptions: Record<string, any[]> = {
    profiles: profileOptions,
    org_roles: roleOptions,
    roles: roleOptions,
  };

  const requestsByModule = new Map<string, Set<string>>();
  const fieldTargets = new Map<string, Array<{ moduleId: string; recordId: string }>>();
  const userFieldKeys = new Set<string>();

  (fields || []).forEach((field) => {
    const fieldKey = normalizeOptionValue(field?.key);
    if (!fieldKey) return;

    if (field.type === FieldType.USER) {
      // فهرست اصلیِ کاربران فقط افراد فعال را نگه می‌دارد تا نتوان یک کاربر
      // غیرفعال را برای رکورد تازه انتخاب کرد. اما مقدارِ ثبت‌شده روی ردیف‌های
      // قدیمی باید همچنان با نام همان شخص دیده شود؛ به همین دلیل شناسه‌های
      // موجود در این صفحه را جداگانه و دقیق واکشی می‌کنیم.
      userFieldKeys.add(fieldKey);
      (rows || []).forEach((row: any) => {
        getRowFieldValues(row, fieldKey).forEach((recordId) => {
          if (!requestsByModule.has('profiles')) requestsByModule.set('profiles', new Set<string>());
          requestsByModule.get('profiles')!.add(recordId);
          const fieldEntries = fieldTargets.get(fieldKey) || [];
          fieldEntries.push({ moduleId: 'profiles', recordId });
          fieldTargets.set(fieldKey, fieldEntries);
        });
      });
      return;
    }

    const relationConfig = field?.relationConfig;
    if (!relationConfig) return;

    (rows || []).forEach((row: any) => {
      const targetModule = relationConfig?.dependsOn
        ? normalizeOptionValue(row?.[relationConfig.dependsOn])
        : normalizeOptionValue(relationConfig?.targetModule);
      if (!targetModule) return;

      getRowFieldValues(row, fieldKey).forEach((recordId) => {
        if (!requestsByModule.has(targetModule)) requestsByModule.set(targetModule, new Set<string>());
        requestsByModule.get(targetModule)!.add(recordId);
        const fieldEntries = fieldTargets.get(fieldKey) || [];
        fieldEntries.push({ moduleId: targetModule, recordId });
        fieldTargets.set(fieldKey, fieldEntries);
      });
    });
  });

  const labelMap = await fetchRecordReferenceLabels(
    supabaseClient,
    Array.from(requestsByModule.entries()).flatMap(([moduleId, ids]) =>
      Array.from(ids).map((recordId) => ({ moduleId, recordId }))
    )
  ).catch(() => ({} as Record<string, string>));

  fieldTargets.forEach((entries, fieldKey) => {
    const merged = new Map<string, any>();
    entries.forEach((entry) => {
      const referenceKey = buildRecordReferenceKey(entry.moduleId, entry.recordId);
      // اگر lookup عنوان به‌علت schema قدیمی هنوز پاسخ نداد، شناسهٔ فنی را
      // هرگز وارد UI نکن. ردیف اصلی همچنان نمایش داده می‌شود و با دریافت
      // عنوان در retry بعدی، گزینه نیز به‌روز خواهد شد.
      const label = String(labelMap[referenceKey] || 'رکورد مرتبط').trim();
      const optionKey = `${entry.moduleId}:${entry.recordId}`;
      if (!merged.has(optionKey)) {
        merged.set(optionKey, {
          label,
          value: entry.recordId,
          module: entry.moduleId,
          searchText: label.toLowerCase(),
        });
      }
    });
    relationOptions[fieldKey] = Array.from(merged.values());
  });

  // فیلدهای سیستمی مانند «ایجادکننده» ممکن است از گزینهٔ عمومی profiles
  // استفاده کنند. نام کاربران غیرفعالِ موجود در همین ردیف‌ها را به همان
  // نقشه اضافه می‌کنیم، بدون آن‌که allUsers (فهرست قابل انتساب) تغییر کند.
  const resolvedProfiles = new Map(
    profileOptions.map((option: any) => [normalizeOptionValue(option?.value), option] as const),
  );
  fieldTargets.forEach((entries) => {
    entries
      .filter((entry) => entry.moduleId === 'profiles')
      .forEach((entry) => {
        const recordId = normalizeOptionValue(entry.recordId);
        if (!recordId || resolvedProfiles.has(recordId)) return;
        const label = String(labelMap[buildRecordReferenceKey('profiles', recordId)] || 'کاربر مرتبط').trim();
        resolvedProfiles.set(recordId, {
          label,
          value: recordId,
          module: 'profiles',
          searchText: label.toLowerCase(),
          inactiveHistorical: true,
        });
      });
  });
  relationOptions.profiles = Array.from(resolvedProfiles.values());
  userFieldKeys.forEach((fieldKey) => {
    relationOptions[fieldKey] = Array.from(resolvedProfiles.values());
  });

  return relationOptions;
};

const mergeRelationOptions = (...lists: Array<any[] | undefined | null>) => {
  const merged = new Map<string, any>();
  lists.forEach((list) => {
    (list || []).forEach((item: any) => {
      const value = normalizeOptionValue(item?.value);
      const moduleId = normalizeOptionValue(item?.module);
      const key = `${moduleId}:${value}`;
      if (!value || merged.has(key)) return;
      merged.set(key, item);
    });
  });
  return Array.from(merged.values());
};

export const fetchModuleListRelationOptions = async (
  supabaseClient: any,
  fields: ModuleFieldLike[],
  directory: { users: any[]; roles: any[] } | null
) => {
  const profileOptions = (directory?.users || []).map((user: any) => ({
    label: user.display_name || user.full_name || user.id,
    value: user.id,
  }));
  const roleOptions = (directory?.roles || []).map((role: any) => ({
    label: role.title || role.id,
    value: role.id,
  }));
  const assigneeOptions = [
    ...profileOptions,
    ...roleOptions.filter((role) => !profileOptions.some((user) => String(user.value) === String(role.value))),
  ];

  const relationOptions: Record<string, any[]> = {
    profiles: profileOptions,
    assignee_id: assigneeOptions,
    org_roles: roleOptions,
    roles: roleOptions,
  };

  const groupedTargets = new Map<
    string,
    {
      fieldKeys: string[];
      targetModule: string;
      targetField?: string;
      filter?: Record<string, any>;
    }
  >();

  fields.forEach((field) => {
    const fieldKey = normalizeOptionValue(field.key);
    if (!fieldKey) return;

    if (field.type === FieldType.USER) {
      relationOptions[fieldKey] = profileOptions;
      return;
    }

    const targetModule = normalizeOptionValue(field.relationConfig?.targetModule);
    const sourceModules = Array.isArray(field.relationConfig?.sourceModules)
      ? field.relationConfig?.sourceModules || []
      : [];
    if (!targetModule && sourceModules.length === 0) return;

    if (sourceModules.length > 0) {
      sourceModules.forEach((sourceModule) => {
        const sourceTargetModule = normalizeOptionValue(sourceModule?.targetModule);
        if (!sourceTargetModule) return;
        const sourceTargetField = normalizeOptionValue(sourceModule?.targetField) || undefined;
        const sourceFilter = normalizeFilter(sourceModule?.filter);
        const signature = JSON.stringify({ targetModule: sourceTargetModule, targetField: sourceTargetField, filter: sourceFilter });
        const existing = groupedTargets.get(signature);
        if (existing) {
          existing.fieldKeys.push(fieldKey);
          return;
        }
        groupedTargets.set(signature, {
          fieldKeys: [fieldKey],
          targetModule: sourceTargetModule,
          targetField: sourceTargetField,
          filter: sourceFilter,
        });
      });
      return;
    }

    if (targetModule === 'profiles') {
      relationOptions[fieldKey] = profileOptions;
      return;
    }

    if (targetModule === 'org_roles' || targetModule === 'roles') {
      relationOptions[fieldKey] = roleOptions;
      return;
    }

    const targetField = normalizeOptionValue(field.relationConfig?.targetField) || undefined;
    const filter = normalizeFilter(field.relationConfig?.filter);
    const signature = JSON.stringify({ targetModule, targetField, filter });
    const existing = groupedTargets.get(signature);
    if (existing) {
      existing.fieldKeys.push(fieldKey);
      return;
    }

    groupedTargets.set(signature, {
      fieldKeys: [fieldKey],
      targetModule,
      targetField,
      filter,
    });
  });

  const loadedGroups = await Promise.all(
    Array.from(groupedTargets.values()).map(async (group) => ({
      fieldKeys: group.fieldKeys,
      options: await fetchRelationOptionsByTarget(
        supabaseClient,
        group.targetModule,
        group.targetField,
        group.filter
      ),
    }))
  );

  loadedGroups.forEach((group) => {
    group.fieldKeys.forEach((fieldKey) => {
      relationOptions[fieldKey] = mergeRelationOptions(relationOptions[fieldKey], group.options);
      if (fieldKey.includes('_')) {
        const shortKey = fieldKey.split('_').pop() || fieldKey;
        relationOptions[shortKey] = mergeRelationOptions(relationOptions[shortKey], group.options);
      }
    });
  });

  return relationOptions;
};

export const collectAllKnownDynamicCategories = (): string[] => {
  const cats = new Set<string>();
  Object.values(MODULES).forEach((mod) => {
    collectFullDynamicOptionFields(mod).forEach((field) => {
      const cat = String(field.dynamicOptionsCategory || '').trim();
      if (cat) cats.add(cat);
    });
  });
  return Array.from(cats);
};
