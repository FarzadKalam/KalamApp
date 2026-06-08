import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SITE_URL = 'https://tazesystem.ir';

const STATIC_PAGES = [
  { url: '/', priority: '1.0', changefreq: 'weekly' },
  { url: '/features', priority: '0.9', changefreq: 'monthly' },
  { url: '/pricing', priority: '0.9', changefreq: 'weekly' },
  { url: '/blog', priority: '0.8', changefreq: 'daily' },
  { url: '/learn', priority: '0.8', changefreq: 'daily' },
  { url: '/updates', priority: '0.7', changefreq: 'weekly' },
  { url: '/about', priority: '0.6', changefreq: 'monthly' },
  { url: '/contact', priority: '0.5', changefreq: 'monthly' },
];

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const [blogRes, tutorialRes, seriesRes, categoriesRes] = await Promise.all([
    supabase
      .from('cms_blog_posts')
      .select('slug, published_at, updated_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false }),
    supabase
      .from('cms_tutorial_posts')
      .select('slug, published_at, updated_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false }),
    supabase
      .from('cms_tutorial_series')
      .select('slug, updated_at'),
    supabase
      .from('cms_categories')
      .select('slug, type, updated_at'),
  ]);

  const urls: string[] = [];

  const addUrl = (loc: string, lastmod?: string, priority = '0.6', changefreq = 'weekly') => {
    urls.push(`  <url>
    <loc>${SITE_URL}${loc}</loc>
    ${lastmod ? `<lastmod>${new Date(lastmod).toISOString().split('T')[0]}</lastmod>` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`);
  };

  // Static pages
  for (const page of STATIC_PAGES) {
    addUrl(page.url, undefined, page.priority, page.changefreq);
  }

  // Blog posts
  for (const post of blogRes.data ?? []) {
    addUrl(`/blog/${post.slug}`, post.updated_at ?? post.published_at, '0.7', 'monthly');
  }

  // Tutorial posts
  for (const post of tutorialRes.data ?? []) {
    addUrl(`/learn/${post.slug}`, post.updated_at ?? post.published_at, '0.7', 'monthly');
  }

  // Tutorial series
  for (const series of seriesRes.data ?? []) {
    addUrl(`/learn/series/${series.slug}`, series.updated_at, '0.6', 'monthly');
  }

  // Categories
  for (const cat of categoriesRes.data ?? []) {
    if (cat.type === 'blog' || cat.type === 'both') {
      addUrl(`/blog/category/${cat.slug}`, cat.updated_at, '0.5', 'weekly');
    }
    if (cat.type === 'tutorial' || cat.type === 'both') {
      addUrl(`/learn/category/${cat.slug}`, cat.updated_at, '0.5', 'weekly');
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});
