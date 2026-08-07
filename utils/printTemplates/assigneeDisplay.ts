import { buildResolvedAssigneeCombo, getResolvedAssigneeId, normalizeAssigneeType, parseAssigneeValue } from '../assigneeValue';

type RelationOptions = Record<string, any[]>;
type AssigneeDirectory = { users?: any[]; roles?: any[] } | null | undefined;

const ASSIGNEE_PREFIX_REGEX = /^(user|role)[:_]/i;
const DELETED_USER_LABEL_FA = 'کاربر حذف شده';
const DELETED_ROLE_LABEL_FA = 'نقش حذف شده';

const hasExplicitAssigneePrefix = (value: unknown): boolean =>
  ASSIGNEE_PREFIX_REGEX.test(String(value || '').trim());

const getDeletedAssigneeLabel = (assigneeType: 'user' | 'role' | null | undefined): string =>
  assigneeType === 'role' ? DELETED_ROLE_LABEL_FA : DELETED_USER_LABEL_FA;

const getOptionLabel = (option: any): string =>
  String(
    option?.label ||
    option?.name ||
    option?.title ||
    option?.full_name ||
    option?.display_name ||
    option?.business_name ||
    ''
  ).trim();

const toOptionList = (value: unknown): any[] => Array.isArray(value) ? value : [];

const mergeOptionLists = (...sources: unknown[]): any[] => {
  const seen = new Set<string>();
  return sources
    .flatMap(toOptionList)
    .filter((option) => {
      const key = String(option?.value || option?.id || getOptionLabel(option) || '').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const getUserOptions = (relationOptions: RelationOptions = {}): any[] => mergeOptionLists(
  relationOptions.assignee_id,
  relationOptions.profiles,
  relationOptions.users,
  relationOptions.profile_id,
);

const getRoleOptions = (relationOptions: RelationOptions = {}): any[] => mergeOptionLists(
  relationOptions.org_roles,
  relationOptions.roles,
  relationOptions.assignee_role_id,
);

/** دایرکتوری مرکزی سازمان را به گزینه‌های قابل‌استفادهٔ همهٔ قالب‌های چاپ اضافه می‌کند. */
export const withPrintIdentityRelationOptions = (
  relationOptions: RelationOptions = {},
  directory: AssigneeDirectory,
): RelationOptions => {
  const users = mergeOptionLists(getUserOptions(relationOptions), directory?.users);
  const roles = mergeOptionLists(getRoleOptions(relationOptions), directory?.roles);
  return {
    ...relationOptions,
    assignee_id: users,
    profiles: users,
    users,
    org_roles: roles,
    roles,
    assignee_role_id: roles,
  };
};

const matchOptionValue = (option: any, value: string) => {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) return false;
  return (
    String(option?.value || '').trim() === normalizedValue ||
    String(option?.id || '').trim() === normalizedValue
  );
};

export const resolvePrintOptionLabel = (
  options: any[] = [],
  value: unknown,
): string => {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) return '';
  const match = Array.isArray(options)
    ? options.find((option) => matchOptionValue(option, normalizedValue))
    : null;
  return getOptionLabel(match);
};

export const resolvePrintAssigneeComboLabel = (
  rawValue: unknown,
  relationOptions: RelationOptions = {},
): string => {
  const hasTypedValue = hasExplicitAssigneePrefix(rawValue);
  const parsed = parseAssigneeValue(rawValue);
  if (!parsed.assigneeType || !parsed.assigneeId) return '';

  // انتخاب‌گر مرکزی مقدار canonical با colon می‌نویسد؛ underscore فقط برای
  // داده‌های قدیمی خوانده می‌شود. هر دو قرارداد باید در نمایش قابل تطبیق باشند.
  const comboValues = [
    `${parsed.assigneeType}:${parsed.assigneeId}`,
    `${parsed.assigneeType}_${parsed.assigneeId}`,
  ];
  const roleOptions = getRoleOptions(relationOptions);
  const userOptions = getUserOptions(relationOptions);
  const mergedOptions = Object.values(relationOptions || {}).flat();

  const directComboLabel = comboValues
    .map((comboValue) => resolvePrintOptionLabel(mergedOptions, comboValue))
    .find(Boolean);
  if (directComboLabel) return directComboLabel;

  const scopedOptions = parsed.assigneeType === 'role' ? roleOptions : userOptions;
  return (
    resolvePrintOptionLabel(scopedOptions, parsed.assigneeId) ||
    resolvePrintOptionLabel(mergedOptions, parsed.assigneeId) ||
    (hasTypedValue ? getDeletedAssigneeLabel(parsed.assigneeType) : '')
  );
};

export const resolvePrintAssigneeLabel = (
  source: any,
  relationOptions: RelationOptions = {},
): string => {
  const explicitLabel = String(
    source?.assignee_name ||
    source?.responsible_name ||
    source?.assignee_label ||
    source?.assignee_role_name ||
    ''
  ).trim();
  if (explicitLabel) return explicitLabel;

  const rawValue = typeof source === 'string'
    ? source
    : (buildResolvedAssigneeCombo(source) || source?.assignee_role_id || source?.assignee_id || '');

  const comboLabel = resolvePrintAssigneeComboLabel(rawValue, relationOptions);
  if (comboLabel) return comboLabel;

  const assigneeId = typeof source === 'string'
    ? parseAssigneeValue(source).assigneeId
    : getResolvedAssigneeId(source);
  if (!assigneeId) return '';

  const assigneeType = typeof source === 'string'
    ? (parseAssigneeValue(source).assigneeType || 'user')
    : normalizeAssigneeType(source?.assignee_type || (source?.assignee_role_id ? 'role' : 'user'));

  const scopedOptions = assigneeType === 'role'
    ? getRoleOptions(relationOptions)
    : getUserOptions(relationOptions);

  return resolvePrintOptionLabel(scopedOptions, assigneeId) || '';
};

/** نام ایجادکننده یا آخرین ویرایشگر را بدون نمایش شناسهٔ خام برمی‌گرداند. */
export const resolvePrintActorLabel = (
  source: any,
  actorKey: 'created_by' | 'updated_by',
  relationOptions: RelationOptions = {},
): string => {
  const actor = typeof source === 'object' && source !== null ? source : { [actorKey]: source };
  const explicitLabel = String(
    actor?.[`${actorKey}_name`] ||
    actor?.[`${actorKey}_label`] ||
    actor?.[`${actorKey}_display_name`] ||
    ''
  ).trim();
  if (explicitLabel) return explicitLabel;

  const rawValue = actor?.[actorKey];
  if (rawValue && typeof rawValue === 'object') return getOptionLabel(rawValue);
  const actorId = parseAssigneeValue(rawValue, 'user').assigneeId;
  if (!actorId) return '';

  return resolvePrintOptionLabel(getUserOptions(relationOptions), actorId) || DELETED_USER_LABEL_FA;
};
