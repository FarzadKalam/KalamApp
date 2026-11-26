import type { AiModelCatalogRow } from './ai-gateway.ts';
export const DEFAULT_CONTEXT_WINDOW_TOKENS = 64_000;
export const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;
export const AUTO_COMPACTION_THRESHOLD_RATIO = 0.7;

const FAMILY_LIMIT_HINTS: Array<{ pattern: RegExp; contextWindow: number; maxOutputTokens: number }> = [
  { pattern: /^claude-(?:opus|sonnet|haiku)-?(?:4|5)/i, contextWindow: 200_000, maxOutputTokens: 32_768 },
  { pattern: /^claude-/i, contextWindow: 200_000, maxOutputTokens: 16_384 },
  { pattern: /^(?:gpt-6|gpt-5|o3|o4)/i, contextWindow: 200_000, maxOutputTokens: 32_768 },
  { pattern: /^gpt-4o/i, contextWindow: 128_000, maxOutputTokens: 16_384 },
  { pattern: /^gemini-(?:2\.5|3|4)/i, contextWindow: 200_000, maxOutputTokens: 32_768 },
  { pattern: /^gemini-/i, contextWindow: 128_000, maxOutputTokens: 16_384 },
  { pattern: /^(?:deepseek|qwen3|glm-5|nemotron)/i, contextWindow: 128_000, maxOutputTokens: 16_384 },
];

export const inferModelFamilyLimits = (modelId?: unknown): { contextWindow: number; maxOutputTokens: number } | null => {
  const id = String(modelId || '').trim();
  if (!id) return null;
  for (const hint of FAMILY_LIMIT_HINTS) {
    if (hint.pattern.test(id)) return { contextWindow: hint.contextWindow, maxOutputTokens: hint.maxOutputTokens };
  }
  return null;
};

export const getModelContextWindowTokens = (modelCatalog?: AiModelCatalogRow | null): number => {
  const meta = modelCatalog?.metadata || {};
  const value = Number(
    meta.context_window
    ?? meta.max_context_tokens
    ?? meta.max_input_tokens
    ?? meta.context_length
    ?? 0,
  );
  if (Number.isFinite(value) && value >= 4096) return Math.floor(value);
  const inferred = inferModelFamilyLimits(modelCatalog?.id);
  return inferred ? inferred.contextWindow : DEFAULT_CONTEXT_WINDOW_TOKENS;
};

export const getModelMaxOutputTokens = (modelCatalog?: AiModelCatalogRow | null, fallbackModelId?: string | null): number => {
  const meta = modelCatalog?.metadata || {};
  const value = Number(
    meta.max_output_tokens
    ?? meta.max_completion_tokens
    ?? meta.output_token_limit
    ?? 0,
  );
  if (Number.isFinite(value) && value >= 1024) return Math.floor(value);
  const inferred = inferModelFamilyLimits(modelCatalog?.id || fallbackModelId);
  return inferred ? inferred.maxOutputTokens : DEFAULT_MAX_OUTPUT_TOKENS;
};

export const parseProviderContextLimitFromError = (message: unknown): number | null => {
  const text = String(message || '');
  const patterns = [
    /maximum context length is\s+(\d+)\s+tokens/i,
    /prompt is too long:\s*\d+\s*tokens\s*>\s*(\d+)\s*maximum/i,
    /context(?:_|\s)?(?:window|length|limit).*?(\d{4,7})/i,
    /exceeds?\s+(?:the\s+)?maximum\s+(?:of\s+)?(\d{4,7})\s+tokens/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const num = Number(match?.[1] || 0);
    if (Number.isFinite(num) && num >= 4096) return Math.floor(num);
  }
  return null;
};
