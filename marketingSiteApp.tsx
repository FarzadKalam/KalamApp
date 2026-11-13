import AppFeedbackHost from "./components/feedback/AppFeedbackHost";
import { FEEDBACK_ANTD_CONFIG } from './utils/feedbackPolicy';
import './initDayjs';
import { Suspense, lazy, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import ConfigProvider from 'antd/es/config-provider';
import AntdApp from 'antd/es/app';
import faIR from 'antd/locale/fa_IR';
import { JalaliLocaleListener } from 'antd-jalali';
import PublicSite from './pages/PublicSite';
import PwaInstallPrompt from './components/PwaInstallPrompt';
import { PublicThemeBoundary } from './components/public/PublicThemeBoundary';
import { TAZE_SYSTEM_BRAND_ASSETS } from './utils/tazeSystemBrandAssets';
import { trackPageView, sendWebVitals } from './utils/analytics';

const InvoicePublicPage = lazy(() => import('./pages/InvoicePublicPage'));
const DeliveryPublicPage = lazy(() => import('./pages/DeliveryPublicPage'));
const OnlineCatalogPublicPage = lazy(() => import('./pages/OnlineCatalogPublicPage'));
const PaymentCallbackPage = lazy(() => import('./pages/PaymentCallbackPage'));

const MarketingRouteTracker = () => {
  const location = useLocation();
  useEffect(() => { trackPageView(location.pathname + location.search); }, [location.pathname, location.search]);
  return null;
};

// Public routes and providers are shared with App's fallback entry. Loading the
// marketing host directly avoids the tenant registry, Refine and notifications.
const MarketingSiteApp = () => {
  useEffect(() => {
    document.body.style.fontFamily = 'var(--font-family-app)';
    const existing = document.querySelector<HTMLLinkElement>('link[rel*="icon"]');
    const link = existing || document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.href = TAZE_SYSTEM_BRAND_ASSETS.favicon;
    if (!existing) document.head.appendChild(link);
  }, []);

  useEffect(() => {
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

  useEffect(() => { void sendWebVitals(); }, []);

  return (
    <HelmetProvider>
      <BrowserRouter>
        <MarketingRouteTracker />
        <ConfigProvider direction="rtl" locale={faIR} theme={{ token: { fontFamily: 'Peyda, Tahoma, Arial, sans-serif' } }}>
          <JalaliLocaleListener />
          <AntdApp message={FEEDBACK_ANTD_CONFIG.message} notification={FEEDBACK_ANTD_CONFIG.notification}>
          <AppFeedbackHost />
            <PwaInstallPrompt />
            <PublicThemeBoundary>
              <Suspense fallback={null}>
                <Routes>
                  <Route path="/i/:code" element={<InvoicePublicPage />} />
                  <Route path="/d/:code" element={<DeliveryPublicPage />} />
                  <Route path="/c/:token" element={<OnlineCatalogPublicPage />} />
                  <Route path="/payment/callback" element={<PaymentCallbackPage />} />
                  <Route path="/*" element={<PublicSite />} />
                </Routes>
              </Suspense>
            </PublicThemeBoundary>
          </AntdApp>
        </ConfigProvider>
      </BrowserRouter>
    </HelmetProvider>
  );
};

export default MarketingSiteApp;

export const mountMarketingSiteApp = (container: HTMLElement) => {
  createRoot(container).render(<MarketingSiteApp />);
};
