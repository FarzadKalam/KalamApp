import { describe, expect, it } from 'vitest';
import { canAddAiDynamicOption, getAiRecordRequiredQuestions, hasAiStructuredAction, hydrateAiRecordOptions, prepareAiRecordOptions, resolveAiRecordSchema } from './ai-record-contract';
import { heuristicSelectAgentsAndCapabilities } from './ai-agent-kernel';
import { buildAiQuestionAnswer, normalizeAiQuestions, presentAiQuestionResponse } from './ai-questions';

const base = { moduleId: 'marketing_leads', fields: [
  { key: 'name', label: 'عنوان لید', type: 'text', required: true },
  { key: 'source', label: 'منبع سرنخ', type: 'select', dynamicOptionsCategory: 'lead_source' },
  { key: 'city', label: 'شهر', type: 'select', dynamicOptionsCategory: 'cities' },
  { key: 'status', label: 'وضعیت', type: 'status', defaultValue: 'draft', options: [{ label: 'پیش‌نویس', value: 'draft' }] },
], tables: [] };

describe('shared operational intake', () => {
  it.each(['sales_leads', 'purchase_supply', 'hr_manager', 'reservation', 'project_process'] as const)('keeps explicitly addressed %s when input mentions Instagram', (agent) => {
    const route = heuristicSelectAgentsAndCapabilities({ message: 'اطلاعات مشتری از دایرکت اینستاگرام را ثبت کن', explicitAgents: [agent] });
    expect(route.agents).toEqual([agent]);
  });
  it('keeps explicitly requested collaboration without adding a coordinator', () => {
    expect(heuristicSelectAgentsAndCapabilities({ message: 'مشتری اینستاگرام', explicitAgents: ['sales_leads', 'customer_response'] }).agents).toEqual(['sales_leads', 'customer_response']);
  });
  it('never classifies record or process execution as plain primary-model chat', () => {
    expect(hasAiStructuredAction(['record_creation'])).toBe(true);
    expect(hasAiStructuredAction(['process_operation'])).toBe(true);
    expect(hasAiStructuredAction(['document_analysis'])).toBe(false);
  });
  it('uses stored dynamic values for Persian labels instead of erasing extracted fields', () => {
    const schema = hydrateAiRecordOptions(base, [{ category: 'lead_source', label: 'دایرکت اینستاگرام', value: 'instagram_direct' }], true);
    const result = prepareAiRecordOptions([{ fields: { name: 'سالن مهدخت', source: 'دایرکت اینستاگرام' } }], schema, true);
    expect(result.records[0].fields.source).toBe('instagram_direct');
    expect(result.proposals).toEqual([]);
    expect(getAiRecordRequiredQuestions(result.records, schema, false)).toEqual([]);
  });
  it('prepares multiple create/edit drafts and deduplicates option additions', () => {
    const drafts = [
      { record_id: 'existing-a', fields: { name: 'سالن اول', city: 'گلبهار' } },
      { record_id: 'existing-b', fields: { name: 'سالن دوم', city: 'گلبهار' } },
    ];
    const prepared = prepareAiRecordOptions(drafts, base, true);
    expect(prepared.records.map((record) => record.record_id)).toEqual(['existing-a', 'existing-b']);
    expect(prepared.proposals).toEqual([{ fieldKey: 'city', fieldLabel: 'شهر', category: 'cities', label: 'گلبهار', value: 'گلبهار' }]);
    expect(prepared.schema.fields.find((field: any) => field.key === 'city').options).toContainEqual({ label: 'گلبهار', value: 'گلبهار' });
    expect(base.fields[2]).not.toHaveProperty('options');
  });
  it('does not silently accept a missing option without settings access', () => {
    expect(canAddAiDynamicOption(undefined)).toBe(false);
    expect(canAddAiDynamicOption({ edit: true, fields: { __module_settings: false } })).toBe(false);
    const result = prepareAiRecordOptions([{ fields: { city: 'گلبهار' } }], base, false);
    expect(result.proposals).toEqual([]);
    expect(result.questions).toHaveLength(1);
  });
  it('keeps fixed status options closed even for settings editors', () => {
    expect(prepareAiRecordOptions([{ fields: { status: 'وضعیت ساختگی' } }], base, true).questions).toHaveLength(1);
  });
  it('reads custom fields and prevents protected or denied fields from becoming writable', () => {
    const schema = resolveAiRecordSchema(base, { fields: [
      { key: 'custom_source', labels: { fa: 'منبع اختصاصی' }, type: 'select', dynamicOptionsCategory: 'custom_sources' },
      { key: 'org_id', type: 'text' }, { key: 'secret', type: 'text' }, { key: 'inactive', type: 'text', isActive: false },
    ] }, { fields: { secret: false } });
    expect(schema.fields.map((field: any) => field.key)).toEqual(['name', 'source', 'city', 'status', 'custom_source']);
    expect(schema.fields.at(-1).label).toBe('منبع اختصاصی');
  });
  it('asks only missing required fields and allows partial edits', () => {
    expect(getAiRecordRequiredQuestions([{ fields: { source: 'instagram' } }], base, false)).toEqual(['لطفاً «عنوان لید» را مشخص کنید.']);
    expect(getAiRecordRequiredQuestions([{ fields: { source: 'instagram' } }], base, true)).toEqual([]);
  });
});

describe('interactive questions', () => {
  it('preserves options, supports plain questions and hides internal record identities', () => {
    const questions = normalizeAiQuestions([{ title: 'مسئول پیگیری؟', options: ['خودم', 'مدیر فروش'] }, 'کدام درخواست؟', { title: 'کدام درخواست؟' }]);
    expect(questions).toHaveLength(2);
    expect(questions[0].options).toEqual(['خودم', 'مدیر فروش']);
    expect(buildAiQuestionAnswer(questions, { question_1: 'همکار دیگری', question_2: 'تبلیغات' })).toContain('پاسخ: همکار دیگری');
    expect(normalizeAiQuestions(['مورد 11111111-1111-4111-8111-111111111111'])[0].title).toBe('مورد');
  });
  it('presents structured questions as readable text and preserves normal prose', () => {
    expect(presentAiQuestionResponse('{"reply":"یک مورد مبهم است","questions":[{"title":"نام؟"}]}')).toEqual({ answer: 'یک مورد مبهم است', questions: [{ id: 'question_1', title: 'نام؟', options: [] }] });
    expect(presentAiQuestionResponse('پاسخ عادی')).toEqual({ answer: 'پاسخ عادی', questions: [] });
  });
});
