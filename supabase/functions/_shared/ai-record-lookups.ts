import {describeAiRecord} from './ai-record-display.ts';
/** Shared, paginated field lookup. Field and destination come from the authorized schema. */
export const normalizePersonName = (value: unknown) => String(value ?? '').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
  .replace(/^(?:خانم|آقای|آقا)\s+/, '').replace(/[\u200c\s]+/g, ' ').trim();

export const createAiRecordLookupRuntime = (options: {
  moduleIds: string[];
  loadSchema: (moduleId: string) => Promise<any>;
  read: (table: string, query: Record<string, any>) => Promise<any[]>;
  tableForModule: (moduleId: string) => string;
  canReadModule: (moduleId: string) => boolean;
  orgId: string;
  identityLookup?: (kind: 'user' | 'role', query: string, offset: number) => Promise<any[]>;
  canReadRecord?: (moduleId: string, row: any) => boolean;
}) => ({
  tools: [{ type: 'function', function: { name: 'lookup_record_field',
    description: 'جست‌وجوی مقدار واقعی فیلد مسئول، کاربر، نقش یا ارتباط از نام انسانی؛ شناسه را از کاربر نخواه. در ابهام از نام گزینه‌ها سؤال کن. برای ادامه offset را بفرست.',
    parameters: { type: 'object', properties: { moduleId: { type: 'string' }, field: { type: 'string' }, query: { type: 'string' }, offset: { type: 'integer', minimum: 0 } }, required: ['moduleId', 'field', 'query'], additionalProperties: false } } }],
  execute: async (name: string, args: any) => {
    if (name !== 'lookup_record_field') throw new Error('ابزار جست‌وجو معتبر نیست.');
    if (!options.moduleIds.includes(args.moduleId)) throw new Error('ماژول جست‌وجو در دسترس این ایجنت نیست.');
    const schema = await options.loadSchema(args.moduleId);
    const field = schema.fields?.find((item: any) => item.key === args.field);
    if (!field) throw new Error('این فیلد در دسترس نیست.');
    const isUser = field.type === 'user';
    const isRole = field.type === 'role';
    const target = field.relationTargetModule;
    if (!isUser && !isRole && (!target || !options.canReadModule(target))) throw new Error('جست‌وجوی ارتباط مجاز نیست.');
    const table = isUser ? 'profiles' : isRole ? 'org_roles' : options.tableForModule(target);
    const targetSchema = !isUser && !isRole ? await options.loadSchema(target) : null;
    const searchFields = isUser ? ['full_name'] : isRole ? ['title'] : (targetSchema.fields || [])
      .filter((item: any) => ['name', 'title', 'full_name', 'business_name', 'system_code'].includes(item.key)).map((item: any) => item.key);
    const term = normalizePersonName(args.query).replace(/[%_*,()."\\]/g, '').slice(0, 120);
    if (!term || !searchFields.length) return { records: [], hasMore: false };
    const offset = Math.max(0, Math.floor(Number(args.offset) || 0));
    if ((isUser || isRole) && options.identityLookup) {
      const rows = await options.identityLookup(isUser ? 'user' : 'role', term, offset);
      return { records: rows.slice(0, 25).map((row: any) => ({ id: row.id, title: row.label, subtitle: row.subtitle })),
        hasMore: rows.length > 25, nextOffset: rows.length > 25 ? offset + 25 : null };
    }
    // Relation scope rules can depend on any configured field; only 26 candidates
    // are read and only the permitted human title is returned to the model.
    const rows = await options.read(table, { org_id: `eq.${options.orgId}`, select: !isUser && !isRole ? '*' : ['id', ...searchFields].join(','),
      or: `(${searchFields.map((key: string) => `${key}.ilike.*${term}*`).join(',')})`, order: 'id.asc', offset, limit: 26 });
    return { records: rows.slice(0, 25).filter((row: any) => isUser || isRole || !options.canReadRecord || options.canReadRecord(target, row))
      .map((row: any) => ({ id: row.id, title: describeAiRecord(row).label || searchFields.filter((key:string)=>key!=='system_code').map((key: string) => row[key]).filter(Boolean).join(' · ') })), hasMore: rows.length > 25, nextOffset: rows.length > 25 ? offset + 25 : null };
  },
});
