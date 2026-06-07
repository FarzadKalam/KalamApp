import { supabase } from '../supabaseClient';
import type { ModuleFormAdapterContext, ModuleFormAdapterResult } from '../types';
import { getCachedAuthUser } from './sessionCache';
import { syncRecordTags } from './recordTags';
import { runWorkflowsForEvent } from './workflowRuntime';
import {
  buildSurveySubmissionTitle,
  extractSurveyTemplateValuesFromForm,
  loadSurveyTemplateDefinition,
  normalizeSurveyTemplateSnapshot,
} from './surveyTemplates';

const SURVEY_MODULE_ID = 'surveys';

const toRecord = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
};

const withAuditFields = (payload: Record<string, any>, userId?: string | null, mode: 'create' | 'update' = 'create') => {
  if (!userId) return payload;
  if (mode === 'update') {
    return {
      ...payload,
      updated_by: payload.updated_by ?? userId,
    };
  }
  return {
    ...payload,
    created_by: payload.created_by ?? userId,
    updated_by: payload.updated_by ?? userId,
  };
};

const resolveSurveyTemplateSnapshot = async ({
  values,
  currentValues,
}: Pick<ModuleFormAdapterContext, 'values' | 'currentValues'>) => {
  const currentSnapshot = normalizeSurveyTemplateSnapshot(
    values?.template_schema_snapshot
    || currentValues?.template_schema_snapshot
    || {}
  );
  const nextTemplateId = String(values?.survey_template_id || currentValues?.survey_template_id || '').trim();
  if (currentSnapshot.fields.length > 0) {
    if (!nextTemplateId || String(currentSnapshot.template_id || '').trim() === nextTemplateId) {
      return currentSnapshot;
    }
  }
  if (!nextTemplateId) {
    return normalizeSurveyTemplateSnapshot({});
  }
  const definition = await loadSurveyTemplateDefinition(supabase, nextTemplateId);
  return normalizeSurveyTemplateSnapshot(definition?.snapshot || {});
};

const buildSurveyPayload = async (context: ModuleFormAdapterContext) => {
  const { cleanedValues, templateFieldValues } = extractSurveyTemplateValuesFromForm(context.values || {});
  const templateSnapshot = await resolveSurveyTemplateSnapshot(context);
  const normalizedTemplateId = String(cleanedValues?.survey_template_id || '').trim() || null;
  const payload = {
    ...cleanedValues,
    title: buildSurveySubmissionTitle(cleanedValues),
    survey_template_id: normalizedTemplateId,
    template_field_values: templateFieldValues,
    template_schema_snapshot: normalizedTemplateId ? templateSnapshot : {},
  } as Record<string, any>;
  delete payload.tags;
  return payload;
};

export const saveSurveyRecord = async (context: ModuleFormAdapterContext): Promise<ModuleFormAdapterResult> => {
  const payload = await buildSurveyPayload(context);
  const authUser = await getCachedAuthUser(supabase);
  const userId = String(authUser?.id || '').trim() || null;
  const selectedTags = Array.isArray(context.meta?.selectedTags) ? context.meta?.selectedTags : [];

  if (context.mode === 'update' && context.recordId) {
    const { data, error } = await supabase
      .from('surveys')
      .update(withAuditFields(payload, userId, 'update'))
      .eq('id', context.recordId)
      .select('*')
      .single();
    if (error) throw error;
    await syncRecordTags(supabase, SURVEY_MODULE_ID, String(context.recordId), selectedTags);
    await runWorkflowsForEvent({
      moduleId: SURVEY_MODULE_ID,
      event: 'upsert',
      currentRecord: toRecord(data),
      previousRecord: toRecord(context.currentValues || {}),
    });
    return { id: String(context.recordId) };
  }

  const { data, error } = await supabase
    .from('surveys')
    .insert(withAuditFields(payload, userId, 'create'))
    .select('*')
    .single();
  if (error) throw error;
  const insertedId = String(data?.id || '').trim();
  if (insertedId) {
    await syncRecordTags(supabase, SURVEY_MODULE_ID, insertedId, selectedTags);
  }
  await runWorkflowsForEvent({
    moduleId: SURVEY_MODULE_ID,
    event: 'create',
    currentRecord: toRecord(data),
  });
  return { id: insertedId || null };
};
