import { supabase } from '../supabaseClient';
import { sendSmsViaGateway } from './smsGateway';

const NOTE_OPTIONAL_INSERT_COLUMNS = ['author_name', 'metadata', 'reply_to', 'mention_role_ids', 'mention_user_ids'] as const;

const omitKey = <T extends Record<string, any>>(value: T, key: string): T => {
  const next = { ...value };
  delete next[key];
  return next;
};

const isMissingColumnError = (error: any, column: string) => {
  const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();
  return code === 'PGRST204' || (text.includes(column.toLowerCase()) && (text.includes('column') || text.includes('schema cache')));
};

const normalizePhone = (value: any): string => {
  const raw = String(value ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .trim();
  if (!raw) return '';
  let digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0098')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('98')) digits = `0${digits.slice(2)}`;
  else if (digits.length === 10 && digits.startsWith('9')) digits = `0${digits}`;
  return digits;
};

const isValidIranMobile = (phone: string) => /^09\d{9}$/.test(String(phone || ''));

export const insertNotesWithFallback = async (rows: Record<string, any>[]) => {
  let payloads = rows.map((row) => ({ ...row }));
  const omittedColumns = new Set<string>();

  while (true) {
    const { error } = await supabase.from('notes').insert(payloads);
    if (!error) return;

    const missingColumn = NOTE_OPTIONAL_INSERT_COLUMNS.find((column) =>
      !omittedColumns.has(column) && isMissingColumnError(error, column),
    );

    if (!missingColumn) throw error;

    omittedColumns.add(missingColumn);
    payloads = payloads.map((row) => omitKey(row, missingColumn));
  }
};

const clipWords = (value: string, limit = 10) => {
  const plain = String(value || '').replace(/\*\*(.*?)\*\*/g, '$1').trim();
  const words = plain.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length <= limit) return words.join(' ');
  return `${words.slice(0, limit).join(' ')} ...`;
};

export const buildNoteSmsPreviewText = (authorName: string, noteText: string) => {
  const safeAuthor = String(authorName || '').trim() || 'کاربر';
  const preview = clipWords(noteText, 10);
  const body = preview ? `\n"${preview}"` : '';
  return `پیام جدید از طرف "${safeAuthor}"${body}\nبرای مشاهده به سامانه مراجعه کنید`;
};

export const sendNoteSmsNotifications = async ({
  authorName,
  noteText,
  mentionUserIds,
  mentionRoleIds,
  moduleId,
  recordId,
  title,
}: {
  authorName: string;
  noteText: string;
  mentionUserIds?: string[];
  mentionRoleIds?: string[];
  moduleId?: string | null;
  recordId?: string | null;
  title?: string;
}) => {
  const userIds = Array.from(new Set((mentionUserIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  const roleIds = Array.from(new Set((mentionRoleIds || []).map((id) => String(id || '').trim()).filter(Boolean)));

  if (userIds.length === 0 && roleIds.length === 0) return { recipients: [] as string[] };

  const profileQueries: Array<PromiseLike<any>> = [];
  if (userIds.length > 0) {
    profileQueries.push(
      supabase
        .from('profiles')
        .select('id, mobile_1')
        .in('id', userIds)
    );
  }
  if (roleIds.length > 0) {
    profileQueries.push(
      supabase
        .from('profiles')
        .select('id, mobile_1')
        .in('role_id', roleIds)
    );
  }

  const results = await Promise.all(profileQueries);
  const phones = results.flatMap((result: any) => {
    if (result?.error) throw result.error;
    return Array.isArray(result?.data) ? result.data.map((row: any) => normalizePhone(row?.mobile_1)) : [];
  });

  const recipients = Array.from(new Set(phones.filter(isValidIranMobile)));
  if (recipients.length === 0) return { recipients: [] as string[] };

  await sendSmsViaGateway({
    to: recipients,
    text: buildNoteSmsPreviewText(authorName, noteText),
    allowDirectFallback: true,
    moduleId: moduleId ? String(moduleId) : undefined,
    recordId: recordId ? String(recordId) : undefined,
    title: title || 'اطلاع‌رسانی پیام جدید',
    metadata: {
      source_type: 'note_message',
      note_sms_notification: true,
    },
  });

  return { recipients };
};
