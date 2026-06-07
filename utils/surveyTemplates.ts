import { BlockType, FieldLocation, FieldNature, FieldType, type BlockDefinition, type ModuleDefinition, type ModuleField } from '../types';
import { normalizeWebFormFieldRecord, type WebFormFieldConfig, type WebFormFieldRecord } from './webForms';

export const SURVEY_TEMPLATE_FIELD_PREFIX = '__survey_template__::';
export const SURVEY_TEMPLATE_BLOCK_ID = 'survey_template_fields';

export type SurveyTemplateFieldBindingType = 'record_field' | 'template_field';

export type SurveyTemplateSchemaField = Pick<
  WebFormFieldRecord,
  'field_key' | 'label' | 'field_type' | 'placeholder' | 'help_text' | 'default_value' | 'is_required' | 'is_hidden' | 'sort_order' | 'config'
> & {
  target_field_key?: string | null;
  binding_type: SurveyTemplateFieldBindingType;
};

export type SurveyTemplateSchemaSnapshot = {
  template_id?: string | null;
  template_name?: string | null;
  fields: SurveyTemplateSchemaField[];
};

const SURVEY_REPLACED_BASE_FIELD_KEYS = new Set<string>([
  'survey_type',
  'respondent_name',
  'respondent_phone',
  'respondent_email',
  'channel',
  'overall_experience',
  'recommendation_score',
  'favorite_aspects',
  'improvement_areas',
  'visit_datetime',
  'branch_location',
  'follow_up_consent',
  'comments',
]);

const SURVEY_ALWAYS_VISIBLE_FIELD_KEYS = new Set<string>([
  'title',
  'status',
  'survey_template_id',
  'tags',
  'created_at',
]);

const WEB_FORM_FIELD_TYPE_TO_MODULE_FIELD_TYPE: Record<string, FieldType> = {
  text: FieldType.TEXT,
  long_text: FieldType.LONG_TEXT,
  number: FieldType.NUMBER,
  phone: FieldType.PHONE,
  date: FieldType.DATE,
  time: FieldType.TIME,
  datetime: FieldType.DATETIME,
  image: FieldType.IMAGE,
  file: FieldType.TEXT,
  multi_select: FieldType.MULTI_SELECT,
  location: FieldType.LOCATION,
  checkbox: FieldType.CHECKBOX,
  select: FieldType.SELECT,
  relation: FieldType.RELATION,
};

const REPORT_SUPPORTED_TEMPLATE_FIELD_TYPES = new Set<FieldType>([
  FieldType.TEXT,
  FieldType.LONG_TEXT,
  FieldType.NUMBER,
  FieldType.PHONE,
  FieldType.DATE,
  FieldType.TIME,
  FieldType.DATETIME,
  FieldType.MULTI_SELECT,
  FieldType.CHECKBOX,
  FieldType.SELECT,
  FieldType.RELATION,
  FieldType.STATUS,
]);

const toRecord = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
};

const slugifyTemplateFieldKey = (value: unknown, fallbackIndex = 0) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || `template_field_${fallbackIndex + 1}`;
};

export const getSurveyTemplateFieldBindingType = (field: Partial<WebFormFieldRecord> | null | undefined): SurveyTemplateFieldBindingType => {
  const config = toRecord(field?.config);
  if (String(config.binding_type || '').trim() === 'template_field') return 'template_field';
  return String(field?.target_field_key || '').trim() ? 'record_field' : 'template_field';
};

export const normalizeSurveyTemplateSchemaField = (
  value: unknown,
  index = 0,
): SurveyTemplateSchemaField => {
  const normalized = normalizeWebFormFieldRecord(value, index);
  const bindingType = getSurveyTemplateFieldBindingType(normalized);
  return {
    ...normalized,
    field_key: slugifyTemplateFieldKey(normalized.field_key || normalized.label, index),
    binding_type: bindingType,
    target_field_key: bindingType === 'record_field'
      ? (String(normalized.target_field_key || '').trim() || null)
      : null,
    config: {
      ...toRecord(normalized.config),
      binding_type: bindingType,
    } as WebFormFieldConfig,
  };
};

export const normalizeSurveyTemplateSnapshot = (value: unknown): SurveyTemplateSchemaSnapshot => {
  const record = toRecord(value);
  const fields = Array.isArray(record.fields)
    ? record.fields.map((item, index) => normalizeSurveyTemplateSchemaField(item, index))
    : [];
  return {
    template_id: String(record.template_id || '').trim() || null,
    template_name: String(record.template_name || '').trim() || null,
    fields,
  };
};

export const buildSurveyTemplateSnapshot = (
  template: Record<string, any> | null | undefined,
  fields: Array<unknown>,
): SurveyTemplateSchemaSnapshot => ({
  template_id: String(template?.id || '').trim() || null,
  template_name: String(template?.name || template?.route_slug || '').trim() || null,
  fields: (fields || []).map((item, index) => normalizeSurveyTemplateSchemaField(item, index)),
});

export const isSurveyTemplateFieldKey = (fieldKey?: string | null) =>
  String(fieldKey || '').trim().startsWith(SURVEY_TEMPLATE_FIELD_PREFIX);

export const buildSurveyTemplateFieldKey = (fieldKey: string) =>
  `${SURVEY_TEMPLATE_FIELD_PREFIX}${String(fieldKey || '').trim()}`;

export const parseSurveyTemplateFieldKey = (fieldKey?: string | null) => {
  const normalized = String(fieldKey || '').trim();
  if (!normalized.startsWith(SURVEY_TEMPLATE_FIELD_PREFIX)) return null;
  const rawKey = normalized.slice(SURVEY_TEMPLATE_FIELD_PREFIX.length).trim();
  return rawKey || null;
};

export const getSurveyTemplateScopedIdFromConditions = (
  conditionsAll?: Array<{ field?: string; operator?: string; value?: any }> | null,
  conditionsAny?: Array<{ field?: string; operator?: string; value?: any }> | null,
) => {
  const candidateValues = [
    ...(Array.isArray(conditionsAll) ? conditionsAll : []),
    ...(Array.isArray(conditionsAny) ? conditionsAny : []),
  ]
    .filter((condition) => String(condition?.field || '').trim() === 'survey_template_id')
    .filter((condition) => {
      const operator = String(condition?.operator || 'eq').trim().toLowerCase();
      return operator === 'eq' || operator === 'equals';
    })
    .map((condition) => String(condition?.value || '').trim())
    .filter(Boolean);

  if (candidateValues.length === 0) return null;
  const uniqueValues = Array.from(new Set(candidateValues));
  return uniqueValues.length === 1 ? uniqueValues[0] : null;
};

export const getSurveyTemplateScopedIdFromCrudFilters = (filters: any[] | null | undefined) => {
  const candidateValues = (Array.isArray(filters) ? filters : [])
    .flatMap((item) => {
      if (Array.isArray((item as any)?.value) && String((item as any)?.field || '').trim() === 'survey_template_id') {
        return (item as any).value;
      }
      return [item];
    })
    .filter((filter) => String((filter as any)?.field || '').trim() === 'survey_template_id')
    .filter((filter) => {
      const operator = String((filter as any)?.operator || 'eq').trim().toLowerCase();
      return operator === 'eq' || operator === 'equals';
    })
    .map((filter) => String((filter as any)?.value || '').trim())
    .filter(Boolean);

  if (candidateValues.length === 0) return null;
  const uniqueValues = Array.from(new Set(candidateValues));
  return uniqueValues.length === 1 ? uniqueValues[0] : null;
};

const buildTemplateFieldOptions = (field: SurveyTemplateSchemaField) => {
  const configuredOptions = Array.isArray(field.config?.select_options) ? field.config?.select_options : [];
  return configuredOptions.reduce<Array<{ label: string; value: string; color?: string }>>((acc, item) => {
    const option = toRecord(item);
    const label = String(option.label || option.value || '').trim();
    const value = String(option.value || option.label || '').trim();
    if (!label || !value) return acc;
    acc.push({
      label,
      value,
      color: String(option.color || '').trim() || undefined,
    });
    return acc;
  }, []);
};

const buildTemplateFieldLayout = (field: SurveyTemplateSchemaField, index: number, context: 'form' | 'show' | 'list' | 'report') => {
  const resolvedType = WEB_FORM_FIELD_TYPE_TO_MODULE_FIELD_TYPE[String(field.field_type || '').trim()] || FieldType.TEXT;
  const isHeaderCandidate = resolvedType === FieldType.TEXT && index === 0 && context !== 'report';
  return {
    resolvedType,
    location: isHeaderCandidate ? FieldLocation.HEADER : FieldLocation.BLOCK,
    blockId: isHeaderCandidate ? undefined : SURVEY_TEMPLATE_BLOCK_ID,
  };
};

const buildTemplateFieldModuleField = (
  field: SurveyTemplateSchemaField,
  index: number,
  context: 'form' | 'show' | 'list' | 'report'
): ModuleField => {
  const fieldKey = buildSurveyTemplateFieldKey(field.field_key);
  const layout = buildTemplateFieldLayout(field, index, context);
  return {
    key: fieldKey,
    type: layout.resolvedType,
    labels: { fa: field.label, en: field.label },
    location: layout.location,
    blockId: layout.blockId,
    order: Number(field.sort_order || ((index + 1) * 10)),
    validation: { required: field.is_required === true },
    options: buildTemplateFieldOptions(field),
    relationConfig: layout.resolvedType === FieldType.RELATION && String(field.config?.relation_target_module || '').trim()
      ? {
          targetModule: String(field.config?.relation_target_module || '').trim(),
        }
      : undefined,
    dynamicOptionsCategory: String(field.config?.dynamic_options_category || '').trim() || undefined,
    nature: FieldNature.STANDARD,
    isTableColumn: context === 'list' || context === 'report',
    hideInCreateForm: field.is_hidden === true,
    readonly: false,
  };
};

const buildRecordBoundTemplateModuleField = (
  baseField: ModuleField,
  field: SurveyTemplateSchemaField,
  index: number,
  context: 'form' | 'show' | 'list' | 'report'
): ModuleField => {
  const layout = buildTemplateFieldLayout(field, index, context);
  const templateOptions = buildTemplateFieldOptions(field);
  const relationTargetModule = String(field.config?.relation_target_module || '').trim();
  const nextType = baseField.type === FieldType.STATUS && layout.resolvedType === FieldType.SELECT
    ? FieldType.STATUS
    : baseField.type;

  return {
    ...baseField,
    key: String(baseField.key || '').trim(),
    type: nextType,
    labels: { fa: field.label, en: baseField.labels?.en || field.label },
    location: layout.location,
    blockId: layout.blockId,
    order: Number(field.sort_order || baseField.order || ((index + 1) * 10)),
    validation: {
      ...(baseField.validation || {}),
      required: field.is_required === true,
    },
    options: templateOptions.length > 0 ? templateOptions : baseField.options,
    relationConfig: nextType === FieldType.RELATION && relationTargetModule
      ? {
          ...(baseField.relationConfig || {}),
          targetModule: relationTargetModule,
        }
      : baseField.relationConfig,
    dynamicOptionsCategory: String(field.config?.dynamic_options_category || '').trim() || baseField.dynamicOptionsCategory,
    hideInCreateForm: context === 'form' ? field.is_hidden === true : baseField.hideInCreateForm,
    isTableColumn: context === 'list' || context === 'report' ? true : baseField.isTableColumn,
    readonly: false,
  };
};

export const buildSurveyRuntimeModule = (
  baseModule: ModuleDefinition,
  snapshotValue: unknown,
  context: 'form' | 'show' | 'list' | 'report' = 'show',
): ModuleDefinition => {
  const snapshot = normalizeSurveyTemplateSnapshot(snapshotValue);
  const visibleTemplateFields = snapshot.fields.filter((field) => field.is_hidden !== true);
  if (visibleTemplateFields.length === 0) return baseModule;
  const templateFields = visibleTemplateFields.filter((field) => field.binding_type === 'template_field');
  const recordBoundFields = visibleTemplateFields.filter((field) => field.binding_type === 'record_field');

  const baseFieldMap = new Map(
    (baseModule.fields || [])
      .filter((field) => !!String(field?.key || '').trim())
      .map((field) => [String(field.key).trim(), field] as const)
  );

  const recordBoundTargetKeys = new Set(
    recordBoundFields
      .map((field) => String(field.target_field_key || '').trim())
      .filter(Boolean)
  );

  const nextFields = (baseModule.fields || [])
    .filter((field) => {
      const fieldKey = String(field?.key || '').trim();
      if (!fieldKey) return false;
      if (recordBoundTargetKeys.has(fieldKey)) return false;
      if (SURVEY_ALWAYS_VISIBLE_FIELD_KEYS.has(fieldKey)) return true;
      return !SURVEY_REPLACED_BASE_FIELD_KEYS.has(fieldKey);
    })
    .map((field) => {
      const fieldKey = String(field?.key || '').trim();
      if (fieldKey === 'title' && context === 'form') {
        return { ...field, hideInCreateForm: true };
      }
      if (fieldKey === 'created_at' && context === 'form') {
        return { ...field, hideInCreateForm: true };
      }
      return field;
    });

  const runtimeRecordFields = recordBoundFields
    .map((field, index) => {
      const targetFieldKey = String(field.target_field_key || '').trim();
      const baseField = baseFieldMap.get(targetFieldKey);
      if (!baseField) return null;
      return buildRecordBoundTemplateModuleField(baseField, field, index, context);
    })
    .filter((field): field is ModuleField => Boolean(field));
  const runtimeTemplateFields = templateFields.map((field, index) => buildTemplateFieldModuleField(field, index, context));
  const hasTemplateBlock = (baseModule.blocks || []).some((block) => String(block?.id || '').trim() === SURVEY_TEMPLATE_BLOCK_ID);
  const nextBlocks = hasTemplateBlock
    ? baseModule.blocks || []
    : [
        ...(baseModule.blocks || []),
        {
          id: SURVEY_TEMPLATE_BLOCK_ID,
          titles: { fa: snapshot.template_name || 'قالب نظرسنجی', en: 'Survey Template' },
          type: BlockType.FIELD_GROUP,
          order: 1.5,
        } as BlockDefinition,
      ];

  return {
    ...baseModule,
    fields: [...nextFields, ...runtimeRecordFields, ...runtimeTemplateFields],
    blocks: nextBlocks,
  };
};

export const mergeSurveyTemplateValuesIntoRecord = <T extends Record<string, any>>(record: T | null | undefined): T | null => {
  if (!record || typeof record !== 'object') return null;
  const templateValues = toRecord(record.template_field_values);
  const mergedTemplateValues = Object.entries(templateValues).reduce<Record<string, any>>((acc, [key, value]) => {
    const normalizedKey = slugifyTemplateFieldKey(key);
    if (!normalizedKey) return acc;
    acc[buildSurveyTemplateFieldKey(normalizedKey)] = value;
    return acc;
  }, {});
  return {
    ...record,
    ...mergedTemplateValues,
  };
};

export const extractSurveyTemplateValuesFromForm = (values: Record<string, any> | null | undefined) => {
  const source = values && typeof values === 'object' ? values : {};
  const templateFieldValues: Record<string, any> = {};
  const cleanedValues = Object.entries(source).reduce<Record<string, any>>((acc, [key, value]) => {
    const templateFieldKey = parseSurveyTemplateFieldKey(key);
    if (!templateFieldKey) {
      acc[key] = value;
      return acc;
    }
    templateFieldValues[templateFieldKey] = value;
    return acc;
  }, {});
  return { cleanedValues, templateFieldValues };
};

export const getSurveyTemplateFieldDefaultValues = (snapshotValue: unknown) => {
  const snapshot = normalizeSurveyTemplateSnapshot(snapshotValue);
  return snapshot.fields.reduce<Record<string, any>>((acc, field) => {
    if (field.binding_type !== 'template_field') return acc;
    if (field.default_value === undefined || field.default_value === null) return acc;
    acc[buildSurveyTemplateFieldKey(field.field_key)] = field.default_value;
    return acc;
  }, {});
};

export const getSurveyTemplateValueKeys = (snapshotValue: unknown) => {
  const snapshot = normalizeSurveyTemplateSnapshot(snapshotValue);
  return snapshot.fields
    .filter((field) => field.binding_type === 'template_field')
    .map((field) => buildSurveyTemplateFieldKey(field.field_key));
};

export const buildSurveyReportFieldsFromSnapshot = (snapshotValue: unknown) => {
  const snapshot = normalizeSurveyTemplateSnapshot(snapshotValue);
  return snapshot.fields
    .map((field, index) => {
      if (field.binding_type === 'template_field') {
        const nextField = buildTemplateFieldModuleField(field, index, 'report');
        return REPORT_SUPPORTED_TEMPLATE_FIELD_TYPES.has(nextField.type) ? nextField : null;
      }
      const targetFieldKey = String(field.target_field_key || '').trim();
      if (!targetFieldKey) return null;
      const fieldType = WEB_FORM_FIELD_TYPE_TO_MODULE_FIELD_TYPE[String(field.field_type || '').trim()] || FieldType.TEXT;
      if (!REPORT_SUPPORTED_TEMPLATE_FIELD_TYPES.has(fieldType)) return null;
      return {
        key: targetFieldKey,
        type: fieldType,
        labels: { fa: field.label, en: field.label },
        options: buildTemplateFieldOptions(field),
        validation: { required: field.is_required === true },
        relationConfig: fieldType === FieldType.RELATION && String(field.config?.relation_target_module || '').trim()
          ? { targetModule: String(field.config?.relation_target_module || '').trim() }
          : undefined,
        dynamicOptionsCategory: String(field.config?.dynamic_options_category || '').trim() || undefined,
        isTableColumn: true,
        nature: FieldNature.STANDARD,
      } as ModuleField;
    })
    .filter((field): field is ModuleField => Boolean(field));
};

export const loadSurveyTemplateDefinition = async (supabaseClient: any, templateId?: string | null) => {
  const normalizedTemplateId = String(templateId || '').trim();
  if (!normalizedTemplateId) return null;
  const [{ data: template, error: templateError }, { data: fieldRows, error: fieldsError }] = await Promise.all([
    supabaseClient.from('web_forms').select('id, name, route_slug, form_type, target_module_id').eq('id', normalizedTemplateId).maybeSingle(),
    supabaseClient.from('web_form_fields').select('*').eq('web_form_id', normalizedTemplateId).eq('is_active', true).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
  ]);
  if (templateError) throw templateError;
  if (fieldsError) throw fieldsError;
  if (!template) return null;
  return {
    template,
    fields: (fieldRows || []).map((item: unknown, index: number) => normalizeSurveyTemplateSchemaField(item, index)),
    snapshot: buildSurveyTemplateSnapshot(template, fieldRows || []),
  };
};

export const buildSurveySubmissionTitle = (values: Record<string, any> | null | undefined, fallback = 'پاسخ نظرسنجی') => {
  const source = values && typeof values === 'object' ? values : {};
  return String(
    source.title
    || source.respondent_name
    || source.respondent_phone
    || source.respondent_email
    || fallback
  ).trim() || fallback;
};
