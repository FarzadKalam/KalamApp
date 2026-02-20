import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Layout as AntLayout, Menu, Button, Avatar, Dropdown, message, Modal, Input, Spin } from 'antd';
import type { InputRef } from 'antd';
import { 
  DashboardOutlined, 
  SkinOutlined, 
  ExperimentOutlined, 
  ShopOutlined, 
  TeamOutlined, 
  SettingOutlined,
  SearchOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  HomeOutlined,
  BankOutlined,
  FileTextOutlined,
  CheckSquareOutlined,
  GoldOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient'; // ðŸ‘ˆ Ø§ÛŒÙ…Ù¾ÙˆØ±Øª Ø³ÙˆÙ¾Ø§Ø¨ÛŒØ³
import { MODULES } from '../moduleRegistry';
import QrScanPopover from './QrScanPopover';
import NotificationsPopover from './NotificationsPopover';
import { getRecordTitle } from '../utils/recordTitle';

const { Header, Sider, Content } = AntLayout;

interface LayoutProps {
  children: React.ReactNode;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, isDarkMode }) => {
  const [collapsed, setCollapsed] = useState(true);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [currentUser, setCurrentUser] = useState<any>(null); // Ø¨Ø±Ø§ÛŒ Ù†Ù…Ø§ÛŒØ´ Ø¢ÙˆØ§ØªØ§Ø± ÙˆØ§Ù‚Ø¹ÛŒ
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [breadcrumb, setBreadcrumb] = useState<{ moduleTitle?: string; moduleId?: string; recordName?: string } | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ moduleId: string; moduleTitle: string; items: any[] }>>([]);
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
      title: 'Ø®Ø±ÙˆØ¬ Ø§Ø² Ø­Ø³Ø§Ø¨ Ú©Ø§Ø±Ø¨Ø±ÛŒ',
      icon: <ExclamationCircleOutlined />,
      content: 'Ø¢ÛŒØ§ Ù…Ø·Ù…Ø¦Ù† Ù‡Ø³ØªÛŒØ¯ Ú©Ù‡ Ù…ÛŒâ€ŒØ®ÙˆØ§Ù‡ÛŒØ¯ Ø®Ø§Ø±Ø¬ Ø´ÙˆÛŒØ¯ØŸ',
      okText: 'Ø¨Ù„Ù‡ØŒ Ø®Ø±ÙˆØ¬',
      cancelText: 'Ø§Ù†ØµØ±Ø§Ù',
      okType: 'danger',
      onOk: async () => {
        try {
          const { error } = await supabase.auth.signOut();
          if (error) throw error;
          navigate('/login');
          message.success('Ø¨Ø§ Ù…ÙˆÙÙ‚ÛŒØª Ø®Ø§Ø±Ø¬ Ø´Ø¯ÛŒØ¯');
        } catch (error) {
          message.error('Ø®Ø·Ø§ Ø¯Ø± Ø®Ø±ÙˆØ¬ Ø§Ø² Ø³ÛŒØ³ØªÙ…');
        }
      },
    });
  };

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: 'Ø¯Ø§Ø´Ø¨ÙˆØ±Ø¯' },
    { key: '/products', icon: <SkinOutlined />, label: 'Ù…Ø­ØµÙˆÙ„Ø§Øª' },
    { 
      key: 'warehouses', 
      icon: <GoldOutlined />, 
      label: 'Ø§Ù†Ø¨Ø§Ø±',
      children: [
        { key: '/warehouses', label: 'Ø§Ù†Ø¨Ø§Ø±Ù‡Ø§' },
        { key: '/shelves', label: 'Ù‚ÙØ³Ù‡â€ŒÙ‡Ø§' },
        { key: '/stock_transfers', label: 'ØªØ±Ø¯Ø¯ Ú©Ø§Ù„Ø§Ù‡Ø§' }
      ]
    },
    { 
        key: 'production', 
        icon: <ExperimentOutlined />, 
        label: 'ØªÙˆÙ„ÛŒØ¯',
        children: [
            { key: '/production_boms', label: 'Ø´Ù†Ø§Ø³Ù†Ø§Ù…Ù‡â€ŒÙ‡Ø§ÛŒ ØªÙˆÙ„ÛŒØ¯ (BOM)' },
            { key: '/production_orders', label: 'Ø³ÙØ§Ø±Ø´Ø§Øª ØªÙˆÙ„ÛŒØ¯' },
        ] 
    },
    { key: '/suppliers', icon: <BankOutlined />, label: 'ØªØ§Ù…ÛŒÙ† Ú©Ù†Ù†Ø¯Ú¯Ø§Ù†' },
    {
      key: 'invoices',
      icon: <FileTextOutlined />,
      label: 'ÙØ§Ú©ØªÙˆØ±Ù‡Ø§',
      children: [
        { key: '/invoices', label: 'ÙØ§Ú©ØªÙˆØ±Ù‡Ø§ÛŒ ÙØ±ÙˆØ´' },
        { key: '/purchase_invoices', label: 'ÙØ§Ú©ØªÙˆØ±Ù‡Ø§ÛŒ Ø®Ø±ÛŒØ¯' },
      ]
    },
    { key: '/tasks', icon: <CheckSquareOutlined />, label: 'ÙˆØ¸Ø§ÛŒÙ' },
    { key: '/customers', icon: <ShopOutlined />, label: 'Ù…Ø´ØªØ±ÛŒØ§Ù†' },
    { key: '/hr', icon: <TeamOutlined />, label: 'Ù…Ù†Ø§Ø¨Ø¹ Ø§Ù†Ø³Ø§Ù†ÛŒ' },
    { key: '/settings', icon: <SettingOutlined />, label: 'ØªÙ†Ø¸ÛŒÙ…Ø§Øª' },
    
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
        label: 'Ù¾Ø±ÙˆÙØ§ÛŒÙ„ Ú©Ø§Ø±Ø¨Ø±ÛŒ',
        icon: <UserOutlined />,
        onClick: () => navigate('/profile'), // Ù‡Ø¯Ø§ÛŒØª Ø¨Ù‡ Ù¾Ø±ÙˆÙØ§ÛŒÙ„
      },
      { type: 'divider' as const },
      { 
        key: 'logout', 
        label: 'Ø®Ø±ÙˆØ¬', 
        icon: <LogoutOutlined />, 
        danger: true,
        onClick: handleLogout // Ø§ØªØµØ§Ù„ ØªØ§Ø¨Ø¹ Ø®Ø±ÙˆØ¬
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
    { key: '/products', icon: <SkinOutlined />, label: 'Ù…Ø­ØµÙˆÙ„Ø§Øª' },
    { key: '/production_orders', icon: <CheckSquareOutlined />, label: 'ØªÙˆÙ„ÛŒØ¯' },
    { key: '/', icon: <HomeOutlined />, label: 'Ø®Ø§Ù†Ù‡', isCenter: true },
    { key: '/invoices', icon: <FileTextOutlined />, label: 'ÙØ§Ú©ØªÙˆØ±Ù‡Ø§' },
    { key: 'more', icon: <MenuFoldOutlined />, label: 'Ø¨ÛŒØ´ØªØ±', isMenu: true },
  ];

  const toggleSidebar = () => {
    setCollapsed((prev) => !prev);
  };

  return (
    <AntLayout className="min-h-screen bg-gray-100 dark:bg-[#141414] transition-colors duration-300">
      
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
        className={`app-main-sider border-l border-gray-200 dark:border-gray-800 shadow-2xl transition-all duration-300 z-[1100] ${isMobile && collapsed ? 'mobile-collapsed !hidden w-0 !min-w-0 !max-w-0 overflow-hidden' : ''}`}
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
        <div className="h-16 flex items-center justify-center border-b border-gray-200 dark:border-gray-800 overflow-hidden px-4 sticky top-0 bg-inherit z-10">
          <div className={`transition-all duration-300 font-black text-lg text-leather-500 tracking-tighter whitespace-nowrap ${collapsed ? 'opacity-0 w-0 hidden' : 'opacity-100'}`}>
            MEHRBANOO <span className="text-gray-800 dark:text-white">LEATHER</span>
          </div>
          {collapsed && !isMobile && <div className="text-leather-500 font-black text-2xl absolute">B</div>}
        </div>

        <div style={{ height: 'calc(100vh - 128px)', overflowY: 'auto' }}>
            <Menu
            theme={isDarkMode ? 'dark' : 'light'}
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => { 
                navigate(key); 
                if (isMobile) setCollapsed(true); 
            }} 
            className="mt-4 border-none bg-transparent font-medium"
            />
        </div>

        {!isMobile && (
            <div className="absolute bottom-0 w-full h-16 border-t border-gray-200 dark:border-gray-800 flex items-center justify-center bg-inherit">
                <Button 
                    type="text"
                    icon={collapsed ? <MenuUnfoldOutlined className="text-xl" /> : <MenuFoldOutlined className="text-xl" />}
                    onClick={toggleSidebar}
                    className="w-full h-full text-gray-500 dark:text-gray-400 hover:text-leather-500 hover:bg-gray-50 dark:hover:bg-white/5 rounded-none transition-all"
                />
            </div>
        )}
      </Sider>

      <AntLayout 
        className="bg-gray-100 dark:bg-[#141414] transition-all duration-300 min-h-screen flex flex-col"
        style={{ 
          paddingRight: isMobile ? 0 : (collapsed ? 80 : 260), 
          width: '100%' 
        }}
      >
        <Header 
          className="sticky top-0 z-[1000] px-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 h-16 w-full transition-colors duration-300"
          style={{ 
            backdropFilter: 'blur(20px)', 
            backgroundColor: isDarkMode ? 'rgba(20, 20, 20, 0.8)' : 'rgba(255, 255, 255, 0.8)',
          }}
        >
          <div className="relative flex items-center gap-4" ref={searchBoxRef}>          
            <div className="flex items-center bg-gray-100 dark:bg-[#1a1a1a] rounded-xl px-3 py-1.5 border border-gray-200 dark:border-gray-800 w-48 sm:w-72 transition-colors">
              <SearchOutlined className="text-gray-400" />
              <Input
                ref={searchRef}
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Ø¬Ø³ØªØ¬Ùˆ Ø¯Ø± Ù‡Ù…Ù‡ Ø¬Ø§..."
                className="bg-transparent border-none outline-none text-xs text-gray-700 dark:text-gray-200 w-full mr-2 placeholder-gray-400"
                bordered={false}
              />
            </div>

            {(searchLoading || searchResults.length > 0) && globalSearch.trim() && (
              <div className="absolute top-12 right-0 z-[1200] w-72 sm:w-[420px] max-h-[60vh] overflow-auto rounded-b-2xl rounded-t-none border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1a1a1a] shadow-2xl p-1.5">
                {searchLoading && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 p-2">
                    <Spin size="small" /> Ø¯Ø± Ø­Ø§Ù„ Ø¬Ø³ØªØ¬Ùˆ...
                  </div>
                )}
                {!searchLoading && searchResults.length === 0 && (
                  <div className="text-xs text-gray-400 p-2">Ù†ØªÛŒØ¬Ù‡â€ŒØ§ÛŒ ÛŒØ§ÙØª Ù†Ø´Ø¯</div>
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
            <QrScanPopover
              label=""
              buttonProps={{ type: 'text', shape: 'circle' }}
              buttonClassName="text-gray-500 dark:text-gray-400 hover:text-leather-500"
              onScan={({ moduleId, recordId }) => {
                if (moduleId && recordId) {
                  navigate(`/${moduleId}/${recordId}`);
                  return;
                }
                message.warning('Ú©Ø¯ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª');
              }}
            />
            <div className="w-[1px] h-6 bg-gray-300 dark:bg-gray-700 mx-1"></div>
            <NotificationsPopover isMobile={isMobile} />
            {/* Ø§ØµÙ„Ø§Ø­: Ù‚Ø±Ø§Ø± Ø¯Ø§Ø¯Ù† Ø¢ÙˆØ§ØªØ§Ø± Ø¯Ø± div Ø¨Ø±Ø§ÛŒ Ø±ÙØ¹ ÙˆØ§Ø±Ù†ÛŒÙ†Ú¯ */}
            <Dropdown menu={userMenu} placement="bottomLeft" trigger={['click']}>
                <div className="cursor-pointer transition-transform hover:scale-105">
                   {/* Ø§Ø³ØªÙØ§Ø¯Ù‡ Ø§Ø² Ù…ØªØ§Ø¯ÛŒØªØ§ÛŒ Ú©Ø§Ø±Ø¨Ø± Ù„Ø§Ú¯ÛŒÙ† Ø´Ø¯Ù‡ Ø¨Ø±Ø§ÛŒ Ø¢ÙˆØ§ØªØ§Ø± */}
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
          <div className="sticky top-16 z-[900] bg-white/90 dark:bg-[#1a1a1a]/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 px-2 md:px-4 py-2 mb-3">
            <div className="flex items-center gap-1 text-xs md:text-sm text-gray-500 whitespace-nowrap overflow-x-auto no-scrollbar">
              <button onClick={() => navigate('/')} className="flex items-center gap-1 hover:text-leather-600">
                <HomeOutlined /> Ø®Ø§Ù†Ù‡
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
          <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/95 dark:bg-[#1a1a1a]/95 backdrop-blur-xl border-t border-gray-200 dark:border-white/5 rounded-t-2xl flex items-center justify-around z-[1000] shadow-2xl transition-colors pb-[env(safe-area-inset-bottom)]">
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

