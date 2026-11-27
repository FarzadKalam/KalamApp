import { AI_PROVIDERS, getAiModelRoute, toAiCatalogModelId, type AiProviderId } from './ai-provider-catalog.ts';
import { resolveCentralAiApiKey } from './ai-provider-keys.ts';

export const DEFAULT_AVALAI_BASE_URL = 'https://api.avalai.ir/v1';
export const DEFAULT_AVALAI_FALLBACK_BASE_URL = 'https://api.avalapis.ir/v1';
type ReadEnv = (key: string) => string | undefined;
const readRuntimeEnv: ReadEnv = (key) => (globalThis as any).Deno?.env?.get(key);

export const normalizeAiBaseUrl = (value: string) => {
  const raw = value.trim().replace(/\/+$/, '');
  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(normalized);
  if (/(^|\.)(avalai|avalapis)\.ir$/i.test(url.hostname) && !/\/v\d+$/i.test(url.pathname)) {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/v1`;
  }
  return url.toString().replace(/\/+$/, '');
};

export const readAiProviderConfig = (provider: AiProviderId, env: ReadEnv = readRuntimeEnv) => {
  const accountId = String(env('CLOUDFLARE_AI_ACCOUNT_ID') || '').trim();
  const cloudflareBase = /^[a-f\d]{32}$/i.test(accountId)
    ? `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai`
    : '';
  const baseUrl = {
    avalai: env('AI_BASE_URL') || env('AVALAI_BASE_URL') || DEFAULT_AVALAI_BASE_URL,
    openrouter: 'https://openrouter.ai/api/v1',
    llm7: 'https://api.llm7.io/v1',
    cloudflare: cloudflareBase ? `${cloudflareBase}/v1` : '',
  }[provider];
  const apiKey = {
    avalai: env('AI_API_KEY') || env('AVALAI_API_KEY') || env('OPENAI_API_KEY'),
    openrouter: env('OPENROUTER_API_KEY'),
    llm7: env('LLM7_API_KEY'),
    cloudflare: env('CLOUDFLARE_AI_API_TOKEN'),
  }[provider];
  const fallback = provider === 'avalai'
    ? env('AI_FALLBACK_BASE_URLS') || env('AVALAI_FALLBACK_BASE_URLS') || env('AVALAI_FALLBACK_BASE_URL') || DEFAULT_AVALAI_FALLBACK_BASE_URL
    : '';
  return {
    provider,
    baseUrl: baseUrl ? normalizeAiBaseUrl(baseUrl) : '',
    fallbackBaseUrls: fallback.split(',').map(url => url.trim()).filter(Boolean).map(normalizeAiBaseUrl),
    apiKey: String(apiKey || '').trim(),
    model: provider === 'avalai' ? String(env('AI_MODEL') || env('AVALAI_MODEL') || '').trim() : '',
    serviceTier: provider === 'avalai' ? String(env('AVALAI_SERVICE_TIER') || env('AI_SERVICE_TIER') || 'default').trim() : '',
    modelsUrl: provider === 'cloudflare' && cloudflareBase ? `${cloudflareBase}/models/search?per_page=50&task=Text%20Generation` : '',
  };
};

export const resolveAiProviderConnection = async (
  provider: AiProviderId, supabaseUrl?: string | null, serviceRoleKey?: string | null,
) => {
  const config = readAiProviderConfig(provider);
  const key = await resolveCentralAiApiKey({ provider, supabaseUrl, serviceRoleKey, envFallbackKey: config.apiKey });
  return { ...config, apiKey: key.apiKey, apiKeySource: key.source, apiKeyId: key.keyId };
};

export const resolveAiModelConnection = async (id: string, supabaseUrl: string, serviceRoleKey: string) => {
  const { provider, model } = getAiModelRoute(id);
  const connection = await resolveAiProviderConnection(provider, supabaseUrl, serviceRoleKey);
  if (!connection.baseUrl) throw new Error(`شناسه حساب ${AI_PROVIDERS[provider].label} روی سرور تنظیم نشده است.`);
  return { ...connection, upstreamModel: model };
};

export const prepareAlternateChatRequest = (catalogId: string, body: Record<string, any>) => {
  const { provider, model } = getAiModelRoute(catalogId);
  if (provider === 'avalai') return body;
  const request: Record<string, any> = { ...body, model };
  for (const field of ['service_tier', 'prompt_cache_key', 'safety_identifier']) delete request[field];
  if (provider === 'cloudflare' || provider === 'llm7') {
    request.max_tokens = request.max_completion_tokens ?? request.max_tokens;
    delete request.max_completion_tokens;
    if (provider === 'cloudflare') delete request.stream_options;
  }
  return request;
};

export const isProviderModelId = (id: string) => /^[@a-z0-9][-a-z0-9_@./:+]{0,199}$/i.test(id) && !id.includes('::');

const catalogNumber = (value: unknown) => {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export const parseAlternateProviderModels = (provider: Exclude<AiProviderId, 'avalai'>, rows: unknown) => {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap(item => {
    const model = String(provider === 'cloudflare' ? item?.name || '' : item?.id || '').trim();
    if (!isProviderModelId(model)) return [];
    if (provider === 'cloudflare' && !model.startsWith('@cf/')) return [];
    if (provider === 'llm7' && (item.model_type !== 'chat' || item.stream === false)) return [];
    if (provider === 'openrouter' && (
      !item.architecture?.input_modalities?.includes('text') || !item.architecture?.output_modalities?.includes('text') ||
      (Array.isArray(item.endpoints) && !item.endpoints.includes('/api/v1/chat/completions'))
    )) return [];

    const parameterNames = Array.isArray(item.supported_parameters) ? item.supported_parameters : [];
    const tools = parameterNames.includes('tools') || item.capabilities?.tools === true || item.tools_calling === true;
    const reasoning = parameterNames.includes('reasoning') || item.reasoning === true;
    const tags = ['dashboard_chat', 'record_chat', 'customer_reply_suggestion', 'workflow_ai_prompt', 'context_compression', 'customer_auto_reply'];
    if (reasoning) tags.push('deep_reasoning', 'auto_decision');
    const price = (openRouterField: string, llm7Field: string) => {
      if (provider === 'openrouter') {
        const perToken = catalogNumber(item.pricing?.[openRouterField]);
        return perToken === null ? null : perToken * 1_000_000;
      }
      return provider === 'llm7' && item.pricing?.currency === 'USD' && item.pricing?.unit === '1M tokens'
        ? catalogNumber(item.pricing[llm7Field]) : null;
    };
    return [{
      id: toAiCatalogModelId(provider, model),
      upstream_id: model,
      provider,
      label: String(provider === 'cloudflare' ? model : item.name || model),
      suggested_capability_tags: tags,
      provider_capability_hints: [...(tools ? ['tools'] : []), ...(reasoning ? ['reasoning'] : [])],
      context_window: catalogNumber(item.context_length ?? item.context_window?.tokens ?? item.context_window),
      max_output_tokens: catalogNumber(item.top_provider?.max_completion_tokens ?? item.max_output_tokens),
      input_usd_per_1m: price('prompt', 'input'),
      output_usd_per_1m: price('completion', 'output'),
    }];
  });
};
