import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Empty, Form, message, Modal, Row, Select, Spin, Typography } from 'antd';
import {
  ApartmentOutlined,
  BookOutlined,
  CalendarOutlined,
  DollarOutlined,
  SaveOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { ACCOUNTING_PERMISSION_KEY, SETTINGS_PERMISSION_KEY } from '../utils/permissions';
import { ModuleSettingsStore, SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE } from './Settings/moduleSettingsTypes';

const { Title, Text } = Typography;

interface AccountOption {
  value: string;
  label: string;
  code?: string | null;
  name?: string | null;
  account_type?: string | null;
}

const DEFAULT_ACCOUNT_CODE_PRIORITY: Record<string, string[]> = {
  default_accounts_receivable_id: ['1111', '111'],
  default_accounts_payable_id: ['2101', '210'],
  default_sales_revenue_id: ['4101', '410'],
  default_payment_cash_id: ['1101'],
  default_payment_bank_id: ['1102'],
  default_sales_discount_id: ['4102'],
  default_cogs_id: ['5101'],
  default_inventory_asset_id: ['1301'],
  default_sales_tax_id: ['2111'],
};

const resolveDefaultAccountsByCode = (accounts: AccountOption[]) => {
  const byCode = new Map<string, string>();
  accounts.forEach((acc) => {
    const code = String(acc.code || '').trim();
    if (!code) return;
    if (!byCode.has(code)) byCode.set(code, acc.value);
  });

  const defaults: Record<string, string | undefined> = {};
  Object.entries(DEFAULT_ACCOUNT_CODE_PRIORITY).forEach(([key, codes]) => {
    const matched = codes.map((c) => byCode.get(c)).find(Boolean);
    if (matched) defaults[key] = matched;
  });

  const findByTypeAndKeyword = (accountType: string, keywords: string[]): string | undefined => {
    const row = accounts.find((acc) => {
      const type = String(acc.account_type || '').trim().toLowerCase();
      if (type !== accountType) return false;
      const haystack = `${String(acc.name || '')} ${String(acc.code || '')}`.toLowerCase();
      return keywords.some((kw) => haystack.includes(kw.toLowerCase()));
    });
    return row?.value;
  };

  defaults.default_accounts_receivable_id =
    defaults.default_accounts_receivable_id ||
    findByTypeAndKeyword('asset', ['دریافتنی', 'receivable']);
  defaults.default_accounts_payable_id =
    defaults.default_accounts_payable_id ||
    findByTypeAndKeyword('liability', ['پرداختنی', 'payable']);
  defaults.default_sales_revenue_id =
    defaults.default_sales_revenue_id ||
    findByTypeAndKeyword('income', ['فروش', 'درآمد', 'revenue']);
  defaults.default_payment_cash_id =
    defaults.default_payment_cash_id ||
    findByTypeAndKeyword('asset', ['صندوق', 'cash']);
  defaults.default_payment_bank_id =
    defaults.default_payment_bank_id ||
    findByTypeAndKeyword('asset', ['بانک', 'bank']);
  defaults.default_inventory_asset_id =
    defaults.default_inventory_asset_id ||
    findByTypeAndKeyword('asset', ['موجودی', 'inventory']);
  defaults.default_cogs_id =
    defaults.default_cogs_id ||
    findByTypeAndKeyword('expense', ['بهای تمام', 'cost', 'cogs']);

  return Object.fromEntries(
    Object.entries(defaults).filter(([, value]) => Boolean(value))
  ) as Record<string, string>;
};

// Helper to get nested property
const get = (obj: object, path: string, defaultValue: any = undefined) => {
  const travel = (regexp: RegExp) =>
    String.prototype.split
      .call(path, regexp)
      .filter(Boolean)
      .reduce((res, key) => (res !== null && res !== undefined ? res[key as keyof typeof res] : res), obj);
  const result = travel(/[,[\]]+?/) || travel(/[,[\].]+?/);
  return result === undefined || result === obj ? defaultValue : result;
};

// Modal Component
const DefaultAccountsModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onSave: () => void;
}> = ({ open, onClose, onSave }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('id, name, code, account_type')
        .order('code');
      if (error) throw error;
      setAccounts(
        data.map((acc) => ({
          value: acc.id,
          label: `${acc.code} - ${acc.name}`,
          code: acc.code || null,
          name: acc.name || null,
          account_type: (acc as any).account_type || null,
        }))
      );
    } catch {
      message.error('خطا در خواندن لیست حساب‌ها');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('integration_settings')
        .select('id, settings')
        .eq('connection_type', SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE)
        .limit(1)
        .maybeSingle();

      if (error) {
        if (String(error.code) !== 'PGRST116') throw error;
      }

      if (data) {
        const accountingSettings = get(data.settings || {}, 'modules.accounting.defaults');
        if (accountingSettings) {
          form.setFieldsValue(accountingSettings);
        }
      }
    } catch {
      message.error('خطا در خواندن تنظیمات پیش‌فرض حسابداری');
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    if (open) {
      fetchAccounts();
      fetchSettings();
    }
  }, [open, fetchAccounts, fetchSettings]);

  useEffect(() => {
    if (!open) return;
    if (!accounts.length) return;
    const keys = Object.keys(DEFAULT_ACCOUNT_CODE_PRIORITY);
    const currentValues = form.getFieldsValue(keys);
    const hasAnyValue = keys.some((key) => Boolean(currentValues?.[key]));
    if (hasAnyValue) return;
    const suggested = resolveDefaultAccountsByCode(accounts);
    if (Object.keys(suggested).length > 0) {
      form.setFieldsValue(suggested);
    }
  }, [accounts, form, open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const values = await form.validateFields();
      
      const { data: currentSettingsData, error: fetchError } = await supabase
        .from('integration_settings')
        .select('id, settings')
        .eq('connection_type', SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE)
        .limit(1)
        .maybeSingle();

      if (fetchError && String(fetchError.code) !== 'PGRST116') throw fetchError;
      
      const currentSettings = (currentSettingsData?.settings || { modules: {} }) as ModuleSettingsStore;
      
      const newSettingsPayload = {
        ...currentSettings,
        modules: {
          ...(currentSettings.modules || {}),
          accounting: {
            ...get(currentSettings, 'modules.accounting', {}),
            defaults: values,
          },
        },
      };

      const { error: upsertError } = await supabase
        .from('integration_settings')
        .upsert({
          id: currentSettingsData?.id || undefined,
          connection_type: SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE,
          provider: 'core',
          is_active: true,
          settings: newSettingsPayload,
        }, { onConflict: 'connection_type, org_id' });

      if (upsertError) throw upsertError;

      message.success('تنظیمات حساب‌های پیش‌فرض ذخیره شد.');
      onSave();
      onClose();
    } catch (err) {
      message.error('خطا در ذخیره تنظیمات.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="تنظیم حساب‌های پیش‌فرض"
      open={open}
      onCancel={onClose}
      destroyOnHidden
      footer={[
        <Button key="back" onClick={onClose}>
          انصراف
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={saving}
          onClick={handleSave}
          icon={<SaveOutlined />}
          className="bg-leather-600 hover:!bg-leather-500"
        >
          ذخیره
        </Button>,
      ]}
    >
      <Spin spinning={loading}>
        <Form form={form} layout="vertical">
          <Form.Item
            name="default_accounts_receivable_id"
            label="حساب دریافتنی پیش‌فرض (بدهکار فاکتور فروش)"
          >
            <Select showSearch allowClear options={accounts} placeholder="انتخاب کنید..." />
          </Form.Item>
          <Form.Item
            name="default_accounts_payable_id"
            label="حساب پرداختنی پیش‌فرض (بستانکار فاکتور خرید)"
          >
            <Select showSearch allowClear options={accounts} placeholder="انتخاب کنید..." />
          </Form.Item>
          <Form.Item
            name="default_sales_revenue_id"
            label="حساب درآمد فروش پیش‌فرض (بستانکار فاکتور فروش)"
          >
            <Select showSearch allowClear options={accounts} placeholder="انتخاب کنید..." />
          </Form.Item>
          <Form.Item name="default_payment_cash_id" label="صندوق پیش‌فرض (برای دریافت نقدی)">
            <Select showSearch allowClear options={accounts} placeholder="انتخاب کنید..." />
          </Form.Item>
          <Form.Item name="default_payment_bank_id" label="بانک پیش‌فرض (برای دریافت بانکی)">
            <Select showSearch allowClear options={accounts} placeholder="انتخاب کنید..." />
          </Form.Item>
          <Form.Item name="default_sales_discount_id" label="حساب تخفیف فروش پیش‌فرض">
            <Select showSearch allowClear options={accounts} placeholder="انتخاب کنید..." />
          </Form.Item>
          <Form.Item name="default_cogs_id" label="حساب بهای تمام شده کالای فروش رفته پیش‌فرض">
            <Select showSearch allowClear options={accounts} placeholder="انتخاب کنید..." />
          </Form.Item>
          <Form.Item name="default_inventory_asset_id" label="حساب موجودی کالا پیش‌فرض">
            <Select showSearch allowClear options={accounts} placeholder="انتخاب کنید..." />
          </Form.Item>
          <Form.Item name="default_sales_tax_id" label="حساب مالیات بر ارزش افزوده فروش پیش‌فرض">
            <Select showSearch allowClear options={accounts} placeholder="انتخاب کنید..." />
          </Form.Item>
        </Form>
      </Spin>
    </Modal>
  );
};

const AccountingSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [canViewPage, setCanViewPage] = useState(true);
  const [moduleViewPerms, setModuleViewPerms] = useState<Record<string, boolean>>({});
  const [canViewCompanySettings, setCanViewCompanySettings] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
        
        const canViewDefaultAccounts = accountingPerms.fields?.default_accounts !== false;

        const moduleIds = ['fiscal_years', 'accounting_event_rules', 'cost_centers'];
        const modulePermMap = moduleIds.reduce<Record<string, boolean>>((acc, id) => {
          acc[id] = permissions?.[id]?.view !== false;
          return acc;
        }, {});
        
        modulePermMap.default_accounts = canViewDefaultAccounts;

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
        key: 'default_accounts',
        title: 'حساب‌های پیش‌فرض',
        icon: <BookOutlined />,
        action: () => setIsModalOpen(true),
        visible: moduleViewPerms.default_accounts !== false,
      },
      {
        key: 'fiscal_years',
        title: 'سال های مالی',
        icon: <CalendarOutlined />,
        action: () => navigate('/fiscal_years'),
        visible: moduleViewPerms.fiscal_years !== false,
      },
      {
        key: 'accounting_event_rules',
        title: 'قواعد صدور سند',
        icon: <SettingOutlined />,
        action: () => navigate('/accounting_event_rules'),
        visible: moduleViewPerms.accounting_event_rules !== false,
      },
      {
        key: 'cost_centers',
        title: 'مراکز هزینه',
        icon: <ApartmentOutlined />,
        action: () => navigate('/cost_centers'),
        visible: moduleViewPerms.cost_centers !== false,
      },
      {
        key: 'company_settings',
        title: 'واحد پولی و تنظیمات شرکت',
        icon: <DollarOutlined />,
        action: () => navigate('/settings?tab=company'),
        visible: canViewCompanySettings,
      },
    ],
    [moduleViewPerms, canViewCompanySettings, navigate]
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
    <>
      <div className="p-4 md:p-8 max-w-[1600px] mx-auto animate-fadeIn">
        <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 p-6 min-h-[70vh] transition-colors">
          <div className="mb-6">
            <Title level={3} className="!mb-1">تنظیمات حسابداری</Title>
            <Text className="text-gray-500">مدیریت حساب‌های پیش‌فرض، سال مالی، قواعد سند، مراکز هزینه و واحد پولی</Text>
          </div>

          {visibleSettingsLinks.length === 0 ? (
            <div className="h-[50vh] flex items-center justify-center">
              <Empty description="موردی برای نمایش در تنظیمات حسابداری ندارید" />
            </div>
          ) : (
            <Card>
              <Row gutter={[16, 16]}>
                {visibleSettingsLinks.map((item) => (
                  <Col xs={24} sm={12} lg={8} key={item.key}>
                    <Button block icon={item.icon} onClick={item.action} style={{ height: '40px' }}>
                      {item.title}
                    </Button>
                  </Col>
                ))}
              </Row>
            </Card>
          )}
        </div>
      </div>
      <DefaultAccountsModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={() => { /* maybe refresh some data if needed */ }}
      />
    </>
  );
};

export default AccountingSettingsPage;
