// @ts-nocheck
// workflow-interval-runner: Server-side interval workflow executor
// Called by pg_cron via pg_net every 5 minutes — no browser dependency.
// Tenant isolation: every DB operation is filtered by org_id.

const FUNCTION_BUILD = 'workflow-interval-runner-2026-05-26-01';
const MAX_WORKFLOWS = 30;
const DEFAULT_BATCH_SIZE = 300;
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;
const WORKFLOW_ASSIGNEE_FIELD_KEY = '__workflow_assignee';
const WORKFLOW_RELATED_FIELD_PREFIX = '__workflow_related__';
const WORKFLOW_MULTI_RELATION_PREFIX = '__workflow_multi_relation__';
const PROCESS_NEXT_STAGE_FIELD_PREFIX = '__process_next_stage__';
const CALENDAR_PUBLIC_BASE_URL = String(
  Deno.env.get('KALAMAPP_PUBLIC_BASE_URL')
  || Deno.env.get('PUBLIC_APP_URL')
  || Deno.env.get('PUBLIC_SITE_URL')
  || Deno.env.get('SITE_URL')
  || ''
).trim().replace(/\/+$/, '');

// ── Types ──────────────────────────────────────────────────────────────────────

type WorkflowCondition = {
  id?: string;
  field: string;
  operator: string;
  value?: any;
};

type HolidayApiEvent = {
  isHoliday?: boolean;
  event?: string;
  calendarType?: 'jalali' | 'hijri' | 'gregorian';
};

type HolidayApiDay = {
  day?: {
    jalali?: string;
    gregorian?: string;
    hijri?: string;
  };
  events?: {
    isHoliday?: boolean;
    list?: HolidayApiEvent[];
  };
};

type HolidayApiMonth = {
  days?: HolidayApiDay[];
};

const holidayYearCache = new Map<number, Promise<HolidayApiMonth[] | null>>();

const CALENDAR_EVENT_MOVES = [
  { from: '1405/03/05', to: '1405/03/06', eventIncludes: 'عید سعید قربان', event: { isHoliday: true, event: 'عید سعید قربان', calendarType: 'hijri' as const } },
  { from: '1405/03/05', to: '1405/03/06', eventIncludes: 'آغاز دههٔ امامت و ولایت', event: { isHoliday: false, event: 'آغاز دههٔ امامت و ولایت', calendarType: 'hijri' as const } },
  { from: '1405/03/13', to: '1405/03/14', eventIncludes: 'عید سعید غدیر خم', event: { isHoliday: true, event: 'عید سعید غدیر خم(۱۰ ه‍‍.ق)', calendarType: 'hijri' as const } },
];

type WorkflowAction = {
  id?: string;
  type: string;
  config: Record<string, any>;
};

type ActionExecutionResult = {
  action_type: string;
  action_id: string | null;
  status: 'success' | 'skipped' | 'failed';
  recipient_count?: number;
  affected_count?: number;
  message?: string;
  details?: Record<string, any>;
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

function toEnglishDigits(value: string): string {
  return String(value || '')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

function normalizeDateKey(value: string): string {
  return toEnglishDigits(value)
    .replace(/-/g, '/')
    .split('/')
    .map((part, index) => (index === 0 ? part.padStart(4, '0') : part.padStart(2, '0')))
    .join('/');
}

async function loadHolidayYear(jalaliYear: number): Promise<HolidayApiMonth[] | null> {
  if (!CALENDAR_PUBLIC_BASE_URL || !Number.isFinite(jalaliYear)) return null;
  if (!holidayYearCache.has(jalaliYear)) {
    holidayYearCache.set(jalaliYear, (async () => {
      const response = await fetch(`${CALENDAR_PUBLIC_BASE_URL}/calendar/${jalaliYear}.json`, { cache: 'force-cache' });
      if (!response.ok) return null;
      const data = await response.json();
      return Array.isArray(data) ? data : null;
    })().catch((error) => {
      console.warn(`[workflow-runner] Calendar fetch failed for ${jalaliYear}:`, error?.message || error);
      return null;
    }));
  }
  return holidayYearCache.get(jalaliYear) || null;
}

function applyCalendarEventMoves(dateKey: string, events: HolidayApiEvent[]): HolidayApiEvent[] {
  const normalizedDateKey = normalizeDateKey(dateKey);
  let nextEvents = [...events];
  for (const move of CALENDAR_EVENT_MOVES) {
    const from = normalizeDateKey(move.from);
    const to = normalizeDateKey(move.to);
    if (normalizedDateKey === from) {
      nextEvents = nextEvents.filter((item) => !String(item?.event || '').includes(move.eventIncludes));
    }
    if (
      normalizedDateKey === to &&
      !nextEvents.some((item) => String(item?.event || '').includes(move.eventIncludes))
    ) {
      nextEvents.push(move.event);
    }
  }
  return nextEvents;
}

function normalizeOccasionText(value: unknown): string {
  return toEnglishDigits(String(value ?? '')).trim().toLocaleLowerCase('fa-IR');
}

function normalizeOccasionValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeOccasionValues(item));
  if (value && typeof value === 'object') {
    const nested = (value as any)?.values || (value as any)?.items || (value as any)?.selected;
    if (Array.isArray(nested)) return normalizeOccasionValues(nested);
    return [(value as any)?.value, (value as any)?.label, (value as any)?.title, (value as any)?.event]
      .filter((item) => item !== undefined && item !== null && item !== '')
      .map((item) => normalizeOccasionText(item));
  }
  const text = normalizeOccasionText(value);
  return text ? [text] : [];
}

function occasionMatches(title: string, expected: string): boolean {
  const normalizedTitle = normalizeOccasionText(title);
  const normalizedExpected = normalizeOccasionText(expected);
  return !!normalizedExpected && (
    normalizedTitle === normalizedExpected ||
    normalizedTitle.includes(normalizedExpected) ||
    normalizedExpected.includes(normalizedTitle)
  );
}

async function getHolidayEventsForDate(value: unknown): Promise<HolidayApiEvent[]> {
  const date = value ? new Date(String(value)) : null;
  if (!date || isNaN(date.getTime())) return [];
  const dateKey = formatJalaliDate(date.toISOString());
  const [yearText, monthText, dayText] = normalizeDateKey(dateKey).split('/');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const yearData = await loadHolidayYear(year);
  const monthData = Array.isArray(yearData) ? yearData[month - 1] : null;
  const dayData = monthData?.days?.find((item) => Number(toEnglishDigits(item?.day?.jalali || '0')) === day);
  return applyCalendarEventMoves(dateKey, (dayData?.events?.list || []) as HolidayApiEvent[]);
}

async function dateHasAnyOccasion(value: unknown, expectedValue: unknown): Promise<boolean> {
  const expected = normalizeOccasionValues(expectedValue);
  if (expected.length === 0) return false;
  const titles = (await getHolidayEventsForDate(value)).map((item) => String(item?.event || '').trim()).filter(Boolean);
  return titles.some((title) => expected.some((item) => occasionMatches(title, item)));
}

async function dateIsDaysBeforeOccasion(value: unknown, expectedValue: unknown): Promise<boolean> {
  const date = value ? new Date(String(value)) : null;
  if (!date || isNaN(date.getTime())) return false;
  const config = expectedValue && typeof expectedValue === 'object' && !Array.isArray(expectedValue)
    ? expectedValue as Record<string, any>
    : {};
  const days = Number(config.days ?? config.count ?? 0);
  if (!Number.isFinite(days) || days < 0) return false;
  const occasion = config.occasion ?? config.event ?? config.value;
  if (normalizeOccasionValues(occasion).length === 0) return false;
  const target = new Date(date);
  target.setDate(target.getDate() + days);
  return dateHasAnyOccasion(target.toISOString(), occasion);
}

function formatJalaliDateTime(isoDate: string): string {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  const tehranDate = new Date(isoDate);
  const local = new Date(tehranDate.getTime() + TEHRAN_OFFSET_MS);
  const [jy, jm, jd] = gregorianToJalali(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate());
  const h = String(local.getUTCHours()).padStart(2, '0');
  const min = String(local.getUTCMinutes()).padStart(2, '0');
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')} ${h}:${min}`;
}

// ── Template rendering ─────────────────────────────────────────────────────────

const DATE_LIKE_REGEX = /^\d{4}-\d{2}-\d{2}/;

const asArray = (value: any): any[] => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [value];
};

const toTehranDate = (date: Date) => new Date(date.getTime() + TEHRAN_OFFSET_MS);
const fromTehranDate = (date: Date) => new Date(date.getTime() - TEHRAN_OFFSET_MS);

function getFieldValue(record: Record<string, any>, fieldKey: string): any {
  if (Object.prototype.hasOwnProperty.call(record, fieldKey)) return record[fieldKey];
  const parts = fieldKey.split('.');
  let cur: any = record;
  for (const p of parts) { cur = cur?.[p]; if (cur === undefined) break; }
  return cur;
}

function buildResolvedAssigneeCombo(record: Record<string, any>): string | null {
  const assigneeType = String(record?.assignee_type || '').trim().toLowerCase();
  const roleId = String(record?.assignee_role_id || '').trim();
  const userId = String(record?.assignee_id || '').trim();
  if (assigneeType === 'role' || (!assigneeType && roleId)) {
    const id = roleId || userId;
    return id ? `role_${id}` : null;
  }
  return userId ? `user_${userId}` : null;
}

function parseWorkflowRelatedFieldKey(value: string) {
  const raw = String(value || '').trim();
  if (!raw.startsWith(WORKFLOW_RELATED_FIELD_PREFIX)) return null;
  const parts = raw.slice(WORKFLOW_RELATED_FIELD_PREFIX.length).split('::');
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  return { relationFieldKey: parts[0], targetModuleId: parts[1], targetFieldKey: parts[2] };
}

function parseWorkflowMultiRelationFieldKey(value: string) {
  const raw = String(value || '').trim();
  if (!raw.startsWith(WORKFLOW_MULTI_RELATION_PREFIX)) return null;
  const parts = raw.slice(WORKFLOW_MULTI_RELATION_PREFIX.length).split('::');
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  return { fieldKey: parts[0], targetModuleId: parts[1], targetFieldKey: parts[2] };
}

function parseProcessNextStageFieldKey(value: string) {
  const raw = String(value || '').trim();
  if (!raw.startsWith(PROCESS_NEXT_STAGE_FIELD_PREFIX)) return null;
  const match = raw.slice(PROCESS_NEXT_STAGE_FIELD_PREFIX.length).match(/^([12])__(.+)$/);
  if (!match?.[1] || !match?.[2]) return null;
  return { offset: Number(match[1]), fieldKey: String(match[2]).trim() };
}

function normalizeMultiRelationIds(value: any): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeMultiRelationIds(item));
  if (value && typeof value === 'object') {
    return [value.id, value.value, value.record_id].map((item) => String(item || '').trim()).filter(Boolean);
  }
  const raw = String(value || '').trim();
  if (!raw) return [];
  if (raw.startsWith('{') && raw.endsWith('}')) {
    try { return normalizeMultiRelationIds(JSON.parse(raw)); } catch { return [raw]; }
  }
  return [raw];
}

async function fetchRelatedRecord(url: string, key: string, moduleId: string, recordId: string): Promise<Record<string, any> | null> {
  const table = getModuleTable(moduleId);
  const rows = await dbGet(url, key, `${table}?id=eq.${encodeURIComponent(recordId)}&select=*&limit=1`).catch(() => []);
  return rows[0] || null;
}

function normalizeMultiRelationCommunicationValues(targetModuleId: string, targetFieldKey: string, values: any[]): any[] {
  const normalizedTargetModuleId = String(targetModuleId || '').trim();
  const normalizedTargetFieldKey = String(targetFieldKey || '').trim();
  if (
    normalizedTargetFieldKey === 'related_profile_id'
    || (normalizedTargetModuleId === 'profiles' && normalizedTargetFieldKey === 'id')
  ) {
    return values
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .map((value) => `user_${value}`);
  }
  return values;
}

async function resolveWorkflowFieldValue(
  url: string,
  key: string,
  fieldKey: string,
  record: Record<string, any>,
): Promise<any> {
  const normalizedFieldKey = String(fieldKey || '').trim();
  if (!normalizedFieldKey) return null;
  if (normalizedFieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY) return buildResolvedAssigneeCombo(record);

  const relatedMeta = parseWorkflowRelatedFieldKey(normalizedFieldKey);
  if (relatedMeta) {
    const relationId = String(getFieldValue(record, relatedMeta.relationFieldKey) || '').trim();
    if (!relationId) return null;
    const relatedRecord = await fetchRelatedRecord(url, key, relatedMeta.targetModuleId, relationId);
    if (!relatedRecord) return null;
    if (relatedMeta.targetFieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY) return buildResolvedAssigneeCombo(relatedRecord);
    return getFieldValue(relatedRecord, relatedMeta.targetFieldKey);
  }

  const multiRelationMeta = parseWorkflowMultiRelationFieldKey(normalizedFieldKey);
  if (multiRelationMeta) {
    const ids = Array.from(new Set(normalizeMultiRelationIds(getFieldValue(record, multiRelationMeta.fieldKey))));
    const values: any[] = [];
    for (const id of ids) {
      const relatedRecord = await fetchRelatedRecord(url, key, multiRelationMeta.targetModuleId, id);
      if (!relatedRecord) continue;
      if (multiRelationMeta.targetFieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY) {
        const assignee = buildResolvedAssigneeCombo(relatedRecord);
        if (assignee) values.push(assignee);
      } else {
        const value = getFieldValue(relatedRecord, multiRelationMeta.targetFieldKey);
        if (Array.isArray(value)) values.push(...value);
        else if (value !== null && value !== undefined && value !== '') values.push(value);
      }
    }
    return normalizeMultiRelationCommunicationValues(multiRelationMeta.targetModuleId, multiRelationMeta.targetFieldKey, values);
  }

  return getFieldValue(record, normalizedFieldKey);
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

async function renderTemplateAsync(
  template: string,
  record: Record<string, any>,
  url: string,
  key: string,
  bold = false,
): Promise<string> {
  const raw = String(template || '');
  const matches = Array.from(raw.matchAll(/\{\{\s*([^}]+)\s*\}\}/g));
  if (matches.length === 0) return raw;

  let rendered = raw;
  for (const match of matches) {
    const token = match[0];
    const fieldKey = String(match[1] || '').trim();
    if (!fieldKey) continue;
    const value = await resolveWorkflowFieldValue(url, key, fieldKey, record);
    const text = formatFieldValue(value, fieldKey);
    rendered = rendered.replaceAll(token, text ? (bold ? `**${text}**` : text) : '');
  }
  return rendered;
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

async function evaluateCondition(condition: WorkflowCondition, record: Record<string, any>): Promise<boolean> {
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
      const events = await getHolidayEventsForDate(current);
      return events.some((event) => event?.isHoliday === true);
    }
    case 'occasion_eq':
    case 'occasion_contains': {
      return dateHasAnyOccasion(current, expected);
    }
    case 'occasion_neq':
    case 'occasion_not_contains': {
      return !(await dateHasAnyOccasion(current, expected));
    }
    case 'days_before_occasion': {
      return dateIsDaysBeforeOccasion(current, expected);
    }
    default:
      console.warn(`[workflow-runner] Unknown operator: ${operator}`);
      return true;
  }
}

async function evaluateConditions(
  conditionsAll: WorkflowCondition[],
  conditionsAny: WorkflowCondition[],
  record: Record<string, any>
): Promise<boolean> {
  const allConditions = Array.isArray(conditionsAll) ? conditionsAll : [];
  const anyConditions = Array.isArray(conditionsAny) ? conditionsAny : [];

  if (allConditions.length > 0) {
    for (const c of allConditions) {
      if (!await evaluateCondition(c, record)) return false;
    }
  }

  if (anyConditions.length > 0) {
    let anyPassed = false;
    for (const c of anyConditions) {
      if (await evaluateCondition(c, record)) { anyPassed = true; break; }
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
  const tehranNow = toTehranDate(now);

  // Respect interval_first_run_at for first run
  if (!lastRunAt && workflow.interval_first_run_at) {
    const firstRun = new Date(workflow.interval_first_run_at);
    if (!isNaN(firstRun.getTime()) && now < firstRun) return false;
  }

  // Hour window check
  if (unit === 'hour') {
    const from = workflow.interval_allowed_from_hour;
    const to = workflow.interval_allowed_to_hour;
    const h = tehranNow.getUTCHours();
    if (from !== null && to !== null && (h < from || h > to)) return false;
  }

  // Month: day-of-month check
  if (unit === 'month' && workflow.interval_day_of_month) {
    const target = Math.min(31, Math.max(1, workflow.interval_day_of_month));
    if (tehranNow.getUTCDate() !== target) return false;
  }

  if (!lastRunAt) return true;

  const effectiveIntervalAt = unit === 'hour'
    ? (typeof workflow.interval_minute === 'number' ? `00:${String(workflow.interval_minute).padStart(2, '0')}` : null)
    : workflow.interval_at;

  let nextLocal = toTehranDate(lastRunAt);
  if (unit === 'hour') nextLocal.setUTCHours(nextLocal.getUTCHours() + value);
  else if (unit === 'day') nextLocal.setUTCDate(nextLocal.getUTCDate() + value);
  else nextLocal.setUTCMonth(nextLocal.getUTCMonth() + value);

  const parsedTime = parseIntervalAt(effectiveIntervalAt);
  if (parsedTime) {
    if (unit === 'hour') {
      nextLocal.setUTCMinutes(parsedTime.minute, 0, 0);
    } else {
      nextLocal.setUTCHours(parsedTime.hour, parsedTime.minute, 0, 0);
    }
  }

  const next = fromTehranDate(nextLocal);
  return now >= next;
}

function checkIntervalDayCondition(condition: string | null | undefined, now: Date): boolean {
  const cond = String(condition || 'any').trim();
  if (!cond || cond === 'any') return true;
  const day = toTehranDate(now).getUTCDay();
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

async function resolveStoryPublisher(
  url: string,
  key: string,
  orgId: string
): Promise<{ creatorId: string | null; creatorName: string; creatorAvatar: string | null }> {
  const companyRows = await dbGet(
    url,
    key,
    `company_settings?org_id=eq.${orgId}&select=logo_url&limit=1`
  ).catch(() => []);

  return {
    creatorId: null,
    creatorName: 'سیستم',
    creatorAvatar: String(companyRows[0]?.logo_url || '').trim() || null,
  };
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

async function loadChatGroups(url: string, key: string, groupIds: string[]): Promise<Array<{ id: string; user_ids: any[]; role_ids: any[] }>> {
  const ids = Array.from(new Set(groupIds.map((id) => String(id || '').trim()).filter(Boolean)));
  if (ids.length === 0) return [];
  return await dbGet(url, key, `chat_groups?id=in.(${ids.join(',')})&select=id,user_ids,role_ids`).catch(() => []);
}

async function expandChatGroupsIntoSets(
  url: string,
  key: string,
  groupIds: Set<string>,
  userIds: Set<string>,
  roleIds: Set<string>
): Promise<Array<{ groupId: string; userIds: string[]; roleIds: string[] }>> {
  const groups = await loadChatGroups(url, key, Array.from(groupIds));
  return groups.map((group: any) => {
    const groupId = String(group?.id || '').trim();
    const groupUserIds = asArray(group?.user_ids).map((id) => String(id || '').trim()).filter(Boolean);
    const groupRoleIds = asArray(group?.role_ids).map((id) => String(id || '').trim()).filter(Boolean);
    groupUserIds.forEach((id) => userIds.add(id));
    groupRoleIds.forEach((id) => roleIds.add(id));
    return { groupId, userIds: groupUserIds, roleIds: groupRoleIds };
  }).filter((group) => Boolean(group.groupId));
}

async function resolveAssigneesToSmsRecipients(
  url: string, key: string, orgId: string,
  recipientAssignees: any[], recipientFields: any[], record: Record<string, any>
): Promise<string[]> {
  const userIds = new Set<string>();
  const roleIds = new Set<string>();
  const groupIds = new Set<string>();
  const directPhones: string[] = [];

  const processEntry = (entry: any) => {
    const token = parseRecipientToken(String(entry ?? ''));
    if (token?.kind === 'user') { userIds.add(token.id); return; }
    if (token?.kind === 'role') { roleIds.add(token.id); return; }
    if (token?.kind === 'chat_group') { groupIds.add(token.id); return; }
    const phone = normalizePhone(String(entry ?? ''));
    if (phone) directPhones.push(phone);
  };

  (Array.isArray(recipientAssignees) ? recipientAssignees : []).forEach(processEntry);
  for (const fieldKey of (Array.isArray(recipientFields) ? recipientFields : [])) {
    const val = await resolveWorkflowFieldValue(url, key, String(fieldKey ?? ''), record);
    if (Array.isArray(val)) val.forEach(processEntry);
    else processEntry(val);
  }

  await expandChatGroupsIntoSets(url, key, groupIds, userIds, roleIds);

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

async function resolveAssigneesToMentionTargets(
  url: string, key: string, orgId: string,
  recipientAssignees: any[], recipientFields: any[], record: Record<string, any>
): Promise<{ mentionUserIds: string[]; mentionRoleIds: string[]; groupTargets: Array<{ groupId: string; userIds: string[]; roleIds: string[] }> }> {
  const userIds = new Set<string>();
  const roleIds = new Set<string>();
  const groupIds = new Set<string>();

  const processEntry = (entry: any) => {
    const token = parseRecipientToken(String(entry ?? ''));
    if (token?.kind === 'user') { userIds.add(token.id); return; }
    if (token?.kind === 'role') { roleIds.add(token.id); return; }
    if (token?.kind === 'chat_group') { groupIds.add(token.id); return; }
  };

  (Array.isArray(recipientAssignees) ? recipientAssignees : []).forEach(processEntry);
  for (const fieldKey of (Array.isArray(recipientFields) ? recipientFields : [])) {
    const val = await resolveWorkflowFieldValue(url, key, String(fieldKey ?? ''), record);
    if (Array.isArray(val)) val.forEach(processEntry);
    else processEntry(val);
  }

  const groupRows = await loadChatGroups(url, key, Array.from(groupIds));
  const groupTargets = groupRows.map((group: any) => {
    const groupId = String(group?.id || '').trim();
    if (!groupId) return null;
    return {
      groupId,
      userIds: asArray(group?.user_ids).map((id) => String(id || '').trim()).filter(Boolean),
      roleIds: asArray(group?.role_ids).map((id) => String(id || '').trim()).filter(Boolean),
    };
  }).filter(Boolean) as Array<{ groupId: string; userIds: string[]; roleIds: string[] }>;

  return {
    mentionUserIds: Array.from(userIds),
    mentionRoleIds: Array.from(roleIds),
    groupTargets,
  };
}

// ── Bot recipient resolution ───────────────────────────────────────────────────

async function resolveAssigneesToBotChatIds(
  url: string, key: string, orgId: string,
  recipientAssignees: any[], recipientFields: any[], record: Record<string, any>,
  channel: 'bale' | 'telegram' | 'rubika'
): Promise<string[]> {
  const userIds = new Set<string>();
  const roleIds = new Set<string>();
  const groupIds = new Set<string>();
  const directChatIds: string[] = [];

  const processEntry = (entry: any) => {
    const token = parseRecipientToken(String(entry ?? ''));
    if (token?.kind === 'user') { userIds.add(token.id); return; }
    if (token?.kind === 'role') { roleIds.add(token.id); return; }
    if (token?.kind === 'chat_group') { groupIds.add(token.id); return; }
    const v = String(entry ?? '').trim();
    if (v) directChatIds.push(v);
  };

  (Array.isArray(recipientAssignees) ? recipientAssignees : []).forEach(processEntry);
  for (const fk of (Array.isArray(recipientFields) ? recipientFields : [])) {
    const val = await resolveWorkflowFieldValue(url, key, String(fk ?? ''), record);
    if (Array.isArray(val)) val.forEach(processEntry);
    else processEntry(val);
  }

  await expandChatGroupsIntoSets(url, key, groupIds, userIds, roleIds);

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

async function insertSmsAudit(url: string, key: string, payload: {
  orgId: string;
  moduleId?: string | null;
  recordId?: string | null;
  recipient: string;
  text: string;
  status: 'provider_accepted' | 'failed' | 'skipped';
  errorMessage?: string | null;
  metadata?: Record<string, any>;
}): Promise<void> {
  await dbInsert(url, key, 'outbound_messages', {
    org_id: payload.orgId,
    channel_type: 'sms',
    direction: 'outbound',
    provider: 'meli_payamak',
    module_id: payload.moduleId || null,
    record_id: payload.recordId || null,
    customer_id: payload.moduleId === 'customers' ? payload.recordId || null : null,
    recipient: payload.recipient || null,
    title: 'ارسال پیامک خودکار',
    message_text: payload.text,
    status: payload.status,
    error_message: payload.errorMessage || null,
    metadata: {
      source_type: 'workflow',
      runner_build: FUNCTION_BUILD,
      ...(payload.metadata || {}),
    },
    sent_at: payload.status === 'provider_accepted' ? new Date().toISOString() : null,
  }).catch((e) => console.warn('[workflow-runner] Failed to insert SMS audit:', e.message));
}

async function auditSmsBatch(url: string, key: string, payload: {
  orgId: string;
  moduleId: string;
  recordId: string | null;
  recipients: string[];
  text: string;
  status: 'provider_accepted' | 'failed' | 'skipped';
  errorMessage?: string | null;
  metadata?: Record<string, any>;
}): Promise<void> {
  for (const recipient of payload.recipients) {
    await insertSmsAudit(url, key, {
      orgId: payload.orgId,
      moduleId: payload.moduleId,
      recordId: payload.recordId,
      recipient,
      text: payload.text,
      status: payload.status,
      errorMessage: payload.errorMessage,
      metadata: payload.metadata,
    });
  }
}

async function sendSmsViaProvider(settings: any, to: string[], text: string): Promise<string[]> {
  const username = String(settings.username || '').trim();
  const password = String(settings.password || settings.api_key || '').trim();
  const apiKey = String(settings.api_key || '').trim();
  const senderNumber = String(settings.sender_number || '').trim();
  if (!senderNumber || (!username && !apiKey)) throw new Error('تنظیمات پیامک ناقص است');
  if (!text.trim()) throw new Error('متن پیامک خالی است');

  const sentRecipients: string[] = [];
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
    sentRecipients.push(phone);
  }
  return sentRecipients;
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
  const isRubika = channel === 'rubika';
  const baseUrl = isRubika
    ? `https://rubika.ir/rubika/bots/${token}/sendMessage`
    : isTelegram
    ? `https://api.telegram.org/bot${token}/sendMessage`
    : `https://tapi.bale.ai/bot${token}/sendMessage`;
  const payload = { chat_id: chatId, text, parse_mode: 'HTML' };
  await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  }).then(async (response) => {
    if (!response.ok) {
      const raw = await response.text().catch(() => String(response.status));
      throw new Error(`ارسال پیام ${channel} ناموفق بود: ${raw || response.status}`);
    }
  });
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

function actionResult(
  action: WorkflowAction,
  status: ActionExecutionResult['status'],
  message?: string,
  patch: Partial<ActionExecutionResult> = {}
): ActionExecutionResult {
  return {
    action_type: String(action?.type || ''),
    action_id: action?.id || null,
    status,
    ...(message ? { message } : {}),
    ...patch,
  };
}

async function resolveConfiguredActionValue(
  config: Record<string, any>,
  record: Record<string, any>,
  url: string,
  key: string
): Promise<any> {
  const valueMode = String(config.value_mode || 'static');
  if (valueMode === 'from_source') {
    const sourceField = String(config.source_field || '').trim();
    return sourceField ? await resolveWorkflowFieldValue(url, key, sourceField, record) : null;
  }
  return config.value ?? null;
}

async function executeAction(
  action: WorkflowAction, record: Record<string, any>,
  moduleId: string, orgId: string, url: string, key: string
): Promise<ActionExecutionResult> {
  const config = action.config || {};
  const recordId = String(record?.id || '').trim();

  // ── send_sms ──────────────────────────────────────────────────────────
  if (action.type === 'send_sms') {
    const text = (await renderTemplateAsync(String(config.message || ''), record, url, key)).trim();
    if (!text) return actionResult(action, 'skipped', 'متن پیامک خالی است.');
    const recipients = await resolveAssigneesToSmsRecipients(
      url, key, orgId,
      config.recipient_assignees || [], config.recipient_fields || [], record
    );
    const manuals = (config.manual_numbers || []).map(normalizePhone).filter(isValidIranMobile);
    const allRecipients = Array.from(new Set([...recipients, ...manuals]));
    if (allRecipients.length === 0) return actionResult(action, 'skipped', 'گیرنده معتبر برای پیامک پیدا نشد.', { recipient_count: 0 });
    const smsSettings = await getOrgSmsSettings(url, key, orgId);
    if (!smsSettings) {
      await auditSmsBatch(url, key, { orgId, moduleId, recordId, recipients: allRecipients, text, status: 'skipped', errorMessage: 'تنظیمات پیامک فعال نیست.', metadata: { workflow_action_type: action.type, workflow_action_id: action.id || null } });
      return actionResult(action, 'skipped', 'تنظیمات پیامک فعال نیست.', { recipient_count: allRecipients.length });
    }
    try {
      const sentRecipients = await sendSmsViaProvider(smsSettings, allRecipients, text);
      await auditSmsBatch(url, key, { orgId, moduleId, recordId, recipients: sentRecipients, text, status: 'provider_accepted', metadata: { workflow_action_type: action.type, workflow_action_id: action.id || null } });
      return actionResult(action, sentRecipients.length > 0 ? 'success' : 'skipped', sentRecipients.length > 0 ? undefined : 'هیچ شماره معتبری ارسال نشد.', { recipient_count: sentRecipients.length });
    } catch (e: any) {
      await auditSmsBatch(url, key, { orgId, moduleId, recordId, recipients: allRecipients, text, status: 'failed', errorMessage: String(e?.message || e), metadata: { workflow_action_type: action.type, workflow_action_id: action.id || null } });
      throw e;
    }
  }

  // ── send_note / send_note_sms ─────────────────────────────────────────
  if (action.type === 'send_note' || action.type === 'send_note_sms') {
    const noteText = (await renderTemplateAsync(String(config.note_text || ''), record, url, key, true)).trim();
    if (!noteText) return actionResult(action, 'skipped', 'متن یادداشت خالی است.');
    if (!moduleId || !recordId) return actionResult(action, 'skipped', 'رکورد مقصد برای یادداشت مشخص نیست.');
    const mentionTargets = await resolveAssigneesToMentionTargets(
      url, key, orgId,
      config.recipient_assignees || [], config.recipient_fields || [], record
    );
    const noteRows: Record<string, any>[] = [];
    const baseMetadata = { source_type: 'system', notification_surface: 'system_feed', requires_action: false, workflow_action_type: action.type, workflow_action_id: action.id || null };
    const hasDirectMentions = mentionTargets.mentionUserIds.length > 0 || mentionTargets.mentionRoleIds.length > 0;
    if (hasDirectMentions || mentionTargets.groupTargets.length === 0) {
      noteRows.push({
        org_id: orgId, module_id: moduleId, record_id: recordId,
        content: noteText, mention_user_ids: mentionTargets.mentionUserIds, mention_role_ids: mentionTargets.mentionRoleIds,
        source_type: 'system', metadata: baseMetadata,
      });
    }
    mentionTargets.groupTargets.forEach((group) => {
      noteRows.push({
        org_id: orgId, module_id: moduleId, record_id: recordId,
        content: noteText, mention_user_ids: group.userIds, mention_role_ids: group.roleIds,
        source_type: 'system', metadata: { ...baseMetadata, chat_group_id: group.groupId },
      });
    });
    if (noteRows.length === 0 || !hasDirectMentions && mentionTargets.groupTargets.length === 0) {
      return actionResult(action, 'skipped', 'گیرنده یادداشت پیدا نشد.', { recipient_count: 0 });
    }
    for (const noteRow of noteRows) await insertNote(url, key, noteRow as any);
    let smsRecipientCount = 0;
    if (action.type === 'send_note_sms') {
      const smsText = `پیام جدید از طرف "سیستم"\n"${noteText.replace(/\*\*/g, '').substring(0, 80)}"\nبرای مشاهده به سامانه مراجعه کنید`;
      const recipients = await resolveAssigneesToSmsRecipients(url, key, orgId, config.recipient_assignees || [], config.recipient_fields || [], record);
      if (recipients.length > 0) {
        const smsSettings = await getOrgSmsSettings(url, key, orgId);
        if (smsSettings) {
          try {
            const sentRecipients = await sendSmsViaProvider(smsSettings, recipients, smsText);
            smsRecipientCount = sentRecipients.length;
            await auditSmsBatch(url, key, { orgId, moduleId, recordId, recipients: sentRecipients, text: smsText, status: 'provider_accepted', metadata: { workflow_action_type: action.type, workflow_action_id: action.id || null } });
          } catch (e: any) {
            await auditSmsBatch(url, key, { orgId, moduleId, recordId, recipients, text: smsText, status: 'failed', errorMessage: String(e?.message || e), metadata: { workflow_action_type: action.type, workflow_action_id: action.id || null } });
            throw e;
          }
        }
      }
    }
    return actionResult(action, 'success', undefined, {
      recipient_count: mentionTargets.mentionUserIds.length + mentionTargets.mentionRoleIds.length + mentionTargets.groupTargets.length + smsRecipientCount,
      affected_count: noteRows.length,
      details: { note_count: noteRows.length, sms_recipient_count: smsRecipientCount },
    });
  }

  // ── send_bale_bot ─────────────────────────────────────────────────────
  if (action.type === 'send_bale_bot' || action.type === 'send_telegram_bot' || action.type === 'send_bot_message') {
    const configuredChannel = String(config.channel || config.platform || '').trim().toLowerCase();
    const channel = action.type === 'send_telegram_bot'
      ? 'telegram'
      : configuredChannel === 'telegram' || configuredChannel === 'bale' || configuredChannel === 'rubika'
        ? configuredChannel
        : 'bale';
    const text = (await renderTemplateAsync(String(config.message || ''), record, url, key)).trim();
    if (!text) return actionResult(action, 'skipped', 'متن پیام بات خالی است.');
    const botSettings = await getOrgBotSettings(url, key, orgId, channel);
    if (!botSettings) return actionResult(action, 'skipped', `تنظیمات ${channel} فعال نیست.`);
    const chatIds = await resolveAssigneesToBotChatIds(url, key, orgId, config.recipient_assignees || [], config.recipient_fields || [], record, channel);
    if (chatIds.length === 0) return actionResult(action, 'skipped', 'گیرنده بات پیدا نشد.', { recipient_count: 0 });
    for (const chatId of chatIds) {
      await sendBotMessage(chatId, text, botSettings, channel);
    }
    return actionResult(action, 'success', undefined, { recipient_count: chatIds.length });
  }

  // ── send_rubika_bot ───────────────────────────────────────────────────
  if (action.type === 'send_rubika_bot') {
    const text = (await renderTemplateAsync(String(config.message || ''), record, url, key)).trim();
    if (!text) return actionResult(action, 'skipped', 'متن پیام روبیکا خالی است.');
    const botSettings = await getOrgBotSettings(url, key, orgId, 'rubika');
    if (!botSettings) return actionResult(action, 'skipped', 'تنظیمات روبیکا فعال نیست.');
    const chatIds = await resolveAssigneesToBotChatIds(url, key, orgId, config.recipient_assignees || [], config.recipient_fields || [], record, 'rubika');
    if (chatIds.length === 0) return actionResult(action, 'skipped', 'گیرنده روبیکا پیدا نشد.', { recipient_count: 0 });
    for (const chatId of chatIds) {
      const token = String(botSettings.bot_token || '').trim();
      if (!token || !chatId) continue;
      await fetch(`https://rubika.ir/rubika/bots/${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
        signal: AbortSignal.timeout(8000),
      }).then(async (response) => {
        if (!response.ok) {
          const raw = await response.text().catch(() => String(response.status));
          throw new Error(`ارسال پیام روبیکا ناموفق بود: ${raw || response.status}`);
        }
      });
    }
    return actionResult(action, 'success', undefined, { recipient_count: chatIds.length });
  }

  // ── update_record ─────────────────────────────────────────────────────
  if (action.type === 'update_record') {
    const fieldKey = String(config.field || '').trim();
    if (!fieldKey || !record?.id) return actionResult(action, 'skipped', 'فیلد یا رکورد مقصد برای بروزرسانی مشخص نیست.');
    const nextValue = await resolveConfiguredActionValue(config, record, url, key);
    await updateRecord(url, key, moduleId, String(record.id), { [fieldKey]: nextValue });
    return actionResult(action, 'success', undefined, { affected_count: 1, details: { field: fieldKey } });
  }

  // ── create_standalone_record ──────────────────────────────────────────
  if (action.type === 'create_standalone_record') {
    const targetModuleId = String(config.target_module_id || '').trim();
    if (!targetModuleId) return actionResult(action, 'skipped', 'ماژول مقصد برای ایجاد رکورد مشخص نیست.');
    const payload: Record<string, any> = {};
    const mappings = Array.isArray(config.field_mappings) ? config.field_mappings : [];
    for (const mapping of mappings) {
      const tf = String(mapping?.field || '').trim();
      if (!tf) continue;
      if (mapping?.mode === 'from_source') {
        const sf = String(mapping?.source_field || '').trim();
        payload[tf] = sf ? await resolveWorkflowFieldValue(url, key, sf, record) : null;
      } else {
        payload[tf] = mapping?.value ?? null;
      }
    }
    await createRecord(url, key, targetModuleId, orgId, payload);
    return actionResult(action, 'success', undefined, { affected_count: 1, details: { target_module_id: targetModuleId } });
  }

  // ── create_related_record ─────────────────────────────────────────────
  if (action.type === 'create_related_record') {
    const targetModuleId = String(config.target_module_id || '').trim();
    const relationFieldKey = String(config.relation_field_key || '').trim();
    const sourceRecordId = String(record?.id || '').trim();
    if (!targetModuleId || !relationFieldKey || !sourceRecordId) return actionResult(action, 'skipped', 'تنظیمات ایجاد رکورد مرتبط کامل نیست.');
    const payload: Record<string, any> = { [relationFieldKey]: sourceRecordId };
    const mappings = Array.isArray(config.field_mappings) ? config.field_mappings : [];
    for (const mapping of mappings) {
      const tf = String(mapping?.field || '').trim();
      if (!tf) continue;
      if (mapping?.mode === 'from_source') {
        const sf = String(mapping?.source_field || '').trim();
        payload[tf] = sf ? await resolveWorkflowFieldValue(url, key, sf, record) : null;
      } else {
        payload[tf] = mapping?.value ?? null;
      }
    }
    await createRecord(url, key, targetModuleId, orgId, payload);
    return actionResult(action, 'success', undefined, { affected_count: 1, details: { target_module_id: targetModuleId } });
  }

  // ── execute_process ───────────────────────────────────────────────────
  if (action.type === 'execute_process') {
    const templateId = String(config.template_id || '').trim();
    if (!templateId || !record?.id) return actionResult(action, 'skipped', 'قالب فرآیند یا رکورد مقصد مشخص نیست.');
    await callRpc(url, key, 'create_process_run_from_template', {
      p_org_id: orgId,
      p_template_id: templateId,
      p_module_id: moduleId,
      p_record_id: String(record.id),
      p_process_name: null,
      p_copied_mode: 'auto',
    });
    return actionResult(action, 'success', undefined, { affected_count: 1, details: { template_id: templateId } });
  }

  // ── copy_process_template ─────────────────────────────────────────────
  if (action.type === 'copy_process_template') {
    const templateId = String(config.template_id || '').trim();
    if (!templateId || !record?.id) return actionResult(action, 'skipped', 'قالب فرآیند یا رکورد مقصد مشخص نیست.');
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
    return actionResult(action, 'success', undefined, { affected_count: 1, details: { template_id: templateId } });
  }

  // ── publish_story ─────────────────────────────────────────────────────
  if (action.type === 'publish_story') {
    const content = (await renderTemplateAsync(String(config.content || config.text_template || ''), record, url, key)).trim();
    if (!content) return actionResult(action, 'skipped', 'متن استوری خالی است.');
    const publisher = await resolveStoryPublisher(
      url,
      key,
      orgId
    );
    const expiresHoursRaw = config.expires_hours;
    const expiresHours = expiresHoursRaw === null || expiresHoursRaw === undefined || expiresHoursRaw === ''
      ? null
      : Number(expiresHoursRaw);
    const expiresAt = Number.isFinite(expiresHours as number) && Number(expiresHours) > 0
      ? new Date(Date.now() + Number(expiresHours) * 60 * 60 * 1000).toISOString()
      : null;
    const slideType = String(config.slide_type || 'gradient') === 'image' ? 'image' : 'gradient';
    const slide = {
      id: crypto.randomUUID(),
      type: slideType,
      image_url: slideType === 'image' ? String(config.image_url || config.media_url || '').trim() || null : null,
      gradient_key: slideType === 'gradient' ? String(config.gradient_key || 'brand_indigo') : null,
      text_layers: [{
        id: crypto.randomUUID(),
        content,
        x: 50,
        y: 50,
        font_size: 18,
        color: '#FFFFFF',
        align: 'center',
        bold: false,
      }],
      duration_ms: 5000,
    };
    await dbInsert(url, key, 'org_stories', {
      org_id: orgId,
      creator_id: publisher.creatorId,
      creator_name: publisher.creatorName,
      creator_avatar: publisher.creatorAvatar,
      slides: [slide],
      is_org_wide: config.is_org_wide !== false,
      viewer_user_ids: asArray(config.viewer_user_ids).map((id) => String(id || '').trim()).filter(Boolean),
      viewer_role_ids: asArray(config.viewer_role_ids).map((id) => String(id || '').trim()).filter(Boolean),
      mention_user_ids: asArray(config.mention_user_ids).map((id) => String(id || '').trim()).filter(Boolean),
      mention_role_ids: [],
      expires_at: expiresAt,
      is_active: true,
    });
    return actionResult(action, 'success', undefined, { affected_count: 1 });
  }

  // ── send_to_next_stages ───────────────────────────────────────────────
  if (action.type === 'send_to_next_stages') {
    const fieldMeta = parseProcessNextStageFieldKey(String(config.field || '').trim());
    const fieldKey = fieldMeta?.fieldKey || String(config.field || '').trim();
    if (!fieldKey || !record?.id) return actionResult(action, 'skipped', 'فیلد مرحله بعد مشخص نیست.');
    const processRunId = String(record.process_run_id || '').trim();
    if (!processRunId) return actionResult(action, 'skipped', 'فرآیند مرتبط با رکورد پیدا نشد.');
    const nextValue = await resolveConfiguredActionValue(config, record, url, key);
    const tasks = await dbGet(url, key,
      `tasks?process_run_id=eq.${processRunId}&order=sort_order.asc&select=id,sort_order,status`
    ).catch(() => []);
    const currentTaskId = String(record.task_id || record.id || '').trim();
    const currentIdx = tasks.findIndex((t: any) => String(t.id) === currentTaskId);
    const offset = fieldMeta?.offset || parseInt(String(config.stage_offset || 1), 10) || 1;
    const targetTask = tasks[currentIdx + offset];
    if (!targetTask?.id) return actionResult(action, 'skipped', 'مرحله مقصد پیدا نشد.');
    await updateRecord(url, key, 'tasks', String(targetTask.id), { [fieldKey]: nextValue });
    return actionResult(action, 'success', undefined, { affected_count: 1, details: { field: fieldKey, stage_offset: offset } });
  }

  // ── send_email ────────────────────────────────────────────────────────
  if (action.type === 'send_email') {
    const subject = (await renderTemplateAsync(String(config.subject || ''), record, url, key)).trim();
    const body = (await renderTemplateAsync(String(config.body || ''), record, url, key)).trim();
    if (!subject && !body) return actionResult(action, 'skipped', 'موضوع و متن ایمیل خالی است.');
    const manuals: string[] = (Array.isArray(config.manual_emails) ? config.manual_emails : [])
      .map((v: any) => String(v || '').trim()).filter(Boolean);
    const fromFields: string[] = [];
    for (const fieldKey of (Array.isArray(config.recipient_fields) ? config.recipient_fields : [])) {
      const val = await resolveWorkflowFieldValue(url, key, String(fieldKey || '').trim(), record);
      if (Array.isArray(val)) fromFields.push(...val.map(String));
      else if (val !== null && val !== undefined) fromFields.push(String(val));
    }
    const to = Array.from(new Set([...manuals, ...fromFields]))
      .filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
    if (to.length === 0) return actionResult(action, 'skipped', 'گیرنده معتبر برای ایمیل پیدا نشد.', { recipient_count: 0 });
    const emailFnUrl = `${url.replace(/\/$/, '')}/functions/v1/send-email`;
    const resp = await fetch(emailFnUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ to, subject, body, org_id: orgId }),
      signal: AbortSignal.timeout(30000),
    }).catch((e) => { console.warn('[workflow-runner] send_email fetch error:', e.message); return null; });
    if (!resp) return actionResult(action, 'failed', 'درخواست ارسال ایمیل به تابع ارسال نرسید.', { recipient_count: to.length });
    if (!resp.ok) {
      const msg = await resp.text().catch(() => String(resp.status));
      throw new Error(`ارسال ایمیل ناموفق بود: ${msg}`);
    }
    return actionResult(action, 'success', undefined, { recipient_count: to.length });
  }

  console.warn(`[workflow-runner] Unknown action type: ${action.type}`);
  return actionResult(action, 'skipped', `نوع اقدام پشتیبانی نمی‌شود: ${action.type}`);
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
      const matched = await evaluateConditions(conditionsAll, conditionsAny, record);
      if (!matched) continue;

      const recordId = String(record?.id || '').trim();
      if (executionMode === 'first_match' && recordId) {
        if (executedRecordIds?.has(recordId)) continue;
      }

      const actions = Array.isArray(workflow.actions) ? workflow.actions : [];
      const errors: string[] = [];
      const actionResults: ActionExecutionResult[] = [];

      for (const action of actions) {
        try {
          const result = await executeAction(action as WorkflowAction, record, workflow.module_id, workflow.org_id, url, key);
          actionResults.push(result);
          if (result.status === 'success') stats.executedActions++;
          if (result.status === 'failed') {
            errors.push(result.message || String(action.type || 'action failed'));
            stats.failedRuns++;
          }
        } catch (e: any) {
          const errorMessage = String(e?.message || action.type || 'action failed');
          errors.push(errorMessage);
          actionResults.push({
            action_type: String((action as any)?.type || ''),
            action_id: (action as any)?.id || null,
            status: 'failed',
            message: errorMessage,
          });
          console.error(`[workflow-runner] Action failed (${workflow.name}/${action.type}):`, e.message);
          stats.failedRuns++;
        }
      }

      if (recordId) {
        const hasFailedAction = actionResults.some((result) => result.status === 'failed');
        const hasSuccessfulAction = actionResults.some((result) => result.status === 'success');
        const runStatus = hasFailedAction ? 'failed' : hasSuccessfulAction ? 'success' : 'skipped';
        const skippedMessage = !hasSuccessfulAction && errors.length === 0
          ? 'هیچ اقدامی اجرا نشد یا گیرنده معتبر پیدا نشد.'
          : undefined;
        await insertWorkflowLog(url, key, {
          workflow_id: workflow.id, org_id: workflow.org_id,
          module_id: workflow.module_id, record_id: recordId,
          run_type: 'scheduled',
          status: runStatus,
          message: errors.length > 0 ? errors.join(' | ') : skippedMessage,
          details: {
            workflow_name: workflow.name,
            action_count: actions.length,
            action_results: actionResults,
            timezone: 'Asia/Tehran',
            runner_build: FUNCTION_BUILD,
          },
        });
        if (executedRecordIds && runStatus === 'success') executedRecordIds.add(recordId);
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
