import React from 'react';
import { toPersianNumber } from '../../utils/persianNumberFormatter';

export default function CommissionSummary({values,formatMoney}: {
  values: {sales?: number;received?: number;outstandingCheques?: number;nonCommissionSales?: number;nonCommissionQuantity?: number;
    invoiceCount?: number;lineCount?: number;commissionTotal?: number;unallocated?: number;excluded?: number;deferred?: number};
  formatMoney: (amount:number)=>React.ReactNode;
}) {
  const labels: [keyof typeof values,string,boolean?][] = [
    ['sales','جمع فروش بازه'],['received','دریافت واقعی و چک وصول‌شده در بازه'],['outstandingCheques','چک وصول‌نشده با سررسید در بازه'],
    ['nonCommissionSales','مبلغ کالاهای بدون پورسانت'],['nonCommissionQuantity','تعداد کالاهای بدون پورسانت',true],
    ['invoiceCount','تعداد فاکتور',true],['lineCount','تعداد قلم',true],['commissionTotal','جمع پورسانت'],
    ['unallocated','تخصیص‌نیافته'],['excluded','مستثنا'],['deferred','منتقل به ماه بعد'],
  ];
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
    {labels.filter(([key])=>values[key] !== undefined).map(([key,label,count])=><div key={key}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="font-bold persian-number">{count ? toPersianNumber(values[key] || 0) : formatMoney(values[key] || 0)}</div>
    </div>)}
  </div>;
}
