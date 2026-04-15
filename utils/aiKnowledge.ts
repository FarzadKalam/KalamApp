export const AI_INSTRUCTIONS_DOCUMENT_TYPE = 'ai_instructions';
export const AI_INSTRUCTIONS_TITLE = 'دستورهای هوش مصنوعی';
export const AI_INSTRUCTIONS_SYSTEM_KEY = 'ai_instructions';

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

export const isAiInstructionsConfigured = (body?: string | null) => {
  const normalized = String(body || '').trim();
  if (!normalized) return false;
  return normalized !== AI_INSTRUCTIONS_DEFAULT_BODY.trim();
};
