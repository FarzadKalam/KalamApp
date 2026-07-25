import { MODULES } from '../moduleRegistry';
import { getFieldLabelFa } from './fieldLabel';
import {
  assignProcessTemplateSystemVariableValues,
  getProcessTemplateSystemVariableValues,
  PROCESS_TEMPLATE_SYSTEM_VARIABLES,
} from '../shared/processTemplateSystemVariables';

export {
  assignProcessTemplateSystemVariableValues,
  getProcessTemplateSystemVariableValues,
  PROCESS_TEMPLATE_SYSTEM_VARIABLES,
};

const normalizeText = (value: unknown) => String(value || '').trim();
const parseContextObject = (value: unknown): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const PROCESS_NAME_TEMPLATE_FIELD_KEY = 'process_name';
export const PROCESS_LANE_NAME_TEMPLATE_FIELD_KEY = 'process_lane_name';

export const assignProcessTemplateIdentityAliases = (
  target: Record<string, any>,
  values: { processName?: unknown; laneName?: unknown },
) => {
  const processName = normalizeText(values.processName);
  const laneName = normalizeText(values.laneName);
  if (processName) {
    target[PROCESS_NAME_TEMPLATE_FIELD_KEY] = processName;
    target['نام فرآیند'] = processName;
    target['نام فرایند'] = processName;
  }
  if (laneName) {
    target[PROCESS_LANE_NAME_TEMPLATE_FIELD_KEY] = laneName;
    target.lane_name = laneName;
    target['نام ردیف'] = laneName;
  }
  return target;
};

export const resolveProcessTemplateLaneName = (
  stage: Record<string, any> | null | undefined,
  fallback = 'ردیف اصلی',
) => {
  const metadata = parseContextObject(stage?.metadata);
  const recurrence = parseContextObject(stage?.recurrence_info);
  const graph = parseContextObject(stage?.process_graph
    || metadata?.process_graph
    || recurrence?.process_graph
    || {});
  const laneKey = normalizeText(
    stage?.process_lane_key
    || metadata?.process_lane_key
    || recurrence?.process_lane_key
    || 'lane_1',
  ) || 'lane_1';
  const lane = (Array.isArray(graph?.lanes) ? graph.lanes : []).find((item: any) => (
    normalizeText(item?.key || item?.id) === laneKey
  ));
  return normalizeText(
    lane?.name
    || lane?.title
    || stage?.process_lane_name
    || metadata?.process_lane_name
    || recurrence?.process_lane_name,
  ) || fallback;
};

const getValueByPath = (record: Record<string, any> | null | undefined, path: string) => {
  const normalizedPath = normalizeText(path);
  if (!record || !normalizedPath) return undefined;
  const segments = normalizedPath.split('.').map((segment) => segment.trim()).filter(Boolean);
  let current: any = record;
  for (const segment of segments) {
    current = current?.[segment];
    if (current === null || current === undefined) break;
  }
  return current;
};

const buildModuleAliasCandidates = (moduleId: string) => {
  const normalizedModuleId = normalizeText(moduleId).toLowerCase();
  if (!normalizedModuleId) return [] as string[];

  const aliases = new Set<string>([normalizedModuleId]);
  if (normalizedModuleId.endsWith('ies') && normalizedModuleId.length > 3) {
    aliases.add(`${normalizedModuleId.slice(0, -3)}y`);
  }
  if (normalizedModuleId.endsWith('s') && normalizedModuleId.length > 1) {
    aliases.add(normalizedModuleId.slice(0, -1));
  }
  return Array.from(aliases).filter(Boolean);
};

const getModulePersianTitles = (moduleId: string | null | undefined) => {
  const normalizedModuleId = normalizeText(moduleId);
  const moduleConfig = MODULES[normalizedModuleId];
  return Array.from(new Set([
    normalizeText(moduleConfig?.titles?.fa),
    normalizeText(moduleConfig?.titles?.faSingular),
  ].filter(Boolean)));
};

const assignAliasValue = (target: Record<string, any>, key: unknown, value: unknown) => {
  const normalizedKey = normalizeText(key);
  if (!normalizedKey) return;
  target[normalizedKey] = value;
};

export const assignProcessTemplateModuleAliases = (
  target: Record<string, any>,
  moduleId: string | null | undefined,
  record: Record<string, any> | null | undefined,
) => {
  const normalizedModuleId = normalizeText(moduleId);
  const aliases = buildModuleAliasCandidates(normalizedModuleId);
  if (!record || aliases.length === 0) return;
  const moduleConfig = MODULES[normalizedModuleId];
  const moduleTitles = getModulePersianTitles(normalizedModuleId);
  const fieldByKey = new Map(
    (moduleConfig?.fields || [])
      .map((field: any) => [normalizeText(field?.key), field] as const)
      .filter(([key]) => Boolean(key)),
  );

  Object.entries(record).forEach(([fieldKey, value]) => {
    const normalizedFieldKey = normalizeText(fieldKey);
    if (!normalizedFieldKey) return;
    aliases.forEach((alias) => {
      assignAliasValue(target, `${alias}_${normalizedFieldKey}`, value);
      assignAliasValue(target, `linked_${alias}_${normalizedFieldKey}__`, value);
      assignAliasValue(target, `linked_${alias}_${normalizedFieldKey}`, value);
    });

    const field = fieldByKey.get(normalizedFieldKey);
    const fieldLabel = getFieldLabelFa(field, {
      moduleId: normalizedModuleId,
      fallback: normalizedFieldKey,
      fieldKey: normalizedFieldKey,
    });
    assignAliasValue(target, fieldLabel, value);
    moduleTitles.forEach((moduleTitle) => {
      assignAliasValue(target, `${fieldLabel} (${moduleTitle})`, value);
    });
  });
};

export const resolveProcessTemplateTokenValue = (
  record: Record<string, any> | null | undefined,
  tokenKey: string,
) => {
  const normalizedTokenKey = normalizeText(tokenKey);
  if (!record || !normalizedTokenKey) return undefined;
  if (Object.prototype.hasOwnProperty.call(record, normalizedTokenKey)) {
    return record[normalizedTokenKey];
  }
  if (normalizedTokenKey.includes('.')) {
    return getValueByPath(record, normalizedTokenKey);
  }
  return undefined;
};
