import React, { memo, useEffect, useMemo, useState } from 'react';
import Menu from 'antd/es/menu';
import { Empty, Input, type MenuProps } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { normalizePersianSearchText } from '../../utils/persianSearchText';

interface SidebarMenuProps {
  items: MenuProps['items'];
  selectedKey: string;
  ancestorKeys: string[];
  collapsed: boolean;
  isMobile: boolean;
  isDarkMode: boolean;
  onNavigate: (href: string) => void;
  searchEnabled?: boolean;
}

export const sidebarLabelText = (label: React.ReactNode): string => {
  if (typeof label === 'string' || typeof label === 'number') return String(label);
  if (React.isValidElement<{ children?: React.ReactNode }>(label)) return sidebarLabelText(label.props.children);
  if (Array.isArray(label)) return label.map(sidebarLabelText).join(' ');
  return '';
};
export const filterSidebarItems = (items: MenuProps['items'], query: string, parentMatches = false): MenuProps['items'] => {
  const words = normalizePersianSearchText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return (items || []).flatMap(item => {
    if (!item || !('key' in item)) return [];
    const matches = parentMatches || words.every(word => normalizePersianSearchText('label' in item ? sidebarLabelText(item.label) : '').includes(word));
    if ('children' in item && Array.isArray(item.children)) {
      const children = filterSidebarItems(item.children, query, matches);
      return children?.length ? [{ ...item, children }] : [];
    }
    return matches ? [item] : [];
  });
};
const groupKeys = (items: MenuProps['items']): string[] => (items || []).flatMap(item => item && 'children' in item && Array.isArray(item.children) ? [String(item.key), ...groupKeys(item.children)] : []);

// Expanding a submenu must not rerender the page, drawers and workspace header.
const SidebarMenu = memo(function SidebarMenu({ items, selectedKey, ancestorKeys, collapsed, isMobile, isDarkMode, onNavigate, searchEnabled = true }: SidebarMenuProps) {
  const [openKeys, setOpenKeys] = useState(ancestorKeys);
  const [search, setSearch] = useState('');
  const filteredItems = useMemo(() => filterSidebarItems(items, search), [items, search]);
  const searchOpenKeys = useMemo(() => groupKeys(filteredItems), [filteredItems]);
  useEffect(() => { setOpenKeys(ancestorKeys); }, [ancestorKeys]);
  const selectedKeys = useMemo(() => [selectedKey], [selectedKey]);
  return (
    <>
    {searchEnabled && (!collapsed || isMobile) && <div className="sidebar-module-search"><Input allowClear prefix={<SearchOutlined />} aria-label="جستجوی ماژول" placeholder="جستجوی ماژول…" value={search} onChange={event => setSearch(event.target.value)} /></div>}
    {search && !filteredItems?.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="ماژولی با این عبارت پیدا نشد." /> : <Menu
      theme={isDarkMode ? 'dark' : 'light'}
      mode="inline"
      direction="rtl"
      inlineCollapsed={!isMobile && collapsed}
      selectedKeys={selectedKeys}
      openKeys={collapsed && !isMobile ? undefined : search ? searchOpenKeys : openKeys}
      onOpenChange={setOpenKeys}
      triggerSubMenuAction="click"
      // Avoid measuring/animating submenu heights over a busy workspace.
      motion={{ motionAppear: false, motionEnter: false, motionLeave: false }}
      items={filteredItems}
      onClick={({ key }) => { if (key.startsWith('/')) onNavigate(key); }}
      className="mt-4 border-none bg-transparent font-medium"
    />}
    </>
  );
});

export default SidebarMenu;
