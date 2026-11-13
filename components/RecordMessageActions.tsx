import React, { useMemo, useState } from 'react';
import { App, Button, Modal, Tooltip } from 'antd';
import { MessageOutlined, PhoneOutlined, RobotOutlined } from '@ant-design/icons';
import MessageComposerModal from './MessageComposerModal';
import { getPrimaryRecordPhone, hasAnyRecordBotTarget } from '../utils/recordMessaging';
import { normalizePhoneForStorage } from '../utils/phoneNumber';
import { buildVoipFallbackUrl, requestVoipSmartCall } from '../utils/voipGateway';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { getRecordTitle } from '../utils/recordTitle';
import PhoneDisplay from './PhoneDisplay';

type RecordMessageActionsProps = {
  initialAction?: 'call' | 'sms';
  onActionComplete?: () => void;
  moduleId?: string | null;
  record?: Record<string, any> | null;
  phoneValue?: unknown;
  compact?: boolean;
  className?: string;
  buttonVariant?: 'default' | 'text';
};

const openExternalLink = (url: string) => {
  if (!url || typeof window === 'undefined') return;
  window.location.href = url;
};

const stopEvent = (event?: React.MouseEvent<HTMLElement>) => {
  event?.preventDefault();
  event?.stopPropagation();
};

const RecordMessageActions: React.FC<RecordMessageActionsProps> = ({
  moduleId,
  initialAction,
  onActionComplete,
  record,
  phoneValue,
  compact = false,
  className = '',
  buttonVariant = 'default',
}) => {
  const { message } = App.useApp();
  const [composerMode, setComposerMode] = useState<'sms' | 'bot' | null>(initialAction === 'sms' ? 'sms' : null);
  const [calling, setCalling] = useState(false);
  const [callPreviewOpen, setCallPreviewOpen] = useState(initialAction === 'call');

  const primaryPhone = useMemo(
    () => getPrimaryRecordPhone(moduleId, record, phoneValue),
    [moduleId, phoneValue, record]
  );
  const normalizedPhone = useMemo(() => normalizePhoneForStorage(primaryPhone), [primaryPhone]);
  const hasPhone = Boolean(primaryPhone);
  const hasBot = useMemo(() => hasAnyRecordBotTarget(record), [record]);
  const buttonSize = compact ? 'small' : 'middle';
  const recordTitle = getRecordTitle(record || {});
  const contactName = [record?.full_name, record?.business_name, record?.legal_name, record?.name, record?.title].find(value => typeof value === 'string' && value.trim()) || '';
  const contactDescription = [record?.description, record?.notes].find(value => typeof value === 'string' && value.trim()) || '';

  const handleCall = async (event?: React.MouseEvent<HTMLElement>) => {
    stopEvent(event);
    if (calling) return;

    const fallbackUrl = buildVoipFallbackUrl(normalizedPhone || primaryPhone, 'tel_link');
    try {
      setCalling(true);
      const result = await requestVoipSmartCall({
        phone: normalizedPhone || primaryPhone,
        moduleId,
        recordId: record?.id ? String(record.id) : null,
        title: record?.title || record?.name || record?.full_name || null,
      });

      if (result.started) {
        message.success(result.message || 'تماس VoIP آغاز شد.');
        return;
      }

      openExternalLink(result.fallbackUrl || fallbackUrl);
    } catch (error: any) {
      message.warning(toFaErrorMessage(error, 'تماس VoIP در دسترس نیست؛ مسیر تماس معمولی باز شد.'));
      openExternalLink(fallbackUrl);
    } finally {
      setCalling(false);
    }
  };

  if (!hasPhone && !hasBot) return null;

  return (
    <>
      {!initialAction && <div className={`flex items-center gap-1 ${className}`.trim()}>
        {hasPhone && (
          <Tooltip title="تماس">
            <Button
              size={buttonSize}
              type={buttonVariant}
              icon={<PhoneOutlined />}
              aria-label="تماس"
              loading={calling}
              onClick={(event) => { stopEvent(event); setCallPreviewOpen(true); }}
            />
          </Tooltip>
        )}
        {hasPhone && (
          <Tooltip title="پیامک">
            <Button
              size={buttonSize}
              type={buttonVariant}
              icon={<MessageOutlined />}
              aria-label="ارسال پیام"
              onClick={(event) => {
                stopEvent(event);
                setComposerMode('sms');
              }}
            />
          </Tooltip>
        )}
        {hasBot && (
          <Tooltip title="ارسال با بات">
            <Button
              size={buttonSize}
              type={buttonVariant}
              icon={<RobotOutlined />}
              aria-label="ارسال با بات"
              onClick={(event) => {
                stopEvent(event);
                setComposerMode('bot');
              }}
            />
          </Tooltip>
        )}
      </div>}

      {callPreviewOpen && <Modal open title="شماره‌گیر مخاطب" onCancel={() => { if (!calling) { setCallPreviewOpen(false); onActionComplete?.(); } }}
        footer={<Button type="primary" aria-label="برقراری تماس" icon={<PhoneOutlined aria-hidden="true" />} loading={calling} onClick={() => { void handleCall().finally(() => { setCallPreviewOpen(false); onActionComplete?.(); }); }}>برقراری تماس</Button>}>
        <div className="space-y-4 py-3" dir="rtl">
          <div><div className="mb-1 text-xs text-gray-500 dark:text-gray-400">مخاطب</div><div className="font-semibold">{recordTitle}</div>{contactName && contactName !== recordTitle && <div className="mt-1 text-sm">{contactName}</div>}</div>
          <div><div className="mb-1 text-xs text-gray-500 dark:text-gray-400">شماره تماس</div><PhoneDisplay value={primaryPhone} /></div>
          {contactDescription && <div><div className="mb-1 text-xs text-gray-500 dark:text-gray-400">توضیحات مخاطب</div><p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7">{contactDescription}</p></div>}
        </div>
      </Modal>}
      {composerMode && (
        <MessageComposerModal
          open={composerMode !== null}
          mode={composerMode}
          moduleId={moduleId}
          record={record}
          initialPhone={primaryPhone}
          onCancel={() => { setComposerMode(null); onActionComplete?.(); }}
        />
      )}
    </>
  );
};

export default RecordMessageActions;
