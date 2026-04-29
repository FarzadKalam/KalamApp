type ErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  error_description?: string;
  hint?: string;
  status?: number;
};

const contains = (value: string, pattern: RegExp | string) => {
  if (!value) return false;
  if (typeof pattern === 'string') return value.includes(pattern);
  return pattern.test(value);
};

const hasPersianText = (value: string) => /[\u0600-\u06FF]/.test(value);

export const toFaErrorMessage = (error: ErrorLike | string | null | undefined, fallback = 'خطا در انجام عملیات'): string => {
  const raw =
    typeof error === 'string'
      ? error.trim()
      : String(error?.message || error?.error_description || error?.details || error?.hint || '').trim();
  const normalized = raw.toLowerCase();
  const code = typeof error === 'string' ? '' : String(error?.code || '').trim();
  const status = typeof error === 'string' ? undefined : Number(error?.status || 0) || undefined;

  if (!raw) return fallback;

  if (hasPersianText(raw) && !contains(raw, '???')) return raw;

  if (status === 401 || contains(normalized, 'unauthorized') || contains(normalized, 'missing bearer token') || contains(normalized, 'invalid token')) {
    return 'نشست شما معتبر نیست. دوباره وارد حساب کاربری شوید.';
  }
  if (status === 403 || contains(normalized, 'forbidden') || contains(normalized, 'not authorized') || contains(normalized, 'access denied')) {
    return 'شما دسترسی لازم برای انجام این عملیات را ندارید.';
  }
  if (status === 404 || contains(normalized, 'not found') || contains(normalized, 'was not found')) {
    return 'مورد درخواستی پیدا نشد.';
  }
  if (status === 405 || contains(normalized, 'method not allowed')) {
    return 'روش ارسال درخواست معتبر نیست.';
  }
  if (status === 408 || contains(normalized, 'timeout') || contains(normalized, 'statement timeout')) {
    return 'زمان پاسخ‌گویی سرور تمام شد. دوباره تلاش کنید.';
  }
  if (status === 429 || contains(normalized, 'rate limit') || contains(normalized, 'too many requests')) {
    return 'تعداد درخواست‌ها زیاد است. کمی صبر کنید و دوباره تلاش کنید.';
  }
  if (status && status >= 500) {
    return 'خطای داخلی سرور رخ داد. چند لحظه بعد دوباره تلاش کنید.';
  }

  if (contains(normalized, 'tuple to be updated was already modified by an operation triggered by the current command')) {
    return 'به دلیل هم‌زمانی تغییرات روی سند، عملیات کامل نشد. صفحه را بروزرسانی کنید و دوباره تلاش کنید.';
  }

  if (contains(normalized, 'process template not found')) {
    return 'الگوی فرآیند برای این سازمان پیدا نشد.';
  }
  if (contains(normalized, 'posted journal entry must have non-zero debit and credit totals')) {
    return 'برای ثبت نهایی، سند باید حداقل یک ردیف بدهکار و یک ردیف بستانکار با مبلغ غیرصفر داشته باشد.';
  }
  if (contains(normalized, 'journal entry is not balanced')) {
    return 'سند تراز نیست. جمع بدهکار و بستانکار باید برابر باشد.';
  }
  if (contains(normalized, 'fiscal year not found for journal entry')) {
    return 'سال مالی سند پیدا نشد.';
  }
  if (contains(normalized, 'entry date') && contains(normalized, 'is outside fiscal year range')) {
    return 'تاریخ سند خارج از بازه سال مالی انتخابی است.';
  }
  if (contains(normalized, 'cannot post journal entry in a closed fiscal year')) {
    return 'ثبت نهایی در سال مالی بسته مجاز نیست.';
  }
  if (contains(normalized, 'posted journal entry must have a fiscal year')) {
    return 'برای ثبت نهایی، انتخاب سال مالی الزامی است.';
  }
  if (contains(normalized, 'cannot change posted journal entry back to draft')) {
    return 'سند ثبت‌نهایی‌شده قابل برگشت به پیش‌نویس نیست.';
  }
  if (contains(normalized, 'posted journal entry is locked and cannot be edited directly')) {
    return 'سند ثبت‌نهایی‌شده قفل است و قابل ویرایش مستقیم نیست.';
  }
  if (contains(normalized, 'only draft journal entries can be deleted')) {
    return 'فقط اسناد پیش‌نویس قابل حذف هستند.';
  }
  if (contains(normalized, 'journal line must reference a journal entry')) {
    return 'هر ردیف سند باید به یک سند حسابداری معتبر متصل باشد.';
  }
  if (contains(normalized, 'parent journal entry not found for journal line mutation')) {
    return 'سند والد برای تغییر ردیف پیدا نشد.';
  }
  if (contains(normalized, 'only draft journal entries can be modified')) {
    return 'فقط ردیف‌های اسناد پیش‌نویس قابل تغییر هستند.';
  }
  if (contains(normalized, 'target journal entry not found for journal line move')) {
    return 'سند مقصد برای انتقال ردیف پیدا نشد.';
  }
  if (contains(normalized, 'cannot move line to a non-draft journal entry')) {
    return 'انتقال ردیف به سند غیرپیش‌نویس مجاز نیست.';
  }
  if (contains(normalized, 'web_form_slug_required')) {
    return 'شناسه لینک وب‌فرم الزامی است.';
  }
  if (contains(normalized, 'web_form_not_found')) {
    return 'وب‌فرم موردنظر پیدا نشد.';
  }
  if (contains(normalized, 'web_form_auth_required')) {
    return 'برای ارسال این فرم باید وارد حساب کاربری شوید.';
  }
  if (contains(normalized, 'web_form_target_required')) {
    return 'بخش مقصد وب‌فرم مشخص نشده است.';
  }
  if (contains(normalized, 'web_form_target_not_allowed') || contains(normalized, 'web_form_target_invalid')) {
    return 'بخش مقصد این وب‌فرم معتبر نیست.';
  }
  if (contains(normalized, 'recycle bin source table') && contains(normalized, 'not valid')) {
    return 'منبع رکورد در سطل بازیافت معتبر نیست.';
  }
  if (contains(normalized, 'restore window') && contains(normalized, 'has expired')) {
    return 'مهلت بازگردانی این رکورد تمام شده است.';
  }
  if (contains(normalized, 'no matching columns were found')) {
    return 'ستون‌های لازم برای بازگردانی رکورد پیدا نشد.';
  }
  if (contains(normalized, 'parent_id cannot reference itself')) {
    return 'جایگاه سازمانی نمی‌تواند زیرمجموعه خودش باشد.';
  }
  if (contains(normalized, 'tree cycle detected')) {
    return 'ساختار جایگاه‌های سازمانی چرخه دارد و معتبر نیست.';
  }
  if (contains(normalized, 'org_id is required')) {
    return 'شناسه سازمان الزامی است.';
  }
  if (contains(normalized, 'fiscal_id is required')) {
    return 'شناسه مالیاتی الزامی است.';
  }
  if (contains(normalized, 'taxpayer-system connection is not active')) {
    return 'اتصال سامانه مودیان فعال نیست.';
  }
  if (contains(normalized, 'seller economic code is missing')) {
    return 'کد اقتصادی فروشنده در تنظیمات شرکت ثبت نشده است.';
  }
  if (contains(normalized, 'private key has not been saved')) {
    return 'کلید خصوصی سامانه مودیان ذخیره نشده است.';
  }
  if (contains(normalized, 'certificate is required for taxpayer-system v2 mode')) {
    return 'برای مسیر نسخه ۲ سامانه مودیان، گواهی امضا الزامی است.';
  }
  if (contains(normalized, 'sales invoice was not found')) {
    return 'فاکتور فروش پیدا نشد.';
  }
  if (contains(normalized, 'invoice has no rows to send')) {
    return 'فاکتور ردیفی برای ارسال ندارد.';
  }
  if (contains(normalized, 'customer identity data is incomplete')) {
    return 'اطلاعات هویتی مشتری کامل نیست.';
  }
  if (contains(normalized, 'product/service identifier is missing')) {
    return 'شناسه کالا/خدمت برای یکی از ردیف‌های فاکتور ثبت نشده است.';
  }
  if (contains(normalized, 'taxpayer measure unit code is missing')) {
    return 'کد واحد اندازه‌گیری مودیان برای یکی از ردیف‌های فاکتور ثبت نشده است.';
  }
  if (contains(normalized, 'quantity is invalid')) {
    return 'تعداد یکی از ردیف‌های فاکتور معتبر نیست.';
  }
  if (contains(normalized, 'invoice_id is required')) {
    return 'شناسه فاکتور الزامی است.';
  }
  if (contains(normalized, 'unsupported action')) {
    return 'عملیات درخواستی پشتیبانی نمی‌شود.';
  }
  if (contains(normalized, 'submission uid is missing') || contains(normalized, 'submission uid/reference number/taxid is missing')) {
    return 'شناسه ارسال سامانه مودیان پیدا نشد.';
  }

  if (code === '23505' || contains(normalized, 'duplicate key value')) {
    return 'رکورد تکراری است و قبلا ثبت شده.';
  }
  if (code === '23503' || contains(normalized, 'violates foreign key constraint')) {
    return 'به دلیل وابستگی داده‌ها، این عملیات قابل انجام نیست.';
  }
  if (code === '23502' || contains(normalized, 'null value in column')) {
    return 'یکی از فیلدهای الزامی تکمیل نشده است.';
  }
  if (code === '22P02' || contains(normalized, 'invalid input syntax')) {
    return 'مقدار واردشده معتبر نیست.';
  }
  if (code === '22003' || contains(normalized, 'out of range for type integer')) {
    return 'نوع یکی از ستون‌های دیتابیس برای این مقدار مناسب نیست. شماره تماس‌ها و کدهای شناسه باید به صورت متن ذخیره شوند.';
  }
  if (code === '42501' || contains(normalized, 'permission denied') || contains(normalized, 'row-level security')) {
    return 'شما دسترسی لازم برای انجام این عملیات را ندارید.';
  }

  if (contains(normalized, 'failed to fetch') || contains(normalized, 'networkerror') || contains(normalized, 'cors') || contains(normalized, 'network request failed')) {
    return 'ارتباط با سرور برقرار نشد. اتصال شبکه یا تنظیمات سرور را بررسی کنید.';
  }
  if (contains(normalized, 'edge function returned a non-2xx status code') || contains(normalized, 'functionshttperror')) {
    return 'اجرای سرویس سمت سرور ناموفق بود. تنظیمات اتصال و متن خطای سرویس را بررسی کنید.';
  }
  if (contains(normalized, 'edge function returned a non-2xx status')) {
    return 'اجرای سرویس سمت سرور ناموفق بود.';
  }
  if (contains(normalized, 'missing supabase environment variables') || contains(normalized, 'supabase function secrets are not configured')) {
    return 'تنظیمات سرور کامل نیست. متغیرهای محیطی Supabase را بررسی کنید.';
  }
  if (contains(normalized, 'could not upload media file to storage')) {
    return 'آپلود فایل در فضای ذخیره‌سازی ناموفق بود.';
  }
  if (contains(normalized, 'could not load sms settings')) {
    return 'خواندن تنظیمات پیامک ناموفق بود.';
  }
  if (contains(normalized, 'could not insert inbound sms')) {
    return 'ثبت پیامک ورودی ناموفق بود.';
  }
  if (contains(normalized, 'could not load voip settings')) {
    return 'خواندن تنظیمات VoIP ناموفق بود.';
  }
  if (contains(normalized, 'could not query call log')) {
    return 'خواندن گزارش تماس ناموفق بود.';
  }
  if (contains(normalized, 'could not save call log')) {
    return 'ذخیره گزارش تماس ناموفق بود.';
  }
  if (contains(normalized, 'phone duplicate lookup failed')) {
    return 'بررسی تکراری بودن شماره موبایل ناموفق بود.';
  }
  if (contains(normalized, 'email duplicate lookup failed')) {
    return 'بررسی تکراری بودن ایمیل ناموفق بود.';
  }
  if (contains(normalized, 'bot send failed')) {
    return 'ارسال پیام بات ناموفق بود.';
  }
  if (contains(normalized, 'rubika') && contains(normalized, 'failed')) {
    return 'ارتباط با روبیکا ناموفق بود.';
  }
  if (contains(normalized, 'telefonchy') && contains(normalized, 'http')) {
    return 'ارتباط با سرویس تلفنچی ناموفق بود.';
  }
  if (contains(normalized, 'invalid login credentials')) {
    return 'ایمیل یا رمز عبور درست نیست.';
  }
  if (contains(normalized, 'email not confirmed')) {
    return 'ایمیل هنوز تایید نشده است.';
  }

  return fallback;
};
