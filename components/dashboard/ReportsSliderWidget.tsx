import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Card, Empty, Select, Skeleton } from 'antd';
import { BarChartOutlined, LeftOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { normalizeReportConfig, type ReportDefinitionRecord } from '../../utils/reporting';
import ReportCompactRenderer from '../reports/ReportCompactRenderer';
import { fetchSessionBootstrap } from '../../utils/sessionCache';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import DashboardWidgetFrame from './DashboardWidgetFrame';

type Props = {
  selectedModuleIds?: string[];
  selectedReportIds?: string[];
  defaultReportId?: string;
  onReportSelectionChange?: (ids: string[]) => void;
  onDefaultReportChange?: (id: string | null) => void;
};
const ReportsSliderWidget: React.FC<Props> = ({
  selectedModuleIds,
  selectedReportIds,
  defaultReportId,
  onReportSelectionChange,
  onDefaultReportChange,
}) => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [availableReports, setReports] = useState<ReportDefinitionRecord[]>([]);
  const reports = useMemo(() => availableReports.filter(report => !selectedReportIds || selectedReportIds.includes(report.id)), [availableReports, selectedReportIds]);
  const [loadError, setLoadError] = useState(false);
  const modulesKey = selectedModuleIds?.join('|');
  const [activeIndex, setActiveIndex] = useState(0);
  const [setupMissing, setSetupMissing] = useState(false);
  const requestGeneration = useRef(0);

  const loadReports = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setLoadError(false);
    try {
      const snapshot = await fetchSessionBootstrap(supabase);
      if (generation !== requestGeneration.current) return;
      if (!snapshot.orgId || !snapshot.user) { setReports([]);return; }
      let query = supabase
        .from('report_definitions')
        .select('id, name, description, module_id, report_type, config, is_active, created_at, updated_at')
        .eq('config->>show_in_members_dashboard', 'true')
        .eq('org_id', snapshot.orgId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false }).limit(100);
      if (selectedModuleIds) {
        if (!selectedModuleIds.length) { setReports([]);return; }
        query = query.in('module_id', selectedModuleIds);
      }
      const { data, error } = await query;
      if (generation !== requestGeneration.current) return;

      if (error) {
        const text = String(error?.message || error?.details || '').toLowerCase();
        if (text.includes('report_definitions') && (text.includes('does not exist') || text.includes('could not find'))) {
          setSetupMissing(true);
          setReports([]);
          return;
        }
        throw error;
      }

      const allowed = ((data || []) as ReportDefinitionRecord[]).filter((report) => {
        if (report?.is_active === false) return false;
        if (snapshot.permissions?.[report.module_id]?.view === false) return false;
        return normalizeReportConfig(report.config).show_in_members_dashboard;
      });
      setSetupMissing(false);
      setReports(allowed);
      setActiveIndex((current) => {
        if (allowed.length === 0) return 0;
        if (defaultReportId) {
          const match = allowed.findIndex((report) => report.id === defaultReportId);
          if (match >= 0) return match;
        }
        return Math.min(current, allowed.length - 1);
      });
    } catch {
      if (generation !== requestGeneration.current) return;
      message.error('خواندن گزارش‌های داشبورد ناموفق بود.');
      setLoadError(true);
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [message, modulesKey]);

  React.useEffect(() => {
    void loadReports();
    return () => { requestGeneration.current++; };
  }, [loadReports]);

  const reportSettings = (
    <div className="space-y-4 py-2">
      <div>
        <div className="mb-1 text-xs font-bold text-gray-700 dark:text-gray-300">گزارش‌های فعال در اسلایدر:</div>
        <Select
          mode="multiple"
          className="w-full"
          aria-label="گزارش‌های منتخب داشبورد"
          placeholder="انتخاب گزارش‌ها"
          options={availableReports.map((report) => ({ value: report.id, label: report.name }))}
          value={selectedReportIds || availableReports.map((report) => report.id)}
          onChange={onReportSelectionChange}
          optionFilterProp="label"
        />
      </div>

      <div>
        <div className="mb-1 text-xs font-bold text-gray-700 dark:text-gray-300">نمودار / گزارش پیش‌فرض:</div>
        <Select
          className="w-full"
          allowClear
          aria-label="گزارش یا نمودار پیش‌فرض"
          placeholder="انتخاب اولین نمودار یا گزارش نمایشی"
          options={reports.map((report) => ({ value: report.id, label: report.name }))}
          value={defaultReportId}
          onChange={(val) => {
            onDefaultReportChange?.(val || null);
            if (val) {
              const idx = reports.findIndex((r) => r.id === val);
              if (idx >= 0) setActiveIndex(idx);
            }
          }}
          optionFilterProp="label"
        />
      </div>

      <div className="pt-2 border-t border-gray-100 dark:border-white/10 flex flex-col gap-2">
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate('/reports/create')}
          className="flex items-center justify-start gap-2 h-10"
        >
          افزودن گزارش جدید
        </Button>
        <Button
          type="default"
          icon={<BarChartOutlined />}
          onClick={() => navigate('/reports')}
          className="flex items-center justify-start gap-2 h-10"
        >
          ورود به گزارش‌ساز و فهرست گزارش‌ها
        </Button>
      </div>
    </div>
  );

  if (setupMissing) {
    return (
      <DashboardWidgetFrame widgetId="reports_slider" title="گزارش‌های منتخب" defaultOrder={3} onRefresh={() => { void loadReports(); }} settings={reportSettings}><Card className="h-full shadow-sm">
        <Empty description="زیرساخت گزارش‌ها هنوز اعمال نشده است" />
      </Card></DashboardWidgetFrame>
    );
  }

  const activeReport = reports[activeIndex] || reports[0] || null;


  return (
    <DashboardWidgetFrame widgetId="reports_slider" title="گزارش‌های منتخب" defaultOrder={3} onRefresh={() => { void loadReports(); }} settings={reportSettings}><Card className="h-full shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-base font-bold">گزارش‌ها</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">نمایش اسلایدی گزارش‌های منتخب و مجاز</div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="small" onClick={() => void loadReports()} loading={loading}>بروزرسانی</Button>
          <Button
            size="small"
            icon={<RightOutlined />}
            disabled={reports.length <= 1}
            onClick={() => setActiveIndex((current) => (current - 1 + reports.length) % reports.length)}
          />
          <Button
            size="small"
            icon={<LeftOutlined />}
            disabled={reports.length <= 1}
            onClick={() => setActiveIndex((current) => (current + 1) % reports.length)}
          />
        </div>
      </div>

      {loadError && <Alert type="error" showIcon message="دریافت گزارش‌ها انجام نشد." action={<Button onClick={() => void loadReports()}>تلاش دوباره</Button>} />}
      {loading ? (
        <div className="dashboard-report-body" role="status" aria-label="در حال دریافت گزارش‌ها"><Skeleton active paragraph={{ rows: 6 }} /></div>
      ) : !activeReport ? (
        <div className="dashboard-report-body dashboard-widget-loading">
          <Empty description="گزارشی برای نمایش وجود ندارد" />
        </div>
      ) : (
        <div className="dashboard-report-body">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-black text-gray-800 dark:text-gray-100">{activeReport.name}</div>
              <div className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{activeReport.description || 'بدون توضیح'}</div>
            </div>
            <Button size="small" onClick={() => navigate(`/reports/${activeReport.id}`)}>
              مشاهده کامل
            </Button>
          </div>
          <div className="mb-2 text-xs text-gray-500">
            {toPersianNumber(reports.length > 0 ? `${Math.min(activeIndex + 1, reports.length)} / ${reports.length}` : '0 / 0')}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <ReportCompactRenderer report={activeReport} maxHeight={360} />
          </div>
        </div>
      )}
    </Card></DashboardWidgetFrame>
  );
};

export default ReportsSliderWidget;
