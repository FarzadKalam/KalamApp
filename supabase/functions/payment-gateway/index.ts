// @ts-nocheck

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const FUNCTION_BUILD = 'payment-gateway-2026-06-18-zarinpal-foundation';

const json = (status: number, payload: Record<string, any>) =>
  new Response(JSON.stringify({ build: FUNCTION_BUILD, ...payload }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });

const html = (status: number, body: string) =>
  new Response(body, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  });

const h = (key: string) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
});

const enc = (value: any) => encodeURIComponent(String(value ?? ''));
const first = (value: any) => Array.isArray(value) ? value[0] : value;
const normalizeModule = (value: any) => String(value || 'invoices').trim() === 'purchase_invoices' ? 'purchase_invoices' : 'invoices';
const normalizeCurrency = (value: any) => String(value || 'IRR').trim().toUpperCase() === 'IRT' ? 'IRT' : 'IRR';
const normalizeGatewayScope = (value: any) => String(value || 'system').trim() === 'org' ? 'org' : 'system';
const trimSlashEnd = (value: string) => String(value || '').replace(/\/+$/, '');
const normalizeCallbackPath = (value: any) => {
  const raw = String(value || '/payment/callback').trim() || '/payment/callback';
  return raw.startsWith('/') ? raw : `/${raw}`;
};
const normalizeSafeReturnOrigin = (value: any) => {
  const raw = trimSlashEnd(String(value || '').trim());
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'tazesystem.ir'
      || host.endsWith('.tazesystem.ir')
      || host === 'localhost'
      || host === '127.0.0.1'
    ) {
      return parsed.origin;
    }
  } catch {
    return '';
  }
  return '';
};

const rest = async (urlBase: string, key: string, path: string, init: RequestInit = {}) => {
  const res = await fetch(`${trimSlashEnd(urlBase)}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...h(key),
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(typeof data?.message === 'string' ? data.message : text || `REST ${res.status}`);
  return data;
};

const rpc = async (urlBase: string, key: string, name: string, body: Record<string, any>) => {
  const res = await fetch(`${trimSlashEnd(urlBase)}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: h(key),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(typeof data?.message === 'string' ? data.message : text || `RPC ${res.status}`);
  return data;
};

const getInvoiceByPublicCode = async (urlBase: string, key: string, code: string) => {
  const select = 'id,org_id,system_code,public_slug,public_token,public_link,name,remaining_balance,total_invoice_amount';
  const filter = `select=${select}&or=(public_slug.eq.${enc(code)},public_token.eq.${enc(code)})&limit=1`;
  return first(await rest(urlBase, key, `invoices?${filter}`));
};

const getPaymentState = async (urlBase: string, key: string, code: string, module: string) =>
  rpc(urlBase, key, 'get_public_invoice_payment_state', {
    p_system_code: code,
    p_module: module,
  });

const getGatewaySettingsForOrg = async (urlBase: string, key: string, orgId: string) => {
  const row = first(await rest(
    urlBase,
    key,
    `integration_settings?select=settings,is_active,provider,connection_type&org_id=eq.${enc(orgId)}&connection_type=eq.payment_gateway&provider=eq.zarinpal&order=is_active.desc,updated_at.desc,created_at.desc&limit=1`
  ));
  return row?.settings || {};
};

const resolveGatewayMerchantId = (scope: string, gatewaySettings: Record<string, any>, centralMerchantId: string) => {
  if (scope === 'org') return String(gatewaySettings?.merchant_id || '').trim();
  return String(centralMerchantId || '').trim();
};

const zarinpalBase = (mode: string) =>
  mode === 'sandbox' ? 'https://sandbox.zarinpal.com' : 'https://payment.zarinpal.com';

const zarinpalRequest = async (merchantId: string, mode: string, body: Record<string, any>) => {
  const res = await fetch(`${zarinpalBase(mode)}/pg/v4/payment/request.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ merchant_id: merchantId, ...body }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.errors?.message || payload?.message || 'درخواست پرداخت به زرین‌پال ناموفق بود.');
  return payload;
};

const zarinpalVerify = async (merchantId: string, mode: string, body: Record<string, any>) => {
  const res = await fetch(`${zarinpalBase(mode)}/pg/v4/payment/verify.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ merchant_id: merchantId, ...body }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.errors?.message || payload?.message || 'تأیید پرداخت زرین‌پال ناموفق بود.');
  return payload;
};

const redirectHtml = (url: string, title: string) => html(200, `<!doctype html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="font-family:sans-serif;padding:24px;text-align:center">
  <p>${title}</p>
  <p><a href="${url}">بازگشت به فاکتور</a></p>
  <script>window.location.replace(${JSON.stringify(url)});</script>
</body>
</html>`);

const buildInvoiceReturnUrl = (tx: any, status: string) => {
  const publicOrigin = trimSlashEnd(String(tx?.metadata?.public_origin || Deno.env.get('PUBLIC_SITE_URL') || '').trim());
  const publicPath = String(tx?.metadata?.public_link || '').trim()
    || `/i/${String(tx?.metadata?.public_code || '').trim()}`;
  const suffix = publicPath.includes('?') ? '&' : '?';
  return `${publicOrigin}${publicPath}${suffix}payment=${enc(status)}`;
};

const createInvoicePayment = async (urlBase: string, key: string, centralMerchantId: string, body: any) => {
  const code = String(body?.system_code || body?.code || '').trim();
  const module = normalizeModule(body?.module);
  if (!code || module !== 'invoices') return json(400, { success: false, message: 'فاکتور برای پرداخت معتبر نیست.' });

  const [paymentState, invoice] = await Promise.all([
    getPaymentState(urlBase, key, code, module),
    getInvoiceByPublicCode(urlBase, key, code),
  ]);

  if (!invoice?.id || !invoice?.org_id) return json(404, { success: false, message: 'فاکتور پیدا نشد.' });
  if (paymentState?.available !== true) {
    return json(403, {
      success: false,
      message: 'پرداخت آنلاین برای این فاکتور فعال نیست.',
      reason: paymentState?.reason || 'unavailable',
    });
  }

  const gatewaySettings = await getGatewaySettingsForOrg(urlBase, key, invoice.org_id);
  const settings = { ...(paymentState || {}), ...(gatewaySettings || {}) };
  const gatewayScope = normalizeGatewayScope(settings.gateway_scope);
  const merchantId = resolveGatewayMerchantId(gatewayScope, gatewaySettings, centralMerchantId);
  if (!merchantId) {
    return json(500, {
      success: false,
      message: gatewayScope === 'org'
        ? 'Merchant ID درگاه اختصاصی این سازمان تنظیم نشده است.'
        : 'Merchant ID درگاه مرکزی تازه سیستم روی سرور تنظیم نشده است.',
    });
  }

  const amount = Math.max(0, Number(paymentState.amount || invoice.remaining_balance || 0));
  if (!Number.isFinite(amount) || amount <= 0) return json(400, { success: false, message: 'مبلغ قابل پرداخت معتبر نیست.' });

  const mode = String(settings.mode || 'production') === 'sandbox' ? 'sandbox' : 'production';
  const currency = normalizeCurrency(settings.currency);
  const paymentDomain = trimSlashEnd(String(settings.payment_domain || ''));
  const callbackPath = normalizeCallbackPath(settings.callback_path);
  const description = String(settings.default_description || '').trim()
    || `پرداخت فاکتور ${invoice.system_code || invoice.name || ''}`.trim()
    || 'پرداخت آنلاین فاکتور';
  const returnOrigin = normalizeSafeReturnOrigin(body?.return_origin);

  if (!paymentDomain) return json(400, { success: false, message: 'دامنه پرداخت تنظیم نشده است.' });

  const [tx] = await rest(urlBase, key, 'payment_transactions', {
    method: 'POST',
    body: JSON.stringify([{
      org_id: invoice.org_id,
      gateway_scope: gatewayScope,
      provider: 'zarinpal',
      purpose: 'online_invoice',
      module_id: 'invoices',
      record_id: invoice.id,
      amount,
      currency,
      status: 'pending',
      callback_url: '',
      description,
      metadata: {
        public_code: code,
        public_link: invoice.public_link || `/i/${code}`,
        public_origin: returnOrigin,
        invoice_system_code: invoice.system_code || null,
        mode,
      },
    }]),
  });

  const callbackUrl = `${paymentDomain}${callbackPath}?tx=${enc(tx.id)}`;
  const requestPayload = {
    amount: Math.round(amount),
    currency,
    callback_url: callbackUrl,
    description,
    metadata: {
      order_id: tx.id,
    },
  };

  try {
    const zp = await zarinpalRequest(merchantId, mode, requestPayload);
    const data = zp?.data || {};
    const codeValue = Number(data?.code);
    const authority = String(data?.authority || '').trim();
    if (codeValue !== 100 || !authority) {
      throw new Error(zp?.errors?.message || 'زرین‌پال درخواست پرداخت را نپذیرفت.');
    }
    const paymentUrl = `${zarinpalBase(mode)}/pg/StartPay/${authority}`;
    await rest(urlBase, key, `payment_transactions?id=eq.${enc(tx.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'redirected',
        authority,
        callback_url: callbackUrl,
        start_url: paymentUrl,
        request_payload: zp,
      }),
    });
    return json(200, { success: true, payment_url: paymentUrl, transaction_id: tx.id });
  } catch (err: any) {
    await rest(urlBase, key, `payment_transactions?id=eq.${enc(tx.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'failed',
        callback_url: callbackUrl,
        request_payload: requestPayload,
        error_message: String(err?.message || err),
      }),
    }).catch(() => null);
    throw err;
  }
};

const handleCallback = async (urlBase: string, key: string, merchantId: string, url: URL) => {
  const txId = String(url.searchParams.get('tx') || '').trim();
  const authority = String(url.searchParams.get('Authority') || url.searchParams.get('authority') || '').trim();
  const status = String(url.searchParams.get('Status') || url.searchParams.get('status') || '').trim().toUpperCase();

  let tx = null;
  if (txId) tx = first(await rest(urlBase, key, `payment_transactions?select=*&id=eq.${enc(txId)}&limit=1`));
  if (!tx && authority) tx = first(await rest(urlBase, key, `payment_transactions?select=*&provider=eq.zarinpal&authority=eq.${enc(authority)}&limit=1`));
  if (!tx) return redirectHtml('/tazesystem', 'تراکنش پیدا نشد.');

  const returnUrl = (nextStatus: string) => buildInvoiceReturnUrl(tx, nextStatus);
  const mode = String(tx?.metadata?.mode || 'production') === 'sandbox' ? 'sandbox' : 'production';
  const gatewayScope = normalizeGatewayScope(tx?.gateway_scope);
  const gatewaySettings = tx?.org_id ? await getGatewaySettingsForOrg(urlBase, key, tx.org_id) : {};
  const resolvedMerchantId = resolveGatewayMerchantId(gatewayScope, gatewaySettings, merchantId);

  if (status !== 'OK') {
    await rest(urlBase, key, `payment_transactions?id=eq.${enc(tx.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled', error_message: 'پرداخت توسط کاربر لغو شد یا ناموفق بود.' }),
    }).catch(() => null);
    return redirectHtml(returnUrl('cancelled'), 'پرداخت ناموفق بود.');
  }
  if (!resolvedMerchantId) {
    await rest(urlBase, key, `payment_transactions?id=eq.${enc(tx.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'failed', error_message: 'Merchant ID درگاه برای تأیید پرداخت تنظیم نشده است.' }),
    }).catch(() => null);
    return redirectHtml(returnUrl('failed'), 'تنظیمات درگاه کامل نیست.');
  }

  try {
    const zp = await zarinpalVerify(resolvedMerchantId, mode, {
      amount: Math.round(Number(tx.amount || 0)),
      currency: normalizeCurrency(tx.currency),
      authority: authority || tx.authority,
    });
    const data = zp?.data || {};
    const verifyCode = Number(data?.code);
    if (![100, 101].includes(verifyCode)) {
      throw new Error(zp?.errors?.message || 'پرداخت توسط زرین‌پال تأیید نشد.');
    }

    await rest(urlBase, key, `payment_transactions?id=eq.${enc(tx.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'verified',
        authority: authority || tx.authority,
        ref_id: data?.ref_id ? String(data.ref_id) : tx.ref_id,
        card_pan: data?.card_pan ? String(data.card_pan) : tx.card_pan,
        fee: data?.fee ? Number(data.fee) : tx.fee,
        verify_payload: zp,
        paid_at: new Date().toISOString(),
        verified_at: new Date().toISOString(),
      }),
    });

    await rpc(urlBase, key, 'append_online_invoice_payment_from_transaction', {
      p_transaction_id: tx.id,
    });

    return redirectHtml(returnUrl('success'), 'پرداخت با موفقیت ثبت شد.');
  } catch (err: any) {
    await rest(urlBase, key, `payment_transactions?id=eq.${enc(tx.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'failed',
        error_message: String(err?.message || err),
      }),
    }).catch(() => null);
    return redirectHtml(returnUrl('failed'), 'تأیید پرداخت ناموفق بود.');
  }
};

const verifyCallbackPayload = async (urlBase: string, key: string, merchantId: string, body: any) => {
  const txId = String(body?.tx || body?.transaction_id || '').trim();
  const authority = String(body?.authority || body?.Authority || '').trim();
  const status = String(body?.status || body?.Status || '').trim().toUpperCase();

  let tx = null;
  if (txId) tx = first(await rest(urlBase, key, `payment_transactions?select=*&id=eq.${enc(txId)}&limit=1`));
  if (!tx && authority) tx = first(await rest(urlBase, key, `payment_transactions?select=*&provider=eq.zarinpal&authority=eq.${enc(authority)}&limit=1`));
  if (!tx) return json(404, { success: false, message: 'تراکنش پیدا نشد.', return_url: '/tazesystem' });

  const returnUrl = buildInvoiceReturnUrl(tx, status === 'OK' ? 'success' : 'failed');
  const mode = String(tx?.metadata?.mode || 'production') === 'sandbox' ? 'sandbox' : 'production';
  const gatewayScope = normalizeGatewayScope(tx?.gateway_scope);
  const gatewaySettings = tx?.org_id ? await getGatewaySettingsForOrg(urlBase, key, tx.org_id) : {};
  const resolvedMerchantId = resolveGatewayMerchantId(gatewayScope, gatewaySettings, merchantId);

  if (status !== 'OK') {
    await rest(urlBase, key, `payment_transactions?id=eq.${enc(tx.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled', error_message: 'پرداخت توسط کاربر لغو شد یا ناموفق بود.' }),
    }).catch(() => null);
    return json(200, { success: false, message: 'پرداخت لغو شد یا ناموفق بود.', return_url: buildInvoiceReturnUrl(tx, 'cancelled') });
  }
  if (!resolvedMerchantId) {
    await rest(urlBase, key, `payment_transactions?id=eq.${enc(tx.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'failed', error_message: 'Merchant ID درگاه برای تأیید پرداخت تنظیم نشده است.' }),
    }).catch(() => null);
    return json(200, {
      success: false,
      message: 'تنظیمات درگاه کامل نیست.',
      return_url: buildInvoiceReturnUrl(tx, 'failed'),
    });
  }

  try {
    const zp = await zarinpalVerify(resolvedMerchantId, mode, {
      amount: Math.round(Number(tx.amount || 0)),
      currency: normalizeCurrency(tx.currency),
      authority: authority || tx.authority,
    });
    const data = zp?.data || {};
    const verifyCode = Number(data?.code);
    if (![100, 101].includes(verifyCode)) {
      throw new Error(zp?.errors?.message || 'پرداخت توسط زرین‌پال تأیید نشد.');
    }

    await rest(urlBase, key, `payment_transactions?id=eq.${enc(tx.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'verified',
        authority: authority || tx.authority,
        ref_id: data?.ref_id ? String(data.ref_id) : tx.ref_id,
        card_pan: data?.card_pan ? String(data.card_pan) : tx.card_pan,
        fee: data?.fee ? Number(data.fee) : tx.fee,
        verify_payload: zp,
        paid_at: new Date().toISOString(),
        verified_at: new Date().toISOString(),
      }),
    });

    await rpc(urlBase, key, 'append_online_invoice_payment_from_transaction', {
      p_transaction_id: tx.id,
    });

    return json(200, {
      success: true,
      message: 'پرداخت با موفقیت ثبت شد.',
      return_url: buildInvoiceReturnUrl(tx, 'success'),
    });
  } catch (err: any) {
    await rest(urlBase, key, `payment_transactions?id=eq.${enc(tx.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'failed',
        error_message: String(err?.message || err),
      }),
    }).catch(() => null);
    return json(200, {
      success: false,
      message: String(err?.message || 'تأیید پرداخت ناموفق بود.'),
      return_url: buildInvoiceReturnUrl(tx, 'failed'),
    });
  }
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const urlBase = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const merchantId = Deno.env.get('ZARINPAL_MERCHANT_ID') || '';
  if (!urlBase || !serviceKey) return json(500, { success: false, message: 'تنظیمات Supabase کامل نیست.' });

  try {
    const url = new URL(req.url);
    if (req.method === 'GET') return handleCallback(urlBase, serviceKey, merchantId, url);
    if (req.method !== 'POST') return json(405, { success: false, message: 'روش درخواست معتبر نیست.' });

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim();
    if (action === 'create_invoice_payment') {
      return await createInvoicePayment(urlBase, serviceKey, merchantId, body);
    }
    if (action === 'verify_callback') {
      return await verifyCallbackPayload(urlBase, serviceKey, merchantId, body);
    }
    return json(400, { success: false, message: 'عملیات پرداخت معتبر نیست.' });
  } catch (err: any) {
    return json(500, { success: false, message: String(err?.message || err || 'خطای پرداخت') });
  }
});
