type BotGroupAccessIdentity = {
  userId?: string | null;
  roleId?: string | null;
  canAccessAll?: boolean;
};

const readIds = (metadata: Record<string, any>, keys: string[]) => Array.from(new Set(
  keys.flatMap((key) => Array.isArray(metadata?.[key]) ? metadata[key] : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean),
));

/**
 * دسترسی پیام‌رسانی به گروه بات: یا همه گروه‌ها، یا عضویت تعریف‌شده روی همان گروه.
 */
export const canAccessCounterpartyBotGroup = (row: any, identity: BotGroupAccessIdentity) => {
  if (identity.canAccessAll) return true;

  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const allowedUserIds = readIds(metadata, ['allowed_user_ids', 'allowed_profile_ids', 'user_ids']);
  const allowedRoleIds = readIds(metadata, ['allowed_role_ids', 'role_ids']);
  const userId = String(identity.userId || '').trim();
  const roleId = String(identity.roleId || '').trim();
  const ownerId = String(row?.created_by || row?.profile_id || '').trim();

  if (userId && ownerId === userId) return true;
  if (userId && allowedUserIds.includes(userId)) return true;
  return Boolean(roleId && allowedRoleIds.includes(roleId));
};
