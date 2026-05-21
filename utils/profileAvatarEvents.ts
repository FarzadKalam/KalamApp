import { clearSessionBootstrapCache } from './sessionCache';

export const PROFILE_AVATAR_UPDATED_EVENT = 'erp:profile-avatar-updated';

export type ProfileAvatarUpdatedDetail = {
  profileId: string;
  avatarUrl: string | null;
  fullName?: string | null;
};

export const emitProfileAvatarUpdated = (detail: ProfileAvatarUpdatedDetail) => {
  clearSessionBootstrapCache();
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PROFILE_AVATAR_UPDATED_EVENT, { detail }));
};
