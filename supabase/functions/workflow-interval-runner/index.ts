// @ts-nocheck
// workflow-interval-runner: Server-side interval workflow executor
// Called by pg_cron via pg_net every 5 minutes — no browser dependency.
// Tenant isolation: every DB operation is filtered by org_id.

import {
  assignProcessAutomationIdentityContext,
  evaluateProcessAutomationConditions as evaluateProcessAutomationConditionsCore,
  getAdjacentProcessTasks as getAdjacentProcessTasksCore,
  getTaskProcessAutomationRules as getTaskProcessAutomationRulesCore,
  getTaskProcessLaneKey as getTaskProcessLaneKeyCore,
  getTaskProcessIdentity,
  getTaskProcessNodeKey as getTaskProcessNodeKeyCore,
  getTaskSourceLink as getTaskSourceLinkCore,
  resolveProcessAutomationTargetTokens as resolveProcessAutomationTargetTokensCore,
  runnableProcessConditions as runnableProcessConditionsCore,
  taskRecipientToken as taskRecipientTokenCore,
  type ProcessAutomationEvent,
} from '../_shared/process-automation-core.ts';
import { formatWorkflowNumericValue, getWorkflowStaticValueLabel, parseWorkflowIdentityReference, resolveWorkflowCurrencyLabel } from '../_shared/workflow-value-labels.ts';
import { buildProcessActivatorRecordContext } from '../_shared/process-activator-context.ts';
import { renderProcessStageForTaskCreation } from '../_shared/process-stage-template-renderer.ts';
import { buildAutomatedBotSenderPayload, extractBotProviderMessageId } from '../_shared/bot-system-message.ts';
import {
  evaluateConditionCollection as evaluateCentralConditionCollection,
  renderTemplateAsync as renderCentralTemplateAsync,
} from './_runtime-deps/recordRuntime.ts';
import { evaluateWorkflowConditionWithResolver } from './_runtime-deps/workflowConditionRuntime.ts';
import { assignProcessTemplateSystemVariableValues } from './_runtime-deps/processTemplateSystemVariables.ts';
import {
  getLegacyWorkflowAttachmentFields,
  getWorkflowRecipientConfig,
  isWorkflowRecipientFieldCompatibleWithBotChannel,
  normalizeWorkflowRecipientFieldValues,
  parseWorkflowRecipientFieldReference,
  shouldIncludeStarredWorkflowAttachments,
} from './_runtime-deps/workflowMessagingContract.ts';
import { evaluateFormulaExpression } from './_runtime-deps/formulaRuntime.ts';
import {
  isWorkflowProtectedFieldKey,
  isWorkflowFieldValueCompatible,
  normalizeWorkflowAssigneeValue,
  resolveWorkflowDateCriterion,
} from './_runtime-deps/workflowMutationContract.ts';

const FUNCTION_BUILD = 'workflow-interval-runner-2026-07-29-event-queue-priority';
const MAX_WORKFLOWS = 30;
const MAX_REPORTS = 20;
const DEFAULT_BATCH_SIZE = 300;
const WORKFLOW_RUNNER_LEASE_SECONDS = 240;
const INTERVAL_JOB_CLAIM_LIMIT = 8;
const INTERVAL_JOB_CONCURRENCY = 2;
const MAX_INTERVAL_JOB_WAVES = 3;
// Process-task interval rules are a secondary scan. Keep each invocation bounded
// so they can never delay already-queued workflow actions or scheduled deliveries.
const MAX_PROCESS_AUTOMATION_INTERVAL_TASKS = 300;
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;
const WORKFLOW_ASSIGNEE_FIELD_KEY = '__workflow_assignee';
const WORKFLOW_RECORD_LINK_FIELD_KEY = '__workflow_record_link';
const WORKFLOW_RELATED_FIELD_PREFIX = '__workflow_related__';
const WORKFLOW_MULTI_RELATION_PREFIX = '__workflow_multi_relation__';
const PROCESS_NEXT_STAGE_FIELD_PREFIX = '__process_next_stage__';
const DEFAULT_AI_BASE_URL = 'https://api.avalai.ir/v1';
const DEFAULT_AI_FALLBACK_BASE_URL = 'https://api.avalapis.ir/v1';
const DEFAULT_BOT_API_BASE_URL: Record<string, string> = {
  telegram: 'https://botapi.kalamnews.site/83cdbfe5940e24aaf81689a85390df5c',
  bale: 'https://tapi.bale.ai',
  rubika: 'https://botapi.rubika.ir',
};
const DEFAULT_BOT_SEND_PATH: Record<string, string> = {
  telegram: '/bot{token}/sendMessage',
  bale: '/bot{token}/sendMessage',
  rubika: '/v3/{token}/sendMessage',
};
const UUID_LIKE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKFLOW_BOT_CHANNEL_PRIORITY = ['rubika', 'telegram', 'bale'] as const;
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
  module_ids?: string[] | null;
  scope_type?: string | null;
  process_source_node_key?: string | null;
  name: string;
  created_by?: string | null;
  updated_by?: string | null;
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
  interval_days_after_holiday: number | null;
  conditions_all: WorkflowCondition[];
  conditions_any: WorkflowCondition[];
  actions: WorkflowAction[];
  is_active: boolean;
  last_run_at: string | null;
  server_queued_at: string | null;
  execution_mode: string | null;
  batch_size: number | null;
};

type ReportDefinitionRow = {
  id: string;
  org_id: string;
  name: string;
  description?: string | null;
  module_id: string;
  config: Record<string, any> | null;
  is_active: boolean;
  last_run_at: string | null;
  server_queued_at: string | null;
  updated_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
};

function resolveWorkflowActorId(workflow: Partial<WorkflowRow> | null | undefined): string | null {
  const actor = String(workflow?.updated_by || workflow?.created_by || '').trim();
  return actor || null;
}

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

function toPersianDigits(value: unknown): string {
  return String(value ?? '').replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
}

function formatJalaliDate(isoDate: string): string {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return toPersianDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
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
  return toPersianDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')} ${h}:${min}`);
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

function getServerRecordTitle(record: Record<string, any>): string {
  return String(
    record?.system_code
    || record?.name
    || record?.title
    || record?.full_name
    || record?.business_name
    || record?.task_name
    || '[بدون عنوان]'
  ).trim() || '[بدون عنوان]';
}

function buildResolvedAssigneeCombo(record: Record<string, any>): string | null {
  const assigneeType = String(record?.assignee_type || '').trim().toLowerCase();
  const roleId = String(record?.assignee_role_id || '').trim();
  const userId = String(record?.assignee_id || '').trim();
  if (assigneeType === 'role' || (!assigneeType && roleId)) {
    const id = roleId || userId;
    return id ? `role:${id}` : null;
  }
  return userId ? `user:${userId}` : null;
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

async function fetchRelatedRecord(url: string, key: string, moduleId: string, recordId: string, orgId: string): Promise<Record<string, any> | null> {
  const table = getModuleTable(moduleId);
  if (!orgId) return null;
  const rows = await dbGet(url, key, `${table}?id=eq.${encodeURIComponent(recordId)}&org_id=eq.${encodeURIComponent(orgId)}&select=*&limit=1`).catch(() => []);
  return rows[0] || null;
}

async function fetchServerRecordTagIds(url: string, key: string, moduleId: string, recordId: string): Promise<string[]> {
  if (!moduleId || !recordId) return [];
  const rows = await dbGet(
    url,
    key,
    `record_tags?module_id=eq.${encodeURIComponent(moduleId)}&record_id=eq.${encodeURIComponent(recordId)}&select=tag_id`,
  ).catch(() => []);
  return Array.from(new Set(rows.map((row: any) => String(row?.tag_id || '').trim()).filter(Boolean)));
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
      .map((value) => `user:${value}`);
  }
  if (
    (normalizedTargetModuleId === 'org_roles' || normalizedTargetModuleId === 'roles')
    && normalizedTargetFieldKey === 'id'
  ) {
    return values
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .map((value) => `role:${value}`);
  }
  return values;
}

async function resolveWorkflowFieldValue(
  url: string,
  key: string,
  fieldKey: string,
  record: Record<string, any>,
  orgId = '',
  moduleId = '',
): Promise<any> {
  const normalizedFieldKey = String(fieldKey || '').trim();
  if (!normalizedFieldKey) return null;
  const assigneeProfileAliases: Record<string, { kind: 'user' | 'role'; field: string }> = {
    assignee_full_name: { kind: 'user', field: 'full_name' },
    assignee_name: { kind: 'user', field: 'full_name' },
    assignee_mobile: { kind: 'user', field: 'mobile_1' },
    assignee_mobile_1: { kind: 'user', field: 'mobile_1' },
    assignee_job_title: { kind: 'user', field: 'job_title' },
    assignee_voip_operator_code: { kind: 'user', field: 'voip_operator_code' },
    assignee_voip_extension: { kind: 'user', field: 'voip_extension' },
    assignee_role_title: { kind: 'role', field: 'title' },
  };
  const assigneeAlias = assigneeProfileAliases[normalizedFieldKey];
  if (assigneeAlias) {
    const assigneeId = String(
      assigneeAlias.kind === 'role'
        ? record?.assignee_role_id
        : record?.assignee_id
    ).trim();
    if (!assigneeId) return null;
    const table = assigneeAlias.kind === 'role' ? 'org_roles' : 'profiles';
    const rows = await dbGet(
      url,
      key,
      `${table}?id=eq.${encodeURIComponent(assigneeId)}&org_id=eq.${encodeURIComponent(orgId)}&select=${encodeURIComponent(assigneeAlias.field)}&limit=1`,
    ).catch(() => []);
    return rows?.[0]?.[assigneeAlias.field] ?? null;
  }
  if (normalizedFieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY) return buildResolvedAssigneeCombo(record);
  if (normalizedFieldKey === 'tags') return fetchServerRecordTagIds(url, key, moduleId, String(record?.id || '').trim());
  if (normalizedFieldKey === WORKFLOW_RECORD_LINK_FIELD_KEY) {
    return buildServerRecordUrl(url, key, orgId, moduleId, record?.id);
  }
  if (normalizedFieldKey === `__task__${WORKFLOW_RECORD_LINK_FIELD_KEY}`) {
    return buildServerRecordUrl(url, key, orgId, 'tasks', record?.__task__id || record?.task_id || (moduleId === 'tasks' ? record?.id : ''));
  }

  const processLinkedMeta = normalizedFieldKey.match(/^__linked__(.+?)__(.+)$/);
  if (processLinkedMeta?.[1] && processLinkedMeta?.[2] === WORKFLOW_RECORD_LINK_FIELD_KEY) {
    const linkedModuleId = String(processLinkedMeta[1] || '').trim();
    const links = parseObjectValue(record?.process_links || record?.process_link_map);
    const linkedRecordId = getFieldValue(record, `__linked__${linkedModuleId}__id`) || links?.[linkedModuleId];
    return buildServerRecordUrl(url, key, orgId, linkedModuleId, linkedRecordId);
  }
  if (processLinkedMeta?.[1] && processLinkedMeta?.[2]) {
    const linkedModuleId = String(processLinkedMeta[1] || '').trim();
    const linkedFieldKey = String(processLinkedMeta[2] || '').trim();
    const directValue = getFieldValue(record, normalizedFieldKey);
    if (directValue !== null && directValue !== undefined && directValue !== '') return directValue;
    const links = parseObjectValue(record?.process_links || record?.process_link_map);
    const linkedRecordId = String(links?.[linkedModuleId] || record?.[`__linked__${linkedModuleId}__id`] || '').trim();
    if (!linkedRecordId) return linkedFieldKey === 'tags' ? [] : null;
    const linkedRecord = await fetchRelatedRecord(url, key, linkedModuleId, linkedRecordId, orgId);
    if (!linkedRecord) return linkedFieldKey === 'tags' ? [] : null;
    if (linkedFieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY) return buildResolvedAssigneeCombo(linkedRecord);
    if (linkedFieldKey === 'tags') return fetchServerRecordTagIds(url, key, linkedModuleId, linkedRecordId);
    return getFieldValue(linkedRecord, linkedFieldKey);
  }

  const relatedMeta = parseWorkflowRelatedFieldKey(normalizedFieldKey);
  if (relatedMeta) {
    const relationId = String(getFieldValue(record, relatedMeta.relationFieldKey) || '').trim();
    if (!relationId) return null;
    const relatedRecord = await fetchRelatedRecord(url, key, relatedMeta.targetModuleId, relationId, orgId);
    if (!relatedRecord) return null;
    if (relatedMeta.targetFieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY) return buildResolvedAssigneeCombo(relatedRecord);
    if (relatedMeta.targetFieldKey === WORKFLOW_RECORD_LINK_FIELD_KEY) {
      return buildServerRecordUrl(url, key, orgId, relatedMeta.targetModuleId, relatedRecord.id);
    }
    return getFieldValue(relatedRecord, relatedMeta.targetFieldKey);
  }

  const multiRelationMeta = parseWorkflowMultiRelationFieldKey(normalizedFieldKey);
  if (multiRelationMeta) {
    const ids = Array.from(new Set(normalizeMultiRelationIds(getFieldValue(record, multiRelationMeta.fieldKey))));
    const values: any[] = [];
    for (const id of ids) {
      const relatedRecord = await fetchRelatedRecord(url, key, multiRelationMeta.targetModuleId, id, orgId);
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

const orgPublicBaseUrlCache = new Map<string, Promise<string>>();
const orgSaasAdminAccessCache = new Map<string, Promise<boolean>>();
const orgCurrencyLabelCache = new Map<string, Promise<string>>();
const orgModulePriceFieldCache = new Map<string, Promise<Set<string>>>();
const orgModuleFieldConfigCache = new Map<string, Promise<Map<string, any>>>();
const orgDynamicOptionLabelCache = new Map<string, Promise<string | null>>();

function getOrgCurrencyLabel(url: string, key: string, orgId: string): Promise<string> {
  const normalizedOrgId = String(orgId || '').trim();
  if (!normalizedOrgId) return Promise.resolve(resolveWorkflowCurrencyLabel('', ''));
  if (!orgCurrencyLabelCache.has(normalizedOrgId)) {
    orgCurrencyLabelCache.set(normalizedOrgId, (async () => {
      const rows = await dbGet(url, key,
        `company_settings?org_id=eq.${encodeURIComponent(normalizedOrgId)}&select=currency_code,currency_label&limit=1`
      ).catch(() => []);
      return resolveWorkflowCurrencyLabel(rows?.[0]?.currency_code, rows?.[0]?.currency_label);
    })());
  }
  return orgCurrencyLabelCache.get(normalizedOrgId)!;
}

function getOrgModulePriceFields(url: string, key: string, orgId: string, moduleId: string): Promise<Set<string>> {
  const normalizedOrgId = String(orgId || '').trim();
  const normalizedModuleId = String(moduleId || '').trim();
  const cacheKey = `${normalizedOrgId}:${normalizedModuleId}`;
  if (!normalizedOrgId || !normalizedModuleId) return Promise.resolve(new Set());
  if (!orgModulePriceFieldCache.has(cacheKey)) {
    orgModulePriceFieldCache.set(cacheKey, (async () => {
      const rows = await dbGet(url, key,
        `integration_settings?org_id=eq.${encodeURIComponent(normalizedOrgId)}&connection_type=eq.module_settings&is_active=eq.true&select=settings&order=updated_at.desc&limit=1`
      ).catch(() => []);
      const fields = rows?.[0]?.settings?.modules?.[normalizedModuleId]?.schema?.fields;
      return new Set(
        (Array.isArray(fields) ? fields : [])
          .filter((field: any) => String(field?.type || '').trim().toLowerCase() === 'price')
          .map((field: any) => String(field?.key || '').trim())
          .filter(Boolean)
      );
    })());
  }
  return orgModulePriceFieldCache.get(cacheKey)!;
}

function getOrgModuleFieldConfigs(url: string, key: string, orgId: string, moduleId: string): Promise<Map<string, any>> {
  const normalizedOrgId = String(orgId || '').trim();
  const normalizedModuleId = String(moduleId || '').trim();
  const cacheKey = `${normalizedOrgId}:${normalizedModuleId}`;
  if (!normalizedOrgId || !normalizedModuleId) return Promise.resolve(new Map());
  if (!orgModuleFieldConfigCache.has(cacheKey)) {
    orgModuleFieldConfigCache.set(cacheKey, (async () => {
      const rows = await dbGet(url, key,
        `integration_settings?org_id=eq.${encodeURIComponent(normalizedOrgId)}&connection_type=eq.module_settings&is_active=eq.true&select=settings&order=updated_at.desc&limit=1`
      ).catch(() => []);
      const schema = rows?.[0]?.settings?.modules?.[normalizedModuleId]?.schema;
      const fields = Array.isArray(schema?.fields) ? schema.fields : [];
      const blockColumns = (Array.isArray(schema?.blocks) ? schema.blocks : [])
        .flatMap((block: any) => Array.isArray(block?.tableColumns) ? block.tableColumns : []);
      return new Map(
        [...fields, ...blockColumns]
          .map((field: any) => [String(field?.key || '').trim(), field] as const)
          .filter(([fieldKey]) => Boolean(fieldKey))
      );
    })());
  }
  return orgModuleFieldConfigCache.get(cacheKey)!;
}

function findWorkflowOptionLabel(options: any, value: any): string | null {
  if (!Array.isArray(options) || value === null || value === undefined) return null;
  const normalizedValue = String(value).trim();
  if (!normalizedValue) return null;
  const option = options.find((item: any) => String(item?.value ?? '').trim() === normalizedValue);
  const label = String(option?.label ?? '').trim();
  return label || null;
}

function getTaskRuntimeOptionLabel(record: Record<string, any>, fieldKey: string, value: any): string | null {
  if (fieldKey !== 'status') return null;
  const normalizedValue = String(value ?? '').trim();
  if (!normalizedValue) return null;
  const statusValue = String(record?.task_status ?? record?.status ?? '').trim();
  const storedLabel = statusValue === normalizedValue
    ? String(record?.status_label || record?.task_status_label || '').trim()
    : '';
  if (storedLabel) return storedLabel;
  const recurrence = parseObjectValue(record?.recurrence_info);
  return findWorkflowOptionLabel(recurrence?.process_task_status_options, value);
}

function getTaskRuntimeCustomFieldConfig(record: Record<string, any>, fieldKey: string): any | null {
  const recurrence = parseObjectValue(record?.recurrence_info);
  const fields = Array.isArray(recurrence?.process_task_custom_fields)
    ? recurrence.process_task_custom_fields
    : [];
  return fields.find((field: any) => String(field?.key || '').trim() === fieldKey) || null;
}

function getPreviousTaskRuntimeCustomFieldConfig(record: Record<string, any>, fieldKey: string): any | null {
  const recurrence = parseObjectValue(record?.previous_stage__recurrence_info);
  const fields = Array.isArray(recurrence?.process_task_custom_fields)
    ? recurrence.process_task_custom_fields
    : [];
  return fields.find((field: any) => String(field?.key || '').trim() === fieldKey) || null;
}

async function getOrgDynamicOptionLabel(
  url: string,
  key: string,
  orgId: string,
  category: string,
  value: any,
): Promise<string | null> {
  const normalizedOrgId = String(orgId || '').trim();
  const normalizedCategory = String(category || '').trim();
  const normalizedValue = String(value ?? '').trim();
  if (!normalizedOrgId || !normalizedCategory || !normalizedValue) return null;
  const cacheKey = `${normalizedOrgId}:${normalizedCategory}:${normalizedValue}`;
  if (!orgDynamicOptionLabelCache.has(cacheKey)) {
    orgDynamicOptionLabelCache.set(cacheKey, (async () => {
      const rows = await dbGet(url, key,
        `dynamic_options?org_id=eq.${encodeURIComponent(normalizedOrgId)}&category=eq.${encodeURIComponent(normalizedCategory)}&value=eq.${encodeURIComponent(normalizedValue)}&is_active=eq.true&select=label&limit=1`
      ).catch(() => []);
      return String(rows?.[0]?.label || '').trim() || null;
    })());
  }
  return orgDynamicOptionLabelCache.get(cacheKey)!;
}

async function resolveServerOptionLabel(
  value: any,
  fieldKey: string,
  record: Record<string, any>,
  url: string,
  key: string,
  orgId: string,
  moduleId: string,
  templateFieldKey = fieldKey,
): Promise<{ label: string | null; isOptionField: boolean }> {
  const taskStatusLabel = moduleId === 'tasks' ? getTaskRuntimeOptionLabel(record, fieldKey, value) : null;
  if (taskStatusLabel) return { label: taskStatusLabel, isOptionField: true };

  const runtimeCustomField = String(templateFieldKey || '').startsWith('previous_stage__')
    ? getPreviousTaskRuntimeCustomFieldConfig(record, fieldKey)
    : getTaskRuntimeCustomFieldConfig(record, fieldKey);
  const fields = runtimeCustomField ? null : await getOrgModuleFieldConfigs(url, key, orgId, moduleId);
  const field = runtimeCustomField || fields?.get(fieldKey);
  const type = String(field?.type || '').trim().toLowerCase();
  const isOptionField = ['select', 'multi_select', 'status', 'checklist', 'tags'].includes(type);
  const staticLabel = findWorkflowOptionLabel(field?.options, value);
  if (staticLabel) return { label: staticLabel, isOptionField };

  const dynamicCategory = String(field?.dynamicOptionsCategory || '').trim();
  const dynamicLabel = dynamicCategory
    ? await getOrgDynamicOptionLabel(url, key, orgId, dynamicCategory, value)
    : null;
  return { label: dynamicLabel, isOptionField };
}

function resolveTemplateFieldModule(moduleId: string, fieldKey: string): { moduleId: string; fieldKey: string } {
  const normalizedFieldKey = String(fieldKey || '').trim();
  const taskAliases: Record<string, string> = {
    task_name: 'name',
    task_type: 'task_type',
    task_status: 'status',
    task_priority: 'priority',
    task_due_date: 'due_date',
    task_image_url: 'image_url',
  };
  if (normalizedFieldKey.startsWith('__task__')) {
    const taskFieldKey = normalizedFieldKey.slice('__task__'.length);
    return { moduleId: 'tasks', fieldKey: taskAliases[taskFieldKey] || taskFieldKey };
  }
  if (normalizedFieldKey.startsWith('previous_stage__')) {
    const taskFieldKey = normalizedFieldKey.slice('previous_stage__'.length);
    return { moduleId: 'tasks', fieldKey: taskAliases[taskFieldKey] || taskFieldKey };
  }
  if (taskAliases[normalizedFieldKey]) {
    return { moduleId: 'tasks', fieldKey: taskAliases[normalizedFieldKey] };
  }
  const related = parseWorkflowRelatedFieldKey(fieldKey);
  if (related) return { moduleId: related.targetModuleId, fieldKey: related.targetFieldKey };
  const multiRelated = parseWorkflowMultiRelationFieldKey(fieldKey);
  if (multiRelated) return { moduleId: multiRelated.targetModuleId, fieldKey: multiRelated.targetFieldKey };
  return { moduleId, fieldKey };
}

const SHARED_APP_HOSTNAMES = new Set([
  'tazesystem.ir',
  'www.tazesystem.ir',
  'app.tazesystem.ir',
  'kalam.tazesystem.ir',
  'kalamapp.ir',
  'www.kalamapp.ir',
]);

function normalizeTenantBaseUrl(value: string): string {
  const candidate = String(value || '').trim().replace(/\/+$/, '');
  if (!candidate) return '';
  const baseUrl = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  try {
    return SHARED_APP_HOSTNAMES.has(new URL(baseUrl).hostname.trim().toLowerCase()) ? '' : baseUrl;
  } catch {
    return '';
  }
}

function orgHasSaasAdminAccess(url: string, key: string, orgId: string): Promise<boolean> {
  const normalizedOrgId = String(orgId || '').trim();
  if (!normalizedOrgId) return Promise.resolve(false);
  if (!orgSaasAdminAccessCache.has(normalizedOrgId)) {
    orgSaasAdminAccessCache.set(normalizedOrgId, (async () => {
      const roles = await dbGet(
        url,
        key,
        `org_roles?org_id=eq.${encodeURIComponent(normalizedOrgId)}&select=permissions&limit=200`,
      ).catch(() => []);
      return roles.some((role: any) => {
        const permission = role?.permissions?.__saas_admin || {};
        return permission.view === true
          || permission.edit === true
          || Object.values(permission.fields || {}).some((value) => value === true);
      });
    })());
  }
  return orgSaasAdminAccessCache.get(normalizedOrgId)!;
}

// Tenant organizations always use their own resolved host. The internal SaaS-admin organization
// is intentionally absent from tenant settings and uses its dedicated internal application host.
function getOrgPublicBaseUrl(url: string, key: string, orgId: string): Promise<string> {
  const normalizedOrgId = String(orgId || '').trim();
  if (!normalizedOrgId) return Promise.resolve('');
  if (!orgPublicBaseUrlCache.has(normalizedOrgId)) {
    orgPublicBaseUrlCache.set(normalizedOrgId, (async () => {
      const rows = await dbGet(url, key, `saas_org_settings?org_id=eq.${encodeURIComponent(normalizedOrgId)}&select=resolved_host&limit=1`).catch(() => []);
      const configuredHost = String(rows?.[0]?.resolved_host || '').trim().replace(/\/+$/, '');
      const tenantBaseUrl = normalizeTenantBaseUrl(configuredHost);
      if (tenantBaseUrl) return tenantBaseUrl;
      return await orgHasSaasAdminAccess(url, key, normalizedOrgId)
        ? 'https://kalam.tazesystem.ir'
        : '';
    })());
  }
  return orgPublicBaseUrlCache.get(normalizedOrgId)!;
}

async function buildServerRecordUrl(url: string, key: string, orgId: string, moduleId: string, recordId: unknown): Promise<string> {
  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedRecordId = String(recordId || '').trim();
  if (!normalizedModuleId || !normalizedRecordId) return '';
  const isProcessTask = normalizedModuleId === 'tasks';
  const recordPath = `/${encodeURIComponent(normalizedModuleId)}/${encodeURIComponent(normalizedRecordId)}`;
  const path = isProcessTask ? `${recordPath}?process_v2=1` : recordPath;
  const baseUrl = await getOrgPublicBaseUrl(url, key, orgId);
  const targetUrl = baseUrl ? `${baseUrl}${path}` : path;
  try {
    const existingRows = await dbGet(
      url,
      key,
      `short_links?org_id=eq.${encodeURIComponent(orgId)}&link_type=eq.generic&module_id=eq.${encodeURIComponent(normalizedModuleId)}&record_id=eq.${encodeURIComponent(normalizedRecordId)}&is_active=eq.true&select=code,metadata&order=created_at.desc&limit=10`,
    );
    const existing = existingRows.find((row: any) =>
      row?.metadata?.kind === 'record'
      && (!isProcessTask || row?.metadata?.task_process_v2 === true)
    );
    if (existing?.code) {
      const shortPath = `/r/${encodeURIComponent(String(existing.code))}`;
      return baseUrl ? `${baseUrl}${shortPath}` : shortPath;
    }

    const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const bytes = crypto.getRandomValues(new Uint8Array(7));
      const code = Array.from(bytes).map((value) => alphabet[value % alphabet.length]).join('');
      try {
        const inserted = await dbInsert(url, key, 'short_links', {
          org_id: orgId,
          code,
          link_type: 'generic',
          target_url: targetUrl,
          module_id: normalizedModuleId,
          record_id: normalizedRecordId,
          metadata: {
            kind: 'record',
            internal_record_link: true,
            ...(isProcessTask ? { task_process_v2: true } : {}),
          },
        });
        const shortPath = `/r/${encodeURIComponent(String(inserted?.code || code))}`;
        return baseUrl ? `${baseUrl}${shortPath}` : shortPath;
      } catch (error: any) {
        if (/23505|duplicate|unique/i.test(String(error?.message || error))) continue;
        throw error;
      }
    }
  } catch (error) {
    console.warn('Could not create short record link', error);
  }
  return targetUrl;
}

async function absolutizeTenantPublicLinksInText(text: string, url: string, key: string, orgId: string): Promise<string> {
  const raw = String(text || '');
  if (!raw || !/(^|[\s(\[{"'«])\/?(?:i|d)\/[A-Za-z0-9_-]+/im.test(raw)) return raw;
  const baseUrl = await getOrgPublicBaseUrl(url, key, orgId);
  if (!baseUrl) return raw;
  return raw.replace(
    /(^|[\s(\[{"'«])\/?(i|d)\/([A-Za-z0-9_-]+)/gim,
    (_match, prefix, routeType, publicCode) => `${prefix}${baseUrl}/${String(routeType).toLowerCase()}/${publicCode}`,
  );
}

async function getOrgTenantBaseUrl(url: string, key: string, orgId: string): Promise<string> {
  return getOrgPublicBaseUrl(url, key, orgId);
}

async function formatFieldValue(
  value: any,
  fieldKey: string,
  record: Record<string, any>,
  url: string,
  key: string,
  orgId: string,
  moduleId = '',
): Promise<string> {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'بله' : 'خیر';
  const str = String(value);
  const identityReference = parseWorkflowIdentityReference(str);
  if (identityReference) {
    const table = identityReference.type === 'role' ? 'org_roles' : 'profiles';
    const rows = await dbGet(url, key,
      `${table}?id=eq.${encodeURIComponent(identityReference.id)}&org_id=eq.${encodeURIComponent(orgId)}&select=*&limit=1`
    ).catch(() => []);
    return rows[0]
      ? getServerRecordTitle(rows[0])
      : (identityReference.type === 'role' ? 'نقش سازمانی' : 'کاربر');
  }
  if (typeof value === 'string' && /^\/?(?:i|d)\//i.test(str)) {
    const path = str.startsWith('/') ? str : `/${str}`;
    const baseUrl = await getOrgPublicBaseUrl(url, key, orgId);
    return baseUrl ? `${baseUrl}${path}` : path;
  }
  if (DATE_LIKE_REGEX.test(str)) {
    if (str.length > 10) return formatJalaliDateTime(str);
    return formatJalaliDate(str);
  }
  if (/^\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(str.trim())) {
    const [hours, minutes] = str.trim().split(':');
    return toPersianDigits(`${hours}:${minutes}`);
  }
  const fieldContext = resolveTemplateFieldModule(moduleId, fieldKey);
  const configuredPriceFields = await getOrgModulePriceFields(url, key, orgId, fieldContext.moduleId);
  const formattedNumericValue = formatWorkflowNumericValue(
    fieldContext.fieldKey,
    value,
    configuredPriceFields.has(fieldContext.fieldKey),
  );
  if (formattedNumericValue) {
    const currencyLabel = await getOrgCurrencyLabel(url, key, orgId);
    return `${formattedNumericValue} ${currencyLabel}`;
  }
  if (typeof value === 'number') {
    return value.toLocaleString('fa-IR', { maximumFractionDigits: 6 });
  }
  if (Array.isArray(value)) {
    const rendered = await Promise.all(value.map((item) => formatFieldValue(item, fieldKey, record, url, key, orgId, moduleId)));
    return rendered.filter(Boolean).join('، ');
  }
  const optionLabel = await resolveServerOptionLabel(
    value,
    fieldContext.fieldKey,
    record,
    url,
    key,
    orgId,
    fieldContext.moduleId,
    fieldKey,
  );
  if (optionLabel.label) return optionLabel.label;
  const staticLabel = getWorkflowStaticValueLabel(fieldContext.fieldKey, value, fieldContext.moduleId);
  if (staticLabel) return staticLabel;
  if (optionLabel.isOptionField) return '';
  if (
    /(^|_)(status|type|kind|category|method|direction|priority)$/i.test(String(fieldKey || '').trim())
    && /^[a-z][a-z0-9_-]*$/i.test(str.trim())
  ) {
    return '';
  }
  if (UUID_LIKE_REGEX.test(str)) {
    const normalizedField = String(fieldKey || '').toLowerCase();
    if (normalizedField.includes('tags') || normalizedField.endsWith('tag_id')) {
      const tagRows = await dbGet(
        url,
        key,
        `tags?id=eq.${encodeURIComponent(str)}&org_id=eq.${encodeURIComponent(orgId)}&select=title&limit=1`,
      ).catch(() => []);
      const tagTitle = String(tagRows?.[0]?.title || '').trim();
      if (tagTitle) return tagTitle;
    }
    const candidates = normalizedField.includes('role')
      ? ['org_roles']
      : normalizedField.includes('profile') || normalizedField.includes('user') || normalizedField.includes('assignee')
        ? ['profiles']
        : normalizedField.includes('customer') ? ['customers']
        : normalizedField.includes('supplier') ? ['suppliers']
        : normalizedField.includes('purchase_invoice') ? ['purchase_invoices']
        : normalizedField.includes('invoice') ? ['invoices']
        : normalizedField.includes('product') ? ['products']
        : normalizedField.includes('project') ? ['projects']
        : normalizedField.includes('employee') ? ['employees']
        : [];
    for (const table of candidates) {
      const rows = await dbGet(url, key,
        `${table}?id=eq.${encodeURIComponent(str)}&org_id=eq.${encodeURIComponent(orgId)}&select=*&limit=1`
      ).catch(() => []);
      if (rows[0]) return getServerRecordTitle(rows[0]);
    }
    return '[رکورد مرتبط]';
  }
  return str;
}

async function renderTemplateAsync(
  template: string,
  record: Record<string, any>,
  url: string,
  key: string,
  bold = false,
  orgId = '',
  moduleId = '',
): Promise<string> {
  const rendered = await renderCentralTemplateAsync(
    template,
    (fieldKey) => resolveWorkflowFieldValue(url, key, fieldKey, record, orgId, moduleId),
    (value, fieldKey) => formatFieldValue(value, fieldKey, record, url, key, orgId, moduleId),
    { bold, unresolved: 'blank' },
  );
  return absolutizeTenantPublicLinksInText(rendered, url, key, orgId);
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

function comparableConditionValue(value: any): any {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => comparableConditionValue(item));
  if (typeof value === 'object') {
    const preferred = value?.id ?? value?.value ?? value?.label ?? value?.name ?? value?.title ?? value?.full_name ?? value?.display;
    if (preferred !== undefined && preferred !== null) return comparableConditionValue(preferred);
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value;
  const text = normalizeConditionValue(String(value).replace(/,/g, '').trim());
  const num = Number(text);
  if (!Number.isNaN(num) && text !== '') return num;
  return text;
}

function comparableConditionJson(value: any): string {
  return JSON.stringify(comparableConditionValue(value) ?? null);
}

async function evaluateCondition(condition: WorkflowCondition, record: Record<string, any>): Promise<boolean> {
  return evaluateConditionWithPrevious(condition, record, null);
}

async function evaluateConditionWithPrevious(
  condition: WorkflowCondition,
  record: Record<string, any>,
  previousRecord: Record<string, any> | null | undefined,
  runtime?: { url: string; key: string; orgId: string; moduleId: string },
): Promise<boolean> {
  const field = String(condition?.field || '').trim();
  if (!field) return true;
  const operator = String(condition?.operator || 'eq').trim();
  const expected = condition?.value;
  const current = runtime
    ? await resolveWorkflowFieldValue(runtime.url, runtime.key, field, record, runtime.orgId, runtime.moduleId)
    : getFieldValueForCondition(record, field);
  const previous = previousRecord
    ? (runtime
        ? await resolveWorkflowFieldValue(runtime.url, runtime.key, field, previousRecord, runtime.orgId, runtime.moduleId)
        : getFieldValueForCondition(previousRecord, field))
    : undefined;

  return evaluateWorkflowConditionWithResolver({
    condition,
    resolveValues: async () => ({ currentValue: current, previousValue: previous }),
    evaluateAsyncOperator: async ({ operator, currentValue, expectedValue }) => {
      switch (operator) {
    case 'is_friday': {
      const date = currentValue ? new Date(String(currentValue)) : null;
      return !!date && !isNaN(date.getTime()) && date.getDay() === 5;
    }
    case 'is_official_holiday': {
      const events = await getHolidayEventsForDate(currentValue);
      return events.some((event) => event?.isHoliday === true);
    }
    case 'occasion_eq':
    case 'occasion_contains':
      return dateHasAnyOccasion(currentValue, expectedValue);
    case 'occasion_neq':
    case 'occasion_not_contains':
      return !(await dateHasAnyOccasion(currentValue, expectedValue));
    case 'days_before_occasion':
      return dateIsDaysBeforeOccasion(currentValue, expectedValue);
    default:
      console.warn(`[workflow-runner] Unknown operator: ${operator}`);
      // fail closed: یک عملگر ناشناخته نباید هیچ workflow یا automationی را اجرا کند.
      return false;
      }
    },
  });
}

async function evaluateConditions(
  conditionsAll: WorkflowCondition[],
  conditionsAny: WorkflowCondition[],
  record: Record<string, any>,
  previousRecord: Record<string, any> | null | undefined = null,
  runtime?: { url: string; key: string; orgId: string; moduleId: string },
): Promise<boolean> {
  return evaluateCentralConditionCollection({
    conditionsAll: Array.isArray(conditionsAll) ? conditionsAll : [],
    conditionsAny: Array.isArray(conditionsAny) ? conditionsAny : [],
    evaluate: (condition) => evaluateConditionWithPrevious(condition, record, previousRecord, runtime),
  });
}

// ── Interval due check ─────────────────────────────────────────────────────────

function parseIntervalAt(value: string | null): { hour: number; minute: number } | null {
  if (!value) return null;
  const raw = String(value)
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const m = raw.match(/(\d{1,2})\s*:\s*(\d{1,2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { hour: h, minute: min };
}

function isHourAllowed(hour: number, from: number | null | undefined, to: number | null | undefined): boolean {
  if (typeof from === 'number' && typeof to === 'number') {
    if (from <= to) return hour >= from && hour <= to;
    return hour >= from || hour <= to;
  }
  if (typeof from === 'number') return hour >= from;
  if (typeof to === 'number') return hour <= to;
  return true;
}

function daysInTehranMonth(localDate: Date): number {
  return new Date(Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth() + 1, 0)).getUTCDate();
}

function clampMonthDay(localDate: Date, day: number): number {
  return Math.min(Math.max(1, day), daysInTehranMonth(localDate));
}

function applyScheduledTime(localDate: Date, unit: string, workflow: WorkflowRow): Date {
  const next = new Date(localDate);
  if (unit === 'hour') {
    if (typeof workflow.interval_minute === 'number') {
      next.setUTCMinutes(Math.min(59, Math.max(0, workflow.interval_minute)), 0, 0);
    }
    return next;
  }

  if (unit === 'month' && workflow.interval_day_of_month) {
    next.setUTCDate(clampMonthDay(next, workflow.interval_day_of_month));
  }

  const parsedTime = parseIntervalAt(workflow.interval_at);
  if (parsedTime) {
    next.setUTCHours(parsedTime.hour, parsedTime.minute, 0, 0);
  }
  return next;
}

function addIntervalLocal(localDate: Date, value: number, unit: string): Date {
  const next = new Date(localDate);
  if (unit === 'hour') next.setUTCHours(next.getUTCHours() + value);
  else if (unit === 'day') next.setUTCDate(next.getUTCDate() + value);
  else if (unit === 'week') next.setUTCDate(next.getUTCDate() + (value * 7));
  else {
    const originalDay = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + value);
    next.setUTCDate(Math.min(originalDay, daysInTehranMonth(next)));
  }
  return next;
}

function getInitialScheduledDueAt(workflow: WorkflowRow, unit: string, now: Date): Date | null {
  const firstRun = workflow.interval_first_run_at ? new Date(workflow.interval_first_run_at) : null;
  if (firstRun && !isNaN(firstRun.getTime())) {
    if (now < firstRun) return null;
    if (unit !== 'week') {
      return getLatestScheduledDueAtAfter(firstRun, workflow, unit, now) || firstRun;
    }
  }

  const nowLocal = toTehranDate(now);
  let candidateLocal = new Date(nowLocal);

  if (unit === 'hour') {
    if (typeof workflow.interval_minute !== 'number') return now;
    candidateLocal.setUTCMinutes(Math.min(59, Math.max(0, workflow.interval_minute)), 0, 0);
  } else if (unit === 'day' || unit === 'week') {
    const parsedTime = parseIntervalAt(workflow.interval_at);
    if (!parsedTime) return now;
    candidateLocal.setUTCHours(parsedTime.hour, parsedTime.minute, 0, 0);
  } else {
    if (workflow.interval_day_of_month) {
      const targetDay = clampMonthDay(candidateLocal, workflow.interval_day_of_month);
      if (candidateLocal.getUTCDate() !== targetDay) return null;
      candidateLocal.setUTCDate(targetDay);
    }
    const parsedTime = parseIntervalAt(workflow.interval_at);
    if (parsedTime) candidateLocal.setUTCHours(parsedTime.hour, parsedTime.minute, 0, 0);
    else if (!workflow.interval_day_of_month) return now;
  }

  const candidate = fromTehranDate(candidateLocal);
  return now >= candidate ? candidate : null;
}

function getLatestScheduledDueAtAfter(anchor: Date, workflow: WorkflowRow, unit: string, now: Date): Date | null {
  const value = Math.max(1, parseInt(String(workflow.interval_value || 1), 10) || 1);
  let candidateLocal = toTehranDate(anchor);
  let latestDue: Date | null = null;

  for (let i = 0; i < 10000; i++) {
    candidateLocal = addIntervalLocal(candidateLocal, value, unit);
    candidateLocal = applyScheduledTime(candidateLocal, unit, workflow);
    const candidate = fromTehranDate(candidateLocal);
    if (candidate <= anchor) continue;
    if (candidate > now) break;
    latestDue = candidate;
  }

  return latestDue;
}

function getWorkflowScheduledDueAt(workflow: WorkflowRow, now: Date): Date | null {
  const unit = String(workflow.interval_unit || 'day').toLowerCase();
  const lastRunAt = workflow.last_run_at ? new Date(workflow.last_run_at) : null;
  const tehranNow = toTehranDate(now);

  if (unit === 'hour') {
    if (!isHourAllowed(tehranNow.getUTCHours(), workflow.interval_allowed_from_hour, workflow.interval_allowed_to_hour)) {
      return null;
    }
  }

  if (unit === 'month' && workflow.interval_day_of_month) {
    const target = clampMonthDay(tehranNow, workflow.interval_day_of_month);
    if (tehranNow.getUTCDate() !== target) return null;
  }

  if (!lastRunAt || isNaN(lastRunAt.getTime())) {
    return getInitialScheduledDueAt(workflow, unit, now);
  }

  return getLatestScheduledDueAtAfter(lastRunAt, workflow, unit, now);
}

function checkIntervalDue(workflow: WorkflowRow, now: Date): boolean {
  return !!getWorkflowScheduledDueAt(workflow, now);
}

async function isOfficialHolidayAtTehranDate(value: Date): Promise<boolean> {
  const tehranDate = toTehranDate(value);
  const events = await getHolidayEventsForDate(tehranDate.toISOString());
  return events.some((event) => event?.isHoliday === true);
}

async function isFridayOrOfficialHoliday(value: Date): Promise<boolean> {
  const tehranDate = toTehranDate(value);
  if (tehranDate.getUTCDay() === 5) return true;
  return isOfficialHolidayAtTehranDate(value);
}

async function getDaysSinceLastBlockedDay(
  now: Date,
  includeOfficialHolidays: boolean,
): Promise<number | null> {
  for (let days = 1; days <= 370; days += 1) {
    const candidate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
    const blocked = includeOfficialHolidays
      ? await isFridayOrOfficialHoliday(candidate)
      : toTehranDate(candidate).getUTCDay() === 5;
    if (blocked) return days;
  }
  return null;
}

async function checkIntervalDayCondition(
  condition: string | null | undefined,
  now: Date,
  daysAfterHoliday: number | null | undefined,
): Promise<boolean> {
  const cond = String(condition || 'any').trim();
  if (!cond || cond === 'any') return true;
  const day = toTehranDate(now).getUTCDay();
  if (cond === 'is_friday') return day === 5;
  if (cond === 'not_friday') {
    if (day === 5) return false;
    if (typeof daysAfterHoliday !== 'number' || daysAfterHoliday <= 0) return true;
    return await getDaysSinceLastBlockedDay(now, false) === Math.max(0, daysAfterHoliday);
  }
  if (cond === 'is_friday_or_holiday') return isFridayOrOfficialHoliday(now);
  if (cond === 'not_friday_or_holiday') {
    if (await isFridayOrOfficialHoliday(now)) return false;
    if (typeof daysAfterHoliday !== 'number' || daysAfterHoliday <= 0) return true;
    return await getDaysSinceLastBlockedDay(now, true) === Math.max(0, daysAfterHoliday);
  }
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

async function dbUpsert(supabaseUrl: string, key: string, table: string, body: any, onConflict: string): Promise<any> {
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`;
  // صف append-only است؛ اجرای تکراری enqueue نباید job نهایی‌شده را دوباره pending کند.
  const headers = dbHeaders(key, { 'Prefer': 'resolution=ignore-duplicates,return=representation' });
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text(); throw new Error(`UPSERT ${table} failed: ${t}`); }
  try { const d = await r.json(); return Array.isArray(d) ? d[0] : d; } catch { return null; }
}

async function dbPatch(supabaseUrl: string, key: string, table: string, filter: string, body: any): Promise<any[]> {
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/${table}?${filter}`;
  const r = await fetch(url, { method: 'PATCH', headers: dbHeaders(key, { Prefer: 'return=representation' }), body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text(); throw new Error(`PATCH ${table} failed: ${t}`); }
  try {
    const payload = await r.json();
    return Array.isArray(payload) ? payload : payload ? [payload] : [];
  } catch {
    return [];
  }
}

async function callRpc(supabaseUrl: string, key: string, fn: string, args: any): Promise<any> {
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/${fn}`;
  const r = await fetch(url, { method: 'POST', headers: dbHeaders(key), body: JSON.stringify(args) });
  if (!r.ok) { const t = await r.text(); throw new Error(`RPC ${fn} failed: ${t}`); }
  return await r.json();
}

const acquireWorkflowRunnerLease = async (url: string, key: string) => {
  const token = await callRpc(url, key, 'acquire_workflow_runner_lease', {
    p_lease_seconds: WORKFLOW_RUNNER_LEASE_SECONDS,
  });
  return String(token || '').trim() || null;
};

const releaseWorkflowRunnerLease = async (url: string, key: string, token: string) => {
  if (!token) return;
  await callRpc(url, key, 'release_workflow_runner_lease', { p_lease_token: token });
};

// ── Workflow DB operations ─────────────────────────────────────────────────────

async function fetchQueuedWorkflows(url: string, key: string): Promise<WorkflowRow[]> {
  const rows = await dbGet(url, key,
    `workflows?is_active=eq.true&trigger_type=eq.interval&server_queued_at=not.is.null&order=updated_at.asc&limit=${MAX_WORKFLOWS}`
  );
  return rows as WorkflowRow[];
}

async function claimWorkflow(
  url: string,
  key: string,
  workflowId: string,
  expectedLastRunAt: string | null,
  scheduledDueAt: Date,
): Promise<boolean> {
  const claimedAt = scheduledDueAt.toISOString();
  try {
    const result = await callRpc(url, key, 'claim_workflow_interval_run', {
      p_workflow_id: workflowId,
      p_expected_last_run_at: expectedLastRunAt,
      p_claimed_at: claimedAt,
    });
    return result === true;
  } catch {
    // Fallback: direct update
    const filter = expectedLastRunAt
      ? `id=eq.${workflowId}&is_active=eq.true&trigger_type=eq.interval&last_run_at=eq.${expectedLastRunAt}`
      : `id=eq.${workflowId}&is_active=eq.true&trigger_type=eq.interval&last_run_at=is.null`;
    try {
      await dbPatch(url, key, 'workflows', filter, { last_run_at: claimedAt, server_queued_at: null });
      return true;
    } catch { return false; }
  }
}

async function clearServerQueued(url: string, key: string, workflowId: string): Promise<void> {
  await dbPatch(url, key, 'workflows', `id=eq.${workflowId}`, { server_queued_at: null }).catch(() => {});
}

async function fetchQueuedReports(url: string, key: string): Promise<ReportDefinitionRow[]> {
  const rows = await dbGet(url, key,
    `report_definitions?is_active=eq.true&server_queued_at=not.is.null&select=id,org_id,name,description,module_id,config,is_active,last_run_at,server_queued_at,updated_at,created_by,updated_by&order=updated_at.asc&limit=${MAX_REPORTS}`
  );
  return rows as ReportDefinitionRow[];
}

async function claimReportScheduleRun(
  url: string,
  key: string,
  reportId: string,
  expectedLastRunAt: string | null,
  scheduledDueAt: Date,
): Promise<boolean> {
  const claimedAt = scheduledDueAt.toISOString();
  try {
    const result = await callRpc(url, key, 'claim_report_schedule_run', {
      p_report_id: reportId,
      p_expected_last_run_at: expectedLastRunAt,
      p_claimed_at: claimedAt,
    });
    return result === true;
  } catch {
    const filter = expectedLastRunAt
      ? `id=eq.${reportId}&is_active=eq.true&last_run_at=eq.${expectedLastRunAt}`
      : `id=eq.${reportId}&is_active=eq.true&last_run_at=is.null`;
    try {
      await dbPatch(url, key, 'report_definitions', filter, { last_run_at: claimedAt, server_queued_at: null, schedule_error: null });
      return true;
    } catch { return false; }
  }
}

async function clearReportServerQueued(url: string, key: string, reportId: string, scheduleError?: string): Promise<void> {
  await dbPatch(url, key, 'report_definitions', `id=eq.${reportId}`, {
    server_queued_at: null,
    ...(scheduleError ? { schedule_error: scheduleError } : {}),
  }).catch(() => {});
}

async function fetchModuleRecordsPage(
  url: string,
  key: string,
  table: string,
  orgId: string,
  pageSize: number,
  offset: number,
): Promise<any[]> {
  return await dbGet(
    url,
    key,
    `${table}?org_id=eq.${orgId}&select=*&order=id.asc&limit=${pageSize}&offset=${offset}`,
  );
}

function parseObjectValue(value: any): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isDeletedLikeWorkflowRecord(record: any): boolean {
  if (!record || typeof record !== 'object') return true;
  return Boolean(
    record.deleted_at
    || record.deletedAt
    || record.removed_at
    || record.archived_at
    || record.is_deleted === true
    || record.deleted === true
    || record._deleted === true
  );
}

async function isWorkflowRecordInRecycleBin(
  url: string,
  key: string,
  orgId: string,
  sourceTable: string,
  recordId: string,
): Promise<boolean> {
  const normalizedRecordId = String(recordId || '').trim();
  const normalizedSourceTable = String(sourceTable || '').trim();
  if (!normalizedSourceTable || !UUID_LIKE_REGEX.test(normalizedRecordId)) return false;
  const rows = await dbGet(
    url,
    key,
    `recycle_bin_records?org_id=eq.${encodeURIComponent(orgId)}&source_table=eq.${encodeURIComponent(normalizedSourceTable)}&source_record_id=eq.${encodeURIComponent(normalizedRecordId)}&select=id&limit=1`,
  ).catch(() => []);
  return rows.length > 0;
}

async function shouldSkipWorkflowIntervalRecord(
  url: string,
  key: string,
  orgId: string,
  sourceTable: string,
  record: any,
): Promise<boolean> {
  if (isDeletedLikeWorkflowRecord(record)) return true;
  const recordId = String(record?.id || '').trim();
  if (await isWorkflowRecordInRecycleBin(url, key, orgId, sourceTable, recordId)) return true;

  if (sourceTable === 'tasks') {
    const recurrence = parseObjectValue(record?.recurrence_info);
    const processRunId = String(record?.process_run_id || recurrence?.process_run_id || '').trim();
    const processRunStageId = String(record?.process_run_stage_id || recurrence?.process_run_stage_id || '').trim();
    if (processRunId && await isWorkflowRecordInRecycleBin(url, key, orgId, 'process_runs', processRunId)) return true;
    if (processRunStageId && await isWorkflowRecordInRecycleBin(url, key, orgId, 'process_run_stages', processRunStageId)) return true;
  }

  return false;
}

async function insertWorkflowLog(url: string, key: string, log: {
  workflow_id: string | null; org_id: string; module_id: string; record_id: string;
  run_type: string; status: string; message?: string; details?: any; execution_run_key?: string | null;
}): Promise<void> {
  const payload = {
    workflow_id: log.workflow_id, org_id: log.org_id, module_id: log.module_id,
    record_id: log.record_id, run_type: log.run_type, status: log.status,
    message: log.message || null, details: log.details || {},
    execution_run_key: log.execution_run_key || null,
  };
  if (!log.execution_run_key) {
    await dbInsert(url, key, 'workflow_logs', payload)
      .catch((e) => console.warn('[workflow-runner] Failed to insert log:', e.message));
    return;
  }
  const existing = await dbGet(url, key,
    `workflow_logs?execution_run_key=eq.${encodeURIComponent(log.execution_run_key)}&select=id&limit=1`,
  ).catch(() => []);
  if (existing[0]?.id) {
    await dbPatch(url, key, 'workflow_logs', `id=eq.${encodeURIComponent(String(existing[0].id))}`, payload)
      .catch((e) => console.warn('[workflow-runner] Failed to update log:', e.message));
    return;
  }
  await dbInsert(url, key, 'workflow_logs', payload).catch(async (error) => {
    // دو worker ممکن است هم‌زمان نخستین گزارش را ثبت کنند. در برخورد یکتا،
    // نویسندهٔ دوم نتیجهٔ نهایی را روی همان گزارش موجود می‌نویسد.
    if (!/23505|duplicate|unique/i.test(String(error?.message || error))) {
      console.warn('[workflow-runner] Failed to insert log:', error?.message || error);
      return;
    }
    const concurrent = await dbGet(url, key,
      `workflow_logs?execution_run_key=eq.${encodeURIComponent(log.execution_run_key || '')}&select=id&limit=1`,
    ).catch(() => []);
    if (concurrent[0]?.id) {
      await dbPatch(url, key, 'workflow_logs', `id=eq.${encodeURIComponent(String(concurrent[0].id))}`, payload)
        .catch((patchError) => console.warn('[workflow-runner] Failed to reconcile concurrent log:', patchError?.message || patchError));
    }
  });
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

function isActiveProfileRow(row: any): boolean {
  return row?.is_active !== false;
}

async function filterActiveMentionTargets(
  url: string,
  key: string,
  orgId: string,
  userIds: string[],
  roleIds: string[],
): Promise<{ userIds: string[]; roleIds: string[] }> {
  const requestedUserIds = Array.from(new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  const requestedRoleIds = Array.from(new Set((roleIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  const activeUserIds = new Set<string>();

  if (requestedUserIds.length > 0) {
    const rows = await dbGet(url, key, `profiles?id=in.(${requestedUserIds.join(',')})&select=id,is_active`).catch(() => []);
    const knownIds = new Set(rows.map((row: any) => String(row?.id || '').trim()).filter(Boolean));
    rows.filter(isActiveProfileRow).forEach((row: any) => {
      const id = String(row?.id || '').trim();
      if (id) activeUserIds.add(id);
    });
    requestedUserIds.filter((id) => !knownIds.has(id)).forEach((id) => activeUserIds.add(id));
  }

  const rolesWithProfiles = new Set<string>();
  if (requestedRoleIds.length > 0) {
    const rows = await dbGet(url, key, `profiles?role_id=in.(${requestedRoleIds.join(',')})&org_id=eq.${orgId}&select=id,role_id,is_active`).catch(() => []);
    rows.forEach((row: any) => {
      const roleId = String(row?.role_id || '').trim();
      if (roleId) rolesWithProfiles.add(roleId);
      if (!isActiveProfileRow(row)) return;
      const id = String(row?.id || '').trim();
      if (id) activeUserIds.add(id);
    });
  }

  return {
    userIds: Array.from(activeUserIds),
    roleIds: requestedRoleIds.filter((roleId) => !rolesWithProfiles.has(roleId)),
  };
}

async function filterActiveGroupMentionTargets(
  url: string,
  key: string,
  orgId: string,
  groups: Array<{ groupId: string; userIds: string[]; roleIds: string[] }>,
): Promise<Array<{ groupId: string; userIds: string[]; roleIds: string[] }>> {
  const filtered = await Promise.all((groups || []).map(async (group) => {
    const target = await filterActiveMentionTargets(url, key, orgId, group.userIds || [], group.roleIds || []);
    return { ...group, userIds: target.userIds, roleIds: target.roleIds };
  }));
  return filtered.filter((group) => group.userIds.length > 0 || group.roleIds.length > 0);
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
    const profiles = await dbGet(url, key, `profiles?id=in.(${ids})&select=mobile_1,mobile_2,mobile,is_active`).catch(() => []);
    profiles.forEach((p: any) => {
      if (!isActiveProfileRow(p)) return;
      [p.mobile_1, p.mobile_2, p.mobile].map(normalizePhone).filter(isValidIranMobile).forEach((ph) => phones.push(ph));
    });
  }

  if (roleIds.size > 0) {
    const ids = Array.from(roleIds).join(',');
    const profiles = await dbGet(url, key, `profiles?role_id=in.(${ids})&org_id=eq.${orgId}&select=mobile_1,mobile_2,mobile,is_active`).catch(() => []);
    profiles.forEach((p: any) => {
      if (!isActiveProfileRow(p)) return;
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
  const groupTargetsRaw = groupRows.map((group: any) => {
    const groupId = String(group?.id || '').trim();
    if (!groupId) return null;
    return {
      groupId,
      userIds: asArray(group?.user_ids).map((id) => String(id || '').trim()).filter(Boolean),
      roleIds: asArray(group?.role_ids).map((id) => String(id || '').trim()).filter(Boolean),
    };
  }).filter(Boolean) as Array<{ groupId: string; userIds: string[]; roleIds: string[] }>;
  const activeDirectTargets = await filterActiveMentionTargets(url, key, orgId, Array.from(userIds), Array.from(roleIds));
  const groupTargets = await filterActiveGroupMentionTargets(url, key, orgId, groupTargetsRaw);

  return {
    mentionUserIds: activeDirectTargets.userIds,
    mentionRoleIds: activeDirectTargets.roleIds,
    groupTargets,
  };
}

function normalizeWorkflowAttachmentValues(value: any, fallbackName: string): Array<{ name: string; url: string; mimeType: string | null }> {
  const values = Array.isArray(value) ? value : value === null || value === undefined || value === '' ? [] : [value];
  return values.flatMap((item, index) => {
    if (typeof item === 'string') {
      const url = item.trim();
      if (!url) return [];
      return [{ name: String(url.split('?')[0].split('/').pop() || `${fallbackName}_${index + 1}`), url, mimeType: null }];
    }
    if (!item || typeof item !== 'object') return [];
    const url = String(item?.url || item?.file_url || item?.value || '').trim();
    if (!url) return [];
    return [{
      name: String(item?.name || item?.file_name || url.split('?')[0].split('/').pop() || `${fallbackName}_${index + 1}`).trim(),
      url,
      mimeType: String(item?.mimeType || item?.mime_type || '').trim() || null,
    }];
  });
}

async function resolveServerNoteAttachments(url: string, key: string, fields: any[], record: Record<string, any>) {
  const attachments: Array<{ name: string; url: string; mimeType: string | null }> = [];
  for (const field of (Array.isArray(fields) ? fields : [])) {
    const fieldKey = String(field || '').trim();
    if (!fieldKey) continue;
    attachments.push(...normalizeWorkflowAttachmentValues(
      await resolveWorkflowFieldValue(url, key, fieldKey, record),
      fieldKey,
    ));
  }
  return Array.from(new Map(attachments.map((item) => [item.url, item])).values());
}

async function resolveServerStarredRecordAttachments(
  url: string,
  key: string,
  orgId: string,
  moduleId: string,
  recordId: string,
) {
  if (!orgId || !moduleId || !recordId) return [] as Array<{ name: string; url: string; mimeType: string | null }>;
  const rows = await dbGet(
    url,
    key,
    `file_entries?org_id=eq.${encodeURIComponent(orgId)}&module_id=eq.${encodeURIComponent(moduleId)}&record_id=eq.${encodeURIComponent(recordId)}&is_deleted=eq.false&select=id,metadata,file_assets(target_url,display_name,mime_type)&order=created_at.asc`,
  ).catch(() => []);

  return (rows || []).flatMap((row: any, index: number) => {
    const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    if (metadata?.main_image?.starred !== true && metadata?.starred !== true) return [];
    const asset = row?.file_assets && typeof row.file_assets === 'object' ? row.file_assets : {};
    const fileUrl = String(asset?.target_url || '').trim();
    if (!fileUrl) return [];
    return [{
      name: String(asset?.display_name || fileUrl.split('?')[0].split('/').pop() || `فایل ستاره‌دار ${index + 1}`).trim(),
      url: fileUrl,
      mimeType: String(asset?.mime_type || '').trim() || null,
    }];
  });
}

async function resolveServerWorkflowMessageAttachments({
  url,
  key,
  orgId,
  moduleId,
  recordId,
  config,
  record,
}: {
  url: string;
  key: string;
  orgId: string;
  moduleId: string;
  recordId: string;
  config: Record<string, any>;
  record: Record<string, any>;
}) {
  const legacyFields = getLegacyWorkflowAttachmentFields(config);
  const [starred, legacy] = await Promise.all([
    shouldIncludeStarredWorkflowAttachments(config)
      ? resolveServerStarredRecordAttachments(url, key, orgId, moduleId, recordId)
      : Promise.resolve([]),
    legacyFields.length > 0
      ? resolveServerNoteAttachments(url, key, legacyFields, record)
      : Promise.resolve([]),
  ]);
  return Array.from(new Map([...starred, ...legacy].map((item) => [item.url, item])).values());
}

// ── Bot recipient resolution ───────────────────────────────────────────────────

async function resolveAssigneesToBotChatIds(
  url: string, key: string, orgId: string,
  recipientAssignees: any[], recipientFields: any[], record: Record<string, any>,
  channel: 'bale' | 'telegram' | 'rubika',
  moduleId = '',
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
    if (v && !UUID_LIKE_REGEX.test(v)) directChatIds.push(v);
  };

  (Array.isArray(recipientAssignees) ? recipientAssignees : []).forEach(processEntry);
  for (const storedFieldKey of (Array.isArray(recipientFields) ? recipientFields : [])) {
    if (!isWorkflowRecipientFieldCompatibleWithBotChannel(storedFieldKey, channel)) continue;
    const fieldReference = parseWorkflowRecipientFieldReference(storedFieldKey);
    const value = await resolveWorkflowFieldValue(url, key, fieldReference.fieldKey, record, orgId, moduleId);
    normalizeWorkflowRecipientFieldValues(value, fieldReference.strategy).forEach(processEntry);
  }

  await expandChatGroupsIntoSets(url, key, groupIds, userIds, roleIds);

  const chatIdField = channel === 'telegram' ? 'telegram_chat_id' : channel === 'rubika' ? 'rubika_chat_id' : 'bale_chat_id';
  const chatIds: string[] = [...directChatIds];

  const allUserIds = new Set(userIds);
  if (roleIds.size > 0) {
    const ids = Array.from(roleIds).join(',');
    const profiles = await dbGet(url, key, `profiles?role_id=in.(${ids})&org_id=eq.${orgId}&select=id,is_active`).catch(() => []);
    profiles.filter(isActiveProfileRow).forEach((p: any) => { if (p.id) allUserIds.add(String(p.id)); });
  }
  if (allUserIds.size > 0) {
    const ids = Array.from(allUserIds).join(',');
    const profiles = await dbGet(url, key, `profiles?id=in.(${ids})&org_id=eq.${encodeURIComponent(orgId)}&select=${chatIdField},is_active`).catch(() => []);
    profiles.filter(isActiveProfileRow).forEach((p: any) => { const v = String(p?.[chatIdField] || '').trim(); if (v) chatIds.push(v); });
  }

  return Array.from(new Set(chatIds.filter(Boolean)));
}

type ServerBotChannel = typeof WORKFLOW_BOT_CHANNEL_PRIORITY[number];

/**
 * resolver مرکزی اکشن پیام بات: کاربر/نقش/گروه را فقط به یک کانال فعال نگاشت می‌کند
 * و فیلد صریح هر پیام‌رسان را هرگز روی کانال دیگری اجرا نمی‌کند.
 */
async function resolveUnifiedBotTargets(
  url: string,
  key: string,
  orgId: string,
  moduleId: string,
  recipientAssignees: any[],
  recipientFields: any[],
  record: Record<string, any>,
  preferredChannels: readonly ServerBotChannel[] = WORKFLOW_BOT_CHANNEL_PRIORITY,
): Promise<Array<{ channel: ServerBotChannel; chatId: string }>> {
  const userIds = new Set<string>();
  const roleIds = new Set<string>();
  const groupIds = new Set<string>();
  const directTargets = new Map<string, { channel: ServerBotChannel; chatId: string }>();
  const fallbackChannel = preferredChannels[0] || 'rubika';

  const processEntry = (entry: any, explicitChannel: ServerBotChannel | null = null) => {
    const token = parseRecipientToken(String(entry ?? ''));
    if (token?.kind === 'user') { userIds.add(token.id); return; }
    if (token?.kind === 'role') { roleIds.add(token.id); return; }
    if (token?.kind === 'chat_group') { groupIds.add(token.id); return; }
    const chatId = String(entry ?? '').trim();
    if (!chatId || UUID_LIKE_REGEX.test(chatId)) return;
    const channel = explicitChannel || fallbackChannel;
    directTargets.set(`${channel}:${chatId}`, { channel, chatId });
  };

  (Array.isArray(recipientAssignees) ? recipientAssignees : []).forEach((entry) => processEntry(entry));
  for (const storedFieldKey of (Array.isArray(recipientFields) ? recipientFields : [])) {
    const fieldReference = parseWorkflowRecipientFieldReference(storedFieldKey);
    const compatibleChannels = WORKFLOW_BOT_CHANNEL_PRIORITY.filter((channel) =>
      isWorkflowRecipientFieldCompatibleWithBotChannel(storedFieldKey, channel)
    );
    const explicitChannel = compatibleChannels.length === 1 ? compatibleChannels[0] : null;
    const value = await resolveWorkflowFieldValue(
      url,
      key,
      fieldReference.fieldKey,
      record,
      orgId,
      moduleId,
    );
    normalizeWorkflowRecipientFieldValues(value, fieldReference.strategy)
      .forEach((entry) => processEntry(entry, explicitChannel));
  }

  await expandChatGroupsIntoSets(url, key, groupIds, userIds, roleIds);
  const profileRows: any[] = [];
  const profileSelect = 'id,is_active,rubika_chat_id,telegram_chat_id,bale_chat_id';
  if (userIds.size > 0) {
    profileRows.push(...await dbGet(
      url,
      key,
      `profiles?id=in.(${Array.from(userIds).join(',')})&org_id=eq.${encodeURIComponent(orgId)}&select=${profileSelect}`,
    ).catch(() => []));
  }
  if (roleIds.size > 0) {
    profileRows.push(...await dbGet(
      url,
      key,
      `profiles?role_id=in.(${Array.from(roleIds).join(',')})&org_id=eq.${encodeURIComponent(orgId)}&select=${profileSelect}`,
    ).catch(() => []));
  }

  const uniqueProfiles = Array.from(new Map(
    profileRows
      .filter(isActiveProfileRow)
      .map((profile: any) => [String(profile?.id || '').trim(), profile])
      .filter(([profileId]) => Boolean(profileId)),
  ).values());
  uniqueProfiles.forEach((profile: any) => {
    const channel = preferredChannels.find((candidate) => String(profile?.[`${candidate}_chat_id`] || '').trim());
    if (!channel) return;
    const chatId = String(profile?.[`${channel}_chat_id`] || '').trim();
    if (chatId && !UUID_LIKE_REGEX.test(chatId)) {
      directTargets.set(`${channel}:${chatId}`, { channel, chatId });
    }
  });

  return Array.from(directTargets.values());
}

async function resolveCounterpartyBotTargets(
  url: string,
  key: string,
  orgId: string,
  moduleId: string,
  record: Record<string, any>,
  recipientFields: any[],
  explicitChannel?: string | null,
): Promise<Array<{ channel: 'bale' | 'telegram' | 'rubika'; chatId: string; group: ServerBotGroupTarget }>> {
  const customerIds = new Set<string>();
  const supplierIds = new Set<string>();
  const addUuid = (target: Set<string>, value: any) => {
    const normalized = String(value || '').trim();
    if (UUID_LIKE_REGEX.test(normalized)) target.add(normalized);
  };

  for (const fieldKey of (Array.isArray(recipientFields) ? recipientFields : [])) {
    const normalizedFieldKey = String(fieldKey || '').trim();
    const value = await resolveWorkflowFieldValue(url, key, normalizedFieldKey, record);
    const values = Array.isArray(value) ? value : [value];
    const targetSet = /supplier/i.test(normalizedFieldKey) ? supplierIds : customerIds;
    values.forEach((item) => addUuid(targetSet, item));
  }

  const select = 'id,org_id,customer_id,supplier_id,employee_id,bot_chat_id,channel_type,status';
  const [customerRows, supplierRows] = await Promise.all([
    customerIds.size > 0
      ? dbGet(
          url,
          key,
          `counterparty_bot_groups?org_id=eq.${orgId}&customer_id=in.(${Array.from(customerIds).join(',')})&status=eq.active&select=${select}`,
        ).catch(() => [])
      : Promise.resolve([]),
    supplierIds.size > 0
      ? dbGet(
          url,
          key,
          `counterparty_bot_groups?org_id=eq.${orgId}&supplier_id=in.(${Array.from(supplierIds).join(',')})&status=eq.active&select=${select}`,
        ).catch(() => [])
      : Promise.resolve([]),
  ]);
  const normalizedExplicitChannel = String(explicitChannel || '').trim().toLowerCase();
  return [...customerRows, ...supplierRows]
    .map((row: any) => {
      const channel = String(row?.channel_type || '').trim().toLowerCase();
      const chatId = String(row?.bot_chat_id || '').trim();
      if (!chatId || !['bale', 'telegram', 'rubika'].includes(channel)) return null;
      if (normalizedExplicitChannel && channel !== normalizedExplicitChannel) return null;
      return { channel: channel as 'bale' | 'telegram' | 'rubika', chatId, group: row as ServerBotGroupTarget };
    })
    .filter(Boolean) as Array<{ channel: 'bale' | 'telegram' | 'rubika'; chatId: string; group: ServerBotGroupTarget }>;
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
    related_module_id: payload.moduleId || null,
    related_record_id: payload.recordId || null,
    customer_id: null,
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

async function sendSmsViaGatewayFunction(
  url: string,
  key: string,
  settings: any,
  recipients: string[],
  text: string
): Promise<string[]> {
  const functionUrl = `${url.replace(/\/+$/, '')}/functions/v1/send-sms`;
  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      ...dbHeaders(key),
      'x-kalam-internal': 'workflow-interval-runner',
    },
    body: JSON.stringify({
      action: 'send',
      to: recipients,
      text,
      overrideSettings: settings,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const raw = await response.text();
  let parsed: any = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok || parsed?.success === false) {
    throw new Error(String(parsed?.message || raw || `پاسخ پیامک خطا: ${response.status}`));
  }
  const accepted = new Set(
    (Array.isArray(parsed?.provider_results) ? parsed.provider_results : [])
      .map((item: any) => normalizePhone(String(item?.recipient || '')))
      .filter(isValidIranMobile)
  );
  return accepted.size > 0 ? recipients.filter((recipient) => accepted.has(recipient)) : recipients;
}

async function sendSmsViaProvider(settings: any, to: string[], text: string, url?: string, key?: string): Promise<string[]> {
  const username = String(settings.username || '').trim();
  const password = String(settings.password || settings.api_key || '').trim();
  const apiKey = String(settings.api_key || '').trim();
  const senderNumber = String(settings.sender_number || '').trim();
  if (!senderNumber || (!username && !apiKey)) throw new Error('تنظیمات پیامک ناقص است');
  if (!text.trim()) throw new Error('متن پیامک خالی است');

  const recipients = Array.from(new Set(
    (to || [])
      .map((recipient) => normalizePhone(recipient))
      .filter((phone) => {
        if (isValidIranMobile(phone)) return true;
        if (phone) console.warn('[workflow-runner] Invalid phone:', phone);
        return false;
      })
  ));
  if (recipients.length === 0) return [];

  if (url && key) {
    try {
      return await sendSmsViaGatewayFunction(url, key, settings, recipients, text);
    } catch (gatewayError: any) {
      console.warn('[workflow-runner] send-sms gateway failed, falling back to direct SOAP:', String(gatewayError?.message || gatewayError));
    }
  }

  const sentRecipients: string[] = [];
  for (const phone of recipients) {
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
  const canonicalType = `${channel}_bot`;
  const legacyType = channel;
  const rows = await dbGet(url, key,
    `integration_settings?org_id=eq.${orgId}&connection_type=in.(${canonicalType},${legacyType})&is_active=eq.true&order=updated_at.desc&limit=1`
  ).catch(() => []);
  return rows.length > 0
    ? { ...(rows[0]?.settings || {}), __connection_id: String(rows[0]?.id || '').trim() || null }
    : null;
}

function normalizeBotApiBaseUrl(value: string, channel: string): string {
  const raw = String(DEFAULT_BOT_API_BASE_URL[channel] || '').trim().replace(/\/+$/, '');
  if (!raw) return DEFAULT_BOT_API_BASE_URL[channel] || '';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function buildBotSendMessageUrl(settings: any, token: string, channel: string): string {
  const baseUrl = normalizeBotApiBaseUrl(String(settings?.api_base_url || ''), channel);
  const pathTemplate = String(settings?.send_message_path || DEFAULT_BOT_SEND_PATH[channel] || '/bot{token}/sendMessage').trim();
  const path = pathTemplate
    .replace('{token}', encodeURIComponent(token))
    .replace(/^\/*/, '/');
  return `${baseUrl}${path}`;
}

async function sendBotMessage(chatId: string, text: string, settings: any, channel: string): Promise<any> {
  const token = String(settings.bot_token || settings.token || '').trim();
  if (!token || !chatId) return;
  const isRubika = channel === 'rubika';
  const payload = isRubika ? { chat_id: chatId, text } : { chat_id: chatId, text, parse_mode: 'HTML' };
  return await fetch(buildBotSendMessageUrl(settings, token, channel), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  }).then(async (response) => {
    const raw = await response.text().catch(() => '');
    if (!response.ok) {
      throw new Error(`ارسال پیام ${channel} ناموفق بود: ${raw || response.status}`);
    }
    try { return raw ? JSON.parse(raw) : null; } catch { return raw || null; }
  });
}

async function sendBotMessageWithAttachments(
  url: string,
  key: string,
  chatId: string,
  text: string,
  settings: any,
  channel: string,
  attachments: Array<{ name: string; url: string; mimeType: string | null }> = [],
  extraPayload: Record<string, any> = {},
): Promise<any> {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return sendBotMessage(chatId, text, settings, channel);
  }
  const connectionId = String(settings?.__connection_id || '').trim();
  if (!connectionId) throw new Error('اتصال فعال بات برای ارسال فایل پیدا نشد.');
  const response = await fetch(`${url.replace(/\/+$/, '')}/functions/v1/bot-admin`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'send_test_message',
      channel,
      connectionId,
      chatId,
      text,
      skipLog: false,
      attachments,
      extraPayload,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text().catch(() => '');
  let payload: any = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
  if (!response.ok || payload?.success !== true) {
    throw new Error(String(payload?.message || raw || `ارسال فایل بات ${channel} ناموفق بود.`));
  }
  return payload?.provider_result || payload;
}

type ServerBotGroupTarget = {
  id: string;
  org_id?: string | null;
  customer_id?: string | null;
  supplier_id?: string | null;
  employee_id?: string | null;
  channel_type: string;
  bot_chat_id: string;
};

const orgBotSystemIdentityCache = new Map<string, Promise<{ avatarUrl: string | null }>>();

async function getOrgBotSystemIdentity(url: string, key: string, orgId: string) {
  if (!orgBotSystemIdentityCache.has(orgId)) {
    orgBotSystemIdentityCache.set(orgId, (async () => {
      const rows = await dbGet(url, key,
        `company_settings?org_id=eq.${encodeURIComponent(orgId)}&select=logo_url&limit=1`
      ).catch(() => []);
      return { avatarUrl: String(rows[0]?.logo_url || '').trim() || null };
    })());
  }
  return orgBotSystemIdentityCache.get(orgId)!;
}

async function findServerBotGroup(
  url: string,
  key: string,
  orgId: string,
  channel: string,
  chatId: string,
): Promise<ServerBotGroupTarget | null> {
  const rows = await dbGet(url, key,
    `counterparty_bot_groups?org_id=eq.${encodeURIComponent(orgId)}&channel_type=eq.${encodeURIComponent(channel)}&bot_chat_id=eq.${encodeURIComponent(chatId)}&status=eq.active&select=id,org_id,customer_id,supplier_id,employee_id,channel_type,bot_chat_id&limit=2`
  ).catch(() => []);
  return rows.length === 1 ? rows[0] as ServerBotGroupTarget : null;
}

async function archiveAutomatedBotGroupMessage(
  url: string,
  key: string,
  orgId: string,
  group: ServerBotGroupTarget,
  text: string,
  providerResponse: any,
  sourcePayload: Record<string, any>,
) {
  const identity = await getOrgBotSystemIdentity(url, key, orgId);
  const payload = buildAutomatedBotSenderPayload({ payload: sourcePayload, systemAvatarUrl: identity.avatarUrl });
  const archivedAttachments = Array.isArray(sourcePayload?.attachments)
    ? sourcePayload.attachments.filter((item: any) => item && String(item?.url || '').trim())
    : [];
  const firstAttachment = archivedAttachments[0] || null;
  const providerMessageId = extractBotProviderMessageId(providerResponse);
  try {
    await dbInsert(url, key, 'counterparty_bot_messages', {
      org_id: orgId,
      bot_group_id: group.id,
      customer_id: group.customer_id || null,
      supplier_id: group.supplier_id || null,
      employee_id: group.employee_id || null,
      channel_type: group.channel_type,
      direction: 'outbound',
      message_type: archivedAttachments.length > 0 ? 'file' : 'text',
      chat_id: group.bot_chat_id,
      provider_message_id: providerMessageId,
      content_text: text,
      file_url: firstAttachment ? String(firstAttachment.url || '').trim() || null : null,
      file_name: firstAttachment ? String(firstAttachment.name || '').trim() || null : null,
      mime_type: firstAttachment ? String(firstAttachment.mimeType || firstAttachment.mime_type || '').trim() || null : null,
      created_by: null,
      payload: { ...payload, provider_response: providerResponse || {} },
    });
  } catch (error: any) {
    const message = String(error?.message || error || '');
    if (!/duplicate|23505|unique/i.test(message)) throw error;
  }
  await dbPatch(url, key, 'counterparty_bot_groups', `id=eq.${encodeURIComponent(group.id)}&org_id=eq.${encodeURIComponent(orgId)}`, {
    status: 'active',
    last_outbound_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

async function sendAndArchiveAutomatedBotGroupMessage(
  url: string,
  key: string,
  orgId: string,
  group: ServerBotGroupTarget,
  text: string,
  settings: any,
  sourcePayload: Record<string, any>,
  attachments: Array<{ name: string; url: string; mimeType: string | null }> = [],
) {
  const providerResponse = await sendBotMessageWithAttachments(url, key, group.bot_chat_id, text, settings, group.channel_type, attachments, sourcePayload);
  await archiveAutomatedBotGroupMessage(url, key, orgId, group, text, providerResponse, { ...sourcePayload, attachments });
  return providerResponse;
}

// ── Note insertion ─────────────────────────────────────────────────────────────

async function insertNote(url: string, key: string, note: {
  org_id: string; module_id: string; record_id: string;
  content: string; mention_user_ids: string[]; mention_role_ids: string[];
  source_type: string; metadata: any; author_id?: string | null;
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
    assets: 'assets',
    workSchedules: 'work_schedules', leaveRequests: 'leave_requests',
    overtimeRequests: 'overtime_requests', missionRequests: 'mission_requests',
    employeeAdvances: 'employee_advances', employeeBonusRequests: 'employee_bonus_requests',
    employeePenaltyRequests: 'employee_penalty_requests', employeeContracts: 'employee_contracts',
    jobDescriptions: 'job_descriptions', jobDescription: 'job_descriptions',
    payrollSlips: 'payroll_slips', recruitmentApplicants: 'recruitment_applicants',
    processTemplates: 'process_templates', processRuns: 'process_runs',
    webForms: 'web_forms', secretariatDocuments: 'secretariat_documents',
    smsDeliveryReports: 'sms_delivery_reports', voipCallReports: 'voip_call_reports',
    automationExecutionReports: 'automation_execution_reports',
    counterpartyBotGroups: 'counterparty_bot_groups',
  };
  return TABLE_MAP[moduleId] || moduleId;
}

const WORKFLOW_MUTATION_MODULE_IDS = new Set([
  'products', 'billboards', 'product_bundles', 'warehouses', 'shelves', 'stock_transfers',
  'secretariat_documents', 'delivery_forms', 'production_boms', 'production_orders',
  'production_group_orders', 'customers', 'suppliers', 'invoices', 'purchase_invoices',
  'sales_return_invoices', 'purchase_return_invoices', 'projects', 'marketing_leads',
  'personas', 'instructions', 'process_templates', 'process_runs', 'tasks',
  'calculation_formulas', 'fiscal_years', 'chart_of_accounts', 'journal_entries',
  'accounting_event_rules', 'cost_centers', 'cash_boxes', 'bank_accounts', 'petty_funds',
  'cheques', 'barters', 'cash_bank_operations', 'profiles', 'employees', 'job_descriptions',
  'attendance_logs', 'work_schedules', 'leave_requests', 'overtime_requests',
  'mission_requests', 'price_lists', 'web_forms', 'automation_execution_reports',
  'sms_delivery_reports', 'voip_call_reports', 'counterparty_bot_groups', 'expense_documents',
  'assets', 'employee_advances', 'employee_bonus_requests', 'employee_penalty_requests',
  'payroll_slips', 'employee_contracts', 'recruitment_applicants', 'surveys',
  'productBundles', 'purchaseInvoices', 'priceLists', 'marketingLeads', 'deliveryForms',
  'salesCatalog', 'stockTransfers', 'productionBOM', 'productionOrders', 'productionGroupOrders',
  'fiscalYears', 'chartOfAccounts', 'journalEntries', 'accountingEventRules', 'costCenters',
  'cashBoxes', 'bankAccounts', 'pettyFunds', 'cashBankOperations', 'expenseDocuments',
  'attendanceLogs', 'assets', 'workSchedules', 'leaveRequests', 'overtimeRequests',
  'missionRequests', 'employeeAdvances', 'employeeBonusRequests', 'employeePenaltyRequests',
  'employeeContracts', 'jobDescriptions', 'jobDescription', 'payrollSlips',
  'recruitmentApplicants', 'processTemplates', 'processRuns', 'webForms',
  'secretariatDocuments', 'smsDeliveryReports', 'voipCallReports',
  'automationExecutionReports', 'counterpartyBotGroups',
]);

const isSafeWorkflowMutationFieldKey = (fieldKey: unknown) => {
  const normalized = String(fieldKey || '').trim();
  return /^[a-z][a-z0-9_]*$/i.test(normalized)
    && !isWorkflowProtectedFieldKey(normalized)
    && !normalized.startsWith('__');
};

const assertWorkflowMutationModule = (moduleId: string) => {
  if (!WORKFLOW_MUTATION_MODULE_IDS.has(String(moduleId || '').trim())) {
    throw new Error('ماژول مقصد برای تغییر خودکار مجاز نیست.');
  }
};

const sanitizeWorkflowMutationPayload = (payload: Record<string, any>) => {
  const sanitized: Record<string, any> = {};
  Object.entries(payload || {}).forEach(([fieldKey, value]) => {
    if (!isSafeWorkflowMutationFieldKey(fieldKey)) return;
    sanitized[fieldKey] = value;
  });
  return sanitized;
};

async function updateRecord(
  url: string,
  key: string,
  moduleId: string,
  recordId: string,
  patch: Record<string, any>,
  actorUserId: string | null = null,
  orgId?: string | null,
): Promise<void> {
  assertWorkflowMutationModule(moduleId);
  const table = getModuleTable(moduleId);
  const payload = { ...sanitizeWorkflowMutationPayload(patch), updated_at: new Date().toISOString() };
  if (Object.keys(payload).length === 1) throw new Error('هیچ فیلد قابل بروزرسانی برای این اقدام انتخاب نشده است.');
  if (actorUserId) payload.updated_by = actorUserId;
  const filter = orgId ? `id=eq.${recordId}&org_id=eq.${orgId}` : `id=eq.${recordId}`;
  const updatedRows = await dbPatch(url, key, table, filter, payload);
  if (updatedRows.length === 0) throw new Error('رکورد مقصد پیدا نشد یا امکان بروزرسانی آن وجود ندارد.');
}

async function createRecord(url: string, key: string, moduleId: string, orgId: string, payload: Record<string, any>, actorUserId: string | null = null): Promise<any> {
  assertWorkflowMutationModule(moduleId);
  const table = getModuleTable(moduleId);
  const body = { ...sanitizeWorkflowMutationPayload(payload), org_id: orgId };
  if (actorUserId) {
    if (!body.created_by) body.created_by = actorUserId;
    if (!body.updated_by) body.updated_by = actorUserId;
  }
  return await dbInsert(url, key, table, body);
}

async function getProcessRelatedRecordAttachmentContext(
  url: string,
  key: string,
  orgId: string,
  record: Record<string, any>,
  targetModuleId: string,
): Promise<{ processRunId: string; targetModuleIds: Set<string> }> {
  const recurrence = parseObjectValue(record?.recurrence_info);
  const processRunId = String(record?.process_run_id || recurrence?.process_run_id || '').trim();
  if (!processRunId) throw new Error('اجرای فرآیند برای پیوند رکورد جدید پیدا نشد.');
  const runRows = await dbGet(url, key,
    `process_runs?id=eq.${encodeURIComponent(processRunId)}&org_id=eq.${encodeURIComponent(orgId)}&select=id&limit=1`,
  ).catch(() => []);
  if (runRows.length === 0) throw new Error('اجرای فرآیند در سازمان جاری پیدا نشد.');
  const stages = await dbGet(url, key,
    `process_run_stages?process_run_id=eq.${encodeURIComponent(processRunId)}&select=metadata&limit=500`,
  ).catch(() => []);
  const targetModuleIds = new Set<string>([
    ...(Array.isArray(record?.process_target_module_ids) ? record.process_target_module_ids : []),
    ...Object.keys(parseObjectValue(record?.process_links)),
    ...stages.flatMap((stage: any) => {
      const metadata = parseObjectValue(stage?.metadata);
      return Array.isArray(metadata?.process_target_module_ids) ? metadata.process_target_module_ids : [];
    }),
  ].map((value) => String(value || '').trim()).filter(Boolean));
  if (!targetModuleIds.has(targetModuleId)) {
    throw new Error('ماژول مقصد در رکوردهای مرتبط این فرآیند تعریف نشده است.');
  }
  return { processRunId, targetModuleIds };
}

async function attachCreatedRecordToProcessRun(
  url: string,
  key: string,
  orgId: string,
  processRunId: string,
  targetModuleId: string,
  targetRecordId: string,
) {
  const existing = await dbGet(url, key,
    `process_run_links?org_id=eq.${encodeURIComponent(orgId)}&process_run_id=eq.${encodeURIComponent(processRunId)}&module_id=eq.${encodeURIComponent(targetModuleId)}&record_id=eq.${encodeURIComponent(targetRecordId)}&select=id&limit=1`,
  ).catch(() => []);
  if (existing.length === 0) {
    await dbInsert(url, key, 'process_run_links', {
      org_id: orgId,
      process_run_id: processRunId,
      module_id: targetModuleId,
      record_id: targetRecordId,
      is_primary: false,
    });
  }

  // process_link_map نمای سریع اجرای فرآیند است. لینک نخست هر ماژول را نگه می‌داریم
  // تا ایجاد چند رکورد، لینک مرجع مرحله‌های فعال را ناخواسته جابه‌جا نکند؛ همهٔ لینک‌ها
  // بدون محدودیت در process_run_links باقی می‌مانند.
  const stages = await dbGet(url, key,
    `process_run_stages?process_run_id=eq.${encodeURIComponent(processRunId)}&select=id,metadata&limit=500`,
  ).catch(() => []);
  await Promise.all(stages.map(async (stage: any) => {
    const metadata = parseObjectValue(stage?.metadata);
    const processLinkMap = parseObjectValue(metadata?.process_link_map);
    if (String(processLinkMap?.[targetModuleId] || '').trim()) return;
    await dbPatch(url, key, 'process_run_stages', `id=eq.${encodeURIComponent(String(stage.id))}&process_run_id=eq.${encodeURIComponent(processRunId)}`, {
      metadata: { ...metadata, process_link_map: { ...processLinkMap, [targetModuleId]: targetRecordId } },
    });
  }));
}

async function updateProcessTaskAutomationField(
  url: string,
  key: string,
  task: Record<string, any>,
  fieldKey: string,
  value: any,
  actorUserId: string | null,
  orgId: string,
) {
  const taskId = String(task?.task_id || task?.id || '').trim();
  const normalizedFieldKey = String(fieldKey || '').replace(/^__task__/, '').trim();
  if (!taskId || !normalizedFieldKey) throw new Error('فعالیت مقصد برای بروزرسانی مشخص نیست.');
  const recurrence = parseObjectValue(task?.recurrence_info);
  const customFields = Array.isArray(recurrence?.process_task_custom_fields)
    ? recurrence.process_task_custom_fields
    : [];
  const isCustomField = customFields.some((field: any) => String(field?.key || '').trim() === normalizedFieldKey);
  if (isCustomField) {
    const currentValues = parseObjectValue(recurrence?.process_task_custom_field_values);
    const nextRecurrence = {
      ...recurrence,
      process_task_custom_fields: customFields,
      process_task_custom_field_values: { ...currentValues, [normalizedFieldKey]: value },
    };
    await updateRecord(url, key, 'tasks', taskId, { recurrence_info: nextRecurrence }, actorUserId, orgId);
    task.recurrence_info = nextRecurrence;
    task[`__task__${normalizedFieldKey}`] = value;
    return;
  }
  const patch = normalizedFieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY || normalizedFieldKey === 'assignee_id'
    ? normalizeWorkflowAssigneeValue(value)
    : { [normalizedFieldKey]: value };
  await updateRecord(url, key, 'tasks', taskId, patch, actorUserId, orgId);
  Object.assign(task, patch);
}

async function createWorkflowAiThread(
  url: string,
  key: string,
  input: {
    orgId: string;
    moduleId: string;
    recordId: string | null;
    prompt: string;
    answer: string;
    model: string;
    provider: string;
    actionId?: string | null;
    sharedUserIds?: string[];
    sharedRoleIds?: string[];
    metadata?: Record<string, any>;
  }
): Promise<any> {
  const now = new Date().toISOString();
  const sharedUserIds = Array.from(new Set((input.sharedUserIds || []).filter(Boolean)));
  const sharedRoleIds = Array.from(new Set((input.sharedRoleIds || []).filter(Boolean)));
  const thread = await dbInsert(url, key, 'ai_threads', {
    org_id: input.orgId,
    user_id: null,
    status: 'active',
    title: 'پرامپت هوش مصنوعی گردش کار',
    context_type: 'workflow',
    context_key: `workflow:${input.moduleId}:${input.recordId || 'record'}:${input.actionId || 'action'}:${Date.now()}`,
    module_id: input.moduleId,
    record_id: input.recordId,
    provider: input.provider || 'avalai',
    model: input.model || '',
    is_shared: sharedUserIds.length > 0 || sharedRoleIds.length > 0,
    shared_user_ids: sharedUserIds,
    shared_role_ids: sharedRoleIds,
    metadata: {
      source: 'workflow_interval_runner',
      context_kind: 'workflow',
      context_label: 'گردش کار',
      workflow_action_id: input.actionId || null,
      last_activity_kind: 'workflow_ai_prompt',
      last_message_preview: input.prompt.slice(0, 300),
      ...(input.metadata || {}),
    },
    created_at: now,
    updated_at: now,
  });
  if (!thread?.id) return null;
  await dbInsert(url, key, 'ai_messages', {
    org_id: input.orgId,
    thread_id: thread.id,
    role: 'user',
    content: input.prompt,
    provider: input.provider || 'avalai',
    model: input.model || '',
    metadata: { source: 'workflow_interval_runner', input_kind: 'workflow_prompt' },
    created_at: now,
  });
  const assistantMessage = await dbInsert(url, key, 'ai_messages', {
    org_id: input.orgId,
    thread_id: thread.id,
    role: 'assistant',
    content: input.answer,
    provider: input.provider || 'avalai',
    model: input.model || '',
    metadata: { source: 'workflow_interval_runner', capability: 'workflow_ai_prompt' },
    created_at: new Date().toISOString(),
  });
  return { thread, assistantMessage };
}

async function loadWorkflowAiModel(url: string, key: string, orgId: string): Promise<string> {
  const rows = await dbGet(url, key, `org_ai_settings?org_id=eq.${orgId}&select=selected_models&limit=1`).catch(() => []);
  const selected = rows?.[0]?.selected_models && typeof rows[0].selected_models === 'object'
    ? rows[0].selected_models
    : {};
  const requested = String(selected.workflow_ai_prompt || '').trim();
  const catalogRows = await dbGet(url, key, 'ai_model_catalog?select=id,provider,capability_tags,is_active,is_coming_soon&limit=500').catch(() => []);
  const allowed = (catalogRows || []).filter((model: any) => {
    const tags = Array.isArray(model?.capability_tags) ? model.capability_tags : [];
    return model?.is_active !== false
      && model?.is_coming_soon !== true
      && tags.includes('workflow_ai_prompt')
      && String(model?.id || '').trim();
  });
  if (allowed.length === 0) {
    throw new Error('برای اجرای پرامپت گردش کار، مدل فعال در تنظیمات هوش مصنوعی سازمان پیدا نشد.');
  }
  const allowedIds = new Set(allowed.map((model: any) => String(model?.id || '').trim()));
  return allowedIds.has(requested) ? requested : String(allowed[0]?.id || '').trim();
}

const truthyPlanFeature = (value: any) => {
  if (value === true) return true;
  if (typeof value === 'string') {
    return ['true', 'enabled', 'full', 'limited'].includes(value.trim().toLowerCase());
  }
  return Boolean(value && typeof value === 'object' && (value.enabled === true || value.available === true));
};

async function assertWorkflowAiEnabled(url: string, key: string, orgId: string): Promise<void> {
  const orgRows = await dbGet(
    url,
    key,
    `saas_org_settings?org_id=eq.${orgId}&select=plan_code,feature_overrides,status,is_readonly&limit=1`,
  ).catch(() => []);
  const orgSettings = orgRows[0] || null;
  if (!orgSettings) throw new Error('تنظیمات پلن سازمان برای اجرای هوش مصنوعی پیدا نشد.');
  const planCode = String(orgSettings?.plan_code || '').trim();
  const planRows = planCode
    ? await dbGet(url, key, `saas_plans?code=eq.${encodeURIComponent(planCode)}&select=enabled_features,is_active&limit=1`).catch(() => [])
    : [];
  const plan = planRows[0] || null;
  if (!plan || plan?.is_active === false) {
    throw new Error('پلن فعال سازمان برای اجرای هوش مصنوعی پیدا نشد.');
  }
  const features = {
    ...(plan?.enabled_features && typeof plan.enabled_features === 'object' ? plan.enabled_features : {}),
    ...(orgSettings?.feature_overrides && typeof orgSettings.feature_overrides === 'object' ? orgSettings.feature_overrides : {}),
  };
  if (!truthyPlanFeature(features.ai_chat) && !truthyPlanFeature(features.ai_knowledge)) {
    throw new Error('قابلیت هوش مصنوعی گردش کار در پلن فعلی سازمان فعال نیست.');
  }
  const aiSettingsRows = await dbGet(
    url,
    key,
    `org_ai_settings?org_id=eq.${orgId}&select=feature_flags&limit=1`,
  ).catch(() => []);
  const flags = aiSettingsRows[0]?.feature_flags && typeof aiSettingsRows[0].feature_flags === 'object'
    ? aiSettingsRows[0].feature_flags
    : {};
  if (flags.workflow_ai_prompt === false) {
    throw new Error('پرامپت هوش مصنوعی در تنظیمات سازمان غیرفعال است.');
  }
}

function normalizeAiBaseUrl(value: string): string {
  const raw = String(value || DEFAULT_AI_BASE_URL).trim().replace(/\/+$/, '');
  if (!raw) return DEFAULT_AI_BASE_URL;
  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(normalized);
    if (/(^|\.)avalai\.ir$|(^|\.)avalapis\.ir$/i.test(url.hostname) && !/\/v\d+$/i.test(url.pathname)) {
      url.pathname = `${url.pathname.replace(/\/+$/, '')}/v1`.replace(/^([^/])/, '/$1');
    }
    return url.toString().replace(/\/+$/, '');
  } catch {
    return normalized;
  }
}

function workflowAiBaseUrls(): string[] {
  const primary = Deno.env.get('AVALAI_BASE_URL') || Deno.env.get('AI_BASE_URL') || DEFAULT_AI_BASE_URL;
  const fallbackRaw = Deno.env.get('AVALAI_FALLBACK_BASE_URLS')
    || Deno.env.get('AI_FALLBACK_BASE_URLS')
    || Deno.env.get('AVALAI_FALLBACK_BASE_URL')
    || DEFAULT_AI_FALLBACK_BASE_URL;
  const seen = new Set<string>();
  return [primary, ...String(fallbackRaw).split(',')]
    .map((item) => normalizeAiBaseUrl(item))
    .filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function isRetryableAiStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function extractJsonObjectFromText(value: any): Record<string, any> | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const normalized = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const candidates = [normalized];
  const start = normalized.indexOf('{');
  const end = normalized.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(normalized.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // noop
    }
  }
  return null;
}

function sanitizeAiRecordPayload(rawPayload: any, schema: any): Record<string, any> {
  const blockedKeys = new Set([
    'id',
    'org_id',
    'system_code',
    'created_at',
    'updated_at',
    'created_by',
    'updated_by',
    'deleted_at',
  ]);
  const allowedFields = Array.isArray(schema?.fields)
    ? schema.fields
        .map((field: any) => String(field?.key || '').trim())
        .filter((fieldKey: string) => fieldKey && !blockedKeys.has(fieldKey))
    : [];
  const allowed = new Set(allowedFields);
  const rawFields = rawPayload?.fields && typeof rawPayload.fields === 'object' ? rawPayload.fields : rawPayload;
  const payload: Record<string, any> = {};
  Object.entries(rawFields || {}).forEach(([key, value]) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey || !allowed.has(normalizedKey)) return;
    if (value === undefined || value === '') {
      payload[normalizedKey] = null;
      return;
    }
    payload[normalizedKey] = value;
  });
  return payload;
}

function buildAiRecordTitle(record: any, fallback: string): string {
  return String(
    record?.system_code
    || record?.name
    || record?.title
    || record?.full_name
    || record?.business_name
    || record?.invoice_number
    || fallback
    || 'رکورد جدید'
  ).trim();
}

function normalizeWorkflowAiProcessStatus(value: any): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'completed') return 'done';
  if (['todo', 'planned', 'in_progress', 'review', 'done', 'blocked', 'canceled'].includes(normalized)) return normalized;
  return 'todo';
}

function addDaysIso(days: any): string | null {
  const amount = Number(days);
  if (!Number.isFinite(amount)) return null;
  const date = new Date();
  date.setDate(date.getDate() + amount);
  return date.toISOString();
}

async function loadWorkflowProcessContext(url: string, key: string, orgId: string, moduleId: string, recordId: string): Promise<Record<string, any>> {
  const templateRows = await dbGet(url, key,
    `process_templates?org_id=eq.${orgId}&is_active=eq.true&select=*&order=updated_at.desc&limit=60`
  ).catch(() => []);
  const templates = templateRows.filter((template: any) => {
    const primary = String(template?.module_id || '').trim();
    const modules = Array.isArray(template?.module_ids) ? template.module_ids.map((item: any) => String(item || '').trim()) : [];
    return !primary || primary === moduleId || primary === 'tasks' || primary === 'process_runs' || modules.includes(moduleId);
  }).slice(0, 30);
  const templateIds = templates.map((template: any) => String(template?.id || '').trim()).filter(Boolean);
  const templateStages = templateIds.length
    ? await dbGet(url, key, `process_template_stages?template_id=in.(${templateIds.join(',')})&select=*&order=sort_order.asc&limit=300`).catch(() => [])
    : [];
  const runs = recordId
    ? await dbGet(url, key,
        `process_runs?org_id=eq.${orgId}&module_id=eq.${moduleId}&record_id=eq.${recordId}&select=*&order=created_at.desc&limit=20`
      ).catch(() => [])
    : [];
  const runIds = runs.map((run: any) => String(run?.id || '').trim()).filter(Boolean);
  const runStages = runIds.length
    ? await dbGet(url, key, `process_run_stages?process_run_id=in.(${runIds.join(',')})&select=*&order=sort_order.asc&limit=400`).catch(() => [])
    : [];
  const tasks = recordId
    ? await dbGet(url, key,
        `tasks?org_id=eq.${orgId}&source_module_id=eq.${moduleId}&source_record_id=eq.${recordId}&select=*&order=sort_order.asc&limit=300`
      ).catch(() => [])
    : [];
  const stagesByTemplateId = new Map<string, any[]>();
  templateStages.forEach((stage: any) => {
    const id = String(stage?.template_id || '').trim();
    stagesByTemplateId.set(id, [...(stagesByTemplateId.get(id) || []), stage]);
  });
  const stagesByRunId = new Map<string, any[]>();
  runStages.forEach((stage: any) => {
    const id = String(stage?.process_run_id || '').trim();
    stagesByRunId.set(id, [...(stagesByRunId.get(id) || []), stage]);
  });
  return {
    templates: templates.map((template: any) => ({ ...template, stages: (stagesByTemplateId.get(String(template.id)) || []).slice(0, 40) })),
    runs: runs.map((run: any) => ({ ...run, stages: (stagesByRunId.get(String(run.id)) || []).slice(0, 60) })),
    tasks,
  };
}

function buildWorkflowProcessPrompt(prompt: string, input: Record<string, any>): string {
  return [
    'شما دستیار اجرای خودکار فرآیند سازمان فعلی هستید. فقط JSON معتبر برگردان و هیچ توضیح خارج از JSON ننویس.',
    'فقط از الگوها، اجراها، مرحله‌ها و taskهایی که در context آمده استفاده کن. UUID تازه یا ساختگی نساز.',
    'حذف فیزیکی مرحله مجاز نیست؛ برای کم کردن مرحله از cancel_stage_task استفاده کن.',
    'operationهای مجاز: materialize_template_to_tasks، create_raw_process_with_tasks، add_stage_task، update_stage_task، cancel_stage_task.',
    'برای ساخت فرآیند خام، stages باید مرتب و قابل تبدیل به task واقعی باشند.',
    'قالب خروجی: {"reply":"پیام کوتاه فارسی","operations":[{"type":"create_raw_process_with_tasks","process_name":"...","stages":[{"name":"...","sort_order":10,"task_type":"فعالیت سازمانی","status":"todo","due_days":2,"custom_fields":[],"custom_values":{},"status_options":[],"automation_rules":[]}]}]}',
    '',
    `درخواست: ${prompt}`,
    JSON.stringify(input),
  ].join('\n');
}

async function insertWorkflowProcessTask(url: string, key: string, orgId: string, moduleId: string, recordId: string, processRun: any, runStage: any, stage: any, actorUserId: string | null = null): Promise<any> {
  const name = String(stage?.name || stage?.stage_name || stage?.title || runStage?.stage_name || 'فعالیت فرآیند').trim() || 'فعالیت فرآیند';
  const processNodeKey = String(
    runStage?.process_node_key
    || runStage?.metadata?.process_node_key
    || stage?.process_node_key
    || stage?.metadata?.process_node_key
    || '',
  ).trim() || null;
  const processLaneKey = String(
    runStage?.process_lane_key
    || runStage?.metadata?.process_lane_key
    || stage?.process_lane_key
    || stage?.metadata?.process_lane_key
    || 'lane_1',
  ).trim() || 'lane_1';
  const processGraph = (
    runStage?.metadata?.process_graph
    || stage?.process_graph
    || stage?.metadata?.process_graph
    || null
  );
  const payload = {
    org_id: orgId,
    name,
    status: normalizeWorkflowAiProcessStatus(stage?.task_status || stage?.status || runStage?.status),
    priority: String(stage?.priority || 'medium').trim() || 'medium',
    description: String(stage?.description || stage?.metadata?.description || '').trim() || null,
    task_type: String(stage?.task_type || stage?.metadata?.task_type || 'فعالیت سازمانی').trim() || 'فعالیت سازمانی',
    due_date: stage?.due_date || stage?.due_at || addDaysIso(stage?.due_days),
    wage: Number(stage?.wage || runStage?.wage || 0) || 0,
    weight: Number(stage?.weight || 0) || 0,
    sort_order: Number(stage?.sort_order || runStage?.sort_order || 10) || 10,
    source_template_id: processRun?.template_id || stage?.template_id || null,
    source_stage_sort_order: Number(stage?.sort_order || runStage?.sort_order || 10) || 10,
    process_group_id: processRun?.process_group_id || processRun?.id || null,
    process_run_id: processRun?.id || null,
    process_run_stage_id: runStage?.id || null,
    process_node_key: processNodeKey,
    process_lane_key: processLaneKey,
    related_to_module: moduleId,
    source_module_id: moduleId,
    source_record_id: recordId,
    recurrence_info: {
      task_type: String(stage?.task_type || stage?.metadata?.task_type || 'فعالیت سازمانی').trim() || 'فعالیت سازمانی',
      process_automation_rules: Array.isArray(stage?.automation_rules) ? stage.automation_rules : Array.isArray(stage?.metadata?.automation_rules) ? stage.metadata.automation_rules : [],
      process_target_module_ids: Array.isArray(stage?.process_target_module_ids) ? stage.process_target_module_ids : [moduleId],
      process_links: { [moduleId]: recordId },
      process_run_id: processRun?.id || null,
      process_run_stage_id: runStage?.id || null,
      process_node_key: processNodeKey,
      process_lane_key: processLaneKey,
      process_graph: processGraph,
      process_group: {
        id: processRun?.process_group_id || processRun?.id || null,
        name: processRun?.process_name || null,
        template_id: processRun?.template_id || null,
      },
      process_task_custom_fields: Array.isArray(stage?.custom_fields) ? stage.custom_fields : Array.isArray(stage?.metadata?.custom_fields) ? stage.metadata.custom_fields : [],
      process_task_status_options: Array.isArray(stage?.status_options) ? stage.status_options : Array.isArray(stage?.metadata?.status_options) ? stage.metadata.status_options : [],
      process_task_custom_field_values: stage?.custom_values && typeof stage.custom_values === 'object' ? stage.custom_values : {},
    },
  };
  if (actorUserId) {
    payload.created_by = actorUserId;
    payload.updated_by = actorUserId;
  }
  return await dbInsert(url, key, 'tasks', payload);
}

async function executeWorkflowProcessOperation(url: string, key: string, orgId: string, moduleId: string, recordId: string, operation: any, processContext: Record<string, any>, actorUserId: string | null = null): Promise<Record<string, any>> {
  const type = String(operation?.type || '').trim();
  if (type === 'materialize_template_to_tasks') {
    const templateId = String(operation?.template_id || '').trim();
    const template = (processContext.templates || []).find((item: any) => String(item?.id || '') === templateId);
    if (!template) throw new Error('الگوی فرآیند مجاز پیدا نشد.');
    const runIdResult = await callRpc(url, key, 'create_process_run_from_template', {
      p_org_id: orgId,
      p_template_id: templateId,
      p_module_id: moduleId,
      p_record_id: recordId,
      p_process_name: String(operation?.process_name || template?.name || '').trim() || null,
      p_copied_mode: 'auto',
    });
    const processRunId = Array.isArray(runIdResult) ? String(runIdResult[0] || '').trim() : String(runIdResult || '').trim();
    if (actorUserId && processRunId) {
      await dbPatch(url, key, 'process_runs', `id=eq.${processRunId}&org_id=eq.${orgId}`, { created_by: actorUserId, updated_by: actorUserId, updated_at: new Date().toISOString() }).catch(() => {});
      await dbPatch(url, key, 'process_run_stages', `process_run_id=eq.${processRunId}`, { created_by: actorUserId, updated_by: actorUserId, updated_at: new Date().toISOString() }).catch(() => {});
    }
    const runRows = await dbGet(url, key, `process_runs?id=eq.${processRunId}&org_id=eq.${orgId}&select=*&limit=1`).catch(() => []);
    const processRun = runRows[0] || { id: processRunId, template_id: templateId, process_name: operation?.process_name || template?.name };
    const stageRows = await dbGet(url, key, `process_run_stages?process_run_id=eq.${processRunId}&select=*&order=sort_order.asc&limit=200`).catch(() => []);
    const createdTasks: any[] = [];
    for (const runStage of stageRows) {
      if (runStage?.task_id) continue;
      const templateStage = (template.stages || []).find((stage: any) => String(stage?.id || '') === String(runStage?.template_stage_id || '')) || {};
      if (templateStage?.auto_create_task === false && operation?.force !== true) continue;
      const task = await insertWorkflowProcessTask(url, key, orgId, moduleId, recordId, processRun, runStage, { ...templateStage, ...runStage, name: runStage.stage_name }, actorUserId);
      if (task?.id) {
        createdTasks.push({ id: task.id, title: buildAiRecordTitle(task, task.name), stage_id: runStage.id });
        const stagePatch = {
          task_id: task.id,
          status: normalizeWorkflowAiProcessStatus(task.status),
          updated_at: new Date().toISOString(),
        };
        if (actorUserId) stagePatch.updated_by = actorUserId;
        await dbPatch(url, key, 'process_run_stages', `id=eq.${runStage.id}`, stagePatch).catch(() => {});
      }
    }
    return { type, process_run_id: processRunId, created_tasks: createdTasks };
  }
  if (type === 'create_raw_process_with_tasks' || type === 'add_stage_task') {
    let processRun = null;
    const requestedRunId = String(operation?.process_run_id || '').trim();
    if (requestedRunId) {
      processRun = (processContext.runs || []).find((run: any) => String(run?.id || '') === requestedRunId) || null;
    }
    if (!processRun) {
      const processRunPayload = {
        org_id: orgId,
        template_id: null,
        module_id: moduleId,
        record_id: recordId,
        process_name: String(operation?.process_name || 'فرآیند هوش مصنوعی').trim() || 'فرآیند هوش مصنوعی',
        status: 'active',
        copied_mode: 'auto',
        started_at: new Date().toISOString(),
        process_group_id: `ai_process_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      };
      if (actorUserId) {
        processRunPayload.created_by = actorUserId;
        processRunPayload.updated_by = actorUserId;
      }
      processRun = await dbInsert(url, key, 'process_runs', processRunPayload);
    }
    const stages = type === 'add_stage_task' ? [operation] : (Array.isArray(operation?.stages) ? operation.stages : []);
    const createdTasks: any[] = [];
    for (const [index, stage] of stages.entries()) {
      const stageName = String(stage?.name || stage?.stage_name || `مرحله ${index + 1}`).trim() || `مرحله ${index + 1}`;
      const runStagePayload = {
        process_run_id: processRun.id,
        template_stage_id: null,
        stage_name: stageName,
        sort_order: Number(stage?.sort_order || (index + 1) * 10) || (index + 1) * 10,
        status: normalizeWorkflowAiProcessStatus(stage?.status),
        wage: Number(stage?.wage || 0) || 0,
        metadata: {
          source: 'workflow_ai_prompt',
          custom_fields: Array.isArray(stage?.custom_fields) ? stage.custom_fields : [],
          custom_values: stage?.custom_values && typeof stage.custom_values === 'object' ? stage.custom_values : {},
          status_options: Array.isArray(stage?.status_options) ? stage.status_options : [],
          automation_rules: Array.isArray(stage?.automation_rules) ? stage.automation_rules : [],
        },
      };
      if (actorUserId) {
        runStagePayload.created_by = actorUserId;
        runStagePayload.updated_by = actorUserId;
      }
      const runStage = await dbInsert(url, key, 'process_run_stages', runStagePayload);
      const task = await insertWorkflowProcessTask(url, key, orgId, moduleId, recordId, processRun, runStage, stage, actorUserId);
      if (task?.id) {
        createdTasks.push({ id: task.id, title: buildAiRecordTitle(task, task.name), stage_id: runStage?.id || null });
        if (runStage?.id) {
          const stagePatch = { task_id: task.id, updated_at: new Date().toISOString() };
          if (actorUserId) stagePatch.updated_by = actorUserId;
          await dbPatch(url, key, 'process_run_stages', `id=eq.${runStage.id}`, stagePatch).catch(() => {});
        }
      }
    }
    return { type, process_run_id: processRun?.id || null, created_tasks: createdTasks };
  }
  if (type === 'update_stage_task') {
    const taskId = String(operation?.task_id || '').trim();
    const stageId = String(operation?.stage_id || operation?.process_run_stage_id || '').trim();
    const task = taskId
      ? (processContext.tasks || []).find((item: any) => String(item?.id || '') === taskId)
      : (processContext.tasks || []).find((item: any) => String(item?.process_run_stage_id || '') === stageId);
    if (!task?.id) throw new Error('فعالیت قابل ویرایش در context پیدا نشد.');
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (actorUserId) patch.updated_by = actorUserId;
    if (operation?.name || operation?.title) patch.name = String(operation.name || operation.title).trim();
    if (operation?.status) patch.status = normalizeWorkflowAiProcessStatus(operation.status);
    if (operation?.description !== undefined) patch.description = String(operation.description || '').trim() || null;
    if (operation?.due_date || operation?.due_days !== undefined) patch.due_date = operation.due_date || addDaysIso(operation.due_days);
    await dbPatch(url, key, 'tasks', `id=eq.${task.id}&org_id=eq.${orgId}`, patch);
    if (task.process_run_stage_id) {
      const stagePatch = {
        status: normalizeWorkflowAiProcessStatus(patch.status || task.status),
        updated_at: new Date().toISOString(),
      };
      if (actorUserId) stagePatch.updated_by = actorUserId;
      await dbPatch(url, key, 'process_run_stages', `id=eq.${task.process_run_stage_id}`, stagePatch).catch(() => {});
    }
    return { type, updated_task_id: task.id, title: patch.name || task.name };
  }
  if (type === 'cancel_stage_task') {
    const taskId = String(operation?.task_id || '').trim();
    const stageId = String(operation?.stage_id || operation?.process_run_stage_id || '').trim();
    const task = taskId
      ? (processContext.tasks || []).find((item: any) => String(item?.id || '') === taskId)
      : (processContext.tasks || []).find((item: any) => String(item?.process_run_stage_id || '') === stageId);
    if (task?.id) {
      const taskPatch = { status: 'canceled', updated_at: new Date().toISOString() };
      if (actorUserId) taskPatch.updated_by = actorUserId;
      await dbPatch(url, key, 'tasks', `id=eq.${task.id}&org_id=eq.${orgId}`, taskPatch);
    }
    const targetStageId = stageId || String(task?.process_run_stage_id || '').trim();
    if (targetStageId) {
      const stagePatch = { status: 'canceled', updated_at: new Date().toISOString() };
      if (actorUserId) stagePatch.updated_by = actorUserId;
      await dbPatch(url, key, 'process_run_stages', `id=eq.${targetStageId}`, stagePatch).catch(() => {});
    }
    return { type, canceled_task_id: task?.id || null, canceled_stage_id: targetStageId || null };
  }
  throw new Error(`اقدام فرآیندی ${type || 'نامشخص'} پشتیبانی نمی‌شود.`);
}

async function callWorkflowAiPrompt(url: string, key: string, orgId: string, prompt: string, options: Record<string, any> = {}): Promise<Record<string, any>> {
  const apiKey = String(
    Deno.env.get('AVALAI_API_KEY')
    || Deno.env.get('AI_API_KEY')
    || Deno.env.get('OPENAI_API_KEY')
    || ''
  ).trim();
  if (!apiKey) throw new Error('کلید مرکزی AI برای workflow interval تنظیم نشده است.');
  await assertWorkflowAiEnabled(url, key, orgId);
  const model = await loadWorkflowAiModel(url, key, orgId);
  const isReasoningModel = [/^o\d/i, /\bo[34][-_]/i, /^gpt-5/i, /deepseek-r\d/i, /\bqwq\b/i, /\breasonin/i].some((p) => p.test(model));
  const schema = options?.recordCreationSchema && typeof options.recordCreationSchema === 'object'
    ? options.recordCreationSchema
    : null;
  const processOperationContext = options?.processOperationContext && typeof options.processOperationContext === 'object'
    ? options.processOperationContext
    : null;
  const mutationMode = String(options?.mutationMode || 'create_record').trim();
  const fieldLines = schema && Array.isArray(schema.fields)
    ? schema.fields.map((field: any) => `- ${field.key}: ${field.label || field.key} (${field.type || 'text'}${field.required ? '، ضروری' : ''})`).join('\n')
    : '';
  const userPrompt = processOperationContext
    ? buildWorkflowProcessPrompt(prompt, processOperationContext)
    : prompt;
  const requestBody: Record<string, any> = {
    model,
    messages: [
      {
        role: 'system',
        content: processOperationContext
          ? 'شما دستیار اجرای خودکار فرآیند سازمان فعلی هستید. خروجی فقط JSON معتبر باشد و عملیات واقعی را فقط از context مجاز بساز.'
          : schema
          ? [
              'شما دستیار هوشمند سازمان فعلی برای اجرای خودکار گردش کار هستید.',
              'خروجی فقط JSON معتبر باشد و متن اضافی ننویس.',
              'فقط کلیدهای مجاز schema را در fields برگردان. org_id، id، system_code، created_at، updated_at، created_by و updated_by را برنگردان.',
              mutationMode === 'update_record'
                ? 'فقط فیلدهایی را برگردان که بر اساس درخواست باید در رکورد جاری تغییر کنند.'
                : 'فیلدهای لازم برای ساخت رکورد جدید را برگردان.',
              `ماژول مقصد: ${schema.moduleLabel || schema.moduleId || ''}`,
              'فیلدهای مجاز:',
              fieldLines,
              'قالب خروجی: {"reply":"پیام کوتاه فارسی","record":{"fields":{}}}',
            ].join('\n')
          : 'شما دستیار هوشمند سازمان فعلی برای اجرای خودکار گردش کار هستید. پاسخ را کوتاه، دقیق و قابل ارسال به کاربر بنویس.',
      },
      { role: 'user', content: userPrompt },
    ],
  };
  if (isReasoningModel) {
    requestBody.max_completion_tokens = 2500;
  } else {
    requestBody.temperature = 0.2;
    requestBody.max_tokens = 2000;
  }
  let response: Response | null = null;
  let usedBaseUrl = '';
  // Do not chain fallback requests for long-running AI actions. On self-hosted
  // Supabase this can exceed the supervisor timeout and cancel the worker.
  const baseUrls = workflowAiBaseUrls().slice(0, 1);
  for (const baseUrl of baseUrls) {
    try {
      const nextResponse = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(45000),
      });
      response = nextResponse;
      usedBaseUrl = baseUrl;
      if (nextResponse.ok || !isRetryableAiStatus(nextResponse.status) || baseUrl === baseUrls[baseUrls.length - 1]) break;
    } catch (error: any) {
      const text = `${String(error?.name || '')} ${String(error?.message || error || '')}`;
      if (/abort|timeout|timed out|upstream server is timing out|request has been cancelled/i.test(text)) {
        throw new Error('سرویس هوش مصنوعی در زمان مناسب پاسخ نداد.');
      }
      if (baseUrl === baseUrls[baseUrls.length - 1]) throw error;
    }
  }
  if (!response) throw new Error('اتصال به AvalAI برقرار نشد.');
  const raw = await response.text();
  let parsed: any = {};
  try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = { raw }; }
  if (!response.ok) {
    throw new Error(String(parsed?.error?.message || parsed?.message || raw || `AI request failed: ${response.status}`));
  }
  return {
    provider: 'avalai',
    model,
    requestId: response.headers.get('x-request-id') || response.headers.get('x-avalai-request-id') || null,
    baseUrl: usedBaseUrl,
    answer: String(parsed?.choices?.[0]?.message?.content || '').trim(),
    usage: parsed?.usage || null,
  };
}

function getInitialProcessRunNodeKeys(stages: any[]): string[] {
  const rows = Array.isArray(stages) ? stages : [];
  const nodeKeyOf = (stage: any) => String(
    stage?.process_node_key || stage?.metadata?.process_node_key || '',
  ).trim();
  const laneKeyOf = (stage: any) => String(
    stage?.process_lane_key || stage?.metadata?.process_lane_key || 'lane_1',
  ).trim() || 'lane_1';
  const graph = rows.find((stage: any) => stage?.metadata?.process_graph)?.metadata?.process_graph || {};
  const rootLaneKeys = new Set(
    (Array.isArray(graph?.lanes) ? graph.lanes : [])
      .filter((lane: any) => !String(lane?.parentTriggerKey || lane?.parent_trigger_key || '').trim())
      .map((lane: any) => String(lane?.key || '').trim())
      .filter(Boolean),
  );
  if (rootLaneKeys.size === 0) {
    const firstLaneKey = rows
      .slice()
      .sort((left: any, right: any) => Number(left?.sort_order || 0) - Number(right?.sort_order || 0))
      .map(laneKeyOf)
      .find(Boolean);
    if (firstLaneKey) rootLaneKeys.add(firstLaneKey);
  }

  return Array.from(rootLaneKeys)
    .map((laneKey) => rows
      .filter((stage: any) => laneKeyOf(stage) === laneKey)
      .sort((left: any, right: any) => Number(left?.sort_order || 0) - Number(right?.sort_order || 0))[0])
    .filter(Boolean)
    .map(nodeKeyOf)
    .filter(Boolean);
}

async function activateInitialProcessRunNodes(
  url: string,
  key: string,
  orgId: string,
  processRunId: string,
  actorUserId: string | null,
): Promise<Record<string, any>> {
  const stages = await dbGet(
    url,
    key,
    `process_run_stages?process_run_id=eq.${processRunId}&select=id,sort_order,process_node_key,process_lane_key,metadata&order=sort_order.asc`,
  ).catch(() => []);
  const nodeKeys = getInitialProcessRunNodeKeys(stages);
  if (nodeKeys.length === 0) {
    return { created_task_ids: [], existing_task_ids: [], process_node_keys: [] };
  }
  const result = await callRpc(url, key, 'activate_process_run_nodes', {
    p_org_id: orgId,
    p_process_run_id: processRunId,
    p_node_keys: nodeKeys,
    p_actor_user_id: actorUserId || null,
  });
  return { ...(result || {}), process_node_keys: nodeKeys };
}

function parseProcessAssigneeToken(value: any): { userId: string | null; roleId: string | null } {
  const raw = String(value || '').trim();
  if (!raw) return { userId: null, roleId: null };
  const prefixed = raw.match(/^(user|role)[:_](.+)$/i);
  if (prefixed) {
    const id = String(prefixed[2] || '').trim() || null;
    return String(prefixed[1]).toLowerCase() === 'role'
      ? { userId: null, roleId: id }
      : { userId: id, roleId: null };
  }
  return { userId: raw, roleId: null };
}

async function prepareProcessRunForAutomaticExecution(
  url: string,
  key: string,
  orgId: string,
  processRunId: string,
  record: Record<string, any>,
) {
  const recurrence = parseObjectValue(record?.recurrence_info);
  const runRows = await dbGet(url, key,
    `process_runs?id=eq.${encodeURIComponent(processRunId)}&org_id=eq.${encodeURIComponent(orgId)}&select=module_id,record_id,process_name&limit=1`
  ).catch(() => []);
  const runModuleId = String(runRows[0]?.module_id || '').trim();
  const runRecordId = String(runRows[0]?.record_id || '').trim();
  const processLinks = {
    ...parseObjectValue(recurrence?.process_links),
    ...parseObjectValue(record?.process_links),
    ...(runModuleId && runRecordId ? { [runModuleId]: runRecordId } : {}),
  };
  const targetModuleIds = Array.from(new Set([
    ...(Array.isArray(record?.process_target_module_ids) ? record.process_target_module_ids : []),
    ...Object.keys(processLinks),
  ].map((value) => String(value || '').trim()).filter(Boolean)));

  const existingLinks = await dbGet(url, key,
    `process_run_links?org_id=eq.${encodeURIComponent(orgId)}&process_run_id=eq.${encodeURIComponent(processRunId)}&select=module_id,record_id`
  ).catch(() => []);
  for (const existingLink of existingLinks) {
    const linkedModuleId = String(existingLink?.module_id || '').trim();
    const linkedRecordId = String(existingLink?.record_id || '').trim();
    if (linkedModuleId && linkedRecordId && !processLinks[linkedModuleId]) {
      processLinks[linkedModuleId] = linkedRecordId;
    }
  }
  const existingLinkKeys = new Set(existingLinks.map((link: any) => `${link.module_id}:${link.record_id}`));
  for (const [linkedModuleId, linkedRecordIdRaw] of Object.entries(processLinks)) {
    const linkedRecordId = String(linkedRecordIdRaw || '').trim();
    const linkKey = `${linkedModuleId}:${linkedRecordId}`;
    if (!linkedModuleId || !linkedRecordId || existingLinkKeys.has(linkKey)) continue;
    await dbInsert(url, key, 'process_run_links', {
      org_id: orgId,
      process_run_id: processRunId,
      module_id: linkedModuleId,
      record_id: linkedRecordId,
      is_primary: false,
    });
    existingLinkKeys.add(linkKey);
  }

  const runStages = await dbGet(url, key,
    `process_run_stages?process_run_id=eq.${encodeURIComponent(processRunId)}&select=*&order=sort_order.asc&limit=500`
  ).catch(() => []);
  const templateRecord: Record<string, any> = { ...record };
  assignProcessTemplateSystemVariableValues(templateRecord);
  const rawProcessName = String(runRows[0]?.process_name || '').trim() || 'فرآیند';
  assignProcessAutomationIdentityContext(templateRecord, rawProcessName, null);
  for (const [linkedModuleId, linkedRecordIdRaw] of Object.entries(processLinks)) {
    const linkedRecordId = String(linkedRecordIdRaw || '').trim();
    if (!linkedModuleId || !linkedRecordId) continue;
    const linkedRows = await dbGet(url, key,
      `${getModuleTable(linkedModuleId)}?id=eq.${encodeURIComponent(linkedRecordId)}&org_id=eq.${encodeURIComponent(orgId)}&select=*&limit=1`
    ).catch(() => []);
    const linkedRecord = linkedRows[0];
    if (!linkedRecord) continue;
    Object.entries(linkedRecord).forEach(([field, value]) => {
      templateRecord[`__linked__${linkedModuleId}__${field}`] = value;
    });
    if (String(record?.id || '').trim() === linkedRecordId) Object.assign(templateRecord, linkedRecord);
  }
  const resolvedProcessName = (
    await renderTemplateAsync(rawProcessName, templateRecord, url, key, false, orgId, runModuleId)
  ).trim() || rawProcessName;
  assignProcessAutomationIdentityContext(templateRecord, resolvedProcessName, null);
  if (resolvedProcessName !== rawProcessName) {
    await dbPatch(url, key, 'process_runs', `id=eq.${encodeURIComponent(processRunId)}`, {
      process_name: resolvedProcessName,
    });
  }
  for (const stage of runStages) {
    const metadata = parseObjectValue(stage?.metadata);
    const graph = parseObjectValue(metadata?.process_graph);
    const resolvedGraph = Array.isArray(graph?.lanes)
      ? {
          ...graph,
          lanes: await Promise.all(graph.lanes.map(async (lane: any) => {
            const rawLaneName = String(lane?.name || lane?.title || '').trim();
            if (!rawLaneName) return lane;
            const resolvedLaneName = (
              await renderTemplateAsync(rawLaneName, templateRecord, url, key, false, orgId, runModuleId)
            ).trim() || rawLaneName;
            return { ...lane, name: resolvedLaneName };
          })),
        }
      : graph;
    const laneKey = String(stage?.process_lane_key || metadata?.process_lane_key || 'lane_1').trim() || 'lane_1';
    const lane = (Array.isArray(resolvedGraph?.lanes) ? resolvedGraph.lanes : []).find((item: any) => (
      String(item?.key || item?.id || '').trim() === laneKey
    ));
    assignProcessAutomationIdentityContext(
      templateRecord,
      resolvedProcessName,
      lane?.name || lane?.title || metadata?.process_lane_name || 'ردیف اصلی',
    );
    templateRecord.task_name = String(stage?.stage_name || '').trim();
    templateRecord.task_status = 'todo';
    templateRecord.status_label = 'در انتظار انجام';
    templateRecord.task_status_label = 'در انتظار انجام';
    const assigneeReference = String(metadata?.default_assignee_field || '').trim().replace(/^field:/i, '');
    const resolvedAssignee = assigneeReference
      ? parseProcessAssigneeToken(getFieldValueForCondition(templateRecord, assigneeReference))
      : { userId: null, roleId: null };
    const firstRenderedStage = await renderProcessStageForTaskCreation(
      {
        stageName: String(stage?.stage_name || ''),
        metadata: { ...metadata, process_graph: resolvedGraph },
      },
      (template) => renderTemplateAsync(template, templateRecord, url, key, false, orgId, runModuleId),
      (fieldKey) => resolveWorkflowFieldValue(url, key, fieldKey, templateRecord, orgId, runModuleId),
    );
    // توضیح و مقادیر اختصاصی می‌توانند به {{task_name}} وابسته باشند؛
    // پاس دوم آن‌ها را با عنوان نهایی فعالیت حل می‌کند.
    templateRecord.task_name = firstRenderedStage.stageName;
    const renderedStage = await renderProcessStageForTaskCreation(
      firstRenderedStage,
      (template) => renderTemplateAsync(template, templateRecord, url, key, false, orgId, runModuleId),
      (fieldKey) => resolveWorkflowFieldValue(url, key, fieldKey, templateRecord, orgId, runModuleId),
    );
    await dbPatch(url, key, 'process_run_stages', `id=eq.${encodeURIComponent(String(stage.id))}`, {
      stage_name: renderedStage.stageName,
      assignee_user_id: stage?.assignee_user_id || resolvedAssignee.userId,
      assignee_role_id: stage?.assignee_role_id || resolvedAssignee.roleId,
      metadata: {
        ...renderedStage.metadata,
        process_link_map: processLinks,
        process_target_module_ids: targetModuleIds,
      },
    });
  }
  return runStages;
}

async function activateAllProcessRunNodes(
  url: string,
  key: string,
  orgId: string,
  processRunId: string,
  actorUserId: string | null,
) {
  const stages = await dbGet(url, key,
    `process_run_stages?process_run_id=eq.${encodeURIComponent(processRunId)}&select=id,process_node_key,metadata&order=sort_order.asc&limit=500`
  ).catch(() => []);
  const nodeKeys = stages
    .map((stage: any) => String(stage?.process_node_key || stage?.metadata?.process_node_key || '').trim())
    .filter(Boolean);
  if (nodeKeys.length === 0) return { process_node_keys: [], created_task_ids: [], existing_task_ids: [] };
  const result = await callRpc(url, key, 'activate_process_run_nodes', {
    p_org_id: orgId,
    p_process_run_id: processRunId,
    p_node_keys: Array.from(new Set(nodeKeys)),
    p_actor_user_id: actorUserId || null,
  });
  return { ...result, process_node_keys: nodeKeys };
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
  key: string,
  orgId: string,
  moduleId: string,
): Promise<any> {
  const valueMode = String(config.value_mode || 'static');
  if (valueMode === 'from_source' || valueMode === 'from_related') {
    const targetType = String(config.value_field_type || config.target_field_type || '').trim();
    const sourceType = String(config.source_field_type || '').trim();
    const hasRelationType = ['relation', 'multi_relation'].includes(targetType) || ['relation', 'multi_relation'].includes(sourceType);
    if (targetType && sourceType && !hasRelationType && !isWorkflowFieldValueCompatible(
      { key: String(config.target_field_key || config.field || ''), type: targetType },
      { key: String(config.source_field || ''), type: sourceType },
    )) {
      throw new Error('نوع فیلد منبع با فیلد مقصد سازگار نیست.');
    }
    const sourceField = String(config.source_field || '').trim();
    return sourceField ? await resolveWorkflowFieldValue(url, key, sourceField, record, orgId, moduleId) : null;
  }
  if (valueMode === 'formula') {
    const expression = config.formula_expression_config;
    return expression && typeof expression === 'object'
      ? evaluateFormulaExpression(expression, record || {}).value
      : null;
  }
  const automaticDateValue = resolveWorkflowDateCriterion(
    { type: String(config.value_field_type || config.target_field_type || '').trim() },
    config.date_criterion,
  );
  if (automaticDateValue !== undefined) return automaticDateValue;
  return config.value ?? null;
}

async function resolveServerFieldMappingValue(
  mapping: Record<string, any>,
  record: Record<string, any>,
  url: string,
  key: string,
  orgId: string,
  moduleId: string,
) {
  return resolveConfiguredActionValue({
    value_mode: mapping?.mode || 'static',
    source_field: mapping?.source_field,
    formula_expression_config: mapping?.formula_expression_config,
    value: mapping?.value,
    date_criterion: mapping?.date_criterion,
    value_field_type: mapping?.field_type,
    target_field_key: mapping?.field,
    source_field_type: mapping?.source_field_type,
  }, record, url, key, orgId, moduleId);
}

async function executeAction(
  action: WorkflowAction, record: Record<string, any>,
  moduleId: string, orgId: string, url: string, key: string, actorUserId: string | null = null
): Promise<ActionExecutionResult> {
  const config = action.config || {};
  const recordId = String(record?.id || '').trim();

  // ── run_ai_prompt ─────────────────────────────────────────────────────
  if (action.type === 'run_ai_prompt') {
    const prompt = (await renderTemplateAsync(String(config.prompt_template || config.prompt || ''), record, url, key, false, orgId, moduleId)).trim();
    if (!prompt) return actionResult(action, 'skipped', 'پرامپت هوش مصنوعی خالی است.');
    if (!recordId) return actionResult(action, 'skipped', 'رکورد مقصد برای پیشنهاد AI مشخص نیست.');
    const outputMode = String(config.output_mode || 'text').trim();
    const targetModuleId = outputMode === 'update_record'
      ? moduleId
      : String(config.target_module_id || '').trim();
    const allowedFieldKeys = Array.isArray(config.allowed_field_keys)
      ? config.allowed_field_keys.map((item: any) => String(item || '').trim()).filter(Boolean)
      : [];
    if (outputMode === 'update_record' && allowedFieldKeys.length === 0) {
      return actionResult(action, 'skipped', 'برای ویرایش رکورد با AI هیچ فیلد مجازی انتخاب نشده است.');
    }
    const recordCreationSchema = outputMode === 'create_record' || outputMode === 'update_record'
      ? (config.record_creation_schema && typeof config.record_creation_schema === 'object' ? config.record_creation_schema : null)
      : null;
    if (
      outputMode === 'update_record'
      && String(recordCreationSchema?.moduleId || '').trim() !== moduleId
    ) {
      return actionResult(action, 'skipped', 'ساختار فیلدهای مجاز ویرایش AI با ماژول جاری هماهنگ نیست.');
    }
    const processOperationContext = outputMode === 'process_operation'
      ? await loadWorkflowProcessContext(url, key, orgId, moduleId, recordId)
      : null;
    const aiResult = await callWorkflowAiPrompt(url, key, orgId, prompt, {
      recordCreationSchema,
      processOperationContext,
      mutationMode: outputMode,
    });
    if (!aiResult.answer) return actionResult(action, 'skipped', 'پاسخ هوش مصنوعی خالی بود.');
    let answer = aiResult.answer;
    const createdRecords: any[] = [];
    const updatedRecords: any[] = [];
    const executedProcessOperations: any[] = [];
    if (outputMode === 'create_record') {
      if (!targetModuleId || !recordCreationSchema) return actionResult(action, 'skipped', 'تنظیمات ساخت رکورد با AI کامل نیست.');
      const parsed = extractJsonObjectFromText(aiResult.answer) || {};
      const recordDraft = parsed?.record || (Array.isArray(parsed?.records) ? parsed.records[0] : null) || parsed;
      const payload = sanitizeAiRecordPayload(recordDraft, recordCreationSchema);
      const relationFieldKey = String(config.relation_field_key || '').trim();
      if (relationFieldKey && recordId) payload[relationFieldKey] = recordId;
      if (Object.keys(payload).length > 0) {
        const created = await createRecord(url, key, targetModuleId, orgId, payload, actorUserId);
        if (created) {
          createdRecords.push({
            module_id: targetModuleId,
            id: created.id || null,
            title: buildAiRecordTitle(created, recordCreationSchema?.moduleLabel || targetModuleId),
          });
        }
      }
      answer = String(parsed?.reply || '').trim()
        || (createdRecords.length > 0
          ? `${recordCreationSchema?.moduleLabel || targetModuleId} با اطلاعات استخراج‌شده ساخته شد.`
          : 'اطلاعات کافی برای ساخت رکورد پیدا نشد.');
    }
    if (outputMode === 'update_record') {
      if (!recordCreationSchema) return actionResult(action, 'skipped', 'تنظیمات ویرایش رکورد با AI کامل نیست.');
      const parsed = extractJsonObjectFromText(aiResult.answer) || {};
      const recordDraft = parsed?.record || parsed;
      const payload = sanitizeAiRecordPayload(recordDraft, recordCreationSchema);
      if (Object.keys(payload).length > 0) {
        await updateRecord(url, key, moduleId, recordId, payload, actorUserId, orgId);
        updatedRecords.push({
          module_id: moduleId,
          id: recordId,
          title: buildAiRecordTitle({ ...record, ...payload }, recordCreationSchema?.moduleLabel || moduleId),
          fields: Object.keys(payload),
        });
      }
      answer = String(parsed?.reply || '').trim()
        || (updatedRecords.length > 0
          ? `${recordCreationSchema?.moduleLabel || moduleId} با اطلاعات استخراج‌شده به‌روزرسانی شد.`
          : 'اطلاعات کافی برای ویرایش رکورد پیدا نشد.');
    }
    if (outputMode === 'process_operation') {
      const parsed = extractJsonObjectFromText(aiResult.answer) || {};
      const operations = Array.isArray(parsed?.operations) ? parsed.operations : [];
      if (operations.length === 0) return actionResult(action, 'skipped', 'هوش مصنوعی اقدام فرآیندی معتبری برنگرداند.');
      for (const operation of operations.slice(0, 8)) {
        executedProcessOperations.push(await executeWorkflowProcessOperation(url, key, orgId, moduleId, recordId, operation, processOperationContext || {}, actorUserId));
      }
      answer = String(parsed?.reply || '').trim() || 'اقدام‌های فرآیندی گردش کار اجرا شد.';
    }
    const channelConfigs = config.channel_configs && typeof config.channel_configs === 'object' ? config.channel_configs : {};
    const deliveryChannels = Array.from(new Set(
      (Array.isArray(config.delivery_channels) ? config.delivery_channels : [])
        .map((item: any) => String(item || '').trim().toLowerCase())
        .filter((item: string) => ['sms', 'email', 'bot', 'note'].includes(item))
    ));
    const noteShareTargets = deliveryChannels.includes('note')
      ? await resolveAssigneesToMentionTargets(
          url,
          key,
          orgId,
          (channelConfigs.note || {}).recipient_assignees || [],
          (channelConfigs.note || {}).recipient_fields || [],
          record
        ).catch(() => ({ mentionUserIds: [], mentionRoleIds: [], groupTargets: [] }))
      : { mentionUserIds: [], mentionRoleIds: [], groupTargets: [] };
    const sharedUserIds = Array.from(new Set([
      ...(noteShareTargets.mentionUserIds || []),
      ...((noteShareTargets.groupTargets || []).flatMap((group: any) => group.userIds || [])),
    ]));
    const sharedRoleIds = Array.from(new Set([
      ...(noteShareTargets.mentionRoleIds || []),
      ...((noteShareTargets.groupTargets || []).flatMap((group: any) => group.roleIds || [])),
    ]));
    const threadResult = await createWorkflowAiThread(url, key, {
      orgId,
      moduleId,
      recordId,
      prompt,
      answer,
      model: aiResult.model,
      provider: aiResult.provider,
      actionId: action.id || null,
      sharedUserIds,
      sharedRoleIds,
      metadata: {
        output_mode: outputMode,
        target_module_id: targetModuleId || null,
        created_records: createdRecords,
        updated_records: updatedRecords,
        process_operations: executedProcessOperations,
      },
    }).catch((error: any) => {
      console.warn('[workflow-runner] workflow AI thread insert skipped:', error?.message || error);
      return null;
    });
    await dbInsert(url, key, 'ai_action_logs', {
      org_id: orgId,
      thread_id: threadResult?.thread?.id || null,
      message_id: threadResult?.assistantMessage?.id || null,
      module_id: moduleId,
      record_id: recordId,
      action_type: 'workflow_ai_prompt',
      status: 'executed',
      proposed_payload: {
        prompt,
        answer,
        workflow_action_id: action.id || null,
        require_human_approval: false,
        output_mode: outputMode,
        target_module_id: targetModuleId || null,
      },
      result_payload: {
        source: 'workflow_interval_runner',
        provider: aiResult.provider,
        model: aiResult.model,
        usage: aiResult.usage,
        avalai_request_id: aiResult.requestId,
        created_records: createdRecords,
        updated_records: updatedRecords,
        process_operations: executedProcessOperations,
      },
      avalai_request_id: aiResult.requestId,
      executed_at: new Date().toISOString(),
    });
    const actionRecord = {
      ...record,
      ai_answer: answer,
      ai_created_record_title: createdRecords[0]?.title || '',
      ai_updated_record_title: updatedRecords[0]?.title || '',
      ai_process_operation_count: String(executedProcessOperations.length || ''),
    };
    for (const channel of deliveryChannels) {
      if (channel === 'sms') {
        await executeAction({ ...action, type: 'send_sms', config: { message: '{{ai_answer}}', ...(channelConfigs.sms || {}) } }, actionRecord, moduleId, orgId, url, key, actorUserId);
        continue;
      }
      if (channel === 'email') {
        await executeAction({ ...action, type: 'send_email', config: { subject: 'پیام هوش مصنوعی', body: '{{ai_answer}}', ...(channelConfigs.email || {}) } }, actionRecord, moduleId, orgId, url, key, actorUserId);
        continue;
      }
      if (channel === 'bot') {
        await executeAction({
          ...action,
          type: 'send_bot_message',
          config: {
            ...(channelConfigs.bot || {}),
            message: '{{ai_answer}}',
            sender_kind: 'ai',
            sender_type: 'ai',
            sender_display_name: 'هوش مصنوعی',
            message_source: 'ai',
            ai_generated: true,
          },
        }, actionRecord, moduleId, orgId, url, key, actorUserId);
        continue;
      }
      if (channel === 'note') {
        await executeAction({ ...action, type: 'send_note', config: { note_text: '{{ai_answer}}', ...(channelConfigs.note || {}) } }, actionRecord, moduleId, orgId, url, key, actorUserId);
      }
    }
    return actionResult(action, 'success', undefined, {
      affected_count: 1 + createdRecords.length + updatedRecords.length + executedProcessOperations.length,
      details: {
        model: aiResult.model,
        avalai_request_id: aiResult.requestId,
        created_records: createdRecords,
        updated_records: updatedRecords,
        process_operations: executedProcessOperations,
      },
    });
  }

  // ── send_web_form_link ────────────────────────────────────────────────
  if (action.type === 'send_web_form_link') {
    const webFormId = String(config.web_form_id || '').trim();
    if (!webFormId) return actionResult(action, 'skipped', 'وب‌فرم انتخاب نشده است.');

    const webForms = await dbGet(
      url,
      key,
      `web_forms?id=eq.${encodeURIComponent(webFormId)}&org_id=eq.${encodeURIComponent(orgId)}&select=id,route_slug,target_module_id,is_active&limit=1`,
    );
    const webForm = webForms[0] || null;
    if (!webForm || webForm.is_active !== true) {
      return actionResult(action, 'skipped', 'وب‌فرم فعال پیدا نشد.');
    }

    const relatedModuleId = String(config.related_module_id || moduleId || '').trim() || moduleId;
    const processLinks = parseObjectValue(record?.process_links || record?.process_link_map);
    const relatedRecordId = relatedModuleId === moduleId
      ? recordId
      : String(processLinks?.[relatedModuleId] || '').trim();
    const baseUrl = await getOrgTenantBaseUrl(url, key, orgId);
    if (!baseUrl) return actionResult(action, 'skipped', 'دامنه معتبر سازمان برای وب‌فرم پیدا نشد.');
    const tokenBytes = crypto.getRandomValues(new Uint8Array(24));
    const accessToken = Array.from(tokenBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    await dbInsert(url, key, 'web_form_link_tokens', {
      org_id: orgId,
      web_form_id: webFormId,
      target_module_id: String(webForm.target_module_id || '').trim() || null,
      related_module_id: relatedModuleId || null,
      related_record_id: relatedRecordId || null,
      access_token: accessToken,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      created_by: actorUserId || null,
    });

    const routeSlug = String(webForm.route_slug || '').trim();
    const formPath = routeSlug ? `/inquiry/${encodeURIComponent(routeSlug)}` : '/inquiry';
    const webFormLink = `${baseUrl}${formPath}?token=${encodeURIComponent(accessToken)}`;
    const actionRecord = { ...record, web_form_link: webFormLink };
    const channelConfigs = config.channel_configs && typeof config.channel_configs === 'object'
      ? config.channel_configs
      : {};
    const deliveryChannels = Array.from(new Set(
      asArray(config.delivery_channels)
        .map((item) => String(item || '').trim().toLowerCase())
        .filter((item) => ['sms', 'email', 'bot', 'note'].includes(item)),
    ));
    const channelResults: ActionExecutionResult[] = [];

    for (const channel of deliveryChannels) {
      const nestedAction = channel === 'sms'
        ? { ...action, type: 'send_sms', config: { ...(channelConfigs.sms || {}) } }
        : channel === 'email'
          ? { ...action, type: 'send_email', config: { ...(channelConfigs.email || {}) } }
          : channel === 'bot'
            ? { ...action, type: 'send_bot_message', config: { ...(channelConfigs.bot || {}) } }
            : { ...action, type: 'send_note', config: { ...(channelConfigs.note || {}) } };
      channelResults.push(await executeAction(
        nestedAction as WorkflowAction,
        actionRecord,
        moduleId,
        orgId,
        url,
        key,
        actorUserId,
      ));
    }

    const successfulChannels = channelResults.filter((result) => result.status === 'success').length;
    return actionResult(
      action,
      successfulChannels > 0 ? 'success' : 'skipped',
      successfulChannels > 0 ? undefined : 'هیچ کانال فعالی برای ارسال لینک وب‌فرم اجرا نشد.',
      { affected_count: successfulChannels, details: { channel_results: channelResults } },
    );
  }

  // ── send_sms ──────────────────────────────────────────────────────────
  if (action.type === 'send_sms') {
    const text = (await renderTemplateAsync(String(config.message || ''), record, url, key, false, orgId, moduleId)).trim();
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
      const sentRecipients = await sendSmsViaProvider(smsSettings, allRecipients, text, url, key);
      await auditSmsBatch(url, key, { orgId, moduleId, recordId, recipients: sentRecipients, text, status: 'provider_accepted', metadata: { workflow_action_type: action.type, workflow_action_id: action.id || null } });
      return actionResult(action, sentRecipients.length > 0 ? 'success' : 'skipped', sentRecipients.length > 0 ? undefined : 'هیچ شماره معتبری ارسال نشد.', { recipient_count: sentRecipients.length });
    } catch (e: any) {
      await auditSmsBatch(url, key, { orgId, moduleId, recordId, recipients: allRecipients, text, status: 'failed', errorMessage: String(e?.message || e), metadata: { workflow_action_type: action.type, workflow_action_id: action.id || null } });
      throw e;
    }
  }

  // ── send_note / send_note_sms ─────────────────────────────────────────
  if (action.type === 'send_note' || action.type === 'send_note_sms') {
    const recipientConfig = getWorkflowRecipientConfig(config);
    const noteText = (await renderTemplateAsync(String(config.note_text || ''), record, url, key, true, orgId, moduleId)).trim();
    const attachments = await resolveServerWorkflowMessageAttachments({ url, key, orgId, moduleId, recordId, config, record });
    if (!noteText && attachments.length === 0) return actionResult(action, 'skipped', 'متن و پیوست یادداشت خالی است.');
    if (!moduleId || !recordId) return actionResult(action, 'skipped', 'رکورد مقصد برای یادداشت مشخص نیست.');
    const mentionTargets = await resolveAssigneesToMentionTargets(
      url, key, orgId,
      recipientConfig.recipientAssignees, recipientConfig.recipientFields, record
    );
    const noteRows: Record<string, any>[] = [];
    const baseMetadata = { source_type: 'system', notification_surface: 'system_feed', requires_action: false, workflow_action_type: action.type, workflow_action_id: action.id || null };
    const hasDirectMentions = mentionTargets.mentionUserIds.length > 0 || mentionTargets.mentionRoleIds.length > 0;
    if (hasDirectMentions || mentionTargets.groupTargets.length === 0) {
      noteRows.push({
        org_id: orgId, module_id: moduleId, record_id: recordId,
        content: attachments.length > 0 ? JSON.stringify({ text: noteText, attachments }) : noteText, mention_user_ids: mentionTargets.mentionUserIds, mention_role_ids: mentionTargets.mentionRoleIds,
        source_type: 'system', metadata: baseMetadata, author_id: actorUserId || null,
      });
    }
    mentionTargets.groupTargets.forEach((group) => {
      noteRows.push({
        org_id: orgId, module_id: moduleId, record_id: recordId,
        content: attachments.length > 0 ? JSON.stringify({ text: noteText, attachments }) : noteText, mention_user_ids: group.userIds, mention_role_ids: group.roleIds,
        source_type: 'system', metadata: { ...baseMetadata, chat_group_id: group.groupId }, author_id: actorUserId || null,
      });
    });
    if (noteRows.length === 0 || !hasDirectMentions && mentionTargets.groupTargets.length === 0) {
      return actionResult(action, 'skipped', 'گیرنده یادداشت پیدا نشد.', { recipient_count: 0 });
    }
    for (const noteRow of noteRows) await insertNote(url, key, noteRow as any);
    let smsRecipientCount = 0;
    if (action.type === 'send_note_sms') {
      const smsText = `پیام جدید از طرف "سیستم"\n"${noteText.replace(/\*\*/g, '').substring(0, 80)}"\nبرای مشاهده به سامانه مراجعه کنید`;
      const recipients = await resolveAssigneesToSmsRecipients(url, key, orgId, recipientConfig.recipientAssignees, recipientConfig.recipientFields, record);
      if (recipients.length > 0) {
        const smsSettings = await getOrgSmsSettings(url, key, orgId);
        if (smsSettings) {
          try {
            const sentRecipients = await sendSmsViaProvider(smsSettings, recipients, smsText, url, key);
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
    const recipientConfig = getWorkflowRecipientConfig(config);
    const configuredChannel = String(config.channel || config.platform || '').trim().toLowerCase();
    const explicitChannel = action.type === 'send_telegram_bot'
      ? 'telegram'
      : configuredChannel === 'telegram' || configuredChannel === 'bale' || configuredChannel === 'rubika'
        ? configuredChannel
        : '';
    const directChannel = (explicitChannel || 'rubika') as 'bale' | 'telegram' | 'rubika';
    const [renderedTitle, renderedMessage] = await Promise.all([
      renderTemplateAsync(String(config.title || ''), record, url, key, false, orgId, moduleId),
      renderTemplateAsync(String(config.message || ''), record, url, key, false, orgId, moduleId),
    ]);
    const text = [renderedTitle.trim(), renderedMessage.trim()].filter(Boolean).join('\n');
    const attachments = await resolveServerWorkflowMessageAttachments({ url, key, orgId, moduleId, recordId, config, record });
    const groupText = renderedMessage.trim() || (attachments.length > 0 ? 'پیوست ارسال شد' : '');
    if (!text && attachments.length === 0) return actionResult(action, 'skipped', 'متن و فایل پیام بات خالی است.');
    const effectiveText = text || 'پیوست ارسال شد';
    const preferredChannels = explicitChannel
      ? [directChannel] as const
      : WORKFLOW_BOT_CHANNEL_PRIORITY;
    const [directTargets, counterpartyTargets] = await Promise.all([
      resolveUnifiedBotTargets(
        url,
        key,
        orgId,
        moduleId,
        recipientConfig.recipientAssignees,
        recipientConfig.recipientFields,
        record,
        preferredChannels,
      ),
      resolveCounterpartyBotTargets(
        url,
        key,
        orgId,
        moduleId,
        record,
        recipientConfig.recipientFields,
        explicitChannel || null,
      ),
    ]);
    const targets = Array.from(new Map([
      ...directTargets.map((target) => [`${target.channel}:${target.chatId}`, { ...target, group: null }] as const),
      ...counterpartyTargets.map((target) => [`${target.channel}:${target.chatId}`, target] as const),
    ]).values());
    if (targets.length === 0) return actionResult(action, 'skipped', 'گیرنده بات پیدا نشد.', { recipient_count: 0 });

    const settingsByChannel = new Map<string, any>();
    const automatedSenderPayload = {
      workflow_action_type: action.type,
      workflow_action_id: action.id || null,
      source_type: 'workflow',
      message_source: String(config.message_source || '').trim() || 'workflow',
      sender_kind: String(config.sender_kind || '').trim() || 'system',
      sender_type: String(config.sender_type || '').trim() || 'system',
      sender_display_name: String(config.sender_display_name || '').trim() || 'پیام‌های سیستم',
      ai_generated: config.ai_generated === true,
      attachments,
    };
    let sentCount = 0;
    for (const target of targets) {
      if (!settingsByChannel.has(target.channel)) {
        settingsByChannel.set(target.channel, await getOrgBotSettings(url, key, orgId, target.channel));
      }
      const botSettings = settingsByChannel.get(target.channel);
      if (!botSettings) continue;
      const botGroup = target.group || await findServerBotGroup(url, key, orgId, target.channel, target.chatId);
      if (botGroup) {
        if (!groupText) continue;
        await sendAndArchiveAutomatedBotGroupMessage(url, key, orgId, botGroup, groupText, botSettings, automatedSenderPayload, attachments);
      } else {
        await sendBotMessageWithAttachments(url, key, target.chatId, effectiveText, botSettings, target.channel, attachments, automatedSenderPayload);
      }
      sentCount += 1;
    }
    if (sentCount === 0) return actionResult(action, 'skipped', 'تنظیمات بات برای گیرنده‌های پیدا شده فعال نیست.', { recipient_count: 0 });
    return actionResult(action, 'success', undefined, { recipient_count: sentCount });
  }

  // ── send_rubika_bot ───────────────────────────────────────────────────
  if (action.type === 'send_rubika_bot') {
    const recipientConfig = getWorkflowRecipientConfig(config);
    const [renderedTitle, renderedMessage] = await Promise.all([
      renderTemplateAsync(String(config.title || ''), record, url, key, false, orgId, moduleId),
      renderTemplateAsync(String(config.message || ''), record, url, key, false, orgId, moduleId),
    ]);
    const text = [renderedTitle.trim(), renderedMessage.trim()].filter(Boolean).join('\n');
    const attachments = await resolveServerWorkflowMessageAttachments({ url, key, orgId, moduleId, recordId, config, record });
    const groupText = renderedMessage.trim() || (attachments.length > 0 ? 'پیوست ارسال شد' : '');
    if (!text && attachments.length === 0) return actionResult(action, 'skipped', 'متن و فایل پیام روبیکا خالی است.');
    const effectiveText = text || 'پیوست ارسال شد';
    const botSettings = await getOrgBotSettings(url, key, orgId, 'rubika');
    if (!botSettings) return actionResult(action, 'skipped', 'تنظیمات روبیکا فعال نیست.');
    const chatIds = await resolveAssigneesToBotChatIds(url, key, orgId, recipientConfig.recipientAssignees, recipientConfig.recipientFields, record, 'rubika', moduleId);
    if (chatIds.length === 0) return actionResult(action, 'skipped', 'گیرنده روبیکا پیدا نشد.', { recipient_count: 0 });
    for (const chatId of chatIds) {
      const botGroup = await findServerBotGroup(url, key, orgId, 'rubika', chatId);
      if (botGroup) {
        if (!groupText) continue;
        await sendAndArchiveAutomatedBotGroupMessage(url, key, orgId, botGroup, groupText, botSettings, {
          workflow_action_type: action.type,
          workflow_action_id: action.id || null,
          source_type: 'workflow',
          message_source: 'workflow',
          sender_kind: 'system',
          sender_type: 'system',
        }, attachments);
      } else {
        await sendBotMessageWithAttachments(url, key, chatId, effectiveText, botSettings, 'rubika', attachments, {
          workflow_action_type: action.type,
          workflow_action_id: action.id || null,
          source_type: 'workflow',
        });
      }
    }
    return actionResult(action, 'success', undefined, { recipient_count: chatIds.length });
  }

  // ── lock_record ───────────────────────────────────────────────────────
  if (action.type === 'lock_record') {
    const targetScope = String(config.target_scope || 'current_record').trim();
    let targetModuleId = moduleId;
    let targetRecordId = recordId;
    const recurrence = parseObjectValue(record?.recurrence_info);
    const processRunId = String(record?.process_run_id || recurrence?.process_run_id || '').trim();

    if (targetScope === 'related_record') {
      const relationFieldKey = String(config.relation_field_key || '').trim();
      const processLinked = relationFieldKey.match(/^__linked__(.+?)__(.+)$/);
      const processLinks = parseObjectValue(record?.process_links || record?.process_link_map);
      targetModuleId = String(processLinked?.[1] || config.relation_module_id || '').trim();
      targetRecordId = processLinked
        ? String(processLinks?.[targetModuleId] || record?.[`__linked__${targetModuleId}__id`] || '').trim()
        : String(record?.[relationFieldKey] || '').trim();
    } else if (targetScope.startsWith('process_')) {
      targetModuleId = 'tasks';
      const tasks = processRunId
        ? await dbGet(url, key, `tasks?process_run_id=eq.${encodeURIComponent(processRunId)}&select=id,sort_order,process_node_key,recurrence_info&order=sort_order.asc`).catch(() => [])
        : [];
      const currentTaskId = String(record?.task_id || record?.__task__id || (moduleId === 'tasks' ? recordId : '')).trim();
      if (targetScope === 'process_current_task') {
        targetRecordId = currentTaskId;
      } else if (targetScope === 'process_previous_task') {
        const currentIndex = tasks.findIndex((item: any) => String(item?.id || '') === currentTaskId);
        targetRecordId = String(currentIndex > 0 ? tasks[currentIndex - 1]?.id || '' : '').trim();
      } else if (targetScope === 'process_specific_task') {
        const nodeKey = String(config.stage_node_key || '').trim();
        const target = tasks.find((item: any) => String(item?.process_node_key || parseObjectValue(item?.recurrence_info)?.process_node_key || '').trim() === nodeKey);
        targetRecordId = String(target?.id || '').trim();
      }
    }

    if (!targetModuleId || !targetRecordId) return actionResult(action, 'skipped', 'رکورد مقصد برای قفل پیدا نشد.');
    const existingLocks = await dbGet(
      url,
      key,
      `record_locks?org_id=eq.${encodeURIComponent(orgId)}&module_id=eq.${encodeURIComponent(targetModuleId)}&record_id=eq.${encodeURIComponent(targetRecordId)}&select=id&limit=1`,
    ).catch(() => []);
    if (existingLocks.length === 0) {
      const reason = (await renderTemplateAsync(String(config.reason || ''), record, url, key, false, orgId, moduleId)).trim();
      await dbInsert(url, key, 'record_locks', {
        org_id: orgId,
        module_id: targetModuleId,
        record_id: targetRecordId,
        locked_by: actorUserId || null,
        lock_reason: reason || null,
        source_type: String(config.source_type || '') === 'process_automation' ? 'process_automation' : 'workflow',
        source_id: String(action.id || '').trim() || null,
        metadata: { source: 'workflow_interval_runner' },
      });
    }
    return actionResult(action, 'success', undefined, { affected_count: 1, details: { target_module_id: targetModuleId } });
  }

  // ── update_record ─────────────────────────────────────────────────────
  if (action.type === 'update_record') {
    const fieldKey = String(config.field || '').trim();
    if (!fieldKey || !record?.id) return actionResult(action, 'skipped', 'فیلد یا رکورد مقصد برای بروزرسانی مشخص نیست.');
    const nextValue = await resolveConfiguredActionValue(config, record, url, key, orgId, moduleId);
    if (fieldKey.startsWith('__task__')) {
      await updateProcessTaskAutomationField(url, key, record, fieldKey, nextValue, actorUserId, orgId);
      return actionResult(action, 'success', undefined, { affected_count: 1, details: { field: fieldKey, target_module_id: 'tasks' } });
    }
    const processLinkedMeta = fieldKey.match(/^__linked__(.+?)__(.+)$/);
    const processLinks = parseObjectValue(record?.process_links || record?.process_link_map);
    const targetModuleId = String(processLinkedMeta?.[1] || moduleId).trim();
    const targetFieldKey = String(processLinkedMeta?.[2] || fieldKey).trim();
    const targetRecordId = processLinkedMeta
      ? String(processLinks?.[targetModuleId] || record?.[`__linked__${targetModuleId}__id`] || '').trim()
      : String(record.id);
    if (!targetRecordId) return actionResult(action, 'skipped', 'رکورد مقصد برای بروزرسانی پیدا نشد.');
    const patch = targetFieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY || targetFieldKey === 'assignee_id'
      ? normalizeWorkflowAssigneeValue(nextValue)
      : { [targetFieldKey]: nextValue };
    await updateRecord(url, key, targetModuleId, targetRecordId, patch, actorUserId, orgId);
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
      const mappedValue = await resolveServerFieldMappingValue(mapping, record, url, key, orgId, moduleId);
      if (tf === WORKFLOW_ASSIGNEE_FIELD_KEY || tf === 'assignee_id') {
        Object.assign(payload, normalizeWorkflowAssigneeValue(mappedValue));
      } else if (isSafeWorkflowMutationFieldKey(tf)) {
        payload[tf] = mappedValue;
      }
    }
    await createRecord(url, key, targetModuleId, orgId, payload, actorUserId);
    return actionResult(action, 'success', undefined, { affected_count: 1, details: { target_module_id: targetModuleId } });
  }

  // ── create_related_record ─────────────────────────────────────────────
  if (action.type === 'create_related_record') {
    const targetModuleId = String(config.target_module_id || '').trim();
    const sourceModuleId = String(config.source_module_id || moduleId).trim() || moduleId;
    const isProcessRelatedRecord = String(config.relation_field_key || '').trim() === '__process_run_link__';
    const processLinks = parseObjectValue(record?.process_links || record?.process_link_map);
    const sourceRecordId = sourceModuleId === moduleId
      ? String(record?.id || '').trim()
      : String(processLinks?.[sourceModuleId] || record?.[`__linked__${sourceModuleId}__id`] || '').trim();
    const relationFieldKey = String(config.relation_field_key || (targetModuleId === 'tasks' ? 'source_record_id' : '')).trim();
    if (!targetModuleId || !relationFieldKey || (!isProcessRelatedRecord && !sourceRecordId)) {
      return actionResult(action, 'skipped', 'تنظیمات ایجاد رکورد مرتبط کامل نیست.');
    }
    assertWorkflowMutationModule(targetModuleId);
    let processAttachment: { processRunId: string; targetModuleIds: Set<string> } | null = null;
    if (isProcessRelatedRecord) {
      processAttachment = await getProcessRelatedRecordAttachmentContext(url, key, orgId, record, targetModuleId);
    } else {
      assertWorkflowMutationModule(sourceModuleId);
      const sourceRows = await dbGet(
        url,
        key,
        `${getModuleTable(sourceModuleId)}?id=eq.${encodeURIComponent(sourceRecordId)}&org_id=eq.${encodeURIComponent(orgId)}&select=id&limit=1`,
      ).catch(() => []);
      if (sourceRows.length === 0) {
        return actionResult(action, 'skipped', 'رکورد مرجع در سازمان جاری پیدا نشد.');
      }
    }
    if (!isProcessRelatedRecord && targetModuleId !== 'tasks' && !isSafeWorkflowMutationFieldKey(relationFieldKey)) {
      return actionResult(action, 'skipped', 'فیلد ارتباط با رکورد مرجع معتبر نیست.');
    }
    const payload: Record<string, any> = isProcessRelatedRecord ? {} : { [relationFieldKey]: sourceRecordId };
    if (!isProcessRelatedRecord && targetModuleId === 'tasks') {
      payload.related_to_module = sourceModuleId;
      payload.source_record_id = sourceRecordId;
    }
    const mappings = Array.isArray(config.field_mappings) ? config.field_mappings : [];
    for (const mapping of mappings) {
      const tf = String(mapping?.field || '').trim();
      if (!tf || tf === relationFieldKey || (!isProcessRelatedRecord && targetModuleId === 'tasks' && ['source_record_id', 'related_to_module'].includes(tf))) continue;
      const mappedValue = await resolveServerFieldMappingValue(mapping, record, url, key, orgId, moduleId);
      if (tf === WORKFLOW_ASSIGNEE_FIELD_KEY || tf === 'assignee_id') {
        Object.assign(payload, normalizeWorkflowAssigneeValue(mappedValue));
      } else if (isSafeWorkflowMutationFieldKey(tf)) {
        payload[tf] = mappedValue;
      }
    }
    // پیوند اجباری باید پس از تمام mappingها تثبیت شود و هرگز توسط تنظیم کاربر تغییر نکند.
    if (!isProcessRelatedRecord) payload[relationFieldKey] = sourceRecordId;
    if (!isProcessRelatedRecord && targetModuleId === 'tasks') {
      payload.related_to_module = sourceModuleId;
      payload.source_record_id = sourceRecordId;
    }
    const created = await createRecord(url, key, targetModuleId, orgId, payload, actorUserId);
    if (processAttachment) {
      const createdRecordId = String(created?.id || '').trim();
      if (!createdRecordId) throw new Error('رکورد جدید ایجاد شد اما شناسه پیوند فرآیند برنگشت.');
      await attachCreatedRecordToProcessRun(
        url,
        key,
        orgId,
        processAttachment.processRunId,
        targetModuleId,
        createdRecordId,
      );
    }
    return actionResult(action, 'success', undefined, {
      affected_count: 1,
      details: { target_module_id: targetModuleId, process_related_record: isProcessRelatedRecord },
    });
  }

  // ── activate process stage ────────────────────────────────────────────
  if (
    action.type === 'activate_next_process_stage'
    || action.type === 'activate_specific_process_stage'
  ) {
    const recurrence = record?.recurrence_info && typeof record.recurrence_info === 'object'
      ? record.recurrence_info
      : {};
    let processRunId = String(record?.process_run_id || recurrence?.process_run_id || '').trim();
    if (!processRunId) {
      const templateId = String(config.template_id || '').trim();
      const recordId = String(record?.id || '').trim();
      if (!templateId || !recordId || !moduleId) {
        return actionResult(action, 'skipped', 'اجرای فرآیند برای فعال‌سازی مرحله پیدا نشد.');
      }
      const runIdResult = await callRpc(url, key, 'create_process_run_from_template', {
        p_org_id: orgId,
        p_template_id: templateId,
        p_module_id: moduleId,
        p_record_id: recordId,
        p_process_name: null,
        p_copied_mode: 'auto',
      });
      processRunId = Array.isArray(runIdResult)
        ? String(runIdResult[0] || '').trim()
        : String(runIdResult || '').trim();
    }
    if (!processRunId) return actionResult(action, 'skipped', 'اجرای فرآیند برای فعال‌سازی مرحله پیدا نشد.');

    const stages = await dbGet(
      url,
      key,
      `process_run_stages?process_run_id=eq.${processRunId}&select=id,stage_name,sort_order,process_node_key,process_lane_key,metadata&order=sort_order.asc`,
    ).catch(() => []);
    const nodeKeyOf = (stage: any) => String(
      stage?.process_node_key || stage?.metadata?.process_node_key || '',
    ).trim();
    const laneKeyOf = (stage: any) => String(
      stage?.process_lane_key || stage?.metadata?.process_lane_key || 'lane_1',
    ).trim() || 'lane_1';
    let nodeKeys: string[] = [];

    if (action.type === 'activate_specific_process_stage') {
      nodeKeys = (
        Array.isArray(config.stage_node_keys)
          ? config.stage_node_keys
          : [config.stage_node_key]
      ).map((value: any) => String(value || '').trim()).filter(Boolean);
    } else {
      const currentNodeKey = String(
        record?.process_node_key || recurrence?.process_node_key || record?.current_process_node_key || '',
      ).trim();
      const currentStage = stages.find((stage: any) => nodeKeyOf(stage) === currentNodeKey);
      if (currentStage) {
        const sameLane = stages
          .filter((stage: any) => laneKeyOf(stage) === laneKeyOf(currentStage))
          .sort((left: any, right: any) => Number(left?.sort_order || 0) - Number(right?.sort_order || 0));
        const currentIndex = sameLane.findIndex((stage: any) => nodeKeyOf(stage) === currentNodeKey);
        const directNext = currentIndex >= 0 ? sameLane[currentIndex + 1] : null;
        if (directNext) {
          nodeKeys = [nodeKeyOf(directNext)].filter(Boolean);
        } else {
          const graph = currentStage?.metadata?.process_graph || recurrence?.process_graph || {};
          const triggers = Array.isArray(graph?.triggers) ? graph.triggers : [];
          const targetLaneKeys = new Set(
            triggers
              .filter((trigger: any) => String(trigger?.sourceNodeKey || '').trim() === currentNodeKey)
              .flatMap((trigger: any) => Array.isArray(trigger?.targetLaneKeys) ? trigger.targetLaneKeys : [])
              .map((value: any) => String(value || '').trim())
              .filter(Boolean),
          );
          nodeKeys = Array.from(targetLaneKeys)
            .map((laneKey) => stages
              .filter((stage: any) => laneKeyOf(stage) === laneKey)
              .sort((left: any, right: any) => Number(left?.sort_order || 0) - Number(right?.sort_order || 0))[0])
            .filter(Boolean)
            .map(nodeKeyOf)
            .filter(Boolean);
        }
      }
    }

    if (nodeKeys.length === 0 && Array.isArray(config.target_lane_keys)) {
      const targetLaneKeys = new Set(
        config.target_lane_keys
          .map((value: any) => String(value || '').trim())
          .filter(Boolean),
      );
      nodeKeys = Array.from(targetLaneKeys)
        .map((laneKey) => stages
          .filter((stage: any) => laneKeyOf(stage) === laneKey)
          .sort((left: any, right: any) => Number(left?.sort_order || 0) - Number(right?.sort_order || 0))[0])
        .filter(Boolean)
        .map(nodeKeyOf)
        .filter(Boolean);
    }

    if (nodeKeys.length === 0) return actionResult(action, 'skipped', 'مرحله مقصد برای فعال‌سازی پیدا نشد.');
    await prepareProcessRunForAutomaticExecution(url, key, orgId, processRunId, record);
    const result = await callRpc(url, key, 'activate_process_run_nodes', {
      p_org_id: orgId,
      p_process_run_id: processRunId,
      p_node_keys: Array.from(new Set(nodeKeys)),
      p_actor_user_id: actorUserId || null,
    });
    return actionResult(action, 'success', undefined, {
      affected_count: Array.isArray(result?.created_task_ids) ? result.created_task_ids.length : nodeKeys.length,
      details: { process_run_id: processRunId, process_node_keys: nodeKeys },
    });
  }

  // ── execute_process ───────────────────────────────────────────────────
  if (action.type === 'execute_process') {
    const templateId = String(config.template_id || '').trim();
    if (!templateId || !record?.id) return actionResult(action, 'skipped', 'قالب فرآیند یا رکورد مقصد مشخص نیست.');
    const runIdResult = await callRpc(url, key, 'create_process_run_from_template', {
      p_org_id: orgId,
      p_template_id: templateId,
      p_module_id: moduleId,
      p_record_id: String(record.id),
      p_process_name: null,
      p_copied_mode: 'auto',
    });
    const processRunId = Array.isArray(runIdResult) ? String(runIdResult[0] || '').trim() : String(runIdResult || '').trim();
    if (actorUserId && processRunId) {
      await dbPatch(url, key, 'process_runs', `id=eq.${processRunId}&org_id=eq.${orgId}`, { created_by: actorUserId, updated_by: actorUserId, updated_at: new Date().toISOString() }).catch(() => {});
      await dbPatch(url, key, 'process_run_stages', `process_run_id=eq.${processRunId}`, { created_by: actorUserId, updated_by: actorUserId, updated_at: new Date().toISOString() }).catch(() => {});
    }
    if (processRunId) {
      await prepareProcessRunForAutomaticExecution(url, key, orgId, processRunId, record);
    }
    const activation = processRunId
      ? await activateAllProcessRunNodes(url, key, orgId, processRunId, actorUserId)
      : null;
    return actionResult(action, 'success', undefined, {
      affected_count: Math.max(1, Array.isArray(activation?.created_task_ids) ? activation.created_task_ids.length : 0),
      details: {
        template_id: templateId,
        process_run_id: processRunId,
        process_node_keys: activation?.process_node_keys || [],
        created_task_ids: activation?.created_task_ids || [],
        existing_task_ids: activation?.existing_task_ids || [],
      },
    });
  }

  // ── copy_process_template ─────────────────────────────────────────────
  if (action.type === 'copy_process_template') {
    const templateId = String(config.template_id || '').trim();
    if (!templateId || !record?.id) return actionResult(action, 'skipped', 'قالب فرآیند یا رکورد مقصد مشخص نیست.');
    const runIdResult = await callRpc(url, key, 'create_process_run_from_template', {
      p_org_id: orgId,
      p_template_id: templateId,
      p_module_id: moduleId,
      p_record_id: String(record.id),
      p_process_name: null,
      p_copied_mode: 'auto',
    });
    const processRunId = Array.isArray(runIdResult) ? String(runIdResult[0] || '').trim() : String(runIdResult || '').trim();
    if (actorUserId && processRunId) {
      await dbPatch(url, key, 'process_runs', `id=eq.${processRunId}&org_id=eq.${orgId}`, { created_by: actorUserId, updated_by: actorUserId, updated_at: new Date().toISOString() }).catch(() => {});
      await dbPatch(url, key, 'process_run_stages', `process_run_id=eq.${processRunId}`, { created_by: actorUserId, updated_by: actorUserId, updated_at: new Date().toISOString() }).catch(() => {});
    }
    return actionResult(action, 'success', undefined, {
      affected_count: processRunId ? 1 : 0,
      details: { template_id: templateId, process_run_id: processRunId },
    });
  }

  // ── publish_story ─────────────────────────────────────────────────────
  if (action.type === 'publish_story') {
    const content = (await renderTemplateAsync(String(config.content || config.text_template || ''), record, url, key, false, orgId, moduleId)).trim();
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

  // ── send to process stages ────────────────────────────────────────────
  if (action.type === 'send_to_next_stages' || action.type === 'send_to_specific_stage') {
    const fieldMeta = parseProcessNextStageFieldKey(String(config.field || '').trim());
    const fieldKey = fieldMeta?.fieldKey || String(config.field || '').trim();
    if (!fieldKey || !record?.id) return actionResult(action, 'skipped', 'فیلد مرحله مقصد مشخص نیست.');
    const processRunId = String(record.process_run_id || '').trim();
    if (!processRunId) return actionResult(action, 'skipped', 'فرآیند مرتبط با رکورد پیدا نشد.');
    const nextValue = await resolveConfiguredActionValue(config, record, url, key, orgId, moduleId);
    const tasks = await dbGet(url, key,
      `tasks?process_run_id=eq.${processRunId}&order=sort_order.asc&select=id,sort_order,status,process_node_key,recurrence_info`
    ).catch(() => []);
    let targetTask: any = null;
    let offset = 0;
    if (action.type === 'send_to_specific_stage') {
      const targetNodeKey = String(config.stage_node_key || '').trim();
      targetTask = tasks.find((task: any) => String(
        task?.process_node_key || task?.recurrence_info?.process_node_key || '',
      ).trim() === targetNodeKey);
    } else {
      const currentTaskId = String(record.task_id || record.id || '').trim();
      const currentIdx = tasks.findIndex((t: any) => String(t.id) === currentTaskId);
      offset = fieldMeta?.offset || parseInt(String(config.stage_offset || 1), 10) || 1;
      targetTask = tasks[currentIdx + offset];
    }
    if (!targetTask?.id) return actionResult(action, 'skipped', 'مرحله مقصد پیدا نشد.');
    await updateRecord(url, key, 'tasks', String(targetTask.id), { [fieldKey]: nextValue }, actorUserId);
    return actionResult(action, 'success', undefined, {
      affected_count: 1,
      details: {
        field: fieldKey,
        stage_offset: offset || null,
        stage_node_key: action.type === 'send_to_specific_stage' ? config.stage_node_key : null,
      },
    });
  }

  // ── send_email ────────────────────────────────────────────────────────
  if (action.type === 'send_email') {
    const subject = (await renderTemplateAsync(String(config.subject || ''), record, url, key, false, orgId, moduleId)).trim();
    const body = (await renderTemplateAsync(String(config.body || ''), record, url, key, false, orgId, moduleId)).trim();
    if (!subject && !body) return actionResult(action, 'skipped', 'موضوع و متن ایمیل خالی است.');
    const manuals: string[] = (Array.isArray(config.manual_emails) ? config.manual_emails : [])
      .map((v: any) => String(v || '').trim()).filter(Boolean);
    const fromFields: string[] = [];
    for (const fieldKey of (Array.isArray(config.recipient_fields) ? config.recipient_fields : [])) {
      const val = await resolveWorkflowFieldValue(url, key, String(fieldKey || '').trim(), record, orgId, moduleId);
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

const RETRYABLE_IDEMPOTENT_ACTIONS = new Set([
  'update_record',
  'lock_record',
  'activate_next_process_stage',
  'activate_specific_process_stage',
]);

const isTransientWorkflowError = (error: any) => {
  const text = `${String(error?.name || '')} ${String(error?.message || error || '')}`.toLowerCase();
  return /timeout|timed out|abort|temporar|connection|network|fetch failed|status 5\d\d|gateway|rate limit|429|502|503|504/.test(text);
};

async function executeActionWithRetry(
  action: WorkflowAction,
  record: Record<string, any>,
  moduleId: string,
  orgId: string,
  url: string,
  key: string,
  actorUserId: string | null,
): Promise<ActionExecutionResult> {
  const maxAttempts = RETRYABLE_IDEMPOTENT_ACTIONS.has(String(action?.type || '')) ? 3 : 1;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await executeAction(action, record, moduleId, orgId, url, key, actorUserId);
      return {
        ...result,
        details: {
          ...(result.details || {}),
          retry_attempts: attempt - 1,
        },
      };
    } catch (error: any) {
      lastError = error;
      if (attempt >= maxAttempts || !isTransientWorkflowError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 250 : 750));
    }
  }
  throw lastError;
}

// فقط تغییرهای ذاتاً idempotent می‌توانند پس از قطع worker بدون خطر دوباره اجرا شوند.
// برای ارسال‌ها و ایجاد رکورد، قطع ارتباط بعد از درخواست می‌تواند به معنای انجام شدن
// اثر بیرونی باشد؛ در آن حالت اجرا را قابل‌پیگیری نگه می‌داریم، نه اینکه کورکورانه تکرار کنیم.
const SAFE_TO_RECLAIM_ACTIONS = new Set([
  'update_record',
  'lock_record',
  'activate_next_process_stage',
  'activate_specific_process_stage',
]);

type DurableActionContext = {
  parentExecutionKey: string;
  actionIndex: number;
};

async function executeDurableAction(
  action: WorkflowAction,
  record: Record<string, any>,
  moduleId: string,
  orgId: string,
  url: string,
  key: string,
  actorUserId: string | null,
  context?: DurableActionContext,
): Promise<ActionExecutionResult> {
  if (!context?.parentExecutionKey) {
    return executeActionWithRetry(action, record, moduleId, orgId, url, key, actorUserId);
  }

  const actionType = String(action?.type || '').trim() || 'unknown';
  const actionKey = intervalJobDedupeKey('action-execution', context.parentExecutionKey, context.actionIndex, action?.id || actionType);
  const safeToReclaim = SAFE_TO_RECLAIM_ACTIONS.has(actionType);
  const claim = await callRpc(url, key, 'claim_workflow_action_execution', {
    p_org_id: orgId,
    p_execution_key: actionKey,
    p_parent_execution_key: context.parentExecutionKey,
    p_action_type: actionType,
    p_is_safe_to_reclaim: safeToReclaim,
  }) as string;

  if (claim === 'succeeded') {
    return actionResult(action, 'skipped', 'این اقدام قبلاً با موفقیت انجام شده است.', {
      durable_execution: 'already_succeeded',
    });
  }
  if (claim === 'in_progress') {
    throw new Error('اقدام هم‌اکنون توسط worker دیگری در حال اجرا است.');
  }
  if (claim !== 'claimed') {
    return actionResult(action, 'failed', 'نتیجه اقدام قبلی نامشخص است؛ برای جلوگیری از اجرای تکراری نیازمند پیگیری است.', {
      durable_execution: 'needs_attention',
    });
  }

  try {
    const result = await executeActionWithRetry(action, record, moduleId, orgId, url, key, actorUserId);
    await callRpc(url, key, 'complete_workflow_action_execution', {
      p_execution_key: actionKey,
      p_status: result.status === 'failed' ? 'failed' : 'succeeded',
      p_last_error: result.status === 'failed' ? result.message || null : null,
    });
    return result;
  } catch (error: any) {
    const errorMessage = String(error?.message || error || 'اجرای اقدام ناموفق بود.');
    const status = !safeToReclaim && isTransientWorkflowError(error) ? 'needs_attention' : 'failed';
    await callRpc(url, key, 'complete_workflow_action_execution', {
      p_execution_key: actionKey,
      p_status: status,
      p_last_error: errorMessage,
    }).catch(() => {});
    throw error;
  }
}

// ── Scheduled reports ─────────────────────────────────────────────────────────

function getReportScheduleConfig(report: ReportDefinitionRow): Record<string, any> {
  const config = report?.config && typeof report.config === 'object' ? report.config : {};
  const schedule = config.schedule && typeof config.schedule === 'object' ? config.schedule : {};
  return schedule as Record<string, any>;
}

function getReportScheduledDueAt(report: ReportDefinitionRow, now: Date): Date | null {
  const schedule = getReportScheduleConfig(report);
  if (schedule.enabled !== true) return null;
  const reportTime = parseIntervalAt(String(schedule.interval_at || '').trim());
  return getWorkflowScheduledDueAt({
    last_run_at: report.last_run_at || null,
    interval_value: Math.max(1, parseInt(String(schedule.interval_value || 1), 10) || 1),
    interval_unit: ['hour', 'day', 'week', 'month'].includes(String(schedule.interval_unit || '').toLowerCase())
      ? String(schedule.interval_unit || '').toLowerCase()
      : 'day',
    interval_at: reportTime ? String(schedule.interval_at).trim() : null,
    interval_first_run_at: String(schedule.first_run_at || '').trim() || null,
    interval_minute: reportTime?.minute ?? null,
    interval_allowed_from_hour: null,
    interval_allowed_to_hour: null,
    interval_day_of_month: null,
    interval_day_condition: null,
    interval_days_after_holiday: null,
  } as WorkflowRow, now);
}

async function buildReportUrl(url: string, key: string, orgId: string, reportId: string): Promise<string> {
  const path = `/reports/${reportId}`;
  const baseUrl = await getOrgTenantBaseUrl(url, key, orgId);
  if (!baseUrl) throw new Error('دامنه اختصاصی سازمان برای ارسال گزارش تنظیم نشده است.');
  return `${baseUrl}${path}`;
}

async function buildShortScheduledReportUrl(url: string, key: string, orgId: string, reportId: string): Promise<string> {
  const targetUrl = await buildReportUrl(url, key, orgId, reportId);
  const baseUrl = await getOrgTenantBaseUrl(url, key, orgId);
  try {
    const existing = await dbGet(
      url,
      key,
      `short_links?org_id=eq.${encodeURIComponent(orgId)}&link_type=eq.generic&metadata->>kind=eq.scheduled_report&metadata->>report_id=eq.${encodeURIComponent(reportId)}&is_active=eq.true&select=code&order=created_at.desc&limit=1`,
    );
    if (existing?.[0]?.code) return `${baseUrl}/r/${encodeURIComponent(String(existing[0].code))}`;
    const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const bytes = crypto.getRandomValues(new Uint8Array(7));
      const code = Array.from(bytes).map((value) => alphabet[value % alphabet.length]).join('');
      try {
        const inserted = await dbInsert(url, key, 'short_links', {
          org_id: orgId,
          code,
          link_type: 'generic',
          target_url: targetUrl,
          metadata: { kind: 'scheduled_report', report_id: reportId },
        });
        return `${baseUrl}/r/${encodeURIComponent(String(inserted?.code || code))}`;
      } catch (error: any) {
        if (/23505|duplicate|unique/i.test(String(error?.message || error))) continue;
        throw error;
      }
    }
  } catch (error) {
    console.warn('Could not create short scheduled report link', error);
  }
  return targetUrl;
}

const REPORT_MODULE_LABELS_FA: Record<string, string> = {
  billboards: 'تبلیغات محیطی', products_services: 'کالاها و خدمات', price_lists: 'لیست قیمت‌ها',
  product_bundles: 'پکیج‌ها', contacts: 'اشخاص', organizations: 'سازمان‌ها', invoices: 'فاکتورها',
  tasks: 'وظایف', activities: 'فعالیت‌ها', reports: 'گزارش‌ها', customers: 'مشتریان', suppliers: 'تأمین‌کنندگان',
  employees: 'کارکنان', leads: 'سرنخ‌ها', opportunities: 'فرصت‌ها', products: 'کالاها', services: 'خدمات',
  sales_invoices: 'فاکتورهای فروش', purchase_invoices: 'فاکتورهای خرید', receipts: 'دریافت‌ها', payments: 'پرداخت‌ها',
  projects: 'پروژه‌ها', contracts: 'قراردادها', warehouses: 'انبارها', inventory: 'موجودی کالا',
};

async function executeScheduledReport(url: string, key: string, report: ReportDefinitionRow): Promise<number> {
  const config = report?.config && typeof report.config === 'object' ? report.config as Record<string, any> : {};
  const moduleId = String(report.module_id || '').trim();
  const table = getModuleTable(moduleId);
  if (!moduleId || !table) return 0;
  const rowLimit = Math.min(500, Math.max(1, Number(config.row_limit || 200)));
  const rows = await dbGet(url, key, `${table}?org_id=eq.${encodeURIComponent(report.org_id)}&select=*&limit=${rowLimit}`).catch(() => []);
  const conditionsAll = Array.isArray(config.conditions_all) ? config.conditions_all : [];
  const conditionsAny = Array.isArray(config.conditions_any) ? config.conditions_any : [];
  if (conditionsAll.length === 0 && conditionsAny.length === 0) return rows.length;
  let count = 0;
  for (const row of rows) {
    if (await evaluateConditions(conditionsAll, conditionsAny, row, null, { url, key, orgId: report.org_id, moduleId })) count += 1;
  }
  return count;
}

async function buildScheduledReportMessage(url: string, key: string, report: ReportDefinitionRow, scheduledDueAt: Date): Promise<string> {
  const reportUrl = await buildShortScheduledReportUrl(url, key, report.org_id, report.id);
  const schedule = getReportScheduleConfig(report);
  const moduleLabel = String(schedule.module_label || '').trim() || REPORT_MODULE_LABELS_FA[String(report.module_id || '').trim()] || 'ماژول انتخاب‌شده';
  const executedCount = await executeScheduledReport(url, key, report);
  const executedAt = new Date();
  return [
    `گزارش دوره‌ای «${String(report.name || 'گزارش').trim()}» آماده مشاهده است.`,
    `ماژول: ${moduleLabel}`,
    `تعداد نتیجه: ${toPersianDigits(String(executedCount))}`,
    `زمان اجرا: ${formatJalaliDateTime(executedAt.toISOString())}`,
    `لینک گزارش: ${reportUrl}`,
  ].join('\n');
}

async function getScheduledReportRecipients(url: string, key: string, orgId: string, userIds: string[]) {
  if (userIds.length === 0) return [] as any[];
  return await dbGet(url, key, `profiles?org_id=eq.${encodeURIComponent(orgId)}&id=in.(${userIds.map(encodeURIComponent).join(',')})&select=id,email,mobile,mobile_1,mobile_2,is_active`).catch(() => []);
}

async function sendScheduledReportToBotGroups(url: string, key: string, orgId: string, groupIds: string[], text: string, reportId: string): Promise<number> {
  if (groupIds.length === 0) return 0;
  const rows = await dbGet(url, key, `counterparty_bot_groups?org_id=eq.${encodeURIComponent(orgId)}&id=in.(${groupIds.map(encodeURIComponent).join(',')})&status=eq.active&select=id,org_id,customer_id,supplier_id,employee_id,bot_chat_id,channel_type`).catch(() => []);
  const settingsByChannel = new Map<string, any>();
  let sentCount = 0;
  for (const row of rows) {
    const channel = String(row?.channel_type || '').trim().toLowerCase();
    const chatId = String(row?.bot_chat_id || '').trim();
    if (!chatId || !['bale', 'telegram', 'rubika'].includes(channel)) continue;
    if (!settingsByChannel.has(channel)) settingsByChannel.set(channel, await getOrgBotSettings(url, key, orgId, channel));
    const settings = settingsByChannel.get(channel);
    if (!settings) continue;
    await sendAndArchiveAutomatedBotGroupMessage(url, key, orgId, row as ServerBotGroupTarget, text, settings, {
      scheduled_report_id: reportId,
      source_type: 'scheduled_report',
      message_source: 'scheduled_report',
      sender_kind: 'system',
      sender_type: 'system',
    });
    sentCount += 1;
  }
  return sentCount;
}

async function deliverScheduledReport(
  url: string,
  key: string,
  report: ReportDefinitionRow,
  scheduledDueAt: Date,
): Promise<{ status: 'success' | 'skipped'; recipientCount: number; message?: string }> {
  const schedule = getReportScheduleConfig(report);
  const recipientUserIds = Array.from(new Set(
    (Array.isArray(schedule.recipient_user_ids) ? schedule.recipient_user_ids : [])
      .map((item: any) => String(item || '').trim())
      .filter(Boolean)
  ));
  const botGroupIds = Array.from(new Set(
    (Array.isArray(schedule.bot_group_ids) ? schedule.bot_group_ids : [])
      .map((item: any) => String(item || '').trim())
      .filter(Boolean)
  ));
  if (recipientUserIds.length === 0 && botGroupIds.length === 0) {
    return { status: 'skipped', recipientCount: 0, message: 'گیرنده‌ای برای ارسال دوره‌ای گزارش انتخاب نشده است.' };
  }

  const deliveryChannels = Array.from(new Set(
    (Array.isArray(schedule.delivery_channels) ? schedule.delivery_channels : ['note'])
      .map((item: any) => String(item || '').trim().toLowerCase())
      .filter(Boolean)
  ));
  const message = await buildScheduledReportMessage(url, key, report, scheduledDueAt);
  const recipients = await getScheduledReportRecipients(url, key, report.org_id, recipientUserIds);
  let deliveredCount = 0;
  const deliveryErrors: string[] = [];

  if (deliveryChannels.includes('note')) {
    await insertNote(url, key, {
      org_id: report.org_id, module_id: 'reports', record_id: report.id, content: message,
      mention_user_ids: recipientUserIds, mention_role_ids: [], source_type: 'system',
      metadata: { source_type: 'system', notification_surface: 'system_feed', requires_action: false, scheduled_report_id: report.id, report_module_id: report.module_id, scheduled_due_at: scheduledDueAt.toISOString(), runner_build: FUNCTION_BUILD },
    });
    deliveredCount += recipientUserIds.length;
  }
  if (deliveryChannels.includes('email')) {
    const emails = Array.from(new Set(recipients.filter(isActiveProfileRow).map((item: any) => String(item?.email || '').trim()).filter((item: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))));
    if (emails.length > 0) {
      const response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/send-email`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ to: emails, subject: `گزارش دوره‌ای: ${String(report.name || 'گزارش').trim()}`, body: message, org_id: report.org_id }), signal: AbortSignal.timeout(30000) });
      if (!response.ok) deliveryErrors.push(`ایمیل: ${await response.text().catch(() => String(response.status))}`);
      else deliveredCount += emails.length;
    }
  }
  if (deliveryChannels.includes('sms')) {
    const phones = Array.from(new Set(recipients.filter(isActiveProfileRow).flatMap((item: any) => [item.mobile_1, item.mobile_2, item.mobile]).map(normalizePhone).filter(isValidIranMobile)));
    const smsSettings = await getOrgSmsSettings(url, key, report.org_id);
    if (phones.length > 0 && smsSettings) {
      try {
        const sentRecipients = await sendSmsViaProvider(smsSettings, phones, message, url, key);
        deliveredCount += sentRecipients.length;
        await auditSmsBatch(url, key, {
          orgId: report.org_id,
          moduleId: 'reports',
          recordId: report.id,
          recipients: sentRecipients,
          text: message,
          status: 'provider_accepted',
          metadata: {
            source_type: 'scheduled_report',
            scheduled_report_id: report.id,
            report_module_id: report.module_id,
            scheduled_due_at: scheduledDueAt.toISOString(),
          },
        });
      } catch (error: any) {
        await auditSmsBatch(url, key, {
          orgId: report.org_id,
          moduleId: 'reports',
          recordId: report.id,
          recipients: phones,
          text: message,
          status: 'failed',
          errorMessage: String(error?.message || error),
          metadata: { source_type: 'scheduled_report', scheduled_report_id: report.id },
        });
        throw error;
      }
    }
  }
  if (deliveryChannels.includes('bot_group')) {
    deliveredCount += await sendScheduledReportToBotGroups(url, key, report.org_id, botGroupIds, message, report.id);
  }
  // ممکن است یک کانال (مثلاً یادداشت) پیش از کانال ناموفق تحویل شده باشد.
  // retry کل گزارش در این نقطه می‌تواند همان پیام را دوباره برساند، پس وضعیت را
  // شفاف و قابل پیگیری نگه می‌داریم تا ارسال موفق قبلی تکرار نشود.
  if (deliveryErrors.length > 0) {
    throw new Error(`بخشی از ارسال گزارش ناموفق بود و برای جلوگیری از تکرار نیازمند پیگیری است: ${deliveryErrors.join(' | ')}`);
  }
  return deliveredCount > 0
    ? { status: 'success', recipientCount: deliveredCount }
    : { status: 'skipped', recipientCount: 0, message: deliveryErrors[0] || 'هیچ ارسال معتبری برای روش‌های انتخاب‌شده انجام نشد.' };
}

async function runScheduledReportsTick(url: string, key: string, now: Date): Promise<Record<string, number>> {
  const stats = { checkedReports: 0, claimedReports: 0, queuedReports: 0, failedReports: 0 };
  const reports = await fetchQueuedReports(url, key).catch((error) => {
    console.warn('[workflow-runner] Scheduled report fetch failed:', error?.message || error);
    return [] as ReportDefinitionRow[];
  });
  stats.checkedReports = reports.length;

  for (const report of reports) {
    const scheduledDueAt = getReportScheduledDueAt(report, now);
    if (!scheduledDueAt) {
      await clearReportServerQueued(url, key, report.id);
      continue;
    }

    const claimed = await claimReportScheduleRun(url, key, report.id, report.last_run_at, scheduledDueAt);
    if (!claimed) continue;
    stats.claimedReports++;

    try {
      await enqueueIntervalJob(url, key, {
        org_id: report.org_id,
        job_kind: 'scheduled_report_delivery',
        dedupe_key: intervalJobDedupeKey('scheduled-report-delivery', report.id, scheduledDueAt.toISOString()),
        workflow_id: null,
        module_id: String(report.module_id || '').trim() || null,
        record_id: null,
        scheduled_due_at: scheduledDueAt.toISOString(),
        page_offset: 0,
        action_index: null,
        max_attempts: 3,
        payload: { report },
      });
      stats.queuedReports++;
    } catch (error: any) {
      stats.failedReports++;
      const errorMessage = String(error?.message || 'scheduled report delivery failed');
      console.error(`[workflow-runner] Scheduled report failed (${report.name || report.id}):`, errorMessage);
      await dbPatch(url, key, 'report_definitions', `id=eq.${report.id}`, {
        schedule_error: errorMessage,
      }).catch(() => {});
    }
  }

  return stats;
}

// ── Main execution loop ───────────────────────────────────────────────────────

type WorkflowIntervalJob = {
  id: string;
  org_id: string;
  job_kind: 'workflow_scan' | 'workflow_action' | 'process_automation_interval' | 'scheduled_report_delivery';
  workflow_id: string | null;
  module_id: string | null;
  record_id: string | null;
  scheduled_due_at: string;
  page_offset: number;
  action_index: number | null;
  payload: Record<string, any>;
  attempts: number;
  max_attempts: number;
};

const intervalJobDedupeKey = (...parts: any[]) => parts.map((part) => String(part ?? '').trim()).join('|');

async function enqueueIntervalJob(url: string, key: string, input: Record<string, any>) {
  return dbUpsert(url, key, 'workflow_interval_jobs', {
    ...input,
    status: 'pending',
    available_at: input.available_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, 'dedupe_key');
}

async function completeIntervalJob(
  url: string,
  key: string,
  job: WorkflowIntervalJob,
  status: 'succeeded' | 'failed' | 'skipped',
  result: Record<string, any> | null,
  errorMessage: string | null = null,
) {
  await dbPatch(url, key, 'workflow_interval_jobs', `id=eq.${encodeURIComponent(job.id)}`, {
    status,
    result,
    last_error: errorMessage,
    completed_at: new Date().toISOString(),
    locked_at: null,
    updated_at: new Date().toISOString(),
  });
}

async function retryOrFailIntervalJob(url: string, key: string, job: WorkflowIntervalJob, error: any) {
  const errorMessage = String(error?.message || error || 'اجرای job ناموفق بود.');
  const needsAttention = /نیازمند پیگیری|نتیجه اقدام قبلی نامشخص/i.test(errorMessage);
  if (!needsAttention && Number(job.attempts || 0) < Number(job.max_attempts || 3)) {
    const delaySeconds = Math.min(300, Math.max(5, 5 * (2 ** Math.max(0, Number(job.attempts || 1) - 1))));
    await dbPatch(url, key, 'workflow_interval_jobs', `id=eq.${encodeURIComponent(job.id)}`, {
      status: 'pending',
      available_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      locked_at: null,
      last_error: errorMessage,
      updated_at: new Date().toISOString(),
    });
    return 'retried';
  }
  await completeIntervalJob(url, key, job, 'failed', null, errorMessage);
  return 'failed';
}

async function enqueueWorkflowScanJobs(
  url: string,
  key: string,
  workflow: WorkflowRow,
  scheduledDueAt: Date,
) {
  const targetModuleIds = Array.from(new Set(
    workflow.scope_type === 'process_activator'
      && !String(workflow.process_source_node_key || '').trim()
      && Array.isArray(workflow.module_ids)
      ? workflow.module_ids
      : [workflow.module_id],
  )).map((value) => String(value || '').trim()).filter(Boolean);
  for (const targetModuleId of targetModuleIds) {
    await enqueueIntervalJob(url, key, {
      org_id: workflow.org_id,
      job_kind: 'workflow_scan',
      dedupe_key: intervalJobDedupeKey('scan', workflow.id, scheduledDueAt.toISOString(), targetModuleId, 0),
      workflow_id: workflow.id,
      module_id: targetModuleId,
      record_id: null,
      scheduled_due_at: scheduledDueAt.toISOString(),
      page_offset: 0,
      action_index: null,
      max_attempts: 3,
      payload: { workflow, target_module_id: targetModuleId },
    });
  }
}

async function runIntervalEnqueueTick(url: string, key: string): Promise<Record<string, any>> {
  const now = new Date();
  const stats = { checkedWorkflows: 0, queuedWorkflows: 0, queuedScans: 0 };
  const workflows = await fetchQueuedWorkflows(url, key);
  stats.checkedWorkflows = workflows.length;
  for (const workflow of workflows) {
    const scheduledDueAt = getWorkflowScheduledDueAt(workflow, now);
    if (!scheduledDueAt || !await checkIntervalDayCondition(workflow.interval_day_condition, scheduledDueAt, workflow.interval_days_after_holiday)) {
      await clearServerQueued(url, key, workflow.id);
      continue;
    }
    const claimed = await claimWorkflow(url, key, workflow.id, workflow.last_run_at, scheduledDueAt);
    if (!claimed) continue;
    await enqueueWorkflowScanJobs(url, key, workflow, scheduledDueAt);
    stats.queuedWorkflows += 1;
    stats.queuedScans += workflow.scope_type === 'process_activator' && Array.isArray(workflow.module_ids)
      ? workflow.module_ids.length
      : 1;
  }
  return stats;
}

async function processWorkflowScanJob(url: string, key: string, job: WorkflowIntervalJob) {
  const workflow = job.payload?.workflow as WorkflowRow;
  const moduleId = String(job.module_id || job.payload?.target_module_id || '').trim();
  if (!workflow?.id || !moduleId) throw new Error('اطلاعات اسکن گردش‌کار ناقص است.');
  const configuredRecordLimit = Number(workflow.batch_size) > 0
    ? Math.max(1, Math.min(50000, Number(workflow.batch_size)))
    : 50000;
  const offset = Math.max(0, Number(job.page_offset || 0));
  const pageSize = Math.max(1, Math.min(DEFAULT_BATCH_SIZE, configuredRecordLimit - offset));
  if (pageSize <= 0) return { scanned: 0, matched: 0, queuedActions: 0, complete: true };
  const table = getModuleTable(moduleId);
  const records = await fetchModuleRecordsPage(url, key, table, workflow.org_id, pageSize, offset);
  const conditionsAll = (Array.isArray(workflow.conditions_all) ? workflow.conditions_all : [])
    .filter((condition) => !['changed', 'changed_from', 'changed_to'].includes(String(condition?.operator || '')));
  const conditionsAny = (Array.isArray(workflow.conditions_any) ? workflow.conditions_any : [])
    .filter((condition) => !['changed', 'changed_from', 'changed_to'].includes(String(condition?.operator || '')));
  const actions = Array.isArray(workflow.actions) ? workflow.actions : [];
  const executionMode = String(workflow.execution_mode || 'first_match');
  const actorUserId = resolveWorkflowActorId(workflow);
  let matched = 0;
  let queuedActions = 0;
  for (const sourceRecord of records) {
    if (await shouldSkipWorkflowIntervalRecord(url, key, workflow.org_id, table, sourceRecord)) continue;
    const recordId = String(sourceRecord?.id || '').trim();
    if (!recordId) continue;
    const record = workflow.scope_type === 'process_activator'
      ? buildProcessActivatorRecordContext(moduleId, sourceRecord)
      : sourceRecord;
    if (!await evaluateConditions(conditionsAll, conditionsAny, record, null, {
      url,
      key,
      orgId: workflow.org_id,
      moduleId,
    })) continue;
    if (executionMode === 'first_match') {
      const existing = await dbGet(url, key,
        `workflow_logs?workflow_id=eq.${workflow.id}&run_type=eq.scheduled&module_id=eq.${moduleId}&status=eq.success&record_id=eq.${recordId}&select=id&limit=1`
      ).catch(() => []);
      if (existing.length > 0) continue;
    }
    matched += 1;
    if (actions.length === 0) {
      await insertWorkflowLog(url, key, {
        workflow_id: workflow.id,
        org_id: workflow.org_id,
        module_id: moduleId,
        record_id: recordId,
        run_type: 'scheduled',
        status: 'skipped',
        message: 'اقدامی برای اجرا تعریف نشده است.',
        details: { workflow_name: workflow.name, scheduled_due_at: job.scheduled_due_at, execution_queue: 'v2' },
      });
      continue;
    }
    for (const [actionIndex, action] of actions.entries()) {
      await enqueueIntervalJob(url, key, {
        org_id: workflow.org_id,
        job_kind: 'workflow_action',
        dedupe_key: intervalJobDedupeKey('action', workflow.id, job.scheduled_due_at, moduleId, recordId, actionIndex),
        workflow_id: workflow.id,
        module_id: moduleId,
        record_id: recordId,
        scheduled_due_at: job.scheduled_due_at,
        page_offset: 0,
        action_index: actionIndex,
        is_terminal_action: actionIndex === actions.length - 1,
        // اقدام‌های دارای اثر بیرونی (مانند پیامک) نباید در سطح job تکرار شوند.
        // retry امن و idempotent داخل executeActionWithRetry مدیریت می‌شود.
        max_attempts: 1,
        payload: { workflow, record, action, action_count: actions.length, actor_user_id: actorUserId },
      });
      queuedActions += 1;
    }
  }
  const nextOffset = offset + records.length;
  if (records.length === pageSize && nextOffset < configuredRecordLimit) {
    await enqueueIntervalJob(url, key, {
      org_id: workflow.org_id,
      job_kind: 'workflow_scan',
      dedupe_key: intervalJobDedupeKey('scan', workflow.id, job.scheduled_due_at, moduleId, nextOffset),
      workflow_id: workflow.id,
      module_id: moduleId,
      record_id: null,
      scheduled_due_at: job.scheduled_due_at,
      page_offset: nextOffset,
      action_index: null,
      max_attempts: 3,
      payload: job.payload,
    });
  }
  return { scanned: records.length, matched, queuedActions, next_offset: nextOffset };
}

async function finalizeWorkflowActionReport(url: string, key: string, job: WorkflowIntervalJob) {
  const workflowId = String(job.workflow_id || '').trim();
  const moduleId = String(job.module_id || '').trim();
  const recordId = String(job.record_id || '').trim();
  if (!workflowId || !moduleId || !recordId) return;
  const jobs = await dbGet(url, key,
    `workflow_interval_jobs?job_kind=eq.workflow_action&workflow_id=eq.${encodeURIComponent(workflowId)}&scheduled_due_at=eq.${encodeURIComponent(job.scheduled_due_at)}&module_id=eq.${encodeURIComponent(moduleId)}&record_id=eq.${encodeURIComponent(recordId)}&select=id,status,attempts,action_index,result,last_error,payload&order=action_index.asc`
  ) as Array<Record<string, any>>;
  if (jobs.length === 0 || jobs.some((item) => ['pending', 'running'].includes(String(item.status)))) return;

  const executionRunKey = intervalJobDedupeKey('report', workflowId, job.scheduled_due_at, moduleId, recordId);
  const reportJobFilter = `job_kind=eq.workflow_action&workflow_id=eq.${encodeURIComponent(workflowId)}&scheduled_due_at=eq.${encodeURIComponent(job.scheduled_due_at)}&module_id=eq.${encodeURIComponent(moduleId)}&record_id=eq.${encodeURIComponent(recordId)}`;
  const existing = await dbGet(url, key,
    `workflow_logs?execution_run_key=eq.${encodeURIComponent(executionRunKey)}&select=id&limit=1`
  ).catch(() => []);
  if (existing.length > 0) {
    await dbPatch(url, key, 'workflow_interval_jobs', reportJobFilter, { report_logged_at: new Date().toISOString() });
    return;
  }

  const actionResults = jobs.map((item) => item.result?.action_result || {
    type: String(item.payload?.action?.type || ''),
    status: item.status === 'failed' ? 'failed' : item.status,
    message: item.last_error || undefined,
  });
  const failed = actionResults.filter((item: any) => item?.status === 'failed');
  const succeeded = actionResults.filter((item: any) => item?.status === 'success');
  const workflow = jobs[0]?.payload?.workflow || job.payload?.workflow || {};
  await dbUpsert(url, key, 'workflow_logs', {
    workflow_id: workflowId,
    execution_run_key: executionRunKey,
    org_id: job.org_id,
    module_id: moduleId,
    record_id: recordId,
    run_type: 'scheduled',
    status: failed.length > 0 ? 'failed' : succeeded.length > 0 ? 'success' : 'skipped',
    message: failed.map((item: any) => String(item?.message || '')).filter(Boolean).join(' | ') || null,
    details: {
      workflow_name: String(workflow?.name || '').trim() || null,
      record_title: getServerRecordTitle(job.payload?.record || {}),
      execution_mode: String(workflow?.execution_mode || 'first_match'),
      scheduled_due_at: job.scheduled_due_at,
      action_count: jobs.length,
      action_results: actionResults,
      execution_run_key: executionRunKey,
      execution_queue: 'v2',
      queue_job_ids: jobs.map((item) => item.id),
      queue_attempts: jobs.reduce((sum, item) => sum + Number(item.attempts || 0), 0),
      actor_id: job.payload?.actor_user_id || null,
      runner_build: FUNCTION_BUILD,
    },
  }, 'execution_run_key');
  await dbPatch(url, key, 'workflow_interval_jobs', reportJobFilter, { report_logged_at: new Date().toISOString() });
}

async function processWorkflowActionJob(url: string, key: string, job: WorkflowIntervalJob) {
  const workflow = job.payload?.workflow as WorkflowRow;
  const action = job.payload?.action as WorkflowAction;
  const record = job.payload?.record as Record<string, any>;
  const moduleId = String(job.module_id || '').trim();
  if (!workflow?.id || !action || !record || !moduleId) throw new Error('اطلاعات اقدام گردش‌کار ناقص است.');
  const actionResultValue = await executeDurableAction(
    action, record, moduleId, job.org_id, url, key, job.payload?.actor_user_id || null,
    { parentExecutionKey: `interval-job:${job.id}`, actionIndex: Number(job.action_index || 0) },
  );
  await completeIntervalJob(url, key, job, 'succeeded', { action_result: actionResultValue });
  await finalizeWorkflowActionReport(url, key, job).catch((error) => {
    console.warn('[workflow-runner] Queue report will be reconciled:', error?.message || error);
  });
  return actionResultValue;
}

async function processProcessAutomationIntervalJob(url: string, key: string, job: WorkflowIntervalJob) {
  const taskId = String(job.record_id || job.payload?.task_id || '').trim();
  const rule = job.payload?.rule;
  if (!taskId || !rule || typeof rule !== 'object') throw new Error('اطلاعات اجرای زمان‌دار اتوماسیون فعالیت ناقص است.');
  const taskRows = await dbGet(url, key, `tasks?id=eq.${encodeURIComponent(taskId)}&org_id=eq.${encodeURIComponent(job.org_id)}&select=*&limit=1`);
  const task = taskRows[0];
  if (!task || ['done', 'completed'].includes(String(task?.status || '').trim().toLowerCase())) {
    await completeIntervalJob(url, key, job, 'skipped', { reason: 'task_unavailable_or_completed' });
    return { skipped: true };
  }
  const result = await runServerProcessAutomationRules(
    url,
    key,
    task,
    null,
    'interval',
    [rule],
    null,
    `process-interval-job:${job.id}`,
  );
  await completeIntervalJob(url, key, job, result.succeeded > 0 ? 'succeeded' : 'skipped', { process_automation: result });
  return result;
}

async function processScheduledReportDeliveryJob(url: string, key: string, job: WorkflowIntervalJob) {
  const report = job.payload?.report as ReportDefinitionRow | undefined;
  if (!report?.id || !report?.org_id) throw new Error('اطلاعات ارسال گزارش زمان‌دار ناقص است.');

  const executionKey = intervalJobDedupeKey('scheduled-report-action', job.id);
  const claim = await callRpc(url, key, 'claim_workflow_action_execution', {
    p_org_id: job.org_id,
    p_execution_key: executionKey,
    p_parent_execution_key: `scheduled-report-job:${job.id}`,
    p_action_type: 'scheduled_report_delivery',
    p_is_safe_to_reclaim: false,
  }) as string;
  if (claim === 'succeeded') {
    await completeIntervalJob(url, key, job, 'skipped', { reason: 'already_delivered' });
    return { status: 'skipped', message: 'این گزارش قبلاً تحویل شده است.' };
  }
  if (claim === 'in_progress') {
    throw new Error('ارسال گزارش هم‌اکنون توسط worker دیگری در حال اجرا است.');
  }
  if (claim !== 'claimed') {
    throw new Error('نتیجه اقدام قبلی نامشخص است؛ برای جلوگیری از اجرای تکراری نیازمند پیگیری است.');
  }

  try {
    const result = await deliverScheduledReport(url, key, report, new Date(job.scheduled_due_at));
    await callRpc(url, key, 'complete_workflow_action_execution', {
      p_execution_key: executionKey,
      p_status: 'succeeded',
      p_last_error: null,
    });
    await completeIntervalJob(url, key, job, result.status === 'success' ? 'succeeded' : 'skipped', { scheduled_report: result });
    await dbPatch(url, key, 'report_definitions', `id=eq.${report.id}&org_id=eq.${encodeURIComponent(job.org_id)}`, {
      ...(result.status === 'success' ? { schedule_last_sent_at: new Date().toISOString() } : {}),
      schedule_error: result.status === 'success' ? null : result.message || 'ارسال دوره‌ای گزارش انجام نشد.',
    }).catch(() => {});
    await insertWorkflowLog(url, key, {
      workflow_id: null,
      org_id: job.org_id,
      module_id: String(report.module_id || '').trim() || 'reports',
      record_id: String(report.id),
      run_type: 'scheduled_report',
      status: result.status === 'success' ? 'success' : 'skipped',
      message: result.message,
      execution_run_key: `scheduled-report-report:${job.id}`,
      details: {
        report_name: String(report.name || '').trim() || 'گزارش زمان‌دار',
        record_title: String(report.name || '').trim() || 'گزارش زمان‌دار',
        scheduled_due_at: job.scheduled_due_at,
        delivery_result: result,
        execution_queue: 'v2',
        runner_build: FUNCTION_BUILD,
      },
    });
    return result;
  } catch (error: any) {
    const errorMessage = String(error?.message || error || 'ارسال گزارش زمان‌دار ناموفق بود.');
    const status = isTransientWorkflowError(error) || /نیازمند پیگیری|نتیجه اقدام قبلی نامشخص/i.test(errorMessage)
      ? 'needs_attention'
      : 'failed';
    await callRpc(url, key, 'complete_workflow_action_execution', {
      p_execution_key: executionKey,
      p_status: status,
      p_last_error: errorMessage,
    }).catch(() => {});
    throw error;
  }
}

async function processIntervalJob(url: string, key: string, job: WorkflowIntervalJob) {
  try {
    if (job.job_kind === 'workflow_scan') {
      const result = await processWorkflowScanJob(url, key, job);
      await completeIntervalJob(url, key, job, 'succeeded', result);
      return 'succeeded';
    }
    if (job.job_kind === 'process_automation_interval') {
      await processProcessAutomationIntervalJob(url, key, job);
      return 'succeeded';
    }
    if (job.job_kind === 'scheduled_report_delivery') {
      await processScheduledReportDeliveryJob(url, key, job);
      return 'succeeded';
    }
    await processWorkflowActionJob(url, key, job);
    return 'succeeded';
  } catch (error: any) {
    const status = await retryOrFailIntervalJob(url, key, job, error);
    if (job.job_kind === 'workflow_action' && status === 'failed') {
      await finalizeWorkflowActionReport(url, key, job).catch(() => {});
    }
    if (job.job_kind === 'scheduled_report_delivery' && status === 'failed') {
      const report = job.payload?.report as ReportDefinitionRow | undefined;
      await insertWorkflowLog(url, key, {
        workflow_id: null,
        org_id: job.org_id,
        module_id: String(report?.module_id || '').trim() || 'reports',
        record_id: String(report?.id || job.id),
        run_type: 'scheduled_report',
        status: 'failed',
        message: String(error?.message || error || 'ارسال گزارش زمان‌دار ناموفق بود.'),
        execution_run_key: `scheduled-report-report:${job.id}`,
        details: {
          report_name: String(report?.name || '').trim() || 'گزارش زمان‌دار',
          record_title: String(report?.name || '').trim() || 'گزارش زمان‌دار',
          scheduled_due_at: job.scheduled_due_at,
          execution_queue: 'v2',
          runner_build: FUNCTION_BUILD,
        },
      }).catch(() => {});
    }
    console.error(`[workflow-runner] Interval job failed (${job.id}):`, error?.message || error);
    return status;
  }
}

async function drainIntervalJobs(url: string, key: string): Promise<Record<string, number>> {
  const stats = { claimed: 0, succeeded: 0, retried: 0, failed: 0, reconciledReports: 0 };
  await callRpc(url, key, 'requeue_stale_workflow_interval_jobs', {}).catch(() => 0);
  const reportCandidates = await dbGet(url, key,
    'workflow_interval_jobs?job_kind=eq.workflow_action&is_terminal_action=eq.true&report_logged_at=is.null&status=in.(succeeded,failed,skipped)&select=*&order=completed_at.asc&limit=100'
  ).catch(() => []) as WorkflowIntervalJob[];
  for (const candidate of reportCandidates) {
    try {
      await finalizeWorkflowActionReport(url, key, candidate);
      stats.reconciledReports += 1;
    } catch (error: any) {
      console.warn('[workflow-runner] Queue report reconciliation failed:', candidate.id, error?.message || error);
    }
  }
  for (let wave = 0; wave < MAX_INTERVAL_JOB_WAVES; wave += 1) {
    const claimed = await callRpc(url, key, 'claim_workflow_interval_jobs', { p_limit: INTERVAL_JOB_CLAIM_LIMIT })
      .catch(() => []) as WorkflowIntervalJob[];
    if (!Array.isArray(claimed) || claimed.length === 0) break;
    stats.claimed += claimed.length;
    for (let offset = 0; offset < claimed.length; offset += INTERVAL_JOB_CONCURRENCY) {
      const results = await Promise.all(claimed.slice(offset, offset + INTERVAL_JOB_CONCURRENCY).map((job) => processIntervalJob(url, key, job)));
      for (const result of results) stats[result as 'succeeded' | 'retried' | 'failed'] += 1;
    }
  }
  // گزارش‌های جاافتادهٔ قدیمی در اولویت اجرای actionها نیستند. این کار را در
  // انتهای tick و با batch کوچک انجام می‌دهیم تا کندی آن ارسال‌های زمان‌دار را
  // متوقف نکند.
  const databaseReconciledReports = await callRpc(
    url,
    key,
    'reconcile_workflow_interval_execution_reports',
    { p_limit: 25 },
  ).catch((error) => {
    console.warn('[workflow-runner] Database interval report reconciliation failed:', error?.message || error);
    return 0;
  });
  stats.reconciledReports += Number(databaseReconciledReports || 0);
  return stats;
}

function workflowTargetsModule(workflow: WorkflowRow, moduleId: string): boolean {
  if (String(workflow?.module_id || '') === moduleId) return true;
  if (Array.isArray(workflow?.module_ids) && workflow.module_ids.map(String).includes(moduleId)) return true;
  return false;
}

function workflowTargetsSourceTable(workflow: WorkflowRow, sourceTable: string): boolean {
  const normalizedSourceTable = String(sourceTable || '').trim();
  if (!normalizedSourceTable) return false;
  const moduleIds = [workflow?.module_id, ...(Array.isArray(workflow?.module_ids) ? workflow.module_ids : [])]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return moduleIds.some((moduleId) => getModuleTable(moduleId) === normalizedSourceTable);
}

function resolveWorkflowModuleIdForSourceTable(workflow: WorkflowRow, sourceTable: string): string {
  const normalizedSourceTable = String(sourceTable || '').trim();
  const moduleIds = [workflow?.module_id, ...(Array.isArray(workflow?.module_ids) ? workflow.module_ids : [])]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return moduleIds.find((moduleId) => getModuleTable(moduleId) === normalizedSourceTable)
    || String(workflow?.module_id || sourceTable).trim()
    || normalizedSourceTable;
}

function shouldRunWorkflowForEvent(workflow: WorkflowRow, moduleId: string): boolean {
  if (!workflowTargetsModule(workflow, moduleId)) return false;
  if (workflow?.scope_type !== 'process_activator') return true;
  const sourceNodeKey = String(workflow?.process_source_node_key || '').trim();
  if (sourceNodeKey) return moduleId === 'tasks';
  return Array.isArray(workflow?.module_ids) && workflow.module_ids.map(String).includes(moduleId);
}

function shouldRunWorkflowForEventSourceTable(workflow: WorkflowRow, sourceTable: string): boolean {
  if (!workflowTargetsSourceTable(workflow, sourceTable)) return false;
  if (workflow?.scope_type !== 'process_activator') return true;
  const sourceNodeKey = String(workflow?.process_source_node_key || '').trim();
  if (sourceNodeKey) return sourceTable === 'tasks';
  return workflowTargetsSourceTable(workflow, sourceTable);
}

async function fetchWorkflowEventRecord(
  url: string,
  key: string,
  moduleId: string,
  recordId: string,
  fallbackRecord: Record<string, any> | null | undefined,
): Promise<{ table: string; record: Record<string, any> | null }> {
  const table = getModuleTable(moduleId);
  const normalizedRecordId = String(recordId || fallbackRecord?.id || '').trim();
  if (fallbackRecord && typeof fallbackRecord === 'object' && String(fallbackRecord?.id || '').trim() === normalizedRecordId) {
    return { table, record: fallbackRecord };
  }
  if (normalizedRecordId) {
    const rows = await dbGet(
      url,
      key,
      `${table}?id=eq.${encodeURIComponent(normalizedRecordId)}&select=*&limit=1`,
    ).catch((error) => {
      console.warn('[workflow-runner] Event record fetch failed:', error?.message || error);
      return [];
    });
    if (rows[0]) return { table, record: rows[0] };
  }
  return {
    table,
    record: fallbackRecord && typeof fallbackRecord === 'object' ? fallbackRecord : null,
  };
}

async function fetchEventWorkflows(
  url: string,
  key: string,
  orgId: string,
  moduleId: string,
  event: string,
): Promise<WorkflowRow[]> {
  const triggerTypes = event === 'create' ? 'on_create,on_upsert' : 'on_upsert';
  const rows = await dbGet(
    url,
    key,
    `workflows?org_id=eq.${encodeURIComponent(orgId)}&is_active=eq.true&trigger_type=in.(${triggerTypes})&select=*&limit=500`,
  ).catch((error) => {
    console.warn('[workflow-runner] Event workflow fetch failed:', error?.message || error);
    return [];
  });
  return (rows as WorkflowRow[]).filter((workflow) => (
    shouldRunWorkflowForEventSourceTable(workflow, moduleId)
  ));
}

async function claimEventFirstMatchExecution(
  url: string,
  key: string,
  orgId: string,
  workflowId: string,
  moduleId: string,
  recordId: string,
): Promise<boolean> {
  return await callRpc(url, key, 'claim_workflow_event_first_match_execution', {
    p_org_id: orgId,
    p_workflow_id: workflowId,
    p_module_id: moduleId,
    p_record_id: recordId,
    p_execution_key: intervalJobDedupeKey('event-first-match', workflowId, moduleId, recordId),
  }).catch((error) => {
    console.warn('[workflow-runner] Event first-match claim failed:', error?.message || error);
    return false;
  }) === true;
}

async function completeEventFirstMatchExecution(
  url: string,
  key: string,
  workflowId: string,
  moduleId: string,
  recordId: string,
  status: 'succeeded' | 'failed',
  errorMessage: string | null = null,
) {
  await callRpc(url, key, 'complete_workflow_event_first_match_execution', {
    p_execution_key: intervalJobDedupeKey('event-first-match', workflowId, moduleId, recordId),
    p_status: status,
    p_last_error: errorMessage,
  });
}

async function runEventTick(
  url: string,
  key: string,
  body: Record<string, any>,
): Promise<Record<string, any>> {
  const moduleId = String(body?.module_id || body?.moduleId || '').trim();
  const recordId = String(body?.record_id || body?.recordId || body?.record?.id || '').trim();
  const event = String(body?.event || 'upsert').trim() === 'create' ? 'create' : 'upsert';
  const providedRecord = body?.record && typeof body.record === 'object' ? body.record : null;
  const previousRecord = body?.previous_record && typeof body.previous_record === 'object'
    ? body.previous_record
    : body?.previousRecord && typeof body.previousRecord === 'object'
    ? body.previousRecord
    : null;
  const source = String(body?.source || 'workflow_event_runner').trim() || 'workflow_event_runner';
  const eventActorUserId = String(body?.actor_user_id || body?.actorUserId || '').trim() || null;

  if (!moduleId || !recordId) {
    throw new Error('module_id و record_id برای اجرای event لازم است.');
  }

  const { table, record } = await fetchWorkflowEventRecord(url, key, moduleId, recordId, providedRecord);
  if (!record?.id) {
    throw new Error('رکورد مقصد گردش کار پیدا نشد.');
  }

  const orgId = String(record?.org_id || providedRecord?.org_id || previousRecord?.org_id || '').trim();
  if (!orgId) {
    throw new Error('شناسه سازمان رکورد مقصد گردش کار مشخص نیست.');
  }

  const stats = {
    event,
    moduleId,
    recordId: String(record.id),
    checkedWorkflows: 0,
    matchedWorkflows: 0,
    executedActions: 0,
    failedRuns: 0,
    skippedRuns: 0,
  };

  if (await shouldSkipWorkflowIntervalRecord(url, key, orgId, table, record)) {
    stats.skippedRuns += 1;
    return stats;
  }

  const workflows = await fetchEventWorkflows(url, key, orgId, moduleId, event);
  stats.checkedWorkflows = workflows.length;

  for (const workflow of workflows) {
    const actions = Array.isArray(workflow.actions) ? workflow.actions : [];
    const recordIdForLog = String(record?.id || '').trim();
    // Keep the module id used in logs and action context compatible with the
    // configured module id (some modules use a camelCase id and snake_case table).
    const workflowModuleId = resolveWorkflowModuleIdForSourceTable(workflow, moduleId);
    let firstMatchClaimed = false;
    try {
      const matched = await evaluateConditions(
        Array.isArray(workflow.conditions_all) ? workflow.conditions_all : [],
        Array.isArray(workflow.conditions_any) ? workflow.conditions_any : [],
        record,
        previousRecord,
        { url, key, orgId, moduleId: workflowModuleId },
      );
      if (!matched) continue;
      stats.matchedWorkflows += 1;

      const executionMode = String(workflow.execution_mode || 'first_match');
      if (executionMode === 'first_match' && recordIdForLog) {
        firstMatchClaimed = await claimEventFirstMatchExecution(
          url,
          key,
          workflow.org_id,
          workflow.id,
          workflowModuleId,
          recordIdForLog,
        );
      }
      if (executionMode === 'first_match' && recordIdForLog && !firstMatchClaimed) {
        stats.skippedRuns += 1;
        await insertWorkflowLog(url, key, {
          workflow_id: workflow.id,
          org_id: workflow.org_id,
          module_id: workflowModuleId,
          record_id: recordIdForLog,
          run_type: 'event',
          status: 'skipped',
          message: 'این گردش کار قبلاً برای این رکورد اجرا شده است.',
          details: { source, event, runner_build: FUNCTION_BUILD },
          execution_run_key: body?.event_execution_key ? `event-report:${body.event_execution_key}:workflow:${workflow.id}` : null,
        });
        continue;
      }

      const actorUserId = resolveWorkflowActorId(workflow);
      const errors: string[] = [];
      const actionResults: ActionExecutionResult[] = [];
      for (const [actionIndex, action] of actions.entries()) {
        try {
          const result = await executeDurableAction(
            action as WorkflowAction,
            record,
            workflowModuleId,
            workflow.org_id,
            url,
            key,
            actorUserId,
            body?.event_execution_key
              ? { parentExecutionKey: `event:${body.event_execution_key}:workflow:${workflow.id}`, actionIndex }
              : undefined,
          );
          actionResults.push(result);
          if (result.status === 'success') stats.executedActions += 1;
          if (result.status === 'failed') {
            errors.push(result.message || String((action as any)?.type || 'action failed'));
            stats.failedRuns += 1;
          }
        } catch (error: any) {
          const errorMessage = String(error?.message || (action as any)?.type || 'action failed');
          errors.push(errorMessage);
          actionResults.push({
            action_type: String((action as any)?.type || ''),
            action_id: (action as any)?.id || null,
            status: 'failed',
            message: errorMessage,
          });
          stats.failedRuns += 1;
          console.error(`[workflow-runner] Event action failed (${workflow.name}/${(action as any)?.type}):`, error?.message || error);
        }
      }

      const hasFailedAction = actionResults.some((result) => result.status === 'failed');
      const hasSuccessfulAction = actionResults.some((result) => result.status === 'success');
      const runStatus = hasFailedAction ? 'failed' : hasSuccessfulAction ? 'success' : 'skipped';
      if (runStatus === 'skipped') stats.skippedRuns += 1;

      await insertWorkflowLog(url, key, {
        workflow_id: workflow.id,
        org_id: workflow.org_id,
        module_id: workflowModuleId,
        record_id: recordIdForLog,
        run_type: 'event',
        status: runStatus,
        message: errors.length > 0 ? errors.join(' | ') : (!hasSuccessfulAction ? 'هیچ اقدامی اجرا نشد یا گیرنده معتبر پیدا نشد.' : undefined),
        details: {
          source,
          event,
          workflow_name: workflow.name,
          action_count: actions.length,
          action_results: actionResults,
          record_title: getServerRecordTitle(record),
          runner_build: FUNCTION_BUILD,
          has_previous_record: previousRecord !== null,
        },
        execution_run_key: body?.event_execution_key ? `event-report:${body.event_execution_key}:workflow:${workflow.id}` : null,
      });

      if (runStatus === 'success') {
        await dbPatch(url, key, 'workflows', `id=eq.${workflow.id}`, { last_run_at: new Date().toISOString() }).catch(() => {});
      }
      if (firstMatchClaimed && recordIdForLog) {
        await completeEventFirstMatchExecution(
          url,
          key,
          workflow.id,
          workflowModuleId,
          recordIdForLog,
          runStatus === 'success' ? 'succeeded' : 'failed',
          errors.join(' | ') || null,
        );
      }
    } catch (error: any) {
      stats.failedRuns += 1;
      const errorMessage = String(error?.message || 'workflow event failed');
      console.error(`[workflow-runner] Event workflow failed (${workflow?.name || workflow?.id}):`, errorMessage);
      if (recordIdForLog) {
        await insertWorkflowLog(url, key, {
          workflow_id: workflow.id,
          org_id: workflow.org_id,
          module_id: workflowModuleId,
          record_id: recordIdForLog,
          run_type: 'event',
          status: 'failed',
          message: errorMessage,
          details: { source, event, runner_build: FUNCTION_BUILD },
          execution_run_key: body?.event_execution_key ? `event-report:${body.event_execution_key}:workflow:${workflow.id}` : null,
        });
      }
      if (firstMatchClaimed && recordIdForLog) {
        await completeEventFirstMatchExecution(
          url,
          key,
          workflow.id,
          workflowModuleId,
          recordIdForLog,
          'failed',
          errorMessage,
        ).catch(() => {});
      }
    }
  }

  if (table === 'tasks') {
    const processAutomationStats = await runServerProcessAutomationsForTaskEvent(
      url,
      key,
      record,
      previousRecord,
      event === 'create' ? 'create' : 'update',
      eventActorUserId,
      body?.event_execution_key ? `event:${body.event_execution_key}:process-automation` : null,
    );
    Object.assign(stats, { processAutomations: processAutomationStats });
    stats.failedRuns += Number(processAutomationStats?.failed || 0);
  }

  // صف رویدادی فقط زمانی موفق می‌شود که همهٔ گردش‌کارها و اتوماسیون‌های منطبق
  // نتیجهٔ قطعی داشته باشند. این خط مانع از «موفق» شدن پنهانی event با اقدام ناموفق است.
  if (stats.failedRuns > 0) {
    throw new Error('حداقل یک اقدام خودکار ناموفق یا نیازمند پیگیری است.');
  }

  return stats;
}

async function loadTaskSourceRecord(url: string, key: string, task: Record<string, any>) {
  const link = getTaskSourceLinkCore(task);
  if (!link.moduleId || !link.recordId) return { ...link, record: null as Record<string, any> | null };
  if (!WORKFLOW_MUTATION_MODULE_IDS.has(String(link.moduleId || '').trim())) return { ...link, record: null as Record<string, any> | null };
  const rows = await dbGet(url, key,
    `${getModuleTable(link.moduleId)}?id=eq.${encodeURIComponent(link.recordId)}&org_id=eq.${encodeURIComponent(String(task?.org_id || '').trim())}&select=*&limit=1`
  ).catch(() => []);
  return { ...link, record: rows[0] || null };
}

async function loadSiblingProcessTasks(url: string, key: string, task: Record<string, any>): Promise<Record<string, any>[]> {
  const recurrence = parseObjectValue(task?.recurrence_info);
  const processRunId = String(task?.process_run_id || recurrence?.process_run_id || '').trim();
  const processGroupId = String(task?.process_group_id || recurrence?.process_group?.id || '').trim();
  let path = '';
  if (processRunId) path = `tasks?process_run_id=eq.${encodeURIComponent(processRunId)}`;
  else if (processGroupId) path = `tasks?process_group_id=eq.${encodeURIComponent(processGroupId)}`;
  else {
    const source = getTaskSourceLinkCore(task);
    if (source.moduleId && source.recordId) {
      path = `tasks?source_module_id=eq.${encodeURIComponent(source.moduleId)}&source_record_id=eq.${encodeURIComponent(source.recordId)}`;
    }
  }
  if (!path) return [task];
  const rows = await dbGet(url, key, `${path}&select=*&order=sort_order.asc&limit=500`).catch(() => []);
  return rows.some((row: any) => String(row?.id || '') === String(task?.id || '')) ? rows : [...rows, task];
}

function buildProcessAutomationTaskRecord(
  task: Record<string, any>,
  sourceRecord: Record<string, any> | null,
  sourceModuleId: string,
  siblings: Record<string, any>[] = [],
) {
  const recurrence = parseObjectValue(task?.recurrence_info);
  const customValues = parseObjectValue(recurrence?.process_task_custom_field_values);
  const record: Record<string, any> = {
    ...(sourceRecord || {}),
    ...customValues,
    id: sourceRecord?.id || task?.id,
    org_id: task?.org_id || sourceRecord?.org_id,
    task_id: task?.id,
    task_name: task?.name,
    task_type: task?.task_type || recurrence?.task_type,
    task_status: task?.status,
    task_status_label: task?.status_label || task?.status,
    status_label: task?.status_label || task?.status,
    task_priority: task?.priority,
    task_due_date: task?.due_date,
    task_image_url: task?.image_url,
    source_module_id: sourceModuleId,
    source_record_id: sourceRecord?.id || task?.source_record_id,
    process_group_id: task?.process_group_id || recurrence?.process_group?.id,
    process_run_id: task?.process_run_id || recurrence?.process_run_id,
    process_run_stage_id: task?.process_run_stage_id || recurrence?.process_run_stage_id,
    process_node_key: getTaskProcessNodeKeyCore(task),
    process_lane_key: getTaskProcessLaneKeyCore(task),
    recurrence_info: recurrence,
  };
  const processIdentity = getTaskProcessIdentity(task);
  assignProcessAutomationIdentityContext(record, processIdentity.processName, processIdentity.laneName);
  Object.entries(task || {}).forEach(([field, value]) => { record[`__task__${field}`] = value; });
  Object.entries(customValues).forEach(([field, value]) => { record[field] = value; record[`__task__${field}`] = value; });
  const previousTasks = getAdjacentProcessTasksCore(task, siblings, 'previous');
  const nextTasks = getAdjacentProcessTasksCore(task, siblings, 'next');
  const previousTask = previousTasks[0] || null;
  const previousRecurrence = parseObjectValue(previousTask?.recurrence_info);
  const previousCustomValues = parseObjectValue(previousRecurrence?.process_task_custom_field_values);
  Object.entries(previousCustomValues).forEach(([field, value]) => { record[`previous_stage__${field}`] = value; });
  record.previous_stage__recurrence_info = previousRecurrence;
  record.previous_stage__image_url = previousTask?.image_url || null;
  record.__comm_recipient__current_task_assignee = taskRecipientTokenCore(task);
  record.__comm_recipient__previous_stage_assignee = taskRecipientTokenCore(previousTask);
  record.__comm_recipient__previous_stage_assignees = previousTasks.map(taskRecipientTokenCore).filter(Boolean);
  record.__comm_recipient__next_stage_assignee = taskRecipientTokenCore(nextTasks[0]);
  siblings.forEach((stage) => {
    const nodeKey = getTaskProcessNodeKeyCore(stage);
    if (nodeKey) record[`__comm_recipient__specific_process_stage__${nodeKey}`] = taskRecipientTokenCore(stage);
  });

  const processLinks = parseObjectValue(recurrence?.process_links);
  record.process_links = processLinks;
  if (sourceModuleId && sourceRecord) {
    Object.entries(sourceRecord).forEach(([field, value]) => {
      record[`__linked__${sourceModuleId}__${field}`] = value;
    });
    record[`__linked__${sourceModuleId}____workflow_assignee`] = sourceRecord?.assignee_role_id
      ? `role:${sourceRecord.assignee_role_id}`
      : sourceRecord?.assignee_id ? `user:${sourceRecord.assignee_id}` : null;
  }
  return record;
}

async function hydrateProcessLinkedFields(url: string, key: string, record: Record<string, any>) {
  const links = parseObjectValue(record?.process_links);
  for (const [moduleIdRaw, recordIdRaw] of Object.entries(links)) {
    const moduleId = String(moduleIdRaw || '').trim();
    const recordId = String(recordIdRaw || '').trim();
    const orgId = String(record?.org_id || '').trim();
    if (!moduleId || !recordId || !orgId || !WORKFLOW_MUTATION_MODULE_IDS.has(moduleId)) continue;
    const rows = await dbGet(url, key,
      `${getModuleTable(moduleId)}?id=eq.${encodeURIComponent(recordId)}&org_id=eq.${encodeURIComponent(orgId)}&select=*&limit=1`
    ).catch(() => []);
    const linked = rows[0];
    if (!linked) continue;
    Object.entries(linked).forEach(([field, value]) => { record[`__linked__${moduleId}__${field}`] = value; });
    record[`__linked__${moduleId}____workflow_assignee`] = linked?.assignee_role_id
      ? `role:${linked.assignee_role_id}`
      : linked?.assignee_id ? `user:${linked.assignee_id}` : null;
  }
}

async function hasSuccessfulProcessAutomationLog(url: string, key: string, ruleId: string, taskId: string) {
  const details = encodeURIComponent(JSON.stringify({ process_automation_rule_id: ruleId }));
  const rows = await dbGet(url, key,
    `workflow_logs?run_type=eq.process_automation&status=eq.success&module_id=eq.tasks&record_id=eq.${encodeURIComponent(taskId)}&details=cs.${details}&select=id&limit=1`
  ).catch(() => []);
  return rows.length > 0;
}

const processAutomationFirstMatchExecutionKey = (ruleId: string, taskId: string) =>
  `process-first-match:${ruleId}:${taskId}`;

async function claimProcessAutomationFirstMatchExecution(
  url: string,
  key: string,
  orgId: string,
  ruleId: string,
  taskId: string,
) {
  return await callRpc(url, key, 'claim_process_automation_first_match_execution', {
    p_org_id: orgId,
    p_rule_id: ruleId,
    p_task_id: taskId,
    p_execution_key: processAutomationFirstMatchExecutionKey(ruleId, taskId),
  }) === true;
}

async function completeProcessAutomationFirstMatchExecution(
  url: string,
  key: string,
  ruleId: string,
  taskId: string,
  status: 'succeeded' | 'failed',
  errorMessage: string | null = null,
) {
  await callRpc(url, key, 'complete_process_automation_first_match_execution', {
    p_execution_key: processAutomationFirstMatchExecutionKey(ruleId, taskId),
    p_status: status,
    p_last_error: errorMessage,
  });
}

async function runServerProcessAutomationRules(
  url: string,
  key: string,
  task: Record<string, any>,
  previousTask: Record<string, any> | null,
  event: ProcessAutomationEvent,
  candidateRules?: any[],
  actorUserId: string | null = null,
  executionKey: string | null = null,
) {
  const taskId = String(task?.id || '').trim();
  const orgId = String(task?.org_id || '').trim();
  const stats = { checked: 0, matched: 0, succeeded: 0, failed: 0, skipped: 0 };
  if (!taskId || !orgId) return stats;
  const recurrence = parseObjectValue(task?.recurrence_info);
  const rules = (candidateRules || getTaskProcessAutomationRulesCore(task));
  if (rules.length === 0) return stats;
  const [source, siblings] = await Promise.all([
    loadTaskSourceRecord(url, key, task),
    loadSiblingProcessTasks(url, key, task),
  ]);
  const actionRecord = buildProcessAutomationTaskRecord(task, source.record, source.moduleId, siblings);
  const previousActionRecord = previousTask ? buildProcessAutomationTaskRecord(previousTask, source.record, source.moduleId, siblings) : null;
  await hydrateProcessLinkedFields(url, key, actionRecord);
  if (previousActionRecord) await hydrateProcessLinkedFields(url, key, previousActionRecord);

  for (const rule of rules) {
    stats.checked += 1;
    const trigger = String(rule?.trigger_type || '').trim();
    if (event === 'interval' ? trigger !== 'interval' : event === 'previous_stage_completed' ? trigger !== 'previous_stage_completed' : trigger === 'interval' || trigger === 'previous_stage_completed') continue;
    if (trigger === 'on_create' && event !== 'create') continue;
    if (trigger === 'on_upsert' && !['create', 'update'].includes(event)) continue;
    const ruleId = String(rule?.id || '').trim();
    const conditionsAll = runnableProcessConditionsCore(rule?.conditions_all).map((condition: any) => ({
      ...condition,
      field: String(condition?.field || '').startsWith('__task__') ? String(condition.field) : String(condition.field),
    }));
    const conditionsAny = runnableProcessConditionsCore(rule?.conditions_any);
    if (!await evaluateProcessAutomationConditionsCore(
      conditionsAll,
      conditionsAny,
      actionRecord,
      previousActionRecord,
      evaluateConditionWithPrevious,
    )) continue;
    const firstMatch = String(rule?.execution_mode || 'every_match') === 'first_match' && Boolean(ruleId);
    if (firstMatch && !await claimProcessAutomationFirstMatchExecution(url, key, orgId, ruleId, taskId)) {
      stats.skipped += 1;
      continue;
    }
    stats.matched += 1;
    const targetTokens = resolveProcessAutomationTargetTokensCore(rule, task, siblings);
    const actions = Array.isArray(rule?.actions) ? rule.actions : [];
    const errors: string[] = [];
    const results: ActionExecutionResult[] = [];
    const targetModuleId = source.moduleId || 'tasks';
    for (const [actionIndex, action] of actions.entries()) {
      const actionConfig = action?.config && typeof action.config === 'object' ? action.config : {};
      const hasExplicitRecipient = (Array.isArray(actionConfig.recipient_assignees) && actionConfig.recipient_assignees.length > 0)
        || (Array.isArray(actionConfig.recipient_fields) && actionConfig.recipient_fields.length > 0);
      let shouldUseTargetFallback = !hasExplicitRecipient;
      if (
        (String(action?.type || '') === 'send_note' || String(action?.type || '') === 'send_note_sms')
        && Array.isArray(actionConfig.recipient_fields)
        && actionConfig.recipient_fields.length > 0
      ) {
        const resolved = await resolveAssigneesToMentionTargets(url, key, orgId, [], actionConfig.recipient_fields, actionRecord);
        shouldUseTargetFallback = resolved.mentionUserIds.length === 0
          && resolved.mentionRoleIds.length === 0
          && resolved.groupTargets.length === 0;
      }
      const serverAction = {
        ...action,
        config: {
          ...actionConfig,
          recipient_assignees: shouldUseTargetFallback ? targetTokens : (actionConfig.recipient_assignees || []),
          source_type: 'process_automation',
        },
      } as WorkflowAction;
      try {
        const result = await executeDurableAction(
          serverAction,
          actionRecord,
          targetModuleId,
          orgId,
          url,
          key,
          actorUserId,
          executionKey ? { parentExecutionKey: `${executionKey}:rule:${ruleId || 'anonymous'}`, actionIndex } : undefined,
        );
        results.push(result);
        if (result.status === 'failed') errors.push(result.message || String(action?.type || 'automation action failed'));
      } catch (error: any) {
        const errorMessage = String(error?.message || error || 'automation action failed');
        errors.push(errorMessage);
        results.push({
          action_type: String(action?.type || ''),
          action_id: String(action?.id || '').trim() || null,
          status: 'failed',
          message: errorMessage,
        });
      }
    }
    const hasFailedAction = results.some((result) => result.status === 'failed');
    const hasSuccessfulAction = results.some((result) => result.status === 'success');
    const status = hasFailedAction ? 'failed' : hasSuccessfulAction ? 'success' : 'skipped';
    await insertWorkflowLog(url, key, {
      workflow_id: null,
      org_id: orgId,
      module_id: 'tasks',
      record_id: taskId,
      run_type: 'process_automation',
      status,
      message: errors.length > 0
        ? errors.join(' | ')
        : (!hasSuccessfulAction ? 'هیچ اقدامی اجرا نشد یا گیرنده معتبر پیدا نشد.' : undefined),
      details: {
        process_automation_rule_id: ruleId || null,
        process_automation_rule_name: String(rule?.name || '').trim() || null,
        process_automation_trigger_type: trigger || null,
        process_automation_event: event,
        execution_mode: String(rule?.execution_mode || 'every_match'),
        record_title: getServerRecordTitle(task),
        process_run_id: String(task?.process_run_id || recurrence?.process_run_id || '').trim() || null,
        process_group_id: String(task?.process_group_id || recurrence?.process_group?.id || '').trim() || null,
        process_run_stage_id: String(task?.process_run_stage_id || recurrence?.process_run_stage_id || '').trim() || null,
        action_count: actions.length,
        action_results: results,
        actor_id: actorUserId,
        runner_build: FUNCTION_BUILD,
      },
      execution_run_key: executionKey && ruleId
        ? `process-automation-report:${executionKey}:rule:${ruleId}`
        : null,
    });
    if (firstMatch) {
      await completeProcessAutomationFirstMatchExecution(
        url,
        key,
        ruleId,
        taskId,
        status === 'success' ? 'succeeded' : 'failed',
        errors.join(' | ') || null,
      ).catch((error) => console.warn('[workflow-runner] process first-match claim completion failed:', error?.message || error));
    }
    if (status === 'success') stats.succeeded += 1;
    else if (status === 'failed') stats.failed += 1;
    else stats.skipped += 1;
  }
  return stats;
}

async function runServerProcessAutomationsForTaskEvent(
  url: string,
  key: string,
  task: Record<string, any>,
  previousTask: Record<string, any> | null,
  event: 'create' | 'update',
  actorUserId: string | null,
  executionKey: string | null = null,
) {
  const stats: Record<string, any> = await runServerProcessAutomationRules(
    url, key, task, previousTask, event, undefined, actorUserId, executionKey,
  );
  const becameCompleted = ['done', 'completed'].includes(String(task?.status || '').trim().toLowerCase())
    && !['done', 'completed'].includes(String(previousTask?.status || '').trim().toLowerCase());
  if (becameCompleted) {
    const siblings = await loadSiblingProcessTasks(url, key, task);
    const nextTasks = getAdjacentProcessTasksCore(task, siblings, 'next');
    for (const nextTask of nextTasks) {
      const nextRules = getTaskProcessAutomationRulesCore(nextTask).filter((rule: any) => String(rule?.trigger_type || '') === 'previous_stage_completed');
      if (nextRules.length > 0) {
        await runServerProcessAutomationRules(
          url,
          key,
          nextTask,
          null,
          'previous_stage_completed',
          nextRules,
          actorUserId,
          executionKey ? `${executionKey}:previous-stage:${String(nextTask?.id || '').trim()}` : null,
        );
      }
    }
  }
  return stats;
}

async function getLastProcessAutomationSuccessAt(url: string, key: string, ruleId: string, taskId: string) {
  const details = encodeURIComponent(JSON.stringify({ process_automation_rule_id: ruleId }));
  const rows = await dbGet(url, key,
    `workflow_logs?run_type=eq.process_automation&status=eq.success&module_id=eq.tasks&record_id=eq.${encodeURIComponent(taskId)}&details=cs.${details}&select=created_at&order=created_at.desc&limit=1`
  ).catch(() => []);
  return String(rows[0]?.created_at || '').trim() || null;
}

async function runServerProcessAutomationIntervalTick(url: string, key: string, now: Date) {
  const stats = { scannedTasks: 0, intervalCandidateTasks: 0, queuedJobs: 0, failedTasks: 0 };
  const pageSize = 100;
  for (let offset = 0; offset < MAX_PROCESS_AUTOMATION_INTERVAL_TASKS; offset += pageSize) {
    const currentPageSize = Math.min(pageSize, MAX_PROCESS_AUTOMATION_INTERVAL_TASKS - offset);
    const rows = await dbGet(url, key,
      `tasks?recurrence_info=not.is.null&status=not.in.(done,completed)&select=*&order=updated_at.desc&limit=${currentPageSize}&offset=${offset}`
    ).catch((error) => {
      console.warn('[workflow-runner] Process automation interval task fetch failed:', error?.message || error);
      return [];
    });
    if (rows.length === 0) break;
    for (const task of rows) {
      stats.scannedTasks += 1;
      const taskId = String(task?.id || '').trim();
      const rules = getTaskProcessAutomationRulesCore(task).filter((rule: any) => String(rule?.trigger_type || '').trim() === 'interval');
      if (rules.length === 0 || !taskId) continue;
      const dueRules: Array<{ rule: any; scheduledDueAt: Date; dedupeAnchor: string }> = [];
      for (const rule of rules) {
        const ruleId = String(rule?.id || '').trim();
        const lastRunAt = ruleId ? await getLastProcessAutomationSuccessAt(url, key, ruleId, taskId) : null;
        if (String(rule?.execution_mode || 'every_match') === 'first_match' && lastRunAt) continue;
        const scheduledDueAt = getWorkflowScheduledDueAt({
          last_run_at: lastRunAt,
          interval_value: Math.max(1, Number(rule?.interval_value || 1)),
          interval_unit: String(rule?.interval_unit || 'day'),
          interval_at: String(rule?.interval_at || '').trim() || null,
          interval_first_run_at: null,
          interval_minute: null,
          interval_allowed_from_hour: null,
          interval_allowed_to_hour: null,
          interval_day_of_month: null,
          interval_day_condition: null,
          interval_days_after_holiday: null,
        } as WorkflowRow, now);
        if (scheduledDueAt) {
          dueRules.push({
            rule,
            scheduledDueAt,
            // Before the first successful run there is no time anchor. A stable
            // key prevents concurrent workers from creating duplicate first jobs.
            dedupeAnchor: lastRunAt || 'initial',
          });
        }
      }
      if (dueRules.length === 0) continue;
      stats.intervalCandidateTasks += 1;
      for (const candidate of dueRules) {
        const ruleId = String(candidate.rule?.id || '').trim();
        if (!ruleId) continue;
        try {
          await enqueueIntervalJob(url, key, {
            org_id: String(task.org_id || '').trim(),
            job_kind: 'process_automation_interval',
            dedupe_key: intervalJobDedupeKey('process-automation-interval', taskId, ruleId, candidate.dedupeAnchor),
            workflow_id: null,
            module_id: 'tasks',
            record_id: taskId,
            scheduled_due_at: candidate.scheduledDueAt.toISOString(),
            page_offset: 0,
            action_index: null,
            max_attempts: 3,
            payload: { task_id: taskId, rule: candidate.rule },
          });
          stats.queuedJobs += 1;
        } catch (error: any) {
          stats.failedTasks += 1;
          console.warn('[workflow-runner] Process automation interval enqueue failed:', taskId, error?.message || error);
        }
      }
    }
    if (rows.length < currentPageSize) break;
  }
  return stats;
}

type WorkflowEventQueueRow = {
  id: string;
  org_id: string;
  source_table: string;
  record_id: string;
  event_type: 'create' | 'upsert';
  record_snapshot: Record<string, any> | null;
  previous_snapshot: Record<string, any> | null;
  attempts: number;
  actor_user_id?: string | null;
};

async function completeWorkflowEvent(
  url: string,
  key: string,
  eventId: string,
  status: 'succeeded' | 'failed',
  errorMessage: string | null = null,
): Promise<void> {
  await dbPatch(url, key, 'workflow_event_queue', `id=eq.${encodeURIComponent(eventId)}`, {
    status,
    completed_at: new Date().toISOString(),
    last_error: errorMessage,
  });
}

async function retryOrFailWorkflowEvent(
  url: string,
  key: string,
  queuedEvent: WorkflowEventQueueRow,
  error: any,
) {
  const errorMessage = String(error?.message || error || 'اجرای رویداد ناموفق بود.');
  const nextAttempt = Number(queuedEvent.attempts || 0) + 1;
  const needsAttention = /نیازمند پیگیری|نتیجه اقدام قبلی نامشخص/i.test(errorMessage);
  if (!needsAttention && nextAttempt < 5) {
    const delaySeconds = Math.min(300, Math.max(5, 5 * (2 ** Math.max(0, nextAttempt - 1))));
    await dbPatch(url, key, 'workflow_event_queue', `id=eq.${encodeURIComponent(queuedEvent.id)}`, {
      status: 'pending',
      available_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      claimed_at: null,
      completed_at: null,
      last_error: errorMessage,
    });
    return 'retried' as const;
  }
  await completeWorkflowEvent(url, key, queuedEvent.id, 'failed', errorMessage);
  return 'failed' as const;
}

async function runQueuedWorkflowEvents(url: string, key: string): Promise<Record<string, number>> {
  const stats = { scanned: 0, claimed: 0, succeeded: 0, retried: 0, failed: 0 };
  await callRpc(url, key, 'requeue_stale_workflow_events', {}).catch(() => 0);
  // PostgREST filters accept values, not SQL expressions. Passing `now()` here
  // makes the fetch fail and the catch below silently turns every event into an
  // empty queue. Use an explicit UTC timestamp; the claim RPC remains the final
  // atomic due-time guard.
  const dueAt = encodeURIComponent(new Date().toISOString());
  const rows = await dbGet(url, key,
    `workflow_event_queue?status=eq.pending&available_at=lte.${dueAt}&order=created_at.asc&limit=100`
  ).catch((error) => {
    console.warn('[workflow-runner] Event queue fetch failed:', error?.message || error);
    throw error;
  }) as WorkflowEventQueueRow[];

  for (const queuedEvent of rows) {
    stats.scanned += 1;
    const claimed = await callRpc(url, key, 'claim_workflow_event', { p_event_id: queuedEvent.id })
      .catch(() => false);
    if (claimed !== true) continue;
    stats.claimed += 1;
    try {
      await runEventTick(url, key, {
        module_id: queuedEvent.source_table,
        record_id: queuedEvent.record_id,
        event: queuedEvent.event_type,
        record: queuedEvent.record_snapshot || { id: queuedEvent.record_id, org_id: queuedEvent.org_id },
        previous_record: queuedEvent.previous_snapshot || null,
        actor_user_id: queuedEvent.actor_user_id || null,
        event_execution_key: queuedEvent.id,
        source: 'server_event_queue',
      });
      await completeWorkflowEvent(url, key, queuedEvent.id, 'succeeded');
      stats.succeeded += 1;
    } catch (error: any) {
      const message = String(error?.message || error || 'server workflow event failed');
      const result = await retryOrFailWorkflowEvent(url, key, queuedEvent, error).catch(() => 'failed' as const);
      stats[result] += 1;
      console.error('[workflow-runner] Event queue item failed:', queuedEvent.id, message);
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
    let body: Record<string, any> = {};
    if (req.method === 'POST') {
      body = await req.json().catch(() => ({}));
    }
    const action = String(body?.action || '').trim();
    // رویدادهای ثبت‌شدهٔ کاربر باید مستقل از اسکن‌های زمان‌دار تخلیه شوند.
    // claim_workflow_event هر آیتم را اتمیک claim می‌کند، پس هم‌پوشانی کنترل‌شده
    // بین این مسیر فوری و tick زمان‌دار، اجرای تکراری ایجاد نمی‌کند.
    const requiresExclusiveLease = action !== 'run_event' && action !== 'drain_events';
    let leaseToken: string | null = null;
    if (requiresExclusiveLease) {
      leaseToken = await acquireWorkflowRunnerLease(supabaseUrl, serviceRoleKey);
      if (!leaseToken) {
        return json(200, { ok: true, skipped: true, reason: 'runner_already_active' });
      }
    }
    try {
    if (action === 'drain_events') {
      if (!isServiceRole) return json(401, { ok: false, error: 'Unauthorized event queue runner' });
      const stats = await runQueuedWorkflowEvents(supabaseUrl, serviceRoleKey);
      return json(200, { ok: true, mode: 'event_queue', stats });
    }
    if (action === 'drain_interval_jobs') {
      if (!isServiceRole) return json(401, { ok: false, error: 'Unauthorized interval queue runner' });
      const stats = await drainIntervalJobs(supabaseUrl, serviceRoleKey);
      return json(200, { ok: true, mode: 'interval_queue', stats });
    }
    if (action === 'run_event') {
      if (!isServiceRole) return json(401, { ok: false, error: 'Unauthorized event runner' });
      const stats = await runEventTick(supabaseUrl, serviceRoleKey, body);
      console.log(`[workflow-runner] build=${FUNCTION_BUILD} eventStats=${JSON.stringify(stats)}`);
      return json(200, { ok: true, mode: 'event', stats });
    }

    // اول jobهای آماده و ارسال‌های زمان‌دار را انجام می‌دهیم. اسکن اتوماسیون
    // فعالیت‌ها در انتهای درخواست قرار دارد تا حتی در سازمان‌های پربار، پیامک
    // و گردش‌کارهای موعددار پشت یک اسکن طولانی معطل نمانند.
    const enqueueStats = await runIntervalEnqueueTick(supabaseUrl, serviceRoleKey);
    const scheduledReportStats = await runScheduledReportsTick(supabaseUrl, serviceRoleKey, new Date())
      .catch((error) => ({ error: String(error?.message || error || 'Scheduled report delivery failed') }));
    // گزارش‌های سررسیدشده پیش از تخلیه صف وارد job می‌شوند تا در همین tick
    // نیز فرصت اجرا داشته باشند، نه اینکه تا اجرای بعدی معطل بمانند.
    const intervalQueueStats = await drainIntervalJobs(supabaseUrl, serviceRoleKey)
      .catch((error) => ({ error: String(error?.message || error || 'Interval queue failed') }));
    const eventQueueStats = await runQueuedWorkflowEvents(supabaseUrl, serviceRoleKey)
      .catch((error) => ({ error: String(error?.message || error || 'Event queue failed') }));
    const processAutomationStats = await runServerProcessAutomationIntervalTick(
      supabaseUrl,
      serviceRoleKey,
      new Date(),
    ).catch((error) => ({ failed: true, error: String(error?.message || error) }));
    console.log(`[workflow-runner] build=${FUNCTION_BUILD} enqueueStats=${JSON.stringify(enqueueStats)} intervalQueueStats=${JSON.stringify(intervalQueueStats)} scheduledReportStats=${JSON.stringify(scheduledReportStats)} eventQueueStats=${JSON.stringify(eventQueueStats)} processAutomationStats=${JSON.stringify(processAutomationStats)}`);
    return json(200, { ok: true, stats: enqueueStats, intervalQueueStats, scheduledReportStats, eventQueueStats, processAutomationStats });
    } finally {
      if (leaseToken) {
        await releaseWorkflowRunnerLease(supabaseUrl, serviceRoleKey, leaseToken).catch((error) => {
          console.warn('[workflow-runner] Lease release failed:', error?.message || error);
        });
      }
    }
  } catch (e: any) {
    console.error('[workflow-runner] Fatal error:', e.message);
    return json(500, { ok: false, error: String(e?.message || 'internal error') });
  }
});
