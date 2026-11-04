import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Input, Modal, Select, Upload, message } from 'antd';
import { PaperClipOutlined, SendOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import { useEmailComposerStore } from '../../utils/emailComposerStore';
import { EmailAccount, invokeEmail, isEmailAddress } from '../../utils/organizationEmail';
import { fetchSessionBootstrap } from '../../utils/sessionCache';
import { supabase } from '../../supabaseClient';

export default function EmailComposerHost() {
  const { seed, close } = useEmailComposerStore();
  const [form] = Form.useForm(); const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [files, setFiles] = useState<UploadFile[]>([]); const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [uncertain, setUncertain] = useState(false);
  const requestKey = useRef(''); const orgId = useRef('');
  useEffect(() => {
    if (!seed) return; let active = true;
    requestKey.current = crypto.randomUUID(); setFiles([]); setError(''); setUncertain(false); form.resetFields(); form.setFieldsValue(seed); setLoading(true);
    void fetchSessionBootstrap(supabase).then(async ctx => {
      orgId.current = ctx.orgId || ''; const result = await invokeEmail('email-admin', { action: 'accounts' });
      if (!active) return; const choices = result.accounts.filter((a: EmailAccount) => a.is_active); setAccounts(choices);
      form.setFieldValue('accountId', seed.accountId || choices[0]?.id);
    }).catch(e => active && setError(e.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [seed, form]);
  const dismiss = () => {
    if (busy) return;
    if (form.isFieldsTouched() || files.length) Modal.confirm({ title: 'بستن ایمیل نوشته‌شده؟', content: 'متن و پیوست‌های این ایمیل هنوز ارسال نشده‌اند.', okText: 'بستن و کنار گذاشتن', cancelText: 'ادامه نوشتن', onOk: close });
    else close();
  };
  const send = async () => {
    if (busy || uncertain) return;
    try {
      const values = await form.validateFields(); setBusy(true); setError('');
      const context = await fetchSessionBootstrap(supabase, { force: true });
      if (!orgId.current || context.orgId !== orgId.current) throw new Error('سازمان فعال تغییر کرده است. این ایمیل را در سازمان درست دوباره باز کنید.');
      const attachments = await Promise.all(files.map(file => new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, mime_type: file.type, content_base64: String(reader.result).split(',')[1] }); reader.onerror = reject; reader.readAsDataURL(file.originFileObj!);
      })));
      const result = await invokeEmail('send-email', { to: values.to, cc: values.cc || [], bcc: values.bcc || [], subject: values.subject, body: values.body, account_id: values.accountId, reply_to_id: seed?.replyToId, module_id: seed?.moduleId, record_id: seed?.recordId, attachments, request_key: requestKey.current });
      message.success(result.message || 'ایمیل برای ارسال پذیرفته شد.'); window.dispatchEvent(new Event('organization-email-changed')); close();
    } catch (e: any) { if (e.errorFields) return; setError(e.message || 'ارسال انجام نشد.'); if (e.transportAccepted) setUncertain(true); else if (e.retrySafe) requestKey.current = crypto.randomUUID(); }
    finally { setBusy(false); }
  };
  const recipientRules = [{ validator: async (_: unknown, values: string[]) => { if ((values || []).some(v => !isEmailAddress(v))) throw new Error('آدرس ایمیل را کامل و معتبر وارد کنید.'); } }];
  return <Modal open={Boolean(seed)} title={seed?.replyToId ? 'پاسخ ایمیل' : 'نوشتن ایمیل'} width={820} onCancel={dismiss} maskClosable={false} footer={<><Button disabled={busy} onClick={dismiss}>بستن</Button><Button type="primary" icon={<SendOutlined />} loading={busy} disabled={loading || !accounts.length || uncertain} onClick={() => void send()}>ارسال ایمیل</Button></>}>
    {error && <Alert type="error" showIcon message={error} className="mb-3" />}
    {!loading && !accounts.length && <Alert type="info" message="برای ارسال، ابتدا حساب ایمیل سازمان را در تنظیمات اتصال‌ها فعال کنید." className="mb-3" />}
    <Form form={form} layout="vertical" disabled={busy}>
      <Form.Item name="accountId" label="فرستنده" rules={[{ required: true, message: 'فرستنده را انتخاب کنید.' }]}><Select loading={loading} options={accounts.map(a => ({ value: a.id, label: `${a.label} — ${a.address}` }))} disabled={Boolean(seed?.replyToId)} /></Form.Item>
      <Form.Item name="to" label="گیرنده" rules={[{ required: true, message: 'گیرنده را وارد کنید.' }, ...recipientRules]}><Select mode="tags" tokenSeparators={[',', ';', '،']} open={false} placeholder="آدرس ایمیل؛ برای افزودن گیرنده Enter بزنید" style={{ direction: 'ltr' }} /></Form.Item>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><Form.Item name="cc" label="رونوشت" rules={recipientRules}><Select mode="tags" tokenSeparators={[',', ';', '،']} open={false} style={{ direction: 'ltr' }} /></Form.Item><Form.Item name="bcc" label="رونوشت مخفی" rules={recipientRules}><Select mode="tags" tokenSeparators={[',', ';', '،']} open={false} style={{ direction: 'ltr' }} /></Form.Item></div>
      <Form.Item name="subject" label="موضوع" rules={[{ required: true, whitespace: true, message: 'موضوع ایمیل را وارد کنید.' }]}><Input maxLength={1000} /></Form.Item>
      <Form.Item name="body" label="متن ایمیل" rules={[{ required: true, whitespace: true, message: 'متن ایمیل را وارد کنید.' }]}><Input.TextArea rows={10} maxLength={1000000} /></Form.Item>
      <Upload multiple fileList={files} beforeUpload={() => false} onChange={({ fileList }) => { if (fileList.length > 10 || fileList.reduce((sum, f) => sum + (f.size || 0), 0) > 10 * 1024 * 1024) { message.error('حداکثر ۱۰ پیوست با مجموع ۱۰ مگابایت مجاز است.'); return; } setFiles(fileList); }}><Button icon={<PaperClipOutlined />}>افزودن پیوست</Button></Upload>
    </Form>
  </Modal>;
}
