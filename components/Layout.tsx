import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Layout as AntLayout, Menu, Button, Avatar, Dropdown, message, Modal, Input, Spin } from 'antd';
import type { InputRef } from 'antd';
import { 
  DashboardOutlined, 
  SkinOutlined, 
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
  FileTextOutlined,
  CheckSquareOutlined,
  ExclamationCircleOutlined,
  MoonOutlined,
  ProjectOutlined,
  NodeIndexOutlined,
  SunOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import QrScanPopover from './QrScanPopover';
import NotificationsPopover from './NotificationsPopover';
import { getRecordTitle } from '../utils/recordTitle';
import {
  ACCOUNTING_PERMISSION_KEY,
  fetchCurrentUserRolePermissions,
  type PermissionMap,
} from '../utils/permissions';

const { Header, Sider, Content } = AntLayout;

interface LayoutProps {
  children: React.ReactNode;
  isDarkMode: boolean;
  toggleTheme: () => void;
  brandShortName: string;
}

const Layout: React.FC<LayoutProps> = ({ children, isDarkMode, toggleTheme, brandShortName }) => {
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
  const searchRef = useRef<InputRef>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
      if (user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .eq('id', user.id)
          .maybeSingle();
        setCurrentUserProfile(profile || null);

        const rolePerms = await fetchCurrentUserRolePermissions(supabase);
        setRolePermissions(rolePerms || {});
      }
    };
    getUser();

    const handleResize = () => {
      const width = window.innerWidth;
      const mobile = width < 768;
      
      setIsMobile(mobile);
      setIsKeyboardVisible(window.innerHeight < 500);
      
      if (mobile) {
        setCollapsed(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const canViewModule = (moduleId: string) => rolePermissions?.[moduleId]?.view !== false;
  const canViewAccountingDashboard = rolePermissions?.[ACCOUNTING_PERMISSION_KEY]?.view !== false;

  // Collapse sidebar on route change
  useEffect(() => {
    if (isMobile) {
      setCollapsed(true);
      return;
    }
    setCollapsed(location.pathname !== '/');
  }, [location.pathname, isMobile]);

  const handleLogout = () => {
    Modal.confirm({
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
          message.success('با موفقیت خارج شدید');
        } catch (error) {
          message.error('خطا در خروج از سیستم');
        }
      },
    });
  };

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: 'داشبورد' },
    {
      key: 'resources',
      icon: <SkinOutlined />,
      label: 'منابع',
      children: [
        { key: '/products', label: 'کالاها و خدمات' },
        { key: '/customers', label: 'مشتریان' },
        { key: '/suppliers', label: 'تامین کنندگان' },
        { key: '/warehouses', label: 'انبارها' },
        { key: '/ooh_ads', label: 'تبلیغات محیطی', disabled: true },
      ]
    },
    {
      key: 'projects',
      icon: <ProjectOutlined />,
      label: 'پروژه‌ها',
      children: [
        { key: '/projects', label: 'پروژه‌ها (فرآیندمحور)' },
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
        { key: '/cash_bank', label: 'نقد و بانک', disabled: true },
      ]
    },
    {
      key: 'accounting',
      icon: <BankOutlined />,
      label: 'حسابداری',
      children: [
        { key: '/accounting', label: 'داشبورد حسابداری', disabled: !canViewAccountingDashboard },
        { key: '/journal_entries', label: 'اسناد حسابداری', disabled: !canViewModule('journal_entries') },
        { key: '/chart_of_accounts', label: 'کدینگ حساب ها', disabled: !canViewModule('chart_of_accounts') },
        { key: '/cheques', label: 'چک ها', disabled: !canViewModule('cheques') },
        { key: '/fiscal_years', label: 'سال های مالی', disabled: !canViewModule('fiscal_years') },
        { key: '/accounting_event_rules', label: 'قواعد صدور سند', disabled: !canViewModule('accounting_event_rules') },
        { key: '/cost_centers', label: 'مراکز هزینه', disabled: !canViewModule('cost_centers') },
        { key: '/cash_boxes', label: 'صندوق ها', disabled: !canViewModule('cash_boxes') },
        { key: '/bank_accounts', label: 'حساب های بانکی', disabled: !canViewModule('bank_accounts') },
      ]
    },
    {
      key: 'hr',
      icon: <TeamOutlined />,
      label: 'منابع انسانی',
      children: [
        { key: '/tasks', label: 'وظایف' },
        { key: '/hr', label: 'عملکرد کارکنان' },
      ]
    },
    {
      key: 'tools',
      icon: <NodeIndexOutlined />,
      label: 'ابزارها',
      children: [
        {
          key: 'tools_processes',
          label: 'فرآیندها',
          children: [
            { key: '/process_templates', label: 'الگوهای فرآیند' },
            { key: '/process_runs', label: 'اجرای فرآیندها' },
          ],
        },
        { key: '/gallery', label: 'گالری فایل‌ها' },
      ]
    },
    { key: '/settings', icon: <SettingOutlined />, label: 'تنظیمات' },
    
  ];

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

  type MobileNavItem = {
    key: string;
    icon: React.ReactNode;
    label: string;
    isCenter?: boolean;
    isMenu?: boolean;
  };

  const mobileNavItems: MobileNavItem[] = [
    { key: '/products', icon: <SkinOutlined />, label: 'کالاها' },
    { key: '/production_orders', icon: <CheckSquareOutlined />, label: 'تولید' },
    { key: '/', icon: <HomeOutlined />, label: 'خانه', isCenter: true },
    { key: '/invoices', icon: <FileTextOutlined />, label: 'فاکتورها' },
    { key: 'more', icon: <MenuFoldOutlined />, label: 'بیشتر', isMenu: true },
  ];

  const toggleSidebar = () => {
    setCollapsed((prev) => !prev);
  };

  return (
    <AntLayout className="min-h-screen bg-gray-100 dark:bg-dark-bg transition-colors duration-300">
      
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
          height: '100vh', 
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

        <div style={{ height: 'calc(100vh - 64px)', overflowY: 'auto' }}>
            <Menu
            theme={isDarkMode ? 'dark' : 'light'}
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => { 
                if (typeof key === 'string' && key.startsWith('/')) {
                  navigate(key);
                }
                if (isMobile) setCollapsed(true); 
            }} 
            className="mt-4 border-none bg-transparent font-medium"
            />
        </div>
      </Sider>

      <AntLayout 
        className="bg-gray-100 dark:bg-dark-bg transition-all duration-300 min-h-screen flex flex-col"
        style={{ 
          paddingRight: isMobile ? 0 : (collapsed ? 80 : 260), 
          width: '100%' 
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
                bordered={false}
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
            <QrScanPopover
              label=""
              buttonProps={{ type: 'text', shape: 'circle' }}
              buttonClassName="text-gray-500 dark:text-gray-400 hover:text-leather-500"
              onScan={({ moduleId, recordId }) => {
                if (moduleId && recordId) {
                  navigate(`/${moduleId}/${recordId}`);
                  return;
                }
                message.warning('کد معتبر نیست');
              }}
            />
            <div className="w-[1px] h-6 bg-gray-300 dark:bg-gray-700 mx-1"></div>
            <NotificationsPopover isMobile={isMobile} />
            <Dropdown menu={userMenu} placement="bottomLeft" trigger={['click']}>
                <div className="cursor-pointer transition-transform hover:scale-105">
                   <Avatar 
                     size="small" 
                     src={currentUserProfile?.avatar_url || currentUser?.user_metadata?.avatar_url || "https://i.pravatar.cc/150?u=a1"} 
                     className="border border-leather-500 shadow-lg" 
                   >
                     {(currentUserProfile?.full_name || currentUser?.email || '').toString().trim()[0]?.toUpperCase()}
                   </Avatar>
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

        <Content className={`relative flex-1 ${isMobile && !isKeyboardVisible ? 'pb-20' : ''}`}>
          {children}
        </Content>

        {!isKeyboardVisible && (
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

