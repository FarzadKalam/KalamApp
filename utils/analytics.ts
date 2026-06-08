interface WindowWithDataLayer extends Window {
  dataLayer: Record<string, unknown>[];
}

declare const window: WindowWithDataLayer;

function push(data: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(data);
}

export function trackPageView(path: string, title?: string) {
  push({
    event: 'page_view',
    page_path: path,
    page_title: title || document.title,
  });
}

export function trackEvent(eventName: string, params?: Record<string, unknown>) {
  push({ event: eventName, ...params });
}

export async function sendWebVitals() {
  const { onCLS, onINP, onFCP, onLCP, onTTFB } = await import('web-vitals');
  const report = ({ name, value, id }: { name: string; value: number; id: string }) => {
    push({
      event: 'web_vitals',
      metric_name: name,
      metric_value: Math.round(name === 'CLS' ? value * 1000 : value),
      metric_id: id,
    });
  };
  onCLS(report);
  onINP(report);
  onFCP(report);
  onLCP(report);
  onTTFB(report);
}
