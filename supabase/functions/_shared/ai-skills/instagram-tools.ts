import { loadInstagramDomainContext, type InstagramMediaSnapshot } from './instagrammer.ts';
import type { SkillExecutionContext } from './types.ts';

/** Read-only, model-selected domain access; assembling a persona never loads media. */
export const createInstagramReadToolRuntime = (ctx: SkillExecutionContext,
  load: typeof loadInstagramDomainContext = loadInstagramDomainContext) => {
  const state = ctx.grounding.agentStates?.instagrammer;
  if (!ctx.selectedAgents.includes('instagrammer') || ctx.grounding.freeChatMode
    || !state?.canUse || !state.canView || !state.canChat) return null;
  const mediaCards: InstagramMediaSnapshot[] = [];
  return {
    mediaCards,
    tools: [{ type: 'function', function: { name: 'read_instagram_context',
      description: 'خواندن زمینهٔ مجاز حساب، رسانه، کامنت و قانون اینستاگرام فقط در صورت نیاز درخواست. نمایش کارت رسانه اختیاری است؛ نام کانال جذب یا اسکرین‌شات دایرکت برای ثبت لید دلیل استفاده نیست.',
      parameters: { type: 'object', properties: { showMediaCards: { type: 'boolean' }, mediaIds: { type: 'array', items: { type: 'string' }, maxItems: 14 } }, additionalProperties: false } } }],
    execute: async (args: { showMediaCards?: boolean; mediaIds?: string[] }) => {
      if ((args.showMediaCards !== undefined && typeof args.showMediaCards !== 'boolean')
        || (args.mediaIds !== undefined && (!Array.isArray(args.mediaIds) || args.mediaIds.length > 14
          || args.mediaIds.some(id => typeof id !== 'string' || id.length > 512)))) throw new Error('درخواست نمایش رسانه معتبر نیست.');
      const data = await load(ctx);
      if (!data || data.feature_disabled || data.rbac_restricted) return { success: false, message: data?.reason_fa || 'خواندن زمینهٔ اینستاگرام مجاز نیست.' };
      const available = Array.isArray(data.media_cards) ? data.media_cards as InstagramMediaSnapshot[] : [];
      if (args.showMediaCards === true) {
        const ids = Array.isArray(args.mediaIds) ? new Set(args.mediaIds.map(String)) : null;
        const selected = available.filter(card => !ids || ids.has(card.id)).slice(0, 14);
        // Keep the array identity: streaming and buffered responses share this result.
        mediaCards.splice(0, mediaCards.length, ...selected);
      }
      if (args.showMediaCards === false) mediaCards.splice(0);
      return { success: true, ...data, displayedMediaCount: mediaCards.length };
    },
  };
};
