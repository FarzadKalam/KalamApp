export const BILLBOARD_STATUS_CHANGES_MODULE_ID = 'billboard_status_changes';
export const BILLBOARD_STATUS_MANAGEMENT_PLAN_FEATURE = 'billboard_status_management';
export const BILLBOARD_STATUS_APPROVAL_ACTION = 'approve_billboard_status_change';

export const BILLBOARD_STATUS_OPTIONS = [
  { label: 'آزاد', value: 'free', color: 'green' },
  { label: 'رزرو شفاهی', value: 'oral_reserve', color: 'orange' },
  { label: 'رزرو قطعی', value: 'final_reserve', color: 'pink' },
  { label: 'در صف نصب', value: 'in_line', color: 'blue' },
  { label: 'در حال اکران', value: 'opening', color: 'red' },
  { label: 'نزدیک به اتمام', value: 'near_finish', color: 'orange' },
  { label: 'پایان مهلت اکران', value: 'opening_deadline_ended', color: 'volcano' },
  { label: 'در صف جمع‌آوری', value: 'pickup_queue', color: 'gold' },
  { label: 'غیرفعال', value: 'inactive', color: 'default' },
  { label: 'مسدود', value: 'blocked', color: 'red' },
] as const;

export const BILLBOARD_STATUS_CHANGE_REQUEST_OPTIONS = [
  { label: 'در انتظار تأیید', value: 'pending_approval', color: 'gold' },
  { label: 'تأییدشده', value: 'approved', color: 'green' },
  { label: 'ردشده', value: 'rejected', color: 'red' },
  { label: 'نیازمند بازبینی', value: 'needs_review', color: 'orange' },
] as const;

export const BILLBOARD_OCCUPANCY_STATUS_VALUES = new Set<string>([
  'oral_reserve', 'final_reserve', 'in_line', 'opening', 'near_finish', 'opening_deadline_ended', 'pickup_queue',
]);

export const isBillboardOccupancyStatus = (value: unknown) =>
  BILLBOARD_OCCUPANCY_STATUS_VALUES.has(String(value || '').trim());
