import React, { useMemo } from 'react';
import { Empty } from 'antd';
import { toPersianNumber } from '../../utils/persianNumberFormatter';

export type SimpleLineChartItem = { label: string; value: number; tone?: 'increase' | 'decrease' };

const SimpleLineChart: React.FC<{ items: SimpleLineChartItem[]; valueFormatter?: (value: number) => React.ReactNode }> = ({ items, valueFormatter }) => {
  const safeItems = useMemo(() => (Array.isArray(items) ? items.filter((item) => Number.isFinite(Number(item?.value))) : []), [items]);
  if (safeItems.length < 2) return <Empty description="برای نمودار خطی حداقل دو گروه لازم است" />;
  const values = safeItems.map((item) => Number(item.value || 0));
  const min = Math.min(0, ...values); const max = Math.max(0, ...values); const range = Math.max(1, max - min);
  const width = 760; const height = 260; const pad = 28;
  const points = safeItems.map((item, index) => ({ x: pad + (index * (width - pad * 2)) / Math.max(1, safeItems.length - 1), y: pad + ((max - Number(item.value || 0)) / range) * (height - pad * 2), ...item }));
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const formatter = valueFormatter || ((value: number) => toPersianNumber(value));
  const pointColor = (item: SimpleLineChartItem) => item.tone === 'decrease' || item.value < 0
    ? '#dc2626'
    : item.tone === 'increase'
      ? '#16a34a'
      : 'rgb(var(--brand-600-rgb))';
  const textColor = (item: SimpleLineChartItem) => item.tone === 'decrease' || item.value < 0
    ? 'text-red-600'
    : item.tone === 'increase'
      ? 'text-green-600'
      : 'text-[rgb(var(--brand-700-rgb))]';
  return <div className="space-y-3 overflow-x-auto"><svg viewBox={`0 0 ${width} ${height}`} className="min-w-[620px] w-full" role="img" aria-label="نمودار خطی گزارش">
    <line x1={pad} x2={width - pad} y1={pad + ((max - 0) / range) * (height - pad * 2)} y2={pad + ((max - 0) / range) * (height - pad * 2)} stroke="#cbd5e1" strokeDasharray="4 4" />
    <path d={path} fill="none" stroke="rgb(var(--brand-600-rgb))" strokeWidth="3" strokeLinejoin="round" />
    {points.map((point, index) => <g key={`${point.label}-${index}`}><circle cx={point.x} cy={point.y} r="5" fill={pointColor(point)} /><text x={point.x} y={height - 7} textAnchor="middle" fontSize="11" fill="#64748b">{point.label}</text></g>)}
  </svg><div className="flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-300">{safeItems.map((item) => <span key={item.label}><b className={textColor(item)}>{item.label}</b>: {formatter(item.value)}</span>)}</div></div>;
};

export default SimpleLineChart;
