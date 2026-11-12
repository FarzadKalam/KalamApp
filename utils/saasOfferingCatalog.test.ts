import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SAAS_FEATURE_OPTIONS, SAAS_MODULE_GROUPS } from './saasOfferingCatalog';
import { PLAN_FEATURE_OPTIONS } from './planFeatureCatalog';
import { AI_AGENT_CATALOG, getAiAgentPlanFeatureKey } from './aiAgentCatalog';

describe('shared SaaS offering catalog', () => {
  it('uses the same complete catalog in plan and org management', () => {
    expect(PLAN_FEATURE_OPTIONS).toBe(SAAS_FEATURE_OPTIONS);
    const keys = SAAS_FEATURE_OPTIONS.map((item) => item.id);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining(['webhooks', 'api_access', 'wordpress_connection', 'mbti_ai_analysis', ...AI_AGENT_CATALOG.map((agent) => getAiAgentPlanFeatureKey(agent.key))]));
    const modules = SAAS_MODULE_GROUPS.flatMap((group) => group.modules.map((item) => item.id));
    expect(new Set(modules).size).toBe(modules.length);
    expect(modules).toEqual(expect.arrayContaining(['goals', 'assets', 'organization_chart', 'job_descriptions', 'sms_delivery_reports']));
  });
  it('keeps the demo provisioning catalog synchronized with every configurable offering', () => {
    const sql = readFileSync('database_v1_phase585_plan_entitlements_and_full_demo.sql', 'utf8');
    const snapshot = JSON.parse(sql.match(/select '(\{.*\})'::jsonb/)![1]);
    expect(snapshot.features.sort()).toEqual(SAAS_FEATURE_OPTIONS.map((item) => item.id).sort());
    expect(snapshot.modules.sort()).toEqual(SAAS_MODULE_GROUPS.flatMap((group) => group.modules.map((item) => item.id)).sort());
  });
});
