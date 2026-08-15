import { normalizePublicAssetUrl } from '../assetUrl';
import { buildPrintImageUrl } from '../imagePreview';

const readStyleValue = (styleText: string, propertyName: string) =>
  styleText.match(new RegExp(`(?:^|;)\\s*${propertyName}\\s*:\\s*([^;]+)`, 'i'))?.[1]?.trim() || '';

const setStyleValue = (styleText: string, propertyName: string, value: string) => {
  const normalizedName = String(propertyName || '').trim().toLowerCase();
  const nextParts = String(styleText || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.toLowerCase().startsWith(`${normalizedName}:`));
  nextParts.push(`${propertyName}:${value}`);
  return nextParts.join(';');
};

const isAutoDimension = (value: string) => !value || /^auto(?:\s*!important)?$/i.test(value.trim());

const normalizeStyleAssetUrls = (styleText: string) =>
  String(styleText || '').replace(/url\((['"]?)(.*?)\1\)/gi, (_match, _quote, rawUrl: string) => {
    const normalizedUrl = buildPrintImageUrl(rawUrl, 'printHero') || normalizePublicAssetUrl(rawUrl) || String(rawUrl || '').trim();
    if (!normalizedUrl) return 'url("")';
    return `url("${normalizedUrl.replace(/"/g, '&quot;')}")`;
  });

export const normalizeRenderedImages = (html: string) => {
  if (typeof window === 'undefined' || !html) return html;

  const parser = new window.DOMParser();
  const doc = parser.parseFromString(`<div id="print-image-root">${html}</div>`, 'text/html');
  const root = doc.getElementById('print-image-root');
  if (!root) return html;

  root.querySelectorAll('img').forEach((img) => {
    const src = String(img.getAttribute('src') || '').trim();
    if (!src) {
      const parent = img.parentElement;
      img.remove();
      if (parent && !String(parent.textContent || '').trim() && parent.children.length === 0) {
        parent.remove();
      }
      return;
    }

    const normalizedSrc = buildPrintImageUrl(src, 'printHero') || normalizePublicAssetUrl(src) || src;
    img.setAttribute('src', normalizedSrc);
    img.setAttribute('loading', 'eager');
    img.setAttribute('decoding', 'sync');

    const style = normalizeStyleAssetUrls(img.getAttribute('style') || '');
    const widthAttr = String(img.getAttribute('width') || '').trim();
    const heightAttr = String(img.getAttribute('height') || '').trim();
    const widthStyle = readStyleValue(style, 'width');
    const maxWidthStyle = readStyleValue(style, 'max-width');
    const heightStyle = readStyleValue(style, 'height');
    const maxHeightStyle = readStyleValue(style, 'max-height');

    // A max-width/max-height is a constraint, not a requested dimension.
    // Promoting it to width/height made variable logos fill a table cell and
    // changed the geometry the author created in the print editor.
    const widthValue = widthStyle || (widthAttr ? `${widthAttr}px` : '');
    const maxWidthValue = isAutoDimension(maxWidthStyle) ? (widthValue ? widthValue : '100%') : maxWidthStyle;
    const heightValue = heightStyle || (heightAttr ? `${heightAttr}px` : '');
    const maxHeightValue = isAutoDimension(maxHeightStyle) ? (heightValue && heightValue !== 'auto' ? heightValue : '') : maxHeightStyle;
    const altText = String(img.getAttribute('alt') || '').trim();
    const isLogoLike = /logo|لوگو/i.test(altText);
    const preservedStyle = style
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => !/^(width|max-width|height|max-height|display|object-fit)\s*:/i.test(part));

    const nextStyleParts = [
      ...preservedStyle,
      'display:block',
      'object-fit:contain',
      widthValue ? `width:${widthValue} !important` : 'width:auto',
      `max-width:${maxWidthValue} !important`,
      heightValue ? `height:${heightValue} !important` : 'height:auto',
      maxHeightValue ? `max-height:${maxHeightValue} !important` : '',
      !widthValue && !heightValue && !maxWidthStyle && !maxHeightStyle && isLogoLike ? 'max-width:64px !important' : '',
      !widthValue && !heightValue && !maxWidthStyle && !maxHeightStyle && isLogoLike ? 'max-height:64px !important' : '',
    ].filter(Boolean);

    const numericWidth = widthValue.match(/^(\d+(?:\.\d+)?)px$/i)?.[1];
    const numericHeight = heightValue.match(/^(\d+(?:\.\d+)?)px$/i)?.[1];

    if (numericWidth) {
      img.setAttribute('width', `${Math.round(Number(numericWidth))}`);
    } else {
      img.removeAttribute('width');
    }

    if (numericHeight) {
      img.setAttribute('height', `${Math.round(Number(numericHeight))}`);
    } else if (!heightValue || heightValue === 'auto') {
      img.removeAttribute('height');
    }

    img.setAttribute('style', Array.from(new Set(nextStyleParts)).join(';'));
  });

  root.querySelectorAll<HTMLElement>('[style]').forEach((element) => {
    const style = String(element.getAttribute('style') || '').trim();
    if (!style || !style.includes('url(')) return;
    element.setAttribute('style', normalizeStyleAssetUrls(style));
  });

  // Tiptap only persists its technical min-width after a table has been
  // resized. The editor stylesheet makes such tables look full-width, while
  // Gotenberg's isolated header/footer documents do not inherit that rule.
  // Keep author-selected widths intact; give only those editor tables without
  // a width the same 100% width they visibly have in the editor.
  root.querySelectorAll<HTMLTableElement>('table').forEach((table) => {
    if (!table.parentElement?.classList.contains('tableWrapper')) return;

    const widthFromStyle = readStyleValue(table.getAttribute('style') || '', 'width');
    const widthFromAttribute = String(table.getAttribute('width') || '').trim();
    if (!isAutoDimension(widthFromStyle) || widthFromAttribute) return;

    let nextStyle = String(table.getAttribute('style') || '').trim();
    nextStyle = setStyleValue(nextStyle, 'width', '100% !important');
    nextStyle = setStyleValue(nextStyle, 'max-width', '100% !important');
    nextStyle = setStyleValue(nextStyle, 'table-layout', 'fixed !important');
    table.setAttribute('style', nextStyle);
  });

  return root.innerHTML;
};
