import React from 'react';
import { InputNumber, Select } from 'antd';
import { TeamOutlined, UserOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import ProductionStagesField from '../ProductionStagesField';
import { safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import { getResolvedAssigneeId } from '../../utils/assigneeValue';
import { resolveTaskSourceLink } from '../../utils/taskMeta';

interface TaskSummaryCardProps {
  task: any;
  statusOptions: Array<{ label: string; value: string | number }>;
  priorityOptions: Array<{ label: string; value: string | number }>;
  assigneeNameMap?: Record<string, string>;
  roleNameMap?: Record<string, string>;
  recordTitle?: string | null;
  onClose?: () => void;
  onStatusChange?: (taskId: string, status: string) => void | Promise<void>;
  onProducedQtyChange?: (taskId: string, value: number | null) => void | Promise<void>;
}

const processRecordKeyByModule: Record<string, string> = {
  projects: 'project_id',
  customers: 'related_customer',
  invoices: 'related_invoice',
  purchase_invoices: 'purchase_invoice_id',
  marketing_leads: 'marketing_lead_id',
};

const resolveOptionLabel = (value: any, options?: Array<{ label: string; value: any }>) => {
  if (!options?.length) return null;
  const found = options.find((option) => String(option.value) === String(value));
  return found?.label || null;
};

const toNumber = (value: any) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const TaskSummaryCard: React.FC<TaskSummaryCardProps> = ({
  task,
  statusOptions,
  priorityOptions,
  assigneeNameMap = {},
  roleNameMap = {},
  recordTitle,
  onClose,
  onStatusChange,
  onProducedQtyChange,
}) => {
  const sourceLink = resolveTaskSourceLink(task);
  const relatedModuleId = String(sourceLink.moduleId || '');
  const relatedRecordId = sourceLink.recordId;

  const statusColor = task.status === 'done'
    ? 'border-green-300'
    : task.status === 'canceled'
      ? 'border-red-300'
      : task.status === 'review'
        ? 'border-orange-300'
        : 'border-[rgba(var(--brand-200-rgb),0.6)] dark:border-[rgba(var(--brand-300-rgb),0.3)]';

  const isProductionTask = (
    relatedModuleId === 'production_orders'
    && task?.related_production_order
    && task?.production_line_id
  );

  const relatedProcessRecordKey = processRecordKeyByModule[relatedModuleId];
  const relatedProcessRecordId = relatedProcessRecordKey ? task?.[relatedProcessRecordKey] : null;
  const isExecutionProcessTask = (
    !isProductionTask
    && !!relatedProcessRecordId
    && Object.prototype.hasOwnProperty.call(processRecordKeyByModule, relatedModuleId)
  );

  const canEditProducedQty = !['todo', 'pending'].includes(String(task?.status || '').toLowerCase());
  const assigneeId = String(getResolvedAssigneeId(task) || '');
  const assigneeLabel = task.assignee_type === 'role'
    ? (roleNameMap[assigneeId] || 'نقش')
    : (assigneeNameMap[assigneeId] || 'کاربر');

  return (
    <div className="mb-2">
      <div className={`border ${statusColor} rounded-2xl bg-white/95 p-3 shadow-sm transition-all hover:border-[rgba(var(--brand-400-rgb),0.75)] hover:shadow-md dark:bg-[rgba(var(--app-dark-surface-rgb),0.65)]`}>
        <div className="flex items-center justify-between gap-3">
          <Link to={`/tasks/${task.id}`} className="font-bold text-gray-800 dark:text-gray-200" onClick={onClose}>
            {toPersianNumber(String(task.name || 'بدون عنوان'))}
          </Link>
          {onStatusChange ? (
            <Select
              size="small"
              value={task.status}
              onChange={(value) => {
                void onStatusChange(String(task.id), String(value));
              }}
              options={statusOptions.map((option) => ({ label: option.label, value: option.value }))}
              style={{ minWidth: 120 }}
            />
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 mt-2">
          {task.priority ? (
            <span className="text-[11px] bg-[rgba(var(--brand-50-rgb),0.9)] dark:bg-[rgba(var(--brand-700-rgb),0.26)] text-gray-700 dark:text-gray-200 px-2 py-0.5 rounded-full">
              {resolveOptionLabel(task.priority, priorityOptions) || task.priority}
            </span>
          ) : null}
          {task.due_date ? (
            <span className="text-[11px] bg-[rgba(var(--brand-50-rgb),0.9)] dark:bg-[rgba(var(--brand-700-rgb),0.26)] text-gray-700 dark:text-gray-200 px-2 py-0.5 rounded-full">
              موعد: {safeJalaliFormat(task.due_date, 'YYYY/MM/DD HH:mm')}
            </span>
          ) : null}
        </div>

        {isProductionTask ? (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-600 dark:text-gray-300">مقدار تولید شده:</span>
            <InputNumber
              size="small"
              min={0}
              value={toNumber(task?.produced_qty)}
              disabled={!canEditProducedQty || !onProducedQtyChange}
              className="w-28 persian-number"
              onChange={(value) => {
                if (!onProducedQtyChange) return;
                void onProducedQtyChange(String(task.id), value);
              }}
            />
          </div>
        ) : null}

        <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500 gap-3">
          {recordTitle && relatedModuleId && relatedRecordId ? (
            <span className="truncate">
              رکورد مرتبط:{' '}
              <Link to={`/${relatedModuleId}/${relatedRecordId}`} className="text-leather-600" onClick={onClose}>
                {toPersianNumber(String(recordTitle))}
              </Link>
            </span>
          ) : <span />}
          <span className="flex items-center gap-1 shrink-0">
            {task.assignee_type === 'role' ? <TeamOutlined /> : <UserOutlined />}
            {toPersianNumber(String(assigneeLabel))}
          </span>
        </div>

        {isProductionTask ? (
          <div className="mt-3 rounded-lg border border-[rgba(var(--brand-300-rgb),0.55)] dark:border-[rgba(var(--brand-300-rgb),0.32)] bg-[rgba(var(--brand-50-rgb),0.9)] dark:bg-[rgba(var(--brand-700-rgb),0.18)] p-2">
            <ProductionStagesField
              recordId={String(task.related_production_order)}
              moduleId="production_orders"
              readOnly
              compact
              cardCompact
              allowReportEditInReadOnly
              lazyLoad
              onlyLineId={String(task.production_line_id)}
            />
          </div>
        ) : null}

        {isExecutionProcessTask ? (
          <div className="mt-3 rounded-lg border border-[rgba(var(--brand-300-rgb),0.55)] dark:border-[rgba(var(--brand-300-rgb),0.32)] bg-[rgba(var(--brand-50-rgb),0.9)] dark:bg-[rgba(var(--brand-700-rgb),0.18)] p-2">
            <ProductionStagesField
              recordId={String(relatedProcessRecordId)}
              moduleId={relatedModuleId}
              readOnly
              compact
              cardCompact
              allowReportEditInReadOnly
              lazyLoad
            />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default TaskSummaryCard;
