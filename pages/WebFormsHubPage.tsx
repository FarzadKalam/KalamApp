import React, { useMemo } from "react";
import { Alert } from "antd";
import { useLocation } from "react-router-dom";
import { CrudFilters } from "@refinedev/core";
import { MODULES } from "../moduleRegistry";
import ModuleListRefine from "./ModuleList_Refine";
import { isWebFormTargetModule } from "../utils/webForms";

const WebFormsHubPage: React.FC = () => {
  const location = useLocation();
  const targetModuleId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const value = String(params.get("targetModule") || "").trim();
    return isWebFormTargetModule(value) ? value : "";
  }, [location.search]);

  const initialViewFiltersOverride = useMemo<CrudFilters>(
    () =>
      targetModuleId
        ? [{ field: "target_module_id", operator: "eq", value: targetModuleId }]
        : [],
    [targetModuleId]
  );

  return (
    <div className="space-y-4">
      {targetModuleId ? (
        <div className="px-4 md:px-6 pt-4">
          <Alert
            type="info"
            showIcon
            message={`نمایش وب فرم‌های مرتبط با «${MODULES[targetModuleId]?.titles?.fa || targetModuleId}»`}
          />
        </div>
      ) : null}
      <ModuleListRefine
        moduleIdOverride="web_forms"
        initialViewFiltersOverride={initialViewFiltersOverride}
        storageKeySuffix={targetModuleId ? `target:${targetModuleId}` : "all"}
      />
    </div>
  );
};

export default WebFormsHubPage;
