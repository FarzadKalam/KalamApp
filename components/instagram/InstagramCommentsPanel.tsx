import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Avatar, Button, Empty, Image, Input, List, Spin, Tag } from 'antd';
import { CommentOutlined, PlayCircleOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { buildImagePreviewUrl } from '../../utils/imagePreview';
import InstagramStoryConditionsPanel from './InstagramStoryConditionsPanel';
import MessageComposerModal from '../MessageComposerModal';
import AiReplySuggestionAction from '../notifications/messaging/AiReplySuggestionAction';

type Account = { id: string; provider_id: string; username: string; display_name?: string | null; profile_photo_url?: string | null };
type Media = { id: string; account_id: string; media_type: 'post' | 'reel' | 'story'; caption?: string | null; media_url?: string | null; thumbnail_url?: string | null; permalink?: string | null; published_at?: string | null };
type Comment = { id: string; media_id: string; author_username?: string | null; author_name?: string | null; author_profile_photo_url?: string | null; content_text: string; like_count: number; commented_at?: string | null; direction?: 'inbound' | 'outbound'; provider_payload?: { automated?: boolean } | null; sender?: { full_name?: string | null; avatar_url?: string | null } | null };
type Interaction = { id: string; comment_id?: string | null };
type Queue = { record_id: string; status: string };
type WorkflowLog = { record_id: string; status: string };
type WorkflowStatus = { label: string; color: string };

const dateText = (value?: string | null) => value ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '';
const MEDIA_PAGE_SIZE = 24;
const isVideoUrl = (value?: string | null) => /\.(mp4|mov|m4v|webm)(?:$|[?#])/i.test(String(value || ''));
const mediaPreviewUrl = (media: Media) => {
  const source = media.thumbnail_url || media.media_url || '';
  return isVideoUrl(source) ? '' : buildImagePreviewUrl(source, 'thumb');
};

const InstagramCommentsPanel: React.FC<{ orgId: string; accounts: Account[]; activeAccountId: string; onAccountChange: (id: string) => void }> = ({ orgId, accounts, activeAccountId, onAccountChange }) => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [media, setMedia] = useState<Media[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentStatuses, setCommentStatuses] = useState<Record<string, WorkflowStatus>>({});
  const [selectedMediaId, setSelectedMediaId] = useState('');
  const [replyByCommentId, setReplyByCommentId] = useState<Record<string, string>>({});
  const [readyTextTargetCommentId, setReadyTextTargetCommentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingCommentId, setSendingCommentId] = useState<string | null>(null);
  const [suggestingCommentId, setSuggestingCommentId] = useState<string | null>(null);
  const [syncingAccountIds, setSyncingAccountIds] = useState<string[]>([]);
  const automaticallyRequestedAccountIds = useRef(new Set<string>());

  const visibleMedia = useMemo(() => activeAccountId === 'all' ? media : media.filter((item) => item.account_id === activeAccountId), [activeAccountId, media]);
  const posts = useMemo(() => visibleMedia.filter((item) => item.media_type !== 'story'), [visibleMedia]);
  const selectedMedia = useMemo(() => media.find((item) => item.id === selectedMediaId) || null, [media, selectedMediaId]);
  const visibleComments = useMemo(() => comments.filter((item) => item.media_id === selectedMediaId), [comments, selectedMediaId]);

  const loadWorkflowStatuses = useCallback(async (nextComments: Comment[]) => {
    const commentIds = nextComments.map((item) => item.id);
    if (!commentIds.length) { setCommentStatuses({}); return; }
    const interactionsResult = await supabase.from('instagram_interaction_events').select('id,comment_id').eq('event_type', 'comment_received').in('comment_id', commentIds).limit(80);
    if (interactionsResult.error) throw interactionsResult.error;
    const interactions = (interactionsResult.data || []) as Interaction[];
    const interactionIds = interactions.map((item) => item.id);
    const statuses: Record<string, WorkflowStatus> = {};
    for (const commentId of commentIds) statuses[commentId] = { label: 'پیش از اتصال / بدون رویداد', color: 'default' };
    if (!interactionIds.length) { setCommentStatuses(statuses); return; }
    const [queueResult, logsResult] = await Promise.all([
      supabase.from('workflow_event_queue').select('record_id,status').eq('source_table', 'instagram_interaction_events').in('record_id', interactionIds).limit(80),
      supabase.from('workflow_logs').select('record_id,status').eq('module_id', 'instagram_interaction_events').in('record_id', interactionIds).order('created_at', { ascending: false }).limit(80),
    ]);
    if (queueResult.error) throw queueResult.error;
    if (logsResult.error) throw logsResult.error;
    const queues = (queueResult.data || []) as Queue[];
    const logs = (logsResult.data || []) as WorkflowLog[];
    for (const interaction of interactions) {
      if (!interaction.comment_id) continue;
      const log = logs.find((item) => item.record_id === interaction.id);
      const queue = queues.find((item) => item.record_id === interaction.id);
      statuses[interaction.comment_id] = log
        ? { label: log.status === 'success' ? 'شرط اجرا شد' : log.status === 'failed' ? 'خطای اجرا' : 'شرط ثبت شد', color: log.status === 'failed' ? 'error' : 'success' }
        : queue?.status === 'pending' || queue?.status === 'processing'
          ? { label: 'در صف بررسی', color: 'processing' }
          : queue?.status === 'failed'
            ? { label: 'خطای بررسی', color: 'error' }
            : { label: 'شرطی منطبق نشد', color: 'default' };
    }
    setCommentStatuses(statuses);
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [mediaResult, commentsResult] = await Promise.all([
        supabase.from('instagram_social_media').select('id,account_id,media_type,caption,media_url,thumbnail_url,permalink,published_at').order('published_at', { ascending: false }).limit(MEDIA_PAGE_SIZE),
        supabase.from('instagram_comments').select('id,media_id,author_username,author_name,author_profile_photo_url,content_text,like_count,commented_at,direction,provider_payload,sender:sent_by(full_name,avatar_url)').order('commented_at', { ascending: false }).limit(80),
      ]);
      if (mediaResult.error) throw mediaResult.error;
      if (commentsResult.error) throw commentsResult.error;
      const nextComments = (commentsResult.data || []) as Comment[];
      setMedia((mediaResult.data || []) as Media[]);
      setComments(nextComments);
      setSelectedMediaId((current) => current || String(mediaResult.data?.find((item: any) => item.media_type !== 'story')?.id || ''));
      await loadWorkflowStatuses(nextComments);
    } catch (error: any) { message.error(error?.message || 'پست‌ها و کامنت‌ها بارگذاری نشدند.'); }
    finally { if (!silent) setLoading(false); }
  }, [loadWorkflowStatuses, message]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!orgId) return;
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;
    const queueReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => { void load(true); }, 500);
    };
    const channel = supabase.channel(`instagram-comments-events-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'instagram_social_media', filter: `org_id=eq.${orgId}` }, queueReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'instagram_comments', filter: `org_id=eq.${orgId}` }, queueReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_event_queue', filter: `org_id=eq.${orgId}` }, queueReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_logs', filter: `org_id=eq.${orgId}` }, queueReload)
      .subscribe();
    return () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      supabase.removeChannel(channel);
    };
  }, [load, orgId]);

  const syncAccountPosts = useCallback(async (account: Account, automatic = false) => {
    setSyncingAccountIds((current) => current.includes(account.id) ? current : [...current, account.id]);
    try {
      const { data, error } = await supabase.functions.invoke('instagram-boxapi', { body: { action: 'sync_posts', providerId: account.provider_id, accountId: account.id, automatic } });
      if (error || data?.success === false) throw new Error(data?.message || error?.message || 'درخواست دریافت پست ناموفق بود.');
      if (!automatic && data?.queued !== false) message.info('درخواست دریافت پست ثبت شد؛ نتیجه پس از وب‌هوک در همین صفحه نمایش داده می‌شود.');
    } catch (error: any) {
      if (!automatic) message.error(error?.message || 'دریافت پست‌ها ناموفق بود.');
    } finally { setSyncingAccountIds((current) => current.filter((id) => id !== account.id)); }
  }, [message]);
  const syncPosts = async () => {
    const targets = activeAccountId === 'all' ? accounts : accounts.filter((account) => account.id === activeAccountId);
    if (!targets.length) {
      message.warning('ابتدا یک پیج متصل انتخاب کنید.');
      return;
    }
    await Promise.all(targets.map((account) => syncAccountPosts(account)));
  };
  useEffect(() => {
    const targets = (activeAccountId === 'all' ? accounts : accounts.filter((account) => account.id === activeAccountId)).slice(0, 10);
    for (const account of targets) {
      if (automaticallyRequestedAccountIds.current.has(account.id)) continue;
      automaticallyRequestedAccountIds.current.add(account.id);
      void syncAccountPosts(account, true);
    }
  }, [accounts, activeAccountId, syncAccountPosts]);
  const replyToComment = async (comment: Comment) => {
    const reply = String(replyByCommentId[comment.id] || '').trim();
    if (!reply) return;
    setSendingCommentId(comment.id);
    try {
      const { data, error } = await supabase.functions.invoke('instagram-boxapi', { body: { action: 'reply_comment', commentId: comment.id, message: reply } });
      if (error || data?.success === false) throw new Error(data?.message || error?.message || 'ارسال پاسخ ناموفق بود.');
      setReplyByCommentId((current) => ({ ...current, [comment.id]: '' })); await load(); message.success('پاسخ کامنت ارسال شد.');
    } catch (error: any) { message.error(error?.message || 'پاسخ کامنت ارسال نشد.'); }
    finally { setSendingCommentId(null); }
  };
  const requestReplySuggestion = async (comment: Comment, instruction: string) => {
    setSuggestingCommentId(comment.id);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          action: 'suggest_reply', channel: 'instagram', instruction: instruction || null,
          context: { route: '/instagram', mode: 'comment', moduleId: 'instagram_comments', recordId: comment.id, visibleRecordIds: [comment.id], selectedRecordIds: [comment.id] },
          recentMessages: [{ index: 1, role: 'customer', direction: 'inbound', author_name: comment.author_name || comment.author_username || 'کاربر اینستاگرام', created_at: comment.commented_at, text: comment.content_text }],
        },
      });
      if (error || !data?.success || !String(data?.suggestedReply || '').trim()) throw new Error(data?.message || error?.message || 'پیشنهاد پاسخ دریافت نشد.');
      setReplyByCommentId((current) => ({ ...current, [comment.id]: String(data.suggestedReply).trim() }));
    } catch (error: any) { message.error(error?.message || 'دریافت پیشنهاد پاسخ هوش مصنوعی ناموفق بود.'); }
    finally { setSuggestingCommentId(null); }
  };
  const openMediaWorkflow = () => {
    if (!selectedMedia?.permalink) {
      message.warning('برای ساخت گردش‌کار اختصاصی، ابتدا این پست باید لینک رسمی داشته باشد.');
      return;
    }
    const params = new URLSearchParams({ tab: 'workflows', instagramMediaPermalink: selectedMedia.permalink, instagramMediaType: selectedMedia.media_type, instagramMediaLabel: selectedMedia.caption?.slice(0, 45) || 'پست' });
    navigate(`/settings?${params.toString()}`);
  };

  return <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
    <aside className="min-h-0 overflow-y-auto border-l border-slate-200/70 bg-slate-50/90 p-3 dark:border-white/[0.07] dark:bg-[#131518]"><div className="mb-3 text-sm font-semibold">پیج‌های متصل</div><button type="button" onClick={() => onAccountChange('all')} className={`mb-1 w-full rounded-xl px-2 py-2 text-right text-sm transition ${activeAccountId === 'all' ? 'bg-[rgba(var(--brand-500-rgb),0.10)] text-[rgb(var(--brand-800-rgb))] dark:bg-[rgba(var(--brand-300-rgb),0.12)] dark:text-[rgb(var(--brand-200-rgb))]' : 'hover:bg-white/80 dark:hover:bg-white/[0.045]'}`}>همه پیج‌ها</button>{accounts.map((account) => <button key={account.id} type="button" onClick={() => onAccountChange(account.id)} className={`mb-1 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-right text-sm transition ${activeAccountId === account.id ? 'bg-[rgba(var(--brand-500-rgb),0.10)] text-[rgb(var(--brand-800-rgb))] dark:bg-[rgba(var(--brand-300-rgb),0.12)] dark:text-[rgb(var(--brand-200-rgb))]' : 'hover:bg-white/80 dark:hover:bg-white/[0.045]'}`}><Avatar size={28} src={account.profile_photo_url}>{account.username?.[0]}</Avatar><span className="truncate">@{account.username}</span></button>)}</aside>
    <section className="min-h-0 overflow-y-auto bg-[linear-gradient(180deg,rgba(248,250,252,0.94),rgba(241,245,249,0.82))] p-4 dark:bg-none dark:bg-[#101113]">
      <div className="mb-4 flex items-center justify-between"><div><div className="font-semibold">پست‌ها و کامنت‌ها</div><div className="mt-0.5 text-[11px] text-slate-400">نمایش آخرین {MEDIA_PAGE_SIZE.toLocaleString('fa-IR')} رسانه برای سرعت بیشتر</div></div><Button size="small" icon={<ReloadOutlined />} loading={syncingAccountIds.length > 0} onClick={() => void syncPosts()}>دریافت پست‌ها</Button></div>
      {loading ? <div className="flex justify-center py-16"><Spin /></div> : <>
        <InstagramStoryConditionsPanel orgId={orgId} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{posts.map((post) => { const previewUrl = mediaPreviewUrl(post); const isVideo = isVideoUrl(post.media_url) && !post.thumbnail_url; return <button type="button" key={post.id} className={`overflow-hidden rounded-2xl border text-right transition ${selectedMediaId === post.id ? 'border-[rgba(var(--brand-500-rgb),0.55)] ring-2 ring-[rgba(var(--brand-500-rgb),0.18)] dark:border-[rgba(var(--brand-300-rgb),0.45)]' : 'border-slate-200 dark:border-white/10'}`} onClick={() => setSelectedMediaId(post.id)}>{previewUrl ? <Image preview={false} src={previewUrl} height={150} className="w-full object-cover" /> : <div className="flex h-36 flex-col items-center justify-center gap-1 bg-slate-100 text-slate-400 dark:bg-white/[0.05]"><PlayCircleOutlined className="text-xl" /><span className="text-xs">{isVideo ? 'ویدئو بدون کاور' : 'بدون تصویر'}</span></div>}<div className="bg-white/85 p-2 text-xs dark:bg-white/[0.055]"><div className="line-clamp-2">{post.caption || 'بدون کپشن'}</div></div></button>; })}</div>
        {posts.length === 0 ? <Empty className="mt-6" description="درخواست دریافت پست به‌صورت خودکار ارسال می‌شود؛ نتیجه پس از وب‌هوک در همین صفحه نمایش داده می‌شود." /> : null}
        {selectedMedia ? <div className="mt-6 rounded-2xl border border-slate-200/70 bg-white/85 p-3 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.045]"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><CommentOutlined className="text-[rgb(var(--brand-700-rgb))] dark:text-[rgb(var(--brand-200-rgb))]" /><span className="font-medium">کامنت‌های پست انتخاب‌شده</span></div><Button size="small" disabled={!selectedMedia.permalink} onClick={openMediaWorkflow}>گردش‌کار این پست</Button></div><List locale={{ emptyText: 'کامنتی برای این پست دریافت نشده است.' }} dataSource={visibleComments} renderItem={(comment) => { const status = commentStatuses[comment.id]; const outbound = comment.direction === 'outbound'; const author = outbound ? (comment.sender?.full_name || 'پاسخ شما') : (comment.author_name || (comment.author_username ? `@${comment.author_username}` : 'کاربر اینستاگرام')); return <List.Item className="block"><div className={`flex gap-2 ${outbound ? 'flex-row-reverse' : ''}`}><Avatar src={outbound ? comment.sender?.avatar_url : comment.author_profile_photo_url}>{author[0]}</Avatar><div className={`min-w-0 flex-1 ${outbound ? 'text-left' : ''}`}><div className="text-sm font-medium">{author}</div><div className="mt-1 whitespace-pre-wrap text-sm">{comment.content_text}</div><div className={`mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400 ${outbound ? 'justify-end' : ''}`}><span>{dateText(comment.commented_at)}</span>{outbound ? <><Tag color="blue">پاسخ ارسال‌شده</Tag>{comment.provider_payload?.automated ? <Tag color="purple">پیام خودکار</Tag> : null}</> : status ? <Tag color={status.color}>{status.label}</Tag> : null}</div>{!outbound ? <div className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-white/[0.08] dark:bg-white/[0.035]"><Input.TextArea autoSize={{ minRows: 3, maxRows: 7 }} value={replyByCommentId[comment.id] || ''} onChange={(event) => setReplyByCommentId((current) => ({ ...current, [comment.id]: event.target.value }))} placeholder="پاسخ به این کامنت..." /><div className="mt-2 flex items-center justify-between"><div className="flex items-center gap-1"><Button size="small" type="text" onClick={() => setReadyTextTargetCommentId(comment.id)}>پیام‌های آماده</Button><AiReplySuggestionAction disabled={Boolean(sendingCommentId)} loading={suggestingCommentId === comment.id} onSubmit={(instruction) => requestReplySuggestion(comment, instruction)} /></div><Button size="small" type="primary" icon={<SendOutlined />} loading={sendingCommentId === comment.id} onClick={() => void replyToComment(comment)}>ارسال پاسخ</Button></div></div> : null}</div></div></List.Item>; }} /></div> : null}
      </>}
    </section>
    <MessageComposerModal open={Boolean(readyTextTargetCommentId)} onCancel={() => setReadyTextTargetCommentId(null)} mode="template" moduleId="instagram_conversations" templateOnlyTitle="پیام‌های آماده اینستاگرام" onApplyTemplate={(value) => { if (readyTextTargetCommentId) setReplyByCommentId((current) => ({ ...current, [readyTextTargetCommentId]: `${current[readyTextTargetCommentId] || ''}${current[readyTextTargetCommentId] ? '\n' : ''}${value}` })); setReadyTextTargetCommentId(null); }} />
  </div>;
};

export default InstagramCommentsPanel;
