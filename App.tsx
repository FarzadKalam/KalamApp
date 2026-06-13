import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HelmetProvider } from "react-helmet-async";
import { createRoot } from "react-dom/client";
import { focusManager } from "@tanstack/react-query";
import { Refine, Authenticated } from "@refinedev/core";
import { ErrorComponent, useNotificationProvider } from "@refinedev/antd";
import { dataProvider } from "@refinedev/supabase";
import { authProvider } from "./authProvider";
import routerBindings, { UnsavedChangesNotifier, DocumentTitleHandler, CatchAllNavigate } from "@refinedev/react-router-v6";
import { BrowserRouter, Navigate, Route, Routes, Outlet, useParams, useLocation } from "react-router-dom";
import { trackPageView, sendWebVitals } from "./utils/analytics";
import ConfigProvider from "antd/es/config-provider";
import AntdApp from "antd/es/app";
import antdTheme from "antd/es/theme";
import faIR from "antd/locale/fa_IR";
import { JalaliLocaleListener } from "antd-jalali";
import { supabase } from "./supabaseClient";
import { MODULES } from "./moduleRegistry";
import UploadProgressOverlay from "./components/UploadProgressOverlay";
import { NotificationRuntimeProvider } from "./components/notifications/NotificationRuntimeProvider";
import OrganizationAvatarPreloader from "./components/common/OrganizationAvatarPreloader";
import PwaInstallPrompt from "./components/PwaInstallPrompt";
import OfflineOverlay from "./components/OfflineOverlay";
import "./App.css";
import {
  BRANDING_APPLIED_EVENT,
  BRANDING_UPDATED_EVENT,
  DEFAULT_BRANDING,
  THEME_STORAGE_KEY,
  resolveSmartThemeMode,
  type BrandingConfig,
} from "./theme/brandTheme";
import {
  applyBrandingRuntime,
  clearRuntimeBrandingCache,
  persistRuntimeBranding,
  loadRuntimeBranding,
  readCachedBranding,
} from "./utils/brandingRuntime";
import { clearCurrentUserRoleContextCache } from "./utils/permissions";
import { clearReferenceDataCache, primeReferenceData } from "./utils/referenceData";
import { clearSessionBootstrapCache, primeSessionBootstrap } from "./utils/sessionCache";
import {
  applyModuleSettingsStoreToRegistry,
  loadAndApplyModuleSettings,
  MODULE_SETTINGS_UPDATED_EVENT,
} from "./utils/moduleSettingsRuntime";
import { resolveOverlayPopupContainer } from "./utils/popupContainer";
import { isMarketingHost, isSaasAppHost } from "./utils/hostRouting";
import { signOutLocalSession } from "./utils/authSession";

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

// تمام ایمپورت‌ها و تنظیمات dayjs از index.tsx و initDayjs.ts مدیریت می‌شوند.

focusManager.setEventListener(() => {
  return () => undefined;
});
focusManager.setFocused(true);

const getModuleLabelFa = (moduleId?: string) => {
  const moduleConfig = moduleId ? MODULES?.[moduleId] : undefined;
  return (
    moduleConfig?.titles?.fa ||
    moduleConfig?.titles?.faSingular ||
    moduleConfig?.id ||
    moduleId ||
    ""
  );
};

const loadProfilePage = () => import("./pages/ProfilePage");
const loadSettingsPage = () => import("./pages/Settings/SettingsPage");
const loadModuleListRefine = () => import("./pages/ModuleList_Refine");
const loadModuleShow = () => import("./pages/ModuleShow");
const loadModuleCreate = () => import("./pages/ModuleCreate").then((module) => ({ default: module.ModuleCreate }));
const loadLogin = () => import("./pages/Login");
const loadDashboard = () => import("./pages/Dashboard");
const loadAiChatPage = () => import("./pages/AiChatPage");
const loadAccountingPage = () => import("./pages/AccountingPage");
const loadAccountingAccountReviewPage = () => import("./pages/AccountingAccountReviewPage");
const loadAccountingReportsPage = () => import("./pages/AccountingReportsPage");
const loadAccountingReportViewerPage = () => import("./pages/AccountingReportViewerPage");
const loadAccountingSettingsPage = () => import("./pages/AccountingSettingsPage");
const loadCashBankPage = () => import("./pages/CashBankPage");
const loadChartOfAccountsTreePage = () => import("./pages/ChartOfAccountsTreePage");
const loadAccountingRecordPage = () => import("./pages/AccountingRecordPage");
const loadJournalEntryCreatePage = () => import("./pages/JournalEntryCreatePage");
const loadJournalEntryShowPage = () => import("./pages/JournalEntryShowPage");
const loadInquiryForm = () => import("./pages/InquiryForm");
const loadProductionGroupOrdersList = () => import("./pages/ProductionGroupOrdersList");
const loadProductionGroupOrderWizard = () => import("./pages/ProductionGroupOrderWizard");
const loadHRPage = () => import("./pages/HRPage");
const loadFilesGalleryPage = () => import("./pages/FilesGalleryPage");
const loadWebFormsHubPage = () => import("./pages/WebFormsHubPage");
const loadWebFormBuilderPage = () => import("./pages/WebFormBuilderPage");
const loadReportsHubPage = () => import("./pages/ReportsHubPage");
const loadReportBuilderPage = () => import("./pages/ReportBuilderPage");
const loadReportViewerPage = () => import("./pages/ReportViewerPage");
const loadPublicSite = () => import("./pages/PublicSite");
const loadSaasPortalPage = () => import("./pages/SaasPortalPage");
const loadWorkSchedulesPage = () => import("./pages/WorkSchedulesPage");
const loadRecycleBinPage = () => import("./pages/RecycleBinPage");
const loadShareTargetPage = () => import("./pages/ShareTargetPage");
const loadFileShortLinkRedirectPage = () => import("./pages/FileShortLinkRedirectPage");
const loadInvoicePublicPage = () => import("./pages/InvoicePublicPage");
const loadGlobalSearchPage = () => import("./pages/GlobalSearchPage");
const loadOrgKnowledgePage = () => import("./pages/OrgKnowledgePage");
const loadSaasAdminDashboard = () => import("./pages/SaasAdmin/SaasAdminDashboard");
const loadSaasAdminPlans = () => import("./pages/SaasAdmin/SaasAdminPlans");
const loadSaasAdminAiSettings = () => import("./pages/SaasAdmin/SaasAdminAiSettings");
const loadCmsPostEditor = () => import("./pages/SaasAdmin/CmsPostEditor");
const loadApiDocsPage = () => import("./pages/ApiDocsPage");
const loadMessagesPage = () => import("./pages/MessagesPage");
const loadLayout = () => import("./components/Layout");

const ProfilePage = lazy(loadProfilePage);
const SettingsPage = lazy(loadSettingsPage);
const ModuleListRefine = lazy(loadModuleListRefine);
const ModuleShow = lazy(loadModuleShow);
const ModuleCreate = lazy(loadModuleCreate);
const Login = lazy(loadLogin);
const Dashboard = lazy(loadDashboard);
const AiChatPage = lazy(loadAiChatPage);
const AccountingPage = lazy(loadAccountingPage);
const AccountingAccountReviewPage = lazy(loadAccountingAccountReviewPage);
const AccountingReportsPage = lazy(loadAccountingReportsPage);
const AccountingReportViewerPage = lazy(loadAccountingReportViewerPage);
const AccountingSettingsPage = lazy(loadAccountingSettingsPage);
const CashBankPage = lazy(loadCashBankPage);
const ChartOfAccountsTreePage = lazy(loadChartOfAccountsTreePage);
const AccountingRecordPage = lazy(loadAccountingRecordPage);
const JournalEntryCreatePage = lazy(loadJournalEntryCreatePage);
const JournalEntryShowPage = lazy(loadJournalEntryShowPage);
const InquiryForm = lazy(loadInquiryForm);
const ProductionGroupOrdersList = lazy(loadProductionGroupOrdersList);
const ProductionGroupOrderWizard = lazy(loadProductionGroupOrderWizard);
const HRPage = lazy(loadHRPage);
const FilesGalleryPage = lazy(loadFilesGalleryPage);
const WebFormsHubPage = lazy(loadWebFormsHubPage);
const WebFormBuilderPage = lazy(loadWebFormBuilderPage);
const ReportsHubPage = lazy(loadReportsHubPage);
const ReportBuilderPage = lazy(loadReportBuilderPage);
const ReportViewerPage = lazy(loadReportViewerPage);
const PublicSite = lazy(loadPublicSite);
const SaasPortalPage = lazy(loadSaasPortalPage);
const WorkSchedulesPage = lazy(loadWorkSchedulesPage);
const RecycleBinPage = lazy(loadRecycleBinPage);
const ShareTargetPage = lazy(loadShareTargetPage);
const FileShortLinkRedirectPage = lazy(loadFileShortLinkRedirectPage);
const InvoicePublicPage = lazy(loadInvoicePublicPage);
const GlobalSearchPage = lazy(loadGlobalSearchPage);
const OrgKnowledgePage = lazy(loadOrgKnowledgePage);
const SaasAdminDashboard = lazy(loadSaasAdminDashboard);
const SaasAdminPlans = lazy(loadSaasAdminPlans);
const SaasAdminAiSettings = lazy(loadSaasAdminAiSettings);
const CmsPostEditor = lazy(loadCmsPostEditor);
const ApiDocsPage = lazy(loadApiDocsPage);
const MessagesPage = lazy(loadMessagesPage);
const Layout = lazy(loadLayout);

const preloadAuthenticatedRouteChunk = (targetPath?: string): Promise<unknown> => {
  const pathname = String(targetPath || "").split(/[?#]/)[0] || "/";
  const segments = pathname.split("/").filter(Boolean);
  const section = segments[0] || "";
  const detail = segments[1] || "";

  let preloader: (() => Promise<unknown>) | null = null;

  if (!section || section === "dashboard") preloader = loadDashboard;
  else if (section === "ai") preloader = loadAiChatPage;
  else if (section === "profile") preloader = loadProfilePage;
  else if (section === "settings") preloader = loadSettingsPage;
  else if (section === "messages") preloader = loadMessagesPage;
  else if (section === "gallery") preloader = loadFilesGalleryPage;
  else if (section === "org-knowledge") preloader = loadOrgKnowledgePage;
  else if (section === "recycle-bin") preloader = loadRecycleBinPage;
  else if (section === "search") preloader = loadGlobalSearchPage;
  else if (section === "hr") preloader = loadHRPage;
  else if (section === "production_group_orders") {
    preloader = detail ? loadProductionGroupOrderWizard : loadProductionGroupOrdersList;
  } else if (section === "web_forms") {
    preloader = detail ? loadWebFormBuilderPage : loadWebFormsHubPage;
  } else if (section === "reports") {
    preloader = detail === "create" ? loadReportBuilderPage : detail ? loadReportViewerPage : loadReportsHubPage;
  } else if (section === "accounting") {
    if (detail === "reports") {
      preloader = segments[2] ? loadAccountingReportViewerPage : loadAccountingReportsPage;
    } else if (detail === "account-review") {
      preloader = loadAccountingAccountReviewPage;
    } else if (detail === "settings") {
      preloader = loadAccountingSettingsPage;
    } else {
      preloader = loadAccountingPage;
    }
  } else if (section === "cash_bank_operations") {
    preloader = detail ? loadAccountingRecordPage : loadCashBankPage;
  } else if (section === "chart_of_accounts") {
    preloader = detail ? loadAccountingRecordPage : loadChartOfAccountsTreePage;
  } else if (section === "journal_entries") {
    preloader = detail === "create" ? loadJournalEntryCreatePage : detail ? loadJournalEntryShowPage : loadModuleListRefine;
  } else if (section === "work_schedules") {
    preloader = loadWorkSchedulesPage;
  } else if (section === "taze-system") {
    preloader = detail === "plans" ? loadSaasAdminPlans : detail === "api-docs" ? loadApiDocsPage : detail === "ai-settings" ? loadSaasAdminAiSettings : loadSaasAdminDashboard;
  } else {
    preloader = detail === "create" ? loadModuleCreate : detail ? loadModuleShow : loadModuleListRefine;
  }

  return preloader().catch(() => undefined);
};

const preloadAuthenticatedShell = (pathname?: string) => {
  void loadLayout().catch(() => undefined);
  preloadAuthenticatedRouteChunk(pathname);
};

const getInitialDarkMode = () => {
  if (typeof window === "undefined") return false;
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === "dark") return true;
  if (savedTheme === "light") return false;
  return resolveSmartThemeMode() === "dark";
};

const getInitialBranding = (): BrandingConfig => {
  if (typeof window === "undefined") return DEFAULT_BRANDING;
  return readCachedBranding() || DEFAULT_BRANDING;
};

const SilentRouteFallback = () => null;

const RouteTracker: React.FC = () => {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);
  return null;
};

const isSaasOnboardingPath = (pathname?: string, saasAppHost = false) => {
  if (!saasAppHost) return false;
  const normalized = String(pathname || "").trim();
  return normalized === "/" || normalized === "/demo";
};

const LazyRouteBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={<SilentRouteFallback />}>{children}</Suspense>
);

const AuthenticatedOutletBoundary: React.FC = () => {
  const location = useLocation();
  return (
    <Suspense key={location.pathname} fallback={<SilentRouteFallback />}>
      <Outlet />
    </Suspense>
  );
};

const MarketingSiteHostApp: React.FC = () => {
  useEffect(() => {
    document.body.style.fontFamily = "Vazirmatn, sans-serif";
    // تنظیم favicon اختصاصی تازه سیستم
    const existing = document.querySelector<HTMLLinkElement>('link[rel*="icon"]');
    const link: HTMLLinkElement = existing || document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    link.href = "/tazesystem_logo.png";
    if (!existing) document.head.appendChild(link);
  }, []);

  useEffect(() => {
    // GTM فقط برای سایت عمومی
    const gtmId = import.meta.env.VITE_GTM_ID as string | undefined;
    if (!gtmId) return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${gtmId}`;
    document.head.appendChild(script);
    const noscript = document.createElement('noscript');
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.googletagmanager.com/ns.html?id=${gtmId}`;
    iframe.height = '0';
    iframe.width = '0';
    iframe.style.cssText = 'display:none;visibility:hidden';
    noscript.appendChild(iframe);
    document.body.insertBefore(noscript, document.body.firstChild);
  }, []);

  useEffect(() => {
    sendWebVitals();
  }, []);

  return (
    <HelmetProvider>
    <BrowserRouter>
      <RouteTracker />
      <ConfigProvider
        direction="rtl"
        locale={faIR}
        theme={{ token: { fontFamily: "Vazirmatn, sans-serif" } }}
      >
        <JalaliLocaleListener />
        <AntdApp
          message={{ top: 72, duration: 3.5, maxCount: 4 }}
          notification={{ placement: "topLeft", duration: 4.5, maxCount: 4 }}
        >
          <PwaInstallPrompt />
          <LazyRouteBoundary>
            <Routes>
              <Route path="/i/:code" element={<InvoicePublicPage />} />
              <Route path="/*" element={<PublicSite />} />
            </Routes>
          </LazyRouteBoundary>
        </AntdApp>
      </ConfigProvider>
    </BrowserRouter>
    </HelmetProvider>
  );
};

function App() {
  const marketingHost = isMarketingHost();
  const saasAppHost = isSaasAppHost();

  if (marketingHost) {
    return <MarketingSiteHostApp />;
  }

  const [isDarkMode, setIsDarkMode] = useState<boolean>(getInitialDarkMode);
  const [branding, setBranding] = useState<BrandingConfig>(getInitialBranding);
  const [moduleSettingsVersion, setModuleSettingsVersion] = useState(0);
  const [moduleSettingsReady, setModuleSettingsReady] = useState(false);
  const authLifecycleRef = useRef<{ initialized: boolean; userId: string | null }>({
    initialized: false,
    userId: null,
  });

  useEffect(() => {
    document.body.style.fontFamily = "Vazirmatn, sans-serif";
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
  }, [isDarkMode]);

  const handleToggleTheme = useCallback(() => {
    setIsDarkMode((prev) => {
      const next = !prev;
      window.localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
      return next;
    });
  }, []);

  const loadBranding = useCallback(async (force = false) => {
    try {
      if (force) {
        clearRuntimeBrandingCache();
      }
      const runtimeBranding = await loadRuntimeBranding({ force });
      persistRuntimeBranding(runtimeBranding);
      setBranding(runtimeBranding.branding);
    } catch (error) {
      console.warn("Could not load branding settings", error);
    }
  }, []);

  const loadModuleSettings = useCallback(async () => {
    try {
      await loadAndApplyModuleSettings(supabase);
    } catch (error) {
      console.warn("Could not load module settings", error);
      applyModuleSettingsStoreToRegistry(null);
    } finally {
      setModuleSettingsVersion((prev) => prev + 1);
      setModuleSettingsReady(true);
    }
  }, []);

  useEffect(() => {
    const handleBrandingUpdated = () => {
      void loadBranding(true);
    };

    void loadBranding();
    window.addEventListener(BRANDING_UPDATED_EVENT, handleBrandingUpdated as EventListener);
    return () => {
      window.removeEventListener(BRANDING_UPDATED_EVENT, handleBrandingUpdated as EventListener);
    };
  }, [loadBranding]);

  useEffect(() => {
    let isMounted = true;

    const bootstrapModuleSettings = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const onboardingPath = isSaasOnboardingPath(window.location.pathname, saasAppHost);
        if (data?.session?.user?.id) {
          if (onboardingPath) {
            void primeSessionBootstrap(supabase);
            if (isMounted) {
              setModuleSettingsReady(true);
            }
            return;
          }
          preloadAuthenticatedShell(window.location.pathname);
          await loadModuleSettings();
        } else {
          applyModuleSettingsStoreToRegistry(null);
          if (isMounted) {
            setModuleSettingsVersion((prev) => prev + 1);
            setModuleSettingsReady(true);
          }
        }
      } catch {
        applyModuleSettingsStoreToRegistry(null);
        if (isMounted) {
          setModuleSettingsVersion((prev) => prev + 1);
          setModuleSettingsReady(true);
        }
      }
    };

    void bootstrapModuleSettings();

    return () => {
      isMounted = false;
    };
  }, [loadModuleSettings, saasAppHost]);

  useEffect(() => {
    const handleModuleSettingsUpdated = () => {
      void loadModuleSettings();
    };

    window.addEventListener(MODULE_SETTINGS_UPDATED_EVENT, handleModuleSettingsUpdated as EventListener);
    return () => {
      window.removeEventListener(MODULE_SETTINGS_UPDATED_EVENT, handleModuleSettingsUpdated as EventListener);
    };
  }, [loadModuleSettings]);

  useEffect(() => {
    applyBrandingRuntime(branding);
    window.dispatchEvent(new CustomEvent(BRANDING_APPLIED_EVENT));
  }, [branding]);

  useEffect(() => {
    const publicPaths = saasAppHost ? ["/", "/login", "/inquiry", "/i"] : ["/inquiry", "/i", "/login", "/tazesystem"];

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      const eventName = String(event);
      const pathname = window.location.pathname;
      const isPublic = publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
      const isPublicSaasOnboarding = isSaasOnboardingPath(pathname, saasAppHost);
      const nextUserId = session?.user?.id || null;
      const previousUserId = authLifecycleRef.current.userId;
      const userChanged = previousUserId !== nextUserId;
      authLifecycleRef.current.userId = nextUserId;

      if (eventName === "INITIAL_SESSION") {
        if (authLifecycleRef.current.initialized) return;
        authLifecycleRef.current.initialized = true;
        if (!nextUserId) {
          clearRuntimeBrandingCache();
          void loadBranding(true);
          applyModuleSettingsStoreToRegistry(null);
          setModuleSettingsVersion((prev) => prev + 1);
          setModuleSettingsReady(true);
          return;
        }
        void primeSessionBootstrap(supabase);
        void loadBranding();
        if (!isPublicSaasOnboarding) {
          preloadAuthenticatedShell(pathname);
          void primeReferenceData(supabase);
          void loadModuleSettings();
        } else {
          setModuleSettingsReady(true);
        }
        return;
      }

      if (eventName === "SIGNED_IN") {
        authLifecycleRef.current.initialized = true;
        if (!userChanged && nextUserId) return;
        clearSessionBootstrapCache();
        clearCurrentUserRoleContextCache();
        clearReferenceDataCache();
        void primeSessionBootstrap(supabase);
        void loadBranding(true);
        if (!isPublicSaasOnboarding) {
          preloadAuthenticatedShell(pathname);
          void primeReferenceData(supabase, { force: true });
          void loadModuleSettings();
        } else {
          setModuleSettingsReady(true);
        }
        return;
      }

      if (eventName === "TOKEN_REFRESHED") {
        return;
      }

      if (eventName === "SIGNED_OUT" || eventName === "TOKEN_REFRESH_FAILED") {
        authLifecycleRef.current.userId = null;
        clearSessionBootstrapCache();
        clearCurrentUserRoleContextCache();
        clearReferenceDataCache();
        clearRuntimeBrandingCache();
        void loadBranding(true);
        applyModuleSettingsStoreToRegistry(null);
        setModuleSettingsVersion((prev) => prev + 1);
        setModuleSettingsReady(true);
        if (eventName === "TOKEN_REFRESH_FAILED") {
          void signOutLocalSession();
        }
        if (!isPublic) {
          window.location.replace("/login");
        }
      }
    });

    return () => {
      subscription?.subscription?.unsubscribe();
    };
  }, [loadBranding, loadModuleSettings, saasAppHost]);

  const resources = useMemo(
    () =>
      Object.values(MODULES).map((mod) => ({
        name: mod.id,
        list: `/${mod.id}`,
        show: `/${mod.id}/:id`,
        create: `/${mod.id}/create`,
        edit: `/${mod.id}/:id`,
        meta: {
          label: getModuleLabelFa(mod.id),
        },
      })),
    [moduleSettingsVersion]
  );

  const getStandalonePageTitle = (pathname?: string) => {
    if (!pathname) return null;
    if (pathname === "/") return "داشبورد";
    if (pathname.startsWith("/login")) return "ورود";
    if (pathname.startsWith("/inquiry")) return "فرم استعلام";
    if (pathname === "/web_forms") return "وب فرم‌ها";
    if (pathname === "/web_forms/create") return "وب فرم جدید";
    if (/^\/web_forms\/[^/]+$/.test(pathname)) return "ویرایش وب فرم";
    if (/^\/web_forms\/[^/]+\/edit$/.test(pathname)) return "ویرایش وب فرم";
    if (pathname.startsWith("/settings")) return "تنظیمات";
    if (pathname.startsWith("/org-knowledge")) return "دانش سازمان";
    if (pathname.startsWith("/profile")) return "پروفایل";
    if (pathname.startsWith("/hr")) return "منابع انسانی";
    if (pathname.startsWith("/work_schedules")) return "برنامه حضور";
    if (pathname.startsWith("/share-target")) return "اشتراک‌گذاری";
    if (pathname.startsWith("/search")) return "جستجو";
    if (pathname.startsWith("/gallery")) return "مدیریت فایل‌ها";
    if (pathname.startsWith("/recycle-bin")) return "سطل بازیافت";
    if (pathname === "/reports") return "گزارشات";
    if (pathname === "/reports/create") return "گزارش جدید";
    if (/^\/reports\/[^/]+$/.test(pathname)) return "نمایش گزارش";
    if (/^\/reports\/[^/]+\/edit$/.test(pathname)) return "ویرایش گزارش";
    if (pathname.startsWith("/accounting/settings")) return "تنظیمات حسابداری";
    if (pathname === "/accounting/reports") return "گزارشات حسابداری";
    if (pathname.startsWith("/accounting/reports/")) return "گزارش حسابداری";
    if (pathname.startsWith("/accounting/account-review")) return "مرور حساب ها";
    if (pathname.startsWith("/cash_bank")) return "نقد و بانک";
    if (pathname === "/accounting" || pathname.startsWith("/accounting/")) return "حسابداری";
    if (pathname === "/chart_of_accounts") return "جدول حساب ها";
    if (pathname.startsWith("/journal_entries/create")) return "ایجاد سند حسابداری";
    if (/^\/journal_entries\/[^/]+$/.test(pathname)) return "سند حسابداری";
    if (/^\/journal_entries\/[^/]+\/edit$/.test(pathname)) return "سند حسابداری";
    return null;
  };

  const getActionLabel = (action?: string) => {
    if (action === "list") return "لیست";
    if (action === "create") return "ایجاد";
    if (action === "edit") return "ویرایش";
    if (action === "show") return "جزئیات";
    return "";
  };

  const titleHandler = ({
    resource,
    action,
    pathname,
  }: {
    resource?: any;
    action?: string;
    pathname?: string;
    autoGeneratedTitle: string;
  }) => {
    const standalone = getStandalonePageTitle(pathname);
    if (standalone) return `${standalone} | ${branding.appTitle}`;

    const resourceLabel =
      resource?.meta?.label || resource?.label || getModuleLabelFa(resource?.name) || resource?.name || "";

    if (resourceLabel) {
      if (action === "show" || action === "edit") {
        return `${resourceLabel} | ${branding.appTitle}`;
      }
      const actionLabel = getActionLabel(action);
      return actionLabel ? `${actionLabel} ${resourceLabel} | ${branding.appTitle}` : `${resourceLabel} | ${branding.appTitle}`;
    }

    return branding.appTitle;
  };

  const ModuleListRouteResolver: React.FC = () => {
    const { moduleId: routeModuleId } = useParams();
    if (routeModuleId === "chart_of_accounts") {
      return <ChartOfAccountsTreePage />;
    }
    if (routeModuleId === "cash_bank_operations") {
      return <CashBankPage />;
    }
    return <ModuleListRefine key={`module-list:${routeModuleId || "unknown"}`} />;
  };

  const ModuleCreateRouteResolver: React.FC = () => {
    const { moduleId: routeModuleId } = useParams();
    if (routeModuleId && MODULES[routeModuleId]?.disableCreate) {
      return <ModuleListRefine key={`module-list:${routeModuleId}`} />;
    }
    if (routeModuleId === "work_schedules") {
      return <WorkSchedulesPage />;
    }
    if (routeModuleId === "journal_entries") {
      return <JournalEntryCreatePage />;
    }
    if (routeModuleId === "chart_of_accounts" || routeModuleId === "cheques") {
      return <AccountingRecordPage />;
    }
    return <ModuleCreate />;
  };

  const ModuleShowRouteResolver: React.FC = () => {
    const { moduleId: routeModuleId } = useParams();
    if (routeModuleId && MODULES[routeModuleId]?.disableDetailView) {
      return <ModuleListRefine key={`module-list:${routeModuleId}`} />;
    }
    if (routeModuleId === "work_schedules") {
      return <WorkSchedulesPage />;
    }
    if (routeModuleId === "journal_entries") {
      return <JournalEntryShowPage />;
    }
    if (routeModuleId === "chart_of_accounts" || routeModuleId === "cheques") {
      return <AccountingRecordPage />;
    }
    return <ModuleShow />;
  };

  const RefineAppContent: React.FC = () => {
    const notificationProvider = useNotificationProvider();

    return (
      <Refine
        dataProvider={dataProvider(supabase)}
        authProvider={authProvider}
        notificationProvider={notificationProvider}
        routerProvider={routerBindings}
        resources={resources}
        options={{
          syncWithLocation: true,
          warnWhenUnsavedChanges: true,
          disableTelemetry: true,
          reactQuery: {
            clientConfig: {
              defaultOptions: {
                queries: {
                  staleTime: 5 * 60_000,
                  gcTime: 5 * 60_000,
                  retry: 1,
                  refetchOnWindowFocus: false,
                },
              },
            },
          },
        }}
      >
        <Routes>
          <Route path="/tazesystem/developers" element={<LazyRouteBoundary><ApiDocsPage /></LazyRouteBoundary>} />
          <Route path="/tazesystem/*" element={<LazyRouteBoundary><PublicSite /></LazyRouteBoundary>} />
          {saasAppHost ? (
            <>
              <Route path="/" element={<LazyRouteBoundary><SaasPortalPage /></LazyRouteBoundary>} />
              <Route path="/demo" element={<LazyRouteBoundary><SaasPortalPage /></LazyRouteBoundary>} />
            </>
          ) : null}
          <Route path="/login" element={<LazyRouteBoundary><Login /></LazyRouteBoundary>} />
          <Route path="/inquiry/*" element={<LazyRouteBoundary><InquiryForm /></LazyRouteBoundary>} />
          <Route path="/i/:code" element={<LazyRouteBoundary><InvoicePublicPage /></LazyRouteBoundary>} />
          <Route path="/f/:code" element={<LazyRouteBoundary><FileShortLinkRedirectPage /></LazyRouteBoundary>} />

          <Route
            element={
              <Authenticated
                key="authenticated-inner"
                fallback={<CatchAllNavigate to="/login" />}
              >
                <LazyRouteBoundary>
                  <NotificationRuntimeProvider>
                    <OrganizationAvatarPreloader />
                    <Layout
                      isDarkMode={isDarkMode}
                      toggleTheme={handleToggleTheme}
                      brandShortName={branding.shortName}
                      preloadRoute={preloadAuthenticatedRouteChunk}
                    >
                      <AuthenticatedOutletBoundary />
                    </Layout>
                  </NotificationRuntimeProvider>
                </LazyRouteBoundary>
              </Authenticated>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/ai" element={<AiChatPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/profile/:id" element={<ProfilePage />} />
            <Route path="/production_group_orders" element={<ProductionGroupOrdersList />} />
            <Route path="/production_group_orders/create" element={<ProductionGroupOrderWizard />} />
            <Route path="/production_group_orders/:id" element={<ProductionGroupOrderWizard />} />
            <Route path="/hr" element={<HRPage />} />
            <Route path="/hr/:employeeId" element={<HRPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/gallery" element={<FilesGalleryPage />} />
            <Route path="/org-knowledge" element={<OrgKnowledgePage />} />
            <Route path="/recycle-bin" element={<RecycleBinPage />} />
            <Route path="/share-target" element={<ShareTargetPage />} />
            <Route path="/search" element={<GlobalSearchPage />} />
            <Route path="/web_forms" element={<WebFormsHubPage />} />
            <Route path="/web_forms/create" element={<WebFormBuilderPage />} />
            <Route path="/web_forms/:id" element={<WebFormBuilderPage />} />
            <Route path="/web_forms/:id/edit" element={<WebFormBuilderPage />} />
            <Route path="/reports" element={<ReportsHubPage />} />
            <Route path="/reports/create" element={<ReportBuilderPage />} />
            <Route path="/reports/:reportId" element={<ReportViewerPage />} />
            <Route path="/reports/:reportId/edit" element={<ReportBuilderPage />} />
            <Route path="/accounting" element={<AccountingPage />} />
            <Route path="/accounting/reports" element={<AccountingReportsPage />} />
            <Route path="/accounting/reports/:reportKey" element={<AccountingReportViewerPage />} />
            <Route path="/cash_bank" element={<Navigate to="/cash_bank_operations" replace />} />
            <Route path="/accounting/account-review" element={<AccountingAccountReviewPage />} />
            <Route path="/accounting/settings" element={<AccountingSettingsPage />} />
            <Route path="/chart_of_accounts" element={<ChartOfAccountsTreePage />} />
            <Route path="/journal_entries/create" element={<JournalEntryCreatePage />} />
            <Route path="/journal_entries/:id" element={<JournalEntryShowPage />} />
            <Route path="/journal_entries/:id/edit" element={<JournalEntryShowPage />} />

            <Route path="/:moduleId">
              <Route index element={<ModuleListRouteResolver />} />
              <Route path="create" element={<ModuleCreateRouteResolver />} />
              <Route path=":id" element={<ModuleShowRouteResolver />} />
              <Route path=":id/edit" element={<ModuleShowRouteResolver />} />
            </Route>

            {/* SaaS Admin — فقط برای کاربران با permission __saas_admin */}
            <Route path="/taze-system" element={<SaasAdminDashboard />} />
            <Route path="/taze-system/orgs" element={<Navigate to="/saas_orgs" replace />} />
            <Route path="/taze-system/requests" element={<Navigate to="/saas_demo_requests" replace />} />
            <Route path="/taze-system/announcements" element={<Navigate to="/saas_user_announcements" replace />} />
            <Route path="/taze-system/plans" element={<SaasAdminPlans />} />
            <Route path="/taze-system/api-docs" element={<ApiDocsPage isAdmin />} />
            <Route path="/taze-system/ai-settings" element={<SaasAdminAiSettings />} />
            {/* CMS — blog */}
            <Route path="/taze-system/blog/new" element={<CmsPostEditor />} />
            <Route path="/taze-system/blog/:id" element={<CmsPostEditor />} />
            {/* CMS — tutorials */}
            <Route path="/taze-system/tutorials/new" element={<CmsPostEditor />} />
            <Route path="/taze-system/tutorials/:id" element={<CmsPostEditor />} />

            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<ErrorComponent />} />
          </Route>
        </Routes>

        <UnsavedChangesNotifier />
        <DocumentTitleHandler handler={titleHandler} />
      </Refine>
    );
  };

  if (!moduleSettingsReady) {
    return (
      <ConfigProvider direction="rtl" locale={faIR}>
        <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
          در حال بارگذاری تنظیمات سازمان...
        </div>
      </ConfigProvider>
    );
  }

  return (
    <HelmetProvider>
    <BrowserRouter future={{ v7_startTransition: true }}>
      <ConfigProvider
        direction="rtl"
        locale={faIR}
        getPopupContainer={resolveOverlayPopupContainer}
        theme={{
          algorithm: isDarkMode ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: {
            colorPrimary: branding.palette.primary,
            fontFamily: "Vazirmatn, sans-serif",
            zIndexPopupBase: 13000,
          },
        }}
      >
        <JalaliLocaleListener />
        <AntdApp
          message={{ top: 72, duration: 3.5, maxCount: 4 }}
          notification={{ placement: "topLeft", duration: 4.5, maxCount: 4 }}
        >
          <PwaInstallPrompt />
          <OfflineOverlay />
          <RefineAppContent />
          <UploadProgressOverlay />
        </AntdApp>
      </ConfigProvider>
    </BrowserRouter>
    </HelmetProvider>
  );
}

export const mountApp = (container: HTMLElement) => {
  createRoot(container).render(<App />);
};

export default App;
