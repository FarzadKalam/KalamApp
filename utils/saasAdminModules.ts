import { supabase } from '../supabaseClient';
import type { ModuleFormAdapterContext, ModuleRecordAction } from '../types';

// ── ذخیره درخواست دمو از طریق admin_saas_edit_request RPC ──────────────────
export const saveSaasDemoRequest = async ({ mode, recordId, values }: ModuleFormAdapterContext) => {
  if (mode !== 'update' || !recordId) {
    throw new Error('ایجاد درخواست دمو از این طریق پشتیبانی نمی‌شود.');
  }

  // فقط فیلدهایی که مقدار دارند را به patch اضافه می‌کنیم
  const patch: Record<string, any> = {};
  const editableKeys = [
    'full_name', 'mobile', 'organization_name', 'requested_slug',
    'status', 'is_demo_request', 'email', 'industry',
    'employee_count_band', 'discovery_source', 'business_name',
    'notes',
    // failure_code و failure_message فقط خواندنی هستند — ادمین نمی‌تواند آن‌ها را ویرایش کند
  ];
  for (const key of editableKeys) {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      patch[key] = values[key] ?? null;
    }
  }

  const { data, error } = await supabase.rpc('admin_saas_edit_request', {
    p_request_id: String(recordId),
    p_patch: patch,
  });
  if (error) throw error;
  if (data?.success === false) {
    throw new Error(String(data?.message || 'ذخیره درخواست ناموفق بود.'));
  }
  return { id: String(recordId) };
};

type SaasModuleActionResult = {
  message?: string;
  nextRecordId?: string | null;
};

const normalizeText = (value: unknown) => {
  const text = String(value ?? '').trim();
  return text || null;
};

const normalizeBool = (value: unknown, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined || value === '') return fallback;
  return String(value).trim().toLowerCase() === 'true';
};

const normalizeOrgPayload = (values: Record<string, any>, currentValues?: Record<string, any> | null) => {
  const merged = { ...(currentValues || {}), ...(values || {}) };
  return {
    source_kind: String(merged.source_kind || 'org').trim() === 'request' ? 'request' : 'org',
    source_id: normalizeText(merged.source_id || merged.org_id || merged.request_id || currentValues?.id),
    request_id: normalizeText(merged.request_id),
    org_name: String(
      merged.org_name
      || merged.organization_name
      || merged.business_name
      || currentValues?.org_name
      || ''
    ).trim(),
    slug: normalizeText(merged.slug),
    status: normalizeText(merged.status) || 'trial',
    plan_code: normalizeText(merged.plan_code),
    is_demo: normalizeBool(merged.is_demo, true),
    is_readonly: normalizeBool(merged.is_readonly, false),
    trial_ends_at: normalizeText(merged.trial_ends_at),
    primary_contact_mobile: normalizeText(merged.primary_contact_mobile || merged.mobile),
    owner_name: normalizeText(merged.owner_name || merged.full_name),
    owner_email: normalizeText(merged.owner_email || merged.email),
    provisioning_source: normalizeText(merged.provisioning_source) || 'manual_admin',
    request_status: normalizeText(merged.status),
    industry: normalizeText(merged.industry),
    employee_count_band: normalizeText(merged.employee_count_band),
    discovery_source: normalizeText(merged.discovery_source),
  };
};

export const saveSaasOrgRecord = async ({ mode, recordId, values, currentValues }: ModuleFormAdapterContext) => {
  const payload = normalizeOrgPayload(values, currentValues);
  const sourceId = normalizeText(recordId || payload.source_id);
  const { data, error } = await supabase.rpc('admin_upsert_saas_org_candidate', {
    p_source_kind: payload.source_kind,
    p_source_id: mode === 'update' ? sourceId : null,
    p_request_id: payload.request_id,
    p_org_name: payload.org_name,
    p_slug: payload.slug,
    p_status: payload.status,
    p_plan_code: payload.plan_code,
    p_is_demo: payload.is_demo,
    p_is_readonly: payload.is_readonly,
    p_trial_ends_at: payload.trial_ends_at,
    p_primary_contact_mobile: payload.primary_contact_mobile,
    p_owner_name: payload.owner_name,
    p_owner_email: payload.owner_email,
    p_provisioning_source: payload.provisioning_source,
    p_request_status: payload.request_status,
    p_industry: payload.industry,
    p_employee_count_band: payload.employee_count_band,
    p_discovery_source: payload.discovery_source,
  });
  if (error) throw error;
  if (data?.success === false) {
    throw new Error(String(data?.message || 'ذخیره سازمان SaaS ناموفق بود.'));
  }
  return { id: String(data?.source_id || data?.org_id || sourceId || '').trim() || null };
};

export const executeSaasModuleAction = async (
  moduleId: string,
  actionId: string,
  record: Record<string, any> | null | undefined
): Promise<SaasModuleActionResult> => {
  if (!record) {
    throw new Error('رکوردی برای این عملیات در دسترس نیست.');
  }

  if (moduleId === 'saas_orgs' && actionId === 'convert_request_to_org') {
    const requestId = normalizeText(record.request_id || record.id);
    if (!requestId) {
      throw new Error('شناسه درخواست دمو برای تبدیل به سازمان پیدا نشد.');
    }
    const { data, error } = await supabase.rpc('admin_convert_demo_request_to_org', {
      p_request_id: requestId,
    });
    if (error) throw error;
    if (data?.success === false) {
      throw new Error(String(data?.message || 'تبدیل درخواست به سازمان ناموفق بود.'));
    }
    return {
      message: String(data?.message || 'سازمان از روی درخواست دمو ایجاد شد.'),
      nextRecordId: normalizeText(data?.source_id || data?.org_id),
    };
  }

  if (moduleId === 'saas_demo_requests' && actionId === 'manual_provision') {
    const requestId = normalizeText(record.id || record.request_id);
    if (!requestId) {
      throw new Error('شناسه درخواست دمو پیدا نشد.');
    }
    const { data, error } = await supabase.rpc('admin_convert_demo_request_to_org', {
      p_request_id: requestId,
    });
    if (error) throw error;
    if (data?.success === false) {
      throw new Error(String(data?.message || 'پروویژن ناموفق بود.'));
    }
    const orgId = normalizeText(data?.org_id || data?.source_id);
    return {
      message: String(data?.message || 'سازمان دمو ایجاد شد.'),
      nextRecordId: orgId,
    };
  }

  throw new Error('این عملیات برای ماژول انتخاب‌شده پشتیبانی نمی‌شود.');
};

export const saasOrgRecordActions: ModuleRecordAction[] = [
  {
    id: 'convert_request_to_org',
    label: 'ایجاد سازمان',
    placement: 'header',
    variant: 'primary',
    confirmTitle: 'ایجاد سازمان از روی درخواست دمو',
    confirmDescription: 'این درخواست به یک سازمان SaaS واقعی تبدیل می‌شود.',
    visible: (record) => String(record?.source_kind || '').trim() === 'request',
  },
];

export const saasDemoRequestRecordActions: ModuleRecordAction[] = [
  {
    id: 'manual_provision',
    label: 'پروویژن دستی',
    placement: 'header',
    variant: 'primary',
    confirmTitle: 'ارسال برای پروویژن دستی',
    confirmDescription: 'این درخواست برای ساخت دمو به زیرساخت SaaS ارسال می‌شود.',
    visible: (record) =>
      ['draft', 'failed', 'needs_admin_review'].includes(String(record?.status || '').trim()),
  },
];
