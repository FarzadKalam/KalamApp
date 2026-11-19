import React, { useContext, useLayoutEffect, useRef } from 'react';
import { Switch } from 'antd';
import { closestCenter, DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { DASHBOARD_COLUMNS, dashboardWidgetWidth, resetDashboardLayout, updateDashboardPreferences, useDashboardPreferences } from '../../utils/dashboardPreferences';
import { DashboardWidgetScope } from './DashboardWidgetFrame';

import { dashboardPackedDropIndex, DASHBOARD_PACKED_GAP, DASHBOARD_PACKED_ROW } from './dashboardPacking';
import { DashboardLayoutContext } from './dashboardLayoutContext';

export function DashboardDefaultLayoutSwitch() {
  const { orgId, userId } = useContext(DashboardWidgetScope);
  const { layoutMode, hiddenWidgets } = useDashboardPreferences(orgId, userId);
  return <label className="dashboard-layout-switch">
    <Switch size="small" aria-label="چیدمان پیش‌فرض" checked={layoutMode !== 'custom' && hiddenWidgets.every(id => id.startsWith('summary:'))}
      onChange={checked => checked ? resetDashboardLayout(orgId, userId) : updateDashboardPreferences(orgId, userId, { layoutMode: 'custom' })} />
    <span>چیدمان پیش‌فرض</span>
  </label>;
}

// The slot reserves only the height of its own card. Observing the content rather
// than the grid item also prevents a change to row spans from feeding back into itself.
function DashboardSlot({ id, width, packed, children }: React.PropsWithChildren<{ id: string; width: number; packed: boolean }>) {
  const slot = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = content.current;
    const item = slot.current;
    if (!packed || !node || !item) return;
    const measure = (height: number) => {
      const rows = String(Math.max(1, Math.ceil((height + DASHBOARD_PACKED_GAP) / DASHBOARD_PACKED_ROW)));
      if (item.style.getPropertyValue('--widget-rows') !== rows) item.style.setProperty('--widget-rows', rows);
    };
    measure(node.getBoundingClientRect().height);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => { if (entry) measure(entry.contentRect.height); });
    observer.observe(node);
    return () => observer.disconnect();
  }, [packed]);
  return <div ref={slot} className="dashboard-layout-slot" data-slot={id} data-width={width}
    style={{ '--widget-span': width } as React.CSSProperties}>
    <div ref={content} className="dashboard-slot-content">{children}</div>
  </div>;
}

export function DashboardLayout({ editing, children }: React.PropsWithChildren<{ editing: boolean }>) {
  const { orgId, userId } = useContext(DashboardWidgetScope);
  const { layoutMode, widgetWidths, widgetOrder, hiddenWidgets } = useDashboardPreferences(orgId, userId);
  const items = new Map<string, React.ReactElement>();
  React.Children.forEach(children, child => {
    if (React.isValidElement(child) && child.key != null && !hiddenWidgets.includes(String(child.key))) {
      items.set(String(child.key), child);
    }
  });
  const [preview, setPreview] = React.useState<{ id: string; width: number } | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const packed = layoutMode === 'custom' || (editing && preview !== null);
  const ids = [...new Set([...(layoutMode === 'custom' ? widgetOrder.filter(id => items.has(id)) : []), ...items.keys()])];
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const reorder = (id: string, to: number) => {
    const from = ids.indexOf(id);
    if (from < 0 || to < 0 || to >= ids.length || from === to) return;
    updateDashboardPreferences(orgId, userId, { layoutMode: 'custom', widgetOrder: [...arrayMove(ids, from, to), ...widgetOrder.filter(key => !items.has(key))] });
  };

  const finishDrag = ({ active, over, activatorEvent, delta }: DragEndEvent) => {
    if (!editing) return;
    const node = grid.current;
    const rect = active.rect.current.initial;
    if (node && rect && activatorEvent.type === 'pointerdown' && node.clientWidth >= 720) {
      const bounds = node.getBoundingClientRect();
      const rtl = getComputedStyle(node).direction === 'rtl';
      const x = rtl ? bounds.right - rect.right - delta.x : rect.left + delta.x - bounds.left;
      const y = rect.top + delta.y - bounds.top;
      const pointer = activatorEvent as PointerEvent;
      if (pointer.clientX + delta.x < bounds.left || pointer.clientX + delta.x > bounds.right
        || pointer.clientY + delta.y < bounds.top || pointer.clientY + delta.y > bounds.bottom) return;
      const slots = Array.from(node.querySelectorAll<HTMLElement>(':scope > .dashboard-layout-slot'));
      const sizes = slots.map(slot => {
        const rows = (packed && Number(slot.style.getPropertyValue('--widget-rows')))
          || Math.max(1, Math.ceil(((slot.firstElementChild?.getBoundingClientRect().height ?? 0) + DASHBOARD_PACKED_GAP) / DASHBOARD_PACKED_ROW));
        return { id: slot.dataset.slot!, width: Number(slot.dataset.width), rows };
      });
      const id = String(active.id);
      const target = dashboardPackedDropIndex(sizes, id, DASHBOARD_COLUMNS,
        (node.clientWidth + DASHBOARD_PACKED_GAP) / DASHBOARD_COLUMNS, x, y);
      if (!packed && target >= 0 && target === ids.indexOf(id) && Math.hypot(delta.x, delta.y) >= 24) {
        updateDashboardPreferences(orgId, userId, { layoutMode: 'custom', widgetOrder: ids });
      } else {
        reorder(id, target);
      }
      return;
    }
    if (over) reorder(String(active.id), ids.indexOf(String(over.id)));
  };

  return <DashboardLayoutContext.Provider value={{ editing, setPreview, move: (id, direction) => reorder(id, ids.indexOf(id) + direction) }}>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={finishDrag} accessibility={{
      screenReaderInstructions: { draggable: 'برای جابه‌جایی فاصله را بزنید، از کلیدهای جهت استفاده کنید و با فاصله تأیید کنید. خروج برای لغو.' },
      announcements: {
        onDragStart: () => 'جابه‌جایی شروع شد.',
        onDragOver: () => undefined,
        onDragEnd: ({ over }) => over ? 'ویجت جابه‌جا شد.' : 'جابه‌جایی لغو شد.',
        onDragCancel: () => 'جابه‌جایی لغو شد.',
      },
    }}>
      <div className="dashboard-layout-container">
        <div ref={grid} className="dashboard-layout" data-editing={editing} data-packed={packed}>
          <SortableContext items={ids} strategy={packed ? () => null : rectSortingStrategy}>
            {ids.map(id => <DashboardSlot key={id} id={id} packed={packed} width={editing && preview?.id === id ? preview.width : ((layoutMode === 'custom' ? widgetWidths?.[id] : undefined) ?? dashboardWidgetWidth(id).initial)}>
              {items.get(id)}
            </DashboardSlot>)}
          </SortableContext>
        </div>
      </div>
    </DndContext>
  </DashboardLayoutContext.Provider>;
}
