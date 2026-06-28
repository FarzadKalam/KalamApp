import { MODULES } from "../moduleRegistry";
import { supabase } from "../supabaseClient";
import { clearRecycleBinGuardCache } from "./recycleBinGuards";
import { fetchSessionBootstrap } from "./sessionCache";

export const RECYCLE_BIN_ROUTE = "/recycle-bin";
export const RECYCLE_BIN_RETENTION_DAYS = 30;
export const RECYCLE_BIN_TABLE = "recycle_bin_records";

export type RecycleBinRecord = {
  id: string;
  org_id: string | null;
  module_id: string;
  source_table: string;
  source_record_id: string;
  record_title: string | null;
  snapshot: Record<string, any>;
  deleted_at: string;
  expires_at: string;
  deleted_by: string | null;
  deleted_by_name: string | null;
};

const getRecycleBinModuleConfig = (moduleId?: string | null) => {
  const normalizedModuleId = String(moduleId || "").trim();
  return MODULES[normalizedModuleId] || null;
};

export const isRecycleBinEnabledModule = (moduleId?: string | null) => {
  return !!getRecycleBinModuleConfig(moduleId)?.table;
};

const getRecycleBinActor = async () => {
  const snapshot = await fetchSessionBootstrap(supabase);
  return {
    userId: snapshot.user?.id ? String(snapshot.user.id) : null,
    userName: snapshot.profile?.full_name ? String(snapshot.profile.full_name) : null,
    orgId: snapshot.orgId ? String(snapshot.orgId) : null,
  };
};

export const moveModuleRecordsToRecycleBin = async (
  moduleId: string,
  recordIds: Array<string | number>,
) => {
  const normalizedModuleId = String(moduleId || "").trim();
  const moduleConfig = getRecycleBinModuleConfig(normalizedModuleId);
  const sourceTable = String(moduleConfig?.table || "").trim();
  if (!sourceTable) {
    throw new Error("این ماژول هنوز برای سطل بازیافت پشتیبانی نشده است.");
  }

  const normalizedRecordIds = Array.from(
    new Set(recordIds.map((value) => String(value || "").trim()).filter(Boolean))
  );
  if (!normalizedRecordIds.length) return 0;

  const actor = await getRecycleBinActor();
  const { data, error } = await supabase.rpc("move_records_to_recycle_bin", {
    p_module_id: normalizedModuleId,
    p_source_table: sourceTable,
    p_record_ids: normalizedRecordIds,
    p_deleted_by: actor.userId,
    p_deleted_by_name: actor.userName,
    p_org_id: actor.orgId,
  });
  if (error) throw error;
  clearRecycleBinGuardCache();
  return Number(data || 0) || 0;
};

export const restoreRecycleBinRecords = async (recycleBinIds: Array<string | number>) => {
  const normalizedIds = Array.from(
    new Set(recycleBinIds.map((value) => String(value || "").trim()).filter(Boolean))
  );
  if (!normalizedIds.length) return 0;

  const { data, error } = await supabase.rpc("restore_recycle_bin_records", {
    p_recycle_ids: normalizedIds,
  });
  if (error) throw error;
  clearRecycleBinGuardCache();
  return Number(data || 0) || 0;
};

export const purgeExpiredRecycleBinRecords = async () => {
  const { error } = await supabase.rpc("purge_expired_recycle_bin_records");
  if (error) throw error;
  clearRecycleBinGuardCache();
};

export const getRecycleBinModuleTitle = (moduleId?: string | null) => {
  const normalizedModuleId = String(moduleId || "").trim();
  return MODULES[normalizedModuleId]?.titles?.fa || normalizedModuleId || "نامشخص";
};
