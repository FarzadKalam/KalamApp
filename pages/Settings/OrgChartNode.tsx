import React from 'react';
import { Button, Tooltip } from 'antd';
import {
  EditOutlined,
  PlusOutlined,
  DeleteOutlined,
  CaretDownOutlined,
  CaretLeftOutlined,
  HolderOutlined,
} from '@ant-design/icons';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { RoleNode } from './orgChartHelpers';

export const ORG_NODE_WIDTH = 180;

interface OrgChartNodeProps {
  node: RoleNode;
  isSelected: boolean;
  isExpanded: boolean;
  showExpandButton: boolean;
  isDisabled: boolean;
  isBeingDragged: boolean;
  isDropTarget: boolean;
  onEditClick: (id: string) => void;
  onAddChild: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onSelect: (id: string) => void;
}

export const OrgChartNode: React.FC<OrgChartNodeProps> = ({
  node,
  isSelected,
  isExpanded,
  showExpandButton,
  isDisabled,
  isBeingDragged,
  isDropTarget,
  onEditClick,
  onAddChild,
  onDelete,
  onToggleExpand,
  onSelect,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id: node.id, disabled: isDisabled });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: node.id,
    disabled: isDisabled || isBeingDragged,
  });

  const combinedRef = (el: HTMLDivElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };

  const showDropHighlight = (isDropTarget || isOver) && !isBeingDragged;

  const cardStyle: React.CSSProperties = {
    width: `${ORG_NODE_WIDTH}px`,
    minWidth: `${ORG_NODE_WIDTH}px`,
    border: showDropHighlight
      ? '2px dashed rgb(var(--brand-400-rgb))'
      : isSelected
      ? '1.5px solid rgb(var(--brand-500-rgb))'
      : '1px solid rgb(var(--brand-200-rgb))',
    backgroundColor: showDropHighlight
      ? 'rgba(var(--brand-100-rgb), 0.5)'
      : isSelected
      ? 'rgb(var(--brand-50-rgb))'
      : undefined,
    boxShadow: isSelected ? '0 0 0 3px rgba(var(--brand-500-rgb), 0.12)' : undefined,
    opacity: isDragging || isBeingDragged ? 0.4 : 1,
    transition: 'border 0.15s, background-color 0.15s, box-shadow 0.15s, opacity 0.15s',
    cursor: 'pointer',
  };

  return (
    <div
      ref={combinedRef}
      style={cardStyle}
      className="rounded-xl bg-white dark:bg-gray-800 p-3 select-none"
      onClick={() => onSelect(node.id)}
    >
      {/* Title row */}
      <div className="flex items-center gap-2 min-h-[28px]">
        {!isDisabled && (
          <div
            {...attributes}
            {...listeners}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing"
            style={{ color: 'rgba(var(--brand-300-rgb), 1)', fontSize: 14 }}
            onClick={(e) => e.stopPropagation()}
          >
            <HolderOutlined />
          </div>
        )}
        <span
          className="flex-1 text-sm font-bold text-gray-800 dark:text-gray-100 truncate"
          title={node.title}
        >
          {node.title}
        </span>
        {node.is_system && (
          <span className="flex-shrink-0 text-[9px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 rounded px-1 py-0.5 font-mono">
            سیستمی
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
        {/* Left: expand toggle */}
        <div>
          {showExpandButton && (
            <Tooltip title={isExpanded ? 'بستن زیرمجموعه‌ها' : 'باز کردن زیرمجموعه‌ها'}>
              <Button
                type="text"
                size="small"
                icon={isExpanded ? <CaretDownOutlined /> : <CaretLeftOutlined />}
                onClick={(e) => { e.stopPropagation(); onToggleExpand(node.id); }}
                style={{ color: 'rgb(var(--brand-400-rgb))' }}
              />
            </Tooltip>
          )}
        </div>

        {/* Right: edit, add, delete */}
        <div className="flex items-center gap-0.5">
          <Tooltip title="ویرایش دسترسی‌ها">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={(e) => { e.stopPropagation(); onEditClick(node.id); }}
              style={{ color: 'rgb(var(--brand-500-rgb))' }}
            />
          </Tooltip>
          <Tooltip title="افزودن زیرمجموعه">
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              disabled={isDisabled}
              onClick={(e) => { e.stopPropagation(); onAddChild(node.id); }}
              className="text-gray-400 hover:!text-green-600"
            />
          </Tooltip>
          <Tooltip title="حذف جایگاه">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
            />
          </Tooltip>
        </div>
      </div>
    </div>
  );
};
