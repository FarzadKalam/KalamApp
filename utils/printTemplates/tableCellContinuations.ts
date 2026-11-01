import { getSafeTableRowSlices } from './tableRowSlices';

export type PrintCellSlice = { start: number; height: number; padding?: string; sourceHeight?: number };

/** Paginate parallel cells independently: their text baselines need not align. */
export const getTableCellContinuations = (
  row: HTMLElement,
  capacity: number,
  sliceLines: typeof getSafeTableRowSlices,
) => {
  const cells = Array.from(row.children).filter((cell) => /^(TD|TH)$/.test(cell.tagName)) as HTMLElement[];
  if (!cells.length || row.querySelector('img,svg,canvas,iframe,video')) return null;
  const continuations = cells.map((cell) => {
    const rect = cell.getBoundingClientRect();
    let contentBottom = 0;
    const walker = cell.ownerDocument.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (node.textContent?.trim()) {
        const range = cell.ownerDocument.createRange(); range.selectNodeContents(node);
        if (typeof range.getClientRects === 'function') Array.from(range.getClientRects()).forEach((band) => {
          if (band.height > 1) contentBottom = Math.max(contentBottom, band.bottom - rect.top);
        });
      }
      node = walker.nextNode();
    }
    cell.querySelectorAll('table tr').forEach((nested) => {
      contentBottom = Math.max(contentBottom, nested.getBoundingClientRect().bottom - rect.top);
    });
    if (!contentBottom) return [];
    const cellStyle = cell.ownerDocument.defaultView?.getComputedStyle(cell);
    const padding = parseFloat(cellStyle?.paddingBottom || '0') || 0;
    const end = Math.min(rect.height, Math.ceil(contentBottom + padding + 1));
    return sliceLines(cell, capacity, true, 2)
      .filter((slice) => slice.start < end)
      .map((slice) => ({ start: slice.start, height: Math.min(slice.height, end - slice.start), padding: cellStyle?.padding || '0', sourceHeight: rect.height }));
  });
  const count = Math.max(0, ...continuations.map((slices) => slices.length));
  if (count < 2) return null;
  return Array.from({ length: count }, (_, index) => continuations.map((slices) =>
    slices[index] || { start: slices.length ? slices[slices.length - 1].start + slices[slices.length - 1].height : 0, height: 0 },
  ));
};

/** A real table row whose cells each show only their own complete lines/rows. */
export const buildTableCellContinuation = (row: HTMLElement, clone: HTMLTableElement, slices: PrintCellSlice[]) => {
  const sourceCells = Array.from(row.children) as HTMLElement[];
  const targetRow = Array.from(clone.querySelectorAll('tr')).find((candidate) => candidate.closest('table') === clone && !candidate.closest('thead'));
  if (!targetRow) return clone;
  Array.from(targetRow.children).forEach((element, index) => {
    const cell = element as HTMLElement;
    const source = sourceCells[index];
    const slice = slices[index];
    const viewport = source.ownerDocument.createElement('div');
    viewport.style.cssText = 'position:relative;overflow:hidden;contain:layout paint;width:100%;box-sizing:border-box;';
    viewport.style.height = Math.max(0, slice?.height || 0) + 'px';
    const content = source.ownerDocument.createElement('div');
    content.style.cssText = 'position:absolute;left:0;width:100%;box-sizing:border-box;';
    content.style.top = '-' + Math.max(0, slice?.start || 0) + 'px';
    // The source page is detached before final pages are assembled. Capture
    // geometry/styles during measurement instead of re-reading detached DOM.
    content.style.padding = slice?.padding || '0';
    content.style.minHeight = (slice?.sourceHeight || 0) + 'px';
    content.append(...Array.from(source.childNodes, (node) => node.cloneNode(true)));
    viewport.append(content);
    cell.replaceChildren(viewport);
    cell.style.padding = '0'; cell.style.verticalAlign = 'top'; cell.style.height = 'auto'; cell.style.minHeight = '0';
  });
  return clone;
};
