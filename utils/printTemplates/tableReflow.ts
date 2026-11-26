const TOKEN_REGEX = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

const AUXILIARY_TOKENS = new Set([
  'company.currency_label',
]);

const PROTECTED_INTERNAL_ROOTS = new Set([
  'row',
  'item',
  'line',
  'payment',
]);

const extractTokensFromText = (text: string): string[] => {
  const tokens: string[] = [];
  const raw = String(text || '');
  let match: RegExpExecArray | null = null;
  TOKEN_REGEX.lastIndex = 0;
  while ((match = TOKEN_REGEX.exec(raw)) !== null) {
    const token = String(match[1] || '').trim();
    if (token) tokens.push(token);
  }
  return tokens;
};

const getPrimaryTokens = (element: Element): string[] => {
  const explicitField = String(element.getAttribute('data-print-optional-field') || '').trim();
  const tokens = extractTokensFromText(element.innerHTML || element.textContent || '')
    .filter((token) => !AUXILIARY_TOKENS.has(token));
  if (explicitField && !tokens.includes(explicitField)) {
    tokens.unshift(explicitField);
  }
  return Array.from(new Set(tokens));
};

const hasCellDataTokens = (element: Element): boolean =>
  getPrimaryTokens(element).length > 0;

const isBannerHeaderRow = (row: HTMLTableRowElement, totalCols: number): boolean => {
  const cells = Array.from(row.cells || []);
  if (cells.length !== 1) return false;
  const cell = cells[0];
  const colSpan = Number(cell.getAttribute('colspan') || 1);
  if (totalCols > 1 && colSpan >= totalCols) return true;
  if (String(cell.tagName || '').toLowerCase() === 'th' && !hasCellDataTokens(cell)) return true;
  return false;
};

const isProtectedTable = (table: HTMLTableElement): boolean => {
  if (
    table.hasAttribute('data-print-block')
    || table.getAttribute('data-print-preserve-rows') === 'true'
    || table.getAttribute('data-print-reflow') === 'false'
  ) {
    return true;
  }

  // Layout wrapper tables or media header tables must never be reflowed automatically
  if (table.querySelector('table, img, svg')) return true;

  // Row-repeating / itemized data tables
  const html = table.innerHTML || '';
  if (/\{\{\s*(row|item|line)\./.test(html) || /\{\{#each/.test(html)) {
    return true;
  }

  // Multi-column thead tables are structured list/item tables, not key-value info tables
  const thead = table.querySelector('thead');
  if (thead) {
    const headRows = Array.from(thead.querySelectorAll('tr'));
    const hasMultiColHeader = headRows.some((tr) => Array.from(tr.cells || []).length > 1);
    if (hasMultiColHeader) return true;
  }

  return false;
};

type ReflowUnit =
  | { kind: 'pair'; labelCell: HTMLTableCellElement; valueCell: HTMLTableCellElement; sourceRow: HTMLTableRowElement }
  | { kind: 'single'; cell: HTMLTableCellElement; sourceRow: HTMLTableRowElement };

type TableDetectionResult = {
  mode: 'paired' | 'single';
  pairsPerRow: number;
  totalCols: number;
  bannerRows: HTMLTableRowElement[];
  dataRows: HTMLTableRowElement[];
  units: ReflowUnit[];
};

const getEffectiveColCount = (rows: HTMLTableRowElement[]): number => {
  let maxCols = 0;
  rows.forEach((row) => {
    let cols = 0;
    Array.from(row.cells || []).forEach((cell) => {
      cols += Math.max(1, Number(cell.getAttribute('colspan') || 1));
    });
    if (cols > maxCols) maxCols = cols;
  });
  return maxCols;
};

const detectKeyValueTable = (table: HTMLTableElement): TableDetectionResult | null => {
  const allRows = Array.from(table.rows || []);
  if (allRows.length === 0) return null;

  // Skip tables using rowspan since reflowing rows changes vertical cell spans
  if (table.querySelector('[rowspan]')) return null;

  const totalCols = getEffectiveColCount(allRows);
  if (totalCols === 0) return null;

  const bannerRows: HTMLTableRowElement[] = [];
  const dataRows: HTMLTableRowElement[] = [];

  allRows.forEach((row, index) => {
    if (index === 0 && isBannerHeaderRow(row, totalCols)) {
      bannerRows.push(row);
      return;
    }
    dataRows.push(row);
  });

  if (dataRows.length === 0) return null;

  // Check if all data rows follow Split Label+Value Pairs: [labelCell, valueCell, ...]
  let canBePaired = totalCols >= 2 && totalCols % 2 === 0;
  const pairedUnits: ReflowUnit[] = [];

  if (canBePaired) {
    for (const row of dataRows) {
      const cells = Array.from(row.cells || []);
      if (cells.length === 0 || cells.length % 2 !== 0) {
        canBePaired = false;
        break;
      }
      // If a row uses colspan on a pair (like a trailing notes pair spanning full row), preserve cell-pairing safely
      for (let i = 0; i < cells.length; i += 2) {
        const first = cells[i];
        const second = cells[i + 1];
        const firstTokens = getPrimaryTokens(first);
        const secondTokens = getPrimaryTokens(second);
        const firstHasOpt = first.hasAttribute('data-print-optional-field');
        const secondHasOpt = second.hasAttribute('data-print-optional-field');

        // Normal RTL / HTML order: first cell = label (0 tokens), second cell = value (>=1 tokens)
        if (firstTokens.length === 0 && !firstHasOpt && (secondTokens.length > 0 || secondHasOpt)) {
          pairedUnits.push({
            kind: 'pair',
            labelCell: first,
            valueCell: second,
            sourceRow: row,
          });
        } else if (firstTokens.length === 0 && secondTokens.length === 0 && !firstHasOpt && !secondHasOpt) {
          // Static text pair without tokens — keep intact as a pair
          pairedUnits.push({
            kind: 'pair',
            labelCell: first,
            valueCell: second,
            sourceRow: row,
          });
        } else {
          canBePaired = false;
          break;
        }
      }
      if (!canBePaired) break;
    }
  }

  if (canBePaired && pairedUnits.some((u) => u.kind === 'pair' && getPrimaryTokens(u.valueCell).length > 0)) {
    return {
      mode: 'paired',
      pairsPerRow: Math.max(1, Math.floor(totalCols / 2)),
      totalCols,
      bannerRows,
      dataRows,
      units: pairedUnits,
    };
  }

  // Otherwise check Subpattern 1B: Self-contained cells (each cell has label + token or optional attribute)
  // Allow single-column vertical info tables OR multi-column info grids (2-4 cells/row)
  const cellCounts = dataRows.map((row) => Array.from(row.cells || []).length);
  const maxRowCells = Math.max(...cellCounts);
  if (maxRowCells < 1 || maxRowCells > 4) return null;

  let tokenCellsCount = 0;
  const singleUnits: ReflowUnit[] = [];
  for (const row of dataRows) {
    const cells = Array.from(row.cells || []);
    for (const cell of cells) {
      const tokens = getPrimaryTokens(cell);
      if (tokens.some((t) => PROTECTED_INTERNAL_ROOTS.has(t.split('.')[0]))) {
        return null;
      }
      if (tokens.length > 0 || cell.hasAttribute('data-print-optional-field')) {
        tokenCellsCount += 1;
      }
      singleUnits.push({
        kind: 'single',
        cell,
        sourceRow: row,
      });
    }
  }

  if (tokenCellsCount === 0) return null;

  return {
    mode: 'single',
    pairsPerRow: maxRowCells,
    totalCols: maxRowCells,
    bannerRows,
    dataRows,
    units: singleUnits,
  };
};

const isUnitVisible = (
  unit: ReflowUnit,
  isFieldVisible: (fieldPath: string, fromOptionalAttr?: boolean) => boolean
): boolean => {
  const targetElement = unit.kind === 'pair' ? unit.valueCell : unit.cell;
  const optionalAttr = String(targetElement.getAttribute('data-print-optional-field') || '').trim();
  if (optionalAttr && !isFieldVisible(optionalAttr, true)) {
    return false;
  }

  const tokens = getPrimaryTokens(targetElement);
  if (tokens.length === 0) return true;
  return tokens.some((token) => isFieldVisible(token, false));
};

const removePrecedingSectionHeading = (table: HTMLTableElement) => {
  let cursor = table.previousSibling;
  while (cursor) {
    if (cursor.nodeType === 3) {
      if (!String(cursor.textContent || '').trim()) {
        cursor = cursor.previousSibling;
        continue;
      }
      break;
    }
    if (cursor.nodeType === 1) {
      const el = cursor as HTMLElement;
      const tag = String(el.tagName || '').toLowerCase();
      const text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
      const hasMediaOrStructure = Boolean(el.querySelector('table, img, svg'));
      const hasTokens = extractTokensFromText(el.innerHTML || '').length > 0;

      if (!text && !hasMediaOrStructure) {
        const emptyToRemove = el;
        cursor = cursor.previousSibling;
        emptyToRemove.remove();
        continue;
      }

      const looksLikeHeading =
        ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)
        || (
          ['div', 'p'].includes(tag)
          && !hasMediaOrStructure
          && !hasTokens
          && text.length > 0
          && text.length <= 70
          && (
            el.className.includes('section')
            || el.className.includes('title')
            || el.className.includes('heading')
            || String(el.getAttribute('style') || '').includes('font-weight')
            || Boolean(el.querySelector('strong, b'))
          )
        );

      if (looksLikeHeading && !hasMediaOrStructure && !hasTokens) {
        el.remove();
      }
      break;
    }
    break;
  }
};

const reflowDetectedTable = (
  doc: Document,
  table: HTMLTableElement,
  detected: TableDetectionResult,
  isFieldVisible: (fieldPath: string, fromOptionalAttr?: boolean) => boolean
) => {
  const keptUnits = detected.units.filter((unit) => isUnitVisible(unit, isFieldVisible));
  if (keptUnits.length === detected.units.length) return;

  if (keptUnits.length === 0) {
    removePrecedingSectionHeading(table);
    table.remove();
    return;
  }

  const tbody = table.tBodies?.[0] || table.querySelector('tbody') || table;
  const rowTemplate = detected.dataRows[0];

  // Clear existing dataRows while preserving bannerRows
  detected.dataRows.forEach((row) => row.remove());

  const perRow = Math.max(1, detected.pairsPerRow);
  const totalGridCols = Math.max(1, detected.totalCols);

  for (let i = 0; i < keptUnits.length; i += perRow) {
    const chunk = keptUnits.slice(i, i + perRow);
    const newRow = doc.createElement('tr');
    if (rowTemplate) {
      Array.from(rowTemplate.attributes).forEach((attr) => {
        newRow.setAttribute(attr.name, attr.value);
      });
    }

    if (detected.mode === 'paired') {
      chunk.forEach((unit, idx) => {
        if (unit.kind !== 'pair') return;
        const { labelCell, valueCell } = unit;
        labelCell.removeAttribute('colspan');
        valueCell.removeAttribute('colspan');

        const isLastInShortRow = idx === chunk.length - 1 && chunk.length < perRow;
        if (isLastInShortRow) {
          const usedCols = (chunk.length - 1) * 2 + 1;
          const remainingSpan = Math.max(1, totalGridCols - usedCols);
          if (remainingSpan > 1) {
            valueCell.setAttribute('colspan', String(remainingSpan));
            valueCell.style.removeProperty('width');
            valueCell.removeAttribute('width');
          }
        }
        newRow.appendChild(labelCell);
        newRow.appendChild(valueCell);
      });
    } else {
      chunk.forEach((unit, idx) => {
        if (unit.kind !== 'single') return;
        const { cell } = unit;
        cell.removeAttribute('colspan');
        const isLastInShortRow = idx === chunk.length - 1 && chunk.length < perRow;
        if (isLastInShortRow) {
          const remainingSpan = Math.max(1, perRow - (chunk.length - 1));
          if (remainingSpan > 1) {
            cell.setAttribute('colspan', String(remainingSpan));
            cell.style.width = `${Math.round((remainingSpan / perRow) * 100)}%`;
            cell.removeAttribute('width');
          }
        } else if (perRow > 1) {
          cell.style.width = `${Math.floor(100 / perRow)}%`;
          cell.removeAttribute('width');
        }
        newRow.appendChild(cell);
      });
    }

    tbody.appendChild(newRow);
  }
};

export const applyPrintFieldVisibilityAndReflow = (
  html: string,
  {
    isFieldVisible,
  }: {
    isFieldVisible: (fieldPath: string, fromOptionalAttr?: boolean) => boolean;
  }
): string => {
  const rawHtml = String(html || '');
  if (!rawHtml.trim()) return rawHtml;
  if (typeof DOMParser === 'undefined') return rawHtml;

  const doc = new DOMParser().parseFromString(`<div>${rawHtml}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return rawHtml;

  // Phase 1: Auto-detect non-protected key-value tables (inspecting both {{tokens}} and [data-print-optional-field])
  // and reflow remaining cells/pairs cleanly into balanced rows
  Array.from(root.querySelectorAll('table')).forEach((table) => {
    if (!table.isConnected) return;
    if (isProtectedTable(table)) return;
    const detected = detectKeyValueTable(table);
    if (!detected) return;
    reflowDetectedTable(doc, table, detected, isFieldVisible);
  });

  // Phase 2: Remove any remaining explicitly annotated [data-print-optional-field] elements
  // (e.g., inside block tables, standalone notes boxes, or irregular layout tables)
  const affectedOptionalTables = new Set<HTMLTableElement>();
  Array.from(root.querySelectorAll<HTMLElement>('[data-print-optional-field]')).forEach((element) => {
    if (!element.isConnected) return;
    const fieldPath = String(element.getAttribute('data-print-optional-field') || '').trim();
    if (!fieldPath || isFieldVisible(fieldPath, true)) return;

    const parentBlockTable = element.closest('table[data-print-block]');
    if (parentBlockTable) {
      const tag = String(element.tagName || '').toLowerCase();
      if (tag === 'tr' || tag === 'td' || tag === 'th') {
        element.remove();
      } else {
        const cell = element.closest('td, th');
        if (cell) cell.remove();
        else element.remove();
      }
      return;
    }

    const parentTable = element.closest('table');
    const tag = String(element.tagName || '').toLowerCase();
    if (tag === 'img') {
      element.remove();
      return;
    }
    if (tag === 'tr') {
      element.remove();
      if (parentTable) {
        affectedOptionalTables.add(parentTable);
      }
      return;
    }
    if (parentTable) {
      const targetCell = (tag === 'td' || tag === 'th') ? element : element.closest('td, th');
      if (targetCell && targetCell.parentElement) {
        const row = targetCell.parentElement as HTMLTableRowElement;
        const cells = Array.from(row.cells || []);
        const cellIdx = cells.indexOf(targetCell as HTMLTableCellElement);
        if (
          cells.length % 2 === 0
          && cellIdx % 2 === 1
          && cells[cellIdx - 1]
          && !hasCellDataTokens(cells[cellIdx - 1])
        ) {
          cells[cellIdx - 1].remove();
        }
        targetCell.remove();
        affectedOptionalTables.add(parentTable);
        return;
      }
      affectedOptionalTables.add(parentTable);
    }

    element.remove();
  });

  // Clean up tables impacted by Phase 2 removals
  affectedOptionalTables.forEach((table) => {
    if (!table.isConnected) return;
    Array.from(table.rows || []).forEach((row) => {
      const cells = Array.from(row.cells || []);
      if (cells.length === 0) {
        row.remove();
        return;
      }
      if (cells.length === 1 && !isBannerHeaderRow(row, 2)) {
        const cell = cells[0] as HTMLTableCellElement;
        cell.style.width = '100%';
        cell.removeAttribute('width');
      }
    });
    const remainingDataRows = Array.from(table.rows || []).filter(
      (row) => !isBannerHeaderRow(row, getEffectiveColCount(Array.from(table.rows || [])))
    );
    if (remainingDataRows.length === 0) {
      removePrecedingSectionHeading(table);
      table.remove();
    }
  });

  // Phase 3: Remove standalone leaf labeled paragraphs/divs/list-items outside tables whose primary tokens are all disabled
  Array.from(root.querySelectorAll('p, li, div')).forEach((element) => {
    if (!element.isConnected) return;
    if (element.closest('table')) return;
    if (element.querySelector('table, p, div, ul, ol, h1, h2, h3, h4, h5, h6, img, svg')) return;
    const tokens = getPrimaryTokens(element);
    if (tokens.length === 0) return;
    if (tokens.some((token) => PROTECTED_INTERNAL_ROOTS.has(token.split('.')[0]))) return;
    const anyVisible = tokens.some((token) => isFieldVisible(token, false));
    if (!anyVisible) {
      element.remove();
    }
  });

  return root.innerHTML;
};
