import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App, Badge, Button, Empty, Skeleton } from 'antd';
import { EditOutlined, EyeOutlined } from '@ant-design/icons';
import { formatPersianPrice, safeJalaliFormat } from '../../utils/persianNumberFormatter';
import { getSmsBalanceViaGateway, sendSmsViaGateway } from '../../utils/smsGateway';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import {
  normalizePhoneThreadValue,
  resolveSmsCounterpartyPhone,
} from '../../utils/notificationViewModels';
import SharedNoteCard from '../notes/SharedNoteCard';
import SharedNoteComposer from '../notes/SharedNoteComposer';
import AiSparkleIcon from '../ai/AiSparkleIcon';
import UnreadCountBadge from './UnreadCountBadge';

export type SmsThreadItem = {
  id: string;
  phone: string;
  phoneNumberId: string | null;
  phoneMatchStatus: string | null;
  title: string;
  preview: string;
  unreadCount: number;
  latestMessageAt: number;
  messages: any[];
  moduleId: string | null;
  recordId: string | null;
};

type AiSuggestionPopoverActionProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  disabled: boolean;
  onSubmit: (instruction: string) => void | Promise<void>;
};

// Inline copy — shared with bot panel via NotificationsPopover
const AiSuggestionInlineAction: React.FC<AiSuggestionPopoverActionProps> = ({
  open: _open,
  onOpenChange: _onOpenChange,
  loading,
  disabled,
  onSubmit,
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => void onSubmit('')}
    className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] transition-colors ${
      disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-black/5 dark:hover:bg-white/10'
    }`}
  >
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${
        loading
          ? 'bg-[rgba(var(--brand-500-rgb),0.12)] text-[rgb(var(--brand-700-rgb))] dark:bg-[rgba(var(--brand-300-rgb),0.16)] dark:text-[rgb(var(--brand-300-rgb))]'
          : 'text-gray-600 dark:text-gray-300'
      }`}
    >
      <AiSparkleIcon className="h-4 w-4" />
    </span>
    {loading ? (
      <span className="whitespace-nowrap text-[11px] text-[rgb(var(--brand-700-rgb))] dark:text-[rgb(var(--brand-300-rgb))]">
        در حال فکر کردن...
      </span>
    ) : null}
  </button>
);

type SmsComposerProps = {
  recipient: string;
  activeThreadId?: string | null;
  sending: boolean;
  onSubmit: (text: string) => Promise<boolean> | boolean;
  onSuggestReply: (instruction: string) => Promise<string | null>;
};

const SmsComposer = React.memo<SmsComposerProps>(({
  recipient,
  activeThreadId,
  sending,
  onSubmit,
  onSuggestReply,
}) => {
  const [draft, setDraft] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const canSuggest = Boolean(activeThreadId || String(recipient || '').trim());

  const submitDraft = useCallback(async () => {
    const text = String(draft || '').trim();
    const sent = await onSubmit(text);
    if (sent) setDraft('');
  }, [draft, onSubmit]);

  const requestSuggestion = useCallback(async (instruction: string) => {
    if (suggesting) return;
    setSuggesting(true);
    try {
      const suggested = await onSuggestReply(instruction);
      if (suggested) setDraft(suggested);
    } finally {
      setSuggesting(false);
    }
  }, [onSuggestReply, suggesting]);

  return (
    <SharedNoteComposer
      value={draft}
      onChange={setDraft}
      onSubmit={submitDraft}
      placeholder="متن پیامک..."
      submitText="ارسال پیامک"
      allowMentions={false}
      allowAttachments={false}
      submitLoading={sending}
      submitDisabled={sending || suggesting || !String(recipient || '').trim() || !String(draft || '').trim()}
      extraActions={(
        <AiSuggestionInlineAction
          open={false}
          onOpenChange={() => undefined}
          loading={suggesting}
          disabled={sending || suggesting || !canSuggest}
          onSubmit={requestSuggestion}
        />
      )}
    />
  );
});
SmsComposer.displayName = 'SmsComposer';

type SmsMessagesPanelProps = {
  layout: 'desktop' | 'mobile';
  smsThreads: SmsThreadItem[];
  selectedSmsThread: SmsThreadItem | null;
  displayedSmsMessages: any[];
  loadingSmsMessages: boolean;
  smsRecipient: string;
  setSmsRecipient: (value: string) => void;
  smsSending: boolean;
  setSmsSending: (value: boolean) => void;
  setSelectedSmsThreadKey: (key: string) => void;
  setSmsMessages: React.Dispatch<React.SetStateAction<any[]>>;
  openPreviewRecord: (moduleId: string, recordId: string, label?: string) => void;
  getCentralRecordLabel: (moduleId?: string | null, recordId?: string | null, fallback?: string | null) => string;
  getPhoneMatchLabel: (value: any) => string;
  getModuleFieldOptionLabel: (moduleId: string, fieldKey: string, value: any) => string;
  requestReplySuggestion: (payload: any) => Promise<string>;
  refreshSection: (section: 'sms_messages', options?: { force?: boolean }) => Promise<void>;
  onOpenPhoneMatchPicker?: (input: {
    phoneNumberId?: string | null;
    phone: string;
    moduleId?: string | null;
    recordId?: string | null;
    phoneMatchStatus?: string | null;
  }) => void;
  openCreateActivityFromMessage: (input: any) => void | Promise<void>;
};

const SmsMessagesPanel: React.FC<SmsMessagesPanelProps> = ({
  layout,
  smsThreads,
  selectedSmsThread,
  displayedSmsMessages,
  loadingSmsMessages,
  smsRecipient,
  setSmsRecipient,
  smsSending,
  setSmsSending,
  setSelectedSmsThreadKey,
  setSmsMessages,
  openPreviewRecord,
  getCentralRecordLabel,
  getPhoneMatchLabel,
  getModuleFieldOptionLabel,
  requestReplySuggestion,
  refreshSection,
  onOpenPhoneMatchPicker,
  openCreateActivityFromMessage,
}) => {
  const { message } = App.useApp();
  const smsMessagesScrollContainerRef = useRef<HTMLDivElement>(null);
  const [smsBalance, setSmsBalance] = useState<number | null>(null);
  const [smsBalanceLoaded, setSmsBalanceLoaded] = useState(false);
  const isDesktop = layout === 'desktop';
  const activeThread = selectedSmsThread;
  const threadMessages = displayedSmsMessages;

  useEffect(() => {
    let mounted = true;
    const loadSmsBalance = async () => {
      try {
        const result = await getSmsBalanceViaGateway();
        const numeric = Number(String(result?.balance ?? '').replace(/,/g, '').trim());
        if (mounted) {
          setSmsBalance(Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : null);
          setSmsBalanceLoaded(true);
        }
      } catch {
        if (mounted) {
          setSmsBalance(null);
          setSmsBalanceLoaded(true);
        }
      }
    };
    void loadSmsBalance();
    return () => {
      mounted = false;
    };
  }, []);
  const handleSelectThreadKey = useCallback((thread: SmsThreadItem) => {
    setSelectedSmsThreadKey(thread.id);
    if (thread.phone) setSmsRecipient(thread.phone);
  }, [setSelectedSmsThreadKey, setSmsRecipient]);
  const handleThreadRowKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>, thread: SmsThreadItem) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handleSelectThreadKey(thread);
  }, [handleSelectThreadKey]);

  const sendSmsMessage = useCallback(async (draftText: string) => {
    const recipient = String(smsRecipient || '').trim();
    const text = String(draftText || '').trim();
    if (!recipient) {
      message.warning('شماره گیرنده پیامک را وارد کنید.');
      return false;
    }
    if (!text) {
      message.warning('متن پیامک خالی است.');
      return false;
    }

    const optimisticId = `optimistic-sms-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const optimisticThreadKey = `sms:${normalizePhoneThreadValue(recipient) || recipient}`;
    setSmsSending(true);
    setSelectedSmsThreadKey(optimisticThreadKey);
    setSmsMessages((prev: any[]) => [
      ...prev,
      {
        id: optimisticId,
        title: recipient,
        module_id: null,
        record_id: null,
        direction: 'outbound',
        recipient,
        phone_number: recipient,
        message_text: text,
        status: 'pending',
        message_at: nowIso,
        created_at: nowIso,
      },
    ]);

    try {
      await sendSmsViaGateway({
        to: [recipient],
        text,
        title: 'پیامک مستقیم',
        metadata: { source: 'notifications_drawer_sms' },
      });
      await refreshSection('sms_messages', { force: true });
      return true;
    } catch (error: any) {
      setSmsMessages((prev: any[]) => prev.filter((row) => String(row?.id || '') !== optimisticId));
      message.error(toFaErrorMessage(error, 'ارسال پیامک ناموفق بود.'));
      return false;
    } finally {
      setSmsSending(false);
    }
  }, [message, refreshSection, setSmsMessages, setSelectedSmsThreadKey, setSmsSending, smsRecipient]);

  const suggestSmsReply = useCallback(async (instruction = '') => {
    if (!activeThread?.id && !smsRecipient.trim()) {
      message.warning('ابتدا یک گفتگو یا شماره پیامک را انتخاب کنید.');
      return null;
    }
    try {
      const recentMessages = (threadMessages || []).slice(-16).map((row: any) => {
        const direction = String(row?.direction || '').trim() || 'inbound';
        const isMine = direction !== 'inbound';
        return {
          direction,
          authorName: isMine ? 'کاربر سازمان' : (resolveSmsCounterpartyPhone(row) || 'مشتری'),
          text: String(row?.message_text || '').trim(),
          createdAt: row?.message_at || row?.created_at || null,
        };
      }).filter((item: any) => item.text);

      const suggested = await requestReplySuggestion({
        channel: 'sms',
        phone: String(activeThread?.phone || smsRecipient || '').trim() || null,
        instruction: String(instruction || '').trim() || null,
        context: {
          mode: activeThread?.moduleId && activeThread?.recordId ? 'record' : 'page',
          moduleId: activeThread?.moduleId || null,
          recordId: activeThread?.recordId || null,
          route: '/notifications?sms=1',
        },
        counterparty: {
          moduleId: activeThread?.moduleId || null,
          recordId: activeThread?.recordId || null,
        },
        recentMessages,
      });
      return suggested;
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'پیشنهاد پاسخ پیامک ناموفق بود.'));
      return null;
    }
  }, [activeThread, message, requestReplySuggestion, smsRecipient, threadMessages]);

  const openRelatedSmsRecord = useCallback(() => {
    if (!activeThread?.moduleId || !activeThread?.recordId) return;
    openPreviewRecord(
      activeThread.moduleId,
      activeThread.recordId,
      getCentralRecordLabel(activeThread.moduleId, activeThread.recordId, activeThread.title || activeThread.phone),
    );
  }, [activeThread, getCentralRecordLabel, openPreviewRecord]);

  const openPhoneBinding = useCallback((input: {
    phoneNumberId?: string | null;
    phone: string;
    moduleId?: string | null;
    recordId?: string | null;
    phoneMatchStatus?: string | null;
  }) => {
    if (!onOpenPhoneMatchPicker) return;
    if (!String(input.phone || '').trim()) return;
    onOpenPhoneMatchPicker(input);
  }, [onOpenPhoneMatchPicker]);

  return (
    <div className="h-full min-h-0 flex overflow-hidden">
      <div className={`min-h-0 flex-1 ${isDesktop ? 'grid grid-cols-[260px_minmax(0,1fr)]' : 'flex'}`}>
        <div className={`${isDesktop ? 'border-l' : 'order-last w-[72px] shrink-0 border-l'} border-slate-200/45 dark:border-white/[0.07] bg-slate-50/65 dark:bg-white/[0.025] min-h-0 overflow-hidden`}>
          {loadingSmsMessages && smsThreads.length === 0 ? (
            <div className="p-3">
              <Skeleton active paragraph={{ rows: 4 }} />
            </div>
          ) : smsThreads.length === 0 ? (
            <div className="p-3">
              <Empty description="هنوز پیامکی ثبت نشده است." />
            </div>
          ) : isDesktop ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-2">
              {smsThreads.map((thread) => (
                <div
                  key={thread.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectThreadKey(thread)}
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
                        {thread.phone || 'بدون شماره'}
                      </button>
                      {getPhoneMatchLabel(thread.phoneMatchStatus) ? (
                        <div className="mt-1 truncate text-[11px]">
                          <button
                            type="button"
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
                            className="text-amber-600 underline decoration-dashed underline-offset-2 hover:text-amber-700 dark:text-amber-300 dark:hover:text-amber-200"
                          >
                            {getPhoneMatchLabel(thread.phoneMatchStatus)}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <UnreadCountBadge count={thread.unreadCount} className="px-2 py-0.5" />
                      <span className="text-[10px] text-gray-400">{safeJalaliFormat(thread.messages[thread.messages.length - 1]?.message_at || thread.messages[thread.messages.length - 1]?.created_at, 'MM/DD HH:mm')}</span>
                    </div>
                  </div>
                  <div className="mt-2 line-clamp-2 text-[12px] leading-5 text-gray-500 dark:text-gray-300">{thread.preview}</div>
                </div>
              ))}
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center gap-1 overflow-y-auto overflow-x-hidden px-1 py-1.5">
              {smsThreads.map((thread) => (
                <div
                  key={thread.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectThreadKey(thread)}
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
                      {String(thread.title || thread.phone || 'P').trim().slice(0, 1) || 'P'}
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
                  {activeThread?.title || 'ارسال پیامک'}
                </div>
                <div className="mt-1 truncate text-[11px] text-gray-500">
                  اعتبار باقیمانده پیامک: {smsBalanceLoaded && smsBalance !== null ? `${formatPersianPrice(smsBalance)} پیامک` : 'نامشخص'}
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
                    {activeThread?.phone || 'شماره انتخاب نشده'}
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
                  <Button size="small" icon={<EyeOutlined />} onClick={openRelatedSmsRecord}>
                    مخاطب مرتبط
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
          <div ref={smsMessagesScrollContainerRef} className="flex-1 overflow-y-auto bg-slate-100/45 px-3 py-3 dark:bg-black/[0.08]">
            {loadingSmsMessages && threadMessages.length === 0 && smsThreads.length === 0 ? (
              <Skeleton active paragraph={{ rows: 5 }} />
            ) : threadMessages.length === 0 ? (
              <Empty description="برای این شماره هنوز پیامی ثبت نشده است." />
            ) : (
              <div className="flex flex-col gap-3">
                {threadMessages.map((row: any) => {
                  const direction = String(row?.direction || '').trim();
                  const isMine = direction !== 'inbound';
                  const phone = resolveSmsCounterpartyPhone(row);
                  const statusLabel = getModuleFieldOptionLabel('sms_delivery_reports', 'status', row?.status);
                  const phoneMatchLabel = getPhoneMatchLabel(row?.phone_match_status);
                  const relatedTitle = row.module_id && row.record_id
                    ? getCentralRecordLabel(row.module_id, row.record_id, row.title || phone)
                    : '';
                  return (
                    <SharedNoteCard
                      key={String(row.id)}
                      authorName={isMine ? 'ارسال پیامک' : (phone || 'پیامک ورودی')}
                      createdAtLabel={safeJalaliFormat(row.message_at || row.created_at, 'YYYY/MM/DD HH:mm')}
                      text={String(row.message_text || '')}
                      attachments={[]}
                      avatarFallback={isMine ? 'SMS' : 'IN'}
                      isMine={isMine}
                      footer={(
                        <div className="flex items-center gap-2 text-[11px] text-gray-400">
                          <button
                            type="button"
                            dir="ltr"
                            className="transition-colors hover:text-[rgb(var(--brand-700-rgb))] dark:hover:text-[rgb(var(--brand-300-rgb))]"
                            onClick={() => openPhoneBinding({
                              phoneNumberId: row?.phone_number_id || null,
                              phone,
                              moduleId: row?.module_id || null,
                              recordId: row?.record_id || null,
                              phoneMatchStatus: row?.phone_match_status || null,
                            })}
                          >
                            {phone}
                          </button>
                          {statusLabel ? <span>{statusLabel}</span> : null}
                          {phoneMatchLabel ? (
                            <button
                              type="button"
                              className="text-amber-600 underline decoration-dashed underline-offset-2 dark:text-amber-300"
                              onClick={() => openPhoneBinding({
                                phoneNumberId: row?.phone_number_id || null,
                                phone,
                                moduleId: row?.module_id || null,
                                recordId: row?.record_id || null,
                                phoneMatchStatus: row?.phone_match_status || null,
                              })}
                            >
                              {phoneMatchLabel}
                            </button>
                          ) : null}
                          {row.module_id && row.record_id ? (
                            <Button
                              type="link"
                              size="small"
                              className="!px-0"
                              onClick={() => openPreviewRecord(String(row.module_id), String(row.record_id), relatedTitle || 'رکورد مرتبط')}
                            >
                              {relatedTitle || 'رکورد مرتبط'}
                            </Button>
                          ) : null}
                        </div>
                      )}
                      onCreateActivity={() => openCreateActivityFromMessage({
                        channel: 'sms',
                        actorName: isMine ? 'ارسال پیامک' : (phone || 'پیامک ورودی'),
                        createdAt: row.message_at || row.created_at,
                        createdAtLabel: safeJalaliFormat(row.message_at || row.created_at, 'YYYY/MM/DD HH:mm'),
                        content: String(row.message_text || ''),
                        attachments: [],
                        relatedModuleId: row.module_id || row.related_module_id || activeThread?.moduleId || null,
                        relatedRecordId: row.record_id || row.related_record_id || activeThread?.recordId || null,
                      })}
                      animateOnMount
                    />
                  );
                })}
              </div>
            )}
          </div>
          <SmsComposer
            recipient={smsRecipient}
            activeThreadId={activeThread?.id || null}
            sending={smsSending}
            onSubmit={sendSmsMessage}
            onSuggestReply={suggestSmsReply}
          />
        </div>
      </div>
    </div>
  );
};

export default React.memo(SmsMessagesPanel);
