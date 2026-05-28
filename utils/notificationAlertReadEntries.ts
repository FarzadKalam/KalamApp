import type { SupabaseClient } from '@supabase/supabase-js';

export type AlertNotificationReadEntry = {
  section: 'tasks' | 'responsibilities';
  sourceType: string;
  sourceId: string;
};

export const getResponsibilityNotificationSourceType = (
  item: any,
  modules: Record<string, any>,
) => String(
  item?.__notification_inbox_item?.source_type
  || modules[String(item?.module_id || '')]?.table
  || item?.module_id
  || 'responsibility',
).trim();

export const mergeRowsByIdCreatedAsc = <T extends Record<string, any>>(
  currentRows: T[],
  incomingRows: T[],
) => {
  if (!Array.isArray(incomingRows) || incomingRows.length === 0) return currentRows;
  const seen = new Set(currentRows.map((row) => String(row?.id || '').trim()).filter(Boolean));
  const merged = [...currentRows];
  incomingRows.forEach((row) => {
    const rowId = String(row?.id || '').trim();
    if (!rowId || seen.has(rowId)) return;
    seen.add(rowId);
    merged.push(row);
  });
  return merged.sort((left, right) => (
    new Date(left?.created_at || 0).getTime() - new Date(right?.created_at || 0).getTime()
  ));
};

export const fetchAssignedTaskReadEntries = async (
  supabase: SupabaseClient<any, 'public', any>,
  profile: { id?: string | null; role_id?: string | null },
) => {
  if (!profile.id) return [] as AlertNotificationReadEntry[];
  const userId = String(profile.id || '').trim();
  const roleId = String(profile.role_id || '').trim();
  const pageSize = 1000;

  const runPaged = async (buildQuery: () => any) => {
    const rows: any[] = [];
    for (let offset = 0; offset < 5000; offset += pageSize) {
      const { data, error } = await buildQuery().range(offset, offset + pageSize - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return rows;
  };

  const baseQuery = () => supabase
    .from('tasks')
    .select('id')
    .or('status.is.null,status.neq.canceled')
    .order('created_at', { ascending: false });

  const queries: Array<() => any> = [
    () => baseQuery().eq('assignee_type', 'user').eq('assignee_id', userId),
    () => baseQuery().is('assignee_type', null).eq('assignee_id', userId),
  ];
  if (roleId) {
    queries.push(
      () => baseQuery().eq('assignee_type', 'role').eq('assignee_role_id', roleId),
      () => baseQuery().eq('assignee_type', 'role').eq('assignee_id', roleId),
      () => baseQuery().is('assignee_type', null).eq('assignee_id', roleId),
    );
  }

  const results = await Promise.all(queries.map((query) => runPaged(query)));
  const ids = Array.from(new Set(
    results.flat().map((row: any) => String(row?.id || '').trim()).filter(Boolean),
  ));
  return ids.map((sourceId) => ({ section: 'tasks' as const, sourceType: 'task', sourceId }));
};

export const fetchResponsibilityReadEntries = async (
  supabase: SupabaseClient<any, 'public', any>,
) => {
  const { data, error } = await supabase
    .from('notification_inbox_items')
    .select('source_type,source_id,record_id')
    .eq('section', 'responsibilities')
    .order('last_event_at', { ascending: false })
    .limit(1000);
  if (error) throw error;

  return (data || [])
    .map((item: any) => {
      const sourceType = String(item?.source_type || '').trim();
      const sourceId = String(item?.source_id || item?.record_id || '').trim();
      if (!sourceType || !sourceId) return null;
      return { section: 'responsibilities' as const, sourceType, sourceId };
    })
    .filter(Boolean) as AlertNotificationReadEntry[];
};
