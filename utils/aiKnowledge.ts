export const AI_INSTRUCTIONS_DOCUMENT_TYPE = 'ai_instructions';
export const AI_INSTRUCTIONS_TITLE = 'دستورهای هوش مصنوعی';
export const AI_INSTRUCTIONS_SYSTEM_KEY = 'ai_instructions';
export const AI_CUSTOMER_RESPONSE_GUIDE_DOCUMENT_TYPE = 'ai_customer_response_guide';
export const AI_CUSTOMER_RESPONSE_GUIDE_TITLE = 'راهنمای پاسخگویی هوش مصنوعی به مشتریان';
export const AI_CUSTOMER_RESPONSE_GUIDE_SYSTEM_KEY = 'ai_customer_response_guide';

export const AI_INSTRUCTIONS_DEFAULT_BODY = [
  'در این بخش، قواعد و ترجیحات پاسخ‌دهی هوش مصنوعی سازمان را بنویسید.',
  '',
  'نمونه مواردی که می‌توانید مشخص کنید:',
  '- لحن پاسخ‌ها',
  '- نحوه معرفی شرکت و خدمات',
  '- محدودیت‌ها و خط قرمزهای پاسخ‌دهی',
  '- ترجیح در کوتاهی یا جزئیات',
  '- شیوه برخورد با مشتری، تامین‌کننده و همکار',
  '',
  'این متن پیش‌فرض است و بهتر است با دستورهای واقعی سازمان شما جایگزین شود.',
].join('\n');

export const AI_CUSTOMER_RESPONSE_GUIDE_DEFAULT_BODY = [
  'این سند راهنمای پاسخگویی هوش مصنوعی به مشتریان، تامین‌کنندگان و مخاطبان بات است.',
  '',
  'قواعد پیش‌فرض:',
  '- قبل از پاسخ، پیام‌های اخیر گفتگو، راهنمای اختصاصی مخاطب، دستورالعمل‌های مرتبط و دانش سازمان را بررسی کن.',
  '- اگر دستورالعمل سازمان با پاسخ عمومی مدل تعارض داشت، دستورالعمل سازمان مقدم است.',
  '- پاسخ باید فارسی، کوتاه، روشن، محترمانه و قابل ارسال مستقیم به مخاطب باشد.',
  '- اگر درباره قیمت، زمان تحویل، طراحی، اجرا، مالی، تخفیف یا وضعیت پروژه سوال شد، فقط بر اساس داده‌ها و اسناد مجاز پاسخ بده.',
  '- اگر اطلاعات کافی نیست، به‌جای حدس زدن یک سوال کوتاه بپرس یا موضوع را برای مسئول داخلی مناسب آماده کن.',
  '- اطلاعات داخلی، حاشیه سود، جزئیات محرمانه مالی یا داده‌ای که برای مخاطب مجاز نیست را افشا نکن.',
  '',
  'این متن پیش‌فرض است و هر سازمان می‌تواند آن را با سیاست فروش و پشتیبانی خودش جایگزین کند.',
].join('\n');

export const isAiInstructionsConfigured = (body?: string | null) => {
  const normalized = String(body || '').trim();
  if (!normalized) return false;
  return normalized !== AI_INSTRUCTIONS_DEFAULT_BODY.trim();
};

export const isAiCustomerResponseGuideConfigured = (body?: string | null) => {
  const normalized = String(body || '').trim();
  if (!normalized) return false;
  return normalized !== AI_CUSTOMER_RESPONSE_GUIDE_DEFAULT_BODY.trim();
};
