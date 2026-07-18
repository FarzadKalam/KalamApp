// @ts-nocheck

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const FUNCTION_BUILD = 'payment-gateway-2026-07-19-invoice-payment-host-fallback';

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

const getTenantPublicOrigin = async (urlBase: string, key: string, orgId: string, allowCentralHost = false) => {
  const row = first(await rest(
    urlBase,
    key,
    `saas_org_settings?select=resolved_host&org_id=eq.${enc(orgId)}&limit=1`
  ).catch(() => []));
  const host = String(row?.resolved_host || '').trim().replace(/\/+$/, '');
  // سازمان داخلی SaaS الزاماً رکورد tenant با resolved_host ندارد؛ پرداخت مرکزی باید به میزبان داخلی برگردد.
  if (!host) return allowCentralHost ? 'https://kalam.tazesystem.ir' : '';
  const candidate = /^https?:\/\//i.test(host) ? host : `https://${host}`;
  try {
    const parsed = new URL(candidate);
    if (!allowCentralHost && ['tazesystem.ir', 'www.tazesystem.ir', 'app.tazesystem.ir', 'kalamapp.ir', 'www.kalamapp.ir'].includes(parsed.hostname.toLowerCase())) return '';
    return parsed.origin;
  } catch {
    return '';
  }
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

const getAuthenticatedProfile = async (req: Request, urlBase: string, key: string) => {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('نشست کاربر معتبر نیست.');
  const userRes = await fetch(`${trimSlashEnd(urlBase)}/auth/v1/user`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
    },
  });
  const user = await userRes.json().catch(() => null);
  if (!userRes.ok || !user?.id) throw new Error('نشست کاربر معتبر نیست.');
  const profile = first(await rest(urlBase, key, `profiles?select=id,org_id,role_id,full_name,email,mobile_1&id=eq.${enc(user.id)}&limit=1`));
  if (!profile?.id || !profile?.org_id) throw new Error('پروفایل سازمانی کاربر پیدا نشد.');
  return { user, profile };
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
  const select = 'id,org_id,system_code,public_slug,public_token,public_link,name,remaining_balance,total_invoice_amount,payments';
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

const getInvoiceWorkflowRecord = async (urlBase: string, key: string, invoiceId: string) => {
  const normalizedInvoiceId = String(invoiceId || '').trim();
  if (!normalizedInvoiceId) return null;
  return first(await rest(
    urlBase,
    key,
    `invoices?select=*&id=eq.${enc(normalizedInvoiceId)}&limit=1`
  ).catch(() => []));
};

const runInvoiceWorkflowEvent = async (
  urlBase: string,
  key: string,
  tx: Record<string, any>,
  previousInvoice: Record<string, any> | null,
  appendResult: Record<string, any> | null,
) => {
  if (!appendResult || appendResult?.success === false || appendResult?.already_exists === true) return null;
  const invoiceId = String(appendResult?.invoice_id || tx?.record_id || '').trim();
  if (!invoiceId) return null;

  const currentInvoice = await getInvoiceWorkflowRecord(urlBase, key, invoiceId);
  if (!currentInvoice?.id) return null;
  const loadCurrentMetadata = async () => {
    const row = first(await rest(
      urlBase,
      key,
      `payment_transactions?select=metadata&id=eq.${enc(tx.id)}&limit=1`
    ).catch(() => []));
    return row?.metadata && typeof row.metadata === 'object' ? row.metadata : (tx?.metadata || {});
  };

  try {
    const response = await fetch(`${trimSlashEnd(urlBase)}/functions/v1/workflow-interval-runner`, {
      method: 'POST',
      headers: h(key),
      body: JSON.stringify({
        action: 'run_event',
        source: 'payment_gateway',
        event: 'upsert',
        module_id: 'invoices',
        record_id: invoiceId,
        record: currentInvoice,
        previous_record: previousInvoice,
        transaction_id: tx?.id || null,
        reason: 'online_invoice_payment',
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(payload?.error || payload?.message || `workflow runner ${response.status}`));
    const metadata = await loadCurrentMetadata();
    await rest(urlBase, key, `payment_transactions?id=eq.${enc(tx.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        metadata: {
          ...metadata,
          online_payment_workflow_event: {
            ok: true,
            at: new Date().toISOString(),
            stats: payload?.stats || null,
          },
        },
      }),
    }).catch(() => null);
    return payload;
  } catch (error: any) {
    console.error('[payment-gateway] invoice workflow event failed:', error?.message || error);
    const metadata = await loadCurrentMetadata();
    await rest(urlBase, key, `payment_transactions?id=eq.${enc(tx.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        metadata: {
          ...metadata,
          online_payment_workflow_event: {
            ok: false,
            at: new Date().toISOString(),
            message: String(error?.message || error || 'workflow event failed'),
          },
        },
      }),
    }).catch(() => null);
    return null;
  }
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

const buildAiTopupReturnUrl = (tx: any, status: string) => {
  const origin = trimSlashEnd(String(tx?.metadata?.return_origin || Deno.env.get('APP_ORIGIN') || Deno.env.get('PUBLIC_SITE_URL') || '').trim());
  const safeOrigin = normalizeSafeReturnOrigin(origin);
  const base = safeOrigin || '/settings';
  const path = base.startsWith('http') ? `${base}/settings` : base;
  const suffix = path.includes('?') ? '&' : '?';
  return `${path}${suffix}tab=ai&ai_credit=${enc(status)}`;
};

const buildPaymentReturnUrl = (tx: any, status: string) =>
  String(tx?.purpose || '') === 'ai_topup'
    ? buildAiTopupReturnUrl(tx, status)
    : buildInvoiceReturnUrl(tx, status);

const creditAiWalletFromTransaction = async (urlBase: string, key: string, tx: any) => {
  if (String(tx?.purpose || '') !== 'ai_topup') return null;
  if (String(tx?.metadata?.ai_wallet_credited || '') === 'true') return null;
  const orgId = String(tx?.org_id || '').trim();
  const amount = Math.max(0, Number(tx?.metadata?.wallet_amount_irt ?? tx?.amount ?? 0));
  if (!orgId || !Number.isFinite(amount) || amount <= 0) throw new Error('اطلاعات شارژ اعتبار هوش مصنوعی معتبر نیست.');
  const existingWallet = first(await rest(urlBase, key, `org_ai_wallets?select=*&org_id=eq.${enc(orgId)}&limit=1`).catch(() => []));
  if (existingWallet?.id) {
    await rest(urlBase, key, `org_ai_wallets?id=eq.${enc(existingWallet.id)}&org_id=eq.${enc(orgId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        balance_irt: Number(existingWallet.balance_irt || 0) + amount,
        status: 'active',
        updated_at: new Date().toISOString(),
        metadata: {
          ...(existingWallet.metadata || {}),
          last_topup_transaction_id: tx.id,
          last_topup_amount_irt: amount,
          last_topup_at: new Date().toISOString(),
        },
      }),
    });
  } else {
    await rest(urlBase, key, 'org_ai_wallets', {
      method: 'POST',
      body: JSON.stringify([{
        org_id: orgId,
        balance_irt: amount,
        included_quota_irt: 0,
        reserved_irt: 0,
        status: 'active',
        metadata: {
          created_by_payment: true,
          last_topup_transaction_id: tx.id,
          last_topup_amount_irt: amount,
          last_topup_at: new Date().toISOString(),
        },
      }]),
    });
  }
  await rest(urlBase, key, 'org_ai_credit_grants', {
    method: 'POST',
    body: JSON.stringify([{
      org_id: orgId,
      amount_irt: amount,
      reason: 'شارژ آنلاین اعتبار هوش مصنوعی',
      granted_by: tx?.created_by || null,
      metadata: {
        source: 'central_payment_gateway',
        payment_transaction_id: tx.id,
        authority: tx.authority || null,
        ref_id: tx.ref_id || null,
      },
    }]),
  }).catch(() => null);
  await rest(urlBase, key, `payment_transactions?id=eq.${enc(tx.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      metadata: {
        ...(tx.metadata || {}),
        ai_wallet_credited: 'true',
        ai_wallet_credited_at: new Date().toISOString(),
        wallet_amount_irt: amount,
      },
    }),
  }).catch(() => null);
  return { amount_irt: amount };
};

const createAiCreditTopup = async (req: Request, urlBase: string, key: string, centralMerchantId: string, body: any) => {
  const { profile } = await getAuthenticatedProfile(req, urlBase, key);
  const amountIrt = Math.round(Number(body?.amount_irt ?? body?.amountToman ?? body?.amount ?? 0));
  if (!Number.isFinite(amountIrt) || amountIrt < 10000) {
    return json(400, { success: false, message: 'حداقل مبلغ شارژ اعتبار هوش مصنوعی ۱۰٬۰۰۰ تومان است.' });
  }
  if (!centralMerchantId) return json(500, { success: false, message: 'Merchant ID درگاه مرکزی تازه سیستم تنظیم نشده است.' });
  const mode = String(Deno.env.get('ZARINPAL_MODE') || 'production') === 'sandbox' ? 'sandbox' : 'production';
  const paymentDomain = trimSlashEnd(String(Deno.env.get('PAYMENT_PUBLIC_URL') || Deno.env.get('PUBLIC_FUNCTIONS_URL') || '').trim());
  const callbackPath = normalizeCallbackPath(Deno.env.get('PAYMENT_CALLBACK_PATH') || '/payment/callback');
  if (!paymentDomain) return json(500, { success: false, message: 'دامنه callback درگاه مرکزی تنظیم نشده است.' });
  const returnOrigin = await getTenantPublicOrigin(urlBase, key, String(profile.org_id || ''))
    || normalizeSafeReturnOrigin(body?.return_origin);
  const [tx] = await rest(urlBase, key, 'payment_transactions', {
    method: 'POST',
    body: JSON.stringify([{
      org_id: profile.org_id,
      created_by: profile.id,
      gateway_scope: 'system',
      provider: 'zarinpal',
      purpose: 'ai_topup',
      module_id: null,
      record_id: null,
      amount: amountIrt,
      currency: 'IRT',
      status: 'pending',
      callback_url: '',
      description: `شارژ اعتبار هوش مصنوعی ${amountIrt.toLocaleString('fa-IR')} تومان`,
      metadata: {
        return_origin: returnOrigin,
        wallet_amount_irt: amountIrt,
        mode,
        source: 'org_ai_settings',
      },
    }]),
  });
  const callbackUrl = `${paymentDomain}${callbackPath}?tx=${enc(tx.id)}`;
  try {
    const zp = await zarinpalRequest(centralMerchantId, mode, {
      amount: amountIrt,
      currency: 'IRT',
      callback_url: callbackUrl,
      description: tx.description,
      metadata: { order_id: tx.id, purpose: 'ai_topup' },
    });
    const data = zp?.data || {};
    const authority = String(data?.authority || '').trim();
    if (Number(data?.code) !== 100 || !authority) throw new Error(zp?.errors?.message || 'درگاه مرکزی درخواست شارژ را نپذیرفت.');
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
      body: JSON.stringify({ status: 'failed', callback_url: callbackUrl, error_message: String(err?.message || err) }),
    }).catch(() => null);
    throw err;
  }
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

  const remainingAmount = Math.max(0, Number(paymentState.amount || invoice.remaining_balance || 0));
  const pendingPaymentRowKey = String(body?.pending_payment_row_key || '').trim();
  const selectedPendingPayment = pendingPaymentRowKey
    ? (Array.isArray(invoice?.payments) ? invoice.payments : []).find((row: any) => {
        const rowKey = String(row?.row_key || row?.payment_id || row?.id || '').trim();
        return rowKey === pendingPaymentRowKey
          && String(row?.status || '').trim().toLowerCase() === 'pending'
          && String(row?.payment_type || '').trim().toLowerCase() === 'online';
      })
    : null;
  if (pendingPaymentRowKey && !selectedPendingPayment) {
    return json(400, { success: false, message: 'ردیف دریافت در انتظار برای این فاکتور معتبر نیست.' });
  }
  const amount = selectedPendingPayment
    ? Math.min(remainingAmount, Math.max(0, Number(selectedPendingPayment?.amount || 0)))
    : remainingAmount;
  if (!Number.isFinite(amount) || amount <= 0) return json(400, { success: false, message: 'مبلغ قابل پرداخت معتبر نیست.' });

  const mode = String(settings.mode || 'production') === 'sandbox' ? 'sandbox' : 'production';
  const currency = normalizeCurrency(settings.currency);
  const paymentDomain = trimSlashEnd(String(settings.payment_domain || ''));
  const callbackPath = normalizeCallbackPath(settings.callback_path);
  const description = String(settings.default_description || '').trim()
    || `پرداخت فاکتور ${invoice.system_code || invoice.name || ''}`.trim()
    || 'پرداخت آنلاین فاکتور';
  // منبع بازگشت باید از تنظیمات سازمان مالک فاکتور تعیین شود، نه دامنه عمومی یا ورودی کاربر.
  const returnOrigin = await getTenantPublicOrigin(
    urlBase,
    key,
    String(invoice.org_id || ''),
    gatewayScope === 'system',
  );
  if (!returnOrigin) {
    return json(503, { success: false, message: 'دامنه اختصاصی این سازمان برای پرداخت آنلاین تنظیم نشده است.' });
  }

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
        pending_payment_row_key: pendingPaymentRowKey || null,
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

  const returnUrl = (nextStatus: string) => buildPaymentReturnUrl(tx, nextStatus);
  const mode = String(tx?.metadata?.mode || 'production') === 'sandbox' ? 'sandbox' : 'production';
  const gatewayScope = normalizeGatewayScope(tx?.gateway_scope);
  const gatewaySettings = tx?.org_id && String(tx?.purpose || '') !== 'ai_topup' ? await getGatewaySettingsForOrg(urlBase, key, tx.org_id) : {};
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

    if (String(tx?.purpose || '') === 'ai_topup') {
      await creditAiWalletFromTransaction(urlBase, key, { ...tx, authority: authority || tx.authority, ref_id: data?.ref_id ? String(data.ref_id) : tx.ref_id });
    } else {
      const previousInvoice = await getInvoiceWorkflowRecord(urlBase, key, tx.record_id);
      const appendResult = await rpc(urlBase, key, 'apply_online_invoice_payment_transaction', {
        p_transaction_id: tx.id,
      });
      await runInvoiceWorkflowEvent(urlBase, key, tx, previousInvoice, appendResult);
    }

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

  const returnUrl = buildPaymentReturnUrl(tx, status === 'OK' ? 'success' : 'failed');
  const mode = String(tx?.metadata?.mode || 'production') === 'sandbox' ? 'sandbox' : 'production';
  const gatewayScope = normalizeGatewayScope(tx?.gateway_scope);
  const gatewaySettings = tx?.org_id && String(tx?.purpose || '') !== 'ai_topup' ? await getGatewaySettingsForOrg(urlBase, key, tx.org_id) : {};
  const resolvedMerchantId = resolveGatewayMerchantId(gatewayScope, gatewaySettings, merchantId);

  if (status !== 'OK') {
    await rest(urlBase, key, `payment_transactions?id=eq.${enc(tx.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled', error_message: 'پرداخت توسط کاربر لغو شد یا ناموفق بود.' }),
    }).catch(() => null);
    return json(200, { success: false, message: 'پرداخت لغو شد یا ناموفق بود.', return_url: buildPaymentReturnUrl(tx, 'cancelled') });
  }
  if (!resolvedMerchantId) {
    await rest(urlBase, key, `payment_transactions?id=eq.${enc(tx.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'failed', error_message: 'Merchant ID درگاه برای تأیید پرداخت تنظیم نشده است.' }),
    }).catch(() => null);
    return json(200, {
      success: false,
      message: 'تنظیمات درگاه کامل نیست.',
      return_url: buildPaymentReturnUrl(tx, 'failed'),
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

    if (String(tx?.purpose || '') === 'ai_topup') {
      await creditAiWalletFromTransaction(urlBase, key, { ...tx, authority: authority || tx.authority, ref_id: data?.ref_id ? String(data.ref_id) : tx.ref_id });
    } else {
      const previousInvoice = await getInvoiceWorkflowRecord(urlBase, key, tx.record_id);
      const appendResult = await rpc(urlBase, key, 'apply_online_invoice_payment_transaction', {
        p_transaction_id: tx.id,
      });
      await runInvoiceWorkflowEvent(urlBase, key, tx, previousInvoice, appendResult);
    }

    return json(200, {
      success: true,
      message: 'پرداخت با موفقیت ثبت شد.',
      return_url: buildPaymentReturnUrl(tx, 'success'),
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
      return_url: buildPaymentReturnUrl(tx, 'failed'),
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
    if (action === 'create_ai_credit_topup') {
      return await createAiCreditTopup(req, urlBase, serviceKey, merchantId, body);
    }
    if (action === 'verify_callback') {
      return await verifyCallbackPayload(urlBase, serviceKey, merchantId, body);
    }
    return json(400, { success: false, message: 'عملیات پرداخت معتبر نیست.' });
  } catch (err: any) {
    return json(500, { success: false, message: String(err?.message || err || 'خطای پرداخت') });
  }
});
