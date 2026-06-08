import { SavedView, ViewConfig } from '../types';
import { supportsGlobalAssignee } from './assigneeSupport';
import { WORKFLOW_ASSIGNEE_FIELD_KEY } from './workflowTypes';

export const BUILT_IN_VIEW_KEY = '__built_in_view_key';
export const BUILT_IN_VIEW_IDS = ['default_all', 'default_secondary'] as const;
export const SECONDARY_DEFAULT_VIEW_KEY = BUILT_IN_VIEW_IDS[1];
export const CURRENT_USER_ASSIGNEE_VALUE = '__current_user__';

const buildCurrentUserAssigneeFilter = () => ({
  id: 'default-secondary-current-user',
  field: WORKFLOW_ASSIGNEE_FIELD_KEY,
  operator: 'eq',
  value: CURRENT_USER_ASSIGNEE_VALUE,
});

export const buildSecondaryDefaultView = (
  moduleId: string,
  moduleTitle?: string | null
): SavedView => {
  const hasAssignee = supportsGlobalAssignee(moduleId);
  const normalizedTitle = String(moduleTitle || '').trim();

  return {
    id: SECONDARY_DEFAULT_VIEW_KEY,
    module_id: moduleId,
    name: hasAssignee
      ? (normalizedTitle ? `${normalizedTitle} من` : 'رکوردهای من')
      : (normalizedTitle ? `نمای دوم ${normalizedTitle}` : 'نمای دوم'),
    is_default: false,
    config: {
      columns: [],
      filters: hasAssignee ? [buildCurrentUserAssigneeFilter()] : [],
      [BUILT_IN_VIEW_KEY]: SECONDARY_DEFAULT_VIEW_KEY,
    } as ViewConfig & Record<string, any>,
  };
};

export const upgradeLegacySecondaryDefaultView = (
  persistedView: SavedView,
  defaultView: SavedView,
  moduleTitle?: string | null
): SavedView => {
  const normalizedTitle = String(moduleTitle || '').trim();
  const legacyNames = new Set([
    'نمای دوم',
    normalizedTitle ? `نمای دوم ${normalizedTitle}` : '',
  ].filter(Boolean));
  const persistedFilters = Array.isArray(persistedView.config?.filters)
    ? persistedView.config.filters
    : [];
  const defaultFilters = Array.isArray(defaultView.config?.filters)
    ? defaultView.config.filters
    : [];

  if (
    !legacyNames.has(String(persistedView.name || '').trim())
    || persistedFilters.length > 0
    || defaultFilters.length === 0
  ) {
    return persistedView;
  }

  return {
    ...persistedView,
    name: defaultView.name,
    config: {
      ...persistedView.config,
      filters: defaultFilters,
      [BUILT_IN_VIEW_KEY]: SECONDARY_DEFAULT_VIEW_KEY,
    } as ViewConfig & Record<string, any>,
  };
};
