import React from 'react';
import { Button, Input, Modal, Select } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { parseNoteContent } from '../../utils/noteContent';
import type { ForwardTargetOption } from '../../hooks/useNotificationForwardRuntime';

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
}) => (
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
      <Select
        mode="multiple"
        showSearch
        allowClear
        value={forwardTargetUserIds}
        onChange={(values) => onTargetsChange((values || []).map((value) => String(value)))}
        placeholder="یک یا چند گیرنده انتخاب کنید"
        optionFilterProp="searchText"
        filterOption={(input, option) => String(option?.searchText || '').includes(String(input || '').trim().toLowerCase())}
        getPopupContainer={(trigger) => trigger.parentElement || document.body}
        styles={{ popup: { root: { zIndex: 1710 } } }}
        options={forwardTargetOptions}
        maxTagCount="responsive"
        className="w-full"
      />
    </div>
  </Modal>
);

export default React.memo(ForwardMessageModal);
