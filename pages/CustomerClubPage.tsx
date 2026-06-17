import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { GiftOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import WorkflowConditionsGroup from '../components/workflows/WorkflowConditionsGroup';
import CustomerLevelingTab from './Settings/CustomerLevelingTab';
import { customerModule } from '../modules/customerConfig';
import { supabase } from '../supabaseClient';
import { getRecordTitle } from '../utils/recordTitle';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from '../utils/persianNumberFormatter';
import { hasCurrentOrgPlanFeature } from '../utils/saasPlanFeatures';
import {
  CUSTOMER_CLUB_FEATURE,
  CUSTOMER_CLUB_PERMISSION_KEY,
  normalizeCustomerClubCode,
} from '../utils/customerClub';
import { fetchCurrentUserRoleContext } from '../utils/permissions';
import { getWorkflowConditionFields } from '../utils/workflowHelpers';
import { loadWorkflowConditionEditorOptions } from '../utils/workflowConditionOptions';
import type { WorkflowCondition } from '../utils/workflowTypes';

const { Text } = Typography;

type LoyaltyRule = {
  id: string;
  name: string;
  rule_type: string;
  reward_type: string;
  reward_amount: number;
  reward_percent: number;
  max_reward_amount: number | null;
  conditions_all: WorkflowCondition[];
  conditions_any: WorkflowCondition[];
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
};

type DiscountCode = {
  id: string;
  code: string;
  title: string;
  discount_type: string;
  discount_value: number;
  max_discount_amount: number | null;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  per_customer_max_uses: number | null;
  conditions_all: WorkflowCondition[];
  conditions_any: WorkflowCondition[];
  is_active: boolean;
  created_at: string;
};

type LedgerRow = {
  id: string;
  customer_id: string;
  entry_type: string;
  source_type: string;
  amount: number;
  effective_date: string | null;
  description: string | null;
  created_at: string;
  customer?: Record<string, any> | null;
};

type CustomerOption = {
  label: string;
  value: string;
  record: Record<string, any>;
};

const ruleTypeOptions = [
  { label: 'پورسانت معرفی مشتری', value: 'referral' },
  { label: 'هدیه تولد', value: 'birthday' },
  { label: 'کش‌بک', value: 'cashback' },
  { label: 'هدیه اولین خرید', value: 'first_purchase' },
  { label: 'سطح‌بندی', value: 'leveling' },
];

const ruleTypeLabel: Record<string, string> = Object.fromEntries(ruleTypeOptions.map((item) => [item.value, item.label]));

const rewardTypeOptions = [
  { label: 'مبلغ ثابت', value: 'amount' },
  { label: 'درصد از فاکتور', value: 'percent' },
];

const entryTypeLabel: Record<string, string> = {
  credit: 'افزایش اعتبار',
  debit: 'مصرف اعتبار',
  adjustment: 'اصلاح اعتبار',
};

const conditionFields = getWorkflowConditionFields('customers');

const dateText = (value?: string | null) => value ? toPersianNumber(safeJalaliFormat(value, 'YYYY/MM/DD') || value) : '-';

const getCustomerTitle = (record?: Record<string, any> | null) =>
  record ? getRecordTitle(record, customerModule as any) : '-';

const CustomerClubPage: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [canView, setCanView] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [featureEnabled, setFeatureEnabled] = useState(true);
  const [summary, setSummary] = useState({ customerCount: 0, totalCredit: 0, totalBalance: 0, activeRules: 0, activeDiscounts: 0 });
  const [rules, setRules] = useState<LoyaltyRule[]>([]);
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([]);
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([]);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [relationOptions, setRelationOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});

  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<LoyaltyRule | null>(null);
  const [ruleConditionsAll, setRuleConditionsAll] = useState<WorkflowCondition[]>([]);
  const [ruleConditionsAny, setRuleConditionsAny] = useState<WorkflowCondition[]>([]);
  const [ruleForm] = Form.useForm();

  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<DiscountCode | null>(null);
  const [discountConditionsAll, setDiscountConditionsAll] = useState<WorkflowCondition[]>([]);
  const [discountConditionsAny, setDiscountConditionsAny] = useState<WorkflowCondition[]>([]);
  const [discountForm] = Form.useForm();

  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);
  const [ledgerForm] = Form.useForm();

  const loadAccess = useCallback(async () => {
    const [roleContext, hasFeature] = await Promise.all([
      fetchCurrentUserRoleContext(supabase),
      hasCurrentOrgPlanFeature(CUSTOMER_CLUB_FEATURE, { defaultEnabled: true }),
    ]);
    const perms = roleContext.permissions?.[CUSTOMER_CLUB_PERMISSION_KEY] || {};
    setFeatureEnabled(hasFeature);
    setCanView(hasFeature && perms.view !== false);
    setCanEdit(hasFeature && perms.view !== false && perms.edit !== false);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      await loadAccess();
      const [customersRes, rulesRes, discountsRes, ledgerRes, optionsRes, conditionOptions] = await Promise.all([
        supabase
          .from('customers')
          .select('id, full_name, business_name, system_code, total_balance, loyalty_credit_balance', { count: 'exact' })
          .order('updated_at', { ascending: false })
          .limit(500),
        supabase
          .from('customer_loyalty_rules')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('customer_discount_codes')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('customer_loyalty_ledger')
          .select('id, customer_id, entry_type, source_type, amount, effective_date, description, created_at, customer:customers(id, full_name, business_name, system_code)')
          .order('created_at', { ascending: false })
          .limit(300),
        supabase
          .from('customers')
          .select('id, full_name, business_name, system_code')
          .order('full_name', { ascending: true })
          .limit(500),
        loadWorkflowConditionEditorOptions('customers', conditionFields),
      ]);

      const firstError = customersRes.error || rulesRes.error || discountsRes.error || ledgerRes.error || optionsRes.error;
      if (firstError) throw firstError;

      const customerRows = customersRes.data || [];
      const ruleRows = (rulesRes.data || []) as LoyaltyRule[];
      const discountRows = (discountsRes.data || []) as DiscountCode[];
      const ledger = (ledgerRes.data || []) as LedgerRow[];

      setRules(ruleRows);
      setDiscountCodes(discountRows);
      setLedgerRows(ledger);
      setCustomerOptions((optionsRes.data || []).map((record: any) => ({
        value: String(record.id),
        label: getCustomerTitle(record),
        record,
      })));
      setDynamicOptions(conditionOptions.dynamicOptions);
      setRelationOptions(conditionOptions.relationOptions);
      setSummary({
        customerCount: customersRes.count || customerRows.length,
        totalCredit: customerRows.reduce((sum: number, row: any) => sum + Number(row?.loyalty_credit_balance || 0), 0),
        totalBalance: customerRows.reduce((sum: number, row: any) => sum + Number(row?.total_balance || 0), 0),
        activeRules: ruleRows.filter((row) => row.is_active !== false).length,
        activeDiscounts: discountRows.filter((row) => row.is_active !== false).length,
      });
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در دریافت اطلاعات باشگاه مشتریان'));
    } finally {
      setLoading(false);
    }
  }, [loadAccess, message]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openRuleModal = (row?: LoyaltyRule) => {
    setEditingRule(row || null);
    setRuleConditionsAll(Array.isArray(row?.conditions_all) ? row!.conditions_all : []);
    setRuleConditionsAny(Array.isArray(row?.conditions_any) ? row!.conditions_any : []);
    ruleForm.setFieldsValue({
      name: row?.name || '',
      rule_type: row?.rule_type || 'cashback',
      reward_type: row?.reward_type || 'amount',
      reward_amount: Number(row?.reward_amount || 0),
      reward_percent: Number(row?.reward_percent || 0),
      max_reward_amount: row?.max_reward_amount ?? undefined,
      starts_at: row?.starts_at || '',
      ends_at: row?.ends_at || '',
      is_active: row?.is_active !== false,
    });
    setRuleModalOpen(true);
  };

  const saveRule = async () => {
    const values = await ruleForm.validateFields();
    const payload = {
      name: values.name,
      rule_type: values.rule_type,
      reward_type: values.reward_type,
      reward_amount: Number(values.reward_amount || 0),
      reward_percent: Number(values.reward_percent || 0),
      max_reward_amount: values.max_reward_amount === undefined || values.max_reward_amount === null ? null : Number(values.max_reward_amount),
      starts_at: String(values.starts_at || '').trim() || null,
      ends_at: String(values.ends_at || '').trim() || null,
      conditions_all: ruleConditionsAll,
      conditions_any: ruleConditionsAny,
      is_active: values.is_active !== false,
    };
    const query = editingRule?.id
      ? supabase.from('customer_loyalty_rules').update(payload).eq('id', editingRule.id)
      : supabase.from('customer_loyalty_rules').insert([payload]);
    const { error } = await query;
    if (error) throw error;
    message.success('طرح باشگاه مشتریان ذخیره شد');
    setRuleModalOpen(false);
    await loadData();
  };

  const openDiscountModal = (row?: DiscountCode) => {
    setEditingDiscount(row || null);
    setDiscountConditionsAll(Array.isArray(row?.conditions_all) ? row!.conditions_all : []);
    setDiscountConditionsAny(Array.isArray(row?.conditions_any) ? row!.conditions_any : []);
    discountForm.setFieldsValue({
      code: row?.code || '',
      title: row?.title || '',
      discount_type: row?.discount_type || 'amount',
      discount_value: Number(row?.discount_value || 0),
      max_discount_amount: row?.max_discount_amount ?? undefined,
      starts_at: row?.starts_at || '',
      ends_at: row?.ends_at || '',
      max_uses: row?.max_uses ?? undefined,
      per_customer_max_uses: row?.per_customer_max_uses ?? undefined,
      is_active: row?.is_active !== false,
    });
    setDiscountModalOpen(true);
  };

  const saveDiscount = async () => {
    const values = await discountForm.validateFields();
    const payload = {
      code: normalizeCustomerClubCode(values.code),
      title: values.title,
      discount_type: values.discount_type,
      discount_value: Number(values.discount_value || 0),
      max_discount_amount: values.max_discount_amount === undefined || values.max_discount_amount === null ? null : Number(values.max_discount_amount),
      starts_at: String(values.starts_at || '').trim() || null,
      ends_at: String(values.ends_at || '').trim() || null,
      max_uses: values.max_uses === undefined || values.max_uses === null ? null : Number(values.max_uses),
      per_customer_max_uses: values.per_customer_max_uses === undefined || values.per_customer_max_uses === null ? null : Number(values.per_customer_max_uses),
      conditions_all: discountConditionsAll,
      conditions_any: discountConditionsAny,
      is_active: values.is_active !== false,
    };
    const query = editingDiscount?.id
      ? supabase.from('customer_discount_codes').update(payload).eq('id', editingDiscount.id)
      : supabase.from('customer_discount_codes').insert([payload]);
    const { error } = await query;
    if (error) throw error;
    message.success('کد تخفیف ذخیره شد');
    setDiscountModalOpen(false);
    await loadData();
  };

  const openLedgerModal = () => {
    ledgerForm.resetFields();
    ledgerForm.setFieldsValue({ entry_type: 'credit', effective_date: new Date().toISOString().slice(0, 10) });
    setLedgerModalOpen(true);
  };

  const saveLedgerEntry = async () => {
    const values = await ledgerForm.validateFields();
    const customerId = String(values.customer_id || '').trim();
    const payload = {
      customer_id: customerId,
      entry_type: values.entry_type,
      source_type: 'manual',
      amount: Math.max(0, Number(values.amount || 0)),
      effective_date: String(values.effective_date || '').trim() || new Date().toISOString().slice(0, 10),
      idempotency_key: `manual:${customerId}:${Date.now()}`,
      description: String(values.description || '').trim() || null,
    };
    const { error } = await supabase.from('customer_loyalty_ledger').insert([payload]);
    if (error) throw error;
    await supabase.rpc('sync_customer_loyalty_balance', { p_customer_id: customerId });
    message.success('اعتبار مشتری ثبت شد');
    setLedgerModalOpen(false);
    await loadData();
  };

  const ruleColumns: ColumnsType<LoyaltyRule> = useMemo(() => [
    { title: 'عنوان', dataIndex: 'name', key: 'name' },
    { title: 'نوع طرح', dataIndex: 'rule_type', key: 'rule_type', render: (value) => ruleTypeLabel[String(value)] || value },
    {
      title: 'پاداش',
      key: 'reward',
      render: (_, row) => row.reward_type === 'percent'
        ? `${toPersianNumber(String(row.reward_percent || 0))}٪`
        : formatPersianPrice(row.reward_amount || 0),
    },
    { title: 'شروع', dataIndex: 'starts_at', key: 'starts_at', render: dateText },
    { title: 'پایان', dataIndex: 'ends_at', key: 'ends_at', render: dateText },
    { title: 'وضعیت', dataIndex: 'is_active', key: 'is_active', render: (value) => <Tag color={value !== false ? 'green' : 'default'}>{value !== false ? 'فعال' : 'غیرفعال'}</Tag> },
    {
      title: 'عملیات',
      key: 'actions',
      render: (_, row) => <Button size="small" onClick={() => openRuleModal(row)} disabled={!canEdit}>ویرایش</Button>,
    },
  ], [canEdit]);

  const discountColumns: ColumnsType<DiscountCode> = useMemo(() => [
    { title: 'کد', dataIndex: 'code', key: 'code', render: (value) => <Tag>{value}</Tag> },
    { title: 'عنوان', dataIndex: 'title', key: 'title' },
    {
      title: 'تخفیف',
      key: 'discount',
      render: (_, row) => row.discount_type === 'percent'
        ? `${toPersianNumber(String(row.discount_value || 0))}٪`
        : formatPersianPrice(row.discount_value || 0),
    },
    { title: 'شروع', dataIndex: 'starts_at', key: 'starts_at', render: dateText },
    { title: 'پایان', dataIndex: 'ends_at', key: 'ends_at', render: dateText },
    { title: 'وضعیت', dataIndex: 'is_active', key: 'is_active', render: (value) => <Tag color={value !== false ? 'green' : 'default'}>{value !== false ? 'فعال' : 'غیرفعال'}</Tag> },
    {
      title: 'عملیات',
      key: 'actions',
      render: (_, row) => <Button size="small" onClick={() => openDiscountModal(row)} disabled={!canEdit}>ویرایش</Button>,
    },
  ], [canEdit]);

  const ledgerColumns: ColumnsType<LedgerRow> = useMemo(() => [
    { title: 'مشتری', key: 'customer', render: (_, row) => getCustomerTitle(row.customer) },
    { title: 'نوع', dataIndex: 'entry_type', key: 'entry_type', render: (value) => entryTypeLabel[String(value)] || value },
    { title: 'منبع', dataIndex: 'source_type', key: 'source_type' },
    { title: 'مبلغ', dataIndex: 'amount', key: 'amount', align: 'right', render: (value) => <span className="persian-number">{formatPersianPrice(value || 0)}</span> },
    { title: 'تاریخ اثر', dataIndex: 'effective_date', key: 'effective_date', render: dateText },
    { title: 'توضیحات', dataIndex: 'description', key: 'description', render: (value) => value || '-' },
  ], []);

  if (!featureEnabled || !canView) {
    return (
      <div className="p-4 md:p-8 max-w-[1200px] mx-auto">
        <Empty description={!featureEnabled ? 'باشگاه مشتریان در پلن فعلی فعال نیست' : 'دسترسی مشاهده باشگاه مشتریان را ندارید'} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-[1500px] mx-auto animate-fadeIn">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-bold text-gray-900 dark:text-gray-100">باشگاه مشتریان</h1>
          <Text type="secondary">مدیریت اعتبار، طرح‌های تشویقی، سطح‌بندی و کدهای تخفیف روی همان رکوردهای مشتریان</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void loadData()} loading={loading}>بروزرسانی</Button>
      </div>

      <Tabs
        items={[
          {
            key: 'summary',
            label: 'خلاصه',
            children: (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                  <Card><Statistic title="مشتریان" value={summary.customerCount} /></Card>
                  <Card><Statistic title="اعتبار فعال" value={summary.totalCredit} formatter={(value) => formatPersianPrice(Number(value || 0))} /></Card>
                  <Card><Statistic title="مانده مشتریان" value={summary.totalBalance} formatter={(value) => formatPersianPrice(Number(value || 0))} /></Card>
                  <Card><Statistic title="طرح‌های فعال" value={summary.activeRules} /></Card>
                  <Card><Statistic title="کدهای فعال" value={summary.activeDiscounts} /></Card>
                </div>
                <Card title="آخرین گردش اعتبار">
                  <Table rowKey="id" loading={loading} dataSource={ledgerRows.slice(0, 8)} columns={ledgerColumns} pagination={false} size="small" />
                </Card>
              </div>
            ),
          },
          {
            key: 'rules',
            label: 'طرح‌ها',
            children: (
              <Card
                title="طرح‌های تشویقی"
                extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openRuleModal()} disabled={!canEdit}>طرح جدید</Button>}
              >
                <Table rowKey="id" loading={loading} dataSource={rules} columns={ruleColumns} size="small" />
              </Card>
            ),
          },
          {
            key: 'leveling',
            label: 'سطح‌بندی',
            children: <CustomerLevelingTab />,
          },
          {
            key: 'discounts',
            label: 'کدهای تخفیف',
            children: (
              <Card
                title="کدهای تخفیف"
                extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openDiscountModal()} disabled={!canEdit}>کد جدید</Button>}
              >
                <Table rowKey="id" loading={loading} dataSource={discountCodes} columns={discountColumns} size="small" />
              </Card>
            ),
          },
          {
            key: 'ledger',
            label: 'دفتر اعتبار',
            children: (
              <Card
                title="دفتر اعتبار مشتریان"
                extra={<Button type="primary" icon={<GiftOutlined />} onClick={openLedgerModal} disabled={!canEdit}>ثبت اعتبار</Button>}
              >
                <Table rowKey="id" loading={loading} dataSource={ledgerRows} columns={ledgerColumns} size="small" />
              </Card>
            ),
          },
        ]}
      />

      <Modal
        title={editingRule ? 'ویرایش طرح باشگاه' : 'طرح جدید باشگاه'}
        open={ruleModalOpen}
        onCancel={() => setRuleModalOpen(false)}
        onOk={() => void saveRule().catch((err) => message.error(toFaErrorMessage(err, 'ذخیره طرح ناموفق بود')))}
        okText="ذخیره"
        cancelText="انصراف"
        width={980}
        okButtonProps={{ icon: <SaveOutlined /> }}
      >
        <Form form={ruleForm} layout="vertical">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Form.Item name="name" label="عنوان طرح" rules={[{ required: true, message: 'عنوان طرح را وارد کنید' }]}><Input /></Form.Item>
            <Form.Item name="rule_type" label="نوع طرح" rules={[{ required: true }]}><Select options={ruleTypeOptions} /></Form.Item>
            <Form.Item name="reward_type" label="نوع پاداش"><Select options={rewardTypeOptions} /></Form.Item>
            <Form.Item name="reward_amount" label="مبلغ ثابت"><InputNumber min={0} className="w-full" /></Form.Item>
            <Form.Item name="reward_percent" label="درصد از فاکتور"><InputNumber min={0} max={100} className="w-full" /></Form.Item>
            <Form.Item name="max_reward_amount" label="سقف پاداش"><InputNumber min={0} className="w-full" /></Form.Item>
            <Form.Item name="starts_at" label="شروع"><Input placeholder="2026-06-17" /></Form.Item>
            <Form.Item name="ends_at" label="پایان"><Input placeholder="بدون محدودیت" /></Form.Item>
            <Form.Item name="is_active" label="فعال" valuePropName="checked"><Switch /></Form.Item>
          </div>
          <div className="mt-2 space-y-4">
            <div>
              <div className="mb-2 text-sm font-semibold">همه شرط‌های هدف‌گیری</div>
              <WorkflowConditionsGroup value={ruleConditionsAll} onChange={setRuleConditionsAll} fields={conditionFields} dynamicOptions={dynamicOptions} relationOptions={relationOptions} />
            </div>
            <div>
              <div className="mb-2 text-sm font-semibold">حداقل یکی از شرط‌ها</div>
              <WorkflowConditionsGroup value={ruleConditionsAny} onChange={setRuleConditionsAny} fields={conditionFields} dynamicOptions={dynamicOptions} relationOptions={relationOptions} />
            </div>
          </div>
        </Form>
      </Modal>

      <Modal
        title={editingDiscount ? 'ویرایش کد تخفیف' : 'کد تخفیف جدید'}
        open={discountModalOpen}
        onCancel={() => setDiscountModalOpen(false)}
        onOk={() => void saveDiscount().catch((err) => message.error(toFaErrorMessage(err, 'ذخیره کد تخفیف ناموفق بود')))}
        okText="ذخیره"
        cancelText="انصراف"
        width={980}
      >
        <Form form={discountForm} layout="vertical">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Form.Item name="code" label="کد" rules={[{ required: true, message: 'کد را وارد کنید' }]}><Input onBlur={(e) => discountForm.setFieldValue('code', normalizeCustomerClubCode(e.target.value))} /></Form.Item>
            <Form.Item name="title" label="عنوان" rules={[{ required: true, message: 'عنوان را وارد کنید' }]}><Input /></Form.Item>
            <Form.Item name="discount_type" label="نوع تخفیف"><Select options={rewardTypeOptions.map((item) => ({ ...item, label: item.value === 'amount' ? 'مبلغ ثابت' : 'درصدی' }))} /></Form.Item>
            <Form.Item name="discount_value" label="مقدار تخفیف"><InputNumber min={0} className="w-full" /></Form.Item>
            <Form.Item name="max_discount_amount" label="سقف تخفیف"><InputNumber min={0} className="w-full" /></Form.Item>
            <Form.Item name="max_uses" label="حداکثر تعداد مصرف کل"><InputNumber min={0} className="w-full" /></Form.Item>
            <Form.Item name="per_customer_max_uses" label="حداکثر مصرف هر مشتری"><InputNumber min={0} className="w-full" /></Form.Item>
            <Form.Item name="starts_at" label="شروع"><Input placeholder="2026-06-17" /></Form.Item>
            <Form.Item name="ends_at" label="پایان"><Input placeholder="بدون محدودیت" /></Form.Item>
            <Form.Item name="is_active" label="فعال" valuePropName="checked"><Switch /></Form.Item>
          </div>
          <div className="mt-2 space-y-4">
            <div>
              <div className="mb-2 text-sm font-semibold">همه شرط‌های هدف‌گیری</div>
              <WorkflowConditionsGroup value={discountConditionsAll} onChange={setDiscountConditionsAll} fields={conditionFields} dynamicOptions={dynamicOptions} relationOptions={relationOptions} />
            </div>
            <div>
              <div className="mb-2 text-sm font-semibold">حداقل یکی از شرط‌ها</div>
              <WorkflowConditionsGroup value={discountConditionsAny} onChange={setDiscountConditionsAny} fields={conditionFields} dynamicOptions={dynamicOptions} relationOptions={relationOptions} />
            </div>
          </div>
        </Form>
      </Modal>

      <Modal
        title="ثبت اعتبار مشتری"
        open={ledgerModalOpen}
        onCancel={() => setLedgerModalOpen(false)}
        onOk={() => void saveLedgerEntry().catch((err) => message.error(toFaErrorMessage(err, 'ثبت اعتبار ناموفق بود')))}
        okText="ثبت"
        cancelText="انصراف"
      >
        <Form form={ledgerForm} layout="vertical">
          <Form.Item name="customer_id" label="مشتری" rules={[{ required: true, message: 'مشتری را انتخاب کنید' }]}>
            <Select options={customerOptions} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="entry_type" label="نوع ثبت">
            <Select options={[
              { label: 'افزایش اعتبار', value: 'credit' },
              { label: 'مصرف اعتبار', value: 'debit' },
              { label: 'اصلاح اعتبار', value: 'adjustment' },
            ]} />
          </Form.Item>
          <Form.Item name="amount" label="مبلغ" rules={[{ required: true, message: 'مبلغ را وارد کنید' }]}>
            <InputNumber min={0} className="w-full" />
          </Form.Item>
          <Form.Item name="effective_date" label="تاریخ اثر">
            <Input placeholder="2026-06-17" />
          </Form.Item>
          <Form.Item name="description" label="توضیحات">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CustomerClubPage;
