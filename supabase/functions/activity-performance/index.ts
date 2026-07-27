// محاسبهٔ مرکزی عملکرد فعالیت و آماده‌سازی idempotent اقلام فیش.
// داده با JWT کاربر خوانده می‌شود تا RLS همهٔ tenantها را حفظ کند.
import { evaluateCoreConditionOperator, evaluateConditionCollection } from './_runtime-deps/recordRuntime.ts';
import { evaluateFormulaExpression } from './_runtime-deps/formulaRuntime.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const response = (status: number, payload: Record<string, unknown>) => new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } });
const PAGE_SIZE = 1000;
const number = (value: unknown) => { const parsed = Number(String(value ?? '').replace(/,/g, '').trim()); return Number.isFinite(parsed) ? parsed : 0; };
const asObject = (value: any) => value && typeof value === 'object' && !Array.isArray(value) ? value : typeof value === 'string' ? (() => { try { return JSON.parse(value); } catch { return {}; } })() : {};
const taskTemplateId = (task: any) => String(asObject(task?.recurrence_info)?.process_group?.template_id || task?.source_template_id || asObject(task?.recurrence_info)?.source_template_id || '').trim();
const taskWithCustomFields = (task: any) => {
  const recurrence = asObject(task?.recurrence_info);
  const fields = Array.isArray(recurrence.process_task_custom_fields) ? recurrence.process_task_custom_fields : [];
  const values = asObject(recurrence.process_task_custom_field_values);
  const templateId = taskTemplateId(task);
  return fields.reduce((result: any, field: any) => {
    const key = String(field?.key || '').trim();
    if (!key) return result;
    const value = values[key] ?? task?.[key];
    result[key] = value;
    if (templateId) result[`__activity_process_field__${templateId}__${key}`] = value;
    return result;
  }, { ...(task || {}) });
};
const conditionValue = (record: any, field: string) => field.split('.').reduce((current, key) => current?.[key], record);
const conditionsPass = async (conditionsAll: any[], conditionsAny: any[], task: any) => evaluateConditionCollection({
  conditionsAll: Array.isArray(conditionsAll) ? conditionsAll : [],
  conditionsAny: Array.isArray(conditionsAny) ? conditionsAny : [],
  evaluate: async (condition: any) => {
    const result = evaluateCoreConditionOperator({ operator: String(condition?.operator || 'eq'), currentValue: conditionValue(task, String(condition?.field || '')), expectedValue: condition?.value });
    return result === undefined ? false : result;
  },
});
const eligibleRule = (rule: any, task: any, employeeId: string) => {
  if (rule?.is_active === false) return false;
  if (String(rule?.employee_id || '').trim() && String(rule.employee_id) !== employeeId) return false;
  if (String(rule?.task_type || '').trim() && String(rule.task_type) !== String(task?.task_type || '')) return false;
  const config = asObject(rule?.config);
  const profileIds = Array.isArray(config.assignee_profile_ids) ? config.assignee_profile_ids.map(String) : [];
  const roleIds = Array.isArray(config.assignee_role_ids) ? config.assignee_role_ids.map(String) : [];
  if (profileIds.length && !profileIds.includes(String(task?.assignee_id || ''))) return false;
  if (roleIds.length && !roleIds.includes(String(task?.assignee_role_id || ''))) return false;
  const scope = String(config.process_scope || 'all_processes'); const templateId = taskTemplateId(task);
  if (scope === 'no_process' && templateId) return false;
  if (scope === 'specific_processes' && (!templateId || !(Array.isArray(config.process_template_ids) ? config.process_template_ids.map(String) : []).includes(templateId))) return false;
  return true;
};
const taskMetrics = (task: any) => {
  const due = task?.due_at || task?.due_date; const completed = task?.completed_at;
  const dueTime = due ? new Date(due).getTime() : NaN; const completedTime = completed ? new Date(completed).getTime() : NaN;
  const difference = Number.isFinite(dueTime) && Number.isFinite(completedTime) ? (completedTime - dueTime) / 60000 : 0;
  return { weight: number(task?.weight ?? task?.wage), late_minutes: Math.max(0, Math.round(difference)), early_minutes: Math.max(0, Math.round(-difference)), activity_minutes: Math.round(Math.max(0, number(task?.spent_hours ?? task?.actual_hours ?? task?.duration_hours)) * 60) };
};
const metricQuantity = (key: string, context: any) => key === 'activity_count' ? 1 : number(context?.[key]);
const fetchPaged = async (url: string, headers: Record<string, string>, table: string, query: Record<string, string>) => {
  const rows: any[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const target = new URL(`${url}/rest/v1/${table}`); Object.entries(query).forEach(([key, value]) => {
      const match = key.match(/^(.*)__(gte|lte)$/);
      target.searchParams.set(match?.[1] || key, match ? `${match[2]}.${value}` : value);
    });
    target.searchParams.set('offset', String(offset)); target.searchParams.set('limit', String(PAGE_SIZE));
    const result = await fetch(target, { headers }); if (!result.ok) throw new Error(`${table}_fetch_failed:${result.status}`);
    const page = await result.json(); rows.push(...(Array.isArray(page) ? page : [])); if (!Array.isArray(page) || page.length < PAGE_SIZE) return rows;
  }
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response(405, { error: 'method_not_allowed' });
  const authorization = String(request.headers.get('authorization') || '').trim();
  const url = String(Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '');
  const anonKey = String(Deno.env.get('SUPABASE_ANON_KEY') || '');
  if (!authorization || !url || !anonKey) return response(401, { error: 'unauthorized' });
  try {
    const input = await request.json(); const periodStart = String(input?.periodStart || '').trim(); const periodEnd = String(input?.periodEnd || '').trim();
    const mode = input?.mode === 'prepare' ? 'prepare' : 'preview';
    const requestedEmployeeIds = new Set((Array.isArray(input?.employeeIds) ? input.employeeIds : []).map((value: any) => String(value || '').trim()).filter(Boolean));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || periodEnd < periodStart) return response(400, { error: 'invalid_period' });
    const headers = { apikey: anonKey, authorization };
    const [employees, tasks, rules, formulas] = await Promise.all([
      fetchPaged(url, headers, 'employees', { select: 'id,related_profile_id' }),
      (async () => {
        // فعالیت تک‌بار پرداخت می‌شود؛ برای مقیاس‌پذیری فقط فعالیت‌های همین دوره
        // (یا فعالیت‌های قدیمیِ فاقد زمان پایان) خوانده می‌شوند، نه کل تاریخچه.
        const [completed, legacy] = await Promise.all([
          fetchPaged(url, headers, 'tasks', { select: '*', assignee_id: 'not.is.null', completed_at__gte: `${periodStart}T00:00:00.000Z`, completed_at__lte: `${periodEnd}T23:59:59.999Z`, order: 'completed_at.desc' }),
          fetchPaged(url, headers, 'tasks', { select: '*', assignee_id: 'not.is.null', completed_at: 'is.null', created_at__gte: `${periodStart}T00:00:00.000Z`, created_at__lte: `${periodEnd}T23:59:59.999Z`, order: 'created_at.desc' }),
        ]);
        return Array.from(new Map([...completed, ...legacy].map((task: any) => [String(task.id), task])).values());
      })(),
      fetchPaged(url, headers, 'activity_performance_rules', { select: 'id,name,employee_id,task_type,formula_id,output_type,priority,conditions_all,conditions_any,is_active,config', is_active: 'eq.true', order: 'priority.asc' }),
      fetchPaged(url, headers, 'calculation_formulas', { select: 'id,name,expression_config,output_type,config', is_active: 'eq.true' }),
    ]);
    const employeeByProfile = new Map(employees.map((item: any) => [String(item.related_profile_id || '').trim(), String(item.id || '').trim()]));
    const formulaById = new Map(formulas.map((item: any) => [String(item.id), item])); const entries: any[] = [];
    for (const rawTask of tasks) {
      const employeeId = employeeByProfile.get(String(rawTask?.assignee_id || '').trim()); if (!employeeId) continue;
      if (requestedEmployeeIds.size > 0 && !requestedEmployeeIds.has(employeeId)) continue;
      const task = { ...taskWithCustomFields(rawTask), ...taskMetrics(rawTask) };
      for (const rule of rules) {
        if (!eligibleRule(rule, task, employeeId) || !await conditionsPass(rule.conditions_all, rule.conditions_any, task)) continue;
        const config = asObject(rule.config); const formula = formulaById.get(String(rule.formula_id || ''));
        let expression = formula?.expression_config; if (typeof expression === 'string') { try { expression = JSON.parse(expression); } catch { expression = null; } }
        const base = { employee_id: employeeId, task_id: String(rawTask.id), source_rule_id: String(rule.id), formula_id: String(formula?.id || ''), title: rule.name || formula?.name || 'ضریب فعالیت', output_type: rule.output_type || formula?.output_type || 'money', assignee_id: rawTask.assignee_id || null };
        const sign = String(base.output_type) === 'penalty' ? -1 : 1;
        const add = (metric_key: string, amount: number, quantity: number, rate: number, evaluation_mode: string, metric_label: string) => {
          if (!amount) return; const snapshot = { task: rawTask, rule, formula: formula || null, inputs: task, evaluation_mode, quantity, rate }; entries.push({ ...base, source_key: `activity_performance:${employeeId}:${rawTask.id}:${rule.id}:${metric_key}`, entry_type: sign < 0 ? 'penalty' : 'activity_performance', amount: sign < 0 ? -Math.abs(amount) : amount, quantity, rate, metric_key, metric_label, errors: [], snapshot, details: { source_key: `activity_performance:${employeeId}:${rawTask.id}:${rule.id}:${metric_key}`, source_rule_id: rule.id, formula_id: formula?.id || null, task_id: rawTask.id, metric_key, metric_label, output_type: base.output_type, snapshot } });
        };
        if (expression && typeof expression === 'object') { const result = evaluateFormulaExpression(expression, { task, employee: { id: employeeId }, constants: { ...asObject(formula?.config), ...config } }); add('formula', number(result.value), 1, number(result.value), 'formula', formula?.name || 'فرمول'); continue; }
        const payItems = Array.isArray(config.pay_items) ? config.pay_items : [];
        if (payItems.length) { for (const item of payItems) { const key = String(item?.metric_key || '').trim(); const quantity = metricQuantity(key, task); const rate = number(item?.amount); add(key, quantity * rate, quantity, rate, 'pay_items', String(item?.metric_label || key)); } continue; }
        const amount = number(config.fixed_amount) + number(config.weight_amount) * number(task.weight) + number(config.late_minute_amount) * number(task.late_minutes) + number(config.early_minute_amount) * number(task.early_minutes) + number(config.activity_minute_amount) * number(task.activity_minutes);
        add('legacy_simple', amount, 1, amount, 'simple', 'محاسبه ساده');
      }
    }
    const paidSourceKeys = new Set<string>();
    for (let index = 0; index < entries.length; index += 100) {
      const sourceKeys = entries.slice(index, index + 100).map((entry) => String(entry.source_key || '')).filter(Boolean);
      if (!sourceKeys.length) continue;
      const target = new URL(`${url}/rest/v1/payroll_calculation_entries`);
      target.searchParams.set('select', 'source_key'); target.searchParams.set('source_type', 'eq.activity_performance'); target.searchParams.set('status', 'eq.included_in_payroll'); target.searchParams.set('source_key', `in.(${sourceKeys.join(',')})`);
      const paidResult = await fetch(target, { headers });
      if (!paidResult.ok) throw new Error(`activity_performance_paid_sources_failed:${paidResult.status}`);
      (await paidResult.json()).forEach((item: any) => paidSourceKeys.add(String(item?.source_key || '')));
    }
    const availableEntries = entries.filter((entry) => !paidSourceKeys.has(String(entry.source_key)));
    if (mode === 'prepare' && availableEntries.length) {
      const result = await fetch(`${url}/rest/v1/rpc/sync_activity_performance_entries`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_period_start: periodStart, p_period_end: periodEnd, p_entries: entries }) });
      if (!result.ok) throw new Error(`activity_performance_sync_failed:${result.status}`);
      const statuses = await result.json(); const included = new Set((Array.isArray(statuses) ? statuses : []).filter((item: any) => item?.status === 'included_in_payroll').map((item: any) => String(item.source_key)));
      return response(200, { mode, entries: availableEntries.filter((entry) => !included.has(String(entry.source_key))), statuses });
    }
    return response(200, { mode, entries: availableEntries });
  } catch (error) { return response(500, { error: String((error as Error)?.message || 'activity_performance_failed') }); }
});
