export type AgentKey =
  | 'lead_orchestrator'
  | 'sales_leads'
  | 'purchase_supply'
  | 'customer_response'
  | 'hr_manager'
  | 'reservation'
  | 'project_process'
  | 'instagrammer'
  | 'system_guide';

export type AgentToneStyle = 'formal' | 'friendly_warm' | 'concise' | 'coaching' | 'custom';

export type AgentOnboardingQuestion = {
  key: string;
  questionFa: string;
  placeholderFa: string;
  policyField: string;
  helperFa?: string;
};

export type AiAgentDefinition = {
  key: AgentKey;
  titleFa: string;
  shortTitleFa: string;
  subtitleFa: string;
  descriptionFa: string;
  badgeColor: string;
  iconKey: string;
  primaryModules: string[];
  optionalModules: string[];
  defaultCapabilities: string[];
  defaultToneStyle: AgentToneStyle;
  supportsBackground: boolean;
  supportsStaffBot: boolean;
  requiredPlanFeatures?: string[];
  defaultBackgroundConfig: {
    enabled: boolean;
    interval_minutes: number;
    cooldown_minutes: number;
    daily_budget_irt: number;
    respect_work_schedule: boolean;
  };
  roleFocusFa: string;
  onboardingQuestions: AgentOnboardingQuestion[];
};

export const AGENT_CONVERSATION_PREFIX = 'agent:';
export const AI_AGENT_PLAN_FEATURE_PREFIX = 'ai_agent:';

export const getAiAgentPlanFeatureKey = (agentKey: AgentKey | string): string =>
  `${AI_AGENT_PLAN_FEATURE_PREFIX}${String(agentKey || '').trim().toLowerCase()}`;

export const RETURN_INVOICE_PARENT_MODULES: Record<string, string> = {
  sales_return_invoices: 'invoices',
  purchase_return_invoices: 'purchase_invoices',
};

export const AGENT_TONE_STYLES: Array<{
  value: AgentToneStyle;
  labelFa: string;
  descriptionFa: string;
}> = [
  {
    value: 'friendly_warm',
    labelFa: 'صمیمی و همراه',
    descriptionFa: 'لحن محترمانه، همدلانه، پیگیر و دلگرم‌کننده برای همکاران و مشتریان',
  },
  {
    value: 'formal',
    labelFa: 'رسمی و اداری',
    descriptionFa: 'لحن دقیق، ساختاریافته و مناسب گزارش‌های مدیریتی و مکاتبات رسمی',
  },
  {
    value: 'concise',
    labelFa: 'کوتاه و اجرایی',
    descriptionFa: 'پاسخ‌های خیلی خلاصه، نکته‌محور و متمرکز بر اقدام بعدی',
  },
  {
    value: 'coaching',
    labelFa: 'مربی‌گرانه و آموزشی',
    descriptionFa: 'توضیح قدم‌به‌قدم، راهنمایی و کمک به یادگیری همکار جدید یا تیم',
  },
  {
    value: 'custom',
    labelFa: 'سفارشی سازمان',
    descriptionFa: 'ترکیب لحن براساس دستورالعمل و سیاست اختصاصی ثبت‌شده همین ایجنت',
  },
];

export const PRICING_ADJUSTMENT_SKILL_META = {
  key: 'pricing_adjustment',
  labelFa: 'تنظیم قیمت',
  descriptionFa: 'افزایش یا کاهش درصدی/مبلغی و همگام‌سازی قیمت کالاها، لیست قیمت‌ها، پکیج‌ها و پیش‌فاکتورهای باز با اخذ تأیید',
} as const;

export const AI_AGENT_CATALOG: readonly AiAgentDefinition[] = [
  {
    key: 'lead_orchestrator',
    titleFa: 'ایجنت راهبر',
    shortTitleFa: 'راهبر',
    subtitleFa: 'هماهنگ‌کننده ایجنت‌ها، مهارت‌ها و تصمیم‌های بین‌بخشی',
    descriptionFa: 'درخواست‌های چندمرحله‌ای، ویس‌ها و سناریوهای ترکیبی را بین فروش، خرید، پروژه، فرآیند، منابع انسانی و رزرواسیون هماهنگ می‌کند و در نبود پاسخ روشن، سؤال دقیق می‌پرسد.',
    badgeColor: '#6366f1',
    iconKey: 'compass',
    primaryModules: ['tasks', 'projects'],
    optionalModules: ['customers', 'invoices', 'purchase_invoices', 'employees', 'reservations', 'process_runs', 'process_templates'],
    defaultCapabilities: ['record_creation', 'process_operation'],
    defaultToneStyle: 'friendly_warm',
    supportsBackground: false,
    supportsStaffBot: true,
    defaultBackgroundConfig: {
      enabled: false,
      interval_minutes: 120,
      cooldown_minutes: 360,
      daily_budget_irt: 50000,
      respect_work_schedule: true,
    },
    roleFocusFa: 'تجزیه سناریوهای پیچیده، هماهنگی ایجنت‌های فعال، رفع ابهام با سؤال هدفمند و اطمینان از اجرای کامل.',
    onboardingQuestions: [
      {
        key: 'escalation_style',
        questionFa: 'در کارهای حساس یا چندبخشی، راهبر چه زمانی حتماً قبل از اجرا تأیید مدیر را بگیرد؟',
        placeholderFa: 'مثلاً همه ثبت‌های مالی بالای ۱۰ میلیون تومان، حذف یا تغییر تاریخ تحویل پروژه',
        policyField: 'approval_thresholds',
      },
      {
        key: 'default_priority_rules',
        questionFa: 'اولویت سازمان در تداخل کارها چیست؟ (تحویل سریع، حفظ حاشیه سود یا رضایت مشتری خاص)',
        placeholderFa: 'مثلاً مشتریان کلیدی و فاکتورهای سررسید گذشته همیشه اولویت اول دارند',
        policyField: 'priority_rules',
      },
      {
        key: 'coordination_notes',
        questionFa: 'چه قوانین کلی بین تیم‌ها باید همیشه در پاسخ‌ها رعایت شود؟',
        placeholderFa: 'مثلاً قبل از بستن پروژه حتماً تسویه مالی با حسابداری چک شود',
        policyField: 'cross_team_rules',
      },
    ],
  },
  {
    key: 'sales_leads',
    titleFa: 'ایجنت فروش و لید',
    shortTitleFa: 'فروش و لید',
    subtitleFa: 'پیش‌فاکتور، فاکتور، برگشت از فروش، تسویه و پیگیری لیدها',
    descriptionFa: 'تسلط کامل بر مشتری، لیست قیمت، پکیج و پیشنهاد اقلام، جدول پرداخت و تسویه با سند پرداخت، برگشت از فروش، تبدیل فروش به پروژه/الگوی فرآیند و پیگیری سرنخ‌ها.',
    badgeColor: '#10b981',
    iconKey: 'shopping',
    primaryModules: ['customers', 'invoices', 'marketing_leads'],
    optionalModules: ['products', 'price_lists', 'product_bundles', 'cash_bank_operations', 'sales_return_invoices', 'projects', 'process_templates', 'process_runs', 'tasks'],
    defaultCapabilities: ['record_creation', 'process_operation'],
    defaultToneStyle: 'friendly_warm',
    supportsBackground: true,
    supportsStaffBot: true,
    defaultBackgroundConfig: {
      enabled: false,
      interval_minutes: 60,
      cooldown_minutes: 240,
      daily_budget_irt: 40000,
      respect_work_schedule: true,
    },
    roleFocusFa: 'مقایسه قیمت، پیشنهاد اقلام مکمل، صدور پیش‌فاکتور/فاکتور با جدول پرداخت، تسویه رسید، برگشت از فروش و پیگیری لید.',
    onboardingQuestions: [
      {
        key: 'pricing_source_policy',
        questionFa: 'هنگام صدور پیش‌فاکتور یا فاکتور، اولویت منبع قیمت چیست؟ (لیست قیمت، قیمت پایه کالا یا آخرین نرخ مشتری)',
        placeholderFa: 'مثلاً اگر مشتری لیست قیمت داشت از آن استفاده شود، وگرنه بین قیمت پایه و آخرین فاکتور از کاربر بپرسد',
        policyField: 'pricing_priority',
      },
      {
        key: 'discount_and_credit_rules',
        questionFa: 'سقف تخفیف مجاز و سیاست فروش اعتباری یا پیش‌پرداخت سازمان چگونه است؟',
        placeholderFa: 'مثلاً تا ۵ درصد تخفیف مجاز است؛ فروش اقساطی حداقل ۳۰ درصد پیش‌پرداخت لازم دارد',
        policyField: 'discount_and_payment_policy',
      },
      {
        key: 'post_sale_project_rule',
        questionFa: 'بعد از قطعی شدن فاکتور فروش، چه زمانی باید پروژه یا الگوی فرآیند خودکار ساخته شود؟',
        placeholderFa: 'مثلاً برای سفارش‌های طراحی یا خدمات، پروژه با الگوی تحویل استاندارد ایجاد شود',
        policyField: 'post_sale_project_policy',
      },
      {
        key: 'lead_followup_window',
        questionFa: 'لیدهای بدون پیگیری پس از چند ساعت یا چند روز باید یادآوری یا پیگیری شوند؟',
        placeholderFa: 'مثلاً لید جدید پس از ۴ ساعت در ساعات کاری و لید در حال مذاکره هر ۴۸ ساعت',
        policyField: 'lead_followup_cadence',
      },
    ],
  },
  {
    key: 'purchase_supply',
    titleFa: 'ایجنت خرید و تأمین',
    shortTitleFa: 'خرید و تأمین',
    subtitleFa: 'فاکتور خرید، برگشت از خرید، تأمین‌کنندگان و موجودی انبار',
    descriptionFa: 'مدیریت فاکتور خرید و برگشت از خرید، ثبت و تطبیق پرداخت‌های تأمین‌کننده، پایش کسری موجودی کالاها و قفسه‌ها و ربط دادن خرید به پروژه‌ها و فعالیت‌ها.',
    badgeColor: '#f59e0b',
    iconKey: 'truck',
    primaryModules: ['purchase_invoices', 'suppliers', 'products'],
    optionalModules: ['purchase_return_invoices', 'warehouses', 'cash_bank_operations', 'projects', 'tasks'],
    defaultCapabilities: ['record_creation', 'process_operation'],
    defaultToneStyle: 'concise',
    supportsBackground: true,
    supportsStaffBot: true,
    defaultBackgroundConfig: {
      enabled: false,
      interval_minutes: 120,
      cooldown_minutes: 360,
      daily_budget_irt: 30000,
      respect_work_schedule: true,
    },
    roleFocusFa: 'تحلیل موجودی، پیشنهاد خرید از تأمین‌کنندگان مناسب، ثبت فاکتور خرید/برگشت و پیگیری تسویه تأمین.',
    onboardingQuestions: [
      {
        key: 'reorder_threshold_policy',
        questionFa: 'نقطه هشدار کسری موجودی و سیاست تأمین اضطراری کالاها چیست؟',
        placeholderFa: 'مثلاً کالاهای پرفروش با موجودی زیر ۱۰ عدد در اولویت تأمین قرار بگیرند',
        policyField: 'reorder_policy',
      },
      {
        key: 'supplier_selection_criteria',
        questionFa: 'معیار انتخاب تأمین‌کننده اولویت‌دار چیست؟ (قیمت پایین‌تر، تحویل سریع‌تر یا تسویه مدتی)',
        placeholderFa: 'مثلاً ابتدا تأمین‌کنندگان تاییدشده با شرایط تسویه چک ۳۰ روزه',
        policyField: 'supplier_preference',
      },
      {
        key: 'purchase_approval_rules',
        questionFa: 'سفارش‌های خرید و برگشت از خرید نیاز به چه نوع تأییدی پیش از ثبت دارند؟',
        placeholderFa: 'مثلاً همه پیش‌نویس‌های خرید قبل از ثبت با تأیید مدیر تدارکات',
        policyField: 'purchase_approval_policy',
      },
    ],
  },
  {
    key: 'customer_response',
    titleFa: 'ایجنت پاسخگویی مشتری',
    shortTitleFa: 'پاسخگویی مشتری',
    subtitleFa: 'پاسخگویی هوشمند در بات، پیامک، تماس‌ها و پیگیری داخلی',
    descriptionFa: 'پاسخ به مشتری در تلگرام/بله/روبیکا، بررسی تاریخچه پیامک و تماس‌های ورودی/خروجی، و در صورت نیاز پیگیری و استعلام امن از همکار مسئول در چت داخلی یا ایجنت‌باکس.',
    badgeColor: '#0ea5e9',
    iconKey: 'customer',
    primaryModules: ['customers', 'tasks'],
    optionalModules: ['invoices', 'reservations', 'projects', 'marketing_leads', 'employees'],
    defaultCapabilities: ['customer_reply_suggestion'],
    defaultToneStyle: 'friendly_warm',
    supportsBackground: true,
    supportsStaffBot: true,
    defaultBackgroundConfig: {
      enabled: false,
      interval_minutes: 30,
      cooldown_minutes: 120,
      daily_budget_irt: 45000,
      respect_work_schedule: true,
    },
    roleFocusFa: 'پاسخ دقیق به مشتری براساس دانش سازمان، رصد کانال‌های ارتباطی و رله/پیگیری امن از همکار مسئول بدون افشای داده داخلی.',
    onboardingQuestions: [
      {
        key: 'customer_persona_tone',
        questionFa: 'نام یا شخصیت دستیار پاسخگو در برابر مشتری و سطح صمیمیت آن چگونه باشد؟',
        placeholderFa: 'مثلاً با نام «پشتیبان هوشمند شرکت»، مؤدبانه، صمیمی و با سلام رسمی',
        policyField: 'customer_persona',
      },
      {
        key: 'red_lines',
        questionFa: 'خط قرمزهای پاسخ خودکار چیست؟ در چه موضوعاتی نباید پاسخ قطعی داد و باید به کارشناس ارجاع شود؟',
        placeholderFa: 'مثلاً تخفیف اختصاصی، شکایت مالی، تغییر قرارداد یا وعده تحویل فوری',
        policyField: 'escalation_red_lines',
      },
      {
        key: 'relay_targets',
        questionFa: 'پیگیری کار مشتریان در ساعات کاری به کدام واحد یا مسئول ارجاع داده شود؟',
        placeholderFa: 'مثلاً امور سفارش‌ها به مسئول فروش و وضعیت تحویل به واحد اجرا',
        policyField: 'internal_relay_routing',
      },
    ],
  },
  {
    key: 'hr_manager',
    titleFa: 'ایجنت منابع انسانی',
    shortTitleFa: 'منابع انسانی',
    subtitleFa: 'آنبوردینگ، فیش‌های حقوقی، قراردادها، مرخصی و همراهی کارکنان',
    descriptionFa: 'دستیار دوسویه: کمک به مدیر منابع انسانی در استعلام و تحلیل فیش‌های حقوقی و کارکرد، قراردادها، آنبوردینگ متقاضیان، پیگیری مرخصی/اضافه‌کار و پایش آیین‌نامه‌ها؛ و پاسخگویی سریع به کارکنان.',
    badgeColor: '#ec4899',
    iconKey: 'hr',
    primaryModules: ['employees', 'tasks', 'payroll_slips', 'employee_contracts'],
    optionalModules: ['recruitment_applicants', 'leave_requests', 'overtime_requests', 'mission_requests', 'attendance_logs', 'work_schedules', 'job_descriptions', 'process_templates', 'process_runs', 'employee_bonus_requests', 'employee_penalty_requests'],
    defaultCapabilities: ['record_creation', 'process_operation'],
    defaultToneStyle: 'coaching',
    supportsBackground: true,
    supportsStaffBot: true,
    defaultBackgroundConfig: {
      enabled: false,
      interval_minutes: 120,
      cooldown_minutes: 480,
      daily_budget_irt: 30000,
      respect_work_schedule: true,
    },
    roleFocusFa: 'آنبوردینگ پرسنل جدید، استعلام و تنظیم فیش‌های حقوقی، قراردادها، یادآوری وظایف و مرخصی‌ها، و پاسخگویی به شرح شغل.',
    onboardingQuestions: [
      {
        key: 'onboarding_process_policy',
        questionFa: 'مراحل و دستورالعمل استاندارد آنبوردینگ نیروی جدید در سازمان چیست؟',
        placeholderFa: 'مثلاً ایجاد پرونده کارمند، انتساب شرح شغل، معرفی آیین‌نامه داخلی و فعال‌سازی فرآیند معارفه هفته اول',
        policyField: 'onboarding_policy',
      },
      {
        key: 'leave_overtime_sla',
        questionFa: 'قوانین مرخصی، اضافه‌کار، مأموریت و زمان پاسخ‌دهی به درخواست‌های پرسنل چگونه است؟',
        placeholderFa: 'مثلاً درخواست مرخصی روزانه حداقل ۲۴ ساعت قبل ثبت شود و مدیر مستقیم ظرف ۱۲ ساعت بررسی کند',
        policyField: 'leave_overtime_policy',
      },
      {
        key: 'employee_coaching_scope',
        questionFa: 'همکار جدید در روزهای اول چه نکات فرهنگی، آموزشی یا ارتباطی را باید از دستیار بداند؟',
        placeholderFa: 'مثلاً ساعات کاری، گزارش‌دهی پایان روز و مسیر ارتباط با سرپرست مستقیم',
        policyField: 'coaching_notes',
      },
    ],
  },
  {
    key: 'reservation',
    titleFa: 'ایجنت رزرواسیون',
    shortTitleFa: 'رزرواسیون',
    subtitleFa: 'نوبت‌دهی، مدیریت منابع، بافر آماده‌سازی و جلوگیری از تداخل',
    descriptionFa: 'مدیریت کامل رزروها، منابع رزرواسیون، ساعت کاری و تعطیلات رسمی/سازمانی، بافرهای آماده‌سازی و نظافت، بیعانه و اتصال به فاکتور فروش یا یادآوری فعالیت.',
    badgeColor: '#8b5cf6',
    iconKey: 'calendar',
    primaryModules: ['reservations', 'reservation_resources'],
    optionalModules: ['customers', 'invoices', 'products', 'work_schedules', 'tasks'],
    defaultCapabilities: ['record_creation', 'process_operation'],
    defaultToneStyle: 'friendly_warm',
    supportsBackground: true,
    supportsStaffBot: true,
    defaultBackgroundConfig: {
      enabled: false,
      interval_minutes: 60,
      cooldown_minutes: 240,
      daily_budget_irt: 25000,
      respect_work_schedule: true,
    },
    roleFocusFa: 'بررسی ظرفیت خالی با احتساب زمان آماده‌سازی/پاکسازی و تعطیلات جلالی، ثبت و اصلاح رزرو و یادآوری پیش از نوبت.',
    onboardingQuestions: [
      {
        key: 'buffer_and_hours',
        questionFa: 'فاصله زمانی (بافر) آماده‌سازی و جمع‌آوری بین دو نوبت و سیاست کار در روزهای تعطیل چیست؟',
        placeholderFa: 'مثلاً ۱۵ دقیقه فاصله بین رزروها؛ در تعطیلات رسمی فقط با تأیید مدیر رزرو ثبت شود',
        policyField: 'buffer_and_holiday_policy',
      },
      {
        key: 'deposit_and_cancellation',
        questionFa: 'سیاست دریافت بیعانه، قطعی‌سازی رزرو و لغو نوبت چگونه است؟',
        placeholderFa: 'مثلاً برای رزروهای بالای ۲ ساعت، دریافت ۳۰ درصد بیعانه الزامی است',
        policyField: 'deposit_cancellation_policy',
      },
      {
        key: 'reminder_lead_time',
        questionFa: 'یادآوری رزروها چند ساعت قبل به مسئول مربوط یا مشتری اعلام شود؟',
        placeholderFa: 'مثلاً ۲۴ ساعت قبل و ۲ ساعت قبل از زمان شروع',
        policyField: 'reminder_timing',
      },
    ],
  },
  {
    key: 'project_process',
    titleFa: 'ایجنت پروژه و فرآیند',
    shortTitleFa: 'پروژه و فرآیند',
    subtitleFa: 'طراحی الگوی فرآیند کامل، پروژه، مراحل و فعالیت‌ها',
    descriptionFa: 'طراحی گام‌به‌گام و ساخت الگوی فرآیند کامل با مرحله‌ها، فیلدها، وضعیت‌های اختصاصی و اتوماسیون‌ها؛ ساخت پروژه از روی الگو؛ ایجاد، ارجاع و پیگیری فعالیت‌ها با لحاظ تعطیلات.',
    badgeColor: '#3b82f6',
    iconKey: 'workflow',
    primaryModules: ['projects', 'tasks'],
    optionalModules: ['process_templates', 'process_runs', 'customers', 'employees', 'invoices', 'content_calendars'],
    defaultCapabilities: ['record_creation', 'process_operation'],
    defaultToneStyle: 'concise',
    supportsBackground: true,
    supportsStaffBot: true,
    defaultBackgroundConfig: {
      enabled: false,
      interval_minutes: 90,
      cooldown_minutes: 360,
      daily_budget_irt: 35000,
      respect_work_schedule: true,
    },
    roleFocusFa: 'تعریف الگوی فرآیند کامل، اجرای مراحل V2، ساخت پروژه و مدیریت فعالیت‌ها با تقویم جلالی.',
    onboardingQuestions: [
      {
        key: 'process_design_rules',
        questionFa: 'در طراحی الگوهای فرآیند جدید، استاندارد نام‌گذاری مراحل و مسئول‌های پیش‌فرض چگونه باشد؟',
        placeholderFa: 'مثلاً هر مرحله دارای مسئول نقش یا کاربر مشخص، مهلت کاری به روز و وضعیت‌های واضح باشد',
        policyField: 'process_design_standards',
      },
      {
        key: 'holiday_scheduling',
        questionFa: 'اگر موعد فعالیت در روز جمعه یا تعطیل رسمی افتاد، به روز کاری قبل یا بعد منتقل شود؟',
        placeholderFa: 'مثلاً همیشه به اولین روز کاری بعدی منتقل شود و فعالیت‌های مهم ۲۴ ساعت قبل یادآوری شوند',
        policyField: 'holiday_shift_policy',
      },
      {
        key: 'blocker_escalation',
        questionFa: 'فعالیت‌ها یا مراحل متوقف‌شده چه زمانی به مدیر پروژه گزارش شوند؟',
        placeholderFa: 'مثلاً اگر بیش از ۲۴ ساعت از سررسید گذشته و پیشرفتی ثبت نشده باشد',
        policyField: 'blocker_escalation_rules',
      },
    ],
  },
  {
    key: 'instagrammer',
    titleFa: 'ایجنت اینستاگرامر',
    shortTitleFa: 'اینستاگرامر',
    subtitleFa: 'پست‌ها، استوری‌ها، ویترین دکمه‌دار و پاسخ خودکار اینستاگرام',
    descriptionFa: 'تسلط کامل بر صندوق اینستاگرام و مستندات رسمی اینستاگرام و قانون‌گذاری: نمایش و انتخاب پست/ریل/استوری، ساخت شرط پاسخ خودکار عمومی یا مختص یک پست/استوری و طراحی کارت ویترین دکمه‌دار.',
    badgeColor: '#e1306c',
    iconKey: 'instagram',
    primaryModules: ['instagram_conversations'],
    optionalModules: ['workflows', 'customers', 'products', 'price_lists', 'product_bundles', 'marketing_leads'],
    defaultCapabilities: ['record_creation', 'process_operation', 'customer_reply_suggestion'],
    defaultToneStyle: 'friendly_warm',
    supportsBackground: true,
    supportsStaffBot: true,
    requiredPlanFeatures: ['instagram_inbox'],
    defaultBackgroundConfig: {
      enabled: false,
      interval_minutes: 30,
      cooldown_minutes: 120,
      daily_budget_irt: 35000,
      respect_work_schedule: true,
    },
    roleFocusFa: 'مدیریت دایرکت، کامنت و ریپلای استوری با تسلط به مستندات رسمی اینستاگرام و قانون‌گذاری، نمایش رسانه برای انتخاب و ساخت گردش‌کار و کارت دکمه‌دار.',
    onboardingQuestions: [
      {
        key: 'instagram_persona_tone',
        questionFa: 'شخصیت، لحن پاسخگویی و نام امضای پیج در دایرکت و کامنت اینستاگرام چگونه باشد؟',
        placeholderFa: 'مثلاً صمیمی و باانرژی، کوتاه، با ایموجی متعادل و دعوت به ثبت سفارش در سایت یا دایرکت',
        policyField: 'instagram_persona',
      },
      {
        key: 'instagram_comment_direct_rules',
        questionFa: 'برای کامنت‌های «قیمت» یا «مشاوره» روی پست‌ها و ریپلای استوری‌ها چه الگویی اجرا شود؟',
        placeholderFa: 'مثلاً روی کامنت بنویسد «دایرکت ارسال شد» و در دایرکت ویترین یا قیمت همان محصول فرستاده شود',
        policyField: 'comment_and_story_reply_rules',
      },
      {
        key: 'instagram_showcase_cta',
        questionFa: 'در کارت‌های عکس و دکمه‌دار (ویترین‌ها) حداکثر ۳ دکمه با چه لینک یا اکشن‌های پیش‌فرضی ساخته شوند؟',
        placeholderFa: 'مثلاً دکمه «ثبت سفارش آنلاین» با لینک سایت و دکمه «صحبت با کارشناس» با postback ارجاع به اپراتور',
        policyField: 'showcase_button_defaults',
      },
      {
        key: 'instagram_red_lines',
        questionFa: 'چه موضوعاتی در اینستاگرام نباید خودکار پاسخ داده شود و باید به ادمین ارجاع گردد؟',
        placeholderFa: 'مثلاً شکایت، مرجوعی، تخفیف همکاری عمده یا پیگیری پرداخت واریزی',
        policyField: 'instagram_escalation_red_lines',
      },
    ],
  },
  {
    key: 'system_guide',
    titleFa: 'ایجنت راهنمای تازه‌سیستم',
    shortTitleFa: 'راهنمای سیستم',
    subtitleFa: 'آموزش کار با نرم‌افزار، ویدیوها، دانش و راهنمای سازمان',
    descriptionFa: 'آموزش قدم‌به‌قدم نحوه کار با بخش‌های مختلف تازه‌سیستم بر اساس آموزش‌های متنی و ویدیوهای ضبط‌شده، ساختار نرم‌افزار، دانش و دستورالعمل‌های سازمان و قابل شخصی‌سازی برای هر سازمان.',
    badgeColor: '#14b8a6',
    iconKey: 'guide',
    primaryModules: ['instructions', 'tasks'],
    optionalModules: ['job_descriptions', 'process_templates', 'products', 'invoices', 'projects', 'customers', 'reservations', 'instagram_conversations'],
    defaultCapabilities: ['dashboard_chat', 'record_chat'],
    defaultToneStyle: 'coaching',
    supportsBackground: false,
    supportsStaffBot: true,
    defaultBackgroundConfig: {
      enabled: false,
      interval_minutes: 180,
      cooldown_minutes: 720,
      daily_budget_irt: 20000,
      respect_work_schedule: true,
    },
    roleFocusFa: 'پاسخ به پرسش‌های آموزشی کاربران درباره نحوه کار با نرم‌افزار، ارجاع به ویدیوها و مستندات رسمی و تطبیق آموزش با فرآیند اختصاصی سازمان.',
    onboardingQuestions: [
      {
        key: 'training_focus',
        questionFa: 'تیم شما در آموزش کار با تازه‌سیستم بیشتر روی کدام بخش‌ها یا گردش‌کارها تمرکز دارد؟',
        placeholderFa: 'مثلاً ثبت فاکتور فروش، پیگیری لید، اجرای فرآیندهای پروژه و صندوق اینستاگرام',
        policyField: 'training_focus_modules',
      },
      {
        key: 'custom_glossary_sops',
        questionFa: 'چه اصطلاحات داخلی یا نکات سفارشی سازمان باید کنار آموزش استاندارد نرم‌افزار گفته شود؟',
        placeholderFa: 'مثلاً در شرکت ما منظور از پروژه همان «سفارش تولیدی» است و ثبت فاکتور همیشه با لیست قیمت همکار انجام می‌شود',
        policyField: 'org_custom_training_notes',
      },
      {
        key: 'video_and_support_policy',
        questionFa: 'اگر همکار پس از دیدن راهنما هنوز نیاز به کمک داشت، به چه فرد یا واحدی ارجاع داده شود؟',
        placeholderFa: 'مثلاً برای مسائل مالی به واحد حسابداری و برای تنظیمات دسترسی به مدیر سیستم',
        policyField: 'support_escalation_path',
      },
    ],
  },
] as const;

export const AI_AGENT_KEYS: AgentKey[] = AI_AGENT_CATALOG.map((agent) => agent.key);

export const getAgentDefinition = (agentKey?: string | null): AiAgentDefinition | null => {
  const normalized = String(agentKey || '').trim().toLowerCase() as AgentKey;
  return AI_AGENT_CATALOG.find((item) => item.key === normalized) || null;
};

export const getAgentTitleFa = (agentKey?: string | null): string =>
  getAgentDefinition(agentKey)?.titleFa || 'ایجنت هوشمند';

export const getAgentToneLabelFa = (toneStyle?: string | null): string => {
  const normalized = String(toneStyle || 'friendly_warm').trim() as AgentToneStyle;
  return AGENT_TONE_STYLES.find((item) => item.value === normalized)?.labelFa || 'صمیمی و همراه';
};

export const normalizeSelectedAgents = (input: unknown): AgentKey[] => {
  if (!Array.isArray(input)) return [];
  const valid = new Set<string>(AI_AGENT_KEYS);
  return Array.from(
    new Set(
      input
        .map((item) => String(item || '').trim().toLowerCase())
        .filter((item): item is AgentKey => valid.has(item)),
    ),
  );
};

const UUID_PATTERN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ACTION_TYPE_LABELS_FA: Record<string, string> = {
  create_record: 'ایجاد رکورد جدید',
  update_record: 'به‌روزرسانی رکورد',
  delete_record: 'حذف رکورد',
  record_creation: 'پیشنهاد ثبت رکورد',
  process_operation: 'اجرای عملیات فرآیند',
  pricing_adjustment: 'تغییر گروهی قیمت‌ها',
  create_workflow: 'ساخت یا ویرایش گردش‌کار',
  send_message: 'ارسال پیام',
  send_instagram_message: 'ارسال پیام اینستاگرام',
  reply_instagram_comment: 'پاسخ به کامنت اینستاگرام',
  create_showcase: 'ساخت کارت ویترین اینستاگرام',
};

const MODULE_LABELS_FA_FALLBACK: Record<string, string> = {
  customers: 'مشتریان',
  marketing_leads: 'سرنخ‌های بازاریابی',
  products: 'کالاها و خدمات',
  price_lists: 'لیست‌های قیمت',
  product_bundles: 'پکیج‌های محصول',
  invoices: 'فاکتور فروش',
  purchase_invoices: 'فاکتور خرید',
  suppliers: 'تأمین‌کنندگان',
  warehouses: 'انبارها',
  projects: 'پروژه‌ها',
  tasks: 'فعالیت‌ها',
  process_templates: 'الگوهای فرآیند',
  process_runs: 'اجرای فرآیندها',
  employees: 'پرسنل',
  leave_requests: 'درخواست مرخصی',
  reservations: 'رزروها',
  instagram_conversations: 'صندوق اینستاگرام',
  workflows: 'گردش‌کارها',
};

export const resolvePendingApprovalAgentKey = (item: any): AgentKey => {
  const raw = String(
    item?.agent_key
    || item?.proposed_payload?.agent_key
    || item?.proposed_payload?.primary_agent
    || 'lead_orchestrator',
  ).trim().toLowerCase() as AgentKey;
  return AI_AGENT_KEYS.includes(raw) ? raw : 'lead_orchestrator';
};

export type PendingApprovalReadableDetails = {
  titleFa: string;
  summaryFa: string;
  actionLabelFa: string;
  moduleLabelFa: string | null;
  detailLines: string[];
};

const cleanHumanText = (value: unknown): string => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text || UUID_PATTERN_RE.test(text)) return '';
  return text;
};

export const formatPendingApprovalSummary = (
  item: any,
  getModuleTitle?: (moduleId: string) => string | null | undefined,
): PendingApprovalReadableDetails => {
  const payload = item?.proposed_payload && typeof item.proposed_payload === 'object'
    ? item.proposed_payload
    : {};
  const actionType = String(item?.action_type || payload?.action_type || '').trim();
  const actionLabelFa = ACTION_TYPE_LABELS_FA[actionType] || 'اقدام پیشنهادی هوش مصنوعی';
  const rawModuleId = String(item?.module_id || payload?.module_id || payload?.target_module || '').trim();
  const customModuleLabel = cleanHumanText(payload?.module_label || payload?.module_title);
  const lookedUpModuleLabel = rawModuleId ? cleanHumanText(getModuleTitle?.(rawModuleId)) : '';
  const moduleLabelFa = customModuleLabel
    || lookedUpModuleLabel
    || (rawModuleId ? (MODULE_LABELS_FA_FALLBACK[rawModuleId] || rawModuleId) : '')
    || null;

  const directSummary = cleanHumanText(
    payload?.summary_fa
    || payload?.title_fa
    || payload?.title
    || payload?.description_fa
    || payload?.description,
  );
  const replyText = cleanHumanText(payload?.reply || payload?.answer || payload?.message_text || payload?.text);
  const promptText = cleanHumanText(payload?.prompt || payload?.user_request || payload?.goal);

  const nestedRecord = (
    (payload?.payload && typeof payload.payload === 'object' ? payload.payload : null)
    || (payload?.record && typeof payload.record === 'object' ? payload.record : null)
    || (payload?.fields && typeof payload.fields === 'object' ? payload.fields : null)
    || (Array.isArray(payload?.records) && payload.records[0] && typeof payload.records[0] === 'object'
      ? (payload.records[0].fields && typeof payload.records[0].fields === 'object' ? payload.records[0].fields : payload.records[0])
      : null)
  );

  const detailLines: string[] = [];
  if (nestedRecord) {
    const preferredKeys = [
      ['name', 'نام'],
      ['title', 'عنوان'],
      ['full_name', 'نام کامل'],
      ['subject', 'موضوع'],
      ['company_name', 'نام شرکت'],
      ['business_name', 'نام کسب‌وکار'],
      ['status', 'وضعیت'],
      ['sell_price', 'قیمت فروش'],
      ['total_invoice_amount', 'جمع مبلغ'],
      ['mobile_1', 'تلفن همراه'],
      ['due_date', 'تاریخ سررسید'],
    ] as const;
    for (const [key, label] of preferredKeys) {
      const val = nestedRecord?.[key];
      const cleaned = cleanHumanText(val);
      if (cleaned) {
        detailLines.push(`${label}: ${cleaned}`);
      }
      if (detailLines.length >= 4) break;
    }
    if (detailLines.length === 0) {
      for (const [key, val] of Object.entries(nestedRecord)) {
        if (key === 'id' || key === 'org_id' || key.endsWith('_id')) continue;
        if (typeof val === 'object' && val !== null) continue;
        const cleaned = cleanHumanText(val);
        if (cleaned) detailLines.push(`${key}: ${cleaned}`);
        if (detailLines.length >= 3) break;
      }
    }
  }

  const countSuffix = Array.isArray(payload?.records) && payload.records.length > 1
    ? ` (${payload.records.length.toLocaleString('fa-IR')} مورد)`
    : '';
  const targetRecordTitle = cleanHumanText(
    payload?.record_title
    || payload?.target_title
    || nestedRecord?.name
    || nestedRecord?.title
    || nestedRecord?.full_name
    || nestedRecord?.subject,
  );

  const primarySummary =
    directSummary
    || replyText
    || (targetRecordTitle
      ? `${actionLabelFa}${moduleLabelFa ? ` در «${moduleLabelFa}»` : ''}: «${targetRecordTitle}»${countSuffix}`
      : '')
    || (detailLines.length > 0
      ? `${actionLabelFa}${moduleLabelFa ? ` (${moduleLabelFa})` : ''} — ${detailLines.slice(0, 2).join(' | ')}`
      : '')
    || (promptText ? `${actionLabelFa}: ${promptText.slice(0, 130)}` : '')
    || (moduleLabelFa ? `${actionLabelFa} در بخش «${moduleLabelFa}»${countSuffix}` : actionLabelFa);

  const titleFa = moduleLabelFa ? `${actionLabelFa} • ${moduleLabelFa}` : actionLabelFa;
  if (promptText && primarySummary !== promptText && !primarySummary.includes(promptText.slice(0, 40))) {
    detailLines.unshift(`درخواست: ${promptText.slice(0, 150)}`);
  }

  return {
    titleFa,
    summaryFa: primarySummary,
    actionLabelFa,
    moduleLabelFa,
    detailLines: detailLines.slice(0, 5),
  };
};

export const isAgentConversationKey = (value?: string | null): boolean =>
  String(value || '').trim().startsWith(AGENT_CONVERSATION_PREFIX);

export const extractAgentKeyFromValue = (value?: string | null): AgentKey | null => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  const candidate = raw.startsWith(AGENT_CONVERSATION_PREFIX)
    ? raw.slice(AGENT_CONVERSATION_PREFIX.length).split(':')[0].trim()
    : raw;
  return getAgentDefinition(candidate)?.key || null;
};

export const extractAgentKeyFromRow = (row: any): AgentKey | null => {
  if (!row || typeof row !== 'object') return null;
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const candidates = [
    metadata.agent_key,
    payload.agent_key,
    row.agent_key,
    row.counterparty_label,
    row.conversation_key,
    metadata.conversation_key,
    payload.conversation_key,
  ];
  for (const item of candidates) {
    const found = extractAgentKeyFromValue(item);
    if (found) return found;
  }
  if (
    isAgentConversationKey(row?.conversation_key)
    || isAgentConversationKey(metadata?.conversation_key)
    || isAgentConversationKey(payload?.conversation_key)
    || Boolean(metadata?.agent_key || payload?.agent_key)
  ) {
    return 'lead_orchestrator';
  }
  return null;
};

export const isAgentNoteRow = (row: any): boolean => {
  if (!row || typeof row !== 'object') return false;
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const category = String(payload?.category || '').trim().toLowerCase();
  return (
    category === 'agent'
    || String(row?.kind || '').trim().toLowerCase() === 'agent'
    || isAgentConversationKey(row?.conversation_key)
    || isAgentConversationKey(metadata?.conversation_key)
    || isAgentConversationKey(payload?.conversation_key)
    || Boolean(String(metadata?.agent_key || payload?.agent_key || '').trim())
    || Boolean(String(payload?.waiting_approval_id || metadata?.waiting_approval_id || '').trim())
  );
};

export type ClientAgentAccessEvaluation = {
  agentKey: AgentKey;
  definition: AiAgentDefinition;
  orgEnabled: boolean;
  planAllowed: boolean;
  rbacAllowed: boolean;
  memberCanUse: boolean;
  canView: boolean;
  canChat: boolean;
  canToggle: boolean;
  canEdit: boolean;
  canUse: boolean;
  isHidden: boolean;
  staffBotEnabled: boolean;
};

export const isPlanFeatureAllowedClient = (
  features: Record<string, any> | null | undefined,
  key: string,
  options?: { missingReturnsFalse?: boolean },
): boolean => {
  if (!features || typeof features !== 'object') return true;
  if (!Object.prototype.hasOwnProperty.call(features, key)) {
    return options?.missingReturnsFalse ? false : true;
  }
  const raw = features[key];
  if (raw === true) return true;
  if (typeof raw === 'string') {
    const norm = raw.trim().toLowerCase();
    return norm === 'true' || norm === 'enabled' || norm === 'full' || norm === 'limited';
  }
  if (raw && typeof raw === 'object') return raw.enabled === true || raw.available === true;
  return false;
};

export const hasExplicitAiAgentPlanFlags = (
  features: Record<string, any> | null | undefined,
): boolean => Boolean(
  features
  && typeof features === 'object'
  && Object.keys(features).some((key) => key.startsWith(AI_AGENT_PLAN_FEATURE_PREFIX)),
);

export const isAgentPlanFlagAllowedClient = (
  features: Record<string, any> | null | undefined,
  agentKey: AgentKey,
): boolean => {
  if (!features || typeof features !== 'object') return true;
  const flagKey = getAiAgentPlanFeatureKey(agentKey);
  if (Object.prototype.hasOwnProperty.call(features, flagKey)) {
    return isPlanFeatureAllowedClient(features, flagKey, { missingReturnsFalse: true });
  }
  if (hasExplicitAiAgentPlanFlags(features)) return false;
  return true;
};

export const deriveLegacyEnabledAiAgentFeatureKeys = (
  enabledModules: Record<string, any> | string[] | null | undefined,
  enabledFeatures: Record<string, any> | string[] | null | undefined,
): string[] => {
  const modMap: Record<string, boolean> = Array.isArray(enabledModules)
    ? Object.fromEntries(enabledModules.map((id) => [String(id), true]))
    : (enabledModules && typeof enabledModules === 'object' ? enabledModules : {});
  const featMap: Record<string, any> = Array.isArray(enabledFeatures)
    ? Object.fromEntries(enabledFeatures.map((id) => [String(id), true]))
    : (enabledFeatures && typeof enabledFeatures === 'object' ? enabledFeatures : {});
  const hasModuleList = Object.keys(modMap).length > 0;
  const hasFeatureList = Object.keys(featMap).length > 0;

  return AI_AGENT_CATALOG
    .filter((def) => {
      const moduleOk = !hasModuleList || def.primaryModules.some((mod) => {
        const canonical = RETURN_INVOICE_PARENT_MODULES[mod] || mod;
        if (Object.prototype.hasOwnProperty.call(modMap, mod)) return modMap[mod] === true;
        if (Object.prototype.hasOwnProperty.call(modMap, canonical)) return modMap[canonical] === true;
        return false;
      });
      const requiredFeatures = Array.isArray(def.requiredPlanFeatures) ? def.requiredPlanFeatures : [];
      const featuresOk = requiredFeatures.every((feature) =>
        isPlanFeatureAllowedClient(featMap, feature, { missingReturnsFalse: hasFeatureList }),
      );
      return moduleOk && featuresOk;
    })
    .map((def) => getAiAgentPlanFeatureKey(def.key));
};

const canViewModuleClient = (permissions: Record<string, any> | null | undefined, moduleId: string): boolean => {
  if (!permissions || typeof permissions !== 'object') return true;
  const canonical = RETURN_INVOICE_PARENT_MODULES[moduleId] || moduleId;
  const perm = permissions[moduleId] ?? permissions[canonical];
  if (!perm || typeof perm !== 'object') return false;
  return perm.view !== false;
};

export const resolveClientAgentAccess = (params: {
  permissions?: Record<string, any> | null;
  enabledModules?: Record<string, boolean> | null;
  planFeatures?: Record<string, any> | null;
  agentConfigs?: Array<{ agent_key: string; is_enabled?: boolean }>;
  memberPermissions?: Array<{
    agent_key: string;
    subject_type: 'user' | 'role';
    subject_id: string;
    can_use?: boolean;
    staff_bot_enabled?: boolean;
  }>;
  userId?: string | null;
  roleId?: string | null;
  isOrgAdmin?: boolean;
}): Record<AgentKey, ClientAgentAccessEvaluation> => {
  const userId = String(params.userId || '').trim();
  const roleId = String(params.roleId || '').trim();
  const configsByKey = new Map((params.agentConfigs || []).map((c) => [String(c?.agent_key || ''), c]));
  const perms = params.memberPermissions || [];
  const aiPerm = (params.permissions && typeof params.permissions === 'object' ? params.permissions.__ai_agents : null) || {};
  const aiFields = aiPerm?.fields && typeof aiPerm.fields === 'object' ? aiPerm.fields : {};
  const sectionView = !params.permissions || aiPerm?.view !== false;
  const sectionEdit = aiPerm?.edit === true;
  const isOrgAdmin = Boolean(params.isOrgAdmin);

  const findMemberPerm = (key: string) => {
    const matching = perms.filter((row) => String(row?.agent_key || '') === key);
    if (userId) {
      const userRow = matching.find((row) => row.subject_type === 'user' && String(row.subject_id || '') === userId);
      if (userRow) return userRow;
    }
    if (roleId) {
      const roleRow = matching.find((row) => row.subject_type === 'role' && String(row.subject_id || '') === roleId);
      if (roleRow) return roleRow;
    }
    return null;
  };

  const staffBotGlobal = findMemberPerm('__staff_bot');
  const hasFeatureMapKeys = Boolean(params.planFeatures && typeof params.planFeatures === 'object' && Object.keys(params.planFeatures).length > 0);
  const staffBotPlanAllowed = isPlanFeatureAllowedClient(params.planFeatures, 'ai_staff_bot', {
    missingReturnsFalse: hasFeatureMapKeys,
  });
  const out = {} as Record<AgentKey, ClientAgentAccessEvaluation>;

  for (const def of AI_AGENT_CATALOG) {
    const cfg = configsByKey.get(def.key);
    const orgEnabled = cfg ? cfg.is_enabled !== false : true;
    const permRow = findMemberPerm(def.key);

    const enabledMap = params.enabledModules;
    const isPlanModEnabled = (mod: string) => {
      if (!enabledMap || typeof enabledMap !== 'object') return true;
      const canonical = RETURN_INVOICE_PARENT_MODULES[mod] || mod;
      if (Object.prototype.hasOwnProperty.call(enabledMap, mod)) return enabledMap[mod] !== false;
      if (Object.prototype.hasOwnProperty.call(enabledMap, canonical)) return enabledMap[canonical] !== false;
      return true;
    };

    const planModulesAvailable = def.primaryModules.filter((m) => isPlanModEnabled(m)).length > 0;
    const requiredFeatures = Array.isArray(def.requiredPlanFeatures) ? def.requiredPlanFeatures : [];
    const agentFlagAllowed = isAgentPlanFlagAllowedClient(params.planFeatures, def.key);
    const planAllowed = agentFlagAllowed
      && planModulesAvailable
      && requiredFeatures.every((feature) =>
        isPlanFeatureAllowedClient(params.planFeatures, feature, { missingReturnsFalse: hasFeatureMapKeys }),
      );

    const hasUsableRbac = def.key === 'lead_orchestrator'
      ? true
      : def.primaryModules.some((m) => isPlanModEnabled(m) && canViewModuleClient(params.permissions, m));
    const roleAgentViewAllowed = sectionView && aiFields[`${def.key}.view`] !== false;
    const rbacAllowed = roleAgentViewAllowed && (!params.permissions || isOrgAdmin || hasUsableRbac);
    const memberCanUse = permRow ? permRow.can_use !== false : true;

    const baseRoleCanToggle = isOrgAdmin
      ? aiFields[`${def.key}.toggle`] !== false
      : (sectionEdit || aiFields[`${def.key}.toggle`] === true);
    const baseRoleCanEdit = isOrgAdmin
      ? aiFields[`${def.key}.edit`] !== false
      : (sectionEdit || aiFields[`${def.key}.edit`] === true);
    const baseRoleCanChat = !params.permissions
      ? true
      : aiFields[`${def.key}.chat`] !== false;

    const eligibleActor = planAllowed && rbacAllowed && memberCanUse;
    const canToggle = eligibleActor && baseRoleCanToggle;
    const canEdit = eligibleActor && baseRoleCanEdit;
    const canView = eligibleActor && (orgEnabled || canToggle || canEdit);
    const canChat = canView && orgEnabled && baseRoleCanChat;
    const canUse = canView && canChat;
    const roleStaffBotAllowed = !params.permissions
      ? false
      : (isOrgAdmin
        ? aiFields.__staff_bot !== false
        : (sectionEdit || aiFields.__staff_bot === true));
    const staffBotEnabled = staffBotPlanAllowed && canChat && (
      permRow?.staff_bot_enabled === true
      || (permRow == null && (staffBotGlobal?.staff_bot_enabled === true || roleStaffBotAllowed))
    );

    out[def.key] = {
      agentKey: def.key,
      definition: def,
      orgEnabled,
      planAllowed,
      rbacAllowed,
      memberCanUse,
      canView,
      canChat,
      canToggle,
      canEdit,
      canUse,
      isHidden: !canView,
      staffBotEnabled,
    };
  }

  return out;
};

export const buildAgentAccessMapFromOverviewAgents = (
  rows: Array<Record<string, any>> | null | undefined,
): Record<AgentKey, ClientAgentAccessEvaluation> => {
  const byKey = new Map<string, Record<string, any>>();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row?.key || '').trim();
    if (key) byKey.set(key, row);
  }
  const out = {} as Record<AgentKey, ClientAgentAccessEvaluation>;
  for (const def of AI_AGENT_CATALOG) {
    const row = byKey.get(def.key);
    if (!row) {
      out[def.key] = {
        agentKey: def.key,
        definition: def,
        orgEnabled: false,
        planAllowed: false,
        rbacAllowed: false,
        memberCanUse: false,
        canView: false,
        canChat: false,
        canToggle: false,
        canEdit: false,
        canUse: false,
        isHidden: true,
        staffBotEnabled: false,
      };
      continue;
    }
    const orgEnabled = row.orgEnabled !== false && row.isEnabled !== false;
    const planAllowed = row.planAllowed !== false;
    const rbacAllowed = row.rbacAllowed !== false;
    const memberCanUse = row.memberCanUse !== false;
    const canView = (row.canView ?? row.canUse) !== false;
    const canChat = canView && orgEnabled && planAllowed && (row.canChat ?? row.canUse) !== false;
    const canToggle = canView && Boolean(row.canToggle);
    const canEdit = canView && Boolean(row.canEdit);
    out[def.key] = {
      agentKey: def.key,
      definition: def,
      orgEnabled,
      planAllowed,
      rbacAllowed,
      memberCanUse,
      canView,
      canChat,
      canToggle,
      canEdit,
      canUse: canView && canChat,
      isHidden: !canView,
      staffBotEnabled: Boolean(row.staffBotEnabled),
    };
  }
  return out;
};
