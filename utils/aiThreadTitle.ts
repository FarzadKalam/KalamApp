const THREAD_TITLE_MAX_LENGTH = 58;

const normalizeThreadTitleText = (value: string) => String(value || '')
  .replace(/https?:\/\/\S+/gi, ' ')
  .replace(/data:[^,\s]+,[A-Za-z0-9+/=]+/gi, ' ')
  .replace(/[`*_#>()[\]{}]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const trimThreadTitle = (value: string) => {
  const normalized = normalizeThreadTitleText(value).replace(/[؟?!.،,;:؛]+$/g, '').trim();
  if (normalized.length <= THREAD_TITLE_MAX_LENGTH) return normalized;
  const clipped = normalized.slice(0, THREAD_TITLE_MAX_LENGTH + 1);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${(lastSpace > 24 ? clipped.slice(0, lastSpace) : clipped.slice(0, THREAD_TITLE_MAX_LENGTH)).trim()}...`;
};

export const buildSmartAiThreadTitle = (rawPrompt: string, fallback = 'گفتگوی هوش مصنوعی') => {
  const text = normalizeThreadTitleText(rawPrompt);
  if (!text) return fallback;
  const firstMeaningfulPart = text
    .split(/[\n\r.؟?!؛;]/)
    .map((part) => part.trim())
    .find((part) => part.length >= 3) || text;
  const withoutOpeningVerb = firstMeaningfulPart
    .replace(/^(لطفا|لطفاً|خواهشا|خواهشاً)\s+/i, '')
    .replace(/^(میخوام|می‌خوام|می خوام|میخواهم|می‌خواهم)\s+/i, '')
    .replace(/^(برای من|برام)\s+/i, '')
    .trim();
  return trimThreadTitle(withoutOpeningVerb || firstMeaningfulPart) || fallback;
};
