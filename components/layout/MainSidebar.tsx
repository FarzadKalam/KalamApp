import React, { useMemo, useState } from 'react';
import { Button, Drawer, Tooltip, type MenuProps } from 'antd';
import { AppstoreOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import SidebarMenu, { sidebarLabelText } from './SidebarMenu';
import ContextualTutorialButton from '../cms/ContextualTutorialButton';
import TazeSystemAttribution from '../common/TazeSystemAttribution';
import { renderModuleIcon } from '../../utils/moduleIcons';

type Props = {
  items: MenuProps['items']; railItems: MenuProps['items']; selectedKey: string; ancestorKeys: string[];
  collapsed: boolean; onCollapsedChange: (value: boolean) => void; isMobile: boolean; isDarkMode: boolean;
  onNavigate: (href: string) => void; onPreload?: (href: string) => void;
  brandShortName: string; contexts: string[]; orgId: string | null; userId: string | null;
};
function MainSidebar({ items, railItems, selectedKey, ancestorKeys, collapsed, onCollapsedChange, isMobile, isDarkMode, onNavigate, onPreload, brandShortName, contexts, orgId, userId }: Props) {
  const [requestedGroup, setRequestedGroup] = useState<string | null>(null);
  const expandedKeys = useMemo(() => requestedGroup ? [...new Set([...ancestorKeys, requestedGroup])] : ancestorKeys, [ancestorKeys, requestedGroup]);
  const viewer = useMemo(() => ({ orgId, userId }), [orgId, userId]);
  const close = () => { onCollapsedChange(true);setRequestedGroup(null); };
  return <>
    {!isMobile && <aside className="app-main-rail" aria-label="ناوبری اصلی">
      <div className="app-rail-brand" title={brandShortName}>{brandShortName.slice(0, 1)}</div>
      <nav className="app-rail-links">{(railItems || []).map(item => {
        if (!item || !('key' in item)) return null;
        const key = String(item.key || ''), label = sidebarLabelText('label' in item ? item.label : '');
        const hasChildren = 'children' in item && Array.isArray(item.children);
        const active = key === selectedKey || ancestorKeys.includes(key);
        const icon = 'icon' in item && item.icon ? item.icon : key.startsWith('/') ? renderModuleIcon(key.slice(1).split('/')[0]) : <AppstoreOutlined />;
        return <Tooltip key={key} title={label} placement="left"><Button type="text" aria-label={label} className={`app-rail-item ${active ? 'is-active' : ''}`} icon={icon}
          disabled={'disabled' in item && Boolean(item.disabled)} onPointerEnter={() => { if (!hasChildren && key.startsWith('/')) onPreload?.(key); }}
          onClick={() => { if (hasChildren) { setRequestedGroup(key);onCollapsedChange(false); } else if (key.startsWith('/')) onNavigate(key); }} /></Tooltip>;
      })}</nav>
      <div className="app-rail-footer">
        <ContextualTutorialButton contexts={contexts} viewer={viewer} buttonClassName="app-rail-item" />
        <Tooltip title="فهرست ماژول‌ها" placement="left"><Button type="text" className="app-rail-item" icon={<MenuUnfoldOutlined />} aria-label="باز کردن فهرست ماژول‌ها" onClick={() => onCollapsedChange(false)} /></Tooltip>
      </div>
    </aside>}
    <Drawer open={!collapsed} onClose={close} placement="right" title={brandShortName} width={isMobile ? 'min(320px, calc(100vw - 20px))' : 296}
      rootClassName={`app-module-drawer ${isDarkMode ? 'app-module-drawer-dark' : ''}`} zIndex={1200} destroyOnClose
      styles={{ body: { padding: '4px 8px 12px', background: isDarkMode ? '#1c1c1f' : '#fff' }, header: { background: isDarkMode ? '#1c1c1f' : '#fff' }, mask: { background: isMobile ? 'rgba(0,0,0,.24)' : 'rgba(0,0,0,.07)' } }}
      footer={<div className="app-drawer-footer"><ContextualTutorialButton contexts={contexts} viewer={viewer} buttonClassName="app-rail-item" /><TazeSystemAttribution collapsed={false} /></div>}>
      <SidebarMenu items={items} selectedKey={selectedKey} ancestorKeys={expandedKeys} collapsed={false} isMobile={isMobile} isDarkMode={isDarkMode}
        onNavigate={href => { close();onNavigate(href); }} />
    </Drawer>
  </>;
}
export default React.memo(MainSidebar);
