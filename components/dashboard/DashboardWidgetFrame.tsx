import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DashboardLayoutContext } from './dashboardLayoutContext';
import React, { createContext, useContext, useState, useRef } from 'react';
import { Button, Dropdown, Empty, Modal, Select, Typography } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, DragOutlined, ColumnWidthOutlined, EyeInvisibleOutlined, MoreOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import { DASHBOARD_COLUMNS, dashboardWidgetWidth, readDashboardPreferences, updateDashboardPreferences, useDashboardPreferences } from '../../utils/dashboardPreferences';

type WidgetScope = { orgId: string | null; userId: string | null; onRefresh?: () => void };
export const DashboardWidgetScope = createContext<WidgetScope>({ orgId: null, userId: null });
type Props = React.PropsWithChildren<{
  widgetId: string; title: string; className?: string; onRefresh?: () => void;
  settings?: React.ReactNode; defaultOrder?: number;
  containerRef?: React.RefObject<HTMLElement>;
}>;
export default function DashboardWidgetFrame({ widgetId, title, className = '', onRefresh, settings, containerRef, children }: Props) {
  const scope = useContext(DashboardWidgetScope);
  const preferences = useDashboardPreferences(scope.orgId, scope.userId);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { editing, move } = useContext(DashboardLayoutContext);
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: widgetId, disabled: !editing });
  const { initial, minimum } = dashboardWidgetWidth(widgetId);
  const width = preferences.widgetWidths?.[widgetId] ?? initial;
  const pointer = useRef<{ x: number; step: number; width: number; id: number } | null>(null);
  const hide = () => updateDashboardPreferences(scope.orgId, scope.userId, { hiddenWidgets: [...new Set([...preferences.hiddenWidgets, widgetId])] });
  const resize = (value: number) => {
    if (!editing) return;
    const latest = readDashboardPreferences(scope.orgId, scope.userId);
    updateDashboardPreferences(scope.orgId, scope.userId, {
      widgetWidths: { ...latest.widgetWidths, [widgetId]: Math.max(minimum, Math.min(DASHBOARD_COLUMNS, value)) },
    });
  };
  const ref = React.useCallback((node: HTMLElement | null) => {
    setNodeRef(node);
    if (containerRef) (containerRef as React.MutableRefObject<HTMLElement | null>).current = node;
  }, [containerRef, setNodeRef]);
  return <section ref={ref} className={'dashboard-widget-frame ' + className} data-dashboard-widget={widgetId} aria-label={title}
    data-widget-width={width} data-dragging={isDragging}
    hidden={preferences.hiddenWidgets.includes(widgetId)} style={{
      '--widget-span': width,
      ...(editing ? { transform: CSS.Translate.toString(transform), transition } : {}),
    } as React.CSSProperties}>
    {editing && <div className="dashboard-widget-edit-tools">
      <Button ref={setActivatorNodeRef} className="dashboard-widget-grip" type="text" icon={<DragOutlined />}
        {...attributes} {...listeners} aria-label={'جابه‌جایی ' + title} />
      <Button className="dashboard-widget-resize" type="text" icon={<ColumnWidthOutlined />}
        aria-label={'تغییر عرض ' + title}
        onPointerDown={event => {
          const grid = event.currentTarget.closest<HTMLElement>('.dashboard-layout');
          if (!grid || event.button !== 0) return;
          const style = getComputedStyle(grid);
          if (style.gridTemplateColumns.split(' ').length !== DASHBOARD_COLUMNS) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          pointer.current = { x: event.clientX, width, id: event.pointerId,
            step: (grid.clientWidth + (parseFloat(style.columnGap) || 0)) / DASHBOARD_COLUMNS };
        }}
        onPointerUp={event => {
          const start = pointer.current;
          pointer.current = null;
          if (start?.id !== event.pointerId || !start.step) return;
          const delta = Math.round((start.x - event.clientX) / start.step);
          if (delta) resize(start.width + delta);
        }}
        onPointerCancel={() => { pointer.current = null; }}
        onLostPointerCapture={() => { pointer.current = null; }}
        onKeyDown={event => {
          if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
          event.preventDefault();
          resize(width + (event.key === 'ArrowLeft' ? 1 : -1));
        }} />
    </div>}
    <Dropdown trigger={['click']} menu={{ items: [
      { key: 'settings', icon: <SettingOutlined />, label: 'تنظیمات ویجت', onClick: () => setSettingsOpen(true) },
      { key: 'refresh', icon: <ReloadOutlined />, label: 'تازه‌کردن اطلاعات', disabled: !onRefresh && !scope.onRefresh, onClick: onRefresh || scope.onRefresh },
      ...(editing ? [{ key: 'narrow', label: 'باریک‌تر', disabled: width <= minimum, onClick: () => resize(width - 1) },
      { key: 'wide', label: 'عریض‌تر', disabled: width >= DASHBOARD_COLUMNS, onClick: () => resize(width + 1) },
      { key: 'up', icon: <ArrowUpOutlined />, label: 'بالاتر', onClick: () => move(widgetId, -1) },
      { key: 'down', icon: <ArrowDownOutlined />, label: 'پایین‌تر', onClick: () => move(widgetId, 1) },
      { key: 'hide', icon: <EyeInvisibleOutlined />, label: 'پنهان‌کردن از داشبورد من', onClick: hide }] : []),
    ] }}>
      <Button className="dashboard-widget-menu" type="text" icon={<MoreOutlined />} aria-label={`تنظیمات ${title}`} onClick={event => event.stopPropagation()} />
    </Dropdown>
    <div className="dashboard-widget-body" tabIndex={displayHeight !== undefined ? 0 : undefined}>{children}</div>
    {editing && <>{edge('inline-start')}{edge('inline-end')}{edge('block-end')}</>}
    <Modal title={`تنظیمات ${title}`} open={settingsOpen} onCancel={() => setSettingsOpen(false)} footer={<Button onClick={() => setSettingsOpen(false)}>بستن</Button>} destroyOnClose>
      {settings || <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="این ویجت تنظیم اختصاصی ندارد؛ کنترل‌های آن در خود ویجت در دسترس‌اند." />}
      <Typography.Paragraph type="secondary">این انتخاب‌ها فقط نمای داشبورد شما در همین سازمان را تغییر می‌دهند.</Typography.Paragraph>

    </Modal>
  </section>;
}

export function DashboardModuleSelection({ orgId, userId, options, selected }: { orgId: string | null; userId: string | null; options: Array<{ value: string; label: string }>; selected: string[] }) {
  return <div className="space-y-3"><Typography.Paragraph>کارت‌ها، اقدام‌های سریع و گزارش‌ها از ماژول‌های منتخب و مجاز شما می‌آیند.</Typography.Paragraph>
    <Select mode="multiple" aria-label="ماژول‌های منتخب داشبورد" className="w-full" options={options} value={selected} maxCount={6} optionFilterProp="label" onChange={moduleIds => updateDashboardPreferences(orgId, userId, { moduleIds })} />
  </div>;
}
