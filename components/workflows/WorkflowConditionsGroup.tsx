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
  onBeforeAddCondition?: () => boolean | void;
  lockedConditionIds?: string[];
  requiredConditionIds?: string[];
  dynamicFieldProps?: Record<string, {
    onOptionsUpdate?: () => void;
    protectedValues?: string[];
  }>;
  getOperatorOptions?: (field?: ModuleField | null) => Array<{ label: string; value: string }>;
  getDefaultOperator?: (field?: ModuleField | null) => string;
}

const getFieldOptions = (
  field: ModuleField | undefined,
  dynamicOptions: Record<string, Array<{ label: string; value: string }>>,
  relationOptions: Record<string, Array<{ label: string; value: string }>>
) => {
  if (!field) return [];
  if (relationOptions[field.key]?.length) {
    return relationOptions[field.key] || [];
  }
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
    (field.type === FieldType.RELATION || field.type === FieldType.USER || field.type === FieldType.TAGS) &&
    relationOptions[field.key]
  ) {
    return relationOptions[field.key] || [];
  }
  return [];
};

const popupContainer = (node?: HTMLElement | null) => node?.parentElement || document.body;

const WorkflowConditionsGroup: React.FC<WorkflowConditionsGroupProps> = ({
  value,
  onChange,
  fields,
  dynamicOptions,
  relationOptions,
  disabled = false,
  onBeforeAddCondition,
  lockedConditionIds = [],
  requiredConditionIds = [],
  dynamicFieldProps = {},
  getOperatorOptions,
  getDefaultOperator,
}) => {
  const safeValue = Array.isArray(value) ? value : [];
  const lockedConditionIdSet = useMemo(() => new Set(lockedConditionIds), [lockedConditionIds]);
  const requiredConditionIdSet = useMemo(() => new Set(requiredConditionIds), [requiredConditionIds]);
  const lockedFieldKeySet = useMemo(
    () => new Set(
      safeValue
        .filter((condition) => lockedConditionIdSet.has(String(condition?.id || '')))
        .map((condition) => String(condition?.field || '').trim())
        .filter(Boolean)
    ),
    [lockedConditionIdSet, safeValue]
  );

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
  const editableFieldOptions = useMemo(() => {
    const filtered = fieldOptions.filter((option) => !lockedFieldKeySet.has(String(option.value || '')));
    return filtered.length > 0 ? filtered : fieldOptions;
  }, [fieldOptions, lockedFieldKeySet]);

  const firstField = useMemo(() => {
    const firstEditableFieldKey = String(editableFieldOptions[0]?.value || '').trim();
    return fields.find((field) => String(field?.key || '').trim() === firstEditableFieldKey) || fields[0];
  }, [editableFieldOptions, fields]);

  const addCondition = () => {
    if (onBeforeAddCondition?.() === false) return;
    if (!firstField) return;
    const next = [
      ...safeValue,
      {
        id: createWorkflowId(),
        field: firstField.key,
        operator: getDefaultOperator?.(firstField) || getDefaultWorkflowOperator(firstField),
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

  const commonSelectProps = {
    showSearch: true,
    optionFilterProp: 'label' as const,
    disabled,
    placeholder: 'انتخاب مقدار',
    className: 'w-full',
    getPopupContainer: popupContainer,
    popupMatchSelectWidth: false,
    listHeight: 240,
    virtual: false,
  };

  const renderValueInput = (condition: WorkflowCondition, isLocked = false) => {
    const field = fields.find((f) => f.key === condition.field);
    if (!field) {
      return <Input disabled placeholder="فیلد نامعتبر" />;
    }

    if (!workflowOperatorNeedsValue(condition.operator)) {
      return (
        <div className="rounded-lg border border-dashed border-[rgba(var(--brand-200-rgb),0.75)] bg-[rgba(var(--brand-50-rgb),0.42)] px-2 py-1 text-xs text-[rgba(var(--brand-700-rgb),0.72)] dark:border-[rgba(var(--brand-300-rgb),0.22)] dark:bg-white/5 dark:text-[rgba(var(--brand-200-rgb),0.76)]">
          این عملگر نیاز به مقدار ندارد
        </div>
      );
    }

    if (workflowOperatorNumericValue(condition.operator)) {
      return (
        <InputNumber
          className="w-full persian-number"
          disabled={disabled || isLocked}
          value={condition.value as any}
          onChange={(nextVal) => updateCondition(condition.id, { value: nextVal })}
          placeholder="عدد"
          min={0}
        />
      );
    }

    const options = getFieldOptions(field, dynamicOptions, relationOptions);

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
          disabled={disabled || isLocked}
          className="w-full"
          allowClear
          showSearch
          getPopupContainer={popupContainer as any}
          onOptionsUpdate={dynamicFieldProps[field.dynamicOptionsCategory]?.onOptionsUpdate}
          protectedValues={dynamicFieldProps[field.dynamicOptionsCategory]?.protectedValues}
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
          disabled={disabled || isLocked}
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
          disabled={disabled || isLocked}
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
          disabled={disabled || isLocked}
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
        <div className="flex w-full items-center justify-start px-1">
          <Switch
            checked={!!condition.value}
            disabled={disabled || isLocked}
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
          disabled={disabled || isLocked}
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
          disabled={disabled || isLocked}
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
          disabled={disabled || isLocked}
          placeholder="تاریخ و زمان"
        />
      );
    }

    return (
      <Input
        value={condition.value}
        disabled={disabled || isLocked}
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
          const isLocked = lockedConditionIdSet.has(String(condition.id || ''));
          const isRequired = requiredConditionIdSet.has(String(condition.id || ''));
          return (
            <div
              key={condition.id}
              className="grid grid-cols-1 items-center gap-2 rounded-xl border border-[rgba(var(--brand-200-rgb),0.55)] bg-[rgba(var(--brand-50-rgb),0.38)] p-3 md:grid-cols-12 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5"
            >
              <div className="md:col-span-4">
                <div className="flex items-center gap-1">
                <Select
                  showSearch
                  optionFilterProp="label"
                  disabled={disabled || isLocked}
                  options={isLocked ? fieldOptions : editableFieldOptions}
                  getPopupContainer={popupContainer}
                  popupMatchSelectWidth={false}
                  listHeight={240}
                  virtual={false}
                  value={condition.field}
                  onChange={(nextFieldKey) => {
                    const nextField = fields.find((f) => f.key === nextFieldKey);
                    updateCondition(condition.id, {
                      field: nextFieldKey,
                      operator: getDefaultOperator?.(nextField) || getDefaultWorkflowOperator(nextField),
                      value: undefined,
                    });
                  }}
                  placeholder="فیلد"
                  className="w-full"
                />
                {isRequired ? <span className="text-base font-semibold leading-none text-red-500">*</span> : null}
                </div>
              </div>
              <div className="md:col-span-3">
                <Select
                  disabled={disabled || isLocked}
                  options={getOperatorOptions?.(field) || getWorkflowOperatorOptions(field)}
                  getPopupContainer={popupContainer}
                  popupMatchSelectWidth={false}
                  listHeight={220}
                  virtual={false}
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
              <div className="md:col-span-4">{renderValueInput(condition, isLocked)}</div>
              <div className="flex justify-end md:col-span-1">
                <Button
                  type="text"
                  htmlType="button"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    removeCondition(condition.id);
                  }}
                  disabled={disabled || isLocked}
                />
              </div>
            </div>
          );
        })
      )}
      <Space>
        <Button
          type="dashed"
          htmlType="button"
          icon={<PlusOutlined />}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            addCondition();
          }}
          disabled={disabled || !firstField}
          className="border-[rgba(var(--brand-300-rgb),0.7)] text-[rgba(var(--brand-700-rgb),1)] hover:!border-[rgba(var(--brand-500-rgb),0.9)] hover:!text-[rgba(var(--brand-600-rgb),1)] hover:!bg-[rgba(var(--brand-50-rgb),0.7)] dark:border-[rgba(var(--brand-300-rgb),0.28)] dark:text-[rgba(var(--brand-200-rgb),1)] dark:hover:!bg-white/5"
        >
          افزودن شرط
        </Button>
      </Space>
    </div>
  );
};

export default WorkflowConditionsGroup;
