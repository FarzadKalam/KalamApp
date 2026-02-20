import fa_IR from 'antd/lib/locale/fa_IR';

const jalaliMonths = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

const datePickerLocale: any = {
  ...fa_IR.DatePicker,
  lang: {
    ...fa_IR.DatePicker?.lang,
    locale: 'fa_IR',
    months: jalaliMonths,
    shortMonths: jalaliMonths,
    dayFormat: 'D', // حل مشکل نمایش تاریخ طولانی
    dateFormat: 'YYYY/MM/DD',
    dateTimeFormat: 'YYYY/MM/DD HH:mm:ss',
    monthFormat: 'MMMM',
    monthBeforeYear: true,
    today: 'امروز',
    now: 'اکنون',
    backToToday: 'بازگشت به امروز',
    ok: 'تایید',
    clear: 'پاک کردن',
    month: 'ماه',
    year: 'سال',
    timeSelect: 'انتخاب زمان',
    dateSelect: 'انتخاب تاریخ',
    monthSelect: 'انتخاب ماه',
    yearSelect: 'انتخاب سال',
    previousMonth: 'ماه قبل',
    nextMonth: 'ماه بعد',
    previousYear: 'سال قبل',
    nextYear: 'سال بعد',
  },
  timePickerLocale: {
    ...fa_IR.DatePicker?.timePickerLocale,
  },
};

export const jalaliDatePickerLocale = datePickerLocale;
export const jalaliTimePickerLocale = fa_IR.TimePicker;

const jalaliLocale = {
  ...fa_IR,
  DatePicker: datePickerLocale,
};

export default jalaliLocale;