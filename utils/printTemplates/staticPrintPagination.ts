import { buildSmartPrintPageRanges, collectPrintPageAnchors } from './printPagination';

const CUSTOM_PRINT_PAGE_SELECTOR = '.invoice-custom-print-shell .print-template-page';
const BODY_SELECTOR = '.print-template-body';
const BODY_VIEWPORT_SELECTOR = '.print-template-body-viewport';
const BODY_SEGMENT_SELECTOR = '.print-template-body-segment';
const BODY_INNER_SELECTOR = '.print-template-body-inner';
const PAGE_COUNTER_SELECTOR = '.print-template-page-counter';
const MIN_PAGE_BODY_STEP_PX = 80;

const toPersianNumber = (value: number) =>
  String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)] || digit);

const getStaticBodyHeight = (body: HTMLElement) => {
  const rect = body.getBoundingClientRect();
  return Math.max(body.clientHeight, body.offsetHeight, Math.ceil(rect.height || 0));
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

  const pageBodyStepPx = Math.max(MIN_PAGE_BODY_STEP_PX, Math.floor(getStaticBodyHeight(firstBody)) - 1);
  const totalHeight = Math.max(firstInner.scrollHeight, firstInner.offsetHeight, firstInner.clientHeight, 1);
  const anchors = collectPrintPageAnchors(firstInner);
  if (!anchors.length) return existingPages.length;

  const pageRanges = buildSmartPrintPageRanges({
    totalHeight,
    pageBodyStepPx,
    anchors,
  });
  const pageTemplate = firstPage.cloneNode(true) as HTMLElement;

  // Rebuild from the first (full-height) page. The old final page can have a
  // deliberately compact body so that signatures sit near its content; using
  // it as a clone would recreate the same invisible footer collision.
  existingPages.forEach((page) => page.remove());

  pageRanges.forEach((range, pageIndex) => {
    const page = pageTemplate.cloneNode(true) as HTMLElement;
    const viewport = page.querySelector<HTMLElement>(BODY_VIEWPORT_SELECTOR);
    const segment = page.querySelector<HTMLElement>(BODY_SEGMENT_SELECTOR);
    const footer = page.querySelector<HTMLElement>('.print-template-footer');
    const counter = page.querySelector<HTMLElement>(PAGE_COUNTER_SELECTOR);
    const viewportHeightPx = Math.max(1, Math.ceil(range.end - range.start));

    if (viewport) {
      const viewportHeight = `${viewportHeightPx}px`;
      viewport.style.flex = `0 0 ${viewportHeight}`;
      viewport.style.height = viewportHeight;
      viewport.style.minHeight = '0';
      viewport.style.maxHeight = viewportHeight;
    }
    if (segment) {
      segment.style.transform = `translateY(-${Math.max(0, range.start)}px)`;
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

    var rootRect = inner.getBoundingClientRect();
    var totalHeight = Math.max(inner.scrollHeight || 0, inner.offsetHeight || 0, inner.clientHeight || 0, 1);
    var bodyRect = body.getBoundingClientRect();
    var bodyHeight = Math.max(body.clientHeight || 0, body.offsetHeight || 0, Math.ceil(bodyRect.height || 0));
    var step = Math.max(80, Math.floor(bodyHeight) - 1);
    if (totalHeight <= step) return;

    var rawLines = [];
    var walker = document.createTreeWalker(inner, NodeFilter.SHOW_TEXT);
    var node = walker.nextNode();
    while (node) {
      if (String(node.textContent || '').trim()) {
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
    if (!lines.length) return;

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
      var next = lines.find(function (line) { return line.bottom > end; });
      start = next ? Math.max(0, Math.floor(next.top) - 1) : end;
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
      var height = Math.max(1, Math.ceil(item.end - item.start)) + 'px';
      if (viewport) {
        viewport.style.flex = '0 0 ' + height;
        viewport.style.height = height;
        viewport.style.minHeight = '0';
        viewport.style.maxHeight = height;
      }
      if (segment) segment.style.transform = 'translateY(-' + Math.max(0, item.start) + 'px)';
      if (footer) footer.style.marginTop = 'auto';
      if (counter) counter.textContent = 'صفحه ' + fa(index + 1) + ' از ' + fa(ranges.length);
      page.style.pageBreakAfter = index < ranges.length - 1 ? 'always' : 'auto';
      page.style.breakAfter = index < ranges.length - 1 ? 'page' : 'auto';
      shell.appendChild(page);
    });
  })();
`;
