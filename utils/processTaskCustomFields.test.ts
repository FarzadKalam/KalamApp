import { describe, expect, it } from 'vitest';
import { FieldType } from '../types';
import { getMissingRequiredProcessTaskCustomFields } from './processTaskCustomFields';

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
});
