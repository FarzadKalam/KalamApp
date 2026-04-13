import { getAssigneeLabel } from './assigneeLabel';

type FieldLabelOptions = {
  moduleId?: string | null;
  fallback?: string | null;
  fieldKey?: string | null;
};

const ASSIGNEE_LABEL_REGEX = /^assignee(?:\s*\(.+\))?$/i;

const normalizeText = (value: unknown): string => String(value || '').trim();

export const getFieldLabelFa = (field?: any, options: FieldLabelOptions = {}): string => {
  const moduleId = normalizeText(options.moduleId);
  const fieldKey = normalizeText(field?.key || options.fieldKey);
  const faLabel = normalizeText(field?.labels?.fa || options.fallback);
  const enLabel = normalizeText(field?.labels?.en);

  if (fieldKey === 'assignee_id') {
    return getAssigneeLabel(moduleId);
  }

  if (ASSIGNEE_LABEL_REGEX.test(faLabel)) {
    return faLabel.replace(ASSIGNEE_LABEL_REGEX, getAssigneeLabel(moduleId));
  }

  if (!faLabel && ASSIGNEE_LABEL_REGEX.test(enLabel)) {
    return enLabel.replace(ASSIGNEE_LABEL_REGEX, getAssigneeLabel(moduleId));
  }

  return faLabel || enLabel || fieldKey || 'بدون نام';
};
