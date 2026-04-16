import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { ViewMode } from '../types';

export const MODULE_LIST_INVALIDATION_EVENT = 'module_list_invalidation';
export const MODULE_LIST_LIVE_INVALIDATION_STORAGE_KEY = 'kalam:module-list-live-invalidation';
export const MODULE_LIST_LIVE_DEFAULT_MODULES = new Set([
  'customers',
  'products',
  'tasks',
  'invoices',
  'process_runs',
  'process_templates',
]);
export const MODULE_LIST_LIVE_SUPPORTED_VIEWS = new Set<ViewMode>([
  ViewMode.LIST,
  ViewMode.GRID,
  ViewMode.KANBAN,
]);

export type ModuleListLiveInvalidationPayload = {
  module_id?: string | null;
  record_id?: string | null;
  action?: 'insert' | 'update' | 'delete' | string | null;
  updated_at?: string | null;
  scope_hint?: {
    assignee_user_id?: string | null;
    assignee_role_id?: string | null;
  } | null;
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
  if (import.meta.env.VITE_ENABLE_MODULE_LIST_LIVE_INVALIDATION === 'true') {
    return true;
  }
  if (import.meta.env.DEV && normalizedModuleId && MODULE_LIST_LIVE_DEFAULT_MODULES.has(normalizedModuleId)) {
    return true;
  }
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem(MODULE_LIST_LIVE_INVALIDATION_STORAGE_KEY) === 'true';
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
