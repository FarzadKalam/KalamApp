import React from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Position } from '@xyflow/react';
import { PlusOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';

type AddActionEdgeProps = {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  data?: { insertIndex?: number | null; onAddAction?: (insertIndex: number) => void; readOnly?: boolean };
};

export const AddActionEdge: React.FC<AddActionEdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}) => {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition: Position.Bottom,
    targetX,
    targetY,
    targetPosition: Position.Top,
    borderRadius: 12,
  });

  const insertIndex = data?.insertIndex;
  const showAddButton = insertIndex !== null && insertIndex !== undefined && !data?.readOnly;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{ stroke: 'rgba(var(--brand-400-rgb), 0.75)', strokeWidth: 1.6 }}
      />
      {showAddButton ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <Tooltip title="افزودن اقدام در این نقطه">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  data?.onAddAction?.(Number(insertIndex));
                }}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-[rgba(var(--brand-300-rgb),0.9)] bg-white text-xs text-[rgba(var(--brand-600-rgb),1)] shadow-sm transition hover:scale-110 hover:border-[rgba(var(--brand-500-rgb),1)] hover:bg-[rgba(var(--brand-50-rgb),1)] dark:bg-[rgba(var(--app-dark-surface-rgb),1)]"
              >
                <PlusOutlined />
              </button>
            </Tooltip>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
};
