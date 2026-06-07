// @ts-nocheck
// webhook-delivery: Delivers org webhook events to external URLs
// Called by Supabase Database Webhooks on INSERT/UPDATE/DELETE on business tables.
// Payload is signed with HMAC-SHA256 using the webhook's secret.

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

const serviceHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  apikey: SUPABASE_ANON_KEY,
};

// ── HMAC-SHA256 signature ────────────────────────────────────────────────────

const computeHmac = async (secret: string, payload: string): Promise<string> => {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

// ── Deliver to a single webhook URL ─────────────────────────────────────────

const deliverWebhook = async (
  webhookId: string,
  url: string,
  secret: string,
  payload: Record<string, any>
): Promise<{ status: number; ok: boolean }> => {
  const body = JSON.stringify(payload);
  const sig = await computeHmac(secret, body);
  const timestamp = payload.timestamp ?? new Date().toISOString();

  let httpStatus = 0;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TazeSystem-Signature': `sha256=${sig}`,
        'X-TazeSystem-Event': String(payload.event ?? ''),
        'X-TazeSystem-Timestamp': timestamp,
      },
      body,
      signal: AbortSignal.timeout(15_000), // 15 ثانیه timeout
    });
    httpStatus = res.status;
  } catch (err: any) {
    console.error(`webhook-delivery: delivery failed for ${webhookId}:`, err?.message);
    httpStatus = 0;
  }

  // به‌روزرسانی last_fired_at و last_status
  fetch(`${SUPABASE_URL}/rest/v1/org_webhooks?id=eq.${webhookId}`, {
    method: 'PATCH',
    headers: serviceHeaders,
    body: JSON.stringify({
      last_fired_at: new Date().toISOString(),
      last_status: httpStatus,
    }),
  }).catch(() => {});

  return { status: httpStatus, ok: httpStatus >= 200 && httpStatus < 300 };
};

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST')    return json(405, { error: 'method_not_allowed' });

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  // Supabase Database Webhook payload format:
  // { type: 'INSERT'|'UPDATE'|'DELETE', table, schema, record, old_record }
  const { type, table, record, old_record } = body;

  if (!type || !table) {
    return json(400, { error: 'invalid_payload', message: 'type و table الزامی هستند.' });
  }

  const eventVerb = type === 'INSERT' ? 'created' : type === 'UPDATE' ? 'updated' : 'deleted';
  const eventName = `${table}.${eventVerb}`;
  const orgId: string | undefined =
    (record?.org_id) ?? (old_record?.org_id);

  if (!orgId) {
    // جدول org_id ندارد — نادیده بگیر
    return json(200, { ok: true, delivered: 0 });
  }

  // webhooks فعال این org که این جدول را subscribe کرده‌اند
  const tableFilter = encodeURIComponent(`{${table}}`);
  const webhooksRes = await fetch(
    `${SUPABASE_URL}/rest/v1/org_webhooks?org_id=eq.${orgId}&is_active=eq.true&select=id,url,secret,events,tables`,
    { headers: serviceHeaders }
  );

  if (!webhooksRes.ok) {
    console.error('webhook-delivery: failed to load webhooks', await webhooksRes.text());
    return json(500, { error: 'db_error' });
  }

  const webhooks: Array<{
    id: string;
    url: string;
    secret: string;
    events: string[];
    tables: string[];
  }> = await webhooksRes.json();

  // فیلتر: این webhook باید این رویداد یا جدول را subscribe کرده باشد
  const matched = webhooks.filter(wh => {
    const hasTableFilter = Array.isArray(wh.tables) && wh.tables.length > 0;
    const hasEventFilter = Array.isArray(wh.events) && wh.events.length > 0;
    const tableMatch = !hasTableFilter || wh.tables.includes(table);
    const eventMatch = !hasEventFilter || wh.events.includes(eventName) || wh.events.includes(`${table}.*`);
    return tableMatch && eventMatch;
  });

  if (matched.length === 0) {
    return json(200, { ok: true, delivered: 0 });
  }

  const timestamp = new Date().toISOString();
  const recordData = type === 'DELETE' ? old_record : record;

  const payload = {
    event:     eventName,
    table,
    record_id: recordData?.id ?? null,
    timestamp,
    data:      recordData ?? null,
  };

  // ارسال موازی به همه webhooks
  const results = await Promise.allSettled(
    matched.map(wh => deliverWebhook(wh.id, wh.url, wh.secret, payload))
  );

  const delivered = results.filter(
    r => r.status === 'fulfilled' && r.value.ok
  ).length;

  return json(200, { ok: true, delivered, total: matched.length });
});
