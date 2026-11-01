import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import OnlineContentCalendarPublicPage from './OnlineContentCalendarPublicPage';

const fixture = vi.hoisted(() => {
  const now = new Date(); const date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}T12:00:00`;
  return { rpc: vi.fn(), date };
});
vi.mock('../supabaseClient', () => ({ supabase: {}, supabasePublic: { rpc: fixture.rpc }, SUPABASE_URL:'https://example.test', SUPABASE_ANON_KEY:'test' }));
vi.mock('../utils/holidayCalendar', () => ({ getHolidaySummaryForDate: async () => ({ occasions: [{title:'مناسبت طولانی برای بررسی نمایش کامل متن در تقویم'}] }) }));

describe('online content calendar', () => {
  it('expands hidden records, wraps full titles and lists only the current month statuses', async () => {
    fixture.rpc.mockResolvedValue({ data: {
      calendar: { name: 'تقویم نمونه' },
      tasks: [1,2,3,4].map((id) => ({ id, name:`فعالیت طولانی شماره ${id}`, status:'todo',due_date:fixture.date })),
      projects: [{ id:'project', name:'پروژه نمونه', status:'planning', due_date:fixture.date }, { id:'outside',name:'خارج ماه',status:'completed', due_date:'2020-01-01T12:00:00' }],
    }, error:null });
    render(<MemoryRouter initialEntries={['/calendar/link']}><Routes><Route path="/calendar/:token" element={<OnlineContentCalendarPublicPage/>}/></Routes></MemoryRouter>);
    await screen.findByText('تقویم نمونه');
    expect(screen.queryByText('فعالیت طولانی شماره 4')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'+۲ مورد دیگر'}));
    expect(screen.getByText('فعالیت طولانی شماره 4')).toBeVisible();
    const title = screen.getByText('فعالیت طولانی شماره 4');
    expect(title).toHaveClass('truncate');
    fireEvent.click(screen.getByRole('button',{name:'نمایش متن کامل'}));
    expect(title).not.toHaveClass('truncate');
    expect(screen.getByRole('button',{name:'نمایش فشرده'})).toHaveAttribute('aria-pressed','true');
    const legend = screen.getByLabelText('راهنمای وضعیت‌های این ماه');
    expect(within(legend).getByText('پروژه: برنامه‌ریزی')).toBeVisible();
    expect(within(legend).queryByText(/تکمیل شده/)).not.toBeInTheDocument();
    expect(screen.queryByText('planning')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'نمایش کمتر'}));
    expect(screen.queryByText('فعالیت طولانی شماره 4')).not.toBeInTheDocument();
  });
});
