import { useEffect, useState } from 'react';
import { hasCurrentOrgPlanFeature } from '../utils/saasPlanFeatures';

// Per-org identity belongs in the effect key even though the shared loader caches it.
export const useOrgPlanFeature = (feature: string, orgId?: string | null, defaultEnabled = false) => {
  const [result, setResult] = useState<{ key: string; allowed: boolean } | null>(null);
  const key = `${orgId || 'current'}:${feature}:${defaultEnabled}`;
  useEffect(() => {
    let cancelled = false;
    if (orgId === '') { setResult({ key, allowed: false }); return; }
    const load = () => hasCurrentOrgPlanFeature(feature, { defaultEnabled })
      .then((allowed) => { if (!cancelled) setResult({ key, allowed }); })
      .catch(() => { if (!cancelled) setResult({ key, allowed: false }); });
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [key, feature, orgId, defaultEnabled]);
  return result?.key === key ? result.allowed : null;
};
