import { invokeEmail } from './organizationEmail';

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
  moduleId,
  recordId,
}: SendEmailViaGatewayArgs): Promise<EmailGatewaySendResult> => {
  const recipients = to.map((v) => String(v || '').trim()).filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
  if (recipients.length === 0) throw new Error('آدرس ایمیل گیرنده معتبر نیست');
  if (!subject.trim() && !body.trim()) throw new Error('موضوع یا متن ایمیل الزامی است');

  return invokeEmail('send-email', { to: recipients, subject, body, module_id: moduleId, record_id: recordId, request_key: crypto.randomUUID() });
};
