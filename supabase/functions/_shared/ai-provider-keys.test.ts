// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCentralAiProviderKeyCache,
  decryptProviderApiKey,
  encryptProviderApiKey,
  hashProviderApiKeySha256,
  maskProviderApiKey,
  resolveCentralAiApiKey,
} from './ai-provider-keys';

describe('ai-provider-keys helper', () => {
  beforeEach(() => {
    clearCentralAiProviderKeyCache();
  });

  it('masks API keys safely without exposing the middle secret segment', () => {
    expect(maskProviderApiKey('aa-1234567890abcdef')).toBe('aa-123••••••cdef');
    expect(maskProviderApiKey('shortkey12')).toBe('sho••••••y12');
    expect(maskProviderApiKey('')).toBe('');
  });

  it('encrypts and decrypts API keys round-trip and hashes consistently', async () => {
    const raw = 'aa-test-secret-key-987654321';
    const seed = 'service-role-seed-for-tests';
    const encrypted = await encryptProviderApiKey(raw, seed);

    expect(encrypted.startsWith('enc:v1:')).toBe(true);
    expect(encrypted).not.toContain(raw);
    await expect(decryptProviderApiKey(encrypted, seed)).resolves.toBe(raw);

    const hashA = await hashProviderApiKeySha256(raw);
    const hashB = await hashProviderApiKeySha256(`  ${raw}  `);
    expect(hashA).toBe(hashB);
    expect(hashA).toHaveLength(64);
  });

  it('prefers the active database key over env fallback and refreshes after cache clear', async () => {
    const seed = 'test-service-role-key';
    const dbKey = 'aa-db-active-key-11112222';
    const ciphertext = await encryptProviderApiKey(dbKey, seed);
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: 'key-1', api_key_ciphertext: ciphertext }]), { status: 200 }),
    );

    const resolved = await resolveCentralAiApiKey({
      supabaseUrl: 'https://db.example.test',
      serviceRoleKey: seed,
      envFallbackKey: 'aa-env-fallback-key',
      fetcher: fetcher as unknown as typeof fetch,
    });

    expect(resolved).toEqual({
      apiKey: dbKey,
      source: 'db',
      keyId: 'key-1',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Subsequent call uses cache without extra REST fetch
    await resolveCentralAiApiKey({
      supabaseUrl: 'https://db.example.test',
      serviceRoleKey: seed,
      envFallbackKey: 'aa-env-fallback-key',
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    clearCentralAiProviderKeyCache('avalai');
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    const fallbackResolved = await resolveCentralAiApiKey({
      supabaseUrl: 'https://db.example.test',
      serviceRoleKey: seed,
      envFallbackKey: 'aa-env-fallback-key',
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(fallbackResolved).toEqual({
      apiKey: 'aa-env-fallback-key',
      source: 'env',
      keyId: null,
    });
  });
});
