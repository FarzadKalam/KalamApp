import React, { useState } from 'react';
import { App, Button, Tooltip } from 'antd';
import { LockOutlined, UnlockOutlined } from '@ant-design/icons';
import {
  lockRecord,
  unlockRecord,
  type RecordLockState,
} from '../../utils/recordLockRuntime';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

type RecordLockControlProps = {
  moduleId: string;
  recordId?: string | null;
  lockState?: RecordLockState | null;
  canLock?: boolean;
  canUnlock?: boolean;
  showUnlocked?: boolean;
  showLockedLabel?: boolean;
  size?: 'small' | 'middle' | 'large';
  className?: string;
  onChanged?: (lockState: RecordLockState) => void | Promise<void>;
};

const RecordLockControl: React.FC<RecordLockControlProps> = ({
  moduleId,
  recordId,
  lockState,
  canLock = false,
  canUnlock = false,
  showUnlocked = false,
  showLockedLabel = false,
  size = 'small',
  className = '',
  onChanged,
}) => {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const isLocked = Boolean(lockState?.isLocked);
  const normalizedRecordId = String(recordId || '').trim();
  const visible = isLocked || showUnlocked || canLock;
  if (!visible || !normalizedRecordId) return null;

  const canToggle = isLocked ? canUnlock : canLock;
  const title = isLocked
    ? (canUnlock ? 'باز کردن رکورد' : 'قفل شده')
    : (canLock ? 'قفل کردن رکورد' : 'قفل باز');

  const handleClick = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!canToggle || saving) return;
    setSaving(true);
    try {
      if (isLocked) {
        await unlockRecord(moduleId, normalizedRecordId);
        const next = { isLocked: false, moduleId, recordId: normalizedRecordId };
        await onChanged?.(next);
        message.success('رکورد باز شد');
      } else {
        const next = await lockRecord({ moduleId, recordId: normalizedRecordId, sourceType: 'manual' });
        await onChanged?.(next);
        message.success('رکورد قفل شد');
      }
    } catch (error) {
      message.error(toFaErrorMessage(error as any, isLocked ? 'باز کردن رکورد ناموفق بود' : 'قفل کردن رکورد ناموفق بود'));
    } finally {
      setSaving(false);
    }
  };

  const content = (
    <Button
      type="text"
      size={size}
      loading={saving}
      disabled={!canToggle}
      icon={isLocked ? <LockOutlined /> : <UnlockOutlined />}
      onClick={handleClick}
      className={`inline-flex items-center gap-1 ${className}`}
      style={{
        color: isLocked ? '#dc2626' : '#64748b',
        fontWeight: isLocked ? 700 : 500,
        paddingInline: showLockedLabel && isLocked ? 8 : undefined,
      }}
      aria-label={title}
    >
      {isLocked && showLockedLabel ? 'قفل شده' : null}
    </Button>
  );

  return <Tooltip title={title}>{content}</Tooltip>;
};

export default RecordLockControl;
