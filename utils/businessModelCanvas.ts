export const BUSINESS_MODEL_CANVAS_DOCUMENT_TYPE = 'business_model_canvas';
export const BUSINESS_MODEL_CANVAS_SYSTEM_KEY = 'business_model_canvas';
export const BUSINESS_MODEL_CANVAS_TITLE = 'بوم کسب و کار';

export type BusinessModelCanvasSectionKey =
  | 'key_partners'
  | 'key_activities'
  | 'key_resources'
  | 'value_propositions'
  | 'customer_relationships'
  | 'channels'
  | 'customer_segments'
  | 'cost_structure'
  | 'revenue_streams';

export type BusinessModelCanvasSections = Record<BusinessModelCanvasSectionKey, string[]>;

export type BusinessModelCanvasSectionDefinition = {
  key: BusinessModelCanvasSectionKey;
  title: string;
  shortTitle: string;
  helper: string;
  placeholder: string;
  desktopClassName: string;
  accentClassName: string;
};

export const BUSINESS_MODEL_CANVAS_SECTIONS: BusinessModelCanvasSectionDefinition[] = [
  {
    key: 'key_partners',
    title: 'شرکای کلیدی',
    shortTitle: 'شرکا',
    helper: 'تامین‌کنندگان، همکاران راهبردی و بازیگرانی که بدون آن‌ها اجرای مدل سخت می‌شود.',
    placeholder: 'مثال: تامین‌کننده اصلی مواد اولیه\nمثال: شریک توزیع در استان‌ها',
    desktopClassName: 'xl:col-[1/3] xl:row-[1/5]',
    accentClassName: 'from-[#f6efe6] via-[#fff8f0] to-[#f8efe5]',
  },
  {
    key: 'key_activities',
    title: 'فعالیت‌های کلیدی',
    shortTitle: 'فعالیت‌ها',
    helper: 'مهم‌ترین کارهایی که باید عالی انجام شوند تا ارزش پیشنهادی تحویل شود.',
    placeholder: 'مثال: طراحی و توسعه محصول\nمثال: فروش و پیگیری مشتریان',
    desktopClassName: 'xl:col-[3/5] xl:row-[1/3]',
    accentClassName: 'from-[#eef6eb] via-[#f9fff7] to-[#ecf8ef]',
  },
  {
    key: 'key_resources',
    title: 'منابع کلیدی',
    shortTitle: 'منابع',
    helper: 'دارایی‌ها، تیم، دانش، ابزارها و زیرساخت‌هایی که مدل به آن‌ها وابسته است.',
    placeholder: 'مثال: تیم فروش باتجربه\nمثال: برند شناخته‌شده',
    desktopClassName: 'xl:col-[3/5] xl:row-[3/5]',
    accentClassName: 'from-[#ebf4ff] via-[#f7fbff] to-[#eef6ff]',
  },
  {
    key: 'value_propositions',
    title: 'ارزش‌های پیشنهادی',
    shortTitle: 'ارزش پیشنهادی',
    helper: 'دلیل اصلی انتخاب شما توسط مشتری؛ چه مسئله‌ای را حل می‌کنید و چه ارزشی خلق می‌شود.',
    placeholder: 'مثال: تحویل سریع‌تر از رقبا\nمثال: کاهش خطای اجرایی برای مشتری',
    desktopClassName: 'xl:col-[5/7] xl:row-[1/5]',
    accentClassName: 'from-[#fff0d8] via-[#fff8ed] to-[#ffefda]',
  },
  {
    key: 'customer_relationships',
    title: 'ارتباط با مشتری',
    shortTitle: 'ارتباط',
    helper: 'شیوه جذب، نگهداشت و توسعه رابطه با مشتری در طول زمان.',
    placeholder: 'مثال: پشتیبانی واتساپی\nمثال: مدیر حساب اختصاصی',
    desktopClassName: 'xl:col-[7/9] xl:row-[1/3]',
    accentClassName: 'from-[#f7ebff] via-[#fcf7ff] to-[#f7eeff]',
  },
  {
    key: 'channels',
    title: 'کانال‌ها',
    shortTitle: 'کانال‌ها',
    helper: 'مسیرهایی که از آن‌ها مشتری شما را پیدا می‌کند، خرید می‌کند یا خدمت را دریافت می‌کند.',
    placeholder: 'مثال: اینستاگرام\nمثال: فروش مستقیم سازمانی',
    desktopClassName: 'xl:col-[7/9] xl:row-[3/5]',
    accentClassName: 'from-[#e9f8f7] via-[#f5fffe] to-[#eaf8f7]',
  },
  {
    key: 'customer_segments',
    title: 'بخش‌های مشتریان',
    shortTitle: 'بخش‌ها',
    helper: 'گروه‌های اصلی مشتری که برایشان ارزش خلق می‌کنید و باید جداگانه فهم شوند.',
    placeholder: 'مثال: شرکت‌های تولیدی متوسط\nمثال: فروشگاه‌های زنجیره‌ای',
    desktopClassName: 'xl:col-[9/11] xl:row-[1/5]',
    accentClassName: 'from-[#fdecef] via-[#fff7f8] to-[#fceef1]',
  },
  {
    key: 'cost_structure',
    title: 'ساختار هزینه‌ها',
    shortTitle: 'هزینه‌ها',
    helper: 'مهم‌ترین هزینه‌های ثابت و متغیر مدل کسب‌وکار شما.',
    placeholder: 'مثال: حقوق تیم اجرایی\nمثال: تبلیغات و جذب مشتری',
    desktopClassName: 'xl:col-[1/6] xl:row-[5/7]',
    accentClassName: 'from-[#f2efe9] via-[#faf8f4] to-[#f2eee7]',
  },
  {
    key: 'revenue_streams',
    title: 'جریان‌های درآمدی',
    shortTitle: 'درآمد',
    helper: 'روش‌های اصلی درآمدزایی و اینکه مشتری بابت چه چیزی پول می‌پردازد.',
    placeholder: 'مثال: فروش اشتراک ماهانه\nمثال: کارمزد اجرا',
    desktopClassName: 'xl:col-[6/11] xl:row-[5/7]',
    accentClassName: 'from-[#edf5e7] via-[#f8fff4] to-[#eef8eb]',
  },
];

const normalizeItem = (value: unknown) => String(value || '').replace(/\r\n/g, '\n').trim();

const escapeHtml = (value: string) =>
  String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const createEmptyBusinessModelCanvasSections = (): BusinessModelCanvasSections => ({
  key_partners: [],
  key_activities: [],
  key_resources: [],
  value_propositions: [],
  customer_relationships: [],
  channels: [],
  customer_segments: [],
  cost_structure: [],
  revenue_streams: [],
});

export const normalizeBusinessModelCanvasSections = (raw: unknown): BusinessModelCanvasSections => {
  const base = createEmptyBusinessModelCanvasSections();
  if (!raw || typeof raw !== 'object') return base;
  const source = raw as Record<string, unknown>;
  BUSINESS_MODEL_CANVAS_SECTIONS.forEach((section) => {
    const values = Array.isArray(source[section.key]) ? (source[section.key] as unknown[]) : [];
    base[section.key] = values.map(normalizeItem).filter(Boolean);
  });
  return base;
};

export const hasBusinessModelCanvasContent = (sections: BusinessModelCanvasSections) =>
  BUSINESS_MODEL_CANVAS_SECTIONS.some((section) => sections[section.key].length > 0);

export const buildBusinessModelCanvasDocumentContent = (sections: BusinessModelCanvasSections) => {
  const isConfigured = hasBusinessModelCanvasContent(sections);
  const introLine = isConfigured
    ? 'این بوم کسب و کار توسط سازمان تکمیل شده است و می‌تواند به‌عنوان بخشی از دانش سازمان برای هوش مصنوعی استفاده شود.'
    : 'این بوم کسب و کار هنوز تکمیل نشده است و فعلاً فقط قالب استاندارد آن برای سازمان ثبت شده است.';

  const bodySections = BUSINESS_MODEL_CANVAS_SECTIONS.map((section) => {
    const items = sections[section.key];
    const lines = items.length > 0
      ? items.map((item) => `- ${item}`)
      : ['- تکمیل نشده'];
    return `${section.title}\n${lines.join('\n')}`;
  });

  const body = [
    BUSINESS_MODEL_CANVAS_TITLE,
    '',
    introLine,
    '',
    ...bodySections.flatMap((block, index) => (index === 0 ? [block] : ['', block])),
  ].join('\n');

  const bodyHtml = `
    <div dir="rtl" data-system-key="${BUSINESS_MODEL_CANVAS_SYSTEM_KEY}">
      <h1>${escapeHtml(BUSINESS_MODEL_CANVAS_TITLE)}</h1>
      <p>${escapeHtml(introLine)}</p>
      ${BUSINESS_MODEL_CANVAS_SECTIONS.map((section) => {
        const items = sections[section.key];
        const listItems = (items.length > 0 ? items : ['تکمیل نشده'])
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join('');
        return `
          <section>
            <h2>${escapeHtml(section.title)}</h2>
            <ul>${listItems}</ul>
          </section>
        `;
      }).join('')}
    </div>
  `.trim();

  return {
    body,
    body_html: bodyHtml,
    metadata: {
      system_key: BUSINESS_MODEL_CANVAS_SYSTEM_KEY,
      is_system_default: true,
      canvas_layout: 'osterwalder_standard',
      canvas_version: 1,
      completion_ratio: Math.round(
        (BUSINESS_MODEL_CANVAS_SECTIONS.filter((section) => sections[section.key].length > 0).length
          / BUSINESS_MODEL_CANVAS_SECTIONS.length) * 100
      ),
      sections,
      default_template: !isConfigured,
    },
  };
};

export const extractBusinessModelCanvasSections = (metadata?: Record<string, any> | null) =>
  normalizeBusinessModelCanvasSections(metadata?.sections);

export const isBusinessModelCanvasDocument = (document?: {
  document_type?: string | null;
  metadata?: Record<string, any> | null;
} | null) =>
  String(document?.document_type || '').trim() === BUSINESS_MODEL_CANVAS_DOCUMENT_TYPE
  || String(document?.metadata?.system_key || '').trim() === BUSINESS_MODEL_CANVAS_SYSTEM_KEY;
