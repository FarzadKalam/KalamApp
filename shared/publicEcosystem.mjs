// Public product catalog only: never populate this from tenant connections or secrets.
// Release evidence and maintenance rules: docs/PUBLIC_ECOSYSTEM_FA.md.
const logo = (name) => `/assets/ecosystem/${name}`;
export const ECOSYSTEM_STATUS_LABELS = {
  technology: 'زیرساخت محصول',
  supported: 'پشتیبانی می‌شود',
  development: 'در حال توسعه',
};
export const PUBLIC_ECOSYSTEM_GROUPS = [
  {
    id: 'infrastructure', title: 'زیرساخت', caption: 'پایه‌های یک فضای کار یکپارچه',
    description: 'فناوری‌های پایهٔ محصول؛ برای نگهداری داده‌ها، ارتباط لحظه‌ای و اجرای سرویس‌ها.',
    radius: 72, duration: 55, reverse: false,
    items: [
      { id: 'supabase', name: 'سوپابیس', logo: logo('supabase.svg'), status: 'technology', description: 'بستر احراز هویت، دسترسی به داده‌ها و ارتباط لحظه‌ای.' },
      { id: 'postgresql', name: 'پستگرس‌کیوال', logo: logo('postgresql.svg'), status: 'technology', description: 'پایگاه دادهٔ رابطه‌ای با تفکیک اطلاعات و دسترسی‌های سازمان‌ها.' },
      { id: 'docker', name: 'داکر', logo: logo('docker.svg'), status: 'technology', description: 'اجرای سرویس‌های زیرساخت در محیط‌های مجزا و قابل نگهداری.' },
      { id: 'nginx', name: 'انجین‌اکس', logo: logo('nginx.svg'), status: 'technology', description: 'ارائهٔ سایت و هدایت درخواست‌ها به سرویس‌های محصول.' },
    ],
  },
  {
    id: 'ai', title: 'هوش مصنوعی', caption: 'مدل‌های متنوع، متناسب با هر کار',
    description: 'خانواده‌های مدل در فهرست محصول؛ انتخاب مدل و دسترسی به آن به تنظیمات و امکانات سازمان بستگی دارد.',
    radius: 134, duration: 75, reverse: true,
    items: [
      { id: 'openai', name: 'اوپن‌ای‌آی', logo: logo('openai.svg'), status: 'supported', description: 'مدل‌های گفتگو و تحلیل، ساخت تصویر و تبدیل گفتار به متن.' },
      { id: 'claude', name: 'کلود', logo: logo('claude.svg'), status: 'supported', description: 'خانوادهٔ مدل‌های آنتروپیک برای گفتگو، تحلیل و کارهای ایجنت‌ها.' },
      { id: 'gemini', name: 'جمینای', logo: logo('gemini.svg'), status: 'supported', description: 'مدل‌های گوگل برای تحلیل، تصویر و تولید صدا؛ مدل‌های ویدیویی گوگل نیز در فهرست محصول هستند.' },
      { id: 'qwen', name: 'کیوِن', logo: logo('qwen.svg'), status: 'supported', description: 'مدل‌های گفتگو و تحلیل در فهرست انتخاب ایجنت‌ها.' },
      { id: 'deepseek', name: 'دیپ‌سیک', logo: logo('deepseek.svg'), status: 'supported', description: 'مدل‌های تحلیل و پاسخ‌گویی برای وظایف ایجنت‌ها.' },
      { id: 'grok', name: 'گراک', logo: logo('grok.svg'), status: 'supported', description: 'خانوادهٔ مدل‌های xAI برای استدلال و تحلیل.' },
      { id: 'elevenlabs', name: 'الون‌لبز', logo: logo('elevenlabs.svg'), status: 'supported', description: 'تولید صدای طبیعی در مدل‌های صوتی قابل انتخاب.' },
      { id: 'nvidia', name: 'انویدیا', logo: logo('nvidia.svg'), status: 'supported', description: 'خانوادهٔ نماترون در فهرست مدل‌های ایجنت‌ها.' },
      { id: 'glm', name: 'جی‌ال‌ام', logo: logo('glm.svg'), status: 'supported', description: 'مدل‌های سریع گفتگو و پردازش وظایف ایجنت‌ها.' },
    ],
  },
  {
    id: 'communications', title: 'ارتباطات', caption: 'از پیام و دایرکت تا تماس',
    description: 'پیام‌رسان‌ها، سامانه‌های پیامکی و تماس؛ هر اتصال با حساب و تنظیمات همان سازمان راه‌اندازی می‌شود.',
    radius: 196, duration: 95, reverse: false,
    items: [
      { id: 'instagram', name: 'اینستاگرام', logo: logo('instagram.svg'), status: 'supported', description: 'مدیریت دایرکت و کامنت حساب‌های متصل با ارائه‌دهندگان پشتیبانی‌شده.' },
      { id: 'telegram', name: 'تلگرام', logo: '/assets/bot-platforms/telegram.svg', status: 'supported', description: 'ارسال و دریافت پیام با بات رسمی تلگرام و اتصال گفتگو به کارهای سازمان.' },
      { id: 'bale', name: 'بله', logo: '/assets/bot-platforms/bale.svg', status: 'supported', description: 'ارسال و دریافت پیام از طریق بات پیام‌رسان بله.' },
      { id: 'rubika', name: 'روبیکا', logo: '/assets/bot-platforms/rubika.svg', status: 'supported', description: 'ارتباط از طریق بات رسمی روبیکا و دریافت پیام‌های ورودی.' },
      { id: 'email', name: 'ایمیل سازمانی', icon: 'mail', status: 'supported', description: 'اتصال حساب ایمیل موجود یا تهیهٔ صندوق میزبانی‌شده؛ ارسال، دریافت و پیگیری نامه‌ها.' },
      { id: 'melipayamak', name: 'ملی‌پیامک', logo: logo('melipayamak.png'), status: 'supported', description: 'ارسال پیامک، دریافت پیامک ورودی و پیگیری وضعیت پیام‌ها از مسیرهای پشتیبانی‌شده.' },
      { id: 'kavenegar', name: 'کاوه‌نگار', logo: logo('kavenegar.ico'), status: 'supported', description: 'ارسال پیامک و بررسی اعتبار با حساب کاوه‌نگار سازمان.' },
      { id: 'telefonchy', name: 'تلفنچی', logo: logo('telefonchy.png'), status: 'supported', description: 'تماس هوشمند و دریافت گزارش تماس با اتصال حساب تلفنچی.' },
      { id: 'whatsapp', name: 'واتساپ', logo: logo('whatsapp.svg'), status: 'development', description: 'اتصال واتساپ در مسیر توسعه است و هنوز قابل استفاده نیست.' },
    ],
  },
  {
    id: 'business', title: 'کسب‌وکار و مالی', caption: 'فروشگاه، پرداخت و حسابداری',
    description: 'ابزارهای فروش، فروشگاه و امور مالی، در کنار یک فضای کار مشترک.',
    radius: 258, duration: 115, reverse: true,
    items: [
      { id: 'wordpress', name: 'وردپرس', logo: logo('wordpress.svg'), status: 'supported', description: 'اتصال سایت وردپرسی از بخش اتصالات فروشگاهی محصول.' },
      { id: 'woocommerce', name: 'ووکامرس', logo: logo('woocommerce.svg'), status: 'supported', description: 'همگام‌سازی کالا، مشتری و سفارش فروشگاه با اتصال ووکامرس.' },
      { id: 'zarinpal', name: 'زرین‌پال', logo: logo('zarinpal.png'), status: 'supported', description: 'راه‌اندازی پرداخت آنلاین با تنظیمات درگاه سازمان و مسیرهای پرداخت پشتیبانی‌شده.' },
      { id: 'taxpayer', name: 'سامانهٔ مؤدیان', icon: 'audit', status: 'supported', description: 'تنظیم اتصال سامانهٔ مؤدیان و ارسال صورتحساب از مسیرهای موجود محصول.' },
      { id: 'mahak', name: 'محک', logo: logo('mahak.png'), status: 'development', description: 'اتصال به نرم‌افزار حسابداری محک در مسیر توسعه است و هنوز قابل استفاده نیست.' },
      { id: 'sepidar', name: 'سپیدار', logo: logo('sepidar.jpg'), status: 'development', description: 'اتصال به نرم‌افزار حسابداری سپیدار در مسیر توسعه است و هنوز قابل استفاده نیست.' },
    ],
  },
];
