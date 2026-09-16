const normalizeHostname = (value: string) => String(value || "").trim().toLowerCase();

export const getCurrentHostname = () => {
  if (typeof window === "undefined") return "";
  return normalizeHostname(window.location.hostname || "");
};

export const isMarketingHost = (hostname = getCurrentHostname()) => {
  const normalized = normalizeHostname(hostname);
  return normalized === "tazesystem.ir" || normalized === "www.tazesystem.ir";
};

export const isInternalRootHost = (hostname = getCurrentHostname()) => {
  const normalized = normalizeHostname(hostname);
  return (
    normalized === "kalamapp.ir" ||
    normalized === "www.kalamapp.ir" ||
    normalized === "kalam.tazesystem.ir"
  );
};

export const isSaasAppHost = (hostname = getCurrentHostname()) => {
  return normalizeHostname(hostname) === "app.tazesystem.ir";
};

// پنل فروشندهٔ تازه سیستم، فضای عملیاتی خود محصول است؛ نه زیردامنهٔ یک مشتری.
// تفکیک آن از tenant مانع از بارگذاری برند یا سازمان مشتری روی این آدرس می‌شود.
export const isSaasAdminPanelHost = (hostname = getCurrentHostname()) => {
  return normalizeHostname(hostname) === "panel.tazesystem.ir";
};

export const isLocalHost = (hostname = getCurrentHostname()) => {
  const normalized = normalizeHostname(hostname);
  return normalized === "localhost" || normalized === "127.0.0.1";
};

export const isTenantHost = (hostname = getCurrentHostname()) => {
  const normalized = normalizeHostname(hostname);
  if (!normalized.endsWith(".tazesystem.ir")) return false;
  return ![
    "tazesystem.ir",
    "www.tazesystem.ir",
    "app.tazesystem.ir",
    "panel.tazesystem.ir",
    "kalam.tazesystem.ir",
  ].includes(normalized);
};

export const isTazeSystemFamilyHost = (hostname = getCurrentHostname()) =>
  isMarketingHost(hostname) || isSaasAppHost(hostname) || isSaasAdminPanelHost(hostname) || isTenantHost(hostname);

export const isSharedAppHost = (hostname = getCurrentHostname()) =>
  isInternalRootHost(hostname) || isMarketingHost(hostname) || isSaasAppHost(hostname) || isSaasAdminPanelHost(hostname);

export const getMarketingSiteBasePath = (hostname = getCurrentHostname()) =>
  isMarketingHost(hostname) ? "" : "/tazesystem";

export const getMarketingPanelUrl = () => "https://app.tazesystem.ir";

export const getInternalAppUrl = () => "https://kalam.tazesystem.ir";

export const getInternalLoginUrl = () => `${getInternalAppUrl()}/login`;

export const getDefaultAuthenticatedAppPath = (hostname = getCurrentHostname()) => {
  if (isSaasAppHost(hostname) || isSaasAdminPanelHost(hostname) || isTenantHost(hostname)) return "/dashboard";
  return "/";
};
