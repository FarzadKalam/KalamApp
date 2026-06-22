import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Toolbar from './Toolbar';
import { ViewMode } from '../../types';

const baseProps = {
  viewMode: ViewMode.LIST,
  setViewMode: vi.fn(),
  searchTerm: '',
  onSearchChange: vi.fn(),
  onRefresh: vi.fn(),
  kanbanGroupBy: null,
  kanbanGroupOptions: [],
  onKanbanGroupChange: vi.fn(),
  calendarDateField: null,
  calendarDateFieldOptions: [],
  onCalendarDateFieldChange: vi.fn(),
};

describe('Module list toolbar AI search switch', () => {
  it('switches the existing search box from normal search to AI question submit', async () => {
    const onSearchChange = vi.fn();
    const onAiModeToggle = vi.fn();
    const onAiSubmit = vi.fn();

    const Harness = () => {
      const [searchTerm, setSearchTerm] = React.useState('');
      const [aiModeEnabled, setAiModeEnabled] = React.useState(false);
      return (
        <Toolbar
          {...baseProps}
          searchTerm={searchTerm}
          onSearchChange={(value) => {
            onSearchChange(value);
            setSearchTerm(value);
          }}
          aiModeEnabled={aiModeEnabled}
          onAiModeToggle={(enabled) => {
            onAiModeToggle(enabled);
            setAiModeEnabled(enabled);
          }}
          onAiSubmit={onAiSubmit}
        />
      );
    };

    render(<Harness />);

    fireEvent.change(screen.getByPlaceholderText('جستجو...'), { target: { value: 'مشتری' } });
    expect(onSearchChange).toHaveBeenLastCalledWith('مشتری');

    fireEvent.click(screen.getByRole('switch', { name: 'تغییر حالت جستجو و هوش مصنوعی' }));
    expect(onAiModeToggle).toHaveBeenCalledWith(true);

    fireEvent.change(screen.getByPlaceholderText('از هوش مصنوعی درباره این لیست بپرسید...'), { target: { value: 'جمع فروش ماه را بگو' } });
    expect(onSearchChange).not.toHaveBeenCalledWith('جمع فروش ماه را بگو');
    fireEvent.click(screen.getByRole('button', { name: 'ارسال پرسش به هوش مصنوعی' }));
    expect(onAiSubmit).toHaveBeenCalledWith('جمع فروش ماه را بگو');

    const searchControls = screen.getByRole('button', { name: 'ارسال پرسش به هوش مصنوعی' }).parentElement;
    expect(searchControls?.textContent).toContain('AI');
  });
});
