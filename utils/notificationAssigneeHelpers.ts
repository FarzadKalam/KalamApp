import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { buildRecordTitleSelectColumns, runSelectWithCompatibleColumns } from './selectCompat';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type AssigneeQueryMode = 'primary' | 'typed_legacy_role' | 'id_only' | 'owner_only' | 'none';

// Module-level cache: persists across component mount/unmount cycles.
export const ASSIGNEE_QUERY_MODE_CACHE = new Map<string, AssigneeQueryMode>();

// ---------------------------------------------------------------------------
// Error detection helpers
// ---------------------------------------------------------------------------
export const isMissingColumnError = (error: any, columnName: string): boolean => {
  const code = String(error?.code || '').toUpperCase();
  if (code === 'PGRST200' || code === 'PGRST204' || code === '42703') return true;
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  const col = columnName.toLowerCase();
  return (
    message.includes(`column "${col}"`)
    || message.includes(`${col} does not exist`)
    || message.includes(`could not find the '${col}' column`)
    || message.includes(`could not find the "${col}" column`)
    || (message.includes('schema cache') && message.includes(col))
  );
};

export const isMissingTableLikeError = (error: any): boolean => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return (
    code === '42P01'
    || code === 'PGRST205'
    || message.includes('could not find the table')
    || (message.includes('relation') && message.includes('does not exist'))
  );
};

export const isAssigneeValueTypeError = (error: any): boolean => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return (
    code === '22P02'
    || code === '42883'
    || message.includes('invalid input syntax')
    || message.includes('operator does not exist')
  );
};

// ---------------------------------------------------------------------------
// Schema probing (limit 0 — no data transfer, just validates column names)
// ---------------------------------------------------------------------------
export const probeAssigneeSelect = async (table: string, select: string): Promise<any | null> => {
  const { error } = await supabase.from(table).select(select).limit(0);
  return error || null;
};

export const resolveAssigneeQueryModeForTable = async (table: string): Promise<AssigneeQueryMode> => {
  const normalizedTable = String(table || '').trim();
  if (!normalizedTable) return 'none';

  const cached = ASSIGNEE_QUERY_MODE_CACHE.get(normalizedTable);
  if (cached) return cached;

  const cache = (mode: AssigneeQueryMode) => {
    ASSIGNEE_QUERY_MODE_CACHE.set(normalizedTable, mode);
    return mode;
  };

  const primaryError = await probeAssigneeSelect(normalizedTable, 'id,assignee_id,assignee_type,assignee_role_id');
  if (!primaryError) return cache('primary');
  if (isMissingTableLikeError(primaryError) || isMissingColumnError(primaryError, 'assignee_id')) return cache('none');

  const typedError = await probeAssigneeSelect(normalizedTable, 'id,assignee_id,assignee_type');
  if (!typedError) return cache('typed_legacy_role');
  if (isMissingTableLikeError(typedError) || isMissingColumnError(typedError, 'assignee_id')) return cache('none');

  const idOnlyError = await probeAssigneeSelect(normalizedTable, 'id,assignee_id');
  if (!idOnlyError) return cache('id_only');

  return cache('none');
};

// ---------------------------------------------------------------------------
// fetchAssignedIdsForModule
// Finds all record IDs in a given table that are assigned to userId or roleId.
// Tries multiple schema modes, caching the working mode per table.
// ---------------------------------------------------------------------------
export const fetchAssignedIdsForModule = async (
  table: string,
  userId: string,
  roleId: string | null,
): Promise<any[]> => {
  const mergeUniqueRows = (rows: any[]) => {
    const map = new Map<string, any>();
    (rows || []).forEach((row) => {
      if (!row?.id) return;
      map.set(String(row.id), row);
    });
    return Array.from(map.values());
  };

  const normalizedTable = String(table || '').trim();
  if (!normalizedTable || !userId) return [];

  const queryIds = async (query: any) => {
    const { data, error } = await query.limit(200);
    if (error) return { data: [] as any[], error };
    return { data: data || [], error: null };
  };

  const cacheRuntimeFailure = (error: any) => {
    if (!error) return;
    if (
      isMissingTableLikeError(error)
      || isMissingColumnError(error, 'assignee_id')
      || isAssigneeValueTypeError(error)
    ) {
      ASSIGNEE_QUERY_MODE_CACHE.set(normalizedTable, 'none');
      return;
    }
    if (isMissingColumnError(error, 'assignee_type')) {
      ASSIGNEE_QUERY_MODE_CACHE.set(normalizedTable, 'id_only');
      return;
    }
    if (isMissingColumnError(error, 'assignee_role_id')) {
      ASSIGNEE_QUERY_MODE_CACHE.set(normalizedTable, 'typed_legacy_role');
    }
  };

  const ownerFallbackQuery = async () => {
    const { data, error } = await supabase
      .from(normalizedTable)
      .select('id')
      .limit(200)
      .eq('owner_id', userId);
    if (error) return { data: [] as any[], error };
    return { data: data || [], error: null };
  };

  const queryByMode = async (mode: AssigneeQueryMode) => {
    if (mode === 'none') return { data: [] as any[], error: null };
    if (mode === 'owner_only') return ownerFallbackQuery();

    if (mode === 'id_only') {
      const [userResult, roleResult] = await Promise.all([
        queryIds(supabase.from(normalizedTable).select('id').eq('assignee_id', userId)),
        roleId
          ? queryIds(supabase.from(normalizedTable).select('id').eq('assignee_id', roleId))
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);
      const firstError = userResult.error || roleResult.error;
      if (firstError) return { data: [] as any[], error: firstError };
      return { data: mergeUniqueRows([...(userResult.data || []), ...(roleResult.data || [])]), error: null };
    }

    if (mode === 'typed_legacy_role') {
      const [userResult, roleResult] = await Promise.all([
        queryIds(supabase.from(normalizedTable).select('id').eq('assignee_type', 'user').eq('assignee_id', userId)),
        roleId
          ? queryIds(supabase.from(normalizedTable).select('id').eq('assignee_type', 'role').eq('assignee_id', roleId))
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);
      const firstError = userResult.error || roleResult.error;
      if (firstError) return { data: [] as any[], error: firstError };
      return { data: mergeUniqueRows([...(userResult.data || []), ...(roleResult.data || [])]), error: null };
    }

    // 'primary' mode: modern schema with assignee_type + assignee_role_id
    const [userResult, roleTypedResult] = await Promise.all([
      queryIds(supabase.from(normalizedTable).select('id').eq('assignee_type', 'user').eq('assignee_id', userId)),
      roleId
        ? queryIds(
            supabase.from(normalizedTable).select('id').eq('assignee_type', 'role').eq('assignee_role_id', roleId)
          )
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);
    if (userResult.error) return { data: [] as any[], error: userResult.error };
    if (roleTypedResult.error) return { data: [] as any[], error: roleTypedResult.error };
    return {
      data: mergeUniqueRows([...(userResult.data || []), ...(roleTypedResult.data || [])]),
      error: null,
    };
  };

  const mode = await resolveAssigneeQueryModeForTable(normalizedTable);
  if (mode === 'none' && normalizedTable === 'projects') {
    const ownerFallback = await ownerFallbackQuery();
    if (!ownerFallback.error) {
      ASSIGNEE_QUERY_MODE_CACHE.set(normalizedTable, 'owner_only');
      return ownerFallback.data || [];
    }
    if (isMissingColumnError(ownerFallback.error, 'owner_id')) {
      ASSIGNEE_QUERY_MODE_CACHE.set(normalizedTable, 'none');
    }
  }

  let result = await queryByMode(mode);
  if (!result.error) return result.data || [];

  cacheRuntimeFailure(result.error);
  const nextMode = ASSIGNEE_QUERY_MODE_CACHE.get(normalizedTable);
  if (nextMode && nextMode !== mode && nextMode !== 'none') {
    result = await queryByMode(nextMode);
    if (!result.error) return result.data || [];
    cacheRuntimeFailure(result.error);
  }

  return [];
};

// ---------------------------------------------------------------------------
// Row fetching helpers for responsibilities
// ---------------------------------------------------------------------------
const buildResponsibilitySelectColumns = (moduleId?: string | null): string[] => {
  const normalizedModuleId = String(moduleId || '').trim();
  const moduleConfig = (MODULES as any)[normalizedModuleId];
  const moduleFieldKeys = new Set(
    (moduleConfig?.fields || [])
      .map((field: any) => String(field?.key || '').trim())
      .filter(Boolean),
  );

  const moduleAwareColumns = [
    ...buildRecordTitleSelectColumns(normalizedModuleId),
    ...(moduleFieldKeys.has('image_url') ? ['image_url'] : []),
    ...(moduleFieldKeys.has('avatar_url') ? ['avatar_url'] : []),
    ...(moduleFieldKeys.has('logo_url') ? ['logo_url'] : []),
    ...(moduleFieldKeys.has('tags') ? ['tags'] : []),
    ...(moduleFieldKeys.has('status') ? ['status'] : []),
    ...(moduleFieldKeys.has('category') ? ['category'] : []),
    ...(moduleFieldKeys.has('assignee_id') ? ['assignee_id'] : []),
    ...(moduleFieldKeys.has('assignee_type') ? ['assignee_type'] : []),
    ...(moduleFieldKeys.has('assignee_role_id') ? ['assignee_role_id'] : []),
    ...(moduleFieldKeys.has('created_by') ? ['created_by'] : []),
    ...(moduleFieldKeys.has('created_by_id') ? ['created_by_id'] : []),
  ];

  return Array.from(new Set(['id', 'created_at', 'updated_at', ...moduleAwareColumns]));
};

export const safeFetchResponsibilityRows = async (
  table: string,
  moduleId: string,
  ids: string[],
): Promise<any[]> => {
  const normalizedTable = String(table || '').trim();
  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedIds = Array.from(
    new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean)),
  );
  if (!normalizedTable || normalizedIds.length === 0) return [];

  const rows: any[] = [];
  const chunkSize = normalizedTable === 'customers' || normalizedTable === 'suppliers' ? 40 : 80;
  const selectColumns = buildResponsibilitySelectColumns(normalizedModuleId);

  for (let index = 0; index < normalizedIds.length; index += chunkSize) {
    const chunk = normalizedIds.slice(index, index + chunkSize);
    const result = await runSelectWithCompatibleColumns<any[]>({
      cacheKey: `responsibility:${normalizedModuleId || normalizedTable}:${normalizedTable}`,
      columns: selectColumns,
      execute: (selectExpr) =>
        supabase.from(normalizedTable).select(selectExpr).in('id', chunk),
    });
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
  }

  return rows;
};
