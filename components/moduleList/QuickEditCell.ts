import { useCallback, useEffect, useRef } from 'react';
import type { HTMLAttributes, PointerEvent } from 'react';
import type { ModuleField } from '../../types';

export const QUICK_EDIT_HOLD_MS = 750;
const MOVE_LIMIT_PX = 10;

export type QuickEditCellController = {
  active: boolean;
  canEdit: (field: ModuleField, row: Record<string, any>) => boolean;
  open: (field: ModuleField, row: Record<string, any>, trigger: HTMLElement) => void;
};

export function useQuickEditCellEvents(controller?: QuickEditCellController) {
  const gesture = useRef<{ id: number; x: number; y: number; timer: number } | null>(null);
  const suppressClick = useRef<{ cell: HTMLElement; until: number } | null>(null);
  const clear = useCallback(() => {
    if (gesture.current) window.clearTimeout(gesture.current.timer);
    gesture.current = null;
  }, []);
  useEffect(() => {
    if (!controller?.open) return;
    document.addEventListener('scroll', clear, true);
    return () => {
      document.removeEventListener('scroll', clear, true);
      clear();
    };
  }, [clear, controller?.open]);

  return useCallback((field: ModuleField, row: Record<string, any>, label: string): HTMLAttributes<HTMLTableCellElement> => {
    if (!controller?.canEdit(field, row)) return {};
    const active = controller.active;
    const open = (cell: HTMLElement) => controller.open(field, row, cell);
    return {
      className: active ? 'module-quick-edit-cell module-quick-edit-cell-active' : 'module-quick-edit-cell',
      ...(active ? { tabIndex: 0, 'aria-label': `ویرایش ${label}` } : {}),
      onPointerDown: (event: PointerEvent<HTMLTableCellElement>) => {
        if (!event.isPrimary || event.button !== 0 || (active && event.pointerType !== 'touch')) return;
        suppressClick.current = null;
        clear();
        const cell = event.currentTarget;
        const { pointerId: id, clientX: x, clientY: y } = event;
        const timer = window.setTimeout(() => {
          gesture.current = null;
          suppressClick.current = { cell, until: Date.now() + 2000 };
          open(cell);
        }, QUICK_EDIT_HOLD_MS);
        gesture.current = { id, x, y, timer };
      },
      onPointerMove: event => {
        const start = gesture.current;
        if (start && start.id === event.pointerId && Math.hypot(start.x - event.clientX, start.y - event.clientY) > MOVE_LIMIT_PX) clear();
      },
      onDragStart: clear,
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
      onContextMenu: event => {
        if (gesture.current || (suppressClick.current?.cell === event.currentTarget && suppressClick.current.until > Date.now())) event.preventDefault();
      },
      onClickCapture: event => {
        const consumed = suppressClick.current?.cell === event.currentTarget && suppressClick.current.until > Date.now();
        if (!active && !consumed) return;
        event.preventDefault();
        event.stopPropagation();
        if (consumed) suppressClick.current = null;
        else open(event.currentTarget);
      },
      onKeyDown: event => {
        if (!active || (event.target !== event.currentTarget && !(event.target as HTMLElement).closest('a'))) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        open(event.currentTarget);
      },
    };
  }, [clear, controller]);
}
