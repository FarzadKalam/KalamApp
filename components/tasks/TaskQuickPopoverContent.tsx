import React from 'react';
import { Button, Checkbox, Input, InputNumber, Select, Space, Tag } from 'antd';
import { ArrowRightOutlined, ClockCircleOutlined, OrderedListOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import { getBaseTaskStatusOptions, getTaskStatusColor, getTaskStatusLabel, getTaskStatusOptions } from '../../utils/processTaskStatusOptions';

interface TaskQuickPopoverContentProps {
  task: any;
  readOnly?: boolean;
  allowReportEditInReadOnly?: boolean;
  currentAssigneeCombo?: string;
  assigneeUserOptions?: Array<{ value: string; label: string }>;
  assigneeRoleOptions?: Array<{ value: string; label: string }>;
  onAssigneeChange?: (value?: string) => void;
  statusOptions?: Array<{ value: string | number; label: string; color?: string }>;
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

const DEFAULT_STATUS_OPTIONS = getBaseTaskStatusOptions();

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
  const resolvedStatusOptions = getTaskStatusOptions(task, statusOptions || DEFAULT_STATUS_OPTIONS);
  const normalizedStatusValue = String(statusValue || task?.status || '').trim();
  const statusLabel = getTaskStatusLabel(normalizedStatusValue, task, resolvedStatusOptions) || normalizedStatusValue;
  const statusTagColor = getTaskStatusColor(normalizedStatusValue, task, resolvedStatusOptions);

  return (
    <div className="w-full max-w-full p-1 font-['Vazirmatn'] md:w-80 md:max-w-[80vw] h-full flex flex-col min-h-0">
      <div className="mb-3 border-b border-[rgba(var(--brand-200-rgb),0.45)] pb-2 dark:border-[rgba(var(--brand-300-rgb),0.18)]">
        <h4 className="m-0 text-sm font-bold text-[rgba(var(--brand-800-rgb),1)] dark:text-gray-100 line-clamp-2">
          {task?.title || task?.name || 'بدون عنوان'}
        </h4>
        {statusLabel || taskTypeValue ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {statusLabel ? <Tag color={statusTagColor}>{statusLabel}</Tag> : null}
            {taskTypeValue ? <Tag>{taskTypeValue}</Tag> : null}
          </div>
        ) : null}
      </div>

      <div className="mb-3 space-y-3 flex-1 min-h-0 overflow-y-auto">
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
            options={resolvedStatusOptions}
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

        <div className="space-y-2 rounded-lg border border-[rgba(var(--brand-200-rgb),0.45)] bg-[rgba(var(--brand-50-rgb),0.55)] p-2 text-xs text-gray-700 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-[#111827] dark:text-gray-300">
          <div className="flex items-center gap-2">
            <OrderedListOutlined className="text-[rgba(var(--brand-700-rgb),1)]" />
            <span>ترتیب: {toPersianNumber(sortOrder || '-')}</span>
          </div>
          <div className="flex items-center gap-2">
            {assigneeType === 'role' ? <TeamOutlined className="text-[rgba(var(--brand-700-rgb),1)]" /> : <UserOutlined className="text-[rgba(var(--brand-700-rgb),1)]" />}
            <span>مسئول: {assigneeDisplayLabel || 'تعیین نشده'}</span>
          </div>
          {hasWage && wageLabel ? (
            <div className="flex items-center gap-2">
              <span className="text-[rgba(var(--brand-700-rgb),1)]">💰</span>
              <span>دستمزد: {wageLabel}</span>
            </div>
          ) : null}
          {hasWeight && weightLabel ? (
            <div className="flex items-center gap-2">
              <span className="text-[rgba(var(--brand-700-rgb),1)]">وزن:</span>
              <span>{weightLabel}</span>
            </div>
          ) : null}
          {dueDateLabel ? (
            <div className="flex items-center gap-2">
              <ClockCircleOutlined className="text-[rgba(var(--brand-700-rgb),1)]" />
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

      <div className="flex justify-between border-t border-[rgba(var(--brand-200-rgb),0.45)] pt-2 dark:border-[rgba(var(--brand-300-rgb),0.18)]">
        {supportsHandover ? (
          <Button
            size="small"
            type="link"
            className="px-0 text-xs text-[rgba(var(--brand-700-rgb),1)] hover:text-[rgba(var(--brand-600-rgb),1)]"
            onClick={onOpenHandover}
          >
            فرم‌های تحویل کالا
          </Button>
        ) : (
          <span />
        )}
        <Link to={`/tasks/${task?.id}`} target="_blank">
          <Button size="small" type="link" icon={<ArrowRightOutlined />} className="text-xs text-[rgba(var(--brand-700-rgb),1)] hover:text-[rgba(var(--brand-600-rgb),1)]">
            جزئیات کامل
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default TaskQuickPopoverContent;
