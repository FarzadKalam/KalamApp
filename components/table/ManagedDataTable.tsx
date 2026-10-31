import React from 'react';
import { Table } from 'antd';
import type { TableProps } from 'antd';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useTableColumnLayout } from '../../hooks/useTableColumnLayout';
import { useTableDragAutoScroll } from '../../hooks/useTableDragAutoScroll';
import { InteractiveTableHeader } from './InteractiveTableHeader';

const components = { header: { cell: InteractiveTableHeader } };

/** Server-backed reports reuse the same resize, ordering and keyboard controls as module lists. */
const ManagedDataTable = <T extends object,>({ scopeKey, columns = [], onColumnOrderChange, ...props }: TableProps<T> & { scopeKey?: string; onColumnOrderChange?: (keys: string[]) => void }) => {
  const root = React.useRef<HTMLDivElement>(null);
  const layout = useTableColumnLayout({ columns, scopeKey, rootRef: root });
  React.useEffect(() => { onColumnOrderChange?.(layout.order); }, [layout.order, onColumnOrderChange]);
  const autoScroll = useTableDragAutoScroll(root);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 7 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  return <div ref={root} className="managed-data-table custom-erp-table smarttable-shell smarttable-with-column-layout" style={{ '--smarttable-body-height': 'min(58vh,560px)' } as React.CSSProperties}>
    <DndContext sensors={sensors} collisionDetection={closestCenter} autoScroll={false}
      onDragMove={autoScroll.move} onDragCancel={autoScroll.stop}
      onDragEnd={({ active, over }) => { autoScroll.stop(); if (over) layout.moveColumn(String(active.id), String(over.id)); }}
      accessibility={{ screenReaderInstructions: { draggable: 'برای جابه‌جایی ستون فاصله را بزنید و با کلیدهای جهت محل را انتخاب کنید.' }, announcements: {
        onDragStart: () => 'ستون برداشته شد.', onDragOver: () => 'محل ستون تغییر کرد.', onDragEnd: () => 'ستون جابه‌جا شد.', onDragCancel: () => 'جابه‌جایی لغو شد.',
      } }}>
      <SortableContext items={layout.order} strategy={horizontalListSortingStrategy}>
        <Table<T> {...props} columns={layout.columns as TableProps<T>['columns']} components={scopeKey ? components : undefined}
          tableLayout="fixed" scroll={{ x: scopeKey ? 'var(--smarttable-total-width)' : 'max-content', y: 'min(58vh,560px)' }} />
      </SortableContext>
    </DndContext>
  </div>;
};

export default ManagedDataTable;
