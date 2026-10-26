import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type { ColumnsType } from 'antd/es/table';
import { arrayMove } from '@dnd-kit/sortable';
import { clampTableColumnWidth, readTableColumnPreferences, reconcileTableColumnOrder, tableColumnWidthVariable, type TableColumnPreferences } from '../utils/tableColumnLayout';

export const useTableColumnLayout = ({ columns, scopeKey, rootRef, selectionWidth = 0, flexColumnKey }: {
  columns: ColumnsType<any>;
  scopeKey?: string;
  rootRef: React.RefObject<HTMLDivElement>;
  selectionWidth?: number;
  flexColumnKey?: string;
}) => {
  const [preferences, setPreferences] = useState(() => ({ key: scopeKey, ...readTableColumnPreferences(scopeKey) }));
  const [containerWidth, setContainerWidth] = useState(0);
  const resizeCleanup = useRef<(() => void) | null>(null);
  useLayoutEffect(() => { setPreferences({ key: scopeKey, ...readTableColumnPreferences(scopeKey) }); }, [scopeKey]);
  useEffect(() => {
    if (!scopeKey || preferences.key !== scopeKey) return;
    try { localStorage.setItem(scopeKey, JSON.stringify({ order: preferences.order, widths: preferences.widths })); } catch { /* storage is optional */ }
  }, [preferences, scopeKey]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !scopeKey) return;
    const measure = () => setContainerWidth((previous) => Math.abs(previous - root.clientWidth) > 1 ? root.clientWidth : previous);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(root);
    return () => { observer?.disconnect(); resizeCleanup.current?.(); };
  }, [rootRef, scopeKey]);
  const effective = preferences.key === scopeKey ? preferences : { order: [], widths: {} } as TableColumnPreferences;
  const columnKey = (column: any) => String(column.key || column.dataIndex || '');
  const keys = useMemo(() => columns.map(columnKey).filter((key) => !key.startsWith('__')), [columns]);
  const order = useMemo(() => reconcileTableColumnOrder(keys, effective.order), [keys, effective.order]);
  const widths = useMemo(() => {
    const next: Record<string, number> = {};
    columns.forEach((column) => { const key = columnKey(column); next[key] = effective.widths[key] ?? (Number(column.width) || 160); });
    const total = Object.values(next).reduce((sum, width) => sum + width, selectionWidth);
    // Extra space belongs to the title; short status/number columns stay compact.
    const growKey = flexColumnKey && next[flexColumnKey] ? flexColumnKey : keys[0];
    if (growKey && !effective.widths[growKey] && containerWidth > total) next[growKey] += containerWidth - total;
    return next;
  }, [columns, effective.widths, selectionWidth, flexColumnKey, containerWidth, keys]);
  const totalWidth = Object.values(widths).reduce((sum, width) => sum + width, selectionWidth);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !scopeKey) return;
    Object.entries(widths).forEach(([key, width]) => root.style.setProperty(tableColumnWidthVariable(key), `${width}px`));
    root.style.setProperty('--smarttable-total-width', `${totalWidth}px`);
  }, [rootRef, scopeKey, totalWidth, widths]);
  const commitWidth = useCallback((key: string, width?: number) => {
    setPreferences((previous) => {
      const nextWidths = { ...(previous.key === scopeKey ? previous.widths : {}) };
      if (width === undefined) delete nextWidths[key]; else nextWidths[key] = clampTableColumnWidth(width);
      return { key: scopeKey, order: previous.key === scopeKey ? previous.order : [], widths: nextWidths };
    });
  }, [scopeKey]);
  const startResize = useCallback((key: string, event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !scopeKey) return;
    event.preventDefault(); event.stopPropagation();
    resizeCleanup.current?.();
    const root = rootRef.current;
    if (!root) return;
    const origin = event.clientX;
    const startWidth = widths[key];
    let nextWidth = startWidth;
    let frame = 0;
    const oldCursor = document.body.style.cursor;
    const oldSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
    root.dataset.resizing = 'true';
    const paint = () => {
      root.style.setProperty(tableColumnWidthVariable(key), `${nextWidth}px`);
      root.style.setProperty('--smarttable-total-width', `${totalWidth + nextWidth - startWidth}px`);
    };
    const move = (pointer: PointerEvent) => {
      nextWidth = clampTableColumnWidth(startWidth + origin - pointer.clientX); // RTL inline end is left.
      cancelAnimationFrame(frame); frame = requestAnimationFrame(paint);
    };
    const cleanup = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', cancel);
      document.body.style.cursor = oldCursor; document.body.style.userSelect = oldSelect;
      delete root.dataset.resizing; resizeCleanup.current = null;
    };
    const finish = () => { paint(); cleanup(); commitWidth(key, nextWidth); };
    const cancel = () => { nextWidth = startWidth; paint(); cleanup(); };
    resizeCleanup.current = cancel;
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', finish, { once: true }); window.addEventListener('pointercancel', cancel, { once: true });
  }, [commitWidth, rootRef, scopeKey, totalWidth, widths]);
  const moveColumn = useCallback((active: string, over: string) => {
    const from = order.indexOf(active); const to = order.indexOf(over);
    if (from < 0 || to < 0 || from === to) return;
    setPreferences((previous) => ({ key: scopeKey, widths: previous.key === scopeKey ? previous.widths : {}, order: arrayMove(order, from, to) }));
  }, [order, scopeKey]);
  const arrangedColumns = useMemo(() => {
    if (!scopeKey) return columns;
    const byKey = new Map(columns.map((column) => [columnKey(column), column]));
    return [...columns.filter((column) => columnKey(column).startsWith('__')), ...order.map((key) => {
      const column = byKey.get(key)!;
      return {
        ...column,
        width: `var(${tableColumnWidthVariable(key)})`,
        onHeaderCell: (...args: any[]) => ({
          ...(column.onHeaderCell as any)?.(...args), columnKey: key,
          columnLabel: (column as any).columnLabel || (column.title as any)?.props?.children || key,
          columnWidth: widths[key], onResizeStart: startResize,
          onResizeWidth: commitWidth,
          canMoveBefore: order.indexOf(key) > 0,
          canMoveAfter: order.indexOf(key) < order.length - 1,
          onMoveColumn: (delta: number) => { const target = order[order.indexOf(key) + delta]; if (target) moveColumn(key, target); },
        }),
      };
    })];
  }, [columns, scopeKey, order, widths, startResize, commitWidth, moveColumn]);
  return { columns: arrangedColumns, order, moveColumn, totalWidth };
};
