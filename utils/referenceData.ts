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
  roles: Array<{ id: string; title: string }>;
};

const REFERENCE_TTL_MS = 5 * 60_000;

const assigneeDirectoryCache: {
  data: AssigneeDirectory | null;
  expiresAt: number;
  promise: Promise<AssigneeDirectory> | null;
} = {
  data: null,
  expiresAt: 0,
  promise: null,
};

const dynamicOptionsCache = new Map<string, { data: DynamicOptionRow[]; expiresAt: number }>();
const dynamicOptionsPromiseCache = new Map<string, Promise<DynamicOptionRow[]>>();
const recordTagsCache = new Map<string, { data: Record<string, any[]>; expiresAt: number }>();
const recordTagsPromiseCache = new Map<string, Promise<Record<string, any[]>>>();

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
  }));

export const clearReferenceDataCache = () => {
  assigneeDirectoryCache.data = null;
  assigneeDirectoryCache.expiresAt = 0;
  assigneeDirectoryCache.promise = null;

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
    const { data } = await supabaseClient
      .from('record_tags')
      .select('record_id, tags(id, title, color)')
      .in('record_id', uniqueRecordIds);

    const normalized: Record<string, any[]> = {};
    (data || []).forEach((item: any) => {
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
    const [{ data: users }, rolesResult] = await Promise.all([
      supabaseClient.from('profiles').select('id, full_name, email, mobile_1, avatar_url, role_id'),
      supabaseClient.from('org_roles').select('id, title').limit(400),
    ]);

    let roles = rolesResult?.data || [];
    if ((!roles || roles.length === 0) && rolesResult?.error) {
      const fallback = await supabaseClient.from('org_roles').select('*').limit(400);
      roles = fallback?.data || [];
    }

    const directory = {
      users: normalizeUsers(users || []),
      roles: normalizeRoles(roles || []),
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

    const normalized = normalizeDynamicOptions(data || []);
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
