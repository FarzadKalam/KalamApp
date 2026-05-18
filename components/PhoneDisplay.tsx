import React from 'react';
import { toPersianNumber } from '../utils/persianNumberFormatter';
import { getPhoneDisplayMeta } from '../utils/phoneNumber';

type PhoneDisplayProps = {
  value: unknown;
  className?: string;
  emptyText?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
};

const PhoneDisplay: React.FC<PhoneDisplayProps> = ({
  value,
  className = '',
  emptyText = '-',
  size = 'md',
}) => {
  const meta = getPhoneDisplayMeta(value);
  if (!meta.nationalNumber) {
    return <span className={className}>{emptyText}</span>;
  }

  const containerSizeClass =
    size === 'sm' ? 'gap-1.5 text-xs' : size === 'lg' ? 'gap-2.5 text-base' : 'gap-2 text-sm';
  const codeSizeClass =
    size === 'sm'
      ? 'h-7 min-w-[44px] px-1.5 text-[11px] leading-none'
      : size === 'lg'
        ? 'h-9 min-w-[50px] px-2 text-[11px] leading-none'
        : 'h-8 min-w-[56px] px-2 text-xs leading-none';
  const numberSizeClass =
    size === 'sm'
      ? 'min-h-7 px-2.5 py-1 text-xs leading-5 whitespace-normal break-all'
      : size === 'lg'
        ? 'h-9 px-3.5 text-[15px] font-medium'
        : 'h-8 px-3 text-sm';
  const containerClassName = size === 'sm'
    ? `inline-grid max-w-full grid-cols-1 items-start ${containerSizeClass} ${className}`.trim()
    : `inline-grid max-w-full grid-cols-[auto_minmax(0,1fr)] items-center ${containerSizeClass} ${className}`.trim();

  return (
    <span dir="ltr" className={containerClassName}>
      <span
        className={`inline-flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 align-middle text-gray-600 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200 ${size === 'sm' ? 'self-start' : ''} ${codeSizeClass}`}
      >
        {toPersianNumber(meta.dialCodeLabel)}
      </span>
      <span
        className={`persian-number inline-flex max-w-full min-w-0 items-center rounded-lg border border-gray-200 bg-white align-middle text-gray-800 dark:border-gray-700 dark:bg-[#1f1f1f] dark:text-gray-100 ${numberSizeClass}`}
      >
        {toPersianNumber(meta.nationalNumber)}
      </span>
    </span>
  );
};

export default PhoneDisplay;
