import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { hasReservationsFeature } from "../utils/saasPlanFeatures";
import {
  fetchCurrentUserRoleContext,
  SAAS_ADMIN_PERMISSION_KEY,
} from "../utils/permissions";

export const useReservationsFeature = () => {
  const [enabled, setEnabled] = useState(false);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      hasReservationsFeature({ force: true }),
      fetchCurrentUserRoleContext(supabase, { force: true }),
    ]).then(([featureResult, roleResult]) => {
      const featureEnabled =
        featureResult.status === "fulfilled" && featureResult.value === true;
      const roleContext =
        roleResult.status === "fulfilled" ? roleResult.value : null;
      const permission = roleContext?.permissions?.[SAAS_ADMIN_PERMISSION_KEY];
      const isSaasAdmin =
        permission?.view === true || permission?.edit === true;
      if (active) {
        setEnabled(featureEnabled || isSaasAdmin);
        setResolved(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return { enabled, resolved };
};
