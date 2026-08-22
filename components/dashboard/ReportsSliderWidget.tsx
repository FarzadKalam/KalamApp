import React, { useCallback, useState } from 'react';
import { App, Button, Card, Empty, Spin } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { normalizeReportConfig, type ReportDefinitionRecord } from '../../utils/reporting';
import ReportCompactRenderer from '../reports/ReportCompactRenderer';

const ReportsSliderWidget: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<ReportDefinitionRecord[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [setupMissing, setSetupMissing] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('report_definitions')
        .select('id, name, description, module_id, report_type, config, is_active, created_at, updated_at')
        .eq('config->>show_in_members_dashboard', 'true')
        .order('updated_at', { ascending: false });

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
        return normalizeReportConfig(report.config).show_in_members_dashboard;
      });
      setSetupMissing(false);
      setReports(allowed);
      setActiveIndex((current) => {
        if (allowed.length === 0) return 0;
        return Math.min(current, allowed.length - 1);
      });
    } catch {
      message.error('خواندن گزارش‌های داشبورد ناموفق بود.');
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [message]);

  React.useEffect(() => {
    void loadReports();
  }, [loadReports]);

  if (setupMissing) {
    return (
      <Card className="h-full shadow-sm">
        <Empty description="زیرساخت گزارش‌ها هنوز اعمال نشده است" />
      </Card>
    );
  }

  const activeReport = reports[activeIndex] || null;

  return (
    <Card className="h-full shadow-sm">
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

      {loading ? (
        <div className="flex h-[460px] items-center justify-center"><Spin /></div>
      ) : !activeReport ? (
        <div className="flex h-[460px] items-center justify-center">
          <Empty description="گزارشی برای نمایش وجود ندارد" />
        </div>
      ) : (
        <div className="flex h-[460px] flex-col">
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
            {reports.length > 0 ? `${activeIndex + 1} / ${reports.length}` : '0 / 0'}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <ReportCompactRenderer report={activeReport} maxHeight={360} />
          </div>
        </div>
      )}
    </Card>
  );
};

export default ReportsSliderWidget;
