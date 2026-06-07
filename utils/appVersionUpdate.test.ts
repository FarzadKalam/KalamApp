import { describe, expect, it } from 'vitest';
import {
  compareAppVersions,
  resolveAppVersionBannerMode,
  validateAppVersionManifest,
} from './appVersionUpdate';

describe('appVersionUpdate', () => {
  it('compares versions with different segment counts', () => {
    expect(compareAppVersions('2.0.5.3.1', '2.0.5.3')).toBe(1);
    expect(compareAppVersions('2.0.5.3', '2.0.5.3.0')).toBe(0);
    expect(compareAppVersions('2.0.5.2.9', '2.0.5.3')).toBe(-1);
  });

  it('selects the available and completed banner states', () => {
    expect(resolveAppVersionBannerMode('2.0.5.3.2', '2.0.5.3.1')).toBe('available');
    expect(resolveAppVersionBannerMode('2.0.5.3.1', '2.0.5.3.1', '2.0.5.3.1')).toBe('completed');
    expect(resolveAppVersionBannerMode('2.0.5.3.1', '2.0.5.3.1')).toBeNull();
  });

  it('keeps backward compatibility with the old manifest shape', () => {
    expect(validateAppVersionManifest({
      version: '2.0.5.3.1',
      releasedAt: '2026-06-06T18:45:46Z',
      changes: ['رفع خطا'],
    })).toEqual({
      version: '2.0.5.3.1',
      releasedAt: '2026-06-06T18:45:46Z',
      changes: ['رفع خطا'],
      releases: [
        {
          version: '2.0.5.3.1',
          releasedAt: '2026-06-06T18:45:46Z',
          changes: ['رفع خطا'],
        },
      ],
    });
  });

  it('normalizes, sorts, and deduplicates release history', () => {
    const manifest = validateAppVersionManifest({
      version: '2.0.5.3.1',
      changes: ['نسخه جاری'],
      releases: [
        { version: '2.0.5.2', changes: ['نسخه قدیمی'] },
        { version: '2.0.5.3.1', changes: ['نسخه تکراری'] },
        { version: '2.0.5.3', changes: ['نسخه میانی'] },
        { version: '', changes: ['نامعتبر'] },
      ],
    });

    expect(manifest?.releases.map((release) => release.version)).toEqual([
      '2.0.5.3.1',
      '2.0.5.3',
      '2.0.5.2',
    ]);
    expect(manifest?.releases[0].changes).toEqual(['نسخه جاری']);
  });
});
