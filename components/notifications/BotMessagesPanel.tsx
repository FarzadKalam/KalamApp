import React from 'react';
import { App, Avatar, Badge, Button, Empty, Input, Modal, Popover } from 'antd';
import { EditOutlined, RobotOutlined, SearchOutlined, SnippetsOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { normalizePublicAssetUrl } from '../../utils/assetUrl';
import { supabase } from '../../supabaseClient';
import { safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import SharedNoteCard from '../notes/SharedNoteCard';
import SharedNoteComposer from '../notes/SharedNoteComposer';
import AiSparkleIcon from '../ai/AiSparkleIcon';
import ConversationTimeline from './ConversationTimeline';
import UnreadCountBadge, { NOTIFICATION_UNREAD_BADGE_COLOR } from './UnreadCountBadge';
import ProfileAvatar from '../common/ProfileAvatar';
import { BOT_CHANNEL_LABELS_FA, getBotPlatformAvatarSrc } from '../../utils/botPlatform';

type BotGroupRow = {
  id: string;
  target_type?: string | null;
  customer_id?: string | null;
  supplier_id?: string | null;
  employee_id?: string | null;
  channel_type?: string | null;
  status?: string | null;
  group_title?: string | null;
  group_join_link?: string | null;
  bot_chat_id?: string | null;
  counterparty_label?: string | null;
  counterparty_image_url?: string | null;
  updated_at?: string | null;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
};

type BotMessageRow = {
  id: string;
  bot_group_id: string | null;
  direction?: string | null;
  message_type?: string | null;
  content_text?: string | null;
  file_url: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  payload?: Record<string, any> | null;
  created_at?: string | null;
};

type AiSuggestionPopoverActionProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  disabled: boolean;
  onSubmit: (instruction: string) => void | Promise<void>;
};

const EMPTY_BOT_MESSAGES: BotMessageRow[] = [];

const BOT_STATUS_LABELS_FA: Record<string, string> = {
  pending_join_link: 'در انتظار ثبت لینک',
  pending_join: 'انتظار برای پیام در گروه',
  active: 'فعال',
  disabled: 'غیرفعال',
  error: 'خطا',
};

const BotGroupAvatar: React.FC<{ row: Pick<BotGroupRow, 'channel_type' | 'counterparty_image_url'>; size: number; extraClassName?: string }> = ({ row, size, extraClassName = '' }) => {
  const imgSrc = normalizePublicAssetUrl(row.counterparty_image_url || '');
  if (imgSrc) {
    return <ProfileAvatar size={size} src={imgSrc} preset="avatar" className={extraClassName} name="مخاطب" />;
  }
  const platformSrc = getBotPlatformAvatarSrc(String(row.channel_type || '').trim());
  if (platformSrc) {
    return <ProfileAvatar size={size} src={platformSrc} preset="avatar" className={extraClassName} name="پلتفرم بات" />;
  }
  return (
    <Avatar size={size} className={`!bg-amber-100 !text-amber-700 dark:!bg-amber-500/15 dark:!text-amber-300 ${extraClassName}`}>
      <RobotOutlined />
    </Avatar>
  );
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
            <Button
              type="primary"
              size="small"
              loading={loading}
              onClick={() => void onSubmit(draft)}
            >
              دریافت پیشنهاد
            </Button>
          </div>
        </div>
      )}
    >
      <button
        type="button"
        disabled={disabled}
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
    </Popover>
  );
};

// ---------------------------------------------------------------------------
// Single bot message row — memoized so virtualizer scroll frames re-render
// only changed rows: same row + same ctx ⇒ no work.
// ---------------------------------------------------------------------------
type BotMessageRowItemProps = {
  row: BotMessageRow;
  replyTarget: BotMessageRow | null;
  ctx: Record<string, any>;
};

const BotMessageRowItem: React.FC<BotMessageRowItemProps> = React.memo(({ row, replyTarget, ctx }) => {
  const {
    selectedGroup,
    getBotMessageAttachments,
    importBotMessageAttachment,
    resolveBotMessageAuthor,
    resolveBotBubbleAvatar,
    normalizeReadReceipts,
    isUnreadBotRow,
    isUuidValue,
    renderReadReceiptStatus,
    shouldAnimateChatEntry,
    scrollMessageIntoView,
    editingBotMessageId,
    editingBotMessageValue,
    setEditingBotMessageId,
    setEditingBotMessageValue,
    syncBotProviderMessageAction,
    botConversationSummaryAvailable,
    botTimelineAvailable,
    refreshBotConversationSummaries,
    refreshBotTimeline,
    refreshUnreadSummary,
    fetchBotMessages,
    openForwardModal,
    openCreateActivityFromMessage,
    setBotReplyToId,
    setBotMessages,
    message,
  } = ctx;

  const outgoing = String(row.direction || '') === 'outbound';
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const parsedAttachments = getBotMessageAttachments(row);
  const fileId = String((payload as any)?.media_file_id || '').trim();
  const displayAttachments = parsedAttachments.length > 0
    ? parsedAttachments
    : (String(row.file_name || '').trim() && fileId
      ? [{
        name: String(row.file_name || '').trim(),
        url: '',
        mimeType: String(row.mime_type || '').trim() || null,
        fileType: String(row.message_type || 'file').trim() || 'file',
      }]
      : []);
  const replyAuthorName = replyTarget ? resolveBotMessageAuthor(replyTarget).name : null;
  const replyAttachments = replyTarget ? getBotMessageAttachments(replyTarget).map((item: any) => ({
    name: item.name,
    url: item.url,
    mimeType: item.mimeType,
    fileType: item.fileType,
  } as any)) : [];
  const body = String(row.content_text || '').trim()
    || (displayAttachments.length === 0 && row.file_name ? `فایل: ${row.file_name}` : '');
  const isEditing = editingBotMessageId === row.id;
  const author = resolveBotMessageAuthor(row);
  const authorNodes = ctx.renderBotAuthorNodes ? ctx.renderBotAuthorNodes(row, author) : {};
  const botAvatar = resolveBotBubbleAvatar(author, outgoing);
  const botReadReceipts = normalizeReadReceipts(payload);
  const botMessageId = String(row.id || '').trim();
  const isPersistedBotMessage = isUuidValue(botMessageId);
  const isUnreadBotMessage = isUnreadBotRow(row);

  return (
    <div>
      <SharedNoteCard
        authorName={author.name}
        authorNameNode={authorNodes.authorNameNode}
        metaNode={authorNodes.metaNode}
        createdAtLabel={safeJalaliFormat(row.created_at, 'YYYY/MM/DD HH:mm')}
        text={body}
        attachments={displayAttachments.map((item: any) => ({
          name: item.name,
          url: item.url,
          mimeType: item.mimeType,
          fileType: item.fileType,
        } as any))}
        onAttachmentClick={async (attachment) => {
          const normalizedUrl = String(attachment?.url || '').trim();
          const isImage = attachment?.fileType === 'image';
          if (normalizedUrl) {
            if (!isImage && typeof document !== 'undefined') {
              const link = document.createElement('a');
              link.href = normalizedUrl;
              link.download = String(attachment?.name || 'file').trim() || 'file';
              link.target = '_blank';
              link.rel = 'noopener noreferrer';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }
            return;
          }
          try {
            await importBotMessageAttachment(row, { force: true, downloadAfter: true });
          } catch (error) {
            message.error(toFaErrorMessage(error as any, 'دریافت فایل پیام بات ناموفق بود.'));
          }
        }}
        avatarUrl={botAvatar.src}
        avatarFallback={botAvatar.fallback}
        avatarClassName={botAvatar.className}
        mentionUsers={[]}
        mentionRoles={[]}
        replyText={replyTarget ? String(replyTarget.content_text || '').trim() : null}
        replyAuthorName={replyAuthorName}
        replyAttachments={replyAttachments}
        onReplyPreviewClick={replyTarget ? () => scrollMessageIntoView(`bot-message-${String(replyTarget.id)}`) : undefined}
        messageDomId={`bot-message-${String(row.id)}`}
        isMine={outgoing}
        animateOnMount={shouldAnimateChatEntry(row.created_at)}
        statusNode={renderReadReceiptStatus(botReadReceipts, [])}
        unreadIndicator={isUnreadBotMessage}
        footer={!outgoing && author.metaLabel && !authorNodes.metaNode ? author.metaLabel : undefined}
        isEdited={Boolean((payload as any)?.is_edited)}
        isEditing={isEditing}
        editingValue={editingBotMessageValue}
        onEditingChange={setEditingBotMessageValue}
        onSaveEdit={outgoing ? async () => {
          const nextText = String(editingBotMessageValue || '').trim();
          if (!nextText) return;
          await syncBotProviderMessageAction(selectedGroup, 'edit_message', row, nextText);
          const nextPayload = {
            ...(payload || {}),
            is_edited: true,
            edited_at: new Date().toISOString(),
          };
          const { error } = await supabase
            .from('counterparty_bot_messages')
            .update({
              content_text: nextText,
              payload: nextPayload,
            })
            .eq('id', row.id);
          if (error) throw error;
          setEditingBotMessageId(null);
          setEditingBotMessageValue('');
          if (botConversationSummaryAvailable) {
            await refreshBotConversationSummaries();
          }
          if (botTimelineAvailable) {
            await refreshBotTimeline();
          } else {
            await fetchBotMessages(selectedGroup?.id || null, { forceFull: true });
          }
        } : undefined}
        onCancelEdit={() => {
          setEditingBotMessageId(null);
          setEditingBotMessageValue('');
        }}
        onReply={isPersistedBotMessage ? () => setBotReplyToId(row.id) : undefined}
        onForward={() => openForwardModal(row, 'bot')}
        onCreateActivity={async () => {
          let activityAttachments = displayAttachments
            .map((item: any) => ({
              name: item.name,
              url: item.url,
              mimeType: item.mimeType,
              fileType: item.fileType,
            }))
            .filter((item: any) => String(item?.url || '').trim());
          if (activityAttachments.length === 0 && fileId) {
            try {
              const hydrated = await importBotMessageAttachment(row, { force: true });
              if (hydrated?.url) {
                activityAttachments = [hydrated];
              }
            } catch (error) {
              message.warning(toFaErrorMessage(error as any, 'دریافت فایل پیام بات ناموفق بود؛ فعالیت بدون پیوست باز شد.'));
            }
          }
          const relatedModuleId = selectedGroup?.customer_id
            ? 'customers'
            : (selectedGroup?.supplier_id ? 'suppliers' : (selectedGroup?.employee_id ? 'employees' : null));
          const relatedRecordId = selectedGroup?.customer_id
            ? String(selectedGroup.customer_id || '').trim()
            : (selectedGroup?.supplier_id ? String(selectedGroup.supplier_id || '').trim() : (selectedGroup?.employee_id ? String(selectedGroup.employee_id || '').trim() : null));
          const counterpartyLabel = String(selectedGroup?.counterparty_label || '').trim();
          const actorName = counterpartyLabel
            ? `${selectedGroup?.customer_id ? 'مشتری' : selectedGroup?.supplier_id ? 'تأمین‌کننده' : selectedGroup?.employee_id ? 'کارمند' : 'طرف حساب'} ${counterpartyLabel}`
            : author.name;
          await openCreateActivityFromMessage({
            channel: 'bot',
            actorName,
            createdAt: row.created_at,
            createdAtLabel: safeJalaliFormat(row.created_at, 'YYYY/MM/DD HH:mm'),
            content: body,
            attachments: activityAttachments,
            relatedModuleId,
            relatedRecordId,
          });
        }}
        onEdit={outgoing && isPersistedBotMessage ? () => {
          setEditingBotMessageId(row.id);
          setEditingBotMessageValue(String(row.content_text || '').trim());
        } : undefined}
        onDelete={outgoing && isPersistedBotMessage ? () => {
          Modal.confirm({
            title: 'حذف پیام بات',
            content: 'این پیام حذف شود؟',
            okText: 'حذف',
            cancelText: 'انصراف',
            okButtonProps: { danger: true },
            onOk: async () => {
              const rowId = String(row.id || '').trim();
              await syncBotProviderMessageAction(selectedGroup, 'delete_message', row);
              const { error } = await supabase.from('counterparty_bot_messages').delete().eq('id', rowId);
              if (error) throw error;
              setBotMessages((prev: any[]) => prev.filter((item: any) => String(item?.id || '') !== rowId));
              await Promise.all([
                botConversationSummaryAvailable ? refreshBotConversationSummaries() : Promise.resolve(null),
                refreshUnreadSummary(),
              ]);
              if (!botTimelineAvailable) {
                await fetchBotMessages(selectedGroup?.id || null, { forceFull: true });
              }
            },
          });
        } : undefined}
      />
    </div>
  );
});
BotMessageRowItem.displayName = 'BotMessageRowItem';

type BotMessagesPanelProps = {
  layout: 'desktop' | 'mobile';
  selectedGroup: BotGroupRow | null;
  selectedBotGroupId: string | null;
  setSelectedBotGroupId: (id: string) => void;
  botGroupSearch: string;
  setBotGroupSearch: (value: string) => void;
  mobileBotSearchOpen: boolean;
  setMobileBotSearchOpen: (value: boolean) => void;
  filteredBotGroups: BotGroupRow[];
  botUnreadByGroup: Record<string, number>;
  botMessageSearch: string;
  setBotMessageSearch: (value: string) => void;
  botMessages: BotMessageRow[];
  setBotMessages: (updater: any[] | ((prev: any[]) => any[])) => void;
  filteredBotMessages: BotMessageRow[];
  botMessageMap: Map<string, BotMessageRow>;
  loadingBotMessages: boolean;
  hideBotTimelineUntilSettled: boolean;
  botTimelineHasMoreBefore: boolean;
  loadingOlderBotMessages: boolean;
  loadOlderBotMessages: () => Promise<any> | void;
  botMessagesScrollContainerRef: React.RefObject<HTMLDivElement | null>;
  handleBotMessagesScroll: React.UIEventHandler<HTMLDivElement>;
  getBotMessageAttachments: any;
  importBotMessageAttachment: any;
  resolveBotMessageAuthor: any;
  renderBotAuthorNodes?: (row: BotMessageRow, author: any) => { authorNameNode?: React.ReactNode; metaNode?: React.ReactNode };
  resolveBotBubbleAvatar: (author: { avatarUrl?: string | null; fallback?: React.ReactNode } | null | undefined, outgoing: boolean) => { src?: string | null; fallback?: React.ReactNode; className?: string };
  normalizeReadReceipts: (box: any) => any[];
  isUnreadBotRow: any;
  isUuidValue: (value: unknown) => boolean;
  renderReadReceiptStatus: (receipts: any[], likes?: any[]) => React.ReactNode;
  shouldAnimateChatEntry: (createdAt: any) => boolean;
  scrollMessageIntoView: (id: string) => void;
  editingBotMessageId: string | null;
  editingBotMessageValue: string;
  setEditingBotMessageId: (value: string | null) => void;
  setEditingBotMessageValue: (value: string) => void;
  syncBotProviderMessageAction: any;
  botConversationSummaryAvailable: boolean;
  botTimelineAvailable: boolean;
  refreshBotConversationSummaries: () => Promise<any>;
  refreshBotTimeline: (options?: { force?: boolean }) => Promise<any>;
  refreshUnreadSummary: () => Promise<any>;
  fetchBotMessages: (groupId?: string | null, options?: { forceFull?: boolean }) => Promise<any>;
  openForwardModal: (row: BotMessageRow, sourceType: 'bot') => void;
  openCreateActivityFromMessage: (input: any) => void | Promise<void>;
  botNewIncomingCount: number;
  setBotNewIncomingCount: (value: number) => void;
  botShouldStickToBottomRef: React.MutableRefObject<boolean>;
  botForceScrollToBottomRef: React.MutableRefObject<boolean>;
  markBotMessagesAsSeen: any;
  scrollBotMessagesToBottom: (behavior?: ScrollBehavior) => void;
  botMessageText: string;
  handleBotMessageTextChange: (value: string) => void;
  sendBotMessage: () => Promise<void> | void;
  botSending: boolean;
  botSuggesting: boolean;
  botAttachments: File[];
  setBotAttachments: React.Dispatch<React.SetStateAction<File[]>>;
  botLinkedAttachments: any[];
  setBotLinkedAttachments: React.Dispatch<React.SetStateAction<any[]>>;
  botMentionPickerOpen: boolean;
  setBotMentionPickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedBotModuleId: string | null;
  selectedBotRecordId: string | null;
  botReplyToId: string | null;
  setBotReplyToId: (value: string | null) => void;
  botAiPopoverOpen: boolean;
  setBotAiPopoverOpen: (value: boolean) => void;
  suggestBotReply: (instruction?: string) => Promise<void> | void;
  openReadyTextsModal: (context: 'bot') => void;
  handleOpenBotStatusModal: () => Promise<void> | void;
  handleClose: () => void;
};

const BotMessagesPanel: React.FC<BotMessagesPanelProps> = ({
  layout,
  selectedGroup,
  selectedBotGroupId,
  setSelectedBotGroupId,
  botGroupSearch,
  setBotGroupSearch,
  mobileBotSearchOpen,
  setMobileBotSearchOpen,
  filteredBotGroups,
  botUnreadByGroup,
  botMessageSearch,
  setBotMessageSearch,
  botMessages,
  setBotMessages,
  filteredBotMessages,
  botMessageMap,
  loadingBotMessages,
  hideBotTimelineUntilSettled,
  botTimelineHasMoreBefore,
  loadingOlderBotMessages,
  loadOlderBotMessages,
  botMessagesScrollContainerRef,
  handleBotMessagesScroll,
  getBotMessageAttachments,
  importBotMessageAttachment,
  resolveBotMessageAuthor,
  renderBotAuthorNodes,
  resolveBotBubbleAvatar,
  normalizeReadReceipts,
  isUnreadBotRow,
  isUuidValue,
  renderReadReceiptStatus,
  shouldAnimateChatEntry,
  scrollMessageIntoView,
  editingBotMessageId,
  editingBotMessageValue,
  setEditingBotMessageId,
  setEditingBotMessageValue,
  syncBotProviderMessageAction,
  botConversationSummaryAvailable,
  botTimelineAvailable,
  refreshBotConversationSummaries,
  refreshBotTimeline,
  refreshUnreadSummary,
  fetchBotMessages,
  openForwardModal,
  openCreateActivityFromMessage,
  botNewIncomingCount,
  setBotNewIncomingCount,
  botShouldStickToBottomRef,
  botForceScrollToBottomRef,
  markBotMessagesAsSeen,
  scrollBotMessagesToBottom,
  botMessageText,
  handleBotMessageTextChange,
  sendBotMessage,
  botSending,
  botSuggesting,
  botAttachments,
  setBotAttachments,
  botLinkedAttachments,
  setBotLinkedAttachments,
  botMentionPickerOpen,
  setBotMentionPickerOpen,
  selectedBotModuleId,
  botReplyToId,
  setBotReplyToId,
  botAiPopoverOpen,
  setBotAiPopoverOpen,
  suggestBotReply,
  openReadyTextsModal,
  handleOpenBotStatusModal,
  handleClose,
}) => {
  const { message } = App.useApp();
  const withDesktopSidebar = layout === 'desktop';
  const withMobileUserRail = layout === 'mobile';
  // Stable row context: rows re-render only when something they show changes,
  // never because the timeline virtualizer produced a new scroll frame.
  const botRowCtx = React.useMemo(() => ({
    selectedGroup,
    getBotMessageAttachments,
    importBotMessageAttachment,
    resolveBotMessageAuthor,
    renderBotAuthorNodes,
    resolveBotBubbleAvatar,
    normalizeReadReceipts,
    isUnreadBotRow,
    isUuidValue,
    renderReadReceiptStatus,
    shouldAnimateChatEntry,
    scrollMessageIntoView,
    editingBotMessageId,
    editingBotMessageValue,
    setEditingBotMessageId,
    setEditingBotMessageValue,
    syncBotProviderMessageAction,
    botConversationSummaryAvailable,
    botTimelineAvailable,
    refreshBotConversationSummaries,
    refreshBotTimeline,
    refreshUnreadSummary,
    fetchBotMessages,
    openForwardModal,
    openCreateActivityFromMessage,
    setBotReplyToId,
    setBotMessages,
    message,
  }), [
    botConversationSummaryAvailable,
    botTimelineAvailable,
    editingBotMessageId,
    editingBotMessageValue,
    fetchBotMessages,
    getBotMessageAttachments,
    importBotMessageAttachment,
    isUnreadBotRow,
    isUuidValue,
    message,
    normalizeReadReceipts,
    openCreateActivityFromMessage,
    openForwardModal,
    refreshBotConversationSummaries,
    refreshBotTimeline,
    refreshUnreadSummary,
    renderReadReceiptStatus,
    resolveBotBubbleAvatar,
    resolveBotMessageAuthor,
    renderBotAuthorNodes,
    scrollMessageIntoView,
    selectedGroup,
    setBotMessages,
    setBotReplyToId,
    setEditingBotMessageId,
    setEditingBotMessageValue,
    shouldAnimateChatEntry,
    syncBotProviderMessageAction,
  ]);
  const renderBotRow = React.useCallback((row: BotMessageRow) => {
    if (!row) return null;
    const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
    const replyToId = String((payload as any)?.reply_to_message_id || '').trim();
    const replyTarget = replyToId ? botMessageMap.get(replyToId) || null : null;
    return <BotMessageRowItem row={row} replyTarget={replyTarget} ctx={botRowCtx} />;
  }, [botMessageMap, botRowCtx]);
  const getBotRowKey = React.useCallback((row: BotMessageRow, index: number) => String(row?.id ?? index), []);
  const timelineBotMessages = selectedGroup ? filteredBotMessages : EMPTY_BOT_MESSAGES;
  const statusLabel = BOT_STATUS_LABELS_FA[String(selectedGroup?.status || '')] || String(selectedGroup?.status || 'نامشخص');
  const channelKey = String(selectedGroup?.channel_type || '').trim() as keyof typeof BOT_CHANNEL_LABELS_FA;
  const channelLabel = BOT_CHANNEL_LABELS_FA[channelKey] || String(selectedGroup?.channel_type || '-');
  const groupTitle = String(selectedGroup?.group_title || '').trim() || String(selectedGroup?.group_join_link || '').trim() || 'گروه بدون عنوان';
  const canSend = Boolean(String(selectedGroup?.bot_chat_id || '').trim());
  const activeConversationClass = 'border border-[rgba(var(--brand-500-rgb),0.34)] bg-[rgba(var(--brand-500-rgb),0.14)] text-[rgb(var(--brand-900-rgb))] shadow-[inset_3px_0_0_rgba(var(--brand-500-rgb),0.72),0_6px_18px_rgba(var(--brand-500-rgb),0.12)] dark:border-[rgba(var(--brand-300-rgb),0.38)] dark:bg-[rgba(var(--brand-300-rgb),0.16)] dark:text-white dark:shadow-[inset_3px_0_0_rgba(var(--brand-300-rgb),0.72)]';
  const inactiveConversationClass = 'border border-transparent text-gray-700 hover:bg-white/80 dark:text-gray-200 dark:hover:bg-white/[0.055]';
  const activeRailClass = 'bg-[rgba(var(--brand-500-rgb),0.14)] shadow-[inset_0_0_0_1px_rgba(var(--brand-500-rgb),0.22)] dark:bg-[rgba(var(--brand-300-rgb),0.15)] dark:shadow-[inset_0_0_0_1px_rgba(var(--brand-300-rgb),0.24)]';
  const inactiveRailClass = 'hover:bg-white/75 dark:hover:bg-white/5';
  return (
    <div dir="ltr" className="flex min-w-0 flex-1 min-h-0 overflow-hidden bg-[rgba(var(--brand-50-rgb),0.16)] dark:bg-[#151113]">
      {withDesktopSidebar ? (
        <div dir="rtl" className="order-last w-[208px] border-l border-slate-200/55 bg-white/72 dark:border-white/[0.07] dark:bg-white/[0.025]">
          <div className="px-4 py-3 border-b border-slate-200/45 bg-white/55 dark:border-white/[0.07] dark:bg-white/[0.025]">
            <div className="text-xs font-bold text-gray-600 dark:text-gray-300">گروه‌های بات</div>
            <Input
              size="small"
              allowClear
              value={botGroupSearch}
              onChange={(event) => setBotGroupSearch(event.target.value)}
              placeholder="جستجوی گفتگو"
              prefix={<SearchOutlined className="text-gray-400" />}
              className="mt-2"
            />
          </div>
          <div className="overflow-y-auto h-full px-2 py-2 space-y-1">
            {filteredBotGroups.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="گروه باتی ثبت نشده است." />
            ) : filteredBotGroups.map((row) => {
              const rowStatus = BOT_STATUS_LABELS_FA[String(row.status || '')] || String(row.status || '');
              const rowChannel = BOT_CHANNEL_LABELS_FA[String(row.channel_type || '').trim() as keyof typeof BOT_CHANNEL_LABELS_FA] || String(row.channel_type || '');
              const rowTitle = String(row.group_title || '').trim() || String(row.group_join_link || '').trim() || 'گروه بدون عنوان';
              const active = String(selectedBotGroupId || '') === String(row.id);
              const unreadCount = botUnreadByGroup[String(row.id)] || 0;
              return (
                <button
                  type="button"
                  key={row.id}
                  className={`w-full rounded-xl px-3 py-2 text-right transition-colors ${
                    active
                      ? activeConversationClass
                      : inactiveConversationClass
                  }`}
                  onClick={() => {
                    setMobileBotSearchOpen(false);
                    setSelectedBotGroupId(String(row.id));
                  }}
                >
                  <div className="flex items-center gap-3">
                    <BotGroupAvatar row={row} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{rowTitle}</div>
                      <div className="truncate text-[11px] text-gray-400">{rowChannel} | {rowStatus}</div>
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
              <BotGroupAvatar row={selectedGroup ?? {}} size={withMobileUserRail ? 32 : 36} />
              <div className="min-w-0">
                <div className="truncate px-0.5 text-[13px] font-bold text-gray-800 dark:text-gray-100">{groupTitle}</div>
                <div className="truncate text-[11px] text-gray-500 dark:text-gray-400">وضعیت: {statusLabel} | پلتفرم: {channelLabel}</div>
              </div>
            </div>
            <Button
              size="small"
              icon={<EditOutlined />}
              disabled={!selectedGroup}
              onClick={() => void handleOpenBotStatusModal()}
            />
          </div>
          {selectedGroup && (selectedGroup.customer_id || selectedGroup.supplier_id || selectedGroup.employee_id) ? (
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              طرف مرتبط:{' '}
              <Link
                to={`/${selectedGroup.customer_id ? 'customers' : selectedGroup.supplier_id ? 'suppliers' : 'employees'}/${selectedGroup.customer_id || selectedGroup.supplier_id || selectedGroup.employee_id}`}
                className="underline decoration-dotted underline-offset-2 text-[rgb(var(--brand-700-rgb))] dark:text-[rgb(var(--brand-300-rgb))]"
                onClick={handleClose}
              >
                {String(selectedGroup.counterparty_label || '').trim() || 'مشاهده رکورد'}
              </Link>
            </div>
          ) : null}
          <Input
            size="small"
            allowClear
            value={botMessageSearch}
            onChange={(event) => setBotMessageSearch(event.target.value)}
            placeholder="جستجو در پیام های این گفتگو"
            className="mt-2"
            prefix={<SearchOutlined className="text-gray-400" />}
          />
          {!canSend ? (
            <div className="mt-2 rounded-lg border border-amber-200/50 bg-amber-50/75 px-2 py-1.5 text-xs text-amber-700">
              برای فعال شدن بات، بعد از عضویت بات در گروه، یک پیام داخل همان گروه ارسال کنید.
            </div>
          ) : null}
        </div>

        <ConversationTimeline
          containerRef={botMessagesScrollContainerRef}
          onScroll={handleBotMessagesScroll}
          layoutPaddingClass={withDesktopSidebar ? 'px-3 py-3' : 'px-2 py-2'}
          hideUntilSettled={hideBotTimelineUntilSettled}
          loading={loadingBotMessages}
          emptyDescription={!selectedGroup ? 'یک گروه بات را انتخاب کنید.' : 'پیامی برای این گروه ثبت نشده است.'}
          hasMoreBefore={botTimelineHasMoreBefore}
          loadingOlder={loadingOlderBotMessages}
          onLoadOlder={loadOlderBotMessages}
          items={timelineBotMessages}
          getItemKey={getBotRowKey}
          renderItem={renderBotRow}
        />
        {selectedGroup && botNewIncomingCount > 0 ? (
          <div className="pb-1 text-center">
            <button
              type="button"
              className="inline-flex items-center rounded-full border border-slate-300/45 bg-white/95 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white dark:border-white/[0.1] dark:bg-white/[0.08] dark:text-slate-200"
              onClick={() => {
                botShouldStickToBottomRef.current = true;
                botForceScrollToBottomRef.current = true;
                setBotNewIncomingCount(0);
                markBotMessagesAsSeen(botMessages);
                scrollBotMessagesToBottom('auto');
              }}
            >
              +{toPersianNumber(String(botNewIncomingCount))} پیام جدید
            </button>
          </div>
        ) : null}

        <SharedNoteComposer
          value={botMessageText}
          onChange={handleBotMessageTextChange}
          onSubmit={() => void sendBotMessage()}
          submitLoading={botSending}
          placeholder={canSend ? 'پیام به گروه بات...' : 'این گروه هنوز فعال نشده است.'}
          mentionOptions={[]}
          mentionValues={[]}
          onMentionChange={() => undefined}
          mentionPickerOpen={botMentionPickerOpen}
          onToggleMentionPicker={() => setBotMentionPickerOpen((prev) => !prev)}
          attachments={botAttachments}
          linkedAttachments={botLinkedAttachments}
          onFilesSelected={(files) => {
            setBotAttachments((prev) => {
              const map = new Map(prev.map((file) => [`${file.name}-${file.size}-${file.lastModified}`, file]));
              files.forEach((file) => {
                map.set(`${file.name}-${file.size}-${file.lastModified}`, file);
              });
              return Array.from(map.values());
            });
          }}
          onRemoveAttachment={(fileName) => {
            setBotAttachments((prev) => prev.filter((file) => file.name !== fileName));
          }}
          onLinkedAttachmentsSelected={(attachments) => {
            setBotLinkedAttachments((prev) => {
              const map = new Map(prev.map((attachment) => [String(attachment.url || ''), attachment]));
              attachments.forEach((attachment) => {
                const url = String(attachment.url || '').trim();
                if (url) map.set(url, attachment);
              });
              return Array.from(map.values());
            });
          }}
          onRemoveLinkedAttachment={(url) => {
            setBotLinkedAttachments((prev) => prev.filter((attachment) => String(attachment.url || '') !== String(url || '')));
          }}
          filePickerModuleId={selectedBotModuleId || (selectedGroup?.target_type === 'customers' ? 'customers' : selectedGroup?.target_type === 'suppliers' ? 'suppliers' : selectedGroup?.target_type === 'employees' ? 'employees' : null)}
          filePickerRecordId={selectedGroup?.target_type === 'customers' ? String(selectedGroup?.customer_id || '') : selectedGroup?.target_type === 'suppliers' ? String(selectedGroup?.supplier_id || '') : selectedGroup?.target_type === 'employees' ? String(selectedGroup?.employee_id || '') : null}
          replyActive={Boolean(botReplyToId)}
          onClearReply={() => setBotReplyToId(null)}
          enableImagePasteAndDrop
          submitDisabled={!selectedGroup || !canSend || botSending || botSuggesting || (!String(botMessageText || '').trim() && botAttachments.length === 0 && botLinkedAttachments.length === 0)}
          extraActions={(
            <>
              <AiSuggestionPopoverAction
                open={botAiPopoverOpen}
                onOpenChange={setBotAiPopoverOpen}
                loading={botSuggesting}
                disabled={!selectedGroup || botSending || botSuggesting}
                onSubmit={(instruction) => suggestBotReply(instruction)}
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
                open={mobileBotSearchOpen}
                onOpenChange={setMobileBotSearchOpen}
                content={(
                  <Input
                    size="small"
                    allowClear
                    autoFocus
                    value={botGroupSearch}
                    onChange={(event) => setBotGroupSearch(event.target.value)}
                    placeholder="جستجوی چت"
                    prefix={<SearchOutlined className="text-gray-400" />}
                    className="w-[170px]"
                  />
                )}
              >
                <Button
                  type={botGroupSearch ? 'primary' : 'default'}
                  shape="circle"
                  size="small"
                  icon={<SearchOutlined />}
                  className="shadow-sm"
                />
              </Popover>
            </div>

            {filteredBotGroups.map((row) => {
              const rowTitle = String(row.group_title || '').trim() || String(row.group_join_link || '').trim() || 'گروه';
              const active = String(selectedBotGroupId || '') === String(row.id);
              const unreadCount = botUnreadByGroup[String(row.id)] || 0;
              return (
                <button
                  key={`mobile-${row.id}`}
                  type="button"
                  onClick={() => {
                    setMobileBotSearchOpen(false);
                    setSelectedBotGroupId(String(row.id));
                  }}
                  className={`flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition-colors ${active ? activeRailClass : inactiveRailClass}`}
                  title={rowTitle}
                >
                  <Badge count={unreadCount > 0 ? toPersianNumber(String(unreadCount)) : 0} size="small" offset={[-2, 2]} color={NOTIFICATION_UNREAD_BADGE_COLOR}>
                    <BotGroupAvatar
                      row={row}
                      size={38}
                      extraClassName={active ? 'ring-2 ring-[rgba(var(--brand-500-rgb),0.42)] ring-offset-2 ring-offset-white dark:ring-[rgba(var(--brand-300-rgb),0.55)] dark:ring-offset-[#151113]' : ''}
                    />
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

export default React.memo(BotMessagesPanel);
