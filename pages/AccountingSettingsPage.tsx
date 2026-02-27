import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Empty, Row, Spin, Typography } from 'antd';
import {
  ApartmentOutlined,
  CalendarOutlined,
  DollarOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { ACCOUNTING_PERMISSION_KEY, SETTINGS_PERMISSION_KEY } from '../utils/permissions';

const { Title, Text } = Typography;

const AccountingSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [canViewPage, setCanViewPage] = useState(true);
  const [moduleViewPerms, setModuleViewPerms] = useState<Record<string, boolean>>({});
  const [canViewCompanySettings, setCanViewCompanySettings] = useState(true);

  useEffect(() => {
    let active = true;

    const fetchPermissions = async () => {
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
        const settingsPerms = permissions?.[SETTINGS_PERMISSION_KEY] || {};
        const settingsFields = settingsPerms.fields || {};

        const canViewAccountingSettings =
          accountingPerms.view !== false && accountingPerms.fields?.settings_links !== false;

        const moduleIds = ['fiscal_years', 'accounting_event_rules', 'cost_centers'];
        const modulePermMap = moduleIds.reduce<Record<string, boolean>>((acc, id) => {
          acc[id] = permissions?.[id]?.view !== false;
          return acc;
        }, {});

        if (active) {
          setCanViewPage(canViewAccountingSettings);
          setModuleViewPerms(modulePermMap);
          setCanViewCompanySettings(settingsPerms.view !== false && settingsFields.company !== false);
        }
      } catch {
        if (active) {
          setCanViewPage(false);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchPermissions();
    return () => {
      active = false;
    };
  }, []);

  const settingsLinks = useMemo(
    () => [
      {
        key: 'fiscal_years',
        title: 'سال های مالی',
        icon: <CalendarOutlined />,
        path: '/fiscal_years',
        visible: moduleViewPerms.fiscal_years !== false,
      },
      {
        key: 'accounting_event_rules',
        title: 'قواعد صدور سند',
        icon: <SettingOutlined />,
        path: '/accounting_event_rules',
        visible: moduleViewPerms.accounting_event_rules !== false,
      },
      {
        key: 'cost_centers',
        title: 'مراکز هزینه',
        icon: <ApartmentOutlined />,
        path: '/cost_centers',
        visible: moduleViewPerms.cost_centers !== false,
      },
      {
        key: 'company_settings',
        title: 'واحد پولی و تنظیمات شرکت',
        icon: <DollarOutlined />,
        path: '/settings?tab=company',
        visible: canViewCompanySettings,
      },
    ],
    [moduleViewPerms, canViewCompanySettings]
  );

  const visibleSettingsLinks = settingsLinks.filter((item) => item.visible);

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
        <Empty description="دسترسی به تنظیمات حسابداری ندارید" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto animate-fadeIn">
      <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 p-6 min-h-[70vh] transition-colors">
        <div className="mb-6">
          <Title level={3} className="!mb-1">تنظیمات حسابداری</Title>
          <Text className="text-gray-500">مدیریت سال مالی، قواعد سند، مراکز هزینه و واحد پولی</Text>
        </div>

        {visibleSettingsLinks.length === 0 ? (
          <div className="h-[50vh] flex items-center justify-center">
            <Empty description="موردی برای نمایش در تنظیمات حسابداری ندارید" />
          </div>
        ) : (
          <Card>
            <Row gutter={[12, 12]}>
              {visibleSettingsLinks.map((item) => (
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

export default AccountingSettingsPage;
