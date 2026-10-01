import DOMPurify from 'dompurify';
import { richTextMarkupToPlainText } from '../shared/recordRuntime';

const RICH_TEXT_TAG_PATTERN = /<\/?(?:p|h[2-4]|strong|b|em|i|u|ul|ol|li|span|br)\b/i;

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// Rich-text values are frequently pasted from office tools or copied from
// another record. Those sources carry layout rules (font family/size,
// direction, paragraph spacing, …) which must not override the place where a
// value is shown. Keep semantic marks such as <strong>/<em>/<u> and colours
// selected in the editor, but make typography and layout inherit from the
// surrounding screen or print template.
const INHERITED_RICH_TEXT_STYLE_PROPERTIES = new Set([
  'font',
  'font-family',
  'font-size',
  'line-height',
  'direction',
  'text-align',
  'letter-spacing',
  'word-spacing',
  'white-space',
  'text-indent',
]);

const removeInheritedRichTextStyles = (html: string): string => html.replace(
  /\sstyle=(['"])([\s\S]*?)\1/gi,
  (attribute, quote: string, styleText: string) => {
    const retained = String(styleText || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => {
        const property = part.slice(0, part.indexOf(':')).trim().toLowerCase();
        return property && !INHERITED_RICH_TEXT_STYLE_PROPERTIES.has(property);
      });
    return retained.length ? ` style=${quote}${retained.join('; ')}${quote}` : '';
  },
);

/** محتوای قدیمیِ ساده را بدون از دست‌دادن خط‌های جدید به HTML امن تبدیل می‌کند. */
export const normalizeRichTextHtml = (value: unknown): string => {
  const source = String(value ?? '');
  if (!source.trim()) return '';
  const html = RICH_TEXT_TAG_PATTERN.test(source)
    ? source
    : escapeHtml(source).replace(/\r?\n/g, '<br>');

  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'span', 'br'],
    ALLOWED_ATTR: ['style'],
  });
  return removeInheritedRichTextStyles(sanitized);
};

/**
 * خروجی امن متن غنی برای چاپ. متن به‌صورت پیش‌فرض از تایپوگرافی محل درج
 * ارث می‌برد؛ تنها تأکیدها و رنگ‌هایی که کاربر انتخاب کرده حفظ می‌شوند.
 */
export const normalizeRichTextHtmlForPrint = (value: unknown): string => {
  const html = normalizeRichTextHtml(value);
  return html
    ? `<div class="rich-text-print" style="font-family:inherit; font-size:inherit; line-height:inherit; direction:inherit; text-align:inherit;">${html}</div>`
    : '';
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
