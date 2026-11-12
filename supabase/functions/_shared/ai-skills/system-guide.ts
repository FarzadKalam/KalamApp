import { normalizeId, sharedRestSelect } from '../ai-grounding.ts';
import type { DomainSkillModule, SkillExecutionContext } from './types.ts';

const stripHtml = (raw: unknown): string =>
  String(raw || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const extractTutorialBlocksSummary = (
  contentBlocks: unknown,
): {
  textStepsSummary: string;
  recordedVideos: Array<{ kind: 'video_file' | 'video_embed'; title: string; url: string }>;
  imageCount: number;
} => {
  const blocks = Array.isArray(contentBlocks) ? contentBlocks : [];
  const textParts: string[] = [];
  const recordedVideos: Array<{ kind: 'video_file' | 'video_embed'; title: string; url: string }> = [];
  let imageCount = 0;

  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const type = String(block.type || '').trim();
    if (type === 'heading' && block.content) {
      textParts.push(`• ${stripHtml(block.content)}`);
    } else if (type === 'paragraph' && block.content) {
      const clean = stripHtml(block.content);
      if (clean) textParts.push(clean.slice(0, 280));
    } else if (type === 'checklist' && Array.isArray(block.items)) {
      const items = block.items
        .map((it: any) => String(it?.text || '').trim())
        .filter(Boolean)
        .slice(0, 6);
      if (items.length) textParts.push(`گام‌ها: ${items.join('؛ ')}`);
    } else if (type === 'alert' && block.content) {
      textParts.push(`نکته: ${stripHtml(block.title ? `${block.title}: ${block.content}` : block.content).slice(0, 220)}`);
    } else if (type === 'video_file' && block.url) {
      recordedVideos.push({
        kind: 'video_file',
        title: String(block.title || 'ویدیوی آموزشی ضبط‌شده').trim(),
        url: String(block.url).trim(),
      });
    } else if (type === 'video_embed' && (block.url || block.embed_id)) {
      const platform = String(block.platform || 'aparat').trim();
      const url = String(block.url || '').trim()
        || (platform === 'aparat'
          ? `https://www.aparat.com/v/${String(block.embed_id)}`
          : platform === 'youtube'
          ? `https://www.youtube.com/watch?v=${String(block.embed_id)}`
          : String(block.embed_id));
      recordedVideos.push({
        kind: 'video_embed',
        title: `ویدیو (${platform})`,
        url,
      });
    } else if (type === 'image') {
      imageCount += 1;
    } else if (type === 'gallery' && Array.isArray(block.images)) {
      imageCount += block.images.length;
    }
  }

  return {
    textStepsSummary: textParts.join('\n').slice(0, 1200),
    recordedVideos,
    imageCount,
  };
};

export const buildSystemGuideSoftwareArchitectureReference = (): string => [
  '## نقشه جامع ساختار و قابلیت‌های نرم‌افزار تازه‌سیستم (KalamApp)',
  '- **داشبورد و میز کار (`/`)**: کارت‌های خلاصه عملکرد، نوار انیمیشنی وضعیت ایجنت‌های فعال هوش مصنوعی، ویجت گزارش‌ها، تقویم جلالی و دسترسی سریع به ثبت رکوردها.',
  '- **فروش و مشتریان**: مشتریان (`customers`)، سرنخ‌های بازاریابی (`marketing_leads`)، کالاها و خدمات (`products`)، لیست قیمت‌ها (`price_lists` با قابلیت «قیمت پیش‌فرض» و هماهنگ‌سازی با کالا)، پکیج‌ها (`product_bundles`)، پیش‌فاکتور و فاکتور فروش (`invoices` شامل جدول اقلام، تخفیف سطری و کلی، ارزش افزوده، جدول دریافت‌ها `payments` و لینک فاکتور آنلاین)، و فاکتور برگشت از فروش (`sales_return_invoices`).',
  '- **خرید، تأمین و انبارداری**: تأمین‌کنندگان (`suppliers`)، فاکتور خرید (`purchase_invoices`)، برگشت از خرید (`purchase_return_invoices`)، انبارها (`warehouses`)، قفسه‌ها (`shelves`) و حواله انتقال انبار (`stock_transfers`).',
  '- **تولید و فرمول‌ها**: فرمول‌های تولید/BOM (`production_boms`)، سفارش تولید (`production_orders`)، سفارش گروهی (`production_group_orders`) و فرمول‌های محاسبه (`calculation_formulas`).',
  '- **پروژه و فرآیندهای V2**: پروژه‌ها (`projects`)، فعالیت‌ها/تسک‌ها (`tasks`)، الگوهای فرآیند (`process_templates` با مراحل، مسئول نقش/کاربر، فیلدها و وضعیت‌های اختصاصی و اتوماسیون‌ها) و اجرای فرآیند (`process_runs` با نمای کامل، فشرده و ستونی).',
  '- **حسابداری و خزانه**: سال مالی (`fiscal_years`)، سرفصل‌های حساب (`chart_of_accounts`)، اسناد حسابداری (`journal_entries`)، قوانین رویداد حسابداری (`accounting_event_rules`)، مراکز هزینه (`cost_centers`)، صندوق‌ها (`cash_boxes`)، حساب‌های بانکی (`bank_accounts`)، تنخواه (`petty_funds`)، چک‌ها (`cheques`)، تهاتر (`barters`)، عملیات دریافت/پرداخت (`cash_bank_operations`) و اسناد هزینه (`expense_documents`).',
  '- **منابع انسانی (HR)**: پرسنل (`employees`)، شرح شغل‌ها (`job_descriptions`)، متقاضیان استخدام (`recruitment_applicants`)، برنامه کاری (`work_schedules`)، ترددها (`attendance_logs`)، مرخصی (`leave_requests`)، اضافه‌کار (`overtime_requests`)، مأموریت (`mission_requests`)، مساعده/پاداش/جریمه، قراردادها و فیش حقوقی (`payroll_slips`).',
  '- **رزرواسیون**: منابع رزرواسیون (`reservation_resources`) و رزروها (`reservations`) با کنترل تداخل، بافر آماده‌سازی، تعطیلات رسمی جلالی و دریافت بیعانه.',
  '- **اینستاگرام و اتوماسیون (مطابق مستندات رسمی اینستاگرام و قانون‌گذاری)**: صندوق گفتگوهای اینستاگرام (`instagram_conversations`)، رویدادهای تعاملی (`instagram_interaction_events`)، گردش‌کارها (`workflows`) برای پاسخ خودکار دایرکت، کامنت و ریپلای استوری و ویترین کارت‌های عکس و دکمه‌دار (حداکثر ۳ دکمه با لینک HTTPS یا postback).',
  '- **ارتباطات، پیام‌رسانی و هوش مصنوعی**:',
  '  - پاپ‌اور/صفحه پیام‌رسانی یکپارچه با حباب «ایجنت‌ها» (`agent:<agent_key>`) دارای اولویت بالا (priority=10) و پشتیبانی از فایل/تصویر/صوت.',
  '  - صفحه «مرکز کنترل و میز کار ایجنت‌ها» (`/ai/agents`) برای تنظیم لحن، ویزارد پرسش‌وپاسخ اختصاصی سازمان، دسترسی همکاران، آمار کش پرامپت و تأیید عملیات در انتظار.',
  '  - اتصال بات پرسنلی (تلگرام/بله/روبیکا) در صفحه پروفایل (`/profile`) با کد اتصال یک‌بارمصرف ۶ رقمی.',
  '  - دستیار هوش مصنوعی چندمهارته و چندایجنتی شامل مهارت «تنظیم قیمت» برای بروزرسانی گروهی یا تصویری قیمت‌ها با حفظ تخفیف پکیج‌ها و پیش‌فاکتورها و مدیریت برچسب‌ها (`tags` و `record_tags`).',
  '- **تنظیمات و حاکمیت (`/settings`)**: اطلاعات شرکت، تنظیمات هوش مصنوعی، نقش‌ها و دسترسی‌های دقیق (`view`/`edit`/`delete`/فیلد و رکورد)، گزینه‌های داینامیک و ماژول‌های فعال بر اساس پلن.',
].join('\n');

const inferHelpContexts = (pageContext: any): string[] => {
  const contexts: string[] = [];
  const moduleId = String(pageContext?.moduleId || '').trim();
  const route = String(pageContext?.route || '').trim().toLowerCase();
  if (moduleId) {
    contexts.push(`module:${moduleId}`, `module:${moduleId}:list`, `module:${moduleId}:show`, `module:${moduleId}:form`);
  }
  if (route.includes('ai')) contexts.push('page:ai');
  if (route.includes('setting')) contexts.push('page:settings');
  if (route.includes('account')) contexts.push('page:accounting');
  if (route.includes('hr')) contexts.push('page:hr');
  if (route.includes('report')) contexts.push('page:reports');
  if (!contexts.length) contexts.push('page:dashboard');
  return Array.from(new Set(contexts));
};

export const systemGuideSkill: DomainSkillModule = {
  agentKey: 'system_guide',
  titleFa: 'ایجنت راهنمای تازه‌سیستم',
  buildContractPrompt: (ctx: SkillExecutionContext) => {
    const orgPolicy = ctx.grounding.agentStates?.system_guide?.config?.policy_json || {};
    const orgCustomization = Object.keys(orgPolicy).length > 0
      ? `\n- **شخصی‌سازی اختصاصی این سازمان برای آموزش**: ${JSON.stringify(orgPolicy)}`
      : '';
    return [
      '## قرارداد تخصصی ایجنت راهنمای تازه‌سیستم (`system_guide`)',
      'تو مربی رسمی و دقیق کار با نرم‌افزار تازه‌سیستم (KalamApp) هستی و سه منبع زیر را با هم ترکیب می‌کنی:',
      '1. **آموزش‌های متنی و ویدیوهای ضبط‌شده رسمی**: از `published_tutorials` (و `contextual_tutorials` متناسب با صفحه جاری کاربر) گام‌های عملی را بگو و اگر ویدیوی ضبط‌شده (`recorded_videos`) وجود داشت، عنوان و لینک آن و مسیر آموزش (`/learn/<slug>`) را حتماً معرفی کن.',
      '2. **ساختار واقعی ماژول‌ها، مسیرها و قوانین نرم‌افزار**: بر اساس نقشه نرم‌افزار زیر و دستورالعمل‌های سازمان (`instructions` و `job_descriptions`) دقیقاً بگو کاربر وارد کدام منو/مسیر شود، کدام دکمه یا تب را بزند و چه پیش‌نیاز/دسترسی‌ای نیاز دارد. هرگز کلید محرمانه، کد داخلی یا UUID خام را نمایش نده.',
      '3. **سفارشی‌سازی هر سازمان**: رویه آموزش و اصطلاحات را مطابق پاسخ‌های ویزارد و سیاست ثبت‌شده همان سازمان (`org_ai_agent_configs`) و سطح دسترسی (`permissions`) همان کاربر تنظیم کن؛ اگر بخشی برای نقش این کاربر بسته است یا در پلن فعال نیست، محترمانه یادآوری کن از مدیر سیستم بررسی کند.',
      buildSystemGuideSoftwareArchitectureReference(),
      orgCustomization,
    ].filter(Boolean).join('\n');
  },
  gatherDomainContext: async (ctx: SkillExecutionContext) => {
    const orgId = normalizeId(ctx.grounding.orgId);
    if (!orgId || ctx.grounding.freeChatMode) return null;

    const helpContexts = inferHelpContexts(ctx.pageContext);

    const [tutorialPosts, tutorialSeries, blogPosts, contextualTutorials] = await Promise.all([
      sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'cms_tutorial_posts', {
        status: 'eq.published',
        select: 'id,title,slug,excerpt,content_blocks,difficulty_level,duration_minutes,series_id,help_contexts,help_group',
        order: 'is_featured.desc,published_at.desc',
        limit: 25,
      }),
      sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'cms_tutorial_series', {
        select: 'id,title,slug,description',
        order: 'sort_order.asc',
        limit: 12,
      }),
      sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'cms_blog_posts', {
        status: 'eq.published',
        select: 'title,slug,excerpt',
        order: 'published_at.desc',
        limit: 6,
      }),
      fetch(`${ctx.supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/get_cms_contextual_tutorial_posts`, {
        method: 'POST',
        headers: {
          apikey: ctx.serviceRoleKey,
          Authorization: `Bearer ${ctx.serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_contexts: helpContexts,
          p_limit: 8,
        }),
      })
        .then((res) => (res.ok ? res.json() : []))
        .catch(() => []),
    ]);

    const q = String(ctx.userMessage || '').toLowerCase();
    const tokens = q
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);

    const scoreTutorial = (post: any): number => {
      const hay = `${post?.title || ''} ${post?.excerpt || ''} ${post?.help_group || ''}`.toLowerCase();
      return tokens.reduce((sum, tk) => (hay.includes(tk) ? sum + 1 : sum), 0);
    };

    const sortedTutorials = [...tutorialPosts]
      .sort((a, b) => scoreTutorial(b) - scoreTutorial(a))
      .slice(0, 8)
      .map((post: any) => {
        const extracted = extractTutorialBlocksSummary(post?.content_blocks);
        return {
          title: post.title,
          url: `/learn/${post.slug}`,
          excerpt: post.excerpt || null,
          difficulty_level: post.difficulty_level || null,
          duration_minutes: post.duration_minutes || null,
          help_group: post.help_group || null,
          summary: extracted.textStepsSummary,
          recorded_videos: extracted.recordedVideos,
          has_images: extracted.imageCount > 0,
        };
      });

    const contextualList = (Array.isArray(contextualTutorials) ? contextualTutorials : [])
      .slice(0, 5)
      .map((post: any) => {
        const extracted = extractTutorialBlocksSummary(post?.content_blocks);
        return {
          title: post.title,
          url: `/learn/${post.slug}`,
          excerpt: post.excerpt || null,
          help_group: post.help_group || null,
          recorded_videos: extracted.recordedVideos,
        };
      });

    const guideConfig = ctx.grounding.agentStates?.system_guide?.config || null;

    return {
      org_training_customization: guideConfig?.policy_json || {},
      user_accessible_instructions_count: ctx.grounding.instructions?.length || 0,
      user_accessible_job_descriptions_count: ctx.grounding.jobDescriptions?.length || 0,
      contextual_tutorials: contextualList,
      published_tutorials: sortedTutorials,
      tutorial_series: tutorialSeries.map((s: any) => ({
        title: s.title,
        slug: s.slug,
        description: s.description || null,
      })),
      recent_blog_guides: blogPosts.map((b: any) => ({
        title: b.title,
        url: `/blog/${b.slug}`,
        excerpt: b.excerpt || null,
      })),
    };
  },
};
