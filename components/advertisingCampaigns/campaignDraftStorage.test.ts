import { afterEach, describe, expect, it } from 'vitest';
import {
  buildCampaignDraftStorageKey,
  clearCampaignDraftSnapshot,
  readCampaignDraftSnapshot,
  writeCampaignDraftSnapshot,
} from './campaignDraftStorage';

describe('campaign draft storage', () => {
  afterEach(() => window.localStorage.clear());

  it('keeps drafts strictly scoped to the current organization and user', () => {
    const key = buildCampaignDraftStorageKey('org-a', 'user-a', 'create');
    writeCampaignDraftSnapshot(key, {
      savedAt: 1,
      routeCampaignId: '',
      draft: { campaign: { name: 'پیش‌نویس تست' } as any, tools: [], audienceRules: [] },
    });

    expect(readCampaignDraftSnapshot(key)?.draft.campaign.name).toBe('پیش‌نویس تست');
    expect(readCampaignDraftSnapshot(buildCampaignDraftStorageKey('org-b', 'user-a', 'create'))).toBeNull();
    clearCampaignDraftSnapshot(key);
    expect(readCampaignDraftSnapshot(key)).toBeNull();
  });
});
