import { supabase } from '../supabaseClient';

export type PhoneLoginCandidateCheck = {
  normalized_phone?: string | null;
  exists_in_profiles?: boolean;
  exists_in_auth?: boolean;
  has_phone_identity?: boolean;
  is_active?: boolean;
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
