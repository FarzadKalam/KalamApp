import React, { useEffect, useMemo, useState } from 'react';
import { Avatar } from 'antd';
import type { AvatarProps } from 'antd';
import ResilientImage from './ResilientImage';
import {
  getAvatarFallbackText,
  preloadAvatarUrls,
  resolveAvatarUrl,
} from '../../utils/profileAvatar';
import type { ImagePreviewPreset } from '../../utils/imagePreview';

type ProfileAvatarProps = Omit<AvatarProps, 'src' | 'children' | 'icon'> & {
  src?: string | null;
  name?: string | null;
  fallback?: React.ReactNode;
  icon?: React.ReactNode;
  preset?: ImagePreviewPreset;
  alt?: string;
  imgClassName?: string;
  imageLoading?: 'eager' | 'lazy';
  imageDecoding?: 'async' | 'sync' | 'auto';
  preload?: boolean;
};

const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  src,
  name,
  fallback,
  icon,
  preset = 'avatar',
  alt,
  imgClassName = 'h-full w-full object-cover',
  imageLoading = 'lazy',
  imageDecoding = 'async',
  preload = false,
  ...avatarProps
}) => {
  const normalizedSrc = useMemo(() => resolveAvatarUrl(src), [src]);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [normalizedSrc]);

  useEffect(() => {
    if (!preload || !normalizedSrc) return;
    preloadAvatarUrls([normalizedSrc], preset);
  }, [normalizedSrc, preset, preload]);

  const resolvedFallback = useMemo(() => {
    if (fallback !== undefined && fallback !== null) return fallback;
    if (icon !== undefined && icon !== null) return icon;
    return getAvatarFallbackText(name);
  }, [fallback, icon, name]);

  const shouldRenderImage = Boolean(normalizedSrc) && !imageFailed;

  return (
    <Avatar
      {...avatarProps}
      src={shouldRenderImage ? (
        <ResilientImage
          src={normalizedSrc}
          preset={preset}
          alt={alt || String(name || 'avatar')}
          className={imgClassName}
          loading={imageLoading}
          decoding={imageDecoding}
          onError={() => setImageFailed(true)}
        />
      ) : undefined}
    >
      {!shouldRenderImage ? resolvedFallback : null}
    </Avatar>
  );
};

export default ProfileAvatar;
