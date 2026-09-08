import "./index.css";
import { DEFAULT_BRANDING, resolveSmartThemeMode, THEME_STORAGE_KEY } from "./theme/brandTheme";
import { applyBrandingRuntime, loadRuntimeBranding, persistRuntimeBranding, readCachedBranding } from "./utils/brandingRuntime";

const container = document.getElementById("root");

const shouldUseStandalonePublicBootstrap = (pathname: string) => {
  const normalizedPath = String(pathname || "").split(/[?#]/)[0] || "/";
  return (
    normalizedPath.startsWith("/inquiry")
    || normalizedPath.startsWith("/i/")
    || normalizedPath.startsWith("/d/")
    || normalizedPath === "/payment/callback"
  );
};

const bootstrapAndRender = async () => {
  const useStandalonePublicBootstrap = shouldUseStandalonePublicBootstrap(window.location.pathname);
  const appModulePromise = useStandalonePublicBootstrap
    ? import("./publicRouteApp")
    : import("./initDayjs").then(() => import("./App"));
  const runtimeBrandingPromise = loadRuntimeBranding()
    .then((runtimeBranding) => {
      persistRuntimeBranding(runtimeBranding);
      return runtimeBranding;
    })
    .catch(() => undefined);

  const bootstrapModule = await appModulePromise;
  const mount = "mountPublicRouteApp" in bootstrapModule
    ? bootstrapModule.mountPublicRouteApp
    : bootstrapModule.mountApp;
  mount(container!);
  if (!useStandalonePublicBootstrap) {
    await runtimeBrandingPromise;
  }
};

const cached = readCachedBranding();
applyBrandingRuntime(cached || DEFAULT_BRANDING);

const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
const initialDarkMode = savedTheme === "dark" || (savedTheme !== "light" && resolveSmartThemeMode() === "dark");
document.documentElement.classList.toggle("dark", initialDarkMode);

const isStandalonePwa = () => {
  const byMedia = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const byNavigator = Boolean((window.navigator as any)?.standalone);
  return Boolean(byMedia || byNavigator);
};

const persistInstalledPwaStorage = () => {
  if (!isStandalonePwa()) return;
  if (!("storage" in navigator) || typeof navigator.storage?.persist !== "function") return;
  void navigator.storage.persist().catch(() => undefined);
};

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const serviceWorkerUrl = `${import.meta.env.BASE_URL}sw.js?v=${encodeURIComponent(__TAZESYSTEM_APP_VERSION__)}`;
    const controllerBeforeRegistration = navigator.serviceWorker.controller;
    const reloadMarker = `tazesystem:pwa-controller-reload:${__TAZESYSTEM_APP_VERSION__}`;

    const reloadAfterControllerUpdate = () => {
      // نصب نخست نباید صفحه را دوباره بارگذاری کند. فقط وقتی یک کنترلر قدیمی
      // وجود داشته، پس از جایگزینی آن یک‌بار شِل قدیمی برنامه را تازه می‌کنیم.
      if (!controllerBeforeRegistration) return;
      try {
        if (window.sessionStorage.getItem(reloadMarker)) return;
        window.sessionStorage.setItem(reloadMarker, "1");
      } catch {
        // در مرورگرهای محدود هم به‌روزرسانی Service Worker ادامه پیدا می‌کند.
      }
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", reloadAfterControllerUpdate, { once: true });

    void navigator.serviceWorker
      .register(serviceWorkerUrl, { updateViaCache: "none" })
      .then((registration) => {
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });
        void registration.update().catch(() => undefined);
        persistInstalledPwaStorage();
      })
      .catch(() => undefined);
  });
}

void bootstrapAndRender();
