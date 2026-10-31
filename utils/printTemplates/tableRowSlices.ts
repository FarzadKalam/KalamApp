/** Choose row continuation cuts in the gaps between real rendered text lines. */
export const getSafeTableRowSlices = (row: HTMLElement, capacity: number) => {
  const rowRect = row.getBoundingClientRect();
  const height = Math.max(1, Math.ceil(rowRect.height));
  const bands: Array<{ top: number; bottom: number }> = [];
  const walker = row.ownerDocument.createTreeWalker(row, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (String(node.textContent || '').trim()) {
      const range = row.ownerDocument.createRange();
      range.selectNodeContents(node);
      Array.from(range.getClientRects()).forEach((rect) => {
        if (rect.height > 1) bands.push({ top: rect.top - rowRect.top, bottom: rect.bottom - rowRect.top });
      });
    }
    node = walker.nextNode();
  }
  bands.sort((a, b) => a.top - b.top || a.bottom - b.bottom);
  const merged: typeof bands = [];
  bands.forEach((band) => {
    const previous = merged[merged.length - 1];
    if (previous && band.top < previous.bottom) previous.bottom = Math.max(previous.bottom, band.bottom);
    else merged.push({ ...band });
  });
  const slices: Array<{ start: number; height: number }> = [];
  let start = 0;
  while (start < height) {
    let end = Math.min(height, start + Math.max(1, Math.floor(capacity)));
    const crossing = merged.find((band) => band.top < end && band.bottom > end);
    if (crossing && Math.floor(crossing.top) > start) end = Math.floor(crossing.top);
    slices.push({ start, height: end - start });
    start = end;
  }
  return slices;
};
