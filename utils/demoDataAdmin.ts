import { supabase } from "../supabaseClient";
import { toFaErrorMessage } from "./errorMessageFa";

type DemoDataAdminAction = "seed_org_demo_data" | "clear_org_demo_data" | "get_demo_seed_status";

type DemoDataAdminStatus = {
  success?: boolean;
  batch_id?: string | null;
  status?: string | null;
  seeded_records_count?: number;
  is_demo?: boolean;
  has_seeded_batch?: boolean;
  pack_key?: string | null;
  slug?: string | null;
  warning?: string | null;
};

const invokeDemoDataAdmin = async <T = DemoDataAdminStatus>(action: DemoDataAdminAction) => {
  const { data, error } = await supabase.functions.invoke("demo-data-admin", {
    body: { action },
  });
  if (error) throw error;
  if (data?.success === false) {
    throw new Error(String(data?.message || "اجرای سرویس داده دمو ناموفق بود."));
  }
  return (data || {}) as T;
};

export const seedCurrentOrgDemoData = async () => invokeDemoDataAdmin<DemoDataAdminStatus>("seed_org_demo_data");

export const clearCurrentOrgDemoData = async () => invokeDemoDataAdmin<DemoDataAdminStatus>("clear_org_demo_data");

export const getCurrentOrgDemoSeedStatus = async () => invokeDemoDataAdmin<DemoDataAdminStatus>("get_demo_seed_status");

export const getDemoDataAdminErrorMessage = (error: unknown, fallback: string) =>
  toFaErrorMessage(error as any, fallback);

export type { DemoDataAdminStatus };
