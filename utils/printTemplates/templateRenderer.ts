import DOMPurify from 'dompurify';
import { sanitizeOutboundDisplay } from '../../shared/recordRuntime';

const PRINT_TEMPLATE_ALLOWED_ATTRIBUTES = [
  'style', 'src', 'alt', 'width', 'height', 'span', 'colspan', 'rowspan', 'colwidth', 'data-colwidth',
  'data-background-color', 'data-border-color', 'data-print-block', 'data-print-optional-field',
  'data-print-variable-image',
];

const IMAGE_VARIABLE_PATHS = new Set(['company.logo_url']);

const escapeHtmlAttribute = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const isSafePrintImageUrl = (value: string) => {
  const url = String(value || '').trim();
  if (!url) return false;
  if (/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);/i.test(url)) return true;
  if (url.startsWith('/')) return true;
  try {
    const protocol = new URL(url).protocol.toLowerCase();
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
};

const isImageSourceAttribute = (templateHtml: string, tokenOffset: number) => {
  const beforeToken = templateHtml.slice(Math.max(0, tokenOffset - 400), tokenOffset);
  return /\b(?:src|data-src)\s*=\s*(["'])[^"']*$/i.test(beforeToken);
};

const renderVariableImage = (path: string, value: string) => {
  if (!isSafePrintImageUrl(value)) return '';
  const alt = path === 'company.logo_url' ? 'لوگوی سازمان' : 'تصویر';
  // The cap deliberately prevents a variable image from changing a table's
  // designed geometry. Authors can still use a normal image node when they
  // need an explicit, larger size in a template.
  return `<img src="${escapeHtmlAttribute(value)}" alt="${alt}" data-print-variable-image="${path}" style="display:inline-block; width:auto; height:auto; max-width:100%; max-height:36px; object-fit:contain; vertical-align:middle;" />`;
};

/** Replaces print variables and performs the single final HTML sanitization. */
export const renderPrintTemplateHtml = ({
  templateHtml,
  resolveVariableValue,
}: {
  templateHtml?: string;
  resolveVariableValue: (path: string) => string;
}) => {
  if (!templateHtml) return '';
  const filled = templateHtml.replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (match: string, key: string, offset: number) => {
    if (key.startsWith('row.') || key.startsWith('summary.')) return match;
    // This is generated image markup, not user-supplied text. Keep the
    // existing image path untouched so an identifier in its URL is not masked.
    if (key === 'system.record_image') return resolveVariableValue(key);
    const resolvedValue = resolveVariableValue(key);
    // A logo token entered as normal editor text must become an image instead
    // of a long URL that wraps repeatedly and expands the containing cell.
    // Inside an authored <img src="{{...}}"> we only insert the URL.
    if (IMAGE_VARIABLE_PATHS.has(key)) {
      if (isImageSourceAttribute(templateHtml, offset)) {
        return escapeHtmlAttribute(resolvedValue);
      }
      return renderVariableImage(key, resolvedValue);
    }
    // Rich text is safe HTML at this point and is sanitized below. Escaping it
    // here would destroy its paragraphs and line breaks.
    return sanitizeOutboundDisplay(resolvedValue);
  });
  return DOMPurify.sanitize(filled, {
    ADD_TAGS: ['colgroup', 'col'],
    ADD_ATTR: PRINT_TEMPLATE_ALLOWED_ATTRIBUTES,
  });
};
