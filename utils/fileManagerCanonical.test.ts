import { describe, expect, it } from 'vitest';
import { canonicalizeFileManagerItems } from './fileManagerCanonical';

describe('canonicalizeFileManagerItems', () => {
  it('keeps entry over synthetic for the same origin image', () => {
    const items = canonicalizeFileManagerItems([
      {
        id: 'entry-1',
        asset_id: 'asset-1',
        file_url: 'https://example.com/storage/v1/object/public/images/record_files/tasks/1/photo.jpg',
        source_kind: 'entry' as const,
      },
      {
        id: 'synthetic-1',
        file_url: 'https://example.com/storage/v1/object/public/images/record_files/tasks/1/photo.jpg',
        source_kind: 'synthetic' as const,
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('entry-1');
  });

  it('keeps legacy fallback when no entry exists', () => {
    const items = canonicalizeFileManagerItems([
      {
        id: 'legacy-1',
        file_url: 'https://example.com/storage/v1/object/public/images/record_files/tasks/1/legacy.jpg',
        source_kind: 'legacy' as const,
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('legacy-1');
  });

  it('preserves shortcut entries separately from origin items', () => {
    const items = canonicalizeFileManagerItems([
      {
        id: 'origin-1',
        asset_id: 'asset-1',
        file_url: 'https://example.com/storage/v1/object/public/images/record_files/tasks/1/photo.jpg',
        source_kind: 'entry' as const,
      },
      {
        id: 'shortcut-1',
        asset_id: 'asset-1',
        file_url: 'https://example.com/storage/v1/object/public/images/record_files/tasks/1/photo.jpg',
        source_kind: 'entry' as const,
        is_shortcut: true,
      },
    ]);

    expect(items).toHaveLength(2);
  });
});

