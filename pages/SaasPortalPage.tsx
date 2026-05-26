import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, ConfigProvider, Input, Select, theme as antdTheme } from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  MobileOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { seedCurrentOrgDemoData } from '../utils/demoDataAdmin';
import { getOtpErrorMessage, normalizeOtpPhone, normalizeOtpToken, OTP_RESEND_SECONDS, requestSmsOtp, verifySmsOtp } from '../utils/otpAuth';
import { signOutLocalSession } from '../utils/authSession';
import { getInternalAppUrl } from '../utils/hostRouting';
import { assertDemoOtpRequestAllowed, lookupPhoneLoginCandidate, lookupPhoneSignupInvite } from '../utils/phoneAuth';
import {
  getDemoProvisionErrorMessage,
  getOwnerSetupErrorMessage,
  isBrandPaletteKey,
  isValidOwnerEmail,
  isValidOwnerPassword,
  normalizeOwnerEmail,
  normalizeSaasSlug,
  SAAS_BRAND_PALETTE_OPTIONS,
  SAAS_DEFAULT_BRAND_PALETTE_KEY,
} from '../utils/saasOnboarding';

// ─── Types ───────────────────────────────────────────
type WizardStep = 'phone' | 'info' | 'otp' | 'provisioning' | 'done' | 'error';

type SlugState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

type ProvisionResult = {
  success: boolean;
  org_id?: string;
  slug: string;
  redirect_host: string;
  trial_days: number;
};

type WizardAuthenticatedProfile = {
  id?: string;
  org_id?: string | null;
  role_id?: string | null;
  role?: string | null;
  is_active?: boolean | null;
};

// ─── Constants ───────────────────────────────────────
const TAZE_SUFFIX = '.tazesystem.ir';
const INDUSTRY_OPTIONS = [
  { value: 'retail', label: 'خرده‌فروشی و فروشگاه' },
  { value: 'wholesale', label: 'عمده‌فروشی و توزیع' },
  { value: 'manufacturing', label: 'تولید و صنعت' },
  { value: 'services', label: 'خدمات و مشاوره' },
  { value: 'construction', label: 'ساختمان و پیمانکاری' },
  { value: 'it', label: 'فناوری اطلاعات و نرم‌افزار' },
  { value: 'marketing', label: 'تبلیغات و بازاریابی' },
  { value: 'healthcare', label: 'پزشکی و سلامت' },
  { value: 'education', label: 'آموزش و پرورش' },
  { value: 'food', label: 'مواد غذایی و رستوران' },
  { value: 'import_export', label: 'واردات و صادرات' },
  { value: 'real_estate', label: 'مشاور املاک' },
  { value: 'other', label: 'سایر' },
];

const DISCOVERY_OPTIONS = [
  { value: 'search', label: 'جستجو در اینترنت' },
  { value: 'instagram', label: 'اینستاگرام' },
  { value: 'linkedin', label: 'لینکدین' },
  { value: 'friend', label: 'معرفی دوست یا همکار' },
  { value: 'phone_call', label: 'تماس تلفنی' },
  { value: 'tazesystem_members', label: 'معرفی توسط اعضای تازه سیستم' },
  { value: 'ad', label: 'تبلیغات' },
  { value: 'other', label: 'سایر' },
];

const USER_COUNT_OPTIONS = [
  { value: '1-5', label: '۱ تا ۵ نفر' },
  { value: '6-15', label: '۶ تا ۱۵ نفر' },
  { value: '16-30', label: '۱۶ تا ۳۰ نفر' },
  { value: '31-50', label: '۳۱ تا ۵۰ نفر' },
  { value: '50+', label: 'بیش از ۵۰ نفر' },
];

const PROVISIONING_MESSAGES = [
  'در حال آماده‌سازی فضای سازمان شما...',
  'در حال راه‌اندازی تنظیمات اولیه...',
  'در حال پیکربندی دسترسی‌ها...',
  'در حال فعال‌سازی آدرس اختصاصی...',
  'در حال اتصال به زیرساخت ابری...',
  'تقریباً تمام شد...',
];

const SAAS_WIZARD_STEP_STORAGE_KEY = 'kalam_saas_wizard_step';
const SAAS_WIZARD_PHONE_STORAGE_KEY = 'kalam_saas_wizard_phone';
const SAAS_WIZARD_OTP_STORAGE_KEY = 'kalam_saas_wizard_otp';
const SAAS_WIZARD_COOLDOWN_UNTIL_STORAGE_KEY = 'kalam_saas_wizard_cooldown_until';
const SAAS_WIZARD_FORM_STORAGE_KEY = 'kalam_saas_wizard_form';

// ─── Helpers ─────────────────────────────────────────
// ─── Sub-components ───────────────────────────────────

const Logo = () => (
  <div className="flex items-center gap-3 mb-10">
    <img src="/tazesystem_logo.png" alt="تازه سیستم" className="h-10 w-10 rounded-xl object-contain" />
    <span className="text-lg font-black text-slate-900">تازه سیستم</span>
  </div>
);

const StepIndicator = ({ step }: { step: WizardStep }) => {
  const steps: WizardStep[] = ['phone', 'info', 'otp', 'provisioning'];
  const current = steps.indexOf(step);
  const labels = ['شماره موبایل', 'اطلاعات', 'کد تایید', 'راه‌اندازی'];
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <div className={`flex items-center gap-1.5 text-xs font-bold ${i <= current ? 'text-slate-900' : 'text-slate-300'}`}>
            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${
              i < current ? 'bg-slate-900 text-white' : i === current ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'
            }`}>
              {i < current ? <CheckCircleOutlined style={{ fontSize: 11 }} /> : i + 1}
            </div>
            <span className="hidden sm:block">{labels[i]}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`h-[1px] flex-1 ${i < current ? 'bg-slate-900' : 'bg-slate-200'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// ─── Main Wizard ──────────────────────────────────────
const SaasPortalPage: React.FC = () => {
  const [step, setStep] = useState<WizardStep>('phone');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isExistingPhoneUser, setIsExistingPhoneUser] = useState(false);

  // Org info
  const [fullName, setFullName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [ownerPasswordConfirm, setOwnerPasswordConfirm] = useState('');
  const [orgName, setOrgName] = useState('');
  const [industry, setIndustry] = useState('');
  const [userCount, setUserCount] = useState('');
  const [discoverySource, setDiscoverySource] = useState('');
  const [slug, setSlug] = useState('');
  const [brandPaletteKey, setBrandPaletteKey] = useState(SAAS_DEFAULT_BRAND_PALETTE_KEY);
  const [slugState, setSlugState] = useState<SlugState>('idle');
  const [slugMessage, setSlugMessage] = useState('');

  // Provisioning
  const [provisionMsgIdx, setProvisionMsgIdx] = useState(0);
  const [provisionResult, setProvisionResult] = useState<ProvisionResult | null>(null);
  const [provisionError, setProvisionError] = useState('');
  const [provisionWarning, setProvisionWarning] = useState('');

  const normalizedPhone = normalizeOtpPhone(phone);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const slugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const provisionMsgTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedStep = String(window.sessionStorage.getItem(SAAS_WIZARD_STEP_STORAGE_KEY) || 'phone').trim() as WizardStep;
    const savedPhone = window.sessionStorage.getItem(SAAS_WIZARD_PHONE_STORAGE_KEY) || '';
    const savedCooldownUntil = Number(window.sessionStorage.getItem(SAAS_WIZARD_COOLDOWN_UNTIL_STORAGE_KEY) || '0');
    const savedFormRaw = window.sessionStorage.getItem(SAAS_WIZARD_FORM_STORAGE_KEY) || '';

    if (savedPhone) setPhone(savedPhone);
    // OTP کد را هرگز از sessionStorage بازیابی نکن — کد منقضی‌شده موجب خطای 403 می‌شود.
    if (savedCooldownUntil > Date.now()) {
      setOtpCooldown(Math.ceil((savedCooldownUntil - Date.now()) / 1000));
    }

    if (savedFormRaw) {
      try {
        const savedForm = JSON.parse(savedFormRaw);
        setFullName(String(savedForm?.fullName || ''));
        setOwnerEmail(String(savedForm?.ownerEmail || ''));
        setOrgName(String(savedForm?.orgName || ''));
        setIndustry(String(savedForm?.industry || ''));
        setUserCount(String(savedForm?.userCount || ''));
        setDiscoverySource(String(savedForm?.discoverySource || ''));
        setSlug(String(savedForm?.slug || ''));
        setBrandPaletteKey(isBrandPaletteKey(String(savedForm?.brandPaletteKey || '')) ? savedForm.brandPaletteKey : SAAS_DEFAULT_BRAND_PALETTE_KEY);
      } catch {
        // Ignore invalid cached wizard state.
      }
    }

    const restoreStep = async () => {
      if (!savedStep || savedStep === 'phone') return;
      // info مرحله قبل از OTP است — نیازی به session ندارد
      if (savedStep === 'info') {
        setStep('info');
        return;
      }
      if (savedStep === 'otp') {
        setStep('otp');
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user?.id) {
        setStep(savedStep);
      } else {
        setStep('phone');
      }
    };

    void restoreStep();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(SAAS_WIZARD_STEP_STORAGE_KEY, step);
  }, [step]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(SAAS_WIZARD_PHONE_STORAGE_KEY, phone);
  }, [phone]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (otpCooldown > 0) {
      window.sessionStorage.setItem(
        SAAS_WIZARD_COOLDOWN_UNTIL_STORAGE_KEY,
        String(Date.now() + otpCooldown * 1000)
      );
    } else {
      window.sessionStorage.removeItem(SAAS_WIZARD_COOLDOWN_UNTIL_STORAGE_KEY);
    }
  }, [otpCooldown]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(
      SAAS_WIZARD_FORM_STORAGE_KEY,
      JSON.stringify({
        fullName,
        ownerEmail,
        orgName,
        industry,
        userCount,
        discoverySource,
        slug,
        brandPaletteKey,
      })
    );
  }, [brandPaletteKey, discoverySource, fullName, industry, orgName, ownerEmail, slug, userCount]);

  const clearWizardState = () => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(SAAS_WIZARD_STEP_STORAGE_KEY);
    window.sessionStorage.removeItem(SAAS_WIZARD_PHONE_STORAGE_KEY);
    window.sessionStorage.removeItem(SAAS_WIZARD_OTP_STORAGE_KEY); // پاک‌کردن کلید قدیمی در صورت وجود
    window.sessionStorage.removeItem(SAAS_WIZARD_COOLDOWN_UNTIL_STORAGE_KEY);
    window.sessionStorage.removeItem(SAAS_WIZARD_FORM_STORAGE_KEY);
  };

  const inputClassName = 'rounded-xl !bg-white !text-slate-900 placeholder:!text-slate-400';
  const selectClassName = 'w-full [&_.ant-select-selector]:!rounded-xl [&_.ant-select-selector]:!bg-white [&_.ant-select-selector]:!text-slate-900';

  // ── Cooldown timer ──
  useEffect(() => {
    if (otpCooldown <= 0) return;
    cooldownTimer.current = setInterval(() => {
      setOtpCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (cooldownTimer.current) clearInterval(cooldownTimer.current); };
  }, [otpCooldown]);

  // ── Slug live-check ──
  useEffect(() => {
    if (slugTimer.current) clearTimeout(slugTimer.current);
    const normalized = normalizeSaasSlug(slug);
    if (!normalized || normalized.length < 2) {
      setSlugState('idle');
      setSlugMessage('');
      return;
    }
    setSlugState('checking');
    slugTimer.current = setTimeout(async () => {
      try {
        const { data, error: rpcErr } = await supabase.rpc('check_saas_slug_availability', { p_slug: normalized });
        if (rpcErr) throw rpcErr;
        const result = data as { available: boolean; normalized_slug: string; reason?: string };
        if (result.available) {
          setSlugState('available');
          setSlugMessage(`${result.normalized_slug}${TAZE_SUFFIX} قابل استفاده است`);
        } else {
          setSlugState('taken');
          setSlugMessage('این آدرس قبلاً انتخاب شده. آدرس دیگری امتحان کنید.');
        }
      } catch {
        setSlugState('idle');
        setSlugMessage('');
      }
    }, 600);
    return () => { if (slugTimer.current) clearTimeout(slugTimer.current); };
  }, [slug]);

  // ── Provisioning message ticker ──
  useEffect(() => {
    if (step !== 'provisioning') return;
    provisionMsgTimer.current = setInterval(() => {
      setProvisionMsgIdx((i) => Math.min(i + 1, PROVISIONING_MESSAGES.length - 1));
    }, 2200);
    return () => { if (provisionMsgTimer.current) clearInterval(provisionMsgTimer.current); };
  }, [step]);

  // ── Handlers ──
  const handleValidatePhone = async () => {
    if (!normalizedPhone) {
      setError('شماره موبایل معتبر وارد کنید. مثال: ۰۹۱۲...');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const [candidate, invite] = await Promise.all([
        lookupPhoneLoginCandidate(normalizedPhone),
        lookupPhoneSignupInvite(normalizedPhone),
      ]);
      let isExisting = false;
      try {
        assertDemoOtpRequestAllowed(candidate, invite);
      } catch (assertErr: any) {
        const assertCode = String(assertErr?.code || assertErr?.message || '');
        if (
          assertCode.includes('__demo_phone_belongs_to_existing_org__') ||
          assertCode.includes('__demo_phone_existing_auth_user__')
        ) {
          // کاربر قبلاً دمو ساخته — مستقیم OTP می‌فرستیم و هدایت می‌کنیم
          isExisting = true;
        } else {
          throw assertErr;
        }
      }
      setIsExistingPhoneUser(isExisting);
      if (isExisting) {
        // کاربر موجود: همین‌جا OTP می‌فرستیم
        await requestSmsOtp(supabase.auth, normalizedPhone);
        setStep('otp');
        setOtpCooldown(OTP_RESEND_SECONDS);
      } else {
        // کاربر جدید: ابتدا اطلاعات را پر می‌کند، بعد OTP
        setStep('info');
      }
    } catch (err: any) {
      setError(getOtpErrorMessage(err, 'خطا در تایید شماره موبایل'));
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtpFromInfo = async () => {
    if (!fullName.trim()) { setError('نام و نام خانوادگی الزامی است.'); return; }
    if (!isValidOwnerEmail(ownerEmail)) { setError('ایمیل مدیر اصلی معتبر نیست.'); return; }
    if (!isValidOwnerPassword(ownerPassword)) { setError('رمز عبور باید حداقل ۶ کاراکتر باشد.'); return; }
    if (ownerPassword !== ownerPasswordConfirm) { setError('تکرار رمز عبور با رمز عبور یکسان نیست.'); return; }
    if (!orgName.trim()) { setError('نام سازمان الزامی است.'); return; }
    const normalizedSlug = normalizeSaasSlug(slug);
    if (!normalizedSlug || normalizedSlug.length < 3) { setError('آدرس اختصاصی باید حداقل ۳ حرف باشد.'); return; }
    if (slugState === 'taken') { setError('این آدرس قبلاً انتخاب شده است.'); return; }
    if (slugState === 'checking') { setError('صبر کنید تا بررسی آدرس تکمیل شود.'); return; }
    if (!normalizedPhone) { setError('شماره موبایل معتبر نیست.'); return; }
    setError('');
    setLoading(true);
    try {
      await requestSmsOtp(supabase.auth, normalizedPhone);
      setStep('otp');
      setOtpCooldown(OTP_RESEND_SECONDS);
    } catch (err: any) {
      setError(getOtpErrorMessage(err, 'خطا در ارسال کد تایید'));
    } finally {
      setLoading(false);
    }
  };

  const resolveAuthenticatedDemoSessionState = useCallback(async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user?.id) {
      throw new Error('__otp_phone_not_allowed__');
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, org_id, role_id, role, is_active')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    const currentProfile = (profile || null) as WizardAuthenticatedProfile | null;
    if (currentProfile?.is_active === false) {
      throw new Error('__otp_user_inactive__');
    }

    const { data: ctx, error: ctxError } = await supabase.rpc('get_current_saas_context');
    if (ctxError) throw ctxError;

    return {
      profile: currentProfile,
      saasContext: ctx as any,
    };
  }, []);

  const handleVerifyOtp = async () => {
    const token = normalizeOtpToken(otpCode);
    if (token.length < 4) { setError('کد تایید را وارد کنید.'); return; }
    setError('');
    setLoading(true);
    let otpVerified = false;
    try {
      await verifySmsOtp(supabase.auth, normalizedPhone as string, token);
      otpVerified = true;
      const { profile, saasContext } = await resolveAuthenticatedDemoSessionState();

      // کاربر موجود با سازمان — هدایت به پنل
      if (saasContext?.org_id && saasContext?.slug) {
        clearWizardState();
        window.location.href = `https://${saasContext.slug}${TAZE_SUFFIX}`;
        return;
      }
      if (profile?.org_id) {
        clearWizardState();
        window.location.href = getInternalAppUrl();
        return;
      }

      // کاربر جدید — اطلاعات قبلاً پر شده، مستقیم provisioning
      // اگر از مسیر existing user آمده، اطلاعات پر نشده — باید info را پر کند
      if (isExistingPhoneUser) {
        setStep('info');
      } else {
        await runProvision();
      }
    } catch (err: any) {
      const mappedError = getOtpErrorMessage(err, 'خطا در تایید کد');
      if (otpVerified) {
        await signOutLocalSession().catch(() => null);
        setOtpCode('');
        setOtpCooldown(0);
      }
      setError(mappedError);
    } finally {
      setLoading(false);
    }
  };

  const runProvision = useCallback(async () => {
    const normalizedSlug = normalizeSaasSlug(slug);
    setProvisionWarning('');

    try {
      const normalizedEmail = normalizeOwnerEmail(ownerEmail);
      const { data: ownerSetupData, error: ownerSetupError } = await supabase.functions.invoke('user-admin', {
        body: {
          action: 'setup_owner_credentials',
          fullName: fullName.trim(),
          email: normalizedEmail,
          password: ownerPassword,
          skipProfileUpsert: true,
        },
      });
      if (ownerSetupError) {
        // body پیام واقعی (مثل email_conflict) داخل response body است، نه error.message
        let ownerErrMsg = String(ownerSetupError?.message || 'تنظیم حساب مدیر اصلی ناموفق بود.').trim();
        const ctx = (ownerSetupError as any)?.context;
        if (ctx && typeof ctx.clone === 'function') {
          try {
            const body = await ctx.clone().json();
            const bodyMsg = String(body?.message || '').trim();
            const bodyCode = String(body?.reason_code || '').trim();
            if (bodyMsg) ownerErrMsg = bodyMsg;
            if (bodyCode) ownerErrMsg = `${bodyCode}: ${ownerErrMsg}`;
          } catch { /* keep original */ }
        }
        throw new Error(ownerErrMsg);
      }
      if (ownerSetupData?.success === false) {
        const ownerSetupReason = String(ownerSetupData?.reason_code || '').trim();
        const ownerSetupMessage = String(ownerSetupData?.message || 'تنظیم حساب مدیر اصلی ناموفق بود.').trim();
        throw new Error(ownerSetupReason ? `${ownerSetupReason}: ${ownerSetupMessage}` : ownerSetupMessage);
      }

      setStep('provisioning');
      setProvisionMsgIdx(0);

      const { data, error: rpcErr } = await supabase.rpc('provision_self_service_demo', {
        p_full_name: fullName.trim(),
        p_mobile: normalizedPhone,
        p_business_name: orgName.trim(),
        p_employee_count_band: userCount || null,
        p_discovery_source: discoverySource || null,
        p_requested_slug: normalizedSlug,
        p_owner_email: normalizedEmail,
        p_industry: industry || null,
        p_brand_palette_key: brandPaletteKey,
      });

      if (rpcErr) throw rpcErr;

      const result = data as ProvisionResult;
      if (!result?.success) {
        const resultMessage = String((data as any)?.message || '').trim();
        const resultStatus = String((data as any)?.status || '').trim();
        const resultReasonCode = String((data as any)?.failure_code || (data as any)?.reason_code || '').trim();
        const errorParts = [resultStatus, resultReasonCode, resultMessage || 'provisioning failed'].filter(Boolean);
        throw new Error(errorParts.join(': '));
      }

      setProvisionResult(result);
      clearWizardState();

      try {
        const seedResult = await seedCurrentOrgDemoData({ orgId: result.org_id || null });
        if (String(seedResult?.warning || '').trim()) {
          setProvisionWarning(String(seedResult.warning).trim());
        }
      } catch {
        setProvisionWarning('فضای شما ساخته شد، اما بخشی از داده‌های نمونه اولیه کامل نشد و می‌توانید بعداً دوباره تلاش کنید.');
      }

      // کمی صبر تا کاربر progress رو ببینه
      await new Promise((r) => setTimeout(r, 1800));
      setStep('done');

      // ریدایرکت خودکار بعد از ۳ ثانیه
      setTimeout(() => {
        const host = result.redirect_host || `${normalizedSlug}${TAZE_SUFFIX}`;
        window.location.href = `https://${host}`;
      }, 3000);

    } catch (err: any) {
      const msg = String(err?.message || '');
      let userMsg = 'خطا در راه‌اندازی سازمان. لطفاً با پشتیبانی تماس بگیرید.';
      let inlineInfoError = false;
      if (
        msg.includes('already registered')
        || msg.includes('already exists')
        || msg.includes('email_conflict')
        || msg.includes('invalid email')
        || (msg.includes('password') && msg.includes('least'))
        || msg.includes('برای این ایمیل قبلاً کاربر ثبت شده است')
      ) {
        userMsg = msg.includes('برای این ایمیل') ? 'این ایمیل قبلاً در سیستم ثبت شده است. لطفاً ایمیل دیگری وارد کنید.' : getOwnerSetupErrorMessage(err);
        setStep('info');
        setOtpCode('');
        setOtpCooldown(0);
        inlineInfoError = true;
      } else {
        userMsg = getDemoProvisionErrorMessage(err, userMsg);
        if (msg.includes('slug') || msg.includes('available')) {
          setStep('info');
          setOtpCode('');
          setOtpCooldown(0);
          inlineInfoError = true;
        } else if (
          msg.includes('needs_admin_review')
          || msg.includes('profile_already_attached')
          || msg.includes('profile_exists_without_org')
        ) {
          setStep('error');
        } else if (msg.includes('demo') && msg.includes('limit')) {
          setStep('error');
        } else if (msg.includes('marketing_leads') && msg.includes('description')) {
          setStep('error');
        } else {
          setStep('error');
        }
      }
      if (inlineInfoError) {
        setError(userMsg);
      }
      setProvisionError(userMsg);
    }
  }, [brandPaletteKey, discoverySource, fullName, industry, normalizedPhone, orgName, ownerEmail, ownerPassword, ownerPasswordConfirm, slug, slugState, userCount]);

  // ── Render ──
  return (
    <ConfigProvider
      direction="rtl"
      theme={{
        algorithm: antdTheme.defaultAlgorithm,
        token: {
          colorBgBase: '#f8fafc',
          colorBgContainer: '#ffffff',
          colorText: '#0f172a',
          colorTextPlaceholder: '#94a3b8',
          colorBorder: '#cbd5e1',
          colorPrimary: '#0f172a',
          borderRadius: 12,
          fontFamily: 'Vazirmatn, sans-serif',
        },
        components: {
          Input: {
            colorBgContainer: '#ffffff',
            colorText: '#0f172a',
            colorTextPlaceholder: '#94a3b8',
            activeBorderColor: '#0f172a',
            hoverBorderColor: '#334155',
          },
          Select: {
            colorBgContainer: '#ffffff',
            colorText: '#0f172a',
            colorTextPlaceholder: '#94a3b8',
            activeBorderColor: '#0f172a',
            hoverBorderColor: '#334155',
            optionSelectedBg: '#e2e8f0',
          },
        },
      }}
    >
      <div
        className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center px-4 py-12"
        style={{ fontFamily: 'Vazirmatn, sans-serif' }}
      >
        <div className="w-full max-w-md">
          <Logo />

        {/* ─ Step: Phone ─ */}
        {step === 'phone' && (
          <div>
            <StepIndicator step="phone" />
            <h1 className="text-2xl font-black text-slate-900 mb-2">شروع رایگان</h1>
            <p className="text-slate-500 text-sm mb-8 leading-7">
              شماره موبایل خود را وارد کنید تا فضای اختصاصی سازمان شما راه‌اندازی شود.
            </p>
            {error && <Alert type="error" message={error} className="mb-4 rounded-xl" showIcon />}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">شماره موبایل</label>
                <Input
                  prefix={<MobileOutlined className="text-slate-400" />}
                  placeholder="۰۹۱۲..."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onPressEnter={handleValidatePhone}
                  size="large"
                  className={inputClassName}
                  dir="ltr"
                  inputMode="tel"
                />
              </div>
              <Button
                type="primary"
                block
                size="large"
                loading={loading}
                onClick={handleValidatePhone}
                className="!rounded-xl !h-12 !font-black !bg-slate-900 !border-none hover:!bg-slate-700"
              >
                ادامه
              </Button>
            </div>
            <p className="mt-6 text-center text-xs text-slate-400">
              با ادامه، شرایط استفاده تازه سیستم را می‌پذیرید.
            </p>
          </div>
        )}

        {/* ─ Step: OTP ─ */}
        {step === 'otp' && (
          <div>
            <StepIndicator step="otp" />
            <h1 className="text-2xl font-black text-slate-900 mb-2">کد تایید</h1>
            <p className="text-slate-500 text-sm mb-8 leading-7">
              کد ۶ رقمی ارسال‌شده به <span className="font-bold text-slate-700 ltr-text">{normalizedPhone}</span> را وارد کنید.
            </p>
            {error && <Alert type="error" message={error} className="mb-4 rounded-xl" showIcon />}
            <div className="space-y-4">
              <Input
                placeholder="کد تایید"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                onPressEnter={handleVerifyOtp}
                size="large"
                className={`${inputClassName} !text-center !text-xl !tracking-widest`}
                maxLength={6}
                dir="ltr"
                inputMode="numeric"
              />
              <Button
                type="primary"
                block
                size="large"
                loading={loading}
                onClick={handleVerifyOtp}
                disabled={normalizeOtpToken(otpCode).length < 4}
                className="!rounded-xl !h-12 !font-black !bg-slate-900 !border-none hover:!bg-slate-700"
              >
                تایید و ادامه
              </Button>
              <div className="text-center">
                {otpCooldown > 0 ? (
                  <span className="text-xs text-slate-400">
                    ارسال مجدد کد تا {otpCooldown} ثانیه دیگر
                  </span>
                ) : (
                  <button
                    className="text-xs font-bold text-slate-600 hover:text-slate-900 underline"
                    onClick={() => {
                      setOtpCode('');
                      setOtpCooldown(0);
                      setError('');
                      setStep(isExistingPhoneUser ? 'phone' : 'info');
                    }}
                  >
                    ارسال مجدد کد
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─ Step: Info ─ */}
        {step === 'info' && (
          <div>
            <StepIndicator step="info" />
            <h1 className="text-2xl font-black text-slate-900 mb-2">اطلاعات سازمان</h1>
            <p className="text-slate-500 text-sm mb-8 leading-7">
              اطلاعات زیر برای راه‌اندازی فضای اختصاصی شما استفاده می‌شود.
            </p>
            {error && <Alert type="error" message={error} className="mb-4 rounded-xl" showIcon />}
            <Alert
              type="info"
              showIcon
              className="mb-4 rounded-xl"
              message="حساب مدیر اصلی"
              description="این ایمیل و رمز عبور برای ورود مدیر اصلی به پنل اختصاصی سازمان استفاده می‌شود. ورود با پیامک همچنان قابل پشتیبانی است، اما این حساب باید از همین مرحله کامل شود."
            />
            <div className="space-y-4">

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">نام و نام خانوادگی <span className="text-red-500">*</span></label>
                <Input
                  placeholder="علی رضایی"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  size="large"
                  className={inputClassName}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">ایمیل مدیر اصلی <span className="text-red-500">*</span></label>
                  <Input
                    placeholder="owner@company.com"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    size="large"
                    className={inputClassName}
                    dir="ltr"
                    inputMode="email"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">پالت ظاهری سازمان</label>
                  <Select
                    placeholder="انتخاب کنید..."
                    value={brandPaletteKey}
                    onChange={(value) => setBrandPaletteKey(isBrandPaletteKey(String(value || '')) ? value : SAAS_DEFAULT_BRAND_PALETTE_KEY)}
                    options={SAAS_BRAND_PALETTE_OPTIONS}
                    size="large"
                    className={selectClassName}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">رمز عبور <span className="text-red-500">*</span></label>
                  <Input.Password
                    placeholder="حداقل ۶ کاراکتر"
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    size="large"
                    className={inputClassName}
                    autoComplete="new-password"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">تکرار رمز عبور <span className="text-red-500">*</span></label>
                  <Input.Password
                    placeholder="تکرار رمز عبور"
                    value={ownerPasswordConfirm}
                    onChange={(e) => setOwnerPasswordConfirm(e.target.value)}
                    size="large"
                    className={inputClassName}
                    autoComplete="new-password"
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">نام سازمان یا کسب‌وکار <span className="text-red-500">*</span></label>
                <Input
                  placeholder="شرکت نمونه"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  size="large"
                  className={inputClassName}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">حوزه فعالیت</label>
                <Select
                  placeholder="انتخاب کنید..."
                  value={industry || undefined}
                  onChange={setIndustry}
                  options={INDUSTRY_OPTIONS}
                  size="large"
                  className={selectClassName}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">آدرس اختصاصی <span className="text-red-500">*</span></label>
                <div className="flex flex-row items-center gap-0 rounded-xl border border-gray-300 overflow-hidden focus-within:border-slate-900 focus-within:ring-1 focus-within:ring-slate-900 bg-white" dir="ltr">
                  <Input
                    placeholder="mycompany"
                    value={slug}
                    onChange={(e) => setSlug(normalizeSaasSlug(e.target.value))}
                    size="large"
                    className="!rounded-none !border-none !shadow-none flex-1 !bg-transparent !text-left !text-slate-900 ltr-text"
                    dir="ltr"
                    maxLength={40}
                  />
                  <span className="bg-slate-50 px-3 text-sm text-slate-400 font-mono whitespace-nowrap border-l border-gray-200 h-10 flex items-center" dir="ltr">
                    .tazesystem.ir
                  </span>
                </div>
                <div className="mt-1.5 text-xs h-5">
                  {slugState === 'checking' && (
                    <span className="text-slate-400 flex items-center gap-1">
                      <LoadingOutlined spin /> در حال بررسی...
                    </span>
                  )}
                  {slugState === 'available' && (
                    <span className="text-emerald-600 font-bold flex items-center gap-1">
                      <CheckCircleOutlined /> {slugMessage}
                    </span>
                  )}
                  {slugState === 'taken' && (
                    <span className="text-red-500">{slugMessage}</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">تعداد نفرات</label>
                  <Select
                    placeholder="انتخاب..."
                    value={userCount || undefined}
                    onChange={setUserCount}
                    options={USER_COUNT_OPTIONS}
                    size="large"
                    className={selectClassName}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">نحوه آشنایی</label>
                  <Select
                    placeholder="انتخاب..."
                    value={discoverySource || undefined}
                    onChange={setDiscoverySource}
                    options={DISCOVERY_OPTIONS}
                    size="large"
                    className={selectClassName}
                  />
                </div>
              </div>

              <Button
                type="primary"
                block
                size="large"
                onClick={handleSendOtpFromInfo}
                loading={loading}
                disabled={
                  !fullName.trim()
                  || !isValidOwnerEmail(ownerEmail)
                  || !isValidOwnerPassword(ownerPassword)
                  || ownerPassword !== ownerPasswordConfirm
                  || !orgName.trim()
                  || !normalizeSaasSlug(slug)
                  || slugState === 'taken'
                  || slugState === 'checking'
                }
                className="!mt-2 !rounded-xl !h-12 !font-black !bg-slate-900 !border-none hover:!bg-slate-700"
              >
                ارسال کد تایید <ArrowLeftOutlined />
              </Button>
            </div>
          </div>
        )}

        {/* ─ Step: Provisioning ─ */}
        {step === 'provisioning' && (
          <div className="text-center py-8">
            <div className="flex justify-center mb-8">
              <div className="relative">
                <div className="h-20 w-20 rounded-full bg-slate-900 flex items-center justify-center">
                  <RocketOutlined className="text-white text-3xl" />
                </div>
                <div className="absolute -inset-2 rounded-full border-2 border-slate-200 animate-spin border-t-slate-900" />
              </div>
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-3">در حال آماده‌سازی تازه سیستم</h2>
            <p className="text-slate-500 text-sm min-h-[20px] transition-all duration-500">
              {PROVISIONING_MESSAGES[provisionMsgIdx]}
            </p>
            <p className="text-xs text-slate-300 mt-6">این فرآیند معمولاً کمتر از ۳۰ ثانیه طول می‌کشد.</p>
          </div>
        )}

        {/* ─ Step: Done ─ */}
        {step === 'done' && provisionResult && (
          <div className="text-center py-8">
            <div className="flex justify-center mb-8">
              <div className="h-20 w-20 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-200">
                <CheckCircleOutlined className="text-white text-3xl" />
              </div>
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-3">آماده است!</h2>
            <p className="text-slate-500 text-sm mb-6 leading-7">
              فضای اختصاصی شما با موفقیت راه‌اندازی شد.{' '}
              {provisionResult.trial_days > 0 && (
                <span className="font-bold text-emerald-600">{provisionResult.trial_days} روز رایگان</span>
              )}{' '}
              فرصت دارید.
            </p>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 mb-6 font-mono text-sm text-emerald-800 ltr-text">
              {provisionResult.slug}{TAZE_SUFFIX}
            </div>
            <p className="text-xs text-slate-500 mb-2">
              برای ورود مدیر اصلی از ایمیل <span className="font-bold ltr-text">{normalizeOwnerEmail(ownerEmail)}</span> استفاده کنید.
            </p>
            {provisionWarning && (
              <Alert
                type="warning"
                showIcon
                className="mb-4 rounded-xl text-right"
                message={provisionWarning}
              />
            )}
            <p className="text-xs text-slate-400 mb-4">در حال هدایت به پنل شما...</p>
            <Button
              type="primary"
              size="large"
              className="!rounded-xl !h-12 !font-black !bg-slate-900 !border-none hover:!bg-slate-700"
              onClick={() => {
                const host = provisionResult.redirect_host || `${provisionResult.slug}${TAZE_SUFFIX}`;
                window.location.href = `https://${host}`;
              }}
            >
              ورود به پنل من <ArrowLeftOutlined />
            </Button>
          </div>
        )}

        {/* ─ Step: Error ─ */}
        {step === 'error' && (
          <div className="text-center py-8">
            <Alert
              type="error"
              message={provisionError || 'خطا در راه‌اندازی'}
              description="برای کمک با ما از طریق سایت تازه سیستم در تماس باشید."
              showIcon
              className="rounded-xl mb-6 text-right"
            />
            <Button
              size="large"
              className="!rounded-xl !h-12 !font-black"
              onClick={() => {
                clearWizardState();
                setStep('phone');
                setOtpCode('');
                setOtpCooldown(0);
                setError('');
                setProvisionError('');
                setIsExistingPhoneUser(false);
              }}
            >
              شروع مجدد
            </Button>
          </div>
        )}
        </div>
      </div>
    </ConfigProvider>
  );
};

export default SaasPortalPage;
