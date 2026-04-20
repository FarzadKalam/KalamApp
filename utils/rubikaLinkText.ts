const RUBIKA_WORD_JOINER = '\u2060';

// Rubika may auto-detect URL-like substrings inside an explicitly linked label.
// Break common URL separators with an invisible joiner so only our metadata link remains active.
export const escapeRubikaAutoLinkText = (value: string): string =>
  String(value || '').replace(/([./:@?#=&-])/g, `$1${RUBIKA_WORD_JOINER}`);
