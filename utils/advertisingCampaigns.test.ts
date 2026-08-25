import { describe, expect, it } from 'vitest';
import { supportsGlobalAssignee, supportsGlobalRoleAssignee } from './assigneeSupport';
import {
  ADVERTISING_CAMPAIGNS_MODULE_ID,
  CAMPAIGN_PLAN_FEATURES,
  CAMPAIGN_TOOL_DEFINITIONS,
  getCampaignToolDefinition,
} from './advertisingCampaigns';
import { supportsSystemCode } from './systemCode';

describe('advertising campaign central contracts', () => {
  it('keeps system tool codes unique and plan-gates dispatch channels', () => {
    const codes = CAMPAIGN_TOOL_DEFINITIONS.map((item) => item.value);
    expect(new Set(codes).size).toBe(codes.length);
    expect(getCampaignToolDefinition('sms')?.planFeature).toBe(CAMPAIGN_PLAN_FEATURES.sms);
    expect(getCampaignToolDefinition('voice_call')?.releaseAvailable).toBe(false);
    expect(getCampaignToolDefinition('outdoor')?.planFeature).toBeUndefined();
  });

  it('uses the existing system-code and assignee infrastructure', () => {
    expect(supportsSystemCode(ADVERTISING_CAMPAIGNS_MODULE_ID)).toBe(true);
    expect(supportsGlobalAssignee(ADVERTISING_CAMPAIGNS_MODULE_ID)).toBe(true);
    expect(supportsGlobalRoleAssignee(ADVERTISING_CAMPAIGNS_MODULE_ID)).toBe(true);
  });
});
