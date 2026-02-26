import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Form, InputNumber, Select, Switch, Typography } from 'antd';
import { SaveOutlined, SyncOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import {
  getDefaultLevelingConfig,
  loadCustomerLevelingConfig,
  normalizeLevelingConfig,
  saveCustomerLevelingConfig,
  syncCustomerLevelsByInvoiceCustomers,
  type CustomerLevelingConfig,
} from '../../utils/customerLeveling';

const { Text } = Typography;

const statusOptions = [
  { label: 'ایجاد شده', value: 'created' },
  { label: 'پیش فاکتور', value: 'proforma' },
  { label: 'فاکتور نهایی', value: 'final' },
  { label: 'تسویه شده', value: 'settled' },
  { label: 'تکمیل شده', value: 'completed' },
];

const rankCards: Array<{ key: 'silver' | 'gold' | 'vip'; title: string; color: string }> = [
  { key: 'silver', title: 'سطح نقره‌ای', color: '#6b7280' },
  { key: 'gold', title: 'سطح طلایی', color: '#b45309' },
  { key: 'vip', title: 'سطح VIP', color: '#7c3aed' },
];

const CustomerLevelingTab: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm<CustomerLevelingConfig>();
  const [recordId, setRecordId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [configSource, setConfigSource] = useState<'company_settings' | 'integration_settings' | 'default'>('default');
  const [hasCompanyLevelingColumn, setHasCompanyLevelingColumn] = useState(false);
  const [baselineConfig, setBaselineConfig] = useState<CustomerLevelingConfig>(getDefaultLevelingConfig());
  const watchedValues = Form.useWatch([], form);

  const normalizedCurrent = useMemo(
    () => normalizeLevelingConfig(watchedValues || getDefaultLevelingConfig()),
    [watchedValues]
  );
  const hasChanges = useMemo(
    () => JSON.stringify(normalizedCurrent) !== JSON.stringify(normalizeLevelingConfig(baselineConfig)),
    [normalizedCurrent, baselineConfig]
  );

  const fetchData = async () => {
    try {
      const loaded = await loadCustomerLevelingConfig(supabase as any);
      if (loaded.companyRecordId) setRecordId(loaded.companyRecordId);
      setConfigSource(loaded.source);
      setHasCompanyLevelingColumn(loaded.hasCompanyLevelingColumn);
      form.setFieldsValue(loaded.config);
      setBaselineConfig(loaded.config);
    } catch (err: any) {
      const fallback = normalizeLevelingConfig(getDefaultLevelingConfig());
      form.setFieldsValue(fallback);
      setBaselineConfig(fallback);
      message.warning(err?.message || 'بارگذاری تنظیمات سطح‌بندی با مقدار پیش‌فرض انجام شد');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const saveSettings = async (values: CustomerLevelingConfig) => {
    const config = normalizeLevelingConfig(values);
    setLoading(true);
    try {
      const saved = await saveCustomerLevelingConfig({
        supabase: supabase as any,
        config,
        companyRecordId: recordId,
        preferCompanySettings: hasCompanyLevelingColumn,
      });
      setConfigSource(saved.source);
      if (saved.companyRecordId) setRecordId(saved.companyRecordId);
      setBaselineConfig(config);
      message.success('تنظیمات سطح‌بندی ذخیره شد');
    } catch (err: any) {
      message.error(err?.message || 'خطا در ذخیره تنظیمات');
    } finally {
      setLoading(false);
    }
  };

  const syncAllCustomers = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.from('customers').select('id');
      if (error) throw error;
      await syncCustomerLevelsByInvoiceCustomers({
        supabase: supabase as any,
        customerIds: (data || []).map((row: any) => row.id),
      });
      message.success('سطح مشتریان براساس تنظیمات جدید بروزرسانی شد');
    } catch (err: any) {
      message.error(err?.message || 'خطا در بروزرسانی سطح مشتریان');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-6">
      <Form form={form} layout="vertical" onFinish={saveSettings} initialValues={getDefaultLevelingConfig()}>
        <Card className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Form.Item label="فعال بودن سطح‌بندی خودکار" name="enabled" valuePropName="checked" className="mb-0">
              <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
            </Form.Item>
            <Form.Item
              label="وضعیت‌های موثر در خرید"
              name="eligible_statuses"
              rules={[{ required: true, message: 'حداقل یک وضعیت انتخاب کنید' }]}
              className="mb-0"
            >
              <Select mode="multiple" options={statusOptions} placeholder="وضعیت‌ها را انتخاب کنید" />
            </Form.Item>
          </div>
          <div className="mt-4">
            <Text type="secondary">
              ارتقای سطح زمانی انجام می‌شود که هر سه شرط تعداد خرید، جمع خرید و مدت زمان آشنایی برای آن سطح برقرار باشد.
            </Text>
            <br />
            <Text type="secondary">
              محل ذخیره فعلی: {configSource === 'company_settings' ? 'company_settings' : configSource === 'integration_settings' ? 'integration_settings' : 'پیش‌فرض سیستم'}
            </Text>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {rankCards.map((rank) => (
            <Card key={rank.key} title={<span style={{ color: rank.color, fontWeight: 700 }}>{rank.title}</span>} variant="outlined">
              <Form.Item
                label="حداقل تعداد دفعات خرید"
                name={[rank.key, 'min_purchase_count']}
                rules={[{ required: true, message: 'اجباری است' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                label="حداقل جمع خرید (تومان)"
                name={[rank.key, 'min_total_spend']}
                rules={[{ required: true, message: 'اجباری است' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                label="حداقل مدت زمان آشنایی (روز)"
                name={[rank.key, 'min_acquaintance_days']}
                rules={[{ required: true, message: 'اجباری است' }]}
                className="mb-0"
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Card>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button icon={<SyncOutlined />} onClick={syncAllCustomers} loading={syncing}>
            بروزرسانی سطح همه مشتریان
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={loading}
            disabled={!hasChanges}
            className="bg-leather-600 hover:!bg-leather-500 border-none"
          >
            ذخیره تنظیمات
          </Button>
        </div>
      </Form>
    </div>
  );
};

export default CustomerLevelingTab;
