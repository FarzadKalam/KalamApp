import React from 'react';
import { Button, Input, Select, InputNumber, Switch } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { ModuleDefinition, FieldType } from '../types';

interface FilterItem {
  id: string;
  field: string;
  operator: string;
  value: any;
}

interface FilterBuilderProps {
  module: ModuleDefinition;
  filters: FilterItem[];
  onChange: (filters: FilterItem[]) => void;
}

const FilterBuilder: React.FC<FilterBuilderProps> = ({ module, filters, onChange }) => {
  
  const addFilter = () => {
    // اصلاح شده: اگر ستون جدول مشخص نبود، اولین فیلد موجود را بردار
    const defaultField = module.fields.find(f => f.isTableColumn) || module.fields[0];
    
    const newFilter: FilterItem = {
      id: Date.now().toString(),
      field: defaultField?.key || '',
      operator: 'eq', // پیش فرض: برابر
      value: ''
    };
    onChange([...filters, newFilter]);
  };

  const removeFilter = (id: string) => {
    onChange(filters.filter(f => f.id !== id));
  };

  const updateFilter = (id: string, key: keyof FilterItem, val: any) => {
    const newFilters = filters.map(f => {
      if (f.id === id) {
        if (key === 'field') {
             // وقتی فیلد عوض میشه، مقدار و اپراتور رو ریست کن
             return { ...f, field: val, operator: 'eq', value: '' };
        }
        return { ...f, [key]: val };
      }
      return f;
    });
    onChange(newFilters);
  };

  const getOperators = (fieldKey: string) => {
    const field = module.fields.find(f => f.key === fieldKey);
    if (!field) return [{ label: 'برابر با', value: 'eq' }];

    switch (field.type) {
      case FieldType.TEXT:
      case FieldType.LONG_TEXT:
        return [
          { label: 'شامل (متن)', value: 'contains' },
          { label: 'دقیقاً برابر', value: 'eq' },
        ];
      case FieldType.NUMBER:
      case FieldType.PRICE:
      case FieldType.STOCK:
        return [
          { label: 'برابر با', value: 'eq' },
          { label: 'بزرگتر از', value: 'gt' },
          { label: 'کوچکتر از', value: 'lt' },
          { label: 'بزرگتر مساوی', value: 'gte' },
          { label: 'کوچکتر مساوی', value: 'lte' },
        ];
      case FieldType.SELECT:
      case FieldType.STATUS:
      case FieldType.CHECKBOX:
        return [
          { label: 'برابر با', value: 'eq' },
          { label: 'نابرابر با', value: 'ne' },
        ];
      default:
        return [{ label: 'برابر با', value: 'eq' }];
    }
  };

  const renderValueInput = (filter: FilterItem) => {
    const field = module.fields.find(f => f.key === filter.field);
    if (!field) return <Input disabled />;

    if (field.type === FieldType.CHECKBOX) {
        return <Switch checked={!!filter.value} onChange={(v) => updateFilter(filter.id, 'value', v)} />;
    }

    if ((field.type === FieldType.SELECT || field.type === FieldType.STATUS) && field.options) {
        return (
            <Select
                style={{ width: 180 }}
                value={filter.value}
                onChange={(v) => updateFilter(filter.id, 'value', v)}
                options={field.options}
                placeholder="انتخاب کنید"
            />
        );
    }

    if (field.type === FieldType.NUMBER || field.type === FieldType.PRICE || field.type === FieldType.STOCK) {
        return (
            <InputNumber
                style={{ width: 180 }}
                value={filter.value}
                onChange={(v) => updateFilter(filter.id, 'value', v)}
                placeholder="عدد وارد کنید"
            />
        );
    }

    return (
        <Input
            style={{ width: 180 }}
            value={filter.value}
            onChange={(e) => updateFilter(filter.id, 'value', e.target.value)}
            placeholder="مقدار..."
        />
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {filters.length === 0 && (
          <div className="text-center text-gray-400 py-6 border-2 border-dashed border-gray-100 rounded-xl bg-gray-50/50">
              هنوز شرطی تعریف نکرده‌اید
          </div>
      )}

      {filters.map((filter, index) => (
        <div key={filter.id || index} className="flex flex-wrap items-center gap-2 bg-gray-50 p-3 rounded-xl border border-gray-200 animate-fadeIn">
          <span className="text-xs text-gray-400 w-5 font-mono">{index + 1}.</span>
          
          <Select
            style={{ width: 180 }}
            value={filter.field}
            onChange={(val) => updateFilter(filter.id, 'field', val)}
            options={module.fields.map(f => ({ label: f.labels.fa, value: f.key }))}
            showSearch
            optionFilterProp="label"
          />

          <Select
            style={{ width: 130 }}
            value={filter.operator}
            onChange={(val) => updateFilter(filter.id, 'operator', val)}
            options={getOperators(filter.field)}
          />

          <div className="flex-1 min-w-[150px]">
             {renderValueInput(filter)}
          </div>

          <Button 
            danger 
            type="text" 
            shape="circle"
            icon={<DeleteOutlined />} 
            onClick={() => removeFilter(filter.id)} 
          />
        </div>
      ))}

      <Button type="dashed" block icon={<PlusOutlined />} onClick={addFilter} className="mt-2 h-10 rounded-xl border-gray-300 text-gray-500 hover:text-leather-600 hover:border-leather-400">
        افزودن شرط جدید
      </Button>
    </div>
  );
};

export default FilterBuilder;