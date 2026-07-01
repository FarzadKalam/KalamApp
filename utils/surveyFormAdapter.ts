import { buildSurveySubmissionTitle } from './surveyTemplates';
import { createWebFormTemplateRecordSaver } from './webFormTemplateFormAdapter';

export const saveSurveyRecord = createWebFormTemplateRecordSaver({
  moduleId: 'surveys',
  table: 'surveys',
  transformPayload: async (payload) => ({
    ...payload,
    title: buildSurveySubmissionTitle(payload),
  }),
});
