import { describe, expect, it } from 'vitest';
import { buildWooProductContentPayload, mergeWooProductImages, normalizePublicHttpsImageUrl } from './product-site-content';

const allowedOrigins = ['https://cdn.example.com'];

describe('manual WooCommerce product-content payload', () => {
  it('requires an allowlisted public HTTPS image URL and rejects local or untrusted targets', () => {
    expect(normalizePublicHttpsImageUrl('https://cdn.example.com/item.jpg', allowedOrigins))
      .toBe('https://cdn.example.com/item.jpg');
    for (const url of [
      '//cdn.example.com/item.jpg',
      'http://cdn.example.com/item.jpg',
      'data:image/png;base64,AA',
      'https://localhost/item.jpg',
      'https://127.0.0.1/item.jpg',
      'https://[::1]/item.jpg',
      'https://user:secret@cdn.example.com/item.jpg',
      'https://untrusted.example.net/item.jpg',
    ]) {
      expect(() => normalizePublicHttpsImageUrl(url, allowedOrigins)).toThrow();
    }
    expect(normalizePublicHttpsImageUrl('', allowedOrigins)).toBe('');
    expect(() => normalizePublicHttpsImageUrl('https://cdn.example.com/item.jpg', [])).toThrow();
  });

  it('escapes textarea content before sending HTML and omits plugin-specific SEO and status fields', () => {
    const result = buildWooProductContentPayload({
      title: '<img src=x onerror=alert(1)>',
      short_description: 'short & safe',
      description: '<script>alert(1)</script>\nsecond line',
      slug: 'safe-product-2',
      site_image_url: 'https://cdn.example.com/item.jpg',
      site_image_alt: 'product',
      seo_title: 'SEO title',
      seo_description: 'meta',
    }, 'fallback', allowedOrigins);
    expect(result.payload).toMatchObject({
      name: 'img src=x onerror=alert(1)',
      short_description: 'short &amp; safe',
      description: '&lt;script&gt;alert(1)&lt;/script&gt;<br />second line',
      slug: 'safe-product-2',
    });
    expect(result.payload).not.toHaveProperty('status');
    expect(result.payload).not.toHaveProperty('meta_data');
    expect(result.payload).toHaveProperty('selectedImage', { src: 'https://cdn.example.com/item.jpg', alt: 'product' });
    expect(result.changedFields).toContain('images');
  });

  it('omits blank descriptions so a manual sync cannot clear existing WooCommerce text', () => {
    const result = buildWooProductContentPayload({
      title: 'Product',
      short_description: '  ',
      description: '',
    }, 'Fallback', allowedOrigins);
    expect(result.payload).not.toHaveProperty('short_description');
    expect(result.payload).not.toHaveProperty('description');
    expect(result.changedFields).not.toContain('short_description');
    expect(result.changedFields).not.toContain('description');
  });

  it('rejects invalid slugs and does not overwrite images when no image is selected', () => {
    expect(() => buildWooProductContentPayload({ slug: '../unsafe' }, 'Product', allowedOrigins)).toThrow('slug');
    const result = buildWooProductContentPayload({ title: '', site_image_url: '' }, 'Fallback product', allowedOrigins);
    expect(result.payload).toHaveProperty('name', 'Fallback product');
    expect(result.payload).not.toHaveProperty('images');
  });

  it('preserves the WooCommerce image gallery and only appends or updates the selected site image', () => {
    const current = [
      { id: 11, src: 'https://cdn.example.com/cover.jpg', alt: 'cover', name: 'cover', position: 0 },
      { id: 12, src: 'https://cdn.example.com/detail.jpg', alt: 'detail', name: 'detail', position: 1 },
    ];
    const merged = mergeWooProductImages(current, { src: 'https://cdn.example.com/site.jpg', alt: 'site image' });
    expect(merged).toHaveLength(3);
    expect(merged?.[0]).toMatchObject({ id: 11, src: current[0].src, alt: 'cover' });
    expect(merged?.[2]).toMatchObject({ src: 'https://cdn.example.com/site.jpg', alt: 'site image', position: 2 });
    const updated = mergeWooProductImages(current, { src: current[1].src, alt: 'new alt' });
    expect(updated).toHaveLength(2);
    expect(updated?.[1]).toMatchObject({ id: 12, src: current[1].src, alt: 'new alt' });
  });
});
