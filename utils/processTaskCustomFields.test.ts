import { describe, expect, it } from 'vitest';
import { FieldType } from '../types';
import { getMissingRequiredProcessTaskCustomFields, normalizeProcessTaskCustomField } from './processTaskCustomFields';

describe('getMissingRequiredProcessTaskCustomFields', () => {
  it('returns the required custom fields that are empty', () => {
    const task = {
      recurrence_info: {
        process_task_custom_fields: [
          {
            key: 'meeting_link',
            type: FieldType.TEXT,
            labels: { fa: 'لینک جلسه' },
            validation: { required: true },
          },
          {
            key: 'attendees',
            type: FieldType.MULTI_SELECT,
            labels: { fa: 'شرکت‌کنندگان' },
            validation: { required: true },
          },
          {
            key: 'notes',
            type: FieldType.TEXT,
            labels: { fa: 'توضیحات' },
            validation: { required: false },
          },
        ],
        process_task_custom_field_values: {
          meeting_link: '   ',
          attendees: [],
          notes: '',
        },
      },
    };

    const missing = getMissingRequiredProcessTaskCustomFields(task);

    expect(missing.map((field) => field.key)).toEqual(['meeting_link', 'attendees']);
  });

  it('accepts fallback values already projected onto the task row', () => {
    const task = {
      approval_result: 'رد شد',
      recurrence_info: {
        process_task_custom_fields: [
          {
            key: 'approval_result',
            type: FieldType.TEXT,
            labels: { fa: 'نتیجه تایید' },
            validation: { required: true },
          },
        ],
        process_task_custom_field_values: {},
      },
    };

    expect(getMissingRequiredProcessTaskCustomFields(task)).toEqual([]);
  });

  it('keeps creation and completion requirements as separate process task field flags', () => {
    const completionField = normalizeProcessTaskCustomField({
      key: 'approval_note',
      type: FieldType.TEXT,
      labels: { fa: 'توضیح تایید' },
      validation: { required: true },
    }) as any;
    const creationField = normalizeProcessTaskCustomField({
      key: 'initial_code',
      type: FieldType.TEXT,
      labels: { fa: 'کد اولیه' },
      requiredForCreation: true,
      validation: { required: false },
    }) as any;

    expect(completionField?.validation?.required).toBe(true);
    expect(completionField?.requiredForCompletion).toBe(true);
    expect(completionField?.requiredForCreation).toBeUndefined();
    expect(creationField?.validation?.required).toBe(false);
    expect(creationField?.requiredForCreation).toBe(true);
  });

  it('preserves central relation configuration for process task fields', () => {
    const relationField = normalizeProcessTaskCustomField({
      key: 'project_contact',
      type: FieldType.RELATION,
      labels: { fa: 'مخاطب پروژه' },
      relationConfig: {
        targetModule: 'customers',
        targetField: 'full_name',
        filter: { status: 'active' },
        disableQuickCreate: true,
        sourceModules: [{ targetModule: 'suppliers', targetField: 'business_name', tagLabel: 'تأمین‌کننده' }],
      },
    }) as any;
    const userField = normalizeProcessTaskCustomField({
      key: 'reviewer',
      type: FieldType.USER,
      labels: { fa: 'بازبین' },
    }) as any;

    expect(relationField.relationConfig).toMatchObject({
      targetModule: 'customers',
      targetField: 'full_name',
      filter: { status: 'active' },
      disableQuickCreate: true,
      sourceModules: [{ targetModule: 'suppliers', targetField: 'business_name', tagLabel: 'تأمین‌کننده' }],
    });
    expect(userField.relationConfig).toEqual({ targetModule: 'profiles', targetField: 'full_name' });
  });

  it('requires checked checkbox custom fields when completion is required', () => {
    const baseTask = {
      recurrence_info: {
        process_task_custom_fields: [
          {
            key: 'approved',
            type: FieldType.CHECKBOX,
            labels: { fa: 'تایید شده' },
            validation: { required: true },
          },
        ],
      },
    };

    expect(getMissingRequiredProcessTaskCustomFields({
      ...baseTask,
      recurrence_info: {
        ...baseTask.recurrence_info,
        process_task_custom_field_values: { approved: false },
      },
    }).map((field) => field.key)).toEqual(['approved']);

    expect(getMissingRequiredProcessTaskCustomFields({
      ...baseTask,
      recurrence_info: {
        ...baseTask.recurrence_info,
        process_task_custom_field_values: { approved: true },
      },
    })).toEqual([]);
  });
});
