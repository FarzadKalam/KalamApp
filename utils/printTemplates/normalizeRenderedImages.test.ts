import { describe, expect, it } from 'vitest';
import { normalizeRenderedImages } from './normalizeRenderedImages';

describe('normalizeRenderedImages', () => {
  it('normalizes legacy storage hosts in image src and inline style urls', () => {
    const html = `
      <div style="background-image:url('https://api.kalamapp.ir/storage/v1/object/public/images/maps/test.jpg')"></div>
      <img src="https://api.kalamapp.ir/storage/v1/object/public/images/record_files/billboards/test.jpg" alt="تصویر" />
    `;

    const normalized = normalizeRenderedImages(html);

    expect(normalized).toContain('https://api.tazesystem.ir/storage/v1/object/public/images/maps/test.jpg');
    expect(normalized).toContain('https://api.tazesystem.ir/storage/v1/object/public/images/record_files/billboards/test.jpg');
    expect(normalized).toContain('loading="eager"');
  });

  it('keeps data urls intact', () => {
    const html = `<img src="data:image/png;base64,abc123" alt="لوگو" />`;

    const normalized = normalizeRenderedImages(html);

    expect(normalized).toContain('src="data:image/png;base64,abc123"');
  });

  it('keeps maximum dimensions as constraints and restores transformed sources for the PDF renderer', () => {
    const html = '<table><tr><td><img src="https://api.tazesystem.ir/storage/v1/render/image/public/images/logo.png?width=240&amp;quality=72&amp;resize=contain" alt="لوگوی سازمان" style="width:auto;max-width:100%;height:auto;max-height:36px;object-fit:contain"></td></tr></table>';

    const normalized = normalizeRenderedImages(html);

    expect(normalized).toContain('src="https://api.tazesystem.ir/storage/v1/object/public/images/logo.png"');
    expect(normalized).toContain('width:auto');
    expect(normalized).toContain('max-width:100%');
    expect(normalized).toContain('max-height:36px');
    expect(normalized).not.toMatch(/(?:^|;)width:100% !important/);
  });

  it('keeps an editor table full-width in isolated PDF header and footer documents', () => {
    const html = '<div class="tableWrapper"><table style="min-width:75px"><colgroup><col style="min-width:25px"></colgroup><tbody><tr><td>راست</td><td>وسط</td><td>چپ</td></tr></tbody></table></div>';

    const normalized = normalizeRenderedImages(html);

    expect(normalized).toContain('width:100% !important');
    expect(normalized).toContain('max-width:100% !important');
    expect(normalized).toContain('table-layout:fixed !important');
    expect(normalized).toContain('min-width:75px');
  });
});
