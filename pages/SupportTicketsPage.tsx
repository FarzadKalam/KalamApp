import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as AntApp, Badge, Button, Checkbox, Empty, Input, Modal, Select, Spin, Tag, Tooltip } from 'antd';
import { FileAddOutlined, PaperClipOutlined, PlusOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import WorkflowsManager from '../components/workflows/WorkflowsManager';
import { getSupportFileUrl, SUPPORT_STATUS, type SupportAttachment, type SupportMessage, type SupportThread, type SupportTicket, uploadSupportFiles, validateSupportFiles } from '../utils/supportTickets';
import { toFaErrorMessage } from '../utils/errorMessageFa';

type Operator = { id: string; name: string };
type Category = { code: string; title: string };
type Props = { admin?: boolean };

const AttachmentItem: React.FC<{ attachment: SupportAttachment }> = ({ attachment }) => {
  const { message } = AntApp.useApp();
  const [imageUrl, setImageUrl] = useState('');
  useEffect(() => {
    let active = true;
    if (attachment.mime_type.startsWith('image/')) {
      void getSupportFileUrl(attachment).then((url) => { if (active) setImageUrl(url); }).catch(() => undefined);
    }
    return () => { active = false; };
  }, [attachment]);
  const openFile = async () => {
    const fileTab = window.open('about:blank', '_blank');
    if (fileTab) fileTab.opener = null;
    try {
      const url = await getSupportFileUrl(attachment);
      if (fileTab) fileTab.location.replace(url);
      else window.location.assign(url);
    } catch (error) {
      fileTab?.close();
      message.error(toFaErrorMessage(error, 'دریافت فایل ناموفق بود.'));
    }
  };
  return <button type="button" onClick={() => void openFile()} className="flex max-w-full items-center gap-2 rounded-lg border border-current/20 px-2 py-1 text-xs hover:opacity-75">
    {imageUrl ? <img src={imageUrl} alt={attachment.file_name} className="h-16 w-16 rounded object-cover" /> : <PaperClipOutlined />}
    <span className="max-w-48 truncate">{attachment.file_name}</span>
  </button>;
};

const SupportTicketsPage: React.FC<Props> = ({ admin = false }) => {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const { ticketId } = useParams<{ ticketId?: string }>();
  const [ready, setReady] = useState(!admin);
  const [allowed, setAllowed] = useState(!admin);
  const [canReply, setCanReply] = useState(!admin);
  const [canCreate, setCanCreate] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [canWorkflows, setCanWorkflows] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentOrgId, setCurrentOrgId] = useState('');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketLimit, setTicketLimit] = useState(100);
  const [hasMoreTickets, setHasMoreTickets] = useState(false);
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newCategory, setNewCategory] = useState<string>();
  const [newSubject, setNewSubject] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [replyBody, setReplyBody] = useState('');
  const [replyInternal, setReplyInternal] = useState(false);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [forwardSource, setForwardSource] = useState<SupportMessage | null>(null);
  const [forwardRecipients, setForwardRecipients] = useState<string[]>([]);
  const [forwardAttachments, setForwardAttachments] = useState<string[]>([]);
  const [forwardNote, setForwardNote] = useState('');
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityTitle, setActivityTitle] = useState('');
  const [activityAssignee, setActivityAssignee] = useState<string>();
  const basePath = admin ? '/taze-system/tickets' : '/support/tickets';
  const selectedId = ticketId || '';
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  useEffect(() => { setTicketLimit(100); }, [search, statusFilter]);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || ''));
    void supabase.rpc('current_org_id').then(({ data, error }) => setCurrentOrgId(!error && typeof data === 'string' ? data : ''));
    if (admin) {
      void Promise.all(['support_view', 'support_reply', 'support_manage', 'support_workflows'].map((p_permission) =>
        supabase.rpc('support_is_operator', { p_permission })))
        .then((results) => {
          setAllowed(results[0].data === true);
          setCanReply(results[1].data === true);
          setCanManage(results[2].data === true);
          setCanWorkflows(results[3].data === true);
        }).catch(() => setAllowed(false)).finally(() => setReady(true));
      void supabase.rpc('support_list_operators').then(({ data }) => setOperators(Array.isArray(data) ? data : []));
    } else {
      void supabase.rpc('support_list_categories').then(({ data }) => setCategories(Array.isArray(data) ? data : []));
      void supabase.rpc('support_customer_capabilities').then(({ data, error }) => {
        setCanCreate(!error && data?.can_create === true);
      });
    }
  }, [admin]);

  const loadTickets = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const collected: SupportTicket[] = [];
      let lastPageSize = 0;
      for (let offset = 0; offset < ticketLimit; offset += 100) {
        const { data, error } = await supabase.rpc('support_list_tickets', {
          p_status: statusFilter, p_search: search.trim() || null, p_limit: 100, p_offset: offset,
        });
        if (error) throw error;
        const page = Array.isArray(data) ? data as SupportTicket[] : [];
        collected.push(...page);
        lastPageSize = page.length;
        if (lastPageSize < 100) break;
      }
      setTickets(collected);
      setHasMoreTickets(lastPageSize === 100);
    } catch (error) { if (!quiet) message.error(toFaErrorMessage(error, 'دریافت تیکت‌ها ناموفق بود.')); }
    finally { if (!quiet) setLoading(false); }
  }, [message, search, statusFilter, ticketLimit]);

  const loadThread = useCallback(async (id: string, quiet = false) => {
    if (!id) { setThread(null); return; }
    if (!quiet) setDetailLoading(true);
    try {
      const { data, error } = await supabase.rpc('support_get_ticket', { p_ticket_id: id });
      if (error) throw error;
      if (selectedIdRef.current !== id) return;
      setThread(data as SupportThread);
      if (!admin) {
        const { data: replyAccess, error: replyError } = await supabase.rpc('support_customer_can', {
          p_customer_org_id: data.ticket.customer_org_id,
          p_action: 'reply', p_creator: data.ticket.created_by,
        });
        setCanReply(!replyError && replyAccess === true);
      }
      await supabase.rpc('support_mark_read', { p_ticket_id: id });
    } catch (error) { if (!quiet) message.error(toFaErrorMessage(error, 'دریافت گفتگو ناموفق بود.')); }
    finally { if (!quiet) setDetailLoading(false); }
  }, [admin, message]);

  useEffect(() => {
    if (!ready || !allowed) return;
    void loadTickets();
  }, [ready, allowed, loadTickets]);
  useEffect(() => {
    if (!ready || !allowed) return;
    setThread(null);
    void loadThread(selectedId);
  }, [ready, allowed, selectedId, loadThread]);
  useEffect(() => {
    if (!ready || !allowed) return;
    const timer = window.setInterval(() => {
      void loadTickets(true);
      if (selectedId) void loadThread(selectedId, true);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [ready, allowed, selectedId, loadTickets, loadThread]);
  useEffect(() => {
    if (!ready || !allowed || !currentOrgId) return;
    let refreshTimer: number | undefined;
    const channel = supabase.channel(`org:${currentOrgId}:notifications`, { config: { private: true } } as any)
      .on('broadcast', { event: 'support_tickets_changed' }, () => {
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => {
          void loadTickets(true);
          if (selectedId) void loadThread(selectedId, true);
        }, 250);
      })
      .subscribe();
    return () => { window.clearTimeout(refreshTimer); void supabase.removeChannel(channel); };
  }, [ready, allowed, currentOrgId, selectedId, loadTickets, loadThread]);

  const run = async (action: () => Promise<void>, success: string) => {
    setSaving(true);
    try { await action(); message.success(success); await loadTickets(true); if (selectedId) await loadThread(selectedId, true); }
    catch (error) { message.error(toFaErrorMessage(error, 'عملیات تیکت ناموفق بود.')); }
    finally { setSaving(false); }
  };

  const createTicket = () => void run(async () => {
    validateSupportFiles(newFiles);
    const { data, error } = await supabase.rpc('support_create_ticket', {
      p_category: newCategory, p_subject: newSubject.trim(), p_body: newBody.trim(),
    });
    if (error) throw error;
    setCreateOpen(false); setNewSubject(''); setNewBody(''); setNewFiles([]); setNewCategory(undefined);
    navigate(`${basePath}/${data.id}`);
    if (newFiles.length) {
      try { await uploadSupportFiles(data.id, data.message_id, newFiles); }
      catch (uploadError) { message.warning(`تیکت ثبت شد، اما پیوست‌ها بارگذاری نشدند: ${toFaErrorMessage(uploadError, 'خطا در بارگذاری فایل')}`); }
    }
  }, 'تیکت ثبت شد.');

  const sendReply = () => {
    if (!selectedId || !replyBody.trim()) return;
    void run(async () => {
      validateSupportFiles(replyFiles);
      const { data, error } = await supabase.rpc('support_send_message', {
        p_ticket_id: selectedId, p_body: replyBody.trim(), p_internal: admin && replyInternal,
      });
      if (error) throw error;
      setReplyBody(''); setReplyFiles([]);
      if (replyFiles.length) {
        try { await uploadSupportFiles(selectedId, data.id, replyFiles); }
        catch (uploadError) { message.warning(`پیام ثبت شد، اما پیوست‌ها بارگذاری نشدند: ${toFaErrorMessage(uploadError, 'خطا در بارگذاری فایل')}`); }
      }
    }, replyInternal ? 'یادداشت داخلی ثبت شد.' : 'پاسخ ارسال شد.');
  };

  const setTicketStatus = (status: string) => void run(async () => {
    const { error } = await supabase.rpc('support_set_status', { p_ticket_id: selectedId, p_status: status });
    if (error) throw error;
  }, 'وضعیت تیکت تغییر کرد.');
  const setAssignee = (assignee: string | null) => void run(async () => {
    const { error } = await supabase.rpc('support_assign_ticket', { p_ticket_id: selectedId, p_assignee: assignee });
    if (error) throw error;
  }, 'مسئول تیکت ثبت شد.');
  const sendForward = () => void run(async () => {
    const { error } = await supabase.rpc('support_forward_message', {
      p_message_id: forwardSource?.id, p_recipient_ids: forwardRecipients,
      p_attachment_ids: forwardAttachments, p_note: forwardNote.trim() || null,
    });
    if (error) throw error;
    setForwardSource(null); setForwardRecipients([]); setForwardAttachments([]); setForwardNote('');
  }, 'پیام برای همکاران ارجاع شد.');
  const createActivity = () => void run(async () => {
    const { error } = await supabase.rpc('support_create_activity', {
      p_ticket_id: selectedId, p_title: activityTitle.trim() || null, p_assignee: activityAssignee || null,
    });
    if (error) throw error;
    setActivityOpen(false); setActivityTitle(''); setActivityAssignee(undefined);
  }, 'فعالیت مرتبط با گفتگو ثبت شد.');

  const selectedTicket = thread?.ticket;
  const operatorName = (id: string | null | undefined) => operators.find((operator) => operator.id === id)?.name || 'بدون مسئول';
  const forwardLinks = useMemo(() => (thread?.forwards || []).reduce<Record<string, string[]>>((acc, item) => {
    (acc[item.note_message_id] ||= []).push(operatorName(item.recipient_id)); return acc;
  }, {}), [thread?.forwards, operators]);

  if (!ready) return <div className="flex h-full items-center justify-center"><Spin /></div>;
  if (!allowed) return <Empty description="دسترسی به صندوق تیکت‌های تازه سیستم ندارید." />;
  return <div dir="rtl" className="flex h-full min-h-[70vh] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 md:flex-row">
    <aside className={`${selectedId ? 'hidden md:flex' : 'flex'} w-full flex-col border-l border-slate-200 dark:border-slate-700 md:w-80 lg:w-96`}>
      <div className="border-b border-slate-200 p-4 dark:border-slate-700">
        <div className="mb-3 flex items-center justify-between gap-2"><h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{admin ? 'تیکت‌های مشتریان' : 'تیکت‌های پشتیبانی'}</h1>
          <div className="flex gap-1"><Tooltip title="تازه‌سازی"><Button icon={<ReloadOutlined />} onClick={() => void loadTickets()} /></Tooltip>
          {!admin && canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>تیکت جدید</Button>}</div></div>
        <Input.Search allowClear placeholder="جستجوی عنوان یا کد تیکت" value={search} onChange={(event) => setSearch(event.target.value)} />
        <Select className="mt-2 w-full" allowClear placeholder="همه وضعیت‌ها" value={statusFilter || undefined} onChange={(value) => setStatusFilter(value || null)}
          options={Object.entries(SUPPORT_STATUS).map(([value, item]) => ({ value, label: item.title }))} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{loading ? <div className="p-8 text-center"><Spin /></div> : tickets.length ? <>{tickets.map((ticket) =>
        <button key={ticket.id} type="button" onClick={() => navigate(`${basePath}/${ticket.id}`)}
          className={`w-full border-b border-slate-100 p-4 text-right transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800 ${ticket.id === selectedId ? 'bg-blue-50 dark:bg-slate-800' : ''}`}>
          <div className="flex items-center justify-between gap-2"><span className="font-bold text-slate-900 dark:text-slate-100">{ticket.subject}</span><Badge count={ticket.unread_count || 0} size="small" /></div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><span>{ticket.code}</span><Tag color={SUPPORT_STATUS[ticket.status]?.color}>{SUPPORT_STATUS[ticket.status]?.title}</Tag></div>
          {admin && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{ticket.customer_org_name}</div>}
        </button>)}{hasMoreTickets && <div className="p-3 text-center"><Button onClick={() => setTicketLimit((limit) => limit + 100)}>نمایش تیکت‌های بیشتر</Button></div>}</> : <Empty className="mt-12" description="تیکتی پیدا نشد." />}</div>
    </aside>

    <section className={`${selectedId ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
      {!selectedId ? <div className="flex flex-1 items-center justify-center"><Empty description="یک تیکت را انتخاب کنید." /></div> : detailLoading && !thread ? <div className="m-auto"><Spin /></div> : selectedTicket ? <>
        <header className="border-b border-slate-200 p-4 dark:border-slate-700">
          <div className="flex items-center gap-2"><Button className="md:hidden" onClick={() => navigate(basePath)}>بازگشت</Button><h2 className="min-w-0 flex-1 truncate text-lg font-bold text-slate-900 dark:text-slate-100">{selectedTicket.subject}</h2><span className="text-sm text-slate-500">{selectedTicket.code}</span></div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><Tag color={SUPPORT_STATUS[selectedTicket.status]?.color}>{SUPPORT_STATUS[selectedTicket.status]?.title}</Tag><span className="text-slate-500 dark:text-slate-400">{selectedTicket.category_title || categories.find((item) => item.code === selectedTicket.category_code)?.title}</span>{admin && <span className="text-slate-500 dark:text-slate-400">{selectedTicket.customer_org_name}</span>}</div>
          {admin && <div className="mt-3 flex flex-wrap items-center gap-2">
            {canManage && <><Select className="min-w-44" value={selectedTicket.status} loading={saving} onChange={setTicketStatus} options={Object.entries(SUPPORT_STATUS).map(([value, item]) => ({ value, label: item.title }))} />
              <Select className="min-w-44" allowClear placeholder="مسئول تیکت" value={selectedTicket.assigned_to || undefined} onChange={(value) => setAssignee(value || null)} options={operators.map((operator) => ({ value: operator.id, label: operator.name }))} /></>}
            {canReply && <Button icon={<FileAddOutlined />} onClick={() => { setActivityTitle(`پیگیری ${selectedTicket.code}: ${selectedTicket.subject}`); setActivityOpen(true); }}>ایجاد فعالیت</Button>}
            {canWorkflows && <Button onClick={() => navigate('/taze-system/tickets/workflows')}>گردش‌کار تیکت‌ها</Button>}
          </div>}
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-950">
          {(thread?.messages || []).map((item) => {
            const own = item.author_id === currentUserId;
            const forwardedIds = new Set((thread?.forwards || []).filter((forward) => forward.note_message_id === item.id).flatMap((forward) => forward.attachment_ids));
            const forwardedFiles = (thread?.messages || []).flatMap((source) => source.attachments || []).filter((attachment) => forwardedIds.has(attachment.id));
            return <div key={item.id} className={`flex ${own ? 'justify-start' : 'justify-end'}`}>
              <article className={`max-w-[90%] rounded-2xl p-3 shadow-sm md:max-w-[75%] ${item.visibility === 'internal' ? 'border border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100' : own ? 'bg-blue-600 text-white' : 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'}`}>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs opacity-80"><strong>{item.author_name}</strong><span>{new Date(item.created_at).toLocaleString('fa-IR')}</span>{item.visibility === 'internal' && <Tag color="gold">فقط داخلی</Tag>}{item.message_kind === 'forward' && <Tag>ارجاع</Tag>}</div>
                <p className="whitespace-pre-wrap break-words text-sm leading-7">{item.body}</p>
                {forwardLinks[item.id]?.length ? <div className="mt-2 text-xs">گیرندگان ارجاع: {forwardLinks[item.id].join('، ')}</div> : null}
                {item.attachments?.length ? <div className="mt-3 flex flex-wrap gap-2">{item.attachments.map((attachment) => <AttachmentItem key={attachment.id} attachment={attachment} />)}</div> : null}
                {forwardedFiles.length ? <div className="mt-3 flex flex-wrap gap-2"><span className="w-full text-xs">پیوست‌های ارجاع‌شده:</span>{forwardedFiles.map((attachment) => <AttachmentItem key={attachment.id} attachment={attachment} />)}</div> : null}
                {admin && canReply && item.visibility === 'customer' && !own && <Button size="small" className="mt-2" onClick={() => { setForwardSource(item); setForwardAttachments([]); }}>فوروارد</Button>}
              </article>
            </div>;
          })}
        </div>
        {canReply && <div className="border-t border-slate-200 p-3 dark:border-slate-700">
          {admin && <Checkbox checked={replyInternal} onChange={(event) => setReplyInternal(event.target.checked)}>یادداشت داخلی؛ مشتری نمی‌بیند</Checkbox>}
          <Input.TextArea rows={2} value={replyBody} onChange={(event) => setReplyBody(event.target.value)} placeholder={replyInternal ? 'یادداشت برای همکاران...' : 'پاسخ خود را بنویسید...'} maxLength={10000} className="mt-2" />
          <div className="mt-2 flex items-center justify-between gap-2"><label className="cursor-pointer text-sm text-blue-600"><PaperClipOutlined /> افزودن فایل یا تصویر<input className="hidden" type="file" multiple onChange={(event) => setReplyFiles(Array.from(event.target.files || []))} /></label>
            <Button type="primary" icon={<SendOutlined />} loading={saving} disabled={!replyBody.trim()} onClick={sendReply}>ارسال</Button></div>
          {replyFiles.length > 0 && <div className="mt-1 text-xs text-slate-500">{replyFiles.map((file) => file.name).join('، ')}</div>}
        </div>}
      </> : <div className="m-auto"><Empty description="گفتگو در دسترس نیست." /></div>}
    </section>

    <Modal title="تیکت جدید" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={createTicket} okText="ثبت تیکت" cancelText="انصراف" okButtonProps={{ loading: saving, disabled: !newCategory || newSubject.trim().length < 3 || !newBody.trim() }}>
      <div className="space-y-3"><Select className="w-full" placeholder="دسته‌بندی را انتخاب کنید" value={newCategory} onChange={setNewCategory} options={categories.map((item) => ({ value: item.code, label: item.title }))} />
        <Input placeholder="عنوان تیکت" value={newSubject} maxLength={180} onChange={(event) => setNewSubject(event.target.value)} />
        <Input.TextArea rows={5} placeholder="موضوع را توضیح دهید" value={newBody} maxLength={10000} onChange={(event) => setNewBody(event.target.value)} />
        <label className="cursor-pointer text-blue-600"><PaperClipOutlined /> افزودن فایل یا تصویر<input className="hidden" type="file" multiple onChange={(event) => setNewFiles(Array.from(event.target.files || []))} /></label>
        {newFiles.length > 0 && <div className="text-xs text-slate-500">{newFiles.map((file) => file.name).join('، ')}</div>}
      </div>
    </Modal>
    <Modal title="ارجاع داخلی پیام" open={!!forwardSource} onCancel={() => setForwardSource(null)} onOk={sendForward} okText="ارجاع" okButtonProps={{ loading: saving, disabled: forwardRecipients.length === 0 }}>
      <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">{forwardSource?.body}</p>
      <Select className="w-full" mode="multiple" placeholder="همکاران دریافت‌کننده" value={forwardRecipients} onChange={setForwardRecipients} options={operators.map((operator) => ({ value: operator.id, label: operator.name }))} />
      <Input.TextArea className="mt-3" rows={3} placeholder="توضیح داخلی برای همکاران" value={forwardNote} onChange={(event) => setForwardNote(event.target.value)} />
      {!!forwardSource?.attachments?.length && <div className="mt-3"><div className="mb-2 text-sm font-bold">پیوست‌های همراه ارجاع</div><Checkbox.Group value={forwardAttachments} onChange={(values) => setForwardAttachments(values.map(String))} options={forwardSource.attachments.map((attachment) => ({ value: attachment.id, label: attachment.file_name }))} /></div>}
    </Modal>
    <Modal title="فعالیت مرتبط با کل تیکت" open={activityOpen} onCancel={() => setActivityOpen(false)} onOk={createActivity} okText="ثبت فعالیت" okButtonProps={{ loading: saving }}>
      <Input value={activityTitle} onChange={(event) => setActivityTitle(event.target.value)} placeholder="عنوان فعالیت" />
      <Select className="mt-3 w-full" allowClear placeholder="مسئول فعالیت" value={activityAssignee} onChange={setActivityAssignee} options={operators.map((operator) => ({ value: operator.id, label: operator.name }))} />
    </Modal>
  </div>;
};

export const SupportWorkflowsPage: React.FC = () => {
  const navigate = useNavigate();
  return <div dir="rtl" className="p-4"><Button className="mb-4" onClick={() => navigate('/taze-system/tickets')}>بازگشت به تیکت‌ها</Button>
    <h1 className="mb-4 text-xl font-bold">گردش‌کار تیکت‌ها</h1><WorkflowsManager inline supportOnly defaultModuleId="saas_support_tickets" context="settings" />
  </div>;
};

export default SupportTicketsPage;
