export type PrintFlowPriority = 'normal' | 'high';

export interface PrintPageAnchor {
  top: number;
  bottom: number;
  priority: PrintFlowPriority;
  source?: 'block' | 'line';
}

export const PRINT_FLOW_BLOCK_ATTR = 'data-print-flow-block';

const ROOT_BLOCK_TAGS = new Set([
  'article',
  'aside',
  'blockquote',
  'div',
  'hr',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul',
]);

const TEXT_BLOCK_SELECTOR = 'p, li, blockquote, pre, h1, h2, h3, h4, h5, h6, hr';
const TABLE_BLOCK_SELECTOR = 'table, thead, tbody, tfoot, tr';
const MEDIA_BLOCK_SELECTOR = 'img, svg, canvas, figure, picture';
const MANUAL_KEEP_SELECTOR = '[style*="page-break-inside: avoid"], [style*="page-break-before: avoid"], [style*="break-inside: avoid"]';
const MIN_ANCHOR_HEIGHT_PX = 4;
const MIN_LINE_ANCHOR_HEIGHT_PX = 2;
const MAX_LINE_ANCHORS = 5000;
const DEFAULT_MIN_PAGE_FILL_RATIO = 0.55;
const DEFAULT_HARD_KEEP_FILL_RATIO = 0.35;

const roundPx = (value: number) => Math.max(0, Math.round(value));

const markPrintFlowElement = (
  element: Element,
  priority: PrintFlowPriority,
  role?: string
) => {
  const currentPriority = String(element.getAttribute(PRINT_FLOW_BLOCK_ATTR) || '').trim() as PrintFlowPriority | '';
  if (!currentPriority || (currentPriority !== 'high' && priority === 'high')) {
    element.setAttribute(PRINT_FLOW_BLOCK_ATTR, priority);
  }
  if (role && !element.hasAttribute('data-print-flow-role')) {
    element.setAttribute('data-print-flow-role', role);
  }
};

const getElementPriority = (element: Element): PrintFlowPriority => {
  const tagName = String(element.tagName || '').toLowerCase();
  if (['table', 'thead', 'tbody', 'tfoot', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'img', 'svg', 'canvas', 'figure', 'picture'].includes(tagName)) {
    return 'high';
  }

  const roleHints = [
    element.getAttribute('class'),
    element.getAttribute('data-print-flow-role'),
    element.getAttribute('data-role'),
    element.getAttribute('data-type'),
    element.getAttribute('style'),
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

  if (/(signature|signatory|stamp|seal|footer|header|heading|title|summary)/.test(roleHints)) {
    return 'high';
  }

  return 'normal';
};

export const annotatePrintFlowHtml = (html: string) => {
  if (typeof window === 'undefined' || !html) return html;

  const parser = new window.DOMParser();
  const doc = parser.parseFromString(`<div id="print-flow-root">${html}</div>`, 'text/html');
  const root = doc.getElementById('print-flow-root');
  if (!root) return html;

  Array.from(root.children || []).forEach((child) => {
    const tagName = String(child.tagName || '').toLowerCase();
    if (!ROOT_BLOCK_TAGS.has(tagName)) return;
    markPrintFlowElement(child, getElementPriority(child), 'root-block');
  });

  root.querySelectorAll(TEXT_BLOCK_SELECTOR).forEach((element) => {
    markPrintFlowElement(element, getElementPriority(element), 'text-block');
  });

  root.querySelectorAll(TABLE_BLOCK_SELECTOR).forEach((element) => {
    markPrintFlowElement(element, getElementPriority(element), 'table-block');
  });
  root.querySelectorAll(MEDIA_BLOCK_SELECTOR).forEach((element) => {
    markPrintFlowElement(element, 'high', 'media-block');
  });

  root.querySelectorAll(MANUAL_KEEP_SELECTOR).forEach((element) => {
    markPrintFlowElement(element, 'high', 'manual-keep');
  });

  Array.from(root.querySelectorAll('*')).forEach((element) => {
    const hint = [
      element.getAttribute('class'),
      element.getAttribute('data-print-flow-role'),
      element.getAttribute('data-role'),
      element.getAttribute('data-type'),
    ]
      .map((value) => String(value || '').toLowerCase())
      .join(' ');
    if (/(signature|signatory|stamp|seal|footer|header|heading|title|summary)/.test(hint)) {
      markPrintFlowElement(element, 'high', 'semantic-block');
    }
  });

  return root.innerHTML;
};

export const collectPrintPageAnchors = (root: HTMLElement): PrintPageAnchor[] => {
  const rootRect = root.getBoundingClientRect();
  const deduped = new Map<string, PrintPageAnchor>();

  Array.from(root.querySelectorAll(`[${PRINT_FLOW_BLOCK_ATTR}]`)).forEach((element) => {
    const rect = (element as HTMLElement).getBoundingClientRect();
    if (!Number.isFinite(rect.top) || !Number.isFinite(rect.bottom)) return;
    if (rect.height < MIN_ANCHOR_HEIGHT_PX) return;

    const top = roundPx(rect.top - rootRect.top);
    const bottom = roundPx(rect.bottom - rootRect.top);
    if (bottom - top < MIN_ANCHOR_HEIGHT_PX) return;

    const priority = String(element.getAttribute(PRINT_FLOW_BLOCK_ATTR) || '').trim() === 'high'
      ? 'high'
      : 'normal';
    const key = `${top}:${bottom}`;
    const existing = deduped.get(key);

    if (!existing || (existing.priority !== 'high' && priority === 'high')) {
      deduped.set(key, { top, bottom, priority, source: 'block' });
    }
  });

  // Fallback: capture per-line rects from text nodes so long plain-text containers
  // can still break safely at line boundaries.
  let lineAnchorCount = 0;
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();
  while (currentNode && lineAnchorCount < MAX_LINE_ANCHORS) {
    const textContent = String(currentNode.textContent || '');
    if (textContent.trim()) {
      const range = doc.createRange();
      range.selectNodeContents(currentNode);
      const rects = Array.from(range.getClientRects());
      rects.forEach((rect) => {
        if (lineAnchorCount >= MAX_LINE_ANCHORS) return;
        if (!Number.isFinite(rect.top) || !Number.isFinite(rect.bottom)) return;
        if (rect.height < MIN_LINE_ANCHOR_HEIGHT_PX) return;
        const top = roundPx(rect.top - rootRect.top);
        const bottom = roundPx(rect.bottom - rootRect.top);
        if (bottom - top < MIN_LINE_ANCHOR_HEIGHT_PX) return;
        const key = `${top}:${bottom}`;
        if (!deduped.has(key)) {
          deduped.set(key, { top, bottom, priority: 'normal', source: 'line' });
          lineAnchorCount += 1;
        }
      });
      range.detach?.();
    }
    currentNode = walker.nextNode();
  }

  return Array.from(deduped.values()).sort((left, right) => {
    if (left.top !== right.top) return left.top - right.top;
    return left.bottom - right.bottom;
  });
};

export const buildSmartPrintPageOffsets = ({
  totalHeight,
  pageBodyStepPx,
  anchors,
  minPageFillRatio = DEFAULT_MIN_PAGE_FILL_RATIO,
  hardKeepFillRatio = DEFAULT_HARD_KEEP_FILL_RATIO,
}: {
  totalHeight: number;
  pageBodyStepPx: number;
  anchors: PrintPageAnchor[];
  minPageFillRatio?: number;
  hardKeepFillRatio?: number;
}) => {
  const safeTotalHeight = Math.max(1, roundPx(totalHeight));
  const safeStep = Math.max(80, roundPx(pageBodyStepPx));
  if (safeTotalHeight <= safeStep) return [0];

  const minFill = Math.max(72, roundPx(safeStep * minPageFillRatio));
  const minHardFill = Math.max(48, roundPx(safeStep * hardKeepFillRatio));
  const sortedAnchors = (anchors || [])
    .filter((anchor) => Number.isFinite(anchor.top) && Number.isFinite(anchor.bottom) && anchor.bottom > anchor.top)
    .sort((left, right) => {
      if (left.top !== right.top) return left.top - right.top;
      return left.bottom - right.bottom;
    });
  const blockAnchors = sortedAnchors.filter((anchor) => anchor.source !== 'line');
  const lineAnchors = sortedAnchors.filter((anchor) => anchor.source === 'line');

  const pageOffsets = [0];
  let currentOffset = 0;
  let guard = 0;

  while (currentOffset + safeStep < safeTotalHeight - 1 && guard < 500) {
    guard += 1;
    const targetBreak = Math.min(safeTotalHeight, currentOffset + safeStep);

    const highBottomBlockCandidates = blockAnchors
      .filter((anchor) => anchor.priority === 'high')
      .map((anchor) => anchor.bottom)
      .filter((bottom) => bottom > currentOffset + minFill && bottom <= targetBreak + 1);
    const bottomBlockCandidates = blockAnchors
      .map((anchor) => anchor.bottom)
      .filter((bottom) => bottom > currentOffset + minFill && bottom <= targetBreak + 1);
    let nextOffset = highBottomBlockCandidates.length > 0
      ? Math.max(...highBottomBlockCandidates)
      : bottomBlockCandidates.length > 0
        ? Math.max(...bottomBlockCandidates)
        : 0;

    if (!nextOffset) {
      const hardTopCandidates = blockAnchors
        .filter((anchor) => anchor.priority === 'high')
        .map((anchor) => anchor.top)
        .filter((top) => top > currentOffset + minHardFill && top < targetBreak - 1);
      nextOffset = hardTopCandidates.length > 0 ? Math.max(...hardTopCandidates) : 0;
    }

    if (!nextOffset) {
      const softTopCandidates = blockAnchors
        .map((anchor) => anchor.top)
        .filter((top) => top > currentOffset + minFill && top < targetBreak - 1);
      nextOffset = softTopCandidates.length > 0 ? Math.max(...softTopCandidates) : 0;
    }

    if (!nextOffset) {
      const lineBottomCandidates = lineAnchors
        .map((anchor) => anchor.bottom)
        .filter((bottom) => bottom > currentOffset + minFill && bottom <= targetBreak + 1);
      nextOffset = lineBottomCandidates.length > 0 ? Math.max(...lineBottomCandidates) : 0;
    }

    if (!nextOffset) {
      const lineTopCandidates = lineAnchors
        .map((anchor) => anchor.top)
        .filter((top) => top > currentOffset + minHardFill && top < targetBreak - 1);
      nextOffset = lineTopCandidates.length > 0 ? Math.max(...lineTopCandidates) : 0;
    }

    if (!nextOffset) {
      nextOffset = targetBreak;
    }

    nextOffset = Math.min(safeTotalHeight, Math.max(currentOffset + 1, roundPx(nextOffset)));
    if (nextOffset <= currentOffset) {
      nextOffset = Math.min(safeTotalHeight, currentOffset + safeStep);
    }
    if (nextOffset >= safeTotalHeight - 1) {
      break;
    }

    pageOffsets.push(nextOffset);
    currentOffset = nextOffset;
  }

  return pageOffsets;
};
