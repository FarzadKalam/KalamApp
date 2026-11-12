import { sharedRestSelect, canViewModuleWithPlan, normalizeId } from '../ai-grounding.ts';
import type { DomainSkillModule, SkillExecutionContext } from './types.ts';

export const customerResponseSkill: DomainSkillModule = {
  agentKey: 'customer_response',
  titleFa: 'ایجنت پاسخگویی مشتری',
  buildContractPrompt: () => [
    '## قرارداد تخصصی ایجنت پاسخگویی مشتری',
    '1. **نمای یکپارچه ارتباطی مشتری (Omnichannel View)**:',
    '   - برای پیگیری وضعیت یک مشتری، سوابق مجاز بات‌ها (`counterparty_bot_direct_messages`)، پیامک‌ها (`outbound_messages`)، تماس‌های تلفنی (`voip_call_logs`)، فاکتورها و فعالیت‌های باز او را کنار هم تحلیل کن.',
    '2. **پیگیری واقعی از همکار مسئول (Staff Relay — با کنترل تکراری و دسترسی)**:',
    '   - وقتی برای پاسخ دقیق به مشتری نیاز به استعلام زمان تحویل، تأیید تخفیف یا وضعیت اجرا است، می‌توانی از ابزار رله داخلی (`relay_to_responsible_staff`) به مسئول مرتبط پیام ارسال کنی و پاسخ را بعداً در صندوق ایجنت جمع‌بندی کنی.',
    '3. **ایزولاسیون امنیتی در پاسخ بیرونی**:',
    '   - در مکالمه مستقیم با مشتری (`customer_auto_reply`), **مطلقاً** اطلاعات محرمانه داخلی (حاشیه سود، قیمت خرید، ترازنامه، نام داخلی پرسنل یا یادداشت‌های داخلی) را فاش نکن، ریسک غیردستوری نساز و اگر درخواست نامطمئن است به مسئول مربوط ارجاع بده.',
  ].join('\n'),
  gatherDomainContext: async (ctx: SkillExecutionContext) => {
    const orgId = normalizeId(ctx.grounding.orgId);
    if (!orgId || ctx.grounding.freeChatMode) return null;
    const perms = ctx.authContext?.permissions;
    const plan = ctx.grounding.planContext;
    const bundle: Record<string, any> = {};

    const customerId = ctx.pageContext?.moduleId === 'customers' && ctx.pageContext?.recordId
      ? String(ctx.pageContext.recordId)
      : null;

    const [recentBotMessages, recentSms, recentCalls] = await Promise.all([
      canViewModuleWithPlan(plan, perms, 'customers')
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'counterparty_bot_direct_messages', {
            org_id: `eq.${orgId}`,
            ...(customerId ? { customer_id: `eq.${customerId}` } : {}),
            select: 'id,channel_type,direction,message_text,customer_id,created_at',
            order: 'created_at.desc',
            limit: 10,
          })
        : Promise.resolve([]),
      canViewModuleWithPlan(plan, perms, 'customers')
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'outbound_messages', {
            org_id: `eq.${orgId}`,
            channel_type: 'eq.sms',
            ...(customerId ? { customer_id: `eq.${customerId}` } : {}),
            select: 'id,customer_id,recipient,title,message_text,status,sent_at,created_at',
            order: 'created_at.desc',
            limit: 8,
          })
        : Promise.resolve([]),
      sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'voip_call_logs', {
        org_id: `eq.${orgId}`,
        select: 'id,direction,status,source_number,destination_number,extension,created_at',
        order: 'created_at.desc',
        limit: 8,
      }),
    ]);

    if (recentBotMessages.length) bundle.recent_bot_messages = recentBotMessages;
    if (recentSms.length) bundle.recent_sms_messages = recentSms;
    if (recentCalls.length) bundle.recent_voip_calls = recentCalls;
    return bundle;
  },
};
