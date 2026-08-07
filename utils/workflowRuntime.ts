import { MODULES } from '../moduleRegistry';
import { FieldType, ModuleField } from '../types';
import { supabase } from '../supabaseClient';
import { loadScopedIntegrationSettings } from './integrationSettings';
import { buildResolvedAssigneeCombo, parseAssigneeValue } from './assigneeValue';
import { buildClientFallbackSystemCode, supportsSystemCode } from './systemCode';
import { buildWebFormPublicPath } from './webForms';
import { sendBotMessageViaGateway, sendCounterpartyBotGroupMessage } from './botGateway';
import { getHolidaySummaryForDate } from './holidayCalendar';
import { formatTemplateValueByField, resolveTemplateOptionLabelMaps } from './messageTemplateRenderer';
import { normalizeNoteScope } from './noteScope';
import { parseProcessLinkedFieldKey, parseProcessLinkMap } from './processTargets';
import { resolveWorkflowProcessDraftFieldKey } from './workflowHelpers';
import {
  parseWorkflowNoteRecipientFieldKey,
  parseWorkflowRelatedFieldKey,
  parseWorkflowMultiRelationFieldKey,
  parseProcessNextStageFieldKey,
  WORKFLOW_ASSIGNEE_FIELD_KEY,
  WORKFLOW_RECORD_LINK_FIELD_KEY,
  WorkflowNoteRecipientStrategy,
  WorkflowAction,
  WorkflowCondition,
} from './workflowTypes';
import {
  getProcessTaskCustomFieldValuesFromRecurrence,
  getProcessTaskCustomFieldsFromRecurrence,
  mergeProcessTaskCustomFieldValues,
  PROCESS_TASK_CUSTOM_FIELDS_KEY,
  PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY,
} from './processTaskCustomFields';
import { sendSmsViaGateway } from './smsGateway';
import { sendEmailViaGateway } from './emailGateway';
import { insertNotesWithFallback, sendNoteSmsNotifications } from './noteDispatch';
import { NoteAttachment, serializeNoteContent } from './noteContent';
import { fetchAssigneeDirectory, fetchRecordTagsMap } from './referenceData';
import { shortenAttachmentsForExternalShare } from './fileShortLinks';
import { getOrCreateShortRecordUrl } from './recordShortLinks';
import { resolveWorkflowMessageAttachments } from './workflowAttachments';
import {
  getWorkflowRecipientFieldBotChannel,
  getWorkflowRecipientConfig,
} from '../shared/workflowMessagingContract';
import { evaluateFormulaExpression } from './formulaRuntime';
import { getRecordTitle } from './recordTitle';
import { mapProcessTemplateStagesToDraft } from './processRunRuntime';
import { activateInitialProcessRunNodes, activateProcessStageAction } from './processStageActivation';
import { loadProcessTemplateStages as loadProcessTemplateStagesShared } from './processTemplateStages';
import { parseSurveyTemplateFieldKey } from './surveyTemplates';
import { resolveSystemWorkflowStoryPublisher } from './workflowStoryPublisher';
import { buildAiRecordCreationSchema } from './aiRecordCreation';
import { lockRecord } from './recordLockRuntime';
import { shouldSkipRecordForAutomation } from './recycleBinGuards';
import { buildTaskSourceInitialValues } from './taskMeta';
import { getCanonicalModuleFields } from './recordVariableCatalog';
import { filterActiveGroupMentionTargets, filterActiveMentionTargets, isActiveProfileRow } from './activeProfileRecipients';
import {
  evaluateConditionCollection as evaluateCentralConditionCollection,
  evaluateCoreConditionOperator,
  renderTemplateAsync as renderCentralTemplateAsync,
} from '../shared/recordRuntime';

type WorkflowEvent = 'create' | 'upsert';
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

const isInactiveProfileRecord = (moduleId: string, record: Record<string, any>) =>
  String(moduleId || '').trim() === 'profiles' && record?.is_active === false;

const parseDate = (value: any): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const normalizeOccasionText = (value: any) => normalizeSearchText(value);

const normalizeOccasionValues = (value: any) =>
  normalizeListValues(value)
    .map((item) => normalizeOccasionText(item))
    .filter(Boolean);

const occasionMatches = (title: string, expected: string) => {
  const normalizedTitle = normalizeOccasionText(title);
  const normalizedExpected = normalizeOccasionText(expected);
  return !!normalizedExpected && (
    normalizedTitle === normalizedExpected
    || normalizedTitle.includes(normalizedExpected)
    || normalizedExpected.includes(normalizedTitle)
  );
};

const dateHasAnyOccasion = async (value: any, expectedValue: any) => {
  const expected = normalizeOccasionValues(expectedValue);
  if (expected.length === 0) return false;
  const summary = await getHolidaySummaryForDate(value);
  const titles = (summary?.occasions || []).map((item) => item.title).filter(Boolean);
  return titles.some((title) => expected.some((item) => occasionMatches(title, item)));
};

const dateIsDaysBeforeOccasion = async (value: any, expectedValue: any) => {
  const date = parseDate(value);
  if (!date) return false;
  const config = expectedValue && typeof expectedValue === 'object' && !Array.isArray(expectedValue)
    ? expectedValue
    : {};
  const days = Number(config?.days ?? config?.count ?? 0);
  if (!Number.isFinite(days) || days < 0) return false;
  const occasion = config?.occasion ?? config?.event ?? config?.value;
  if (isEmptyValue(occasion)) return false;
  return dateHasAnyOccasion(addDays(date, days), occasion);
};

export const formatWorkflowTemplateValue = (value: unknown): string => {
  return formatTemplateValueByField({ value });
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

const ASSIGNEE_PROFILE_TEMPLATE_FIELDS: Record<string, string> = {
  assignee_full_name: 'full_name',
  assignee_name: 'full_name',
  assignee_mobile: 'mobile_1',
  assignee_mobile_1: 'mobile_1',
  assignee_job_title: 'job_title',
  assignee_voip_operator_code: 'voip_operator_code',
  assignee_voip_extension: 'voip_extension',
};

const parseAssigneeProfileTemplateField = (fieldKey: string) => {
  const normalized = String(fieldKey || '').trim();
  if (!normalized) return null;
  if (ASSIGNEE_PROFILE_TEMPLATE_FIELDS[normalized]) {
    return { type: 'user' as const, profileField: ASSIGNEE_PROFILE_TEMPLATE_FIELDS[normalized] };
  }
  const dotMatch = normalized.match(/^(?:assignee|__workflow_assignee)\.(full_name|mobile_1|mobile|job_title|voip_operator_code|voip_extension)$/i);
  if (dotMatch) {
    const rawField = String(dotMatch[1] || '').trim();
    return { type: 'user' as const, profileField: rawField === 'mobile' ? 'mobile_1' : rawField };
  }
  if (normalized === 'assignee_role_title' || normalized === 'assignee.role_title') {
    return { type: 'role' as const, profileField: 'title' };
  }
  return null;
};

const resolveAssigneeProfileTemplateValue = async (
  fieldKey: string,
  record: Record<string, any>
) => {
  const meta = parseAssigneeProfileTemplateField(fieldKey);
  if (!meta) return undefined;
  const combo = buildResolvedAssigneeCombo(record);
  const parsed = parseAssigneeValue(combo || record?.assignee_id || record?.assignee_role_id, record?.assignee_role_id ? 'role' : 'user');
  if (!parsed.assigneeId) return null;
  const directory = await fetchAssigneeDirectory(supabase).catch(() => null);
  if (!directory) return null;
  if (meta.type === 'role' || parsed.assigneeType === 'role') {
    const role = (directory.roles || []).find((item) => String(item?.id || '').trim() === parsed.assigneeId);
    return meta.type === 'role' ? String(role?.title || '').trim() || null : null;
  }
  const user = (directory.users || []).find((item) => String(item?.id || '').trim() === parsed.assigneeId);
  return user ? (user as any)?.[meta.profileField] ?? null : null;
};

const resolveWorkflowTemplateValue = async (
  fieldKey: string,
  record: Record<string, any>,
  moduleId: string | null | undefined,
  context: WorkflowEvaluationContext
) => {
  const assigneeProfileValue = await resolveAssigneeProfileTemplateValue(fieldKey, record);
  if (assigneeProfileValue !== undefined) return assigneeProfileValue;
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
  return renderCentralTemplateAsync(
    rawTemplate,
    (fieldKey) => resolveWorkflowTemplateValue(fieldKey, record, moduleId, context),
    (value, fieldKey) => formatTemplateValueByField({
      value,
      moduleId,
      fieldKey,
      sourceRecord: record,
      assigneeDirectory,
      optionLabelMaps,
    }),
    { bold: options.bold, unresolved: 'blank' },
  );
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

const resolveWorkflowPublicBaseUrl = async () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  try {
    const { data, error } = await loadScopedIntegrationSettings(supabase as any, {
      connectionType: 'site',
      columns: 'settings',
      isActive: true,
    });
    if (error) throw error;
    const settings = data && typeof (data as any)?.settings === 'object'
      ? ((data as any).settings as Record<string, any>)
      : {};
    const configuredBaseUrl = String(settings.base_url || '').trim();
    if (configuredBaseUrl) {
      return configuredBaseUrl.replace(/\/+$/, '');
    }
  } catch {
    // noop
  }
  return '';
};

const buildWorkflowWebFormUrl = async (slug?: string | null, accessToken?: string | null) => {
  const path = buildWebFormPublicPath(slug, accessToken);
  const baseUrl = await resolveWorkflowPublicBaseUrl();
  if (!baseUrl) return path;
  if (/^https?:\/\//i.test(path)) return path;
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
};

const buildWorkflowRecordUrl = async (targetModuleId: string, recordId: unknown) => {
  const normalizedModuleId = String(targetModuleId || '').trim();
  const normalizedRecordId = String(recordId || '').trim();
  if (!normalizedModuleId || !normalizedRecordId) return '';
  return getOrCreateShortRecordUrl(normalizedModuleId, normalizedRecordId);
};

const resolveConditionFieldValue = async (
  fieldKey: string,
  record: Record<string, any> | null | undefined,
  moduleId: string,
  context: WorkflowEvaluationContext
): Promise<any> => {
  if (!record) return null;

  const resolveRelatedFieldValue = async (
    sourceRecord: Record<string, any> | null | undefined,
    relatedFieldMeta: NonNullable<ReturnType<typeof parseWorkflowRelatedFieldKey>>
  ) => {
    if (!sourceRecord) return relatedFieldMeta.targetFieldKey === 'tags' ? [] : null;
    const relationId = String(sourceRecord?.[relatedFieldMeta.relationFieldKey] || '').trim();
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

    if (relatedFieldMeta.targetFieldKey === WORKFLOW_RECORD_LINK_FIELD_KEY) {
      return buildWorkflowRecordUrl(relatedFieldMeta.targetModuleId, relatedRecord.id);
    }

    if (relatedFieldMeta.targetFieldKey === 'tags') {
      const relatedRecordId = String(relatedRecord?.id || '').trim();
      if (!relatedRecordId) return [];
      return fetchRecordTags(relatedFieldMeta.targetModuleId, relatedRecordId, context);
    }

    return relatedRecord?.[relatedFieldMeta.targetFieldKey];
  };

  if (fieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY) {
    return buildResolvedAssigneeCombo(record);
  }

  if (fieldKey === WORKFLOW_RECORD_LINK_FIELD_KEY) {
    return buildWorkflowRecordUrl(moduleId, record.id);
  }

  if (fieldKey === `__task__${WORKFLOW_RECORD_LINK_FIELD_KEY}`) {
    return buildWorkflowRecordUrl('tasks', record.__task__id || record.task_id || (moduleId === 'tasks' ? record.id : ''));
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

    if (processLinkedMeta.targetFieldKey === WORKFLOW_RECORD_LINK_FIELD_KEY) {
      return buildWorkflowRecordUrl(processLinkedMeta.moduleId, linkedRecordId);
    }

    if (processLinkedMeta.targetFieldKey === 'tags') {
      return fetchRecordTags(processLinkedMeta.moduleId, linkedRecordId, context);
    }

    const linkedRelatedFieldMeta = parseWorkflowRelatedFieldKey(processLinkedMeta.targetFieldKey);
    if (linkedRelatedFieldMeta) {
      return resolveRelatedFieldValue(linkedRecord, linkedRelatedFieldMeta);
    }

    return linkedRecord?.[processLinkedMeta.targetFieldKey];
  }

  const multiRelationMeta = parseWorkflowMultiRelationFieldKey(fieldKey);
  if (multiRelationMeta) {
    const rawIds = record?.[multiRelationMeta.fieldKey];
    const ids = Array.from(new Set(normalizeMultiRelationIds(rawIds)));
    if (ids.length === 0) return [];
    const values: string[] = [];
    for (const id of ids) {
      const relatedRecord = await fetchRelatedRecord(multiRelationMeta.targetModuleId, id, context);
      const fieldValue = relatedRecord?.[multiRelationMeta.targetPhoneFieldKey];
      if (fieldValue === null || fieldValue === undefined || fieldValue === '') continue;
      values.push(...asArray(fieldValue).map((item) => String(item || '').trim()).filter(Boolean));
    }
    return normalizeMultiRelationCommunicationValues(
      multiRelationMeta.targetModuleId,
      multiRelationMeta.targetPhoneFieldKey,
      values,
    );
  }

  const relatedFieldMeta = parseWorkflowRelatedFieldKey(fieldKey);
  if (relatedFieldMeta) {
    return resolveRelatedFieldValue(record, relatedFieldMeta);
  }

  const surveyTemplateFieldKey = parseSurveyTemplateFieldKey(fieldKey);
  if (surveyTemplateFieldKey) {
    const templateValues = record?.template_field_values && typeof record.template_field_values === 'object'
      ? record.template_field_values
      : {};
    return templateValues?.[surveyTemplateFieldKey];
  }

  return record?.[fieldKey];
};

const evaluateResolvedCondition = async (
  condition: WorkflowCondition,
  currentValue: any,
  previousValue: any
): Promise<boolean> => {
  const operator = String(condition?.operator || 'eq');
  const expectedValue = condition?.value;
  const coreResult = evaluateCoreConditionOperator({
    operator,
    currentValue,
    previousValue,
    expectedValue,
  });
  if (coreResult !== undefined) return coreResult;

  switch (operator) {
    case 'is_friday': {
      const summary = await getHolidaySummaryForDate(currentValue);
      return !!summary?.isFriday;
    }
    case 'is_official_holiday': {
      const summary = await getHolidaySummaryForDate(currentValue);
      return !!summary?.isOfficialHoliday;
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

export const evaluateWorkflowConditionCollection = async ({
  conditionsAll = [],
  conditionsAny = [],
  evaluate,
}: {
  conditionsAll?: WorkflowCondition[] | null;
  conditionsAny?: WorkflowCondition[] | null;
  evaluate: (condition: WorkflowCondition) => Promise<boolean>;
}) => {
  return evaluateCentralConditionCollection({
    conditionsAll: Array.isArray(conditionsAll) ? conditionsAll : [],
    conditionsAny: Array.isArray(conditionsAny) ? conditionsAny : [],
    evaluate,
  });
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
  const { data: smsRow, error: smsErr } = await loadScopedIntegrationSettings(supabase as any, {
    connectionType: 'sms',
    isActive: true,
  });
  if (smsErr) throw smsErr;
  const smsSettingsRow = smsRow as Record<string, any> | null | undefined;
  if (!smsSettingsRow) throw new Error('تنظیمات سامانه پیامک فعال نیست.');

  const settings = (smsSettingsRow.settings || {}) as Record<string, any>;
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

type CommunicationChannel = 'sms' | 'email' | 'telegram' | 'bale' | 'rubika';
type WorkflowBotChannel = 'rubika' | 'telegram' | 'bale';
const WORKFLOW_BOT_CHANNEL_PRIORITY: WorkflowBotChannel[] = ['rubika', 'telegram', 'bale'];

const getProfileCommunicationSelect = (channel: CommunicationChannel) => {
  if (channel === 'sms') return 'id, is_active, mobile_1';
  if (channel === 'email') return 'id, is_active, email';
  if (channel === 'telegram') return 'id, is_active, telegram_chat_id';
  if (channel === 'bale') return 'id, is_active, bale_chat_id';
  return 'id, is_active, rubika_chat_id';
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
  if (!primaryResult.error) {
    return ((primaryResult.data || []) as Array<Record<string, any>>).filter(isActiveProfileRow);
  }

  const fallbackColumn = channel === 'rubika'
    ? 'rubika_chat_id'
    : channel === 'bale'
      ? 'bale_chat_id'
      : channel === 'telegram'
        ? 'telegram_chat_id'
        : '';
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

const normalizeMultiRelationIds = (value: any): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeMultiRelationIds(item));
  }
  if (value && typeof value === 'object') {
    return [
      String((value as any)?.id || '').trim(),
      String((value as any)?.value || '').trim(),
      String((value as any)?.record_id || '').trim(),
    ].filter(Boolean);
  }
  const raw = String(value || '').trim();
  if (!raw) return [];
  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      return normalizeMultiRelationIds(JSON.parse(raw));
    } catch {
      return [raw];
    }
  }
  return [raw];
};

const normalizeMultiRelationCommunicationValues = (
  targetModuleId: string,
  targetFieldKey: string,
  values: any[],
) => {
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
  if (
    (normalizedTargetModuleId === 'org_roles' || normalizedTargetModuleId === 'roles')
    && normalizedTargetFieldKey === 'id'
  ) {
    return values
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .map((value) => `role_${value}`);
  }
  return values;
};

const getDirectWorkflowField = (moduleId: string, fieldKey: string) =>
  getCanonicalModuleFields(moduleId)
    .find((field) => String(field?.key || '').trim() === String(fieldKey || '').trim()) || null;

const getNoteRecipientStrategyFromField = (field?: ModuleField | null): WorkflowNoteRecipientStrategy | null => {
  if (!field) return null;
  const key = String(field?.key || '').trim();
  const relationTargetModule = String(field?.relationConfig?.targetModule || '').trim();
  if (field.type === FieldType.USER || key === 'related_profile_id' || relationTargetModule === 'profiles') {
    return 'user';
  }
  if (relationTargetModule === 'org_roles' || relationTargetModule === 'roles') {
    return 'role';
  }
  return null;
};

const inferLegacyNoteRecipientStrategy = (moduleId: string, fieldKey: string): WorkflowNoteRecipientStrategy | null => {
  const normalizedFieldKey = String(fieldKey || '').trim();
  if (!normalizedFieldKey) return null;

  const directField = getDirectWorkflowField(moduleId, normalizedFieldKey);
  if (directField) return getNoteRecipientStrategyFromField(directField);

  const processLinkedMeta = parseProcessLinkedFieldKey(normalizedFieldKey);
  if (processLinkedMeta) {
    const targetField = getDirectWorkflowField(processLinkedMeta.moduleId, processLinkedMeta.targetFieldKey);
    if (targetField) return getNoteRecipientStrategyFromField(targetField);
    if (processLinkedMeta.moduleId === 'profiles' && processLinkedMeta.targetFieldKey === 'id') return 'user';
    if ((processLinkedMeta.moduleId === 'org_roles' || processLinkedMeta.moduleId === 'roles') && processLinkedMeta.targetFieldKey === 'id') return 'role';
  }

  const workflowRelatedMeta = parseWorkflowRelatedFieldKey(normalizedFieldKey);
  if (workflowRelatedMeta) {
    const targetField = getDirectWorkflowField(workflowRelatedMeta.targetModuleId, workflowRelatedMeta.targetFieldKey);
    if (targetField) return getNoteRecipientStrategyFromField(targetField);
    if (workflowRelatedMeta.targetModuleId === 'profiles' && workflowRelatedMeta.targetFieldKey === 'id') return 'user';
    if ((workflowRelatedMeta.targetModuleId === 'org_roles' || workflowRelatedMeta.targetModuleId === 'roles') && workflowRelatedMeta.targetFieldKey === 'id') return 'role';
  }

  return null;
};

const normalizeNoteRecipientValuesByStrategy = (
  values: any,
  strategy: WorkflowNoteRecipientStrategy
) => asArray(values)
  .map((entry) => {
    const token = parseCommunicationRecipientToken(entry);
    if (token?.kind === 'user') return `user_${token.id}`;
    if (token?.kind === 'role') return `role_${token.id}`;
    if (token?.kind === 'chat_group') return `chat_group:${token.id}`;
    const normalized = String(entry || '').trim();
    if (!normalized) return '';
    return `${strategy}_${normalized}`;
  })
  .filter(Boolean);

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

const resolveCounterpartyBotGroupChatIds = async (
  channel: 'rubika' | 'bale' | 'telegram',
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
  channel: 'rubika' | 'bale' | 'telegram',
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

const COUNTERPARTY_RELATED_RECIPIENT_FIELDS = new Set([
  'customer_id',
  'related_customer',
  'supplier_id',
  'related_supplier',
]);
const COUNTERPARTY_RECIPIENT_CONTEXT_PREFIX = '__workflow_counterparty__';

type CounterpartyRecipientTarget = {
  counterpartyType: 'customers' | 'suppliers';
  id: string;
};

const isCounterpartyRelatedRecipientField = (fieldKey: string) => {
  const raw = String(fieldKey || '').trim();
  if (raw.startsWith(COUNTERPARTY_RECIPIENT_CONTEXT_PREFIX)) return true;
  if (COUNTERPARTY_RELATED_RECIPIENT_FIELDS.has(raw)) return true;
  const processLinked = parseProcessLinkedFieldKey(raw);
  if (
    processLinked
    && ['customers', 'suppliers'].includes(String(processLinked.moduleId || '').trim())
  ) {
    return true;
  }
  const workflowRelated = parseWorkflowRelatedFieldKey(raw);
  if (workflowRelated && ['customers', 'suppliers'].includes(String(workflowRelated.targetModuleId || '').trim())) {
    return true;
  }
  const multiRelation = parseWorkflowMultiRelationFieldKey(raw);
  return !!(multiRelation && ['customers', 'suppliers'].includes(String(multiRelation.targetModuleId || '').trim()));
};

const resolveConfiguredCounterpartyRecipients = async ({
  currentRecord,
  moduleId,
  recipientFields,
}: {
  currentRecord: Record<string, any>;
  moduleId: string;
  recipientFields: string[];
}): Promise<CounterpartyRecipientTarget[]> => {
  const targets = new Map<string, CounterpartyRecipientTarget>();
  const add = (counterpartyType: 'customers' | 'suppliers', value: unknown) => {
    normalizeMultiRelationIds(value).forEach((id) => {
      const normalizedId = String(id || '').trim();
      if (!UUID_LIKE_REGEX.test(normalizedId)) return;
      targets.set(`${counterpartyType}:${normalizedId}`, { counterpartyType, id: normalizedId });
    });
  };
  const context = getProcessLinkMapFromRecord(currentRecord);

  for (const configuredFieldKey of recipientFields) {
    const wrapped = parseWorkflowNoteRecipientFieldKey(String(configuredFieldKey || '').trim());
    const raw = String(wrapped?.fieldKey || configuredFieldKey || '').trim();
    if (!raw) continue;
    if (raw === `${COUNTERPARTY_RECIPIENT_CONTEXT_PREFIX}customers` && moduleId === 'customers') {
      add('customers', currentRecord?.id);
      continue;
    }
    if (raw === `${COUNTERPARTY_RECIPIENT_CONTEXT_PREFIX}suppliers` && moduleId === 'suppliers') {
      add('suppliers', currentRecord?.id);
      continue;
    }
    if (raw === 'customer_id' || raw === 'related_customer') {
      add('customers', currentRecord?.[raw]);
      continue;
    }
    if (raw === 'supplier_id' || raw === 'related_supplier') {
      add('suppliers', currentRecord?.[raw]);
      continue;
    }

    const processLinked = parseProcessLinkedFieldKey(raw);
    if (processLinked && (processLinked.moduleId === 'customers' || processLinked.moduleId === 'suppliers')) {
      add(processLinked.moduleId, context?.[processLinked.moduleId]);
      continue;
    }

    const related = parseWorkflowRelatedFieldKey(raw);
    if (related && (related.targetModuleId === 'customers' || related.targetModuleId === 'suppliers')) {
      add(related.targetModuleId, currentRecord?.[related.relationFieldKey]);
      continue;
    }

    const multiRelation = parseWorkflowMultiRelationFieldKey(raw);
    if (multiRelation && (multiRelation.targetModuleId === 'customers' || multiRelation.targetModuleId === 'suppliers')) {
      add(multiRelation.targetModuleId, currentRecord?.[multiRelation.fieldKey]);
    }
  }

  return Array.from(targets.values());
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
    const wrappedMeta = parseWorkflowNoteRecipientFieldKey(String(fieldKey || '').trim());
    const resolvedFieldKey = wrappedMeta?.fieldKey || String(fieldKey || '').trim();
    const rawValue = await resolveConditionFieldValue(
      resolvedFieldKey,
      currentRecord,
      moduleId,
      context
    );
    const strategy = wrappedMeta?.strategy || inferLegacyNoteRecipientStrategy(moduleId, resolvedFieldKey);
    const normalizedValue = strategy ? normalizeNoteRecipientValuesByStrategy(rawValue, strategy) : rawValue;
    collectRecipientTargets(normalizedValue, { directValues, userIds, roleIds, groupIds });
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
    if (channel === 'telegram') {
      return [
        ...directValues.map((value) => String(value || '').trim()).filter(Boolean),
        ...profileRows.map((row) => String(row?.telegram_chat_id || '').trim()).filter(Boolean),
      ];
    }
    return [
      ...directValues.map((value) => String(value || '').trim()).filter(Boolean),
      ...profileRows.map((row) => String(row?.bale_chat_id || '').trim()).filter(Boolean),
    ];
  })();
  const uniqueValues = Array.from(new Set(resolvedValues));
  if (channel === 'sms' || channel === 'email') return uniqueValues;

  const candidateIds = uniqueValues.filter((value) => UUID_LIKE_REGEX.test(value));
  const groupChatIds = await resolveCounterpartyBotGroupChatIds(channel, candidateIds, candidateIds);
  const displaySafeValues = uniqueValues.filter((value) => !UUID_LIKE_REGEX.test(value));
  return Array.from(new Set([...displaySafeValues, ...groupChatIds]));
};

const resolveUnifiedAssigneeBotTargets = async (recipientAssignees: any[]) => {
  const directValues: string[] = [];
  const userIds = new Set<string>();
  const roleIds = new Set<string>();
  const groupIds = new Set<string>();
  collectRecipientTargets(recipientAssignees, { directValues, userIds, roleIds, groupIds });
  await expandChatGroupsToMentionTargets(Array.from(groupIds), userIds, roleIds);

  const rows: Array<Record<string, any>> = [];
  if (userIds.size > 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,is_active,rubika_chat_id,telegram_chat_id,bale_chat_id')
      .in('id', Array.from(userIds));
    if (error) throw error;
    rows.push(...(data || []));
  }
  if (roleIds.size > 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,is_active,rubika_chat_id,telegram_chat_id,bale_chat_id')
      .in('role_id', Array.from(roleIds));
    if (error) throw error;
    rows.push(...(data || []));
  }

  const uniqueProfiles = Array.from(new Map(
    rows.filter(isActiveProfileRow).map((row) => [String(row?.id || ''), row]),
  ).values());
  const directTargets = Array.from(new Set(directValues))
    .filter((chatId) => chatId && !UUID_LIKE_REGEX.test(chatId))
    .map((chatId) => ({ channel: 'rubika' as const, chatId }));
  const profileTargets = uniqueProfiles.flatMap((row) => {
    const channel = WORKFLOW_BOT_CHANNEL_PRIORITY.find((candidate) => String(row?.[`${candidate}_chat_id`] || '').trim());
    if (!channel) return [];
    return [{ channel, chatId: String(row[`${channel}_chat_id`]).trim() }];
  });
  return Array.from(new Map(
    [...directTargets, ...profileTargets].map((target) => [`${target.channel}:${target.chatId}`, target]),
  ).values());
};

export const resolveNoteRecipientsFromFields = async ({
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
    const wrappedMeta = parseWorkflowNoteRecipientFieldKey(String(fieldKey || '').trim());
    const resolvedFieldKey = wrappedMeta?.fieldKey || String(fieldKey || '').trim();
    const rawValue = await resolveConditionFieldValue(
      resolvedFieldKey,
      currentRecord,
      moduleId,
      context
    );
    const strategy = wrappedMeta?.strategy || inferLegacyNoteRecipientStrategy(moduleId, resolvedFieldKey);
    const normalizedValue = strategy ? normalizeNoteRecipientValuesByStrategy(rawValue, strategy) : rawValue;
    collectRecipientTargets(normalizedValue, { directValues: [], userIds, roleIds, groupIds });
  }

  const directUserIds = Array.from(userIds);
  const directRoleIds = Array.from(roleIds);
  const groupTargets = await resolveChatGroupMentionTargets(Array.from(groupIds));
  groupTargets.forEach((group) => {
    group.userIds.forEach((id) => userIds.add(id));
    group.roleIds.forEach((id) => roleIds.add(id));
  });
  const activeDirectTargets = await filterActiveMentionTargets(supabase, {
    userIds: directUserIds,
    roleIds: directRoleIds,
  });
  const activeSmsTargets = await filterActiveMentionTargets(supabase, {
    userIds: Array.from(userIds),
    roleIds: Array.from(roleIds),
  });
  const activeGroupTargets = await filterActiveGroupMentionTargets(supabase, groupTargets);

  return {
    mentionUserIds: activeDirectTargets.userIds,
    mentionRoleIds: activeDirectTargets.roleIds,
    groupTargets: activeGroupTargets,
    smsMentionUserIds: activeSmsTargets.userIds,
    smsMentionRoleIds: activeSmsTargets.roleIds,
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

const resolvePreviousStageTargetTask = async (
  moduleId: string,
  currentRecord: Record<string, any>
) => {
  const taskId = resolveCurrentTaskIdForNextStageAction(moduleId, currentRecord);
  if (!taskId) return null;

  const rows = await fetchProcessTransferTasks(moduleId, currentRecord);
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
  const currentIndex = sorted.findIndex((row) => String(row?.id || '').trim() === taskId);
  if (currentIndex <= 0) return null;
  return sorted[currentIndex - 1] || null;
};

const resolveSpecificStageTargetTask = async (
  moduleId: string,
  currentRecord: Record<string, any>,
  targetNodeKey: string,
) => {
  const normalizedNodeKey = String(targetNodeKey || '').trim();
  if (!normalizedNodeKey) return null;
  const rows = await fetchProcessTransferTasks(moduleId, currentRecord);
  return rows.find((row) => {
    const recurrence = parseWorkflowObject(row?.recurrence_info);
    return String(recurrence?.process_node_key || '').trim() === normalizedNodeKey;
  }) || null;
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

const isWorkflowAssigneePatchField = (fieldKey: string) => {
  const normalized = String(fieldKey || '').trim();
  return normalized === WORKFLOW_ASSIGNEE_FIELD_KEY || normalized === 'assignee_id';
};

const applyWorkflowPayloadValue = (
  payload: Record<string, any>,
  fieldKey: string,
  value: any
) => {
  const normalizedFieldKey = String(fieldKey || '').trim();
  if (!normalizedFieldKey) return;
  if (isWorkflowAssigneePatchField(normalizedFieldKey)) {
    Object.assign(payload, buildAssigneePatch(value));
    return;
  }
  payload[normalizedFieldKey] = value;
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

const resolveWorkflowStoryPublisher = async (
  orgId: string
) => {
  const normalizedOrgId = String(orgId || '').trim();
  if (!normalizedOrgId) {
    throw new Error('org_id برای انتشار استوری مشخص نیست');
  }

  const { data: companyRows, error: companyError } = await supabase
    .from('company_settings')
    .select('logo_url')
    .eq('org_id', normalizedOrgId)
    .limit(1);
  if (companyError) throw companyError;

  return resolveSystemWorkflowStoryPublisher((companyRows || [])[0]?.logo_url || null);
};

const loadProcessTemplateStages = async (templateId: string) => {
  return loadProcessTemplateStagesShared(supabase, templateId);
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
  if (await shouldSkipRecordForAutomation({ moduleId, record: currentRecord })) return;

  const config = action?.config || {};

  if (
    action.type === 'activate_next_process_stage'
    || action.type === 'activate_specific_process_stage'
  ) {
    await activateProcessStageAction({
      actionType: action.type,
      config,
      record: currentRecord,
      moduleId,
    });
    return;
  }

  if (action.type === 'run_ai_prompt') {
    const prompt = (await renderWorkflowTemplate(String(config.prompt_template || config.prompt || ''), currentRecord, moduleId)).trim();
    if (!prompt) return;
    const orgId = await resolveWorkflowOrgId(currentRecord);
    const outputMode = String(config.output_mode || 'text').trim();
    const targetModuleId = outputMode === 'update_record'
      ? moduleId
      : String(config.target_module_id || '').trim();
    const allowedFieldKeys = asArray(config.allowed_field_keys).map((item) => String(item || '').trim()).filter(Boolean);
    if (outputMode === 'update_record' && allowedFieldKeys.length === 0) {
      throw new Error('برای ویرایش رکورد با هوش مصنوعی، حداقل یک فیلد مجاز انتخاب کنید.');
    }
    const configuredRecordSchema = config.record_creation_schema
      && String(config.record_creation_schema?.moduleId || '').trim() === targetModuleId
      ? config.record_creation_schema
      : null;
    const recordCreationSchema = (outputMode === 'create_record' || outputMode === 'update_record') && targetModuleId
      ? (configuredRecordSchema || buildAiRecordCreationSchema(targetModuleId, allowedFieldKeys))
      : null;
    const { data, error } = await supabase.functions.invoke('ai-assistant', {
      body: {
        action: outputMode === 'create_record'
          ? 'create_record_from_prompt'
          : outputMode === 'update_record'
            ? 'update_record_from_prompt'
          : outputMode === 'process_operation'
            ? 'process_operation_from_prompt'
            : 'workflow_ai_prompt',
        capability: 'workflow_ai_prompt',
        outputMode,
        autoExecute: true,
        forceNewThread: true,
        message: prompt,
        recordCreation: recordCreationSchema,
        relationFieldKey: config.relation_field_key || null,
        context: {
          mode: 'workflow',
          moduleId,
          recordId: currentRecord?.id ? String(currentRecord.id) : null,
          workflowActionId: (action as any)?.id || null,
        },
      },
    });
    if (error) throw error;
    if ((data as any)?.error) throw new Error(String((data as any).error));
    const answer = String((data as any)?.answer || (data as any)?.message?.content || (data as any)?.content || '').trim();
    if (!orgId || !answer) return;
    await supabase.from('ai_action_logs').insert([{
      org_id: orgId,
      thread_id: (data as any)?.thread?.id || (data as any)?.threadId || null,
      module_id: moduleId,
      record_id: currentRecord?.id ? String(currentRecord.id) : null,
      action_type: 'workflow_ai_prompt',
      status: 'executed',
      proposed_payload: {
        prompt,
        answer,
        workflow_action_id: (action as any)?.id || null,
        require_human_approval: false,
        output_mode: outputMode,
        target_module_id: targetModuleId || null,
      },
      result_payload: {
        source: 'workflow_runtime',
        model: (data as any)?.model || null,
        created_records: Array.isArray((data as any)?.createdRecords) ? (data as any).createdRecords : [],
        updated_records: Array.isArray((data as any)?.updatedRecords) ? (data as any).updatedRecords : [],
      },
      executed_at: new Date().toISOString(),
    }]);

    const actionRecord = {
      ...currentRecord,
      ai_answer: answer,
      ai_created_record_title: Array.isArray((data as any)?.createdRecords) && (data as any).createdRecords[0]?.title
        ? String((data as any).createdRecords[0].title)
        : '',
      ai_updated_record_title: Array.isArray((data as any)?.updatedRecords) && (data as any).updatedRecords[0]?.title
        ? String((data as any).updatedRecords[0].title)
        : '',
    };
    const channelConfigs = config.channel_configs && typeof config.channel_configs === 'object'
      ? config.channel_configs
      : {};
    const deliveryChannels = Array.from(new Set(
      asArray(config.delivery_channels)
        .map((item) => String(item || '').trim().toLowerCase())
        .filter((item) => ['sms', 'email', 'bot', 'note'].includes(item))
    ));
    for (const channel of deliveryChannels) {
      if (channel === 'sms') {
        await executeWorkflowAction({
          ...action,
          type: 'send_sms',
          config: { message: '{{ai_answer}}', ...(channelConfigs.sms || {}) },
        }, moduleId, actionRecord);
        continue;
      }
      if (channel === 'email') {
        await executeWorkflowAction({
          ...action,
          type: 'send_email',
          config: { subject: 'پیام هوش مصنوعی', body: '{{ai_answer}}', ...(channelConfigs.email || {}) },
        }, moduleId, actionRecord);
        continue;
      }
      if (channel === 'bot') {
        await executeWorkflowAction({
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
        }, moduleId, actionRecord);
        continue;
      }
      if (channel === 'note') {
        await executeWorkflowAction({
          ...action,
          type: 'send_note',
          config: { note_text: '{{ai_answer}}', ...(channelConfigs.note || {}) },
        }, moduleId, actionRecord);
      }
    }
    return;
  }

  if (action.type === 'send_web_form_link') {
    const webFormId = String(config.web_form_id || '').trim();
    if (!webFormId) return;

    const { data: webFormRow, error: webFormError } = await supabase
      .from('web_forms')
      .select('id, route_slug, access_scope, target_module_id, form_type, is_active')
      .eq('id', webFormId)
      .maybeSingle();
    if (webFormError) throw webFormError;
    if (!webFormRow || webFormRow.is_active !== true) return;

    const relatedModuleId = String(config.related_module_id || moduleId || '').trim() || moduleId;
    const processLinks = getProcessLinkMapFromRecord(currentRecord);
    const relatedRecordId = relatedModuleId === moduleId
      ? String(currentRecord?.id || '').trim()
      : String(processLinks?.[relatedModuleId] || '').trim();

    const { data: tokenResult, error: tokenError } = await supabase.rpc('create_web_form_link_token', {
      p_web_form_id: webFormId,
      p_target_module_id: String(webFormRow.target_module_id || '').trim() || null,
      p_related_module_id: relatedModuleId || null,
      p_related_record_id: relatedRecordId || null,
    });
    if (tokenError) throw tokenError;

    const accessToken = String((tokenResult as any)?.token || '').trim();
    if (!accessToken) return;

    const webFormLink = await buildWorkflowWebFormUrl(String(webFormRow.route_slug || '').trim(), accessToken);
    const channelConfigs = config.channel_configs && typeof config.channel_configs === 'object'
      ? config.channel_configs
      : {};
    const deliveryChannels = Array.from(
      new Set(
        asArray(config.delivery_channels)
          .map((item) => String(item || '').trim().toLowerCase())
          .filter((item) => ['sms', 'email', 'bot', 'note'].includes(item))
      )
    );
    const actionRecord = { ...currentRecord, web_form_link: webFormLink };

    for (const channel of deliveryChannels) {
      if (channel === 'sms') {
        await executeWorkflowAction({
          ...action,
          type: 'send_sms',
          config: { ...(channelConfigs.sms || {}) },
        }, moduleId, actionRecord);
        continue;
      }
      if (channel === 'email') {
        await executeWorkflowAction({
          ...action,
          type: 'send_email',
          config: { ...(channelConfigs.email || {}) },
        }, moduleId, actionRecord);
        continue;
      }
      if (channel === 'bot') {
        await executeWorkflowAction({
          ...action,
          type: 'send_bot_message',
          config: { ...(channelConfigs.bot || {}) },
        }, moduleId, actionRecord);
        continue;
      }
      if (channel === 'note') {
        await executeWorkflowAction({
          ...action,
          type: 'send_note',
          config: { ...(channelConfigs.note || {}) },
        }, moduleId, actionRecord);
      }
    }
    return;
  }

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
        : isInactiveProfileRecord(moduleId, currentRecord)
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
    const recipientConfig = getWorkflowRecipientConfig(config);
    const noteText = (await renderWorkflowTemplate(String(config.note_text || ''), currentRecord, moduleId, { bold: true })).trim();
    const attachments = await resolveWorkflowMessageAttachments({
      moduleId,
      recordId: currentRecord?.id ? String(currentRecord.id) : null,
      config,
      resolveLegacyFields: (attachmentFields) => resolveNoteAttachmentsFromFields({
        currentRecord,
        moduleId,
        attachmentFields,
      }),
    });
    if (!noteText && attachments.length === 0) return;
    const recordId = currentRecord?.id;
    const scope = normalizeNoteScope(moduleId, recordId ? String(recordId) : null);
    if (!scope.hasLinkedRecord) return;
    const recipients = await resolveNoteRecipientsFromFields({
      currentRecord,
      moduleId,
      recipientFields: recipientConfig.recipientFields,
      recipientAssignees: recipientConfig.recipientAssignees,
    });
    const baseMetadata = {
      source_type: 'system',
      notification_surface: 'system_feed',
      requires_action: false,
      workflow_action_type: action.type,
      workflow_action_id: (action as any)?.id || null,
    };
    const [orgId, user] = await Promise.all([
      resolveWorkflowOrgId(currentRecord),
      getCurrentAuthUser(),
    ]);
    const noteIdentity: Record<string, any> = {};
    if (orgId) noteIdentity.org_id = orgId;
    if (user?.id) noteIdentity.author_id = user.id;
    const noteRows: Record<string, any>[] = [];
    const hasDirectRecipients = recipients.mentionUserIds.length > 0 || recipients.mentionRoleIds.length > 0;
    if (!hasDirectRecipients && recipients.groupTargets.length === 0) {
      console.info('Skipped workflow system note without explicit recipients.', {
        workflowActionId: (action as any)?.id || null,
        moduleId: scope.module_id,
        recordId: scope.record_id,
      });
      return;
    }
    if (hasDirectRecipients || recipients.groupTargets.length === 0) {
      noteRows.push({
        ...noteIdentity,
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
        ...noteIdentity,
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

  if (
    action.type === 'send_bot_message'
    || action.type === 'send_telegram_bot'
    || action.type === 'send_bale_bot'
    || action.type === 'send_rubika_bot'
  ) {
    // پیام یکپارچه بات: پلتفرم از تنظیمات پیش‌فرض counterparty_bot_config خوانده می‌شود
    const rawMessageText = (await renderWorkflowTemplate(String(config.message || ''), currentRecord, moduleId)).trim();
    const attachments = await resolveWorkflowMessageAttachments({
      moduleId,
      recordId: currentRecord?.id ? String(currentRecord.id) : null,
      config,
      resolveLegacyFields: (attachmentFields) => resolveNoteAttachmentsFromFields({
        currentRecord,
        moduleId,
        attachmentFields,
      }),
    });
    if (!rawMessageText && attachments.length === 0) return;
    const externalAttachments = attachments.length > 0
      ? await shortenAttachmentsForExternalShare(attachments, {
          moduleId,
          recordId: currentRecord?.id ? String(currentRecord.id) : null,
          metadata: { source_type: 'workflow', workflow_action_type: 'send_bot_message', workflow_action_id: (action as any)?.id || null },
        })
      : [];
    const titleText = (await renderWorkflowTemplate(String(config.title || ''), currentRecord, moduleId)).trim();
    const botSenderPayload = {
      attachments,
      workflow_action_type: 'send_bot_message',
      workflow_action_id: (action as any)?.id || null,
      source_type: 'workflow',
      sender_kind: String(config.sender_kind || '').trim() || 'system',
      sender_type: String(config.sender_type || '').trim() || 'system',
      sender_display_name: String(config.sender_display_name || '').trim() || 'پیام‌های سیستم',
      message_source: String(config.message_source || '').trim() || 'workflow',
      ai_generated: config.ai_generated === true || String(config.sender_kind || '').trim().toLowerCase() === 'ai',
    };
    const recipientConfig = getWorkflowRecipientConfig(config);
    const configuredRecipientFields = recipientConfig.recipientFields;
    const configuredRecipientAssignees = recipientConfig.recipientAssignees;

    // تعیین پلتفرم برای هر counterparty از counterparty_bot_config
    const resolveChannelForCounterparty = async (
      counterpartyId: string,
      counterpartyType: 'customers' | 'suppliers',
    ): Promise<'rubika' | 'telegram' | 'bale' | null> => {
      const configQuery = supabase
        .from('counterparty_bot_config')
        .select('default_channel, fallback_to_active')
        .eq(counterpartyType === 'customers' ? 'customer_id' : 'supplier_id', counterpartyId)
        .maybeSingle();
      const { data: prefRow, error: configError } = await configQuery;
      if (configError) throw configError;
      const defaultChannel = String(prefRow?.default_channel || '').trim() as WorkflowBotChannel;
      if (!['rubika', 'telegram', 'bale'].includes(defaultChannel)) return null;
      // اگر fallback فعال است، بررسی کن پلتفرم اصلی فعال است یا نه
      const groupQuery = supabase
        .from('counterparty_bot_groups')
        .select('channel_type, status, bot_chat_id')
        .eq(counterpartyType === 'customers' ? 'customer_id' : 'supplier_id', counterpartyId)
        .limit(100);
      const { data: groupRows, error: groupError } = await groupQuery;
      if (groupError) throw groupError;
      const activeForDefault = (groupRows || []).find((r: any) => r.channel_type === defaultChannel && String(r.status || '') === 'active' && String(r.bot_chat_id || '').trim());
      if (activeForDefault) return defaultChannel;
      if (!prefRow?.fallback_to_active) return null;
      const firstActive = (groupRows || []).find((r: any) => String(r.status || '') === 'active' && String(r.bot_chat_id || '').trim());
      return firstActive ? (String(firstActive.channel_type) as 'rubika' | 'telegram' | 'bale') : null;
    };

    // گیرنده ضمنی نداریم: فقط مسئول یا مشتری/تامین‌کننده‌ای که در اکشن انتخاب
    // شده اجرا می‌شود؛ بنابراین پیام یک نقش هرگز به طرف حساب رکورد نشت نمی‌کند.
    const targetMap = new Map<string, { channel: WorkflowBotChannel; chatId: string }>();
    const addTarget = (channel: WorkflowBotChannel, chatId: unknown) => {
      const normalizedChatId = String(chatId || '').trim();
      if (normalizedChatId && !UUID_LIKE_REGEX.test(normalizedChatId)) {
        targetMap.set(`${channel}:${normalizedChatId}`, { channel, chatId: normalizedChatId });
      }
    };

    const directFieldKeys = configuredRecipientFields.filter((fieldKey) => !isCounterpartyRelatedRecipientField(fieldKey));
    const identityRecipientEntries: any[] = [...configuredRecipientAssignees];
    const fieldContext: WorkflowEvaluationContext = {
      moduleId,
      relatedRecordCache: new Map(),
      tagsCache: new Map(),
    };
    for (const storedFieldKey of directFieldKeys) {
      const wrappedMeta = parseWorkflowNoteRecipientFieldKey(String(storedFieldKey || '').trim());
      const resolvedFieldKey = wrappedMeta?.fieldKey || String(storedFieldKey || '').trim();
      const explicitChannel = getWorkflowRecipientFieldBotChannel(storedFieldKey);
      if (explicitChannel) {
        const values = await resolveCommunicationValuesFromFields({
          currentRecord,
          moduleId,
          recipientFields: [resolvedFieldKey],
          recipientAssignees: [],
          channel: explicitChannel,
        });
        values.forEach((chatId) => addTarget(explicitChannel, chatId));
        continue;
      }
      const rawValue = await resolveConditionFieldValue(resolvedFieldKey, currentRecord, moduleId, fieldContext);
      const strategy = wrappedMeta?.strategy || inferLegacyNoteRecipientStrategy(moduleId, resolvedFieldKey);
      const normalizedValue = strategy ? normalizeNoteRecipientValuesByStrategy(rawValue, strategy) : rawValue;
      identityRecipientEntries.push(...asArray(normalizedValue));
    }

    const assigneeTargets = await resolveUnifiedAssigneeBotTargets(identityRecipientEntries);
    assigneeTargets.forEach((target) => addTarget(target.channel, target.chatId));

    const counterpartyTargets = await resolveConfiguredCounterpartyRecipients({
      currentRecord,
      moduleId,
      recipientFields: configuredRecipientFields,
    });
    for (const target of counterpartyTargets) {
      const channel = await resolveChannelForCounterparty(target.id, target.counterpartyType);
      if (!channel) continue;
      const chatIds = await resolveCounterpartyBotGroupChatIds(
        channel,
        target.counterpartyType === 'customers' ? [target.id] : [],
        target.counterpartyType === 'suppliers' ? [target.id] : [],
      );
      chatIds.forEach((chatId) => addTarget(channel, chatId));
    }

    for (const channel of WORKFLOW_BOT_CHANNEL_PRIORITY) {
      const channelTargets = Array.from(targetMap.values()).filter((target) => target.channel === channel);
      if (channelTargets.length === 0) continue;
      const fallbackText = externalAttachments.length > 0
        ? [rawMessageText, buildAttachmentNameText(externalAttachments)].filter(Boolean).join('\n')
        : undefined;
      const messageText = rawMessageText || (attachments.length > 0 ? 'پیوست ارسال شد' : '');
      const recipients = channelTargets.map((target) => target.chatId);
      const handledChatIds = new Set<string>();
      const groupRows = await resolveCounterpartyBotGroupsByChatIds(channel, recipients);
      for (const group of groupRows) {
        const groupChatId = String(group?.bot_chat_id || '').trim();
        if (!groupChatId || handledChatIds.has(groupChatId)) continue;
        handledChatIds.add(groupChatId);
        await sendCounterpartyBotGroupMessage({ group, text: messageText, fallbackText, attachments, payload: botSenderPayload, extraPayload: botSenderPayload, messageType: attachments.length > 0 ? 'file' : 'text' });
      }
      for (const chatId of recipients.filter((recipient) => !handledChatIds.has(recipient))) {
        await sendBotMessageViaGateway({ channel, chatId, text: messageText, attachments, fallbackText, extraPayload: botSenderPayload, title: titleText || undefined, moduleId, recordId: currentRecord?.id ? String(currentRecord.id) : undefined });
      }
    }
    return;
  }

  if (action.type === 'send_email') {
    const subject = (await renderWorkflowTemplate(String(config.subject || ''), currentRecord, moduleId)).trim();
    const body = (await renderWorkflowTemplate(String(config.body || ''), currentRecord, moduleId)).trim();
    if (!subject && !body) return;
    const manuals = asArray(config.manual_emails).map((v) => String(v || '').trim()).filter(Boolean);
    const fromFields = isInactiveProfileRecord(moduleId, currentRecord)
      ? []
      : asArray(config.recipient_fields).flatMap((fieldKey) => {
        const val = currentRecord?.[String(fieldKey || '').trim()];
        return Array.isArray(val) ? val.map(String) : [String(val || '')];
      }).filter(Boolean);
    const to = Array.from(new Set([...manuals, ...fromFields])).filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
    if (to.length === 0) return;
    await sendEmailViaGateway({ to, subject, body, moduleId, recordId: currentRecord?.id ? String(currentRecord.id) : undefined });
    return;
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

  if (action.type === 'send_to_specific_stage') {
    const fieldMeta = parseProcessNextStageFieldKey(String(config.field || '').trim());
    const fieldKey = fieldMeta?.fieldKey || String(config.field || '').trim();
    const targetTask = await resolveSpecificStageTargetTask(
      moduleId,
      currentRecord,
      String(config.stage_node_key || '').trim(),
    );
    if (!fieldKey || !targetTask) return;
    const nextValue = await resolveConfiguredActionValue(moduleId, config, currentRecord);
    await updateNextStageTaskField(targetTask, fieldKey, nextValue);
    return;
  }

  if (action.type === 'lock_record') {
    const targetScope = String(config.target_scope || 'current_record').trim();
    let targetModuleId = moduleId;
    let targetRecordId = String(currentRecord?.id || '').trim();

    if (targetScope === 'related_record') {
      const relationFieldKey = String(config.relation_field_key || '').trim();
      const processLinkedMeta = parseProcessLinkedFieldKey(relationFieldKey);
      if (processLinkedMeta) {
        const processLinks = getProcessLinkMapFromRecord(currentRecord);
        targetModuleId = processLinkedMeta.moduleId;
        targetRecordId = String(processLinks?.[processLinkedMeta.moduleId] || currentRecord?.[relationFieldKey] || '').trim();
      } else {
        const relationField = (MODULES[moduleId]?.fields || []).find((field: any) => String(field?.key || '').trim() === relationFieldKey) as any;
        const relationModuleId = String(relationField?.relationConfig?.targetModule || '').trim();
        const relationRecordId = String(currentRecord?.[relationFieldKey] || '').trim();
        targetModuleId = relationModuleId;
        targetRecordId = relationRecordId;
      }
    } else if (targetScope === 'process_current_task') {
      targetModuleId = 'tasks';
      targetRecordId = resolveCurrentTaskIdForNextStageAction(moduleId, currentRecord);
    } else if (targetScope === 'process_previous_task') {
      const targetTask = await resolvePreviousStageTargetTask(moduleId, currentRecord);
      targetModuleId = 'tasks';
      targetRecordId = String(targetTask?.id || '').trim();
    } else if (targetScope === 'process_specific_task') {
      const targetTask = await resolveSpecificStageTargetTask(
        moduleId,
        currentRecord,
        String(config.stage_node_key || '').trim(),
      );
      targetModuleId = 'tasks';
      targetRecordId = String(targetTask?.id || '').trim();
    }

    if (!targetModuleId || !targetRecordId) return;
    const renderedReason = (await renderWorkflowTemplate(String(config.reason || ''), currentRecord, moduleId)).trim();
    await lockRecord({
      moduleId: targetModuleId,
      recordId: targetRecordId,
      reason: renderedReason || null,
      sourceType: String(config.source_type || '').trim() === 'process_automation' ? 'process_automation' : 'workflow',
      sourceId: String(action.id || '').trim() || null,
    });
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

    const user = await getCurrentAuthUser();
    const patch = { updated_at: new Date().toISOString() } as Record<string, any>;
    applyWorkflowPayloadValue(patch, patchFieldKey, nextValue);
    if (user?.id) patch.updated_by = user.id;
    const { error } = await supabase
      .from(getModuleTable(targetModuleId))
      .update(patch)
      .eq('id', targetRecordId);
    if (error) throw error;
    currentRecord[fieldKey] = nextValue;
    Object.assign(currentRecord, patch);
    return;
  }

  if (action.type === 'create_related_record') {
    const targetModuleId = String(config.target_module_id || '').trim();
    const sourceModuleId = String(config.source_module_id || '').trim() || moduleId;
    const processLinks = getProcessLinkMapFromRecord(currentRecord);
    const sourceRecordId = sourceModuleId === moduleId
      ? String(currentRecord?.id || '').trim()
      : String(processLinks?.[sourceModuleId] || '').trim();
    const relationFieldKey = String(
      config.relation_field_key
      || (targetModuleId === 'tasks' ? 'source_record_id' : '')
    ).trim();
    if (!targetModuleId || !relationFieldKey || !sourceRecordId) return;

    const user = await getCurrentAuthUser();
    const payload: Record<string, any> = {
      [relationFieldKey]: sourceRecordId,
    };
    if (targetModuleId === 'tasks') {
      Object.assign(payload, buildTaskSourceInitialValues(sourceModuleId, sourceRecordId));
    }

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
        applyWorkflowPayloadValue(payload, targetField, sourceField
          ? await resolveConditionFieldValue(sourceField, currentRecord, moduleId, mappingContext)
          : null);
        continue;
      }
      if (mapping?.mode === 'formula') {
        applyWorkflowPayloadValue(payload, targetField, mapping?.formula_expression_config && typeof mapping.formula_expression_config === 'object'
          ? evaluateFormulaExpression(mapping.formula_expression_config, currentRecord || {}).value
          : null);
        continue;
      }
      applyWorkflowPayloadValue(payload, targetField, mapping?.value ?? null);
    }

    if (supportsSystemCode(targetModuleId) && !payload.system_code) {
      payload.system_code = await buildClientFallbackSystemCode(supabase, targetModuleId, getModuleTable(targetModuleId), { orgId: orgId ?? undefined });
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

  if (action.type === 'create_standalone_record') {
    const targetModuleId = String(config.target_module_id || '').trim();
    if (!targetModuleId) return;

    const user = await getCurrentAuthUser();
    const payload: Record<string, any> = {};

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
        applyWorkflowPayloadValue(payload, targetField, sourceField
          ? await resolveConditionFieldValue(sourceField, currentRecord, moduleId, mappingContext)
          : null);
        continue;
      }
      if (mapping?.mode === 'formula') {
        applyWorkflowPayloadValue(payload, targetField, mapping?.formula_expression_config && typeof mapping.formula_expression_config === 'object'
          ? evaluateFormulaExpression(mapping.formula_expression_config, currentRecord || {}).value
          : null);
        continue;
      }
      applyWorkflowPayloadValue(payload, targetField, mapping?.value ?? null);
    }

    if (supportsSystemCode(targetModuleId) && !payload.system_code) {
      payload.system_code = await buildClientFallbackSystemCode(supabase, targetModuleId, getModuleTable(targetModuleId), { orgId: orgId ?? undefined });
    }

    const { error } = await supabase.from(getModuleTable(targetModuleId)).insert(payload);
    if (error) throw error;
    return;
  }

  if (action.type === 'copy_process_template') {
    const templateId = String(config.template_id || '').trim();
    if (!templateId || !currentRecord?.id) return;

    const orgId = await resolveWorkflowOrgId(currentRecord);
    if (!orgId) {
      throw new Error('org_id برای کپی الگوی فرآیند مشخص نیست');
    }

    const { data: processRunId, error: runError } = await supabase.rpc('create_process_run_from_template', {
      p_org_id: orgId,
      p_template_id: templateId,
      p_module_id: moduleId,
      p_record_id: currentRecord.id,
      p_process_name: null,
      p_copied_mode: 'auto',
    });
    if (!runError) {
      Object.assign(currentRecord, {
        process_template_id: templateId,
        process_run_id: String(processRunId || '').trim() || undefined,
      });
      return;
    }

    const draftFieldKey = resolveWorkflowProcessDraftFieldKey(moduleId);
    if (!draftFieldKey) throw runError;

    const [stages, templateName] = await Promise.all([
      loadProcessTemplateStages(templateId),
      loadProcessTemplateName(templateId),
    ]);
    const user = await getCurrentAuthUser();
    const patch = {
      process_template_id: templateId,
      [draftFieldKey]: mapTemplateStagesToDraft(templateId, stages, templateName),
    } as Record<string, any>;
    if (user?.id) patch.updated_by = user.id;

    const { error } = await supabase
      .from(getModuleTable(moduleId))
      .update(patch)
      .eq('id', currentRecord.id);
    if (error) throw error;

    Object.assign(currentRecord, patch);
    return;
  }

  if (action.type === 'publish_story') {
    const orgId = await resolveWorkflowOrgId(currentRecord);
    if (!orgId) {
      throw new Error('org_id برای انتشار استوری مشخص نیست');
    }

    const content = (await renderWorkflowTemplate(
      String(config.content || config.text_template || ''),
      currentRecord,
      moduleId
    )).trim();
    if (!content) return;

    const publisher = await resolveWorkflowStoryPublisher(orgId);

    const expiresHoursRaw = config.expires_hours;
    const expiresHours = expiresHoursRaw === null || expiresHoursRaw === undefined || expiresHoursRaw === ''
      ? null
      : Number(expiresHoursRaw);
    const expiresAt = Number.isFinite(expiresHours as number) && Number(expiresHours) > 0
      ? new Date(Date.now() + Number(expiresHours) * 60 * 60 * 1000).toISOString()
      : null;

    const slide = {
      id: crypto.randomUUID(),
      type: 'gradient',
      gradient_key: String(config.gradient_key || 'brand_indigo').trim() || 'brand_indigo',
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

    const { error } = await supabase.rpc('create_workflow_org_story', {
      p_org_id: orgId,
      p_creator_id: publisher.creatorId,
      p_creator_name: publisher.creatorName,
      p_creator_avatar: publisher.creatorAvatar,
      p_slides: [slide],
      p_is_org_wide: config.is_org_wide !== false,
      p_viewer_user_ids: asArray(config.viewer_user_ids).map((id) => String(id || '').trim()).filter(Boolean),
      p_viewer_role_ids: asArray(config.viewer_role_ids).map((id) => String(id || '').trim()).filter(Boolean),
      p_mention_user_ids: asArray(config.mention_user_ids).map((id) => String(id || '').trim()).filter(Boolean),
      p_mention_role_ids: [],
      p_expires_at: expiresAt,
      p_is_saas_wide: false,
      p_is_saas_admins_only: false,
    });
    if (error) throw error;
    return;
  }

  if (action.type === 'execute_process') {
    const templateId = String(config.template_id || '').trim();
    if (!templateId || !currentRecord?.id) return;

    const orgId = await resolveWorkflowOrgId(currentRecord);
    if (!orgId) {
      throw new Error('org_id for process execution is missing');
    }

    const { data: processRunId, error } = await supabase.rpc('create_process_run_from_template', {
      p_org_id: orgId,
      p_template_id: templateId,
      p_module_id: moduleId,
      p_record_id: currentRecord.id,
      p_process_name: null,
      p_copied_mode: 'auto',
    });
    if (error) throw error;
    const normalizedProcessRunId = String(processRunId || '').trim();
    if (normalizedProcessRunId) {
      await activateInitialProcessRunNodes({ processRunId: normalizedProcessRunId });
    }
  }
};

export const runWorkflowsForEvent = async ({
  moduleId,
  event,
  currentRecord,
  previousRecord = null,
}: RunWorkflowArgs) => {
  // Workflow execution is intentionally server-side. The database trigger
  // records the persisted mutation in workflow_event_queue; this compatibility
  // entry point remains async so existing save paths never block the UI.
  void moduleId;
  void event;
  void currentRecord;
  void previousRecord;
};
