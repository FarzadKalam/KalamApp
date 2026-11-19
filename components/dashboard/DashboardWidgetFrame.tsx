import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DashboardLayoutContext } from './dashboardLayoutContext';
import React, { createContext, useContext, useState, useRef } from 'react';
import { Button, Dropdown, Empty, Modal, Select, Typography } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, DragOutlined, EyeInvisibleOutlined, MoreOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import { DASHBOARD_COLUMNS, DASHBOARD_HEIGHT_STEP, dashboardWidgetHeight, dashboardWidgetWidth, readDashboardPreferences, updateDashboardPreferences, useDashboardPreferences } from '../../utils/dashboardPreferences';

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
  const { editing, setPreview, move } = useContext(DashboardLayoutContext);
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: widgetId, disabled: !editing });
  const { initial, minimum } = dashboardWidgetWidth(widgetId);
  const width = preferences.layoutMode === 'custom' ? preferences.widgetWidths?.[widgetId] ?? initial : initial;
  const height = preferences.layoutMode === 'custom' ? preferences.widgetHeights?.[widgetId] : undefined;
  const frame = useRef<HTMLElement | null>(null);
  const [previewHeight, setPreviewHeight] = useState<number>();
  const pointer = useRef<{ id: number; origin: number; initial: number; step: number; sign: number } | null>(null);
  const hide = () => updateDashboardPreferences(scope.orgId, scope.userId, { layoutMode: 'custom', hiddenWidgets: [...new Set([...preferences.hiddenWidgets, widgetId])] });
  const clampWidth = (value: number) => Math.max(minimum, Math.min(DASHBOARD_COLUMNS, value));
  const resize = (axis: 'width' | 'height', value: number) => {
    if (!editing) return;
    const latest = readDashboardPreferences(scope.orgId, scope.userId);
    updateDashboardPreferences(scope.orgId, scope.userId, axis === 'width' ? {
      layoutMode: 'custom', widgetWidths: { ...latest.widgetWidths, [widgetId]: clampWidth(value) },
    } : {
      layoutMode: 'custom', widgetHeights: { ...latest.widgetHeights, [widgetId]: dashboardWidgetHeight(value) },
    });
  };
  const stopResize = () => {
    pointer.current = null;
    setPreview(null);
    setPreviewHeight(undefined);
  };
  const edge = (side: 'inline-start' | 'inline-end' | 'block-end') => {
    const vertical = side === 'block-end';
    const axis = vertical ? 'height' : 'width';
    const label = (vertical ? 'تغییر ارتفاع ' : 'تغییر عرض ') + title + (side === 'inline-start' ? ' از لبهٔ آغاز' : '');
    const calculate = (event: React.PointerEvent<HTMLButtonElement>) => {
      const start = pointer.current;
      if (start?.id !== event.pointerId) return;
      const delta = ((vertical ? event.clientY : event.clientX) - start.origin) * start.sign;
      const steps = Math.round(delta / start.step);
      if (!steps) return;
      const raw = start.initial + steps * (vertical ? DASHBOARD_HEIGHT_STEP : 1);
      return vertical ? dashboardWidgetHeight(raw) : clampWidth(raw);
    };
    const signFor = (target: HTMLElement) => vertical ? 1 :
      ((getComputedStyle(target).direction || target.closest('[dir]')?.getAttribute('dir')) === 'rtl' ? -1 : 1) * (side === 'inline-end' ? 1 : -1);
    return <button type="button" className={'dashboard-widget-edge dashboard-widget-edge-' + side}
      aria-label={label} title={label}
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0 || !frame.current) return;
        const container = frame.current.closest<HTMLElement>('.dashboard-layout-container');
        if (!container || (!vertical && container.clientWidth < 720)) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        pointer.current = { id: event.pointerId, origin: vertical ? event.clientY : event.clientX,
          initial: vertical ? height ?? frame.current.offsetHeight : width,
          step: vertical ? DASHBOARD_HEIGHT_STEP : (container.clientWidth + 20) / DASHBOARD_COLUMNS,
          sign: signFor(event.currentTarget) };
      }}
      onPointerMove={event => {
        if (pointer.current?.id !== event.pointerId) return;
        const value = calculate(event);
        if (vertical) setPreviewHeight(value);
        else setPreview(value === undefined ? null : { id: widgetId, width: value });
      }}
      onPointerUp={event => {
        if (pointer.current?.id !== event.pointerId) return;
        const value = calculate(event);
        if (value !== undefined && value !== pointer.current.initial) resize(axis, value);
        stopResize();
      }}
      onPointerCancel={stopResize} onLostPointerCapture={stopResize}
      onKeyDown={event => {
        const positiveKey = vertical ? 'ArrowDown' : 'ArrowRight';
        const negativeKey = vertical ? 'ArrowUp' : 'ArrowLeft';
        const delta = event.key === positiveKey ? 1 : event.key === negativeKey ? -1 : 0;
        if (!delta) return;
        event.preventDefault();
        resize(axis, vertical ? (height ?? (frame.current?.offsetHeight || 300)) + delta * DASHBOARD_HEIGHT_STEP : width + delta * signFor(event.currentTarget));
      }} />;
  };
  const ref = React.useCallback((node: HTMLElement | null) => {
    frame.current = node;
    setNodeRef(node);
    if (containerRef) (containerRef as React.MutableRefObject<HTMLElement | null>).current = node;
  }, [containerRef, setNodeRef]);
  const displayHeight = previewHeight ?? height;
  return <section ref={ref} className={'dashboard-widget-frame ' + className} data-dashboard-widget={widgetId} aria-label={title}
    data-widget-width={width} data-dragging={isDragging} data-fixed-height={displayHeight !== undefined}
    hidden={preferences.hiddenWidgets.includes(widgetId)} style={{
      '--widget-height': displayHeight !== undefined ? displayHeight + 'px' : undefined,
      ...(editing ? { transform: CSS.Translate.toString(transform), transition } : {}),
    } as React.CSSProperties}>
    {editing && <div className="dashboard-widget-edit-tools">
      <Button ref={setActivatorNodeRef} className="dashboard-widget-grip" type="text" icon={<DragOutlined />}
        {...attributes} {...listeners} aria-label={'جابه‌جایی ' + title} />
    </div>}
    <Dropdown trigger={['click']} menu={{ items: [
      { key: 'settings', icon: <SettingOutlined />, label: 'تنظیمات ویجت', onClick: () => setSettingsOpen(true) },
      { key: 'refresh', icon: <ReloadOutlined />, label: 'تازه‌کردن اطلاعات', disabled: !onRefresh && !scope.onRefresh, onClick: onRefresh || scope.onRefresh },
      ...(editing ? [{ key: 'narrow', label: 'باریک‌تر', disabled: width <= minimum, onClick: () => resize('width', width - 1) },
      { key: 'wide', label: 'عریض‌تر', disabled: width >= DASHBOARD_COLUMNS, onClick: () => resize('width', width + 1) },
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
