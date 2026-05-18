import React, { useMemo } from 'react';
import { Input, Select } from 'antd';
import { toPersianNumber } from '../utils/persianNumberFormatter';
import {
  DEFAULT_PHONE_COUNTRY_CODE,
  PHONE_COUNTRIES,
  getPhoneCountryByCode,
  getPhoneDisplayMeta,
  normalizePhoneDigits,
  normalizePhoneForStorageWithCountry,
} from '../utils/phoneNumber';

type PhoneFieldInputProps = {
  value: unknown;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  compact?: boolean;
};

const PhoneFieldInput: React.FC<PhoneFieldInputProps> = ({
  value,
  onChange,
  disabled = false,
  placeholder,
  compact = false,
}) => {
  const meta = useMemo(() => getPhoneDisplayMeta(value), [value]);

  const countryOptions = useMemo(
    () =>
      PHONE_COUNTRIES.map((country) => ({
        label: (
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-sm text-gray-700 dark:text-gray-200">
              {country.faName}
              <span className="mx-1 text-gray-400">/</span>
              <span className="text-gray-500 dark:text-gray-400">{country.enName}</span>
            </span>
            <span dir="ltr" className="persian-number text-xs text-gray-500 dark:text-gray-400">
              {toPersianNumber(`+${country.dialCode}`)}
            </span>
          </div>
        ),
        value: country.code,
        shortLabel: toPersianNumber(`+${country.dialCode}`),
        searchText: `${country.faName} ${country.enName} +${country.dialCode} ${country.code}`.toLowerCase(),
      })),
    []
  );

  const handleCountryChange = (countryCode: string) => {
    const country = getPhoneCountryByCode(countryCode);
    onChange(normalizePhoneForStorageWithCountry(meta.nationalNumber, country.code));
  };

  const handleNumberChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextDigits = normalizePhoneDigits(event.target.value);
    const activeCountry = getPhoneCountryByCode(meta.country?.code || DEFAULT_PHONE_COUNTRY_CODE);
    onChange(normalizePhoneForStorageWithCountry(nextDigits, activeCountry.code));
  };

  return (
    <div
      className={compact
        ? 'grid w-full grid-cols-1 items-stretch gap-2'
        : 'grid w-full grid-cols-[64px_minmax(0,1fr)] items-stretch gap-2'}
      dir="ltr"
    >
      <Select
        showSearch
        value={meta.country.code}
        disabled={disabled}
        className={`phone-country-select h-8 ${compact ? 'w-full' : ''}`}
        popupMatchSelectWidth={280}
        options={countryOptions}
        optionLabelProp="shortLabel"
        optionFilterProp="searchText"
        filterOption={(input, option) => String(option?.searchText || '').includes(String(input || '').toLowerCase())}
        onChange={handleCountryChange}
        style={{ width: '100%' }}
      />
      <Input
        dir="ltr"
        inputMode="tel"
        disabled={disabled}
        className="w-full persian-number"
        value={toPersianNumber(meta.nationalNumber)}
        onChange={handleNumberChange}
        placeholder={placeholder}
      />
    </div>
  );
};

export default PhoneFieldInput;
