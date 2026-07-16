import { describe, expect, it } from 'vitest';
import { clearAppRuntimeCache, getAppRuntimeCached, readAppRuntimeCache } from './appRuntimeCache';

describe('app runtime cache ordering', () => {
  it('does not let an older request overwrite a newer forced value', async () => {
    clearAppRuntimeCache('runtime-order:');
    let resolveOlder!: (value: string) => void;
    const older = getAppRuntimeCached({
      key: 'runtime-order:record',
      ttlMs: 30_000,
      loader: () => new Promise<string>((resolve) => { resolveOlder = resolve; }),
    });
    const newer = getAppRuntimeCached({
      key: 'runtime-order:record',
      ttlMs: 30_000,
      force: true,
      loader: async () => 'newer',
    });

    await expect(newer).resolves.toBe('newer');
    resolveOlder('older');
    await expect(older).resolves.toBe('older');
    expect(readAppRuntimeCache('runtime-order:record')).toBe('newer');
  });
});
