import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { MODULES } from "../moduleRegistry";
import SmartForm from "../components/SmartForm";
import { App, Result, Spin } from "antd";
import { supabase } from "../supabaseClient";
import { normalizeProcessTaskCustomFields, PROCESS_TASK_CUSTOM_FIELDS_KEY } from "../utils/processTaskCustomFields";
import { normalizeProcessTaskStatusOptions, PROCESS_TASK_STATUS_OPTIONS_KEY } from "../utils/processTaskStatusOptions";
import { applyInvoiceFinalizationInventory } from "../utils/invoiceInventoryWorkflow";
import { applyStockTransferInventory } from "../utils/stockTransferInventoryWorkflow";
import { runWorkflowsForEvent } from "../utils/workflowRuntime";
import { syncCustomerLevelsByInvoiceCustomers } from "../utils/customerLeveling";
import { attachTaskCompletionIfNeeded } from "../utils/taskCompletion";
import { syncInvoiceAccountingEntries } from "../utils/accountingAutoPosting";
import { fetchCurrentUserRoleContext, isSaasAdminModuleId, SAAS_ADMIN_PERMISSION_KEY } from "../utils/permissions";
import { getCachedAuthUser } from "../utils/sessionCache";
import { buildClientFallbackSystemCode, supportsSystemCode } from "../utils/systemCode";
import { syncRecordTags } from "../utils/recordTags";
import { copyProcessTemplateStagesRelations, copyProductionOrderRelations } from "../utils/recordCopy";
import { normalizeOperationalDocumentTotals } from "../utils/operationalDocumentTotals";
import { shouldAutoSyncInvoiceAccounting } from "../utils/invoiceAccountingPolicy";
import { buildInstructionModuleConfig, buildInstructionModuleOptions, INSTRUCTIONS_MODULE_ID, normalizeInstructionIdList } from "../utils/instructionSupport";
import { syncProcessTemplateStageInstructionLinks } from "../utils/processTemplateStageInstructions";
import { getTaxpayerInvoicePatternForModule, isReturnInvoiceModuleId } from "../utils/invoiceModuleRouting";

const isUuid = (value: any) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));

const isStatementTimeoutError = (error: any) =>
  String(error?.code || "").trim() === "57014"
  || String(error?.message || "").toLowerCase().includes("statement timeout");

const isDuplicateSystemCodeError = (error: any) => {
  const code = String(error?.code || "").toUpperCase();
  const text = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  return code === "23505" && (text.includes("system_code") || text.includes("org_system_code"));
};

const syncProcessTemplateStages = async (templateId: string, rawStages: any[]) => {
  const nextStages = (Array.isArray(rawStages) ? rawStages : []).map((stage: any, index: number) => ({
    id: isUuid(stage?.id) ? String(stage.id) : null,
    stage_name: String(stage?.name || stage?.stage_name || `مرحله ${index + 1}`),
    sort_order: Number(stage?.sort_order || ((index + 1) * 10)),
    wage: Number(stage?.wage || 0),
    metadata: {
      ...(stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {}),
      [PROCESS_TASK_CUSTOM_FIELDS_KEY]: normalizeProcessTaskCustomFields(
        stage?.process_task_custom_fields || stage?.metadata?.[PROCESS_TASK_CUSTOM_FIELDS_KEY]
      ),
      [PROCESS_TASK_STATUS_OPTIONS_KEY]: normalizeProcessTaskStatusOptions(
        stage?.process_task_status_options || stage?.metadata?.[PROCESS_TASK_STATUS_OPTIONS_KEY]
      ),
      instruction_ids: normalizeInstructionIdList(
        stage?.instruction_ids || stage?.metadata?.instruction_ids
      ),
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

  await syncProcessTemplateStageInstructionLinks(supabase, templateId, nextStages);
};

export const ModuleCreate = () => {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { message: messageApi } = App.useApp();
  const baseModuleConfig = moduleId ? MODULES[moduleId] : null;
  const [permissionLoading, setPermissionLoading] = useState(true);
  const [canCreate, setCanCreate] = useState(true);
  const [instructionUsers, setInstructionUsers] = useState<any[]>([]);
  const [instructionRoles, setInstructionRoles] = useState<any[]>([]);
  const initialValuesFromState = (location.state as any)?.initialValues || {};
  const copySource = (location.state as any)?.copySource as
    | { sourceRecordId?: string; copyRelations?: boolean }
    | undefined;

  const runPostCreateCopy = async (insertedId?: string | null) => {
    if (!moduleId || !insertedId) return;
    if (moduleId === "production_orders" && copySource?.copyRelations && copySource?.sourceRecordId) {
      await copyProductionOrderRelations(supabase, String(copySource.sourceRecordId), String(insertedId));
      return;
    }
    if (moduleId === "process_templates" && copySource?.copyRelations && copySource?.sourceRecordId) {
      await copyProcessTemplateStagesRelations(supabase, String(copySource.sourceRecordId), String(insertedId));
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

        if (isSaasAdminModuleId(moduleId)) {
          const saasPerms = context.permissions?.[SAAS_ADMIN_PERMISSION_KEY] || {};
          const saasFields = saasPerms.fields || {};
          const editFieldKey = moduleId === "saas_orgs"
            ? "edit_orgs"
            : moduleId === "saas_demo_requests"
              ? "edit_requests"
              : moduleId === "saas_user_announcements"
                ? "edit_user_announcements"
                : undefined;
          const canEditField = editFieldKey ? saasFields[editFieldKey] === true : false;
          const canViewSaas = saasPerms.view === true || saasPerms.edit === true || canEditField;
          if (active) {
            setCanCreate(canViewSaas && (saasPerms.edit === true || canEditField));
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

  useEffect(() => {
    if (moduleId !== INSTRUCTIONS_MODULE_ID) return;
    let active = true;
    const loadInstructionActors = async () => {
      try {
        const [usersRes, rolesRes] = await Promise.all([
          supabase.from('profiles').select('id, full_name, email, mobile_1').limit(500),
          supabase.from('org_roles').select('id, title').limit(300),
        ]);
        if (!active) return;
        setInstructionUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
        setInstructionRoles(Array.isArray(rolesRes.data) ? rolesRes.data : []);
      } catch {
        if (!active) return;
        setInstructionUsers([]);
        setInstructionRoles([]);
      }
    };
    void loadInstructionActors();
    return () => {
      active = false;
    };
  }, [moduleId]);

  const moduleConfig = useMemo(() => {
    if (!baseModuleConfig) return null;
    if (moduleId !== INSTRUCTIONS_MODULE_ID) return baseModuleConfig;
    return buildInstructionModuleConfig(baseModuleConfig, {
      moduleOptions: buildInstructionModuleOptions(),
      userOptions: instructionUsers.map((user: any) => ({
        value: String(user?.id || ''),
        label: String(user?.full_name || user?.email || user?.mobile_1 || user?.id || '').trim() || '-',
      })).filter((option: any) => option.value),
      roleOptions: instructionRoles.map((role: any) => ({
        value: String(role?.id || ''),
        label: String(role?.title || role?.id || '').trim() || '-',
      })).filter((option: any) => option.value),
    });
  }, [baseModuleConfig, instructionRoles, instructionUsers, moduleId]);

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
              if (moduleConfig.formAdapter?.save) {
                const result = await moduleConfig.formAdapter.save({
                  mode: "create",
                  values,
                  currentValues: initialValuesFromState || {},
                });
                const nextId = String(result?.id || "").trim();
                messageApi.success("ثبت شد");
                if (nextId) {
                  navigate(`/${moduleId}/${nextId}`);
                  return;
                }
                navigate(`/${moduleId}`);
                return;
              }

              const selectedTags = Array.isArray(meta?.selectedTags) ? meta.selectedTags : [];
              const authUser = await getCachedAuthUser(supabase);
              const userId = authUser?.id || null;
              const withCreateAuditFields = (recordPayload: Record<string, any>) => {
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
              if (moduleId === "process_templates") {
                const templateStagesPreview = Array.isArray(meta?.templateStagesPreview) ? meta.templateStagesPreview : [];
                let insertResult = await supabase
                  .from(moduleConfig.table)
                  .insert(withCreateAuditFields(values))
                  .select("*")
                  .single();
                if (insertResult.error && isMissingAuditColumnError(insertResult.error)) {
                  insertResult = await supabase
                    .from(moduleConfig.table)
                    .insert(values)
                    .select("*")
                    .single();
                }
                if (insertResult.error) throw insertResult.error;
                const inserted = insertResult.data;
                if (!inserted?.id) throw new Error("ثبت الگوی فرآیند ناموفق بود");

                if (moduleId && selectedTags.length > 0) {
                  await syncRecordTags(supabase, moduleId, String(inserted.id), selectedTags);
                }
                await runPostCreateCopy(String(inserted.id));
                if (templateStagesPreview.length > 0) {
                  await syncProcessTemplateStages(String(inserted.id), templateStagesPreview);
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

              const isReturnInvoiceModule = isReturnInvoiceModuleId(moduleId);
              if (moduleId === "invoices" || moduleId === "purchase_invoices" || isReturnInvoiceModule) {
                const invoiceValues = {
                  ...values,
                  taxpayer_invoice_pattern: getTaxpayerInvoicePatternForModule(moduleId, values?.taxpayer_invoice_pattern),
                };
                let insertResult = await supabase
                  .from(moduleConfig.table)
                  .insert(withCreateAuditFields(invoiceValues))
                  .select("*")
                  .single();
                if (insertResult.error && isMissingAuditColumnError(insertResult.error)) {
                  insertResult = await supabase
                    .from(moduleConfig.table)
                    .insert(invoiceValues)
                    .select("*")
                    .single();
                }
                if (insertResult.error) throw insertResult.error;
                const inserted = insertResult.data;
                if (!inserted?.id) throw new Error("ثبت فاکتور ناموفق بود");

                if (moduleId && selectedTags.length > 0) {
                  await syncRecordTags(supabase, moduleId, String(inserted.id), selectedTags);
                }
                await runPostCreateCopy(String(inserted.id));
                if (!isReturnInvoiceModule) {
                  await applyInvoiceFinalizationInventory({
                    supabase: supabase as any,
                    moduleId: String(moduleId),
                    recordId: inserted.id,
                    previousStatus: null,
                    nextStatus: invoiceValues?.status ?? null,
                    invoiceItems: invoiceValues?.invoiceItems ?? [],
                    userId,
                  });
                }
                if (shouldAutoSyncInvoiceAccounting(moduleId)) {
                  const accountingSync = await syncInvoiceAccountingEntries({
                  supabase: supabase as any,
                  moduleId: moduleId as any,
                  recordId: inserted.id,
                  recordData: inserted,
                  includePayments: true,
                });
                  if (accountingSync.errors.length > 0) {
                  console.warn("هشدارهای همگام‌سازی سند حسابداری فاکتور:", accountingSync.errors);
                  }
                }
                if (moduleId === "invoices" || moduleId === "sales_return_invoices") {
                  await syncCustomerLevelsByInvoiceCustomers({
                    supabase: supabase as any,
                    customerIds: [inserted?.customer_id || invoiceValues?.customer_id],
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
              const normalizedPayload = moduleId
                ? normalizeOperationalDocumentTotals(moduleId, payload)
                : payload;
              if (moduleId && supportsSystemCode(moduleId) && !normalizedPayload.system_code) {
                normalizedPayload.system_code = await buildClientFallbackSystemCode(supabase, moduleId, moduleConfig.table);
              }
              let insertResult = await supabase
                .from(moduleConfig.table)
                .insert(withCreateAuditFields(normalizedPayload))
                .select("id")
                .single();

              if (insertResult.error && isMissingAuditColumnError(insertResult.error)) {
                insertResult = await supabase
                  .from(moduleConfig.table)
                  .insert(normalizedPayload)
                  .select("id")
                  .single();
              }
              for (
                let attempt = 0;
                insertResult.error
                && moduleId
                && supportsSystemCode(moduleId)
                && (isStatementTimeoutError(insertResult.error) || isDuplicateSystemCodeError(insertResult.error))
                && attempt < 3;
                attempt += 1
              ) {
                const fallbackSystemCode = await buildClientFallbackSystemCode(supabase, moduleId, moduleConfig.table);
                const payloadWithSystemCode = { ...normalizedPayload, system_code: fallbackSystemCode };

                insertResult = await supabase
                  .from(moduleConfig.table)
                  .insert(withCreateAuditFields(payloadWithSystemCode))
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
              if (moduleId === "stock_transfers" && insertedId) {
                await applyStockTransferInventory({
                  supabase: supabase as any,
                  recordId: insertedId,
                  previousStatus: null,
                  nextStatus: normalizedPayload?.status ?? null,
                  recordData: { ...(normalizedPayload as Record<string, any>), id: insertedId },
                  userId,
                });
              }

              if (moduleId) {
                await runWorkflowsForEvent({
                  moduleId,
                  event: "create",
                  currentRecord: { ...(normalizedPayload as Record<string, any>), id: insertedId || undefined },
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
