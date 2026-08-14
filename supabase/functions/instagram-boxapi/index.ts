// @ts-nocheck
// اتصال رسمی Instagram از طریق adapterهای سرویس‌دهنده. کلیدهای هر اتصال فقط به صورت رمزنگاری‌شده
// ذخیره و فقط در همین Edge Function رمزگشایی می‌شوند.

import { getInstagramProvider, listInstagramProviders } from './providerRegistry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

const json = (status: number, payload: Record<string, any>) => new Response(JSON.stringify(payload), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
const text = (value: unknown) => String(value ?? '').trim();
const now = () => new Date().toISOString();
const parse = (raw: string) => { try { return raw ? JSON.parse(raw) : {}; } catch { return {}; } };
// BoxAPI برای پاسخ اکشن‌های asynchronous، نام رویداد را به‌شکل action.list_posts می‌فرستد؛
// برای سازگاری با رویدادهای مستند messaging و comment، فقط پیشوند action را نرمال می‌کنیم.
const normalizedWebhookEventType = (value: unknown) => text(value).toLowerCase().replace(/^action[._:-]+/, '');
const webhookPayloadSummary = (payload: any) => {
  const data = payload?.data;
  const dataObject = data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  return {
    data_kind: Array.isArray(data) ? 'array' : dataObject ? 'object' : typeof data,
    data_keys: dataObject ? Object.keys(dataObject).slice(0, 12) : [],
    array_counts: {
      root: Array.isArray(data) ? data.length : 0,
      posts: Array.isArray(dataObject?.posts) ? dataObject.posts.length : 0,
      items: Array.isArray(dataObject?.items) ? dataObject.items.length : 0,
      nested_data: Array.isArray(dataObject?.data) ? dataObject.data.length : 0,
      messaging: Array.isArray(dataObject?.messaging) ? dataObject.messaging.length : 0,
    },
    has_account_reference: Boolean(text(payload?.account_id) || text(dataObject?.account_id) || text(dataObject?.account?.id) || text(dataObject?.instagram_user_id) || text(dataObject?.id)),
  };
};
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (value: string) => {
  const raw = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(raw + '='.repeat((4 - raw.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const encryptionKey = async () => {
  const secret = text(Deno.env.get('INSTAGRAM_SECRET_ENCRYPTION_KEY'));
  if (!secret) throw new Error('کلید رمزنگاری اتصال اینستاگرام در تنظیمات سرور ثبت نشده است.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};
const encryptSecret = async (plain: string) => {
  if (!text(plain)) return '';
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(), new TextEncoder().encode(plain)));
  return `v1:${b64(iv)}:${b64(cipher)}`;
};
const decryptSecret = async (encrypted: string) => {
  const [version, iv, cipher] = text(encrypted).split(':');
  if (version !== 'v1' || !iv || !cipher) throw new Error('کلید اتصال ذخیره‌شده معتبر نیست.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await encryptionKey(), unb64(cipher));
  return new TextDecoder().decode(plain);
};

const serviceHeaders = (key: string, extra: Record<string, string> = {}) => ({
  apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...extra,
});
const rest = async (url: string, key: string, path: string, options: RequestInit = {}) => {
  const response = await fetch(`${url}/rest/v1/${path}`, { ...options, headers: serviceHeaders(key, options.headers as Record<string, string>) });
  const raw = await response.text();
  const data = parse(raw);
  if (!response.ok) throw new Error(text(data?.message || data?.hint || raw) || `خطای ${response.status}`);
  return data;
};
const userRest = async (url: string, context: any, path: string, options: RequestInit = {}) => {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: text(Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')),
      Authorization: `Bearer ${context.accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const raw = await response.text();
  const data = parse(raw);
  if (!response.ok) throw new Error(text(data?.message || data?.hint || raw) || `خطای ${response.status}`);
  return data;
};
const getAuthContext = async (req: Request, url: string, serviceKey: string) => {
  const token = text(req.headers.get('authorization')).replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('ورود کاربر لازم است.');
  if (token === serviceKey) return { userId: '', orgId: '', permissions: { __saas_admin: { view: true, edit: true } }, accessToken: token, isService: true };
  const authResponse = await fetch(`${url}/auth/v1/user`, { headers: { apikey: serviceKey, Authorization: `Bearer ${token}` } });
  if (!authResponse.ok) throw new Error('نشست کاربر معتبر نیست.');
  const user = await authResponse.json();
  const profiles = await rest(url, serviceKey, `profiles?id=eq.${encodeURIComponent(user.id)}&select=id,org_id,role_id`);
  const profile = profiles?.[0];
  if (!profile?.org_id) throw new Error('سازمان فعال کاربر پیدا نشد.');
  const roles = profile.role_id ? await rest(url, serviceKey, `org_roles?id=eq.${encodeURIComponent(profile.role_id)}&org_id=eq.${encodeURIComponent(profile.org_id)}&select=permissions`) : [];
  const permissions = roles?.[0]?.permissions || {};
  return { userId: text(user.id), orgId: text(profile.org_id), permissions, accessToken: token, isService: false };
};
const requireConnectionManagement = (context: any) => {
  const saasAdmin = context.permissions?.__saas_admin || {};
  if (saasAdmin.view === true || saasAdmin.edit === true) return;
  const settings = context.permissions?.__settings_tabs || {};
  if (settings.view === false || settings.edit === false || settings.fields?.connections === false) throw new Error('اجازه مدیریت اتصالات را ندارید.');
};
const requireShowcaseManagement = (context: any) => {
  const saasAdmin = context.permissions?.__saas_admin || {};
  if (saasAdmin.view === true || saasAdmin.edit === true) return;
  const instagram = context.permissions?.instagram_conversations || {};
  if (instagram.view === true && instagram.fields?.manage_showcases === true) return;
  requireConnectionManagement(context);
};
const requireInstagramInboxView = (context: any) => {
  const saasAdmin = context.permissions?.__saas_admin || {};
  const instagram = context.permissions?.instagram_conversations || {};
  if (saasAdmin.view === true || saasAdmin.edit === true || instagram.view === true || instagram.edit === true) return;
  requireConnectionManagement(context);
};
const providerRequest = async (provider: any, operationKey: 'sync_accounts' | 'list_posts' | 'send_message' | 'reply_comment' | 'get_connect_url', body?: Record<string, any>) => {
  const adapter = getInstagramProvider(text(provider?.provider_key));
  if (!adapter) throw new Error('سرویس‌دهندهٔ این اتصال در سامانه پشتیبانی نمی‌شود.');
  const operation = adapter.operations[operationKey];
  const apiKey = await decryptSecret(text(provider.api_key_encrypted));
  const baseUrl = text(provider?.settings?.base_url || adapter.defaultBaseUrl).replace(/\/+$/, '');
  if (adapter.apiBaseUrlRequired && !baseUrl) throw new Error(`آدرس پایهٔ API ${adapter.label} را در تنظیمات اتصال وارد کنید.`);
  const response = await fetch(`${baseUrl}${operation.path}`, {
    method: operation.method,
    headers: { 'Content-Type': 'application/json', [adapter.apiKeyHeader]: apiKey },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const raw = await response.text();
  const data = parse(raw);
  if (!response.ok || data?.success === false) {
    if (/^\s*<!doctype html|<title>\s*page not found/i.test(raw)) throw new Error(`آدرس پایهٔ API ${adapter.label} معتبر نیست؛ سرویس به‌جای پاسخ API، صفحهٔ وب برگرداند.`);
    throw new Error(text(data?.message || raw) || `خطای ${adapter.label}: ${response.status}`);
  }
  return data;
};
const publicBase = (req: Request) => {
  const configuredBase = text(Deno.env.get('INSTAGRAM_WEBHOOK_PUBLIC_BASE_URL') || Deno.env.get('PUBLIC_API_BASE_URL'));
  if (configuredBase) return configuredBase.replace(/\/+$/, '');
  // در محیط self-hosted، req.url معمولاً آدرس داخلی functions:9000 است.
  // gateway دامنهٔ واقعی را در headerهای استاندارد proxy نگه می‌دارد.
  const forwardedHost = text(req.headers.get('x-forwarded-host')).split(',')[0]?.trim();
  const requestHost = text(req.headers.get('host'));
  const publicHost = forwardedHost || requestHost;
  const isInternalHost = /^(functions|localhost|127\.0\.0\.1)(:\d+)?$/i.test(publicHost);
  if (publicHost && !isInternalHost) {
    const forwardedProtocol = text(req.headers.get('x-forwarded-proto')).split(',')[0]?.trim();
    const protocol = forwardedProtocol === 'http' || forwardedProtocol === 'https' ? forwardedProtocol : new URL(req.url).protocol.replace(/:$/, '');
    return `${protocol}://${publicHost}`.replace(/\/+$/, '');
  }
  return new URL(req.url).origin.replace(/\/+$/, '');
};
const providerSummary = (row: any, request: Request) => ({
  id: row.id,
  name: row.name,
  providerKey: row.provider_key,
  providerLabel: getInstagramProvider(text(row.provider_key))?.label || text(row.provider_key),
  isActive: row.is_active === true,
  hasApiKey: Boolean(text(row.api_key_encrypted)),
  webhookUrl: `${publicBase(request)}/functions/v1/instagram-boxapi?provider=${encodeURIComponent(row.id)}&secret=${encodeURIComponent(row.webhook_secret)}`,
  redirectUrl: text(row?.settings?.redirect_url || ''),
  domain: text(row?.settings?.domain || ''),
  apiBaseUrl: text(row?.settings?.base_url || '') === 'https://boxapi.ir' ? '' : text(row?.settings?.base_url || ''),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const listProviders = async (request: Request, url: string, serviceKey: string, context: any) => {
  const providers = await rest(url, serviceKey, `instagram_providers?org_id=eq.${encodeURIComponent(context.orgId)}&select=*&order=created_at.asc`);
  const accounts = await rest(url, serviceKey, `instagram_accounts?org_id=eq.${encodeURIComponent(context.orgId)}&select=*&order=username.asc`);
  // وضعیت رویداد، برخلاف payload، فاقد اطلاعات مخاطب است و برای تشخیص سریع سلامت اتصال نمایش داده می‌شود.
  const events = await rest(url, serviceKey, `instagram_webhook_events?org_id=eq.${encodeURIComponent(context.orgId)}&select=provider_id,event_type,processing_status,error_message,received_at,processed_at&order=received_at.desc&limit=100`);
  return json(200, {
    success: true,
    supportedProviders: listInstagramProviders(),
    providers: providers.map((row: any) => ({
      ...providerSummary(row, request),
      accounts: accounts.filter((account: any) => account.provider_id === row.id),
      lastWebhook: events.find((event: any) => event.provider_id === row.id) || null,
    })),
  });
};

const webhookDiagnostics = async (url: string, serviceKey: string, context: any, providerId: string) => {
  requireConnectionManagement(context);
  if (!providerId) throw new Error('اتصال سرویس‌دهنده را انتخاب کنید.');
  const provider = (await rest(url, serviceKey, `instagram_providers?id=eq.${encodeURIComponent(providerId)}&org_id=eq.${encodeURIComponent(context.orgId)}&select=id`))?.[0];
  if (!provider) throw new Error('اتصال سرویس‌دهنده پیدا نشد.');
  // بدنهٔ وب‌هوک ممکن است اطلاعات مخاطب داشته باشد؛ فقط وضعیت‌های قابل‌نمایش به مدیر اتصال برگردانده می‌شوند.
  const events = await rest(url, serviceKey, `instagram_webhook_events?org_id=eq.${encodeURIComponent(context.orgId)}&provider_id=eq.${encodeURIComponent(providerId)}&select=event_type,processing_status,error_message,received_at,processed_at,payload&order=received_at.desc&limit=10`);
  return json(200, { success: true, events: (Array.isArray(events) ? events : []).map(({ payload, ...event }: any) => ({ ...event, payload_summary: webhookPayloadSummary(payload) })) });
};

const syncAccounts = async (provider: any, url: string, serviceKey: string, orgId: string) => {
  const result = await providerRequest(provider, 'sync_accounts');
  const accounts = Array.isArray(result?.data) ? result.data : [];
  for (const account of accounts) {
    const providerAccountId = text(account?.id);
    if (!providerAccountId) continue;
    await rest(url, serviceKey, 'instagram_accounts?on_conflict=provider_id,provider_account_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        org_id: orgId, provider_id: provider.id, provider_account_id: providerAccountId,
        instagram_user_id: text(account?.instagram_user_id) || null, username: text(account?.username) || 'بدون نام کاربری',
        display_name: text(account?.name) || null, profile_photo_url: text(account?.profile_photo) || null,
        is_active: account?.is_active !== false, expires_at: account?.expires_at || null, last_synced_at: now(), updated_at: now(),
      }),
    });
  }
  return accounts.length;
};

const documentedPostFields = ['id', 'media_type', 'media_url', 'permalink', 'caption', 'timestamp'];
const syncPosts = async (provider: any, account: any, fields: string[] = []) => providerRequest(provider, 'list_posts', {
    account_id: account.provider_account_id,
    // فقط فیلدهای صریحاً نمونه‌گذاری‌شده در مستند رسمی BoxAPI به سرویس‌دهنده ارسال می‌شوند.
    fields: fields.filter((field) => documentedPostFields.includes(field)).length ? fields.filter((field) => documentedPostFields.includes(field)) : documentedPostFields,
    limit: 50,
});

const webhookAccountKeys = (envelope: any) => [...new Set([
  envelope?.account_id,
  envelope?.data?.account_id,
  envelope?.data?.account?.id,
  envelope?.data?.instagram_user_id,
  envelope?.data?.id,
].map(text).filter(Boolean))];
const resolveWebhookAccount = async (provider: any, envelope: any, url: string, serviceKey: string) => {
  const accountKeys = webhookAccountKeys(envelope);
  if (!accountKeys.length) return null;
  // مستند رسمی account_id را شناسهٔ داخلی BoxAPI معرفی می‌کند؛ شناسهٔ رسمی اینستاگرام نیز
  // برای سازگاری با callbackهای عملیاتیِ سرویس‌دهنده پذیرفته می‌شود.
  const accounts = await rest(url, serviceKey, `instagram_accounts?provider_id=eq.${encodeURIComponent(provider.id)}&select=id,provider_id,provider_account_id,instagram_user_id,username`);
  return accounts.find((account: any) => accountKeys.includes(text(account.provider_account_id)) || accountKeys.includes(text(account.instagram_user_id))) || null;
};
const firstArray = (...candidates: any[]) => candidates.find((candidate) => Array.isArray(candidate)) || [];

const resolveShowcaseItems = async (showcase: any, url: string, serviceKey: string, orgId: string) => {
  if (text(showcase?.source_kind) === 'manual') {
    const rows = await rest(url, serviceKey, `instagram_product_showcase_items?showcase_id=eq.${encodeURIComponent(showcase.id)}&org_id=eq.${encodeURIComponent(orgId)}&select=id,snapshot&order=sort_order.asc&limit=10`);
    return rows.map((item: any) => ({ id: item.id, ...(item.snapshot || {}) }));
  }
  if (text(showcase?.source_kind) === 'online_catalog' && text(showcase?.source_id)) {
    const catalog = (await rest(url, serviceKey, `online_catalogs?id=eq.${encodeURIComponent(showcase.source_id)}&org_id=eq.${encodeURIComponent(orgId)}&select=public_token`))?.[0];
    if (!catalog?.public_token) return [];
    const response = await rest(url, serviceKey, 'rpc/get_public_online_catalog', { method: 'POST', body: JSON.stringify({ p_token: catalog.public_token }) });
    return Array.isArray(response?.items) ? response.items.map((item: any, index: number) => ({ id: `catalog_${index}`, title: text(item?.title), image_url: text(item?.image_url) || null, description: text(item?.fields?.description) || null, price: item?.fields?.price ?? item?.fields?.sell_price ?? null, unit_name: text(item?.fields?.unit_name) || null })) : [];
  }
  if (text(showcase?.source_kind) === 'price_list' && text(showcase?.source_id)) {
    const priceList = (await rest(url, serviceKey, `price_lists?id=eq.${encodeURIComponent(showcase.source_id)}&org_id=eq.${encodeURIComponent(orgId)}&select=items`))?.[0];
    return (Array.isArray(priceList?.items) ? priceList.items : []).slice(0, 10).map((item: any, index: number) => ({ id: `price_${index}`, title: text(item?.product_name || item?.name) || 'محصول', price: item?.price ?? item?.sell_price ?? null, unit_name: text(item?.unit_name) || null }));
  }
  return [];
};

const processListPostsWebhook = async (provider: any, envelope: any, url: string, serviceKey: string) => {
  if (text(envelope?.event_type) !== 'list_posts') return;
  const account = await resolveWebhookAccount(provider, envelope, url, serviceKey);
  if (!account) return;
  const payload = envelope?.data || {};
  // پاسخ list_posts asynchronous در نسخه‌های مختلف سرویس ممکن است مستقیماً آرایه یا در data/result/response قرار گیرد.
  const posts = firstArray(payload, payload?.posts, payload?.data, payload?.items, payload?.result, payload?.result?.posts, payload?.result?.data, payload?.response, payload?.response?.posts, payload?.response?.data, payload?.data?.posts, payload?.data?.data);
  for (const post of posts) {
    const providerMediaId = text(post?.id || post?.media_id);
    if (!providerMediaId) continue;
    await rest(url, serviceKey, 'instagram_social_media?on_conflict=provider_id,provider_media_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ org_id: provider.org_id, provider_id: provider.id, account_id: account.id, provider_media_id: providerMediaId, media_type: ['story', 'reel'].includes(text(post?.media_type).toLowerCase()) ? text(post.media_type).toLowerCase() : 'post', caption: text(post?.caption) || null, media_url: text(post?.media_url) || null, thumbnail_url: text(post?.thumbnail_url) || null, permalink: text(post?.permalink) || null, metrics: { like_count: Number(post?.like_count || post?.likes || 0), comments_count: Number(post?.comments_count || post?.comment_count || 0) }, provider_payload: post, published_at: post?.timestamp || post?.published_at || null, last_synced_at: now(), updated_at: now() }),
    });
  }
};

const processCommentWebhook = async (provider: any, envelope: any, url: string, serviceKey: string) => {
  const eventType = text(envelope?.event_type);
  if (!['comment', 'comments', 'comment_created'].includes(eventType)) return;
  const account = await resolveWebhookAccount(provider, envelope, url, serviceKey);
  if (!account) return;
  const payload = envelope?.data || {};
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.comments) ? payload.comments : [payload];
  for (const row of rows) {
    const providerCommentId = text(row?.id || row?.comment_id);
    const providerMediaId = text(row?.media_id || row?.post_id);
    if (!providerCommentId || !providerMediaId) continue;
    let media = (await rest(url, serviceKey, `instagram_social_media?provider_id=eq.${encodeURIComponent(provider.id)}&provider_media_id=eq.${encodeURIComponent(providerMediaId)}&select=id,media_type,caption,permalink`))?.[0];
    if (!media) {
      const fallbackMediaRows = await rest(url, serviceKey, 'instagram_social_media?on_conflict=provider_id,provider_media_id', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ org_id: provider.org_id, provider_id: provider.id, account_id: account.id, provider_media_id: providerMediaId, media_type: ['story', 'reel'].includes(text(row?.media_type).toLowerCase()) ? text(row.media_type).toLowerCase() : 'post', caption: text(row?.caption) || null, permalink: text(row?.permalink) || null, provider_payload: { source: 'comment_webhook', raw: row }, last_synced_at: now(), updated_at: now() }),
      });
      media = fallbackMediaRows?.[0];
    }
    if (!media?.id) continue;
    const commentRows = await rest(url, serviceKey, 'instagram_comments?on_conflict=provider_id,provider_comment_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ org_id: provider.org_id, provider_id: provider.id, account_id: account.id, media_id: media.id, provider_comment_id: providerCommentId, author_scoped_id: text(row?.from?.id || row?.sender?.id) || null, author_username: text(row?.from?.username || row?.username) || null, author_name: text(row?.from?.name || row?.name) || null, author_profile_photo_url: text(row?.from?.profile_photo || row?.profile_photo) || null, content_text: text(row?.text || row?.message || row?.content), like_count: Number(row?.like_count || 0), provider_payload: row, commented_at: row?.timestamp || row?.created_at || now(), updated_at: now() }),
    });
    const comment = commentRows?.[0];
    if (comment?.id) await rest(url, serviceKey, 'instagram_interaction_events', { method: 'POST', body: JSON.stringify({ org_id: provider.org_id, provider_id: provider.id, account_id: account.id, account_username: account.username || null, comment_id: comment.id, event_type: 'comment_received', message_text: text(row?.text || row?.message || row?.content) || null, media_type: media.media_type || null, media_caption: media.caption || null, media_permalink: media.permalink || null, tags: comment.tags || [], payload: row, occurred_at: row?.timestamp || row?.created_at || now() }) });
  }
};

const processMessagingWebhook = async (provider: any, envelope: any, url: string, serviceKey: string) => {
  if (text(envelope?.event_type) !== 'messaging') return;
  const account = await resolveWebhookAccount(provider, envelope, url, serviceKey);
  if (!account) return;
  const data = envelope?.data || {};
  const entries = firstArray(data?.messaging, data?.data?.messaging, data?.result?.messaging, data?.result?.data?.messaging);
  for (const entry of entries) {
    const senderId = text(entry?.sender?.id);
    const recipientId = text(entry?.recipient?.id);
    const isInbound = Boolean(senderId && senderId !== text(account.instagram_user_id));
    const contactScopedId = isInbound ? senderId : recipientId;
    if (!contactScopedId) continue;
    const contactRows = await rest(url, serviceKey, 'instagram_contacts?on_conflict=account_id,instagram_scoped_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ org_id: provider.org_id, account_id: account.id, instagram_scoped_id: contactScopedId, updated_at: now() }),
    });
    const contact = contactRows?.[0];
    if (!contact?.id) continue;
    const conversationRows = await rest(url, serviceKey, 'instagram_conversations?on_conflict=provider_id,account_id,provider_thread_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ org_id: provider.org_id, provider_id: provider.id, account_id: account.id, contact_id: contact.id, provider_thread_id: contactScopedId, last_message_at: new Date(Number(entry?.timestamp || Date.now())).toISOString(), last_inbound_at: isInbound ? new Date(Number(entry?.timestamp || Date.now())).toISOString() : null, updated_at: now() }),
    });
    const conversation = conversationRows?.[0];
    if (!conversation?.id) continue;
    const message = entry?.message || {};
    const postback = entry?.postback || {};
    const providerMessageId = text(message?.mid || entry?.id);
    const content = text(message?.text || postback?.title || postback?.payload);
    await rest(url, serviceKey, 'instagram_messages?on_conflict=conversation_id,provider_message_id', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ org_id: provider.org_id, conversation_id: conversation.id, provider_message_id: providerMessageId || `webhook:${crypto.randomUUID()}`, direction: isInbound ? 'inbound' : 'outbound', message_type: 'text', content_text: content || null, delivery_status: isInbound ? 'received' : 'sent', provider_payload: entry }),
    });
    await rest(url, serviceKey, `instagram_conversations?id=eq.${encodeURIComponent(conversation.id)}&org_id=eq.${encodeURIComponent(provider.org_id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ last_message_preview: content || 'پیام جدید', last_message_at: new Date(Number(entry?.timestamp || Date.now())).toISOString(), ...(isInbound ? { last_inbound_at: new Date(Number(entry?.timestamp || Date.now())).toISOString() } : {}), updated_at: now() }),
    });
    if (isInbound) await rest(url, serviceKey, 'instagram_interaction_events', { method: 'POST', body: JSON.stringify({ org_id: provider.org_id, provider_id: provider.id, account_id: account.id, account_username: account.username || null, conversation_id: conversation.id, event_type: 'direct_received', message_text: content || null, tags: conversation.tags || [], payload: entry, occurred_at: new Date(Number(entry?.timestamp || Date.now())).toISOString() }) });
    const postbackPayload = text(postback?.payload);
    if (postbackPayload) {
      let decoded: any = {};
      try { decoded = JSON.parse(postbackPayload); } catch { decoded = { key: postbackPayload }; }
      await rest(url, serviceKey, 'instagram_interaction_events', {
        method: 'POST',
        body: JSON.stringify({
          org_id: provider.org_id,
          provider_id: provider.id,
          account_id: account.id,
          account_username: account.username || null,
          conversation_id: conversation.id,
          showcase_id: text(decoded?.showcase_id) || null,
          showcase_item_id: text(decoded?.showcase_item_id) || null,
          event_type: 'showcase_button_clicked',
          button_key: text(decoded?.button_key || decoded?.key || postbackPayload),
          message_text: content || null,
          tags: conversation.tags || [],
          payload: { postback: postbackPayload, entry, decoded },
          occurred_at: new Date(Number(entry?.timestamp || Date.now())).toISOString(),
        }),
      });
    }
  }
};

const handleWebhook = async (req: Request, url: string, serviceKey: string) => {
  const requestUrl = new URL(req.url);
  const providerId = text(requestUrl.searchParams.get('provider'));
  const secret = text(requestUrl.searchParams.get('secret'));
  if (!providerId || !secret) return json(404, { success: false });
  const rows = await rest(url, serviceKey, `instagram_providers?id=eq.${encodeURIComponent(providerId)}&select=*`);
  const provider = rows?.[0];
  if (!provider || secret !== text(provider.webhook_secret) || provider.is_active !== true) return json(404, { success: false });
  if (req.method === 'GET') return json(200, { success: true });
  const body = parse(await req.text());
  const envelope = Array.isArray(body) ? body[0]?.body || body[0] : body?.body || body;
  const eventId = text(envelope?.event_id || envelope?.id || crypto.randomUUID());
  const eventType = text(envelope?.event_type || envelope?.field || 'unknown');
  const normalizedEventType = normalizedWebhookEventType(eventType);
  const processingEnvelope = normalizedEventType === eventType ? envelope : { ...envelope, event_type: normalizedEventType };
  const eventPath = `instagram_webhook_events?org_id=eq.${encodeURIComponent(provider.org_id)}&provider_id=eq.${encodeURIComponent(provider.id)}&provider_event_id=eq.${encodeURIComponent(eventId)}`;
  try {
    await rest(url, serviceKey, 'instagram_webhook_events?on_conflict=provider_id,provider_event_id', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ org_id: provider.org_id, provider_id: provider.id, provider_event_id: eventId, event_type: eventType, payload: envelope }),
    });
    await processMessagingWebhook(provider, processingEnvelope, url, serviceKey);
    await processListPostsWebhook(provider, processingEnvelope, url, serviceKey);
    await processCommentWebhook(provider, processingEnvelope, url, serviceKey);
    await rest(url, serviceKey, eventPath, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ processing_status: ['messaging', 'list_posts', 'comment', 'comments', 'comment_created'].includes(normalizedEventType) ? 'processed' : 'ignored', processed_at: now(), error_message: null }),
    });
  } catch (error) {
    const errorMessage = text(error).slice(0, 1000) || 'خطای نامشخص در پردازش وب‌هوک';
    console.error('instagram webhook event persistence failed', error);
    // خطای پردازش نباید باعث retry کور سرویس‌دهنده شود، اما باید برای مدیر اتصال قابل پیگیری بماند.
    try {
      await rest(url, serviceKey, eventPath, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ processing_status: 'failed', processed_at: now(), error_message: errorMessage }),
      });
    } catch (statusError) { console.error('instagram webhook failure status persistence failed', statusError); }
  }
  // دریافت وب‌هوک نباید با پردازش سنگین یا AI مسدود شود. پردازش کامل در runner جدا انجام می‌شود.
  return json(200, { success: true });
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = text(Deno.env.get('SUPABASE_URL'));
  const serviceKey = text(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  if (!url || !serviceKey) return json(500, { success: false, message: 'تنظیمات سرور کامل نیست.' });
  try {
    if (['GET', 'POST'].includes(req.method) && new URL(req.url).searchParams.has('provider')) return await handleWebhook(req, url, serviceKey);
    const body = parse(await req.text());
    const context = await getAuthContext(req, url, serviceKey);
    if (context.isService) {
      const workflowOrgId = text(body?.orgId);
      if (!workflowOrgId) throw new Error('سازمان اجرای سروری مشخص نیست.');
      context.orgId = workflowOrgId;
    }
    const action = text(body?.action || 'list');
    if (action === 'list') { requireConnectionManagement(context); return await listProviders(req, url, serviceKey, context); }
    if (action === 'save_provider') {
      requireConnectionManagement(context);
      const providerId = text(body?.providerId);
      const name = text(body?.name);
      const apiKey = text(body?.apiKey);
      if (!name) throw new Error('نام اتصال را وارد کنید.');
      const existing = providerId ? (await rest(url, serviceKey, `instagram_providers?id=eq.${encodeURIComponent(providerId)}&org_id=eq.${encodeURIComponent(context.orgId)}&select=*`))?.[0] : null;
      if (providerId && !existing) throw new Error('اتصال موردنظر پیدا نشد.');
      const providerKey = text(body?.providerKey || existing?.provider_key);
      const adapter = getInstagramProvider(providerKey);
      if (!adapter) throw new Error('سرویس‌دهندهٔ انتخاب‌شده پشتیبانی نمی‌شود.');
      const requestedBaseUrl = text(body?.baseUrl);
      const existingBaseUrl = text(existing?.settings?.base_url) === 'https://boxapi.ir' ? '' : text(existing?.settings?.base_url);
      const baseUrl = requestedBaseUrl || existingBaseUrl || adapter.defaultBaseUrl;
      if (body?.isActive === true && adapter.apiBaseUrlRequired && !baseUrl) throw new Error(`آدرس پایهٔ API ${adapter.label} را وارد کنید.`);
      const settings = { ...(existing?.settings || {}), base_url: baseUrl, domain: text(body?.domain || existing?.settings?.domain), redirect_url: text(body?.redirectUrl || existing?.settings?.redirect_url) };
      const payload = { org_id: context.orgId, provider_key: adapter.key, name, settings, is_active: body?.isActive === true && Boolean(text(existing?.api_key_encrypted) || apiKey), updated_at: now(), ...(existing ? {} : { created_by: context.userId }), ...(apiKey ? { api_key_encrypted: await encryptSecret(apiKey) } : {}) };
      const saved = await rest(url, serviceKey, providerId ? `instagram_providers?id=eq.${encodeURIComponent(providerId)}&org_id=eq.${encodeURIComponent(context.orgId)}` : 'instagram_providers', { method: providerId ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      return json(200, { success: true, provider: providerSummary((Array.isArray(saved) ? saved[0] : saved) || { ...existing, ...payload, id: providerId }, req) });
    }
    const providerId = text(body?.providerId);
    if (action === 'webhook_diagnostics') return await webhookDiagnostics(url, serviceKey, context, providerId);
    if (action === 'list_showcases') {
      const instagramPermission = context.permissions?.instagram_conversations || {};
      const saasAdmin = context.permissions?.__saas_admin || {};
      if (!(saasAdmin.view === true || saasAdmin.edit === true || instagramPermission.view === true)) throw new Error('اجازه مشاهده ویترین‌های اینستاگرام را ندارید.');
      const showcases = await rest(url, serviceKey, `instagram_product_showcases?org_id=eq.${encodeURIComponent(context.orgId)}&select=*&order=updated_at.desc`);
      const items = await rest(url, serviceKey, `instagram_product_showcase_items?org_id=eq.${encodeURIComponent(context.orgId)}&select=*&order=sort_order.asc,created_at.asc`);
      return json(200, { success: true, showcases: showcases.map((showcase: any) => ({ ...showcase, items: items.filter((item: any) => item.showcase_id === showcase.id) })) });
    }
    if (action === 'save_showcase') {
      requireShowcaseManagement(context);
      const showcaseId = text(body?.showcaseId);
      const name = text(body?.name);
      const sourceKind = ['manual', 'price_list', 'online_catalog'].includes(text(body?.sourceKind)) ? text(body?.sourceKind) : 'manual';
      const sourceId = text(body?.sourceId) || null;
      const accountId = text(body?.accountId) || null;
      if (!name) throw new Error('نام ویترین را وارد کنید.');
      if (accountId) {
        const account = (await rest(url, serviceKey, `instagram_accounts?id=eq.${encodeURIComponent(accountId)}&org_id=eq.${encodeURIComponent(context.orgId)}&select=id`))?.[0];
        if (!account) throw new Error('پیج انتخاب‌شده معتبر نیست.');
      }
      if (sourceId && sourceKind === 'online_catalog') {
        const catalog = (await rest(url, serviceKey, `online_catalogs?id=eq.${encodeURIComponent(sourceId)}&org_id=eq.${encodeURIComponent(context.orgId)}&select=id`))?.[0];
        if (!catalog) throw new Error('کاتالوگ آنلاین انتخاب‌شده معتبر نیست.');
      }
      if (sourceId && sourceKind === 'price_list') {
        const priceList = (await rest(url, serviceKey, `price_lists?id=eq.${encodeURIComponent(sourceId)}&org_id=eq.${encodeURIComponent(context.orgId)}&select=id`))?.[0];
        if (!priceList) throw new Error('لیست قیمت انتخاب‌شده معتبر نیست.');
      }
      const buttonTemplates = Array.isArray(body?.buttonTemplates) ? body.buttonTemplates
        .map((button: any, index: number) => ({ key: text(button?.key) || `button_${index + 1}`, title: text(button?.title).slice(0, 80), action_type: text(button?.action_type || 'open_url'), payload: button?.payload && typeof button.payload === 'object' ? button.payload : {} }))
        .filter((button: any) => button.title && ['open_url', 'send_message', 'trigger_workflow', 'field_value', 'request_human'].includes(button.action_type)).slice(0, 3) : [];
      const payload = { org_id: context.orgId, account_id: accountId, name, description: text(body?.description) || null, source_kind: sourceKind, source_id: sourceId, presentation: { layout: 'carousel', max_items: Math.min(10, Math.max(1, Number(body?.maxItems || 10))) }, button_templates: buttonTemplates, is_active: body?.isActive !== false, updated_at: now(), ...(showcaseId ? {} : { created_by: context.userId }) };
      const saved = await rest(url, serviceKey, showcaseId ? `instagram_product_showcases?id=eq.${encodeURIComponent(showcaseId)}&org_id=eq.${encodeURIComponent(context.orgId)}` : 'instagram_product_showcases', { method: showcaseId ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      const showcase = Array.isArray(saved) ? saved[0] : saved;
      if (!showcase?.id) throw new Error('ذخیره ویترین انجام نشد.');
      if (Array.isArray(body?.items)) {
        await rest(url, serviceKey, `instagram_product_showcase_items?showcase_id=eq.${encodeURIComponent(showcase.id)}&org_id=eq.${encodeURIComponent(context.orgId)}`, { method: 'DELETE' });
        const items = body.items.map((item: any, index: number) => ({ org_id: context.orgId, showcase_id: showcase.id, source_module_id: text(item?.source_module_id), source_record_id: text(item?.source_record_id), sort_order: index, title_override: text(item?.title_override) || null, image_override_url: text(item?.image_override_url) || null, field_bindings: item?.field_bindings && typeof item.field_bindings === 'object' ? item.field_bindings : {}, snapshot: item?.snapshot && typeof item.snapshot === 'object' ? item.snapshot : {} }))
          .filter((item: any) => ['products', 'billboards', 'product_bundles'].includes(item.source_module_id) && item.source_record_id);
        if (items.length) await rest(url, serviceKey, 'instagram_product_showcase_items', { method: 'POST', body: JSON.stringify(items) });
      }
      return json(200, { success: true, showcase });
    }
    if (action === 'delete_showcase') {
      requireShowcaseManagement(context);
      const showcaseId = text(body?.showcaseId);
      await rest(url, serviceKey, `instagram_product_showcases?id=eq.${encodeURIComponent(showcaseId)}&org_id=eq.${encodeURIComponent(context.orgId)}`, { method: 'DELETE' });
      return json(200, { success: true });
    }
    if (action === 'save_account_config') {
      requireConnectionManagement(context);
      const accountId = text(body?.accountId);
      const account = (await rest(url, serviceKey, `instagram_accounts?id=eq.${encodeURIComponent(accountId)}&org_id=eq.${encodeURIComponent(context.orgId)}&select=id,settings`))?.[0];
      if (!account) throw new Error('پیج اینستاگرام پیدا نشد.');
      const catalogId = text(body?.catalogId);
      if (catalogId) {
        const catalog = (await rest(url, serviceKey, `online_catalogs?id=eq.${encodeURIComponent(catalogId)}&org_id=eq.${encodeURIComponent(context.orgId)}&is_active=eq.true&select=id`))?.[0];
        if (!catalog) throw new Error('ویترین محصول انتخاب‌شده معتبر نیست.');
      }
      const buttons = Array.isArray(body?.buttons) ? body.buttons
        .map((button: any) => ({ title: text(button?.title).slice(0, 80), url: text(button?.url).slice(0, 2048) }))
        .filter((button: any) => button.title && button.url).slice(0, 3) : [];
      await rest(url, serviceKey, `instagram_accounts?id=eq.${encodeURIComponent(accountId)}&org_id=eq.${encodeURIComponent(context.orgId)}`, {
        method: 'PATCH', body: JSON.stringify({ settings: { ...(account.settings || {}), catalog_id: catalogId || null, default_buttons: buttons }, updated_at: now() }),
      });
      return json(200, { success: true });
    }
    if (action === 'send_message') {
      const conversationId = text(body?.conversationId);
      const replyPermission = context.permissions?.instagram_conversations || {};
      const saasAdmin = context.permissions?.__saas_admin || {};
      const isSaasAdmin = saasAdmin.view === true || saasAdmin.edit === true;
      if (!isSaasAdmin && (replyPermission.view !== true || replyPermission.fields?.reply !== true)) throw new Error('اجازه پاسخ‌گویی به گفتگوهای اینستاگرام را ندارید.');
      const conversations = context.isService
        ? await rest(url, serviceKey, `instagram_conversations?id=eq.${encodeURIComponent(conversationId)}&org_id=eq.${encodeURIComponent(context.orgId)}&select=id,provider_id,account_id,contact_id`)
        : await userRest(url, context, `instagram_conversations?id=eq.${encodeURIComponent(conversationId)}&org_id=eq.${encodeURIComponent(context.orgId)}&select=id,provider_id,account_id,contact_id`);
      const conversation = conversations?.[0];
      if (!conversation) throw new Error('گفتگو پیدا نشد.');
      const providers = await rest(url, serviceKey, `instagram_providers?id=eq.${encodeURIComponent(conversation.provider_id)}&org_id=eq.${encodeURIComponent(context.orgId)}&select=*`);
      const accountRows = await rest(url, serviceKey, `instagram_accounts?id=eq.${encodeURIComponent(conversation.account_id)}&org_id=eq.${encodeURIComponent(context.orgId)}&select=provider_account_id,capabilities`);
      const contactRows = await rest(url, serviceKey, `instagram_contacts?id=eq.${encodeURIComponent(conversation.contact_id)}&org_id=eq.${encodeURIComponent(context.orgId)}&select=instagram_scoped_id`);
      let message = text(body?.message);
      const showcaseId = text(body?.showcaseId);
      let showcaseButtons: any[] = [];
      if (showcaseId) {
        const showcase = (await rest(url, serviceKey, `instagram_product_showcases?id=eq.${encodeURIComponent(showcaseId)}&org_id=eq.${encodeURIComponent(context.orgId)}&is_active=eq.true&select=id,name,description,button_templates,source_kind,source_id`))?.[0];
        if (!showcase) throw new Error('ویترین محصولات انتخاب‌شده معتبر نیست.');
        const showcaseItems = await resolveShowcaseItems(showcase, url, serviceKey, context.orgId);
        const itemLines = showcaseItems.map((item: any) => {
          const snapshot = item?.snapshot || item || {};
          const price = snapshot?.price === null || snapshot?.price === undefined || snapshot?.price === '' ? '' : ` — ${Number(snapshot.price).toLocaleString('fa-IR')} ریال${text(snapshot.unit_name) ? ` / ${text(snapshot.unit_name)}` : ''}`;
          return `• ${text(snapshot.title) || 'محصول'}${price}`;
        });
        message = [message, text(showcase.description) || `ویترین محصولات: ${text(showcase.name)}`, ...itemLines].filter(Boolean).join('\n');
        showcaseButtons = (Array.isArray(showcase.button_templates) ? showcase.button_templates : []).map((button: any, index: number) => ({
          title: text(button?.title),
          action_type: text(button?.action_type || 'postback'),
          url: text(button?.payload?.url),
          payload: { version: 1, showcase_id: showcase.id, button_key: text(button?.key || `button_${index + 1}`), action_type: text(button?.action_type || 'postback'), data: button?.payload || {} },
        }));
      }
      if (!message) throw new Error('متن پیام یا ویترین را انتخاب کنید.');
      const providerForMessage = providers?.[0], accountForMessage = accountRows?.[0], contactForMessage = contactRows?.[0];
      if (!providerForMessage || !accountForMessage?.provider_account_id || !contactForMessage?.instagram_scoped_id) throw new Error('اطلاعات پیج یا مخاطب برای ارسال کامل نیست.');
      const configuredButtons = showcaseId ? showcaseButtons : (Array.isArray(body?.buttons) ? body.buttons : []);
      const buttons = Array.isArray(configuredButtons) ? configuredButtons.map((button: any, index: number) => {
        const title = text(button?.title).slice(0, 80);
        const actionType = text(button?.type || button?.action_type || (button?.url ? 'web_url' : 'postback'));
        if (actionType === 'web_url' || actionType === 'open_url') return { type: 'web_url', title, url: text(button?.url) };
        const rawPayload = button?.payload && typeof button.payload === 'object'
          ? JSON.stringify(button.payload)
          : text(button?.payload || button?.key || `button_${index + 1}`);
        return { type: 'postback', title, payload: rawPayload };
      }).filter((button: any) => button.title && ((button.type === 'web_url' && button.url) || (button.type === 'postback' && button.payload))).slice(0, 3) : [];
      const result = await providerRequest(providerForMessage, 'send_message', { account_id: accountForMessage.provider_account_id, recipient_id: contactForMessage.instagram_scoped_id, message, ...(buttons.length ? { buttons } : {}) });
      const providerMessageId = text(result?.data?.message_id || result?.message_id);
      await rest(url, serviceKey, 'instagram_messages', { method: 'POST', body: JSON.stringify({ org_id: context.orgId, conversation_id: conversation.id, provider_message_id: providerMessageId || `outbound:${crypto.randomUUID()}`, direction: 'outbound', message_type: buttons.length ? 'button' : 'text', content_text: message, buttons, delivery_status: 'sent', provider_payload: result, sent_by: context.userId }) });
      await rest(url, serviceKey, `instagram_conversations?id=eq.${encodeURIComponent(conversation.id)}&org_id=eq.${encodeURIComponent(context.orgId)}`, { method: 'PATCH', body: JSON.stringify({ last_message_preview: message, last_message_at: now(), last_outbound_at: now(), updated_at: now() }) });
      return json(200, { success: true });
    }
    if (action === 'reply_comment') {
      const commentId = text(body?.commentId);
      const replyPermission = context.permissions?.instagram_conversations || {};
      const saasAdmin = context.permissions?.__saas_admin || {};
      const isSaasAdmin = saasAdmin.view === true || saasAdmin.edit === true;
      if (!isSaasAdmin && (replyPermission.view !== true || replyPermission.fields?.reply !== true)) throw new Error('اجازه پاسخ‌گویی به کامنت‌های اینستاگرام را ندارید.');
      const comment = (await rest(url, serviceKey, `instagram_comments?id=eq.${encodeURIComponent(commentId)}&org_id=eq.${encodeURIComponent(context.orgId)}&select=id,provider_id,account_id,provider_comment_id,media_id`))?.[0];
      const reply = text(body?.message);
      if (!comment || !reply) throw new Error('کامنت یا متن پاسخ معتبر نیست.');
      const provider = (await rest(url, serviceKey, `instagram_providers?id=eq.${encodeURIComponent(comment.provider_id)}&org_id=eq.${encodeURIComponent(context.orgId)}&select=*`))?.[0];
      const account = (await rest(url, serviceKey, `instagram_accounts?id=eq.${encodeURIComponent(comment.account_id)}&org_id=eq.${encodeURIComponent(context.orgId)}&select=provider_account_id,username`))?.[0];
      if (!provider || !account?.provider_account_id) throw new Error('اطلاعات پیج برای پاسخ به کامنت کامل نیست.');
      const result = await providerRequest(provider, 'reply_comment', { account_id: account.provider_account_id, comment_id: comment.provider_comment_id, message: reply });
      await rest(url, serviceKey, `instagram_comments?id=eq.${encodeURIComponent(comment.id)}&org_id=eq.${encodeURIComponent(context.orgId)}`, { method: 'PATCH', body: JSON.stringify({ status: 'resolved', replied_at: now(), updated_at: now() }) });
      const media = comment.media_id ? (await rest(url, serviceKey, `instagram_social_media?id=eq.${encodeURIComponent(comment.media_id)}&org_id=eq.${encodeURIComponent(context.orgId)}&select=media_type,caption,permalink`))?.[0] : null;
      await rest(url, serviceKey, 'instagram_interaction_events', { method: 'POST', body: JSON.stringify({ org_id: context.orgId, provider_id: provider.id, account_id: comment.account_id, account_username: account.username || null, comment_id: comment.id, event_type: 'comment_replied', message_text: reply, media_type: media?.media_type || null, media_caption: media?.caption || null, media_permalink: media?.permalink || null, payload: { message: reply, provider_result: result }, occurred_at: now() }) });
      return json(200, { success: true });
    }
    const provider = (await rest(url, serviceKey, `instagram_providers?id=eq.${encodeURIComponent(providerId)}&org_id=eq.${encodeURIComponent(context.orgId)}&select=*`))?.[0];
    if (!provider) throw new Error('اتصال سرویس‌دهندهٔ اینستاگرام پیدا نشد.');
    if (action === 'delete_provider') {
      requireConnectionManagement(context);
      await rest(url, serviceKey, `instagram_providers?id=eq.${encodeURIComponent(providerId)}&org_id=eq.${encodeURIComponent(context.orgId)}`, { method: 'DELETE' });
      return json(200, { success: true });
    }
    if (action === 'sync_accounts') { requireConnectionManagement(context); return json(200, { success: true, syncedCount: await syncAccounts(provider, url, serviceKey, context.orgId) }); }
    if (action === 'sync_posts') {
      requireInstagramInboxView(context);
      const accountId = text(body?.accountId);
      const account = (await rest(url, serviceKey, `instagram_accounts?id=eq.${encodeURIComponent(accountId)}&provider_id=eq.${encodeURIComponent(provider.id)}&org_id=eq.${encodeURIComponent(context.orgId)}&select=provider_account_id`))?.[0];
      if (!account?.provider_account_id) throw new Error('پیج انتخاب‌شده برای این اتصال پیدا نشد.');
      if (body?.automatic === true) {
        const latestMedia = (await rest(url, serviceKey, `instagram_social_media?org_id=eq.${encodeURIComponent(context.orgId)}&account_id=eq.${encodeURIComponent(accountId)}&select=last_synced_at&order=last_synced_at.desc&limit=1`))?.[0];
        const syncedAt = Date.parse(text(latestMedia?.last_synced_at));
        if (Number.isFinite(syncedAt) && Date.now() - syncedAt < 5 * 60 * 1000) return json(200, { success: true, queued: false, skipped: true });
      }
      const result = await syncPosts(provider, account, Array.isArray(body?.fields) ? body.fields.map(text).filter(Boolean) : []);
      return json(200, { success: true, queued: true, result });
    }
    if (action === 'get_connect_url') {
      requireConnectionManagement(context);
      const result = await providerRequest(provider, 'get_connect_url');
      return json(200, { success: true, connectUrl: text(result?.data?.instagram_oauth_url), provider: providerSummary(provider, req) });
    }
    throw new Error('عملیات درخواستی پشتیبانی نمی‌شود.');
  } catch (error) {
    return json(400, { success: false, message: error instanceof Error ? error.message : 'خطای نامشخص' });
  }
});
