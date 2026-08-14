export type PrintFlowPriority = 'normal' | 'high';

export interface PrintPageAnchor {
  top: number;
  bottom: number;
  priority: PrintFlowPriority;
  source?: 'block' | 'line';
}

/**
 * A physical print page is a source interval, not a single shared offset.
 *
 * `end` is chosen after the last complete line on a page and `start` is
 * chosen just before the first complete line on the next page.  Treating
 * those values as one shared number is tempting, but sub-pixel text metrics
 * let a renderer paint a glyph across that shared edge and crop half of it.
 */
export interface PrintPageRange {
  start: number;
  end: number;
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
const HIGH_PRIORITY_BLOCK_TAGS = new Set([
  'canvas',
  'figure',
  'img',
  'picture',
  'svg',
]);

const TEXT_BLOCK_SELECTOR = 'p, li, blockquote, pre, h1, h2, h3, h4, h5, h6, hr';
const TABLE_CONTAINER_SELECTOR = 'table, tbody';
const TABLE_ROW_SELECTOR = 'thead, tfoot, tr';
const MEDIA_BLOCK_SELECTOR = 'img, svg, canvas, figure, picture';
const MANUAL_KEEP_SELECTOR = '[style*="page-break-inside: avoid"], [style*="page-break-before: avoid"], [style*="break-inside: avoid"]';
const MIN_ANCHOR_HEIGHT_PX = 4;
const MIN_LINE_ANCHOR_HEIGHT_PX = 2;
const MAX_LINE_ANCHORS = 5000;
const LINE_BAND_MERGE_TOLERANCE_PX = 3;
const MIN_SAME_LINE_OVERLAP_RATIO = 0.6;
const LINE_TOP_SNAP_LOOKBACK_PX = 180;
const DEFAULT_MIN_PAGE_FILL_RATIO = 0.55;
const DEFAULT_HARD_KEEP_FILL_RATIO = 0.35;
const OVERSIZED_KEEP_BLOCK_TOLERANCE_PX = 8;
const INVISIBLE_PRINT_TEXT_PATTERN = /[\s\u00a0\u200b-\u200d\u2060\ufeff]+/g;
const TERMINAL_PRINT_CONTAINER_TAGS = new Set(['article', 'aside', 'blockquote', 'div', 'li', 'main', 'section']);
const PRINT_MEDIA_CONTENT_SELECTOR = 'audio, canvas, embed, iframe, img, object, picture, svg, video';
const EXPLICIT_SPACER_STYLE_PATTERN = /(?:^|;)\s*(?:border(?:-[a-z-]+)?|height|min-height|margin(?:-[a-z-]+)?|padding(?:-[a-z-]+)?)\s*:/i;

const roundPx = (value: number) => Math.max(0, Math.round(value));
const floorPx = (value: number) => Math.max(0, Math.floor(value));
const ceilPx = (value: number) => Math.max(0, Math.ceil(value));

const hasVisiblePrintText = (value: unknown) =>
  String(value || '').replace(INVISIBLE_PRINT_TEXT_PATTERN, '').length > 0;

const isRemovableTerminalPrintSpacer = (element: Element) => {
  if (element.hasAttribute('data-print-preserve-space')) return false;
  if (element.querySelector(PRINT_MEDIA_CONTENT_SELECTOR)) return false;
  if (EXPLICIT_SPACER_STYLE_PATTERN.test(String(element.getAttribute('style') || ''))) return false;
  return !hasVisiblePrintText(element.textContent);
};

/**
 * Rich-text editors can leave terminal paragraphs containing only ZWNJ/ZWSP
 * characters. They paint as blank lines but are still real DOM text, which
 * used to create a final blank page (and push the true final line out of its
 * page range). Remove only terminal, visually-empty blocks at print time.
 * `data-print-preserve-space` is an explicit opt-out for a deliberately sized
 * blank area.
 */
export const trimTrailingPrintSpacerNodes = (container: Element) => {
  let changed = false;
  let lastNode = container.lastChild;

  while (lastNode && lastNode.nodeType === Node.TEXT_NODE && !hasVisiblePrintText(lastNode.textContent)) {
    const previous = lastNode.previousSibling;
    lastNode.remove();
    changed = true;
    lastNode = previous;
  }

  while (lastNode && lastNode.nodeType === Node.ELEMENT_NODE) {
    const lastElement = lastNode as Element;
    if (!isRemovableTerminalPrintSpacer(lastElement)) break;
    const previous = lastElement.previousSibling;
    lastElement.remove();
    changed = true;
    lastNode = previous;
    while (lastNode && lastNode.nodeType === Node.TEXT_NODE && !hasVisiblePrintText(lastNode.textContent)) {
      const previousText = lastNode.previousSibling;
      lastNode.remove();
      lastNode = previousText;
    }
  }

  const terminalElement = container.lastElementChild;
  const tagName = String(terminalElement?.tagName || '').toLowerCase();
  if (terminalElement && TERMINAL_PRINT_CONTAINER_TAGS.has(tagName)) {
    changed = trimTrailingPrintSpacerNodes(terminalElement) || changed;
  }

  return changed;
};

// DOM line and row rectangles are frequently fractional. A normal round can
// move a measured lower edge upward, which crops the final fraction of a line
// when that value becomes a viewport boundary. Keep the start conservative
// and the end inclusive instead: at most one blank physical pixel is added,
// never a clipped glyph or table border.
export const getSafePrintAnchorBounds = (top: number, bottom: number) => ({
  top: floorPx(top),
  bottom: ceilPx(bottom),
});

/**
 * The print preview is intentionally zoomed. `getBoundingClientRect()` then
 * reports the visual (scaled) coordinates while scroll/offset dimensions stay
 * in the document's print coordinates.  Page offsets must always use the
 * latter, otherwise a line/table anchor is compared with a body height from
 * two different coordinate spaces.
 */
export const getPrintMeasurementScale = ({
  logicalWidth,
  logicalHeight,
  renderedWidth,
  renderedHeight,
}: {
  logicalWidth: number;
  logicalHeight: number;
  renderedWidth: number;
  renderedHeight: number;
}) => {
  const resolveScale = (logicalSize: number, renderedSize: number) => {
    if (!Number.isFinite(logicalSize) || !Number.isFinite(renderedSize)) return 1;
    if (logicalSize <= 0 || renderedSize <= 0) return 1;
    const scale = logicalSize / renderedSize;
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  };

  return {
    x: resolveScale(logicalWidth, renderedWidth),
    y: resolveScale(logicalHeight, renderedHeight),
  };
};

const hasHardKeepSemanticHint = (element: Element) => {
  const hints = [
    element.getAttribute('class'),
    element.getAttribute('data-print-flow-role'),
    element.getAttribute('data-role'),
    element.getAttribute('data-type'),
    element.getAttribute('style'),
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
  return /(signature|signatory|stamp|seal)/.test(hints);
};

const isFragmentableTableContainer = (element: Element) => {
  const tagName = String(element.tagName || '').toLowerCase();
  return tagName === 'table' || tagName === 'tbody';
};

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
  if (HIGH_PRIORITY_BLOCK_TAGS.has(tagName)) {
    return 'high';
  }

  if (hasHardKeepSemanticHint(element)) {
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
  trimTrailingPrintSpacerNodes(root);

  Array.from(root.children || []).forEach((child) => {
    const tagName = String(child.tagName || '').toLowerCase();
    if (!ROOT_BLOCK_TAGS.has(tagName)) return;
    if (isFragmentableTableContainer(child)) return;
    markPrintFlowElement(child, getElementPriority(child), 'root-block');
  });

  root.querySelectorAll(TEXT_BLOCK_SELECTOR).forEach((element) => {
    markPrintFlowElement(element, getElementPriority(element), 'text-block');
  });

  root.querySelectorAll(TABLE_CONTAINER_SELECTOR).forEach((element) => {
    markPrintFlowElement(element, 'normal', 'table-container');
  });
  root.querySelectorAll(TABLE_ROW_SELECTOR).forEach((element) => {
    markPrintFlowElement(element, 'normal', 'table-row');
  });
  root.querySelectorAll(MEDIA_BLOCK_SELECTOR).forEach((element) => {
    markPrintFlowElement(element, 'high', 'media-block');
  });

  root.querySelectorAll(MANUAL_KEEP_SELECTOR).forEach((element) => {
    if (isFragmentableTableContainer(element)) return;
    if (getElementPriority(element) === 'high') {
      markPrintFlowElement(element, 'high', 'manual-keep');
    }
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
    if (/(signature|signatory|stamp|seal)/.test(hint)) {
      if (isFragmentableTableContainer(element)) return;
      markPrintFlowElement(element, 'high', 'semantic-block');
    }
  });

  return root.innerHTML;
};

export const collectPrintPageAnchors = (root: HTMLElement): PrintPageAnchor[] => {
  const rootRect = root.getBoundingClientRect();
  const measurementScale = getPrintMeasurementScale({
    logicalWidth: Math.max(root.offsetWidth, root.clientWidth),
    logicalHeight: Math.max(root.offsetHeight, root.clientHeight),
    renderedWidth: rootRect.width,
    renderedHeight: rootRect.height,
  });
  const toLogicalY = (value: number) => value * measurementScale.y;
  const deduped = new Map<string, PrintPageAnchor>();

  Array.from(root.querySelectorAll(`[${PRINT_FLOW_BLOCK_ATTR}]`)).forEach((element) => {
    const rect = (element as HTMLElement).getBoundingClientRect();
    if (!Number.isFinite(rect.top) || !Number.isFinite(rect.bottom)) return;
    if (rect.height < MIN_ANCHOR_HEIGHT_PX) return;

    const { top, bottom } = getSafePrintAnchorBounds(
      toLogicalY(rect.top - rootRect.top),
      toLogicalY(rect.bottom - rootRect.top)
    );
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
  const lineRects: Array<{ top: number; bottom: number }> = [];
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();
  while (currentNode && lineAnchorCount < MAX_LINE_ANCHORS) {
    const textContent = String(currentNode.textContent || '');
    if (hasVisiblePrintText(textContent)) {
      const range = doc.createRange();
      range.selectNodeContents(currentNode);
      const rects = Array.from(range.getClientRects());
      rects.forEach((rect) => {
        if (lineAnchorCount >= MAX_LINE_ANCHORS) return;
        if (!Number.isFinite(rect.top) || !Number.isFinite(rect.bottom)) return;
        if (rect.height < MIN_LINE_ANCHOR_HEIGHT_PX) return;
        const { top, bottom } = getSafePrintAnchorBounds(
          toLogicalY(rect.top - rootRect.top),
          toLogicalY(rect.bottom - rootRect.top)
        );
        if (bottom - top < MIN_LINE_ANCHOR_HEIGHT_PX) return;
        lineRects.push({ top, bottom });
        lineAnchorCount += 1;
      });
      range.detach?.();
    }
    currentNode = walker.nextNode();
  }

  const normalizedLineRects = Array.from(
    lineRects
      .reduce((map, rect) => {
        const key = `${rect.top}:${rect.bottom}`;
        if (!map.has(key)) map.set(key, rect);
        return map;
      }, new Map<string, { top: number; bottom: number }>())
      .values()
  ).sort((left, right) => {
    if (left.top !== right.top) return left.top - right.top;
    return left.bottom - right.bottom;
  });

  const lineBands = normalizedLineRects.reduce<Array<{ top: number; bottom: number }>>((bands, rect) => {
    const current = bands[bands.length - 1];
    const currentCenter = current ? (current.top + current.bottom) / 2 : 0;
    const rectCenter = (rect.top + rect.bottom) / 2;
    // A visual line can contain cells, spans and numbers with different font
    // metrics. Their rect tops/bottoms may differ by far more than 3px even
    // though they are painted on the same baseline. A substantial overlap
    // means they are one indivisible line band. Merely touching rectangles is
    // deliberately not enough: tight line-height can make two adjacent lines
    // overlap by a pixel or two.
    const overlapHeight = current
      ? Math.max(0, Math.min(current.bottom, rect.bottom) - Math.max(current.top, rect.top))
      : 0;
    const minimumRectHeight = current ? Math.min(current.bottom - current.top, rect.bottom - rect.top) : 0;
    const hasSubstantialOverlap = Boolean(current) &&
      minimumRectHeight > 0 &&
      overlapHeight / minimumRectHeight >= MIN_SAME_LINE_OVERLAP_RATIO;
    const sameVisualLine =
      Boolean(current) &&
      (hasSubstantialOverlap ||
        Math.abs(rect.top - current!.top) <= LINE_BAND_MERGE_TOLERANCE_PX ||
        Math.abs(rect.bottom - current!.bottom) <= LINE_BAND_MERGE_TOLERANCE_PX ||
        Math.abs(rectCenter - currentCenter) <= LINE_BAND_MERGE_TOLERANCE_PX);
    if (
      current &&
      sameVisualLine
    ) {
      current.top = Math.min(current.top, rect.top);
      current.bottom = Math.max(current.bottom, rect.bottom);
      return bands;
    }
    bands.push({ ...rect });
    return bands;
  }, []);

  // A line anchor must represent the exact measured visual line. The previous
  // synthetic before/after anchors were intentionally offset by up to 14px;
  // when selected as a page offset they could land inside the next actual line.
  // That is the source of the partially white final line at page boundaries.
  lineBands.forEach((rect) => {
    const lineKey = `line:${rect.top}:${rect.bottom}`;
    if (!deduped.has(lineKey)) {
      deduped.set(lineKey, { ...rect, priority: 'normal', source: 'line' });
    }
  });

  return Array.from(deduped.values()).sort((left, right) => {
    if (left.top !== right.top) return left.top - right.top;
    return left.bottom - right.bottom;
  });
};

const buildSmartPrintPageOffsetsInternal = ({
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
  const safeTotalHeight = Math.max(1, ceilPx(totalHeight));
  const safeStep = Math.max(80, floorPx(pageBodyStepPx));
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
  const isOutsideEveryLineBand = (offset: number) =>
    lineAnchors.every((anchor) => offset <= anchor.top || offset >= anchor.bottom);

  const pageOffsets = [0];
  let currentOffset = 0;
  let guard = 0;

  while (currentOffset + safeStep < safeTotalHeight - 1 && guard < 500) {
    guard += 1;
    const targetBreak = Math.min(safeTotalHeight, currentOffset + safeStep);

    const lineBottomCandidates = lineAnchors
      .map((anchor) => anchor.bottom)
      // The viewport ends exactly at targetBreak. Allowing a lower edge one
      // pixel past it recreates the clipped final glyph/table-border that the
      // body guard is meant to prevent.
      .filter((bottom) => bottom > currentOffset + minFill && bottom <= targetBreak)
      .filter(isOutsideEveryLineBand);
    let nextOffset = lineBottomCandidates.length > 0 ? Math.max(...lineBottomCandidates) : 0;
    const hasLineAnchorsInCurrentPage = lineAnchors.some(
      (anchor) => anchor.bottom > currentOffset + minHardFill && anchor.top < targetBreak
    );

    if (!nextOffset) {
      const topSnapMin = Math.max(currentOffset + minHardFill, targetBreak - LINE_TOP_SNAP_LOOKBACK_PX);
      const lineTopCandidates = lineAnchors
        .map((anchor) => anchor.top)
        .filter((top) => top > topSnapMin && top < targetBreak - 1)
        .filter(isOutsideEveryLineBand);
      nextOffset = lineTopCandidates.length > 0 ? Math.max(...lineTopCandidates) : 0;
    }

    if (!nextOffset && !hasLineAnchorsInCurrentPage) {
      const anyBottomCandidates = sortedAnchors
        .map((anchor) => anchor.bottom)
        .filter((bottom) => bottom > currentOffset + minFill && bottom <= targetBreak)
        .filter(isOutsideEveryLineBand);
      nextOffset = anyBottomCandidates.length > 0 ? Math.max(...anyBottomCandidates) : 0;
    }

    if (!nextOffset) {
      const protectedBlockCrossingBreak = blockAnchors
        .filter((anchor) => anchor.priority === 'high')
        .filter((anchor) => anchor.top < targetBreak && anchor.bottom > targetBreak)
        .filter((anchor) => anchor.bottom - anchor.top <= safeStep - OVERSIZED_KEEP_BLOCK_TOLERANCE_PX)
        .map((anchor) => anchor.top)
        .filter((top) => top > currentOffset + minHardFill && top < targetBreak - 1);
      nextOffset = protectedBlockCrossingBreak.length > 0 ? Math.max(...protectedBlockCrossingBreak) : 0;
    }

    // Last-resort snap: look for the closest anchor bottom within the final
    // ~56 px before targetBreak (approx 2 line-heights). This avoids a hard
    // mid-line cut while limiting the backward shift so per-page guard overhead
    // stays small.
    if (!nextOffset) {
      const SNAP_LOOKBACK_PX = 56;
      const snapMin = Math.max(currentOffset + minHardFill, targetBreak - SNAP_LOOKBACK_PX);
      const nearbyBottomBeforeBreak = sortedAnchors
        .map((anchor) => anchor.bottom)
        .filter((bottom) => bottom > snapMin && bottom <= targetBreak)
        .filter(isOutsideEveryLineBand);
      if (nearbyBottomBeforeBreak.length > 0) {
        nextOffset = Math.max(...nearbyBottomBeforeBreak);
      }
    }

    if (!nextOffset && lineAnchors.length === 0) {
      nextOffset = targetBreak;
    }

    // With measured text available, prefer an earlier verified line top to a
    // forced mid-line cut. This can leave a little more white space, but never
    // drops or whitens part of a sentence.
    if (!nextOffset) {
      const safeLineTopCandidates = lineAnchors
        .map((anchor) => anchor.top)
        .filter((top) => top > currentOffset + minHardFill && top < targetBreak)
        .filter(isOutsideEveryLineBand);
      nextOffset = safeLineTopCandidates.length > 0
        ? Math.max(...safeLineTopCandidates)
        : targetBreak;
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

const getNextSafePageStart = ({
  previousEnd,
  totalHeight,
  anchors,
}: {
  previousEnd: number;
  totalHeight: number;
  anchors: PrintPageAnchor[];
}) => {
  // Prefer actual line bands. If a prior fallback put an edge inside a band,
  // restart immediately before that whole line instead of repeating the same
  // unsafe edge at the top of the next page. Row/media anchors are a fallback
  // for pages that contain no text nodes at all.
  const nextAnchor = anchors.find(
    (anchor) => anchor.source === 'line' && anchor.bottom > previousEnd
  ) || anchors.find((anchor) => anchor.bottom > previousEnd);

  // Keep the source interval through its measured end even when no line/row
  // anchor follows. Unannotated embedded content can live in that tail; it is
  // safer to preserve it than infer it is only bottom padding. Truly empty
  // trailing editor paragraphs are removed before anchor collection instead.
  if (!nextAnchor) return Math.min(totalHeight, previousEnd);

  // Keep one source pixel above the measured top. This is deliberate: browser
  // PDF backends round CSS transforms and clip rectangles independently.
  // Starting exactly at a line top is therefore not a safe printable edge.
  return Math.min(
    totalHeight,
    Math.max(0, floorPx(nextAnchor.top) - 1)
  );
};

export const buildSmartPrintPageRanges = ({
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
}): PrintPageRange[] => {
  const safeTotalHeight = Math.max(1, ceilPx(totalHeight));
  const safeAnchors = (anchors || [])
    .filter((anchor) => Number.isFinite(anchor.top) && Number.isFinite(anchor.bottom) && anchor.bottom > anchor.top)
    .sort((left, right) => left.top - right.top || left.bottom - right.bottom);
  const pageEnds = buildSmartPrintPageOffsetsInternal({
    totalHeight: safeTotalHeight,
    pageBodyStepPx,
    anchors: safeAnchors,
    minPageFillRatio,
    hardKeepFillRatio,
  }).slice(1);
  const ranges: PrintPageRange[] = [];
  let pageStart = 0;

  pageEnds.forEach((pageEnd) => {
    const safeEnd = Math.max(pageStart + 1, Math.min(safeTotalHeight, ceilPx(pageEnd)));
    ranges.push({ start: pageStart, end: safeEnd });
    pageStart = getNextSafePageStart({
      previousEnd: safeEnd,
      totalHeight: safeTotalHeight,
      anchors: safeAnchors,
    });
  });

  if (pageStart < safeTotalHeight) {
    ranges.push({ start: pageStart, end: safeTotalHeight });
  }

  return ranges.length > 0 ? ranges : [{ start: 0, end: safeTotalHeight }];
};

// Compatibility for callers that only need the beginning of each page. New
// rendering code must use ranges so the two printable edges stay independent.
export const buildSmartPrintPageOffsets = (options: {
  totalHeight: number;
  pageBodyStepPx: number;
  anchors: PrintPageAnchor[];
  minPageFillRatio?: number;
  hardKeepFillRatio?: number;
}) => buildSmartPrintPageRanges(options).map((range) => range.start);
