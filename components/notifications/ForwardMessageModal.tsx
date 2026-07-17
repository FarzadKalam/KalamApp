import React from 'react';
import { Button, Input, Modal, Select } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { parseNoteContent } from '../../utils/noteContent';
import type { ForwardTargetOption } from '../../hooks/useNotificationForwardRuntime';
import AdaptiveIdentityPicker from '../AdaptiveIdentityPicker';
import { parseIdentityToken } from '../../utils/identityDirectory';
import {
  CHAT_GROUP_PREFIX,
  isBotDirectForwardSelection,
  isBotGroupForwardSelection,
  isChatGroupSelection,
  isSavedMessagesForwardSelection,
} from '../../utils/notificationConversationKeys';

type ForwardMessageModalProps = {
  open: boolean;
  forwardingNote: any | null;
  forwardMessageText: string;
  forwardTargetUserIds: string[];
  forwardTargetOptions: ForwardTargetOption[];
  forwardSubmitting: boolean;
  onCancel: () => void;
  onSubmit: () => void | Promise<void>;
  onTextChange: (value: string) => void;
  onTargetsChange: (values: string[]) => void;
  onOpenReadyTexts: () => void;
};

const getForwardPreviewText = (forwardingNote: any | null) => {
  if (!forwardingNote) return '';
  return String((forwardingNote as any)?.__forward_source_type || 'note').trim() === 'bot'
    ? (String(forwardingNote?.content_text || '').trim() || 'بدون متن')
    : (parseNoteContent(forwardingNote.content).text || 'بدون متن');
};

const ForwardMessageModal: React.FC<ForwardMessageModalProps> = ({
  open,
  forwardingNote,
  forwardMessageText,
  forwardTargetUserIds,
  forwardTargetOptions,
  forwardSubmitting,
  onCancel,
  onSubmit,
  onTextChange,
  onTargetsChange,
  onOpenReadyTexts,
}) => {
  const identityValues = forwardTargetUserIds.flatMap((target) => {
    if (isChatGroupSelection(target)) return [`chat_group:${target.slice(CHAT_GROUP_PREFIX.length)}`];
    if (isBotDirectForwardSelection(target) || isBotGroupForwardSelection(target) || isSavedMessagesForwardSelection(target)) return [];
    return [`user:${target}`];
  });
  const externalValues = forwardTargetUserIds.filter((target) =>
    isBotDirectForwardSelection(target) || isBotGroupForwardSelection(target) || isSavedMessagesForwardSelection(target));
  const externalOptions = forwardTargetOptions.filter((option) =>
    isBotDirectForwardSelection(option.value) || isBotGroupForwardSelection(option.value) || isSavedMessagesForwardSelection(option.value));

  return (
  <Modal
    title="فوروارد پیام"
    open={open}
    zIndex={1700}
    onCancel={onCancel}
    onOk={onSubmit}
    confirmLoading={forwardSubmitting}
    okText="فوروارد"
    cancelText="انصراف"
    okButtonProps={{ disabled: forwardTargetUserIds.length === 0 }}
  >
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-gray-500">متن پیام فوروارد</div>
        <Button size="small" icon={<CopyOutlined />} onClick={onOpenReadyTexts}>
          پیام‌های آماده
        </Button>
      </div>
      <div className="rounded-2xl border border-[rgba(var(--brand-200-rgb),0.7)] bg-[rgba(var(--brand-50-rgb),0.7)] px-3 py-2 text-sm text-gray-700">
        {getForwardPreviewText(forwardingNote)}
      </div>
      <Input.TextArea
        value={forwardMessageText}
        onChange={(event) => onTextChange(event.target.value)}
        rows={3}
        placeholder="متن اختیاری قبل از محتوای فوروارد"
        className="w-full"
      />
      <AdaptiveIdentityPicker
        mode="multiple"
        scopes={['user', 'chat_group']}
        value={identityValues}
        onChange={(values) => {
          const nextIdentityTargets = (Array.isArray(values) ? values : []).flatMap((value) => {
            const parsed = parseIdentityToken(value);
            if (!parsed.id) return [];
            return parsed.kind === 'chat_group' ? [`${CHAT_GROUP_PREFIX}${parsed.id}`] : [parsed.id];
          });
          onTargetsChange([...externalValues, ...nextIdentityTargets]);
        }}
        placeholder="انتخاب افراد یا گروه‌های داخلی"
        pickerTitle="انتخاب گیرندگان داخلی"
        className="w-full"
        overlayZIndexBase={1710}
      />
      {externalOptions.length > 0 ? <Select
        mode="multiple"
        showSearch
        allowClear
        value={externalValues}
        onChange={(values) => onTargetsChange([...identityValues.flatMap((value) => {
          const parsed = parseIdentityToken(value);
          if (!parsed.id) return [];
          return parsed.kind === 'chat_group' ? [`${CHAT_GROUP_PREFIX}${parsed.id}`] : [parsed.id];
        }), ...(values || []).map((value) => String(value))])}
        placeholder="گروه بات، پیام شخصی بات یا پیام‌های من"
        optionFilterProp="searchText"
        filterOption={(input, option) => String(option?.searchText || '').includes(String(input || '').trim().toLowerCase())}
        getPopupContainer={(trigger) => trigger.parentElement || document.body}
        styles={{ popup: { root: { zIndex: 1710 } } }}
        options={externalOptions}
        maxTagCount="responsive"
        className="w-full"
      /> : null}
    </div>
  </Modal>
  );
};

export default React.memo(ForwardMessageModal);
