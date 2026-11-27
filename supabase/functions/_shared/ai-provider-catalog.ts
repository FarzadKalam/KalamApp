export const AI_PROVIDERS = {
  avalai: { label: 'AvalAI', testModel: 'gpt-4o-mini' },
  openrouter: { label: 'OpenRouter', testModel: 'openrouter/free' },
  llm7: { label: 'LLM7.io', testModel: 'gpt-oss:20b' },
  cloudflare: { label: 'Cloudflare Workers AI', testModel: '@cf/openai/gpt-oss-20b' },
} as const;

export type AiProviderId = keyof typeof AI_PROVIDERS;
export const isAiProviderId = (value: unknown): value is AiProviderId =>
  typeof value === 'string' && Object.hasOwn(AI_PROVIDERS, value);

export const toAiCatalogModelId = (provider: AiProviderId, model: string) =>
  provider === 'avalai' ? model : `${provider}::${model}`;

export const getAiModelRoute = (id: string) => {
  const separator = id.indexOf('::');
  const provider = separator < 0 ? '' : id.slice(0, separator);
  return isAiProviderId(provider) && provider !== 'avalai'
    ? { provider, model: id.slice(separator + 2) }
    : { provider: 'avalai' as const, model: id };
};

export const ALTERNATE_AI_CAPABILITIES = [
  'dashboard_chat', 'record_chat', 'customer_reply_suggestion', 'customer_auto_reply',
  'workflow_ai_prompt', 'context_compression', 'deep_reasoning', 'auto_decision',
] as const;
