import { getMarketingPanelUrl, getMarketingSiteBasePath } from '../../utils/hostRouting';

export const PANEL_URL = getMarketingPanelUrl();
export const DEMO_URL = 'https://app.tazesystem.ir/demo';
const SITE_BASE = getMarketingSiteBasePath();

export const sitePath = (path = '/') => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (!SITE_BASE) return normalized;
  return normalized === '/' ? SITE_BASE : `${SITE_BASE}${normalized}`;
};
