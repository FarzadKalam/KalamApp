import { describe, expect, it } from 'vitest';
import { canUseOrganizationKnowledge, isAiCapabilityPlanAvailable } from './ai-plan-capabilities';

describe('AI feature licensing', () => {
  it('never restores an explicitly disabled capability through the knowledge bundle', () => {
    const ctx = { available: true, features: { ai_chat: false, ai_document_analysis: false, ai_knowledge: true } };
    expect(isAiCapabilityPlanAvailable(ctx, 'dashboard_chat')).toBe(false);
    expect(isAiCapabilityPlanAvailable(ctx, 'document_analysis')).toBe(false);
    expect(canUseOrganizationKnowledge(ctx)).toBe(true);
  });
  it('separates organization knowledge from analysis of an attachment', () => {
    const ctx = { available: true, features: { ai_document_analysis: true, ai_knowledge: false, ai_knowledge_limited: false } };
    expect(isAiCapabilityPlanAvailable(ctx, 'document_analysis')).toBe(true);
    expect(isAiCapabilityPlanAvailable(ctx, 'embedding')).toBe(false);
    expect(canUseOrganizationKnowledge(ctx)).toBe(false);
    expect(canUseOrganizationKnowledge({ ...ctx, features: { ai_knowledge_limited: true } })).toBe(true);
  });
  it('retains old bundle compatibility only for unspecified features', () => {
    expect(isAiCapabilityPlanAvailable({ available: true, features: { ai_knowledge: true } }, 'dashboard_chat')).toBe(true);
    expect(isAiCapabilityPlanAvailable({ available: false, features: { ai_knowledge: true } }, 'dashboard_chat')).toBe(false);
    expect(isAiCapabilityPlanAvailable({ available: true, features: { ai_knowledge: true } }, 'unknown_capability')).toBe(false);
  });
});
