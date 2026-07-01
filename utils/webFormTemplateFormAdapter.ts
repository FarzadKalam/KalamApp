import { supabase } from '../supabaseClient';
import type { ModuleFormAdapterContext, ModuleFormAdapterResult } from '../types';
import { getCachedAuthUser } from './sessionCache';
import { syncRecordTags } from './recordTags';
import { runWorkflowsForEvent } from './workflowRuntime';
import {
  extractSurveyTemplateValuesFromForm,
  loadSurveyTemplateDefinition,
  normalizeSurveyTemplateSnapshot,
  WEB_FORM_TEMPLATE_ID_FIELD_KEY,
  WEB_FORM_TEMPLATE_SNAPSHOT_FIELD_KEY,
  WEB_FORM_TEMPLATE_VALUES_FIELD_KEY,
} from './surveyTemplates';

type WebFormTemplateRecordSaverOptions = {
  moduleId: string;
  table: string;
  transformPayload?: (
    payload: Record<string, any>,
    context: ModuleFormAdapterContext,
  ) => Promise<Record<string, any>> | Record<string, any>;
};

const toRecord = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
};

const withAuditFields = (
  payload: Record<string, any>,
  userId?: string | null,
  mode: 'create' | 'update' = 'create',
) => {
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

const resolveTemplateSnapshot = async ({
  values,
  currentValues,
}: Pick<ModuleFormAdapterContext, 'values' | 'currentValues'>) => {
  const currentSnapshot = normalizeSurveyTemplateSnapshot(
    values?.[WEB_FORM_TEMPLATE_SNAPSHOT_FIELD_KEY]
    || currentValues?.[WEB_FORM_TEMPLATE_SNAPSHOT_FIELD_KEY]
    || {}
  );
  const nextTemplateId = String(
    values?.[WEB_FORM_TEMPLATE_ID_FIELD_KEY]
    || currentValues?.[WEB_FORM_TEMPLATE_ID_FIELD_KEY]
    || ''
  ).trim();
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

const buildTemplatedPayload = async (
  context: ModuleFormAdapterContext,
  options: WebFormTemplateRecordSaverOptions,
) => {
  const { cleanedValues, templateFieldValues } = extractSurveyTemplateValuesFromForm(context.values || {});
  const templateSnapshot = await resolveTemplateSnapshot(context);
  const normalizedTemplateId = String(cleanedValues?.[WEB_FORM_TEMPLATE_ID_FIELD_KEY] || '').trim() || null;
  let payload = {
    ...cleanedValues,
    [WEB_FORM_TEMPLATE_ID_FIELD_KEY]: normalizedTemplateId,
    [WEB_FORM_TEMPLATE_VALUES_FIELD_KEY]: templateFieldValues,
    [WEB_FORM_TEMPLATE_SNAPSHOT_FIELD_KEY]: normalizedTemplateId ? templateSnapshot : {},
  } as Record<string, any>;
  delete payload.tags;
  if (options.transformPayload) {
    payload = await options.transformPayload(payload, context);
  }
  return payload;
};

export const createWebFormTemplateRecordSaver = (
  options: WebFormTemplateRecordSaverOptions,
) => async (context: ModuleFormAdapterContext): Promise<ModuleFormAdapterResult> => {
  const payload = await buildTemplatedPayload(context, options);
  const authUser = await getCachedAuthUser(supabase);
  const userId = String(authUser?.id || '').trim() || null;
  const selectedTags = Array.isArray(context.meta?.selectedTags) ? context.meta?.selectedTags : [];

  if (context.mode === 'update' && context.recordId) {
    const { data, error } = await supabase
      .from(options.table)
      .update(withAuditFields(payload, userId, 'update'))
      .eq('id', context.recordId)
      .select('*')
      .single();
    if (error) throw error;
    await syncRecordTags(supabase, options.moduleId, String(context.recordId), selectedTags);
    await runWorkflowsForEvent({
      moduleId: options.moduleId,
      event: 'upsert',
      currentRecord: toRecord(data),
      previousRecord: toRecord(context.currentValues || {}),
    });
    return { id: String(context.recordId) };
  }

  const { data, error } = await supabase
    .from(options.table)
    .insert(withAuditFields(payload, userId, 'create'))
    .select('*')
    .single();
  if (error) throw error;
  const insertedId = String(data?.id || '').trim();
  if (insertedId) {
    await syncRecordTags(supabase, options.moduleId, insertedId, selectedTags);
  }
  await runWorkflowsForEvent({
    moduleId: options.moduleId,
    event: 'create',
    currentRecord: toRecord(data),
  });
  return { id: insertedId || null };
};
