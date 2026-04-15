import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Refine, Authenticated } from "@refinedev/core";
import { ErrorComponent, useNotificationProvider } from "@refinedev/antd";
import { dataProvider } from "@refinedev/supabase";
import { authProvider } from "./authProvider";
import routerBindings, { UnsavedChangesNotifier, DocumentTitleHandler, CatchAllNavigate } from "@refinedev/react-router-v6";
import { BrowserRouter, Route, Routes, Outlet, useParams } from "react-router-dom";
import { ConfigProvider, App as AntdApp, theme as antdTheme } from "antd";
import faIR from "antd/locale/fa_IR";
import { JalaliLocaleListener } from "antd-jalali";
import { supabase } from "./supabaseClient";
import { MODULES } from "./moduleRegistry";
import Layout from "./components/Layout";
import UploadProgressOverlay from "./components/UploadProgressOverlay";
import PwaInstallPrompt from "./components/PwaInstallPrompt";
import "./App.css";
import {
  BRANDING_APPLIED_EVENT,
  BRANDING_UPDATED_EVENT,
  DEFAULT_BRANDING,
  THEME_STORAGE_KEY,
  resolveSmartThemeMode,
  type BrandingConfig,
} from "./theme/brandTheme";
import { isAccountingMinimalModule } from "./utils/accountingModules";
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

// تمام ایمپورت‌ها و تنظیمات dayjs از index.tsx و initDayjs.ts مدیریت می‌شوند.

const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const SettingsPage = lazy(() => import("./pages/Settings/SettingsPage"));
const ModuleListRefine = lazy(() => import("./pages/ModuleList_Refine"));
const ModuleShow = lazy(() => import("./pages/ModuleShow"));
const ModuleCreate = lazy(() =>
  import("./pages/ModuleCreate").then((module) => ({ default: module.ModuleCreate }))
);
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AccountingPage = lazy(() => import("./pages/AccountingPage"));
const AccountingAccountReviewPage = lazy(() => import("./pages/AccountingAccountReviewPage"));
const AccountingReportsPage = lazy(() => import("./pages/AccountingReportsPage"));
const AccountingReportViewerPage = lazy(() => import("./pages/AccountingReportViewerPage"));
const AccountingSettingsPage = lazy(() => import("./pages/AccountingSettingsPage"));
const ChartOfAccountsTreePage = lazy(() => import("./pages/ChartOfAccountsTreePage"));
const AccountingRecordPage = lazy(() => import("./pages/AccountingRecordPage"));
const CashBankPage = lazy(() => import("./pages/CashBankPage"));
const JournalEntryCreatePage = lazy(() => import("./pages/JournalEntryCreatePage"));
const JournalEntryShowPage = lazy(() => import("./pages/JournalEntryShowPage"));
const InquiryForm = lazy(() => import("./pages/InquiryForm"));
const ProductionGroupOrdersList = lazy(() => import("./pages/ProductionGroupOrdersList"));
const ProductionGroupOrderWizard = lazy(() => import("./pages/ProductionGroupOrderWizard"));
const HRPage = lazy(() => import("./pages/HRPage"));
const FilesGalleryPage = lazy(() => import("./pages/FilesGalleryPage"));
const WebFormsHubPage = lazy(() => import("./pages/WebFormsHubPage"));
const WebFormBuilderPage = lazy(() => import("./pages/WebFormBuilderPage"));
const ReportsHubPage = lazy(() => import("./pages/ReportsHubPage"));
const ReportBuilderPage = lazy(() => import("./pages/ReportBuilderPage"));
const ReportViewerPage = lazy(() => import("./pages/ReportViewerPage"));
const PublicSite = lazy(() => import("./pages/PublicSite"));
const WorkSchedulesPage = lazy(() => import("./pages/WorkSchedulesPage"));
const HrQuickRequestPage = lazy(() => import("./pages/HrQuickRequestPage"));
const RecycleBinPage = lazy(() => import("./pages/RecycleBinPage"));
const ShareTargetPage = lazy(() => import("./pages/ShareTargetPage"));

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

const RouteLoadingFallback = () => (
  <div className="min-h-[40vh] flex items-center justify-center text-sm text-gray-500">
    در حال بارگذاری...
  </div>
);

function App() {
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
        if (data?.session?.user?.id) {
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
  }, [loadModuleSettings]);

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
    const publicPaths = ["/inquiry", "/login", "/tazesystem"];

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      const eventName = String(event);
      const pathname = window.location.pathname;
      const isPublic = publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
      const nextUserId = session?.user?.id || null;
      const previousUserId = authLifecycleRef.current.userId;
      const userChanged = previousUserId !== nextUserId;
      authLifecycleRef.current.userId = nextUserId;

      if (eventName === "INITIAL_SESSION") {
        if (authLifecycleRef.current.initialized) return;
        authLifecycleRef.current.initialized = true;
        if (!nextUserId) {
          applyModuleSettingsStoreToRegistry(null);
          setModuleSettingsVersion((prev) => prev + 1);
          setModuleSettingsReady(true);
          return;
        }
        void primeSessionBootstrap(supabase);
        void primeReferenceData(supabase);
        void loadBranding();
        void loadModuleSettings();
        return;
      }

      if (eventName === "SIGNED_IN") {
        authLifecycleRef.current.initialized = true;
        if (!userChanged && nextUserId) return;
        clearSessionBootstrapCache();
        clearCurrentUserRoleContextCache();
        clearReferenceDataCache();
        void primeSessionBootstrap(supabase);
        void primeReferenceData(supabase, { force: true });
        void loadBranding(true);
        void loadModuleSettings();
        return;
      }

      if (eventName === "TOKEN_REFRESHED") {
        return;
      }

      if ((eventName === "SIGNED_OUT" || eventName === "TOKEN_REFRESH_FAILED") && !isPublic) {
        authLifecycleRef.current.userId = null;
        clearSessionBootstrapCache();
        clearCurrentUserRoleContextCache();
        clearReferenceDataCache();
        applyModuleSettingsStoreToRegistry(null);
        setModuleSettingsVersion((prev) => prev + 1);
        setModuleSettingsReady(true);
        window.location.replace("/login");
      }
    });

    return () => {
      subscription?.subscription?.unsubscribe();
    };
  }, [loadBranding, loadModuleSettings]);

  const resources = useMemo(
    () =>
      Object.values(MODULES).map((mod) => ({
        name: mod.id,
        list: `/${mod.id}`,
        show: `/${mod.id}/:id`,
        create: `/${mod.id}/create`,
        edit: `/${mod.id}/:id`,
        meta: {
          label: mod.titles.fa,
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
    if (pathname.startsWith("/profile")) return "پروفایل";
    if (pathname.startsWith("/hr")) return "منابع انسانی";
    if (pathname.startsWith("/work_schedules")) return "برنامه حضور";
    if (pathname.startsWith("/share-target")) return "اشتراک‌گذاری";
    if (pathname.startsWith("/gallery")) return "گالری فایل‌ها";
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
      resource?.meta?.label || resource?.label || MODULES?.[resource?.name]?.titles?.fa || resource?.name || "";

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
    if (routeModuleId === "leave_requests" || routeModuleId === "overtime_requests" || routeModuleId === "mission_requests") {
      return <HrQuickRequestPage />;
    }
    if (routeModuleId === "journal_entries") {
      return <JournalEntryCreatePage />;
    }
    if (isAccountingMinimalModule(routeModuleId)) {
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
    if (routeModuleId === "leave_requests" || routeModuleId === "overtime_requests" || routeModuleId === "mission_requests") {
      return <HrQuickRequestPage />;
    }
    if (routeModuleId === "journal_entries") {
      return <JournalEntryShowPage />;
    }
    if (isAccountingMinimalModule(routeModuleId)) {
      return <AccountingRecordPage />;
    }
    return <ModuleShow />;
  };

  const RefineAppContent: React.FC = () => {
    const notificationProvider = useNotificationProvider();

    return (
      <Suspense fallback={<RouteLoadingFallback />}>
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
          }}
        >
          <Routes>
            <Route path="/tazesystem/*" element={<PublicSite />} />
            <Route path="/login" element={<Login />} />
            <Route path="/inquiry/*" element={<InquiryForm />} />

            <Route
              element={
                <Authenticated
                  key="authenticated-inner"
                  fallback={<CatchAllNavigate to="/login" />}
                >
                  <Layout
                    isDarkMode={isDarkMode}
                    toggleTheme={handleToggleTheme}
                    brandShortName={branding.shortName}
                  >
                    <Outlet />
                  </Layout>
                </Authenticated>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/profile/:id" element={<ProfilePage />} />
              <Route path="/production_group_orders" element={<ProductionGroupOrdersList />} />
              <Route path="/production_group_orders/create" element={<ProductionGroupOrderWizard />} />
              <Route path="/production_group_orders/:id" element={<ProductionGroupOrderWizard />} />
              <Route path="/hr" element={<HRPage />} />
              <Route path="/hr/:employeeId" element={<HRPage />} />
              <Route path="/gallery" element={<FilesGalleryPage />} />
              <Route path="/recycle-bin" element={<RecycleBinPage />} />
              <Route path="/share-target" element={<ShareTargetPage />} />
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
              <Route path="/cash_bank" element={<CashBankPage />} />
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

              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<ErrorComponent />} />
            </Route>
          </Routes>

          <UnsavedChangesNotifier />
          <DocumentTitleHandler handler={titleHandler} />
        </Refine>
      </Suspense>
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
    <BrowserRouter>
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
        <AntdApp>
          <PwaInstallPrompt />
          <RefineAppContent />
          <UploadProgressOverlay />
        </AntdApp>
      </ConfigProvider>
    </BrowserRouter>
  );
}

export default App;
