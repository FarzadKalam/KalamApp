import React, { memo, useMemo } from 'react';
import type { AvatarProps } from 'antd';
import { resolveAssigneePresentation } from '../../utils/assigneePresentation';
import IdentityAvatar from './IdentityAvatar';
import { normalizeRoleIconKey } from '../../utils/roleIconCatalog';

type AssigneeAvatarDisplayProps = {
  source: any;
  allUsers?: any[];
  allRoles?: any[];
  explicitLabel?: string | null;
  avatarSize?: AvatarProps['size'] | number;
  className?: string;
  showLabel?: boolean;
  labelClassName?: string;
  emptyPlaceholder?: React.ReactNode;
  unknownPlaceholder?: React.ReactNode;
  roleAvatarClassName?: string;
};

const AssigneeAvatarDisplayComponent: React.FC<AssigneeAvatarDisplayProps> = ({
  source,
  allUsers = [],
  allRoles = [],
  explicitLabel,
  avatarSize = 'small',
  className,
  showLabel = true,
  labelClassName = 'text-[10px] text-gray-600 dark:text-gray-300 truncate',
  emptyPlaceholder = <span className="text-[10px] text-gray-400">تعیین نشده</span>,
  unknownPlaceholder = <span className="text-[10px] text-gray-400">تعیین نشده</span>,
  roleAvatarClassName = 'bg-blue-100 text-blue-600',
}) => {
  const presentation = useMemo(
    () => resolveAssigneePresentation({ source, allUsers, allRoles, explicitLabel }),
    [allRoles, allUsers, explicitLabel, source]
  );

  if (presentation.kind === 'empty') return <>{emptyPlaceholder}</>;

  const labelNode = showLabel
    ? <span className={labelClassName}>{presentation.label || unknownPlaceholder}</span>
    : null;

  if (presentation.kind === 'role') {
    return (
      <div className={className || 'flex min-h-[24px] items-center gap-1 min-w-0'}>
        <IdentityAvatar
          size={avatarSize}
          className={roleAvatarClassName}
          option={{
            kind: 'role',
            id: presentation.assigneeId || presentation.label || 'role',
            label: presentation.label || 'نقش خارج از دسترس',
            iconKey: normalizeRoleIconKey(presentation.role?.icon_key),
          }}
        />
        {labelNode}
      </div>
    );
  }

  if (presentation.kind === 'user') {
    return (
      <div className={className || 'flex min-h-[24px] items-center gap-1 min-w-0'}>
        <IdentityAvatar
          size={avatarSize}
          option={{
            kind: 'user',
            id: presentation.assigneeId || presentation.label || 'user',
            label: presentation.label || 'کاربر خارج از دسترس',
            avatarUrl: presentation.avatarUrl,
          }}
        />
        {labelNode}
      </div>
    );
  }

  return (
    <div className={className || 'flex min-h-[24px] items-center gap-1 min-w-0'}>
      <IdentityAvatar
        size={avatarSize}
        option={{ kind: 'user', id: presentation.assigneeId || 'unknown', label: presentation.label || 'کاربر خارج از دسترس' }}
      />
      {labelNode}
    </div>
  );
};

const AssigneeAvatarDisplay = memo(AssigneeAvatarDisplayComponent);

export default AssigneeAvatarDisplay;
