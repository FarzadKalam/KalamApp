import { describe, expect, it } from 'vitest';
import {
  buildWebFormPublicPath,
  findDuplicateWebFormTargetKeys,
  formatWebFormOptionsText,
  formatWebFormTargetFieldLabel,
  getWebFormDuplicateFieldOptions,
  getWebFormRecordBoundFieldEntries,
  getWebFormModuleDefaultValues,
  getMissingWebFormRequiredFields,
  getSuggestedWebFormTargetFields,
  getWebFormTargetFields,
  normalizeWebFormConfig,
  normalizeWebFormFieldRecord,
  isWebFormCurrentEmployeeDefaultField,
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

  it('normalizes choice and progress settings for public web form fields', () => {
    const choiceField = normalizeWebFormFieldRecord({
      field_key: 'favorite_color',
      label: 'رنگ مورد علاقه',
      field_type: 'select',
      config: {
        allow_other: true,
        allow_none: true,
      },
    });
    const progressField = normalizeWebFormFieldRecord({
      field_key: 'score',
      label: 'امتیاز',
      field_type: 'number',
      config: {
        show_progress_bar: true,
        progress_max: '50',
      },
    });

    expect(choiceField.config?.allow_other).toBe(true);
    expect(choiceField.config?.allow_none).toBe(true);
    expect(progressField.config?.show_progress_bar).toBe(true);
    expect(progressField.config?.progress_max).toBe(50);
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

  it('ranks suggested fields by required, key, and table-column metadata', () => {
    const leaveSuggested = getSuggestedWebFormTargetFields('leave_requests');
    expect(leaveSuggested.slice(0, 2).map((item) => item.value)).toEqual(['start_date', 'end_date']);

    const employeeSuggested = getSuggestedWebFormTargetFields('employees');
    const firstNameField = employeeSuggested.find((item) => item.value === 'first_name');
    const systemCodeField = employeeSuggested.find((item) => item.value === 'system_code');
    const mobileField = employeeSuggested.find((item) => item.value === 'mobile_1');

    expect(firstNameField?.isKeyField).toBe(true);
    expect(firstNameField?.isSuggested).toBe(true);
    expect(firstNameField?.suggestionPriority).toBe(2);
    expect(systemCodeField?.isTableColumn).toBe(true);
    expect(systemCodeField?.suggestionPriority).toBe(3);
    expect(mobileField?.isTableColumn).toBe(true);
  });

  it('adds upload targets and keeps relation fields internal-only', () => {
    const publicTargets = getWebFormTargetFields('customers', { accessScope: 'public' });
    const internalTargets = getWebFormTargetFields('customers', { accessScope: 'internal' });
    const recruitmentTargets = getWebFormTargetFields('recruitment_applicants', { accessScope: 'public' });
    const applicantImageField = recruitmentTargets.find((item) => item.value === 'image_url');
    const applicantStatusField = recruitmentTargets.find((item) => item.value === 'status');

    expect(publicTargets.map((item) => item.value)).toContain('__record_image__');
    expect(publicTargets.map((item) => item.value)).toContain('__record_files__');
    expect(publicTargets.some((item) => item.inferredType === 'relation')).toBe(false);
    expect(internalTargets.some((item) => item.inferredType === 'relation')).toBe(true);
    expect(applicantImageField?.inferredType).toBe('image');
    expect(applicantImageField?.isVirtual).toBe(false);
    expect(applicantStatusField?.hasModuleDefault).toBe(true);
    expect(applicantStatusField?.isManaged).toBe(false);
  });

  it('shows the related module name beside every relation target field', () => {
    const deliveryTargets = getWebFormTargetFields('delivery_forms', { accessScope: 'internal' });
    const customerReceiver = deliveryTargets.find((item) => item.value === 'received_by_customer_id');
    const employeeReceiver = deliveryTargets.find((item) => item.value === 'received_by_employee_id');

    expect(formatWebFormTargetFieldLabel(customerReceiver!)).toBe('تحویل‌گیرنده (مشتریان)');
    expect(formatWebFormTargetFieldLabel(employeeReceiver!)).toBe('تحویل‌گیرنده (کارکنان)');
  });

  it('exposes module-required and module-default metadata for managed web form fields', () => {
    const attendanceTargets = getWebFormTargetFields('attendance_logs');
    const internalAttendanceTargets = getWebFormTargetFields('attendance_logs', { accessScope: 'internal' });
    const logTypeField = attendanceTargets.find((item) => item.value === 'log_type');
    const sourceTypeField = attendanceTargets.find((item) => item.value === 'source_type');
    const employeeField = internalAttendanceTargets.find((item) => item.value === 'employee_id');

    expect(logTypeField?.isManaged).toBe(true);
    expect(logTypeField?.hasModuleDefault).toBe(true);
    expect(logTypeField?.moduleDefaultValue).toBe('check_in');
    expect(sourceTypeField?.moduleDefaultValue).toBe('web_form');
    expect(employeeField?.inferredType).toBe('relation');
    expect(getWebFormModuleDefaultValues('attendance_logs')).toMatchObject({
      log_type: 'check_in',
      source_type: 'web_form',
    });

    const leaveTargets = getWebFormTargetFields('leave_requests');
    const leaveStatusField = leaveTargets.find((item) => item.value === 'status');
    const leaveStartDateField = leaveTargets.find((item) => item.value === 'start_date');
    expect(leaveStatusField).toBeUndefined();
    expect(leaveStartDateField?.isModuleRequired).toBe(true);
    expect(formatWebFormTargetFieldLabel(leaveStartDateField!)).toBe('از تاریخ و زمان *');
    expect(getWebFormModuleDefaultValues('leave_requests')).toMatchObject({
      status: 'pending',
    });
  });

  it('resolves field type from the current target module instead of stale saved metadata', () => {
    expect(resolveWebFormFieldType('attendance_logs', 'manual_check_in_time', 'time')).toBe('datetime');
    expect(resolveWebFormFieldType('surveys', 'favorite_aspects', 'select')).toBe('multi_select');
    expect(resolveWebFormFieldType('surveys', 'branch_location', 'text')).toBe('location');
    expect(resolveWebFormFieldType('customers', '__record_image__', 'text')).toBe('image');
    expect(resolveWebFormFieldType('customers', '__record_files__', 'text')).toBe('file');
    expect(resolveWebFormFieldType(undefined, undefined, 'percentage')).toBe('percentage');
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

  it('recognizes current employee defaults only for internal employee relations', () => {
    const field = normalizeWebFormFieldRecord(
      {
        field_key: 'employee_id',
        target_field_key: 'employee_id',
        field_type: 'relation',
        label: 'کارمند مرتبط',
        config: { default_to_current_employee: true },
      },
      0,
      { targetModuleId: 'leave_requests' },
    );

    expect(isWebFormCurrentEmployeeDefaultField(field, 'leave_requests', 'internal')).toBe(true);
    expect(isWebFormCurrentEmployeeDefaultField(field, 'leave_requests', 'public')).toBe(false);

    const customerField = normalizeWebFormFieldRecord(
      {
        field_key: 'customer_id',
        target_field_key: 'customer_id',
        field_type: 'relation',
        label: 'مشتری',
        config: { default_to_current_employee: true },
      },
      0,
      { targetModuleId: 'invoices' },
    );

    expect(isWebFormCurrentEmployeeDefaultField(customerField, 'invoices', 'internal')).toBe(false);
  });

  it('detects duplicate target-field mappings before save', () => {
    expect(findDuplicateWebFormTargetKeys([
      { target_field_key: 'mobile_1' },
      { target_field_key: 'first_name' },
      { target_field_key: 'mobile_1' },
      { target_field_key: 'system_code' },
      { target_field_key: 'system_code' },
    ])).toEqual(['mobile_1', 'system_code']);
  });

  it('keeps original indexes when record fields are separated by survey template fields', () => {
    const fields = [
      { target_field_key: 'overall_experience', config: { binding_type: 'record_field' } },
      { field_key: 'experience_reason', target_field_key: null, config: { binding_type: 'template_field' } },
      { target_field_key: 'follow_up_consent', config: { binding_type: 'record_field' } },
    ];

    expect(getWebFormRecordBoundFieldEntries(fields)).toEqual([
      expect.objectContaining({ index: 0, targetFieldKey: 'overall_experience' }),
      expect.objectContaining({ index: 2, targetFieldKey: 'follow_up_consent' }),
    ]);
  });
});
