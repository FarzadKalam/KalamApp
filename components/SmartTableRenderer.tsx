import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Table, Tag, Avatar, Input, InputNumber, Button, Space, Popover } from 'antd';
import { AppstoreOutlined, SearchOutlined, UserOutlined, TeamOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { ModuleDefinition, FieldType } from '../types';
import { getSafeOptionFallback, getSingleOptionLabel } from '../utils/optionHelpers';
import { toPersianNumber, formatPersianPrice, fromPersianNumber } from '../utils/persianNumberFormatter';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import type { InputRef } from 'antd';
import type { ColumnType, ColumnsType } from 'antd/es/table';
import type { FilterConfirmProps, FilterValue } from 'antd/es/table/interface';
import ProductionStagesField from './ProductionStagesField';
import RelatedRecordPopover from './RelatedRecordPopover';
import { getAssigneeLabel } from '../utils/assigneeLabel';
import PhoneActionsPopover from './PhoneActionsPopover';
import PersianDatePicker from './PersianDatePicker';
import { useCurrencyConfig } from '../utils/currency';
import { getResolvedAssigneeId } from '../utils/assigneeValue';

interface SmartTableRendererProps {
  moduleConfig: ModuleDefinition | null | undefined;
  data: any[];
  loading: boolean;
  visibleColumns?: string[];  // ✅ ستون‌های انتخاب‌شده از View
  rowSelection?: any;
  onRow?: (record: any) => any;
  onChange?: (pagination: any, filters: any, sorter: any, extra: any) => void;
  pagination?: any;
  scrollX?: string | number;
  tableLayout?: 'auto' | 'fixed';
  disableScroll?: boolean;
  dynamicOptions?: Record<string, any[]>;  // ✅ گزینه‌های dynamic برای نمایش برچسب‌های فارسی
  relationOptions?: Record<string, any[]>;  // ✅ گزینه‌های relation برای نمایش برچسب‌های فارسی
  allUsers?: any[];  // ✅ لیست کاربران
  allRoles?: any[];  // ✅ لیست نقش‌ها
  canViewField?: (fieldKey: string) => boolean;
  containerClassName?: string;
  onVisibleDataChange?: (rows: any[]) => void;
  columnFilters?: Record<string, FilterValue | null>;
  onColumnFiltersChange?: (filters: Record<string, FilterValue | null>) => void;
  externalFilterBubbles?: Array<{ id: string; label: string; onRemove?: () => void }>;
  onClearExternalFilters?: () => void;
  sorters?: Array<{ field: string; order: 'asc' | 'desc' }>;
}

const getInitialScrollHeight = () => {
  if (typeof window === 'undefined') return 440;
  const viewportHeight = window.innerHeight || 800;
  if (window.innerWidth < 768) {
    return Math.min(520, Math.max(300, viewportHeight - 290));
  }
  return Math.min(700, Math.max(440, viewportHeight - 320));
};

const SmartTableRenderer: React.FC<SmartTableRendererProps> = ({ 
  moduleConfig, 
  data, 
  loading, 
  visibleColumns,  // ✅ اضافه شد
  rowSelection, 
  onRow,
  onChange,
  pagination,
  scrollX,
  tableLayout,
  disableScroll,
  dynamicOptions = {},  // ✅ اضافه شد
  relationOptions = {},   // ✅ اضافه شد
  allUsers = [],  // ✅ اضافه شد
  allRoles = [],   // ✅ اضافه شد
  canViewField,
  containerClassName,
  onVisibleDataChange,
  columnFilters: controlledColumnFilters,
  onColumnFiltersChange,
  externalFilterBubbles = [],
  onClearExternalFilters,
  sorters = []
}) => {
  const searchInput = useRef<InputRef>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const filterBarRef = useRef<HTMLDivElement>(null);
  const [scrollHeight, setScrollHeight] = useState<number>(() => getInitialScrollHeight());
  const [internalColumnFilters, setInternalColumnFilters] = useState<Record<string, FilterValue | null>>({});
  const assigneeLabel = getAssigneeLabel(moduleConfig?.id);
  const { label: currencyLabel } = useCurrencyConfig();
  const activeColumnFilters = controlledColumnFilters ?? internalColumnFilters;
  const isColumnFiltersControlled = controlledColumnFilters !== undefined;

  const updateColumnFilters = useCallback((nextFilters: Record<string, FilterValue | null>) => {
    if (!isColumnFiltersControlled) {
      setInternalColumnFilters(nextFilters);
    }
    onColumnFiltersChange?.(nextFilters);
  }, [isColumnFiltersControlled, onColumnFiltersChange]);
  const sharedFilterDropdownProps = useMemo(
    () => ({
      getPopupContainer: (triggerNode?: HTMLElement) =>
        triggerNode?.closest?.('.smarttable-shell') as HTMLElement || document.body,
      overlayStyle: { zIndex: 2100 },
    }),
    []
  );

  // ✅ Responsive scroll height
  useEffect(() => {
    const updateScrollHeight = () => {
      const viewportHeight = window.innerHeight || 800;
      if (window.innerWidth < 768) {
        const mobileHeight = Math.min(520, Math.max(300, viewportHeight - 290));
        setScrollHeight(mobileHeight); // موبایل
      } else {
        const desktopHeight = Math.min(700, Math.max(440, viewportHeight - 320));
        setScrollHeight(desktopHeight); // دسکتاپ
      }
    };
    
    updateScrollHeight();
    window.addEventListener('resize', updateScrollHeight);
    return () => window.removeEventListener('resize', updateScrollHeight);
  }, []);

  useEffect(() => {
    if (!isColumnFiltersControlled) {
      setInternalColumnFilters({});
    }
  }, [isColumnFiltersControlled, moduleConfig?.id]);

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
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch {
      return {};
    }
    return {};
  };

  const toComparableTime = (raw: any): number | null => {
    const normalized = normalizeDigits(raw);
    if (!normalized) return null;
    const match = normalized.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const hh = Number(match[1]);
    const mm = Number(match[2]);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    return (hh * 60) + mm;
  };

  const toComparableDate = (raw: any, withTime: boolean): number | null => {
    const normalized = normalizeDigits(raw);
    if (!normalized) return null;
    const asIso = normalized.includes('/') ? normalized.replace(/\//g, '-') : normalized;
    const value = withTime ? asIso.replace(' ', 'T') : `${asIso}T00:00:00`;
    const ts = new Date(value).getTime();
    return Number.isNaN(ts) ? null : ts;
  };

  // --- لاجیک جستجوی ستونی (بهینه شده) ---
  const handleSearch = (_selectedKeys: string[], confirm: (param?: FilterConfirmProps) => void) => {
    confirm();
  };

  const handleReset = (clearFilters: () => void, confirm: any) => {
    clearFilters();
    confirm();
  };

  const handleTableChange = (
    paginationValue: any,
    nextFilters: Record<string, FilterValue | null>,
    sorter: any,
    extra: any
  ) => {
    const resolvedFilters = extra?.action === 'filter' ? (nextFilters || {}) : activeColumnFilters;
    if (extra?.action === 'filter') {
      updateColumnFilters(resolvedFilters);
    }
    onChange?.(paginationValue, resolvedFilters, sorter, extra);
  };

  if (!moduleConfig || !moduleConfig.fields) return null;

  const getColumnSearchProps = (dataIndex: string, title: string): ColumnType<any> => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          ref={searchInput}
          placeholder={`جستجو در ${title}`}
          value={selectedKeys[0]}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => handleSearch(selectedKeys as string[], confirm)}
          style={{ marginBottom: 8, display: 'block' }}
        />
        <Space>
          <Button
            type="primary"
            onClick={() => handleSearch(selectedKeys as string[], confirm)}
            icon={<SearchOutlined />}
            size="small"
            style={{ width: 90 }}
          >
            بگرد
          </Button>
          <Button
            onClick={() => clearFilters && handleReset(clearFilters, confirm)}
            size="small"
            style={{ width: 90 }}
          >
            حذف
          </Button>
          <Button type="link" size="small" onClick={() => close()}>بستن</Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered: boolean) => (
      <SearchOutlined style={{ color: filtered ? 'rgb(var(--brand-500-rgb))' : undefined }} />
    ),
    onFilter: (value, record) => {
        const text = record[dataIndex] ? record[dataIndex].toString() : '';
        return text.toLowerCase().includes((value as string).toLowerCase());
    },
    filterDropdownProps: {
      ...sharedFilterDropdownProps,
      onOpenChange: (visible) => {
        if (visible) {
          setTimeout(() => searchInput.current?.select(), 100);
        }
      },
    },
  });

  const getRangeFilterProps = (
    dataIndex: string,
    title: string,
    kind: 'PRICE' | 'DATE' | 'TIME' | 'DATETIME'
  ): ColumnType<any> => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => {
      const range = parseRangeValue(selectedKeys[0]);
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
        <div style={{ padding: 8, minWidth: 240 }} onKeyDown={(e) => e.stopPropagation()}>
          <div className="mb-2 text-xs text-gray-500">{`فیلتر ${title}`}</div>
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            {kind === 'PRICE' ? (
              <>
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
              </>
            ) : kind === 'DATE' || kind === 'DATETIME' ? (
              <>
                <PersianDatePicker
                  type={kind === 'DATE' ? 'DATE' : 'DATETIME'}
                  value={range.from ? String(range.from) : null}
                  onChange={(value) => updateRange({ ...range, from: value ?? undefined })}
                  placeholder={kind === 'DATE' ? 'از تاریخ' : 'از تاریخ و زمان'}
                  className="w-full"
                />
                <PersianDatePicker
                  type={kind === 'DATE' ? 'DATE' : 'DATETIME'}
                  value={range.to ? String(range.to) : null}
                  onChange={(value) => updateRange({ ...range, to: value ?? undefined })}
                  placeholder={kind === 'DATE' ? 'تا تاریخ' : 'تا تاریخ و زمان'}
                  className="w-full"
                />
              </>
            ) : (
              <>
                <Input
                  placeholder={kind === 'TIME' ? 'از زمان (HH:mm)' : 'از تاریخ'}
                  value={range.from as string | undefined}
                  onChange={(e) => updateRange({ ...range, from: e.target.value || undefined })}
                />
                <Input
                  placeholder={kind === 'TIME' ? 'تا زمان (HH:mm)' : 'تا تاریخ'}
                  value={range.to as string | undefined}
                  onChange={(e) => updateRange({ ...range, to: e.target.value || undefined })}
                />
              </>
            )}
          </Space>
          <Space className="mt-3">
            <Button type="primary" size="small" onClick={() => confirm()}>
              اعمال
            </Button>
            <Button
              size="small"
              onClick={() => {
                if (clearFilters) {
                  clearFilters();
                }
                confirm();
              }}
            >
              حذف
            </Button>
            <Button type="link" size="small" onClick={() => close()}>
              بستن
            </Button>
          </Space>
        </div>
      );
    },
    filterIcon: (filtered: boolean) => (
      <SearchOutlined style={{ color: filtered ? 'rgb(var(--brand-500-rgb))' : undefined }} />
    ),
    filterDropdownProps: sharedFilterDropdownProps,
    onFilter: (rawValue, record) => {
      const { from, to } = parseRangeValue(rawValue as React.Key);
      const recordValue = record[dataIndex];

      if (kind === 'PRICE') {
        const minVal = from !== undefined ? fromPersianNumber(String(from)) : null;
        const maxVal = to !== undefined ? fromPersianNumber(String(to)) : null;
        const current = Number(recordValue);
        if (Number.isNaN(current)) return false;
        if (minVal !== null && current < minVal) return false;
        if (maxVal !== null && current > maxVal) return false;
        return true;
      }

      if (kind === 'TIME') {
        const minTime = from ? toComparableTime(from) : null;
        const maxTime = to ? toComparableTime(to) : null;
        const current = toComparableTime(recordValue);
        if (current === null) return false;
        if (minTime !== null && current < minTime) return false;
        if (maxTime !== null && current > maxTime) return false;
        return true;
      }

      const withTime = kind === 'DATETIME';
      const minDate = from ? toComparableDate(from, withTime) : null;
      const maxDate = to ? toComparableDate(to, withTime) : null;
      const currentDate = toComparableDate(recordValue, withTime);
      if (currentDate === null) return false;
      if (minDate !== null && currentDate < minDate) return false;
      if (maxDate !== null && currentDate > maxDate) return false;
      return true;
    },
  });

  // ✅ فیلتر تگ‌ها (برای ستون‌های تگ) - مشابه MULTI_SELECT
  const getTagFilterProps = (dataIndex: string, _title: string) => {
    const allTags = new Map<string, string>();
    data.forEach((record: any) => {
      const tags = record[dataIndex];
      if (Array.isArray(tags)) {
        tags.forEach((tag: any) => {
          const tagValue = typeof tag === 'string' ? tag : (tag.title || tag.label || tag.id);
          allTags.set(tagValue, tagValue);
        });
      }
    });

    return {
      filters: Array.from(allTags.values()).map(tag => ({ text: tag, value: tag })),
      multiple: true,
      onFilter: (value: string, record: any) => {
        const tags = record[dataIndex];
        if (!Array.isArray(tags)) return false;
        return tags.some((tag: any) => {
          const tagValue = typeof tag === 'string' ? tag : (tag.title || tag.label || tag.id);
          return tagValue === value;
        });
      }
    };
  };

  // --- ساخت ستون‌ها ---
  let tableFields = moduleConfig.fields
    .filter(f => f.isTableColumn)
    .filter(f => (canViewField ? canViewField(f.key) !== false : true))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  // اگر visibleColumns مشخص است، از آن استفاده کن
  if (visibleColumns && visibleColumns.length > 0) {
      tableFields = visibleColumns
        .map(colKey => moduleConfig.fields.find(f => f.key === colKey))
        .filter(f => f !== undefined)
        .filter(f => (canViewField ? canViewField((f as any).key) !== false : true)) as any[];
  }
  // Fallback: اگر هیچ visibleColumns یا isTableColumn نیست
  else if (tableFields.length === 0) {
      tableFields = moduleConfig.fields.filter(f => 
          ['name', 'title', 'business_name', 'system_code', 'sell_price', 'stock_quantity', 'status', 'mobile_1', 'rank'].includes(f.key)
      );
  }

  // ✅ ترتیب مجدد ستون‌ها: اول تصویر، سپس نام، سپس تگ‌ها، سپس بقیه
  const tagsField = tableFields.find(f => f.type === FieldType.TAGS);
  const imageField = tableFields.find(f => f.type === FieldType.IMAGE);
  const keyField = tableFields.find(f => f.isKey || ['name', 'title', 'business_name'].includes(f.key));
  const otherFields = tableFields.filter(f => f !== tagsField && f !== imageField && f !== keyField);
  
  if (imageField && keyField && tagsField) {
    tableFields = [imageField, keyField, tagsField, ...otherFields];
  } else if (keyField && tagsField) {
    tableFields = [keyField, tagsField, ...otherFields];
  } else if (imageField && keyField) {
    tableFields = [imageField, keyField, ...otherFields];
  } else if (keyField) {
    tableFields = [keyField, ...otherFields];
  }

  const resolveFieldFilterOptions = (field: any) => {
    let options: { text: string; value: string | number }[] = [];
    if (field.options) {
      options = field.options.map((o: any) => ({ text: o.label, value: o.value }));
    } else if ((field as any).dynamicOptionsCategory) {
      const category = (field as any).dynamicOptionsCategory;
      const dynopts = dynamicOptions[category] || [];
      options = dynopts.map((o: any) => ({ text: o.label, value: o.value }));
    } else if (field.type === FieldType.RELATION || field.type === FieldType.USER) {
      const relopts =
        relationOptions[field.key] ||
        relationOptions[(field as any).relationConfig?.targetModule] ||
        relationOptions.profiles ||
        [];
      options = relopts.map((o: any) => ({ text: o.label, value: o.value }));
    }
    return options.length > 0 ? options : undefined;
  };

  const columns: ColumnsType<any> = tableFields.map(field => {
    const isSearchable = field.type === FieldType.TEXT || field.key.includes('name') || field.key.includes('code') || field.key.includes('title');
    const isTagField = field.type === FieldType.TAGS;
    const hasChoiceFilter =
      !isTagField &&
      (field.type === FieldType.STATUS ||
        field.type === FieldType.SELECT ||
        field.type === FieldType.MULTI_SELECT ||
        field.type === FieldType.RELATION ||
        field.type === FieldType.USER);
    const choiceOptions = hasChoiceFilter ? resolveFieldFilterOptions(field) : undefined;
    const tagFilterProps = isTagField ? getTagFilterProps(field.key, field.labels.fa) : {};

    const formatPersianDate = (val: any, kind: 'DATE' | 'TIME' | 'DATETIME') => {
      if (!val) return null;
      try {
        let dateObj: DateObject;
        if (kind === 'TIME') {
          dateObj = new DateObject({
            date: `1970-01-01 ${val}`,
            format: 'YYYY-MM-DD HH:mm',
            calendar: gregorian,
            locale: gregorian_en,
          });
        } else if (kind === 'DATE') {
          dateObj = new DateObject({
            date: val,
            format: 'YYYY-MM-DD',
            calendar: gregorian,
            locale: gregorian_en,
          });
        } else {
          const jsDate = new Date(val);
          if (Number.isNaN(jsDate.getTime())) return null;
          dateObj = new DateObject({
            date: jsDate,
            calendar: gregorian,
            locale: gregorian_en,
          });
        }
        const format = kind === 'DATE' ? 'YYYY/MM/DD' : kind === 'TIME' ? 'HH:mm' : 'YYYY/MM/DD HH:mm';
        return dateObj.convert(persian, persian_fa).format(format);
      } catch {
        return null;
      }
    };

    const activeSorter = sorters.find((item) => String(item?.field || '') === String(field.key));
    const sortOrder =
      activeSorter?.order === 'asc'
        ? 'ascend'
        : activeSorter?.order === 'desc'
          ? 'descend'
          : null;
    const canSortField = ![
      FieldType.IMAGE,
      FieldType.TAGS,
      FieldType.PROGRESS_STAGES,
    ].includes(field.type);

    return {
      title: <span className="text-[11px] text-gray-500">{field.labels.fa}</span>,
      dataIndex: field.key,
      key: field.key,
      width: field.key === 'id' ? 60 : isTagField ? 110 : undefined,
      filteredValue: activeColumnFilters[field.key] ?? null,
      sorter: canSortField,
      sortOrder,
      sortDirections: ['ascend', 'descend'],
      showSorterTooltip: false,
      sortIcon: () =>
        canSortField ? (
          <span className="inline-flex flex-col leading-none text-[9px] mr-1 text-gray-300">
            <ArrowUpOutlined className={sortOrder === 'ascend' ? 'text-leather-600' : ''} />
            <ArrowDownOutlined className={sortOrder === 'descend' ? 'text-leather-600 -mt-[1px]' : '-mt-[1px]'} />
          </span>
        ) : null,
      filterDropdownProps: sharedFilterDropdownProps,
      
      ...(isSearchable ? getColumnSearchProps(field.key, field.labels.fa) : {}),
      ...tagFilterProps,
      ...(field.type === FieldType.PRICE ? getRangeFilterProps(field.key, field.labels.fa, 'PRICE') : {}),
      ...(field.type === FieldType.DATE ? getRangeFilterProps(field.key, field.labels.fa, 'DATE') : {}),
      ...(field.type === FieldType.TIME ? getRangeFilterProps(field.key, field.labels.fa, 'TIME') : {}),
      ...(field.type === FieldType.DATETIME ? getRangeFilterProps(field.key, field.labels.fa, 'DATETIME') : {}),

      filters: (tagFilterProps as any)?.filters ?? (hasChoiceFilter ? choiceOptions : undefined),
      onFilter: (tagFilterProps as any)?.onFilter ?? (hasChoiceFilter
          ? (value, record) => {
              const recordValue = record[field.key];
              if (field.type === FieldType.MULTI_SELECT && Array.isArray(recordValue)) {
                return recordValue.map((item: any) => String(item)).includes(String(value));
              }
              return String(recordValue ?? '') === String(value ?? '');
            }
          : undefined),

      render: (value: any, record: any) => {
        // Shared fallback for empty/invalid dates
        const emptyDateCell = <span className="dir-ltr text-gray-500 font-mono text-[11px]">-</span>;
        
        if (field.type === FieldType.IMAGE) {
            return <Avatar src={value} icon={<AppstoreOutlined />} shape="square" size="default" className="bg-gray-100 border border-gray-200" />;
        }
        if (field.type === FieldType.DATE && value) {
          const formatted = formatPersianDate(value, 'DATE');
          if (!formatted) return emptyDateCell;
          return <span className="dir-ltr text-gray-500 font-medium text-[11px]">{formatted}</span>;
        }
        if (field.type === FieldType.TIME && value) {
          const formatted = formatPersianDate(value, 'TIME');
          if (!formatted) return emptyDateCell;
          return <span className="dir-ltr text-gray-500 font-medium text-[11px]">{formatted}</span>;
        }
        if (field.type === FieldType.DATETIME && value) {
          const formatted = formatPersianDate(value, 'DATETIME');
          if (!formatted) return emptyDateCell;
          return <span className="dir-ltr text-gray-500 font-medium text-[11px]">{formatted}</span>;
        }
        if (field.type === FieldType.STATUS) {
            const opt = field.options?.find(o => o.value === value);
            const label = opt?.label || value;
            return <Tag color={opt?.color || 'default'} style={{fontSize: '10px', marginRight: 0}}>{label}</Tag>;
        }
        if (field.type === FieldType.SELECT) {
            const label = getSingleOptionLabel(field, value, dynamicOptions, relationOptions);
            return <span className="text-xs text-gray-600 dark:text-gray-300">{label}</span>;
        }
        if (field.type === FieldType.RELATION) {
            const label = getSingleOptionLabel(field, value, dynamicOptions, relationOptions);
            const targetModule = (field as any)?.relationConfig?.targetModule;
            if (!targetModule || !value) {
              return <span className="text-xs text-leather-600 hover:underline font-medium">{label}</span>;
            }
            return (
              <RelatedRecordPopover moduleId={targetModule} recordId={String(value)} label={String(label || value)}>
                <span className="text-xs text-leather-600 hover:underline font-medium">{label}</span>
              </RelatedRecordPopover>
            );
        }
        if (field.type === FieldType.USER) {
            if (!value) return '-';
            // Try to find the label from relationOptions
            const userLabel = 
              relationOptions[field.key]?.find((o: any) => o.value === value)?.label ||
              relationOptions['profiles']?.find((o: any) => o.value === value)?.label || 
              getSafeOptionFallback(value);
            return (
              <RelatedRecordPopover moduleId="profiles" recordId={String(value)} label={String(userLabel)}>
                <span className="text-xs text-leather-600 hover:underline font-medium">{userLabel}</span>
              </RelatedRecordPopover>
            );
        }
        const isProcessStagesCell = (
          field.type === FieldType.PROGRESS_STAGES
          || ['execution_process_draft', 'marketing_process_draft', 'production_stages_draft'].includes(String(field.key || ''))
        );
        if (isProcessStagesCell) {
          const draftKey = field.type === FieldType.PROGRESS_STAGES
            ? (moduleConfig?.id === 'production_orders' || moduleConfig?.id === 'production_boms'
              ? 'production_stages_draft'
              : String(field.key || 'production_stages_draft'))
            : String(field.key || 'production_stages_draft');
          const draftStages = Array.isArray(record?.[draftKey]) ? record[draftKey] : [];
          return (
            <div style={{ minWidth: 200 }}>
              <ProductionStagesField
                recordId={record.id}
                moduleId={moduleConfig?.id}
                readOnly={true}
                compact={true}
                allowReportEditInReadOnly={true}
                lazyLoad={true}
                draftStages={draftStages}
                showWageSummary={false}
              />
            </div>
          );
        }
          
        if (field.type === FieldType.TAGS) {
            if (!Array.isArray(value) || value.length === 0) {
              return <span className="inline-flex min-h-[18px] items-center text-xs text-gray-400">-</span>;
            }
            
            const firstTag = value.slice(0, 1);
            const remainingTags = value.slice(1);
            
            return (
              <div className="flex min-h-[18px] flex-wrap gap-1 items-center">
                {firstTag.map((tag: any, idx: number) => {
                  const tagTitle = typeof tag === 'string' ? tag : tag.title || tag.label;
                  const tagColor = typeof tag === 'string' ? 'blue' : (tag.color || 'blue');
                  return (
                    <Tag key={idx} color={tagColor} style={{fontSize: '9px', marginRight: 0, padding: '1px 4px', lineHeight: '14px'}}>
                      {tagTitle}
                    </Tag>
                  );
                })}
                {remainingTags.length > 0 && (
                  <Popover
                    content={
                      <div className="flex flex-wrap gap-1">
                        {remainingTags.map((tag: any, idx: number) => {
                          const tagTitle = typeof tag === 'string' ? tag : tag.title || tag.label;
                          const tagColor = typeof tag === 'string' ? 'blue' : (tag.color || 'blue');
                          return (
                            <Tag key={idx} color={tagColor} style={{fontSize: '9px', marginRight: 0, padding: '2px 6px'}}>
                              {tagTitle}
                            </Tag>
                          );
                        })}
                      </div>
                    }
                    title={`${remainingTags.length} برچسب بیشتر`}
                    trigger="click"
                  >
                    <span className="text-[9px] text-gray-500 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600">
                      +{remainingTags.length}
                    </span>
                  </Popover>
                )}
              </div>
            );
        }
        if (field.type === FieldType.MULTI_SELECT) {
            if (!Array.isArray(value) || value.length === 0) return '-';
            return (
              <div className="flex flex-wrap gap-1">
                {value.map((val: any, idx: number) => {
                  const label = getSingleOptionLabel(field, val, dynamicOptions, relationOptions);
                  return (
                    <Tag key={idx} color="default" style={{fontSize: '9px', marginRight: 0, backgroundColor: '#fef3c7', borderColor: '#d97706', color: '#92400e'}} className="font-medium">
                      {label}
                    </Tag>
                  );
                })}
              </div>
            );
        }
        if (field.type === FieldType.PRICE) {
            if (value === null || value === undefined || value === '') return '-';
            const persianPrice = formatPersianPrice(value, true);
            return (
              <div className="leading-tight">
                <span className="font-bold text-gray-700 dark:text-gray-300 text-xs persian-number">{persianPrice}</span>
                <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{currencyLabel}</div>
              </div>
            );
        }
        if (field.type === FieldType.STOCK || field.type === FieldType.NUMBER) {
             const persianNum = toPersianNumber(value);
             if (field.type === FieldType.STOCK) {
               const reorderPoint = record.reorder_point || 10;
               const color = value <= 0 ? 'red' : value <= reorderPoint ? 'orange' : 'green';
               return <span style={{ color }} className="font-bold text-xs persian-number">{persianNum}</span>;
             }
             return <span className="text-xs text-gray-600 dark:text-gray-300 persian-number">{persianNum}</span>;
        }
        if (field.type === FieldType.PERCENTAGE) {
             const persianPercent = toPersianNumber(Number(value).toFixed(1)) + '%';
             return <span className="text-xs text-gray-600 dark:text-gray-300 persian-number">{persianPercent}</span>;
         }
        if (field.type === FieldType.PHONE) {
             return (
               <PhoneActionsPopover
                 value={value}
                 size="sm"
                 moduleId={moduleConfig?.id}
                 record={record}
                 className="text-gray-600 dark:text-gray-300"
               />
             );
        }
        if (field.isKey || ['name', 'title', 'business_name'].includes(field.key)) {
             return (
                <span className="text-leather-600 font-bold text-sm hover:underline">
                    {value}
                </span>
            );
        }
        return <span className="text-xs text-gray-600 dark:text-gray-300">{value}</span>;
      }
    };
  });

  // ✅ اضافه کردن ستون assignee به انتهای تمام جداول
  if (!canViewField || canViewField('assignee_id') !== false) {
    const assigneeFilterOptions = [
      ...allUsers.map((user: any) => ({ text: user.full_name || user.display_name || user.id, value: user.id })),
      ...allRoles
        .filter((role: any) => !allUsers.some((user: any) => String(user?.id) === String(role?.id)))
        .map((role: any) => ({ text: role.title || role.name || role.id, value: role.id })),
    ];
    const assigneeSorter = sorters.find((item) => String(item?.field || '') === 'assignee_id');
    const assigneeSortOrder =
      assigneeSorter?.order === 'asc'
        ? 'ascend'
        : assigneeSorter?.order === 'desc'
          ? 'descend'
          : null;
    columns.push({
    title: <span className="text-[11px] text-gray-500">{assigneeLabel}</span>,
    dataIndex: 'assignee_id',
    key: 'assignee_id',
    width: 120,
    filteredValue: activeColumnFilters.assignee_id ?? null,
    sorter: true,
    sortOrder: assigneeSortOrder,
    sortDirections: ['ascend', 'descend'],
    showSorterTooltip: false,
    sortIcon: () => (
      <span className="inline-flex flex-col leading-none text-[9px] mr-1 text-gray-300">
        <ArrowUpOutlined className={assigneeSortOrder === 'ascend' ? 'text-leather-600' : ''} />
        <ArrowDownOutlined className={assigneeSortOrder === 'descend' ? 'text-leather-600 -mt-[1px]' : '-mt-[1px]'} />
      </span>
    ),
    filterDropdownProps: sharedFilterDropdownProps,
    filterSearch: true,
    filters: assigneeFilterOptions,
    onFilter: (value, record) => String(getResolvedAssigneeId(record) ?? '') === String(value ?? ''),
    render: (_: any, record: any) => {
      const assigneeId = getResolvedAssigneeId(record);
      const assigneeType = record.assignee_type;
      
      if (!assigneeId) {
        return <span className="text-[10px] text-gray-300">-</span>;
      }
      
      if (assigneeType === 'user') {
        const user = allUsers.find(u => u.id === assigneeId);
        if (user) {
          return (
            <div className="flex items-center gap-1">
              {user.avatar_url ? (
                <Avatar src={user.avatar_url} size="small" />
              ) : (
                <Avatar icon={<UserOutlined />} size="small" />
              )}
              <span className="text-[10px] text-gray-600 dark:text-gray-300 truncate max-w-[80px]">{user.full_name}</span>
            </div>
          );
        }
      } else if (assigneeType === 'role') {
        const role = allRoles.find(r => r.id === assigneeId);
        if (role) {
          return (
            <div className="flex items-center gap-1">
              <Avatar icon={<TeamOutlined />} size="small" className="bg-blue-100 text-blue-600" />
              <span className="text-[10px] text-gray-600 dark:text-gray-300 truncate max-w-[80px]">{role.title}</span>
            </div>
          );
        }
      }
      
      return <span className="text-[10px] text-gray-400">نامشخص</span>;
    }
    });
  }

  const activeColumnFilterBubbles = (() => {
    const fieldsMap = new Map(tableFields.map((field: any) => [field.key, field]));
    if (!fieldsMap.has('assignee_id') && (!canViewField || canViewField('assignee_id') !== false)) {
      fieldsMap.set('assignee_id', {
        key: 'assignee_id',
        labels: { fa: assigneeLabel },
        type: FieldType.USER,
      });
    }
    const bubbles: Array<{ id: string; fieldKey: string; rawValue: string; label: string }> = [];

    Object.entries(activeColumnFilters).forEach(([fieldKey, values]) => {
      if (!Array.isArray(values) || values.length === 0) return;
      const field: any = fieldsMap.get(fieldKey);
      const fieldLabel = field?.labels?.fa || fieldKey;
      const options = field ? resolveFieldFilterOptions(field) || [] : [];

      values.forEach((raw) => {
        if (raw === undefined || raw === null || raw === '') return;
        const rawValue = String(raw);
        let valueLabel = rawValue;

        if (
          field?.type === FieldType.PRICE ||
          field?.type === FieldType.DATE ||
          field?.type === FieldType.TIME ||
          field?.type === FieldType.DATETIME
        ) {
          const range = parseRangeValue(raw);
          const from = range.from !== undefined && range.from !== '' ? String(range.from) : '...';
          const to = range.to !== undefined && range.to !== '' ? String(range.to) : '...';
          if (field?.type === FieldType.PRICE) {
            const fromNum = from !== '...' ? fromPersianNumber(from).toLocaleString('en-US') : from;
            const toNum = to !== '...' ? fromPersianNumber(to).toLocaleString('en-US') : to;
            valueLabel = `${toPersianNumber(fromNum)} تا ${toPersianNumber(toNum)}`;
          } else {
            valueLabel = `${from} تا ${to}`;
          }
        } else if (options.length > 0) {
          const selected = options.find((opt) => String(opt.value) === rawValue);
          if (selected) valueLabel = String(selected.text);
        }

        bubbles.push({
          id: `${fieldKey}:${rawValue}`,
          fieldKey,
          rawValue,
          label: `${fieldLabel}: ${valueLabel}`,
        });
      });
    });

    return bubbles;
  })();

  const filterColumnsByKey = useMemo(() => {
    return new Map(
      columns
        .map((column) => {
          const key = (column as any).key ?? (column as any).dataIndex;
          return key ? [String(key), column] : null;
        })
        .filter(Boolean) as Array<[string, ColumnsType<any>[number]]>
    );
  }, [columns]);

  const filteredData = useMemo(() => {
    const activeFilters = Object.entries(activeColumnFilters).filter(([, values]) => Array.isArray(values) && values.length > 0);
    if (activeFilters.length === 0) return data;

    return data.filter((record) =>
      activeFilters.every(([fieldKey, values]) => {
        const column = filterColumnsByKey.get(fieldKey) as ColumnType<any> | undefined;
        if (!column || typeof column.onFilter !== 'function' || !Array.isArray(values)) return true;
        return values.some((value) => column.onFilter?.(value, record));
      })
    );
  }, [activeColumnFilters, data, filterColumnsByKey]);

  const removeFilterBubble = (fieldKey: string, rawValue: string) => {
    const current = activeColumnFilters[fieldKey];
    if (!Array.isArray(current)) return;
    const nextValues = current.filter((item) => String(item) !== rawValue);
    updateColumnFilters({
      ...activeColumnFilters,
      [fieldKey]: nextValues.length > 0 ? nextValues : null,
    });
  };

  const mergedFilterBubbles = [
    ...externalFilterBubbles,
    ...activeColumnFilterBubbles.map((bubble) => ({
      id: bubble.id,
      label: bubble.label,
      onRemove: () => removeFilterBubble(bubble.fieldKey, bubble.rawValue),
    })),
  ];

  const updateScrollHeight = useCallback(() => {
    if (disableScroll) return;
    const root = rootRef.current;
    if (!root) return;

    const isMobileViewport = window.innerWidth < 768;
    const containerHeight = root.clientHeight;
    if (!containerHeight) return;

    const filterBarHeight = filterBarRef.current?.offsetHeight || 0;
    const paginationEl = root.querySelector('.ant-pagination') as HTMLElement | null;
    const headerEl = root.querySelector('.ant-table-thead') as HTMLElement | null;
    const paginationHeight = pagination === false ? 0 : (paginationEl?.offsetHeight || (isMobileViewport ? 60 : 52));
    const headerHeight = headerEl?.offsetHeight || 44;
    const safetyOffset = isMobileViewport ? 24 : 16;
    const minBodyHeight = isMobileViewport ? 180 : 240;
    const nextHeight = Math.max(
      minBodyHeight,
      containerHeight - filterBarHeight - paginationHeight - headerHeight - safetyOffset
    );

    setScrollHeight((prev) => (Math.abs(prev - nextHeight) > 1 ? nextHeight : prev));
  }, [disableScroll, pagination]);

  useEffect(() => {
    onVisibleDataChange?.(filteredData);
  }, [filteredData, onVisibleDataChange]);

  useEffect(() => {
    if (disableScroll) return;

    let frameA = 0;
    const scheduleMeasure = () => {
      cancelAnimationFrame(frameA);
      frameA = requestAnimationFrame(() => {
        updateScrollHeight();
      });
    };

    scheduleMeasure();

    const root = rootRef.current;
    const resizeObserver =
      root && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => scheduleMeasure())
        : null;

    if (root && resizeObserver) {
      resizeObserver.observe(root);
      const tableHeader = root.querySelector('.ant-table-thead') as HTMLElement | null;
      const paginationEl = root.querySelector('.ant-pagination') as HTMLElement | null;
      if (tableHeader) resizeObserver.observe(tableHeader);
      if (paginationEl) resizeObserver.observe(paginationEl);
    }

    window.addEventListener('resize', scheduleMeasure);
    return () => {
      cancelAnimationFrame(frameA);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, [disableScroll, updateScrollHeight, filteredData.length, mergedFilterBubbles.length, columns.length, pagination]);

  const tablePagination =
    pagination === false
      ? false
      : {
          pageSize: 10,
          position: ['bottomCenter'],
          size: 'small',
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100],
          showTotal: (total: number, range: [number, number]) =>
            `${toPersianNumber(range[0])}-${toPersianNumber(range[1])} از ${toPersianNumber(total)}`,
          itemRender: (page: number, type: string, originalElement: React.ReactNode) => {
            if (type === 'page') {
              return <span className="persian-number">{toPersianNumber(page)}</span>;
            }
            return originalElement;
          },
          ...(pagination || {}),
        };

  return (
    <div
      ref={rootRef}
      className={["custom-erp-table", "smarttable-shell h-full min-h-0 flex flex-col overflow-hidden", containerClassName].filter(Boolean).join(' ')}
    >
      {mergedFilterBubbles.length > 0 && (
        <div ref={filterBarRef} className="smarttable-filter-bubbles mb-2 flex flex-wrap items-center gap-2 px-1">
          {mergedFilterBubbles.map((bubble) => (
            <Tag
              key={bubble.id}
              closable={typeof bubble.onRemove === 'function'}
              className="rounded-full px-2 py-0.5 text-[11px]"
              onClose={(e) => {
                e.preventDefault();
                bubble.onRemove?.();
              }}
            >
              {bubble.label}
            </Tag>
          ))}
          <Button
            type="link"
            size="small"
            onClick={() => {
              updateColumnFilters({});
              onClearExternalFilters?.();
            }}
          >
            حذف همه فیلترها
          </Button>
        </div>
      )}
      <div className="smarttable-table-host flex-1 min-h-0 overflow-hidden" style={{ willChange: 'scroll-position' }}>
      <Table 
          className="smarttable-table h-full [transform:translateZ(0)]"
          columns={columns} 
          dataSource={filteredData} 
          rowKey="id" 
          loading={loading} 
          size="small" 
          tableLayout={tableLayout}
          pagination={tablePagination} 
          onChange={handleTableChange}
          scroll={disableScroll ? undefined : { x: scrollX ?? 'max-content', y: scrollHeight }}
          // 🔥 اتصال انتخاب گروهی
          rowSelection={rowSelection ? {
              type: 'checkbox',
              ...rowSelection,
              columnWidth: 40,
        } : undefined}
        onRow={onRow}
      />
      </div>
    </div>
  );
};

export default SmartTableRenderer;
