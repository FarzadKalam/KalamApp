import { describe, expect, it } from 'vitest';
import { modelSupportsSlot, resolveCapabilityModelSlot, tryResolveModelSlot } from './ai-gateway';

const catalog = [
  { id: 'tenant-main', provider: 'test', is_active: true, capability_tags: ['dashboard_chat', 'document_analysis'] },
  { id: 'sales-model', provider: 'test', is_active: true, capability_tags: ['record_chat'] },
  { id: 'voice-only', provider: 'test', is_active: true, capability_tags: ['voice_output'] },
];
describe('operational model slot resolution', () => {
  it('keeps native image analysis on the selected primary even with an old analysis slot', () => {
    const result = tryResolveModelSlot({ slot: 'document_analysis', catalogRows: catalog,
      orgAiSettings: { selected_models: { __primary_model: 'tenant-main', document_analysis: 'sales-model' } } });
    expect(result?.model).toBe('tenant-main'); expect(result?.source).toBe('org_primary');
  });
  it('recognizes catalog vision metadata without requiring an artificial skill model tag', () => {
    const vision = { ...catalog[1], metadata: { input_modalities: ['text', 'image'] } };
    expect(tryResolveModelSlot({ slot: 'document_analysis', catalogRows: [catalog[0], vision],
      agentConfig: { agent_key: 'sales_leads', model_override: 'sales-model' } })?.model).toBe('sales-model');
  });
  it('uses an analysis specialist when the chosen primary has no native analysis support', () => {
    expect(tryResolveModelSlot({ slot: 'document_analysis', catalogRows: catalog,
      orgAiSettings: { selected_models: { __primary_model: 'sales-model', document_analysis: 'tenant-main' } } })?.model).toBe('tenant-main');
  });
  it.each(['record_creation', 'process_operation', 'pricing_adjustment', 'agent_task'])('runs %s on the primary agent model without invented catalog tags', slot => {
    expect(catalog.some(row => row.capability_tags.includes(slot))).toBe(false);
    expect(resolveCapabilityModelSlot(slot)).toBe('primary');
    expect(tryResolveModelSlot({ slot, catalogRows: catalog, orgAiSettings: { selected_models: { __primary_model: 'tenant-main' } } })?.model).toBe('tenant-main');
  });
  it('retains the chosen agent override for operational skills', () => {
    const result = tryResolveModelSlot({ slot: 'record_creation', catalogRows: catalog,
      orgAiSettings: { selected_models: { __primary_model: 'tenant-main' } }, agentConfig: { agent_key: 'sales_leads', model_override: 'sales-model' } });
    expect(result?.model).toBe('sales-model'); expect(result?.source).toBe('agent_override');
  });
  it('excludes disabled and unrelated models rather than bypassing compatibility', () => {
    expect(modelSupportsSlot(catalog[2], 'record_creation')).toBe(false);
    expect(tryResolveModelSlot({ slot: 'record_creation', catalogRows: [{ ...catalog[0], is_active: false }, catalog[2]] })).toBeNull();
  });
  it('does not turn embeddings or output generation into primary-model operations', () => {
    expect(resolveCapabilityModelSlot('embedding')).toBe('embedding');
    expect(resolveCapabilityModelSlot('voice_output')).toBe('voice_output');
    expect(tryResolveModelSlot({ slot: 'embedding', catalogRows: catalog })).toBeNull();
  });
});
