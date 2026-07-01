import { describe, expect, it } from 'vitest';
import { annotatePrintFlowHtml, buildSmartPrintPageOffsets, PRINT_FLOW_BLOCK_ATTR } from './printPagination';

describe('buildSmartPrintPageOffsets', () => {
  it('falls back to the last complete block only when no line anchors exist', () => {
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

  it('moves the break before a protected block when neither line nor block bottoms are safe', () => {
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

  it('splits normal paragraph text only at line boundaries', () => {
    const offsets = buildSmartPrintPageOffsets({
      totalHeight: 2100,
      pageBodyStepPx: 1000,
      anchors: [
        { top: 0, bottom: 520, priority: 'normal', source: 'block' },
        { top: 760, bottom: 1180, priority: 'normal', source: 'block' },
        { top: 930, bottom: 952, priority: 'normal', source: 'line' },
        { top: 970, bottom: 992, priority: 'normal', source: 'line' },
        { top: 1180, bottom: 1680, priority: 'normal', source: 'block' },
        { top: 1680, bottom: 2080, priority: 'normal', source: 'block' },
      ],
    });

    expect(offsets).toEqual([0, 992, 1680]);
  });

  it('prefers the latest complete line before the page limit even if a taller block continues', () => {
    const offsets = buildSmartPrintPageOffsets({
      totalHeight: 2200,
      pageBodyStepPx: 1000,
      anchors: [
        { top: 0, bottom: 430, priority: 'normal', source: 'block' },
        { top: 430, bottom: 1500, priority: 'normal', source: 'block' },
        { top: 900, bottom: 924, priority: 'normal', source: 'line' },
        { top: 950, bottom: 974, priority: 'normal', source: 'line' },
        { top: 990, bottom: 1014, priority: 'normal', source: 'line' },
        { top: 1460, bottom: 1484, priority: 'normal', source: 'line' },
        { top: 1910, bottom: 1934, priority: 'normal', source: 'line' },
        { top: 1950, bottom: 1974, priority: 'normal', source: 'line' },
        { top: 1500, bottom: 2140, priority: 'normal', source: 'block' },
      ],
    });

    expect(offsets).toEqual([0, 974, 1974]);
  });

  it('splits long table content at the last complete line instead of the row boundary', () => {
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

  it('does not leave a large blank area before a normal table-like block without line anchors', () => {
    const offsets = buildSmartPrintPageOffsets({
      totalHeight: 2400,
      pageBodyStepPx: 1000,
      anchors: [
        { top: 0, bottom: 500, priority: 'normal', source: 'block' },
        { top: 500, bottom: 1480, priority: 'normal', source: 'block' },
        { top: 1480, bottom: 2360, priority: 'normal', source: 'block' },
      ],
    });

    expect(offsets).toEqual([0, 1000, 2000]);
  });

  it('does not use an early line top as the page break for tall text rects', () => {
    const offsets = buildSmartPrintPageOffsets({
      totalHeight: 2400,
      pageBodyStepPx: 1000,
      anchors: [
        { top: 0, bottom: 480, priority: 'normal', source: 'block' },
        { top: 520, bottom: 1320, priority: 'normal', source: 'line' },
        { top: 1320, bottom: 2300, priority: 'normal', source: 'block' },
      ],
    });

    expect(offsets).toEqual([0, 1000, 2000]);
  });

  it('does not move the break to the top of an oversized protected block', () => {
    const offsets = buildSmartPrintPageOffsets({
      totalHeight: 2600,
      pageBodyStepPx: 1000,
      anchors: [
        { top: 0, bottom: 460, priority: 'normal', source: 'block' },
        { top: 460, bottom: 2100, priority: 'high', source: 'block' },
        { top: 900, bottom: 924, priority: 'normal', source: 'line' },
        { top: 950, bottom: 974, priority: 'normal', source: 'line' },
        { top: 1000, bottom: 1024, priority: 'normal', source: 'line' },
        { top: 1460, bottom: 1484, priority: 'normal', source: 'line' },
        { top: 1950, bottom: 1974, priority: 'normal', source: 'line' },
        { top: 2100, bottom: 2550, priority: 'normal', source: 'block' },
      ],
    });

    expect(offsets).toEqual([0, 974, 1974]);
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
    expect(annotated).toContain(`<p ${PRINT_FLOW_BLOCK_ATTR}="normal" data-print-flow-role="text-block">text</p>`);
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

  it('does not hard-keep normal text sections with title or summary class names', () => {
    const annotated = annotatePrintFlowHtml(
      '<div class="payment-summary" style="page-break-inside: avoid;"><p class="section-title">normal text</p></div>'
    );

    expect(annotated).toContain(`data-print-flow-block="normal" data-print-flow-role="root-block"`);
    expect(annotated).toContain(`<p class="section-title" ${PRINT_FLOW_BLOCK_ATTR}="normal" data-print-flow-role="text-block">normal text</p>`);
    expect(annotated).not.toContain(`${PRINT_FLOW_BLOCK_ATTR}="high"`);
    expect(annotated).not.toContain('data-print-flow-role="manual-keep"');
    expect(annotated).not.toContain('data-print-flow-role="semantic-block"');
  });
});
