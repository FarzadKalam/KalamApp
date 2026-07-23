import React, { useMemo } from 'react';
import { Input, InputNumber } from 'antd';
import AdaptiveSelectField from '../AdaptiveSelectField';
import PersianDatePicker from '../PersianDatePicker';
import { amountToPersianRialWords, jalaliDateToPersianWords } from '../../utils/persianWords';
import { safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import {
  formatNumericForInput,
  normalizeNumericString,
  preventNonNumericKeyDown,
  preventNonNumericPaste,
} from '../../utils/persianNumericInput';
import { useCurrencyConfig } from '../../utils/currency';
import { resolveSelectPopupContainer } from '../../utils/popupContainer';

type ChequeValues = Record<string, unknown>;

type ChequePreviewCardProps = {
  values?: ChequeValues | null;
  editable?: boolean;
  disabled?: boolean;
  onFieldChange?: (fieldKey: string, value: any) => void;
  bankOptions?: Array<{ value: string; label: string }>;
  bankMetaById?: Record<
    string,
    {
      bank_name: string | null;
      branch_name: string | null;
      account_holder_name: string | null;
      account_number: string | null;
    }
  >;
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

const getDisplayText = (value: unknown, fallback = '-'): string => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text ? text : fallback;
};

const getRawText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value);
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
  '!h-9 !rounded-[18px] !border-transparent dark:!border-transparent !bg-white/75 dark:!bg-slate-900/55 !text-slate-800 dark:!text-slate-100 shadow-[inset_3px_3px_7px_rgba(148,163,184,0.28),inset_-3px_-3px_7px_rgba(255,255,255,0.8)] dark:shadow-[inset_3px_3px_7px_rgba(0,0,0,0.34),inset_-3px_-3px_7px_rgba(100,116,139,0.16)]';

const tintCardClassName =
  'rounded-[24px] border border-[rgba(var(--brand-600-rgb),0.2)] bg-[rgba(var(--brand-50-rgb),0.62)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.72)] shadow-[7px_7px_15px_rgba(148,163,184,0.2),-7px_-7px_15px_rgba(255,255,255,0.72)] dark:shadow-[7px_7px_15px_rgba(0,0,0,0.3),-5px_-5px_12px_rgba(100,116,139,0.08)]';

const ChequePreviewCard: React.FC<ChequePreviewCardProps> = ({
  values,
  editable = false,
  disabled = false,
  onFieldChange,
  bankOptions = [],
  bankMetaById = {},
}) => {
  const { label: currencyLabel } = useCurrencyConfig();
  const source = values || {};
  const chequeType = String(source.cheque_type || '');
  const isIssuedCheque = chequeType === 'issued';
  const selectedBankAccountId = String(source.bank_account_id || '').trim();
  const selectedBankMeta = selectedBankAccountId ? bankMetaById[selectedBankAccountId] : null;

  const dueDateValue = typeof source.due_date === 'string' ? source.due_date : null;
  const dueDateNumeric = safeJalaliFormat(source.due_date, 'YYYY/MM/DD');
  const dueDateWords = jalaliDateToPersianWords(source.due_date);

  const amount = normalizeAmount(source.amount);
  const amountNumeric = amount === null ? '-' : toPersianNumber(Math.round(amount).toLocaleString('en-US', { maximumFractionDigits: 0 }));
  const amountInWords = amount === null ? '-' : amountToPersianRialWords(amount);

  const serialNoRaw = getRawText(source.serial_no);
  const sayadIdRaw = getRawText(source.sayad_id);
  const bankNameRaw = getRawText(source.bank_name);
  const branchNameRaw = getRawText(source.branch_name);
  const branchCodeRaw = getRawText(source.branch_code);
  const payeeNameRaw = getRawText(source.payee_name);
  const payeeIdentifierRaw = getRawText(source.payee_identifier);
  const accountHolderRaw = getRawText(source.account_holder_name);

  const chequeNumber = formatChequeNumber(serialNoRaw);
  const sayadId = formatSayadId(sayadIdRaw);

  const dateDisplay = useMemo(() => {
    if (!dueDateNumeric) return '----/--/--';
    return toPersianNumber(dueDateNumeric);
  }, [dueDateNumeric]);

  const handleFieldChange = (fieldKey: string, value: any) => {
    if (!onFieldChange) return;
    onFieldChange(fieldKey, value);
  };

  return (
    <div
      dir="rtl"
      className="relative overflow-hidden rounded-[34px] border p-4 md:p-6"
      style={{
        borderColor: 'rgba(var(--brand-600-rgb),0.22)',
        background:
          'linear-gradient(145deg, rgba(var(--brand-100-rgb),0.9), rgba(var(--brand-50-rgb),0.76))',
        boxShadow:
          '18px 18px 38px rgba(148,163,184,0.24), -14px -14px 34px rgba(255,255,255,0.78), inset 0 0 0 1px rgba(255,255,255,0.3)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden dark:block rounded-[34px]"
        style={{
          background:
            'linear-gradient(145deg, rgba(var(--app-dark-surface-rgb),0.96), rgba(var(--app-dark-bg-rgb),0.9))',
          boxShadow: 'inset 0 0 0 1px rgba(148,163,184,0.08)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-25 dark:opacity-15"
        style={{
          backgroundImage:
            'radial-gradient(circle at 10% 12%, rgba(var(--brand-600-rgb),0.34) 0, transparent 42%), radial-gradient(circle at 90% 80%, rgba(var(--brand-accent-pink-rgb),0.24) 0, transparent 44%)',
        }}
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div className="text-right w-full max-w-[240px]">
            <div className="text-[11px] text-slate-700 dark:text-slate-300">تاریخ سررسید</div>
            {editable ? (
              <div className="mt-1">
                <PersianDatePicker
                  type="DATE"
                  value={dueDateValue}
                  onChange={(val) => handleFieldChange('due_date', val)}
                  disabled={disabled}
                  placeholder="انتخاب تاریخ"
                />
              </div>
            ) : (
              <div className="text-sm md:text-base font-bold persian-number text-slate-900 dark:text-slate-100">{dateDisplay}</div>
            )}
            <div className="mt-1 text-[11px] md:text-xs text-slate-700 dark:text-slate-200">{dueDateWords || '-'}</div>
          </div>

          <div className="text-left w-full max-w-[280px]">
            <div className="text-[11px] text-slate-700 dark:text-slate-300">شماره چک</div>
            {editable ? (
              <Input
                className={`${inputClassName} persian-number`}
                value={serialNoRaw}
                onChange={(e) => handleFieldChange('serial_no', e.target.value || null)}
                disabled={disabled}
                placeholder="مثال: ۱۲۳۴/۵۶۷۸۹۰"
              />
            ) : (
              <div className="text-base md:text-lg font-black persian-number text-slate-900 dark:text-slate-100">{chequeNumber}</div>
            )}

            <div className="mt-2 text-[11px] text-slate-700 dark:text-slate-300">شناسه صیادی</div>
            {editable ? (
              <Input
                className={`${inputClassName} persian-number`}
                value={sayadIdRaw}
                onChange={(e) => handleFieldChange('sayad_id', e.target.value || null)}
                disabled={disabled}
                maxLength={19}
                placeholder="16 رقم"
              />
            ) : (
              <div className="text-sm md:text-base font-bold tracking-[0.08em] persian-number text-slate-900 dark:text-slate-100">{sayadId}</div>
            )}
          </div>
        </div>

        <div className={`mt-5 px-4 py-3 text-center ${tintCardClassName}`}>
          <div className="text-[11px] text-slate-700 dark:text-slate-300">بانک</div>

          {editable && isIssuedCheque ? (
            <AdaptiveSelectField
              className="mt-1 text-right"
              value={selectedBankAccountId || undefined}
              onChange={(value) => handleFieldChange('bank_account_id', value || null)}
              disabled={disabled}
              showSearch
              optionFilterProp="label"
              options={bankOptions}
              allowClear
              placeholder="انتخاب حساب بانکی ثبت‌شده"
              getPopupContainer={resolveSelectPopupContainer}
            />
          ) : editable ? (
            <Input
              className={`${inputClassName} mt-1`}
              value={bankNameRaw}
              onChange={(e) => handleFieldChange('bank_name', e.target.value || null)}
              disabled={disabled}
              placeholder="نام بانک"
            />
          ) : (
            <div className="mt-1 text-lg md:text-xl font-black text-slate-900 dark:text-slate-100">{getDisplayText(source.bank_name)}</div>
          )}

          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs md:text-sm text-slate-800 dark:text-slate-100">
            {editable ? (
              <>
                <Input
                  className={inputClassName}
                  value={branchNameRaw}
                  onChange={(e) => handleFieldChange('branch_name', e.target.value || null)}
                  disabled={disabled}
                  placeholder="نام شعبه"
                />
                <Input
                  className={`${inputClassName} persian-number`}
                  value={branchCodeRaw}
                  onChange={(e) => handleFieldChange('branch_code', e.target.value || null)}
                  disabled={disabled}
                  placeholder="کد شعبه"
                />
              </>
            ) : (
              <>
                <span>شعبه: <strong>{getDisplayText(source.branch_name)}</strong></span>
                <span className="persian-number">کد شعبه: <strong>{toPersianNumber(getDisplayText(source.branch_code))}</strong></span>
              </>
            )}
          </div>

          {isIssuedCheque && selectedBankMeta?.account_number && (
            <div className="mt-2 text-xs text-slate-700 dark:text-slate-300 persian-number">
              شماره حساب: {toPersianNumber(selectedBankMeta.account_number)}
            </div>
          )}
        </div>

        <div className="mt-5 space-y-3 text-right">
          <div className={`px-4 py-2 text-sm md:text-base ${tintCardClassName}`}>
            <span className="text-xs md:text-sm text-slate-700 dark:text-slate-300">مبلغ به حروف:</span>
            <div className="mt-1 leading-7 font-semibold text-slate-900 dark:text-slate-100">{amountInWords}</div>
          </div>

          <div
            className={`px-4 py-2 text-sm md:text-base ${tintCardClassName}`}
            style={{ boxShadow: 'inset 0 0 0 1px rgba(var(--brand-accent-pink-rgb),0.22)' }}
          >
            {editable ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Input
                  className={inputClassName}
                  value={payeeNameRaw}
                  onChange={(e) => handleFieldChange('payee_name', e.target.value || null)}
                  disabled={disabled}
                  placeholder="در وجه"
                />
                <Input
                  className={`${inputClassName} persian-number`}
                  value={payeeIdentifierRaw}
                  onChange={(e) => handleFieldChange('payee_identifier', e.target.value || null)}
                  disabled={disabled}
                  placeholder="کد ملی / شناسه ملی"
                />
              </div>
            ) : (
              <>
                <div>
                  <span className="text-xs md:text-sm text-slate-700 dark:text-slate-300">در وجه:</span>
                  <span className="mr-2 font-bold text-slate-900 dark:text-slate-100">{getDisplayText(source.payee_name)}</span>
                </div>
                <div className="mt-1 persian-number">
                  <span className="text-xs md:text-sm text-slate-700 dark:text-slate-300">کد ملی / شناسه ملی:</span>
                  <span className="mr-2 font-bold text-slate-900 dark:text-slate-100">{toPersianNumber(getDisplayText(source.payee_identifier))}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-end justify-between gap-4">
          <div
            className={`w-full max-w-[420px] px-4 py-3 ${tintCardClassName}`}
            style={{ boxShadow: 'inset 0 0 0 1px rgba(var(--brand-600-rgb),0.16)' }}
          >
            <div className="text-xs text-slate-700 dark:text-slate-300">نام صاحب حساب</div>
            {editable ? (
              <Input
                className={`${inputClassName} mt-1`}
                value={accountHolderRaw}
                onChange={(e) => handleFieldChange('account_holder_name', e.target.value)}
                disabled={disabled}
                placeholder="نام صاحب حساب"
              />
            ) : (
              <div className="mt-1 font-bold text-slate-900 dark:text-slate-100">{getDisplayText(source.account_holder_name)}</div>
            )}
          </div>

          <div
            className="rounded-2xl px-4 py-3 min-w-[190px] md:min-w-[240px] shadow-sm bg-[rgba(var(--brand-200-rgb),0.72)] dark:bg-[rgba(var(--brand-700-rgb),0.46)]"
            style={{
              boxShadow: '0 8px 20px -12px rgba(var(--brand-600-rgb),0.35), inset 0 0 0 1px rgba(var(--brand-600-rgb),0.18)',
            }}
          >
            <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-100">مبلغ عددی چک ({currencyLabel})</div>
            {editable ? (
              <InputNumber
                className={`w-full mt-1 ${inputClassName} persian-number`}
                controls={false}
                stringMode
                disabled={disabled}
                value={normalizeNumericString(source.amount)}
                formatter={(val, info) => formatNumericForInput(info?.input ?? val, true)}
                parser={(val) => normalizeNumericString(val)}
                onKeyDown={preventNonNumericKeyDown}
                onPaste={preventNonNumericPaste}
                onChange={(val) => handleFieldChange('amount', val)}
                placeholder={`مبلغ ${currencyLabel}`}
              />
            ) : (
              <div className="mt-1 text-2xl md:text-3xl font-black persian-number text-slate-900 dark:text-slate-100">{amountNumeric}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChequePreviewCard;
