import React from 'react';
import { Badge, Button, Empty } from 'antd';
import { EditOutlined, EyeOutlined, UserAddOutlined } from '@ant-design/icons';
import { safeJalaliFormat } from '../../utils/persianNumberFormatter';
import type { NoteAttachment } from '../../utils/noteContent';
import UnreadCountBadge from './UnreadCountBadge';
import VoipRecordingPlayer from './VoipRecordingPlayer';
import AssigneeAvatarDisplay from '../common/AssigneeAvatarDisplay';

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
  roleNameMap: Record<string, string>;
  directoryUsers: any[];
  directoryRoles: any[];
  setSelectedVoipThreadKey: (key: string) => void;
  openPreviewRecord: (moduleId: string, recordId: string, label?: string) => void;
  getCentralRecordLabel: (moduleId?: string | null, recordId?: string | null, fallback?: string | null) => string;
  getPhoneMatchLabel: (value: any) => string;
  getModuleFieldOptionLabel: (moduleId: string, fieldKey: string, value: any) => string;
  onOpenPhoneMatchPicker?: (input: {
    phoneNumberId?: string | null;
    phone: string;
    moduleId?: string | null;
    recordId?: string | null;
    phoneMatchStatus?: string | null;
  }) => void;
  openCreateActivityFromMessage: (input: any) => void | Promise<void>;
  onForwardRecording?: (call: any, attachment: NoteAttachment) => void | Promise<void>;
};

const VoipCallsPanel: React.FC<VoipCallsPanelProps> = ({
  layout,
  voipThreads,
  selectedVoipThread,
  displayedVoipCalls,
  assigneeNameMap,
  roleNameMap,
  directoryUsers,
  directoryRoles,
  setSelectedVoipThreadKey,
  openPreviewRecord,
  getCentralRecordLabel,
  getPhoneMatchLabel,
  getModuleFieldOptionLabel,
  onOpenPhoneMatchPicker,
  openCreateActivityFromMessage,
  onForwardRecording,
}) => {
  const isDesktop = layout === 'desktop';
  const activeThread = selectedVoipThread;
  const calls = displayedVoipCalls;
  const handleSelectThread = React.useCallback((thread: VoipThreadItem) => {
    setSelectedVoipThreadKey(thread.id);
  }, [setSelectedVoipThreadKey]);
  const handleThreadRowKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>, thread: VoipThreadItem) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handleSelectThread(thread);
  }, [handleSelectThread]);

  const openPhoneBinding = (input: {
    phoneNumberId?: string | null;
    phone: string;
    moduleId?: string | null;
    recordId?: string | null;
    phoneMatchStatus?: string | null;
  }) => {
    if (!onOpenPhoneMatchPicker) return;
    if (!String(input.phone || '').trim()) return;
    onOpenPhoneMatchPicker(input);
  };

  return (
    <div className="h-full min-h-0 flex overflow-hidden">
      <div className={`min-h-0 flex-1 ${isDesktop ? 'grid grid-cols-[250px_minmax(0,1fr)]' : 'flex'}`}>
        <div className={`${isDesktop ? 'border-l' : 'order-last w-[72px] shrink-0 border-l'} border-slate-200/45 dark:border-white/[0.07] bg-slate-50/65 dark:bg-white/[0.025] min-h-0 overflow-hidden`}>
          {voipThreads.length === 0 ? (
            <div className="p-3">
              <Empty description="تماسی برای نمایش وجود ندارد." />
            </div>
          ) : isDesktop ? (
            <div className="min-h-0 h-full overflow-y-auto p-2 space-y-2">
              {voipThreads.map((thread) => (
                <div
                  key={thread.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectThread(thread)}
                  onKeyDown={(event) => handleThreadRowKeyDown(event, thread)}
                  className={`w-full rounded-xl border px-3 py-2 text-right transition-colors ${
                    activeThread?.id === thread.id
                      ? 'border-slate-300/50 bg-white/95 shadow-[0_6px_18px_rgba(15,23,42,0.05)] dark:border-white/15 dark:bg-white/[0.075]'
                      : 'border-transparent bg-white/60 hover:bg-white/90 dark:bg-transparent dark:hover:bg-white/[0.055]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{thread.title}</div>
                      <button
                        type="button"
                        dir="ltr"
                        className="truncate text-[11px] text-gray-500 transition-colors hover:text-[rgb(var(--brand-700-rgb))] dark:hover:text-[rgb(var(--brand-300-rgb))]"
                        onClick={(event) => {
                          event.stopPropagation();
                          openPhoneBinding({
                            phoneNumberId: thread.phoneNumberId,
                            phone: thread.phone,
                            moduleId: thread.moduleId,
                            recordId: thread.recordId,
                            phoneMatchStatus: thread.phoneMatchStatus,
                          });
                        }}
                      >
                        {thread.phone || 'شماره ثبت نشده'}
                      </button>
                      {getPhoneMatchLabel(thread.phoneMatchStatus) ? (
                        <button
                          type="button"
                          className="mt-1 truncate text-[11px] text-amber-600 underline decoration-dashed underline-offset-2 dark:text-amber-300"
                          onClick={(event) => {
                            event.stopPropagation();
                            openPhoneBinding({
                              phoneNumberId: thread.phoneNumberId,
                              phone: thread.phone,
                              moduleId: thread.moduleId,
                              recordId: thread.recordId,
                              phoneMatchStatus: thread.phoneMatchStatus,
                            });
                          }}
                        >
                          {getPhoneMatchLabel(thread.phoneMatchStatus)}
                        </button>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <UnreadCountBadge count={thread.unreadCount} className="px-2 py-0.5" />
                      <span className="text-[10px] text-gray-400">{safeJalaliFormat(thread.calls[0]?.started_at || thread.calls[0]?.created_at, 'MM/DD HH:mm')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center gap-1 overflow-y-auto overflow-x-hidden px-1 py-1.5">
              {voipThreads.map((thread) => (
                <div
                  key={thread.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectThread(thread)}
                  onKeyDown={(event) => handleThreadRowKeyDown(event, thread)}
                  title={thread.title}
                  className={`flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition-colors ${
                    activeThread?.id === thread.id
                      ? 'bg-[rgba(var(--brand-500-rgb),0.14)] shadow-[inset_0_0_0_1px_rgba(var(--brand-500-rgb),0.22)] dark:bg-[rgba(var(--brand-300-rgb),0.15)] dark:shadow-[inset_0_0_0_1px_rgba(var(--brand-300-rgb),0.24)]'
                      : 'hover:bg-white/75 dark:hover:bg-white/5'
                  }`}
                >
                  <Badge count={thread.unreadCount > 0 ? thread.unreadCount : 0} size="small">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xs font-semibold text-gray-700 shadow-sm dark:bg-white/[0.08] dark:text-gray-200">
                      {String(thread.title || thread.phone || 'T').trim().slice(0, 1) || 'T'}
                    </div>
                  </Badge>
                  <span className="line-clamp-2 text-center text-[10px] leading-4 text-gray-500 dark:text-gray-400">
                    {thread.title}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="min-h-0 flex flex-1 flex-col overflow-hidden">
          <div className="border-b border-slate-200/45 bg-white/88 px-3 py-2.5 dark:border-white/[0.07] dark:bg-white/[0.025]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {activeThread?.title || 'تماس‌ها'}
                </div>
                <div className="mt-1 truncate text-[11px] text-gray-500" dir="ltr">
                  <button
                    type="button"
                    dir="ltr"
                    className="truncate text-[11px] text-gray-500 transition-colors hover:text-[rgb(var(--brand-700-rgb))] dark:hover:text-[rgb(var(--brand-300-rgb))]"
                    onClick={() => openPhoneBinding({
                      phoneNumberId: activeThread?.phoneNumberId || null,
                      phone: activeThread?.phone || '',
                      moduleId: activeThread?.moduleId || null,
                      recordId: activeThread?.recordId || null,
                      phoneMatchStatus: activeThread?.phoneMatchStatus || null,
                    })}
                  >
                    {activeThread?.phone || 'تماسی انتخاب نشده'}
                  </button>
                </div>
                {getPhoneMatchLabel(activeThread?.phoneMatchStatus) ? (
                  <button
                    type="button"
                    className="mt-1 text-[11px] text-amber-600 underline decoration-dashed underline-offset-2 dark:text-amber-300"
                    onClick={() => openPhoneBinding({
                      phoneNumberId: activeThread?.phoneNumberId || null,
                      phone: activeThread?.phone || '',
                      moduleId: activeThread?.moduleId || null,
                      recordId: activeThread?.recordId || null,
                      phoneMatchStatus: activeThread?.phoneMatchStatus || null,
                    })}
                  >
                    {getPhoneMatchLabel(activeThread?.phoneMatchStatus)}
                  </button>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {activeThread?.phone ? (
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => openPhoneBinding({
                      phoneNumberId: activeThread?.phoneNumberId || null,
                      phone: activeThread?.phone || '',
                      moduleId: activeThread?.moduleId || null,
                      recordId: activeThread?.recordId || null,
                      phoneMatchStatus: activeThread?.phoneMatchStatus || null,
                    })}
                  >
                    اتصال مخاطب
                  </Button>
                ) : null}
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
                    مخاطب مرتبط
                  </Button>
                ) : null}
              </div>
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
                  const operatorId = String(row?.assignee_role_id || row?.assignee_id || '').trim();
                  const direction = String(row?.direction || '').trim();
                  const directionLabel = direction === 'outgoing'
                    ? 'خروجی'
                    : direction === 'internal'
                      ? 'داخلی'
                      : 'ورودی';
                  const counterpartyPhone = direction === 'outgoing'
                    ? String(row?.destination_number || activeThread?.phone || '').trim()
                    : String(row?.source_number || activeThread?.phone || '').trim();
                  return (
                    <div
                      key={String(row?.id || '')}
                      className="rounded-xl border border-slate-200/55 bg-white/86 px-3 py-2.5 shadow-[0_5px_16px_rgba(15,23,42,0.04)] dark:border-white/[0.08] dark:bg-white/[0.035]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                            {String(row?.title || counterpartyPhone || `تماس ${directionLabel}`)}
                          </div>
                          <div className="mt-1 text-[11px] text-gray-500" dir="ltr">
                            <button
                              type="button"
                              dir="ltr"
                              className="transition-colors hover:text-[rgb(var(--brand-700-rgb))] dark:hover:text-[rgb(var(--brand-300-rgb))]"
                              onClick={() => openPhoneBinding({
                                phoneNumberId: row?.phone_number_id || null,
                                phone: counterpartyPhone,
                                moduleId: row?.module_id || null,
                                recordId: row?.record_id || null,
                                phoneMatchStatus: row?.phone_match_status || null,
                              })}
                            >
                              {counterpartyPhone || '-'}
                            </button>
                            {String(row?.extension || '').trim() ? ` → ${String(row.extension).trim()}` : ''}
                          </div>
                        </div>
                        <div className="text-[11px] text-gray-400">{safeJalaliFormat(startedAt, 'YYYY/MM/DD HH:mm')}</div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-gray-600 dark:bg-white/[0.055] dark:text-gray-200">
                          {directionLabel}
                        </span>
                        {statusLabel ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-gray-600 dark:bg-white/[0.055] dark:text-gray-200">
                            {statusLabel}
                          </span>
                        ) : null}
                        {phoneMatchLabel ? (
                          <button
                            type="button"
                            className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200"
                            onClick={() => openPhoneBinding({
                              phoneNumberId: row?.phone_number_id || null,
                              phone: counterpartyPhone,
                              moduleId: row?.module_id || null,
                              recordId: row?.record_id || null,
                              phoneMatchStatus: row?.phone_match_status || null,
                            })}
                          >
                            {phoneMatchLabel}
                          </button>
                        ) : null}
                        {relatedLabel ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-gray-600 dark:bg-white/[0.055] dark:text-gray-200">
                            {relatedLabel}
                          </span>
                        ) : null}
                        {operatorId ? (
                          <span className="inline-flex max-w-full items-center rounded-full bg-slate-100 px-2 py-0.5 text-gray-600 dark:bg-white/[0.055] dark:text-gray-200">
                            <span className="ml-1">اپراتور:</span>
                            <AssigneeAvatarDisplay
                              source={{
                                ...row,
                                assignee_name: row?.assignee_name || assigneeNameMap[String(row?.assignee_id || '')],
                                assignee_role_title: row?.assignee_role_title || roleNameMap[String(row?.assignee_role_id || row?.assignee_id || '')],
                              }}
                              allUsers={directoryUsers}
                              allRoles={directoryRoles}
                              avatarSize={18}
                              labelClassName="truncate text-[11px]"
                              className="flex min-w-0 items-center gap-1"
                            />
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3">
                        <VoipRecordingPlayer
                          call={row}
                          compact
                          onForward={onForwardRecording ? (attachment) => onForwardRecording(row, attachment) : undefined}
                        />
                      </div>
                      <div className="mt-3 flex items-center gap-3 text-[12px]">
                        <Button
                          type="link"
                          size="small"
                          className="!px-0"
                          icon={<UserAddOutlined />}
                          onClick={() => openCreateActivityFromMessage({
                            channel: 'voip',
                            actorName: counterpartyPhone || 'شماره تماس',
                            createdAt: startedAt,
                            createdAtLabel: safeJalaliFormat(startedAt, 'YYYY/MM/DD HH:mm'),
                            content: [
                              `تماس ${directionLabel} با ${counterpartyPhone || 'شماره نامشخص'}`,
                              String(row?.extension || '').trim() ? `داخلی: ${String(row.extension).trim()}` : '',
                              statusLabel ? `وضعیت: ${statusLabel}` : '',
                            ].filter(Boolean).join(' | '),
                            attachments: [],
                            relatedModuleId: row?.module_id || row?.related_module_id || activeThread?.moduleId || null,
                            relatedRecordId: row?.record_id || row?.related_record_id || activeThread?.recordId || null,
                            taskType: `تماس ${directionLabel}`,
                          })}
                        >
                          ایجاد فعالیت
                        </Button>
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
