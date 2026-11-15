import { describe, expect, it, vi } from 'vitest';
import { isUnsupportedNativeInputError, supportsNativeAgentSkill, runNativeAgentInput } from './ai-native-skills';
describe('native agent skill compatibility', () => {
  it('keeps supported input on the selected model and falls back only for a rejected native modality', async () => {
    const fallback = vi.fn(async () => 'fallback');
    expect(await runNativeAgentInput({ hasNativeInput: true, primary: async () => 'primary', fallback })).toBe('primary');
    expect(fallback).not.toHaveBeenCalled();
    await expect(runNativeAgentInput({ hasNativeInput: true, primary: async () => { throw new Error('network timeout'); }, fallback })).rejects.toThrow('timeout');
    expect(fallback).not.toHaveBeenCalled();
    expect(await runNativeAgentInput({ hasNativeInput: true, primary: async () => { throw new Error('Unsupported image input'); }, fallback })).toBe('fallback');
    expect(fallback).toHaveBeenCalledOnce();
  });
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
