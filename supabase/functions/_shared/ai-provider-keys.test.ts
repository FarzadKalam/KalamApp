// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAiModelRoute, toAiCatalogModelId } from './ai-provider-catalog';
import { readAiProviderConfig, parseAlternateProviderModels, prepareAlternateChatRequest } from './ai-provider-runtime';
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

describe('central chat provider routing', () => {
  it('keeps the same upstream model distinct while preserving legacy IDs', () => {
    const model = 'example/chat:free';
    expect(getAiModelRoute(model)).toEqual({ provider: 'avalai', model });
    expect(getAiModelRoute(toAiCatalogModelId('openrouter', model))).toEqual({ provider: 'openrouter', model });
    expect(getAiModelRoute(toAiCatalogModelId('llm7', model))).toEqual({ provider: 'llm7', model });
  });

  it('isolates legacy secrets and fallback hosts from the alternate providers', async () => {
    const env: Record<string, string> = {
      AI_API_KEY: 'legacy-key',
      AI_BASE_URL: 'https://legacy.example/v1',
      AI_FALLBACK_BASE_URLS: 'https://legacy-backup.example/v1',
      OPENROUTER_API_KEY: 'openrouter-key',
      CLOUDFLARE_AI_ACCOUNT_ID: 'a'.repeat(32),
    };
    const readEnv = (key: string) => env[key];
    expect(readAiProviderConfig('avalai', readEnv)).toMatchObject({ apiKey: 'legacy-key', fallbackBaseUrls: ['https://legacy-backup.example/v1'] });
    expect(readAiProviderConfig('openrouter', readEnv)).toMatchObject({ apiKey: 'openrouter-key', baseUrl: 'https://openrouter.ai/api/v1', fallbackBaseUrls: [] });
    expect(readAiProviderConfig('llm7', readEnv)).toMatchObject({ apiKey: '', baseUrl: 'https://api.llm7.io/v1', fallbackBaseUrls: [] });
    expect(readAiProviderConfig('cloudflare', readEnv).baseUrl).toBe(`https://api.cloudflare.com/client/v4/accounts/${'a'.repeat(32)}/ai/v1`);
    expect(readAiProviderConfig('cloudflare', () => '../malformed').baseUrl).toBe('');

    clearCentralAiProviderKeyCache();
    const fetcher = vi.fn(async () => Response.json([]));
    const db = { supabaseUrl: 'https://db.example.test', serviceRoleKey: 'test-service-role', fetcher };
    await resolveCentralAiApiKey({ ...db, provider: 'avalai', envFallbackKey: 'legacy-key' });
    await expect(resolveCentralAiApiKey({ ...db, provider: 'llm7' })).resolves.toMatchObject({ apiKey: '', source: 'none' });
    expect(fetcher.mock.calls).toHaveLength(2);
  });

  it('normalizes model pricing and only imports compatible chat models', () => {
    const [openrouter] = parseAlternateProviderModels('openrouter', [
      { id: 'openai/chat', architecture: { input_modalities: ['text'], output_modalities: ['text'] }, pricing: { prompt: '0.00000012', completion: '0' } },
      { id: 'openai/audio', architecture: { input_modalities: ['audio'], output_modalities: ['text'] } },
    ]);
    expect(openrouter).toMatchObject({ id: 'openrouter::openai/chat', input_usd_per_1m: expect.closeTo(0.12), output_usd_per_1m: 0 });
    expect(parseAlternateProviderModels('llm7', [
      { id: 'gpt-oss:20b', model_type: 'chat', context_window: { tokens: 128000 }, pricing: { input: 0.03, output: 0.05, currency: 'USD', unit: '1M tokens' } },
      { id: 'other-model', model_type: 'image' },
    ])).toMatchObject([{ id: 'llm7::gpt-oss:20b', context_window: 128000, input_usd_per_1m: 0.03 }]);
    expect(parseAlternateProviderModels('cloudflare', [{ name: '@cf/openai/gpt-oss-20b' }])[0].input_usd_per_1m).toBeNull();
  });

  it('sends the upstream model ID and removes the AvalAI-specific fields', () => {
    const body = { model: 'llm7::gpt-oss:20b', max_completion_tokens: 500, service_tier: 'default', prompt_cache_key: 'test', safety_identifier: 'test', stream: true };
    expect(prepareAlternateChatRequest(body.model, body)).toEqual({ model: 'gpt-oss:20b', max_tokens: 500, stream: true });
    expect(prepareAlternateChatRequest('existing-model', body)).toBe(body);
  });
});
