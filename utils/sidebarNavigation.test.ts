import { describe, expect, it } from 'vitest';
import { promoteSidebarGroup } from './sidebarNavigation';

describe('plan-filtered sidebar promotion', () => {
  const billboard = { key: 'billboards', children: [{ key: '/billboards', label: 'تابلوها' }] };
  const items = [{ key: '/' }, { key: 'resources', children: [{ key: '/products' }, billboard] }];
  it('promotes only an existing entitled group after the dashboard', () => {
    const result = promoteSidebarGroup(items, 'billboards', true);
    expect(result?.map(item => item?.key)).toEqual(['/', 'billboards', 'resources']);
    expect(result?.[1]).toBe(billboard);
    expect(items[1].children).toHaveLength(2);
  });
  it('does not add access or a group absent after permission filtering', () => {
    expect(promoteSidebarGroup(items, 'billboards', false)).toBe(items);
    const filtered = [{ key: '/' }];
    expect(promoteSidebarGroup(filtered, 'billboards', true)).toBe(filtered);
  });
});
