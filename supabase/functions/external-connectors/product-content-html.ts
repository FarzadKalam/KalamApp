import { parseFragment, type DefaultTreeAdapterMap } from 'npm:parse5@7.3.0';

type HtmlNode = DefaultTreeAdapterMap['childNode'];

const blocks = new Set(['p', 'h2', 'h3', 'h4', 'ul', 'ol']);
const allowedTags = new Set([...blocks, 'strong', 'em', 'u', 'li', 'span', 'br', 'a']);
const discardContents = new Set(['script', 'style', 'textarea', 'xmp', 'iframe', 'noscript', 'template', 'noembed', 'object']);
const htmlNamespace = 'http://www.w3.org/1999/xhtml';
const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const safeHref = (value: string) => {
  const href = value.trim();
  if (/[\u0000-\u0020\u007f\\]/.test(href)) return '';
  return /^(?:https?:\/\/|mailto:|tel:|\/(?!\/)|[#?])/i.test(href) ? href : '';
};

const safeStyle = (tag: string, style: string) => {
  const accepted = new Map<string, string>();
  for (const declaration of style.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator < 0) continue;
    const name = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim().toLowerCase();
    if (name === 'text-align' && /^(?:p|h[2-4])$/.test(tag) && /^(?:left|center|right)$/.test(value)) {
      accepted.set(name, value);
    }
    if (name === 'color' && /^(?:p|h[2-4]|span)$/.test(tag) &&
      /^(?:#[\da-f]{3,8}|rgb\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\))$/.test(value)) {
      accepted.set(name, value.replace(/\s+/g, ''));
    }
  }
  return [...accepted].sort(([first], [second]) => first.localeCompare(second))
    .map(([name, value]) => `${name}:${value}`).join(';');
};

export const normalizeWooProductDescription = (value: unknown, html = false) => {
  const input = String(value ?? '').trim();
  if (!input) return '';
  const markup = html || /<\/?(?:p|h[2-4]|strong|b|em|i|u|ul|ol|li|span|br|a)\b/i.test(input)
    ? input : escapeHtml(input).replace(/\r?\n/g, '<br>');
  let visibleText = false;
  let hasBlock = false;
  const write = (node: HtmlNode, depth: number): string => {
    if (depth > 64) return '';
    if (node.nodeName === '#text' && 'value' in node) {
      visibleText ||= Boolean(node.value.trim());
      return escapeHtml(node.value);
    }
    if (!('tagName' in node) || node.namespaceURI !== htmlNamespace || discardContents.has(node.tagName)) return '';
    const tag = node.tagName === 'b' ? 'strong' : node.tagName === 'i' ? 'em' : node.tagName;
    const contents = node.childNodes.map((child) => write(child, depth + 1)).join('');
    if (!allowedTags.has(tag)) return contents;
    if (tag === 'br') return '<br />';
    hasBlock ||= blocks.has(tag);
    const style = safeStyle(tag, node.attrs.find((attribute) => attribute.name === 'style')?.value || '');
    const href = tag === 'a' ? safeHref(node.attrs.find((attribute) => attribute.name === 'href')?.value || '') : '';
    return `<${tag}${style ? ` style="${style}"` : ''}${href ? ` href="${escapeHtml(href)}"` : ''}>${contents}</${tag}>`;
  };
  const sanitized = parseFragment(markup).childNodes.map((node) => write(node, 0)).join('').trim();
  if (!visibleText) return '';
  return hasBlock ? sanitized : `<p>${sanitized}</p>`;
};
