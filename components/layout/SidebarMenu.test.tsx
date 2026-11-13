import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SidebarMenu, { filterSidebarItems } from './SidebarMenu';

const menuProbe = vi.hoisted(() => ({ props: {} as any }));
afterEach(cleanup);
vi.mock('antd/es/menu', () => ({ default: (props: any) => { menuProbe.props = props; return <>
  <button onClick={() => props.onOpenChange(['sales'])}>باز کردن</button>
  <button onClick={() => props.onClick({ key: '/leads' })}>سرنخ‌ها</button>
  <output>{JSON.stringify(props.openKeys)}</output>
</>; } }));

describe('sidebar render isolation', () => {
  it('uses RTL hover flyouts on desktop and click expansion on touch', () => {
    const items = [{ key: 'sales', label: 'فروش', children: [{ key: '/customers', label: 'مشتریان', disabled: true }] }];
    const { rerender } = render(<SidebarMenu items={items} selectedKey="/customers" ancestorKeys={['sales']} collapsed={false} isMobile={false} desktopFlyout isDarkMode={false} onNavigate={vi.fn()} />);
    expect(menuProbe.props.mode).toBe('vertical');
    expect(menuProbe.props.direction).toBe('rtl');
    expect(menuProbe.props.triggerSubMenuAction).toBe('hover');
    expect(menuProbe.props.openKeys).toEqual([]);
    expect(menuProbe.props.items[0].popupClassName).toContain('workspace-sidebar-submenu');
    expect(menuProbe.props.items[0].children[0].disabled).toBe(true);
    rerender(<SidebarMenu items={items} selectedKey="/customers" ancestorKeys={['sales']} collapsed={false} isMobile desktopFlyout isDarkMode onNavigate={vi.fn()} />);
    expect(menuProbe.props.mode).toBe('inline');
    expect(menuProbe.props.triggerSubMenuAction).toBe('click');
  });
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
