import React, { useMemo } from 'react';
import { Button, Empty, Input, InputNumber, Select, Space, Switch } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { FieldType, ModuleField } from '../../types';
import DynamicSelectField from '../DynamicSelectField';
import PersianDatePicker from '../PersianDatePicker';
import {
  getDefaultWorkflowOperator,
  getWorkflowOperatorOptions,
  normalizeWorkflowValueByFieldType,
  workflowOperatorNumericValue,
  workflowOperatorNeedsValue,
} from '../../utils/filterUtils';
import { WorkflowCondition, createWorkflowId } from '../../utils/workflowTypes';

interface WorkflowConditionsGroupProps {
  value: WorkflowCondition[];
  onChange: (next: WorkflowCondition[]) => void;
  fields: ModuleField[];
  dynamicOptions: Record<string, Array<{ label: string; value: string }>>;
  relationOptions: Record<string, Array<{ label: string; value: string }>>;
  disabled?: boolean;
}

const getFieldOptions = (
  field: ModuleField | undefined,
  dynamicOptions: Record<string, Array<{ label: string; value: string }>>,
  relationOptions: Record<string, Array<{ label: string; value: string }>>
) => {
  if (!field) return [];
  if (field.type === FieldType.SELECT || field.type === FieldType.STATUS) {
    return (field.options || []).map((opt) => ({
      label: String(opt?.label ?? opt?.value ?? ''),
      value: String(opt?.value ?? ''),
    }));
  }
  if (field.dynamicOptionsCategory) {
    return dynamicOptions[field.dynamicOptionsCategory] || [];
  }
  if (
    (field.type === FieldType.RELATION || field.type === FieldType.USER) &&
    relationOptions[field.key]
  ) {
    return relationOptions[field.key] || [];
  }
  return [];
};

const WorkflowConditionsGroup: React.FC<WorkflowConditionsGroupProps> = ({
  value,
  onChange,
  fields,
  dynamicOptions,
  relationOptions,
  disabled = false,
}) => {
  const safeValue = Array.isArray(value) ? value : [];

  const fieldOptions = useMemo(
    () =>
      fields
        .filter((f) => !!f?.key)
        .map((field) => ({
          label: field?.labels?.fa || field.key,
          value: field.key,
        })),
    [fields]
  );

  const firstField = fields[0];

  const addCondition = () => {
    if (!firstField) return;
    const next = [
      ...safeValue,
      {
        id: createWorkflowId(),
        field: firstField.key,
        operator: getDefaultWorkflowOperator(firstField),
        value: undefined,
      },
    ];
    onChange(next);
  };

  const updateCondition = (id: string, patch: Partial<WorkflowCondition>) => {
    const next = safeValue.map((item) => {
      if (item.id !== id) return item;
      const merged = { ...item, ...patch };
      if (!workflowOperatorNeedsValue(merged.operator)) {
        delete merged.value;
      }
      return merged;
    });
    onChange(next);
  };

  const removeCondition = (id: string) => {
    onChange(safeValue.filter((item) => item.id !== id));
  };

  const renderValueInput = (condition: WorkflowCondition) => {
    const field = fields.find((f) => f.key === condition.field);
    if (!field) {
      return <Input disabled placeholder="فیلد نامعتبر" />;
    }

    if (!workflowOperatorNeedsValue(condition.operator)) {
      return (
        <div className="text-xs text-gray-400 py-1 px-2 rounded border border-dashed border-gray-200">
          این عملگر نیاز به مقدار ندارد
        </div>
      );
    }

    if (workflowOperatorNumericValue(condition.operator)) {
      return (
        <InputNumber
          className="w-full persian-number"
          disabled={disabled}
          value={condition.value as any}
          onChange={(nextVal) => updateCondition(condition.id, { value: nextVal })}
          placeholder="عدد"
          min={0}
        />
      );
    }

    const options = getFieldOptions(field, dynamicOptions, relationOptions);
    const commonSelectProps = {
      showSearch: true,
      optionFilterProp: 'label' as const,
      disabled,
      placeholder: 'انتخاب مقدار',
      className: 'w-full',
    };

    if (field.dynamicOptionsCategory) {
      return (
        <DynamicSelectField
          value={condition.value}
          onChange={(nextVal) =>
            updateCondition(condition.id, {
              value: normalizeWorkflowValueByFieldType(field, nextVal),
            })
          }
          options={options}
          category={field.dynamicOptionsCategory}
          disabled={disabled}
          className="w-full"
          allowClear
          showSearch
        />
      );
    }

    if (
      field.type === FieldType.SELECT ||
      field.type === FieldType.STATUS ||
      field.type === FieldType.RELATION ||
      field.type === FieldType.USER
    ) {
      return (
        <Select
          {...commonSelectProps}
          options={options}
          value={condition.value}
          onChange={(nextVal) =>
            updateCondition(condition.id, {
              value: normalizeWorkflowValueByFieldType(field, nextVal),
            })
          }
        />
      );
    }

    if (field.type === FieldType.MULTI_SELECT || field.type === FieldType.TAGS) {
      return (
        <Select
          {...commonSelectProps}
          mode="multiple"
          options={options}
          value={Array.isArray(condition.value) ? condition.value : []}
          onChange={(nextVal) =>
            updateCondition(condition.id, {
              value: normalizeWorkflowValueByFieldType(field, nextVal),
            })
          }
        />
      );
    }

    if (
      field.type === FieldType.NUMBER ||
      field.type === FieldType.PRICE ||
      field.type === FieldType.PERCENTAGE ||
      field.type === FieldType.STOCK
    ) {
      return (
        <InputNumber
          className="w-full persian-number"
          disabled={disabled}
          value={condition.value as any}
          onChange={(nextVal) =>
            updateCondition(condition.id, {
              value: normalizeWorkflowValueByFieldType(field, nextVal),
            })
          }
          placeholder="عدد"
        />
      );
    }

    if (field.type === FieldType.CHECKBOX) {
      return (
        <div className="w-full flex items-center justify-start px-1">
          <Switch
            checked={!!condition.value}
            disabled={disabled}
            onChange={(nextVal) => updateCondition(condition.id, { value: nextVal })}
          />
        </div>
      );
    }

    if (field.type === FieldType.DATE) {
      return (
        <PersianDatePicker
          type="DATE"
          value={condition.value || null}
          onChange={(nextVal) => updateCondition(condition.id, { value: nextVal })}
          disabled={disabled}
          placeholder="تاریخ"
        />
      );
    }

    if (field.type === FieldType.TIME) {
      return (
        <PersianDatePicker
          type="TIME"
          value={condition.value || null}
          onChange={(nextVal) => updateCondition(condition.id, { value: nextVal })}
          disabled={disabled}
          placeholder="ساعت"
        />
      );
    }

    if (field.type === FieldType.DATETIME) {
      return (
        <PersianDatePicker
          type="DATETIME"
          value={condition.value || null}
          onChange={(nextVal) => updateCondition(condition.id, { value: nextVal })}
          disabled={disabled}
          placeholder="تاریخ و زمان"
        />
      );
    }

    return (
      <Input
        value={condition.value}
        disabled={disabled}
        onChange={(e) =>
          updateCondition(condition.id, {
            value: normalizeWorkflowValueByFieldType(field, e.target.value),
          })
        }
        placeholder="مقدار"
      />
    );
  };

  return (
    <div className="space-y-3">
      {safeValue.length === 0 ? (
        <Empty description="شرطی ثبت نشده است" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        safeValue.map((condition) => {
          const field = fields.find((f) => f.key === condition.field);
          return (
            <div
              key={condition.id}
              className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-white/5 p-3"
            >
              <div className="md:col-span-4">
                <Select
                  showSearch
                  optionFilterProp="label"
                  disabled={disabled}
                  options={fieldOptions}
                  value={condition.field}
                  onChange={(nextFieldKey) => {
                    const nextField = fields.find((f) => f.key === nextFieldKey);
                    updateCondition(condition.id, {
                      field: nextFieldKey,
                      operator: getDefaultWorkflowOperator(nextField),
                      value: undefined,
                    });
                  }}
                  placeholder="فیلد"
                  className="w-full"
                />
              </div>
              <div className="md:col-span-3">
                <Select
                  disabled={disabled}
                  options={getWorkflowOperatorOptions(field)}
                  value={condition.operator}
                  onChange={(nextOperator) =>
                    updateCondition(condition.id, {
                      operator: nextOperator,
                    })
                  }
                  placeholder="عملگر"
                  className="w-full"
                />
              </div>
              <div className="md:col-span-4">{renderValueInput(condition)}</div>
              <div className="md:col-span-1 flex justify-end">
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => removeCondition(condition.id)}
                  disabled={disabled}
                />
              </div>
            </div>
          );
        })
      )}
      <Space>
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={addCondition}
          disabled={disabled || !firstField}
        >
          افزودن شرط
        </Button>
      </Space>
    </div>
  );
};

export default WorkflowConditionsGroup;
