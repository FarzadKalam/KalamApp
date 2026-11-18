// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { buildAvalaiPromptCacheKey, fetchAvalaiChatWithCacheKey, modelSupportsSlot, orderAiRequestTools, resolveCapabilityModelSlot, tryResolveModelSlot } from './ai-gateway';

describe('AvalAI cache routing hints', () => {
  const stable = { orgId: 'internal-tenant-identifier', workload: 'dashboard_chat', stableSystemPrefix: 'قواعد ثابت سازمان' };

  it.each(['gpt-6.2-sol', 'gpt-6.1-terra', 'gpt-6-luna'])('supports the implicit cache routing key for %s', async modelId => {
    const key = await buildAvalaiPromptCacheKey({ ...stable, modelId, route: 'responses' });
    expect(key).toMatch(/^kalam_[0-9a-f]{40}$/);
    expect(key).not.toContain(stable.orgId);
    expect(await buildAvalaiPromptCacheKey({ ...stable, modelId, orgId: 'another-tenant', route: 'responses' })).not.toBe(key);
    expect(await buildAvalaiPromptCacheKey({ ...stable, modelId, route: 'chat' })).not.toBe(key);
  });

  it.each(['claude-haiku-5-5', 'gemini-4-hydrogen', 'deepseek-v4.1-flash'])('lets %s use provider caching without OpenAI parameters', async modelId => {
    expect(await buildAvalaiPromptCacheKey({ ...stable, modelId, modelCatalog: { id: modelId, metadata: { supports_prompt_caching: true } } })).toBeUndefined();
  });

  it('uses verified support for a new alias and keeps request-specific overrides authoritative', async () => {
    const newAlias = { id: 'new-model', metadata: { supports_prompt_cache_key: true } };
    expect(await buildAvalaiPromptCacheKey({ ...stable, modelCatalog: newAlias })).toBeDefined();
    expect(await buildAvalaiPromptCacheKey({ ...stable, modelCatalog: newAlias, route: 'messages' })).toBeUndefined();
    expect(await buildAvalaiPromptCacheKey({ ...stable, orgId: null, modelCatalog: newAlias })).toBeUndefined();
    expect(await buildAvalaiPromptCacheKey({ ...stable, modelCatalog: { id: 'gpt-6-luna', metadata: { supports_prompt_cache_key: false } } })).toBeUndefined();
  });

  it('stabilizes tool order and scopes a routing key to the actual tool schema', async () => {
    const a = { type: 'function', function: { name: 'read_a', parameters: { properties: { page: { type: 'integer' } } } } };
    const b = { type: 'function', function: { name: 'read_b' } };
    const build = (tools: Array<typeof a | typeof b>) => buildAvalaiPromptCacheKey({ ...stable, modelId: 'gpt-6-luna', tools: orderAiRequestTools(tools) });
    expect(orderAiRequestTools([b, a])).toEqual([a, b]);
    expect(await build([a, b])).toBe(await build([b, a]));
    expect(await build([a, b])).not.toBe(await build([a]));
  });

  it('retries the same direct request without a rejected routing key', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('unsupported parameter prompt_cache_key', { status: 400 }))
      .mockResolvedValueOnce(new Response('ok'));
    vi.stubGlobal('fetch', fetch);
    try {
      const body = { model: 'gpt-6-luna', messages: [{ role: 'system', content: stable.stableSystemPrefix }] };
      await expect(fetchAvalaiChatWithCacheKey('https://example.test/v1/chat/completions', {}, body, 'routing-hint')).resolves.toMatchObject({ ok: true });
      expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ ...body, prompt_cache_key: 'routing-hint' });
      expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual(body);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

const catalog = [
  { id: 'tenant-main', provider: 'test', is_active: true, capability_tags: ['dashboard_chat', 'document_analysis'] },
  { id: 'sales-model', provider: 'test', is_active: true, capability_tags: ['record_chat'] },
  { id: 'voice-only', provider: 'test', is_active: true, capability_tags: ['voice_output'] },
];
describe('operational model slot resolution', () => {
  it('keeps native image analysis on the selected primary even with an old analysis slot', () => {
    const result = tryResolveModelSlot({ slot: 'document_analysis', catalogRows: catalog,
      orgAiSettings: { selected_models: { __primary_model: 'tenant-main', document_analysis: 'sales-model' } } });
    expect(result?.model).toBe('tenant-main'); expect(result?.source).toBe('org_primary');
  });
  it('recognizes catalog vision metadata without requiring an artificial skill model tag', () => {
    const vision = { ...catalog[1], metadata: { input_modalities: ['text', 'image'] } };
    expect(tryResolveModelSlot({ slot: 'document_analysis', catalogRows: [catalog[0], vision],
      agentConfig: { agent_key: 'sales_leads', model_override: 'sales-model' } })?.model).toBe('sales-model');
  });
  it('uses an analysis specialist when the chosen primary has no native analysis support', () => {
    expect(tryResolveModelSlot({ slot: 'document_analysis', catalogRows: catalog,
      orgAiSettings: { selected_models: { __primary_model: 'sales-model', document_analysis: 'tenant-main' } } })?.model).toBe('tenant-main');
  });
  it.each(['record_creation', 'process_operation', 'pricing_adjustment', 'agent_task'])('runs %s on the primary agent model without invented catalog tags', slot => {
    expect(catalog.some(row => row.capability_tags.includes(slot))).toBe(false);
    expect(resolveCapabilityModelSlot(slot)).toBe('primary');
    expect(tryResolveModelSlot({ slot, catalogRows: catalog, orgAiSettings: { selected_models: { __primary_model: 'tenant-main' } } })?.model).toBe('tenant-main');
  });
  it('retains the chosen agent override for operational skills', () => {
    const result = tryResolveModelSlot({ slot: 'record_creation', catalogRows: catalog,
      orgAiSettings: { selected_models: { __primary_model: 'tenant-main' } }, agentConfig: { agent_key: 'sales_leads', model_override: 'sales-model' } });
    expect(result?.model).toBe('sales-model'); expect(result?.source).toBe('agent_override');
  });
  it('excludes disabled and unrelated models rather than bypassing compatibility', () => {
    expect(modelSupportsSlot(catalog[2], 'record_creation')).toBe(false);
    expect(tryResolveModelSlot({ slot: 'record_creation', catalogRows: [{ ...catalog[0], is_active: false }, catalog[2]] })).toBeNull();
  });
  it('does not turn embeddings or output generation into primary-model operations', () => {
    expect(resolveCapabilityModelSlot('embedding')).toBe('embedding');
    expect(resolveCapabilityModelSlot('voice_output')).toBe('voice_output');
    expect(tryResolveModelSlot({ slot: 'embedding', catalogRows: catalog })).toBeNull();
  });
});
