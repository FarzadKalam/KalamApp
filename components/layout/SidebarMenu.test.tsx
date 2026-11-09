import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SidebarMenu, { filterSidebarItems } from './SidebarMenu';

vi.mock('antd/es/menu', () => ({ default: (props: any) => <>
  <button onClick={() => props.onOpenChange(['sales'])}>باز کردن</button>
  <button onClick={() => props.onClick({ key: '/leads' })}>سرنخ‌ها</button>
  <output>{JSON.stringify(props.openKeys)}</output>
</> }));

describe('sidebar render isolation', () => {
  it('finds nested Persian module labels with Arabic input and preserves icons', () => {
    const icon = <span>نماد</span>;
    const items = [{ key: 'resources', label: 'منابع', children: [{ key: '/customers', label: 'مشتریان', icon }, { key: '/products', label: 'کالاها' }] }];
    expect(filterSidebarItems(items, 'مشتري')).toEqual([{ ...items[0], children: [items[0].children[0]] }]);
    expect(filterSidebarItems(items, 'ناموجود')).toEqual([]);
  });
  it('opens submenus locally without rendering the surrounding workspace and preserves navigation', () => {
    const pageRender = vi.fn(); const navigate = vi.fn();
    function Workspace() {
      pageRender();
      return <SidebarMenu items={[]} ancestorKeys={[]} selectedKey="/" collapsed={false} isMobile={false} isDarkMode={false} onNavigate={navigate} />;
    }
    render(<Workspace />);
    fireEvent.click(screen.getByText('باز کردن'));
    expect(screen.getByRole('status')).toHaveTextContent('["sales"]');
    expect(pageRender).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText('سرنخ‌ها'));
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/leads');
  });
});
