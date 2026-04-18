const normalizeScopeText = (value: unknown) =>
  String(value || '')
    .normalize('NFKC')
    .replace(/\u200c/g, ' ')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[أإآ]/g, 'ا')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

type ChartAccountScopeOptions = {
  rootNames: string[];
  requireLeaf?: boolean;
  requireDetail?: boolean;
};

export const resolveScopedChartOfAccountIds = async (
  supabaseClient: any,
  options: ChartAccountScopeOptions
) => {
  const normalizedRoots = Array.from(
    new Set((options.rootNames || []).map(normalizeScopeText).filter(Boolean))
  );
  if (!normalizedRoots.length) return [] as string[];

  const { data, error } = await supabaseClient
    .from('chart_of_accounts')
    .select('id, name, parent_id, account_level, is_leaf, is_active');
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const childrenByParent = new Map<string | null, any[]>();

  rows.forEach((row: any) => {
    const parentId = row?.parent_id ? String(row.parent_id) : null;
    const list = childrenByParent.get(parentId) || [];
    list.push(row);
    childrenByParent.set(parentId, list);
  });

  const rootIds = rows
    .filter((row: any) => normalizedRoots.includes(normalizeScopeText(row?.name)))
    .map((row: any) => String(row.id || '').trim())
    .filter(Boolean);

  if (!rootIds.length) return [];

  const descendantIds = new Set<string>();
  const stack = [...rootIds];
  while (stack.length > 0) {
    const currentId = String(stack.pop() || '').trim();
    if (!currentId || descendantIds.has(currentId)) continue;
    descendantIds.add(currentId);
    const children = childrenByParent.get(currentId) || [];
    children.forEach((child: any) => {
      const childId = String(child?.id || '').trim();
      if (childId && !descendantIds.has(childId)) stack.push(childId);
    });
  }

  return rows
    .filter((row: any) => {
      const rowId = String(row?.id || '').trim();
      if (!rowId || !descendantIds.has(rowId) || rootIds.includes(rowId)) return false;
      if (options.requireLeaf && row?.is_leaf !== true) return false;
      if (options.requireDetail && String(row?.account_level || '').trim() !== 'detail') return false;
      if (row?.is_active === false) return false;
      return true;
    })
    .map((row: any) => String(row.id));
};
