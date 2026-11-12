// Catalog voice_options remains authoritative. These fallbacks cover catalogs
// that identify a transport gateway (such as AvalAI) instead of the model family.
export const GEMINI_PREBUILT_VOICES = [
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede',
  'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba',
  'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar',
  'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
  'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
] as const;

export function resolveSpeechModelProvider(config: {
  modelProvider?: unknown;
  provider?: unknown;
  model?: unknown;
} | null | undefined): string {
  const model = String(config?.model || '').trim().toLowerCase();
  if (/^gemini[\w.-]*-tts(?:-preview)?$/.test(model)) return 'gemini';
  return String(config?.modelProvider || config?.provider || '').trim().toLowerCase();
}
