import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Avatar, Button, Empty, Input, List, Select, Spin, Tabs, Tag, Tooltip } from 'antd';
import { InstagramOutlined, LinkOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import SharedNoteComposer from '../components/notes/SharedNoteComposer';
import { hasCurrentOrgPlanFeature } from '../utils/saasPlanFeatures';
import { fetchCurrentUserRoleContext } from '../utils/permissions';
import InstagramShowcasesSettingsModal from '../components/instagram/InstagramShowcasesSettingsModal';
import InstagramCommentsPanel from '../components/instagram/InstagramCommentsPanel';

type InstagramAccount = { id: string; provider_id: string; username: string; display_name?: string | null; profile_photo_url?: string | null; settings?: { catalog_id?: string | null; default_buttons?: Array<{ title?: string; url?: string }> } | null };
type InstagramConversation = {
  id: string; account_id: string; contact_id: string; status: string; priority: string; tags: string[];
  last_message_preview?: string | null; last_message_at?: string | null; contacts?: { username?: string | null; display_name?: string | null; profile_photo_url?: string | null } | null;
};
type InstagramMessage = { id: string; direction: 'inbound' | 'outbound'; content_text?: string | null; created_at: string; message_type: string };
type ShowcaseOption = { id: string; name: string; account_id?: string | null };

const formatTime = (value?: string | null) => value ? new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '';

const InstagramInboxPage: React.FC = () => {
  const { message } = App.useApp();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [orgId, setOrgId] = useState('');
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [conversations, setConversations] = useState<InstagramConversation[]>([]);
  const [messages, setMessages] = useState<InstagramMessage[]>([]);
  const [activeAccountId, setActiveAccountId] = useState('all');
  const [activeConversationId, setActiveConversationId] = useState('');
  const [draft, setDraft] = useState('');
  const [showcases, setShowcases] = useState<ShowcaseOption[]>([]);
  const [selectedShowcaseId, setSelectedShowcaseId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showcaseSettingsOpen, setShowcaseSettingsOpen] = useState(false);
  const [surface, setSurface] = useState<'direct' | 'comments'>('direct');

  const selectedConversation = useMemo(() => conversations.find((item) => item.id === activeConversationId) || null, [activeConversationId, conversations]);
  const selectedAccount = useMemo(() => selectedConversation ? accounts.find((item) => item.id === selectedConversation.account_id) || null : null, [accounts, selectedConversation]);
  const visibleConversations = useMemo(() => activeAccountId === 'all' ? conversations : conversations.filter((item) => item.account_id === activeAccountId), [activeAccountId, conversations]);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    try {
      const [accountResponse, conversationResponse, showcaseResponse] = await Promise.all([
        supabase.from('instagram_accounts').select('id,provider_id,username,display_name,profile_photo_url,settings').eq('is_active', true).order('username'),
        supabase.from('instagram_conversations').select('id,account_id,contact_id,status,priority,tags,last_message_preview,last_message_at,contacts:contact_id(username,display_name,profile_photo_url)').order('last_message_at', { ascending: false }).limit(100),
        supabase.from('instagram_product_showcases').select('id,name,account_id').eq('is_active', true).order('name').limit(100),
      ]);
      if (accountResponse.error) throw accountResponse.error;
      if (conversationResponse.error) throw conversationResponse.error;
      setAccounts((accountResponse.data || []) as InstagramAccount[]);
      setConversations((conversationResponse.data || []) as InstagramConversation[]);
      setShowcases((showcaseResponse.data || []) as ShowcaseOption[]);
      setActiveConversationId((current) => current || String(conversationResponse.data?.[0]?.id || ''));
    } catch (error: any) {
      message.error(error?.message || 'بارگذاری گفتگوهای اینستاگرام انجام نشد.');
    } finally { setLoading(false); }
  }, [message]);

  const loadMessages = useCallback(async () => {
    if (!activeConversationId) { setMessages([]); return; }
    const { data, error } = await supabase
      .from('instagram_messages')
      .select('id,direction,content_text,created_at,message_type')
      .eq('conversation_id', activeConversationId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) { message.error('پیام‌های گفتگو بارگذاری نشد.'); return; }
    setMessages((data || []) as InstagramMessage[]);
  }, [activeConversationId, message]);

  useEffect(() => {
    let mounted = true;
    void Promise.all([
      hasCurrentOrgPlanFeature('instagram_inbox', { defaultEnabled: false }),
      fetchCurrentUserRoleContext(supabase),
    ]).then(([hasFeature, role]) => {
      if (!mounted) return;
      const isSaasAdmin = role?.permissions?.__saas_admin?.view === true || role?.permissions?.__saas_admin?.edit === true;
      setAllowed(Boolean(hasFeature && (isSaasAdmin || role?.permissions?.instagram_conversations?.view === true)));
      setOrgId(String(role?.orgId || ''));
      if (hasFeature && (isSaasAdmin || role?.permissions?.instagram_conversations?.view === true)) void loadInbox();
      else setLoading(false);
    });
    return () => { mounted = false; };
  }, [loadInbox]);

  useEffect(() => { void loadMessages(); }, [loadMessages]);

  useEffect(() => {
    if (!orgId) return;
    const channel = supabase.channel(`instagram-inbox-events-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'instagram_conversations', filter: `org_id=eq.${orgId}` }, () => { void loadInbox(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'instagram_messages', filter: `org_id=eq.${orgId}` }, () => { void loadMessages(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadInbox, loadMessages, orgId]);

  const send = async () => {
    if (!selectedConversation || !draft.trim()) return;
    setSending(true);
    try {
      const buttons = Array.isArray(selectedAccount?.settings?.default_buttons) ? selectedAccount.settings.default_buttons : [];
      const { data, error } = await supabase.functions.invoke('instagram-boxapi', { body: { action: 'send_message', conversationId: selectedConversation.id, message: draft.trim(), buttons: selectedShowcaseId ? [] : buttons, showcaseId: selectedShowcaseId } });
      if (error || data?.success === false) throw new Error(data?.message || error?.message || 'ارسال پیام ناموفق بود.');
      setDraft('');
      setSelectedShowcaseId(undefined);
      await Promise.all([loadMessages(), loadInbox()]);
    } catch (error: any) { message.error(error?.message || 'ارسال پیام انجام نشد.'); }
    finally { setSending(false); }
  };

  if (allowed === false) return <Empty className="mt-24" description="دسترسی به صندوق اینستاگرام برای شما فعال نیست." />;
  if (allowed === null) return <div className="flex h-full items-center justify-center"><Spin /></div>;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-100 text-slate-800 shadow-sm dark:border-white/[0.07] dark:bg-[#101113] dark:text-slate-100" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 bg-white/90 px-4 py-3 backdrop-blur dark:border-white/[0.07] dark:bg-[#17191c]/95">
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(var(--brand-500-rgb),0.10)] text-[rgb(var(--brand-700-rgb))] dark:bg-[rgba(var(--brand-300-rgb),0.12)] dark:text-[rgb(var(--brand-200-rgb))]"><InstagramOutlined /></span><div><div className="font-semibold">صندوق اینستاگرام</div><div className="text-[11px] text-slate-400">دایرکت، کامنت و ویترین‌های پیج‌های متصل</div></div></div>
        <div className="flex flex-wrap items-center gap-1"><Button className={surface === 'direct' ? '!border-[rgba(var(--brand-500-rgb),0.24)] !bg-[rgba(var(--brand-500-rgb),0.10)] !text-[rgb(var(--brand-800-rgb))] dark:!border-[rgba(var(--brand-300-rgb),0.22)] dark:!bg-[rgba(var(--brand-300-rgb),0.12)] dark:!text-[rgb(var(--brand-200-rgb))]' : ''} size="small" type={surface === 'direct' ? 'text' : 'default'} onClick={() => setSurface('direct')}>دایرکت‌ها</Button><Button className={surface === 'comments' ? '!border-[rgba(var(--brand-500-rgb),0.24)] !bg-[rgba(var(--brand-500-rgb),0.10)] !text-[rgb(var(--brand-800-rgb))] dark:!border-[rgba(var(--brand-300-rgb),0.22)] dark:!bg-[rgba(var(--brand-300-rgb),0.12)] dark:!text-[rgb(var(--brand-200-rgb))]' : ''} size="small" type={surface === 'comments' ? 'text' : 'default'} onClick={() => setSurface('comments')}>کامنت‌ها</Button><Tooltip title="به‌روزرسانی گفتگوها"><Button size="small" type="text" shape="circle" icon={<ReloadOutlined />} onClick={() => void loadInbox()} loading={loading} /></Tooltip><Tooltip title="تنظیمات ویترین محصولات"><Button size="small" type="text" shape="circle" icon={<SettingOutlined />} onClick={() => setShowcaseSettingsOpen(true)} /></Tooltip></div>
      </div>
      {surface === 'comments' ? <InstagramCommentsPanel accounts={accounts} activeAccountId={activeAccountId} onAccountChange={setActiveAccountId} /> : <>
      <Tabs className="px-3" activeKey={activeAccountId} onChange={setActiveAccountId} items={[
        { key: 'all', label: `همه (${conversations.length})` },
        ...accounts.map((account) => ({ key: account.id, label: <span className="inline-flex items-center gap-1"><Avatar size={18} src={account.profile_photo_url}>{account.username?.[0]}</Avatar>{account.username}</span> })),
      ]} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[330px_minmax(0,1fr)]">
        <div className="min-h-0 overflow-y-auto border-l border-slate-200/70 bg-slate-50/90 dark:border-white/[0.07] dark:bg-[#131518]">
          <List loading={loading} locale={{ emptyText: 'گفتگویی برای این حساب‌ها ثبت نشده است.' }} dataSource={visibleConversations} renderItem={(item) => {
            const name = item.contacts?.display_name || item.contacts?.username || 'کاربر اینستاگرام';
            const account = accounts.find((entry) => entry.id === item.account_id);
            return <List.Item className={`cursor-pointer border-b-0 px-3 py-3 transition ${item.id === activeConversationId ? 'bg-[rgba(var(--brand-500-rgb),0.10)] dark:bg-[rgba(var(--brand-300-rgb),0.12)]' : 'hover:bg-white/80 dark:hover:bg-white/[0.045]'}`} onClick={() => setActiveConversationId(item.id)}>
              <List.Item.Meta avatar={<Avatar src={item.contacts?.profile_photo_url}>{name[0]}</Avatar>} title={<div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{name}</span><span className="text-[10px] text-slate-400">{formatTime(item.last_message_at)}</span></div>} description={<div><div className="truncate">{item.last_message_preview || 'بدون پیام متنی'}</div><div className="mt-1 flex gap-1">{account ? <Tag className="m-0 !rounded-full !border-[rgba(var(--brand-500-rgb),0.24)] !bg-[rgba(var(--brand-500-rgb),0.10)] !text-[rgb(var(--brand-800-rgb))] dark:!border-[rgba(var(--brand-300-rgb),0.22)] dark:!bg-[rgba(var(--brand-300-rgb),0.12)] dark:!text-[rgb(var(--brand-200-rgb))]">@{account.username}</Tag> : null}{(item.tags || []).slice(0, 2).map((tag) => <Tag key={tag} className="m-0 !rounded-full">{tag}</Tag>)}</div></div>} />
            </List.Item>;
          }} />
        </div>
        <div className="flex min-h-0 flex-col">
          {selectedConversation ? <>
            <div className="flex items-center justify-between border-b border-slate-200/65 bg-white/90 px-4 py-3 dark:border-white/[0.07] dark:bg-[#17191c]/95"><div className="flex items-center gap-2"><Avatar src={selectedConversation.contacts?.profile_photo_url}>{(selectedConversation.contacts?.display_name || selectedConversation.contacts?.username || 'ا')[0]}</Avatar><div><div className="font-medium">{selectedConversation.contacts?.display_name || selectedConversation.contacts?.username || 'کاربر اینستاگرام'}</div><div className="text-xs text-slate-400">گفتگوی اینستاگرام</div></div></div><div className="flex gap-1">{(selectedConversation.tags || []).map((tag) => <Tag key={tag} className="!rounded-full">{tag}</Tag>)}</div></div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[linear-gradient(180deg,rgba(248,250,252,0.94),rgba(241,245,249,0.82))] p-4 dark:bg-none dark:bg-[#101113]">{messages.length ? messages.map((item) => <div key={item.id} className={`flex ${item.direction === 'outbound' ? 'justify-start' : 'justify-end'}`}><div className={`max-w-[78%] rounded-3xl px-3 py-2.5 text-sm shadow-sm ${item.direction === 'outbound' ? 'bg-[rgb(var(--brand-800-rgb))] text-white shadow-[0_18px_42px_rgba(var(--brand-800-rgb),0.34)]' : 'bg-white/85 dark:bg-white/[0.055]'}`}><div className="whitespace-pre-wrap">{item.content_text || 'پیام غیرمتنی'}</div><div className="mt-1 text-[10px] opacity-70">{formatTime(item.created_at)}</div></div></div>) : <Empty description="پیامی برای این گفتگو نیست." />}</div>
            <div className="border-t border-slate-200/55 bg-[rgba(248,250,252,0.78)] px-3 py-2.5 backdrop-blur-xl dark:border-white/[0.06] dark:!bg-[rgba(21,23,26,0.96)]">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Select
                  className="min-w-56"
                  size="small"
                  placeholder="ارسال ویترین محصولات"
                  suffixIcon={<LinkOutlined />}
                  options={showcases.filter((showcase) => !showcase.account_id || showcase.account_id === selectedConversation.account_id).map((showcase) => ({ value: showcase.id, label: showcase.name }))}
                  value={selectedShowcaseId}
                  onChange={(value) => { setSelectedShowcaseId(value); if (!draft.trim()) setDraft('ویترین محصولات را برای شما ارسال می‌کنم.'); }}
                  allowClear
                  onClear={() => setSelectedShowcaseId(undefined)}
                />
                <Tooltip title="BoxAPI در مرجع رسمی فقط متن و دکمه را برای ارسال دایرکت مستند کرده است؛ پیوست و صوت غیرفعال‌اند."><span className="text-xs text-slate-400">متن، دکمه و ویترین</span></Tooltip>
              </div>
              <SharedNoteComposer value={draft} onChange={setDraft} onSubmit={() => void send()} placeholder="پاسخ به دایرکت اینستاگرام..." submitText="ارسال" submitLoading={sending} submitDisabled={sending || !draft.trim()} allowMentions={false} allowAttachments={false} surfaceVariant="omni" />
            </div>
          </> : <Empty className="m-auto" description="یک گفتگو را انتخاب کنید." />}
        </div>
      </div>
      </>}
      <InstagramShowcasesSettingsModal open={showcaseSettingsOpen} onClose={() => setShowcaseSettingsOpen(false)} accounts={accounts.map((account) => ({ id: account.id, username: account.username }))} defaultAccountId={activeAccountId === 'all' ? null : activeAccountId} />
    </div>
  );
};

export default InstagramInboxPage;
