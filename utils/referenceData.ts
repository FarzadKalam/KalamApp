import { MODULES } from '../moduleRegistry';
import { FieldType } from '../types';
import { fetchSessionBootstrap } from './sessionCache';
import { normalizePublicAssetUrl } from './assetUrl';
import { loadProfilesWithCompat } from './profileDirectory';
import { getMergedTaskTypeOptions } from './taskMeta';
import { doesProcessTemplateSupportModule } from './processTargets';
import { collectAllKnownDynamicCategories } from './moduleListOptions';

type DynamicOptionRow = { label: string; value: string };
type ProcessTemplateOptionRow = {
  id: string;
  name?: string | null;
  module_id?: string | null;
  module_ids?: string[] | null;
  is_active?: boolean | null;
};
export type AssigneeDirectory = {
  users: Array<{
    id: string;
    full_name?: string | null;
    email?: string | null;
    mobile_1?: string | null;
    job_title?: string | null;
    voip_operator_code?: string | null;
    voip_extension?: string | null;
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

const REFERENCE_TTL_MS = 15 * 60_000;

const assigneeDirectoryCache: {
  orgId: string | null;
  data: AssigneeDirectory | null;
  expiresAt: number;
  promise: Promise<AssigneeDirectory> | null;
  supportsRoleTreeSchema: boolean | null;
} = {
  orgId: null,
  data: null,
  expiresAt: 0,
  promise: null,
  supportsRoleTreeSchema: null,
};

const dynamicOptionsCache = new Map<string, { data: DynamicOptionRow[]; expiresAt: number }>();
const dynamicOptionsPromiseCache = new Map<string, Promise<DynamicOptionRow[]>>();
// کلید: orgId (یا '' برای global) — جداسازی کامل per-org
const tagOptionsByOrgCache = new Map<string, { data: DynamicOptionRow[]; expiresAt: number; promise: Promise<DynamicOptionRow[]> | null }>();
const processTemplateRowsByOrgCache = new Map<string, { data: ProcessTemplateOptionRow[]; expiresAt: number; promise: Promise<ProcessTemplateOptionRow[]> | null }>();
const recordTagsCache = new Map<string, { data: Record<string, any[]>; expiresAt: number }>();
const recordTagsPromiseCache = new Map<string, Promise<Record<string, any[]>>>();
const recordTagIdMapCache = new Map<string, { data: Record<string, string[]>; expiresAt: number }>();
const recordTagIdMapPromiseCache = new Map<string, Promise<Record<string, string[]>>>();
const RECORD_TAGS_FETCH_CHUNK_SIZE = 20;

type RecordTagsBatchEntry = {
  cacheKey: string;
  recordIds: string[];
  resolve: (v: Record<string, any[]>) => void;
  reject: (e: unknown) => void;
};
const recordTagsBatchQueues = new Map<string, RecordTagsBatchEntry[]>();
const recordTagsBatchTimers = new Map<string, ReturnType<typeof setTimeout>>();
const RECORD_TAG_ID_MAP_FALLBACK_PAGE_SIZE = 1000;
const formulaOptionsByOrgCache = new Map<string, { data: DynamicOptionRow[]; expiresAt: number; promise: Promise<DynamicOptionRow[]> | null }>();

const normalizeDynamicOptions = (rows: any[]) =>
  (rows || [])
    .filter((item: any) => item?.value !== null && item?.value !== undefined)
    .map((item: any) => ({
      label: String(item?.label ?? item?.value ?? '').trim(),
      value: String(item?.value ?? item?.label ?? '').trim(),
    }))
    .filter((item: DynamicOptionRow) => item.value);

const mergeDynamicOptionRows = (...groups: DynamicOptionRow[][]): DynamicOptionRow[] => {
  const map = new Map<string, DynamicOptionRow>();
  groups.forEach((group) => {
    (group || []).forEach((item) => {
      const value = String(item?.value || '').trim();
      const label = String(item?.label || item?.value || '').trim();
      if (!value) return;
      if (!map.has(value)) {
        map.set(value, { label: label || value, value });
      }
    });
  });
  return Array.from(map.values());
};

const DYNAMIC_OPTION_FALLBACK_PAGE_SIZE = 200;
const DYNAMIC_OPTION_FALLBACK_MAX_PAGES = 5;

const parseDynamicFieldRawValue = (raw: unknown): string[] => {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((item) => String(item ?? '').trim())
      .filter(Boolean);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try {
        return parseDynamicFieldRawValue(JSON.parse(trimmed));
      } catch {
        return [trimmed];
      }
    }
    return [trimmed];
  }
  if (typeof raw === 'object') {
    return [];
  }
  return [String(raw).trim()].filter(Boolean);
};

const buildDynamicOptionsFromModuleFallback = async (
  supabaseClient: any,
  category: string
): Promise<DynamicOptionRow[]> => {
  const normalizedCategory = String(category || '').trim();
  if (!normalizedCategory) return [];

  const candidateFields = Object.values(MODULES)
    .flatMap((moduleDef) =>
      (moduleDef?.fields || [])
        .filter((field) =>
          String(field?.dynamicOptionsCategory || '').trim() === normalizedCategory
          && (
            field.type === FieldType.SELECT
            || field.type === FieldType.MULTI_SELECT
            || field.type === FieldType.STATUS
            || field.type === FieldType.TAGS
          )
        )
        .map((field) => ({
          table: String(moduleDef?.table || moduleDef?.id || '').trim(),
          key: String(field?.key || '').trim(),
        }))
    )
    .filter((item) => item.table && item.key);

  const seenSources = new Set<string>();
  const uniqueCandidates = candidateFields.filter((item) => {
    const sourceKey = `${item.table}::${item.key}`;
    if (seenSources.has(sourceKey)) return false;
    seenSources.add(sourceKey);
    return true;
  });

  if (uniqueCandidates.length === 0) return [];

  const collectedValues = new Set<string>();

  await Promise.allSettled(
    uniqueCandidates.map(async ({ table, key }) => {
      for (let page = 0; page < DYNAMIC_OPTION_FALLBACK_MAX_PAGES; page += 1) {
        const from = page * DYNAMIC_OPTION_FALLBACK_PAGE_SIZE;
        const to = from + DYNAMIC_OPTION_FALLBACK_PAGE_SIZE - 1;
        const { data, error } = await supabaseClient
          .from(table)
          .select(key)
          .range(from, to);
        if (error) break;

        const rows = Array.isArray(data) ? data : [];
        rows.forEach((row: any) => {
          parseDynamicFieldRawValue(row?.[key]).forEach((value) => collectedValues.add(value));
        });

        if (rows.length < DYNAMIC_OPTION_FALLBACK_PAGE_SIZE) break;
      }
    })
  );

  return Array.from(collectedValues)
    .sort((a, b) => a.localeCompare(b, 'fa'))
    .map((value) => ({ label: value, value }));
};

const normalizeUsers = (rows: any[]) =>
  (rows || []).map((user: any) => ({
    ...user,
    id: String(user?.id || ''),
    role_id: user?.role_id ? String(user.role_id) : null,
    avatar_url: normalizePublicAssetUrl(user?.avatar_url) || null,
    full_name: String(user?.full_name || '').trim() || null,
    email: String(user?.email || '').trim() || null,
    mobile_1: String(user?.mobile_1 || user?.mobile || '').trim() || null,
    job_title: String(user?.job_title || '').trim() || null,
    voip_operator_code: String(user?.voip_operator_code || '').trim() || null,
    voip_extension: String(user?.voip_extension || '').trim() || null,
    display_name:
      String(user?.full_name || '').trim() ||
      [user?.first_name, user?.last_name].map((part) => String(part || '').trim()).filter(Boolean).join(' ') ||
      String(user?.name || '').trim() ||
      String(user?.display_name || '').trim() ||
      String(user?.email || '').trim() ||
      String(user?.mobile_1 || '').trim() ||
      String(user?.mobile || '').trim() ||
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
  assigneeDirectoryCache.orgId = null;
  assigneeDirectoryCache.data = null;
  assigneeDirectoryCache.expiresAt = 0;
  assigneeDirectoryCache.promise = null;
  assigneeDirectoryCache.supportsRoleTreeSchema = null;

  dynamicOptionsCache.clear();
  dynamicOptionsPromiseCache.clear();
  tagOptionsByOrgCache.clear();
  processTemplateRowsByOrgCache.clear();
  recordTagsCache.clear();
  recordTagsPromiseCache.clear();
  recordTagIdMapCache.clear();
  recordTagIdMapPromiseCache.clear();
  formulaOptionsByOrgCache.clear();
};

const buildRecordTagsCacheKey = (moduleId: string, recordIds: string[]) =>
  `${String(moduleId || '').trim()}::${recordIds.map((id) => String(id || '').trim()).filter(Boolean).sort().join(',')}`;

const buildRecordTagIdMapCacheKey = (moduleId: string, tagIds?: string[] | null) => {
  const normalizedTagIds = Array.from(new Set((tagIds || []).map((id) => String(id || '').trim()).filter(Boolean))).sort();
  return `${String(moduleId || '').trim()}::${normalizedTagIds.length > 0 ? normalizedTagIds.join(',') : '__all__'}`;
};

const isMissingRecordTagsMapRpcError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return (
    code === '42883'
    || code === 'PGRST202'
    || code === 'PGRST204'
    || message.includes('get_record_tags_map')
    || message.includes('could not find the function')
    || message.includes('does not exist')
  );
};

const isMissingRecordTagIdMapRpcError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return (
    code === '42883'
    || code === 'PGRST202'
    || code === 'PGRST204'
    || message.includes('get_record_tag_id_map')
    || message.includes('could not find the function')
    || message.includes('does not exist')
  );
};

const isRoleTreeColumnMissingError = (error: any) => {
  const text = String(error?.message || error?.details || error || '').toLowerCase();
  return text.includes('parent_id') || text.includes('sort_order');
};

const drainRecordTagsBatch = async (supabaseClient: any, moduleId: string) => {
  const entries = recordTagsBatchQueues.get(moduleId) || [];
  recordTagsBatchQueues.delete(moduleId);
  recordTagsBatchTimers.delete(moduleId);
  if (entries.length === 0) return;

  const allIds = Array.from(new Set(entries.flatMap((e) => e.recordIds)));
  const normalized: Record<string, any[]> = {};

  const applyBatchRows = (rows: any[]) => {
    (rows || []).forEach((item: any) => {
      const recordId = String(item?.record_id || '').trim();
      if (!recordId) return;
      if (!normalized[recordId]) normalized[recordId] = [];
      if (Array.isArray(item?.tags)) {
        normalized[recordId].push(...item.tags.filter(Boolean));
      } else if (item?.tags) {
        normalized[recordId].push(item.tags);
      }
    });
  };

  try {
    const { data, error } = await supabaseClient.rpc('get_record_tags_map', {
      p_module_id: moduleId,
      p_record_ids: allIds,
    });
    if (error) throw error;
    applyBatchRows(Array.isArray(data) ? data : []);
  } catch (error) {
    if (!isMissingRecordTagsMapRpcError(error)) {
      entries.forEach((e) => e.reject(error));
      return;
    }
    for (let i = 0; i < allIds.length; i += RECORD_TAGS_FETCH_CHUNK_SIZE) {
      const chunk = allIds.slice(i, i + RECORD_TAGS_FETCH_CHUNK_SIZE);
      const { data, err } = await supabaseClient
        .from('record_tags')
        .select('record_id, tags(id, title, color)')
        .eq('module_id', moduleId)
        .in('record_id', chunk) as any;
      if (err) { entries.forEach((e) => e.reject(err)); return; }
      if (Array.isArray(data) && data.length > 0) applyBatchRows(data);
    }
  }

  Object.keys(normalized).forEach((recordId) => {
    const uniqueTags = new Map<string, any>();
    normalized[recordId].forEach((tag: any) => {
      const tagId = String(tag?.id || '').trim();
      if (tagId && !uniqueTags.has(tagId)) uniqueTags.set(tagId, tag);
    });
    normalized[recordId] = Array.from(uniqueTags.values());
  });

  const expiresAt = Date.now() + REFERENCE_TTL_MS;
  entries.forEach((entry) => {
    const subset: Record<string, any[]> = {};
    entry.recordIds.forEach((id) => { subset[id] = normalized[id] || []; });
    recordTagsCache.set(entry.cacheKey, { data: subset, expiresAt });
    recordTagsPromiseCache.delete(entry.cacheKey);
    entry.resolve(subset);
  });
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

  if (!options?.force) {
    const batchPromise = new Promise<Record<string, any[]>>((resolve, reject) => {
      const queue = recordTagsBatchQueues.get(moduleId) || [];
      queue.push({ cacheKey, recordIds: uniqueRecordIds, resolve, reject });
      recordTagsBatchQueues.set(moduleId, queue);
      if (!recordTagsBatchTimers.has(moduleId)) {
        recordTagsBatchTimers.set(
          moduleId,
          setTimeout(() => drainRecordTagsBatch(supabaseClient, moduleId), 0)
        );
      }
    });
    recordTagsPromiseCache.set(cacheKey, batchPromise);
    return batchPromise;
  }

  const pending = (async () => {
    const normalized: Record<string, any[]> = {};

    const applyRows = (rows: any[]) => {
      (rows || []).forEach((item: any) => {
        const recordId = String(item?.record_id || '').trim();
        if (!recordId) return;
        if (!normalized[recordId]) {
          normalized[recordId] = [];
        }
        if (Array.isArray(item?.tags)) {
          normalized[recordId].push(...item.tags.filter(Boolean));
          return;
        }
        if (item?.tags) {
          normalized[recordId].push(item.tags);
        }
      });
    };

    try {
      const { data, error } = await supabaseClient.rpc('get_record_tags_map', {
        p_module_id: moduleId,
        p_record_ids: uniqueRecordIds,
      });
      if (error) throw error;
      applyRows(Array.isArray(data) ? data : []);
    } catch (error) {
      if (!isMissingRecordTagsMapRpcError(error)) {
        throw error;
      }

      const rows: any[] = [];
      for (let i = 0; i < uniqueRecordIds.length; i += RECORD_TAGS_FETCH_CHUNK_SIZE) {
        const chunk = uniqueRecordIds.slice(i, i + RECORD_TAGS_FETCH_CHUNK_SIZE);
        const { data, error } = await supabaseClient
          .from('record_tags')
          .select('record_id, tags(id, title, color)')
          .eq('module_id', moduleId)
          .in('record_id', chunk);
        if (error) throw error;
        if (Array.isArray(data) && data.length > 0) {
          rows.push(...data);
        }
      }
      applyRows(rows);
    }

    Object.keys(normalized).forEach((recordId) => {
      const uniqueTags = new Map<string, any>();
      normalized[recordId].forEach((tag: any) => {
        const tagId = String(tag?.id || '').trim();
        if (tagId && !uniqueTags.has(tagId)) {
          uniqueTags.set(tagId, tag);
        }
      });
      normalized[recordId] = Array.from(uniqueTags.values());
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

export const fetchRecordTagIdMap = async (
  supabaseClient: any,
  moduleId: string,
  options?: { tagIds?: string[] | null; force?: boolean }
): Promise<Record<string, string[]>> => {
  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedTagIds = Array.from(new Set((options?.tagIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (!normalizedModuleId) {
    return {};
  }

  const cacheKey = buildRecordTagIdMapCacheKey(normalizedModuleId, normalizedTagIds);
  const now = Date.now();
  const cached = recordTagIdMapCache.get(cacheKey);
  if (!options?.force && cached && cached.expiresAt > now) {
    return cached.data;
  }

  if (!options?.force && recordTagIdMapPromiseCache.has(cacheKey)) {
    return recordTagIdMapPromiseCache.get(cacheKey)!;
  }

  const pending = (async () => {
    const normalized: Record<string, string[]> = {};

    const applyRows = (rows: any[]) => {
      (rows || []).forEach((item: any) => {
        const recordId = String(item?.record_id || '').trim();
        if (!recordId) return;
        const tagIds = Array.isArray(item?.tag_ids)
          ? item.tag_ids.map((tagId: any) => String(tagId || '').trim()).filter(Boolean)
          : [];
        normalized[recordId] = Array.from(new Set(tagIds));
      });
    };

    try {
      const { data, error } = await supabaseClient.rpc('get_record_tag_id_map', {
        p_module_id: normalizedModuleId,
        p_tag_ids: normalizedTagIds.length > 0 ? normalizedTagIds : null,
      });
      if (error) throw error;
      applyRows(Array.isArray(data) ? data : []);
    } catch (error) {
      if (!isMissingRecordTagIdMapRpcError(error)) {
        throw error;
      }

      let page = 0;
      while (true) {
        let query = supabaseClient
          .from('record_tags')
          .select('record_id, tag_id')
          .eq('module_id', normalizedModuleId)
          .range(
            page * RECORD_TAG_ID_MAP_FALLBACK_PAGE_SIZE,
            ((page + 1) * RECORD_TAG_ID_MAP_FALLBACK_PAGE_SIZE) - 1
          );

        if (normalizedTagIds.length > 0) {
          query = query.in('tag_id', normalizedTagIds);
        }

        const { data, error: fallbackError } = await query;
        if (fallbackError) throw fallbackError;

        const rows = Array.isArray(data) ? data : [];
        rows.forEach((item: any) => {
          const recordId = String(item?.record_id || '').trim();
          const tagId = String(item?.tag_id || '').trim();
          if (!recordId || !tagId) return;
          if (!normalized[recordId]) {
            normalized[recordId] = [];
          }
          if (!normalized[recordId].includes(tagId)) {
            normalized[recordId].push(tagId);
          }
        });

        if (rows.length < RECORD_TAG_ID_MAP_FALLBACK_PAGE_SIZE) {
          break;
        }
        page += 1;
      }
    }

    recordTagIdMapCache.set(cacheKey, {
      data: normalized,
      expiresAt: Date.now() + REFERENCE_TTL_MS,
    });
    recordTagIdMapPromiseCache.delete(cacheKey);
    return normalized;
  })().catch((error) => {
    recordTagIdMapPromiseCache.delete(cacheKey);
    throw error;
  });

  recordTagIdMapPromiseCache.set(cacheKey, pending);
  return pending;
};

export const fetchAssigneeDirectory = async (
  supabaseClient: any,
  options?: { force?: boolean }
): Promise<AssigneeDirectory> => {
  const now = Date.now();
  const snapshot = await fetchSessionBootstrap(supabaseClient, options);
  const orgId = String(snapshot.orgId || '').trim();

  if (!orgId) {
    return {
      users: [],
      roles: [],
    };
  }

  if (
    !options?.force
    && assigneeDirectoryCache.orgId === orgId
    && assigneeDirectoryCache.data
    && assigneeDirectoryCache.expiresAt > now
  ) {
    return assigneeDirectoryCache.data;
  }

  if (!options?.force && assigneeDirectoryCache.orgId === orgId && assigneeDirectoryCache.promise) {
    return assigneeDirectoryCache.promise;
  }

  assigneeDirectoryCache.orgId = orgId;
  assigneeDirectoryCache.promise = (async () => {
    const preferTreeSchema = assigneeDirectoryCache.supportsRoleTreeSchema !== false;

    const buildRoleQuery = (mode: 'org' | 'extra', treeSchema: boolean) => {
      if (mode === 'extra') {
        return Promise.resolve({ data: [] as any[], error: null });
      }

      let query = treeSchema
        ? supabaseClient
            .from('org_roles')
            .select('id, org_id, title, parent_id, sort_order, is_system')
            .limit(400)
        : supabaseClient
            .from('org_roles')
            .select('id, org_id, title, is_system')
            .limit(400);

      return query.eq('org_id', orgId);
    };

    const extraRoleIdsQuery = orgId
      ? supabaseClient
          .from('phone_signup_invites')
          .select('role_id')
          .eq('org_id', orgId)
          .not('role_id', 'is', null)
      : Promise.resolve({ data: [] as any[], error: null });

    const [userResult, orgRolesResult, extraRolesResult, extraRoleIdsResult] = await Promise.all([
      loadProfilesWithCompat(supabaseClient, {
        orgId: orgId || null,
        limit: 300,
        cacheKey: orgId ? 'assignee-directory:users:org' : 'assignee-directory:users:global',
      }),
      buildRoleQuery('org', preferTreeSchema),
      orgId ? buildRoleQuery('extra', preferTreeSchema) : Promise.resolve({ data: [] as any[], error: null }),
      extraRoleIdsQuery,
    ]);
    const users = userResult.data || [];

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
        Promise.resolve({ data: [] as any[] }),
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
        supabaseClient.from('org_roles').select('*').eq('org_id', orgId).limit(400),
        Promise.resolve({ data: [] as any[] }),
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
        ? await supabaseClient.from('org_roles').select('id, org_id, title, is_system').eq('org_id', orgId).in('id', assignedRoleIds)
        : await supabaseClient.from('org_roles').select('id, org_id, title, parent_id, sort_order, is_system').eq('org_id', orgId).in('id', assignedRoleIds);
      const missingRoles = assigneeDirectoryCache.supportsRoleTreeSchema === false
        ? (missingRolesResult?.data || []).map((row: any) => ({ ...row, parent_id: null, sort_order: 0 }))
        : (missingRolesResult?.data || []);
      roles = mergeRoleRows(roles || [], missingRoles);
    }

    const directory = {
      users: normalizeUsers(users || []),
      roles: normalizeRoles(dedupeRolesForAssigneeSelection(roles || [])),
    };

    if (assigneeDirectoryCache.orgId === orgId) {
      assigneeDirectoryCache.data = directory;
      assigneeDirectoryCache.expiresAt = Date.now() + REFERENCE_TTL_MS;
      assigneeDirectoryCache.promise = null;
    }
    return directory;
  })().catch((error) => {
    if (assigneeDirectoryCache.orgId === orgId) {
      assigneeDirectoryCache.promise = null;
    }
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

  const session = await fetchSessionBootstrap(supabaseClient);
  const orgId = String(session?.orgId || '').trim();
  const cacheKey = orgId ? `${orgId}:${normalizedCategory}` : normalizedCategory;

  const cached = dynamicOptionsCache.get(cacheKey);
  if (!options?.force && cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  if (!options?.force && dynamicOptionsPromiseCache.has(cacheKey)) {
    return dynamicOptionsPromiseCache.get(cacheKey)!;
  }

  const pending = (async () => {
    let query = supabaseClient
      .from('dynamic_options')
      .select('label, value')
      .eq('category', normalizedCategory)
      .eq('is_active', true);
    if (orgId) {
      query = query.eq('org_id', orgId);
    }
    const { data } = await query;

    const storedOptions = normalizedCategory === 'task_type'
      ? getMergedTaskTypeOptions(data || [])
      : normalizeDynamicOptions(data || []);
    const fallbackOptions = storedOptions.length === 0
      ? await buildDynamicOptionsFromModuleFallback(supabaseClient, normalizedCategory)
      : [];
    const normalized = mergeDynamicOptionRows(storedOptions, fallbackOptions);
    dynamicOptionsCache.set(cacheKey, {
      data: normalized,
      expiresAt: Date.now() + REFERENCE_TTL_MS,
    });
    dynamicOptionsPromiseCache.delete(cacheKey);
    return normalized;
  })().catch((error) => {
    dynamicOptionsPromiseCache.delete(cacheKey);
    throw error;
  });

  dynamicOptionsPromiseCache.set(cacheKey, pending);
  return pending;
};

export const fetchTagOptions = async (
  supabaseClient: any,
  options?: { force?: boolean }
): Promise<DynamicOptionRow[]> => {
  const session = await fetchSessionBootstrap(supabaseClient);
  const orgId = String(session?.orgId || '').trim();
  const orgCacheKey = orgId || '__global__';

  const existing = tagOptionsByOrgCache.get(orgCacheKey);
  if (!options?.force && existing && existing.data && existing.expiresAt > Date.now()) {
    return existing.data;
  }
  if (!options?.force && existing?.promise) {
    return existing.promise;
  }

  const entry: { data: DynamicOptionRow[]; expiresAt: number; promise: Promise<DynamicOptionRow[]> | null } = existing || { data: [], expiresAt: 0, promise: null };
  tagOptionsByOrgCache.set(orgCacheKey, entry);

  entry.promise = (async () => {
    let query = supabaseClient.from('tags').select('id, title').order('title', { ascending: true });
    if (orgId) {
      query = query.eq('org_id', orgId);
    }
    const { data, error } = await query;
    if (error) throw error;

    const normalized = (data || [])
      .map((row: any) => ({
        label: String(row?.title || 'بدون عنوان').trim(),
        value: String(row?.id || '').trim(),
      }))
      .filter((item: DynamicOptionRow) => item.value);

    entry.data = normalized;
    entry.expiresAt = Date.now() + REFERENCE_TTL_MS;
    entry.promise = null;
    return normalized;
  })().catch((error) => {
    entry.promise = null;
    throw error;
  });

  return entry.promise;
};

export const fetchProcessTemplateRows = async (
  supabaseClient: any,
  options?: { force?: boolean }
): Promise<ProcessTemplateOptionRow[]> => {
  const session = await fetchSessionBootstrap(supabaseClient);
  const orgId = String(session?.orgId || '').trim();
  const orgCacheKey = orgId || '__global__';

  const existing = processTemplateRowsByOrgCache.get(orgCacheKey);
  if (!options?.force && existing && existing.data && existing.expiresAt > Date.now()) {
    return existing.data;
  }
  if (!options?.force && existing?.promise) {
    return existing.promise;
  }

  const entry: { data: ProcessTemplateOptionRow[]; expiresAt: number; promise: Promise<ProcessTemplateOptionRow[]> | null } = existing || { data: [], expiresAt: 0, promise: null };
  processTemplateRowsByOrgCache.set(orgCacheKey, entry);

  entry.promise = (async () => {
    let query = supabaseClient
      .from('process_templates')
      .select('id, name, module_id, module_ids, is_active')
      .order('name', { ascending: true });
    if (orgId) {
      query = query.eq('org_id', orgId);
    }
    const { data, error } = await query;
    if (error) throw error;

    const rows = (data || []).map((row: any) => ({
      id: String(row?.id || '').trim(),
      name: row?.name || null,
      module_id: row?.module_id || null,
      module_ids: Array.isArray(row?.module_ids) ? row.module_ids : [],
      is_active: row?.is_active,
    })).filter((row: ProcessTemplateOptionRow) => row.id);

    entry.data = rows;
    entry.expiresAt = Date.now() + REFERENCE_TTL_MS;
    entry.promise = null;
    return rows;
  })().catch((error) => {
    entry.promise = null;
    throw error;
  });

  return entry.promise;
};

export const fetchProcessTemplateOptions = async (
  supabaseClient: any,
  moduleScopeId?: string | null,
  options?: { force?: boolean }
): Promise<DynamicOptionRow[]> => {
  const rows = await fetchProcessTemplateRows(supabaseClient, options);
  return rows
    .filter((row) => row?.is_active !== false && doesProcessTemplateSupportModule(row, moduleScopeId))
    .map((row) => ({
      label: String(row?.name || 'بدون عنوان').trim(),
      value: String(row?.id || '').trim(),
    }))
    .filter((item) => item.value);
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
  const session = await fetchSessionBootstrap(supabaseClient);
  const orgId = String(session?.orgId || '').trim();
  const orgCacheKey = orgId || '__global__';

  const existing = formulaOptionsByOrgCache.get(orgCacheKey);
  if (!options?.force && existing && existing.data && existing.expiresAt > Date.now()) {
    return existing.data;
  }
  if (!options?.force && existing?.promise) {
    return existing.promise;
  }

  const entry: { data: DynamicOptionRow[]; expiresAt: number; promise: Promise<DynamicOptionRow[]> | null } = existing || { data: [], expiresAt: 0, promise: null };
  formulaOptionsByOrgCache.set(orgCacheKey, entry);

  entry.promise = (async () => {
    let query = supabaseClient.from('calculation_formulas').select('id, name');
    if (orgId) {
      query = query.eq('org_id', orgId);
    }
    const { data } = await query;
    const normalized = (data || []).map((item: any) => ({
      label: String(item?.name || item?.id || '').trim(),
      value: String(item?.id || '').trim(),
    })).filter((item: DynamicOptionRow) => item.value);

    entry.data = normalized;
    entry.expiresAt = Date.now() + REFERENCE_TTL_MS;
    entry.promise = null;
    return normalized;
  })().catch((error) => {
    entry.promise = null;
    throw error;
  });

  return entry.promise;
};

export const fetchAllDynamicOptionCategories = async (
  supabaseClient: any,
  categories: string[],
  options?: { force?: boolean }
): Promise<void> => {
  const now = Date.now();
  const missing = categories.filter((cat) => {
    const c = String(cat || '').trim();
    if (!c || c === 'task_type') return false;
    if (options?.force) return true;
    const cached = dynamicOptionsCache.get(c);
    return !cached || cached.expiresAt <= now;
  });
  if (missing.length === 0) return;

  const { data } = await supabaseClient
    .from('dynamic_options')
    .select('label, value, category')
    .in('category', missing)
    .eq('is_active', true);

  const byCategory = new Map<string, any[]>();
  (data || []).forEach((row: any) => {
    const cat = String(row?.category || '').trim();
    if (!cat) return;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(row);
  });

  const expiresAt = Date.now() + REFERENCE_TTL_MS;
  missing.forEach((cat) => {
    const rows = byCategory.get(cat) || [];
    dynamicOptionsCache.set(cat, {
      data: normalizeDynamicOptions(rows),
      expiresAt,
    });
  });
};

export const primeReferenceData = async (
  supabaseClient: any,
  options?: { force?: boolean }
) => {
  await Promise.all([
    fetchAssigneeDirectory(supabaseClient, options),
    fetchFormulaOptions(supabaseClient, options),
    fetchAllDynamicOptionCategories(supabaseClient, collectAllKnownDynamicCategories(), options),
  ]);
};
