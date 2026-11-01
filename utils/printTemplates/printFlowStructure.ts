/** Find flowing leaves without losing the styling of their enclosing sections. */
export const collectPrintFlowLeaves = (root: HTMLElement): HTMLElement[] => {
  const leaves: HTMLElement[] = [];
  const visit = (element: HTMLElement) => {
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    const container = /^(DIV|SECTION|ARTICLE|MAIN)$/.test(element.tagName);
    const column = style?.display !== 'grid' && (!style?.display.includes('flex') || style.flexDirection === 'column');
    const positioned = style?.position === 'absolute' || style?.position === 'fixed';
    if (container && column && !positioned && !element.hasAttribute('data-print-preserve-space') && !element.hasAttribute('data-print-keep-together') && element.querySelector('table,p,section,article,div,ul,ol')) {
      Array.from(element.childNodes).forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
          const span = element.ownerDocument.createElement('span');
          node.replaceWith(span); span.append(node);
        }
      });
      Array.from(element.children).forEach((child) => visit(child as HTMLElement));
    } else leaves.push(element);
  };
  Array.from(root.children).forEach((child) => visit(child as HTMLElement));
  return leaves;
};

/** Rebuild only the ancestors needed by this page, reusing sibling wrappers. */
export const createPrintFragmentAppender = (documentRef: Document, root: HTMLElement | null, fragment: DocumentFragment) => {
  const wrappers = new Map<HTMLElement, HTMLElement>();
  return (source: HTMLElement, content: Node) => {
    const chain: HTMLElement[] = [];
    let parent = source.parentElement;
    while (parent && parent !== root) { chain.unshift(parent); parent = parent.parentElement; }
    if (!root || parent !== root) { fragment.append(content); return; }
    let target: HTMLElement | DocumentFragment = fragment;
    chain.forEach((ancestor) => {
      let clone = wrappers.get(ancestor);
      if (!clone) {
        clone = documentRef.importNode(ancestor, false) as HTMLElement;
        clone.style.height = 'auto'; clone.style.minHeight = '0'; clone.style.maxHeight = 'none';
        clone.style.breakInside = 'auto'; clone.style.pageBreakInside = 'auto';
        target.append(clone); wrappers.set(ancestor, clone);
      }
      target = clone;
    });
    target.append(content);
  };
};
