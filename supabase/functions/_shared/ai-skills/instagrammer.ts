import {
  canViewModuleWithPlan,
  isPlanFeatureEnabled,
  normalizeId,
  sharedRestSelect,
} from '../ai-grounding.ts';
import type { DomainSkillModule, SkillExecutionContext } from './types.ts';

export type InstagramMediaSnapshot = {
  id: string;
  account_id?: string | null;
  account_username?: string | null;
  media_type: 'post' | 'reel' | 'story';
  permalink: string;
  caption?: string | null;
  thumbnail_url?: string | null;
  media_url?: string | null;
  published_at?: string | null;
  expires_at?: string | null;
  is_expired?: boolean;
  likes_count?: number;
  comments_count?: number;
};

export type InstagramWorkflowRuleDraftInput = {
  name: string;
  description?: string | null;
  triggerScope: 'direct_general' | 'direct_story' | 'comment_general' | 'comment_media' | 'showcase_button_clicked';
  media?: {
    permalink?: string | null;
    media_type?: 'post' | 'reel' | 'story' | string | null;
    expires_at?: string | null;
  } | null;
  keywordContains?: string | null;
  buttonKey?: string | null;
  actionType: 'send_instagram_message' | 'reply_instagram_comment';
  replyMessage?: string | null;
  showcaseId?: string | null;
  isActive?: boolean;
};

export type InstagramShowcaseButtonInput = {
  key?: string | null;
  title: string;
  action_type: 'open_url' | 'send_message' | 'trigger_workflow' | 'field_value' | 'request_human';
  payload?: Record<string, any> | null;
};

export type InstagramShowcaseCardDraftInput = {
  name: string;
  description?: string | null;
  account_id?: string | null;
  source_kind?: 'manual' | 'price_list' | 'online_catalog';
  source_id?: string | null;
  image_url?: string | null;
  max_items?: number;
  buttons?: InstagramShowcaseButtonInput[];
  items?: Array<{
    source_module_id: 'products' | 'billboards' | 'product_bundles';
    source_record_id: string;
    title_override?: string | null;
    image_override_url?: string | null;
    snapshot?: Record<string, any>;
  }>;
};

const isValidHttpsUrl = (value: unknown): boolean => /^https:\/\/[^\s]+$/i.test(String(value || '').trim());

export const buildInstagramWorkflowRuleDraft = (input: InstagramWorkflowRuleDraftInput) => {
  const name = String(input?.name || '').trim();
  if (!name) {
    throw new Error('نام قانون پاسخ خودکار اینستاگرام مشخص نشده است.');
  }

  const conditions_all: Array<{ id: string; field: string; operator: string; value: any }> = [];

  if (input.triggerScope === 'direct_general' || input.triggerScope === 'direct_story') {
    conditions_all.push({ id: 'ig_evt_direct', field: 'event_type', operator: 'eq', value: 'direct_received' });
  } else if (input.triggerScope === 'comment_general' || input.triggerScope === 'comment_media') {
    conditions_all.push({ id: 'ig_evt_comment', field: 'event_type', operator: 'eq', value: 'comment_received' });
  } else if (input.triggerScope === 'showcase_button_clicked') {
    conditions_all.push({ id: 'ig_evt_btn', field: 'event_type', operator: 'eq', value: 'showcase_button_clicked' });
    if (String(input.buttonKey || '').trim()) {
      conditions_all.push({
        id: 'ig_btn_key',
        field: 'button_key',
        operator: 'eq',
        value: String(input.buttonKey).trim(),
      });
    }
  }

  if (input.triggerScope === 'direct_story') {
    const permalink = String(input.media?.permalink || '').trim();
    if (!permalink) {
      throw new Error('برای شرط اختصاصی استوری، انتخاب لینک (permalink) یک استوری فعال الزامی است.');
    }
    const expiresMs = Date.parse(String(input.media?.expires_at || ''));
    if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) {
      throw new Error('مهلت ۲۴ ساعته این استوری به پایان رسیده است؛ برای ساخت شرط جدید از استوری فعال استفاده کنید.');
    }
    conditions_all.push(
      { id: 'ig_media_link', field: 'media_permalink', operator: 'eq', value: permalink },
      { id: 'ig_media_type', field: 'media_type', operator: 'eq', value: 'story' },
    );
  } else if (input.triggerScope === 'comment_media') {
    const permalink = String(input.media?.permalink || '').trim();
    const mediaType = String(input.media?.media_type || '').toLowerCase() === 'reel' ? 'reel' : 'post';
    if (!permalink) {
      throw new Error('برای شرط اختصاصی پست یا ریل، ابتدا رسانه موردنظر باید انتخاب شود.');
    }
    conditions_all.push(
      { id: 'ig_media_link', field: 'media_permalink', operator: 'eq', value: permalink },
      { id: 'ig_media_type', field: 'media_type', operator: 'eq', value: mediaType },
    );
  }

  const keyword = String(input.keywordContains || '').trim();
  if (keyword) {
    conditions_all.push({
      id: 'ig_keyword',
      field: 'message_text',
      operator: 'contains',
      value: keyword,
    });
  }

  const replyMessage = String(input.replyMessage || '').trim();
  const showcaseId = String(input.showcaseId || '').trim() || '';
  if (input.actionType === 'reply_instagram_comment' && !replyMessage) {
    throw new Error('برای پاسخ خودکار به کامنت، متن پاسخ الزامی است.');
  }
  if (input.actionType === 'send_instagram_message' && !replyMessage && !showcaseId) {
    throw new Error('برای پاسخ دایرکت اینستاگرام، متن پیام یا شناسه ویترین دکمه‌دار باید مشخص شود.');
  }

  const action = input.actionType === 'reply_instagram_comment'
    ? {
        id: 'ig_act_1',
        type: 'reply_instagram_comment',
        config: {
          message: replyMessage,
          variable_field: '',
          variable_target: 'message',
        },
      }
    : {
        id: 'ig_act_1',
        type: 'send_instagram_message',
        config: {
          recipient_source: 'current_record',
          related_record_field: '',
          message: replyMessage,
          showcase_id: showcaseId,
          variable_field: '',
          variable_target: 'message',
        },
      };

  return {
    module_id: 'instagram_interaction_events',
    name,
    description: String(input.description || '').trim() || `قانون خودکار اینستاگرام برای ${name}`,
    trigger_type: 'on_create',
    execution_mode: 'first_match',
    is_active: input.isActive !== false,
    conditions_all,
    conditions_any: [],
    actions: [action],
  };
};

export const buildInstagramShowcaseCardDraft = (input: InstagramShowcaseCardDraftInput) => {
  const name = String(input?.name || '').trim();
  if (!name) {
    throw new Error('نام کارت یا ویترین اینستاگرام الزامی است.');
  }

  const imageUrl = String(input?.image_url || '').trim();
  if (imageUrl && !isValidHttpsUrl(imageUrl)) {
    throw new Error('نشانی تصویر کارت ویترین بر اساس مستندات رسمی اینستاگرام و قانون‌گذاری باید با https:// شروع شود.');
  }

  const allowedButtonTypes = new Set(['open_url', 'send_message', 'trigger_workflow', 'field_value', 'request_human']);
  const buttons = (Array.isArray(input?.buttons) ? input.buttons : [])
    .slice(0, 3)
    .map((btn, idx) => {
      const title = String(btn?.title || '').trim().slice(0, 80);
      const actionType = allowedButtonTypes.has(String(btn?.action_type || ''))
        ? btn.action_type
        : 'open_url';
      const payload = btn?.payload && typeof btn.payload === 'object' ? { ...btn.payload } : {};
      if (actionType === 'open_url' && payload.url && !isValidHttpsUrl(payload.url)) {
        throw new Error(`لینک دکمه «${title || idx + 1}» باید با https:// شروع شود.`);
      }
      return {
        key: String(btn?.key || `button_${idx + 1}`).trim() || `button_${idx + 1}`,
        title,
        action_type: actionType,
        payload,
      };
    })
    .filter((btn) => Boolean(btn.title));

  if ((input?.buttons || []).length > 3) {
    throw new Error('طبق محدودیت مستندات رسمی اینستاگرام و قانون‌گذاری، هر کارت ویترین اینستاگرام حداکثر ۳ دکمه می‌تواند داشته باشد.');
  }

  const sourceKind = ['manual', 'price_list', 'online_catalog'].includes(String(input?.source_kind || ''))
    ? input.source_kind!
    : 'manual';

  const items = (Array.isArray(input?.items) ? input.items : [])
    .filter((item) => ['products', 'billboards', 'product_bundles'].includes(String(item?.source_module_id || '')) && String(item?.source_record_id || '').trim())
    .slice(0, 10)
    .map((item, index) => {
      const overrideImg = String(item?.image_override_url || '').trim();
      if (overrideImg && !isValidHttpsUrl(overrideImg)) {
        throw new Error('تصویر اختصاصی آیتم کارت اینستاگرام باید نشانی معتبر https:// باشد.');
      }
      return {
        source_module_id: item.source_module_id,
        source_record_id: String(item.source_record_id).trim(),
        sort_order: index,
        title_override: item.title_override ? String(item.title_override).trim() : null,
        image_override_url: overrideImg || null,
        snapshot: item.snapshot && typeof item.snapshot === 'object' ? item.snapshot : {},
      };
    });

  return {
    name,
    description: input.description ? String(input.description).trim() : null,
    account_id: input.account_id ? String(input.account_id).trim() : null,
    source_kind: sourceKind,
    source_id: input.source_id ? String(input.source_id).trim() : null,
    presentation: {
      layout: 'carousel',
      max_items: Math.min(10, Math.max(1, Number(input.max_items || Math.max(items.length, 1)))),
      image_url: imageUrl || null,
    },
    button_templates: buttons,
    items,
    boxapi_preview_mode: imageUrl || items.some((i) => i.image_override_url || i.snapshot?.image_url)
      ? 'send_generic_template'
      : 'send_message_buttons',
  };
};

export const instagrammerSkill: DomainSkillModule = {
  agentKey: 'instagrammer',
  titleFa: 'ایجنت اینستاگرامر',
  buildContractPrompt: () => [
    '## قرارداد تخصصی ایجنت اینستاگرامر (تقویم محتوایی + صندوق اینستاگرام + قانون‌گذاری رسمی)',
    '1. **تسلط بر تقویم محتوایی و زمان‌بندی انتشار (`content_calendars`)**:',
    '   - برنامه‌ریزی و تدوین تقویم انتشار پست، ریلز و استوری؛ بازبینی وضعیت انتشار (پیش‌نویس، آماده انتشار، منتشرشده) و تدوین کپشن، هشتگ‌ها و نوع رسانه.',
    '   - هماهنگ‌سازی زمان‌بندی محتوا با کمپین‌های تبلیغاتی و بررسی اثربخشی تعاملات بر اساس تاریخ‌های تقویم محتوایی.',
    '2. **مشاهده و ارائه پست‌ها، ریل‌ها و استوری‌ها برای انتخاب کاربر**:',
    '   - همیشه فهرست پست‌ها و ریل‌ها (`instagram_social_media`) و استوری‌های فعالِ دارای ریپلای (`instagram_interaction_events` با `media_type=story` و مهلت ۲۴ ساعته منقضی‌نشده) را همراه کپشن، لینک و تصویر برای تأیید یا انتخاب کاربر نمایش بده.',
    '3. **ساخت و مدیریت قوانین پاسخ خودکار اینستاگرام (`workflows` روی `instagram_interaction_events`)**:',
    '   - تفکیک دقیق بین ۴ سطح شرط مطابق پنل پروژه:',
    '     • دایرکت عمومی (`event_type = direct_received` بدون `media_permalink`)',
    '     • دایرکت ریپلای یک استوری خاص (`event_type = direct_received` + `media_permalink` + `media_type = story` و فقط استوری فعال)',
    '     • کامنت عمومی (`event_type = comment_received` بدون `media_permalink`)',
    '     • کامنت یک پست یا ریل خاص (`event_type = comment_received` + `media_permalink` + `media_type = post|reel`)',
    '     • کلیک دکمه ویترین (`event_type = showcase_button_clicked` + `button_key`)',
    '   - اکشن‌های مجاز: `reply_instagram_comment` و `send_instagram_message` (با پیام یا `showcase_id`).',
    '4. **ساخت کارت‌های عکس و دکمه‌دار (`instagram_product_showcases`) با تسلط به مستندات رسمی اینستاگرام و قانون‌گذاری**:',
    '   - اگر کارت دارای تصویر با نشانی `https://` است، خروجی با `send_generic_template` (۱ تا ۱۰ کارت) و حداکثر ۳ دکمه رسمی (`web_url` با لینک `https://` یا `postback` برای اکشن داخلی) ارسال می‌شود؛ در غیر این صورت `send_message` دکمه‌دار است.',
    '5. **خط قرمزهای مستندات رسمی اینستاگرام و قانون‌گذاری (ممنوعیت‌ها)**:',
    '   - ارسال دایرکت انبوه یا سرد (Cold DM) بدون تعامل قبلی مخاطب مطلقاً ممنوع است.',
    '   - Private Reply به کامنت فقط تا ۷ روز پس از کامنت و برای مخاطب بدون دایرکت قبلی مجاز است.',
    '   - قابلیت‌های مستندنشده در قانون‌گذاری رسمی اینستاگرام مثل «لایک/Reaction پیام دایرکت» یا «ریپلای به یک پیام مشخص در دایرکت» را هرگز به‌عنوان قابلیت قابل انجام وعده نده.',
    '   - پیش از ذخیره قانون گردش‌کار، ساخت ویترین یا ارسال پیام دایرکت/کامنت واقعی به مخاطب، حتماً پیش‌نمایش دقیق و لیست گزینه‌ها را برای تأیید کاربر نمایش بده.',
  ].join('\n'),
  gatherDomainContext: async (ctx: SkillExecutionContext) => {
    const orgId = normalizeId(ctx.grounding.orgId);
    if (!orgId || ctx.grounding.freeChatMode) return null;
    const perms = ctx.authContext?.permissions;
    const plan = ctx.grounding.planContext;
    if (!isPlanFeatureEnabled(plan, 'instagram_inbox')) {
      return { feature_disabled: true, reason_fa: 'امکانات صندوق اینستاگرام در پلن فعلی سازمان فعال نیست.' };
    }
    if (!canViewModuleWithPlan(plan, perms, 'instagram_conversations')) {
      return { rbac_restricted: true, reason_fa: 'نقش کاربر دسترسی مشاهده صندوق اینستاگرام را ندارد.' };
    }

    const nowIso = new Date().toISOString();
    const [accounts, postsAndReels, activeStoryEvents, unresolvedComments, showcases, igWorkflows, contentCalendars] = await Promise.all([
      sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'instagram_accounts', {
        org_id: `eq.${orgId}`,
        is_active: 'eq.true',
        select: 'id,username,display_name,profile_photo_url,expires_at',
        limit: 10,
      }),
      sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'instagram_social_media', {
        org_id: `eq.${orgId}`,
        'media_type': 'in.(post,reel)',
        select: 'id,account_id,media_type,caption,thumbnail_url,media_url,permalink,metrics,published_at',
        order: 'published_at.desc',
        limit: 12,
      }),
      sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'instagram_interaction_events', {
        org_id: `eq.${orgId}`,
        event_type: 'eq.direct_received',
        media_type: 'eq.story',
        media_expires_at: `gt.${nowIso}`,
        select: 'id,account_id,account_username,media_permalink,media_thumbnail_url,media_expires_at,message_text,occurred_at',
        order: 'occurred_at.desc',
        limit: 20,
      }),
      sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'instagram_comments', {
        org_id: `eq.${orgId}`,
        status: 'in.(new,open,pending)',
        select: 'id,media_id,author_username,author_name,content_text,status,commented_at',
        order: 'commented_at.desc',
        limit: 15,
      }),
      sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'instagram_product_showcases', {
        org_id: `eq.${orgId}`,
        select: 'id,account_id,name,description,source_kind,presentation,button_templates,is_active',
        order: 'updated_at.desc',
        limit: 12,
      }),
      sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'workflows', {
        org_id: `eq.${orgId}`,
        module_id: 'eq.instagram_interaction_events',
        select: 'id,name,description,trigger_type,conditions_all,actions,is_active,updated_at',
        order: 'updated_at.desc',
        limit: 25,
      }),
      canViewModuleWithPlan(plan, perms, 'content_calendars')
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'content_calendars', {
            org_id: `eq.${orgId}`,
            select: 'id,title,scheduled_at,status,channel,media_type,caption,tags,assignee_id',
            order: 'scheduled_at.desc',
            limit: 20,
          })
        : Promise.resolve([]),
    ]);

    const accountUsernameById = new Map((accounts || []).map((a: any) => [String(a.id), String(a.username || '')]));
    const uniqueStoriesMap = new Map<string, InstagramMediaSnapshot>();
    for (const ev of activeStoryEvents || []) {
      const permalink = String(ev?.media_permalink || '').trim();
      if (!permalink || uniqueStoriesMap.has(permalink)) continue;
      uniqueStoriesMap.set(permalink, {
        id: permalink,
        account_id: ev.account_id ? String(ev.account_id) : null,
        account_username: ev.account_username || accountUsernameById.get(String(ev.account_id || '')) || null,
        media_type: 'story',
        permalink,
        caption: ev.message_text ? `آخرین ریپلای: ${String(ev.message_text).slice(0, 80)}` : 'استوری فعال',
        thumbnail_url: ev.media_thumbnail_url || null,
        media_url: null,
        published_at: ev.occurred_at || null,
        expires_at: ev.media_expires_at || null,
        is_expired: false,
      });
    }

    const mediaSnapshots: InstagramMediaSnapshot[] = [
      ...Array.from(uniqueStoriesMap.values()).slice(0, 6),
      ...(postsAndReels || []).slice(0, 8).map((m: any) => ({
        id: String(m.id),
        account_id: m.account_id ? String(m.account_id) : null,
        account_username: accountUsernameById.get(String(m.account_id || '')) || null,
        media_type: (m.media_type === 'reel' ? 'reel' : 'post') as 'post' | 'reel',
        permalink: String(m.permalink || ''),
        caption: m.caption ? String(m.caption).slice(0, 140) : null,
        thumbnail_url: m.thumbnail_url || m.media_url || null,
        media_url: m.media_url || null,
        published_at: m.published_at || null,
        expires_at: null,
        is_expired: false,
        likes_count: Number(m?.metrics?.like_count || 0),
        comments_count: Number(m?.metrics?.comments_count || 0),
      })),
    ];

    return {
      connected_accounts: (accounts || []).map((a: any) => ({
        username: a.username,
        display_name: a.display_name,
        expires_at: a.expires_at,
      })),
      media_cards: mediaSnapshots,
      unresolved_comments: unresolvedComments || [],
      active_showcases: (showcases || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        source_kind: s.source_kind,
        is_active: s.is_active !== false,
        button_count: Array.isArray(s.button_templates) ? s.button_templates.length : 0,
        has_image: Boolean(s?.presentation?.image_url),
      })),
      existing_instagram_workflows: (igWorkflows || []).map((w: any) => ({
        name: w.name,
        is_active: w.is_active !== false,
        conditions_all: w.conditions_all,
        actions_count: Array.isArray(w.actions) ? w.actions.length : 0,
      })),
      content_calendar_items: (contentCalendars || []).map((c: any) => ({
        id: c.id,
        title: c.title,
        scheduled_at: c.scheduled_at,
        status: c.status,
        channel: c.channel,
        media_type: c.media_type,
        caption: c.caption ? String(c.caption).slice(0, 120) : null,
      })),
    };
  },
};
