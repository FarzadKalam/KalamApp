import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  Avatar,
  Button,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  AudioOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  RobotOutlined,
  SearchOutlined,
  SendOutlined,
  ShareAltOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { fetchSessionBootstrap } from '../utils/sessionCache';
import { loadProfilesWithCompat } from '../utils/profileDirectory';

type AiThread = {
  id: string;
  title?: string | null;
  context_type?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  archived_at?: string | null;
  is_shared?: boolean | null;
  is_owner?: boolean | null;
  owner_user_id?: string | null;
  shared_user_ids?: string[] | null;
  shared_role_ids?: string[] | null;
};

type AiMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | string;
  content: string;
  created_at?: string | null;
  model?: string | null;
  provider?: string | null;
  metadata?: Record<string, any> | null;
};

type DirectoryOption = {
  label: string;
  value: string;
};

const THREAD_SELECT_LIMIT = 80;

const formatThreadDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' });
};

const formatMessageTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
};

const formatCostFa = (msg: AiMessage): string | null => {
  // cost.irt from the Edge Function is already in Toman (exchange_rate is toman/USD)
  const raw = msg.metadata?.usage?.cost?.irt ?? null;
  if (raw == null || Number(raw) <= 0) return null;
  return `${Math.round(Number(raw)).toLocaleString('fa-IR')} تومان`;
};

const normalizeIdArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

const AiChatPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const autoPromptHandledRef = useRef(false);
  const [threads, setThreads] = useState<AiThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [input, setInput] = useState('');
  const [threadSearch, setThreadSearch] = useState('');
  const [renameTitle, setRenameTitle] = useState('');
  const [shareUserIds, setShareUserIds] = useState<string[]>([]);
  const [shareRoleIds, setShareRoleIds] = useState<string[]>([]);
  const [userOptions, setUserOptions] = useState<DirectoryOption[]>([]);
  const [roleOptions, setRoleOptions] = useState<DirectoryOption[]>([]);
  const [voiceActive, setVoiceActive] = useState(false);
  const recognitionRef = useRef<any>(null);

  const activeThread = useMemo(
    () => threads.find((thread) => String(thread.id) === String(activeThreadId)) || null,
    [threads, activeThreadId]
  );
  const isActiveOwner = activeThread ? activeThread.is_owner !== false : true;

  const invokeAi = useCallback(async (body: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke('ai-assistant', { body });
    if (error) throw error;
    if ((data as any)?.error) throw new Error(String((data as any).error));
    return data as any;
  }, []);

  const loadThreads = useCallback(async (preferredThreadId?: string | null) => {
    setThreadLoading(true);
    try {
      const data = await invokeAi({ action: 'list_threads', limit: THREAD_SELECT_LIMIT });
      const nextThreads = Array.isArray(data?.threads) ? data.threads as AiThread[] : [];
      setThreads(nextThreads);
      const preferred = preferredThreadId
        ? nextThreads.find((thread) => String(thread.id) === String(preferredThreadId))
        : null;
      // Honor preferredThreadId when provided (even if not yet in list due to timing)
      let nextActive: string | null;
      if (preferred?.id) {
        nextActive = preferred.id;
      } else if (preferredThreadId) {
        nextActive = preferredThreadId;
      } else if (activeThreadId) {
        nextActive = activeThreadId;
      } else {
        nextActive = nextThreads[0]?.id || null;
      }
      setActiveThreadId(nextActive);
      if (!nextActive) setMessages([]);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'دریافت تاریخچه گفتگوها ناموفق بود'));
      // Don't clear the thread list on a transient error — preserve what the user sees
    } finally {
      setThreadLoading(false);
    }
  }, [activeThreadId, invokeAi, message]);

  const loadThreadMessages = useCallback(async (threadId: string | null) => {
    if (!threadId) {
      setMessages([]);
      return;
    }
    setMessagesLoading(true);
    try {
      const data = await invokeAi({ action: 'get_thread', threadId });
      const thread = data?.thread as AiThread | undefined;
      setMessages(Array.isArray(data?.messages) ? data.messages as AiMessage[] : []);
      if (thread?.id) {
        setThreads((prev) =>
          prev.map((item) => String(item.id) === String(thread.id) ? { ...item, ...thread } : item)
        );
      }
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'دریافت پیام‌های گفتگو ناموفق بود'));
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  }, [invokeAi, message]);

  useEffect(() => {
    void loadThreads();
  }, []);

  useEffect(() => {
    void loadThreadMessages(activeThreadId);
  }, [activeThreadId, loadThreadMessages]);

  const submitMessage = useCallback(async (rawText?: string, forceNewThread = false) => {
    const text = String(rawText ?? input).trim();
    if (!text || sending) return;
    if (activeThread && !isActiveOwner) {
      message.warning('این گفتگو توسط همکار شما به اشتراک گذاشته شده و فقط قابل مشاهده است.');
      return;
    }

    const optimistic: AiMessage = {
      id: `pending-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setInput('');
    setMessages((prev) => [...prev, optimistic]);
    setSending(true);
    try {
      const data = await invokeAi({
        action: 'chat',
        capability: 'dashboard_chat',
        message: text,
        threadId: forceNewThread ? null : activeThreadId,
        forceNewThread,
        context: {
          mode: 'dashboard',
          source: 'ai_chat_page',
        },
      });
      const nextThreadId = String(data?.thread?.id || data?.threadId || activeThreadId || '').trim() || null;
      if (nextThreadId) {
        setActiveThreadId(nextThreadId);
        // Reload messages to replace optimistic msg with real DB messages (incl. AI response)
        await loadThreadMessages(nextThreadId);
        // Refresh thread list in background — don't block message display
        void loadThreads(nextThreadId);
      }
    } catch (error: any) {
      setMessages((prev) => prev.filter((item) => item.id !== optimistic.id));
      setInput(text);
      message.error(toFaErrorMessage(error, 'ارسال پیام به هوش مصنوعی ناموفق بود'));
    } finally {
      setSending(false);
    }
  }, [activeThread, activeThreadId, input, invokeAi, isActiveOwner, loadThreadMessages, loadThreads, message, sending]);

  useEffect(() => {
    if (autoPromptHandledRef.current) return;
    const params = new URLSearchParams(location.search);
    const prompt = String(params.get('prompt') || '').trim();
    if (!prompt) return;
    autoPromptHandledRef.current = true;
    void submitMessage(prompt, true).then(() => {
      navigate('/ai', { replace: true });
    });
  }, [location.search, navigate, submitMessage]);

  const startVoice = useCallback(() => {
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      message.warning('مرورگر شما از ورودی صوتی پشتیبانی نمی‌کند. از Chrome یا Edge استفاده کنید.');
      return;
    }
    if (voiceActive) {
      recognitionRef.current?.stop();
      setVoiceActive(false);
      return;
    }
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'fa-IR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    recognition.onstart = () => setVoiceActive(true);
    recognition.onresult = (event: any) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript || '').trim();
      if (transcript) setInput((prev) => (prev ? `${prev} ${transcript}` : transcript).trim());
    };
    recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        message.error('خطا در دریافت صدا. دوباره تلاش کنید.');
      }
      setVoiceActive(false);
    };
    recognition.onend = () => setVoiceActive(false);
    try {
      recognition.start();
    } catch {
      setVoiceActive(false);
    }
  }, [voiceActive, message]);

  const loadShareOptions = useCallback(async () => {
    try {
      const bootstrap = await fetchSessionBootstrap(supabase);
      const currentOrgId = String(bootstrap?.orgId || '').trim();
      const currentUserId = String(bootstrap?.user?.id || '').trim();
      if (!currentOrgId) return;
      const [profilesResult, rolesResult] = await Promise.all([
        loadProfilesWithCompat(supabase, {
          orgId: currentOrgId,
          limit: 500,
          cacheKey: `ai-chat-share:profiles:${currentOrgId}`,
          orderByFullName: true,
        }),
        supabase
          .from('org_roles')
          .select('id, title')
          .eq('org_id', currentOrgId)
          .order('title', { ascending: true })
          .limit(200),
      ]);
      if (profilesResult.error) throw profilesResult.error;
      if (rolesResult.error) throw rolesResult.error;
      setUserOptions((profilesResult.data || [])
        .filter((user: any) => String(user?.id || '') !== currentUserId)
        .map((user: any) => ({
          label: String(user?.full_name || user?.email || user?.mobile_1 || '').trim() || 'کاربر بدون نام',
          value: String(user.id),
        })));
      setRoleOptions((rolesResult.data || []).map((role: any) => ({
        label: String(role?.title || '').trim() || 'نقش بدون نام',
        value: String(role.id),
      })));
    } catch (error) {
      console.warn('Could not load AI chat share options', error);
    }
  }, []);

  const openShareModal = () => {
    if (!activeThread || !isActiveOwner) return;
    setShareUserIds(normalizeIdArray(activeThread.shared_user_ids));
    setShareRoleIds(normalizeIdArray(activeThread.shared_role_ids));
    setShareOpen(true);
    void loadShareOptions();
  };

  const saveShare = async () => {
    if (!activeThreadId) return;
    setShareSaving(true);
    try {
      await invokeAi({
        action: 'share_thread',
        threadId: activeThreadId,
        sharedUserIds: shareUserIds,
        sharedRoleIds: shareRoleIds,
      });
      message.success('اشتراک‌گذاری گفتگو ذخیره شد.');
      setShareOpen(false);
      await loadThreads(activeThreadId);
      await loadThreadMessages(activeThreadId);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ذخیره اشتراک‌گذاری گفتگو ناموفق بود'));
    } finally {
      setShareSaving(false);
    }
  };

  const renameActiveThread = async () => {
    if (!activeThreadId || !renameTitle.trim()) return;
    setRenaming(true);
    try {
      await invokeAi({ action: 'rename_thread', threadId: activeThreadId, title: renameTitle.trim() });
      message.success('عنوان گفتگو تغییر کرد.');
      setRenameTitle('');
      await loadThreads(activeThreadId);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'تغییر عنوان گفتگو ناموفق بود'));
    } finally {
      setRenaming(false);
    }
  };

  const archiveActiveThread = async () => {
    if (!activeThreadId) return;
    try {
      await invokeAi({ action: 'archive_thread', threadId: activeThreadId });
      message.success('گفتگو آرشیو شد.');
      setActiveThreadId(null);
      setMessages([]);
      await loadThreads(null);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'آرشیو گفتگو ناموفق بود'));
    }
  };

  const filteredThreads = useMemo(() => {
    const query = threadSearch.trim().toLocaleLowerCase('fa-IR');
    if (!query) return threads;
    return threads.filter((thread) =>
      String(thread.title || 'گفتگوی بدون عنوان').toLocaleLowerCase('fa-IR').includes(query)
    );
  }, [threadSearch, threads]);

  const startNewChat = () => {
    setActiveThreadId(null);
    setMessages([]);
    setInput('');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 dark:bg-dark-bg md:p-6" dir="rtl">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row-reverse">
        <aside className="w-full md:w-80">
          <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-dark-border dark:bg-dark-surface">
            <Button type="primary" block icon={<PlusOutlined />} onClick={startNewChat}>
              گفتگوی جدید
            </Button>
            <Input
              className="mt-3"
              allowClear
              prefix={<SearchOutlined className="text-gray-400" />}
              placeholder="جستجوی گفتگوها"
              value={threadSearch}
              onChange={(event) => setThreadSearch(event.target.value)}
            />
            <div className="mt-3 max-h-[calc(100vh-210px)] space-y-2 overflow-auto pr-1">
              {threadLoading ? (
                <div className="py-8 text-center"><Spin /></div>
              ) : filteredThreads.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="گفتگویی ثبت نشده است" />
              ) : (
                filteredThreads.map((thread) => {
                  const active = String(thread.id) === String(activeThreadId);
                  return (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => setActiveThreadId(thread.id)}
                      className={`w-full rounded-lg border px-3 py-3 text-right transition ${
                        active
                          ? 'border-leather-400 bg-leather-50 text-leather-800 dark:border-leather-500 dark:bg-leather-900/20 dark:text-leather-100'
                          : 'border-gray-200 bg-white hover:border-gray-300 dark:border-dark-border dark:bg-dark-surface'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="line-clamp-2 text-sm font-semibold">
                          {thread.title || 'گفتگوی بدون عنوان'}
                        </span>
                        {thread.is_shared ? <Tag color="blue" className="m-0 shrink-0">مشترک</Tag> : null}
                      </div>
                      <div className="mt-2 text-xs text-gray-500">{formatThreadDate(thread.updated_at || thread.created_at)}</div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        <main className="min-h-[calc(100vh-48px)] flex-1 rounded-lg border border-gray-200 bg-white shadow-sm dark:border-dark-border dark:bg-dark-surface">
          <div className="flex min-h-[calc(100vh-48px)] flex-col">
            <header className="flex flex-col gap-3 border-b border-gray-100 p-4 dark:border-dark-border md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar icon={<RobotOutlined />} className="bg-leather-500" />
                <div className="min-w-0">
                  <Typography.Title level={4} className="!mb-0 truncate">
                    {activeThread?.title || 'هوش مصنوعی تازه سیستم'}
                  </Typography.Title>
                  <div className="text-xs text-gray-500">
                    {activeThread
                      ? activeThread.is_owner === false
                        ? 'گفتگوی به‌اشتراک‌گذاشته‌شده'
                        : 'تاریخچه اختصاصی شما'
                      : 'گفتگوی جدید'}
                  </div>
                </div>
              </div>
              <Space wrap>
                {activeThread && isActiveOwner ? (
                  <>
                    <Tooltip title="اشتراک‌گذاری با همکاران یا نقش‌ها">
                      <Button icon={<ShareAltOutlined />} onClick={openShareModal}>
                        اشتراک‌گذاری
                      </Button>
                    </Tooltip>
                    <Input
                      className="w-56"
                      placeholder="عنوان جدید"
                      value={renameTitle}
                      onChange={(event) => setRenameTitle(event.target.value)}
                      onPressEnter={renameActiveThread}
                    />
                    <Button icon={<EditOutlined />} loading={renaming} onClick={renameActiveThread}>
                      تغییر عنوان
                    </Button>
                    <Tooltip title="آرشیو گفتگو">
                      <Button danger icon={<DeleteOutlined />} onClick={archiveActiveThread} />
                    </Tooltip>
                  </>
                ) : null}
              </Space>
            </header>

            <section className="flex-1 overflow-auto p-4">
              {messagesLoading ? (
                <div className="py-16 text-center"><Spin /></div>
              ) : messages.length === 0 ? (
                <div className="flex h-full min-h-[360px] items-center justify-center">
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="سوال خود را بپرسید تا یک گفتگوی جدید شروع شود"
                  />
                </div>
              ) : (
                <div className="mx-auto max-w-3xl space-y-4">
                  {messages.map((item) => {
                    const isUser = item.role === 'user';
                    const isAssistant = item.role === 'assistant';
                    const modelName = item.model || item.metadata?.usage?.model || null;
                    const cost = isAssistant ? formatCostFa(item) : null;
                    const time = formatMessageTime(item.created_at);
                    return (
                      <div key={item.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                        {!isUser ? <Avatar icon={<RobotOutlined />} className="mt-1 bg-leather-500" /> : null}
                        <div className={`flex max-w-[85%] flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                          <div
                            className={`whitespace-pre-wrap rounded-lg px-4 py-3 leading-7 ${
                              isUser
                                ? 'bg-leather-500 text-white'
                                : 'border border-gray-200 bg-gray-50 text-gray-800 dark:border-dark-border dark:bg-dark-bg dark:text-gray-100'
                            }`}
                          >
                            {item.content}
                          </div>
                          {(time || modelName || cost) ? (
                            <div
                              className="mt-1 flex flex-wrap items-center gap-x-2 px-1 text-[10px] text-gray-400 dark:text-gray-500"
                              dir="ltr"
                            >
                              {time ? <span>{time}</span> : null}
                              {modelName ? <span className="font-mono">{modelName}</span> : null}
                              {cost ? <span>{cost}</span> : null}
                            </div>
                          ) : null}
                        </div>
                        {isUser ? <Avatar icon={<UserOutlined />} className="mt-1 bg-gray-500" /> : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <footer className="border-t border-gray-100 p-4 dark:border-dark-border">
              {activeThread && !isActiveOwner ? (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-100">
                  این گفتگو توسط همکار شما به اشتراک گذاشته شده و فقط قابل مشاهده است.
                </div>
              ) : null}
              <div className="flex gap-2">
                <Input.TextArea
                  autoSize={{ minRows: 1, maxRows: 5 }}
                  placeholder="از هوش مصنوعی تازه سیستم بپرسید..."
                  value={input}
                  disabled={Boolean(activeThread && !isActiveOwner)}
                  onChange={(event) => setInput(event.target.value)}
                  onPressEnter={(event) => {
                    if (!event.shiftKey) {
                      event.preventDefault();
                      void submitMessage();
                    }
                  }}
                />
                <Tooltip title={voiceActive ? 'توقف ضبط' : 'ورودی صوتی (فارسی)'}>
                  <Button
                    icon={<AudioOutlined />}
                    danger={voiceActive}
                    disabled={Boolean(activeThread && !isActiveOwner)}
                    onClick={startVoice}
                    className={voiceActive ? 'animate-pulse' : ''}
                  />
                </Tooltip>
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  loading={sending}
                  disabled={!input.trim() || Boolean(activeThread && !isActiveOwner)}
                  onClick={() => void submitMessage()}
                >
                  ارسال
                </Button>
              </div>
            </footer>
          </div>
        </main>
      </div>

      <Modal
        title="اشتراک‌گذاری گفتگو"
        open={shareOpen}
        onCancel={() => setShareOpen(false)}
        onOk={saveShare}
        confirmLoading={shareSaving}
        okText="ذخیره"
        cancelText="انصراف"
      >
        <div className="space-y-4">
          <Select
            mode="multiple"
            allowClear
            className="w-full"
            placeholder="انتخاب همکاران"
            options={userOptions}
            value={shareUserIds}
            onChange={(values) => setShareUserIds(values.map((item) => String(item)))}
            optionFilterProp="label"
          />
          <Select
            mode="multiple"
            allowClear
            className="w-full"
            placeholder="انتخاب نقش‌ها"
            options={roleOptions}
            value={shareRoleIds}
            onChange={(values) => setShareRoleIds(values.map((item) => String(item)))}
            optionFilterProp="label"
          />
          <div className="text-xs leading-6 text-gray-500">
            گفتگوها در حالت پیش‌فرض فقط برای مالک قابل مشاهده‌اند. با ذخیره این بخش، فقط کاربران یا نقش‌های انتخاب‌شده در همین سازمان می‌توانند گفتگو را ببینند.
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AiChatPage;
