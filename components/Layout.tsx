import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Layout as AntLayout, Menu, Button, Dropdown, App, Input, Spin, Popconfirm, Tooltip, Badge } from 'antd';
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
  DollarOutlined,
  ToolOutlined,
  ReloadOutlined,
  ArrowLeftOutlined,
  CloudServerOutlined,
  MessageOutlined,
  BellOutlined,
  ReadOutlined,
  GiftOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { signOutLocalSession } from '../utils/authSession';
import { MODULES } from '../moduleRegistry';
import AppVersionUpdateBanner from './AppVersionUpdateBanner';
import {
  ACCOUNTING_PERMISSION_KEY,
  CUSTOMER_CLUB_PERMISSION_KEY,
  REPORTS_PERMISSION_KEY,
  SETTINGS_PERMISSION_KEY,
  SAAS_ADMIN_PERMISSION_KEY,
  resolveCommunicationsPermissions,
  resolveFilesAccessPermissions,
  resolvePreferredRoleModuleIds,
  type PermissionMap,
} from '../utils/permissions';
import { CUSTOMER_CLUB_FEATURE } from '../utils/customerClub';
import { hasCurrentOrgPlanFeature } from '../utils/saasPlanFeatures';
import { fetchSessionBootstrap } from '../utils/sessionCache';
import { RECYCLE_BIN_ROUTE } from '../utils/recycleBin';
import {
  buildGlobalSearchModules,
  isGlobalSearchQueryReady,
  mergeGlobalSearchGroups,
  searchGlobalRecords,
  splitGlobalSearchModulesByPriority,
  type GlobalSearchGroup,
} from '../utils/globalSearch';
import {
  clearCurrentOrgDemoData,
  getCurrentOrgDemoSeedStatus,
  getDemoDataAdminErrorMessage,
} from '../utils/demoDataAdmin';
import {
  getOrgSaasStatus,
  requestTrialRenewal,
  resolveTrialDaysLeft,
} from '../utils/orgSaasStatus';
import { resolveHrDashboardHref } from '../utils/hrFilters';
import ProfileAvatar from './common/ProfileAvatar';
import { PROFILE_AVATAR_UPDATED_EVENT, type ProfileAvatarUpdatedDetail } from '../utils/profileAvatarEvents';
import useUserAnnouncements from '../hooks/useUserAnnouncements';
import UserAnnouncementsBanner from './announcements/UserAnnouncementsBanner';
import UserAnnouncementsPopupHost from './announcements/UserAnnouncementsPopupHost';
import AiAssistantLauncher from './communications/AiAssistantLauncher';
import { toPersianNumber } from '../utils/persianNumberFormatter';
import AiSparkleIcon from './ai/AiSparkleIcon';
import { useNotificationRuntime } from './notifications/NotificationRuntimeProvider';

const { Header, Sider, Content } = AntLayout;
const NotificationsPopover = React.lazy(() => import('./NotificationsPopover'));
const GlobalTaskProcessModalHost = React.lazy(() => import('./tasks/GlobalTaskProcessModalHost'));
const GoalProgressSlider = React.lazy(() => import('./goals/GoalProgressSlider'));

interface LayoutProps {
  children: React.ReactNode;
  isDarkMode: boolean;
  toggleTheme: () => void;
  brandShortName: string;
  preloadRoute?: (href: string) => Promise<unknown> | void;
}

const Layout: React.FC<LayoutProps> = ({ children, isDarkMode, toggleTheme, brandShortName, preloadRoute }) => {
  const notificationRuntime = useNotificationRuntime();
  const { message: messageApi, modal } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const initialIsMobile = typeof window !== 'undefined' ? window.innerWidth < 768 : false;
  const [collapsed, setCollapsed] = useState(() => initialIsMobile || location.pathname !== '/');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(initialIsMobile);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [resolvedOrgId, setResolvedOrgId] = useState<string | null | undefined>(undefined);
  const [breadcrumb, setBreadcrumb] = useState<{ moduleTitle?: string; moduleId?: string; recordName?: string } | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<GlobalSearchGroup[]>([]);
  const [searchTouched, setSearchTouched] = useState(false);
  const [refreshingPage, setRefreshingPage] = useState(false);
  const [isDemoOrg, setIsDemoOrg] = useState(false);
  const [hasDemoBatch, setHasDemoBatch] = useState(false);
  const [clearingDemoData, setClearingDemoData] = useState(false);
  const [orgTrialDaysLeft, setOrgTrialDaysLeft] = useState<number | null>(null);
  const [orgIsReadonly, setOrgIsReadonly] = useState(false);
  const [orgTrialEndsAt, setOrgTrialEndsAt] = useState<string | null>(null);
  const [renewalRequesting, setRenewalRequesting] = useState(false);
  const [rolePermissions, setRolePermissions] = useState<PermissionMap>({});
  const [rolePermissionsReady, setRolePermissionsReady] = useState(false);
  const [customerClubFeatureEnabled, setCustomerClubFeatureEnabled] = useState(true);
  const [alertsDrawerMounted, setAlertsDrawerMounted] = useState(false);
  const [alertsDrawerOpen, setAlertsDrawerOpen] = useState(false);
  const [sessionBootstrapError, setSessionBootstrapError] = useState<any>(null);
  const [openMenuKeys, setOpenMenuKeys] = useState<string[]>([]);
  const searchRef = useRef<InputRef>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const searchRequestRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);
  const wasMobileViewportRef = useRef(initialIsMobile);
  const previousPathnameRef = useRef(location.pathname);
  const sidebarNavigationRef = useRef('');
  const latestNavigationStateRef = useRef({
    pathname: location.pathname,
    search: location.search || '',
    isMobile: initialIsMobile,
  });
  latestNavigationStateRef.current = {
    pathname: location.pathname,
    search: location.search || '',
    isMobile,
  };

  const applySessionBootstrapSnapshot = useCallback((snapshot: any, isMounted = true) => {
    if (!isMounted) return;
    const user = snapshot.user;
    setCurrentUser(user);
    setSessionBootstrapError(snapshot.bootstrapError || null);
    if (user?.id) {
      setCurrentUserProfile(snapshot.profile || null);
      setResolvedOrgId(snapshot.bootstrapError ? undefined : (snapshot.orgId || null));
      setRolePermissions((snapshot.permissions || {}) as PermissionMap);
    } else {
      setCurrentUserProfile(null);
      setResolvedOrgId(null);
      setRolePermissions({});
    }
  }, []);

  const retrySessionBootstrap = useCallback(async () => {
    setRolePermissionsReady(false);
    try {
      const snapshot = await fetchSessionBootstrap(supabase, { force: true });
      applySessionBootstrapSnapshot(snapshot);
    } finally {
      setRolePermissionsReady(true);
    }
  }, [applySessionBootstrapSnapshot]);

  useEffect(() => {
    if (!rolePermissionsReady || !currentUser?.id) {
      setCustomerClubFeatureEnabled(true);
      return;
    }
    let active = true;
    void hasCurrentOrgPlanFeature(CUSTOMER_CLUB_FEATURE, { defaultEnabled: true })
      .then((enabled) => {
        if (active) setCustomerClubFeatureEnabled(enabled);
      })
      .catch(() => {
        if (active) setCustomerClubFeatureEnabled(true);
      });
    return () => {
      active = false;
    };
  }, [currentUser?.id, rolePermissionsReady]);

  useEffect(() => {
    document.documentElement.classList.add('kalam-app-shell-lock');
    document.body.classList.add('kalam-app-shell-lock');

    return () => {
      document.documentElement.classList.remove('kalam-app-shell-lock');
      document.body.classList.remove('kalam-app-shell-lock');
    };
  }, []);

  const preloadRouteNow = useCallback((href: string) => {
    if (!href || !preloadRoute) return Promise.resolve();
    return Promise.resolve(preloadRoute(href)).catch(() => undefined);
  }, [preloadRoute]);

  const resolveSidebarHref = useCallback((href: string) => {
    if (href === '/hr') return resolveHrDashboardHref('/hr');
    return href;
  }, []);

  const scheduleRoutePreload = useCallback((href: string) => {
    const resolvedHref = resolveSidebarHref(href);
    if (!resolvedHref || !preloadRoute) return;
    const requestIdle = (window as any).requestIdleCallback as ((callback: () => void, options?: { timeout?: number }) => number) | undefined;
    if (requestIdle) {
      requestIdle(() => { void preloadRouteNow(resolvedHref); }, { timeout: 800 });
      return;
    }
    window.setTimeout(() => { void preloadRouteNow(resolvedHref); }, 80);
  }, [preloadRoute, preloadRouteNow, resolveSidebarHref]);

  const handleSidebarNavigate = useCallback(async (href: string) => {
    const resolvedHref = resolveSidebarHref(href);
    if (!resolvedHref) return;
    const latestNavigationState = latestNavigationStateRef.current;
    const targetPath = String(resolvedHref).split(/[?#]/)[0] || resolvedHref;
    if (targetPath === '/ai') {
      if (latestNavigationState.isMobile) setCollapsed(true);
      navigate('/ai', { state: { forceNewThread: true, aiEntrySource: 'layout' } });
      window.setTimeout(() => { sidebarNavigationRef.current = ''; }, 350);
      return;
    }
    if (latestNavigationState.pathname === targetPath && latestNavigationState.search === (resolvedHref.includes('?') ? `?${resolvedHref.split('?')[1].split('#')[0]}` : '')) {
      if (latestNavigationState.isMobile) setCollapsed(true);
      return;
    }
    if (sidebarNavigationRef.current === resolvedHref) return;
    sidebarNavigationRef.current = resolvedHref;
    if (latestNavigationState.isMobile) setCollapsed(true);
    if (latestNavigationState.isMobile && preloadRoute) {
      await Promise.race([
        preloadRouteNow(resolvedHref),
        new Promise((resolve) => window.setTimeout(resolve, 700)),
      ]);
      if (sidebarNavigationRef.current !== resolvedHref) return;
    }
    navigate(resolvedHref);
    window.setTimeout(() => {
      if (sidebarNavigationRef.current === resolvedHref) {
        sidebarNavigationRef.current = '';
      }
    }, 350);
  }, [navigate, preloadRoute, preloadRouteNow, resolveSidebarHref]);

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
        onPointerEnter={(event) => {
          if (!disabled && event.pointerType !== 'touch') scheduleRoutePreload(href);
        }}
        onFocus={() => !disabled && scheduleRoutePreload(href)}
        onClick={(event) => handleSidebarLinkClick(event, href, disabled)}
        onAuxClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()}
      >
        <span className="sidebar-menu-link__text">{label}</span>
      </a>
    );
  };

  const buildSidebarIcon = (icon: React.ReactNode, href?: string, disabled?: boolean) => {
    if (!href || !icon) return icon;

    return (
      <a
        href={disabled ? undefined : href}
        aria-disabled={disabled || undefined}
        className={`sidebar-menu-icon-link ${disabled ? 'is-disabled' : ''}`}
        onPointerEnter={(event) => {
          if (!disabled && event.pointerType !== 'touch') scheduleRoutePreload(href);
        }}
        onFocus={() => !disabled && scheduleRoutePreload(href)}
        onClick={(event) => handleSidebarLinkClick(event, href, disabled)}
        onAuxClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()}
      >
        {icon}
      </a>
    );
  };

  const mapSidebarMenuItems = (items: NonNullable<MenuProps['items']>): MenuProps['items'] =>
    items.map((item) => {
      if (!item || typeof item !== 'object' || !('key' in item)) return item;

      const href = typeof item.key === 'string' && item.key.startsWith('/') ? resolveSidebarHref(item.key) : undefined;
      const label = 'label' in item ? item.label : null;
      const nextItem: any = {
        ...item,
        label: buildSidebarLabel(label, href, Boolean((item as any).disabled)),
        icon: buildSidebarIcon((item as any).icon, href, Boolean((item as any).disabled)),
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
      const visualViewport = window.visualViewport;
      const layoutViewportHeight = window.innerHeight;
      const viewportHeight = visualViewport?.height || layoutViewportHeight;
      const viewportOffsetTop = visualViewport?.offsetTop || 0;
      const keyboardInset = Math.max(
        0,
        layoutViewportHeight - Math.round(viewportHeight + viewportOffsetTop)
      );
      const activeElement = document.activeElement as HTMLElement | null;
      const isTextInputFocused = Boolean(
        activeElement
        && (
          activeElement.tagName === 'INPUT'
          || activeElement.tagName === 'TEXTAREA'
          || activeElement.getAttribute('contenteditable') === 'true'
        )
      );
      const mobileViewport = window.innerWidth < 768;
      const keyboardVisible = mobileViewport && (
        keyboardInset > 120
        || (isTextInputFocused && layoutViewportHeight - viewportHeight > 100)
      );

      const appViewportHeight = keyboardVisible ? viewportHeight : layoutViewportHeight;
      document.documentElement.style.setProperty('--app-viewport-height', `${Math.round(appViewportHeight)}px`);
      document.documentElement.style.setProperty('--app-viewport-offset-top', `${keyboardVisible ? Math.round(viewportOffsetTop) : 0}px`);
      document.documentElement.style.setProperty('--app-keyboard-inset', `${keyboardVisible ? keyboardInset : 0}px`);
      document.documentElement.style.setProperty('--app-mobile-footer-height', keyboardVisible ? '0px' : '64px');
      setIsKeyboardVisible(keyboardVisible);
    };

    const getUser = async () => {
      try {
        const snapshot = await fetchSessionBootstrap(supabase);
        applySessionBootstrapSnapshot(snapshot, isMounted);
      } finally {
        if (isMounted) setRolePermissionsReady(true);
      }
    };
    getUser();

    const handleResize = () => {
      const width = window.innerWidth;
      const mobile = width < 768;
      const wasMobile = wasMobileViewportRef.current;
      wasMobileViewportRef.current = mobile;
      updateViewportVars();

      setIsMobile(mobile);
      
      if (mobile && !wasMobile) {
        setCollapsed(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('scroll', handleResize);
    window.addEventListener('focusin', handleResize);
    window.addEventListener('focusout', handleResize);
    return () => {
      isMounted = false;
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
      window.removeEventListener('focusin', handleResize);
      window.removeEventListener('focusout', handleResize);
    };
  }, [applySessionBootstrapSnapshot]);

  useEffect(() => {
    const orgId = currentUserProfile?.org_id;
    if (!orgId) {
      setIsDemoOrg(false);
      setHasDemoBatch(false);
      setOrgTrialDaysLeft(null);
      setOrgIsReadonly(false);
      setOrgTrialEndsAt(null);
      return;
    }
    let cancelled = false;

    (async () => {
      const saasRes = await getOrgSaasStatus().catch(() => null);
      if (cancelled) return;

      const nextIsDemoOrg = Boolean(saasRes?.is_demo);
      setIsDemoOrg(nextIsDemoOrg);
      setHasDemoBatch(false);
      if (saasRes) {
        setOrgIsReadonly(Boolean(saasRes.is_readonly));
        setOrgTrialEndsAt(saasRes.trial_ends_at ?? null);
        setOrgTrialDaysLeft(resolveTrialDaysLeft(saasRes.trial_ends_at ?? null));
      }

      if (!nextIsDemoOrg) return;

      const seedRes = await getCurrentOrgDemoSeedStatus().catch(() => null);
      if (cancelled) return;
      setHasDemoBatch(Boolean(seedRes?.has_seeded_batch));
    })();
    return () => { cancelled = true; };
  }, [currentUserProfile?.org_id]);

  const handleClearDemoData = useCallback(async () => {
    if (!isDemoOrg) {
      messageApi.warning('حذف داده‌های دمو فقط برای سازمان‌های دمو فعال است.');
      return;
    }
    setClearingDemoData(true);
    try {
      await clearCurrentOrgDemoData();
      setHasDemoBatch(false);
      messageApi.success('داده‌های دمو با موفقیت حذف شد.');
    } catch (err) {
      messageApi.error(getDemoDataAdminErrorMessage(err, 'حذف داده‌های دمو ناموفق بود.'));
    } finally {
      setClearingDemoData(false);
    }
  }, [isDemoOrg, messageApi]);

  const handleRequestRenewal = useCallback(async () => {
    setRenewalRequesting(true);
    try {
      const res = await requestTrialRenewal();
      if (res.success) {
        messageApi.success(res.message);
      } else {
        messageApi.error(res.message);
      }
    } finally {
      setRenewalRequesting(false);
    }
  }, [messageApi]);

  const canViewModule = (moduleId: string) => rolePermissions?.[moduleId]?.view !== false;
  const canViewSettingsRoot = rolePermissions?.[SETTINGS_PERMISSION_KEY]?.view !== false;
  const canViewOrgKnowledge = canViewSettingsRoot && rolePermissions?.[SETTINGS_PERMISSION_KEY]?.fields?.ai_knowledge !== false;
  const saasAdminPermissions = rolePermissions?.[SAAS_ADMIN_PERMISSION_KEY] || {};
  const saasAdminPermissionFields = saasAdminPermissions.fields || {};
  const canViewSaasAdmin = Boolean(
    saasAdminPermissions.view
    || saasAdminPermissions.edit
    || saasAdminPermissionFields.edit_orgs
    || saasAdminPermissionFields.edit_requests
    || saasAdminPermissionFields.edit_user_announcements
    || saasAdminPermissionFields.demo_override
  );
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
  const canViewCustomerClub =
    customerClubFeatureEnabled &&
    rolePermissions?.[CUSTOMER_CLUB_PERMISSION_KEY]?.view !== false;
  const filesAccess = resolveFilesAccessPermissions(rolePermissions);
  const communicationsAccess = resolveCommunicationsPermissions(rolePermissions);
  const {
    headerAnnouncements: userHeaderAnnouncements,
    popupAnnouncements: userPopupAnnouncements,
    dismissAnnouncement: dismissUserAnnouncement,
  } = useUserAnnouncements({
    surface: 'user_panel',
    path: `${location.pathname}${location.search || ''}`,
  });

  useEffect(() => {
    const handleAvatarUpdated = (event: Event) => {
      const detail = (event as CustomEvent<ProfileAvatarUpdatedDetail>).detail;
      const profileId = String(detail?.profileId || '').trim();
      if (!profileId) return;
      setCurrentUserProfile((prev: any) => {
        if (String(prev?.id || '') !== profileId) return prev;
        return {
          ...(prev || {}),
          avatar_url: detail?.avatarUrl || null,
          full_name: detail?.fullName ?? prev?.full_name ?? null,
        };
      });
    };

    window.addEventListener(PROFILE_AVATAR_UPDATED_EVENT, handleAvatarUpdated as EventListener);
    return () => {
      window.removeEventListener(PROFILE_AVATAR_UPDATED_EVENT, handleAvatarUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    const profileId = String(currentUserProfile?.id || currentUser?.id || '').trim();
    if (!profileId) return;

    let isSubscribed = false;
    const channel = supabase
      .channel(`layout-profile-avatar-${profileId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${profileId}` },
        (payload) => {
          const nextProfile = payload.new as Record<string, any>;
          setCurrentUserProfile((prev: any) => ({ ...(prev || {}), ...(nextProfile || {}) }));
        },
      )
      .subscribe((status) => {
        isSubscribed = status === 'SUBSCRIBED';
      });

    return () => {
      if (isSubscribed) {
        void supabase.removeChannel(channel);
        return;
      }
      void channel.unsubscribe();
    };
  }, [currentUser?.id, currentUserProfile?.id]);

  // Keep the sidebar open by default only on the dashboard. Avoid toggling it
  // between non-dashboard pages, which creates a distracting open/close flash.
  useEffect(() => {
    if (isMobile) {
      setCollapsed(true);
      previousPathnameRef.current = location.pathname;
      return;
    }

    if (location.pathname === '/') {
      setCollapsed((prev) => (prev ? false : prev));
    } else if (previousPathnameRef.current === '/') {
      setCollapsed((prev) => (prev ? prev : true));
    }

    previousPathnameRef.current = location.pathname;
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
          await signOutLocalSession();
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
      { key: '/messages', icon: <MessageOutlined />, label: 'پیام‌رسانی', disabled: !communicationsAccess.canUseWorkspace },
      { key: '/ai', icon: <AiSparkleIcon className="h-4 w-4" />, label: 'دستیار هوشمند سازمان', disabled: !communicationsAccess.canUseWorkspace },
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
          { key: '/stock_transfers', label: 'تردد کالاها و حواله‌ها', disabled: !canViewModule('stock_transfers') },
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
        icon: <DollarOutlined />,
        label: 'خرید و فروش',
        children: [
          { key: '/marketing_leads', label: 'بازاریابی' },
          { key: '/personas', label: 'پرسونا', disabled: !canViewModule('personas') },
          { key: '/customer-club', label: 'باشگاه مشتریان', icon: <GiftOutlined />, disabled: !canViewCustomerClub },
          { key: '/invoices', label: 'فاکتورهای فروش' },
          { key: '/purchase_invoices', label: 'فاکتورهای خرید' },
          { key: '/expense_documents', label: 'هزینه‌ها', disabled: !canViewModule('expense_documents') },
          { key: '/assets', label: 'اموال', disabled: !canViewModule('assets') },
          { key: '/sales_return_invoices', label: 'فاکتورهای برگشت از فروش', disabled: !canViewModule('sales_return_invoices') },
          { key: '/purchase_return_invoices', label: 'فاکتورهای برگشت از خرید', disabled: !canViewModule('purchase_return_invoices') },
        ]
      },
      {
        key: 'accounting',
        icon: <BankOutlined />,
        label: 'حسابداری',
        children: [
          { key: '/accounting', label: 'داشبورد حسابداری', disabled: !canViewAccountingDashboard },
          { key: '/cash_bank_operations', label: 'نقد و بانک' },
          { key: '/payroll_slips', label: 'فیش‌های حقوقی', disabled: !canViewModule('payroll_slips') },
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
          { key: '/tasks', label: 'فعالیت ها' },
          { key: '/employees', label: 'کارکنان' },
          { key: '/job_descriptions', label: 'شرح شغل‌ها', disabled: !canViewModule('job_descriptions') },
          { key: '/employee_contracts', label: 'قراردادهای کارکنان', disabled: !canViewModule('employee_contracts') },
          { key: '/recruitment_applicants', label: 'متقاضیان استخدام', disabled: !canViewModule('recruitment_applicants') },
          { key: '/attendance_logs', label: 'تردد' },
          { key: '/work_schedules', label: 'برنامه حضور' },
          { key: '/employee_advances', label: 'مساعده‌ها', disabled: !canViewModule('employee_advances') },
          { key: '/leave_requests', label: 'مرخصی‌ها' },
          { key: '/overtime_requests', label: 'اضافه‌کاری‌ها' },
          { key: '/mission_requests', label: 'ماموریت‌ها' },
        ]
      },
      {
        key: 'secretariat',
        icon: <FileTextOutlined />,
        label: 'دبیرخانه',
        children: [
          { key: '/secretariat_documents', label: 'نامه‌ها و مکاتبات', disabled: !canViewModule('secretariat_documents') },
          { key: '/delivery_forms', label: 'فرم‌های تحویل', disabled: !canViewModule('delivery_forms') },
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
          { key: '/voip_call_reports', label: 'گزارش تماس‌های VoIP', disabled: !canViewModule('voip_call_reports') },
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
          { key: '/process-v2-lab', label: 'نمونه کارت‌های فرآیند' },
        ],
      },
      {
        key: 'tools',
        icon: <ToolOutlined />,
        label: 'ابزارها',
        children: [
          { key: '/web_forms', label: 'وب فرم‌ها', disabled: !canViewModule('web_forms') },
          { key: '/surveys', label: 'نظرسنجی‌ها', disabled: !canViewModule('surveys') },
          { key: '/instructions', label: 'دستورالعمل‌ها', disabled: !canViewModule('instructions') },
          { key: '/org-knowledge', icon: <AiSparkleIcon className="h-4 w-4" />, label: 'دانش سازمان', disabled: !canViewOrgKnowledge },
          { key: '/production_orders', label: 'سفارشات تولید' },
          { key: '/gallery', label: 'مدیریت فایل‌ها' },
          { key: RECYCLE_BIN_ROUTE, icon: <DeleteOutlined />, label: 'سطل بازیافت' },
        ]
      },
      ...(canViewSaasAdmin ? [{
        key: 'taze_system',
        icon: <CloudServerOutlined />,
        label: 'تازه سیستم',
        children: [
          { key: '/taze-system', label: 'داشبورد SaaS' },
          { key: '/saas_users', label: 'همه کاربران' },
          { key: '/saas_orgs', label: 'سازمان‌ها' },
          { key: '/saas_demo_requests', label: 'درخواست‌های دمو' },
          { key: '/saas_user_announcements', label: 'اعلانات کاربران' },
          { key: '/taze-system/plans', label: 'پلن‌ها' },
          { key: '/taze-system/api-docs', label: 'مستندات API' },
          { key: '/taze-system/ai-settings', label: 'تنظیمات هوش مصنوعی' },
          { key: '/taze-system/seniority-rates', label: 'نرخ سنوات' },
          {
            key: 'cms_group',
            icon: <ReadOutlined />,
            label: 'مدیریت محتوا',
            children: [
              { key: '/taze-system/landing', label: 'صفحه اصلی سایت' },
              { key: '/cms_pages', label: 'صفحات سایت' },
              { key: '/cms_blog_posts', label: 'پست‌های بلاگ' },
              { key: '/cms_tutorial_posts', label: 'آموزش‌ها' },
              { key: '/cms_tutorial_series', label: 'دوره‌های آموزشی' },
              { key: '/cms_categories', label: 'دسته‌بندی‌ها' },
              { key: '/cms_tags', label: 'برچسب‌ها' },
            ],
          },
        ],
      }] : []),
      { key: '/settings', icon: <SettingOutlined />, label: 'تنظیمات' },
    ];
  }, [canViewAccountingDashboard, canViewAccountingSettings, canViewCustomerClub, canViewOrgKnowledge, canViewReportsHub, canViewSaasAdmin, communicationsAccess.canUseWorkspace, rolePermissions]);

  const visibleRawMenuItems = useMemo<NonNullable<MenuProps['items']>>(() => {
    const canShowMenuKey = (key?: string) => {
      if (!key) return true;
      switch (key) {
        case '/':
          return true;
        case '/accounting':
          return canViewAccountingDashboard;
        case '/cash_bank':
        case '/cash_bank_operations':
          return canViewCashBank;
        case '/accounting/settings':
          return canViewAccountingSettings;
        case '/reports':
          return canViewReportsHub;
        case '/customer-club':
          return canViewCustomerClub;
        case '/messages':
        case '/ai':
          return communicationsAccess.canUseWorkspace;
        case '/gallery':
          return filesAccess.canViewGallery;
        case RECYCLE_BIN_ROUTE:
          return filesAccess.canViewRecycleBin;
        case '/settings':
          return canViewSettingsRoot;
        case '/org-knowledge':
          return canViewOrgKnowledge;
        case '/taze-system':
        case '/saas_users':
        case '/saas_orgs':
        case '/saas_demo_requests':
        case '/saas_user_announcements':
        case '/taze-system/plans':
        case '/taze-system/api-docs':
        case '/taze-system/ai-settings':
        case '/taze-system/seniority-rates':
        case '/cms_blog_posts':
        case '/cms_tutorial_posts':
        case '/cms_tutorial_series':
        case '/cms_categories':
        case '/cms_tags':
          return canViewSaasAdmin;
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
    canViewCustomerClub,
    canViewReportsHub,
    canViewSettingsRoot,
    canViewOrgKnowledge,
    canViewSaasAdmin,
    filesAccess.canViewGallery,
    filesAccess.canViewRecycleBin,
    communicationsAccess.canUseWorkspace,
    rolePermissions,
  ]);

  const menuItems = useMemo<MenuProps['items']>(() => {
    return mapSidebarMenuItems(visibleRawMenuItems);
  }, [location.pathname, location.search, visibleRawMenuItems]);
  const selectedSidebarKey = useMemo(() => {
    if (location.pathname === '/ai' && new URLSearchParams(location.search).get('prototype') === 'omni') {
      return '/ai';
    }
    return location.pathname;
  }, [location.pathname, location.search]);

  const searchableGlobalSearchModules = useMemo(
    () => buildGlobalSearchModules(MODULES, rolePermissions),
    [rolePermissions]
  );
  const globalSearchCacheNamespace = useMemo(
    () => `${String(currentUser?.id || '')}:${JSON.stringify(rolePermissions)}`,
    [currentUser?.id, rolePermissions]
  );
  const prioritizedGlobalSearchModules = useMemo(
    () => splitGlobalSearchModulesByPriority(searchableGlobalSearchModules),
    [searchableGlobalSearchModules]
  );

  useEffect(() => {
    const matchedPath = findMenuPath(rawMenuItems, selectedSidebarKey);
    const parentKeys = matchedPath.slice(0, -1);
    setOpenMenuKeys((prev) => {
      if (prev.length === parentKeys.length && prev.every((key, index) => key === parentKeys[index])) {
        return prev;
      }
      return parentKeys;
    });
  }, [findMenuPath, rawMenuItems, selectedSidebarKey]);

  useEffect(() => {
    const term = globalSearch.trim();
    if (!term || !rolePermissionsReady || !isGlobalSearchQueryReady(term)) {
      searchAbortRef.current?.abort();
      searchAbortRef.current = null;
      searchRequestRef.current += 1;
      setSearchResults([]);
      setSearchLoading(false);
      setSearchTouched(false);
      return;
    }

    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    const controller = new AbortController();
    searchAbortRef.current?.abort();
    searchAbortRef.current = controller;
    const handle = setTimeout(async () => {
      try {
        setSearchLoading(true);
        const fastModules = prioritizedGlobalSearchModules.fastModules.length
          ? prioritizedGlobalSearchModules.fastModules
          : searchableGlobalSearchModules;
        const remainingModules = prioritizedGlobalSearchModules.fastModules.length
          ? prioritizedGlobalSearchModules.remainingModules
          : [];
        const remainingPromise = remainingModules.length
          ? searchGlobalRecords(supabase, MODULES, remainingModules, {
            query: term,
            limitPerModule: 3,
            cacheNamespace: `${globalSearchCacheNamespace}:remaining`,
            signal: controller.signal,
          })
          : Promise.resolve([] as GlobalSearchGroup[]);
        const fastResults = await searchGlobalRecords(supabase, MODULES, fastModules, {
          query: term,
          limitPerModule: 5,
          cacheNamespace: `${globalSearchCacheNamespace}:fast`,
          signal: controller.signal,
        });
        if (searchRequestRef.current !== requestId) return;
        setSearchResults(fastResults);
        setSearchTouched(true);

        if (!remainingModules.length || controller.signal.aborted) return;
        const remainingResults = await remainingPromise;
        if (searchRequestRef.current !== requestId) return;
        setSearchResults(mergeGlobalSearchGroups([...fastResults, ...remainingResults]));
      } catch (err) {
        if (String((err as any)?.name || '') === 'AbortError') return;
        console.warn('Global search failed', err);
        if (searchRequestRef.current === requestId) {
          setSearchResults([]);
          setSearchTouched(true);
        }
      } finally {
        if (searchRequestRef.current === requestId) setSearchLoading(false);
      }
    }, 140);

    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [globalSearch, globalSearchCacheNamespace, prioritizedGlobalSearchModules, rolePermissionsReady, searchableGlobalSearchModules]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!searchBoxRef.current) return;
      if (searchBoxRef.current.contains(event.target as Node)) return;
      searchAbortRef.current?.abort();
      searchAbortRef.current = null;
      searchRequestRef.current += 1;
      setSearchResults([]);
      setSearchTouched(false);
      setSearchLoading(false);
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
        onClick: () => handleSidebarNavigate('/profile'),
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
      secretariat_documents: 'دبیرخانه',
      delivery_forms: 'تحویل',
      expense_documents: 'هزینه',
      assets: 'اموال',
      employee_advances: 'مساعده',
      payroll_slips: 'حقوق',
      employee_contracts: 'قرارداد',
      job_descriptions: 'شرح شغل',
      recruitment_applicants: 'استخدام',
      product_bundles: 'پکیج',
      price_lists: 'قیمت',
      customers: 'مشتری',
      suppliers: 'تامین',
      projects: 'پروژه',
      tasks: 'فعالیت ها',
      employees: 'پرسنل',
      warehouses: 'انبار',
      stock_transfers: 'حواله',
      marketing_leads: 'لیدها',
      process_runs: 'فرآیند',
      process_templates: 'الگوها',
      attendance_logs: 'تردد',
      surveys: 'نظرسنجی',
    };
    const iconMap: Record<string, React.ReactNode> = {
      products: <AppstoreOutlined />,
      product_bundles: <AppstoreOutlined />,
      price_lists: <AppstoreOutlined />,
      production_orders: <CheckSquareOutlined />,
      invoices: <FileTextOutlined />,
      purchase_invoices: <FileTextOutlined />,
      secretariat_documents: <FileTextOutlined />,
      delivery_forms: <FileTextOutlined />,
      expense_documents: <BankOutlined />,
      assets: <BankOutlined />,
      employee_advances: <BankOutlined />,
      payroll_slips: <FileTextOutlined />,
      employee_contracts: <FileTextOutlined />,
      job_descriptions: <FileTextOutlined />,
      recruitment_applicants: <TeamOutlined />,
      customers: <TeamOutlined />,
      suppliers: <TeamOutlined />,
      employees: <TeamOutlined />,
      tasks: <CheckSquareOutlined />,
      projects: <ProjectOutlined />,
      warehouses: <BankOutlined />,
      stock_transfers: <BankOutlined />,
      marketing_leads: <FileTextOutlined />,
      attendance_logs: <CheckSquareOutlined />,
      process_runs: <NodeIndexOutlined />,
      process_templates: <NodeIndexOutlined />,
      surveys: <FileTextOutlined />,
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

  const handlePageRefresh = () => {
    if (refreshingPage) return;
    setRefreshingPage(true);
    window.setTimeout(() => {
      window.location.reload();
    }, 120);
  };

  const activeModuleId = useMemo(() => {
    const firstSegment = location.pathname.split('/').filter(Boolean)[0] || '';
    return firstSegment && MODULES[firstSegment] ? firstSegment : null;
  }, [location.pathname]);
  const headerActionButtonClassName = isMobile
    ? 'text-gray-500 dark:text-gray-300 hover:text-leather-500 !h-8 !w-8 !min-w-0 !p-0'
    : 'text-gray-500 dark:text-gray-300 hover:text-leather-500';

  const openGlobalSearchPage = useCallback(() => {
    const term = globalSearch.trim();
    if (!term) return;
    handleSidebarNavigate(`/search?q=${encodeURIComponent(term)}`);
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setSearchResults([]);
    setSearchTouched(false);
    setSearchLoading(false);
  }, [globalSearch, handleSidebarNavigate]);

  const openSearchResult = useCallback((moduleId: string, recordId: string) => {
    if (!moduleId || !recordId) return;
    handleSidebarNavigate(`/${moduleId}/${recordId}`);
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setGlobalSearch('');
    setSearchResults([]);
    setSearchTouched(false);
    setSearchLoading(false);
  }, [handleSidebarNavigate]);

  const getSearchModuleIcon = (moduleId: string) => {
    if (moduleId === 'customers' || moduleId === 'suppliers' || moduleId === 'employees') return <TeamOutlined />;
    if (moduleId === 'tasks' || moduleId === 'attendance_logs') return <CheckSquareOutlined />;
    if (moduleId === 'projects') return <ProjectOutlined />;
    if (moduleId === 'invoices' || moduleId === 'purchase_invoices' || moduleId === 'secretariat_documents') return <FileTextOutlined />;
    if (moduleId === 'cash_boxes' || moduleId === 'bank_accounts' || moduleId === 'journal_entries') return <BankOutlined />;
    return <AppstoreOutlined />;
  };

  if (rolePermissionsReady && currentUser?.id && sessionBootstrapError) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100dvh',
          gap: 16,
          padding: 24,
          textAlign: 'center',
          direction: 'rtl',
        }}
      >
        <ReloadOutlined style={{ fontSize: 48, color: '#1677ff' }} spin={!rolePermissionsReady} />
        <div style={{ fontSize: 18, fontWeight: 600 }}>اتصال به اطلاعات سازمان کامل نشد</div>
        <div style={{ color: '#666', maxWidth: 380 }}>
          اتصال شبکه یا پاسخ سرور کامل نبود. پس از برقراری اینترنت دوباره تلاش کنید.
        </div>
        <Button
          type="primary"
          icon={<ReloadOutlined />}
          loading={!rolePermissionsReady}
          onClick={retrySessionBootstrap}
        >
          تلاش مجدد
        </Button>
      </div>
    );
  }

  if (rolePermissionsReady && currentUser?.id && resolvedOrgId === null) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100dvh',
          gap: 16,
          padding: 24,
          textAlign: 'center',
          direction: 'rtl',
        }}
      >
        <ExclamationCircleOutlined style={{ fontSize: 48, color: '#faad14' }} />
        <div style={{ fontSize: 18, fontWeight: 600 }}>حساب شما به سازمانی متصل نیست</div>
        <div style={{ color: '#666', maxWidth: 360 }}>
          فرآیند ثبت‌نام یا دریافت دمو برای این حساب کاربری ناقص مانده است.
          لطفاً با پشتیبانی تماس بگیرید.
        </div>
        <Button
          type="primary"
          icon={<LogoutOutlined />}
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.replace('/login');
          }}
        >
          خروج از حساب
        </Button>
      </div>
    );
  }

  return (
    <AntLayout
      className="overflow-hidden bg-gray-100 dark:bg-dark-bg transition-colors duration-300"
      style={{ height: 'var(--app-viewport-height, 100dvh)' }}
    >
      
      {isMobile && !collapsed && (
        <div 
          className="fixed inset-y-0 left-0 z-[1180] bg-black/50 backdrop-blur-sm transition-opacity duration-300"
          style={{ right: 260 }}
          onClick={() => setCollapsed(true)}
        />
      )}

      <Sider 
        trigger={null} 
        collapsible 
        collapsed={collapsed}
        collapsedWidth={isMobile ? 0 : 80}
        zeroWidthTriggerStyle={{ display: 'none' }}
        className={`app-main-sider border-l border-gray-200 dark:border-dark-border shadow-2xl transition-all duration-300 z-[1200] overflow-visible ${isMobile && collapsed ? 'mobile-collapsed !hidden w-0 !min-w-0 !max-w-0 overflow-hidden' : ''}`}
        style={{ 
          height: 'var(--app-viewport-height, 100dvh)',
          position: 'fixed', 
          right: 0, 
          top: 0,
          bottom: 0,
          zIndex: 1200,
          pointerEvents: 'auto',
          touchAction: 'manipulation',
          display: (isMobile && collapsed) ? 'none' : 'block',
          backgroundColor: isDarkMode ? 'rgb(var(--app-dark-surface-rgb))' : undefined,
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
            selectedKeys={[selectedSidebarKey]}
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
        <UserAnnouncementsBanner
          items={userHeaderAnnouncements}
          onDismiss={dismissUserAnnouncement}
        />
        <Header 
          className="sticky top-0 z-[1000] flex h-16 w-full items-center justify-between gap-2 border-b border-gray-200 px-2 sm:px-4 dark:border-dark-border transition-colors duration-300"
          style={{ 
            backdropFilter: 'blur(20px)', 
            backgroundColor: isDarkMode ? 'rgba(23, 28, 48, 0.82)' : 'rgba(255, 255, 255, 0.82)',
          }}
        >
          <div className="relative flex min-w-0 flex-1 items-center" ref={searchBoxRef}>
            <div className="flex h-9 w-full min-w-0 max-w-[360px] items-center rounded-2xl border border-gray-200 bg-white/80 px-2.5 shadow-sm transition-all focus-within:border-leather-400 focus-within:bg-white focus-within:shadow-md sm:h-10 sm:px-3 dark:border-dark-border dark:bg-dark-surface/85 dark:focus-within:border-leather-400">
              <SearchOutlined className="text-gray-400 dark:text-gray-500" />
              <Input
                ref={searchRef}
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                onPressEnter={openGlobalSearchPage}
                placeholder="جستجو در همه جا..."
                className="mr-2 w-full border-none bg-transparent text-[11px] text-gray-700 outline-none placeholder-gray-400 sm:text-xs dark:text-gray-200"
                variant="borderless"
              />
            </div>

            {(searchLoading || searchTouched || searchResults.length > 0) && globalSearch.trim() && (
              <div
                className="absolute top-12 right-0 z-[1200] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl ring-1 ring-black/5 dark:border-dark-border dark:bg-dark-surface dark:ring-white/10"
                style={{ width: 'min(420px, calc(100vw - 24px))', maxHeight: 'min(68vh, 440px)' }}
              >
                <div className="flex h-12 items-center justify-between gap-3 border-b border-gray-100 px-3 dark:border-white/10">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-gray-400">جستجوی سراسری</div>
                    <div className="truncate text-xs font-semibold text-gray-700 dark:text-gray-200">{globalSearch.trim()}</div>
                  </div>
                  {searchLoading ? <Spin size="small" /> : null}
                </div>

                <div className="overflow-y-auto p-2" style={{ maxHeight: '340px' }}>
                  {searchLoading && searchResults.length === 0 && (
                    <div className="space-y-2 p-2">
                      {[0, 1, 2].map((item) => (
                        <div key={item} className="h-10 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5" />
                      ))}
                    </div>
                  )}

                  {!searchLoading && searchTouched && searchResults.length === 0 && (
                    <div className="px-3 py-8 text-center text-xs text-gray-400">
                      نتیجه‌ای برای این جستجو پیدا نشد
                    </div>
                  )}

                  {searchResults.map((group) => (
                    <div key={group.moduleId} className="mb-2 last:mb-0">
                      <div className="mb-1 flex items-center justify-between px-2">
                        <div className="flex min-w-0 items-center gap-2 text-[11px] font-black text-gray-500 dark:text-gray-300">
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-leather-50 text-[11px] text-leather-600 dark:bg-leather-500/10 dark:text-leather-300">
                            {getSearchModuleIcon(group.moduleId)}
                          </span>
                          <span className="truncate">{group.moduleTitle}</span>
                        </div>
                        {group.hasMore ? (
                          <button
                            type="button"
                            className="text-[11px] font-semibold text-leather-600 hover:text-leather-500 dark:text-leather-300"
                            onClick={openGlobalSearchPage}
                          >
                            موارد بیشتر
                          </button>
                        ) : null}
                      </div>
                      <div className="space-y-1">
                        {group.items.map((item) => (
                          <button
                            type="button"
                            key={`${item.moduleId}:${item.recordId}`}
                            className="flex h-12 w-full items-center justify-between gap-3 rounded-xl px-3 text-right transition hover:bg-gray-50 focus:bg-gray-50 focus:outline-none dark:hover:bg-white/5 dark:focus:bg-white/5"
                            onClick={() => openSearchResult(item.moduleId, item.recordId)}
                            style={{ minHeight: 48, maxHeight: 48 }}
                          >
                            <span className="min-w-0 flex-1 overflow-hidden">
                              <span
                                className="block truncate font-bold text-gray-800 dark:text-gray-100"
                                style={{ fontSize: 12, lineHeight: '18px', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                              >
                                {item.title}
                              </span>
                              <span
                                className="mt-0.5 flex min-w-0 items-center gap-1 text-gray-400"
                                style={{ fontSize: 10, lineHeight: '14px', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden' }}
                              >
                                {item.subtitle ? (
                                  <span className="persian-number truncate" style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {item.subtitle}
                                  </span>
                                ) : null}
                                {item.subtitle && item.matchedFields.length ? <span>·</span> : null}
                                {item.matchedFields[0] ? (
                                  <span className="truncate text-leather-500 dark:text-leather-300" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {item.matchedFields[0].label}
                                  </span>
                                ) : null}
                              </span>
                            </span>
                            <ArrowLeftOutlined className="shrink-0 text-[11px] text-gray-300" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-100 bg-gray-50/80 p-1.5 dark:border-white/10 dark:bg-white/5">
                  <Button
                    type="text"
                    block
                    size="small"
                    icon={<SearchOutlined />}
                    onClick={openGlobalSearchPage}
                    className="!h-8 !rounded-xl !text-xs !font-bold !text-leather-600 dark:!text-leather-300"
                  >
                    مشاهده بیشتر
                  </Button>
                </div>
              </div>
            )}
          </div>
          {!isMobile && activeModuleId ? (
            <div
              className="pointer-events-auto absolute left-1/2 top-1/2 hidden w-[280px] -translate-x-1/2 -translate-y-1/2 md:block lg:w-[380px] xl:w-[460px]"
              style={{ animation: 'goalHeaderSlideIn 260ms ease-out both' }}
            >
              <React.Suspense fallback={null}>
                <GoalProgressSlider
                  moduleId={activeModuleId}
                  placement="module_list"
                  className="w-full"
                />
              </React.Suspense>
            </div>
          ) : null}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2 md:gap-4">
            <Button
              type="text"
              size={isMobile ? 'small' : 'middle'}
              shape="circle"
              icon={<ReloadOutlined spin={refreshingPage} />}
              onClick={handlePageRefresh}
              className={headerActionButtonClassName}
              title="رفرش صفحه"
            />
            <Button
              type="text"
              size={isMobile ? 'small' : 'middle'}
              shape="circle"
              icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />}
              onClick={toggleTheme}
              className={headerActionButtonClassName}
              title={isDarkMode ? 'حالت روشن' : 'حالت شب'}
            />
            {isDemoOrg && hasDemoBatch && (
              <Popconfirm
                title="حذف داده‌های دمو"
                description="تمام رکوردهای نمونه‌ای که هنگام راه‌اندازی ایجاد شدند پاک می‌شوند. این عمل قابل بازگشت نیست."
                okText="بله، حذف شود"
                cancelText="انصراف"
                okButtonProps={{ danger: true, loading: clearingDemoData }}
                onConfirm={handleClearDemoData}
                placement="bottomLeft"
              >
                <Tooltip title="حذف داده‌های دمو" placement="bottom">
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    loading={clearingDemoData}
                    className="text-orange-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 border border-orange-300 dark:border-orange-600 rounded-lg px-2"
                  >
                    {!isMobile && <span className="text-xs">حذف دمو</span>}
                  </Button>
                </Tooltip>
              </Popconfirm>
            )}
            <div className="mx-1 hidden h-6 w-[1px] bg-gray-300 dark:bg-gray-700 sm:block"></div>
            {communicationsAccess.canUseWorkspace ? (
              <Tooltip title="پیام‌رسانی" placement="bottom">
                <Badge
                  count={notificationRuntime.communicationUnread > 0 ? toPersianNumber(String(notificationRuntime.communicationUnread)) : 0}
                  size="small"
                  color="#c0392b"
                >
                  <Button
                    type="text"
                    size={isMobile ? 'small' : 'middle'}
                    shape="circle"
                    icon={<MessageOutlined className="text-gray-500 dark:text-gray-400" />}
                    onPointerEnter={(event) => {
                      if (event.pointerType !== 'touch') scheduleRoutePreload('/messages');
                    }}
                    onFocus={() => scheduleRoutePreload('/messages')}
                    onClick={() => handleSidebarNavigate('/messages')}
                    aria-label="پیام‌رسانی"
                    className={headerActionButtonClassName}
                  />
                </Badge>
              </Tooltip>
            ) : null}
            {communicationsAccess.canUseWorkspace ? (
              <AiAssistantLauncher
                buttonSize={isMobile ? 'small' : 'middle'}
                buttonClassName={headerActionButtonClassName}
              />
            ) : null}
            <Tooltip title="اعلان‌ها" placement="bottom">
              <Badge
                count={notificationRuntime.alertsUnread > 0 ? toPersianNumber(String(notificationRuntime.alertsUnread)) : 0}
                size="small"
                color="#c0392b"
              >
                <Button
                  type="text"
                  size={isMobile ? 'small' : 'middle'}
                  shape="circle"
                  icon={<BellOutlined className="text-gray-500 dark:text-gray-400" />}
                  onClick={() => {
                    setAlertsDrawerMounted(true);
                    setAlertsDrawerOpen(true);
                  }}
                  aria-label="اعلان‌ها"
                  className={headerActionButtonClassName}
                />
              </Badge>
            </Tooltip>
            {alertsDrawerMounted ? (
              <React.Suspense fallback={null}>
                <NotificationsPopover
                  isMobile={isMobile}
                  variant="alerts"
                  managedByRuntime
                  controlledOpen={alertsDrawerOpen}
                  renderTrigger={false}
                  onOpenChange={setAlertsDrawerOpen}
                  onAfterClose={() => setAlertsDrawerMounted(false)}
                />
              </React.Suspense>
            ) : null}
            <Dropdown menu={userMenu} placement="bottomLeft" trigger={['click']}>
                <div className="cursor-pointer transition-transform hover:scale-105">
                   <ProfileAvatar
                     size="small"
                     src={resolvedAvatarSrc}
                     icon={<UserOutlined />}
                     className="border border-leather-500 shadow-lg"
                     name={currentUserProfile?.full_name || currentUser?.user_metadata?.full_name || currentUser?.email}
                   />
                </div>
            </Dropdown>
          </div>
        </Header>

        <AppVersionUpdateBanner />

        {/* ── Trial countdown banner ── */}
        {isDemoOrg && !orgIsReadonly && orgTrialDaysLeft !== null && orgTrialDaysLeft <= 7 && (
          <div className={`sticky top-16 z-[950] flex items-center justify-between gap-3 px-4 py-2 text-xs font-semibold ${orgTrialDaysLeft <= 2 ? 'bg-red-500 text-white' : 'bg-amber-400 text-amber-900'}`}>
            <span>
              {orgTrialDaysLeft === 0
                ? 'دوره آزمایشی شما امروز منقضی می‌شود.'
                : `${orgTrialDaysLeft} روز تا پایان دوره آزمایشی باقی مانده است.`}
            </span>
            <Button
              size="small"
              type="text"
              loading={renewalRequesting}
              onClick={handleRequestRenewal}
              className={`font-bold border ${orgTrialDaysLeft <= 2 ? 'border-white text-white hover:bg-red-400' : 'border-amber-700 text-amber-900 hover:bg-amber-500'}`}
            >
              درخواست تمدید
            </Button>
          </div>
        )}

        {breadcrumb && breadcrumb.moduleTitle && (
          <div className="sticky top-16 z-[900] bg-white/90 dark:bg-dark-surface/90 backdrop-blur border-b border-gray-200 dark:border-dark-border px-2 md:px-4 py-2 mb-3">
            <div className="flex items-center gap-1 text-xs md:text-sm text-gray-500 whitespace-nowrap overflow-x-auto no-scrollbar">
              <button onPointerEnter={(event) => event.pointerType !== 'touch' && scheduleRoutePreload('/')} onClick={() => handleSidebarNavigate('/')} className="flex items-center gap-1 hover:text-leather-600">
                <HomeOutlined /> خانه
              </button>
              <span className="px-1 text-gray-300">/</span>
              {breadcrumb.moduleId ? (
                <button onPointerEnter={(event) => event.pointerType !== 'touch' && scheduleRoutePreload(`/${breadcrumb.moduleId}`)} onClick={() => handleSidebarNavigate(`/${breadcrumb.moduleId}`)} className="hover:text-leather-600">
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

        {/* ── Expired trial blocking overlay ── */}
        {orgIsReadonly && isDemoOrg && (
          <div className="fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm p-6">
            <div className="max-w-sm w-full rounded-3xl bg-white dark:bg-dark-surface shadow-2xl p-8 text-center space-y-5">
              <div className="text-5xl">⏰</div>
              <h2 className="text-xl font-black text-gray-800 dark:text-gray-100">دوره آزمایشی پایان یافت</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                دوره آزمایشی رایگان شما به پایان رسیده است. برای ادامه استفاده، درخواست تمدید ارسال کنید تا تیم ما با شما تماس بگیرد.
              </p>
              {orgTrialEndsAt && (
                <p className="text-xs text-gray-400">
                  پایان آزمایشی: {new Date(orgTrialEndsAt).toLocaleDateString('fa-IR')}
                </p>
              )}
              <Button
                type="primary"
                size="large"
                block
                loading={renewalRequesting}
                onClick={handleRequestRenewal}
                className="bg-leather-600 border-leather-600 h-12 text-base font-bold rounded-2xl"
              >
                درخواست تمدید اشتراک
              </Button>
              <p className="text-[11px] text-gray-400">
                داده‌های شما محفوظ است. بعد از تمدید به همه چیز دسترسی خواهید داشت.
              </p>
            </div>
          </div>
        )}

        {!isKeyboardVisible && rolePermissionsReady && (
          <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/95 dark:bg-dark-surface/95 backdrop-blur-xl border-t border-gray-200 dark:border-dark-border rounded-t-2xl flex items-center justify-around z-[1000] shadow-2xl transition-colors pb-[env(safe-area-inset-bottom)]">
             {mobileNavItems.map((item) => {
               const isActive = location.pathname === item.key;
               if (item.isCenter) {
                 return (
                   <div
                     key={item.key}
                     onPointerDown={() => scheduleRoutePreload(item.key)}
                     onClick={() => { void handleSidebarNavigate(item.key); }}
                     className="relative -top-5 bg-leather-500 w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl border-4 border-gray-100 dark:border-dark-bg active:scale-90 transition-all"
                   >
                      <HomeOutlined className="text-white text-2xl" />
                   </div>
                 );
               }
               return (
                 <div 
                   key={item.key} 
                   onPointerDown={() => !item.isMenu && scheduleRoutePreload(item.key)}
                   onClick={() => { item.isMenu ? toggleSidebar() : void handleSidebarNavigate(item.key); }}
                   className={`flex flex-col items-center gap-1 w-12 cursor-pointer ${isActive ? 'text-leather-500' : 'text-gray-400 dark:text-gray-500'}`}
                 >
                    <div className="text-xl">{item.icon}</div>
                    <span className="text-[8px] font-black uppercase">{item.label}</span>
                 </div>
               );
             })}
          </div>
        )}
        <React.Suspense fallback={null}>
          <GlobalTaskProcessModalHost />
        </React.Suspense>
        <UserAnnouncementsPopupHost
          items={userPopupAnnouncements}
          onDismiss={dismissUserAnnouncement}
        />
      </AntLayout>
    </AntLayout>
  );
};

export default Layout;
