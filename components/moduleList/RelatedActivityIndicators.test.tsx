import React from 'react';
import { ConfigProvider } from 'antd';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RelatedActivityIndicators from './RelatedActivityIndicators';
import { fetchCurrentUserRoleContext } from '../../utils/permissions';
import { openTaskProcessModal } from '../../utils/taskProcessModalEvents';

const db = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../../supabaseClient', () => ({ supabase: db }));
vi.mock('../../utils/permissions', () => ({ fetchCurrentUserRoleContext: vi.fn() }));
vi.mock('../../utils/taskProcessModalEvents', () => ({ openTaskProcessModal: vi.fn() }));
vi.mock('../SmartFieldRenderer', () => ({ RelationQuickCreateHost: (props: any) => props.open ? <div role="dialog" aria-label="افزودن فعالیت مرتبط">
  <span>{props.initialValues.source_module_id}</span><span>{props.initialValues.source_record_id}</span>
  <button onClick={() => props.onCreated({ id: 'created-task', values: { name: 'فعالیت جدید' } })}>ثبت فعالیت مرتبط</button>
</div> : null }));
vi.mock('../../utils/moduleListLive', () => ({ markModuleListChanged: vi.fn() }));
vi.mock('../../moduleRegistry', () => ({ MODULES: { tasks: {
  id: 'tasks', fields: [
    { key: 'name', isKey: true },
    { key: 'description', blockId: 'general', labels: { fa: 'شرح فعالیت' } },
    { key: 'task_report', blockId: 'general', labels: { fa: 'گزارش فعالیت' } },
    { key: 'priority', labels: { fa: 'اولویت' }, options: [{ value: 'high', label: 'بالا' }] },
    { key: 'start_date', blockId: 'scheduling', labels: { fa: 'زمان شروع' } },
    { key: 'completed_at', blockId: 'scheduling', labels: { fa: 'زمان تکمیل' } },
  ],
} } }));

const records = [
  { id: 'task-a', name: 'تماس با مشتری', description: 'بررسی نیاز مشتری\nهماهنگی جلسه', task_report: 'جلسه هماهنگ شد', priority: 'high' },
  { id: 'task-b', name: 'ارسال پیشنهاد', description: 'ارسال پیش‌فاکتور', task_report: 'در انتظار پاسخ' },
];
let query: any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchCurrentUserRoleContext).mockResolvedValue({ userId: 'user', roleId: 'role', orgId: 'org-a', permissions: {} });
  query = {};
  for (const key of ['select', 'eq', 'order']) query[key] = vi.fn(() => query);
  query.limit = vi.fn(async () => ({ data: records, error: null }));
  db.from.mockReturnValue(query);
});
afterEach(cleanup);

const mount = () => {
  const onCardClick = vi.fn();
  const result = render(<ConfigProvider theme={{ token: { motion: false } }}><div onClick={onCardClick}>
    <RelatedActivityIndicators moduleId="marketing_leads" recordId="lead-a" summary={{ total: 0, completed: 0, overdue: 0, upcoming: 0, open: 0 }} />
  </div></ConfigProvider>);
  return { ...result, onCardClick };
};

const openList = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'بدون فعالیت' }));
  return screen.findByRole('button', { name: 'بازکردن فعالیت تماس با مشتری' });
};

describe('related activity modal interactions', () => {
  it('uses the shared related activity form with the current source and reloads the list after creation', async () => {
    const { onCardClick } = mount();
    await openList();
    fireEvent.click(screen.getByRole('button', { name: 'ایجاد فعالیت' }));
    const createDialog = await screen.findByRole('dialog', { name: 'افزودن فعالیت مرتبط' });
    expect(within(createDialog).getByText('marketing_leads')).toBeInTheDocument();
    expect(within(createDialog).getByText('lead-a')).toBeInTheDocument();
    fireEvent.click(within(createDialog).getByRole('button', { name: 'ثبت فعالیت مرتبط' }));
    await waitFor(() => expect(query.limit).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog', { name: 'افزودن فعالیت مرتبط' })).not.toBeInTheDocument();
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it('hides creation when the user has view access without edit access', async () => {
    vi.mocked(fetchCurrentUserRoleContext).mockResolvedValue({ userId: 'user', roleId: 'role', orgId: 'org-a', permissions: { tasks: { edit: false } } });
    mount();
    await openList();
    expect(screen.queryByRole('button', { name: 'ایجاد فعالیت' })).not.toBeInTheDocument();
  });
  it('closes using the cross without opening the parent lead, including portal clicks', async () => {
    const { onCardClick } = mount();
    await openList();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onCardClick).not.toHaveBeenCalled();
    expect(openTaskProcessModal).not.toHaveBeenCalled();
  });

  it('closes on the backdrop without navigating to the lead', async () => {
    const { onCardClick } = mount();
    await openList();
    const backdrop = document.querySelector('.ant-modal-wrap') as HTMLElement;
    fireEvent.mouseDown(backdrop);
    fireEvent.mouseUp(backdrop);
    fireEvent.click(backdrop);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it('expands and collapses each activity independently without opening it or the lead', async () => {
    const { onCardClick } = mount();
    await openList();
    expect(screen.queryByText('جلسه هماهنگ شد')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'نمایش جزئیات تماس با مشتری' }));
    expect(screen.getByText('جلسه هماهنگ شد')).toBeInTheDocument();
    expect(screen.getByText('شرح فعالیت')).toBeInTheDocument();
    expect(screen.getByText('گزارش فعالیت')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'بستن جزئیات تماس با مشتری' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'نمایش جزئیات ارسال پیشنهاد' })).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'بستن جزئیات تماس با مشتری' }));
    expect(screen.queryByText('جلسه هماهنگ شد')).not.toBeInTheDocument();
    expect(openTaskProcessModal).not.toHaveBeenCalled();
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it('opens the canonical activity modal by ID and closes the list without navigating to the lead', async () => {
    const { onCardClick } = mount();
    fireEvent.click(await openList());
    expect(openTaskProcessModal).toHaveBeenCalledExactlyOnceWith({ taskId: 'task-a' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onCardClick).not.toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith('org_id', 'org-a');
    expect(query.eq).toHaveBeenCalledWith('marketing_lead_id', 'lead-a');
  });

  it('shows a labelled grey empty indicator and a complete legend even for empty lists', async () => {
    query.limit.mockResolvedValue({ data: [], error: null });
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'بدون فعالیت' }));
    await screen.findByText('فعالیتی برای این رکورد ثبت نشده است.');
    const legend = screen.getByRole('note', { name: 'راهنمای وضعیت فعالیت‌ها' });
    for (const label of ['عقب‌افتاده', 'نزدیک (تا ۷ روز)', 'انجام‌شده', 'باز', 'بدون فعالیت']) {
      expect(within(legend).getByText(label)).toBeInTheDocument();
    }
  });

  it('does not label an unavailable summary as no activities', () => {
    render(<RelatedActivityIndicators moduleId="marketing_leads" recordId="lead-a" />);
    expect(screen.getByRole('button', { name: 'فعالیت‌ها' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'بدون فعالیت' })).not.toBeInTheDocument();
  });

  it('reports query failure and retries instead of claiming that the activity list is empty', async () => {
    query.limit.mockResolvedValueOnce({ data: null, error: { message: 'network request failed' } });
    const { onCardClick } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'بدون فعالیت' }));
    fireEvent.click(await screen.findByRole('button', { name: 'تلاش دوباره' }));
    await screen.findByRole('button', { name: 'بازکردن فعالیت تماس با مشتری' });
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it('fails closed when the organization or activity access is unavailable', async () => {
    vi.mocked(fetchCurrentUserRoleContext).mockResolvedValue({ userId: 'user', roleId: 'role', orgId: null, permissions: {} });
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'بدون فعالیت' }));
    await screen.findByText('دسترسی به فعالیت‌های این سازمان وجود ندارد.');
    expect(db.from).not.toHaveBeenCalled();
  });

  it('does not fetch report text or scheduling fields hidden by field/block permissions', async () => {
    vi.mocked(fetchCurrentUserRoleContext).mockResolvedValue({ userId: 'user', roleId: 'role', orgId: 'org-a', permissions: {
      tasks: { fields: { task_report: false, scheduling: false } },
    } });
    mount();
    await openList();
    const columns = query.select.mock.calls[0][0].split(',');
    expect(columns).toContain('description');
    expect(columns).not.toContain('task_report');
    expect(columns).not.toContain('start_date');
    expect(columns).not.toContain('completed_at');
  });

  it('discards a delayed response for a previous lead instead of replacing the current activities', async () => {
    let resolvePrevious!: (value: any) => void;
    query.limit.mockImplementationOnce(() => new Promise((resolve) => { resolvePrevious = resolve; }));
    query.limit.mockResolvedValueOnce({ data: [{ id: 'new-task', name: 'فعالیت لید جدید' }], error: null });
    const view = render(<RelatedActivityIndicators moduleId="marketing_leads" recordId="lead-a" />);
    fireEvent.click(screen.getByRole('button', { name: 'فعالیت‌ها' }));
    await waitFor(() => expect(query.limit).toHaveBeenCalledTimes(1));
    view.rerender(<RelatedActivityIndicators moduleId="marketing_leads" recordId="lead-b" />);
    await screen.findByRole('button', { name: 'بازکردن فعالیت فعالیت لید جدید' });
    await act(async () => { resolvePrevious({ data: records, error: null }); });
    expect(screen.queryByRole('button', { name: 'بازکردن فعالیت تماس با مشتری' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'بازکردن فعالیت فعالیت لید جدید' })).toBeInTheDocument();
  });
});
