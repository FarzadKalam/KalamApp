import { safeJalaliFormat, formatPersianPrice, toPersianNumber } from './persianNumberFormatter';
import {
  buildRelationDisplayLabel,
  buildRelationDisplaySearchText,
  getRelationDisplayFields,
  getRelationSearchFields,
} from './relationDisplay';
import { getRecordDisplayLabel } from './recordLabel';
import { supportsSystemCode } from './systemCode';
import { getPreferredRelationTargetField } from './relationTargetField';
import { MODULES } from '../moduleRegistry';
import { FieldType } from '../types';
import { resolveScopedChartOfAccountIds } from './chartOfAccountsScope';
import { isUuidLikeValue } from './optionHelpers';
import { fetchSessionBootstrap } from './sessionCache';

const RELATION_RECENT_LIMIT = 50;
const relationOptionsCache = new Map<string, any[]>();
const relationOptionsPromiseCache = new Map<string, Promise<any[]>>();
const RPC_RELATION_MODULES = new Set([
  'customers',
  'projects',
  'products',
  'suppliers',
  'invoices',
  'purchase_invoices',
  'tasks',
  'profiles',
  'org_roles',
  'roles',
  'shelves',
  'process_templates',
]);

// جداول/ویوهایی که org_id ندارند یا cross-org هستند — نباید فیلتر org_id روی‌شان اعمال شود
const NO_ORG_SCOPE_TABLES = new Set([
  'organizations',
  'saas_orgs',
  'saas_users',
  'saas_admin_org_candidates_view',
  'saas_admin_users_view',
  'saas_admin_orgs_view',
  'saas_onboarding_requests',
]);

type RelationSourceConfig = {
  targetModule: string;
  targetTable: string;
  targetField?: string;
  filter?: Record<string, any>;
  tagLabel?: string;
  tagColor?: string;
  chartScopeRootNames?: string[];
  requireLeaf?: boolean;
  requireDetail?: boolean;
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

const FINANCIAL_OPERATIONAL_MODULES = new Set(['bank_accounts', 'cash_boxes', 'petty_funds']);

const buildFinancialOperationalLabel = (targetModule: string, item: any) => {
  const ledgerName = String(item?.account_name || '').trim();
  const ledgerCode = String(item?.account_code || '').trim();
  const ledgerSuffix = ledgerName
    ? ` - ${ledgerCode ? `[${toPersianNumber(ledgerCode)}] ` : ''}${ledgerName}`.trim()
    : '';

  if (targetModule === 'bank_accounts') {
    const bankName = String(item?.bank_name || '').trim() || 'بانک';
    const accountNo = String(item?.account_number || '').trim();
    const baseLabel = `${bankName}${accountNo ? ` (${toPersianNumber(accountNo)})` : ''}`.trim();
    return `${baseLabel}${ledgerSuffix}`.trim();
  }

  const title = String(item?.name || item?.title || item?.id || 'بدون عنوان').trim();
  const code = String(item?.code || '').trim();
  const baseLabel = code ? `${title} - ${toPersianNumber(code)}` : title;
  return `${baseLabel}${ledgerSuffix}`.trim();
};

const buildFinancialOperationalSearchValues = (targetModule: string, item: any) => {
  const ledgerName = String(item?.account_name || '').trim();
  const ledgerCode = String(item?.account_code || '').trim();
  const baseValues =
    targetModule === 'bank_accounts'
      ? [item?.bank_name, item?.account_number, item?.card_number, item?.shaba]
      : [item?.name, item?.title, item?.code];
  return [
    buildFinancialOperationalLabel(targetModule, item),
    ...baseValues,
    ledgerName,
    ledgerCode,
    item?.id,
  ];
};

const buildRelationOptionLabel = (targetModule: string, item: any, targetField: string) => {
  if (targetModule === 'saas_users') {
    const fullName = String(item?.[targetField] || item?.full_name || '').trim();
    const email = String(item?.email || '').trim();
    const mobile = String(item?.mobile || '').trim();
    const roleTitle = String(item?.role_title || '').trim();
    const orgName = String(item?.org_name || '').trim();
    const roleWithOrg = [roleTitle, orgName].filter(Boolean).join(' - ');
    const resolvedLabel = fullName || email || mobile || roleWithOrg;
    return resolvedLabel || 'کاربر بدون نام';
  }

  if (targetModule === 'customers') {
    return String(item?.[targetField] || item?.business_name || item?.full_name || item?.system_code || item?.id || 'بدون نام').trim();
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

  if (targetModule === 'billboards' && targetField === 'address') {
    const address = String(item?.address || item?.name || item?.system_code || item?.id || 'بدون آدرس').trim();
    const systemCode = String(item?.system_code || '').trim();
    const baseLabel = systemCode && systemCode !== address ? `${address} - ${systemCode}` : address;
    const statusLabel = getRelationStatusLabel(targetModule, item);
    return statusLabel ? `${baseLabel} [${statusLabel}]` : baseLabel;
  }

  if (FINANCIAL_OPERATIONAL_MODULES.has(targetModule)) {
    return buildFinancialOperationalLabel(targetModule, item);
  }

  const baseLabel = getRecordDisplayLabel(item, targetModule, {
    fallback: buildRelationDisplayLabel(targetModule, item, targetField),
  });
  if (isUuidLikeValue(baseLabel)) {
    return 'بدون عنوان';
  }
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
    : FINANCIAL_OPERATIONAL_MODULES.has(targetModule)
      ? buildFinancialOperationalSearchValues(targetModule, item)
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
    ...(FINANCIAL_OPERATIONAL_MODULES.has(targetModule) ? ['code', 'account_id'] : []),
    ...(needsStatus ? ['status'] : []),
  ]);
};

const escapeLikeValue = (value: string) => value.replace(/[%_,]/g, (match) => `\\${match}`);

const normalizeRelationSearchValue = (value: string) =>
  String(value || '')
    .normalize('NFKC')
    .replace(/\u200c/g, ' ')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const toPersianDigits = (value: string) =>
  String(value || '').replace(/[0-9]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)] || digit);

const toArabicKeyboardChars = (value: string) =>
  String(value || '').replace(/ی/g, 'ي').replace(/ک/g, 'ك');

const buildSearchTermVariants = (search: string) => {
  const raw = String(search || '').trim();
  if (!raw) return [];

  const normalized = normalizeRelationSearchValue(raw);
  const candidates = [
    raw,
    normalized,
    toPersianDigits(normalized),
    toArabicKeyboardChars(normalized),
  ];

  if (normalized.includes(' ')) {
    candidates.push(normalized.replace(/\s+/g, '\u200c'));
    candidates.push(normalized.replace(/\s+/g, ''));
  }

  return Array.from(
    new Set(
      candidates
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  ).slice(0, 6);
};

const normalizeNumericSearchValue = (search: string) => {
  const normalized = normalizeRelationSearchValue(search)
    .replace(/[٬،,]/g, '')
    .replace(/\s+/g, '');
  return /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : '';
};

const getModuleFieldTypeMap = (targetModule: string) => {
  const moduleConfig = MODULES[String(targetModule || '').trim()];
  const map = new Map<string, FieldType>();
  (moduleConfig?.fields || []).forEach((field: any) => {
    const key = String(field?.key || '').trim();
    if (key) map.set(key, field?.type as FieldType);
  });
  return map;
};

const getConfiguredSearchFields = (targetModule: string) => {
  const displayConfig = MODULES[String(targetModule || '').trim()]?.relationDisplay;
  return Array.isArray(displayConfig?.searchFields)
    ? displayConfig.searchFields.map((item: any) => String(item || '').trim()).filter(Boolean)
    : [];
};

const getNumericSearchFields = (targetModule: string) => {
  const numericFieldTypes = new Set([
    FieldType.NUMBER,
    FieldType.PRICE,
    FieldType.STOCK,
    FieldType.PERCENTAGE,
    FieldType.PERCENTAGE_OR_AMOUNT,
  ]);
  const fieldTypeMap = getModuleFieldTypeMap(targetModule);
  return getConfiguredSearchFields(targetModule).filter((fieldKey) =>
    numericFieldTypes.has(fieldTypeMap.get(fieldKey) as FieldType)
  );
};

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

    if (key.endsWith('__like')) {
      const column = key.slice(0, -6);
      return column ? nextQuery.like(column, rawValue) : nextQuery;
    }

    if (key.endsWith('__ilike')) {
      const column = key.slice(0, -7);
      return column ? nextQuery.ilike(column, rawValue) : nextQuery;
    }

    if (key.endsWith('__contains')) {
      const column = key.slice(0, -10);
      return column ? nextQuery.contains(column, rawValue) : nextQuery;
    }

    if (key.endsWith('__overlaps')) {
      const column = key.slice(0, -10);
      return column ? nextQuery.overlaps(column, rawValue) : nextQuery;
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
      targetTable: '',
      targetField: source?.targetField || relationConfig?.targetField,
      filter: dependsOnModule ? undefined : source?.filter || relationConfig?.filter,
      tagLabel: source?.tagLabel,
      tagColor: source?.tagColor,
      chartScopeRootNames: Array.isArray(source?.chartScopeRootNames)
        ? source.chartScopeRootNames
        : (Array.isArray(relationConfig?.chartScopeRootNames) ? relationConfig.chartScopeRootNames : undefined),
      requireLeaf: typeof source?.requireLeaf === 'boolean'
        ? source.requireLeaf
        : relationConfig?.requireLeaf,
      requireDetail: typeof source?.requireDetail === 'boolean'
        ? source.requireDetail
        : relationConfig?.requireDetail,
    }))
    .map((source: RelationSourceConfig) => {
      const normalizedModule = String(source?.targetModule || '').trim();
      const configuredTable = String((MODULES[normalizedModule]?.table || normalizedModule) || '').trim();
      return {
        ...source,
        targetModule: normalizedModule,
        targetTable: configuredTable || normalizedModule,
      };
    })
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
    numericSearchFields,
    exactId,
    limit,
    targetField,
  }: {
    filter?: Record<string, any>;
    search?: string;
    searchFields?: string[];
    numericSearchFields?: string[];
    exactId?: string | number | null;
    limit: number;
    targetField: string;
  }
) => {
  const normalizedExactId = exactId === undefined || exactId === null ? '' : String(exactId).trim();
  if (normalizedExactId && !isUuidLikeValue(normalizedExactId)) {
    return [];
  }

  const orderStrategies = normalizedExactId
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

      if (normalizedExactId) {
        query = query.eq('id', normalizedExactId).limit(1);
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
          const searchTerms = buildSearchTermVariants(normalizedSearch);
          const numericSearchValue = normalizeNumericSearchValue(normalizedSearch);
          const predicates = activeSearchFields.flatMap((fieldName) =>
            searchTerms.map((term) => `${fieldName}.ilike.%${escapeLikeValue(term)}%`)
          );
          if (numericSearchValue) {
            predicates.push(
              ...Array.from(new Set(numericSearchFields || []))
                .map((fieldName) => String(fieldName || '').trim())
                .filter(Boolean)
                .map((fieldName) => `${fieldName}.eq.${numericSearchValue}`)
            );
          }

          if (predicates.length > 0) {
            query = query.or(predicates.join(','));
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

const hasOnlyOrgScopeFilter = (filter?: Record<string, any>) => {
  const keys = Object.keys(filter || {}).map((key) => String(key || '').trim()).filter(Boolean);
  return keys.length === 0 || (keys.length === 1 && keys[0] === 'org_id');
};

const fetchRelationOptionsViaRpc = async (
  supabaseClient: any,
  targetModule: string,
  targetField: string,
  {
    search,
    exactId,
    limit,
    filter,
  }: {
    search?: string;
    exactId?: string | number | null;
    limit: number;
    filter?: Record<string, any>;
  }
) => {
  if (!RPC_RELATION_MODULES.has(String(targetModule || '').trim())) return null;
  if (!hasOnlyOrgScopeFilter(filter)) return null;

  const normalizedExactId = exactId === undefined || exactId === null ? null : String(exactId).trim();
  const { data, error } = await supabaseClient.rpc('search_relation_options_v1', {
    p_target_module: targetModule,
    p_target_field: targetField || null,
    p_search: String(search || '').trim() || null,
    p_exact_ids: normalizedExactId ? [normalizedExactId] : null,
    p_limit: limit,
  });
  if (error) {
    const code = String(error?.code || '').toUpperCase();
    const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
    if (
      code === '42883'
      || code === 'PGRST202'
      || code === 'PGRST204'
      || message.includes('search_relation_options_v1')
      || message.includes('could not find the function')
    ) {
      return null;
    }
    throw error;
  }

  return (Array.isArray(data) ? data : []).map((item: any) => ({
    label: String(item?.label || item?.value || '').trim() || 'بدون عنوان',
    value: item?.value,
    module: targetModule,
    name: String(item?.label || item?.value || '').trim(),
    searchText: String(item?.search_text || item?.label || item?.value || '').trim().toLowerCase(),
  }));
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
    const sourceTargetTable = String(source.targetTable || sourceTargetModule).trim();
    const sourceTargetField = getPreferredRelationTargetField(sourceTargetModule, source.targetField || relationConfig.targetField);
    const includeSystemCode = sourceTargetModule !== 'cheques' && supportsSystemCode(sourceTargetModule);
    const configuredDisplayFields = getRelationDisplayFields(sourceTargetModule, sourceTargetField);
    const searchFields = getRelationSearchFields(sourceTargetModule, sourceTargetField);
    const numericSearchFields = getNumericSearchFields(sourceTargetModule);
    const selectFields = Array.from(
      new Set(
        [
          sourceTargetField,
          ...(includeSystemCode ? ['system_code'] : []),
          ...configuredDisplayFields,
          ...searchFields,
          ...numericSearchFields,
        ].filter(Boolean)
      )
    );

    return {
      moduleName: sourceTargetModule,
      tableName: sourceTargetTable,
      targetField: sourceTargetField,
      filter: source.filter,
      searchFields,
      numericSearchFields,
      selectVariants: buildSelectVariants(selectFields, buildModuleExtraSelect(sourceTargetModule, sourceTargetField)),
      tagLabel: source.tagLabel,
      tagColor: source.tagColor,
    };
  });

  const session = await fetchSessionBootstrap(supabaseClient);
  const orgId = String(session?.orgId || '').trim();

  const cacheKey = JSON.stringify({
    orgId,
    sources: sources.map((source: any) => ({
      moduleName: source.moduleName,
      tableName: source.tableName,
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
      let scopedFilter = source.filter;
      if (
        source.moduleName === 'chart_of_accounts' &&
        Array.isArray(source.chartScopeRootNames) &&
        source.chartScopeRootNames.length > 0
      ) {
        const scopedIds = await resolveScopedChartOfAccountIds(supabaseClient, {
          rootNames: source.chartScopeRootNames,
          requireLeaf: source.requireLeaf,
          requireDetail: source.requireDetail,
        });
        if (scopedIds.length === 0) {
          continue;
        }
        scopedFilter = {
          ...(scopedFilter || {}),
          id__in: scopedIds,
        };
      }

      // اعمال فیلتر org_id برای جداول tenant-scoped
      if (orgId && !NO_ORG_SCOPE_TABLES.has(source.moduleName) && !NO_ORG_SCOPE_TABLES.has(source.tableName)) {
        scopedFilter = {
          ...(scopedFilter || {}),
          org_id: orgId,
        };
      }

      const rpcOptions = await fetchRelationOptionsViaRpc(supabaseClient, source.moduleName, source.targetField, {
        search,
        exactId,
        limit,
        filter: scopedFilter,
      });
      if (rpcOptions && rpcOptions.length > 0) {
        allOptions.push(...rpcOptions.map((item: any) => ({
          ...item,
          tagLabel: source.tagLabel,
          tagColor: source.tagColor,
        })));
        continue;
      }

      let lastMissingColumnError: any = null;

      for (const selectExpr of source.selectVariants) {
        try {
          const rows = await runRelationQuery(supabaseClient, source.tableName || source.moduleName, selectExpr, {
            filter: scopedFilter,
            search,
            searchFields: source.searchFields,
            numericSearchFields: source.numericSearchFields,
            exactId,
            limit,
            targetField: source.targetField,
          });

          let enrichedRows = rows;
          if (FINANCIAL_OPERATIONAL_MODULES.has(source.moduleName)) {
            const accountIds = Array.from(
              new Set(
                (rows || [])
                  .map((item: any) => String(item?.account_id || '').trim())
                  .filter(Boolean)
              )
            );
            if (accountIds.length > 0) {
              const { data: ledgerRows, error: ledgerError } = await supabaseClient
                .from('chart_of_accounts')
                .select('id, code, name')
                .in('id', accountIds);
              if (ledgerError) throw ledgerError;
              const ledgerById = new Map<string, { code: string; name: string }>(
                (ledgerRows || []).map((row: any) => [
                  String(row?.id || '').trim(),
                  { code: row?.code ? String(row.code) : '', name: row?.name ? String(row.name) : '' },
                ])
              );
              enrichedRows = (rows || []).map((item: any) => {
                const ledger = ledgerById.get(String(item?.account_id || '').trim());
                return ledger
                  ? { ...item, account_code: ledger.code, account_name: ledger.name }
                  : item;
              });
            }
          }

          const options = enrichedRows.map((item: any) => ({
            label: buildRelationOptionLabel(source.moduleName, item, source.targetField),
            value: item.id,
            module: source.moduleName,
            account_id: item?.account_id,
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
      new Map(
        allOptions.map((item) => {
          const accountId = String(item?.account_id || '').trim();
          const moduleName = String(item?.module || '').trim();
          const valueKey = String(item?.value || '').trim();
          const dedupeKey = FINANCIAL_OPERATIONAL_MODULES.has(moduleName) && accountId
            ? `${moduleName}:${valueKey}`
            : valueKey;
          return [dedupeKey, item];
        })
      ).values()
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
