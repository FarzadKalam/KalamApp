import { supabase } from '../supabaseClient';

export const LOCAL_INSTALLATIONS_MODULE = 'saas_local_installations';
export const installationStatuses = {
  draft: 'پیش‌نویس', preparing: 'در حال آماده‌سازی', ready: 'بسته آماده است', installing: 'در حال نصب',
  trial: 'انتقال آزمایشی', awaiting_cutover: 'در انتظار فعال‌سازی', active: 'فعال', failed: 'نیازمند رسیدگی', archived: 'بایگانی',
} as const;
export const jobStatuses: Record<string, string> = {
  queued: 'در صف', running: 'در حال اجرا', succeeded: 'تکمیل‌شده', failed: 'ناموفق', needs_review: 'نیازمند بررسی اجرا',
};
export const jobKinds: Record<string, string> = { prepare: 'آماده‌سازی بسته', export_trial: 'خروجی آزمایشی اطلاعات', export_final: 'انتقال نهایی اطلاعات' };
export const stageTitles: Record<string, string> = {
  queued: 'در صف', preflight: 'بررسی پیش‌نیازها', verify_release: 'بررسی نسخه', prepare_config: 'آماده‌سازی تنظیمات',
  upload: 'ثبت بسته', inventory: 'بررسی داده‌ها', freeze: 'توقف تغییرات', snapshot: 'تهیهٔ خروجی',
  encrypt: 'رمزگذاری', verify_artifact: 'بررسی فایل نهایی', complete: 'تکمیل‌شده',
};
export type InstallationInput = {
  title: string; customer_org_id: string; assigned_to?: string; install_kind: 'fresh' | 'migration';
  access_mode: 'internal' | 'public'; public_url: string; tls_mode: 'provided' | 'internal_ca';
  delivery_mode: 'download' | 'file'; admin_name: string; admin_email: string; telemetry_enabled: boolean;
};
export type LocalInstallation = InstallationInput & {
  id: string; org_id: string; system_code: string; customer_name: string; status: keyof typeof installationStatuses;
  created_at: string; last_report_at: string | null;
};
export type InstallationJob = {
  id: string; kind: string; status: string; stage: string; requested_at: string; started_at: string | null;
  finished_at: string | null; attempt: number; error_code: string | null; message: string | null;
  result: { checksum?: string; expires_at?: string; restore_verified?: boolean; version?: string };
};
export type DiagnosticReport = {
  format: 'kalamapp-diagnostics-v1'; generated_at: string; version: string; disk_free_bytes: number;
  last_backup_at: string | null; services: Array<{ name: string; status: string }>;
};
export type InstallationDetail = {
  installation: LocalInstallation; jobs: InstallationJob[];
  events: Array<{ event_type: string; stage: string | null; message: string; created_at: string }>;
  report: { report: DiagnosticReport; received_at: string; source: string } | null;
  release: { version: string; verified_at: string } | null;
  recovery_key_configured: boolean;
  source_frozen: boolean;
  tickets: Array<{ id: string; code: string; subject: string; status: string }>;
};
export async function installationRpc<T = Record<string, unknown>>(action: string, id: string | null = null, payload: unknown = {}): Promise<T> {
  const { data, error } = await supabase.rpc('admin_local_installation', { p_action: action, p_id: id, p_payload: payload });
  if (error) throw error;
  return data as T;
}
export const isValidInstallationOrigin = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value && !url.username && !url.password && /^[a-z0-9.-]+$/i.test(url.hostname);
  } catch { return false; }
};
export const reportIsStale = (receivedAt: string, now = Date.now()) => !Number.isFinite(Date.parse(receivedAt)) || now - Date.parse(receivedAt) > 24 * 60 * 60 * 1000;

/** Reconstruct instead of redacting: unknown properties can contain credentials or customer data. */
export function safeDiagnosticReport(input: unknown): DiagnosticReport {
  const report = input as Partial<DiagnosticReport> | null;
  if (!report || report.format !== 'kalamapp-diagnostics-v1' || !Number.isFinite(Date.parse(report.generated_at || '')) ||
    !Array.isArray(report.services) || report.services.length > 32) throw new Error('فایل گزارش نصب معتبر نیست.');
  const statuses = new Set(['healthy', 'unhealthy', 'running', 'stopped', 'unknown']);
  if (report.services.some(s => !s || !/^[a-z][a-z0-9_-]{0,48}$/.test(s.name) || !statuses.has(s.status))) throw new Error('وضعیت سرویس‌های گزارش معتبر نیست.');
  return {
    format: 'kalamapp-diagnostics-v1', generated_at: new Date(report.generated_at!).toISOString(), version: String(report.version || '').replace(/[^0-9.]/g, '').slice(0, 40),
    disk_free_bytes: Math.max(0, Math.min(Number(report.disk_free_bytes) || 0, 1e18)),
    last_backup_at: report.last_backup_at && Number.isFinite(Date.parse(report.last_backup_at)) ? new Date(report.last_backup_at).toISOString() : null,
    services: report.services.map(s => ({ name: s.name, status: s.status })),
  };
}
