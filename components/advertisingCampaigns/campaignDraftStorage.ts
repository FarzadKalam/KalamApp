import type { CampaignWizardDraft } from './types';

const STORAGE_PREFIX = 'kalamapp:campaign-wizard-draft:v1';

export type CampaignDraftSnapshot = {
  savedAt: number;
  routeCampaignId: string;
  /**
   * Only unsaved changes may replace a newer server record on reload. Older
   * snapshots did not carry this flag and are intentionally treated as saved.
   */
  hasUnsavedChanges?: boolean;
  draft: CampaignWizardDraft;
};

export const buildCampaignDraftStorageKey = (orgId: string, userId: string, routeCampaignId: string) => (
  `${STORAGE_PREFIX}:${orgId}:${userId}:${routeCampaignId || 'create'}`
);

export const readCampaignDraftSnapshot = (key: string): CampaignDraftSnapshot | null => {
  if (typeof window === 'undefined' || !key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CampaignDraftSnapshot;
    if (!parsed?.draft || !Number.isFinite(Number(parsed.savedAt))) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const writeCampaignDraftSnapshot = (key: string, snapshot: CampaignDraftSnapshot) => {
  if (typeof window === 'undefined' || !key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(snapshot));
  } catch {
    // Storage can be unavailable in private browsing or quota-constrained contexts.
  }
};

export const clearCampaignDraftSnapshot = (key: string) => {
  if (typeof window === 'undefined' || !key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Best-effort cleanup only.
  }
};
