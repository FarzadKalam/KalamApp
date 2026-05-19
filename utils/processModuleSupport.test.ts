import { describe, expect, it } from 'vitest';
import { FieldType, ModuleNature, ViewMode, type ModuleDefinition } from '../types';
import { withProcessModuleSupport } from './processModuleSupport';

const buildModule = (id: string): ModuleDefinition => ({
  id,
  table: id,
  titles: { fa: id, en: id },
  nature: ModuleNature.STANDARD,
  supportedViewModes: [ViewMode.LIST],
  fields: [
    {
      key: 'name',
      labels: { fa: 'نام', en: 'Name' },
      type: FieldType.TEXT,
      isKey: true,
      order: 1,
    },
  ],
  blocks: [],
});

describe('processModuleSupport', () => {
  it('does not inject execution-process fields into instructions', () => {
    const result = withProcessModuleSupport(buildModule('instructions'));
    expect(result.fields.map((field) => field.key)).toEqual(['name']);
  });

  it('still injects execution-process fields into supported modules', () => {
    const result = withProcessModuleSupport(buildModule('personas'));
    expect(result.fields.some((field) => field.key === 'process_template_id')).toBe(true);
    expect(result.fields.some((field) => field.key === 'execution_process_draft')).toBe(true);
  });
});
