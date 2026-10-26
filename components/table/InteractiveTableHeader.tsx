import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { HolderOutlined } from '@ant-design/icons';
import { Dropdown } from 'antd';

export const InteractiveTableHeader = React.memo(({ columnKey, columnLabel, columnWidth, onResizeStart, onResizeWidth, onMoveColumn, canMoveBefore, canMoveAfter, children, className, ...props }: any) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, isOver, activeIndex, index } = useSortable({ id: columnKey || '__selection', disabled: !columnKey });
  return (
    <th {...props} ref={setNodeRef} data-column-key={columnKey} className={[className, columnKey ? 'smarttable-interactive-header' : '', isDragging ? 'is-column-dragging' : '', isOver && !isDragging ? 'is-column-drop-target' : ''].filter(Boolean).join(' ')}>
      {children}
      {isOver && !isDragging ? <span aria-hidden="true" className={`smarttable-column-drop-marker ${activeIndex < index ? 'is-after' : 'is-before'}`} /> : null}
      {columnKey ? <>
        <Dropdown trigger={['click']} menu={{ items: [
          { key: 'before', label: 'انتقال ستون به راست', disabled: !canMoveBefore, onClick: () => onMoveColumn(-1) },
          { key: 'after', label: 'انتقال ستون به چپ', disabled: !canMoveAfter, onClick: () => onMoveColumn(1) },
          { type: 'divider' },
          { key: 'wider', label: 'افزایش عرض ستون', onClick: () => onResizeWidth(columnKey, columnWidth + 24) },
          { key: 'narrower', label: 'کاهش عرض ستون', onClick: () => onResizeWidth(columnKey, columnWidth - 24) },
          { key: 'auto', label: 'عرض خودکار', onClick: () => onResizeWidth(columnKey) },
        ], onClick: ({ domEvent }) => domEvent.stopPropagation() }}>
        <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners}
          className="smarttable-column-grip" aria-label={`جابه‌جایی ستون ${columnLabel}`}
          title={`برای جابه‌جایی ${columnLabel} بکشید؛ برای تنظیمات کلیک کنید`}
          onClick={(event) => event.stopPropagation()}>
          <HolderOutlined />
        </button>
        </Dropdown>
        <span role="separator" tabIndex={0} aria-orientation="vertical" aria-label={`تغییر عرض ستون ${columnLabel}`}
          aria-valuenow={Math.round(columnWidth || 0)} aria-valuemin={64} aria-valuemax={720}
          className="smarttable-column-resize" title="برای تغییر عرض بکشید؛ دوبار کلیک برای عرض خودکار"
          onPointerDown={(event) => onResizeStart(columnKey, event)}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => { event.stopPropagation(); onResizeWidth(columnKey); }}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            onResizeWidth(columnKey, event.key === 'Home' ? undefined : columnWidth + (event.key === 'ArrowLeft' ? 16 : -16));
          }} />
      </> : null}
    </th>
  );
});
