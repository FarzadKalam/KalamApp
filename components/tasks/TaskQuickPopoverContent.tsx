import React from 'react';
import { Button, Checkbox, Input, InputNumber, Select, Space, Tag } from 'antd';
import { ArrowRightOutlined, ClockCircleOutlined, OrderedListOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { toPersianNumber } from '../../utils/persianNumberFormatter';

interface TaskQuickPopoverContentProps {
  task: any;
  readOnly?: boolean;
  allowReportEditInReadOnly?: boolean;
  currentAssigneeCombo?: string;
  assigneeUserOptions?: Array<{ value: string; label: string }>;
  assigneeRoleOptions?: Array<{ value: string; label: string }>;
  onAssigneeChange?: (value?: string) => void;
  statusOptions?: Array<{ value: string; label: string }>;
  statusValue?: string;
  onStatusChange?: (value: string) => void;
  canEditTaskStatus?: boolean;
  taskTypeValue?: string;
  isProductionOrder?: boolean;
  producedQty?: number;
  onProducedQtyChange?: (value: number | null) => void;
  producedQtyDisabled?: boolean;
  description?: string;
  sortOrder?: string | number | null;
  assigneeType?: string | null;
  assigneeDisplayLabel?: string;
  hasWage?: boolean;
  wageLabel?: string | null;
  hasWeight?: boolean;
  weightLabel?: string | null;
  dueDateLabel?: string | null;
  reportDraft?: string;
  onReportDraftChange?: (value: string) => void;
  onSaveReport?: () => void;
  savingReport?: boolean;
  supportsHandover?: boolean;
  onOpenHandover?: () => void;
}

const DEFAULT_STATUS_OPTIONS = [
  { value: 'todo', label: 'انجام نشده' },
  { value: 'in_progress', label: 'در حال انجام' },
  { value: 'review', label: 'بازبینی' },
  { value: 'done', label: 'تکمیل شده' },
];

const TaskQuickPopoverContent: React.FC<TaskQuickPopoverContentProps> = ({
  task,
  readOnly = false,
  allowReportEditInReadOnly = false,
  currentAssigneeCombo,
  assigneeUserOptions = [],
  assigneeRoleOptions = [],
  onAssigneeChange,
  statusOptions = DEFAULT_STATUS_OPTIONS,
  statusValue,
  onStatusChange,
  canEditTaskStatus = false,
  taskTypeValue,
  isProductionOrder = false,
  producedQty = 0,
  onProducedQtyChange,
  producedQtyDisabled = false,
  description,
  sortOrder,
  assigneeType,
  assigneeDisplayLabel,
  hasWage = false,
  wageLabel,
  hasWeight = false,
  weightLabel,
  dueDateLabel,
  reportDraft = '',
  onReportDraftChange,
  onSaveReport,
  savingReport = false,
  supportsHandover = false,
  onOpenHandover,
}) => {
  return (
    <div className="w-80 max-w-[80vw] p-1 font-['Vazirmatn']">
      <div className="mb-3 border-b border-leather-100 pb-2">
        <h4 className="m-0 text-sm font-bold text-leather-900 dark:text-gray-100 line-clamp-2">
          {task?.title || task?.name || 'بدون عنوان'}
        </h4>
      </div>

      <div className="mb-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-gray-500">مسئول:</span>
          <Select
            size="small"
            value={currentAssigneeCombo}
            onChange={(value) => onAssigneeChange?.(value)}
            className="w-44"
            disabled={readOnly || !onAssigneeChange}
            allowClear
            showSearch
            optionFilterProp="label"
            getPopupContainer={() => document.body}
            styles={{ popup: { root: { zIndex: 12050 } } }}
          >
            <Select.OptGroup label="کاربران">
              {assigneeUserOptions.map((option) => (
                <Select.Option key={`popup-user-${option.value}`} value={`user:${option.value}`} label={option.label}>
                  <Space><UserOutlined /> {option.label}</Space>
                </Select.Option>
              ))}
            </Select.OptGroup>
            <Select.OptGroup label="تیم‌ها">
              {assigneeRoleOptions.map((option) => (
                <Select.Option key={`popup-role-${option.value}`} value={`role:${option.value}`} label={option.label}>
                  <Space><TeamOutlined /> {option.label}</Space>
                </Select.Option>
              ))}
            </Select.OptGroup>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-gray-500">وضعیت:</span>
          <Select
            size="small"
            value={statusValue}
            onChange={(value) => onStatusChange?.(String(value))}
            className="w-44"
            disabled={!canEditTaskStatus || !onStatusChange}
            getPopupContainer={() => document.body}
            styles={{ popup: { root: { zIndex: 12050 } } }}
            options={statusOptions}
          />
        </div>

        <div className="space-y-1">
          <span className="text-xs text-gray-500">نوع فعالیت:</span>
          <div className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            {taskTypeValue || '-'}
          </div>
        </div>

        {isProductionOrder ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-500">مقدار تولید شده:</span>
            <InputNumber
              size="small"
              min={0}
              className="w-44 persian-number"
              value={producedQty}
              disabled={producedQtyDisabled || !onProducedQtyChange}
              onChange={(value) => onProducedQtyChange?.(value)}
            />
          </div>
        ) : null}

        <div className="space-y-1">
          <span className="text-xs text-gray-500">شرح فعالیت:</span>
          <div className="min-h-[54px] whitespace-pre-wrap break-words rounded-md border border-gray-200 bg-gray-50 px-2 py-2 text-xs leading-6 text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            {String(description || '').trim() || '-'}
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-leather-100 bg-leather-50/70 p-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-[#111827] dark:text-gray-300">
          <div className="flex items-center gap-2">
            <OrderedListOutlined className="text-leather-700" />
            <span>ترتیب: {toPersianNumber(sortOrder || '-')}</span>
          </div>
          <div className="flex items-center gap-2">
            {assigneeType === 'role' ? <TeamOutlined className="text-leather-700" /> : <UserOutlined className="text-leather-700" />}
            <span>مسئول: {assigneeDisplayLabel || 'تعیین نشده'}</span>
          </div>
          {hasWage && wageLabel ? (
            <div className="flex items-center gap-2">
              <span className="text-leather-700">💰</span>
              <span>دستمزد: {wageLabel}</span>
            </div>
          ) : null}
          {hasWeight && weightLabel ? (
            <div className="flex items-center gap-2">
              <span className="text-leather-700">وزن:</span>
              <span>{weightLabel}</span>
            </div>
          ) : null}
          {dueDateLabel ? (
            <div className="flex items-center gap-2">
              <ClockCircleOutlined className="text-leather-700" />
              <span>موعد: {dueDateLabel}</span>
            </div>
          ) : null}
        </div>

        <div className="space-y-1">
          <span className="text-xs text-gray-500">گزارش فعالیت:</span>
          <Input.TextArea
            value={reportDraft}
            placeholder="متن گزارش را بنویسید..."
            autoSize={{ minRows: 2, maxRows: 4 }}
            disabled={(readOnly && !allowReportEditInReadOnly) || !onReportDraftChange}
            onChange={(event) => onReportDraftChange?.(event.target.value)}
          />
          <div className="flex items-center justify-between">
            <Checkbox
              disabled={((readOnly && !allowReportEditInReadOnly) || !onSaveReport) || savingReport}
              onChange={(event) => {
                if (!event.target.checked) return;
                onSaveReport?.();
              }}
            >
              ثبت گزارش
            </Checkbox>
            {savingReport ? <span className="text-[11px] text-gray-500">در حال ثبت...</span> : null}
          </div>
        </div>
      </div>

      <div className="flex justify-between border-t border-leather-100 pt-2">
        {supportsHandover ? (
          <Button
            size="small"
            type="link"
            className="px-0 text-xs text-leather-700 hover:text-leather-600"
            onClick={onOpenHandover}
          >
            فرم‌های تحویل کالا
          </Button>
        ) : (
          <span />
        )}
        <Link to={`/tasks/${task?.id}`} target="_blank">
          <Button size="small" type="link" icon={<ArrowRightOutlined />} className="text-xs text-leather-700 hover:text-leather-600">
            جزئیات کامل
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default TaskQuickPopoverContent;
