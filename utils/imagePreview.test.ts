import { describe, expect, it } from 'vitest';
import { buildImageBackgroundStyle, buildImagePreviewUrl, getImagePreviewCandidates, toImageTransformUrl } from './imagePreview';

describe('getImagePreviewCandidates', () => {
  it('returns transformed preview first and falls back to the original url when preview is enabled', () => {
    const url = 'https://example.com/storage/v1/object/public/images/record_files/tasks/1/photo.jpg';
    const candidates = getImagePreviewCandidates(url, 'thumb');

    expect(candidates).toEqual([
      'https://example.com/storage/v1/render/image/public/images/record_files/tasks/1/photo.jpg?width=260&quality=68&resize=cover',
      url,
    ]);
  });

  it('returns only original for non-transformable urls', () => {
    const url = 'data:image/png;base64,abc';
    expect(getImagePreviewCandidates(url, 'thumb')).toEqual([url]);
  });

  it('can build a transformed url explicitly for print-safe diagnostics', () => {
    const url = 'https://example.com/storage/v1/object/public/images/record_files/tasks/1/photo.jpg';

    expect(toImageTransformUrl(url, 'printHero')).toBe(
      'https://example.com/storage/v1/render/image/public/images/record_files/tasks/1/photo.jpg?width=1400&quality=68&resize=cover'
    );
    expect(buildImagePreviewUrl(url, 'thumb', { forceTransform: true })).toBe(
      'https://example.com/storage/v1/render/image/public/images/record_files/tasks/1/photo.jpg?width=260&quality=68&resize=cover'
    );
  });

  it('builds background-image styles from optimized image urls', () => {
    const url = 'https://example.com/storage/v1/object/public/images/record_files/tasks/1/photo.jpg';

    expect(buildImageBackgroundStyle(url, 'hero')).toEqual({
      backgroundImage: 'url("https://example.com/storage/v1/render/image/public/images/record_files/tasks/1/photo.jpg?width=920&quality=76&resize=cover")',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    });
  });
});
