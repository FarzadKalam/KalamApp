import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Col, Empty, Popconfirm, Row, Spin, Tag, Typography } from 'antd';
import { BarChartOutlined, DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';
import {
  fetchCurrentUserRolePermissions,
  resolveReportsAccessPermissions,
  type PermissionMap,
} from '../utils/permissions';
import { normalizeReportConfig, type ReportDefinitionRecord } from '../utils/reporting';
import { toPersianNumber } from '../utils/persianNumberFormatter';

const { Title, Text } = Typography;

const isMissingReportsTableError = (error: any) => {
  const text = String(error?.message || error?.details || error || '').toLowerCase();
  return text.includes('report_definitions') && (text.includes('does not exist') || text.includes('could not find'));
};

const ReportsHubPage: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<ReportDefinitionRecord[]>([]);
  const [permissions, setPermissions] = useState<PermissionMap | null>(null);
  const [setupMissing, setSetupMissing] = useState(false);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('erp:breadcrumb', {
        detail: { moduleTitle: 'ابزارها', moduleId: 'reports', recordName: 'گزارشات' },
      })
    );
    return () => {
      window.dispatchEvent(new CustomEvent('erp:breadcrumb', { detail: null }));
    };
  }, []);

  const access = useMemo(() => resolveReportsAccessPermissions(permissions), [permissions]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const rolePermissions = await fetchCurrentUserRolePermissions(supabase);
      setPermissions(rolePermissions);
      const reportAccess = resolveReportsAccessPermissions(rolePermissions);
      if (!reportAccess.canViewHub) {
        setReports([]);
        setSetupMissing(false);
        return;
      }

      const { data, error } = await supabase
        .from('report_definitions')
        .select('id, name, description, module_id, report_type, config, is_active, created_at, updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setReports((data || []) as ReportDefinitionRecord[]);
      setSetupMissing(false);
    } catch (error) {
      if (isMissingReportsTableError(error)) {
        setSetupMissing(true);
        setReports([]);
      } else {
        message.error('خواندن گزارشات ناموفق بود.');
      }
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const handleDelete = async (reportId: string) => {
    try {
      const { error } = await supabase.from('report_definitions').delete().eq('id', reportId);
      if (error) throw error;
      message.success('گزارش حذف شد.');
      await loadReports();
    } catch {
      message.error('حذف گزارش ناموفق بود.');
    }
  };

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!access.canViewHub) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Empty description="دسترسی به بخش گزارشات ندارید" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1680px] animate-fadeIn p-4 md:p-8">
      <div className="min-h-[70vh] rounded-[2rem] border border-gray-200 bg-white p-6 shadow-sm transition-colors dark:border-gray-800 dark:bg-[#1a1a1a]">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Title level={3} className="!mb-1">گزارشات</Title>
            <Text className="text-gray-500">
              گزارش‌ساز ماژول‌های عملیاتی با فیلترهای چندشرطی، خروجی جدولی و نمای آماری
            </Text>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button icon={<ReloadOutlined />} onClick={() => void loadReports()}>
              بروزرسانی
            </Button>
            {access.canUseBuilder && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                className="bg-leather-600 hover:!bg-leather-500"
                onClick={() => navigate('/reports/create')}
              >
                گزارش جدید
              </Button>
            )}
          </div>
        </div>

        {setupMissing ? (
          <Card className="rounded-2xl border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
            <div className="space-y-2">
              <div className="font-black text-amber-800 dark:text-amber-300">زیرساخت دیتابیس گزارشات هنوز اعمال نشده است</div>
              <div className="text-sm text-amber-700 dark:text-amber-200">
                قبل از استفاده از این بخش، migration مربوط به `report_definitions` را اجرا کنید.
              </div>
            </div>
          </Card>
        ) : reports.length === 0 ? (
          <Empty
            description="هنوز گزارشی ثبت نشده است"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            {access.canUseBuilder && (
              <Button type="primary" onClick={() => navigate('/reports/create')} className="bg-leather-600 hover:!bg-leather-500">
                ساخت اولین گزارش
              </Button>
            )}
          </Empty>
        ) : (
          <Row gutter={[16, 16]}>
            {reports.map((report) => {
              const config = normalizeReportConfig(report.config);
              const moduleTitle = MODULES[report.module_id]?.titles?.fa || report.module_id;
              const chartReady = config.group_bys.length > 0;
              const secondaryModuleTitle = config.secondary_module_id
                ? MODULES[config.secondary_module_id]?.titles?.fa || config.secondary_module_id
                : null;
              return (
                <Col xs={24} md={12} xl={8} key={report.id}>
                  <div className="flex h-full flex-col gap-4 rounded-[1.5rem] border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-white/5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-leather-100 text-leather-700">
                          <BarChartOutlined />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-black text-gray-800 dark:text-white">{report.name}</div>
                          <div className="mt-1 text-xs text-gray-500">{report.description || 'بدون توضیح'}</div>
                        </div>
                      </div>
                      <Tag color={chartReady ? 'gold' : 'blue'} className="!m-0">
                        {chartReady ? 'جدولی + آماری' : 'جدولی'}
                      </Tag>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                      <Tag className="!m-0">ماژول: {moduleTitle}</Tag>
                      {secondaryModuleTitle && <Tag className="!m-0">ماژول فرعی: {secondaryModuleTitle}</Tag>}
                      <Tag className="!m-0">ستون: {toPersianNumber(config.columns.length)}</Tag>
                      <Tag className="!m-0">حداکثر ردیف: {toPersianNumber(config.row_limit)}</Tag>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white/80 p-3 text-sm dark:border-gray-700 dark:bg-black/10">
                      <div className="mb-2 font-bold text-gray-700 dark:text-gray-100">خلاصه تعریف</div>
                      <div className="text-gray-500">
                        {config.group_bys.length > 0
                          ? `گروه‌بندی روی ${toPersianNumber(config.group_bys.length)} معیار و ${config.metric_type === 'sum' ? `جمع ${toPersianNumber(config.metric_fields.length || 0)} فیلد عددی` : 'تعداد رکوردها'}`
                          : 'بدون گروه‌بندی؛ خروجی به‌صورت جدول عملیاتی'}
                      </div>
                    </div>

                    <div className="mt-auto flex flex-wrap gap-2">
                      <Button icon={<EyeOutlined />} onClick={() => navigate(`/reports/${report.id}`)}>
                        مشاهده
                      </Button>
                      {access.canUseBuilder && (
                        <Button icon={<EditOutlined />} onClick={() => navigate(`/reports/${report.id}/edit`)}>
                          ویرایش
                        </Button>
                      )}
                      {access.canDeleteReports && (
                        <Popconfirm
                          title="حذف گزارش"
                          description="آیا از حذف این گزارش مطمئن هستید؟"
                          okText="حذف"
                          cancelText="انصراف"
                          onConfirm={() => void handleDelete(report.id)}
                        >
                          <Button danger icon={<DeleteOutlined />}>
                            حذف
                          </Button>
                        </Popconfirm>
                      )}
                    </div>
                  </div>
                </Col>
              );
            })}
          </Row>
        )}
      </div>
    </div>
  );
};

export default ReportsHubPage;
