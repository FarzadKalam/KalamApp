import React from 'react';
import { Empty } from 'antd';
import { formatPersianPrice, toPersianNumber } from '../../utils/persianNumberFormatter';

export interface SimpleBarChartItem {
  label: string;
  value: number;
  count?: number;
  tone?: 'increase' | 'decrease';
}

interface SimpleBarChartProps {
  items: SimpleBarChartItem[];
  valueLabel?: string;
  valueFormatter?: (value: number) => React.ReactNode;
}

const SimpleBarChart: React.FC<SimpleBarChartProps> = ({ items, valueLabel = 'مقدار', valueFormatter }) => {
  const safeItems = Array.isArray(items) ? items.filter((item) => Number(item?.value || 0) !== 0) : [];
  const maxValue = safeItems.reduce((max, item) => Math.max(max, Math.abs(Number(item.value || 0))), 0);
  const renderValue = valueFormatter || ((value: number) => formatPersianPrice(value));

  if (!safeItems.length || maxValue <= 0) {
    return <Empty description="برای نمایش نمودار، داده آماری کافی وجود ندارد" />;
  }

  return (
    <div className="space-y-3">
      {safeItems.map((item, index) => {
        const ratio = Math.max(8, Math.round((Math.abs(Number(item.value || 0)) / maxValue) * 100));
        const isDecrease = item.tone === 'decrease' || Number(item.value || 0) < 0;
        const isIncrease = item.tone === 'increase';
        return (
          <div
            key={`${item.label}-${index}`}
            className="rounded-2xl border border-gray-200 bg-white/80 p-3 dark:border-gray-700 dark:bg-white/5"
          >
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <div className="truncate font-bold text-gray-700 dark:text-gray-100">{item.label || '-'}</div>
              <div className="shrink-0 text-xs text-gray-500">
                {valueLabel}: <span className="persian-number font-black text-gray-700 dark:text-gray-100">{renderValue(item.value)}</span>
                {typeof item.count === 'number' && (
                  <span className="mr-2">
                    تعداد: <span className="persian-number font-bold">{toPersianNumber(item.count)}</span>
                  </span>
                )}
              </div>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, ratio)}%`,
                  background: isDecrease
                    ? 'linear-gradient(90deg, #dc2626, #fb7185)'
                    : isIncrease
                      ? 'linear-gradient(90deg, #16a34a, #4ade80)'
                      : 'linear-gradient(90deg, rgb(var(--brand-700-rgb)), rgb(var(--brand-400-rgb)))',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SimpleBarChart;
