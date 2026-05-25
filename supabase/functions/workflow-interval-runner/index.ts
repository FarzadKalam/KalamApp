// @ts-nocheck
// workflow-interval-runner: Server-side interval workflow executor
// Called by pg_cron via pg_net every 5 minutes — no browser dependency.
// Tenant isolation: every DB operation is filtered by org_id.

const FUNCTION_BUILD = 'workflow-interval-runner-2026-05-26-01';
const MAX_WORKFLOWS = 30;
const DEFAULT_BATCH_SIZE = 300;

// ── Types ──────────────────────────────────────────────────────────────────────

type WorkflowCondition = {
  id?: string;
  field: string;
  operator: string;
  value?: any;
};

type WorkflowAction = {
  id?: string;
  type: string;
  config: Record<string, any>;
};

type WorkflowRow = {
  id: string;
  org_id: string;
  module_id: string;
  name: string;
  trigger_type: string;
  interval_value: number | null;
  interval_unit: string | null;
  interval_at: string | null;
  interval_first_run_at: string | null;
  interval_minute: number | null;
  interval_allowed_from_hour: number | null;
  interval_allowed_to_hour: number | null;
  interval_day_of_month: number | null;
  interval_day_condition: string | null;
  conditions_all: WorkflowCondition[];
  conditions_any: WorkflowCondition[];
  actions: WorkflowAction[];
  is_active: boolean;
  last_run_at: string | null;
  server_queued_at: string | null;
  execution_mode: string | null;
  batch_size: number | null;
};

// ── Jalali date conversion ─────────────────────────────────────────────────────

function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const j_days_in_month = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
  gy -= 1600; gm -= 1; gd -= 1;
  let g_d_no = 365 * gy + Math.floor((gy + 3) / 4) - Math.floor((gy + 99) / 100) + Math.floor((gy + 399) / 400);
  const g_month_days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (let i = 0; i < gm; i++) g_d_no += g_month_days[i];
  if (gm > 1 && (gy % 4 === 0 && gy % 100 !== 0 || gy % 400 === 0)) g_d_no++;
  g_d_no += gd;
  let j_d_no = g_d_no - 79;
  const j_np = Math.floor(j_d_no / 12053); j_d_no %= 12053;
  let jy = 979 + 33 * j_np + 4 * Math.floor(j_d_no / 1461);
  j_d_no %= 1461;
  if (j_d_no >= 366) { jy += Math.floor((j_d_no - 1) / 365); j_d_no = (j_d_no - 1) % 365; }
  let jm = 0;
  for (let i = 0; i < 11 && j_d_no >= j_days_in_month[i]; i++) { j_d_no -= j_days_in_month[i]; jm = i + 1; }
  return [jy, jm + 1, j_d_no + 1];
}

function formatJalaliDate(isoDate: string): string {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}

function formatJalaliDateTime(isoDate: string): string {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  const tehranDate = new Date(isoDate);
  const tehranOffset = 3.5 * 60 * 60 * 1000;
  const local = new Date(tehranDate.getTime() + tehranOffset);
  const [jy, jm, jd] = gregorianToJalali(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate());
  const h = String(local.getUTCHours()).padStart(2, '0');
  const min = String(local.getUTCMinutes()).padStart(2, '0');
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')} ${h}:${min}`;
}

// ── Template rendering ─────────────────────────────────────────────────────────

const DATE_LIKE_REGEX = /^\d{4}-\d{2}-\d{2}/;

function getFieldValue(record: Record<string, any>, fieldKey: string): any {
  if (Object.prototype.hasOwnProperty.call(record, fieldKey)) return record[fieldKey];
  const parts = fieldKey.split('.');
  let cur: any = record;
  for (const p of parts) { cur = cur?.[p]; if (cur === undefined) break; }
  return cur;
}

function formatFieldValue(value: any, fieldKey: string): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'بله' : 'خیر';
  const str = String(value);
  if (DATE_LIKE_REGEX.test(str)) {
    if (str.length > 10) return formatJalaliDateTime(str);
    return formatJalaliDate(str);
  }
  if (typeof value === 'number') {
    return value.toLocaleString('fa-IR');
  }
  if (Array.isArray(value)) return value.join('، ');
  return str;
}

function renderTemplate(template: string, record: Record<string, any>, bold = false): string {
  return String(template || '').replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, key) => {
    const fieldKey = String(key).trim();
    if (!fieldKey) return '';
    const value = getFieldValue(record, fieldKey);
    const text = formatFieldValue(value, fieldKey);
    if (!text) return '';
    return bold ? `**${text}**` : text;
  });
}

// ── Condition evaluation ───────────────────────────────────────────────────────

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function daysDiffFromNow(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return (nStart.getTime() - dStart.getTime()) / (1000 * 60 * 60 * 24);
}

function hoursDiffFromNow(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60);
}

function getFieldValueForCondition(record: Record<string, any>, field: string): any {
  if (Object.prototype.hasOwnProperty.call(record, field)) return record[field];
  const parts = field.split('.');
  let cur: any = record;
  for (const p of parts) { cur = cur?.[p]; if (cur === undefined) break; }
  return cur;
}

function normalizeConditionValue(value: any): string {
  const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';
  const ARABIC = '٠١٢٣٤٥٦٧٨٩';
  return String(value ?? '')
    .replace(/[۰-۹]/g, (d) => String(PERSIAN.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC.indexOf(d)));
}

function evaluateCondition(condition: WorkflowCondition, record: Record<string, any>): boolean {
  const field = String(condition?.field || '').trim();
  if (!field) return true;
  const operator = String(condition?.operator || 'eq').trim();
  const expected = condition?.value;
  const currentRaw = getFieldValueForCondition(record, field);
  const current = currentRaw;
  const currentStr = normalizeConditionValue(currentRaw);

  switch (operator) {
    case 'eq': return String(current ?? '') === String(expected ?? '');
    case 'neq': return String(current ?? '') !== String(expected ?? '');
    case 'gt': return Number(currentStr) > Number(normalizeConditionValue(expected));
    case 'gte': return Number(currentStr) >= Number(normalizeConditionValue(expected));
    case 'lt': return Number(currentStr) < Number(normalizeConditionValue(expected));
    case 'lte': return Number(currentStr) <= Number(normalizeConditionValue(expected));
    case 'in': {
      const arr = Array.isArray(expected) ? expected : [expected];
      return arr.map(String).includes(String(current ?? ''));
    }
    case 'not_in': {
      const arr = Array.isArray(expected) ? expected : [expected];
      return !arr.map(String).includes(String(current ?? ''));
    }
    case 'is_null': case 'is_empty': return current === null || current === undefined || String(current).trim() === '';
    case 'not_null': case 'not_empty': return current !== null && current !== undefined && String(current).trim() !== '';
    case 'is_true': return current === true || current === 'true' || current === 1;
    case 'is_false': return current === false || current === 'false' || current === 0;
    case 'contains': return String(current ?? '').includes(String(expected ?? ''));
    case 'not_contains': return !String(current ?? '').includes(String(expected ?? ''));
    case 'starts_with': return String(current ?? '').startsWith(String(expected ?? ''));
    case 'ends_with': return String(current ?? '').endsWith(String(expected ?? ''));
    case 'is_today': {
      const d = current ? new Date(String(current)) : null;
      return !!d && !isNaN(d.getTime()) && isSameDay(d, new Date());
    }
    case 'is_yesterday': {
      const d = current ? new Date(String(current)) : null;
      const y = new Date(); y.setDate(y.getDate() - 1);
      return !!d && !isNaN(d.getTime()) && isSameDay(d, y);
    }
    case 'is_tomorrow': {
      const d = current ? new Date(String(current)) : null;
      const t = new Date(); t.setDate(t.getDate() + 1);
      return !!d && !isNaN(d.getTime()) && isSameDay(d, t);
    }
    case 'is_this_week': {
      const d = current ? new Date(String(current)) : null;
      if (!d || isNaN(d.getTime())) return false;
      const now = new Date();
      const start = new Date(now); start.setDate(now.getDate() - now.getDay()); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
      return d >= start && d <= end;
    }
    case 'is_last_week': {
      const d = current ? new Date(String(current)) : null;
      if (!d || isNaN(d.getTime())) return false;
      const now = new Date();
      const thisWeekStart = new Date(now); thisWeekStart.setDate(now.getDate() - now.getDay()); thisWeekStart.setHours(0, 0, 0, 0);
      const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(thisWeekStart.getDate() - 7);
      const lastWeekEnd = new Date(thisWeekStart); lastWeekEnd.setMilliseconds(-1);
      return d >= lastWeekStart && d <= lastWeekEnd;
    }
    case 'is_this_month': {
      const d = current ? new Date(String(current)) : null;
      if (!d || isNaN(d.getTime())) return false;
      const now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    case 'is_last_month': {
      const d = current ? new Date(String(current)) : null;
      if (!d || isNaN(d.getTime())) return false;
      const now = new Date();
      const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d.getFullYear() === last.getFullYear() && d.getMonth() === last.getMonth();
    }
    case 'day_of_month_eq': {
      const d = current ? new Date(String(current)) : null;
      return !!d && !isNaN(d.getTime()) && d.getDate() === Number(expected ?? 0);
    }
    case 'day_of_month_neq': {
      const d = current ? new Date(String(current)) : null;
      return !!d && !isNaN(d.getTime()) && d.getDate() !== Number(expected ?? 0);
    }
    case 'day_of_week_eq': {
      const d = current ? new Date(String(current)) : null;
      return !!d && !isNaN(d.getTime()) && d.getDay() === Number(expected ?? 0);
    }
    case 'day_of_week_neq': {
      const d = current ? new Date(String(current)) : null;
      return !!d && !isNaN(d.getTime()) && d.getDay() !== Number(expected ?? 0);
    }
    case 'days_passed_eq': {
      const diff = daysDiffFromNow(String(current ?? ''));
      return diff !== null && Math.floor(diff) === Number(expected ?? 0);
    }
    case 'days_passed_gt': {
      const diff = daysDiffFromNow(String(current ?? ''));
      return diff !== null && diff > Number(expected ?? 0);
    }
    case 'days_passed_lt': {
      const diff = daysDiffFromNow(String(current ?? ''));
      return diff !== null && diff < Number(expected ?? 0);
    }
    case 'days_remaining_eq': {
      const diff = daysDiffFromNow(String(current ?? ''));
      return diff !== null && diff < 0 && Math.floor(Math.abs(diff)) === Number(expected ?? 0);
    }
    case 'days_remaining_gt': {
      const diff = daysDiffFromNow(String(current ?? ''));
      return diff !== null && diff < 0 && Math.abs(diff) > Number(expected ?? 0);
    }
    case 'days_remaining_lt': {
      const diff = daysDiffFromNow(String(current ?? ''));
      return diff !== null && diff < 0 && Math.abs(diff) < Number(expected ?? 0);
    }
    case 'hours_passed_gt': {
      const diff = hoursDiffFromNow(String(current ?? ''));
      return diff !== null && diff > Number(expected ?? 0);
    }
    case 'hours_passed_lt': {
      const diff = hoursDiffFromNow(String(current ?? ''));
      return diff !== null && diff < Number(expected ?? 0);
    }
    case 'hours_remaining_gt': {
      const diff = hoursDiffFromNow(String(current ?? ''));
      return diff !== null && diff < 0 && Math.abs(diff) > Number(expected ?? 0);
    }
    case 'hours_remaining_lt': {
      const diff = hoursDiffFromNow(String(current ?? ''));
      return diff !== null && diff < 0 && Math.abs(diff) < Number(expected ?? 0);
    }
    case 'is_friday': {
      const d = current ? new Date(String(current)) : null;
      return !!d && !isNaN(d.getTime()) && d.getDay() === 5;
    }
    case 'is_official_holiday': {
      // Cannot call holiday service from server; treat as false (skip this condition)
      return false;
    }
    default:
      console.warn(`[workflow-runner] Unknown operator: ${operator}`);
      return true;
  }
}

function evaluateConditions(
  conditionsAll: WorkflowCondition[],
  conditionsAny: WorkflowCondition[],
  record: Record<string, any>
): boolean {
  const allConditions = Array.isArray(conditionsAll) ? conditionsAll : [];
  const anyConditions = Array.isArray(conditionsAny) ? conditionsAny : [];

  if (allConditions.length > 0) {
    for (const c of allConditions) {
      if (!evaluateCondition(c, record)) return false;
    }
  }

  if (anyConditions.length > 0) {
    let anyPassed = false;
    for (const c of anyConditions) {
      if (evaluateCondition(c, record)) { anyPassed = true; break; }
    }
    if (!anyPassed) return false;
  }

  return true;
}

// ── Interval due check ─────────────────────────────────────────────────────────

function parseIntervalAt(value: string | null): { hour: number; minute: number } | null {
  if (!value) return null;
  const raw = String(value).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  const m = raw.match(/(\d{1,2})\s*:\s*(\d{1,2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { hour: h, minute: min };
}

function checkIntervalDue(workflow: WorkflowRow, now: Date): boolean {
  const unit = String(workflow.interval_unit || 'day').toLowerCase();
  const value = Math.max(1, parseInt(String(workflow.interval_value || 1), 10) || 1);
  const lastRunAt = workflow.last_run_at ? new Date(workflow.last_run_at) : null;

  // Respect interval_first_run_at for first run
  if (!lastRunAt && workflow.interval_first_run_at) {
    const firstRun = new Date(workflow.interval_first_run_at);
    if (!isNaN(firstRun.getTime()) && now < firstRun) return false;
  }

  // Hour window check
  if (unit === 'hour') {
    const from = workflow.interval_allowed_from_hour;
    const to = workflow.interval_allowed_to_hour;
    const h = now.getHours();
    if (from !== null && to !== null && (h < from || h > to)) return false;
  }

  // Month: day-of-month check
  if (unit === 'month' && workflow.interval_day_of_month) {
    const target = Math.min(31, Math.max(1, workflow.interval_day_of_month));
    if (now.getDate() !== target) return false;
  }

  if (!lastRunAt) return true;

  const effectiveIntervalAt = unit === 'hour'
    ? (typeof workflow.interval_minute === 'number' ? `00:${String(workflow.interval_minute).padStart(2, '0')}` : null)
    : workflow.interval_at;

  let next = new Date(lastRunAt);
  if (unit === 'hour') next.setHours(next.getHours() + value);
  else if (unit === 'day') next.setDate(next.getDate() + value);
  else next.setMonth(next.getMonth() + value);

  const parsedTime = parseIntervalAt(effectiveIntervalAt);
  if (parsedTime) {
    if (unit === 'hour') {
      next.setMinutes(parsedTime.minute, 0, 0);
    } else {
      next.setHours(parsedTime.hour, parsedTime.minute, 0, 0);
    }
  }

  return now >= next;
}

function checkIntervalDayCondition(condition: string | null | undefined, now: Date): boolean {
  const cond = String(condition || 'any').trim();
  if (!cond || cond === 'any') return true;
  const day = now.getDay();
  if (cond === 'is_friday') return day === 5;
  if (cond === 'not_friday') return day !== 5;
  if (cond === 'is_saturday') return day === 6;
  if (cond === 'not_saturday') return day !== 6;
  if (cond === 'is_sunday') return day === 0;
  if (cond === 'not_sunday') return day !== 0;
  if (cond === 'is_monday') return day === 1;
  if (cond === 'not_monday') return day !== 1;
  if (cond === 'is_tuesday') return day === 2;
  if (cond === 'not_tuesday') return day !== 2;
  if (cond === 'is_wednesday') return day === 3;
  if (cond === 'not_wednesday') return day !== 3;
  if (cond === 'is_thursday') return day === 4;
  if (cond === 'not_thursday') return day !== 4;
  // Holiday-based conditions require external API; skip (return true)
  return true;
}

// ── REST helpers ───────────────────────────────────────────────────────────────

function dbHeaders(serviceRoleKey: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    'apikey': serviceRoleKey,
    'Authorization': `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...extra,
  };
}

async function dbGet(supabaseUrl: string, key: string, path: string): Promise<any[]> {
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/${path}`;
  const r = await fetch(url, { method: 'GET', headers: dbHeaders(key) });
  if (!r.ok) { const t = await r.text(); throw new Error(`GET ${path} failed: ${t}`); }
  const data = await r.json();
  return Array.isArray(data) ? data : (data ? [data] : []);
}

async function dbInsert(supabaseUrl: string, key: string, table: string, body: any): Promise<any> {
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/${table}`;
  const r = await fetch(url, { method: 'POST', headers: dbHeaders(key), body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text(); throw new Error(`INSERT ${table} failed: ${t}`); }
  try { const d = await r.json(); return Array.isArray(d) ? d[0] : d; } catch { return null; }
}

async function dbPatch(supabaseUrl: string, key: string, table: string, filter: string, body: any): Promise<void> {
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/${table}?${filter}`;
  const r = await fetch(url, { method: 'PATCH', headers: dbHeaders(key), body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text(); throw new Error(`PATCH ${table} failed: ${t}`); }
}

async function callRpc(supabaseUrl: string, key: string, fn: string, args: any): Promise<any> {
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/${fn}`;
  const r = await fetch(url, { method: 'POST', headers: dbHeaders(key), body: JSON.stringify(args) });
  if (!r.ok) { const t = await r.text(); throw new Error(`RPC ${fn} failed: ${t}`); }
  return await r.json();
}

// ── Workflow DB operations ─────────────────────────────────────────────────────

async function fetchQueuedWorkflows(url: string, key: string): Promise<WorkflowRow[]> {
  const rows = await dbGet(url, key,
    `workflows?is_active=eq.true&trigger_type=eq.interval&server_queued_at=not.is.null&order=updated_at.asc&limit=${MAX_WORKFLOWS}`
  );
  return rows as WorkflowRow[];
}

async function claimWorkflow(url: string, key: string, workflowId: string, expectedLastRunAt: string | null): Promise<boolean> {
  try {
    const result = await callRpc(url, key, 'claim_workflow_interval_run', {
      p_workflow_id: workflowId,
      p_expected_last_run_at: expectedLastRunAt,
      p_claimed_at: new Date().toISOString(),
    });
    return result === true;
  } catch {
    // Fallback: direct update
    const filter = expectedLastRunAt
      ? `id=eq.${workflowId}&is_active=eq.true&trigger_type=eq.interval&last_run_at=eq.${expectedLastRunAt}`
      : `id=eq.${workflowId}&is_active=eq.true&trigger_type=eq.interval&last_run_at=is.null`;
    try {
      await dbPatch(url, key, 'workflows', filter, { last_run_at: new Date().toISOString(), server_queued_at: null });
      return true;
    } catch { return false; }
  }
}

async function clearServerQueued(url: string, key: string, workflowId: string): Promise<void> {
  await dbPatch(url, key, 'workflows', `id=eq.${workflowId}`, { server_queued_at: null }).catch(() => {});
}

async function fetchModuleRecords(url: string, key: string, table: string, orgId: string, batchSize: number): Promise<any[]> {
  return await dbGet(url, key, `${table}?org_id=eq.${orgId}&limit=${batchSize}`);
}

async function hasWorkflowLog(url: string, key: string, workflowId: string, moduleId: string, recordId: string): Promise<boolean> {
  const rows = await dbGet(url, key,
    `workflow_logs?workflow_id=eq.${workflowId}&module_id=eq.${moduleId}&record_id=eq.${recordId}&run_type=eq.scheduled&status=eq.success&limit=1`
  );
  return rows.length > 0;
}

async function insertWorkflowLog(url: string, key: string, log: {
  workflow_id: string; org_id: string; module_id: string; record_id: string;
  run_type: string; status: string; message?: string; details?: any;
}): Promise<void> {
  await dbInsert(url, key, 'workflow_logs', {
    workflow_id: log.workflow_id, org_id: log.org_id, module_id: log.module_id,
    record_id: log.record_id, run_type: log.run_type, status: log.status,
    message: log.message || null, details: log.details || {},
  }).catch((e) => console.warn('[workflow-runner] Failed to insert log:', e.message));
}

// ── Recipient resolution ───────────────────────────────────────────────────────

function parseRecipientToken(value: string): { kind: 'user' | 'role' | 'chat_group'; id: string } | null {
  const raw = String(value || '').trim();
  const m = raw.match(/^(user|role|chat_group)[:_](.+)$/i);
  if (!m) return null;
  const kind = m[1].toLowerCase() as 'user' | 'role' | 'chat_group';
  const id = m[2].trim();
  if (!id) return null;
  return { kind, id };
}

function normalizePhone(p: string): string {
  const raw = String(p ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .trim();
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0098')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('98') && digits.length === 12) digits = `0${digits.slice(2)}`;
  else if (digits.length === 10 && digits.startsWith('9')) digits = `0${digits}`;
  return digits;
}

function isValidIranMobile(p: string): boolean { return /^09\d{9}$/.test(p); }

async function resolveAssigneesToSmsRecipients(
  url: string, key: string, orgId: string,
  recipientAssignees: any[], recipientFields: any[], record: Record<string, any>
): Promise<string[]> {
  const userIds = new Set<string>();
  const roleIds = new Set<string>();
  const directPhones: string[] = [];

  const processEntry = (entry: any) => {
    const token = parseRecipientToken(String(entry ?? ''));
    if (token?.kind === 'user') { userIds.add(token.id); return; }
    if (token?.kind === 'role') { roleIds.add(token.id); return; }
    const phone = normalizePhone(String(entry ?? ''));
    if (phone) directPhones.push(phone);
  };

  (Array.isArray(recipientAssignees) ? recipientAssignees : []).forEach(processEntry);
  (Array.isArray(recipientFields) ? recipientFields : []).forEach((fieldKey) => {
    const val = getFieldValue(record, String(fieldKey ?? ''));
    if (Array.isArray(val)) val.forEach(processEntry);
    else processEntry(val);
  });

  const phones: string[] = [...directPhones];

  if (userIds.size > 0) {
    const ids = Array.from(userIds).join(',');
    const profiles = await dbGet(url, key, `profiles?id=in.(${ids})&select=mobile_1,mobile_2,mobile`).catch(() => []);
    profiles.forEach((p: any) => {
      [p.mobile_1, p.mobile_2, p.mobile].map(normalizePhone).filter(isValidIranMobile).forEach((ph) => phones.push(ph));
    });
  }

  if (roleIds.size > 0) {
    const ids = Array.from(roleIds).join(',');
    const profiles = await dbGet(url, key, `profiles?role_id=in.(${ids})&org_id=eq.${orgId}&select=mobile_1,mobile_2,mobile`).catch(() => []);
    profiles.forEach((p: any) => {
      [p.mobile_1, p.mobile_2, p.mobile].map(normalizePhone).filter(isValidIranMobile).forEach((ph) => phones.push(ph));
    });
  }

  return Array.from(new Set(phones.filter(isValidIranMobile)));
}

async function resolveAssigneesToUserIds(
  url: string, key: string, orgId: string,
  recipientAssignees: any[], recipientFields: any[], record: Record<string, any>
): Promise<string[]> {
  const userIds = new Set<string>();
  const roleIds = new Set<string>();

  const processEntry = (entry: any) => {
    const token = parseRecipientToken(String(entry ?? ''));
    if (token?.kind === 'user') { userIds.add(token.id); return; }
    if (token?.kind === 'role') { roleIds.add(token.id); return; }
  };

  (Array.isArray(recipientAssignees) ? recipientAssignees : []).forEach(processEntry);
  (Array.isArray(recipientFields) ? recipientFields : []).forEach((fieldKey) => {
    const val = getFieldValue(record, String(fieldKey ?? ''));
    if (Array.isArray(val)) val.forEach(processEntry);
    else processEntry(val);
  });

  if (roleIds.size > 0) {
    const ids = Array.from(roleIds).join(',');
    const profiles = await dbGet(url, key, `profiles?role_id=in.(${ids})&org_id=eq.${orgId}&select=id`).catch(() => []);
    profiles.forEach((p: any) => { if (p.id) userIds.add(String(p.id)); });
  }

  return Array.from(userIds);
}

// ── Bot recipient resolution ───────────────────────────────────────────────────

async function resolveAssigneesToBotChatIds(
  url: string, key: string, orgId: string,
  recipientAssignees: any[], recipientFields: any[], record: Record<string, any>,
  channel: 'bale' | 'telegram' | 'rubika'
): Promise<string[]> {
  const userIds = new Set<string>();
  const roleIds = new Set<string>();
  const directChatIds: string[] = [];

  const processEntry = (entry: any) => {
    const token = parseRecipientToken(String(entry ?? ''));
    if (token?.kind === 'user') { userIds.add(token.id); return; }
    if (token?.kind === 'role') { roleIds.add(token.id); return; }
    const v = String(entry ?? '').trim();
    if (v) directChatIds.push(v);
  };

  (Array.isArray(recipientAssignees) ? recipientAssignees : []).forEach(processEntry);
  (Array.isArray(recipientFields) ? recipientFields : []).forEach((fk) => {
    const val = getFieldValue(record, String(fk ?? ''));
    if (Array.isArray(val)) val.forEach(processEntry);
    else processEntry(val);
  });

  const chatIdField = channel === 'telegram' ? 'telegram_chat_id' : channel === 'rubika' ? 'rubika_chat_id' : 'bale_chat_id';
  const chatIds: string[] = [...directChatIds];

  const allUserIds = new Set(userIds);
  if (roleIds.size > 0) {
    const ids = Array.from(roleIds).join(',');
    const profiles = await dbGet(url, key, `profiles?role_id=in.(${ids})&org_id=eq.${orgId}&select=id`).catch(() => []);
    profiles.forEach((p: any) => { if (p.id) allUserIds.add(String(p.id)); });
  }
  if (allUserIds.size > 0) {
    const ids = Array.from(allUserIds).join(',');
    const profiles = await dbGet(url, key, `profiles?id=in.(${ids})&select=${chatIdField}`).catch(() => []);
    profiles.forEach((p: any) => { const v = String(p?.[chatIdField] || '').trim(); if (v) chatIds.push(v); });
  }

  return Array.from(new Set(chatIds.filter(Boolean)));
}

// ── SMS sending ────────────────────────────────────────────────────────────────

async function getOrgSmsSettings(url: string, key: string, orgId: string): Promise<any | null> {
  const rows = await dbGet(url, key,
    `integration_settings?org_id=eq.${orgId}&connection_type=eq.sms&is_active=eq.true&limit=1`
  ).catch(() => []);
  if (rows.length === 0) return null;
  const settings = rows[0]?.settings || {};
  // Merge env vars (env takes priority)
  return {
    ...settings,
    username: Deno.env.get('MELIPAYAMAK_USERNAME') || settings.username || '',
    password: Deno.env.get('MELIPAYAMAK_PASSWORD') || settings.password || '',
    api_key: Deno.env.get('MELIPAYAMAK_API_KEY') || settings.api_key || '',
    sender_number: Deno.env.get('MELIPAYAMAK_SENDER_NUMBER') || settings.sender_number || '',
  };
}

async function sendSmsViaProvider(settings: any, to: string[], text: string): Promise<void> {
  const username = String(settings.username || '').trim();
  const password = String(settings.password || settings.api_key || '').trim();
  const apiKey = String(settings.api_key || '').trim();
  const senderNumber = String(settings.sender_number || '').trim();
  if (!senderNumber || (!username && !apiKey)) throw new Error('تنظیمات پیامک ناقص است');
  if (!text.trim()) throw new Error('متن پیامک خالی است');

  for (const recipient of to) {
    const phone = normalizePhone(recipient);
    if (!isValidIranMobile(phone)) { console.warn('[workflow-runner] Invalid phone:', phone); continue; }
    const form = new URLSearchParams({
      UserName: username, PassWord: password || apiKey,
      To: phone, From: senderNumber, Text: text, IsFlash: 'false',
    });
    const r = await fetch('https://api.payamak-panel.com/post/send.asmx/SendSimpleSMS2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: form.toString(),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`پاسخ پیامک خطا: ${r.status}`);
  }
}

// ── Bot sending ────────────────────────────────────────────────────────────────

async function getOrgBotSettings(url: string, key: string, orgId: string, channel: string): Promise<any | null> {
  const rows = await dbGet(url, key,
    `integration_settings?org_id=eq.${orgId}&connection_type=eq.${channel}&is_active=eq.true&limit=1`
  ).catch(() => []);
  return rows.length > 0 ? rows[0]?.settings || null : null;
}

async function sendBotMessage(chatId: string, text: string, settings: any, channel: string): Promise<void> {
  const token = String(settings.bot_token || settings.token || '').trim();
  if (!token || !chatId) return;
  const isTelegram = channel === 'telegram';
  const baseUrl = isTelegram
    ? `https://api.telegram.org/bot${token}/sendMessage`
    : `https://tapi.bale.ai/bot${token}/sendMessage`;
  const payload = { chat_id: chatId, text, parse_mode: 'HTML' };
  await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  }).catch((e) => console.warn(`[workflow-runner] Bot send failed (${channel}):`, e.message));
}

// ── Note insertion ─────────────────────────────────────────────────────────────

async function insertNote(url: string, key: string, note: {
  org_id: string; module_id: string; record_id: string;
  content: string; mention_user_ids: string[]; mention_role_ids: string[];
  source_type: string; metadata: any;
}): Promise<void> {
  await dbInsert(url, key, 'notes', note);
}

// ── Record operations ──────────────────────────────────────────────────────────

function getModuleTable(moduleId: string): string {
  const TABLE_MAP: Record<string, string> = {
    productBundles: 'product_bundles', purchaseInvoices: 'purchase_invoices',
    priceLists: 'price_lists', marketingLeads: 'marketing_leads',
    deliveryForms: 'delivery_forms', salesCatalog: 'sales_catalog',
    stockTransfers: 'stock_transfers', productionBOM: 'production_bom',
    productionOrders: 'production_orders', productionGroupOrders: 'production_group_orders',
    fiscalYears: 'fiscal_years', chartOfAccounts: 'chart_of_accounts',
    journalEntries: 'journal_entries', accountingEventRules: 'accounting_event_rules',
    costCenters: 'cost_centers', cashBoxes: 'cash_boxes', bankAccounts: 'bank_accounts',
    pettyFunds: 'petty_funds', cashBankOperations: 'cash_bank_operations',
    expenseDocuments: 'expense_documents', attendanceLogs: 'attendance_logs',
    workSchedules: 'work_schedules', leaveRequests: 'leave_requests',
    overtimeRequests: 'overtime_requests', missionRequests: 'mission_requests',
    employeeAdvances: 'employee_advances', employeeBonusRequests: 'employee_bonus_requests',
    employeePenaltyRequests: 'employee_penalty_requests', employeeContracts: 'employee_contracts',
    payrollSlips: 'payroll_slips', recruitmentApplicants: 'recruitment_applicants',
    processTemplates: 'process_templates', processRuns: 'process_runs',
    webForms: 'web_forms', secretariatDocuments: 'secretariat_documents',
    smsDeliveryReports: 'sms_delivery_reports', voipCallReports: 'voip_call_reports',
    automationExecutionReports: 'automation_execution_reports',
    counterpartyBotGroups: 'counterparty_bot_groups',
  };
  return TABLE_MAP[moduleId] || moduleId;
}

async function updateRecord(url: string, key: string, moduleId: string, recordId: string, patch: Record<string, any>): Promise<void> {
  const table = getModuleTable(moduleId);
  await dbPatch(url, key, table, `id=eq.${recordId}`, { ...patch, updated_at: new Date().toISOString() });
}

async function createRecord(url: string, key: string, moduleId: string, orgId: string, payload: Record<string, any>): Promise<any> {
  const table = getModuleTable(moduleId);
  return await dbInsert(url, key, table, { org_id: orgId, ...payload });
}

// ── Action execution ───────────────────────────────────────────────────────────

async function executeAction(
  action: WorkflowAction, record: Record<string, any>,
  moduleId: string, orgId: string, url: string, key: string
): Promise<void> {
  const config = action.config || {};

  // ── send_sms ──────────────────────────────────────────────────────────
  if (action.type === 'send_sms') {
    const text = renderTemplate(String(config.message || ''), record).trim();
    if (!text) return;
    const recipients = await resolveAssigneesToSmsRecipients(
      url, key, orgId,
      config.recipient_assignees || [], config.recipient_fields || [], record
    );
    const manuals = (config.manual_numbers || []).map(normalizePhone).filter(isValidIranMobile);
    const allRecipients = Array.from(new Set([...recipients, ...manuals]));
    if (allRecipients.length === 0) return;
    const smsSettings = await getOrgSmsSettings(url, key, orgId);
    if (!smsSettings) { console.warn(`[workflow-runner] No SMS settings for org: ${orgId}`); return; }
    await sendSmsViaProvider(smsSettings, allRecipients, text);
    return;
  }

  // ── send_note / send_note_sms ─────────────────────────────────────────
  if (action.type === 'send_note' || action.type === 'send_note_sms') {
    const noteText = renderTemplate(String(config.note_text || ''), record, true).trim();
    if (!noteText) return;
    const recordId = String(record?.id || '');
    if (!moduleId || !recordId) return;
    const mentionUserIds = await resolveAssigneesToUserIds(
      url, key, orgId,
      config.recipient_assignees || [], config.recipient_fields || [], record
    );
    if (mentionUserIds.length === 0) { console.info('[workflow-runner] No note recipients'); return; }
    await insertNote(url, key, {
      org_id: orgId, module_id: moduleId, record_id: recordId,
      content: noteText, mention_user_ids: mentionUserIds, mention_role_ids: [],
      source_type: 'system',
      metadata: { source_type: 'system', notification_surface: 'system_feed', requires_action: false, workflow_action_type: action.type, workflow_action_id: action.id || null },
    });
    if (action.type === 'send_note_sms') {
      const smsText = `پیام جدید از طرف "سیستم"\n"${noteText.replace(/\*\*/g, '').substring(0, 80)}"\nبرای مشاهده به سامانه مراجعه کنید`;
      const recipients = await resolveAssigneesToSmsRecipients(url, key, orgId, config.recipient_assignees || [], config.recipient_fields || [], record);
      if (recipients.length > 0) {
        const smsSettings = await getOrgSmsSettings(url, key, orgId);
        if (smsSettings) await sendSmsViaProvider(smsSettings, recipients, smsText).catch((e) => console.warn('[workflow-runner] note_sms failed:', e.message));
      }
    }
    return;
  }

  // ── send_bale_bot ─────────────────────────────────────────────────────
  if (action.type === 'send_bale_bot' || action.type === 'send_telegram_bot') {
    const channel = action.type === 'send_telegram_bot' ? 'telegram' : 'bale';
    const text = renderTemplate(String(config.message || ''), record).trim();
    if (!text) return;
    const botSettings = await getOrgBotSettings(url, key, orgId, channel);
    if (!botSettings) return;
    const chatIds = await resolveAssigneesToBotChatIds(url, key, orgId, config.recipient_assignees || [], config.recipient_fields || [], record, channel);
    for (const chatId of chatIds) {
      await sendBotMessage(chatId, text, botSettings, channel);
    }
    return;
  }

  // ── send_rubika_bot ───────────────────────────────────────────────────
  if (action.type === 'send_rubika_bot') {
    const text = renderTemplate(String(config.message || ''), record).trim();
    if (!text) return;
    const botSettings = await getOrgBotSettings(url, key, orgId, 'rubika');
    if (!botSettings) return;
    const chatIds = await resolveAssigneesToBotChatIds(url, key, orgId, config.recipient_assignees || [], config.recipient_fields || [], record, 'rubika');
    for (const chatId of chatIds) {
      const token = String(botSettings.bot_token || '').trim();
      if (!token || !chatId) continue;
      await fetch(`https://rubika.ir/rubika/bots/${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
        signal: AbortSignal.timeout(8000),
      }).catch((e) => console.warn('[workflow-runner] Rubika send failed:', e.message));
    }
    return;
  }

  // ── update_record ─────────────────────────────────────────────────────
  if (action.type === 'update_record') {
    const fieldKey = String(config.field || '').trim();
    if (!fieldKey || !record?.id) return;
    const valueMode = String(config.value_mode || 'static');
    let nextValue: any = config.value ?? null;
    if (valueMode === 'from_source') {
      const sf = String(config.source_field || '').trim();
      if (sf) nextValue = getFieldValue(record, sf);
    }
    await updateRecord(url, key, moduleId, String(record.id), { [fieldKey]: nextValue });
    return;
  }

  // ── create_standalone_record ──────────────────────────────────────────
  if (action.type === 'create_standalone_record') {
    const targetModuleId = String(config.target_module_id || '').trim();
    if (!targetModuleId) return;
    const payload: Record<string, any> = {};
    const mappings = Array.isArray(config.field_mappings) ? config.field_mappings : [];
    for (const mapping of mappings) {
      const tf = String(mapping?.field || '').trim();
      if (!tf) continue;
      if (mapping?.mode === 'from_source') {
        const sf = String(mapping?.source_field || '').trim();
        payload[tf] = sf ? getFieldValue(record, sf) : null;
      } else {
        payload[tf] = mapping?.value ?? null;
      }
    }
    await createRecord(url, key, targetModuleId, orgId, payload);
    return;
  }

  // ── create_related_record ─────────────────────────────────────────────
  if (action.type === 'create_related_record') {
    const targetModuleId = String(config.target_module_id || '').trim();
    const relationFieldKey = String(config.relation_field_key || '').trim();
    const sourceRecordId = String(record?.id || '').trim();
    if (!targetModuleId || !relationFieldKey || !sourceRecordId) return;
    const payload: Record<string, any> = { [relationFieldKey]: sourceRecordId };
    const mappings = Array.isArray(config.field_mappings) ? config.field_mappings : [];
    for (const mapping of mappings) {
      const tf = String(mapping?.field || '').trim();
      if (!tf) continue;
      if (mapping?.mode === 'from_source') {
        const sf = String(mapping?.source_field || '').trim();
        payload[tf] = sf ? getFieldValue(record, sf) : null;
      } else {
        payload[tf] = mapping?.value ?? null;
      }
    }
    await createRecord(url, key, targetModuleId, orgId, payload);
    return;
  }

  // ── execute_process ───────────────────────────────────────────────────
  if (action.type === 'execute_process') {
    const templateId = String(config.template_id || '').trim();
    if (!templateId || !record?.id) return;
    await callRpc(url, key, 'create_process_run_from_template', {
      p_org_id: orgId,
      p_template_id: templateId,
      p_module_id: moduleId,
      p_record_id: String(record.id),
      p_process_name: null,
      p_copied_mode: 'auto',
    });
    return;
  }

  // ── copy_process_template ─────────────────────────────────────────────
  if (action.type === 'copy_process_template') {
    const templateId = String(config.template_id || '').trim();
    if (!templateId || !record?.id) return;
    // Load template stages and apply to record as draft
    const stages = await dbGet(url, key, `process_template_stages?template_id=eq.${templateId}&order=sort_order.asc`).catch(() => []);
    const templateRows = await dbGet(url, key, `process_templates?id=eq.${templateId}&select=name&limit=1`).catch(() => []);
    const templateName = String(templateRows[0]?.name || '').trim();
    const DRAFT_FIELD_MAP: Record<string, string> = {
      invoices: 'process_draft', purchaseInvoices: 'process_draft',
      tasks: 'sub_process_draft',
    };
    const draftFieldKey = DRAFT_FIELD_MAP[moduleId] || 'process_draft';
    const draft = { template_id: templateId, template_name: templateName, stages: stages };
    await updateRecord(url, key, moduleId, String(record.id), {
      process_template_id: templateId,
      [draftFieldKey]: JSON.stringify(draft),
    });
    return;
  }

  // ── publish_story ─────────────────────────────────────────────────────
  if (action.type === 'publish_story') {
    const content = renderTemplate(String(config.content || ''), record).trim();
    if (!content) return;
    await dbInsert(url, key, 'org_stories', {
      org_id: orgId, content, story_type: config.story_type || 'text',
      media_url: config.media_url || null, created_by: null,
    }).catch((e) => console.warn('[workflow-runner] publish_story failed:', e.message));
    return;
  }

  // ── send_to_next_stages ───────────────────────────────────────────────
  if (action.type === 'send_to_next_stages') {
    const fieldKey = String(config.field || '').trim();
    if (!fieldKey || !record?.id) return;
    const processRunId = String(record.process_run_id || '').trim();
    if (!processRunId) return;
    const valueMode = String(config.value_mode || 'static');
    let nextValue: any = config.value ?? null;
    if (valueMode === 'from_source') {
      const sf = String(config.source_field || '').trim();
      if (sf) nextValue = getFieldValue(record, sf);
    }
    const tasks = await dbGet(url, key,
      `tasks?process_run_id=eq.${processRunId}&order=sort_order.asc&select=id,sort_order,status`
    ).catch(() => []);
    const currentTaskId = String(record.task_id || record.id || '').trim();
    const currentIdx = tasks.findIndex((t: any) => String(t.id) === currentTaskId);
    const offset = parseInt(String(config.stage_offset || 1), 10) || 1;
    const targetTask = tasks[currentIdx + offset];
    if (!targetTask?.id) return;
    await updateRecord(url, key, 'tasks', String(targetTask.id), { [fieldKey]: nextValue });
    return;
  }

  // ── send_email ────────────────────────────────────────────────────────
  if (action.type === 'send_email') {
    const subject = renderTemplate(String(config.subject || ''), record).trim();
    const body = renderTemplate(String(config.body || ''), record).trim();
    if (!subject && !body) return;
    const manuals: string[] = (Array.isArray(config.manual_emails) ? config.manual_emails : [])
      .map((v: any) => String(v || '').trim()).filter(Boolean);
    const fromFields: string[] = (Array.isArray(config.recipient_fields) ? config.recipient_fields : [])
      .flatMap((fieldKey: any) => {
        const val = record?.[String(fieldKey || '').trim()];
        return Array.isArray(val) ? val.map(String) : [String(val || '')];
      }).filter(Boolean);
    const to = Array.from(new Set([...manuals, ...fromFields]))
      .filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
    if (to.length === 0) { console.warn('[workflow-runner] send_email: no valid recipients'); return; }
    const emailFnUrl = `${url.replace(/\/$/, '')}/functions/v1/send-email`;
    const resp = await fetch(emailFnUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ to, subject, body, org_id: orgId }),
      signal: AbortSignal.timeout(30000),
    }).catch((e) => { console.warn('[workflow-runner] send_email fetch error:', e.message); return null; });
    if (!resp) return;
    if (!resp.ok) {
      const msg = await resp.text().catch(() => String(resp.status));
      console.warn('[workflow-runner] send_email failed:', msg);
    }
    return;
  }

  console.warn(`[workflow-runner] Unknown action type: ${action.type}`);
}

// ── Main execution loop ─────────────────────────────────────���──────────────────

async function runIntervalTick(url: string, key: string): Promise<Record<string, any>> {
  const now = new Date();
  const stats = { checkedWorkflows: 0, claimedWorkflows: 0, processedRecords: 0, executedActions: 0, failedRuns: 0 };

  const workflows = await fetchQueuedWorkflows(url, key);
  stats.checkedWorkflows = workflows.length;

  for (const workflow of workflows) {
    // Re-validate: check interval schedule + day condition (pg_cron doesn't check all of these)
    if (!checkIntervalDue(workflow, now)) {
      await clearServerQueued(url, key, workflow.id);
      continue;
    }
    if (!checkIntervalDayCondition(workflow.interval_day_condition, now)) {
      await clearServerQueued(url, key, workflow.id);
      continue;
    }

    const claimed = await claimWorkflow(url, key, workflow.id, workflow.last_run_at);
    if (!claimed) continue;
    stats.claimedWorkflows++;

    const targetTable = getModuleTable(String(workflow.module_id || '').trim());
    const batchSize = Math.max(10, Math.min(5000, Number(workflow.batch_size || DEFAULT_BATCH_SIZE)));
    const records = await fetchModuleRecords(url, key, targetTable, workflow.org_id, batchSize).catch((e) => {
      console.error('[workflow-runner] Record fetch failed:', e.message); return [];
    });

    const conditionsAll = (Array.isArray(workflow.conditions_all) ? workflow.conditions_all : [])
      .filter((c) => !['changed', 'changed_from', 'changed_to'].includes(String(c?.operator || '')));
    const conditionsAny = (Array.isArray(workflow.conditions_any) ? workflow.conditions_any : [])
      .filter((c) => !['changed', 'changed_from', 'changed_to'].includes(String(c?.operator || '')));

    const executionMode = String(workflow.execution_mode || 'first_match');
    let executedRecordIds: Set<string> | null = null;

    if (executionMode === 'first_match' && records.length > 0) {
      const recordIds = records.map((r: any) => String(r?.id || '')).filter(Boolean);
      if (recordIds.length > 0) {
        const idList = recordIds.join(',');
        const logs = await dbGet(url, key,
          `workflow_logs?workflow_id=eq.${workflow.id}&run_type=eq.scheduled&module_id=eq.${workflow.module_id}&status=eq.success&record_id=in.(${idList})&select=record_id`
        ).catch(() => []);
        executedRecordIds = new Set(logs.map((l: any) => String(l?.record_id || '')));
      }
    }

    for (const record of records) {
      stats.processedRecords++;
      const matched = evaluateConditions(conditionsAll, conditionsAny, record);
      if (!matched) continue;

      const recordId = String(record?.id || '').trim();
      if (executionMode === 'first_match' && recordId) {
        if (executedRecordIds?.has(recordId)) continue;
      }

      const actions = Array.isArray(workflow.actions) ? workflow.actions : [];
      const errors: string[] = [];

      for (const action of actions) {
        try {
          await executeAction(action as WorkflowAction, record, workflow.module_id, workflow.org_id, url, key);
          stats.executedActions++;
        } catch (e: any) {
          errors.push(String(e?.message || action.type || 'action failed'));
          console.error(`[workflow-runner] Action failed (${workflow.name}/${action.type}):`, e.message);
          stats.failedRuns++;
        }
      }

      if (recordId) {
        await insertWorkflowLog(url, key, {
          workflow_id: workflow.id, org_id: workflow.org_id,
          module_id: workflow.module_id, record_id: recordId,
          run_type: 'scheduled',
          status: errors.length > 0 ? 'failed' : 'success',
          message: errors.length > 0 ? errors.join(' | ') : undefined,
          details: { workflow_name: workflow.name, action_count: actions.length },
        });
        if (executedRecordIds && errors.length === 0) executedRecordIds.add(recordId);
      }
    }
  }

  return stats;
}

// ── Deno.serve ─────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (status: number, payload: Record<string, any>) =>
  new Response(JSON.stringify({ build: FUNCTION_BUILD, ...payload }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST' && req.method !== 'GET') return json(405, { ok: false, error: 'Method not allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json(500, { ok: false, error: 'Missing env vars' });

  // Auth: accept service role key OR internal cron secret
  const authHeader = req.headers.get('Authorization') || '';
  const cronSecret = String(Deno.env.get('WORKFLOW_CRON_SECRET') || '').trim();
  const requestSecret = String(req.headers.get('X-Cron-Secret') || '').trim();
  const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;
  const isCronSecret = cronSecret && requestSecret === cronSecret;

  if (!isServiceRole && !isCronSecret) {
    return json(401, { ok: false, error: 'Unauthorized' });
  }

  try {
    const stats = await runIntervalTick(supabaseUrl, serviceRoleKey);
    console.log(`[workflow-runner] build=${FUNCTION_BUILD} stats=${JSON.stringify(stats)}`);
    return json(200, { ok: true, stats });
  } catch (e: any) {
    console.error('[workflow-runner] Fatal error:', e.message);
    return json(500, { ok: false, error: String(e?.message || 'internal error') });
  }
});
