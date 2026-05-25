import { supabase } from '../supabaseClient';

export type EmailGatewaySendResult = {
  success: boolean;
  sent?: number;
  message?: string;
};

export type SendEmailViaGatewayArgs = {
  to: string[];
  subject: string;
  body: string;
  moduleId?: string;
  recordId?: string;
  metadata?: Record<string, any>;
};

export const sendEmailViaGateway = async ({
  to,
  subject,
  body,
}: SendEmailViaGatewayArgs): Promise<EmailGatewaySendResult> => {
  const recipients = to.map((v) => String(v || '').trim()).filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
  if (recipients.length === 0) throw new Error('آدرس ایمیل گیرنده معتبر نیست');
  if (!subject.trim() && !body.trim()) throw new Error('موضوع یا متن ایمیل الزامی است');

  const { data, error } = await supabase.functions.invoke('send-email', {
    body: { to: recipients, subject, body },
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.message || 'خطا در ارسال ایمیل');
  return data as EmailGatewaySendResult;
};
