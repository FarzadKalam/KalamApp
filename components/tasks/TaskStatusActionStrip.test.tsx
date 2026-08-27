import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TaskStatusActionStrip from './TaskStatusActionStrip';

describe('TaskStatusActionStrip', () => {
  it('renders the Task V2 status tiles and changes an inactive status', () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <TaskStatusActionStrip
        options={[
          { value: 'draft', label: 'پیش‌نویس', color: '#64748b', icon: 'circle' },
          { value: 'ready', label: 'آماده', color: '#2563eb', icon: 'check' },
        ]}
        currentValue="draft"
        onChange={onChange}
      />,
    );

    const activeButton = getByRole('button', { name: 'تغییر وضعیت به پیش‌نویس' });
    const readyButton = getByRole('button', { name: 'تغییر وضعیت به آماده' });
    expect(activeButton.className).toContain('w-[4.25rem]');
    expect(activeButton.querySelector('.h-9')).toBeTruthy();
    fireEvent.click(readyButton);
    expect(onChange).toHaveBeenCalledWith('ready');
  });
});
