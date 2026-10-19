import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const templatePath = path.join(distDir, 'index.html');
const outputDir = path.join(distDir, 'seo-pages');
const siteUrl = 'https://tazesystem.ir';

const pages = [
  {
    path: '/', file: 'home.html',
    title: 'تازه سیستم | CRM ایرانی هوشمند و نرم‌افزار یکپارچه کسب‌وکار',
    description: 'تازه سیستم؛ CRM ایرانی دارای هوش مصنوعی، دایرکت هوشمند اینستاگرام و نرم‌افزار یکپارچه فروش، حسابداری، پروژه، فرآیند و منابع انسانی.',
    heading: 'CRM ایرانی هوشمند و نرم‌افزار یکپارچه کسب‌وکار',
    body: 'مشتریان، فروش، دایرکت اینستاگرام، حسابداری، پروژه‌ها، فرآیندها، منابع انسانی و هوش مصنوعی کسب‌وکار را در یک فضای ابری مدیریت کنید.',
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
  {
    path: '/solutions/ai-crm', file: 'solutions/ai-crm.html',
    title: 'CRM ایرانی دارای هوش مصنوعی | تازه سیستم',
    description: 'CRM ایرانی دارای هوش مصنوعی برای مدیریت مشتریان، سرنخ‌ها، پیگیری فروش، پیشنهاد پاسخ، تحلیل اطلاعات و گردش‌کار در یک سامانه یکپارچه.',
    heading: 'CRM ایرانی دارای هوش مصنوعی',
    body: 'مدیریت مشتریان و لیدها، پیگیری فروش، پیشنهاد پاسخ هوشمند، تحلیل اطلاعات و اتصال فرآیند فروش به فعالیت، فاکتور و گزارش مدیریتی.',
  },
  {
    path: '/solutions/instagram-crm', file: 'solutions/instagram-crm.html',
    title: 'CRM با دایرکت هوشمند اینستاگرام | تازه سیستم',
    description: 'CRM با دایرکت هوشمند اینستاگرام برای مدیریت دایرکت و کامنت، ثبت لید، پاسخ‌گویی خودکار و ادامه پیگیری مشتری در فرآیند فروش.',
    heading: 'CRM متصل به دایرکت هوشمند اینستاگرام',
    body: 'گفتگو، کامنت و پاسخ استوری را به لید قابل پیگیری تبدیل کنید و ادامه ارتباط مشتری را در CRM، فعالیت‌ها و کمپین‌ها نگه دارید.',
  },
  {
    path: '/solutions/smart-instagram-direct', file: 'solutions/smart-instagram-direct.html',
    title: 'دایرکت هوشمند اینستاگرام؛ حرفه‌ای و اقتصادی | تازه سیستم',
    description: 'دایرکت هوشمند اینستاگرام برای پاسخ سریع و حرفه‌ای، مدیریت کامنت و استوری، ارجاع گفتگو، ثبت لید و کاهش کار تکراری تیم.',
    heading: 'دایرکت هوشمند حرفه‌ای و اقتصادی',
    body: 'پاسخ‌های پرتکرار، درخواست قیمت، ارجاع به اپراتور و ثبت مخاطب را در یک مسیر کنترل‌شده مدیریت کنید.',
  },
  {
    path: '/solutions/affordable-business-ai', file: 'solutions/affordable-business-ai.html',
    title: 'هوش مصنوعی اقتصادی برای کسب‌وکارها | تازه سیستم',
    description: 'هوش مصنوعی اقتصادی برای کسب‌وکارها؛ تحلیل فایل و صوت، گزارش مدیریتی، پیشنهاد پاسخ و ساخت رکورد با کنترل مصرف و تأیید کاربر.',
    heading: 'هوش مصنوعی اقتصادی و کاربردی برای کسب‌وکارها',
    body: 'مصرف هوش مصنوعی را کنترل کنید و از آن برای خلاصه‌سازی، پاسخ‌گویی، تحلیل گزارش و آماده‌سازی رکوردهای کاری استفاده کنید.',
  },
];

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const readBuildEnv = () => {
  const env = { ...process.env };
  for (const fileName of ['.env.local', '.env']) {
    const filePath = path.join(root, fileName);
    if (!fs.existsSync(filePath)) continue;
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (!match || env[match[1].trim()]) continue;
      env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return env;
};

const renderContentBlock = (block) => {
  if (!block || typeof block !== 'object') return '';
  if (block.type === 'heading') {
    const level = Math.min(4, Math.max(2, Number(block.level) || 2));
    return `<h${level}>${escapeHtml(block.content || '')}</h${level}>`;
  }
  if (block.type === 'paragraph') return `<p>${escapeHtml(block.content || '')}</p>`;
  if (block.type === 'quote') return `<blockquote>${escapeHtml(block.content || '')}</blockquote>`;
  if (block.type === 'image' && block.url) {
    return `<figure><img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt || block.caption || '')}" loading="lazy" />${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ''}</figure>`;
  }
  if ((block.type === 'list' || block.type === 'checklist') && Array.isArray(block.items)) {
    return `<ul>${block.items.map((item) => `<li>${escapeHtml(typeof item === 'string' ? item : item?.text || item?.content || '')}</li>`).join('')}</ul>`;
  }
  return '';
};

const writeSeoPage = ({ file, title, description, canonical, heading, bodyHtml, schemaType = 'WebPage', image }) => {
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org', '@type': schemaType, name: title, headline: heading,
    description, url: canonical, image: image || undefined,
    isPartOf: { '@type': 'WebSite', name: 'تازه سیستم', url: siteUrl }, inLanguage: 'fa-IR',
  }).replaceAll('<', '\\u003c');
  const head = [
    `<title data-rh="true">${escapeHtml(title)}</title>`,
    `<meta data-rh="true" name="description" content="${escapeHtml(description)}" />`,
    '<meta data-rh="true" name="robots" content="index, follow, max-image-preview:large" />',
    `<link data-rh="true" rel="canonical" href="${canonical}" />`,
    `<meta data-rh="true" property="og:title" content="${escapeHtml(title)}" />`,
    `<meta data-rh="true" property="og:description" content="${escapeHtml(description)}" />`,
    `<meta data-rh="true" property="og:url" content="${canonical}" />`,
    `<meta data-rh="true" property="og:type" content="${schemaType === 'Article' ? 'article' : 'website'}" />`,
    '<meta data-rh="true" property="og:locale" content="fa_IR" />',
    '<meta data-rh="true" property="og:site_name" content="تازه سیستم" />',
    image ? `<meta data-rh="true" property="og:image" content="${escapeHtml(image)}" />` : '',
    `<script data-rh="true" type="application/ld+json">${jsonLd}</script>`,
  ].filter(Boolean).join('\n    ');
  const fallback = `<main data-seo-fallback="true" dir="rtl"><article><h1>${escapeHtml(heading)}</h1>${bodyHtml}</article><nav aria-label="پیوندهای اصلی"><a href="/features">امکانات</a> <a href="/pricing">تعرفه‌ها</a> <a href="/learn">آموزش‌ها</a> <a href="/blog">بلاگ</a></nav></main>`;
  const html = template.replace(/<title>.*?<\/title>/s, head).replace('<div id="root"></div>', `<div id="root">${fallback}</div>`);
  const outputPath = path.join(outputDir, file);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, 'utf8');
};

if (!fs.existsSync(templatePath)) {
  throw new Error('dist/index.html پیدا نشد؛ ابتدا build اجرا شود.');
}

const template = fs.readFileSync(templatePath, 'utf8');
fs.mkdirSync(outputDir, { recursive: true });

for (const page of pages) {
  const canonical = `${siteUrl}${page.path === '/' ? '' : page.path}`;
  writeSeoPage({ ...page, canonical, bodyHtml: `<p>${escapeHtml(page.body)}</p>` });
}

let dynamicCount = 0;
const env = readBuildEnv();
const supabaseUrl = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
if (supabaseUrl && anonKey) {
  const headers = { apikey: anonKey, authorization: `Bearer ${anonKey}`, 'content-type': 'application/json' };
  const rpc = async (name, args) => {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(args) });
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    return response.json();
  };
  try {
    for (const kind of ['blog', 'tutorial']) {
      const prefix = kind === 'blog' ? 'blog' : 'learn';
      const list = await rpc(kind === 'blog' ? 'get_cms_blog_posts' : 'get_cms_tutorial_posts', { p_limit: 500, p_offset: 0 });
      for (const summary of Array.isArray(list) ? list : []) {
        const post = await rpc(kind === 'blog' ? 'get_cms_blog_post_by_slug' : 'get_cms_tutorial_post_by_slug', { p_slug: summary.slug });
        if (!post?.slug || post.status !== 'published') continue;
        const title = post.seo_title || `${post.title} | تازه سیستم`;
        const description = post.seo_description || post.excerpt || `راهنمای ${post.title} در تازه سیستم`;
        const bodyHtml = `<p>${escapeHtml(post.excerpt || '')}</p>${(post.content_blocks || []).map(renderContentBlock).join('')}`;
        writeSeoPage({
          file: `${prefix}/${post.slug}.html`, title, description,
          canonical: post.canonical_url || `${siteUrl}/${prefix}/${post.slug}`,
          heading: post.title, bodyHtml, schemaType: 'Article', image: post.og_image_url || post.cover_image_url,
        });
        dynamicCount += 1;
      }
    }
  } catch (error) {
    console.warn(`Dynamic SEO pages were skipped: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`Generated ${pages.length} static and ${dynamicCount} dynamic crawlable HTML pages in dist/seo-pages.`);
