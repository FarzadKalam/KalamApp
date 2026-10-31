/** Materialize rich text as complete rendered lines, retaining inline markup. */
export const splitPrintTextBlock = (element: HTMLElement, capacity: number, rootTop: number) => {
  if (element.querySelector('table,img,svg,canvas,iframe,video')) return null;
  if (typeof element.ownerDocument.createRange().getBoundingClientRect !== 'function') return null;
  const textNodes: Array<{ node: Node; start: number; end: number }> = [];
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let length = 0;
  let textNode = walker.nextNode();
  while (textNode) {
    const size = textNode.textContent?.length || 0;
    if (size) { textNodes.push({ node: textNode, start: length, end: length + size }); length += size; }
    textNode = walker.nextNode();
  }
  if (!length) return null;
  const boundary = (offset: number) => {
    let low = 0; let high = textNodes.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (offset <= textNodes[middle].end) high = middle;
      else low = middle + 1;
    }
    const entry = textNodes[low];
    return { node: entry.node, offset: Math.max(0, offset - entry.start) };
  };
  const characterRect = (offset: number) => {
    const point = boundary(offset + 1);
    const range = element.ownerDocument.createRange();
    range.setStart(point.node, Math.max(0, point.offset - 1));
    range.setEnd(point.node, point.offset);
    return range.getBoundingClientRect();
  };
  const parts: Array<{ node: HTMLElement; top: number; bottom: number }> = [];
  let start = 0;
  while (start < length) {
    const firstRect = characterRect(start);
    let low = start + 1;
    let high = length;
    let end = start;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const rect = characterRect(middle - 1);
      if (rect.top < firstRect.bottom && rect.bottom - firstRect.top <= Math.max(1, capacity - 8)) { end = middle; low = middle + 1; }
      else high = middle - 1;
    }
    if (end <= start) return null;
    const from = boundary(start);
    const to = boundary(end);
    const range = element.ownerDocument.createRange();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    const clone = element.cloneNode(false) as HTMLElement;
    let fragment: Node = range.cloneContents();
    let ancestor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer as HTMLElement
      : range.commonAncestorContainer.parentElement;
    while (ancestor && ancestor !== element) {
      const wrapper = ancestor.cloneNode(false) as HTMLElement;
      wrapper.append(fragment);
      fragment = wrapper;
      ancestor = ancestor.parentElement;
    }
    clone.append(fragment);
    clone.style.marginTop = '0';
    clone.style.marginBottom = '0';
    while (clone.firstChild?.nodeType === Node.TEXT_NODE && !clone.firstChild.textContent) clone.firstChild.remove();
    while (clone.firstElementChild && clone.firstChild === clone.firstElementChild && /^(SPAN|STRONG|B|I|EM|A|S|U)$/.test(clone.firstElementChild.tagName) && !clone.firstElementChild.textContent && !clone.firstElementChild.querySelector('img,svg,canvas')) clone.firstElementChild.remove();
    if (clone.firstElementChild?.tagName === 'BR' && clone.firstChild === clone.firstElementChild) clone.firstElementChild.remove();
    // A terminal BR belongs to the source line boundary, not an extra blank
    // line in the detached fragment.
    while (clone.lastElementChild?.tagName === 'BR' && clone.lastChild === clone.lastElementChild) clone.lastElementChild.remove();
    parts.push({ node: clone, top: Math.floor(firstRect.top - rootTop), bottom: Math.ceil(characterRect(end - 1).bottom - rootTop) });
    start = end;
  }
  return parts;
};
