import { describe, expect, it } from 'vitest';
import { getImagePreviewCandidates } from './imagePreview';

describe('getImagePreviewCandidates', () => {
  it('returns preview and original for transformable public storage urls', () => {
    const url = 'https://example.com/storage/v1/object/public/images/record_files/tasks/1/photo.jpg';
    const candidates = getImagePreviewCandidates(url, 'thumb');

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toContain('/storage/v1/render/image/public/images/');
    expect(candidates[1]).toBe(url);
  });

  it('returns only original for non-transformable urls', () => {
    const url = 'data:image/png;base64,abc';
    expect(getImagePreviewCandidates(url, 'thumb')).toEqual([url]);
  });
});
