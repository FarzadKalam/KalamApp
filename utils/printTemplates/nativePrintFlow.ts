const PX_PER_MM = 96 / 25.4;
const NATIVE_PRINT_GUARD_MM = 2;

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
  headerHeightPx?: number;
  footerHeightPx?: number;
  showHeader?: boolean;
  showFooter?: boolean;
  backgroundImageUrl?: string | null;
  fixedOverlayHtml?: string | null;
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
    <style>
      html {
        margin: ${outerMargin};
        font-family: Tahoma, Arial, sans-serif;
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
        font-family: inherit;
        font-size: 16px;
        line-height: 1.8;
        overflow: hidden;
      }
      body, body * { box-sizing: border-box; max-width: 100%; }
      body img { max-width: 100%; height: auto; }
      body table { width: 100%; border-collapse: collapse; }
      body p { margin: 0 0 6px; }
    </style>
  </head>
  <body>${contentHtml}</body>
</html>`;
};

/**
 * Builds the one flowing body that Gotenberg/Chromium paginates natively.
 * Header, footer and signature stay in Gotenberg's dedicated page margins so
 * they cannot overlap a long table row or a final paragraph.
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
  headerHeightPx = 0,
  footerHeightPx = 0,
  showHeader = false,
  showFooter = false,
  backgroundImageUrl,
  fixedOverlayHtml,
}: NativeCustomPrintFlowOptions) => {
  const headerContent = String(headerHtml || '').trim();
  const footerContent = [String(signatureHtml || '').trim(), String(footerHtml || '').trim()]
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

  return `<div
  class="kalamapp-native-print-flow"
  data-kalamapp-native-print-flow="true"
  data-kalamapp-paper-width-mm="${toAttributeNumber(widthMm)}"
  data-kalamapp-paper-height-mm="${toAttributeNumber(heightMm)}"
  data-kalamapp-margin-top-mm="${toAttributeNumber(marginTopMm)}"
  data-kalamapp-margin-right-mm="${toAttributeNumber(pageMargins.right)}"
  data-kalamapp-margin-bottom-mm="${toAttributeNumber(marginBottomMm)}"
  data-kalamapp-margin-left-mm="${toAttributeNumber(pageMargins.left)}"
>
  ${headerDocument ? `<template id="kalamapp-gotenberg-header">${headerDocument}</template>` : ''}
  ${footerDocument ? `<template id="kalamapp-gotenberg-footer">${footerDocument}</template>` : ''}
  ${safeBackgroundUrl ? `<div class="kalamapp-native-print-flow-background" style="background-image:url('${safeBackgroundUrl}')"></div>` : ''}
  ${overlayContent ? `<div class="kalamapp-native-print-flow-overlay">${overlayContent}</div>` : ''}
  <main class="kalamapp-native-print-flow-body" style="padding:${sectionPadding}; box-sizing:border-box;">
    ${String(contentHtml || '')}
  </main>
</div>`;
};
