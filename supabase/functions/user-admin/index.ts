// @ts-nocheck

type UserAdminAction =
  | 'set_user_password'
  | 'create_user'
  | 'update_user'
  | 'delete_user'
  | 'send_phone_otp'
  | 'verify_phone_otp'
  | 'repair_legacy_phone_login'
  | 'setup_owner_credentials'
  | 'saas_upsert_user'
  | 'saas_find_profile_matches'
  | 'saas_link_orphan_to_profile'
  | 'saas_send_phone_otp'
  | 'saas_verify_phone_otp'
  | 'saas_delete_user_preflight'
  | 'saas_delete_user'
  | 'saas_delete_demo_org';

type UserAdminBody = {
  action?: UserAdminAction | string;
  userId?: string;
  password?: string;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  roleId?: string | null;
  orgId?: string | null;
  avatarUrl?: string | null;
  isActive?: boolean;
  token?: string | null;
  skipProfileUpsert?: boolean;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, payload: Record<string, any>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const getServiceHeaders = (serviceRoleKey: string, userToken?: string) => ({
  apikey: serviceRoleKey,
  Authorization: userToken ? `Bearer ${userToken}` : `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
});

const normalizeDigitsToEnglish = (value: unknown): string =>
  String(value ?? '')
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));

const normalizeIranMobileE164 = (value?: string | null) => {
  const raw = normalizeDigitsToEnglish(value).trim();
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, '');
  if (digits.length === 10 && digits.startsWith('9')) return `+98${digits}`;
  if (digits.length === 11 && digits.startsWith('09')) return `+98${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('989')) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith('0989')) return `+${digits.slice(1)}`;
  if (raw.startsWith('+98') && /^(\+98)9\d{9}$/.test(raw.replace(/\s+/g, ''))) return raw.replace(/\s+/g, '');
  return null;
};

const toLocalIranMobile = (value?: string | null) => {
  const normalized = normalizeIranMobileE164(value);
  return normalized ? normalized.replace(/^\+98/, '0') : null;
};

const toGoTruePhone = (value?: string | null) => {
  const normalized = normalizeIranMobileE164(value);
  return normalized ? normalized.replace(/^\+/, '') : null;
};

const normalizeEmail = (value?: string | null) =>
  String(value || '').trim().toLowerCase();

const isValidEmail = (value?: string | null) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));

const isPrivilegedRole = (role?: string | null) =>
  ['super_admin', 'admin', 'manager'].includes(String(role || '').trim().toLowerCase());

const isPrivilegedRoleTitle = (title?: string | null) =>
  ['super_admin', 'admin', 'manager', 'مدیر ارشد', 'مدیر سیستم', 'مدیر سازمان', 'مدیر']
    .includes(String(title || '').trim());

const canManageUsersByRoleContext = (softwareRole?: string | null, orgRoleTitle?: string | null) =>
  isPrivilegedRole(softwareRole) || isPrivilegedRoleTitle(orgRoleTitle);

const verifyUserToken = async (supabaseUrl: string, serviceRoleKey: string, userToken: string) => {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey, userToken),
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw || 'Unauthorized');
  }

  const user = await response.json();
  if (!user?.id) throw new Error('Unauthorized');
  return user;
};

const restUrl = (supabaseUrl: string, table: string) =>
  new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/${table}`);

const authUrl = (supabaseUrl: string, path: string) =>
  `${supabaseUrl.replace(/\/+$/, '')}/auth/v1${path}`;

const readJsonSafe = async (response: Response) => {
  const raw = await response.text();
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return raw || null;
  }
};

const invokeRpcAsUser = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  userToken: string,
  functionName: string,
  payload: Record<string, any>,
) => {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: getServiceHeaders(serviceRoleKey, userToken),
    body: JSON.stringify(payload),
  });
  const parsed = await readJsonSafe(response);
  if (!response.ok) {
    throw new Error(String(parsed?.message || parsed || 'اجرای عملیات مدیریتی ناموفق بود.'));
  }
  return parsed;
};

const createReasonedError = (message: string, reasonCode?: string, status = 400) => {
  const error: any = new Error(String(message || 'Auth operation failed'));
  if (reasonCode) error.reasonCode = reasonCode;
  error.statusCode = status;
  return error;
};

const extractAuthMessage = (parsed: any, fallback: string) =>
  String(
    parsed?.msg ||
    parsed?.message ||
    parsed?.error_description ||
    parsed?.error?.message ||
    parsed?.error ||
    parsed ||
    fallback
  );

const inferAuthReasonCode = (parsed: any, fallbackCode: string) => {
  const raw = `${extractAuthMessage(parsed, '').toLowerCase()} ${String(parsed?.code || '').trim().toLowerCase()}`.trim();
  if (raw.includes('users_phone_key') || (raw.includes('phone') && (raw.includes('already') || raw.includes('duplicate') || raw.includes('exists')))) {
    return 'phone_conflict';
  }
  if (raw.includes('users_email_key') || (raw.includes('email') && (raw.includes('already') || raw.includes('duplicate') || raw.includes('exists')))) {
    return 'email_conflict';
  }
  return fallbackCode;
};

const getAuthFailureStatus = (status: number, reasonCode?: string | null) => {
  if (reasonCode === 'phone_conflict' || reasonCode === 'email_conflict') return 409;
  if (status >= 400 && status < 500) return status;
  return 500;
};

const getAuthFailureMessage = (reasonCode: string | null, fallback: string) => {
  if (reasonCode === 'phone_conflict') {
    return 'این شماره موبایل قبلا برای کاربر دیگری در احراز هویت ثبت شده است.';
  }
  if (reasonCode === 'email_conflict') {
    return 'این ایمیل قبلا برای کاربر دیگری در احراز هویت ثبت شده است.';
  }
  return fallback;
};

const inferOtpReasonCode = (parsed: any, status: number, fallbackCode: string) => {
  const raw = `${extractAuthMessage(parsed, '').toLowerCase()} ${String(parsed?.code || '').trim().toLowerCase()}`.trim();
  if (raw.includes('otp_disabled')) return 'otp_disabled';
  if (raw.includes('phone_provider_disabled')) return 'phone_provider_disabled';
  if (raw.includes('hook_timeout') || raw.includes('hook timeout') || raw.includes('sms hook failed') || raw.includes('context deadline exceeded')) return 'hook_timeout';
  if (raw.includes('invalid otp') || raw.includes('token is invalid')) return 'invalid_otp';
  if (raw.includes('token has expired') || raw.includes('otp expired') || raw.includes('token is expired')) return 'otp_expired';
  if (raw.includes('rate limit') || status === 429) return 'otp_rate_limited';
  if (raw.includes('duplicate key value') || raw.includes('users_phone_key')) return 'phone_conflict';
  return fallbackCode;
};

const unwrapAuthUserPayload = (payload: any) => {
  if (payload?.user && typeof payload.user === 'object') return payload.user;
  return payload || null;
};

const fetchProfile = async (supabaseUrl: string, serviceRoleKey: string, userId: string) => {
  const url = restUrl(supabaseUrl, 'profiles');
  url.searchParams.set('id', `eq.${userId}`);
  url.searchParams.set('select', 'id,org_id,role,role_id,is_active,full_name,email,mobile_1,avatar_url');
  url.searchParams.set('limit', '1');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw || 'خطا در خواندن پروفایل کاربر');
  }

  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] || null : null;
};

const fetchRole = async (supabaseUrl: string, serviceRoleKey: string, roleId?: string | null) => {
  const normalizedRoleId = String(roleId || '').trim();
  if (!normalizedRoleId) return null;

  const url = restUrl(supabaseUrl, 'org_roles');
  url.searchParams.set('id', `eq.${normalizedRoleId}`);
  url.searchParams.set('select', 'id,title,org_id,permissions');
  url.searchParams.set('limit', '1');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw || 'خطا در خواندن جایگاه سازمانی');
  }
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] || null : null;
};

const fetchPendingInviteByPhone = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  phoneE164?: string | null,
  orgId?: string | null,
) => {
  const normalizedPhone = normalizeIranMobileE164(phoneE164);
  if (!normalizedPhone) return null;
  const normalizedOrgId = String(orgId || '').trim();

  const url = restUrl(supabaseUrl, 'phone_signup_invites');
  url.searchParams.set('phone_e164', `eq.${normalizedPhone}`);
  url.searchParams.set('consumed_at', 'is.null');
  url.searchParams.set('select', 'id,org_id,is_active');
  if (normalizedOrgId) {
    url.searchParams.set('org_id', `eq.${normalizedOrgId}`);
  }
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', '1');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw || 'خطا در خواندن دعوت‌های شماره موبایل');
  }
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] || null : null;
};

const fetchPendingInviteConflictByPhone = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  phoneE164?: string | null,
  orgId?: string | null,
) => {
  const normalizedPhone = normalizeIranMobileE164(phoneE164);
  const normalizedOrgId = String(orgId || '').trim();
  if (!normalizedPhone || !normalizedOrgId) return null;

  const url = restUrl(supabaseUrl, 'phone_signup_invites');
  url.searchParams.set('phone_e164', `eq.${normalizedPhone}`);
  url.searchParams.set('consumed_at', 'is.null');
  url.searchParams.set('org_id', `neq.${normalizedOrgId}`);
  url.searchParams.set('select', 'id,org_id,is_active');
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', '1');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw || 'خطا در بررسی تعارض دعوت‌های شماره موبایل');
  }

  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] || null : null;
};

const fetchProfileByPhoneOrEmail = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  options: { phone?: string | null; email?: string | null; excludeUserId?: string | null },
) => {
  const normalizedPhone = toLocalIranMobile(options.phone);
  const normalizedEmail = String(options.email || '').trim().toLowerCase();
  const excludeUserId = String(options.excludeUserId || '').trim();

  if (normalizedPhone) {
    const phoneUrl = restUrl(supabaseUrl, 'profiles');
    phoneUrl.searchParams.set('mobile_1', `eq.${normalizedPhone}`);
    phoneUrl.searchParams.set('select', 'id,org_id,role,role_id,is_active,full_name,email,mobile_1');
    phoneUrl.searchParams.set('limit', '1');
    if (excludeUserId) {
      phoneUrl.searchParams.set('id', `neq.${excludeUserId}`);
    }

    const phoneResponse = await fetch(phoneUrl.toString(), {
      method: 'GET',
      headers: getServiceHeaders(serviceRoleKey),
    });
    if (!phoneResponse.ok) {
      const raw = await phoneResponse.text();
      throw new Error(raw || 'Phone duplicate lookup failed');
    }
    const phoneRows = await phoneResponse.json();
    const phoneMatch = Array.isArray(phoneRows) ? phoneRows[0] || null : null;
    if (phoneMatch?.id) return phoneMatch;
  }

  if (normalizedEmail) {
    const emailUrl = restUrl(supabaseUrl, 'profiles');
    emailUrl.searchParams.set('email', `eq.${normalizedEmail}`);
    emailUrl.searchParams.set('select', 'id,org_id,role,role_id,is_active,full_name,email,mobile_1');
    emailUrl.searchParams.set('limit', '1');
    if (excludeUserId) {
      emailUrl.searchParams.set('id', `neq.${excludeUserId}`);
    }

    const emailResponse = await fetch(emailUrl.toString(), {
      method: 'GET',
      headers: getServiceHeaders(serviceRoleKey),
    });
    if (!emailResponse.ok) {
      const raw = await emailResponse.text();
      throw new Error(raw || 'Email duplicate lookup failed');
    }
    const emailRows = await emailResponse.json();
    const emailMatch = Array.isArray(emailRows) ? emailRows[0] || null : null;
    if (emailMatch?.id) return emailMatch;
  }

  return null;
};

const updatePendingInviteAsConsumed = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  inviteId?: string | null,
  userId?: string | null,
) => {
  const normalizedInviteId = String(inviteId || '').trim();
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedInviteId || !normalizedUserId) return;

  const url = restUrl(supabaseUrl, 'phone_signup_invites');
  url.searchParams.set('id', `eq.${normalizedInviteId}`);

  const response = await fetch(url.toString(), {
    method: 'PATCH',
    headers: getServiceHeaders(serviceRoleKey),
    body: JSON.stringify({
      consumed_at: new Date().toISOString(),
      consumed_by: normalizedUserId,
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw || 'خطا در نهایی‌سازی رکورد دعوت');
  }
};

const createAuthUser = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  payload: Record<string, any>,
) => {
  const response = await fetch(authUrl(supabaseUrl, '/admin/users'), {
    method: 'POST',
    headers: getServiceHeaders(serviceRoleKey),
    body: JSON.stringify(payload),
  });
  const parsed = await readJsonSafe(response);
  if (!response.ok) {
    const reasonCode = inferAuthReasonCode(parsed, 'auth_create_failed');
    throw createReasonedError(
      getAuthFailureMessage(reasonCode, extractAuthMessage(parsed, 'ایجاد کاربر ناموفق بود')),
      reasonCode,
      getAuthFailureStatus(response.status, reasonCode),
    );
  }
  return unwrapAuthUserPayload(parsed);
};

const updateAuthUser = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  payload: Record<string, any>,
) => {
  const response = await fetch(authUrl(supabaseUrl, `/admin/users/${userId}`), {
    method: 'PUT',
    headers: getServiceHeaders(serviceRoleKey),
    body: JSON.stringify(payload),
  });
  const parsed = await readJsonSafe(response);
  if (!response.ok) {
    const reasonCode = inferAuthReasonCode(parsed, 'auth_update_failed');
    throw createReasonedError(
      getAuthFailureMessage(reasonCode, extractAuthMessage(parsed, 'بروزرسانی کاربر ناموفق بود')),
      reasonCode,
      getAuthFailureStatus(response.status, reasonCode),
    );
  }
  return unwrapAuthUserPayload(parsed);
};

const fetchAuthUserById = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
) => {
  const response = await fetch(authUrl(supabaseUrl, `/admin/users/${userId}`), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });
  const parsed = await readJsonSafe(response);
  if (!response.ok) {
    throw new Error(String(parsed?.msg || parsed?.message || parsed || 'خواندن کاربر احراز هویت ناموفق بود'));
  }
  return unwrapAuthUserPayload(parsed);
};

const listAuthUsersPage = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  page = 1,
  perPage = 1000,
) => {
  const url = new URL(authUrl(supabaseUrl, '/admin/users'));
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', String(perPage));

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });
  const parsed = await readJsonSafe(response);
  if (!response.ok) {
    throw new Error(String(parsed?.msg || parsed?.message || 'خواندن کاربران احراز هویت ناموفق بود'));
  }
  return parsed;
};

const authUserHasPhone = (user: any, phone: string) => {
  const normalizedPhone = normalizeIranMobileE164(phone);
  if (!normalizedPhone || !user) return false;

  if (normalizeIranMobileE164(user?.phone) === normalizedPhone) return true;

  const identities = Array.isArray(user?.identities) ? user.identities : [];
  return identities.some((identity: any) => {
    if (String(identity?.provider || '').trim().toLowerCase() !== 'phone') return false;
    return normalizeIranMobileE164(identity?.identity_data?.phone) === normalizedPhone;
  });
};

const findAuthUsersByPhone = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  phone: string,
) => {
  const matches: any[] = [];
  let page = 1;
  const perPage = 1000;

  while (page <= 20) {
    const result = await listAuthUsersPage(supabaseUrl, serviceRoleKey, page, perPage);
    const users = Array.isArray(result?.users) ? result.users : [];
    for (const user of users) {
      if (authUserHasPhone(user, phone)) {
        matches.push(user);
      }
    }
    if (users.length < perPage) break;
    page += 1;
  }

  return matches;
};

const deleteAuthUser = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
) => {
  const response = await fetch(authUrl(supabaseUrl, `/admin/users/${userId}`), {
    method: 'DELETE',
    headers: getServiceHeaders(serviceRoleKey),
  });
  const parsed = await readJsonSafe(response);
  if (!response.ok) {
    throw new Error(String(parsed?.msg || parsed?.message || parsed || 'آزادسازی شماره موبایل کاربر قدیمی ناموفق بود'));
  }
  return parsed?.user || parsed || null;
};

const deleteProfile = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
) => {
  const url = restUrl(supabaseUrl, 'profiles');
  url.searchParams.set('id', `eq.${userId}`);
  const response = await fetch(url.toString(), {
    method: 'DELETE',
    headers: getServiceHeaders(serviceRoleKey),
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw || 'حذف پروفایل ناموفق بود.');
  }
};

const releaseOrphanProfilePhoneConflict = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  duplicateProfile: any,
  phoneE164?: string | null,
  options?: { targetOrgId?: string | null; canCrossOrg?: boolean },
) => {
  const duplicateProfileId = String(duplicateProfile?.id || '').trim();
  const normalizedPhone = normalizeIranMobileE164(phoneE164);
  if (!duplicateProfileId || !normalizedPhone) return false;
  if (normalizeIranMobileE164(duplicateProfile?.mobile_1 || '') !== normalizedPhone) return false;

  const duplicateOrgId = String(duplicateProfile?.org_id || '').trim();
  const targetOrgId = String(options?.targetOrgId || '').trim();
  if (!options?.canCrossOrg && duplicateOrgId && targetOrgId && duplicateOrgId !== targetOrgId) {
    return false;
  }

  const duplicateAuthUser = await fetchAuthUserById(supabaseUrl, serviceRoleKey, duplicateProfileId).catch(() => null);
  if (duplicateAuthUser?.id) return false;

  await upsertProfile(supabaseUrl, serviceRoleKey, {
    id: duplicateProfileId,
    mobile_1: null,
  });
  return true;
};

const hasSaasAdminAccess = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  callerProfile: any,
) => {
  const role = await fetchRole(supabaseUrl, serviceRoleKey, callerProfile?.role_id);
  const permission = role?.permissions?.__saas_admin;
  if (!permission || typeof permission !== 'object') return false;
  const fields = permission.fields || {};
  return permission.view === true
    || permission.edit === true
    || fields.edit_orgs === true
    || fields.edit_requests === true
    || fields.demo_override === true;
};

const repairPhoneOwnerConflict = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  targetUserId: string,
  phone: string,
) => {
  const conflictingAuthUsers = (await findAuthUsersByPhone(supabaseUrl, serviceRoleKey, phone)).filter(
    (user: any) => String(user?.id || '') !== String(targetUserId),
  );

  if (conflictingAuthUsers.length === 0) {
    return { repaired: false, blocked: false, conflictUserId: null };
  }

  for (const authUser of conflictingAuthUsers) {
    const conflictProfile = await fetchProfile(supabaseUrl, serviceRoleKey, String(authUser?.id || ''));
    if (conflictProfile?.id) {
      return {
        repaired: false,
        blocked: true,
        conflictUserId: String(authUser?.id || ''),
        conflictProfileId: String(conflictProfile.id || ''),
      };
    }
  }

  for (const authUser of conflictingAuthUsers) {
    await deleteAuthUser(supabaseUrl, serviceRoleKey, String(authUser?.id || ''));
  }

  return {
    repaired: true,
    blocked: false,
    conflictUserId: String(conflictingAuthUsers[0]?.id || ''),
  };
};

const repairLegacyPhoneLogin = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  callerUser: any,
  phone: string,
) => {
  const callerUserId = String(callerUser?.id || '').trim();
  const normalizedPhone = normalizeIranMobileE164(phone || callerUser?.phone || '');
  if (!callerUserId || !normalizedPhone) {
    throw new Error('شماره موبایل معتبر برای تعمیر ورود پیامکی پیدا نشد.');
  }

  const callerProfile = await fetchProfile(supabaseUrl, serviceRoleKey, callerUserId);
  if (callerProfile?.id) {
    return {
      repaired: false,
      reason: 'caller_has_profile',
      targetUserId: callerUserId,
    };
  }

  const targetProfile = await fetchProfileByPhoneOrEmail(supabaseUrl, serviceRoleKey, {
    phone: normalizedPhone,
    excludeUserId: callerUserId,
  });
  if (!targetProfile?.id) {
    return {
      repaired: false,
      reason: 'target_profile_not_found',
    };
  }
  if (targetProfile.is_active === false) {
    return {
      repaired: false,
      reason: 'target_profile_inactive',
      targetUserId: String(targetProfile.id || ''),
    };
  }

  const targetUserId = String(targetProfile.id || '');
  const conflictingAuthUsers = (await findAuthUsersByPhone(supabaseUrl, serviceRoleKey, normalizedPhone)).filter((user: any) => {
    const id = String(user?.id || '');
    return id && id !== callerUserId && id !== targetUserId;
  });
  for (const authUser of conflictingAuthUsers) {
    const conflictProfile = await fetchProfile(supabaseUrl, serviceRoleKey, String(authUser?.id || ''));
    if (conflictProfile?.id) {
      return {
        repaired: false,
        reason: 'target_phone_blocked',
        conflictUserId: String(authUser?.id || ''),
        conflictProfileId: String(conflictProfile.id || ''),
        targetUserId,
      };
    }
  }
  for (const authUser of conflictingAuthUsers) {
    await deleteAuthUser(supabaseUrl, serviceRoleKey, String(authUser?.id || ''));
  }

  if (targetUserId !== callerUserId) {
    await updateAuthUser(supabaseUrl, serviceRoleKey, targetUserId, {
      phone: null,
      phone_confirm: false,
    });
    await upsertProfile(supabaseUrl, serviceRoleKey, {
      id: targetUserId,
      mobile_1: null,
      mobile: null,
    });
  }

  await updateAuthUser(supabaseUrl, serviceRoleKey, callerUserId, {
    phone: toGoTruePhone(normalizedPhone),
    phone_confirm: true,
    user_metadata: {
      full_name: targetProfile.full_name || callerUser?.user_metadata?.full_name || '',
      phone_verified: true,
    },
  });
  await upsertProfile(supabaseUrl, serviceRoleKey, {
    id: callerUserId,
    org_id: targetProfile.org_id || null,
    role_id: targetProfile.role_id || null,
    role: targetProfile.role || 'admin',
    full_name: targetProfile.full_name || null,
    email: targetProfile.email || null,
    mobile_1: toLocalIranMobile(normalizedPhone),
    is_active: true,
  });

  try {
    const requestsUrl = restUrl(supabaseUrl, 'saas_onboarding_requests');
    requestsUrl.searchParams.set('auth_user_id', `eq.${targetUserId}`);
    requestsUrl.searchParams.set('mobile', `eq.${normalizedPhone}`);
    await fetch(requestsUrl.toString(), {
      method: 'PATCH',
      headers: getServiceHeaders(serviceRoleKey),
      body: JSON.stringify({ auth_user_id: callerUserId }),
    });
  } catch { /* best effort */ }

  try {
    const issuanceUrl = restUrl(supabaseUrl, 'saas_demo_issuance');
    issuanceUrl.searchParams.set('auth_user_id', `eq.${targetUserId}`);
    issuanceUrl.searchParams.set('mobile', `eq.${normalizedPhone}`);
    await fetch(issuanceUrl.toString(), {
      method: 'PATCH',
      headers: getServiceHeaders(serviceRoleKey),
      body: JSON.stringify({ auth_user_id: callerUserId }),
    });
  } catch { /* best effort */ }

  return {
    repaired: true,
    reason: 'caller_profile_adopted',
    targetUserId: callerUserId,
    previousUserId: targetUserId,
  };

};

const resendOtp = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  phone: string,
  type: 'sms' | 'phone_change',
) => {
  const response = await fetch(authUrl(supabaseUrl, '/resend'), {
    method: 'POST',
    headers: getServiceHeaders(serviceRoleKey),
    body: JSON.stringify({
      phone,
      type,
    }),
  });
  const parsed = await readJsonSafe(response);
  if (!response.ok) {
    throw createReasonedError(
      extractAuthMessage(parsed, 'ارسال کد تایید ناموفق بود'),
      inferOtpReasonCode(parsed, response.status, 'otp_resend_failed'),
      response.status,
    );
  }
  return parsed || null;
};

const sendSmsOtp = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  phone: string,
) => {
  const response = await fetch(authUrl(supabaseUrl, '/otp'), {
    method: 'POST',
    headers: getServiceHeaders(serviceRoleKey),
    body: JSON.stringify({
      phone,
      create_user: false,
      channel: 'sms',
    }),
  });
  const parsed = await readJsonSafe(response);
  if (!response.ok) {
    throw createReasonedError(
      extractAuthMessage(parsed, 'ارسال کد تایید ناموفق بود'),
      inferOtpReasonCode(parsed, response.status, 'otp_request_failed'),
      response.status,
    );
  }
  return parsed || null;
};

const verifyPhoneOtp = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  phone: string,
  token: string,
  type: 'sms' | 'phone_change',
) => {
  const normalizedToken = normalizeDigitsToEnglish(token).replace(/\D+/g, '');
  if (!normalizedToken) {
    throw new Error('کد تایید نامعتبر است.');
  }
  const response = await fetch(authUrl(supabaseUrl, '/verify'), {
    method: 'POST',
    headers: getServiceHeaders(serviceRoleKey),
    body: JSON.stringify({
      phone,
      token: normalizedToken,
      type,
    }),
  });
  const parsed = await readJsonSafe(response);
  if (!response.ok) {
    throw createReasonedError(
      extractAuthMessage(parsed, 'تایید کد پیامکی ناموفق بود'),
      inferOtpReasonCode(parsed, response.status, type === 'phone_change' ? 'phone_change_verify_failed' : 'otp_verify_failed'),
      response.status,
    );
  }
  return parsed || null;
};

const upsertProfile = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  profilePayload: Record<string, any>,
) => {
  const existingProfile = await fetchProfile(supabaseUrl, serviceRoleKey, String(profilePayload.id || ''));
  if (existingProfile?.id) {
    const url = restUrl(supabaseUrl, 'profiles');
    url.searchParams.set('id', `eq.${profilePayload.id}`);
    const response = await fetch(url.toString(), {
      method: 'PATCH',
      headers: getServiceHeaders(serviceRoleKey),
      body: JSON.stringify(profilePayload),
    });
    if (!response.ok) {
      const raw = await response.text();
      throw new Error(raw || 'بروزرسانی پروفایل ناموفق بود');
    }
    return { ...existingProfile, ...profilePayload };
  }

  const url = restUrl(supabaseUrl, 'profiles');
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      ...getServiceHeaders(serviceRoleKey),
      Prefer: 'return=representation',
    },
    body: JSON.stringify([profilePayload]),
  });
  const parsed = await readJsonSafe(response);
  if (!response.ok) {
    throw new Error(String(parsed?.message || parsed || 'ایجاد پروفایل ناموفق بود'));
  }
  return Array.isArray(parsed) ? parsed[0] || profilePayload : parsed || profilePayload;
};

const assertOrgAccess = (
  callerProfile: any,
  callerRole: string,
  targetOrgId?: string | null,
  targetSoftwareRole?: string | null,
) => {
  const canCrossOrg = callerRole === 'super_admin';
  const callerOrgId = String(callerProfile?.org_id || '').trim();
  const normalizedTargetOrgId = String(targetOrgId || '').trim();
  const normalizedTargetSoftwareRole = String(targetSoftwareRole || '').trim().toLowerCase();

  if (!canCrossOrg && callerOrgId && normalizedTargetOrgId && callerOrgId !== normalizedTargetOrgId) {
    throw new Error('مدیریت کاربر فقط برای سازمان خودتان مجاز است.');
  }
  if (normalizedTargetSoftwareRole === 'super_admin' && callerRole !== 'super_admin') {
    throw new Error('فقط سوپرا‌دمین می‌تواند کاربر با نقش سوپرا‌دمین ایجاد یا ویرایش کند.');
  }
};

const resolveRoleForOrg = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  roleId?: string | null,
  requestedOrgId?: string | null,
) => {
  const role = await fetchRole(supabaseUrl, serviceRoleKey, roleId);
  if (!role?.id) return { role: null, orgId: requestedOrgId || null };
  if (requestedOrgId && String(role.org_id || '') && String(role.org_id) !== String(requestedOrgId)) {
    throw new Error('جایگاه سازمانی انتخاب‌شده با سازمان هدف هم‌خوان نیست.');
  }
  return { role, orgId: role.org_id || requestedOrgId || null };
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const authHeader = String(request.headers.get('Authorization') || '');
    const userToken = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!supabaseUrl || !serviceRoleKey) {
      return json(500, { success: false, message: 'تنظیمات سرور ناقص است.' });
    }
    if (!userToken) {
      return json(401, { success: false, message: 'درخواست احراز هویت نشده است.' });
    }

    const body = (await request.json().catch(() => ({}))) as UserAdminBody;
    const action = String(body?.action || '').trim() as UserAdminAction;
    const caller = await verifyUserToken(supabaseUrl, serviceRoleKey, userToken);
    const callerProfile = await fetchProfile(supabaseUrl, serviceRoleKey, String(caller.id));
    if (action === 'repair_legacy_phone_login') {
      const normalizedPhone = normalizeIranMobileE164(body?.phone || caller?.phone || '');
      if (!normalizedPhone) {
        return json(400, { success: false, message: 'شماره موبایل معتبر برای تعمیر ورود پیامکی پیدا نشد.' });
      }

      const repairResult = await repairLegacyPhoneLogin(supabaseUrl, serviceRoleKey, caller, normalizedPhone);
      if (!repairResult.repaired) {
        if (repairResult.reason === 'caller_has_profile') {
          return json(200, {
            success: true,
            repaired: false,
            reason: repairResult.reason,
            targetUserId: repairResult.targetUserId || null,
          });
        }
        if (repairResult.reason === 'target_profile_inactive') {
          return json(403, {
            success: false,
            message: 'کاربر سازمانی متناظر با این شماره غیرفعال است.',
            reason: repairResult.reason,
            targetUserId: repairResult.targetUserId || null,
          });
        }
        if (repairResult.reason === 'target_phone_blocked') {
          return json(409, {
            success: false,
            message: 'این شماره هنوز روی یک کاربر سازمانی دیگر ثبت شده و تعمیر خودکار آن امن نیست.',
            reason: repairResult.reason,
            targetUserId: repairResult.targetUserId || null,
            conflictUserId: repairResult.conflictUserId || null,
            conflictProfileId: repairResult.conflictProfileId || null,
          });
        }
        return json(404, {
          success: false,
          message: 'برای این شماره، کاربر سازمانی فعال و یکتایی پیدا نشد.',
          reason: repairResult.reason || 'target_profile_not_found',
        });
      }

      return json(200, {
        success: true,
        repaired: true,
        targetUserId: repairResult.targetUserId || null,
      });
    }
    if (action === 'setup_owner_credentials') {
      const targetUserId = String(caller?.id || '').trim();
      const fullName = String(body?.fullName || '').trim();
      const email = normalizeEmail(body?.email);
      const password = String(body?.password || '').trim();
      const skipProfileUpsert = body?.skipProfileUpsert === true;
      const normalizedOwnerPhone = normalizeIranMobileE164(body?.phone || caller?.phone || '');

      if (!targetUserId) {
        return json(401, { success: false, message: 'نشست کاربر معتبر نیست.' });
      }
      if (!fullName) {
        return json(400, { success: false, message: 'نام و نام خانوادگی مدیر اصلی الزامی است.' });
      }
      if (!isValidEmail(email)) {
        return json(400, { success: false, message: 'ایمیل مدیر اصلی معتبر نیست.' });
      }
      if (password.length < 6) {
        return json(400, { success: false, message: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' });
      }

      const duplicateProfile = await fetchProfileByPhoneOrEmail(supabaseUrl, serviceRoleKey, {
        email,
        excludeUserId: targetUserId,
      });
      if (duplicateProfile?.id) {
        return json(409, {
          success: false,
          message: 'برای این ایمیل قبلاً کاربر ثبت شده است.',
          reason_code: 'email_conflict',
        });
      }

      await updateAuthUser(supabaseUrl, serviceRoleKey, targetUserId, {
        email,
        password,
        ...(normalizedOwnerPhone ? { phone: toGoTruePhone(normalizedOwnerPhone), phone_confirm: true } : {}),
        user_metadata: {
          full_name: fullName,
          ...(normalizedOwnerPhone ? { phone: normalizedOwnerPhone, phone_verified: true } : {}),
        },
        email_confirm: true,
      });

      const profile = skipProfileUpsert
        ? await fetchProfile(supabaseUrl, serviceRoleKey, targetUserId)
        : await upsertProfile(supabaseUrl, serviceRoleKey, {
          id: targetUserId,
          full_name: fullName,
          email,
        });

      return json(200, {
        success: true,
        profile,
      });
    }
    if (!callerProfile?.id) {
      return json(403, { success: false, message: 'پروفایل کاربر فعلی پیدا نشد.' });
    }

    if (action.startsWith('saas_')) {
      if (!(await hasSaasAdminAccess(supabaseUrl, serviceRoleKey, callerProfile))) {
        return json(403, { success: false, message: 'دسترسی تازه سیستم برای این عملیات کافی نیست.' });
      }

      if (action === 'saas_delete_user_preflight') {
        const targetUserId = String(body?.userId || '').trim();
        if (!targetUserId) return json(400, { success: false, message: 'کاربر انتخاب نشده است.' });
        const result = await invokeRpcAsUser(supabaseUrl, serviceRoleKey, userToken, 'admin_saas_user_delete_preflight', {
          p_user_id: targetUserId,
        });
        if (result?.allowed !== true) {
          return json(409, { success: false, message: String(result?.message || 'حذف این کاربر مجاز نیست.') });
        }
        return json(200, { success: true, ...result });
      }

      if (action === 'saas_upsert_user') {
        const targetUserId = String(body?.userId || '').trim();
        const fullName = String(body?.fullName || '').trim();
        const email = normalizeEmail(body?.email) || null;
        const normalizedPhone = normalizeIranMobileE164(body?.phone);
        const roleId = String(body?.roleId || '').trim() || null;
        const requestedOrgId = String(body?.orgId || '').trim() || null;
        const softwareRole = String(body?.role || '').trim() || 'viewer';
        if (!targetUserId || !fullName || !requestedOrgId || !roleId) {
          return json(400, { success: false, message: 'نام، سازمان و نقش سازمانی الزامی است.' });
        }
        const resolvedRole = await resolveRoleForOrg(supabaseUrl, serviceRoleKey, roleId, requestedOrgId);
        if (!resolvedRole.role?.id || String(resolvedRole.orgId || '') !== requestedOrgId) {
          return json(400, { success: false, message: 'نقش انتخاب‌شده با سازمان هم‌خوان نیست.' });
        }
        const existingProfile = await fetchProfile(supabaseUrl, serviceRoleKey, targetUserId);
        const duplicateProfile = await fetchProfileByPhoneOrEmail(supabaseUrl, serviceRoleKey, {
          phone: normalizedPhone,
          email,
          excludeUserId: targetUserId,
        });
        if (duplicateProfile?.id) {
          return json(409, { success: false, message: 'موبایل یا ایمیل برای کاربر دیگری ثبت شده است.' });
        }
        const authUser = await fetchAuthUserById(supabaseUrl, serviceRoleKey, targetUserId).catch(() => null);
        if (authUser?.id) {
          const authPayload: Record<string, any> = { user_metadata: { full_name: fullName } };
          if (email) {
            authPayload.email = email;
            authPayload.email_confirm = true;
          }
          if (normalizedPhone) authPayload.phone = toGoTruePhone(normalizedPhone);
          await updateAuthUser(supabaseUrl, serviceRoleKey, targetUserId, authPayload);
        }
        const profile = await upsertProfile(supabaseUrl, serviceRoleKey, {
          id: targetUserId,
          org_id: requestedOrgId,
          role_id: roleId,
          role: softwareRole,
          full_name: fullName,
          email,
          mobile_1: normalizedPhone ? toLocalIranMobile(normalizedPhone) : null,
          is_active: body?.isActive !== false,
        });
        return json(200, { success: true, createdProfile: !existingProfile?.id, profile });
      }

      if (action === 'saas_find_profile_matches') {
        const orphanUserId = String(body?.userId || '').trim();
        if (!orphanUserId) return json(400, { success: false, message: 'کاربر انتخاب نشده است.' });
        const orphanProfile = await fetchProfile(supabaseUrl, serviceRoleKey, orphanUserId);
        if (orphanProfile?.id) return json(200, { success: true, matches: [] });
        const orphanAuth = await fetchAuthUserById(supabaseUrl, serviceRoleKey, orphanUserId);
        const match = await fetchProfileByPhoneOrEmail(supabaseUrl, serviceRoleKey, {
          phone: orphanAuth?.phone || null,
          email: orphanAuth?.email || null,
          excludeUserId: orphanUserId,
        });
        return json(200, {
          success: true,
          matches: match?.id ? [{
            userId: match.id,
            fullName: match.full_name || null,
            email: match.email || null,
            mobile: match.mobile_1 || null,
            orgId: match.org_id || null,
            isActive: match.is_active !== false,
          }] : [],
        });
      }

      if (action === 'saas_link_orphan_to_profile') {
        const orphanUserId = String(body?.userId || '').trim();
        const targetUserId = String((body as any)?.targetUserId || '').trim();
        if (!orphanUserId || !targetUserId || orphanUserId === targetUserId) {
          return json(400, { success: false, message: 'رکوردهای تطبیق معتبر نیستند.' });
        }
        const orphanProfile = await fetchProfile(supabaseUrl, serviceRoleKey, orphanUserId);
        const targetProfile = await fetchProfile(supabaseUrl, serviceRoleKey, targetUserId);
        if (orphanProfile?.id || !targetProfile?.id) {
          return json(409, { success: false, message: 'اتصال فقط برای حساب یتیم و پروفایل معتبر قابل انجام است.' });
        }
        const orphanAuth = await fetchAuthUserById(supabaseUrl, serviceRoleKey, orphanUserId);
        const targetAuth = await fetchAuthUserById(supabaseUrl, serviceRoleKey, targetUserId).catch(() => null);
        if (!targetAuth?.id) {
          return json(409, { success: false, message: 'حساب ورود پروفایل مقصد پیدا نشد.' });
        }
        const orphanPhone = normalizeIranMobileE164(orphanAuth?.phone || '');
        const orphanEmail = normalizeEmail(orphanAuth?.email) || null;
        await deleteAuthUser(supabaseUrl, serviceRoleKey, orphanUserId);
        const patch: Record<string, any> = {};
        if (orphanPhone) {
          patch.phone = orphanPhone;
          patch.phone_confirm = false;
        }
        if (!targetAuth?.email && orphanEmail) patch.email = orphanEmail;
        if (Object.keys(patch).length > 0) await updateAuthUser(supabaseUrl, serviceRoleKey, targetUserId, patch);
        if (orphanPhone) {
          await upsertProfile(supabaseUrl, serviceRoleKey, { id: targetUserId, mobile_1: toLocalIranMobile(orphanPhone) });
        }
        return json(200, { success: true, message: 'حساب یتیم به پروفایل موجود متصل شد. در صورت نیاز ورود پیامکی را تایید کنید.' });
      }

      if (action === 'saas_delete_user') {
        const targetUserId = String(body?.userId || '').trim();
        if (!targetUserId) return json(400, { success: false, message: 'کاربر انتخاب نشده است.' });
        const result = await invokeRpcAsUser(supabaseUrl, serviceRoleKey, userToken, 'admin_saas_user_delete_preflight', {
          p_user_id: targetUserId,
        });
        if (result?.allowed !== true) {
          return json(409, { success: false, message: String(result?.message || 'حذف این کاربر مجاز نیست.') });
        }
        const authUser = await fetchAuthUserById(supabaseUrl, serviceRoleKey, targetUserId).catch(() => null);
        if (authUser?.id) await deleteAuthUser(supabaseUrl, serviceRoleKey, targetUserId);
        await deleteProfile(supabaseUrl, serviceRoleKey, targetUserId).catch(() => null);
        return json(200, { success: true });
      }

      if (action === 'saas_delete_demo_org') {
        const orgId = String(body?.orgId || '').trim();
        if (!orgId) return json(400, { success: false, message: 'نسخه دمو انتخاب نشده است.' });
        const preflight = await invokeRpcAsUser(supabaseUrl, serviceRoleKey, userToken, 'admin_saas_demo_delete_preflight', {
          p_org_id: orgId,
        });
        if (preflight?.allowed !== true) {
          return json(409, { success: false, message: String(preflight?.message || 'حذف این سازمان مجاز نیست.') });
        }
        const userIds = Array.isArray(preflight?.user_ids)
          ? preflight.user_ids.map((id: any) => String(id || '')).filter(Boolean)
          : [];
        const deleted = await invokeRpcAsUser(supabaseUrl, serviceRoleKey, userToken, 'admin_saas_delete_demo_org', {
          p_org_id: orgId,
        });
        if (deleted?.success !== true) {
          return json(409, { success: false, message: String(deleted?.message || 'حذف نسخه دمو ناموفق بود.') });
        }
        for (const userId of userIds) {
          if (userId !== String(callerProfile.id)) {
            await deleteAuthUser(supabaseUrl, serviceRoleKey, userId).catch(() => null);
          }
        }
        return json(200, { success: true, message: 'نسخه دمو و اطلاعات وابسته حذف شد.' });
      }

      if (action === 'saas_send_phone_otp' || action === 'saas_verify_phone_otp') {
        const targetUserId = String(body?.userId || '').trim();
        const normalizedPhone = normalizeIranMobileE164(body?.phone);
        if (!targetUserId || !normalizedPhone) {
          return json(400, { success: false, message: 'کاربر و شماره موبایل معتبر الزامی است.' });
        }
        const targetProfile = await fetchProfile(supabaseUrl, serviceRoleKey, targetUserId);
        if (!targetProfile?.id) return json(404, { success: false, message: 'ابتدا پروفایل کاربر را تکمیل کنید.' });
        if (action === 'saas_send_phone_otp') {
          await updateAuthUser(supabaseUrl, serviceRoleKey, targetUserId, { phone: toGoTruePhone(normalizedPhone), phone_confirm: false });
          await upsertProfile(supabaseUrl, serviceRoleKey, { id: targetUserId, mobile_1: toLocalIranMobile(normalizedPhone) });
          const otpResult = await sendSmsOtp(supabaseUrl, serviceRoleKey, normalizedPhone);
          return json(200, { success: true, messageId: otpResult?.message_id || null, otpType: 'sms' });
        }
        const token = normalizeDigitsToEnglish(body?.token).replace(/\D+/g, '');
        if (!token) return json(400, { success: false, message: 'کد تایید الزامی است.' });
        await verifyPhoneOtp(supabaseUrl, serviceRoleKey, normalizedPhone, token, 'sms');
        await updateAuthUser(supabaseUrl, serviceRoleKey, targetUserId, {
          phone: toGoTruePhone(normalizedPhone),
          phone_confirm: true,
        });
        await upsertProfile(supabaseUrl, serviceRoleKey, { id: targetUserId, mobile_1: toLocalIranMobile(normalizedPhone) });
        return json(200, { success: true });
      }
    }

    const callerRole = String(callerProfile?.role || '').trim().toLowerCase();
    const callerOrgRole = await fetchRole(supabaseUrl, serviceRoleKey, callerProfile?.role_id);
    const callerOrgRoleTitle = String(callerOrgRole?.title || '').trim();
    if (!canManageUsersByRoleContext(callerRole, callerOrgRoleTitle)) {
      return json(403, { success: false, message: 'دسترسی کافی برای مدیریت کاربران ندارید.' });
    }

    if (action === 'set_user_password') {
      const targetUserId = String(body?.userId || '').trim();
      const password = String(body?.password || '').trim();
      if (!targetUserId || !password) {
        return json(400, { success: false, message: 'شناسه کاربر و رمز عبور الزامی است.' });
      }
      if (password.length < 6) {
        return json(400, { success: false, message: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' });
      }

      const targetProfile = await fetchProfile(supabaseUrl, serviceRoleKey, targetUserId);
      if (!targetProfile?.id) {
        return json(404, { success: false, message: 'پروفایل کاربر مقصد پیدا نشد.' });
      }
      assertOrgAccess(callerProfile, callerRole, targetProfile.org_id, targetProfile.role);
      await updateAuthUser(supabaseUrl, serviceRoleKey, targetUserId, { password });
      return json(200, { success: true });
    }

    if (action === 'create_user') {
      const password = String(body?.password || '').trim();
      const fullName = String(body?.fullName || '').trim();
      const email = String(body?.email || '').trim() || null;
      const roleId = String(body?.roleId || '').trim() || null;
      const softwareRole = String(body?.role || '').trim() || 'viewer';
      const avatarUrl = String(body?.avatarUrl || '').trim() || null;
      const isActive = body?.isActive !== false;
      const normalizedPhone = normalizeIranMobileE164(body?.phone);
      if (!fullName) {
        return json(400, { success: false, message: 'نام و نام خانوادگی الزامی است.' });
      }
      if (!normalizedPhone) {
        return json(400, { success: false, message: 'شماره موبایل معتبر نیست.' });
      }
      if (!password || password.length < 6) {
        return json(400, { success: false, message: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' });
      }

      const resolvedRole = await resolveRoleForOrg(supabaseUrl, serviceRoleKey, roleId, body?.orgId || callerProfile.org_id);
      const targetOrgId = resolvedRole.orgId || callerProfile.org_id || null;
      assertOrgAccess(callerProfile, callerRole, targetOrgId, softwareRole);

      const duplicateProfile = await fetchProfileByPhoneOrEmail(supabaseUrl, serviceRoleKey, {
        phone: normalizedPhone,
        email,
      });
      if (duplicateProfile?.id) {
        const duplicateIsPhoneMatch = normalizedPhone && toLocalIranMobile(normalizedPhone) === duplicateProfile.mobile_1;
        const releasedOrphanPhone = duplicateIsPhoneMatch
          ? await releaseOrphanProfilePhoneConflict(supabaseUrl, serviceRoleKey, duplicateProfile, normalizedPhone, {
            targetOrgId,
            canCrossOrg: callerRole === 'super_admin',
          })
          : false;
        if (!releasedOrphanPhone) {
          return json(409, {
            success: false,
            message: duplicateIsPhoneMatch
              ? 'برای این شماره موبایل قبلا کاربر ثبت شده است.'
              : 'برای این ایمیل قبلا کاربر ثبت شده است.',
          });
        }
      }

      const emailDuplicateProfile = email
        ? await fetchProfileByPhoneOrEmail(supabaseUrl, serviceRoleKey, { email })
        : null;
      if (emailDuplicateProfile?.id) {
        return json(409, {
          success: false,
          message: 'برای این ایمیل قبلا کاربر ثبت شده است.',
        });
      }

      const pendingInviteConflict = await fetchPendingInviteConflictByPhone(
        supabaseUrl,
        serviceRoleKey,
        normalizedPhone,
        targetOrgId,
      );
      if (pendingInviteConflict?.id) {
        return json(409, {
          success: false,
          message: 'برای این شماره در یک سازمان دیگر دعوت فعال وجود دارد و ایجاد کاربر مستقیم برای آن مجاز نیست.',
          reason_code: 'phone_invite_org_conflict',
          conflict_invite_id: pendingInviteConflict.id,
          conflict_org_id: pendingInviteConflict.org_id || null,
        });
      }
      const sameOrgPendingInvite = await fetchPendingInviteByPhone(
        supabaseUrl,
        serviceRoleKey,
        normalizedPhone,
        targetOrgId,
      );

      const existingAuthUsers = await findAuthUsersByPhone(supabaseUrl, serviceRoleKey, normalizedPhone);
      let orphanAuthUser: any = null;
      for (const existingAuthUser of existingAuthUsers) {
        const existingAuthUserId = String(existingAuthUser?.id || '').trim();
        if (!existingAuthUserId) continue;
        const existingAuthProfile = await fetchProfile(supabaseUrl, serviceRoleKey, existingAuthUserId);
        if (existingAuthProfile?.id) {
          return json(409, {
            success: false,
            message: 'برای این شماره موبایل قبلا کاربر ثبت شده است.',
            reason_code: 'phone_conflict',
          });
        }
        if (!orphanAuthUser) orphanAuthUser = existingAuthUser;
      }

      let createdNewAuthUser = false;
      const authPayload = {
        email: email || undefined,
        phone: toGoTruePhone(normalizedPhone),
        password,
        user_metadata: { full_name: fullName },
        email_confirm: email ? true : undefined,
        phone_confirm: false,
      };

      const authUser = orphanAuthUser?.id
        ? await updateAuthUser(supabaseUrl, serviceRoleKey, String(orphanAuthUser.id), authPayload)
        : await createAuthUser(supabaseUrl, serviceRoleKey, authPayload);
      createdNewAuthUser = !orphanAuthUser?.id;
      if (!authUser?.id) {
        throw new Error('ایجاد حساب احراز هویت ناموفق بود.');
      }

      const createdAuthUserId = String(authUser?.id || '').trim();
      if (!createdAuthUserId) {
        throw new Error('ایجاد حساب احراز هویت ناموفق بود.');
      }

      let profile: any = null;
      try {
        profile = await upsertProfile(supabaseUrl, serviceRoleKey, {
          id: createdAuthUserId,
          org_id: targetOrgId,
          full_name: fullName,
          email,
          mobile_1: toLocalIranMobile(normalizedPhone),
          role_id: roleId,
          role: softwareRole,
          avatar_url: avatarUrl,
          is_active: isActive,
        });
      } catch (profileError) {
        if (createdNewAuthUser) {
          await deleteAuthUser(supabaseUrl, serviceRoleKey, createdAuthUserId).catch(() => null);
        }
        throw profileError;
      }

      const persistedProfile = await fetchProfile(supabaseUrl, serviceRoleKey, createdAuthUserId);
      if (!persistedProfile?.id) {
        if (createdNewAuthUser) {
          await deleteAuthUser(supabaseUrl, serviceRoleKey, createdAuthUserId).catch(() => null);
        }
        throw new Error('ایجاد پروفایل کاربر نهایی نشد.');
      }

      if (sameOrgPendingInvite?.id) {
        await updatePendingInviteAsConsumed(supabaseUrl, serviceRoleKey, sameOrgPendingInvite.id, createdAuthUserId);
      }

      return json(200, {
        success: true,
        user: {
          id: createdAuthUserId,
          email: authUser.email || email,
          phone: authUser.phone || normalizedPhone,
        },
        profile: persistedProfile || profile,
      });
    }

    if (action === 'update_user') {
      const targetUserId = String(body?.userId || '').trim();
      if (!targetUserId) {
        return json(400, { success: false, message: 'شناسه کاربر الزامی است.' });
      }

      const targetProfile = await fetchProfile(supabaseUrl, serviceRoleKey, targetUserId);
      if (!targetProfile?.id) {
        return json(404, { success: false, message: 'پروفایل کاربر مقصد پیدا نشد.' });
      }

      const password = String(body?.password || '').trim();
      const fullName = String(body?.fullName || targetProfile.full_name || '').trim();
      const email = String(body?.email || '').trim() || null;
      const roleId = String(body?.roleId || targetProfile.role_id || '').trim() || null;
      const softwareRole = String(body?.role || targetProfile.role || '').trim() || 'viewer';
      const avatarUrl = String(body?.avatarUrl || '').trim() || null;
      const isActive = body?.isActive !== false;
      const normalizedPhone = normalizeIranMobileE164(body?.phone || targetProfile.mobile_1 || '');
      if (!fullName) {
        return json(400, { success: false, message: 'نام و نام خانوادگی الزامی است.' });
      }
      if (!normalizedPhone) {
        return json(400, { success: false, message: 'شماره موبایل معتبر نیست.' });
      }
      if (password && password.length < 6) {
        return json(400, { success: false, message: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' });
      }

      const duplicateProfile = await fetchProfileByPhoneOrEmail(supabaseUrl, serviceRoleKey, {
        phone: normalizedPhone,
        email,
        excludeUserId: targetUserId,
      });
      if (duplicateProfile?.id) {
        const duplicateIsPhoneMatch = normalizedPhone && toLocalIranMobile(normalizedPhone) === duplicateProfile.mobile_1;
        const releasedOrphanPhone = duplicateIsPhoneMatch
          ? await releaseOrphanProfilePhoneConflict(supabaseUrl, serviceRoleKey, duplicateProfile, normalizedPhone, {
            targetOrgId: body?.orgId || targetProfile.org_id || callerProfile.org_id,
            canCrossOrg: callerRole === 'super_admin',
          })
          : false;
        if (releasedOrphanPhone) {
          // Continue with the normal update path after freeing an orphan profile phone.
        } else {
          return json(409, {
            success: false,
            message: duplicateIsPhoneMatch
              ? 'این شماره موبایل قبلا برای کاربر دیگری ثبت شده است.'
              : 'این ایمیل قبلا برای کاربر دیگری ثبت شده است.',
          });
        }
      }

      const emailDuplicateProfile = email
        ? await fetchProfileByPhoneOrEmail(supabaseUrl, serviceRoleKey, {
          email,
          excludeUserId: targetUserId,
        })
        : null;
      if (emailDuplicateProfile?.id) {
        return json(409, {
          success: false,
          message: 'این ایمیل قبلا برای کاربر دیگری ثبت شده است.',
        });
      }

      const phoneRepair = await repairPhoneOwnerConflict(
        supabaseUrl,
        serviceRoleKey,
        targetUserId,
        normalizedPhone,
      );
      if (phoneRepair.blocked) {
        return json(409, {
          success: false,
          message: 'این شماره موبایل الان روی یک کاربر دیگر در احراز هویت ثبت شده است و نیاز به بررسی دستی دارد.',
          conflictUserId: phoneRepair.conflictUserId || null,
          conflictProfileId: phoneRepair.conflictProfileId || null,
        });
      }
      const resolvedRole = await resolveRoleForOrg(
        supabaseUrl,
        serviceRoleKey,
        roleId,
        body?.orgId || targetProfile.org_id || callerProfile.org_id,
      );
      const targetOrgId = resolvedRole.orgId || targetProfile.org_id || callerProfile.org_id || null;
      assertOrgAccess(callerProfile, callerRole, targetOrgId, softwareRole);
      const pendingInviteConflict = await fetchPendingInviteConflictByPhone(
        supabaseUrl,
        serviceRoleKey,
        normalizedPhone,
        targetOrgId,
      );
      if (pendingInviteConflict?.id) {
        return json(409, {
          success: false,
          message: 'برای این شماره در یک سازمان دیگر دعوت فعال وجود دارد و ثبت آن روی این کاربر مجاز نیست.',
          reason_code: 'phone_invite_org_conflict',
          conflict_invite_id: pendingInviteConflict.id,
          conflict_org_id: pendingInviteConflict.org_id || null,
        });
      }

      const authPayload: Record<string, any> = {
        email: email || undefined,
        phone: toGoTruePhone(normalizedPhone),
        user_metadata: { full_name: fullName },
        email_confirm: email ? true : undefined,
      };
      if (password) authPayload.password = password;
      if (normalizeIranMobileE164(targetProfile.mobile_1 || '') !== normalizedPhone) {
        authPayload.phone_confirm = false;
      }

      await updateAuthUser(supabaseUrl, serviceRoleKey, targetUserId, authPayload);
      const profile = await upsertProfile(supabaseUrl, serviceRoleKey, {
        id: targetUserId,
        org_id: targetOrgId,
        full_name: fullName,
        email,
        mobile_1: toLocalIranMobile(normalizedPhone),
        role_id: roleId,
        role: softwareRole,
        avatar_url: avatarUrl,
        is_active: isActive,
      });

      return json(200, { success: true, profile });
    }

    if (action === 'delete_user') {
      const targetUserId = String(body?.userId || '').trim();
      if (!targetUserId) {
        return json(400, { success: false, message: 'شناسه کاربر الزامی است.' });
      }
      if (targetUserId === String(callerProfile?.id || '')) {
        return json(400, { success: false, message: 'نمی‌توانید حساب کاربری خودتان را حذف کنید.' });
      }

      const targetProfile = await fetchProfile(supabaseUrl, serviceRoleKey, targetUserId);
      if (!targetProfile?.id) {
        return json(404, { success: false, message: 'پروفایل کاربر مقصد پیدا نشد.' });
      }

      assertOrgAccess(callerProfile, callerRole, targetProfile.org_id, targetProfile.role);
      await deleteAuthUser(supabaseUrl, serviceRoleKey, targetUserId);
      await deleteProfile(supabaseUrl, serviceRoleKey, targetUserId).catch(() => null);
      return json(200, { success: true });
    }

    if (action === 'send_phone_otp') {
      const targetUserId = String(body?.userId || '').trim();
      const normalizedPhone = normalizeIranMobileE164(body?.phone);
      if (!targetUserId || !normalizedPhone) {
        return json(400, { success: false, message: 'شناسه کاربر و شماره موبایل معتبر الزامی است.' });
      }

      const targetProfile = await fetchProfile(supabaseUrl, serviceRoleKey, targetUserId);
      if (!targetProfile?.id) {
        return json(404, { success: false, message: 'پروفایل کاربر مقصد پیدا نشد.' });
      }
      assertOrgAccess(callerProfile, callerRole, targetProfile.org_id, targetProfile.role);

      const phoneRepair = await repairPhoneOwnerConflict(
        supabaseUrl,
        serviceRoleKey,
        targetUserId,
        normalizedPhone,
      );
      if (phoneRepair.blocked) {
        return json(409, {
          success: false,
          message: 'این شماره موبایل الان روی یک کاربر دیگر ثبت شده است و ارسال کد جدید برای آن ممکن نیست.',
          conflictUserId: phoneRepair.conflictUserId || null,
          conflictProfileId: phoneRepair.conflictProfileId || null,
        });
      }
      const pendingInviteConflict = await fetchPendingInviteConflictByPhone(
        supabaseUrl,
        serviceRoleKey,
        normalizedPhone,
        targetProfile.org_id,
      );
      if (pendingInviteConflict?.id) {
        return json(409, {
          success: false,
          message: 'برای این شماره در یک سازمان دیگر دعوت فعال وجود دارد و ارسال کد تایید برای آن امن نیست.',
          reason_code: 'phone_invite_org_conflict',
          conflict_invite_id: pendingInviteConflict.id,
          conflict_org_id: pendingInviteConflict.org_id || null,
        });
      }

      const authUser = await fetchAuthUserById(supabaseUrl, serviceRoleKey, targetUserId);
      const currentAuthPhone = normalizeIranMobileE164(authUser?.phone || '');
      if (currentAuthPhone === normalizedPhone && !authUser?.phone_confirmed_at) {
        // Reset stale unconfirmed state before requesting a fresh central SMS OTP.
        await updateAuthUser(supabaseUrl, serviceRoleKey, targetUserId, {
          phone: null,
          phone_confirm: false,
        });
      }
      await updateAuthUser(supabaseUrl, serviceRoleKey, targetUserId, {
        phone: toGoTruePhone(normalizedPhone),
        phone_confirm: false,
      });
      await upsertProfile(supabaseUrl, serviceRoleKey, {
        id: targetUserId,
        mobile_1: toLocalIranMobile(normalizedPhone),
      });
      const otpResult = await sendSmsOtp(supabaseUrl, serviceRoleKey, normalizedPhone);
      return json(200, {
        success: true,
        messageId: otpResult?.message_id || null,
        otpType: 'sms',
      });
    }

    if (action === 'verify_phone_otp') {
      const targetUserId = String(body?.userId || '').trim();
      const normalizedPhone = normalizeIranMobileE164(body?.phone);
      const token = normalizeDigitsToEnglish(body?.token).replace(/\D+/g, '');
      if (!targetUserId || !normalizedPhone || !token) {
        return json(400, { success: false, message: 'شناسه کاربر، شماره موبایل و کد تایید الزامی است.' });
      }

      const targetProfile = await fetchProfile(supabaseUrl, serviceRoleKey, targetUserId);
      if (!targetProfile?.id) {
        return json(404, { success: false, message: 'پروفایل کاربر مقصد پیدا نشد.' });
      }
      assertOrgAccess(callerProfile, callerRole, targetProfile.org_id, targetProfile.role);

      const phoneRepair = await repairPhoneOwnerConflict(
        supabaseUrl,
        serviceRoleKey,
        targetUserId,
        normalizedPhone,
      );
      if (phoneRepair.blocked) {
        return json(409, {
          success: false,
          message: 'این شماره موبایل الان روی یک کاربر دیگر ثبت شده است و تایید آن برای این کاربر ممکن نیست.',
          conflictUserId: phoneRepair.conflictUserId || null,
          conflictProfileId: phoneRepair.conflictProfileId || null,
        });
      }
      const pendingInviteConflict = await fetchPendingInviteConflictByPhone(
        supabaseUrl,
        serviceRoleKey,
        normalizedPhone,
        targetProfile.org_id,
      );
      if (pendingInviteConflict?.id) {
        return json(409, {
          success: false,
          message: 'برای این شماره در یک سازمان دیگر دعوت فعال وجود دارد و تایید آن روی این کاربر امن نیست.',
          reason_code: 'phone_invite_org_conflict',
          conflict_invite_id: pendingInviteConflict.id,
          conflict_org_id: pendingInviteConflict.org_id || null,
        });
      }

      const authUser = await fetchAuthUserById(supabaseUrl, serviceRoleKey, targetUserId);
      const currentAuthPhone = normalizeIranMobileE164(authUser?.phone || '');
      if (currentAuthPhone !== normalizedPhone) {
        await updateAuthUser(supabaseUrl, serviceRoleKey, targetUserId, {
          phone: toGoTruePhone(normalizedPhone),
        });
      }
      await verifyPhoneOtp(supabaseUrl, serviceRoleKey, normalizedPhone, token, 'sms');
      await updateAuthUser(supabaseUrl, serviceRoleKey, targetUserId, {
        phone: toGoTruePhone(normalizedPhone),
        phone_confirm: true,
      });
      await upsertProfile(supabaseUrl, serviceRoleKey, {
        id: targetUserId,
        mobile_1: toLocalIranMobile(normalizedPhone),
      });
      return json(200, { success: true });
    }

    return json(400, { success: false, message: 'درخواست نامعتبر است.' });
  } catch (error) {
    console.error('user-admin error', error);
    const message = String(error instanceof Error ? error.message : error || 'خطای نامشخص');
    const reasonCode = String((error as any)?.reasonCode || '').trim() || null;
    const statusCode = Number((error as any)?.statusCode || 0);
    if (message.includes('users_phone_key') || message.includes('duplicate key value violates unique constraint')) {
      return json(409, {
        success: false,
        message: 'این شماره موبایل قبلا برای کاربر دیگری در احراز هویت ثبت شده است.',
        reason_code: 'phone_conflict',
      });
    }
    return json(statusCode >= 400 && statusCode < 600 ? statusCode : 500, {
      success: false,
      message: String(error instanceof Error ? error.message : error || 'خطای نامشخص'),
      reason_code: reasonCode,
    });
  }
});
