import { describe, expect, it } from 'vitest';
import { getTaskStatusLabel, getTaskStatusOptions } from './processTaskStatusOptions';

describe('process task status options', () => {
  it('returns the Persian label for custom task statuses from recurrence options', () => {
    const task = {
      status: 'manager_review',
      recurrence_info: {
        process_task_status_options: [
          { value: 'manager_review', label: 'منتظر تایید مدیر', color: 'orange' },
        ],
      },
    };

    expect(getTaskStatusLabel('manager_review', task)).toBe('منتظر تایید مدیر');
    expect(getTaskStatusOptions(task).find((item) => String(item.value) === 'manager_review')?.label).toBe('منتظر تایید مدیر');
  });

  it('falls back to the stored Persian label on the task when custom options are missing', () => {
    const task = {
      status: 'finance_check',
      status_label: 'در انتظار بررسی مالی',
    };

    expect(getTaskStatusLabel('finance_check', task)).toBe('در انتظار بررسی مالی');
    expect(getTaskStatusOptions(task).find((item) => String(item.value) === 'finance_check')?.label).toBe('در انتظار بررسی مالی');
  });
});
