import { describe, expect, it } from 'vitest';
import { shouldSkipModuleListField } from './moduleListFieldSelection';

describe('shouldSkipModuleListField', () => {
  it('skips unbacked process template fields in module lists', () => {
    expect(shouldSkipModuleListField('process_templates', 'image_url')).toBe(true);
    expect(shouldSkipModuleListField('process_templates', 'template_stages_preview')).toBe(true);
  });

  it('skips unbacked process run preview fields in module lists', () => {
    expect(shouldSkipModuleListField('process_runs', 'run_stages_preview')).toBe(true);
  });

  it('keeps normal persisted fields selectable', () => {
    expect(shouldSkipModuleListField('process_templates', 'name')).toBe(false);
    expect(shouldSkipModuleListField('projects', 'image_url')).toBe(false);
  });
});
