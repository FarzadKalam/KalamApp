import { describe, expect, it } from 'vitest';
import { FieldLocation, FieldNature, FieldType, type ModuleDefinition } from '../types';
import {
  buildSurveyRuntimeModule,
  supportsWebFormTemplateRuntime,
} from './surveyTemplates';

const buildTemplateSupportModule = (module: Partial<ModuleDefinition>): ModuleDefinition => ({
  id: String(module.id || 'sample_module'),
  titles: module.titles || { fa: 'نمونه', en: 'Sample' },
  table: String(module.table || module.id || 'sample_module'),
  fields: module.fields || [],
  blocks: module.blocks || [],
});

describe('surveyTemplates runtime support', () => {
  it('detects modules that support web-form template runtime', () => {
    const module = buildTemplateSupportModule({
      fields: [
        { key: 'survey_template_id', type: FieldType.RELATION, labels: { fa: 'قالب' } },
        { key: 'template_field_values', type: FieldType.JSON, labels: { fa: 'داده‌های قالب' } },
        { key: 'template_schema_snapshot', type: FieldType.JSON, labels: { fa: 'اسنپ‌شات قالب' } },
      ],
    });

    expect(supportsWebFormTemplateRuntime(module)).toBe(true);
    expect(supportsWebFormTemplateRuntime(buildTemplateSupportModule({ fields: module.fields.slice(0, 2) }))).toBe(false);
  });

  it('keeps non-survey base fields while applying runtime template fields', () => {
    const module = buildTemplateSupportModule({
      id: 'marketing_leads',
      fields: [
        { key: 'survey_template_id', type: FieldType.RELATION, labels: { fa: 'قالب وب‌فرم' }, location: FieldLocation.HEADER, order: 0.5 },
        { key: 'name', type: FieldType.TEXT, labels: { fa: 'عنوان لید' }, location: FieldLocation.HEADER, order: 1, isKey: true },
        { key: 'notes', type: FieldType.LONG_TEXT, labels: { fa: 'یادداشت' }, location: FieldLocation.BLOCK, blockId: 'notes', order: 2 },
        { key: 'template_field_values', type: FieldType.JSON, labels: { fa: 'داده‌های قالب' }, nature: FieldNature.SYSTEM },
        { key: 'template_schema_snapshot', type: FieldType.JSON, labels: { fa: 'اسنپ‌شات قالب' }, nature: FieldNature.SYSTEM },
      ],
    });

    const runtimeModule = buildSurveyRuntimeModule(module, {
      template_id: 'form-1',
      template_name: 'فرم جذب',
      fields: [
        {
          field_key: 'full_name',
          label: 'نام کامل',
          target_field_key: 'name',
          field_type: 'text',
          binding_type: 'record_field',
          is_required: true,
          is_hidden: false,
          sort_order: 10,
          config: {},
        },
        {
          field_key: 'campaign_name',
          label: 'کمپین',
          field_type: 'text',
          binding_type: 'template_field',
          is_required: false,
          is_hidden: false,
          sort_order: 20,
          config: {},
        },
      ],
    }, 'form');

    expect(runtimeModule.fields.find((field) => field.key === 'notes')).toBeTruthy();
    expect(runtimeModule.fields.find((field) => field.key === 'name')?.labels.fa).toBe('نام کامل');
    expect(runtimeModule.fields.find((field) => field.key === '__survey_template__::campaign_name')?.labels.fa).toBe('کمپین');
  });

  it('keeps survey-specific replacement behavior for survey records', () => {
    const module = buildTemplateSupportModule({
      id: 'surveys',
      fields: [
        { key: 'title', type: FieldType.TEXT, labels: { fa: 'عنوان' }, location: FieldLocation.HEADER, order: 1 },
        { key: 'respondent_name', type: FieldType.TEXT, labels: { fa: 'نام پاسخ‌دهنده' }, location: FieldLocation.HEADER, order: 2 },
        { key: 'survey_template_id', type: FieldType.RELATION, labels: { fa: 'قالب' }, location: FieldLocation.HEADER, order: 3 },
        { key: 'template_field_values', type: FieldType.JSON, labels: { fa: 'داده‌های قالب' }, nature: FieldNature.SYSTEM },
        { key: 'template_schema_snapshot', type: FieldType.JSON, labels: { fa: 'اسنپ‌شات قالب' }, nature: FieldNature.SYSTEM },
      ],
    });

    const runtimeModule = buildSurveyRuntimeModule(module, {
      template_id: 'survey-form',
      template_name: 'فرم نظرسنجی',
      fields: [
        {
          field_key: 'custom_reason',
          label: 'علت',
          field_type: 'text',
          binding_type: 'template_field',
          is_required: false,
          is_hidden: false,
          sort_order: 10,
          config: {},
        },
      ],
    }, 'form');

    expect(runtimeModule.fields.find((field) => field.key === 'respondent_name')).toBeFalsy();
    expect(runtimeModule.fields.find((field) => field.key === 'title')).toBeTruthy();
  });
});
