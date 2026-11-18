import React, { useContext } from 'react';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { updateDashboardPreferences, useDashboardPreferences } from '../../utils/dashboardPreferences';
import { DashboardWidgetScope } from './DashboardWidgetFrame';

import { DashboardLayoutContext } from './dashboardLayoutContext';

export function DashboardLayout({ editing, children }: React.PropsWithChildren<{ editing: boolean }>) {
  const { orgId, userId } = useContext(DashboardWidgetScope);
  const { widgetOrder, hiddenWidgets } = useDashboardPreferences(orgId, userId);
  const items = new Map<string, React.ReactElement>();
  React.Children.forEach(children, child => {
    if (React.isValidElement(child) && child.key != null && !hiddenWidgets.includes(String(child.key))) {
      items.set(String(child.key), child);
    }
  });
  const ids = [...new Set([...widgetOrder.filter(id => items.has(id)), ...items.keys()])];
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const reorder = (id: string, to: number) => {
    const from = ids.indexOf(id);
    if (from < 0 || to < 0 || to >= ids.length || from === to) return;
    updateDashboardPreferences(orgId, userId, { widgetOrder: [...arrayMove(ids, from, to), ...widgetOrder.filter(key => !items.has(key))] });
  };

  return <DashboardLayoutContext.Provider value={{ editing, move: (id, direction) => reorder(id, ids.indexOf(id) + direction) }}>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
      if (editing && over) reorder(String(active.id), ids.indexOf(String(over.id)));
    }} accessibility={{
      screenReaderInstructions: { draggable: 'برای جابه‌جایی فاصله را بزنید، از کلیدهای جهت استفاده کنید و با فاصله تأیید کنید. خروج برای لغو.' },
      announcements: {
        onDragStart: () => 'جابه‌جایی شروع شد.',
        onDragOver: () => undefined,
        onDragEnd: ({ over }) => over ? 'ویجت جابه‌جا شد.' : 'جابه‌جایی لغو شد.',
        onDragCancel: () => 'جابه‌جایی لغو شد.',
      },
    }}>
      <div className="dashboard-layout-container">
        <div className="dashboard-widget-grid dashboard-layout" data-editing={editing}>
          <SortableContext items={ids} strategy={rectSortingStrategy}>
            {ids.map(id => items.get(id))}
          </SortableContext>
        </div>
      </div>
    </DndContext>
  </DashboardLayoutContext.Provider>;
}
