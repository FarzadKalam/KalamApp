/**
 * قرارداد خالص و قابل‌استفاده در رابط و runner برای مقداردهی اکشن‌های گردش کار.
 * این فایل عمداً به React، Supabase و enumهای frontend وابسته نیست تا همان منطق
 * در اجرای سروری نیز به کار رود.
 */

export type WorkflowFieldDescriptor = {
  key?: string;
  type?: string;
  readonly?: boolean;
  nature?: string;
  relationConfig?: { targetModule?: string } | null;
  multiRelationConfig?: { targetModule?: string } | null;
  workflowOptionScopeModuleId?: string;
  workflowValueKind?: string;
  options?: Array<{ value?: unknown; label?: unknown }>;
  dynamicOptionsCategory?: string;
};

export type WorkflowDateCriterion = 'manual' | 'today' | 'yesterday' | 'now';

const normalize = (value: unknown) => String(value || '').trim();
const fieldType = (field?: WorkflowFieldDescriptor | null) => normalize(field?.type).toLowerCase();

export const WORKFLOW_MUTATION_PROTECTED_FIELD_KEYS = new Set([
  'id', 'org_id', 'created_at', 'created_by', 'updated_at', 'updated_by',
]);

export const isWorkflowProtectedFieldKey = (value: unknown) =>
  WORKFLOW_MUTATION_PROTECTED_FIELD_KEYS.has(normalize(value));

export const isWorkflowAssigneeField = (field?: WorkflowFieldDescriptor | null) => {
  const key = normalize(field?.key);
  return key === '__workflow_assignee'
    || key === 'assignee_id'
    || key.endsWith('__assignee_id')
    || key.endsWith('__workflow_assignee');
};

const getRelationTargetModule = (field?: WorkflowFieldDescriptor | null) =>
  normalize(field?.relationConfig?.targetModule || field?.multiRelationConfig?.targetModule);

const getFieldKind = (field?: WorkflowFieldDescriptor | null) => {
  if (isWorkflowAssigneeField(field)) return 'assignee';
  const explicit = normalize(field?.workflowValueKind).toLowerCase();
  if (explicit) return explicit;
  const type = fieldType(field);
  if (['text', 'long_text', 'superlongtext', 'phone', 'email', 'link'].includes(type)) return 'text';
  if (['number', 'price', 'percentage', 'stock', 'percentage_or_amount'].includes(type)) return 'numeric';
  if (type === 'date') return 'date';
  if (type === 'datetime') return 'datetime';
  if (type === 'time') return 'time';
  if (type === 'relation') return 'relation';
  if (type === 'multi_relation') return 'multi_relation';
  if (['select', 'status'].includes(type)) return 'select';
  if (['multi_select', 'checklist', 'tags'].includes(type)) return 'multi_select';
  if (type === 'checkbox') return 'checkbox';
  if (type === 'user') return 'user';
  return type || 'unknown';
};

export const getWorkflowDateCriteria = (field?: WorkflowFieldDescriptor | null) => {
  const kind = getFieldKind(field);
  if (kind === 'date') {
    return [
      { value: 'manual' as const, label: 'دستی' },
      { value: 'today' as const, label: 'تاریخ امروز' },
      { value: 'yesterday' as const, label: 'تاریخ دیروز' },
    ];
  }
  if (kind === 'datetime') {
    return [
      { value: 'manual' as const, label: 'دستی' },
      { value: 'now' as const, label: 'لحظه اجرا' },
      { value: 'yesterday' as const, label: 'تاریخ دیروز' },
    ];
  }
  return [];
};

const tehranDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const read = (name: string) => parts.find((part) => part.type === name)?.value || '';
  return `${read('year')}-${read('month')}-${read('day')}`;
};

/** مقدار دیتابیس را با همان قرارداد PersianDatePicker تولید می‌کند. */
export const resolveWorkflowDateCriterion = (
  field: WorkflowFieldDescriptor | null | undefined,
  criterion: unknown,
  now: Date = new Date(),
) => {
  const kind = getFieldKind(field);
  const normalizedCriterion = normalize(criterion).toLowerCase() as WorkflowDateCriterion;
  if (!['date', 'datetime'].includes(kind) || normalizedCriterion === 'manual' || !normalizedCriterion) return undefined;
  const isYesterday = normalizedCriterion === 'yesterday';
  const reference = isYesterday ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
  if (kind === 'date') return tehranDate(reference);
  if (normalizedCriterion === 'now' || isYesterday) return reference.toISOString();
  return now.toISOString();
};

const relationTargetsMatch = (target: WorkflowFieldDescriptor, source: WorkflowFieldDescriptor) => {
  const targetModule = getRelationTargetModule(target);
  const sourceModule = getRelationTargetModule(source)
    || normalize(source?.workflowOptionScopeModuleId);
  return Boolean(targetModule && sourceModule && targetModule === sourceModule);
};

/** آیا مقدار یک فیلد منبع می‌تواند بدون تبدیل مبهم در فیلد مقصد قرار گیرد؟ */
export const isWorkflowFieldValueCompatible = (
  target?: WorkflowFieldDescriptor | null,
  source?: WorkflowFieldDescriptor | null,
) => {
  if (!target || !source) return false;
  const targetKind = getFieldKind(target);
  const sourceKind = getFieldKind(source);
  if (targetKind === 'text') return !['image', 'json', 'progress_stages', 'location', 'unknown'].includes(sourceKind);
  if (targetKind === 'numeric') return sourceKind === 'numeric';
  if (targetKind === 'date' || targetKind === 'datetime' || targetKind === 'time') return targetKind === sourceKind;
  if (targetKind === 'checkbox') return sourceKind === 'checkbox';
  if (targetKind === 'assignee') return sourceKind === 'assignee' || sourceKind === 'user';
  if (targetKind === 'relation' || targetKind === 'multi_relation') {
    return targetKind === sourceKind && relationTargetsMatch(target, source);
  }
  if (targetKind === 'select') return sourceKind === 'select';
  if (targetKind === 'multi_select') return sourceKind === 'multi_select';
  if (targetKind === 'user') return sourceKind === 'user' || sourceKind === 'assignee';
  return targetKind === sourceKind;
};

export const getCompatibleWorkflowSourceFields = <T extends WorkflowFieldDescriptor>(
  target: WorkflowFieldDescriptor | null | undefined,
  sourceFields: T[],
) => (sourceFields || []).filter((source) => isWorkflowFieldValueCompatible(target, source));

export const normalizeWorkflowAssigneeValue = (value: unknown) => {
  const raw = Array.isArray(value) ? normalize(value[0]) : normalize(value);
  const match = raw.match(/^(user|role)[:_](.+)$/i);
  const type = match?.[1]?.toLowerCase() === 'role' ? 'role' : 'user';
  const id = normalize(match?.[2] || raw);
  return {
    assignee_id: id && type === 'user' ? id : null,
    assignee_role_id: id && type === 'role' ? id : null,
    assignee_type: id ? type : null,
  };
};

export const isWorkflowValueAllowedByStaticOptions = (
  field: WorkflowFieldDescriptor | null | undefined,
  value: unknown,
) => {
  const options = Array.isArray(field?.options) ? field.options : [];
  if (options.length === 0 || value === null || value === undefined || value === '') return true;
  const allowed = new Set(options.map((option) => normalize(option?.value)));
  const values = Array.isArray(value) ? value : [value];
  return values.every((item) => allowed.has(normalize(item)));
};
