const EMPTY_FOOTER_PATTERN = /^<div(?:\s[^>]*)?>\s*<\/div>$/i;

export const buildDefaultPrintFooterTemplate = () => `
<div style="display:flex; align-items:center; gap:8px; font-size:9px; color:#64748b; direction:rtl; overflow:hidden; flex-wrap:nowrap;">
  <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; font-size:8.5px;">{{company.address}}</span>
  <span style="white-space:nowrap; flex-shrink:0; direction:ltr;">{{company.phone}}</span>
  <span style="white-space:nowrap; flex-shrink:0; direction:ltr;">{{company.email}}</span>
  <span style="white-space:nowrap; flex-shrink:0; direction:ltr;">{{company.website}}</span>
</div>
`.trim();

export const hasRenderablePrintFooterHtml = (html: string | null | undefined) => {
  const normalized = String(html || '')
    .replace(/&nbsp;/gi, '')
    .trim();

  if (!normalized) return false;
  return !EMPTY_FOOTER_PATTERN.test(normalized);
};
