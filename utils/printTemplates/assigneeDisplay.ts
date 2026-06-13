import { buildResolvedAssigneeCombo, getResolvedAssigneeId, normalizeAssigneeType, parseAssigneeValue } from '../assigneeValue';

type RelationOptions = Record<string, any[]>;

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
  const parsed = parseAssigneeValue(rawValue);
  if (!parsed.assigneeType || !parsed.assigneeId) return '';

  const comboValue = `${parsed.assigneeType}_${parsed.assigneeId}`;
  const roleOptions = [
    ...(relationOptions.org_roles || []),
    ...(relationOptions.roles || []),
    ...(relationOptions.assignee_role_id || []),
  ];
  const userOptions = [
    ...(relationOptions.assignee_id || []),
    ...(relationOptions.profiles || []),
  ];
  const mergedOptions = Object.values(relationOptions || {}).flat();

  const directComboLabel = resolvePrintOptionLabel(mergedOptions, comboValue);
  if (directComboLabel) return directComboLabel;

  return parsed.assigneeType === 'role'
    ? (resolvePrintOptionLabel(roleOptions, parsed.assigneeId) || resolvePrintOptionLabel(mergedOptions, parsed.assigneeId))
    : (resolvePrintOptionLabel(userOptions, parsed.assigneeId) || resolvePrintOptionLabel(mergedOptions, parsed.assigneeId));
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
    source?.created_by_name ||
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
    ? [
        ...(relationOptions.org_roles || []),
        ...(relationOptions.roles || []),
        ...(relationOptions.assignee_role_id || []),
      ]
    : [
        ...(relationOptions.assignee_id || []),
        ...(relationOptions.profiles || []),
      ];

  return resolvePrintOptionLabel(scopedOptions, assigneeId) || '';
};
