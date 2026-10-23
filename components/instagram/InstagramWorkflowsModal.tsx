import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Avatar, Button, Card, Empty, Modal, Popconfirm, Spin, Tabs, Tag, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import WorkflowEditorModal from '../workflows/WorkflowEditorModal';
import { getDefaultActionConfig } from '../workflows/WorkflowActionsBuilder';
import { getWorkflowActionSummaryFa } from '../../utils/workflowActionSummary';
import { createWorkflowId, type WorkflowActionType, type WorkflowCondition, type WorkflowRecord } from '../../utils/workflowTypes';
import { fetchCurrentUserRoleContext, WORKFLOWS_PERMISSION_KEY } from '../../utils/permissions';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

type WorkflowTab = 'direct' | 'comments';
type InstagramMedia = {
  id: string;
  media_type: 'post' | 'reel' | 'story';
  permalink: string;
  caption?: string | null;
  thumbnail_url?: string | null;
  media_url?: string | null;
  media_expires_at?: string | null;
  occurred_at?: string | null;
};

const INSTAGRAM_CONDITION_FIELDS = [
  'event_type', 'account_username', 'media_type', 'media_permalink',
  'button_key', 'message_text', 'tags', 'occurred_at',
];

const hasCondition = (workflow: WorkflowRecord, field: string, value: string) =>
  Array.isArray(workflow.conditions_all)
  && workflow.conditions_all.some((condition) => String(condition?.field || '') === field && String(condition?.value || '') === value);

const actionLabel = (workflow: WorkflowRecord) => {
  const actions = Array.isArray(workflow.actions) ? workflow.actions : [];
  if (!actions.length) return 'بدون اقدام';
  return actions.map((action) => getWorkflowActionSummaryFa(action)).join('، ');
};

const makeScopeConditions = (tab: WorkflowTab, media?: InstagramMedia | null): WorkflowCondition[] => [
  { id: createWorkflowId(), field: 'event_type', operator: 'eq', value: tab === 'direct' ? 'direct_received' : 'comment_received' },
  ...(media ? [
    { id: createWorkflowId(), field: 'media_permalink', operator: 'eq', value: media.permalink },
    { id: createWorkflowId(), field: 'media_type', operator: 'eq', value: media.media_type },
  ] : []),
];

const InstagramWorkflowsModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { message } = App.useApp();
  const [tab, setTab] = useState<WorkflowTab>('direct');
  const [selectedMedia, setSelectedMedia] = useState<InstagramMedia | null>(null);
  const [stories, setStories] = useState<InstagramMedia[]>([]);
  const [posts, setPosts] = useState<InstagramMedia[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [editorRecord, setEditorRecord] = useState<WorkflowRecord | null>(null);
  const [creating, setCreating] = useState(false);

  const currentMedia = selectedMedia && (tab === 'direct' ? selectedMedia.media_type === 'story' : selectedMedia.media_type !== 'story')
    ? selectedMedia
    : null;
  const currentScope = useMemo(() => makeScopeConditions(tab, currentMedia), [currentMedia, tab]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [role, workflowsResult, storiesResult, postsResult] = await Promise.all([
        fetchCurrentUserRoleContext(supabase),
        supabase.from('workflows').select('id,module_id,name,description,trigger_type,execution_mode,conditions_all,conditions_any,actions,is_active,created_at,updated_at').eq('module_id', 'instagram_interaction_events').order('updated_at', { ascending: false }).limit(200),
        supabase.from('instagram_interaction_events').select('media_permalink,media_type,media_thumbnail_url,media_expires_at,occurred_at').eq('event_type', 'direct_received').eq('media_type', 'story').not('media_permalink', 'is', null).gt('media_expires_at', new Date().toISOString()).order('occurred_at', { ascending: false }).limit(80),
        supabase.from('instagram_social_media').select('id,media_type,permalink,caption,thumbnail_url,media_url,published_at').in('media_type', ['post', 'reel']).not('permalink', 'is', null).order('published_at', { ascending: false }).limit(40),
      ]);
      if (workflowsResult.error) throw workflowsResult.error;
      if (storiesResult.error) throw storiesResult.error;
      if (postsResult.error) throw postsResult.error;
      const permissions = role?.permissions || {};
      const workflowPermissions = permissions[WORKFLOWS_PERMISSION_KEY] || {};
      const isSaasAdmin = permissions.__saas_admin?.view === true || permissions.__saas_admin?.edit === true;
      setCanEdit(isSaasAdmin || workflowPermissions.edit !== false);
      setWorkflows((workflowsResult.data || []) as WorkflowRecord[]);
      const uniqueStories = new Map<string, InstagramMedia>();
      (storiesResult.data || []).forEach((item: any) => {
        const permalink = String(item?.media_permalink || '').trim();
        if (permalink && !uniqueStories.has(permalink)) uniqueStories.set(permalink, {
          id: permalink,
          permalink,
          media_type: 'story',
          thumbnail_url: item?.media_thumbnail_url || null,
          media_expires_at: item?.media_expires_at || null,
          occurred_at: item?.occurred_at || null,
        });
      });
      setStories(Array.from(uniqueStories.values()));
      setPosts((postsResult.data || []).map((item: any) => ({ ...item, permalink: String(item.permalink || '') })).filter((item: InstagramMedia) => item.permalink));
    } catch (error) {
      message.error(toFaErrorMessage(error, 'بارگذاری گردش‌کارهای اینستاگرام ناموفق بود.'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { if (open) void load(); }, [load, open]);
  useEffect(() => { setSelectedMedia(null); }, [tab]);

  const scopedWorkflows = useMemo(() => workflows.filter((workflow) => {
    const expectedEvent = tab === 'direct' ? 'direct_received' : 'comment_received';
    if (!hasCondition(workflow, 'event_type', expectedEvent)) return false;
    if (!currentMedia) return !Array.isArray(workflow.conditions_all) || !workflow.conditions_all.some((condition) => String(condition?.field || '') === 'media_permalink');
    return hasCondition(workflow, 'media_permalink', currentMedia.permalink)
      && hasCondition(workflow, 'media_type', currentMedia.media_type);
  }), [currentMedia, tab, workflows]);

  const openCreate = () => { setEditorRecord(null); setCreating(true); };
  const removeWorkflow = async (id: string) => {
    try {
      const { error } = await supabase.from('workflows').delete().eq('id', id);
      if (error) throw error;
      message.success('گردش‌کار حذف شد.');
      await load();
    } catch (error) { message.error(toFaErrorMessage(error, 'حذف گردش‌کار ناموفق بود.')); }
  };

  const rail = tab === 'direct' ? stories : posts;
  const railTitle = tab === 'direct' ? 'استوری‌های فعال با پاسخ دریافتی' : 'پست‌ها و ریل‌ها';
  const scopeLabel = currentMedia ? (tab === 'direct' ? 'شرط‌های این استوری' : 'شرط‌های این پست') : (tab === 'direct' ? 'شرط‌های عمومی دایرکت' : 'شرط‌های عمومی کامنت');
  const initialAction: WorkflowActionType = tab === 'direct' ? 'send_instagram_message' : 'reply_instagram_comment';

  return <Modal open={open} onCancel={onClose} footer={null} width={1180} destroyOnHidden title={<span className="flex items-center gap-2"><ThunderboltOutlined />گردش‌کارهای اینستاگرام</span>}>
    <Tabs activeKey={tab} onChange={(key) => setTab(key as WorkflowTab)} items={[
      { key: 'direct', label: 'دایرکت‌ها' },
      { key: 'comments', label: 'کامنت‌ها' },
    ]} />
    <div className="space-y-4" dir="rtl">
      <section className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-white/[0.1] dark:bg-white/[0.035]">
        <div className="mb-2 flex items-center justify-between gap-3"><div><div className="text-sm font-semibold">{railTitle}</div><div className="text-xs text-slate-500">با انتخاب یک مورد، فقط شرط‌های همان رسانه نمایش داده می‌شود.</div></div><Button size="small" type={!currentMedia ? 'primary' : 'default'} onClick={() => setSelectedMedia(null)}>شرط‌های عمومی</Button></div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {rail.map((media) => <Tooltip key={media.id} title={media.caption || (media.media_type === 'story' ? 'استوری فعال' : 'رسانه اینستاگرام')}><button type="button" onClick={() => setSelectedMedia(media)} className={`w-20 shrink-0 text-center ${currentMedia?.permalink === media.permalink ? 'opacity-100' : 'opacity-75 hover:opacity-100'}`}><Avatar shape="square" size={64} src={media.thumbnail_url || media.media_url} className={`!rounded-2xl ${currentMedia?.permalink === media.permalink ? 'ring-2 ring-[rgb(var(--brand-500-rgb))] ring-offset-2' : ''}`}>{media.media_type === 'story' ? 'استوری' : media.media_type === 'reel' ? 'ریل' : 'پست'}</Avatar><div className="mt-1 truncate text-[10px]">{media.media_type === 'story' ? 'استوری' : media.caption || (media.media_type === 'reel' ? 'ریل' : 'پست')}</div></button></Tooltip>)}
          {!rail.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={tab === 'direct' ? 'استوری فعالی با پاسخ ثبت نشده است.' : 'پست یا ریلی برای انتخاب ثبت نشده است.'} /> : null}
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200/80 bg-white p-3 dark:border-white/[0.1] dark:bg-white/[0.025]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><div className="font-semibold">{scopeLabel}</div><div className="mt-0.5 text-xs text-slate-500">شرط نوع رویداد و رسانهٔ انتخاب‌شده به‌طور خودکار محفوظ می‌ماند.</div></div><Button type="primary" icon={<PlusOutlined />} disabled={!canEdit} onClick={openCreate}>افزودن شرط جدید</Button></div>
        {loading ? <div className="flex justify-center py-12"><Spin /></div> : scopedWorkflows.length ? <div className="grid gap-2">{scopedWorkflows.map((workflow) => <Card key={workflow.id} size="small" className="!rounded-xl"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{workflow.name}</span><Tag color={workflow.is_active === false ? 'default' : 'green'}>{workflow.is_active === false ? 'غیرفعال' : 'فعال'}</Tag></div><div className="mt-1 truncate text-xs text-slate-500">{workflow.description || actionLabel(workflow)}</div></div><div className="flex gap-1"><Button size="small" icon={<EditOutlined />} disabled={!canEdit} onClick={() => { setEditorRecord(workflow); setCreating(false); }}>ویرایش</Button><Popconfirm title="این گردش‌کار حذف شود؟" okText="حذف" cancelText="انصراف" onConfirm={() => void removeWorkflow(workflow.id)}><Button size="small" danger type="text" icon={<DeleteOutlined />} disabled={!canEdit} aria-label="حذف گردش‌کار" /></Popconfirm></div></div></Card>)}</div> : <Empty description="برای این محدوده هنوز شرطی ساخته نشده است." />}
      </section>
    </div>
    {(creating || editorRecord) ? <WorkflowEditorModal open onClose={() => { setCreating(false); setEditorRecord(null); }} onSaved={() => void load()} initialModuleId="instagram_interaction_events" lockModuleSelection lockedTriggerType="on_create" allowedConditionFieldKeys={INSTAGRAM_CONDITION_FIELDS} fixedConditionsAll={currentScope} record={editorRecord} canEdit={canEdit} moduleOptions={[{ value: 'instagram_interaction_events', label: 'رویدادهای اینستاگرام' }]} initialDraft={creating ? { moduleId: 'instagram_interaction_events', name: `${tab === 'direct' ? 'پاسخ خودکار دایرکت' : 'پاسخ خودکار کامنت'}${currentMedia ? ` ${tab === 'direct' ? 'استوری' : 'پست'} انتخاب‌شده` : ''}`, description: currentMedia ? `فقط برای ${tab === 'direct' ? 'پاسخ‌های همین استوری' : 'کامنت‌های همین پست'} اجرا می‌شود.` : `برای همه ${tab === 'direct' ? 'دایرکت‌های ورودی' : 'کامنت‌های ورودی'} اجرا می‌شود.`, triggerType: 'on_create', conditionsAll: currentScope, actions: [{ id: createWorkflowId(), type: initialAction, config: getDefaultActionConfig(initialAction) }] } : null} /> : null}
  </Modal>;
};

export default InstagramWorkflowsModal;
