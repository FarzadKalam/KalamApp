import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { fetchSessionBootstrap } from '../utils/sessionCache';
import { getOrgSaasStatus } from '../utils/orgSaasStatus';
import {
  type ActiveUserAnnouncement,
  type AnnouncementDismissIdentity,
  type AnnouncementSurface,
  dismissAnnouncementLocally,
  dismissActiveUserAnnouncement,
  dismissGuestAnnouncement,
  filterAnnouncementsByLocalDismissals,
  loadActiveUserAnnouncements,
} from '../utils/userAnnouncements';

const normalizePath = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
};

type UseUserAnnouncementsParams = {
  surface: AnnouncementSurface;
  path?: string | null;
  host?: string | null;
};

export const useUserAnnouncements = ({ surface, path, host }: UseUserAnnouncementsParams) => {
  const normalizedPath = useMemo(() => normalizePath(path), [path]);
  const normalizedHost = useMemo(
    () => String(host || (typeof window !== 'undefined' ? window.location.host : '')).trim().toLowerCase(),
    [host],
  );
  const [loading, setLoading] = useState(false);
  const [announcements, setAnnouncements] = useState<ActiveUserAnnouncement[]>([]);
  const viewerIdentityRef = useRef<AnnouncementDismissIdentity>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const bootstrap = await fetchSessionBootstrap(supabase);
      const userId = String(bootstrap.user?.id || '').trim() || null;
      const orgId = String(bootstrap.orgId || '').trim() || null;
      const roleId = String(bootstrap.roleId || '').trim() || null;
      const dismissIdentity = { userId, orgId };
      viewerIdentityRef.current = dismissIdentity;
      let isDemoUser = false;

      if (orgId) {
        try {
          const status = await getOrgSaasStatus();
          isDemoUser = Boolean(status?.is_demo);
        } catch {
          isDemoUser = false;
        }
      }

      const rows = await loadActiveUserAnnouncements({
        surface,
        path: normalizedPath,
        host: normalizedHost,
        org_id: orgId,
        role_id: roleId,
        user_id: userId,
        is_demo_user: isDemoUser,
        is_authenticated: Boolean(userId),
      });

      setAnnouncements(filterAnnouncementsByLocalDismissals(surface, rows, dismissIdentity));
    } catch {
      setAnnouncements([]);
    } finally {
      setLoading(false);
    }
  }, [normalizedHost, normalizedPath, surface]);

  useEffect(() => {
    void load();
  }, [load]);

  const dismissAnnouncement = useCallback((announcement: ActiveUserAnnouncement) => {
    if (!announcement?.id) return;
    setAnnouncements((prev) => prev.filter((item) => item.id !== announcement.id));

    if (!announcement.allow_dismiss) return;
    dismissAnnouncementLocally(surface, announcement.id, viewerIdentityRef.current);

    void (async () => {
      try {
        let resolvedUserId = String(viewerIdentityRef.current.userId || '').trim();

        if (!resolvedUserId) {
          const { data: sessionData } = await supabase.auth.getSession();
          resolvedUserId = String(sessionData?.session?.user?.id || '').trim();
        }

        if (!resolvedUserId) {
          const { data: userData } = await supabase.auth.getUser();
          resolvedUserId = String(userData?.user?.id || '').trim();
        }

        if (resolvedUserId) {
          try {
            await dismissActiveUserAnnouncement(announcement.id, surface);
          } catch {
            // keep UI responsive even if persist fails
          }
        } else {
          dismissGuestAnnouncement(surface, announcement.id);
        }
      } catch {
        // keep UI responsive even if session check fails
      }
    })();
  }, [surface]);

  return {
    loading,
    announcements,
    headerAnnouncements: announcements.filter((row) => row.kind === 'header'),
    popupAnnouncements: announcements.filter((row) => row.kind === 'popup'),
    dismissAnnouncement,
    reloadAnnouncements: load,
  };
};

export default useUserAnnouncements;
