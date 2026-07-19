import { Suspense, lazy, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import ConfigProvider from "antd/es/config-provider";
import AntdApp from "antd/es/app";
import faIR from "antd/locale/fa_IR";
import { JalaliLocaleListener } from "antd-jalali";
import { trackPageView } from "./utils/analytics";

const loadInquiryForm = () => import("./pages/InquiryForm");
const loadInvoicePublicPage = () => import("./pages/InvoicePublicPage");
const loadDeliveryPublicPage = () => import("./pages/DeliveryPublicPage");
const loadPaymentCallbackPage = () => import("./pages/PaymentCallbackPage");

const InquiryForm = lazy(loadInquiryForm);
const InvoicePublicPage = lazy(loadInvoicePublicPage);
const DeliveryPublicPage = lazy(loadDeliveryPublicPage);
const PaymentCallbackPage = lazy(loadPaymentCallbackPage);

const SilentRouteFallback = () => null;

const LazyRouteBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={<SilentRouteFallback />}>{children}</Suspense>
);

const RouteTracker: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);

  return null;
};

const PublicRouteApp: React.FC = () => {
  useEffect(() => {
    document.body.style.fontFamily = "var(--font-family-app)";
  }, []);

  return (
    <HelmetProvider>
      <BrowserRouter>
        <RouteTracker />
        <ConfigProvider
          direction="rtl"
          locale={faIR}
          theme={{ token: { fontFamily: "Peyda, Tahoma, Arial, sans-serif" } }}
        >
          <JalaliLocaleListener />
          <AntdApp
            message={{ top: 72, duration: 3.5, maxCount: 4 }}
            notification={{ placement: "topLeft", duration: 4.5, maxCount: 4 }}
          >
            <LazyRouteBoundary>
              <Routes>
                <Route path="/inquiry/*" element={<InquiryForm />} />
                <Route path="/i/:code" element={<InvoicePublicPage />} />
                <Route path="/d/:code" element={<DeliveryPublicPage />} />
                <Route path="/payment/callback" element={<PaymentCallbackPage />} />
              </Routes>
            </LazyRouteBoundary>
          </AntdApp>
        </ConfigProvider>
      </BrowserRouter>
    </HelmetProvider>
  );
};

export const mountPublicRouteApp = (container: HTMLElement) => {
  createRoot(container).render(<PublicRouteApp />);
};
