import React from 'react';
import { CalculatorOutlined, SyncOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { SummaryCalculationType } from '../types';
import { useCurrencyConfig } from '../utils/currency';
import { toPersianNumber } from '../utils/persianNumberFormatter';

interface SummaryCardProps {
  type: SummaryCalculationType;
  data: {
    total: number;
    received?: number;
    remaining?: number;
  };
  labels?: {
    total?: string;
    received?: string;
    remaining?: string;
  };
  onRefresh?: () => void;
  refreshing?: boolean;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ type, data, labels, onRefresh, refreshing = false }) => {
  const { label: currencyLabel } = useCurrencyConfig();
  const formatValue = (value: number) => toPersianNumber((Number(value || 0)).toLocaleString('en-US'));
  const totalLabel = labels?.total || 'جمع کل فاکتور';
  const receivedLabel = labels?.received || 'دریافت شده';
  const remainingLabel = labels?.remaining || 'مانده';

  if (type === SummaryCalculationType.INVOICE_FINANCIALS) {
    return (
      <div className="invoice-summary-card mt-8 bg-leather-600 rounded-2xl p-6 text-white shadow-xl shadow-leather-500/30 flex flex-col md:flex-row md:flex-wrap md:justify-between md:items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-3 rounded-xl"><CalculatorOutlined className="text-2xl" /></div>
          <div>
            <h3 className="text-white font-bold text-lg m-0">خلاصه وضعیت مالی</h3>
            <span className="text-white/70 text-sm">محاسبه خودکار</span>
          </div>
          {onRefresh && (
            <Button
              size="small"
              type="text"
              icon={<SyncOutlined spin={refreshing} />}
              onClick={onRefresh}
              className="!text-white/80 hover:!text-white hover:!bg-white/10"
            />
          )}
        </div>

        <div className="flex flex-col md:flex-row gap-6 md:gap-8 text-center w-full md:w-auto">
          <div className="w-full md:w-auto">
            <div className="text-xs text-white/70 mb-1">{totalLabel}</div>
            <div className="text-2xl font-black font-['Vazirmatn'] persian-number">
              {formatValue(data.total)} <span className="text-sm font-normal opacity-80 font-['Vazirmatn']">{currencyLabel}</span>
            </div>
          </div>
          {data.received !== undefined && (
            <>
              <div className="h-[1px] w-full md:w-[1px] md:h-auto bg-white/20"></div>
              <div className="w-full md:w-auto">
                <div className="text-xs text-green-200 mb-1">{receivedLabel}</div>
                <div className="text-2xl font-black font-['Vazirmatn'] persian-number text-green-100">
                  {formatValue(data.received)} <span className="text-sm font-normal opacity-80 font-['Vazirmatn']">{currencyLabel}</span>
                </div>
              </div>
            </>
          )}
          {data.remaining !== undefined && (
            <>
              <div className="h-[1px] w-full md:w-[1px] md:h-auto bg-white/20"></div>
              <div className="w-full md:w-auto">
                <div className="text-xs text-orange-200 mb-1">{remainingLabel}</div>
                <div className="text-2xl font-black font-['Vazirmatn'] persian-number text-orange-100">
                  {formatValue(data.remaining)} <span className="text-sm font-normal opacity-80 font-['Vazirmatn']">{currencyLabel}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (data.total > 0) {
    return (
      <div className="invoice-summary-card mt-8 bg-leather-600 rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-leather-500/20">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-lg text-white"><CalculatorOutlined /></div>
          <span className="text-white font-bold">جمع کل (برآورد هزینه):</span>
        </div>
        <div className="text-white font-black text-2xl font-['Vazirmatn'] persian-number">
          {formatValue(data.total)} <span className="text-sm font-normal opacity-80 font-['Vazirmatn']">{currencyLabel}</span>
        </div>
      </div>
    );
  }

  return null;
};

export default SummaryCard;
