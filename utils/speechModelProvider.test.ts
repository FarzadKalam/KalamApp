import { describe, expect, it } from 'vitest';
import { GEMINI_PREBUILT_VOICES, resolveSpeechModelProvider } from '../supabase/functions/_shared/speech-model-provider';

describe('speech model family behind a gateway', () => {
  it.each(['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview'])(
    'keeps Gemini voices and synthesis routing for %s through AvalAI', model => {
      expect(resolveSpeechModelProvider({ provider: 'avalai', modelProvider: 'avalai', model })).toBe('gemini');
    },
  );
  it('retains explicit providers for other models and never classifies Gemini chat as TTS', () => {
    expect(resolveSpeechModelProvider({ provider: 'avalai', modelProvider: 'elevenlabs', model: 'eleven_multilingual_v2' })).toBe('elevenlabs');
    expect(resolveSpeechModelProvider({ provider: 'avalai', model: 'gemini-3.8-flash' })).toBe('avalai');
    expect(resolveSpeechModelProvider({ provider: 'openai', model: 'gpt-4o-mini-tts' })).toBe('openai');
  });
  it('offers the proposed tutorial voices without mapping them to a different provider voice', () => {
    expect(GEMINI_PREBUILT_VOICES).toEqual(expect.arrayContaining(['Charon', 'Kore', 'Sulafat']));
    expect(new Set(GEMINI_PREBUILT_VOICES).size).toBe(GEMINI_PREBUILT_VOICES.length);
  });
});
