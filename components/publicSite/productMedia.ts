export const PRODUCT_MEDIA = {
  dashboard: { src: '/assets/product/dashboard.png', alt: 'داشبورد واقعی، هدف‌های فروش و دستیار هوشمند سازمان', width: 2997, height: 1608 },
  projects: { src: '/assets/product/projects.png', alt: 'پروژه‌ها و مراحل اجرای کار در نمای جدولی', width: 2999, height: 1611 },
  map: { src: '/assets/product/map.png', alt: 'نمای نقشه و موقعیت رکوردهای تبلیغات محیطی', width: 2999, height: 1613 },
  calendar: { src: '/assets/product/calendar.png', alt: 'فاکتورهای فروش در تقویم شمسی', width: 2999, height: 1613 },
  reports: { src: '/assets/product/reports.png', alt: 'گزارش‌های مالی، فروش و عملکرد کارکنان', width: 2999, height: 1620 },
  assistant: { src: '/assets/product/assistant.png', alt: 'گفتگو با دستیار هوشمند سازمان و تاریخچهٔ گفتگوها', width: 2999, height: 1613 },
  processes: { src: '/assets/product/processes.png', alt: 'مراحل اجرای فرآیندها، مسئول‌ها و وضعیت هر مرحله', width: 2999, height: 1608, framing: 'process' },
  messaging: { src: '/assets/product/messaging.png', alt: 'صندوق پیام‌ها، گفتگوهای تیمی و پیگیری روی پیام', width: 2997, height: 1613 },
  bots: { src: '/assets/product/bots.png', alt: 'گفتگوهای متصل به بات و پیام‌های ثبت سفارش', width: 2999, height: 1615, framing: 'bot' },
} as const;

export type ProductMediaKey = keyof typeof PRODUCT_MEDIA;
