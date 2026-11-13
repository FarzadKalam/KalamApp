// @ts-nocheck
import { dialPhone } from '../_shared/phone-number.ts';
import { parseTehranProviderDateTimeToUtcIso } from '../_shared/tehran-datetime.ts';
import {
  normalizeProviderWebhookPayload,
  normalizeVoipProviderKey,
} from '../_shared/voip-providers.ts';

const FUNCTION_BUILD = 'voip-call-webhook-2026-11-12-multi-provider';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-kalam-webhook-secret, x-kalam-voip-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const trimTrailingSlash = (value: string) => String(value || '').replace(/\/+$/, '');
const parseJsonSafe = (raw: string) => {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const serviceHeaders = (key: string) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
});
const firstValue = (...values: any[]) => {
  for (const val of values) {
    if (val === false || val === null || val === undefined || typeof val === 'object') continue;
    const s = String(val).trim();
    if (s) return s;
  }
  return '';
};
const textResp = (status: number, body: string) =>
  new Response(body, { status, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } });

const scrubSecrets = (value: any): any => {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(scrubSecrets);
  const next: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    if (/secret|token|password|auth/i.test(k)) next[k] = '[redacted]';
    else next[k] = scrubSecrets(v);
  }
  return next;
};

const readBody = async (req: Request): Promise<Record<string, any>> => {
  if (req.method === 'GET') return {};
  const raw = await req.text().catch(() => '');
  if (!raw.trim()) return {};
  const jsonParsed = parseJsonSafe(raw);
  if (jsonParsed && typeof jsonParsed === 'object') return jsonParsed;
  try {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  } catch {
    return {};
  }
};

const resolveOrgVoipSettings = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  secret: string,
  orgId?: string,
) => {
  const url = new URL(`${trimTrailingSlash(supabaseUrl)}/rest/v1/integration_settings`);
  url.searchParams.set('connection_type', 'eq.voip');
  url.searchParams.set('is_active', 'eq.true');
  if (orgId) url.searchParams.set('org_id', `eq.${orgId}`);
  url.searchParams.set('select', 'id,org_id,provider,settings');
  url.searchParams.set('limit', '100');

  const res = await fetch(url.toString(), { headers: serviceHeaders(serviceRoleKey) });
  if (!res.ok) return null;
  const rows = parseJsonSafe(await res.text()) || [];
  if (!Array.isArray(rows)) return null;

  const matched = rows.find((row) => String(row?.settings?.webhook_secret || '').trim() === secret);
  if (matched) return matched;

  // Also check voip_sip_trunks webhook_secret
  const trunkUrl = new URL(`${trimTrailingSlash(supabaseUrl)}/rest/v1/voip_sip_trunks`);
  trunkUrl.searchParams.set('is_active', 'eq.true');
  trunkUrl.searchParams.set('webhook_secret', `eq.${secret}`);
  if (orgId) trunkUrl.searchParams.set('org_id', `eq.${orgId}`);
  trunkUrl.searchParams.set('select', 'id,org_id,provider');
  trunkUrl.searchParams.set('limit', '1');
  const trunkRes = await fetch(trunkUrl.toString(), { headers: serviceHeaders(serviceRoleKey) });
  if (trunkRes.ok) {
    const trunkRows = parseJsonSafe(await trunkRes.text()) || [];
    if (Array.isArray(trunkRows) && trunkRows[0]?.org_id) {
      return { org_id: trunkRows[0].org_id, provider: trunkRows[0].provider, settings: {} };
    }
  }
  return null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return textResp(200, 'ok');

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return textResp(500, 'server config error');

  try {
    const url = new URL(req.url);
    const query = Object.fromEntries(url.searchParams.entries());

    // Internal Asterisk trunk resolver (strictly authenticated by shared internal secret)
    if (query.action === 'resolve_trunk') {
      const expectedInternal = String(Deno.env.get('KALAMAPP_VOIP_INTERNAL_SECRET') || '').trim();
      const gotInternal = String(req.headers.get('x-kalam-voip-secret') || '').trim();
      if (!expectedInternal || gotInternal !== expectedInternal) {
        return textResp(401, '');
      }
      const ns = String(query.ns || '').trim().toLowerCase();
      if (!ns.startsWith('k_')) return textResp(200, '');
      const trunkUrl = new URL(`${trimTrailingSlash(supabaseUrl)}/rest/v1/voip_sip_trunks`);
      trunkUrl.searchParams.set('is_active', 'eq.true');
      trunkUrl.searchParams.set('pjsip_trunk_id', `like.${ns}_trk_%`);
      trunkUrl.searchParams.set('order', 'is_default.desc,created_at.asc');
      trunkUrl.searchParams.set('select', 'pjsip_trunk_id');
      trunkUrl.searchParams.set('limit', '1');
      const res = await fetch(trunkUrl.toString(), { headers: serviceHeaders(serviceRoleKey) });
      const rows = res.ok ? parseJsonSafe(await res.text()) : [];
      const pjsipTrunkId = Array.isArray(rows) && rows[0]?.pjsip_trunk_id ? String(rows[0].pjsip_trunk_id) : '';
      return textResp(200, pjsipTrunkId);
    }

    if (req.method !== 'GET' && req.method !== 'POST') return textResp(405, 'Method Not Allowed');

    const body = await readBody(req);
    const payload = { ...query, ...body };
    const secret = firstValue(
      req.headers.get('x-kalam-webhook-secret'),
      payload.secret,
      payload.webhook_secret,
      payload.token,
      payload.key,
    );
    if (!secret) return textResp(401, 'missing secret');

    const orgIdParam = firstValue(payload.org_id, payload.orgId, payload.org);
    const matchedSettings = await resolveOrgVoipSettings(supabaseUrl, serviceRoleKey, secret, orgIdParam || undefined);
    if (!matchedSettings?.org_id) return textResp(401, 'unauthorized');

    const providerKey = normalizeVoipProviderKey(firstValue(payload.provider, matchedSettings.provider));
    const normalized = normalizeProviderWebhookPayload(providerKey, payload);

    const sourceNumber = dialPhone(normalized.sourceNumber) || normalized.sourceNumber || null;
    const destinationNumber = dialPhone(normalized.destinationNumber) || normalized.destinationNumber || null;
    const counterparty = normalized.direction === 'incoming' ? sourceNumber : destinationNumber;

    const logRow: Record<string, any> = {
      org_id: matchedSettings.org_id,
      provider: providerKey,
      service_id: normalized.serviceId || firstValue(matchedSettings?.settings?.service_id) || null,
      call_id: normalized.callId || null,
      object_id: normalized.objectId || null,
      direction: normalized.direction,
      status: normalized.status,
      source_number: sourceNumber,
      destination_number: destinationNumber,
      extension: normalized.extension || null,
      target_extension: normalized.targetExtension || null,
      operator_code: normalized.operatorCode || null,
      trunk: normalized.trunk || null,
      started_at: normalized.startedAtRaw ? parseTehranProviderDateTimeToUtcIso(normalized.startedAtRaw) : new Date().toISOString(),
      ended_at: normalized.endedAtRaw ? parseTehranProviderDateTimeToUtcIso(normalized.endedAtRaw) : null,
      wait_seconds: normalized.waitSeconds,
      talk_seconds: normalized.talkSeconds,
      file_id: normalized.fileId || null,
      recording_url: normalized.recordingUrl || null,
      title: counterparty || sourceNumber || destinationNumber || 'تماس VoIP',
      metadata: {
        provider: providerKey,
        build: FUNCTION_BUILD,
        payload: scrubSecrets(payload),
      },
    };

    // Deduplicate by org_id + provider + call_id / object_id
    let existingId = '';
    for (const [col, val] of [['call_id', normalized.callId], ['object_id', normalized.objectId]] as const) {
      if (!val) continue;
      const checkUrl = new URL(`${trimTrailingSlash(supabaseUrl)}/rest/v1/voip_call_logs`);
      checkUrl.searchParams.set('org_id', `eq.${matchedSettings.org_id}`);
      checkUrl.searchParams.set('provider', `eq.${providerKey}`);
      checkUrl.searchParams.set(col, `eq.${val}`);
      checkUrl.searchParams.set('select', 'id');
      checkUrl.searchParams.set('limit', '1');
      const r = await fetch(checkUrl.toString(), { headers: serviceHeaders(serviceRoleKey) });
      if (r.ok) {
        const found = parseJsonSafe(await r.text());
        if (Array.isArray(found) && found[0]?.id) {
          existingId = String(found[0].id);
          break;
        }
      }
    }

    const writeUrl = existingId
      ? `${trimTrailingSlash(supabaseUrl)}/rest/v1/voip_call_logs?id=eq.${existingId}`
      : `${trimTrailingSlash(supabaseUrl)}/rest/v1/voip_call_logs`;
    const cleanRow = existingId
      ? Object.fromEntries(Object.entries(logRow).filter(([, v]) => v !== null && v !== undefined && v !== ''))
      : logRow;
    const writeRes = await fetch(writeUrl, {
      method: existingId ? 'PATCH' : 'POST',
      headers: serviceHeaders(serviceRoleKey),
      body: JSON.stringify(cleanRow),
    });
    if (!writeRes.ok) {
      const errText = await writeRes.text();
      console.error('[voip-call-webhook] write failed', errText);
      return textResp(500, 'write error');
    }

    return textResp(200, 'ok');
  } catch (error: any) {
    console.error('[voip-call-webhook] error', String(error?.message || error));
    return textResp(500, 'error');
  }
});
