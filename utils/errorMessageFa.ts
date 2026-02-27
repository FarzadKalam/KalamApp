type ErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  error_description?: string;
};

const contains = (value: string, pattern: RegExp | string) => {
  if (!value) return false;
  if (typeof pattern === 'string') return value.includes(pattern);
  return pattern.test(value);
};

export const toFaErrorMessage = (error: ErrorLike | string | null | undefined, fallback = 'خطا در انجام عملیات'): string => {
  const raw =
    typeof error === 'string'
      ? error.trim()
      : String(error?.message || error?.error_description || '').trim();
  const normalized = raw.toLowerCase();
  const code = typeof error === 'string' ? '' : String(error?.code || '').trim();

  if (!raw) return fallback;

  if (contains(normalized, 'tuple to be updated was already modified by an operation triggered by the current command')) {
    return 'به دلیل هم‌زمانی تغییرات روی سند، عملیات کامل نشد. صفحه را بروزرسانی کنید و دوباره تلاش کنید.';
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

  if (code === '23505' || contains(normalized, 'duplicate key value')) {
    return 'رکورد تکراری است و قبلا ثبت شده.';
  }
  if (code === '23503' || contains(normalized, 'violates foreign key constraint')) {
    return 'به دلیل وابستگی داده‌ها، این عملیات قابل انجام نیست.';
  }
  if (code === '42501' || contains(normalized, 'permission denied')) {
    return 'شما دسترسی لازم برای انجام این عملیات را ندارید.';
  }

  if (contains(normalized, 'failed to fetch') || contains(normalized, 'networkerror') || contains(normalized, 'cors')) {
    return 'ارتباط با سرور برقرار نشد. اتصال شبکه یا تنظیمات سرور را بررسی کنید.';
  }

  return fallback;
};

