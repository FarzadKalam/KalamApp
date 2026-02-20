import React from 'react';
import { CalculatorOutlined } from '@ant-design/icons';
import { SummaryCalculationType } from '../types';

interface SummaryCardProps {
  type: SummaryCalculationType;
  data: {
    total: number;
    received?: number;
    remaining?: number;
  };
}

const SummaryCard: React.FC<SummaryCardProps> = ({ type, data }) => {
  if (type === SummaryCalculationType.INVOICE_FINANCIALS) {
    return (
      <div className="mt-8 bg-leather-600 rounded-2xl p-6 text-white shadow-xl shadow-leather-500/30 flex flex-col md:flex-row md:flex-wrap md:justify-between md:items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-3 rounded-xl"><CalculatorOutlined className="text-2xl" /></div>
          <div>
            <h3 className="text-white font-bold text-lg m-0">خلاصه وضعیت مالی</h3>
            <span className="text-white/70 text-sm">محاسبه خودکار</span>
          </div>
        </div>
            
        <div className="flex flex-col md:flex-row gap-6 md:gap-8 text-center w-full md:w-auto">
          <div className="w-full md:w-auto">
            <div className="text-xs text-white/70 mb-1">جمع کل فاکتور</div>
            <div className="text-2xl font-black font-mono">{data.total.toLocaleString()}</div>
          </div>
          {data.received !== undefined && (
          <>
            <div className="h-[1px] w-full md:w-[1px] md:h-auto bg-white/20"></div>
            <div className="w-full md:w-auto">
              <div className="text-xs text-green-200 mb-1">دریافت شده</div>
              <div className="text-2xl font-black font-mono text-green-100">{data.received.toLocaleString()}</div>
            </div>
          </>
          )}
          {data.remaining !== undefined && (
          <>
            <div className="h-[1px] w-full md:w-[1px] md:h-auto bg-white/20"></div>
            <div className="w-full md:w-auto">
              <div className="text-xs text-orange-200 mb-1">مانده</div>
              <div className="text-2xl font-black font-mono text-orange-100">{data.remaining.toLocaleString()}</div>
            </div>
          </>
          )}
        </div>
      </div>
    );
  }

  // حالت پیش‌فرض (BOM و ...)
  if (data.total > 0) {
      return (
        <div className="mt-8 bg-leather-600 rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-leather-500/20">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg text-white"><CalculatorOutlined /></div>
            <span className="text-white font-bold">جمع کل (برآورد هزینه):</span>
          </div>
          <div className="text-white font-black text-2xl font-mono">
            {data.total.toLocaleString()} <span className="text-sm font-normal opacity-80">تومان</span>
          </div>
        </div>
      );
  }

  return null;
};

export default SummaryCard;