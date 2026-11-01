import React, { memo, useEffect, useMemo, useState } from 'react';
import Menu from 'antd/es/menu';
import type { MenuProps } from 'antd';

interface SidebarMenuProps {
  items: MenuProps['items'];
  selectedKey: string;
  ancestorKeys: string[];
  collapsed: boolean;
  isMobile: boolean;
  isDarkMode: boolean;
  onNavigate: (href: string) => void;
}

// Expanding a submenu must not rerender the page, drawers and workspace header.
const SidebarMenu = memo(function SidebarMenu({ items, selectedKey, ancestorKeys, collapsed, isMobile, isDarkMode, onNavigate }: SidebarMenuProps) {
  const [openKeys, setOpenKeys] = useState(ancestorKeys);
  useEffect(() => { setOpenKeys(ancestorKeys); }, [ancestorKeys]);
  const selectedKeys = useMemo(() => [selectedKey], [selectedKey]);
  return (
    <Menu
      theme={isDarkMode ? 'dark' : 'light'}
      mode="inline"
      direction="rtl"
      inlineCollapsed={!isMobile && collapsed}
      selectedKeys={selectedKeys}
      openKeys={collapsed && !isMobile ? undefined : openKeys}
      onOpenChange={setOpenKeys}
      triggerSubMenuAction="click"
      // Avoid measuring/animating submenu heights over a busy workspace.
      motion={{ motionAppear: false, motionEnter: false, motionLeave: false }}
      items={items}
      onClick={({ key }) => { if (key.startsWith('/')) onNavigate(key); }}
      className="mt-4 border-none bg-transparent font-medium"
    />
  );
});

export default SidebarMenu;
