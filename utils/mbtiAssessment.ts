export type MbtiAxis = 'ei' | 'sn' | 'tf' | 'jp';

export type MbtiQuestion = {
  key: string;
  axis: MbtiAxis;
  label: string;
  helpText?: string;
  options: Array<{ label: string; value: string }>;
};

export type MbtiAxisResult = {
  axis: MbtiAxis;
  positive: string;
  negative: string;
  positiveScore: number;
  negativeScore: number;
  preference: string | null;
  clarity: 'نامشخص' | 'نزدیک' | 'روشن' | 'پررنگ';
};

const axisQuestions = (
  axis: MbtiAxis,
  positive: string,
  negative: string,
  questions: Array<[string, string]>,
): MbtiQuestion[] => questions.map(([positiveLabel, negativeLabel], index) => ({
  key: `${axis}_${String(index + 1).padStart(2, '0')}`,
  axis,
  label: `گزینه‌ای را انتخاب کنید که بیشتر به شما نزدیک است: ${positiveLabel} یا ${negativeLabel}`,
  helpText: 'پاسخ درست یا غلطی وجود ندارد؛ وضعیت معمول خود را در نظر بگیرید.',
  options: [
    { label: positiveLabel, value: positive.toLowerCase() },
    { label: negativeLabel, value: negative.toLowerCase() },
  ],
}));

export const MBTI_QUESTIONS: MbtiQuestion[] = [
  ...axisQuestions('ei', 'E', 'I', [
    ['پس از بودن در جمع، معمولاً انرژی بیشتری می‌گیرم', 'پس از بودن در جمع، معمولاً به زمان تنهایی برای بازیابی نیاز دارم'],
    ['با صحبت‌کردن، فکرهایم روشن‌تر می‌شود', 'پیش از صحبت‌کردن، دوست دارم در ذهنم فکرهایم را مرتب کنم'],
    ['در جلسه‌ها معمولاً زودتر وارد گفت‌وگو می‌شوم', 'در جلسه‌ها معمولاً پس از شنیدن دیگران وارد گفت‌وگو می‌شوم'],
    ['برای حل مسئله، تعامل با دیگران را ترجیح می‌دهم', 'برای حل مسئله، ابتدا کار مستقل را ترجیح می‌دهم'],
    ['دامنه آشنایی‌های گسترده به من حس خوبی می‌دهد', 'چند رابطه عمیق و نزدیک به من حس خوبی می‌دهد'],
    ['محیط پرجنب‌وجوش معمولاً برایم محرک است', 'محیط آرام و کم‌رفت‌وآمد معمولاً برایم محرک است'],
    ['ایده‌هایم را همان زمان با دیگران مطرح می‌کنم', 'ایده‌هایم را ابتدا برای خودم پرورش می‌دهم'],
    ['کارهای گروهیِ پرتعامل را دوست دارم', 'کارهایی با تمرکز فردی و زمان کافی را دوست دارم'],
  ]),
  ...axisQuestions('sn', 'S', 'N', [
    ['برای شروع، واقعیت‌ها و جزئیات موجود را بررسی می‌کنم', 'برای شروع، تصویر کلی و امکان‌های آینده را بررسی می‌کنم'],
    ['نمونه عملی و تجربه‌شده برایم قانع‌کننده‌تر است', 'ایده تازه و احتمال‌های جدید برایم قانع‌کننده‌تر است'],
    ['دستورالعمل روشن و مرحله‌به‌مرحله را ترجیح می‌دهم', 'آزادی برای یافتن راه خودم را ترجیح می‌دهم'],
    ['به آنچه اکنون قابل مشاهده است بیشتر توجه می‌کنم', 'به معنای پنهان و الگوهای پشت اتفاق‌ها بیشتر توجه می‌کنم'],
    ['کاربرد عملی یک ایده برایم مهم‌تر است', 'تازگی و ظرفیت رشد یک ایده برایم مهم‌تر است'],
    ['به حافظه‌ام از رویدادهای دقیق تکیه می‌کنم', 'به برداشت کلی و ارتباط میان رویدادها تکیه می‌کنم'],
    ['تغییر تدریجی و آزموده‌شده را می‌پسندم', 'جهش به سوی رویکردی تازه را می‌پسندم'],
    ['توضیح مشخص و قابل اندازه‌گیری را بهتر می‌فهمم', 'توضیح مفهومی و استعاری را بهتر می‌فهمم'],
  ]),
  ...axisQuestions('tf', 'T', 'F', [
    ['در تصمیم‌های دشوار، منطق یکسان و معیارهای روشن را مقدم می‌دانم', 'در تصمیم‌های دشوار، اثر تصمیم بر افراد و ارزش‌ها را مقدم می‌دانم'],
    ['بازخورد مستقیم و دقیق را مفیدتر می‌دانم', 'بازخورد همدلانه و با ملاحظه را مفیدتر می‌دانم'],
    ['اختلاف نظر را فرصتی برای بررسی منطقی می‌بینم', 'اختلاف نظر را فرصتی برای فهم نیازهای افراد می‌بینم'],
    ['معمولاً دنبال راه‌حل منصفانه بر پایه قاعده هستم', 'معمولاً دنبال راه‌حل هماهنگ با شرایط افراد هستم'],
    ['قانع‌شدن با دلیل برایم مهم‌تر است', 'قانع‌شدن با هم‌دلی و هم‌سویی برایم مهم‌تر است'],
    ['در ارزیابی کار، نتیجه و استاندارد را محور می‌گذارم', 'در ارزیابی کار، تلاش و شرایط فرد را هم‌زمان محور می‌گذارم'],
    ['در گفتگوها بیشتر روی مسئله تمرکز می‌کنم', 'در گفتگوها بیشتر روی رابطه و فضای گفتگو تمرکز می‌کنم'],
    ['تصمیمی که کارآمدتر است را می‌پسندم', 'تصمیمی که برای افراد پذیرفتنی‌تر است را می‌پسندم'],
  ]),
  ...axisQuestions('jp', 'J', 'P', [
    ['برنامه و زمان‌بندی روشن به من آرامش می‌دهد', 'بازبودن مسیر و امکان تغییر به من آرامش می‌دهد'],
    ['دوست دارم کارها را زودتر جمع‌بندی کنم', 'دوست دارم تا زمان لازم، گزینه‌ها را باز نگه دارم'],
    ['فهرست کارها و نظم روزانه را مفید می‌دانم', 'انعطاف در برنامه روزانه را مفید می‌دانم'],
    ['پیش از شروع، مسیر انجام کار را مشخص می‌کنم', 'در مسیر انجام کار، روش مناسب را کشف می‌کنم'],
    ['تصمیم نهایی گرفتن را ترجیح می‌دهم', 'کاوش بیشتر پیش از تصمیم نهایی را ترجیح می‌دهم'],
    ['محیط مرتب و قابل پیش‌بینی را ترجیح می‌دهم', 'محیط پویا و قابل تغییر را ترجیح می‌دهم'],
    ['ضرب‌الاجل زودتر، انگیزه‌ام را منظم می‌کند', 'ضرب‌الاجل نزدیک، تمرکزم را بیشتر می‌کند'],
    ['پس از پایان کار، بستن پرونده برایم رضایت‌بخش است', 'پس از پایان کار، بازگذاشتن امکان اصلاح برایم رضایت‌بخش است'],
  ]),
];

const AXIS_META: Record<MbtiAxis, { positive: string; negative: string }> = {
  ei: { positive: 'E', negative: 'I' },
  sn: { positive: 'S', negative: 'N' },
  tf: { positive: 'T', negative: 'F' },
  jp: { positive: 'J', negative: 'P' },
};

const clarityForMargin = (margin: number): MbtiAxisResult['clarity'] => {
  if (margin <= 0) return 'نامشخص';
  if (margin <= 2) return 'نزدیک';
  if (margin <= 5) return 'روشن';
  return 'پررنگ';
};

export const calculateMbtiResult = (values: Record<string, unknown>): {
  axes: MbtiAxisResult[];
  type: string | null;
  isComplete: boolean;
} => {
  const axes = (Object.keys(AXIS_META) as MbtiAxis[]).map((axis) => {
    const meta = AXIS_META[axis];
    const questions = MBTI_QUESTIONS.filter((question) => question.axis === axis);
    const positiveScore = questions.filter((question) => String(values[question.key] || '').toUpperCase() === meta.positive).length;
    const negativeScore = questions.filter((question) => String(values[question.key] || '').toUpperCase() === meta.negative).length;
    const preference = positiveScore === negativeScore
      ? null
      : positiveScore > negativeScore ? meta.positive : meta.negative;
    return {
      axis,
      positive: meta.positive,
      negative: meta.negative,
      positiveScore,
      negativeScore,
      preference,
      clarity: clarityForMargin(Math.abs(positiveScore - negativeScore)),
    };
  });
  const isComplete = MBTI_QUESTIONS.every((question) => ['e', 'i', 's', 'n', 't', 'f', 'j', 'p'].includes(String(values[question.key] || '').toLowerCase()));
  const type = isComplete && axes.every((axis) => axis.preference)
    ? axes.map((axis) => axis.preference).join('')
    : null;
  return { axes, type, isComplete };
};

export const MBTI_TYPE_TITLES: Record<string, string> = {
  ISTJ: 'منظم و واقع‌گرا', ISFJ: 'حامی و دقیق', INFJ: 'معناگرا و آینده‌نگر', INTJ: 'راهبردی و مستقل',
  ISTP: 'عمل‌گرا و مسئله‌حل‌کن', ISFP: 'منعطف و ارزش‌محور', INFP: 'آرمان‌گرا و درون‌نگر', INTP: 'تحلیل‌گر و کنجکاو',
  ESTP: 'پرانرژی و عمل‌گرا', ESFP: 'اجتماعی و تجربه‌گرا', ENFP: 'ایده‌پرداز و الهام‌بخش', ENTP: 'نوآور و چالش‌گر',
  ESTJ: 'سازمان‌ده و نتیجه‌محور', ESFJ: 'همراه و مسئولیت‌پذیر', ENFJ: 'توسعه‌دهنده و ارتباط‌ساز', ENTJ: 'راهبردی و تصمیم‌گیر',
};
