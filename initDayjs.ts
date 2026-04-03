import dayjs from "dayjs";
import jalaliday from "jalaliday/dayjs";
import updateLocale from "dayjs/plugin/updateLocale";
import "dayjs/locale/fa";

dayjs.extend(jalaliday);
dayjs.extend(updateLocale);

dayjs.calendar("jalali");

const jalaliMonths = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

dayjs.updateLocale("fa", {
  months: jalaliMonths,
  calendar: {
    jalali: {
      months: jalaliMonths,
      monthsShort: jalaliMonths,
    },
  },
  weekdays: [
    "یکشنبه",
    "دوشنبه",
    "سه‌شنبه",
    "چهارشنبه",
    "پنجشنبه",
    "جمعه",
    "شنبه",
  ],
  weekStart: 6,
});

dayjs.locale("fa");
