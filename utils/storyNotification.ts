// ارسال اطلاع‌رسانی پیامکی هنگام انتشار استوری
// از همان زیرساخت SMS موجود در پروژه استفاده می‌کند

import { supabase } from '../supabaseClient';
import { sendSmsViaGateway } from './smsGateway';
import { isActiveProfileRow } from './activeProfileRecipients';

/**
 * دریافت شماره موبایل کاربران بر اساس آی‌دی‌هایشان
 */
async function resolvePhoneNumbers(userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('mobile_1, is_active')
    .in('id', userIds)
    .not('mobile_1', 'is', null);

  if (error || !data) return [];

  return data
    .filter(isActiveProfileRow)
    .map((row: { mobile_1: string | null }) => (row.mobile_1 || '').trim())
    .filter(Boolean);
}

/**
 * ارسال پیامک اطلاع‌رسانی برای استوری جدید
 *
 * @param storyId    آی‌دی استوری (برای metadata و لاگ)
 * @param text       متن پیامک
 * @param recipientIds آی‌دی کاربرانی که باید پیامک دریافت کنند
 */
export async function notifyStorySms(
  storyId: string,
  text: string,
  recipientIds: string[]
): Promise<void> {
  if (!storyId || !text.trim() || !recipientIds.length) return;

  try {
    const phones = await resolvePhoneNumbers(recipientIds);
    if (!phones.length) return;

    await sendSmsViaGateway({
      to: phones,
      text,
      title: 'اطلاع‌رسانی استوری',
      metadata: {
        source: 'story',
        story_id: storyId,
      },
    });
  } catch (err) {
    console.error('[storyNotification] خطا در ارسال پیامک:', err);
  }
}

/**
 * ارسال پیامک اطلاع‌رسانی از workflow (با template متنی)
 * متن می‌تواند شامل متغیرهایی مثل {{org_name}} یا {{creator_name}} باشد
 */
export async function notifyStorySmsFromWorkflow(options: {
  storyId: string;
  textTemplate: string;
  recipientUserIds: string[];
  templateVars?: Record<string, string>;
}): Promise<void> {
  const { storyId, textTemplate, recipientUserIds, templateVars = {} } = options;

  // جایگزینی متغیرها در قالب متن
  let text = textTemplate;
  Object.entries(templateVars).forEach(([key, val]) => {
    text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
  });

  await notifyStorySms(storyId, text, recipientUserIds);
}
