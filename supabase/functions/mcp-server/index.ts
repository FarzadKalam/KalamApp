// @ts-nocheck
// Remote MCP Server (Streamable HTTP + OAuth 2.0 PKCE + Personal User Tokens)
// Priority client compatibility:
// 1) ChatGPT / Codex (OpenAI)  2) Gemini (Google)  3) Claude (Anthropic)

import { loadOrgPlanAccess } from '../_shared/org-plan-access.ts';
import {
  MCP_AUTH_CODE_TTL_SECONDS,
  MCP_REFRESH_TTL_SECONDS,
  MCP_TOKEN_TTL_SECONDS,
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
  detectMcpClientKind,
  generateRandomToken,
  isAllowedMcpRedirectUri,
  normalizeScopes,
  sha256Hex,
  verifyPkceS256,
  type McpScope,
} from '../_shared/mcp-oauth.ts';
import {
  handleMcpJsonRpcMessage,
  isMcpPlanFeatureEnabled,
  type McpAuthContext,
  type McpStorageAdapter,
} from '../_shared/mcp-runtime.ts';

const SUPABASE_URL = String(Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_KEY = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
const SUPABASE_ANON_KEY = String(Deno.env.get('SUPABASE_ANON_KEY') || '').trim();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept, mcp-session-id, mcp-protocol-version',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'mcp-session-id, www-authenticate',
};

const jsonResponse = (
  status: number,
  payload: unknown,
  extraHeaders: Record<string, string> = {},
) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });

const isUuid = (value: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());

const resolvePublicMcpBaseUrl = (req: Request): string => {
  const configured = String(Deno.env.get('MCP_PUBLIC_BASE_URL') || '').trim().replace(/\/+$/, '');
  if (configured) return configured;

  const forwardedHost = String(req.headers.get('x-forwarded-host') || '').split(',')[0].trim();
  const forwardedProto = String(req.headers.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  const reqHost = forwardedHost || String(req.headers.get('host') || '').trim();

  if (reqHost && !/^(kong|functions|supabase-edge-functions)(:\d+)?$/i.test(reqHost)) {
    const isLoopback = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(reqHost);
    const proto = isLoopback ? (forwardedProto || 'http') : 'https';
    return `${proto}://${reqHost}/functions/v1/mcp-server`;
  }

  const webhookBase = String(Deno.env.get('INSTAGRAM_WEBHOOK_PUBLIC_BASE_URL') || '').trim();
  if (webhookBase) {
    try {
      return `${new URL(webhookBase).origin}/functions/v1/mcp-server`;
    } catch { /* fallback below */ }
  }

  const publicSupabase = String(Deno.env.get('SUPABASE_PUBLIC_URL') || '').trim();
  if (publicSupabase) {
    try {
      return `${new URL(publicSupabase).origin}/functions/v1/mcp-server`;
    } catch { /* fallback below */ }
  }

  return `${new URL(req.url).origin}/functions/v1/mcp-server`;
};

const resolveConsentBaseUrl = (): string => {
  const explicit = String(Deno.env.get('MCP_CONSENT_BASE_URL') || Deno.env.get('PUBLIC_APP_URL') || '').trim().replace(/\/+$/, '');
  if (explicit) return explicit;
  const publicSite = String(Deno.env.get('PUBLIC_SITE_URL') || '').trim();
  if (publicSite) {
    try {
      const parsed = new URL(publicSite);
      if (parsed.hostname === 'tazesystem.ir' || parsed.hostname === 'www.tazesystem.ir') {
        return 'https://app.tazesystem.ir';
      }
      return parsed.origin;
    } catch { /* fallback */ }
  }
  return 'https://app.tazesystem.ir';
};

const getSubPath = (req: Request): string => {
  const pathname = new URL(req.url).pathname;
  const marker = '/mcp-server';
  const idx = pathname.indexOf(marker);
  const raw = idx >= 0 ? pathname.slice(idx + marker.length) : pathname;
  return raw.replace(/\/+$/, '') || '/';
};

const serviceHeaders = (extra: Record<string, string> = {}) => ({
  'Content-Type': 'application/json',
  apikey: SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  ...extra,
});

const buildRestUrl = (table: string, params: Record<string, string | number>) => {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(params || {})) {
    url.searchParams.set(k, String(v));
  }
  return url.toString();
};

const storage: McpStorageAdapter = {
  select: async (table, params) => {
    const res = await fetch(buildRestUrl(table, params), { headers: serviceHeaders() });
    if (!res.ok) throw new Error(`خطا در خواندن ${table}: ${await res.text()}`);
    return await res.json();
  },
  count: async (table, params) => {
    const res = await fetch(buildRestUrl(table, params), {
      method: 'HEAD',
      headers: serviceHeaders({ Prefer: 'count=exact' }),
    });
    if (!res.ok) throw new Error(`خطا در شمارش ${table}`);
    const range = res.headers.get('content-range') || '';
    const total = Number(range.split('/')[1]);
    return Number.isSafeInteger(total) ? total : 0;
  },
  insert: async (table, rows) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: serviceHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(rows),
    });
    if (!res.ok) throw new Error(`خطا در ثبت ${table}: ${await res.text()}`);
    return await res.json();
  },
  patch: async (table, params, payload) => {
    const res = await fetch(buildRestUrl(table, params), {
      method: 'PATCH',
      headers: serviceHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`خطا در ویرایش ${table}: ${await res.text()}`);
    return await res.json();
  },
  remove: async (table, params) => {
    const res = await fetch(buildRestUrl(table, params), {
      method: 'DELETE',
      headers: serviceHeaders({ Prefer: 'return=representation' }),
    });
    if (!res.ok) throw new Error(`خطا در حذف ${table}: ${await res.text()}`);
    return await res.json();
  },
  upsert: async (table, rows, onConflict) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    if (onConflict) url.searchParams.set('on_conflict', onConflict);
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: serviceHeaders({ Prefer: 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify(rows),
    });
    if (!res.ok) throw new Error(`خطا در ذخیره ${table}: ${await res.text()}`);
    return await res.json();
  },
};

const computeDescendantRoleIds = (rootRoleId: string, allRoles: any[]): string[] => {
  const result = new Set<string>([rootRoleId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const role of allRoles || []) {
      const id = String(role?.id || '').trim();
      const parentId = String(role?.parent_id || '').trim();
      if (id && parentId && result.has(parentId) && !result.has(id)) {
        result.add(id);
        changed = true;
      }
    }
  }
  return Array.from(result);
};

const loadMcpAuthContext = async (
  userId: string,
  orgId: string,
  scopes: McpScope[],
): Promise<McpAuthContext> => {
  if (!isUuid(userId) || !isUuid(orgId)) {
    throw new Error('هویت کاربر یا سازمان معتبر نیست.');
  }

  const [memberships, profiles, orgs, planContext, allRoles, modSettingsRows] = await Promise.all([
    storage.select('user_organization_memberships', {
      org_id: `eq.${orgId}`,
      user_id: `eq.${userId}`,
      is_active: 'eq.true',
      select: 'org_id,user_id,role_id,software_role,is_owner,is_active',
      limit: 1,
    }),
    storage.select('profiles', {
      id: `eq.${userId}`,
      select: 'id,full_name,email,is_active',
      limit: 1,
    }),
    storage.select('organizations', {
      id: `eq.${orgId}`,
      select: 'id,name,trade_name',
      limit: 1,
    }),
    loadOrgPlanAccess(SUPABASE_URL, SUPABASE_SERVICE_KEY, orgId),
    storage.select('org_roles', {
      org_id: `eq.${orgId}`,
      select: 'id,title,permissions,parent_id',
      limit: 1000,
    }),
    storage.select('integration_settings', {
      org_id: `eq.${orgId}`,
      connection_type: 'eq.module_settings',
      is_active: 'eq.true',
      select: 'settings',
      order: 'updated_at.desc',
      limit: 1,
    }).catch(() => []),
  ]);

  const membership = memberships[0];
  if (!membership || membership.is_active !== true) {
    throw new Error('عضویت فعال کاربر در این سازمان تأیید نشد.');
  }
  const profile = profiles[0];
  if (!profile || profile.is_active === false) {
    throw new Error('حساب کاربری غیرفعال است.');
  }
  if (!isMcpPlanFeatureEnabled(planContext, 'mcp_access')) {
    throw new Error('قابلیت اتصال MCP در پلن فعلی این سازمان فعال نیست.');
  }

  const roleId = String(membership.role_id || '').trim() || null;
  const role = roleId ? allRoles.find((r) => String(r?.id || '') === roleId) || null : null;
  const allowedRoleIds = roleId ? computeDescendantRoleIds(roleId, allRoles) : [];

  let allowedUserIds = [userId];
  if (allowedRoleIds.length > 0) {
    const memberRows = await storage.select('user_organization_memberships', {
      org_id: `eq.${orgId}`,
      role_id: `in.(${allowedRoleIds.join(',')})`,
      is_active: 'eq.true',
      select: 'user_id',
      limit: 2000,
    }).catch(() => []);
    allowedUserIds = Array.from(new Set([
      userId,
      ...memberRows.map((r: any) => String(r?.user_id || '').trim()).filter(isUuid),
    ]));
  }

  const org = orgs[0] || {};
  return {
    orgId,
    orgName: String(org.trade_name || org.name || 'سازمان'),
    userId,
    userName: String(profile.full_name || profile.email || 'کاربر'),
    userEmail: String(profile.email || ''),
    roleId,
    roleName: role?.title ? String(role.title) : null,
    softwareRole: membership.software_role ? String(membership.software_role) : null,
    isOwner: membership.is_owner === true,
    permissions: role?.permissions && typeof role.permissions === 'object' ? role.permissions : {},
    allowedRoleIds,
    allowedUserIds,
    planContext,
    scopes,
    isReadonlyOrg: planContext?.isReadonly === true,
    moduleSettings: modSettingsRows[0]?.settings?.modules || {},
  };
};

const verifyBearerMcpToken = async (rawToken: string): Promise<McpAuthContext | null> => {
  const token = String(rawToken || '').trim();
  if (!token) return null;
  const hash = await sha256Hex(token);
  const nowIso = new Date().toISOString();

  if (token.startsWith('tz_mcp_pat_')) {
    const rows = await storage.select('mcp_user_tokens', {
      token_hash: `eq.${hash}`,
      is_active: 'eq.true',
      revoked_at: 'is.null',
      select: 'id,org_id,user_id,scopes,expires_at',
      limit: 1,
    });
    const row = rows[0];
    if (!row) return null;
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return null;

    const scopes = normalizeScopes(row.scopes, ['mcp:read', 'mcp:write']);
    const auth = await loadMcpAuthContext(row.user_id, row.org_id, scopes);
    storage.patch('mcp_user_tokens', { id: `eq.${row.id}` }, { last_used_at: nowIso }).catch(() => {});
    return auth;
  }

  const oauthRows = await storage.select('mcp_oauth_tokens', {
    access_token_hash: `eq.${hash}`,
    revoked_at: 'is.null',
    select: 'id,org_id,user_id,scope,expires_at',
    limit: 1,
  });
  const oauthRow = oauthRows[0];
  if (!oauthRow) return null;
  if (oauthRow.expires_at && new Date(oauthRow.expires_at).getTime() <= Date.now()) return null;

  const scopes = normalizeScopes(oauthRow.scope, ['mcp:read', 'mcp:write']);
  const auth = await loadMcpAuthContext(oauthRow.user_id, oauthRow.org_id, scopes);
  storage.patch('mcp_oauth_tokens', { id: `eq.${oauthRow.id}` }, { last_used_at: nowIso }).catch(() => {});
  return auth;
};

const verifySupabaseUserJwt = async (jwt: string) => {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY,
      Authorization: `Bearer ${jwt}`,
    },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user?.id ? user : null;
};

const parseTokenBody = async (req: Request): Promise<Record<string, string>> => {
  const contentType = String(req.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(await req.text());
    return Object.fromEntries(params.entries());
  }
  const parsed = await req.json().catch(() => ({}));
  return parsed && typeof parsed === 'object' ? parsed : {};
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return jsonResponse(500, { error: 'server_misconfigured', message: 'متغیرهای سرور کامل نیست.' });
  }

  const subPath = getSubPath(req);
  const publicBaseUrl = resolvePublicMcpBaseUrl(req);

  // ── 1. OAuth 2.0 Discovery Metadata (RFC 9728 & RFC 8414) ───────────────────
  if (req.method === 'GET' && (subPath === '/.well-known/oauth-protected-resource' || subPath.startsWith('/.well-known/oauth-protected-resource/'))) {
    return jsonResponse(200, buildProtectedResourceMetadata(publicBaseUrl));
  }

  if (req.method === 'GET' && (subPath === '/.well-known/oauth-authorization-server' || subPath.startsWith('/.well-known/oauth-authorization-server/') || subPath === '/.well-known/openid-configuration' || subPath.startsWith('/.well-known/openid-configuration/'))) {
    return jsonResponse(200, buildAuthorizationServerMetadata(publicBaseUrl));
  }

  // ── 2. Dynamic Client Registration (RFC 7591) ───────────────────────────────
  if (req.method === 'POST' && subPath === '/oauth/register') {
    const body = await req.json().catch(() => ({}));
    const redirectUris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.map(String) : [];
    if (!redirectUris.length || redirectUris.length > 10 || !redirectUris.every((uri: string) => isAllowedMcpRedirectUri(uri, [resolveConsentBaseUrl()]))) {
      return jsonResponse(400, {
        error: 'invalid_redirect_uri',
        error_description: 'Redirect URI باید HTTPS معتبر برای سرویس‌های مجاز AI یا آدرس loopback محلی باشد.',
      });
    }

    const clientId = generateRandomToken('mcp_client_', 18);
    const clientName = String(body?.client_name || 'External AI MCP Client').trim().slice(0, 120);
    const authMethod = String(body?.token_endpoint_auth_method || 'none') === 'client_secret_post'
      ? 'client_secret_post'
      : 'none';
    const clientSecret = authMethod === 'client_secret_post' ? generateRandomToken('mcp_secret_', 24) : null;
    const clientSecretHash = clientSecret ? await sha256Hex(clientSecret) : null;
    const scope = normalizeScopes(body?.scope).join(' ');
    const clientKind = detectMcpClientKind(clientName, redirectUris);

    await storage.insert('mcp_oauth_clients', [{
      client_id: clientId,
      client_secret_hash: clientSecretHash,
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope,
      token_endpoint_auth_method: authMethod,
      client_kind: clientKind,
      metadata: { software_id: body?.software_id || null },
    }]);

    return jsonResponse(201, {
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: authMethod,
      scope,
    });
  }

  // ── 3. OAuth Authorization Redirect -> Frontend Consent Page ────────────────
  if (req.method === 'GET' && subPath === '/oauth/authorize') {
    const reqUrl = new URL(req.url);
    const clientId = reqUrl.searchParams.get('client_id') || '';
    const redirectUri = reqUrl.searchParams.get('redirect_uri') || '';
    const responseType = reqUrl.searchParams.get('response_type') || 'code';
    const codeChallenge = reqUrl.searchParams.get('code_challenge') || '';
    const codeChallengeMethod = reqUrl.searchParams.get('code_challenge_method') || 'S256';
    const state = reqUrl.searchParams.get('state') || '';
    const scope = normalizeScopes(reqUrl.searchParams.get('scope')).join(' ');

    if (!clientId || !redirectUri || responseType !== 'code' || !codeChallenge || codeChallengeMethod !== 'S256') {
      return jsonResponse(400, { error: 'invalid_request', error_description: 'پارامترهای OAuth (از جمله PKCE S256) ناقص یا نامعتبر هستند.' });
    }

    const clients = await storage.select('mcp_oauth_clients', {
      client_id: `eq.${clientId}`,
      select: 'client_id,client_name,redirect_uris,client_kind',
      limit: 1,
    });
    const client = clients[0];
    if (!client || !Array.isArray(client.redirect_uris) || !client.redirect_uris.includes(redirectUri)) {
      return jsonResponse(400, { error: 'invalid_client', error_description: 'کلاینت یا redirect_uri ثبت نشده است.' });
    }

    const consentUrl = new URL(`${resolveConsentBaseUrl()}/mcp/authorize`);
    consentUrl.searchParams.set('client_id', clientId);
    consentUrl.searchParams.set('client_name', String(client.client_name || 'AI Client'));
    consentUrl.searchParams.set('client_kind', String(client.client_kind || 'custom'));
    consentUrl.searchParams.set('redirect_uri', redirectUri);
    consentUrl.searchParams.set('code_challenge', codeChallenge);
    consentUrl.searchParams.set('code_challenge_method', 'S256');
    consentUrl.searchParams.set('scope', scope);
    if (state) consentUrl.searchParams.set('state', state);

    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: consentUrl.toString(), 'Cache-Control': 'no-store' },
    });
  }

  // ── 4. OAuth Consent Approval (called by authenticated Frontend) ────────────
  if (req.method === 'POST' && subPath === '/oauth/approve') {
    const bearer = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!bearer) return jsonResponse(401, { error: 'unauthorized', message: 'نشست کاربر ارسال نشده است.' });
    const user = await verifySupabaseUserJwt(bearer);
    if (!user?.id) return jsonResponse(401, { error: 'unauthorized', message: 'نشست کاربر معتبر نیست.' });

    const body = await req.json().catch(() => ({}));
    const orgId = String(body?.org_id || '').trim();
    const clientId = String(body?.client_id || '').trim();
    const redirectUri = String(body?.redirect_uri || '').trim();
    const codeChallenge = String(body?.code_challenge || '').trim();
    const state = String(body?.state || '').trim();
    const scopes = normalizeScopes(body?.scope);

    if (!isUuid(orgId) || !clientId || !redirectUri || !codeChallenge) {
      return jsonResponse(400, { error: 'invalid_request', message: 'اطلاعات تأیید دسترسی کامل نیست.' });
    }

    const clients = await storage.select('mcp_oauth_clients', {
      client_id: `eq.${clientId}`,
      select: 'client_id,redirect_uris',
      limit: 1,
    });
    const client = clients[0];
    if (!client || !Array.isArray(client.redirect_uris) || !client.redirect_uris.includes(redirectUri)) {
      return jsonResponse(400, { error: 'invalid_client', message: 'کلاینت OAuth معتبر نیست.' });
    }

    // Enforce active membership and mcp_access plan feature before issuing a code.
    try {
      await loadMcpAuthContext(user.id, orgId, scopes);
    } catch (err: any) {
      return jsonResponse(403, { error: 'access_denied', message: String(err?.message || 'دسترسی مجاز نیست.') });
    }

    const rawCode = generateRandomToken('tz_code_', 24);
    const codeHash = await sha256Hex(rawCode);
    const expiresAt = new Date(Date.now() + MCP_AUTH_CODE_TTL_SECONDS * 1000).toISOString();

    await storage.insert('mcp_oauth_codes', [{
      code_hash: codeHash,
      client_id: clientId,
      user_id: user.id,
      org_id: orgId,
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      expires_at: expiresAt,
    }]);

    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set('code', rawCode);
    if (state) callbackUrl.searchParams.set('state', state);

    return jsonResponse(200, { redirect_to: callbackUrl.toString() });
  }

  // ── 5. OAuth Token Exchange & Refresh ───────────────────────────────────────
  if (req.method === 'POST' && subPath === '/oauth/token') {
    const body = await parseTokenBody(req);
    const grantType = String(body.grant_type || '').trim();

    if (grantType === 'authorization_code') {
      const code = String(body.code || '').trim();
      const clientId = String(body.client_id || '').trim();
      const redirectUri = String(body.redirect_uri || '').trim();
      const codeVerifier = String(body.code_verifier || '').trim();
      if (!code || !clientId || !redirectUri || !codeVerifier) {
        return jsonResponse(400, { error: 'invalid_request', error_description: 'Missing authorization_code parameters.' });
      }

      const codeHash = await sha256Hex(code);
      const rows = await storage.select('mcp_oauth_codes', {
        code_hash: `eq.${codeHash}`,
        client_id: `eq.${clientId}`,
        used_at: 'is.null',
        select: '*',
        limit: 1,
      });
      const authCode = rows[0];
      if (!authCode || authCode.redirect_uri !== redirectUri || new Date(authCode.expires_at).getTime() <= Date.now()) {
        return jsonResponse(400, { error: 'invalid_grant', error_description: 'Authorization code is invalid or expired.' });
      }

      const pkceValid = await verifyPkceS256(codeVerifier, authCode.code_challenge);
      if (!pkceValid) {
        return jsonResponse(400, { error: 'invalid_grant', error_description: 'PKCE verification failed.' });
      }

      // Single-use claim
      const claimed = await storage.patch('mcp_oauth_codes', {
        id: `eq.${authCode.id}`,
        used_at: 'is.null',
      }, { used_at: new Date().toISOString() });
      if (!claimed.length) {
        return jsonResponse(400, { error: 'invalid_grant', error_description: 'Authorization code already used.' });
      }

      const scopes = normalizeScopes(authCode.scope);
      try {
        await loadMcpAuthContext(authCode.user_id, authCode.org_id, scopes);
      } catch (err: any) {
        return jsonResponse(403, { error: 'access_denied', error_description: String(err?.message || 'Access denied.') });
      }

      const accessToken = generateRandomToken('tz_mcp_', 32);
      const refreshToken = generateRandomToken('tz_mcpr_', 32);
      const [accessHash, refreshHash] = await Promise.all([sha256Hex(accessToken), sha256Hex(refreshToken)]);
      const clients = await storage.select('mcp_oauth_clients', { client_id: `eq.${clientId}`, select: 'client_name', limit: 1 });

      await storage.insert('mcp_oauth_tokens', [{
        client_id: clientId,
        user_id: authCode.user_id,
        org_id: authCode.org_id,
        access_token_hash: accessHash,
        refresh_token_hash: refreshHash,
        scope: scopes.join(' '),
        expires_at: new Date(Date.now() + MCP_TOKEN_TTL_SECONDS * 1000).toISOString(),
        refresh_expires_at: new Date(Date.now() + MCP_REFRESH_TTL_SECONDS * 1000).toISOString(),
        client_label: clients[0]?.client_name || 'External MCP Client',
      }]);

      return jsonResponse(200, {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: MCP_TOKEN_TTL_SECONDS,
        refresh_token: refreshToken,
        scope: scopes.join(' '),
      });
    }

    if (grantType === 'refresh_token') {
      const refreshToken = String(body.refresh_token || '').trim();
      if (!refreshToken) return jsonResponse(400, { error: 'invalid_request' });

      const refreshHash = await sha256Hex(refreshToken);
      const rows = await storage.select('mcp_oauth_tokens', {
        refresh_token_hash: `eq.${refreshHash}`,
        revoked_at: 'is.null',
        select: '*',
        limit: 1,
      });
      const existing = rows[0];
      if (!existing || (existing.refresh_expires_at && new Date(existing.refresh_expires_at).getTime() <= Date.now())) {
        return jsonResponse(400, { error: 'invalid_grant', error_description: 'Refresh token is invalid or expired.' });
      }

      const scopes = normalizeScopes(existing.scope);
      try {
        await loadMcpAuthContext(existing.user_id, existing.org_id, scopes);
      } catch (err: any) {
        return jsonResponse(403, { error: 'access_denied', error_description: String(err?.message || 'Access denied.') });
      }

      const nextAccessToken = generateRandomToken('tz_mcp_', 32);
      const nextRefreshToken = generateRandomToken('tz_mcpr_', 32);
      const [nextAccessHash, nextRefreshHash] = await Promise.all([sha256Hex(nextAccessToken), sha256Hex(nextRefreshToken)]);

      await storage.patch('mcp_oauth_tokens', { id: `eq.${existing.id}` }, {
        access_token_hash: nextAccessHash,
        refresh_token_hash: nextRefreshHash,
        expires_at: new Date(Date.now() + MCP_TOKEN_TTL_SECONDS * 1000).toISOString(),
        refresh_expires_at: new Date(Date.now() + MCP_REFRESH_TTL_SECONDS * 1000).toISOString(),
      });

      return jsonResponse(200, {
        access_token: nextAccessToken,
        token_type: 'Bearer',
        expires_in: MCP_TOKEN_TTL_SECONDS,
        refresh_token: nextRefreshToken,
        scope: scopes.join(' '),
      });
    }

    return jsonResponse(400, { error: 'unsupported_grant_type' });
  }

  if (req.method === 'POST' && subPath === '/oauth/revoke') {
    const body = await parseTokenBody(req);
    const token = String(body.token || '').trim();
    if (token) {
      const hash = await sha256Hex(token);
      const nowIso = new Date().toISOString();
      await storage.patch('mcp_oauth_tokens', { access_token_hash: `eq.${hash}` }, { revoked_at: nowIso }).catch(() => {});
      await storage.patch('mcp_oauth_tokens', { refresh_token_hash: `eq.${hash}` }, { revoked_at: nowIso }).catch(() => {});
    }
    return jsonResponse(200, { revoked: true });
  }

  // ── 6. MCP Streamable HTTP Endpoint ─────────────────────────────────────────
  const resourceMetadataUrl = `${publicBaseUrl}/.well-known/oauth-protected-resource`;
  const wwwAuthHeader = `Bearer resource_metadata="${resourceMetadataUrl}", scope="mcp:read mcp:write"`;

  const authHeader = String(req.headers.get('authorization') || '');
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!bearerToken) {
    return jsonResponse(
      401,
      { error: 'unauthorized', message: 'احراز هویت برای اتصال به MCP الزامی است.' },
      { 'WWW-Authenticate': wwwAuthHeader },
    );
  }

  let authContext: McpAuthContext | null = null;
  try {
    authContext = await verifyBearerMcpToken(bearerToken);
  } catch (err: any) {
    return jsonResponse(403, {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32003, message: String(err?.message || 'دسترسی غیرمجاز است.') },
    });
  }

  if (!authContext) {
    return jsonResponse(
      401,
      { error: 'invalid_token', message: 'توکن نامعتبر یا منقضی شده است.' },
      { 'WWW-Authenticate': wwwAuthHeader },
    );
  }

  if (req.method === 'DELETE') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === 'GET') {
    // Stateless Streamable HTTP server: return 405 for GET SSE stream probe per MCP spec.
    return new Response(JSON.stringify({ error: 'sse_not_offered', message: 'از POST برای Streamable HTTP استفاده کنید.' }), {
      status: 405,
      headers: { ...corsHeaders, Allow: 'POST, DELETE, OPTIONS', 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' }, { Allow: 'POST, DELETE, OPTIONS' });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }

  const sessionId = String(req.headers.get('mcp-session-id') || '').trim() || crypto.randomUUID();

  if (Array.isArray(payload)) {
    const responses = [];
    for (const item of payload) {
      const result = await handleMcpJsonRpcMessage(item, authContext, storage);
      if (result !== null) responses.push(result);
    }
    if (responses.length === 0) {
      return new Response(null, { status: 202, headers: { ...corsHeaders, 'mcp-session-id': sessionId } });
    }
    return jsonResponse(200, responses, { 'mcp-session-id': sessionId });
  }

  const response = await handleMcpJsonRpcMessage(payload, authContext, storage);
  if (response === null) {
    return new Response(null, { status: 202, headers: { ...corsHeaders, 'mcp-session-id': sessionId } });
  }
  return jsonResponse(200, response, { 'mcp-session-id': sessionId });
});
