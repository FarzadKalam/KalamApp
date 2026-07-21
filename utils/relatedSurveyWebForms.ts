import { buildWebFormPublicPath } from './webForms';

export type RelatedSurveyWebForm = {
  id: string;
  name: string;
  description: string;
  routeSlug: string;
};

const normalizeText = (value: unknown) => String(value || '').trim();

export const fetchActiveSurveyWebForms = async (supabaseClient: any): Promise<RelatedSurveyWebForm[]> => {
  const { data, error } = await supabaseClient
    .from('web_forms')
    .select('id, name, description, route_slug')
    .eq('target_module_id', 'surveys')
    .eq('form_type', 'survey')
    .eq('is_active', true)
    .order('name', { ascending: true })
    .limit(100);
  if (error) throw error;

  return (data || [])
    .map((item: any) => ({
      id: normalizeText(item?.id),
      name: normalizeText(item?.name) || 'نظرسنجی بدون عنوان',
      description: normalizeText(item?.description),
      routeSlug: normalizeText(item?.route_slug),
    }))
    .filter((item: RelatedSurveyWebForm) => item.id && item.routeSlug);
};

export const createRelatedSurveyWebFormPath = async (
  supabaseClient: any,
  {
    webFormId,
    relatedModuleId,
    relatedRecordId,
  }: {
    webFormId: string;
    relatedModuleId: string;
    relatedRecordId: string;
  },
) => {
  const normalizedWebFormId = normalizeText(webFormId);
  const normalizedModuleId = normalizeText(relatedModuleId);
  const normalizedRecordId = normalizeText(relatedRecordId);
  if (!normalizedWebFormId || !normalizedModuleId || !normalizedRecordId) {
    throw new Error('SURVEY_WEB_FORM_CONTEXT_REQUIRED');
  }

  const { data: webForm, error: webFormError } = await supabaseClient
    .from('web_forms')
    .select('id, route_slug, target_module_id, form_type, is_active')
    .eq('id', normalizedWebFormId)
    .eq('target_module_id', 'surveys')
    .eq('form_type', 'survey')
    .eq('is_active', true)
    .maybeSingle();
  if (webFormError) throw webFormError;
  if (!webForm?.id || !normalizeText(webForm?.route_slug)) {
    throw new Error('SURVEY_WEB_FORM_NOT_AVAILABLE');
  }

  const { data: tokenResult, error: tokenError } = await supabaseClient.rpc('create_web_form_link_token', {
    p_web_form_id: normalizedWebFormId,
    p_target_module_id: 'surveys',
    p_related_module_id: normalizedModuleId,
    p_related_record_id: normalizedRecordId,
  });
  if (tokenError) throw tokenError;

  const token = normalizeText((tokenResult as any)?.token);
  if (!token) throw new Error('SURVEY_WEB_FORM_LINK_NOT_CREATED');

  return buildWebFormPublicPath(normalizeText(webForm.route_slug), token);
};
