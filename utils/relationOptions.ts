import { safeJalaliFormat, formatPersianPrice, toPersianNumber } from './persianNumberFormatter';
import {
  buildRelationDisplayLabel,
  buildRelationDisplaySearchText,
  getRelationDisplayFields,
  getRelationSearchFields,
} from './relationDisplay';
import { supportsSystemCode } from './systemCode';
import { getPreferredRelationTargetField } from './relationTargetField';
import { MODULES } from '../moduleRegistry';

const RELATION_RECENT_LIMIT = 10;
const relationOptionsCache = new Map<string, any[]>();
const relationOptionsPromiseCache = new Map<string, Promise<any[]>>();

type RelationSourceConfig = {
  targetModule: string;
  targetField?: string;
  filter?: Record<string, any>;
  tagLabel?: string;
  tagColor?: string;
};

const normalizeSelectFieldList = (fields: string[]) =>
  Array.from(
    new Set(
      fields
        .flatMap((field) => String(field || '').split(','))
        .map((field) => field.trim())
        .filter(Boolean)
    )
  );

const buildSelectVariants = (
  selectFields: string[],
  extraFields: string[] = []
) => {
  const fullFields = normalizeSelectFieldList(['id', ...selectFields, ...extraFields]);
  const withoutSystemCode = normalizeSelectFieldList(fullFields.filter((field) => field !== 'system_code'));
  const minimalFields = normalizeSelectFieldList(['id', ...withoutSystemCode.slice(1, 2)]);

  return Array.from(
    new Set(
      [
        fullFields.join(', '),
        withoutSystemCode.join(', '),
        minimalFields.join(', '),
      ].map((item) => item.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim())
    )
  );
};

const buildRelationOptionLabel = (targetModule: string, item: any, targetField: string) => {
  if (targetModule === 'customers') {
    return String(item?.full_name || item?.[targetField] || item?.business_name || item?.system_code || item?.id || 'بدون نام').trim();
  }

  if (targetModule === 'cheques') {
    const serial = String(item?.serial_no || item?.[targetField] || item?.system_code || item?.id || 'بدون شماره').trim();
    const dueDate = String(item?.due_date || '').trim()
      ? toPersianNumber(safeJalaliFormat(item.due_date, 'YYYY/MM/DD') || item.due_date)
      : '-';
    const amount = Number(item?.amount || 0) > 0 ? formatPersianPrice(Number(item.amount)) : '-';
    return `${serial} (${dueDate} - ${amount})`;
  }

  if (targetModule === 'barters') {
    const name = String(item?.[targetField] || item?.name || item?.system_code || item?.id || 'بدون عنوان').trim();
    return `${name} (مانده: ${formatPersianPrice(Number(item?.remaining_amount || 0))})`;
  }

  const baseLabel = buildRelationDisplayLabel(targetModule, item, targetField);
  const statusLabel = getRelationStatusLabel(targetModule, item);
  return statusLabel ? `${baseLabel} [${statusLabel}]` : baseLabel;
};

const getRelationStatusLabel = (targetModule: string, item: any) => {
  const normalizedModule = String(targetModule || '').trim();
  if (!['products', 'product_bundles', 'billboards'].includes(normalizedModule)) {
    return '';
  }

  const rawStatus = String(item?.status || '').trim();
  if (!rawStatus) return '';

  const moduleConfig = MODULES[normalizedModule];
  const statusField = (moduleConfig?.fields || []).find((field) => String(field?.key || '').trim() === 'status');
  const matchedOption = (statusField?.options || []).find(
    (option: any) => String(option?.value || '').trim() === rawStatus
  );

  return String(matchedOption?.label || rawStatus).trim();
};

const buildRelationSearchText = (targetModule: string, item: any, targetField: string) =>
  targetModule === 'customers'
    ? [
        item?.full_name,
        item?.business_name,
        item?.first_name,
        item?.last_name,
        item?.legal_name,
        item?.mobile_1,
        item?.mobile,
        item?.phone,
        item?.system_code,
        item?.legacy_contact_code,
        item?.accounting_code,
        item?.id,
      ]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean)
        .join(' ')
    : buildRelationDisplaySearchText(targetModule, item, targetField);

const isMissingColumnError = (error: any) => {
  const errorCode = String(error?.code || '').toUpperCase();
  const errorText = String(error?.message || error?.details || '').toLowerCase();
  return errorCode === '42703' || errorCode === 'PGRST204' || errorText.includes('column');
};

const buildModuleExtraSelect = (targetModule: string, targetField: string) => {
  const isShelvesTarget = targetModule === 'shelves';
  const isChequeTarget = targetModule === 'cheques';
  const isBarterTarget = targetModule === 'barters';
  const needsStatus = ['products', 'product_bundles', 'billboards', 'price_lists'].includes(targetModule);
  return normalizeSelectFieldList([
    ...(isShelvesTarget ? ['shelf_number'] : []),
    ...(isChequeTarget ? ['due_date', 'amount', ...(targetField === 'serial_no' ? [] : ['serial_no'])] : []),
    ...(isBarterTarget ? ['remaining_amount', 'status'] : []),
    ...(needsStatus ? ['status'] : []),
  ]);
};

const escapeLikeValue = (value: string) => value.replace(/[%_,]/g, (match) => `\\${match}`);

const applyQueryFilters = (query: any, filter?: Record<string, any>) => {
  if (!filter || Object.keys(filter).length === 0) return query;

  return Object.entries(filter).reduce((nextQuery, [rawKey, rawValue]) => {
    const key = String(rawKey || '').trim();
    if (!key) return nextQuery;

    if (key.endsWith('__neq')) {
      const column = key.slice(0, -5);
      return column ? nextQuery.neq(column, rawValue) : nextQuery;
    }

    if (key.endsWith('__in')) {
      const column = key.slice(0, -4);
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      return column ? nextQuery.in(column, values) : nextQuery;
    }

    if (key.endsWith('__is')) {
      const column = key.slice(0, -4);
      return column ? nextQuery.is(column, rawValue) : nextQuery;
    }

    return nextQuery.eq(key, rawValue);
  }, query);
};

const buildRelationSources = (
  relationConfig: any,
  dependsOnModule: string
) => {
  const configuredSources = Array.isArray(relationConfig?.sourceModules) && relationConfig.sourceModules.length > 0
    ? relationConfig.sourceModules
    : [relationConfig];

  return configuredSources
    .map((source: any): RelationSourceConfig => ({
      targetModule: dependsOnModule || String(source?.targetModule || relationConfig?.targetModule || '').trim(),
      targetField: source?.targetField || relationConfig?.targetField,
      filter: dependsOnModule ? undefined : source?.filter || relationConfig?.filter,
      tagLabel: source?.tagLabel,
      tagColor: source?.tagColor,
    }))
    .filter((source: RelationSourceConfig) => String(source?.targetModule || '').trim());
};

const runRelationQuery = async (
  supabaseClient: any,
  moduleName: string,
  selectExpr: string,
  {
    filter,
    search,
    searchFields,
    exactId,
    limit,
    targetField,
  }: {
    filter?: Record<string, any>;
    search?: string;
    searchFields?: string[];
    exactId?: string | number | null;
    limit: number;
    targetField: string;
  }
) => {
  const orderStrategies = exactId
    ? [null]
    : [
        [{ column: 'updated_at', ascending: false }, { column: 'created_at', ascending: false }],
        [{ column: 'created_at', ascending: false }],
        null,
      ];

  let lastError: any = null;

  for (const strategy of orderStrategies) {
    try {
      let query = supabaseClient.from(moduleName).select(selectExpr);
      query = applyQueryFilters(query, filter);

      if (exactId) {
        query = query.eq('id', exactId).limit(1);
      } else {
        const normalizedSearch = String(search || '').trim();
        if (normalizedSearch) {
          const activeSearchFields = Array.from(
            new Set(
              (searchFields && searchFields.length > 0 ? searchFields : [targetField])
                .map((fieldName) => String(fieldName || '').trim())
                .filter(Boolean)
            )
          );
          const escapedSearch = escapeLikeValue(normalizedSearch);
          if (activeSearchFields.length === 1) {
            query = query.ilike(activeSearchFields[0], `%${escapedSearch}%`);
          } else if (activeSearchFields.length > 1) {
            query = query.or(
              activeSearchFields
                .map((fieldName) => `${fieldName}.ilike.%${escapedSearch}%`)
                .join(',')
            );
          }
        }
        query = query.limit(limit);
        if (strategy) {
          strategy.forEach((orderRule) => {
            query = query.order(orderRule.column, { ascending: orderRule.ascending });
          });
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error: any) {
      lastError = error;
      if (!isMissingColumnError(error)) {
        throw error;
      }
    }
  }

  if (lastError) throw lastError;
  return [];
};

export const fetchRelationOptionsForField = async (
  supabaseClient: any,
  field: any,
  {
    allValues,
    search = '',
    exactId = null,
    limit = RELATION_RECENT_LIMIT,
  }: {
    allValues?: Record<string, any>;
    search?: string;
    exactId?: string | number | null;
    limit?: number;
  } = {}
) => {
  const relationConfig = field?.relationConfig as any;
  if (!relationConfig) return [];

  const dependsOnModule = relationConfig?.dependsOn
    ? String(allValues?.[relationConfig.dependsOn] || '').trim()
    : '';
  const targetModule = dependsOnModule || String(relationConfig.targetModule || '').trim();
  if (!targetModule) return [];
  const sources = buildRelationSources(relationConfig, dependsOnModule).map((source: RelationSourceConfig) => {
    const sourceTargetModule = String(source.targetModule || '').trim();
    const sourceTargetField = getPreferredRelationTargetField(sourceTargetModule, source.targetField || relationConfig.targetField);
    const includeSystemCode = sourceTargetModule !== 'cheques' && supportsSystemCode(sourceTargetModule);
    const configuredDisplayFields = getRelationDisplayFields(sourceTargetModule, sourceTargetField);
    const searchFields = getRelationSearchFields(sourceTargetModule, sourceTargetField);
    const selectFields = Array.from(
      new Set(
        [
          sourceTargetField,
          ...(includeSystemCode ? ['system_code'] : []),
          ...configuredDisplayFields,
        ].filter(Boolean)
      )
    );

    return {
      moduleName: sourceTargetModule,
      targetField: sourceTargetField,
      filter: source.filter,
      searchFields,
      selectVariants: buildSelectVariants(selectFields, buildModuleExtraSelect(sourceTargetModule, sourceTargetField)),
      tagLabel: source.tagLabel,
      tagColor: source.tagColor,
    };
  });

  const cacheKey = JSON.stringify({
    sources: sources.map((source: any) => ({
      moduleName: source.moduleName,
      targetField: source.targetField,
      filter: source.filter || null,
    })),
    search: String(search || '').trim().toLowerCase(),
    exactId: exactId ?? null,
    limit,
  });

  if (relationOptionsCache.has(cacheKey)) {
    return relationOptionsCache.get(cacheKey) || [];
  }

  if (relationOptionsPromiseCache.has(cacheKey)) {
    return relationOptionsPromiseCache.get(cacheKey) || [];
  }

  const pending = (async () => {
    const allOptions: any[] = [];

    for (const source of sources as any[]) {
      let lastMissingColumnError: any = null;

      for (const selectExpr of source.selectVariants) {
        try {
          const rows = await runRelationQuery(supabaseClient, source.moduleName, selectExpr, {
            filter: source.filter,
            search,
            searchFields: source.searchFields,
            exactId,
            limit,
            targetField: source.targetField,
          });

          const options = rows.map((item: any) => ({
            label: buildRelationOptionLabel(source.moduleName, item, source.targetField),
            value: item.id,
            module: source.moduleName,
            name: item?.[source.targetField] || item?.name || item?.serial_no || item?.id,
            searchText: buildRelationSearchText(source.moduleName, item, source.targetField),
            system_code: item?.system_code,
            due_date: item?.due_date,
            amount: item?.amount,
            remaining_amount: item?.remaining_amount,
            status: item?.status,
            tagLabel: source.tagLabel,
            tagColor: source.tagColor,
          }));

          allOptions.push(...options);
          lastMissingColumnError = null;
          break;
        } catch (error: any) {
          if (!isMissingColumnError(error)) {
            throw error;
          }
          lastMissingColumnError = error;
        }
      }

      if (lastMissingColumnError) {
        throw lastMissingColumnError;
      }
    }

    const dedupedOptions = Array.from(
      new Map(allOptions.map((item) => [String(item?.value || '').trim(), item])).values()
    );

    relationOptionsCache.set(cacheKey, dedupedOptions);
    return dedupedOptions;
  })();

  relationOptionsPromiseCache.set(cacheKey, pending);
  try {
    return await pending;
  } finally {
    relationOptionsPromiseCache.delete(cacheKey);
  }
};

export const invalidateRelationOptionsCache = () => {
  relationOptionsCache.clear();
  relationOptionsPromiseCache.clear();
};

export const RELATION_DEFAULT_LIMIT = RELATION_RECENT_LIMIT;
