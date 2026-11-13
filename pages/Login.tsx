import { normalizeEmail } from '../utils/email';
import { CURRENT_APP_VERSION } from '../utils/appVersionUpdate';
import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Card, Input, Modal, Tabs, theme } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { BRANDING_APPLIED_EVENT, DEFAULT_BRANDING } from '../theme/brandTheme';
import { readRuntimeBranding } from '../utils/brandingRuntime';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { getDefaultAuthenticatedAppPath, isInternalRootHost, isLocalHost, isSaasAdminPanelHost, isSaasAppHost, isTenantHost } from '../utils/hostRouting';
import { activateSaasAdminPanelContext } from '../utils/saasAdminPanel';
import { getOtpErrorMessage, normalizeOtpPhone, normalizeOtpToken, OTP_RESEND_SECONDS, requestSmsOtp, verifySmsOtp } from '../utils/otpAuth';
import { assertLoginOtpRequestAllowed, consumePhoneSignupInvite, lookupPhoneLoginCandidate, lookupPhoneSignupInvite, requestExistingProfilePhoneOtp } from '../utils/phoneAuth';
import { normalizeIranMobile } from '../utils/phoneNumber';
import { trackSuccessfulLogin } from '../utils/userLoginTracking';
import { signOutLocalSession } from '../utils/authSession';
import { clearSessionBootstrapCache, fetchSessionBootstrap } from '../utils/sessionCache';
import useUserAnnouncements from '../hooks/useUserAnnouncements';
import UserAnnouncementsBanner from '../components/announcements/UserAnnouncementsBanner';
import UserAnnouncementsPopupHost from '../components/announcements/UserAnnouncementsPopupHost';
import ResilientImage from '../components/common/ResilientImage';
import OtpCodeInput from '../components/common/OtpCodeInput';
import { formatIranMobileForInput } from '../utils/phoneNumber';
import { handoffSessionToTenant } from '../utils/tenantSessionHandoff';
import { selectOrganizationContext } from '../utils/organizationContext';

const LOGIN_MODE_STORAGE_KEY = 'kalam_login_mode';
const OTP_PHONE_STORAGE_KEY = 'kalam_login_otp_phone';
const OTP_REQUESTED_FOR_STORAGE_KEY = 'kalam_login_otp_requested_for';
const OTP_CODE_STORAGE_KEY = 'kalam_login_otp_code';
const OTP_COOLDOWN_UNTIL_STORAGE_KEY = 'kalam_login_otp_cooldown_until';

type OrganizationAccess = {
  org_id: string;
  org_name: string;
  role_name: string;
  is_owner: boolean;
  slug?: string | null;
  resolved_host?: string | null;
};

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
  const [phoneRecovery, setPhoneRecovery] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [brandTitle, setBrandTitle] = useState(() => readRuntimeBrandSnapshot().title);
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(() => readRuntimeBrandSnapshot().logoUrl);
  const [organizationChoices, setOrganizationChoices] = useState<OrganizationAccess[]>([]);
  const [organizationSelecting, setOrganizationSelecting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();
  const {
    headerAnnouncements,
    popupAnnouncements,
    dismissAnnouncement,
  } = useUserAnnouncements({
    surface: 'login_page',
    path: `${location.pathname}${location.search || ''}`,
  });
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
    const savedCooldownUntil = Number(window.sessionStorage.getItem(OTP_COOLDOWN_UNTIL_STORAGE_KEY) || '0');

    if (savedPhone && !phone) setPhone(savedPhone);
    if (savedRequestedFor) setOtpRequestedFor(savedRequestedFor);
    // OTP کد را هرگز از sessionStorage بازیابی نکن — کد منقضی شده موجب خطای 403 می‌شود.
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

  // OTP کد ذخیره نمی‌شود چون بازیابی کد منقضی شده موجب خطای 403 می‌شود.

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

  const ensureActiveSessionUser = async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user?.id) throw new Error('نشست ورود معتبر نیست. دوباره وارد شوید.');

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, is_active, org_id, role_id, role, mobile_1, email, full_name')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile?.id) throw new Error('اطلاعات حساب کامل نیست. با پشتیبانی تماس بگیرید.');
  };

  const refreshAuthenticatedSessionBootstrap = async () => {
    clearSessionBootstrapCache();
    await fetchSessionBootstrap(supabase, { force: true });
  };

  const activateOrganizationAndRedirect = async (organization: OrganizationAccess) => {
    setOrganizationSelecting(true);
    try {
      const { data, error } = await supabase.rpc('activate_current_user_organization', { p_org_id: organization.org_id });
      if (error || !data?.success) throw error || new Error('دسترسی شما به این سازمان فعال نیست.');
      selectOrganizationContext(organization.org_id);
      clearSessionBootstrapCache();
      await refreshAuthenticatedSessionBootstrap();
      await trackSuccessfulLogin(loginMode);
      const host = String(organization.resolved_host || '').trim().toLowerCase();
      if (host && !isLocalHost()) {
        if (isSaasAppHost() && host !== window.location.hostname) {
          if (host.endsWith('.tazesystem.ir')) {
            await handoffSessionToTenant(host, organization.org_id);
          } else {
            window.location.href = `https://${host}/login`;
            return;
          }
        }
        setOrganizationChoices([]);
        window.location.href = `https://${host}${postLoginRedirect}`;
        return;
      }
      setOrganizationChoices([]);
      navigate(postLoginRedirect, { replace: true });
    } catch (error: any) {
      if (isSaasAppHost()) setOrganizationChoices((current) => current.length ? current : [organization]);
      message.error(toFaErrorMessage(error, 'ورود به سازمان انتخاب‌شده ناموفق بود.'));
    } finally {
      setOrganizationSelecting(false);
    }
  };

  const resolveOrganizationAfterLogin = async () => {
    // panel.tazesystem.ir یک tenant نیست. مدیر SaaS پیش از خواندن فهرست
    // سازمان‌ها در سمت سرور به سازمان مستقل ارائه‌دهنده منتقل می‌شود.
    if (isSaasAdminPanelHost()) {
      const panelContext = await activateSaasAdminPanelContext(supabase);
      if (!panelContext.activated) {
        await signOutLocalSession();
        throw new Error('دسترسی به پنل مدیریت تازه سیستم برای این حساب فعال نیست.');
      }
    }

    const { data, error } = await supabase.rpc('get_current_user_organization_accesses');
    if (error) throw new Error('فهرست سازمان‌های شما دریافت نشد. دوباره تلاش کنید.');

    const organizations = Array.isArray(data)
      ? data.filter((item): item is OrganizationAccess => !!item?.org_id && !!item?.org_name)
      : [];
    if (organizations.length === 0) {
      await signOutLocalSession();
      throw new Error('عضویت فعالی برای این حساب پیدا نشد. با مدیر سازمان تماس بگیرید.');
    }

    const currentHost = typeof window === 'undefined' ? '' : window.location.hostname.toLowerCase();
    const tenantOrganization = organizations.find(
      (item) => String(item.resolved_host || '').trim().toLowerCase() === currentHost,
    );

    // زیردامنهٔ tenant فقط برای همان سازمان معتبر است. حتی اگر حساب به یک
    // سازمان داخلی با host خالی دسترسی داشته باشد، نباید زیر برند tenant باز شود.
    if (isTenantHost(currentHost)) {
      if (!tenantOrganization) {
        await signOutLocalSession();
        throw new Error('این حساب به سازمان این آدرس دسترسی ندارد.');
      }
      await activateOrganizationAndRedirect(tenantOrganization);
      return;
    }

    if (isSaasAdminPanelHost(currentHost)) {
      if (!tenantOrganization) throw new Error('عضویت فعال در سازمان مدیریت تازه سیستم پیدا نشد.');
      await activateOrganizationAndRedirect(tenantOrganization);
      return;
    }

    if (isLocalHost(currentHost)) {
      if (organizations.length === 1) {
        await activateOrganizationAndRedirect(organizations[0]);
        return;
      }
      setOrganizationChoices(organizations);
      return;
    }

    // Resolve the exact organization bound to this host; never guess from an empty hostname.
    if (isInternalRootHost(currentHost)) {
      const { data: branding, error: brandingError } = await supabase.rpc('get_public_branding', { p_hostname: currentHost });
      if (brandingError) throw new Error('سازمان این آدرس مشخص نشد. دوباره تلاش کنید.');
      const boundOrgId = (Array.isArray(branding) ? branding[0] : branding)?.org_id;
      const internalOrganization = organizations.find(item => item.org_id === boundOrgId);
      if (!internalOrganization) {
        await signOutLocalSession();
        throw new Error('عضویت شما در سازمان این آدرس فعال نیست. از ورود عمومی سازمان دیگری انتخاب کنید.');
      }
      await activateOrganizationAndRedirect(internalOrganization);
      return;
    }

    if (isSaasAppHost(currentHost) || isLocalHost(currentHost)) {
      if (organizations.length === 1) {
        await activateOrganizationAndRedirect(organizations[0]);
        return;
      }
      setOrganizationChoices(organizations);
      return;
    }

    if (organizations.length === 1) {
      await activateOrganizationAndRedirect(organizations[0]);
      return;
    }
    setOrganizationChoices(organizations);
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
      return;
    }

    const inviteResult = await consumePhoneSignupInvite(phoneNumber, userId, userEmail);
    if (inviteResult?.success) return;
    if (inviteResult?.reason === 'profile_org_conflict') {
      await signOutLocalSession();
      throw new Error('__otp_phone_invite_org_conflict__');
    }
    if (inviteResult?.reason === 'multiple_profiles') {
      await signOutLocalSession();
      throw new Error('__otp_phone_multiple_profiles__');
    }
    if (inviteResult?.reason === 'profile_inactive') {
      await signOutLocalSession();
      throw new Error('__otp_user_inactive__');
    }

    const candidate = await lookupPhoneLoginCandidate(phoneNumber);
    if (candidate?.exists_in_profiles && candidate?.is_active !== false) {
      // Re-authenticate the original identity. Never copy a profile or memberships to an OTP orphan.
      await signOutLocalSession();
      await requestExistingProfilePhoneOtp(phoneNumber);
      setOtpRequestedFor(phoneNumber);
      setOtpCode('');
      setOtpCooldown(OTP_RESEND_SECONDS);
      throw new Error('__otp_phone_repaired_retry__');
    }

    await signOutLocalSession();
    if (inviteResult?.reason === 'invite_inactive') {
      throw new Error('__otp_phone_invite_inactive__');
    }
    throw new Error('__otp_phone_not_allowed__');
  };

  const handleLogin = async () => {
    if (loading) return;
    const loginPhone = normalizeIranMobile(email);
    if ((!loginPhone && !normalizeEmail(email)) || !password) {
      message.error('شماره موبایل یا ایمیل و رمز عبور را وارد کنید.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        ...(loginPhone ? { phone: loginPhone } : { email: normalizeEmail(email) }),
        password,
      });
      if (error) throw error;
      await ensureActiveSessionUser();

      message.success('خوش آمدید! در حال ورود...');
      await resolveOrganizationAfterLogin();
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
    if (otpLoading || otpCooldown > 0) return;
    if (!normalizedPhone) {
      message.error('شماره موبایل معتبر وارد کنید. مثال: 0912...');
      return;
    }

    setOtpLoading(true);
    try {
      const candidate = await lookupPhoneLoginCandidate(normalizedPhone);
      if (phoneRecovery && candidate?.exists_in_profiles !== true) {
        throw new Error('برای بازیابی رمز، شمارهٔ حساب موجود خود را وارد کنید.');
      }
      const invite = await lookupPhoneSignupInvite(normalizedPhone);
      const profileNeedsPhoneIdentity =
        candidate?.exists_in_profiles === true
        && candidate?.is_active !== false
        && candidate?.has_phone_identity !== true;

      if (profileNeedsPhoneIdentity) {
        // این شماره روی پروفایل اصلی وجود دارد. ارسال مستقیم OTP در این حالت
        // ممکن است Auth را وادار به ساخت حساب phone دوم کند.
        await requestExistingProfilePhoneOtp(normalizedPhone);
      } else {
        assertLoginOtpRequestAllowed(candidate, invite);
        await requestSmsOtp(supabase.auth, normalizedPhone, { shouldCreateUser: false });
      }

      const requestedPhone = normalizedPhone;
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
    if (otpLoading) return;
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
    let otpVerified = false;
    let profileReady = false;
    try {
      await verifySmsOtp(supabase.auth, otpRequestedFor, normalizedOtpToken);
      otpVerified = true;
      await ensureInvitedOrExistingProfile(otpRequestedFor);
      await ensureActiveSessionUser();
      profileReady = true;
      if (phoneRecovery) {
        clearOtpSessionState();
        setOtpRequestedFor(null);
        setOtpCode('');
        setRecoveryMode(true);
        return;
      }
      clearOtpSessionState();
      setOtpRequestedFor(null);
      setOtpCode('');
      setOtpCooldown(0);

      message.success('ورود با موفقیت انجام شد.');
      await resolveOrganizationAfterLogin();
    } catch (error: any) {
      const raw = String(error?.message || '');
      // اگر OTP موفق بود اما مرحله بعدی خطا داد، sign out کن
      // تا OTP مصرف‌شده دیگر block نکند و کاربر بتواند کد جدید بگیرد
      if (otpVerified && !profileReady && !raw.includes('__otp_phone_repaired_retry__')) {
        await signOutLocalSession().catch(() => null);
        clearOtpSessionState();
        setOtpRequestedFor(null);
        setOtpCode('');
        setOtpCooldown(0);
      }
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
    if (loading) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))) {
      message.error('برای دریافت لینک بازیابی، ایمیل حساب خود را وارد کنید.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) throw error;
      message.success('اگر این ایمیل حساب داشته باشد، لینک بازیابی برای آن ارسال می‌شود. اگر نامه را ندیدید، پوشهٔ Spam / Junk / هرزنامه را هم بررسی کنید.', 8);
    } catch (error) { message.error(toFaErrorMessage(error, 'ارسال ایمیل ناموفق بود.')); }
    finally { setLoading(false); }
  };

  const handleSetNewPassword = async () => {
    if (loading) return;
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
      setPhoneRecovery(false);
      setNewPassword('');
      setConfirmNewPassword('');
      window.history.replaceState({}, document.title, '/login');
      await resolveOrganizationAfterLogin();
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
      <div className="fixed top-0 left-0 right-0 z-[1200]">
        <UserAnnouncementsBanner
          items={headerAnnouncements}
          onDismiss={dismissAnnouncement}
        />
      </div>
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
                <ResilientImage
                  src={brandLogoUrl}
                  preset="gallery"
                  alt={brandTitle}
                  className="h-14 max-w-[180px] object-contain"
                  loading="lazy"
                  decoding="async"
                />
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
              <Alert type="info" showIcon message="رمز جدید حساب شخصی"
                description="این رمز برای ورود به همهٔ سازمان‌های شما استفاده می‌شود. عضویت و نقش‌ها تغییر نمی‌کنند." />
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
                  setPhoneRecovery(false);
                  setNewPassword('');
                  setConfirmNewPassword('');
                  void signOutLocalSession();
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
              onChange={(key) => { setLoginMode(key as 'password' | 'otp'); setPhoneRecovery(false); }}
              items={[
                {
                  key: 'password',
                  label: 'رمز عبور',
                  children: (
                    <div className="flex flex-col gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">شماره موبایل یا ایمیل</label>
                        <Input autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="شماره موبایل یا ایمیل حساب" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">رمز عبور</label>
                        <Input.Password value={password} onChange={(e) => setPassword(e.target.value)} placeholder="رمز عبور" />
                      </div>
                      <Button type="primary" onClick={handleLogin} loading={loading} className="w-full bg-leather-600 h-10 text-lg">
                        ورود
                      </Button>
                      <Button type="link" onClick={() => { setPhoneRecovery(true); setLoginMode('otp'); setOtpCode(''); setOtpRequestedFor(null); }} className="text-xs">
                        فراموشی رمز عبور
                      </Button>
                      <Button type="link" loading={loading} onClick={handleResetPassword} className="text-xs">
                        دریافت لینک بازیابی از طریق ایمیل
                      </Button>
                    </div>
                  ),
                },
                {
                  key: 'otp',
                  label: 'کد یکبارمصرف',
                  children: (
                    <div className="flex flex-col gap-4">
                      {phoneRecovery && <Alert type="info" showIcon message="بازیابی رمز عبور با شماره موبایل"
                        description="شمارهٔ حساب خود را تأیید کنید؛ سپس رمز جدیدی برای ورود به همهٔ سازمان‌ها تعیین کنید." />}
                      <Alert
                        type="info"
                        showIcon
                        message="ورود با کد یکبارمصرف"
                        description={isSaasAppHost()
                          ? 'برای ورود با شماره، باید شماره شما در یکی از سازمان‌ها ثبت و تأیید شده باشد.'
                          : `برای ورود با شماره، باید کاربری شما در سازمان "${brandTitle}" تعریف شده باشد و شماره شما تایید شده باشد.`}
                      />
                      <div>
                        <label className="block text-sm font-medium mb-1">شماره موبایل</label>
                        <Input
                          dir="ltr"
                          value={phone}
                          onChange={(e) => setPhone(formatIranMobileForInput(e.target.value))}
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
                        disabled={otpCooldown > 0}
                        onClick={handleRequestOtp}
                        className="w-full bg-leather-600 h-10 text-lg"
                      >
                        {otpRequestedFor && otpCooldown > 0 ? `ارسال مجدد تا ${otpCooldown} ثانیه دیگر` : 'دریافت کد'}
                      </Button>

                      {otpRequestedFor ? (
                        <>
                          <div>
                            <label className="block text-sm font-medium mb-1">کد تایید</label>
                            <OtpCodeInput value={otpCode} onChange={setOtpCode} autoFocus />
                          </div>
                          <Button
                            type="primary"
                            loading={otpLoading && canVerifyOtp}
                            onClick={handleVerifyOtp}
                            className="w-full bg-leather-600 h-10 text-lg"
                          >
                            {phoneRecovery ? 'تأیید شماره و تعیین رمز جدید' : 'ورود با کد'}
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

        <Modal
          open={organizationChoices.length > 0}
          closable={false}
          footer={null}
          title="انتخاب سازمان"
          centered
        >
          <p className="mb-4 text-sm text-gray-600">حساب شما به چند سازمان دسترسی دارد. سازمانی را که می‌خواهید وارد شوید انتخاب کنید.</p>
          <div className="flex flex-col gap-2">
            {organizationChoices.map((organization) => (
              <Button
                key={organization.org_id}
                block
                size="large"
                loading={organizationSelecting}
                disabled={organizationSelecting}
                onClick={() => void activateOrganizationAndRedirect(organization)}
                className="!h-auto !min-h-14 !text-right"
              >
                <span className="flex flex-col items-start py-1">
                  <span className="font-bold">{organization.org_name}</span>
                  <span className="text-xs text-gray-500">{organization.is_owner ? 'صاحب حساب' : organization.role_name || 'کاربر سازمان'}</span>
                </span>
              </Button>
            ))}
          </div>
        </Modal>

        <div className="mt-4 text-center text-[11px]" style={{ color: token.colorTextTertiary }}>
          نسخه {CURRENT_APP_VERSION}
        </div>
      </div>
      <UserAnnouncementsPopupHost
        items={popupAnnouncements}
        onDismiss={dismissAnnouncement}
      />
    </div>
  );
};

export default Login;
