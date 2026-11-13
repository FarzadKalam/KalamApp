import type { MenuProps } from 'antd';

// Run after permission/plan filtering. An unavailable group is never created.
export const promoteSidebarGroup = (items: MenuProps['items'], groupKey: string, enabled: boolean): MenuProps['items'] => {
  if (!enabled) return items;
  let promoted: NonNullable<MenuProps['items']>[number] | undefined;
  const remove = (rows: MenuProps['items']): NonNullable<MenuProps['items']> => (rows || []).flatMap(item => {
    if (!item || !('key' in item)) return [item];
    if (String(item.key) === groupKey) { promoted = item; return []; }
    if ('children' in item && Array.isArray(item.children)) {
      const children = remove(item.children);
      return children.length ? [{ ...item, children }] : [];
    }
    return [item];
  });
  const remaining = remove(items);
  if (!promoted) return items;
  const dashboardIndex = remaining.findIndex(item => item && 'key' in item && item.key === '/');
  remaining.splice(dashboardIndex + 1, 0, promoted);
  return remaining;
};
