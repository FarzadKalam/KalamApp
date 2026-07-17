import React, { memo, useMemo } from 'react';
import { TeamOutlined, UserOutlined } from '@ant-design/icons';
import type { AvatarProps } from 'antd';
import ProfileAvatar from './ProfileAvatar';
import type { IdentityOption } from '../../utils/identityDirectory';
import { renderRoleIcon } from '../../utils/roleIconCatalog';

const ROLE_AVATAR_PALETTE = [
  ['#dbeafe', '#2563eb'],
  ['#ede9fe', '#7c3aed'],
  ['#dcfce7', '#16a34a'],
  ['#fef3c7', '#d97706'],
  ['#fee2e2', '#dc2626'],
  ['#cffafe', '#0891b2'],
] as const;

const stableColorIndex = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash) + value.charCodeAt(index);
  return Math.abs(hash) % ROLE_AVATAR_PALETTE.length;
};

type IdentityAvatarProps = {
  option: Pick<IdentityOption, 'kind' | 'id' | 'label' | 'avatarUrl' | 'iconKey'>;
  size?: AvatarProps['size'] | number;
  className?: string;
};

const IdentityAvatar: React.FC<IdentityAvatarProps> = ({ option, size = 'small', className }) => {
  const palette = useMemo(() => ROLE_AVATAR_PALETTE[stableColorIndex(String(option.id || option.label || 'role'))], [option.id, option.label]);
  if (option.kind === 'role') {
    return (
      <ProfileAvatar
        size={size}
        icon={renderRoleIcon(option.iconKey)}
        fallback={renderRoleIcon(option.iconKey)}
        name={option.label}
        className={className}
        style={{ backgroundColor: palette[0], color: palette[1] }}
      />
    );
  }
  if (option.kind === 'chat_group') {
    return (
      <ProfileAvatar
        size={size}
        icon={<TeamOutlined />}
        fallback={<TeamOutlined />}
        name={option.label}
        className={className}
        style={{ backgroundColor: '#e0f2fe', color: '#0284c7' }}
      />
    );
  }
  return (
    <ProfileAvatar
      size={size}
      src={option.avatarUrl}
      icon={<UserOutlined />}
      fallback={<UserOutlined />}
      name={option.label}
      className={className}
    />
  );
};

export default memo(IdentityAvatar);
