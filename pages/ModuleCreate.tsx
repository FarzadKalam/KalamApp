import { useEffect, useState } from "react";
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
import { fetchCurrentUserRoleContext } from "../utils/permissions";
import { getCachedAuthUser } from "../utils/sessionCache";
import { buildClientFallbackSystemCode, supportsSystemCode } from "../utils/systemCode";
import { syncRecordTags } from "../utils/recordTags";
import { copyProductionOrderRelations } from "../utils/recordCopy";

const isUuid = (value: any) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));

const isStatementTimeoutError = (error: any) =>
  String(error?.code || "").trim() === "57014"
  || String(error?.message || "").toLowerCase().includes("statement timeout");

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
  const copySource = (location.state as any)?.copySource as
    | { sourceRecordId?: string; copyRelations?: boolean }
    | undefined;

  const runPostCreateCopy = async (insertedId?: string | null) => {
    if (!moduleId || !insertedId) return;
    if (moduleId === "production_orders" && copySource?.copyRelations && copySource?.sourceRecordId) {
      await copyProductionOrderRelations(supabase, String(copySource.sourceRecordId), String(insertedId));
    }
  };

  useEffect(() => {
    let active = true;
    const fetchCreatePermission = async () => {
      if (!moduleId) {
        if (active) setPermissionLoading(false);
        return;
      }
      try {
        const context = await fetchCurrentUserRoleContext(supabase);
        if (!context.userId) {
          if (active) {
            setCanCreate(false);
            setPermissionLoading(false);
          }
          return;
        }

        const modulePerms = context.permissions?.[moduleId] || {};
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
    <div className="p-4 md:p-6 max-w-[1560px] mx-auto animate-fadeIn">

        <SmartForm
          module={moduleConfig}
          visible={true}
          displayMode="embedded"
          initialValues={initialValuesFromState}
          onCancel={() => navigate(-1)}
          onSave={async (values, meta) => {
            try {
              const selectedTags = Array.isArray(meta?.selectedTags) ? meta.selectedTags : [];
              if (moduleId === "process_templates") {
                const { data: inserted, error } = await supabase
                  .from(moduleConfig.table)
                  .insert(values)
                  .select("*")
                  .single();
                if (error) throw error;
                if (!inserted?.id) throw new Error("ثبت الگوی فرآیند ناموفق بود");

                if (moduleId && selectedTags.length > 0) {
                  await syncRecordTags(supabase, moduleId, String(inserted.id), selectedTags);
                }
                await runPostCreateCopy(String(inserted.id));
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

                if (moduleId && selectedTags.length > 0) {
                  await syncRecordTags(supabase, moduleId, String(inserted.id), selectedTags);
                }
                await runPostCreateCopy(String(inserted.id));
                const authUser = await getCachedAuthUser(supabase);
                const userId = authUser?.id || null;
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
                  includePayments: true,
                });
                if (accountingSync.errors.length > 0) {
                  console.warn("هشدارهای همگام‌سازی سند حسابداری فاکتور:", accountingSync.errors);
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
              if (moduleId && supportsSystemCode(moduleId) && !payload.system_code) {
                payload.system_code = await buildClientFallbackSystemCode(supabase, moduleId, moduleConfig.table);
              }
              const authUser = await getCachedAuthUser(supabase);
              const userId = authUser?.id || null;
              const withAuditFields = (recordPayload: Record<string, any>) => {
                if (!userId) return { ...recordPayload };
                return {
                  ...recordPayload,
                  created_by: recordPayload.created_by ?? userId,
                  updated_by: recordPayload.updated_by ?? userId,
                };
              };
              const isMissingAuditColumnError = (error: any) => {
                const code = String(error?.code || "").toUpperCase();
                const text = String(error?.message || error?.details || "").toLowerCase();
                return (
                  code === "42703"
                  || code === "PGRST204"
                  || text.includes("created_by")
                  || text.includes("updated_by")
                );
              };

              let insertResult = await supabase
                .from(moduleConfig.table)
                .insert(withAuditFields(payload))
                .select("id")
                .single();

              if (insertResult.error && isMissingAuditColumnError(insertResult.error)) {
                insertResult = await supabase
                  .from(moduleConfig.table)
                  .insert(payload)
                  .select("id")
                  .single();
              }
              if (
                insertResult.error
                && moduleId
                && supportsSystemCode(moduleId)
                && !payload.system_code
                && isStatementTimeoutError(insertResult.error)
              ) {
                const fallbackSystemCode = await buildClientFallbackSystemCode(supabase, moduleId, moduleConfig.table);
                const payloadWithSystemCode = { ...payload, system_code: fallbackSystemCode };

                insertResult = await supabase
                  .from(moduleConfig.table)
                  .insert(withAuditFields(payloadWithSystemCode))
                  .select("id")
                  .single();

                if (insertResult.error && isMissingAuditColumnError(insertResult.error)) {
                  insertResult = await supabase
                    .from(moduleConfig.table)
                    .insert(payloadWithSystemCode)
                    .select("id")
                    .single();
                }
              }

              if (insertResult.error) throw insertResult.error;
              const insertedId = insertResult.data?.id ? String(insertResult.data.id) : "";
              if (moduleId && insertedId && selectedTags.length > 0) {
                await syncRecordTags(supabase, moduleId, insertedId, selectedTags);
              }
              await runPostCreateCopy(insertedId);

              if (moduleId) {
                await runWorkflowsForEvent({
                  moduleId,
                  event: "create",
                  currentRecord: { ...(payload as Record<string, any>), id: insertedId || undefined },
                });
              }
              if (insertedId) {
                navigate(`/${moduleId}/${insertedId}`);
              } else {
                navigate(`/${moduleId}`);
              }
            } catch (err: any) {
              throw err;
            }
          }}
        />
    </div>
  );
};

