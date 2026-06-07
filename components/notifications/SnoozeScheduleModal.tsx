import React, { useEffect, useMemo, useState } from 'react';
import { Button, Modal } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import PersianDatePicker from '../PersianDatePicker';
import OverlayEventBoundary from '../OverlayEventBoundary';

type SnoozeScheduleModalProps = {
  open: boolean;
  title: string;
  initialValue?: string | null;
  confirmText: string;
  confirmLoading?: boolean;
  zIndex?: number;
  getContainer?: () => HTMLElement;
  onCancel: () => void;
  onConfirm: (value: string) => void | Promise<void>;
};

export const buildSnoozePresetOptions = (now = new Date()) => {
  const atMorning = (dayOffset: number) => {
    const value = new Date(now);
    value.setDate(value.getDate() + dayOffset);
    value.setHours(8, 0, 0, 0);
    return value.toISOString();
  };

  return [
    { label: 'یک ساعت دیگر', value: new Date(now.getTime() + 60 * 60 * 1000).toISOString() },
    { label: 'چهار ساعت دیگر', value: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString() },
    { label: 'فردا', value: atMorning(1) },
    { label: 'پس‌فردا', value: atMorning(2) },
  ];
};

const SnoozeScheduleModal: React.FC<SnoozeScheduleModalProps> = ({
  open,
  title,
  initialValue,
  confirmText,
  confirmLoading = false,
  zIndex = 12000,
  getContainer,
  onCancel,
  onConfirm,
}) => {
  const [draftValue, setDraftValue] = useState<string | null>(initialValue || null);
  const presets = useMemo(() => buildSnoozePresetOptions(), [open]);

  useEffect(() => {
    if (open) setDraftValue(initialValue || null);
  }, [initialValue, open]);

  return (
    <Modal
      open={open}
      title={(
        <span className="inline-flex items-center gap-2">
          <ClockCircleOutlined />
          {title}
        </span>
      )}
      onCancel={onCancel}
      onOk={() => {
        if (draftValue) void onConfirm(draftValue);
      }}
      okText={confirmText}
      cancelText="انصراف"
      okButtonProps={{ disabled: !draftValue }}
      confirmLoading={confirmLoading}
      destroyOnHidden
      zIndex={zIndex}
      getContainer={getContainer}
      modalRender={(node) => <OverlayEventBoundary>{node}</OverlayEventBoundary>}
    >
      <div className="space-y-4 pt-1">
        <div className="grid grid-cols-2 gap-2">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              type={draftValue === preset.value ? 'primary' : 'default'}
              onClick={() => setDraftValue(preset.value)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="text-sm text-gray-700 dark:text-gray-300">یا زمان دلخواه را انتخاب کنید:</div>
        <PersianDatePicker
          value={draftValue}
          onChange={setDraftValue}
          type="DATETIME"
          zIndex={zIndex + 20}
          modalContainer={getContainer}
          overlayZIndexBase={zIndex + 20}
        />
      </div>
    </Modal>
  );
};

export default SnoozeScheduleModal;
