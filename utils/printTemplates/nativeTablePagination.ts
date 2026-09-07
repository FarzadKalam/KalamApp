const NATIVE_TABLE_LAYOUT_RESERVE_PX = 10;

export interface NativeTableRowGroupInput {
  rowHeights: number[];
  firstPageCapacity: number;
  nextPageCapacity: number;
  headerHeight: number;
  reservePx?: number;
}

/** Keeps the source array order and assigns every row to exactly one page. */
export const partitionNativeTableRows = ({
  rowHeights,
  firstPageCapacity,
  nextPageCapacity,
  headerHeight,
  reservePx = NATIVE_TABLE_LAYOUT_RESERVE_PX,
}: NativeTableRowGroupInput): number[][] => {
  if (!rowHeights.length) return [];

  const groups: number[][] = [];
  let current: number[] = [];
  let used = 0;
  let available = Math.max(1, firstPageCapacity - headerHeight - reservePx);
  const nextAvailable = Math.max(1, nextPageCapacity - headerHeight - reservePx);

  rowHeights.forEach((rawHeight, rowIndex) => {
    const rowHeight = Math.max(1, Number.isFinite(rawHeight) ? rawHeight : 1);
    if (current.length && used + rowHeight > available) {
      groups.push(current);
      current = [];
      used = 0;
      available = nextAvailable;
    }
    current.push(rowIndex);
    used += rowHeight;
  });

  if (current.length) groups.push(current);
  return groups;
};

/**
 * Chromium occasionally repeats the last rows of a fragmented RTL table.
 * Before PDF capture, turn each dynamic table into explicit, ordered page
 * fragments and verify the row-token sequence. The renderer is deliberately
 * failed closed if a DOM transformation ever changes the source sequence.
 */
export const getNativeTablePaginationScript = (): string => `
(function () {
  var flow = document.querySelector('.kalamapp-native-print-flow[data-kalamapp-native-print-flow="true"]');
  var body = flow && flow.querySelector('.kalamapp-native-print-flow-body');
  if (!flow || !body || flow.getAttribute('data-kalamapp-native-tables-materialized') === 'true') return;

  var pxPerMm = 96 / 25.4;
  var paperHeight = Number(flow.getAttribute('data-kalamapp-paper-height-mm') || 0);
  var marginTop = Number(flow.getAttribute('data-kalamapp-margin-top-mm') || 0);
  var marginBottom = Number(flow.getAttribute('data-kalamapp-margin-bottom-mm') || 0);
  var pageCapacity = Math.max(1, (paperHeight - marginTop - marginBottom) * pxPerMm);
  var reserve = ${NATIVE_TABLE_LAYOUT_RESERVE_PX};
  var tableCounter = 0;
  var tables = Array.prototype.slice.call(body.querySelectorAll('table[data-print-block], table[data-print-preserve-rows="true"]'));

  function directRows(table) {
    return Array.prototype.slice.call(table.querySelectorAll('tbody > tr')).filter(function (row) {
      return row.closest('table') === table;
    });
  }

  function measuredHeight(element) {
    if (!element) return 0;
    var rect = element.getBoundingClientRect();
    return Math.max(1, Math.ceil(rect.height || element.offsetHeight || element.scrollHeight || 0));
  }

  tables.forEach(function (table) {
    if (table.parentElement && table.parentElement.closest('table')) return;
    var rows = directRows(table);
    if (rows.length < 2) return;

    var tokenPrefix = 'table-' + tableCounter++ + '-row-';
    var sourceTokens = rows.map(function (row, index) {
      var token = tokenPrefix + index;
      row.setAttribute('data-kalamapp-native-source-row', token);
      return token;
    });
    var tableRect = table.getBoundingClientRect();
    var bodyRect = body.getBoundingClientRect();
    var tableTop = Math.max(0, tableRect.top - bodyRect.top);
    var pageOffset = ((tableTop % pageCapacity) + pageCapacity) % pageCapacity;
    var firstCapacity = Math.max(1, pageCapacity - pageOffset);
    var head = table.querySelector('thead');
    var headerHeight = measuredHeight(head);
    var rowHeights = rows.map(measuredHeight);
    var minimumFirstRow = headerHeight + rowHeights[0] + reserve;
    var forceFirstPageBreak = firstCapacity < minimumFirstRow;
    if (forceFirstPageBreak) firstCapacity = pageCapacity;

    var groups = [];
    var current = [];
    var available = Math.max(1, firstCapacity - headerHeight - reserve);
    var nextAvailable = Math.max(1, pageCapacity - headerHeight - reserve);
    var used = 0;
    rowHeights.forEach(function (rowHeight, rowIndex) {
      if (current.length && used + rowHeight > available) {
        groups.push(current);
        current = [];
        used = 0;
        available = nextAvailable;
      }
      current.push(rowIndex);
      used += rowHeight;
    });
    if (current.length) groups.push(current);
    if (groups.length === 1 && !forceFirstPageBreak) {
      if (head) head.style.display = 'table-row-group';
      table.setAttribute('data-kalamapp-native-table-materialized', 'true');
      return;
    }

    var fragment = document.createDocumentFragment();
    groups.forEach(function (rowIndexes, groupIndex) {
      var clone = table.cloneNode(true);
      var cloneHead = clone.querySelector('thead');
      if (cloneHead) cloneHead.style.display = 'table-row-group';
      directRows(clone).forEach(function (row) { row.remove(); });
      var targetBody = clone.querySelector('tbody');
      rowIndexes.forEach(function (rowIndex) {
        targetBody.appendChild(rows[rowIndex].cloneNode(true));
      });
      if (groupIndex < groups.length - 1) {
        Array.prototype.slice.call(clone.querySelectorAll('tfoot')).forEach(function (foot) { foot.remove(); });
      }
      if (forceFirstPageBreak || groupIndex > 0) {
        clone.style.breakBefore = 'page';
        clone.style.pageBreakBefore = 'always';
      }
      clone.setAttribute('data-kalamapp-native-table-materialized', 'true');
      fragment.appendChild(clone);
    });
    table.replaceWith(fragment);

    var renderedTokens = Array.prototype.slice.call(body.querySelectorAll('[data-kalamapp-native-source-row^="' + tokenPrefix + '"]'))
      .map(function (row) { return row.getAttribute('data-kalamapp-native-source-row'); });
    if (renderedTokens.length !== sourceTokens.length || renderedTokens.some(function (token, index) { return token !== sourceTokens[index]; })) {
      throw new Error('KALAMAPP_PRINT_ROW_INTEGRITY_FAILED');
    }
  });

  flow.setAttribute('data-kalamapp-native-tables-materialized', 'true');
})();
`;
