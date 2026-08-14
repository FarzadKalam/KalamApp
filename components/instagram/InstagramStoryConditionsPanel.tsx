import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Avatar, Button, Input, List, Modal, Space, Spin, Tag } from 'antd';
import { EditOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';

type StoryWorkflow = { id: string; name: string; is_active?: boolean; conditions_all?: Array<{ field?: string; value?: unknown }> | null };
type StoryReply = { id: string; media_permalink?: string | null; message_text?: string | null; occurred_at?: string | null; conversation_id?: string | null };
type WorkflowQueue = { record_id: string; status: string; last_error?: string | null };
type WorkflowLog = { record_id: string; workflow_id?: string | null; status: string; message?: string | null };
type StoryCondition = StoryWorkflow & { permalink: string };

const dateText = (value?: string | null) => value ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const storyPermalink = (workflow: StoryWorkflow) => String((workflow.conditions_all || []).find((condition) => condition?.field === 'media_permalink')?.value || '').trim();
const isStoryWorkflow = (workflow: StoryWorkflow) => Array.isArray(workflow.conditions_all) && workflow.conditions_all.some((condition) => condition?.field === 'media_type' && String(condition?.value || '') === 'story') && Boolean(storyPermalink(workflow));

const InstagramStoryConditionsPanel: React.FC<{ orgId: string }> = ({ orgId }) => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<StoryCondition[]>([]);
  const [replies, setReplies] = useState<StoryReply[]>([]);
  const [queues, setQueues] = useState<WorkflowQueue[]>([]);
  const [logs, setLogs] = useState<WorkflowLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StoryCondition | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [storyLink, setStoryLink] = useState('');

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [workflowResult, replyResult] = await Promise.all([
        supabase.from('workflows').select('id,name,is_active,conditions_all').eq('module_id', 'instagram_interaction_events').eq('is_active', true).order('updated_at', { ascending: false }).limit(100),
        supabase.from('instagram_interaction_events').select('id,media_permalink,message_text,occurred_at,conversation_id').eq('event_type', 'direct_received').eq('media_type', 'story').order('occurred_at', { ascending: false }).limit(300),
      ]);
      if (workflowResult.error) throw workflowResult.error;
      if (replyResult.error) throw replyResult.error;
      const nextWorkflows = ((workflowResult.data || []) as StoryWorkflow[]).filter(isStoryWorkflow).map((workflow) => ({ ...workflow, permalink: storyPermalink(workflow) }));
      const nextReplies = (replyResult.data || []) as StoryReply[];
      setWorkflows(nextWorkflows); setReplies(nextReplies);
      const replyIds = nextReplies.map((reply) => reply.id);
      if (!replyIds.length) { setQueues([]); setLogs([]); return; }
      const [queueResult, logResult] = await Promise.all([
        supabase.from('workflow_event_queue').select('record_id,status,last_error').eq('source_table', 'instagram_interaction_events').in('record_id', replyIds).limit(300),
        supabase.from('workflow_logs').select('record_id,workflow_id,status,message').eq('module_id', 'instagram_interaction_events').in('record_id', replyIds).order('created_at', { ascending: false }).limit(300),
      ]);
      setQueues((queueResult.data || []) as WorkflowQueue[]); setLogs((logResult.data || []) as WorkflowLog[]);
    } catch (error: any) { message.error(error?.message || 'بارگذاری شرط‌ها و پاسخ‌های استوری ناموفق بود.'); }
    finally { setLoading(false); }
  }, [message, orgId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!orgId) return;
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;
    const queueReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => { void load(); }, 500);
    };
    const channel = supabase.channel(`instagram-story-conditions-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'instagram_interaction_events', filter: `org_id=eq.${orgId}` }, queueReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_event_queue', filter: `org_id=eq.${orgId}` }, queueReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_logs', filter: `org_id=eq.${orgId}` }, queueReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflows', filter: `org_id=eq.${orgId}` }, queueReload)
      .subscribe();
    return () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      supabase.removeChannel(channel);
    };
  }, [load, orgId]);

  const openWorkflow = (condition: StoryCondition) => {
    const params = new URLSearchParams({ tab: 'workflows', instagramMediaPermalink: condition.permalink, instagramMediaType: 'story', instagramMediaLabel: condition.name });
    navigate(`/settings?${params.toString()}`);
  };
  const createCondition = () => {
    const permalink = storyLink.trim();
    if (!/^https?:\/\//i.test(permalink)) { message.warning('لینک معتبر استوری را وارد کنید.'); return; }
    setCreateOpen(false); setStoryLink('');
    const params = new URLSearchParams({ tab: 'workflows', instagramMediaPermalink: permalink, instagramMediaType: 'story', instagramMediaLabel: 'استوری' });
    navigate(`/settings?${params.toString()}`);
  };
  const selectedReplies = useMemo(() => selected ? replies.filter((reply) => reply.media_permalink === selected.permalink) : [], [replies, selected]);
  const replyStatus = (reply: StoryReply) => {
    const matchedLog = logs.find((log) => log.record_id === reply.id && (!selected || log.workflow_id === selected.id));
    if (matchedLog) return { label: matchedLog.status === 'success' ? 'شرط اجرا شد' : matchedLog.status === 'failed' ? 'خطای اجرا' : 'شرط ثبت شد', color: matchedLog.status === 'failed' ? 'error' : 'success' };
    const queue = queues.find((item) => item.record_id === reply.id);
    if (queue?.status === 'pending' || queue?.status === 'processing') return { label: 'در صف بررسی', color: 'processing' };
    if (queue?.status === 'failed') return { label: 'خطای بررسی', color: 'error' };
    return { label: 'شرطی منطبق نشد', color: 'default' };
  };

  return <div className="mb-5">
    <div className="mb-2 flex items-center justify-between"><div className="text-sm font-medium">شرط‌های استوری</div><Button size="small" type="text" onClick={() => void load()}>به‌روزرسانی</Button></div>
    {loading ? <div className="py-3 text-center"><Spin size="small" /></div> : <div className="flex gap-3 overflow-x-auto pb-2">
      <button type="button" onClick={() => setCreateOpen(true)} className="shrink-0 text-center text-[rgb(var(--brand-700-rgb))] dark:text-[rgb(var(--brand-200-rgb))]"><Avatar size={62} icon={<PlusOutlined />} className="ring-2 ring-dashed ring-[rgb(var(--brand-500-rgb))] ring-offset-2 dark:ring-[rgb(var(--brand-300-rgb))]" /><div className="mt-1 w-16 truncate text-[11px]">شرط جدید</div></button>
      {workflows.map((condition) => <button key={condition.id} type="button" onClick={() => setSelected(condition)} className="shrink-0 text-center"><Avatar size={62} icon={<ThunderboltOutlined />} className="bg-[rgba(var(--brand-500-rgb),0.12)] text-[rgb(var(--brand-700-rgb))] ring-2 ring-[rgb(var(--brand-500-rgb))] ring-offset-2 dark:bg-[rgba(var(--brand-300-rgb),0.12)] dark:text-[rgb(var(--brand-200-rgb))] dark:ring-[rgb(var(--brand-300-rgb))]" /><div className="mt-1 w-16 truncate text-[11px]">{condition.name}</div></button>)}
      {!workflows.length ? <span className="self-center text-xs text-slate-400">شرطی برای استوری ساخته نشده است.</span> : null}
    </div>}
    <Modal open={Boolean(selected)} title={selected?.name || 'شرط استوری'} onCancel={() => setSelected(null)} footer={<Space><Button icon={<EditOutlined />} onClick={() => selected && openWorkflow(selected)}>ویرایش شرط</Button><Button type="primary" onClick={() => setSelected(null)}>بستن</Button></Space>}>
      <div className="mb-3 text-xs text-slate-500" dir="ltr">{selected?.permalink}</div>
      <List locale={{ emptyText: 'هنوز پاسخ استوری ثبت نشده است.' }} dataSource={selectedReplies} renderItem={(reply) => { const status = replyStatus(reply); return <List.Item><div className="min-w-0 flex-1"><div className="text-sm">{reply.message_text || 'پاسخ بدون متن'}</div><div className="mt-1 flex flex-wrap items-center gap-2"><span className="text-xs text-slate-400">{dateText(reply.occurred_at)}</span><Tag color={status.color}>{status.label}</Tag></div></div></List.Item>; }} />
    </Modal>
    <Modal open={createOpen} title="شرط جدید برای استوری" okText="ادامه و تنظیم شرط" cancelText="انصراف" onCancel={() => setCreateOpen(false)} onOk={createCondition} destroyOnHidden><div className="mb-2 text-sm text-slate-600 dark:text-slate-300">لینک استوری را وارد کنید تا همان گردش‌کار مرکزی با شرط «ریپلای این استوری» باز شود.</div><Input dir="ltr" value={storyLink} onChange={(event) => setStoryLink(event.target.value)} placeholder="https://www.instagram.com/stories/..." /></Modal>
  </div>;
};

export default InstagramStoryConditionsPanel;
