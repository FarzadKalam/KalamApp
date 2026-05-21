import React from 'react';
import { Button, Empty } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';

export type VoipThreadItem = {
  id: string;
  phone: string;
  phoneNumberId: string | null;
  phoneMatchStatus: string | null;
  title: string;
  unreadCount: number;
  latestEventAt: number;
  calls: any[];
  moduleId: string | null;
  recordId: string | null;
};

type VoipCallsPanelProps = {
  layout: 'desktop' | 'mobile';
  voipThreads: VoipThreadItem[];
  selectedVoipThread: VoipThreadItem | null;
  displayedVoipCalls: any[];
  assigneeNameMap: Record<string, string>;
  setSelectedVoipThreadKey: (key: string) => void;
  openPreviewRecord: (moduleId: string, recordId: string, label?: string) => void;
  getCentralRecordLabel: (moduleId?: string | null, recordId?: string | null, fallback?: string | null) => string;
  getPhoneMatchLabel: (value: any) => string;
  getModuleFieldOptionLabel: (moduleId: string, fieldKey: string, value: any) => string;
};

const VoipCallsPanel: React.FC<VoipCallsPanelProps> = ({
  layout,
  voipThreads,
  selectedVoipThread,
  displayedVoipCalls,
  assigneeNameMap,
  setSelectedVoipThreadKey,
  openPreviewRecord,
  getCentralRecordLabel,
  getPhoneMatchLabel,
  getModuleFieldOptionLabel,
}) => {
  const isDesktop = layout === 'desktop';
  const activeThread = selectedVoipThread;
  const calls = displayedVoipCalls;

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className={`min-h-0 flex-1 ${isDesktop ? 'grid grid-cols-[250px_minmax(0,1fr)]' : 'flex flex-col'}`}>
        <div className={`${isDesktop ? 'border-l' : 'border-b'} border-slate-200/45 dark:border-white/[0.07] bg-slate-50/65 dark:bg-white/[0.025] min-h-0`}>
          {voipThreads.length === 0 ? (
            <div className="p-3">
              <Empty description="تماس ورودی جدیدی ندارید." />
            </div>
          ) : isDesktop ? (
            <div className="h-full overflow-y-auto p-2 space-y-2">
              {voipThreads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => setSelectedVoipThreadKey(thread.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-right transition-colors ${
                    activeThread?.id === thread.id
                      ? 'border-slate-300/50 bg-white/95 shadow-[0_6px_18px_rgba(15,23,42,0.05)] dark:border-white/15 dark:bg-white/[0.075]'
                      : 'border-transparent bg-white/60 hover:bg-white/90 dark:bg-transparent dark:hover:bg-white/[0.055]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{thread.title}</div>
                      <div className="truncate text-[11px] text-gray-500" dir="ltr">{thread.phone || 'شماره ثبت نشده'}</div>
                      {getPhoneMatchLabel(thread.phoneMatchStatus) ? (
                        <div className="mt-1 truncate text-[11px] text-amber-600 dark:text-amber-300">{getPhoneMatchLabel(thread.phoneMatchStatus)}</div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {thread.unreadCount > 0 ? (
                        <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] text-white">
                          {toPersianNumber(String(thread.unreadCount))}
                        </span>
                      ) : null}
                      <span className="text-[10px] text-gray-400">{safeJalaliFormat(thread.calls[0]?.started_at || thread.calls[0]?.created_at, 'MM/DD HH:mm')}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex max-h-[92px] gap-1.5 overflow-x-auto px-2 py-1.5">
              {voipThreads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => setSelectedVoipThreadKey(thread.id)}
                  className={`min-w-[132px] rounded-xl border px-2.5 py-1.5 text-right ${
                    activeThread?.id === thread.id
                      ? 'border-slate-300/50 bg-white/95 shadow-[0_6px_18px_rgba(15,23,42,0.05)] dark:border-white/15 dark:bg-white/[0.075]'
                      : 'border-transparent bg-white/60 dark:bg-transparent'
                  }`}
                >
                  <div className="truncate text-xs font-semibold text-gray-800 dark:text-gray-100">{thread.title}</div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] text-gray-500" dir="ltr">{thread.phone || 'شماره ثبت نشده'}</span>
                    {thread.unreadCount > 0 ? (
                      <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] text-white">
                        {toPersianNumber(String(thread.unreadCount))}
                      </span>
                    ) : null}
                  </div>
                  {getPhoneMatchLabel(thread.phoneMatchStatus) ? (
                    <div className="mt-1 truncate text-[11px] text-amber-600 dark:text-amber-300">{getPhoneMatchLabel(thread.phoneMatchStatus)}</div>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="min-h-0 flex flex-col overflow-hidden">
          <div className="border-b border-slate-200/45 bg-white/88 px-3 py-2.5 dark:border-white/[0.07] dark:bg-white/[0.025]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {activeThread?.title || 'تماس‌های ورودی'}
                </div>
                <div className="mt-1 truncate text-[11px] text-gray-500" dir="ltr">
                  {activeThread?.phone || 'تماسی انتخاب نشده'}
                </div>
                {getPhoneMatchLabel(activeThread?.phoneMatchStatus) ? (
                  <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-300">{getPhoneMatchLabel(activeThread?.phoneMatchStatus)}</div>
                ) : null}
              </div>
              {activeThread?.moduleId && activeThread?.recordId ? (
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => openPreviewRecord(
                    activeThread.moduleId!,
                    activeThread.recordId!,
                    getCentralRecordLabel(activeThread.moduleId, activeThread.recordId, activeThread.title),
                  )}
                >
                  رکورد مرتبط
                </Button>
              ) : null}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-slate-100/45 px-3 py-3 dark:bg-black/[0.08]">
            {calls.length === 0 ? (
              <Empty description="برای این شماره تماسی ثبت نشده است." />
            ) : (
              <div className="space-y-3">
                {calls.map((row: any) => {
                  const startedAt = row?.started_at || row?.created_at;
                  const statusLabel = getModuleFieldOptionLabel('voip_call_reports', 'status', row?.status);
                  const phoneMatchLabel = getPhoneMatchLabel(row?.phone_match_status);
                  const relatedLabel = row?.module_id && row?.record_id
                    ? getCentralRecordLabel(row.module_id, row.record_id, row.title || row.source_number)
                    : '';
                  const operatorLabel = row?.assignee_id
                    ? assigneeNameMap[String(row.assignee_id)] || ''
                    : '';
                  return (
                    <div
                      key={String(row?.id || '')}
                      className="rounded-xl border border-slate-200/55 bg-white/86 px-3 py-2.5 shadow-[0_5px_16px_rgba(15,23,42,0.04)] dark:border-white/[0.08] dark:bg-white/[0.035]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                            {String(row?.title || row?.source_number || 'تماس ورودی')}
                          </div>
                          <div className="mt-1 text-[11px] text-gray-500" dir="ltr">
                            {String(row?.source_number || '').trim() || '-'}
                            {String(row?.extension || '').trim() ? ` → ${String(row.extension).trim()}` : ''}
                          </div>
                        </div>
                        <div className="text-[11px] text-gray-400">{safeJalaliFormat(startedAt, 'YYYY/MM/DD HH:mm')}</div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                        {statusLabel ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-gray-600 dark:bg-white/[0.055] dark:text-gray-200">
                            {statusLabel}
                          </span>
                        ) : null}
                        {phoneMatchLabel ? (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
                            {phoneMatchLabel}
                          </span>
                        ) : null}
                        {relatedLabel ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-gray-600 dark:bg-white/[0.055] dark:text-gray-200">
                            {relatedLabel}
                          </span>
                        ) : null}
                        {operatorLabel ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-gray-600 dark:bg-white/[0.055] dark:text-gray-200">
                            اپراتور: {operatorLabel}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 flex items-center gap-3 text-[12px]">
                        <Button type="link" size="small" className="!px-0" onClick={() => openPreviewRecord('voip_call_reports', String(row.id), String(row?.title || 'تماس VoIP'))}>
                          گزارش تماس
                        </Button>
                        {row?.module_id && row?.record_id ? (
                          <Button
                            type="link"
                            size="small"
                            className="!px-0"
                            onClick={() => openPreviewRecord(String(row.module_id), String(row.record_id), relatedLabel || 'رکورد مرتبط')}
                          >
                            {relatedLabel || 'رکورد مرتبط'}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(VoipCallsPanel);
