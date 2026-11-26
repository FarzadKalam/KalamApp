import React, { useState } from 'react';
import { Button, Tag, Tooltip } from 'antd';
import { ThoughtChain, type ThoughtChainItem } from '@ant-design/x';
import {
  AudioOutlined,
  BookOutlined,
  BulbOutlined,
  CheckOutlined,
  ClusterOutlined,
  CommentOutlined,
  CompassOutlined,
  DatabaseOutlined,
  DownOutlined,
  FileSearchOutlined,
  FileWordOutlined,
  FormOutlined,
  GlobalOutlined,
  LoadingOutlined,
  MessageOutlined,
  NodeIndexOutlined,
  PictureOutlined,
  SafetyCertificateOutlined,
  SoundOutlined,
  StopOutlined,
  ThunderboltOutlined,
  UpOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import {
  AI_ACTIVITY_ACTION_BY_CAPABILITY,
  getAiAgent,
  type AiActivityActionType,
  type AiAgentActivity,
} from '../../supabase/functions/_shared/ai-agents';
import './AiChatPresentation.css';

type Props = {
  agentId?: string;
  activities?: AiAgentActivity[];
  streaming?: boolean;
  onStop?: () => void;
};

const ACTION_ICON_MAP: Record<AiActivityActionType, React.ReactNode> = {
  routing: <CompassOutlined />,
  read_data: <DatabaseOutlined />,
  search_knowledge: <BookOutlined />,
  web_search: <GlobalOutlined />,
  analyze_document: <FileSearchOutlined />,
  transcribe_voice: <AudioOutlined />,
  generate_voice: <SoundOutlined />,
  generate_image: <PictureOutlined />,
  edit_image: <PictureOutlined />,
  generate_video: <VideoCameraOutlined />,
  generate_file: <FileWordOutlined />,
  deep_reasoning: <BulbOutlined />,
  legal_review: <SafetyCertificateOutlined />,
  record_mutation: <FormOutlined />,
  process_operation: <NodeIndexOutlined />,
  generating_reply: <MessageOutlined />,
  customer_reply: <CommentOutlined />,
  workflow_action: <ThunderboltOutlined />,
  indexing: <ClusterOutlined />,
};

const ACTION_LABEL_MAP: Record<AiActivityActionType, string> = {
  routing: 'بررسی و انتخاب مسیر مناسب',
  read_data: 'خواندن اطلاعات سازمان',
  search_knowledge: 'جستجو در دانش سازمان',
  web_search: 'جستجو در اینترنت',
  analyze_document: 'تحلیل فایل و سند پیوست',
  transcribe_voice: 'تبدیل گفتار به متن',
  generate_voice: 'تولید خروجی صوتی',
  generate_image: 'ساخت تصویر',
  edit_image: 'اصلاح تصویر',
  generate_video: 'ساخت ویدیو',
  generate_file: 'تولید فایل',
  deep_reasoning: 'تحلیل عمیق مسئله',
  legal_review: 'بررسی حقوقی',
  record_mutation: 'آماده‌سازی ثبت یا ویرایش رکورد',
  process_operation: 'بررسی و اجرای فرآیند',
  generating_reply: 'نگارش پاسخ',
  customer_reply: 'آماده‌سازی پاسخ مشتری',
  workflow_action: 'اجرای گردش کار',
  indexing: 'نمایه‌سازی دانش',
};

export const getActivityIcon = (activity: AiAgentActivity): React.ReactNode => {
  const actionType = activity.actionType || AI_ACTIVITY_ACTION_BY_CAPABILITY[activity.agentId] || 'generating_reply';
  return ACTION_ICON_MAP[actionType] || <ThunderboltOutlined />;
};

export const getActivityLineText = (activity: AiAgentActivity): string => {
  if (activity.detail) return activity.detail.endsWith('…') ? activity.detail : `${activity.detail}…`;
  const fallback = getAiAgent(activity.agentId);
  const raw = fallback.activity || (activity.actionType ? ACTION_LABEL_MAP[activity.actionType] : 'در حال پردازش');
  return raw.endsWith('…') ? raw : `${raw}…`;
};

const buildThoughtChainItems = (items: AiAgentActivity[], streaming: boolean): ThoughtChainItem[] =>
  items.map((item, idx) => {
    const isRunning = streaming && item.phase === 'started';
    const titleText = getActivityLineText(item);
    const agentLabel = getAiAgent(item.agentId).label;
    const actionLabel = item.actionType ? ACTION_LABEL_MAP[item.actionType] : '';
    const descriptionText = item.detail && agentLabel && !item.detail.includes(agentLabel)
      ? agentLabel
      : actionLabel && !titleText.includes(actionLabel)
        ? actionLabel
        : undefined;

    return {
      key: `${item.agentId}-${idx}`,
      icon: isRunning ? <LoadingOutlined spin /> : getActivityIcon(item),
      title: (
        <span className={isRunning ? 'font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}>
          {titleText}
        </span>
      ),
      description: descriptionText,
      status: isRunning ? 'pending' : 'success',
      extra: isRunning ? (
        <Tag color="processing" className="m-0 rounded-full text-[10px]">
          در حال اجرا
        </Tag>
      ) : (
        <CheckOutlined className="text-[11px] text-emerald-500" />
      ),
    };
  });

export default function AiActivityStatus({ agentId = 'text_chat', activities = [], streaming = true, onStop }: Props) {
  const [expanded, setExpanded] = useState(false);

  const items: AiAgentActivity[] = activities.length
    ? activities
    : streaming
      ? [{ agentId: (agentId as any) || 'text_chat', phase: 'started', at: Date.now() }]
      : [];

  if (!items.length) return null;

  const runningCount = items.filter((item) => item.phase === 'started').length;
  const completedCount = items.filter((item) => item.phase === 'completed').length;
  const chainItems = buildThoughtChainItems(items, streaming);

  // After streaming completes, keep a compact AntD X v2-inspired collapsible Think block
  if (!streaming && completedCount > 0) {
    return (
      <div className="ai-chat-theme ai-think-box mb-2" dir="rtl">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="ai-think-trigger inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11.5px] font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
        >
          <BulbOutlined className="text-[12px] text-[rgb(var(--brand-600-rgb))] dark:text-[rgb(var(--brand-300-rgb))]" />
          <span>{completedCount.toLocaleString('fa-IR')} مرحله بررسی و انجام شد</span>
          {expanded ? <UpOutlined className="text-[9px]" /> : <DownOutlined className="text-[9px]" />}
        </button>
        {expanded && (
          <div className="ai-think-body mt-1.5 rounded-xl border border-[var(--ai-chat-line)] bg-[var(--ai-chat-surface)] p-2.5">
            <ThoughtChain size="small" items={chainItems} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="ai-chat-theme ai-activity-status ai-think-streaming rounded-xl border border-[var(--ai-chat-line)] bg-[var(--ai-chat-surface)] px-3 py-2.5"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      dir="rtl"
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-700 dark:text-slate-200">
            <BulbOutlined className="text-[rgb(var(--brand-600-rgb))] dark:text-[rgb(var(--brand-300-rgb))]" />
            <span className="ai-think-shimmer">فرآیند بررسی و آماده‌سازی دستیار</span>
          </div>
          {onStop && runningCount > 0 && (
            <Tooltip title="توقف دریافت پاسخ">
              <Button
                type="text"
                size="small"
                className="ai-chat-icon shrink-0"
                icon={<StopOutlined />}
                aria-label="توقف دریافت پاسخ"
                onClick={onStop}
              />
            </Tooltip>
          )}
        </div>
        <ThoughtChain size="small" items={chainItems} />
      </div>
    </div>
  );
}
