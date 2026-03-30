type DynamicOptionRow = { label: string; value: string };
type AssigneeDirectory = {
  users: Array<{ id: string; full_name?: string | null; email?: string | null; mobile_1?: string | null; avatar_url?: string | null; display_name: string }>;
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

  formulaOptionsCache.data = null;
  formulaOptionsCache.expiresAt = 0;
  formulaOptionsCache.promise = null;
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
      supabaseClient.from('profiles').select('id, full_name, email, mobile_1, avatar_url'),
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
