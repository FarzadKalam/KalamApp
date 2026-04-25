const readStyleValue = (styleText: string, propertyName: string) =>
  styleText.match(new RegExp(`(?:^|;)\\s*${propertyName}\\s*:\\s*([^;]+)`, 'i'))?.[1]?.trim() || '';

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

    const style = img.getAttribute('style') || '';
    const widthAttr = String(img.getAttribute('width') || '').trim();
    const heightAttr = String(img.getAttribute('height') || '').trim();
    const widthStyle = readStyleValue(style, 'width');
    const maxWidthStyle = readStyleValue(style, 'max-width');
    const heightStyle = readStyleValue(style, 'height');
    const maxHeightStyle = readStyleValue(style, 'max-height');

    const widthValue = widthStyle || (widthAttr ? `${widthAttr}px` : '') || maxWidthStyle;
    const heightValue = heightStyle || (heightAttr ? `${heightAttr}px` : '') || maxHeightStyle;
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
      widthValue ? `max-width:${widthValue === '100%' ? '100%' : widthValue} !important` : 'max-width:100%',
      heightValue ? `height:${heightValue} !important` : 'height:auto',
      heightValue && heightValue !== 'auto' ? `max-height:${heightValue} !important` : '',
      !widthValue && !heightValue && isLogoLike ? 'max-width:64px !important' : '',
      !widthValue && !heightValue && isLogoLike ? 'max-height:64px !important' : '',
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

  return root.innerHTML;
};
