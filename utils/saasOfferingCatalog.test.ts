import { PLAN_FEATURE_TABLES } from './planFeatureBindings';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SAAS_FEATURE_OPTIONS, SAAS_MODULE_GROUPS, SAAS_MODULE_PLAN_INHERITANCE, SAAS_MODULE_FEATURE_INHERITANCE } from './saasOfferingCatalog';
import { buildExplicitPlanFlags, isPlanValueEnabled } from './planAccessEditing';
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
    const sql = readFileSync('database_v1_phase587_unified_voip_asterisk_realtime.sql', 'utf8');
    const snapshot = JSON.parse(sql.match(/select '(\{[^\n]*"features":[^\n]*\})'::jsonb/)![1]);
    expect(snapshot.moduleParents).toEqual(SAAS_MODULE_PLAN_INHERITANCE);
    expect(snapshot.moduleFeatures).toEqual(SAAS_MODULE_FEATURE_INHERITANCE);
    expect(snapshot.features.sort()).toEqual(SAAS_FEATURE_OPTIONS.map((item) => item.id).sort());
    expect(snapshot.modules.sort()).toEqual(SAAS_MODULE_GROUPS.flatMap((group) => group.modules.map((item) => item.id)).sort());
  });
});

describe('plan access editing', () => {
  it('keeps every agent explicitly off after all are deselected, retaining unknown configuration', () => {
    const ids = AI_AGENT_CATALOG.map((agent) => getAiAgentPlanFeatureKey(agent.key));
    const saved = buildExplicitPlanFlags(ids, [], { future_feature: { enabled: true } });
    expect(ids.every((id) => saved[id] === false)).toBe(true);
    expect(saved.future_feature).toEqual({ enabled: true });
    const reopened = Object.keys(saved).filter((id) => ids.includes(id) && isPlanValueEnabled(saved[id]));
    expect(reopened).toEqual([]);
  });
  it('reads supported legacy feature representations without treating false strings as enabled', () => {
    expect(['enabled', 'limited', true, { enabled: true }].every(isPlanValueEnabled)).toBe(true);
    expect(['false', false, null, { enabled: false }].some(isPlanValueEnabled)).toBe(false);
  });
});

it('keeps runtime table licensing synchronized with the central resource bindings', () => {
  const sql = readFileSync('database_v1_phase587_unified_voip_asterisk_realtime.sql', 'utf8');
  const snapshot = JSON.parse(sql.match(/select '(\{[^\n]*"voip_sip_endpoints":[^\n]*\})'::jsonb/)![1]);
  expect(snapshot).toEqual(PLAN_FEATURE_TABLES);
  for (const feature of Object.values(PLAN_FEATURE_TABLES)) expect(SAAS_FEATURE_OPTIONS.some((item) => item.id === feature)).toBe(true);
});
