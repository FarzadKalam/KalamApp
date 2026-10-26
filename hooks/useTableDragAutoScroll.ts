import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { DragMoveEvent } from '@dnd-kit/core';

// Native scrollBy works with negative RTL scrollLeft in Firefox and Chromium.
export const useTableDragAutoScroll = (rootRef: RefObject<HTMLDivElement>) => {
  const frame = useRef(0);
  const pointerX = useRef<number | null>(null);
  const stop = useCallback(() => { cancelAnimationFrame(frame.current); frame.current = 0; pointerX.current = null; }, []);
  const tick = useCallback(function scrollAtEdge() {
    frame.current = 0;
    const scrollport = rootRef.current?.querySelector<HTMLElement>('.ant-table');
    if (!scrollport || pointerX.current === null) return;
    const rect = scrollport.getBoundingClientRect();
    const x = pointerX.current;
    const edge = 44;
    const velocity = x < rect.left + edge ? -Math.min(16, Math.max(3, (rect.left + edge - x) / 3))
      : x > rect.right - edge ? Math.min(16, Math.max(3, (x - rect.right + edge) / 3)) : 0;
    if (!velocity) return;
    const previous = scrollport.scrollLeft;
    scrollport.scrollLeft += velocity;
    if (scrollport.scrollLeft !== previous) frame.current = requestAnimationFrame(scrollAtEdge);
  }, [rootRef]);
  const move = useCallback((event: DragMoveEvent) => {
    const activator = event.activatorEvent as PointerEvent;
    const rect = event.active.rect.current.translated;
    pointerX.current = typeof activator.clientX === 'number' ? activator.clientX + event.delta.x : rect ? rect.left + rect.width / 2 : null;
    if (!frame.current) frame.current = requestAnimationFrame(tick);
  }, [tick]);
  useEffect(() => stop, [stop]);
  return { move, stop };
};
