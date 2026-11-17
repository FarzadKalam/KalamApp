import { compileAgentDataQuery, type AgentDataAccess } from './ai-agent-data.ts';
import { createProcessDataRuntime, sanitizeProcessValue } from './ai-process-data.ts';

// These are persisted sources used by HRPage's calculation and commission
// modals, not a second implementation of payroll mathematics.
export const EMPLOYEE_DATA_SOURCES = {
  payroll_entries: { table: 'payroll_calculation_entries', label: 'محاسبات ثبت‌شده حقوق و پورسانت', fields: ['employee_id','period_start','period_end','entry_type','source_type','source_module_id','source_record_id','title','amount','quantity','rate','status','payroll_slip_id','details','created_at','updated_at'] },
  performance_rules: { table: 'activity_performance_rules', label: 'قواعد محاسبه عملکرد', fields: ['employee_id','name','task_type','formula_id','output_type','priority','conditions_all','conditions_any','config','is_active','created_at','updated_at'] },
  commission_rules: { table: 'commission_rules', label: 'قواعد پورسانت', fields: ['employee_id','name','product_id','basis','formula_id','percentage','priority','conditions_all','conditions_any','config','is_active','created_at','updated_at'] },
  commission_drafts: { table: 'commission_drafts', label: 'پیش‌نویس‌های ذخیره‌شده پورسانت', fields: ['employee_id','period_start','period_end','source_basis','percent_mode','eligibility_event_type','eligibility_event_at','invoice_id','invoice_item_key','entitled_amount','posted_amount','remaining_amount','decision_status','decision_reason','deferred_from_period','deferred_to_period','draft_status','details','created_at','updated_at'] },
  goal_contributions: { table: 'goal_contributions', label: 'عملکرد ثبت‌شده اهداف', fields: ['employee_id','goal_id','profile_id','module_id','record_id','period_start','period_end','metric_value','contribution_status','source_snapshot','created_at','updated_at'] },
} as const;

export const EMPLOYEE_DATA_TOOLS = [{ type: 'function', function: {
  name: 'read_employee_context',
  description: 'محاسبات ذخیره‌شده حقوق و پورسانت، قواعد عملکرد و اهداف یک کارمند مجاز. ابتدا کارمند را با ابزار داده پیدا کن. برای مبالغ و نحوه محاسبه details و برای فیش lines و performance_snapshot را بخوان. پیش‌نمایش ذخیره‌نشده مودال داده ثبت‌شده نیست. در field حالت جزئیات JSON با path و offset قابل ادامه است.',
  parameters: { type: 'object', properties: {
    employeeId: { type: 'string' }, section: { type: 'string', enum: Object.keys(EMPLOYEE_DATA_SOURCES) },
    periodStart: { type: 'string' }, periodEnd: { type: 'string' }, sourceType: { type: 'string' },
    afterId: { type: ['string','null'] }, recordId: { type: 'string' }, field: { type: 'string' },
    path: { type: 'array', items: { type: 'string' }, maxItems: 12 }, offset: { type: 'integer', minimum: 0 },
    pageSize: { type: 'integer', minimum: 1, maximum: 50 },
  }, required: ['employeeId','section'], additionalProperties: false },
} }];

export const createEmployeeDataRuntime = (options: {
  access: AgentDataAccess; actorScoped: boolean; canReadPayroll: boolean; canReadGoals: boolean;
  canReadSource: (section: string) => boolean;
  canReadGoalModule: (moduleId: string) => boolean;
  fieldAllowed: (moduleId: string, field: string) => boolean;
  read: (table: string, params: Record<string,string | number>) => Promise<any[]>;
}) => {
  const parents = createProcessDataRuntime(options);
  return { tools: EMPLOYEE_DATA_TOOLS, execute: async (args: any) => {
    const source = EMPLOYEE_DATA_SOURCES[args.section as keyof typeof EMPLOYEE_DATA_SOURCES];
    if (!source || !options.actorScoped || !options.canReadSource(args.section)) throw new Error('خواندن این منبع منابع انسانی تأیید نشد.');
    await parents.execute({ moduleId: 'employees', recordId: args.employeeId, section: 'record', fields: ['full_name'] });
    if (!options.canReadPayroll || ['base_salary','hourly_rate','commission_percentage','salary_calculation_notes'].some(field => !options.fieldAllowed('employees',field))) throw new Error('دسترسی جزئیات محاسبه حقوق تأیید نشد.');
    const payroll = options.access.modules.find(module => module.id === 'payroll_slips');
    if (!payroll) throw new Error('دسترسی فیش حقوق تأیید نشد.');
    const conditions = payroll?.viewConditions;
    if (conditions && [conditions.conditions_all,conditions.conditions_any,conditions.conditions].some(items => Array.isArray(items) && items.length)) throw new Error('شرط اختصاصی دسترسی فیش به خواندن دفتر محاسبات قابل تعمیم نیست.');
    if (payroll && payroll.recordScope !== 'all') {
      if (payroll.recordScope !== 'own') throw new Error('محدوده نقش حقوق به بررسی اختصاصی نیاز دارد.');
      const own = await parents.execute({ moduleId: 'employees',recordId: args.employeeId,section: 'record',fields: ['related_profile_id'] });
      if (own.records[0]?.related_profile_id !== options.access.userId) throw new Error('محاسبات حقوق این همکار در محدوده شخصی شما نیست.');
    }
    if (args.section === 'goal_contributions' && !options.canReadGoals) throw new Error('دسترسی اهداف تأیید نشد.');
    const rules = ['performance_rules','commission_rules'].includes(args.section);
    const filters: any[] = rules ? [] : [{ field: 'employee_id', operator: 'eq', value: args.employeeId }];
    if (args.section === 'goal_contributions') {
      const modules = options.access.modules.map(module => module.id).filter(options.canReadGoalModule);
      if (!modules.length) throw new Error('ماژول مجاز برای اهداف وجود ندارد.');
      filters.push({ field: 'module_id',operator: 'in',value: modules });
    }
    for (const [arg,field,operator] of [['periodStart','period_end','gte'],['periodEnd','period_start','lte']] as const) {
      if (args[arg]) {
        if (!source.fields.some(key => key === field) || !/^\d{4}-\d{2}-\d{2}$/.test(args[arg])) throw new Error('بازه محاسبه معتبر نیست.');
        filters.push({ field, operator, value: args[arg] });
      }
    }
    if (args.sourceType) {
      if (args.section !== 'payroll_entries') throw new Error('نوع منبع فقط در دفتر محاسبات قابل انتخاب است.');
      filters.push({ field: 'source_type', operator: 'eq', value: args.sourceType });
    }
    const permissionModule = args.section === 'goal_contributions' ? '__goals' : 'payroll_slips';
    const fields = source.fields.filter(key => options.fieldAllowed(permissionModule,key));
    const scopedAccess: AgentDataAccess = { ...options.access, modules: [{ id: source.table, table: source.table, label: source.label,
      fields: fields.map(key => ({ key,label: key,type: 'json' })), recordScope: 'all',
      viewConditions: { conditions_all: filters, conditions_any: rules
        ? [{ field: 'employee_id',operator: 'eq',value: args.employeeId },{ field: 'employee_id',operator: 'eq',value: null }] : [] } }] };
    const read = async (table: string,params: Record<string,string | number>) => {
      const query = args.section === 'goal_contributions' ? { ...params,select: `${params.select},module_id` } : params;
      return (await options.read(table,query)).map(row => sanitizeProcessValue(
        args.section === 'goal_contributions' && row.source_snapshot && row.module_id
          ? { ...row,source_snapshot: sanitizeProcessValue(row.source_snapshot,row.module_id,options.fieldAllowed) } : row,
        permissionModule,options.fieldAllowed));
    };
    const reader = createProcessDataRuntime({ ...options, read,access: scopedAccess,
      fieldAllowed: (_moduleId,field) => options.fieldAllowed(permissionModule,field) });
    if (args.field) {
      if (!args.recordId) throw new Error('رکورد محاسبه را از صفحه مجاز انتخاب کن.');
      return reader.execute({ moduleId: source.table, recordId: args.recordId, section: 'field', field: args.field,
        path: args.path, offset: args.offset, pageSize: args.pageSize });
    }
    const query = compileAgentDataQuery(scopedAccess,{ moduleId: source.table, fields, pageSize: args.pageSize ?? 20, afterId: args.afterId });
    const rows = await read(source.table,query.params);
    // The shared detail reader bounds large snapshots without losing a path
    // back to the source record.
    const records: Record<string,any>[] = []; let responseSize = 0;
    for (const row of rows.slice(0,query.pageSize)) {
      const record = Object.fromEntries(['id',...fields].map(key => [key,
        JSON.stringify(row[key] ?? null).length > 1000 ? { detailRequired: true, field: key } : row[key] ?? null]));
      const size = JSON.stringify(record).length;
      if (records.length && responseSize + size > 48000) break;
      records.push(record); responseSize += size;
    }
    const hasMore = rows.length > records.length;
    return { source: source.label, records,availableFields: fields, hasMore,
      nextAfterId: hasMore && records.length ? records[records.length - 1].id : null,
      coverage: hasMore || args.afterId ? 'page' : 'complete' };
  } };
};

