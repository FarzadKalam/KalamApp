import { MODULES } from '../moduleRegistry';
import { renderTemplateText } from './messageTemplateRenderer';
import { normalizePhoneForStorage } from './phoneNumber';

export type MessageReadyTextKind = 'field' | 'message';

export const GLOBAL_MESSAGE_READY_TEXT_SCOPE = '__message__';
export const MESSAGE_READY_TEXT_SCOPE_PREFIX = '__message__:';

const DEFAULT_PHONE_KEYS = ['mobile_1', 'mobile_2', 'phone'];

export const getReadyTextScopeModuleId = (
  moduleId?: string | null,
  kind: MessageReadyTextKind = 'field'
) => {
  const normalizedModuleId = String(moduleId || '').trim();
  if (kind === 'field') return normalizedModuleId || null;
  return normalizedModuleId
    ? `${MESSAGE_READY_TEXT_SCOPE_PREFIX}${normalizedModuleId}`
    : GLOBAL_MESSAGE_READY_TEXT_SCOPE;
};

export const renderRecordTemplate = (
  template: string,
  record?: Record<string, any> | null,
  moduleId?: string | null
) => renderTemplateText(template, record, { moduleId });

export const getRecordPhoneCandidates = (
  moduleId?: string | null,
  record?: Record<string, any> | null,
  preferredPhone?: unknown
) => {
  const items: Array<{ raw: string; normalized: string }> = [];
  const pushPhone = (value: unknown) => {
    const raw = String(value || '').trim();
    if (!raw) return;
    const normalized = normalizePhoneForStorage(raw);
    const dedupeKey = normalized || raw;
    if (!dedupeKey) return;
    if (items.some((item) => item.normalized === dedupeKey)) return;
    items.push({ raw, normalized: dedupeKey });
  };

  pushPhone(preferredPhone);

  const moduleConfig = moduleId ? MODULES[moduleId] : null;
  const phoneKeys = [
    ...((moduleConfig?.fields || [])
      .filter((field: any) => field?.type === 'phone')
      .map((field: any) => String(field?.key || '').trim())
      .filter(Boolean)),
    ...DEFAULT_PHONE_KEYS,
  ];

  const visited = new Set<string>();
  phoneKeys.forEach((key) => {
    if (!key || visited.has(key)) return;
    visited.add(key);
    pushPhone(record?.[key]);
  });

  return items.map((item) => item.raw);
};

export const getPrimaryRecordPhone = (
  moduleId?: string | null,
  record?: Record<string, any> | null,
  preferredPhone?: unknown
) => {
  return getRecordPhoneCandidates(moduleId, record, preferredPhone)[0] || '';
};

export const getRecordBotTargets = (record?: Record<string, any> | null) => {
  return {
    telegram: String(record?.telegram_chat_id || '').trim(),
    bale: String(record?.bale_chat_id || '').trim(),
    rubika: String(record?.rubika_chat_id || '').trim(),
  };
};

export const hasAnyRecordBotTarget = (record?: Record<string, any> | null) => {
  const targets = getRecordBotTargets(record);
  return Boolean(targets.telegram || targets.bale || targets.rubika);
};

export const getMessageTemplateVariables = (
  moduleId?: string | null,
  record?: Record<string, any> | null
) => {
  const moduleConfig = moduleId ? MODULES[moduleId] : null;
  const seen = new Set<string>();
  const items: Array<{ key: string; label: string; token: string }> = [];
  const labelMap = new Map<string, string>();

  (moduleConfig?.fields || []).forEach((field: any) => {
    const key = String(field?.key || '').trim();
    if (!key) return;
    labelMap.set(key, getFieldLabelFa(field, { moduleId, fallback: field?.label || key }));
  });

  (moduleConfig?.blocks || []).forEach((block: any) => {
    (block?.tableColumns || []).forEach((column: any) => {
      const key = String(column?.key || '').trim();
      if (!key) return;
      if (!labelMap.has(key)) {
        labelMap.set(key, String(column?.title || key).trim() || key);
      }
      const blockScopedKey = `${String(block?.id || '').trim()}.${key}`;
      if (String(block?.id || '').trim() && !labelMap.has(blockScopedKey)) {
        labelMap.set(
          blockScopedKey,
          `${String(block?.titles?.fa || block?.title || block?.id || '').trim() || 'جدول'}: ${
            String(column?.title || key).trim() || key
          }`
        );
      }
    });
  });

  const pushVariable = (key: string, label?: string) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey || seen.has(normalizedKey)) return;
    seen.add(normalizedKey);
    items.push({
      key: normalizedKey,
      label: String(label || normalizedKey).trim() || normalizedKey,
      token: `{{${normalizedKey}}}`,
    });
  };

  (moduleConfig?.fields || []).forEach((field: any) => {
    pushVariable(String(field?.key || ''), getFieldLabelFa(field, { moduleId, fallback: field?.key || '' }));
  });

  Object.keys(record || {}).forEach((key) => {
    pushVariable(key, labelMap.get(key) || key);
  });

  return items;
};
import { getFieldLabelFa } from './fieldLabel';
