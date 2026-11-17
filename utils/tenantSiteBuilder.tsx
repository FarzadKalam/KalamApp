export type SiteBlock = { type: 'heading' | 'paragraph' | 'button'; text: string; href?: string; level?: number };
export const validateSiteBlocks = (value: unknown): string | null => {
  if (!Array.isArray(value)) return 'بلوک‌ها باید آرایه باشند.';
  if (value.length > 100) return 'حداکثر ۱۰۰ بلوک مجاز است.';
  for (const block of value) {
    if (!block || typeof block !== 'object' || !['heading', 'paragraph', 'button'].includes((block as any).type) || typeof (block as any).text !== 'string') return 'هر بلوک باید type و text معتبر داشته باشد.';
    if ((block as any).text.length > 10000) return 'متن هر بلوک حداکثر ۱۰٬۰۰۰ نویسه است.';
    if ((block as any).type === 'heading' && (block as any).level !== undefined
      && (!Number.isInteger(Number((block as any).level)) || Number((block as any).level) < 1 || Number((block as any).level) > 4)) return 'سطح تیتر باید بین ۱ و ۴ باشد.';
    if ((block as any).type === 'button') {
      const href = typeof (block as any).href === 'string' ? (block as any).href.trim() : '';
      if (!href || href.length > 2048 || /[\\\u0000-\u001f]/.test(href)
        || !( /^https:\/\/[^\s]+$/i.test(href) || (href.startsWith('/') && !href.startsWith('//')))) {
        return 'نشانی پیوند باید HTTPS یا مسیر نسبی امن باشد.';
      }
    }
  }
  return null;
};
export const renderSiteBlocks = (value: unknown) => {
  if (validateSiteBlocks(value)) return <div />;
  const blocks = value as SiteBlock[];
  return <div>{blocks.map((block, i) => {
  if (block.type === 'heading') { const Tag = (`h${Math.min(4, Math.max(1, Number(block.level) || 2))}`) as keyof JSX.IntrinsicElements; return <Tag key={i}>{block.text}</Tag>; }
  if (block.type === 'button') return <p key={i}><a href={block.href || '#'}>{block.text}</a></p>;
  return <p key={i}>{block.text}</p>;
})}</div>;
};
export const isPublicPageVisible = (page: { orgSlug: string; pageSlug: string; publishedBlocks?: unknown } | null, orgSlug: string, pageSlug: string) => Boolean(page && page.orgSlug.toLowerCase() === orgSlug.toLowerCase() && page.pageSlug === pageSlug && validateSiteBlocks(page.publishedBlocks) === null);
