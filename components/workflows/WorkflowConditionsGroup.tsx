import React, { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Input, InputNumber, Space, Switch } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import { FieldType, ModuleField } from '../../types';
import DynamicSelectField from '../DynamicSelectField';
import PersianDatePicker from '../PersianDatePicker';
import AdaptiveSelectField from '../AdaptiveSelectField';
import AdaptiveIdentityPicker from '../AdaptiveIdentityPicker';
import { parseIdentityToken, type IdentityOption } from '../../utils/identityDirectory';
import { getHolidayOccasionOptions, type HolidayOccasionOption } from '../../utils/holidayCalendar';
import { AdaptivePickerMode, resolveOverlayPopupContainer, resolveSelectPopupContainer } from '../../utils/popupContainer';
import {
  getDefaultWorkflowOperator,
  getWorkflowOperatorOptions,
  normalizeWorkflowValueByFieldType,
  workflowOperatorNumericValue,
  workflowOperatorNeedsValue,
} from '../../utils/filterUtils';
import { WORKFLOW_ASSIGNEE_FIELD_KEY, WorkflowCondition, createWorkflowId } from '../../utils/workflowTypes';
import { getFieldLabelFa } from '../../utils/fieldLabel';

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
  overlayZIndexBase?: number;
  popupContainer?: (trigger?: HTMLElement | null) => HTMLElement;
  adaptiveMode?: AdaptivePickerMode;
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
  // گزینه‌های پویا ممکن است گزینه‌های پایهٔ فیلد را هم در خود داشته باشند؛
  // اولویت با این منبع است تا گزینه‌های افزوده‌شده برای شرط‌ساز هم دیده شوند.
  if (field.dynamicOptionsCategory) {
    return dynamicOptions[field.dynamicOptionsCategory] || [];
  }
  if (field.type === FieldType.SELECT || field.type === FieldType.STATUS || field.type === FieldType.CHECKLIST) {
    return (field.options || []).map((opt) => ({
      label: String(opt?.label ?? opt?.value ?? ''),
      value: String(opt?.value ?? ''),
    }));
  }
  if (
    (
      field.type === FieldType.RELATION
      || field.type === FieldType.MULTI_RELATION
      || field.type === FieldType.USER
      || field.type === FieldType.TAGS
    ) &&
    relationOptions[field.key]
  ) {
    return relationOptions[field.key] || [];
  }
  return [];
};

const OCCASION_OPERATORS = new Set([
  'occasion_eq',
  'occasion_neq',
  'occasion_contains',
  'occasion_not_contains',
  'days_before_occasion',
]);

const MULTI_OCCASION_OPERATORS = new Set(['occasion_contains', 'occasion_not_contains']);
const JALALI_MONTH_OPTIONS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
].map((label, index) => ({ label, value: String(index + 1) }));

const isOccasionOperator = (operator?: string) => OCCASION_OPERATORS.has(String(operator || ''));

const getCurrentJalaliYear = () => {
  const current = new DateObject({ date: new Date(), calendar: persian, locale: persian_fa });
  return Number(String(current.year || '').replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))));
};

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
  overlayZIndexBase = 1400,
  popupContainer = resolveSelectPopupContainer,
  adaptiveMode = 'auto',
}) => {
  const safeValue = Array.isArray(value) ? value : [];
  const [occasionOptions, setOccasionOptions] = useState<HolidayOccasionOption[]>([]);
  const resolvedPopupContainer = (trigger?: HTMLElement | null) => {
    const configuredHost = popupContainer(trigger);
    if (configuredHost && (typeof document === 'undefined' || configuredHost !== document.body)) {
      return configuredHost;
    }
    const modalBodyHost = trigger?.closest?.('.ant-modal-body, .ant-modal-content, .ant-modal') as HTMLElement | null;
    return modalBodyHost || configuredHost || resolveOverlayPopupContainer(trigger);
  };
  const lockedConditionIdSet = useMemo(() => new Set(lockedConditionIds), [lockedConditionIds]);
  const requiredConditionIdSet = useMemo(() => new Set(requiredConditionIds), [requiredConditionIds]);

  useEffect(() => {
    let alive = true;
    const currentYear = getCurrentJalaliYear();
    void getHolidayOccasionOptions([currentYear, currentYear + 1]).then((options) => {
      if (alive) setOccasionOptions(options);
    });
    return () => {
      alive = false;
    };
  }, []);
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
          label: getFieldLabelFa(field),
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
    getPopupContainer: resolvedPopupContainer,
    modalContainer: resolvedPopupContainer,
    preferLocalPopupContainer: true,
    popupMatchSelectWidth: false,
    listHeight: 240,
    virtual: false,
    overlayZIndexBase,
    adaptiveMode,
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

    if (condition.operator === 'jalali_month_in' || condition.operator === 'jalali_month_not_in') {
      return <AdaptiveSelectField {...commonSelectProps} mode="multiple" options={JALALI_MONTH_OPTIONS} value={Array.isArray(condition.value) ? condition.value : []} disabled={disabled || isLocked} onChange={(value) => updateCondition(condition.id, { value })} placeholder="ماه‌های سال" pickerTitle="ماه‌های سال" />;
    }

    if (condition.operator === 'date_between' || condition.operator === 'datetime_between' || condition.operator === 'time_between') {
      const range = condition.value && typeof condition.value === 'object' && !Array.isArray(condition.value) ? condition.value as any : {};
      const pickerType = condition.operator === 'datetime_between' ? 'DATETIME' : condition.operator === 'time_between' ? 'TIME' : 'DATE';
      return <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <PersianDatePicker type={pickerType} value={range.from || null} onChange={(from) => updateCondition(condition.id, { value: { ...range, from } })} disabled={disabled || isLocked} placeholder="از" overlayZIndexBase={overlayZIndexBase} modalContainer={resolvedPopupContainer} adaptiveMode={adaptiveMode} />
        <PersianDatePicker type={pickerType} value={range.to || null} onChange={(to) => updateCondition(condition.id, { value: { ...range, to } })} disabled={disabled || isLocked} placeholder="تا" overlayZIndexBase={overlayZIndexBase} modalContainer={resolvedPopupContainer} adaptiveMode={adaptiveMode} />
      </div>;
    }

    if (isOccasionOperator(condition.operator)) {
      const options = occasionOptions.map((option) => ({
        label: option.isHoliday ? `${option.label} - تعطیل` : option.label,
        value: option.value,
      }));

      if (condition.operator === 'days_before_occasion') {
        const objectValue = condition.value && typeof condition.value === 'object' && !Array.isArray(condition.value)
          ? condition.value
          : {};
        return (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            <InputNumber
              className="w-full persian-number md:col-span-2"
              disabled={disabled || isLocked}
              value={objectValue.days as any}
              onChange={(nextVal) => updateCondition(condition.id, {
                value: {
                  ...objectValue,
                  days: nextVal,
                },
              })}
              placeholder="تعداد روز"
              min={0}
            />
            <AdaptiveSelectField
              {...commonSelectProps}
              className="w-full md:col-span-3"
              options={options}
              value={objectValue.occasion || undefined}
              disabled={disabled || isLocked}
              onChange={(nextVal) => updateCondition(condition.id, {
                value: {
                  ...objectValue,
                  occasion: nextVal,
                },
              })}
              placeholder="مناسبت"
              pickerTitle="مناسبت"
            />
          </div>
        );
      }

      const expectsListValue = MULTI_OCCASION_OPERATORS.has(String(condition.operator || ''));
      return (
        <AdaptiveSelectField
          {...commonSelectProps}
          mode={expectsListValue ? 'multiple' : undefined}
          options={options}
          value={
            expectsListValue
              ? (Array.isArray(condition.value) ? condition.value : (condition.value ? [condition.value] : []))
              : condition.value
          }
          disabled={disabled || isLocked}
          onChange={(nextVal) => updateCondition(condition.id, { value: nextVal })}
          placeholder="مناسبت"
          pickerTitle="مناسبت"
        />
      );
    }

    const options = getFieldOptions(field, dynamicOptions, relationOptions);
    const expectsListValue =
      condition.operator === 'in'
      || condition.operator === 'not_in'
      || (
        field.key === WORKFLOW_ASSIGNEE_FIELD_KEY
        && (condition.operator === 'contains' || condition.operator === 'not_contains')
      );

    if (field.key === WORKFLOW_ASSIGNEE_FIELD_KEY || field.type === FieldType.USER) {
      const isAssigneeField = field.key === WORKFLOW_ASSIGNEE_FIELD_KEY;
      const additionalIdentityOptions = options.flatMap((option: any) => {
        const parsed = parseIdentityToken(option?.value, isAssigneeField ? null : 'user');
        if (!parsed.kind || !parsed.id || !parsed.token) return [];
        return [{
          kind: parsed.kind,
          id: parsed.id,
          token: parsed.token,
          label: String(option?.label || '').trim() || (parsed.kind === 'role' ? 'نقش بدون عنوان' : 'کاربر بدون نام'),
          active: true,
        } satisfies IdentityOption];
      });
      return (
        <AdaptiveIdentityPicker
          mode={expectsListValue ? 'multiple' : undefined}
          scopes={isAssigneeField ? ['user', 'role'] : ['user']}
          valueMode={isAssigneeField ? 'token' : 'raw'}
          additionalOptions={additionalIdentityOptions}
          value={expectsListValue
            ? (Array.isArray(condition.value) ? condition.value : (condition.value ? [condition.value] : []))
            : condition.value}
          disabled={disabled || isLocked}
          onChange={(nextVal) => updateCondition(condition.id, {
            value: normalizeWorkflowValueByFieldType(field, nextVal),
          })}
          placeholder={getFieldLabelFa(field)}
          pickerTitle={getFieldLabelFa(field)}
          overlayZIndexBase={overlayZIndexBase}
          adaptiveMode={adaptiveMode}
        />
      );
    }

    if (field.dynamicOptionsCategory) {
      return (
        <DynamicSelectField
          value={expectsListValue ? (Array.isArray(condition.value) ? condition.value : (condition.value ? [condition.value] : [])) : condition.value}
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
          mode={expectsListValue ? 'multiple' : undefined}
          getPopupContainer={resolvedPopupContainer as any}
          modalContainer={resolvedPopupContainer}
          preferLocalPopupContainer
          onOptionsUpdate={dynamicFieldProps[field.dynamicOptionsCategory]?.onOptionsUpdate}
          protectedValues={dynamicFieldProps[field.dynamicOptionsCategory]?.protectedValues}
          overlayZIndexBase={overlayZIndexBase}
          adaptiveMode={adaptiveMode}
          pickerTitle={getFieldLabelFa(field)}
        />
      );
    }

    if (
      field.type === FieldType.SELECT ||
      field.type === FieldType.STATUS ||
      field.type === FieldType.CHECKLIST ||
      field.type === FieldType.RELATION ||
      field.type === FieldType.MULTI_RELATION
    ) {
      return (
        <AdaptiveSelectField
          {...commonSelectProps}
          mode={expectsListValue || field.type === FieldType.MULTI_RELATION || field.type === FieldType.CHECKLIST ? 'multiple' : undefined}
          options={options}
          value={
            expectsListValue || field.type === FieldType.MULTI_RELATION || field.type === FieldType.CHECKLIST
              ? (Array.isArray(condition.value) ? condition.value : (condition.value ? [condition.value] : []))
              : condition.value
          }
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
        <AdaptiveSelectField
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
          overlayZIndexBase={overlayZIndexBase}
          modalContainer={resolvedPopupContainer}
          adaptiveMode={adaptiveMode}
          pickerTitle={getFieldLabelFa(field)}
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
          overlayZIndexBase={overlayZIndexBase}
          modalContainer={resolvedPopupContainer}
          adaptiveMode={adaptiveMode}
          pickerTitle={getFieldLabelFa(field)}
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
          overlayZIndexBase={overlayZIndexBase}
          modalContainer={resolvedPopupContainer}
          adaptiveMode={adaptiveMode}
          pickerTitle={getFieldLabelFa(field)}
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
                <AdaptiveSelectField
                  showSearch
                  optionFilterProp="label"
                  disabled={disabled || isLocked}
                  options={isLocked ? fieldOptions : editableFieldOptions}
                  getPopupContainer={resolvedPopupContainer}
                  modalContainer={resolvedPopupContainer}
                  preferLocalPopupContainer
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
                  overlayZIndexBase={overlayZIndexBase}
                  adaptiveMode={adaptiveMode}
                  pickerTitle="فیلد شرط"
                />
                {isRequired ? <span className="text-base font-semibold leading-none text-red-500">*</span> : null}
                </div>
              </div>
              <div className="md:col-span-3">
                <AdaptiveSelectField
                  disabled={disabled || isLocked}
                  options={getOperatorOptions?.(field) || getWorkflowOperatorOptions(field)}
                  getPopupContainer={resolvedPopupContainer}
                  modalContainer={resolvedPopupContainer}
                  preferLocalPopupContainer
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
                  overlayZIndexBase={overlayZIndexBase}
                  adaptiveMode={adaptiveMode}
                  pickerTitle="عملگر شرط"
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
