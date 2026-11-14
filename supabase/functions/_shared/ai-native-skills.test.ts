import { describe, expect, it } from 'vitest';
import { isUnsupportedNativeInputError, supportsNativeAgentSkill } from './ai-native-skills';
describe('native agent skill compatibility', () => {
  it('uses the model catalog declarations rather than model-name guesses', () => {
    expect(supportsNativeAgentSkill({ capability_tags: ['document_analysis'] }, 'document_analysis')).toBe(true);
    expect(supportsNativeAgentSkill({ metadata: { input_modalities: ['text','image'] } }, 'document_analysis')).toBe(true);
    expect(supportsNativeAgentSkill({ capability_tags: ['document_analysis'], metadata: { native_skills: { document_analysis: false } } }, 'document_analysis')).toBe(false);
  });
  it.each(['HTTP 429 quota exceeded', 'network timeout', 'permission denied', 'data query failed'])('does not delegate after unrelated failure: %s', message => {
    expect(isUnsupportedNativeInputError(new Error(message))).toBe(false);
  });
  it('delegates only an unsupported input modality', () => {
    expect(isUnsupportedNativeInputError(new Error('This model does not support image input'))).toBe(true);
    expect(isUnsupportedNativeInputError(new Error('Unsupported file content type'))).toBe(true);
  });
});
