import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Layout as AntLayout, Menu, Button, Avatar, Dropdown, App, Input, Spin } from 'antd';
import type { InputRef, MenuProps } from 'antd';
import { 
  AppstoreOutlined,
  DashboardOutlined, 
  TeamOutlined, 
  SettingOutlined,
  SearchOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  LeftOutlined,
  RightOutlined,
  HomeOutlined,
  BankOutlined,
  BarChartOutlined,
  FileTextOutlined,
  CheckSquareOutlined,
  ExclamationCircleOutlined,
  MoonOutlined,
  ProjectOutlined,
  NodeIndexOutlined,
  SunOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import NotificationsPopover from './NotificationsPopover';
import { getRecordTitle } from '../utils/recordTitle';
import {
  ACCOUNTING_PERMISSION_KEY,
  REPORTS_PERMISSION_KEY,
  SETTINGS_PERMISSION_KEY,
  resolveFilesAccessPermissions,
  resolvePreferredRoleModuleIds,
  type PermissionMap,
} from '../utils/permissions';
import { fetchSessionBootstrap } from '../utils/sessionCache';
import { RECYCLE_BIN_ROUTE } from '../utils/recycleBin';

const { Header, Sider, Content } = AntLayout;

interface LayoutProps {
  children: React.ReactNode;
  isDarkMode: boolean;
  toggleTheme: () => void;
  brandShortName: string;
}

const Layout: React.FC<LayoutProps> = ({ children, isDarkMode, toggleTheme, brandShortName }) => {
  const { message: messageApi, modal } = App.useApp();
  const [collapsed, setCollapsed] = useState(true);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [breadcrumb, setBreadcrumb] = useState<{ moduleTitle?: string; moduleId?: string; recordName?: string } | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ moduleId: string; moduleTitle: string; items: any[] }>>([]);
  const [rolePermissions, setRolePermissions] = useState<PermissionMap>({});
  const [rolePermissionsReady, setRolePermissionsReady] = useState(false);
  const [openMenuKeys, setOpenMenuKeys] = useState<string[]>([]);
  const searchRef = useRef<InputRef>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  
  const navigate = useNavigate();
  const location = useLocation();

  const handleSidebarNavigate = (href: string) => {
    if (!href) return;
    navigate(href);
    if (isMobile) setCollapsed(true);
  };

  const handleSidebarLinkClick = (
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string,
    disabled?: boolean
  ) => {
    if (disabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const isModifiedClick =
      event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey;

    if (isModifiedClick) {
      event.stopPropagation();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handleSidebarNavigate(href);
  };

  const buildSidebarLabel = (label: React.ReactNode, href?: string, disabled?: boolean) => {
    if (!href) {
      return <span className="sidebar-menu-label">{label}</span>;
    }

    return (
      <a
        href={disabled ? undefined : href}
        aria-disabled={disabled || undefined}
        className={`sidebar-menu-link ${disabled ? 'is-disabled' : ''}`}
        onClick={(event) => handleSidebarLinkClick(event, href, disabled)}
        onAuxClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()}
      >
        <span className="sidebar-menu-link__text">{label}</span>
      </a>
    );
  };

  const mapSidebarMenuItems = (items: NonNullable<MenuProps['items']>): MenuProps['items'] =>
    items.map((item) => {
      if (!item || typeof item !== 'object' || !('key' in item)) return item;

      const href = typeof item.key === 'string' && item.key.startsWith('/') ? item.key : undefined;
      const label = 'label' in item ? item.label : null;
      const nextItem: any = {
        ...item,
        label: buildSidebarLabel(label, href, Boolean((item as any).disabled)),
      };

      if ('children' in item && Array.isArray(item.children) && item.children.length > 0) {
        nextItem.popupClassName = 'app-main-sider-submenu-popup';
        nextItem.popupOffset = [-8, 4];
        nextItem.children = mapSidebarMenuItems(item.children);
      }

      return nextItem;
    });

  const findMenuPath = useCallback((
    items: NonNullable<MenuProps['items']>,
    targetKey: string,
    parents: string[] = []
  ): string[] => {
    for (const item of items) {
      if (!item || typeof item !== 'object' || !('key' in item)) continue;
      const itemKey = String(item.key);
      if (itemKey === targetKey) {
        return [...parents, itemKey];
      }
      if ('children' in item && Array.isArray(item.children) && item.children.length > 0) {
        const nested = findMenuPath(item.children, targetKey, [...parents, itemKey]);
        if (nested.length > 0) return nested;
      }
    }
    return [];
  }, []);

  useEffect(() => {
    let isMounted = true;
    const updateViewportVars = () => {
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      document.documentElement.style.setProperty('--app-viewport-height', `${viewportHeight}px`);
      document.documentElement.style.setProperty('--app-mobile-footer-height', '64px');
    };

    const getUser = async () => {
      try {
        const snapshot = await fetchSessionBootstrap(supabase);
        const user = snapshot.user;
        if (!isMounted) return;
        setCurrentUser(user);
        if (user?.id) {
          if (!isMounted) return;
          setCurrentUserProfile(snapshot.profile || null);
          setRolePermissions((snapshot.permissions || {}) as PermissionMap);
        } else {
          setCurrentUserProfile(null);
          setRolePermissions({});
        }
      } finally {
        if (isMounted) setRolePermissionsReady(true);
      }
    };
    getUser();

    const handleResize = () => {
      const width = window.innerWidth;
      const mobile = width < 768;
      updateViewportVars();

      setIsMobile(mobile);
      setIsKeyboardVisible(window.innerHeight < 500);
      
      if (mobile) {
        setCollapsed(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('scroll', handleResize);
    return () => {
      isMounted = false;
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
    };
  }, []);

  const canViewModule = (moduleId: string) => rolePermissions?.[moduleId]?.view !== false;
  const canViewSettingsRoot = rolePermissions?.[SETTINGS_PERMISSION_KEY]?.view !== false;
  const canViewAccountingDashboard = rolePermissions?.[ACCOUNTING_PERMISSION_KEY]?.view !== false;
  const canViewCashBank =
    canViewAccountingDashboard &&
    rolePermissions?.[ACCOUNTING_PERMISSION_KEY]?.fields?.cash_bank_page !== false;
  const canViewAccountingSettings =
    canViewAccountingDashboard &&
    rolePermissions?.[ACCOUNTING_PERMISSION_KEY]?.fields?.settings_links !== false;
  const canViewReportsHub =
    rolePermissions?.[REPORTS_PERMISSION_KEY]?.view !== false &&
    rolePermissions?.[REPORTS_PERMISSION_KEY]?.fields?.hub_page !== false;
  const filesAccess = resolveFilesAccessPermissions(rolePermissions);

  // Collapse sidebar on route change
  useEffect(() => {
    if (isMobile) {
      setCollapsed(true);
      return;
    }
    setCollapsed(location.pathname !== '/');
  }, [location.pathname, isMobile]);

  const handleLogout = () => {
    modal.confirm({
      title: 'خروج از حساب کاربری',
      icon: <ExclamationCircleOutlined />,
      content: 'آیا مطمئن هستید که می‌خواهید خارج شوید؟',
      okText: 'بله، خروج',
      cancelText: 'انصراف',
      okType: 'danger',
      onOk: async () => {
        try {
          const { error } = await supabase.auth.signOut();
          if (error) throw error;
          navigate('/login');
          messageApi.success('با موفقیت خارج شدید');
        } catch (error) {
          messageApi.error('خطا در خروج از سیستم');
        }
      },
    });
  };

  const rawMenuItems = useMemo<NonNullable<MenuProps['items']>>(() => {
    return [
      { key: '/', icon: <DashboardOutlined />, label: 'داشبورد' },
      {
        key: 'resources',
        icon: <AppstoreOutlined />,
        label: 'منابع',
        children: [
          { key: '/products', label: 'کالاها و خدمات' },
          { key: '/price_lists', label: 'لیست قیمت‌ها', disabled: !canViewModule('price_lists') },
          { key: '/product_bundles', label: 'پکیج‌ها', disabled: !canViewModule('product_bundles') },
          { key: '/customers', label: 'مشتریان' },
          { key: '/suppliers', label: 'تامین کنندگان' },
          { key: '/warehouses', label: 'انبارها' },
          { key: '/shelves', label: 'قفسه‌ها' },
          { key: '/billboards', label: 'تبلیغات محیطی', disabled: false },
        ]
      },
      {
        key: 'projects',
        icon: <ProjectOutlined />,
        label: 'پروژه‌ها',
        children: [
          { key: '/projects', label: 'پروژه‌ها' },
        ]
      },
      {
        key: 'sales_and_purchase',
        icon: <FileTextOutlined />,
        label: 'خرید و فروش',
        children: [
          { key: '/marketing_leads', label: 'بازاریابی' },
          { key: '/invoices', label: 'فاکتورهای فروش' },
          { key: '/purchase_invoices', label: 'فاکتورهای خرید' },
          { key: '/sales_return_invoices', label: 'فاکتورهای برگشت از فروش', disabled: true },
          { key: '/purchase_return_invoices', label: 'فاکتورهای برگشت از خرید', disabled: true },
        ]
      },
      {
        key: 'accounting',
        icon: <BankOutlined />,
        label: 'حسابداری',
        children: [
          { key: '/accounting', label: 'داشبورد حسابداری', disabled: !canViewAccountingDashboard },
          { key: '/cash_bank', label: 'نقد و بانک' },
          { key: '/journal_entries', label: 'اسناد حسابداری', disabled: !canViewModule('journal_entries') },
          {
            key: '/accounting/account-review',
            label: 'مرور حساب ها',
            disabled: !canViewModule('journal_entries') || !canViewModule('chart_of_accounts'),
          },
          { key: '/chart_of_accounts', label: 'جدول حساب ها', disabled: !canViewModule('chart_of_accounts') },
          { key: '/cheques', label: 'چک ها', disabled: !canViewModule('cheques') },
          { key: '/barters', label: 'تهاترها', disabled: !canViewModule('barters') },
          { key: '/accounting/settings', label: 'تنظیمات حسابداری', disabled: !canViewAccountingSettings },
        ]
      },
      {
        key: 'hr',
        icon: <TeamOutlined />,
        label: 'منابع انسانی',
        children: [
          { key: '/hr', label: 'داشبورد منابع انسانی' },
          { key: '/employees', label: 'کارکنان' },
          { key: '/attendance_logs', label: 'تردد' },
          { key: '/work_schedules', label: 'برنامه حضور' },
          { key: '/leave_requests', label: 'مرخصی‌ها' },
          { key: '/overtime_requests', label: 'اضافه‌کاری‌ها' },
          { key: '/mission_requests', label: 'ماموریت‌ها' },
          { key: '/tasks', label: 'فعالیت ها' },
        ]
      },
      {
        key: 'reports',
        icon: <BarChartOutlined />,
        label: 'گزارشات',
        children: [
          { key: '/reports', label: 'گزارش‌ساز', disabled: !canViewReportsHub },
          { key: '/automation_execution_reports', label: 'گزارشات فرآیند و اتوماسیون', disabled: !canViewModule('automation_execution_reports') },
          { key: '/sms_delivery_reports', label: 'گزارشات ارسال پیامک', disabled: !canViewModule('sms_delivery_reports') },
          { key: '/counterparty_bot_groups', label: 'گروه‌های بات', disabled: !canViewModule('counterparty_bot_groups') },
        ],
      },
      {
        key: 'processes',
        icon: <NodeIndexOutlined />,
        label: 'فرآیندها',
        children: [
          { key: '/process_templates', label: 'الگوهای فرآیند' },
          { key: '/process_runs', label: 'اجرای فرآیندها' },
        ],
      },
      {
        key: 'tools',
        icon: <AppstoreOutlined />,
        label: 'ابزارها',
        children: [
          { key: '/web_forms', label: 'وب فرم‌ها', disabled: !canViewModule('web_forms') },
          { key: '/production_orders', label: 'سفارشات تولید' },
          { key: '/gallery', label: 'گالری فایل‌ها' },
          { key: RECYCLE_BIN_ROUTE, icon: <DeleteOutlined />, label: 'سطل بازیافت' },
        ]
      },
      { key: '/settings', icon: <SettingOutlined />, label: 'تنظیمات' },
    ];
  }, [canViewAccountingDashboard, canViewAccountingSettings, canViewReportsHub, rolePermissions]);

  const visibleRawMenuItems = useMemo<NonNullable<MenuProps['items']>>(() => {
    const canShowMenuKey = (key?: string) => {
      if (!key) return true;
      switch (key) {
        case '/':
          return true;
        case '/accounting':
          return canViewAccountingDashboard;
        case '/cash_bank':
          return canViewCashBank;
        case '/accounting/settings':
          return canViewAccountingSettings;
        case '/reports':
          return canViewReportsHub;
        case '/gallery':
          return filesAccess.canViewGallery;
        case RECYCLE_BIN_ROUTE:
          return filesAccess.canViewRecycleBin;
        case '/settings':
          return canViewSettingsRoot;
        case '/accounting/account-review':
          return canViewModule('journal_entries') && canViewModule('chart_of_accounts');
        default: {
          if (!key.startsWith('/')) return true;
          const moduleId = key.slice(1).split('/')[0];
          return canViewModule(moduleId);
        }
      }
    };

    const filterItems = (items: NonNullable<MenuProps['items']>): NonNullable<MenuProps['items']> =>
      items.reduce<NonNullable<MenuProps['items']>>((acc, item) => {
        if (!item || typeof item !== 'object' || !('key' in item)) return acc;
        const nextItem: any = { ...item };
        if ('children' in item && Array.isArray(item.children)) {
          nextItem.children = filterItems(item.children);
          if (!nextItem.children.length) return acc;
          acc.push(nextItem);
          return acc;
        }
        if (canShowMenuKey(String(item.key || ''))) {
          acc.push(nextItem);
        }
        return acc;
      }, []);

    return filterItems(rawMenuItems);
  }, [
    rawMenuItems,
    canViewAccountingDashboard,
    canViewAccountingSettings,
    canViewCashBank,
    canViewReportsHub,
    canViewSettingsRoot,
    filesAccess.canViewGallery,
    filesAccess.canViewRecycleBin,
    rolePermissions,
  ]);

  const menuItems = useMemo<MenuProps['items']>(() => {
    return mapSidebarMenuItems(visibleRawMenuItems);
  }, [visibleRawMenuItems]);

  const searchableModules = useMemo(() => {
    return Object.entries(MODULES).map(([id, config]) => {
      const fieldKeys = (config.fields || []).map((f: any) => f.key);
      const preferred = ['name', 'title', 'system_code', 'manual_code', 'business_name'];
      const keyField = config.fields?.find((f: any) => f.isKey)?.key;
      const inferred = fieldKeys.filter((key: string) => /name|title|code|number|subject/i.test(key));
      const keys = Array.from(new Set([...preferred, ...(keyField ? [keyField] : []), ...inferred])).filter((key) => fieldKeys.includes(key));
      return { id, title: config.titles?.fa || id, keys };
    });
  }, []);

  useEffect(() => {
    const matchedPath = findMenuPath(rawMenuItems, location.pathname);
    const parentKeys = matchedPath.slice(0, -1);
    setOpenMenuKeys((prev) => {
      if (prev.length === parentKeys.length && prev.every((key, index) => key === parentKeys[index])) {
        return prev;
      }
      return parentKeys;
    });
  }, [findMenuPath, location.pathname, rawMenuItems]);

  useEffect(() => {
    const term = globalSearch.trim();
    if (!term) {
      setSearchResults([]);
      return;
    }

    const handle = setTimeout(async () => {
      try {
        setSearchLoading(true);
        const results = await Promise.all(
          searchableModules.map(async (mod) => {
            if (!mod.keys.length) return { moduleId: mod.id, moduleTitle: mod.title, items: [] };
            const orFilters = mod.keys
              .map((key) => `${key}.ilike.%${term}%`)
              .join(',');
            const selectFields = Array.from(new Set(['id', ...mod.keys])).join(', ');
            const { data } = await supabase
              .from(mod.id)
              .select(selectFields)
              .or(orFilters)
              .limit(8);
            return { moduleId: mod.id, moduleTitle: mod.title, items: data || [] };
          })
        );
        setSearchResults(results.filter((r) => r.items.length > 0));
      } catch (err) {
        console.warn('Global search failed', err);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 250);

    return () => clearTimeout(handle);
  }, [globalSearch, searchableModules]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!searchBoxRef.current) return;
      if (searchBoxRef.current.contains(event.target as Node)) return;
      setSearchResults([]);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as { moduleTitle?: string; moduleId?: string; recordName?: string } | null;
      setBreadcrumb(detail || null);
    };
    window.addEventListener('erp:breadcrumb', handler as EventListener);
    return () => window.removeEventListener('erp:breadcrumb', handler as EventListener);
  }, []);

  const userMenu = {
    items: [
      {
        key: 'profile',
        label: 'پروفایل کاربری',
        icon: <UserOutlined />,
        onClick: () => navigate('/profile'),
      },
      { type: 'divider' as const },
      { 
        key: 'logout', 
        label: 'خروج', 
        icon: <LogoutOutlined />, 
        danger: true,
        onClick: handleLogout
      },
    ],
  };
  const resolvedAvatarSrc = currentUserProfile?.avatar_url || currentUser?.user_metadata?.avatar_url || undefined;

  type MobileNavItem = {
    key: string;
    icon: React.ReactNode;
    label: string;
    isCenter?: boolean;
    isMenu?: boolean;
  };

  const mobileFooterModuleIds = useMemo(() => {
    return resolvePreferredRoleModuleIds(rolePermissions, MODULES, 3);
  }, [rolePermissions]);

  const mobileNavItems: MobileNavItem[] = useMemo(() => {
    const labelMap: Record<string, string> = {
      products: 'کالاها',
      production_orders: 'تولید',
      invoices: 'فروش',
      purchase_invoices: 'خرید',
      product_bundles: 'پکیج',
      price_lists: 'قیمت',
      customers: 'مشتری',
      suppliers: 'تامین',
      projects: 'پروژه',
      tasks: 'فعالیت ها',
      employees: 'پرسنل',
      warehouses: 'انبار',
      marketing_leads: 'لیدها',
      process_runs: 'فرآیند',
      process_templates: 'الگوها',
      attendance_logs: 'تردد',
    };
    const iconMap: Record<string, React.ReactNode> = {
      products: <AppstoreOutlined />,
      product_bundles: <AppstoreOutlined />,
      price_lists: <AppstoreOutlined />,
      production_orders: <CheckSquareOutlined />,
      invoices: <FileTextOutlined />,
      purchase_invoices: <FileTextOutlined />,
      customers: <TeamOutlined />,
      suppliers: <TeamOutlined />,
      employees: <TeamOutlined />,
      tasks: <CheckSquareOutlined />,
      projects: <ProjectOutlined />,
      warehouses: <BankOutlined />,
      marketing_leads: <FileTextOutlined />,
      attendance_logs: <CheckSquareOutlined />,
      process_runs: <NodeIndexOutlined />,
      process_templates: <NodeIndexOutlined />,
    };
    const dynamicItems = mobileFooterModuleIds.map((moduleId) => ({
      key: `/${moduleId}`,
      icon: iconMap[moduleId] || <AppstoreOutlined />,
      label: labelMap[moduleId] || MODULES[moduleId]?.titles?.faSingular || MODULES[moduleId]?.titles?.fa || moduleId,
    }));
    return [
      dynamicItems[0],
      dynamicItems[1],
      { key: '/', icon: <HomeOutlined />, label: 'خانه', isCenter: true },
      dynamicItems[2],
      { key: 'more', icon: <MenuFoldOutlined />, label: 'بیشتر', isMenu: true },
    ].filter(Boolean) as MobileNavItem[];
  }, [mobileFooterModuleIds]);

  const toggleSidebar = () => {
    setCollapsed((prev) => !prev);
  };

  return (
    <AntLayout
      className="overflow-hidden bg-gray-100 dark:bg-dark-bg transition-colors duration-300"
      style={{ height: 'var(--app-viewport-height, 100dvh)' }}
    >
      
      {isMobile && !collapsed && (
        <div 
          className="fixed inset-0 z-[1050] bg-black/50 backdrop-blur-sm transition-opacity duration-300"
          onClick={() => setCollapsed(true)}
        />
      )}

      <Sider 
        trigger={null} 
        collapsible 
        collapsed={collapsed}
        collapsedWidth={isMobile ? 0 : 80}
        zeroWidthTriggerStyle={{ display: 'none' }}
        className={`app-main-sider border-l border-gray-200 dark:border-dark-border shadow-2xl transition-all duration-300 z-[1100] overflow-visible ${isMobile && collapsed ? 'mobile-collapsed !hidden w-0 !min-w-0 !max-w-0 overflow-hidden' : ''}`}
        style={{ 
          height: 'var(--app-viewport-height, 100dvh)',
          position: 'fixed', 
          right: 0, 
          top: 0,
          bottom: 0,
          zIndex: 1100,
          display: (isMobile && collapsed) ? 'none' : 'block' 
        }}
        theme={isDarkMode ? 'dark' : 'light'}
        width={260}
      >
        <div className="h-16 flex items-center justify-center border-b border-gray-200 dark:border-dark-border overflow-hidden px-4 sticky top-0 bg-inherit z-10">
          <div className={`transition-all duration-300 font-black text-lg text-leather-500 tracking-tighter whitespace-nowrap ${collapsed ? 'opacity-0 w-0 hidden' : 'opacity-100'}`}>
            {brandShortName}
          </div>
          {collapsed && !isMobile && <div className="text-leather-500 font-black text-2xl absolute">ک</div>}
        </div>

        {!isMobile && (
          <Button
            type="text"
            size="small"
            icon={collapsed ? <LeftOutlined /> : <RightOutlined />}
            onClick={toggleSidebar}
            aria-label={collapsed ? 'باز کردن سایدبار' : 'بستن سایدبار'}
            className="absolute -left-3 top-20 z-20 h-7 w-7 !min-w-0 !p-0 rounded-full border border-gray-200 dark:border-dark-border bg-white/95 dark:bg-dark-surface text-gray-500 dark:text-gray-300 shadow-sm hover:!text-leather-500 hover:!bg-white dark:hover:!bg-dark-surface"
          />
        )}

        <div className="h-[calc(var(--app-viewport-height,100dvh)-64px)] overflow-y-auto">
            <Menu
            theme={isDarkMode ? 'dark' : 'light'}
            mode="inline"
            direction="rtl"
            inlineCollapsed={!isMobile && collapsed}
            selectedKeys={[location.pathname]}
            openKeys={collapsed && !isMobile ? undefined : openMenuKeys}
            onOpenChange={(keys) => setOpenMenuKeys(keys as string[])}
            triggerSubMenuAction="click"
            items={menuItems}
            onClick={({ key }) => { 
                if (typeof key === 'string' && key.startsWith('/')) {
                  handleSidebarNavigate(key);
                }
            }} 
            className="mt-4 border-none bg-transparent font-medium"
            />
        </div>
      </Sider>

      <AntLayout 
        className="bg-gray-100 dark:bg-dark-bg transition-all duration-300 overflow-hidden flex flex-col"
        style={{ 
          paddingRight: isMobile ? 0 : (collapsed ? 80 : 260), 
          width: '100%',
          height: 'var(--app-viewport-height, 100dvh)',
        }}
      >
        <Header 
          className="sticky top-0 z-[1000] px-4 flex items-center justify-between border-b border-gray-200 dark:border-dark-border h-16 w-full transition-colors duration-300"
          style={{ 
            backdropFilter: 'blur(20px)', 
            backgroundColor: isDarkMode ? 'rgba(23, 28, 48, 0.82)' : 'rgba(255, 255, 255, 0.82)',
          }}
        >
          <div className="relative flex items-center gap-4" ref={searchBoxRef}>          
            <div className="flex items-center bg-gray-100 dark:bg-dark-surface rounded-xl px-3 py-1.5 border border-gray-200 dark:border-dark-border w-48 sm:w-72 transition-colors">
              <SearchOutlined className="text-gray-400" />
              <Input
                ref={searchRef}
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="جستجو در همه جا..."
                className="bg-transparent border-none outline-none text-xs text-gray-700 dark:text-gray-200 w-full mr-2 placeholder-gray-400"
                variant="borderless"
              />
            </div>

            {(searchLoading || searchResults.length > 0) && globalSearch.trim() && (
              <div className="absolute top-12 right-0 z-[1200] w-72 sm:w-[420px] max-h-[60vh] overflow-auto rounded-b-2xl rounded-t-none border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-2xl p-1.5">
                {searchLoading && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 p-2">
                    <Spin size="small" /> در حال جستجو...
                  </div>
                )}
                {!searchLoading && searchResults.length === 0 && (
                  <div className="text-xs text-gray-400 p-2">نتیجه‌ای یافت نشد</div>
                )}
                {!searchLoading && searchResults.map((group) => (
                  <div key={group.moduleId} className="mb-0.5">
                    <div className="text-[11px] text-gray-400 px-2 py-0.5">{group.moduleTitle}</div>
                    <div className="h-[2px] bg-leather-500 rounded-full mx-2 mt-0.5 mb-0.5" />
                    <div className="space-y-0.5">
                      {group.items.map((item: any) => {
                        const moduleConfig = MODULES[group.moduleId];
                        const label = getRecordTitle(item, moduleConfig, { fallback: '-' });
                        const code = item.system_code || item.manual_code;
                        return (
                          <div
                            key={item.id}
                            className="px-2 py-0.5 rounded-lg text-xs text-leather-600 dark:text-leather-400 hover:underline hover:bg-gray-100 dark:hover:bg-white/5 cursor-pointer flex items-center justify-between"
                            onClick={() => {
                              navigate(`/${group.moduleId}/${item.id}`);
                              setGlobalSearch('');
                              setSearchResults([]);
                            }}
                          >
                            <span className="truncate">{label}</span>
                            {code && <span className="text-[10px] text-gray-400">{code}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <Button
              type="text"
              shape="circle"
              icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />}
              onClick={toggleTheme}
              className="text-gray-500 dark:text-gray-300 hover:text-leather-500"
              title={isDarkMode ? 'حالت روشن' : 'حالت شب'}
            />
            <div className="w-[1px] h-6 bg-gray-300 dark:bg-gray-700 mx-1"></div>
            <NotificationsPopover isMobile={isMobile} variant="chat" requestedTab="notes" />
            <NotificationsPopover isMobile={isMobile} variant="alerts" />
            <Dropdown menu={userMenu} placement="bottomLeft" trigger={['click']}>
                <div className="cursor-pointer transition-transform hover:scale-105">
                   <Avatar 
                     size="small" 
                     src={resolvedAvatarSrc}
                     icon={!resolvedAvatarSrc ? <UserOutlined /> : undefined}
                     className="border border-leather-500 shadow-lg" 
                   />
                </div>
            </Dropdown>
          </div>
        </Header>

        {breadcrumb && breadcrumb.moduleTitle && (
          <div className="sticky top-16 z-[900] bg-white/90 dark:bg-dark-surface/90 backdrop-blur border-b border-gray-200 dark:border-dark-border px-2 md:px-4 py-2 mb-3">
            <div className="flex items-center gap-1 text-xs md:text-sm text-gray-500 whitespace-nowrap overflow-x-auto no-scrollbar">
              <button onClick={() => navigate('/')} className="flex items-center gap-1 hover:text-leather-600">
                <HomeOutlined /> خانه
              </button>
              <span className="px-1 text-gray-300">/</span>
              {breadcrumb.moduleId ? (
                <button onClick={() => navigate(`/${breadcrumb.moduleId}`)} className="hover:text-leather-600">
                  {breadcrumb.moduleTitle}
                </button>
              ) : (
                <span>{breadcrumb.moduleTitle}</span>
              )}
              {breadcrumb.recordName && (
                <>
                  <span className="px-1 text-gray-700">/</span>
                  <span className="text-gray-700 dark:text-gray-200 truncate max-w-[160px] md:max-w-[320px]">{String(breadcrumb.recordName).trim()}</span>
                </>
              )}
            </div>
          </div>
        )}

        <Content
          className="layout-main-scroll relative flex-1 overflow-y-auto overflow-x-hidden"
          style={isMobile && !isKeyboardVisible ? { paddingBottom: 'calc(var(--app-mobile-footer-height, 64px) + 32px + env(safe-area-inset-bottom, 0px))' } : undefined}
        >
          {children}
        </Content>

        {!isKeyboardVisible && rolePermissionsReady && (
          <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/95 dark:bg-dark-surface/95 backdrop-blur-xl border-t border-gray-200 dark:border-dark-border rounded-t-2xl flex items-center justify-around z-[1000] shadow-2xl transition-colors pb-[env(safe-area-inset-bottom)]">
             {mobileNavItems.map((item) => {
               const isActive = location.pathname === item.key;
               if (item.isCenter) {
                 return (
                   <div key={item.key} onClick={() => navigate(item.key)} className="relative -top-5 bg-leather-500 w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl border-4 border-gray-100 dark:border-dark-bg active:scale-90 transition-all">
                      <HomeOutlined className="text-white text-2xl" />
                   </div>
                 );
               }
               return (
                 <div 
                   key={item.key} 
                   onClick={() => item.isMenu ? toggleSidebar() : navigate(item.key)} 
                   className={`flex flex-col items-center gap-1 w-12 cursor-pointer ${isActive ? 'text-leather-500' : 'text-gray-400 dark:text-gray-500'}`}
                 >
                    <div className="text-xl">{item.icon}</div>
                    <span className="text-[8px] font-black uppercase">{item.label}</span>
                 </div>
               );
             })}
          </div>
        )}
      </AntLayout>
    </AntLayout>
  );
};

export default Layout;
