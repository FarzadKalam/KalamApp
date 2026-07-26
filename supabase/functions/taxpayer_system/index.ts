// @ts-nocheck

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FUNCTION_BUILD = 'taxpayer-system-2026-07-26-invoice-submission-validation';
const LEGACY_BASE_URL = 'https://tp.tax.gov.ir/req/api/self-tsp';
const V2_BASE_URL = 'https://tp.tax.gov.ir/requestsmanager';
const TAXPAYER_DAY_MEASURE_UNIT_CODE = '16104';
const TAXPAYER_MAX_INVOICE_AGE_DAYS = 12;

const json = (status: number, payload: Record<string, any>) =>
  new Response(JSON.stringify({ build: FUNCTION_BUILD, ...payload }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Kalam-Function-Build': FUNCTION_BUILD },
  });

const h = (key: string) => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
const first = (value: any) => Array.isArray(value) ? value[0] : value;
const enc = (value: string) => encodeURIComponent(String(value || ''));
const fiscal = (value: string) => String(value || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
const parse = (raw: string) => { try { return raw ? JSON.parse(raw) : null; } catch { return raw || null; } };
const requestMeta = () => ({ requestTraceId: crypto.randomUUID(), timestamp: String(Date.now()) });
const faDigitMap: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};
const numericId = (value: any) => String(value || '').replace(/[۰-۹٠-٩]/g, (digit) => faDigitMap[digit] || digit).replace(/\D/g, '');
const englishDigits = (value: any) => String(value || '').replace(/[۰-۹٠-٩]/g, (digit) => faDigitMap[digit] || digit);
const pad2 = (value: number) => String(value).padStart(2, '0');
const jalaliToGregorian = (jy: number, jm: number, jd: number) => {
  const div = (a: number, b: number) => Math.floor(a / b);
  jy += 1595;
  let days = -355668 + (365 * jy) + (div(jy, 33) * 8) + div(((jy % 33) + 3), 4) + jd;
  days += jm < 7 ? (jm - 1) * 31 : ((jm - 7) * 30) + 186;
  let gy = 400 * div(days, 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * div(--days, 36524);
    days %= 36524;
    if (days >= 365) days += 1;
  }
  gy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    gy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const monthDays = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 1;
  while (gm <= 12 && gd > monthDays[gm]) {
    gd -= monthDays[gm];
    gm += 1;
  }
  return { year: gy, month: gm, day: gd };
};
const normalizeInvoiceDate = (value: any) => {
  const raw = englishDigits(value).trim();
  const dateMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (dateMatch) {
    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    if (year >= 1300 && year <= 1499) {
      const gregorian = jalaliToGregorian(year, month, day);
      return `${gregorian.year}-${pad2(gregorian.month)}-${pad2(gregorian.day)}`;
    }
    if (year >= 1900 && year <= 2200) return `${year}-${pad2(month)}-${pad2(day)}`;
  }
  const normalized = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(raw) ? raw.replace(' ', 'T') : raw;
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  throw new Error('تاریخ فاکتور برای ارسال به سامانه مودیان معتبر نیست.');
};
const normalizeMeasureUnitCode = (value: any) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw.toUpperCase() === 'DAY') return TAXPAYER_DAY_MEASURE_UNIT_CODE;
  return numericId(raw);
};
const isValidIranNationalCode = (value: string) => {
  const code = numericId(value);
  if (!/^\d{10}$/.test(code) || /^(\d)\1{9}$/.test(code)) return false;
  const sum = code.slice(0, 9).split('').reduce((acc, digit, index) => acc + Number(digit) * (10 - index), 0);
  const remainder = sum % 11;
  const checkDigit = Number(code[9]);
  return remainder < 2 ? checkDigit === remainder : checkDigit === 11 - remainder;
};
const normalizeBuyerIdentity = (customer: any) => {
  const buyerType = String(customer?.person_type || 'real') === 'legal' ? 2 : 1;
  const economicCode = numericId(customer?.economic_code || '');
  if (buyerType === 2) {
    if (!/^\d{11}$/.test(economicCode)) {
      throw new Error('برای خریدار حقوقی، شماره اقتصادی ۱۱ رقمی و ثبت‌شده در سامانه مودیان الزامی است.');
    }
    return { buyerType, buyerId: null, buyerEconomicCode: economicCode, buyerPostalCode: null, nationalCodeInvalid: false };
  }
  if (economicCode) {
    if (!/^\d{14}$/.test(economicCode)) {
      throw new Error('شماره اقتصادی خریدار حقیقی باید ۱۴ رقم باشد.');
    }
    return { buyerType, buyerId: null, buyerEconomicCode: economicCode, buyerPostalCode: null, nationalCodeInvalid: false };
  }
  const rawNationalCode = numericId(customer?.national_code || customer?.national_id || '');
  if (!rawNationalCode) return { buyerType, buyerId: null, buyerEconomicCode: null, buyerPostalCode: null, nationalCodeInvalid: false };
  const nationalCode = rawNationalCode.length >= 8 && rawNationalCode.length < 10
    ? rawNationalCode.padStart(10, '0')
    : rawNationalCode;
  if (!/^\d{10}$/.test(nationalCode)) throw new Error('کد ملی خریدار حقیقی باید ۱۰ رقم باشد.');
  if (!isValidIranNationalCode(nationalCode)) return { buyerType, buyerId: null, buyerEconomicCode: null, buyerPostalCode: null, nationalCodeInvalid: true };
  const postalCode = numericId(customer?.postal_code || '');
  if (!/^\d{10}$/.test(postalCode)) {
    throw new Error('برای خریدار حقیقیِ فاقد شماره اقتصادی، کد پستی ۱۰ رقمی الزامی است.');
  }
  return { buyerType, buyerId: nationalCode, buyerEconomicCode: null, buyerPostalCode: postalCode, nationalCodeInvalid: false };
};

const bytesToBinary = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return binary;
};
const b64 = (bytes: Uint8Array) => btoa(bytesToBinary(bytes));
const b64url = (bytes: Uint8Array | string) => {
  const raw = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  return b64(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};
const unb64 = (value: string) => {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
};
const hex = (bytes: Uint8Array) => Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
const sha256Hex = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')))));
const nowSigT = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

const taxErrorMessage = (value: any) => {
  const payload = typeof value === 'string' ? parse(value) : value;
  const errors = Array.isArray(payload?.errors) ? payload.errors : Array.isArray(payload?.result?.errors) ? payload.result.errors : [];
  if (errors.length) {
    return errors.map((item: any) => `${item?.code ? `[${item.code}] ` : ''}${String(item?.message || '').trim()}`.trim()).filter(Boolean).join(' | ');
  }
  const resultRow = Array.isArray(payload?.result?.data)
    ? payload.result.data[0]
    : Array.isArray(payload?.result)
      ? payload.result[0]
      : null;
  if (resultRow?.errorCode || resultRow?.errorMessage || resultRow?.errorDetail) {
    return [resultRow?.errorCode, resultRow?.errorMessage || resultRow?.errorDetail].filter(Boolean).join(' - ');
  }
  if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message.trim();
  if (typeof value === 'string' && value.trim()) return value.trim();
  return payload ? JSON.stringify(payload) : 'درخواست به سامانه مودیان ناموفق بود.';
};
const taxpayerMessageItems = (items: any, prefix = '') => {
  const list = Array.isArray(items) ? items : [];
  return list
    .map((item: any) => `${item?.code ? `[${item.code}] ` : ''}${prefix}${String(item?.message || item?.errorDetail || item?.errorMessage || '').trim()}`.trim())
    .filter(Boolean);
};
const inquiryRowMessage = (row: any) => {
  const data = row?.data || row?.result || row;
  const messages = [
    ...taxpayerMessageItems(data?.error),
    ...taxpayerMessageItems(data?.errors),
    ...taxpayerMessageItems(data?.warning, 'هشدار: '),
    ...taxpayerMessageItems(data?.warnings, 'هشدار: '),
  ];
  if (row?.errorCode || row?.errorMessage || row?.errorDetail) {
    messages.push([row?.errorCode, row?.errorMessage || row?.errorDetail].filter(Boolean).join(' - '));
  }
  if (data?.message) messages.push(String(data.message).trim());
  return Array.from(new Set(messages.filter(Boolean))).join(' | ');
};
const hasInquiryWarnings = (row: any) => {
  const data = row?.data || row?.result || row;
  return taxpayerMessageItems(data?.warning).length > 0 || taxpayerMessageItems(data?.warnings).length > 0;
};
const normalizeInquiryStatus = (row: any) => {
  const status = String(row?.status || row?.invoiceStatus || row?.processingStatus || row?.state || '').trim();
  if (!status) return 'inquired';
  const lower = status.toLowerCase();
  if (['failed', 'failure', 'rejected', 'reject'].includes(lower)) return lower === 'rejected' || lower === 'reject' ? 'rejected' : 'failed';
  if (['success', 'succeeded', 'accepted', 'accept'].includes(lower)) {
    if (hasInquiryWarnings(row)) return 'accepted_with_warnings';
    return lower === 'success' || lower === 'succeeded' ? 'success' : 'accepted';
  }
  return lower;
};
const readTaxResponse = async (response: Response) => {
  const raw = await response.text();
  const parsed = parse(raw);
  if (!response.ok) throw new Error(taxErrorMessage(parsed || raw) || `HTTP ${response.status}`);
  return parsed;
};

const secretKey = async () => {
  const secret = String(Deno.env.get('TAXPAYER_SECRET_ENCRYPTION_KEY') || '').trim();
  if (!secret) throw new Error('کلید رمزنگاری سامانه مودیان در تنظیمات سرور ثبت نشده است.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};
const encryptSecret = async (plain: string) => {
  if (!String(plain || '').trim()) return '';
  const key = await secretKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
  return `v1:${b64(iv)}:${b64(cipher)}`;
};
const decryptSecret = async (encrypted: string) => {
  const [v, iv, cipher] = String(encrypted || '').split(':');
  if (v !== 'v1' || !iv || !cipher) throw new Error('فرمت کلید خصوصی ذخیره‌شده معتبر نیست.');
  const key = await secretKey();
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(cipher));
  return new TextDecoder().decode(plain);
};

const pemBody = (pem: string, label: string) => {
  const raw = String(pem || '').replace(/\r/g, '').trim();
  const match = raw.match(new RegExp(`-----BEGIN ${label}-----([\\s\\S]+?)-----END ${label}-----`, 'i'));
  return (match?.[1] || raw).replace(/\s+/g, '');
};
const pemToDer = (pem: string, label: string) => unb64(pemBody(pem, label)).buffer;
const importPrivateKey = (privateKeyPem: string) => {
  if (/BEGIN RSA PRIVATE KEY/i.test(privateKeyPem)) throw new Error('فرمت کلید خصوصی باید PKCS#8 باشد. مقدار Raw/Base64 یا BEGIN PRIVATE KEY قابل قبول است، اما BEGIN RSA PRIVATE KEY پشتیبانی نمی‌شود.');
  return crypto.subtle.importKey('pkcs8', pemToDer(privateKeyPem, 'PRIVATE KEY'), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
};
const signText = async (privateKeyPem: string, text: string) => {
  const key = await importPrivateKey(privateKeyPem);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(String(text || '')));
  return b64(new Uint8Array(sig));
};
const signTextB64Url = async (privateKeyPem: string, text: string) => {
  const key = await importPrivateKey(privateKeyPem);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(String(text || '')));
  return b64url(new Uint8Array(sig));
};

const d = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0],[9,8,7,6,5,4,3,2,1,0]];
const p = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
const inv = [0,4,3,2,1,5,6,7,8,9];
const check = (input: string) => {
  const digits = String(input || '').trim();
  if (!/^\d+$/.test(digits)) throw new Error('ورودی ساخت رقم کنترل شماره مالیاتی معتبر نیست.');
  let c = 0;
  digits.split('').reverse().forEach((ch, i) => { c = d[c][p[(i + 1) % 8][Number(ch)]]; });
  return inv[c];
};
const epochDays = (date: string) => {
  const [y,m,day] = normalizeInvoiceDate(date).split('-').map(Number);
  const days = Math.floor((Date.UTC(y,m-1,day)-Date.UTC(1970,0,1))/86400000);
  if (!Number.isFinite(days) || days < 0) throw new Error('تاریخ فاکتور برای ارسال به سامانه مودیان معتبر نیست.');
  return days;
};
const taxId = (fid: string, date: string, serial: bigint) => {
  const f = fiscal(fid); if (f.length !== 6) throw new Error('شناسه یکتای حافظه مالیاتی باید دقیقا ۶ کاراکتر باشد.');
  const days = epochDays(date);
  const fInput = f.split('').map((ch) => /^\d$/.test(ch) ? ch : String(ch.charCodeAt(0))).join('');
  const input = `${fInput}${String(days).padStart(6,'0')}${String(serial).padStart(12,'0')}`;
  return `${f}${days.toString(16).toUpperCase().padStart(5,'0')}${serial.toString(16).toUpperCase().padStart(10,'0')}${check(input)}`;
};

const rial = (value: any, currency: string) => {
  const n = Number(value || 0); if (!Number.isFinite(n)) return 0;
  const c = String(currency || 'IRT').toUpperCase();
  if (c === 'IRT') return Math.round(n * 10);
  if (c === 'IRR') return Math.round(n);
  throw new Error('برای فاکتورهای سامانه مودیان فقط واحد پولی ریال یا تومان پشتیبانی می‌شود.');
};
const setm = (value: string) => value === 'cash' ? 1 : value === 'credit' ? 2 : value === 'mixed' ? 3 : (() => { throw new Error('برای ارسال فاکتور به سامانه مودیان، انتخاب روش تسویه الزامی است.'); })();
const CASH_RECEIPT_TYPES = new Set(['cash', 'bank', 'card', 'pos', 'transfer', 'online']);
const VOID_RECEIPT_STATUSES = new Set(['returned', 'canceled']);
const SETTLED_RECEIPT_STATUSES = new Set(['received', 'approved']);
const computeSettlement = (receipts: any[], currency: string) => {
  if (!Array.isArray(receipts) || !receipts.length) return { setm: 'credit', cashAmount: 0, creditAmount: 0 };
  let cashAmount = 0, creditAmount = 0;
  for (const r of receipts) {
    if (VOID_RECEIPT_STATUSES.has(String(r.status || ''))) continue;
    if (String(r.payment_type || '') === 'barter') continue;
    const amount = rial(Number(r.amount || 0), currency);
    const isSettledCash = CASH_RECEIPT_TYPES.has(String(r.payment_type || '')) && SETTLED_RECEIPT_STATUSES.has(String(r.status || ''));
    if (isSettledCash) { cashAmount += amount; } else { creditAmount += amount; }
  }
  if (cashAmount > 0 && creditAmount > 0) return { setm: 'mixed', cashAmount, creditAmount };
  if (cashAmount > 0) return { setm: 'cash', cashAmount, creditAmount: 0 };
  return { setm: 'credit', cashAmount: 0, creditAmount };
};
const rowAmounts = (row: any) => {
  const q = Number(row?.quantity || 0), price = Number(row?.unit_price || 0), base = q * price, di = Number(row?.discount || 0), vi = Number(row?.vat || 0);
  const dis = String(row?.discount_type || 'amount') === 'percent' ? base * di / 100 : di;
  const after = Math.max(0, base - dis);
  const vat = String(row?.vat_type || 'percent') === 'percent' ? after * vi / 100 : vi;
  return { base, dis, after, vat, total: after + vat, vatRate: String(row?.vat_type || 'percent') === 'percent' ? vi : 0 };
};
const parseLegacySerial = (value: any) => {
  const input = String(value || '').trim().toUpperCase(); if (!input) return 0;
  if (/^[0-9]+$/.test(input)) return Number(input);
  const normalized = input.replace(/[^0-9A-Z]/g, '');
  const serialHex = normalized.length === 22 ? normalized.slice(11, 21) : normalized;
  if (/^[0-9A-F]{1,10}$/.test(serialHex)) return Number.parseInt(serialHex, 16);
  throw new Error('سریال قبلی باید به‌صورت عدد ده‌دهی، بخش هگز ۱۰ کاراکتری سریال، یا شناسه مالیاتی کامل ۲۲ کاراکتری وارد شود.');
};

const select = async (urlBase: string, key: string, table: string, params: Record<string,string>) => {
  const url = new URL(`${urlBase.replace(/\/+$/,'')}/rest/v1/${table}`);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k,v));
  const res = await fetch(url, { headers: h(key) });
  const raw = await res.text(); if (!res.ok) throw new Error(raw || `خواندن اطلاعات از جدول ${table} ناموفق بود.`);
  return raw ? JSON.parse(raw) : [];
};
const insert = async (urlBase: string, key: string, table: string, rows: any[]) => {
  const res = await fetch(`${urlBase.replace(/\/+$/,'')}/rest/v1/${table}`, { method: 'POST', headers: { ...h(key), Prefer: 'return=representation' }, body: JSON.stringify(rows) });
  const raw = await res.text(); if (!res.ok) throw new Error(raw || `ثبت اطلاعات در جدول ${table} ناموفق بود.`);
  return raw ? JSON.parse(raw) : [];
};
const patch = async (urlBase: string, key: string, table: string, id: string, body: any) => {
  const url = new URL(`${urlBase.replace(/\/+$/,'')}/rest/v1/${table}`); url.searchParams.set('id', `eq.${id}`);
  const res = await fetch(url, { method: 'PATCH', headers: { ...h(key), Prefer: 'return=representation' }, body: JSON.stringify(body) });
  const raw = await res.text(); if (!res.ok) throw new Error(raw || `به‌روزرسانی اطلاعات در جدول ${table} ناموفق بود.`);
  return raw ? JSON.parse(raw) : [];
};
const rpc = async (urlBase: string, key: string, fn: string, body: any) => {
  const res = await fetch(`${urlBase.replace(/\/+$/,'')}/rest/v1/rpc/${fn}`, { method: 'POST', headers: h(key), body: JSON.stringify(body) });
  const raw = await res.text(); if (!res.ok) throw new Error(raw || `اجرای تابع ${fn} ناموفق بود.`);
  return raw ? JSON.parse(raw) : null;
};
const upsertSettings = async (urlBase: string, key: string, row: any) => {
  const res = await fetch(`${urlBase.replace(/\/+$/,'')}/rest/v1/taxpayer_settings?on_conflict=org_id`, { method: 'POST', headers: { ...h(key), Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify([row]) });
  const raw = await res.text(); if (!res.ok) throw new Error(raw || 'ذخیره تنظیمات سامانه مودیان ناموفق بود.');
  return first(raw ? JSON.parse(raw) : null);
};

const verifyUser = async (urlBase: string, key: string, token: string) => {
  const res = await fetch(`${urlBase.replace(/\/+$/,'')}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('نشست شما معتبر نیست. دوباره وارد حساب کاربری شوید.');
  const user = await res.json();
  const profile = first(await select(urlBase, key, 'profiles', { id: `eq.${user.id}`, select: 'id,org_id', limit: '1' }));
  return { ...user, org_id: profile?.org_id || null };
};
const settingsRow = async (urlBase: string, key: string, orgId: string) => first(await select(urlBase, key, 'taxpayer_settings', { org_id: `eq.${orgId}`, select: '*', limit: '1' })) || null;
const companyRow = async (urlBase: string, key: string, orgId: string) => first(await select(urlBase, key, 'company_settings', { org_id: `eq.${orgId}`, select: '*', order: 'updated_at.desc', limit: '1' })) || null;
const modeOf = (settings: any) => {
  if (!settings) return 'certificate_v2';
  const saved = String(settings?.integration_mode || '').trim();
  if (saved === 'certificate_v2' || saved === 'no_certificate_legacy') return saved;
  return 'certificate_v2';
};
const baseUrlForMode = (mode: string, value?: string) => {
  const input = String(value || '').trim();
  if (input) return input;
  return mode === 'certificate_v2' ? V2_BASE_URL : LEGACY_BASE_URL;
};
const sanitized = (s: any, c: any) => {
  const mode = modeOf(s);
  return {
    provider: s?.provider || 'self_tsp',
    integration_mode: mode,
    base_url: baseUrlForMode(mode, s?.base_url),
    fiscal_id: s?.fiscal_id || '',
    company_economic_code: c?.economic_code || c?.national_id || '',
    legacy_last_serial: Number(s?.legacy_last_serial || 0) || 0,
    server_information: s?.server_information || {},
    is_active: s?.is_active === true,
    has_private_key: !!s?.private_key_encrypted,
    has_certificate: !!String(s?.certificate_pem || '').trim(),
  };
};

const flattenSignatureEntries = (target: Record<string, any>, value: any, prefix = '') => {
  if (Array.isArray(value)) { value.forEach((item, index) => flattenSignatureEntries(target, item, prefix ? `${prefix}.E${index}` : `E${index}`)); return; }
  if (value && typeof value === 'object') { Object.keys(value).forEach((key) => flattenSignatureEntries(target, value[key], prefix ? `${prefix}.${key}` : key)); return; }
  if (prefix) target[prefix] = value;
};
const normalizeLegacyValue = (data: any, headers?: Record<string,string> | null): string => {
  const source: Record<string, any> = {};
  if (data !== null && data !== undefined) {
    if (Array.isArray(data)) source.packets = data;
    else Object.assign(source, typeof data === 'object' ? data : { value: data });
  }
  Object.entries(headers || {}).forEach(([key, value]) => {
    source[key] = key === 'Authorization' && value && value.length > 7 ? value.slice(7) : value;
  });
  const flattened: Record<string, any> = {};
  flattenSignatureEntries(flattened, source);
  return Object.keys(flattened).sort((a,b) => a.localeCompare(b, 'en')).map((key) => {
    const value = flattened[key];
    if (value === null || value === undefined || String(value) === '') return '#';
    return String(value).replace(/#/g, '##');
  }).join('#');
};
const withoutNullSignatureKeyId = (packet: any) => {
  if (packet?.signatureKeyId === null || packet?.signatureKeyId === undefined || packet?.signatureKeyId === '') {
    const { signatureKeyId: _signatureKeyId, ...rest } = packet;
    return rest;
  }
  return packet;
};
const taxHeadersLegacy = (headers: Record<string,string>, token?: string) => ({
  'Content-Type': 'application/json',
  ...headers,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});
const legacyPost = async (settings: any, path: string, body: any, headers: Record<string,string>, token?: string) =>
  readTaxResponse(await fetch(`${String(settings?.base_url || LEGACY_BASE_URL).replace(/\/+$/,'')}${path}`, { method: 'POST', headers: taxHeadersLegacy(headers, token), body: JSON.stringify(body) }));

const buildLegacyPacket = (args: { packetType: string; data?: any; uid?: string | null; retry?: boolean; encryptionKeyId?: string; symmetricKey?: string; iv?: string; fiscalId?: string; dataSignature?: string; signatureKeyId?: string | null; }) => ({
  uid: args.uid ?? crypto.randomUUID(),
  packetType: args.packetType,
  retry: args.retry === true,
  data: args.data ?? null,
  encryptionKeyId: args.encryptionKeyId || '',
  symmetricKey: args.symmetricKey || '',
  iv: args.iv || '',
  fiscalId: args.fiscalId || '',
  dataSignature: args.dataSignature || '',
  ...(args.signatureKeyId ? { signatureKeyId: args.signatureKeyId } : {}),
});
const legacyRequestHeaders = (meta = requestMeta()) => ({ requestTraceId: meta.requestTraceId, timestamp: meta.timestamp });
const signLegacyPacketData = async (settings: any, privateKey: string, packet: any) => {
  const signatureKeyId = String(settings?.signature_key_id || '').trim();
  packet.dataSignature = await signText(privateKey, normalizeLegacyValue(packet.data, null));
  if (signatureKeyId) packet.signatureKeyId = signatureKeyId;
  return packet;
};
const xorTrim = (payload: Uint8Array, key: Uint8Array) => {
  const result = new Uint8Array(payload.length);
  for (let index = 0; index < payload.length; index += 1) result[index] = payload[index] ^ key[index % key.length];
  let length = result.length;
  while (length > 0 && result[length - 1] === 0) length -= 1;
  return result.slice(0, length);
};
const importServerPublicKey = async (value: string, hash = 'SHA-256') => {
  const keyData = /BEGIN PUBLIC KEY/i.test(value) ? pemToDer(value, 'PUBLIC KEY') : unb64(value).buffer;
  return crypto.subtle.importKey('spki', keyData, { name: 'RSA-OAEP', hash }, false, ['encrypt']);
};
const serverKeyInfo = (info: any) => {
  const keys = info?.result?.data?.publicKeys || info?.data?.publicKeys || info?.publicKeys || [];
  if (Array.isArray(keys) && keys.length) {
    const selected = keys.find((item: any) => Number(item?.purpose || 0) === 1) || keys.find((item: any) => String(item?.algorithm || '').toUpperCase().includes('RSA')) || keys[0];
    return { id: String(selected?.id || selected?.keyId || '').trim(), key: String(selected?.key || selected?.publicKey || '').trim() };
  }
  return { id: String(info?.result?.data?.encryptionKeyId || info?.encryptionKeyId || '').trim(), key: String(info?.publicKey || info?.public_key || info?.serverPublicKey || info?.data?.publicKey || info?.result?.publicKey || info?.result?.data?.publicKey || '').trim() };
};
const serverKey = (info: any) => serverKeyInfo(info).key;
const encryptLegacyPacket = async (settings: any, packet: any) => {
  const keyInfo = serverKeyInfo(settings.server_information || {});
  if (!keyInfo.key) throw new Error('کلید عمومی سرور در پاسخ اطلاعات سرور سامانه مودیان دریافت نشد.');
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const aesKey = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const plainBytes = new TextEncoder().encode(typeof packet.data === 'string' ? packet.data : JSON.stringify(packet.data));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, aesKey, xorTrim(plainBytes, rawKey)));
  const publicKey = await importServerPublicKey(keyInfo.key, 'SHA-256');
  const encryptedKey = new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, new TextEncoder().encode(hex(rawKey))));
  return { ...packet, data: b64(cipher), encryptionKeyId: keyInfo.id, symmetricKey: b64(encryptedKey), iv: hex(iv) };
};
const invokeLegacySync = async (settings: any, privateKey: string, packetType: string, data: any, token?: string, options: any = {}) => {
  const meta = requestMeta();
  const headers = legacyRequestHeaders(meta);
  const packet = buildLegacyPacket({ packetType, data, fiscalId: options.fiscalId || settings.fiscal_id, uid: options.uid || meta.requestTraceId });
  const signature = await signText(privateKey, normalizeLegacyValue(withoutNullSignatureKeyId(packet), token ? { ...headers, Authorization: `Bearer ${token}` } : headers));
  const body = { signature, ...(settings?.signature_key_id ? { signatureKeyId: settings.signature_key_id } : {}), packet };
  return legacyPost(settings, `/sync/${packetType.toUpperCase()}`, body, headers, token);
};
const invokeLegacyGetServerInformation = async (settings: any, privateKey: string) => invokeLegacySync(settings, privateKey, 'GET_SERVER_INFORMATION', null);
const getLegacyToken = async (settings: any, privateKey: string) => {
  const tokenRes = await invokeLegacySync(settings, privateKey, 'GET_TOKEN', { username: settings.fiscal_id });
  const token = String(tokenRes?.result?.data?.token || tokenRes?.data?.token || tokenRes?.result?.token || tokenRes?.token || tokenRes?.access_token || '').trim();
  if (!token) throw new Error('توکن دسترسی سامانه مودیان دریافت نشد.');
  return { token };
};
const buildLegacyEncryptedInvoicePacket = async (settings: any, privateKey: string, payload: any, uid: string) => {
  let packet = buildLegacyPacket({ uid, packetType: payload.packetType, data: payload.data, fiscalId: settings.fiscal_id });
  packet = await signLegacyPacketData(settings, privateKey, packet);
  packet = await encryptLegacyPacket(settings, packet);
  return {
    packet,
    debug: {
      protocol: 'no_certificate_legacy',
      packet_uid: uid,
      data_signature_input_sha256: await sha256Hex(normalizeLegacyValue(payload.data, null)),
      canonical_data_sha256: await sha256Hex(JSON.stringify(payload.data)),
      encryption_key_id: packet.encryptionKeyId,
    },
  };
};
const invokeLegacyAsyncEnqueue = async (settings: any, privateKey: string, packet: any, token: string, meta = requestMeta()) => {
  const headers = legacyRequestHeaders(meta);
  const authHeaders = { ...headers, Authorization: `Bearer ${token}` };
  const packetForSign = withoutNullSignatureKeyId(packet);
  const signatureInput = normalizeLegacyValue([packetForSign], authHeaders);
  const signature = await signText(privateKey, signatureInput);
  const body = { signature, ...(settings?.signature_key_id ? { signatureKeyId: settings.signature_key_id } : {}), packets: [packet] };
  const debug = { protocol: 'no_certificate_legacy', async_signature_input_sha256: await sha256Hex(signatureInput), request_trace_id: meta.requestTraceId, timestamp: meta.timestamp, packet_uid: packet.uid || null };
  try {
    return { response: await legacyPost(settings, '/async/normal-enqueue', body, headers, token), debug };
  } catch (error) {
    if (error && typeof error === 'object') error.kalamDebug = debug;
    throw error;
  }
};

const v2Url = (settings: any, path: string) => `${String(settings?.base_url || V2_BASE_URL).replace(/\/+$/,'')}/api/v2/${path.replace(/^\/+/, '')}`;
const createJws = async (privateKey: string, payload: any, certificatePem?: string) => {
  const header: Record<string, any> = { alg: 'RS256', sigT: nowSigT(), typ: 'jose', crit: ['sigT'], cty: 'text/plain' };
  if (String(certificatePem || '').trim()) header.x5c = [pemBody(certificatePem, 'CERTIFICATE')];
  const payloadText = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(payloadText)}`;
  return `${signingInput}.${await signTextB64Url(privateKey, signingInput)}`;
};
const getV2Authorization = async (settings: any, privateKey: string, certificatePem: string) => {
  const nonce = await readTaxResponse(await fetch(v2Url(settings, 'nonce')));
  const nonceValue = String(nonce?.nonce || nonce?.data?.nonce || nonce?.result?.nonce || nonce?.result?.data?.nonce || '').trim();
  if (!nonceValue) throw new Error('پاسخ nonce سامانه مودیان معتبر نبود.');
  const jws = await createJws(privateKey, { nonce: nonceValue, clientId: settings.fiscal_id }, certificatePem);
  return `Bearer ${jws}`;
};
const v2Request = async (settings: any, privateKey: string, certificatePem: string, method: string, path: string, body?: any) => {
  const authorization = await getV2Authorization(settings, privateKey, certificatePem);
  return readTaxResponse(await fetch(v2Url(settings, path), {
    method,
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: authorization },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
};
const invokeV2GetServerInformation = (settings: any, privateKey: string, certificatePem: string) => v2Request(settings, privateKey, certificatePem, 'GET', 'server-information');
const createJwe = async (settings: any, payload: string) => {
  const keyInfo = serverKeyInfo(settings.server_information || {});
  if (!keyInfo.key) throw new Error('کلید عمومی سرور در پاسخ server-information نسخه ۲ سامانه مودیان دریافت نشد.');
  const protectedHeader = b64url(JSON.stringify({ alg: 'RSA-OAEP-256', enc: 'A256GCM', kid: keyInfo.id }));
  const cek = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const publicKey = await importServerPublicKey(keyInfo.key, 'SHA-256');
  const encryptedKey = new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, cek));
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const cipherWithTag = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128, additionalData: new TextEncoder().encode(protectedHeader) }, aesKey, new TextEncoder().encode(payload)));
  const cipher = cipherWithTag.slice(0, -16);
  const tag = cipherWithTag.slice(-16);
  return `${protectedHeader}.${b64url(encryptedKey)}.${b64url(iv)}.${b64url(cipher)}.${b64url(tag)}`;
};
const buildV2InvoicePacket = async (settings: any, privateKey: string, certificatePem: string, payload: any, uid: string) => {
  const invoiceJson = JSON.stringify(payload.data);
  const signedPayload = await createJws(privateKey, invoiceJson, certificatePem);
  const encryptedPayload = await createJwe(settings, signedPayload);
  return {
    packet: { payload: encryptedPayload, header: { requestTraceId: uid, fiscalId: settings.fiscal_id } },
    debug: {
      protocol: 'certificate_v2',
      packet_uid: uid,
      invoice_payload_sha256: await sha256Hex(invoiceJson),
      signed_payload_sha256: await sha256Hex(signedPayload),
      encryption_key_id: serverKeyInfo(settings.server_information || {}).id,
    },
  };
};
const invokeV2Invoice = async (settings: any, privateKey: string, certificatePem: string, packet: any) => {
  const response = await v2Request(settings, privateKey, certificatePem, 'POST', 'invoice', [packet]);
  return { response, debug: { protocol: 'certificate_v2', packet_uid: packet?.header?.requestTraceId || null } };
};
const asyncResultRow = (response: any) =>
  first(response?.result?.data) || first(response?.data) || first(response?.result) || response || null;

const requireSettings = async (urlBase: string, key: string, orgId: string) => {
  const [s, c] = await Promise.all([settingsRow(urlBase, key, orgId), companyRow(urlBase, key, orgId)]);
  if (!s?.is_active) throw new Error('اتصال سامانه مودیان غیرفعال است.');
  const seller = String(c?.economic_code || c?.national_id || '').trim();
  if (!seller) throw new Error('کد اقتصادی فروشنده در تنظیمات شرکت ثبت نشده است.');
  if (!s?.private_key_encrypted) throw new Error('کلید خصوصی سامانه مودیان ذخیره نشده است.');
  const mode = modeOf(s);
  if (fiscal(s.fiscal_id).length !== 6) throw new Error('شناسه یکتای حافظه مالیاتی باید دقیقا ۶ کاراکتر باشد.');
  if (mode === 'certificate_v2' && !String(s?.certificate_pem || '').trim()) throw new Error('برای مسیر نسخه ۲ سامانه مودیان، گواهی امضا الزامی است.');
  return {
    settings: { ...s, integration_mode: mode, fiscal_id: fiscal(s.fiscal_id), seller_economic_code: seller, base_url: baseUrlForMode(mode, s.base_url), legacy_last_serial: Number(s?.legacy_last_serial || 0) || 0 },
    company: c,
    privateKey: await decryptSecret(s.private_key_encrypted),
    certificatePem: String(s?.certificate_pem || '').trim(),
  };
};

const invoiceBundle = async (urlBase: string, key: string, orgId: string, invoiceId: string) => {
  const invoice = first(await select(urlBase, key, 'invoices', { id: `eq.${invoiceId}`, org_id: `eq.${orgId}`, select: '*', limit: '1' }));
  if (!invoice?.id) throw new Error('فاکتور فروش پیدا نشد.');
  const customer = invoice.customer_id
    ? first(await select(urlBase, key, 'customers', {
        id: `eq.${invoice.customer_id}`,
        org_id: `eq.${orgId}`,
        select: '*',
        limit: '1',
      }))
    : null;
  const ids = Array.from(new Set((Array.isArray(invoice.invoiceItems) ? invoice.invoiceItems : []).map((x: any) => String(x?.product_id || '').trim()).filter(Boolean)));
  let products: Record<string,any> = {};
  let billboards: Record<string,any> = {};
  if (ids.length) {
    const [productRows, billboardRows] = await Promise.all([
      select(urlBase, key, 'products', { id: `in.(${ids.map(enc).join(',')})`, select: 'id,name,product_identifier,main_unit,taxpayer_measure_unit_code,vat_percentage,is_vat_exempt' }),
      select(urlBase, key, 'billboards', { id: `in.(${ids.map(enc).join(',')})`, select: 'id,name,address,product_identifier,taxpayer_measure_unit_code' }),
    ]);
    products = productRows.reduce((acc: any, p: any) => ({ ...acc, [String(p.id)]: p }), {});
    billboards = billboardRows.reduce((acc: any, b: any) => ({ ...acc, [String(b.id)]: b }), {});
  }
  const receipts = await select(urlBase, key, 'cash_bank_operations', {
    sales_invoice_id: `eq.${invoiceId}`,
    operation_type: 'eq.receipt',
    status: 'not.in.(returned,canceled)',
    select: 'id,amount,payment_type,status',
  });
  let originalTaxid: string | null = null;
  const invoiceSubject = Number(invoice.taxpayer_invoice_subject || 1);
  const referenceInvoiceId = invoice.source_invoice_id
    ? String(invoice.source_invoice_id)
    : [2, 3].includes(invoiceSubject)
      ? invoiceId
      : '';
  if (referenceInvoiceId) {
    const subs = await select(urlBase, key, 'taxpayer_invoice_submissions', {
      invoice_id: `eq.${referenceInvoiceId}`,
      select: 'taxid,status,invoice_subject',
      order: 'created_at.desc',
      limit: '10',
    });
    const valid = subs.filter((s: any) => {
      const taxid = String(s?.taxid || '').trim();
      const status = String(s?.status || '').trim().toLowerCase();
      return !!taxid && !['failed', 'rejected', 'sending'].includes(status);
    });
    const best = valid.find((s: any) => String(s?.invoice_subject || '1') === '1') || valid[0] || subs.find((s: any) => s.taxid);
    originalTaxid = best?.taxid || null;
  }
  return { invoice, customer, products, billboards, receipts: Array.isArray(receipts) ? receipts : [], originalTaxid };
};
const invoicePayload = (args: any) => {
  const { invoice, customer, products, billboards, company, settings, txid, serial, settlement, cashOverride, originalTaxid } = args;
  const invDate = normalizeInvoiceDate(invoice.invoice_date);
  const invoiceAgeDays = Math.floor((Date.now() - new Date(`${invDate}T23:59:59.999Z`).getTime()) / 86400000);
  if (invoiceAgeDays > TAXPAYER_MAX_INVOICE_AGE_DAYS) {
    throw new Error(`تاریخ صدور این فاکتور از مهلت ${TAXPAYER_MAX_INVOICE_AGE_DAYS} روزه ارسال به سامانه مودیان گذشته است. تاریخ واقعی صورتحساب را بررسی و در صورت مجاز بودن اصلاح کنید.`);
  }
  const items = Array.isArray(invoice.invoiceItems) ? invoice.invoiceItems : [];
  if (!items.length) throw new Error('فاکتور هیچ ردیفی برای ارسال به سامانه مودیان ندارد.');
  const currency = String(company?.currency_code || 'IRT');
  const settlementCode = setm(settlement);
  if (!customer?.id) throw new Error('اطلاعات هویتی مشتری برای ارسال به سامانه مودیان کامل نیست.');
  const { buyerType, buyerId, buyerEconomicCode, buyerPostalCode, nationalCodeInvalid } = normalizeBuyerIdentity(customer);
  if (!buyerId && !buyerEconomicCode) throw new Error(nationalCodeInvalid ? 'کد ملی خریدار معتبر نیست و شماره اقتصادی نیز ثبت نشده است. برای ارسال فاکتور، یکی از این دو الزامی است.' : 'مشتری باید کد ملی معتبر یا شماره اقتصادی داشته باشد تا فاکتور به سامانه مودیان ارسال شود.');
  const inp = Number(invoice.taxpayer_invoice_pattern || 1);
  const ins = Number(invoice.taxpayer_invoice_subject || 1);
  const irtaxid = [2, 3, 4].includes(ins) ? (originalTaxid || null) : null;
  if ([2, 3, 4].includes(ins) && !irtaxid) {
    const subjectLabel = ins === 2 ? 'اصلاحی' : ins === 3 ? 'ابطالی' : 'برگشت از فروش';
    throw new Error(`برای ارسال صورتحساب ${subjectLabel} به سامانه مودیان، شماره مالیاتی صورتحساب مرجع (irtaxid) الزامی است. مطمئن شوید صورتحساب مرجع قبلاً به سامانه مودیان ارسال شده است.`);
  }
  let preTbill = 0;
  for (const it of items) { preTbill += rial(rowAmounts(it).total, currency); }
  const receivedBase = cashOverride !== null && cashOverride !== undefined ? cashOverride : rial(invoice.total_received_amount || 0, currency);
  const cap = settlementCode === 3 ? Math.min(Math.max(receivedBase, 0), preTbill) : null;
  const insp = settlementCode === 2 ? preTbill : settlementCode === 3 ? Math.max(preTbill - (cap || 0), 0) : null;
  let tprdis=0, tdis=0, tadis=0, tvam=0, tbill=0;
  const body = items.map((item: any, i: number) => {
    const itemId = String(item?.product_id || '').trim();
    const product = products[itemId] || {};
    const billboard = billboards[itemId] || {};
    const sourceRecord = product?.id ? product : billboard;
    const sstid = String(sourceRecord?.product_identifier || '').trim();
    if (!sstid) throw new Error(`شناسه کالا/خدمت در ردیف ${i + 1} فاکتور ثبت نشده است.`);
    const fallbackMeasureUnitCode = billboard?.id ? TAXPAYER_DAY_MEASURE_UNIT_CODE : sourceRecord?.taxpayer_measure_unit_code;
    const mu = normalizeMeasureUnitCode(item?.measure_unit_code ?? item?.mu ?? fallbackMeasureUnitCode);
    if (!mu) throw new Error(`کد واحد اندازه‌گیری مودیان در ردیف ${i + 1} فاکتور ثبت نشده است.`);
    const qty = Number(item?.quantity || 0);
    if (!(qty > 0)) throw new Error(`تعداد در ردیف ${i + 1} فاکتور معتبر نیست.`);
    const a = rowAmounts(item);
    const base = rial(a.base,currency), dis = rial(a.dis,currency), after = rial(a.after,currency), vat = rial(a.vat,currency), total = rial(a.total,currency);
    tprdis += base; tdis += dis; tadis += after; tvam += vat; tbill += total;
    const vop = settlementCode === 3 && cap !== null && preTbill > 0 ? Math.round(vat * cap / preTbill) : null;
    return { sstid, sstt: String(item?.description || billboard?.address || sourceRecord?.name || 'کالا/خدمت'), mu, am: qty, fee: rial(item?.unit_price || 0,currency), cfee: null, cut: null, exr: null, prdis: base, dis, adis: after, vra: Number(a.vatRate || 0), vam: vat, odt: null, odr: null, odam: null, olt: null, olr: null, olam: null, consfee: null, spro: null, bros: null, tcpbs: null, cop: null, bsrn: null, vop, tsstam: total };
  });
  const tvop = body.reduce((s: number, r: any) => s + (r.vop || 0), 0) || null;
  const indatim = new Date(`${invDate}T00:00:00Z`).getTime();
  const header: Record<string, any> = {
    taxid: txid,
    inno: BigInt(serial).toString(16).toUpperCase().padStart(10,'0'),
    indatim,
    inty: Number(invoice.taxpayer_invoice_type || 1),
    inp,
    ins,
    tins: settings.seller_economic_code,
    tob: buyerType,
    ...(buyerId ? { bid: buyerId } : {}),
    ...(buyerEconomicCode ? { tinb: buyerEconomicCode } : {}),
    ...(buyerPostalCode ? { bpc: buyerPostalCode } : {}),
    setm: settlementCode,
    tprdis,
    tdis,
    tadis,
    tvam,
    todam: 0,
    tbill,
    cap,
    insp,
    tvop,
    tax17: null,
  };
  if (irtaxid) header.irtaxid = irtaxid;
  return { packetType: 'INVOICE.V01', data: { header, body, payments: [] } };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { success: false, message: 'روش درخواست معتبر نیست.' });
  const urlBase = Deno.env.get('SUPABASE_URL'); const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!urlBase || !key) return json(500, { success: false, message: 'تنظیمات سرور Supabase کامل نیست.' });
  try {
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return json(401, { success: false, message: 'نشست کاربری معتبر نیست. دوباره وارد شوید.' });
    const user = await verifyUser(urlBase, key, auth.replace(/^Bearer\s+/i, '').trim());
    const orgId = String(user.org_id || '').trim();
    if (!orgId) return json(403, { success: false, message: 'سازمان کاربر مشخص نیست.' });
    const body = await req.json();
    const action = String(body?.action || '').trim();

    if (action === 'get_settings') {
      const [s,c] = await Promise.all([settingsRow(urlBase,key,orgId), companyRow(urlBase,key,orgId)]);
      return json(200, { success: true, settings: sanitized(s,c), company: c });
    }

    if (action === 'save_settings') {
      const input = body?.settings || {};
      const current = await settingsRow(urlBase,key,orgId);
      const privateKey = String(input.private_key || '').trim();
      const certificatePem = String(input.certificate_pem || '').trim();
      const inputMode = String(input.integration_mode || '').trim();
      const integrationMode = inputMode === 'certificate_v2' || inputMode === 'no_certificate_legacy'
        ? inputMode
        : certificatePem || current?.certificate_pem ? 'certificate_v2' : 'no_certificate_legacy';
      const saved = await upsertSettings(urlBase,key,{
        id: current?.id || undefined,
        org_id: orgId,
        provider: integrationMode === 'certificate_v2' ? 'certificate_v2' : 'self_tsp',
        integration_mode: integrationMode,
        base_url: baseUrlForMode(integrationMode, input.base_url),
        fiscal_id: fiscal(input.fiscal_id || ''),
        public_key: current?.public_key || null,
        certificate_pem: integrationMode === 'certificate_v2' ? (certificatePem || current?.certificate_pem || null) : null,
        signature_key_id: current?.signature_key_id || null,
        legacy_last_serial: parseLegacySerial(input.legacy_last_serial),
        server_information: integrationMode === current?.integration_mode ? (current?.server_information || {}) : {},
        is_active: input.is_active === true,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
        ...(current?.id ? {} : { created_by: user.id }),
        ...(privateKey ? { private_key_encrypted: await encryptSecret(privateKey) } : {}),
      });
      const c = await companyRow(urlBase,key,orgId);
      return json(200, { success: true, settings: sanitized(saved,c) });
    }

    if (action === 'test_connection' || action === 'sync_server_information') {
      const { settings, privateKey, certificatePem } = await requireSettings(urlBase,key,orgId);
      const info = settings.integration_mode === 'certificate_v2'
        ? await invokeV2GetServerInformation(settings, privateKey, certificatePem)
        : await invokeLegacyGetServerInformation(settings, privateKey);
      await upsertSettings(urlBase,key,{ id: settings.id, org_id: orgId, server_information: info || {}, updated_by: user.id, updated_at: new Date().toISOString() });
      if (action === 'test_connection' && settings.integration_mode === 'no_certificate_legacy') await getLegacyToken({ ...settings, server_information: info || {} }, privateKey);
      return json(200, { success: true, message: settings.integration_mode === 'certificate_v2' ? 'ارتباط با سامانه مودیان برقرار است و احراز هویت نسخه ۲ با موفقیت انجام شد.' : 'ارتباط با سامانه مودیان برقرار است و دریافت توکن با موفقیت انجام شد.', server_information: info });
    }

    if (action === 'send_invoice') {
      const invoiceId = String(body?.invoice_id || '').trim();
      if (!invoiceId) return json(400, { success: false, message: 'شناسه فاکتور الزامی است.' });
      const { settings, company, privateKey, certificatePem } = await requireSettings(urlBase,key,orgId);
      let currentSettings = settings;
      if (!serverKey(currentSettings.server_information || {})) {
        const info = currentSettings.integration_mode === 'certificate_v2'
          ? await invokeV2GetServerInformation(settings, privateKey, certificatePem)
          : await invokeLegacyGetServerInformation(settings, privateKey);
        await upsertSettings(urlBase,key,{ id: settings.id, org_id: orgId, server_information: info || {}, updated_by: user.id, updated_at: new Date().toISOString() });
        currentSettings = { ...settings, server_information: info };
      }
      const bundle = await invoiceBundle(urlBase,key,orgId,invoiceId);
      const currency = String(company?.currency_code || 'IRT');
      const manualSettlement = String(body?.settlement_method || bundle.invoice.taxpayer_settlement_method || '').trim();
      const computed = !manualSettlement ? computeSettlement(bundle.receipts, currency) : null;
      const settlement = manualSettlement || computed?.setm || '';
      const serial = BigInt(await rpc(urlBase,key,'reserve_taxpayer_invoice_serial',{ p_org_id: orgId, p_fiscal_id: currentSettings.fiscal_id, p_min_last_serial: String(currentSettings.legacy_last_serial || 0) }));
      const txid = taxId(currentSettings.fiscal_id, String(bundle.invoice.invoice_date || ''), serial);
      const debugPayload = { build: FUNCTION_BUILD, taxpayer_settings: { fiscal_id: currentSettings.fiscal_id, base_url: currentSettings.base_url, integration_mode: currentSettings.integration_mode } };
      let sub = first(await insert(urlBase,key,'taxpayer_invoice_submissions',[{ org_id: orgId, invoice_id: invoiceId, fiscal_id: currentSettings.fiscal_id, integration_mode: currentSettings.integration_mode, internal_serial: Number(serial), taxid: txid, status: 'sending', invoice_type: String(bundle.invoice.taxpayer_invoice_type || '1'), invoice_pattern: String(bundle.invoice.taxpayer_invoice_pattern || '1'), invoice_subject: String(bundle.invoice.taxpayer_invoice_subject || '1'), settlement_method: settlement, request_payload: { _kalam_debug: { ...debugPayload, stage: 'preflight' } }, created_by: user.id }]));
      try {
        const payload = invoicePayload({ ...bundle, company, settings: currentSettings, txid, serial, settlement, cashOverride: computed?.cashAmount ?? null });
        const uid = crypto.randomUUID();
        const built = currentSettings.integration_mode === 'certificate_v2'
          ? await buildV2InvoicePacket(currentSettings, privateKey, certificatePem, payload, uid)
          : await buildLegacyEncryptedInvoicePacket(currentSettings, privateKey, payload, uid);
        const packetDebug = { ...debugPayload, stage: 'build-packet', packet_debug: built.debug };
        await patch(urlBase,key,'taxpayer_invoice_submissions',sub.id,{ request_payload: { ...payload, _kalam_debug: packetDebug }, updated_at: new Date().toISOString() });
        const sendResult = currentSettings.integration_mode === 'certificate_v2'
          ? await invokeV2Invoice(currentSettings, privateKey, certificatePem, built.packet)
          : await (async () => {
              const { token } = await getLegacyToken(currentSettings, privateKey);
              return invokeLegacyAsyncEnqueue(currentSettings, privateKey, built.packet, token, requestMeta());
            })();
        const res = sendResult.response;
        const row = asyncResultRow(res);
        if (row?.errorCode || row?.errorMessage || row?.errorDetail) throw new Error([row?.errorCode, row?.errorMessage || row?.errorDetail].filter(Boolean).join(' - '));
        sub = first(await patch(urlBase,key,'taxpayer_invoice_submissions',sub.id,{ uid: String(row?.uid || uid || '').trim() || null, reference_number: String(row?.referenceNumber || row?.reference_number || '').trim() || null, status: 'sent', response_payload: { ...(res || {}), _kalam_debug: { ...packetDebug, stage: 'send', send_debug: sendResult.debug } }, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })) || sub;
        return json(200, { success: true, message: 'فاکتور برای بررسی به سامانه مودیان ارسال شد. نتیجه نهایی را از استعلام وضعیت ببینید.', submission: sub });
      } catch (e: any) {
        const message = String(e?.message || e);
        await patch(urlBase,key,'taxpayer_invoice_submissions',sub.id,{ status: 'failed', error_message: message, response_payload: { _kalam_debug: { ...debugPayload, stage: 'failed', kalam_debug: e?.kalamDebug || null } }, updated_at: new Date().toISOString() });
        throw e;
      }
    }

    if (action === 'inquire_submission') {
      const id = String(body?.submission_id || '').trim();
      const sub = first(await select(urlBase,key,'taxpayer_invoice_submissions',{ id: 'eq.' + id, org_id: 'eq.' + orgId, select: '*', limit: '1' }));
      if (!sub?.uid && !sub?.reference_number && !sub?.taxid) throw new Error('شناسه لازم برای استعلام این ارسال در دسترس نیست.');
      const { settings, privateKey, certificatePem } = await requireSettings(urlBase,key,orgId);
      let res;
      if (settings.integration_mode === 'certificate_v2') {
        if (sub.uid) {
          const url = `inquiry-by-uid?fiscalId=${enc(settings.fiscal_id)}&uidList=${enc(sub.uid)}`;
          res = await v2Request(settings, privateKey, certificatePem, 'GET', url);
        } else if (sub.reference_number) {
          res = await v2Request(settings, privateKey, certificatePem, 'GET', `inquiry-by-reference-id?referenceIds=${enc(sub.reference_number)}`);
        } else {
          res = await v2Request(settings, privateKey, certificatePem, 'GET', `inquiry-invoice-status?taxIds=${enc(sub.taxid)}`);
        }
      } else {
        const { token } = await getLegacyToken(settings, privateKey);
        res = sub.uid
          ? await invokeLegacySync(settings, privateKey, 'INQUIRY_BY_UID', [{ uid: sub.uid, fiscalId: settings.fiscal_id }], token)
          : sub.reference_number
            ? await invokeLegacySync(settings, privateKey, 'INQUIRY_BY_REFERENCE_NUMBER', [sub.reference_number], token)
            : await invokeLegacySync(settings, privateKey, 'INQUIRY_BY_TAX_ID', [sub.taxid], token);
      }
      const row = first(res?.result?.data) || first(res?.data) || first(res?.result) || res;
      const status = normalizeInquiryStatus(row);
      const errorMessage = inquiryRowMessage(row);
      const updated = first(await patch(urlBase,key,'taxpayer_invoice_submissions',sub.id,{ status, inquiry_payload: res || {}, error_message: errorMessage || null, last_inquiry_at: new Date().toISOString(), updated_at: new Date().toISOString() }));
      const message = status === 'accepted_with_warnings'
        ? 'صورتحساب پذیرفته شد، اما هشدارهای سامانه مودیان را بررسی کنید.'
        : 'استعلام وضعیت ارسال با موفقیت انجام شد.';
      return json(200, { success: true, message, submission: updated || sub });
    }

    return json(400, { success: false, message: 'عملیات درخواستی برای سامانه مودیان پشتیبانی نمی‌شود.' });
  } catch (error: any) {
    console.error('[taxpayer-system]', String(error?.message || error));
    return json(400, { success: false, message: String(error?.message || 'خطا در عملیات سامانه مودیان') });
  }
});
