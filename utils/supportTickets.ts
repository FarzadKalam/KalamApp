import { supabase } from '../supabaseClient';

export const SUPPORT_BUCKET = 'saas-support-private';
export const SUPPORT_STATUS: Record<string, { title: string; color: string }> = {
  waiting_operator: { title: 'منتظر پاسخ اوپراتور', color: 'orange' },
  in_review: { title: 'در حال بررسی', color: 'blue' },
  answered: { title: 'پاسخ داده شده', color: 'green' },
  closed: { title: 'بسته شده', color: 'default' },
};

export type SupportAttachment = { id: string; file_name: string; mime_type: string; file_size: number; object_path: string };
export type SupportMessage = { id: string; body: string; visibility: 'customer' | 'internal'; message_kind: 'reply' | 'note' | 'forward'; author_id: string; author_name: string; created_at: string; attachments: SupportAttachment[] };
export type SupportTicket = { id: string; code: string; subject: string; category_code: string; category_title?: string; status: string; customer_org_id: string; customer_org_name?: string; created_by: string; assigned_to: string | null; created_at: string; last_message_at: string; first_response_at?: string | null; closed_at?: string | null; unread_count?: number };
export type SupportThread = { ticket: SupportTicket; messages: SupportMessage[]; forwards: Array<{ id: string; note_message_id: string; source_message_id: string; recipient_id: string; attachment_ids: string[] }>; events: Array<{ event_type: string; old_value: string | null; new_value: string | null; created_at: string }> };

const allowedMimeTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export const validateSupportFiles = (files: File[]) => {
  for (const file of files) {
    if (!allowedMimeTypes.has(file.type) || file.size < 1 || file.size > 20 * 1024 * 1024) {
      throw new Error(`نوع یا حجم فایل «${file.name}» مجاز نیست. حداکثر حجم ۲۰ مگابایت است.`);
    }
  }
};

export const uploadSupportFiles = async (ticketId: string, messageId: string, files: File[]) => {
  validateSupportFiles(files);
  for (const file of files) {
    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
    const objectPath = `${ticketId}/${messageId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from(SUPPORT_BUCKET).upload(objectPath, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    const { error: registerError } = await supabase.rpc('support_register_attachment', {
      p_message_id: messageId, p_object_path: objectPath, p_file_name: file.name,
      p_mime_type: file.type, p_file_size: file.size,
    });
    if (registerError) throw registerError;
  }
};

export const getSupportFileUrl = async (attachment: SupportAttachment) => {
  const { data, error } = await supabase.storage.from(SUPPORT_BUCKET).createSignedUrl(attachment.object_path, 60);
  if (error || !data?.signedUrl) throw error || new Error('دریافت فایل ناموفق بود.');
  return data.signedUrl;
};
