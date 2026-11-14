/** Catalog-driven native skills. No model-name heuristics or org data here. */
type Model = { capability_tags?: string[] | null; metadata?: Record<string, any> | null };
export const NATIVE_AGENT_SKILLS = new Set([
  'document_analysis', 'deep_reasoning', 'legal_assistant', 'customer_reply_suggestion', 'web_search',
]);

export const supportsNativeAgentSkill = (model: Model, skill: string): boolean => {
  const metadata = model.metadata || {};
  const declared = metadata.native_skills;
  if (declared && !Array.isArray(declared) && typeof declared === 'object' && typeof declared[skill] === 'boolean') {
    return declared[skill];
  }
  if (Array.isArray(declared) && declared.includes(skill)) return true;
  const tags = model.capability_tags || [];
  if (tags.includes(skill)) return true;
  if (skill === 'document_analysis') {
    const modalities = metadata.input_modalities || metadata.modalities?.input || [];
    return metadata.supports_vision === true || metadata.supports_image_input === true
      || (Array.isArray(modalities) && modalities.includes('image'));
  }
  if (skill === 'deep_reasoning') return metadata.supports_reasoning === true || metadata.reasoning === true;
  if (skill === 'web_search') return metadata.supports_web_search === true;
  if (skill === 'legal_assistant' || skill === 'customer_reply_suggestion') return tags.some(tag => ['dashboard_chat','record_chat','workflow_ai_prompt'].includes(tag));
  return false;
};

// A permission, quota, timeout or data-tool failure must never silently switch
// models. Delegation is reserved for an actual unsupported input modality.
export const isUnsupportedNativeInputError = (error: unknown): boolean => {
  const message = String((error as any)?.message || error || '').toLowerCase();
  return /(?:image|vision|file|document|input modality|content.?type).{0,90}(?:not supported|unsupported|does not support)|(?:not supported|unsupported|does not support).{0,90}(?:image|vision|file|document|input modality)|unsupported_(?:image|file|input)/i.test(message);
};
