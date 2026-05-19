import { describe, expect, it } from 'vitest';
import { annotatePrintFlowHtml, buildSmartPrintPageOffsets, PRINT_FLOW_BLOCK_ATTR } from './printPagination';

describe('buildSmartPrintPageOffsets', () => {
  it('prefers breaking after the last complete block before the page limit', () => {
    const offsets = buildSmartPrintPageOffsets({
      totalHeight: 2200,
      pageBodyStepPx: 1000,
      anchors: [
        { top: 0, bottom: 520, priority: 'normal' },
        { top: 520, bottom: 880, priority: 'normal' },
        { top: 880, bottom: 1180, priority: 'normal' },
        { top: 1180, bottom: 1680, priority: 'normal' },
        { top: 1680, bottom: 2150, priority: 'normal' },
      ],
    });

    expect(offsets).toEqual([0, 880, 1680]);
  });

  it('moves the break before a protected block when no safe bottom is available', () => {
    const offsets = buildSmartPrintPageOffsets({
      totalHeight: 2000,
      pageBodyStepPx: 1000,
      anchors: [
        { top: 0, bottom: 540, priority: 'normal' },
        { top: 760, bottom: 1180, priority: 'high' },
        { top: 1180, bottom: 1620, priority: 'normal' },
        { top: 1620, bottom: 1980, priority: 'normal' },
      ],
    });

    expect(offsets).toEqual([0, 760, 1620]);
  });

  it('keeps single-page content on the first page', () => {
    const offsets = buildSmartPrintPageOffsets({
      totalHeight: 640,
      pageBodyStepPx: 1000,
      anchors: [{ top: 0, bottom: 620, priority: 'normal' }],
    });

    expect(offsets).toEqual([0]);
  });
});

describe('annotatePrintFlowHtml', () => {
  it('marks paragraphs and tables as print-flow blocks', () => {
    const annotated = annotatePrintFlowHtml('<div><p>text</p><table><tbody><tr><td>row</td></tr></tbody></table></div>');

    expect(annotated).toContain(PRINT_FLOW_BLOCK_ATTR);
    expect(annotated).toContain('data-print-flow-role="text-block"');
    expect(annotated).toContain('data-print-flow-role="table-block"');
  });
});
