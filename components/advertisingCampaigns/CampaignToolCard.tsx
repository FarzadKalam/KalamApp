import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Progress, Tag, Tooltip } from 'antd';
import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SendOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import {
  CAMPAIGN_TOOL_STATUS_OPTIONS,
  getCampaignToolDefinition,
  getCampaignToolLabel,
  type CampaignAccessMode,
} from '../../utils/advertisingCampaigns';
import type { CampaignToolAction, CampaignToolRecord } from './types';

type CampaignToolCardProps = {
  tool: CampaignToolRecord;
  accessMode: CampaignAccessMode;
  currencyLabel?: string;
  actionLoading?: CampaignToolAction | null;
  onOpen: (tool: CampaignToolRecord) => void;
  onAction?: (action: CampaignToolAction, tool: CampaignToolRecord) => void | Promise<void>;
};

const ACTION_META: Record<CampaignToolAction, { label: string; icon: React.ReactNode; danger?: boolean; primary?: boolean }> = {
  test: { label: 'ارسال آزمایشی', icon: <SendOutlined /> },
  prepare: { label: 'آماده‌سازی', icon: <CheckCircleOutlined />, primary: true },
  send_now: { label: 'ارسال اکنون', icon: <SendOutlined />, primary: true },
  schedule: { label: 'زمان‌بندی', icon: <ClockCircleOutlined /> },
  pause: { label: 'توقف', icon: <PauseCircleOutlined /> },
  resume: { label: 'ادامه', icon: <PlayCircleOutlined />, primary: true },
  cancel: { label: 'لغو', icon: <StopOutlined />, danger: true },
  retry: { label: 'تلاش مجدد', icon: <ReloadOutlined />, primary: true },
  start_manual: { label: 'شروع اجرا', icon: <PlayCircleOutlined />, primary: true },
  complete_manual: { label: 'ثبت تکمیل', icon: <CheckCircleOutlined />, primary: true },
};

const statusMeta = (status: string) => CAMPAIGN_TOOL_STATUS_OPTIONS.find((item) => item.value === status)
  || { label: status || 'نامشخص', value: status, color: 'default' };

export const isAutomatedCampaignTool = (tool: CampaignToolRecord) => {
  const explicit = (tool as CampaignToolRecord & { is_automated?: boolean }).is_automated;
  if (typeof explicit === 'boolean') return explicit;
  const definition = getCampaignToolDefinition(tool.tool_type);
  return Boolean(definition?.dispatchable || definition?.automatedAudience);
};

export const getCampaignToolActions = (
  tool: CampaignToolRecord,
  accessMode: CampaignAccessMode,
): CampaignToolAction[] => {
  const status = String(tool.status || 'draft');
  const automated = isAutomatedCampaignTool(tool);
  let actions: CampaignToolAction[] = [];

  if (automated) {
    if (status === 'draft') actions = ['test', 'prepare'];
    else if (status === 'ready') actions = ['test', 'schedule', 'send_now'];
    else if (status === 'scheduled') actions = ['pause', 'cancel'];
    else if (status === 'running') actions = ['pause', 'cancel'];
    else if (status === 'paused') actions = ['resume', 'cancel'];
    else if (status === 'failed') actions = ['retry', 'cancel'];
  } else {
    if (status === 'draft' || status === 'ready' || status === 'scheduled') actions = ['start_manual'];
    else if (status === 'running') actions = ['pause', 'complete_manual'];
    else if (status === 'paused') actions = ['resume', 'complete_manual'];
    else if (status === 'failed') actions = ['start_manual'];
  }

  if (accessMode === 'tool_limited') {
    const permitted = new Set<CampaignToolAction>(['start_manual', 'complete_manual', 'pause', 'resume']);
    return actions.filter((action) => permitted.has(action));
  }
  return actions;
};

const buildCountdown = (targetValue?: string | null, now = Date.now()) => {
  if (!targetValue) return null;
  const target = new Date(targetValue).getTime();
  if (!Number.isFinite(target)) return null;
  const distance = target - now;
  if (distance <= 0) return 'زمان برنامه‌ریزی فرا رسیده است';
  const totalMinutes = Math.ceil(distance / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return `تا شروع: ${days > 0 ? `${toPersianNumber(days)} روز و ` : ''}${hours > 0 ? `${toPersianNumber(hours)} ساعت و ` : ''}${toPersianNumber(minutes)} دقیقه`;
};

const CampaignToolCard: React.FC<CampaignToolCardProps> = ({
  tool,
  accessMode,
  currencyLabel = '',
  actionLoading = null,
  onOpen,
  onAction,
}) => {
  const [, setClock] = useState(0);
  useEffect(() => {
    if (!tool.planned_start_at || tool.status !== 'scheduled') return undefined;
    const timer = window.setInterval(() => setClock((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [tool.planned_start_at, tool.status]);

  const automated = isAutomatedCampaignTool(tool);
  const actions = useMemo(() => getCampaignToolActions(tool, accessMode), [accessMode, tool]);
  const status = statusMeta(String(tool.status || 'draft'));
  const expectedLeads = Number(tool.expected_leads || 0);
  const actualLeads = Number(tool.actual_leads || 0);
  const expectedCustomers = Number(tool.expected_customers || 0);
  const actualCustomers = Number(tool.actual_customers || 0);
  const leadProgress = expectedLeads > 0 ? Math.min(100, Math.round((actualLeads / expectedLeads) * 100)) : 0;
  const countdown = tool.status === 'scheduled' ? buildCountdown(tool.planned_start_at) : null;

  return (
    <Card
      className="h-full !rounded-2xl !border-gray-200 transition hover:!border-[rgba(var(--brand-400-rgb),0.8)] hover:!shadow-lg dark:!border-white/10 dark:!bg-white/5"
      styles={{ body: { padding: 16 } }}
    >
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="m-0 truncate text-base font-black text-gray-800 dark:text-gray-100">
                {getCampaignToolLabel(tool.tool_type)}
              </h3>
              <Tag color={status.color}>{status.label}</Tag>
              <Tag color={automated ? 'blue' : 'gold'}>{automated ? 'ارسال خودکار' : 'اجرای دستی'}</Tag>
            </div>
            {countdown ? <div className="mt-2 text-xs font-semibold text-cyan-700 dark:text-cyan-300">{countdown}</div> : null}
          </div>
          <Tooltip title="مشاهده جزئیات ابزار">
            <Button shape="circle" icon={<EyeOutlined />} onClick={() => onOpen(tool)} aria-label="مشاهده جزئیات ابزار" />
          </Tooltip>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-gray-50 p-2.5 dark:bg-white/5">
            <div className="text-gray-500">هزینه برآوردی</div>
            <strong className="mt-1 block text-gray-800 dark:text-gray-100">{formatPersianPrice(tool.estimated_cost || 0)} {currencyLabel}</strong>
          </div>
          <div className="rounded-xl bg-gray-50 p-2.5 dark:bg-white/5">
            <div className="text-gray-500">هزینه واقعی</div>
            <strong className="mt-1 block text-gray-800 dark:text-gray-100">{formatPersianPrice(tool.actual_cost || 0)} {currencyLabel}</strong>
          </div>
          <div className="rounded-xl bg-gray-50 p-2.5 dark:bg-white/5">
            <div className="text-gray-500">لید واقعی / هدف</div>
            <strong className="mt-1 block">{toPersianNumber(actualLeads)} / {toPersianNumber(expectedLeads)}</strong>
          </div>
          <div className="rounded-xl bg-gray-50 p-2.5 dark:bg-white/5">
            <div className="text-gray-500">مشتری واقعی / هدف</div>
            <strong className="mt-1 block">{toPersianNumber(actualCustomers)} / {toPersianNumber(expectedCustomers)}</strong>
          </div>
        </div>

        <Progress percent={leadProgress} size="small" format={(value) => `${toPersianNumber(value || 0)}٪ تحقق لید`} />

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
          <span><CalendarOutlined className="ml-1" />شروع: {safeJalaliFormat(tool.planned_start_at, 'YYYY/MM/DD HH:mm') || '-'}</span>
          <span>پایان: {safeJalaliFormat(tool.planned_end_at, 'YYYY/MM/DD HH:mm') || '-'}</span>
        </div>

        <div className="mt-auto flex flex-wrap gap-2 border-t border-gray-100 pt-3 dark:border-white/10">
          {actions.map((action) => {
            const meta = ACTION_META[action];
            return (
              <Button
                key={action}
                size="small"
                type={meta.primary ? 'primary' : 'default'}
                danger={meta.danger}
                icon={meta.icon}
                loading={actionLoading === action}
                disabled={!onAction || (Boolean(actionLoading) && actionLoading !== action)}
                onClick={() => onAction?.(action, tool)}
              >
                {meta.label}
              </Button>
            );
          })}
          <Button size="small" icon={<EyeOutlined />} onClick={() => onOpen(tool)}>جزئیات و گزارش</Button>
        </div>
      </div>
    </Card>
  );
};

export default CampaignToolCard;
