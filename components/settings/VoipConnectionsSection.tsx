import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
} from 'antd';
import type { FormInstance } from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  PhoneOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { supabase, SUPABASE_URL } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import {
  FRONTEND_VOIP_PROVIDERS,
  VOIP_DIAL_MODE_OPTIONS,
  type VoipProviderKey,
} from '../../utils/voipProvidersCatalog';
import { hasCurrentOrgPlanFeature, VOIP_WEBPHONE_PLAN_FEATURE } from '../../utils/saasPlanFeatures';

interface VoipConnectionsSectionProps {
  form: FormInstance;
  currentOrgId?: string | null;
  voipWebhookUrl: string;
  copyValue: (value: string, label: string) => void;
  testing: boolean;
  syncing: boolean;
  syncInfo: any;
  onTest: () => void;
  onSync: () => void;
}

interface SipTrunkRow {
  id: string;
  provider: string;
  title: string;
  pjsip_trunk_id?: string;
  sip_host?: string;
  sip_port?: number;
  transport?: string;
  auth_type?: string;
  sip_username?: string;
  outbound_caller_id?: string;
  did_numbers?: string[];
  api_base_url?: string;
  is_active?: boolean;
  is_default?: boolean;
  created_at?: string;
}

interface SipEndpointRow {
  id: string;
  assignee_profile_id?: string;
  trunk_id?: string;
  extension: string;
  display_name: string;
  endpoint_kind: 'operator' | 'ai_agent' | 'queue_virtual';
  pjsip_id?: string;
  webrtc_enabled?: boolean;
  transport?: string;
  max_contacts?: number;
  is_active?: boolean;
}

interface OrgMemberOption {
  value: string;
  label: string;
  extension?: string;
}

const VoipConnectionsSection: React.FC<VoipConnectionsSectionProps> = ({
  form,
  currentOrgId,
  voipWebhookUrl,
  copyValue,
  testing,
  syncing,
  syncInfo,
  onTest,
  onSync,
}) => {
  const { message } = App.useApp();
  const [selectedProvider, setSelectedProvider] = useState<VoipProviderKey>('telefonchy');
  const [planWebphoneEnabled, setPlanWebphoneEnabled] = useState(false);

  // Trunks state
  const [trunks, setTrunks] = useState<SipTrunkRow[]>([]);
  const [trunksLoading, setTrunksLoading] = useState(false);
  const [trunkModalOpen, setTrunkModalOpen] = useState(false);
  const [editingTrunk, setEditingTrunk] = useState<SipTrunkRow | null>(null);
  const [trunkSaving, setTrunkSaving] = useState(false);
  const [trunkForm] = Form.useForm();

  // Endpoints state
  const [endpoints, setEndpoints] = useState<SipEndpointRow[]>([]);
  const [endpointsLoading, setEndpointsLoading] = useState(false);
  const [endpointModalOpen, setEndpointModalOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<SipEndpointRow | null>(null);
  const [endpointSaving, setEndpointSaving] = useState(false);
  const [endpointForm] = Form.useForm();

  // Org members for assigning extensions
  const [orgMembers, setOrgMembers] = useState<OrgMemberOption[]>([]);

  // Watch form fields
  const currentProvider = Form.useWatch(['voip', 'provider'], form);
  const currentWebhookSecret = Form.useWatch(['voip', 'webhook_secret'], form);

  useEffect(() => {
    if (currentProvider) {
      setSelectedProvider(currentProvider as VoipProviderKey);
    }
  }, [currentProvider]);

  // Check plan feature
  useEffect(() => {
    let active = true;
    void hasCurrentOrgPlanFeature(VOIP_WEBPHONE_PLAN_FEATURE, { defaultEnabled: false })
      .then((enabled) => {
        if (active) setPlanWebphoneEnabled(enabled);
      })
      .catch(() => {
        if (active) setPlanWebphoneEnabled(false);
      });
    return () => {
      active = false;
    };
  }, [currentOrgId]);

  // Load org profiles for friendly assignment dropdown
  const loadMembers = useCallback(async () => {
    if (!currentOrgId) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, voip_extension')
        .eq('org_id', currentOrgId)
        .order('full_name', { ascending: true })
        .limit(300);
      if (error) throw error;
      const opts: OrgMemberOption[] = (data || []).map((p: any) => ({
        value: String(p.id),
        label: String(p.full_name || p.email || 'کاربر بدون نام').trim(),
        extension: p.voip_extension || undefined,
      }));
      setOrgMembers(opts);
    } catch {
      // ignore
    }
  }, [currentOrgId]);

  const loadTrunks = useCallback(async () => {
    if (!currentOrgId || !planWebphoneEnabled) return;
    setTrunksLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('voip-session', {
        body: { action: 'list_trunks' },
      });
      if (error) throw error;
      setTrunks(Array.isArray(data?.trunks) ? data.trunks : []);
    } catch (err: any) {
      console.warn('[VoipConnections] load trunks error', err);
    } finally {
      setTrunksLoading(false);
    }
  }, [currentOrgId, planWebphoneEnabled]);

  const loadEndpoints = useCallback(async () => {
    if (!currentOrgId || !planWebphoneEnabled) return;
    setEndpointsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('voip-session', {
        body: { action: 'list_endpoints' },
      });
      if (error) throw error;
      setEndpoints(Array.isArray(data?.endpoints) ? data.endpoints : []);
    } catch (err: any) {
      console.warn('[VoipConnections] load endpoints error', err);
    } finally {
      setEndpointsLoading(false);
    }
  }, [currentOrgId, planWebphoneEnabled]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (planWebphoneEnabled) {
      void loadTrunks();
      void loadEndpoints();
    }
  }, [planWebphoneEnabled, loadTrunks, loadEndpoints]);

  const activeProviderMeta = useMemo(() => {
    return FRONTEND_VOIP_PROVIDERS.find((p) => p.value === selectedProvider) || FRONTEND_VOIP_PROVIDERS[0];
  }, [selectedProvider]);

  // Unified webhook URL
  const unifiedVoipWebhookUrl = useMemo(() => {
    const supabaseUrl = SUPABASE_URL.replace(/\/+$/, '');
    const secret = String(currentWebhookSecret || '').trim();
    if (!supabaseUrl || !currentOrgId || !secret) return '';
    const params = new URLSearchParams({
      org_id: currentOrgId,
      provider: selectedProvider,
      secret,
    });
    return `${supabaseUrl}/functions/v1/voip-call-webhook?${params.toString()}`;
  }, [currentOrgId, selectedProvider, currentWebhookSecret]);

  // Handle Trunk CRUD
  const handleOpenTrunkModal = (record?: SipTrunkRow) => {
    setEditingTrunk(record || null);
    trunkForm.resetFields();
    if (record) {
      trunkForm.setFieldsValue({
        ...record,
        did_numbers: Array.isArray(record.did_numbers) ? record.did_numbers.join(', ') : '',
      });
    } else {
      trunkForm.setFieldsValue({
        provider: selectedProvider === 'telefonchy' ? 'sip_trunk' : selectedProvider,
        title: `${activeProviderMeta.label} - خط اصلی`,
        sip_port: 5060,
        transport: 'udp',
        auth_type: 'user_pass',
        is_active: true,
        is_default: trunks.length === 0,
      });
    }
    setTrunkModalOpen(true);
  };

  const handleSaveTrunk = async (values: any) => {
    setTrunkSaving(true);
    try {
      const didArray = String(values.did_numbers || '')
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const payload: Record<string, any> = {
        ...values,
        did_numbers: didArray,
      };
      if (editingTrunk?.id) {
        payload.id = editingTrunk.id;
      }
      const { data, error } = await supabase.functions.invoke('voip-session', {
        body: { action: 'save_trunk', trunk: payload },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || 'ذخیره ترانک ناموفق بود.');
      message.success(data?.message || 'ترانک SIP ذخیره شد.');
      setTrunkModalOpen(false);
      void loadTrunks();
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در ذخیره ترانک'));
    } finally {
      setTrunkSaving(false);
    }
  };

  const handleDeleteTrunk = async (trunkId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('voip-session', {
        body: { action: 'delete_trunk', trunkId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || 'حذف ترانک ناموفق بود.');
      message.success('ترانک SIP حذف شد.');
      void loadTrunks();
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در حذف ترانک'));
    }
  };

  // Handle Endpoint CRUD
  const handleOpenEndpointModal = (record?: SipEndpointRow) => {
    setEditingEndpoint(record || null);
    endpointForm.resetFields();
    if (record) {
      endpointForm.setFieldsValue(record);
    } else {
      endpointForm.setFieldsValue({
        extension: '',
        display_name: '',
        endpoint_kind: 'operator',
        webrtc_enabled: true,
        transport: 'wss',
        max_contacts: 3,
        is_active: true,
      });
    }
    setEndpointModalOpen(true);
  };

  const handleSaveEndpoint = async (values: any) => {
    setEndpointSaving(true);
    try {
      const payload = { ...values };
      if (editingEndpoint?.id) {
        payload.id = editingEndpoint.id;
      }
      const { data, error } = await supabase.functions.invoke('voip-session', {
        body: { action: 'upsert_endpoint', endpoint: payload },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || 'ذخیره داخلی ناموفق بود.');
      message.success(data?.message || 'داخلی WebRTC ذخیره شد.');
      setEndpointModalOpen(false);
      void loadEndpoints();
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در ذخیره داخلی'));
    } finally {
      setEndpointSaving(false);
    }
  };

  const handleDeleteEndpoint = async (endpointId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('voip-session', {
        body: { action: 'delete_endpoint', endpointId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || 'حذف داخلی ناموفق بود.');
      message.success('داخلی WebRTC حذف شد.');
      void loadEndpoints();
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در حذف داخلی'));
    }
  };

  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    orgMembers.forEach((m) => map.set(m.value, m.label));
    return map;
  }, [orgMembers]);

  return (
    <div className="space-y-4">
      {/* Provider Info Banner */}
      <Alert
        type={activeProviderMeta.supportsWebrtc ? 'success' : 'info'}
        showIcon
        icon={<PhoneOutlined />}
        message={
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold">{activeProviderMeta.label}</span>
            <Tag color={activeProviderMeta.supportsWebrtc ? 'cyan' : 'default'}>
              {activeProviderMeta.supportsWebrtc ? 'پوشش WebRTC زنده' : 'کنترل تماس و SmartCall'}
            </Tag>
            <Tag color={activeProviderMeta.supportsSipTrunk ? 'blue' : 'default'}>
              {activeProviderMeta.supportsSipTrunk ? 'ترانک SIP مستقیم' : 'اتصال کلاینت/وب‌سرویس'}
            </Tag>
          </div>
        }
        description={
          <div className="text-xs space-y-1 mt-1">
            <p>{activeProviderMeta.hintFa}</p>
            {activeProviderMeta.value === 'telefonchy' ? (
              <p className="text-gray-500">
                تماس‌های ورودی/خروجی از تلفنچی مستقیماً لاگ شده و در صورت تمایل به استفاده از وب‌فون داخل اپ، می‌توانید داخلی‌های WebRTC را در بخش زیر پیکربندی نمایید.
              </p>
            ) : null}
          </div>
        }
      />

      {/* Main Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Form.Item label="ارائه‌دهنده VoIP" name={['voip', 'provider']}>
          <Select
            options={FRONTEND_VOIP_PROVIDERS.map((p) => ({
              label: p.label,
              value: p.value,
            }))}
            onChange={(val) => setSelectedProvider(val as VoipProviderKey)}
          />
        </Form.Item>
        <Form.Item label="فعال" name={['voip', 'is_active']} valuePropName="checked">
          <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
        </Form.Item>
        <Form.Item label="حالت پیش‌فرض شماره‌گیری" name={['voip', 'default_dial_mode']}>
          <Select options={[...VOIP_DIAL_MODE_OPTIONS]} />
        </Form.Item>

        <Form.Item label="Base URL سرویس‌دهنده" name={['voip', 'base_url']} className="md:col-span-2">
          <Input placeholder={activeProviderMeta.value === 'telefonchy' ? 'https://panel.telefonchy.com' : 'https://pbx.example.com'} />
        </Form.Item>
        <Form.Item label="Smart Call خودکار" name={['voip', 'smartcall_enabled']} valuePropName="checked">
          <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
        </Form.Item>

        <Form.Item label="توکن یا رمز وب‌سرویس" name={['voip', 'webservice_token']} className="md:col-span-2">
          <Input.Password placeholder="توکن API یا رمز وب‌سرویس" autoComplete="new-password" />
        </Form.Item>
        <Form.Item label="شناسه سرویس / ترانک" name={['voip', 'service_id']}>
          <Input placeholder="Service ID یا شماره سرویس" />
        </Form.Item>

        <Form.Item label="داخلی پیش‌فرض سازمان" name={['voip', 'default_extension']}>
          <Input placeholder="مثال: 101" />
        </Form.Item>
        <Form.Item label="Webhook Secret (رمز دریافت وقایع)" name={['voip', 'webhook_secret']} className="md:col-span-2">
          <Input.Password placeholder="برای اعتبارسنجی رویدادهای دریافتی" autoComplete="new-password" />
        </Form.Item>

        {/* WebRTC Gateway Configuration */}
        <div className="md:col-span-3 border-t border-gray-200 dark:border-gray-800 pt-3">
          <div className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
            <ThunderboltOutlined className="text-amber-500" />
            تنظیمات درگاه تلفن زنده تحت وب (Asterisk / WebRTC Gateway)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Form.Item
              label="آدرس وب‌سوکت SIP (WSS)"
              name={['voip', 'wss_url']}
              extra="پیش‌فرض سرور: wss://api.tazesystem.ir/voip-ws"
            >
              <Input placeholder="wss://api.tazesystem.ir/voip-ws" dir="ltr" />
            </Form.Item>
            <Form.Item
              label="دامنه SIP (Realm)"
              name={['voip', 'sip_domain']}
              extra="دامنه سرور مرکز تلفن (مثلاً tazesystem.ir)"
            >
              <Input placeholder="tazesystem.ir" dir="ltr" />
            </Form.Item>
            <Form.Item
              label="سرور STUN / TURN"
              name={['voip', 'turn_host']}
              extra="برای عبور NAT صوتی فیلترشکن و فایروال"
            >
              <Input placeholder="turn.tazesystem.ir:3478" dir="ltr" />
            </Form.Item>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="md:col-span-3">
          <Space wrap>
            <Button
              icon={<SafetyCertificateOutlined />}
              loading={testing}
              onClick={onTest}
            >
              تست اتصال VoIP
            </Button>
            {selectedProvider === 'telefonchy' && (
              <Button
                icon={<ReloadOutlined />}
                loading={syncing}
                onClick={onSync}
              >
                همگام‌سازی تماس‌های اخیر
              </Button>
            )}
            <Button
              icon={<CopyOutlined />}
              disabled={!voipWebhookUrl && !unifiedVoipWebhookUrl}
              onClick={() => copyValue(unifiedVoipWebhookUrl || voipWebhookUrl, 'آدرس Webhook تماس')}
            >
              کپی آدرس Webhook
            </Button>
          </Space>

          {/* Webhook URLs Display */}
          <div className="mt-3 space-y-2">
            {unifiedVoipWebhookUrl ? (
              <Alert
                type="info"
                showIcon
                message="آدرس Webhook چندارائه‌دهنده‌ای (توصیه‌شده)"
                description={
                  <span dir="ltr" className="block break-all text-left font-mono text-xs">
                    {unifiedVoipWebhookUrl}
                  </span>
                }
              />
            ) : (
              <Alert
                type="warning"
                showIcon
                message="برای دریافت خودکار رویدادهای تماس، Webhook Secret را تکمیل کنید."
              />
            )}
            {selectedProvider === 'telefonchy' && voipWebhookUrl && (
              <Alert
                type="info"
                showIcon
                message="آدرس سازگار اختصاصی تلفنچی (Webhook نسخه قدیم)"
                description={
                  <span dir="ltr" className="block break-all text-left font-mono text-xs">
                    {voipWebhookUrl}
                  </span>
                }
              />
            )}
            {syncInfo ? (
              <Alert
                type="success"
                showIcon
                message="نتیجه همگام‌سازی"
                description={`دریافت‌شده: ${Number(syncInfo.fetched || 0).toLocaleString('fa-IR')}، ذخیره/بروزرسانی‌شده: ${Number(syncInfo.saved || 0).toLocaleString('fa-IR')}`}
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* Plan Feature Gate for Trunks & Endpoints */}
      {!planWebphoneEnabled ? (
        <Alert
          type="warning"
          showIcon
          className="mt-6"
          message="مدیریت ترانک‌های SIP و داخلی‌های WebRTC نیازمند قابلیت پلن است."
          description="قابلیت «تلفن زنده تحت وب (WebPhone)» در پلن انتخابی این سازمان فعال نیست. برای تعریف ترانک‌های مستقیم مخابرات/FCP و اختصاص داخلی به اپراتورها و ایجنت‌ها، این گزینه را در بخش ویژگی‌های پلن فعال کنید."
        />
      ) : (
        <Card
          size="small"
          className="mt-6 border-leather-200 dark:border-leather-800"
          title={
            <div className="flex items-center gap-2">
              <PhoneOutlined className="text-leather-600" />
              <span>مرکز تلفن ابری (Asterisk Realtime & Trunks)</span>
            </div>
          }
        >
          <Tabs
            defaultActiveKey="endpoints"
            items={[
              {
                key: 'endpoints',
                label: `داخلی‌های وب‌فون (${endpoints.length})`,
                children: (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        داخلی‌های WebRTC به اپراتورها و ایجنت‌های هوش مصنوعی متصل می‌شوند و امکان پاسخگویی مستقیم داخل اپ را فراهم می‌کنند.
                      </span>
                      <Button
                        type="primary"
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={() => handleOpenEndpointModal()}
                      >
                        ایجاد داخلی جدید
                      </Button>
                    </div>
                    <Table<SipEndpointRow>
                      size="small"
                      rowKey="id"
                      loading={endpointsLoading}
                      dataSource={endpoints}
                      pagination={{ pageSize: 8 }}
                      columns={[
                        {
                          title: 'شماره داخلی',
                          dataIndex: 'extension',
                          key: 'extension',
                          render: (ext) => <Tag color="blue" className="font-mono">{ext}</Tag>,
                        },
                        {
                          title: 'نام نمایشی',
                          dataIndex: 'display_name',
                          key: 'display_name',
                        },
                        {
                          title: 'نوع داخلی',
                          dataIndex: 'endpoint_kind',
                          key: 'endpoint_kind',
                          render: (kind) => {
                            if (kind === 'ai_agent') return <Tag color="purple">ایجنت هوش مصنوعی</Tag>;
                            if (kind === 'queue_virtual') return <Tag color="orange">صف انتظار</Tag>;
                            return <Tag color="green">اپراتور انسانی</Tag>;
                          },
                        },
                        {
                          title: 'کاربر منتسب',
                          dataIndex: 'assignee_profile_id',
                          key: 'assignee_profile_id',
                          render: (pid) => {
                            if (!pid) return <span className="text-gray-400">عمومی / بدون انتساب</span>;
                            const name = memberNameMap.get(pid);
                            return name ? (
                              <span className="font-medium text-leather-600">{name}</span>
                            ) : (
                              <span className="text-gray-500">کاربر سازمان</span>
                            );
                          },
                        },
                        {
                          title: 'شناسه Realtime (PJSIP)',
                          dataIndex: 'pjsip_id',
                          key: 'pjsip_id',
                          render: (id) => <span className="font-mono text-xs text-gray-500">{id || '—'}</span>,
                        },
                        {
                          title: 'وضعیت',
                          dataIndex: 'is_active',
                          key: 'is_active',
                          render: (active) =>
                            active !== false ? (
                              <Tag color="success">فعال</Tag>
                            ) : (
                              <Tag color="default">غیرفعال</Tag>
                            ),
                        },
                        {
                          title: 'عملیات',
                          key: 'actions',
                          render: (_, record) => (
                            <Space size="small">
                              <Button
                                size="small"
                                type="text"
                                icon={<EditOutlined />}
                                onClick={() => handleOpenEndpointModal(record)}
                              />
                              <Popconfirm
                                title="حذف داخلی"
                                description="این داخلی از سیستم حذف خواهد شد. ادامه می‌دهید؟"
                                onConfirm={() => handleDeleteEndpoint(record.id)}
                                okText="بله"
                                cancelText="انصراف"
                              >
                                <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                              </Popconfirm>
                            </Space>
                          ),
                        },
                      ]}
                    />
                  </div>
                ),
              },
              {
                key: 'trunks',
                label: `ترانک‌های خطوط خارجی SIP (${trunks.length})`,
                children: (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        ترانک‌های SIP برای اتصال به آسیاتک، شاتل، پیشگامان، رسپینا، مخابرات یا سرورهای سانترال محلی شما (ایزابل، سیموتل و ...).
                      </span>
                      <Button
                        type="primary"
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={() => handleOpenTrunkModal()}
                      >
                        افزودن ترانک SIP
                      </Button>
                    </div>
                    <Table<SipTrunkRow>
                      size="small"
                      rowKey="id"
                      loading={trunksLoading}
                      dataSource={trunks}
                      pagination={{ pageSize: 8 }}
                      columns={[
                        {
                          title: 'نام ترانک',
                          dataIndex: 'title',
                          key: 'title',
                          render: (t, r) => (
                            <div className="flex items-center gap-1">
                              <span className="font-bold">{t}</span>
                              {r.is_default && <Tag color="gold">پیش‌فرض خروجی</Tag>}
                            </div>
                          ),
                        },
                        {
                          title: 'ارائه‌دهنده',
                          dataIndex: 'provider',
                          key: 'provider',
                          render: (p) => {
                            const meta = FRONTEND_VOIP_PROVIDERS.find((x) => x.value === p);
                            return <Tag color="cyan">{meta?.label || p}</Tag>;
                          },
                        },
                        {
                          title: 'سرور SIP (میزبان)',
                          dataIndex: 'sip_host',
                          key: 'sip_host',
                          render: (host, r) => (
                            <span dir="ltr" className="font-mono text-xs">
                              {host ? `${host}:${r.sip_port || 5060}` : '—'}
                            </span>
                          ),
                        },
                        {
                          title: 'نام کاربری SIP',
                          dataIndex: 'sip_username',
                          key: 'sip_username',
                          render: (u) => <span dir="ltr" className="font-mono text-xs">{u || '—'}</span>,
                        },
                        {
                          title: 'خطوط / سرشماره‌ها',
                          dataIndex: 'did_numbers',
                          key: 'did_numbers',
                          render: (dids) =>
                            Array.isArray(dids) && dids.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {dids.map((d) => (
                                  <Tag key={d} className="font-mono">{d}</Tag>
                                ))}
                              </div>
                            ) : (
                              '—'
                            ),
                        },
                        {
                          title: 'وضعیت',
                          dataIndex: 'is_active',
                          key: 'is_active',
                          render: (active) =>
                            active !== false ? (
                              <Tag color="success">فعال</Tag>
                            ) : (
                              <Tag color="default">غیرفعال</Tag>
                            ),
                        },
                        {
                          title: 'عملیات',
                          key: 'actions',
                          render: (_, record) => (
                            <Space size="small">
                              <Button
                                size="small"
                                type="text"
                                icon={<EditOutlined />}
                                onClick={() => handleOpenTrunkModal(record)}
                              />
                              <Popconfirm
                                title="حذف ترانک"
                                description="این ترانک و تماس‌های متصل به آن حذف خواهند شد. ادامه می‌دهید؟"
                                onConfirm={() => handleDeleteTrunk(record.id)}
                                okText="بله"
                                cancelText="انصراف"
                              >
                                <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                              </Popconfirm>
                            </Space>
                          ),
                        },
                      ]}
                    />
                  </div>
                ),
              },
            ]}
          />
        </Card>
      )}

      {/* Trunk Modal */}
      <Modal
        title={editingTrunk ? 'ویرایش ترانک SIP' : 'افزودن ترانک SIP جدید'}
        open={trunkModalOpen}
        onCancel={() => setTrunkModalOpen(false)}
        onOk={() => trunkForm.submit()}
        confirmLoading={trunkSaving}
        okText="ذخیره ترانک"
        cancelText="انصراف"
        destroyOnClose
      >
        <Form form={trunkForm} layout="vertical" onFinish={handleSaveTrunk}>
          <Form.Item label="عنوان ترانک" name="title" rules={[{ required: true, message: 'عنوان الزامی است' }]}>
            <Input placeholder="مثال: خط ۴ رقمی آسیاتک" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item label="ارائه‌دهنده" name="provider" rules={[{ required: true }]}>
              <Select
                options={FRONTEND_VOIP_PROVIDERS.filter((p) => p.supportsSipTrunk).map((p) => ({
                  label: p.label,
                  value: p.value,
                }))}
              />
            </Form.Item>
            <Form.Item label="نوع احراز هویت" name="auth_type">
              <Select
                options={[
                  { label: 'نام کاربری و رمز (User/Pass)', value: 'user_pass' },
                  { label: 'بر مبنای IP (IP Authentication)', value: 'ip_based' },
                  { label: 'ثبت دوره ای (SIP Register)', value: 'register' },
                ]}
              />
            </Form.Item>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Form.Item label="سرور SIP (Host / IP)" name="sip_host" className="col-span-2">
              <Input placeholder="sip.asiatech.ir یا 192.168.1.10" dir="ltr" />
            </Form.Item>
            <Form.Item label="پورت SIP" name="sip_port">
              <InputNumber min={1} max={65535} className="w-full" placeholder="5060" />
            </Form.Item>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item label="نام کاربری SIP" name="sip_username">
              <Input placeholder="Username / Auth ID" dir="ltr" />
            </Form.Item>
            <Form.Item label="رمز عبور SIP" name="sip_secret">
              <Input.Password placeholder="Secret / Password" dir="ltr" autoComplete="new-password" />
            </Form.Item>
          </div>
          <Form.Item
            label="سرشماره‌های تماس (DID)"
            name="did_numbers"
            extra="چند شماره را با کاما از هم جدا کنید (مثال: 02191001234, 02191005678)"
          >
            <Input placeholder="02191001234" dir="ltr" />
          </Form.Item>
          <div className="flex items-center gap-6">
            <Form.Item label="ترانک پیش‌فرض تماس‌های خروجی" name="is_default" valuePropName="checked" className="mb-0">
              <Switch />
            </Form.Item>
            <Form.Item label="وضعیت فعال" name="is_active" valuePropName="checked" className="mb-0">
              <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* Endpoint Modal */}
      <Modal
        title={editingEndpoint ? 'ویرایش داخلی WebRTC' : 'ایجاد داخلی WebRTC جدید'}
        open={endpointModalOpen}
        onCancel={() => setEndpointModalOpen(false)}
        onOk={() => endpointForm.submit()}
        confirmLoading={endpointSaving}
        okText="ذخیره داخلی"
        cancelText="انصراف"
        destroyOnClose
      >
        <Form form={endpointForm} layout="vertical" onFinish={handleSaveEndpoint}>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item
              label="شماره داخلی"
              name="extension"
              rules={[{ required: true, message: 'شماره داخلی الزامی است' }]}
              extra="عددی یا کوتاه (مثال: 101, 102)"
            >
              <Input placeholder="101" dir="ltr" />
            </Form.Item>
            <Form.Item
              label="نام نمایشی"
              name="display_name"
              rules={[{ required: true, message: 'نام الزامی است' }]}
            >
              <Input placeholder="مثال: پشتیبانی فروش" />
            </Form.Item>
          </div>
          <Form.Item label="کاربر منتسب از سازمان" name="assignee_profile_id" extra="اپراتوری که تماس با این داخلی برای او زنگ می‌خورد">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="انتخاب کاربر سازمان..."
              options={orgMembers}
            />
          </Form.Item>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item label="نوع داخلی" name="endpoint_kind">
              <Select
                options={[
                  { label: 'اپراتور انسانی', value: 'operator' },
                  { label: 'ایجنت هوش مصنوعی', value: 'ai_agent' },
                  { label: 'صف انتظار مجازی', value: 'queue_virtual' },
                ]}
              />
            </Form.Item>
            <Form.Item label="حداکثر دستگاه هم‌زمان" name="max_contacts">
              <InputNumber min={1} max={10} className="w-full" placeholder="3" />
            </Form.Item>
          </div>
          <Form.Item
            label="رمز عبور SIP (اختیاری)"
            name="sip_secret"
            extra="در صورت خالی ماندن، سیستم رمز امن اختصاصی تولید می‌کند."
          >
            <Input.Password placeholder="رمز عبور داخلی" dir="ltr" autoComplete="new-password" />
          </Form.Item>
          <div className="flex items-center gap-6">
            <Form.Item label="پشتیبانی از WebRTC" name="webrtc_enabled" valuePropName="checked" className="mb-0">
              <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
            </Form.Item>
            <Form.Item label="وضعیت فعال" name="is_active" valuePropName="checked" className="mb-0">
              <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default VoipConnectionsSection;
