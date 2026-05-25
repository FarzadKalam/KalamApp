import { describe, expect, it } from 'vitest';
import { buildOrgStoriesWithMeta } from './orgStories';

describe('buildOrgStoriesWithMeta', () => {
  it('normalizes legacy storage hosts in story assets before rendering', () => {
    const stories = buildOrgStoriesWithMeta(
      [{
        id: 'story-1',
        creator_avatar: 'https://api.kalamapp.ir/storage/v1/object/public/images/avatar.jpg',
        slides: [{
          id: 'slide-1',
          type: 'image',
          image_url: 'https://api.kalamapp.ir/storage/v1/object/public/images/story.jpg',
          text_layers: [],
          duration_ms: 5000,
        }],
        published_at: '2026-05-25T00:00:00.000Z',
        is_pinned: false,
      } as any],
      [],
      [],
      'user-1',
    );

    expect(stories[0].creator_avatar).toBe('https://api.tazesystem.ir/storage/v1/object/public/images/avatar.jpg');
    expect(stories[0].slides[0].image_url).toBe('https://api.tazesystem.ir/storage/v1/object/public/images/story.jpg');
  });
});
