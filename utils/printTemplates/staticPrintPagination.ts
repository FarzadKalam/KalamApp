import {
  buildSmartPrintPageRanges,
  collectPrintPageAnchors,
  trimTrailingPrintSpacerNodes,
} from './printPagination';
import {
  getPrintBodySegmentTranslationPx,
  getPrintBodyViewportHeightPx,
  getTemplatePageBodyStepPx,
  PRINT_BODY_EDGE_GUARD_PX,
} from './pageLayout';

const CUSTOM_PRINT_PAGE_SELECTOR = '.invoice-custom-print-shell .print-template-page';
const BODY_SELECTOR = '.print-template-body';
const BODY_VIEWPORT_SELECTOR = '.print-template-body-viewport';
const BODY_SEGMENT_SELECTOR = '.print-template-body-segment';
const BODY_INNER_SELECTOR = '.print-template-body-inner';
const PAGE_COUNTER_SELECTOR = '.print-template-page-counter';
const HEADER_SELECTOR = '.print-template-header';
const HEADER_INNER_SELECTOR = '.print-template-header-inner';
const FOOTER_SELECTOR = '.print-template-footer';
const FOOTER_STACK_SELECTOR = '.print-template-footer-stack';
const BODY_CAPACITY_ATTR = 'data-print-body-capacity-px';
const CONFIGURED_HEADER_HEIGHT_ATTR = 'data-print-configured-header-height-px';
const CONFIGURED_FOOTER_HEIGHT_ATTR = 'data-print-configured-footer-height-px';
const SIGNATURE_HEIGHT_ATTR = 'data-print-signature-height-px';
const PAGE_COUNTER_HEIGHT_ATTR = 'data-print-page-counter-height-px';
// CSS margins, table border rounding and font fallback can make a cloned
// fragment a little taller than its source measurement. This reserve is in
// addition to the physical body-edge lane and deliberately favors a short
// page over a leaked line in the next physical sheet.
const MATERIALIZED_FRAGMENT_LAYOUT_RESERVE_PX = 96;

const toPersianNumber = (value: number) =>
  String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)] || digit);

const getMeasuredElementHeight = (element: HTMLElement | null | undefined) => {
  if (!element) return 0;
  const rootRect = element.getBoundingClientRect();
  const descendantBottom = Array.from(element.querySelectorAll<HTMLElement>('*')).reduce((maxBottom, child) => {
    const rect = child.getBoundingClientRect();
    return Math.max(maxBottom, rect.bottom - rootRect.top);
  }, 0);
  return Math.max(
    element.scrollHeight,
    element.offsetHeight,
    element.clientHeight,
    Math.ceil(rootRect.height || 0),
    Math.ceil(descendantBottom || 0),
  );
};

const readPositiveNumber = (element: HTMLElement, attribute: string) => {
  const value = Number(element.getAttribute(attribute));
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const setFixedHeight = (element: HTMLElement | null, height: number) => {
  if (!element || !Number.isFinite(height) || height <= 0) return;
  const cssHeight = `${Math.ceil(height)}px`;
  element.style.flex = `0 0 ${cssHeight}`;
  element.style.height = cssHeight;
  element.style.minHeight = cssHeight;
  element.style.maxHeight = cssHeight;
};

// Every logical page contains a full copy of the source content. Leaving that
// copy in normal layout flow lets Chromium paginate it after a clipped viewport
// in some print contexts, which leaks a prior page tail into the next sheet.
const isolateBodySegment = (segment: HTMLElement | null) => {
  if (!segment) return;
  segment.style.position = 'absolute';
  segment.style.top = '0';
  segment.style.insetInlineStart = '0';
  segment.style.width = '100%';
};

/**
 * A static print document is laid out in a different DOM from the preview.
 * Re-measure its header/footer stack before calculating page ranges so the
 * body never reuses a stale preview reservation after fonts or images settle.
 */
const synchronizeStaticPageLayout = (page: HTMLElement, body: HTMLElement) => {
  const header = page.querySelector<HTMLElement>(HEADER_SELECTOR);
  const footer = page.querySelector<HTMLElement>(FOOTER_SELECTOR);
  const headerInner = page.querySelector<HTMLElement>(HEADER_INNER_SELECTOR);
  const footerStack = page.querySelector<HTMLElement>(FOOTER_STACK_SELECTOR);
  const computedPageStyle = window.getComputedStyle(page);
  const pageContentHeight = Math.max(
    1,
    page.clientHeight -
      Number.parseFloat(computedPageStyle.paddingTop || '0') -
      Number.parseFloat(computedPageStyle.paddingBottom || '0'),
  );
  // JSDOM and an unpainted DOM do not have a physical page box yet. In that
  // transient state the existing body slot is the only trustworthy value.
  if (page.clientHeight <= 1) {
    const declaredCapacity = readPositiveNumber(page, BODY_CAPACITY_ATTR);
    if (declaredCapacity > 0) return declaredCapacity;
    const bodyRect = body.getBoundingClientRect();
    return Math.max(body.clientHeight, body.offsetHeight, Math.ceil(bodyRect.height || 0));
  }
  const headerHeight = header
    ? Math.max(
        readPositiveNumber(page, CONFIGURED_HEADER_HEIGHT_ATTR),
        getMeasuredElementHeight(headerInner),
      )
    : 0;
  const footerHeight = footer
    ? Math.max(
        readPositiveNumber(page, CONFIGURED_FOOTER_HEIGHT_ATTR) +
          readPositiveNumber(page, SIGNATURE_HEIGHT_ATTR) +
          readPositiveNumber(page, PAGE_COUNTER_HEIGHT_ATTR),
        getMeasuredElementHeight(footerStack),
      )
    : 0;
  const bodyHeight = Math.max(1, Math.floor(pageContentHeight - headerHeight - footerHeight));

  setFixedHeight(header, headerHeight);
  setFixedHeight(footer, footerHeight);
  setFixedHeight(body, bodyHeight);
  if (footer) footer.style.marginTop = 'auto';
  page.setAttribute(BODY_CAPACITY_ATTR, String(bodyHeight));

  return bodyHeight;
};

const getStaticBodyHeight = (page: HTMLElement, body: HTMLElement) => {
  const declaredCapacity = readPositiveNumber(page, BODY_CAPACITY_ATTR);
  if (declaredCapacity > 0) return declaredCapacity;
  const rect = body.getBoundingClientRect();
  return Math.max(body.clientHeight, body.offsetHeight, Math.ceil(rect.height || 0));
};

type PrintFragmentUnit = {
  top: number;
  bottom: number;
  kind: 'node' | 'table-row' | 'table-row-part' | 'table-row-slice';
  node: HTMLElement;
  table?: HTMLTableElement;
  sourceRow?: HTMLTableRowElement;
  rowPart?: HTMLTableRowElement;
  /** Offset of the row from the top of the source table (header/caption included). */
  tableRowOffsetPx?: number;
  /** Visible content interval of an exceptionally tall row. */
  sliceStartPx?: number;
  sliceHeightPx?: number;
};

const getRelativeElementBounds = (element: HTMLElement, rootRect: DOMRect) => {
  const rect = element.getBoundingClientRect();
  return {
    top: Math.max(0, Math.floor(rect.top - rootRect.top)),
    bottom: Math.max(0, Math.ceil(rect.bottom - rootRect.top)),
  };
};

const getDirectTableRows = (table: HTMLTableElement) =>
  Array.from(table.querySelectorAll<HTMLTableRowElement>('tr')).filter(
    (row) => row.closest('table') === table && !row.closest('thead'),
  );

const getTableHeaderHeight = (table: HTMLTableElement, rootRect: DOMRect) => {
  const firstBodyRow = getDirectTableRows(table)[0];
  if (!firstBodyRow) return 0;
  const tableTop = getRelativeElementBounds(table, rootRect).top;
  const firstRowTop = getRelativeElementBounds(firstBodyRow, rootRect).top;
  return Math.max(0, firstRowTop - tableTop);
};

const getTableRowCells = (row: HTMLTableRowElement) =>
  Array.from(row.children).filter(
    (child): child is HTMLTableCellElement => child instanceof HTMLTableCellElement,
  );

/**
 * Split a row at real block boundaries inside its tallest cell. Sales invoice
 * descriptions produced by the rich-text editor are paragraphs/lists, so this
 * preserves their markup instead of rendering a hidden translated copy of a
 * tall <tr> (which Chromium may print outside an overflow clip).
 */
const splitOversizedTableRowAtBlocks = ({
  row,
  table,
  rootRect,
  contentCapacityPx,
}: {
  row: HTMLTableRowElement;
  table: HTMLTableElement;
  rootRect: DOMRect;
  contentCapacityPx: number;
}) => {
  const cells = getTableRowCells(row);
  if (!cells.length) return null;

  // Table cells in one row share the same rendered height, so their own
  // rectangles cannot identify the overflowing cell. The longest meaningful
  // cell content is the correct candidate for invoice descriptions and is
  // stable before/after table layout.
  const leaderIndex = cells.reduce((winner, cell, index) => {
    const visibleLength = String(cell.textContent || '').replace(/\s+/g, '').length;
    const winnerLength = String(cells[winner].textContent || '').replace(/\s+/g, '').length;
    return visibleLength > winnerLength ? index : winner;
  }, 0);
  const leaderCell = cells[leaderIndex];
  const blocks = Array.from(leaderCell.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement)
    .map((block) => ({ node: block, ...getRelativeElementBounds(block, rootRect) }))
    .filter((block) => block.bottom > block.top);
  // A single atomic rich block (image/embed) must retain the legacy path;
  // only block boundaries are safe places to divide user-authored markup.
  if (blocks.length < 2) return null;

  const rowBounds = getRelativeElementBounds(row, rootRect);
  const tableTop = getRelativeElementBounds(table, rootRect).top;
  const tableRowOffsetPx = Math.max(0, rowBounds.top - tableTop);
  // Keep a deliberately conservative slice. The source table can acquire
  // larger line metrics in the detached print document (font fallback,
  // collapsed borders and cell padding), and a smaller real row part is much
  // safer than allowing the browser to fall back to a translated overflow.
  const partCapacityPx = Math.max(
    48,
    Math.min(contentCapacityPx - tableRowOffsetPx - 48, Math.floor(contentCapacityPx * 0.42)),
  );
  const chunks: Array<typeof blocks> = [];
  let current: typeof blocks = [];
  let currentStart = 0;

  blocks.forEach((block) => {
    if (!current.length) {
      current = [block];
      currentStart = block.top;
      return;
    }
    if (block.bottom - currentStart > partCapacityPx) {
      chunks.push(current);
      current = [block];
      currentStart = block.top;
      return;
    }
    current.push(block);
  });
  if (current.length) chunks.push(current);
  if (chunks.length < 2 || chunks.some((chunk) => chunk.length === 1 && chunk[0].bottom - chunk[0].top > partCapacityPx)) {
    return null;
  }

  return chunks.map((chunk, partIndex) => {
    const rowPart = row.cloneNode(true) as HTMLTableRowElement;
    const partCells = getTableRowCells(rowPart);
    const partLeader = partCells[leaderIndex];
    if (partLeader) partLeader.replaceChildren(...chunk.map((block) => block.node.cloneNode(true)));
    // Repeating immutable item metadata on every continuation would make the
    // invoice look like duplicated items. Leave those cells blank after the
    // first page while preserving their borders and the complete description.
    if (partIndex > 0) {
      partCells.forEach((cell, index) => {
        if (index !== leaderIndex) cell.replaceChildren();
      });
      rowPart.setAttribute('data-print-table-continuation', 'true');
    }
    const start = chunk[0].top;
    const end = chunk[chunk.length - 1].bottom;
    return {
      top: start,
      bottom: Math.min(start + partCapacityPx, Math.max(end, start + 1)),
      kind: 'table-row-part' as const,
      node: row,
      sourceRow: row,
      rowPart,
      table,
      tableRowOffsetPx,
    };
  });
};

/**
 * Build actual per-page fragments instead of keeping one tall translated DOM
 * tree inside every page. Chromium can paginate a clipped translated tree
 * outside its viewport; a fragment contains no off-page source to leak below
 * a header or above a signature band.
 */
const collectPrintFragmentUnits = (root: HTMLElement, contentCapacityPx: number): PrintFragmentUnit[] => {
  const rootRect = root.getBoundingClientRect();
  const units: PrintFragmentUnit[] = [];

  Array.from(root.children).forEach((child) => {
    const element = child as HTMLElement;
    const { top, bottom } = getRelativeElementBounds(element, rootRect);
    if (bottom <= top) return;

    if (element instanceof HTMLTableElement && bottom - top > contentCapacityPx) {
      const rows = getDirectTableRows(element);
      if (rows.length) {
        const tableTop = top;
        rows.forEach((row) => {
          const rowBounds = getRelativeElementBounds(row, rootRect);
          if (rowBounds.bottom > rowBounds.top) {
            const rowHeight = rowBounds.bottom - rowBounds.top;
            const tableRowOffsetPx = Math.max(0, rowBounds.top - tableTop);
            // A table row may itself be taller than a whole page (for example
            // a long description inside one cell). It cannot be left as an
            // atomic unit: that is exactly how its tail gets clipped under a
            // footer. Represent it as visual row slices, each with a repeated
            // table header, so every word has a physical page to live on.
            const rowSliceCapacityPx = Math.max(48, contentCapacityPx - tableRowOffsetPx - 8);
            if (rowHeight > rowSliceCapacityPx) {
              const blockParts = splitOversizedTableRowAtBlocks({
                row,
                table: element,
                rootRect,
                contentCapacityPx,
              });
              if (blockParts) {
                units.push(...blockParts);
                return;
              }
              for (let sliceStartPx = 0; sliceStartPx < rowHeight; sliceStartPx += rowSliceCapacityPx) {
                const sliceHeightPx = Math.min(rowSliceCapacityPx, rowHeight - sliceStartPx);
                units.push({
                  top: rowBounds.top + sliceStartPx,
                  bottom: rowBounds.top + sliceStartPx + sliceHeightPx,
                  kind: 'table-row-slice',
                  node: row,
                  table: element,
                  tableRowOffsetPx,
                  sliceStartPx,
                  sliceHeightPx,
                });
              }
              return;
            }
            units.push({ ...rowBounds, kind: 'table-row', node: row, table: element });
          }
        });
        return;
      }
    }

    units.push({ top, bottom, kind: 'node', node: element });
  });

  return units.sort((left, right) => left.top - right.top || left.bottom - right.bottom);
};

const groupPrintFragmentUnits = (
  units: PrintFragmentUnit[],
  root: HTMLElement,
  contentCapacityPx: number,
) => {
  if (!units.length) return [] as PrintFragmentUnit[][];
  const rootRect = root.getBoundingClientRect();
  const initialInsetPx = Math.max(0, units[0].top);
  const tableHeaderHeights = new Map<HTMLTableElement, number>();
  const groups: PrintFragmentUnit[][] = [];
  let current: PrintFragmentUnit[] = [];
  let currentStart = 0;

  const estimateHeight = (next: PrintFragmentUnit) => {
    const baseHeight = next.bottom - currentStart + initialInsetPx;
    if (next.kind !== 'table-row' || !next.table || current.some((unit) => unit.table === next.table)) {
      return baseHeight;
    }
    let headerHeight = tableHeaderHeights.get(next.table);
    if (headerHeight === undefined) {
      headerHeight = getTableHeaderHeight(next.table, rootRect);
      tableHeaderHeights.set(next.table, headerHeight);
    }
    return baseHeight + headerHeight;
  };

  units.forEach((unit) => {
    // A long row slice already occupies a complete, independently clipped
    // physical page. Keeping anything else next to it would make the table
    // continuation ambiguous and could reintroduce a footer collision.
    if (unit.kind === 'table-row-slice' || unit.kind === 'table-row-part') {
      if (current.length) groups.push(current);
      groups.push([unit]);
      current = [];
      currentStart = 0;
      return;
    }
    if (!current.length) {
      current = [unit];
      currentStart = unit.top;
      return;
    }

    if (estimateHeight(unit) > contentCapacityPx) {
      groups.push(current);
      current = [unit];
      currentStart = unit.top;
      return;
    }
    current.push(unit);
  });
  if (current.length) groups.push(current);
  return groups;
};

const cloneTableRows = (table: HTMLTableElement, rows: HTMLTableRowElement[]) => {
  const clone = table.cloneNode(true) as HTMLTableElement;
  const selectedRows = new Set(rows);
  const originalRows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tr'));
  const cloneRows = Array.from(clone.querySelectorAll<HTMLTableRowElement>('tr'));

  cloneRows.forEach((row, index) => {
    const originalRow = originalRows[index];
    if (!originalRow || originalRow.closest('thead') || selectedRows.has(originalRow)) return;
    row.remove();
  });
  return clone;
};

const cloneTableRowPart = (table: HTMLTableElement, unit: PrintFragmentUnit) => {
  const sourceRow = unit.sourceRow || (unit.node as HTMLTableRowElement);
  const rowPart = unit.rowPart;
  if (!sourceRow || !rowPart) return null;
  const clone = cloneTableRows(table, [sourceRow]);
  const target = getDirectTableRows(clone)[0];
  if (!target) return null;
  target.replaceWith(rowPart.cloneNode(true));
  return clone;
};

const applySliceTableStyle = (table: HTMLTableElement) => {
  table.style.position = 'absolute';
  table.style.insetInlineStart = '0';
  table.style.width = '100%';
  table.style.maxWidth = '100%';
  table.style.margin = '0';
  table.style.boxSizing = 'border-box';
};

/**
 * Render an exceptionally long table row in a fixed-height viewport. The
 * header/caption is cloned above the viewport, while the same table is moved
 * underneath it by the exact already-rendered row offset. This keeps native
 * table column sizing and rich cell markup intact; it does not shorten text.
 */
const buildTableRowSlice = (documentRef: Document, unit: PrintFragmentUnit) => {
  const table = unit.table;
  const row = unit.node as HTMLTableRowElement;
  if (!table || unit.kind !== 'table-row-slice') return null;

  const headerHeightPx = Math.max(0, Math.ceil(unit.tableRowOffsetPx || 0));
  const sliceStartPx = Math.max(0, Math.floor(unit.sliceStartPx || 0));
  const sliceHeightPx = Math.max(1, Math.ceil(unit.sliceHeightPx || 0));
  const wrapper = documentRef.createElement('div');
  wrapper.className = 'print-template-table-row-slice';
  wrapper.style.position = 'relative';
  wrapper.style.width = '100%';
  wrapper.style.height = `${headerHeightPx + sliceHeightPx}px`;
  wrapper.style.overflow = 'hidden';
  wrapper.style.boxSizing = 'border-box';
  // This containment is deliberately scoped to the internal, absolutely
  // translated table copy. Unlike the page viewport it cannot hide a sibling
  // header/footer, and it stops Chromium from auto-paginating the invisible
  // remainder of the long source row outside this slice.
  wrapper.style.contain = 'layout paint';

  // Keep an invisible, full-width body below the repeated header. It preserves
  // exactly the same column widths as the source table even when the header
  // labels themselves are much shorter than the cell content.
  if (headerHeightPx > 0) {
    const headerViewport = documentRef.createElement('div');
    headerViewport.style.position = 'absolute';
    headerViewport.style.top = '0';
    headerViewport.style.insetInlineStart = '0';
    headerViewport.style.width = '100%';
    headerViewport.style.height = `${headerHeightPx}px`;
    headerViewport.style.overflow = 'hidden';
    headerViewport.style.zIndex = '1';
    headerViewport.style.contain = 'layout paint';
    const headerTable = cloneTableRows(table, [row]);
    applySliceTableStyle(headerTable);
    headerTable.style.top = '0';
    headerTable.querySelectorAll('tbody').forEach((body) => {
      (body as HTMLElement).style.visibility = 'hidden';
    });
    headerViewport.append(headerTable);
    wrapper.append(headerViewport);
  }

  const rowViewport = documentRef.createElement('div');
  rowViewport.style.position = 'absolute';
  rowViewport.style.top = `${headerHeightPx}px`;
  rowViewport.style.insetInlineStart = '0';
  rowViewport.style.width = '100%';
  rowViewport.style.height = `${sliceHeightPx}px`;
  rowViewport.style.overflow = 'hidden';
  rowViewport.style.boxSizing = 'border-box';
  rowViewport.style.contain = 'layout paint';
  const rowTable = cloneTableRows(table, [row]);
  applySliceTableStyle(rowTable);
  rowTable.style.top = `-${headerHeightPx + sliceStartPx}px`;
  rowViewport.append(rowTable);
  wrapper.append(rowViewport);
  return wrapper;
};

const buildPrintFragment = (documentRef: Document, units: PrintFragmentUnit[]) => {
  const fragment = documentRef.createDocumentFragment();
  let index = 0;
  while (index < units.length) {
    const unit = units[index];
    if (unit.kind === 'node') {
      fragment.append(unit.node.cloneNode(true));
      index += 1;
      continue;
    }

    if (unit.kind === 'table-row-slice') {
      const slice = buildTableRowSlice(documentRef, unit);
      if (slice) fragment.append(slice);
      index += 1;
      continue;
    }

    if (unit.kind === 'table-row-part') {
      const tablePart = unit.table ? cloneTableRowPart(unit.table, unit) : null;
      if (tablePart) fragment.append(tablePart);
      index += 1;
      continue;
    }

    const table = unit.table;
    if (!table) {
      index += 1;
      continue;
    }
    const rows: HTMLTableRowElement[] = [];
    while (index < units.length && units[index].kind === 'table-row' && units[index].table === table) {
      rows.push(units[index].node as HTMLTableRowElement);
      index += 1;
    }
    fragment.append(cloneTableRows(table, rows));
  }
  return fragment;
};

const buildMaterializedPrintFragments = (root: HTMLElement, contentCapacityPx: number) => {
  const units = collectPrintFragmentUnits(root, contentCapacityPx);
  if (!units.length) return null;

  // A single unsplittable block (for example an embedded document or a very
  // large image) needs the legacy range path: cloning it onto a page would
  // still overflow. Normal rich-text blocks and table rows are materialized.
  if (units.some((unit) => unit.bottom - unit.top > contentCapacityPx)) return null;

  const groups = groupPrintFragmentUnits(units, root, contentCapacityPx);
  return groups.length ? groups : null;
};

const getMaterializedContentCapacityPx = (pageBodyStepPx: number) =>
  Math.max(80, Math.floor(pageBodyStepPx) - MATERIALIZED_FRAGMENT_LAYOUT_RESERVE_PX);

const applyMaterializedBodyFragment = ({
  page,
  fragment,
  bodyHeightPx,
}: {
  page: HTMLElement;
  fragment: DocumentFragment;
  bodyHeightPx: number;
}) => {
  const viewport = page.querySelector<HTMLElement>(BODY_VIEWPORT_SELECTOR);
  const segment = page.querySelector<HTMLElement>(BODY_SEGMENT_SELECTOR);
  const inner = page.querySelector<HTMLElement>(BODY_INNER_SELECTOR);
  if (!viewport || !segment || !inner) return false;

  const bodyHeight = `${Math.ceil(bodyHeightPx)}px`;
  viewport.style.flex = `0 0 ${bodyHeight}`;
  viewport.style.height = bodyHeight;
  viewport.style.minHeight = '0';
  viewport.style.maxHeight = bodyHeight;
  viewport.style.overflow = 'hidden';
  // A materialized page no longer contains a translated, off-page source.
  // CSS paint/layout containment can make Chromium omit adjacent fixed-page
  // siblings when a table crosses a print fragment, so it must be removed.
  viewport.style.contain = 'none';
  viewport.style.position = 'relative';

  // The fragment has no off-page source. Keep a physical white lane around
  // it instead of translating one shared tall source tree into every page.
  segment.style.position = 'relative';
  segment.style.top = 'auto';
  segment.style.insetInlineStart = 'auto';
  segment.style.width = '100%';
  segment.style.boxSizing = 'border-box';
  segment.style.paddingTop = `${PRINT_BODY_EDGE_GUARD_PX}px`;
  segment.style.paddingBottom = `${PRINT_BODY_EDGE_GUARD_PX}px`;
  segment.style.transform = 'none';
  inner.replaceChildren(fragment);
  return true;
};

const fitMaterializedPrintFragments = ({
  shell,
  pageTemplate,
  fragments,
  bodyHeightPx,
}: {
  shell: HTMLElement;
  pageTemplate: HTMLElement;
  fragments: PrintFragmentUnit[][];
  bodyHeightPx: number;
}) => {
  // The final source and preview can have different font metrics. Measure the
  // cloned fragment in the *same physical page* and bisect it until it really
  // fits. A heuristic alone cannot prove that a mixed-font table will fit.
  if (!shell.isConnected || shell.clientWidth <= 1) return fragments;

  const fits = (units: PrintFragmentUnit[]) => {
    const candidate = pageTemplate.cloneNode(true) as HTMLElement;
    candidate.style.position = 'absolute';
    candidate.style.top = '0';
    candidate.style.insetInlineStart = '-100000px';
    candidate.style.visibility = 'hidden';
    candidate.style.pointerEvents = 'none';
    candidate.style.pageBreakAfter = 'auto';
    candidate.style.breakAfter = 'auto';
    const fragment = buildPrintFragment(candidate.ownerDocument, units);
    if (!applyMaterializedBodyFragment({ page: candidate, fragment, bodyHeightPx })) return false;
    shell.appendChild(candidate);
    const viewport = candidate.querySelector<HTMLElement>(BODY_VIEWPORT_SELECTOR);
    const segment = candidate.querySelector<HTMLElement>(BODY_SEGMENT_SELECTOR);
    const inner = candidate.querySelector<HTMLElement>(BODY_INNER_SELECTOR);
    const actualHeight = Math.max(
      viewport?.scrollHeight || 0,
      segment?.scrollHeight || 0,
      (inner?.scrollHeight || 0) + PRINT_BODY_EDGE_GUARD_PX * 2,
    );
    candidate.remove();
    return actualHeight <= Math.ceil(bodyHeightPx) + 1;
  };

  const splitUntilFit = (units: PrintFragmentUnit[]): PrintFragmentUnit[][] | null => {
    if (fits(units)) return [units];
    if (units.length < 2) return null;
    const middle = Math.ceil(units.length / 2);
    const first = splitUntilFit(units.slice(0, middle));
    const second = splitUntilFit(units.slice(middle));
    return first && second ? [...first, ...second] : null;
  };

  const fitted = fragments.flatMap((fragment) => {
    const fittedFragment = splitUntilFit(fragment);
    if (fittedFragment) return fittedFragment;
    // A semantic row part was already divided at actual user-authored block
    // boundaries with an intentionally conservative capacity. Its detached
    // candidate can report the height of a hidden table ancestor instead of
    // the real visible row; retain the safe structural fragment rather than
    // falling back to the legacy translated source tree.
    if (fragment.length === 1 && fragment[0].kind === 'table-row-part') return [fragment];
    // A failed hidden-clone measurement must never re-enable the old
    // translated source tree. The units were built with a physical reserve;
    // giving each one an individual page is conservative and deterministic.
    return fragment.map((unit) => [unit]);
  });
  return fitted;
};

/**
 * Recalculate custom-template page ranges in the document that will actually
 * be printed. Preview coordinates cannot be reused here: zoom, font loading
 * and the browser print root can all change the height of a Persian line by a
 * fraction, enough to hide it below a signature band.
 */
export const repaginateStaticCustomPrintDocument = (root: ParentNode = document) => {
  const existingPages = Array.from(root.querySelectorAll<HTMLElement>(CUSTOM_PRINT_PAGE_SELECTOR));
  const firstPage = existingPages[0];
  const firstBody = firstPage?.querySelector<HTMLElement>(BODY_SELECTOR);
  const firstInner = firstPage?.querySelector<HTMLElement>(BODY_INNER_SELECTOR);
  const shell = firstPage?.closest<HTMLElement>('.invoice-custom-print-shell');
  if (!firstPage || !firstBody || !firstInner || !shell) return 0;

  // `annotatePrintFlowHtml` normally removes these already. Do it once more
  // in the final print DOM as a defense for stale/static markup.
  trimTrailingPrintSpacerNodes(firstInner);
  isolateBodySegment(firstPage.querySelector<HTMLElement>(BODY_SEGMENT_SELECTOR));
  const isLetterheadLayout = firstPage.getAttribute('data-print-layout-mode') === 'letterhead';
  const finalBodyHeight = isLetterheadLayout
    ? getStaticBodyHeight(firstPage, firstBody)
    : synchronizeStaticPageLayout(firstPage, firstBody);
  const bodyHeightPx = finalBodyHeight || getStaticBodyHeight(firstPage, firstBody);
  const pageBodyStepPx = getTemplatePageBodyStepPx(bodyHeightPx);
  const initialMaterializedFragments = buildMaterializedPrintFragments(
    firstInner,
    getMaterializedContentCapacityPx(pageBodyStepPx),
  );
  const pageTemplate = firstPage.cloneNode(true) as HTMLElement;
  const materializedFragments = initialMaterializedFragments
    ? fitMaterializedPrintFragments({
        shell,
        pageTemplate,
        fragments: initialMaterializedFragments,
        bodyHeightPx,
      })
    : null;
  const pageRanges = materializedFragments
    ? []
    : (() => {
        const totalHeight = Math.max(firstInner.scrollHeight, firstInner.offsetHeight, firstInner.clientHeight, 1);
        const anchors = collectPrintPageAnchors(firstInner);
        return anchors.length
          ? buildSmartPrintPageRanges({ totalHeight, pageBodyStepPx, anchors })
          : [{ start: 0, end: Math.min(totalHeight, pageBodyStepPx) }];
      })();
  // Rebuild from the synchronized first page. The existing DOM can contain
  // stale preview page counts or dimensions, which must never seed final output.
  existingPages.forEach((page) => page.remove());

  if (materializedFragments) {
    materializedFragments.forEach((fragmentUnits, pageIndex) => {
      const page = pageTemplate.cloneNode(true) as HTMLElement;
      const footer = page.querySelector<HTMLElement>(FOOTER_SELECTOR);
      const counter = page.querySelector<HTMLElement>(PAGE_COUNTER_SELECTOR);
      const fragment = buildPrintFragment(page.ownerDocument, fragmentUnits);

      if (!applyMaterializedBodyFragment({ page, fragment, bodyHeightPx })) return;
      if (footer) footer.style.marginTop = 'auto';
      if (counter) {
        counter.textContent = `صفحه ${toPersianNumber(pageIndex + 1)} از ${toPersianNumber(materializedFragments.length)}`;
      }
      page.style.pageBreakAfter = pageIndex < materializedFragments.length - 1 ? 'always' : 'auto';
      page.style.breakAfter = pageIndex < materializedFragments.length - 1 ? 'page' : 'auto';
      shell.appendChild(page);
    });

    return materializedFragments.length;
  }

  pageRanges.forEach((range, pageIndex) => {
    const page = pageTemplate.cloneNode(true) as HTMLElement;
    const viewport = page.querySelector<HTMLElement>(BODY_VIEWPORT_SELECTOR);
    const segment = page.querySelector<HTMLElement>(BODY_SEGMENT_SELECTOR);
    const footer = page.querySelector<HTMLElement>('.print-template-footer');
    const counter = page.querySelector<HTMLElement>(PAGE_COUNTER_SELECTOR);
    const viewportHeightPx = getPrintBodyViewportHeightPx(
      bodyHeightPx,
      Math.max(1, Math.ceil(range.end - range.start)),
    );

    if (viewport) {
      const viewportHeight = `${viewportHeightPx}px`;
      viewport.style.flex = `0 0 ${viewportHeight}`;
      viewport.style.height = viewportHeight;
      viewport.style.minHeight = '0';
      viewport.style.maxHeight = viewportHeight;
    }
    if (segment) {
      isolateBodySegment(segment);
      segment.style.transform = `translateY(${getPrintBodySegmentTranslationPx(range.start)}px)`;
    }
    if (footer) {
      // Keep the signature/footer at the physical bottom. The available body
      // area is measured above, so this cannot erase a final text line.
      footer.style.marginTop = 'auto';
    }
    if (counter) {
      counter.textContent = `صفحه ${toPersianNumber(pageIndex + 1)} از ${toPersianNumber(pageRanges.length)}`;
    }
    page.style.pageBreakAfter = pageIndex < pageRanges.length - 1 ? 'always' : 'auto';
    page.style.breakAfter = pageIndex < pageRanges.length - 1 ? 'page' : 'auto';
    shell.appendChild(page);
  });

  return pageRanges.length;
};

/**
 * Same-context pagination for the server-side Chromium renderer. This is
 * intentionally standalone because the generated document has no app bundle
 * to import from; it runs after fonts/assets have settled and before the PDF
 * renderer observes the ready flag.
 */
export const getStaticCustomPrintPaginationScript = () => `
  (function () {
    var pageSelector = '${CUSTOM_PRINT_PAGE_SELECTOR}';
    var pages = Array.prototype.slice.call(document.querySelectorAll(pageSelector));
    var firstPage = pages[0];
    if (!firstPage) return;
    var shell = firstPage.closest('.invoice-custom-print-shell');
    var body = firstPage.querySelector('${BODY_SELECTOR}');
    var inner = firstPage.querySelector('${BODY_INNER_SELECTOR}');
    if (!shell || !body || !inner) return;

    var hasVisibleText = function (value) {
      return String(value || '').replace(/[\\s\\u00a0\\u200b-\\u200d\\u2060\\ufeff]+/g, '').length > 0;
    };
    var trimTerminalSpacers = function (container) {
      var removable = function (element) {
        if (!element || element.hasAttribute('data-print-preserve-space')) return false;
        if (element.querySelector('audio,canvas,embed,iframe,img,object,picture,svg,video')) return false;
        if (/(?:^|;)\\s*(?:border(?:-[a-z-]+)?|height|min-height|margin(?:-[a-z-]+)?|padding(?:-[a-z-]+)?)\\s*:/i.test(String(element.getAttribute('style') || ''))) return false;
        return !hasVisibleText(element.textContent);
      };
      var last = container.lastChild;
      while (last && last.nodeType === Node.TEXT_NODE && !hasVisibleText(last.textContent)) {
        var previousText = last.previousSibling;
        last.remove();
        last = previousText;
      }
      while (last && last.nodeType === Node.ELEMENT_NODE && removable(last)) {
        var previous = last.previousSibling;
        last.remove();
        last = previous;
        while (last && last.nodeType === Node.TEXT_NODE && !hasVisibleText(last.textContent)) {
          var previousWhitespace = last.previousSibling;
          last.remove();
          last = previousWhitespace;
        }
      }
      var terminal = container.lastElementChild;
      var terminalTag = String((terminal && terminal.tagName) || '').toLowerCase();
      if (terminal && /^(article|aside|blockquote|div|li|main|section)$/.test(terminalTag)) {
        trimTerminalSpacers(terminal);
      }
    };
    var measuredHeight = function (element) {
      if (!element) return 0;
      var rect = element.getBoundingClientRect();
      var descendantBottom = Array.prototype.slice.call(element.querySelectorAll('*')).reduce(function (maxBottom, child) {
        var childRect = child.getBoundingClientRect();
        return Math.max(maxBottom, childRect.bottom - rect.top);
      }, 0);
      return Math.max(element.scrollHeight || 0, element.offsetHeight || 0, element.clientHeight || 0, Math.ceil(rect.height || 0), Math.ceil(descendantBottom || 0));
    };
    var positiveAttr = function (name) {
      var value = Number(firstPage.getAttribute(name));
      return Number.isFinite(value) && value > 0 ? value : 0;
    };
    var setHeight = function (element, value) {
      if (!element || !Number.isFinite(value) || value <= 0) return;
      var cssHeight = Math.ceil(value) + 'px';
      element.style.flex = '0 0 ' + cssHeight;
      element.style.height = cssHeight;
      element.style.minHeight = cssHeight;
      element.style.maxHeight = cssHeight;
    };
    var edgeGuard = ${PRINT_BODY_EDGE_GUARD_PX};
    var isolateSegment = function (element) {
      if (!element) return;
      element.style.position = 'absolute';
      element.style.top = '0';
      element.style.insetInlineStart = '0';
      element.style.width = '100%';
    };
    trimTerminalSpacers(inner);
    isolateSegment(firstPage.querySelector('${BODY_SEGMENT_SELECTOR}'));
    var isLetterhead = firstPage.getAttribute('data-print-layout-mode') === 'letterhead';
    if (!isLetterhead) {
      var header = firstPage.querySelector('${HEADER_SELECTOR}');
      var footerForLayout = firstPage.querySelector('${FOOTER_SELECTOR}');
      var pageStyle = window.getComputedStyle(firstPage);
      var contentHeight = Math.max(1, firstPage.clientHeight - parseFloat(pageStyle.paddingTop || '0') - parseFloat(pageStyle.paddingBottom || '0'));
      var headerHeight = header ? Math.max(positiveAttr('${CONFIGURED_HEADER_HEIGHT_ATTR}'), measuredHeight(firstPage.querySelector('${HEADER_INNER_SELECTOR}'))) : 0;
      var footerHeight = footerForLayout ? Math.max(
        positiveAttr('${CONFIGURED_FOOTER_HEIGHT_ATTR}') + positiveAttr('${SIGNATURE_HEIGHT_ATTR}') + positiveAttr('${PAGE_COUNTER_HEIGHT_ATTR}'),
        measuredHeight(firstPage.querySelector('${FOOTER_STACK_SELECTOR}'))
      ) : 0;
      var finalBodyHeight = Math.max(1, Math.floor(contentHeight - headerHeight - footerHeight));
      setHeight(header, headerHeight);
      setHeight(footerForLayout, footerHeight);
      setHeight(body, finalBodyHeight);
      if (footerForLayout) footerForLayout.style.marginTop = 'auto';
      firstPage.setAttribute('${BODY_CAPACITY_ATTR}', String(finalBodyHeight));
    }

    var rootRect = inner.getBoundingClientRect();
    var totalHeight = Math.max(inner.scrollHeight || 0, inner.offsetHeight || 0, inner.clientHeight || 0, 1);
    var bodyRect = body.getBoundingClientRect();
    var declaredBodyHeight = Number(firstPage.getAttribute('${BODY_CAPACITY_ATTR}'));
    var bodyHeight = Number.isFinite(declaredBodyHeight) && declaredBodyHeight > 0
      ? declaredBodyHeight
      : Math.max(body.clientHeight || 0, body.offsetHeight || 0, Math.ceil(bodyRect.height || 0));
    var step = Math.max(1, Math.floor(bodyHeight) - edgeGuard * 2);
    var materializedStep = Math.max(80, step - ${MATERIALIZED_FRAGMENT_LAYOUT_RESERVE_PX});

    var relativeBounds = function (element, baseRect) {
      var rect = element.getBoundingClientRect();
      return {
        top: Math.max(0, Math.floor(rect.top - baseRect.top)),
        bottom: Math.max(0, Math.ceil(rect.bottom - baseRect.top))
      };
    };
    var tableRows = function (table) {
      return Array.prototype.slice.call(table.querySelectorAll('tr')).filter(function (row) {
        return row.closest('table') === table && !row.closest('thead');
      });
    };
    var buildMaterializedFragments = function () {
      var sourceRect = inner.getBoundingClientRect();
      var units = [];
      Array.prototype.slice.call(inner.children).forEach(function (element) {
        var bounds = relativeBounds(element, sourceRect);
        if (bounds.bottom <= bounds.top) return;
        if (String(element.tagName || '').toLowerCase() === 'table' && bounds.bottom - bounds.top > materializedStep) {
          var rows = tableRows(element);
          if (rows.length) {
            var tableTop = bounds.top;
            rows.forEach(function (row) {
              var rowBounds = relativeBounds(row, sourceRect);
              if (rowBounds.bottom > rowBounds.top) {
                var rowHeight = rowBounds.bottom - rowBounds.top;
                var rowOffset = Math.max(0, rowBounds.top - tableTop);
                var rowSliceCapacity = Math.max(48, materializedStep - rowOffset - 8);
                if (rowHeight > rowSliceCapacity) {
                  var cells = Array.prototype.slice.call(row.children).filter(function (cell) {
                    var tag = String(cell.tagName || '').toLowerCase();
                    return tag === 'td' || tag === 'th';
                  });
                  var leaderIndex = cells.reduce(function (winner, cell, index) {
                    var length = String(cell.textContent || '').replace(/\s+/g, '').length;
                    var winnerLength = String(cells[winner].textContent || '').replace(/\s+/g, '').length;
                    return length > winnerLength ? index : winner;
                  }, 0);
                  var leaderCell = cells[leaderIndex];
                  var blocks = leaderCell
                    ? Array.prototype.slice.call(leaderCell.children)
                      .map(function (block) {
                        var blockBounds = relativeBounds(block, sourceRect);
                        return { node: block, top: blockBounds.top, bottom: blockBounds.bottom };
                      })
                      .filter(function (block) { return block.bottom > block.top; })
                    : [];
                  var partCapacity = Math.max(48, Math.min(materializedStep - rowOffset - 48, Math.floor(materializedStep * 0.42)));
                  var chunks = [];
                  var currentChunk = [];
                  var currentStart = 0;
                  blocks.forEach(function (block) {
                    if (!currentChunk.length) {
                      currentChunk = [block];
                      currentStart = block.top;
                      return;
                    }
                    if (block.bottom - currentStart > partCapacity) {
                      chunks.push(currentChunk);
                      currentChunk = [block];
                      currentStart = block.top;
                    } else {
                      currentChunk.push(block);
                    }
                  });
                  if (currentChunk.length) chunks.push(currentChunk);
                  var canUseParts = chunks.length >= 2 && !chunks.some(function (chunk) {
                    return chunk.length === 1 && chunk[0].bottom - chunk[0].top > partCapacity;
                  });
                  if (canUseParts) {
                    chunks.forEach(function (chunk, partIndex) {
                      var rowPart = row.cloneNode(true);
                      var partCells = Array.prototype.slice.call(rowPart.children).filter(function (cell) {
                        var tag = String(cell.tagName || '').toLowerCase();
                        return tag === 'td' || tag === 'th';
                      });
                      var partLeader = partCells[leaderIndex];
                      if (partLeader) partLeader.replaceChildren.apply(partLeader, chunk.map(function (block) { return block.node.cloneNode(true); }));
                      if (partIndex > 0) {
                        partCells.forEach(function (cell, index) {
                          if (index !== leaderIndex) cell.replaceChildren();
                        });
                        rowPart.setAttribute('data-print-table-continuation', 'true');
                      }
                      var start = chunk[0].top;
                      var end = chunk[chunk.length - 1].bottom;
                      units.push({
                        top: start,
                        bottom: Math.min(start + partCapacity, Math.max(end, start + 1)),
                        kind: 'table-row-part',
                        node: row,
                        sourceRow: row,
                        rowPart: rowPart,
                        table: element,
                        tableRowOffset: rowOffset
                      });
                    });
                    return;
                  }
                  for (var sliceStart = 0; sliceStart < rowHeight; sliceStart += rowSliceCapacity) {
                    var sliceHeight = Math.min(rowSliceCapacity, rowHeight - sliceStart);
                    units.push({
                      top: rowBounds.top + sliceStart,
                      bottom: rowBounds.top + sliceStart + sliceHeight,
                      kind: 'table-row-slice',
                      node: row,
                      table: element,
                      tableRowOffset: rowOffset,
                      sliceStart: sliceStart,
                      sliceHeight: sliceHeight
                    });
                  }
                  return;
                }
                units.push({ top: rowBounds.top, bottom: rowBounds.bottom, kind: 'table-row', node: row, table: element });
              }
            });
            return;
          }
        }
        units.push({ top: bounds.top, bottom: bounds.bottom, kind: 'node', node: element });
      });
      units.sort(function (left, right) { return left.top - right.top || left.bottom - right.bottom; });
      if (!units.length || units.some(function (unit) { return unit.bottom - unit.top > materializedStep; })) return null;

      var initialInset = Math.max(0, units[0].top);
      var headerHeights = new Map();
      var groups = [];
      var current = [];
      var currentStart = 0;
      units.forEach(function (unit) {
        if (unit.kind === 'table-row-slice' || unit.kind === 'table-row-part') {
          if (current.length) groups.push(current);
          groups.push([unit]);
          current = [];
          currentStart = 0;
          return;
        }
        if (!current.length) {
          current = [unit];
          currentStart = unit.top;
          return;
        }
        var estimatedHeight = unit.bottom - currentStart + initialInset;
        if (unit.kind === 'table-row' && unit.table && !current.some(function (item) { return item.table === unit.table; })) {
          var headerHeight = headerHeights.get(unit.table);
          if (headerHeight === undefined) {
            var firstRow = tableRows(unit.table)[0];
            headerHeight = firstRow
              ? Math.max(0, relativeBounds(firstRow, sourceRect).top - relativeBounds(unit.table, sourceRect).top)
              : 0;
            headerHeights.set(unit.table, headerHeight);
          }
          estimatedHeight += headerHeight;
        }
        if (estimatedHeight > materializedStep) {
          groups.push(current);
          current = [unit];
          currentStart = unit.top;
        } else {
          current.push(unit);
        }
      });
      if (current.length) groups.push(current);
      return groups.length ? groups : null;
    };
    var materialized = buildMaterializedFragments();
    if (materialized) {
      var cloneTableRows = function (table, selectedRows) {
        var clone = table.cloneNode(true);
        var selected = new Set(selectedRows);
        var originalRows = Array.prototype.slice.call(table.querySelectorAll('tr'));
        Array.prototype.slice.call(clone.querySelectorAll('tr')).forEach(function (row, index) {
          var original = originalRows[index];
          if (!original || original.closest('thead') || selected.has(original)) return;
          row.remove();
        });
        return clone;
      };
      var cloneTableRowPart = function (table, unit) {
        var sourceRow = unit.sourceRow || unit.node;
        if (!sourceRow || !unit.rowPart) return null;
        var clone = cloneTableRows(table, [sourceRow]);
        var target = tableRows(clone)[0];
        if (!target) return null;
        target.replaceWith(unit.rowPart.cloneNode(true));
        return clone;
      };
      var applySliceTableStyle = function (table) {
        table.style.position = 'absolute';
        table.style.insetInlineStart = '0';
        table.style.width = '100%';
        table.style.maxWidth = '100%';
        table.style.margin = '0';
        table.style.boxSizing = 'border-box';
      };
      var buildTableRowSlice = function (unit) {
        if (!unit.table || unit.kind !== 'table-row-slice') return null;
        var headerHeight = Math.max(0, Math.ceil(unit.tableRowOffset || 0));
        var sliceStart = Math.max(0, Math.floor(unit.sliceStart || 0));
        var sliceHeight = Math.max(1, Math.ceil(unit.sliceHeight || 0));
        var wrapper = document.createElement('div');
        wrapper.className = 'print-template-table-row-slice';
        wrapper.style.position = 'relative';
        wrapper.style.width = '100%';
        wrapper.style.height = headerHeight + sliceHeight + 'px';
        wrapper.style.overflow = 'hidden';
        wrapper.style.boxSizing = 'border-box';
        wrapper.style.contain = 'layout paint';
        if (headerHeight > 0) {
          var headerViewport = document.createElement('div');
          headerViewport.style.position = 'absolute';
          headerViewport.style.top = '0';
          headerViewport.style.insetInlineStart = '0';
          headerViewport.style.width = '100%';
          headerViewport.style.height = headerHeight + 'px';
          headerViewport.style.overflow = 'hidden';
          headerViewport.style.zIndex = '1';
          headerViewport.style.contain = 'layout paint';
          var headerTable = cloneTableRows(unit.table, [unit.node]);
          applySliceTableStyle(headerTable);
          headerTable.style.top = '0';
          Array.prototype.slice.call(headerTable.querySelectorAll('tbody')).forEach(function (tableBody) {
            tableBody.style.visibility = 'hidden';
          });
          headerViewport.append(headerTable);
          wrapper.append(headerViewport);
        }
        var rowViewport = document.createElement('div');
        rowViewport.style.position = 'absolute';
        rowViewport.style.top = headerHeight + 'px';
        rowViewport.style.insetInlineStart = '0';
        rowViewport.style.width = '100%';
        rowViewport.style.height = sliceHeight + 'px';
        rowViewport.style.overflow = 'hidden';
        rowViewport.style.boxSizing = 'border-box';
        rowViewport.style.contain = 'layout paint';
        var rowTable = cloneTableRows(unit.table, [unit.node]);
        applySliceTableStyle(rowTable);
        rowTable.style.top = '-' + (headerHeight + sliceStart) + 'px';
        rowViewport.append(rowTable);
        wrapper.append(rowViewport);
        return wrapper;
      };
      var buildFragment = function (fragmentUnits) {
        var fragment = document.createDocumentFragment();
        var index = 0;
        while (index < fragmentUnits.length) {
          var unit = fragmentUnits[index];
          if (unit.kind === 'node') {
            fragment.append(unit.node.cloneNode(true));
            index += 1;
            continue;
          }
          if (unit.kind === 'table-row-slice') {
            var slice = buildTableRowSlice(unit);
            if (slice) fragment.append(slice);
            index += 1;
            continue;
          }
          if (unit.kind === 'table-row-part') {
            var tablePart = unit.table ? cloneTableRowPart(unit.table, unit) : null;
            if (tablePart) fragment.append(tablePart);
            index += 1;
            continue;
          }
          var table = unit.table;
          var selectedRows = [];
          while (index < fragmentUnits.length && fragmentUnits[index].kind === 'table-row' && fragmentUnits[index].table === table) {
            selectedRows.push(fragmentUnits[index].node);
            index += 1;
          }
          if (table) fragment.append(cloneTableRows(table, selectedRows));
        }
        return fragment;
      };
      var materializedTemplate = firstPage.cloneNode(true);
      var renderMaterializedFragment = function (page, fragmentUnits) {
        var viewport = page.querySelector('${BODY_VIEWPORT_SELECTOR}');
        var segment = page.querySelector('${BODY_SEGMENT_SELECTOR}');
        var pageInner = page.querySelector('${BODY_INNER_SELECTOR}');
        var height = Math.ceil(bodyHeight) + 'px';
        if (!viewport || !segment || !pageInner) return false;
        viewport.style.flex = '0 0 ' + height;
        viewport.style.height = height;
        viewport.style.minHeight = '0';
        viewport.style.maxHeight = height;
        viewport.style.overflow = 'hidden';
        // Do not use CSS containment after materializing the page. Chromium
        // otherwise has been observed to drop the header/footer of alternate
        // pages around split tables in its PDF print compositor.
        viewport.style.contain = 'none';
        viewport.style.position = 'relative';
        segment.style.position = 'relative';
        segment.style.top = 'auto';
        segment.style.insetInlineStart = 'auto';
        segment.style.width = '100%';
        segment.style.boxSizing = 'border-box';
        segment.style.paddingTop = edgeGuard + 'px';
        segment.style.paddingBottom = edgeGuard + 'px';
        segment.style.transform = 'none';
        pageInner.replaceChildren(buildFragment(fragmentUnits));
        return true;
      };
      // Verify each fragment in a real cloned page. This handles differences
      // caused by font fallback, collapsed margins and table border rounding.
      if (shell.isConnected && shell.clientWidth > 1) {
        var fragmentFits = function (fragmentUnits) {
          var candidate = materializedTemplate.cloneNode(true);
          candidate.style.position = 'absolute';
          candidate.style.top = '0';
          candidate.style.insetInlineStart = '-100000px';
          candidate.style.visibility = 'hidden';
          candidate.style.pointerEvents = 'none';
          candidate.style.pageBreakAfter = 'auto';
          candidate.style.breakAfter = 'auto';
          if (!renderMaterializedFragment(candidate, fragmentUnits)) return false;
          shell.appendChild(candidate);
          var viewport = candidate.querySelector('${BODY_VIEWPORT_SELECTOR}');
          var segment = candidate.querySelector('${BODY_SEGMENT_SELECTOR}');
          var pageInner = candidate.querySelector('${BODY_INNER_SELECTOR}');
          var actualHeight = Math.max(
            (viewport && viewport.scrollHeight) || 0,
            (segment && segment.scrollHeight) || 0,
            ((pageInner && pageInner.scrollHeight) || 0) + edgeGuard * 2
          );
          candidate.remove();
          return actualHeight <= Math.ceil(bodyHeight) + 1;
        };
        var splitUntilFit = function (fragmentUnits) {
          if (fragmentFits(fragmentUnits)) return [fragmentUnits];
          if (fragmentUnits.length < 2) return null;
          var middle = Math.ceil(fragmentUnits.length / 2);
          var first = splitUntilFit(fragmentUnits.slice(0, middle));
          var second = splitUntilFit(fragmentUnits.slice(middle));
          return first && second ? first.concat(second) : null;
        };
        var fitted = materialized.reduce(function (all, fragment) {
          var fittedFragment = splitUntilFit(fragment);
          if (fittedFragment) return all.concat(fittedFragment);
          if (fragment.length === 1 && fragment[0].kind === 'table-row-part') return all.concat([fragment]);
          return all.concat(fragment.map(function (unit) { return [unit]; }));
        }, []);
        materialized = fitted;
      }
      if (materialized) {
        pages.forEach(function (page) { page.remove(); });
        var digitsForFragments = '۰۱۲۳۴۵۶۷۸۹';
        var toFaForFragments = function (value) {
          return String(value).replace(/\\d/g, function (digit) { return digitsForFragments[Number(digit)] || digit; });
        };
        materialized.forEach(function (fragmentUnits, index) {
          var page = materializedTemplate.cloneNode(true);
          var footer = page.querySelector('.print-template-footer');
          var counter = page.querySelector('${PAGE_COUNTER_SELECTOR}');
          if (!renderMaterializedFragment(page, fragmentUnits)) return;
          if (footer) footer.style.marginTop = 'auto';
          if (counter) counter.textContent = 'صفحه ' + toFaForFragments(index + 1) + ' از ' + toFaForFragments(materialized.length);
          page.style.pageBreakAfter = index < materialized.length - 1 ? 'always' : 'auto';
          page.style.breakAfter = index < materialized.length - 1 ? 'page' : 'auto';
          shell.appendChild(page);
        });
        return;
      }
    }

    var rawLines = [];
    var walker = document.createTreeWalker(inner, NodeFilter.SHOW_TEXT);
    var node = walker.nextNode();
    while (node) {
      if (hasVisibleText(node.textContent)) {
        var range = document.createRange();
        range.selectNodeContents(node);
        Array.prototype.forEach.call(range.getClientRects(), function (rect) {
          var top = Math.floor(rect.top - rootRect.top);
          var bottom = Math.ceil(rect.bottom - rootRect.top);
          if (bottom - top >= 2) rawLines.push({ top: top, bottom: bottom });
        });
        range.detach && range.detach();
      }
      node = walker.nextNode();
    }
    rawLines.sort(function (a, b) { return a.top - b.top || a.bottom - b.bottom; });
    var lines = [];
    rawLines.forEach(function (rect) {
      var current = lines[lines.length - 1];
      var overlap = current ? Math.max(0, Math.min(current.bottom, rect.bottom) - Math.max(current.top, rect.top)) : 0;
      var minHeight = current ? Math.min(current.bottom - current.top, rect.bottom - rect.top) : 0;
      var same = current && (overlap / Math.max(1, minHeight) >= 0.6 ||
        Math.abs(rect.top - current.top) <= 3 ||
        Math.abs(rect.bottom - current.bottom) <= 3);
      if (same) {
        current.top = Math.min(current.top, rect.top);
        current.bottom = Math.max(current.bottom, rect.bottom);
      } else {
        lines.push({ top: rect.top, bottom: rect.bottom });
      }
    });
    if (!lines.length) {
      lines.push({ top: 0, bottom: Math.min(totalHeight, step) });
    }

    var ranges = [];
    var start = 0;
    while (start + step < totalHeight - 1) {
      var target = Math.min(totalHeight, start + step);
      var candidates = lines.filter(function (line) { return line.bottom > start + 48 && line.bottom <= target; });
      var end = candidates.length ? candidates[candidates.length - 1].bottom : 0;
      if (!end) {
        // A large title, rich-text paragraph line or table-cell line can
        // cross the target without having a bottom inside it. Stop before
        // that exact line; never fall back to a cut through its glyphs.
        var crossing = lines.find(function (line) {
          return line.top > start + 1 && line.top < target && line.bottom > target;
        });
        if (crossing) {
          end = crossing.top;
        } else {
          var tops = lines.filter(function (line) { return line.top > start + 48 && line.top < target; });
          end = tops.length ? tops[tops.length - 1].top : target;
        }
      }
      end = Math.max(start + 1, Math.min(totalHeight, Math.ceil(end)));
      ranges.push({ start: start, end: end });
      // Skip only the whitespace after a completed line. Starting at the
      // preceding end can still expose a fractional glyph in Chrome's print
      // compositor; starting at the next line top cannot duplicate it.
      var next = lines.find(function (line) { return line.top >= end; });
      start = next ? Math.max(0, Math.floor(next.top)) : totalHeight;
      if (start >= totalHeight - 1) break;
    }
    if (start < totalHeight) ranges.push({ start: start, end: totalHeight });
    if (!ranges.length) return;

    var template = firstPage.cloneNode(true);
    pages.forEach(function (page) { page.remove(); });
    var digits = '۰۱۲۳۴۵۶۷۸۹';
    var fa = function (value) { return String(value).replace(/\\d/g, function (digit) { return digits[Number(digit)] || digit; }); };
    ranges.forEach(function (item, index) {
      var page = template.cloneNode(true);
      var viewport = page.querySelector('${BODY_VIEWPORT_SELECTOR}');
      var segment = page.querySelector('${BODY_SEGMENT_SELECTOR}');
      var footer = page.querySelector('.print-template-footer');
      var counter = page.querySelector('${PAGE_COUNTER_SELECTOR}');
      var height = Math.min(bodyHeight, Math.max(1, Math.ceil(item.end - item.start) + edgeGuard * 2)) + 'px';
      if (viewport) {
        viewport.style.flex = '0 0 ' + height;
        viewport.style.height = height;
        viewport.style.minHeight = '0';
        viewport.style.maxHeight = height;
      }
      if (segment) {
        isolateSegment(segment);
        segment.style.transform = 'translateY(' + (edgeGuard - Math.max(0, item.start)) + 'px)';
      }
      if (footer) footer.style.marginTop = 'auto';
      if (counter) counter.textContent = 'صفحه ' + fa(index + 1) + ' از ' + fa(ranges.length);
      page.style.pageBreakAfter = index < ranges.length - 1 ? 'always' : 'auto';
      page.style.breakAfter = index < ranges.length - 1 ? 'page' : 'auto';
      shell.appendChild(page);
    });
  })();
`;
