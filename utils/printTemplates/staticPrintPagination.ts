import {
  buildSmartPrintPageRanges,
  collectPrintPageAnchors,
  trimTrailingPrintSpacerNodes,
} from './printPagination';

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
const MIN_PAGE_BODY_STEP_PX = 80;
const BODY_CAPACITY_ATTR = 'data-print-body-capacity-px';
const CONFIGURED_HEADER_HEIGHT_ATTR = 'data-print-configured-header-height-px';
const CONFIGURED_FOOTER_HEIGHT_ATTR = 'data-print-configured-footer-height-px';
const SIGNATURE_HEIGHT_ATTR = 'data-print-signature-height-px';
const PAGE_COUNTER_HEIGHT_ATTR = 'data-print-page-counter-height-px';

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
  const isLetterheadLayout = firstPage.getAttribute('data-print-layout-mode') === 'letterhead';
  const finalBodyHeight = isLetterheadLayout
    ? getStaticBodyHeight(firstPage, firstBody)
    : synchronizeStaticPageLayout(firstPage, firstBody);
  const pageBodyStepPx = Math.max(MIN_PAGE_BODY_STEP_PX, Math.floor(finalBodyHeight || getStaticBodyHeight(firstPage, firstBody)) - 1);
  const totalHeight = Math.max(firstInner.scrollHeight, firstInner.offsetHeight, firstInner.clientHeight, 1);
  const anchors = collectPrintPageAnchors(firstInner);
  const pageRanges = anchors.length
    ? buildSmartPrintPageRanges({ totalHeight, pageBodyStepPx, anchors })
    : [{ start: 0, end: Math.min(totalHeight, pageBodyStepPx) }];
  const pageTemplate = firstPage.cloneNode(true) as HTMLElement;

  // Rebuild from the synchronized first page. The existing DOM can contain
  // stale preview page counts or dimensions, which must never seed final output.
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
    trimTerminalSpacers(inner);
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
    var step = Math.max(80, Math.floor(bodyHeight) - 1);

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
      var next = lines.find(function (line) { return line.bottom > end; });
      start = next ? Math.max(0, Math.floor(next.top) - 1) : totalHeight;
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
