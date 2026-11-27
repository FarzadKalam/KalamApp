import type { AgentKey } from './ai-agent-catalog.ts';
import { NATIVE_AGENT_SKILLS, supportsNativeAgentSkill } from './ai-native-skills.ts';

export type ModelSlot =
  | 'primary'
  | 'agent_fast'
  | 'deep_reasoning'
  | 'context_compression'
  | 'embedding'
  | 'auto_decision'
  | string;

export type AiModelCatalogRow = {
  id: string;
  provider?: string | null;
  display_name_fa?: string | null;
  capability_tags?: string[] | null;
  input_usd_per_1m?: number | null;
  cached_input_usd_per_1m?: number | null;
  output_usd_per_1m?: number | null;
  margin_percent?: number | null;
  is_active?: boolean | null;
  is_coming_soon?: boolean | null;
  metadata?: Record<string, any> | null;
};

export const PRIMARY_MODEL_DEFAULT_KEY = '__primary_model';

// Operations are tools of the selected agent, not standalone model families.
// Keep entitlement/feature checks on their original operation capability.
export const isPrimaryAgentOperation = (capability: string): boolean =>
  ['record_creation', 'process_operation', 'pricing_adjustment', 'agent_task'].includes(capability);

export const resolveCapabilityModelSlot = (capability: ModelSlot): ModelSlot =>
  isPrimaryAgentOperation(capability) ? 'primary' : capability;

export const PRIMARY_MODEL_CAPABILITIES = new Set([
  'dashboard_chat',
  'record_chat',
  'customer_reply_suggestion',
  'document_analysis',
  'workflow_ai_prompt',
  'deep_reasoning',
  'legal_assistant',
  'web_search',
]);

export const CAPABILITY_SELECTION_ALIASES: Record<string, string[]> = {
  deep_reasoning: ['auto_decision'],
  auto_decision: ['deep_reasoning'],
  customer_reply_suggestion: ['customer_auto_reply'],
  customer_auto_reply: ['customer_reply_suggestion'],
  image_generation: ['image_edit'],
  image_edit: ['image_generation'],
  agent_fast: ['context_compression', 'dashboard_chat'],
  context_compression: ['agent_fast', 'dashboard_chat'],
};

const SLOT_ALIAS_MAP: Record<string, string[]> = {
  primary: ['dashboard_chat', 'record_chat', 'workflow_ai_prompt'],
  agent_fast: ['agent_fast', 'context_compression', 'dashboard_chat'],
  context_compression: ['context_compression', 'agent_fast', 'dashboard_chat'],
  deep_reasoning: ['deep_reasoning', 'auto_decision', 'dashboard_chat'],
  auto_decision: ['auto_decision', 'deep_reasoning', 'dashboard_chat'],
  embedding: ['embedding'],
};

const REASONING_METADATA_FLAGS = ['reasoning', 'supports_reasoning', 'is_reasoning'];

const GENERIC_REASONING_NAME_PATTERNS = [
  /^o\d/i,
  /\bo[34][-_]/i,
  /^gpt-[56](?:[.-]|$)/i,
  /deepseek-r\d/i,
  /\breasonin/i,
  /\bqwq\b/i,
  /kimi.thinking/i,
  /grok.*\breason/i,
];

export const isCatalogDefaultFor = (model: AiModelCatalogRow, tag: string): boolean =>
  Array.isArray(model?.metadata?.default_capability_tags)
  && model.metadata!.default_capability_tags.includes(tag);

export const isActiveSelectableModel = (model: AiModelCatalogRow): boolean =>
  Boolean(model?.id) && model?.is_active !== false && model?.is_coming_soon !== true;

export const modelSupportsSlot = (model: AiModelCatalogRow, slot: ModelSlot): boolean => {
  slot = resolveCapabilityModelSlot(slot);
  if (!isActiveSelectableModel(model)) return false;
  const tags = Array.isArray(model?.capability_tags) ? model.capability_tags.map((t) => String(t || '').trim()) : [];
  if (slot === 'embedding') {
    return tags.includes('embedding') || String(model?.metadata?.api_route || '').trim() === 'embeddings';
  }
  if (slot === 'primary') {
    return tags.some((tag) => PRIMARY_MODEL_CAPABILITIES.has(tag));
  }
  if (NATIVE_AGENT_SKILLS.has(slot) && model.metadata?.native_skills?.[slot] === false) return false;
  if (NATIVE_AGENT_SKILLS.has(slot) && supportsNativeAgentSkill(model, slot)) return true;
  const accepted = [
    slot,
    ...(CAPABILITY_SELECTION_ALIASES[slot] || []),
    ...(SLOT_ALIAS_MAP[slot] || []),
  ];
  const apiRoute = String(model?.metadata?.api_route || 'chat_completions').trim();
  if (slot !== 'image_generation' && slot !== 'image_edit' && slot !== 'video_generation' && slot !== 'voice_input' && slot !== 'voice_output') {
    if (apiRoute && apiRoute !== 'chat_completions') return false;
  }
  return tags.some((tag) => accepted.includes(tag));
};

export const pickPreferredCatalogModelForSlot = (
  catalogRows: AiModelCatalogRow[],
  slot: ModelSlot,
): AiModelCatalogRow | null => {
  slot = resolveCapabilityModelSlot(slot);
  const candidates = (catalogRows || []).filter((model) => modelSupportsSlot(model, slot));
  if (!candidates.length) return null;

  const exactDefault = candidates.find((model) => isCatalogDefaultFor(model, slot));
  if (exactDefault) return exactDefault;

  const exactTag = candidates.filter((model) => Array.isArray(model.capability_tags) && model.capability_tags.includes(slot));
  const pool = exactTag.length > 0 ? exactTag : candidates;

  const scored = pool.map((model) => {
    const tier = String(model?.metadata?.tier || '').toLowerCase();
    const inputCost = Number(model?.input_usd_per_1m ?? 0);
    const outputCost = Number(model?.output_usd_per_1m ?? 0);
    const totalCost = Number.isFinite(inputCost + outputCost) ? inputCost + outputCost : 10;
    let score = 0;

    if (slot === 'context_compression' || slot === 'agent_fast') {
      if (tier === 'economy' || tier === 'fast') score += 10;
      else if (tier === 'balanced') score += 4;
      score -= Math.min(8, totalCost * 1.5);
    } else if (slot === 'deep_reasoning' || slot === 'auto_decision') {
      if (model?.metadata?.reasoning === true || model?.metadata?.supports_reasoning === true) score += 8;
      if (tier === 'balanced' || tier === 'flagship') score += 6;
    } else if (slot === 'embedding') {
      score += 10 - Math.min(5, totalCost * 5);
    } else {
      if (tier === 'economy') score += 4;
      if (tier === 'balanced') score += 3;
      score -= Math.min(5, totalCost / 2);
    }
    return { model, score };
  });

  scored.sort((a, b) => b.score - a.score || String(a.model.id).localeCompare(String(b.model.id)));
  return scored[0]?.model || null;
};

export type ResolveModelSlotInput = {
  slot: ModelSlot;
  catalogRows: AiModelCatalogRow[];
  orgAiSettings?: Record<string, any> | null;
  saasDefaultModels?: Record<string, string | null> | null;
  agentConfig?: {
    agent_key?: AgentKey | string;
    model_override?: string | null;
    fast_model_override?: string | null;
  } | null;
  requestedOverride?: string | null;
  preferFastAgentModel?: boolean;
};

export type ResolvedModelResult = {
  model: string;
  provider: string;
  catalogRow: AiModelCatalogRow | null;
  source:
    | 'requested_override'
    | 'agent_override'
    | 'org_slot'
    | 'saas_agent_default'
    | 'saas_slot_default'
    | 'org_primary'
    | 'catalog_default'
    | 'catalog_scored';
};

export const tryResolveModelSlot = (input: ResolveModelSlotInput): ResolvedModelResult | null => {
  input = { ...input, slot: resolveCapabilityModelSlot(input.slot) };
  const catalogRows = (input.catalogRows || []).filter(isActiveSelectableModel);
  if (!catalogRows.length) return null;

  const byId = new Map<string, AiModelCatalogRow>();
  catalogRows.forEach((row) => {
    const id = String(row.id || '').trim();
    if (id) byId.set(id, row);
  });

  const acceptIfValid = (rawId: unknown): AiModelCatalogRow | null => {
    const id = String(rawId || '').trim();
    if (!id) return null;
    const row = byId.get(id);
    if (!row) return null;
    if (!modelSupportsSlot(row, input.slot)) return null;
    return row;
  };

  const selectedModels = input.orgAiSettings?.selected_models && typeof input.orgAiSettings.selected_models === 'object'
    ? input.orgAiSettings.selected_models
    : {};
  const saasDefaults = input.saasDefaultModels && typeof input.saasDefaultModels === 'object'
    ? input.saasDefaultModels
    : {};
  const agentKey = String(input.agentConfig?.agent_key || '').trim().toLowerCase();
  const isFastPath = Boolean(input.preferFastAgentModel || input.slot === 'agent_fast');

  // 1. Explicit request-level override
  const overrideRow = acceptIfValid(input.requestedOverride);
  if (overrideRow) {
    return {
      model: overrideRow.id,
      provider: String(overrideRow.provider || 'avalai'),
      catalogRow: overrideRow,
      source: 'requested_override',
    };
  }

  // 2. Per-agent org override (fast or main)
  if (input.agentConfig) {
    const agentOverrideId = isFastPath
      ? (input.agentConfig.fast_model_override || input.agentConfig.model_override)
      : input.agentConfig.model_override;
    const agentRow = acceptIfValid(agentOverrideId);
    if (agentRow) {
      return {
        model: agentRow.id,
        provider: String(agentRow.provider || 'avalai'),
        catalogRow: agentRow,
        source: 'agent_override',
      };
    }
  }

  // 3. Explicit org per-agent slot (`selected_models['agent:<key>']`) when running a specific agent
  if (agentKey && !isFastPath && input.slot !== 'embedding' && input.slot !== 'context_compression') {
    const orgPerAgentRow = acceptIfValid(selectedModels[`agent:${agentKey}`]);
    if (orgPerAgentRow) {
      return {
        model: orgPerAgentRow.id,
        provider: String(orgPerAgentRow.provider || 'avalai'),
        catalogRow: orgPerAgentRow,
        source: 'org_slot',
      };
    }
  }

  // 4. SaaS Admin central per-agent default (`saas_ai_default_models['agent:<key>']`)
  if (agentKey && !isFastPath && input.slot !== 'embedding' && input.slot !== 'context_compression') {
    const saasAgentRow = acceptIfValid(saasDefaults[`agent:${agentKey}`]);
    if (saasAgentRow) {
      return {
        model: saasAgentRow.id,
        provider: String(saasAgentRow.provider || 'avalai'),
        catalogRow: saasAgentRow,
        source: 'saas_agent_default',
      };
    }
  }

  // Native skills stay with the selected agent/primary model. An old dedicated
  // slot must not delegate vision/reasoning when that model can do it itself.
  // An explicit request-level override above still takes precedence.
  if (NATIVE_AGENT_SKILLS.has(input.slot)) {
    for (const [rawId, source] of [
      [selectedModels[PRIMARY_MODEL_DEFAULT_KEY], 'org_primary'],
      [saasDefaults[PRIMARY_MODEL_DEFAULT_KEY], 'saas_slot_default'],
    ] as const) {
      const primary = acceptIfValid(rawId);
      if (primary && supportsNativeAgentSkill(primary, input.slot)) {
        return { model: primary.id, provider: String(primary.provider || 'avalai'), catalogRow: primary, source };
      }
    }
  }

  // 5. Explicit org slot selection (e.g. context_compression, agent_fast, embedding, auto_decision)
  const slotAliases = input.slot === 'primary'
    ? [PRIMARY_MODEL_DEFAULT_KEY, 'dashboard_chat', 'record_chat']
    : [input.slot, ...(CAPABILITY_SELECTION_ALIASES[input.slot] || [])];
  for (const key of slotAliases) {
    const slotRow = acceptIfValid(selectedModels[key]);
    if (slotRow) {
      return {
        model: slotRow.id,
        provider: String(slotRow.provider || 'avalai'),
        catalogRow: slotRow,
        source: 'org_slot',
      };
    }
  }

  // 6. SaaS Admin central slot default (e.g. agent_fast relay, context_compression, workflow_ai_prompt)
  for (const key of slotAliases) {
    const saasSlotRow = acceptIfValid(saasDefaults[key]);
    if (saasSlotRow) {
      return {
        model: saasSlotRow.id,
        provider: String(saasSlotRow.provider || 'avalai'),
        catalogRow: saasSlotRow,
        source: 'saas_slot_default',
      };
    }
  }

  // 7. Org primary model ONLY if slot is compatible with primary model semantics (never hijack embedding / context_compression / agent_fast)
  if (input.slot !== 'embedding' && input.slot !== 'context_compression' && input.slot !== 'agent_fast') {
    const primaryRow = acceptIfValid(selectedModels[PRIMARY_MODEL_DEFAULT_KEY]);
    if (primaryRow) {
      return {
        model: primaryRow.id,
        provider: String(primaryRow.provider || 'avalai'),
        catalogRow: primaryRow,
        source: 'org_primary',
      };
    }
    const saasPrimaryRow = acceptIfValid(saasDefaults[PRIMARY_MODEL_DEFAULT_KEY]);
    if (saasPrimaryRow) {
      return {
        model: saasPrimaryRow.id,
        provider: String(saasPrimaryRow.provider || 'avalai'),
        catalogRow: saasPrimaryRow,
        source: 'saas_slot_default',
      };
    }
  }

  // 8 & 9. Catalog default / scored selection
  const preferredRow = pickPreferredCatalogModelForSlot(catalogRows, input.slot);
  if (preferredRow) {
    return {
      model: preferredRow.id,
      provider: String(preferredRow.provider || 'avalai'),
      catalogRow: preferredRow,
      source: isCatalogDefaultFor(preferredRow, input.slot) ? 'catalog_default' : 'catalog_scored',
    };
  }

  return null;
};

export const resolveModelSlot = (input: ResolveModelSlotInput): ResolvedModelResult => {
  const resolved = tryResolveModelSlot(input);
  if (resolved) return resolved;
  if (input.slot === 'embedding') {
    throw new Error('مدل فعال بردارسازی (Embedding) در کاتالوگ مدل‌های هوش مصنوعی فعال نیست.');
  }
  if (input.slot === 'context_compression') {
    throw new Error('مدل فشرده‌سازی زمینه (Context Compression) در کاتالوگ مدل‌ها فعال نیست.');
  }
  throw new Error('برای این قابلیت هوش مصنوعی، مدل فعال و قابل استفاده در تنظیمات سازمان پیدا نشد.');
};

export const isModelReasoning = (modelId: string, modelCatalog?: AiModelCatalogRow | null): boolean => {
  const meta = modelCatalog?.metadata && typeof modelCatalog.metadata === 'object' ? modelCatalog.metadata : {};
  for (const flag of REASONING_METADATA_FLAGS) {
    if (typeof meta[flag] === 'boolean') return meta[flag] === true;
  }
  return GENERIC_REASONING_NAME_PATTERNS.some((pattern) => pattern.test(String(modelId || '').trim()));
};

export const orderAiRequestTools = <T extends { type?: string; function?: { name?: string } }>(tools?: T[]): T[] => {
  const key = (tool: T) => tool.function?.name || tool.type || Object.keys(tool).sort().join(':');
  return [...(tools || [])].sort((left, right) => {
    const a = key(left);
    const b = key(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
};

/** AvalAI supports provider-side reuse. The routing key is an optional
 * hint for supported endpoints, separate from caching and pricing. */
export const buildAvalaiPromptCacheKey = async (params: {
  orgId?: string | null;
  workload?: string | null;
  stableSystemPrefix?: string | null;
  modelCatalog?: AiModelCatalogRow | null;
  modelId?: string | null;
  route?: 'chat' | 'responses' | 'messages';
  tools?: readonly unknown[];
  responseFormat?: unknown;
}): Promise<string | undefined> => {
  const model = String(params.modelId || params.modelCatalog?.id || '').trim().toLowerCase();
  const orgId = String(params.orgId || '').trim();
  const prefix = params.stableSystemPrefix;
  if (!orgId || !model || !prefix || params.route === 'messages') return;
  const meta = params.modelCatalog?.metadata;
  if (meta?.supports_prompt_caching === false || meta?.supports_prompt_cache_key === false) return;
  const openAiCompatibleKey = meta?.supports_prompt_cache_key === true
    || /^gpt-\d/.test(model)
    || /^o[1-9](?:$|-)/.test(model);
  if (!openAiCompatibleKey || !globalThis.crypto?.subtle) return;

  const identity = JSON.stringify([orgId, params.workload || '', model, params.route || 'chat',
    prefix, params.tools || [], params.responseFormat || null]);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
  const key = Array.from(new Uint8Array(hash).slice(0, 20), byte => byte.toString(16).padStart(2, '0')).join('');
  return `kalam_${key}`;
};

export const isAvalaiCacheKeyRejection = (errorText: string): boolean =>
  /prompt_cache_key|unsupported.*cache/i.test(errorText);

export const fetchAvalaiChatWithCacheKey = async (
  url: string,
  init: RequestInit,
  payload: Record<string, unknown>,
  cacheKey?: string,
): Promise<Response> => {
  const send = (body: Record<string, unknown>) => fetch(url, { ...init, body: JSON.stringify(body) });
  if (!cacheKey) return send(payload);
  const response = await send({ ...payload, prompt_cache_key: cacheKey });
  return response.status === 400 && isAvalaiCacheKeyRejection(await response.clone().text())
    ? send(payload)
    : response;
};

export const extractCachedInputTokens = (usageMetadata: any): number => {
  const usage = usageMetadata?.usage && typeof usageMetadata.usage === 'object' ? usageMetadata.usage : {};
  const promptDetails = usage?.prompt_tokens_details && typeof usage.prompt_tokens_details === 'object'
    ? usage.prompt_tokens_details
    : {};
  const inputDetails = usage?.input_tokens_details && typeof usage.input_tokens_details === 'object'
    ? usage.input_tokens_details
    : {};

  const candidates = [
    usage.cached_tokens,
    usage.cached_input_tokens,
    usage.cache_read_input_tokens,
    promptDetails.cached_tokens,
    inputDetails.cached_tokens,
  ];
  for (const candidate of candidates) {
    const num = Number(candidate);
    if (Number.isFinite(num) && num > 0) return Math.floor(num);
  }
  return 0;
};

export const calculateCacheSavingsIrt = (params: {
  cachedTokens: number;
  modelCatalog?: AiModelCatalogRow | null;
  exchangeRateIrt: number;
  marginPercent: number;
}): number => {
  const cachedTokens = Math.max(0, Math.floor(Number(params.cachedTokens || 0)));
  if (!cachedTokens) return 0;

  const inputUsdPer1m = Number(params.modelCatalog?.input_usd_per_1m ?? 0);
  const cachedUsdPer1m = params.modelCatalog?.cached_input_usd_per_1m;
  if (!Number.isFinite(inputUsdPer1m) || inputUsdPer1m <= 0) return 0;
  if (cachedUsdPer1m === null || cachedUsdPer1m === undefined) return 0;

  const parsedCachedRate = Number(cachedUsdPer1m);
  if (!Number.isFinite(parsedCachedRate) || parsedCachedRate < 0 || parsedCachedRate >= inputUsdPer1m) return 0;

  const usdSaved = (cachedTokens * (inputUsdPer1m - parsedCachedRate)) / 1_000_000;
  const irtRawSaved = usdSaved * Math.max(0, Number(params.exchangeRateIrt || 0));
  const withMargin = irtRawSaved * (1 + Math.max(0, Number(params.marginPercent || 0)) / 100);
  return Math.max(0, Math.round(withMargin));
};
