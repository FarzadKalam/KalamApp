import { Alert, Button, Descriptions, Space, Tag, message } from 'antd';
import { DownloadOutlined, RollbackOutlined } from '@ant-design/icons';
import { EmailMessage, EMAIL_STATUS_LABELS, invokeEmail } from '../../utils/organizationEmail';
import { useEmailComposerStore } from '../../utils/emailComposerStore';
export default function EmailMessageView({ mail }: { mail: EmailMessage }) {
  const open = useEmailComposerStore(s => s.open);
  const download = async (path: string) => {
    // Open the tab synchronously so popup blockers do not discard an authenticated download.
    const tab = window.open('about:blank', '_blank'); if (tab) tab.opener = null;
    try { const result = await invokeEmail('email-admin', { action: 'attachments', message_id: mail.id }); const file = result.attachments.find((a: any) => a.path === path); if (!file?.url) throw new Error('پیوست در دسترس نیست.'); if (tab) tab.location.href = file.url; else window.location.assign(file.url); }
    catch (e: any) { tab?.close(); message.error(e.message); }
  };
  return <article dir="rtl" className="p-4 min-w-0">
    <h2 className="text-lg font-bold mb-3 break-words">{mail.subject || 'بدون موضوع'}</h2>
    <Descriptions size="small" column={1} items={[
      { key: 'from', label: 'فرستنده', children: <span dir="ltr">{mail.from_name ? `${mail.from_name} — ` : ''}{mail.from_address}</span> },
      { key: 'to', label: 'گیرنده', children: <span dir="ltr">{mail.to_addresses.join('، ')}</span> },
      ...(mail.cc_addresses.length ? [{ key: 'cc', label: 'رونوشت', children: <span dir="ltr">{mail.cc_addresses.join('، ')}</span> }] : []),
      { key: 'date', label: 'زمان', children: new Date(mail.message_at).toLocaleString('fa-IR') },
      { key: 'status', label: 'وضعیت', children: <Tag color={mail.status === 'failed' || mail.status === 'bounced' ? 'red' : 'blue'}>{EMAIL_STATUS_LABELS[mail.status] || 'در حال بررسی'}</Tag> },
    ]} />
    {mail.error_message && <Alert type="warning" showIcon message={mail.error_message} className="my-3" />}
    {/* Render text only. Incoming HTML, trackers and scripts never execute. */}
    <div className="whitespace-pre-wrap break-words py-5" dir="auto">{mail.body_text || 'این ایمیل متن قابل نمایش ندارد.'}</div>
    <Space wrap>{mail.attachments.map((file, index) => <Button key={`${file.path}-${index}`} icon={<DownloadOutlined />} onClick={() => void download(file.path)}>{file.name}</Button>)}</Space>
    {mail.account_id && <div className="mt-5"><Button icon={<RollbackOutlined />} onClick={() => open({ to: mail.direction === 'inbound' ? [mail.from_address] : mail.to_addresses, subject: /^(re|پاسخ):/i.test(mail.subject) ? mail.subject : `پاسخ: ${mail.subject}`, accountId: mail.account_id, replyToId: mail.id })}>پاسخ ایمیل</Button></div>}
  </article>;
}
