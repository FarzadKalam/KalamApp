import {describeAiRecord} from './ai-record-display.ts';
/** Structured data gateway shared by page, module, record and scheduled agents.
 * Model inputs can choose a query, never a tenant, table name or raw SQL. */
export type AgentDataField = { key: string; label: string; type: string };
export type AgentDataModule = { id: string; table: string; label: string; fields: AgentDataField[];
  recordScope: 'all' | 'own' | 'team' | 'subtree'; viewConditions?: any };
export type AgentDataAccess = { orgId: string; userId: string; roleId: string | null;
  allowedUserIds: string[]; allowedRoleIds: string[]; modules: AgentDataModule[] };
export type AgentDataFilter = { field: string; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'is' | 'contains'; value: unknown };
export type AgentDataQuery = { moduleId: string; fields?: string[]; filters?: AgentDataFilter[]; anyFilters?: AgentDataFilter[]; pageSize?: number; afterId?: string | null };
export const tenantAgentDataModuleIds = (schemas: Record<string, { table?: string }>, canRead: (id: string) => boolean, sourceModuleIds?: string[]) =>
  [...Object.keys(schemas),'workflows'].filter((id,index,all) => all.indexOf(id) === index
    && !id.startsWith('saas_') && !String(schemas[id]?.table || '').startsWith('saas_')
    && (!sourceModuleIds || sourceModuleIds.includes(id)) && canRead(id));
const uuid = (value: unknown) => /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(String(value || ''));
const column = (value: string) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);
const quote = (value: unknown) => {
  if (!['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('مقدار شرط معتبر نیست.');
  const text = String(value);
  if (text.length > 500 || /[\r\n\u0000]/.test(text)) throw new Error('مقدار شرط طولانی یا نامعتبر است.');
  return typeof value === 'number' || typeof value === 'boolean' ? text : `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
};

/** Permission predicates are server-owned. Unsupported related-record rules
 * fail closed until an adapter can apply their full semantics. */
const permissionGroups = (group: any) => {
  if (!group) return { all: [], any: [] };
  const modern = Array.isArray(group.conditions_all) || Array.isArray(group.conditions_any);
  const all = modern ? group.conditions_all || [] : group.logic === 'or' ? [] : group.conditions || [];
  const any = modern ? group.conditions_any || [] : group.logic === 'or' ? group.conditions || [] : [];
  if (!Array.isArray(all) || !Array.isArray(any) || all.length + any.length > 50) throw new Error('شرط دسترسی معتبر نیست.');
  return { all, any };
};
const permissionPredicate = (condition: any): string => {
  const field = String(condition?.field || '');
  if (!column(field)) throw new Error('شرط دسترسی مرتبط به مسیر امن اختصاصی نیاز دارد.');
  const op = condition.operator;
  if (['eq','neq','gt','gte','lt','lte'].includes(op)) {
    if (condition.value == null && ['eq','neq'].includes(op)) return `${field}.${op === 'eq' ? 'is' : 'not.is'}.null`;
    return `${field}.${op}.${quote(condition.value)}`;
  }
  if (['in','not_in'].includes(op) && Array.isArray(condition.value) && condition.value.length && condition.value.length <= 100) return `${field}.${op === 'in' ? 'in' : 'not.in'}.(${condition.value.map(quote).join(',')})`;
  if (['is_empty','is_not_empty'].includes(op)) return op === 'is_empty' ? `or(${field}.is.null,${field}.eq."")` : `and(${field}.not.is.null,${field}.neq."")`;
  // Case-sensitive contains is the UI contract. Escape all wildcard syntax.
  if (op === 'contains' && typeof condition.value === 'string' && !/[%*_\\]/.test(condition.value)) return `${field}.like.${quote(`*${condition.value}*`)}`;
  throw new Error('معنای شرط دسترسی در ابزار داده قابل تأیید نیست.');
};

export const agentRecordMatchesViewConditions = (record: Record<string, any>, group: any): boolean => {
  try {
    const groups = permissionGroups(group);
    const check = (condition: any) => {
      permissionPredicate(condition); // Same allowlist and failure behavior as SQL.
      if (!Object.prototype.hasOwnProperty.call(record, condition.field)) return false;
      const value = record[condition.field], expected = condition.value, op = condition.operator;
      if (op === 'is_empty') return value == null || value === '';
      if (op === 'is_not_empty') return value != null && value !== '';
      if (op === 'eq') return value == null ? expected == null : String(value) === String(expected);
      if (op === 'neq') return value != null && expected != null && String(value) !== String(expected);
      if (value == null || expected == null) return false;
      if (op === 'contains') return typeof value === 'string' && value.includes(expected);
      if (op === 'in') return expected.some((item: any) => String(item) === String(value));
      if (op === 'not_in') return !expected.some((item: any) => String(item) === String(value));
      if (typeof value !== typeof expected) return false;
      if (op === 'gt') return value > expected; if (op === 'gte') return value >= expected;
      if (op === 'lt') return value < expected; if (op === 'lte') return value <= expected;
      return false;
    };
    return groups.all.every(check) && (!groups.any.length || groups.any.some(check));
  } catch { return false; }
};

export const compileAgentDataQuery = (access: AgentDataAccess, input: AgentDataQuery) => {
  if (!uuid(access.orgId) || !uuid(access.userId)) throw new Error('سازمان و کاربر جاری برای خواندن داده معتبر نیستند.');
  const module = access.modules.find(item => item.id === input.moduleId);
  if (!module || !column(module.table)) throw new Error('ماژول در محدودهٔ مجاز ایجنت نیست.');
  const allowedFields = new Map(module.fields.filter(field => column(field.key)).map(field => [field.key, field]));
  const fields = [...new Set(input.fields?.length ? input.fields : module.fields.slice(0, 12).map(field => field.key))];
  for(const key of ['name','title','full_name','business_name','display_name','system_code','invoice_date','total_invoice_amount','currency_code']) if(fields.length<40&&allowedFields.has(key)&&!fields.includes(key)) fields.push(key);
  if (!fields.length || fields.length > 40 || fields.some(field => !allowedFields.has(field))) throw new Error('فیلدهای درخواست‌شده مجاز نیستند.');
  const anyFilters = input.anyFilters || [];
  if (!Array.isArray(anyFilters) || anyFilters.length > 20) throw new Error('تعداد شرط‌های جایگزین معتبر نیست.');
  if (input.filters !== undefined && !Array.isArray(input.filters)) throw new Error('شرط‌های درخواست معتبر نیستند.');
  const filters = [...(input.filters || []), ...anyFilters];
  if (!Array.isArray(filters) || filters.length > 20) throw new Error('تعداد شرط‌های درخواست معتبر نیست.');
  const conditions: string[] = [];
  const permitted = permissionGroups(module.viewConditions);
  conditions.push(...permitted.all.map(permissionPredicate));
  if (permitted.any.length) conditions.push(`or(${permitted.any.map(permissionPredicate).join(',')})`);
  const queryConditions: string[] = [];
  for (const filter of filters) {
    const referenceFilter = filter.field === 'id' && (filter.operator === 'eq' && uuid(filter.value)
      || filter.operator === 'in' && Array.isArray(filter.value) && filter.value.every(uuid));
    if (!allowedFields.has(filter.field) && !referenceFilter) throw new Error('فیلد شرط در محدودهٔ دسترسی نیست.');
    if (filter.operator === 'in') {
      if (!Array.isArray(filter.value) || !filter.value.length || filter.value.length > 100) throw new Error('فهرست مقادیر شرط معتبر نیست.');
      queryConditions.push(`${filter.field}.in.(${filter.value.map(quote).join(',')})`);
    } else if (filter.operator === 'is') {
      if (![null, true, false].includes(filter.value as any)) throw new Error('شرط تهی یا منطقی معتبر نیست.');
      queryConditions.push(`${filter.field}.is.${filter.value === null ? 'null' : filter.value}`);
    } else if (filter.operator === 'contains') {
      if (typeof filter.value !== 'string') throw new Error('عبارت جست‌وجو معتبر نیست.');
      // Keep wildcards supplied by the model literal; this is a contains query.
      queryConditions.push(`${filter.field}.ilike.${quote(`*${filter.value.replace(/[%*_]/g, '')}*`)}`);
    } else if (['eq', 'neq', 'gt', 'gte', 'lt', 'lte'].includes(filter.operator)) {
      queryConditions.push(`${filter.field}.${filter.operator}.${quote(filter.value)}`);
    } else throw new Error('عملگر شرط پشتیبانی نمی‌شود.');
  }
  const requiredCount = filters.length - anyFilters.length;
  conditions.push(...queryConditions.slice(0, requiredCount));
  if (anyFilters.length) conditions.push(`or(${queryConditions.slice(requiredCount).join(',')})`);
  const roleCondition = (ids: string[]) => `and(assignee_type.eq.role,or(assignee_role_id.in.(${ids.join(',')}),and(assignee_role_id.is.null,assignee_id.in.(${ids.join(',')}))))`;
  if (module.recordScope === 'own') conditions.push(`and(assignee_type.eq.user,assignee_id.eq.${access.userId})`);
  else if (module.recordScope === 'team') {
    if (!uuid(access.roleId)) throw new Error('نقش جاری برای محدودهٔ تیم مشخص نیست.');
    conditions.push(roleCondition([access.roleId!]));
  } else if (module.recordScope === 'subtree') {
    const users = [...new Set([access.userId, ...access.allowedUserIds])].filter(uuid);
    const roles = [...new Set(access.allowedRoleIds)].filter(uuid);
    conditions.push(`or(and(assignee_type.eq.user,assignee_id.in.(${users.join(',')}))${roles.length ? `,${roleCondition(roles)}` : ''})`);
  } else if (module.recordScope !== 'all') throw new Error('محدودهٔ رکورد معتبر نیست.');
  if (input.afterId) {
    if (!uuid(input.afterId)) throw new Error('نشانگر ادامهٔ داده معتبر نیست.');
    conditions.push(`id.gt.${input.afterId}`);
  }
  const size = input.pageSize ?? 100;
  if (!Number.isInteger(size) || size < 1 || size > 200) throw new Error('اندازهٔ صفحه باید بین ۱ و ۲۰۰ باشد.');
  const params: Record<string, string | number> = { org_id: `eq.${access.orgId}`,
    select: [...new Set(['id', ...fields])].join(','), order: 'id.asc', limit: size + 1 };
  if (conditions.length) params.and = `(${conditions.join(',')})`;
  return { module, fields, pageSize: size, params };
};

export const readAgentDataPage = async (access: AgentDataAccess, query: AgentDataQuery, read: (
  table: string, params: Record<string, string | number>
) => Promise<Record<string, unknown>[]>) => {
  const compiled = compileAgentDataQuery(access, query);
  const rows = await read(compiled.module.table, compiled.params);
  let hasMore = rows.length > compiled.pageSize;
  const page = rows.slice(0, compiled.pageSize);
  if (page.some(row => !uuid(row.id))) throw new Error('شناسهٔ رکورد منبع برای ادامهٔ خواندن معتبر نیست.');
  // Defense in depth: transport responses cannot add fields denied to the actor.
  const records: Array<{ reference: unknown; fields: Record<string, unknown>; truncatedFields: string[] }> = [];
  let responseSize = 0;
  for (const row of page) {
    const truncatedFields: string[] = [];
    const fields = Object.fromEntries(compiled.fields.map(field => {
      const value = row[field] ?? null;
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      if (serialized && serialized.length > 1000) { truncatedFields.push(field); return [field, serialized.slice(0, 1000)]; }
      return [field, value];
    }));
    const record = { reference: row.id, display: describeAiRecord(fields), fields, truncatedFields };
    const size = JSON.stringify(record).length;
    if (records.length && responseSize + size > 48000) { hasMore = true; break; }
    records.push(record); responseSize += size;
  }
  return { moduleId: compiled.module.id, label: compiled.module.label, records, hasMore,
    nextAfterId: hasMore && records.length ? String(records[records.length - 1].reference) : null,
    coverage: hasMore || query.afterId ? 'page' as const : 'complete' as const };
};

/** Count uses the database's exact count; row limits never become a fake total. */
export const countAgentData = async (access: AgentDataAccess, query: AgentDataQuery,
  count: (table: string, params: Record<string, string | number>) => Promise<number>) => {
  if (query.afterId) throw new Error('شمارش کل نباید نشانگر صفحه داشته باشد.');
  const compiled = compileAgentDataQuery(access, query);
  const total = await count(compiled.module.table, { ...compiled.params, select: 'id', limit: 1 });
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('شمارش دقیق پایگاه داده تأیید نشد.');
  return { moduleId: query.moduleId, count: total, coverage: 'complete' };
};

/** Decimal-safe aggregation over keyset pages. A work budget yields an explicit
 * continuation, never a silently truncated organization-wide statistic. */
export const aggregateAgentData = async (access: AgentDataAccess, query: AgentDataQuery & { field: string },
  read: (table: string, params: Record<string, string | number>) => Promise<Record<string, unknown>[]>,
  budget: { maxPages?: number; deadline?: number } = {}) => {
  const module = access.modules.find(item => item.id === query.moduleId);
  const field = module?.fields.find(item => item.key === query.field);
  if (!field || !['number','currency','money','decimal','integer','percent','percentage'].includes(field.type)) throw new Error('تجمیع فقط روی فیلد عددی مجاز است.');
  let cursor = query.afterId || null, count = 0, nonNullCount = 0, scale = 0;
  let sum = 0n, min: bigint | null = null, max: bigint | null = null;
  let hasMore = true;
  const maxPages = Math.min(100, Math.max(1, budget.maxPages ?? 50));
  const deadline = budget.deadline ?? Date.now() + 20000;
  for (let page = 0; page < maxPages && Date.now() < deadline; page++) {
    const compiled = compileAgentDataQuery(access, { ...query, fields: [query.field], pageSize: 200, afterId: cursor });
    const rows = await read(compiled.module.table, { ...compiled.params, select: `id,${query.field}::text` });
    const values = rows.slice(0, 200);
    for (const row of values) {
      if (!uuid(row.id)) throw new Error('ادامهٔ تجمیع معتبر نیست.');
      count++;
      if (row[query.field] == null) continue;
      const value = String(row[query.field]);
      if (!/^-?\d{1,30}(?:\.\d{1,12})?$/.test(value)) throw new Error('دادهٔ عددی با دقت قابل‌تأیید نیست؛ تجمیع انجام نشد.');
      const digits = value.split('.')[1]?.length || 0;
      if (digits > scale) { const factor = 10n ** BigInt(digits - scale); sum *= factor; if (min !== null) min *= factor; if (max !== null) max *= factor; scale = digits; }
      const integer = BigInt(value.replace('.', '')) * 10n ** BigInt(scale - digits);
      sum += integer; nonNullCount++; min = min === null || integer < min ? integer : min; max = max === null || integer > max ? integer : max;
    }
    hasMore = rows.length > 200;
    cursor = values.length ? String(values[values.length - 1].id) : cursor;
    if (!hasMore) break;
  }
  const decimal = (value: bigint | null) => {
    if (value === null) return null;
    const sign = value < 0 ? '-' : '', digits = (value < 0 ? -value : value).toString().padStart(scale + 1, '0');
    return sign + (scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits);
  };
  return { moduleId: query.moduleId, field: query.field, count, nonNullCount, sum: decimal(sum), min: decimal(min), max: decimal(max),
    hasMore, nextAfterId: hasMore ? cursor : null, coverage: hasMore || query.afterId ? 'partial' : 'complete',
    message: hasMore ? 'این بخش از تجمیع است؛ با nextAfterId ادامه بده و آن را آمار کل معرفی نکن.' : undefined };
};

const filterSchema = { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, operator: { type: 'string', enum: ['eq','neq','gt','gte','lt','lte','in','is','contains'] }, value: {} }, required: ['field','operator','value'], additionalProperties: false } };
export const AGENT_DATA_TOOLS = [{ type: 'function', function: {
  name: 'read_organization_data',
  description: 'خواندن دادهٔ واقعی و مجاز سازمان با شرط و ادامهٔ صفحه‌ها. نتیجهٔ یک صفحه را به کل داده تعمیم نده؛ تا وقتی hasMore=true است برای ادامه nextAfterId را در afterId بفرست. از reference فقط در ابزار و پیوند داخلی استفاده کن؛ شناسهٔ خام را به مخاطب نشان نده.',
  parameters: { type: 'object', properties: {
    moduleId: { type: 'string' }, fields: { type: 'array', items: { type: 'string' } },
    filters: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, operator: { type: 'string', enum: ['eq','neq','gt','gte','lt','lte','in','is','contains'] }, value: {} }, required: ['field','operator','value'], additionalProperties: false } },
    anyFilters: filterSchema,
    pageSize: { type: 'integer', minimum: 1, maximum: 200 }, afterId: { type: ['string','null'] },
  }, required: ['moduleId'], additionalProperties: false },
} }, { type: 'function', function: { name: 'count_organization_data', description: 'شمارش دقیق همهٔ رکوردهای مجاز مطابق شرط در پایگاه داده، بدون محدودیت تعداد رکوردهای یک صفحه.',
  parameters: { type: 'object', properties: { moduleId: { type: 'string' }, filters: filterSchema, anyFilters: filterSchema }, required: ['moduleId'], additionalProperties: false } } },
{ type: 'function', function: { name: 'aggregate_organization_data', description: 'جمع، کمینه و بیشینهٔ دقیق یک فیلد عددی مجاز با شرط. coverage=partial یعنی آمار یک بخش؛ با nextAfterId ادامه بده. عدد اعشاری به‌صورت رشته بازمی‌گردد تا دقت مالی حفظ شود.',
  parameters: { type: 'object', properties: { moduleId: { type: 'string' }, field: { type: 'string' }, filters: filterSchema, anyFilters: filterSchema, afterId: { type: ['string','null'] } }, required: ['moduleId','field'], additionalProperties: false } } }];
