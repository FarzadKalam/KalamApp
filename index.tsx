// 👇👇👇 این خط باید اولین خط باشد 👇👇👇
import "./initDayjs"; 

import { createRoot } from "react-dom/client";
import { focusManager } from "@tanstack/react-query";
import App from "./App";
import "./index.css";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { DEFAULT_BRANDING, resolveSmartThemeMode, THEME_STORAGE_KEY } from "./theme/brandTheme";
import { applyBrandingRuntime, loadRuntimeBranding, persistRuntimeBranding, readCachedBranding } from "./utils/brandingRuntime";

const container = document.getElementById("root");
const root = createRoot(container!);

focusManager.setEventListener(() => {
  return () => undefined;
});
focusManager.setFocused(true);

const bootstrapAndRender = async () => {
  try {
    const runtimeBranding = await loadRuntimeBranding();
    persistRuntimeBranding(runtimeBranding);
  } catch {
    // keep cached/default branding when public bootstrap is unavailable
  }
  root.render(<App />);
};

const cached = readCachedBranding();
applyBrandingRuntime(cached || DEFAULT_BRANDING);

const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
const initialDarkMode = savedTheme === "dark" || (savedTheme !== "light" && resolveSmartThemeMode() === "dark");
document.documentElement.classList.toggle("dark", initialDarkMode);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}

void bootstrapAndRender();
