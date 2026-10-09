import { createProcessLinkedFieldKey, parseProcessLinkedFieldKey } from './processTargets';
import { resolveProcessTemplateTokenValue } from './processTemplateContext';
import { WORKFLOW_ASSIGNEE_FIELD_KEY } from './workflowTypes';
import { parseAssigneeValue } from './assigneeValue';

const normalizeText = (value: unknown) => String(value || '').trim();

export const normalizeProcessAssigneeFieldReference = (value: unknown) => {
  const raw = normalizeText(value);
  if (!raw) return '';
  if (raw.toLowerCase().startsWith('field:')) return raw;
  if (raw.startsWith('__linked__') || raw === WORKFLOW_ASSIGNEE_FIELD_KEY || raw === 'assignee_combo') {
    return `field:${raw}`;
  }
  return '';
};

export const findProcessAssigneeFieldReference = (...values: unknown[]) => (
  values.map(normalizeProcessAssigneeFieldReference).find(Boolean) || ''
);

/** انتخاب صریح نقش/کاربر نباید با ارجاع قدیمی فیلد جایگزین شود. */
export const normalizeProcessStageDefaultAssignee = (stage: any) => {
  const metadata = stage?.metadata && typeof stage.metadata === 'object' && !Array.isArray(stage.metadata)
    ? stage.metadata
    : {};
  const roleCandidate = parseAssigneeValue(
    stage?.default_assignee_role_id ?? stage?.assignee_role_id ?? metadata?.default_assignee_role_id ?? metadata?.assignee_role_id,
    'role',
  );
  if (roleCandidate.assigneeType === 'role' && roleCandidate.assigneeId) {
    return { defaultAssigneeId: null, defaultAssigneeRoleId: roleCandidate.assigneeId, defaultAssigneeField: '' };
  }
  const userCandidate = parseAssigneeValue(
    stage?.default_assignee_id ?? stage?.assignee_id ?? metadata?.default_assignee_id ?? metadata?.assignee_id,
    'user',
  );
  if (userCandidate.assigneeType === 'role' && userCandidate.assigneeId) {
    return { defaultAssigneeId: null, defaultAssigneeRoleId: userCandidate.assigneeId, defaultAssigneeField: '' };
  }
  if (userCandidate.assigneeType === 'user' && userCandidate.assigneeId && !normalizeProcessAssigneeFieldReference(userCandidate.assigneeId)) {
    return { defaultAssigneeId: userCandidate.assigneeId, defaultAssigneeRoleId: null, defaultAssigneeField: '' };
  }
  return {
    defaultAssigneeId: null,
    defaultAssigneeRoleId: null,
    defaultAssigneeField: findProcessAssigneeFieldReference(
      stage?.default_assignee_field,
      metadata?.default_assignee_field,
      stage?.default_assignee_combo,
      metadata?.default_assignee_combo,
      stage?.default_assignee_id,
      metadata?.default_assignee_id,
    ),
  };
};

export const getProcessAssigneeFieldKey = (value: unknown) => {
  const reference = normalizeProcessAssigneeFieldReference(value);
  return reference ? normalizeText(reference.replace(/^field:/i, '')) : '';
};

export const resolveProcessAssigneeReference = (
  value: unknown,
  context: Record<string, any> | null | undefined,
) => {
  const reference = normalizeProcessAssigneeFieldReference(value);
  if (!reference) return value;

  const fieldKey = getProcessAssigneeFieldKey(reference);
  if (!fieldKey || !context) return '';

  const linked = parseProcessLinkedFieldKey(fieldKey);
  const candidates = Array.from(new Set([
    fieldKey,
    linked?.targetFieldKey,
    linked?.moduleId ? createProcessLinkedFieldKey(linked.moduleId, WORKFLOW_ASSIGNEE_FIELD_KEY) : '',
    linked?.moduleId ? createProcessLinkedFieldKey(linked.moduleId, 'assignee_combo') : '',
    ['assignee_id', 'assignee_role_id', 'assignee_user_id'].includes(normalizeText(linked?.targetFieldKey))
      ? WORKFLOW_ASSIGNEE_FIELD_KEY
      : '',
    ['assignee_id', 'assignee_role_id', 'assignee_user_id'].includes(normalizeText(linked?.targetFieldKey))
      ? 'assignee_combo'
      : '',
  ].map(normalizeText).filter(Boolean)));

  for (const candidate of candidates) {
    const resolved = resolveProcessTemplateTokenValue(context, candidate);
    if (resolved !== undefined && resolved !== null && normalizeText(resolved)) {
      return resolved;
    }
  }

  return '';
};
