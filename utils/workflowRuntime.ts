import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';
import { buildResolvedAssigneeCombo } from './assigneeValue';
import { sendBotMessageViaGateway } from './botGateway';
import { getHolidaySummaryForDate } from './holidayCalendar';
import { normalizeNoteScope } from './noteScope';
import { parseProcessLinkedFieldKey, parseProcessLinkMap } from './processTargets';
import { resolveWorkflowProcessDraftFieldKey } from './workflowHelpers';
import {
  parseWorkflowRelatedFieldKey,
  WORKFLOW_ASSIGNEE_FIELD_KEY,
  WorkflowAction,
  WorkflowCondition,
  WorkflowRecord,
} from './workflowTypes';
import { sendSmsViaGateway } from './smsGateway';
import { insertNotesWithFallback, sendNoteSmsNotifications } from './noteDispatch';
import { NoteAttachment, serializeNoteContent } from './noteContent';

type WorkflowEvent = 'create' | 'upsert';

type RunWorkflowArgs = {
  moduleId: string;
  event: WorkflowEvent;
  currentRecord: Record<string, any>;
  previousRecord?: Record<string, any> | null;
};

export type WorkflowEvaluationContext = {
  moduleId: string;
  relatedRecordCache: Map<string, Record<string, any> | null>;
  tagsCache: Map<string, string[]>;
};

export const createWorkflowEvaluationContext = (moduleId: string): WorkflowEvaluationContext => ({
  moduleId,
  relatedRecordCache: new Map(),
  tagsCache: new Map(),
});

const getModuleTable = (moduleId: string) => MODULES[moduleId]?.table || moduleId;

const toComparable = (value: any): any => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => toComparable(item));
  if (typeof value === 'object') return value;
  if (typeof value === 'boolean') return value;
  const num = Number(String(value).replace(/,/g, '').trim());
  if (!Number.isNaN(num) && String(value).trim() !== '') return num;
  return String(value).trim();
};

const asArray = (value: any): any[] => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  if (typeof value === 'string' && value.includes(',')) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [value];
};

const normalizeListValues = (value: any) =>
  asArray(value)
    .map((item) => String(toComparable(item) ?? '').trim())
    .filter(Boolean);

const isEmptyValue = (value: any) => {
  if (Array.isArray(value)) return value.length === 0;
  return value === null || value === undefined || value === '';
};

const toEnglishDigits = (input: string) =>
  input
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

const normalizePhone = (value: any): string => {
  const raw = toEnglishDigits(String(value ?? '').trim());
  if (!raw) return '';
  let digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';

  if (digits.startsWith('0098')) {
    digits = `0${digits.slice(4)}`;
  } else if (digits.startsWith('98')) {
    digits = `0${digits.slice(2)}`;
  } else if (digits.length === 10 && digits.startsWith('9')) {
    digits = `0${digits}`;
  }

  return digits;
};

const isValidIranMobile = (phone: string) => /^09\d{9}$/.test(String(phone || ''));

const parseDate = (value: any): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const daysDiffFromNow = (value: any): number | null => {
  const d = parseDate(value);
  if (!d) return null;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
};

const hoursDiffFromNow = (value: any): number | null => {
  const d = parseDate(value);
  if (!d) return null;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60);
};

const isSameDate = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const TEHRAN_TIME_ZONE = 'Asia/Tehran';

const DATE_TIME_LIKE_REGEX =
  /^\d{4}-\d{2}-\d{2}[tT ]\d{2}:\d{2}(:\d{2}(?:\.\d{1,6})?)?(?:[zZ]|[+-]\d{2}:?\d{2})?$/;

const toTehranDateTime = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;

  let date: Date | null = null;
  if (value instanceof Date) {
    date = Number.isNaN(value.getTime()) ? null : value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || !DATE_TIME_LIKE_REGEX.test(trimmed)) return null;
    const parsed = new Date(trimmed);
    date = Number.isNaN(parsed.getTime()) ? null : parsed;
  } else {
    return null;
  }
  if (!date) return null;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TEHRAN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = byType.year || '';
  const month = byType.month || '';
  const day = byType.day || '';
  const hour = byType.hour || '';
  const minute = byType.minute || '';
  if (!year || !month || !day || !hour || !minute) return null;
  return `${year}/${month}/${day} ${hour}:${minute}`;
};

export const formatWorkflowTemplateValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value
      .map((item) => formatWorkflowTemplateValue(item))
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return toTehranDateTime(value) || String(value);
};

const renderTemplate = (template: string, record: Record<string, any>) => {
  return String(template || '').replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, key: string) => {
    const fieldKey = String(key || '').trim();
    const val = record?.[fieldKey];
    return formatWorkflowTemplateValue(val);
  });
};

const renderTemplateWithBoldMarkers = (template: string, record: Record<string, any>) => {
  return String(template || '').replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, key: string) => {
    const fieldKey = String(key || '').trim();
    const val = record?.[fieldKey];
    if (val === null || val === undefined) return '';
    const resolved = formatWorkflowTemplateValue(val).trim();
    return resolved ? `**${resolved}**` : '';
  });
};

const ATTACHMENT_FILE_NAME_REGEX = /[^0-9a-zA-Z._\-\u0600-\u06FF]+/g;

const sanitizeAttachmentName = (value: string, fallback = 'file') => {
  const normalized = String(value || '').trim().replace(ATTACHMENT_FILE_NAME_REGEX, '_');
  return normalized || fallback;
};

const decodeAttachmentUrlName = (url: string) => {
  const cleanUrl = String(url || '').trim().split('?')[0].split('#')[0];
  const rawName = cleanUrl.split('/').pop() || '';
  if (!rawName) return '';
  try {
    return decodeURIComponent(rawName);
  } catch {
    return rawName;
  }
};

const looksLikeAttachmentUrl = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (/^(https?:\/\/|data:|blob:|\/)/i.test(raw)) return true;
  if (/^record_files\//i.test(raw)) return true;
  if (/^[\w\-./]+\.(png|jpe?g|gif|webp|bmp|svg|pdf|zip|rar|7z|docx?|xlsx?|pptx?)$/i.test(raw)) return true;
  return false;
};

const inferAttachmentMimeType = (source: string) => {
  const raw = String(source || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw.startsWith('data:image/')) {
    const match = raw.match(/^data:(image\/[^;,]+)/i);
    return match?.[1] || 'image/*';
  }
  const normalized = raw.split('?')[0].split('#')[0];
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.gif')) return 'image/gif';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.svg')) return 'image/svg+xml';
  if (normalized.endsWith('.pdf')) return 'application/pdf';
  return null;
};

const normalizeAttachmentObject = (
  value: any,
  fallbackName: string
): NoteAttachment[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeAttachmentObject(item, fallbackName));
  }

  if (typeof value === 'object') {
    const nestedAttachments = Array.isArray((value as any).attachments)
      ? (value as any).attachments.flatMap((item: any) => normalizeAttachmentObject(item, fallbackName))
      : [];
    if (nestedAttachments.length > 0) return nestedAttachments;

    const url = String((value as any).url || (value as any).file_url || (value as any).src || '').trim();
    if (!url || !looksLikeAttachmentUrl(url)) return [];
    const sourceName = String((value as any).name || (value as any).file_name || decodeAttachmentUrlName(url) || '').trim();
    const name = sanitizeAttachmentName(sourceName || fallbackName, fallbackName);
    const mimeType = String((value as any).mimeType || (value as any).mime_type || '').trim()
      || inferAttachmentMimeType(url)
      || null;
    return [{ name, url, mimeType }];
  }

  const raw = String(value || '').trim();
  if (!raw) return [];
  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const parsed = JSON.parse(raw);
      return normalizeAttachmentObject(parsed, fallbackName);
    } catch {
      // treat as plain string
    }
  }
  if (!looksLikeAttachmentUrl(raw)) return [];

  const sourceName = decodeAttachmentUrlName(raw);
  const name = sanitizeAttachmentName(sourceName || fallbackName, fallbackName);
  return [{
    name,
    url: raw,
    mimeType: inferAttachmentMimeType(raw),
  }];
};

const fetchRecordTags = async (
  moduleId: string,
  recordId: string,
  context: WorkflowEvaluationContext
) => {
  const cacheKey = `${moduleId}:${recordId}`;
  if (context.tagsCache.has(cacheKey)) {
    return context.tagsCache.get(cacheKey) || [];
  }

  const { data, error } = await supabase
    .from('record_tags')
    .select('tag_id')
    .eq('module_id', moduleId)
    .eq('record_id', recordId);
  if (error) throw error;

  const tagIds = (data || [])
    .map((row: any) => String(row?.tag_id || '').trim())
    .filter(Boolean);

  context.tagsCache.set(cacheKey, tagIds);
  return tagIds;
};

const copyRecordFilesToTask = async ({
  sourceModuleId,
  sourceRecordId,
  targetTaskId,
  orgId,
  userId,
}: {
  sourceModuleId: string;
  sourceRecordId: string;
  targetTaskId: string;
  orgId?: string | null;
  userId?: string | null;
}) => {
  try {
    const { data, error } = await supabase
      .from('record_files')
      .select('file_url, file_type, file_name, mime_type, sort_order')
      .eq('module_id', sourceModuleId)
      .eq('record_id', sourceRecordId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) return;

    const payload = rows.map((row: any, index: number) => ({
      org_id: orgId || null,
      module_id: 'tasks',
      record_id: targetTaskId,
      file_url: row?.file_url,
      file_type: row?.file_type || 'file',
      file_name: row?.file_name || null,
      mime_type: row?.mime_type || null,
      sort_order: Number.isFinite(row?.sort_order) ? row.sort_order : index,
      created_by: userId || null,
    }));
    const { error: insertError } = await supabase.from('record_files').insert(payload);
    if (insertError) throw insertError;
  } catch (error) {
    console.warn('Could not copy related record files to task', error);
  }
};

const fetchRelatedRecord = async (
  targetModuleId: string,
  recordId: string,
  context: WorkflowEvaluationContext
) => {
  const cacheKey = `${targetModuleId}:${recordId}`;
  if (context.relatedRecordCache.has(cacheKey)) {
    return context.relatedRecordCache.get(cacheKey) || null;
  }

  const { data, error } = await supabase
    .from(getModuleTable(targetModuleId))
    .select('*')
    .eq('id', recordId)
    .maybeSingle();
  if (error) throw error;

  const normalized = (data || null) as Record<string, any> | null;
  context.relatedRecordCache.set(cacheKey, normalized);
  return normalized;
};

const getProcessLinkMapFromRecord = (record: Record<string, any> | null | undefined) => {
  if (!record) return {};
  const recurrenceInfo = record?.recurrence_info && typeof record.recurrence_info === 'object'
    ? record.recurrence_info
    : null;
  return parseProcessLinkMap(
    record?.process_links
    || record?.process_link_map
    || recurrenceInfo?.process_links
  );
};

const resolveConditionFieldValue = async (
  fieldKey: string,
  record: Record<string, any> | null | undefined,
  moduleId: string,
  context: WorkflowEvaluationContext
): Promise<any> => {
  if (!record) return null;

  if (fieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY) {
    return buildResolvedAssigneeCombo(record);
  }

  if (fieldKey === 'tags') {
    const recordId = String(record?.id || '').trim();
    if (!recordId) return [];
    return fetchRecordTags(moduleId, recordId, context);
  }

  const processLinkedMeta = parseProcessLinkedFieldKey(fieldKey);
  if (processLinkedMeta) {
    const processLinks = getProcessLinkMapFromRecord(record);
    const linkedRecordId = String(processLinks?.[processLinkedMeta.moduleId] || '').trim();
    if (!linkedRecordId) {
      return processLinkedMeta.targetFieldKey === 'tags' ? [] : null;
    }

    const linkedRecord = await fetchRelatedRecord(
      processLinkedMeta.moduleId,
      linkedRecordId,
      context
    );
    if (!linkedRecord) {
      return processLinkedMeta.targetFieldKey === 'tags' ? [] : null;
    }

    if (processLinkedMeta.targetFieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY) {
      return buildResolvedAssigneeCombo(linkedRecord);
    }

    if (processLinkedMeta.targetFieldKey === 'tags') {
      return fetchRecordTags(processLinkedMeta.moduleId, linkedRecordId, context);
    }

    return linkedRecord?.[processLinkedMeta.targetFieldKey];
  }

  const relatedFieldMeta = parseWorkflowRelatedFieldKey(fieldKey);
  if (relatedFieldMeta) {
    const relationId = String(record?.[relatedFieldMeta.relationFieldKey] || '').trim();
    if (!relationId) {
      return relatedFieldMeta.targetFieldKey === 'tags' ? [] : null;
    }

    const relatedRecord = await fetchRelatedRecord(
      relatedFieldMeta.targetModuleId,
      relationId,
      context
    );
    if (!relatedRecord) {
      return relatedFieldMeta.targetFieldKey === 'tags' ? [] : null;
    }

    if (relatedFieldMeta.targetFieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY) {
      return buildResolvedAssigneeCombo(relatedRecord);
    }

    if (relatedFieldMeta.targetFieldKey === 'tags') {
      const relatedRecordId = String(relatedRecord?.id || '').trim();
      if (!relatedRecordId) return [];
      return fetchRecordTags(relatedFieldMeta.targetModuleId, relatedRecordId, context);
    }

    return relatedRecord?.[relatedFieldMeta.targetFieldKey];
  }

  return record?.[fieldKey];
};

const evaluateResolvedCondition = async (
  condition: WorkflowCondition,
  currentValue: any,
  previousValue: any
): Promise<boolean> => {
  const op = String(condition?.operator || 'eq');
  const expectedValue = condition?.value;

  const cv = toComparable(currentValue);
  const pv = toComparable(previousValue);
  const ev = toComparable(expectedValue);

  switch (op) {
    case 'eq': {
      if (Array.isArray(currentValue) || Array.isArray(expectedValue)) {
        const currentList = normalizeListValues(currentValue);
        const expectedList = normalizeListValues(expectedValue);
        return JSON.stringify(currentList.sort()) === JSON.stringify(expectedList.sort());
      }
      return String(cv ?? '') === String(ev ?? '');
    }
    case 'neq':
      return !(await evaluateResolvedCondition({ ...condition, operator: 'eq' }, currentValue, previousValue));
    case 'contains': {
      if (Array.isArray(currentValue)) {
        return normalizeListValues(currentValue).some((item) =>
          item.toLowerCase().includes(String(ev ?? '').toLowerCase())
        );
      }
      return String(cv ?? '').toLowerCase().includes(String(ev ?? '').toLowerCase());
    }
    case 'not_contains':
      return !(await evaluateResolvedCondition({ ...condition, operator: 'contains' }, currentValue, previousValue));
    case 'starts_with':
      return String(cv ?? '').toLowerCase().startsWith(String(ev ?? '').toLowerCase());
    case 'ends_with':
      return String(cv ?? '').toLowerCase().endsWith(String(ev ?? '').toLowerCase());
    case 'gt':
      return Number(cv) > Number(ev);
    case 'gte':
      return Number(cv) >= Number(ev);
    case 'lt':
      return Number(cv) < Number(ev);
    case 'lte':
      return Number(cv) <= Number(ev);
    case 'in': {
      const actualList = normalizeListValues(currentValue);
      const expectedList = normalizeListValues(expectedValue);
      if (actualList.length > 0) {
        return actualList.some((item) => expectedList.includes(item));
      }
      return expectedList.includes(String(cv ?? ''));
    }
    case 'not_in': {
      const actualList = normalizeListValues(currentValue);
      const expectedList = normalizeListValues(expectedValue);
      if (actualList.length > 0) {
        return !actualList.some((item) => expectedList.includes(item));
      }
      return !expectedList.includes(String(cv ?? ''));
    }
    case 'is_true':
      return !!currentValue === true;
    case 'is_false':
      return !!currentValue === false;
    case 'is_null':
      return isEmptyValue(currentValue);
    case 'not_null':
      return !isEmptyValue(currentValue);
    case 'changed':
      return JSON.stringify(cv ?? null) !== JSON.stringify(pv ?? null);
    case 'changed_from':
      return JSON.stringify(pv ?? null) === JSON.stringify(ev ?? null) &&
        JSON.stringify(cv ?? null) !== JSON.stringify(pv ?? null);
    case 'changed_to':
      return JSON.stringify(cv ?? null) === JSON.stringify(ev ?? null) &&
        JSON.stringify(cv ?? null) !== JSON.stringify(pv ?? null);
    case 'is_today': {
      const d = parseDate(currentValue);
      if (!d) return false;
      return isSameDate(d, new Date());
    }
    case 'is_yesterday': {
      const d = parseDate(currentValue);
      if (!d) return false;
      const y = new Date();
      y.setDate(y.getDate() - 1);
      return isSameDate(d, y);
    }
    case 'is_tomorrow': {
      const d = parseDate(currentValue);
      if (!d) return false;
      const t = new Date();
      t.setDate(t.getDate() + 1);
      return isSameDate(d, t);
    }
    case 'is_friday': {
      const summary = await getHolidaySummaryForDate(currentValue);
      return !!summary?.isFriday;
    }
    case 'is_official_holiday': {
      const summary = await getHolidaySummaryForDate(currentValue);
      return !!summary?.isOfficialHoliday;
    }
    case 'days_passed_eq': {
      const diff = daysDiffFromNow(currentValue);
      return diff !== null && Math.floor(diff) === Number(expectedValue || 0);
    }
    case 'days_passed_gt': {
      const diff = daysDiffFromNow(currentValue);
      return diff !== null && diff > Number(expectedValue || 0);
    }
    case 'days_passed_lt': {
      const diff = daysDiffFromNow(currentValue);
      return diff !== null && diff < Number(expectedValue || 0);
    }
    case 'days_remaining_eq': {
      const diff = daysDiffFromNow(currentValue);
      return diff !== null && diff < 0 && Math.floor(Math.abs(diff)) === Number(expectedValue || 0);
    }
    case 'days_remaining_gt': {
      const diff = daysDiffFromNow(currentValue);
      return diff !== null && diff < 0 && Math.abs(diff) > Number(expectedValue || 0);
    }
    case 'days_remaining_lt': {
      const diff = daysDiffFromNow(currentValue);
      return diff !== null && diff < 0 && Math.abs(diff) < Number(expectedValue || 0);
    }
    case 'hours_passed_gt': {
      const diff = hoursDiffFromNow(currentValue);
      return diff !== null && diff > Number(expectedValue || 0);
    }
    case 'hours_passed_lt': {
      const diff = hoursDiffFromNow(currentValue);
      return diff !== null && diff < Number(expectedValue || 0);
    }
    case 'hours_remaining_gt': {
      const diff = hoursDiffFromNow(currentValue);
      return diff !== null && diff < 0 && Math.abs(diff) > Number(expectedValue || 0);
    }
    case 'hours_remaining_lt': {
      const diff = hoursDiffFromNow(currentValue);
      return diff !== null && diff < 0 && Math.abs(diff) < Number(expectedValue || 0);
    }
    default:
      return false;
  }
};

export const evaluateWorkflowCondition = async ({
  condition,
  currentRecord,
  previousRecord = null,
  moduleId,
}: {
  condition: WorkflowCondition;
  currentRecord: Record<string, any>;
  previousRecord?: Record<string, any> | null | undefined;
  moduleId: string;
}) => {
  const context = createWorkflowEvaluationContext(moduleId);

  return evaluateCondition(
    condition,
    currentRecord,
    previousRecord,
    moduleId,
    context
  );
};

const evaluateCondition = async (
  condition: WorkflowCondition,
  currentRecord: Record<string, any>,
  previousRecord: Record<string, any> | null | undefined,
  moduleId: string,
  context: WorkflowEvaluationContext
) => {
  const fieldKey = String(condition?.field || '').trim();
  if (!fieldKey) return false;

  const [currentValue, previousValue] = await Promise.all([
    resolveConditionFieldValue(fieldKey, currentRecord, moduleId, context),
    resolveConditionFieldValue(fieldKey, previousRecord || null, moduleId, context),
  ]);

  return evaluateResolvedCondition(condition, currentValue, previousValue);
};

export const evaluateWorkflowConditions = async ({
  conditionsAll = [],
  conditionsAny = [],
  currentRecord,
  previousRecord = null,
  moduleId,
}: {
  conditionsAll?: WorkflowCondition[] | null;
  conditionsAny?: WorkflowCondition[] | null;
  currentRecord: Record<string, any>;
  previousRecord?: Record<string, any> | null | undefined;
  moduleId: string;
}) => {
  const all = Array.isArray(conditionsAll) ? conditionsAll : [];
  const any = Array.isArray(conditionsAny) ? conditionsAny : [];
  const context = createWorkflowEvaluationContext(moduleId);

  for (const condition of all) {
    const passed = await evaluateCondition(
      condition as WorkflowCondition,
      currentRecord,
      previousRecord,
      moduleId,
      context
    );
    if (!passed) return false;
  }

  if (any.length === 0) return true;

  for (const condition of any) {
    const passed = await evaluateCondition(
      condition as WorkflowCondition,
      currentRecord,
      previousRecord,
      moduleId,
      context
    );
    if (passed) return true;
  }

  return false;
};

export const resolveWorkflowFieldValue = async ({
  fieldKey,
  currentRecord,
  moduleId,
  context,
}: {
  fieldKey: string;
  currentRecord: Record<string, any> | null | undefined;
  moduleId: string;
  context?: WorkflowEvaluationContext;
}) => {
  const resolvedContext = context || createWorkflowEvaluationContext(moduleId);
  return resolveConditionFieldValue(fieldKey, currentRecord, moduleId, resolvedContext);
};

const evaluateWorkflow = async (
  workflow: WorkflowRecord,
  currentRecord: Record<string, any>,
  previousRecord: Record<string, any> | null | undefined,
  moduleId: string
) => {
  return evaluateWorkflowConditions({
    conditionsAll: workflow.conditions_all || [],
    conditionsAny: workflow.conditions_any || [],
    currentRecord,
    previousRecord,
    moduleId,
  });
};

const resolveSmsRequestUrl = (url: string) => {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (import.meta.env.DEV && /(^|\.)rest\.payamak-panel\.com$/i.test(parsed.hostname)) {
      return `/api/melipayamak-rest${parsed.pathname}${parsed.search || ''}`;
    }
    if (import.meta.env.DEV && /(^|\.)api\.payamak-panel\.com$/i.test(parsed.hostname)) {
      return `/api/melipayamak-soap${parsed.pathname}${parsed.search || ''}`;
    }
    return url;
  } catch {
    return url;
  }
};

const normalizeSmsUrl = (url: string, mode: 'rest' | 'soap') => {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '');
    if (mode === 'rest' && /(^|\.)rest\.payamak-panel\.com$/i.test(parsed.hostname)) {
      if (/\/api\/SendSMS$/i.test(path)) parsed.pathname = `${path}/SendSMS`;
    }
    if (mode === 'soap' && /(^|\.)api\.payamak-panel\.com$/i.test(parsed.hostname)) {
      if (/\/post\/send\.asmx$/i.test(path)) parsed.pathname = `${path}/SendSimpleSMS2`;
    }
    return parsed.toString();
  } catch {
    return url;
  }
};

const sendSmsDirectLegacy = async (to: string[], text: string) => {
  const { data: smsRow, error: smsErr } = await supabase
    .from('integration_settings')
    .select('*')
    .eq('connection_type', 'sms')
    .eq('is_active', true)
    .maybeSingle();
  if (smsErr) throw smsErr;
  if (!smsRow) throw new Error('تنظیمات سامانه پیامک فعال نیست.');

  const settings = (smsRow.settings || {}) as Record<string, any>;
  const mode = String(settings.mode || 'rest') as 'rest' | 'soap';
  const baseUrl = normalizeSmsUrl(
    String(
      settings.base_url ||
        (mode === 'soap'
          ? 'https://api.payamak-panel.com/post/send.asmx/SendSimpleSMS2'
          : 'https://rest.payamak-panel.com/api/SendSMS/SendSMS')
    ),
    mode
  );
  const username = String(settings.username || '').trim();
  const password = String(settings.password || '').trim();
  const apiKey = String(settings.api_key || '').trim();
  const senderNumber = String(settings.sender_number || '').trim();
  const bodyId = String(settings.body_id || '').trim();
  const isFlash = !!settings.is_flash;

  if (!baseUrl || !senderNumber) throw new Error('تنظیمات ارسال پیامک ناقص است.');
  if (!apiKey && (!username || !password)) {
    throw new Error('نام کاربری/رمز عبور یا API Key برای پیامک کامل نیست.');
  }

  const url = resolveSmsRequestUrl(baseUrl);
  const useSoapRequest = mode === 'soap' || /\/post\/send\.asmx(\/SendSimpleSMS2)?$/i.test(baseUrl);

  for (const recipient of to) {
    let response: Response;
    if (useSoapRequest) {
      const body = new URLSearchParams({
        username,
        password,
        to: recipient,
        from: senderNumber,
        text,
        isflash: isFlash ? 'true' : 'false',
      });
      if (bodyId) body.set('bodyId', bodyId);
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        body: body.toString(),
      });
    } else {
      const payload: Record<string, any> = {
        to: recipient,
        from: senderNumber,
        text,
        isFlash,
      };
      if (bodyId) payload.bodyId = bodyId;
      if (apiKey) {
        payload.apiKey = apiKey;
      } else {
        payload.username = username;
        payload.password = password;
      }
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(raw || `HTTP ${response.status}`);
    }
  }
};

type WorkflowSmsSendArgs = {
  to: string[];
  text: string;
  moduleId?: string;
  recordId?: string;
  customerId?: string;
  title?: string;
  metadata?: Record<string, any>;
};

const sendSms = async ({
  to,
  text,
  moduleId,
  recordId,
  customerId,
  title,
  metadata,
}: WorkflowSmsSendArgs) => {
  try {
    await sendSmsViaGateway({
      to,
      text,
      allowDirectFallback: true,
      moduleId,
      recordId,
      customerId,
      title,
      metadata,
    });
  } catch (error) {
    const useLegacyFallback = String(import.meta.env.VITE_SMS_LEGACY_FALLBACK || '').trim() === 'true';
    if (!useLegacyFallback) throw error;
    await sendSmsDirectLegacy(to, text);
  }
};

type CommunicationChannel = 'sms' | 'email' | 'bale' | 'rubika';

const getProfileCommunicationSelect = (channel: CommunicationChannel) => {
  if (channel === 'sms') return 'id, mobile_1';
  if (channel === 'email') return 'id, email';
  if (channel === 'bale') return 'id, bale_chat_id';
  return 'id, rubika_chat_id';
};

const parseCommunicationRecipientToken = (value: any) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(user|role)[:_](.+)$/i);
  if (!match) return null;
  const kind = String(match[1] || '').toLowerCase();
  const id = String(match[2] || '').trim();
  if (!id || (kind !== 'user' && kind !== 'role')) return null;
  return { kind: kind as 'user' | 'role', id };
};

const UUID_LIKE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const resolveRubikaCounterpartyGroupChatIds = async (candidateValues: string[]) => {
  const customerIds = Array.from(
    new Set(
      candidateValues
        .map((value) => String(value || '').trim())
        .filter((value) => UUID_LIKE_REGEX.test(value))
    )
  );
  if (customerIds.length === 0) return [] as string[];

  const { data, error } = await supabase
    .from('counterparty_bot_groups')
    .select('customer_id,supplier_id,bot_chat_id,channel_type,status')
    .eq('channel_type', 'rubika')
    .eq('status', 'active')
    .in('customer_id', customerIds);
  if (error) throw error;

  const customerChatIds = ((data || []) as Array<Record<string, any>>)
    .map((row) => String(row?.bot_chat_id || '').trim())
    .filter(Boolean);

  const { data: supplierData, error: supplierError } = await supabase
    .from('counterparty_bot_groups')
    .select('customer_id,supplier_id,bot_chat_id,channel_type,status')
    .eq('channel_type', 'rubika')
    .eq('status', 'active')
    .in('supplier_id', customerIds);
  if (supplierError) throw supplierError;

  const supplierChatIds = ((supplierData || []) as Array<Record<string, any>>)
    .map((row) => String(row?.bot_chat_id || '').trim())
    .filter(Boolean);

  return Array.from(new Set([...customerChatIds, ...supplierChatIds]));
};

const resolveCommunicationValuesFromFields = async ({
  currentRecord,
  moduleId,
  recipientFields,
  channel,
}: {
  currentRecord: Record<string, any>;
  moduleId: string;
  recipientFields: any[];
  channel: CommunicationChannel;
}) => {
  const directValues: string[] = [];
  const userIds = new Set<string>();
  const roleIds = new Set<string>();
  const context: WorkflowEvaluationContext = {
    moduleId,
    relatedRecordCache: new Map(),
    tagsCache: new Map(),
  };

  for (const fieldKey of asArray(recipientFields)) {
    const rawValue = await resolveConditionFieldValue(
      String(fieldKey || ''),
      currentRecord,
      moduleId,
      context
    );
    asArray(rawValue).forEach((entry) => {
      const token = parseCommunicationRecipientToken(entry);
      if (token?.kind === 'user') {
        userIds.add(token.id);
        return;
      }
      if (token?.kind === 'role') {
        roleIds.add(token.id);
        return;
      }
      const normalized = String(entry || '').trim();
      if (normalized) directValues.push(normalized);
    });
  }

  const profileRows: Array<Record<string, any>> = [];
  const profileSelect = getProfileCommunicationSelect(channel);
  if (userIds.size > 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select(profileSelect)
      .in('id', Array.from(userIds));
    if (error) throw error;
    profileRows.push(...((data || []) as Array<Record<string, any>>));
  }
  if (roleIds.size > 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select(profileSelect)
      .in('role_id', Array.from(roleIds));
    if (error) throw error;
    profileRows.push(...((data || []) as Array<Record<string, any>>));
  }

  const resolvedValues = (() => {
    if (channel === 'sms') {
      return [
        ...directValues.map((value) => normalizePhone(value)).filter(Boolean),
        ...profileRows.map((row) => normalizePhone(row?.mobile_1)).filter(Boolean),
      ];
    }
    if (channel === 'email') {
      return [
        ...directValues.map((value) => String(value || '').trim()).filter(Boolean),
        ...profileRows.map((row) => String(row?.email || '').trim()).filter(Boolean),
      ];
    }
    if (channel === 'rubika') {
      return [
        ...directValues.map((value) => String(value || '').trim()).filter(Boolean),
        ...profileRows.map((row) => String(row?.rubika_chat_id || '').trim()).filter(Boolean),
      ];
    }
    return [
      ...directValues.map((value) => String(value || '').trim()).filter(Boolean),
      ...profileRows.map((row) => String(row?.bale_chat_id || '').trim()).filter(Boolean),
    ];
  })();
  const uniqueValues = Array.from(new Set(resolvedValues));
  if (channel !== 'rubika') return uniqueValues;

  const groupChatIds = await resolveRubikaCounterpartyGroupChatIds(uniqueValues);
  const uuidOnlyValues = uniqueValues.filter((value) => !UUID_LIKE_REGEX.test(value));
  return Array.from(new Set([...uuidOnlyValues, ...groupChatIds]));
};

const resolveNoteRecipientsFromFields = async ({
  currentRecord,
  moduleId,
  recipientFields,
}: {
  currentRecord: Record<string, any>;
  moduleId: string;
  recipientFields: any[];
}) => {
  const userIds = new Set<string>();
  const roleIds = new Set<string>();
  const context: WorkflowEvaluationContext = {
    moduleId,
    relatedRecordCache: new Map(),
    tagsCache: new Map(),
  };

  for (const fieldKey of asArray(recipientFields)) {
    const rawValue = await resolveConditionFieldValue(
      String(fieldKey || ''),
      currentRecord,
      moduleId,
      context
    );
    asArray(rawValue).forEach((entry) => {
      const token = parseCommunicationRecipientToken(entry);
      if (token?.kind === 'user') {
        userIds.add(token.id);
        return;
      }
      if (token?.kind === 'role') {
        roleIds.add(token.id);
      }
    });
  }

  return {
    mentionUserIds: Array.from(userIds),
    mentionRoleIds: Array.from(roleIds),
  };
};

export const resolveNoteAttachmentsFromFields = async ({
  currentRecord,
  moduleId,
  attachmentFields,
}: {
  currentRecord: Record<string, any>;
  moduleId: string;
  attachmentFields: any[];
}) => {
  const context: WorkflowEvaluationContext = {
    moduleId,
    relatedRecordCache: new Map(),
    tagsCache: new Map(),
  };
  const attachments: NoteAttachment[] = [];

  for (const fieldKey of asArray(attachmentFields)) {
    const normalizedFieldKey = String(fieldKey || '').trim();
    if (!normalizedFieldKey) continue;
    const rawValue = await resolveConditionFieldValue(
      normalizedFieldKey,
      currentRecord,
      moduleId,
      context
    );
    const fallbackName = sanitizeAttachmentName(normalizedFieldKey.replace(/[^\w\u0600-\u06FF.-]+/g, '_') || 'file');
    attachments.push(...normalizeAttachmentObject(rawValue, fallbackName));
  }

  const deduped = new Map<string, NoteAttachment>();
  attachments.forEach((item, index) => {
    const url = String(item?.url || '').trim();
    if (!url) return;
    const name = sanitizeAttachmentName(String(item?.name || '').trim() || `file_${index + 1}`);
    deduped.set(url, {
      name,
      url,
      mimeType: String(item?.mimeType || '').trim() || null,
    });
  });

  return Array.from(deduped.values());
};

const resolveConfiguredActionValue = async (
  moduleId: string,
  config: Record<string, any>,
  currentRecord: Record<string, any>
) => {
  const valueMode = String(config?.value_mode || 'static');
  if (valueMode === 'from_source' || valueMode === 'from_related') {
    const sourceField = String(config?.source_field || '').trim();
    if (!sourceField) return null;
    const context: WorkflowEvaluationContext = {
      moduleId,
      relatedRecordCache: new Map(),
      tagsCache: new Map(),
    };
    return resolveConditionFieldValue(sourceField, currentRecord, moduleId, context);
  }
  return config?.value ?? null;
};

const getCurrentAuthUser = async () => {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
};

const resolveWorkflowOrgId = async (currentRecord: Record<string, any>) => {
  const fromRecord = String(currentRecord?.org_id || '').trim();
  if (fromRecord) return fromRecord;

  const user = await getCurrentAuthUser();
  if (!user?.id) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .maybeSingle();
  return String(profile?.org_id || '').trim() || null;
};

const loadProcessTemplateStages = async (templateId: string) => {
  const { data, error } = await supabase
    .from('process_template_stages')
    .select('id, stage_name, sort_order, wage, default_assignee_id, default_assignee_role_id, metadata')
    .eq('template_id', templateId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
};

const mapTemplateStagesToDraft = (templateId: string, stages: any[]) =>
  (stages || []).map((stage: any, index: number) => ({
    ...(stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {}),
    id: stage?.id || `${templateId}_${index + 1}`,
    name: stage?.stage_name || `مرحله ${index + 1}`,
    sort_order: stage?.sort_order || (index + 1) * 10,
    wage: Number(stage?.wage || 0),
    weight: Number(stage?.metadata?.weight || 0),
    duration_value: Number(stage?.metadata?.duration_value || 0),
    duration_unit: String(stage?.metadata?.duration_unit || 'day'),
    duration_from: String(stage?.metadata?.duration_from || 'project_start'),
    default_assignee_id: stage?.default_assignee_id || null,
    default_assignee_role_id: stage?.default_assignee_role_id || null,
    template_stage_id: stage?.id || null,
  }));

export const executeWorkflowAction = async (
  action: WorkflowAction,
  moduleId: string,
  currentRecord: Record<string, any>
) => {
  const config = action?.config || {};

  if (action.type === 'send_sms') {
    const messageText = renderTemplate(String(config.message || ''), currentRecord).trim();
    if (!messageText) return;
    const recipientsFromFields = await resolveCommunicationValuesFromFields({
      currentRecord,
      moduleId,
      recipientFields: asArray(config.recipient_fields),
      channel: 'sms',
    });
    const recipientsManual = asArray(config.manual_numbers)
      .map((phone) => normalizePhone(phone))
      .filter(Boolean);
    const fallbackRecipients =
      recipientsFromFields.length > 0 || recipientsManual.length > 0
        ? []
        : [currentRecord?.mobile_1, currentRecord?.mobile_2, currentRecord?.phone]
            .map((phone) => normalizePhone(phone))
            .filter(Boolean);
    const recipients = Array.from(
      new Set([...recipientsFromFields, ...recipientsManual, ...fallbackRecipients])
    ).filter(isValidIranMobile);
    if (recipients.length === 0) return;
    await sendSms({
      to: recipients,
      text: messageText,
      moduleId,
      recordId: currentRecord?.id ? String(currentRecord.id) : undefined,
      customerId: moduleId === 'customers' && currentRecord?.id ? String(currentRecord.id) : undefined,
      title: 'ارسال پیامک خودکار',
      metadata: {
        source_type: 'workflow',
        workflow_action_type: 'send_sms',
        workflow_action_id: (action as any)?.id || null,
      },
    });
    return;
  }

  if (action.type === 'send_note' || action.type === 'send_note_sms') {
    const noteText = renderTemplateWithBoldMarkers(String(config.note_text || ''), currentRecord).trim();
    const attachments = await resolveNoteAttachmentsFromFields({
      currentRecord,
      moduleId,
      attachmentFields: asArray(config.attachment_fields),
    });
    if (!noteText && attachments.length === 0) return;
    const recordId = currentRecord?.id;
    const scope = normalizeNoteScope(moduleId, recordId ? String(recordId) : null);
    if (!scope.hasLinkedRecord) return;
    const recipients = await resolveNoteRecipientsFromFields({
      currentRecord,
      moduleId,
      recipientFields: asArray(config.recipient_fields),
    });
    await insertNotesWithFallback([{
      module_id: scope.module_id,
      record_id: scope.record_id,
      content: serializeNoteContent(noteText, attachments),
      mention_user_ids: recipients.mentionUserIds,
      mention_role_ids: recipients.mentionRoleIds,
      source_type: 'system',
      metadata: {
        source_type: 'system',
        workflow_action_type: action.type,
        workflow_action_id: (action as any)?.id || null,
      },
    }]);
    if (action.type === 'send_note_sms') {
      await sendNoteSmsNotifications({
        authorName: 'سیستم',
        noteText,
        mentionUserIds: recipients.mentionUserIds,
        mentionRoleIds: recipients.mentionRoleIds,
        moduleId: scope.module_id,
        recordId: scope.record_id,
        title: 'ارسال یادداشت خودکار',
      });
    }
    return;
  }

  if (action.type === 'send_bale_bot' || action.type === 'send_rubika_bot') {
    const isRubika = action.type === 'send_rubika_bot';
    const channel: 'bale' | 'rubika' = isRubika ? 'rubika' : 'bale';
    const messageText = renderTemplate(String(config.message || ''), currentRecord).trim();
    if (!messageText) return;
    const titleText = renderTemplate(String(config.title || ''), currentRecord).trim();
    const recipientsFromFields = await resolveCommunicationValuesFromFields({
      currentRecord,
      moduleId,
      recipientFields: asArray(config.recipient_fields),
      channel,
    });
    const recipientsManual = asArray(config.manual_chat_ids)
      .map((chatId) => String(chatId || '').trim())
      .filter(Boolean);
    const directFallbackChatId = isRubika
      ? String(currentRecord?.rubika_chat_id || '').trim()
      : String(currentRecord?.bale_chat_id || '').trim();
    const fallbackRecipients =
      recipientsFromFields.length > 0 || recipientsManual.length > 0
        ? []
        : [directFallbackChatId].filter(Boolean);
    const recipients = Array.from(
      new Set([...recipientsFromFields, ...recipientsManual, ...fallbackRecipients])
    ).filter(Boolean);
    if (recipients.length === 0) return;

    for (const chatId of recipients) {
      await sendBotMessageViaGateway({
        channel,
        chatId,
        text: messageText,
        title: titleText || undefined,
        moduleId,
        recordId: currentRecord?.id ? String(currentRecord.id) : undefined,
        customerId: moduleId === 'customers' && currentRecord?.id ? String(currentRecord.id) : undefined,
      });
    }
    return;
  }

  if (action.type === 'send_email') {
    throw new Error('ارسال ایمیل هنوز پیاده‌سازی نشده است.');
  }

  if (action.type === 'update_record') {
    const fieldKey = String(config.field || '').trim();
    if (!fieldKey || !currentRecord?.id) return;
    const nextValue = await resolveConfiguredActionValue(moduleId, config, currentRecord);
    const processLinkedMeta = parseProcessLinkedFieldKey(fieldKey);
    const patchFieldKey = processLinkedMeta?.targetFieldKey || fieldKey;
    const processLinks = getProcessLinkMapFromRecord(currentRecord);
    const targetModuleId = processLinkedMeta?.moduleId || moduleId;
    const targetRecordId = processLinkedMeta
      ? String(processLinks?.[processLinkedMeta.moduleId] || '').trim()
      : String(currentRecord.id || '').trim();
    if (!targetRecordId) return;

    const patch = { [patchFieldKey]: nextValue, updated_at: new Date().toISOString() } as Record<string, any>;
    const { error } = await supabase
      .from(getModuleTable(targetModuleId))
      .update(patch)
      .eq('id', targetRecordId);
    if (error) throw error;
    currentRecord[fieldKey] = nextValue;
    currentRecord[patchFieldKey] = nextValue;
    return;
  }

  if (action.type === 'create_related_record') {
    const targetModuleId = String(config.target_module_id || '').trim();
    const relationFieldKey = String(config.relation_field_key || '').trim();
    const sourceModuleId = String(config.source_module_id || '').trim() || moduleId;
    const processLinks = getProcessLinkMapFromRecord(currentRecord);
    const sourceRecordId = sourceModuleId === moduleId
      ? String(currentRecord?.id || '').trim()
      : String(processLinks?.[sourceModuleId] || '').trim();
    if (!targetModuleId || !relationFieldKey || !sourceRecordId) return;

    const user = await getCurrentAuthUser();
    const payload: Record<string, any> = {
      [relationFieldKey]: sourceRecordId,
    };

    const orgId = await resolveWorkflowOrgId(currentRecord);
    if (orgId) payload.org_id = orgId;
    if (user?.id) {
      payload.created_by = user.id;
      payload.updated_by = user.id;
    }

    const mappings = Array.isArray(config.field_mappings) ? config.field_mappings : [];
    const mappingContext: WorkflowEvaluationContext = {
      moduleId,
      relatedRecordCache: new Map(),
      tagsCache: new Map(),
    };
    for (const mapping of mappings) {
      const targetField = String(mapping?.field || '').trim();
      if (!targetField) continue;
      if (mapping?.mode === 'from_source' || mapping?.mode === 'from_related') {
        const sourceField = String(mapping?.source_field || '').trim();
        payload[targetField] = sourceField
          ? await resolveConditionFieldValue(sourceField, currentRecord, moduleId, mappingContext)
          : null;
        continue;
      }
      payload[targetField] = mapping?.value ?? null;
    }

    const { data: insertedRecord, error } = await supabase
      .from(getModuleTable(targetModuleId))
      .insert(payload)
      .select('id')
      .maybeSingle();
    if (error) throw error;

    if (targetModuleId === 'tasks' && insertedRecord?.id) {
      await copyRecordFilesToTask({
        sourceModuleId,
        sourceRecordId,
        targetTaskId: String(insertedRecord.id),
        orgId,
        userId: user?.id || null,
      });
    }
    return;
  }

  if (action.type === 'copy_process_template') {
    const templateId = String(config.template_id || '').trim();
    const draftFieldKey = resolveWorkflowProcessDraftFieldKey(moduleId);
    if (!templateId || !draftFieldKey || !currentRecord?.id) return;

    const stages = await loadProcessTemplateStages(templateId);
    const patch = {
      process_template_id: templateId,
      [draftFieldKey]: mapTemplateStagesToDraft(templateId, stages),
    } as Record<string, any>;

    const { error } = await supabase
      .from(getModuleTable(moduleId))
      .update(patch)
      .eq('id', currentRecord.id);
    if (error) throw error;

    Object.assign(currentRecord, patch);
    return;
  }

  if (action.type === 'execute_process') {
    const templateId = String(config.template_id || '').trim();
    if (!templateId || !currentRecord?.id) return;

    const orgId = await resolveWorkflowOrgId(currentRecord);
    if (!orgId) {
      throw new Error('org_id for process execution is missing');
    }

    const { error } = await supabase.rpc('create_process_run_from_template', {
      p_org_id: orgId,
      p_template_id: templateId,
      p_module_id: moduleId,
      p_record_id: currentRecord.id,
      p_process_name: null,
      p_copied_mode: 'auto',
    });
    if (error) throw error;
  }
};

const hasWorkflowLogForRecord = async (
  workflowId: string,
  moduleId: string,
  recordId: string
) => {
  const { data, error } = await supabase
    .from('workflow_logs')
    .select('id')
    .eq('workflow_id', workflowId)
    .eq('module_id', moduleId)
    .eq('record_id', recordId)
    .eq('status', 'success')
    .limit(1);
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
};

const logWorkflowRun = async ({
  workflow,
  moduleId,
  currentRecord,
  event,
  status,
  errorMessage,
}: {
  workflow: WorkflowRecord;
  moduleId: string;
  currentRecord: Record<string, any>;
  event: WorkflowEvent;
  status: 'success' | 'failed';
  errorMessage?: string;
}) => {
  const orgId = await resolveWorkflowOrgId(currentRecord);
  const recordId = String(currentRecord?.id || '').trim() || null;
  await supabase.from('workflow_logs').insert({
    workflow_id: workflow.id,
    org_id: orgId,
    run_type: 'event',
    status,
    module_id: moduleId,
    record_id: recordId,
    message: errorMessage || null,
    details: {
      event,
      execution_mode: workflow.execution_mode || 'first_match',
      action_count: Array.isArray(workflow.actions) ? workflow.actions.length : 0,
    },
  });
};

export const runWorkflowsForEvent = async ({
  moduleId,
  event,
  currentRecord,
  previousRecord = null,
}: RunWorkflowArgs) => {
  if (!moduleId || !currentRecord) return;
  const triggerTypes = event === 'create' ? ['on_create', 'on_upsert'] : ['on_upsert'];

  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('module_id', moduleId)
    .eq('is_active', true)
    .in('trigger_type', triggerTypes);

  if (error) {
    console.error('Workflow fetch failed:', error);
    return;
  }

  const workflows = (data || []) as WorkflowRecord[];
  for (const workflow of workflows) {
    try {
      const matched = await evaluateWorkflow(workflow, currentRecord, previousRecord, moduleId);
      if (!matched) continue;

      const executionMode = String(workflow.execution_mode || 'first_match');
      const recordId = String(currentRecord?.id || '').trim();
      if (executionMode === 'first_match' && recordId) {
        const alreadyExecuted = await hasWorkflowLogForRecord(workflow.id, moduleId, recordId);
        if (alreadyExecuted) continue;
      }

      const actions = Array.isArray(workflow.actions) ? workflow.actions : [];
      const actionErrors: string[] = [];
      for (const action of actions) {
        try {
          await executeWorkflowAction(action as WorkflowAction, moduleId, currentRecord);
        } catch (actionErr) {
          actionErrors.push(
            String((actionErr as any)?.message || (action as any)?.type || 'workflow action failed')
          );
          console.error(
            `Workflow action failed (${workflow?.name || workflow?.id} / ${String((action as any)?.type || '-')})`,
            actionErr
          );
        }
      }

      if (actionErrors.length > 0) {
        throw new Error(actionErrors.join(' | '));
      }

      await logWorkflowRun({
        workflow,
        moduleId,
        currentRecord,
        event,
        status: 'success',
      });

      await supabase
        .from('workflows')
        .update({ last_run_at: new Date().toISOString() })
        .eq('id', workflow.id);
    } catch (err: any) {
      console.error(`Workflow execution failed (${workflow?.name || workflow?.id}):`, err);
      try {
        await logWorkflowRun({
          workflow,
          moduleId,
          currentRecord,
          event,
          status: 'failed',
          errorMessage: String(err?.message || err || 'workflow execution failed'),
        });
      } catch (logErr) {
        console.error('Workflow log insert failed:', logErr);
      }
    }
  }
};
