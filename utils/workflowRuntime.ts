import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';
import { buildResolvedAssigneeCombo } from './assigneeValue';
import { sendBotMessageViaGateway, sendCounterpartyBotGroupMessage } from './botGateway';
import { getHolidaySummaryForDate } from './holidayCalendar';
import { formatTemplateValueByField, resolveTemplateOptionLabelMaps } from './messageTemplateRenderer';
import { normalizeNoteScope } from './noteScope';
import { parseProcessLinkedFieldKey, parseProcessLinkMap } from './processTargets';
import { resolveWorkflowProcessDraftFieldKey } from './workflowHelpers';
import {
  parseWorkflowRelatedFieldKey,
  parseProcessNextStageFieldKey,
  WORKFLOW_ASSIGNEE_FIELD_KEY,
  WorkflowAction,
  WorkflowCondition,
  WorkflowRecord,
} from './workflowTypes';
import {
  getProcessTaskCustomFieldValuesFromRecurrence,
  getProcessTaskCustomFieldsFromRecurrence,
  mergeProcessTaskCustomFieldValues,
  PROCESS_TASK_CUSTOM_FIELDS_KEY,
  PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY,
} from './processTaskCustomFields';
import { isIntervalDue, normalizeIntervalUnit, clampIntervalValue } from './intervalSchedule';
import { sendSmsViaGateway } from './smsGateway';
import { insertNotesWithFallback, sendNoteSmsNotifications } from './noteDispatch';
import { NoteAttachment, serializeNoteContent } from './noteContent';
import { fetchAssigneeDirectory, fetchRecordTagsMap } from './referenceData';
import { escapeRubikaAutoLinkText } from './rubikaLinkText';
import { shortenAttachmentsForExternalShare } from './fileShortLinks';
import { evaluateFormulaExpression } from './formulaRuntime';
import { getRecordTitle } from './recordTitle';
import { mapProcessTemplateStagesToDraft } from './processRunRuntime';

type WorkflowEvent = 'create' | 'upsert' | 'interval';
type WorkflowRunType = 'event' | 'scheduled';
type CounterpartyBotGroupRow = {
  id?: string | null;
  customer_id?: string | null;
  supplier_id?: string | null;
  channel_type?: 'rubika' | 'bale' | 'telegram' | string | null;
  bot_chat_id?: string | null;
};

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

export const prefetchWorkflowRecordTags = async ({
  moduleId,
  records,
  context,
}: {
  moduleId: string;
  records: Array<Record<string, any> | null | undefined>;
  context: WorkflowEvaluationContext;
}) => {
  const normalizedModuleId = String(moduleId || '').trim();
  if (!normalizedModuleId || !context) return;

  const recordIds = Array.from(
    new Set(
      (records || [])
        .map((record) => String(record?.id || '').trim())
        .filter(Boolean)
    )
  ).filter((recordId) => !context.tagsCache.has(`${normalizedModuleId}:${recordId}`));

  if (recordIds.length === 0) return;

  try {
    const map = await fetchRecordTagsMap(supabase, normalizedModuleId, recordIds);
    recordIds.forEach((recordId) => {
      const tags = Array.isArray(map?.[recordId]) ? map[recordId] : [];
      const tagIds = tags
        .map((item: any) => String(item?.id || item?.tag_id || '').trim())
        .filter(Boolean);
      context.tagsCache.set(`${normalizedModuleId}:${recordId}`, tagIds);
    });
  } catch {
    // noop
  }
};

const getModuleTable = (moduleId: string) => MODULES[moduleId]?.table || moduleId;

const hydrateWorkflowCurrentRecord = async (
  moduleId: string,
  currentRecord: Record<string, any>
): Promise<Record<string, any>> => {
  const recordId = String(currentRecord?.id || '').trim();
  if (!moduleId || !recordId) return currentRecord;

  const { data, error } = await supabase
    .from(getModuleTable(moduleId))
    .select('*')
    .eq('id', recordId)
    .maybeSingle();

  if (error) {
    console.warn(`Workflow record hydration failed (${moduleId}/${recordId}):`, error);
    return currentRecord;
  }

  if (!data || typeof data !== 'object') {
    return currentRecord;
  }

  return {
    ...currentRecord,
    ...data,
  };
};

const toComparable = (value: any): any => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => toComparable(item));
  if (typeof value === 'object') {
    const preferred = value?.id ?? value?.value ?? value?.label ?? value?.name ?? value?.title ?? value?.full_name ?? value?.display;
    if (preferred !== undefined && preferred !== null) return toComparable(preferred);
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value;
  const text = toEnglishDigits(String(value).replace(/,/g, '').trim());
  const num = Number(text);
  if (!Number.isNaN(num) && text !== '') return num;
  return text;
};

const asArray = (value: any): any[] => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  if (typeof value === 'object') {
    const nested = value?.values ?? value?.items ?? value?.selected;
    if (Array.isArray(nested)) return nested;
    return [value];
  }
  if (typeof value === 'string' && value.includes(',')) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [value];
};

const extractComparableListValues = (value: any): any[] => {
  if (Array.isArray(value)) return value.flatMap((item) => extractComparableListValues(item));
  if (value && typeof value === 'object') {
    const nested = value?.values ?? value?.items ?? value?.selected;
    if (Array.isArray(nested)) return nested.flatMap((item) => extractComparableListValues(item));
    return [
      value?.id,
      value?.value,
      value?.label,
      value?.name,
      value?.title,
      value?.full_name,
      value?.display,
    ].filter((item) => item !== undefined && item !== null && item !== '');
  }
  return [value];
};

const normalizeListValues = (value: any) =>
  asArray(value)
    .flatMap((item) => extractComparableListValues(item))
    .map((item) => String(toComparable(item) ?? '').trim())
    .filter(Boolean);

const normalizeSearchText = (value: any) =>
  String(toComparable(value) ?? '')
    .trim()
    .toLocaleLowerCase('fa-IR');

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

export const formatWorkflowTemplateValue = (value: unknown): string => {
  return formatTemplateValueByField({ value });
};

const WORKFLOW_OPERATORS_WITHOUT_VALUE = new Set([
  'is_true',
  'is_false',
  'is_null',
  'not_null',
  'changed',
  'is_today',
  'is_yesterday',
  'is_tomorrow',
  'is_friday',
  'is_official_holiday',
]);

const INTERVAL_UNSUPPORTED_OPERATORS = new Set([
  'changed',
  'changed_from',
  'changed_to',
]);

const isBlankConditionValue = (value: unknown) =>
  value === undefined
  || value === null
  || String(value).trim() === ''
  || (Array.isArray(value) && value.length === 0);

const isRunnableIntervalCondition = (condition: WorkflowCondition) => {
  const field = String(condition?.field || '').trim();
  if (!field) return false;
  const operator = String(condition?.operator || 'eq').trim();
  if (INTERVAL_UNSUPPORTED_OPERATORS.has(operator)) return false;
  if (WORKFLOW_OPERATORS_WITHOUT_VALUE.has(operator)) return true;
  return !isBlankConditionValue(condition?.value);
};

const getValueByPath = (record: Record<string, any> | null | undefined, path: string) => {
  if (!path) return null;
  const segments = String(path || '')
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);
  let current: any = record || {};
  for (const segment of segments) {
    current = current?.[segment];
    if (current === null || current === undefined) break;
  }
  return current;
};

const templateMayNeedAssigneeDirectory = (template: string) =>
  /\{\{\s*[^}]*assignee[^}]*\s*\}\}/i.test(String(template || ''));

const resolveWorkflowTemplateValue = async (
  fieldKey: string,
  record: Record<string, any>,
  moduleId: string | null | undefined,
  context: WorkflowEvaluationContext
) => {
  if (Object.prototype.hasOwnProperty.call(record || {}, fieldKey)) {
    return record?.[fieldKey];
  }
  if (fieldKey.includes('.')) {
    return getValueByPath(record, fieldKey);
  }
  return resolveConditionFieldValue(fieldKey, record, String(moduleId || ''), context);
};

const renderWorkflowTemplate = async (
  template: string,
  record: Record<string, any>,
  moduleId?: string | null,
  options: { bold?: boolean } = {}
) => {
  const rawTemplate = String(template || '');
  if (!rawTemplate) return '';
  const context = createWorkflowEvaluationContext(String(moduleId || ''));
  const assigneeDirectory = templateMayNeedAssigneeDirectory(rawTemplate)
    ? await fetchAssigneeDirectory(supabase).catch(() => null)
    : null;
  const optionLabelMaps = await resolveTemplateOptionLabelMaps(supabase, rawTemplate, moduleId, record);
  const matches = Array.from(rawTemplate.matchAll(/\{\{\s*([^}]+)\s*\}\}/g));
  let rendered = rawTemplate;
  for (const match of matches) {
    const fullToken = match[0];
    const fieldKey = String(match[1] || '').trim();
    if (!fieldKey) {
      rendered = rendered.split(fullToken).join('');
      continue;
    }
    const value = await resolveWorkflowTemplateValue(fieldKey, record, moduleId, context);
    const text = formatTemplateValueByField({
      value,
      moduleId,
      fieldKey,
      sourceRecord: record,
      assigneeDirectory,
      optionLabelMaps,
    }).trim();
    rendered = rendered.split(fullToken).join(options.bold && text ? `**${text}**` : text);
  }
  return rendered;
};

const ATTACHMENT_FILE_NAME_REGEX = /[^0-9a-zA-Z._\-\u0600-\u06FF]+/g;
const ATTACHMENT_NAME_EXT_REGEX = /\.([a-z0-9]{2,10})$/i;
const NUMERICISH_ATTACHMENT_BASENAME_REGEX = /^[\d\s._-]+$/;

const sanitizeAttachmentName = (value: string, fallback = 'file') => {
  const normalized = String(value || '').trim().replace(ATTACHMENT_FILE_NAME_REGEX, '_');
  return normalized || fallback;
};

const getWorkflowFieldLabel = (moduleId: string, fieldKey: string) => {
  const moduleConfig = MODULES[moduleId];
  const field = (moduleConfig?.fields || []).find((item: any) => String(item?.key || '').trim() === String(fieldKey || '').trim());
  return String(field?.labels?.fa || field?.labels?.en || field?.key || fieldKey || '').trim();
};

const isNumericishAttachmentBaseName = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return NUMERICISH_ATTACHMENT_BASENAME_REGEX.test(raw);
};

const buildWorkflowAttachmentFallbackName = ({
  moduleId,
  currentRecord,
  fieldKey,
  sourceName,
}: {
  moduleId: string;
  currentRecord: Record<string, any>;
  fieldKey: string;
  sourceName?: string | null;
}) => {
  const sourceRaw = String(sourceName || '').trim();
  const sourceExtMatch = sourceRaw.match(ATTACHMENT_NAME_EXT_REGEX);
  const sourceExt = String(sourceExtMatch?.[1] || '').trim().toLowerCase();
  const sourceBase = sourceExt ? sourceRaw.slice(0, -(sourceExt.length + 1)) : sourceRaw;
  const fieldLabel = sanitizeAttachmentName(getWorkflowFieldLabel(moduleId, fieldKey) || fieldKey || 'file');
  const recordTitle = sanitizeAttachmentName(
    getRecordTitle(currentRecord, MODULES[moduleId], { fallback: '' }) || ''
  );
  const preferredBase = [recordTitle, fieldLabel].filter(Boolean).join('_') || fieldLabel || recordTitle || 'file';

  if (!sourceRaw) {
    return sourceExt ? `${preferredBase}.${sourceExt}` : preferredBase;
  }

  if (!isNumericishAttachmentBaseName(sourceBase)) {
    return sanitizeAttachmentName(sourceRaw, preferredBase);
  }

  return sourceExt ? `${preferredBase}.${sourceExt}` : preferredBase;
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
    const fallbackBaseName = String(fallbackName || '').trim() || 'file';
    const sourceExtMatch = sourceName.match(ATTACHMENT_NAME_EXT_REGEX);
    const sourceExt = String(sourceExtMatch?.[1] || '').trim().toLowerCase();
    const sourceBase = sourceExt ? sourceName.slice(0, -(sourceExt.length + 1)) : sourceName;
    const preferredName = sourceName && !isNumericishAttachmentBaseName(sourceBase)
      ? sourceName
      : (sourceExt && !fallbackBaseName.toLowerCase().endsWith(`.${sourceExt}`)
        ? `${fallbackBaseName}.${sourceExt}`
        : fallbackBaseName);
    const name = sanitizeAttachmentName(preferredName, fallbackBaseName);
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
  const fallbackBaseName = String(fallbackName || '').trim() || 'file';
  const sourceExtMatch = sourceName.match(ATTACHMENT_NAME_EXT_REGEX);
  const sourceExt = String(sourceExtMatch?.[1] || '').trim().toLowerCase();
  const sourceBase = sourceExt ? sourceName.slice(0, -(sourceExt.length + 1)) : sourceName;
  const preferredName = sourceName && !isNumericishAttachmentBaseName(sourceBase)
    ? sourceName
    : (sourceExt && !fallbackBaseName.toLowerCase().endsWith(`.${sourceExt}`)
      ? `${fallbackBaseName}.${sourceExt}`
      : fallbackBaseName);
  const name = sanitizeAttachmentName(preferredName, fallbackBaseName);
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
      const actualList = normalizeListValues(currentValue);
      const expectedList = normalizeListValues(expectedValue);
      const normalizedActual = actualList.length > 0 ? actualList : [String(cv ?? '')].filter(Boolean);
      const normalizedExpected = expectedList.length > 0 ? expectedList : [String(ev ?? '')].filter(Boolean);
      if (normalizedExpected.length === 0) return false;
      return normalizedActual.some((actual) => {
        const actualText = normalizeSearchText(actual);
        return normalizedExpected.some((expected) => {
          const expectedText = normalizeSearchText(expected);
          return !!expectedText && actualText.includes(expectedText);
        });
      });
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
  context,
}: {
  condition: WorkflowCondition;
  currentRecord: Record<string, any>;
  previousRecord?: Record<string, any> | null | undefined;
  moduleId: string;
  context?: WorkflowEvaluationContext;
}) => {
  const resolvedContext = context || createWorkflowEvaluationContext(moduleId);

  return evaluateCondition(
    condition,
    currentRecord,
    previousRecord,
    moduleId,
    resolvedContext
  );
};

const NEGATIVE_ANY_GROUP_OPERATORS = new Set(['neq', 'not_in', 'not_contains']);

const buildAnyConditionGroups = (conditions: WorkflowCondition[]) => {
  const conditionsByField = new Map<string, WorkflowCondition[]>();
  const groups: WorkflowCondition[][] = [];

  for (const condition of conditions) {
    const fieldKey = String(condition?.field || '').trim();
    if (!fieldKey) {
      groups.push([condition]);
      continue;
    }
    const existing = conditionsByField.get(fieldKey) || [];
    existing.push(condition);
    conditionsByField.set(fieldKey, existing);
  }

  conditionsByField.forEach((fieldConditions) => {
    const shouldMergeAsNegativeGroup = fieldConditions.length > 1
      && fieldConditions.every((condition) => NEGATIVE_ANY_GROUP_OPERATORS.has(String(condition?.operator || '').trim()));

    if (shouldMergeAsNegativeGroup) {
      groups.push(fieldConditions);
      return;
    }

    fieldConditions.forEach((condition) => groups.push([condition]));
  });

  return groups;
};

export const evaluateWorkflowConditionCollection = async ({
  conditionsAll = [],
  conditionsAny = [],
  evaluate,
}: {
  conditionsAll?: WorkflowCondition[] | null;
  conditionsAny?: WorkflowCondition[] | null;
  evaluate: (condition: WorkflowCondition) => Promise<boolean>;
}) => {
  const all = Array.isArray(conditionsAll) ? conditionsAll : [];
  const any = Array.isArray(conditionsAny) ? conditionsAny : [];

  for (const condition of all) {
    if (!await evaluate(condition as WorkflowCondition)) return false;
  }

  if (any.length === 0) return true;

  for (const group of buildAnyConditionGroups(any as WorkflowCondition[])) {
    let groupPassed = true;
    for (const condition of group) {
      if (!await evaluate(condition as WorkflowCondition)) {
        groupPassed = false;
        break;
      }
    }
    if (groupPassed) return true;
  }

  return false;
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
  context,
}: {
  conditionsAll?: WorkflowCondition[] | null;
  conditionsAny?: WorkflowCondition[] | null;
  currentRecord: Record<string, any>;
  previousRecord?: Record<string, any> | null | undefined;
  moduleId: string;
  context?: WorkflowEvaluationContext;
}) => {
  const resolvedContext = context || createWorkflowEvaluationContext(moduleId);

  return evaluateWorkflowConditionCollection({
    conditionsAll,
    conditionsAny,
    evaluate: async (condition) => evaluateCondition(
      condition,
      currentRecord,
      previousRecord,
      moduleId,
      resolvedContext
    ),
  });
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

const isMissingColumnError = (error: any, columnName: string) => {
  const code = String(error?.code || '').toUpperCase();
  if (code === 'PGRST200' || code === 'PGRST204' || code === '42703') return true;
  const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  const normalizedColumn = String(columnName || '').toLowerCase();
  return (
    text.includes(`column "${normalizedColumn}"`)
    || text.includes(`${normalizedColumn} does not exist`)
    || (text.includes('schema cache') && text.includes(normalizedColumn))
  );
};

const queryProfilesWithCommunicationFallback = async (
  filterField: 'id' | 'role_id',
  filterValues: string[],
  channel: CommunicationChannel,
) => {
  const values = (filterValues || []).map((value) => String(value || '').trim()).filter(Boolean);
  if (!values.length) return [] as Array<Record<string, any>>;
  const primarySelect = getProfileCommunicationSelect(channel);
  const primaryResult = await supabase
    .from('profiles')
    .select(primarySelect)
    .in(filterField, values);
  if (!primaryResult.error) return (primaryResult.data || []) as Array<Record<string, any>>;

  const fallbackColumn = channel === 'rubika' ? 'rubika_chat_id' : channel === 'bale' ? 'bale_chat_id' : '';
  if (!fallbackColumn || !isMissingColumnError(primaryResult.error, fallbackColumn)) {
    throw primaryResult.error;
  }

  const fallbackResult = await supabase
    .from('profiles')
    .select('id')
    .in(filterField, values);
  if (fallbackResult.error) throw fallbackResult.error;
  return (fallbackResult.data || []) as Array<Record<string, any>>;
};

const parseCommunicationRecipientToken = (value: any) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(user|role|chat_group)[:_](.+)$/i);
  if (!match) return null;
  const kind = String(match[1] || '').toLowerCase();
  const id = String(match[2] || '').trim();
  if (!id || (kind !== 'user' && kind !== 'role' && kind !== 'chat_group')) return null;
  return { kind: kind as 'user' | 'role' | 'chat_group', id };
};

const collectRecipientTargets = (
  values: any[],
  {
    directValues,
    userIds,
    roleIds,
    groupIds,
  }: {
    directValues: string[];
    userIds: Set<string>;
    roleIds: Set<string>;
    groupIds?: Set<string>;
  }
) => {
  asArray(values).forEach((entry) => {
    const token = parseCommunicationRecipientToken(entry);
    if (token?.kind === 'user') {
      userIds.add(token.id);
      return;
    }
    if (token?.kind === 'role') {
      roleIds.add(token.id);
      return;
    }
    if (token?.kind === 'chat_group' && groupIds) {
      groupIds.add(token.id);
      return;
    }
    const normalized = String(entry || '').trim();
    if (normalized) directValues.push(normalized);
  });
};

const expandChatGroupsToMentionTargets = async (
  groupIds: string[],
  userIds: Set<string>,
  roleIds: Set<string>
) => {
  const ids = Array.from(new Set((groupIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (ids.length === 0) return;

  const { data, error } = await supabase
    .from('chat_groups')
    .select('id, user_ids, role_ids')
    .in('id', ids);
  if (error) throw error;

  (data || []).forEach((group: any) => {
    (Array.isArray(group?.user_ids) ? group.user_ids : []).forEach((id: any) => {
      const normalized = String(id || '').trim();
      if (normalized) userIds.add(normalized);
    });
    (Array.isArray(group?.role_ids) ? group.role_ids : []).forEach((id: any) => {
      const normalized = String(id || '').trim();
      if (normalized) roleIds.add(normalized);
    });
  });
};

const resolveChatGroupMentionTargets = async (groupIds: string[]) => {
  const ids = Array.from(new Set((groupIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (ids.length === 0) {
    return [] as Array<{ groupId: string; userIds: string[]; roleIds: string[] }>;
  }

  const { data, error } = await supabase
    .from('chat_groups')
    .select('id, user_ids, role_ids')
    .in('id', ids);
  if (error) throw error;

  return (data || [])
    .map((group: any) => {
      const groupId = String(group?.id || '').trim();
      if (!groupId) return null;
      const userIds = Array.from(new Set(
        (Array.isArray(group?.user_ids) ? group.user_ids : [])
          .map((id: any) => String(id || '').trim())
          .filter(Boolean)
      ));
      const roleIds = Array.from(new Set(
        (Array.isArray(group?.role_ids) ? group.role_ids : [])
          .map((id: any) => String(id || '').trim())
          .filter(Boolean)
      ));
      return { groupId, userIds, roleIds };
    })
    .filter((item): item is { groupId: string; userIds: string[]; roleIds: string[] } => Boolean(item));
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

const resolveCounterpartyBotGroupChatIds = async (
  channel: 'rubika' | 'bale',
  customerIds: string[],
  supplierIds: string[]
) => {
  const normalizedCustomerIds = Array.from(new Set(customerIds.map((value) => String(value || '').trim()).filter((value) => UUID_LIKE_REGEX.test(value))));
  const normalizedSupplierIds = Array.from(new Set(supplierIds.map((value) => String(value || '').trim()).filter((value) => UUID_LIKE_REGEX.test(value))));
  const chatIds: string[] = [];

  if (normalizedCustomerIds.length > 0) {
    const { data, error } = await supabase
      .from('counterparty_bot_groups')
      .select('bot_chat_id')
      .eq('channel_type', channel)
      .eq('status', 'active')
      .in('customer_id', normalizedCustomerIds);
    if (error) throw error;
    chatIds.push(...((data || []) as Array<Record<string, any>>).map((row) => String(row?.bot_chat_id || '').trim()).filter(Boolean));
  }

  if (normalizedSupplierIds.length > 0) {
    const { data, error } = await supabase
      .from('counterparty_bot_groups')
      .select('bot_chat_id')
      .eq('channel_type', channel)
      .eq('status', 'active')
      .in('supplier_id', normalizedSupplierIds);
    if (error) throw error;
    chatIds.push(...((data || []) as Array<Record<string, any>>).map((row) => String(row?.bot_chat_id || '').trim()).filter(Boolean));
  }

  return Array.from(new Set(chatIds));
};

const resolveCounterpartyBotGroupsByChatIds = async (
  channel: 'rubika' | 'bale',
  chatIds: string[]
) => {
  const normalizedChatIds = Array.from(new Set(
    chatIds.map((value) => String(value || '').trim()).filter(Boolean)
  ));
  if (normalizedChatIds.length === 0) return [] as CounterpartyBotGroupRow[];

  const { data, error } = await supabase
    .from('counterparty_bot_groups')
    .select('id,customer_id,supplier_id,channel_type,bot_chat_id,status')
    .eq('channel_type', channel)
    .eq('status', 'active')
    .in('bot_chat_id', normalizedChatIds);
  if (error) throw error;
  return (data || []) as CounterpartyBotGroupRow[];
};

const resolveCounterpartyBotChatIdsForRecord = async (
  channel: 'rubika' | 'bale',
  moduleId: string,
  currentRecord: Record<string, any>
) => {
  const normalizedModuleId = String(moduleId || '').trim();
  const customerIds = new Set<string>();
  const supplierIds = new Set<string>();

  const directCustomerId = String(currentRecord?.customer_id || currentRecord?.related_customer || '').trim();
  const directSupplierId = String(currentRecord?.supplier_id || currentRecord?.related_supplier || '').trim();
  if (directCustomerId) customerIds.add(directCustomerId);
  if (directSupplierId) supplierIds.add(directSupplierId);

  if (normalizedModuleId === 'customers') {
    const id = String(currentRecord?.id || '').trim();
    if (id) customerIds.add(id);
  }
  if (normalizedModuleId === 'suppliers') {
    const id = String(currentRecord?.id || '').trim();
    if (id) supplierIds.add(id);
  }

  return resolveCounterpartyBotGroupChatIds(channel, Array.from(customerIds), Array.from(supplierIds));
};

const COUNTERPARTY_RELATED_RECIPIENT_FIELDS = new Set([
  'customer_id',
  'related_customer',
  'supplier_id',
  'related_supplier',
]);

const isCounterpartyRelatedRecipientField = (fieldKey: string) => {
  const raw = String(fieldKey || '').trim();
  if (COUNTERPARTY_RELATED_RECIPIENT_FIELDS.has(raw)) return true;
  const processLinked = parseProcessLinkedFieldKey(raw);
  if (
    processLinked
    && ['customers', 'suppliers'].includes(String(processLinked.moduleId || '').trim())
    && ['id', 'customer_id', 'supplier_id', 'related_customer', 'related_supplier'].includes(String(processLinked.targetFieldKey || '').trim())
  ) {
    return true;
  }
  const workflowRelated = parseWorkflowRelatedFieldKey(raw);
  return !!(
    workflowRelated
    && ['customers', 'suppliers'].includes(String(workflowRelated.targetModuleId || '').trim())
    && ['id', 'customer_id', 'supplier_id', 'related_customer', 'related_supplier'].includes(String(workflowRelated.targetFieldKey || '').trim())
  );
};

const resolveCommunicationValuesFromFields = async ({
  currentRecord,
  moduleId,
  recipientFields,
  recipientAssignees = [],
  channel,
}: {
  currentRecord: Record<string, any>;
  moduleId: string;
  recipientFields: any[];
  recipientAssignees?: any[];
  channel: CommunicationChannel;
}) => {
  const directValues: string[] = [];
  const userIds = new Set<string>();
  const roleIds = new Set<string>();
  const groupIds = new Set<string>();
  const context: WorkflowEvaluationContext = {
    moduleId,
    relatedRecordCache: new Map(),
    tagsCache: new Map(),
  };

  collectRecipientTargets(recipientAssignees, { directValues, userIds, roleIds, groupIds });

  for (const fieldKey of asArray(recipientFields)) {
    const rawValue = await resolveConditionFieldValue(
      String(fieldKey || ''),
      currentRecord,
      moduleId,
      context
    );
    collectRecipientTargets(rawValue, { directValues, userIds, roleIds, groupIds });
  }

  await expandChatGroupsToMentionTargets(Array.from(groupIds), userIds, roleIds);

  const profileRows: Array<Record<string, any>> = [];
  if (userIds.size > 0) {
    profileRows.push(...await queryProfilesWithCommunicationFallback('id', Array.from(userIds), channel));
  }
  if (roleIds.size > 0) {
    profileRows.push(...await queryProfilesWithCommunicationFallback('role_id', Array.from(roleIds), channel));
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
  recipientAssignees = [],
}: {
  currentRecord: Record<string, any>;
  moduleId: string;
  recipientFields: any[];
  recipientAssignees?: any[];
}) => {
  const userIds = new Set<string>();
  const roleIds = new Set<string>();
  const groupIds = new Set<string>();
  const context: WorkflowEvaluationContext = {
    moduleId,
    relatedRecordCache: new Map(),
    tagsCache: new Map(),
  };

  collectRecipientTargets(recipientAssignees, { directValues: [], userIds, roleIds, groupIds });

  for (const fieldKey of asArray(recipientFields)) {
    const rawValue = await resolveConditionFieldValue(
      String(fieldKey || ''),
      currentRecord,
      moduleId,
      context
    );
    collectRecipientTargets(rawValue, { directValues: [], userIds, roleIds, groupIds });
  }

  const directUserIds = Array.from(userIds);
  const directRoleIds = Array.from(roleIds);
  const groupTargets = await resolveChatGroupMentionTargets(Array.from(groupIds));
  groupTargets.forEach((group) => {
    group.userIds.forEach((id) => userIds.add(id));
    group.roleIds.forEach((id) => roleIds.add(id));
  });

  return {
    mentionUserIds: directUserIds,
    mentionRoleIds: directRoleIds,
    groupTargets,
    smsMentionUserIds: Array.from(userIds),
    smsMentionRoleIds: Array.from(roleIds),
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
    const fallbackName = buildWorkflowAttachmentFallbackName({
      moduleId,
      currentRecord,
      fieldKey: normalizedFieldKey,
    });
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

const buildAttachmentNameText = (attachments: Array<{ name?: string; url?: string }>) => {
  const lines = (attachments || [])
    .map((item, index) => {
      const name = String(item?.name || `فایل ${index + 1}`).trim() || `فایل ${index + 1}`;
      const url = String(item?.url || '').trim();
      if (!url) return name;
      return `${name}: ${url}`;
    })
    .filter(Boolean);
  if (lines.length === 0) return '';
  return `پیوست‌ها:\n${lines.join('\n')}`;
};

const buildRubikaLinkedAttachmentMessage = (
  baseText: string,
  attachments: Array<{ name?: string; url?: string }>
) => {
  const normalizedBaseText = String(baseText || '').trim();
  const lines: Array<{ text: string; linkUrl?: string }> = [];
  if (normalizedBaseText) {
    lines.push({ text: normalizedBaseText });
  }
  (attachments || []).forEach((item, index) => {
    const name = String(item?.name || `فایل ${index + 1}`).trim() || `فایل ${index + 1}`;
    const url = String(item?.url || '').trim();
    lines.push({ text: `پیوست: ${escapeRubikaAutoLinkText(name)}`, linkUrl: url || undefined });
  });

  if (lines.length === 0) {
    return { text: '', metadata: undefined as Record<string, any> | undefined };
  }

  let text = '';
  let cursor = 0;
  const metaDataParts: Array<Record<string, any>> = [];
  lines.forEach((line, index) => {
    if (index > 0) {
      text += '\n';
      cursor += 1;
    }
    const segment = String(line.text || '');
    const startIndex = cursor;
    text += segment;
    cursor += segment.length;
    if (line.linkUrl) {
      metaDataParts.push({
        type: 'Link',
        from_index: startIndex,
        length: segment.length,
        link_url: line.linkUrl,
      });
    }
  });

  return {
    text,
    metadata: metaDataParts.length > 0
      ? { meta_data_parts: metaDataParts }
      : undefined,
  };
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
  if (valueMode === 'formula') {
    const expressionConfig = config?.formula_expression_config;
    if (!expressionConfig || typeof expressionConfig !== 'object') return null;
    return evaluateFormulaExpression(expressionConfig, currentRecord || {}).value;
  }
  return config?.value ?? null;
};

const parseWorkflowObject = (value: any): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const resolveCurrentTaskIdForNextStageAction = (
  moduleId: string,
  currentRecord: Record<string, any>
) => String(
  currentRecord?.task_id
  || currentRecord?.__task__id
  || (moduleId === 'tasks' ? currentRecord?.id : '')
  || ''
).trim();

const getProcessTransferScope = (
  moduleId: string,
  currentRecord: Record<string, any>
) => {
  const processRunId = String(currentRecord?.process_run_id || '').trim();
  const processGroupId = String(currentRecord?.process_group_id || '').trim();
  const sourceModuleId = String(currentRecord?.source_module_id || (moduleId !== 'tasks' ? moduleId : '') || '').trim();
  const sourceRecordId = String(currentRecord?.source_record_id || (moduleId !== 'tasks' ? currentRecord?.id : '') || '').trim();
  return { processRunId, processGroupId, sourceModuleId, sourceRecordId };
};

const fetchProcessTransferTasks = async (
  moduleId: string,
  currentRecord: Record<string, any>
) => {
  const taskId = resolveCurrentTaskIdForNextStageAction(moduleId, currentRecord);
  const scope = getProcessTransferScope(moduleId, currentRecord);
  const select = 'id, name, status, task_type, assignee_id, assignee_role_id, assignee_type, sort_order, process_group_id, process_run_id, process_run_stage_id, recurrence_info, source_module_id, source_record_id, source_template_id';
  const fetchRows = async (applyScope: (query: any) => any) => {
    let query = supabase
      .from('tasks')
      .select(select);
    query = applyScope(query);
    const { data, error } = await query.order('sort_order', { ascending: true });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  };

  if (scope.processRunId) {
    const rows = await fetchRows((query) => query.eq('process_run_id', scope.processRunId));
    if (rows.some((row) => String(row?.id || '').trim() === taskId)) return rows;
  }

  if (scope.processGroupId) {
    const rows = await fetchRows((query) => query.eq('process_group_id', scope.processGroupId));
    if (rows.some((row) => String(row?.id || '').trim() === taskId)) return rows;
  }

  if (scope.sourceModuleId && scope.sourceRecordId) {
    const rows = await fetchRows((query) => {
      let scoped = query
        .eq('source_module_id', scope.sourceModuleId)
        .eq('source_record_id', scope.sourceRecordId);
      const templateId = String(currentRecord?.source_template_id || '').trim();
      if (templateId) scoped = scoped.eq('source_template_id', templateId);
      return scoped;
    });
    if (rows.some((row) => String(row?.id || '').trim() === taskId)) return rows;
  }

  if (!taskId) return [];
  return fetchRows((query) => query.eq('id', taskId));
};

const resolveNextStageTargetTask = async (
  moduleId: string,
  currentRecord: Record<string, any>,
  offset: 1 | 2
) => {
  const taskId = resolveCurrentTaskIdForNextStageAction(moduleId, currentRecord);
  if (!taskId) return null;

  const rows = await fetchProcessTransferTasks(moduleId, currentRecord);
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
  const currentIndex = sorted.findIndex((row) => String(row?.id || '').trim() === taskId);
  if (currentIndex < 0) return null;
  return sorted[currentIndex + offset] || null;
};

const buildAssigneePatch = (value: any) => {
  const raw = Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
  const match = raw.match(/^(user|role)[:_](.+)$/i);
  if (!match) {
    return {
      assignee_id: raw || null,
      assignee_role_id: null,
      assignee_type: raw ? 'user' : null,
    };
  }
  const id = String(match[2] || '').trim() || null;
  if (String(match[1] || '').toLowerCase() === 'role') {
    return {
      assignee_id: null,
      assignee_role_id: id,
      assignee_type: id ? 'role' : null,
    };
  }
  return {
    assignee_id: id,
    assignee_role_id: null,
    assignee_type: id ? 'user' : null,
  };
};

const updateNextStageTaskField = async (
  targetTask: Record<string, any>,
  fieldKey: string,
  nextValue: any
) => {
  const normalizedFieldKey = String(fieldKey || '').trim();
  const targetTaskId = String(targetTask?.id || '').trim();
  if (!normalizedFieldKey || !targetTaskId) return;

  const recurrence = parseWorkflowObject(targetTask?.recurrence_info);
  const customFields = getProcessTaskCustomFieldsFromRecurrence(recurrence);
  const isCustomField = customFields.some((field) => String(field?.key || '').trim() === normalizedFieldKey);

  if (isCustomField) {
    const currentValues = mergeProcessTaskCustomFieldValues(
      customFields,
      getProcessTaskCustomFieldValuesFromRecurrence(recurrence)
    );
    const nextRecurrence = {
      ...recurrence,
      [PROCESS_TASK_CUSTOM_FIELDS_KEY]: customFields,
      [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: {
        ...currentValues,
        [normalizedFieldKey]: nextValue,
      },
    };
    const { error } = await supabase
      .from('tasks')
      .update({ recurrence_info: nextRecurrence, updated_at: new Date().toISOString() })
      .eq('id', targetTaskId);
    if (error) throw error;
    targetTask.recurrence_info = nextRecurrence;
    return;
  }

  const patch = normalizedFieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY
    ? buildAssigneePatch(nextValue)
    : { [normalizedFieldKey]: nextValue };
  const { error } = await supabase
    .from('tasks')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', targetTaskId);
  if (error) throw error;
  Object.assign(targetTask, patch);
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

const loadProcessTemplateName = async (templateId: string) => {
  const { data, error } = await supabase
    .from('process_templates')
    .select('name')
    .eq('id', templateId)
    .maybeSingle();
  if (error) return null;
  return String((data as any)?.name || '').trim() || null;
};

const mapTemplateStagesToDraft = (templateId: string, stages: any[], templateName?: string | null) =>
  mapProcessTemplateStagesToDraft(templateId, stages, { templateName });

export const executeWorkflowAction = async (
  action: WorkflowAction,
  moduleId: string,
  currentRecord: Record<string, any>
) => {
  const config = action?.config || {};

  if (action.type === 'send_sms') {
    const messageText = (await renderWorkflowTemplate(String(config.message || ''), currentRecord, moduleId)).trim();
    if (!messageText) return;
    const recipientsFromFields = await resolveCommunicationValuesFromFields({
      currentRecord,
      moduleId,
      recipientFields: asArray(config.recipient_fields),
      recipientAssignees: asArray(config.recipient_assignees),
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
    const noteText = (await renderWorkflowTemplate(String(config.note_text || ''), currentRecord, moduleId, { bold: true })).trim();
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
      recipientAssignees: asArray(config.recipient_assignees),
    });
    const baseMetadata = {
      source_type: 'system',
      workflow_action_type: action.type,
      workflow_action_id: (action as any)?.id || null,
    };
    const noteRows: Record<string, any>[] = [];
    const hasDirectRecipients = recipients.mentionUserIds.length > 0 || recipients.mentionRoleIds.length > 0;
    if (hasDirectRecipients || recipients.groupTargets.length === 0) {
      noteRows.push({
        module_id: scope.module_id,
        record_id: scope.record_id,
        content: serializeNoteContent(noteText, attachments),
        mention_user_ids: recipients.mentionUserIds,
        mention_role_ids: recipients.mentionRoleIds,
        source_type: 'system',
        metadata: baseMetadata,
      });
    }
    recipients.groupTargets.forEach((group) => {
      noteRows.push({
        module_id: scope.module_id,
        record_id: scope.record_id,
        content: serializeNoteContent(noteText, attachments),
        mention_user_ids: group.userIds,
        mention_role_ids: group.roleIds,
        source_type: 'system',
        metadata: {
          ...baseMetadata,
          chat_group_id: group.groupId,
        },
      });
    });
    await insertNotesWithFallback(noteRows);
    if (action.type === 'send_note_sms') {
      await sendNoteSmsNotifications({
        authorName: 'سیستم',
        noteText,
        mentionUserIds: recipients.smsMentionUserIds,
        mentionRoleIds: recipients.smsMentionRoleIds,
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
    const rawMessageText = (await renderWorkflowTemplate(String(config.message || ''), currentRecord, moduleId)).trim();
    const attachments = isRubika
      ? await resolveNoteAttachmentsFromFields({
          currentRecord,
          moduleId,
          attachmentFields: asArray(config.attachment_fields),
        })
      : [];
    if (!rawMessageText && attachments.length === 0) return;
    const externalAttachments = attachments.length > 0
      ? await shortenAttachmentsForExternalShare(attachments, {
          moduleId,
          recordId: currentRecord?.id ? String(currentRecord.id) : null,
          metadata: {
            source_type: 'workflow',
            workflow_action_type: action.type,
            workflow_action_id: (action as any)?.id || null,
          },
        })
      : [];
    const rubikaLinkedMessage = isRubika && externalAttachments.length > 0
      ? buildRubikaLinkedAttachmentMessage(rawMessageText, externalAttachments)
      : null;
    const messageText = isRubika && externalAttachments.length > 0
      ? (String(rubikaLinkedMessage?.text || '').trim() || 'پیوست ارسال شد')
      : rawMessageText;
    const fallbackText = isRubika && externalAttachments.length > 0
      ? [rawMessageText, buildAttachmentNameText(externalAttachments)].filter(Boolean).join('\n')
      : undefined;
    const titleText = (await renderWorkflowTemplate(String(config.title || ''), currentRecord, moduleId)).trim();
    const configuredRecipientFields = asArray(config.recipient_fields)
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    const configuredRecipientAssignees = asArray(config.recipient_assignees)
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    const recipientsFromFields = await resolveCommunicationValuesFromFields({
      currentRecord,
      moduleId,
      recipientFields: configuredRecipientFields,
      recipientAssignees: configuredRecipientAssignees,
      channel,
    });
    const recipientsManual = asArray(config.manual_chat_ids)
      .map((chatId) => String(chatId || '').trim())
      .filter(Boolean);
    const directFallbackChatId = isRubika
      ? String(currentRecord?.rubika_chat_id || '').trim()
      : String(currentRecord?.bale_chat_id || '').trim();
    const hasExplicitRecipients = configuredRecipientFields.length > 0 || configuredRecipientAssignees.length > 0;
    const canUseCounterpartyFallbackForExplicitRecipients = isRubika
      && configuredRecipientFields.some((fieldKey) => isCounterpartyRelatedRecipientField(fieldKey))
      && recipientsFromFields.length === 0;
    const fallbackRecipients =
      recipientsFromFields.length > 0
      || recipientsManual.length > 0
      || (hasExplicitRecipients && !canUseCounterpartyFallbackForExplicitRecipients)
        ? []
        : [
            ...[directFallbackChatId].filter(Boolean),
            ...(await resolveCounterpartyBotChatIdsForRecord(channel, moduleId, currentRecord)),
          ];
    const recipients = Array.from(
      new Set([...recipientsFromFields, ...recipientsManual, ...fallbackRecipients])
    ).filter(Boolean);
    if (recipients.length === 0) return;

    const handledChatIds = new Set<string>();
    if (isRubika) {
      const groupRows = await resolveCounterpartyBotGroupsByChatIds('rubika', recipients);
      for (const group of groupRows) {
        const groupChatId = String(group?.bot_chat_id || '').trim();
        if (!groupChatId || handledChatIds.has(groupChatId)) continue;
        handledChatIds.add(groupChatId);
        await sendCounterpartyBotGroupMessage({
          group,
          text: messageText,
          extraPayload: rubikaLinkedMessage?.metadata ? { metadata: rubikaLinkedMessage.metadata } : undefined,
          fallbackText,
          payload: {
            attachments,
            workflow_action_type: action.type,
            workflow_action_id: (action as any)?.id || null,
          },
          messageType: attachments.length > 0 ? 'file' : 'text',
        });
      }
    }

    for (const chatId of recipients.filter((recipient) => !handledChatIds.has(String(recipient || '').trim()))) {
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

  if (action.type === 'send_to_next_stages') {
    const fieldMeta = parseProcessNextStageFieldKey(String(config.field || '').trim());
    if (!fieldMeta) return;
    const targetTask = await resolveNextStageTargetTask(moduleId, currentRecord, fieldMeta.offset);
    if (!targetTask) return;
    const nextValue = await resolveConfiguredActionValue(moduleId, config, currentRecord);
    await updateNextStageTaskField(targetTask, fieldMeta.fieldKey, nextValue);
    return;
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
      if (mapping?.mode === 'formula') {
        payload[targetField] = mapping?.formula_expression_config && typeof mapping.formula_expression_config === 'object'
          ? evaluateFormulaExpression(mapping.formula_expression_config, currentRecord || {}).value
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

    const [stages, templateName] = await Promise.all([
      loadProcessTemplateStages(templateId),
      loadProcessTemplateName(templateId),
    ]);
    const patch = {
      process_template_id: templateId,
      [draftFieldKey]: mapTemplateStagesToDraft(templateId, stages, templateName),
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
  recordId: string,
  runType: WorkflowRunType = 'event'
) => {
  const { data, error } = await supabase
    .from('workflow_logs')
    .select('id')
    .eq('workflow_id', workflowId)
    .eq('run_type', runType)
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
  runType = 'event',
  errorMessage,
}: {
  workflow: WorkflowRecord;
  moduleId: string;
  currentRecord: Record<string, any>;
  event: WorkflowEvent;
  status: 'success' | 'failed';
  runType?: WorkflowRunType;
  errorMessage?: string;
}) => {
  const orgId = await resolveWorkflowOrgId(currentRecord);
  const recordId = String(currentRecord?.id || '').trim() || null;
  await supabase.from('workflow_logs').insert({
    workflow_id: workflow.id,
    org_id: orgId,
    run_type: runType,
    status,
    module_id: moduleId,
    record_id: recordId,
    message: errorMessage || null,
    details: {
      event,
      execution_mode: workflow.execution_mode || 'first_match',
      action_count: Array.isArray(workflow.actions) ? workflow.actions.length : 0,
      trigger_type: workflow.trigger_type || null,
    },
  });
};

const executeWorkflowForRecord = async ({
  workflow,
  moduleId,
  currentRecord,
  previousRecord = null,
  event,
  runType,
}: {
  workflow: WorkflowRecord;
  moduleId: string;
  currentRecord: Record<string, any>;
  previousRecord?: Record<string, any> | null | undefined;
  event: WorkflowEvent;
  runType: WorkflowRunType;
}) => {
  const matched = await evaluateWorkflow(workflow, currentRecord, previousRecord, moduleId);
  if (!matched) {
    return { matched: false, success: false };
  }

  const executionMode = String(workflow.execution_mode || 'first_match');
  const recordId = String(currentRecord?.id || '').trim();
  if (executionMode === 'first_match' && recordId) {
    const alreadyExecuted = await hasWorkflowLogForRecord(workflow.id, moduleId, recordId, runType);
    if (alreadyExecuted) {
      return { matched: true, success: false, skippedByExecutionMode: true };
    }
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
    const errorMessage = actionErrors.join(' | ');
    await logWorkflowRun({
      workflow,
      moduleId,
      currentRecord,
      event,
      runType,
      status: 'failed',
      errorMessage,
    });
    return { matched: true, success: false, errorMessage };
  }

  await logWorkflowRun({
    workflow,
    moduleId,
    currentRecord,
    event,
    runType,
    status: 'success',
  });
  return { matched: true, success: true };
};

export const runWorkflowsForEvent = async ({
  moduleId,
  event,
  currentRecord,
  previousRecord = null,
}: RunWorkflowArgs) => {
  if (!moduleId || !currentRecord) return;
  const hydratedCurrentRecord = await hydrateWorkflowCurrentRecord(moduleId, currentRecord);
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
      const result = await executeWorkflowForRecord({
        workflow,
        moduleId,
        currentRecord: hydratedCurrentRecord,
        previousRecord,
        event,
        runType: 'event',
      });
      if (result.success) {
        await supabase
          .from('workflows')
          .update({ last_run_at: new Date().toISOString() })
          .eq('id', workflow.id);
      }
    } catch (err: any) {
      console.error(`Workflow execution failed (${workflow?.name || workflow?.id}):`, err);
      try {
        await logWorkflowRun({
          workflow,
          moduleId,
          currentRecord: hydratedCurrentRecord,
          event,
          runType: 'event',
          status: 'failed',
          errorMessage: String(err?.message || err || 'workflow execution failed'),
        });
      } catch (logErr) {
        console.error('Workflow log insert failed:', logErr);
      }
    }
  }
};

const sanitizeIntervalWorkflow = (workflow: WorkflowRecord): WorkflowRecord => ({
  ...workflow,
  conditions_all: (Array.isArray(workflow?.conditions_all) ? workflow.conditions_all : [])
    .filter((condition) => isRunnableIntervalCondition(condition as WorkflowCondition)),
  conditions_any: (Array.isArray(workflow?.conditions_any) ? workflow.conditions_any : [])
    .filter((condition) => isRunnableIntervalCondition(condition as WorkflowCondition)),
});

const claimIntervalWorkflowRun = async (
  workflowId: string,
  expectedLastRunAt: string | null,
  claimedAtIso: string
) => {
  try {
    const { data, error } = await supabase.rpc('claim_workflow_interval_run', {
      p_workflow_id: workflowId,
      p_expected_last_run_at: expectedLastRunAt,
      p_claimed_at: claimedAtIso,
    });
    if (error) throw error;
    return data === true;
  } catch {
    let query = supabase
      .from('workflows')
      .update({ last_run_at: claimedAtIso })
      .eq('id', workflowId)
      .eq('is_active', true)
      .eq('trigger_type', 'interval')
      .select('id')
      .limit(1);

    if (expectedLastRunAt) {
      query = query.eq('last_run_at', expectedLastRunAt);
    } else {
      query = query.is('last_run_at', null);
    }

    const { data, error } = await query;
    if (error) throw error;
    return Array.isArray(data) && data.length > 0;
  }
};

export const runWorkflowsIntervalTick = async ({
  moduleId,
  workflowId,
  maxWorkflows = 20,
  defaultBatchSize = 200,
}: {
  moduleId?: string | null;
  workflowId?: string | null;
  maxWorkflows?: number;
  defaultBatchSize?: number;
} = {}) => {
  const now = new Date();
  const normalizedWorkflowLimit = Math.max(1, Math.min(100, Number(maxWorkflows || 20)));
  const normalizedDefaultBatch = Math.max(10, Math.min(1000, Number(defaultBatchSize || 200)));

  let query = supabase
    .from('workflows')
    .select('*')
    .eq('is_active', true)
    .eq('trigger_type', 'interval')
    .order('updated_at', { ascending: true })
    .limit(normalizedWorkflowLimit);

  const normalizedModuleId = String(moduleId || '').trim();
  if (normalizedModuleId) query = query.eq('module_id', normalizedModuleId);
  const normalizedWorkflowId = String(workflowId || '').trim();
  if (normalizedWorkflowId) query = query.eq('id', normalizedWorkflowId);

  const { data, error } = await query;
  if (error) throw error;

  const workflows = (data || []) as WorkflowRecord[];
  const stats = {
    checkedWorkflows: workflows.length,
    claimedWorkflows: 0,
    processedRecords: 0,
    executedWorkflows: 0,
    failedRuns: 0,
  };

  for (const rawWorkflow of workflows) {
    const workflow = sanitizeIntervalWorkflow(rawWorkflow);
    const due = isIntervalDue({
      lastRunAt: workflow.last_run_at || null,
      intervalValue: clampIntervalValue(workflow.interval_value, 1),
      intervalUnit: normalizeIntervalUnit(workflow.interval_unit || 'day'),
      intervalAt: workflow.interval_at || null,
      now,
    });
    if (!due) continue;

    const claimedAtIso = now.toISOString();
    const claimed = await claimIntervalWorkflowRun(
      String(workflow.id || '').trim(),
      String(workflow.last_run_at || '').trim() || null,
      claimedAtIso
    );
    if (!claimed) continue;
    stats.claimedWorkflows += 1;

    const targetModuleId = String(workflow.module_id || '').trim();
    if (!targetModuleId) continue;
    const moduleTable = getModuleTable(targetModuleId);
    const perWorkflowBatchSize = Math.max(
      1,
      Math.min(5000, Number(workflow.batch_size || normalizedDefaultBatch))
    );

    const { data: records, error: recordsError } = await supabase
      .from(moduleTable)
      .select('*')
      .limit(perWorkflowBatchSize);
    if (recordsError) {
      console.error('Workflow interval record fetch failed:', recordsError);
      continue;
    }

    const rows = Array.isArray(records) ? records : [];
    for (const row of rows) {
      stats.processedRecords += 1;
      try {
        const result = await executeWorkflowForRecord({
          workflow,
          moduleId: targetModuleId,
          currentRecord: row || {},
          previousRecord: null,
          event: 'interval',
          runType: 'scheduled',
        });
        if (result.success) {
          stats.executedWorkflows += 1;
        } else if (result.errorMessage) {
          stats.failedRuns += 1;
        }
      } catch (runErr) {
        stats.failedRuns += 1;
        console.error(`Scheduled workflow execution failed (${workflow?.name || workflow?.id}):`, runErr);
      }
    }
  }

  return stats;
};
