import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { readDashboardPreferences, updateDashboardPreferences } from '../../utils/dashboardPreferences';
import { DashboardDefaultLayoutSwitch, DashboardLayout } from './DashboardLayout';
import { dashboardPackedDropIndex, packDashboardSlots } from './dashboardPacking';
import DashboardWidgetFrame, { DashboardWidgetScope } from './DashboardWidgetFrame';

it('keeps layout controls in edit mode and restores a hidden widget with its width', async () => {
  const scope = { orgId: 'layout-org', userId: 'layout-user' };
  const view = (editing: boolean) => (
    <DashboardWidgetScope.Provider value={scope}>
      <div dir="rtl">
      {editing && <DashboardDefaultLayoutSwitch />}
      <DashboardLayout editing={editing}>
        <DashboardWidgetFrame key="goals" widgetId="goals" title="اهداف">اهداف سازمان</DashboardWidgetFrame>
        <DashboardWidgetFrame key="my_tasks" widgetId="my_tasks" title="کارها">کارهای سازمان</DashboardWidgetFrame>
      </DashboardLayout>
      </div>
    </DashboardWidgetScope.Provider>
  );
  const { rerender } = render(view(false));
  expect(screen.queryByLabelText('جابه‌جایی اهداف')).toBeNull();
  expect(screen.queryByLabelText('تغییر عرض اهداف')).toBeNull();
  rerender(view(true));
  expect(screen.getByRole('switch', { name: 'چیدمان پیش‌فرض' })).toBeChecked();
  const goals = screen.getByRole('region', { name: 'اهداف' });
  fireEvent.keyDown(within(goals).getByLabelText('تغییر عرض اهداف'), { key: 'ArrowLeft' });
  expect(goals).toHaveAttribute('data-widget-width', '4');
  fireEvent.keyDown(within(goals).getByLabelText('تغییر ارتفاع اهداف'), { key: 'ArrowDown' });
  expect(goals).toHaveAttribute('data-fixed-height', 'true');
  expect(screen.getByRole('switch', { name: 'چیدمان پیش‌فرض' })).not.toBeChecked();
  fireEvent.click(within(goals).getByLabelText('تنظیمات اهداف'));
  fireEvent.click(await screen.findByText('پایین‌تر'));
  expect(screen.getAllByRole('region').map(region => region.getAttribute('aria-label'))).toEqual(['کارها', 'اهداف']);
  fireEvent.click(within(goals).getByLabelText('تنظیمات اهداف'));
  fireEvent.click(await screen.findByText('پنهان‌کردن از داشبورد من'));
  expect(screen.queryByRole('region', { name: 'اهداف' })).toBeNull();
  updateDashboardPreferences(scope.orgId, scope.userId, { hiddenWidgets: [], moduleIds: ['sales'], reportIds: ['report'] });
  rerender(view(false));
  expect(screen.getByRole('region', { name: 'اهداف' })).toHaveAttribute('data-widget-width', '4');
  rerender(view(true));
  fireEvent.click(screen.getByRole('switch', { name: 'چیدمان پیش‌فرض' }));
  expect(screen.getByRole('switch', { name: 'چیدمان پیش‌فرض' })).toBeChecked();
  expect(screen.getByRole('region', { name: 'اهداف' })).toHaveAttribute('data-widget-width', '3');
  expect(screen.getByRole('region', { name: 'اهداف' })).toHaveAttribute('data-fixed-height', 'false');
  expect(screen.getAllByRole('region').map(region => region.getAttribute('aria-label'))).toEqual(['اهداف', 'کارها']);
  expect(readDashboardPreferences(scope.orgId, scope.userId)).toMatchObject({ moduleIds: ['sales'], reportIds: ['report'] });
});

it('fills the space next to a tall widget and resolves a drop into that space', () => {
  const tall = { id: 'tall', width: 3, rows: 100 };
  const short = { id: 'short', width: 3, rows: 35 };
  const wide = { id: 'wide', width: 6, rows: 80 };
  const dragged = { id: 'dragged', width: 3, rows: 45 };
  const original = [tall, dragged, short, wide];
  expect(dashboardPackedDropIndex(original, 'dragged', 6, 180, 540, 140)).toBe(2);
  expect(packDashboardSlots([tall, short, wide, dragged], 6)).toEqual([
    { ...tall, col: 0, row: 0 }, { ...short, col: 3, row: 0 },
    { ...wide, col: 0, row: 100 }, { ...dragged, col: 3, row: 35 },
  ]);
});


it('previews a pointer resize on the edge and persists it only when released', () => {
  const scope = { orgId: 'pointer-org', userId: 'pointer-user' };
  const { container } = render(<DashboardWidgetScope.Provider value={scope}>
    <div dir="rtl"><DashboardLayout editing>
      <DashboardWidgetFrame key="goals" widgetId="goals" title="اهداف">اهداف سازمان</DashboardWidgetFrame>
    </DashboardLayout></div>
  </DashboardWidgetScope.Provider>);
  const grid = container.querySelector('.dashboard-layout-container')!;
  Object.defineProperty(grid, 'clientWidth', { value: 1180 });
  const handle = within(container).getByRole('button', { name: 'تغییر عرض اهداف' });
  handle.setPointerCapture = vi.fn();
  const pointer = (type: string, clientX: number) => {
    const event = new MouseEvent(type, { clientX, button: 0, bubbles: true });
    Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
    fireEvent(handle, event);
  };
  pointer('pointerdown', 600);
  pointer('pointermove', 400);
  expect(container.querySelector('[data-slot="goals"]')).toHaveAttribute('data-width', '4');
  expect(readDashboardPreferences(scope.orgId, scope.userId).widgetWidths).toBeUndefined();
  pointer('pointercancel', 400);
  expect(container.querySelector('[data-slot="goals"]')).toHaveAttribute('data-width', '3');
  pointer('pointerdown', 600);
  pointer('pointermove', 400);
  pointer('pointerup', 400);
  expect(readDashboardPreferences(scope.orgId, scope.userId).widgetWidths).toEqual({ goals: 4 });
});
