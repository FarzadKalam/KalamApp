import "./index.css";
import { DEFAULT_BRANDING, resolveSmartThemeMode, THEME_STORAGE_KEY } from "./theme/brandTheme";
import { applyBrandingRuntime, loadRuntimeBranding, persistRuntimeBranding, readCachedBranding } from "./utils/brandingRuntime";

const container = document.getElementById("root");

const bootstrapAndRender = async () => {
  const appModulePromise = import("./initDayjs").then(() => import("./App"));

  try {
    const runtimeBranding = await loadRuntimeBranding();
    persistRuntimeBranding(runtimeBranding);
  } catch {
    // keep cached/default branding when public bootstrap is unavailable
  }

  const { mountApp } = await appModulePromise;
  mountApp(container!);
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
