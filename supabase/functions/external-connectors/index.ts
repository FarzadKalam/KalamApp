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
    await requireUserOrg(req, orgId, !['list', 'list_orders'].includes(action));

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
      const payload = {
        org_id: orgId, provider: 'woocommerce', name, base_url: baseUrl,
        credentials_encrypted: consumerKey && consumerSecret
          ? await encrypt(JSON.stringify({ consumerKey, consumerSecret }))
          : existing.credentials_encrypted,
        webhook_secret_encrypted: webhookSecret
          ? await encrypt(webhookSecret) : existing.webhook_secret_encrypted,
        is_active: body.isActive === true,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = existing
        ? await client.from('external_connections').update(payload).eq('id', existing.id).eq('org_id', orgId).select('*').single()
        : await client.from('external_connections').insert(payload).select('*').single();
      if (error) throw error;
      return reply(200, { connection: safeConnection(data), webhookSecret });
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
      const orders = await wooGet(connection, `orders?per_page=50&page=${page}&orderby=modified&order=desc`);
      for (const order of orders) await storeOrder(connection, order);
      return reply(200, { ok: true, received: orders.length, page });
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
