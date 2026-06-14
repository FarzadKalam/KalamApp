import React from 'react';
import { useNotificationForwardRuntime } from '../../hooks/useNotificationForwardRuntime';
import ForwardMessageModal from './ForwardMessageModal';

type ForwardMessageModalRuntimeProps = {
  messageApi: any;
  forwardingNote: any | null;
  forwardTargetUserIds: string[];
  forwardMessageText: string;
  forwardSubmitting: boolean;
  setForwardingNote: React.Dispatch<React.SetStateAction<any | null>>;
  setForwardTargetUserIds: React.Dispatch<React.SetStateAction<string[]>>;
  setForwardMessageText: React.Dispatch<React.SetStateAction<string>>;
  setForwardSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
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
  getBotMessageAttachments: (row: any) => any[];
  buildAttachmentNameText: (attachments: Array<{ name?: string; url?: string }>) => string;
  sendTextToBotGroup: (group: any, text: string, options?: Record<string, any>) => Promise<any>;
  sendTextToBotDirectThread: (thread: any, text: string, options?: Record<string, any>) => Promise<any>;
  refreshSection: (section: 'notes' | 'bot_messages' | 'bot_direct_messages', options?: { force?: boolean }) => Promise<any>;
  onForwarded: () => void;
  onOpenReadyTexts: () => void;
};

const ForwardMessageModalRuntime: React.FC<ForwardMessageModalRuntimeProps> = ({
  messageApi,
  forwardingNote,
  forwardTargetUserIds,
  forwardMessageText,
  forwardSubmitting,
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
  onOpenReadyTexts,
}) => {
  const {
    forwardTargetOptions,
    closeForwardModal,
    submitForward,
  } = useNotificationForwardRuntime({
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
  });

  return (
    <ForwardMessageModal
      open={Boolean(forwardingNote)}
      forwardingNote={forwardingNote}
      forwardMessageText={forwardMessageText}
      forwardTargetUserIds={forwardTargetUserIds}
      forwardTargetOptions={forwardTargetOptions}
      forwardSubmitting={forwardSubmitting}
      onCancel={closeForwardModal}
      onSubmit={submitForward}
      onTextChange={setForwardMessageText}
      onTargetsChange={setForwardTargetUserIds}
      onOpenReadyTexts={onOpenReadyTexts}
    />
  );
};

export default React.memo(ForwardMessageModalRuntime);
