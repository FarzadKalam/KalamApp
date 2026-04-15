import React, { useMemo, useState } from 'react';
import { App, Button, Tooltip } from 'antd';
import { MessageOutlined, PhoneOutlined, RobotOutlined } from '@ant-design/icons';
import MessageComposerModal from './MessageComposerModal';
import { getPrimaryRecordPhone, hasAnyRecordBotTarget } from '../utils/recordMessaging';
import { normalizePhoneForStorage } from '../utils/phoneNumber';
import { buildVoipFallbackUrl, requestVoipSmartCall } from '../utils/voipGateway';
import { toFaErrorMessage } from '../utils/errorMessageFa';

type RecordMessageActionsProps = {
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
  record,
  phoneValue,
  compact = false,
  className = '',
  buttonVariant = 'default',
}) => {
  const { message } = App.useApp();
  const [composerMode, setComposerMode] = useState<'sms' | 'bot' | null>(null);
  const [calling, setCalling] = useState(false);

  const primaryPhone = useMemo(
    () => getPrimaryRecordPhone(moduleId, record, phoneValue),
    [moduleId, phoneValue, record]
  );
  const normalizedPhone = useMemo(() => normalizePhoneForStorage(primaryPhone), [primaryPhone]);
  const hasPhone = Boolean(primaryPhone);
  const hasBot = useMemo(() => hasAnyRecordBotTarget(record), [record]);
  const buttonSize = compact ? 'small' : 'middle';

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
      <div className={`flex items-center gap-1 ${className}`.trim()}>
        {hasPhone && (
          <Tooltip title="تماس">
            <Button
              size={buttonSize}
              type={buttonVariant}
              icon={<PhoneOutlined />}
              loading={calling}
              onClick={handleCall}
            />
          </Tooltip>
        )}
        {hasPhone && (
          <Tooltip title="پیامک">
            <Button
              size={buttonSize}
              type={buttonVariant}
              icon={<MessageOutlined />}
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
              onClick={(event) => {
                stopEvent(event);
                setComposerMode('bot');
              }}
            />
          </Tooltip>
        )}
      </div>

      {composerMode && (
        <MessageComposerModal
          open={composerMode !== null}
          mode={composerMode}
          moduleId={moduleId}
          record={record}
          initialPhone={primaryPhone}
          onCancel={() => setComposerMode(null)}
        />
      )}
    </>
  );
};

export default RecordMessageActions;
