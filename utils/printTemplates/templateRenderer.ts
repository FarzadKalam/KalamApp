import DOMPurify from 'dompurify';
import { sanitizeOutboundDisplay } from '../../shared/recordRuntime';

const PRINT_TEMPLATE_ALLOWED_ATTRIBUTES = [
  'style', 'width', 'height', 'span', 'colspan', 'rowspan', 'colwidth', 'data-colwidth',
  'data-background-color', 'data-border-color', 'data-print-block', 'data-print-optional-field',
];

/** Replaces print variables and performs the single final HTML sanitization. */
export const renderPrintTemplateHtml = ({
  templateHtml,
  resolveVariableValue,
}: {
  templateHtml?: string;
  resolveVariableValue: (path: string) => string;
}) => {
  if (!templateHtml) return '';
  const filled = templateHtml.replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (match: string, key: string) => {
    if (key.startsWith('row.') || key.startsWith('summary.')) return match;
    // This is generated image markup, not user-supplied text. Keep the
    // existing image path untouched so an identifier in its URL is not masked.
    if (key === 'system.record_image') return resolveVariableValue(key);
    // Rich text is safe HTML at this point and is sanitized below. Escaping it
    // here would destroy its paragraphs and line breaks.
    return sanitizeOutboundDisplay(resolveVariableValue(key));
  });
  return DOMPurify.sanitize(filled, {
    ADD_TAGS: ['colgroup', 'col'],
    ADD_ATTR: PRINT_TEMPLATE_ALLOWED_ATTRIBUTES,
  });
};
