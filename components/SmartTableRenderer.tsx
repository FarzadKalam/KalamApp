import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Table, Tag, Avatar, Input, InputNumber, Button, Space, Popover, Tooltip } from 'antd';
import { AppstoreOutlined, SearchOutlined, UserOutlined, TeamOutlined, ArrowUpOutlined, ArrowDownOutlined, TagOutlined } from '@ant-design/icons';
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
import { getFieldLabelFa } from '../utils/fieldLabel';
import { CASH_BANK_LEGACY_ACCOUNT_KEYS } from '../utils/cashBankLegacyAccountKeys';
import PhoneActionsPopover from './PhoneActionsPopover';
import PersianDatePicker from './PersianDatePicker';
import { useCurrencyConfig } from '../utils/currency';
import { getResolvedAssigneeId } from '../utils/assigneeValue';
import { getProcessTemplateModuleOptions } from '../utils/workflowHelpers';
import { getTaskStatusOption } from '../utils/processTaskStatusOptions';
import { buildImagePreviewUrl } from '../utils/imagePreview';
import { buildConditionalFieldStateMap, filterConditionallyVisibleFieldsForDataset } from '../utils/conditionalFieldRules';
import { getResolvedModuleConditionalDisplay } from '../utils/moduleSettingsRuntime';

interface SmartTableRendererProps {
  moduleConfig: ModuleDefinition | null | undefined;
  data: any[];
  loading: boolean;
  deferredDataLoading?: boolean;
  visibleColumns?: string[];  // ✅ ستون‌های انتخاب‌شده از View
  rowSelection?: any;
  onRow?: (record: any) => any;
  onChange?: (pagination: any, filters: any, sorter: any, extra: any) => void;
  pagination?: any;
  scrollX?: string | number;
  tableLayout?: 'auto' | 'fixed';
  disableScroll?: boolean;
  singleScrollContainer?: boolean;
  tagsMap?: Record<string, any[]>;
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
  showFilterBar?: boolean;
}

export const buildSmartTablePagination = (pagination: any, isMobileViewport = false) =>
  pagination === false
    ? false
    : {
        ...(pagination || {}),
        position: ['bottomCenter'],
        size: 'small',
        showSizeChanger: true,
        showLessItems: isMobileViewport,
        responsive: !isMobileViewport,
        pageSizeOptions: [10, 20, 50, 100],
        style: isMobileViewport ? undefined : { marginTop: 0 },
        showTotal: (total: number, range: [number, number]) =>
          isMobileViewport
            ? `${toPersianNumber(total)} ${'\u0631\u06a9\u0648\u0631\u062f'}`
            : `${toPersianNumber(range[0])}-${toPersianNumber(range[1])} ${'\u0627\u0632'} ${toPersianNumber(total)}`,
        itemRender: (page: number, type: string, originalElement: React.ReactNode) => {
          if (type === 'page') {
            return <span className="persian-number">{toPersianNumber(page)}</span>;
          }
          if (isMobileViewport && type === 'prev') {
            return <span className="smart-pagination-nav">{'\u0642\u0628\u0644\u06cc'}</span>;
          }
          if (isMobileViewport && type === 'next') {
            return <span className="smart-pagination-nav">{'\u0628\u0639\u062f\u06cc'}</span>;
          }
          return originalElement;
        },
      };

const normalizeDigits = (value: string | number | null | undefined): string => {
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

const OverflowTooltipText: React.FC<{ label: string; className: string }> = ({ label, className }) => {
  const textRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const node = textRef.current;
    if (!node) return;

    const measure = () => {
      setIsOverflowing((node.scrollWidth - node.clientWidth) > 1 || (node.scrollHeight - node.clientHeight) > 1);
    };

    measure();

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => measure())
        : null;

    resizeObserver?.observe(node);
    window.addEventListener('resize', measure);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [label]);

  return (
    <Tooltip
      title={isOverflowing ? label : null}
      mouseEnterDelay={0.2}
      zIndex={2600}
      getPopupContainer={() => document.body}
      styles={{
        body: {
          maxWidth: 'min(72vw, 720px)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
          direction: 'rtl',
          textAlign: 'right',
        },
      }}
    >
      <span ref={textRef} className={`${className} inline-block align-top`}>
        {label}
      </span>
    </Tooltip>
  );
};

const SmartTableRenderer: React.FC<SmartTableRendererProps> = ({ 
  moduleConfig, 
  data, 
  loading, 
  deferredDataLoading = false,
  visibleColumns,  // ✅ اضافه شد
  rowSelection, 
  onRow,
  onChange,
  pagination,
  scrollX,
  tableLayout,
  disableScroll,
  singleScrollContainer = false,
  tagsMap = {},
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
  sorters = [],
  showFilterBar = true,
}) => {
  const searchInput = useRef<InputRef>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const filterBarRef = useRef<HTMLDivElement>(null);
  const tagFilterTriggerRef = useRef<HTMLButtonElement>(null);
  const tagFilterPopoverRef = useRef<HTMLDivElement>(null);
  const lastVisibleRowSignatureRef = useRef('');
  const [scrollHeight, setScrollHeight] = useState<number>(520);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });
  const [isTagFilterPopoverOpen, setIsTagFilterPopoverOpen] = useState(false);
  const [internalColumnFilters, setInternalColumnFilters] = useState<Record<string, FilterValue | null>>({});
  const assigneeLabel = getAssigneeLabel(moduleConfig?.id);
  const shouldAppendManagedAssigneeColumn = useMemo(() => {
    const normalizedModuleId = String(moduleConfig?.id || moduleConfig?.table || '').trim();
    return normalizedModuleId !== 'attendance_logs';
  }, [moduleConfig?.id, moduleConfig?.table]);
  const getFieldLabel = useCallback(
    (field: any, fallback?: string) => getFieldLabelFa(field, { moduleId: moduleConfig?.id, fallback }),
    [moduleConfig?.id]
  );
  const { label: currencyLabel } = useCurrencyConfig();
  const normalizeFieldKey = useCallback((field?: any) => String(field?.key || '').trim().toLowerCase(), []);
  const isNameOrTitleField = useCallback((field?: any) => {
    const key = normalizeFieldKey(field);
    if (!key) return false;
    if (field?.isKey) return true;
    if (field?.type !== FieldType.TEXT) return false;
    return (
      key === 'name'
      || key === 'title'
      || key === 'full_name'
      || key === 'business_name'
      || key === 'legal_name'
      || key.endsWith('_name')
      || key.endsWith('_title')
    );
  }, [normalizeFieldKey]);
  const activeColumnFilters = controlledColumnFilters ?? internalColumnFilters;
  const isColumnFiltersControlled = controlledColumnFilters !== undefined;
  const conditionalDisplaySettings = useMemo(
    () => getResolvedModuleConditionalDisplay(moduleConfig?.id),
    [moduleConfig?.id]
  );
  const conditionalFieldStateMapsByRowKey = useMemo(() => {
    const maps = new Map<string, Record<string, any>>();
    if (!moduleConfig?.fields?.length) return maps;
    (data || []).forEach((record: any, index) => {
      const rowKey = String(record?.id || `row_${index}`);
      maps.set(
        rowKey,
        buildConditionalFieldStateMap(moduleConfig.fields || [], record || {}, conditionalDisplaySettings)
      );
    });
    return maps;
  }, [conditionalDisplaySettings, data, moduleConfig?.fields]);
  const conditionallyVisibleFieldKeySet = useMemo(
    () => new Set(
      filterConditionallyVisibleFieldsForDataset(
        moduleConfig?.fields || [],
        moduleConfig?.fields || [],
        data || [],
        conditionalDisplaySettings
      ).map((field) => String(field?.key || '').trim()).filter(Boolean)
    ),
    [conditionalDisplaySettings, data, moduleConfig?.fields]
  );
  const isFieldVisibleForRecord = useCallback(
    (field: any, record: any, index?: number) => {
      const fieldKey = String(field?.key || '').trim();
      if (!fieldKey) return true;
      const rowKey = String(record?.id || `row_${index ?? 0}`);
      return conditionalFieldStateMapsByRowKey.get(rowKey)?.[fieldKey]?.visible !== false;
    },
    [conditionalFieldStateMapsByRowKey]
  );
  const renderDeferredInlinePlaceholder = useCallback(
    (widthClass = 'w-[72%]') => (
      <div className="flex min-h-[22px] w-full items-center overflow-hidden">
        <span className={`inline-block h-4 rounded-md bg-gray-100 dark:bg-gray-700 animate-pulse ${widthClass}`} />
      </div>
    ),
    []
  );
  const renderDeferredTagPlaceholder = useCallback(
    () => (
      <div className="flex min-h-[22px] items-center gap-1">
        <span className="inline-block h-[18px] w-16 rounded-md bg-gray-100 dark:bg-gray-700 animate-pulse" />
        <span className="inline-block h-[18px] w-8 rounded-md bg-gray-100 dark:bg-gray-700 animate-pulse" />
      </div>
    ),
    []
  );
  const renderDeferredAssigneePlaceholder = useCallback(
    () => (
      <div className="flex min-h-[24px] items-center gap-2">
        <span className="inline-block h-6 w-6 rounded-full bg-gray-100 dark:bg-gray-700 animate-pulse" />
        <span className="inline-block h-4 w-20 rounded-md bg-gray-100 dark:bg-gray-700 animate-pulse" />
      </div>
    ),
    []
  );
  const getRecordTags = useCallback((record: any, tagsFieldKey?: string | null) => {
    if (!tagsFieldKey) return [];
    const recordId = String(record?.id || '').trim();
    const mappedTags = recordId ? tagsMap?.[recordId] : undefined;
    const rawTags = mappedTags ?? record?.[tagsFieldKey];
    if (!rawTags) return [];
    return Array.isArray(rawTags) ? rawTags : [rawTags];
  }, [tagsMap]);
  const renderStableTextCell = useCallback(
    (label: string, className: string) => (
      <div className="flex min-h-[22px] w-full items-center overflow-hidden">
        <OverflowTooltipText label={label} className={className} />
      </div>
    ),
    []
  );
  const formatDisplayText = useCallback((rawValue: any, fallback = '-'): string => {
    if (rawValue === null || rawValue === undefined || rawValue === '') return fallback;
    if (Array.isArray(rawValue)) {
      const parts: string[] = rawValue
        .map((item: any) => formatDisplayText(item, ''))
        .map((item) => item.trim())
        .filter(Boolean);
      return parts.length > 0 ? toPersianNumber(parts.join('، ')) : fallback;
    }
    if (typeof rawValue === 'object') {
      const candidate = (
        rawValue.title
        ?? rawValue.label
        ?? rawValue.name
        ?? rawValue.full_name
        ?? rawValue.business_name
        ?? rawValue.legal_name
        ?? rawValue.system_code
        ?? rawValue.value
        ?? rawValue.id
      );
      if (candidate !== rawValue && candidate !== null && candidate !== undefined && candidate !== '') {
        return formatDisplayText(candidate, fallback);
      }
      try {
        const serialized = JSON.stringify(rawValue);
        return serialized && serialized !== '{}' ? toPersianNumber(serialized) : fallback;
      } catch {
        return fallback;
      }
    }
    const normalized = String(rawValue).trim();
    return normalized ? toPersianNumber(normalized) : fallback;
  }, []);

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

  useEffect(() => {
    if (!isColumnFiltersControlled) {
      setInternalColumnFilters({});
    }
  }, [isColumnFiltersControlled, moduleConfig?.id]);

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

  const getColumnSearchProps = (_dataIndex: string, title: string): ColumnType<any> => ({
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
    _dataIndex: string,
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
  });

  // ✅ فیلتر تگ‌ها (برای ستون‌های تگ) - مشابه MULTI_SELECT
  const getTagFilterProps = useCallback((_dataIndex: string, _title: string) => {
    const allTags = new Map<string, string>();
    data.forEach((record: any) => {
      const tags = record[_dataIndex];
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
    };
  }, [data]);

  // --- ساخت ستون‌ها ---
  const { tableFields, primaryTitleField, tagsField } = useMemo(() => {
    let fields: any[] = moduleConfig.fields
      .filter((f: any) => f.isTableColumn)
      .filter((f: any) => (canViewField ? canViewField(f.key) !== false : true))
      .filter((f: any) => moduleConfig.id !== 'cash_bank_operations' || !CASH_BANK_LEGACY_ACCOUNT_KEYS.has(String(f?.key || '').trim()))
      .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

    // اگر visibleColumns مشخص است، از آن استفاده کن
    if (visibleColumns && visibleColumns.length > 0) {
      fields = visibleColumns
        .map((colKey: string) => moduleConfig.fields.find((f: any) => f.key === colKey))
        .filter((f: any) => f !== undefined)
        .filter((f: any) => moduleConfig.id !== 'cash_bank_operations' || !CASH_BANK_LEGACY_ACCOUNT_KEYS.has(String(f?.key || '').trim()))
        .filter((f: any) => (canViewField ? canViewField(f.key) !== false : true));
    } else if (fields.length === 0) {
      // Fallback: اگر هیچ visibleColumns یا isTableColumn نیست
      fields = moduleConfig.fields.filter((f: any) =>
        ['name', 'title', 'business_name', 'system_code', 'sell_price', 'stock_quantity', 'status', 'mobile_1', 'rank'].includes(f.key)
      );
    }

    if (shouldAppendManagedAssigneeColumn) {
      fields = fields.filter((field: any) => String(field?.key || '').trim() !== 'assignee_id');
    }

    fields = filterConditionallyVisibleFieldsForDataset(
      fields,
      moduleConfig.fields || [],
      data || [],
      conditionalDisplaySettings
    );

    const allViewableFields = moduleConfig.fields.filter((field: any) =>
      (canViewField ? canViewField(field.key) !== false : true)
      && ((data || []).length === 0 || conditionallyVisibleFieldKeySet.has(String(field?.key || '').trim()))
    );

    // ✅ ترتیب مجدد ستون‌ها: اول تصویر، سپس نام، سپس تگ‌ها، سپس بقیه
    const computedTagsField = allViewableFields.find((f: any) => f.type === FieldType.TAGS) ?? null;
    const computedImageField = fields.find((f: any) => f.type === FieldType.IMAGE) ?? null;
    const computedPrimaryTitleField = fields.find((f: any) => isNameOrTitleField(f)) ?? null;
    const otherFields = fields.filter((f: any) => f !== computedTagsField && f !== computedImageField && f !== computedPrimaryTitleField);

    if (computedImageField && computedPrimaryTitleField) {
      fields = [computedImageField, computedPrimaryTitleField, ...otherFields];
    } else if (computedPrimaryTitleField) {
      fields = [computedPrimaryTitleField, ...otherFields];
    }

    return { tableFields: fields, primaryTitleField: computedPrimaryTitleField, tagsField: computedTagsField };
  }, [
    moduleConfig?.fields,
    moduleConfig?.id,
    visibleColumns,
    canViewField,
    shouldAppendManagedAssigneeColumn,
    data,
    conditionalDisplaySettings,
    conditionallyVisibleFieldKeySet,
    isNameOrTitleField,
  ]);

  const resolvedTagFilterProps = useMemo(
    () => tagsField ? getTagFilterProps(tagsField.key, tagsField.labels.fa) : null,
    [tagsField, getTagFilterProps]
  );
  const activeTagFilterValues = useMemo(
    () => tagsField && Array.isArray(activeColumnFilters[tagsField.key])
      ? activeColumnFilters[tagsField.key]!.map((value) => String(value))
      : [],
    [tagsField, activeColumnFilters]
  );
  const keyFieldMobileWidth = useMemo(() => {
    if (!isMobileViewport || !primaryTitleField) return null;
    return Math.min(
      280,
      Math.max(
        156,
        (data.reduce((maxLength: number, record: any) => {
          const rawValue = record?.[primaryTitleField.key];
          const normalized = rawValue === null || rawValue === undefined || rawValue === '' ? '-' : String(rawValue).trim();
          return Math.max(maxLength, normalized.length);
        }, 0) * 9) + 52
      )
    );
  }, [isMobileViewport, primaryTitleField, data]);

  const updateTagFilters = (nextValues: string[]) => {
    if (!tagsField) return;
    updateColumnFilters({
      ...activeColumnFilters,
      [tagsField.key]: nextValues.length > 0 ? nextValues : null,
    });
  };

  const toggleTagFilterValue = (tagValue: string) => {
    const nextValues = activeTagFilterValues.includes(tagValue)
      ? activeTagFilterValues.filter((item) => item !== tagValue)
      : [...activeTagFilterValues, tagValue];
    updateTagFilters(nextValues);
  };

  const renderCompactTags = (tags: any[]) => {
    if (!Array.isArray(tags) || tags.length === 0) return null;
    const visibleTags = tags.slice(0, 2);
    const hiddenTags = tags.slice(2);
    return (
      <div className="mt-0.5 flex max-w-full items-center gap-1 overflow-hidden whitespace-nowrap">
        {visibleTags.map((tag: any, index: number) => {
          const tagLabel = String(typeof tag === 'string' ? tag : (tag.title || tag.label || tag.id || '')).trim();
          const tagColor = typeof tag === 'string' ? undefined : tag.color;
          if (!tagLabel) return null;
          return (
            <Tag
              key={`${tagLabel}-${index}`}
              color={tagColor || 'default'}
              style={{ marginRight: 0, paddingInline: 4 }}
              className="!m-0 max-w-[88px] truncate rounded-full !text-[8px] !leading-[12px]"
            >
              {tagLabel}
            </Tag>
          );
        })}
        {hiddenTags.length > 0 ? (
          <Popover
            content={
              <div className="flex max-w-[220px] flex-wrap gap-1">
                {hiddenTags.map((tag: any, index: number) => {
                  const tagLabel = String(typeof tag === 'string' ? tag : (tag.title || tag.label || tag.id || '')).trim();
                  const tagColor = typeof tag === 'string' ? undefined : tag.color;
                  if (!tagLabel) return null;
                  return (
                    <Tag key={`${tagLabel}-${index}`} color={tagColor || 'default'} className="!m-0 rounded-full !text-[9px]">
                      {tagLabel}
                    </Tag>
                  );
                })}
              </div>
            }
            trigger="click"
          >
            <button
              type="button"
              className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[8px] font-medium leading-[12px] text-gray-500 transition hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              onClick={(event) => event.stopPropagation()}
            >
              +{hiddenTags.length}
            </button>
          </Popover>
        ) : null}
      </div>
    );
  };

  const keyFieldTagFilterContent = resolvedTagFilterProps ? (
    <div ref={tagFilterPopoverRef} className="w-[220px] max-w-[70vw]" onClick={(event) => event.stopPropagation()}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-gray-500">فیلتر برچسب</span>
        {activeTagFilterValues.length > 0 ? (
          <button
            type="button"
            className="text-[10px] text-leather-600 transition hover:text-leather-500"
            onClick={() => updateTagFilters([])}
          >
            حذف
          </button>
        ) : null}
      </div>
      {(resolvedTagFilterProps.filters as Array<{ text: string; value: string }> | undefined)?.length ? (
        <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
          {(resolvedTagFilterProps.filters as Array<{ text: string; value: string }>).map((tagOption) => {
            const tagValue = String(tagOption.value);
            const isActive = activeTagFilterValues.includes(tagValue);
            return (
              <button
                key={tagValue}
                type="button"
                className={`rounded-full border px-2 py-1 text-[10px] transition ${
                  isActive
                    ? 'border-leather-500 bg-leather-50 text-leather-700 dark:bg-leather-500/15 dark:text-leather-200'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-leather-300 hover:text-leather-600 dark:border-white/10 dark:bg-[#111827] dark:text-gray-200'
                }`}
                onClick={() => toggleTagFilterValue(tagValue)}
              >
                {tagOption.text}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="text-[10px] text-gray-400">برچسبی در این صفحه وجود ندارد.</div>
      )}
    </div>
  ) : null;

  useEffect(() => {
    if (!isTagFilterPopoverOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (tagFilterPopoverRef.current?.contains(target)) return;
      if (tagFilterTriggerRef.current?.contains(target)) return;
      setIsTagFilterPopoverOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isTagFilterPopoverOpen]);

  const resolveFieldFilterOptions = (field: any) => {
    let options: { text: string; value: string | number }[] = [];
    if (
      (moduleConfig?.id === 'process_templates' && (field.key === 'module_id' || field.key === 'module_ids'))
      || (moduleConfig?.id === 'process_runs' && field.key === 'module_id')
    ) {
      options = getProcessTemplateModuleOptions().map((o: any) => ({ text: o.label, value: o.value }));
    } else if (field.options) {
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

  const columns = useMemo((): ColumnsType<any> => {
    const cols: ColumnsType<any> = tableFields.map(field => {
    const isKeyLikeField = isNameOrTitleField(field);
    const isPrimaryTitleColumn = isKeyLikeField && primaryTitleField?.key === field.key;
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
    const fieldLabel = getFieldLabel(field, field.key);
    const tagFilterProps = isTagField ? getTagFilterProps(field.key, fieldLabel) : {};

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
    const shouldDeferFieldValue =
      deferredDataLoading &&
      [
        FieldType.SELECT,
        FieldType.MULTI_SELECT,
        FieldType.RELATION,
        FieldType.USER,
        FieldType.TAGS,
      ].includes(field.type);

    return {
      title: isPrimaryTitleColumn && keyFieldTagFilterContent ? (
        <span className="inline-flex items-center gap-1">
          <span className="text-[10px] md:text-[11px] text-gray-500">{fieldLabel}</span>
          <Popover
            content={keyFieldTagFilterContent}
            placement="bottomRight"
            open={isTagFilterPopoverOpen}
            getPopupContainer={() => document.body}
          >
            <button
              ref={tagFilterTriggerRef}
              type="button"
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full transition ${
                activeTagFilterValues.length > 0
                  ? 'text-leather-600'
                  : 'text-gray-400 hover:text-leather-500'
              }`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsTagFilterPopoverOpen((prev) => !prev);
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              aria-label="tag-filter"
            >
              <TagOutlined className="text-[10px]" />
            </button>
          </Popover>
        </span>
      ) : (
        <span className="text-[10px] md:text-[11px] text-gray-500">{fieldLabel}</span>
      ),
      dataIndex: field.key,
      key: field.key,
      align: field.type === FieldType.IMAGE ? 'center' : undefined,
      onCell: field.type === FieldType.IMAGE ? () => ({ className: 'smarttable-image-cell' }) : undefined,
      onHeaderCell: field.type === FieldType.IMAGE ? () => ({ className: 'smarttable-image-cell' }) : undefined,
      width:
        field.key === 'id'
          ? 60
          : field.type === FieldType.IMAGE
            ? 62
          : isKeyLikeField
            ? (isMobileViewport && keyFieldMobileWidth ? keyFieldMobileWidth : (moduleConfig?.id === 'products' ? 380 : 340))
            : isTagField
              ? 120
              : field.type === FieldType.RELATION || field.type === FieldType.USER
                ? 180
                : field.type === FieldType.SELECT || field.type === FieldType.MULTI_SELECT
                  ? 150
                  : undefined,
      ellipsis:
        isKeyLikeField ||
        field.type === FieldType.RELATION ||
        field.type === FieldType.USER ||
        field.type === FieldType.SELECT ||
        field.type === FieldType.MULTI_SELECT
          ? { showTitle: false }
          : undefined,
      filteredValue: activeColumnFilters[field.key] ?? null,
      sorter: canSortField,
      sortOrder,
      sortDirections: ['ascend', 'descend', null],
      showSorterTooltip: false,
      filterSearch: field.type === FieldType.RELATION || field.type === FieldType.USER ? true : undefined,
      sortIcon: () =>
        canSortField ? (
          <span className="inline-flex flex-col leading-none text-[9px] mr-1 text-gray-300">
            <ArrowUpOutlined className={sortOrder === 'ascend' ? 'text-leather-600' : ''} />
            <ArrowDownOutlined className={sortOrder === 'descend' ? 'text-leather-600 -mt-[1px]' : '-mt-[1px]'} />
          </span>
        ) : null,
      filterDropdownProps: sharedFilterDropdownProps,
      
      ...(isSearchable ? getColumnSearchProps(field.key, fieldLabel) : {}),
      ...tagFilterProps,
      ...(field.type === FieldType.PRICE ? getRangeFilterProps(field.key, fieldLabel, 'PRICE') : {}),
      ...(field.type === FieldType.DATE ? getRangeFilterProps(field.key, fieldLabel, 'DATE') : {}),
      ...(field.type === FieldType.TIME ? getRangeFilterProps(field.key, fieldLabel, 'TIME') : {}),
      ...(field.type === FieldType.DATETIME ? getRangeFilterProps(field.key, fieldLabel, 'DATETIME') : {}),

      filters: (tagFilterProps as any)?.filters ?? (hasChoiceFilter ? choiceOptions : undefined),

      render: (value: any, record: any) => {
        const effectiveField = (
          ((moduleConfig?.id === 'process_templates' && (field.key === 'module_id' || field.key === 'module_ids'))
            || (moduleConfig?.id === 'process_runs' && field.key === 'module_id'))
            ? { ...field, options: getProcessTemplateModuleOptions() }
            : field
        );
        if (!isFieldVisibleForRecord(field, record)) {
          return null;
        }
        // Shared fallback for empty/invalid dates
        const emptyDateCell = <span className="dir-ltr text-gray-500 font-mono text-[10px] md:text-[11px]">-</span>;
        
        if (field.type === FieldType.IMAGE) {
            return <Avatar src={buildImagePreviewUrl(String(value || ''), 'avatar') || undefined} icon={<AppstoreOutlined />} shape="square" size={36} className="bg-gray-100 border border-gray-200" />;
        }
        if (shouldDeferFieldValue) {
          if (field.type === FieldType.TAGS || field.type === FieldType.MULTI_SELECT) {
            return renderDeferredTagPlaceholder();
          }
          return renderDeferredInlinePlaceholder(
            field.type === FieldType.RELATION || field.type === FieldType.USER
              ? 'w-[82%]'
              : field.type === FieldType.SELECT
                ? 'w-[68%]'
                : 'w-[64%]'
          );
        }
        if (field.type === FieldType.DATE && value) {
          const formatted = formatPersianDate(value, 'DATE');
          if (!formatted) return emptyDateCell;
          return <span className="dir-ltr text-gray-500 font-medium text-[10px] md:text-[11px]">{formatted}</span>;
        }
        if (field.type === FieldType.TIME && value) {
          const formatted = formatPersianDate(value, 'TIME');
          if (!formatted) return emptyDateCell;
          return <span className="dir-ltr text-gray-500 font-medium text-[10px] md:text-[11px]">{formatted}</span>;
        }
        if (field.type === FieldType.DATETIME && value) {
          const formatted = formatPersianDate(value, 'DATETIME');
          if (!formatted) return emptyDateCell;
          return <span className="dir-ltr text-gray-500 font-medium text-[10px] md:text-[11px]">{formatted}</span>;
        }
        if (field.type === FieldType.CHECKBOX) {
            return (
              <Tag
                color={value ? 'green' : 'default'}
                style={{ fontSize: '10px', marginRight: 0 }}
              >
                {value ? 'بله' : 'خیر'}
              </Tag>
            );
        }
        if (field.type === FieldType.STATUS) {
            const opt = moduleConfig?.id === 'tasks' && String(field?.key || '') === 'status'
              ? getTaskStatusOption(value, record, field.options || [])
              : field.options?.find((o: any) => o.value === value);
            const label = formatDisplayText(opt?.label ?? value);
            return <Tag color={opt?.color || 'default'} style={{fontSize: '10px', marginRight: 0}}>{label}</Tag>;
        }
        if (field.type === FieldType.SELECT) {
            const label = getSingleOptionLabel(effectiveField, value, dynamicOptions, relationOptions);
            return renderStableTextCell(
              formatDisplayText(label),
              "block w-full truncate text-xs text-gray-600 dark:text-gray-300"
            );
        }
        if (field.type === FieldType.RELATION) {
            const label = getSingleOptionLabel(field, value, dynamicOptions, relationOptions);
            const targetModule = (field as any)?.relationConfig?.targetModule;
            if (!targetModule || !value) {
              return renderStableTextCell(
                formatDisplayText(label),
                "block w-full truncate text-xs text-leather-600 hover:underline font-medium"
              );
            }
            return (
              <RelatedRecordPopover moduleId={targetModule} recordId={String(value)} label={String(label || value)}>
                {renderStableTextCell(
                  formatDisplayText(label),
                  "block w-full truncate text-xs text-leather-600 hover:underline font-medium"
                )}
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
                {renderStableTextCell(
                  formatDisplayText(userLabel),
                  "block w-full truncate text-xs text-leather-600 hover:underline font-medium"
                )}
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
            <div style={{ minWidth: 160, minHeight: 20 }}>
              <ProductionStagesField
                recordId={record.id}
                moduleId={moduleConfig?.id}
                readOnly={true}
                compact={true}
                cardCompact
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
              return <span className="inline-flex min-h-[22px] items-center text-xs text-gray-400">-</span>;
            }
            
            const firstTag = value.slice(0, 1);
            const remainingTags = value.slice(1);
            
            return (
              <div className="flex min-h-[22px] max-w-[220px] items-center gap-1 overflow-hidden whitespace-nowrap">
                {firstTag.map((tag: any, idx: number) => {
                  const tagTitle = typeof tag === 'string' ? tag : tag.title || tag.label;
                  const tagColor = typeof tag === 'string' ? 'blue' : (tag.color || 'blue');
                  return (
                    <Tag key={idx} color={tagColor} style={{fontSize: '9px', marginRight: 0, padding: '1px 4px', lineHeight: '14px', maxWidth: 120}} className="truncate">
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
            const visibleValues = value.slice(0, 1);
            const hiddenCount = value.length - visibleValues.length;
            return (
              <div className="flex min-h-[22px] max-w-[220px] items-center gap-1 overflow-hidden whitespace-nowrap">
                {visibleValues.map((val: any, idx: number) => {
                  const label = getSingleOptionLabel(effectiveField, val, dynamicOptions, relationOptions);
                  return (
                    <Tag
                      key={idx}
                      color="default"
                      style={{ fontSize: '9px', marginRight: 0, maxWidth: 120 }}
                      className="kalam-multi-value-tag truncate rounded-md font-medium"
                    >
                      {label}
                    </Tag>
                  );
                })}
                {hiddenCount > 0 && (
                  <span className="kalam-multi-value-more rounded-md px-1.5 py-0.5 text-[9px] font-medium">
                    +{hiddenCount}
                  </span>
                )}
              </div>
            );
        }
        if (field.type === FieldType.PRICE) {
            if (value === null || value === undefined || value === '') return '-';
            const persianPrice = formatPersianPrice(value, true);
            return (
              <div className="inline-flex max-w-full items-baseline gap-1 whitespace-nowrap leading-tight">
                <span className="font-bold text-gray-700 dark:text-gray-300 text-[11px] md:text-xs persian-number">{persianPrice}</span>
                {currencyLabel ? (
                  <span className="truncate text-[9px] md:text-[10px] text-gray-400 dark:text-gray-500">{currencyLabel}</span>
                ) : null}
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
             if (String(field?.key || '') === 'schedule_variance_hours') {
               const numericValue = Number(value || 0);
               const varianceClass = numericValue > 0
                 ? 'text-green-700 dark:text-green-400'
                 : numericValue < 0
                   ? 'text-red-700 dark:text-red-400'
                   : 'text-gray-600 dark:text-gray-300';
               return <span className={`text-xs font-semibold persian-number ${varianceClass}`}>{persianNum}</span>;
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
        if (isKeyLikeField) {
             const inlineTags = isPrimaryTitleColumn && tagsField && isFieldVisibleForRecord(tagsField, record)
               ? getRecordTags(record, tagsField.key)
               : [];
                if (!Array.isArray(inlineTags) || inlineTags.length === 0) {
                  return renderStableTextCell(
                    formatDisplayText(value),
                  "block w-full truncate text-[13px] md:text-sm font-bold text-gray-700 dark:text-gray-200"
                );
              }
              return (
                <div className="flex min-h-[28px] w-full flex-col justify-center overflow-hidden">
                  <OverflowTooltipText
                    label={formatDisplayText(value)}
                    className="block w-full truncate text-[13px] leading-4 font-bold text-gray-700 dark:text-gray-200"
                  />
                  {renderCompactTags(inlineTags)}
                </div>
              );
        }
        return renderStableTextCell(
          formatDisplayText(value),
          "block w-full truncate text-xs text-gray-600 dark:text-gray-300"
        );
      }
    };
  });

  // ✅ اضافه کردن ستون assignee به انتهای تمام جداول
  if (shouldAppendManagedAssigneeColumn && (!canViewField || canViewField('assignee_id') !== false)) {
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
    cols.push({
    title: <span className="text-[11px] text-gray-500">{assigneeLabel}</span>,
    dataIndex: 'assignee_id',
    key: 'assignee_id',
    width: 120,
    filteredValue: activeColumnFilters.assignee_id ?? null,
    sorter: true,
    sortOrder: assigneeSortOrder,
    sortDirections: ['ascend', 'descend', null],
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
    render: (_: any, record: any) => {
      if (deferredDataLoading) {
        return renderDeferredAssigneePlaceholder();
      }
      const assigneeId = getResolvedAssigneeId(record);
      const assigneeType = record.assignee_type;
      
      if (!assigneeId) {
        return <span className="inline-flex min-h-[24px] items-center text-[10px] text-gray-300">-</span>;
      }
      
      if (assigneeType === 'user') {
        const user = allUsers.find(u => u.id === assigneeId);
        if (user) {
          return (
            <div className="flex min-h-[24px] items-center gap-1">
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
            <div className="flex min-h-[24px] items-center gap-1">
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

    return cols;
  }, [
    tableFields,
    primaryTitleField,
    tagsField,
    activeColumnFilters,
    isMobileViewport,
    keyFieldMobileWidth,
    moduleConfig?.id,
    sorters,
    deferredDataLoading,
    dynamicOptions,
    relationOptions,
    allUsers,
    allRoles,
    shouldAppendManagedAssigneeColumn,
    canViewField,
    assigneeLabel,
    currencyLabel,
    isTagFilterPopoverOpen,
    activeTagFilterValues,
    getTagFilterProps,
    isNameOrTitleField,
    getFieldLabel,
    isFieldVisibleForRecord,
    getRecordTags,
    renderStableTextCell,
    formatDisplayText,
    renderDeferredTagPlaceholder,
    renderDeferredInlinePlaceholder,
    renderDeferredAssigneePlaceholder,
    sharedFilterDropdownProps,
  ]);

  const activeColumnFilterBubbles = useMemo(() => {
    const fieldsMap = new Map(tableFields.map((field: any) => [field.key, field]));
    const tagLabelById = new Map<string, string>();
    Object.values(tagsMap || {}).forEach((recordTags) => {
      if (!Array.isArray(recordTags)) return;
      recordTags.forEach((tag: any) => {
        const id = String(tag?.id || '').trim();
        const title = String(tag?.title || tag?.label || '').trim();
        if (id && title && !tagLabelById.has(id)) {
          tagLabelById.set(id, title);
        }
      });
    });
    if (tagsField && !fieldsMap.has(tagsField.key)) {
      fieldsMap.set(tagsField.key, tagsField);
    }
    if (
      shouldAppendManagedAssigneeColumn
      && !fieldsMap.has('assignee_id')
      && (!canViewField || canViewField('assignee_id') !== false)
    ) {
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
      const fieldLabel = getFieldLabel(field, fieldKey);
      const options =
        field?.type === FieldType.TAGS
          ? ((resolvedTagFilterProps?.filters as Array<{ text: string; value: string }> | undefined) || [])
          : (field ? resolveFieldFilterOptions(field) || [] : []);

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
          if (selected) {
            valueLabel = String(selected.text);
          } else if (field?.type === FieldType.TAGS) {
            valueLabel = tagLabelById.get(rawValue) || rawValue;
          }
        } else if (field?.type === FieldType.TAGS) {
          valueLabel = tagLabelById.get(rawValue) || rawValue;
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
  }, [
    tableFields,
    tagsField,
    tagsMap,
    resolvedTagFilterProps,
    shouldAppendManagedAssigneeColumn,
    canViewField,
    assigneeLabel,
    getFieldLabel,
    activeColumnFilters,
  ]);

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

    const nextIsMobileViewport = window.innerWidth < 768;
    setIsMobileViewport((prev) => (prev === nextIsMobileViewport ? prev : nextIsMobileViewport));

    const viewportHeight = window.visualViewport?.height || window.innerHeight || 800;
    const rootRect = root.getBoundingClientRect();
    const parentHeight = root.parentElement?.clientHeight || 0;
    const mobileFooterReserve = nextIsMobileViewport ? 96 : 0;
    const viewportAvailableHeight = Math.max(0, viewportHeight - rootRect.top - mobileFooterReserve);
    const containerHeight = singleScrollContainer
      ? Math.max(parentHeight, viewportAvailableHeight, root.clientHeight)
      : (root.clientHeight || parentHeight || viewportAvailableHeight);
    if (!containerHeight) return;

    const filterBarHeight = filterBarRef.current?.offsetHeight || 0;
    const paginationEl = root.querySelector('.ant-pagination') as HTMLElement | null;
    const headerEl = root.querySelector('.ant-table-thead') as HTMLElement | null;
    const paginationHeight = pagination === false ? 0 : (paginationEl?.offsetHeight || (nextIsMobileViewport ? 60 : 52));
    const headerHeight = headerEl?.offsetHeight || 44;
    const desktopPaginationReserve = 0;
    const safetyOffset = nextIsMobileViewport ? 6 : 2;
    const minBodyHeight = nextIsMobileViewport ? 220 : 280;
    const nextHeight = singleScrollContainer
      ? Math.max(
          minBodyHeight,
          containerHeight - filterBarHeight - safetyOffset
        )
      : Math.max(
          minBodyHeight,
          containerHeight - filterBarHeight - paginationHeight - desktopPaginationReserve - headerHeight - safetyOffset
        );

    setScrollHeight((prev) => (Math.abs(prev - nextHeight) > 1 ? nextHeight : prev));
  }, [disableScroll, pagination, singleScrollContainer]);

  useEffect(() => {
    if (!onVisibleDataChange) return;
    const nextSignature = data
      .map((row: any) => String(row?.id || '').trim())
      .filter(Boolean)
      .join('|');
    if (lastVisibleRowSignatureRef.current === nextSignature) return;
    lastVisibleRowSignatureRef.current = nextSignature;
    onVisibleDataChange(data);
  }, [data, onVisibleDataChange]);

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
    }

    window.addEventListener('resize', scheduleMeasure);
    window.visualViewport?.addEventListener('resize', scheduleMeasure);
    return () => {
      cancelAnimationFrame(frameA);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      window.visualViewport?.removeEventListener('resize', scheduleMeasure);
    };
  }, [disableScroll, updateScrollHeight]);

  const tablePagination = buildSmartTablePagination(pagination, isMobileViewport);
  const tableScroll = disableScroll
    ? undefined
    : singleScrollContainer
      ? { x: scrollX ?? 'max-content', scrollToFirstRowOnChange: false }
      : { x: scrollX ?? 'max-content', y: scrollHeight, scrollToFirstRowOnChange: false };

  return (
    <div
      ref={rootRef}
      className={[
        "custom-erp-table",
        "smarttable-shell relative h-full min-h-0 flex flex-col overflow-hidden",
        singleScrollContainer ? "smarttable-single-scroll" : "",
        containerClassName,
      ].filter(Boolean).join(' ')}
      style={{ ['--smarttable-body-height' as any]: `${scrollHeight}px` }}
    >
      {showFilterBar ? (
        <div ref={filterBarRef} className="smarttable-filter-bubbles mb-2 min-h-[42px] px-1">
          {mergedFilterBubbles.length > 0 ? (
          <div className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-gray-200/80 bg-white/92 px-3 py-2 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#111827]/90">
            {mergedFilterBubbles.map((bubble) => (
              <Tag
                key={bubble.id}
                closable={typeof bubble.onRemove === 'function'}
                className="!m-0 shrink-0 rounded-full px-2 py-0.5 text-[11px]"
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
              className="shrink-0"
              onClick={() => {
                updateColumnFilters({});
                onClearExternalFilters?.();
              }}
            >
              حذف همه فیلترها
            </Button>
          </div>
          ) : null}
        </div>
      ) : null}
      <div className="smarttable-table-host flex h-full min-h-0 flex-1 flex-col">
        <Table 
          className="smarttable-table h-full min-h-0"
          columns={columns} 
          dataSource={data} 
          rowKey="id" 
          loading={loading} 
          size="small" 
          style={{ height: '100%' }}
          tableLayout={tableLayout}
          sticky={disableScroll ? false : { offsetHeader: 0 }}
          pagination={tablePagination} 
          onChange={handleTableChange}
          scroll={tableScroll}
          // 🔥 اتصال انتخاب گروهی
          rowSelection={rowSelection ? {
              type: 'checkbox',
              ...rowSelection,
              columnWidth: 56,
        } : undefined}
        onRow={onRow}
      />
      </div>
    </div>
  );
};

export default React.memo(SmartTableRenderer);

