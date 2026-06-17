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

  it('prefers line breaks inside a tall block before falling back to the block top', () => {
    const offsets = buildSmartPrintPageOffsets({
      totalHeight: 2100,
      pageBodyStepPx: 1000,
      anchors: [
        { top: 0, bottom: 520, priority: 'normal', source: 'block' },
        { top: 520, bottom: 1540, priority: 'high', source: 'block' },
        { top: 930, bottom: 952, priority: 'normal', source: 'line' },
        { top: 970, bottom: 992, priority: 'normal', source: 'line' },
        { top: 1540, bottom: 2080, priority: 'normal', source: 'block' },
      ],
    });

    expect(offsets).toEqual([0, 992, 1992]);
  });

  it('uses complete line anchors inside an oversized table row instead of leaving a large blank area', () => {
    const offsets = buildSmartPrintPageOffsets({
      totalHeight: 1900,
      pageBodyStepPx: 1000,
      anchors: [
        { top: 0, bottom: 420, priority: 'normal', source: 'block' },
        { top: 420, bottom: 1880, priority: 'normal', source: 'block' },
        { top: 420, bottom: 460, priority: 'high', source: 'block' },
        { top: 460, bottom: 1240, priority: 'high', source: 'block' },
        { top: 870, bottom: 894, priority: 'normal', source: 'line' },
        { top: 915, bottom: 939, priority: 'normal', source: 'line' },
        { top: 960, bottom: 984, priority: 'normal', source: 'line' },
      ],
    });

    expect(offsets).toEqual([0, 984]);
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
  it('marks paragraphs and table rows as print-flow blocks without making the whole table hard-kept', () => {
    const annotated = annotatePrintFlowHtml('<div><p>text</p><table><tbody><tr><td>row</td></tr></tbody></table></div>');

    expect(annotated).toContain(PRINT_FLOW_BLOCK_ATTR);
    expect(annotated).toContain('data-print-flow-role="text-block"');
    expect(annotated).toContain('data-print-flow-role="table-container"');
    expect(annotated).toContain('data-print-flow-role="table-row"');
    expect(annotated).toContain(`<table ${PRINT_FLOW_BLOCK_ATTR}="normal" data-print-flow-role="table-container">`);
  });

  it('keeps legacy page-break avoidance from hard-keeping entire tables', () => {
    const annotated = annotatePrintFlowHtml(
      '<table style="page-break-inside: avoid;"><tbody><tr><td>row</td></tr></tbody></table>'
    );

    expect(annotated).toContain(`<table style="page-break-inside: avoid;" ${PRINT_FLOW_BLOCK_ATTR}="normal" data-print-flow-role="table-container">`);
    expect(annotated).not.toContain('data-print-flow-role="manual-keep"');
  });
});
