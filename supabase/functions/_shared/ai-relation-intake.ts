export const findRelationField = (schema: any,path: string) => {
  const fields = [...(schema?.fields || []),...(schema?.tables || []).flatMap((table: any) =>
    (table.columns || []).map((field: any) => ({ ...field,key: `${table.key}.${field.key}` })))];
  return fields.find(field => field.key === path);
};

/** Preparing a related record never writes domain data. It uses the ordinary
 * approval contract and cannot choose a target module independently. */
export const createRelationIntakeRuntime = (options: {
  sourceModuleId: string; sourceSchema: any;
  canCreate: (moduleId: string) => boolean;
  loadSchema: (moduleId: string) => Promise<any>;
  lookup: (args: any) => Promise<any>;
  prepare: (input: { moduleId: string; schema: any; fields: any; tables: any; origin: any }) => Promise<any>;
}) => ({ tools: [{ type: 'function',function: {
  name: 'prepare_relation_record',
  description: 'آماده‌سازی ساخت رکورد مرتبطِ واقعاً پیدا‌نشده، بدون ثبت. field مسیر رابطه در ماژول مبدأ است؛ مقصد از تعریف همان رابطه تعیین می‌شود. ابتدا mode=describe برای فیلدهای مجاز مقصد؛ سپس mode=prepare با query نام جست‌وجوشده و اطلاعات واقعی کاربر. در ابهام یا چند نتیجه ساخت نکن. کاربر کارت رکورد مرتبط را جدا تأیید می‌کند و سپس درخواست اصلی ادامه می‌یابد. ساخت کاربر و نقش از این ابزار ممنوع است.',
  parameters: { type: 'object',properties: { mode: { type: 'string',enum: ['describe','prepare'] },field: { type: 'string' },
    query: { type: 'string' },offset: { type: 'integer',minimum: 0 },fields: { type: 'object',additionalProperties: true },tables: { type: 'object',additionalProperties: true } },
    required: ['mode','field'],additionalProperties: false },
} }], execute: async (args: any) => {
  const field = findRelationField(options.sourceSchema,args.field);
  const moduleId = field?.relationTargetModule;
  if (!moduleId || ['profiles','org_roles'].includes(moduleId) || ['user','role'].includes(field.type) || !options.canCreate(moduleId)) throw new Error('ساخت این نوع رکورد مرتبط مجاز نیست.');
  const schema = await options.loadSchema(moduleId);
  if (args.mode === 'describe') {
    const offset = args.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('صفحه فیلدها معتبر نیست.');
    const definitions = [...(schema.fields || []).map((field: any) => ({ ...field,path: field.key })),
      ...(schema.tables || []).flatMap((table: any) => (table.columns || []).map((field: any) => ({ ...field,path: `${table.key}.${field.key}` })))];
    return { moduleId,label: schema.moduleLabel,fields: definitions.slice(offset,offset+25).map((field: any) => ({
      key: field.path,label: field.label,type: field.type,required: field.required,readonly: field.readonly,
      defaultValue: typeof field.defaultValue === 'string' ? field.defaultValue.slice(0,160) : typeof field.defaultValue === 'number' ? field.defaultValue : undefined,
      relationTargetModule: field.relationTargetModule,hasOptions: Boolean(field.options?.length || field.dynamicOptionsCategory),
    })),nextOffset: definitions.length > offset+25 ? offset+25 : null,
      message: 'فقط اطلاعات داده‌شده یا پیش‌فرض معتبر را استفاده کن؛ مقصد را ابتدا جست‌وجو کن. گزینه‌های فیلد را از get_organization_field_options بگیر.' };
  }
  if (args.mode !== 'prepare' || typeof args.query !== 'string' || !args.query.trim()) throw new Error('نام رکورد مرتبط برای جست‌وجو مشخص نیست.');
  const existing = await options.lookup({ moduleId: options.sourceModuleId,field: args.field,query: args.query,offset: 0 });
  if (existing.records?.length || existing.hasMore) return { prepared: false,existing,
    message: 'گزینه‌های موجود را بررسی کن؛ برای همین نام رکورد تازه ساخته نشد.' };
  return options.prepare({ moduleId,schema,fields: args.fields || {},tables: args.tables || {},
    origin: { source_module_id: options.sourceModuleId,field: args.field,query: args.query } });
} });

