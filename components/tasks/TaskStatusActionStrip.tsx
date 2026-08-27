import React from 'react';
import { ClockCircleOutlined } from '@ant-design/icons';
import TaskStatusIcon from './TaskStatusIcon';

export type TaskStatusActionStripOption = {
  value: string | number;
  label: React.ReactNode;
  color?: string;
  icon?: string;
};

type TaskStatusActionStripProps = {
  options: TaskStatusActionStripOption[];
  currentValue?: string | null;
  savingValue?: string | null;
  onChange: (value: string) => void | Promise<void>;
  getColor?: (value: string, option: TaskStatusActionStripOption) => string;
  getIconKey?: (value: string, option: TaskStatusActionStripOption) => string;
  isDisabled?: (value: string, option: TaskStatusActionStripOption) => boolean;
  renderAfterOption?: (value: string, option: TaskStatusActionStripOption) => React.ReactNode;
};

export const TASK_STATUS_TILE_CLASS_NAME = 'group flex w-[4.25rem] shrink-0 flex-col items-center gap-1 rounded-lg px-1.5 py-1 text-center transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_10px_22px_rgba(15,23,42,0.10)] disabled:cursor-wait disabled:opacity-60 dark:hover:bg-white/10 dark:hover:shadow-[0_10px_22px_rgba(0,0,0,0.22)]';
export const TASK_STATUS_TILE_ICON_CLASS_NAME = 'inline-flex h-9 w-9 items-center justify-center rounded-lg text-[17px] shadow-sm transition group-hover:scale-110 group-hover:ring-2 group-hover:ring-offset-1 group-hover:ring-offset-white dark:group-hover:ring-offset-slate-950';

const TaskStatusActionStrip: React.FC<TaskStatusActionStripProps> = ({
  options,
  currentValue,
  savingValue = null,
  onChange,
  getColor,
  getIconKey,
  isDisabled,
  renderAfterOption,
}) => (
  <div className="flex max-w-full items-start gap-1.5 overflow-x-auto">
    {options.map((option) => {
      const value = String(option.value || '').trim();
      const active = value === String(currentValue || '').trim();
      const color = getColor?.(value, option) || option.color || '#64748b';
      const disabled = savingValue !== null || Boolean(isDisabled?.(value, option));
      return (
        <React.Fragment key={value}>
          <button
            type="button"
            onClick={() => { if (!disabled) void onChange(value); }}
            disabled={disabled}
            className={TASK_STATUS_TILE_CLASS_NAME}
            aria-label={`تغییر وضعیت به ${String(option.label || value)}`}
            title={String(option.label || value)}
          >
            <span
              className={TASK_STATUS_TILE_ICON_CLASS_NAME}
              style={{
                color: active ? '#fff' : color,
                opacity: active ? 1 : 0.48,
                backgroundColor: active ? color : `${color}0f`,
                boxShadow: active ? `0 8px 18px ${color}33` : '0 2px 8px rgba(15, 23, 42, 0.05)',
              }}
            >
              {savingValue === value
                ? <ClockCircleOutlined spin />
                : <TaskStatusIcon iconKey={getIconKey?.(value, option) || option.icon} />}
            </span>
            <span className={`line-clamp-2 min-h-[1.5rem] text-[10px] leading-3 ${active ? 'font-black text-gray-700 dark:text-gray-100' : 'font-semibold text-gray-300 dark:text-gray-500'}`}>
              {option.label}
            </span>
          </button>
          {renderAfterOption?.(value, option)}
        </React.Fragment>
      );
    })}
  </div>
);

export default TaskStatusActionStrip;
