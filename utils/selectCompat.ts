import { MODULES } from '../moduleRegistry';
import { FieldType, ModuleDefinition } from '../types';
import { getRelationDisplayFields, getRelationSearchFields } from './relationDisplay';
import { getRelationLabelFallbackFields, getPreferredRelationTargetField } from './relationTargetField';

const selectColumnCache = new Map<string, string[]>();

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

const normalizeColumns = (columns: readonly string[]) =>
  Array.from(
    new Set(
      columns
        .map((column) => String(column || '').trim())
        .filter(Boolean)
    )
  );

const unique = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

const getRecordTitleCandidateColumns = (moduleId?: string | null, moduleConfig?: ModuleDefinition): string[] => {
  if (!moduleConfig?.fields?.length) {
    return ['name', 'system_code'];
  }

  const fieldKeys = new Set(
    moduleConfig.fields
      .map((field) => String(field?.key || '').trim())
      .filter(Boolean)
  );

  const keyFields = moduleConfig.fields
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

const collectPatternMatches = (text: string, pattern: RegExp) => {
  const values: string[] = [];
  for (const match of text.matchAll(pattern)) {
    if (match?.[1]) {
      values.push(String(match[1]).trim().toLowerCase());
    }
  }
  return values;
};

const extractMissingColumnNames = (error: any): string[] => {
  const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  if (!text) return [];

  return Array.from(
    new Set(
      [
        ...collectPatternMatches(text, /column\s+"([^"]+)"/gi),
        ...collectPatternMatches(text, /column\s+'([^']+)'/gi),
        ...collectPatternMatches(text, /could not find the\s+'([^']+)'\s+column/gi),
        ...collectPatternMatches(text, /([a-z0-9_]+)\s+does not exist/gi),
      ].filter(Boolean)
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
    return next.length > 0 ? next : ['id'];
  }

  const fallback = buildFallbackColumnSet(columns);
  if (fallback.join(',') === columns.join(',')) return null;
  return fallback;
};

type CompatResult<T> = {
  data: T | null;
  error: any;
  selectedColumns: string[];
};

export const buildRecordTitleSelectColumns = (moduleId?: string | null): string[] => {
  const normalizedModuleId = String(moduleId || '').trim();
  const moduleConfig = MODULES[normalizedModuleId];
  return normalizeColumns(['id', ...getRecordTitleCandidateColumns(normalizedModuleId, moduleConfig)]);
};

export const runSelectWithCompatibleColumns = async <T>({
  cacheKey,
  columns,
  execute,
}: {
  cacheKey: string;
  columns: readonly string[];
  execute: (selectExpr: string) => PromiseLike<{ data: T | null; error: any }>;
}): Promise<CompatResult<T>> => {
  const normalizedColumns = normalizeColumns(columns);
  const cachedColumns = normalizeColumns(selectColumnCache.get(cacheKey) || []).filter((column) =>
    normalizedColumns.includes(column)
  );

  const candidateSets: string[][] = [];
  if (cachedColumns.length > 0) {
    candidateSets.push(cachedColumns);
  }
  candidateSets.push(normalizedColumns);
  candidateSets.push(buildFallbackColumnSet(normalizedColumns));

  let lastData: T | null = null;
  let lastError: any = null;
  const attempted = new Set<string>();

  while (candidateSets.length > 0) {
    let activeColumns = normalizeColumns(candidateSets.shift() || []);
    if (activeColumns.length === 0) {
      activeColumns = ['id'];
    }

    const signature = activeColumns.join(',');
    if (attempted.has(signature)) continue;
    attempted.add(signature);

    const result = await execute(signature);
    lastData = result.data;
    lastError = result.error;

    if (!result.error) {
      selectColumnCache.set(cacheKey, activeColumns);
      return {
        data: result.data,
        error: null,
        selectedColumns: activeColumns,
      };
    }

    if (!isMissingColumnError(result.error)) {
      break;
    }

    const nextColumns = pruneColumns(activeColumns, result.error);
    if (!nextColumns || nextColumns.length === 0) {
      break;
    }
    candidateSets.unshift(nextColumns);
  }

  return {
    data: lastData,
    error: lastError,
    selectedColumns: cachedColumns.length > 0 ? cachedColumns : normalizedColumns,
  };
};
