// @ts-nocheck
// Durable advertising-campaign dispatcher. Invoked only with the service role.

const FUNCTION_BUILD = 'campaign-runtime-2026-08-27-02';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-kalam-internal',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, payload: Record<string, any>) => new Response(
  JSON.stringify({ build: FUNCTION_BUILD, ...payload }),
  { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
);

const headers = (key: string, prefer?: string) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  ...(prefer ? { Prefer: prefer } : {}),
});

const parse = async (response: Response) => {
  const raw = await response.text();
  try { return raw ? JSON.parse(raw) : null; } catch { return raw; }
};

const rest = async (
  baseUrl: string,
  key: string,
  path: string,
  init: RequestInit = {},
) => {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers(key), ...(init.headers || {}) },
  });
  const payload = await parse(response);
  if (!response.ok) throw new Error(typeof payload === 'string' ? payload : JSON.stringify(payload));
  return payload;
};

const rpc = (baseUrl: string, key: string, name: string, body: Record<string, any>) => rest(
  baseUrl, key, `rpc/${name}`, { method: 'POST', body: JSON.stringify(body) },
);

const patchRows = (baseUrl: string, key: string, path: string, body: Record<string, any>) => rest(
  baseUrl,
  key,
  path,
  { method: 'PATCH', headers: headers(key, 'return=minimal'), body: JSON.stringify(body) },
);

const insertRows = (baseUrl: string, key: string, table: string, body: Record<string, any>) => rest(
  baseUrl,
  key,
  table,
  { method: 'POST', headers: headers(key, 'return=representation'), body: JSON.stringify(body) },
);

const render = (template: unknown, variables: Record<string, any>) => String(template || '').replace(
  /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g,
  (_match, path) => {
    const value = String(path).split('.').reduce((cursor: any, key: string) => cursor?.[key], variables);
    return value === null || value === undefined ? '' : String(value);
  },
);

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
};

const richTextToPlainText = (value: unknown) => String(value ?? '')
  .replace(/<\s*br\s*\/?\s*>/gi, '\n')
  .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
  .replace(/<li[^>]*>/gi, '• ')
  .replace(/<[^>]*>/g, '')
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_match, entity: string) => {
    const normalized = String(entity || '').toLowerCase();
    if (normalized.startsWith('#x')) {
      const code = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    }
    if (normalized.startsWith('#')) {
      const code = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    }
    return HTML_ENTITY_MAP[normalized] ?? '';
  })
  .replace(/[\u200e\u200f\ufeff]/g, '')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const callFunction = async (
  baseUrl: string,
  key: string,
  functionName: string,
  body: Record<string, any>,
  extraHeaders: Record<string, string> = {},
) => {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: { ...headers(key), ...extraHeaders },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const payload = await parse(response);
  if (!response.ok || payload?.success === false) {
    throw new Error(String(payload?.message || payload?.error || payload || `HTTP ${response.status}`));
  }
  return payload || {};
};

const featureForTool = (toolType: string) => ({
  sms: 'campaign_sms',
  email: 'campaign_email',
  bot_group: 'campaign_bot_group',
  bot_private: 'campaign_bot_private',
}[toolType] || null);

const isFeatureEnabled = async (baseUrl: string, key: string, orgId: string, feature: string) => {
  const result = await rpc(baseUrl, key, 'org_has_plan_feature', {
    p_org_id: orgId,
    p_feature_key: feature,
    p_default_enabled: false,
  });
  return result === true;
};

const isModuleEnabled = async (baseUrl: string, key: string, orgId: string) => {
  const result = await rpc(baseUrl, key, 'org_has_plan_module', {
    p_org_id: orgId,
    p_module_id: 'advertising_campaigns',
    p_default_enabled: false,
  });
  return result === true;
};

const loadConnection = async (baseUrl: string, key: string, connectionId: string, orgId: string) => {
  const rows = await rest(baseUrl, key,
    `integration_settings?id=eq.${encodeURIComponent(connectionId)}&org_id=eq.${encodeURIComponent(orgId)}&is_active=eq.true&select=id,org_id,connection_type,settings&limit=1`,
  );
  return Array.isArray(rows) ? rows[0] || null : null;
};

const sendRecipient = async ({
  baseUrl, key, dispatch, tool, recipient,
}: { baseUrl: string; key: string; dispatch: any; tool: any; recipient: any }) => {
  const snapshot = dispatch.message_snapshot && typeof dispatch.message_snapshot === 'object'
    ? dispatch.message_snapshot : {};
  const variables = {
    ...(recipient.variables && typeof recipient.variables === 'object' ? recipient.variables : {}),
    display_name: recipient.display_name || '',
    recipient: recipient.contact_value,
  };
  const configuredMessage = tool.config?.message_template || tool.config?.html_body || tool.config?.message || '';
  const renderedMessage = render(snapshot.message || snapshot.text || configuredMessage, variables).trim();
  const plainMessage = richTextToPlainText(snapshot.text ? render(snapshot.text, variables) : renderedMessage);
  let providerPayload: any = null;
  let sender: string | null = null;

  if (tool.tool_type === 'sms') {
    sender = String(snapshot.sender_number || tool.config?.sender_number || '').trim() || null;
    if (!plainMessage) throw new Error('متن پیامک خالی است.');
    providerPayload = await callFunction(baseUrl, key, 'send-sms', {
      action: 'send', org_id: dispatch.org_id, to: [recipient.contact_value], text: plainMessage,
      sender_number: sender,
    }, { 'x-kalam-internal': 'campaign-runtime' });
    sender = String(providerPayload?.sender_number || sender || '').trim() || null;
  } else if (tool.tool_type === 'email') {
    const subject = render(snapshot.subject || tool.config?.subject || '', variables).trim();
    if (!plainMessage) throw new Error('متن ایمیل خالی است.');
    providerPayload = await callFunction(baseUrl, key, 'send-email', {
      org_id: dispatch.org_id, to: [recipient.contact_value], subject, body: renderedMessage,
    });
  } else if (tool.tool_type === 'bot_group' || tool.tool_type === 'bot_private') {
    const connectionId = String(snapshot.connection_id || tool.config?.connection_id || '').trim();
    const channel = String(snapshot.channel || tool.config?.channel || '').trim().toLowerCase();
    const connection = connectionId ? await loadConnection(baseUrl, key, connectionId, dispatch.org_id) : null;
    if (!connection) throw new Error('اتصال بات فعال و متعلق به سازمان پیدا نشد.');
    if (!plainMessage) throw new Error('متن پیام بات خالی است.');
    const validConnectionTypes = channel === 'telegram' ? ['telegram','telegram_bot']
      : channel === 'bale' ? ['bale','bale_bot'] : channel === 'rubika' ? ['rubika','rubika_bot'] : [];
    if (!validConnectionTypes.includes(String(connection.connection_type || '').trim().toLowerCase())) {
      throw new Error('اتصال بات با پلتفرم انتخاب‌شده تطبیق ندارد.');
    }
    providerPayload = await callFunction(baseUrl, key, 'bot-admin', {
      action: 'send_test_message', channel, connectionId, chatId: recipient.contact_value,
      text: plainMessage, skipLog: true,
      attachments: Array.isArray(snapshot.attachments) ? snapshot.attachments : [],
    });
  } else {
    throw new Error('این ابزار موتور ارسال خودکار ندارد.');
  }

  const rows = await insertRows(baseUrl, key, 'outbound_messages', {
    org_id: dispatch.org_id,
    channel_type: tool.tool_type === 'email' ? 'email' : tool.tool_type.startsWith('bot_')
      ? String(snapshot.channel || tool.config?.channel || 'telegram') : 'sms',
    direction: 'outbound',
    provider: tool.tool_type === 'sms' ? 'meli_payamak' : tool.tool_type === 'email' ? 'smtp' : 'bot',
    sender,
    recipient: recipient.contact_value,
    title: String(snapshot.subject || tool.title || 'ارسال کمپین'),
    message_text: plainMessage,
    status: 'provider_accepted',
    sent_at: new Date().toISOString(),
    advertising_campaign_id: dispatch.campaign_id,
    advertising_campaign_tool_id: dispatch.tool_id,
    advertising_campaign_dispatch_id: dispatch.id,
    related_module_id: recipient.source_module_id || null,
    related_record_id: recipient.source_record_id || null,
    metadata: {
      source_type: 'advertising_campaign',
      campaign_runtime_build: FUNCTION_BUILD,
      provider_result: providerPayload,
    },
  });
  const outboundId = String(Array.isArray(rows) ? rows[0]?.id || '' : rows?.id || '').trim() || null;
  await patchRows(baseUrl, key, `advertising_campaign_recipients?id=eq.${recipient.id}`, {
    status: 'sent', outbound_message_id: outboundId, error_message: null,
  });
};

const processDispatch = async (baseUrl: string, key: string, dispatch: any) => {
  const toolRows = await rest(baseUrl, key,
    `advertising_campaign_tools?id=eq.${dispatch.tool_id}&org_id=eq.${dispatch.org_id}&select=*&limit=1`,
  );
  const tool = Array.isArray(toolRows) ? toolRows[0] : null;
  if (!tool || !tool.enabled) throw new Error('ابزار فعال کمپین پیدا نشد.');
  if (String(dispatch.channel_type || '').trim().toLowerCase() !== String(tool.tool_type || '').trim().toLowerCase()) {
    throw new Error('کانال صف ارسال با ابزار کمپین تطبیق ندارد.');
  }
  const feature = featureForTool(tool.tool_type);
  if (!(await isModuleEnabled(baseUrl, key, dispatch.org_id))
      || !feature
      || !(await isFeatureEnabled(baseUrl, key, dispatch.org_id, feature))) {
    throw new Error('قابلیت ارسال این کانال در پلن سازمان فعال نیست.');
  }

  const isTestDispatch = dispatch?.message_snapshot?.is_test === true
    || dispatch?.audience_snapshot?.is_test === true;
  if (!isTestDispatch) {
    await patchRows(baseUrl, key, `advertising_campaign_tools?id=eq.${tool.id}`, {
      status: 'running', actual_start_at: tool.actual_start_at || new Date().toISOString(),
    });
  }
  const recipients = await rest(baseUrl, key,
    `advertising_campaign_recipients?dispatch_id=eq.${dispatch.id}&status=eq.pending&select=*&order=created_at.asc&limit=100`,
  );
  let externallyControlledStatus: string | null = null;
  for (const recipient of Array.isArray(recipients) ? recipients : []) {
    const dispatchStateRows = await rest(baseUrl, key,
      `advertising_campaign_dispatches?id=eq.${dispatch.id}&select=status&limit=1`,
    );
    const currentStatus = String(Array.isArray(dispatchStateRows) ? dispatchStateRows[0]?.status || '' : '').trim();
    if (currentStatus !== 'processing') {
      externallyControlledStatus = currentStatus || 'paused';
      break;
    }
    await patchRows(baseUrl, key, `advertising_campaign_recipients?id=eq.${recipient.id}`, {
      status: 'processing',
      attempt_count: Math.max(0, Number(recipient.attempt_count || 0)) + 1,
      last_attempt_at: new Date().toISOString(),
    });
    try {
      await sendRecipient({ baseUrl, key, dispatch, tool, recipient });
    } catch (error: any) {
      await patchRows(baseUrl, key, `advertising_campaign_recipients?id=eq.${recipient.id}`, {
        status: 'failed', error_message: String(error?.message || error).slice(0, 1500),
      });
    }
  }

  const countsRows = await rest(baseUrl, key,
    `advertising_campaign_recipients?dispatch_id=eq.${dispatch.id}&select=status`,
  );
  const counts = (Array.isArray(countsRows) ? countsRows : []).reduce((acc: Record<string, number>, row: any) => {
    const status = String(row?.status || 'pending'); acc[status] = (acc[status] || 0) + 1; return acc;
  }, {});
  const remaining = Number(counts.pending || 0) + Number(counts.processing || 0);
  const finalStatus = externallyControlledStatus || (remaining > 0 ? 'queued'
    : Number(counts.failed || 0) > 0 && Number(counts.sent || 0) > 0 ? 'partial'
      : Number(counts.failed || 0) > 0 ? 'failed' : 'succeeded');
  await patchRows(baseUrl, key, `advertising_campaign_dispatches?id=eq.${dispatch.id}`, {
    status: finalStatus,
    processed_count: Number(counts.sent || 0) + Number(counts.failed || 0) + Number(counts.skipped || 0) + Number(counts.suppressed || 0),
    success_count: Number(counts.sent || 0),
    failure_count: Number(counts.failed || 0),
    skipped_count: Number(counts.skipped || 0) + Number(counts.suppressed || 0),
    available_at: remaining > 0 && !externallyControlledStatus ? new Date().toISOString() : dispatch.available_at,
    claimed_at: remaining > 0 ? null : dispatch.claimed_at,
    completed_at: remaining > 0 || externallyControlledStatus === 'paused' ? null : new Date().toISOString(),
  });
  if (remaining === 0 && !externallyControlledStatus && !isTestDispatch) {
    await patchRows(baseUrl, key, `advertising_campaign_tools?id=eq.${tool.id}`, {
      status: finalStatus === 'succeeded' ? 'completed' : finalStatus === 'failed' ? 'failed' : 'completed',
      actual_end_at: new Date().toISOString(),
    });
  }
  return { dispatch_id: dispatch.id, status: finalStatus, remaining };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { success: false, message: 'Method Not Allowed' });
  const baseUrl = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!baseUrl || !key) return json(500, { success: false, message: 'Missing environment variables' });
  const token = String(req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (token !== key) return json(401, { success: false, message: 'Unauthorized' });

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit || 10), 1), 50);
    const claimed = await rpc(baseUrl, key, 'claim_due_advertising_campaign_dispatches', { p_limit: limit });
    const results: any[] = [];
    for (const dispatch of Array.isArray(claimed) ? claimed : []) {
      try {
        results.push(await processDispatch(baseUrl, key, dispatch));
      } catch (error: any) {
        const message = String(error?.message || error).slice(0, 1500);
        await patchRows(baseUrl, key, `advertising_campaign_dispatches?id=eq.${dispatch.id}`, {
          status: 'failed', last_error: message, completed_at: new Date().toISOString(),
        }).catch(() => null);
        results.push({ dispatch_id: dispatch.id, status: 'failed', error: message });
      }
    }
    return json(200, { success: true, claimed: Array.isArray(claimed) ? claimed.length : 0, results });
  } catch (error: any) {
    return json(500, { success: false, message: String(error?.message || error) });
  }
});
