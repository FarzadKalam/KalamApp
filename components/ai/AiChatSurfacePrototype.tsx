import React, { useState } from 'react';
import {
  AudioOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  MenuOutlined,
  PaperClipOutlined,
  PlusOutlined,
  SearchOutlined,
  SendOutlined,
  TeamOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons';
import { Avatar, Badge, Button, Input, Select, Switch, Tag, Tooltip } from 'antd';
import AiSparkleIcon from './AiSparkleIcon';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import { MODULES } from '../../moduleRegistry';

type AiThread = {
  key: string;
  title: string;
  subtitle: string;
  preview: string;
  time: string;
  unread: number;
  members: string;
  relatedModuleId?: string;
  relatedRecordTitle?: string;
  relatedScope?: 'record' | 'module' | 'page';
};

type AiMessage = {
  id: string;
  threadKey: string;
  role: 'user' | 'assistant' | 'system';
  author: string;
  text: string;
  time: string;
  status?: string;
  pending?: 'thinking' | 'image' | 'file';
};

const aiThreads: AiThread[] = [
  {
    key: 'sales-copilot',
    title: 'تحلیل فروش امروز',
    subtitle: 'گفتگوی مستقیم با هوش مصنوعی',
    preview: 'پیشنهاد پاسخ و خلاصه وضعیت آماده شد.',
    time: 'الان',
    unread: 1,
    members: '۱ نفر',
  },
  {
    key: 'invoice-record',
    title: 'چت کنار فاکتور ۱۴۰۳-۱۲۱',
    subtitle: 'زمینه رکورد فعال',
    preview: 'اختلاف پرداخت و مانده فاکتور بررسی شد.',
    time: '۱۰:۲۰',
    unread: 0,
    members: '۳ نفر',
    relatedModuleId: 'invoices',
    relatedRecordTitle: 'فاکتور فروش ۱۴۰۳-۱۲۱',
    relatedScope: 'record',
  },
  {
    key: 'support-room',
    title: 'گروه پشتیبانی + هوش مصنوعی',
    subtitle: 'گروه داخلی با مدل منتخب',
    preview: 'همکاران درباره متن پاسخ مشتری نظر دادند.',
    time: 'دیروز',
    unread: 2,
    members: '۵ نفر',
    relatedModuleId: 'customers',
    relatedScope: 'page',
  },
];

const aiMessages: AiMessage[] = [
  {
    id: 'ai-1',
    threadKey: 'sales-copilot',
    role: 'user',
    author: 'کاربر سازمان',
    text: 'از وضعیت فروش امروز یک خلاصه مدیریتی بده و اگر نکته مهمی هست بگو.',
    time: '۱۵:۰۲',
    status: 'ارسال شده',
  },
  {
    id: 'ai-2',
    threadKey: 'sales-copilot',
    role: 'assistant',
    author: 'دستیار هوش مصنوعی',
    text: 'فروش امروز نسبت به میانگین هفته بهتر است. دو مشتری بزرگ هنوز پیگیری باز دارند و پیشنهاد می‌شود قبل از پایان روز وضعیت پرداخت بررسی شود.',
    time: '۱۵:۰۳',
    status: 'مدل: پیشرفته',
  },
  {
    id: 'ai-3',
    threadKey: 'sales-copilot',
    role: 'assistant',
    author: 'دستیار هوش مصنوعی',
    text: 'در حال آماده‌سازی نمودار تصویری فروش...',
    time: '۱۵:۰۴',
    pending: 'image',
  },
  {
    id: 'ai-4',
    threadKey: 'invoice-record',
    role: 'assistant',
    author: 'دستیار هوش مصنوعی',
    text: 'در حال تحلیل فایل پیوست و مقایسه با مانده فاکتور...',
    time: '۱۰:۲۱',
    pending: 'file',
  },
];

const formatCount = (value: number) => (value > 0 ? toPersianNumber(String(value)) : 0);

const pendingLabel = {
  thinking: 'در حال فکر کردن...',
  image: 'در حال ساخت تصویر...',
  file: 'در حال تحلیل یا ساخت فایل...',
};

const getModuleLabelFa = (moduleId?: string | null) => {
  const key = String(moduleId || '').trim();
  if (!key) return '';
  return MODULES[key]?.titles?.fa || key;
};

const getAiRelatedContextLabel = (thread: AiThread) => {
  const moduleLabel = getModuleLabelFa(thread.relatedModuleId);
  const recordTitle = String(thread.relatedRecordTitle || '').trim();
  if (!moduleLabel && !recordTitle) return '';
  if (thread.relatedScope === 'module') return `بخش مرتبط: ${moduleLabel}`;
  if (thread.relatedScope === 'page') return `صفحه مرتبط: ${moduleLabel}`;
  return `رکورد مرتبط: ${[moduleLabel, recordTitle].filter(Boolean).join(' - ')}`;
};

const AiThreadList: React.FC<{
  selectedKey: string;
  onSelect: (key: string) => void;
  compact?: boolean;
}> = ({ selectedKey, onSelect, compact = false }) => (
  <div className={compact ? 'flex h-full flex-col gap-1 overflow-y-auto px-1 py-1.5' : 'flex h-full min-h-0 flex-col'}>
    {!compact ? (
      <div className="border-b border-slate-200/60 bg-white/88 px-3 py-2.5 dark:border-white/[0.07] dark:bg-[#17191c]">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">هوش مصنوعی نسخه ۲</div>
            <div className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">Threadها و گفتگوهای کنار رکورد</div>
          </div>
          <Tooltip title="جستجوی گفتگو">
            <Button type="text" shape="circle" icon={<SearchOutlined />} aria-label="جستجوی گفتگوی هوش مصنوعی" />
          </Tooltip>
        </div>
        <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5">
          {['همه', 'مستقیم', 'کنار رکورد', 'گروهی'].map((label) => (
            <button
              type="button"
              key={label}
              className="inline-flex h-8 shrink-0 items-center rounded-full border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.035] dark:text-slate-300"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    ) : null}
    <div className={compact ? 'space-y-1' : 'min-h-0 flex-1 overflow-y-auto p-1.5'}>
      {aiThreads.map((thread) => {
        const active = thread.key === selectedKey;
        if (compact) {
          return (
            <button
              type="button"
              key={thread.key}
              title={thread.title}
              onClick={() => onSelect(thread.key)}
              className={`flex w-full flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition ${active ? 'bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.10),0_8px_18px_rgba(15,23,42,0.08)] dark:bg-white/[0.10]' : 'hover:bg-white/80 dark:hover:bg-white/[0.06]'}`}
            >
              <Badge count={formatCount(thread.unread)} size="small" color="#c0392b">
                <Avatar size={34} className="!bg-indigo-50 !text-indigo-700 dark:!bg-indigo-500/15 dark:!text-indigo-200">
                  <AiSparkleIcon className="h-4 w-4" />
                </Avatar>
              </Badge>
              <span className="line-clamp-2 min-h-7 text-center text-[9.5px] leading-3.5 text-slate-500 dark:text-slate-400">{thread.title}</span>
            </button>
          );
        }
        return (
          <button
            type="button"
            key={thread.key}
            onClick={() => onSelect(thread.key)}
            className={`mb-1.5 flex w-full items-start gap-2.5 rounded-xl border px-2.5 py-2 text-right transition ${active ? 'border-slate-300/80 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.08)] dark:border-white/15 dark:bg-white/[0.085]' : 'border-transparent bg-white/58 hover:bg-white/92 dark:bg-transparent dark:hover:bg-white/[0.055]'}`}
          >
            <Badge count={formatCount(thread.unread)} size="small" color="#c0392b">
              <Avatar size={36} className="!bg-indigo-50 !text-indigo-700 dark:!bg-indigo-500/15 dark:!text-indigo-200">
                <AiSparkleIcon className="h-4 w-4" />
              </Avatar>
            </Badge>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">{thread.title}</span>
                <span className="shrink-0 text-[10px] text-slate-400">{thread.time}</span>
              </span>
              <span className="mt-1 flex min-w-0 items-center gap-1.5">
                <Tag color="geekblue" className="!m-0 !rounded-full !text-[10px]"><AiSparkleIcon className="ml-1 inline h-3 w-3" />AI</Tag>
                <span className="truncate text-[11px] text-slate-500 dark:text-slate-400">{thread.subtitle}</span>
              </span>
              <span className="mt-1 line-clamp-1 text-[11.5px] leading-5 text-slate-500 dark:text-slate-300">{thread.preview}</span>
            </span>
          </button>
        );
      })}
    </div>
  </div>
);

const AiMessageCard: React.FC<{ message: AiMessage }> = ({ message }) => {
  const mine = message.role === 'user';
  return (
    <div className={`flex ${mine ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[min(720px,88%)] rounded-3xl border px-3 py-2.5 shadow-[0_12px_30px_rgba(15,23,42,0.07)] ${mine ? 'border-[rgba(var(--brand-200-rgb),0.85)] bg-[rgba(var(--brand-100-rgb),0.88)] shadow-[0_10px_26px_rgba(var(--brand-700-rgb),0.10)] dark:border-[rgba(var(--brand-300-rgb),0.22)] dark:bg-[rgba(var(--brand-700-rgb),0.30)] dark:shadow-[0_10px_26px_rgba(0,0,0,0.22)]' : 'border-slate-200/70 bg-white dark:border-white/[0.08] dark:bg-white/[0.055]'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar size={26} className={mine ? '!bg-slate-800 !text-white dark:!bg-white/15' : '!bg-indigo-50 !text-indigo-700 dark:!bg-indigo-500/15 dark:!text-indigo-200'}>
              {mine ? 'ک' : <AiSparkleIcon className="h-4 w-4" />}
            </Avatar>
            <div className="min-w-0">
              <div className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">{message.author}</div>
              <div className="text-[10px] text-slate-400">{message.time}</div>
            </div>
          </div>
          {message.status ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-white/[0.06] dark:text-slate-300"><CheckCircleOutlined /> {message.status}</span> : null}
        </div>
        <div className="mt-2 whitespace-pre-wrap text-[13px] leading-7 text-slate-700 dark:text-slate-100">{message.text}</div>
        {message.pending ? (
          <div className="mt-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-[12px] text-indigo-700 dark:border-indigo-300/20 dark:bg-indigo-500/10 dark:text-indigo-200">
            <span className="inline-flex items-center gap-2"><AiSparkleIcon className="h-4 w-4 animate-pulse" /> {pendingLabel[message.pending]}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const AiChatSurfacePrototype: React.FC = () => {
  const [selectedKey, setSelectedKey] = useState(aiThreads[0].key);
  const [threadListOpen, setThreadListOpen] = useState(false);
  const [assistantDrawerOpen, setAssistantDrawerOpen] = useState(false);
  const [aiAnswerEnabled, setAiAnswerEnabled] = useState(true);
  const activeThread = aiThreads.find((thread) => thread.key === selectedKey) || aiThreads[0];
  const messages = aiMessages.filter((message) => message.threadKey === activeThread.key);
  const relatedContextLabel = getAiRelatedContextLabel(activeThread);

  const selectThread = (key: string) => {
    setSelectedKey(key);
    setThreadListOpen(false);
  };

  return (
    <div dir="rtl" data-testid="ai-chat-v2-prototype" className="h-full min-h-0 overflow-hidden bg-slate-100 text-slate-800 dark:bg-[#101113] dark:text-slate-100">
      <div className="flex h-full min-h-0 overflow-hidden">
        <aside className="order-last hidden h-full min-h-0 w-[292px] shrink-0 border-l border-slate-200/70 bg-slate-50/86 dark:border-white/[0.07] dark:bg-[#131518] md:block">
          <AiThreadList selectedKey={selectedKey} onSelect={selectThread} />
        </aside>
        <aside className="order-last h-full min-h-0 w-[76px] shrink-0 border-l border-slate-200/70 bg-slate-50/90 dark:border-white/[0.07] dark:bg-[#131518] md:hidden">
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-slate-200/70 px-2 py-2 dark:border-white/[0.07]">
              <Button block type="text" icon={<MenuOutlined />} onClick={() => setThreadListOpen(true)} aria-label="باز کردن فهرست گفتگوهای هوش مصنوعی" />
            </div>
            <AiThreadList selectedKey={selectedKey} onSelect={selectThread} compact />
          </div>
        </aside>
        {threadListOpen ? (
          <div className="fixed inset-0 z-50 bg-slate-100 dark:bg-[#101113] md:hidden">
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center justify-between border-b border-slate-200/70 bg-white px-3 py-2 dark:border-white/[0.07] dark:bg-[#17191c]">
                <div className="text-sm font-bold">گفتگوهای هوش مصنوعی</div>
                <Button type="text" shape="circle" icon={<CloseOutlined />} onClick={() => setThreadListOpen(false)} aria-label="بستن فهرست گفتگوهای هوش مصنوعی" />
              </div>
              <AiThreadList selectedKey={selectedKey} onSelect={selectThread} />
            </div>
          </div>
        ) : null}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="border-b border-slate-200/65 bg-white/90 px-3 py-2.5 backdrop-blur dark:border-white/[0.07] dark:bg-[#17191c]/95">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Button type="text" size="small" icon={<MenuOutlined />} className="md:!hidden" onClick={() => setThreadListOpen(true)} aria-label="باز کردن فهرست گفتگوهای هوش مصنوعی" />
                <Avatar size={38} className="!bg-indigo-50 !text-indigo-700 dark:!bg-indigo-500/15 dark:!text-indigo-200"><AiSparkleIcon className="h-4 w-4" /></Avatar>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-850 dark:text-slate-100">{activeThread.title}</div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <TeamOutlined /> {activeThread.members}
                    {relatedContextLabel ? (
                      <>
                        <span>·</span>
                        <button type="button" className="truncate text-[rgb(var(--brand-700-rgb))] hover:underline dark:text-[rgb(var(--brand-300-rgb))]">
                          {relatedContextLabel}
                        </button>
                      </>
                    ) : (
                      <>
                        <span>·</span>
                        <span className="truncate">{activeThread.subtitle}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Select size="small" value="advanced" className="hidden w-32 sm:block" options={[{ value: 'advanced', label: 'مدل پیشرفته' }, { value: 'fast', label: 'مدل سریع' }]} />
                <Tooltip title="افزودن همکاران به گفتگو">
                  <Button type="text" shape="circle" icon={<UsergroupAddOutlined />} aria-label="افزودن همکاران به گفتگو" />
                </Tooltip>
                <Tooltip title="گفتگوی جدید">
                  <Button type="text" shape="circle" icon={<PlusOutlined />} aria-label="گفتگوی جدید" />
                </Tooltip>
                <Tooltip title="نمایش دراور سبک هوش مصنوعی">
                  <Button type="text" shape="circle" icon={<AiSparkleIcon className="h-4 w-4" />} aria-label="نمایش دراور سبک هوش مصنوعی" onClick={() => setAssistantDrawerOpen(true)} />
                </Tooltip>
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgba(248,250,252,0.94),rgba(241,245,249,0.82))] px-3 py-3 dark:bg-none dark:bg-[#101113]">
            <div className="mx-auto flex max-w-5xl flex-col gap-3">
              {messages.length ? messages.map((message) => <AiMessageCard key={message.id} message={message} />) : (
                <div className="rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.055] dark:text-slate-300">برای این thread هنوز پیامی ثبت نشده است.</div>
              )}
            </div>
          </div>
          <div className="border-t border-slate-200/65 bg-white/95 px-3 py-2.5 pb-[max(10px,env(safe-area-inset-bottom))] dark:border-white/[0.07] dark:bg-[#17191c]">
            <div className="mb-2 flex flex-wrap items-center justify-end gap-2 rounded-2xl bg-slate-50 px-3 py-2 dark:bg-white/[0.045]">
              <label className="inline-flex items-center gap-2 text-[12px] text-slate-600 dark:text-slate-300">
                پاسخ هوش مصنوعی
                <Switch size="small" checked={aiAnswerEnabled} onChange={setAiAnswerEnabled} />
              </label>
            </div>
            <div className="flex items-end gap-2 rounded-2xl border border-slate-200/70 bg-slate-50/85 p-2 dark:border-white/[0.08] dark:bg-white/[0.045]">
              <div className="flex shrink-0 items-center gap-1">
                <Tooltip title="پیوست تصویر، فایل، ویدیو یا صوت">
                  <Button type="text" size="small" shape="circle" icon={<PaperClipOutlined />} aria-label="افزودن پیوست" />
                </Tooltip>
                <Tooltip title="قابلیت‌های هوش مصنوعی">
                  <Button type="text" size="small" shape="circle" icon={<AiSparkleIcon className="h-4 w-4" />} aria-label="قابلیت‌های هوش مصنوعی" />
                </Tooltip>
                <Tooltip title="ضبط صدا">
                  <Button type="text" size="small" shape="circle" icon={<AudioOutlined />} aria-label="ضبط صدا" />
                </Tooltip>
              </div>
              <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} placeholder={aiAnswerEnabled ? 'پیام را بنویس؛ هوش مصنوعی پاسخ می‌دهد...' : 'پیام برای همکاران؛ هوش مصنوعی پاسخ نمی‌دهد...'} className="!border-0 !bg-transparent !shadow-none" />
              <Button type="primary" shape="circle" icon={<SendOutlined />} aria-label="ارسال پیام" />
            </div>
          </div>
        </main>
      </div>
      {assistantDrawerOpen ? (
        <div className="fixed inset-0 z-50 flex justify-start bg-black/18 backdrop-blur-[1px]" onMouseDown={() => setAssistantDrawerOpen(false)}>
          <div
            dir="rtl"
            className="m-3 flex h-[calc(100vh-24px)] w-[min(420px,calc(100vw-24px))] min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-white/[0.08] dark:bg-[#101113]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2 dark:border-white/[0.08] dark:bg-[#17191c]">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">دراور سبک هوش مصنوعی</div>
                <div className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">{relatedContextLabel || activeThread.subtitle}</div>
              </div>
              <Button type="text" shape="circle" icon={<CloseOutlined />} onClick={() => setAssistantDrawerOpen(false)} aria-label="بستن دراور هوش مصنوعی" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {messages.slice(0, 2).map((message) => <AiMessageCard key={`drawer-${message.id}`} message={message} />)}
            </div>
            <div className="border-t border-slate-200 bg-white p-2 dark:border-white/[0.08] dark:bg-[#17191c]">
              <div className="flex items-end gap-2 rounded-2xl bg-slate-50 p-2 dark:bg-white/[0.045]">
                <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} placeholder="پرسش کوتاه..." className="!border-0 !bg-transparent !shadow-none" />
                <Button type="primary" shape="circle" icon={<SendOutlined />} aria-label="ارسال پیام از دراور" />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AiChatSurfacePrototype;
