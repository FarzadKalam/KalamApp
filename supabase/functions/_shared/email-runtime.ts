// @ts-nocheck
import { fetchOrganizationRequestContext } from './organization-request-context.ts';
import { requireManagedEmailFeature } from './managed-email.ts';
export const emailCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
export const emailJson = (status: number, value: unknown) => new Response(JSON.stringify(value), {
  status, headers: { ...emailCors, 'Content-Type': 'application/json' },
});
export const emailService = () => {
  const url = Deno.env.get('SUPABASE_URL')?.replace(/\/+$/, '');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('تنظیمات سرویس ایمیل کامل نیست.');
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const rest = async (table: string, query = '', method = 'GET', body?: unknown, extra: Record<string,string> = {}) => {
    const response = await fetch(`${url}/rest/v1/${table}${query ? '?' + query : ''}`, {
      method, headers: { ...headers, Prefer: 'return=representation', ...extra },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const error: any = new Error('ذخیره یا دریافت اطلاعات ایمیل ناموفق بود.');
      error.code = result?.code;
      throw error;
    }
    return result;
  };
  const rpc = async (name: string, body = {}, token = key, request?: Request) => {
    const contextHeaders: Record<string,string> = {};
    for (const name of ['origin','x-client-info']) if (request?.headers.get(name)) contextHeaders[name] = request.headers.get(name)!;
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: { ...headers, Authorization: `Bearer ${token}`, ...contextHeaders }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error('دسترسی به سرویس ایمیل تأیید نشد.');
    return data;
  };
  return { url, key, headers, rest, rpc };
};
export const authorizeEmail = async (request: Request, body: any, action: 'view' | 'send' | 'manage', allowService = false) => {
  const service = emailService();
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('برای استفاده از ایمیل دوباره وارد شوید.');
  if (token === service.key) {
    if (!allowService || !body.org_id) throw new Error('سازمان مقصد مشخص نیست.');
    return { ...service, orgId: String(body.org_id), userId: null, system: body.source === 'system', token };
  }
  const [ctx, allowed] = await Promise.all([
    fetchOrganizationRequestContext(service.url, service.key, token, request),
    service.rpc('email_can_access', { p_action: action }, token, request),
  ]);
  if (!ctx?.org_id || !allowed || body.org_id && body.org_id !== ctx.org_id) throw new Error('دسترسی به ایمیل این سازمان مجاز نیست.');
  const response = await fetch(`${service.url}/auth/v1/user`, { headers: { ...service.headers, Authorization: `Bearer ${token}` } });
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id) throw new Error('نشست ورود معتبر نیست.');
  return { ...service, orgId: ctx.org_id, userId: user.id, system: false, token };
};
const fromBase64 = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));
const toBase64 = (value: Uint8Array) => btoa(Array.from(value, byte => String.fromCharCode(byte)).join(''));
const encryptionKey = async () => {
  const raw = Deno.env.get('EMAIL_SECRET_ENCRYPTION_KEY') || '';
  const bytes = fromBase64(raw);
  if (bytes.byteLength !== 32) throw new Error('مدیر سامانه باید کلید امن نگهداری اتصال‌های ایمیل را تنظیم کند.');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt','decrypt']);
};
export const encryptEmailSecret = async (value: unknown) => {
  const key = await encryptionKey(); const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
};
export const decryptEmailSecret = async (value: string) => {
  const [version,iv,payload] = value.split('.');
  if (version !== 'v1' || !iv || !payload) throw new Error('اطلاعات امن اتصال ایمیل معتبر نیست.');
  const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, await encryptionKey(), fromBase64(payload));
  return JSON.parse(new TextDecoder().decode(data));
};
export const loadEmailCredentials = async (service: ReturnType<typeof emailService>, account: any) => {
  if (account.mode === 'managed') await requireManagedEmailFeature(service, account.org_id);
  const rows = await service.rest('email_account_secrets', `account_id=eq.${account.id}&org_id=eq.${account.org_id}&select=encrypted_credentials,legacy_credentials`);
  if (rows?.[0]?.encrypted_credentials) return decryptEmailSecret(rows[0].encrypted_credentials);
  if (rows?.[0]?.legacy_credentials) {
    const value=rows[0].legacy_credentials;
    const encrypted=await encryptEmailSecret(value);
    await service.rest('email_account_secrets',`account_id=eq.${account.id}&org_id=eq.${account.org_id}`,'PATCH',{encrypted_credentials:encrypted,legacy_credentials:null});
    return value;
  }
  throw new Error('اطلاعات اتصال این ایمیل هنوز تنظیم نشده است.');
};
export const isEmailAddress = (value: unknown) => typeof value === 'string' && value.length <= 254 && /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(value);
export const emailAddresses = (values: unknown) => {
  if (!Array.isArray(values)) return [];
  const result = [...new Set(values.map(value => String(value).trim().toLowerCase()))];
  if (result.length > 100 || result.some(value => !isEmailAddress(value))) throw new Error('یکی از آدرس‌های گیرنده معتبر نیست.');
  return result;
};
