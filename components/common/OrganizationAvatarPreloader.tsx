import React, { useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { fetchSessionBootstrap } from '../../utils/sessionCache';

const OrganizationAvatarPreloader: React.FC = () => {
  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;
    let idleId: number | null = null;
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const preload = async () => {
      try {
        const session = await fetchSessionBootstrap(supabase);
        if (cancelled) return;
        const orgId = String(session.orgId || '').trim();
        if (!orgId) return;
        const { preloadOrganizationAvatarDirectory } = await import('../../utils/profileAvatar');
        if (cancelled) return;
        await preloadOrganizationAvatarDirectory(supabase, orgId);
      } catch (error) {
        if (!cancelled) {
          console.warn('Could not preload organization avatars', error);
        }
      }
    };

    if (typeof idleWindow.requestIdleCallback === 'function') {
      idleId = idleWindow.requestIdleCallback(() => {
        void preload();
      }, { timeout: 2500 });
    } else {
      timeoutId = globalThis.setTimeout(() => {
        void preload();
      }, 800) as unknown as number;
    }

    return () => {
      cancelled = true;
      if (idleId !== null && typeof idleWindow.cancelIdleCallback === 'function') {
        idleWindow.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, []);

  return null;
};

export default OrganizationAvatarPreloader;
