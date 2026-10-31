import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ModuleListSearchControl from './ModuleListSearchControl';
import Toolbar from './Toolbar';
import { ViewMode } from '../../types';

afterEach(cleanup);

describe('module list compact search', () => {
  it('opens search over the title, keeps the current filter when closed, and restores keyboard focus', async () => {
    const onSearchChange = vi.fn();
    const Page = () => {
      const [value, setValue] = React.useState('');
      return <ModuleListSearchControl moduleTitle="فاکتورهای فروش" searchTerm={value}
        onSearchChange={(next) => { setValue(next); onSearchChange(next); }} onAiSubmit={vi.fn()}>
        <h1>فاکتورهای فروش</h1><span>۱۲۳</span>
      </ModuleListSearchControl>;
    };
    render(<Page />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'جستجو در فاکتورهای فروش' });
    fireEvent.click(trigger);
    const input = screen.getByPlaceholderText('جستجو در فاکتورهای فروش...');
    await waitFor(() => expect(input).toHaveFocus());
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'خریدار' } });
    expect(onSearchChange).toHaveBeenLastCalledWith('خریدار');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByRole('heading')).toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    fireEvent.click(trigger);
    expect(screen.getByRole('textbox')).toHaveValue('خریدار');
  });

  it('keeps AI questions separate from search and submits only nonempty questions', () => {
    const onSearchChange = vi.fn();
    const onAiSubmit = vi.fn();
    render(<ModuleListSearchControl moduleTitle="لیدها" searchTerm="فیلتر فعلی" onSearchChange={onSearchChange} onAiSubmit={onAiSubmit}>
      <h1>لیدها</h1>
    </ModuleListSearchControl>);
    fireEvent.click(screen.getByRole('button', { name: 'گفتگو با هوش مصنوعی درباره لیدها' }));
    const input = screen.getByPlaceholderText('راجع به لیدها با هوش مصنوعی حرف بزنید...');
    expect(screen.getByRole('button', { name: 'ارسال پرسش به هوش مصنوعی' })).toBeDisabled();
    fireEvent.change(input, { target: { value: '  لیدهای معوق را بررسی کن  ' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(onAiSubmit).toHaveBeenCalledExactlyOnceWith('لیدهای معوق را بررسی کن');
    expect(onSearchChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'بستن جستجو' }));
    fireEvent.click(screen.getByRole('button', { name: 'جستجو در لیدها' }));
    expect(screen.getByRole('textbox')).toHaveValue('فیلتر فعلی');
  });

  it('does not submit composing text and does not expose an AI control without its handler', () => {
    const onAiSubmit = vi.fn();
    const view = render(<ModuleListSearchControl moduleTitle="مشتریان" searchTerm="" onSearchChange={vi.fn()} onAiSubmit={onAiSubmit}>عنوان</ModuleListSearchControl>);
    fireEvent.click(screen.getByRole('button', { name: 'گفتگو با هوش مصنوعی درباره مشتریان' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'پرسش' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', code: 'Enter', isComposing: true });
    expect(onAiSubmit).not.toHaveBeenCalled();
    view.rerender(<ModuleListSearchControl moduleTitle="مشتریان" searchTerm="" onSearchChange={vi.fn()}>عنوان</ModuleListSearchControl>);
    expect(screen.queryByRole('button', { name: 'گفتگو با هوش مصنوعی درباره مشتریان' })).not.toBeInTheDocument();
  });
});

describe('compact view controls', () => {
  it('labels icon controls and exposes only the enabled views', () => {
    const setViewMode = vi.fn();
    render(<Toolbar viewMode={ViewMode.KANBAN} setViewMode={setViewMode} kanbanEnabled
      kanbanGroupBy="source" kanbanGroupOptions={[{ label: 'منبع سرنخ', value: 'source' }]}
      onKanbanGroupChange={vi.fn()} calendarDateField={null} calendarDateFieldOptions={[]} onCalendarDateFieldChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'نمای کانبان' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'نمای نقشه' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'نمای جدول' }));
    expect(setViewMode).toHaveBeenCalledWith(ViewMode.LIST);
  });
});
