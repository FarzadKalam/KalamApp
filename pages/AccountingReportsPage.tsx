import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Col, Empty, Row, Spin, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { ACCOUNTING_PERMISSION_KEY } from '../utils/permissions';
import {
  ACCOUNTING_REPORT_GROUPS,
  ACCOUNTING_REPORTS,
  getAccountingReportPath,
} from '../utils/accountingReports';

const { Title, Text } = Typography;

const AccountingReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [canViewPage, setCanViewPage] = useState(true);
  const [allowedReportKeys, setAllowedReportKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('erp:breadcrumb', {
        detail: { moduleTitle: 'حسابداری', moduleId: 'accounting', recordName: 'گزارشات حسابداری' },
      })
    );
    return () => {
      window.dispatchEvent(new CustomEvent('erp:breadcrumb', { detail: null }));
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadPermissions = async () => {
      setLoading(true);
      try {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user;
        if (!user) {
          if (active) setCanViewPage(false);
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role_id')
          .eq('id', user.id)
          .maybeSingle();

        const { data: role } = profile?.role_id
          ? await supabase
              .from('org_roles')
              .select('permissions')
              .eq('id', profile.role_id)
              .maybeSingle()
          : { data: null as any };

        const permissions = role?.permissions || {};
        const accountingPerms = permissions?.[ACCOUNTING_PERMISSION_KEY] || {};
        const canViewAccounting =
          accountingPerms.view !== false && accountingPerms.fields?.dashboard_page !== false;
        const canViewReports = canViewAccounting && accountingPerms.fields?.reports_hub !== false;
        const nextAllowed: Record<string, boolean> = {
          account_review:
            permissions?.journal_entries?.view !== false &&
            permissions?.chart_of_accounts?.view !== false,
          account_turnover:
            permissions?.journal_entries?.view !== false &&
            permissions?.chart_of_accounts?.view !== false,
          journal_book: permissions?.journal_entries?.view !== false,
          general_ledger:
            permissions?.journal_entries?.view !== false &&
            permissions?.chart_of_accounts?.view !== false,
          subsidiary_ledger:
            permissions?.journal_entries?.view !== false &&
            permissions?.chart_of_accounts?.view !== false,
          trial_balance:
            permissions?.journal_entries?.view !== false &&
            permissions?.chart_of_accounts?.view !== false,
        };

        if (active) {
          setCanViewPage(canViewReports);
          setAllowedReportKeys(nextAllowed);
        }
      } catch {
        if (active) {
          setCanViewPage(false);
          message.error('خواندن دسترسی گزارشات حسابداری ناموفق بود.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadPermissions();
    return () => {
      active = false;
    };
  }, [message]);

  const groupedReports = useMemo(() => {
    return ACCOUNTING_REPORT_GROUPS.map((group) => ({
      group,
      items: ACCOUNTING_REPORTS.filter((report) => report.group === group),
    })).filter((section) => section.items.length > 0);
  }, []);

  if (loading) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!canViewPage) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Empty description="دسترسی به گزارشات حسابداری ندارید" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-[1680px] mx-auto animate-fadeIn">
      <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 p-6 min-h-[70vh] transition-colors">
        <div className="mb-6">
          <Title level={3} className="!mb-1">گزارشات حسابداری</Title>
          <Text className="text-gray-500">
            گزارشات مالی استاندارد در یک runtime مشترک، با قابلیت توسعه مرحله‌ای
          </Text>
        </div>

        <div className="space-y-6">
          {groupedReports.map((section) => (
            <Card key={section.group} title={section.group}>
              <Row gutter={[16, 16]}>
                {section.items.map((report) => {
                  const Icon = report.icon;
                  const allowed = allowedReportKeys[report.key] !== false;
                  return (
                    <Col xs={24} md={12} xl={8} key={report.key}>
                      <div className="h-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-white/5 p-4 flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-11 w-11 rounded-2xl bg-leather-100 text-leather-700 flex items-center justify-center shrink-0">
                              <Icon />
                            </div>
                            <div className="min-w-0">
                              <div className="font-black text-gray-800 dark:text-white truncate">{report.title}</div>
                              <div className="text-xs text-gray-500 line-clamp-2">{report.description}</div>
                            </div>
                          </div>
                          {report.renderer === 'linked_page' && (
                            <Tag color="blue" className="!m-0">فعلی</Tag>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
                          {report.exportable && <Tag className="!m-0">اکسل</Tag>}
                          {report.printable && <Tag className="!m-0">چاپ</Tag>}
                        </div>

                        <div className="mt-auto">
                          <Button
                            type="primary"
                            block
                            disabled={!allowed}
                            className="bg-leather-600 hover:!bg-leather-500"
                            onClick={() => navigate(getAccountingReportPath(report))}
                          >
                            مشاهده گزارش
                          </Button>
                        </div>
                      </div>
                    </Col>
                  );
                })}
              </Row>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AccountingReportsPage;
