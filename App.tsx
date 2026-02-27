import { useCallback, useEffect, useState } from "react";
import { Refine, Authenticated } from "@refinedev/core";
import { notificationProvider, ErrorComponent } from "@refinedev/antd";
import { dataProvider } from "@refinedev/supabase";
import { authProvider } from "./authProvider";
import routerBindings, { UnsavedChangesNotifier, DocumentTitleHandler, CatchAllNavigate } from "@refinedev/react-router-v6";
import { BrowserRouter, Route, Routes, Outlet, useParams } from "react-router-dom";
import { ConfigProvider, App as AntdApp, theme as antdTheme } from "antd";
import faIR from "antd/locale/fa_IR";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/Settings/SettingsPage";
import { JalaliLocaleListener } from "antd-jalali";

// ❌ تمام ایمپورت‌ها و تنظیمات dayjs را از اینجا حذف کردیم
// چون الان در initDayjs.ts و index.tsx مدیریت می‌شوند.

import { supabase } from "./supabaseClient";
import { MODULES } from "./moduleRegistry";
import Layout from "./components/Layout";
import { ModuleListRefine } from "./pages/ModuleList_Refine";
import ModuleShow from "./pages/ModuleShow";
import "./App.css";
import { ModuleCreate } from "./pages/ModuleCreate";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import AccountingPage from "./pages/AccountingPage";
import ChartOfAccountsTreePage from "./pages/ChartOfAccountsTreePage";
import AccountingRecordPage from "./pages/AccountingRecordPage";
import JournalEntryCreatePage from "./pages/JournalEntryCreatePage";
import JournalEntryShowPage from "./pages/JournalEntryShowPage";
import InquiryForm from "./pages/InquiryForm";
import ProductionGroupOrdersList from "./pages/ProductionGroupOrdersList";
import ProductionGroupOrderWizard from "./pages/ProductionGroupOrderWizard";
import HRPage from "./pages/HRPage";
import FilesGalleryPage from "./pages/FilesGalleryPage";
import {
  BRANDING_INTEGRATION_CONNECTION_TYPE,
  BRANDING_INTEGRATION_PROVIDER,
  BRANDING_UPDATED_EVENT,
  DEFAULT_BRANDING,
  THEME_STORAGE_KEY,
  applyBrandCssVariables,
  mergeBrandingConfig,
  type BrandingSettingsPayload,
} from "./theme/brandTheme";
import { isAccountingMinimalModule } from "./utils/accountingModules";

const getInitialDarkMode = () => {
  if (typeof window === "undefined") return false;
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === "dark") return true;
  if (savedTheme === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
};

function App() {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(getInitialDarkMode);
  const [branding, setBranding] = useState(DEFAULT_BRANDING);

  useEffect(() => {
    document.body.style.fontFamily = 'Vazirmatn, sans-serif';
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
    window.localStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  const loadBranding = useCallback(async () => {
    try {
      const [companyResult, themeResult] = await Promise.all([
        supabase
          .from('company_settings')
          .select('*')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('integration_settings')
          .select('id, settings')
          .eq('connection_type', BRANDING_INTEGRATION_CONNECTION_TYPE)
          .eq('provider', BRANDING_INTEGRATION_PROVIDER)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const companyRow = (companyResult.data || {}) as Record<string, any>;
      const companyFullName = String(companyRow.company_full_name || companyRow.company_name || '').trim();
      const tradeName = String(companyRow.trade_name || '').trim();
      const paletteKey = String(companyRow.brand_palette_key || '').trim();
      const settingsContainer = themeResult.data?.settings;
      const rawBranding =
        settingsContainer &&
        typeof settingsContainer === 'object' &&
        'branding' in (settingsContainer as Record<string, unknown>) &&
        (settingsContainer as Record<string, unknown>).branding &&
        typeof (settingsContainer as Record<string, unknown>).branding === 'object'
          ? ((settingsContainer as Record<string, unknown>).branding as Record<string, unknown>)
          : (settingsContainer as Record<string, unknown> | undefined);

      const merged = mergeBrandingConfig(DEFAULT_BRANDING, {
        ...(rawBranding || {}),
        palette_key: String(rawBranding?.palette_key || paletteKey || DEFAULT_BRANDING.paletteKey) as BrandingSettingsPayload['palette_key'],
        brand_name: String(rawBranding?.brand_name || tradeName || companyFullName || DEFAULT_BRANDING.brandName),
        app_title: String(rawBranding?.app_title || companyFullName || tradeName || DEFAULT_BRANDING.appTitle),
        short_name: String(rawBranding?.short_name || tradeName || companyFullName || DEFAULT_BRANDING.shortName),
      });
      setBranding(merged);
    } catch {
      setBranding(DEFAULT_BRANDING);
    }
  }, []);

  useEffect(() => {
    loadBranding();
    window.addEventListener(BRANDING_UPDATED_EVENT, loadBranding as EventListener);
    return () => {
      window.removeEventListener(BRANDING_UPDATED_EVENT, loadBranding as EventListener);
    };
  }, [loadBranding]);

  useEffect(() => {
    applyBrandCssVariables(branding);
    document.documentElement.setAttribute('data-brand-title', branding.appTitle);
  }, [branding]);

  useEffect(() => {
    const publicPaths = ["/inquiry"];

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      const eventName = String(event);
      const pathname = window.location.pathname;
      const isPublic = publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));

      if ((eventName === "SIGNED_OUT" || eventName === "TOKEN_REFRESH_FAILED") && !isPublic) {
        window.location.replace("/login");
      }
    });

    return () => {
      subscription?.subscription?.unsubscribe();
    };
  }, []);

  const resources = Object.values(MODULES).map((mod) => ({
    name: mod.id, 
    list: `/${mod.id}`,
    show: `/${mod.id}/:id`,
    create: `/${mod.id}/create`,
    edit: `/${mod.id}/:id`,
    meta: {
      label: mod.titles.fa,
    },
  }));

  const getStandalonePageTitle = (pathname?: string) => {
    if (!pathname) return null;
    if (pathname === "/") return "داشبورد";
    if (pathname.startsWith("/login")) return "ورود";
    if (pathname.startsWith("/inquiry")) return "فرم استعلام";
    if (pathname.startsWith("/settings")) return "تنظیمات";
    if (pathname.startsWith("/profile")) return "پروفایل";
    if (pathname.startsWith("/hr")) return "منابع انسانی";
    if (pathname.startsWith("/gallery")) return "گالری فایل‌ها";
    if (pathname === "/accounting" || pathname.startsWith("/accounting/")) return "حسابداری";
    if (pathname === "/chart_of_accounts") return "کدینگ حساب ها";
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
    return <ModuleListRefine />;
  };

  const ModuleCreateRouteResolver: React.FC = () => {
    const { moduleId: routeModuleId } = useParams();
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
    if (routeModuleId === "journal_entries") {
      return <JournalEntryShowPage />;
    }
    if (isAccountingMinimalModule(routeModuleId)) {
      return <AccountingRecordPage />;
    }
    return <ModuleShow />;
  };

  return (
    <BrowserRouter>
      <ConfigProvider 
        direction="rtl" 
        locale={faIR} 
        theme={{
          algorithm: isDarkMode ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: {
            colorPrimary: branding.palette.primary,
            fontFamily: 'Vazirmatn, sans-serif',
          }
        }}
      >
        <JalaliLocaleListener />
        <AntdApp>
          <Refine
            dataProvider={dataProvider(supabase)}
            authProvider={authProvider}
            notificationProvider={notificationProvider}
            routerProvider={routerBindings}
            resources={resources} 
            options={{
              syncWithLocation: true, 
              warnWhenUnsavedChanges: true, 
              projectId: "kalam-tazeh-holding",
            }}
          >
            <Routes>
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
                      toggleTheme={() => setIsDarkMode((prev) => !prev)}
                      brandShortName={branding.shortName}
                    >
                      <Outlet />
                    </Layout>
                  </Authenticated>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/production_group_orders" element={<ProductionGroupOrdersList />} />
                <Route path="/production_group_orders/create" element={<ProductionGroupOrderWizard />} />
                <Route path="/production_group_orders/:id" element={<ProductionGroupOrderWizard />} />
                <Route path="/hr" element={<HRPage />} />
                <Route path="/hr/:employeeId" element={<HRPage />} />
                <Route path="/gallery" element={<FilesGalleryPage />} />
                <Route path="/accounting" element={<AccountingPage />} />
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
        </AntdApp>
      </ConfigProvider>
    </BrowserRouter>
  );
}

export default App;
