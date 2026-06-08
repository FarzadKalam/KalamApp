const SITE_NAME = 'تازه سیستم';
const SITE_URL = 'https://tazesystem.ir';
const SITE_DESCRIPTION = 'نرم‌افزار مدیریت سازمانی B2B ایرانی — حسابداری، CRM، HR، انبار، پروژه و هوش مصنوعی';
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.png`;
const TWITTER_HANDLE = '@tazesystem';

export type JsonLdObject = Record<string, unknown>;

export function getSiteUrl() { return SITE_URL; }
export function getSiteName() { return SITE_NAME; }

// ──────────────────────────────────────────────────
// Slug
// ──────────────────────────────────────────────────
export function generateSlug(text: string): string {
  const persianToLatin: Record<string, string> = {
    'آ':'a','ا':'a','ب':'b','پ':'p','ت':'t','ث':'s','ج':'j','چ':'ch',
    'ح':'h','خ':'kh','د':'d','ذ':'z','ر':'r','ز':'z','ژ':'zh','س':'s',
    'ش':'sh','ص':'s','ض':'z','ط':'t','ظ':'z','ع':'a','غ':'gh','ف':'f',
    'ق':'q','ک':'k','گ':'g','ل':'l','م':'m','ن':'n','و':'v','ه':'h',
    'ی':'y','ئ':'y','ء':'','ؤ':'v','ة':'h','ك':'k','ي':'y',
  };
  return text
    .split('')
    .map(c => persianToLatin[c] ?? c)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// ──────────────────────────────────────────────────
// Reading time
// ──────────────────────────────────────────────────
type Block = { type: string; content?: string; items?: unknown[] };

export function calculateReadingTime(blocks: Block[]): number {
  const WORDS_PER_MINUTE = 200;
  let wordCount = 0;
  for (const block of blocks) {
    if (block.content) {
      const text = block.content.replace(/<[^>]+>/g, ' ');
      wordCount += text.split(/\s+/).filter(Boolean).length;
    }
    if (block.type === 'checklist' && Array.isArray(block.items)) {
      wordCount += block.items.length * 5;
    }
  }
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
}

// ──────────────────────────────────────────────────
// JSON-LD generators
// ──────────────────────────────────────────────────
export function generateOrganizationJsonLd(): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    sameAs: [],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      availableLanguage: 'Persian',
    },
  };
}

export function generateWebSiteJsonLd(): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    inLanguage: 'fa-IR',
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function generateBreadcrumbJsonLd(
  items: { name: string; url: string }[]
): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${SITE_URL}${item.url}`,
    })),
  };
}

export function generateArticleJsonLd(post: {
  title: string;
  slug: string;
  excerpt?: string;
  cover_image_url?: string;
  og_image_url?: string;
  author_name?: string;
  published_at?: string;
  updated_at?: string;
  reading_time_minutes?: number;
  focus_keyword?: string;
  schema_extra?: Record<string, unknown>;
}): JsonLdObject {
  const url = `${SITE_URL}/blog/${post.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt ?? '',
    image: post.og_image_url ?? post.cover_image_url ?? DEFAULT_OG_IMAGE,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    author: post.author_name
      ? { '@type': 'Person', name: post.author_name }
      : { '@type': 'Organization', name: SITE_NAME },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` },
    },
    datePublished: post.published_at,
    dateModified: post.updated_at ?? post.published_at,
    inLanguage: 'fa-IR',
    keywords: post.focus_keyword,
    timeRequired: post.reading_time_minutes
      ? `PT${post.reading_time_minutes}M`
      : undefined,
    ...(post.schema_extra ?? {}),
  };
}

export function generateHowToJsonLd(tutorial: {
  title: string;
  slug: string;
  excerpt?: string;
  cover_image_url?: string;
  og_image_url?: string;
  author_name?: string;
  published_at?: string;
  updated_at?: string;
  duration_minutes?: number;
  difficulty_level?: string;
  focus_keyword?: string;
  schema_extra?: Record<string, unknown>;
}): JsonLdObject {
  const url = `${SITE_URL}/learn/${tutorial.slug}`;
  const difficultyMap: Record<string, string> = {
    beginner: 'مبتدی', intermediate: 'متوسط',
    advanced: 'پیشرفته', expert: 'حرفه‌ای',
  };
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: tutorial.title,
    description: tutorial.excerpt ?? '',
    image: tutorial.og_image_url ?? tutorial.cover_image_url ?? DEFAULT_OG_IMAGE,
    url,
    author: tutorial.author_name
      ? { '@type': 'Person', name: tutorial.author_name }
      : { '@type': 'Organization', name: SITE_NAME },
    datePublished: tutorial.published_at,
    dateModified: tutorial.updated_at ?? tutorial.published_at,
    inLanguage: 'fa-IR',
    keywords: tutorial.focus_keyword,
    totalTime: tutorial.duration_minutes
      ? `PT${tutorial.duration_minutes}M`
      : undefined,
    educationalLevel: tutorial.difficulty_level
      ? difficultyMap[tutorial.difficulty_level]
      : undefined,
    ...(tutorial.schema_extra ?? {}),
  };
}

export function generateItemListJsonLd(
  items: { name: string; url: string }[],
  name: string
): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      url: item.url.startsWith('http') ? item.url : `${SITE_URL}${item.url}`,
    })),
  };
}

// ──────────────────────────────────────────────────
// Meta builders (returned as props for SeoHead)
// ──────────────────────────────────────────────────
export interface SeoProps {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
  ogType?: 'website' | 'article';
  noIndex?: boolean;
  jsonLd?: JsonLdObject | JsonLdObject[];
}

export function buildBlogPostSeo(post: {
  title: string; slug: string; seo_title?: string; seo_description?: string;
  excerpt?: string; og_image_url?: string; cover_image_url?: string;
  canonical_url?: string; author_name?: string; published_at?: string;
  updated_at?: string; reading_time_minutes?: number; focus_keyword?: string;
  schema_extra?: Record<string, unknown>;
}): SeoProps {
  return {
    title: post.seo_title || `${post.title} | ${SITE_NAME}`,
    description: post.seo_description || post.excerpt || SITE_DESCRIPTION,
    canonical: post.canonical_url || `${SITE_URL}/blog/${post.slug}`,
    ogImage: post.og_image_url || post.cover_image_url || DEFAULT_OG_IMAGE,
    ogType: 'article',
    jsonLd: [
      generateBreadcrumbJsonLd([
        { name: 'خانه', url: '/' },
        { name: 'بلاگ', url: '/blog' },
        { name: post.title, url: `/blog/${post.slug}` },
      ]),
      generateArticleJsonLd(post),
    ],
  };
}

export function buildTutorialPostSeo(tutorial: {
  title: string; slug: string; seo_title?: string; seo_description?: string;
  excerpt?: string; og_image_url?: string; cover_image_url?: string;
  canonical_url?: string; author_name?: string; published_at?: string;
  updated_at?: string; duration_minutes?: number; difficulty_level?: string;
  focus_keyword?: string; schema_extra?: Record<string, unknown>;
}): SeoProps {
  return {
    title: tutorial.seo_title || `${tutorial.title} | آموزش | ${SITE_NAME}`,
    description: tutorial.seo_description || tutorial.excerpt || SITE_DESCRIPTION,
    canonical: tutorial.canonical_url || `${SITE_URL}/learn/${tutorial.slug}`,
    ogImage: tutorial.og_image_url || tutorial.cover_image_url || DEFAULT_OG_IMAGE,
    ogType: 'article',
    jsonLd: [
      generateBreadcrumbJsonLd([
        { name: 'خانه', url: '/' },
        { name: 'آموزش‌ها', url: '/learn' },
        { name: tutorial.title, url: `/learn/${tutorial.slug}` },
      ]),
      generateHowToJsonLd(tutorial),
    ],
  };
}

export function buildHomeSeo(): SeoProps {
  return {
    title: `${SITE_NAME} | نرم‌افزار مدیریت سازمانی`,
    description: SITE_DESCRIPTION,
    canonical: SITE_URL,
    ogImage: DEFAULT_OG_IMAGE,
    ogType: 'website',
    jsonLd: [generateOrganizationJsonLd(), generateWebSiteJsonLd()],
  };
}

export function buildBlogIndexSeo(categoryName?: string): SeoProps {
  const title = categoryName
    ? `${categoryName} | بلاگ ${SITE_NAME}`
    : `بلاگ | ${SITE_NAME}`;
  return {
    title,
    description: `مقالات و راهنماهای تخصصی مدیریت کسب‌وکار، فناوری و نرم‌افزار از تیم ${SITE_NAME}`,
    canonical: `${SITE_URL}/blog`,
    ogImage: DEFAULT_OG_IMAGE,
    ogType: 'website',
  };
}

export function buildTutorialIndexSeo(seriesName?: string): SeoProps {
  const title = seriesName
    ? `${seriesName} | آموزش‌ها | ${SITE_NAME}`
    : `آموزش‌ها | ${SITE_NAME}`;
  return {
    title,
    description: `آموزش‌های گام‌به‌گام استفاده از ${SITE_NAME} — از مبتدی تا پیشرفته`,
    canonical: `${SITE_URL}/learn`,
    ogImage: DEFAULT_OG_IMAGE,
    ogType: 'website',
  };
}

export { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, TWITTER_HANDLE };
