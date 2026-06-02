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
});
