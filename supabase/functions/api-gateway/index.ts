// @ts-nocheck
// api-gateway: REST API gateway for TazeSystem external integrations
// Accepts org API tokens and proxies queries to Supabase with org isolation.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')               ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')  ?? '';
const SUPABASE_ANON_KEY    = Deno.env.get('SUPABASE_ANON_KEY')          ?? '';

const json = (status: number, payload: Record<string, any>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// ── Plan-based module access ─────────────────────────────────────────────────

const PLAN_MODULES: Record<string, string[]> = {
  basic: [
    'customers', 'suppliers', 'products', 'product_bundles',
    'invoices', 'purchase_invoices', 'sales_return_invoices', 'purchase_return_invoices',
    'price_lists', 'delivery_forms', 'warehouses', 'shelves', 'stock_transfers',
    'marketing_leads', 'personas', 'tasks', 'instructions',
  ],
  professional: [
    // همه ماژول‌های basic +
    'customers', 'suppliers', 'products', 'product_bundles',
    'invoices', 'purchase_invoices', 'sales_return_invoices', 'purchase_return_invoices',
    'price_lists', 'delivery_forms', 'warehouses', 'shelves', 'stock_transfers',
    'marketing_leads', 'personas', 'tasks', 'instructions',
    // حسابداری
    'fiscal_years', 'chart_of_accounts', 'journal_entries', 'accounting_event_rules',
    'cost_centers', 'cash_boxes', 'bank_accounts', 'petty_funds', 'cheques',
    'cash_bank_operations', 'barters', 'expense_documents', 'assets',
    // HR
    'employees', 'attendance_logs', 'work_schedules', 'leave_requests',
    'overtime_requests', 'mission_requests', 'employee_advances',
    'employee_bonus_requests', 'employee_penalty_requests',
    'employee_contracts', 'job_descriptions', 'payroll_slips', 'recruitment_applicants',
  ],
  enterprise: [
    // همه ماژول‌های professional +
    'customers', 'suppliers', 'products', 'product_bundles',
    'invoices', 'purchase_invoices', 'sales_return_invoices', 'purchase_return_invoices',
    'price_lists', 'delivery_forms', 'warehouses', 'shelves', 'stock_transfers',
    'marketing_leads', 'personas', 'tasks', 'instructions',
    'fiscal_years', 'chart_of_accounts', 'journal_entries', 'accounting_event_rules',
    'cost_centers', 'cash_boxes', 'bank_accounts', 'petty_funds', 'cheques',
    'cash_bank_operations', 'barters', 'expense_documents', 'assets',
    'employees', 'attendance_logs', 'work_schedules', 'leave_requests',
    'overtime_requests', 'mission_requests', 'employee_advances',
    'employee_bonus_requests', 'employee_penalty_requests',
    'employee_contracts', 'job_descriptions', 'payroll_slips', 'recruitment_applicants',
    // فرآیند و تولید
    'projects', 'process_templates', 'process_runs', 'web_forms', 'surveys',
    'secretariat_documents', 'production_orders', 'production_boms',
    'production_group_orders',
  ],
};

// جداول سیستمی که هرگز از طریق API قابل دسترسی نیستند
const BLOCKED_TABLES = new Set([
  'saas_orgs', 'saas_demo_requests', 'saas_users', 'saas_user_announcements',
  'profiles', 'organizations', 'org_roles', 'org_api_tokens', 'org_webhooks',
  'integration_settings', 'system_code_counters', 'app_schema_migrations',
  'notification_read_states', 'outbound_messages',
]);

// ── Service-role HTTP helper ─────────────────────────────────────────────────

const serviceHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  apikey: SUPABASE_ANON_KEY,
};

const serviceGet = async (url: string) => {
  const res = await fetch(url, { headers: serviceHeaders });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
};

const servicePost = async (url: string, body: unknown) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...serviceHeaders, 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${raw}`);
  return raw ? JSON.parse(raw) : [];
};

const servicePatch = async (url: string, body: unknown) => {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...serviceHeaders, 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
};

const serviceDelete = async (url: string) => {
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { ...serviceHeaders, 'Prefer': 'return=representation' },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
};

// ── Token verification ───────────────────────────────────────────────────────

type TokenInfo = { org_id: string; plan_code: string | null };

const verifyToken = async (token: string): Promise<TokenInfo | null> => {
  try {
    // 1. توکن را در org_api_tokens پیدا کن
    const tokenRows = await serviceGet(
      `${SUPABASE_URL}/rest/v1/org_api_tokens?token=eq.${encodeURIComponent(token)}&is_active=eq.true&select=id,org_id&limit=1`
    );
    if (!Array.isArray(tokenRows) || tokenRows.length === 0) return null;
    const { id: tokenId, org_id } = tokenRows[0];

    // 2. پلن org را از saas_org_settings بگیر
    let plan_code: string | null = null;
    try {
      const orgRows = await serviceGet(
        `${SUPABASE_URL}/rest/v1/saas_org_settings?org_id=eq.${org_id}&select=plan_code&limit=1`
      );
      if (Array.isArray(orgRows) && orgRows.length > 0) {
        plan_code = orgRows[0]?.plan_code ?? null;
      }
    } catch { /* اگر جدول وجود ندارد، پلن را null می‌گذاریم */ }

    // 3. last_used_at را به‌روز کن (fire-and-forget)
    fetch(`${SUPABASE_URL}/rest/v1/org_api_tokens?id=eq.${tokenId}`, {
      method: 'PATCH',
      headers: serviceHeaders,
      body: JSON.stringify({ last_used_at: new Date().toISOString() }),
    }).catch(() => {});

    return { org_id, plan_code };
  } catch {
    return null;
  }
};

// ── Access check ─────────────────────────────────────────────────────────────

const isTableAllowed = (table: string, plan_code: string | null): boolean => {
  if (BLOCKED_TABLES.has(table)) return false;
  if (!plan_code || !(plan_code in PLAN_MODULES)) {
    // اگر پلن مشخص نیست → همه business modules مجاز
    return !BLOCKED_TABLES.has(table);
  }
  return PLAN_MODULES[plan_code].includes(table);
};

// ── Filter builder ───────────────────────────────────────────────────────────

type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'is';

type FilterDef = { op: FilterOp; value: unknown };

const buildFilterParams = (
  filters: Record<string, FilterDef | unknown> | undefined,
  orgId: string
): string => {
  const params: string[] = [`org_id=eq.${orgId}`];
  if (!filters || typeof filters !== 'object') return params.join('&');

  for (const [col, def] of Object.entries(filters)) {
    if (col === 'org_id') continue; // org_id همیشه از توکن تامین می‌شود

    if (def && typeof def === 'object' && 'op' in (def as object)) {
      const { op, value } = def as FilterDef;
      if (op === 'in' && Array.isArray(value)) {
        params.push(`${encodeURIComponent(col)}=in.(${value.map(String).join(',')})`);
      } else if (op === 'is') {
        params.push(`${encodeURIComponent(col)}=is.${value}`);
      } else {
        params.push(`${encodeURIComponent(col)}=${op}.${encodeURIComponent(String(value))}`);
      }
    }
  }
  return params.join('&');
};

// ── Instagram lead bridge ───────────────────────────────────────────────────
// These actions deliberately expose only the lead form contract.  A token can
// never read generic settings or dynamic-option tables through this bridge.

const LEAD_STANDARD_FIELDS = [
  { key: 'name', label: 'عنوان لید', type: 'text', required: true },
  { key: 'business_name', label: 'نام کسب‌وکار', type: 'text' },
  { key: 'status', label: 'وضعیت', type: 'status', options: [{ label: 'جدید', value: 'new' }] },
  { key: 'lead_type', label: 'نوع لید', type: 'select', options: [{ label: 'لید جدید', value: 'new_lead' }, { label: 'مشتری قبلی', value: 'existing_customer' }] },
  { key: 'success_percentage', label: 'درصد موفقیت', type: 'percentage' },
  { key: 'source', label: 'منبع سرنخ', type: 'select', dynamicOptionsCategory: 'lead_source' },
  { key: 'tags', label: 'برچسب‌ها', type: 'tags' },
  { key: 'persona_id', label: 'پرسونا', type: 'relation', relation: 'personas' },
  { key: 'prefix', label: 'پیشوند', type: 'select', options: [{ label: 'آقای', value: 'آقای' }, { label: 'خانم', value: 'خانم' }, { label: 'آقای دکتر', value: 'آقای دکتر' }, { label: 'خانم دکتر', value: 'خانم دکتر' }, { label: 'آقای مهندس', value: 'آقای مهندس' }, { label: 'خانم مهندس', value: 'خانم مهندس' }] },
  { key: 'first_name', label: 'نام مشتری', type: 'text' },
  { key: 'last_name', label: 'نام خانوادگی مشتری', type: 'text' },
  { key: 'industry', label: 'صنعت', type: 'select', dynamicOptionsCategory: 'customer_industry' },
  { key: 'customer_interests', label: 'علاقمندی‌های مشتری', type: 'multi_select', dynamicOptionsCategory: 'customer_interests' },
  { key: 'mobile', label: 'شمارهٔ همراه', type: 'phone' },
  { key: 'mobile_2', label: 'شمارهٔ همراه دوم', type: 'phone' },
  { key: 'assistant_phone', label: 'شمارهٔ دستیار', type: 'phone' },
  { key: 'email', label: 'ایمیل', type: 'email' },
  { key: 'province', label: 'استان', type: 'select', dynamicOptionsCategory: 'province' },
  { key: 'city', label: 'شهر', type: 'select', dynamicOptionsCategory: 'city' },
  { key: 'address', label: 'نشانی', type: 'textarea' },
  { key: 'notes', label: 'یادداشت', type: 'textarea' },
  { key: 'image_url', label: 'تصویر / فایل لید', type: 'image' },
] as const;

const leadBridgeAllowed = (planCode: string | null) => isTableAllowed('marketing_leads', planCode);

const safeLeadField = (field: any) => {
  const key = String(field?.key || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(key) || key === 'org_id' || key === 'id') return null;
  return {
    key,
    label: String(field?.labels?.fa || field?.label || key).trim().slice(0, 160),
    type: String(field?.type || 'text').trim().slice(0, 48),
    required: field?.validation?.required === true,
    dynamicOptionsCategory: String(field?.dynamicOptionsCategory || field?.dynamic_options_category || '').trim().slice(0, 100) || undefined,
    options: Array.isArray(field?.options)
      ? field.options.slice(0, 100).flatMap((option: any) => option && option.value !== undefined ? [{ label: String(option.label || option.value).slice(0, 160), value: String(option.value).slice(0, 160) }] : [])
      : undefined,
  };
};

const leadBridgeCatalog = async (orgId: string) => {
  const configRows = await serviceGet(
    `${SUPABASE_URL}/rest/v1/integration_settings?org_id=eq.${encodeURIComponent(orgId)}&connection_type=eq.module_settings&is_active=eq.true&select=settings&order=updated_at.desc&limit=1`
  ).catch(() => []);
  const configuredFields = Array.isArray(configRows)
    ? configRows[0]?.settings?.modules?.marketing_leads?.schema?.fields
    : [];
  const customFields = (Array.isArray(configuredFields) ? configuredFields : [])
    .map(safeLeadField)
    .filter((field: any) => field && !LEAD_STANDARD_FIELDS.some((standard) => standard.key === field.key));
  const fields = [...LEAD_STANDARD_FIELDS, ...customFields];
  const categories = [...new Set([
    ...fields.map((field: any) => String(field.dynamicOptionsCategory || '')).filter(Boolean),
    // علاقه‌مندی‌های لید از همین دو دستهٔ کالای واقعی هم تکمیل می‌شود.
    'product_goods_categories', 'product_service_categories',
  ])];
  const optionRows = categories.length
    ? await serviceGet(
      `${SUPABASE_URL}/rest/v1/dynamic_options?org_id=eq.${encodeURIComponent(orgId)}&category=in.(${categories.map(encodeURIComponent).join(',')})&is_active=eq.true&select=category,value,label&order=category.asc,label.asc&limit=1000`
    ).catch(() => [])
    : [];
  const personas = await serviceGet(
    `${SUPABASE_URL}/rest/v1/personas?org_id=eq.${encodeURIComponent(orgId)}&persona_type=eq.customer&select=id,display_name,description&order=display_name.asc&limit=300`
  ).catch(() => []);
  return {
    module: 'marketing_leads',
    initialValues: { status: 'new', lead_type: 'new_lead' },
    fields,
    dynamicOptions: Array.isArray(optionRows) ? optionRows : [],
    personas: Array.isArray(personas) ? personas : [],
  };
};

const normalizeLeadPayload = (payload: any, catalog: any) => {
  const source = payload && typeof payload === 'object' ? payload : {};
  const allowedKeys = new Set((catalog?.fields || []).map((field: any) => String(field.key)));
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!allowedKeys.has(key) || value === undefined || value === null) continue;
    if (typeof value === 'string') result[key] = value.trim().slice(0, key === 'notes' || key === 'address' ? 8000 : 800);
    else if (typeof value === 'number' || typeof value === 'boolean') result[key] = value;
    else if (Array.isArray(value)) result[key] = value.slice(0, 80).map((item) => String(item).trim().slice(0, 160)).filter(Boolean);
  }
  result.name = String(result.name || '').trim();
  if (!result.name) throw new Error('عنوان لید الزامی است.');
  result.status = 'new';
  result.lead_type = String(result.lead_type || 'new_lead') === 'existing_customer' ? 'existing_customer' : 'new_lead';
  return result;
};

const safeAttachmentName = (value: unknown) => {
  const name = String(value || 'instagram-file').normalize('NFKD').replace(/[^\w.\-آ-ی ]+/gu, '_').replace(/\s+/g, ' ').trim();
  return (name || 'instagram-file').slice(0, 160);
};

const allowedInstagramDownloadUrl = (value: unknown) => {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && url.hostname === 'studio.kalametazenews.ir' && url.pathname === '/studio/api/engagement/media';
  } catch {
    return false;
  }
};

const fetchInstagramAttachment = async (url: string) => {
  if (!allowedInstagramDownloadUrl(url)) throw new Error('آدرس فایل اینستاگرام معتبر نیست.');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error('دریافت فایل اینستاگرام ناموفق بود.');
  const size = Number(response.headers.get('content-length') || 0);
  const maxBytes = 25 * 1024 * 1024;
  if (size > maxBytes) throw new Error('حجم فایل اینستاگرام بیشتر از حد مجاز است.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > maxBytes) throw new Error('فایل اینستاگرام معتبر نیست یا بیش از حد بزرگ است.');
  return { bytes, mimeType: String(response.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim() };
};

const sha256Hex = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map((part) => part.toString(16).padStart(2, '0')).join('');

const attachInstagramFileToLead = async (orgId: string, input: any) => {
  const leadId = String(input?.leadId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) throw new Error('لید انتخاب‌شده معتبر نیست.');
  const leadRows = await serviceGet(`${SUPABASE_URL}/rest/v1/marketing_leads?id=eq.${encodeURIComponent(leadId)}&org_id=eq.${encodeURIComponent(orgId)}&select=id&limit=1`);
  if (!Array.isArray(leadRows) || !leadRows[0]?.id) throw new Error('لید در سازمان این توکن پیدا نشد.');
  const downloadUrl = String(input?.downloadUrl || '').trim();
  const { bytes, mimeType } = await fetchInstagramAttachment(downloadUrl);
  const filename = safeAttachmentName(input?.fileName);
  const digest = await sha256Hex(bytes);
  const extension = (filename.match(/\.([a-z0-9]{1,10})$/i)?.[1] || (mimeType.startsWith('image/') ? 'jpg' : mimeType.startsWith('video/') ? 'mp4' : mimeType.startsWith('audio/') ? 'm4a' : 'bin')).toLowerCase();
  const objectPath = `record_files/marketing_leads/${leadId}/instagram/${digest.slice(0, 20)}.${extension}`;
  const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/images/${objectPath}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': mimeType, 'x-upsert': 'true' },
    body: bytes,
  });
  if (!upload.ok) throw new Error(`ذخیره فایل لید ناموفق بود: ${await upload.text()}`);
  const fileUrl = `${SUPABASE_URL}/storage/v1/object/public/images/${objectPath}`;
  const fileType = mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : mimeType.startsWith('audio/') ? 'audio' : 'file';
  const assets = await servicePost(`${SUPABASE_URL}/rest/v1/file_assets`, [{
    org_id: orgId, storage_bucket: 'images', storage_path: objectPath, target_url: fileUrl,
    display_name: filename, canonical_name: filename.toLowerCase(), file_ext: extension, mime_type: mimeType,
    file_type: fileType, visibility: 'private', is_public: false, origin_module_id: 'marketing_leads', origin_record_id: leadId,
    metadata: { source: 'instagram_engagement', source_event_id: String(input?.sourceEventId || '').slice(0, 512), sha256: digest },
  }]).catch(() => []);
  const asset = Array.isArray(assets) ? assets[0] : null;
  const recordPayload = {
    org_id: orgId, module_id: 'marketing_leads', record_id: leadId, file_url: fileUrl, file_type: fileType,
    file_name: filename, mime_type: mimeType, sort_order: 0, asset_id: asset?.id || null, entry_type: 'origin', is_shortcut: false,
    source_module_id: 'marketing_leads', source_record_id: leadId,
    metadata: { source: 'instagram_engagement', source_event_id: String(input?.sourceEventId || '').slice(0, 512), sha256: digest },
  };
  // Older installations can have record_files before file-manager columns;
  // preserve the attachment itself rather than failing an otherwise valid lead.
  const records = await servicePost(`${SUPABASE_URL}/rest/v1/record_files`, [recordPayload]).catch(() => servicePost(`${SUPABASE_URL}/rest/v1/record_files`, [{
    org_id: orgId, module_id: 'marketing_leads', record_id: leadId, file_url: fileUrl, file_type: fileType,
    file_name: filename, mime_type: mimeType, sort_order: 0,
  }]));
  return { attachment: Array.isArray(records) ? records[0] : null, fileUrl };
};

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST')    return json(405, { error: 'method_not_allowed' });

  // ۱. احراز هویت
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json(401, { error: 'missing_token', message: 'توکن API ارائه نشده.' });

  const tokenInfo = await verifyToken(token);
  if (!tokenInfo) return json(401, { error: 'invalid_token', message: 'توکن معتبر نیست.' });

  // ۲. خواندن body
  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const {
    action,
    table,
    method = 'GET',
    select,
    filters,
    search,
    order,
    limit = 50,
    offset = 0,
    body: recordBody,
  } = body;

  // Restricted integration actions for an Instagram sales bridge.  They retain
  // the token-derived organization boundary and never make system tables
  // generally accessible through the REST gateway.
  const normalizedAction = String(action || '').trim().toLowerCase();
  if (normalizedAction) {
    if (!leadBridgeAllowed(tokenInfo.plan_code)) {
      return json(403, { error: 'lead_bridge_not_allowed', message: 'دسترسی به لیدهای بازاریابی در پلن فعلی سازمان مجاز نیست.' });
    }
    try {
      if (normalizedAction === 'lead_catalog') {
        return json(200, { data: await leadBridgeCatalog(tokenInfo.org_id), count: null, error: null });
      }
      if (normalizedAction === 'create_marketing_lead') {
        const catalog = await leadBridgeCatalog(tokenInfo.org_id);
        const lead = normalizeLeadPayload(recordBody ?? body.lead, catalog);
        const created = await servicePost(`${SUPABASE_URL}/rest/v1/marketing_leads`, { ...lead, org_id: tokenInfo.org_id });
        return json(201, { data: Array.isArray(created) ? created[0] : created, count: 1, error: null });
      }
      if (normalizedAction === 'attach_marketing_lead_file') {
        const result = await attachInstagramFileToLead(tokenInfo.org_id, recordBody ?? body.attachment);
        return json(201, { data: result, count: 1, error: null });
      }
      return json(400, { error: 'unknown_action', message: 'عملیات درخواستی معتبر نیست.' });
    } catch (err: any) {
      return json(400, { error: 'lead_bridge_failed', message: String(err?.message || 'عملیات لید ناموفق بود.') });
    }
  }

  // ۳. بررسی جدول
  if (!table || typeof table !== 'string') {
    return json(400, { error: 'missing_table', message: 'نام جدول مشخص نیست.' });
  }
  const tableName = table.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!tableName) return json(400, { error: 'invalid_table' });

  if (!isTableAllowed(tableName, tokenInfo.plan_code)) {
    return json(403, {
      error: 'table_not_allowed',
      message: `دسترسی به جدول "${tableName}" در پلن فعلی سازمان شما مجاز نیست.`,
    });
  }

  const { org_id } = tokenInfo;
  const normalizedMethod = String(method).toUpperCase();

  try {
    // ۴. ساخت پارامترهای کوئری
    const filterStr = buildFilterParams(filters, org_id);

    // ساخت URL پایه
    let url = `${SUPABASE_URL}/rest/v1/${tableName}?${filterStr}`;

    if (select && typeof select === 'string') {
      url += `&select=${encodeURIComponent(select)}`;
    }

    // جستجوی full-text
    if (search && typeof search === 'object' && search.query) {
      const cols: string[] = Array.isArray(search.columns)
        ? search.columns.map(String)
        : ['name'];
      const q = encodeURIComponent(String(search.query));
      // ilike روی ستون اول — PostgREST چند شرط OR را پشتیبانی می‌کند
      for (const col of cols) {
        url += `&${encodeURIComponent(col)}=ilike.*${q}*`;
      }
    }

    // مرتب‌سازی
    if (order && typeof order === 'object') {
      const col = String(order.column || 'created_at');
      const dir = order.ascending === false ? 'desc' : 'asc';
      url += `&order=${encodeURIComponent(col)}.${dir}`;
    }

    // صفحه‌بندی (فقط برای GET)
    if (normalizedMethod === 'GET') {
      const lim = Math.min(Math.max(1, Number(limit) || 50), 1000);
      const off = Math.max(0, Number(offset) || 0);
      url += `&limit=${lim}&offset=${off}`;
    }

    // ۵. اجرای کوئری
    let data: unknown;
    switch (normalizedMethod) {
      case 'GET':
        data = await serviceGet(url);
        break;
      case 'POST':
        if (!recordBody || typeof recordBody !== 'object') {
          return json(400, { error: 'missing_body', message: 'body رکورد الزامی است.' });
        }
        // org_id را اجباری اضافه کن
        data = await servicePost(
          `${SUPABASE_URL}/rest/v1/${tableName}`,
          { ...recordBody, org_id }
        );
        break;
      case 'PATCH':
        if (!recordBody || typeof recordBody !== 'object') {
          return json(400, { error: 'missing_body' });
        }
        // org_id نباید قابل تغییر باشد
        const patchBody = { ...recordBody };
        delete patchBody.org_id;
        delete patchBody.id;
        data = await servicePatch(url, patchBody);
        break;
      case 'DELETE':
        data = await serviceDelete(url);
        break;
      default:
        return json(405, { error: 'unsupported_method', message: `متد "${method}" پشتیبانی نمی‌شود.` });
    }

    const count = Array.isArray(data) ? data.length : null;
    return json(200, { data, count, error: null });

  } catch (err: any) {
    console.error('api-gateway error:', err?.message);
    return json(500, {
      error: 'internal_error',
      message: String(err?.message || 'خطای سرور'),
    });
  }
});
