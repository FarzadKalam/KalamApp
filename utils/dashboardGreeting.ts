export const getDashboardGreetingFa = (date = new Date(), timeZone = 'Asia/Tehran') => {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(date));
  if (hour >= 5 && hour < 11) return 'صبحت بخیر';
  if (hour >= 11 && hour < 14) return 'ظهرت بخیر';
  if (hour >= 14 && hour < 18) return 'عصرت بخیر';
  return 'شبت بخیر';
};
