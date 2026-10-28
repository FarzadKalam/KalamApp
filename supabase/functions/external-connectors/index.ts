// اتصال‌های خارجی: اعتبارسنجی و دریافت امن سفارش‌های ووکامرس در صندوق ورودی.
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-wc-webhook-signature, x-wc-webhook-topic',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, data: Record<string, unknown>) => new Response(JSON.stringify(data), {
  status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
});
const trim = (value: unknown) => String(value ?? '').trim();
const supabaseUrl = trim(Deno.env.get('SUPABASE_URL')).replace(/\/+$/, '');
const serviceKey = trim(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const cipherKey = async () => {
  const secret = trim(Deno.env.get('INTEGRATION_SECRET_ENCRYPTION_KEY')) || trim(Deno.env.get('INSTAGRAM_SECRET_ENCRYPTION_KEY'));
  if (!secret) throw new Error('کلید رمزنگاری اتصال‌ها در سرور تنظیم نشده است.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
};
const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value));
const decode = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const encrypt = async (value: string) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cipherKey(), new TextEncoder().encode(value));
  return `v1:${encode(iv)}:${encode(new Uint8Array(encrypted))}`;
};
const decrypt = async (value: string) => {
  const [version, iv, ciphertext] = value.split(':');
  if (version !== 'v1' || !iv || !ciphertext) throw new Error('اطلاعات اتصال معتبر نیست.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv) }, await cipherKey(), decode(ciphertext));
  return new TextDecoder().decode(plain);
};
const randomSecret = () => encode(crypto.getRandomValues(new Uint8Array(32)));

const validateStoreUrl = (input: unknown) => {
  const url = new URL(trim(input));
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.pathname !== '/' || url.search || url.hash ||
      hostname === 'localhost' || hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') || hostname.endsWith('.internal') ||
      /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(':') || !hostname.includes('.')) {
    throw new Error('آدرس فروشگاه باید دامنهٔ عمومی HTTPS بدون مسیر یا درگاه اختصاصی باشد.');
  }
  return url.origin;
};

const requireUserOrg = async (req: Request, orgId: string, write: boolean) => {
  const bearer = trim(req.headers.get('Authorization')).replace(/^Bearer\s+/i, '');
  if (!bearer || bearer === serviceKey) throw new Error('نشست کاربر معتبر نیست.');
  const { data: auth, error: authError } = await client.auth.getUser(bearer);
  if (authError || !auth.user) throw new Error('نشست کاربر معتبر نیست.');
  const { data: membership, error: membershipError } = await client.from('user_organization_memberships')
    .select('role_id, software_role, is_owner')
    .eq('org_id', orgId).eq('user_id', auth.user.id).eq('is_active', true).maybeSingle();
  if (membershipError || !membership) throw new Error('دسترسی به سازمان وجود ندارد.');
  const { data: featureAllowed, error: featureError } = await client.rpc('org_has_plan_feature', {
    p_org_id: orgId, p_feature_key: 'wordpress_connection', p_default_enabled: false,
  });
  if (featureError || featureAllowed !== true) throw new Error('اتصال به وردپرس در پلن این سازمان فعال نیست.');
  if (write) {
    const { data: settings, error: settingsError } = await client.from('saas_org_settings')
      .select('is_readonly').eq('org_id', orgId).maybeSingle();
    if (settingsError) throw settingsError;
    if (settings?.is_readonly === true) throw new Error('حساب سازمان در حالت فقط‌خواندنی است.');
  }
  if (membership.is_owner === true) return orgId;
  const roleName = trim(membership.software_role).toLowerCase();
  if (!['super_admin', 'admin', 'manager'].includes(roleName)) throw new Error('اجازهٔ مدیریت اتصال‌ها را ندارید.');
  if (membership.role_id) {
    const { data: role, error: roleError } = await client.from('org_roles').select('permissions')
      .eq('id', membership.role_id).eq('org_id', orgId).maybeSingle();
    if (roleError || !role) throw new Error('نقش سازمانی معتبر نیست.');
    const settings = role.permissions?.__settings_tabs || {};
    if (settings.view === false || settings.fields?.connections === false || (write && settings.edit === false)) {
      throw new Error('اجازهٔ مدیریت اتصال‌ها را ندارید.');
    }
  }
  return orgId;
};

const safeConnection = (row: any) => ({
  id: row.id, name: row.name, base_url: row.base_url, provider: row.provider,
  is_active: row.is_active, webhook_key: row.webhook_key,
  last_checked_at: row.last_checked_at, last_check_status: row.last_check_status,
  sync_policy: row.sync_policy || { products: 'manual', customers: 'manual', invoices: 'manual' },
});

const getConnection = async (orgId: string, id: string) => {
  const { data, error } = await client.from('external_connections').select('*')
    .eq('id', id).eq('org_id', orgId).eq('provider', 'woocommerce').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('اتصال فروشگاه پیدا نشد.');
  return data;
};

const wooGet = async (connection: any, path: string) => {
  const credentials = JSON.parse(await decrypt(connection.credentials_encrypted));
  const basic = btoa(`${credentials.consumerKey}:${credentials.consumerSecret}`);
  const response = await fetch(`${connection.base_url}/wp-json/wc/v3/${path}`, {
    headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403
    ? 'کلیدهای ووکامرس معتبر نیستند یا اجازهٔ خواندن سفارش ندارند.'
    : `پاسخ فروشگاه با وضعیت ${response.status} دریافت شد.`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('پاسخ سفارش‌های فروشگاه معتبر نیست.');
  return data;
};

type SyncModule = 'products' | 'customers' | 'invoices';
const syncModules: Record<SyncModule, { woo: string; local: string; fields: string }> = {
  products: { woo: 'products', local: 'products', fields: 'id,name,system_code,manual_code,product_type,updated_at' },
  customers: { woo: 'customers', local: 'customers', fields: 'id,full_name,email,mobile_1,system_code,updated_at' },
  invoices: { woo: 'orders', local: 'invoices', fields: 'id,name,system_code,sale_source,updated_at' },
};
const parseModule = (value: unknown): SyncModule => {
  if (value === 'products' || value === 'customers' || value === 'invoices') return value;
  throw new Error('نوع اطلاعات برای همگام‌سازی معتبر نیست.');
};
const syncPolicy = (value: unknown) => {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const result: Record<SyncModule, string> = { products: 'manual', customers: 'manual', invoices: 'manual' };
  for (const module of Object.keys(result) as SyncModule[]) {
    const policy = trim(source[module]);
    if (!['manual', 'taze', 'woocommerce'].includes(policy)) throw new Error('مرجع همگام‌سازی معتبر نیست.');
    result[module] = policy;
  }
  return result;
};
const wooRequest = async (connection: any, method: 'GET' | 'POST' | 'PUT', path: string, payload?: unknown) => {
  const credentials = JSON.parse(await decrypt(connection.credentials_encrypted));
  const response = await fetch(`${connection.base_url}/wp-json/wc/v3/${path}`, {
    method, headers: { Authorization: `Basic ${btoa(`${credentials.consumerKey}:${credentials.consumerSecret}`)}`,
      Accept: 'application/json', ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    body: payload ? JSON.stringify(payload) : undefined, redirect: 'error', signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`فروشگاه درخواست همگام‌سازی را نپذیرفت (وضعیت ${response.status}).`);
  return response.json();
};
const previewRecords = async (connection: any, module: SyncModule, scope: 'site' | 'system', page: number) => {
  const config = syncModules[module];
  const limit = 25;
  if (scope === 'site') {
    const remote = await wooGet(connection, `${config.woo}?per_page=${limit}&page=${page}&orderby=modified&order=desc`);
    const externalIds = remote.map((item: any) => trim(item.id));
    const { data: links, error: linksError } = await client.from('external_record_links')
      .select('local_id,external_id').eq('org_id', connection.org_id).eq('connection_id', connection.id)
      .eq('module_key', module).in('external_id', externalIds.length ? externalIds : ['-1']);
    if (linksError) throw linksError;
    const localIds = (links || []).map((item: any) => item.local_id);
    const { data: local, error: localError } = await client.from(config.local).select(config.fields)
      .eq('org_id', connection.org_id).in('id', localIds.length ? localIds : ['00000000-0000-0000-0000-000000000000']);
    if (localError) throw localError;
    const linkByExternal = new Map((links || []).map((item: any) => [item.external_id, item.local_id]));
    const localById = new Map((local || []).map((item: any) => [item.id, item]));
    const codes = remote.map((item: any) => trim(module === 'products' ? item.sku : item.email))
      .filter(Boolean).slice(0, limit);
    let candidates: any[] = [];
    if (codes.length && module === 'products') {
      const [byManual, bySystem] = await Promise.all([
        client.from('products').select('id,name,manual_code,system_code').eq('org_id', connection.org_id).in('manual_code', codes),
        client.from('products').select('id,name,manual_code,system_code').eq('org_id', connection.org_id).in('system_code', codes),
      ]);
      if (byManual.error || bySystem.error) throw byManual.error || bySystem.error;
      candidates = [...(byManual.data || []), ...(bySystem.data || [])];
    } else if (codes.length && module === 'customers') {
      const result = await client.from('customers').select('id,full_name,email').eq('org_id', connection.org_id).in('email', codes);
      if (result.error) throw result.error;
      candidates = result.data || [];
    }
    return remote.map((item: any) => {
      const externalId = trim(item.id);
      const linked = localById.get(linkByExternal.get(externalId));
      const code = trim(module === 'products' ? item.sku : item.email).toLowerCase();
      const matching = candidates.filter((candidate) => module === 'products'
        ? [candidate.manual_code, candidate.system_code].some((value) => trim(value).toLowerCase() === code)
        : trim(candidate.email).toLowerCase() === code);
      const candidate = !linked && code && matching.length === 1 ? matching[0] : null;
      return { key: `site:${externalId}`, externalId, localId: linked?.id || null,
        candidateId: candidate?.id || null, candidateName: candidate ? trim(candidate.name || candidate.full_name) : null,
        siteName: trim(item.name || item.number || [item.first_name, item.last_name].filter(Boolean).join(' ')) || `شماره ${externalId}`,
        systemName: linked ? trim(linked.name || linked.full_name || linked.system_code) : null,
        siteCode: trim(item.sku || item.number || item.email || ''),
        status: linked ? 'linked' : candidate ? 'candidate' : 'site_only', remoteType: trim(item.type || ''),
        siteUpdatedAt: trim(item.date_modified_gmt || ''), systemUpdatedAt: linked?.updated_at || null,
      };
    });
  }
  const from = (page - 1) * limit;
  const { data: local, error: localError } = await client.from(config.local).select(config.fields)
    .eq('org_id', connection.org_id).order('updated_at', { ascending: false }).range(from, from + limit - 1);
  if (localError) throw localError;
  const localIds = (local || []).map((item: any) => item.id);
  const { data: links, error: linksError } = await client.from('external_record_links')
    .select('local_id,external_id').eq('org_id', connection.org_id).eq('connection_id', connection.id)
    .eq('module_key', module).in('local_id', localIds.length ? localIds : ['00000000-0000-0000-0000-000000000000']);
  if (linksError) throw linksError;
  const linkByLocal = new Map((links || []).map((item: any) => [item.local_id, item.external_id]));
  const linkedIds = [...new Set([...linkByLocal.values()].map((id) => trim(id)).filter((id) => /^\d+$/.test(id)))];
  const linkedRemote = linkedIds.length
    ? await wooGet(connection, `${config.woo}?include=${linkedIds.join(',')}&per_page=100`)
    : [];
  const remoteById = new Map(linkedRemote.map((item: any) => [trim(item.id), item]));
  const unlinked = (local || []).filter((item: any) => !linkByLocal.has(item.id));
  const matchesByCode = new Map<string, any[]>();
  if (module === 'products') {
    const codes = [...new Set(unlinked.map((item: any) => trim(item.manual_code || item.system_code)).filter(Boolean))];
    if (codes.length) {
      const possible = await wooGet(connection, `products?sku=${encodeURIComponent(codes.join(','))}&per_page=100`);
      for (const item of possible) {
        const code = trim(item.sku).toLowerCase();
        matchesByCode.set(code, [...(matchesByCode.get(code) || []), item]);
      }
    }
  } else if (module === 'customers') {
    const emails = [...new Set(unlinked.map((item: any) => trim(item.email)).filter(Boolean))];
    for (let offset = 0; offset < emails.length; offset += 5) {
      const group = emails.slice(offset, offset + 5);
      const batches = await Promise.all(group.map((email) =>
        wooGet(connection, `customers?email=${encodeURIComponent(email)}&per_page=10`)));
      batches.forEach((matches, index) => matchesByCode.set(group[index].toLowerCase(), matches
        .filter((item: any) => trim(item.email).toLowerCase() === group[index].toLowerCase())));
    }
  }
  return (local || []).map((item: any) => {
    const linkedId = trim(linkByLocal.get(item.id));
    const code = trim(item.manual_code || item.system_code || item.email).toLowerCase();
    const candidates = !linkedId ? matchesByCode.get(code) || [] : [];
    const candidate = candidates.length === 1 ? candidates[0] : null;
    const remote = linkedId ? remoteById.get(linkedId) : candidate;
    return { key: `system:${item.id}`, localId: item.id,
      externalId: linkedId || (candidate ? trim(candidate.id) : null),
      candidateId: candidate ? item.id : null,
      systemName: trim(item.name || item.full_name || item.system_code) || 'بدون عنوان',
      siteName: remote ? trim(remote.name || remote.number || [remote.first_name, remote.last_name].filter(Boolean).join(' ')) : null,
      siteCode: trim(item.manual_code || item.system_code || item.email || ''),
      status: linkedId ? remote ? 'linked' : 'missing_site' : candidate ? 'candidate' : module === 'invoices' ? 'unverified' : 'system_only',
      remoteType: trim(remote?.type || ''), systemUpdatedAt: item.updated_at || null,
    };
  });
};

const moneyFactor = async (connection: any) => {
  const { data: company, error } = await client.from('company_settings').select('currency_code')
    .eq('org_id', connection.org_id).maybeSingle();
  if (error) throw error;
  const settings = await wooGet(connection, 'settings/general');
  const wooCurrency = trim(settings.find((entry: any) => entry.id === 'woocommerce_currency')?.value).toUpperCase();
  const localCurrency = trim(company?.currency_code || 'IRT').toUpperCase();
  if (!['IRR', 'IRT'].includes(wooCurrency) || !['IRR', 'IRT'].includes(localCurrency)) {
    throw new Error('واحد پول فروشگاه و سازمان باید ریال یا تومان باشد.');
  }
  return wooCurrency === localCurrency ? 1 : wooCurrency === 'IRR' ? 0.1 : 10;
};
const persistLink = async (connection: any, module: SyncModule, localId: string, externalId: string) => {
  const { error } = await client.from('external_record_links').insert({
    org_id: connection.org_id, connection_id: connection.id, module_key: module,
    local_id: localId, external_id: externalId, synced_at: new Date().toISOString(),
  });
  if (error) {
    if (error.code !== '23505') throw error;
    const { data: existing, error: lookupError } = await client.from('external_record_links')
      .select('local_id,external_id').eq('connection_id', connection.id).eq('org_id', connection.org_id)
      .eq('module_key', module).eq('external_id', externalId).maybeSingle();
    if (lookupError || existing?.local_id !== localId) throw new Error('این رکورد قبلاً به رکورد دیگری متصل شده است.');
  }
};
const linkMatchingRecord = async (connection: any, module: SyncModule, localId: string, externalId: string) => {
  if (module === 'invoices' || !/^[0-9a-f-]{36}$/i.test(localId) || !/^\d+$/.test(externalId)) {
    throw new Error('رکوردهای انتخاب‌شده معتبر نیستند.');
  }
  const remote = await wooRequest(connection, 'GET', `${syncModules[module].woo}/${externalId}`);
  const { data: local, error } = await client.from(syncModules[module].local).select('*')
    .eq('org_id', connection.org_id).eq('id', localId).maybeSingle();
  if (error || !local) throw new Error('رکورد تازه سیستم پیدا نشد.');
  const same = module === 'products'
    ? Boolean(trim(remote.sku)) && [local.manual_code, local.system_code].some((code) => trim(code).toLowerCase() === trim(remote.sku).toLowerCase())
    : Boolean(trim(remote.email)) && trim(remote.email).toLowerCase() === trim(local.email).toLowerCase();
  if (!same) throw new Error('کد کالا یا ایمیل مشتری در دو طرف یکسان نیست.');
  await persistLink(connection, module, localId, externalId);
};
const exportInvoice = async (connection: any, localId: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(localId)) throw new Error('فاکتور مشخص نیست.');
  const { data: invoice, error } = await client.from('invoices')
    .select('id,name,status,system_code,customer_id,invoiceItems,total_invoice_amount,total_received_amount,shipping_amount,invoice_discount_amount')
    .eq('org_id', connection.org_id).eq('id', localId).maybeSingle();
  if (error || !invoice) throw new Error('فاکتور در این سازمان پیدا نشد.');
  const { data: existing, error: existingError } = await client.from('external_record_links')
    .select('external_id').eq('org_id', connection.org_id).eq('connection_id', connection.id)
    .eq('module_key', 'invoices').eq('local_id', localId).maybeSingle();
  if (existingError) throw existingError;
  if (existing) throw new Error('این فاکتور قبلاً به سفارش فروشگاه متصل شده است.');
  if (!trim(invoice.system_code)) throw new Error('برای ارسال امن فاکتور، کد سیستمی آن باید ثبت شده باشد.');
  const recentOrders = await wooGet(connection, 'orders?per_page=50&orderby=date&order=desc');
  const matchingOrder = recentOrders.find((order: any) => Array.isArray(order.meta_data)
    && order.meta_data.some((entry: any) => entry.key === '_tazesystem_invoice_code'
      && trim(entry.value) === trim(invoice.system_code)));
  if (matchingOrder) {
    await persistLink(connection, 'invoices', localId, trim(matchingOrder.id));
    return { localId, externalId: trim(matchingOrder.id), warning: null };
  }
  if (['canceled', 'settled', 'completed'].includes(trim(invoice.status)) || Number(invoice.total_received_amount || 0) > 0) {
    throw new Error('فاکتور لغوشده یا دارای دریافت مالی برای ایجاد سفارش تازه مناسب نیست.');
  }
  if (Number(invoice.invoice_discount_amount || 0) !== 0) {
    throw new Error('برای ارسال این فاکتور، تخفیف کلی باید ابتدا در فروشگاه نگاشت شود.');
  }
  const items = Array.isArray(invoice.invoiceItems) ? invoice.invoiceItems : [];
  if (!items.length) throw new Error('فاکتور قلمی برای ارسال ندارد.');
  const factor = await moneyFactor(connection);
  const productIds = [...new Set(items.map((item: any) => trim(item.product_id)).filter(Boolean))];
  if (!productIds.length) throw new Error('ابتدا کالاهای فاکتور را به فروشگاه متصل کنید.');
  const { data: productLinks, error: linksError } = await client.from('external_record_links')
    .select('local_id,external_id').eq('org_id', connection.org_id).eq('connection_id', connection.id)
    .eq('module_key', 'products').in('local_id', productIds);
  if (linksError) throw linksError;
  const productMap = new Map((productLinks || []).map((item: any) => [item.local_id, item.external_id]));
  let expected = Number(invoice.shipping_amount || 0);
  const lineItems = items.map((item: any) => {
    const productId = trim(productMap.get(trim(item.product_id)));
    const quantity = Number(item.quantity);
    const total = Number(item.total_price || 0);
    if (!/^\d+$/.test(productId)) throw new Error('ابتدا همهٔ کالاهای فاکتور را به فروشگاه متصل کنید.');
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('تعداد اقلام باید عدد صحیح مثبت باشد.');
    if (!Number.isFinite(total) || total < 0 || Number(item.vat || 0) !== 0) {
      throw new Error('فاکتور دارای مالیات یا مبلغ نامعتبر است؛ ارسال آن نیاز به نگاشت مالیاتی دارد.');
    }
    expected += total;
    return { product_id: Number(productId), quantity,
      subtotal: String(Math.round(total / factor * 100) / 100), total: String(Math.round(total / factor * 100) / 100) };
  });
  if (Math.abs(expected - Number(invoice.total_invoice_amount || 0)) > 1) {
    throw new Error('جمع اقلام و هزینهٔ ارسال با مبلغ فاکتور برابر نیست.');
  }
  let customer: any = null;
  let customerExternal = '';
  if (invoice.customer_id) {
    const [customerResult, customerLinkResult] = await Promise.all([
      client.from('customers').select('full_name,first_name,last_name,email,mobile_1,address,city,postal_code')
        .eq('org_id', connection.org_id).eq('id', invoice.customer_id).maybeSingle(),
      client.from('external_record_links').select('external_id').eq('org_id', connection.org_id)
        .eq('connection_id', connection.id).eq('module_key', 'customers').eq('local_id', invoice.customer_id).maybeSingle(),
    ]);
    if (customerResult.error || customerLinkResult.error) throw customerResult.error || customerLinkResult.error;
    customer = customerResult.data;
    customerExternal = trim(customerLinkResult.data?.external_id);
  }
  const payload = { status: 'pending', set_paid: false,
    ...(customerExternal ? { customer_id: Number(customerExternal) } : {}),
    billing: { first_name: trim(customer?.first_name || customer?.full_name), last_name: trim(customer?.last_name),
      email: trim(customer?.email), phone: trim(customer?.mobile_1), address_1: trim(customer?.address),
      city: trim(customer?.city), postcode: trim(customer?.postal_code) },
    line_items: lineItems,
    ...(Number(invoice.shipping_amount || 0) > 0 ? { shipping_lines: [{ method_title: 'ارسال', method_id: 'flat_rate',
      total: String(Math.round(Number(invoice.shipping_amount) / factor * 100) / 100) }] } : {}),
    meta_data: [{ key: '_tazesystem_invoice_code', value: trim(invoice.system_code) }],
  };
  const remote = await wooRequest(connection, 'POST', 'orders', payload);
  const externalId = trim(remote.id);
  if (!/^\d+$/.test(externalId)) throw new Error('سفارش ساخته شد ولی شناسهٔ معتبری از فروشگاه دریافت نشد.');
  await persistLink(connection, 'invoices', localId, externalId);
  const remoteTotal = Number(remote.total || 0) * factor;
  return { externalId, localId, warning: Math.abs(remoteTotal - Number(invoice.total_invoice_amount || 0)) > 1
    ? 'مبلغ سفارش ساخته‌شده با فاکتور برابر نیست؛ آن را در فروشگاه بررسی کنید.' : null };
};
const syncRecord = async (connection: any, module: SyncModule, direction: 'from_site' | 'to_site', localId: string, externalId: string) => {
  if (module === 'invoices') {
    if (direction !== 'to_site') throw new Error('دریافت فاکتور از مسیر سفارش‌های فروشگاه انجام می‌شود.');
    return exportInvoice(connection, localId);
  }
  if (direction === 'from_site') {
    if (!/^\d+$/.test(externalId)) throw new Error('شناسهٔ رکورد فروشگاه معتبر نیست.');
    const remote = await wooRequest(connection, 'GET', `${syncModules[module].woo}/${externalId}`);
    const { data: link, error: linkError } = await client.from('external_record_links').select('local_id')
      .eq('connection_id', connection.id).eq('org_id', connection.org_id)
      .eq('module_key', module).eq('external_id', externalId).maybeSingle();
    if (linkError) throw linkError;
    let targetId = trim(link?.local_id);
    if (targetId && connection.sync_policy?.[module] === 'taze') {
      throw new Error('مرجع این بخش تازه سیستم است؛ ابتدا مرجع اتصال را تغییر دهید.');
    }
    if (targetId) {
      const { data: target, error } = await client.from(syncModules[module].local).select('id')
        .eq('org_id', connection.org_id).eq('id', targetId).maybeSingle();
      if (error || !target) throw new Error('رکورد مقصد در این سازمان پیدا نشد.');
    } else if (module === 'products' && trim(remote.sku)) {
      const [manual, system] = await Promise.all([
        client.from('products').select('id').eq('org_id', connection.org_id).eq('manual_code', trim(remote.sku)).limit(1),
        client.from('products').select('id').eq('org_id', connection.org_id).eq('system_code', trim(remote.sku)).limit(1),
      ]);
      if (manual.error || system.error) throw manual.error || system.error;
      if (manual.data?.length || system.data?.length) throw new Error('کالایی با همین کد وجود دارد؛ ابتدا آن را به فروشگاه متصل کنید.');
    } else if (module === 'customers' && trim(remote.email)) {
      const { data, error } = await client.from('customers').select('id')
        .eq('org_id', connection.org_id).ilike('email', trim(remote.email)).limit(1);
      if (error) throw error;
      if (data?.length) throw new Error('مشتری با همین ایمیل وجود دارد؛ ابتدا آن را به فروشگاه متصل کنید.');
    }
    if (module === 'products') {
      if (remote.type !== 'simple') throw new Error('فعلاً تنها کالای سادهٔ ووکامرس قابل دریافت است.');
      const factor = await moneyFactor(connection);
      const values = { org_id: connection.org_id, name: trim(remote.name),
        manual_code: trim(remote.sku) || null, product_type: remote.virtual === true ? 'service' : 'goods',
        sell_price: Number(remote.price || remote.regular_price || 0) * factor,
        description: trim(remote.description || remote.short_description) || null,
        image_url: trim(remote.images?.[0]?.src) || null,
        status: remote.status === 'publish' ? 'active' : 'inactive',
      };
      if (targetId) {
        const { error } = await client.from('products').update(values).eq('id', targetId).eq('org_id', connection.org_id);
        if (error) throw error;
      } else {
        const { data, error } = await client.from('products').insert(values).select('id').single();
        if (error) throw error;
        targetId = data.id;
      }
    } else {
      const fullName = [trim(remote.first_name), trim(remote.last_name)].filter(Boolean).join(' ') || trim(remote.billing?.company) || 'مشتری فروشگاه';
      const values = { org_id: connection.org_id, full_name: fullName,
        first_name: trim(remote.first_name) || null, last_name: trim(remote.last_name) || null,
        email: trim(remote.email) || null, mobile_1: trim(remote.billing?.phone) || null,
        address: trim(remote.billing?.address_1) || null, city: trim(remote.billing?.city) || null,
      };
      if (targetId) {
        const { error } = await client.from('customers').update(values).eq('id', targetId).eq('org_id', connection.org_id);
        if (error) throw error;
      } else {
        const { data, error } = await client.from('customers').insert(values).select('id').single();
        if (error) throw error;
        targetId = data.id;
      }
    }
    await persistLink(connection, module, targetId, externalId);
    return { localId: targetId, externalId };
  }
  if (!/^[0-9a-f-]{36}$/i.test(localId)) throw new Error('رکورد تازه سیستم مشخص نیست.');
  const { data: local, error: localError } = await client.from(syncModules[module].local).select('*')
    .eq('org_id', connection.org_id).eq('id', localId).maybeSingle();
  if (localError || !local) throw new Error('رکورد تازه سیستم پیدا نشد.');
  const { data: link, error: linkError } = await client.from('external_record_links').select('external_id')
    .eq('connection_id', connection.id).eq('org_id', connection.org_id)
    .eq('module_key', module).eq('local_id', localId).maybeSingle();
  if (linkError) throw linkError;
  const targetExternal = trim(link?.external_id);
  if (targetExternal && connection.sync_policy?.[module] === 'woocommerce') {
    throw new Error('مرجع این بخش فروشگاه است؛ ابتدا مرجع اتصال را تغییر دهید.');
  }
  let payload: Record<string, unknown>;
  if (module === 'products') {
    const factor = await moneyFactor(connection);
    payload = { name: trim(local.name), sku: trim(local.manual_code || local.system_code),
      type: 'simple', virtual: local.product_type === 'service',
      regular_price: String(Math.round(Number(local.sell_price || 0) / factor * 100) / 100),
      description: trim(local.description), status: local.status === 'active' ? 'publish' : 'draft',
      ...(local.product_type === 'service' ? {} : { manage_stock: true, stock_quantity: Math.max(0, Math.floor(Number(local.stock || 0))) }),
      ...(trim(local.image_url) ? { images: [{ src: trim(local.image_url) }] } : {}),
    };
  } else {
    if (!trim(local.email)) throw new Error('برای ارسال مشتری به ووکامرس، ایمیل او لازم است.');
    payload = { email: trim(local.email), first_name: trim(local.first_name) || trim(local.full_name),
      last_name: trim(local.last_name), billing: { phone: trim(local.mobile_1),
        address_1: trim(local.address), city: trim(local.city) } };
  }
  const remote = await wooRequest(connection, targetExternal ? 'PUT' : 'POST',
    `${syncModules[module].woo}${targetExternal ? `/${targetExternal}` : ''}`, payload);
  const nextExternal = trim(remote.id);
  if (!/^\d+$/.test(nextExternal)) throw new Error('پاسخ فروشگاه شناسهٔ معتبر ندارد.');
  await persistLink(connection, module, localId, nextExternal);
  return { localId, externalId: nextExternal };
};

const storeOrder = async (connection: any, order: any) => {
  const externalId = trim(order?.id);
  if (!/^\d+$/.test(externalId)) throw new Error('شناسهٔ سفارش ووکامرس معتبر نیست.');
  const modified = trim(order.date_modified_gmt || order.date_created_gmt);
  const sourceUpdatedAt = modified ? `${modified.replace(/Z$/, '')}Z` : null;
  const { error } = await client.rpc('store_external_order', {
    p_connection_id: connection.id,
    p_external_id: externalId,
    p_external_status: trim(order.status),
    p_source_updated_at: sourceUpdatedAt,
    p_payload: order,
  });
  if (error) throw error;
  const { error: importError } = await client.rpc('import_woocommerce_order', {
    p_connection_id: connection.id, p_external_id: externalId,
  });
  if (importError) {
    await client.from('external_order_inbox').update({ processing_status: 'error' })
      .eq('connection_id', connection.id).eq('org_id', connection.org_id).eq('external_id', externalId);
    throw new Error(`سفارش ${externalId} دریافت شد ولی تبدیل آن به فاکتور ناموفق بود: ${importError.message}`);
  }
};

const verifyWooSignature = async (body: string, secret: string, received: string) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  let actual: Uint8Array;
  try { actual = decode(received); } catch { return false; }
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < actual.length; i += 1) difference |= actual[i] ^ expected[i];
  return difference === 0;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  try {
    const url = new URL(req.url);
    const webhookKey = trim(url.searchParams.get('webhook'));
    if (webhookKey) {
      const length = Number(req.headers.get('content-length') || 0);
      if (length > 1024 * 1024) return reply(413, { error: 'payload_too_large' });
      const raw = await req.text();
      if (raw.length > 1024 * 1024) return reply(413, { error: 'payload_too_large' });
      const { data: connection, error } = await client.from('external_connections').select('*')
        .eq('webhook_key', webhookKey).eq('provider', 'woocommerce').eq('is_active', true).maybeSingle();
      if (error || !connection) return reply(404, { error: 'connection_not_found' });
      const { data: webhookAllowed } = await client.rpc('org_has_plan_feature', {
        p_org_id: connection.org_id, p_feature_key: 'wordpress_connection', p_default_enabled: false,
      });
      if (webhookAllowed !== true) return reply(403, { error: 'plan_feature_disabled' });
      const { data: webhookSettings } = await client.from('saas_org_settings').select('is_readonly')
        .eq('org_id', connection.org_id).maybeSingle();
      if (webhookSettings?.is_readonly === true) return reply(403, { error: 'org_readonly' });
      const signature = trim(req.headers.get('x-wc-webhook-signature'));
      if (!await verifyWooSignature(raw, await decrypt(connection.webhook_secret_encrypted), signature)) {
        return reply(401, { error: 'invalid_signature' });
      }
      const topic = trim(req.headers.get('x-wc-webhook-topic'));
      if (!['order.created', 'order.updated'].includes(topic)) return reply(200, { ok: true, ignored: true });
      await storeOrder(connection, JSON.parse(raw));
      return reply(200, { ok: true });
    }

    const body = await req.json();
    const action = trim(body?.action);
    const orgId = trim(body?.orgId);
    if (!/^[0-9a-f-]{36}$/i.test(orgId)) return reply(400, { error: 'invalid_org' });
    await requireUserOrg(req, orgId, !['list', 'list_orders', 'preview_sync'].includes(action));

    if (action === 'list') {
      const { data, error } = await client.from('external_connections')
        .select('*').eq('org_id', orgId).eq('provider', 'woocommerce').order('created_at', { ascending: false });
      if (error) throw error;
      return reply(200, { connections: (data || []).map(safeConnection) });
    }
    if (action === 'save') {
      const baseUrl = validateStoreUrl(body.baseUrl);
      const consumerKey = trim(body.consumerKey);
      const consumerSecret = trim(body.consumerSecret);
      const name = trim(body.name).slice(0, 120) || new URL(baseUrl).hostname;
      const existing = body.id ? await getConnection(orgId, trim(body.id)) : null;
      if (!existing && (!consumerKey || !consumerSecret)) throw new Error('کلید و رمز ووکامرس الزامی است.');
      if (existing && Boolean(consumerKey) !== Boolean(consumerSecret)) {
        throw new Error('برای تغییر دسترسی، کلید و رمز ووکامرس را با هم وارد کنید.');
      }
      const webhookSecret = existing ? null : randomSecret();
      const policy = existing?.sync_policy || { products: 'manual', customers: 'manual', invoices: 'manual' };
      const payload = {
        org_id: orgId, provider: 'woocommerce', name, base_url: baseUrl,
        credentials_encrypted: consumerKey && consumerSecret
          ? await encrypt(JSON.stringify({ consumerKey, consumerSecret }))
          : existing.credentials_encrypted,
        webhook_secret_encrypted: webhookSecret
          ? await encrypt(webhookSecret) : existing.webhook_secret_encrypted,
        is_active: body.isActive === true,
        sync_policy: policy,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = existing
        ? await client.from('external_connections').update(payload).eq('id', existing.id).eq('org_id', orgId).select('*').single()
        : await client.from('external_connections').insert(payload).select('*').single();
      if (error) throw error;
      const { error: optionError } = await client.from('dynamic_options').upsert({
        org_id: orgId, category: 'sales_source', value: 'woocommerce',
        label: 'فروشگاه وردپرسی', display_order: 100, is_active: true,
      }, { onConflict: 'org_id,category,value' });
      if (optionError) throw optionError;
      return reply(200, { connection: safeConnection(data), webhookSecret });
    }
    if (action === 'save_sync_policy') {
      const connection = await getConnection(orgId, trim(body.id));
      const policy = syncPolicy(body.policy);
      const { data, error } = await client.from('external_connections')
        .update({ sync_policy: policy, updated_at: new Date().toISOString() })
        .eq('id', connection.id).eq('org_id', orgId).select('*').single();
      if (error) throw error;
      return reply(200, { connection: safeConnection(data) });
    }
    if (action === 'preview_sync') {
      const connection = await getConnection(orgId, trim(body.id));
      if (!connection.is_active) throw new Error('ابتدا اتصال را فعال کنید.');
      const module = parseModule(body.module);
      const scope = body.scope === 'system' ? 'system' : 'site';
      const page = Math.max(1, Math.min(1000, Math.floor(Number(body.page) || 1)));
      return reply(200, { rows: await previewRecords(connection, module, scope, page), page, scope, module });
    }
    if (action === 'sync_record') {
      const connection = await getConnection(orgId, trim(body.id));
      if (!connection.is_active) throw new Error('ابتدا اتصال را فعال کنید.');
      const module = parseModule(body.module);
      const direction = body.direction === 'from_site' ? 'from_site' : body.direction === 'to_site' ? 'to_site' : null;
      if (!direction) throw new Error('جهت همگام‌سازی معتبر نیست.');
      return reply(200, { result: await syncRecord(connection, module, direction, trim(body.localId), trim(body.externalId)) });
    }
    if (action === 'link_matching_record') {
      const connection = await getConnection(orgId, trim(body.id));
      if (!connection.is_active) throw new Error('ابتدا اتصال را فعال کنید.');
      await linkMatchingRecord(connection, parseModule(body.module), trim(body.localId), trim(body.externalId));
      return reply(200, { ok: true });
    }
    if (action === 'unlink_record') {
      const connection = await getConnection(orgId, trim(body.id));
      const module = parseModule(body.module);
      if (module === 'invoices') throw new Error('اتصال فاکتور به سفارش برای جلوگیری از ثبت تکراری قابل حذف نیست.');
      const { error } = await client.from('external_record_links').delete()
        .eq('org_id', orgId).eq('connection_id', connection.id).eq('module_key', module)
        .eq('local_id', trim(body.localId)).eq('external_id', trim(body.externalId));
      if (error) throw error;
      return reply(200, { ok: true });
    }
    if (action === 'rotate_webhook_secret') {
      const connection = await getConnection(orgId, trim(body.id));
      const webhookSecret = randomSecret();
      const { error } = await client.from('external_connections')
        .update({ webhook_secret_encrypted: await encrypt(webhookSecret), updated_at: new Date().toISOString() })
        .eq('id', connection.id).eq('org_id', orgId);
      if (error) throw error;
      return reply(200, { webhookSecret, connection: safeConnection(connection) });
    }
    if (action === 'test' || action === 'sync_orders') {
      const connection = await getConnection(orgId, trim(body.id));
      if (!connection.is_active) throw new Error('ابتدا اتصال را فعال کنید.');
      if (action === 'test') {
        await wooGet(connection, 'orders?per_page=1');
        await client.from('external_connections').update({
          last_checked_at: new Date().toISOString(), last_check_status: 'ok',
        }).eq('id', connection.id);
        return reply(200, { ok: true });
      }
      const page = Math.max(1, Math.min(1000, Math.floor(Number(body.page) || 1)));
      const orders = await wooGet(connection, `orders?per_page=25&page=${page}&orderby=modified&order=desc`);
      let imported = 0;
      const failed: string[] = [];
      for (const order of orders) {
        try { await storeOrder(connection, order); imported += 1; }
        catch (error) { failed.push(`سفارش ${trim(order?.number || order?.id)}: ${error instanceof Error ? error.message : 'خطای نامشخص'}`); }
      }
      return reply(200, { ok: failed.length === 0, received: orders.length, imported, failed, page });
    }
    if (action === 'list_orders') {
      const connection = await getConnection(orgId, trim(body.id));
      const { data, error } = await client.from('external_order_inbox')
        .select('external_id,external_status,source_updated_at,received_at,processing_status')
        .eq('org_id', orgId).eq('connection_id', connection.id)
        .order('received_at', { ascending: false }).limit(30);
      if (error) throw error;
      return reply(200, { orders: data || [] });
    }
    return reply(400, { error: 'unknown_action' });
  } catch (error) {
    console.error('external-connectors:', error instanceof Error ? error.message : 'unknown');
    return reply(400, { error: 'request_failed', message: error instanceof Error ? error.message : 'درخواست ناموفق بود.' });
  }
});
