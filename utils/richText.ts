import DOMPurify from 'dompurify';
import { richTextMarkupToPlainText } from '../shared/recordRuntime';

const RICH_TEXT_TAG_PATTERN = /<\/?(?:p|h[2-4]|strong|b|em|i|u|ul|ol|li|span|br|a)\b/i;

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const normalizeStyles = (fragment: DocumentFragment, preserveAlignment: boolean) => {
  for (const element of fragment.querySelectorAll('[style]')) {
    const retained = (element.getAttribute('style') || '').split(';').map((part) => part.trim()).filter((part) => {
      const separator = part.indexOf(':');
      if (separator < 0) return false;
      const property = part.slice(0, separator).trim().toLowerCase();
      const value = part.slice(separator + 1).trim();
      if (property === 'text-align') {
        return preserveAlignment && /^(?:p|h[2-4])$/i.test(element.tagName) && /^(right|center|left)$/i.test(value);
      }
      return property === 'color' && /^(?:#[\da-f]{3,8}|rgb\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\))$/i.test(value);
    });
    if (retained.length) element.setAttribute('style', retained.join('; '));
    else element.removeAttribute('style');
  }
};

/** محتوای قدیمیِ ساده را بدون از دست‌دادن خط‌های جدید به HTML امن تبدیل می‌کند. */
export const normalizeRichTextHtml = (value: unknown, preserveAlignment = true): string => {
  const source = String(value ?? '');
  if (!source.trim()) return '';
  const html = RICH_TEXT_TAG_PATTERN.test(source)
    ? source
    : escapeHtml(source).replace(/\r?\n/g, '<br>');

  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'span', 'br', 'a'],
    ALLOWED_ATTR: ['style', 'href'],
    ALLOW_DATA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });
  normalizeStyles(sanitized, preserveAlignment);
  const template = sanitized.ownerDocument.createElement('template');
  template.content.append(sanitized);
  return template.innerHTML;
};

/**
 * خروجی امن متن غنی برای چاپ. متن به‌صورت پیش‌فرض از تایپوگرافی محل درج
 * ارث می‌برد؛ تنها تأکیدها و رنگ‌هایی که کاربر انتخاب کرده حفظ می‌شوند.
 */
export const normalizeRichTextHtmlForPrint = (value: unknown): string => {
  const html = normalizeRichTextHtml(value, false);
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
