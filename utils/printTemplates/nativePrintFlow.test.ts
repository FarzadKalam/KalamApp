import { describe, expect, it } from 'vitest';
import { materializeNativePrintAssets } from './buildPrintDocumentHtml';
import {
  buildNativeCustomPrintFlowHtml,
  appendNativePageCounter,
  prepareNativePageCounterTokens,
  NATIVE_PRINT_BASE_HREF_TOKEN,
  NATIVE_PRINT_FONT_CSS_TOKEN,
} from './nativePrintFlow';

describe('buildNativeCustomPrintFlowHtml', () => {
  it('measures at the printable paper width and delegates repeated signatures to the central paginator', () => {
    const html = buildNativeCustomPrintFlowHtml({
      widthMm: 297, heightMm: 210,
      pageMargins: { top: 8, right: 8, bottom: 8, left: 8 },
      sectionPadding: '0', contentHtml: '<p>LAST-TABLE-ROW</p>',
      signatureHtml: '<p>SIGNATURE-ONCE</p>', signaturePlacement: 'each-page',
      footerHtml: '<p>CONTACT-FOOTER</p>', footerHeightPx: 44, showFooter: true,
    });
    const root = document.createElement('div');
    root.innerHTML = html;
    const flow = root.querySelector<HTMLElement>('.kalamapp-native-print-flow')!;
    const body = flow.querySelector('main')!;
    const footer = flow.querySelector<HTMLTemplateElement>('#kalamapp-gotenberg-footer')!;
    expect(flow.style.width).toBe('281mm');
    expect(flow.style.maxWidth).toBe('none');
    expect(body.textContent).toContain('LAST-TABLE-ROW');
    expect(body.querySelector('[data-print-layout-mode="native-flow"]')).not.toBeNull();
    expect(body.querySelector('.print-template-signatures')?.textContent).toBe('SIGNATURE-ONCE');
    expect(footer.innerHTML).not.toContain('SIGNATURE-ONCE');
    expect(footer.innerHTML).toContain('CONTACT-FOOTER');
    expect(html.match(/SIGNATURE-ONCE/g)).toHaveLength(1);
    expect(Number(flow.dataset.kalamappMarginBottomMm)).toBeCloseTo(21.642, 3);
  });

  it('uses actual PDF page counters without adding a duplicate counter', () => {
    const footer = prepareNativePageCounterTokens('<p>{{system.page_index}} از {{ system.page_count }}</p>');
    expect(footer).not.toContain('{{');
    expect(footer).toContain('class="pageNumber"');
    expect(footer).toContain('class="totalPages"');
    expect(appendNativePageCounter(footer)).toBe(footer);
    expect(appendNativePageCounter('<p>نشانی</p>', footer)).toBe('<p>نشانی</p>');
    expect(appendNativePageCounter('<p>نشانی</p>').match(/class="pageNumber"/g)).toHaveLength(1);
  });

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
      artworkHeightMm: 130,
    });

    expect(html).toContain('kalamapp-native-print-flow-background');
    expect(html).toContain("background-image:url('https://example.test/letterhead.png')");
    expect(html).toContain('kalamapp-native-print-flow-overlay');
    expect(html).toContain('LETTERHEAD-SIGNATURE');
    expect(html).toContain('LETTERHEAD-BODY');
    expect(html).toContain('height:130.000mm;bottom:auto;');
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
    expect(materialized).toContain('data-kalamapp-print-margin-content="true"');
    expect(materialized).toContain("body, body * { box-sizing: border-box; max-width: 100%; font-family: 'Peyda', Tahoma, Arial, sans-serif !important; }");
    expect(materialized).toContain('overflow: visible;');
    expect(materialized).toContain('[data-kalamapp-print-margin-content] { display: block; width: 100%; min-width: 0; max-width: 100%; overflow: visible; }');
    expect(materialized).toContain('[data-print-signature-band] {');
  });
});
