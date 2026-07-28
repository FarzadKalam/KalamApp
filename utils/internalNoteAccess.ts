const normalizeId = (value: unknown) => String(value || '').trim();

export const normalizeInternalNoteRecipientIds = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(normalizeId).filter(Boolean);
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return [];
  return trimmed
    .replace(/^\{|\}$/g, '')
    .split(',')
    .map((item) => normalizeId(item.replace(/"/g, '')))
    .filter(Boolean);
};

export const isInternalSystemNoteRow = (note: any) => {
  const metadata = note?.metadata && typeof note.metadata === 'object' && !Array.isArray(note.metadata)
    ? note.metadata
    : {};
  if (normalizeId(metadata?.chat_group_id)) return false;
  const sourceType = normalizeId(note?.source_type || metadata?.source_type).toLowerCase();
  return (
    sourceType === 'system'
    || sourceType === 'ai'
    || Boolean(metadata?.workflow_id || metadata?.automation_rule_id || metadata?.process_automation_rule_id)
  );
};

export const canCurrentUserAccessInternalSystemNote = (
  note: any,
  currentUserId: unknown,
  currentRoleId?: unknown,
) => {
  if (!isInternalSystemNoteRow(note)) return true;
  const userId = normalizeId(currentUserId);
  const roleId = normalizeId(currentRoleId);
  if (!userId) return false;

  const metadata = note?.metadata && typeof note.metadata === 'object' && !Array.isArray(note.metadata)
    ? note.metadata
    : {};
  const inboxItem = note?.__notification_inbox_item && typeof note.__notification_inbox_item === 'object'
    ? note.__notification_inbox_item
    : {};
  const targetUserIds = new Set([
    ...normalizeInternalNoteRecipientIds(note?.mention_user_ids),
    ...normalizeInternalNoteRecipientIds(note?.target_user_ids),
    ...normalizeInternalNoteRecipientIds(inboxItem?.target_user_ids),
  ]);
  if (targetUserIds.has(userId)) return true;

  if (!roleId) return false;
  const targetRoleIds = new Set([
    ...normalizeInternalNoteRecipientIds(note?.mention_role_ids),
    ...normalizeInternalNoteRecipientIds(note?.target_role_ids),
    ...normalizeInternalNoteRecipientIds(inboxItem?.target_role_ids),
  ]);
  return targetRoleIds.has(roleId);
};
