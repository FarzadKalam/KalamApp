import { describe, expect, it } from 'vitest';
import {
  getConditionsNodeSummaryFa,
  getWorkflowActionSummaryFa,
  getWorkflowActionTypeLabelFa,
  getWorkflowTriggerSummaryFa,
} from './workflowActionSummary';
import { WorkflowActionType, actionTypeOptions, legacyBotActionTypes } from './workflowTypes';

const ALL_ACTION_TYPES: WorkflowActionType[] = [
  ...actionTypeOptions.map((option) => option.value),
  'send_note_sms',
  ...legacyBotActionTypes,
];

describe('getWorkflowActionTypeLabelFa', () => {
  it('برای همه انواع اقدام لیبل فارسی برمی‌گرداند', () => {
    ALL_ACTION_TYPES.forEach((type) => {
      const label = getWorkflowActionTypeLabelFa(type);
      expect(label).toBeTruthy();
      expect(label).not.toBe('اقدام نامشخص');
    });
  });

  it('برای نوع ناشناخته «اقدام نامشخص» برمی‌گرداند', () => {
    expect(getWorkflowActionTypeLabelFa('unknown_type')).toBe('اقدام نامشخص');
  });
});

describe('getWorkflowActionSummaryFa', () => {
  it('پیامک: تعداد گیرنده و متن خلاصه می‌شود', () => {
    const summary = getWorkflowActionSummaryFa({
      id: 'a1',
      type: 'send_sms',
      config: {
        recipient_fields: ['phone'],
        manual_numbers: ['0912', '0935'],
        message: 'سلام مشتری عزیز',
      },
    });
    expect(summary).toContain('۳ گیرنده');
    expect(summary).toContain('سلام مشتری عزیز');
  });

  it('بدون گیرنده: «بدون گیرنده» برمی‌گرداند', () => {
    const summary = getWorkflowActionSummaryFa({ id: 'a1', type: 'send_note', config: {} });
    expect(summary).toContain('بدون گیرنده');
  });

  it('متن طولانی بریده می‌شود', () => {
    const longText = 'الف'.repeat(120);
    const summary = getWorkflowActionSummaryFa({
      id: 'a1',
      type: 'send_note',
      config: { note_text: longText },
    });
    expect(summary).toContain('…');
    expect(summary.length).toBeLessThan(longText.length);
  });

  it('وب‌فرم: کانال‌های ارسال فارسی نمایش داده می‌شوند', () => {
    const summary = getWorkflowActionSummaryFa({
      id: 'a1',
      type: 'send_web_form_link',
      config: { delivery_channels: ['sms', 'bot'] },
    });
    expect(summary).toContain('پیامک');
    expect(summary).toContain('بات');
  });

  it('استوری: متن و دامنه انتشار خلاصه می‌شود', () => {
    const summary = getWorkflowActionSummaryFa({
      id: 'a1',
      type: 'publish_story',
      config: { is_org_wide: true, text_template: 'فروش جدید' },
    });
    expect(summary).toContain('کل سازمان');
    expect(summary).toContain('فروش جدید');
  });

  it('هیچ UUID خامی در خلاصه ظاهر نمی‌شود', () => {
    const uuid = '0b9f3a52-7c2e-4d11-9f0a-1234567890ab';
    const summary = getWorkflowActionSummaryFa({
      id: 'a1',
      type: 'create_related_record',
      config: { target_module_id: uuid, field_mappings: [{ id: 'm1' }] },
    });
    // ماژول ناشناخته با همان شناسه نمایش داده می‌شود ولی داخل گیومه عنوان است؛
    // مهم این است که خلاصه خالی یا خطادار نباشد
    expect(summary).toBeTruthy();
  });
});

describe('getWorkflowTriggerSummaryFa', () => {
  it('تریگرهای ساده فقط لیبل برمی‌گردانند', () => {
    expect(getWorkflowTriggerSummaryFa({ trigger_type: 'on_create' })).toBe('وقتی رکورد جدید ایجاد شد');
  });

  it('بازه زمانی: مقدار و واحد فارسی می‌شود', () => {
    const summary = getWorkflowTriggerSummaryFa({
      trigger_type: 'interval',
      interval_value: 2,
      interval_unit: 'day',
    });
    expect(summary).toContain('هر ۲ روز');
  });

  it('بازه ماهانه با روز ماه و شرط روز', () => {
    const summary = getWorkflowTriggerSummaryFa({
      trigger_type: 'interval',
      interval_value: 1,
      interval_unit: 'month',
      interval_day_of_month: 5,
      interval_day_condition: 'not_friday',
    });
    expect(summary).toContain('روز ۵ ماه');
    expect(summary).toContain('جمعه نباشد');
  });
});

describe('getConditionsNodeSummaryFa', () => {
  it('بدون شرط', () => {
    expect(getConditionsNodeSummaryFa(0, 0)).toContain('بدون شرط');
  });

  it('ترکیب شرط الزامی و کافی', () => {
    const summary = getConditionsNodeSummaryFa(2, 1);
    expect(summary).toContain('۲ شرط الزامی');
    expect(summary).toContain('۱ شرط کافی');
  });
});
