import { describe, expect, it } from 'vitest';
import { buildNativeCustomPrintFlowHtml } from '../../../utils/printTemplates/nativePrintFlow';
import { getNativePrintOptions } from './nativePrintOptions';

describe('native PDF print options', () => {
  it('detects the native flow marker and preserves its dedicated header/footer lanes', () => {
    const sourceHtml = buildNativeCustomPrintFlowHtml({
      widthMm: 210,
      heightMm: 297,
      pageMargins: { top: 8, right: 10, bottom: 9, left: 10 },
      sectionPadding: '4px',
      contentHtml: '<p>بدنهٔ بلند</p>',
      headerHtml: '<div>سربرگ</div>',
      footerHtml: '<div>پاورقی</div>',
      headerHeightPx: 84,
      footerHeightPx: 62,
      showHeader: true,
      showFooter: true,
    });

    expect(getNativePrintOptions(sourceHtml)).toMatchObject({
      widthMm: 210,
      heightMm: 297,
      marginRightMm: 10,
      marginLeftMm: 10,
      headerHtml: expect.stringContaining('سربرگ'),
      footerHtml: expect.stringContaining('پاورقی'),
    });
  });
});
