import DOMPurify from 'dompurify';
import { richTextMarkupToPlainText } from '../shared/recordRuntime';

const RICH_TEXT_TAG_PATTERN = /<\/?(?:p|h[2-4]|strong|b|em|i|u|ul|ol|li|span|br)\b/i;

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/** محتوای قدیمیِ ساده را بدون از دست‌دادن خط‌های جدید به HTML امن تبدیل می‌کند. */
export const normalizeRichTextHtml = (value: unknown): string => {
  const source = String(value ?? '');
  if (!source.trim()) return '';
  const html = RICH_TEXT_TAG_PATTERN.test(source)
    ? source
    : escapeHtml(source).replace(/\r?\n/g, '<br>');

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'span', 'br'],
    ALLOWED_ATTR: ['style'],
  });
};

export const richTextToPlainText = (value: unknown): string => {
  const html = normalizeRichTextHtml(value);
  if (!html) return '';
  return richTextMarkupToPlainText(html);
};

/** متن آماده را به‌صورت یک بخش جدا همراه با خط خالیِ آماده برای درج بعدی اضافه می‌کند. */
export const appendReadyTextToRichText = (currentValue: unknown, readyTextValue: unknown): string => {
  const current = normalizeRichTextHtml(currentValue).trim();
  const readyText = normalizeRichTextHtml(readyTextValue).trim();
  if (!readyText) return current;

  const trailingParagraph = '<p><br></p>';
  const hasTrailingParagraph = /<p>\s*<br\s*\/?\s*>\s*<\/p>\s*$/i.test(current);
  const separator = current && !hasTrailingParagraph ? trailingParagraph : '';
  return `${current}${separator}${readyText}${trailingParagraph}`;
};

/** True only when rich text has visible text; empty editor markup is not content. */
export const hasMeaningfulRichTextContent = (value: unknown): boolean =>
  richTextToPlainText(value)
    .replace(/\u200c/g, '')
    .replace(/\u00a0/g, ' ')
    .trim().length > 0;
