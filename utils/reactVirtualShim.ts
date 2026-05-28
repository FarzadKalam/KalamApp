import { useCallback, useEffect, useMemo, useState } from 'react';

type AlignMode = 'auto' | 'start' | 'center' | 'end';

type UseVirtualizerOptions = {
  count: number;
  getScrollElement: () => HTMLElement | null;
  estimateSize: (index: number) => number;
  overscan?: number;
  getItemKey?: (index: number) => string | number;
};

type VirtualItem = {
  key: string | number;
  index: number;
  start: number;
  end: number;
  size: number;
};

type ScrollToIndexOptions = {
  align?: AlignMode;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const useVirtualizer = (options: UseVirtualizerOptions) => {
  const { count, estimateSize, getScrollElement, overscan = 4, getItemKey } = options;
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const sizes = useMemo(() => {
    const next = new Array<number>(count);
    for (let i = 0; i < count; i += 1) {
      const raw = Number(estimateSize(i));
      next[i] = Number.isFinite(raw) && raw > 0 ? raw : 1;
    }
    return next;
  }, [count, estimateSize]);

  const offsets = useMemo(() => {
    const next = new Array<number>(count + 1);
    next[0] = 0;
    for (let i = 0; i < count; i += 1) {
      next[i + 1] = next[i] + sizes[i];
    }
    return next;
  }, [count, sizes]);

  const totalSize = offsets[count] || 0;

  const findStartIndex = useCallback((value: number) => {
    if (count <= 0) return 0;
    let low = 0;
    let high = count - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if ((offsets[mid + 1] || 0) <= value) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return clamp(low, 0, count - 1);
  }, [count, offsets]);

  useEffect(() => {
    const element = getScrollElement();
    if (!element) return;

    const sync = () => {
      setScrollTop(element.scrollTop || 0);
      setViewportHeight(element.clientHeight || 0);
    };

    sync();
    element.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => {
      element.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [getScrollElement]);

  const virtualItems = useMemo<VirtualItem[]>(() => {
    if (count <= 0) return [];
    const top = clamp(scrollTop, 0, Math.max(0, totalSize - 1));
    const bottom = top + Math.max(0, viewportHeight);
    const visibleStart = findStartIndex(top);
    const visibleEnd = findStartIndex(bottom);
    const start = clamp(visibleStart - overscan, 0, count - 1);
    const end = clamp(visibleEnd + overscan, 0, count - 1);

    const rows: VirtualItem[] = [];
    for (let index = start; index <= end; index += 1) {
      const itemStart = offsets[index] || 0;
      const size = sizes[index] || 1;
      rows.push({
        key: getItemKey ? getItemKey(index) : index,
        index,
        start: itemStart,
        end: itemStart + size,
        size,
      });
    }
    return rows;
  }, [count, findStartIndex, getItemKey, offsets, overscan, scrollTop, sizes, totalSize, viewportHeight]);

  const scrollToIndex = useCallback((index: number, scrollOptions?: ScrollToIndexOptions) => {
    const element = getScrollElement();
    if (!element || count <= 0) return;
    const safeIndex = clamp(index, 0, count - 1);
    const rowStart = offsets[safeIndex] || 0;
    const rowSize = sizes[safeIndex] || 1;
    const rowEnd = rowStart + rowSize;
    const align = scrollOptions?.align || 'auto';

    let nextTop = rowStart;
    if (align === 'end') {
      nextTop = rowEnd - element.clientHeight;
    } else if (align === 'center') {
      nextTop = rowStart - ((element.clientHeight - rowSize) / 2);
    } else if (align === 'auto') {
      const viewTop = element.scrollTop;
      const viewBottom = viewTop + element.clientHeight;
      if (rowStart < viewTop) {
        nextTop = rowStart;
      } else if (rowEnd > viewBottom) {
        nextTop = rowEnd - element.clientHeight;
      } else {
        return;
      }
    }

    element.scrollTo({ top: Math.max(0, nextTop), behavior: 'auto' });
  }, [count, getScrollElement, offsets, sizes]);

  return {
    getTotalSize: () => totalSize,
    getVirtualItems: () => virtualItems,
    measureElement: (_element: Element | null) => {
      // no-op in shim
    },
    scrollToIndex,
  };
};
