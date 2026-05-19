import { supabase } from '../supabaseClient';

export type PhoneLoginCandidateCheck = {
  normalized_phone?: string | null;
  exists_in_profiles?: boolean;
  exists_in_auth?: boolean;
  has_phone_identity?: boolean;
  is_active?: boolean;
  matched_profile_count?: number;
  org_id?: string | null;
  role_id?: string | null;
  role?: string | null;
};

export type PhoneSignupInviteCheck = {
  id?: string | null;
  normalized_phone?: string | null;
  exists?: boolean;
  org_id?: string | null;
  full_name?: string | null;
  email?: string | null;
  role_id?: string | null;
  role?: string | null;
  is_active?: boolean;
};

export type ConsumePhoneSignupInviteResult = {
  success?: boolean;
  reason?: string | null;
  invite_id?: string | null;
  profile_id?: string | null;
  org_id?: string | null;
  created_profile?: boolean;
  existing_org_id?: string | null;
};

export const lookupPhoneLoginCandidate = async (phoneNumber: string): Promise<PhoneLoginCandidateCheck | null> => {
  try {
    const { data, error } = await supabase.rpc('check_phone_login_candidate', { p_phone: phoneNumber });
    if (error || !data || typeof data !== 'object') return null;
    return data as PhoneLoginCandidateCheck;
  } catch {
    return null;
  }
};

export const lookupPhoneSignupInvite = async (phoneNumber: string): Promise<PhoneSignupInviteCheck | null> => {
  try {
    const { data, error } = await supabase.rpc('lookup_phone_signup_invite', { p_phone: phoneNumber });
    if (error || !data || typeof data !== 'object') return null;
    return data as PhoneSignupInviteCheck;
  } catch {
    return null;
  }
};

export const consumePhoneSignupInvite = async (
  phoneNumber: string,
  userId: string,
  email?: string | null
): Promise<ConsumePhoneSignupInviteResult | null> => {
  try {
    const { data, error } = await supabase.rpc('consume_phone_signup_invite', {
      p_phone: phoneNumber,
      p_user_id: userId,
      p_email: email || null,
    });
    if (error || !data || typeof data !== 'object') return null;
    return data as ConsumePhoneSignupInviteResult;
  } catch {
    return null;
  }
};

export const getPhoneOtpStatusMeta = (
  candidate: PhoneLoginCandidateCheck | null | undefined,
  rawPhone?: string | null
): { color: 'default' | 'processing' | 'success' | 'warning' | 'error'; text: string } => {
  if (!String(rawPhone || '').trim()) {
    return { color: 'default', text: 'بدون شماره' };
  }

  if (!candidate) {
    return { color: 'default', text: 'نامشخص' };
  }

  if (!candidate.exists_in_profiles) {
    return { color: 'error', text: 'ثبت نشده' };
  }

  if (candidate.is_active === false) {
    return { color: 'error', text: 'کاربر غیرفعال' };
  }

  if (!candidate.exists_in_auth) {
    return { color: 'warning', text: 'نیازمند همگام سازی' };
  }

  if (candidate.has_phone_identity) {
    return { color: 'success', text: 'آماده ورود پیامکی' };
  }

  return { color: 'processing', text: 'نیازمند تایید اولیه' };
};

const createOtpFlowError = (code: string) => {
  const error = new Error(code);
  (error as any).code = code;
  return error;
};

const normalizeOrgId = (value?: string | null) => String(value || '').trim();

export const getPhoneOwnershipErrorMessage = (
  error: unknown,
  fallback = 'وضعیت این شماره موبایل برای ادامه عملیات معتبر نیست.',
) => {
  const raw = String((error as any)?.code || (error as any)?.message || '').trim().toLowerCase();

  if (raw.includes('__phone_multiple_profiles__')) {
    return 'برای این شماره بیش از یک سابقه کاربری پیدا شد. قبل از ادامه باید تداخل شماره در کاربران بررسی شود.';
  }
  if (raw.includes('__phone_profile_exists_same_org__')) {
    return 'برای این شماره در همین سازمان قبلاً کاربر ثبت شده است.';
  }
  if (raw.includes('__phone_profile_exists_other_org__')) {
    return 'این شماره قبلاً در یک سازمان دیگر ثبت شده است و برای جلوگیری از تداخل بین سازمان‌ها قابل استفاده نیست.';
  }
  if (raw.includes('__phone_invite_exists_same_org__')) {
    return 'برای این شماره در همین سازمان قبلاً دعوت ثبت شده است.';
  }
  if (raw.includes('__phone_invite_exists_other_org__')) {
    return 'برای این شماره در یک سازمان دیگر دعوت فعال وجود دارد و برای جلوگیری از تداخل بین سازمان‌ها قابل استفاده نیست.';
  }
  if (raw.includes('__phone_profile_inactive__')) {
    return 'برای این شماره یک کاربر غیرفعال وجود دارد. ابتدا وضعیت همان کاربر را تعیین تکلیف کنید.';
  }
  if (raw.includes('__phone_org_target_missing__')) {
    return 'سازمان مقصد برای این عملیات مشخص نیست.';
  }

  return fallback;
};

export const assertLoginOtpRequestAllowed = (
  candidate: PhoneLoginCandidateCheck | null | undefined,
  invite: PhoneSignupInviteCheck | null | undefined,
) => {
  const hasInvite = !!invite?.exists;
  const canUseExistingPhoneIdentity =
    candidate?.exists_in_auth === true &&
    candidate?.has_phone_identity === true &&
    candidate?.is_active !== false;
  const hasActiveProfileInUsersList =
    candidate?.exists_in_profiles === true &&
    candidate?.is_active !== false;
  const hasActiveInviteInUsersList =
    hasInvite &&
    invite?.is_active !== false;

  if (candidate?.exists_in_profiles) {
    if (candidate.is_active === false) {
      throw createOtpFlowError('__otp_user_inactive__');
    }
  } else if (invite?.is_active === false) {
    throw createOtpFlowError('__otp_phone_invite_inactive__');
  }

  if (hasActiveProfileInUsersList && !canUseExistingPhoneIdentity) {
    if (candidate?.exists_in_auth) {
      throw createOtpFlowError(candidate?.has_phone_identity ? '__otp_phone_not_allowed__' : '__otp_phone_identity_missing__');
    }
    throw createOtpFlowError('__otp_phone_not_synced__');
  }

  if (!hasActiveInviteInUsersList && !canUseExistingPhoneIdentity) {
    throw createOtpFlowError('__otp_phone_not_allowed__');
  }
};

export const assertDemoOtpRequestAllowed = (
  candidate: PhoneLoginCandidateCheck | null | undefined,
  invite: PhoneSignupInviteCheck | null | undefined,
) => {
  if (candidate?.exists_in_profiles && candidate?.is_active === false) {
    throw createOtpFlowError('__otp_user_inactive__');
  }

  if (invite?.exists) {
    if (invite?.is_active === false) {
      throw createOtpFlowError('__otp_phone_invite_inactive__');
    }
    throw createOtpFlowError('__demo_phone_invited_to_org__');
  }

  if ((candidate?.matched_profile_count || 0) > 1) {
    throw createOtpFlowError('__demo_phone_multiple_profiles__');
  }

  if (candidate?.exists_in_profiles) {
    throw createOtpFlowError('__demo_phone_belongs_to_existing_org__');
  }

  if (candidate?.exists_in_auth) {
    throw createOtpFlowError('__demo_phone_existing_auth_user__');
  }
};

export const assertPhoneAvailableForOrg = (
  candidate: PhoneLoginCandidateCheck | null | undefined,
  invite: PhoneSignupInviteCheck | null | undefined,
  targetOrgId?: string | null,
  options?: { allowSameOrgPendingInvite?: boolean },
) => {
  const normalizedTargetOrgId = normalizeOrgId(targetOrgId);
  const normalizedCandidateOrgId = normalizeOrgId(candidate?.org_id);
  const normalizedInviteOrgId = normalizeOrgId(invite?.org_id);
  const allowSameOrgPendingInvite = options?.allowSameOrgPendingInvite !== false;

  if (!normalizedTargetOrgId) {
    throw createOtpFlowError('__phone_org_target_missing__');
  }

  if ((candidate?.matched_profile_count || 0) > 1) {
    throw createOtpFlowError('__phone_multiple_profiles__');
  }

  if (candidate?.exists_in_profiles) {
    if (candidate?.is_active === false) {
      throw createOtpFlowError('__phone_profile_inactive__');
    }
    if (normalizedCandidateOrgId && normalizedCandidateOrgId === normalizedTargetOrgId) {
      throw createOtpFlowError('__phone_profile_exists_same_org__');
    }
    throw createOtpFlowError('__phone_profile_exists_other_org__');
  }

  if (invite?.exists) {
    if (normalizedInviteOrgId && normalizedInviteOrgId === normalizedTargetOrgId) {
      if (allowSameOrgPendingInvite) {
        return { sameOrgPendingInvite: true };
      }
      throw createOtpFlowError('__phone_invite_exists_same_org__');
    }
    throw createOtpFlowError('__phone_invite_exists_other_org__');
  }

  return { sameOrgPendingInvite: false };
};
