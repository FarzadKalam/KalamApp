const PX_PER_MM = 96 / 25.4;
const NATIVE_PRINT_GUARD_MM = 2;
export const NATIVE_PRINT_FONT_CSS_TOKEN = '__KALAMAPP_NATIVE_PRINT_FONT_CSS__';
export const NATIVE_PRINT_BASE_HREF_TOKEN = '__KALAMAPP_NATIVE_PRINT_BASE_HREF__';

export interface PrintPageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface NativeCustomPrintFlowOptions {
  widthMm: number;
  heightMm: number;
  pageMargins: PrintPageMargins;
  sectionPadding: string;
  contentHtml: string;
  headerHtml?: string | null;
  footerHtml?: string | null;
  signatureHtml?: string | null;
  signaturePlacement?: 'footer' | 'each-page';
  headerHeightPx?: number;
  footerHeightPx?: number;
  showHeader?: boolean;
  showFooter?: boolean;
  backgroundImageUrl?: string | null;
  fixedOverlayHtml?: string | null;
  artworkHeightMm?: number;
}

const pxToMm = (value: number | null | undefined) =>
  Math.max(0, Number(value || 0)) / PX_PER_MM;

const toAttributeNumber = (value: number) => Math.max(0, value).toFixed(3);

const buildMarginDocument = ({
  contentHtml,
  sectionPadding,
  position,
  pageMargins,
}: {
  contentHtml: string;
  sectionPadding: string;
  position: 'header' | 'footer';
  pageMargins: PrintPageMargins;
}) => {
  const outerMargin = position === 'header'
    ? `${pageMargins.top}mm ${pageMargins.right}mm 0 ${pageMargins.left}mm`
    : `0 ${pageMargins.right}mm ${pageMargins.bottom}mm ${pageMargins.left}mm`;

  return `<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <base href="${NATIVE_PRINT_BASE_HREF_TOKEN}" />
    <style>
      ${NATIVE_PRINT_FONT_CSS_TOKEN}
      html {
        margin: ${outerMargin};
        font-family: 'Peyda', Tahoma, Arial, sans-serif;
        font-size: 16px;
        direction: rtl;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      body {
        margin: 0;
        padding: ${sectionPadding};
        box-sizing: border-box;
        color: #111827;
        direction: rtl;
        text-align: right;
        font-family: 'Peyda', Tahoma, Arial, sans-serif;
        font-size: 16px;
        line-height: 1.8;
        /* Header/footer HTML is rendered by Chromium in a separate document.
           Clipping that document hides the lower part of the signature lane
           in some Windows PDF print paths, even though the PDF preview has
           already painted it. The outer PDF margin remains the physical
           boundary; this document itself must not introduce another clip. */
        overflow: visible;
      }
      body, body * { box-sizing: border-box; max-width: 100%; font-family: 'Peyda', Tahoma, Arial, sans-serif !important; }
      body img { max-width: 100%; height: auto; }
      body table { width: 100%; border-collapse: collapse; }
      body p { margin: 0 0 6px; }
      [data-kalamapp-print-margin-content] { display: block; width: 100%; min-width: 0; max-width: 100%; overflow: visible; }
      [data-print-signature-band] {
        display: grid !important;
        break-inside: avoid;
        page-break-inside: avoid;
        overflow: visible !important;
      }
    </style>
  </head>
  <body><div data-kalamapp-print-margin-content="true">${contentHtml}</div></body>
</html>`;
};

/**
 * Builds the one flowing body that Gotenberg/Chromium paginates natively.
 * Header/footer use dedicated page margins. The central page paginator keeps
 * signatures at the bottom of intermediate pages and after the final content.
 */
export const buildNativeCustomPrintFlowHtml = ({
  widthMm,
  heightMm,
  pageMargins,
  sectionPadding,
  contentHtml,
  headerHtml,
  footerHtml,
  signatureHtml,
  signaturePlacement = 'footer',
  headerHeightPx = 0,
  footerHeightPx = 0,
  showHeader = false,
  showFooter = false,
  backgroundImageUrl,
  fixedOverlayHtml,
  artworkHeightMm,
}: NativeCustomPrintFlowOptions) => {
  const headerContent = String(headerHtml || '').trim();
  const flowingSignature = signaturePlacement !== 'footer' ? String(signatureHtml || '').trim() : '';
  const footerContent = [signaturePlacement === 'footer' ? String(signatureHtml || '').trim() : '', String(footerHtml || '').trim()]
    .filter(Boolean)
    .join('');
  const includeHeader = Boolean(showHeader && headerContent);
  const includeFooter = Boolean(showFooter && footerContent);
  const marginTopMm = pageMargins.top + (includeHeader ? pxToMm(headerHeightPx) + NATIVE_PRINT_GUARD_MM : 0);
  const marginBottomMm = pageMargins.bottom + (includeFooter ? pxToMm(footerHeightPx) + NATIVE_PRINT_GUARD_MM : 0);
  const headerDocument = includeHeader
    ? buildMarginDocument({
        contentHtml: headerContent,
        sectionPadding,
        position: 'header',
        pageMargins,
      })
    : '';
  const footerDocument = includeFooter
    ? buildMarginDocument({
        contentHtml: footerContent,
        sectionPadding,
        position: 'footer',
        pageMargins,
      })
    : '';
  const safeBackgroundUrl = String(backgroundImageUrl || '').trim().replace(/["'<>]/g, '');
  const overlayContent = String(fixedOverlayHtml || '').trim();
  const artworkStyle = artworkHeightMm && artworkHeightMm > 0
    ? `height:${toAttributeNumber(artworkHeightMm)}mm;bottom:auto;`
    : '';
  const printableWidth = toAttributeNumber(widthMm - pageMargins.left - pageMargins.right);
  const pageBodyHeight = Math.max(1, Math.floor((heightMm - marginTopMm - marginBottomMm) * PX_PER_MM) - 1);
  // Use the existing central fragment paginator for repeated signatures. Each
  // page owns real content nodes; no fixed footer copy needs to be erased on
  // the last page, and the last signature can follow the final text naturally.
  const paginatedSignature = signaturePlacement === 'each-page' && Boolean(flowingSignature);
  const bodyHtml = paginatedSignature
    ? `<div class="invoice-custom-print-shell" style="width:${printableWidth}mm;">
        <section class="print-template-page" data-print-layout-mode="native-flow" style="width:${printableWidth}mm;height:${pageBodyHeight}px;padding:${sectionPadding};display:flex;flex-direction:column;box-sizing:border-box;">
          <div class="print-template-body" style="position:relative;min-height:0;">
            <div class="print-template-body-viewport" style="position:relative;overflow:hidden;">
              <div class="print-template-body-segment"><div class="print-template-body-inner">${String(contentHtml || '')}</div></div>
            </div>
          </div>
          <div class="print-template-footer" style="flex-shrink:0;margin-top:auto;">
            <div class="print-template-footer-stack"><div class="print-template-signatures" style="padding-top:8px;">${flowingSignature}</div></div>
          </div>
        </section>
      </div>`
    : String(contentHtml || '');

  return `<div
  class="kalamapp-native-print-flow"
  data-kalamapp-native-print-flow="true"
  data-kalamapp-paper-width-mm="${toAttributeNumber(widthMm)}"
  data-kalamapp-paper-height-mm="${toAttributeNumber(heightMm)}"
  data-kalamapp-margin-top-mm="${toAttributeNumber(marginTopMm)}"
  data-kalamapp-margin-right-mm="${toAttributeNumber(pageMargins.right)}"
  data-kalamapp-margin-bottom-mm="${toAttributeNumber(marginBottomMm)}"
  data-kalamapp-margin-left-mm="${toAttributeNumber(pageMargins.left)}"
  style="width:${printableWidth}mm;max-width:none;box-sizing:border-box;"
>
  ${headerDocument ? `<template id="kalamapp-gotenberg-header">${headerDocument}</template>` : ''}
  ${footerDocument ? `<template id="kalamapp-gotenberg-footer">${footerDocument}</template>` : ''}
  ${safeBackgroundUrl ? `<div class="kalamapp-native-print-flow-background" style="background-image:url('${safeBackgroundUrl}');${artworkStyle}"></div>` : ''}
  ${overlayContent ? `<div class="kalamapp-native-print-flow-overlay" style="${artworkStyle}">${overlayContent}</div>` : ''}
  <main class="kalamapp-native-print-flow-body" style="padding:${paginatedSignature ? '0' : sectionPadding}; box-sizing:border-box;">
    ${bodyHtml}
  </main>
</div>`;
};

/** Chromium resolves these counters in the separate page-margin documents. */
export const prepareNativePageCounterTokens = (html: string | undefined): string =>
  String(html || '')
    .replace(/{{\s*system\.page_index\s*}}/g, '<span class="pageNumber"></span>')
    .replace(/{{\s*system\.page_count\s*}}/g, '<span class="totalPages"></span>');

export const appendNativePageCounter = (footerHtml: string, headerHtml = ''): string =>
  /class\s*=\s*["'][^"']*\bpageNumber\b/.test(`${headerHtml}${footerHtml}`)
    ? footerHtml
    : `${footerHtml}<div class="print-template-page-counter" style="margin-top:4px;font-size:10px;color:#64748b;direction:rtl;text-align:left;">صفحه <span class="pageNumber"></span> از <span class="totalPages"></span></div>`;
