import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { ViewMode } from '../types';

export const MODULE_LIST_INVALIDATION_EVENT = 'module_list_invalidation';
export const MODULE_LIST_LOCAL_INVALIDATION_EVENT = 'kalam:module-list-local-invalidation';
export const MODULE_LIST_LIVE_INVALIDATION_STORAGE_KEY = 'kalam:module-list-live-invalidation';
export const MODULE_LIST_LIVE_MARKER_STORAGE_PREFIX = 'kalam:module-list-live-marker';
export const MODULE_LIST_LIVE_DEFAULT_MODULES = new Set([
  'customers',
  'products',
  'tasks',
  'invoices',
  'process_runs',
  'process_templates',
  'voip_call_reports',
]);
export const MODULE_LIST_LIVE_SUPPORTED_VIEWS = new Set<ViewMode>([
  ViewMode.LIST,
  ViewMode.GRID,
  ViewMode.KANBAN,
]);

export type ModuleListLiveInvalidationPayload = {
  org_id?: string | null;
  module_id?: string | null;
  record_id?: string | null;
  action?: 'insert' | 'update' | 'delete' | string | null;
  updated_at?: string | null;
  scope_hint?: {
    assignee_user_id?: string | null;
    assignee_role_id?: string | null;
  } | null;
};

export type ModuleListLocalInvalidationMarker = ModuleListLiveInvalidationPayload & {
  received_at: string;
  sequence: number;
};

const normalizeText = (value?: string | null) => String(value || '').trim();

const safeParseMarker = (value?: string | null): ModuleListLocalInvalidationMarker | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    const moduleId = normalizeText(parsed.module_id);
    if (!moduleId) return null;
    return {
      ...(parsed as ModuleListLiveInvalidationPayload),
      module_id: moduleId,
      org_id: normalizeText(parsed.org_id) || null,
      received_at: normalizeText(parsed.received_at) || new Date().toISOString(),
      sequence: Number(parsed.sequence || 0) || 0,
    };
  } catch {
    return null;
  }
};

const getMarkerStamp = (marker?: ModuleListLocalInvalidationMarker | null) => {
  if (!marker) return 0;
  const sequence = Number(marker.sequence || 0);
  if (Number.isFinite(sequence) && sequence > 0) return sequence;
  const updatedAt = Date.parse(String(marker.updated_at || marker.received_at || ''));
  return Number.isFinite(updatedAt) ? updatedAt : 0;
};

const buildModuleListMarkerKey = (orgId?: string | null, moduleId?: string | null) => {
  const normalizedModuleId = normalizeText(moduleId);
  if (!normalizedModuleId) return null;
  const normalizedOrgId = normalizeText(orgId) || '*';
  return `${MODULE_LIST_LIVE_MARKER_STORAGE_PREFIX}:${normalizedOrgId}:${normalizedModuleId}`;
};

const isMarkerForList = (
  marker: ModuleListLiveInvalidationPayload | null | undefined,
  orgId?: string | null,
  moduleId?: string | null,
) => {
  const normalizedModuleId = normalizeText(moduleId);
  if (!marker || !normalizedModuleId || normalizeText(marker.module_id) !== normalizedModuleId) return false;
  const markerOrgId = normalizeText(marker.org_id);
  const normalizedOrgId = normalizeText(orgId);
  return !markerOrgId || markerOrgId === '*' || !normalizedOrgId || markerOrgId === normalizedOrgId;
};

export const markModuleListChanged = (payload: ModuleListLiveInvalidationPayload) => {
  if (typeof window === 'undefined') return;
  const moduleId = normalizeText(payload?.module_id);
  if (!moduleId) return;
  const orgId = normalizeText(payload?.org_id);
  const now = new Date();
  const marker: ModuleListLocalInvalidationMarker = {
    ...payload,
    org_id: orgId || null,
    module_id: moduleId,
    action: payload?.action || 'update',
    updated_at: payload?.updated_at || now.toISOString(),
    received_at: now.toISOString(),
    sequence: now.getTime(),
  };
  const keys = [
    buildModuleListMarkerKey(orgId || null, moduleId),
    orgId ? null : buildModuleListMarkerKey('*', moduleId),
  ].filter(Boolean) as string[];
  try {
    const serialized = JSON.stringify(marker);
    keys.forEach((key) => window.localStorage.setItem(key, serialized));
  } catch {
    // localStorage can be unavailable in private contexts; the same-tab event is still enough.
  }
  window.dispatchEvent(new CustomEvent(MODULE_LIST_LOCAL_INVALIDATION_EVENT, { detail: marker }));
};

export const readModuleListInvalidationMarker = ({
  orgId,
  moduleId,
}: {
  orgId?: string | null;
  moduleId?: string | null;
}) => {
  if (typeof window === 'undefined') return null;
  const keys = [
    buildModuleListMarkerKey(orgId || null, moduleId),
    buildModuleListMarkerKey('*', moduleId),
  ].filter(Boolean) as string[];
  let latest: ModuleListLocalInvalidationMarker | null = null;
  keys.forEach((key) => {
    const marker = safeParseMarker(window.localStorage.getItem(key));
    if (!isMarkerForList(marker, orgId, moduleId)) return;
    if (!latest || getMarkerStamp(marker) > getMarkerStamp(latest)) {
      latest = marker;
    }
  });
  return latest;
};

export const subscribeToLocalModuleListInvalidation = ({
  orgId,
  moduleId,
  onInvalidate,
}: {
  orgId?: string | null;
  moduleId?: string | null;
  onInvalidate?: (payload: ModuleListLocalInvalidationMarker) => void;
}) => {
  if (typeof window === 'undefined') return () => {};

  const handleCustomEvent = (event: Event) => {
    const marker = safeParseMarker(JSON.stringify((event as CustomEvent).detail || null));
    if (!isMarkerForList(marker, orgId, moduleId) || !marker) return;
    onInvalidate?.(marker);
  };
  const handleStorage = (event: StorageEvent) => {
    if (!event.key || !event.key.startsWith(`${MODULE_LIST_LIVE_MARKER_STORAGE_PREFIX}:`)) return;
    const marker = safeParseMarker(event.newValue);
    if (!isMarkerForList(marker, orgId, moduleId) || !marker) return;
    onInvalidate?.(marker);
  };

  window.addEventListener(MODULE_LIST_LOCAL_INVALIDATION_EVENT, handleCustomEvent as EventListener);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(MODULE_LIST_LOCAL_INVALIDATION_EVENT, handleCustomEvent as EventListener);
    window.removeEventListener('storage', handleStorage);
  };
};

export const buildModuleListOrgTopic = (orgId?: string | null) => {
  const normalizedOrgId = String(orgId || '').trim();
  if (!normalizedOrgId) return null;
  return `org:${normalizedOrgId}:module-list`;
};

export const buildModuleListModuleTopic = (orgId?: string | null, moduleId?: string | null) => {
  const normalizedOrgId = String(orgId || '').trim();
  const normalizedModuleId = String(moduleId || '').trim();
  if (!normalizedOrgId || !normalizedModuleId) return null;
  return `org:${normalizedOrgId}:module:${normalizedModuleId}:list`;
};

export const isModuleListLiveInvalidationEnabled = (moduleId?: string | null) => {
  const normalizedModuleId = String(moduleId || '').trim();
  if (import.meta.env.VITE_ENABLE_MODULE_LIST_LIVE_INVALIDATION === 'false') {
    return false;
  }
  if (import.meta.env.VITE_ENABLE_MODULE_LIST_LIVE_INVALIDATION === 'true') {
    return true;
  }
  if (import.meta.env.DEV && normalizedModuleId && MODULE_LIST_LIVE_DEFAULT_MODULES.has(normalizedModuleId)) {
    return true;
  }
  if (typeof window === 'undefined') {
    return false;
  }
  if (window.localStorage.getItem(MODULE_LIST_LIVE_INVALIDATION_STORAGE_KEY) === 'false') {
    return false;
  }
  return true;
};

export const isModuleListLiveInvalidationSupportedView = (viewMode?: ViewMode | null) => {
  if (!viewMode) return false;
  return MODULE_LIST_LIVE_SUPPORTED_VIEWS.has(viewMode);
};

type SubscribeParams = {
  supabaseClient: SupabaseClient<any, any, any>;
  orgId?: string | null;
  moduleId?: string | null;
  onInvalidate?: (payload: ModuleListLiveInvalidationPayload) => void;
  onStatusChange?: (status: string) => void;
};

export const subscribeToModuleListLiveInvalidation = ({
  supabaseClient,
  orgId,
  moduleId,
  onInvalidate,
  onStatusChange,
}: SubscribeParams) => {
  const topic = buildModuleListModuleTopic(orgId, moduleId);
  if (!topic) {
    return () => {};
  }

  let closed = false;
  const channel: RealtimeChannel = supabaseClient
    .channel(topic, { config: { private: true } } as any)
    .on('broadcast', { event: MODULE_LIST_INVALIDATION_EVENT }, (message: any) => {
      const payload = (message?.payload || {}) as ModuleListLiveInvalidationPayload;
      onInvalidate?.(payload);
    });

  channel.subscribe((status) => {
    onStatusChange?.(status);
    if (closed) return;
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      closed = true;
      void supabaseClient.removeChannel(channel);
    }
  });

  return () => {
    if (closed) return;
    closed = true;
    void supabaseClient.removeChannel(channel);
  };
};
