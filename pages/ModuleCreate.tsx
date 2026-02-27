import { useEffect, useState } from "react";
import { useForm } from "@refinedev/antd";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { MODULES } from "../moduleRegistry";
import SmartForm from "../components/SmartForm";
import { Result, Spin } from "antd";
import { supabase } from "../supabaseClient";
import { applyInvoiceFinalizationInventory } from "../utils/invoiceInventoryWorkflow";
import { runWorkflowsForEvent } from "../utils/workflowRuntime";
import { syncCustomerLevelsByInvoiceCustomers } from "../utils/customerLeveling";
import { attachTaskCompletionIfNeeded } from "../utils/taskCompletion";
import { syncInvoiceAccountingEntries } from "../utils/accountingAutoPosting";

const isUuid = (value: any) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));

const syncProcessTemplateStages = async (templateId: string, rawStages: any[]) => {
  const nextStages = (Array.isArray(rawStages) ? rawStages : []).map((stage: any, index: number) => ({
    id: isUuid(stage?.id) ? String(stage.id) : null,
    stage_name: String(stage?.name || stage?.stage_name || `مرحله ${index + 1}`),
    sort_order: Number(stage?.sort_order || ((index + 1) * 10)),
    wage: Number(stage?.wage || 0),
    metadata: {
      ...(stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {}),
      weight: Number(stage?.weight || stage?.metadata?.weight || 0),
      duration_value: Number(stage?.duration_value || stage?.metadata?.duration_value || 0),
      duration_unit: String(stage?.duration_unit || stage?.metadata?.duration_unit || 'day') === 'hour' ? 'hour' : 'day',
      duration_from: String(stage?.duration_from || stage?.metadata?.duration_from || 'project_start') === 'previous_stage_end' ? 'previous_stage_end' : 'project_start',
    },
    default_assignee_id: isUuid(stage?.default_assignee_id) ? String(stage.default_assignee_id) : null,
    default_assignee_role_id: isUuid(stage?.default_assignee_role_id) ? String(stage.default_assignee_role_id) : null,
  }));

  const { data: existingRows, error: existingError } = await supabase
    .from("process_template_stages")
    .select("id")
    .eq("template_id", templateId);
  if (existingError) throw existingError;

  const existingIds = new Set((existingRows || []).map((row: any) => String(row.id)));
  const keptExistingIds = new Set(
    nextStages
      .map((stage) => stage.id)
      .filter((id): id is string => Boolean(id && existingIds.has(id)))
  );
  const removeIds = Array.from(existingIds).filter((id) => !keptExistingIds.has(id));
  if (removeIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("process_template_stages")
      .delete()
      .in("id", removeIds);
    if (deleteError) throw deleteError;
  }

  for (const stage of nextStages) {
    if (stage.id && existingIds.has(stage.id)) {
      const { error: updateError } = await supabase
        .from("process_template_stages")
        .update({
          stage_name: stage.stage_name,
          sort_order: stage.sort_order,
          wage: stage.wage,
          metadata: stage.metadata,
          default_assignee_id: stage.default_assignee_id,
          default_assignee_role_id: stage.default_assignee_role_id,
        })
        .eq("id", stage.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from("process_template_stages")
        .insert({
          template_id: templateId,
          stage_name: stage.stage_name,
          sort_order: stage.sort_order,
          wage: stage.wage,
          metadata: stage.metadata,
          default_assignee_id: stage.default_assignee_id,
          default_assignee_role_id: stage.default_assignee_role_id,
        });
      if (insertError) throw insertError;
    }
  }
};

export const ModuleCreate = () => {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const moduleConfig = moduleId ? MODULES[moduleId] : null;
  const [permissionLoading, setPermissionLoading] = useState(true);
  const [canCreate, setCanCreate] = useState(true);
  const initialValuesFromState = (location.state as any)?.initialValues || {};

  const { formProps } = useForm({
    action: "create",
    resource: moduleId,
    redirect: "list",
    queryOptions: { enabled: false },
    warnWhenUnsavedChanges: true,
  });

  useEffect(() => {
    let active = true;
    const fetchCreatePermission = async () => {
      if (!moduleId) {
        if (active) setPermissionLoading(false);
        return;
      }
      try {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user;
        if (!user) {
          if (active) {
            setCanCreate(false);
            setPermissionLoading(false);
          }
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role_id")
          .eq("id", user.id)
          .maybeSingle();

        if (!profile?.role_id) {
          if (active) {
            setCanCreate(true);
            setPermissionLoading(false);
          }
          return;
        }

        const { data: role } = await supabase
          .from("org_roles")
          .select("permissions")
          .eq("id", profile.role_id)
          .maybeSingle();

        const modulePerms = role?.permissions?.[moduleId] || {};
        if (active) {
          setCanCreate(modulePerms.edit !== false);
          setPermissionLoading(false);
        }
      } catch {
        if (active) {
          setCanCreate(true);
          setPermissionLoading(false);
        }
      }
    };

    fetchCreatePermission();
    return () => {
      active = false;
    };
  }, [moduleId]);

  if (!moduleConfig) {
    return <Result status="404" title="ماژول یافت نشد" />;
  }

  if (permissionLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!canCreate) {
    return (
      <Result
        status="403"
        title="عدم دسترسی"
        subTitle="دسترسی ایجاد یا ویرایش برای این ماژول ندارید."
      />
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto animate-fadeIn">

        <SmartForm
          module={moduleConfig}
          visible={true}
          displayMode="embedded"
          initialValues={initialValuesFromState}
          onCancel={() => navigate(-1)}
          onSave={async (values, meta) => {
            try {
              if (moduleId === "process_templates") {
                const { data: inserted, error } = await supabase
                  .from(moduleConfig.table)
                  .insert(values)
                  .select("*")
                  .single();
                if (error) throw error;
                if (!inserted?.id) throw new Error("ثبت الگوی فرآیند ناموفق بود");

                await syncProcessTemplateStages(String(inserted.id), meta?.templateStagesPreview || []);
                if (moduleId) {
                  await runWorkflowsForEvent({
                    moduleId,
                    event: "create",
                    currentRecord: inserted as Record<string, any>,
                  });
                }
                navigate(`/${moduleId}`);
                return;
              }

              if (moduleId === "invoices" || moduleId === "purchase_invoices") {
                const { data: inserted, error } = await supabase
                  .from(moduleConfig.table)
                  .insert(values)
                  .select("*")
                  .single();
                if (error) throw error;
                if (!inserted?.id) throw new Error("ثبت فاکتور ناموفق بود");

                const { data: authData } = await supabase.auth.getUser();
                const userId = authData?.user?.id || null;
                await applyInvoiceFinalizationInventory({
                  supabase: supabase as any,
                  moduleId,
                  recordId: inserted.id,
                  previousStatus: null,
                  nextStatus: values?.status ?? null,
                  invoiceItems: values?.invoiceItems ?? [],
                  userId,
                });
                const accountingSync = await syncInvoiceAccountingEntries({
                  supabase: supabase as any,
                  moduleId,
                  recordId: inserted.id,
                  recordData: inserted,
                });
                if (accountingSync.errors.length > 0) {
                  console.warn("Invoice accounting sync warnings:", accountingSync.errors);
                }
                if (moduleId === "invoices") {
                  await syncCustomerLevelsByInvoiceCustomers({
                    supabase: supabase as any,
                    customerIds: [inserted?.customer_id || values?.customer_id],
                  });
                }
                if (moduleId) {
                  await runWorkflowsForEvent({
                    moduleId,
                    event: "create",
                    currentRecord: inserted as Record<string, any>,
                  });
                }

                navigate(`/${moduleId}/${inserted.id}`);
                return;
              }

              const payload = moduleId === "tasks"
                ? attachTaskCompletionIfNeeded(values)
                : values;

              await formProps.onFinish?.(payload);
              if (moduleId) {
                await runWorkflowsForEvent({
                  moduleId,
                  event: "create",
                  currentRecord: payload as Record<string, any>,
                });
              }
            } catch (err: any) {
              throw err;
            }
          }}
        />
    </div>
  );
};

