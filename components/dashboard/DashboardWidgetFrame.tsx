import React, { createContext, useContext, useState } from 'react';
import { Button, Dropdown, Empty, Modal, Select, Space, Typography } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, EyeInvisibleOutlined, MoreOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import { updateDashboardPreferences, useDashboardPreferences } from '../../utils/dashboardPreferences';

type WidgetScope = { orgId: string | null; userId: string | null; onRefresh?: () => void };
export const DashboardWidgetScope = createContext<WidgetScope>({ orgId: null, userId: null });
type Props = React.PropsWithChildren<{
  widgetId: string; title: string; className?: string; onRefresh?: () => void;
  settings?: React.ReactNode; defaultOrder?: number;
}>;
export default function DashboardWidgetFrame({ widgetId, title, className = '', onRefresh, settings, defaultOrder = 0, children }: Props) {
  const scope = useContext(DashboardWidgetScope);
  const preferences = useDashboardPreferences(scope.orgId, scope.userId);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const order = preferences.widgetOrder.indexOf(widgetId);
  const hide = () => updateDashboardPreferences(scope.orgId, scope.userId, { hiddenWidgets: [...new Set([...preferences.hiddenWidgets, widgetId])] });
  const move = (direction: number) => {
    const owner = Array.from(document.querySelectorAll<HTMLElement>('[data-dashboard-widget]')).find(node => node.dataset.dashboardWidget === widgetId);
    const ids = Array.from(owner?.parentElement?.querySelectorAll<HTMLElement>(':scope > [data-dashboard-widget]') || []).sort((a, b) => Number(a.style.order) - Number(b.style.order)).map(node => node.dataset.dashboardWidget!).filter(Boolean);
    const index = ids.indexOf(widgetId), target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    updateDashboardPreferences(scope.orgId, scope.userId, { widgetOrder: [...preferences.widgetOrder.filter(id => !ids.includes(id)), ...ids] });
  };
  return <section className={`dashboard-widget-frame ${className}`} data-dashboard-widget={widgetId} aria-label={title}
    hidden={preferences.hiddenWidgets.includes(widgetId)} style={{ order: order >= 0 ? order : defaultOrder + 100 }}>
    <Dropdown trigger={['click']} menu={{ items: [
      { key: 'settings', icon: <SettingOutlined />, label: 'تنظیمات ویجت', onClick: () => setSettingsOpen(true) },
      { key: 'refresh', icon: <ReloadOutlined />, label: 'تازه‌کردن اطلاعات', disabled: !onRefresh && !scope.onRefresh, onClick: onRefresh || scope.onRefresh },
      { key: 'up', icon: <ArrowUpOutlined />, label: 'بالاتر', onClick: () => move(-1) },
      { key: 'down', icon: <ArrowDownOutlined />, label: 'پایین‌تر', onClick: () => move(1) },
      { key: 'hide', icon: <EyeInvisibleOutlined />, label: 'پنهان‌کردن از داشبورد من', onClick: hide },
    ] }}>
      <Button className="dashboard-widget-menu" type="text" icon={<MoreOutlined />} aria-label={`تنظیمات ${title}`} onClick={event => event.stopPropagation()} />
    </Dropdown>
    {children}
    <Modal title={`تنظیمات ${title}`} open={settingsOpen} onCancel={() => setSettingsOpen(false)} footer={<Button onClick={() => setSettingsOpen(false)}>بستن</Button>} destroyOnClose>
      {settings || <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="این ویجت تنظیم اختصاصی ندارد؛ کنترل‌های آن در خود ویجت در دسترس‌اند." />}
      <Typography.Paragraph type="secondary">این انتخاب‌ها فقط نمای داشبورد شما در همین سازمان را تغییر می‌دهند.</Typography.Paragraph>
      <Space wrap><Button icon={<ArrowUpOutlined />} onClick={() => move(-1)}>بالاتر</Button><Button icon={<ArrowDownOutlined />} onClick={() => move(1)}>پایین‌تر</Button><Button icon={<EyeInvisibleOutlined />} onClick={() => { hide(); setSettingsOpen(false); }}>پنهان‌کردن ویجت</Button></Space>
    </Modal>
  </section>;
}

export function DashboardModuleSelection({ orgId, userId, options, selected }: { orgId: string | null; userId: string | null; options: Array<{ value: string; label: string }>; selected: string[] }) {
  return <div className="space-y-3"><Typography.Paragraph>کارت‌ها، اقدام‌های سریع و گزارش‌ها از ماژول‌های منتخب و مجاز شما می‌آیند.</Typography.Paragraph>
    <Select mode="multiple" aria-label="ماژول‌های منتخب داشبورد" className="w-full" options={options} value={selected} maxCount={6} optionFilterProp="label" onChange={moduleIds => updateDashboardPreferences(orgId, userId, { moduleIds })} />
  </div>;
}
