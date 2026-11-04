import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Empty, Select, Spin, Tag, message } from 'antd';
import { MailOutlined, ReloadOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { useOrganizationEmail } from '../../hooks/useOrganizationEmail';
import { EmailMessage, EMAIL_STATUS_LABELS, invokeEmail } from '../../utils/organizationEmail';
import { useEmailComposerStore } from '../../utils/emailComposerStore';
import EmailMessageView from './EmailMessageView';

export default function EmailWorkspace({ onBack, initialMessageId }: { onBack?: () => void; initialMessageId?: string }) {
  const [folder, setFolder] = useState('inbox');
  const [selected, setSelected] = useState<EmailMessage | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { identity, rows, accounts, error, busy, hasMore, more, refresh: load } = useOrganizationEmail(folder);
  const open = useEmailComposerStore(s => s.open);
  const select = useCallback(async (mail: EmailMessage) => {
    if (!identity || mail.org_id !== identity.org) return;
    try {
      const { data, error } = await supabase.from('email_messages').select('id,org_id,account_id,thread_id,direction,source,from_address,from_name,to_addresses,cc_addresses,subject,body_text,status,error_message,message_at,attachments').eq('id', mail.id).eq('org_id', identity.org).single();
      if (error || !data) throw new Error('متن این ایمیل دریافت نشد. دوباره تلاش کنید.');
      setSelected(data as EmailMessage);
      const { error: readError } = await supabase.rpc('email_mark_read', { p_message_id: mail.id });
      if (readError) message.warning('ایمیل باز شد، اما ثبت خوانده‌شدن انجام نشد.');
      window.dispatchEvent(new Event('organization-email-changed'));
    } catch (e: any) { message.error(e.message || 'دریافت ایمیل انجام نشد.'); }
  }, [identity]);
  useEffect(() => {
    if (!initialMessageId || !identity) return; let alive = true;
    if (alive) void select({ id: initialMessageId, org_id: identity.org } as EmailMessage);
    return () => { alive = false; };
  }, [identity, initialMessageId, select]);
  const sync = async () => { setSyncing(true); try { for (const account of accounts.filter(a => a.is_active && a.receive_enabled)) await invokeEmail('email-admin', { action: 'sync_account', account_id: account.id }); await load(); } catch (e: any) { message.error(e.message); } finally { setSyncing(false); } };
  return <section dir="rtl" className="flex h-full min-h-0 flex-col bg-white dark:bg-dark-surface">
    <div className="flex flex-wrap items-center gap-2 border-b p-3">{onBack && <Button onClick={onBack}>سایر پیام‌ها</Button>}<strong className="ml-auto">صندوق ایمیل</strong><Button icon={<MailOutlined />} type="primary" onClick={() => open()}>نوشتن ایمیل</Button><Button icon={<ReloadOutlined />} loading={syncing} disabled={!accounts.some(a => a.is_active && a.receive_enabled)} onClick={() => void sync()}>دریافت ایمیل‌های جدید</Button><Button onClick={() => void load()} loading={busy}>تازه‌سازی</Button><Select aria-label="پوشه ایمیل" value={folder} onChange={value => { setSelected(null); setFolder(value); }} options={[{ value: 'inbox', label: 'دریافتی' }, { value: 'sent', label: 'ارسالی' }, { value: 'unread', label: 'خوانده‌نشده' }, { value: 'all', label: 'همه ایمیل‌ها' }]} /></div>
    {error && <Alert type="error" message={error instanceof Error ? error.message : 'دریافت ایمیل‌ها انجام نشد.'} showIcon />}
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside className={`${selected ? 'hidden md:block' : ''} w-full md:w-80 shrink-0 overflow-y-auto border-l`} aria-label="فهرست ایمیل‌ها">
        {busy && !rows.length ? <Spin className="p-5" /> : !rows.length ? <Empty description="ایمیلی در این پوشه وجود ندارد." className="p-5" /> : rows.map(mail => <button type="button" key={mail.id} onClick={() => void select(mail)} className={`block w-full border-b p-3 text-right ${selected?.id === mail.id ? 'bg-blue-50 dark:bg-slate-800' : ''}`}><span dir="ltr" className="block truncate text-xs">{mail.direction === 'inbound' ? mail.from_address : mail.to_addresses.join(', ')}</span><strong className={`block truncate ${mail.is_read ? 'font-normal' : 'font-bold'}`}>{mail.subject || 'بدون موضوع'}</strong><span className="block truncate text-xs text-gray-500">{mail.body_text.slice(0, 120)}</span><small>{new Date(mail.message_at).toLocaleDateString('fa-IR')}</small><Tag className="mt-1 text-wrap">{EMAIL_STATUS_LABELS[mail.status]}</Tag></button>)}
        {hasMore && <Button block loading={busy} onClick={() => void more()}>ایمیل‌های بیشتر</Button>}
      </aside>
      <main className={`${selected ? '' : 'hidden md:block'} min-w-0 flex-1 overflow-y-auto`}>{selected ? <><Button className="md:hidden m-2" onClick={() => setSelected(null)}>بازگشت به فهرست</Button><EmailMessageView mail={selected} /></> : <Empty className="p-8" description="یک ایمیل را برای مشاهده انتخاب کنید." />}</main>
    </div>
  </section>;
}
