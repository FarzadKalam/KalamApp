import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { MODULES } from "../moduleRegistry";
import SmartForm from "../components/SmartForm";
import { App, Result, Spin } from "antd";
import { supabase } from "../supabaseClient";
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
import { buildInstructionModuleConfig, buildInstructionModuleOptions, INSTRUCTIONS_MODULE_ID } from "../utils/instructionSupport";
import { syncProcessTemplateStages as syncProcessTemplateStagesShared } from "../utils/processTemplateStages";
import { getTaxpayerInvoicePatternForModule, getTaxpayerInvoiceSubjectForModule, isReturnInvoiceModuleId } from "../utils/invoiceModuleRouting";
import { fetchAssigneeDirectory } from "../utils/referenceData";
import { applyInvoicePaymentAllocation } from "../utils/invoicePaymentAllocationRuntime";
import { runWriteWithCompatiblePayload } from "../utils/writeCompat";
import { useContentCalendarPlanModule } from '../hooks/useContentCalendarFeature';

const isStatementTimeoutError = (error: any) =>
  String(error?.code || "").trim() === "57014"
  || String(error?.message || "").toLowerCase().includes("statement timeout");

const isDuplicateSystemCodeError = (error: any) => {
  const code = String(error?.code || "").toUpperCase();
  const text = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  return code === "23505" && (text.includes("system_code") || text.includes("org_system_code"));
};

const syncProcessTemplateStages = (templateId: string, rawStages: any[]) =>
  syncProcessTemplateStagesShared(supabase, templateId, rawStages);

export const ModuleCreate = () => {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { message: messageApi } = App.useApp();
  const baseModuleConfig = moduleId ? MODULES[moduleId] : null;
  const { moduleConfig: planBaseModuleConfig } = useContentCalendarPlanModule(baseModuleConfig);
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
          const saasAdminPerms = context.permissions?.[SAAS_ADMIN_PERMISSION_KEY] || {};
          const isSaasAdmin = saasAdminPerms.view === true || saasAdminPerms.edit === true;
          setCanCreate(isSaasAdmin || modulePerms.edit !== false);
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
        const directory = await fetchAssigneeDirectory(supabase);
        if (!active) return;
        setInstructionUsers(Array.isArray(directory?.users) ? directory.users : []);
        setInstructionRoles(Array.isArray(directory?.roles) ? directory.roles : []);
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
    if (!planBaseModuleConfig) return null;
    if (moduleId !== INSTRUCTIONS_MODULE_ID) return planBaseModuleConfig;
    return buildInstructionModuleConfig(planBaseModuleConfig, {
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
  }, [instructionRoles, instructionUsers, moduleId, planBaseModuleConfig]);

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
                  meta: meta || null,
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
                const text = String(error?.message || error?.details || "").toLowerCase();
                return text.includes("created_by") || text.includes("updated_by");
              };
              const insertWithCompatiblePayload = async (
                recordPayload: Record<string, any>,
                selectColumns: string,
              ) => runWriteWithCompatiblePayload<any>({
                cacheKey: `module-create:${moduleConfig.table}`,
                payload: recordPayload,
                execute: async (candidatePayload) => {
                  let result = await supabase
                    .from(moduleConfig.table)
                    .insert(withCreateAuditFields(candidatePayload))
                    .select(selectColumns)
                    .single();
                  if (result.error && isMissingAuditColumnError(result.error)) {
                    result = await supabase
                      .from(moduleConfig.table)
                      .insert(candidatePayload)
                      .select(selectColumns)
                      .single();
                  }
                  return result;
                },
              });
              if (moduleId === "process_templates") {
                const templateStagesPreview = Array.isArray(meta?.templateStagesPreview) ? meta.templateStagesPreview : [];
                const insertResult = await insertWithCompatiblePayload(values, "*");
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
                  taxpayer_invoice_subject: getTaxpayerInvoiceSubjectForModule(moduleId, values?.taxpayer_invoice_subject),
                };
                const insertResult = await insertWithCompatiblePayload(invoiceValues, "*");
                if (insertResult.error) throw insertResult.error;
                const inserted = insertResult.data;
                if (!inserted?.id) throw new Error("ثبت فاکتور ناموفق بود");

                let allocatedInvoiceIds: string[] = [String(inserted.id)];
                if (meta?.invoicePaymentAllocation && !isReturnInvoiceModule) {
                  const allocation = meta.invoicePaymentAllocation;
                  const changedRows = await applyInvoicePaymentAllocation({
                    supabase: supabase as any,
                    moduleId: moduleId as "invoices" | "purchase_invoices",
                    sourceInvoiceId: String(inserted.id),
                    sourceRowKey: allocation.plan.segments[0]?.sourceRowKey || "",
                    sourcePayments: allocation.plan.sourcePayments,
                    allocationGroupKey: allocation.allocationGroupKey,
                    allocations: allocation.allocations,
                    plan: allocation.plan,
                  });
                  allocatedInvoiceIds = Array.from(new Set(
                    changedRows
                      .map((row: any) => String(row?.invoice_id || "").trim())
                      .filter(Boolean)
                  ));
                }

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
                  for (const invoiceId of allocatedInvoiceIds) {
                    const accountingSync = await syncInvoiceAccountingEntries({
                      supabase: supabase as any,
                      moduleId: moduleId as any,
                      recordId: invoiceId,
                      recordData: invoiceId === String(inserted.id) ? inserted : undefined,
                      includePayments: true,
                    });
                    if (accountingSync.errors.length > 0) {
                      console.warn("هشدارهای همگام‌سازی سند حسابداری فاکتور:", accountingSync.errors);
                    }
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
              let insertResult = await insertWithCompatiblePayload(normalizedPayload, "id");
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

                insertResult = await insertWithCompatiblePayload(payloadWithSystemCode, "id");
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
