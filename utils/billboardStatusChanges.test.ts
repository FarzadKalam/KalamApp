import { describe, expect, it } from 'vitest';
import { billboardConfig } from '../modules/billboardsConfig';
import { billboardStatusChangesConfig } from '../modules/billboardStatusChangesConfig';
import { withProcessModuleSupport } from './processModuleSupport';
import {
  BILLBOARD_OCCUPANCY_STATUS_VALUES,
  BILLBOARD_STATUS_OPTIONS,
  isBillboardOccupancyStatus,
} from './billboardStatusChanges';

describe('قرارداد تغییر وضعیت تبلیغات محیطی', () => {
  it('همه وضعیت‌های عملیاتی موردنیاز را با برچسب فارسی ارائه می‌کند', () => {
    expect(BILLBOARD_STATUS_OPTIONS.map((item) => item.value)).toEqual([
      'free', 'oral_reserve', 'final_reserve', 'in_line', 'opening',
      'near_finish', 'opening_deadline_ended', 'pickup_queue', 'inactive', 'blocked',
    ]);
    expect(BILLBOARD_STATUS_OPTIONS.every((item) => item.label.trim().length > 0)).toBe(true);
  });

  it('اطلاعات رزرو را فقط برای وضعیت‌های دارای اشغال اجباری می‌داند', () => {
    expect(isBillboardOccupancyStatus('opening')).toBe(true);
    expect(isBillboardOccupancyStatus('pickup_queue')).toBe(true);
    expect(isBillboardOccupancyStatus('free')).toBe(false);
    expect(isBillboardOccupancyStatus('blocked')).toBe(false);
    expect(BILLBOARD_OCCUPANCY_STATUS_VALUES.has('final_reserve')).toBe(true);
  });

  it('تابلو را به مسیر درخواست تغییر وضعیت و خود درخواست را به فرآیند V2 متصل می‌کند', () => {
    expect(billboardConfig.actionButtons?.some((action) => action.id === 'request_status_change')).toBe(true);
    expect(billboardStatusChangesConfig.disableInlineFieldEditing).toBe(true);
    expect(billboardStatusChangesConfig.actionButtons?.some((action) => action.id === 'approve_billboard_status_change')).toBe(true);
    expect(billboardStatusChangesConfig.fields.find((field) => field.key === 'customer_id')?.labels.fa).toBe('نام مشتری');
    expect(billboardStatusChangesConfig.fields.find((field) => field.key === 'marketing_lead_id')?.relationConfig?.targetModule).toBe('marketing_leads');
    expect(billboardStatusChangesConfig.fields.find((field) => field.key === 'assignee_id')).toMatchObject({ readonly: true, relationConfig: { targetModule: 'profiles' } });
    expect(billboardStatusChangesConfig.fields.some((field) => field.key === 'requested_by')).toBe(false);
    expect(billboardStatusChangesConfig.fields.find((field) => field.key === 'approved_by')).toMatchObject({ readonly: true, relationConfig: { targetModule: 'profiles' } });
    expect(billboardConfig.fields.find((field) => field.key === 'marketing_lead_id')?.readonly).toBe(true);

    const processReadyModule = withProcessModuleSupport(billboardStatusChangesConfig);
    expect(processReadyModule.fields.some((field) => field.key === 'process_template_id')).toBe(true);
    expect(processReadyModule.fields.some((field) => field.key === 'execution_process_draft')).toBe(true);
  });
});
