import { describe, expect, it } from 'vitest';
import { getImagePreviewCandidates } from './imagePreview';

describe('getImagePreviewCandidates', () => {
  it('keeps raw public storage urls as the primary preview path by default', () => {
    const url = 'https://example.com/storage/v1/object/public/images/record_files/tasks/1/photo.jpg';
    const candidates = getImagePreviewCandidates(url, 'thumb');

    expect(candidates).toEqual([url]);
  });

  it('returns only original for non-transformable urls', () => {
    const url = 'data:image/png;base64,abc';
    expect(getImagePreviewCandidates(url, 'thumb')).toEqual([url]);
  });
});
