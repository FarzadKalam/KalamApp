import { supabase } from '../supabaseClient';
import { getAppRuntimeCached } from './appRuntimeCache';

export type AnnouncementSurface = 'public_site' | 'user_panel' | 'login_page';

export type AnnouncementCondition = {
  id?: string;
  field?: string;
  operator?: string;
  value?: any;
};

export type AnnouncementMediaItem = {
  media_type?: 'image' | 'video' | string;
  attachment?: string | null;
  video_url?: string | null;
  caption?: string | null;
  sort_order?: number | null;
};

export type ActiveUserAnnouncement = {
  id: string;
  kind: 'popup' | 'header';
  title: string;
  body: string;
  media_items: AnnouncementMediaItem[];
  allow_dismiss: boolean;
  priority: number;
  conditions_all: AnnouncementCondition[];
  conditions_any: AnnouncementCondition[];
  starts_at?: string | null;
  ends_at?: string | null;
};

export type AnnouncementRuntimeContext = {
  surface: AnnouncementSurface;
  path: string;
  host: string;
  org_id?: string | null;
  user_id?: string | null;
  role_id?: string | null;
  is_demo_user?: boolean;
  is_authenticated?: boolean;
};

export type AnnouncementDismissIdentity = {
  userId?: string | null;
  orgId?: string | null;
};

const normalizeText = (value: unknown) => String(value ?? '').trim();
const normalizeIdentityPart = (value: unknown, fallback: string) => normalizeText(value) || fallback;

const isMissingAnnouncementRpcError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return (
    Number(error?.status) === 404
    || code === 'PGRST202'
    || code === 'PGRST205'
    || code === '42883'
    || message.includes('could not find the function')
    || message.includes('function public.get_active_user_announcements')
    || message.includes('function public.dismiss_user_announcement')
  );
};

const announcementRpcAvailability = {
  loadUnavailable: false,
  dismissUnavailable: false,
};

const normalizeBool = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return false;
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

const normalizeArray = (value: unknown) => {
  if (Array.isArray(value)) return value;
  const text = normalizeText(value);
  if (!text) return [];
  return text.split(',').map((item) => item.trim()).filter(Boolean);
};

type ComparableValue = string | ComparableValue[];

const toComparable = (value: unknown): ComparableValue => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).toLowerCase();
  if (Array.isArray(value)) return value.map((item) => toComparable(item));
  return String(value).trim().toLowerCase();
};

const conditionNeedsValue = (operator: string) => ![
  'is_true',
  'is_false',
  'is_null',
  'not_null',
].includes(operator);

const evaluateCondition = (condition: AnnouncementCondition, runtime: AnnouncementRuntimeContext) => {
  const fieldKey = normalizeText(condition?.field);
  const operator = normalizeText(condition?.operator || 'eq').toLowerCase();
  if (!fieldKey) return true;

  const rawCurrentValue = (runtime as Record<string, any>)[fieldKey];
  const currentValue = toComparable(rawCurrentValue);
  const expectedValue = condition?.value;

  if (conditionNeedsValue(operator) && (expectedValue === undefined || expectedValue === null || normalizeText(expectedValue) === '')) {
    return true;
  }

  switch (operator) {
    case 'eq':
      return toComparable(expectedValue) === currentValue;
    case 'neq':
      return toComparable(expectedValue) !== currentValue;
    case 'contains':
      return String(currentValue).includes(String(toComparable(expectedValue)));
    case 'not_contains':
      return !String(currentValue).includes(String(toComparable(expectedValue)));
    case 'starts_with':
      return String(currentValue).startsWith(String(toComparable(expectedValue)));
    case 'ends_with':
      return String(currentValue).endsWith(String(toComparable(expectedValue)));
    case 'in': {
      const expected = normalizeArray(expectedValue).map((item) => toComparable(item));
      if (Array.isArray(currentValue)) {
        const asSet = new Set(expected);
        return currentValue.some((item) => asSet.has(item));
      }
      return expected.includes(currentValue);
    }
    case 'not_in': {
      const expected = normalizeArray(expectedValue).map((item) => toComparable(item));
      if (Array.isArray(currentValue)) {
        const asSet = new Set(expected);
        return currentValue.every((item) => !asSet.has(item));
      }
      return !expected.includes(currentValue);
    }
    case 'is_true':
      return normalizeBool(rawCurrentValue);
    case 'is_false':
      return !normalizeBool(rawCurrentValue);
    case 'is_null':
      return rawCurrentValue === null || rawCurrentValue === undefined || normalizeText(rawCurrentValue) === '';
    case 'not_null':
      return !(rawCurrentValue === null || rawCurrentValue === undefined || normalizeText(rawCurrentValue) === '');
    default:
      return true;
  }
};

export const evaluateAnnouncementConditions = (
  row: Pick<ActiveUserAnnouncement, 'conditions_all' | 'conditions_any'>,
  runtime: AnnouncementRuntimeContext,
) => {
  const all = Array.isArray(row?.conditions_all) ? row.conditions_all : [];
  const any = Array.isArray(row?.conditions_any) ? row.conditions_any : [];

  const allPassed = all.length === 0 || all.every((condition) => evaluateCondition(condition, runtime));
  const anyPassed = any.length === 0 || any.some((condition) => evaluateCondition(condition, runtime));

  return allPassed && anyPassed;
};

const normalizeMediaItems = (raw: unknown): AnnouncementMediaItem[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = item || {};
      return {
        media_type: normalizeText((row as any).media_type || 'image').toLowerCase(),
        attachment: normalizeText((row as any).attachment) || null,
        video_url: normalizeText((row as any).video_url) || null,
        caption: normalizeText((row as any).caption) || null,
        sort_order: Number((row as any).sort_order || 0),
      };
    })
    .filter((item) => item.attachment || item.video_url)
    .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0));
};

export const normalizeAnnouncementRow = (row: any): ActiveUserAnnouncement => ({
  id: String(row?.id || ''),
  kind: String(row?.kind || 'header').trim() === 'popup' ? 'popup' : 'header',
  title: String(row?.title || '').trim(),
  body: String(row?.body || '').trim(),
  media_items: normalizeMediaItems(row?.media_items),
  allow_dismiss: Boolean(row?.allow_dismiss),
  priority: Number(row?.priority || 100),
  conditions_all: Array.isArray(row?.conditions_all) ? row.conditions_all : [],
  conditions_any: Array.isArray(row?.conditions_any) ? row.conditions_any : [],
  starts_at: row?.starts_at || null,
  ends_at: row?.ends_at || null,
});

export const loadActiveUserAnnouncements = async (
  runtime: AnnouncementRuntimeContext,
): Promise<ActiveUserAnnouncement[]> => {
  if (announcementRpcAvailability.loadUnavailable) {
    return [];
  }

  const cacheKey = [
    'active-user-announcements',
    runtime.surface,
    normalizeText(runtime.path || '/'),
    normalizeText(runtime.host || ''),
    normalizeText(runtime.org_id || 'guest-org'),
    normalizeText(runtime.user_id || 'guest-user'),
    normalizeText(runtime.role_id || 'guest-role'),
    runtime.is_demo_user ? 'demo' : 'normal',
    runtime.is_authenticated ? 'auth' : 'guest',
  ].join(':');

  return getAppRuntimeCached({
    key: cacheKey,
    ttlMs: 60_000,
    loader: async () => {
      const { data, error } = await supabase.rpc('get_active_user_announcements', {
        p_surface: runtime.surface,
        p_path: runtime.path || null,
        p_host: runtime.host || null,
      });

      if (error) {
        if (isMissingAnnouncementRpcError(error)) {
          announcementRpcAvailability.loadUnavailable = true;
          return [];
        }
        throw error;
      }

      const rows = Array.isArray(data) ? data.map(normalizeAnnouncementRow).filter((row) => row.id) : [];
      return rows.filter((row) => evaluateAnnouncementConditions(row, runtime));
    },
  });
};

const getGuestDismissStorageKey = (surface: AnnouncementSurface, announcementId: string) =>
  `kalam.user_announcement.dismissed.${surface}.${announcementId}`;

const getAnnouncementDismissStorageKey = (
  surface: AnnouncementSurface,
  announcementId: string,
  identity?: AnnouncementDismissIdentity,
) => {
  const normalizedAnnouncementId = normalizeText(announcementId);
  const normalizedUserId = normalizeIdentityPart(identity?.userId, 'guest');
  const normalizedOrgId = normalizeIdentityPart(identity?.orgId, 'guest-org');
  return `kalam.user_announcement.dismissed.v2.${surface}.${normalizedOrgId}.${normalizedUserId}.${normalizedAnnouncementId}`;
};

export const isAnnouncementDismissedLocally = (
  surface: AnnouncementSurface,
  announcementId: string,
  identity?: AnnouncementDismissIdentity,
) => {
  if (typeof window === 'undefined') return false;
  const normalizedAnnouncementId = normalizeText(announcementId);
  if (!normalizedAnnouncementId) return false;

  const scopedKey = getAnnouncementDismissStorageKey(surface, normalizedAnnouncementId, identity);
  if (window.localStorage.getItem(scopedKey) === '1') {
    return true;
  }

  if (!normalizeText(identity?.userId)) {
    return window.localStorage.getItem(getGuestDismissStorageKey(surface, normalizedAnnouncementId)) === '1';
  }

  return false;
};

export const dismissAnnouncementLocally = (
  surface: AnnouncementSurface,
  announcementId: string,
  identity?: AnnouncementDismissIdentity,
) => {
  if (typeof window === 'undefined') return;
  const normalizedAnnouncementId = normalizeText(announcementId);
  if (!normalizedAnnouncementId) return;

  window.localStorage.setItem(
    getAnnouncementDismissStorageKey(surface, normalizedAnnouncementId, identity),
    '1',
  );

  if (!normalizeText(identity?.userId)) {
    window.localStorage.setItem(getGuestDismissStorageKey(surface, normalizedAnnouncementId), '1');
  }
};

export const filterAnnouncementsByLocalDismissals = (
  surface: AnnouncementSurface,
  rows: ActiveUserAnnouncement[],
  identity?: AnnouncementDismissIdentity,
) => rows.filter((row) => !isAnnouncementDismissedLocally(surface, row.id, identity));

export const isGuestAnnouncementDismissed = (surface: AnnouncementSurface, announcementId: string) => {
  return isAnnouncementDismissedLocally(surface, announcementId);
};

export const dismissGuestAnnouncement = (surface: AnnouncementSurface, announcementId: string) => {
  dismissAnnouncementLocally(surface, announcementId);
};

export const dismissActiveUserAnnouncement = async (
  announcementId: string,
  surface: AnnouncementSurface,
) => {
  const normalizedId = normalizeText(announcementId);
  if (!normalizedId) return false;
  if (announcementRpcAvailability.dismissUnavailable) return false;

  const { data, error } = await supabase.rpc('dismiss_user_announcement', {
    p_announcement_id: normalizedId,
    p_surface: surface,
  });

  if (error) {
    if (isMissingAnnouncementRpcError(error)) {
      announcementRpcAvailability.dismissUnavailable = true;
      return false;
    }
    throw error;
  }
  return Boolean(data);
};
