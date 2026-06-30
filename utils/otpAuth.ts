import { toFaErrorMessage } from './errorMessageFa';
import { normalizeIranMobile } from './phoneNumber';
import { normalizeDigitsToEnglish } from './persianNumericInput';

export const OTP_RESEND_SECONDS = 90;

export const normalizeOtpToken = (value: unknown): string =>
  normalizeDigitsToEnglish(String(value || '')).replace(/\D/g, '');

const getRawErrorText = (error: any) =>
  `${String(error?.code || '').trim().toLowerCase()} ${String(error?.message || '').trim().toLowerCase()}`.trim();

export const getOtpErrorMessage = (error: any, fallback = 'خطا در عملیات ورود با کد') => {
  const raw = getRawErrorText(error);

  if (raw.includes('__otp_user_inactive__')) {
    return 'حساب کاربری شما غیرفعال است و امکان ورود وجود ندارد.';
  }
  if (raw.includes('__otp_phone_not_found__')) {
    return 'برای این شماره موبایل کاربر فعالی در سیستم پیدا نشد.';
  }
  if (raw.includes('__otp_phone_not_synced__')) {
    return 'شماره این کاربر برای ورود پیامکی آماده نیست. همگام سازی شماره کاربران با بخش احراز هویت را انجام دهید.';
  }
  if (raw.includes('__otp_phone_identity_missing__')) {
    return 'این کاربر هنوز ورود با شماره موبایل را در سامانه احراز هویت فعال نکرده است. برای کاربران قدیمی که با ایمیل ساخته شده‌اند باید هویت phone به صورت رسمی در Supabase ایجاد شود.';
  }
  if (raw.includes('__otp_phone_not_allowed__')) {
    return 'برای این شماره موبایل هنوز کاربر سازمانی قابل استفاده برای ورود پیدا نشد. معمولاً یعنی شماره روی پروفایل کاربر ثبت یا همگام نشده یا جایگاه سازمانی آن ناقص است.';
  }
  if (raw.includes('__otp_phone_profile_conflict__')) {
    return 'این شماره موبایل قبلا روی یک کاربر دیگر ثبت شده است. باید همان کاربر موجود را از بخش کاربران یا پروفایل برای ورود پیامکی تایید یا همگام کنید.';
  }
  if (raw.includes('__otp_phone_repaired_retry__')) {
    return 'تعارض قدیمی ورود پیامکی این شماره تعمیر شد و یک کد تازه برای شما ارسال شد. همان کد جدید را وارد کنید.';
  }
  if (raw.includes('__otp_phone_invite_inactive__')) {
    return 'برای این شماره دسترسی تعریف شده، اما حساب دعوت شده غیرفعال است.';
  }
  if (raw.includes('__otp_phone_invite_org_conflict__') || raw.includes('phone_invite_org_conflict')) {
    return 'این شماره قبلاً به یک سازمان دیگر متصل یا برای آن رزرو شده است. برای جلوگیری از ورود به سازمان اشتباه، ادامه متوقف شد.';
  }
  if (raw.includes('__otp_phone_multiple_profiles__')) {
    return 'برای این شماره بیش از یک سابقه کاربری پیدا شد. برای جلوگیری از ورود اشتباه، ادامه متوقف شد و نیاز به بررسی مدیر دارد.';
  }
  if (raw.includes('__demo_phone_invited_to_org__')) {
    return 'این شماره موبایل قبلاً برای عضویت در یک سازمان ثبت شده است. برای جلوگیری از تداخل با سازمان موجود، از مسیر ورود استفاده کنید.';
  }
  if (raw.includes('__demo_phone_multiple_profiles__')) {
    return 'برای این شماره بیش از یک سابقه کاربری پیدا شد. برای جلوگیری از اتصال اشتباه، درخواست دمو از این مسیر متوقف شد.';
  }
  if (raw.includes('__demo_phone_belongs_to_existing_org__')) {
    return 'این شماره موبایل قبلاً به یک حساب سازمانی متصل شده است. برای جلوگیری از تداخل با سازمان داخلی یا مشتریان دیگر، ایجاد دمو جدید از این مسیر مجاز نیست.';
  }
  if (raw.includes('__demo_phone_existing_auth_user__')) {
    return 'برای این شماره قبلاً حساب احراز هویت ثبت شده است، اما وضعیت سازمانی آن برای ساخت دمو شفاف نیست. لطفاً از مسیر ورود استفاده کنید یا با پشتیبانی تماس بگیرید.';
  }
  if (raw.includes('__otp_profile_org_access_incomplete__')) {
    return 'برای این کاربر جایگاه سازمانی کامل و صریح پیدا نشد. برای جلوگیری از ورود به سازمان اشتباه، ورود متوقف شد. org_id و role_id کاربر باید دقیق بررسی و اصلاح شود.';
  }
  if (raw.includes('otp_disabled')) {
    return 'ورود با کد یکبارمصرف در حال حاضر برای این شماره در دسترس نیست. تنظیمات Phone Auth و سناریوی ثبت نام یا ورود با شماره را بررسی کنید.';
  }
  if (raw.includes('phone_provider_disabled')) {
    return 'ورود با شماره موبایل در تنظیمات احراز هویت سرور فعال نشده است.';
  }
  if (raw.includes('hook_timeout') || raw.includes('hook timeout') || raw.includes('sms hook failed') || raw.includes('context deadline exceeded')) {
    return 'سامانه پیامکی پاسخ دیرهنگام داده است. اگر پیامک را دریافت کردید، یک بار دیگر کد تازه بگیرید و همان کد جدید را وارد کنید.';
  }
  if (raw.includes('over sms send rate limit') || raw.includes('rate limit')) {
    return 'درخواست کد بیش از حد مجاز تکرار شده است. کمی بعد دوباره امتحان کنید.';
  }
  if (raw.includes('user not found') || raw.includes('create_user')) {
    return 'برای این شماره موبایل کاربر فعالی در سیستم پیدا نشد.';
  }
  if (raw.includes('otp expired') || raw.includes('otp_expired')) {
    return 'کد تایید منقضی شده است. دوباره درخواست کد بدهید.';
  }
  if (raw.includes('invalid otp') || raw.includes('token has expired') || raw.includes('token is invalid') || raw.includes('token is expired')) {
    return 'کد تایید واردشده معتبر نیست.';
  }
  if (raw.includes('phone change') && raw.includes('invalid')) {
    return 'کد تایید شماره موبایل معتبر نیست.';
  }

  return toFaErrorMessage(error, fallback);
};

export const createOtpUiError = (error: any, fallback?: string) => {
  const next = error instanceof Error ? error : new Error(String(error?.message || error || fallback || 'خطای OTP'));
  const mapped = getOtpErrorMessage(error, fallback || next.message || 'خطای OTP');
  (next as any).code = String((error as any)?.code || '').trim() || undefined;
  (next as any).message = mapped;
  return next;
};

export const normalizeOtpPhone = (value: unknown) => normalizeIranMobile(value);

export const requestSmsOtp = async (
  authClient: any,
  phone: string,
  options?: { shouldCreateUser?: boolean },
) => {
  const normalizedPhone = normalizeOtpPhone(phone);
  if (!normalizedPhone) {
    throw new Error('شماره موبایل معتبر وارد کنید. مثال: 0912...');
  }

  const shouldCreateUser = options?.shouldCreateUser;
  const payload = shouldCreateUser === undefined
    ? { phone: normalizedPhone }
    : { phone: normalizedPhone, options: { shouldCreateUser } };

  const { error } = await authClient.signInWithOtp(payload);
  if (error) throw createOtpUiError(error, 'ارسال کد تایید ناموفق بود.');
  return normalizedPhone;
};

export const verifySmsOtp = async (authClient: any, phone: string, token: unknown) => {
  const normalizedPhone = normalizeOtpPhone(phone);
  const normalizedToken = normalizeOtpToken(token);
  if (!normalizedPhone) {
    throw new Error('شماره موبایل معتبر نیست.');
  }
  if (!normalizedToken) {
    throw new Error('کد تایید را وارد کنید.');
  }

  const { error } = await authClient.verifyOtp({
    phone: normalizedPhone,
    token: normalizedToken,
    type: 'sms',
  });
  if (error) throw createOtpUiError(error, 'تایید کد پیامکی ناموفق بود.');
  return {
    phone: normalizedPhone,
    token: normalizedToken,
  };
};

export const verifyPhoneChangeOtp = async (authClient: any, phone: string, token: unknown) => {
  const normalizedPhone = normalizeOtpPhone(phone);
  const normalizedToken = normalizeOtpToken(token);
  if (!normalizedPhone) {
    throw new Error('شماره موبایل معتبر نیست.');
  }
  if (!normalizedToken) {
    throw new Error('کد تایید را وارد کنید.');
  }

  const { error } = await authClient.verifyOtp({
    phone: normalizedPhone,
    token: normalizedToken,
    type: 'phone_change',
  });
  if (error) throw createOtpUiError(error, 'تایید شماره موبایل ناموفق بود.');
  return {
    phone: normalizedPhone,
    token: normalizedToken,
  };
};
