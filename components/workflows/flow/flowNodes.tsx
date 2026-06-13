import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Button, Tooltip } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CopyOutlined,
  DeleteOutlined,
  FilterOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { toPersianNumber } from '../../../utils/persianNumberFormatter';
import { getActionVisual } from './actionVisuals';
import { FLOW_NODE_WIDTH } from './flowGraph';

const HANDLE_STYLE: React.CSSProperties = {
  width: 8,
  height: 8,
  background: 'rgba(var(--brand-400-rgb), 0.9)',
  border: 'none',
};

const cardClassName = (isSelected: boolean, extra = '') =>
  [
    'rounded-2xl border bg-white/95 px-4 py-3 shadow-sm transition cursor-pointer',
    'dark:bg-[rgba(var(--app-dark-surface-rgb),0.9)]',
    isSelected
      ? 'border-[rgba(var(--brand-500-rgb),0.95)] ring-2 ring-[rgba(var(--brand-400-rgb),0.45)]'
      : 'border-[rgba(var(--brand-200-rgb),0.7)] hover:border-[rgba(var(--brand-400-rgb),0.8)] dark:border-[rgba(var(--brand-300-rgb),0.22)]',
    extra,
  ]
    .filter(Boolean)
    .join(' ');

type FlowNodeProps = {
  data: Record<string, any>;
};

export const TriggerNode: React.FC<FlowNodeProps> = ({ data }) => (
  <div dir="rtl" className={cardClassName(!!data.isSelected)} style={{ width: FLOW_NODE_WIDTH }}>
    <div className="flex items-center gap-2">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-base"
        style={{ background: 'rgba(var(--brand-50-rgb),1)', color: 'rgba(var(--brand-600-rgb),1)' }}
      >
        <ThunderboltOutlined />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-gray-400">تریگر</span>
          {data.isActive === false ? (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-white/10 dark:text-gray-400">
              غیرفعال
            </span>
          ) : null}
        </div>
        <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
          {String(data.title || 'بدون تریگر')}
        </div>
        {data.summary && data.summary !== data.title ? (
          <div className="truncate text-xs text-gray-500 dark:text-gray-400">{String(data.summary)}</div>
        ) : null}
      </div>
    </div>
    <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} isConnectable={false} />
  </div>
);

export const ConditionsNode: React.FC<FlowNodeProps> = ({ data }) => (
  <div dir="rtl" className={cardClassName(!!data.isSelected)} style={{ width: FLOW_NODE_WIDTH }}>
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE} isConnectable={false} />
    <div className="flex items-center gap-2">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-base"
        style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#d97706' }}
      >
        <FilterOutlined />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium text-gray-400">شرط‌ها</div>
        <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
          {String(data.summary || '')}
        </div>
        {Number(data.allCount) > 0 || Number(data.anyCount) > 0 ? (
          <div className="truncate text-xs text-gray-500 dark:text-gray-400">
            {`الزامی: ${toPersianNumber(Number(data.allCount) || 0)} · کافی: ${toPersianNumber(Number(data.anyCount) || 0)}`}
          </div>
        ) : null}
      </div>
    </div>
    <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} isConnectable={false} />
  </div>
);

export const ActionNode: React.FC<FlowNodeProps> = ({ data }) => {
  const visual = getActionVisual(String(data.actionType || ''));
  const actionId = String(data.actionId || '');
  const index = Number(data.index) || 0;
  const total = Number(data.total) || 0;
  const readOnly = !!data.readOnly;

  const stop = (event: React.MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <div dir="rtl" className={cardClassName(!!data.isSelected)} style={{ width: FLOW_NODE_WIDTH }}>
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} isConnectable={false} />
      <div className="flex items-start gap-2">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-base"
          style={{ background: `${visual.accentColor}1f`, color: visual.accentColor }}
        >
          {visual.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium text-gray-400">{`اقدام ${toPersianNumber(index + 1)}`}</div>
          <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {String(data.label || '')}
          </div>
          {data.summary ? (
            <div className="truncate text-xs text-gray-500 dark:text-gray-400">{String(data.summary)}</div>
          ) : null}
        </div>
      </div>
      {!readOnly ? (
        <div className="mt-2 flex items-center justify-end gap-0.5 border-t border-dashed border-[rgba(var(--brand-200-rgb),0.5)] pt-1.5 dark:border-[rgba(var(--brand-300-rgb),0.18)]" onClick={stop}>
          <Tooltip title="انتقال به بالا">
            <Button
              type="text"
              size="small"
              icon={<ArrowUpOutlined />}
              disabled={index === 0}
              onClick={() => data.onMoveAction?.(actionId, -1)}
            />
          </Tooltip>
          <Tooltip title="انتقال به پایین">
            <Button
              type="text"
              size="small"
              icon={<ArrowDownOutlined />}
              disabled={index >= total - 1}
              onClick={() => data.onMoveAction?.(actionId, 1)}
            />
          </Tooltip>
          <Tooltip title="تکثیر اقدام">
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => data.onDuplicateAction?.(actionId)}
            />
          </Tooltip>
          <Tooltip title="حذف اقدام">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => data.onDeleteAction?.(actionId)}
            />
          </Tooltip>
        </div>
      ) : null}
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} isConnectable={false} />
    </div>
  );
};

export const AddTailNode: React.FC<FlowNodeProps> = ({ data }) => (
  <div
    dir="rtl"
    className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[rgba(var(--brand-300-rgb),0.8)] bg-[rgba(var(--brand-50-rgb),0.5)] px-4 py-3 text-sm font-medium text-[rgba(var(--brand-700-rgb),1)] transition hover:border-[rgba(var(--brand-500-rgb),0.9)] hover:bg-[rgba(var(--brand-50-rgb),0.9)] dark:bg-white/5 dark:text-[rgba(var(--brand-200-rgb),1)] cursor-pointer"
    style={{ width: FLOW_NODE_WIDTH }}
  >
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE} isConnectable={false} />
    <PlusOutlined />
    <span>{data.isEmpty ? 'افزودن اولین اقدام' : 'افزودن اقدام'}</span>
  </div>
);
