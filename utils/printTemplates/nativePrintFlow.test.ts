import { describe, expect, it } from 'vitest';
import { materializeNativePrintAssets } from './buildPrintDocumentHtml';
import {
  buildNativeCustomPrintFlowHtml,
  NATIVE_PRINT_BASE_HREF_TOKEN,
  NATIVE_PRINT_FONT_CSS_TOKEN,
} from './nativePrintFlow';

describe('buildNativeCustomPrintFlowHtml', () => {
  it('keeps one uncut body while reserving dedicated Gotenberg lanes for header and footer', () => {
    const html = buildNativeCustomPrintFlowHtml({
      widthMm: 297,
      heightMm: 210,
      pageMargins: { top: 8, right: 8, bottom: 8, left: 8 },
      sectionPadding: '0 10px',
      contentHtml: '<div><table><tbody><tr><td>ITEM-55 متن بسیار بلند</td></tr></tbody></table><p>FINAL-MARKER</p></div>',
      headerHtml: '<p>HEADER-MARKER</p>',
      footerHtml: '<p>FOOTER-MARKER</p>',
      signatureHtml: '<p>SIGNATURE-MARKER</p>',
      headerHeightPx: 74,
      footerHeightPx: 142,
      showHeader: true,
      showFooter: true,
    });

    expect(html).toContain('data-kalamapp-native-print-flow="true"');
    expect(html).toContain('data-kalamapp-paper-width-mm="297.000"');
    expect(html).toContain('data-kalamapp-paper-height-mm="210.000"');
    expect(html).toContain('id="kalamapp-gotenberg-header"');
    expect(html).toContain('id="kalamapp-gotenberg-footer"');
    expect(html).toContain('HEADER-MARKER');
    expect(html).toContain('FOOTER-MARKER');
    expect(html).toContain('SIGNATURE-MARKER');
    expect(html).toContain('ITEM-55 متن بسیار بلند');
    expect(html).toContain('FINAL-MARKER');
    expect(html).not.toContain('print-template-body-segment');
    expect(html).not.toContain('overflow:clip');
  });

  it('does not reserve a fake lane when the corresponding section is disabled', () => {
    const html = buildNativeCustomPrintFlowHtml({
      widthMm: 210,
      heightMm: 297,
      pageMargins: { top: 10, right: 10, bottom: 10, left: 10 },
      sectionPadding: '0',
      contentHtml: '<p>BODY-MARKER</p>',
    });

    expect(html).not.toContain('kalamapp-gotenberg-header');
    expect(html).not.toContain('kalamapp-gotenberg-footer');
    expect(html).toContain('data-kalamapp-margin-top-mm="10.000"');
    expect(html).toContain('data-kalamapp-margin-bottom-mm="10.000"');
  });

  it('keeps letterhead artwork and overlays outside the flowing body', () => {
    const html = buildNativeCustomPrintFlowHtml({
      widthMm: 210,
      heightMm: 297,
      pageMargins: { top: 70, right: 14, bottom: 45, left: 14 },
      sectionPadding: '0',
      contentHtml: '<p>LETTERHEAD-BODY</p>',
      backgroundImageUrl: 'https://example.test/letterhead.png',
      fixedOverlayHtml: '<div>LETTERHEAD-SIGNATURE</div>',
    });

    expect(html).toContain('kalamapp-native-print-flow-background');
    expect(html).toContain("background-image:url('https://example.test/letterhead.png')");
    expect(html).toContain('kalamapp-native-print-flow-overlay');
    expect(html).toContain('LETTERHEAD-SIGNATURE');
    expect(html).toContain('LETTERHEAD-BODY');
  });

  it('gives the separate header and footer documents the project font and asset base URL', () => {
    const sourceHtml = buildNativeCustomPrintFlowHtml({
      widthMm: 210,
      heightMm: 297,
      pageMargins: { top: 8, right: 8, bottom: 8, left: 8 },
      sectionPadding: '0',
      contentHtml: '<p>بدنه</p>',
      headerHtml: '<img src="uploads/logo.png" alt="لوگو" />',
      footerHtml: '<img src="uploads/signature.png" alt="امضا" />',
      headerHeightPx: 70,
      footerHeightPx: 60,
      showHeader: true,
      showFooter: true,
    });

    expect(sourceHtml).toContain(NATIVE_PRINT_FONT_CSS_TOKEN);
    expect(sourceHtml).toContain(NATIVE_PRINT_BASE_HREF_TOKEN);
    const materialized = materializeNativePrintAssets({
      sourceHtml,
      fontCss: '@font-face { font-family: Peyda; src: url(data:font/woff2;base64,abc); }',
      baseHref: 'https://app.example.test/',
    });

    expect(materialized).not.toContain(NATIVE_PRINT_FONT_CSS_TOKEN);
    expect(materialized).not.toContain(NATIVE_PRINT_BASE_HREF_TOKEN);
    expect(materialized).toContain('font-family: Peyda');
    expect(materialized).toContain('<base href="https://app.example.test/" />');
    expect(materialized).toContain("font-family: 'Peyda', Tahoma, Arial, sans-serif !important");
  });
});
