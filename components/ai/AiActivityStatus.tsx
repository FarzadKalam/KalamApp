import React, { useState } from 'react';
import { Button, Tooltip } from 'antd';
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
  if (activity.detail) return activity.detail;
  const fallback = getAiAgent(activity.agentId);
  const actionType = activity.actionType || AI_ACTIVITY_ACTION_BY_CAPABILITY[activity.agentId];
  return fallback.activity || (actionType ? ACTION_LABEL_MAP[actionType] : 'در حال پردازش');
};

export default function AiActivityStatus({ agentId = 'text_chat', activities = [], streaming = true, onStop }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const items: AiAgentActivity[] = activities.length
    ? activities
    : streaming
      ? [{ agentId: (agentId as any) || 'text_chat', phase: 'started', at: Date.now() }]
      : [];

  if (!items.length) return null;

  const runningCount = items.filter((item) => item.phase === 'started').length;
  const completedCount = items.filter((item) => item.phase === 'completed').length;

  // After streaming completes, keep a compact collapsible 1-line summary
  if (!streaming && completedCount > 0) {
    return (
      <div className="ai-chat-theme mb-1.5" dir="rtl">
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200"
        >
          <CheckOutlined className="text-[10px] text-emerald-500" />
          <span>{completedCount.toLocaleString('fa-IR')} فعالیت انجام شد</span>
          {collapsed ? <DownOutlined className="text-[9px]" /> : <UpOutlined className="text-[9px]" />}
        </button>
        {!collapsed && (
          <div className="mt-1 space-y-0.5 border-r-2 border-slate-200/80 pr-2 dark:border-white/10">
            {items.map((item, idx) => (
              <div
                key={`${item.agentId}-${idx}`}
                className="flex min-w-0 items-center gap-1.5 text-[11.5px] leading-5 text-slate-600 dark:text-slate-300"
              >
                <span className="shrink-0 text-[12px] text-slate-400 dark:text-slate-500">
                  {getActivityIcon(item)}
                </span>
                <span className="truncate">{getActivityLineText(item)}</span>
                <CheckOutlined className="mr-auto shrink-0 text-[10px] text-emerald-500" />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ai-chat-theme ai-activity-status" role="status" aria-live="polite" aria-atomic="true" dir="rtl">
      <div className="ai-activity-lines flex-1 min-w-0">
        {items.map((item, idx) => {
          const isRunning = item.phase === 'started';
          return (
            <div
              className="ai-activity-line flex min-w-0 items-center gap-2 text-[12px] leading-5"
              key={`${item.agentId}-${idx}`}
            >
              <span className={`shrink-0 text-[13px] ${isRunning ? 'text-[rgb(var(--brand-600-rgb))] dark:text-[rgb(var(--brand-300-rgb))]' : 'text-slate-400 dark:text-slate-500'}`}>
                {getActivityIcon(item)}
              </span>
              <span className={`truncate ${isRunning ? 'font-medium text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>
                {getActivityLineText(item)}
              </span>
              <span className="mr-auto shrink-0 text-[11px]">
                {isRunning ? (
                  <LoadingOutlined className="text-[rgb(var(--brand-600-rgb))] dark:text-[rgb(var(--brand-300-rgb))]" />
                ) : (
                  <CheckOutlined className="text-emerald-500" />
                )}
              </span>
            </div>
          );
        })}
      </div>
      {onStop && runningCount > 0 && (
        <Tooltip title="توقف دریافت پاسخ">
          <Button type="text" className="ai-chat-icon shrink-0" icon={<StopOutlined />} aria-label="توقف دریافت پاسخ" onClick={onStop} />
        </Tooltip>
      )}
    </div>
  );
}
