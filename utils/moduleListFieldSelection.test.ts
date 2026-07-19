import { describe, expect, it } from 'vitest';
import { FieldType } from '../types';
import {
  collectDeferredModuleListFieldKeys,
  shouldDeferModuleListField,
  shouldSkipModuleListField,
} from './moduleListFieldSelection';

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

describe('deferred module list fields', () => {
  it('defers every heavy visible field without coupling to a module id', () => {
    expect(shouldDeferModuleListField('projects', {
      key: 'execution_process_draft',
      type: FieldType.JSON,
    })).toBe(true);
    expect(shouldDeferModuleListField('customers', {
      key: 'description',
      type: FieldType.LONG_TEXT,
    })).toBe(true);
    expect(shouldDeferModuleListField('projects', {
      key: 'name',
      type: FieldType.TEXT,
    })).toBe(false);
  });

  it('deduplicates deferred keys and ignores virtual preview fields', () => {
    expect(collectDeferredModuleListFieldKeys('process_runs', [
      { key: 'run_stages_preview', type: FieldType.JSON },
      { key: 'notes', type: FieldType.LONG_TEXT },
      { key: 'notes', type: FieldType.LONG_TEXT },
    ])).toEqual(['notes']);
  });
});
