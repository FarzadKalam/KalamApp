import { describe, expect, it } from 'vitest';
import {
  buildWebFormPublicPath,
  formatWebFormOptionsText,
  getMissingWebFormRequiredFields,
  normalizeWebFormConfig,
  normalizeWebFormFieldRecord,
  parseWebFormOptionsText,
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
      default_record_values: { status: 'new', description: 'متن فارسی' },
    });
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
});
