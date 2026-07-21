import { MODULES } from '../moduleRegistry';
import { FieldType, ModuleNature, ModuleDefinition } from '../types';
import { getRelationDisplayFields, getRelationSearchFields } from './relationDisplay';
import { getRelationLabelFallbackFields, getPreferredRelationTargetField } from './relationTargetField';
import { isWorkflowVirtualField } from './moduleFieldVisibility';

const INCOMPATIBLE_COLUMN_CACHE_TTL_MS = 5 * 60 * 1000;

type IncompatibleColumnCacheEntry = {
  columns: Set<string>;
  expiresAt: number;
};

const incompatibleColumnCache = new Map<string, IncompatibleColumnCacheEntry>();

// بعضی lookupها (مانند نام رکوردهای مرتبط در جدول‌ها) صرفاً برای نمایش عنوان
// هستند. اگر schema قدیمی یک ستون اختیاری نداشته باشد، PostgREST فقط همان
// ستون اول را گزارش می‌کند و حذف یکی‌یکی ستون‌ها یک زنجیرهٔ بلند از 400ها
// می‌سازد. این cache آخرین projection موفق را نگه می‌دارد؛ فقط نام ستون‌ها
// ذخیره می‌شوند و هیچ داده‌ای میان سازمان‌ها به اشتراک گذاشته نمی‌شود.
const compatibleProjectionCache = new Map<string, IncompatibleColumnCacheEntry>();

const TEXTUAL_FIELD_TYPES = new Set<FieldType>([
  FieldType.TEXT,
  FieldType.LONG_TEXT,
  FieldType.SUPER_LONG_TEXT,
  FieldType.SELECT,
  FieldType.MULTI_SELECT,
  FieldType.STATUS,
  FieldType.PHONE,
  FieldType.LINK,
  FieldType.TAGS,
]);

const SAFE_FALLBACK_TITLE_COLUMNS = [
  'name',
  'title',
  'business_name',
  'full_name',
  'legal_name',
  'last_name',
  'first_name',
  'subject',
  'bundle_number',
  'shelf_number',
  'order_number',
  'invoice_number',
  'entry_no',
  'source_record_title',
  'city_name',
  'description',
  'notes',
  'system_code',
  'manual_code',
  'code',
];

const RECORD_TITLE_COLUMN_OVERRIDES: Record<string, string[]> = {
  customers: ['id', 'full_name', 'business_name', 'system_code', 'auto_name_enabled'],
  purchase_invoices: ['id', 'system_code'],
  reports: ['id', 'name'],
};

const CACHE_KEY_COLUMN_EXCLUSIONS: Array<{ pattern: RegExp; columns: string[] }> = [
  {
    pattern: /(?:^|:)purchase_invoices(?::|$)/,
    columns: ['description'],
  },
];

const normalizeColumns = (columns: readonly string[]) =>
  Array.from(
    new Set(
      columns
        .map((column) => String(column || '').trim())
        .filter(Boolean)
    )
  );

const applyCacheKeyColumnExclusions = (cacheKey: string, columns: string[]) => {
  const excluded = new Set<string>();
  CACHE_KEY_COLUMN_EXCLUSIONS.forEach((rule) => {
    if (!rule.pattern.test(cacheKey)) return;
    rule.columns.forEach((column) => excluded.add(column.toLowerCase()));
  });
  if (excluded.size === 0) return columns;
  const next = columns.filter((column) => !excluded.has(column.toLowerCase()));
  return next.length > 0 ? next : ['id'];
};

const unique = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

const getRecordTitleCandidateColumns = (moduleId?: string | null, moduleConfig?: ModuleDefinition): string[] => {
  if (!moduleConfig?.fields?.length) {
    return ['name', 'system_code'];
  }

  const fieldKeys = new Set(
    moduleConfig.fields
      .filter((field) => !isWorkflowVirtualField(field))
      .map((field) => String(field?.key || '').trim())
      .filter(Boolean)
  );

  const keyFields = moduleConfig.fields
    .filter((field) => !isWorkflowVirtualField(field))
    .filter((field) => field.isKey)
    .map((field) => String(field.key || '').trim())
    .filter(Boolean);

  const primaryTargetField = getPreferredRelationTargetField(
    moduleId,
    keyFields[0] || null,
  );

  const relationDisplayFields = getRelationDisplayFields(String(moduleId || '').trim(), primaryTargetField)
    .filter((field) => fieldKeys.has(field));

  const relationFallbackFields = getRelationLabelFallbackFields(moduleId)
    .filter((field) => fieldKeys.has(field));

  const safeFallbackFields = SAFE_FALLBACK_TITLE_COLUMNS.filter((field) => fieldKeys.has(field));

  const relationSearchFields = getRelationSearchFields(String(moduleId || '').trim(), primaryTargetField)
    .filter((field) => fieldKeys.has(field));

  const descriptiveTextFields = moduleConfig.fields
    .filter((field) => !isWorkflowVirtualField(field))
    .filter((field) => {
      const key = String(field?.key || '').trim();
      if (!key) return false;
      if (!TEXTUAL_FIELD_TYPES.has(field?.type as FieldType)) return false;
      return /name|title|subject|code|number|status/i.test(key);
    })
    .map((field) => String(field.key || '').trim())
    .filter(Boolean)
    .slice(0, 4);

  const primaryCandidates = unique([
    ...keyFields,
    ...relationDisplayFields,
    ...relationSearchFields,
    ...relationFallbackFields,
    ...safeFallbackFields,
  ]);

  if (primaryCandidates.length > 0) {
    return primaryCandidates;
  }

  return unique([
    ...descriptiveTextFields,
    ...moduleConfig.fields
      .filter((field) => !isWorkflowVirtualField(field))
      .filter((field) => TEXTUAL_FIELD_TYPES.has(field?.type as FieldType))
      .slice(0, 3)
      .map((field) => String(field.key || '').trim())
      .filter(Boolean),
  ]);
};

const buildFallbackColumnSet = (columns: string[]) => {
  if (columns.length <= 1) return columns;

  const priority = [
    'id',
    'name',
    'title',
    'full_name',
    'business_name',
    'legal_name',
    'first_name',
    'last_name',
    'subject',
    'system_code',
    'manual_code',
    'code',
  ];
  const next = priority.filter((column) => columns.includes(column));
  return next.length > 0 ? next : ['id'];
};

const buildCompactDisplayColumnSet = (columns: string[]) => {
  const normalizedColumns = normalizeColumns(columns);
  const titlePriority = [
    'name',
    'full_name',
    'business_name',
    'legal_name',
    'title',
    'first_name',
    'last_name',
    'subject',
    'system_code',
    'manual_code',
    'code',
    'bundle_number',
    'shelf_number',
    'order_number',
    'invoice_number',
    'entry_no',
    'description',
    'notes',
  ];
  const preferredTitleColumn = titlePriority.find((column) => normalizedColumns.includes(column));
  const fallbackTitleColumn = normalizedColumns.find((column) => column !== 'id');
  return normalizeColumns(['id', preferredTitleColumn || fallbackTitleColumn || 'id']);
};

const collectPatternMatches = (text: string, pattern: RegExp) => {
  const values: string[] = [];
  for (const match of text.matchAll(pattern)) {
    if (match?.[1]) {
      values.push(String(match[1]).trim().toLowerCase());
    }
  }
  return values;
};

const normalizeMissingColumnName = (value: string) =>
  String(value || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .split('.')
    .pop()
    ?.trim()
    .toLowerCase() || '';

const extractMissingColumnNames = (error: any): string[] => {
  const text = [error?.message, error?.details, error?.hint]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  if (!text) return [];

  return Array.from(
    new Set(
      [
        ...collectPatternMatches(text, /column\s+"([^"]+)"/gi),
        ...collectPatternMatches(text, /column\s+'([^']+)'/gi),
        ...collectPatternMatches(text, /could not find the\s+'([^']+)'\s+column/gi),
        ...collectPatternMatches(text, /column\s+([a-z0-9_.]+)\s+does not exist/gi),
      ]
        .map(normalizeMissingColumnName)
        .filter(Boolean)
    )
  );
};

const isMissingColumnError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  if (code === '42703') return true;
  if (code === 'PGRST200' || code === 'PGRST204') {
    return text.includes('column') || text.includes('schema cache');
  }
  return text.includes('column') || text.includes('schema cache') || text.includes('does not exist');
};

const pruneColumns = (columns: string[], error: any) => {
  const missingColumns = extractMissingColumnNames(error);
  if (missingColumns.length > 0) {
    const next = columns.filter((column) => {
      if (column === 'id') return true;
      return !missingColumns.includes(column.toLowerCase());
    });
    if (next.length > 0 && next.length < columns.length) {
      return next;
    }
  }

  const fallback = buildFallbackColumnSet(columns);
  if (fallback.join(',') === columns.join(',')) return null;
  return fallback;
};

const getCachedIncompatibleColumns = (cacheKey: string) => {
  const cached = incompatibleColumnCache.get(cacheKey);
  if (!cached) return new Set<string>();
  if (cached.expiresAt <= Date.now()) {
    incompatibleColumnCache.delete(cacheKey);
    return new Set<string>();
  }
  return new Set(cached.columns);
};

const rememberIncompatibleColumns = (cacheKey: string, columns: string[]) => {
  if (columns.length === 0) return;
  const cached = getCachedIncompatibleColumns(cacheKey);
  columns.forEach((column) => cached.add(column.toLowerCase()));
  incompatibleColumnCache.set(cacheKey, {
    columns: cached,
    expiresAt: Date.now() + INCOMPATIBLE_COLUMN_CACHE_TTL_MS,
  });
};

const getCachedCompatibleProjection = (cacheKey: string, requestedColumns: string[]) => {
  const cached = compatibleProjectionCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    compatibleProjectionCache.delete(cacheKey);
    return null;
  }

  const requested = new Set(requestedColumns.map((column) => column.toLowerCase()));
  const projection = Array.from(cached.columns)
    .filter((column) => requested.has(column.toLowerCase()));
  return projection.includes('id') ? projection : null;
};

const rememberCompatibleProjection = (cacheKey: string, columns: string[]) => {
  const projection = normalizeColumns(columns);
  if (!projection.includes('id')) return;
  compatibleProjectionCache.set(cacheKey, {
    columns: new Set(projection),
    expiresAt: Date.now() + INCOMPATIBLE_COLUMN_CACHE_TTL_MS,
  });
};

type CompatResult<T> = {
  data: T | null;
  error: any;
  selectedColumns: string[];
};

export type CompatBatchResult<T> = {
  data: T[];
  error: any;
  selectedColumns: string[];
};

export const buildRecordTitleSelectColumns = (moduleId?: string | null): string[] => {
  const normalizedModuleId = String(moduleId || '').trim();
  const override = RECORD_TITLE_COLUMN_OVERRIDES[normalizedModuleId];
  if (override?.length) {
    return normalizeColumns(override);
  }
  const moduleConfig = MODULES[normalizedModuleId];
  return normalizeColumns(['id', ...getRecordTitleCandidateColumns(normalizedModuleId, moduleConfig)]);
};

export const runSelectWithCompatibleColumns = async <T>({
  cacheKey,
  columns,
  execute,
  fallbackToWildcard = false,
  preferCompactProjectionAfterMissingColumn = false,
}: {
  cacheKey: string;
  columns: readonly string[];
  execute: (selectExpr: string) => PromiseLike<{ data: T | null; error: any }>;
  /**
   * برای دریافت یک رکورد: اگر خطای schema نام ستون را اعلام نکرد، `*` از
   * schema واقعی می‌خواند تا یک ستون جدید/قدیمی کل صفحه را خالی نکند.
   */
  fallbackToWildcard?: boolean;
  /**
   * برای lookupهای صرفاً نمایشی: بعد از اولین خطای ستون، به یک projection
   * کوچک و عنوان‌محور برگرد تا پاسخ‌های 400 پشت سر هم، صفحه یا جدول را کند
   * و ظاهراً خالی نکنند.
   */
  preferCompactProjectionAfterMissingColumn?: boolean;
}): Promise<CompatResult<T>> => {
  const normalizedColumns = applyCacheKeyColumnExclusions(cacheKey, normalizeColumns(columns));
  const cachedIncompatibleColumns = getCachedIncompatibleColumns(cacheKey);
  const uncachedInitialColumns = normalizedColumns.filter(
    (column) => column === 'id' || !cachedIncompatibleColumns.has(column.toLowerCase())
  );
  const cachedProjection = preferCompactProjectionAfterMissingColumn
    ? getCachedCompatibleProjection(cacheKey, normalizedColumns)
    : null;
  const initialColumns = cachedProjection || uncachedInitialColumns;
  const candidateSets: string[][] = [initialColumns.length > 0 ? initialColumns : ['id']];

  let lastData: T | null = null;
  let lastError: any = null;
  let lastSelectedColumns = initialColumns;
  const attempted = new Set<string>();

  while (candidateSets.length > 0) {
    let activeColumns = normalizeColumns(candidateSets.shift() || []);
    if (activeColumns.length === 0) {
      activeColumns = ['id'];
    }

    const signature = activeColumns.join(',');
    if (attempted.has(signature)) continue;
    attempted.add(signature);
    lastSelectedColumns = activeColumns;

    const result = await execute(signature);
    lastData = result.data;
    lastError = result.error;

    if (!result.error) {
      if (preferCompactProjectionAfterMissingColumn) {
        rememberCompatibleProjection(cacheKey, activeColumns);
      }
      return {
        data: result.data,
        error: null,
        selectedColumns: activeColumns,
      };
    }

    if (!isMissingColumnError(result.error)) {
      break;
    }

    const missingColumns = extractMissingColumnNames(result.error);
    if (missingColumns.length === 0 && fallbackToWildcard && !attempted.has('*')) {
      candidateSets.unshift(['*']);
      continue;
    }
    const prunedColumns = pruneColumns(activeColumns, result.error);
    const nextColumns = preferCompactProjectionAfterMissingColumn && prunedColumns
      ? buildCompactDisplayColumnSet(prunedColumns)
      : prunedColumns;
    if (!nextColumns || nextColumns.length === 0) {
      break;
    }
    const removedColumns = activeColumns.filter((column) => !nextColumns.includes(column));
    if (missingColumns.length > 0 && removedColumns.length > 0) {
      rememberIncompatibleColumns(cacheKey, removedColumns);
    }
    candidateSets.unshift(nextColumns);
  }

  return {
    data: lastData,
    error: lastError,
    selectedColumns: lastSelectedColumns,
  };
};

type RefineReadParams = {
  resource?: string;
  meta?: Record<string, any>;
  [key: string]: any;
};

const quotePostgrestInValue = (value: unknown) => (
  `"${String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
);

const serializePostgrestInValues = (value: unknown) => {
  const values = Array.isArray(value) ? value : [value];
  return `(${values.map(quotePostgrestInValue).join(',')})`;
};

const normalizePostgrestNotInFilter = (filter: any): any => {
  if (!filter || typeof filter !== 'object') return filter;

  if ((filter.operator === 'or' || filter.operator === 'and') && Array.isArray(filter.value)) {
    const value = filter.value.map(normalizePostgrestNotInFilter);
    return value.every((entry: any, index: number) => entry === filter.value[index]) ? filter : { ...filter, value };
  }

  // نسخهٔ فعلی providerِ Refine برای nin، فهرست مقادیر را بدون پرانتز به
  // PostgREST می‌فرستد و باعث خطای parse می‌شود. filter خام، قالب معتبر
  // not.in.(...) را بدون وابستگی به مسیر تولیدکنندهٔ فیلتر حفظ می‌کند.
  if (filter.operator === 'nin') {
    return {
      ...filter,
      operator: 'not.in',
      value: serializePostgrestInValues(filter.value),
    };
  }

  return filter;
};

const normalizePostgrestNotInFilters = (params: RefineReadParams): RefineReadParams => {
  if (!Array.isArray(params?.filters)) return params;
  const filters = params.filters.map(normalizePostgrestNotInFilter);
  return filters.every((filter, index) => filter === params.filters[index]) ? params : { ...params, filters };
};

const SIMPLE_SELECT_COLUMN_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const parseSimpleSelectColumns = (select: unknown) => {
  const expression = String(select || '').trim();
  if (!expression || expression === '*') return [];
  const columns = expression.split(',').map((part) => part.trim()).filter(Boolean);
  return columns.length > 0 && columns.every((column) => SIMPLE_SELECT_COLUMN_PATTERN.test(column))
    ? normalizeColumns(columns)
    : [];
};

const buildRefineReadParams = (params: RefineReadParams, select: string) => ({
  ...params,
  meta: {
    ...(params.meta || {}),
    select,
  },
});

const runCompatibleRefineRead = async <T>(
  operation: (params: RefineReadParams) => Promise<T>,
  params: RefineReadParams,
  operationName: string,
) => {
  const requestedColumns = parseSimpleSelectColumns(params?.meta?.select);
  if (requestedColumns.length === 0) return operation(params);

  // فاکتورهای فروش/خرید دادهٔ مالی و ردیف‌های JSON وابسته دارند. provider نباید
  // در مواجهه با schema خطادار، پاسخ آن‌ها را به `id` یا ستون ناقص تقلیل دهد؛
  // این کار از نمایش اشتباهِ فاکتور خالی جلوگیری می‌کند.
  const moduleConfig = MODULES[String(params?.resource || '').trim()];
  if (moduleConfig?.nature === ModuleNature.INVOICE) return operation(params);

  const schema = String(params?.meta?.schema || 'public').trim() || 'public';
  const resource = String(params?.resource || '').trim();
  const cacheKey = `refine:${operationName}:${schema}:${resource}`;
  const incompatibleColumns = getCachedIncompatibleColumns(cacheKey);
  let activeColumns = requestedColumns.filter((column) => !incompatibleColumns.has(column.toLowerCase()));
  if (activeColumns.length === 0) activeColumns = ['id'];
  const attempted = new Set<string>();

  while (activeColumns.length > 0) {
    const select = activeColumns.join(',');
    if (attempted.has(select)) break;
    attempted.add(select);
    try {
      return await operation(buildRefineReadParams(params, select));
    } catch (error: any) {
      if (!isMissingColumnError(error)) throw error;

      const missingColumns = extractMissingColumnNames(error);
      if (missingColumns.length === 0) {
        // فقط queryهای سبک فهرست با ستون‌های ساده به این مسیر می‌آیند؛
        // fallback به شناسه مانع خالی‌شدن کامل فهرست می‌شود.
        if (!attempted.has('id')) {
          activeColumns = ['id'];
          continue;
        }
        throw error;
      }

      const nextColumns = activeColumns.filter((column) => (
        column === 'id' || !missingColumns.includes(column.toLowerCase())
      ));
      const removedColumns = activeColumns.filter((column) => !nextColumns.includes(column));
      if (removedColumns.length === 0) throw error;
      rememberIncompatibleColumns(cacheKey, removedColumns);
      activeColumns = nextColumns.length > 0 ? nextColumns : ['id'];
    }
  }

  return operation(params);
};

/**
 * سازگارکنندهٔ مرکزی Refine برای readها. وجود یک ستون اختیاری در config که
 * هنوز در schema یک سازمان ایجاد نشده، دیگر نباید فهرست یا صفحهٔ ماژول را
 * خالی کند. فقط خطای صریح ستون/schema retry می‌شود؛ خطاهای دسترسی و داده
 * بدون تغییر به caller برمی‌گردند.
 */
export const createSchemaCompatibleDataProvider = <T extends Record<string, any>>(provider: T): T => ({
  ...provider,
  getList: provider.getList
    ? (params: RefineReadParams) => runCompatibleRefineRead(provider.getList.bind(provider), normalizePostgrestNotInFilters(params), 'get-list')
    : provider.getList,
  getMany: provider.getMany
    ? (params: RefineReadParams) => runCompatibleRefineRead(provider.getMany.bind(provider), normalizePostgrestNotInFilters(params), 'get-many')
    : provider.getMany,
  getOne: provider.getOne
    ? (params: RefineReadParams) => runCompatibleRefineRead(provider.getOne.bind(provider), normalizePostgrestNotInFilters(params), 'get-one')
    : provider.getOne,
});

export const selectByIdsWithCompatibleColumns = async <T>({
  cacheKey,
  columns,
  ids,
  batchSize = 80,
  execute,
  preferCompactProjectionAfterMissingColumn = false,
}: {
  cacheKey: string;
  columns: readonly string[];
  ids: readonly string[];
  batchSize?: number;
  execute: (selectExpr: string, idBatch: string[]) => PromiseLike<{ data: T[] | null; error: any }>;
  preferCompactProjectionAfterMissingColumn?: boolean;
}): Promise<CompatBatchResult<T>> => {
  const normalizedIds = Array.from(
    new Set(
      (ids || [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    )
  );
  if (!normalizedIds.length) {
    return {
      data: [],
      error: null,
      selectedColumns: normalizeColumns(columns),
    };
  }

  const rows: T[] = [];
  let lastSelectedColumns = normalizeColumns(columns);
  for (let index = 0; index < normalizedIds.length; index += Math.max(1, batchSize)) {
    const idBatch = normalizedIds.slice(index, index + Math.max(1, batchSize));
    const result = await runSelectWithCompatibleColumns<T[]>({
      cacheKey,
      columns,
      preferCompactProjectionAfterMissingColumn,
      execute: (selectExpr) => execute(selectExpr, idBatch),
    });
    lastSelectedColumns = result.selectedColumns;
    if (result.error) {
      return {
        data: rows,
        error: result.error,
        selectedColumns: lastSelectedColumns,
      };
    }
    rows.push(...(result.data || []));
  }

  return {
    data: rows,
    error: null,
    selectedColumns: lastSelectedColumns,
  };
};
