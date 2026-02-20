import React, { useEffect, useMemo, useState } from 'react';
import {
  App as AntdApp,
  Alert,
  Button,
  Collapse,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
} from 'antd';
import { SaveOutlined, SendOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';

type ConnectionType = 'sms' | 'email' | 'site';

type ConnectionRecord = {
  id?: string;
  connection_type: ConnectionType;
  provider?: string | null;
  settings?: Record<string, any> | null;
  is_active?: boolean;
};

type FormValues = {
  sms: {
    provider?: string;
    mode?: 'rest' | 'soap';
    base_url?: string;
    username?: string;
    password?: string;
    api_key?: string;
    sender_number?: string;
    body_id?: string;
    is_flash?: boolean;
    is_active?: boolean;
  };
  email: {
    provider?: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    from_email?: string;
    from_name?: string;
    secure_tls?: boolean;
    is_active?: boolean;
  };
  site: {
    provider?: string;
    base_url?: string;
    api_key?: string;
    webhook_secret?: string;
    is_active?: boolean;
  };
};

const DEFAULT_VALUES: FormValues = {
  sms: {
    provider: 'meli_payamak',
    mode: 'rest',
    base_url: 'https://rest.payamak-panel.com/api/SendSMS/SendSMS',
    username: '',
    password: '',
    api_key: '',
    sender_number: '',
    body_id: '',
    is_flash: false,
    is_active: true,
  },
  email: {
    provider: 'smtp',
    host: '',
    port: 587,
    username: '',
    password: '',
    from_email: '',
    from_name: '',
    secure_tls: true,
    is_active: true,
  },
  site: {
    provider: 'rest_api',
    base_url: '',
    api_key: '',
    webhook_secret: '',
    is_active: true,
  },
};

const isMissingTableError = (err: any) => {
  const errorCode = String(err?.code || '');
  const errorMessage = String(err?.message || '').toLowerCase();
  return (
    errorCode === '42P01' ||
    errorCode === 'PGRST205' ||
    errorMessage.includes('could not find the table') ||
    (errorMessage.includes('relation') && errorMessage.includes('does not exist'))
  );
};

const ConnectionsTab: React.FC = () => {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<FormValues>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [smsTesting, setSmsTesting] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [rowIds, setRowIds] = useState<Partial<Record<ConnectionType, string>>>({});

  const [testMobile, setTestMobile] = useState('');
  const [testText, setTestText] = useState('این یک پیامک تست از سامانه ERP است.');

  useEffect(() => {
    void fetchData();
  }, []);

  const smsProviderOptions = useMemo(
    () => [{ label: 'ملی پیامک', value: 'meli_payamak' }],
    []
  );

  const emailProviderOptions = useMemo(
    () => [{ label: 'SMTP', value: 'smtp' }],
    []
  );

  const siteProviderOptions = useMemo(
    () => [{ label: 'REST API', value: 'rest_api' }],
    []
  );

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('integration_settings')
        .select('*')
        .in('connection_type', ['sms', 'email', 'site']);

      if (error) {
        if (isMissingTableError(error)) {
          setTableMissing(true);
          form.setFieldsValue(DEFAULT_VALUES);
          return;
        }
        throw error;
      }

      const byType: Partial<Record<ConnectionType, ConnectionRecord>> = {};
      (data || []).forEach((row: any) => {
        const type = String(row?.connection_type || '') as ConnectionType;
        if (type === 'sms' || type === 'email' || type === 'site') {
          byType[type] = row as ConnectionRecord;
        }
      });

      setRowIds({
        sms: byType.sms?.id,
        email: byType.email?.id,
        site: byType.site?.id,
      });

      const nextValues: FormValues = {
        sms: {
          ...DEFAULT_VALUES.sms,
          provider: String(byType.sms?.provider || DEFAULT_VALUES.sms.provider),
          ...(byType.sms?.settings || {}),
          is_active: byType.sms?.is_active ?? true,
        },
        email: {
          ...DEFAULT_VALUES.email,
          provider: String(byType.email?.provider || DEFAULT_VALUES.email.provider),
          ...(byType.email?.settings || {}),
          is_active: byType.email?.is_active ?? true,
        },
        site: {
          ...DEFAULT_VALUES.site,
          provider: String(byType.site?.provider || DEFAULT_VALUES.site.provider),
          ...(byType.site?.settings || {}),
          is_active: byType.site?.is_active ?? true,
        },
      };

      form.setFieldsValue(nextValues);
      setTableMissing(false);
    } catch (err: any) {
      message.error(`خطا در دریافت تنظیمات اتصالات: ${err?.message || 'نامشخص'}`);
      form.setFieldsValue(DEFAULT_VALUES);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || null;

      const rows: Array<Record<string, any>> = [
        {
          id: rowIds.sms,
          connection_type: 'sms',
          provider: values.sms?.provider || 'meli_payamak',
          settings: {
            mode: values.sms?.mode || 'rest',
            base_url: values.sms?.base_url || '',
            username: values.sms?.username || '',
            password: values.sms?.password || '',
            api_key: values.sms?.api_key || '',
            sender_number: values.sms?.sender_number || '',
            body_id: values.sms?.body_id || '',
            is_flash: !!values.sms?.is_flash,
          },
          is_active: values.sms?.is_active !== false,
          updated_by: userId,
        },
        {
          id: rowIds.email,
          connection_type: 'email',
          provider: values.email?.provider || 'smtp',
          settings: {
            host: values.email?.host || '',
            port: values.email?.port || 587,
            username: values.email?.username || '',
            password: values.email?.password || '',
            from_email: values.email?.from_email || '',
            from_name: values.email?.from_name || '',
            secure_tls: values.email?.secure_tls !== false,
          },
          is_active: values.email?.is_active !== false,
          updated_by: userId,
        },
        {
          id: rowIds.site,
          connection_type: 'site',
          provider: values.site?.provider || 'rest_api',
          settings: {
            base_url: values.site?.base_url || '',
            api_key: values.site?.api_key || '',
            webhook_secret: values.site?.webhook_secret || '',
          },
          is_active: values.site?.is_active !== false,
          updated_by: userId,
        },
      ];

      const sanitizedRows = rows.map((row) => {
        if (!row.id) {
          const { id, ...rest } = row;
          return rest;
        }
        return row;
      });

      const { data, error } = await supabase
        .from('integration_settings')
        .upsert(sanitizedRows, { onConflict: 'connection_type' })
        .select('id, connection_type');

      if (error) throw error;

      const nextIds: Partial<Record<ConnectionType, string>> = { ...rowIds };
      (data || []).forEach((row: any) => {
        const type = String(row?.connection_type || '') as ConnectionType;
        if (type === 'sms' || type === 'email' || type === 'site') {
          nextIds[type] = String(row.id);
        }
      });
      setRowIds(nextIds);
      setTableMissing(false);
      message.success('تنظیمات اتصالات ذخیره شد.');
    } catch (err: any) {
      if (Array.isArray(err?.errorFields)) return;
      if (isMissingTableError(err)) {
        setTableMissing(true);
        message.error('جدول integration_settings هنوز در دیتابیس ایجاد نشده است.');
        return;
      }
      message.error(`خطا در ذخیره تنظیمات اتصالات: ${err?.message || 'نامشخص'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestSms = async () => {
    try {
      const smsValues = form.getFieldValue('sms') || {};
      const provider = String(smsValues?.provider || '');
      const mode = String(smsValues?.mode || 'rest') as 'rest' | 'soap';
      const baseUrl = String(smsValues?.base_url || '').trim();
      const username = String(smsValues?.username || '').trim();
      const password = String(smsValues?.password || '').trim();
      const apiKey = String(smsValues?.api_key || '').trim();
      const senderNumber = String(smsValues?.sender_number || '').trim();
      const isFlash = !!smsValues?.is_flash;

      if (provider !== 'meli_payamak') {
        message.error('در حال حاضر فقط ارسال تست برای ملی پیامک فعال است.');
        return;
      }
      if (!baseUrl) {
        message.error('Base URL پیامک را وارد کنید.');
        return;
      }
      if (!username && !apiKey) {
        message.error('حداقل نام کاربری یا API Key را وارد کنید.');
        return;
      }
      if (!password && !apiKey) {
        message.error('برای حالت نام کاربری، رمز عبور الزامی است.');
        return;
      }
      if (!senderNumber) {
        message.error('شماره ارسال کننده را وارد کنید.');
        return;
      }
      if (!testMobile.trim()) {
        message.error('شماره موبایل تست را وارد کنید.');
        return;
      }
      if (!testText.trim()) {
        message.error('متن پیامک تست را وارد کنید.');
        return;
      }

      setSmsTesting(true);
      const normalizeProviderUrl = (url: string) => {
        if (!url) return url;
        try {
          const parsed = new URL(url);
          const path = parsed.pathname.replace(/\/+$/, '');
          if (mode === 'rest' && /(^|\.)rest\.payamak-panel\.com$/i.test(parsed.hostname)) {
            if (/\/api\/SendSMS$/i.test(path)) parsed.pathname = `${path}/SendSMS`;
          }
          if (mode === 'soap' && /(^|\.)api\.payamak-panel\.com$/i.test(parsed.hostname)) {
            if (/\/post\/send\.asmx$/i.test(path)) parsed.pathname = `${path}/SendSimpleSMS2`;
          }
          return parsed.toString();
        } catch {
          return url;
        }
      };

      const resolveRequestUrl = (url: string) => {
        if (!url) return url;
        try {
          const parsed = new URL(url);
          if (import.meta.env.DEV && /(^|\.)rest\.payamak-panel\.com$/i.test(parsed.hostname)) {
            return `/api/melipayamak-rest${parsed.pathname}${parsed.search || ''}`;
          }
          if (import.meta.env.DEV && /(^|\.)api\.payamak-panel\.com$/i.test(parsed.hostname)) {
            return `/api/melipayamak-soap${parsed.pathname}${parsed.search || ''}`;
          }
          return url;
        } catch {
          return url;
        }
      };
      const normalizedBaseUrl = normalizeProviderUrl(baseUrl);
      const url = resolveRequestUrl(normalizedBaseUrl);

      const useSoapRequest =
        mode === 'soap' || /\/post\/send\.asmx(\/SendSimpleSMS2)?$/i.test(normalizedBaseUrl);

      let response: Response;
      if (useSoapRequest) {
        if (!username || !password) {
          message.error('در حالت SOAP نام کاربری و رمز عبور الزامی است.');
          return;
        }
        const body = new URLSearchParams({
          username,
          password,
          to: testMobile.trim(),
          from: senderNumber,
          text: testText.trim(),
          isflash: isFlash ? 'true' : 'false',
        });
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
          body: body.toString(),
        });
      } else {
        const payload: Record<string, any> = {
          to: testMobile.trim(),
          from: senderNumber,
          text: testText.trim(),
          isFlash,
        };
        if (apiKey) {
          payload.apiKey = apiKey;
        } else {
          payload.username = username;
          payload.password = password;
        }
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      }

      const rawText = await response.text();
      let parsed: any = null;
      try {
        parsed = rawText ? JSON.parse(rawText) : null;
      } catch {
        parsed = rawText;
      }

      if (!response.ok) {
        const errText =
          typeof parsed === 'string'
            ? parsed
            : parsed?.message || parsed?.error || `HTTP ${response.status}`;
        throw new Error(errText);
      }

      message.success('پیامک تست ارسال شد (درخواست ثبت شد).');
    } catch (err: any) {
      message.error(`خطا در ارسال پیامک تست: ${err?.message || 'نامشخص'}`);
    } finally {
      setSmsTesting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-4">
      {tableMissing ? (
        <Alert
          type="warning"
          showIcon
          className="mb-4"
          message="جدول integration_settings در دیتابیس یافت نشد."
          description="اسکریپت migration مربوط به این بخش را اجرا کنید، سپس صفحه را رفرش کنید."
        />
      ) : null}

      <Form form={form} layout="vertical" initialValues={DEFAULT_VALUES} disabled={loading}>
        <Collapse
          defaultActiveKey={['sms', 'email', 'site']}
          className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden"
          expandIconPosition="end"
        >
          <Collapse.Panel header="اتصال سامانه پیامک" key="sms">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Form.Item label="ارائه‌دهنده پیامک" name={['sms', 'provider']}>
                <Select options={smsProviderOptions} />
              </Form.Item>
              <Form.Item label="حالت وب‌سرویس" name={['sms', 'mode']}>
                <Select
                  options={[
                    { label: 'REST', value: 'rest' },
                    { label: 'SOAP', value: 'soap' },
                  ]}
                />
              </Form.Item>
              <Form.Item label="فعال" name={['sms', 'is_active']} valuePropName="checked">
                <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
              </Form.Item>

              <Form.Item label="نام کاربری" name={['sms', 'username']}>
                <Input />
              </Form.Item>
              <Form.Item label="رمز عبور" name={['sms', 'password']}>
                <Input.Password />
              </Form.Item>
              <Form.Item label="API Key (اختیاری)" name={['sms', 'api_key']}>
                <Input />
              </Form.Item>

              <Form.Item label="شماره ارسال کننده" name={['sms', 'sender_number']}>
                <Input />
              </Form.Item>
              <Form.Item label="کد پترن (BodyId)" name={['sms', 'body_id']}>
                <Input />
              </Form.Item>
              <Form.Item label="Flash SMS" name={['sms', 'is_flash']} valuePropName="checked">
                <Switch />
              </Form.Item>

              <Form.Item label="Base URL" name={['sms', 'base_url']} className="md:col-span-3">
                <Input />
              </Form.Item>
            </div>

            <div className="text-xs text-gray-500 mb-3">
              برای REST از مسیر
              {' '}
              <code>https://rest.payamak-panel.com/api/SendSMS/SendSMS</code>
              {' '}
              و برای SOAP از مسیر
              {' '}
              <code>https://api.payamak-panel.com/post/send.asmx/SendSimpleSMS2</code>
              {' '}
              استفاده کنید.
            </div>

            <div className="rounded-xl border border-dashed border-leather-300 dark:border-leather-700 p-3 bg-leather-50/30 dark:bg-white/5">
              <div className="font-semibold mb-2">ارسال پیامک تست</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Form.Item label="شماره موبایل تست" className="mb-0">
                  <Input
                    value={testMobile}
                    onChange={(e) => setTestMobile(e.target.value)}
                    placeholder="مثال: 0912..."
                  />
                </Form.Item>
                <Form.Item label="متن پیامک تست" className="mb-0">
                  <Input.TextArea
                    rows={2}
                    value={testText}
                    onChange={(e) => setTestText(e.target.value)}
                  />
                </Form.Item>
              </div>
              <Space className="mt-3">
                <Button
                  type="default"
                  icon={<SendOutlined />}
                  loading={smsTesting}
                  onClick={handleSendTestSms}
                >
                  ارسال پیامک تست
                </Button>
              </Space>
            </div>
          </Collapse.Panel>

          <Collapse.Panel header="اتصال ایمیل" key="email">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Form.Item label="ارائه‌دهنده ایمیل" name={['email', 'provider']}>
                <Select options={emailProviderOptions} />
              </Form.Item>
              <Form.Item label="پورت" name={['email', 'port']}>
                <InputNumber className="w-full persian-number" min={1} />
              </Form.Item>
              <Form.Item label="فعال" name={['email', 'is_active']} valuePropName="checked">
                <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
              </Form.Item>

              <Form.Item label="SMTP Host" name={['email', 'host']}>
                <Input />
              </Form.Item>
              <Form.Item label="نام کاربری" name={['email', 'username']}>
                <Input />
              </Form.Item>
              <Form.Item label="رمز عبور" name={['email', 'password']}>
                <Input.Password />
              </Form.Item>

              <Form.Item label="ایمیل فرستنده" name={['email', 'from_email']}>
                <Input />
              </Form.Item>
              <Form.Item label="نام فرستنده" name={['email', 'from_name']}>
                <Input />
              </Form.Item>
              <Form.Item label="امنیت TLS" name={['email', 'secure_tls']} valuePropName="checked">
                <Switch />
              </Form.Item>
            </div>
          </Collapse.Panel>

          <Collapse.Panel header="اتصال سایت" key="site">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Form.Item label="نوع اتصال" name={['site', 'provider']}>
                <Select options={siteProviderOptions} />
              </Form.Item>
              <Form.Item label="Base URL سایت" name={['site', 'base_url']} className="md:col-span-2">
                <Input />
              </Form.Item>
              <Form.Item label="API Key" name={['site', 'api_key']}>
                <Input />
              </Form.Item>
              <Form.Item label="Webhook Secret" name={['site', 'webhook_secret']}>
                <Input.Password />
              </Form.Item>
              <Form.Item label="فعال" name={['site', 'is_active']} valuePropName="checked">
                <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
              </Form.Item>
            </div>
          </Collapse.Panel>
        </Collapse>

        <div className="flex justify-end mt-4 sticky bottom-0 bg-white dark:bg-[#1a1a1a] py-3 border-t border-gray-100 dark:border-gray-800 z-10">
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={handleSave}
            className="bg-leather-600 hover:!bg-leather-500 border-none h-11 px-8 rounded-xl"
          >
            ذخیره تنظیمات اتصالات
          </Button>
        </div>
      </Form>
    </div>
  );
};

export default ConnectionsTab;
