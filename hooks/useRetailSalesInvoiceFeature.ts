import { useEffect, useState } from 'react';
import { hasRetailSalesInvoiceFeature } from '../utils/saasPlanFeatures';
import { fetchCurrentUserRoleContext, SAAS_ADMIN_PERMISSION_KEY } from '../utils/permissions';
import { supabase } from '../supabaseClient';

export const useRetailSalesInvoiceFeature = () => {
  const [enabled, setEnabled] = useState(false);
  const [resolved, setResolved] = useState(false);
  useEffect(() => {
    let active = true;
    void fetchCurrentUserRoleContext(supabase, { force: true })
      .then((context) => {
        const admin = context.permissions?.[SAAS_ADMIN_PERMISSION_KEY] || {};
        const isSaasAdmin = admin.view === true || admin.edit === true;
        if (active && isSaasAdmin) setEnabled(true);
        return hasRetailSalesInvoiceFeature({ force: true }).then((feature) => {
          if (active) setEnabled(feature || isSaasAdmin);
        });
      })
      .catch(() => active && setEnabled(false))
      .finally(() => active && setResolved(true));
    return () => { active = false; };
  }, []);
  return { enabled, resolved };
};
