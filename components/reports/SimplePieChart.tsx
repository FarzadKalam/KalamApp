import React, { useMemo } from 'react';
import { Empty } from 'antd';
import { formatPersianPrice, toPersianNumber } from '../../utils/persianNumberFormatter';

export interface SimplePieChartItem {
  label: string;
  value: number;
  count?: number;
  tone?: 'increase' | 'decrease';
}

interface SimplePieChartProps {
  items: SimplePieChartItem[];
  valueLabel?: string;
  valueFormatter?: (value: number) => React.ReactNode;
}

// رنگ نخست از پالت هر Tenant می‌آید و رنگ‌های مکمل برای تفکیک واضح sliceها ساخته می‌شوند.
const PIE_COLORS = [
  'rgb(var(--brand-600-rgb))', 'rgb(var(--brand-accent-pink-rgb))', '#0ea5e9', '#8b5cf6',
  '#10b981', '#f97316', '#ec4899', '#14b8a6',
];

const SimplePieChart: React.FC<SimplePieChartProps> = ({ items, valueLabel = 'مقدار', valueFormatter }) => {
  const safeItems = useMemo(
    () => (Array.isArray(items) ? items.filter((item) => Number(item?.value || 0) !== 0).slice(0, 8) : []),
    [items]
  );
  const total = safeItems.reduce((sum, item) => sum + Math.abs(Number(item.value || 0)), 0);
  const renderValue = valueFormatter || ((value: number) => formatPersianPrice(value));

  const gradient = useMemo(() => {
    if (total <= 0 || safeItems.length === 0) return '';
    let currentPercent = 0;
    return safeItems
      .map((item, index) => {
        const percent = (Math.abs(Number(item.value || 0)) / total) * 100;
        const start = currentPercent;
        const end = currentPercent + percent;
        currentPercent = end;
        const color = item.tone === 'decrease' || Number(item.value || 0) < 0 ? '#dc2626' : '#16a34a';
        return `${color} ${start}% ${end}%`;
      })
      .join(', ');
  }, [safeItems, total]);

  if (!safeItems.length || total <= 0) {
    return <Empty description="برای نمودار دایره‌ای داده کافی وجود ندارد" />;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-center">
      <div className="mx-auto flex w-full max-w-[300px] items-center justify-center">
        <div
          className="relative h-[240px] w-[240px] rounded-full shadow-inner"
          style={{ background: `conic-gradient(${gradient})` }}
        >
          <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-white text-center dark:bg-[#1a1a1a]">
            <div className="text-xs text-gray-500">{valueLabel}</div>
            <div className="persian-number text-lg font-black text-gray-800 dark:text-gray-100">
              {renderValue(total)}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {safeItems.map((item, index) => {
          const ratio = total > 0 ? (Math.abs(Number(item.value || 0)) / total) * 100 : 0;
          return (
            <div
              key={`${item.label}-${index}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white/80 px-4 py-3 dark:border-gray-700 dark:bg-white/5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className="h-3.5 w-3.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.tone === 'decrease' || Number(item.value || 0) < 0 ? '#dc2626' : '#16a34a' }}
                />
                <div className="truncate font-bold text-gray-700 dark:text-gray-100">{item.label || '-'}</div>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs text-gray-500">
                <span className="persian-number font-black text-gray-700 dark:text-gray-100">{renderValue(item.value)}</span>
                <span className="persian-number">{toPersianNumber(ratio.toFixed(1))}%</span>
                {typeof item.count === 'number' && (
                  <span>
                    تعداد: <span className="persian-number font-bold">{toPersianNumber(item.count)}</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SimplePieChart;
