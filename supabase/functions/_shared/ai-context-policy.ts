import type { AiModelCatalogRow } from './ai-gateway.ts';
export const DEFAULT_CONTEXT_WINDOW_TOKENS = 64_000;
export const AUTO_COMPACTION_THRESHOLD_RATIO = 0.7;
export const getModelContextWindowTokens = (modelCatalog?: AiModelCatalogRow | null): number => {
  const value=Number(modelCatalog?.metadata?.context_window ?? modelCatalog?.metadata?.max_context_tokens ?? 0);
  return Number.isFinite(value) && value>=4096 ? value : DEFAULT_CONTEXT_WINDOW_TOKENS;
};
