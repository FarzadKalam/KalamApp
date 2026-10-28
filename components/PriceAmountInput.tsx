import React from 'react';
import { InputNumber } from 'antd';
import type { InputNumberProps } from 'antd';
import { toPersianNumber } from '../utils/persianNumberFormatter';

type Props = Omit<InputNumberProps, 'controls' | 'formatter' | 'parser' | 'stringMode'> & {
  currencyLabel?: string;
  allowNegative?: boolean;
};

const normalizePrice = (raw: unknown, allowNegative: boolean): string => {
  const digits = String(raw ?? '')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[٬،]/g, ',')
    .replace(/[,\s]/g, '');
  const sign = allowNegative && /[-−–—]/.test(digits) ? '-' : '';
  const numeric = digits.replace(/[^0-9.]/g, '');
  if (!numeric) return sign;
  const rounded = Math.round(Number(numeric));
  return Number.isFinite(rounded) ? `${sign}${rounded}` : sign;
};

const PriceAmountInput: React.FC<Props> = ({ currencyLabel, allowNegative = false, className, ...props }) =>
  <InputNumber
    {...props}
    className={`w-full persian-number ${className || ''}`.trim()}
    controls={false}
    stringMode
    inputMode={allowNegative ? 'text' : 'numeric'}
    suffix={currencyLabel || undefined}
    formatter={(value, info) => {
      const source = info?.userTyping ? (info.input || value) : value;
      const normalized = normalizePrice(source, allowNegative);
      if (!normalized || normalized === '-') return toPersianNumber(normalized);
      const sign = normalized.startsWith('-') ? '-' : '';
      const integer = sign ? normalized.slice(1) : normalized;
      return toPersianNumber(`${sign}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`);
    }}
    parser={(value) => normalizePrice(value, allowNegative)}
  />;

export default PriceAmountInput;
