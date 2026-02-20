import { Input, InputNumber, Button, Space } from 'antd';
import { SearchOutlined, FilterOutlined } from '@ant-design/icons';
import { FieldType, FilterOperator, ModuleField } from '../types';

export const WORKFLOW_OPERATORS = {
  eq: 'برابر است با',
  neq: 'برابر نیست با',
  contains: 'شامل است',
  not_contains: 'شامل نیست',
  starts_with: 'شروع می‌شود با',
  ends_with: 'پایان می‌یابد با',
  gt: 'بزرگ‌تر از',
  gte: 'بزرگ‌تر/مساوی',
  lt: 'کوچک‌تر از',
  lte: 'کوچک‌تر/مساوی',
  in: 'در بین',
  not_in: 'خارج از',
  is_true: 'فعال باشد',
  is_false: 'غیرفعال باشد',
  is_null: 'خالی باشد',
  not_null: 'خالی نباشد',
  changed: 'تغییر کرد',
  changed_from: 'تغییر کرد از',
  changed_to: 'تغییر کرد به',
  is_today: 'امروز باشد',
  is_yesterday: 'دیروز باشد',
  is_tomorrow: 'فردا باشد',
  days_passed_gt: 'بیشتر از چند روز گذشته باشد',
  days_passed_lt: 'کمتر از چند روز گذشته باشد',
  days_remaining_gt: 'بیشتر از چند روز مانده باشد',
  days_remaining_lt: 'کمتر از چند روز مانده باشد',
  hours_passed_gt: 'بیشتر از چند ساعت گذشته باشد',
  hours_passed_lt: 'کمتر از چند ساعت گذشته باشد',
  hours_remaining_gt: 'بیشتر از چند ساعت مانده باشد',
  hours_remaining_lt: 'کمتر از چند ساعت مانده باشد',
} as const;

export type WorkflowOperator = keyof typeof WORKFLOW_OPERATORS;

const baseTextOperators: WorkflowOperator[] = [
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'eq',
  'neq',
  'changed',
  'changed_from',
  'changed_to',
  'is_null',
  'not_null',
];

const baseNumericOperators: WorkflowOperator[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'changed',
  'changed_from',
  'changed_to',
  'is_null',
  'not_null',
];

const baseSelectOperators: WorkflowOperator[] = [
  'eq',
  'neq',
  'in',
  'not_in',
  'changed',
  'changed_from',
  'changed_to',
  'is_null',
  'not_null',
];

const baseBooleanOperators: WorkflowOperator[] = [
  'is_true',
  'is_false',
  'eq',
  'neq',
  'changed',
];

const baseDateOperators: WorkflowOperator[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'changed',
  'changed_from',
  'changed_to',
  'is_today',
  'is_yesterday',
  'is_tomorrow',
  'days_passed_gt',
  'days_passed_lt',
  'days_remaining_gt',
  'days_remaining_lt',
  'is_null',
  'not_null',
];

const baseTimeOperators: WorkflowOperator[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'changed',
  'changed_from',
  'changed_to',
  'hours_passed_gt',
  'hours_passed_lt',
  'hours_remaining_gt',
  'hours_remaining_lt',
  'is_null',
  'not_null',
];

const baseDateTimeOperators: WorkflowOperator[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'changed',
  'changed_from',
  'changed_to',
  'is_today',
  'is_yesterday',
  'is_tomorrow',
  'days_passed_gt',
  'days_passed_lt',
  'days_remaining_gt',
  'days_remaining_lt',
  'hours_passed_gt',
  'hours_passed_lt',
  'hours_remaining_gt',
  'hours_remaining_lt',
  'is_null',
  'not_null',
];

export const getWorkflowOperatorsForField = (field?: ModuleField | null): WorkflowOperator[] => {
  if (!field) return ['eq'];

  switch (field.type) {
    case FieldType.CHECKBOX:
      return baseBooleanOperators;
    case FieldType.NUMBER:
    case FieldType.PRICE:
    case FieldType.PERCENTAGE:
    case FieldType.STOCK:
      return baseNumericOperators;
    case FieldType.SELECT:
    case FieldType.STATUS:
    case FieldType.RELATION:
    case FieldType.USER:
    case FieldType.MULTI_SELECT:
    case FieldType.TAGS:
      return baseSelectOperators;
    case FieldType.DATE:
      return baseDateOperators;
    case FieldType.TIME:
      return baseTimeOperators;
    case FieldType.DATETIME:
      return baseDateTimeOperators;
    case FieldType.LINK:
    case FieldType.PHONE:
    case FieldType.TEXT:
    case FieldType.LONG_TEXT:
    default:
      return baseTextOperators;
  }
};

export const getWorkflowOperatorOptions = (field?: ModuleField | null) =>
  getWorkflowOperatorsForField(field).map((op) => ({
    label: WORKFLOW_OPERATORS[op],
    value: op,
  }));

export const getDefaultWorkflowOperator = (field?: ModuleField | null): WorkflowOperator => {
  const options = getWorkflowOperatorsForField(field);
  return options[0] || 'eq';
};

export const workflowOperatorNeedsValue = (operator?: string) => {
  return ![
    'is_true',
    'is_false',
    'is_null',
    'not_null',
    'changed',
    'is_today',
    'is_yesterday',
    'is_tomorrow',
  ].includes(String(operator || ''));
};

export const workflowOperatorNumericValue = (operator?: string) => {
  return [
    'days_passed_gt',
    'days_passed_lt',
    'days_remaining_gt',
    'days_remaining_lt',
    'hours_passed_gt',
    'hours_passed_lt',
    'hours_remaining_gt',
    'hours_remaining_lt',
  ].includes(String(operator || ''));
};

export const normalizeWorkflowValueByFieldType = (field: ModuleField | undefined, value: any) => {
  if (!field) return value;
  if (value === undefined) return value;
  if (value === null) return null;

  if (field.type === FieldType.MULTI_SELECT || field.type === FieldType.TAGS) {
    return Array.isArray(value) ? value : value ? [value] : [];
  }

  if ([FieldType.NUMBER, FieldType.PRICE, FieldType.PERCENTAGE, FieldType.STOCK].includes(field.type)) {
    const parsed = parseFloat(String(value).replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (field.type === FieldType.CHECKBOX) {
    if (typeof value === 'boolean') return value;
    const normalized = String(value).toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return !!value;
  }

  return value;
};


// نگاشت نوع فیلد به عملگر پیش‌فرض
export const getMessageForOperator = (op: FilterOperator) => {
    switch(op) {
        case FilterOperator.CONTAINS: return 'شامل';
        case FilterOperator.EQUALS: return 'برابر با';
        case FilterOperator.GREATER_THAN: return 'بزرگتر از';
        case FilterOperator.LESS_THAN: return 'کوچکتر از';
        default: return '';
    }
};

// تابع اصلی که پراپرتی‌های سرچ ستون جدول رو می‌سازه
export const getColumnSearchProps = (
  field: any, 
  handleSearch: (selectedKeys: any[], confirm: () => void, dataIndex: string) => void,
  handleReset: (clearFilters: () => void) => void
) => {
  
  // 1. جستجوی متنی (Text, Email, Phone)
  if ([FieldType.TEXT, FieldType.PHONE].includes(field.type)) {
    return {
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: any) => (
        <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
          <Input
            placeholder={`جستجو در ${field.labels.fa}`}
            value={selectedKeys[0]}
            onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
            onPressEnter={() => handleSearch(selectedKeys, confirm, field.key)}
            style={{ marginBottom: 8, display: 'block' }}
          />
          <Space>
            <Button
              type="primary"
              onClick={() => handleSearch(selectedKeys, confirm, field.key)}
              icon={<SearchOutlined />}
              size="small"
              style={{ width: 90 }}
            >
              جستجو
            </Button>
            <Button onClick={() => clearFilters && handleReset(clearFilters)} size="small" style={{ width: 90 }}>
              پاک کردن
            </Button>
          </Space>
        </div>
      ),
      filterIcon: (filtered: boolean) => (
        <SearchOutlined style={{ color: filtered ? '#c58f60' : undefined }} />
      ),
      onFilter: (value: any, record: any) =>
        record[field.key]?.toString().toLowerCase().includes((value as string).toLowerCase()),
    };
  }

  // 2. جستجوی بازه‌ای (Price, Number, Stock)
  if ([FieldType.PRICE, FieldType.NUMBER, FieldType.STOCK].includes(field.type)) {
    return {
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: any) => (
        <div style={{ padding: 8, width: 250 }}>
          <div className="flex gap-2 mb-2">
              <InputNumber
                placeholder="از"
                value={selectedKeys[0]}
                onChange={(v) => setSelectedKeys([v, selectedKeys[1]])}
                style={{ width: '100%' }}
              />
              <InputNumber
                placeholder="تا"
                value={selectedKeys[1]}
                onChange={(v) => setSelectedKeys([selectedKeys[0], v])}
                style={{ width: '100%' }}
              />
          </div>
          <Space>
            <Button type="primary" onClick={() => handleSearch(selectedKeys, confirm, field.key)} size="small">اعمال</Button>
            <Button onClick={() => clearFilters && handleReset(clearFilters)} size="small">حذف</Button>
          </Space>
        </div>
      ),
      filterIcon: (filtered: boolean) => <FilterOutlined style={{ color: filtered ? '#c58f60' : undefined }} />,
      // نکته: فیلترینگ کلاینت‌ساید برای دمو (در عمل این باید سمت سرور انجام بشه)
      onFilter: (_value: any, _record: any) => true, 
    };
  }

  // 3. جستجوی انتخابی (Select, Status, Relation)
  if ([FieldType.SELECT, FieldType.STATUS, FieldType.RELATION].includes(field.type)) {
    return {
      filters: field.options?.map((opt: any) => ({ text: opt.label, value: opt.value })),
      filterSearch: true, // قابلیت سرچ در لیست دراپ‌داون
      onFilter: (value: any, record: any) => record[field.key] === value,
      filterIcon: (filtered: boolean) => <FilterOutlined style={{ color: filtered ? '#c58f60' : undefined }} />,
    };
  }
  
  return {};
};
