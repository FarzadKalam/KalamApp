/** Shared presentation policy, independent of React, tenants and delivery APIs. */
export const FEEDBACK_POLICY = Object.freeze({
  maxVisible: 3,
  maxActions: 3,
  width: 350,
  viewportGutter: 32,
  expandDelayMs: 150,
  durations: Object.freeze({ success: 4000, info: 4000, warning: 4000, error: 6000, loading: null }),
  recordCreatedMs: 10000,
  notificationHeadsUpMs: 5000,
  announcementDebounceMs: 250,
  labels: Object.freeze({ message: 'پیام سامانه', notification: 'اعلان سامانه', failure: 'انجام این کار ناموفق بود؛ دوباره تلاش کنید.', success: 'عملیات با موفقیت انجام شد', undo: 'انصراف', pending: 'در انتظار انجام عملیات' }),
});
