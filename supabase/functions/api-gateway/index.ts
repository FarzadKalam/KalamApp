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
    headers: serviceHeaders,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
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
