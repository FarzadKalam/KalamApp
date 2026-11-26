import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { updateDashboardPreferences } from '../../utils/dashboardPreferences';
import { DashboardLayout } from './DashboardLayout';
import DashboardWidgetFrame, { DashboardWidgetScope } from './DashboardWidgetFrame';

it('keeps layout controls in edit mode and restores a hidden widget with its width', async () => {
  const scope = { orgId: 'layout-org', userId: 'layout-user' };
  const view = (editing: boolean) => (
    <DashboardWidgetScope.Provider value={scope}>
      <DashboardLayout editing={editing}>
        <DashboardWidgetFrame key="goals" widgetId="goals" title="اهداف">اهداف سازمان</DashboardWidgetFrame>
        <DashboardWidgetFrame key="my_tasks" widgetId="my_tasks" title="کارها">کارهای سازمان</DashboardWidgetFrame>
      </DashboardLayout>
    </DashboardWidgetScope.Provider>
  );
  const { rerender } = render(view(false));
  expect(screen.queryByLabelText('جابه‌جایی اهداف')).toBeNull();
  expect(screen.queryByLabelText('تغییر عرض اهداف')).toBeNull();
  rerender(view(true));
  const goals = screen.getByRole('region', { name: 'اهداف' });
  fireEvent.keyDown(within(goals).getByLabelText('تغییر عرض اهداف'), { key: 'ArrowLeft' });
  expect(goals).toHaveAttribute('data-widget-width', '4');
  fireEvent.click(within(goals).getByLabelText('تنظیمات اهداف'));
  fireEvent.click(await screen.findByText('پایین‌تر'));
  expect(screen.getAllByRole('region').map(region => region.getAttribute('aria-label'))).toEqual(['کارها', 'اهداف']);
  fireEvent.click(within(goals).getByLabelText('تنظیمات اهداف'));
  fireEvent.click(await screen.findByText('پنهان‌کردن از داشبورد من'));
  expect(screen.queryByRole('region', { name: 'اهداف' })).toBeNull();
  updateDashboardPreferences(scope.orgId, scope.userId, { hiddenWidgets: [] });
  rerender(view(false));
  expect(screen.getByRole('region', { name: 'اهداف' })).toHaveAttribute('data-widget-width', '4');
});
