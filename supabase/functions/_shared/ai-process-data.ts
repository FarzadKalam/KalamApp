import { compileAgentDataQuery, type AgentDataAccess } from './ai-agent-data.ts';

// This describes the product contract, never a tenant's records. Keep it stable
// so providers can cache the shared training prefix across agent turns.
export const PROCESS_DATA_GUIDANCE = [
  'فرآیند: الگو تعریف است؛ اجرا نمونه مستقل؛ مرحله ممکن است پیش‌نویس یا فعالیت واقعی باشد. template_id هویت اجرا نیست؛ process_group_id، node و لینک‌های هر نمونه را حفظ کن.',
  'برای یافتن پروژه، الگو، اجرا و فعالیت از describe/read_organization_data با شرط استفاده کن. read_process_context جزئیات stages، tasks، runs، links، drafts و activators را برای رکورد مجاز می‌خواند.',
  'برای فیلدهای عمومی از فهرست فیلدهای مجاز؛ برای تعریف، مقدار و وضعیت اختصاصی و اتوماسیون از recurrence_info فعالیت و metadata مرحله استفاده کن. snapshot فعالیت بر الگوی فعلی مقدم است.',
  'اگر snapshot فعالیت قدیمی خالی بود، از process_run_id/process_run_stage_id و سپس source_template_id/source_stage_sort_order برای خواندن metadata مرحله مرتبط استفاده کن؛ نبود snapshot را نبود فیلد معرفی نکن.',
  'فقط بخش لازم را بخوان. field به همراه path و offset جزئیات JSON یا متن بلند را ادامه می‌دهد. hasMore و nextAfterId/nextOffset یعنی ادامه؛ صفحه یا خطا را نبود داده یا آمار کل معرفی نکن.',
  'زمان‌ها: برنامه start_date/due_date، شروع و پایان واقعی actual_start_at/actual_end_at، تکمیل completed_at؛ مسئول می‌تواند کاربر، نقش یا ارجاع پویا باشد. نام را از ابزار جست‌وجوی مسئول بازیابی کن.',
  'هیچ ادعای دسترسی کاملِ بدون خواندن نکن. همه خواندن‌ها تابع سازمان، مجوز فیلد/رکورد و پلن‌اند. هر تغییر فقط پیشنهاد کارت مرکزی است؛ پس از یک تأیید، نتیجه واقعی و پیوند رکوردها نمایش داده می‌شود.',
].join('\n');

// Canonical runtime columns not present in editable form schemas.
export const PROCESS_RECORD_FIELDS: Record<string, string[]> = {
  tasks: ['recurrence_info','process_run_id','process_run_stage_id','source_template_id','source_stage_sort_order','source_module_id','source_record_id','process_group_id','process_node_key','process_lane_key','assignee_type','assignee_role_id','updated_at'],
  process_templates: ['process_kind','auto_copy_mode'],
  process_runs: ['created_at','updated_at'],
};
export const PROCESS_WORKFLOW_FIELDS = ['name','description','is_active','scope_type','module_id','process_template_id','process_trigger_key','trigger_type','execution_mode','conditions_all','conditions_any','actions','interval_value','interval_unit','interval_at','interval_first_run_at','interval_minute','interval_allowed_from_hour','interval_allowed_to_hour','interval_day_of_month','interval_day_condition','interval_days_after_holiday','batch_size','created_at','updated_at'];
type Read = (table: string, params: Record<string, string | number>) => Promise<any[]>;
export type ProcessDataRuntime = ReturnType<typeof createProcessDataRuntime>;
const uuid = (id: unknown) => /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(String(id || ''));
const sensitive = (key: string) => /password|secret|api_?key|authorization|access_token|refresh_token|credential/i.test(key);
const heavy = new Set(['recurrence_info','metadata','execution_process_draft','template_stages_preview','run_stages_preview','actions','conditions_all','conditions_any']);

export const sanitizeProcessValue = (value: any, moduleId: string, fieldAllowed: (moduleId: string, field: string) => boolean, depth = 0): any => {
  if (depth > 30) throw new Error('عمق داده معتبر نیست.');
  if (Array.isArray(value)) return value.filter(item => !item?.key || fieldAllowed(moduleId,String(item.key))).map(item => sanitizeProcessValue(item,moduleId,fieldAllowed,depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !sensitive(key) && fieldAllowed(moduleId,key)).map(([key,val]) => [key,sanitizeProcessValue(val,moduleId,fieldAllowed,depth + 1)]));
};

export const PROCESS_DATA_TOOLS = [{ type: 'function', function: {
  name: 'read_process_context',
  description: 'جزئیات مجاز فرآیند بر اساس رکورد واقعی؛ انتخاب یک بخش و فیلدهای لازم، با ادامه صفحه و بدون بارگیری همه سازمان. برای field نام فیلد را بده؛ path مسیر داخل JSON و offset ادامه مقادیر است.',
  parameters: { type: 'object', properties: {
    moduleId: { type: 'string' }, recordId: { type: 'string' },
    section: { type: 'string', enum: ['record','stages','tasks','runs','links','drafts','activators','field'] },
    fields: { type: 'array', items: { type: 'string' }, maxItems: 30 },
    field: { type: 'string' }, childId: { type: 'string' }, path: { type: 'array', items: { type: 'string' }, maxItems: 12 },
    afterId: { type: ['string','null'] }, offset: { type: 'integer', minimum: 0 }, pageSize: { type: 'integer', minimum: 1, maximum: 50 },
    source: { type: 'string',enum: ['primary','links'] },
  }, required: ['moduleId','recordId','section'], additionalProperties: false },
} }];

export const createProcessDataRuntime = (options: {
  access: AgentDataAccess; read: Read; fieldAllowed: (moduleId: string, field: string) => boolean;
  taskRelationFields?: Record<string,string[]>;
}) => {
  const { access, read, fieldAllowed } = options;
  const moduleFor = (id: string) => {
    const module = access.modules.find(m => m.id === id);
    if (!module) throw new Error('این بخش در محدوده مجاز ایجنت و پلن شما نیست.');
    return module;
  };
  const clean = (value: any, moduleId: string) => sanitizeProcessValue(value,moduleId,fieldAllowed);
  const getRecord = async (moduleId: string, id: string, requested?: string[]) => {
    if (!uuid(id)) throw new Error('رکورد معتبر انتخاب نشده است.');
    const module = moduleFor(moduleId);
    const keys = requested || module.fields.map(f => f.key);
    if (!keys.length || keys.some(key => !module.fields.some(f => f.key === key) || !fieldAllowed(moduleId, key))) throw new Error('فیلد در محدوده دسترسی نیست.');
    // Split projections to respect the central 40-column query contract.
    let result: any = null;
    for (let start = 0; start < keys.length; start += 40) {
      const query = compileAgentDataQuery(access, { moduleId, fields: keys.slice(start, start + 40), filters: [{ field: 'id', operator: 'eq', value: id }], pageSize: 1 });
      const rows = await read(module.table, query.params);
      if (!rows[0] || rows[0].id !== id) throw new Error('رکورد پیدا نشد یا دسترسی به آن تأیید نشد.');
      result = { ...(result || {}), ...rows[0] };
    }
    return clean(Object.fromEntries(['id',...keys].filter(key => Object.prototype.hasOwnProperty.call(result,key)).map(key => [key,result[key]])), moduleId);
  };
  const present = (rows: any[], size: number, moduleId: string, afterId?: string | null) => {
    const result: any[] = []; let length = 0;
    for (const row of rows.slice(0, size)) {
      const safe = clean(row, moduleId); const n = JSON.stringify(safe).length;
      // No silent clipping of metadata; oversized items can be read by field/path.
      const item = n > 12000 ? { id: row.id, detailRequired: true, availableFields: Object.keys(safe), message: 'با section=field و childId جزئیات فیلد لازم را بخوان.' } : safe;
      const itemSize = JSON.stringify(item).length;
      if (result.length && length + itemSize > 20000) break;
      result.push(item); length += itemSize;
    }
    const hasMore = rows.length > result.length;
    return { records: result, hasMore, nextAfterId: hasMore && result.length ? result[result.length - 1].id : null,
      coverage: hasMore || afterId ? 'page' : 'complete' };
  };
  const execute = async (args: any) => {
    const { moduleId, recordId, section } = args;
    const module = moduleFor(moduleId);
    const size = args.pageSize ?? 20;
    if (!Number.isInteger(size) || size < 1 || size > 50 || args.afterId && !uuid(args.afterId)) throw new Error('صفحه درخواست معتبر نیست.');
    // A visible title/field proves parent scope before reading any child table.
    const probe = module.fields.find(f => !heavy.has(f.key));
    if (!probe) throw new Error('فیلد قابل مشاهده برای رکورد وجود ندارد.');
    await getRecord(moduleId, recordId, [probe.key]);
    if (section === 'record') {
      const fields = args.fields || module.fields.filter(f => !heavy.has(f.key)).slice(0, 30).map(f => f.key);
      const row = await getRecord(moduleId, recordId, fields);
      return present([row], 1, moduleId);
    }
    let child: any = null;
    if (section === 'stages' || section === 'field' && args.childId) {
      if (!['process_templates','process_runs'].includes(moduleId)) throw new Error('مرحله باید از الگو یا اجرای مشخص خوانده شود.');
      const gate = moduleId === 'process_templates' ? 'template_stages_preview' : 'run_stages_preview';
      if (!fieldAllowed(moduleId, gate)) throw new Error('دسترسی جزئیات مرحله مجاز نیست.');
      const table = moduleId === 'process_templates' ? 'process_template_stages' : 'process_run_stages';
      const parentKey = moduleId === 'process_templates' ? 'template_id' : 'process_run_id';
      const columns = moduleId === 'process_templates'
        ? ['stage_name','sort_order','default_status','default_assignee_id','default_assignee_role_id','auto_create_task','wage','process_node_key','process_lane_key','metadata']
        : ['stage_name','sort_order','status','task_id','assignee_user_id','assignee_role_id','wage','metadata','planned_due_at','started_at','completed_at'];
      const fields = args.childId ? [args.field] : args.fields || columns.filter(key => !heavy.has(key) && fieldAllowed(moduleId,key));
      if (fields.some((f: string) => !columns.includes(f) || !fieldAllowed(moduleId, f))) throw new Error('فیلد مرحله مجاز نیست.');
      if (args.childId && !uuid(args.childId)) throw new Error('مرحله معتبر نیست.');
      const rows = await read(table, { [parentKey]: `eq.${recordId}`, select: ['id',parentKey,...fields].join(','), order: 'id.asc', limit: args.childId ? 1 : size + 1,
        ...(args.childId ? { id: `eq.${args.childId}` } : args.afterId ? { id: `gt.${args.afterId}` } : {}) });
      if (!args.childId) return { ...present(rows, size, moduleId, args.afterId), detailFields: columns.filter(key => heavy.has(key) && fieldAllowed(moduleId,key)) };
      if (!rows[0]) throw new Error('مرحله پیدا نشد یا مجاز نیست.');
      child = clean(rows[0], moduleId);
    }
    if (section === 'field' || section === 'drafts') {
      const field = section === 'drafts' ? 'execution_process_draft' : String(args.field || '');
      const row = child || await getRecord(moduleId, recordId, [field]);
      let value = row[field];
      const path = args.path || [];
      if (!Array.isArray(path) || path.length > 12 || path.some((key: any) => typeof key !== 'string' || ['__proto__','constructor','prototype'].includes(key) || sensitive(key))) throw new Error('مسیر فیلد معتبر نیست.');
      for (const key of path) value = value && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
      const offset = args.offset ?? 0;
      if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('نشانگر ادامه معتبر نیست.');
      const kind = Array.isArray(value) ? 'array' : value && typeof value === 'object' ? 'object' : typeof value === 'string' ? 'text' : 'scalar';
      const source = kind === 'object' ? Object.entries(value) : value;
      const step = kind === 'text' ? 6000 : size;
      let slice = ['array','object','text'].includes(kind) ? source.slice(offset, offset + step) : value ?? null;
      while (JSON.stringify(slice).length > 16000 && Array.isArray(slice) && slice.length > 1) slice = slice.slice(0, Math.ceil(slice.length / 2));
      if (JSON.stringify(slice).length > 16000) return { detailRequired: true, kind, message: 'این مقدار بزرگ است؛ path را تا فیلد داخلی دقیق‌تر مشخص کن.', path, offset };
      const consumed = kind === 'text' ? slice.length : Array.isArray(slice) ? slice.length : 0;
      const hasMore = ['array','object','text'].includes(kind) && source.length > offset + consumed;
      return { field, path, kind, value: kind === 'object' ? Object.fromEntries(slice) : slice,
        hasMore, nextOffset: hasMore ? offset + consumed : null, coverage: hasMore || offset ? 'page' : 'complete' };
    }
    if (section === 'tasks' || section === 'activators') {
      const target = section === 'tasks' ? 'tasks' : 'workflows';
      const targetModule = moduleFor(target);
      if (section === 'activators' && moduleId !== 'process_templates') throw new Error('فعال‌کننده باید برای یک الگوی مشخص خوانده شود.');
      const taskSummary = ['name','status','task_type','priority','assignee_id','assignee_role_id','assignee_type','start_date','due_date','actual_start_at','actual_end_at','completed_at','process_run_id','process_run_stage_id'];
      const fields = args.fields || targetModule.fields.filter(f => !heavy.has(f.key) && (target !== 'tasks' || taskSummary.includes(f.key))).slice(0,25).map(f => f.key);
      const filters: any[] = section === 'activators'
        ? [{ field: 'scope_type', operator: 'eq', value: 'process_activator' }, { field: 'process_template_id', operator: 'eq', value: recordId }]
        : moduleId === 'process_runs' ? [{ field: 'process_run_id', operator: 'eq', value: recordId }] : [];
      const compiled = compileAgentDataQuery(access, { moduleId: target, fields, filters, afterId: args.afterId, pageSize: size });
      const params = { ...compiled.params };
      if (section === 'tasks' && moduleId !== 'process_runs') {
        if (!/^[a-z_][a-z0-9_]*$/.test(moduleId)) throw new Error('ماژول معتبر نیست.');
        const related=(options.taskRelationFields?.[moduleId] || []).filter(key => /^[a-z_][a-z0-9_]*$/.test(key)).map(key => `${key}.eq.${recordId}`);
        params.and = `(${String(params.and || '()').slice(1,-1)}${params.and ? ',' : ''}or(and(source_module_id.eq.${moduleId},source_record_id.eq.${recordId}),recurrence_info->process_links->>${moduleId}.eq.${recordId}${related.length ? ','+related.join(',') : ''}))`;
      }
      return present(await read(targetModule.table, params), size, target, args.afterId);
    }
    if (section === 'runs' || section === 'links') {
      moduleFor('process_runs');
      if (section === 'runs' && moduleId !== 'process_runs' && args.source !== 'links') {
        if (!/^[a-z_][a-z0-9_]*$/.test(moduleId)) throw new Error('ماژول معتبر نیست.');
        const query=compileAgentDataQuery(access,{ moduleId: 'process_runs',fields: ['process_name'],pageSize: size,afterId: args.afterId });
        query.params.and=`(${String(query.params.and || '()').slice(1,-1)}${query.params.and ? ',' : ''}module_id.eq.${moduleId},record_id.eq.${recordId})`;
        const result=present(await read('process_runs',query.params),size,'process_runs',args.afterId);
        return { ...result,records: result.records.map(row => ({ ...row,process_run_id: row.id })),source: 'primary',
          nextSource: result.hasMore ? 'primary' : 'links',coverage: 'page',message: 'پس از پایان صفحه‌های primary، source=links را از ابتدا بخوان تا ارتباط‌های چندماژولی هم بررسی شوند.' };
      }
      const rows = await read('process_run_links', {
        org_id: `eq.${access.orgId}`,
        ...(moduleId === 'process_runs' ? { process_run_id: `eq.${recordId}` } : { module_id: `eq.${moduleId}`, record_id: `eq.${recordId}` }),
        select: 'id,process_run_id,module_id,record_id,is_primary', order: 'id.asc', limit: size + 1,
        ...(args.afterId ? { id: `gt.${args.afterId}` } : {}),
      });
      const visible = [];
      for (const row of rows.slice(0, size)) {
        if (section === 'runs' && moduleId !== 'process_runs' && row.is_primary) continue;
        try {
          await getRecord('process_runs', row.process_run_id, ['process_name']);
          if (section === 'links') await getRecord(row.module_id, row.record_id, [moduleFor(row.module_id).fields.find(f => !heavy.has(f.key))!.key]);
          visible.push(row);
        } catch (error) {
          if (!String(error?.message).includes('دسترسی') && !String(error?.message).includes('محدوده') && !String(error?.message).includes('پیدا نشد')) throw error;
        }
      }
      return { records: visible, hasMore: rows.length > size, nextAfterId: rows.length > size ? rows[size - 1].id : null, coverage: rows.length > size || args.afterId ? 'page' : 'complete' };
    }
    throw new Error('بخش درخواستی پشتیبانی نمی‌شود.');
  };
  // Deduplicate identical reads within this request only. Never share across orgs,
  // actors, turns or mutations, and never cache errors as an empty result.
  const inFlight = new Map<string, Promise<any>>();
  const allStages = async (moduleId: string, recordId: string) => {
    if (!['process_templates','process_runs'].includes(moduleId)) throw new Error('نوع مرحله معتبر نیست.');
    await getRecord(moduleId, recordId, [moduleFor(moduleId).fields[0].key]);
    const gate = moduleId === 'process_templates' ? 'template_stages_preview' : 'run_stages_preview';
    if (!fieldAllowed(moduleId,gate) || !fieldAllowed(moduleId,'metadata')) throw new Error('دسترسی snapshot کامل مرحله برای این اقدام تأیید نشد.');
    const parentKey = moduleId === 'process_templates' ? 'template_id' : 'process_run_id';
    const table = moduleId === 'process_templates' ? 'process_template_stages' : 'process_run_stages';
    const fields = moduleId === 'process_templates'
      ? ['id','template_id','stage_name','sort_order','default_status','default_assignee_id','default_assignee_role_id','auto_create_task','wage','process_node_key','process_lane_key','metadata']
      : ['id','process_run_id','template_stage_id','stage_name','sort_order','status','task_id','assignee_user_id','assignee_role_id','wage','metadata','planned_due_at','started_at','completed_at'];
    const result: any[] = []; let afterId: string | null = null;
    do {
      const rows = await read(table,{ [parentKey]: `eq.${recordId}`,select: fields.join(','),order: 'id.asc',limit: 100,...(afterId ? { id: `gt.${afterId}` } : {}) });
      // Internal execution snapshots are never sent to the model. Preserve
      // their nested configuration when copying a permitted template.
      result.push(...rows);
      afterId = rows.length === 100 ? rows[99].id : null;
      if (afterId && !uuid(afterId)) throw new Error('ادامه خواندن مرحله معتبر نیست.');
    } while (afterId);
    return result.sort((a,b) => Number(a.sort_order || 0)-Number(b.sort_order || 0));
  };
  return { tools: PROCESS_DATA_TOOLS, getRecord, allStages, execute: (args: any) => {
    const key = JSON.stringify(args);
    if (!inFlight.has(key)) inFlight.set(key, execute(args).catch(error => { inFlight.delete(key); throw error; }));
    return inFlight.get(key)!;
  } };
};
