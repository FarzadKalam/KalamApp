import { formatWorkflowPriceWithCurrency } from './workflow-value-labels.ts';

export type CampaignMessageVariableDescriptor = {
  key: string;
  module_id: string;
  field_key: string;
  field_type?: string | null;
  label?: string | null;
  relation_target_module?: string | null;
  relation_target_field?: string | null;
  options?: Array<{ value: unknown; label: string }>;
};

type CampaignVariableResolverContext = {
  orgId: string;
  sourceModuleId: string;
  sourceRecord: Record<string, any>;
  descriptors: CampaignMessageVariableDescriptor[];
  fetchRecord: (moduleId: string, recordId: string) => Promise<Record<string, any> | null>;
  appBaseUrl?: string | null;
  currencyCode?: string | null;
  currencyLabel?: string | null;
};

const UUID_LIKE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKFLOW_RELATED_FIELD_PREFIX = '__workflow_related__';
const WORKFLOW_RECORD_LINK_FIELD_KEY = '__workflow_record_link';
const WORKFLOW_ASSIGNEE_FIELD_KEY = '__workflow_assignee';

const normalize = (value: unknown) => String(value ?? '').trim();

const parseRelatedFieldKey = (value: string) => {
  if (!value.startsWith(WORKFLOW_RELATED_FIELD_PREFIX)) return null;
  const parts = value.slice(WORKFLOW_RELATED_FIELD_PREFIX.length).split('::');
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  return { relationFieldKey: parts[0], targetModuleId: parts[1], targetFieldKey: parts[2] };
};

const recordLabel = (record: Record<string, any> | null, moduleId: string) => {
  if (!record) return '';
  if (moduleId === 'profiles') {
    const profileName = normalize(record.full_name || record.display_name)
      || [record.first_name, record.last_name].map(normalize).filter(Boolean).join(' ');
    return profileName || normalize(record.email || record.mobile_1);
  }
  if (moduleId === 'org_roles' || moduleId === 'roles') return normalize(record.title || record.name);
  return normalize(
    record.system_code
    || record.name
    || record.title
    || record.full_name
    || record.business_name
    || record.legal_name,
  );
};

const stripMarkup = (value: unknown) => normalize(value)
  .replace(/<\s*br\s*\/?\s*>/gi, '\n')
  .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
  .replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .trim();

const formatDateValue = (value: unknown, includeTime: boolean) => {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return normalize(value);
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: 'Asia/Tehran',
  }).format(date);
};

const formatScalar = (
  value: unknown,
  descriptor: CampaignMessageVariableDescriptor,
  context: Pick<CampaignVariableResolverContext, 'currencyCode' | 'currencyLabel'>,
): string => {
  if (value === null || value === undefined || value === '') return '';
  const fieldType = normalize(descriptor.field_type).toLowerCase();
  const option = (descriptor.options || []).find((item) => normalize(item.value) === normalize(value));
  if (option?.label) return normalize(option.label);
  if (fieldType === 'checkbox' || typeof value === 'boolean') return value ? 'بله' : 'خیر';
  if (fieldType === 'date') return formatDateValue(value, false);
  if (fieldType === 'datetime') return formatDateValue(value, true);
  if (fieldType === 'price') {
    return formatWorkflowPriceWithCurrency(value, context.currencyCode, context.currencyLabel) || normalize(value);
  }
  if (['number', 'stock', 'percentage', 'percentage_or_amount'].includes(fieldType)) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? new Intl.NumberFormat('fa-IR').format(numeric) : normalize(value);
  }
  if (fieldType === 'long_text' || fieldType === 'superlongtext') return stripMarkup(value);
  if (Array.isArray(value)) {
    return value.map((item) => formatScalar(item, descriptor, context)).filter(Boolean).join('، ');
  }
  if (typeof value === 'object') {
    const objectLabel = normalize((value as any).label || (value as any).title || (value as any).name);
    if (objectLabel) return objectLabel;
    const objectId = normalize((value as any).id || (value as any).value);
    return UUID_LIKE_REGEX.test(objectId) ? '' : objectId;
  }
  const result = normalize(value);
  return UUID_LIKE_REGEX.test(result) ? '' : result;
};

const resolveRelationValue = async (
  rawValue: unknown,
  descriptor: CampaignMessageVariableDescriptor,
  context: CampaignVariableResolverContext,
) => {
  const recordId = normalize(
    typeof rawValue === 'object' && rawValue
      ? ((rawValue as any).id || (rawValue as any).value)
      : rawValue,
  );
  const targetModule = normalize(descriptor.relation_target_module);
  if (!recordId || !targetModule || !UUID_LIKE_REGEX.test(recordId)) return '';
  const related = await context.fetchRecord(targetModule, recordId);
  if (!related) return '';
  const targetField = normalize(descriptor.relation_target_field);
  if (targetField && related[targetField] !== null && related[targetField] !== undefined && related[targetField] !== '') {
    const targetValue = formatScalar(related[targetField], descriptor, context);
    if (targetValue) return targetValue;
  }
  return recordLabel(related, targetModule);
};

const resolveAssignee = async (
  record: Record<string, any>,
  context: CampaignVariableResolverContext,
) => {
  const roleId = normalize(record.assignee_role_id);
  const userId = normalize(record.assignee_id);
  const useRole = normalize(record.assignee_type).toLowerCase() === 'role' || (!userId && Boolean(roleId));
  const targetModule = useRole ? 'org_roles' : 'profiles';
  const targetId = useRole ? roleId : userId;
  if (!targetId) return '';
  return recordLabel(await context.fetchRecord(targetModule, targetId), targetModule);
};

const resolveDescriptor = async (
  descriptor: CampaignMessageVariableDescriptor,
  context: CampaignVariableResolverContext,
) => {
  const fieldKey = normalize(descriptor.field_key || descriptor.key);
  const relatedMeta = parseRelatedFieldKey(fieldKey);
  let sourceRecord = context.sourceRecord;
  let valueKey = fieldKey;
  let moduleId = context.sourceModuleId;

  if (relatedMeta) {
    const relatedId = normalize(sourceRecord[relatedMeta.relationFieldKey]);
    if (!relatedId) return '';
    const relatedRecord = await context.fetchRecord(relatedMeta.targetModuleId, relatedId);
    if (!relatedRecord) return '';
    sourceRecord = relatedRecord;
    valueKey = relatedMeta.targetFieldKey;
    moduleId = relatedMeta.targetModuleId;
  }

  if (valueKey === WORKFLOW_RECORD_LINK_FIELD_KEY) {
    const base = normalize(context.appBaseUrl).replace(/\/+$/, '');
    const recordId = normalize(sourceRecord.id);
    return base && moduleId && recordId ? `${base}/${moduleId}/${recordId}` : '';
  }
  if (valueKey === WORKFLOW_ASSIGNEE_FIELD_KEY) return resolveAssignee(sourceRecord, context);

  const assigneeAliases: Record<string, { kind: 'user' | 'role'; field: string }> = {
    assignee_full_name: { kind: 'user', field: 'full_name' },
    assignee_name: { kind: 'user', field: 'full_name' },
    assignee_mobile: { kind: 'user', field: 'mobile_1' },
    assignee_mobile_1: { kind: 'user', field: 'mobile_1' },
    assignee_job_title: { kind: 'user', field: 'job_title' },
    assignee_role_title: { kind: 'role', field: 'title' },
  };
  const alias = assigneeAliases[valueKey];
  if (alias) {
    const targetModule = alias.kind === 'role' ? 'org_roles' : 'profiles';
    const targetId = normalize(alias.kind === 'role' ? sourceRecord.assignee_role_id : sourceRecord.assignee_id);
    if (!targetId) return '';
    const identity = await context.fetchRecord(targetModule, targetId);
    return formatScalar(identity?.[alias.field], descriptor, context) || recordLabel(identity, targetModule);
  }

  const rawValue = sourceRecord[valueKey];
  const fieldType = normalize(descriptor.field_type).toLowerCase();
  if (fieldType === 'user') {
    const userId = normalize(rawValue);
    return userId ? recordLabel(await context.fetchRecord('profiles', userId), 'profiles') : '';
  }
  if (fieldType === 'relation') return resolveRelationValue(rawValue, descriptor, context);
  if (fieldType === 'multi_relation') {
    const values = Array.isArray(rawValue) ? rawValue : rawValue ? [rawValue] : [];
    const labels = await Promise.all(values.map((item) => resolveRelationValue(item, descriptor, context)));
    return labels.filter(Boolean).join('، ');
  }
  return formatScalar(rawValue, descriptor, context);
};

export const renderCampaignMessageVariables = async (
  template: unknown,
  context: CampaignVariableResolverContext,
) => {
  const rawTemplate = String(template || '');
  const tokens = Array.from(rawTemplate.matchAll(/{{\s*([a-zA-Z0-9_.:-]+)\s*}}/g));
  if (!tokens.length) return rawTemplate;
  const replacements = new Map<string, string>();
  for (const match of tokens) {
    const key = normalize(match[1]);
    if (!key || replacements.has(key)) continue;
    const candidates = context.descriptors.filter((item) => normalize(item.key || item.field_key) === key);
    const descriptor = candidates.find((item) => normalize(item.module_id) === normalize(context.sourceModuleId)) || candidates[0];
    replacements.set(key, descriptor ? await resolveDescriptor(descriptor, context) : '');
  }
  return rawTemplate.replace(/{{\s*([a-zA-Z0-9_.:-]+)\s*}}/g, (_match, key) => replacements.get(normalize(key)) || '');
};
