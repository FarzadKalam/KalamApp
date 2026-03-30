// @ts-nocheck

type UserAdminAction =
  | 'set_user_password'
  | 'create_user'
  | 'update_user'
  | 'send_phone_otp'
  | 'verify_phone_otp'
  | 'repair_legacy_phone_login';

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

const normalizeIranMobileE164 = (value?: string | null) => {
  const raw = String(value || '').trim();
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

const isPrivilegedRole = (role?: string | null) =>
  ['super_admin', 'admin', 'manager'].includes(String(role || '').trim().toLowerCase());

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
  url.searchParams.set('select', 'id,title,org_id');
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

const fetchPendingInviteByPhone = async (supabaseUrl: string, serviceRoleKey: string, phoneE164?: string | null) => {
  const normalizedPhone = normalizeIranMobileE164(phoneE164);
  if (!normalizedPhone) return null;

  const url = restUrl(supabaseUrl, 'phone_signup_invites');
  url.searchParams.set('phone_e164', `eq.${normalizedPhone}`);
  url.searchParams.set('consumed_at', 'is.null');
  url.searchParams.set('select', 'id,org_id,is_active');
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
  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    throw new Error(String(parsed?.msg || parsed?.message || raw || 'ایجاد کاربر ناموفق بود'));
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
  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    throw new Error(String(parsed?.msg || parsed?.message || raw || 'بروزرسانی کاربر ناموفق بود'));
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

  const targetPhoneRepair = await repairPhoneOwnerConflict(
    supabaseUrl,
    serviceRoleKey,
    String(targetProfile.id),
    normalizedPhone,
  );
  if (targetPhoneRepair.blocked) {
    return {
      repaired: false,
      reason: 'target_phone_blocked',
      conflictUserId: targetPhoneRepair.conflictUserId || null,
      conflictProfileId: targetPhoneRepair.conflictProfileId || null,
      targetUserId: String(targetProfile.id || ''),
    };
  }

  await updateAuthUser(supabaseUrl, serviceRoleKey, String(targetProfile.id), {
    phone: normalizedPhone,
    phone_confirm: true,
  });
  await upsertProfile(supabaseUrl, serviceRoleKey, {
    id: String(targetProfile.id),
    mobile_1: toLocalIranMobile(normalizedPhone),
  });

  return {
    repaired: true,
    targetUserId: String(targetProfile.id || ''),
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
  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    throw new Error(String(parsed?.msg || parsed?.message || raw || 'ارسال کد تایید ناموفق بود'));
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
    throw new Error(String(parsed?.msg || parsed?.message || parsed || 'ارسال کد تایید ناموفق بود'));
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
  const response = await fetch(authUrl(supabaseUrl, '/verify'), {
    method: 'POST',
    headers: getServiceHeaders(serviceRoleKey),
    body: JSON.stringify({
      phone,
      token,
      type,
    }),
  });
  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    throw new Error(String(parsed?.msg || parsed?.message || raw || 'تایید کد پیامکی ناموفق بود'));
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
  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    throw new Error(String(parsed?.message || raw || 'ایجاد پروفایل ناموفق بود'));
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
    if (!callerProfile?.id) {
      return json(403, { success: false, message: 'پروفایل کاربر فعلی پیدا نشد.' });
    }

    const callerRole = String(callerProfile?.role || '').trim().toLowerCase();
    if (!isPrivilegedRole(callerRole)) {
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

      const duplicateProfile = await fetchProfileByPhoneOrEmail(supabaseUrl, serviceRoleKey, {
        phone: normalizedPhone,
        email,
      });
      if (duplicateProfile?.id) {
        return json(409, {
          success: false,
          message:
            normalizedPhone && toLocalIranMobile(normalizedPhone) === duplicateProfile.mobile_1
              ? 'برای این شماره موبایل قبلا کاربر ثبت شده است.'
              : 'برای این ایمیل قبلا کاربر ثبت شده است.',
        });
      }

      const resolvedRole = await resolveRoleForOrg(supabaseUrl, serviceRoleKey, roleId, body?.orgId || callerProfile.org_id);
      const targetOrgId = resolvedRole.orgId || callerProfile.org_id || null;
      assertOrgAccess(callerProfile, callerRole, targetOrgId, softwareRole);

      const authUser = await createAuthUser(supabaseUrl, serviceRoleKey, {
        email: email || undefined,
        phone: normalizedPhone,
        password,
        user_metadata: { full_name: fullName },
        email_confirm: email ? true : undefined,
        phone_confirm: false,
      });
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
        await deleteAuthUser(supabaseUrl, serviceRoleKey, createdAuthUserId).catch(() => null);
        throw profileError;
      }

      const persistedProfile = await fetchProfile(supabaseUrl, serviceRoleKey, createdAuthUserId);
      if (!persistedProfile?.id) {
        await deleteAuthUser(supabaseUrl, serviceRoleKey, createdAuthUserId).catch(() => null);
        throw new Error('ایجاد پروفایل کاربر نهایی نشد.');
      }

      const pendingInvite = await fetchPendingInviteByPhone(supabaseUrl, serviceRoleKey, normalizedPhone);
      if (pendingInvite?.id) {
        await updatePendingInviteAsConsumed(supabaseUrl, serviceRoleKey, pendingInvite.id, createdAuthUserId);
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
        return json(409, {
          success: false,
          message:
            normalizedPhone && toLocalIranMobile(normalizedPhone) === duplicateProfile.mobile_1
              ? 'این شماره موبایل قبلا برای کاربر دیگری ثبت شده است.'
              : 'این ایمیل قبلا برای کاربر دیگری ثبت شده است.',
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

      const authPayload: Record<string, any> = {
        email: email || undefined,
        phone: normalizedPhone,
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

      const authUser = await fetchAuthUserById(supabaseUrl, serviceRoleKey, targetUserId);
      const currentAuthPhone = normalizeIranMobileE164(authUser?.phone || '');
      if (currentAuthPhone === normalizedPhone && !authUser?.phone_confirmed_at) {
        // Seed a real phone_change flow for admin-created/unconfirmed users.
        await updateAuthUser(supabaseUrl, serviceRoleKey, targetUserId, {
          phone: null,
          phone_confirm: false,
        });
      }
      await updateAuthUser(supabaseUrl, serviceRoleKey, targetUserId, {
        phone: normalizedPhone,
        phone_confirm: false,
      });
      await upsertProfile(supabaseUrl, serviceRoleKey, {
        id: targetUserId,
        mobile_1: toLocalIranMobile(normalizedPhone),
      });
      const otpResult = await resendOtp(supabaseUrl, serviceRoleKey, normalizedPhone, 'phone_change');
      return json(200, {
        success: true,
        messageId: otpResult?.message_id || null,
        otpType: 'phone_change',
      });
    }

    if (action === 'verify_phone_otp') {
      const targetUserId = String(body?.userId || '').trim();
      const normalizedPhone = normalizeIranMobileE164(body?.phone);
      const token = String(body?.token || '').trim();
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

      const authUser = await fetchAuthUserById(supabaseUrl, serviceRoleKey, targetUserId);
      const currentAuthPhone = normalizeIranMobileE164(authUser?.phone || '');
      if (currentAuthPhone !== normalizedPhone) {
        await updateAuthUser(supabaseUrl, serviceRoleKey, targetUserId, {
          phone: normalizedPhone,
        });
      }
      await verifyPhoneOtp(supabaseUrl, serviceRoleKey, normalizedPhone, token, 'phone_change');
      return json(200, { success: true });
    }

    return json(400, { success: false, message: 'درخواست نامعتبر است.' });
  } catch (error) {
    console.error('user-admin error', error);
    const message = String(error instanceof Error ? error.message : error || 'خطای نامشخص');
    if (message.includes('users_phone_key') || message.includes('duplicate key value violates unique constraint')) {
      return json(409, {
        success: false,
        message: 'این شماره موبایل قبلا برای کاربر دیگری در احراز هویت ثبت شده است.',
      });
    }
    return json(500, {
      success: false,
      message: String(error instanceof Error ? error.message : error || 'خطای نامشخص'),
    });
  }
});
