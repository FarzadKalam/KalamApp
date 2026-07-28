import { describe, expect, it } from 'vitest';
import {
  buildSmartPrintPageOffsets,
  getPrintMeasurementScale,
  getSafePrintAnchorBounds,
  type PrintPageAnchor,
} from './printPagination';

const pxPerMm = 96 / 25.4;

const buildVariableLineAnchors = (totalHeight: number, lineHeights: number[]): PrintPageAnchor[] => {
  const anchors: PrintPageAnchor[] = [];
  let top = 0;
  let index = 0;
  while (top < totalHeight) {
    const height = lineHeights[index % lineHeights.length];
    const bottom = Math.min(totalHeight, top + height);
    anchors.push({ top, bottom, priority: 'normal', source: 'line' });
    top = bottom + 5;
    index += 1;
  }
  return anchors;
};

describe('print pagination scenarios', () => {
  it('keeps fractional line and row bottoms inside the preceding viewport', () => {
    expect(getSafePrintAnchorBounds(104.25, 127.05)).toEqual({ top: 104, bottom: 128 });
    expect(getSafePrintAnchorBounds(127.95, 171.4)).toEqual({ top: 127, bottom: 172 });
  });

  it('converts zoomed preview rectangles back to print coordinates before paginating', () => {
    expect(getPrintMeasurementScale({
      logicalWidth: 1120,
      logicalHeight: 1760,
      renderedWidth: 560,
      renderedHeight: 880,
    })).toEqual({ x: 2, y: 2 });
  });

  it('never chooses an anchor lower edge outside the exact body viewport', () => {
    const offsets = buildSmartPrintPageOffsets({
      totalHeight: 1300,
      pageBodyStepPx: 640,
      anchors: [
        { top: 580, bottom: 640, priority: 'normal', source: 'line' },
        { top: 620, bottom: 641, priority: 'normal', source: 'line' },
      ],
      minPageFillRatio: 0.5,
      hardKeepFillRatio: 0.2,
    });

    expect(offsets[1]).toBe(640);
  });

  it('برای محتوای کوتاه با هر ترکیب سربرگ، پاورقی و امضا فقط یک صفحه می‌سازد', () => {
    const pageBodyStepPx = Math.floor((297 - (14 + 10)) * pxPerMm - 104 - (62 + 108));
    const totalHeight = Math.floor(pageBodyStepPx * 0.72);
    const lineAnchors = buildVariableLineAnchors(totalHeight, [18, 27, 22, 31]);

    expect(buildSmartPrintPageOffsets({ totalHeight, pageBodyStepPx, anchors: lineAnchors })).toEqual([0]);
  });

  it.each([
    {
      name: 'A4 عمودی با سربرگ، پاورقی، امضا و حاشیه‌های سفارشی',
      paperHeightMm: 297,
      marginsMm: 14 + 10,
      headerPx: 104,
      footerPx: 62 + 108,
      lineHeights: [18, 22, 27, 19, 31],
      tableRows: [96, 128, 74, 148, 82],
    },
    {
      name: 'A4 افقی با فونت ریز و جدول اقلام چندستونه',
      paperHeightMm: 210,
      marginsMm: 8 + 8,
      headerPx: 72,
      footerPx: 44,
      lineHeights: [13, 16, 15, 21, 14],
      tableRows: [58, 73, 91, 66, 104, 81],
    },
    {
      name: 'A5 عمودی با فونت درشت، پاورقی بلند و چند جدول',
      paperHeightMm: 210,
      marginsMm: 12 + 16,
      headerPx: 88,
      footerPx: 96 + 108,
      lineHeights: [25, 34, 29, 38],
      tableRows: [112, 156, 92, 136],
    },
  ])('$name در چند صفحه متن را فقط بین خطوط کامل می‌شکند', ({ paperHeightMm, marginsMm, headerPx, footerPx, lineHeights, tableRows }) => {
    const pageBodyStepPx = Math.floor((paperHeightMm - marginsMm) * pxPerMm - headerPx - footerPx);
    const totalHeight = pageBodyStepPx * 3 + 240;
    const lineAnchors = buildVariableLineAnchors(totalHeight, lineHeights);
    const tableAnchors = tableRows.map((height, index) => {
      const top = 110 + index * Math.floor(totalHeight / tableRows.length);
      return { top, bottom: top + height, priority: 'normal' as const, source: 'block' as const };
    });
    const offsets = buildSmartPrintPageOffsets({
      totalHeight,
      pageBodyStepPx,
      anchors: [...lineAnchors, ...tableAnchors],
    });

    expect(offsets.length).toBeGreaterThan(2);
    offsets.slice(1).forEach((offset) => {
      expect(lineAnchors.some((line) => line.top < offset && offset < line.bottom)).toBe(false);
    });
  });
});
