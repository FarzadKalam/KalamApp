import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    rpc: (...args: any[]) => rpcMock(...args),
  },
}));

import {
  dismissAnnouncementLocally,
  filterAnnouncementsByLocalDismissals,
  isAnnouncementDismissedLocally,
  loadActiveUserAnnouncements,
  type ActiveUserAnnouncement,
} from './userAnnouncements';

const announcement = (id: string): ActiveUserAnnouncement => ({
  id,
  kind: 'header',
  title: `اعلان ${id}`,
  body: 'متن تست',
  media_items: [],
  allow_dismiss: true,
  priority: 100,
  conditions_all: [],
  conditions_any: [],
  starts_at: null,
  ends_at: null,
});

describe('user announcements local dismiss cache', () => {
  beforeEach(() => {
    window.localStorage.clear();
    rpcMock.mockReset();
  });

  it('stores authenticated dismissals with org/user scope', () => {
    dismissAnnouncementLocally('user_panel', 'ann-1', { userId: 'user-1', orgId: 'org-1' });

    expect(isAnnouncementDismissedLocally('user_panel', 'ann-1', { userId: 'user-1', orgId: 'org-1' })).toBe(true);
    expect(isAnnouncementDismissedLocally('user_panel', 'ann-1', { userId: 'user-1', orgId: 'org-2' })).toBe(false);
    expect(isAnnouncementDismissedLocally('user_panel', 'ann-1', { userId: 'user-2', orgId: 'org-1' })).toBe(false);
  });

  it('keeps legacy guest dismiss keys working', () => {
    window.localStorage.setItem('kalam.user_announcement.dismissed.login_page.ann-legacy', '1');

    expect(isAnnouncementDismissedLocally('login_page', 'ann-legacy')).toBe(true);
  });

  it('filters only rows dismissed for the same scoped identity', () => {
    dismissAnnouncementLocally('user_panel', 'ann-2', { userId: 'user-1', orgId: 'org-1' });

    const visible = filterAnnouncementsByLocalDismissals(
      'user_panel',
      [announcement('ann-1'), announcement('ann-2'), announcement('ann-3')],
      { userId: 'user-1', orgId: 'org-1' },
    );

    expect(visible.map((item) => item.id)).toEqual(['ann-1', 'ann-3']);
  });

  it('stops retrying announcement load rpc after a missing-function 404 in the same session', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { status: 404, code: 'PGRST205', message: 'Could not find the function public.get_active_user_announcements' },
    });

    const runtime = {
      surface: 'user_panel' as const,
      path: '/',
      host: 'app.tazesystem.ir',
      user_id: 'user-1',
      org_id: 'org-1',
      role_id: 'role-1',
      is_authenticated: true,
      is_demo_user: false,
    };

    await expect(loadActiveUserAnnouncements(runtime)).resolves.toEqual([]);
    await expect(loadActiveUserAnnouncements(runtime)).resolves.toEqual([]);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});
