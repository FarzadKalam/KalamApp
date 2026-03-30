import React from 'react';
import { Button, Input, InputNumber, Select, Space } from 'antd';
import { FilterFilled, SearchOutlined } from '@ant-design/icons';
import type { ColumnType } from 'antd/es/table';
import type { FilterConfirmProps } from 'antd/es/table/interface';
import PersianDatePicker from '../PersianDatePicker';
import { fromPersianNumber, toPersianNumber } from '../../utils/persianNumberFormatter';

type FilterOption = {
  label: string;
  value: string | number;
};

const normalizeDigits = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return '';
  return String(value)
    .trim()
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
};

const parseRangeValue = (
  raw: React.Key | boolean | undefined
): { from?: string | number; to?: string | number } => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(String(raw));
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    return {};
  }
  return {};
};

const parseArrayValue = (raw: React.Key | boolean | undefined): string[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (Array.isArray(parsed)) return parsed.map((item) => String(item ?? ''));
  } catch {
    return [];
  }
  return [];
};

const toComparableDate = (raw: any): number | null => {
  const normalized = normalizeDigits(raw);
  if (!normalized) return null;
  const asIso = normalized.includes('/') ? normalized.replace(/\//g, '-') : normalized;
  const ts = new Date(`${asIso}T00:00:00`).getTime();
  return Number.isNaN(ts) ? null : ts;
};

const buildActions = (
  confirm: (param?: FilterConfirmProps) => void,
  clearFilters: (() => void) | undefined,
  close: () => void
) => (
  <Space className="mt-3">
    <Button type="primary" size="small" onClick={() => confirm({ closeDropdown: true } as FilterConfirmProps)}>
      اعمال
    </Button>
    <Button
      size="small"
      onClick={() => {
        clearFilters?.();
        confirm({ closeDropdown: true } as FilterConfirmProps);
      }}
    >
      حذف
    </Button>
    <Button type="link" size="small" onClick={() => close()}>
      بستن
    </Button>
  </Space>
);

export const createTextFilter = <T,>(
  placeholder: string,
  getter: (record: T) => string
): ColumnType<T> => ({
  filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => (
    <div style={{ padding: 8, minWidth: 240 }} onKeyDown={(e) => e.stopPropagation()}>
      <Input
        allowClear
        placeholder={placeholder}
        value={String(selectedKeys?.[0] || '')}
        onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
        onPressEnter={() => confirm({ closeDropdown: true } as FilterConfirmProps)}
      />
      {buildActions(confirm, clearFilters, close)}
    </div>
  ),
  filterIcon: (filtered: boolean) => <SearchOutlined style={{ color: filtered ? 'rgb(var(--brand-500-rgb))' : undefined }} />,
  onFilter: (value, record) => getter(record).toLowerCase().includes(String(value || '').toLowerCase().trim()),
});

export const createNumberRangeFilter = <T,>(
  title: string,
  getter: (record: T) => number | null | undefined
): ColumnType<T> => ({
  filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => {
    const range = parseRangeValue(selectedKeys?.[0]);
    const updateRange = (next: { from?: string | number; to?: string | number }) => {
      if (
        (next.from === undefined || next.from === '' || next.from === null) &&
        (next.to === undefined || next.to === '' || next.to === null)
      ) {
        setSelectedKeys([]);
        return;
      }
      setSelectedKeys([JSON.stringify(next)]);
    };

    return (
      <div style={{ padding: 8, minWidth: 250 }} onKeyDown={(e) => e.stopPropagation()}>
        <div className="mb-2 text-xs text-gray-500">{`فیلتر ${title}`}</div>
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          <InputNumber
            className="w-full"
            controls={false}
            placeholder="از مبلغ"
            value={range.from as number | undefined}
            formatter={(value) => {
              if (value === undefined || value === null) return '';
              const normalized = fromPersianNumber(String(value));
              if (Number.isNaN(normalized)) return '';
              return toPersianNumber(normalized.toLocaleString('en-US'));
            }}
            parser={(value) => {
              const normalized = normalizeDigits(value || '').replace(/,/g, '');
              const parsed = Number(normalized);
              return Number.isFinite(parsed) ? parsed : 0;
            }}
            onChange={(val) => updateRange({ ...range, from: val ?? undefined })}
          />
          <InputNumber
            className="w-full"
            controls={false}
            placeholder="تا مبلغ"
            value={range.to as number | undefined}
            formatter={(value) => {
              if (value === undefined || value === null) return '';
              const normalized = fromPersianNumber(String(value));
              if (Number.isNaN(normalized)) return '';
              return toPersianNumber(normalized.toLocaleString('en-US'));
            }}
            parser={(value) => {
              const normalized = normalizeDigits(value || '').replace(/,/g, '');
              const parsed = Number(normalized);
              return Number.isFinite(parsed) ? parsed : 0;
            }}
            onChange={(val) => updateRange({ ...range, to: val ?? undefined })}
          />
        </Space>
        {buildActions(confirm, clearFilters, close)}
      </div>
    );
  },
  filterIcon: (filtered: boolean) => <FilterFilled style={{ color: filtered ? 'rgb(var(--brand-500-rgb))' : undefined }} />,
  onFilter: (rawValue, record) => {
    const { from, to } = parseRangeValue(rawValue as React.Key);
    const current = Number(getter(record) ?? 0);
    if (Number.isNaN(current)) return false;
    const minVal = from !== undefined ? fromPersianNumber(String(from)) : null;
    const maxVal = to !== undefined ? fromPersianNumber(String(to)) : null;
    if (minVal !== null && current < minVal) return false;
    if (maxVal !== null && current > maxVal) return false;
    return true;
  },
});

export const createDateRangeFilter = <T,>(
  title: string,
  getter: (record: T) => string | null | undefined
): ColumnType<T> => ({
  filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => {
    const range = parseRangeValue(selectedKeys?.[0]);
    const updateRange = (next: { from?: string | number; to?: string | number }) => {
      if (
        (next.from === undefined || next.from === '' || next.from === null) &&
        (next.to === undefined || next.to === '' || next.to === null)
      ) {
        setSelectedKeys([]);
        return;
      }
      setSelectedKeys([JSON.stringify(next)]);
    };

    return (
      <div style={{ padding: 8, minWidth: 250 }} onKeyDown={(e) => e.stopPropagation()}>
        <div className="mb-2 text-xs text-gray-500">{`فیلتر ${title}`}</div>
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          <PersianDatePicker type="DATE" value={String(range.from || '')} onChange={(val) => updateRange({ ...range, from: val || undefined })} />
          <PersianDatePicker type="DATE" value={String(range.to || '')} onChange={(val) => updateRange({ ...range, to: val || undefined })} />
        </Space>
        {buildActions(confirm, clearFilters, close)}
      </div>
    );
  },
  filterIcon: (filtered: boolean) => <FilterFilled style={{ color: filtered ? 'rgb(var(--brand-500-rgb))' : undefined }} />,
  onFilter: (rawValue, record) => {
    const { from, to } = parseRangeValue(rawValue as React.Key);
    const currentDate = toComparableDate(getter(record));
    if (currentDate === null) return false;
    const minDate = from ? toComparableDate(from) : null;
    const maxDate = to ? toComparableDate(to) : null;
    if (minDate !== null && currentDate < minDate) return false;
    if (maxDate !== null && currentDate > maxDate) return false;
    return true;
  },
});

export const createChoiceFilter = <T,>(
  title: string,
  options: FilterOption[],
  getter: (record: T) => string | number | Array<string | number> | null | undefined,
  multiple = true
): ColumnType<T> => ({
  filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => {
    const values = parseArrayValue(selectedKeys?.[0]);
    const updateValues = (nextValues: string[]) => {
      if (!nextValues.length) {
        setSelectedKeys([]);
        return;
      }
      setSelectedKeys([JSON.stringify(nextValues)]);
    };

    return (
      <div style={{ padding: 8, minWidth: 250 }} onKeyDown={(e) => e.stopPropagation()}>
        <div className="mb-2 text-xs text-gray-500">{`فیلتر ${title}`}</div>
        <Select
          mode={multiple ? 'multiple' : undefined}
          allowClear
          className="w-full"
          placeholder="انتخاب کنید"
          value={values}
          options={options.map((item) => ({ label: item.label, value: String(item.value) }))}
          onChange={(next) => {
            const normalized = Array.isArray(next) ? next : next ? [next] : [];
            updateValues(normalized.map((item) => String(item)));
          }}
          optionFilterProp="label"
          showSearch
        />
        {buildActions(confirm, clearFilters, close)}
      </div>
    );
  },
  filterIcon: (filtered: boolean) => <FilterFilled style={{ color: filtered ? 'rgb(var(--brand-500-rgb))' : undefined }} />,
  onFilter: (rawValue, record) => {
    const selected = parseArrayValue(rawValue as React.Key);
    if (!selected.length) return true;
    const current = getter(record);
    if (Array.isArray(current)) {
      const values = current.map((item) => String(item));
      return selected.some((value) => values.includes(value));
    }
    return selected.includes(String(current ?? ''));
  },
});
