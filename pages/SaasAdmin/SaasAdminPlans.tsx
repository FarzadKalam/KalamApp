import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Collapse,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Row,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  App,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  DeleteOutlined,
  StarOutlined,
  StarFilled,
  UpOutlined,
  DownOutlined,
} from '@ant-design/icons';
import { supabase } from '../../supabaseClient';

const { Title, Text } = Typography;
const { Panel } = Collapse;

// گروه‌بندی ماژول‌ها برای نمایش حرفه‌ای
const MODULE_GROUPS: { label: string; modules: { id: string; label: string }[] }[] = [
  {
    label: 'فروش و بازاریابی',
    modules: [
      { id: 'customers', label: 'مشتریان' },
      { id: 'marketing_leads', label: 'سرنخ‌ها و بازاریابی' },
      { id: 'invoices', label: 'فاکتور فروش' },
      { id: 'price_lists', label: 'لیست قیمت‌ها' },
      { id: 'billboards', label: 'تبلیغات محیطی' },
    ],
  },
  {
    label: 'خرید و تامین',
    modules: [
      { id: 'suppliers', label: 'تامین‌کنندگان' },
      { id: 'purchase_invoices', label: 'فاکتور خرید' },
      { id: 'expense_documents', label: 'هزینه‌ها' },
      { id: 'assets', label: 'اموال' },
    ],
  },
  {
    label: 'انبار و تولید',
    modules: [
      { id: 'products', label: 'کالاها و خدمات' },
      { id: 'warehouses', label: 'انبارها' },
      { id: 'shelves', label: 'قفسه‌ها' },
      { id: 'stock_transfers', label: 'تردد و حواله' },
      { id: 'product_bundles', label: 'پکیج‌ها' },
      { id: 'production_boms', label: 'BOM تولید' },
      { id: 'production_orders', label: 'سفارشات تولید' },
    ],
  },
  {
    label: 'پروژه و فرآیند',
    modules: [
      { id: 'projects', label: 'پروژه‌ها' },
      { id: 'tasks', label: 'فعالیت‌ها' },
      { id: 'process_templates', label: 'الگوهای فرآیند' },
      { id: 'process_runs', label: 'اجرای فرآیند' },
    ],
  },
  {
    label: 'منابع انسانی',
    modules: [
      { id: 'employees', label: 'کارکنان' },
      { id: 'job_descriptions', label: 'شرح شغل‌ها' },
      { id: 'attendance_logs', label: 'تردد و حضور' },
      { id: 'work_schedules', label: 'برنامه کاری' },
      { id: 'leave_requests', label: 'مرخصی‌ها' },
      { id: 'overtime_requests', label: 'اضافه‌کاری' },
      { id: 'mission_requests', label: 'ماموریت‌ها' },
      { id: 'employee_advances', label: 'مساعده' },
      { id: 'employee_bonus_requests', label: 'پاداش' },
      { id: 'employee_penalty_requests', label: 'جریمه' },
      { id: 'payroll_slips', label: 'فیش حقوقی' },
      { id: 'employee_contracts', label: 'قراردادها' },
      { id: 'recruitment_applicants', label: 'استخدام' },
    ],
  },
  {
    label: 'مالی و حسابداری',
    modules: [
      { id: 'chart_of_accounts', label: 'جدول حساب‌ها' },
      { id: 'journal_entries', label: 'اسناد حسابداری' },
      { id: 'cash_boxes', label: 'صندوق نقدی' },
      { id: 'bank_accounts', label: 'حساب‌های بانکی' },
      { id: 'petty_funds', label: 'تنخواه' },
      { id: 'cheques', label: 'چک‌ها' },
      { id: 'barters', label: 'تهاترها' },
      { id: 'cash_bank_operations', label: 'نقد و بانک' },
      { id: 'accounting_event_rules', label: 'قوانین حسابداری خودکار' },
      { id: 'cost_centers', label: 'مراکز هزینه' },
      { id: 'fiscal_years', label: 'سال مالی' },
    ],
  },
  {
    label: 'دبیرخانه',
    modules: [
      { id: 'secretariat_documents', label: 'نامه‌ها و مکاتبات' },
      { id: 'delivery_forms', label: 'فرم‌های تحویل' },
    ],
  },
  {
    label: 'ابزارها و گزارشات',
    modules: [
      { id: 'web_forms', label: 'وب فرم‌ها' },
      { id: 'surveys', label: 'نظرسنجی‌ها' },
      { id: 'calculation_formulas', label: 'فرمول‌های محاسباتی' },
      { id: 'automation_execution_reports', label: 'گزارشات اتوماسیون' },
      { id: 'sms_delivery_reports', label: 'گزارشات پیامک' },
      { id: 'voip_call_reports', label: 'گزارشات VoIP' },
      { id: 'counterparty_bot_groups', label: 'گروه‌های بات' },
    ],
  },
];

const FEATURE_OPTIONS = [
  { id: 'ai_chat', label: 'گفتگو با هوش مصنوعی' },
  { id: 'ai_knowledge', label: 'دانش سازمانی AI' },
  { id: 'ai_knowledge_limited', label: 'دانش سازمانی AI (محدود)' },
  { id: 'ai_document_analysis', label: 'تحلیل اسناد با AI' },
  { id: 'ai_web_search', label: 'جستجوی وب AI' },
  { id: 'ai_voice_input', label: 'ورودی صوتی AI' },
  { id: 'ai_voice_output', label: 'خروجی صوتی AI' },
  { id: 'ai_image_generation', label: 'تولید تصویر AI' },
  { id: 'ai_video_generation', label: 'تولید ویدیو AI' },
  { id: 'ai_deep_reasoning', label: 'تفکر عمیق AI' },
  { id: 'ai_legal_assistant', label: 'دستیار حقوقی AI' },
  { id: 'ai_voip_auto_reply', label: 'پاسخگویی خودکار VOIP با AI' },
  { id: 'taxpayer_system', label: 'سامانه مودیان' },
  { id: 'api_access', label: 'دسترسی API' },
  { id: 'advanced_reports', label: 'گزارش‌ساز پیشرفته' },
  { id: 'multi_lane_processes', label: 'فرآیندهای چندردیفه و فعال‌کننده‌ها' },
  { id: 'white_label', label: 'White Label' },
  { id: 'custom_domain', label: 'دامنه اختصاصی' },
  { id: 'own_payment_gateway', label: 'درگاه پرداخت اختصاصی سازمان' },
  { id: 'online_invoice_payment', label: 'پرداخت آنلاین فاکتورهای عمومی' },
  { id: 'online_catalog', label: 'کاتالوگ آنلاین' },
  { id: 'saas_account_billing', label: 'مدیریت حساب و اشتراک' },
  { id: 'ai_credit_topup', label: 'شارژ اعتبار هوش مصنوعی' },
  { id: 'sms_credit_topup', label: 'شارژ اعتبار پیامک' },
  { id: 'extra_users_purchase', label: 'خرید کاربر اضافه' },
];

type PlanRow = {
  id: string;
  code: string | null;
  title: string;
  short_description: string | null;
  description: string | null;
  is_active: boolean;
  is_public: boolean;
  is_demo_default: boolean;
  trial_days: number;
  sort_order: number;
  price_monthly: number;
  price_yearly: number | null;
  included_users: number;
  extra_user_price: number;
  max_users: number | null;
  storage_gb: number | null;
  highlight_tag: string | null;
  custom_price_label: string | null;
  display_features: (string | { text: string; featured: boolean })[];
  enabled_modules: Record<string, boolean>;
  enabled_features: Record<string, any>;
  created_at: string;
};

// تبدیل enabled_modules از DB به آرایه moduleId
const modulesToArray = (obj: Record<string, any>): string[] =>
  Object.entries(obj || {}).filter(([, v]) => v === true).map(([k]) => k);

// تبدیل آرایه moduleId به enabled_modules برای DB
const arrayToModules = (ids: string[]): Record<string, boolean> =>
  Object.fromEntries(ids.map((id) => [id, true]));

const featuresToArray = (obj: Record<string, any>): string[] =>
  Object.entries(obj || {}).filter(([, v]) => !!v).map(([k]) => k);

const arrayToFeatures = (ids: string[]): Record<string, any> =>
  Object.fromEntries(ids.map((id) => [id, true]));

const formatPrice = (n: number) =>
  n ? Math.round(n).toLocaleString('fa-IR', { maximumFractionDigits: 0 }) : '—';

const SaasAdminPlans: React.FC = () => {
  const { message: messageApi, modal } = App.useApp();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  // state ماژول‌ها و فیچرها برای picker
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  // display features list — هر آیتم: { text, featured }
  // featured: نمایش در صفحه اول (حداکثر ۶ مورد)
  type DisplayFeature = { text: string; featured: boolean };
  const [displayFeatures, setDisplayFeatures] = useState<DisplayFeature[]>([]);
  const [newFeatureText, setNewFeatureText] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: qErr } = await supabase
        .from('saas_plans')
        .select('*')
        .order('sort_order', { ascending: true });
      if (qErr) throw qErr;
      setPlans((data as PlanRow[]) || []);
    } catch (err: any) {
      setError(err?.message || 'خطا در بارگذاری');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // تبدیل display_features از فرمت قدیمی (string[]) یا جدید ({text,featured}[])
  const parseDisplayFeatures = (raw: any[]): { text: string; featured: boolean }[] => {
    if (!Array.isArray(raw)) return [];
    return raw.map((item, i) => {
      if (typeof item === 'string') return { text: item, featured: i < 6 };
      return { text: String(item?.text ?? ''), featured: Boolean(item?.featured) };
    });
  };

  const openNew = () => {
    setEditing(null);
    setSelectedModules([]);
    setSelectedFeatures([]);
    setDisplayFeatures([]);
    setNewFeatureText('');
    form.resetFields();
    form.setFieldsValue({
      is_active: true,
      is_public: false,
      is_demo_default: false,
      trial_days: 15,
      sort_order: 100,
      included_users: 5,
      extra_user_price: 0,
      price_monthly: 0,
    });
    setDrawerOpen(true);
  };

  const openEdit = (plan: PlanRow) => {
    setEditing(plan);
    setSelectedModules(modulesToArray(plan.enabled_modules));
    setSelectedFeatures(featuresToArray(plan.enabled_features));
    setDisplayFeatures(parseDisplayFeatures(Array.isArray(plan.display_features) ? plan.display_features : []));
    setNewFeatureText('');
    form.setFieldsValue({
      code: plan.code,
      title: plan.title,
      short_description: plan.short_description,
      description: plan.description,
      is_active: plan.is_active,
      is_public: plan.is_public,
      is_demo_default: plan.is_demo_default,
      trial_days: plan.trial_days,
      sort_order: plan.sort_order,
      price_monthly: plan.price_monthly,
      price_yearly: plan.price_yearly,
      included_users: plan.included_users,
      extra_user_price: plan.extra_user_price,
      max_users: plan.max_users,
      storage_gb: plan.storage_gb,
      highlight_tag: plan.highlight_tag,
      custom_price_label: plan.custom_price_label,
    });
    setDrawerOpen(true);
  };

  const addDisplayFeature = () => {
    const text = newFeatureText.trim();
    if (!text) return;
    setDisplayFeatures((prev) => [...prev, { text, featured: false }]);
    setNewFeatureText('');
  };

  const removeDisplayFeature = (idx: number) =>
    setDisplayFeatures((prev) => prev.filter((_, i) => i !== idx));

  const toggleFeatured = (idx: number) => {
    setDisplayFeatures((prev) => {
      const featuredCount = prev.filter((f, i) => f.featured && i !== idx).length;
      if (!prev[idx].featured && featuredCount >= 6) {
        void messageApi.warning('حداکثر ۶ ویژگی می‌توانند در صفحه اول نمایش داده شوند');
        return prev;
      }
      return prev.map((f, i) => i === idx ? { ...f, featured: !f.featured } : f);
    });
  };

  const moveFeature = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    setDisplayFeatures((prev) => {
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const payload = {
        ...values,
        enabled_modules: arrayToModules(selectedModules),
        enabled_features: arrayToFeatures(selectedFeatures),
        display_features: displayFeatures,
        updated_at: new Date().toISOString(),
      };

      if (editing?.id) {
        const { error: upErr } = await supabase
          .from('saas_plans')
          .update(payload)
          .eq('id', editing.id);
        if (upErr) throw upErr;
        messageApi.success('پلن به‌روز شد');
      } else {
        const { error: insErr } = await supabase
          .from('saas_plans')
          .insert([{ ...payload, created_at: new Date().toISOString() }]);
        if (insErr) throw insErr;
        messageApi.success('پلن جدید ایجاد شد');
      }
      setDrawerOpen(false);
      // تاخیر کوتاه تا animation بسته شدن drawer تمام شود، سپس reload
      setTimeout(() => { void load(); }, 300);
    } catch (err: any) {
      if (err?.errorFields) return;
      messageApi.error(err?.message || 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (plan: PlanRow, field: 'is_active' | 'is_public') => {
    const label = field === 'is_active' ? 'فعال/غیرفعال' : 'نمایش در سایت';
    modal.confirm({
      title: `تغییر وضعیت: ${label}`,
      icon: <ExclamationCircleOutlined />,
      content: `پلن "${plan.title}" ${plan[field] ? 'غیرفعال' : 'فعال'} شود؟`,
      okText: 'بله',
      cancelText: 'انصراف',
      onOk: async () => {
        const { error: upErr } = await supabase
          .from('saas_plans')
          .update({ [field]: !plan[field], updated_at: new Date().toISOString() })
          .eq('id', plan.id);
        if (upErr) { messageApi.error(upErr.message); return; }
        void load();
      },
    });
  };

  // toggle یک ماژول در picker
  const toggleModule = (id: string) =>
    setSelectedModules((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );

  const toggleGroupAll = (group: typeof MODULE_GROUPS[0]) => {
    const ids = group.modules.map((m) => m.id);
    const allSelected = ids.every((id) => selectedModules.includes(id));
    if (allSelected) {
      setSelectedModules((prev) => prev.filter((m) => !ids.includes(m)));
    } else {
      setSelectedModules((prev) => [...new Set([...prev, ...ids])]);
    }
  };

  const toggleFeature = (id: string) =>
    setSelectedFeatures((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );

  const columns = [
    {
      title: 'پلن',
      key: 'plan',
      render: (_: any, row: PlanRow) => (
        <div>
          <div className="flex items-center gap-2">
            <span className="font-black text-slate-800">{row.title}</span>
            {row.highlight_tag && (
              <Tag color="gold" icon={<StarOutlined />}>{row.highlight_tag}</Tag>
            )}
            {row.is_demo_default && <Tag color="purple" className="text-[10px]">دمو پیش‌فرض</Tag>}
          </div>
          <Text type="secondary" className="text-xs">{row.short_description || row.description}</Text>
          {row.code && (
            <div><Text className="ltr-text font-mono text-[10px] text-slate-400">{row.code}</Text></div>
          )}
        </div>
      ),
    },
    {
      title: 'قیمت ماهانه',
      key: 'price',
      render: (_: any, row: PlanRow) => (
        <div>
          {row.custom_price_label ? (
            <Tag color="geekblue">{row.custom_price_label}</Tag>
          ) : (
            <>
              <div className="font-bold text-slate-800">{formatPrice(row.price_monthly)} <span className="text-xs font-normal text-slate-400">تومان</span></div>
              {row.price_yearly && (
                <div className="text-xs text-slate-400">{formatPrice(row.price_yearly)} / سال</div>
              )}
            </>
          )}
        </div>
      ),
    },
    {
      title: 'کاربران',
      key: 'users',
      render: (_: any, row: PlanRow) => (
        <div className="text-sm">
          <div>{row.included_users} کاربر پایه</div>
          {row.extra_user_price > 0 && (
            <div className="text-xs text-slate-400">+ {formatPrice(row.extra_user_price)} / کاربر</div>
          )}
          {row.max_users && (
            <div className="text-xs text-slate-400">سقف: {row.max_users}</div>
          )}
        </div>
      ),
    },
    {
      title: 'ماژول‌ها',
      key: 'modules',
      render: (_: any, row: PlanRow) => (
        <Text className="text-xs text-slate-500">
          {modulesToArray(row.enabled_modules).length} ماژول فعال
        </Text>
      ),
    },
    {
      title: 'وضعیت',
      key: 'status',
      render: (_: any, row: PlanRow) => (
        <Space direction="vertical" size={2}>
          <Tag color={row.is_active ? 'green' : 'default'}>{row.is_active ? 'فعال' : 'غیرفعال'}</Tag>
          <Tag color={row.is_public ? 'blue' : 'default'}>{row.is_public ? 'نمایش در سایت' : 'داخلی'}</Tag>
        </Space>
      ),
    },
    {
      title: '',
      key: 'actions',
      render: (_: any, row: PlanRow) => (
        <Space size={4}>
          <Tooltip title="ویرایش">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
          </Tooltip>
          <Tooltip title={row.is_active ? 'غیرفعال کن' : 'فعال کن'}>
            <Button size="small" danger={row.is_active} onClick={() => handleToggle(row, 'is_active')}>
              {row.is_active ? 'غیرفعال' : 'فعال'}
            </Button>
          </Tooltip>
          <Tooltip title={row.is_public ? 'پنهان از سایت' : 'نمایش در سایت'}>
            <Button size="small" onClick={() => handleToggle(row, 'is_public')}>
              {row.is_public ? 'پنهان' : 'نمایش در سایت'}
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Title level={4} className="!mb-0">مدیریت پلن‌ها</Title>
          <Text type="secondary" className="text-xs">پلن‌های عمومی در صفحه سایت نمایش داده می‌شوند. پلن‌های custom برای سازمان‌های خاص قابل اختصاص هستند.</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>
            پلن جدید
          </Button>
        </Space>
      </div>

      {error && <Alert type="error" message={error} showIcon />}

      <Card className="rounded-2xl border-0 shadow-sm">
        {loading ? (
          <div className="flex h-40 items-center justify-center"><Spin /></div>
        ) : (
          <Table
            dataSource={plans}
            columns={columns}
            rowKey="id"
            size="small"
            scroll={{ x: 700 }}
            pagination={false}
          />
        )}
      </Card>

      {/* Drawer ویرایش/ایجاد پلن */}
      <Drawer
        title={editing ? `ویرایش پلن: ${editing.title}` : 'پلن جدید'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={560}
        placement="left"
        styles={{ body: { paddingBottom: 80 } }}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDrawerOpen(false)}>انصراف</Button>
            <Button type="primary" loading={saving} onClick={handleSave}>
              ذخیره پلن
            </Button>
          </div>
        }
      >
        <Form form={form} layout="vertical">
          <Collapse defaultActiveKey={['basic', 'pricing', 'display']} ghost>

            {/* ── اطلاعات پایه ── */}
            <Panel header={<span className="font-bold">اطلاعات پایه</span>} key="basic">
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="title" label="عنوان پلن" rules={[{ required: true, message: 'الزامی' }]}>
                    <Input placeholder="مثال: ابری رشد" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="code" label="کد (code)">
                    <Input className="ltr-text font-mono" placeholder="cloud_growth" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="short_description" label="توضیح کوتاه (نمایش در سایت)">
                <Input placeholder="پیشنهادی برای شرکت‌های خدماتی" />
              </Form.Item>
              <Form.Item name="description" label="توضیحات داخلی">
                <Input.TextArea rows={2} />
              </Form.Item>
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item name="trial_days" label="روز آزمایشی">
                    <InputNumber min={0} max={90} className="w-full" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="sort_order" label="ترتیب نمایش">
                    <InputNumber min={0} max={9999} className="w-full" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item name="is_active" label="فعال" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="is_public" label="نمایش در سایت" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="is_demo_default" label="دمو پیش‌فرض" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
              </Row>
            </Panel>

            {/* ── قیمت‌گذاری ── */}
            <Panel header={<span className="font-bold">قیمت‌گذاری</span>} key="pricing">
              <Alert
                type="info"
                showIcon
                className="mb-4 text-xs"
                message="قیمت‌ها به تومان وارد شوند. برای custom plan از «برچسب قیمت» استفاده کنید."
              />
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="price_monthly" label="قیمت ماهانه (تومان)">
                    <InputNumber
                      min={0}
                      className="w-full"
                      formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      placeholder="2900000"
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="price_yearly" label="قیمت سالانه (تومان)">
                    <InputNumber
                      min={0}
                      className="w-full"
                      formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      placeholder="29000000"
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item name="included_users" label="کاربر پایه">
                    <InputNumber min={1} className="w-full" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="extra_user_price" label="هزینه کاربر اضافه">
                    <InputNumber
                      min={0}
                      className="w-full"
                      formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="max_users" label="سقف کاربر">
                    <InputNumber min={1} className="w-full" placeholder="بی‌محدود" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="storage_gb" label="فضای ذخیره‌سازی (GB)">
                    <InputNumber min={1} className="w-full" placeholder="20" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="custom_price_label"
                    label="برچسب قیمت custom"
                    tooltip="اگر پر باشد، به‌جای عدد نمایش داده می‌شود"
                  >
                    <Input placeholder="مثال: تماس بگیرید" />
                  </Form.Item>
                </Col>
              </Row>
            </Panel>

            {/* ── نمایش در سایت ── */}
            <Panel header={<span className="font-bold">نمایش در سایت عمومی</span>} key="display">
              <Form.Item name="highlight_tag" label="برچسب هایلایت">
                <Input placeholder="مثال: پیشنهادی" className="w-48" />
              </Form.Item>
              <Form.Item
                label={
                  <span>
                    امکانات نمایشی (بولت‌های سایت)
                    <span className="mr-2 text-xs font-normal text-amber-500">
                      ⭐ ستاره‌دار = صفحه اول (حداکثر ۶)
                    </span>
                  </span>
                }
              >
                <div className="space-y-1.5">
                  {displayFeatures.map((f, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center gap-1 rounded-lg px-2 py-1.5 border transition-colors ${
                        f.featured
                          ? 'bg-amber-50 border-amber-200'
                          : 'border-gray-100 hover:border-gray-200'
                      }`}
                    >
                      <Tooltip title={f.featured ? 'ستاره‌دار — نمایش در صفحه اول' : 'کلیک کن تا ستاره‌دار شود'}>
                        <Button
                          type="text"
                          size="small"
                          icon={f.featured ? <StarFilled className="text-amber-400" /> : <StarOutlined className="text-gray-300" />}
                          onClick={() => toggleFeatured(idx)}
                        />
                      </Tooltip>
                      <span className="flex-1 text-sm text-slate-700">{f.text}</span>
                      <Button
                        type="text"
                        size="small"
                        icon={<UpOutlined />}
                        disabled={idx === 0}
                        onClick={() => moveFeature(idx, -1)}
                      />
                      <Button
                        type="text"
                        size="small"
                        icon={<DownOutlined />}
                        disabled={idx === displayFeatures.length - 1}
                        onClick={() => moveFeature(idx, 1)}
                      />
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => removeDisplayFeature(idx)}
                      />
                    </div>
                  ))}
                  {displayFeatures.length === 0 && (
                    <div className="text-xs text-gray-400 py-2 text-center">
                      هنوز ویژگی‌ای اضافه نشده
                    </div>
                  )}
                  <div className="flex gap-2 mt-2">
                    <Input
                      value={newFeatureText}
                      onChange={(e) => setNewFeatureText(e.target.value)}
                      placeholder="مثال: فاکتور و فروش"
                      onPressEnter={addDisplayFeature}
                      className="flex-1"
                    />
                    <Button onClick={addDisplayFeature} icon={<PlusOutlined />}>
                      افزودن
                    </Button>
                  </div>
                </div>
              </Form.Item>
            </Panel>

            {/* ── ماژول‌های فعال ── */}
            <Panel
              header={
                <div className="flex items-center justify-between w-full pl-4">
                  <span className="font-bold">ماژول‌های فعال</span>
                  <Tag>{selectedModules.length} انتخاب‌شده</Tag>
                </div>
              }
              key="modules"
            >
              <div className="space-y-4">
                {MODULE_GROUPS.map((group) => {
                  const ids = group.modules.map((m) => m.id);
                  const selectedCount = ids.filter((id) => selectedModules.includes(id)).length;
                  const allSelected = selectedCount === ids.length;
                  const someSelected = selectedCount > 0 && !allSelected;
                  return (
                    <div key={group.label} className="rounded-xl border border-gray-100 p-3">
                      <div
                        className="flex items-center gap-2 mb-3 cursor-pointer"
                        onClick={() => toggleGroupAll(group)}
                      >
                        <Checkbox
                          checked={allSelected}
                          indeterminate={someSelected}
                          onChange={() => toggleGroupAll(group)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="font-bold text-slate-700 text-sm">{group.label}</span>
                        <Text type="secondary" className="text-xs">({selectedCount}/{ids.length})</Text>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {group.modules.map((mod) => (
                          <div
                            key={mod.id}
                            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-colors text-sm ${
                              selectedModules.includes(mod.id)
                                ? 'bg-slate-900 text-white'
                                : 'hover:bg-gray-50 text-slate-600'
                            }`}
                            onClick={() => toggleModule(mod.id)}
                          >
                            <Checkbox
                              checked={selectedModules.includes(mod.id)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggleModule(mod.id)}
                            />
                            <span>{mod.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            {/* ── ویژگی‌های خاص ── */}
            <Panel
              header={
                <div className="flex items-center justify-between w-full pl-4">
                  <span className="font-bold">ویژگی‌های خاص</span>
                  <Tag>{selectedFeatures.length} انتخاب‌شده</Tag>
                </div>
              }
              key="features"
            >
              <div className="grid grid-cols-2 gap-2">
                {FEATURE_OPTIONS.map((feat) => (
                  <div
                    key={feat.id}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors text-sm ${
                      selectedFeatures.includes(feat.id)
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-gray-200 hover:border-gray-300 text-slate-600'
                    }`}
                    onClick={() => toggleFeature(feat.id)}
                  >
                    <Checkbox
                      checked={selectedFeatures.includes(feat.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleFeature(feat.id)}
                    />
                    <span>{feat.label}</span>
                  </div>
                ))}
              </div>
              <Divider className="my-3" />
              <Alert
                type="warning"
                showIcon
                message="ویژگی‌های خاص از طریق enabled_features کنترل می‌شوند و در DB ذخیره می‌شوند."
                className="text-xs"
              />
            </Panel>

          </Collapse>
        </Form>
      </Drawer>
    </div>
  );
};

export default SaasAdminPlans;
