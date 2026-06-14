import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { insertNotesWithFallback } from '../utils/noteDispatch';
import { parseNoteContent, serializeNoteContent, type NoteAttachment } from '../utils/noteContent';
import { normalizeNoteScope } from '../utils/noteScope';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import {
  BOT_DIRECT_FORWARD_PREFIX,
  BOT_GROUP_FORWARD_PREFIX,
  CHAT_GROUP_PREFIX,
  SAVED_MESSAGES_FORWARD_TARGET,
  getBotDirectForwardSelectionId,
  SYSTEM_MESSAGES_USER_ID,
  getBotGroupForwardSelectionId,
  getChatGroupSelectionId,
  isBotDirectForwardSelection,
  isBotGroupForwardSelection,
  isChatGroupSelection,
  isSavedMessagesForwardSelection,
} from '../utils/notificationConversationKeys';

export type ForwardSourceType = 'note' | 'bot';

export type ForwardTargetOption = {
  label: string;
  value: string;
  searchText: string;
};

type ForwardRuntimeMessageApi = {
  warning: (content: string) => void;
  success: (content: string) => void;
  error: (content: string) => void;
};

type UseNotificationForwardRuntimeOptions = {
  messageApi: ForwardRuntimeMessageApi;
  forwardingNote: any | null;
  forwardTargetUserIds: string[];
  forwardMessageText: string;
  setForwardingNote: Dispatch<SetStateAction<any | null>>;
  setForwardTargetUserIds: Dispatch<SetStateAction<string[]>>;
  setForwardMessageText: Dispatch<SetStateAction<string>>;
  setForwardSubmitting: Dispatch<SetStateAction<boolean>>;
  selectedNoteUserId: string | null;
  profileId: string | null;
  currentAuthorName: string | null;
  botGroups: any[];
  botDirectThreads: any[];
  chatGroups: any[];
  chatGroupMap: Record<string, any>;
  availableDirectUsers: Array<{ id: string; display_name: string; role_id?: string | null }>;
  roleLookup: Record<string, string>;
  getChatGroupPayload: (group: any | null | undefined) => {
    mentionUserIds: string[];
    mentionRoleIds: string[];
    metadata: Record<string, any> | null;
  };
  getBotMessageAttachments: (row: any) => NoteAttachment[];
  buildAttachmentNameText: (attachments: Array<{ name?: string; url?: string }>) => string;
  sendTextToBotGroup: (group: any, text: string, options?: Record<string, any>) => Promise<any>;
  sendTextToBotDirectThread: (thread: any, text: string, options?: Record<string, any>) => Promise<any>;
  refreshSection: (section: 'notes' | 'bot_messages' | 'bot_direct_messages', options?: { force?: boolean }) => Promise<any>;
  onForwarded?: () => void;
};

const getBotGroupForwardLabel = (group: any) => {
  const title = String(group?.group_title || group?.counterparty_label || group?.group_join_link || group?.id || '').trim() || 'گروه بات';
  const channelLabel = String(group?.channel_type || '').trim();
  const channelFa = channelLabel === 'rubika'
    ? 'روبیکا'
    : channelLabel === 'bale'
      ? 'بله'
      : channelLabel === 'telegram'
        ? 'تلگرام'
        : channelLabel || 'بات';
  return `${title} (گروه بات ${channelFa})`;
};

const getBotDirectForwardLabel = (thread: any) => {
  const title = String(
    thread?.counterparty_label
    || thread?.display_name
    || thread?.username
    || thread?.phone_number
    || thread?.chat_id
    || ''
  ).trim() || 'پیام شخصی بات';
  const channelLabel = String(thread?.channel_type || '').trim();
  const channelFa = channelLabel === 'rubika'
    ? 'روبیکا'
    : channelLabel === 'bale'
      ? 'بله'
      : channelLabel === 'telegram'
        ? 'تلگرام'
        : channelLabel || 'بات';
  return `${title} (شخصی بات ${channelFa})`;
};

export const useNotificationForwardRuntime = ({
  messageApi,
  forwardingNote,
  forwardTargetUserIds,
  forwardMessageText,
  setForwardingNote,
  setForwardTargetUserIds,
  setForwardMessageText,
  setForwardSubmitting,
  selectedNoteUserId,
  profileId,
  currentAuthorName,
  botGroups,
  botDirectThreads,
  chatGroups,
  chatGroupMap,
  availableDirectUsers,
  roleLookup,
  getChatGroupPayload,
  getBotMessageAttachments,
  buildAttachmentNameText,
  sendTextToBotGroup,
  sendTextToBotDirectThread,
  refreshSection,
  onForwarded,
}: UseNotificationForwardRuntimeOptions) => {
  const forwardTargetOptions = useMemo<ForwardTargetOption[]>(
    () => [
      {
        label: 'یادداشت‌های من',
        value: SAVED_MESSAGES_FORWARD_TARGET,
        searchText: 'یادداشت‌های من saved messages پیام‌های ذخیره‌شده'.toLowerCase(),
      },
      ...botGroups.map((group) => ({
        label: getBotGroupForwardLabel(group),
        value: `${BOT_GROUP_FORWARD_PREFIX}${group.id}`,
        searchText: `${getBotGroupForwardLabel(group)} ${String(group.group_join_link || '').trim() || ''} ${String(group.chat_id || '').trim() || ''}`.toLowerCase(),
      })),
      ...chatGroups.map((group) => ({
        label: `گروه: ${group.name}`,
        value: `${CHAT_GROUP_PREFIX}${group.id}`,
        searchText: `گروه ${group.name}`.toLowerCase(),
      })),
      ...availableDirectUsers
        .filter((user) => String(user.id) !== String(profileId || ''))
        .map((user) => {
          const roleLabel = user.role_id ? roleLookup[String(user.role_id)] : '';
          return {
            label: roleLabel ? `${user.display_name} - ${roleLabel}` : user.display_name,
            value: String(user.id),
            searchText: `${user.display_name} ${roleLabel || ''}`.toLowerCase(),
          };
        }),
      ...botDirectThreads.map((thread) => ({
        label: getBotDirectForwardLabel(thread),
        value: `${BOT_DIRECT_FORWARD_PREFIX}${thread.id}`,
        searchText: `${getBotDirectForwardLabel(thread)} ${String(thread?.username || '').trim()} ${String(thread?.phone_number || '').trim()} ${String(thread?.chat_id || '').trim()}`.toLowerCase(),
      })),
    ],
    [availableDirectUsers, botDirectThreads, botGroups, chatGroups, profileId, roleLookup]
  );

  const closeForwardModal = useCallback(() => {
    setForwardingNote(null);
    setForwardTargetUserIds([]);
    setForwardMessageText('');
  }, [setForwardMessageText, setForwardTargetUserIds, setForwardingNote]);

  const openForwardModal = useCallback((note: any, sourceType: ForwardSourceType = 'note') => {
    setForwardingNote({
      ...note,
      __forward_source_type: sourceType,
    });
    setForwardTargetUserIds(
      selectedNoteUserId && selectedNoteUserId !== SYSTEM_MESSAGES_USER_ID
        ? [String(selectedNoteUserId)]
        : []
    );
    setForwardMessageText('');
  }, [selectedNoteUserId, setForwardMessageText, setForwardTargetUserIds, setForwardingNote]);

  const submitForward = useCallback(async () => {
    if (!forwardingNote || forwardTargetUserIds.length === 0) return;

    const targetIds = Array.from(
      new Set(
        forwardTargetUserIds
          .map((id) => String(id || '').trim())
          .filter(Boolean)
      )
    );

    if (targetIds.length === 0) {
      messageApi.warning('حداقل یک گیرنده معتبر انتخاب کنید.');
      return;
    }

    const sourceType = String((forwardingNote as any)?.__forward_source_type || 'note').trim() === 'bot' ? 'bot' : 'note';
    const scope = sourceType === 'note'
      ? normalizeNoteScope(forwardingNote.module_id, forwardingNote.record_id)
      : normalizeNoteScope(null, null);
    const parsedContent: { text: string; attachments: NoteAttachment[] } = sourceType === 'note'
      ? parseNoteContent(forwardingNote.content)
      : { text: String(forwardingNote?.content_text || '').trim(), attachments: getBotMessageAttachments(forwardingNote) };

    const customForwardMessageText = String(forwardMessageText || '').trim();
    const baseForwardText = String(parsedContent.text || '').trim();
    const finalForwardText = customForwardMessageText
      ? [customForwardMessageText, baseForwardText].filter(Boolean).join('\n\n')
      : baseForwardText;
    const forwardedAttachments = parsedContent.attachments || [];
    const payloads = targetIds.flatMap((targetId) => {
      if (isBotGroupForwardSelection(targetId)) {
        return [];
      }
      if (isBotDirectForwardSelection(targetId)) {
        return [];
      }
      if (isSavedMessagesForwardSelection(targetId)) {
        return [{
          module_id: scope.module_id,
          record_id: scope.record_id,
          content: serializeNoteContent(finalForwardText, forwardedAttachments),
          reply_to: null,
          mention_user_ids: [],
          mention_role_ids: [],
          author_id: profileId,
          author_name: currentAuthorName,
          metadata: {
            saved_message: true,
            forwarded_from: {
              source_type: sourceType,
              source_id: String(forwardingNote?.id || '').trim() || null,
            },
          },
        }];
      }
      if (isChatGroupSelection(targetId)) {
        const group = chatGroupMap[String(getChatGroupSelectionId(targetId) || '')] || null;
        if (!group) return [];
        const groupPayload = getChatGroupPayload(group);
        return [{
          module_id: scope.module_id,
          record_id: scope.record_id,
          content: serializeNoteContent(finalForwardText, forwardedAttachments),
          reply_to: null,
          mention_user_ids: groupPayload.mentionUserIds,
          mention_role_ids: groupPayload.mentionRoleIds,
          author_id: profileId,
          author_name: currentAuthorName,
          metadata: groupPayload.metadata,
        }];
      }

      if (targetId === String(profileId || '')) return [];
      return [{
        module_id: scope.module_id,
        record_id: scope.record_id,
        content: serializeNoteContent(finalForwardText, forwardedAttachments),
        reply_to: null,
        mention_user_ids: [targetId],
        mention_role_ids: [],
        author_id: profileId,
        author_name: currentAuthorName,
        metadata: null,
      }];
    });

    const botTargets = targetIds
      .filter((value) => isBotGroupForwardSelection(value))
      .map((value) => String(getBotGroupForwardSelectionId(value) || '').trim())
      .filter(Boolean);
    const botDirectTargets = targetIds
      .filter((value) => isBotDirectForwardSelection(value))
      .map((value) => String(getBotDirectForwardSelectionId(value) || '').trim())
      .filter(Boolean);

    if (payloads.length === 0 && botTargets.length === 0 && botDirectTargets.length === 0) {
      messageApi.warning('حداقل یک گیرنده معتبر انتخاب کنید.');
      return;
    }

    setForwardSubmitting(true);
    try {
      if (payloads.length > 0) {
        await insertNotesWithFallback(payloads);
      }
      for (const botGroupId of botTargets) {
        const targetGroup = botGroups.find((row) => String(row.id) === botGroupId);
        if (!targetGroup) continue;
        const isRubikaTarget = String(targetGroup.channel_type || '').trim() === 'rubika';
        const forwardedAttachmentNameText = buildAttachmentNameText(forwardedAttachments);
        const rubikaTextWithPrefix = customForwardMessageText
          ? [customForwardMessageText, String(parsedContent.text || '').trim()].filter(Boolean).join('\n\n')
          : String(parsedContent.text || '').trim();
        const targetText = isRubikaTarget && forwardedAttachments.length > 0
          ? rubikaTextWithPrefix
          : finalForwardText;
        await sendTextToBotGroup(targetGroup, targetText, {
          fallbackText: isRubikaTarget && forwardedAttachments.length > 0
            ? [customForwardMessageText, String(parsedContent.text || '').trim(), forwardedAttachmentNameText].filter(Boolean).join('\n')
            : undefined,
          attachments: isRubikaTarget ? forwardedAttachments : undefined,
          payload: {
            attachments: forwardedAttachments,
            forwarded_from: {
              source_type: sourceType,
              source_id: String(forwardingNote?.id || '').trim() || null,
            },
          },
          messageType: forwardedAttachments.length > 0 ? 'file' : 'text',
        });
      }
      for (const botDirectThreadId of botDirectTargets) {
        const targetThread = botDirectThreads.find((row) => String(row.id) === botDirectThreadId);
        if (!targetThread) continue;
        const isRubikaTarget = String(targetThread.channel_type || '').trim() === 'rubika';
        const forwardedAttachmentNameText = buildAttachmentNameText(forwardedAttachments);
        const rubikaTextWithPrefix = customForwardMessageText
          ? [customForwardMessageText, String(parsedContent.text || '').trim()].filter(Boolean).join('\n\n')
          : String(parsedContent.text || '').trim();
        const targetText = isRubikaTarget && forwardedAttachments.length > 0
          ? rubikaTextWithPrefix
          : finalForwardText;
        await sendTextToBotDirectThread(targetThread, targetText, {
          fallbackText: isRubikaTarget && forwardedAttachments.length > 0
            ? [customForwardMessageText, String(parsedContent.text || '').trim(), forwardedAttachmentNameText].filter(Boolean).join('\n')
            : undefined,
          attachments: isRubikaTarget ? forwardedAttachments : undefined,
          payload: {
            attachments: forwardedAttachments,
            forwarded_from: {
              source_type: sourceType,
              source_id: String(forwardingNote?.id || '').trim() || null,
            },
          },
          messageType: forwardedAttachments.length > 0 ? 'file' : 'text',
        });
      }
      onForwarded?.();
      closeForwardModal();
      messageApi.success('پیام فوروارد شد.');
      await refreshSection('notes', { force: true });
      await refreshSection('bot_messages', { force: true });
      await refreshSection('bot_direct_messages', { force: true });
    } catch (error: any) {
      messageApi.error(toFaErrorMessage(error, 'فوروارد پیام ناموفق بود.'));
    } finally {
      setForwardSubmitting(false);
    }
  }, [
    botGroups,
    botDirectThreads,
    buildAttachmentNameText,
    chatGroupMap,
    closeForwardModal,
    currentAuthorName,
    forwardMessageText,
    forwardTargetUserIds,
    forwardingNote,
    getBotMessageAttachments,
    getChatGroupPayload,
    messageApi,
    onForwarded,
    profileId,
    refreshSection,
    sendTextToBotDirectThread,
    sendTextToBotGroup,
    setForwardSubmitting,
  ]);

  return {
    forwardTargetOptions,
    closeForwardModal,
    openForwardModal,
    submitForward,
  };
};
