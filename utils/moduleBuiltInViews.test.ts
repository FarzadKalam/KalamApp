import { describe, expect, it } from 'vitest';
import { WORKFLOW_ASSIGNEE_FIELD_KEY } from './workflowTypes';
import {
  BUILT_IN_VIEW_KEY,
  CURRENT_USER_ASSIGNEE_VALUE,
  SECONDARY_DEFAULT_VIEW_KEY,
  buildSecondaryDefaultView,
  upgradeLegacySecondaryDefaultView,
} from './moduleBuiltInViews';

describe('buildSecondaryDefaultView', () => {
  it('creates a current-user assignee view for modules with assignee support', () => {
    const view = buildSecondaryDefaultView('products', 'کالاها و خدمات');

    expect(view.name).toBe('کالاها و خدمات من');
    expect(view.config.filters).toEqual([
      expect.objectContaining({
        field: WORKFLOW_ASSIGNEE_FIELD_KEY,
        operator: 'eq',
        value: CURRENT_USER_ASSIGNEE_VALUE,
      }),
    ]);
    expect((view.config as any)[BUILT_IN_VIEW_KEY]).toBe(SECONDARY_DEFAULT_VIEW_KEY);
  });

  it('keeps a neutral secondary view for modules without assignee support', () => {
    const view = buildSecondaryDefaultView('unknown_module', 'آزمایشی');

    expect(view.name).toBe('نمای دوم آزمایشی');
    expect(view.config.filters).toEqual([]);
  });

  it('upgrades an unchanged persisted secondary view to the current-user default', () => {
    const defaultView = buildSecondaryDefaultView('products', 'کالاها و خدمات');
    const persistedView = {
      ...defaultView,
      id: 'persisted-view-id',
      name: 'نمای دوم کالاها و خدمات',
      config: {
        ...defaultView.config,
        columns: ['name'],
        filters: [],
      },
    };

    const upgraded = upgradeLegacySecondaryDefaultView(
      persistedView,
      defaultView,
      'کالاها و خدمات'
    );

    expect(upgraded.id).toBe('persisted-view-id');
    expect(upgraded.name).toBe('کالاها و خدمات من');
    expect(upgraded.config.columns).toEqual(['name']);
    expect(upgraded.config.filters).toEqual(defaultView.config.filters);
  });

  it('preserves a customized persisted secondary view', () => {
    const defaultView = buildSecondaryDefaultView('products', 'کالاها و خدمات');
    const persistedView = {
      ...defaultView,
      id: 'persisted-view-id',
      name: 'کالاهای ویژه',
      config: {
        ...defaultView.config,
        filters: [],
      },
    };

    expect(
      upgradeLegacySecondaryDefaultView(persistedView, defaultView, 'کالاها و خدمات')
    ).toBe(persistedView);
  });
});
