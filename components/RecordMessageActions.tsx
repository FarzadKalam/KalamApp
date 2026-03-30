import React, { useMemo, useState } from 'react';
import { Button, Tooltip } from 'antd';
import { MessageOutlined, PhoneOutlined, RobotOutlined } from '@ant-design/icons';
import MessageComposerModal from './MessageComposerModal';
import { getPrimaryRecordPhone, hasAnyRecordBotTarget } from '../utils/recordMessaging';
import { normalizePhoneForStorage } from '../utils/phoneNumber';

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
  const [composerMode, setComposerMode] = useState<'sms' | 'bot' | null>(null);

  const primaryPhone = useMemo(
    () => getPrimaryRecordPhone(moduleId, record, phoneValue),
    [moduleId, phoneValue, record]
  );
  const normalizedPhone = useMemo(() => normalizePhoneForStorage(primaryPhone), [primaryPhone]);
  const hasPhone = Boolean(primaryPhone);
  const hasBot = useMemo(() => hasAnyRecordBotTarget(record), [record]);
  const buttonSize = compact ? 'small' : 'middle';

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
              onClick={(event) => {
                stopEvent(event);
                openExternalLink(`tel:${normalizedPhone || primaryPhone}`);
              }}
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
