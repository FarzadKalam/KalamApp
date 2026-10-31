/** Fill each page with the largest measured prefix, preserving every item. */
export const packPrintFragments = <T>(items: T[], fits: (candidate: T[]) => boolean): T[][] | null => {
  const pages: T[][] = [];
  let offset = 0;
  while (offset < items.length) {
    const remaining = items.length - offset;
    if (!fits(items.slice(offset, offset + 1))) return null;
    let count = 1;
    let high = remaining;
    // Probe bounded prefixes rather than cloning all remaining rows for every
    // page. Large reports therefore cost roughly one page of DOM per probe.
    while (count < remaining) {
      const next = Math.min(remaining, count * 2);
      if (!fits(items.slice(offset, offset + next))) { high = next - 1; break; }
      count = next;
    }
    let low = count + 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (fits(items.slice(offset, offset + middle))) { count = middle; low = middle + 1; }
      else high = middle - 1;
    }
    pages.push(items.slice(offset, offset + count));
    offset += count;
  }
  return pages;
};
