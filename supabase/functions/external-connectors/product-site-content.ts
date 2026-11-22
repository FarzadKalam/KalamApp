import { normalizeProductSiteSlug } from './product-site-slug.ts';

export interface ProductSiteContentForWoo {
  title?: unknown;
  short_description?: unknown;
  description?: unknown;
  slug?: unknown;
  seo_title?: unknown;
  seo_description?: unknown;
  focus_keyword?: unknown;
  site_image_url?: unknown;
  site_image_alt?: unknown;
}
export interface WooProductImage {
  id?: number;
  src?: string;
  name?: string;
  alt?: string;
  position?: number;
}

const text = (value: unknown) => String(value ?? '').trim();

const normalizeAllowedOrigin = (input: unknown) => {
  try {
    const url = new URL(text(input));
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        url.pathname !== '/' || url.search || url.hash) return '';
    return url.origin;
  } catch {
    return '';
  }
};

export const normalizePublicHttpsImageUrl = (input: unknown, allowedOrigins: string[]) => {
  const value = text(input);
  if (!value) return '';
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('نشانی تصویر معتبر نیست.'); }
  const hostname = url.hostname.toLowerCase();
  const trustedOrigins = new Set((Array.isArray(allowedOrigins) ? allowedOrigins : [])
    .map(normalizeAllowedOrigin).filter(Boolean));
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') ||
      hostname.endsWith('.internal') || /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(':') ||
      !hostname.includes('.') || !trustedOrigins.has(url.origin)) {
    throw new Error('نشانی تصویر باید HTTPS و روی دامنهٔ فایل/تصویر مجاز این سرور باشد.');
  }
  return url.toString();
};

const toSafeWooHtml = (input: unknown) => text(input)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\r?\n/g, '<br />');
const toPlainWooTitle = (input: unknown) => text(input).replace(/[<>]/g, '').replace(/[\u0000-\u001f]/g, ' ');

export const buildWooProductContentPayload = (
  content: ProductSiteContentForWoo,
  fallbackTitle: unknown,
  allowedImageOrigins: string[],
) => {
  const slug = normalizeProductSiteSlug(content.slug);
  const shortDescription = text(content.short_description);
  const description = text(content.description);
  const imageUrl = normalizePublicHttpsImageUrl(content.site_image_url, allowedImageOrigins);
  const payload: Record<string, unknown> = {
    name: toPlainWooTitle(content.title) || toPlainWooTitle(fallbackTitle),
    ...(shortDescription ? { short_description: toSafeWooHtml(shortDescription) } : {}),
    ...(description ? { description: toSafeWooHtml(description) } : {}),
    ...(slug ? { slug } : {}),
    ...(imageUrl ? { selectedImage: { src: imageUrl, alt: text(content.site_image_alt) } } : {}),
  };
  const changedFields = [
    'name',
    ...(shortDescription ? ['short_description'] : []),
    ...(description ? ['description'] : []),
    ...(slug ? ['slug'] : []),
    ...(imageUrl ? ['images'] : []),
  ];
  return { payload, changedFields };
};

export const mergeWooProductImages = (existing: unknown, selected: WooProductImage | undefined) => {
  if (!selected?.src) return undefined;
  const current = Array.isArray(existing) ? existing.filter((item) => item && typeof item === 'object') as WooProductImage[] : [];
  const sameImageExists = current.some((image) => text(image.src) === text(selected.src));
  const images = current.map((image, index) => ({
    ...(Number.isInteger(image.id) ? { id: image.id } : {}),
    ...(text(image.src) ? { src: text(image.src) } : {}),
    ...(text(image.name) ? { name: text(image.name) } : {}),
    alt: text(image.src) === text(selected.src) ? text(selected.alt) : text(image.alt),
    position: Number.isInteger(image.position) ? image.position : index,
  }));
  if (!sameImageExists) images.push({ src: text(selected.src), alt: text(selected.alt), position: images.length });
  return images;
};
