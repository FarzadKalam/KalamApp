export type RoleNode = {
  id: string;
  title: string;
  sort_order: number;
  parent_id: string | null;
  is_system?: boolean;
  icon_key?: string | null;
  children: RoleNode[];
};

export function buildTree(flatRoles: any[]): RoleNode[] {
  const roleMap = new Map<string, any>();
  const childrenMap = new Map<string | null, any[]>();

  for (const role of flatRoles) {
    const id = String(role?.id || '').trim();
    if (id) roleMap.set(id, role);
  }

  for (const role of flatRoles) {
    const parentId =
      role?.parent_id && roleMap.has(String(role.parent_id))
        ? String(role.parent_id)
        : null;
    const siblings = childrenMap.get(parentId) || [];
    siblings.push(role);
    childrenMap.set(parentId, siblings);
  }

  for (const items of childrenMap.values()) {
    items.sort(
      (a, b) =>
        Number(a?.sort_order || 0) - Number(b?.sort_order || 0) ||
        new Date(String(a?.created_at || 0)).getTime() -
          new Date(String(b?.created_at || 0)).getTime()
    );
  }

  const buildNode = (role: any): RoleNode => ({
    id: String(role.id),
    title: String(role.title || role.name || '').trim() || 'بدون عنوان',
    sort_order: Number(role.sort_order || 0),
    parent_id: role.parent_id ? String(role.parent_id) : null,
    is_system: Boolean(role.is_system),
    icon_key: role?.icon_key ? String(role.icon_key) : null,
    children: (childrenMap.get(String(role.id)) || []).map(buildNode),
  });

  return (childrenMap.get(null) || []).map(buildNode);
}

export function wouldCreateCycle(
  draggedId: string,
  newParentId: string | null,
  flatRoles: any[]
): boolean {
  if (!newParentId) return false;
  const roleMap = new Map<string, any>();
  for (const r of flatRoles) {
    if (r?.id) roleMap.set(String(r.id), r);
  }
  let current: string | null = newParentId;
  while (current !== null) {
    if (current === draggedId) return true;
    const parent = roleMap.get(current);
    current = parent?.parent_id ? String(parent.parent_id) : null;
  }
  return false;
}
