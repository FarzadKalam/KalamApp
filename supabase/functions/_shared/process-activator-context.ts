const normalizeText = (value: unknown) => String(value ?? '').trim();

export const createProcessLinkedFieldKey = (moduleId: unknown, fieldKey: unknown) =>
  `__linked__${normalizeText(moduleId)}__${normalizeText(fieldKey)}`;

export const buildProcessActivatorRecordContext = (
  moduleId: unknown,
  sourceRecord: Record<string, any> | null | undefined,
) => {
  const normalizedModuleId = normalizeText(moduleId);
  const record = { ...(sourceRecord || {}) } as Record<string, any>;
  const recordId = normalizeText(record.id);

  Object.entries(sourceRecord || {}).forEach(([fieldKey, value]) => {
    record[createProcessLinkedFieldKey(normalizedModuleId, fieldKey)] = value;
  });

  const assigneeRoleId = normalizeText(record.assignee_role_id);
  const assigneeUserId = normalizeText(record.assignee_id);
  record[createProcessLinkedFieldKey(normalizedModuleId, '__workflow_assignee')] = assigneeRoleId
    ? `role:${assigneeRoleId}`
    : assigneeUserId
      ? `user:${assigneeUserId}`
      : null;

  record.process_links = {
    ...(record.process_links && typeof record.process_links === 'object' ? record.process_links : {}),
    ...(normalizedModuleId && recordId ? { [normalizedModuleId]: recordId } : {}),
  };
  record.process_target_module_ids = Array.from(new Set([
    ...(Array.isArray(record.process_target_module_ids) ? record.process_target_module_ids : []),
    normalizedModuleId,
  ].map(normalizeText).filter(Boolean)));

  return record;
};
