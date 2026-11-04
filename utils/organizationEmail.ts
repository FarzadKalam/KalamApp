import { supabase } from '../supabaseClient';
import { getSelectedOrganizationId } from './organizationContext';
import { toFaErrorMessage } from './errorMessageFa';

export type EmailAccount = { id: string; org_id: string; label: string; address: string; mode: 'custom' | 'managed'; status: string; is_active: boolean; receive_enabled: boolean; last_sync_at?: string; connection_config?: any };
export type EmailMessage = { id: string; org_id: string; account_id: string; thread_id: string; direction: 'inbound' | 'outbound'; source: string; from_address: string; from_name?: string; to_addresses: string[]; cc_addresses: string[]; subject: string; body_text: string; status: string; error_message?: string; message_at: string; is_read?: boolean; attachments: { name: string; size?: number; path: string }[] };
export const EMAIL_STATUS_LABELS: Record<string, string> = { queued: 'در صف ارسال', sending: 'در حال ارسال', provider_accepted: 'پذیرفته‌شده توسط سرور؛ تحویل تأیید نشده', delivered: 'تحویل تأیید شده', bounced: 'برگشت خورده', failed: 'ارسال ناموفق', received: 'دریافت شده', unknown_delivery: 'نتیجه نامشخص؛ پیش از ارسال دوباره بررسی کنید' };
export const isEmailAddress = (value: unknown): value is string => typeof value === 'string' && value.length <= 254 && /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(value);
export const isEmailField = (field: { key?: string; type?: unknown }) => String(field.type).toLowerCase() === 'email' || /(^|_)e?mail($|_)/i.test(String(field.key || ''));
export async function invokeEmail<T = any>(endpoint: 'email-admin' | 'send-email', body: Record<string, unknown>): Promise<T> {
  const org = getSelectedOrganizationId();
  const { data, error } = await supabase.functions.invoke(endpoint, { body, headers: org ? { 'x-client-info': `kalamapp; org=${org}` } : undefined });
  if (error) {
    const payload = await error.context?.clone?.().json().catch(() => null);
    const failure: any = new Error(toFaErrorMessage(payload?.message || error, 'ارتباط با سرویس ایمیل برقرار نشد.'));
    failure.transportAccepted = payload?.transport_accepted === true;
    failure.retrySafe = payload?.retry_safe === true;
    throw failure;
  }
  if (!data?.success) throw new Error(data?.message || 'عملیات ایمیل انجام نشد.');
  return data;
}
export async function listEmailMessages(folder: string, before?: EmailMessage, threadId?: string): Promise<EmailMessage[]> {
  const { data, error } = await supabase.rpc('email_list_messages', { p_folder: folder, p_limit: 40, p_before: before?.message_at || null, p_before_id: before?.id || null, p_thread_id: threadId || null });
  if (error) throw new Error('دریافت ایمیل‌ها ممکن نشد. دسترسی و فعال بودن ایمیل سازمان را بررسی کنید.');
  return data || [];
}
