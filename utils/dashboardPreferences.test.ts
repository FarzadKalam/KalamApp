import { beforeEach, describe, expect, it } from 'vitest';
import { readDashboardPreferences, updateDashboardPreferences } from './dashboardPreferences';

beforeEach(() => {
  localStorage.clear();
  window.dispatchEvent(new StorageEvent('storage', { key: null }));
});

describe('dashboard preferences isolation', () => {
  it('keeps each organization and user independent', () => {
    updateDashboardPreferences('org-a', 'user-a', { moduleIds: ['tasks'], hiddenWidgets: ['reports_slider'] });
    updateDashboardPreferences('org-b', 'user-a', { moduleIds: ['customers'] });
    expect(readDashboardPreferences('org-a', 'user-a').moduleIds).toEqual(['tasks']);
    expect(readDashboardPreferences('org-b', 'user-a').moduleIds).toEqual(['customers']);
    expect(readDashboardPreferences('org-a', 'user-b').hiddenWidgets).toEqual([]);
    updateDashboardPreferences(null, 'user-a', { hiddenWidgets: ['communications'] });
    expect(readDashboardPreferences(null, 'user-a').hiddenWidgets).toEqual([]);
  });

  it('recovers from damaged storage and validates selections from another tab', () => {
    localStorage.setItem('kalam:dashboard:v1:org:user', '{broken');
    expect(readDashboardPreferences('org', 'user').hiddenWidgets).toEqual([]);
    localStorage.setItem('kalam:dashboard:v1:org:user', JSON.stringify({ moduleIds: ['tasks', 'tasks', 4, 'customers'], hiddenWidgets: ['reports_slider'] }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'kalam:dashboard:v1:org:user' }));
    expect(readDashboardPreferences('org', 'user').moduleIds).toEqual(['tasks', 'customers']);
    expect(readDashboardPreferences('org', 'user').hiddenWidgets).toEqual(['reports_slider']);
  });
});
