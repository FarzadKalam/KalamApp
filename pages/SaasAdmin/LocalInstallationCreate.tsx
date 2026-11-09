import { useRef, useState } from 'react';
import { Alert, App, Button, Card, Form, Input, Select, Space, Spin, Switch, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useInstallationAccess } from '../../hooks/useLocalInstallations';
import { installationRpc, isValidInstallationOrigin, type InstallationInput } from '../../utils/localInstallations';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import AdaptiveSelectField from '../../components/AdaptiveSelectField';

export default function LocalInstallationCreate() {
  const access = useInstallationAccess(); const navigate = useNavigate(); const { message } = App.useApp();
  const [form] = Form.useForm<InstallationInput>(); const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]); const [searching, setSearching] = useState(false);
  const [operators, setOperators] = useState<Array<{ id: string; name: string }>>([]);
  const searchSequence = useRef(0);
  const searchCustomers = async (search = '') => {
    const sequence = ++searchSequence.current; setSearching(true);
    try {
      const data = await installationRpc<{ customers: typeof customers }>('customers', null, { search });
      if (searchSequence.current === sequence) setCustomers(data.customers);
    } catch (e) { message.error(toFaErrorMessage(e)); }
    finally { if (searchSequence.current === sequence) setSearching(false); }
  };
  if (access.isLoading) return <Spin />;
  if (access.error) return <Alert type="error" showIcon message={toFaErrorMessage(access.error, 'بررسی دسترسی نصب ناموفق بود.')} />;
  if (!access.data?.build) return <Alert type="warning" message="اجازهٔ ایجاد پروندهٔ نصب را ندارید." />;
  const submit = async (values: InstallationInput) => {
    if (saving) return; setSaving(true);
    try {
      const { id } = await installationRpc<{ id: string }>('create', null, { ...values, public_url: values.public_url.trim().replace(/\/$/, '') });
      navigate(`/saas_local_installations/${id}`);
    } catch (e) { message.error(toFaErrorMessage(e, 'ایجاد پروندهٔ نصب ناموفق بود.')); }
    finally { setSaving(false); }
  };
  return <Card className="max-w-3xl mx-auto" title="ایجاد نصب اختصاصی">
    <Space direction="vertical" size="large" className="w-full">
      <Alert type="info" showIcon message="نصب مستقل روی سرور مشتری" description="Ubuntu 24.04 و پردازندهٔ ۶۴ بیتی پشتیبانی می‌شوند. رمز مدیر و کلیدهای نصب فقط روی سرور مقصد دریافت یا ساخته می‌شوند. مسئول پیگیری، ایجادکنندهٔ پرونده است." />
      <Form form={form} layout="vertical" onFinish={submit} initialValues={{ install_kind: 'fresh', access_mode: 'public', tls_mode: 'provided', delivery_mode: 'download', telemetry_enabled: false }}>
        <Form.Item name="title" label="عنوان نصب" rules={[{ required: true, min: 2, max: 180, message: 'عنوانی بین ۲ تا ۱۸۰ حرف وارد کنید.' }]}><Input /></Form.Item>
        <Form.Item name="customer_org_id" label="سازمان مشتری" rules={[{ required: true, message: 'مشتری را انتخاب کنید.' }]}>
          <AdaptiveSelectField showSearch filterOption={false} loading={searching} onSearch={value => void searchCustomers(value)} onOpenChange={open => { if (open) void searchCustomers(); }} options={customers.map(c => ({ value: c.id, label: c.name }))} pickerTitle="انتخاب سازمان مشتری" placeholder="نام سازمان را جست‌وجو کنید" />
        </Form.Item>
        <Form.Item name="assigned_to" label="مسئول پیگیری">
          <AdaptiveSelectField allowClear pickerTitle="مسئول پیگیری نصب" placeholder="ایجادکنندهٔ پرونده" options={operators.map(o => ({ value: o.id, label: o.name }))} onOpenChange={open => {
            if (open) void installationRpc<{ operators: typeof operators }>('operators').then(data => setOperators(data.operators)).catch(e => message.error(toFaErrorMessage(e)));
          }} />
        </Form.Item>
        <Form.Item name="install_kind" label="نوع راه‌اندازی"><Select options={[{ value: 'fresh', label: 'نصب تازه' }, { value: 'migration', label: 'انتقال از نسخهٔ ابری مشتری' }]} /></Form.Item>
        <Form.Item name="public_url" label="نشانی نهایی نصب" rules={[{ required: true }, { validator: (_, v) => isValidInstallationOrigin(String(v || '').replace(/\/$/, '')) ? Promise.resolve() : Promise.reject(new Error('نشانی HTTPS بدون مسیر وارد کنید؛ مانند https://app.example.ir')) }]}><Input dir="ltr" placeholder="https://app.example.ir" /></Form.Item>
        <Form.Item name="access_mode" label="روش دسترسی"><Select options={[{ value: 'public', label: 'دامنهٔ عمومی' }, { value: 'internal', label: 'شبکهٔ داخلی شرکت' }]} /></Form.Item>
        <Form.Item name="tls_mode" label="گواهی اتصال امن"><Select options={[{ value: 'provided', label: 'ورود گواهی موجود در سرور مقصد' }, { value: 'internal_ca', label: 'ساخت گواهی داخلی و اعتماد دستگاه‌های شرکت' }]} /></Form.Item>
        <Form.Item name="delivery_mode" label="تحویل بسته"><Select options={[{ value: 'download', label: 'دریافت از میزبان داخل ایران' }, { value: 'file', label: 'انتقال دستی فایل' }]} /></Form.Item>
        <Form.Item name="admin_name" label="نام مدیر نصب" rules={[{ required: true, max: 180 }]}><Input /></Form.Item>
        <Form.Item name="admin_email" label="ایمیل مدیر نصب" rules={[{ required: true, type: 'email', message: 'ایمیل معتبر وارد کنید.' }]}><Input dir="ltr" /></Form.Item>
        <Form.Item name="telemetry_enabled" label="ارسال اختیاری گزارش سلامت" valuePropName="checked"><Switch checkedChildren="فعال" unCheckedChildren="خاموش" /></Form.Item>
        <Typography.Paragraph type="secondary">گزارش سلامت فقط شامل نسخه و وضعیت سرویس‌هاست. فعال‌کردن آن دسترسی کنترل سرور به پشتیبانی نمی‌دهد.</Typography.Paragraph>
        <Space><Button type="primary" htmlType="submit" loading={saving}>ثبت پرونده</Button><Button onClick={() => navigate('/saas_local_installations')}>بازگشت</Button></Space>
      </Form>
    </Space>
  </Card>;
}
