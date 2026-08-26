import { useEffect, useMemo, useState } from 'react';
import type { ModuleDefinition } from '../types';
import { CONTENT_CALENDAR_MODULE_ID } from '../modules/contentCalendarsConfig';
import { hasContentCalendarFeature } from '../utils/saasPlanFeatures';
import { fetchCurrentUserRoleContext, SAAS_ADMIN_PERMISSION_KEY } from '../utils/permissions';
import { supabase } from '../supabaseClient';

const CONTENT_CALENDAR_RELATION_FIELD = 'content_calendar_id';

export const withContentCalendarPlanSupport = (
  module: ModuleDefinition | null | undefined,
  enabled: boolean,
): ModuleDefinition | null => {
  if (!module) return null;
  if (module.id === CONTENT_CALENDAR_MODULE_ID) return enabled ? module : null;
  if (enabled) return module;
  const fields = (module.fields || []).filter((field) => field.key !== CONTENT_CALENDAR_RELATION_FIELD);
  const relatedTabs = (module.relatedTabs || []).filter((tab) => (
    tab.targetModule !== CONTENT_CALENDAR_MODULE_ID && tab.foreignKey !== CONTENT_CALENDAR_RELATION_FIELD
  ));
  return fields.length === module.fields.length && relatedTabs.length === (module.relatedTabs || []).length
    ? module
    : { ...module, fields, relatedTabs };
};

export const useContentCalendarFeature = () => {
  const [enabled, setEnabled] = useState(false);
  const [resolved, setResolved] = useState(false);
  useEffect(() => {
    let active = true;
    void Promise.all([
      // نقش و قابلیت پلن ممکن است همین لحظه توسط مدیر SaaS تغییر کرده باشد؛
      // این مسیر نباید به cache قدیمیِ همان نشست تکیه کند.
      hasContentCalendarFeature({ force: true }),
      fetchCurrentUserRoleContext(supabase, { force: true }),
    ])
      .then(([featureEnabled, roleContext]) => {
        const saasAdmin = roleContext.permissions?.[SAAS_ADMIN_PERMISSION_KEY];
        const isSaasAdmin = saasAdmin?.view === true || saasAdmin?.edit === true;
        if (active) setEnabled(featureEnabled || isSaasAdmin);
      })
      .catch(() => { if (active) setEnabled(false); })
      .finally(() => { if (active) setResolved(true); });
    return () => { active = false; };
  }, []);
  return { enabled, resolved };
};

export const useContentCalendarPlanModule = (module: ModuleDefinition | null | undefined) => {
  const { enabled, resolved } = useContentCalendarFeature();
  const moduleConfig = useMemo(() => withContentCalendarPlanSupport(module, enabled), [enabled, module]);
  return { moduleConfig, contentCalendarEnabled: enabled, resolved };
};
