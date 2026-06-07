import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  getAvatarFallbackText,
  preloadAvatarUrls,
  preloadOrganizationAvatarDirectory,
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

  it('preloads only the preferred avatar candidate once per session cache', () => {
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
    expect(assignedSources[0]).toContain('/storage/v1/render/image/public/images/');
  });

  it('loads active organization avatars once and warms the shared image cache', async () => {
    const assignedSources: string[] = [];
    const ImageMock = class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        assignedSources.push(value);
        this.onload?.();
      }
      set decoding(_: string) {}
      set fetchPriority(_: string) {}
    };
    const originalImage = (globalThis as any).Image;
    (globalThis as any).Image = ImageMock;

    const range = vi.fn().mockResolvedValue({
      data: [
        { avatar_url: 'https://example.com/storage/v1/object/public/images/avatars/u1.jpg' },
        { avatar_url: 'https://example.com/storage/v1/object/public/images/avatars/u2.jpg' },
      ],
      error: null,
    });
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      not: vi.fn(() => query),
      range,
    };
    const client = { from: vi.fn(() => query) };

    try {
      await preloadOrganizationAvatarDirectory(client, 'org-1');
      await preloadOrganizationAvatarDirectory(client, 'org-1');
    } finally {
      (globalThis as any).Image = originalImage;
    }

    expect(client.from).toHaveBeenCalledOnce();
    expect(range).toHaveBeenCalledWith(0, 249);
    expect(assignedSources).toHaveLength(2);
  });
});
