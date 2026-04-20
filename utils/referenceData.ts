import { fetchSessionBootstrap } from './sessionCache';
import { getMergedTaskTypeOptions } from './taskMeta';

type DynamicOptionRow = { label: string; value: string };
type AssigneeDirectory = {
  users: Array<{
    id: string;
    full_name?: string | null;
    email?: string | null;
    mobile_1?: string | null;
    avatar_url?: string | null;
    role_id?: string | null;
    display_name: string;
  }>;
  roles: Array<{
    id: string;
    title: string;
    parent_id?: string | null;
    sort_order?: number;
    is_system?: boolean;
  }>;
};

const REFERENCE_TTL_MS = 5 * 60_000;

const assigneeDirectoryCache: {
  data: AssigneeDirectory | null;
  expiresAt: number;
  promise: Promise<AssigneeDirectory> | null;
  supportsRoleTreeSchema: boolean | null;
} = {
  data: null,
  expiresAt: 0,
  promise: null,
  supportsRoleTreeSchema: null,
};

const dynamicOptionsCache = new Map<string, { data: DynamicOptionRow[]; expiresAt: number }>();
const dynamicOptionsPromiseCache = new Map<string, Promise<DynamicOptionRow[]>>();
const recordTagsCache = new Map<string, { data: Record<string, any[]>; expiresAt: number }>();
const recordTagsPromiseCache = new Map<string, Promise<Record<string, any[]>>>();
const RECORD_TAGS_FETCH_CHUNK_SIZE = 25;

const formulaOptionsCache: {
  data: DynamicOptionRow[] | null;
  expiresAt: number;
  promise: Promise<DynamicOptionRow[]> | null;
} = {
  data: null,
  expiresAt: 0,
  promise: null,
};

const normalizeDynamicOptions = (rows: any[]) =>
  (rows || [])
    .filter((item: any) => item?.value !== null && item?.value !== undefined)
    .map((item: any) => ({
      label: String(item?.label ?? item?.value ?? '').trim(),
      value: String(item?.value ?? item?.label ?? '').trim(),
    }))
    .filter((item: DynamicOptionRow) => item.value);

const normalizeUsers = (rows: any[]) =>
  (rows || []).map((user: any) => ({
    ...user,
    id: String(user?.id || ''),
    role_id: user?.role_id ? String(user.role_id) : null,
    display_name:
      String(user?.full_name || '').trim() ||
      String(user?.email || '').trim() ||
      String(user?.mobile_1 || '').trim() ||
      `کاربر ${String(user?.id || '').slice(0, 8)}`,
  }));

const normalizeRoles = (rows: any[]) =>
  (rows || []).map((role: any) => ({
    id: String(role?.id || ''),
    title: String(role?.title || role?.name || role?.id || '').trim() || 'بدون عنوان',
    parent_id: role?.parent_id ? String(role.parent_id) : null,
    sort_order: Number.isFinite(Number(role?.sort_order)) ? Number(role.sort_order) : 0,
    is_system: role?.is_system === true,
  }));

const mergeRoleRows = (...sources: any[][]): any[] => {
  const map = new Map<string, any>();
  sources.forEach((rows) => {
    (rows || []).forEach((row: any) => {
      const id = String(row?.id || '').trim();
      if (!id || map.has(id)) return;
      map.set(id, row);
    });
  });
  return Array.from(map.values());
};

const dedupeRolesForAssigneeSelection = (rows: any[]): any[] => {
  const titleMap = new Map<string, any>();
  return (rows || []).filter((row: any) => {
    const id = String(row?.id || '').trim();
    if (!id) return false;
    const titleKey = String(row?.title || row?.name || id).trim().toLocaleLowerCase('fa');
    const dedupeKey = titleKey || id;
    if (titleMap.has(dedupeKey)) return false;
    titleMap.set(dedupeKey, row);
    return true;
  });
};

export const clearReferenceDataCache = () => {
  assigneeDirectoryCache.data = null;
  assigneeDirectoryCache.expiresAt = 0;
  assigneeDirectoryCache.promise = null;
  assigneeDirectoryCache.supportsRoleTreeSchema = null;

  dynamicOptionsCache.clear();
  dynamicOptionsPromiseCache.clear();
  recordTagsCache.clear();
  recordTagsPromiseCache.clear();

  formulaOptionsCache.data = null;
  formulaOptionsCache.expiresAt = 0;
  formulaOptionsCache.promise = null;
};

const buildRecordTagsCacheKey = (moduleId: string, recordIds: string[]) =>
  `${String(moduleId || '').trim()}::${recordIds.map((id) => String(id || '').trim()).filter(Boolean).sort().join(',')}`;

const isRoleTreeColumnMissingError = (error: any) => {
  const text = String(error?.message || error?.details || error || '').toLowerCase();
  return text.includes('parent_id') || text.includes('sort_order');
};

export const fetchRecordTagsMap = async (
  supabaseClient: any,
  moduleId: string,
  recordIds: string[],
  options?: { force?: boolean }
): Promise<Record<string, any[]>> => {
  const uniqueRecordIds = Array.from(new Set((recordIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (!moduleId || uniqueRecordIds.length === 0) {
    return {};
  }

  const cacheKey = buildRecordTagsCacheKey(moduleId, uniqueRecordIds);
  const now = Date.now();
  const cached = recordTagsCache.get(cacheKey);
  if (!options?.force && cached && cached.expiresAt > now) {
    return cached.data;
  }

  if (!options?.force && recordTagsPromiseCache.has(cacheKey)) {
    return recordTagsPromiseCache.get(cacheKey)!;
  }

  const pending = (async () => {
    const rows: any[] = [];
    for (let i = 0; i < uniqueRecordIds.length; i += RECORD_TAGS_FETCH_CHUNK_SIZE) {
      const chunk = uniqueRecordIds.slice(i, i + RECORD_TAGS_FETCH_CHUNK_SIZE);
      const { data, error } = await supabaseClient
        .from('record_tags')
        .select('record_id, tags(id, title, color)')
        .in('record_id', chunk);
      if (error) throw error;
      if (Array.isArray(data) && data.length > 0) {
        rows.push(...data);
      }
    }

    const normalized: Record<string, any[]> = {};
    rows.forEach((item: any) => {
      const recordId = String(item?.record_id || '').trim();
      if (!recordId) return;
      if (!normalized[recordId]) {
        normalized[recordId] = [];
      }
      if (item?.tags) {
        normalized[recordId].push(item.tags);
      }
    });

    recordTagsCache.set(cacheKey, {
      data: normalized,
      expiresAt: Date.now() + REFERENCE_TTL_MS,
    });
    recordTagsPromiseCache.delete(cacheKey);
    return normalized;
  })().catch((error) => {
    recordTagsPromiseCache.delete(cacheKey);
    throw error;
  });

  recordTagsPromiseCache.set(cacheKey, pending);
  return pending;
};

export const fetchAssigneeDirectory = async (
  supabaseClient: any,
  options?: { force?: boolean }
): Promise<AssigneeDirectory> => {
  const now = Date.now();
  if (!options?.force && assigneeDirectoryCache.data && assigneeDirectoryCache.expiresAt > now) {
    return assigneeDirectoryCache.data;
  }

  if (!options?.force && assigneeDirectoryCache.promise) {
    return assigneeDirectoryCache.promise;
  }

  assigneeDirectoryCache.promise = (async () => {
    const snapshot = await fetchSessionBootstrap(supabaseClient, options);
    const orgId = String(snapshot.orgId || '').trim();

    let usersQuery = supabaseClient.from('profiles').select('id, full_name, email, mobile_1, avatar_url, role_id');
    const preferTreeSchema = assigneeDirectoryCache.supportsRoleTreeSchema !== false;

    if (orgId) {
      usersQuery = usersQuery.eq('org_id', orgId);
    }

    const buildRoleQuery = (mode: 'org' | 'extra', treeSchema: boolean) => {
      let query = treeSchema
        ? supabaseClient
            .from('org_roles')
            .select('id, org_id, title, parent_id, sort_order, is_system')
            .limit(400)
        : supabaseClient
            .from('org_roles')
            .select('id, org_id, title, is_system')
            .limit(400);

      if (orgId) {
        if (mode === 'org') {
          query = query.eq('org_id', orgId);
        } else {
          query = query.or('is_system.eq.true,org_id.is.null');
        }
      }

      return query;
    };

    const extraRoleIdsQuery = orgId
      ? supabaseClient
          .from('phone_signup_invites')
          .select('role_id')
          .eq('org_id', orgId)
          .not('role_id', 'is', null)
      : Promise.resolve({ data: [] as any[], error: null });

    const [{ data: users }, orgRolesResult, extraRolesResult, extraRoleIdsResult] = await Promise.all([
      usersQuery,
      buildRoleQuery('org', preferTreeSchema),
      orgId ? buildRoleQuery('extra', preferTreeSchema) : Promise.resolve({ data: [] as any[], error: null }),
      extraRoleIdsQuery,
    ]);

    let roles = mergeRoleRows(orgRolesResult?.data || [], extraRolesResult?.data || []);
    const roleTreeMissing =
      preferTreeSchema
      && (
        (orgRolesResult?.error && isRoleTreeColumnMissingError(orgRolesResult.error))
        || (extraRolesResult?.error && isRoleTreeColumnMissingError(extraRolesResult.error))
      );

    if (roleTreeMissing) {
      assigneeDirectoryCache.supportsRoleTreeSchema = false;
      const [fallbackOrgRoles, fallbackExtraRoles] = await Promise.all([
        buildRoleQuery('org', false),
        orgId ? buildRoleQuery('extra', false) : Promise.resolve({ data: [] as any[] }),
      ]);
      roles = mergeRoleRows(
        (fallbackOrgRoles?.data || []).map((row: any) => ({ ...row, parent_id: null, sort_order: 0 })),
        (fallbackExtraRoles?.data || []).map((row: any) => ({ ...row, parent_id: null, sort_order: 0 })),
      );
    } else if (!orgRolesResult?.error && !extraRolesResult?.error && preferTreeSchema) {
      assigneeDirectoryCache.supportsRoleTreeSchema = true;
    } else if (!preferTreeSchema) {
      roles = (roles || []).map((row: any) => ({ ...row, parent_id: null, sort_order: 0 }));
    } else if ((!roles || roles.length === 0) && (orgRolesResult?.error || extraRolesResult?.error)) {
      const [fallbackOrgRoles, fallbackExtraRoles] = await Promise.all([
        orgId
          ? supabaseClient.from('org_roles').select('*').eq('org_id', orgId).limit(400)
          : supabaseClient.from('org_roles').select('*').limit(400),
        orgId
          ? supabaseClient.from('org_roles').select('*').or('is_system.eq.true,org_id.is.null').limit(400)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      roles = mergeRoleRows(fallbackOrgRoles?.data || [], fallbackExtraRoles?.data || []);
    }

    const assignedRoleIds = Array.from(
      new Set(
        [
          ...(users || []).map((row: any) => String(row?.role_id || '').trim()),
          ...((extraRoleIdsResult as any)?.data || []).map((row: any) => String(row?.role_id || '').trim()),
        ].filter(Boolean)
      )
    ).filter((id) => !(roles || []).some((role: any) => String(role?.id || '').trim() === id));

    if (assignedRoleIds.length > 0) {
      const missingRolesResult = assigneeDirectoryCache.supportsRoleTreeSchema === false
        ? await supabaseClient.from('org_roles').select('id, org_id, title, is_system').in('id', assignedRoleIds)
        : await supabaseClient.from('org_roles').select('id, org_id, title, parent_id, sort_order, is_system').in('id', assignedRoleIds);
      const missingRoles = assigneeDirectoryCache.supportsRoleTreeSchema === false
        ? (missingRolesResult?.data || []).map((row: any) => ({ ...row, parent_id: null, sort_order: 0 }))
        : (missingRolesResult?.data || []);
      roles = mergeRoleRows(roles || [], missingRoles);
    }

    const directory = {
      users: normalizeUsers(users || []),
      roles: normalizeRoles(dedupeRolesForAssigneeSelection(roles || [])),
    };

    assigneeDirectoryCache.data = directory;
    assigneeDirectoryCache.expiresAt = Date.now() + REFERENCE_TTL_MS;
    assigneeDirectoryCache.promise = null;
    return directory;
  })().catch((error) => {
    assigneeDirectoryCache.promise = null;
    throw error;
  });

  return assigneeDirectoryCache.promise;
};

export const fetchDynamicOptionsByCategory = async (
  supabaseClient: any,
  category: string,
  options?: { force?: boolean }
): Promise<DynamicOptionRow[]> => {
  const normalizedCategory = String(category || '').trim();
  if (!normalizedCategory) return [];

  const cached = dynamicOptionsCache.get(normalizedCategory);
  if (!options?.force && cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  if (!options?.force && dynamicOptionsPromiseCache.has(normalizedCategory)) {
    return dynamicOptionsPromiseCache.get(normalizedCategory)!;
  }

  const pending = (async () => {
    const { data } = await supabaseClient
      .from('dynamic_options')
      .select('label, value')
      .eq('category', normalizedCategory)
      .eq('is_active', true);

    const normalized = normalizedCategory === 'task_type'
      ? getMergedTaskTypeOptions(data || [])
      : normalizeDynamicOptions(data || []);
    dynamicOptionsCache.set(normalizedCategory, {
      data: normalized,
      expiresAt: Date.now() + REFERENCE_TTL_MS,
    });
    dynamicOptionsPromiseCache.delete(normalizedCategory);
    return normalized;
  })().catch((error) => {
    dynamicOptionsPromiseCache.delete(normalizedCategory);
    throw error;
  });

  dynamicOptionsPromiseCache.set(normalizedCategory, pending);
  return pending;
};

export const fetchDynamicOptionsMap = async (
  supabaseClient: any,
  categories: string[],
  options?: { force?: boolean }
) => {
  const uniqueCategories = Array.from(new Set((categories || []).map((item) => String(item || '').trim()).filter(Boolean)));
  const results = await Promise.all(
    uniqueCategories.map(async (category) => ({
      category,
      options: await fetchDynamicOptionsByCategory(supabaseClient, category, options),
    }))
  );

  return results.reduce<Record<string, DynamicOptionRow[]>>((acc, item) => {
    acc[item.category] = item.options;
    return acc;
  }, {});
};

export const fetchFormulaOptions = async (
  supabaseClient: any,
  options?: { force?: boolean }
): Promise<DynamicOptionRow[]> => {
  if (!options?.force && formulaOptionsCache.data && formulaOptionsCache.expiresAt > Date.now()) {
    return formulaOptionsCache.data;
  }

  if (!options?.force && formulaOptionsCache.promise) {
    return formulaOptionsCache.promise;
  }

  formulaOptionsCache.promise = (async () => {
    const { data } = await supabaseClient.from('calculation_formulas').select('id, name');
    const normalized = (data || []).map((item: any) => ({
      label: String(item?.name || item?.id || '').trim(),
      value: String(item?.id || '').trim(),
    })).filter((item: DynamicOptionRow) => item.value);

    formulaOptionsCache.data = normalized;
    formulaOptionsCache.expiresAt = Date.now() + REFERENCE_TTL_MS;
    formulaOptionsCache.promise = null;
    return normalized;
  })().catch((error) => {
    formulaOptionsCache.promise = null;
    throw error;
  });

  return formulaOptionsCache.promise;
};

export const primeReferenceData = async (
  supabaseClient: any,
  options?: { force?: boolean }
) => {
  await Promise.all([
    fetchAssigneeDirectory(supabaseClient, options),
    fetchFormulaOptions(supabaseClient, options),
  ]);
};
