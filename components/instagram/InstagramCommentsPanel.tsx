import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Avatar, Button, Empty, Image, Input, List, Spin, Tag } from 'antd';
import { CommentOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';

type Account = { id: string; provider_id: string; username: string; display_name?: string | null; profile_photo_url?: string | null };
type Media = { id: string; account_id: string; media_type: 'post' | 'reel' | 'story'; caption?: string | null; media_url?: string | null; thumbnail_url?: string | null; permalink?: string | null; metrics?: { like_count?: number; comments_count?: number } | null; published_at?: string | null };
type Comment = { id: string; media_id: string; author_username?: string | null; author_name?: string | null; author_profile_photo_url?: string | null; content_text: string; like_count: number; status: string; commented_at?: string | null; tags?: string[] };

const dateText = (value?: string | null) => value ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '';

const InstagramCommentsPanel: React.FC<{ orgId: string; accounts: Account[]; activeAccountId: string; onAccountChange: (id: string) => void }> = ({ orgId, accounts, activeAccountId, onAccountChange }) => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [media, setMedia] = useState<Media[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [selectedMediaId, setSelectedMediaId] = useState('');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const visibleMedia = useMemo(() => activeAccountId === 'all' ? media : media.filter((item) => item.account_id === activeAccountId), [activeAccountId, media]);
  const stories = useMemo(() => visibleMedia.filter((item) => item.media_type === 'story'), [visibleMedia]);
  const posts = useMemo(() => visibleMedia.filter((item) => item.media_type !== 'story'), [visibleMedia]);
  const selectedMedia = useMemo(() => media.find((item) => item.id === selectedMediaId) || null, [media, selectedMediaId]);
  const visibleComments = useMemo(() => comments.filter((item) => item.media_id === selectedMediaId), [comments, selectedMediaId]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [mediaResult, commentsResult] = await Promise.all([
        supabase.from('instagram_social_media').select('id,account_id,media_type,caption,media_url,thumbnail_url,permalink,metrics,published_at').order('published_at', { ascending: false }).limit(200),
        supabase.from('instagram_comments').select('id,media_id,author_username,author_name,author_profile_photo_url,content_text,like_count,status,commented_at,tags').order('commented_at', { ascending: false }).limit(500),
      ]);
      if (mediaResult.error) throw mediaResult.error;
      if (commentsResult.error) throw commentsResult.error;
      setMedia((mediaResult.data || []) as Media[]);
      setComments((commentsResult.data || []) as Comment[]);
      setSelectedMediaId((current) => current || String(mediaResult.data?.find((item: any) => item.media_type !== 'story')?.id || ''));
    } catch (error: any) { message.error(error?.message || 'پست‌ها و کامنت‌ها بارگذاری نشدند.'); }
    finally { if (!silent) setLoading(false); }
  }, [message]);
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
      .subscribe();
    return () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      supabase.removeChannel(channel);
    };
  }, [load, orgId]);

  const syncPosts = async () => {
    const account = accounts.find((item) => item.id === activeAccountId) || (activeAccountId === 'all' ? accounts[0] : null);
    if (!account) return message.warning('ابتدا یک پیج متصل انتخاب کنید.');
    try {
      const { data, error } = await supabase.functions.invoke('instagram-boxapi', { body: { action: 'sync_posts', providerId: account.provider_id, accountId: account.id } });
      if (error || data?.success === false) throw new Error(data?.message || error?.message || 'درخواست دریافت پست ناموفق بود.');
      message.info('درخواست دریافت پست ثبت شد؛ نتیجه پس از Webhook در همین صفحه نمایش داده می‌شود.');
    } catch (error: any) { message.error(error?.message || 'دریافت پست‌ها ناموفق بود.'); }
  };
  const replyToComment = async (comment: Comment) => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('instagram-boxapi', { body: { action: 'reply_comment', commentId: comment.id, message: reply.trim() } });
      if (error || data?.success === false) throw new Error(data?.message || error?.message || 'ارسال پاسخ ناموفق بود.');
      setReply(''); await load(); message.success('پاسخ کامنت ارسال شد.');
    } catch (error: any) { message.error(error?.message || 'پاسخ کامنت ارسال نشد.'); }
    finally { setSending(false); }
  };

  const openMediaWorkflow = () => {
    if (!selectedMedia?.permalink) return message.warning('برای ساخت گردش‌کار اختصاصی، ابتدا این پست یا استوری باید لینک رسمی داشته باشد.');
    const params = new URLSearchParams({ tab: 'workflows', instagramMediaPermalink: selectedMedia.permalink, instagramMediaType: selectedMedia.media_type, instagramMediaLabel: selectedMedia.caption?.slice(0, 45) || (selectedMedia.media_type === 'story' ? 'استوری' : 'پست') });
    navigate(`/settings?${params.toString()}`);
  };

  return <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
    <aside className="min-h-0 overflow-y-auto border-l border-slate-200/70 bg-slate-50/90 p-3 dark:border-white/[0.07] dark:bg-[#131518]"><div className="mb-3 text-sm font-semibold">پیج‌های متصل</div><button type="button" onClick={() => onAccountChange('all')} className={`mb-1 w-full rounded-xl px-2 py-2 text-right text-sm transition ${activeAccountId === 'all' ? 'bg-[rgba(var(--brand-500-rgb),0.10)] text-[rgb(var(--brand-800-rgb))] dark:bg-[rgba(var(--brand-300-rgb),0.12)] dark:text-[rgb(var(--brand-200-rgb))]' : 'hover:bg-white/80 dark:hover:bg-white/[0.045]'}`}>همه پیج‌ها</button>{accounts.map((account) => <button key={account.id} type="button" onClick={() => onAccountChange(account.id)} className={`mb-1 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-right text-sm transition ${activeAccountId === account.id ? 'bg-[rgba(var(--brand-500-rgb),0.10)] text-[rgb(var(--brand-800-rgb))] dark:bg-[rgba(var(--brand-300-rgb),0.12)] dark:text-[rgb(var(--brand-200-rgb))]' : 'hover:bg-white/80 dark:hover:bg-white/[0.045]'}`}><Avatar size={28} src={account.profile_photo_url}>{account.username?.[0]}</Avatar><span className="truncate">@{account.username}</span></button>)}</aside>
    <section className="min-h-0 overflow-y-auto bg-[linear-gradient(180deg,rgba(248,250,252,0.94),rgba(241,245,249,0.82))] p-4 dark:bg-none dark:bg-[#101113]"><div className="mb-4 flex items-center justify-between"><div className="font-semibold">پست‌ها و کامنت‌ها</div><Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => void syncPosts()}>دریافت پست‌ها</Button></div>{loading ? <div className="flex justify-center py-16"><Spin /></div> : <><div className="mb-5"><div className="mb-2 text-sm font-medium">استوری‌ها</div><div className="flex gap-3 overflow-x-auto pb-2">{stories.length ? stories.map((story) => <button key={story.id} type="button" className={`shrink-0 text-center ${selectedMediaId === story.id ? 'text-[rgb(var(--brand-700-rgb))] dark:text-[rgb(var(--brand-200-rgb))]' : ''}`} onClick={() => setSelectedMediaId(story.id)}><Avatar size={62} src={story.thumbnail_url || story.media_url} className="ring-2 ring-[rgb(var(--brand-500-rgb))] ring-offset-2 dark:ring-[rgb(var(--brand-300-rgb))]" /><div className="mt-1 w-16 truncate text-[11px]">استوری</div></button>) : <span className="text-xs text-slate-400">استوری دریافت نشده است.</span>}</div></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{posts.map((post) => <button type="button" key={post.id} className={`overflow-hidden rounded-2xl border text-right transition ${selectedMediaId === post.id ? 'border-[rgba(var(--brand-500-rgb),0.55)] ring-2 ring-[rgba(var(--brand-500-rgb),0.18)] dark:border-[rgba(var(--brand-300-rgb),0.45)]' : 'border-slate-200 dark:border-white/10'}`} onClick={() => setSelectedMediaId(post.id)}>{post.thumbnail_url || post.media_url ? <Image preview={false} src={post.thumbnail_url || post.media_url} height={150} className="w-full object-cover" /> : <div className="flex h-36 items-center justify-center bg-slate-100 text-slate-400">بدون تصویر</div>}<div className="bg-white/85 p-2 text-xs dark:bg-white/[0.055]"><div className="line-clamp-2">{post.caption || 'بدون کپشن'}</div><div className="mt-1 text-slate-400">♥ {Number(post.metrics?.like_count || 0).toLocaleString('fa-IR')} · ◌ {Number(post.metrics?.comments_count || 0).toLocaleString('fa-IR')}</div></div></button>)}</div>{posts.length === 0 ? <Empty className="mt-6" description="هنوز پستی از BoxAPI دریافت نشده است." /> : null}{selectedMedia ? <div className="mt-6 rounded-2xl border border-slate-200/70 bg-white/85 p-3 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.045]"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><CommentOutlined className="text-[rgb(var(--brand-700-rgb))] dark:text-[rgb(var(--brand-200-rgb))]" /><span className="font-medium">کامنت‌های {selectedMedia.media_type === 'story' ? 'استوری' : 'رسانه'} انتخاب‌شده</span></div><Button size="small" disabled={!selectedMedia.permalink} onClick={openMediaWorkflow}>گردش‌کار این {selectedMedia.media_type === 'story' ? 'استوری' : 'پست'}</Button></div><List locale={{ emptyText: 'کامنتی برای این پست دریافت نشده است.' }} dataSource={visibleComments} renderItem={(comment) => <List.Item className="block"><div className="flex gap-2"><Avatar src={comment.author_profile_photo_url}>{(comment.author_name || comment.author_username || 'ا')[0]}</Avatar><div className="min-w-0 flex-1"><div className="text-sm font-medium">{comment.author_name || comment.author_username || 'کاربر اینستاگرام'}</div><div className="mt-1 whitespace-pre-wrap text-sm">{comment.content_text}</div><div className="mt-1 text-xs text-slate-400">{dateText(comment.commented_at)} · ♥ {Number(comment.like_count || 0).toLocaleString('fa-IR')}</div><div className="mt-2 flex gap-2"><Input size="small" value={reply} onChange={(event) => setReply(event.target.value)} placeholder="پاسخ به کامنت..." onPressEnter={() => void replyToComment(comment)} /><Button size="small" type="primary" icon={<SendOutlined />} loading={sending} onClick={() => void replyToComment(comment)}>پاسخ</Button></div></div></div></List.Item>} /></div> : null}</>}</section>
  </div>;
};

export default InstagramCommentsPanel;
