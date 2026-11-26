// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import WorkSchedulesPage from './WorkSchedulesPage';

const { from, renderTimeField } = vi.hoisted(() => ({ from: vi.fn(), renderTimeField: vi.fn() }));
vi.mock('antd', async (importOriginal) => {
  const antd = await importOriginal<typeof import('antd')>();
  return { ...antd, Select: ({ value, onChange, options = [], 'aria-label': label }: {
    value?: string; onChange: (value: string) => void; options?: { value: string; label: string }[]; 'aria-label'?: string;
  }) => (
    <select aria-label={label} value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  ) };
});
vi.mock('../supabaseClient', () => ({
  supabase: { from, auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) } },
}));
vi.mock('../components/Sidebar/RelatedSidebar', () => ({ default: () => null }));
vi.mock('../components/ProductionStagesField', () => ({ default: () => null }));
vi.mock('../components/AdaptiveIdentityPicker', () => ({ default: () => null }));
vi.mock('../moduleRegistry', () => ({ MODULES: {} }));
vi.mock('../utils/holidayCalendar', () => ({ getHolidaySummaryForDate: async () => null }));
vi.mock('../components/PersianDatePicker', () => ({
  default: ({ type, value, onChange, placeholder }: {
    type: string; value: string | null; onChange: (value: string | null) => void; placeholder: string;
  }) => {
    if (type === 'TIME') renderTimeField();
    return <input data-picker-type={type} aria-label={placeholder} value={value ?? ''} onChange={(event) => onChange(event.target.value || null)} />;
  },
}));

it('limits date changes to one visible week and preserves shifts and drafts across weeks', async () => {
  const employees = Array.from({ length: 7 }, (_, index) => ({ id: `employee-${index}`, full_name: `کارمند ${index}` }));
  const record = {
    id: 'schedule', title: 'برنامهٔ آزمایشی', effective_from: '2026-10-23', effective_to: '2026-11-21',
    weekly_plan: { columns: employees.map(({ id }) => ({
      employeeId: id, createdBy: 'user', monthlyPlan: { '2026-11-22': { shift1: { start: '09:30', end: '16:00' } } },
      weeklyPlan: { sun: { shift1: { start: '08:00', end: '17:00' } } },
    })) },
  };
  from.mockImplementation((table: string) => {
    const result = { data: table === 'employees' ? employees : table === 'work_schedules' ? record : [], error: null };
    return { select: () => ({
      order: async () => result,
      eq: () => ({ order: async () => result, maybeSingle: async () => result }),
      in: () => new Promise(() => {}),
    }) };
  });

  render(<App><MemoryRouter initialEntries={['/work_schedules/schedule/edit']}>
    <Routes><Route path="/work_schedules/:id/edit" element={<WorkSchedulesPage />} /></Routes>
  </MemoryRouter></App>);

  const startDate = await screen.findByRole('textbox', { name: 'از تاریخ' });
  const endDate = screen.getByRole('textbox', { name: 'تا تاریخ' });
  const timeFields = () => document.querySelectorAll('[data-picker-type="TIME"]');
  fireEvent.change(endDate, { target: { value: '2026-12-21' } });
  expect(timeFields().length).toBeLessThanOrEqual(7 * 7 * 4);
  fireEvent.change(startDate, { target: { value: '2026-11-22' } });
  expect(timeFields().length).toBeLessThanOrEqual(7 * 7 * 4);
  expect(screen.getAllByDisplayValue('09:30')).toHaveLength(7);

  renderTimeField.mockClear();
  fireEvent.change(screen.getAllByDisplayValue('09:30')[0], { target: { value: '10:00' } });
  expect(renderTimeField).toHaveBeenCalledTimes(1);
  const week = screen.getByRole('combobox', { name: 'هفتهٔ برنامه' });
  fireEvent.change(week, { target: { value: '2026-11-28' } });
  await waitFor(() => expect(screen.getAllByDisplayValue('08:00')).toHaveLength(7));
  fireEvent.change(week, { target: { value: '2026-11-21' } });
  await waitFor(() => expect(screen.getByDisplayValue('10:00')).toBeTruthy());
});
