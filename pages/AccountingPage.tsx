import React, { useEffect, useMemo, useState } from 'react';
import { Card, Col, Empty, Row, Spin, Statistic, Typography, Button } from 'antd';
import {
  FileTextOutlined,
  NodeIndexOutlined,
  BankOutlined,
  CreditCardOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { formatPersianPrice, toPersianNumber } from '../utils/persianNumberFormatter';
import { ACCOUNTING_PERMISSION_KEY } from '../utils/permissions';
import { useCurrencyConfig } from '../utils/currency';

const { Title, Text } = Typography;

type AccountingStats = {
  draftEntries: number;
  postedEntries: number;
  dueChequesSoon: number;
  receivableBalance: number;
  payableBalance: number;
};

const DEFAULT_STATS: AccountingStats = {
  draftEntries: 0,
  postedEntries: 0,
  dueChequesSoon: 0,
  receivableBalance: 0,
  payableBalance: 0,
};

const AccountingPage: React.FC = () => {
  const navigate = useNavigate();
  const { label: currencyLabel } = useCurrencyConfig();
  const [loading, setLoading] = useState(true);
  const [canViewPage, setCanViewPage] = useState(true);
  const [sectionPerms, setSectionPerms] = useState<Record<string, boolean>>({});
  const [moduleViewPerms, setModuleViewPerms] = useState<Record<string, boolean>>({});
  const [stats, setStats] = useState<AccountingStats>(DEFAULT_STATS);

  const canShowSection = (key: string) => {
    if (sectionPerms.__all === false) return false;
    return sectionPerms[key] !== false;
  };

  useEffect(() => {
    let active = true;

    const fetchPermissionsAndData = async () => {
      setLoading(true);
      try {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user;
        if (!user) {
          if (active) {
            setCanViewPage(false);
            setLoading(false);
          }
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
          accountingPerms.view !== false &&
          (accountingPerms.fields?.dashboard_page !== false);

        const moduleIds = [
          'journal_entries',
          'chart_of_accounts',
          'cheques',
          'fiscal_years',
          'accounting_event_rules',
          'cost_centers',
          'cash_boxes',
          'bank_accounts',
        ];

        const modulePermMap = moduleIds.reduce<Record<string, boolean>>((acc, id) => {
          acc[id] = permissions?.[id]?.view !== false;
          return acc;
        }, {});

        if (active) {
          setCanViewPage(canViewAccounting);
          setSectionPerms(canViewAccounting ? accountingPerms.fields || {} : { __all: false });
          setModuleViewPerms(modulePermMap);
        }

        if (!canViewAccounting) {
          if (active) setLoading(false);
          return;
        }

        const today = new Date();
        const dueDate = new Date(today);
        dueDate.setDate(today.getDate() + 7);
        const dueDateStr = dueDate.toISOString().slice(0, 10);

        const [entriesRes, chequesRes, salesRes, purchaseRes] = await Promise.all([
          supabase.from('journal_entries').select('status'),
          supabase
            .from('cheques')
            .select('id')
            .in('status', ['new', 'in_bank'])
            .lte('due_date', dueDateStr),
          supabase.from('invoices').select('remaining_balance'),
          supabase.from('purchase_invoices').select('remaining_balance'),
        ]);

        const entryRows = entriesRes.data || [];
        const draftEntries = entryRows.filter((r: any) => String(r.status || '') === 'draft').length;
        const postedEntries = entryRows.filter((r: any) => String(r.status || '') === 'posted').length;
        const dueChequesSoon = (chequesRes.data || []).length;
        const receivableBalance = (salesRes.data || []).reduce(
          (sum: number, row: any) => sum + (Number(row?.remaining_balance) || 0),
          0
        );
        const payableBalance = (purchaseRes.data || []).reduce(
          (sum: number, row: any) => sum + (Number(row?.remaining_balance) || 0),
          0
        );

        if (active) {
          setStats({
            draftEntries,
            postedEntries,
            dueChequesSoon,
            receivableBalance,
            payableBalance,
          });
        }
      } catch {
        if (active) {
          setCanViewPage(false);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchPermissionsAndData();
    return () => {
      active = false;
    };
  }, []);

  const operationLinks = useMemo(
    () => [
      {
        key: 'journal_entries',
        title: 'اسناد حسابداری',
        icon: <FileTextOutlined />,
        path: '/journal_entries',
      },
      {
        key: 'account_review',
        title: 'مرور حساب ها',
        icon: <NodeIndexOutlined />,
        path: '/accounting/account-review',
      },
      {
        key: 'chart_of_accounts',
        title: 'جدول حساب ها',
        icon: <NodeIndexOutlined />,
        path: '/chart_of_accounts',
      },
      {
        key: 'cheques',
        title: 'چک ها',
        icon: <CreditCardOutlined />,
        path: '/cheques',
      },
      {
        key: 'cash_bank',
        title: 'نقد و بانک',
        icon: <BankOutlined />,
        path: '/cash_bank',
      },
    ],
    []
  );

  const settingsLinks = useMemo(
    () => [
      {
        key: 'accounting_settings',
        title: 'تنظیمات حسابداری',
        icon: <SettingOutlined />,
        path: '/accounting/settings',
      },
    ],
    []
  );

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
        <Empty description="دسترسی به داشبورد حسابداری ندارید" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto animate-fadeIn">
      <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 p-6 min-h-[70vh] transition-colors">
        <div className="mb-6">
          <Title level={3} className="!mb-1">داشبورد حسابداری</Title>
          <Text className="text-gray-500">نمای کلی مالی + دسترسی سریع به تنظیمات حسابداری</Text>
        </div>

        {canShowSection('overview_cards') && (
          <Row gutter={[16, 16]} className="mb-6">
            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic title="اسناد پیش نویس" value={toPersianNumber(stats.draftEntries)} />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic title="اسناد ثبت شده" value={toPersianNumber(stats.postedEntries)} />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic title="چک های سررسید 7 روزه" value={toPersianNumber(stats.dueChequesSoon)} />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={12}>
              <Card>
                <Statistic
                  title="جمع مانده دریافتنی مشتریان"
                  value={formatPersianPrice(stats.receivableBalance)}
                  suffix={currencyLabel}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={12}>
              <Card>
                <Statistic
                  title="جمع مانده پرداختنی تامین کنندگان"
                  value={formatPersianPrice(stats.payableBalance)}
                  suffix={currencyLabel}
                />
              </Card>
            </Col>
          </Row>
        )}

        {canShowSection('operation_links') && (
          <Card title="عملیات ضروری" className="mb-6">
            <Row gutter={[12, 12]}>
              {operationLinks
                .filter((item) => moduleViewPerms[item.key] !== false)
                .map((item) => (
                  <Col xs={24} sm={12} lg={8} key={item.key}>
                    <Button block icon={item.icon} onClick={() => navigate(item.path)}>
                      {item.title}
                    </Button>
                  </Col>
                ))}
            </Row>
          </Card>
        )}

        {canShowSection('settings_links') && (
          <Card title="تنظیمات حسابداری">
            <Row gutter={[12, 12]}>
              {settingsLinks
                .filter((item) => moduleViewPerms[item.key] !== false)
                .map((item) => (
                  <Col xs={24} sm={12} lg={8} key={item.key}>
                    <Button block icon={item.icon} onClick={() => navigate(item.path)}>
                      {item.title}
                    </Button>
                  </Col>
                ))}
            </Row>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AccountingPage;
