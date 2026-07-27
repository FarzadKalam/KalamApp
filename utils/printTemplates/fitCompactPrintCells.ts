const COMPACT_CELL_SELECTOR = '[data-print-auto-fit="compact"]';
const COMPACT_CELL_CONTENT_SELECTOR = '[data-print-auto-fit-content]';

/**
 * Keeps compact print values at their normal size unless their own cell is too
 * narrow. This deliberately measures each rendered cell instead of guessing
 * from the number of columns in a template.
 */
export const fitCompactPrintCells = (root: ParentNode = document) => {
  const cells = Array.from(root.querySelectorAll<HTMLElement>(COMPACT_CELL_SELECTOR));

  cells.forEach((cell) => {
    const content = cell.querySelector<HTMLElement>(COMPACT_CELL_CONTENT_SELECTOR);
    if (!content) return;

    cell.style.fontSize = '';
    const baseFontSize = Number.parseFloat(window.getComputedStyle(cell).fontSize) || 11;
    const minimumFontSize = Math.min(baseFontSize, 7);
    let fontSize = baseFontSize;

    while (content.scrollWidth > cell.clientWidth + 1 && fontSize > minimumFontSize) {
      fontSize = Math.max(minimumFontSize, fontSize - 0.5);
      cell.style.fontSize = `${fontSize}px`;
    }
  });
};

/**
 * The generated-PDF renderer receives standalone HTML, so it needs the same
 * fitting behaviour as the browser print flow without importing application JS.
 */
export const getCompactPrintCellsFitScript = () => `
  (function () {
    var cells = Array.prototype.slice.call(document.querySelectorAll('${COMPACT_CELL_SELECTOR}'));
    cells.forEach(function (cell) {
      var content = cell.querySelector('${COMPACT_CELL_CONTENT_SELECTOR}');
      if (!content) return;
      cell.style.fontSize = '';
      var baseFontSize = parseFloat(window.getComputedStyle(cell).fontSize) || 11;
      var minimumFontSize = Math.min(baseFontSize, 7);
      var fontSize = baseFontSize;
      while (content.scrollWidth > cell.clientWidth + 1 && fontSize > minimumFontSize) {
        fontSize = Math.max(minimumFontSize, fontSize - 0.5);
        cell.style.fontSize = fontSize + 'px';
      }
    });
  })();
`;
