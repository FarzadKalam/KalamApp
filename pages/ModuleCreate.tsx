import { useEffect, useState } from "react";
import { useForm } from "@refinedev/antd";
import { useParams, useNavigate } from "react-router-dom";
import { MODULES } from "../moduleRegistry";
import SmartForm from "../components/SmartForm";
import { Button, Result, Spin } from "antd";
import { ArrowRightOutlined, SaveOutlined } from "@ant-design/icons";
import { supabase } from "../supabaseClient";
import { applyInvoiceFinalizationInventory } from "../utils/invoiceInventoryWorkflow";
import { runWorkflowsForEvent } from "../utils/workflowRuntime";

export const ModuleCreate = () => {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const moduleConfig = moduleId ? MODULES[moduleId] : null;
  const [permissionLoading, setPermissionLoading] = useState(true);
  const [canCreate, setCanCreate] = useState(true);

  const { formProps, saveButtonProps, form } = useForm({
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

  const isSubmitting = saveButtonProps.loading;

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto animate-fadeIn">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <Button
            icon={<ArrowRightOutlined />}
            onClick={() => navigate(-1)}
            type="text"
            className="text-gray-500"
          />
          <div>
            <h1 className="text-xl font-black text-gray-800 dark:text-white m-0">
              افزودن {moduleConfig.titles.fa}
            </h1>
          </div>
        </div>

        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={isSubmitting}
          onClick={() => form.submit()}
          className="bg-leather-600 hover:!bg-leather-500"
        >
          ذخیره
        </Button>
      </div>

      <div className="bg-white dark:bg-[#1a1a1a] rounded-[1.5rem] p-6 shadow-sm border border-gray-100 dark:border-gray-800">
        <SmartForm
          module={moduleConfig}
          visible={true}
          onCancel={() => navigate(-1)}
          onSave={async (values) => {
            try {
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

              await formProps.onFinish?.(values);
              if (moduleId) {
                await runWorkflowsForEvent({
                  moduleId,
                  event: "create",
                  currentRecord: values as Record<string, any>,
                });
              }
            } catch (err: any) {
              throw err;
            }
          }}
        />
      </div>
    </div>
  );
};
