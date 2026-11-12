export const AI_CAPABILITY_FEATURE_KEYS: Record<string, string> = {
  dashboard_chat: 'ai_chat',
  record_chat: 'ai_chat',
  customer_reply_suggestion: 'ai_chat',
  document_analysis: 'ai_document_analysis',
  workflow_ai_prompt: 'ai_chat',
  deep_reasoning: 'ai_deep_reasoning',
  legal_assistant: 'ai_legal_assistant',
  web_search: 'ai_web_search',
  embedding: 'ai_knowledge',
  voice_input: 'ai_voice_input',
  image_generation: 'ai_image_generation',
  image_edit: 'ai_image_generation',
  voice_output: 'ai_voice_output',
  video_generation: 'ai_video_generation',
  document_generation: 'ai_document_analysis',
  record_creation: 'ai_chat',
  process_operation: 'ai_chat',
  pricing_adjustment: 'ai_chat',
  agent_fast: 'ai_chat',
  context_compression: 'ai_chat',
  voip_auto_reply: 'ai_voip_auto_reply',
  auto_decision: 'ai_deep_reasoning',
  customer_auto_reply: 'ai_chat',
};


const enabled = (value: any): boolean => value === true ||
  (typeof value === 'string' && ['true','1','yes','on','enabled','full','limited'].includes(value.trim().toLowerCase())) ||
  Boolean(value && typeof value === 'object' && (value.enabled === true || value.available === true));

export const canUseOrganizationKnowledge = (context: any): boolean => Boolean(context?.available && (
  enabled(context.features?.ai_knowledge) || enabled(context.features?.ai_knowledge_limited)
));

export const isAiCapabilityPlanAvailable = (context: any, capability: string): boolean => {
  if (!context?.available) return false;
  const key = AI_CAPABILITY_FEATURE_KEYS[capability];
  if (!key) return false;
  if (capability === 'embedding') return canUseOrganizationKnowledge(context);
  const features = context.features || {};
  // An explicit off must win over legacy bundle fallback.
  if (Object.prototype.hasOwnProperty.call(features, key)) return enabled(features[key]);
  const legacyKnowledgeBundle = ['dashboard_chat','record_chat','workflow_ai_prompt','customer_reply_suggestion','pricing_adjustment','agent_fast','context_compression','document_analysis'];
  return legacyKnowledgeBundle.includes(capability) && enabled(features.ai_knowledge);
};
