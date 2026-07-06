type MentionTarget = {
  userIds: string[];
  roleIds: string[];
};

type GroupMentionTarget = {
  groupId: string;
  userIds: string[];
  roleIds: string[];
};

const normalizeIds = (values?: string[] | null) =>
  Array.from(new Set((values || []).map((id) => String(id || '').trim()).filter(Boolean)));

const isMissingColumnError = (error: any, columnName: string) => {
  const code = String(error?.code || '').toUpperCase();
  const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  const normalizedColumn = String(columnName || '').toLowerCase();
  return (
    code === 'PGRST200'
    || code === 'PGRST204'
    || code === '42703'
    || text.includes(`${normalizedColumn} does not exist`)
    || (text.includes('schema cache') && text.includes(normalizedColumn))
  );
};

export const isActiveProfileRow = (row: any) => row?.is_active !== false;

const selectProfiles = async (
  supabaseClient: any,
  field: 'id' | 'role_id',
  values: string[],
) => {
  const ids = normalizeIds(values);
  if (ids.length === 0) return [] as Array<Record<string, any>>;

  const primaryQuery = supabaseClient
    .from('profiles')
    .select('id, role_id, is_active');
  if (typeof primaryQuery?.in !== 'function') return [];
  const result = await primaryQuery.in(field, ids);

  if (!result?.error) return Array.isArray(result?.data) ? result.data : [];
  if (!isMissingColumnError(result.error, 'is_active')) throw result.error;

  const fallbackQuery = supabaseClient
    .from('profiles')
    .select('id, role_id');
  if (typeof fallbackQuery?.in !== 'function') return [];
  const fallback = await fallbackQuery.in(field, ids);
  if (fallback?.error) throw fallback.error;
  return Array.isArray(fallback?.data) ? fallback.data : [];
};

export const filterActiveMentionTargets = async (
  supabaseClient: any,
  target: MentionTarget,
): Promise<MentionTarget> => {
  const requestedUserIds = normalizeIds(target?.userIds);
  const requestedRoleIds = normalizeIds(target?.roleIds);

  const [directRows, roleRows] = await Promise.all([
    selectProfiles(supabaseClient, 'id', requestedUserIds),
    selectProfiles(supabaseClient, 'role_id', requestedRoleIds),
  ]);

  const knownDirectIds = new Set(directRows.map((row: Record<string, any>) => String(row?.id || '').trim()).filter(Boolean));
  const activeUserIds = new Set<string>();

  directRows
    .filter(isActiveProfileRow)
    .forEach((row: Record<string, any>) => {
      const id = String(row?.id || '').trim();
      if (id) activeUserIds.add(id);
    });

  requestedUserIds
    .filter((id) => !knownDirectIds.has(id))
    .forEach((id) => activeUserIds.add(id));

  const rolesWithProfiles = new Set<string>();
  roleRows.forEach((row: Record<string, any>) => {
    const roleId = String(row?.role_id || '').trim();
    if (roleId) rolesWithProfiles.add(roleId);
    if (!isActiveProfileRow(row)) return;
    const id = String(row?.id || '').trim();
    if (id) activeUserIds.add(id);
  });

  const unresolvedRoleIds = requestedRoleIds.filter((roleId) => !rolesWithProfiles.has(roleId));

  return {
    userIds: Array.from(activeUserIds),
    roleIds: unresolvedRoleIds,
  };
};

export const filterActiveGroupMentionTargets = async (
  supabaseClient: any,
  groups: GroupMentionTarget[],
): Promise<GroupMentionTarget[]> => {
  const rows = Array.isArray(groups) ? groups : [];
  if (rows.length === 0) return [];

  const filteredGroups = await Promise.all(
    rows.map(async (group) => {
      const filtered = await filterActiveMentionTargets(supabaseClient, {
        userIds: group.userIds || [],
        roleIds: group.roleIds || [],
      });
      return {
        ...group,
        userIds: filtered.userIds,
        roleIds: filtered.roleIds,
      };
    })
  );

  return filteredGroups.filter((group) => group.userIds.length > 0 || group.roleIds.length > 0);
};
