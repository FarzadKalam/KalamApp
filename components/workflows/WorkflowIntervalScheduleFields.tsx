import React from 'react';
import { Form, InputNumber } from 'antd';
import type { FormInstance } from 'antd';
import {
  INTERVAL_DAY_CONDITION_OPTIONS,
  intervalUnitOptions,
} from '../../utils/workflowTypes';
import AdaptiveSelectField from '../AdaptiveSelectField';
import PersianDatePicker from '../PersianDatePicker';

export type WorkflowIntervalFieldNames = {
  intervalValue: string;
  intervalUnit: string;
  intervalAt: string;
  intervalFirstRunAt: string;
  intervalMinute: string;
  intervalAllowedFromHour: string;
  intervalAllowedToHour: string;
  intervalDayOfMonth: string;
  intervalDayCondition: string;
  intervalDaysAfterHoliday: string;
  batchSize: string;
};

export const DEFAULT_WORKFLOW_INTERVAL_FIELD_NAMES: WorkflowIntervalFieldNames = {
  intervalValue: 'interval_value',
  intervalUnit: 'interval_unit',
  intervalAt: 'interval_at',
  intervalFirstRunAt: 'interval_first_run_at',
  intervalMinute: 'interval_minute',
  intervalAllowedFromHour: 'interval_allowed_from_hour',
  intervalAllowedToHour: 'interval_allowed_to_hour',
  intervalDayOfMonth: 'interval_day_of_month',
  intervalDayCondition: 'interval_day_condition',
  intervalDaysAfterHoliday: 'interval_days_after_holiday',
  batchSize: 'batch_size',
};

type WorkflowIntervalScheduleFieldsProps = {
  form: FormInstance<any>;
  fieldNames?: WorkflowIntervalFieldNames;
  disabled?: boolean;
  overlayZIndexBase?: number;
  popupContainer?: (trigger?: HTMLElement | null) => HTMLElement;
};

const WorkflowIntervalScheduleFields: React.FC<WorkflowIntervalScheduleFieldsProps> = ({
  form,
  fieldNames = DEFAULT_WORKFLOW_INTERVAL_FIELD_NAMES,
  disabled = false,
  overlayZIndexBase,
  popupContainer,
}) => {
  const intervalUnit = Form.useWatch(fieldNames.intervalUnit, form);
  const intervalDayCondition = Form.useWatch(fieldNames.intervalDayCondition, form);
  const showDaysAfterHoliday = intervalDayCondition === 'not_friday'
    || intervalDayCondition === 'not_friday_or_holiday';
  const selectOverlayProps = {
    getPopupContainer: popupContainer,
    modalContainer: popupContainer,
    overlayZIndexBase,
  };
  const timePickerProps = {
    overlayZIndexBase,
    modalContainer: popupContainer,
  };

  const renderDayConditionFields = () => (
    <>
      <Form.Item
        label="اگر آن روز"
        name={fieldNames.intervalDayCondition}
        className="mb-0"
      >
        <AdaptiveSelectField
          disabled={disabled}
          options={INTERVAL_DAY_CONDITION_OPTIONS}
          {...selectOverlayProps}
        />
      </Form.Item>
      {showDaysAfterHoliday ? (
        <Form.Item
          label="چند روز پس از آخرین جمعه/تعطیلی اجرا شود؟"
          name={fieldNames.intervalDaysAfterHoliday}
          className="mb-0"
        >
          <InputNumber
            min={0}
            disabled={disabled}
            className="w-full persian-number"
            placeholder="مثال: ۱"
          />
        </Form.Item>
      ) : null}
    </>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Form.Item
          label="هر"
          name={fieldNames.intervalValue}
          rules={[{ required: true, message: 'مقدار بازه الزامی است.' }]}
        >
          <InputNumber
            min={1}
            disabled={disabled}
            className="w-full persian-number"
            placeholder="عدد"
          />
        </Form.Item>
        <Form.Item
          label="واحد زمان"
          name={fieldNames.intervalUnit}
          rules={[{ required: true, message: 'واحد بازه را انتخاب کنید.' }]}
        >
          <AdaptiveSelectField
            disabled={disabled}
            options={intervalUnitOptions}
            {...selectOverlayProps}
          />
        </Form.Item>
        <Form.Item label="اولین زمان اجرا" name={fieldNames.intervalFirstRunAt}>
          <PersianDatePicker
            type="DATETIME"
            disabled={disabled}
            pickerTitle="اولین زمان اجرا"
            {...timePickerProps}
          />
        </Form.Item>
        <Form.Item label="چه تعداد رکورد بررسی شود؟" name={fieldNames.batchSize}>
          <InputNumber
            min={1}
            disabled={disabled}
            className="w-full persian-number"
            placeholder="پیش‌فرض: همه"
          />
        </Form.Item>
      </div>

      {intervalUnit === 'hour' ? (
        <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3 dark:border-blue-900/30 dark:bg-blue-950/20">
          <p className="mb-3 text-xs font-semibold text-blue-700 dark:text-blue-300">تنظیمات اجرای ساعتی</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Form.Item label="در دقیقه" name={fieldNames.intervalMinute} className="mb-0">
              <InputNumber
                min={0}
                max={59}
                disabled={disabled}
                className="w-full persian-number"
                placeholder="۰ تا ۵۹"
              />
            </Form.Item>
            <Form.Item label="از ساعت" name={fieldNames.intervalAllowedFromHour} className="mb-0">
              <InputNumber
                min={0}
                max={23}
                disabled={disabled}
                className="w-full persian-number"
                placeholder="مثال: ۸"
                addonAfter="زمان مجاز اجرا"
              />
            </Form.Item>
            <Form.Item label="الی ساعت" name={fieldNames.intervalAllowedToHour} className="mb-0">
              <InputNumber
                min={0}
                max={23}
                disabled={disabled}
                className="w-full persian-number"
                placeholder="مثال: ۱۸"
              />
            </Form.Item>
          </div>
        </div>
      ) : null}

      {intervalUnit === 'day' ? (
        <div className="rounded-lg border border-orange-100 bg-orange-50/40 p-3 dark:border-orange-900/30 dark:bg-orange-950/20">
          <p className="mb-3 text-xs font-semibold text-orange-700 dark:text-orange-300">تنظیمات اجرای روزانه</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Form.Item label="در ساعت" name={fieldNames.intervalAt} className="mb-0">
              <PersianDatePicker
                type="TIME"
                disabled={disabled}
                pickerTitle="ساعت اجرا"
                {...timePickerProps}
              />
            </Form.Item>
            {renderDayConditionFields()}
          </div>
        </div>
      ) : null}

      {intervalUnit === 'week' ? (
        <div className="rounded-lg border border-cyan-100 bg-cyan-50/40 p-3 dark:border-cyan-900/30 dark:bg-cyan-950/20">
          <p className="mb-3 text-xs font-semibold text-cyan-700 dark:text-cyan-300">تنظیمات اجرای هفتگی</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Form.Item label="در ساعت" name={fieldNames.intervalAt} className="mb-0">
              <PersianDatePicker
                type="TIME"
                disabled={disabled}
                pickerTitle="ساعت اجرا"
                {...timePickerProps}
              />
            </Form.Item>
            {renderDayConditionFields()}
          </div>
        </div>
      ) : null}

      {intervalUnit === 'month' ? (
        <div className="rounded-lg border border-purple-100 bg-purple-50/40 p-3 dark:border-purple-900/30 dark:bg-purple-950/20">
          <p className="mb-3 text-xs font-semibold text-purple-700 dark:text-purple-300">تنظیمات اجرای ماهانه</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Form.Item label="در ساعت" name={fieldNames.intervalAt} className="mb-0">
              <PersianDatePicker
                type="TIME"
                disabled={disabled}
                pickerTitle="ساعت اجرا"
                {...timePickerProps}
              />
            </Form.Item>
            <Form.Item label="چندمین روز ماه؟" name={fieldNames.intervalDayOfMonth} className="mb-0">
              <InputNumber
                min={1}
                max={31}
                disabled={disabled}
                className="w-full persian-number"
                placeholder="۱ تا ۳۱"
              />
            </Form.Item>
            {renderDayConditionFields()}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default WorkflowIntervalScheduleFields;
