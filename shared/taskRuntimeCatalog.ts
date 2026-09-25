/**
 * گزینه‌های پایهٔ نوع فعالیت که باید در رابط و runtime سروری یک معنا داشته
 * باشند. گزینه‌های سازمانیِ داینامیک در کنار این فهرست از dynamic_options
 * خوانده می‌شوند و این فهرست فقط fallback امن برای گزارش و گردش‌کار است.
 */
export const TASK_TYPE_OPTIONS = [
  { label: 'تماس خروجی', value: 'تماس خروجی' },
  { label: 'تماس ورودی', value: 'تماس ورودی' },
  { label: 'جلسه داخلی', value: 'جلسه داخلی' },
  { label: 'جلسه خارجی', value: 'جلسه خارجی' },
  { label: 'فعالیت سازمانی', value: 'فعالیت سازمانی' },
] as const;

export const TASK_TYPE_FIELD_RUNTIME_CONFIG = {
  type: 'select',
  options: TASK_TYPE_OPTIONS,
  dynamicOptionsCategory: 'task_type',
} as const;
