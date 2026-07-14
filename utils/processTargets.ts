import { MODULES } from '../moduleRegistry';
import { ModuleField, FieldType } from '../types';
import { WORKFLOW_RECORD_LINK_FIELD_KEY } from './workflowTypes';

type ProcessLinkMap = Record<string, string | null>;

const normalizeModuleId = (value: unknown) => String(value || '').trim();

export const normalizeProcessTargetModuleIds = (
  rawModuleIds: unknown,
  fallbackModuleId?: unknown,
): string[] => {
  const values = Array.isArray(rawModuleIds)
    ? rawModuleIds
    : (typeof rawModuleIds === 'string' && rawModuleIds.trim().startsWith('[')
        ? (() => {
            try {
              return JSON.parse(rawModuleIds);
            } catch {
              return [];
            }
          })()
        : []);

  const normalized = Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((item) => normalizeModuleId(item))
        .filter((item) => item && !!MODULES[item])
    )
  );

  const fallback = normalizeModuleId(fallbackModuleId);
  if (fallback && !!MODULES[fallback] && !normalized.includes(fallback)) {
    normalized.unshift(fallback);
  }

  return normalized;
};

export const syncProcessTemplateTargetModules = <T extends Record<string, any>>(values: T): T & { module_ids: string[]; module_id: string } => {
  const moduleIds = normalizeProcessTargetModuleIds(values?.module_ids, values?.module_id);
  return {
    ...(values || {}),
    module_ids: moduleIds,
    module_id: moduleIds[0] || '',
  } as T & { module_ids: string[]; module_id: string };
};

export const resolveProcessActivatorTriggerModuleIds = (
  rawModuleIds: unknown,
  fallbackModuleIds: unknown,
  fallbackModuleId?: unknown,
): string[] => {
  const selectedModuleIds = normalizeProcessTargetModuleIds(rawModuleIds);
  if (selectedModuleIds.length > 0) return selectedModuleIds;
  return normalizeProcessTargetModuleIds(fallbackModuleIds, fallbackModuleId);
};

export const normalizeProcessActivatorTriggerModuleIds = (
  rawModuleIds: unknown,
  allowedModuleIds: unknown,
): string[] => {
  const allowed = new Set(normalizeProcessTargetModuleIds(allowedModuleIds));
  const selected = normalizeProcessTargetModuleIds(rawModuleIds);
  if (allowed.size === 0) return selected;
  return selected.filter((moduleId) => allowed.has(moduleId));
};

export const doesProcessTemplateSupportModule = (
  template: Record<string, any> | null | undefined,
  moduleId?: string | null,
) => {
  const targetModuleId = normalizeModuleId(moduleId);
  if (!targetModuleId) return true;
  const moduleIds = normalizeProcessTargetModuleIds(template?.module_ids, template?.module_id);
  return moduleIds.length === 0 || moduleIds.includes(targetModuleId);
};

export const getRelationFieldLinksForModules = (
  moduleId: string,
  record: Record<string, any> | null | undefined,
  targetModuleIds: string[],
) => {
  const normalizedTargets = new Set(targetModuleIds.map((item) => normalizeModuleId(item)).filter(Boolean));
  const result: ProcessLinkMap = {};
  const fields = MODULES[moduleId]?.fields || [];

  if (record?.id && normalizedTargets.has(moduleId)) {
    result[moduleId] = String(record.id);
  }

  fields
    .filter((field) => field.type === FieldType.RELATION)
    .forEach((field) => {
      const targetModuleId = normalizeModuleId((field.relationConfig as any)?.targetModule);
      if (!targetModuleId || !normalizedTargets.has(targetModuleId)) return;
      const relationValue = String(record?.[field.key] || '').trim();
      if (!relationValue) return;
      if (!result[targetModuleId]) {
        result[targetModuleId] = relationValue;
      }
    });

  return result;
};

export const mergeProcessLinkMaps = (...maps: Array<ProcessLinkMap | null | undefined>): ProcessLinkMap =>
  maps.reduce<ProcessLinkMap>((acc, map) => {
    if (!map) return acc;
    Object.entries(map).forEach(([moduleId, recordId]) => {
      const normalizedModuleId = normalizeModuleId(moduleId);
      const normalizedRecordId = String(recordId || '').trim() || null;
      if (!normalizedModuleId || !normalizedRecordId) return;
      if (!acc[normalizedModuleId]) {
        acc[normalizedModuleId] = normalizedRecordId;
      }
    });
    return acc;
  }, {} as ProcessLinkMap);

export const extractProcessLinkMapFromStages = (stages: Array<Record<string, any>> | null | undefined): ProcessLinkMap =>
  (Array.isArray(stages) ? stages : []).reduce<ProcessLinkMap>((acc, stage) => {
    const rawMap = stage?.process_link_map && typeof stage.process_link_map === 'object'
      ? stage.process_link_map
      : {};
    return mergeProcessLinkMaps(acc, parseProcessLinkMap(rawMap));
  }, {} as ProcessLinkMap);

export const buildProcessLinkMapFromRecord = (
  moduleId: string,
  record: Record<string, any> | null | undefined,
  targetModuleIds: string[],
  explicitLinks?: ProcessLinkMap | null,
) => {
  const normalizedModuleId = normalizeModuleId(moduleId);
  const normalizedTargets = normalizeProcessTargetModuleIds(targetModuleIds, normalizedModuleId);
  const directContextLinks = mergeProcessLinkMaps(
    normalizedModuleId && record?.id ? { [normalizedModuleId]: String(record.id) } : {}
  );

  return mergeProcessLinkMaps(
    directContextLinks,
    getRelationFieldLinksForModules(normalizedModuleId, record, normalizedTargets),
    explicitLinks || {},
  );
};

export const parseProcessLinkMap = (value: unknown): ProcessLinkMap => {
  const raw = value && typeof value === 'object'
    ? value as Record<string, any>
    : (typeof value === 'string'
        ? (() => {
            try {
              const parsed = JSON.parse(value);
              return parsed && typeof parsed === 'object' ? parsed : {};
            } catch {
              return {};
            }
          })()
        : {});

  return Object.entries(raw).reduce((acc, [moduleId, recordId]) => {
    const normalizedModuleId = normalizeModuleId(moduleId);
    const normalizedRecordId = String(recordId || '').trim() || null;
    if (!normalizedModuleId || !normalizedRecordId) return acc;
    acc[normalizedModuleId] = normalizedRecordId;
    return acc;
  }, {} as ProcessLinkMap);
};

export const buildProcessLinkedFieldPrefix = (moduleId: string) =>
  `__linked__${normalizeModuleId(moduleId)}__`;

export const createProcessLinkedFieldKey = (moduleId: string, fieldKey: string) =>
  `${buildProcessLinkedFieldPrefix(moduleId)}${String(fieldKey || '').trim()}`;

export const parseProcessLinkedFieldKey = (fieldKey?: string | null) => {
  const raw = String(fieldKey || '').trim();
  if (!raw.startsWith('__linked__')) return null;
  const match = raw.match(/^__linked__([^_]+(?:_[^_]+)*)__([^]+)$/);
  if (!match) return null;
  return {
    moduleId: normalizeModuleId(match[1]),
    targetFieldKey: String(match[2] || '').trim(),
  };
};

export const getProcessTargetModuleFields = (
  moduleIds: string[],
  getVisibleFields: (moduleId: string) => ModuleField[],
  getAssigneeField?: (moduleId: string) => ModuleField | null,
) => {
  const normalizedModuleIds = normalizeProcessTargetModuleIds(moduleIds);
  return normalizedModuleIds.flatMap((moduleId) => {
    const moduleTitle = MODULES[moduleId]?.titles?.fa || moduleId;
    const visibleFields = getVisibleFields(moduleId);
    const sourceFields: ModuleField[] = visibleFields.some((field) => field.key === WORKFLOW_RECORD_LINK_FIELD_KEY)
      ? visibleFields
      : [{
          key: WORKFLOW_RECORD_LINK_FIELD_KEY,
          labels: { fa: 'لینک رکورد', en: 'Record Link' },
          type: FieldType.LINK,
          nature: 'system' as any,
          readonly: true,
        }, ...visibleFields];
    const baseFields = sourceFields.map((field) => ({
      ...field,
      ...( { workflowOptionScopeModuleId: moduleId } as any ),
      key: createProcessLinkedFieldKey(moduleId, field.key),
      labels: {
        ...field.labels,
        fa: `${field.labels?.fa || field.key} (${moduleTitle})`,
      },
    }));

    const assigneeField = getAssigneeField ? getAssigneeField(moduleId) : null;
    return assigneeField
      ? [
          ...baseFields,
          {
            ...assigneeField,
            ...( { workflowOptionScopeModuleId: moduleId } as any ),
            key: createProcessLinkedFieldKey(moduleId, assigneeField.key),
            labels: {
              ...assigneeField.labels,
              fa: `${assigneeField.labels?.fa || assigneeField.key} (${moduleTitle})`,
            },
          },
        ]
      : baseFields;
  });
};
