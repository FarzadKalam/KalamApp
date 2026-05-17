import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Select } from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  MobileOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { getOtpErrorMessage, normalizeOtpPhone, normalizeOtpToken, OTP_RESEND_SECONDS, requestSmsOtp, verifySmsOtp } from '../utils/otpAuth';

// ─── Types ───────────────────────────────────────────
type WizardStep = 'phone' | 'otp' | 'info' | 'provisioning' | 'done' | 'error';

type SlugState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

type ProvisionResult = {
  success: boolean;
  slug: string;
  redirect_host: string;
  trial_days: number;
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

// ─── Helpers ─────────────────────────────────────────
const normalizeSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

// ─── Sub-components ───────────────────────────────────

const Logo = () => (
  <div className="flex items-center gap-3 mb-10">
    <img src="/tazesystem_logo.png" alt="تازه سیستم" className="h-10 w-10 rounded-xl object-contain" />
    <span className="text-lg font-black text-slate-900">تازه سیستم</span>
  </div>
);

const StepIndicator = ({ step }: { step: WizardStep }) => {
  const steps: WizardStep[] = ['phone', 'otp', 'info', 'provisioning'];
  const current = steps.indexOf(step);
  const labels = ['تایید شماره', 'کد تایید', 'اطلاعات', 'راه‌اندازی'];
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

  // Org info
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [industry, setIndustry] = useState('');
  const [userCount, setUserCount] = useState('');
  const [discoverySource, setDiscoverySource] = useState('');
  const [slug, setSlug] = useState('');
  const [slugState, setSlugState] = useState<SlugState>('idle');
  const [slugMessage, setSlugMessage] = useState('');

  // Provisioning
  const [provisionMsgIdx, setProvisionMsgIdx] = useState(0);
  const [provisionResult, setProvisionResult] = useState<ProvisionResult | null>(null);
  const [provisionError, setProvisionError] = useState('');

  const normalizedPhone = normalizeOtpPhone(phone);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const slugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const provisionMsgTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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
    const normalized = normalizeSlug(slug);
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
  const handleSendOtp = async () => {
    if (!normalizedPhone) {
      setError('شماره موبایل معتبر وارد کنید. مثال: ۰۹۱۲...');
      return;
    }
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

  const handleVerifyOtp = async () => {
    const token = normalizeOtpToken(otpCode);
    if (token.length < 4) { setError('کد تایید را وارد کنید.'); return; }
    setError('');
    setLoading(true);
    try {
      await verifySmsOtp(supabase.auth, normalizedPhone as string, token);

      // بررسی آیا کاربر قبلاً سازمان دارد
      const { data: ctx } = await supabase.rpc('get_current_saas_context');
      if (ctx?.org_id && ctx?.slug) {
        // کاربر قبلاً دمو گرفته — ریدایرکت به سازمانش
        window.location.href = `https://${ctx.slug}${TAZE_SUFFIX}`;
        return;
      }

      setStep('info');
    } catch (err: any) {
      setError(getOtpErrorMessage(err, 'خطا در تایید کد'));
    } finally {
      setLoading(false);
    }
  };

  const handleProvision = useCallback(async () => {
    if (!fullName.trim()) { setError('نام و نام خانوادگی الزامی است.'); return; }
    if (!orgName.trim()) { setError('نام سازمان الزامی است.'); return; }
    const normalizedSlug = normalizeSlug(slug);
    if (!normalizedSlug || normalizedSlug.length < 3) { setError('آدرس اختصاصی باید حداقل ۳ حرف باشد.'); return; }
    if (slugState === 'taken') { setError('این آدرس قبلاً انتخاب شده است.'); return; }
    if (slugState === 'checking') { setError('صبر کنید تا بررسی آدرس تکمیل شود.'); return; }

    setError('');
    setStep('provisioning');
    setProvisionMsgIdx(0);

    try {
      const { data, error: rpcErr } = await supabase.rpc('provision_self_service_demo', {
        p_full_name: fullName.trim(),
        p_mobile: normalizedPhone,
        p_business_name: orgName.trim(),
        p_employee_count_band: userCount || null,
        p_discovery_source: discoverySource || null,
        p_requested_slug: normalizedSlug,
      });

      if (rpcErr) throw rpcErr;

      const result = data as ProvisionResult;
      if (!result?.success) throw new Error('provisioning failed');

      setProvisionResult(result);

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
      if (msg.includes('slug') || msg.includes('available')) {
        userMsg = 'این آدرس قبلاً انتخاب شده. آدرس دیگری انتخاب کنید.';
        setStep('info');
      } else if (msg.includes('demo') && msg.includes('limit')) {
        userMsg = 'شما قبلاً از نسخه دمو استفاده کرده‌اید. برای اطلاعات بیشتر با ما تماس بگیرید.';
        setStep('error');
      } else {
        setStep('error');
      }
      setProvisionError(userMsg);
    }
  }, [fullName, orgName, slug, slugState, normalizedPhone, userCount, discoverySource]);

  // ── Render ──
  return (
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
              شماره موبایل خود را وارد کنید. کد تایید برای شما ارسال می‌شود.
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
                  onPressEnter={handleSendOtp}
                  size="large"
                  className="rounded-xl"
                  dir="ltr"
                  inputMode="tel"
                />
              </div>
              <Button
                type="primary"
                block
                size="large"
                loading={loading}
                onClick={handleSendOtp}
                className="!rounded-xl !h-12 !font-black !bg-slate-900 !border-none hover:!bg-slate-700"
              >
                دریافت کد تایید
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
                className="rounded-xl !text-center !text-xl !tracking-widest"
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
                    onClick={() => { setOtpCode(''); setStep('phone'); }}
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
            <div className="space-y-4">

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">نام و نام خانوادگی <span className="text-red-500">*</span></label>
                <Input
                  placeholder="علی رضایی"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  size="large"
                  className="rounded-xl"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">نام سازمان یا کسب‌وکار <span className="text-red-500">*</span></label>
                <Input
                  placeholder="شرکت نمونه"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  size="large"
                  className="rounded-xl"
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
                  className="w-full rounded-xl"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">آدرس اختصاصی <span className="text-red-500">*</span></label>
                <div className="flex items-center gap-0 rounded-xl border border-gray-300 overflow-hidden focus-within:border-slate-900 focus-within:ring-1 focus-within:ring-slate-900 bg-white">
                  <Input
                    placeholder="mycompany"
                    value={slug}
                    onChange={(e) => setSlug(normalizeSlug(e.target.value))}
                    size="large"
                    className="!rounded-none !border-none !shadow-none flex-1 !bg-transparent ltr-text"
                    dir="ltr"
                    maxLength={40}
                  />
                  <span className="bg-slate-50 px-3 text-sm text-slate-400 font-mono whitespace-nowrap border-r border-gray-200 h-10 flex items-center" dir="ltr">
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
                  <label className="block text-sm font-bold text-slate-700 mb-2">تعداد تیم</label>
                  <Select
                    placeholder="انتخاب..."
                    value={userCount || undefined}
                    onChange={setUserCount}
                    options={USER_COUNT_OPTIONS}
                    size="large"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">از کجا شنیدید؟</label>
                  <Select
                    placeholder="انتخاب..."
                    value={discoverySource || undefined}
                    onChange={setDiscoverySource}
                    options={DISCOVERY_OPTIONS}
                    size="large"
                    className="w-full"
                  />
                </div>
              </div>

              <Button
                type="primary"
                block
                size="large"
                onClick={handleProvision}
                disabled={!fullName.trim() || !orgName.trim() || !normalizeSlug(slug) || slugState === 'taken' || slugState === 'checking'}
                className="!mt-2 !rounded-xl !h-12 !font-black !bg-slate-900 !border-none hover:!bg-slate-700"
              >
                راه‌اندازی فضای من <ArrowLeftOutlined />
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
              onClick={() => { setStep('info'); setProvisionError(''); }}
            >
              بازگشت و تلاش مجدد
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SaasPortalPage;
