import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Avatar, Button, Empty, List, Select, Spin, Tabs, Tag, Tooltip } from 'antd';
import { ArrowRightOutlined, EditOutlined, HistoryOutlined, InstagramOutlined, LinkOutlined, ReloadOutlined, SettingOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import SharedNoteComposer from '../components/notes/SharedNoteComposer';
import MessageComposerModal from '../components/MessageComposerModal';
import AiReplySuggestionAction from '../components/notifications/messaging/AiReplySuggestionAction';
import { hasCurrentOrgPlanFeature } from '../utils/saasPlanFeatures';
import { fetchCurrentUserRoleContext } from '../utils/permissions';
import InstagramShowcasesSettingsModal from '../components/instagram/InstagramShowcasesSettingsModal';
import InstagramCommentsPanel from '../components/instagram/InstagramCommentsPanel';
import InstagramConversationLinkModal from '../components/instagram/InstagramConversationLinkModal';

type InstagramAccount = { id: string; provider_id: string; username: string; display_name?: string | null; profile_photo_url?: string | null; settings?: { catalog_id?: string | null; default_buttons?: Array<{ title?: string; url?: string }> } | null };
type InstagramConversation = {
  id: string; account_id: string; contact_id: string; status: string; priority: string; tags: string[];
  last_message_preview?: string | null; last_message_at?: string | null; contacts?: { username?: string | null; display_name?: string | null; profile_photo_url?: string | null } | null;
};
type InstagramMessage = { id: string; direction: 'inbound' | 'outbound'; content_text?: string | null; created_at: string; message_type: string; attachment_url?: string | null; attachment_thumbnail_url?: string | null; shared_permalink?: string | null; shared_media_type?: 'post' | 'reel' | 'story' | null; provider_payload?: { automated?: boolean } | null; sender?: { full_name?: string | null; avatar_url?: string | null } | null };
type ShowcaseOption = { id: string; name: string; account_id?: string | null };

const formatTime = (value?: string | null) => value ? new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '';
const formatDateTime = (value?: string | null) => value ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '';
const isVideoUrl = (value?: string | null) => /\.(mp4|mov|m4v|webm)(?:$|[?#])/i.test(String(value || ''));
const isInstagramPermalink = (value?: string | null) => /^https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|reels|stories)\//i.test(String(value || '').trim());
const mediaLabel = (message: InstagramMessage, sharedType?: string | null) => ({ image: 'تصویر', video: 'ویدیو', audio: 'پیام صوتی', file: 'فایل', share: (sharedType || message.shared_media_type) === 'story' ? 'استوری به‌اشتراک‌گذاشته‌شده' : (sharedType || message.shared_media_type) === 'reel' ? 'ریل به‌اشتراک‌گذاشته‌شده' : 'پست به‌اشتراک‌گذاشته‌شده' }[message.message_type] || (sharedType === 'story' ? 'استوری به‌اشتراک‌گذاشته‌شده' : sharedType === 'reel' ? 'ریل به‌اشتراک‌گذاشته‌شده' : sharedType === 'post' ? 'پست به‌اشتراک‌گذاشته‌شده' : 'پیام غیرمتنی'));
const messageMedia = (message: InstagramMessage) => {
  const payload: any = message.provider_payload || {};
  const rawMessage = payload.message || {};
  const attachment = (Array.isArray(rawMessage.attachments) ? rawMessage.attachments : Array.isArray(payload.attachments) ? payload.attachments : [rawMessage.attachment, payload.attachment]).find(Boolean) || {};
  const attachmentPayload = attachment.payload || attachment.data || {};
  const rawUrl = String(message.attachment_url || attachmentPayload.image_url || attachmentPayload.video_url || attachmentPayload.url || attachment.url || rawMessage.image?.url || rawMessage.video?.url || payload.image?.url || payload.video?.url || '').trim();
  const permalink = String(message.shared_permalink || rawMessage.share?.permalink || rawMessage.share?.url || payload.share?.permalink || payload.share?.url || attachmentPayload.permalink || attachmentPayload.url || '').trim();
  const sharedType = message.shared_media_type || (attachmentPayload.reel_video_id ? 'reel' : /\/stories\//i.test(permalink) ? 'story' : /\/reels?\//i.test(permalink) ? 'reel' : isInstagramPermalink(permalink) ? 'post' : null);
  return {
    url: isInstagramPermalink(rawUrl) ? '' : rawUrl,
    thumbnailUrl: String(message.attachment_thumbnail_url || attachmentPayload.thumbnail_url || attachmentPayload.thumbnail || attachment.thumbnail_url || rawMessage.image?.url || payload.image?.url || '').trim(),
    permalink: isInstagramPermalink(permalink) ? permalink : '',
    sharedType,
  };
};

const InstagramInboxPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [orgId, setOrgId] = useState('');
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [conversations, setConversations] = useState<InstagramConversation[]>([]);
  const [messages, setMessages] = useState<InstagramMessage[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [activeAccountId, setActiveAccountId] = useState('all');
  const [activeConversationId, setActiveConversationId] = useState('');
  const [draft, setDraft] = useState('');
  const [showcases, setShowcases] = useState<ShowcaseOption[]>([]);
  const [selectedShowcaseId, setSelectedShowcaseId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [syncingProfiles, setSyncingProfiles] = useState(false);
  const [showcaseSettingsOpen, setShowcaseSettingsOpen] = useState(false);
  const [readyTextOpen, setReadyTextOpen] = useState(false);
  const [suggestingReply, setSuggestingReply] = useState(false);
  const [surface, setSurface] = useState<'direct' | 'comments'>('direct');
  const [mobileConversationListVisible, setMobileConversationListVisible] = useState(true);
  const [conversationLinkOpen, setConversationLinkOpen] = useState(false);

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
    if (!activeConversationId) { setMessages([]); setHasMoreMessages(false); return; }
    const { data, error } = await supabase
      .from('instagram_messages')
      .select('id,direction,content_text,created_at,message_type,attachment_url,attachment_thumbnail_url,shared_permalink,shared_media_type,provider_payload,sender:sent_by(full_name,avatar_url)')
      .eq('conversation_id', activeConversationId)
      .order('created_at', { ascending: false })
      .limit(51);
    if (error) { message.error('پیام‌های گفتگو بارگذاری نشد.'); return; }
    const rows = (data || []) as InstagramMessage[];
    setHasMoreMessages(rows.length > 50);
    setMessages(rows.slice(0, 50).reverse());
  }, [activeConversationId, message]);

  const loadOlderMessages = async () => {
    const oldest = messages[0];
    if (!activeConversationId || !oldest || loadingOlderMessages) return;
    setLoadingOlderMessages(true);
    try {
      const { data, error } = await supabase
        .from('instagram_messages')
        .select('id,direction,content_text,created_at,message_type,attachment_url,attachment_thumbnail_url,shared_permalink,shared_media_type,provider_payload,sender:sent_by(full_name,avatar_url)')
        .eq('conversation_id', activeConversationId)
        .lt('created_at', oldest.created_at)
        .order('created_at', { ascending: false })
        .limit(51);
      if (error) throw error;
      const rows = (data || []) as InstagramMessage[];
      setHasMoreMessages(rows.length > 50);
      setMessages((current) => [...rows.slice(0, 50).reverse(), ...current]);
    } catch (error: any) { message.error(error?.message || 'بارگذاری پیام‌های قدیمی ناموفق بود.'); }
    finally { setLoadingOlderMessages(false); }
  };

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
    let inboxTimer: ReturnType<typeof setTimeout> | undefined;
    let messageTimer: ReturnType<typeof setTimeout> | undefined;
    const queueInboxReload = () => {
      if (inboxTimer) clearTimeout(inboxTimer);
      inboxTimer = setTimeout(() => { void loadInbox(); }, 350);
    };
    const queueMessageReload = () => {
      if (messageTimer) clearTimeout(messageTimer);
      messageTimer = setTimeout(() => { void loadMessages(); }, 150);
    };
    const channel = supabase.channel(`instagram-inbox-events-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'instagram_conversations', filter: `org_id=eq.${orgId}` }, queueInboxReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'instagram_contacts', filter: `org_id=eq.${orgId}` }, queueInboxReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'instagram_messages', filter: `org_id=eq.${orgId}` }, () => { queueMessageReload(); queueInboxReload(); })
      .subscribe();
    return () => {
      if (inboxTimer) clearTimeout(inboxTimer);
      if (messageTimer) clearTimeout(messageTimer);
      supabase.removeChannel(channel);
    };
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
  const syncContactProfiles = async () => {
    setSyncingProfiles(true);
    try {
      const { data, error } = await supabase.functions.invoke('instagram-boxapi', { body: { action: 'sync_contact_profiles' } });
      if (error || data?.success === false) throw new Error(data?.message || error?.message || 'درخواست دریافت نام‌های کاربری ناموفق بود.');
      const queuedCount = Number(data?.queuedCount || 0);
      message.info(queuedCount ? `دریافت نام کاربری ${queuedCount.toLocaleString('fa-IR')} مخاطب درخواست شد؛ نتیجه از طریق وب‌هوک به‌روز می‌شود.` : 'مخاطب بدون نام کاربری برای دریافت وجود ندارد.');
    } catch (error: any) { message.error(error?.message || 'دریافت نام‌های کاربری ناموفق بود.'); }
    finally { setSyncingProfiles(false); }
  };

  const requestReplySuggestion = async (instruction: string) => {
    if (!selectedConversation || messages.length === 0) { message.warning('برای پیشنهاد پاسخ، ابتدا یک پیام دریافت‌شده لازم است.'); return; }
    setSuggestingReply(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          action: 'suggest_reply', channel: 'instagram', instruction: instruction || null,
          context: { route: '/instagram', mode: 'page', moduleId: 'instagram_conversations', recordId: selectedConversation.id, visibleRecordIds: [selectedConversation.id], selectedRecordIds: [selectedConversation.id] },
          recentMessages: messages.slice(-18).map((item, index) => ({ index: index + 1, role: item.direction === 'outbound' ? 'agent' : 'customer', direction: item.direction, author_name: item.direction === 'inbound' ? (selectedConversation.contacts?.display_name || selectedConversation.contacts?.username || 'مخاطب') : (item.sender?.full_name || 'کاربر سازمان'), created_at: item.created_at, text: item.content_text || '' })),
        },
      });
      if (error || !data?.success || !String(data?.suggestedReply || '').trim()) throw new Error(data?.message || error?.message || 'پیشنهاد پاسخ دریافت نشد.');
      setDraft(String(data.suggestedReply).trim());
    } catch (error: any) { message.error(error?.message || 'دریافت پیشنهاد پاسخ هوش مصنوعی ناموفق بود.'); }
    finally { setSuggestingReply(false); }
  };

  if (allowed === false) return <Empty className="mt-24" description="دسترسی به صندوق اینستاگرام برای شما فعال نیست." />;
  if (allowed === null) return <div className="flex h-full items-center justify-center"><Spin /></div>;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-100 text-slate-800 shadow-sm dark:border-white/[0.07] dark:bg-[#101113] dark:text-slate-100" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 bg-white/90 px-4 py-3 backdrop-blur dark:border-white/[0.07] dark:bg-[#17191c]/95">
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(var(--brand-500-rgb),0.10)] text-[rgb(var(--brand-700-rgb))] dark:bg-[rgba(var(--brand-300-rgb),0.12)] dark:text-[rgb(var(--brand-200-rgb))]"><InstagramOutlined /></span><div><div className="font-semibold">صندوق اینستاگرام</div><div className="text-[11px] text-slate-400">دایرکت، کامنت و پیام‌های دکمه‌دار پیج‌های متصل</div></div></div>
        <div className="flex flex-wrap items-center gap-1"><Button className={surface === 'direct' ? '!border-[rgba(var(--brand-500-rgb),0.24)] !bg-[rgba(var(--brand-500-rgb),0.10)] !text-[rgb(var(--brand-800-rgb))] dark:!border-[rgba(var(--brand-300-rgb),0.22)] dark:!bg-[rgba(var(--brand-300-rgb),0.12)] dark:!text-[rgb(var(--brand-200-rgb))]' : ''} size="small" type={surface === 'direct' ? 'text' : 'default'} onClick={() => setSurface('direct')}>دایرکت‌ها</Button><Button className={surface === 'comments' ? '!border-[rgba(var(--brand-500-rgb),0.24)] !bg-[rgba(var(--brand-500-rgb),0.10)] !text-[rgb(var(--brand-800-rgb))] dark:!border-[rgba(var(--brand-300-rgb),0.22)] dark:!bg-[rgba(var(--brand-300-rgb),0.12)] dark:!text-[rgb(var(--brand-200-rgb))]' : ''} size="small" type={surface === 'comments' ? 'text' : 'default'} onClick={() => setSurface('comments')}>کامنت‌ها</Button>{surface === 'direct' ? <Tooltip title="دریافت نام‌های کاربری مخاطبانِ بدون نام"><Button size="small" type="text" onClick={() => void syncContactProfiles()} loading={syncingProfiles}>نام‌های کاربری</Button></Tooltip> : null}<Tooltip title="به‌روزرسانی گفتگوها"><Button size="small" type="text" shape="circle" icon={<ReloadOutlined />} onClick={() => void loadInbox()} loading={loading} /></Tooltip><Tooltip title="تنظیمات پیام‌های دکمه‌دار"><Button size="small" type="text" shape="circle" icon={<SettingOutlined />} onClick={() => setShowcaseSettingsOpen(true)} /></Tooltip></div>
      </div>
      {surface === 'comments' ? <InstagramCommentsPanel orgId={orgId} accounts={accounts} activeAccountId={activeAccountId} onAccountChange={setActiveAccountId} /> : <>
      <Tabs className="px-3" activeKey={activeAccountId} onChange={setActiveAccountId} items={[
        { key: 'all', label: `همه (${conversations.length})` },
        ...accounts.map((account) => ({ key: account.id, label: <span className="inline-flex items-center gap-1"><Avatar size={18} src={account.profile_photo_url}>{account.username?.[0]}</Avatar>{account.username}</span> })),
      ]} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[330px_minmax(0,1fr)]">
        <div className={`${mobileConversationListVisible ? 'block' : 'hidden'} min-h-0 overflow-y-auto border-l border-slate-200/70 bg-slate-50/90 dark:border-white/[0.07] dark:bg-[#131518] lg:block`}>
          <List loading={loading} locale={{ emptyText: 'گفتگویی برای این حساب‌ها ثبت نشده است.' }} dataSource={visibleConversations} renderItem={(item) => {
            const username = String(item.contacts?.username || '').replace(/^@+/, '');
            const name = username ? `@${username}` : item.contacts?.display_name || 'کاربر اینستاگرام';
            const account = accounts.find((entry) => entry.id === item.account_id);
            return <List.Item className={`mx-2 my-1 cursor-pointer rounded-2xl border-b-0 px-4 py-3.5 transition ${item.id === activeConversationId ? 'bg-[rgba(var(--brand-500-rgb),0.10)] shadow-sm dark:bg-[rgba(var(--brand-300-rgb),0.12)]' : 'hover:bg-white/80 dark:hover:bg-white/[0.045]'}`} onClick={() => { setActiveConversationId(item.id); setMobileConversationListVisible(false); }}>
              <List.Item.Meta className="!items-center" avatar={<Avatar size={44} src={item.contacts?.profile_photo_url}>{name[0]}</Avatar>} title={<div className="flex items-center justify-between gap-3"><span className="truncate font-medium">{name}</span><span className="shrink-0 text-[10px] text-slate-400">{formatTime(item.last_message_at)}</span></div>} description={<div className="pt-0.5"><div className="truncate">{item.last_message_preview || 'بدون پیام متنی'}</div><div className="mt-1.5 flex gap-1">{account ? <Tag className="m-0 !rounded-full !border-[rgba(var(--brand-500-rgb),0.24)] !bg-[rgba(var(--brand-500-rgb),0.10)] !text-[rgb(var(--brand-800-rgb))] dark:!border-[rgba(var(--brand-300-rgb),0.22)] dark:!bg-[rgba(var(--brand-300-rgb),0.12)] dark:!text-[rgb(var(--brand-200-rgb))]">@{account.username}</Tag> : null}{(item.tags || []).slice(0, 2).map((tag) => <Tag key={tag} className="m-0 !rounded-full">{tag}</Tag>)}</div></div>} />
            </List.Item>;
          }} />
        </div>
        <div className={`${mobileConversationListVisible ? 'hidden' : 'flex'} min-h-0 flex-col lg:flex`}>
          {selectedConversation ? <>
            <div className="flex items-center justify-between border-b border-slate-200/65 bg-white/90 px-4 py-3 dark:border-white/[0.07] dark:bg-[#17191c]/95"><div className="flex items-center gap-2"><Button className="lg:hidden" type="text" size="small" shape="circle" icon={<ArrowRightOutlined />} onClick={() => setMobileConversationListVisible(true)} /><Avatar src={selectedConversation.contacts?.profile_photo_url}>{(selectedConversation.contacts?.username || selectedConversation.contacts?.display_name || 'ا')[0]}</Avatar><div><div className="font-medium">{selectedConversation.contacts?.username ? `@${selectedConversation.contacts.username}` : selectedConversation.contacts?.display_name || 'کاربر اینستاگرام'}</div><div className="text-xs text-slate-400">گفتگوی اینستاگرام</div></div></div><div className="flex gap-1"><Tooltip title="گردش‌کارها و پاسخ‌گویی خودکار"><Button size="small" type="text" shape="circle" icon={<ThunderboltOutlined />} onClick={() => navigate('/settings?tab=workflows')} /></Tooltip><Tooltip title="ویرایش اتصال مخاطب"><Button size="small" type="text" shape="circle" icon={<EditOutlined />} onClick={() => setConversationLinkOpen(true)} /></Tooltip>{(selectedConversation.tags || []).map((tag) => <Tag key={tag} className="!rounded-full">{tag}</Tag>)}</div></div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[linear-gradient(180deg,rgba(248,250,252,0.94),rgba(241,245,249,0.82))] p-4 dark:bg-none dark:bg-[#101113]">{hasMoreMessages ? <div className="flex justify-center"><Button size="small" icon={<HistoryOutlined />} loading={loadingOlderMessages} onClick={() => void loadOlderMessages()}>مشاهده پیام‌های بیشتر</Button></div> : null}{messages.length ? messages.map((item) => { const outbound = item.direction === 'outbound'; const authorName = outbound ? (item.provider_payload?.automated ? 'سیستم' : item.sender?.full_name || 'کاربر سازمان') : (selectedConversation.contacts?.username ? `@${selectedConversation.contacts.username}` : selectedConversation.contacts?.display_name || 'کاربر اینستاگرام'); const authorAvatar = outbound ? item.sender?.avatar_url : selectedConversation.contacts?.profile_photo_url; const media = messageMedia(item); return <div key={item.id} className={`flex items-end gap-2 ${outbound ? 'justify-start' : 'justify-end'}`}><div className={`max-w-[78%] rounded-3xl px-3 py-2.5 text-sm shadow-sm ${outbound ? 'bg-[rgb(var(--brand-800-rgb))] text-white shadow-[0_18px_42px_rgba(var(--brand-800-rgb),0.34)]' : 'bg-white/85 dark:bg-white/[0.055]'}`}><div className="mb-1 flex items-center gap-1 text-[10px] opacity-80"><span>{authorName}</span>{item.provider_payload?.automated ? <Tag className="m-0 !border-white/25 !bg-white/15 !text-[10px] !text-white">پیام خودکار</Tag> : null}</div>{item.content_text ? <div className="whitespace-pre-wrap">{item.content_text}</div> : null}{media.url ? (isVideoUrl(media.url) ? <video className="mt-2 max-h-64 w-full rounded-2xl object-cover" controls preload="metadata" src={media.url} /> : <img className="mt-2 max-h-64 w-full rounded-2xl object-cover" src={media.thumbnailUrl || media.url} alt={mediaLabel(item, media.sharedType)} loading="lazy" />) : null}{media.permalink ? <a className="mt-2 inline-flex rounded-xl border border-current/20 px-2.5 py-1 text-xs underline-offset-2 hover:underline" href={media.permalink} target="_blank" rel="noreferrer">{mediaLabel(item, media.sharedType)}</a> : !item.content_text ? <div className="text-sm">{mediaLabel(item, media.sharedType)}</div> : null}<div className="mt-1 text-[10px] opacity-70">{formatDateTime(item.created_at)}</div></div><Avatar size={28} src={authorAvatar}>{authorName[0]}</Avatar></div>; }) : <Empty description="پیامی برای این گفتگو نیست." />}</div>
            <div className="border-t border-slate-200/55 bg-[rgba(248,250,252,0.78)] px-3 py-2.5 backdrop-blur-xl dark:border-white/[0.06] dark:!bg-[rgba(21,23,26,0.96)]">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Select
                  className="min-w-56"
                  size="small"
                  placeholder="ارسال پیام دکمه‌دار"
                  suffixIcon={<LinkOutlined />}
                  options={showcases.filter((showcase) => !showcase.account_id || showcase.account_id === selectedConversation.account_id).map((showcase) => ({ value: showcase.id, label: showcase.name }))}
                  value={selectedShowcaseId}
                  onChange={(value) => { setSelectedShowcaseId(value); if (!draft.trim()) setDraft('اطلاعات موردنظر را برای شما ارسال می‌کنم.'); }}
                  allowClear
                  onClear={() => setSelectedShowcaseId(undefined)}
                />
                <Tooltip title="سرویس‌دهندهٔ فعال فقط متن و حداکثر سه دکمه را برای ارسال دایرکت مستند کرده است؛ پیوست و صوت غیرفعال‌اند."><span className="text-xs text-slate-400">متن و دکمه</span></Tooltip>
              </div>
              <SharedNoteComposer value={draft} onChange={setDraft} onSubmit={() => void send()} placeholder="پاسخ به دایرکت اینستاگرام..." submitText="ارسال" submitLoading={sending} submitDisabled={sending || !draft.trim()} allowMentions={false} allowAttachments={false} surfaceVariant="omni" extraActions={<><Button type="text" size="small" shape="circle" icon={<HistoryOutlined />} title="پیام‌های آماده" onClick={() => setReadyTextOpen(true)} /><AiReplySuggestionAction disabled={!selectedConversation} loading={suggestingReply} onSubmit={requestReplySuggestion} /></>} />
            </div>
          </> : <Empty className="m-auto" description="یک گفتگو را انتخاب کنید." />}
        </div>
      </div>
      </>}
      <InstagramShowcasesSettingsModal open={showcaseSettingsOpen} onClose={() => setShowcaseSettingsOpen(false)} accounts={accounts.map((account) => ({ id: account.id, username: account.username }))} defaultAccountId={activeAccountId === 'all' ? null : activeAccountId} />
      <MessageComposerModal open={readyTextOpen} onCancel={() => setReadyTextOpen(false)} mode="template" moduleId="instagram_conversations" templateOnlyTitle="پیام‌های آماده اینستاگرام" onApplyTemplate={(value) => { setDraft((current) => `${current}${current ? '\n' : ''}${value}`); setReadyTextOpen(false); }} />
      <InstagramConversationLinkModal open={conversationLinkOpen} conversationId={selectedConversation?.id || null} contactName={selectedConversation?.contacts?.display_name || selectedConversation?.contacts?.username || null} onClose={() => setConversationLinkOpen(false)} onSaved={loadInbox} />
    </div>
  );
};

export default InstagramInboxPage;
