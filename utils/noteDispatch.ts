import { supabase } from '../supabaseClient';
import { sendSmsViaGateway } from './smsGateway';
import { isActiveProfileRow } from './activeProfileRecipients';

const NOTE_OPTIONAL_INSERT_COLUMNS = ['author_name', 'metadata', 'reply_to', 'mention_role_ids', 'mention_user_ids'] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

const normalizeUuidArray = (value: any): string[] => {
  const rawArray = Array.isArray(value)
    ? value
    : (typeof value === 'string'
      ? value.replace(/^\{|\}$/g, '').split(',')
      : []);
  return Array.from(new Set(
    rawArray
      .map((item: any) => String(item || '').replace(/"/g, '').trim())
      .filter((item) => UUID_PATTERN.test(item))
  ));
};

const sanitizeNoteInsertRow = (row: Record<string, any>) => {
  const next = { ...row };
  if (!Object.prototype.hasOwnProperty.call(next, 'metadata') || next.metadata == null) {
    next.metadata = {};
  }
  if (Object.prototype.hasOwnProperty.call(next, 'mention_user_ids')) {
    next.mention_user_ids = normalizeUuidArray(next.mention_user_ids);
  }
  if (Object.prototype.hasOwnProperty.call(next, 'mention_role_ids')) {
    next.mention_role_ids = normalizeUuidArray(next.mention_role_ids);
  }
  if (Object.prototype.hasOwnProperty.call(next, 'reply_to')) {
    const replyTo = String(next.reply_to || '').trim();
    next.reply_to = UUID_PATTERN.test(replyTo) ? replyTo : null;
  }
  return next;
};

export const insertNotesWithFallback = async (rows: Record<string, any>[]) => {
  let payloads = rows.map((row) => sanitizeNoteInsertRow({ ...row }));
  const omittedColumns = new Set<string>();

  while (true) {
    const { data, error } = await supabase.from('notes').insert(payloads).select('*');
    if (!error) return data || [];

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

export const buildInvoiceReplySmsText = ({
  invoiceName,
  publicLink,
  companyName,
}: {
  invoiceName: string;
  publicLink: string;
  companyName?: string;
}): string => {
  const name = String(invoiceName || '').trim() || 'فاکتور';
  const lines = [
    `یک پاسخ جدید به پیام شما برای فاکتور «${name}» ثبت شد.`,
    `مشاهده در لینک زیر:`,
    String(publicLink || '').trim(),
  ];
  if (companyName) lines.push(String(companyName).trim());
  return lines.join('\n');
};

export const sendInvoiceReplySmsToCustomer = async ({
  moduleId,
  recordId,
  recordName,
  systemCode,
}: {
  moduleId: string;
  recordId: string;
  recordName: string;
  systemCode?: string;
}) => {
  const isSales = moduleId !== 'purchase_invoices';
  const table = isSales ? 'invoices' : 'purchase_invoices';
  const phoneField = isSales ? 'customer_mobile_1' : 'supplier_mobile_1';

  // Fetch invoice phone + system_code + company name in parallel
  const [invoiceRes, companyRes] = await Promise.all([
    supabase
      .from(table)
      .select(`system_code, public_link, ${isSales ? 'customer:customers(mobile_1)' : 'supplier:suppliers(mobile_1)'}`)
      .eq('id', recordId)
      .maybeSingle(),
    supabase
      .from('company_settings')
      .select('company_full_name, trade_name')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const invoice = invoiceRes?.data as Record<string, any> | null;
  if (!invoice) return;

  const rawPhone = isSales
    ? invoice?.customer?.mobile_1
    : invoice?.supplier?.mobile_1;
  const phone = normalizePhone(String(rawPhone || ''));
  if (!isValidIranMobile(phone)) return;

  const sc = systemCode || String(invoice.system_code || '').trim();
  const publicLink = invoice.public_link
    ? String(invoice.public_link)
    : sc
      ? `${typeof window !== 'undefined' ? window.location.origin : ''}/i/${sc}${!isSales ? '?t=p' : ''}`
      : '';
  if (!publicLink) return;

  const company = companyRes?.data as Record<string, any> | null;
  const companyName = String(company?.company_full_name || company?.trade_name || '').trim();
  const text = buildInvoiceReplySmsText({
    invoiceName: recordName,
    publicLink,
    companyName: companyName || undefined,
  });

  await sendSmsViaGateway({
    to: [phone],
    text,
    allowDirectFallback: true,
    moduleId,
    recordId,
    title: 'پاسخ به پیام فاکتور',
    metadata: { source_type: 'invoice_reply_notification', [phoneField]: phone },
  });
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
        .select('id, mobile_1, is_active')
        .in('id', userIds)
    );
  }
  if (roleIds.length > 0) {
    profileQueries.push(
      supabase
        .from('profiles')
        .select('id, mobile_1, is_active')
        .in('role_id', roleIds)
    );
  }

  const results = await Promise.all(profileQueries);
  const phones = results.flatMap((result: any) => {
    if (result?.error) throw result.error;
    return Array.isArray(result?.data)
      ? result.data.filter(isActiveProfileRow).map((row: any) => normalizePhone(row?.mobile_1))
      : [];
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
