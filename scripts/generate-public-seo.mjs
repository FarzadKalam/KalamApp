import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC_SITE_URL, publicOrganizationSchema, publicWebsiteSchema, publicWebApplicationSchema } from '../shared/publicBrandSeo.mjs';
import { ECOSYSTEM_STATUS_LABELS, PUBLIC_ECOSYSTEM_GROUPS } from '../shared/publicEcosystem.mjs';
import { PUBLIC_STATIC_SEO_PAGES, escapeHtml, renderContentBlock } from '../shared/publicSiteSeo.mjs';
import { RECENT_PRODUCT_UPDATES } from '../shared/publicProductUpdates.mjs';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const templatePath = path.join(distDir, 'index.html');
const outputDir = path.join(distDir, 'seo-pages');
const siteUrl = PUBLIC_SITE_URL;

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

const renderUpdatesSectionHtml = () => {
  const itemsHtml = RECENT_PRODUCT_UPDATES.map((item) => {
    const detailsHtml = Array.isArray(item.details) && item.details.length
      ? `<ul>${item.details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join('')}</ul>`
      : '';
    return `<article><h2>${escapeHtml(item.title)} (نسخه ${escapeHtml(item.version)})</h2><p>${escapeHtml(item.summary)}</p>${detailsHtml}</article>`;
  }).join('');
  return `<section>${itemsHtml}</section>`;
};

const renderEcosystemSectionHtml = () => (
  `<section><h2>زیست‌بوم تازه سیستم</h2><p>پشتیبانی در محصول به معنی اتصال فعال همهٔ سازمان‌ها نیست؛ استفاده به پلن و تنظیمات سازمان بستگی دارد. موارد در حال توسعه هنوز قابل استفاده نیستند.</p>${PUBLIC_ECOSYSTEM_GROUPS.map((group) => `<h3>${escapeHtml(group.title)}</h3><ul>${group.items.map((item) => `<li>${escapeHtml(item.name)} — ${escapeHtml(ECOSYSTEM_STATUS_LABELS[item.status])}: ${escapeHtml(item.description)}</li>`).join('')}</ul>`).join('')}</section>`
);

const renderSolutionsIndexHtml = () => {
  const itemsHtml = PUBLIC_STATIC_SEO_PAGES
    .filter((page) => page.solution)
    .map(({ path: href, solution }) => `<li><a href="${escapeHtml(href)}">${escapeHtml(solution.navLabel)}</a> — ${escapeHtml(solution.intro)}</li>`)
    .join('');
  return `<section><h2>همه راهکارهای تازه سیستم</h2><ul>${itemsHtml}</ul></section>`;
};

const renderSolutionDetailHtml = (solution) => {
  const benefitsHtml = `<h2>امکانات و مزایا</h2><ul>${solution.benefits.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`;
  const useCasesHtml = `<h2>کاربردهای واقعی</h2><ul>${solution.useCases.map((u) => `<li>${escapeHtml(u)}</li>`).join('')}</ul>`;
  const relatedHtml = solution.relatedLinks?.length
    ? `<h2>مطالب و آموزش‌های مرتبط</h2><ul>${solution.relatedLinks.map((l) => `<li><a href="${escapeHtml(l.to)}">${escapeHtml(l.label)}</a></li>`).join('')}</ul>`
    : '';
  const faqHtml = solution.faq?.length
    ? `<section><h2>پرسش‌های پرتکرار</h2>${solution.faq.map((q) => `<h3>${escapeHtml(q.question)}</h3><p>${escapeHtml(q.answer)}</p>`).join('')}</section>`
    : '';
  return `${benefitsHtml}${useCasesHtml}${relatedHtml}${faqHtml}`;
};

const writeSeoPage = ({ file, title, description, canonical, heading, bodyHtml, schemaType = 'WebPage', image, extraJsonLd = [] }) => {
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org', '@type': schemaType, name: title, headline: heading,
    description, url: canonical, image: image || undefined,
    isPartOf: file === 'home.html' ? { '@id': `${siteUrl}/#website` } : { '@type': 'WebSite', name: 'تازه سیستم', url: `${siteUrl}/` }, inLanguage: 'fa-IR',
  }).replaceAll('<', '\\u003c');
  const brandJsonLd = file === 'home.html'
    ? [publicOrganizationSchema(), publicWebsiteSchema(), publicWebApplicationSchema()].map((schema) =>
      `<script data-rh="true" type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>`)
    : [];
  const additionalJsonLd = extraJsonLd.map((schema) =>
    `<script data-rh="true" type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>`);
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
    ...brandJsonLd,
    ...additionalJsonLd,
  ].filter(Boolean).join('\n    ');
  const fallback = `<main data-seo-fallback="true" dir="rtl"><article><h1>${escapeHtml(heading)}</h1>${bodyHtml}</article><nav aria-label="پیوندهای اصلی"><a href="/features">امکانات</a> <a href="/solutions">راهکارها</a> <a href="/pricing">تعرفه‌ها</a> <a href="/learn">آموزش‌ها</a> <a href="/blog">بلاگ</a> <a href="/updates">تازه‌های محصول</a> <a href="/about">درباره تازه سیستم</a> <a href="/contact">تماس با ما</a></nav></main>`;
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

for (const page of PUBLIC_STATIC_SEO_PAGES) {
  const canonical = `${siteUrl}${page.path === '/' ? '/' : page.path}`;
  const extraBodyHtml = page.path === '/'
    ? `${renderEcosystemSectionHtml()}${renderSolutionsIndexHtml()}`
    : page.path === '/updates'
      ? renderUpdatesSectionHtml()
      : page.path === '/solutions'
        ? renderSolutionsIndexHtml()
        : page.solution
          ? renderSolutionDetailHtml(page.solution)
          : '';
  const extraJsonLd = page.solution?.faq?.length
    ? [{
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: page.solution.faq.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    }]
    : [];
  writeSeoPage({ ...page, canonical, bodyHtml: `<p>${escapeHtml(page.body)}</p>${extraBodyHtml}`, extraJsonLd });
}

let dynamicCount = 0;
let dynamicComplete = false;
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
    dynamicComplete = true;
  } catch (error) {
    console.warn(`Dynamic SEO pages were skipped: ${error instanceof Error ? error.message : String(error)}`);
  }
}

fs.writeFileSync(path.join(distDir, 'seo-generation.json'), JSON.stringify({ dynamicComplete, dynamicCount }), 'utf8');

console.log(`Generated ${PUBLIC_STATIC_SEO_PAGES.length} static and ${dynamicCount} dynamic crawlable HTML pages in dist/seo-pages.`);
