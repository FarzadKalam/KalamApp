import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Card, Input, Tabs, theme } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { BRANDING_APPLIED_EVENT, DEFAULT_BRANDING } from '../theme/brandTheme';
import { readRuntimeBranding } from '../utils/brandingRuntime';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { getDefaultAuthenticatedAppPath } from '../utils/hostRouting';
import { getOtpErrorMessage, normalizeOtpPhone, normalizeOtpToken, OTP_RESEND_SECONDS, requestSmsOtp, verifySmsOtp } from '../utils/otpAuth';
import { consumePhoneSignupInvite, lookupPhoneLoginCandidate, lookupPhoneSignupInvite } from '../utils/phoneAuth';
import { normalizeIranMobile } from '../utils/phoneNumber';
import { trackSuccessfulLogin } from '../utils/userLoginTracking';

const LOGIN_MODE_STORAGE_KEY = 'kalam_login_mode';
const OTP_PHONE_STORAGE_KEY = 'kalam_login_otp_phone';
const OTP_REQUESTED_FOR_STORAGE_KEY = 'kalam_login_otp_requested_for';
const OTP_CODE_STORAGE_KEY = 'kalam_login_otp_code';
const OTP_COOLDOWN_UNTIL_STORAGE_KEY = 'kalam_login_otp_cooldown_until';

const readRuntimeBrandSnapshot = () => {
  const branding = readRuntimeBranding();
  return {
    title: branding.appTitle || branding.brandName || DEFAULT_BRANDING.brandName,
    logoUrl: branding.logoUrl || null,
  };
};

const Login = () => {
  const { message } = App.useApp();
  const [loginMode, setLoginMode] = useState<'password' | 'otp'>(() => {
    if (typeof window === 'undefined') return 'password';
    return window.localStorage.getItem(LOGIN_MODE_STORAGE_KEY) === 'otp' ? 'otp' : 'password';
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpRequestedFor, setOtpRequestedFor] = useState<string | null>(null);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [brandTitle, setBrandTitle] = useState(() => readRuntimeBrandSnapshot().title);
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(() => readRuntimeBrandSnapshot().logoUrl);
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();
  const postLoginRedirect = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    const redirectTo = String(params.get('redirectTo') || '').trim();
    if (redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {
      return redirectTo;
    }
    return getDefaultAuthenticatedAppPath();
  }, [location.search]);

  const normalizedPhone = useMemo(() => normalizeOtpPhone(phone), [phone]);
  const canVerifyOtp = !!otpRequestedFor && normalizeOtpToken(otpCode).length >= 4;

  const clearOtpSessionState = () => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(OTP_PHONE_STORAGE_KEY);
    window.sessionStorage.removeItem(OTP_REQUESTED_FOR_STORAGE_KEY);
    window.sessionStorage.removeItem(OTP_CODE_STORAGE_KEY);
    window.sessionStorage.removeItem(OTP_COOLDOWN_UNTIL_STORAGE_KEY);
  };

  useEffect(() => {
    const syncBranding = () => {
      const snapshot = readRuntimeBrandSnapshot();
      setBrandTitle(snapshot.title);
      setBrandLogoUrl(snapshot.logoUrl);
    };
    syncBranding();

    const hash = window.location.hash || '';
    const search = window.location.search || '';
    if (hash.includes('type=recovery') || search.includes('type=recovery')) {
      setRecoveryMode(true);
    }

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
      }
    });

    window.addEventListener(BRANDING_APPLIED_EVENT, syncBranding as EventListener);
    window.addEventListener('storage', syncBranding);

    return () => {
      subscription?.subscription?.unsubscribe();
      window.removeEventListener(BRANDING_APPLIED_EVENT, syncBranding as EventListener);
      window.removeEventListener('storage', syncBranding);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (loginMode !== 'otp') {
      clearOtpSessionState();
      return;
    }

    const savedPhone = window.sessionStorage.getItem(OTP_PHONE_STORAGE_KEY) || '';
    const savedRequestedFor = window.sessionStorage.getItem(OTP_REQUESTED_FOR_STORAGE_KEY) || '';
    const savedOtpCode = window.sessionStorage.getItem(OTP_CODE_STORAGE_KEY) || '';
    const savedCooldownUntil = Number(window.sessionStorage.getItem(OTP_COOLDOWN_UNTIL_STORAGE_KEY) || '0');

    if (savedPhone && !phone) setPhone(savedPhone);
    if (savedRequestedFor) setOtpRequestedFor(savedRequestedFor);
    if (savedOtpCode) setOtpCode(savedOtpCode);
    if (savedCooldownUntil > Date.now()) {
      setOtpCooldown(Math.ceil((savedCooldownUntil - Date.now()) / 1000));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginMode]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOGIN_MODE_STORAGE_KEY, loginMode);
    }
  }, [loginMode]);

  useEffect(() => {
    if (typeof window === 'undefined' || loginMode !== 'otp') return;
    window.sessionStorage.setItem(OTP_PHONE_STORAGE_KEY, phone);
  }, [loginMode, phone]);

  useEffect(() => {
    if (typeof window === 'undefined' || loginMode !== 'otp') return;
    if (otpRequestedFor) {
      window.sessionStorage.setItem(OTP_REQUESTED_FOR_STORAGE_KEY, otpRequestedFor);
    } else {
      window.sessionStorage.removeItem(OTP_REQUESTED_FOR_STORAGE_KEY);
    }
  }, [loginMode, otpRequestedFor]);

  useEffect(() => {
    if (typeof window === 'undefined' || loginMode !== 'otp') return;
    if (otpCode) {
      window.sessionStorage.setItem(OTP_CODE_STORAGE_KEY, otpCode);
    } else {
      window.sessionStorage.removeItem(OTP_CODE_STORAGE_KEY);
    }
  }, [loginMode, otpCode]);

  useEffect(() => {
    if (otpCooldown <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setOtpCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [otpCooldown]);

  useEffect(() => {
    if (typeof window === 'undefined' || loginMode !== 'otp') return;
    if (otpCooldown > 0) {
      const cooldownUntil = Date.now() + otpCooldown * 1000;
      window.sessionStorage.setItem(OTP_COOLDOWN_UNTIL_STORAGE_KEY, String(cooldownUntil));
    } else {
      window.sessionStorage.removeItem(OTP_COOLDOWN_UNTIL_STORAGE_KEY);
    }
  }, [loginMode, otpCooldown]);

  const resolveOrganizationAccess = async (
    preferredRoleName?: string | null,
    preferredOrgId?: string | null,
    preferredRoleId?: string | null
  ) => {
    let orgId = preferredOrgId || null;
    if (!orgId) {
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      orgId = org?.id || null;
    }

    const normalizedRoleName = String(preferredRoleName || '').trim().toLowerCase();
    const preferredRoleNames = [normalizedRoleName, 'viewer'].filter(Boolean);

    const { data: roles } = await supabase
      .from('org_roles')
      .select('id, title, org_id')
      .order('created_at', { ascending: true })
      .limit(200);

    const exactRole = preferredRoleId
      ? (roles || []).find((role: any) => String(role?.id || '') === String(preferredRoleId))
      : null;
    if (!orgId && exactRole?.org_id) {
      orgId = String(exactRole.org_id);
    }

    const matchingRole = (roles || []).find((role: any) => {
      const roleTitle = String(role?.title || '').trim().toLowerCase();
      const sameOrg = !orgId || !role?.org_id || String(role.org_id) === String(orgId);
      return sameOrg && preferredRoleNames.includes(roleTitle);
    });

    const fallbackRole = (roles || []).find((role: any) => !orgId || !role?.org_id || String(role.org_id) === String(orgId));

    return {
      orgId,
      roleId: exactRole?.id || matchingRole?.id || fallbackRole?.id || null,
      roleName:
        normalizedRoleName ||
        String(exactRole?.title || matchingRole?.title || fallbackRole?.title || 'viewer').trim().toLowerCase() ||
        'viewer',
    };
  };

  const repairProfileOrganizationAccess = async (profile: any, phoneNumber: string, userEmail?: string | null) => {
    const normalizedPhone = normalizeIranMobile(phoneNumber);
    const updates: Record<string, any> = {};

    let preferredOrgId = profile?.org_id || null;
    let preferredRoleId = profile?.role_id || null;
    let preferredRoleName = profile?.role || null;

    const invite = normalizedPhone ? await lookupPhoneSignupInvite(normalizedPhone) : null;
    if (invite?.exists) {
      preferredOrgId = preferredOrgId || invite.org_id || null;
      preferredRoleId = preferredRoleId || invite.role_id || null;
      preferredRoleName = preferredRoleName || invite.role || null;
      if (!String(profile?.full_name || '').trim() && String(invite?.full_name || '').trim()) {
        updates.full_name = String(invite.full_name).trim();
      }
      if (!String(profile?.email || '').trim() && String(invite?.email || '').trim()) {
        updates.email = String(invite.email).trim();
      }
    }

    if (!preferredOrgId || !preferredRoleId) {
      const resolved = await resolveOrganizationAccess(preferredRoleName, preferredOrgId, preferredRoleId);
      preferredOrgId = preferredOrgId || resolved.orgId;
      preferredRoleId = preferredRoleId || resolved.roleId;
      preferredRoleName = preferredRoleName || resolved.roleName;
    }

    if (!profile?.org_id && preferredOrgId) updates.org_id = preferredOrgId;
    if (!profile?.role_id && preferredRoleId) updates.role_id = preferredRoleId;
    if (!String(profile?.role || '').trim() && preferredRoleName) updates.role = preferredRoleName;
    if (!String(profile?.mobile_1 || '').trim() && normalizedPhone) {
      updates.mobile_1 = normalizedPhone.replace(/^\+98/, '0');
    }
    if (!String(profile?.email || '').trim() && String(userEmail || '').trim()) {
      updates.email = String(userEmail).trim();
    }

    if (Object.keys(updates).length === 0) {
      return {
        orgId: profile?.org_id || null,
        roleId: profile?.role_id || null,
      };
    }

    const { error } = await supabase.from('profiles').update(updates).eq('id', profile.id);
    if (error) throw error;

    return {
      orgId: updates.org_id ?? profile?.org_id ?? null,
      roleId: updates.role_id ?? profile?.role_id ?? null,
    };
  };

  const findExistingProfileConflict = async (phoneNumber: string, userEmail?: string | null, excludeUserId?: string | null) => {
    const normalizedPhoneLocal = normalizeIranMobile(phoneNumber)?.replace(/^\+98/, '0') || '';
    const normalizedEmail = String(userEmail || '').trim().toLowerCase();
    const excludedId = String(excludeUserId || '').trim();

    if (normalizedPhoneLocal) {
      let phoneQuery = supabase
        .from('profiles')
        .select('id, org_id, role_id, role, mobile_1, email, full_name, is_active')
        .eq('mobile_1', normalizedPhoneLocal)
        .limit(1);
      if (excludedId) {
        phoneQuery = phoneQuery.neq('id', excludedId);
      }
      const { data: phoneRows } = await phoneQuery;
      const phoneProfile = Array.isArray(phoneRows) ? phoneRows[0] : null;
      if (phoneProfile?.id) return phoneProfile;
    }

    if (normalizedEmail) {
      let emailQuery = supabase
        .from('profiles')
        .select('id, org_id, role_id, role, mobile_1, email, full_name, is_active')
        .eq('email', normalizedEmail)
        .limit(1);
      if (excludedId) {
        emailQuery = emailQuery.neq('id', excludedId);
      }
      const { data: emailRows } = await emailQuery;
      const emailProfile = Array.isArray(emailRows) ? emailRows[0] : null;
      if (emailProfile?.id) return emailProfile;
    }

    return null;
  };

  const repairLegacyPhoneLoginConflict = async (phoneNumber: string) => {
    const { data, error } = await supabase.functions.invoke('user-admin', {
      body: {
        action: 'repair_legacy_phone_login',
        phone: phoneNumber,
      },
    });

    if (error) throw error;
    if (!data?.success) {
      throw new Error(String(data?.message || '__otp_phone_profile_conflict__'));
    }

    return data;
  };

  const ensureActiveSessionUser = async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user?.id) return;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, is_active, org_id, role_id, role, mobile_1, email, full_name')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (profile?.is_active === false) {
      await supabase.auth.signOut();
      throw new Error('__otp_user_inactive__');
    }

    if (profile?.id) {
      await repairProfileOrganizationAccess(profile, userData.user.phone || profile.mobile_1 || '', userData.user.email || null);
    }
  };

  const ensureInvitedOrExistingProfile = async (phoneNumber: string) => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user?.id) {
      throw new Error('__otp_phone_not_allowed__');
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email || null;

    const { data: existingProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, org_id, role_id, role, mobile_1, email, full_name, is_active')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) throw profileError;
    if (existingProfile?.id) {
      await repairProfileOrganizationAccess(existingProfile, phoneNumber, userEmail);
      return;
    }

    const inviteResult = await consumePhoneSignupInvite(phoneNumber, userId, userEmail);
    if (inviteResult?.success) return;

    const candidate = await lookupPhoneLoginCandidate(phoneNumber);
    if ((candidate?.exists_in_profiles || candidate?.exists_in_auth) && candidate?.is_active !== false) {
      const conflictProfile = await findExistingProfileConflict(phoneNumber, userEmail, userId);
      if (conflictProfile?.id) {
        try {
          const repairResult = await repairLegacyPhoneLoginConflict(phoneNumber);
          if (repairResult?.repaired) {
            await supabase.auth.signOut();
            const { error: resendError } = await supabase.auth.signInWithOtp({
              phone: phoneNumber,
            });
            if (resendError) throw resendError;
            setOtpRequestedFor(phoneNumber);
            setOtpCode('');
            setOtpCooldown(OTP_RESEND_SECONDS);
            throw new Error('__otp_phone_repaired_retry__');
          }
        } catch (repairError: any) {
          const rawRepairError = String(repairError?.message || '');
          if (rawRepairError.includes('__otp_phone_repaired_retry__')) {
            throw repairError;
          }
        }

        await supabase.auth.signOut();
        throw new Error('__otp_phone_profile_conflict__');
      }

      const resolvedAccess = await resolveOrganizationAccess('viewer', null);
      const mobileLocal = normalizeIranMobile(phoneNumber)?.replace(/^\+98/, '0') || '';
      const { error: insertProfileError } = await supabase.from('profiles').upsert([
        {
          id: userId,
          org_id: resolvedAccess.orgId,
          role_id: resolvedAccess.roleId,
          role: resolvedAccess.roleName || 'viewer',
          full_name: userData.user.user_metadata?.full_name || userEmail || 'کاربر',
          email: userEmail,
          mobile_1: mobileLocal || null,
          is_active: true,
        },
      ]);
      if (!insertProfileError) {
        return;
      }
      if (String((insertProfileError as any)?.code || '') === '23505') {
        await supabase.auth.signOut();
        throw new Error('__otp_phone_profile_conflict__');
      }
    }

    await supabase.auth.signOut();
    if (inviteResult?.reason === 'invite_inactive') {
      throw new Error('__otp_phone_invite_inactive__');
    }
    throw new Error('__otp_phone_not_allowed__');
  };

  const handleLogin = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      await ensureActiveSessionUser();
      await trackSuccessfulLogin('password');

      message.success('خوش آمدید! در حال ورود...');
        navigate(postLoginRedirect, { replace: true });
    } catch (error: any) {
      const raw = String(error?.message || '');
      if (raw.includes('__otp_user_inactive__')) {
        message.error('حساب کاربری شما غیرفعال است و امکان ورود وجود ندارد.');
      } else {
        message.error(toFaErrorMessage(error, 'ورود ناموفق بود.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async () => {
    if (!normalizedPhone) {
      message.error('شماره موبایل معتبر وارد کنید. مثال: 0912...');
      return;
    }

    setOtpLoading(true);
    try {
      const candidate = await lookupPhoneLoginCandidate(normalizedPhone);
      const invite = await lookupPhoneSignupInvite(normalizedPhone);
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
          throw new Error('__otp_user_inactive__');
        }
      } else {
        if (invite?.is_active === false) {
          throw new Error('__otp_phone_invite_inactive__');
        }
      }

      if (hasActiveProfileInUsersList && !canUseExistingPhoneIdentity) {
        if (candidate?.exists_in_auth) {
          throw new Error(candidate?.has_phone_identity ? '__otp_phone_not_allowed__' : '__otp_phone_identity_missing__');
        }
        throw new Error('__otp_phone_not_synced__');
      }

      if (!hasActiveInviteInUsersList && !canUseExistingPhoneIdentity) {
        throw new Error('__otp_phone_not_allowed__');
      }

      const requestedPhone = await requestSmsOtp(supabase.auth, normalizedPhone);
      setOtpRequestedFor(requestedPhone);
      setOtpCode('');
      setOtpCooldown(OTP_RESEND_SECONDS);
      message.success('کد تایید ارسال شد.');
    } catch (error: any) {
      message.error(getOtpErrorMessage(error));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const normalizedOtpToken = normalizeOtpToken(otpCode);
    if (!otpRequestedFor) {
      message.error('ابتدا درخواست کد بدهید.');
      return;
    }
    if (!normalizedOtpToken) {
      message.error('کد تایید را وارد کنید.');
      return;
    }

    setOtpLoading(true);
    try {
      await verifySmsOtp(supabase.auth, otpRequestedFor, normalizedOtpToken);
      await ensureInvitedOrExistingProfile(otpRequestedFor);
      await ensureActiveSessionUser();
      await trackSuccessfulLogin('otp');
      clearOtpSessionState();
      setOtpRequestedFor(null);
      setOtpCode('');
      setOtpCooldown(0);

      message.success('ورود با موفقیت انجام شد.');
        navigate(postLoginRedirect, { replace: true });
    } catch (error: any) {
      const raw = String(error?.message || '');
      if (raw.includes('__otp_phone_repaired_retry__')) {
        message.success(getOtpErrorMessage(error));
      } else {
        message.error(getOtpErrorMessage(error));
      }
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      message.error('لطفا ایمیل را وارد کنید');
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });

    if (error) {
      message.error(toFaErrorMessage(error, 'ارسال ایمیل ناموفق بود.'));
    } else {
      message.success('لینک بازیابی رمز عبور ارسال شد');
    }
  };

  const handleSetNewPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      message.error('رمز عبور جدید باید حداقل ۶ کاراکتر باشد');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      message.error('رمز عبور و تکرار آن یکسان نیست');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      message.success('رمز عبور با موفقیت تغییر کرد');
      setRecoveryMode(false);
      setNewPassword('');
      setConfirmNewPassword('');
      window.history.replaceState({}, document.title, '/login');
        navigate(postLoginRedirect, { replace: true });
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'تغییر رمز عبور ناموفق بود.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8 transition-colors"
      style={{
        background: `radial-gradient(circle at top, rgba(var(--brand-200-rgb), 0.28), transparent 36%), ${token.colorBgLayout}`,
      }}
    >
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div
            className="rounded-2xl px-6 py-4 transition-colors"
            style={{
              background: token.colorBgContainer,
              border: `1px solid ${token.colorBorderSecondary}`,
              boxShadow: token.boxShadowSecondary,
            }}
          >
            {brandLogoUrl ? (
              <div className="mb-3 flex justify-center">
                <img src={brandLogoUrl} alt={brandTitle} className="h-14 max-w-[180px] object-contain" />
              </div>
            ) : null}
            <div className="text-lg font-black text-leather-600">{brandTitle}</div>
            <div className="text-xs mt-1" style={{ color: token.colorTextTertiary }}>
              Business Automation Platform
            </div>
          </div>
        </div>

        <Card
          title="ورود به سیستم"
          className="w-full rounded-2xl overflow-hidden"
          style={{
            background: token.colorBgContainer,
            borderColor: token.colorBorderSecondary,
            boxShadow: token.boxShadow,
          }}
          styles={{
            header: {
              background: token.colorBgContainer,
              color: token.colorTextHeading,
              borderBottomColor: token.colorBorderSecondary,
            },
            body: {
              background: token.colorBgContainer,
              color: token.colorText,
            },
          }}
        >
          {recoveryMode ? (
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">رمز عبور جدید</label>
                <Input.Password
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="حداقل ۶ کاراکتر"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">تکرار رمز عبور جدید</label>
                <Input.Password
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="تکرار رمز عبور"
                />
              </div>
              <Button
                type="primary"
                onClick={handleSetNewPassword}
                loading={loading}
                className="w-full bg-leather-600 h-10 text-lg"
              >
                ثبت رمز جدید
              </Button>
              <Button
                type="link"
                onClick={() => {
                  setRecoveryMode(false);
                  window.history.replaceState({}, document.title, '/login');
                }}
                className="text-xs"
              >
                بازگشت به ورود
              </Button>
            </div>
          ) : (
            <Tabs
              activeKey={loginMode}
              onChange={(key) => setLoginMode(key as 'password' | 'otp')}
              items={[
                {
                  key: 'password',
                  label: 'رمز عبور',
                  children: (
                    <div className="flex flex-col gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">ایمیل</label>
                        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">رمز عبور</label>
                        <Input.Password value={password} onChange={(e) => setPassword(e.target.value)} placeholder="رمز عبور" />
                      </div>
                      <Button type="primary" onClick={handleLogin} loading={loading} className="w-full bg-leather-600 h-10 text-lg">
                        ورود
                      </Button>
                      <Button type="link" onClick={handleResetPassword} className="text-xs">
                        فراموشی رمز عبور
                      </Button>
                    </div>
                  ),
                },
                {
                  key: 'otp',
                  label: 'کد یکبارمصرف',
                  children: (
                    <div className="flex flex-col gap-4">
                      <Alert
                        type="info"
                        showIcon
                        message="ورود با کد یکبارمصرف"
                        description={`برای ورود با شماره، باید کاربری شما در سازمان "${brandTitle}" تعریف شده باشد و شماره شما تایید شده باشد.`}
                      />
                      <div>
                        <label className="block text-sm font-medium mb-1">شماره موبایل</label>
                        <Input
                          dir="ltr"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="0912..."
                        />
                        {normalizedPhone ? (
                          <div className="mt-1 text-[11px]" style={{ color: token.colorTextTertiary }}>
                            فرمت احراز هویت: {normalizedPhone}
                          </div>
                        ) : null}
                      </div>

                      <Button
                        type="primary"
                        loading={otpLoading && !canVerifyOtp}
                        onClick={handleRequestOtp}
                        className="w-full bg-leather-600 h-10 text-lg"
                      >
                        دریافت کد
                      </Button>

                      {otpRequestedFor ? (
                        <>
                          <div>
                            <label className="block text-sm font-medium mb-1">کد تایید</label>
                            <Input
                              dir="ltr"
                              value={otpCode}
                              onChange={(e) => setOtpCode(e.target.value)}
                              placeholder="123456"
                            />
                          </div>
                          <Button
                            type="primary"
                            loading={otpLoading && canVerifyOtp}
                            onClick={handleVerifyOtp}
                            className="w-full bg-leather-600 h-10 text-lg"
                          >
                            ورود با کد
                          </Button>
                          <Button
                            type="link"
                            disabled={otpCooldown > 0 || otpLoading}
                            onClick={handleRequestOtp}
                            className="text-xs"
                          >
                            {otpCooldown > 0 ? `ارسال مجدد تا ${otpCooldown} ثانیه دیگر` : 'ارسال مجدد کد'}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  ),
                },
              ]}
            />
          )}
        </Card>

        <div className="mt-4 text-center text-[11px]" style={{ color: token.colorTextTertiary }}>
          نسخه آزمایشی {import.meta.env.VITE_APP_VERSION || '1.0.2'}
        </div>
      </div>
    </div>
  );
};

export default Login;
