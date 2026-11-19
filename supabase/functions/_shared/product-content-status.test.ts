import { describe, expect, it } from 'vitest';
import { getProductContentStatus, hashProductContent, type ProductContentSnapshot } from './product-content-status';
import { normalizeProductSiteSlug } from './product-site-slug';

const baseline = { localHash: 'app', remoteHash: 'shop', syncedAt: '2026-11-19T00:00:00Z' };

describe('product content comparison', () => {
  it('distinguishes unverified, matching, one-sided changes, and conflicts', () => {
    expect(getProductContentStatus('app', 'shop', null)).toBe('unverified');
    expect(getProductContentStatus('same', 'same', null)).toBe('synced');
    expect(getProductContentStatus('app', 'shop', baseline)).toBe('synced');
    expect(getProductContentStatus('app2', 'shop', baseline)).toBe('app_changed');
    expect(getProductContentStatus('app', 'shop2', baseline)).toBe('site_changed');
    expect(getProductContentStatus('app2', 'shop2', baseline)).toBe('conflict');
    expect(getProductContentStatus('app', 'shop', { ...baseline, partial: true })).toBe('partial');
  });

  it('treats formatting and image changes as content changes', async () => {
    const draft: ProductContentSnapshot = {
      title: 'محصول', short_description: '', description: '<p>متن</p>', slug: 'product',
      site_image_url: '', site_image_alt: '',
    };
    const hash = await hashProductContent(draft);
    expect(await hashProductContent({ ...draft })).toBe(hash);
    expect(await hashProductContent({ ...draft, description: '<p style="text-align:center">متن</p>' })).not.toBe(hash);
    expect(await hashProductContent({ ...draft, site_image_url: 'https://example.org/new.jpg' })).not.toBe(hash);
  });

  it('compares Persian slugs as the same value before and after Woo encoding', () => {
    const slug = 'محصول-فروشگاه';
    expect(normalizeProductSiteSlug(encodeURIComponent(slug))).toBe(normalizeProductSiteSlug(slug));
    expect(() => normalizeProductSiteSlug('product%2fother')).toThrow();
  });
});
