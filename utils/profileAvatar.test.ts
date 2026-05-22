import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  getAvatarFallbackText,
  preloadAvatarUrls,
  resetAvatarPreloadCacheForTest,
} from './profileAvatar';

describe('profileAvatar', () => {
  beforeEach(() => {
    resetAvatarPreloadCacheForTest();
  });

  it('returns first meaningful character for avatar fallback', () => {
    expect(getAvatarFallbackText('  علی رضایی  ')).toBe('ع');
    expect(getAvatarFallbackText('elmira dabagh')).toBe('E');
    expect(getAvatarFallbackText('')).toBe('?');
  });

  it('preloads the raw avatar candidate once per session cache', () => {
    const assignedSources: string[] = [];
    const ImageMock = class {
      set src(value: string) {
        assignedSources.push(value);
      }
      set decoding(_: string) {}
    };
    const originalImage = (globalThis as any).Image;
    (globalThis as any).Image = ImageMock;

    try {
      preloadAvatarUrls(['https://example.com/storage/v1/object/public/images/avatars/u1/photo.jpg']);
      preloadAvatarUrls(['https://example.com/storage/v1/object/public/images/avatars/u1/photo.jpg']);
    } finally {
      (globalThis as any).Image = originalImage;
    }

    expect(assignedSources).toHaveLength(1);
    expect(assignedSources[0]).toContain('/storage/v1/object/public/images/');
  });
});
