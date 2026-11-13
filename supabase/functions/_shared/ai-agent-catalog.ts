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
  promptGuidanceFa: string;
}> = [
  {
    value: 'friendly_warm',
    labelFa: 'صمیمی و همراه',
    descriptionFa: 'لحن محترمانه، همدلانه، پیگیر و دلگرم‌کننده برای همکاران و مشتریان',
    promptGuidanceFa: 'لحن پاسخ محترمانه، گرم، همدلانه، همراه با تعامل سازنده و شفاف باشد؛ بدون خشک‌بودن یا پرگویی.',
  },
  {
    value: 'formal',
    labelFa: 'رسمی و اداری',
    descriptionFa: 'لحن دقیق، ساختاریافته و مناسب گزارش‌های مدیریتی و مکاتبات رسمی',
    promptGuidanceFa: 'لحن کاملاً رسمی، اداری، دقیق، بی‌حاشیه و مستند باشد.',
  },
  {
    value: 'concise',
    labelFa: 'کوتاه و اجرایی',
    descriptionFa: 'پاسخ‌های خیلی خلاصه، نکته‌محور و متمرکز بر اقدام بعدی',
    promptGuidanceFa: 'پاسخ بسیار کوتاه، بولت‌محور، مستقیم و فقط متمرکز بر داده‌ها و اقدام بعدی باشد.',
  },
  {
    value: 'coaching',
    labelFa: 'مربی‌گرانه و آموزشی',
    descriptionFa: 'توضیح قدم‌به‌قدم، راهنمایی و کمک به یادگیری همکار جدید یا تیم',
    promptGuidanceFa: 'لحن راهنما، حوصله‌مند و قدم‌به‌قدم باشد؛ نکات کلیدی دستورالعمل را روشن توضیح دهد.',
  },
  {
    value: 'custom',
    labelFa: 'سفارشی سازمان',
    descriptionFa: 'ترکیب لحن براساس دستورالعمل و سیاست اختصاصی ثبت‌شده همین ایجنت',
    promptGuidanceFa: 'لحن پاسخ را دقیقاً مطابق تنظیمات سیاست اختصاصی همین ایجنت در سازمان رعایت کن.',
  },
];

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
    titleFa: 'ایجنت بازاریابی و فروش',
    shortTitleFa: 'بازاریابی و فروش',
    subtitleFa: 'کمپین‌ها، سرنخ‌ها، پیش‌فاکتور، فاکتور، تسویه و تبدیل فروش',
    descriptionFa: 'تسلط کامل بر کمپین‌های تبلیغاتی و بازاریابی، سرنخ‌ها (لید)، مشتری، لیست قیمت، پکیج‌ها، صدور پیش‌فاکتور/فاکتور، جدول پرداخت، برگشت از فروش و تبدیل به پروژه.',
    badgeColor: '#10b981',
    iconKey: 'shopping',
    primaryModules: ['campaigns', 'marketing_leads', 'customers', 'invoices'],
    optionalModules: ['advertising_campaigns', 'products', 'price_lists', 'product_bundles', 'cash_bank_operations', 'sales_return_invoices', 'projects', 'process_templates', 'process_runs', 'tasks'],
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
    subtitleFa: 'وضعیت پروژه‌ها، فرآیندها، وظایف کارکنان و پاسخگویی چندکاناله',
    descriptionFa: 'پاسخ به مشتری با تسلط کامل بر وضعیت پروژه‌ها، فرآیندهای در حال اجرا با جزئیات، فعالیت‌های پرسنل، کارکنان مسئول و نقش‌های سازمانی، همراه با پیگیری تاریخچه ارتباطات.',
    badgeColor: '#0ea5e9',
    iconKey: 'customer',
    primaryModules: ['customers', 'tasks', 'projects', 'process_runs', 'employees', 'org_roles'],
    optionalModules: ['invoices', 'reservations', 'process_templates', 'marketing_leads', 'process_run_stages'],
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
    roleFocusFa: 'پاسخ دقیق به مشتری براساس وضعیت واقعی پروژه‌ها، مراحل فرآیند، فعالیت کارکنان و پاسخگویی در کانال‌های ارتباطی.',
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
    subtitleFa: 'آنبوردینگ، شرح شغل‌ها، مرخصی، اضافه‌کار و همراهی کارکنان',
    descriptionFa: 'دستیار دوسویه: کمک به مدیر منابع انسانی در آنبوردینگ متقاضیان، پیگیری مرخصی/اضافه‌کار/مأموریت و پایش دستورالعمل‌ها؛ و کمک به هر کارمند برای آشنایی با شرح شغل، فرآیندها و یادآوری وظایف خودش.',
    badgeColor: '#ec4899',
    iconKey: 'hr',
    primaryModules: ['employees', 'tasks'],
    optionalModules: ['recruitment_applicants', 'leave_requests', 'overtime_requests', 'mission_requests', 'attendance_logs', 'work_schedules', 'job_descriptions', 'process_templates', 'process_runs'],
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
    roleFocusFa: 'آنبوردینگ پرسنل جدید، یادآوری وظایف و مرخصی‌ها، پاسخگویی درباره شرح شغل و قوانین سازمان مطابق دسترسی فرد.',
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
    subtitleFa: 'تقویم محتوایی، پست‌ها، استوری‌ها، ویترین و پاسخ خودکار اینستاگرام',
    descriptionFa: 'تسلط کامل بر تقویم محتوایی، برنامه‌ریزی و زمان‌بندی انتشار پست و ریلز و استوری، صندوق دایرکت و کامنت اینستاگرام، ساخت شرط‌های پاسخ خودکار و کارت ویترین دکمه‌دار.',
    badgeColor: '#e1306c',
    iconKey: 'instagram',
    primaryModules: ['instagram_conversations', 'content_calendars'],
    optionalModules: ['campaigns', 'workflows', 'customers', 'products', 'price_lists', 'product_bundles', 'marketing_leads'],
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

export const AI_AGENT_KEYS = AI_AGENT_CATALOG.map((agent) => agent.key) as AgentKey[];

export const getAgentDefinition = (agentKey?: string | null): AiAgentDefinition | null => {
  const normalized = String(agentKey || '').trim().toLowerCase() as AgentKey;
  return AI_AGENT_CATALOG.find((item) => item.key === normalized) || null;
};

export const getAgentTitleFa = (agentKey?: string | null): string =>
  getAgentDefinition(agentKey)?.titleFa || 'ایجنت هوشمند';

export const getAgentToneGuidanceFa = (toneStyle?: string | null, customToneNotes?: string | null): string => {
  const normalized = String(toneStyle || 'friendly_warm').trim() as AgentToneStyle;
  const preset = AGENT_TONE_STYLES.find((item) => item.value === normalized) || AGENT_TONE_STYLES[0];
  const extra = String(customToneNotes || '').trim();
  if (normalized === 'custom' && extra) {
    return `${preset.promptGuidanceFa}\nتنظیم لحن اختصاصی: ${extra}`;
  }
  return extra ? `${preset.promptGuidanceFa}\nتکمیل لحن اختصاصی: ${extra}` : preset.promptGuidanceFa;
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
