import { FieldLocation, FieldNature, FieldType, ModuleDefinition, type ModuleField, type SelectOption } from '../types';
import { MODULES } from '../moduleRegistry';
import { isSaasAdminModuleId } from './permissions';

export const INSTRUCTIONS_MODULE_ID = 'instructions';
export const PROCESS_STAGE_INSTRUCTION_IDS_KEY = 'instruction_ids';

export const instructionStatusOptions: SelectOption[] = [
  { label: 'پیش نویس', value: 'draft', color: 'default' },
  { label: 'تایید شده', value: 'approved', color: 'blue' },
  { label: 'ابلاغ شده', value: 'published', color: 'green' },
  { label: 'منقضی شده', value: 'expired', color: 'red' },
];

export const instructionAiIndexStatusOptions: SelectOption[] = [
  { label: 'آماده نشده', value: 'not_built', color: 'default' },
  { label: 'نیازمند بازسازی', value: 'stale', color: 'gold' },
  { label: 'آماده', value: 'ready', color: 'green' },
  { label: 'خطا', value: 'failed', color: 'red' },
  { label: 'غیرفعال', value: 'skipped', color: 'default' },
];

export const normalizeInstructionIdList = (value: unknown): string[] => {
  const source = Array.isArray(value)
    ? value
    : value !== undefined && value !== null && value !== ''
      ? [value]
      : [];

  return Array.from(
    new Set(
      source
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  );
};

export const buildInstructionModuleOptions = (): SelectOption[] =>
  Object.values(MODULES)
    .filter((module) => String(module?.id || '').trim() !== INSTRUCTIONS_MODULE_ID)
    .filter((module) => !isSaasAdminModuleId(module.id))
    .map((module) => ({
      value: String(module.id),
      label: String(module.titles?.faSingular || module.titles?.fa || module.id),
    }))
    .sort((left, right) => String(left.label).localeCompare(String(right.label), 'fa'));

const cloneField = (field: ModuleField, patch: Partial<ModuleField>): ModuleField => ({
  ...field,
  ...patch,
});

export const buildInstructionModuleConfig = (
  moduleConfig: ModuleDefinition,
  {
    moduleOptions,
    userOptions,
    roleOptions,
  }: {
    moduleOptions?: SelectOption[];
    userOptions?: SelectOption[];
    roleOptions?: SelectOption[];
  } = {},
): ModuleDefinition => {
  if (String(moduleConfig?.id || '').trim() !== INSTRUCTIONS_MODULE_ID) {
    return moduleConfig;
  }

  const nextModuleOptions = Array.isArray(moduleOptions) ? moduleOptions : buildInstructionModuleOptions();
  const nextUserOptions = Array.isArray(userOptions) ? userOptions : [];
  const nextRoleOptions = Array.isArray(roleOptions) ? roleOptions : [];

  return {
    ...moduleConfig,
    fields: (moduleConfig.fields || []).map((field) => {
      const key = String(field?.key || '').trim();
      if (key === 'status') {
        return cloneField(field, { options: instructionStatusOptions });
      }
      if (key === 'ai_index_status') {
        return cloneField(field, { options: instructionAiIndexStatusOptions });
      }
      if (key === 'module_ids') {
        return cloneField(field, { options: nextModuleOptions });
      }
      if (key === 'visible_to_user_ids') {
        return cloneField(field, { options: nextUserOptions });
      }
      if (key === 'visible_to_role_ids') {
        return cloneField(field, { options: nextRoleOptions });
      }
      return field;
    }),
  };
};

export const getInstructionIdsFromStage = (stage: Record<string, any> | null | undefined): string[] => {
  if (!stage || typeof stage !== 'object') return [];
  const metadata = stage.metadata && typeof stage.metadata === 'object' && !Array.isArray(stage.metadata)
    ? stage.metadata
    : {};
  return normalizeInstructionIdList(
    stage[PROCESS_STAGE_INSTRUCTION_IDS_KEY]
    ?? metadata[PROCESS_STAGE_INSTRUCTION_IDS_KEY]
  );
};

export const withStageInstructionIds = (
  stage: Record<string, any>,
  instructionIds: string[],
): Record<string, any> => {
  const normalizedIds = normalizeInstructionIdList(instructionIds);
  const metadata = stage?.metadata && typeof stage.metadata === 'object' && !Array.isArray(stage.metadata)
    ? stage.metadata
    : {};

  return {
    ...stage,
    [PROCESS_STAGE_INSTRUCTION_IDS_KEY]: normalizedIds,
    metadata: {
      ...metadata,
      [PROCESS_STAGE_INSTRUCTION_IDS_KEY]: normalizedIds,
    },
  };
};

export const getInstructionIdsFromTask = (task: Record<string, any> | null | undefined): string[] => {
  if (!task || typeof task !== 'object') return [];
  const recurrence = task.recurrence_info && typeof task.recurrence_info === 'object'
    ? task.recurrence_info
    : {};
  return normalizeInstructionIdList(
    recurrence[PROCESS_STAGE_INSTRUCTION_IDS_KEY]
    ?? task[PROCESS_STAGE_INSTRUCTION_IDS_KEY]
  );
};

export const canCurrentActorViewInstruction = (
  instruction: Record<string, any> | null | undefined,
  {
    userId,
    roleId,
  }: {
    userId?: string | null;
    roleId?: string | null;
  },
): boolean => {
  if (!instruction || typeof instruction !== 'object') return false;
  const allowedUserIds = normalizeInstructionIdList(instruction.visible_to_user_ids);
  const allowedRoleIds = normalizeInstructionIdList(instruction.visible_to_role_ids);
  if (allowedUserIds.length === 0 && allowedRoleIds.length === 0) return true;
  const normalizedUserId = String(userId || '').trim();
  const normalizedRoleId = String(roleId || '').trim();
  return (
    (normalizedUserId ? allowedUserIds.includes(normalizedUserId) : false)
    || (normalizedRoleId ? allowedRoleIds.includes(normalizedRoleId) : false)
  );
};

export const getInstructionField = (
  moduleConfig: ModuleDefinition | null | undefined,
  fieldKey: string,
): ModuleField | undefined =>
  (moduleConfig?.fields || []).find((field) => String(field?.key || '').trim() === String(fieldKey || '').trim());

export const instructionViewerFieldKeys = new Set([
  'visible_to_user_ids',
  'visible_to_role_ids',
  'module_ids',
]);

export const buildInstructionViewerFields = (
  moduleConfig: ModuleDefinition | null | undefined,
): ModuleField[] => {
  const fields = (moduleConfig?.fields || []).filter((field) => instructionViewerFieldKeys.has(String(field?.key || '').trim()));
  return fields.map((field, index) => ({
    ...field,
    location: field.location || FieldLocation.BLOCK,
    nature: field.nature || FieldNature.STANDARD,
    order: Number(field.order) || (100 + index),
    type: field.type || FieldType.MULTI_SELECT,
  }));
};
