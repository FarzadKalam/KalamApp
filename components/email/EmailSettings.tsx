import { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Modal, Space, Switch, Table, Tag, message } from 'antd';
import { EmailAccount, invokeEmail } from '../../utils/organizationEmail';
import { supabase } from '../../supabaseClient';

const ConnectionFields = ({ kind }: { kind: 'smtp' | 'imap' }) => <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
  <Form.Item name={[kind, 'host']} label={kind === 'smtp' ? 'سرور ارسال' : 'سرور دریافت'}><Input dir="ltr" placeholder={kind === 'smtp' ? 'smtp.example.com' : 'imap.example.com'} /></Form.Item>
  <Form.Item name={[kind, 'port']} label="پورت امن"><InputNumber min={1} max={65535} className="w-full" /></Form.Item>
  <Form.Item name={[kind, 'username']} label="نام کاربری"><Input dir="ltr" autoComplete="off" /></Form.Item>
  <Form.Item name={[kind, 'password']} label="رمز اتصال" extra="هنگام ویرایش، خالی بگذارید تا رمز قبلی حفظ شود."><Input.Password autoComplete="new-password" /></Form.Item>
</div>;

export default function EmailSettings() {
  const [rows, setRows] = useState<EmailAccount[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<EmailAccount | 'new' | null>(null); const [form] = Form.useForm();
  const [centralForm] = Form.useForm(); const [central, setCentral] = useState(false); const [canManage, setCanManage] = useState(false);
  const [managed, setManaged] = useState(false); const [managedForm] = Form.useForm();
  const load = async () => { try { const result = await invokeEmail('email-admin', { action: 'accounts' }); setRows(result.accounts); } catch (e: any) { setError(e.message); } };
  useEffect(() => { let alive = true; void load(); void supabase.rpc('email_can_access', { p_action: 'manage' }).then(({ data }) => alive && setCanManage(data === true)); void invokeEmail('email-admin', { action: 'platform_get' }).then(result => { if (!alive) return; setCentral(true); centralForm.setFieldsValue(result.settings || {}); }).catch(() => {}); return () => { alive = false; }; }, [centralForm]);
  const run = async (action: string, body: Record<string, unknown> = {}) => { setBusy(true); setError(''); try { const result = await invokeEmail('email-admin', { action, ...body }); message.success(result.message || 'عملیات انجام شد.'); await load(); return true; } catch (e: any) { setError(e.message); return false; } finally { setBusy(false); } };
  const edit = (account: EmailAccount | 'new') => { setEditing(account); form.resetFields(); form.setFieldsValue(account === 'new' ? { smtp: { port: 587 }, imap: { port: 993 } } : { ...account, account_id: account.id, ...account.connection_config }); };
  return <div dir="rtl" className="space-y-3">
    <Alert type="info" showIcon message="هر حساب ایمیل متعلق به همین سازمان است. رمز اتصال در سرور نگهداری می‌شود. پس از ذخیره، اتصال را آزمایش و فعال کنید." />
    {error && <Alert type="error" showIcon message={error} />}
    <Space wrap><Button disabled={!canManage} onClick={() => edit('new')}>اتصال ایمیل خودمان</Button><Button disabled={!canManage} onClick={() => setManaged(true)}>درخواست ایمیل ابری</Button><Button onClick={() => void load()}>تازه‌سازی</Button></Space>
    <Table<EmailAccount> rowKey="id" dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: 650 }} columns={[
      { title: 'عنوان', dataIndex: 'label' }, { title: 'آدرس', dataIndex: 'address', render: value => <span dir="ltr">{value}</span> },
      { title: 'وضعیت', render: (_, a) => <Tag color={a.is_active ? 'green' : 'orange'}>{a.is_active ? 'فعال' : a.status === 'pending' ? 'در انتظار ساخت صندوق' : a.status === 'disabled' ? 'غیرفعال' : 'نیازمند آزمایش اتصال'}</Tag> },
      { title: 'عملیات', render: (_, a) => <Space wrap>{a.mode === 'custom' && <Button disabled={!canManage || busy} onClick={() => edit(a)}>ویرایش</Button>}<Button disabled={!canManage || busy || a.status === 'pending'} onClick={() => void run('verify_account', { account_id: a.id })}>آزمایش و فعال‌سازی</Button>{a.is_active && <Button danger disabled={!canManage || busy} onClick={() => Modal.confirm({ title: 'غیرفعال کردن این حساب ایمیل؟', content: 'ارسال و دریافت این حساب متوقف می‌شود؛ ایمیل‌های قبلی باقی می‌مانند.', okText: 'غیرفعال کردن', cancelText: 'انصراف', onOk: () => run('disable_account', { account_id: a.id }).then(() => undefined) })}>غیرفعال کردن</Button>}</Space> },
    ]} />
    <Modal title="اتصال حساب ایمیل سازمان" open={Boolean(editing)} onCancel={() => !busy && setEditing(null)} confirmLoading={busy} okText="ذخیره اتصال" cancelText="انصراف" width={760} onOk={async () => { const values = await form.validateFields(); if (await run('save_account', { ...values, ...(editing && editing !== 'new' ? { account_id: editing.id } : {}) })) setEditing(null); }}>
      <Form form={form} component={false} layout="vertical"><Form.Item name="label" label="نام فرستنده" rules={[{ required: true, message: 'نام فرستنده را وارد کنید.' }]}><Input /></Form.Item><Form.Item name="address" label="آدرس ایمیل" rules={[{ required: true, type: 'email', message: 'آدرس ایمیل معتبر وارد کنید.' }]}><Input dir="ltr" /></Form.Item><ConnectionFields kind="smtp" /><Form.Item name="receive_enabled" label="دریافت ایمیل در سامانه" valuePropName="checked"><Switch /></Form.Item><ConnectionFields kind="imap" /><Alert type="info" message="در نخستین دریافت، حداکثر ۴۰ ایمیل تازه وارد می‌شود. هر دریافت بعدی نیز به‌صورت محدود ادامه پیدا می‌کند. اتصال دریافت فقط‌خواندنی است." /></Form>
    </Modal>
    <Modal open={managed} title="درخواست صندوق ایمیل ابری" okText="ثبت درخواست" cancelText="انصراف" confirmLoading={busy} onCancel={() => !busy && setManaged(false)} onOk={async () => { const values = await managedForm.validateFields(); if (await run('request_managed', values)) setManaged(false); }}><Form component={false} form={managedForm} layout="vertical"><Alert type="info" message="فعال‌شدن آدرس به آماده بودن سرویس و دامنه ایمیل ابری وابسته است. ثبت درخواست به‌تنهایی به معنی ساخته‌شدن صندوق نیست." /><Form.Item name="label" label="نام فرستنده"><Input /></Form.Item><Form.Item name="alias" label="نام لاتین آدرس" rules={[{ required: true, pattern: /^[a-z0-9][a-z0-9._-]{1,48}$/, message: 'از حروف کوچک لاتین، عدد، نقطه و خط تیره استفاده کنید.' }]}><Input dir="ltr" /></Form.Item></Form></Modal>
    {central && <div className="border rounded p-3"><h3 className="font-bold mb-3">ایمیل مرکزی و دامنه ابری سامانه</h3><Form form={centralForm} component={false} layout="vertical"><Form.Item name="sender_address" label="آدرس فرستنده مرکزی"><Input dir="ltr" /></Form.Item><Form.Item name="sender_name" label="نام فرستنده مرکزی"><Input /></Form.Item><ConnectionFields kind="smtp" /><Form.Item name="managed_domain" label="دامنه ایمیل ابری"><Input dir="ltr" /></Form.Item><Form.Item name="managed_enabled" label="پذیرش درخواست ایمیل ابری" valuePropName="checked"><Switch /></Form.Item><Space><Button loading={busy} onClick={async () => { const values = await centralForm.validateFields(); await run('platform_save', values); }}>ذخیره تنظیمات مرکزی</Button><Button loading={busy} onClick={async () => { await run('platform_verify', centralForm.getFieldsValue(true)); }}>آزمایش اتصال مرکزی</Button></Space></Form></div>}
  </div>;
}
