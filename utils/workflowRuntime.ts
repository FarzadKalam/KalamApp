import { supabase } from '../supabaseClient';
import { WorkflowAction, WorkflowCondition, WorkflowRecord } from './workflowTypes';

type WorkflowEvent = 'create' | 'upsert';

type RunWorkflowArgs = {
  moduleId: string;
  event: WorkflowEvent;
  currentRecord: Record<string, any>;
  previousRecord?: Record<string, any> | null;
};

const toComparable = (value: any): any => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => toComparable(item));
  if (typeof value === 'object') return value;
  if (typeof value === 'boolean') return value;
  const num = Number(String(value).replace(/,/g, '').trim());
  if (!Number.isNaN(num) && String(value).trim() !== '') return num;
  return String(value).trim();
};

const asArray = (value: any): any[] => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  if (typeof value === 'string' && value.includes(',')) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [value];
};

const toEnglishDigits = (input: string) =>
  input
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

const normalizePhone = (value: any): string => {
  const raw = toEnglishDigits(String(value ?? '').trim());
  if (!raw) return '';
  let digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';

  // Iran mobile normalization: 09xxxxxxxxx
  if (digits.startsWith('0098')) {
    digits = `0${digits.slice(4)}`;
  } else if (digits.startsWith('98')) {
    digits = `0${digits.slice(2)}`;
  } else if (digits.length === 10 && digits.startsWith('9')) {
    digits = `0${digits}`;
  }

  return digits;
};

const isValidIranMobile = (phone: string) => /^09\d{9}$/.test(String(phone || ''));

const parseDate = (value: any): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const daysDiffFromNow = (value: any): number | null => {
  const d = parseDate(value);
  if (!d) return null;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
};

const hoursDiffFromNow = (value: any): number | null => {
  const d = parseDate(value);
  if (!d) return null;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60);
};

const isSameDate = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const evaluateCondition = (
  condition: WorkflowCondition,
  currentRecord: Record<string, any>,
  previousRecord?: Record<string, any> | null
): boolean => {
  const field = String(condition?.field || '');
  const op = String(condition?.operator || 'eq');
  const currentValue = currentRecord?.[field];
  const previousValue = previousRecord?.[field];
  const expectedValue = condition?.value;

  const cv = toComparable(currentValue);
  const pv = toComparable(previousValue);
  const ev = toComparable(expectedValue);

  switch (op) {
    case 'eq':
      return String(cv ?? '') === String(ev ?? '');
    case 'neq':
      return String(cv ?? '') !== String(ev ?? '');
    case 'contains':
      return String(cv ?? '').toLowerCase().includes(String(ev ?? '').toLowerCase());
    case 'not_contains':
      return !String(cv ?? '').toLowerCase().includes(String(ev ?? '').toLowerCase());
    case 'starts_with':
      return String(cv ?? '').toLowerCase().startsWith(String(ev ?? '').toLowerCase());
    case 'ends_with':
      return String(cv ?? '').toLowerCase().endsWith(String(ev ?? '').toLowerCase());
    case 'gt':
      return Number(cv) > Number(ev);
    case 'gte':
      return Number(cv) >= Number(ev);
    case 'lt':
      return Number(cv) < Number(ev);
    case 'lte':
      return Number(cv) <= Number(ev);
    case 'in': {
      const list = asArray(expectedValue).map((x) => String(toComparable(x)));
      return list.includes(String(cv ?? ''));
    }
    case 'not_in': {
      const list = asArray(expectedValue).map((x) => String(toComparable(x)));
      return !list.includes(String(cv ?? ''));
    }
    case 'is_true':
      return !!currentValue === true;
    case 'is_false':
      return !!currentValue === false;
    case 'is_null':
      return currentValue === null || currentValue === undefined || currentValue === '';
    case 'not_null':
      return !(currentValue === null || currentValue === undefined || currentValue === '');
    case 'changed':
      return String(cv ?? '') !== String(pv ?? '');
    case 'changed_from':
      return String(pv ?? '') === String(ev ?? '') && String(cv ?? '') !== String(pv ?? '');
    case 'changed_to':
      return String(cv ?? '') === String(ev ?? '') && String(cv ?? '') !== String(pv ?? '');
    case 'is_today': {
      const d = parseDate(currentValue);
      if (!d) return false;
      return isSameDate(d, new Date());
    }
    case 'is_yesterday': {
      const d = parseDate(currentValue);
      if (!d) return false;
      const y = new Date();
      y.setDate(y.getDate() - 1);
      return isSameDate(d, y);
    }
    case 'is_tomorrow': {
      const d = parseDate(currentValue);
      if (!d) return false;
      const t = new Date();
      t.setDate(t.getDate() + 1);
      return isSameDate(d, t);
    }
    case 'days_passed_gt': {
      const diff = daysDiffFromNow(currentValue);
      return diff !== null && diff > Number(expectedValue || 0);
    }
    case 'days_passed_lt': {
      const diff = daysDiffFromNow(currentValue);
      return diff !== null && diff < Number(expectedValue || 0);
    }
    case 'days_remaining_gt': {
      const diff = daysDiffFromNow(currentValue);
      return diff !== null && diff < 0 && Math.abs(diff) > Number(expectedValue || 0);
    }
    case 'days_remaining_lt': {
      const diff = daysDiffFromNow(currentValue);
      return diff !== null && diff < 0 && Math.abs(diff) < Number(expectedValue || 0);
    }
    case 'hours_passed_gt': {
      const diff = hoursDiffFromNow(currentValue);
      return diff !== null && diff > Number(expectedValue || 0);
    }
    case 'hours_passed_lt': {
      const diff = hoursDiffFromNow(currentValue);
      return diff !== null && diff < Number(expectedValue || 0);
    }
    case 'hours_remaining_gt': {
      const diff = hoursDiffFromNow(currentValue);
      return diff !== null && diff < 0 && Math.abs(diff) > Number(expectedValue || 0);
    }
    case 'hours_remaining_lt': {
      const diff = hoursDiffFromNow(currentValue);
      return diff !== null && diff < 0 && Math.abs(diff) < Number(expectedValue || 0);
    }
    default:
      return false;
  }
};

const evaluateWorkflow = (
  workflow: WorkflowRecord,
  currentRecord: Record<string, any>,
  previousRecord?: Record<string, any> | null
): boolean => {
  const all = Array.isArray(workflow.conditions_all) ? workflow.conditions_all : [];
  const any = Array.isArray(workflow.conditions_any) ? workflow.conditions_any : [];

  const allPass = all.every((condition) =>
    evaluateCondition(condition as WorkflowCondition, currentRecord, previousRecord)
  );
  const anyPass =
    any.length === 0 ||
    any.some((condition) =>
      evaluateCondition(condition as WorkflowCondition, currentRecord, previousRecord)
    );

  return allPass && anyPass;
};

const renderTemplate = (template: string, record: Record<string, any>) => {
  return String(template || '').replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, key: string) => {
    const fieldKey = String(key || '').trim();
    const val = record?.[fieldKey];
    return val === null || val === undefined ? '' : String(val);
  });
};

const resolveSmsRequestUrl = (url: string) => {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (import.meta.env.DEV && /(^|\.)rest\.payamak-panel\.com$/i.test(parsed.hostname)) {
      return `/api/melipayamak-rest${parsed.pathname}${parsed.search || ''}`;
    }
    if (import.meta.env.DEV && /(^|\.)api\.payamak-panel\.com$/i.test(parsed.hostname)) {
      return `/api/melipayamak-soap${parsed.pathname}${parsed.search || ''}`;
    }
    return url;
  } catch {
    return url;
  }
};

const normalizeSmsUrl = (url: string, mode: 'rest' | 'soap') => {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '');
    if (mode === 'rest' && /(^|\.)rest\.payamak-panel\.com$/i.test(parsed.hostname)) {
      if (/\/api\/SendSMS$/i.test(path)) parsed.pathname = `${path}/SendSMS`;
    }
    if (mode === 'soap' && /(^|\.)api\.payamak-panel\.com$/i.test(parsed.hostname)) {
      if (/\/post\/send\.asmx$/i.test(path)) parsed.pathname = `${path}/SendSimpleSMS2`;
    }
    return parsed.toString();
  } catch {
    return url;
  }
};

const sendSms = async (to: string[], text: string) => {
  const { data: smsRow, error: smsErr } = await supabase
    .from('integration_settings')
    .select('*')
    .eq('connection_type', 'sms')
    .eq('is_active', true)
    .maybeSingle();
  if (smsErr) throw smsErr;
  if (!smsRow) throw new Error('تنظیمات سامانه پیامک فعال نیست.');

  const settings = (smsRow.settings || {}) as Record<string, any>;
  const mode = String(settings.mode || 'rest') as 'rest' | 'soap';
  const baseUrl = normalizeSmsUrl(
    String(
      settings.base_url ||
        (mode === 'soap'
          ? 'https://api.payamak-panel.com/post/send.asmx/SendSimpleSMS2'
          : 'https://rest.payamak-panel.com/api/SendSMS/SendSMS')
    ),
    mode
  );
  const username = String(settings.username || '').trim();
  const password = String(settings.password || '').trim();
  const apiKey = String(settings.api_key || '').trim();
  const senderNumber = String(settings.sender_number || '').trim();
  const isFlash = !!settings.is_flash;

  if (!baseUrl || !senderNumber) throw new Error('تنظیمات ارسال پیامک ناقص است.');
  if (!apiKey && (!username || !password)) {
    throw new Error('نام کاربری/رمز عبور یا API Key برای پیامک کامل نیست.');
  }

  const url = resolveSmsRequestUrl(baseUrl);
  const useSoapRequest = mode === 'soap' || /\/post\/send\.asmx(\/SendSimpleSMS2)?$/i.test(baseUrl);

  for (const recipient of to) {
    let response: Response;
    if (useSoapRequest) {
      const body = new URLSearchParams({
        username,
        password,
        to: recipient,
        from: senderNumber,
        text,
        isflash: isFlash ? 'true' : 'false',
      });
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        body: body.toString(),
      });
    } else {
      const payload: Record<string, any> = {
        to: recipient,
        from: senderNumber,
        text,
        isFlash,
      };
      if (apiKey) {
        payload.apiKey = apiKey;
      } else {
        payload.username = username;
        payload.password = password;
      }
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(raw || `HTTP ${response.status}`);
    }
  }
};

const executeAction = async (
  action: WorkflowAction,
  moduleId: string,
  currentRecord: Record<string, any>
) => {
  const config = action?.config || {};
  if (action.type === 'send_sms') {
    const messageText = renderTemplate(String(config.message || ''), currentRecord).trim();
    if (!messageText) return;
    const recipientsFromFields = asArray(config.recipient_fields)
      .map((fieldKey) => normalizePhone(currentRecord?.[String(fieldKey)]))
      .filter(Boolean);
    const recipientsManual = asArray(config.manual_numbers)
      .map((phone) => normalizePhone(phone))
      .filter(Boolean);
    const fallbackRecipients =
      recipientsFromFields.length > 0 || recipientsManual.length > 0
        ? []
        : [currentRecord?.mobile_1, currentRecord?.mobile_2, currentRecord?.phone]
            .map((phone) => normalizePhone(phone))
            .filter(Boolean);
    const recipients = Array.from(
      new Set([...recipientsFromFields, ...recipientsManual, ...fallbackRecipients])
    ).filter(isValidIranMobile);
    if (recipients.length === 0) return;
    await sendSms(recipients, messageText);
    return;
  }

  if (action.type === 'send_note') {
    const noteText = renderTemplate(String(config.note_text || ''), currentRecord).trim();
    if (!noteText) return;
    const recordId = currentRecord?.id;
    if (!recordId) return;
    await supabase.from('notes').insert({
      module_id: moduleId,
      record_id: recordId,
      content: noteText,
    });
  }
};

export const runWorkflowsForEvent = async ({
  moduleId,
  event,
  currentRecord,
  previousRecord = null,
}: RunWorkflowArgs) => {
  if (!moduleId || !currentRecord) return;
  const triggerTypes =
    event === 'create' ? ['on_create', 'on_upsert'] : ['on_upsert'];

  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('module_id', moduleId)
    .eq('is_active', true)
    .in('trigger_type', triggerTypes);

  if (error) {
    console.error('Workflow fetch failed:', error);
    return;
  }

  const workflows = (data || []) as WorkflowRecord[];
  for (const workflow of workflows) {
    try {
      if (!evaluateWorkflow(workflow, currentRecord, previousRecord)) continue;
      const actions = Array.isArray(workflow.actions) ? workflow.actions : [];
      for (const action of actions) {
        try {
          await executeAction(action as WorkflowAction, moduleId, currentRecord);
        } catch (actionErr) {
          console.error(
            `Workflow action failed (${workflow?.name || workflow?.id} / ${String((action as any)?.type || '-')})`,
            actionErr
          );
        }
      }
    } catch (err) {
      console.error(`Workflow execution failed (${workflow?.name || workflow?.id}):`, err);
    }
  }
};
