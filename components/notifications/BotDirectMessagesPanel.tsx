import React from 'react';
import { Avatar, Badge, Button, Empty, Input, Popover, Tag } from 'antd';
import { EditOutlined, SearchOutlined, SnippetsOutlined, UserOutlined } from '@ant-design/icons';
import { normalizePublicAssetUrl } from '../../utils/assetUrl';
import { safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import ConversationTimeline from './ConversationTimeline';
import SharedNoteCard from '../notes/SharedNoteCard';
import SharedNoteComposer from '../notes/SharedNoteComposer';
import ProfileAvatar from '../common/ProfileAvatar';
import UnreadCountBadge, { NOTIFICATION_UNREAD_BADGE_COLOR } from './UnreadCountBadge';
import { BOT_CHANNEL_LABELS_FA, getBotPlatformAvatarSrc } from '../../utils/botPlatform';
import type { NoteAttachment } from '../../utils/noteContent';
import AiSparkleIcon from '../ai/AiSparkleIcon';
import { extractBotMessageAttachments } from '../../utils/messageAttachments';

type BotDirectThreadRow = {
  id: string;
  channel_type?: string | null;
  chat_id: string;
  target_module_id?: string | null;
  target_record_id?: string | null;
  display_name?: string | null;
  username?: string | null;
  phone_number?: string | null;
  last_message_preview?: string | null;
  binding_status?: 'bound' | 'unbound';
  counterparty_label?: string | null;
  counterparty_image_url?: string | null;
  last_message_at?: string | null;
  last_seen_at?: string | null;
  metadata?: Record<string, any> | null;
};

type BotDirectMessageRow = {
  id: string;
  direct_thread_id: string;
  direction?: string | null;
  content_text?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  message_type?: string | null;
  payload?: Record<string, any> | null;
  created_at?: string | null;
};

type BotDirectMessagesPanelProps = {
  layout: 'desktop' | 'mobile';
  threads: BotDirectThreadRow[];
  selectedThread: BotDirectThreadRow | null;
  selectedThreadId: string | null;
  setSelectedThreadId: (id: string) => void;
  threadSearch: string;
  setThreadSearch: (value: string) => void;
  mobileSearchOpen: boolean;
  setMobileSearchOpen: (value: boolean) => void;
  unreadByThread: Record<string, number>;
  messages: BotDirectMessageRow[];
  messageSearch: string;
  setMessageSearch: (value: string) => void;
  loadingMessages: boolean;
  hideTimelineUntilSettled?: boolean;
  hasMoreBefore?: boolean;
  loadingOlder?: boolean;
  loadOlder?: () => void | Promise<void>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  handleScroll?: React.UIEventHandler<HTMLDivElement>;
  messageText: string;
  onChangeMessageText: (value: string) => void;
  onSendMessage: () => void | Promise<void>;
  sending: boolean;
  attachments: File[];
  setAttachments: React.Dispatch<React.SetStateAction<File[]>>;
  linkedAttachments: NoteAttachment[];
  setLinkedAttachments: React.Dispatch<React.SetStateAction<NoteAttachment[]>>;
  botDirectSuggesting: boolean;
  botDirectAiPopoverOpen: boolean;
  setBotDirectAiPopoverOpen: (open: boolean) => void;
  suggestBotDirectReply: (instruction: string) => void | Promise<void>;
  openReadyTextsModal: (context: 'bot') => void;
  onOpenSettings?: (thread: BotDirectThreadRow) => void;
  handleClose: () => void;
  openPreviewRecord?: (moduleId: string, recordId: string, label?: string) => void;
};

type AiSuggestionPopoverActionProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  disabled: boolean;
  onSubmit: (instruction: string) => void | Promise<void>;
};

const AiSuggestionPopoverAction: React.FC<AiSuggestionPopoverActionProps> = ({
  open,
  onOpenChange,
  loading,
  disabled,
  onSubmit,
}) => {
  const [draft, setDraft] = React.useState('');
  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={onOpenChange}
      placement="topLeft"
      content={(
        <div className="w-[260px] space-y-2">
          <div className="text-xs text-gray-500">اگر دستور خاصی داری برای هوش مصنوعی بنویس.</div>
          <Input.TextArea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="مثلا: رسمی‌تر و کوتاه‌تر پاسخ بده"
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
          <div className="flex justify-end">
            <Button type="primary" size="small" loading={loading} onClick={() => void onSubmit(draft)}>
              دریافت پیشنهاد
            </Button>
          </div>
        </div>
      )}
    >
      <button
        type="button"
        disabled={disabled}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
          disabled
            ? 'cursor-not-allowed opacity-60'
            : 'text-gray-500 hover:bg-black/5 hover:text-[rgb(var(--brand-700-rgb))] dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-[rgb(var(--brand-300-rgb))]'
        }`}
      >
        <AiSparkleIcon className={`h-4 w-4 ${loading ? 'animate-pulse' : ''}`} />
      </button>
    </Popover>
  );
};

const DirectThreadAvatar: React.FC<{ row: BotDirectThreadRow; size: number; active?: boolean }> = ({ row, size, active = false }) => {
  const imgSrc = normalizePublicAssetUrl(String(row.counterparty_image_url || '').trim());
  if (imgSrc) {
    return (
      <ProfileAvatar
        size={size}
        src={imgSrc}
        preset="avatar"
        className={active ? 'ring-2 ring-[rgba(var(--brand-500-rgb),0.42)] ring-offset-2 ring-offset-white dark:ring-[rgba(var(--brand-300-rgb),0.55)] dark:ring-offset-[#151113]' : ''}
        name={String(row.display_name || row.counterparty_label || 'پی‌وی بات').trim() || 'پی‌وی بات'}
      />
    );
  }
  const platformSrc = getBotPlatformAvatarSrc(String(row.channel_type || '').trim());
  if (platformSrc) {
    return (
      <ProfileAvatar
        size={size}
        src={platformSrc}
        preset="avatar"
        className={active ? 'ring-2 ring-[rgba(var(--brand-500-rgb),0.42)] ring-offset-2 ring-offset-white dark:ring-[rgba(var(--brand-300-rgb),0.55)] dark:ring-offset-[#151113]' : ''}
        name={String(row.display_name || row.counterparty_label || 'پی‌وی بات').trim() || 'پی‌وی بات'}
      />
    );
  }
  return (
    <Avatar size={size} className={active ? 'ring-2 ring-[rgba(var(--brand-500-rgb),0.42)] ring-offset-2 ring-offset-white dark:ring-[rgba(var(--brand-300-rgb),0.55)] dark:ring-offset-[#151113]' : ''}>
      <UserOutlined />
    </Avatar>
  );
};

const BotDirectMessagesPanel: React.FC<BotDirectMessagesPanelProps> = ({
  layout,
  threads,
  selectedThread,
  selectedThreadId,
  setSelectedThreadId,
  threadSearch,
  setThreadSearch,
  mobileSearchOpen,
  setMobileSearchOpen,
  unreadByThread,
  messages,
  messageSearch,
  setMessageSearch,
  loadingMessages,
  hideTimelineUntilSettled = false,
  hasMoreBefore = false,
  loadingOlder = false,
  loadOlder,
  scrollContainerRef,
  handleScroll,
  messageText,
  onChangeMessageText,
  onSendMessage,
  sending,
  attachments,
  setAttachments,
  linkedAttachments,
  setLinkedAttachments,
  botDirectSuggesting,
  botDirectAiPopoverOpen,
  setBotDirectAiPopoverOpen,
  suggestBotDirectReply,
  openReadyTextsModal,
  onOpenSettings,
  handleClose,
  openPreviewRecord,
}) => {
  const withDesktopSidebar = layout === 'desktop';
  const withMobileUserRail = layout === 'mobile';
  const selectedMetadata = selectedThread?.metadata && typeof selectedThread.metadata === 'object' ? selectedThread.metadata : {};
  const activeConversationClass = 'border border-[rgba(var(--brand-500-rgb),0.34)] bg-[rgba(var(--brand-500-rgb),0.14)] text-[rgb(var(--brand-900-rgb))] shadow-[inset_3px_0_0_rgba(var(--brand-500-rgb),0.72),0_6px_18px_rgba(var(--brand-500-rgb),0.12)] dark:border-[rgba(var(--brand-300-rgb),0.38)] dark:bg-[rgba(var(--brand-300-rgb),0.16)] dark:text-white dark:shadow-[inset_3px_0_0_rgba(var(--brand-300-rgb),0.72)]';
  const inactiveConversationClass = 'border border-transparent text-gray-700 hover:bg-white/80 dark:text-gray-200 dark:hover:bg-white/[0.055]';
  const activeRailClass = 'bg-[rgba(var(--brand-500-rgb),0.14)] shadow-[inset_0_0_0_1px_rgba(var(--brand-500-rgb),0.22)] dark:bg-[rgba(var(--brand-300-rgb),0.15)] dark:shadow-[inset_0_0_0_1px_rgba(var(--brand-300-rgb),0.24)]';
  const inactiveRailClass = 'hover:bg-white/75 dark:hover:bg-white/5';
  const sendBlocked = selectedMetadata.send_blocked === true || selectedMetadata.suspected_group_chat === true;
  const canSend = Boolean(String(selectedThread?.chat_id || '').trim()) && !sendBlocked;
  const selectedLabel = String(selectedThread?.counterparty_label || selectedThread?.display_name || '').trim() || 'پی‌وی بدون عنوان';
  const selectedChannelLabel = BOT_CHANNEL_LABELS_FA[String(selectedThread?.channel_type || '').trim() as keyof typeof BOT_CHANNEL_LABELS_FA] || String(selectedThread?.channel_type || '-');
  const bindingTag = selectedThread?.binding_status === 'unbound' ? <Tag color="orange" className="!m-0">اتصال‌نشده</Tag> : null;

  const renderRow = (row: BotDirectMessageRow) => {
    const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
    const outgoing = String(row.direction || '') === 'outbound';
    const normalizedUsername = String(selectedThread?.username || '').trim().replace(/^@+/, '');
    const chatIdLabel = String(selectedThread?.chat_id || '').trim();
    const hasBoundCounterparty = Boolean(String(selectedThread?.counterparty_label || '').trim());
    const authorName = outgoing
      ? 'کاربر سازمان'
      : String(
        selectedThread?.counterparty_label
        || payload.sender_display_name
        || selectedThread?.display_name
        || (normalizedUsername ? `@${normalizedUsername}` : '')
        || chatIdLabel
        || 'کاربر'
      ).trim();
    const metaNode = !outgoing
      ? (
        <>
          {normalizedUsername && !authorName.includes(`@${normalizedUsername}`) ? <span dir="ltr">@{normalizedUsername}</span> : null}
          {!hasBoundCounterparty && chatIdLabel && authorName !== chatIdLabel ? <span dir="ltr">{chatIdLabel}</span> : null}
        </>
      )
      : null;
    const extractedAttachments = extractBotMessageAttachments(row);
    const mediaFileId = String((payload as any)?.media_file_id || '').trim();
    const attachmentsForDisplay = extractedAttachments.length > 0
      ? extractedAttachments
      : (String(row.file_name || '').trim() || mediaFileId
        ? [{
          name: String(row.file_name || 'فایل').trim() || 'فایل',
          url: String(row.file_url || '').trim(),
          mimeType: String(row.mime_type || '').trim() || null,
          fileType: String(row.message_type || (mediaFileId ? 'file' : '')).trim() || 'file',
        }]
        : []);
    const text = String(row.content_text || '').trim() || (attachmentsForDisplay.length > 0 ? '' : (String(row.file_name || '').trim() ? `فایل: ${String(row.file_name || '').trim()}` : ''));
    return (
      <SharedNoteCard
        authorName={authorName}
        metaNode={metaNode}
        createdAtLabel={safeJalaliFormat(row.created_at, 'YYYY/MM/DD HH:mm')}
        text={text}
        attachments={attachmentsForDisplay}
        avatarUrl={normalizePublicAssetUrl(String(selectedThread?.counterparty_image_url || '').trim()) || getBotPlatformAvatarSrc(selectedThread?.channel_type || '') || undefined}
        avatarFallback={authorName.slice(0, 1)}
        mentionUsers={[]}
        mentionRoles={[]}
        isMine={outgoing}
      />
    );
  };

  return (
    <div dir="ltr" className="flex min-w-0 flex-1 min-h-0 overflow-hidden bg-[rgba(var(--brand-50-rgb),0.16)] dark:bg-[#151113]">
      {withDesktopSidebar ? (
        <div dir="rtl" className="order-last w-[208px] border-l border-slate-200/55 bg-white/72 dark:border-white/[0.07] dark:bg-white/[0.025]">
          <div className="px-4 py-3 border-b border-slate-200/45 bg-white/55 dark:border-white/[0.07] dark:bg-white/[0.025]">
            <div className="text-xs font-bold text-gray-600 dark:text-gray-300">پیام‌های شخصی بات</div>
            <Input
              size="small"
              allowClear
              value={threadSearch}
              onChange={(event) => setThreadSearch(event.target.value)}
              placeholder="جستجوی پی‌وی"
              prefix={<SearchOutlined className="text-gray-400" />}
              className="mt-2"
            />
          </div>
          <div className="overflow-y-auto h-full px-2 py-2 space-y-1">
            {threads.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="پی‌وی باتی ثبت نشده است." />
            ) : threads.map((row) => {
              const active = String(selectedThreadId || '') === String(row.id);
              const unreadCount = unreadByThread[String(row.id)] || 0;
              return (
                <button
                  type="button"
                  key={row.id}
                  className={`w-full rounded-xl px-3 py-2 text-right transition-colors ${active ? activeConversationClass : inactiveConversationClass}`}
                  onClick={() => {
                    setMobileSearchOpen(false);
                    setSelectedThreadId(String(row.id));
                  }}
                >
                  <div className="flex items-center gap-3">
                    <DirectThreadAvatar row={row} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{String(row.counterparty_label || row.display_name || row.chat_id).trim() || 'پی‌وی بات'}</div>
                      <div className="truncate text-[11px] text-gray-400">{BOT_CHANNEL_LABELS_FA[String(row.channel_type || '').trim() as keyof typeof BOT_CHANNEL_LABELS_FA] || row.channel_type} | {row.binding_status === 'unbound' ? 'اتصال‌نشده' : String(row.username || row.chat_id || '').trim()}</div>
                    </div>
                    <UnreadCountBadge count={unreadCount} className="h-5" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col flex-1 min-h-0 min-w-0 bg-white/82 dark:bg-[#1a1518]">
        <div className="border-b border-slate-200/45 bg-white/88 px-3 py-2.5 dark:border-white/[0.07] dark:bg-white/[0.025]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-3">
              <DirectThreadAvatar row={selectedThread ?? { id: '', chat_id: '' }} size={withMobileUserRail ? 32 : 36} />
              <div className="min-w-0">
                <div className="truncate px-0.5 text-[13px] font-bold text-gray-800 dark:text-gray-100">{selectedLabel}</div>
                <div className="truncate text-[11px] text-gray-500 dark:text-gray-400">پلتفرم: {selectedChannelLabel}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {bindingTag}
              {selectedThread ? (
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => onOpenSettings?.(selectedThread)}
                />
              ) : null}
            </div>
          </div>
          {selectedThread?.target_module_id && selectedThread?.target_record_id ? (
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              طرف مرتبط:{' '}
              <button
                type="button"
                className="underline decoration-dotted underline-offset-2 text-[rgb(var(--brand-700-rgb))] dark:text-[rgb(var(--brand-300-rgb))]"
                onClick={() => {
                  const moduleId = String(selectedThread.target_module_id || '').trim();
                  const recordId = String(selectedThread.target_record_id || '').trim();
                  if (openPreviewRecord && moduleId && recordId) {
                    openPreviewRecord(moduleId, recordId, String(selectedThread.counterparty_label || selectedThread.display_name || '').trim() || undefined);
                    return;
                  }
                  handleClose();
                }}
              >
                {String(selectedThread.counterparty_label || selectedThread.display_name || '').trim() || 'مشاهده رکورد'}
              </button>
            </div>
          ) : null}
          <Input
            size="small"
            allowClear
            value={messageSearch}
            onChange={(event) => setMessageSearch(event.target.value)}
            placeholder="جستجو در پیام‌های این پی‌وی"
            className="mt-2"
            prefix={<SearchOutlined className="text-gray-400" />}
          />
        </div>

        <ConversationTimeline
          containerRef={scrollContainerRef}
          onScroll={handleScroll}
          layoutPaddingClass={withDesktopSidebar ? 'px-3 py-3' : 'px-2 py-2'}
          hideUntilSettled={hideTimelineUntilSettled}
          loading={loadingMessages}
          emptyDescription={!selectedThread ? 'یک پی‌وی بات را انتخاب کنید.' : 'پیامی برای این پی‌وی ثبت نشده است.'}
          hasMoreBefore={hasMoreBefore}
          loadingOlder={loadingOlder}
          onLoadOlder={loadOlder}
          items={messages}
          getItemKey={(item, index) => String(item?.id || index)}
          renderItem={renderRow}
        />

        <SharedNoteComposer
          value={messageText}
          onChange={onChangeMessageText}
          onSubmit={() => void onSendMessage()}
          submitLoading={sending}
          placeholder={
            canSend
              ? 'پیام به پی‌وی بات...'
              : sendBlocked
                ? 'این گفتگو برای ارسال شخصی معتبر نیست.'
                : 'شناسه چت این پی‌وی ثبت نشده است.'
          }
          mentionOptions={[]}
          mentionValues={[]}
          onMentionChange={() => undefined}
          attachments={attachments}
          linkedAttachments={linkedAttachments}
          onFilesSelected={(files) => {
            setAttachments((prev) => {
              const map = new Map(prev.map((file) => [`${file.name}-${file.size}-${file.lastModified}`, file]));
              files.forEach((file) => map.set(`${file.name}-${file.size}-${file.lastModified}`, file));
              return Array.from(map.values());
            });
          }}
          onRemoveAttachment={(fileName) => {
            setAttachments((prev) => prev.filter((file) => file.name !== fileName));
          }}
          onLinkedAttachmentsSelected={(items) => {
            setLinkedAttachments((prev) => {
              const map = new Map(prev.map((attachment) => [String(attachment.url || ''), attachment]));
              items.forEach((attachment) => {
                const url = String(attachment.url || '').trim();
                if (url) map.set(url, attachment);
              });
              return Array.from(map.values());
            });
          }}
          onRemoveLinkedAttachment={(url) => {
            setLinkedAttachments((prev) => prev.filter((attachment) => String(attachment.url || '') !== String(url || '')));
          }}
          filePickerModuleId={selectedThread?.target_module_id || null}
          filePickerRecordId={selectedThread?.target_record_id || null}
          enableImagePasteAndDrop
          submitDisabled={!selectedThread || !canSend || sending || (!String(messageText || '').trim() && attachments.length === 0 && linkedAttachments.length === 0)}
          extraActions={(
            <>
              <AiSuggestionPopoverAction
                open={botDirectAiPopoverOpen}
                onOpenChange={setBotDirectAiPopoverOpen}
                loading={botDirectSuggesting}
                disabled={!selectedThread || !canSend || sending || botDirectSuggesting}
                onSubmit={(instruction) => suggestBotDirectReply(instruction)}
              />
              <Button
                type="text"
                size="small"
                icon={<SnippetsOutlined />}
                onClick={() => openReadyTextsModal('bot')}
              />
            </>
          )}
        />
      </div>

      {withMobileUserRail ? (
        <div dir="rtl" className="w-[54px] shrink-0 overflow-hidden border-l border-slate-200/45 bg-white/60 dark:border-white/[0.07] dark:bg-white/[0.025]">
          <div className="flex h-full flex-col items-center gap-0.5 overflow-y-auto overflow-x-hidden px-1 py-1.5">
            <div className="sticky top-0 z-10 flex w-full justify-center">
              <Popover
                trigger="click"
                placement="leftTop"
                open={mobileSearchOpen}
                onOpenChange={setMobileSearchOpen}
                content={(
                  <Input
                    size="small"
                    allowClear
                    autoFocus
                    value={threadSearch}
                    onChange={(event) => setThreadSearch(event.target.value)}
                    placeholder="جستجوی پی‌وی"
                    prefix={<SearchOutlined className="text-gray-400" />}
                    className="w-[170px]"
                  />
                )}
              >
                <Button
                  type={threadSearch ? 'primary' : 'default'}
                  shape="circle"
                  size="small"
                  icon={<SearchOutlined />}
                  className="shadow-sm"
                />
              </Popover>
            </div>
            {threads.map((row) => {
              const active = String(selectedThreadId || '') === String(row.id);
              const unreadCount = unreadByThread[String(row.id)] || 0;
              const rowTitle = String(row.counterparty_label || row.display_name || row.chat_id).trim() || 'پی‌وی بات';
              return (
                <button
                  key={`mobile-thread-${row.id}`}
                  type="button"
                  onClick={() => {
                    setMobileSearchOpen(false);
                    setSelectedThreadId(String(row.id));
                  }}
                  className={`flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition-colors ${active ? activeRailClass : inactiveRailClass}`}
                  title={rowTitle}
                >
                  <Badge count={unreadCount > 0 ? toPersianNumber(String(unreadCount)) : 0} size="small" offset={[-2, 2]} color={NOTIFICATION_UNREAD_BADGE_COLOR}>
                    <DirectThreadAvatar row={row} size={38} active={active} />
                  </Badge>
                  <span className="line-clamp-2 text-center text-[10px] leading-4 text-gray-500 dark:text-gray-400">
                    {rowTitle}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default React.memo(BotDirectMessagesPanel);
