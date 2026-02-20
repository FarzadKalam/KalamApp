import dayjs from "dayjs";
import jalaliday from "jalaliday/dayjs";
import updateLocale from "dayjs/plugin/updateLocale";
import "dayjs/locale/fa";

// 1. فعال‌سازی پلاگین‌ها
dayjs.extend(jalaliday);
dayjs.extend(updateLocale);

// 2. تنظیم تقویم
dayjs.calendar("jalali");

// 3. تزریق اجباری نام ماه‌ها (این همان چیزی است که جلوی خطای reading '10' را می‌گیرد)
const jalaliMonths = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"
];

dayjs.updateLocale("fa", {
  months: jalaliMonths,
  // برای اطمینان بیشتر، در تقویم jalali هم تزریق می‌کنیم
  calendar: {
    jalali: {
      months: jalaliMonths,
      monthsShort: jalaliMonths,
    }
  },
  weekdays: [
    "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"
  ],
  weekStart: 6,
});

// 4. ست کردن زبان
dayjs.locale("fa");

console.log("✅ Dayjs Jalali Config Loaded Successfully");