import { MODULES } from '../moduleRegistry';
import { toPersianNumber } from './persianNumberFormatter';
import {
  INTERVAL_DAY_CONDITION_OPTIONS,
  WorkflowAction,
  WorkflowActionType,
  actionTypeOptions,
  intervalUnitOptions,
  triggerTypeOptions,
} from './workflowTypes';

const ACTION_TYPE_LABELS_FA: Partial<Record<WorkflowActionType, string>> = {
  send_note_sms: 'ارسال یادداشت + اطلاع‌رسانی پیامکی',
  send_telegram_bot: 'ارسال پیام توسط بات (قدیمی)',
  send_bale_bot: 'ارسال پیام توسط بات (قدیمی)',
  send_rubika_bot: 'ارسال پیام توسط بات (قدیمی)',
};

export const getWorkflowActionTypeLabelFa = (type: WorkflowActionType | string): string => {
  const normalized = String(type || '').trim() as WorkflowActionType;
  const supplemental = ACTION_TYPE_LABELS_FA[normalized];
  if (supplemental) return supplemental;
  return (
    actionTypeOptions.find((option) => option.value === normalized)?.label
    || 'اقدام نامشخص'
  );
};

const getModuleTitleFa = (moduleId: any): string => {
  const normalized = String(moduleId || '').trim();
  if (!normalized) return '';
  return String((MODULES as any)[normalized]?.titles?.fa || normalized).trim();
};

const excerpt = (value: any, maxLength = 42): string => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
};

const countItems = (value: any): number => (Array.isArray(value) ? value.length : 0);

const buildRecipientSummary = (config: Record<string, any>): string => {
  const total =
    countItems(config?.recipient_fields)
    + countItems(config?.recipient_assignees)
    + countItems(config?.manual_numbers)
    + countItems(config?.manual_emails)
    + countItems(config?.manual_chat_ids);
  if (total <= 0) return 'بدون گیرنده';
  return `${toPersianNumber(total)} گیرنده`;
};

export const getWorkflowActionSummaryFa = (action: WorkflowAction | null | undefined): string => {
  const type = String(action?.type || '').trim() as WorkflowActionType;
  const config = (action?.config || {}) as Record<string, any>;

  switch (type) {
    case 'send_note':
    case 'send_note_sms': {
      const text = excerpt(config.note_text);
      return [buildRecipientSummary(config), text ? `«${text}»` : '']
        .filter(Boolean)
        .join(' — ');
    }
    case 'send_sms': {
      const text = excerpt(config.message);
      return [buildRecipientSummary(config), text ? `«${text}»` : '']
        .filter(Boolean)
        .join(' — ');
    }
    case 'send_email': {
      const subject = excerpt(config.subject);
      return [buildRecipientSummary(config), subject ? `موضوع: ${subject}` : '']
        .filter(Boolean)
        .join(' — ');
    }
    case 'send_bot_message':
    case 'send_telegram_bot':
    case 'send_bale_bot':
    case 'send_rubika_bot': {
      const text = excerpt(config.message);
      return [buildRecipientSummary(config), text ? `«${text}»` : '']
        .filter(Boolean)
        .join(' — ');
    }
    case 'send_web_form_link': {
      const channels = Array.isArray(config.delivery_channels) ? config.delivery_channels : [];
      const channelLabels: Record<string, string> = {
        sms: 'پیامک',
        email: 'ایمیل',
        bot: 'بات',
        note: 'یادداشت',
      };
      const channelText = channels
        .map((channel: any) => channelLabels[String(channel)] || '')
        .filter(Boolean)
        .join('، ');
      return channelText ? `ارسال از طریق ${channelText}` : 'بدون کانال ارسال';
    }
    case 'run_ai_prompt': {
      const outputMode = String(config.output_mode || 'text');
      if (outputMode === 'create_record') {
        const target = getModuleTitleFa(config.target_module_id);
        return target ? `ساخت رکورد در «${target}»` : 'ساخت رکورد';
      }
      if (outputMode === 'process_operation') return 'عملیات فرآیندی';
      const text = excerpt(config.prompt_template);
      return text ? `«${text}»` : 'پاسخ متنی';
    }
    case 'lock_record':
      if (config.target_scope === 'related_record') {
        return config.relation_field_key ? `قفل رکورد مرتبط «${config.relation_field_key}»` : 'رکورد مرتبط انتخاب نشده';
      }
      if (config.target_scope === 'process_current_task') return 'قفل فعالیت فعلی';
      if (config.target_scope === 'process_previous_task') return 'قفل فعالیت قبلی';
      if (config.target_scope === 'process_specific_task') {
        return config.stage_node_key ? 'قفل فعالیت خاص' : 'فعالیت خاص انتخاب نشده';
      }
      return 'قفل رکورد جاری';
    case 'update_record':
    case 'send_to_next_stages':
    case 'send_to_specific_stage': {
      const fieldKey = String(config.field || '').trim();
      const stageText = action?.type === 'send_to_specific_stage'
        ? (config.stage_node_key ? ' در مرحله خاص' : '؛ مرحله انتخاب نشده')
        : '';
      return fieldKey ? `به‌روزرسانی فیلد «${fieldKey}»${stageText}` : 'فیلدی انتخاب نشده';
    }
    case 'create_standalone_record':
    case 'create_related_record': {
      const target = getModuleTitleFa(config.target_module_id);
      const mappingCount = countItems(config.field_mappings);
      return [
        target ? `در ماژول «${target}»` : 'ماژول انتخاب نشده',
        mappingCount > 0 ? `${toPersianNumber(mappingCount)} فیلد` : '',
      ]
        .filter(Boolean)
        .join(' — ');
    }
    case 'copy_process_template':
    case 'execute_process':
      return config.template_id ? 'الگوی فرآیند انتخاب شده' : 'الگوی فرآیند انتخاب نشده';
    case 'publish_story': {
      const text = excerpt(config.text_template);
      return [
        config.is_org_wide ? 'برای کل سازمان' : 'برای گروه منتخب',
        text ? `«${text}»` : '',
      ]
        .filter(Boolean)
        .join(' — ');
    }
    default:
      return '';
  }
};

export type WorkflowTriggerSummaryInput = {
  trigger_type?: string | null;
  interval_value?: number | null;
  interval_unit?: string | null;
  interval_minute?: number | null;
  interval_at?: string | null;
  interval_day_of_month?: number | null;
  interval_day_condition?: string | null;
};

export const getWorkflowTriggerLabelFa = (triggerType: any): string =>
  triggerTypeOptions.find((option) => option.value === String(triggerType || '').trim())?.label
  || 'اجرای نامشخص';

export const getWorkflowTriggerSummaryFa = (input: WorkflowTriggerSummaryInput | null | undefined): string => {
  const triggerType = String(input?.trigger_type || '').trim();
  if (triggerType !== 'interval') {
    return getWorkflowTriggerLabelFa(triggerType);
  }

  const value = Number(input?.interval_value) || 0;
  const unitLabel =
    intervalUnitOptions.find((option) => option.value === String(input?.interval_unit || '').trim())?.label || '';
  const parts: string[] = [];
  if (value > 0 && unitLabel) {
    parts.push(`هر ${toPersianNumber(value)} ${unitLabel}`);
  } else {
    parts.push('بر اساس بازه زمانی');
  }
  if (String(input?.interval_unit || '') === 'month' && input?.interval_day_of_month) {
    parts.push(`روز ${toPersianNumber(input.interval_day_of_month)} ماه`);
  }
  const dayCondition = String(input?.interval_day_condition || '').trim();
  if (dayCondition && dayCondition !== 'any') {
    const dayLabel = INTERVAL_DAY_CONDITION_OPTIONS.find((option) => option.value === dayCondition)?.label;
    if (dayLabel) parts.push(dayLabel);
  }
  return parts.join('، ');
};

export const getConditionsNodeSummaryFa = (allCount: number, anyCount: number): string => {
  const normalizedAll = Math.max(0, Number(allCount) || 0);
  const normalizedAny = Math.max(0, Number(anyCount) || 0);
  if (normalizedAll === 0 && normalizedAny === 0) {
    return 'بدون شرط — همیشه اجرا می‌شود';
  }
  const parts: string[] = [];
  if (normalizedAll > 0) parts.push(`${toPersianNumber(normalizedAll)} شرط الزامی`);
  if (normalizedAny > 0) parts.push(`${toPersianNumber(normalizedAny)} شرط کافی`);
  return parts.join(' و ');
};
