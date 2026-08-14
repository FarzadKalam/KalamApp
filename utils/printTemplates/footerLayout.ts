const EMPTY_FOOTER_PATTERN = /^<div(?:\s[^>]*)?>\s*<\/div>$/i;
const INVISIBLE_PRINT_TEXT_PATTERN = /[\s\u00a0\u200b-\u200d\u2060\ufeff]+/g;
const FOOTER_MEDIA_PATTERN = /<(?:audio|canvas|embed|iframe|img|object|picture|svg|video)\b/i;

export const buildDefaultPrintFooterTemplate = () => `
<div style="display:flex; align-items:center; gap:8px; font-size:9px; color:#64748b; direction:rtl; overflow:hidden; flex-wrap:nowrap;">
  <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; font-size:8.5px;">{{company.address}}</span>
  <span style="white-space:nowrap; flex-shrink:0; direction:ltr;">{{company.phone}}</span>
  <span style="white-space:nowrap; flex-shrink:0; direction:ltr;">{{company.email}}</span>
  <span style="white-space:nowrap; flex-shrink:0; direction:ltr;">{{company.website}}</span>
</div>
`.trim();

export const hasRenderablePrintFooterHtml = (html: string | null | undefined) => {
  const source = String(html || '');
  const normalized = source
    .replace(/&nbsp;/gi, '')
    .trim();

  if (!normalized) return false;
  if (FOOTER_MEDIA_PATTERN.test(normalized)) return true;
  if (EMPTY_FOOTER_PATTERN.test(normalized)) return false;

  // TipTap's empty paragraph is serialized with attributes and can contain a
  // ZWNJ. It is visually empty but previously reserved a footer lane.
  const textOnly = normalized
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:nbsp|#160);/gi, '')
    .replace(INVISIBLE_PRINT_TEXT_PATTERN, '');
  return textOnly.length > 0;
};
