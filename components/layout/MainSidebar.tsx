import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Drawer, Tooltip, type MenuProps } from 'antd';
import { AppstoreOutlined, BankOutlined, CloseOutlined, LeftOutlined } from '@ant-design/icons';
import SidebarMenu, { sidebarLabelText } from './SidebarMenu';
import ContextualTutorialButton from '../cms/ContextualTutorialButton';
import TazeSystemAttribution from '../common/TazeSystemAttribution';
import { renderModuleIcon } from '../../utils/moduleIcons';
import { SIDEBAR_LAYOUT } from '../../utils/sidebarLayout';

type Props = {
  items: MenuProps['items']; railItems: MenuProps['items']; selectedKey: string; ancestorKeys: string[];
  collapsed: boolean; onCollapsedChange: (value: boolean) => void; isMobile: boolean; isDarkMode: boolean;
  onNavigate: (href: string) => void; onPreload?: (href: string) => void;
  brandShortName: string; brandLogoUrl?: string | null; contexts: string[]; orgId: string | null; userId: string | null;
  presentation?: 'push' | 'overlay';
};
function MainSidebar({ items, railItems, selectedKey, ancestorKeys, collapsed, onCollapsedChange, isMobile, isDarkMode, onNavigate, onPreload, brandShortName, brandLogoUrl, contexts, orgId, userId, presentation = 'overlay' }: Props) {
  const [requestedGroup, setRequestedGroup] = useState<string | null>(null);
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (collapsed || isMobile) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target;
      if (presentation === 'push' || !(target instanceof Element) || sidebarRef.current?.contains(target) || target.closest('.app-main-sider-submenu-popup')) return;
      onCollapsedChange(true);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) {
      sidebarRef.current?.querySelector<HTMLElement>('.app-main-rail [aria-expanded="true"]')?.focus();
      onCollapsedChange(true);
    } };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [collapsed, isMobile, presentation, onCollapsedChange]);
  useEffect(() => { setRequestedGroup(null); }, [orgId, userId, selectedKey]);
  const displayedKey = !collapsed && requestedGroup ? requestedGroup : selectedKey;
  const logo = brandLogoUrl && failedLogoUrl !== brandLogoUrl
    ? <img src={brandLogoUrl} alt={`لوگوی ${brandShortName}`} onError={() => setFailedLogoUrl(brandLogoUrl)} />
    : <BankOutlined aria-label={brandShortName} />;
  const expandedKeys = useMemo(() => requestedGroup ? [...new Set([...ancestorKeys, requestedGroup])] : ancestorKeys, [ancestorKeys, requestedGroup]);
  const viewer = useMemo(() => ({ orgId, userId }), [orgId, userId]);
  const close = () => {
    sidebarRef.current?.querySelector<HTMLElement>('.app-main-rail [aria-expanded="true"]')?.focus();
    onCollapsedChange(true);setRequestedGroup(null);
  };
  const requestedItem = (items || []).find(item => item && 'key' in item && String(item.key) === requestedGroup);
  const panelItems = requestedItem && 'children' in requestedItem ? requestedItem.children : items;
  const panelTitle = requestedItem && 'label' in requestedItem ? sidebarLabelText(requestedItem.label) : 'فهرست ماژول‌ها';
  return <div ref={sidebarRef} className="app-sidebar-navigation" style={{ '--workspace-sidebar-panel-width': `${SIDEBAR_LAYOUT.panelWidth}px`, '--workspace-sidebar-rail-width': `${SIDEBAR_LAYOUT.railWidth}px` } as React.CSSProperties}>
    {!isMobile && <aside className="app-main-rail" aria-label="ناوبری اصلی">
      <div className="app-rail-brand" title={brandShortName}>{logo}</div>
      <nav className="app-rail-links">{(railItems || []).map((item, index) => {
        if (!item || !('key' in item)) return null;
        const key = String(item.key || ''), label = sidebarLabelText('label' in item ? item.label : '');
        const hasChildren = 'children' in item && Array.isArray(item.children);
        const active = key === displayedKey || ((collapsed || !requestedGroup) && ancestorKeys.includes(key));
        const icon = 'icon' in item && item.icon ? item.icon : key.startsWith('/') ? renderModuleIcon(key.slice(1).split('/')[0]) : <AppstoreOutlined />;
        const isDashboard = key === '/' || index === 0;
        const isMainSidebarOpen = !collapsed && requestedGroup === null;
        return <React.Fragment key={key}>
          <Tooltip title={label} placement="left"><Button type="text" aria-label={label} aria-expanded={hasChildren ? !collapsed && requestedGroup === key : undefined} aria-controls={hasChildren ? 'workspace-sidebar-panel' : undefined} className={`app-rail-item ${active ? 'is-active' : ''}`} icon={icon}
            disabled={'disabled' in item && Boolean(item.disabled)} onPointerEnter={() => { if (!hasChildren && key.startsWith('/')) onPreload?.(key); }}
            onClick={() => { if (hasChildren) { setRequestedGroup(key);onCollapsedChange(false); } else if (key.startsWith('/')) onNavigate(key); }} /></Tooltip>
          {isDashboard && <Tooltip title={isMainSidebarOpen ? 'بستن منو' : 'باز کردن فهرست ماژول‌ها'} placement="left">
            <button type="button" aria-label="باز کردن فهرست ماژول‌ها" aria-expanded={isMainSidebarOpen} aria-controls="workspace-sidebar-panel" className={`app-rail-toggle-btn ${isMainSidebarOpen ? 'is-open' : ''}`}
              onClick={() => { if (isMainSidebarOpen) { onCollapsedChange(true); } else { setRequestedGroup(null); onCollapsedChange(false); } }}>
              <LeftOutlined className="app-rail-toggle-icon" />
            </button>
          </Tooltip>}
        </React.Fragment>;
      })}</nav>
      <div className="app-rail-footer">
        <ContextualTutorialButton contexts={contexts} viewer={viewer} buttonClassName="app-rail-item" />
      </div>
    </aside>}
    {!isMobile && !collapsed && <aside id="workspace-sidebar-panel" className="app-sidebar-panel" aria-label={panelTitle}>
      <header className="app-sidebar-panel-header"><span className="app-drawer-brand">{logo}<span>{panelTitle}</span></span><Button type="text" icon={<CloseOutlined />} aria-label="بستن فهرست ماژول‌ها" onClick={close} /></header>
      <nav className="app-sidebar-panel-menu" aria-label="ماژول‌های سامانه">
        <SidebarMenu items={panelItems} selectedKey={selectedKey} ancestorKeys={expandedKeys} collapsed={false} isMobile={false} desktopFlyout isDarkMode={isDarkMode} onNavigate={href => { close(); onNavigate(href); }} />
      </nav>
      <footer className="app-drawer-footer"><ContextualTutorialButton contexts={contexts} viewer={viewer} buttonClassName="app-rail-item" /><TazeSystemAttribution collapsed={false} /></footer>
    </aside>}
    {isMobile && <Drawer open={!collapsed} onClose={close} placement="right" title={<span className="app-drawer-brand">{logo}<span>{brandShortName}</span></span>} width="min(320px, calc(100vw - 20px))"
      rootClassName={`app-module-drawer ${isDarkMode ? 'app-module-drawer-dark' : ''}`} zIndex={1200} destroyOnClose
      styles={{ body: { padding: '4px 8px 12px', background: isDarkMode ? '#1c1c1f' : '#fff' }, header: { background: isDarkMode ? '#1c1c1f' : '#fff' }, mask: { background: isMobile ? 'rgba(0,0,0,.24)' : 'rgba(0,0,0,.07)' } }}
      footer={<div className="app-drawer-footer"><ContextualTutorialButton contexts={contexts} viewer={viewer} buttonClassName="app-rail-item" /><TazeSystemAttribution collapsed={false} /></div>}>
      <SidebarMenu items={items} selectedKey={displayedKey} ancestorKeys={expandedKeys} collapsed={false} isMobile={isMobile} isDarkMode={isDarkMode}
        onNavigate={href => { close();onNavigate(href); }} />
    </Drawer>}
  </div>;
}
export default React.memo(MainSidebar);
