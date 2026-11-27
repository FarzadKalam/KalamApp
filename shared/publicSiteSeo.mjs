import { PUBLIC_SITE_URL } from './publicBrandSeo.mjs';
import { PUBLIC_SOLUTIONS, PUBLIC_SOLUTIONS_INDEX_SEO } from './publicSolutions.mjs';

const BASE_STATIC_SEO_PAGES = [
  {
    path: '/', file: 'home.html',
    title: 'تازه سیستم | CRM و ERP ایرانی یکپارچه با هوش مصنوعی و شبکه‌های اجتماعی',
    description: 'نرم‌افزار تازه سیستم؛ پلتفرم یکپارچه ابری برای مدیریت مشتریان، CRM ایرانی هوشمند، دایرکت اینستاگرام، حسابداری، پروژه و منابع انسانی.',
    heading: 'تازه سیستم؛ نرم‌افزار یکپارچهٔ CRM ایرانی هوشمند و مدیریت کسب‌وکار',
    body: 'نرم‌افزار تازه سیستم امکان مدیریت یکپارچه فروش، دایرکت هوشمند اینستاگرام، حسابداری، پروژه‌ها، فرآیندها، منابع انسانی و هوش مصنوعی کسب‌وکار را در یک فضای ابری فراهم می‌کند.',
    image: `${PUBLIC_SITE_URL}/logo.png`,
  },
  {
    path: '/features', file: 'features.html',
    title: 'امکانات تازه سیستم | CRM، ERP و اتوماسیون سازمانی',
    description: 'امکانات تازه سیستم برای مدیریت مشتریان، فروش، پروژه‌ها، فرآیندها، حسابداری، منابع انسانی، گزارش‌گیری و هوش مصنوعی را ببینید.',
    heading: 'امکانات یکپارچه برای مدیریت عملیات سازمان',
    body: 'از CRM و اتوماسیون فروش تا مدیریت پروژه، حسابداری، منابع انسانی، گزارش‌ساز و دستیار هوشمند در یک سامانه در دسترس است.',
  },
  {
    path: '/pricing', file: 'pricing.html',
    title: 'تعرفه‌های تازه سیستم | انتخاب پلن مناسب کسب‌وکار',
    description: 'پلن‌ها و تعرفه‌های تازه سیستم را مقایسه کنید و متناسب با اندازه تیم و نیازهای کسب‌وکار، فضای کاری مناسب را انتخاب کنید.',
    heading: 'پلن مناسب برای هر مرحله از رشد کسب‌وکار',
    body: 'امکانات هر پلن را مقایسه کنید و بر اساس تعداد کاربران، ماژول‌های موردنیاز و سطح خدمات، انتخاب مناسبی داشته باشید.',
  },
  {
    path: '/blog', file: 'blog.html',
    title: 'بلاگ تازه سیستم | مدیریت، فروش و تحول دیجیتال',
    description: 'مقاله‌های کاربردی تازه سیستم درباره مدیریت کسب‌وکار، CRM، فروش، پروژه، فرآیند، منابع انسانی و هوش مصنوعی.',
    heading: 'مقاله‌های کاربردی برای مدیران و تیم‌های در حال رشد',
    body: 'تجربه‌ها و راهکارهای عملی برای منظم‌تر کردن فروش، عملیات، پروژه‌ها و تصمیم‌گیری مدیریتی را بخوانید.',
  },
  {
    path: '/learn', file: 'learn.html',
    title: 'آموزش تازه سیستم | راهنمای تصویری استفاده از نرم‌افزار',
    description: 'آموزش‌های تصویری و مرحله‌به‌مرحله تازه سیستم برای راه‌اندازی و استفاده از مشتریان، فروش، پروژه‌ها، فرآیندها و سایر بخش‌ها.',
    heading: 'آموزش‌های مرحله‌به‌مرحله تازه سیستم',
    body: 'با راهنماهای متنی و تصویری، بخش‌های مختلف سامانه را سریع‌تر راه‌اندازی کنید و از امکانات آن در کار واقعی بهره ببرید.',
  },
  {
    path: '/updates', file: 'updates.html',
    title: 'تازه‌های محصول | قابلیت‌های جدید تازه سیستم',
    description: 'جدیدترین قابلیت‌ها و تغییرات محصول تازه سیستم را دنبال کنید و با امکانات تازه سامانه آشنا شوید.',
    heading: 'تازه‌های محصول تازه سیستم',
    body: 'قابلیت‌های جدید سامانه و اثر آن‌ها بر تجربه مدیریت کسب‌وکار در این صفحه معرفی می‌شوند.',
  },
  {
    path: '/about', file: 'about.html',
    title: 'درباره تازه سیستم | سامانه یکپارچه مدیریت کسب‌وکار',
    description: 'با مأموریت تازه سیستم برای ساده‌تر و یکپارچه‌تر کردن مدیریت کسب‌وکارهای ایرانی آشنا شوید.',
    heading: 'درباره تازه سیستم',
    body: 'تازه سیستم برای یکپارچه کردن اطلاعات و فرآیندهای کسب‌وکار و کمک به تصمیم‌گیری دقیق‌تر مدیران ساخته شده است.',
  },
  {
    path: '/contact', file: 'contact.html',
    title: 'تماس با تازه سیستم | درخواست دمو و مشاوره',
    description: 'برای دریافت دمو، مشاوره انتخاب پلن، همکاری یا پشتیبانی با تیم تازه سیستم در ارتباط باشید.',
    heading: 'تماس با تازه سیستم',
    body: 'برای دریافت دمو و بررسی نیازهای کسب‌وکار خود، درخواستتان را ثبت کنید تا تیم تازه سیستم با شما تماس بگیرد.',
  },
];

export const PUBLIC_STATIC_SEO_PAGES = [
  ...BASE_STATIC_SEO_PAGES,
  PUBLIC_SOLUTIONS_INDEX_SEO,
  ...PUBLIC_SOLUTIONS.map((item) => ({
    path: item.path,
    file: item.file,
    title: item.title,
    description: item.description,
    heading: item.title.replace(' | تازه سیستم', ''),
    body: item.intro,
    image: `${PUBLIC_SITE_URL}${item.screenshot}`,
    solution: item,
  })),
];

const EXTRA_STATIC_ROUTE_SEO = {
  '/demo': {
    title: 'درخواست دمو تازه سیستم | شروع رایگان نرم‌افزار',
    description: 'دموی اختصاصی تازه سیستم را دریافت کنید و مدیریت فروش، دایرکت هوشمند، پروژه، فرآیند و حسابداری را در محیط واقعی ببینید.',
    canonicalPath: '/contact',
  },
  '/privacy': {
    title: 'حریم خصوصی | تازه سیستم',
    description: 'سیاست حریم خصوصی، نگهداری داده‌های سازمانی و حفاظت از اطلاعات کاربران در سامانه ابری تازه سیستم.',
    canonicalPath: '/privacy',
  },
  '/terms': {
    title: 'شرایط استفاده | تازه سیستم',
    description: 'شرایط و ضوابط استفاده از خدمات نرم‌افزار ابری و سازمانی تازه سیستم.',
    canonicalPath: '/terms',
  },
  '/rules': {
    title: 'قوانین و مقررات | تازه سیستم',
    description: 'قوانین و مقررات استفاده از سرویس‌ها، اشتراک‌ها و امکانات سامانه تازه سیستم.',
    canonicalPath: '/rules',
  },
  '/sla': {
    title: 'توافق‌نامه سطح خدمات (SLA) | تازه سیستم',
    description: 'تعهدات پایداری، پشتیبانی و سطح دسترسی سرویس‌های ابری و سازمانی تازه سیستم.',
    canonicalPath: '/sla',
  },
};

export function getStaticPublicPageSeo(pathname) {
  const normalized = String(pathname || '/').replace(/^\/tazesystem/, '') || '/';
  const staticPage = PUBLIC_STATIC_SEO_PAGES.find((page) => page.path === normalized);
  if (staticPage) {
    return {
      title: staticPage.title,
      description: staticPage.description,
      canonical: `${PUBLIC_SITE_URL}${staticPage.path === '/' ? '/' : staticPage.path}`,
      ogImage: staticPage.image || `${PUBLIC_SITE_URL}/logo.png`,
      ogType: 'website',
    };
  }
  const extra = EXTRA_STATIC_ROUTE_SEO[normalized];
  if (extra) {
    return {
      title: extra.title,
      description: extra.description,
      canonical: `${PUBLIC_SITE_URL}${extra.canonicalPath}`,
      ogImage: `${PUBLIC_SITE_URL}/logo.png`,
      ogType: 'website',
    };
  }
  return {
    title: PUBLIC_STATIC_SEO_PAGES[0].title,
    description: PUBLIC_STATIC_SEO_PAGES[0].description,
    canonical: `${PUBLIC_SITE_URL}/`,
    ogImage: `${PUBLIC_SITE_URL}/logo.png`,
    ogType: 'website',
  };
}

export const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const ALLOWED_HTML_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li',
  'blockquote', 'code', 'pre', 'h2', 'h3', 'h4', 'span', 'div', 'sub', 'sup', 'mark', 'hr',
]);
const SELF_CLOSING_HTML_TAGS = new Set(['br', 'hr']);
const BLOCK_LEVEL_TAG_PATTERN = /<\s*(?:p|ul|ol|div|h[1-6]|blockquote|pre)\b/i;

const sanitizeHref = (rawHref) => {
  const href = String(rawHref ?? '').trim();
  if (!href) return null;
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  if (href.startsWith('#')) return href;
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  return null;
};

/** Strip unsafe tags/attributes from CMS rich-text HTML without double-escaping paragraphs or links. */
export function sanitizeCmsHtml(raw) {
  const input = String(raw ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*(script|style|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|svg|math)\b[^>]*\/?>/gi, '');

  return input.replace(/<\/?([a-zA-Z0-9-]+)([^>]*)>/g, (full, rawTag, rawAttrs) => {
    const tag = String(rawTag).toLowerCase();
    if (!ALLOWED_HTML_TAGS.has(tag)) return '';
    const isClosing = full.startsWith('</');
    if (isClosing) return SELF_CLOSING_HTML_TAGS.has(tag) ? '' : `</${tag}>`;
    if (SELF_CLOSING_HTML_TAGS.has(tag)) return `<${tag} />`;
    if (tag !== 'a') return `<${tag}>`;

    const hrefMatch = String(rawAttrs).match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
    const safeHref = sanitizeHref(hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? '');
    if (!safeHref) return '<a>';
    const isExternal = /^https?:/i.test(safeHref);
    return isExternal
      ? `<a href="${escapeHtml(safeHref)}" rel="noopener noreferrer">`
      : `<a href="${escapeHtml(safeHref)}">`;
  });
}

export function renderContentBlock(block) {
  if (!block || typeof block !== 'object') return '';
  if (block.type === 'heading') {
    const level = Math.min(4, Math.max(2, Number(block.level) || 2));
    return `<h${level}>${escapeHtml(block.content || '')}</h${level}>`;
  }
  if (block.type === 'paragraph') {
    const raw = String(block.content || '').trim();
    if (!raw) return '';
    if (!/<[a-z][\s\S]*>/i.test(raw)) return `<p>${escapeHtml(raw)}</p>`;
    const sanitized = sanitizeCmsHtml(raw).trim();
    if (!sanitized) return '';
    return BLOCK_LEVEL_TAG_PATTERN.test(sanitized) ? sanitized : `<p>${sanitized}</p>`;
  }
  if (block.type === 'quote') {
    const raw = String(block.content || '').trim();
    if (!raw) return '';
    const body = /<[a-z][\s\S]*>/i.test(raw) ? sanitizeCmsHtml(raw).trim() : `<p>${escapeHtml(raw)}</p>`;
    return body ? `<blockquote>${body}</blockquote>` : '';
  }
  if (block.type === 'alert' && block.content) {
    const titleHtml = block.title ? `<strong>${escapeHtml(block.title)}</strong> ` : '';
    return `<aside><p>${titleHtml}${escapeHtml(block.content)}</p></aside>`;
  }
  if (block.type === 'code' && block.content) {
    return `<pre><code>${escapeHtml(block.content)}</code></pre>`;
  }
  if (block.type === 'image' && block.url) {
    return `<figure><img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt || block.caption || '')}" loading="lazy" />${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ''}</figure>`;
  }
  if (block.type === 'gallery' && Array.isArray(block.images)) {
    return block.images
      .filter((img) => img?.url)
      .map((img) => `<figure><img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.alt || img.caption || '')}" loading="lazy" />${img.caption ? `<figcaption>${escapeHtml(img.caption)}</figcaption>` : ''}</figure>`)
      .join('');
  }
  if ((block.type === 'list' || block.type === 'checklist') && Array.isArray(block.items)) {
    return `<ul>${block.items.map((item) => `<li>${escapeHtml(typeof item === 'string' ? item : item?.text || item?.content || '')}</li>`).join('')}</ul>`;
  }
  return '';
}
