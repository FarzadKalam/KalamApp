import { iranMobileE164, iranMobileAuth } from './phone-number.ts';

type Credentials = { url: string; key: string };
type Account = {
  org_id: string; org_name: string; resolved_host: string; role_name: string | null; is_owner: boolean;
  user_id: string; auth_email: string | null; auth_phone: string | null;
  recovery_email: string | null; recovery_phone: string | null; is_independent: boolean;
};
type Channel = 'email' | 'sms';
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const sharedHostname = 'app.tazesystem.ir';
const encoder = new TextEncoder();

export const normalizeOrganizationLoginContact = (value: unknown) => {
  const raw = String(value || '').trim().toLowerCase();
  const phone = iranMobileE164(raw);
  if (phone) return { value: phone, isPhone: true };
  return raw.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) && !raw.endsWith('@org-login.invalid')
    ? { value: raw, isPhone: false } : null;
};

export const requestOrganizationAuth = async (
  credentials: Credentials, path: string, body?: Record<string, unknown>, headers?: Record<string, string>,
) => {
  const response = await fetch(`${credentials.url.replace(/\/+$/, '')}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { apikey: credentials.key, authorization: `Bearer ${credentials.key}`, 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('سرویس ورود سازمانی در دسترس نیست. دوباره تلاش کنید.');
  return response.json();
};

export const organizationAccountCandidates = async (credentials: Credentials, contact: NonNullable<ReturnType<typeof normalizeOrganizationLoginContact>>) =>
  await requestOrganizationAuth(credentials, '/rest/v1/rpc/organization_login_candidates', {
    p_contact: contact.value, p_is_phone: contact.isPhone,
  }) as Account[];

const rpc = (credentials: Credentials, name: string, body: Record<string, unknown>) =>
  requestOrganizationAuth(credentials, `/rest/v1/rpc/${name}`, body);

const challengeDigest = async (secret: string, id: string, code: string) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(`${id}:${code}`));
  return Array.from(new Uint8Array(signed), byte => byte.toString(16).padStart(2, '0')).join('');
};

const sendCentralCode = async (credentials: Credentials, channel: Channel, destination: string, code: string) => {
  if (channel === 'sms') {
    const response = await requestOrganizationAuth(credentials, '/functions/v1/send-sms',
      { phone: destination, otp: code }, { 'x-kalam-internal': 'organization-password-auth' });
    if (response?.error || response?.ok === false) throw new Error('ارسال پیامک انجام نشد.');
    return;
  }
  // Recovery codes must never be stored in the organization's message history.
  const providers = await requestOrganizationAuth(credentials, '/rest/v1/saas_org_settings?is_billing_provider=eq.true&select=org_id&limit=1');
  if (!providers?.[0]?.org_id) throw new Error('ایمیل مرکزی آماده نیست.');
  const rows = await requestOrganizationAuth(credentials,
    `/rest/v1/email_platform_settings?org_id=eq.${providers[0].org_id}&select=sender_address,sender_name,encrypted_credentials&limit=1`);
  const platform = rows?.[0];
  if (!platform?.sender_address || !platform.encrypted_credentials) throw new Error('ایمیل مرکزی آماده نیست.');
  const [{ decryptEmailSecret }, { sendSmtpEmail }] = await Promise.all([import('./email-runtime.ts'), import('./email-transport.ts')]);
  const configuration = await decryptEmailSecret(platform.encrypted_credentials);
  await sendSmtpEmail(configuration.smtp, {
    from: { name: platform.sender_name || 'تازه سیستم', address: platform.sender_address },
    to: [destination], subject: 'کد تأیید حساب تازه سیستم',
    text: `کد تأیید شما: ${code}\nاین کد تا ده دقیقه معتبر است.`,
  }, true);
};

const resolveHostname = (request: Request) => {
  try {
    const origin = new URL(request.headers.get('Origin') || '');
    return origin.protocol === 'https:' ? origin.hostname.toLowerCase() : '';
  } catch { return ''; }
};

const listVisibleAccounts = (accounts: Account[]) => accounts.filter((account, _, all) =>
  all.filter(row => row.org_id === account.org_id).length === 1).map(account => ({
  org_id: account.org_id, org_name: account.org_name, resolved_host: account.resolved_host,
  role_name: account.role_name, is_owner: account.is_owner,
  recovery_channels: [...(account.recovery_phone ? ['sms'] : []), ...(account.recovery_email ? ['email'] : [])],
}));

export const isOrganizationPasswordAction = (action: string) => [
  'start_organization_discovery', 'verify_organization_discovery', 'login_organization_password',
  'start_organization_password_recovery', 'verify_organization_password_recovery', 'finish_organization_password_recovery',
].includes(action);

export const handleOrganizationPasswordAuth = async (
  credentials: Credentials, request: Request, action: string, body: Record<string, unknown>,
): Promise<{ status: number; data: Record<string, unknown> }> => {
  const fail = (message: string, status = 400) => ({ status, data: { success: false, message } });
  const ok = (data: Record<string, unknown> = {}) => ({ status: 200, data: { success: true, ...data } });
  const hostname = resolveHostname(request);
  const shared = hostname === sharedHostname;
  const challengeId = String(body.challengeId || '');
  const code = String(body.code || '');
  const password = String(body.password || '');
  const contact = normalizeOrganizationLoginContact(body.contact);
  if (!hostname) return fail('نشانی ورود معتبر نیست.');

  const getTarget = async (targetContact: NonNullable<typeof contact>) => {
    let orgId: string | undefined;
    if (shared) {
      const proofId = String(body.discoveryId || '');
      orgId = String(body.orgId || '');
      if (!uuid.test(proofId) || !uuid.test(orgId)) return null;
      const expiry = encodeURIComponent(new Date().toISOString());
      const proof = await requestOrganizationAuth(credentials, `/rest/v1/organization_auth_challenges?id=eq.${proofId}&purpose=eq.discover&verified_at=not.is.null&expires_at=gt.${expiry}&select=contact&limit=1`);
      if (proof?.[0]?.contact !== targetContact.value) return null;
    }
    const matches = (await organizationAccountCandidates(credentials, targetContact))
      .filter(row => shared ? row.org_id === orgId : row.resolved_host?.toLowerCase() === hostname);
    return matches.length === 1 ? matches[0] : null;
  };

  if (['verify_organization_discovery', 'verify_organization_password_recovery', 'finish_organization_password_recovery'].includes(action)) {
    const discover = action === 'verify_organization_discovery';
    const finish = action === 'finish_organization_password_recovery';
    if (!uuid.test(challengeId) || (!finish && !/^\d{6}$/.test(code)) || (discover && !shared)) return fail('کد تأیید معتبر وارد کنید.');
    if (finish && (password.length < 6 || password.length > 72 || encoder.encode(password).length > 72)) {
      return fail('رمز جدید باید حداقل ۶ کاراکتر و حداکثر ۷۲ بایت باشد.');
    }
    const proof = finish
      ? await rpc(credentials, 'consume_organization_password_recovery', { p_id: challengeId })
      : await rpc(credentials, 'verify_organization_auth_challenge', {
        p_id: challengeId, p_purpose: discover ? 'discover' : 'recover',
        p_digest: await challengeDigest(credentials.key, challengeId, code),
      });
    const verifiedContact = normalizeOrganizationLoginContact(proof?.contact);
    if (!verifiedContact) return fail('کد تأیید نادرست است یا اعتبارش تمام شده است.');
    const accounts = await organizationAccountCandidates(credentials, verifiedContact);
    if (discover) return ok({ organizations: listVisibleAccounts(accounts) });
    const account = accounts.find(row => row.user_id === proof.user_id && row.org_id === proof.org_id
      && (shared || row.resolved_host?.toLowerCase() === hostname));
    const recoveryAddress = proof.delivery_channel === 'email' ? account?.recovery_email : account?.recovery_phone;
    if (!account || !recoveryAddress || recoveryAddress !== proof.delivery_address) return fail('حساب انتخاب‌شده در دسترس نیست.');
    if (!finish) return ok();
    const response = await fetch(`${credentials.url.replace(/\/+$/, '')}/auth/v1/admin/users/${account.user_id}`, {
      method: 'PUT', headers: { apikey: credentials.key, authorization: `Bearer ${credentials.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ password }), signal: AbortSignal.timeout(12000),
    });
    return response.ok ? ok() : fail('تغییر رمز انجام نشد. کد تازه درخواست کنید.', 502);
  }

  if (!contact) return fail('شماره موبایل یا ایمیل معتبر وارد کنید.');
  if (action === 'login_organization_password') {
    if (!password || password.length > 128) return fail('رمز عبور را وارد کنید.');
    const account = await getTarget(contact);
    if (!account) return fail('حساب یا رمز این سازمان معتبر نیست.', 401);
    const authPhone = iranMobileAuth(account.auth_phone);
    const login = contact.isPhone && authPhone ? { phone: authPhone } : account.auth_email ? { email: account.auth_email } : { phone: authPhone };
    const sessionResponse = await fetch(`${credentials.url.replace(/\/+$/, '')}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: credentials.key, 'content-type': 'application/json' },
      body: JSON.stringify({ ...login, password }), signal: AbortSignal.timeout(12000),
    });
    if (!sessionResponse.ok) return fail('حساب یا رمز این سازمان معتبر نیست.', sessionResponse.status === 429 ? 429 : 401);
    const session = await sessionResponse.json();
    if (session.user?.id !== account.user_id || !session.access_token || !session.refresh_token) {
      return fail('حساب یا رمز این سازمان معتبر نیست.', 401);
    }
    return ok({ access_token: session.access_token, refresh_token: session.refresh_token, organization: listVisibleAccounts([account])[0] });
  }

  const discover = action === 'start_organization_discovery';
  if (discover && !shared) return fail('انتخاب سازمان از صفحه ورود عمومی انجام می‌شود.');
  const account = discover ? null : await getTarget(contact);
  const channel: Channel = discover ? contact.isPhone ? 'sms' : 'email' : body.channel === 'email' ? 'email' : 'sms';
  const matches = discover ? await organizationAccountCandidates(credentials, contact) : [];
  const destination = discover
    ? matches.length ? contact.value : null
    : channel === 'email' ? account?.recovery_email : account?.recovery_phone;
  const id = crypto.randomUUID();
  const random = crypto.getRandomValues(new Uint32Array(1))[0];
  const otp = String(random % 1000000).padStart(6, '0');
  const issued = await rpc(credentials, 'issue_organization_auth_challenge', {
    p_id: id, p_purpose: discover ? 'discover' : 'recover', p_contact: contact.value,
    p_org_id: account?.org_id || null, p_target_user_id: account?.user_id || null,
    p_digest: await challengeDigest(credentials.key, id, otp),
    p_channel: channel, p_destination: destination || null,
  });
  if (!issued) return fail('برای درخواست دوبارهٔ کد کمی صبر کنید.', 429);
  if (destination) {
    await sendCentralCode(credentials, channel, destination, otp).catch(() => {
      console.warn('Organization account verification delivery failed', { channel, purpose: discover ? 'discover' : 'recover' });
    });
  }
  return ok({ challengeId: id });
};
