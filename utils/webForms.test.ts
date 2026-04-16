import { describe, expect, it } from 'vitest';
import {
  buildWebFormPublicPath,
  formatWebFormOptionsText,
  getWebFormDuplicateFieldOptions,
  getMissingWebFormRequiredFields,
  getWebFormTargetFields,
  normalizeWebFormConfig,
  normalizeWebFormFieldRecord,
  parseWebFormOptionsText,
  resolveWebFormFieldType,
} from './webForms';

describe('web form utilities', () => {
  it('normalizes Persian public form config without losing text', () => {
    const config = normalizeWebFormConfig({
      header_title: '  فرم درخواست همکاری  ',
      header_subtitle: 'اطلاعات تماس را وارد کنید',
      submit_label: 'ثبت درخواست',
      success_message: 'درخواست شما ثبت شد',
      default_record_values: { status: 'new', description: 'متن فارسی' },
    });

    expect(config).toEqual({
      header_title: 'فرم درخواست همکاری',
      header_subtitle: 'اطلاعات تماس را وارد کنید',
      submit_label: 'ثبت درخواست',
      success_message: 'درخواست شما ثبت شد',
      success_redirect_url: '',
      display_mode: 'list',
      slide_show_progress: true,
      slide_allow_back: true,
      slide_auto_advance: false,
      duplicate_match_field: '',
      duplicate_strategy: 'allow',
      default_record_values: { status: 'new', description: 'متن فارسی' },
    });
  });

  it('normalizes slide-mode config flags', () => {
    const config = normalizeWebFormConfig({
      display_mode: 'slide',
      slide_show_progress: false,
      slide_allow_back: false,
      slide_auto_advance: true,
    });

    expect(config.display_mode).toBe('slide');
    expect(config.slide_show_progress).toBe(false);
    expect(config.slide_allow_back).toBe(false);
    expect(config.slide_auto_advance).toBe(true);
  });

  it('normalizes field records and select options', () => {
    const field = normalizeWebFormFieldRecord({
      id: 'field-1',
      field_key: 'customer_city',
      label: 'شهر',
      target_field_key: 'city',
      field_type: 'select',
      placeholder: 'انتخاب شهر',
      config: {
        select_options: [
          { label: 'تهران', value: 'tehran' },
          { label: 'اصفهان' },
          { value: 'shiraz' },
          { label: '' },
        ],
      },
    });

    expect(field.label).toBe('شهر');
    expect(field.config?.select_options).toEqual([
      { label: 'تهران', value: 'tehran' },
      { label: 'اصفهان', value: 'اصفهان' },
      { label: 'shiraz', value: 'shiraz' },
    ]);
  });

  it('parses and formats option text with Persian labels', () => {
    const options = parseWebFormOptionsText('تهران|tehran\nاصفهان\n\nشیراز|shiraz');
    expect(options).toEqual([
      { label: 'تهران', value: 'tehran' },
      { label: 'اصفهان', value: 'اصفهان' },
      { label: 'شیراز', value: 'shiraz' },
    ]);
    expect(formatWebFormOptionsText(options)).toBe('تهران|tehran\nاصفهان\nشیراز|shiraz');
  });

  it('keeps public URLs deterministic and required-field checks safe', () => {
    expect(buildWebFormPublicPath('lead-intake')).toBe('/inquiry/lead-intake');
    expect(buildWebFormPublicPath('')).toBe('/inquiry');

    const missing = getMissingWebFormRequiredFields('web_forms', []);
    expect(missing).toEqual([]);
  });

  it('offers duplicate matching only for comparable field types', () => {
    const options = getWebFormDuplicateFieldOptions('surveys');
    const values = options.map((item) => item.value);

    expect(values).toContain('respondent_phone');
    expect(values).toContain('visit_datetime');
    expect(values).toContain('overall_experience');
    expect(values).not.toContain('favorite_aspects');
    expect(values).not.toContain('branch_location');
    expect(values).not.toContain('follow_up_consent');
  });

  it('adds upload targets and keeps relation fields internal-only', () => {
    const publicTargets = getWebFormTargetFields('customers', { accessScope: 'public' });
    const internalTargets = getWebFormTargetFields('customers', { accessScope: 'internal' });

    expect(publicTargets.map((item) => item.value)).toContain('__record_image__');
    expect(publicTargets.map((item) => item.value)).toContain('__record_files__');
    expect(publicTargets.some((item) => item.inferredType === 'relation')).toBe(false);
    expect(internalTargets.some((item) => item.inferredType === 'relation')).toBe(true);
  });

  it('resolves field type from the current target module instead of stale saved metadata', () => {
    expect(resolveWebFormFieldType('attendance_logs', 'manual_check_in_time', 'time')).toBe('datetime');
    expect(resolveWebFormFieldType('surveys', 'favorite_aspects', 'select')).toBe('multi_select');
    expect(resolveWebFormFieldType('surveys', 'branch_location', 'text')).toBe('location');
    expect(resolveWebFormFieldType('customers', '__record_image__', 'text')).toBe('image');
    expect(resolveWebFormFieldType('customers', '__record_files__', 'text')).toBe('file');
    expect(
      normalizeWebFormFieldRecord(
        {
          field_key: 'manual_check_in_time',
          target_field_key: 'manual_check_in_time',
          field_type: 'time',
          label: 'زمان ورود',
        },
        0,
        { targetModuleId: 'attendance_logs' },
      ).field_type,
    ).toBe('datetime');
  });
});
