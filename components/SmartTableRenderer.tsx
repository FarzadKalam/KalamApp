import React, { useRef, useState, useEffect } from 'react';
import { Table, Tag, Avatar, Input, Button, Space, Popover } from 'antd';
import { AppstoreOutlined, SearchOutlined, UserOutlined, TeamOutlined } from '@ant-design/icons';
import { ModuleDefinition, FieldType } from '../types';
import { getSingleOptionLabel } from '../utils/optionHelpers';
import { toPersianNumber, formatPersianPrice } from '../utils/persianNumberFormatter';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import type { InputRef } from 'antd';
import type { ColumnType, ColumnsType } from 'antd/es/table';
import type { FilterConfirmProps } from 'antd/es/table/interface';
import ProductionStagesField from './ProductionStagesField';
import RelatedRecordPopover from './RelatedRecordPopover';

interface SmartTableRendererProps {
  moduleConfig: ModuleDefinition | null | undefined;
  data: any[];
  loading: boolean;
  visibleColumns?: string[];  // ✅ ستون‌های انتخاب‌شده از View
  rowSelection?: any;
  onRow?: (record: any) => any;
  onChange?: (pagination: any, filters: any, sorter: any) => void;
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
}

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
  containerClassName
}) => {
  const searchInput = useRef<InputRef>(null);
  const [scrollHeight, setScrollHeight] = useState<number>(500);

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

  if (!moduleConfig || !moduleConfig.fields) return null;

  // --- لاجیک جستجوی ستونی (بهینه شده) ---
  const handleSearch = (_selectedKeys: string[], confirm: (param?: FilterConfirmProps) => void) => {
    confirm();
  };

  const handleReset = (clearFilters: () => void, confirm: any) => {
    clearFilters();
    confirm();
  };

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
      <SearchOutlined style={{ color: filtered ? '#c58f60' : undefined }} />
    ),
    onFilter: (value, record) => {
        const text = record[dataIndex] ? record[dataIndex].toString() : '';
        return text.toLowerCase().includes((value as string).toLowerCase());
    },
    filterDropdownProps: {
      onOpenChange: (visible) => {
        if (visible) {
          setTimeout(() => searchInput.current?.select(), 100);
        }
      },
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

  const columns: ColumnsType<any> = tableFields.map(field => {
    const isSearchable = field.type === FieldType.TEXT || field.key.includes('name') || field.key.includes('code') || field.key.includes('title');
    const isTagField = field.type === FieldType.TAGS;

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

    return {
      title: <span className="text-[11px] text-gray-500">{field.labels.fa}</span>,
      dataIndex: field.key,
      key: field.key,
      width: field.key === 'id' ? 60 : isTagField ? 140 : undefined,
      
      ...(isSearchable ? getColumnSearchProps(field.key, field.labels.fa) : {}),
      ...(isTagField ? getTagFilterProps(field.key, field.labels.fa) : {}),

      filters: !isTagField && (field.type === FieldType.STATUS || field.type === FieldType.SELECT || field.type === FieldType.MULTI_SELECT || field.type === FieldType.RELATION || field.type === FieldType.USER)
          ? (() => {
              let options: any[] = [];
              if (field.options) {
                options = field.options.map(o => ({ text: o.label, value: o.value }));
              } else if ((field as any).dynamicOptionsCategory) {
                const category = (field as any).dynamicOptionsCategory;
                const dynopts = dynamicOptions[category] || [];
                options = dynopts.map(o => ({ text: o.label, value: o.value }));
              } else if (field.type === FieldType.RELATION || field.type === FieldType.USER) {
                const rellopts = relationOptions[field.key] || relationOptions[(field as any).relationConfig?.targetModule] || relationOptions['profiles'] || [];
                options = rellopts.map(o => ({ text: o.label, value: o.value }));
              }
              return options.length > 0 ? options : undefined;
            })()
          : undefined,
      onFilter: !isTagField && (field.type === FieldType.STATUS || field.type === FieldType.SELECT || field.type === FieldType.MULTI_SELECT || field.type === FieldType.RELATION || field.type === FieldType.USER)
          ? (value, record) => {
              const recordValue = record[field.key];
              if (field.type === FieldType.MULTI_SELECT && Array.isArray(recordValue)) {
                return recordValue.includes(value);
              }
              return recordValue === value;
            }
          : undefined,

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
              value;
            return (
              <RelatedRecordPopover moduleId="profiles" recordId={String(value)} label={String(userLabel)}>
                <span className="text-xs text-leather-600 hover:underline font-medium">{userLabel}</span>
              </RelatedRecordPopover>
            );
        }
        if (field.type === FieldType.PROGRESS_STAGES) {
             return (
               <div style={{ minWidth: 200 }}>
                 <ProductionStagesField 
                    recordId={record.id} 
                    moduleId={moduleConfig?.id}
                    readOnly={true} 
                    compact={true}
                    lazyLoad={true}
                    draftStages={record?.production_stages_draft || []}
                    showWageSummary={false}
                 />
               </div>
             );
          }
          
        if (field.type === FieldType.TAGS) {
            if (!Array.isArray(value) || value.length === 0) return '-';
            
            const firstTag = value.slice(0, 1);
            const remainingTags = value.slice(1);
            
            return (
              <div className="flex flex-wrap gap-1 items-center">
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
            if (!value) return '-';
            const persianPrice = formatPersianPrice(value, true);
            return <span className="font-bold text-gray-700 dark:text-gray-300 text-xs persian-number">{persianPrice}</span>;
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
    columns.push({
    title: <span className="text-[11px] text-gray-500">مسئول</span>,
    dataIndex: 'assignee_id',
    key: 'assignee',
    width: 120,
    render: (_: any, record: any) => {
      const assigneeId = record.assignee_id;
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
          ...(pagination || {}),
        };

  return (
    <div className={["custom-erp-table", containerClassName].filter(Boolean).join(' ')}>
      <Table 
          columns={columns} 
          dataSource={data} 
          rowKey="id" 
          loading={loading} 
          size="small" 
          tableLayout={tableLayout}
          pagination={tablePagination} 
          onChange={onChange}
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
  );
};

export default SmartTableRenderer;
