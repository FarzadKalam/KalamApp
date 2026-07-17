import { fetchSessionBootstrap } from './sessionCache';
import { fetchAssigneeDirectory } from './referenceData';
import { normalizePublicAssetUrl } from './assetUrl';
import { normalizeRoleIconKey, type RoleIconKey } from './roleIconCatalog';

export type IdentityKind = 'user' | 'role' | 'chat_group';
export type IdentityToken = `${IdentityKind}:${string}`;

export type IdentityOption = {
  kind: IdentityKind;
  id: string;
  token: IdentityToken;
  label: string;
  subtitle?: string | null;
  avatarUrl?: string | null;
  iconKey?: RoleIconKey | null;
  roleId?: string | null;
  hierarchyRank?: number;
  active: boolean;
  disabled?: boolean;
  totalCount?: number;
  searchText?: string;
};

export type IdentitySearchResult = {
  items: IdentityOption[];
  totalByKind: Partial<Record<IdentityKind, number>>;
  fromFallback: boolean;
};

const IDENTITY_KINDS: IdentityKind[] = ['user', 'role', 'chat_group'];
const IDENTITY_TOKEN_PATTERN = /^(user|role|chat_group)[:_](.+)$/i;
const IDENTITY_CACHE_TTL_MS = 2 * 60_000;
const identityCache = new Map<string, { expiresAt: number; value?: IdentitySearchResult; promise?: Promise<IdentitySearchResult> }>();
const identityRealtimeByOrg = new Map<string, { client: any; channel: any }>();

const normalizeText = (value: unknown) => String(value || '').trim();

export const isIdentityKind = (value: unknown): value is IdentityKind =>
  IDENTITY_KINDS.includes(normalizeText(value).toLowerCase() as IdentityKind);

export const buildIdentityToken = (kind: IdentityKind, id: unknown): IdentityToken | null => {
  const normalizedId = normalizeText(id);
  return normalizedId ? `${kind}:${normalizedId}` : null;
};

export const parseIdentityToken = (
  value: unknown,
  fallbackKind?: IdentityKind | null,
): { kind: IdentityKind | null; id: string | null; token: IdentityToken | null } => {
  const raw = normalizeText(value);
  if (!raw) return { kind: null, id: null, token: null };
  const match = raw.match(IDENTITY_TOKEN_PATTERN);
  if (match) {
    const kind = normalizeText(match[1]).toLowerCase() as IdentityKind;
    const nested = normalizeText(match[2]);
    if (!nested) return { kind: null, id: null, token: null };
    const nestedMatch = nested.match(IDENTITY_TOKEN_PATTERN);
    if (nestedMatch) return parseIdentityToken(nested, kind);
    return { kind, id: nested, token: `${kind}:${nested}` };
  }
  if (!fallbackKind) return { kind: null, id: raw, token: null };
  return { kind: fallbackKind, id: raw, token: `${fallbackKind}:${raw}` };
};

export const normalizeIdentityToken = (value: unknown, fallbackKind?: IdentityKind | null) =>
  parseIdentityToken(value, fallbackKind).token;

export const normalizeIdentityTokens = (values: unknown, fallbackKind?: IdentityKind | null): IdentityToken[] => {
  const source = Array.isArray(values) ? values : values === null || values === undefined || values === '' ? [] : [values];
  return Array.from(new Set(source.map((item) => normalizeIdentityToken(item, fallbackKind)).filter(Boolean))) as IdentityToken[];
};

const getKindFallbackLabel = (kind: IdentityKind) => {
  if (kind === 'role') return 'نقش خارج از دسترس';
  if (kind === 'chat_group') return 'گروه داخلی خارج از دسترس';
  return 'کاربر خارج از دسترس';
};

export const buildUnavailableIdentityOption = (token: IdentityToken): IdentityOption => {
  const parsed = parseIdentityToken(token);
  const kind = parsed.kind || 'user';
  return {
    kind,
    id: parsed.id || '',
    token,
    label: getKindFallbackLabel(kind),
    subtitle: 'این مورد دیگر قابل انتخاب نیست',
    iconKey: kind === 'role' ? 'team' : null,
    active: false,
    disabled: true,
    searchText: getKindFallbackLabel(kind),
  };
};

const mapRpcRow = (row: any): IdentityOption | null => {
  const kind = normalizeText(row?.kind).toLowerCase() as IdentityKind;
  const id = normalizeText(row?.id);
  if (!isIdentityKind(kind) || !id) return null;
  const token = buildIdentityToken(kind, id);
  if (!token) return null;
  const label = normalizeText(row?.label) || getKindFallbackLabel(kind);
  return {
    kind,
    id,
    token,
    label,
    subtitle: normalizeText(row?.subtitle) || null,
    avatarUrl: normalizePublicAssetUrl(row?.avatar_url) || null,
    iconKey: kind === 'role' ? normalizeRoleIconKey(row?.icon_key) : null,
    roleId: normalizeText(row?.role_id) || null,
    hierarchyRank: Number.isFinite(Number(row?.hierarchy_rank)) ? Number(row.hierarchy_rank) : undefined,
    active: row?.is_active !== false,
    disabled: row?.is_active === false,
    totalCount: Number.isFinite(Number(row?.total_count)) ? Number(row.total_count) : undefined,
    searchText: normalizeText(row?.search_text) || `${label} ${normalizeText(row?.subtitle)}`.trim(),
  };
};

const isMissingIdentityRpc = (error: any) => {
  const code = normalizeText(error?.code).toUpperCase();
  const text = normalizeText(error?.message || error?.details || error).toLowerCase();
  return code === 'PGRST202' || code === '42883' || text.includes('search_org_identity_options');
};

const buildRoleRankMap = (roles: any[]) => {
  const byId = new Map<string, any>();
  const children = new Map<string, any[]>();
  (roles || []).forEach((role) => {
    const id = normalizeText(role?.id);
    if (id) byId.set(id, role);
  });
  (roles || []).forEach((role) => {
    const id = normalizeText(role?.id);
    if (!id) return;
    const rawParent = normalizeText(role?.parent_id);
    const parent = rawParent && byId.has(rawParent) ? rawParent : '';
    const list = children.get(parent) || [];
    list.push(role);
    children.set(parent, list);
  });
  const sortSiblings = (items: any[]) => items.sort((a, b) =>
    Number(a?.sort_order || 0) - Number(b?.sort_order || 0)
    || normalizeText(a?.title).localeCompare(normalizeText(b?.title), 'fa')
    || normalizeText(a?.id).localeCompare(normalizeText(b?.id))
  );
  children.forEach(sortSiblings);
  const rank = new Map<string, number>();
  let cursor = 0;
  const visit = (role: any, path: Set<string>) => {
    const id = normalizeText(role?.id);
    if (!id || path.has(id) || rank.has(id)) return;
    rank.set(id, cursor++);
    const nextPath = new Set(path).add(id);
    (children.get(id) || []).forEach((child) => visit(child, nextPath));
  };
  (children.get('') || []).forEach((role) => visit(role, new Set()));
  (roles || []).forEach((role) => visit(role, new Set()));
  return rank;
};

export const sortIdentityOptions = (items: IdentityOption[]): IdentityOption[] => {
  const kindRank: Record<IdentityKind, number> = { user: 0, role: 1, chat_group: 2 };
  return [...items].sort((a, b) =>
    kindRank[a.kind] - kindRank[b.kind]
    || Number(a.hierarchyRank ?? Number.MAX_SAFE_INTEGER) - Number(b.hierarchyRank ?? Number.MAX_SAFE_INTEGER)
    || a.label.localeCompare(b.label, 'fa')
    || a.id.localeCompare(b.id)
  );
};

const fallbackIdentitySearch = async (
  supabaseClient: any,
  scopes: IdentityKind[],
  query: string,
  limitPerScope: number,
  offset: number,
  exactTokens: IdentityToken[],
): Promise<IdentitySearchResult> => {
  const directory = await fetchAssigneeDirectory(supabaseClient);
  const roleRanks = buildRoleRankMap(directory.roles || []);
  const roleTitleById = new Map((directory.roles || []).map((role: any) => [normalizeText(role?.id), normalizeText(role?.title)]));
  let users = directory.users || [];
  let roles = directory.roles || [];
  let groups: any[] = [];
  if (scopes.includes('chat_group')) {
    const session = await fetchSessionBootstrap(supabaseClient);
    const orgId = normalizeText(session?.orgId);
    if (orgId) {
      const { data } = await supabaseClient
        .from('chat_groups')
        .select('id, name')
        .eq('org_id', orgId)
        .order('name', { ascending: true })
        .limit(Math.max(200, limitPerScope + offset));
      groups = data || [];
    }
  }

  if (exactTokens.length > 0) {
    const exactUsers = exactTokens.filter((token) => token.startsWith('user:')).map((token) => parseIdentityToken(token).id).filter(Boolean) as string[];
    const missingUserIds = exactUsers.filter((id) => !users.some((user: any) => normalizeText(user?.id) === id));
    if (missingUserIds.length > 0) {
      const session = await fetchSessionBootstrap(supabaseClient);
      const orgId = normalizeText(session?.orgId);
      if (orgId) {
        const { data } = await supabaseClient
          .from('profiles')
          .select('id, full_name, email, mobile_1, avatar_url, role_id, job_title, is_active')
          .eq('org_id', orgId)
          .in('id', missingUserIds);
        users = [...users, ...(data || [])];
      }
    }
  }

  const allItems: IdentityOption[] = [
    ...(scopes.includes('user') ? users.map((user: any) => ({
      kind: 'user' as const,
      id: normalizeText(user?.id),
      token: `user:${normalizeText(user?.id)}` as IdentityToken,
      label: normalizeText(user?.display_name || user?.full_name || user?.email || user?.mobile_1) || 'کاربر بدون نام',
      subtitle: normalizeText(user?.job_title || roleTitleById.get(normalizeText(user?.role_id))) || null,
      avatarUrl: normalizePublicAssetUrl(user?.avatar_url) || null,
      roleId: normalizeText(user?.role_id) || null,
      hierarchyRank: roleRanks.get(normalizeText(user?.role_id)) ?? Number.MAX_SAFE_INTEGER,
      active: user?.is_active !== false,
      disabled: user?.is_active === false,
    })) : []),
    ...(scopes.includes('role') ? roles.map((role: any) => ({
      kind: 'role' as const,
      id: normalizeText(role?.id),
      token: `role:${normalizeText(role?.id)}` as IdentityToken,
      label: normalizeText(role?.title) || 'نقش بدون عنوان',
      subtitle: 'جایگاه سازمانی',
      iconKey: normalizeRoleIconKey(role?.icon_key),
      hierarchyRank: roleRanks.get(normalizeText(role?.id)) ?? Number.MAX_SAFE_INTEGER,
      active: true,
    })) : []),
    ...(scopes.includes('chat_group') ? groups.map((group: any) => ({
      kind: 'chat_group' as const,
      id: normalizeText(group?.id),
      token: `chat_group:${normalizeText(group?.id)}` as IdentityToken,
      label: normalizeText(group?.name) || 'گروه داخلی',
      subtitle: 'گروه داخلی',
      active: true,
    })) : []),
  ].filter((item) => item.id);

  const tokenSet = new Set(exactTokens);
  const normalizedQuery = query.toLocaleLowerCase('fa');
  const filtered = sortIdentityOptions(allItems).filter((item) =>
    exactTokens.length > 0
      ? tokenSet.has(item.token)
      : (!normalizedQuery || `${item.label} ${item.subtitle || ''}`.toLocaleLowerCase('fa').includes(normalizedQuery))
  );
  const totalByKind: Partial<Record<IdentityKind, number>> = {};
  filtered.forEach((item) => { totalByKind[item.kind] = (totalByKind[item.kind] || 0) + 1; });
  const paged = exactTokens.length > 0
    ? filtered
    : filtered.filter((item) => {
      const sameKindIndex = filtered.filter((candidate) => candidate.kind === item.kind).indexOf(item);
      return sameKindIndex >= offset && sameKindIndex < offset + limitPerScope;
    });
  return { items: paged, totalByKind, fromFallback: true };
};

export const clearIdentityDirectoryCache = (orgId?: string | null) => {
  const normalizedOrgId = normalizeText(orgId);
  if (!normalizedOrgId) {
    identityCache.clear();
    return;
  }
  Array.from(identityCache.keys()).forEach((key) => {
    if (key.startsWith(`${normalizedOrgId}:`)) identityCache.delete(key);
  });
};

const ensureIdentityDirectoryRealtime = (supabaseClient: any, orgId: string) => {
  if (!orgId || identityRealtimeByOrg.has(orgId) || typeof supabaseClient?.channel !== 'function') return;
  Array.from(identityRealtimeByOrg.entries()).forEach(([staleOrgId, entry]) => {
    if (staleOrgId === orgId) return;
    identityRealtimeByOrg.delete(staleOrgId);
    void entry.client?.removeChannel?.(entry.channel);
  });
  const invalidate = () => clearIdentityDirectoryCache(orgId);
  const channel = supabaseClient
    .channel(`identity-directory-${orgId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `org_id=eq.${orgId}` }, invalidate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'org_roles', filter: `org_id=eq.${orgId}` }, invalidate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_groups', filter: `org_id=eq.${orgId}` }, invalidate)
    .subscribe();
  identityRealtimeByOrg.set(orgId, { client: supabaseClient, channel });
};

export const disposeIdentityDirectoryRealtime = async (orgId?: string | null) => {
  const targets = normalizeText(orgId)
    ? [[normalizeText(orgId), identityRealtimeByOrg.get(normalizeText(orgId))] as const]
    : Array.from(identityRealtimeByOrg.entries());
  await Promise.all(targets.map(async ([targetOrgId, entry]) => {
    if (!entry) return;
    identityRealtimeByOrg.delete(targetOrgId);
    await entry.client?.removeChannel?.(entry.channel);
  }));
};

export const searchIdentityOptions = async (
  supabaseClient: any,
  options?: {
    scopes?: IdentityKind[];
    query?: string;
    limitPerScope?: number;
    offset?: number;
    exactTokens?: unknown[];
    force?: boolean;
  },
): Promise<IdentitySearchResult> => {
  const session = await fetchSessionBootstrap(supabaseClient);
  const orgId = normalizeText(session?.orgId);
  if (!orgId) return { items: [], totalByKind: {}, fromFallback: false };
  ensureIdentityDirectoryRealtime(supabaseClient, orgId);
  const scopes = Array.from(new Set((options?.scopes || ['user', 'role']).filter(isIdentityKind))).sort() as IdentityKind[];
  const query = normalizeText(options?.query);
  const limitPerScope = Math.min(100, Math.max(1, Number(options?.limitPerScope || 50)));
  const offset = Math.max(0, Number(options?.offset || 0));
  const exactTokens = normalizeIdentityTokens(options?.exactTokens || []).filter((token) => scopes.includes(parseIdentityToken(token).kind as IdentityKind));
  const cacheKey = `${orgId}:${scopes.join(',')}:${query.toLocaleLowerCase('fa')}:${limitPerScope}:${offset}:${exactTokens.sort().join(',')}`;
  const cached = identityCache.get(cacheKey);
  if (!options?.force && cached?.value && cached.expiresAt > Date.now()) return cached.value;
  if (!options?.force && cached?.promise) return cached.promise;

  const pending = (async () => {
    const { data, error } = await supabaseClient.rpc('search_org_identity_options', {
      p_query: query || null,
      p_scopes: scopes,
      p_limit_per_scope: limitPerScope,
      p_offset: offset,
      p_exact_tokens: exactTokens.length > 0 ? exactTokens : null,
    });
    if (error) {
      if (!isMissingIdentityRpc(error)) throw error;
      return fallbackIdentitySearch(supabaseClient, scopes, query, limitPerScope, offset, exactTokens);
    }
    const items = sortIdentityOptions((data || []).map(mapRpcRow).filter(Boolean) as IdentityOption[]);
    const totalByKind: Partial<Record<IdentityKind, number>> = {};
    items.forEach((item) => {
      totalByKind[item.kind] = Math.max(totalByKind[item.kind] || 0, item.totalCount || 0);
    });
    return { items, totalByKind, fromFallback: false };
  })();

  identityCache.set(cacheKey, { expiresAt: Date.now() + IDENTITY_CACHE_TTL_MS, promise: pending });
  try {
    const value = await pending;
    identityCache.set(cacheKey, { expiresAt: Date.now() + IDENTITY_CACHE_TTL_MS, value });
    return value;
  } catch (error) {
    identityCache.delete(cacheKey);
    throw error;
  }
};
