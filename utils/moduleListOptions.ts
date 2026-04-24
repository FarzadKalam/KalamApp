import { BlockType, FieldType, ModuleDefinition } from '../types';
import { MODULES } from '../moduleRegistry';
import { buildCustomerRelationSearchText } from './customerRelation';
import { getPreferredRelationTargetField } from './relationTargetField';
import { supportsSystemCode } from './systemCode';
import { CASH_BANK_LEGACY_ACCOUNT_KEYS } from './cashBankLegacyAccountKeys';

type ModuleFieldLike = {
  key: string;
  type?: FieldType;
  isTableColumn?: boolean;
  dynamicOptionsCategory?: string;
  relationConfig?: {
    targetModule?: string;
    targetField?: string;
    filter?: Record<string, any>;
  };
};

export type ModuleListOptionPlan = {
  immediateDynamicCategories: string[];
  immediateRelationFields: ModuleFieldLike[];
  allDynamicCategories: string[];
  allRelationFields: ModuleFieldLike[];
};

const RELATION_BATCH_SIZE = 500;
const RELATION_MAX_PAGES = 40;
const RELATION_OPTIONS_TTL_MS = 5 * 60_000;
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
    .filter((field) => field.isTableColumn)
    .filter((field) => moduleConfig.id !== 'cash_bank_operations' || !CASH_BANK_LEGACY_ACCOUNT_KEYS.has(String(field?.key || '').trim()))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  if (tableFields.length > 0) {
    return tableFields;
  }

  return (moduleConfig.fields || []).filter((field) =>
    ['name', 'title', 'business_name', 'system_code', 'sell_price', 'stock_quantity', 'status', 'mobile_1', 'rank'].includes(field.key)
  );
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
    return prependCashBankImageField(moduleConfig, visibleColumns
      .filter((fieldKey) => moduleConfig.id !== 'cash_bank_operations' || !CASH_BANK_LEGACY_ACCOUNT_KEYS.has(String(fieldKey || '').trim()))
      .map((fieldKey) => moduleConfig.fields.find((field) => field.key === fieldKey))
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
  const immediateDynamicFields = visibleFields.filter(
    (field) =>
      (field.type === FieldType.SELECT || field.type === FieldType.MULTI_SELECT || field.type === FieldType.STATUS) &&
      field.dynamicOptionsCategory
  );
  const immediateRelationFields = visibleFields.filter(
    (field) => field.type === FieldType.RELATION || field.type === FieldType.USER || field.type === FieldType.TAGS
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
      searchText: isCustomer
        ? buildCustomerRelationSearchText(row, resolvedTargetField)
        : `${String(labelValue || '').toLowerCase()} ${String(row?.system_code || '').toLowerCase()}`.trim(),
    };
  });

const fetchRelationRows = async (
  supabaseClient: any,
  targetModule: string,
  fields: string[],
  filter?: Record<string, any>
) => {
  const targetTable = MODULES[targetModule]?.table || targetModule;
  const rows: any[] = [];
  for (let page = 0; page < RELATION_MAX_PAGES; page += 1) {
    const from = page * RELATION_BATCH_SIZE;
    const to = from + RELATION_BATCH_SIZE - 1;
    let query = supabaseClient
      .from(targetTable)
      .select(fields.join(', '))
      .range(from, to);

    Object.entries(filter || {}).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    const result = await query;
    if (result.error) {
      return { data: null as any, error: result.error };
    }

    const chunk = result.data || [];
    rows.push(...chunk);
    if (chunk.length < RELATION_BATCH_SIZE) break;
  }

  return { data: rows, error: null as any };
};

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
  const includeSystemCode = targetModule !== 'cheques' && supportsSystemCode(targetModule);
  const customerExtraFields =
    targetModule === 'customers'
      ? ['full_name', 'first_name', 'last_name', 'business_name', 'legal_name', 'mobile_1', 'phone']
      : [];
  const selectFields = Array.from(
    new Set(
      targetModule === 'profiles'
        ? ['id'].concat(resolvedTargetField ? [resolvedTargetField] : [])
        : ['id']
            .concat(includeSystemCode ? ['system_code'] : [])
            .concat(resolvedTargetField ? [resolvedTargetField] : [])
            .concat(customerExtraFields)
    )
  );

  if (targetModule === 'shelves' && !selectFields.includes('shelf_number')) {
    selectFields.push('shelf_number');
  }

  let { data: relationRows, error: relationError } = await fetchRelationRows(
    supabaseClient,
    targetModule,
    selectFields,
    filter
  );

  const errorText = String(relationError?.message || relationError?.details || '').toLowerCase();
  const errorCode = String(relationError?.code || '').toUpperCase();
  const hasColumnError = errorCode === '42703' || errorCode === 'PGRST204' || errorText.includes('column');

  if (relationError && hasColumnError) {
    const fallbackWithoutSystemCode = selectFields.filter((field) => field !== 'system_code');
    let fallback = await fetchRelationRows(supabaseClient, targetModule, fallbackWithoutSystemCode, filter);

    if (fallback.error && targetField) {
      const fallbackErrorText = String(fallback.error?.message || fallback.error?.details || '').toLowerCase();
      const missingTargetField =
        fallbackErrorText.includes(String(targetField).toLowerCase()) ||
        String(fallback.error?.code || '').toUpperCase() === '42703' ||
        String(fallback.error?.code || '').toUpperCase() === 'PGRST204';

      if (missingTargetField) {
        const byPreferredField = await fetchRelationRows(
          supabaseClient,
          targetModule,
          ['id', resolvedTargetField].filter(Boolean) as string[],
          filter
        );
        fallback = byPreferredField.error
          ? await fetchRelationRows(supabaseClient, targetModule, ['id'], filter)
          : byPreferredField;
      }
    }

    relationRows = fallback.data;
  }

    const options = buildRelationOptionsFromRows(targetModule, resolvedTargetField, relationRows || []);
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

export const fetchModuleListRelationOptions = async (
  supabaseClient: any,
  fields: ModuleFieldLike[],
  directory: { users: any[]; roles: any[] }
) => {
  const profileOptions = (directory.users || []).map((user: any) => ({
    label: user.display_name || user.full_name || user.id,
    value: user.id,
  }));
  const roleOptions = (directory.roles || []).map((role: any) => ({
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
    if (!targetModule) return;

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
      relationOptions[fieldKey] = group.options;
      if (fieldKey.includes('_')) {
        relationOptions[fieldKey.split('_').pop() || fieldKey] = group.options;
      }
    });
  });

  return relationOptions;
};
