// @ts-nocheck
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

const uniqueStrings = (value: unknown) => Array.from(new Set(
  (Array.isArray(value) ? value : []).map((item) => String(item || '').trim()).filter(Boolean),
));

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim();
  const serviceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  const authorization = String(request.headers.get('Authorization') || '').trim();
  if (!supabaseUrl || !serviceRoleKey || authorization !== `Bearer ${serviceRoleKey}`) {
    return json({ error: 'unauthorized' }, 401);
  }

  const vapidPublicKey = String(Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY') || '').trim();
  const vapidPrivateKey = String(Deno.env.get('WEB_PUSH_VAPID_PRIVATE_KEY') || '').trim();
  const vapidSubject = String(Deno.env.get('WEB_PUSH_VAPID_SUBJECT') || 'mailto:support@tazesystem.ir').trim();
  if (!vapidPublicKey || !vapidPrivateKey) return json({ error: 'web_push_not_configured' }, 503);

  const body = await request.json().catch(() => ({}));
  const orgId = String(body?.orgId || '').trim();
  const eventKey = String(body?.eventKey || '').trim();
  const targetUserIds = uniqueStrings(body?.targetUserIds);
  const targetRoleIds = uniqueStrings(body?.targetRoleIds);
  const isOrgWide = body?.isOrgWide === true;
  if (!orgId || !eventKey || (!isOrgWide && targetUserIds.length === 0 && targetRoleIds.length === 0)) {
    return json({ error: 'invalid_payload' }, 400);
  }

  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: subscriptions, error: subscriptionsError } = await service
    .from('web_push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth_key, failure_count')
    .eq('org_id', orgId)
    .is('disabled_at', null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  if (subscriptionsError) return json({ error: 'subscription_query_failed' }, 500);

  const subscribedUserIds = uniqueStrings((subscriptions || []).map((item) => item.user_id));
  const { data: memberships, error: membershipsError } = subscribedUserIds.length > 0
    ? await service.from('user_organization_memberships').select('user_id, role_id, org_id, is_active').eq('org_id', orgId).eq('is_active', true).in('user_id', subscribedUserIds)
    : { data: [], error: null };
  if (membershipsError) return json({ error: 'recipient_query_failed' }, 500);
  const allowedUsers = new Set((memberships || []).filter((membership) => (
    isOrgWide
    || targetUserIds.includes(String(membership.user_id))
    || targetRoleIds.includes(String(membership.role_id || ''))
  )).map((membership) => String(membership.user_id)));
  const targets = (subscriptions || []).filter((subscription) => allowedUsers.has(String(subscription.user_id)));

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const payload = JSON.stringify({
    title: String(body?.title || 'پیام جدید در تازه سیستم').trim(),
    body: String(body?.message || '').trim(),
    url: String(body?.url || '/messages?tab=notes&conversation=system').trim(),
    tag: String(body?.tag || `system:${eventKey}`).trim(),
    eventKey,
    timestamp: Date.now(),
  });

  let sent = 0;
  let failed = 0;
  for (const subscription of targets) {
    const { error: claimError } = await service.from('web_push_delivery_attempts').insert({
      org_id: orgId,
      subscription_id: subscription.id,
      event_key: eventKey,
      status: 'pending',
    });
    if (claimError?.code === '23505') continue;
    if (claimError) { failed += 1; continue; }

    try {
      const response = await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
      }, payload, { TTL: 60 * 60 * 24, urgency: 'normal' });
      sent += 1;
      await Promise.all([
        service.from('web_push_delivery_attempts').update({ status: 'sent', provider_status: Number(response?.statusCode || 201), updated_at: new Date().toISOString() }).eq('org_id', orgId).eq('subscription_id', subscription.id).eq('event_key', eventKey),
        service.from('web_push_subscriptions').update({ last_used_at: new Date().toISOString(), failure_count: 0, updated_at: new Date().toISOString() }).eq('id', subscription.id),
      ]);
    } catch (error) {
      failed += 1;
      const statusCode = Number(error?.statusCode || 0) || null;
      const expired = statusCode === 404 || statusCode === 410;
      await Promise.all([
        service.from('web_push_delivery_attempts').update({ status: expired ? 'expired' : 'failed', provider_status: statusCode, error_message: String(error?.message || 'push_failed').slice(0, 500), updated_at: new Date().toISOString() }).eq('org_id', orgId).eq('subscription_id', subscription.id).eq('event_key', eventKey),
        service.from('web_push_subscriptions').update({ disabled_at: expired ? new Date().toISOString() : null, failure_count: Number(subscription.failure_count || 0) + 1, updated_at: new Date().toISOString() }).eq('id', subscription.id),
      ]);
    }
  }

  return json({ success: true, targeted: targets.length, sent, failed });
});
