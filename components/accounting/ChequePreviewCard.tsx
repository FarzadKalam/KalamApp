import React, { useMemo } from 'react';
import { Input, InputNumber } from 'antd';
import PersianDatePicker from '../PersianDatePicker';
import { amountToPersianRialWords, jalaliDateToPersianWords } from '../../utils/persianWords';
import { safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import {
  formatNumericForInput,
  normalizeNumericString,
  preventNonNumericKeyDown,
  preventNonNumericPaste,
} from '../../utils/persianNumericInput';

type ChequeValues = Record<string, unknown>;

type ChequePreviewCardProps = {
  values?: ChequeValues | null;
  editable?: boolean;
  disabled?: boolean;
  onFieldChange?: (fieldKey: string, value: any) => void;
};

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

const toEnglishDigits = (value: string) =>
  value.replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)));

const normalizeAmount = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const normalized = toEnglishDigits(String(value)).replace(/,/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
};

const getTextValue = (value: unknown, fallback = '-'): string => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text ? text : fallback;
};

const formatChequeNumber = (serialNo: string) => {
  const normalized = serialNo.trim();
  if (!normalized) return '----/------';

  const parts = normalized.split('/').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return `${toPersianNumber(parts[0])}/${toPersianNumber(parts[1])}`;
  }

  return `${toPersianNumber(normalized)}/-`;
};

const formatSayadId = (sayadId: string) => {
  const digits = toEnglishDigits(sayadId).replace(/\D/g, '').slice(0, 16);
  if (!digits) return '---- ---- ---- ----';
  const grouped = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  return toPersianNumber(grouped);
};

const inputClassName =
  '!h-8 !rounded-lg !border-gray-300 dark:!border-gray-700 !bg-white/90 dark:!bg-white/10 !text-gray-800 dark:!text-gray-100';

const ChequePreviewCard: React.FC<ChequePreviewCardProps> = ({
  values,
  editable = false,
  disabled = false,
  onFieldChange,
}) => {
  const source = values || {};

  const issueDateValue = typeof source.issue_date === 'string' ? source.issue_date : null;
  const issueDateRaw = source.issue_date || source.due_date;
  const issueDateNumeric = safeJalaliFormat(issueDateRaw, 'YYYY/MM/DD');
  const issueDateWords = jalaliDateToPersianWords(issueDateRaw);
  const amount = normalizeAmount(source.amount);
  const amountNumeric = amount === null ? '-' : toPersianNumber(amount.toLocaleString('en-US'));
  const amountInWords = amount === null ? '-' : amountToPersianRialWords(amount);

  const serialNoRaw = getTextValue(source.serial_no, '');
  const sayadIdRaw = getTextValue(source.sayad_id, '');
  const bankNameRaw = getTextValue(source.bank_name, '');
  const branchNameRaw = getTextValue(source.branch_name, '');
  const branchCodeRaw = getTextValue(source.branch_code, '');
  const payeeNameRaw = getTextValue(source.payee_name, '');
  const payeeIdentifierRaw = getTextValue(source.payee_identifier, '');
  const accountHolderRaw = getTextValue(source.account_holder_name, '');

  const chequeNumber = formatChequeNumber(serialNoRaw);
  const sayadId = formatSayadId(sayadIdRaw);

  const dateDisplay = useMemo(() => {
    if (!issueDateNumeric) return '----/--/--';
    return toPersianNumber(issueDateNumeric);
  }, [issueDateNumeric]);

  const handleFieldChange = (fieldKey: string, value: any) => {
    if (!onFieldChange) return;
    onFieldChange(fieldKey, value);
  };

  return (
    <div
      dir="rtl"
      className="relative overflow-hidden rounded-3xl border p-4 md:p-6 shadow-sm"
      style={{
        borderColor: 'rgba(var(--brand-500-rgb),0.26)',
        background:
          'linear-gradient(140deg, rgba(var(--brand-50-rgb),0.96) 0%, rgba(var(--brand-100-rgb),0.82) 45%, rgba(var(--brand-200-rgb),0.6) 100%)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-55"
        style={{
          backgroundImage:
            'radial-gradient(circle at 12% 10%, rgba(var(--brand-400-rgb),0.22) 0, transparent 45%), radial-gradient(circle at 86% 84%, rgba(var(--brand-600-rgb),0.18) 0, transparent 44%)',
        }}
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div className="text-right w-full max-w-[230px]">
            <div className="text-[11px] text-gray-600 dark:text-gray-300">تاریخ</div>
            {editable ? (
              <div className="mt-1">
                <PersianDatePicker
                  type="DATE"
                  value={issueDateValue}
                  onChange={(val) => handleFieldChange('issue_date', val)}
                  disabled={disabled}
                  placeholder="انتخاب تاریخ"
                />
              </div>
            ) : (
              <div className="text-sm md:text-base font-bold tracking-wide persian-number text-gray-800 dark:text-gray-100">
                {dateDisplay}
              </div>
            )}
            <div className="mt-1 text-[11px] md:text-xs text-gray-700 dark:text-gray-200">{issueDateWords || '-'}</div>
          </div>

          <div className="text-left w-full max-w-[260px]">
            <div className="text-[11px] text-gray-600 dark:text-gray-300">شماره چک</div>
            {editable ? (
              <Input
                className={`${inputClassName} persian-number`}
                value={serialNoRaw === '-' ? '' : serialNoRaw}
                onChange={(e) => handleFieldChange('serial_no', e.target.value || null)}
                disabled={disabled}
                placeholder="مثال: ۱۲۳۴/۵۶۷۸۹۰"
              />
            ) : (
              <div className="text-base md:text-lg font-black persian-number text-gray-800 dark:text-gray-100">{chequeNumber}</div>
            )}

            <div className="mt-2 text-[11px] text-gray-600 dark:text-gray-300">شناسه صیادی</div>
            {editable ? (
              <Input
                className={`${inputClassName} persian-number`}
                value={sayadIdRaw === '-' ? '' : sayadIdRaw}
                onChange={(e) => handleFieldChange('sayad_id', e.target.value || null)}
                disabled={disabled}
                maxLength={19}
                placeholder="16 رقم"
              />
            ) : (
              <div className="text-sm md:text-base font-bold tracking-[0.08em] persian-number text-gray-800 dark:text-gray-100">{sayadId}</div>
            )}
          </div>
        </div>

        <div
          className="mt-5 rounded-2xl border px-4 py-3 text-center"
          style={{
            borderColor: 'rgba(var(--brand-500-rgb),0.24)',
            background: 'rgba(255,255,255,0.74)',
          }}
        >
          <div className="text-[11px] text-gray-600">بانک</div>
          {editable ? (
            <Input
              className={`${inputClassName} mt-1`}
              value={bankNameRaw === '-' ? '' : bankNameRaw}
              onChange={(e) => handleFieldChange('bank_name', e.target.value || null)}
              disabled={disabled}
              placeholder="نام بانک"
            />
          ) : (
            <div className="mt-1 text-lg md:text-xl font-black text-gray-900 dark:text-gray-100">{bankNameRaw || '-'}</div>
          )}

          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs md:text-sm text-gray-800 dark:text-gray-100">
            {editable ? (
              <>
                <Input
                  className={inputClassName}
                  value={branchNameRaw === '-' ? '' : branchNameRaw}
                  onChange={(e) => handleFieldChange('branch_name', e.target.value || null)}
                  disabled={disabled}
                  placeholder="نام شعبه"
                />
                <Input
                  className={`${inputClassName} persian-number`}
                  value={branchCodeRaw === '-' ? '' : branchCodeRaw}
                  onChange={(e) => handleFieldChange('branch_code', e.target.value || null)}
                  disabled={disabled}
                  placeholder="کد شعبه"
                />
              </>
            ) : (
              <>
                <span>شعبه: <strong>{branchNameRaw || '-'}</strong></span>
                <span className="persian-number">کد شعبه: <strong>{toPersianNumber(branchCodeRaw || '-')}</strong></span>
              </>
            )}
          </div>
        </div>

        <div className="mt-5 space-y-3 text-right">
          <div
            className="rounded-2xl border px-4 py-2 text-sm md:text-base"
            style={{
              borderColor: 'rgba(var(--brand-500-rgb),0.24)',
              background: 'rgba(255,255,255,0.74)',
            }}
          >
            <span className="text-xs md:text-sm text-gray-600">مبلغ به حروف:</span>
            <div className="mt-1 leading-7 text-gray-900 dark:text-gray-100">{amountInWords}</div>
          </div>

          <div
            className="rounded-2xl border px-4 py-2 text-sm md:text-base"
            style={{
              borderColor: 'rgba(var(--brand-500-rgb),0.24)',
              background: 'rgba(255,255,255,0.74)',
            }}
          >
            {editable ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Input
                  className={inputClassName}
                  value={payeeNameRaw === '-' ? '' : payeeNameRaw}
                  onChange={(e) => handleFieldChange('payee_name', e.target.value || null)}
                  disabled={disabled}
                  placeholder="در وجه"
                />
                <Input
                  className={`${inputClassName} persian-number`}
                  value={payeeIdentifierRaw === '-' ? '' : payeeIdentifierRaw}
                  onChange={(e) => handleFieldChange('payee_identifier', e.target.value || null)}
                  disabled={disabled}
                  placeholder="کد ملی / شناسه ملی"
                />
              </div>
            ) : (
              <>
                <div>
                  <span className="text-xs md:text-sm text-gray-600">در وجه:</span>
                  <span className="mr-2 font-bold text-gray-900 dark:text-gray-100">{payeeNameRaw || '-'}</span>
                </div>
                <div className="mt-1 persian-number">
                  <span className="text-xs md:text-sm text-gray-600">کد ملی / شناسه ملی:</span>
                  <span className="mr-2 font-bold text-gray-900 dark:text-gray-100">{toPersianNumber(payeeIdentifierRaw || '-')}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-end justify-between gap-4">
          <div className="w-full max-w-[320px] text-right">
            <div className="text-xs text-gray-600 mb-1">محل امضا</div>
            <div
              className="h-14 border-b border-dashed"
              style={{ borderColor: 'rgba(var(--brand-600-rgb),0.7)' }}
            />
            <div className="mt-2 text-sm">
              <span className="text-xs text-gray-600">نام صاحب حساب:</span>
              {editable ? (
                <Input
                  className={`${inputClassName} mt-1`}
                  value={accountHolderRaw === '-' ? '' : accountHolderRaw}
                  onChange={(e) => handleFieldChange('account_holder_name', e.target.value || null)}
                  disabled={disabled}
                  placeholder="نام صاحب حساب"
                />
              ) : (
                <span className="mr-2 font-bold text-gray-900 dark:text-gray-100">{accountHolderRaw || '-'}</span>
              )}
            </div>
          </div>

          <div
            className="rounded-2xl border-2 px-4 py-3 min-w-[180px] md:min-w-[220px]"
            style={{
              borderColor: 'rgba(var(--brand-500-rgb),0.55)',
              background: 'rgba(255,255,255,0.92)',
            }}
          >
            <div className="text-[11px] text-gray-600">مبلغ عددی چک (ریال)</div>
            {editable ? (
              <InputNumber
                className={`w-full mt-1 ${inputClassName} persian-number`}
                controls={false}
                stringMode
                disabled={disabled}
                value={source.amount as any}
                formatter={(val, info) => formatNumericForInput(info?.input ?? val, true)}
                parser={(val) => normalizeNumericString(val)}
                onKeyDown={preventNonNumericKeyDown}
                onPaste={preventNonNumericPaste}
                onChange={(val) => handleFieldChange('amount', val)}
                placeholder="مبلغ ریالی"
              />
            ) : (
              <div className="mt-1 text-2xl md:text-3xl font-black persian-number text-gray-900 dark:text-gray-100">{amountNumeric}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChequePreviewCard;
