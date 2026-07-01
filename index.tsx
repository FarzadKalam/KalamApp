import "./index.css";
import { DEFAULT_BRANDING, resolveSmartThemeMode, THEME_STORAGE_KEY } from "./theme/brandTheme";
import { applyBrandingRuntime, loadRuntimeBranding, persistRuntimeBranding, readCachedBranding } from "./utils/brandingRuntime";

const container = document.getElementById("root");

const shouldUseStandalonePublicBootstrap = (pathname: string) => {
  const normalizedPath = String(pathname || "").split(/[?#]/)[0] || "/";
  return (
    normalizedPath.startsWith("/i/")
    || normalizedPath.startsWith("/d/")
    || normalizedPath === "/payment/callback"
  );
};

const bootstrapAndRender = async () => {
  const appModulePromise = shouldUseStandalonePublicBootstrap(window.location.pathname)
    ? import("./publicRouteApp")
    : import("./initDayjs").then(() => import("./App"));

  try {
    const runtimeBranding = await loadRuntimeBranding();
    persistRuntimeBranding(runtimeBranding);
  } catch {
    // keep cached/default branding when public bootstrap is unavailable
  }

  const bootstrapModule = await appModulePromise;
  const mount = "mountPublicRouteApp" in bootstrapModule
    ? bootstrapModule.mountPublicRouteApp
    : bootstrapModule.mountApp;
  mount(container!);
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
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: "none" })
      .then((registration) => {
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });
        persistInstalledPwaStorage();
      })
      .catch(() => undefined);
  });
}

void bootstrapAndRender();
