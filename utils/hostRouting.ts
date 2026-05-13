const normalizeHostname = (value: string) => String(value || "").trim().toLowerCase();

export const getCurrentHostname = () => {
  if (typeof window === "undefined") return "";
  return normalizeHostname(window.location.hostname || "");
};

export const isMarketingHost = (hostname = getCurrentHostname()) => {
  const normalized = normalizeHostname(hostname);
  return normalized === "tazesystem.ir" || normalized === "www.tazesystem.ir";
};

export const isSaasAppHost = (hostname = getCurrentHostname()) => {
  return normalizeHostname(hostname) === "app.tazesystem.ir";
};

export const isTenantHost = (hostname = getCurrentHostname()) => {
  const normalized = normalizeHostname(hostname);
  if (!normalized.endsWith(".tazesystem.ir")) return false;
  return !["tazesystem.ir", "www.tazesystem.ir", "app.tazesystem.ir"].includes(normalized);
};

export const isTazeSystemFamilyHost = (hostname = getCurrentHostname()) =>
  isMarketingHost(hostname) || isSaasAppHost(hostname) || isTenantHost(hostname);

export const getMarketingSiteBasePath = (hostname = getCurrentHostname()) =>
  isMarketingHost(hostname) ? "" : "/tazesystem";

export const getMarketingPanelUrl = () => "https://app.tazesystem.ir";

export const getDefaultAuthenticatedAppPath = (hostname = getCurrentHostname()) => {
  if (isSaasAppHost(hostname) || isTenantHost(hostname)) return "/dashboard";
  return "/";
};
