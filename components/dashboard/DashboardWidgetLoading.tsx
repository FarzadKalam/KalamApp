import React from 'react';
import { Card, Skeleton } from 'antd';
import DashboardWidgetFrame from './DashboardWidgetFrame';

export type DashboardLoadingProps = { widgetId: string; title: string; defaultOrder?: number; className?: string };
export default function DashboardWidgetLoading(props: DashboardLoadingProps & { containerRef?: React.RefObject<HTMLElement> }) {
  return <DashboardWidgetFrame {...props}><Card className="dashboard-content-card" title={props.title}>
    <div className="dashboard-widget-skeleton" role="status" aria-label={`در حال دریافت ${props.title}`}><Skeleton active paragraph={{ rows: 4 }} /></div>
  </Card></DashboardWidgetFrame>;
}
