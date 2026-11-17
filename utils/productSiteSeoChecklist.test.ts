import { describe, expect, it } from 'vitest';
import { getProductSiteSeoChecklist } from './productSiteSeoChecklist';

describe('getProductSiteSeoChecklist', () => {
  it('shows incomplete checks for an empty product draft', () => {
    const checks = getProductSiteSeoChecklist({});
    expect(checks).toHaveLength(8);
    expect(checks.filter((check) => check.passed).map((check) => check.key).sort()).toEqual(['image-alt', 'keyword']);
  });

  it('checks the supplied content and does not require a keyword', () => {
    const checks = getProductSiteSeoChecklist({
      title: 'چراغ مطالعه رومیزی مدل نمونه',
      shortDescription: 'چراغ مطالعه برای میز کار و مطالعه',
      description: 'بدنه فلزی با نور قابل تنظیم',
      slug: 'sample-desk-lamp',
      seoTitle: 'چراغ مطالعه رومیزی مدل نمونه با نور قابل تنظیم',
      seoDescription: 'چراغ مطالعه رومیزی با نور قابل تنظیم و طراحی مناسب برای میز کار، خانه و محیط مطالعه.',
      imageUrl: 'https://example.test/lamp.jpg',
      imageAlt: 'چراغ مطالعه روی میز',
    });
    expect(checks.find((check) => check.key === 'title')?.passed).toBe(true);
    expect(checks.find((check) => check.key === 'slug')?.passed).toBe(true);
    expect(checks.find((check) => check.key === 'image-alt')?.passed).toBe(true);
    expect(checks.find((check) => check.key === 'keyword')?.passed).toBe(true);
  });

  it('requires alt text only when a site image exists and detects keyword use', () => {
    const checks = getProductSiteSeoChecklist({ imageUrl: 'https://example.test/a.jpg', focusKeyword: 'آباژور' });
    expect(checks.find((check) => check.key === 'image-alt')?.passed).toBe(false);
    expect(checks.find((check) => check.key === 'keyword')?.passed).toBe(false);
  });
});
